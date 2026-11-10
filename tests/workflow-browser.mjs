import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {writeFile,rm,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const run=promisify(execFile);
const ROOT=resolve(import.meta.dirname,'..'),base=process.argv[2]||'http://127.0.0.1:4194';
const file=resolve(ROOT,'pages/workflow-browser-fixture.js');
const bookPath=`books/workflow-browser-${process.pid}`;
const book=resolve(ROOT,bookPath);
const cli=(...args)=>run(process.execPath,[resolve(ROOT,'book.mjs'),...args,'--book',book],{cwd:ROOT});
const moduleText=(n=1,x=50,paper='')=>`const passes=Array.from({length:${n}},(_,i)=>({name:'Layer '+(i+1),note:'Observed edge '+i,review:{observation:'A hard edge',change:'Added local marks',next:'Look at the join',region:[20,20,180,120]},build:()=>[{k:'s',pts:[[${x},50+i*40],[250,70+i*40]],brush:'soft',layer:'line',w:2,c:[230,230,230]}]}));export default {title:'Revision trial',note:'A native test',page:{w:320,h:260},${paper&&paper+','}passes,build:()=>passes.flatMap(p=>p.build())};`;
const browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1440,height:1050}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
const pixels=()=>page.locator('#canvas').evaluate(c=>c.toDataURL());
const settled=()=>page.waitForFunction(()=>document.querySelector('#status').textContent.includes('paused to look'));
try {
 await mkdir(resolve(ROOT,'review/workflow'),{recursive:true});
 await writeFile(file,moduleText());
 await page.goto(`${base}/atelier.html?p=workflow-browser-fixture`);await settled();
 const original=await pixels();assert.equal(await page.locator('#history button').count(),1);
 await writeFile(file,moduleText(2));await page.locator('#reload').click();await settled();assert.equal(await page.locator('#history button').count(),2);const two=await pixels();assert.ok(two!==original,'the appended pass is painted into the visible canvas');
 await page.locator('#compare').click();assert.equal(await page.locator('#comparison').isVisible(),true);assert.equal(await page.locator('#compare-canvas').evaluate(c=>c.toDataURL()),original,'previous checkpoint displays identical native pigment');
 await page.locator('#history button').first().click();assert.equal(await pixels(),original);assert.equal(await page.locator('#compare').isDisabled(),true);
 await page.locator('#history button').last().click();
 await writeFile(file,moduleText(2,90));await page.locator('#reload').click();await page.waitForFunction(()=>document.querySelector('#error').textContent.includes('Earlier marks'));assert.equal(await pixels(),two,'changed source leaves pigment intact');
 await page.locator('#new-version').click();await settled();assert.ok(await pixels()!==two,'explicit new composition repaints the visible canvas');assert.equal(await page.locator('#error').innerText(),'');
 const revised=await pixels();await writeFile(file,'export default {');await page.locator('#reload').click();await page.waitForFunction(()=>document.querySelector('#error').textContent.length>0);assert.equal(await pixels(),revised,'bad source leaves the last good image intact');
 await writeFile(file,moduleText(3,90));await page.locator('#reload').click();await settled();
 await page.locator('#inspection summary').click();await page.locator('#inspect').click();assert.equal(await page.locator('#detail-canvas').isVisible(),true);assert.deepEqual(await page.locator('#detail-canvas').evaluate(c=>[c.width,c.height]),[360,240]);
 await page.locator('#crop-x').fill('999');await page.locator('#inspect').click();assert.match(await page.locator('#error').innerText(),/inside the drawing/);
 await page.emulateMedia({reducedMotion:'reduce'});await page.locator('#replay').click();await settled();
 // Desktop and narrow layouts, including comparison and inspection states.
 await writeFile(file,moduleText(4,90,"paper:'night'"));await cli('init','--owner','Browser workflow');await cli('write',file);
 await page.goto(`${base}/atelier.html?book=${bookPath}&page=1`);await settled();assert.equal(await page.locator('#reload').isDisabled(),true);assert.equal(await page.locator('#stage-label').innerText(),'study');assert.equal(await page.locator('#history button').count(),4);
 await page.locator('#compare').click();await page.screenshot({path:resolve(ROOT,'review/workflow/desktop-comparison.png'),fullPage:true});
 await page.setViewportSize({width:375,height:850});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal page overflow');await page.screenshot({path:resolve(ROOT,'review/workflow/mobile-comparison.png'),fullPage:true});
 await page.locator('#inspection summary').click();await page.locator('#inspect').click();assert.equal(await page.locator('#detail-canvas').isVisible(),true);
 await page.locator('#zoom').click();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'zoom scroll stays inside its viewport');await page.locator('#zoom').click();
 await page.goto(`${base}/index.html?book=${bookPath}#1`);await page.locator('#process-link').waitFor();await page.waitForFunction(()=>document.querySelector('#selection').textContent.includes('study'));await page.locator('#process-link').click();await settled();assert.equal(await page.locator('#history button').count(),4);
 // A source with passes crosses the browser sandbox with named ranges intact.
 const checked=await page.evaluate(async()=>{const {runPageSource}=await import('./sandbox-browser.js');const src=`const passes=[{name:'First',note:'Observed',build:()=>[{k:'p',ms:1}]},{name:'Second',review:{observation:'A gap',change:'Closed it',next:'Look again'},build:()=>[{k:'p',ms:2}]}];export default {title:'Journal',note:'Test',passes,build:()=>passes.flatMap(p=>p.build())};`;return runPageSource(src);});assert.equal(checked.meta.passes[1].start,1);assert.equal(checked.meta.passes[1].review.change,'Closed it');
 assert.deepEqual(errors.filter(e=>!e.includes("Unexpected end of input")),[]);
 console.log('Browser workflow passed: real retained pixels, append, compare, explicit branch, failed-edit recovery, crops, reduced motion, saved journals, book link, sandbox pass metadata and narrow layouts.');
} finally {await browser.close();await rm(file,{force:true});await rm(book,{recursive:true,force:true});}
