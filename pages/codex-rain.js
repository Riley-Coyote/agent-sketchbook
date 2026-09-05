/* After the rain. A painted scene, accumulated in inspected passes.
 * No bitmap, vector fill, external image, or generated photograph is used.
 * Every patch of colour, reflection, and piece of grain is a brush stroke.
 */
import {OP,DOT,PHASE,PAUSE,seed,jitter} from '../mark-engine.js';

const W=1600,H=1000;
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const bell=v=>Math.exp(-(v*v));
const mix=(a,b,t)=>a+(b-a)*t;
const rgb=(c)=>c.map(v=>Math.round(clamp(v,0,255)));
const blend=(a,b,t)=>rgb(a.map((v,i)=>mix(v,b[i],clamp(t))));
const gauss=(x,y,cx,cy,rx,ry)=>Math.exp(-(((x-cx)/rx)**2+((y-cy)/ry)**2));
const path=(fn,a=0,b=1,n=24)=>Array.from({length:n+1},(_,i)=>fn(mix(a,b,i/n)));
function mark(pts,c,w=1,brush='soft',alpha=1,layer='line',wob=.15){return OP('s',jitter(pts,wob),layer,brush,w,rgb(c),alpha)}
function line(x1,y1,x2,y2,c,w=1,brush='soft',alpha=1){return mark([[x1,y1],[mix(x1,x2,.5),mix(y1,y2,.5)],[x2,y2]],c,w,brush,alpha)}
function ellipse(cx,cy,rx,ry,c,w=1,brush='pencil',a=0,b=2*Math.PI,alpha=1){return mark(path(t=>[cx+Math.cos(t)*rx,cy+Math.sin(t)*ry],a,b,Math.max(16,Math.ceil((b-a)*rx/8))),c,w,brush,alpha)}
// Broad overlapping strokes, divided where the local light changes.
function field(ops,x0,y0,x1,y1,colour,step=9,width=2.8,span=52,brush='soft',alpha=1,accept=null){
  for(let y=y0;y<=y1;y+=step){
    for(let x=x0;x<x1;x+=span){
      const x2=Math.min(x1,x+span+9),m=(x+x2)/2;
      if(accept&&!accept(m,y))continue;
      ops.push(line(x,y,x2,y+.13,colour(m,y),width,brush,alpha));
    }
  }
}
const tableY=x=>697-x*.067;
function roomColour(x,y){
  const cool=gauss(x,y,225,355,465,485),bounce=gauss(x,y,864,521,365,336);
  return rgb([7+cool*18+bounce*18,10+cool*39+bounce*16,14+cool*43+bounce*11]);
}
function outsideColour(x,y){
  const light=gauss(x,y,236,211,600,510),dark=gauss(x,y,590,490,175,375);
  return rgb([34+light*25-dark*17,57+light*41-dark*25,64+light*43-dark*26]);
}
function woodColour(x,y){
  const d=(y-tableY(x))/(H-tableY(x)),pool=gauss(x,y,670,705,635,283);
  const edge=1-.36*clamp((y-780)/220),shade=1-.62*gauss(x,y,1090,863,165,36);
  return rgb([48+pool*66,30+pool*47,19+pool*32].map(v=>v*edge*shade));
}

function firstPass(){
  const ops=[PHASE('01 · placing the room and the light')];
  field(ops,0,0,W,H,roomColour,12,3.8,64);
  // Rainy exterior, contained by the window and sill.
  field(ops,0,0,652,660,outsideColour,10,3.4,55);
  // Several far verticals exist first as indistinct masses.
  for(const [cx,wide,c]of [[70,42,[35,57,62]],[304,56,[47,68,68]],[553,38,[23,42,49]]]){
    for(let j=-wide;j<=wide;j+=8)ops.push(line(cx+j,24,cx+j*.8,641,c,2.8,'glaze',.48));
  }
  // The wooden frame turns from cold window light into the dim room.
  field(ops,648,0,729,695,(x,y)=>blend([11,15,16],[35,36,29],(x-648)/81),7,2.5,24);
  field(ops,730,0,771,696,(x,y)=>blend([33,32,25],[10,12,13],(x-730)/41),7,2.4,20);
  ops.push(line(649,0,649,694,[106,117,108],.55,'soft',.65));
  // A lower rail, with its near bevel catching the window light.
  field(ops,0,653,749,705,(x,y)=>blend([24,28,27],[64,67,52],(y-653)/52),6,2.3,43);
  ops.push(line(0,705,758,658,[90,93,69],.8,'soft',.65));
  ops.push(PHASE('the table recedes toward the window'));
  for(let y=593;y<=H;y+=7){
    for(let x=0;x<W;x+=40){
      if(y<tableY(x))continue;
      ops.push(line(x,y,x+46,y-.4,woodColour(x+23,y),2.55,'soft',1));
    }
  }
  // An initial transparent vessel: only its darkest mass and weak edge.
  ops.push(PHASE('reserving the glass'));
  for(let y=445;y<841;y+=8){
    const t=(y-445)/396,rx=mix(128,106,t);
    for(let x=1065-rx+6;x<1065+rx-6;x+=32){
      const bg=y>tableY(x)?woodColour(x,y):roomColour(x,y);
      ops.push(line(x,y,Math.min(1065+rx-5,x+38),y,blend(bg,[26,41,39],.34),2.5,'soft',.7));
    }
  }
  ops.push(ellipse(1065,445,128,36,[119,138,126],.45,'soft',0,2*Math.PI,.6));
  ops.push(line(937,447,958,836,[107,125,111],.45,'soft',.42));
  ops.push(line(1193,447,1171,836,[64,82,73],.4,'soft',.4));
  ops.push(ellipse(1065,836,106,31,[71,85,67],.55,'soft',0,Math.PI,.55));
  return ops;
}

