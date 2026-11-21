import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { WebSocket } from 'ws';
import { BALL_R, HEAD_STRING } from '../src/config.js';
import { POCKETS } from '../src/geometry.js';
const base = process.env.POOL_TEST_URL || 'http://127.0.0.1:3000';
const endpoint = base.replace(/^http/, 'ws') + '/ws';
const browserOrigin = process.env.POOL_TEST_BROWSER_ORIGIN || new URL(base).origin;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function client(headers) {
  const socket = new WebSocket(endpoint, { headers }); const messages = [];
  socket.on('message', raw => messages.push(JSON.parse(raw)));
  const opened = new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  async function wait(predicate, timeout = 15000, after = 0) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) { const found = messages.slice(after).find(predicate); if (found) return found; await delay(20); }
    throw new Error('Timed out waiting for game state');
  }
  return { socket, messages, opened, wait, send: m => socket.send(JSON.stringify(m)), state: () => messages.filter(m => m.type === 'state').at(-1) };
}
const open = { 1: null, 2: null };
const state = (client, predicate, after = 0) => client.wait(m => m.type === 'state' && predicate(m), 20000, after);
const settled = (client, shots) => state(client, m => m.shots === shots && m.settled);
const opponent = player => player === 1 ? 2 : 1;
const shoot = (client, dx, dy, power, call) => client.send({ type: 'shoot', dx, dy, power, call });

async function connectMatch(t) {
  const clients = [];
  const make = () => {
    const c = client();
    clients.push(c);
    return c;
  };
  t.after(() => clients.forEach(c => c.socket.terminate()));
  const host = make();
  await host.opened;
  host.send({ action: 'create' });
  const owner = await host.wait(m => m.type === 'ready');
  assert.equal(owner.player, 1);
  const guest = make();
  await guest.opened;
  guest.send({ action: 'join', code: owner.code });
  const invitee = await guest.wait(m => m.type === 'ready');
  assert.equal(invitee.player, 2);
  const initial = await state(host, m => m.connected.length === 2);
  await state(guest, m => m.connected.length === 2);
  const players = { 1: host, 2: guest }, refs = { 1: owner, 2: invitee };
  async function reconnect(player) {
    players[player].socket.close();
    const c = make();
    await c.opened;
    c.send({ action: 'join', code: owner.code, token: refs[player].token });
    assert.equal((await c.wait(m => m.type === 'ready')).player, player);
    return c;
  }
  return { host, guest, owner, make, initial, players, reconnect };
}

async function place(c, x, y, confirm = true) {
  c.send({ type: 'place', x, y, confirm });
  return state(c, m => m.ballInHand === !confirm && !m.cuePotted && m.balls[0].x === x && m.balls[0].y === y);
}

test('call signals stay between current seats and stale signals are dropped after a retry or reconnect', { timeout: 12000 }, async t => {
  const { host, guest, make, reconnect } = await connectMatch(t);
  const current = client => client.wait(m => m.type === 'rtcReady' && m.session);
  const room = await current(host);
  assert.equal((await current(guest)).session, room.session);
  assert.equal(room.keepDevices, false);
  const signal = { type: 'rtc', kind: 'media', session: room.session, audio: true, video: false };
  const outsider = make();
  await outsider.opened;
  outsider.send({ action: 'create' });
  await outsider.wait(m => m.type === 'ready');
  outsider.send({ ...signal, video: true });
  // Only the first seat may offer, and a larger SDP must not hit the gameplay message size limit.
  guest.send({ type: 'rtc', kind: 'description', session: room.session, description: { type: 'offer', sdp: 'invalid seat' } });
  host.send(signal);
  await guest.wait(m => m.type === 'rtc' && m.kind === 'media');
  const offer = { type: 'offer', sdp: 'v=0\r\n' + 'a=sendrecv\r\n'.repeat(400) };
  host.send({ type: 'rtc', kind: 'description', session: room.session, description: offer });
  assert.deepEqual((await guest.wait(m => m.type === 'rtc' && m.kind === 'description')).description, offer);
  assert.equal(host.messages.some(m => m.type === 'rtc'), false);
  assert.equal(outsider.messages.some(m => m.type === 'rtc'), false);

  guest.send({ type: 'rtc', kind: 'retry', session: room.session });
  const retried = await host.wait(m => m.type === 'rtcReady' && m.session && m.session !== room.session);
  assert.equal(retried.keepDevices, true, 'retries keep devices for the same two seats');
  await guest.wait(m => m.type === 'rtcReady' && m.session === retried.session);
  host.send({ ...signal, video: true });
  host.send({ ...signal, session: retried.session, audio: false });
  await guest.wait(m => m.type === 'rtc' && m.session === retried.session);
  assert.equal(guest.messages.some(m => m.type === 'rtc' && m.video), false);

  const returned = await reconnect(2);
  const next = await current(returned);
  assert.notEqual(next.session, retried.session);
  assert.equal(next.keepDevices, false, 'a seat reconnect requires enabling capture again');
  await host.wait(m => m.type === 'rtcReady' && m.session === next.session);
});

