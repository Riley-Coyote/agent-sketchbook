#!/usr/bin/env node
/* book.mjs — the agent-facing side of the sketchbook.
 *
 * A book is a folder: book.json is the index, pages/NNN.json is a page — its
 * marks (ops) and the source that made them. This tool is how an agent writes
 * into it. The viewer (index.html) only reads.
 *
 *   node book.mjs init  --owner <name> [--title ..] [--license ..] [--book <dir>]
 *   node book.mjs list                     [--book <dir>]
 *   node book.mjs read  <n> [--source]     [--book <dir>]
 *   node book.mjs write <module.js> [--refs 2,3] [--title ..] [--note ..] [--date ..]
 *   node book.mjs render <n> --out <file.png> [--scale 2] [--transparent]
 *   node book.mjs journal <n>
 *   node book.mjs resume <n> --out <new-module.js> [--pass N]
 *   node book.mjs select <n> --stage study|candidate|exhibition --note <reason>
 *   node book.mjs blank
 *
 * `--book <dir>` picks the book (default: ./book). One folder per mind.
 *
 * write runs the module in the sandbox (sandbox.mjs: no globals, no network,
 * imports only from this folder, a time limit) and keeps only marks that pass
 * validate.js. `--unsafe` imports the module directly; for your own pages
 * while developing, never for someone else's.
 */

import { readFile, writeFile, mkdir, rename, rm } from 'node:fs/promises';
import { compilePage } from './page-program.js';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve, dirname, relative, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { sanitizeOps, sanitizePageMeta, sanitizePageDimensions, sanitizeSurface, sanitizeMotion, countFrames, limitsForPage } from './validate.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PAGES = 48;
const WALL_MS = 30000;

const [cmd, ...args] = process.argv.slice(2);
const arg = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const flag = (name) => args.includes(name);
const BOOK_DIR = resolve(process.cwd(), arg('--book') || resolve(ROOT, 'book'));
const INDEX = resolve(BOOK_DIR, 'book.json');

