import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomInt } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { createAccounts, sameOrigin } from './accounts.mjs';
import { roomMedia } from './room-media.mjs';
import { CHAT_HISTORY_LIMIT, chatText } from './src/room-chat.js';
import { rack, step, allStopped, shoot, placeCueExact, clampTip, evolveCloth } from './src/physics.js';
import { adjudicateShot, BREAK_CHOICES, isOnEight, otherPlayer, validateEightCall } from './src/shot-rules.js';
import { POCKETS, pocketAt } from './src/geometry.js';
import { BALL_R, CUSHION, FOOT_SPOT, HEAD_STRING, PHYSICS_VERSION, TABLE_H, TABLE_W } from './src/config.js';
const base = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(base, 'dist');
const dataDir = process.env.POOL_DATA_DIR || path.join(base, '.runtime');
fs.mkdirSync(dataDir, { recursive: true });
const accounts = createAccounts(dataDir);
const savePath = path.join(dataDir, 'rooms.json');
const rooms = new Map();
const send = (ws, msg) => {
  if (ws?.readyState !== WebSocket.OPEN) return;
  // Full snapshots can be skipped under congestion; final positions and turn changes are retained.
  if (msg.type === 'state' && !msg.settled && ws.bufferedAmount > 16384) return;
  ws.send(JSON.stringify(msg));
};
const media = roomMedia(send, WebSocket.OPEN);
const chats = new WeakMap();
const rounded = (n, digits) => Number(n.toFixed(digits));
const token = () => randomBytes(20).toString('hex');
const code = () => randomBytes(4).toString('hex').slice(0, 6).toUpperCase();
const RULES_VERSION = 1;
let dirty = false;
function shuffledRack() {
  const solids = randomInt(1, 8), stripes = randomInt(9, 16);
  const corners = randomInt(2) ? [solids, stripes] : [stripes, solids];
  const order = [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15].filter(n => !corners.includes(n));
  for (let i = order.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [order[j], order[i]] = [order[i], order[j]];
  }
  order.splice(4, 0, 8);
  order.splice(10, 0, corners[0]);
  order.push(corners[1]);
  return rack(order);
}
function clearShot(room) {
  room.potted = []; room.potPockets = {}; room.breakRails = [];
  room.firstHit = null; room.railAfterHit = false; room.crossedHead = false; room.headFault = false;
  room.called = null; room.onEight = false;
}
function reset(room, breaker = randomInt(1, 3)) {
  room.physicsVersion = PHYSICS_VERSION; room.rulesVersion = RULES_VERSION;
  room.balls = shuffledRack(); room.balls[0].x = HEAD_STRING - BALL_R;
  room.breaker = room.turn = breaker; room.shots = 0; room.shooting = false;
  room.breaking = true; room.breakDecision = null; room.ballInHand = true; room.placementZone = 'head';
  room.gameOver = false; room.winner = null; room.groups = { 1: null, 2: null };
  clearShot(room);
  room.sfx = { b: 0, r: 0, p: 0 }; room.reason = ''; dirty = true;
}
function serialize(room) { return Object.fromEntries(Object.entries(room).filter(([k]) => !['sockets', 'sfx'].includes(k))); }
try {
  for (const r of JSON.parse(fs.readFileSync(savePath, 'utf8'))) {
    if (Date.now() - r.updated > 6 * 3600_000) continue;
    if (r.physicsVersion !== PHYSICS_VERSION || r.rulesVersion !== RULES_VERSION) reset(r);
    r.sockets = {}; r.sfx = { b: 0, r: 0, p: 0 }; rooms.set(r.code, r);
  }
} catch {}
function save() {
  if (!dirty) return;
  fs.writeFileSync(savePath + '.tmp', JSON.stringify([...rooms.values()].map(serialize)));
  fs.renameSync(savePath + '.tmp', savePath); dirty = false;
}
function broadcast(room, msg) { for (const ws of Object.values(room.sockets)) send(ws, msg); }
function state(room) {
  const connected = [1, 2].filter(p => room.sockets[p]?.readyState === WebSocket.OPEN);
  return { type: 'state', turn: room.turn, settled: !room.shooting, cuePotted: room.balls[0].potted,
    ballInHand: room.ballInHand, shots: room.shots, groups: room.groups, gameOver: room.gameOver,
    breaking: room.breaking, breakDecision: room.breakDecision, placementZone: room.placementZone,
    physicsVersion: PHYSICS_VERSION, winner: room.winner, connected, reason: room.reason, sfx: room.sfx, players: room.players,
    balls: room.balls.map(b => ({
      n: b.number, x: rounded(b.x, 2), y: rounded(b.y, 2), p: b.potted,
      vx: rounded(b.vx, 4), vy: rounded(b.vy, 4), wx: rounded(b.wx, 3), wy: rounded(b.wy, 3), wz: rounded(b.wz, 3),
      q: b.potted ? undefined : b.q?.map(value => rounded(value, 4)),
    })) };
}
function pushState(room) { broadcast(room, state(room)); room.sfx = { b: 0, r: 0, p: 0 }; }
function finishShot(room) {
  room.shooting = false;
  Object.assign(room, adjudicateShot(room));
  room.updated = Date.now(); dirty = true; pushState(room);
}
function spotEight(room) {
  const eight = room.balls.find(b => b.number === 8);
  const y = CUSHION + TABLE_H / 2, min = CUSHION + BALL_R, max = CUSHION + TABLE_W - BALL_R;
  for (let x = FOOT_SPOT; x <= max; x += .25) {
    if (placeCueExact(eight, room.balls, x, y)) return;
  }
  for (let x = FOOT_SPOT - .25; x >= min; x -= .25) {
    if (placeCueExact(eight, room.balls, x, y)) return;
  }
}
function startRack(room, breaker) {
  reset(room, breaker);
  broadcast(room, { type: 'start', groups: room.groups, turn: room.turn });
  pushState(room);
}
function decideBreak(room, choice) {
  if (!BREAK_CHOICES[room.breakDecision]?.includes(choice)) return;
  if (choice === 'rebreak' || choice === 'returnBreak') {
    startRack(room, choice === 'returnBreak' ? otherPlayer(room.turn) : room.turn);
    return;
  }
  if (choice === 'spot' || choice === 'spotInHand') spotEight(room);
  room.ballInHand = choice === 'spotInHand' || choice === 'headInHand';
  room.placementZone = room.ballInHand ? 'head' : 'table';
  room.breakDecision = null; room.reason = '';
  room.updated = Date.now(); dirty = true; pushState(room);
}
function fail(ws, value) { send(ws, { type: 'error', code: value }); }

