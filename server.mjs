import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { rack, step, allStopped, shoot, placeCueExact, clampTip, evolveCloth } from './src/physics.js';
import { adjudicateShot } from './src/shot-rules.js';
import { PHYSICS_VERSION } from './src/config.js';
const base = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(base, 'dist');
const dataDir = process.env.POOL_DATA_DIR || path.join(base, '.runtime');
fs.mkdirSync(dataDir, { recursive: true });
const savePath = path.join(dataDir, 'rooms.json');
const rooms = new Map();
const send = (ws, msg) => {
  if (ws?.readyState !== WebSocket.OPEN) return;
  // Full snapshots can be skipped under congestion; final positions and turn changes are retained.
  if (msg.type === 'state' && !msg.settled && ws.bufferedAmount > 16384) return;
  ws.send(JSON.stringify(msg));
};
const rounded = (n, digits) => Number(n.toFixed(digits));
const token = () => randomBytes(20).toString('hex');
const code = () => randomBytes(4).toString('hex').slice(0, 6).toUpperCase();
let dirty = false;
function reset(room) {
  room.physicsVersion = PHYSICS_VERSION; room.balls = rack(); room.turn = 1; room.shots = 0; room.shooting = false;
  room.ballInHand = false; room.potted = []; room.firstHit = null; room.railAfterHit = false;
  room.gameOver = false; room.winner = null; room.groups = { 1: 'solids', 2: 'stripes' };
  room.sfx = { b: 0, r: 0, p: 0 }; room.reason = ''; dirty = true;
}
function serialize(room) { return Object.fromEntries(Object.entries(room).filter(([k]) => !['sockets', 'sfx'].includes(k))); }
try {
  for (const r of JSON.parse(fs.readFileSync(savePath, 'utf8'))) {
    if (Date.now() - r.updated > 6 * 3600_000) continue;
    if (r.physicsVersion !== PHYSICS_VERSION) reset(r);
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
    physicsVersion: PHYSICS_VERSION, winner: room.winner, connected, reason: room.reason, sfx: room.sfx,
    balls: room.balls.map(b => ({ n: b.number, x: rounded(b.x, 2), y: rounded(b.y, 2), p: b.potted, vx: rounded(b.vx, 4), vy: rounded(b.vy, 4), wx: rounded(b.wx, 3), wy: rounded(b.wy, 3), wz: rounded(b.wz, 3) })) };
}
function pushState(room) { broadcast(room, state(room)); room.sfx = { b: 0, r: 0, p: 0 }; }
function finishShot(room) {
  room.shooting = false;
  Object.assign(room, adjudicateShot(room));
  room.updated = Date.now(); dirty = true; pushState(room);
}
function fail(ws, value) { send(ws, { type: 'error', code: value }); }
function attach(ws, room, player) {
  const old = room.sockets[player];
  if (old && old !== ws) { old.room = null; old.close(4001, 'replaced'); }
  room.sockets[player] = ws; ws.room = room; ws.player = player; room.updated = Date.now(); dirty = true;
  send(ws, { type: 'ready', code: room.code, player, token: room.tokens[player] });
  if (!room.started && room.sockets[1] && room.sockets[2]) room.started = true;
  if (room.started) broadcast(room, { type: 'start', groups: room.groups, turn: room.turn });
  pushState(room);
}
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.txt': 'text/plain; charset=utf-8' };
const server = http.createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://local').pathname); }
  catch { res.writeHead(400); res.end(); return; }
  if (pathname === '/health') { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end('{"ok":true}'); return; }
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
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });
wss.on('connection', ws => {
  ws.alive = true; ws.rateAt = Date.now(); ws.count = 0;
  ws.on('pong', () => { ws.alive = true; });
  ws.on('message', raw => {
    if (Date.now() - ws.rateAt > 1000) { ws.rateAt = Date.now(); ws.count = 0; }
    if (++ws.count > 45) { ws.close(1008, 'rate limit'); return; }
    let m; try { m = JSON.parse(raw); } catch { fail(ws, 'invalid'); return; }
    if (!m || typeof m !== 'object') return;
    if (m.action === 'create' && !ws.room) {
      if (rooms.size >= 64) { fail(ws, 'busy'); return; }
      let id; do { id = code(); } while (rooms.has(id));
      const room = { code: id, tokens: { 1: token(), 2: null }, sockets: {}, updated: Date.now(), started: false };
      reset(room); rooms.set(id, room); attach(ws, room, 1); return;
    }
    if (m.action === 'join' && !ws.room) {
      const room = rooms.get(String(m.code || '').toUpperCase());
      if (!room) { fail(ws, 'notFound'); return; }
      let player = [1, 2].find(p => room.tokens[p] && room.tokens[p] === m.token);
      if (!player) {
        if (room.tokens[2]) { fail(ws, 'full'); return; }
        player = 2; room.tokens[2] = token();
      }
      attach(ws, room, player); return;
    }
    const room = ws.room;
    if (!room?.started) return;
    if (m.tip !== undefined && (!m.tip || typeof m.tip !== 'object' || ![m.tip.x, m.tip.y].every(Number.isFinite))) return;
    if (m.type === 'aim') {
      if (room.gameOver || room.turn !== ws.player || room.shooting || room.ballInHand) return;
      if (!Number.isFinite(m.angle) || !Number.isFinite(m.power)) return;
      for (const peer of Object.values(room.sockets)) if (peer !== ws) send(peer, { type: 'aim', player: ws.player,
        angle: Math.atan2(Math.sin(m.angle), Math.cos(m.angle)), power: Math.min(1, Math.max(0, m.power)), tip: clampTip(m.tip) });
      return;
    }
    if (m.type === 'restart') {
      if (room.sockets[1]?.readyState !== WebSocket.OPEN || room.sockets[2]?.readyState !== WebSocket.OPEN) return;
      reset(room); broadcast(room, { type: 'start', groups: room.groups, turn: room.turn }); pushState(room); return;
    }
    if (room.gameOver || room.turn !== ws.player || room.shooting) return;
    if (room.sockets[1]?.readyState !== WebSocket.OPEN || room.sockets[2]?.readyState !== WebSocket.OPEN) return;
    const cue = room.balls[0];
    if (m.type === 'place' && room.ballInHand && Number.isFinite(m.x) && Number.isFinite(m.y)) {
      if (!placeCueExact(cue, room.balls, m.x, m.y)) { send(ws, { type: 'placeRejected' }); return; }
      // Preview may be moved repeatedly. Legacy clients confirm with their one tap.
      if (m.confirm !== false) { room.ballInHand = false; room.reason = ''; }
      room.updated = Date.now(); pushState(room); dirty = true;
    } else if (m.type === 'shoot' && !room.ballInHand && !cue.potted && [m.dx, m.dy, m.power].every(Number.isFinite) && Math.hypot(m.dx, m.dy) > 0 && Number.isFinite(Math.hypot(m.dx, m.dy)) && m.power > 0) {
      shoot(cue, m.dx, m.dy, Math.min(1, Math.max(0, m.power)), clampTip(m.tip));
      room.shots++; room.shooting = true; room.potted = []; room.firstHit = null; room.railAfterHit = false; room.reason = '';
      room.updated = Date.now(); dirty = true; pushState(room);
    }
  });
  ws.on('error', () => {});
  ws.on('close', () => {
    const room = ws.room;
    if (room && room.sockets[ws.player] === ws) { delete room.sockets[ws.player]; room.updated = Date.now(); dirty = true; pushState(room); }
  });
});
let frame = 0;
const simulation = setInterval(() => {
  frame++;
  for (const room of rooms.values()) {
    if (!room.shooting) {
      if (room.balls.some(b => !b.potted && Math.abs(b.wz) > 1e-9)) {
        for (const b of room.balls) if (!b.potted) evolveCloth(b, 1 / 60);
        if (frame % 3 === 0) pushState(room);
        dirty = true;
      }
      continue;
    }
    const { hits, potted } = step(room.balls);
    for (const h of hits) {
      if (h.type === 'ball') {
        room.sfx.b = Math.max(room.sfx.b, h.speed);
        if (room.firstHit == null && (h.a === 0 || h.b === 0)) room.firstHit = h.a === 0 ? h.b : h.a;
      } else { room.sfx.r = Math.max(room.sfx.r, h.speed); if (room.firstHit != null) room.railAfterHit = true; }
    }
    for (const b of potted) { room.potted.push(b.number); room.sfx.p++; }
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
