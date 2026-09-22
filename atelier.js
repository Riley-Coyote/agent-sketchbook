import { compilePage } from './page-program.js';

import { MarkEngine, loadFonts } from './mark-engine.js';
import { sanitizeOps, sanitizePageDimensions, sanitizeSurface, limitsForPage } from './validate.js';
/* glyph pages need their faces before anything is drawn */
await loadFonts();
const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const name = params.get('p') || 'codex-rain';
const bookPath = params.get('book');
const pageNumber = Number(params.get('page'));
const savedMode = bookPath !== null;
let comparing = false;
let engine = null, passes = [], selected = 0, allOps = [], lastTime = 0;
let dirty = true, version = 0, replayStart = 0;
let currentSurface;
const ctx = $('canvas').getContext('2d');

function report(error) { $('error').textContent = error.message || String(error); }
function controls(busy) {
  $('reload').disabled = busy || savedMode;
  $('new-version').disabled = busy;
  $('inspect').disabled = busy || !engine;
  $('compare').disabled = busy || selected < 1;
  for (const id of ['replay', 'finish', 'zoom', 'export']) $(id).disabled = busy || !engine || !passes.length;
  for (const button of $('history').children) button.disabled = busy;
}
function show() {
  if (engine && dirty) { engine.composite(ctx); dirty = false; }
  if (!engine) return;
  const progress = engine.cursor
    ? Math.max(0, Math.min(1, (engine.cursor.elapsed - replayStart) / (engine.total - replayStart || 1)))
    : 1;
  $('status').textContent = engine.cursor
    ? `${engine.phase || 'Drawing'} · ${Math.round(progress * 100)}%`
    : `Pass ${selected + 1} of ${passes.length} · paused to look`;
}
function paint(ops, allowAppend = false) {
  const prefix = allowAppend && allOps.length <= ops.length
    && allOps.every((op, i) => JSON.stringify(op) === JSON.stringify(ops[i]));
  if (prefix) {
    if (!engine.done) engine.finish();
    if (ops.length > allOps.length) engine.append(ops.slice(allOps.length));
    // An unchanged source leaves both pigment and its resample cache untouched.
  } else engine.load(ops).finish();
  allOps = ops;
  replayStart = 0;
  dirty = true;
}
function select(index) {
  if (!Number.isInteger(index) || !passes[index]) throw Error('That painting pass is unavailable.');
  paint(passes.slice(0, index + 1).flatMap(pass => pass.ops));
  selected = index;
  showReview();
  updateComparison();
  [...$('history').children].forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
  $('error').textContent = '';
  controls(false);
  show();
}
function checkedCandidate(raw, dimensions, surface) {
  const checked = sanitizeOps(raw.ops, limitsForPage(dimensions, surface));
  if (!checked.ops) throw Error(checked.errors.join('\n'));
  const records = raw.meta.passes || [{name:'Saved drawing', note:raw.meta.note || '',start:0,end:checked.ops.length}];
  let end = 0;
  const built = records.map((pass,i) => {
    if (!Number.isInteger(pass.start) || pass.start !== end || !Number.isInteger(pass.end) || pass.end <= end || pass.end > checked.ops.length) throw Error(`Invalid checkpoint ${i+1}`);
    end = pass.end;
    return {...pass, ops:checked.ops.slice(pass.start, pass.end)};
  });
  if (end !== checked.ops.length) throw Error('Checkpoint ranges must cover all saved marks');
  return {passes:built,ops:checked.ops};
}
function showReview() {
  const pass = passes[selected];
  $('note').textContent = pass.note;
  $('pass-review').replaceChildren();
  for (const [key,label] of [['observation','What I saw'],['change','What I changed'],['next','What to look at next']]) {
    if (!pass.review?.[key]) continue;
    const dt=document.createElement('dt'),dd=document.createElement('dd');
    dt.textContent=label;dd.textContent=pass.review[key];$('pass-review').append(dt,dd);
  }
  if (pass.review?.region) ['crop-x','crop-y','crop-w','crop-h'].forEach((id,i)=>$(id).value=pass.review.region[i]);
  $('detail-canvas').hidden=true;
  $('commands').textContent = savedMode
    ? `node book.mjs journal ${pageNumber} --book ${bookPath}\nnode book.mjs resume ${pageNumber} --book ${bookPath} --out pages/my-next-pass.js${selected < passes.length-1 ? ` --pass ${selected+1}` : ''}\nnode book.mjs write pages/my-next-pass.js --book ${bookPath} --${selected < passes.length-1 ? 'branch' : 'continue'} ${pageNumber}`
    : `node book.mjs write pages/${name}.js --book books/my-study\n# After saving: append a pass and use --continue PAGE.\n# Changed the earlier composition? Use --branch PAGE.`;
}
function updateComparison() {
  if (selected < 1) comparing = false;
  $('workspace').classList.toggle('comparing',comparing);
  $('comparison').hidden=!comparing;
  $('current-label').hidden=!comparing;
  $('compare').setAttribute('aria-pressed',String(comparing));
  if (!comparing) return;
  const before = new MarkEngine({width:engine.w,height:engine.h,dpr:engine.dpr,surface:currentSurface});
  before.load(passes.slice(0,selected).flatMap(p=>p.ops)).finish();
  const cv=$('compare-canvas');cv.width=$('canvas').width;cv.height=$('canvas').height;
  before.composite(cv.getContext('2d'));
  $('compare-label').textContent=`Before · ${passes[selected-1].name}`;
  $('current-label').textContent=`After · ${passes[selected].name}`;
}
async function load(allowReset=false) {
  controls(true);
  $('status').textContent = savedMode ? 'Reading saved marks…' : 'Reading source…';
  $('error').textContent = '';
  try {
    let page, raw;
    if (savedMode) {
      if (!/^[\w-]+(?:\/[\w-]+)*$/.test(bookPath) || !Number.isInteger(pageNumber) || pageNumber < 1) throw Error('Invalid saved book or page');
      const response = await fetch(`./${bookPath}/book.json`,{cache:'no-store'});
      if (!response.ok) throw Error(`Book unavailable (${response.status})`);
      const index = await response.json(), meta = index.pages.find(p=>p.index===pageNumber);
      if (!meta || !/^pages\/\d+\.json$/.test(meta.file)) throw Error('Saved page unavailable');
      const saved = await fetch(`./${bookPath}/${meta.file}`,{cache:'no-store'});
      if (!saved.ok) throw Error(`Page unavailable (${saved.status})`);
      page=await saved.json();raw={ops:page.ops,meta:{...page,...(page.journal?.passes?.length ? {passes:page.journal.passes} : {})}};
      $('stage-label').textContent=meta.stage || 'Unclassified';
      $('book-link').href=`index.html?book=${encodeURIComponent(bookPath)}#${pageNumber}`;
      $('workflow-note').textContent='This is a saved checkpoint, opened without running its source. Resume creates a new source file with the selected marks preserved. Add a pass there, then save the continuation; earlier book pages remain intact.';
    } else {
      if (!/^[a-zA-Z0-9_-]+$/.test(name)) throw Error('Invalid page module name.');
      page=(await import(`./pages/${name}.js?v=${Date.now()}-${version++}`)).default;
      raw=compilePage(page);
      $('workflow-note').textContent = raw.meta.motion
        ? `This page moves (${raw.meta.motion.frames} frames at ${raw.meta.motion.fps} fps); the atelier shows its frames as a still. Watch it loop at page.html?p=${name}, or see every frame with: node book.mjs preview pages/${name}.js --out sheet.png --sheet`
        : 'Edit this trusted local source and append a named pass. Continue preserves the earlier marks. If you deliberately change them, load the revised composition and save it as a branch of the earlier page. These controls do not write files; save from the CLI.';
    }
    const dims = sanitizePageDimensions(page.page);
    if (!dims.page) throw Error(dims.errors.join('; '));
    const { surface, errors: surfaceErrors } = sanitizeSurface(page.surface);
    if (surface === null) throw Error('Page surface rejected: ' + surfaceErrors.join('; '));
    const { w, h } = dims.page;
    // A failed edit must leave the last good painting, pass controls and replay intact.
    const candidate = checkedCandidate(raw, dims.page, surface);
    if (engine && !allowReset && !savedMode) {
      const sameSurface=engine.w===w && engine.h===h && JSON.stringify(currentSurface)===JSON.stringify(surface);
      const previous=passes.flatMap(pass=>pass.ops);
      if (!sameSurface || previous.length>candidate.ops.length || previous.some((op,i)=>JSON.stringify(op)!==JSON.stringify(candidate.ops[i]))) {
        $('new-version').hidden=false;
        throw Error('Earlier marks or paper changed. The previous painting is intact. Restore them to continue, or load the revised composition as a new version.');
      }
    }
    $('new-version').hidden=true;
    if (!engine || engine.w !== w || engine.h !== h || JSON.stringify(currentSurface) !== JSON.stringify(surface)) {
      const dpr = Math.min(2, Math.sqrt(8000000 / (w * h)));
      const next = new MarkEngine({ width: w, height: h, dpr, surface });
      next.load(candidate.ops).finish();
      engine = next;
      currentSurface = surface;
      allOps = candidate.ops;
      replayStart = 0;
      $('canvas').width = w * dpr;
      $('canvas').height = h * dpr;
      $('stage').style.aspectRatio = `${w}/${h}`;
      $('stage').style.setProperty('--page-width', `${w}px`);
      dirty = true;
    } else paint(candidate.ops, !allowReset);
    passes = candidate.passes;
    selected = passes.length - 1;
    $('size').textContent = `${w} × ${h} · ${Number(engine.dpr.toFixed(2))}× pigment resolution`;
    $('title').textContent = String(page.title || 'Sketchbook · Atelier');
    $('canvas').setAttribute('aria-label', String(page.title || 'The drawing'));
    $('history').replaceChildren(...passes.map((pass, i) => {
      const button = document.createElement('button');
      button.textContent = `${i + 1} · ${pass.name}`;
      button.setAttribute('aria-pressed', String(i === selected));
      button.onclick = () => { try { select(i); } catch (error) { report(error); } };
      return button;
    }));
    showReview();
    updateComparison();
    show();
  } catch (error) {
    report(error);
    if (!engine) $('status').textContent = 'Unable to load drawing';
    else show();
  } finally { controls(false); }
}
function finish() {
  if (!engine) return;
  if (!engine.done) engine.finish();
  dirty = true;
  show();
}
$('reload').onclick = () => load();
$('new-version').onclick = () => load(true);
$('compare').onclick = () => {comparing=!comparing;updateComparison();};
$('inspect').onclick = () => {
  try {
    finish();
    const [x,y,w,h]=['crop-x','crop-y','crop-w','crop-h'].map(id=>Number($(id).value));
    if (![x,y,w,h].every(Number.isInteger) || x<0 || y<0 || w<1 || h<1 || x+w>engine.w || y+h>engine.h) throw Error('Choose a detail inside the drawing.');
    const cv=$('detail-canvas');cv.width=Math.round(w*engine.dpr);cv.height=Math.round(h*engine.dpr);
    cv.getContext('2d').drawImage($('canvas'),x*engine.dpr,y*engine.dpr,w*engine.dpr,h*engine.dpr,0,0,cv.width,cv.height);
    cv.hidden=false;$('error').textContent='';
  } catch(error){report(error);}
};
$('finish').onclick = finish;
$('replay').onclick = () => {
  try {
    if (!engine || !passes[selected]) return;
    const before = passes.slice(0, selected).flatMap(pass => pass.ops);
    engine.load(before).finish();
    replayStart = engine.total;
    engine.append(passes[selected].ops, { animate: !matchMedia('(prefers-reduced-motion: reduce)').matches });
    dirty = true;
    show();
  } catch (error) { report(error); }
};
$('zoom').onclick = () => {
  const on = $('viewport').classList.toggle('zoom');
  $('zoom').setAttribute('aria-pressed', String(on));
  $('zoom').textContent = on ? 'Fit to window' : 'Inspect at 100%';
};
$('export').onclick = async () => {
  if (!engine) return;
  $('export').disabled = true;
  try {
    finish();
    const filename = `${savedMode ? `page-${pageNumber}` : name}-pass-${selected + 1}.png`;
    const cv = document.createElement('canvas');
    cv.width = $('canvas').width;
    cv.height = $('canvas').height;
    const c = cv.getContext('2d');
    // Material composites already include their paper. Legacy pigment keeps its original ground.
    if (!currentSurface) {
      c.fillStyle = getComputedStyle($('stage')).backgroundColor;
      c.fillRect(0, 0, cv.width, cv.height);
    }
    c.drawImage($('canvas'), 0, 0);
    const blob = await new Promise(resolve => cv.toBlob(resolve, 'image/png'));
    if (!blob) throw Error('The browser could not export this drawing.');
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) { report(error); }
  finally { $('export').disabled = false; }
};
function frame(time) {
  requestAnimationFrame(frame);
  if (engine?.cursor) {
    engine.tick(Math.min(.05, (time - lastTime) / 1000), 8);
    dirty = true;
    show();
  }
  lastTime = time;
}
requestAnimationFrame(frame);
await load();
