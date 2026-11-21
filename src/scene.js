import { Container, Graphics, Sprite, Texture, FillGradient } from 'pixi.js';
import { CANVAS_W, CANVAS_H, CUSHION, HEAD_STRING, TABLE_W, TABLE_H, BALL_R, POCKET_R, BALL_COLORS } from './config.js';
import { pocketPositions } from './physics.js';
import { predictDirections } from './aiming.js';
import { CUSHION_POLYGONS } from './geometry.js';

export function drawTable() {
  const g = new Graphics();

  const wood = new FillGradient({
    type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 },
    colorStops: [{ offset: 0, color: 0x5b3a2a }, { offset: 0.5, color: 0x30221d }, { offset: 1, color: 0x171311 }],
    textureSpace: 'local',
  });
  g.roundRect(0, 0, CANVAS_W, CANVAS_H, 16).fill(wood);
  g.roundRect(3, 3, CANVAS_W - 6, CANVAS_H - 6, 13).stroke({ width: 2, color: 0xffe2b0, alpha: 0.18 });

  g.rect(CUSHION - 8, CUSHION - 8, TABLE_W + 16, TABLE_H + 16).fill(0x0b5138);

  const cloth = new FillGradient({
    type: 'radial',
    innerCenter: { x: 0.5, y: 0.42 }, innerRadius: 0.04,
    outerCenter: { x: 0.5, y: 0.5 }, outerRadius: 0.66,
    colorStops: [{ offset: 0, color: 0x168457 }, { offset: 0.7, color: 0x0d754a }, { offset: 1, color: 0x075335 }],
    textureSpace: 'local',
  });
  g.rect(CUSHION, CUSHION, TABLE_W, TABLE_H).fill(cloth);


  const dots = [];
  for (const f of [0.25, 0.5, 0.75]) {
    dots.push([CUSHION + TABLE_W * f, CUSHION / 2], [CUSHION + TABLE_W * f, CANVAS_H - CUSHION / 2]);
  }
  dots.push([CUSHION / 2, CUSHION + TABLE_H / 2], [CANVAS_W - CUSHION / 2, CUSHION + TABLE_H / 2]);
  for (const [x, y] of dots) {
    g.circle(x, y, 3.5).fill(0xfff0cf);
    g.circle(x, y, 3.5).stroke({ width: 1, color: 0x4a3a1f, alpha: 0.5 });
  }

  for (const p of pocketPositions()) {
    g.circle(p.x, p.y, POCKET_R + 6).fill({ color: 0x000000, alpha: 0.4 });
    g.circle(p.x, p.y, POCKET_R + 3).fill(0x4a3a1f);
    g.circle(p.x, p.y, POCKET_R + 3).stroke({ width: 2, color: 0xd9b15a, alpha: 0.7 });
    const hole = new FillGradient({
      type: 'radial', innerCenter: { x: 0.5, y: 0.4 }, innerRadius: 0, outerCenter: { x: 0.5, y: 0.5 }, outerRadius: 0.5,
      colorStops: [{ offset: 0, color: 0x101010 }, { offset: 1, color: 0x000000 }], textureSpace: 'local',
    });
    g.circle(p.x, p.y, POCKET_R).fill(hole);
  }


  // Nose edges and sloping jaws exactly match geometry.js, including the openings.
  for (const polygon of CUSHION_POLYGONS) {
    g.poly(polygon.flat()).fill(0x125e40).stroke({ width: 1.3, color: 0x239a61, alpha: .85 });
    const inner = polygon.slice(1, 4);
    g.moveTo(inner[0][0], inner[0][1]).lineTo(inner[1][0], inner[1][1]).lineTo(inner[2][0], inner[2][1])
      .stroke({ width: 3.2, color: 0x003b29, alpha: .65 });
  }
  return g;
}