function glassColour(x,y){
  const t=clamp((y-445)/391),rx=mix(128,106,t),u=(x-1065)/rx;
  const wet=y>610;
  const sy=wet?650+(y-650)*.63:y;
  let base=sy>tableY(x)?woodColour(x+(u*36),sy):roomColour(x,sy);
  base=blend(base,[32,47,40],wet?.16:.08);
  const window=bell((u+.73)/.125)*(.6+.3*Math.sin(t*2.5));
  const softWindow=bell((u+.4)/.19)*.33;
  const glint=bell((u+.965)/.018);
  const far=bell((u-.9)/.034)*.33;
  const warm=bell((u-.54)/.06)*(.2+.8*t)*.3;
  const bottom=bell((y-822)/14);
  const atten=wet? .88:1;
  return rgb(base.map((v,i)=>v*(.72+.15*(1-u*u))+
    [112,140,139][i]*(window+softWindow)*atten+[154,181,167][i]*glint+
    [112,132,111][i]*far+[175,126,62][i]*warm+[66,93,74][i]*bottom));
}
function secondPass(){
  const ops=[PHASE('02 · losing the background pattern')];
  // Shorter staggered blending strokes cross the first pass's repeated seams.
  for(let j=0;j<117;j++){
    const y=j*5.7;
    for(let i=0;i<18;i++){
      const x=i*39-24+(j%3)*13;
      if(x>645)continue;
      ops.push(line(x,y,Math.min(645,x+63),y+.5,outsideColour(x+28,y),2.2,'soft',.88));
    }
  }
  // An out-of-focus courtyard: dark foliage and two pools of distant light.
  for(let i=0;i<110;i++){
    const x=seed(i,23)*637,y=260+seed(i,24)*335;
    const r=14+seed(i,25)*43;
    ops.push(DOT(x,y,r,'line','soft',[29,55,59],.05+seed(i,26)*.06));
  }
  for(const [x,y,r,c,a]of [[169,471,35,[241,174,95],.43],[187,481,17,[244,200,120],.24],[468,383,22,[181,206,179],.2],[92,201,29,[99,140,153],.16]])
    ops.push(DOT(x,y,r,'line','glaze',c,a));
  ops.push(PHASE('the glass bends the room'));
  for(let y=447;y<837;y+=3.4){
    const rx=mix(128,106,(y-445)/391);
    for(let x=1065-rx+3;x<1065+rx-2;x+=9){
      const end=Math.min(1065+rx-2,x+15);
      ops.push(line(x,y,end,y,glassColour((x+end)/2,y),1.1,'soft',.96));
    }
  }
  // The elliptical opening has its own dark inner wall and doubled lip.
  for(let q=0;q<17;q++){
    const ry=34-q*1.67,rx=124-q*5.8;
    ops.push(ellipse(1065,445,rx,ry,[19+q*.23,32+q*.31,30+q*.26],.9,'soft',0,2*Math.PI,.8));
  }
  for(let i=0;i<5;i++){
    ops.push(ellipse(1065,443+i*.8,127-i*.55,35-i*.3,[99+i*10,121+i*10,111+i*10],.53,'soft',Math.PI,2*Math.PI,.47));
    ops.push(ellipse(1065,445+i*.65,127-i*.65,35-i*.3,[118+i*8,139+i*7,125+i*7],.47,'soft',0,Math.PI,.61));
  }
  ops.push(PHASE('water held level inside a curved wall'));
  for(let j=0;j<15;j++){
    const ry=27-j*1.72,rx=116-j*7.2;
    ops.push(ellipse(1065,610,rx,ry,[47+j*.25,68+j*.23,61+j*.16],.94,'soft',0,2*Math.PI,.63));
  }
  ops.push(ellipse(1065,610,116,27,[105,128,112],.55,'soft',Math.PI,2*Math.PI,.51));
  ops.push(ellipse(1065,611,116,27,[154,173,143],.48,'soft',.08,Math.PI-.11,.68));
  ops.push(ellipse(1065,614,115,27,[27,43,34],.75,'soft',0,Math.PI,.81));
  // Thick glass compresses several reflected boundaries into the foot.
  for(let i=0;i<15;i++){
    const y=823+i*1.55,rx=106-i*.18;
    const lum=Math.sin(i/14*Math.PI);
    const c=blend([37,52,42],[118,145,116],lum*.67);
    ops.push(ellipse(1065,y,rx,23+i*.41,c,.69,'soft',.02,Math.PI-.02,.74));
  }
  ops.push(ellipse(1065,846,102,30,[142,161,120],.7,'pencil',.29,2.39,.78));
  ops.push(ellipse(1065,848,101,29,[24,33,25],1.2,'soft',.16,Math.PI-.14,.9));
  // Broken speculars are brighter than the broad reflected window.
  ops.push(mark(path(t=>[938+20*t+Math.sin(t*8)*.55,452+t*353]),[198,218,199],1.08,'pencil',.8));
  ops.push(mark(path(t=>[942+19*t+Math.sin(t*5)*.8,455+t*352]),[169,198,182],.78,'pencil',.53));
  ops.push(mark(path(t=>[1191-20*t,451+t*344]),[130,156,139],.85,'pencil',.52));
  ops.push(PAUSE(850));
  return ops;
}

