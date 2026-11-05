import { Application, Container, Graphics } from 'pixi.js';
import { CANVAS_W, CANVAS_H, BALL_R } from './config.js';
import { powerFromPull, fineAngle, tipFromPoint } from './aiming.js';
import { rack, step, allStopped, shoot, placeCueExact, clampTip } from './physics.js';
import { drawTable, buildBallVisual, drawAim, clearAim, drawPlacement, buildCueVisual, initBallTextures } from './scene.js';
import { SnapshotPlayback } from './playback.js';
import { validPlacement } from './geometry.js';
import { host, join } from './net.js';
import * as ui from './ui.js';
import * as audio from './audio.js';
import { t, applyStatic } from './i18n.js';

const groupOf = (n) => (n === 0 ? 'cue' : n === 8 ? 'eight' : n <= 7 ? 'solids' : 'stripes');
const other = (p) => (p === 1 ? 2 : 1);

const game = {
  mode: 'solo', myPlayer: 1, turn: 1, started: false,
  balls: null, cue: null, sprites: null, byNumber: null,
  shots: 0, shooting: false, shotPotted: [], cueFoul: false,
  groups: { 1: null, 2: null }, gameOver: false, winner: null,
  net: null, settled: true, cuePotted: false, ballInHand: false, connected: false, room: '',
  sfxBall: 0, sfxRail: 0, sfxPocket: 0,
};

let app, ballLayer, aimLine, placementLine, cueVisual;
const placement = { point: null, valid: false, pointer: null, before: null, pending: false };
let placementState = '', guideState = '';
const playback = new SnapshotPlayback();
let lastRenderAt = performance.now();
const aim = { tip: { x: 0, y: 0 }, finePointer: null, fineStart: 0, fineBase: 0, fineDelta: 0, angle: 0, power: 0, pointer: null, startY: 0, travel: 1, strokeUntil: 0, strokePower: 0, strokeTip: { x: 0, y: 0 }, strokePos: null };
let controlState = '';
let lastAimSent = 0, aimSent = '';
const opponentAim = { angle: 0, power: 0, tip: { x: 0, y: 0 } };
let precisionState = '';
let bannerQ = [], bannerBusy = false, bannerTimer;
let lastPhysics = 0;

async function main() {
  app = new Application();
  await app.init({ width: CANVAS_W, height: CANVAS_H, backgroundColor: 0x071a14, antialias: true, resolution: Math.min(devicePixelRatio || 1, 2), autoDensity: true });
  app.ticker.maxFPS = 60;
  document.getElementById('app').appendChild(app.canvas);

  app.stage.addChild(drawTable());
  ballLayer = new Container();
  app.stage.addChild(ballLayer);
  aimLine = new Graphics();
  placementLine = new Graphics();
  cueVisual = buildCueVisual();
  cueVisual.visible = false;
  app.stage.addChild(aimLine, cueVisual, placementLine);

  initBallTextures(app.renderer);
  applyStatic();

  const fit = () => {
    const rect = document.getElementById('app').getBoundingClientRect();
    const scale = Math.min(rect.width / CANVAS_W, rect.height / CANVAS_H);
    app.canvas.style.width = `${CANVAS_W * scale}px`;
    app.canvas.style.height = `${CANVAS_H * scale}px`;
  };
  new ResizeObserver(fit).observe(document.getElementById('app'));
  fit();
  ui.setMuteIcon(audio.isMuted());

  setupRack();
  setupInput();
  setupPowerControl();
  setupPrecisionControls();
  ui.el('btn-place-confirm').onclick = confirmCuePlacement;

  lastPhysics = performance.now();
  setInterval(physicsLoop, 1000 / 60);
  app.ticker.add(renderFrame);

  wireMenu();
  ui.el('menu').classList.remove('booting');
  ui.el('boot-status').classList.add('hidden');

  const kick = () => { audio.resume(); window.removeEventListener('pointerdown', kick); };
  window.addEventListener('pointerdown', kick);
  const invite = new URLSearchParams(location.search).get('room');
  if (invite && /^[A-Fa-f0-9]{6}$/.test(invite)) {
    ui.el('join-code').value = invite.toUpperCase();
    ui.showScreen('screen-join');
    startJoin();
  }
}

function physicsLoop() {
  const now = performance.now();
  let n = Math.round((now - lastPhysics) / (1000 / 60));
  if (n < 1) return;
  lastPhysics = now;
  if (n > 150) n = 150;
  for (let i = 0; i < n; i++) physicsFrame();
}

