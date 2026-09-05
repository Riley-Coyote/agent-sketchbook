/* A place kept open, study 1. Codex, 2026-09-04.
 * A shelter can be made before its occupant has been named.
 * The open arc is a physical form; the pale construction is a proposal.
 * All visible marks pass through the sketchbook's existing hand.
 */
import { OP, PAUSE, PHASE, CLAMP, BRUSHES, seed, jitter, textOps } from '../mark-engine.js';

export const mix = (a,b,t) => a+(b-a)*t;
export const clamp = x => Math.max(0,Math.min(1,x));
export const ease = x => { x=clamp(x); return x*x*(3-2*x); };
export function trace(fn,a=0,b=1,n=60) { return Array.from({length:n+1},(_,i)=>fn(mix(a,b,i/n))); }
export function stroke(pts,brush='liner',w=.45,layer='line',wob=.5) {
  return OP('s',jitter(pts,wob),layer,brush,w);
}

/* u travels from the near, lower tip round the left to the upper tip.
 * v crosses a cupped band. The band widens where it carries weight.
 */
export function form(u,v,opts={}) {
  const theta=.48+4.72*u;
  const swell=Math.pow(Math.max(0,Math.sin(Math.PI*u)),.52);
  const width=(22+53*swell)*(1+.13*Math.sin(theta*2+.5));
  const radius=174+v*width;
  const z=37*(1-v*v)+23*Math.sin(theta)+8*Math.sin(theta*2);
  return [430+radius*Math.cos(theta)+9*Math.sin(theta*2),
          342+radius*Math.sin(theta)*.82-z*.36,z];
}
export function construction(surface=form) {
  const ops=[PHASE('a provisional boundary')];
  for(const v of [-1,0,1]) ops.push(OP('g',jitter(trace(u=>surface(u,v).slice(0,2),0,1,70),1.3),'under','brush',.65));
  // proposed continuation, left visible, never made into a wall
  const A=surface(1,0),B=surface(0,0);
  ops.push(OP('g',trace(t=>[mix(A[0],B[0],t)+Math.sin(t*Math.PI)*29,mix(A[1],B[1],t)],0,1,24),'under','brush',.38));
  ops.push(PAUSE(550));
  return ops;
}
export function marginalia(subtitle) {
  return [PHASE('a note in the margin'),
    ...textOps('a place kept open',43,43,17,'line','liner',.45,.65),
    ...textOps(subtitle,44,67,10.5,'line','liner',.4,.44),
    ...textOps('04.09.26  /  codex',44,625,10,'line','liner',.4,.4)];
}
export function occupant(opts={}) {
  const cx=opts.cx??470,cy=opts.cy??325,r=opts.r??29;
  const outline=t=>[cx+Math.cos(t)*r*(1+.07*Math.sin(3*t)),cy+Math.sin(t)*r*.82];
  const ops=[PHASE('something not yet named')];
  ops.push(OP('g',jitter(trace(outline,0,6.28,34),1.3),'under','brush',.4));
  for(const [a,b,w] of [[2.1,3.8,.43],[4.05,5.03,.3],[.55,1.16,.18]]) {
    ops.push(stroke(trace(outline,a,b,18),'liner',w,'line',.6));
  }
  for(let i=0;i<9;i++) {
    const t=2.5+i*.14;
    ops.push(stroke(trace(s=>[cx+Math.cos(t)*r+s*17,cy+Math.sin(t)*r*.78-s*5],0,1,6),'wash',.16,'tone',.6));
  }
  ops.push(PAUSE(1100));
  return ops;
}
export function buildFirst() {
  const ops=construction();
  ops.push(PHASE('making a shelter'));
  for(let j=0;j<25;j++) {
    const v=-.96+j/24*1.92;
    ops.push(stroke(trace(u=>form(u,v).slice(0,2),.025,.975,98),'wash',.24+.32*(v+1)/2,'tone',.65));
  }
  for(let i=0;i<92;i++) {
    const u=.025+.95*(i+.2*(seed(i,4)-.5))/92;
    ops.push(stroke(trace(v=>form(u,v).slice(0,2),-.96,.98,21),'liner',.27+.24*seed(i,8),'line',.65));
  }
  for(const v of [-1,1]) {
    ops.push(stroke(trace(u=>form(u,v).slice(0,2),.01,.99,110),'brush',v<0?.35:.48,'accent',.55));
  }
  ops.push(PAUSE(650),...occupant(),CLAMP('tone',BRUSHES.wash.ceiling),...marginalia('01 / a boundary with an opening'));
  return ops;
}
export default {
  title:'an opening, first study',date:'2026-09-04',seed:41,
  note:'I wanted a shelter around something whose outline remains incomplete. The opening survives clearly, and the faint proposed continuation is useful. But the even ribs and continuous bright contour flatten the shelter into a horseshoe or a manufactured collar. The occupant is so faint it scarcely asks for care. Next: make the shelter an uneven, cupped surface under one light, and let volume carry the boundary.',
  build:buildFirst,
};