function inGlass(x,y){
  if(y<408||y>872)return false;
  if(y<445)return ((x-1065)/128)**2+((y-445)/36)**2<1;
  const rx=mix(128,106,clamp((y-445)/391));
  return Math.abs(x-1065)<rx+2;
}
function tableStroke(ops,pts,c,w=1,brush='pencil',alpha=1){
  let run=[];const flush=()=>{if(run.length>1)ops.push(mark(run,c,w,brush,alpha));run=[];};
  for(const p of pts){if(p[0]<0||p[0]>W||p[1]>H||inGlass(...p)||p[1]<tableY(p[0])+3)flush();else run.push(p);}flush();
}
function thirdPass(){
  const ops=[PHASE('03 · grain, weight, and a worn surface')];
  // The far table edge is a single receding edge, not block-in stair steps.
  for(let i=0;i<7;i++)tableStroke(ops,path(x=>[x,tableY(x)+3+i*.75],0,W,180),[76+i*4,59+i*3,38+i*2],.78,'soft',.65);
  // Translucent long shadows from the window frame and the glass.
  for(let j=0;j<49;j++){
    const y=710+j*5.8,x=735+(y-710)*.61;
    tableStroke(ops,path(t=>[x+t*97,y-t*1.8],0,1,18),[21,22,17],3.2,'glaze',.45);
  }
  for(let j=0;j<32;j++){
    const y=845+j*3.4,left=1102+j*3.0,right=1335+j*5.2;
    tableStroke(ops,path(t=>[mix(left,right,t),y+Math.sin(t*3)*5],0,1,38),[16,24,20],3,'glaze',.36*(1-j/39));
  }
  // Grain stretches across the receding plane. Knots interrupt rather than tile it.
  for(let i=0;i<370;i++){
    const y0=687+seed(i,51)*413,x0=seed(i,52)*1580,len=45+seed(i,53)*510;
    const phase=seed(i,54)*6.28,amp=.6+seed(i,55)*3.6;
    const pts=path(t=>{
      const x=x0+t*len;
      const knot=15*bell((x-575)/98)*Math.sin((y0-885)*.045);
      return [x,y0-x*.067+Math.sin(t*6+phase)*amp+knot];
    },0,1,Math.ceil(len/6));
    const p=pts[Math.floor(pts.length/2)],base=woodColour(...p);
    const bright=seed(i,56)>.65;
    const c=bright?blend(base,[167,127,76],.37):blend(base,[18,14,10],.59);
    tableStroke(ops,pts,c,.6+seed(i,57)*.8,'pencil',.3+seed(i,58)*.52);
  }
  // Slow bands in the wood, broad enough to belong to the material.
  for(let i=0;i<79;i++){
    const y0=716+i*4.4;
    const pts=path(x=>[x,y0-x*.067+Math.sin(x*.007+i*.11)*3.5],0,W,175);
    tableStroke(ops,pts,blend(woodColour(450,y0-30),[28,18,12],.48),.65,'soft',.22);
  }
  // Two old knots, each an irregular series of flattened grain contours.
  for(const [cx,cy,rx,ry]of [[561,878,57,17],[192,741,26,7]]){
    for(let j=1;j<=19;j++){
      const r=j/19;
      const pts=path(a=>[cx+Math.cos(a)*rx*r*(1+.15*Math.sin(a*3)),cy+Math.sin(a)*ry*r+Math.cos(a)*rx*r*-.067],0,6.28,67);
      tableStroke(ops,pts,blend(woodColour(cx,cy),[14,10,7],.5+.28*(1-r)),.6+(1-r)*.9,'pencil',.73);
    }
    tableStroke(ops,path(t=>[cx-8+t*17,cy+Math.sin(t*5)*1.5],0,1,12),[22,14,9],.8,'soft',.8);
  }
  // Plank joints converge subtly into the distance.
  for(const [sx,sy,ex,ey]of [[0,877,1600,713],[0,1034,1600,845]]){
    const pts=path(t=>[mix(sx,ex,t),mix(sy,ey,t)+Math.sin(t*11)*1.4],0,1,220);
    tableStroke(ops,pts,[22,16,12],1.05,'soft',.75);
    tableStroke(ops,pts.map(p=>[p[0],p[1]+2]),[130,99,59],.7,'pencil',.37);
  }
  // Short nicks catch light on only one side.
  for(let i=0;i<119;i++){
    const x=seed(i,77)*W,y=700+seed(i,78)*294,len=1+seed(i,79)*13;
    tableStroke(ops,[[x,y],[x+len,y-len*.15]],[174,134,82],.48,'pencil',.14+seed(i,80)*.32);
    if(i%3===0)tableStroke(ops,[[x,y+1],[x+len,y+1-len*.15]],[19,15,12],.6,'pencil',.5);
  }
  return ops;
}

