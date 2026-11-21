import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { DEFAULT_CUE, isCueStyle } from './src/cue-styles.js';

const derive = promisify(scrypt);
const SESSION_MS = 30 * 24 * 3600_000;
const WINDOW_MS = 5 * 60_000;
const COOKIE = 'rainbow_session';
const publicOrigin = process.env.POOL_PUBLIC_ORIGIN ? new URL(process.env.POOL_PUBLIC_ORIGIN).origin : null;
const sessionKey = value => createHash('sha256').update(value).digest('hex');
const publicProfile = account => account ? { nickname: account.nickname, cue: account.cue } : null;
const randomToken = () => randomBytes(32).toString('hex');

function credentials(body) {
  if (typeof body.nickname !== 'string' || typeof body.password !== 'string') return null;
  const nickname = body.nickname.normalize('NFKC').trim().replace(/ +/g, ' ');
  if ([...nickname].length < 2 || [...nickname].length > 20 ||
      !/^[\p{L}\p{M}\p{N}_-]+(?: [\p{L}\p{M}\p{N}_-]+)*$/u.test(nickname) ||
      [...body.password].length < 8 || Buffer.byteLength(body.password) > 256) return null;
  return { id: nickname.toLowerCase(), nickname, password: body.password };
}

function getSession(req) {
  const entry = req.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith(COOKIE + '='));
  const token = entry?.slice(COOKIE.length + 1);
  return /^[a-f0-9]{64}$/.test(token ?? '') ? sessionKey(token) : null;
}

function cookie(req, token, maxAge) {
  const local = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(req.headers.host ?? '');
  const secure = !local || req.socket.encrypted || req.headers.origin?.startsWith('https://');
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

export function sameOrigin(req) {
  const site = req.headers['sec-fetch-site'];
  const origin = req.headers.origin;
  if (!origin) return !site || site === 'same-origin' || site === 'none';
  // A TLS-terminating proxy may rewrite Host or omit Fetch Metadata on WebSocket upgrades.
  if (publicOrigin) return origin === publicOrigin;
  if (site === 'cross-site') return false;
  try {
    const parsed = new URL(origin);
    const protocol = req.socket.encrypted ? 'https:' : 'http:';
    return parsed.host === req.headers.host &&
      (parsed.protocol === protocol || (parsed.protocol === 'https:' && site === 'same-origin'));
  } catch { return false; }
}

function json(res, status, result, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers });
  res.end(JSON.stringify(result));
}

async function readBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > 2048) { req.resume(); return null; }
    chunks.push(chunk);
  }
  try {
    const result = JSON.parse(Buffer.concat(chunks));
    return result && typeof result === 'object' && !Array.isArray(result) ? result : null;
  } catch { return null; }
}

export function createAccounts(dataDir) {
  const file = path.join(dataDir, 'accounts.json');
  let data;
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (err) {
    if (err.code !== 'ENOENT') throw err;
    data = { users: [], sessions: [] };
  }
  let users = new Map(data.users), sessions = new Map(data.sessions);
  const attempts = new Map();
  const dummySalt = randomToken();
  let hashing = 0, lastCleanup = 0;

  function commit(nextUsers, nextSessions) {
    fs.writeFileSync(file + '.tmp', JSON.stringify({ users: [...nextUsers], sessions: [...nextSessions] }), { mode: 0o600 });
    fs.renameSync(file + '.tmp', file);
    users = nextUsers;
    sessions = nextSessions;
  }

  function current(req) {
    const session = sessions.get(getSession(req));
    return session?.expires > Date.now() ? users.get(session.id) : null;
  }

  function canAttempt(req, id) {
    const now = Date.now();
    if (now - lastCleanup >= WINDOW_MS) {
      for (const [key, attempt] of attempts) if (attempt.until <= now) attempts.delete(key);
      lastCleanup = now;
    }
    const address = 'ip:' + req.socket.remoteAddress;
    const identity = 'login:' + id;
    const counter = key => {
      const old = attempts.get(key);
      if (old?.until > now) return old;
      const next = { count: 0, until: now + WINDOW_MS };
      attempts.set(key, next);
      return next;
    };
    const ip = counter(address);
    if (hashing >= 4 || ip.count >= 30) return false;
    const account = counter(identity);
    if (account.count >= 8) return false;
    ip.count++;
    account.count++;
    return true;
  }

  async function authenticate(req, res, body, register) {
    const input = credentials(body);
    if (!input) return json(res, 400, { error: 'credentials' });
    if (!canAttempt(req, input.id)) return json(res, 429, { error: 'retry' });
    const existing = users.get(input.id);
    const salt = register ? randomToken() : existing?.salt ?? dummySalt;
    let hash;
    hashing++;
    try { hash = await derive(input.password, salt, 64); }
    finally { hashing--; }
    if (register && users.has(input.id)) return json(res, 409, { error: 'nicknameTaken' });
    if (!register && (!existing || !timingSafeEqual(hash, Buffer.from(existing.hash, 'hex')))) {
      return json(res, 401, { error: 'login' });
    }

    const created = { id: input.id, nickname: input.nickname, salt, hash: hash.toString('hex'), cue: DEFAULT_CUE };
    const account = register ? created : users.get(input.id);
    const nextUsers = register ? new Map(users).set(account.id, account) : users;
    const now = Date.now(), token = randomToken();
    const nextSessions = new Map([...sessions].filter(([, value]) => value.expires > now));
    nextSessions.delete(getSession(req));
    nextSessions.set(sessionKey(token), { id: account.id, expires: now + SESSION_MS });
    commit(nextUsers, nextSessions);
    attempts.delete('login:' + input.id);
    return json(res, register ? 201 : 200, { profile: publicProfile(account) },
      { 'Set-Cookie': cookie(req, token, SESSION_MS / 1000) });
  }

  async function route(req, res, pathname) {
    if (pathname === '/api/profile' && req.method === 'GET') {
      return json(res, 200, { profile: publicProfile(current(req)) });
    }
    if (!sameOrigin(req) || req.headers['x-rainbow-request'] !== '1') return json(res, 403, { error: 'forbidden' });
    if (pathname === '/api/logout' && req.method === 'POST') {
      const key = getSession(req);
      if (sessions.has(key)) {
        const nextSessions = new Map(sessions);
        nextSessions.delete(key);
        commit(users, nextSessions);
      }
      return json(res, 200, { profile: null }, { 'Set-Cookie': cookie(req, '', 0) });
    }
    const registration = pathname === '/api/register' && req.method === 'POST';
    const login = pathname === '/api/login' && req.method === 'POST';
    const select = pathname === '/api/profile' && req.method === 'PATCH';
    if (!registration && !login && !select) return json(res, 404, { error: 'notFound' });
    if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] ?? '')) {
      return json(res, 415, { error: 'invalid' });
    }
    const body = await readBody(req);
    if (!body) return json(res, 400, { error: 'invalid' });
    if (!select) return authenticate(req, res, body, registration);
    const account = current(req);
    if (!account) return json(res, 401, { error: 'expired' });
    if (!isCueStyle(body.cue)) return json(res, 400, { error: 'invalidCue' });
    const updated = { ...account, cue: body.cue };
    commit(new Map(users).set(account.id, updated), sessions);
    return json(res, 200, { profile: publicProfile(updated) });
  }

  return {
    profileFor: req => publicProfile(current(req)),
    handle(req, res, pathname) {
      route(req, res, pathname).catch(err => {
        console.error('Account request failed:', err.code ?? err.name);
        if (!res.headersSent && !res.destroyed) json(res, 500, { error: 'unavailable' });
      });
    },
  };
}