function physicsFrame() {
  if (game.mode !== 'solo') { playback.tick(); return; }
  const audible = !document.hidden;
  const { potted, hits } = step(game.balls);

  for (const h of hits) {
    if (h.type === 'ball') {
      if (audible) audio.ballHit(h.speed);
      game.sfxBall = Math.max(game.sfxBall, h.speed);
    } else {
      if (audible) audio.railHit(h.speed);
      game.sfxRail = Math.max(game.sfxRail, h.speed);
    }
  }

  for (const b of potted) {
    if (audible) audio.pocket();
    game.sfxPocket++;
    game.shotPotted.push(b.number);
    if (b.number === 0) game.cueFoul = true;
  }

  if (potted.length) refreshHud();
  if (game.shooting && allStopped(game.balls)) {
    resolveSoloShot();
  }

}

function renderFrame() {
  const guest = game.mode !== 'solo';
  const now = performance.now(), blend = 1 - Math.exp(-Math.min(100, now - lastRenderAt) / 25);
  lastRenderAt = now;
  for (const [ball, spr] of game.sprites) {
    const ownPlacement = game.ballInHand && (game.mode === 'solo' || game.turn === game.myPlayer);
    const projected = guest && !game.settled ? playback.get(ball.number) : null;
    spr.visible = !ball.potted && !projected?.potted && !(ball.number === 0 && ownPlacement && placement.point);
    if (ball.potted) continue;
    if (guest) {
      ball.x += ((projected?.x ?? ball.tx ?? ball.x) - ball.x) * blend;
      ball.y += ((projected?.y ?? ball.ty ?? ball.y) - ball.y) * blend;
    } else {
      const sp = Math.hypot(ball.vx, ball.vy);
      spr.spin.rotation += (ball.vx >= 0 ? 1 : -1) * sp * 0.04;
    }
    spr.position.set(ball.x, ball.y);
  }
  renderControls();
}

