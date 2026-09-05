/* Final synthesis. Every visible mark still belongs to the sketchbook hand.
 * More detail is useful only where it makes the relationship more legible.
 */
import { OP, DOT, PHASE, PAUSE, CLAMP, BRUSHES, seed, textOps } from '../mark-engine.js';
import { trace, stroke } from './codex-open-01.js';
import { wornPoint, wornBody, edgeWork, grain, repair, scaffolding } from './codex-open-04.js';
import { attentiveForm, meeting, footnote } from './codex-open-05.js';

export function wornIntervals(){
  const ops=[PHASE('some marks are allowed to fall away')];
  // Lost portions of the old regular hatching reveal the changing material.
  for(let i=0;i<31;i++){
    const u=.25+.56*seed(i,121),v=-.5+1.22*seed(i,122);
    const p=trace(t=>wornPoint(u+t*.018,v+.027*Math.sin(t*4+i)).slice(0,2),0,1,10);
    ops.push(stroke(p,'eraser',.1+seed(i,123)*.12,'line',.46));
  }
  // A few branching surface creases, drawn from the same surface coordinates.
  for(let i=0;i<9;i++){
    const u=.61+i*.026,v=.08+.33*seed(i,141);
    const p=trace(t=>wornPoint(u+.012*t+.002*Math.sin(t*9),v+t*.39).slice(0,2),0,1,17);
    ops.push(stroke(p,'eraser',.15,'accent',.36));
    ops.push(stroke(p.map(p=>[p[0]-1,p[1]+.65]),'liner',.4,'line',.49));
  }
  return ops;
}
export function threadDetail(){
  const ops=[PHASE('the repair is an act, not a seamless surface')];
  for(let i=0;i<5;i++){
    const v=.16+i*.16,u=.393+.011*Math.sin(v*5)+.003*Math.sin(v*19);
    const a=wornPoint(u-.01,v).slice(0,2),b=wornPoint(u+.01,v+.017).slice(0,2);
    // Dark punctures and an uneven doubled thread crossing the open split.
    for(const p of [a,b]){
      for(const layer of ['line','accent','tone'])ops.push(DOT(p[0],p[1],1.3,layer,'eraser'));
    }
    const p=trace(t=>[(1-t)*a[0]+t*b[0]+Math.sin(t*Math.PI)*1.4,(1-t)*a[1]+t*b[1]-Math.sin(t*Math.PI)*2.2],0,1,16);
    ops.push(stroke(p,'liner',1.1,'line',.34));
    ops.push(stroke(p.map(q=>[q[0]+.72,q[1]+.66]),'liner',.56,'line',.37));
  }
  return ops;
}
export function nearbyLight(){
  const ops=[PHASE('a little light where the weight is carried')];
  for(let i=0;i<8;i++){
    const u=.179+i*.008;
    const p=trace(v=>wornPoint(u+.005*Math.sin(v*4),v).slice(0,2),-.92,-.66,15);
    ops.push(stroke(p,'liner',.41,'line',.4));
  }
  // A short reflected edge belongs to the support, not the unknown perimeter.
  ops.push(stroke(trace(u=>wornPoint(u,-.98).slice(0,2),.194,.224,22),'liner',.57,'line',.55));
  return ops;
}
export function buildFinal(){
  return [...scaffolding(),PHASE('a shelter before an answer'),...wornBody(),
    CLAMP('accent',.75),...grain(),...wornIntervals(),...edgeWork(),PAUSE(700),
    ...repair(),...threadDetail(),PAUSE(800),...meeting(),...nearbyLight(),
    ...attentiveForm(),PAUSE(1200),CLAMP('tone',BRUSHES.wash.ceiling),
    ...footnote('06 / ethics before certainty')];
}
export default {
  title:'A place kept open',date:'2026-09-04',refs:[5],seed:46,
  note:'A place can be made before its occupant has been named. The large form may be a shell, a hand, or something built; the smaller one is described closely where the light reaches it, while its far contours diverge and stop. The shelter has a repaired split of its own. Its opening stays wide enough for leaving. Across six studies I learned to replace a uniform boundary with volume, reduce overlapping pigment to recover texture, and give the uncertain form more attention instead of merely adding detail to its surroundings. The final changes clarify the repair and the support, without completing the missing outline. The care is definite; the identification remains open.',
  build:buildFinal,
};