function sendChat(ws, room, m) {
  if (!Number.isSafeInteger(m.requestId) || m.requestId < 1 || room.sockets[ws.player] !== ws) return;
  const reject = reason => send(ws, { type: 'chatRejected', requestId: m.requestId, reason });
  const opponent = room.sockets[otherPlayer(ws.player)];
  if (opponent?.readyState !== WebSocket.OPEN) { reject('offline'); return; }
  const text = chatText(m.text);
  if (!text) { reject('invalid'); return; }
  let chat = chats.get(room);
  if (!chat) { chat = { messages: [], lastSent: {} }; chats.set(room, chat); }
  const now = Date.now();
  if (now - (chat.lastSent[ws.player] ?? 0) < 800) { reject('rate'); return; }
  chat.lastSent[ws.player] = now;
  const entry = { player: ws.player, text };
  chat.messages.push(entry);
  if (chat.messages.length > CHAT_HISTORY_LIMIT) chat.messages.shift();
  send(opponent, { type: 'chatMessage', entry });
  send(ws, { type: 'chatMessage', entry, requestId: m.requestId });
}

function attach(ws, room, player, profile) {
  room.players ??= {};
  if (!Object.hasOwn(room.players, player)) room.players[player] = profile;
  const old = room.sockets[player];
  if (old && old !== ws) { old.room = null; old.close(4001, 'replaced'); }
  room.sockets[player] = ws; ws.room = room; ws.player = player; room.updated = Date.now(); dirty = true;
  send(ws, { type: 'ready', code: room.code, player, token: room.tokens[player] });
  if (!room.started && room.sockets[1] && room.sockets[2]) room.started = true;
  if (room.started) broadcast(room, { type: 'start', groups: room.groups, turn: room.turn });
  pushState(room);
  media.refresh(room);
  if (room.started) send(ws, { type: 'chatHistory', entries: chats.get(room)?.messages ?? [] });
}
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.txt': 'text/plain; charset=utf-8' };
const server = http.createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://local').pathname); }
  catch { res.writeHead(400); res.end(); return; }
  if (pathname === '/health') { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end('{"ok":true}'); return; }
  if (pathname.startsWith('/api/')) { accounts.handle(req, res, pathname); return; }
  const file = pathname === '/LICENSE' ? path.join(base, 'LICENSE') : path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (file !== path.join(base, 'LICENSE') && !file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-store',
      'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin' });
    if (req.method === 'HEAD') res.end(); else fs.createReadStream(file).pipe(res);
  });
});
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 32 * 1024 });
wss.on('connection', (ws, req) => {
  if (!sameOrigin(req)) { ws.close(1008, 'origin'); return; }
  ws.alive = true; ws.rateAt = Date.now(); ws.count = 0; ws.rtcCount = 0;
  ws.on('pong', () => { ws.alive = true; });
  ws.on('message', raw => {
    if (Date.now() - ws.rateAt > 1000) { ws.rateAt = Date.now(); ws.count = 0; ws.rtcCount = 0; }
    let m; try { m = JSON.parse(raw); } catch {}
    if (m?.type === 'rtc') {
      if (++ws.rtcCount > 90) { ws.close(1008, 'rate limit'); return; }
      if (ws.room?.started) media.relay(ws, m);
      return;
    }
    if (++ws.count > 45) { ws.close(1008, 'rate limit'); return; }
    if (raw.length > 4096) { ws.close(1009, 'message too large'); return; }
    if (m === undefined) { fail(ws, 'invalid'); return; }
    if (!m || typeof m !== 'object') return;
    if (m.action === 'create' && !ws.room) {
      if (rooms.size >= 64) { fail(ws, 'busy'); return; }
      let id; do { id = code(); } while (rooms.has(id));
      const room = { code: id, tokens: { 1: token(), 2: null }, sockets: {}, updated: Date.now(), started: false };
      reset(room); rooms.set(id, room); attach(ws, room, 1, accounts.profileFor(req)); return;
    }
    if (m.action === 'join' && !ws.room) {
      const room = rooms.get(String(m.code || '').toUpperCase());
      if (!room) { fail(ws, 'notFound'); return; }
      let player = [1, 2].find(p => room.tokens[p] && room.tokens[p] === m.token);
      if (!player) {
        if (room.tokens[2]) { fail(ws, 'full'); return; }
        player = 2; room.tokens[2] = token();
      }
      attach(ws, room, player, accounts.profileFor(req)); return;
    }
    const room = ws.room;
    if (!room?.started) return;
    if (m.type === 'chat') { sendChat(ws, room, m); return; }
    if (m.tip !== undefined && (!m.tip || typeof m.tip !== 'object' || ![m.tip.x, m.tip.y].every(Number.isFinite))) return;
    if (m.type === 'aim') {
      if (room.gameOver || room.turn !== ws.player || room.shooting || room.ballInHand || room.breakDecision) return;
      if (!Number.isFinite(m.angle) || !Number.isFinite(m.power)) return;
      for (const peer of Object.values(room.sockets)) if (peer !== ws) send(peer, { type: 'aim', player: ws.player,
        angle: Math.atan2(Math.sin(m.angle), Math.cos(m.angle)), power: Math.min(1, Math.max(0, m.power)), tip: clampTip(m.tip) });
      return;
    }
    if (m.type === 'restart') {
      if (room.sockets[1]?.readyState !== WebSocket.OPEN || room.sockets[2]?.readyState !== WebSocket.OPEN) return;
      startRack(room, otherPlayer(room.breaker)); return;
    }
    if (room.gameOver || room.turn !== ws.player || room.shooting) return;
    if (room.sockets[1]?.readyState !== WebSocket.OPEN || room.sockets[2]?.readyState !== WebSocket.OPEN) return;
    const cue = room.balls[0];
    if (room.breakDecision) {
      if (m.type === 'breakChoice') decideBreak(room, m.choice);
      return;
    }
    if (m.type === 'place' && room.ballInHand && Number.isFinite(m.x) && Number.isFinite(m.y)) {
      const x = rounded(m.x, 2), y = rounded(m.y, 2);
      if (room.placementZone === 'head' && x >= HEAD_STRING) { send(ws, { type: 'placeRejected' }); return; }
      if (!placeCueExact(cue, room.balls, x, y)) { send(ws, { type: 'placeRejected' }); return; }
      // Preview may be moved repeatedly before confirming.
      if (m.confirm !== false) { room.ballInHand = false; room.reason = ''; }
      room.updated = Date.now(); pushState(room); dirty = true;
    } else if (m.type === 'shoot' && !room.ballInHand && !cue.potted && [m.dx, m.dy, m.power].every(Number.isFinite) && Math.hypot(m.dx, m.dy) > 0 && Number.isFinite(Math.hypot(m.dx, m.dy)) && m.power > 0) {
      const onEight = !room.breaking && isOnEight(room.balls, room.groups[room.turn]);
      const call = onEight ? validateEightCall(m.call) :
        !room.breaking && m.call?.safety === true ? { safety: true } : null;
      if (onEight && !call) { send(ws, { type: 'shotRejected' }); return; }
      clearShot(room);
      room.called = call;
      room.onEight = onEight;
      shoot(cue, m.dx, m.dy, Math.min(1, Math.max(0, m.power)), clampTip(m.tip));
      room.shots++; room.shooting = true; room.reason = '';
      room.updated = Date.now(); dirty = true; pushState(room);
    }
  });
  ws.on('error', () => {});
  ws.on('close', () => {
    const room = ws.room;
    if (room && room.sockets[ws.player] === ws) {
      delete room.sockets[ws.player]; room.updated = Date.now(); dirty = true; pushState(room); media.refresh(room);
    }
  });
});
let frame = 0;
const simulation = setInterval(() => {
  frame++;
  for (const room of rooms.values()) {
    if (!room.shooting) {
      if (room.balls.some(b => !b.potted && Math.abs(b.wz) > 1e-9)) {
        let spinning = false;
        for (const b of room.balls) {
          if (b.potted || Math.abs(b.wz) <= 1e-9) continue;
          evolveCloth(b, 1 / 60, true);
          if (Math.abs(b.wz) > 1e-9) spinning = true;
        }
        if (frame % 3 === 0 || !spinning) pushState(room);
        dirty = true;
      }
      continue;
    }
    const { hits, potted, crossedHead } = step(room.balls);
    for (const h of hits) {
      if (h.type === 'ball') {
        room.sfx.b = Math.max(room.sfx.b, h.speed);
        if (room.firstHit == null && (h.a === 0 || h.b === 0)) {
          room.firstHit = h.a === 0 ? h.b : h.a;
          room.headFault = room.placementZone === 'head' && h.objectBehindHead && !room.crossedHead && !h.crossedHead;
        }
      } else {
        room.sfx.r = Math.max(room.sfx.r, h.speed);
        if (room.firstHit != null) {
          room.railAfterHit = true;
          if (room.breaking && h.number !== 0 && !room.breakRails.includes(h.number)) room.breakRails.push(h.number);
        }
      }
    }
    room.crossedHead ||= crossedHead;
    for (const b of potted) {
      room.potted.push(b.number); room.potPockets[b.number] = POCKETS.indexOf(pocketAt(b.x, b.y)); room.sfx.p++;
    }
    if (allStopped(room.balls)) finishShot(room); else if (frame % 3 === 0) pushState(room);
    dirty = true;
  }
}, 1000 / 60);
const maintenance = setInterval(() => {
  for (const ws of wss.clients) { if (!ws.alive) ws.terminate(); else { ws.alive = false; ws.ping(); } }
  for (const [id, room] of rooms) if (!Object.keys(room.sockets).length && Date.now() - room.updated > 2 * 3600_000) { rooms.delete(id); dirty = true; }
  save();
}, 15000);
const persistence = setInterval(save, 1500);
server.listen(Number(process.env.PORT || 3000), process.env.HOST || '0.0.0.0', () => console.log(`RainBow 台球 http://localhost:${server.address().port}`));
function shutdown() { save(); clearInterval(simulation); clearInterval(maintenance); clearInterval(persistence); wss.close(); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 1200).unref(); }
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