function resetControls() {
  aim.power = 0; aim.pointer = null; aim.strokeUntil = 0;
  aim.tip = { x: 0, y: 0 }; aim.finePointer = null; aim.fineDelta = 0;
  ui.el('spin-modal').classList.remove('show');
  opponentAim.tip = { x: 0, y: 0 }; precisionState = '';
  opponentAim.angle = 0; opponentAim.power = 0; aimSent = '';
  if (aimLine) clearAim(aimLine);
  controlState = '';
  placement.point = null; placement.pointer = null; placement.valid = false; placement.pending = false;
  placementState = ''; guideState = '';
}
function renderControls() {
  const inGame = document.body.classList.contains('in-game');
  const usable = inGame && canShoot();
  if (!usable && aim.pointer != null) { aim.pointer = null; aim.power = 0; }
  const now = performance.now(), stroking = now < aim.strokeUntil;
  const opponentReady = game.mode !== 'solo' && game.started && game.connected && game.settled
    && !game.gameOver && !game.ballInHand && !game.cuePotted && game.turn !== game.myPlayer;
  const angle = opponentReady ? opponentAim.angle : aim.angle;
  const power = opponentReady ? opponentAim.power : aim.power;
  const tip = opponentReady ? opponentAim.tip : aim.tip;
  renderPrecision(tip, usable && aim.pointer == null, angle);
  cueVisual.visible = inGame && (usable || opponentReady || stroking);
  aimLine.visible = inGame && (usable || opponentReady);
  if (aimLine.visible) {
    drawAim(aimLine, game.cue, game.balls, angle, power, tip);
    const text = '白线瞄准 · 金色短箭头：目标球初始方向参考';
    if (text !== guideState) { ui.el('hint').textContent = text; guideState = text; }
    ui.showHint();
  } else if (!game.ballInHand) ui.hideHint();
  renderPlacement(inGame);
  if (usable && game.mode !== 'solo' && now - lastAimSent > 90) {
    const signature = `${aim.angle.toFixed(6)}-${aim.power.toFixed(2)}-${aim.tip.x.toFixed(3)}-${aim.tip.y.toFixed(3)}`;
    if (signature !== aimSent) { game.net.send({ type: 'aim', angle: aim.angle, power: aim.power, tip: aim.tip }); aimSent = signature; }
    lastAimSent = now;
  }
  if (cueVisual.visible) {
    const frac = stroking ? Math.max(0, (aim.strokeUntil - now) / 140) : 1;
    const pull = (stroking ? aim.strokePower : power) * 85 * frac;
    const pos = stroking ? aim.strokePos : game.cue;
    const gap = BALL_R + 7 + pull;
    const strokeTip = stroking ? aim.strokeTip : tip;
    cueVisual.position.set(pos.x - Math.cos(angle) * gap - Math.sin(angle) * strokeTip.x * BALL_R, pos.y - Math.sin(angle) * gap + Math.cos(angle) * strokeTip.x * BALL_R);
    cueVisual.rotation = angle;
  }
  const stopped = game.mode === 'solo' ? allStopped(game.balls) : game.settled;
  const label = game.gameOver ? '本局结束' : game.ballInHand && (game.mode === 'solo' || game.turn === game.myPlayer)
    ? '先摆白球' : game.mode !== 'solo' && !game.connected ? '等待连接' : !stopped ? '球在运动'
    : !usable ? '对手回合' : '下拉蓄力';
  const percent = Math.round(aim.power * 100), next = `${usable}-${percent}-${label}`;
  if (next !== controlState) {
    const track = ui.el('power-track'); track.disabled = !usable;
    track.setAttribute('aria-valuenow', String(percent));
    track.setAttribute('aria-valuetext', `${percent}% 力度`);
    ui.el('power-value').textContent = `${percent}%`;
    ui.el('power-caption').textContent = label;
    ui.el('power-fill').style.height = `${percent}%`;
    ui.el('power-handle').style.top = `${10 + aim.power * Math.max(0, track.clientHeight - 37)}px`;
    controlState = next;
  }
}
function strike() {
  if (!canShoot() || aim.power < .025) { aim.power = 0; return; }
  const power = Math.pow(aim.power, 1.35), dx = Math.cos(aim.angle), dy = Math.sin(aim.angle);
  aim.strokeTip = { ...aim.tip }; aim.strokePower = aim.power; aim.strokeUntil = performance.now() + 140;
  aim.strokePos = { x: game.cue.x, y: game.cue.y };
  aim.power = 0; aim.pointer = null;
  if (game.mode !== 'solo') {
    game.net.send({ type: 'shoot', dx, dy, power, tip: aim.tip }); game.settled = false; audio.cueStrike();
  } else doShoot(dx, dy, power, aim.tip);
  aim.tip = { x: 0, y: 0 }; ui.el('spin-modal').classList.remove('show');
  ui.hideHint();
}
function setupPowerControl() {
  const track = ui.el('power-track');
  track.addEventListener('pointerdown', e => {
    if (!canShoot() || e.isPrimary === false) return;
    e.preventDefault(); e.stopPropagation(); audio.resume();
    track.setPointerCapture(e.pointerId);
    aim.pointer = e.pointerId; aim.startY = e.clientY;
    aim.travel = Math.max(50, Math.min(track.clientHeight * .78, innerHeight - e.clientY - 12));
    aim.power = 0;
  });
  track.addEventListener('pointermove', e => {
    if (e.pointerId !== aim.pointer) return;
    e.preventDefault(); aim.power = powerFromPull(aim.startY, e.clientY, aim.travel);
  });
  track.addEventListener('pointerup', e => {
    if (e.pointerId !== aim.pointer) return;
    e.preventDefault();
    aim.power = powerFromPull(aim.startY, e.clientY, aim.travel);
    if (e.clientY - aim.startY >= 8) strike(); else aim.power = 0;
    aim.pointer = null;
  });
  track.addEventListener('pointercancel', () => { aim.pointer = null; aim.power = 0; });
  track.addEventListener('lostpointercapture', () => { aim.pointer = null; aim.power = 0; });
  track.addEventListener('keydown', e => {
    if (!canShoot()) return;
    if (['ArrowDown', 'ArrowUp', 'Enter', ' ', 'Escape'].includes(e.key)) e.preventDefault();
    if (e.key === 'ArrowDown') aim.power = Math.min(1, aim.power + .05);
    if (e.key === 'ArrowUp') aim.power = Math.max(0, aim.power - .05);
    if (e.key === 'Escape') aim.power = 0;
    if (e.key === 'Enter' || e.key === ' ') strike();
  });
  window.addEventListener('blur', () => { aim.pointer = null; aim.power = 0; });
}

