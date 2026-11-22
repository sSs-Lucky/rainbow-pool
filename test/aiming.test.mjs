import test from 'node:test';
import assert from 'node:assert/strict';
import { traceAim, powerFromPull, fineAngle, tipFromPoint, predictDirections } from '../src/aiming.js';
import { cuePose, cueTravel, cueAimGap, startCueStroke, cueStrokeFrame } from '../src/cue-motion.js';
import { BALL_R, CUSHION, TABLE_W, POCKET_CAPTURE_R } from '../src/config.js';
const cue = { x: 280, y: 280, number: 0 };
test('aim guide stops at the first live ball and reports its departure direction', () => {
  const far = { x: 700, y: 280, number: 2 }, near = { x: 500, y: 280, number: 1 };
  const result = traceAim(cue, [cue, far, near], 0);
  assert.equal(result.target.number, 1);
  assert.equal(result.end.x, near.x - 2 * BALL_R);
  assert.equal(result.end.y, cue.y);
  assert.deepEqual(result.objectDirection, { x: 1, y: 0 });
});
test('guide respects cushions, misses, potted balls and balls behind the cue', () => {
  const result = traceAim(cue, [{ x: 500, y: 320, number: 1 }, { x: 510, y: 280, number: 2, potted: true }, { x: 100, y: 280, number: 3 }], 0);
  assert.equal(result.target, null);
  assert.equal(result.end.x, CUSHION + TABLE_W - BALL_R);
  assert.ok(Math.abs(traceAim(cue, [], Math.PI / 2).end.x - cue.x) < 1e-8);
});
test('vertical power drag is independent of horizontal aiming and clamps at both ends', () => {
  assert.equal(powerFromPull(50, 50, 100), 0);
  assert.equal(powerFromPull(50, 100, 100), .5);
  assert.equal(powerFromPull(50, 200, 100), 1);
  assert.equal(powerFromPull(50, 10, 100), 0);
  assert.equal(powerFromPull(50, 100, 0), 0);
  assert.equal(powerFromPull(NaN, 100, 20), 0);
});

test('fine aiming preserves 0.02 degrees per pixel and tip input stays in the safe half-radius circle', () => {
  assert.ok(Math.abs(fineAngle(1, 25) - 1 - Math.PI / 360) < 1e-10);
  assert.deepEqual(tipFromPoint(0, -25, 100), { x: 0, y: .25 });
  const tip = tipFromPoint(100, -100, 100);
  assert.ok(Math.abs(Math.hypot(tip.x, tip.y) - .5) < 1e-10);
  assert.ok(tip.x > 0 && tip.y > 0);
});
test('a geometric guide reaches side pocket throats rather than an invisible rectangular wall', () => {
  const guide = traceAim({ x: 530, y: 280 }, [], -Math.PI / 2);
  assert.ok(guide.pocket); assert.equal(guide.cushion, null);
  assert.ok(Math.abs(guide.end.y - (guide.pocket.y + POCKET_CAPTURE_R)) < 1e-8);
});

const stationary = (x,y,number) => ({ x,y,number,vx:0,vy:0,wx:0,wy:0,wz:0,potted:false });
test('stable direction preview works before charging and never mutates the live table', () => {
  const balls=[stationary(280,280,0),stationary(450,280,1)], original=structuredClone(balls);
  const prediction=predictDirections(balls[0],balls,0,{x:0,y:0});
  assert.equal(prediction.trace.target.number,1);
  assert.ok(prediction.objectDirection.x>.999); assert.ok(Math.abs(prediction.objectDirection.y)<1e-8);
  assert.deepEqual(balls,original);
});
test('cut-shot direction uses the collision solver and mirrors for the opposite cut', () => {
  const predict=y=>{const balls=[stationary(280,280,0),stationary(450,y,1)];return predictDirections(balls[0],balls,0,{x:0,y:0}).objectDirection;};
  const a=predict(292),b=predict(268);
  assert.ok(a.y>.4);assert.ok(b.y<-.4);assert.ok(Math.abs(a.x-b.x)<1e-7);assert.ok(Math.abs(a.y+b.y)<1e-7);
});
test('the stable guide has no spurious target when aiming at an open cushion', () => {
  const balls=[stationary(280,280,0),stationary(450,320,1)];
  assert.equal(predictDirections(balls[0],balls,0).objectDirection,null);
});