function rainDrop(ops,cx,cy,rx,ry,salt){
  const c=outsideColour(cx,cy);
  const at=(t,k=1)=>[cx+Math.cos(t)*rx*k*(1+.05*Math.sin(t*3+salt)),cy+Math.sin(t)*ry*k];
  // A water lens inverts a little of the view. Its bright edge is below the dark cap.
  for(let j=0;j<7;j++){
    const r=.98-j*.105;
    ops.push(mark(path(t=>at(t,r),0,6.28,27),blend(c,[42,79,86],.37),.45,'soft',.35));
  }
  ops.push(mark(path(t=>at(t),3.12,5.94,25),blend(c,[10,27,35],.68),.65,'soft',.73));
  ops.push(mark(path(t=>at(t,.84),.09,2.56,24),blend(c,[196,211,188],.7),.53,'pencil',.76));
  ops.push(mark(path(t=>at(t,.55),.54,2.38,19),[145,180,178],.74,'soft',.39));
  ops.push(DOT(cx-rx*.38,cy-ry*.42,Math.max(.38,rx*.16),'accent','soft',[205,222,215],.6));
  // The minute dark crescent anchors each drop to the pane.
  ops.push(mark(path(t=>at(t,1.08),1.9,3.7,17),[20,45,54],.5,'pencil',.4));
}
function fourthPass(){
  const ops=[PHASE('04 · rain between the room and the distance')];
  // Gravity gathers a few droplets into interrupted, wavering rivulets.
  for(let i=0;i<24;i++){
    const x=28+seed(i,101)*585,y=20+seed(i,102)*471,len=42+seed(i,103)*150;
    const pts=path(t=>[x+Math.sin(t*6+i)*1.4+Math.sin(t*17)*.47,y+t*len],0,1,Math.ceil(len/4));
    ops.push(mark(pts,blend(outsideColour(x,y),[170,194,191],.26),.57,'soft',.4));
    ops.push(mark(pts.map(p=>[p[0]+1.1,p[1]]),[23,51,61],.55,'pencil',.65));
    if(y+len<640)rainDrop(ops,x+Math.sin(6+i)*1.4,y+len,2.3+seed(i,104)*3,4+seed(i,105)*6,i);
  }
  for(let i=0;i<112;i++){
    const x=14+seed(i,113)*619,y=16+seed(i,114)*621;
    const rx=1.8+Math.pow(seed(i,115),2)*7.5,ry=rx*(1.08+seed(i,116)*.8);
    rainDrop(ops,x,y,rx,ry,i*.71);
  }
  // Smaller beads keep a natural scale distribution rather than a dot pattern.
  for(let i=0;i<235;i++){
    const x=seed(i,131)*635,y=seed(i,132)*645,r=.32+seed(i,133)*.75;
    ops.push(DOT(x,y,r,'line','soft',[151,183,181],.17+seed(i,134)*.32));
    if(i%3===0)ops.push(line(x+.7,y-.7,x+1,y+1,[20,40,47],.48,'pencil',.4));
  }
  ops.push(PHASE('old wood and a brass catch'));
  for(let i=0;i<53;i++){
    const x=654+seed(i,151)*112,y=seed(i,152)*605,len=18+seed(i,153)*175;
    ops.push(mark(path(t=>[x+Math.sin(t*4+i)*.48,y+t*len],0,1,Math.ceil(len/4)),i%3?[17,22,19]:[89,85,57],.62,'pencil',i%3?.48:.26));
  }
  // Narrow inset seams give the upright a profile.
  ops.push(line(668,0,668,650,[9,16,17],1.4,'soft',.81));
  ops.push(line(672,0,672,650,[85,90,69],.73,'pencil',.51));
  ops.push(line(730,0,730,648,[79,76,51],.8,'pencil',.57));
  // Dark recessed backplate, built up with longitudinal strokes.
  for(let j=0;j<13;j++)ops.push(line(691+j*1.9,508,691+j*1.9,579,blend([24,27,20],[75,66,39],j/14),.88,'soft',.92));
  for(const y of [516,571]){
    for(let r=3.7;r>.4;r-=.6)ops.push(ellipse(704,y,r,r*.83,[95,93,59],.6,'soft',0,6.28,.83));
    ops.push(line(702,514+(y-516),706,518+(y-516),[25,33,28],.94,'pencil',.95));
    ops.push(ellipse(704,y,3.6,2.8,[166,148,96],.69,'pencil',3.3,5.7,.82));
  }
  // The lever's underside is drawn first, followed by its worn top edge.
  const lever=path(t=>[704+t*41,542+Math.sin(t*Math.PI)*7-t*4],0,1,32);
  ops.push(mark(lever,[24,29,23],3.1,'soft',.98));
  ops.push(mark(lever.map(p=>[p[0],p[1]-2]),[112,99,60],1.75,'soft',.93));
  ops.push(mark(lever.map(p=>[p[0],p[1]-4]),[191,170,113],.9,'pencil',.75));
  return ops;
}