async function loadBook() {
  if (!existsSync(INDEX)) throw new Error(`no book at ${relative(process.cwd(), BOOK_DIR) || '.'} — run: node book.mjs init --owner <name>`);
  return JSON.parse(await readFile(INDEX, 'utf8'));
}
async function saveBook(book) {
  await mkdir(resolve(BOOK_DIR, 'pages'), { recursive: true });
  const temporary = `${INDEX}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(book, null, 2) + '\n');
  await rename(temporary, INDEX);
}

const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const stageNames = ['study', 'candidate', 'exhibition'];
function stageArg(fallback = 'study') {
  const stage = arg('--stage') || fallback;
  if (!stageNames.includes(stage)) throw Error('stage must be study, candidate or exhibition');
  return stage;
}
async function savedPage(book, n) {
  const meta = book.pages.find(p => p.index === n);
  if (!meta) throw Error(`no page ${n}`);
  return { meta, page: JSON.parse(await readFile(resolve(BOOK_DIR, meta.file), 'utf8')) };
}
/** A page's motion, checked against the frame breaks in its marks. */
function motionFor(input, dimensions, ops) {
  const { motion, errors } = sanitizeMotion(input, dimensions);
  if (motion === null) throw new Error(`the page motion was rejected: ${errors.join('; ')}`);
  const frames = countFrames(ops);
  if (!motion && frames > 1) throw new Error('the marks hold frame breaks but the page declares no motion');
  if (motion && motion.frames !== frames) throw new Error(`motion declares ${motion.frames} frames but the marks hold ${frames}`);
  return motion;
}

/** --frame N (1-based) or --sheet for a motion page; nothing for a still. */
function frameArgs(motion) {
  const sheet = flag('--sheet');
  const f = arg('--frame');
  if (!motion) {
    if (sheet || f !== undefined) throw new Error('--frame and --sheet are for motion pages');
    return {};
  }
  if (sheet && f !== undefined) throw new Error('choose --frame or --sheet');
  if (sheet) return { sheet: true };
  if (f === undefined) return { frame: 0 };
  const n = Number(f);
  if (!Number.isInteger(n) || n < 1 || n > motion.frames) throw new Error(`--frame needs 1 to ${motion.frames}`);
  return { frame: n - 1 };
}

function checkpoint(page) {
  if (arg('--pass') === undefined) return { ops: page.ops, passes: page.journal?.passes || [] };
  const number = Number(arg('--pass'));
  const passes = page.journal?.passes;
  if (!Number.isInteger(number) || !passes?.[number - 1]) throw Error('that saved pass does not exist; use journal <page> to inspect the checkpoints');
  return { ops: page.ops.slice(0, passes[number - 1].end), passes: passes.slice(0, number) };
}
let lock;
async function acquireLock() {
  await mkdir(BOOK_DIR, { recursive: true });
  lock = resolve(BOOK_DIR, '.write-lock');
  try { await writeFile(lock, String(process.pid), { flag: 'wx' }); }
  catch (error) { lock = null; if (error.code === 'EEXIST') throw Error('book is being written; retry after the other writer finishes (check .write-lock if a process crashed)'); throw error; }
}

const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;
function roundOp(op) {
  const o = { ...op };
  if (o.pts) o.pts = o.pts.map((p) => [r1(p[0]), r1(p[1])]);
  if (o.poly) o.poly = o.poly.map((p) => [r1(p[0]), r1(p[1])]);
  for (const k of ['x', 'y', 'r']) if (typeof o[k] === 'number') o[k] = r1(o[k]);
  if (typeof o.w === 'number') o.w = r2(o.w);
  return o;
}

/** Run a page module and get { ops, meta } — through the sandbox unless --unsafe. */
async function buildPage(modPath) {
  if (flag('--unsafe')) {
    const mod = await import(pathToFileURL(modPath).href);
    const page = mod.default;
    if (!page || typeof page !== 'object') throw new Error('a page module exports default { title, date, note, build }');
    return compilePage(page);
  }
  const { stdout } = await promisify(execFile)(
    process.execPath,
    ['--experimental-vm-modules', '--no-warnings', resolve(ROOT, 'sandbox.mjs'), modPath],
    { timeout: WALL_MS, killSignal: 'SIGKILL', maxBuffer: 256 * 1024 * 1024 },
  ).catch((e) => {
    if (e.killed) throw new Error(`the page did not finish within ${WALL_MS / 1000}s`);
    if (e.stdout) return { stdout: e.stdout };
    throw e;
  });
  const out = JSON.parse(stdout.trim().split('\n').pop());
  if (out.error) throw new Error(`sandbox: ${out.error}`);
  return out;
}

/* ---------------------------------------------------------------- render
 *
 * A page is a stroke program, and the hand that runs it is the engine — which
 * needs a canvas. So a flat PNG of a page is made the way the viewer makes a
 * thumbnail: load the marks, finish(), toDataURL(). That happens in a real
 * browser, driven by playwright. Without playwright the command says how to do
 * the same three calls by hand and exits 2.
 */

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.woff': 'font/woff' };

const MANUAL = `render draws the page in a real browser — the engine needs a canvas — and
playwright is not installed here.

  npm i playwright-core && npx playwright install chromium

Or make the PNG by hand; it is the same three calls:

  1. serve this folder            python3 -m http.server 8000
  2. open                         http://localhost:8000/index.html?book=<book dir>
     turn to the page (or use page.html?p=<module> for a page module)
  3. in the console               engine.finish(); copy(engine.toDataURL())
  4. write the file               pbpaste | sed 's|^data:image/png;base64,||' \\
                                    | base64 -d > page.png

The drawing is light on black paper: the flattened canvas is transparent, so
lay it over the book's ground (#07070a) wherever it is shown.`;

async function playwright() {
  for (const name of ['playwright-core', 'playwright']) {
    try { return (await import(name)).chromium; } catch { /* try the next one */ }
  }
  return null;
}

/** Serve this folder (plus the page's own marks) so the engine can be imported as a module. */
function serve(payload) {
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent((req.url || '/').split('?')[0]);
    const send = (code, type, body) => { res.writeHead(code, { 'content-type': type }); res.end(body); };
    if (path === '/__page.json') return send(200, 'application/json', JSON.stringify(payload));
    if (path === '/__render.html') return send(200, 'text/html', RENDER_HTML);
    const file = resolve(ROOT, '.' + path);
    if (relative(ROOT, file).startsWith('..') || !existsSync(file)) return send(404, 'text/plain', 'not here');
    try { send(200, MIME[extname(file)] || 'application/octet-stream', await readFile(file)); }
    catch { send(500, 'text/plain', 'unreadable'); }
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok({ server, port: server.address().port })));
}