function spinLabel(tip) {
  const vertical = tip.y > .035 ? '高杆' : tip.y < -.035 ? '低杆' : '';
  const side = tip.x > .035 ? '右塞' : tip.x < -.035 ? '左塞' : '';
  return [vertical, side].filter(Boolean).join(' · ') || '中杆';
}
function renderPrecision(tip, enabled, displayAngle) {
  const degrees = Math.atan2(Math.sin(displayAngle), Math.cos(displayAngle)) * 180 / Math.PI;
  const key = `${enabled}:${degrees.toFixed(4)}:${aim.fineDelta.toFixed(3)}:${tip.x.toFixed(3)}:${tip.y.toFixed(3)}`;
  if (key === precisionState) return;
  precisionState = key;
  for (const id of ['fine-track', 'fine-minus', 'fine-plus', 'spin-open', 'spin-pad']) ui.el(id).disabled = !enabled;
  ui.el('fine-track').setAttribute('aria-valuenow', degrees.toFixed(3));
  ui.el('fine-track').setAttribute('aria-valuetext', `瞄准角 ${degrees.toFixed(3)} 度，每像素微调 0.02 度`);
  ui.el('fine-value').textContent = `${degrees >= 0 ? '+' : ''}${degrees.toFixed(2)}°`;
  ui.el('fine-handle').style.top = `calc(50% - 5px + ${Math.max(-40, Math.min(40, aim.fineDelta * 16))}px)`;
  for (const id of ['spin-dot', 'spin-pad-dot']) {
    ui.el(id).style.left = `${50 + tip.x * 50}%`; ui.el(id).style.top = `${50 - tip.y * 50}%`;
  }
  const label = spinLabel(tip);
  ui.el('spin-caption').textContent = label;
  ui.el('spin-open').setAttribute('aria-label', `白球击点：${label}，点击设置`);
  ui.el('spin-description').textContent = label === '中杆' ? '中杆 · 不加塞' : `${label} · 偏心 ${Math.round(Math.hypot(tip.x, tip.y) * 100)}% 球半径`;
}
function setupPrecisionControls() {
  const track = ui.el('fine-track'), modal = ui.el('spin-modal'), pad = ui.el('spin-pad');
  const cancelFine = () => { aim.finePointer = null; aim.fineDelta = 0; };
  track.addEventListener('pointerdown', e => {
    if (!canShoot() || aim.pointer != null || e.isPrimary === false) return;
    e.preventDefault(); track.setPointerCapture(e.pointerId);
    aim.finePointer = e.pointerId; aim.fineStart = e.clientY; aim.fineBase = aim.angle;
  });
  const moveFine = e => {
    if (e.pointerId !== aim.finePointer || !canShoot()) return;
    e.preventDefault(); aim.angle = fineAngle(aim.fineBase, e.clientY - aim.fineStart);
    aim.fineDelta = (aim.angle - aim.fineBase) * 180 / Math.PI;
  };
  track.addEventListener('pointermove', moveFine);
  track.addEventListener('pointerup', e => { if (e.pointerId === aim.finePointer) { moveFine(e); cancelFine(); } });
  track.addEventListener('pointercancel', cancelFine); track.addEventListener('lostpointercapture', cancelFine);
  const nudge = sign => { if (canShoot() && aim.pointer == null) aim.angle = fineAngle(aim.angle, sign * 2.5); };
  ui.el('fine-minus').onclick = () => nudge(-1); ui.el('fine-plus').onclick = () => nudge(1);
  track.addEventListener('keydown', e => {
    if (['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'].includes(e.key)) { e.preventDefault(); nudge(['ArrowUp', 'ArrowLeft'].includes(e.key) ? -1 : 1); }
  });
  const close = () => { modal.classList.remove('show'); if (canShoot()) ui.el('spin-open').focus(); };
  ui.el('spin-open').onclick = () => { if (canShoot() && aim.pointer == null) { modal.classList.add('show'); pad.focus(); } };
  ui.el('spin-done').onclick = close;
  ui.el('spin-reset').onclick = () => { if (canShoot()) aim.tip = { x: 0, y: 0 }; };
  modal.addEventListener('pointerdown', e => { if (e.target === modal) close(); });
  modal.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    if (e.key === 'Tab') { const buttons = [pad, ui.el('spin-reset'), ui.el('spin-done')]; const current = buttons.indexOf(document.activeElement); e.preventDefault(); buttons[(current + (e.shiftKey ? 2 : 1)) % 3].focus(); }
  });
  let pointer = null;
  const setPoint = e => {
    if (!canShoot()) return;
    const r = pad.getBoundingClientRect(); aim.tip = tipFromPoint(e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2, r.width / 2);
  };
  pad.addEventListener('pointerdown', e => {
    if (!canShoot() || e.isPrimary === false) return;
    e.preventDefault(); pointer = e.pointerId; pad.setPointerCapture(pointer); setPoint(e);
  });
  pad.addEventListener('pointermove', e => { if (e.pointerId === pointer) { e.preventDefault(); setPoint(e); } });
  pad.addEventListener('pointerup', e => { if (e.pointerId === pointer) { setPoint(e); pointer = null; } });
  pad.addEventListener('pointercancel', () => { pointer = null; }); pad.addEventListener('lostpointercapture', () => { pointer = null; });
  pad.addEventListener('keydown', e => {
    if (!canShoot()) return;
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home'].includes(e.key)) {
      e.preventDefault();
      if (e.key === 'Home') aim.tip = { x: 0, y: 0 };
      else aim.tip = clampTip({ x: aim.tip.x + (e.key === 'ArrowLeft' ? -.025 : e.key === 'ArrowRight' ? .025 : 0), y: aim.tip.y + (e.key === 'ArrowUp' ? .025 : e.key === 'ArrowDown' ? -.025 : 0) });
    }
  });
  window.addEventListener('blur', () => { cancelFine(); pointer = null; });
}