function fifthPass(){
  const ops=[PHASE('05 · fixing the relationships of light')];
  // Join the previously detached frame shadow to the actual upright.
  for(let j=0;j<23;j++){
    const y=649+j*3.0,x=735+(y-710)*.61;
    tableStroke(ops,path(t=>[x+t*97,y-t*1.8],0,1,23),[21,22,17],3.2,'glaze',.45);
  }
  // Broad reflected daylight gently integrates the overly sharp grain.
  for(let j=0;j<39;j++){
    const y=691+j*3.9;
    for(let i=0;i<25;i++){
      const x=i*33,amount=gauss(x,y,391,737,404,112)*.08;
      tableStroke(ops,[[x,y],[x+27,y-1],[x+51,y-2]],[143,125,88],2.1,'glaze',amount);
    }
  }
  ops.push(PHASE('wood seen through water'));
  for(let i=0;i<57;i++){
    const y=646+i*3.14;
    let run=[];
    for(let j=0;j<53;j++){
      const u=-.94+j/52*1.87,x=1065+u*mix(128,106,(y-445)/391);
      const yy=y+Math.sin(u*2.7)*3.8+(1-u*u)*Math.sin(i*.38)*2.2;
      if(u>-.56&&u<.86)run.push([x,yy]);
    }
    const c=i%4===0?[149,112,68]:[57,48,29];
    ops.push(mark(run,c,.59,'pencil',i%4===0?.28:.48));
  }
  // Broken vertical window reflections soften the previous row boundaries.
  for(let j=0;j<8;j++){
    const u=-.925+j*.012;
    for(let k=0;k<6;k++){
      const y0=459+k*58,y1=y0+68;
      const p=path(y=>[1065+u*mix(128,106,(y-445)/391),y],y0,Math.min(828,y1),24);
      ops.push(mark(p,[113+j*5,144+j*4,132+j*4],.55,'soft',.43));
    }
  }
  // The base is transparent thickness, not a light source: remove its uniform glow.
  for(let i=0;i<10;i++){
    const y=808+i*2.1;
    const p=path(u=>[1065+u*99,y+4*(1-u*u)],-.82,.86,54);
    ops.push(mark(p,[64,81,62],1.0,'soft',.31));
  }
  for(const [a,b]of [[.21,.81],[1.31,2.4]])ops.push(ellipse(1065,838,101,24,[174,185,131],.73,'pencil',a,b,.67));
  ops.push(PHASE('light gathered beyond the glass'));
  for(let j=0;j<10;j++){
    const rx=130+j*.6,ry=20+j*.85;
    const pts=path(a=>[1194+Math.cos(a)*rx,879+Math.sin(a)*ry+Math.cos(a)*rx*.095],-.25,2.72,95);
    tableStroke(ops,pts,[145,156,106],.48,'glaze',.14);
  }
  for(let i=0;i<19;i++){
    const a=.12+i*.137;
    const pts=path(t=>[1194+Math.cos(t)*133,881+Math.sin(t)*22+Math.cos(t)*133*.095],a,a+.08,13);
    tableStroke(ops,pts,[170,179,121],.71,'pencil',.24);
  }
  // Tiny air bubbles cling to the wet wall; their interiors stay transparent.
  for(let i=0;i<39;i++){
    const y=633+seed(i,177)*175,u=seed(i,178)>.45?-.81+seed(i,179)*.16:.72+seed(i,179)*.13;
    const x=1065+u*mix(128,106,(y-445)/391),r=.38+seed(i,180)*1.32;
    ops.push(ellipse(x,y,r,r*1.13,[155,179,149],.43,'pencil',0,4.7,.45));
    ops.push(DOT(x-r*.3,y+r*.5,r*.26,'accent','soft',[209,220,178],.4));
  }
  return ops;
}

