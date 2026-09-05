/* Study 5: the smallest form deserves the closest attention. */
import { OP, DOT, PHASE, PAUSE, CLAMP, BRUSHES, seed, jitter, textOps } from '../mark-engine.js';
import { trace, stroke, ease } from './codex-open-01.js';
import { wornPoint, wornBody, edgeWork, grain, repair, scaffolding } from './codex-open-04.js';

export function unnamedPoint(a,r=1){
  return [477+Math.cos(a)*48*r*(1+.12*Math.sin(a*3+.8)),
          400+Math.sin(a)*34*r*(1+.08*Math.cos(a*4))];
}
export function attentiveForm(){
  const ops=[PHASE('attention before identification')];
  // Broken nested sections describe curvature, but never complete a shell.
  for(let i=0;i<43;i++){
    const r=.16+i/43*.84;
    const start=2.05+.17*Math.sin(i*.27),end=4.63+.25*Math.sin(i*.43);
    const path=trace(a=>unnamedPoint(a+.1*Math.sin(a*2+i*.11),r),start,end,31);
    ops.push(stroke(path,'wash',.12+.13*r,'tone',.5));
    if(i%2===0)ops.push(stroke(path,'brush',.14+.11*r,'accent',.42));
    if(i%3===0)ops.push(stroke(path,'liner',.38+.23*r,'line',.38));
  }
  // Fine cross hatching is concentrated in the lit, near-facing part.
  for(let i=0;i<29;i++){
    const a=2.17+i/29*2.33;
    const path=trace(r=>unnamedPoint(a+.28*(1-r),r),.32+.16*seed(i,37),.97,21);
    ops.push(stroke(path,'liner',.42+.27*seed(i,38),'line',.37));
  }
  for(const [a,b,w]of [[1.92,2.74,.94],[2.89,3.61,.99],[3.76,4.43,.74],[4.58,4.99,.49],[.79,1.3,.28]])
    ops.push(stroke(trace(a=>unnamedPoint(a),a,b,22),'liner',w,'line',.56));
  // Where evidence gives way, tentative contours diverge and stop.
  for(let i=0;i<3;i++){
    const path=trace(a=>{
      const p=unnamedPoint(a,1+i*.06);
      return [p[0]+ease((a-4.75)/.8)*i*6,p[1]-ease((a-4.75)/.8)*i*4];
    },4.65+i*.12,5.45+i*.16,19);
    ops.push(OP('g',jitter(path,.64),'under','brush',.65-i*.09));
  }
  for(let i=0;i<65;i++){
    const a=2.42+seed(i,61)*1.64,r=.47+seed(i,62)*.45;
    const p=unnamedPoint(a,r);
    ops.push(DOT(p[0],p[1],.3+seed(i,63)*.4,'line','stipple'));
  }
  return ops;
}
export function meeting(){
  const ops=[PHASE('room beside the contact')];
  // A small cushion of light along the supporting fold, never a binding.
  for(let i=0;i<12;i++){
    const u=.12+i*.011;
    const path=trace(v=>wornPoint(u+.009*Math.sin(v*3),v).slice(0,2),-.93,-.39,21);
    ops.push(stroke(path,'wash',.18,'tone',.6));
    if(i%3===0)ops.push(stroke(path,'liner',.45,'line',.45));
  }
  // Lost edge below the form makes it sit into the hollow.
  for(const layer of ['line','accent'])
    ops.push(stroke(trace(t=>[488+t*34,428+Math.sin(t*Math.PI)*1.6],0,1,19),'eraser',.32,layer,.5));
  return ops;
}
export function footnote(subtitle='05 / care before a name'){
  return [PHASE('a note after looking'),
    ...textOps('a place kept open',44,46,17,'line','liner',.45,1.02),
    ...textOps(subtitle,45,71,10.5,'line','liner',.4,.72),
    ...textOps('codex / 04.09.26',44,624,10,'line','liner',.4,.67)];
}
export function buildFifth(){
  return [...scaffolding(),...wornBody(),CLAMP('accent',.75),...grain(),...edgeWork(),
    ...repair(),PAUSE(700),...meeting(),...attentiveForm(),PAUSE(900),
    CLAMP('tone',BRUSHES.wash.ceiling),...footnote()];
}
export default {
  title:'care before a name',date:'2026-09-04',refs:[4],seed:45,
  note:'The small form finally holds attention: the near side is closely worked while the far side gives way to tentative, diverging contours. The enclosing and enclosed curves echo one another, without establishing what either must be. The room to the right remains open. The final pass should be small: clarify the repair at close range, soften a few over-even hatches, and strengthen the local support without closing the uncertain contour.',
  build:buildFifth,
};