const RENDER_HTML = `<!doctype html><meta charset="utf-8"><title>render</title>
<body style="margin:0;background:#07070a">
<script type="module">
import { MarkEngine } from '/mark-engine.js';
const page = await (await fetch('/__page.json')).json();
const engine = new MarkEngine({ width: page.w, height: page.h, dpr: page.scale, surface: page.surface });
engine.load(page.ops);
await engine.ready();
if (page.frame !== undefined) engine.drawFrame(page.frame); else engine.finish();
const flat = engine.toDataURL();
if (page.sheet) {
  /* every frame of a motion page on one sheet, in order, numbered: the way
   * to see a loop you can't watch */
  const pictures = engine.motionFrames();
  const n = pictures.length, cols = Math.ceil(Math.sqrt(n)), rows = Math.ceil(n / cols);
  const cw = page.w * page.scale, ch = page.h * page.scale, gap = Math.round(6 + 4 * page.scale);
  const sheet = document.createElement('canvas');
  sheet.width = cols * cw + (cols + 1) * gap; sheet.height = rows * ch + (rows + 1) * gap;
  const c = sheet.getContext('2d');
  c.fillStyle = '#16161a'; c.fillRect(0, 0, sheet.width, sheet.height);
  c.font = Math.max(10, Math.round(12 * page.scale)) + 'px sans-serif';
  pictures.forEach((p, i) => {
    const x = gap + (i % cols) * (cw + gap), y = gap + Math.floor(i / cols) * (ch + gap);
    c.drawImage(p, x, y, cw, ch);
    c.fillStyle = 'rgba(255,255,255,.72)'; c.fillText(String(i + 1), x + 4, y + ch - 5);
  });
  window.__png = sheet.toDataURL('image/png');
}

if (page.sheet) { /* done above */ }
else if (page.transparent || page.surface) { window.__png = flat; }
else {
  /* the paper the book is drawn on — the viewer's own ground, so the PNG
     reads the same outside the viewer as inside it. */
  const out = document.createElement('canvas');
  out.width = page.w * page.scale; out.height = page.h * page.scale;
  const c = out.getContext('2d');
  const g = c.createRadialGradient(out.width * 0.3, out.height * 0.12, 0, out.width * 0.3, out.height * 0.12, out.width * 1.2);
  g.addColorStop(0, '#14151a'); g.addColorStop(0.52, '#0b0b0f'); g.addColorStop(1, '#07070a');
  c.fillStyle = g; c.fillRect(0, 0, out.width, out.height);
  const ink = new Image();
  ink.src = flat;
  await ink.decode();
  c.drawImage(ink, 0, 0);
  window.__png = out.toDataURL('image/png');
}
if (page.crop) {
  const [x,y,w,h] = page.crop;
  const image = new Image(); image.src = window.__png; await image.decode();
  const crop = document.createElement('canvas'); crop.width = Math.round(w * page.scale); crop.height = Math.round(h * page.scale);
  crop.getContext('2d').drawImage(image, x*page.scale,y*page.scale,w*page.scale,h*page.scale,0,0,crop.width,crop.height);
  window.__png = crop.toDataURL('image/png');
}
window.__ready = true;
</script>`;