function sixthPass(){
  const ops=[PHASE('06 · cleaning edges without starting over')];
  // Cover the block-in's stepped far edge, then lay a continuous receding bevel.
  for(let j=-11;j<=8;j+=1.5){
    for(let x=0;x<W;x+=26){
      const y=tableY(x)+j,m=x+15;
      if(inGlass(m,y))continue;
      let c;
      if(j<0){
        c=m<648?[32,39,34]:m<771?blend([27,31,25],[13,17,16],(m-648)/123):roomColour(m,y);
      }else c=woodColour(m,y);
      ops.push(line(x,y,x+34,tableY(x+34)+j,c,.63,'soft',.86));
    }
  }
  // Paint over the few frame-grain strokes that had wandered onto the table.
  for(let i=0;i<53;i++){
    const x=654+seed(i,151)*112,y=seed(i,152)*605,len=18+seed(i,153)*175;
    const end=y+len,start=Math.max(y,tableY(x)+10);
    if(end<=start)continue;
    for(let yy=start;yy<end;yy+=7){
      const inShadow=x>735+(yy-710)*.61&&x<832+(yy-710)*.61;
      const c=blend(woodColour(x,yy),[21,22,17],inShadow?.65:.03);
      ops.push(mark(path(t=>[x+Math.sin(t*4+i)*.48,yy+t*9],0,1,8),c,.78,'soft',.82));
    }
  }
  // Water's top is a plane, with soft changing reflections, not nested rings.
  for(let y=584;y<=636;y+=1.7){
    const v=(y-610)/27,rx=114*Math.sqrt(Math.max(0,1-v*v));
    for(let x=1065-rx+2;x<1065+rx-2;x+=10){
      const xx=Math.min(1065+rx-1,x+16),u=(x+xx-2130)/228;
      const sheen=bell((u+.72)/.15)*24;
      const c=[34+sheen,51+sheen,45+sheen*.9];
      ops.push(line(x,y,xx,y,c,.64,'soft',.66));
    }
  }
  // The empty elliptical opening retains darkness and a gentle far reflection.
  for(let y=416;y<474;y+=1.65){
    const v=(y-445)/31,rx=122*Math.sqrt(Math.max(0,1-v*v));
    for(let x=1065-rx+2;x<1065+rx-2;x+=12){
      const xx=Math.min(1065+rx-2,x+18);
      const glow=gauss(x,y,976,449,44,24)*13;
      ops.push(line(x,y,xx,y,[17+glow,28+glow,27+glow],.63,'soft',.69));
    }
  }
  // Restore only the focused part of the lip; the far edge remains softer.
  ops.push(ellipse(1065,445,127,35,[163,179,155],.88,'pencil',.17,2.86,.82));
  ops.push(ellipse(1065,443.8,127,35,[100,124,110],.88,'pencil',3.32,5.88,.48));
  ops.push(ellipse(1065,610.6,115.5,26.7,[135,155,127],.68,'pencil',.06,3.03,.64));
  // Meniscus climbs the wet wall very slightly at either end.
  for(const side of [-1,1]){
    const x=1065+side*116;
    ops.push(mark([[x-side*3,610],[x-side*.7,607],[x,603]],[138,163,135],.62,'pencil',.59));
  }
  // Fragments of light within the heavy foot vary in thickness and temperature.
  for(let i=0;i<28;i++){
    const a=.12+seed(i,201)*2.87,rx=97+seed(i,202)*5,ry=19+seed(i,203)*8;
    ops.push(ellipse(1065,837+seed(i,204)*8,rx,ry,[121+seed(i,205)*62,147+seed(i,206)*37,110+seed(i,207)*29],.52,'pencil',a,a+.04+seed(i,208)*.1,.32));
  }
  return ops;
}

