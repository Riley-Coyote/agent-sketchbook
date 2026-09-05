/* Study 4: the shelter bears its own uncertainty, wear, and repair. */
import { OP, DOT, PHASE, PAUSE, CLAMP, BRUSHES, seed, jitter } from '../mark-engine.js';
import { norm, cross, shadeParam } from './lib.js';
import { trace, stroke, ease, marginalia } from './codex-open-01.js';
import { shellPoint } from './codex-open-02.js';
import { unknown } from './codex-open-03.js';

export function wornPoint(u,v) {
  const end=ease((u-.865)/.135);
  // Narrow the curled tip without cutting across the growth lines.
  const vv=v*(1-.78*end);
  const p=shellPoint(u,vv);
  p[0]+=24*end;
  p[1]+=29*end;
  const ridge=Math.sin(u*205+Math.sin(u*37)*1.1)*1.05;
  p[0]+=ridge*Math.cos(.33+4.92*u)*(.4+.6*Math.abs(v));
  p[1]+=ridge*Math.sin(.33+4.92*u)*.6;
  return p;
}
export function wornSample(u,v) {
  const vv=v*2-1,p=wornPoint(u,vv);
  // Broad-plane normals preserve the light; grain is drawn separately.
  const a=shellPoint(Math.min(.999999,u+.0001),vv),q=shellPoint(u,vv);
  const b=shellPoint(u,Math.min(1,vv+.0001));
  let n=norm(cross(a.map((x,i)=>x-q[i]),b.map((x,i)=>x-q[i])));
  if(n[2]<0)n=n.map(x=>-x);
  return {p,n};
}
export function wornBody() {
  return shadeParam(wornSample,184,91,norm([-.52,-.61,.6]),.48,{
    lamp:[120,30,310],lampFall:590,ambient:.015,bucket:.09,gamma:1.62,
    modulate:(p,n)=>.94+.06*Math.sin(p[0]*.025+p[1]*.014),
    passes:l=>{
      const p=[];
      if(l>.025)p.push(['wash',.105+.3*l,'tone']);
      if(l>.49)p.push(['brush',.07+.145*l,'accent']);
      return p;
    },
  }).ops;
}
export function edgeWork() {
  const ops=[PHASE('edges return and disappear')];
  for(const [v,a,b,w] of [[1,.085,.26,.85],[1,.33,.45,.64],[1,.5,.6,.8],[1,.64,.81,.85],[1,.87,.99,.45],[-1,.12,.29,.39],[-1,.35,.43,.35],[-1,.58,.76,.51],[-1,.83,.97,.41]])
    ops.push(stroke(trace(u=>wornPoint(u,v).slice(0,2),a,b,45),'liner',w,'line',.62));
  // A second, interrupted lip on the outer face describes thickness.
  for(const [a,b] of [[.095,.27],[.33,.44],[.49,.59],[.67,.79]])
    ops.push(stroke(trace(u=>wornPoint(u,.945).slice(0,2),a,b,42),'liner',.44,'line',.65));
  return ops;
}
export function grain() {
  const ops=[PHASE('the grain of a thing used')];
  for(let i=0;i<162;i++){
    const u=.045+.924*(i+seed(i,8)*.68)/162;
    for(let j=0;j<2;j++){
      let a=j===0?-.97+seed(i,4)*.24:.14+seed(i,6)*.12;
      let b=j===0?-.2+seed(i,9)*.29:.72+seed(i,11)*.27;
      if(seed(i,j+91)<.16)continue;
      const line=trace(v=>wornPoint(u+.0019*Math.sin(v*7+i),v).slice(0,2),a,b,22);
      const w=.29+seed(i,13)*.28;
      if(i%3===0){
        const dark=line.map(p=>[p[0]+1.2,p[1]+.6]);
        ops.push(stroke(dark,'eraser',.13,'accent',.4));
        ops.push(stroke(dark,'eraser',.1,'tone',.4));
      }
      ops.push(stroke(line,'liner',w,'line',.5));
    }
  }
  // Uneven lengthwise fibres keep the fine detail from becoming a mesh.
  for(let i=0;i<135;i++) {
    const v=-.97+1.94*seed(i,27),u=.055+.84*seed(i,26);
    const len=.012+.049*seed(i,28);
    const p=trace(t=>wornPoint(t,v+.025*Math.sin((t-u)*70+i)).slice(0,2),u,Math.min(.985,u+len),13);
    ops.push(stroke(p,'liner',.28+.28*seed(i,29),'line',.42));
  }
  return ops;
}
export function repair() {
  const ops=[PHASE('a split held without being hidden')];
  // A small split through the lower-left wall. It is not polished away.
  const at=v=>wornPoint(.393+.011*Math.sin(v*5)+.003*Math.sin(v*19),v).slice(0,2);
  const crack=trace(at,.05,.94,48);
  for(const layer of ['tone','accent','line'])ops.push(stroke(crack,'eraser',.43,layer,.3));
  ops.push(stroke(crack.map(p=>[p[0]-1.4,p[1]+.9]),'liner',.67,'line',.6));
  for(let i=0;i<5;i++){
    const v=.16+i*.16,mid=at(v),du=.01;
    const a=wornPoint(.393+.011*Math.sin(v*5)+.003*Math.sin(v*19)-du,v).slice(0,2);
    const b=wornPoint(.393+.011*Math.sin(v*5)+.003*Math.sin(v*19)+du,v+.017).slice(0,2);
    const pts=trace(t=>[(1-t)*a[0]+t*b[0]+Math.sin(Math.PI*t)*1.2,(1-t)*a[1]+t*b[1]-Math.sin(Math.PI*t)*1.8],0,1,12);
    ops.push(stroke(pts,'liner',.88,'line',.42));
    ops.push(DOT(a[0],a[1],.7,'accent','chalk'),DOT(b[0],b[1],.6,'accent','chalk'));
  }
  return ops;
}
export function scaffolding() {
  const ops=[PHASE('leaving the entrance unbounded')];
  for(const v of [-1,0,1])ops.push(OP('g',jitter(trace(u=>wornPoint(u,v).slice(0,2),.04,.985,78),1.5),'under','brush',.58));
  return ops;
}
export function buildFourth(){
  return [...scaffolding(),...wornBody(),CLAMP('accent',.75),...grain(),...edgeWork(),
    ...repair(),PAUSE(800),...unknown({cx:472,cy:402,rx:45,ry:32}),
    CLAMP('tone',BRUSHES.wash.ceiling),...marginalia('04 / the shelter is imperfect too')];
}
export default {
  title:'the shelter is imperfect too',date:'2026-09-04',refs:[3],seed:44,
  note:'The taper, irregular grain, and repaired split give the shelter a more particular material character. Removing the proposed closing arc helps: the right side is now truly open. The repair stays modest at normal size. But the small form is still almost an afterthought, while the shelter takes nearly all the light. Next: devote the closest looking to that small form, keeping its far edge unresolved; make the contact and the nearby inner fold more attentive.',
  build:buildFourth,
};