/** --scale and --crop, checked the same way for render and preview. */
function viewArgs(dimensions, frames = 1) {
  const scale = arg('--scale') === undefined ? (frames > 1 ? 0.5 : 2) : Number(arg('--scale'));
  if (!Number.isFinite(scale) || scale < .1 || scale > 4 || frames * dimensions.w * dimensions.h * scale * scale > 32000000) throw Error('scale needs 0.1 to 4, at most 32 million output pixels (a contact sheet counts every frame)');
  if (frames > 1 && arg('--crop') !== undefined) throw Error('crop a single --frame, not a contact sheet');
  const crop = arg('--crop')?.split(',').map(Number);
  if (crop && (crop.length !== 4 || !crop.every(Number.isInteger) || crop[0] < 0 || crop[1] < 0 || crop[2] <= 0 || crop[3] <= 0 || crop[0]+crop[2] > dimensions.w || crop[1]+crop[3] > dimensions.h)) throw Error('crop needs x,y,width,height inside the page');
  return { scale, crop };
}

async function renderPage({ ops, w, h, scale, surface, transparent, crop, frame, sheet, out }) {
  const chromium = await playwright();
  if (!chromium) { console.error(MANUAL); process.exit(2); }
  const { server, port } = await serve({ ops, w, h, scale, surface, transparent, crop, frame, sheet });
  const browser = await chromium.launch();
  try {
    const tab = await browser.newPage();
    const failures = [];
    tab.on('pageerror', (e) => failures.push(String(e)));
    await tab.goto(`http://127.0.0.1:${port}/__render.html`);
    await tab.waitForFunction('window.__ready === true', null, { timeout: 60000 })
      .catch(() => { throw new Error(`the page did not draw${failures.length ? `: ${failures[0]}` : ''}`); });
    const url = await tab.evaluate('window.__png');
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
  } finally {
    await browser.close();
    server.close();
  }
}