test('after group assignment the guide blocks a wrong first ball even when it screens a legal target', () => {
  const white = stationary(280, 280, 0);
  const tip = { x: 0, y: 0 };
  for (const [group, own, rival] of [['solids', 1, 9], ['stripes', 9, 1]]) {
    const balls = [white, stationary(550, 280, own), stationary(450, 280, rival)];
    const blocked = predictDirections(white, balls, 0, tip, group);
    assert.equal(blocked.trace.target.number, rival);
    assert.equal(blocked.blocked, true);
    assert.equal(blocked.objectDirection, null);
    assert.equal(predictDirections(white, balls, 0).blocked, false, 'open-table aim stays available');
    assert.equal(predictDirections(white, balls, Math.PI / 2, tip, group).blocked, false, 'bank shots are available');

    balls[2].potted = true;
    const legal = predictDirections(white, balls, 0, tip, group);
    assert.equal(legal.trace.target.number, own);
    assert.equal(legal.blocked, false);
    assert.ok(legal.objectDirection.x > .999);
  }
});

test('black eight is an aiming target only after clearing the group, including at immediate contact', () => {
  const white = stationary(280, 280, 0);
  const eight = stationary(280 + 2 * BALL_R, 280, 8);
  const tip = { x: 0, y: 0 };
  const early = predictDirections(white, [white, eight], 0, tip, 'solids');
  assert.equal(early.trace.distance, 0);
  assert.equal(early.blocked, true);
  assert.equal(predictDirections(white, [white, eight], Math.PI, tip, 'solids').blocked, false);
  assert.equal(predictDirections(white, [white, eight], 0, tip, 'solids', true).blocked, false);
  const rival = stationary(450, 280, 9);
  assert.equal(predictDirections(white, [white, rival], 0, tip, 'solids', true).blocked, true);
});

test('cue release starts from the charged position, touches the ball and retracts visibly', () => {
  const stroke = startCueStroke(1000, .8, 85);
  assert.deepEqual(cueStrokeFrame(stroke, 1000), { gap: cueAimGap(.8, 85), alpha: 1 });
  assert.ok(cueStrokeFrame(stroke, stroke.impactAt - 10).gap > 0);
  assert.equal(Math.abs(cueStrokeFrame(stroke, stroke.impactAt).gap), 0);
  const follow = cueStrokeFrame(stroke, stroke.impactAt + 60);
  const recovery = cueStrokeFrame(stroke, stroke.impactAt + 175);
  assert.ok(follow.gap < 0 && recovery.gap > follow.gap);
  assert.equal(recovery.alpha, 1);
  const fade = cueStrokeFrame(stroke, stroke.impactAt + 340);
  assert.ok(fade.gap > recovery.gap && fade.alpha > 0 && fade.alpha < 1);
  assert.equal(cueStrokeFrame(stroke, stroke.impactAt + 400), null);
});

test('cue contact follows the selected spin point and cushion shots keep visible shaft travel', () => {
  const tip = { x: .3, y: .4 };
  const point = cuePose(cue, Math.PI / 2, tip, 0);
  assert.ok(Math.abs(point.x - (cue.x - tip.x * BALL_R)) < 1e-9);
  assert.ok(Math.abs(point.y - (cue.y - BALL_R * Math.sqrt(.75))) < 1e-9);

  const bounds = { left: -30, right: 1100, top: -20, bottom: 580 };
  const nearRail = { x: 530, y: 42 };
  const travel = cueTravel(nearRail, Math.PI / 2, bounds);
  assert.ok(travel > 0 && travel < 85);
  assert.ok(cuePose(nearRail, Math.PI / 2, { x: 0, y: 0 }, cueAimGap(1, travel)).y >= bounds.top + 36);
  assert.equal(cueTravel(cue, 0, bounds), 85);
});
