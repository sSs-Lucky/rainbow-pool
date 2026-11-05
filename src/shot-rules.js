const groupOf = n => n === 0 ? 'cue' : n === 8 ? 'eight' : n < 8 ? 'solids' : 'stripes';
const opposite = n => n === 1 ? 2 : 1;

// Pure adjudication shared with regression tests; the server owns the result.
export function adjudicateShot(room) {
  const shooter = room.turn, mine = room.groups[shooter];
  const remaining = room.balls.filter(b => groupOf(b.number) === mine && !b.potted).length;
  const scratch = room.potted.includes(0);
  const clearedBefore = remaining + room.potted.filter(n => groupOf(n) === mine).length === 0;
  const wrongFirst = room.firstHit == null || (clearedBefore ? room.firstHit !== 8 : groupOf(room.firstHit) !== mine);
  const noRail = !room.potted.length && !room.railAfterHit;
  const foul = scratch || wrongFirst || noRail;
  if (room.potted.includes(8)) {
    const winner = clearedBefore && !foul ? shooter : opposite(shooter);
    return { turn: shooter, ballInHand: false, gameOver: true, winner, reason: winner === shooter ? 'win' : 'earlyEight' };
  }
  const keep = !foul && room.potted.some(n => groupOf(n) === mine);
  return { turn: keep ? shooter : opposite(shooter), ballInHand: foul, gameOver: false, winner: null,
    reason: scratch ? 'scratch' : wrongFirst ? 'wrongFirst' : noRail ? 'noRail' : '' };
}
