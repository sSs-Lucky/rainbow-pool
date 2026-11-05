import { BALL_R, MAX_TIP_OFFSET } from './config.js';
import { CUSHION_SEGMENTS, POCKETS } from './geometry.js';
import { shoot, evolveCloth, resolveBallCollision } from './physics.js';

export function powerFromPull(start, current, travel) {
  if (![start, current, travel].every(Number.isFinite) || travel <= 0) return 0;
  return Math.min(1, Math.max(0, (current - start) / travel));
}
export const fineAngle = (angle, pixels) => angle + pixels * Math.PI / 180 * .02;
export function tipFromPoint(x, y, radius) {
  if (![x, y, radius].every(Number.isFinite) || radius <= 0) return { x: 0, y: 0 };
  const length = Math.hypot(x, y), factor = length > radius * MAX_TIP_OFFSET ? radius * MAX_TIP_OFFSET / length : 1;
  return { x: x * factor / radius, y: -y * factor / radius };
}
function circleHit(x, y, dx, dy, cx, cy, radius) {
  const rx = cx - x, ry = cy - y, along = rx * dx + ry * dy;
  const perpendicular2 = rx * rx + ry * ry - along * along;
  if (along <= 0 || perpendicular2 > radius * radius) return Infinity;
  const hit = along - Math.sqrt(Math.max(0, radius * radius - perpendicular2));
  return hit > .001 ? hit : Infinity;
}
export function traceAim(cue, balls, angle, maxLength = 1100) {
  const dx = Math.cos(angle), dy = Math.sin(angle);
  let distance = maxLength, target = null, cushion = null, pocket = null;
  const accept = (hit, obj, kind) => {
    if (hit > .001 && hit < distance) { distance = hit; target = kind === 'ball' ? obj : null; cushion = kind === 'rail' ? obj : null; pocket = kind === 'pocket' ? obj : null; }
  };
  for (const s of CUSHION_SEGMENTS) {
    const v = dx * s.nx + dy * s.ny;
    if (v < -1e-9) {
      const hit = (BALL_R - (cue.x - s.ax) * s.nx - (cue.y - s.ay) * s.ny) / v;
      const px = cue.x + hit * dx - BALL_R * s.nx, py = cue.y + hit * dy - BALL_R * s.ny;
      const along = ((px - s.ax) * (s.bx - s.ax) + (py - s.ay) * (s.by - s.ay)) / s.length;
      if (along >= 0 && along <= s.length) accept(hit, s, 'rail');
    }
    for (const [cx, cy] of [[s.ax, s.ay], [s.bx, s.by]]) accept(circleHit(cue.x, cue.y, dx, dy, cx, cy, BALL_R), s, 'rail');
  }
  for (const p of POCKETS) accept(circleHit(cue.x, cue.y, dx, dy, p.x, p.y, 17), p, 'pocket');
  for (const b of balls) if (b.number !== cue.number && !b.potted) accept(circleHit(cue.x, cue.y, dx, dy, b.x, b.y, 2 * BALL_R), b, 'ball');
  const end = { x: cue.x + dx * distance, y: cue.y + dy * distance };
  let objectDirection = null;
  if (target) { const x = target.x - end.x, y = target.y - end.y, len = Math.hypot(x, y); objectDirection = { x: x / len, y: y / len }; }
  return { end, target, cushion, pocket, distance, objectDirection };
}
// A direction aid uses one fixed reference strike, never the live power slider.
// Only the initial collision is shown; this is not a prediction of travel distance.
export function predictDirections(cue, balls, angle, tip = { x: 0, y: 0 }) {
  const trace = traceAim(cue, balls, angle);
  if (!trace.target) return { trace, objectDirection: null };
  const start = { ...cue };
  shoot(start, Math.cos(angle), Math.sin(angle), Math.pow(.65, 1.35), tip);
  const dx = Math.cos(angle), dy = Math.sin(angle);
  const advance = t => { const b = { ...start }; evolveCloth(b, t); return b; };
  const distance = b => (b.x - cue.x) * dx + (b.y - cue.y) * dy;
  let low = 0, high = 8;
  if (distance(advance(high)) < trace.distance) return { trace, objectDirection: null };
  // Exact piecewise cloth integration, then solve flight time to the geometric contact.
  for (let i = 0; i < 24; i++) { const mid = (low + high) / 2; if (distance(advance(mid)) < trace.distance) low = mid; else high = mid; }
  const moving = advance(high), target = { ...trace.target };
  moving.x = trace.end.x; moving.y = trace.end.y; evolveCloth(target, high);
  const nx = target.x - moving.x, ny = target.y - moving.y, length = Math.hypot(nx, ny);
  resolveBallCollision(moving, target, nx / length, -ny / length);
  const speed = Math.hypot(target.vx, target.vy);
  return { trace, objectDirection: speed > 1e-8 ? { x: target.vx / speed, y: -target.vy / speed } : null };
}
