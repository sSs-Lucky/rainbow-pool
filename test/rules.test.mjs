import test from 'node:test';
import assert from 'node:assert/strict';
import { adjudicateShot, isOnEight, validateEightCall } from '../src/shot-rules.js';
import { rack, placeCueExact } from '../src/physics.js';
import { HEAD_STRING } from '../src/config.js';
import { validPlacement } from '../src/geometry.js';

const open = { 1: null, 2: null };
const room = overrides => ({
  balls: rack(), groups: open, turn: 1, potted: [], breakRails: [], potPockets: {},
  firstHit: 1, railAfterHit: true, headFault: false, ...overrides,
});

test('legal break with a pocket keeps the shooter and leaves both groups open', () => {
  const result = adjudicateShot(room({ breaking: true, turn: 2, potted: [9, 1] }));
  assert.equal(result.turn, 2);
  assert.deepEqual(result.groups, open);
  assert.equal(result.breaking, false);
  assert.equal(result.reason, 'breakPot');
});
test('dry break needs four different object balls on cushions; breaking scratch is head-only', () => {
  const dry = adjudicateShot(room({ breaking: true, breakRails: [1, 2, 3, 4] }));
  assert.equal(dry.turn, 2);
  assert.equal(dry.breakDecision, null);
  const illegal = adjudicateShot(room({ breaking: true, breakRails: [1, 2, 3] }));
  assert.equal(illegal.turn, 2);
  assert.equal(illegal.breakDecision, 'illegalBreak');
  const scratch = adjudicateShot(room({ breaking: true, potted: [0, 5] }));
  assert.equal(scratch.turn, 2);
  assert.equal(scratch.ballInHand, true);
  assert.equal(scratch.placementZone, 'head');
  assert.deepEqual(scratch.groups, open);
});
test('black eight on the break offers a choice to the correct player and does not end the rack', () => {
  const legal = adjudicateShot(room({ breaking: true, potted: [8] }));
  assert.equal(legal.turn, 1);
  assert.equal(legal.breakDecision, 'breakEight');
  assert.equal(legal.gameOver, false);
  const foul = adjudicateShot(room({ breaking: true, potted: [8, 0] }));
  assert.equal(foul.turn, 2);
  assert.equal(foul.breakDecision, 'breakEightScratch');
  assert.equal(foul.gameOver, false);
});
test('the first legal pot sets either group without a call, including a mixed pot', () => {
  for (const shooter of [1, 2]) for (const potted of [[1, 9], [9, 1]]) {
    const result = adjudicateShot(room({ turn: shooter, potted }));
    assert.equal(result.turn, shooter);
    assert.equal(result.groups[shooter], potted[0] === 1 ? 'solids' : 'stripes');
    assert.notEqual(result.groups[1], result.groups[2]);
  }
});
test('declaring safety or fouling never assigns an open table', () => {
  const safety = adjudicateShot(room({ potted: [9], called: { safety: true } }));
  assert.deepEqual(safety.groups, open);
  assert.equal(safety.turn, 2);
  assert.equal(safety.ballInHand, false);
  const result = adjudicateShot(room({ potted: [9, 0] }));
  assert.deepEqual(result.groups, open);
  assert.equal(result.turn, 2);
  assert.equal(result.placementZone, 'table');
  assert.equal(result.ballInHand, true);
});
test('a legal own-group pot keeps the turn without a call; wrong first ball grants ball in hand', () => {
  const groups = { 1: 'solids', 2: 'stripes' };
  const shot = { groups, potted: [1] };
  assert.equal(adjudicateShot(room(shot)).turn, 1);
  assert.equal(adjudicateShot(room({ ...shot, potted: [9] })).turn, 2);
  const foul = adjudicateShot(room({ ...shot, firstHit: 9 }));
  assert.equal(foul.turn, 2);
  assert.equal(foul.reason, 'wrongFirst');
  assert.equal(foul.ballInHand, true);
  assert.equal(foul.placementZone, 'table');
});
test('the cleared group must make the called black eight, and scratching on it loses', () => {
  const shot = { onEight: true, firstHit: 8, called: { ball: 8, pocket: 0 }, potted: [8], potPockets: { 8: 0 } };
  assert.equal(adjudicateShot(room(shot)).winner, 1);
  assert.equal(adjudicateShot(room({ ...shot, potted: [0, 8] })).reason, 'eightFoul');
  assert.equal(adjudicateShot(room({ ...shot, potPockets: { 8: 1 } })).reason, 'wrongEightPocket');
  assert.equal(adjudicateShot(room({ ...shot, called: null })).reason, 'wrongEightPocket');
  assert.equal(adjudicateShot(room({ ...shot, onEight: false })).winner, 2);
});
test('eight is playable after the group is cleared and its pocket must be valid', () => {
  const balls = rack();
  assert.equal(isOnEight(balls, 'solids'), false);
  assert.equal(isOnEight(balls, null), false);
  for (const call of [null, { safety: true }, { ball: 9, pocket: 0 }, { ball: 8, pocket: '0' }, { ball: 8, pocket: 6 }]) {
    assert.equal(validateEightCall(call), null);
  }
  for (const b of balls) if (b.number >= 1 && b.number <= 7) b.potted = true;
  assert.equal(isOnEight(balls, 'solids'), true);
  assert.equal(isOnEight(balls, 'stripes'), false);
  assert.equal(isOnEight(balls, null), false);
  assert.deepEqual(validateEightCall({ ball: 8, pocket: 5 }), { ball: 8, pocket: 5 });
});
test('free-ball placement respects the opening line, table and existing balls', () => {
  const balls = rack(), cue = balls[0], apex = balls[1];
  cue.potted = true;
  const original = structuredClone(cue);
  for (const [x, y] of [[0, 280], [530, 20], [apex.x, apex.y], [NaN, 250]]) {
    assert.equal(placeCueExact(cue, balls, x, y), false);
    assert.deepEqual(cue, original);
  }
  assert.equal(validPlacement(HEAD_STRING, 420, balls, cue, 'head'), false);
  assert.equal(validPlacement(HEAD_STRING - .1, 420, balls, cue, 'head'), true);
  assert.equal(placeCueExact(cue, balls, 180, 420), true);
  assert.equal(placeCueExact(cue, balls, 880, 160), true);
});
