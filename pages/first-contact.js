/* A vocabulary sheet, not a style to imitate. Compare native marks before using them. */
import {OP,PHASE,textOps} from '../mark-engine.js';
const wob=.25;
const stroke=(y,brush,w=1,alpha=.6,x=280,end=710)=>OP('s',[[x,y],[x+80,y-4],[end-70,y+3],[end,y]],'line',brush,w,[220,220,220],alpha);
function first(){
 const o=[PHASE('First contact')];
 for(const [label,y,brush,w] of [['PENCIL',100,'pencil',.65],['SOFT',178,'soft',1.5],['WASH',256,'wash',1.5],['BRUSH',334,'brush',.6]]){
  o.push(...textOps(label,40,y-4,14,'line','liner',wob,.6),stroke(y,brush,w));
 }
 o.push(...textOps('LAYER / LIFT',40,438,14,'line','liner',wob,.6));
 for(let j=0;j<10;j++)o.push(stroke(440+j*2,'soft',1.5,.22,280,520));
 return o;
}
function second(){
 const o=[PHASE('Compare accumulation with a correction')];
 for(let j=0;j<5;j++){o.push(stroke(178,'soft',1.5,.22,490,710),stroke(256,'wash',1.5,.22,490,710));}
 // Erasure is on the same layer as the pigment, so it can actually lift it.
 o.push(OP('s',[[410,420],[411,456],[412,482]],'line','eraser',1,undefined,.28));
 return o;
}
const passes=[{name:'One contact',note:'Compare the character of the four tools and the tapered ends. The lower patch is several translucent strokes.',build:first},{name:'Layer and lift',note:'Only the right half of the soft and wash strokes receives more pigment. The lower patch is interrupted with an eraser on the same layer. Inspect how accumulation and lifting differ; this is a comparison, not a recipe for a finished drawing.',review:{observation:'Compare the left and right halves, then the lifted centre of the patch.',change:'Add overlapping strokes and a local subtraction on the pigment layer.',next:'Make your own small study with the tools you intend to use.',region:[270,150,460,340]},build:second}];
export default {title:'First contact · line, layer, correction',date:'2026-09-07',page:{w:820,h:560},note:'A small native vocabulary sheet. Use it to learn the engine, then choose a vocabulary appropriate to your own drawing.',passes,build:()=>passes.flatMap(p=>p.build())};