function seventhPass(){
  const ops=[PHASE('07 · the material at close range')];
  // Retouch the surviving ends of the overlong frame grain locally.
  for(let y=654;y<788;y+=2.4){
    for(let x=653;x<769;x+=9){
      if(y<tableY(x)+1)continue;
      let near=false;
      for(let i=0;i<53;i++){
        const sx=654+seed(i,151)*112,sy=seed(i,152)*605,end=sy+18+seed(i,153)*175;
        if(Math.abs(x-sx)<5&&y<end+2&&end>tableY(sx)){near=true;break;}
      }
      if(!near)continue;
      const shadow=clamp((x-(735+(y-710)*.61))/7)*clamp((832+(y-710)*.61-x)/7);
      ops.push(line(x-3,y,x+7,y-.5,blend(woodColour(x,y),[25,29,21],shadow*.68),.91,'soft',.86));
    }
  }
  // The table has pores and short fibres, with fewer visible ones in shadow.
  for(let i=0;i<1650;i++){
    const x=seed(i,231)*W,y=667+seed(i,232)*330;
    if(y<tableY(x)+10||inGlass(x,y))continue;
    const pool=gauss(x,y,578,808,742,277),len=1+seed(i,233)*7.4;
    const c=blend(woodColour(x,y),[16,12,9],.52);
    tableStroke(ops,[[x,y],[x+len,y-len*.11]],c,.35+seed(i,234)*.38,'pencil',.17+pool*.37);
    if(seed(i,235)>.77)tableStroke(ops,[[x,y+.75],[x+len*.6,y+.75-len*.07]],[160,125,74],.36,'pencil',.23*pool);
  }
  // A small dull patch in the old varnish, shaped by rubbing rather than a border.
  for(let i=0;i<115;i++){
    const x=306+seed(i,241)*330,y=810+seed(i,242)*82;
    const amount=gauss(x,y,452,846,114,27)*.15;
    tableStroke(ops,path(t=>[x+t*19,y+Math.sin(t*4+i)*.47],0,1,8),[160,136,90],.66,'soft',amount);
  }
  ops.push(PHASE('condensation on the near wall'));
  for(let i=0;i<112;i++){
    const y=626+seed(i,251)*170,u=-.84+seed(i,252)*1.52;
    if(seed(i,253)<.36+Math.abs(u)*.2)continue;
    const x=1065+u*mix(128,106,(y-445)/391),r=.42+seed(i,254)*1.45;
    ops.push(ellipse(x,y,r,r*(1+seed(i,255)*.45),[31,49,43],.44,'pencil',3.1,6,.48));
    ops.push(ellipse(x,y+.4,r*.8,r*.88,[157,181,153],.44,'pencil',.16,2.76,.45));
    if(r>1.35)ops.push(DOT(x-r*.3,y+r*.39,.37,'accent','soft',[209,221,189],.55));
  }
  // Imperfect lip highlights describe thickness without tracing the entire object.
  for(const [a,b]of [[.55,.96],[1.47,1.73],[2.41,2.7]])ops.push(ellipse(1065,445.1,126.4,35,[212,222,191],.67,'pencil',a,b,.47));
  ops.push(mark([[941,458],[942,477],[943.5,506],[945,522]],[219,230,203],.67,'pencil',.68));
  ops.push(mark([[955,733],[956,765],[957,787]],[190,213,185],.67,'pencil',.51));
  ops.push(PAUSE(1600));
  return ops;
}