try {
  if (['init', 'write', 'select'].includes(cmd)) await acquireLock();
  if (cmd === 'help' || cmd === '--help') {
    console.log(`Start here: START_HERE.md
init --owner NAME --book DIR
write pages/work.js --book DIR [--continue PAGE | --branch PAGE | --refs PAGES]
journal PAGE --book DIR
render PAGE --book DIR --out image.png [--pass N] [--crop x,y,w,h] [--scale 1]
preview pages/work.js --out image.png [--pass N] [--crop x,y,w,h] [--scale 1]   (saves nothing)
resume PAGE --book DIR --out pages/new.js [--pass N]
select PAGE --book DIR --stage study|candidate|exhibition --note REASON
list | read PAGE [--source] | blank --book DIR
Saving defaults to a study. Selection records intent; it does not publish or grant access.`);
  } else if (cmd === 'init') {
    const owner = arg('--owner');
    if (!owner) throw new Error('init needs --owner <name>');
    if (existsSync(INDEX)) throw new Error(`a book already exists at ${relative(process.cwd(), BOOK_DIR)}`);
    const book = {
      id: `sketchbook-${owner.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString(36)}`,
      title: arg('--title') || 'Sketchbook',
      owner,
      created: new Date().toISOString().slice(0, 10),
      pageCount: Number(arg('--pages')) || PAGES,
      /* the drawings in a book belong to whoever drew them. the book says on what terms. */
      license: arg('--license') || 'all rights reserved by the owner',
      pages: [],
    };
    await saveBook(book);
    console.log(`new book for ${owner} at ${relative(process.cwd(), BOOK_DIR) || '.'} — ${book.pageCount} blank pages`);
  } else if (cmd === 'list' || !cmd) {
    const book = await loadBook();
    console.log(`${book.title} (${book.owner}) — ${book.pages.length} of ${book.pageCount} pages drawn — pages: ${book.license || 'no license stated'}`);
    for (const p of book.pages) {
      const refs = p.refs?.length ? `  ↺ ${p.refs.join(',')}` : '';
      console.log(`  ${String(p.index).padStart(2)}  ${p.date}  ${p.title}${refs}  (${p.opCount} marks · ${p.stage || 'unclassified'})`);
    }
  } else if (cmd === 'read') {
    const book = await loadBook();
    const n = Number(args[0]);
    const meta = book.pages.find((p) => p.index === n);
    if (!meta) throw new Error(`no page ${n}`);
    const page = JSON.parse(await readFile(resolve(BOOK_DIR, meta.file), 'utf8'));
    const { ops, source, ...rest } = page;
    console.log(JSON.stringify({ ...rest, stage: meta.stage || rest.stage || 'unclassified', stageAtSave: rest.stage, ...(meta.selectionNote ? { selectionNote: meta.selectionNote } : {}), opCount: ops.length, sourceBytes: source.length }, null, 2));
    if (flag('--source')) console.log('\n' + source);
  } else if (cmd === 'journal') {
    const book = await loadBook();
    const { meta, page } = await savedPage(book, Number(args[0]));
    console.log(JSON.stringify({ title: meta.title, stage: meta.stage || 'unclassified', selectionNote: meta.selectionNote || '', journal: page.journal || null, note: page.journal ? undefined : 'Legacy page: no recorded passes. Source and marks remain available; no review history has been invented.' }, null, 2));
  } else if (cmd === 'resume') {
    const book = await loadBook();
    const n = Number(args[0]);
    const { page } = await savedPage(book, n);
    const target = arg('--out');
    if (!target || !target.endsWith('.js')) throw Error('resume needs --out pages/new-name.js');
    const restored = checkpoint(page);
    const passes = restored.passes.length ? restored.passes : [{ name: 'Saved marks', note: page.note, start: 0, end: restored.ops.length }];
    const data = passes.map(pass => ({ name: pass.name, note: pass.note, ...(pass.review ? { review: pass.review } : {}), ops: restored.ops.slice(pass.start, pass.end) }));
    const frozen = '[\n' + data.map(({ops, ...entry}) => `${JSON.stringify(entry).slice(0,-1)},"ops":[\n${ops.map(op=>JSON.stringify(op)).join(',\n')}\n]}`).join(',\n') + '\n]';
    const source = `// Restored from book ${book.id}, page ${n}. Earlier marks are frozen data.
// Add a new pass; do not change these checkpoints when continuing.
// BEGIN FROZEN MARKS (one operation per line; fold this block while editing)\nconst saved = ${frozen};\n// END FROZEN MARKS — add your next pass below
const passes = saved.map(({ops, ...entry}) => ({...entry, build: () => ops}));
// passes.push({name: 'Next pass', note: 'What changed after looking', build: () => [...]});
export default {
  title: ${JSON.stringify(page.title)}, date: ${JSON.stringify(new Date().toISOString().slice(0,10))},
  note: ${JSON.stringify(page.note)}, page: ${JSON.stringify(page.page || {w:880,h:660})},
  ${page.surface ? `surface: ${JSON.stringify(page.surface)},` : ''}
  passes, build: () => passes.flatMap(pass => pass.build())
};
`;
    await writeFile(resolve(target), source, { flag: 'wx' });
    console.log(`Restored page ${n}${arg('--pass') ? `, pass ${arg('--pass')}` : ''} to ${target}. Save with --${arg('--pass') ? 'branch' : 'continue'} ${n}. The original source remains in the book.`);
  } else if (cmd === 'select') {
    const book = await loadBook();
    const { meta } = await savedPage(book, Number(args[0]));
    const stage = stageArg();
    const note = (arg('--note') || '').trim();
    if (!note) throw Error('selection needs --note: an artistic reason, not a test result');
    meta.stage = stage;
    meta.selectionNote = note;
    (book.selections ||= []).push({ page: meta.index, stage, note, at: new Date().toISOString() });
    await saveBook(book);
    console.log(`Page ${meta.index}: ${stage}. Recorded selection only; no gallery or sharing settings changed.`);
  } else if (cmd === 'blank') {
    const book = await loadBook();
    console.log(book.pageCount - book.pages.length);
  } else if (cmd === 'write') {
    const book = await loadBook();
    if (['--continue', '--branch', '--refs'].filter(flag).length > 1) throw Error('choose one of --continue, --branch or --refs');
    const stage = stageArg();
    const selectionNote = (arg('--selection-note') || '').trim();
    if (stage !== 'study' && !selectionNote) throw Error('candidate/exhibition needs --selection-note: why this work is selected');
    if (!args[0] || args[0].startsWith('--')) throw new Error('write needs a page module');
    const modPath = resolve(process.cwd(), args[0]);
    if (book.pages.length >= book.pageCount) throw new Error('the book is full');
    const built = await buildPage(modPath);
    const { page, errors: dimensionErrors } = sanitizePageDimensions(built.meta.page);
    if (!page) throw new Error(`the page dimensions were rejected: ${dimensionErrors.join('; ')}`);
    const { surface, errors: surfaceErrors } = sanitizeSurface(built.meta.surface);
    if (surface === null) throw new Error(`the page surface was rejected: ${surfaceErrors.join('; ')}`);
    // Validate before rounding: JSON null must never be coerced into coordinate zero.
    const raw = sanitizeOps(built.ops, limitsForPage(page, surface));
    if (!raw.ops) throw new Error(`the page's marks were rejected:\n  ${raw.errors.join('\n  ')}`);
    // Material gestures retain pressure, tilt, time and subpixel coordinates exactly.
    const prepared = raw.ops.map(op => op.k === 'm' ? op : roundOp(op));
    const { ops, errors, stats } = sanitizeOps(prepared, limitsForPage(page, surface));
    if (!ops) throw new Error(`the page's marks were rejected:\n  ${errors.join('\n  ')}`);
    if (ops.length === 0) throw new Error('the page has no marks');
    const { meta: m } = sanitizePageMeta({
      title: arg('--title') || built.meta.title,
      date: arg('--date') || built.meta.date,
      note: arg('--note') || built.meta.note,
      refs: (arg('--refs') || arg('--continue') || arg('--branch') || '').split(',').filter(Boolean).map(Number).concat(built.meta.refs || []),
    });
    if (!m.note) throw new Error('a page needs a note: what was attempted, and where it failed');
    for (const r of m.refs) if (!book.pages.some((p) => p.index === r)) throw new Error(`refs page ${r}, which is not in the book`);
    const source = await readFile(modPath, 'utf8');
    let parent;
    const relation = flag('--continue') ? 'continue' : flag('--branch') ? 'branch' : null;
    if (relation) {
      const n = Number(arg(`--${relation}`));
      const previous = (await savedPage(book, n)).page;
      if (relation === 'continue') {
        if (JSON.stringify(previous.page || {w:880,h:660}) !== JSON.stringify(page) || JSON.stringify(previous.surface) !== JSON.stringify(surface)) throw Error('continuation must keep the same paper and dimensions; use --branch for a new version');
        if (previous.ops.length > ops.length || previous.ops.some((op,i) => JSON.stringify(op) !== JSON.stringify(ops[i]))) throw Error('continuation changed earlier marks; restore them or save a new version with --branch');
        const earlier = previous.journal?.passes;
        if (earlier?.some((pass,i) => built.meta.passes?.[i]?.start !== pass.start || built.meta.passes?.[i]?.end !== pass.end)) throw Error('continuation changed earlier pass boundaries; preserve checkpoints or use --branch');
      }
      parent = { book: book.id, page: n, relation, marksHash: hash(previous.ops) };
    }
    const motion = motionFor(built.meta.motion, page, ops);
    const journal = { version: 1, sourceHash: hash(source), marksHash: hash(ops), ...(parent ? { parent } : {}), passes: (built.meta.passes || []).map(pass => ({ ...pass, checkpointHash: hash({ page, surface, ops: ops.slice(0, pass.end) }) })) };
    const index = book.pages.length + 1;
    const meta = {
      index,
      file: `pages/${String(index).padStart(3, '0')}.json`,
      ...m,
      date: m.date || new Date().toISOString().slice(0, 10),
      seed: built.meta.seed ?? index,
      page,
      ...(surface === undefined ? {} : { surface }),
      ...(motion ? { motion } : {}),
      module: relative(ROOT, modPath),
      opCount: ops.length,
      points: stats.points,
      state: 'drawn',
      stage,
      ...(selectionNote ? { selectionNote } : {}),
    };
    await mkdir(resolve(BOOK_DIR, 'pages'), { recursive: true });
    await writeFile(resolve(BOOK_DIR, meta.file), JSON.stringify({ ...meta, journal, source, ops }), { flag: 'wx' });
    book.pages.push(meta);
    await saveBook(book);
    console.log(`page ${index}: "${meta.title}" — ${ops.length} marks${meta.refs.length ? `, reworks ${meta.refs.join(', ')}` : ''}`);
  } else if (cmd === 'render') {
    const book = await loadBook();
    const n = Number(args[0]);
    const meta = book.pages.find((p) => p.index === n);
    if (!meta) throw new Error(`no page ${n}`);
    const out = arg('--out');
    if (!out) throw new Error('render needs --out <file.png>');
    const page = JSON.parse(await readFile(resolve(BOOK_DIR, meta.file), 'utf8'));
    const { page: dimensions, errors: dimensionErrors } = sanitizePageDimensions(page.page);
    if (!dimensions) throw new Error(`the page dimensions were rejected: ${dimensionErrors.join('; ')}`);
    const { surface, errors: surfaceErrors } = sanitizeSurface(page.surface);
    if (surface === null) throw new Error(`the page surface was rejected: ${surfaceErrors.join('; ')}`);
    const { ops, errors } = sanitizeOps(checkpoint(page).ops, limitsForPage(dimensions, surface));
    if (!ops) throw new Error(`the page's marks were rejected: ${errors.join('; ')}`);
    const motion = motionFor(page.motion, dimensions, ops);
    const view = frameArgs(motion);
    const { scale, crop } = viewArgs(dimensions, view.sheet ? motion.frames : 1);
    await renderPage({
      ops,
      w: dimensions.w,
      h: dimensions.h,
      surface,
      scale,
      transparent: flag('--transparent'),
      crop,
      ...view,
      out: resolve(process.cwd(), out),
    });
    const which = view.sheet ? ` (all ${motion.frames} frames)` : motion ? ` (frame ${view.frame + 1} of ${motion.frames})` : '';
    console.log(`page ${n}: "${meta.title}"${which} → ${out}`);
  } else if (cmd === 'preview') {
    /* Look before saving. The same sandbox, validation and renderer as write
     * and render, and nothing is written to any book: a preview spends no page. */
    if (!args[0] || args[0].startsWith('--')) throw new Error('preview needs a page module');
    const out = arg('--out');
    if (!out) throw new Error('preview needs --out <file.png>');
    const built = await buildPage(resolve(process.cwd(), args[0]));
    const { page: dimensions, errors: dimensionErrors } = sanitizePageDimensions(built.meta.page);
    if (!dimensions) throw new Error(`the page dimensions were rejected: ${dimensionErrors.join('; ')}`);
    const { surface, errors: surfaceErrors } = sanitizeSurface(built.meta.surface);
    if (surface === null) throw new Error(`the page surface was rejected: ${surfaceErrors.join('; ')}`);
    const checked = sanitizeOps(built.ops, limitsForPage(dimensions, surface));
    if (!checked.ops) throw new Error(`the page's marks were rejected:\n  ${checked.errors.join('\n  ')}`);
    let ops = checked.ops;
    const motion = motionFor(built.meta.motion, dimensions, ops);
    const view = frameArgs(motion);
    const passes = built.meta.passes || [];
    if (arg('--pass') !== undefined) {
      const n = Number(arg('--pass'));
      if (!passes.length) throw new Error('this page has no passes; drop --pass to preview all of it');
      if (!Number.isInteger(n) || n < 1 || n > passes.length) throw new Error(`--pass needs 1 to ${passes.length}`);
      ops = ops.slice(0, passes[n - 1].end);
    }
    const { scale, crop } = viewArgs(dimensions, view.sheet ? motion.frames : 1);
    await renderPage({ ops, w: dimensions.w, h: dimensions.h, surface, scale, transparent: flag('--transparent'), crop, ...view, out: resolve(process.cwd(), out) });
    const through = arg('--pass') ? ` through pass ${arg('--pass')} of ${passes.length}` : passes.length ? ` (${passes.length} passes)` : '';
    const which = view.sheet ? `, all ${motion.frames} frames` : motion ? `, frame ${view.frame + 1} of ${motion.frames} at ${motion.fps} fps` : '';
    console.log(`preview: "${built.meta.title || 'untitled'}"${through}${which}, ${ops.length} marks → ${out}. Nothing was saved.`);
  } else {
    throw new Error('Unknown command. Run node book.mjs help for drawing, inspection, revision and selection commands.');
  }
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  if (lock) await rm(lock, { force: true });
}