test('account cue choices survive login and both seats receive public nicknames and cue styles', { timeout: 15000 }, async t => {
  const nickname = '练球' + randomBytes(5).toString('hex');
  const password = randomBytes(16).toString('hex');
  const credentials = { nickname, password };
  const request = (route, method, body, session, extra = {}) => fetch(base + '/api/' + route, {
    method, body: body && JSON.stringify(body), headers: {
      'X-Rainbow-Request': '1', 'Content-Type': 'application/json',
      ...(session ? { Cookie: session } : {}), ...extra,
    },
  });
  assert.deepEqual(await (await request('profile', 'GET')).json(), { profile: null });
  assert.equal((await request('profile', 'PATCH', { cue: 'jade' })).status, 401);
  assert.equal((await request('register', 'POST', credentials, null, { Origin: 'https://example.com' })).status, 403);
  const registered = await request('register', 'POST', credentials);
  assert.equal(registered.status, 201);
  const sessionCookie = registered.headers.get('set-cookie');
  assert.match(sessionCookie, /HttpOnly; SameSite=Strict/);
  const session = sessionCookie.split(';')[0];
  assert.deepEqual(await registered.json(), { profile: { nickname, cue: 'aurora' } });
  assert.equal((await request('register', 'POST', credentials)).status, 409);
  assert.equal((await request('login', 'POST', { nickname, password: password + 'x' })).status, 401);
  assert.equal((await request('profile', 'PATCH', { cue: 'constructor' }, session)).status, 400);
  assert.deepEqual(await (await request('profile', 'PATCH', { cue: 'jade' }, session)).json(),
    { profile: { nickname, cue: 'jade' } });
  const renewed = await request('login', 'POST', credentials, session);
  const loginCookie = renewed.headers.get('set-cookie').split(';')[0];
  assert.notEqual(loginCookie, session);
  assert.deepEqual(await renewed.json(), { profile: { nickname, cue: 'jade' } });
  assert.deepEqual(await (await request('profile', 'GET', null, session)).json(), { profile: null });

  const host = client({ Cookie: loginCookie, Origin: browserOrigin });
  const guest = client({ Origin: browserOrigin, 'Sec-Fetch-Site': 'same-site' });
  const foreign = client({ Origin: 'https://example.com', 'Sec-Fetch-Site': 'same-site' });
  t.after(() => { for (const peer of [host, guest, foreign]) peer.socket.terminate(); });
  const rejected = new Promise(resolve => foreign.socket.once('close', resolve));
  await foreign.opened;
  assert.equal(await rejected, 1008);
  await Promise.all([host.opened, guest.opened]);
  host.send({ action: 'create' });
  const { code } = await host.wait(m => m.type === 'ready');
  guest.send({ action: 'join', code, nickname: '假冒账号', cue: 'ocean' });
  for (const seat of [host, guest]) {
    const match = await state(seat, m => m.connected.length === 2);
    assert.deepEqual(match.players, { 1: { nickname, cue: 'jade' }, 2: null });
  }
  await request('logout', 'POST', null, loginCookie);
  assert.deepEqual(await (await request('profile', 'GET', null, loginCookie)).json(), { profile: null });
  assert.equal((await fetch(base + '/.runtime/accounts.json')).status, 404);
});

