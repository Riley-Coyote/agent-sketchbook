/* Study 2: replacing the diagram with a cupped, asymmetrical surface.
 * Reuses the first page's construction and mark vocabulary; changes the form.
 */
import { OP, PHASE, PAUSE, CLAMP, BRUSHES, seed, jitter } from '../mark-engine.js';
import { norm, cross, shadeParam } from './lib.js';
import { trace, stroke, ease, marginalia, construction, occupant } from './codex-open-01.js';

export function shellPoint(u,v,opts={}) {
  const theta=.33+4.92*u;
  const belly=Math.pow(Math.max(0,Math.sin(Math.PI*u)),.66);
  const width=(5+86*belly)*(1+.21*Math.sin(theta+.7));
  const radius=173+13*Math.sin(theta*2-.3)+v*width;
  const x=431+radius*Math.cos(theta)+42*Math.pow(1-u,8);
  const y=351+radius*Math.sin(theta)*.86;
  const cup=58*v*v-24*v;
  const z=18*Math.sin(theta*1.3)+cup*belly+18*Math.sin(theta)*v;
  return [x,y-z*.28,z];
}
export function shellSample(u,v,opts={}) {
  const p=shellPoint(u,v*2-1,opts);
  const a=shellPoint(Math.min(1,u+.0001),v*2-1,opts);
  const b=shellPoint(u,Math.min(1,v*2-1+.0001),opts);
  let n=norm(cross(a.map((x,i)=>x-p[i]),b.map((x,i)=>x-p[i])));
  if(n[2]<0)n=n.map(x=>-x);
  return {p,n};
}
export function body(opts={}) {
  const sample=opts.sample||shellSample;
  const uN=opts.uN||190,vN=opts.vN||124;
  const light=norm([-.52,-.61,.6]);
  const shaded=shadeParam(sample,uN,vN,light,.36,{
    lamp:[120,30,310],lampFall:590,ambient:.015,gain:.78,bucket:.045,
    gamma:1.22,modulate:(p,n)=>(.94+.06*Math.sin(p[0]*.025+p[1]*.014)),
    ...(opts.lighting||{}),
  });
  return shaded.ops;
}
export function buildSecond() {
  const ops=construction(shellPoint);
  ops.push(PHASE('turning a boundary into a surface'),...body(),PAUSE(700));
  // Broken contours, weighted toward the lamp. Endpoints may disappear.
  for(const [v,a,b,w] of [[1,.13,.37,.44],[1,.45,.74,.6],[1,.79,.94,.27],[-1,.2,.46,.24],[-1,.61,.92,.32]])
    ops.push(stroke(trace(u=>shellPoint(u,v).slice(0,2),a,b,54),'liner',w,'line',.48));
  ops.push(PHASE('folds that follow the cup'));
  for(let i=0;i<37;i++) {
    const u=.07+.86*(i+seed(i,7)*.55)/37;
    const a=-.8+seed(i,2)*.3,b=.35+seed(i,4)*.6;
    ops.push(stroke(trace(v=>shellPoint(u,v).slice(0,2),a,b,26),'liner',.15+seed(i,6)*.18,'line',.5));
  }
  ops.push(PAUSE(700),...occupant({cx:465,cy:326,r:33}),CLAMP('tone',BRUSHES.wash.ceiling),...marginalia('02 / a surface takes the light'));
  return ops;
}
export default {
  title:'a surface takes the light',date:'2026-09-04',refs:[1],seed:42,
  note:'The asymmetrical curl and recessed interior give the boundary volume. But dense overlapping passes bleach the upper surface and lower rim; more sampling has erased detail instead of adding it. The little incomplete oval also floats without a relationship to the shelter. Next: recover a middle tonal range, interrupt the surface marks, and place the uncertain form nearer a supporting fold.',
  build:buildSecond,
};
