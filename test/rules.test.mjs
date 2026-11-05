import test from 'node:test';
import assert from 'node:assert/strict';
import { adjudicateShot } from '../src/shot-rules.js';
import { rack, placeCueExact } from '../src/physics.js';
const room=()=>({balls:rack(),groups:{1:'solids',2:'stripes'},turn:1,potted:[],firstHit:1,railAfterHit:true});
test('scratch hands the entire table to the opponent, even if the shooter pockets their own ball',()=>{
  for(const turn of [1,2]){
    const r=room();r.turn=turn;r.firstHit=turn===1?1:9;r.potted=[0,r.firstHit];
    for(const b of r.balls)if(r.potted.includes(b.number))b.potted=true;
    const result=adjudicateShot(r);
    assert.equal(result.turn,turn===1?2:1);assert.equal(result.ballInHand,true);assert.equal(result.reason,'scratch');assert.equal(result.gameOver,false);
  }
});
test('legal own-ball pocket keeps the turn; scratch with black eight loses the rack',()=>{
  const r=room();r.potted=[1];r.balls.find(b=>b.number===1).potted=true;
  assert.equal(adjudicateShot(r).turn,1);assert.equal(adjudicateShot(r).ballInHand,false);
  r.potted=[0,8];r.firstHit=8;for(const b of r.balls)if(b.number<=8)b.potted=true;
  assert.equal(adjudicateShot(r).winner,2);assert.equal(adjudicateShot(r).gameOver,true);
});
test('exact free-ball placement accepts either half and rejects obstacles without moving the cue',()=>{
  const balls=rack(),cue=balls[0];cue.potted=true;
  const original=structuredClone(cue);
  for(const [x,y] of [[0,280],[530,20],[750,280],[NaN,250]]){assert.equal(placeCueExact(cue,balls,x,y),false);assert.deepEqual(cue,original);}
  assert.equal(placeCueExact(cue,balls,180,420),true);assert.equal(cue.x,180);assert.equal(cue.potted,false);
  assert.equal(placeCueExact(cue,balls,880,160),true);assert.equal(cue.x,880);assert.equal(cue.y,160);
});