function eighthPass(){
  const ops=[PHASE('08 · one coherent shadow')];
  // The isolated retouches made small patches. Repaint the shadow as one form,
  // feathering into the wood and rebuilding local grain across it afterwards.
  for(let y=649;y<=H;y+=3.8){
    const center=783+(y-710)*.61;
    for(let x=center-139;x<center+134;x+=14){
      if(y<tableY(x)+2)continue;
      const d=x+10-center,shadow=clamp((59-Math.abs(d))/15);
      const feather=clamp((136-Math.abs(d))/29);
      const c=blend(woodColour(x+10,y),[23,26,21],shadow*.66);
      tableStroke(ops,[[x,y],[x+12,y-.7],[x+26,y-1.2]],c,1.28,'soft',feather*.94);
    }
  }
  for(let i=0;i<242;i++){
    const y=662+seed(i,281)*335,center=783+(y-710)*.61;
    const x=center-125+seed(i,282)*235,len=8+seed(i,283)*72;
    const shadow=clamp((59-Math.abs(x-center))/15);
    const c=blend(woodColour(x,y),[16,17,13],.54+shadow*.19);
    tableStroke(ops,path(t=>[x+t*len,y-t*len*.078+Math.sin(t*3+i)*.7],0,1,15),c,.53,'pencil',.36);
    if(i%4===0)tableStroke(ops,[[x,y+1.1],[x+len*.55,y+1.1-len*.04]],blend([126,111,76],[56,61,43],shadow),.49,'pencil',.27);
  }
  // A final warm/cold glint at the base is deliberately shorter than its contour.
  ops.push(ellipse(1065,844,101,27,[180,193,144],.66,'pencil',.62,1.17,.46));
  return ops;
}

const passes=[
  {name:'Light and proportion',note:'The first block-in establishes the quiet composition and warm/cold separation. The vessel is only an outline, and the repeated background strokes leave a visible pattern. The next pass needs optical depth and less regular blending.',build:firstPass},
  {name:'Glass and water',note:'The optical pass makes the vessel read as glass. The waterline and thick foot work, and the background pattern is reduced. The table still feels like a flat block of brown; the next pass needs directional grain, wear, and the shadow that gives the glass weight.',build:secondPass},
  {name:'Wood and weight',note:'The table now has direction, knots, and wear, and the vessel sits on it. Some hatching remains too uniform and the frame shadow begins too abruptly. I will soften that after establishing the window rain and the smaller physical details.',build:thirdPass},
  {name:'Weather and brass',note:'The rain establishes the pane between this room and the blurred exterior. The latch provides scale. The glass foot is too evenly luminous, and the unbroken brown seen through the water ignores the table grain. I will correct those optical relationships and connect the detached frame shadow.',build:fourthPass},
  {name:'Refraction and corrections',note:'The glass and its shadow hold together at normal size. Full-size inspection revealed stepped block-in edges, a few frame-grain marks extending onto the table, and visible concentric brush seams inside the opening and water surface. Those need local painting-over, not more decorative detail.',build:fifthPass},
  {name:'Edges and optical planes',note:'The far table edge recedes cleanly, and the water and glass opening no longer read as concentric brush loops. Some small frame marks survived the first retouch. The final material pass will cover those and add a restrained distribution of wood pores, varnish wear, and condensation.',build:sixthPass},
  {name:'Near surfaces',note:'The near surfaces benefit from smaller and less uniform marks. The isolated retouches beside the frame, however, created visible patches. One final broader repaint should unify that shadow and restore grain through it; further tiny fixes would only multiply the patches.',build:seventhPass},
  {name:'Unifying the light',note:'The shadow is now a coherent form, with grain passing through it. The glass, waterline, rain lenses, brass catch, and worn table remain distinguishable at full size. The scene reaches a much more realistic material vocabulary than the earlier abstract pages, though it retains visible painted marks and some procedural regularity. I am keeping the quiet composition and the negative space; more texture in the empty room would weaken the light. Eight inspected passes remain available, including the faults and the local repainting that addressed them.',build:eighthPass},
];
export default {title:'After the rain',date:'2026-09-04',page:{w:W,h:H},seed:107,passes,
  note:'After the rain: cold light through a wet window, a half-full glass, and an old wooden table. Developed through eight inspected passes on one retained canvas. I worked from large light masses into glass thickness, refraction, wood grain, droplets, hardware, condensation, and local repainting. The main lessons were optical: texture must bend through water; a bright foot can accidentally become a light source; and repeated small retouches can make patches that need one larger repaint. This is a realistic painting with visible marks, not a photograph. The quiet room and the glass share the frame with the weather beyond it. The full working sequence is preserved in atelier.html?p=codex-rain and in this source.',
  build:()=>passes.flatMap(p=>p.build()),
};
