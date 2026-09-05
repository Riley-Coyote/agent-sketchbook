/* Study 3: tonal restraint and the first relationship between the forms. */
import { OP, PHASE, PAUSE, CLAMP, BRUSHES, seed, jitter } from '../mark-engine.js';
import { trace, stroke, ease, marginalia, construction } from './codex-open-01.js';
import { shellPoint, shellSample, body } from './codex-open-02.js';

export function quietBody() {
  return body({uN:160,vN:69,lighting:{bucket:.085,gamma:1.7,
    passes:l=>{
      const p=[];
      if(l>.025)p.push(['wash',.09+.3*l,'tone']);
      if(l>.49)p.push(['brush',.055+.13*l,'accent']);
      return p;
    },
  }});
}
export function rim() {
  const ops=[PHASE('a lip with lost and found edges')];
  for(const [v,a,b,w] of [[1,.08,.25,.66],[1,.32,.45,.5],[1,.49,.59,.69],[1,.63,.8,.66],[1,.86,.97,.37],[-1,.12,.29,.33],[-1,.36,.43,.3],[-1,.58,.76,.46],[-1,.83,.94,.32]])
    ops.push(stroke(trace(u=>shellPoint(u,v).slice(0,2),a,b,38),'liner',w,'line',.6));
  return ops;
}
export function ribs() {
  const ops=[PHASE('growth follows the cup')];
  for(let i=0;i<83;i++) {
    const u=.055+.9*(i+seed(i,7)*.63)/83;
    const a=-.98+seed(i,2)*.13,b=.55+seed(i,4)*.44;
    const pts=trace(v=>shellPoint(u+.003*Math.sin(v*4+i),v).slice(0,2),a,b,24);
    ops.push(stroke(pts,'liner',.25+seed(i,6)*.22,'line',.49));
    if(i%3===0)ops.push(stroke(pts.map(p=>[p[0]+1.25,p[1]+.8]),'eraser',.16,'accent',.3));
  }
  return ops;
}
export function unknown(opts={}) {
  const cx=opts.cx??468,cy=opts.cy??402,rx=opts.rx??43,ry=opts.ry??31;
  const ops=[PHASE('the unfinished form has weight')];
  const at=(a,r=1)=>[cx+Math.cos(a)*rx*r*(1+.13*Math.sin(a*3+.8)),cy+Math.sin(a)*ry*r*(1+.08*Math.cos(a*4))];
  // Its lower-left is observed more closely; the far-right never resolves.
  for(let i=0;i<22;i++) {
    const a=2.2+i/22*2.57;
    const p=trace(r=>at(a+.2*(1-r),r),.35,.96,10);
    ops.push(stroke(p,'wash',.18+.09*Math.sin(i*.13),'tone',.55));
    if(i%2===0)ops.push(stroke(p,'liner',.39,'line',.35));
  }
  for(const [a,b,w] of [[1.88,2.8,.8],[2.86,3.5,.74],[3.63,4.46,.67],[4.64,5.02,.41],[.66,1.28,.29]])
    ops.push(stroke(trace(t=>at(t),a,b,18),'liner',w,'line',.55));
  for(let i=0;i<8;i++){
    const a=1.98+i*.13;
    ops.push(stroke(trace(r=>at(a+.18*Math.sin(r*3),r),.64,.92,12),'brush',.13,'accent',.4));
  }
  // An alternative contour remains a question, not the final perimeter.
  ops.push(OP('g',jitter(trace(a=>at(a,1.12),4.7,7.15,32),.7),'under','brush',.5));
  return ops;
}
export function buildThird() {
  return [...construction(shellPoint),PHASE('fewer overlapping passes'),...quietBody(),
    CLAMP('accent',.72),...ribs(),...rim(),PAUSE(800),...unknown(),
    CLAMP('tone',BRUSHES.wash.ceiling),...marginalia('03 / making room for weight')];
}
export default {
  title:'making room for weight',date:'2026-09-04',refs:[2],seed:43,
  note:'Reducing the density and width of the bright passes recovered the surface. Moving the incomplete form downward gives it weight against the inner fold. The repeated radial lines still look engineered, though, and the upper end is blunt. Next: vary the grain, soften the tip, and give the shelter a history of wear and repair. The opening should become a real absence rather than a nearly completed circle.',
  build:buildThird,
};
