export const REST_ORIENTATION = Object.freeze([0, 0, 0, 1]);

// The solver uses a right-handed frame: X right, Y up the table, Z toward the camera.
// Left-multiply by the rotation in world space, then renormalize to limit drift.
export function rotateOrientation(orientation, x, y, z) {
  const angle = Math.hypot(x, y, z);
  if (angle < 1e-12) return orientation;
  const [a, b, c, d] = orientation;
  const half = angle / 2;
  const scale = Math.sin(half) / angle;
  const i = x * scale, j = y * scale, k = z * scale, w = Math.cos(half);
  const next = [
    w * a + i * d + j * c - k * b,
    w * b - i * c + j * d + k * a,
    w * c + i * b - j * a + k * d,
    w * d - i * a - j * b - k * c,
  ];
  const norm = Math.hypot(...next);
  return next.map(value => value / norm);
}