function setupRack() {
  playback.clear();
  resetControls(); aim.angle = 0;
  for (const child of ballLayer.removeChildren()) child.destroy({ children: true });
  game.balls = rack();
  game.cue = game.balls.find((b) => b.number === 0);
  game.sprites = new Map();
  game.byNumber = new Map();

  for (const b of game.balls) {
    const v = buildBallVisual(b);
    game.sprites.set(b, v);
    game.byNumber.set(b.number, { ball: b, spr: v });
    ballLayer.addChild(v);
  }
  for (const b of game.balls) {
    b.tx = b.x;
    b.ty = b.y;
  }

  game.shots = 0;
  game.shooting = false;
  game.shotPotted = [];
  game.cueFoul = false;
  game.gameOver = false;
  game.winner = null;
  game.ballInHand = false;
  refreshHud();
}

function refreshHud() {
  if (game.mode === 'solo') {
    const p = game.balls.filter((b) => b.number !== 0 && b.potted).length;
    ui.updateHud(game.shots, p, 15);
  } else {
    const mg = game.groups[game.myPlayer];
    const p = mg ? game.balls.filter((b) => groupOf(b.number) === mg && b.potted).length : 0;
    ui.updateHud(game.shots, p, 7);
  }
  ui.updateGroup(game.mode, game.groups[game.myPlayer]);
  ui.updateBallsLeft(game.mode, game.balls, game.groups, game.myPlayer);
}

function canShoot() {
  if (game.gameOver || game.ballInHand) return false;
  if (game.mode !== 'solo' && (!game.started || !game.connected)) return false;
  const stopped = game.mode !== 'solo' ? game.settled : allStopped(game.balls);
  if (!stopped) return false;
  if (game.mode !== 'solo') return !game.cuePotted && game.turn === game.myPlayer;
  if (game.cue.potted) return false;
  if (game.mode === 'solo') return true;
  return game.turn === game.myPlayer;
}

function canPlaceCue() {
  if (game.gameOver || !game.ballInHand || placement.pending) return false;
  if (game.mode !== 'solo' && !game.connected) return false;
  const stopped = game.mode !== 'solo' ? game.settled : allStopped(game.balls);
  if (!stopped) return false;
  if (game.mode === 'solo') return true;
  return game.turn === game.myPlayer;
}

function renderPlacement(inGame) {
  const show = inGame && game.ballInHand && !game.gameOver;
  const mine = game.mode === 'solo' || game.turn === game.myPlayer;
  const enabled = show && mine && canPlaceCue();
  const text = !mine ? '对手自由球 · 正在摆放白球' : placement.pending ? '正在确认白球位置…' : !game.connected && game.mode !== 'solo' ? '等待连接后摆放白球' :
    placement.point && !placement.valid ? '此处不能摆球 · 请选择台面空位' : '自由球 · 可在全台面拖动白球，摆好后确认';
  const key = `${show}:${mine}:${enabled}:${placement.valid}:${text}`;
  if (key !== placementState) {
    ui.el('placement-bar').classList.toggle('show', show);
    document.body.classList.toggle('placing', show);
    ui.el('placement-status').textContent = text;
    const button = ui.el('btn-place-confirm'); button.hidden = !mine;
    button.disabled = !enabled || !placement.point || !placement.valid;
    button.textContent = placement.pending ? '正在确认…' : '确认摆球';
    placementState = key;
  }
  placementLine.visible = show;
  if (show) {
    const point = mine ? placement.point || (!game.cue.potted ? game.cue : null) : !game.cue.potted ? game.cue : null;
    drawPlacement(placementLine, point, mine ? !placement.point || placement.valid : true);
  }
}
function previewCueAt(x, y) {
  if (!canPlaceCue()) return;
  placement.point = { x, y }; placement.valid = validPlacement(x, y, game.balls, game.cue);
}
function shareCuePlacement() {
  if (canPlaceCue() && placement.valid && game.mode !== 'solo') game.net.send({ type: 'place', ...placement.point, confirm: false });
}
function confirmCuePlacement() {
  if (!canPlaceCue() || !placement.point || !placement.valid) return;
  const { x, y } = placement.point;
  if (game.mode !== 'solo') {
    placement.pending = true; game.net.send({ type: 'place', x, y, confirm: true });
  } else if (placeCueExact(game.cue, game.balls, x, y)) {
    game.cue.tx = x; game.cue.ty = y; game.ballInHand = false;
    placement.point = null; placement.valid = false; guideState = ''; ui.toast('白球已摆好，可以瞄准击球');
  }
}

