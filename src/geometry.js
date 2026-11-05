import { CUSHION, TABLE_W, TABLE_H, BALL_R, POCKET_R } from './config.js';

const L = CUSHION, R = L + TABLE_W, T = CUSHION, B = T + TABLE_H, M = (L + R) / 2;
const corner = 36, side = 29, back = 18;

// Each cushion is a trapezoid. Its three exposed edges are the collision boundary;
// the fourth, rear edge is inside the wooden rail. Render and simulation share it.
const topLeft = [[L + 12, T - back], [M - 19, T - back], [M - side, T], [L + corner, T]];
const left = [[L - back, T + 12], [L, T + corner], [L, B - corner], [L - back, B - 12]];
const reflectX = p => p.map(([x, y]) => [L + R - x, y]);
const reflectY = p => p.map(([x, y]) => [x, T + B - y]);
export const CUSHION_POLYGONS = [topLeft, reflectX(topLeft), reflectY(topLeft), reflectY(reflectX(topLeft)), left, reflectX(left)];
export const CUSHION_SEGMENTS = CUSHION_POLYGONS.flatMap((poly, index) => {
  // Vertical cushions' back edge is last→first; horizontal cushions' back is first→second.
  const edges = index < 4 ? [[1, 2], [2, 3], [3, 0]] : [[0, 1], [1, 2], [2, 3]];
  return edges.map(([a, b]) => {
    const [ax, ay] = poly[a], [bx, by] = poly[b], dx = bx - ax, dy = by - ay;
    const length = Math.hypot(dx, dy);
    // Use polygon winding: a corner jaw's outward normal does not necessarily
    // point towards the far-away table centre.
    const area = poly.reduce((sum, p, i) => { const q = poly[(i + 1) % poly.length]; return sum + p[0] * q[1] - q[0] * p[1]; }, 0);
    const sign = Math.sign(area), nx = sign * dy / length, ny = -sign * dx / length;
    return { ax, ay, bx, by, nx, ny, length, jaw: Math.abs(dx) > 0 && Math.abs(dy) > 0 };
  });
});
export const POCKETS = [
  { x: L, y: T, dx: -1, dy: -1 }, { x: M, y: T - 10, dx: 0, dy: -1 }, { x: R, y: T, dx: 1, dy: -1 },
  { x: L, y: B, dx: -1, dy: 1 }, { x: M, y: B + 10, dx: 0, dy: 1 }, { x: R, y: B, dx: 1, dy: 1 },
];
export function pocketAt(x, y) {
  return POCKETS.find(p => Math.hypot(x - p.x, y - p.y) < POCKET_R - 5);
}
export function closestOnSegment(x, y, s) {
  const dx = s.bx - s.ax, dy = s.by - s.ay;
  const t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (y - s.ay) * dy) / (s.length * s.length)));
  return { x: s.ax + t * dx, y: s.ay + t * dy, t };
}
export function validPlacement(x, y, balls, cue) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  if (x < L + BALL_R || x > R - BALL_R || y < T + BALL_R || y > B - BALL_R || pocketAt(x, y)) return false;
  if (CUSHION_SEGMENTS.some(s => { const p = closestOnSegment(x, y, s); return Math.hypot(x - p.x, y - p.y) < BALL_R - 1e-6; })) return false;
  return !balls.some(b => b !== cue && !b.potted && Math.hypot(x - b.x, y - b.y) < BALL_R * 2 + .1);
}
