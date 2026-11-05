import test from 'node:test';
import assert from 'node:assert/strict';
import { rack, shoot, step, allStopped, evolveCloth, resolveBallCollision, resolveCushion, energy, clampTip, placeCue } from '../src/physics.js';
import { PHYSICAL_R as R, PIXELS_PER_METRE as SCALE, BALL_MASS as M, BALL_RESTITUTION as E, GRAVITY as G, SLIDING_FRICTION as MU } from '../src/config.js';
import { POCKETS, CUSHION_SEGMENTS, validPlacement } from '../src/geometry.js';
const ball = (x=280,y=280,number=0) => ({x,y,number,vx:0,vy:0,wx:0,wy:0,wz:0,potted:false});
const near = (a,b,tol=1e-8) => assert.ok(Math.abs(a-b)<tol, `${a} ≈ ${b}`);

test('sliding-to-rolling transition obeys 5/7 speed and no-slip constraint', () => {
  const b=ball(); b.vx=1;
  const t=2/(7*MU*G); evolveCloth(b,t);
  near(b.vx,5/7); near(b.wy,b.vx/R); near(b.vy+R*b.wx,0);
  const before=energy(b); evolveCloth(b,.3); assert.ok(energy(b)<before);
});
test('tip offset obeys angular impulse, safe circle and fixed energy budget', () => {
  const center=ball(),spin=ball(); shoot(center,1,0,.5); shoot(spin,1,0,.5,{x:.3,y:.4});
  near(energy(center),energy(spin)); near(R*spin.wy/spin.vx,1); near(R*spin.wz/spin.vx,.75);
  near(Math.hypot(...Object.values(clampTip({x:1,y:1}))),.5);
});
test('level side spin does not invent a free-flight sideways curve', () => {
  const b=ball(); shoot(b,1,0,.3,{x:.5,y:0});
  for(let i=0;i<60;i++) evolveCloth(b,1/60);
  near(b.y,280); near(b.vy,0); near(b.wx,0);
});
test('ball collisions conserve planar momentum and dissipate energy', () => {
  let seed=9472;const rand=()=>((seed=(1664525*seed+1013904223)>>>0)/2**32);
  for(let i=0;i<1200;i++) {
    const a=ball(),b=ball(304,280,1), angle=rand()*Math.PI*2,nx=Math.cos(angle),ny=Math.sin(angle);
    for(const p of [a,b]) {p.vx=(rand()-.5)*8;p.vy=(rand()-.5)*8;p.wx=(rand()-.5)*300;p.wy=(rand()-.5)*300;p.wz=(rand()-.5)*300;}
    const before=energy(a)+energy(b),px=a.vx+b.vx,py=a.vy+b.vy;
    resolveBallCollision(a,b,nx,ny);
    near(a.vx+b.vx,px);near(a.vy+b.vy,py);assert.ok(energy(a)+energy(b)<=before+1e-9);
  }
  const a=ball(),b=ball(304,280,1);a.vx=1;resolveBallCollision(a,b,1,0);near(a.vx,(1-E)/2);near(b.vx,(1+E)/2);
});
test('draw reverses cue motion after a short straight hit; follow keeps moving forward', () => {
  const after = top => {
    const a=ball(),b=ball(322,280,1);shoot(a,1,0,.35,{x:0,y:top});
    let hit=false;
    for(let i=0;i<60;i++) {const r=step([a,b]);if(r.hits.some(h=>h.type==='ball'))hit=true;if(hit&&i>25)return a.vx;}
    throw new Error('No contact');
  };
  assert.ok(after(-.5)<-.2);assert.ok(after(.5)>.2);
});
test('raised-nose cushion changes side-spin rebound symmetrically and never creates energy', () => {
  const left=ball(),right=ball();left.vx=right.vx=1;left.vy=right.vy=1;left.wz=50;right.wz=-50;
  resolveCushion(left,0,-1);resolveCushion(right,0,-1);
  assert.ok(Math.abs(left.vx-right.vx)>.1);assert.ok(left.vy<0&&right.vy<0);
  const plain=ball();plain.vy=2;resolveCushion(plain,0,-1,.85,0);near(plain.vy,-1.7,1e-6);
  let seed=4271;const rand=()=>((seed=(1664525*seed+1013904223)>>>0)/2**32);
  for(let i=0;i<1500;i++) {
    const b=ball();b.vx=(rand()-.5)*10;b.vy=.05+rand()*5;b.wx=(rand()-.5)*450;b.wy=(rand()-.5)*450;b.wz=(rand()-.5)*450;
    const e=energy(b);resolveCushion(b,0,-1);assert.ok(energy(b)<=e+1e-8, `${energy(b)} <= ${e}`);assert.ok(b.vy<=1e-6,'must leave cushion');
  }
});
test('six pocket openings admit balls, while jaws reject grazing shots', () => {
  for(const p of POCKETS) {
    const d=Math.hypot(p.dx,p.dy),b=ball(p.x-p.dx/d*100,p.y-p.dy/d*100);shoot(b,p.dx,p.dy,.3);
    for(let i=0;i<180&&!b.potted;i++)step([b]);assert.ok(b.potted,`pocket ${p.x},${p.y}`);
  }
  assert.equal(CUSHION_SEGMENTS.filter(s=>s.jaw).length,12);
  const b=ball(506,100);shoot(b,0,-1,.3);let jaw=false;
  for(let i=0;i<60;i++){const r=step([b]);jaw ||= r.hits.some(h=>h.jaw);}
  assert.ok(!b.potted);assert.ok(jaw,'sloped mouth face must participate in collision');
});
test('break settles, all live balls stay on cloth or in a pocket channel, placement is safe', () => {
  const balls=rack();shoot(balls[0],1,.04,1,{x:.2,y:-.3});let frames=0;
  while(!allStopped(balls)&&frames<6000){step(balls);frames++;}
  assert.ok(frames<6000);for(const b of balls)if(!b.potted){assert.ok(b.x>=8&&b.x<=1052&&b.y>=-2&&b.y<=562,`${b.number}: ${b.x},${b.y}`);}
  assert.ok(placeCue(balls[0],balls,balls[2].x,balls[2].y));assert.ok(validPlacement(balls[0].x,balls[0].y,balls,balls[0]));
});

test('720 oblique spin shots stay inside the table and never gain kinetic energy', () => {
  for(let i=0;i<720;i++) {
    const a=i*Math.PI*2/720,b=ball(280+(i%3)*200,150+(i%4)*80);
    shoot(b,Math.cos(a),Math.sin(a),.4+(i%4)*.2,{x:Math.cos(a*3)*.35,y:Math.sin(a*3)*.35});
    let prior=energy(b),frame=0;
    for(;frame<5000&&!allStopped([b]);frame++) {
      step([b]);const next=energy(b);assert.ok(next<=prior+1e-7,`energy increased, shot ${i}`);prior=next;
      if(!b.potted)assert.ok(b.x>=0&&b.x<=1060&&b.y>=0&&b.y<=560,`escaped at shot ${i}: ${b.x}, ${b.y}`);
    }
    assert.ok(frame<5000);
  }
});