function doShoot(dx, dy, power, tip) {
  shoot(game.cue, dx, dy, power, tip);
  audio.cueStrike();
  game.shots++;
  game.shooting = true;
  game.shotPotted = [];
  game.cueFoul = false;
  refreshHud();
  ui.hideHint();
}

function resolveSoloShot() {
  game.shooting = false;
  if (game.cueFoul || game.shotPotted.includes(0)) {
    game.ballInHand = true;
    ui.el('hint').textContent = t('placeCueHint');
    ui.showHint();
  }
  game.shotPotted = [];
  game.cueFoul = false;
  refreshHud();
}

function showEndBanner() {
  const won = game.winner === game.myPlayer;
  ui.banner(won ? t('won') : t('lost'));
  won ? audio.win() : audio.lose();
}

function announceTurn() {
  ui.updateTurn(game.mode, game.turn === game.myPlayer, game.ballInHand);
  if (game.ballInHand && game.turn === game.myPlayer) {
    queueBanner(t('ballInHandYou'));
    ui.el('hint').textContent = t('placeCueHint');
    ui.showHint();
  } else {
    queueBanner(game.turn === game.myPlayer ? t('yourTurn') : t('rivalTurn'));
  }
  if (game.turn === game.myPlayer) audio.turnChime();
  maybeNotifyTurn();
}

function announceGroupAndTurn() {
  const mg = game.groups[game.myPlayer];
  queueBanner(mg === 'stripes' ? t('mustStripes') : t('mustSolids'));
  queueBanner(game.turn === game.myPlayer ? t('yourTurn') : t('rivalTurn'));
  ui.updateTurn(game.mode, game.turn === game.myPlayer, game.ballInHand);
  if (game.turn === game.myPlayer) {
    audio.turnChime();
    maybeNotifyTurn();
  }
  refreshHud();
}

function queueBanner(text) {
  bannerQ.push(text);
  if (!bannerBusy) nextBanner();
}

function nextBanner() {
  if (!bannerQ.length) {
    bannerBusy = false;
    return;
  }
  bannerBusy = true;
  ui.banner(bannerQ.shift());
  bannerTimer = setTimeout(nextBanner, 2500);
}

function stopBanners() {
  clearTimeout(bannerTimer);
  bannerQ = [];
  bannerBusy = false;
  ui.clearBanner();
}

function maybeNotifyTurn() {}

function applyState(m) {
  playback.accept(m);
  const prevHand = game.ballInHand, prevTurn = game.turn, prevOver = game.gameOver, prevConnected = game.connected;
  game.connected = m.connected.length === 2;
  ui.el('connection').textContent = game.connected ? '双人已连接' : '等待对手重连';
  if (game.started && prevConnected && !game.connected) ui.toast(t('rivalLeft'));
  if (game.started && !prevConnected && game.connected) ui.toast('双方已连接');
  game.turn = m.turn;
  game.settled = m.settled;
  game.cuePotted = m.cuePotted;
  game.shots = m.shots;
  game.groups = m.groups;
  game.gameOver = m.gameOver;
  game.winner = m.winner;
  game.ballInHand = m.ballInHand;

  for (const bs of m.balls) {
    const e = game.byNumber.get(bs.n);
    if (!e) continue;
    e.spr.spin.rotation += Math.hypot(bs.x - e.ball.tx, bs.y - e.ball.ty) * .025;
    e.ball.tx = bs.x;
    e.ball.ty = bs.y;
    if (m.settled) { e.ball.x = bs.x; e.ball.y = bs.y; }
    e.ball.potted = bs.p;
    for (const key of ['vx', 'vy', 'wx', 'wy', 'wz']) e.ball[key] = bs[key] || 0;

  }

  if (m.sfx && !document.hidden) {
    if (m.sfx.b > 0) audio.ballHit(m.sfx.b);
    if (m.sfx.r > 0) audio.railHit(m.sfx.r);
    for (let i = 0; i < m.sfx.p; i++) audio.pocket();
  }

  refreshHud();
  ui.updateTurn(game.mode, game.turn === game.myPlayer, game.ballInHand);

  if (m.turn !== prevTurn || (m.ballInHand && !prevHand)) {
    resetControls(); stopBanners();
    if (game.ballInHand) {
      const prefix = m.reason === 'scratch' ? '白球落袋犯规 · ' : '击球犯规 · ';
      queueBanner(prefix + (game.turn === game.myPlayer ? '你获得自由球' : '对手获得自由球'));
      ui.el('hint').textContent = t('placeCueHint'); ui.showHint();
    } else queueBanner(game.turn === game.myPlayer ? t('yourTurn') : t('rivalTurn'));
    if (game.turn === game.myPlayer) audio.turnChime();
  }
  if (!game.ballInHand) {
    placement.point = null; placement.pointer = null; placement.pending = false; placement.valid = false;
    if (prevHand) ui.toast('白球已摆好，可以瞄准击球');
  } else if (game.turn === game.myPlayer && !placement.point && !game.cue.potted) {
    placement.point = { x: game.cue.x, y: game.cue.y };
    placement.valid = validPlacement(game.cue.x, game.cue.y, game.balls, game.cue);
  }

  if (game.gameOver && !prevOver) showEndBanner();
  if (game.ballInHand && game.turn === game.myPlayer) ui.el('hint').textContent = t('placeCueHint');
}