test('both seats sync 3D rotation; break pots stay open until a normal pot assigns groups without a call', { timeout: 60000 }, async t => {
  const { host, owner, make, initial, players, reconnect } = await connectMatch(t);
  assert.equal(initial.breaking, true);
  assert.equal(initial.placementZone, 'head');
  assert.deepEqual(initial.groups, open);
  assert.equal(initial.balls[5].n, 8, 'black eight is in the center of the triangle');
  const bottomCorners = [initial.balls[11].n, initial.balls[15].n];
  assert.equal(bottomCorners.filter(n => n < 8).length, 1);

  const third = make(); await third.opened; third.send({ action: 'join', code: owner.code });
  assert.equal((await third.wait(m => m.type === 'error')).code, 'full');
  const stranger = make(); await stranger.opened; stranger.send({ action: 'join', code: 'XXXXXX' });
  assert.equal((await stranger.wait(m => m.type === 'error')).code, 'notFound');

  const breaker = initial.turn;
  const active = players[breaker], passive = players[opponent(breaker)];
  await place(active, HEAD_STRING - BALL_R, 280);
  passive.send({ type: 'aim', angle: 1, power: .4 });
  shoot(passive, 1, 0, 1);
  await delay(100);
  assert.equal(active.messages.filter(m => m.type === 'aim').length, 0);
  assert.equal(active.state().shots, 0);

  active.send({ type: 'aim', angle: .12, power: .6, tip: { x: .3, y: -.4 } });
  const aim = await passive.wait(m => m.type === 'aim');
  assert.equal(aim.player, breaker);
  assert.deepEqual(aim.tip, { x: .3, y: -.4 });
  shoot(active, 1, 0, .85);
  await state(passive, m => m.shots === 1 && !m.settled && m.balls[0].q?.length === 4);
  const broken = await settled(active, 1);
  const otherView = await settled(passive, 1);
  assert.equal(broken.reason, 'breakPot');
  assert.equal(broken.turn, breaker);
  assert.equal(broken.breaking, false);
  assert.deepEqual(broken.groups, open);
  assert.deepEqual(otherView.balls, broken.balls);
  assert.ok(Math.abs(Math.hypot(...broken.balls[0].q) - 1) < .0002);

  const apex = broken.balls[1], cue = broken.balls[0], pocket = POCKETS[0];
  const dx = pocket.x - apex.x, dy = pocket.y - apex.y, length = Math.hypot(dx, dy);
  const aimX = apex.x - 2 * BALL_R * dx / length - cue.x;
  const aimY = apex.y - 2 * BALL_R * dy / length - cue.y;
  shoot(active, aimX, aimY, .75);
  const assigned = await settled(active, 2);
  assert.equal(assigned.reason, 'groupsSet');
  assert.equal(assigned.groups[breaker], apex.n < 8 ? 'solids' : 'stripes');
  assert.equal(assigned.turn, breaker);
  assert.deepEqual((await settled(passive, 2)).groups, assigned.groups);
  const again = await reconnect(opponent(breaker));
  assert.deepEqual((await state(again, m => m.connected.length === 2)).groups, assigned.groups);

  const offset = active.messages.length;
  again.send({ type: 'restart' });
  const restarted = await state(active, m => m.shots === 0 && m.breaking, offset);
  assert.equal(restarted.turn, opponent(breaker));
  assert.deepEqual(restarted.groups, open);
  assert.equal(restarted.balls.filter(b => b.p).length, 0);
  assert.equal((await fetch(base + '/.runtime/rooms.json')).status, 404);
  assert.equal((await fetch(base + '/health')).status, 200);
});

test('opening scratch restricts white placement to the head area; a later scratch grants the entire table', { timeout: 60000 }, async t => {
  const { initial, players, reconnect } = await connectMatch(t);
  const breaker = initial.turn, fouling = players[breaker], receiving = players[opponent(breaker)];
  await place(fouling, 100, 100);
  shoot(fouling, -1, -1, .35);
  const scratch = await settled(receiving, 1);
  assert.equal(scratch.reason, 'breakScratch');
  assert.equal(scratch.turn, opponent(breaker));
  assert.equal(scratch.ballInHand, true);
  assert.equal(scratch.cuePotted, true);
  assert.equal(scratch.placementZone, 'head');
  assert.deepEqual(scratch.groups, open);

  fouling.send({ type: 'place', x: 123, y: 100 });
  receiving.send({ type: 'place', x: 880, y: 160 });
  await receiving.wait(m => m.type === 'placeRejected');
  assert.equal(receiving.state().cuePotted, true);
  await place(receiving, 100, 100, false);
  shoot(receiving, -1, -1, .35, { safety: true });
  await delay(100);
  assert.equal(receiving.state().shots, 1, 'previewing the white does not unlock the stroke');
  const resumed = await reconnect(opponent(breaker));
  const restored = await state(resumed, m => m.connected.length === 2);
  assert.equal(restored.ballInHand, true);
  assert.equal(restored.placementZone, 'head');
  assert.equal(restored.balls[0].x, 100);
  await place(resumed, 100, 100);
  shoot(resumed, -1, -1, .35, { safety: true });
  const later = await settled(fouling, 2);
  assert.equal(later.reason, 'scratch');
  assert.equal(later.turn, breaker);
  assert.equal(later.placementZone, 'table');
  assert.equal(later.ballInHand, true);
  await place(fouling, 880, 160);
});

test('an illegal break offers the opponent the choice to re-rack and open', { timeout: 40000 }, async t => {
  const { initial, players } = await connectMatch(t);
  const active = players[initial.turn], incoming = players[opponent(initial.turn)];
  await place(active, HEAD_STRING - BALL_R, 280);
  shoot(active, 1, 0, .05);
  const decision = await settled(incoming, 1);
  assert.equal(decision.breakDecision, 'illegalBreak');
  assert.equal(decision.turn, opponent(initial.turn));
  active.send({ type: 'breakChoice', choice: 'rebreak' });
  await delay(100);
  assert.equal(incoming.state().breakDecision, 'illegalBreak');
  const offset = incoming.messages.length;
  incoming.send({ type: 'breakChoice', choice: 'rebreak' });
  const rerack = await state(incoming, m => m.shots === 0 && m.breaking, offset);
  assert.equal(rerack.turn, opponent(initial.turn));
  assert.equal(rerack.ballInHand, true);
  assert.deepEqual(rerack.groups, open);
});
