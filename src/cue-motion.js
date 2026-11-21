import { BALL_R } from './config.js';

const REST_GAP = 7;
const FOLLOW_MS = 64;
const RECOVERY_MS = 310;

export function cuePose(position, angle, tip, gap) {
  const dx = Math.cos(angle), dy = Math.sin(angle);
  const side = tip.x * BALL_R;
  const distance = BALL_R * Math.sqrt(1 - tip.x ** 2 - tip.y ** 2) + gap;
  return { x: position.x - dx * distance - dy * side, y: position.y - dy * distance + dx * side };
}

export function cueTravel(position, angle, bounds) {
  const dx = Math.cos(angle), dy = Math.sin(angle);
  const edgeDistance = Math.min(
    dx > 0 ? (position.x - bounds.left) / dx : dx < 0 ? (position.x - bounds.right) / dx : Infinity,
    dy > 0 ? (position.y - bounds.top) / dy : dy < 0 ? (position.y - bounds.bottom) / dy : Infinity,
  );
  // Leave enough of the shaft on screen when the white ball is close to a cushion.
  return Math.min(85, Math.max(0, edgeDistance - BALL_R - REST_GAP - 36));
}

export function cueAimGap(power, travel) {
  return REST_GAP + power * travel;
}

export function startCueStroke(now, power, travel) {
  return {
    startedAt: now,
    impactAt: now + 76 + 48 * power,
    pull: cueAimGap(power, travel),
    followThrough: 6 + 20 * power,
    recoveryGap: cueAimGap(.72, travel),
  };
}

export function cueStrokeFrame(stroke, now) {
  const sinceImpact = now - stroke.impactAt;
  if (sinceImpact < 0) {
    const t = Math.max(0, (now - stroke.startedAt) / (stroke.impactAt - stroke.startedAt));
    return { gap: stroke.pull * (1 - t ** 2), alpha: 1 };
  }
  if (sinceImpact < FOLLOW_MS) {
    const t = sinceImpact / FOLLOW_MS;
    return { gap: -stroke.followThrough * (1 - (1 - t) ** 2), alpha: 1 };
  }
  const t = (sinceImpact - FOLLOW_MS) / RECOVERY_MS;
  if (t >= 1) return null;
  const eased = t * t * (3 - 2 * t);
  return {
    gap: -stroke.followThrough + (stroke.recoveryGap + stroke.followThrough) * eased,
    alpha: Math.min(1, (1 - t) / .22),
  };
}
