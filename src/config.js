export const TABLE_W = 1000;
export const TABLE_H = 500;
export const CUSHION = 30;

export const CANVAS_W = TABLE_W + CUSHION * 2;
export const CANVAS_H = TABLE_H + CUSHION * 2;

export const BALL_R = 12;
export const POCKET_R = 22;

// Physical values use SI units. Screen positions use pixels (see PHYSICS.md).
export const PHYSICS_VERSION = 3;
export const PHYSICAL_R = 0.028575;
export const BALL_MASS = 0.170097;
export const PIXELS_PER_METRE = BALL_R / PHYSICAL_R;
export const GRAVITY = 9.81;
export const SLIDING_FRICTION = 0.2;
export const ROLLING_FRICTION = 0.01;
export const SPIN_DECELERATION = 10 * GRAVITY / 9;
export const WALL_RESTITUTION = 0.85;
export const CUSHION_FRICTION = 0.2;
export const CUSHION_NOSE_HEIGHT = 1.4; // height above slate, in ball radii
export const BALL_RESTITUTION = 0.94;
export const MAX_SHOT_SPEED = 7; // m/s at centre-ball; UI energy limit
export const MAX_TIP_OFFSET = 0.5; // fraction of ball radius, avoids miscue region
export const POWER_CURVE = 1.6;

export const MAX_DRAG = 210;
export const MIN_DRAG = 10;

export const BALL_COLORS = [
  0xfffef7,
  0xffce18, 0x1767ff, 0xf52a43, 0x9e39ef, 0xff841b, 0x07b863, 0x9d292b, 0x10151d,
  0xffce18, 0x1767ff, 0xf52a43, 0x9e39ef, 0xff841b, 0x07b863, 0x9d292b,
];
