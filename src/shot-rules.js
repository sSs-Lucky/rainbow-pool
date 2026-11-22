import { POCKETS } from './geometry.js';

export const groupOf = n => n === 0 ? 'cue' : n === 8 ? 'eight' : n < 8 ? 'solids' : 'stripes';
export const otherPlayer = n => n === 1 ? 2 : 1;
const otherGroup = group => group === 'solids' ? 'stripes' : 'solids';

export const BREAK_CHOICES = {
  illegalBreak: ['accept', 'rebreak', 'returnBreak'],
  breakEight: ['spot', 'rebreak'],
  breakEightScratch: ['spotInHand', 'rebreak'],
  breakFoul: ['accept', 'headInHand'],
};

export function isOnEight(balls, group) {
  return !balls.some(b => !b.potted && b.number !== 0 && b.number !== 8 && (!group || groupOf(b.number) === group));
}

function legalFirstBall(number, group, onEight) {
  if (onEight) return number === 8;
  const targetGroup = groupOf(number);
  return group ? targetGroup === group : targetGroup === 'solids' || targetGroup === 'stripes';
}

export function isBlockedTarget(number, group, onEight) {
  return number != null && group != null && !legalFirstBall(number, group, onEight);
}

export function validateEightCall(call) {
  if (call?.ball !== 8 || !Number.isInteger(call.pocket) || !POCKETS[call.pocket]) return null;
  return { ball: 8, pocket: call.pocket };
}

function breakResult(room, next) {
  const shooter = room.turn;
  const scratch = room.potted.includes(0);
  if (room.potted.includes(8)) {
    const foul = scratch || room.headFault;
    const decision = foul ? 'breakEightScratch' : 'breakEight';
    return { turn: foul ? next : shooter, breakDecision: decision, reason: decision };
  }
  if (scratch) return { turn: next, ballInHand: true, placementZone: 'head', reason: 'breakScratch' };
  if (room.headFault) return { turn: next, breakDecision: 'breakFoul', reason: 'breakFoul' };
  if (room.potted.length) return { turn: shooter, reason: 'breakPot' };
  if (room.breakRails.length >= 4) return { turn: next, reason: 'dryBreak' };
  return { turn: next, breakDecision: 'illegalBreak', reason: 'illegalBreak' };
}

// Break and foul rules follow WPA; this game only calls an intended pocket for the eight.
export function adjudicateShot(room) {
  const shooter = room.turn, next = otherPlayer(shooter), mine = room.groups[shooter];
  const result = { turn: next, groups: room.groups, breaking: false, breakDecision: null,
    ballInHand: false, placementZone: 'table', gameOver: false, winner: null, reason: '' };
  if (room.breaking) return { ...result, ...breakResult(room, next) };

  const scratch = room.potted.includes(0);
  const first = room.firstHit;
  const wrongFirst = first != null && !legalFirstBall(first, mine, room.onEight);
  const foul = scratch ? 'scratch' : first == null ? 'noHit' : room.headFault ? 'headFoul' :
    wrongFirst ? 'wrongFirst' : !room.potted.length && !room.railAfterHit ? 'noRail' : '';
  const called = room.called;
  if (room.potted.includes(8)) {
    const call = validateEightCall(called);
    const win = !foul && room.onEight && call && room.potPockets[8] === call.pocket;
    return { ...result, turn: shooter, gameOver: true, winner: win ? shooter : next,
      reason: win ? 'win' : !room.onEight ? 'earlyEight' : foul ? 'eightFoul' : 'wrongEightPocket' };
  }
  if (foul) return { ...result, ballInHand: true, reason: foul };
  if (called?.safety) return { ...result, reason: 'safety' };
  if (room.onEight) return result;

  const pot = room.potted.find(n => n !== 0 && n !== 8 && (!mine || groupOf(n) === mine));
  if (pot == null) return result;
  if (mine) return { ...result, turn: shooter };

  // Pots are collected in simulation order, so a mixed pot assigns the first one.
  const group = groupOf(pot);
  return { ...result, turn: shooter, groups: { [shooter]: group, [next]: otherGroup(group) }, reason: 'groupsSet' };
}