function setupInput() {
  let pointer = null;
  const pos = e => {
    const rect = app.canvas.getBoundingClientRect();
    return { x: (e.clientX - rect.left) * CANVAS_W / rect.width, y: (e.clientY - rect.top) * CANVAS_H / rect.height };
  };
  function point(e) {
    if (!canShoot() || aim.pointer != null || aim.finePointer != null || ui.el('spin-modal').classList.contains('show')) return;
    const p = pos(e), dx = p.x - game.cue.x, dy = p.y - game.cue.y;
    if (Math.hypot(dx, dy) > BALL_R * 1.5) aim.angle = Math.atan2(dy, dx);
  }
  app.canvas.addEventListener('pointerdown', e => {
    if (e.isPrimary === false || aim.pointer != null) return;
    e.preventDefault();
    if (canPlaceCue()) {
      placement.before = placement.point ? { ...placement.point } : null;
      placement.pointer = e.pointerId; app.canvas.setPointerCapture(e.pointerId);
      const p = pos(e); previewCueAt(p.x, p.y); return;
    }
    if (!canShoot()) return;
    pointer = e.pointerId; app.canvas.setPointerCapture(e.pointerId); point(e);
  });
  app.canvas.addEventListener('pointermove', e => {
    if (e.pointerId === placement.pointer) { const p = pos(e); previewCueAt(p.x, p.y); }
    else if (e.pointerId === pointer) point(e);
  });
  app.canvas.addEventListener('pointerup', e => {
    if (e.pointerId === placement.pointer) {
      const p = pos(e); previewCueAt(p.x, p.y); placement.pointer = null;
      if (placement.valid) shareCuePlacement(); else ui.toast('请选择台面空位，不能与球或袋口重叠');
    } else if (e.pointerId === pointer) { point(e); pointer = null; }
  });
  const cancel = () => {
    pointer = null;
    if (placement.pointer != null) {
      placement.point = placement.before; placement.pointer = null;
      placement.valid = !!placement.point && validPlacement(placement.point.x, placement.point.y, game.balls, game.cue);
    }
  };
  app.canvas.addEventListener('pointercancel', cancel);
  app.canvas.addEventListener('lostpointercapture', cancel);
  window.addEventListener('blur', cancel);

}

function closeNet() {
  playback.clear();
  resetControls();
  if (game.net) {
    game.net.close();
    game.net = null;
  }
  game.started = false; game.connected = false;
}

function leaveGame() {
  const wasMulti = game.mode !== 'solo';
  closeNet();
  game.mode = 'solo';
  stopBanners();
  ui.backToMenu();
  history.replaceState(null, '', '/');
  if (wasMulti) ui.toast(t('youLeft'));
}

function onMessage(m) {
  if (m.type === 'start' && game.mode !== 'solo') {
    const first = !game.started;
    setupRack(); game.groups = m.groups; game.turn = m.turn; game.started = true;
    stopBanners(); ui.enterGame(game.mode);
    if (first) announceGroupAndTurn();
  } else if (m.type === 'state' && game.mode !== 'solo') applyState(m);
  else if (m.type === 'placeRejected') { placement.pending = false; placement.valid = false; ui.toast('这个位置不能摆放白球，请选择其他空位'); }
  else if (m.type === 'aim' && m.player !== game.myPlayer) { opponentAim.angle = m.angle; opponentAim.power = m.power; opponentAim.tip = clampTip(m.tip); }
}

