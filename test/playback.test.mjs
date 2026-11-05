import test from 'node:test';
import assert from 'node:assert/strict';
import { SnapshotPlayback } from '../src/playback.js';
const snapshot=(settled=false)=>({settled,balls:[{n:0,x:990,y:280,p:false,vx:2,vy:0,wx:0,wy:0,wz:0}]});
test('visual playback uses cushion collisions instead of drawing balls through the rail',()=>{
  const playback=new SnapshotPlayback(),state=snapshot(),copy=structuredClone(state);playback.accept(state);
  for(let i=0;i<9;i++)playback.tick();
  const b=playback.get(0);assert.ok(b.x<=1018);assert.ok(b.vx<0,'must rebound at the right cushion');
  assert.deepEqual(state,copy,'authoritative state must not be changed');
});
test('a missing packet has a bounded prediction window and the next snapshot is authoritative',()=>{
  const playback=new SnapshotPlayback();playback.accept(snapshot());for(let i=0;i<9;i++)playback.tick();
  const x=playback.get(0).x;for(let i=0;i<120;i++)playback.tick();assert.equal(playback.get(0).x,x);
  const settled=snapshot(true);settled.balls[0].x=700;settled.balls[0].vx=0;
  playback.accept(settled);playback.tick();assert.equal(playback.get(0).x,700);assert.equal(playback.get(0).vx,0);
});