// Static textures for renderers that do not support the WebGL sphere material.
function ballTexture(number, color) {
  const size = BALL_R * 2 + 8, scale = 5;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size * scale;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale); ctx.translate(size / 2, size / 2);
  ctx.save(); ctx.beginPath(); ctx.arc(0, 0, BALL_R, 0, Math.PI * 2); ctx.clip();
  const hex = '#' + color.toString(16).padStart(6, '0');
  ctx.fillStyle = number >= 9 || number === 0 ? '#fffef7' : hex;
  ctx.fillRect(-BALL_R, -BALL_R, BALL_R * 2, BALL_R * 2);
  if (number >= 9) { ctx.fillStyle = hex; ctx.fillRect(-BALL_R, -BALL_R * .53, BALL_R * 2, BALL_R * 1.06); }
  const sheen = ctx.createRadialGradient(-4, -5, 0, 0, 0, BALL_R * 1.2);
  sheen.addColorStop(0, 'rgba(255,255,255,.34)');
  sheen.addColorStop(.48, 'rgba(255,255,255,0)');
  sheen.addColorStop(.83, 'rgba(0,0,0,.02)');
  sheen.addColorStop(1, 'rgba(0,0,0,.25)');
  ctx.fillStyle = sheen; ctx.fillRect(-BALL_R, -BALL_R, BALL_R * 2, BALL_R * 2);
  ctx.restore();
  ctx.beginPath(); ctx.arc(0, 0, BALL_R - .35, 0, Math.PI * 2);
  ctx.strokeStyle = number === 8 ? '#59616d' : 'rgba(255,255,255,.7)'; ctx.lineWidth = .7; ctx.stroke();
  if (number) {
    ctx.beginPath(); ctx.arc(0, 0, BALL_R * .47, 0, Math.PI * 2); ctx.fillStyle = '#fffdf4'; ctx.fill();
    ctx.fillStyle = '#111922'; ctx.font = `900 ${number < 10 ? 10.5 : 9.5}px Arial`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(number), 0, .6);
  }
  ctx.beginPath(); ctx.ellipse(-3.5, -5.2, 3.1, 1.6, -.6, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,.72)'; ctx.fill();
  return Texture.from(canvas);
}
export function createFlatBalls() {
  return BALL_COLORS.map((color, number) => {
    const visual = new Container();
    const shadow = new Graphics().ellipse(2, 3, BALL_R * 1.04, BALL_R * .9).fill({ color: 0x001b14, alpha: .35 });
    const face = new Sprite(ballTexture(number, color));
    face.anchor.set(.5); face.width = face.height = BALL_R * 2 + 8;
    visual.addChild(shadow, face);
    return visual;
  });
}
export function buildCueVisual() {
  const cue = new Container();
  const gradient = stops => new FillGradient({
    type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, textureSpace: 'local',
    colorStops: stops.map(([offset, color]) => ({ offset, color })),
  });
  const shadow = new Graphics().poly([-352, 3, -344, 13, -4, 5, 0, 2]).fill({ color: 0x00120f, alpha: .38 });
  const stick = new Graphics();
  stick.poly([-347, -7, -347, 7, -10, 2.4, -10, -2.4])
    .fill(gradient([[0, 0x101926], [.32, 0x59748f], [.5, 0x293d52], [.76, 0x142432], [1, 0x090e18]]));
  stick.poly([-239, -5.3, -239, 5.3, -95, 3.5, -95, -3.5])
    .fill(gradient([[0, 0x252149], [.32, 0x7561a2], [.53, 0x302d60], [.81, 0x26304e], [1, 0x151a2e]]));
  stick.poly([-178, -.5, -205, -3.2, -231, -.5, -205, 3.2]).fill(0x60cde7);
  stick.poly([-190, -.5, -205, -1.8, -220, -.5, -205, 1.8]).fill(0xe7fbff);
  stick.poly([-336, -6.8, -336, 6.8, -251, 5.5, -251, -5.5]).fill(0x111925);
  for (let x = -333; x <= -260; x += 5) {
    stick.moveTo(x, -4.8).lineTo(x + 4, 0).lineTo(x, 4.8);
  }
  stick.stroke({ color: 0x8396b5, width: .9, alpha: .55 });
  const metal = gradient([[0, 0x536585], [.33, 0xf2f6f5], [.63, 0x85a7bc], [1, 0x263656]]);
  for (const [x, radius, width] of [[-348, 7, 11], [-255, 5.8, 6], [-242, 5.5, 3], [-99, 3.7, 6], [-17, 2.65, 12]]) {
    stick.roundRect(x, -radius, width, radius * 2, 1.2).fill(metal);
  }
  stick.rect(-246, -5.4, 3, 10.8).fill(0x86bcff);
  stick.moveTo(-93, -1.9).lineTo(-18, -1).stroke({ color: 0xd5f7ff, width: .95, alpha: .86 });
  stick.roundRect(-5, -2.5, 5, 5, 1.4).fill(0x4ebedc);
  stick.moveTo(-3.5, -1.35).lineTo(-.8, -1.35).stroke({ color: 0xabf4ff, width: .8 });
  cue.addChild(shadow, stick);
  return cue;
}
function dashedLine(g, x1, y1, x2, y2, color, alpha = .8) {
  const len = Math.hypot(x2 - x1, y2 - y1), dx = (x2 - x1) / len, dy = (y2 - y1) / len;
  for (let t = 0; t < len; t += 15) {
    const end = Math.min(t + 8, len);
    g.moveTo(x1 + dx * t, y1 + dy * t).lineTo(x1 + dx * end, y1 + dy * end);
  }
  g.stroke({ width: 1.7, color, alpha });
}
const guideCache = new WeakMap();
export function clearAim(g) { g.clear(); guideCache.delete(g); }
export function drawAim(g, cue, balls, angle, _power = 0, tip = { x: 0, y: 0 }) {
  // Neither power nor animation time is part of the key: pulling the bar cannot move this guide.
  const key = `${angle}:${tip.x}:${tip.y}:` + balls.map(b => `${b.number},${b.x},${b.y},${b.potted}`).join(';');
  if (guideCache.get(g) === key) return;
  guideCache.set(g, key); g.clear();
  const { trace, objectDirection: d } = predictDirections(cue, balls, angle, tip);
  dashedLine(g, cue.x, cue.y, trace.end.x, trace.end.y, 0xf5ffef, .9);
  g.circle(trace.end.x, trace.end.y, BALL_R).stroke({ width: 2, color: 0xf3fff2, alpha: .85 });
  if (!trace.target || !d) return;
  const target = trace.target, start = { x: target.x + d.x * (BALL_R + 3), y: target.y + d.y * (BALL_R + 3) };
  const end = { x: target.x + d.x * 108, y: target.y + d.y * 108 };
  g.circle(target.x, target.y, BALL_R + 3).stroke({ color: 0xffdc70, width: 2, alpha: .9 });
  // A short direction indicator, not a long animated path or a promise of unobstructed travel.
  g.moveTo(start.x, start.y).lineTo(end.x, end.y).stroke({ width: 3.4, color: 0xffdc70, alpha: .95 });
  const size = 10;
  g.poly([end.x, end.y, end.x - size * d.x - size * .48 * d.y, end.y - size * d.y + size * .48 * d.x,
    end.x - size * d.x + size * .48 * d.y, end.y - size * d.y - size * .48 * d.x]).fill(0xffdc70);
}

