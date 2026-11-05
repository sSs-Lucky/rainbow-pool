import { step } from './physics.js';

// Animate between authoritative snapshots with the same collision solver.
// This is visual-only: fouls, pockets, turns and free balls remain server decisions.
export class SnapshotPlayback {
  constructor() { this.clear(); }
  clear() { this.byNumber = new Map(); this.balls = []; this.active = false; this.frames = 0; }
  accept(state) {
    this.active = !state.settled; this.frames = 0;
    this.balls = state.balls.map(b => ({ number: b.n, x: b.x, y: b.y, potted: b.p,
      vx: b.vx || 0, vy: b.vy || 0, wx: b.wx || 0, wy: b.wy || 0, wz: b.wz || 0 }));
    this.byNumber = new Map(this.balls.map(b => [b.number, b]));
  }
  tick() {
    // Bound prediction to 150 ms. A prolonged outage must not invent a new board.
    if (!this.active || this.frames >= 9) return;
    step(this.balls); this.frames++;
  }
  get(number) { return this.byNumber.get(number); }
}