function inviteUrl() {
  const url = new URL('/', location.href);
  url.searchParams.set('room', game.room);
  return url.href;
}
function readyRoom(code, player) {
  game.room = code; game.myPlayer = player;
  const url = inviteUrl();
  history.replaceState(null, '', url);
  ui.el('host-code').textContent = code;
  ui.el('invite-link').textContent = url;
  ui.el('btn-copy').disabled = false; ui.el('btn-share').disabled = false;
  ui.setStatus('host-status', '等待朋友加入 · 保持此页面打开');
}
function connectionError(code) {
  const messages = { full: '这张球桌已坐满两人，请另开一个房间', notFound: t('notFound'), busy: '球桌暂时已满，请稍后再试', replaced: '你已在另一页面入座，请使用那一页面' };
  const message = messages[code] || '连接失败，请返回首页后重试';
  ui.setStatus('host-status', message, true); ui.setStatus('join-status', message, true); ui.toast(message);
  game.connected = false;
}
function handlers() {
  return { ready: readyRoom, message: onMessage, error: connectionError,
    connected: () => ui.setStatus('join-status', t('waitingHost')),
    reconnecting: () => {
      game.connected = false;
      ui.el('connection').textContent = '正在重连…';
      ui.setStatus('host-status', '网络连接中断，正在重连…');
      ui.setStatus('join-status', '网络连接中断，正在重连…');
    },
  };
}
function startHost() {
  closeNet(); stopBanners(); game.mode = 'host'; game.myPlayer = 1;
  ui.el('host-code').textContent = '······'; ui.el('invite-link').textContent = '';
  ui.el('btn-copy').disabled = true; ui.el('btn-share').disabled = true;
  ui.setStatus('host-status', '正在准备球桌…');
  game.net = host(handlers());
}
function startJoin() {
  const code = ui.el('join-code').value.trim().toUpperCase();
  if (!/^[A-F0-9]{6}$/.test(code)) { ui.setStatus('join-status', t('code4'), true); return; }
  closeNet(); stopBanners(); game.mode = 'guest'; game.myPlayer = 2;
  ui.setStatus('join-status', t('connecting')); game.net = join(code, handlers());
}
async function copyInvite() {
  if (!game.room) return;
  try { await navigator.clipboard.writeText(inviteUrl()); ui.toast('邀请链接已复制，发给朋友就能入座'); }
  catch { ui.toast('请长按房间下方的链接复制'); }
}
async function fullscreen() {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.();
    await screen.orientation?.lock?.('landscape').catch(() => {});
  } catch { ui.toast('请旋转手机横屏游玩'); }
}
function wireMenu() {
  const click = (id, fn) => { ui.el(id).onclick = () => { audio.resume(); audio.uiClick(); fn(); }; };
  click('btn-settings', () => ui.el('rules-modal').classList.add('show'));
  click('btn-rules-close', () => ui.el('rules-modal').classList.remove('show'));
  document.querySelectorAll('[data-back]').forEach(b => { b.onclick = () => { closeNet(); history.replaceState(null, '', '/'); ui.showScreen(b.dataset.back); }; });
  click('btn-solo', () => {
    closeNet(); game.mode = 'solo'; history.replaceState(null, '', '/'); setupRack(); stopBanners();
    ui.el('connection').textContent = ''; ui.enterGame(game.mode); ui.updateTurn('solo'); ui.updateGroup('solo');
    ui.el('hint').textContent = t('aimHint');
  });
  click('btn-create', () => { ui.showScreen('screen-host'); startHost(); });
  click('btn-join', () => { ui.setStatus('join-status', ''); ui.showScreen('screen-join'); });
  click('btn-connect', startJoin);
  ui.el('join-code').addEventListener('keydown', e => { if (e.key === 'Enter') startJoin(); });
  click('btn-copy', copyInvite);
  click('btn-share', async () => {
    if (!game.room) return;
    if (!navigator.share) { await copyInvite(); return; }
    try { await navigator.share({ title: 'RainBow 台球', text: '球桌已准备好，和我来一局！', url: inviteUrl() }); }
    catch (e) { if (e.name !== 'AbortError') await copyInvite(); }
  });
  click('btn-fullscreen', fullscreen);
  click('btn-rotate-back', leaveGame);
  ui.el('btn-mute').onclick = () => { audio.resume(); audio.setMuted(!audio.isMuted()); ui.setMuteIcon(audio.isMuted()); };
  ui.el('btn-restart').onclick = async () => {
    const ok = await ui.confirm(t('confirmRestart')); if (!ok) return;
    if (game.mode !== 'solo') game.net.send({ type: 'restart' });
    else { setupRack(); stopBanners(); ui.showHint(); }
  };
  ui.el('btn-menu').onclick = async () => { if (await ui.confirm(t('confirmExit'))) leaveGame(); };
}

main().catch(error => {
  console.error(error);
  ui.toast('画面加载失败，请刷新页面或使用手机自带浏览器打开');
});