export function drawPlacement(g, point, valid, headOnly = false) {
  g.clear();
  if (headOnly) dashedLine(g, HEAD_STRING, CUSHION, HEAD_STRING, CUSHION + TABLE_H, 0xf8e6a1, .68);
  if (!point) return;
  const color = valid ? 0xa9f6a4 : 0xff6474;
  g.circle(point.x, point.y, BALL_R + 8).stroke({ width: 2, color, alpha: .9 });
  g.circle(point.x, point.y, BALL_R).fill({ color: 0xfffef7, alpha: .85 }).stroke({ width: 1.5, color });
  g.circle(point.x - 3, point.y - 4, 3).fill({ color: 0xffffff, alpha: .8 });
  if (!valid) {
    g.moveTo(point.x - 5, point.y - 5).lineTo(point.x + 5, point.y + 5).moveTo(point.x + 5, point.y - 5).lineTo(point.x - 5, point.y + 5).stroke({ width: 2, color: 0xc22239 });
  }
}

export function drawCall(g, ball, pocket) {
  g.clear();
  if (ball) g.circle(ball.x, ball.y, BALL_R + 5).stroke({ width: 2, color: 0x9befff, alpha: .9 });
  if (pocket) g.circle(pocket.x, pocket.y, POCKET_R + 5).stroke({ width: 3, color: 0x9befff, alpha: .9 });
}
