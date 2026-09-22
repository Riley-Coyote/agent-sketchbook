/* Revision history is about restoring real pigment, not counting PHASE labels. */
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {compilePage} from '../page-program.js';
const ROOT=resolve(import.meta.dirname,'..'),run=promisify(execFile);
const book=await mkdtemp(join(tmpdir(),'sketchbook-workflow-'));
const fixtures=await mkdtemp(join(ROOT,'tests','workflow-fixtures-'));
const cli=(...args)=>run(process.execPath,[join(ROOT,'book.mjs'),...args,'--book',book],{cwd:ROOT,maxBuffer:8e6});
const saved=async n=>JSON.parse(await readFile(join(book,'pages',`${String(n).padStart(3,'0')}.json`),'utf8'));
const index=async()=>JSON.parse(await readFile(join(book,'book.json'),'utf8'));
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const A={k:'s',pts:[[12.13,12],[100,100]],layer:'line',brush:'pencil',w:.56},B={...A,pts:[[30,60],[80,90]]};
const source=(ops,extra='')=>`const pieces=${JSON.stringify(ops)};const passes=pieces.map((op,i)=>({name:'Pass '+(i+1),note:'Observation '+i,review:{observation:'A gap is visible',change:'Close the near edge',next:'Inspect the join',region:[0,0,50,50]},build:()=>[op]}));export default {title:'Trial',note:'A study with a diagnosed correction',page:{w:220,h:180},passes,build:()=>passes.flatMap(p=>p.build()),${extra}};`;
const file=join(fixtures,'study.js');
try {
 await cli('init','--owner','Workflow test');
 await writeFile(file,source([A]));await cli('write',file);
 const first=await saved(1),unchanged=hash(first);assert.equal(first.stage,'study');assert.equal(first.journal.passes[0].start,0);assert.equal(first.journal.passes[0].end,1);assert.equal(first.journal.passes[0].review.change,'Close the near edge');assert.equal(first.journal.marksHash,hash(first.ops));
 await writeFile(file,source([A,B]));await cli('write',file,'--continue','1');
 const second=await saved(2);assert.deepEqual(second.ops.slice(0,1),first.ops);assert.equal(second.journal.parent.relation,'continue');assert.equal(second.journal.passes[0].checkpointHash,first.journal.passes[0].checkpointHash);assert.equal(hash(await saved(1)),unchanged);
 await writeFile(file,source([B,A]));await assert.rejects(cli('write',file,'--continue','2'),/continuation changed earlier marks/);assert.equal((await index()).pages.length,2);
 await cli('write',file,'--branch','2');assert.equal((await saved(3)).journal.parent.relation,'branch');
 await writeFile(file,source([B,A],"page:{w:230,h:180}"));await assert.rejects(cli('write',file,'--continue','3'),/same paper and dimensions/);
 await writeFile(file,source([B,A],"build:()=>[pieces[0]]"));await assert.rejects(cli('write',file),/exactly equal/);
 const restore=join(fixtures,'resumed.js');await cli('resume','2','--out',restore);await cli('write',restore,'--continue','2');assert.deepEqual((await saved(4)).ops,second.ops);assert.deepEqual((await saved(4)).journal.passes,second.journal.passes);
 await assert.rejects(cli('resume','2','--out',restore),/EEXIST/);
 const fork=join(fixtures,'fork.js');await cli('resume','2','--pass','1','--out',fork);await cli('write',fork,'--branch','2');assert.deepEqual((await saved(5)).ops,first.ops);
 await assert.rejects(cli('resume','2','--pass','88','--out',join(fixtures,'absent.js')),/does not exist/);
 await cli('select','2','--stage','candidate','--note','The form holds, but one edge needs scrutiny');assert.equal((await index()).pages[1].stage,'candidate');assert.equal((await index()).selections.length,1);const readSelection=JSON.parse((await cli('read','2')).stdout);assert.equal(readSelection.stage,'candidate');assert.equal(readSelection.stageAtSave,'study');assert.deepEqual(await saved(2),second,'selection never rewrites pigment or its saved checkpoint');
 await assert.rejects(cli('select','2','--stage','exhibition'),/selection needs/);await assert.rejects(cli('select','2','--stage','public','--note','bad'),/stage must/);
 const legacy=join(fixtures,'legacy.js');await writeFile(legacy,`export default {title:'Legacy',note:'No invented pass history',build:()=>[${JSON.stringify(A)}]}`);await cli('write',legacy);assert.deepEqual((await saved(6)).journal.passes,[]);
 await writeFile(join(book,'.write-lock'),'external writer');await assert.rejects(cli('select','2','--note','must not write'),/being written/);await rm(join(book,'.write-lock'));assert.equal((await index()).selections.length,1);
 // Material gestures survive exactly, including subpixel pressure/time data.
 const M={k:'m',tool:'graphite-2b',size:2,strength:.7,samples:[{x:10.123,y:14.234,p:.2,tiltX:0,tiltY:0,t:0},{x:43.456,y:41.789,p:.7,tiltX:12,tiltY:4,t:100}]};
 await writeFile(file,source([M],"surface:{version:1,paper:'white',tooth:.6,seed:23}"));await cli('write',file);assert.deepEqual((await saved(7)).ops,[M]);
 const restoredMaterial=join(fixtures,'material-resume.js');await cli('resume','7','--out',restoredMaterial);await cli('write',restoredMaterial,'--continue','7');assert.deepEqual((await saved(8)).ops,[M]);
 await writeFile(file,`export default {title:'Invalid coordinate',note:'Reject null before rounding',build:()=>[{k:'s',pts:[[NaN,10],[20,20]],brush:'liner',layer:'line',w:1}]}`);await assert.rejects(cli('write',file),/marks were rejected/);assert.equal((await index()).pages.length,8);
 assert.throws(()=>compilePage({build:()=>[A],passes:[]}),/1 to 128/);
 assert.throws(()=>compilePage({build:()=>[A],passes:[{build:()=>[]}]}),/added marks/);
 console.log('Workflow: immutable snapshots, exact continuation, branching, pass journals/hashes, full and partial resume, mismatched builders, paper changes, selection history and writer exclusion passed.');
} finally {await rm(book,{recursive:true,force:true});await rm(fixtures,{recursive:true,force:true});}
