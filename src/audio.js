let ctx = null;
let master = null;
let musicGain = null;
let sfxGain = null;
let muted = false;
let lastHit = 0;
let musicSource = null;

const buffers = new Map();
let musicBuffer = null;

const SFX_FILES = {
  ballHit: ['ball-hit-1.ogg', 'ball-hit-2.ogg'],
  railHit: ['rail-hit.ogg'],
  pocket: ['pocket.ogg'],
  cueStrike: ['cue-strike.ogg'],
  uiClick: ['ui-click.ogg'],
  uiHover: ['ui-hover.ogg'],
  notify: ['notify.ogg'],
  turnChime: ['turn-chime.ogg'],
  win: ['win.ogg'],
  lose: ['lose.ogg'],
};
const MUSIC_FILE = 'music-loop.ogg';

function ensure() {
  if (ctx) return ctx;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);
  sfxGain = ctx.createGain();
  sfxGain.gain.value = 0.9;
  sfxGain.connect(master);
  musicGain = ctx.createGain();
  musicGain.gain.value = 0.0;
  musicGain.connect(master);
  loadSounds();
  return ctx;
}

async function loadOne(name) {
  const res = await fetch(`/sfx/${name}`);
  const data = await res.arrayBuffer();
  return ctx.decodeAudioData(data);
}

function loadSounds() {
  for (const [key, files] of Object.entries(SFX_FILES)) {
    Promise.all(files.map(loadOne)).then((bufs) => buffers.set(key, bufs)).catch(() => {});
  }
  loadOne(MUSIC_FILE).then((b) => { musicBuffer = b; }).catch(() => {});
}

export function resume() {
  ensure();
  if (ctx.state === 'suspended') ctx.resume();
}

export function setMuted(m) {
  muted = m;
  if (master) master.gain.value = m ? 0 : 0.9;
}

export function isMuted() {
  return muted;
}

function play(name, { gain = 1, rate = 1, dest = sfxGain } = {}) {
  if (!ctx || muted) return;
  const variants = buffers.get(name);
  if (!variants || !variants.length) return;
  const buf = variants[Math.floor(Math.random() * variants.length)];
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(g);
  g.connect(dest || sfxGain);
  src.start();
}

export function ballHit(speed) {
  if (!ctx || muted) return;
  const now = ctx.currentTime;
  if (now - lastHit < 0.012) return;
  lastHit = now;
  const v = Math.min(1, speed / 30);
  play('ballHit', { gain: 0.25 + v * 0.75, rate: 0.92 + v * 0.25 + Math.random() * 0.1 });
}

export function railHit(speed) {
  const v = Math.min(1, speed / 30);
  play('railHit', { gain: 0.2 + v * 0.7, rate: 0.9 + v * 0.2 + Math.random() * 0.1 });
}

export function pocket() {
  play('pocket', { gain: 0.8, rate: 0.95 + Math.random() * 0.1 });
}

export function cueStrike() {
  play('cueStrike', { gain: 0.85, rate: 0.95 + Math.random() * 0.1 });
}

export function uiClick() {
  play('uiClick', { gain: 0.7 });
}

export function uiHover() {
  play('uiHover', { gain: 0.4 });
}

export function notify() {
  play('notify', { gain: 0.8 });
}

export function turnChime() {
  play('turnChime', { gain: 0.7 });
}

export function win() {
  play('win', { gain: 0.85 });
}

export function lose() {
  play('lose', { gain: 0.85 });
}

export function startMusic() {
  ensure();
  if (musicSource || !musicBuffer) {
    if (!musicBuffer) loadOne(MUSIC_FILE).then((b) => { musicBuffer = b; startMusic(); }).catch(() => {});
    return;
  }
  musicSource = ctx.createBufferSource();
  musicSource.buffer = musicBuffer;
  musicSource.loop = true;
  musicSource.connect(musicGain);
  musicGain.gain.cancelScheduledValues(ctx.currentTime);
  musicGain.gain.setValueAtTime(musicGain.gain.value, ctx.currentTime);
  musicGain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 2);
  musicSource.start();
}

export function stopMusic() {
  if (musicGain && ctx) {
    musicGain.gain.cancelScheduledValues(ctx.currentTime);
    musicGain.gain.setValueAtTime(musicGain.gain.value, ctx.currentTime);
    musicGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 1);
  }
  if (musicSource) {
    const s = musicSource;
    musicSource = null;
    setTimeout(() => { try { s.stop(); } catch {} }, 1100);
  }
}
