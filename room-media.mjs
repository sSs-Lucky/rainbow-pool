import { createHmac, randomBytes } from 'node:crypto';

const urls = (value, scheme) => (value ?? '').split(',').map(s => s.trim()).filter(s => scheme.test(s));
const stun = urls(process.env.POOL_STUN_URLS ?? 'stun:stun.l.google.com:19302', /^stuns?:\S+$/i);
const turn = urls(process.env.POOL_TURN_URLS, /^turns?:\S+$/i);
const turnSecret = process.env.POOL_TURN_SECRET;
const MAX_SIGNAL_SIZE = 24 * 1024;

function iceServers(session, player) {
  const servers = stun.length ? [{ urls: stun }] : [];
  if (turn.length && turnSecret) {
    const username = `${Math.floor(Date.now() / 1000) + 4 * 3600}:${session}-${player}`;
    const credential = createHmac('sha1', turnSecret).update(username).digest('base64');
    servers.push({ urls: turn, username, credential });
  }
  return servers;
}

function cleanSignal(m) {
  if (m.kind === 'media' && typeof m.audio === 'boolean' && typeof m.video === 'boolean') {
    return { kind: 'media', audio: m.audio, video: m.video };
  }
  const d = m.description;
  if (m.kind === 'description' && ['offer', 'answer'].includes(d?.type) &&
      typeof d.sdp === 'string' && Buffer.byteLength(d.sdp) <= MAX_SIGNAL_SIZE) {
    return { kind: 'description', description: { type: d.type, sdp: d.sdp } };
  }
  const c = m.candidate;
  if (m.kind === 'candidate' && typeof c?.candidate === 'string' && c.candidate.length <= 1024 &&
      (c.sdpMid == null || typeof c.sdpMid === 'string' && c.sdpMid.length < 64) &&
      (c.sdpMLineIndex == null || Number.isInteger(c.sdpMLineIndex) && c.sdpMLineIndex >= 0 && c.sdpMLineIndex < 16) &&
      (c.usernameFragment == null || typeof c.usernameFragment === 'string' && c.usernameFragment.length < 256)) {
    return { kind: 'candidate', candidate: { candidate: c.candidate, sdpMid: c.sdpMid,
      sdpMLineIndex: c.sdpMLineIndex, usernameFragment: c.usernameFragment } };
  }
  return null;
}

export function roomMedia(send, openState) {
  const sessions = new WeakMap();
  const current = (room, player) => room.sockets[player]?.readyState === openState;

  function refresh(room, lastRetry = 0) {
    const pair = current(room, 1) && current(room, 2);
    const id = pair ? randomBytes(12).toString('hex') : null;
    sessions.set(room, { id, lastRetry });
    for (const player of [1, 2]) {
      send(room.sockets[player], { type: 'rtcReady', session: id, iceServers: id ? iceServers(id, player) : [],
        keepDevices: lastRetry !== 0 });
    }
  }

  function relay(ws, m) {
    const { room, player } = ws;
    const session = sessions.get(room);
    const other = player === 1 ? 2 : 1;
    if (!session?.id || m.session !== session.id || room.sockets[player] !== ws || !current(room, other)) return;
    if (m.kind === 'retry') {
      if (Date.now() - session.lastRetry >= 5000) refresh(room, Date.now());
      return;
    }
    const signal = cleanSignal(m);
    if (!signal) return;
    if (signal.kind === 'description' && signal.description.type !== (player === 1 ? 'offer' : 'answer')) return;
    send(room.sockets[other], { type: 'rtc', session: session.id, ...signal });
  }
  return { refresh, relay };
}
