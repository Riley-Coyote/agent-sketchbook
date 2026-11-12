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
 *   node book.mjs serve [--port 4194]      the book, and drawing live beside it
 *   node book.mjs live <command> ..         the live sheet's commands (live help)
 *   node book.mjs snapshot [--drawing ID] --json   a drawing's latest state, for a host (reads only)
 *   node book.mjs renderer --json | --check        the renderer a host pins: its manifest, or every file checked (reads only)
 *
 * For an app that shows the book: `write --reference` also draws the page's
 * poster and prints one immutable page reference; docs/host-seam.md.
 *
 * `--book <dir>` picks the book (default: ./book). One folder per mind.
 *
 * A page names its paper beside `page`: `paper: 'night'` (or black, white,
 * cream, grey, slate, kraft, '#rrggbb'), or `paper: { colour, tooth, seed }`
 * for paper with tooth, where graphite and charcoal bite into the paper and
 * paint and type sit on top. A module with no paper is on the original
 * canvas: it can continue a page already there, never start one.
 *
 * write runs the module in the sandbox (sandbox.mjs: no globals, no network,
 * imports only from this folder, a time limit) and keeps only marks that pass
 * validate.js. `--unsafe` imports the module directly; for your own pages
 * while developing, never for someone else's.
 */

import { readFile, writeFile, mkdir, rename, rm, link } from 'node:fs/promises';
import { compilePage, paperLine, today } from './page-program.js';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve, dirname, relative, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { sanitizeOps, sanitizePageMeta, sanitizePageDimensions, sanitizeSurface, sanitizeMotion, countFrames, limitsForPage } from './validate.js';
import { lineage, drawingForNewPage, marksHash, posterScale, posterFile, reference, snapshot, checkedPage, INLINE_MAX, openSheet, sheetOf, isLiveDrawingId, rendererManifest, checkRenderer, RENDERER_MANIFEST } from './host-seam.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PAGES = 48;
const WALL_MS = 30000;

const [cmd, ...args] = process.argv.slice(2);
const arg = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const flag = (name) => args.includes(name);
/* Every flag that takes a value. Given with none (last, or followed by
 * another flag), it is refused: --book with no value never falls back to
 * ./book or anything else. */
const VALUE_FLAGS = ['--book', '--owner', '--title', '--license', '--pages', '--refs', '--continue', '--branch', '--note', '--date', '--stage', '--selection-note',
  '--out', '--pass', '--scale', '--crop', '--frame', '--loops', '--drawing', '--protocol', '--inline-max', '--port',
  '--alt', '--caption', '--handoff', '--draft', '--as', '--origin', '--credential-env', '--resume', '--image-max'];
const valueless = cmd === 'live' ? undefined : VALUE_FLAGS.find((name) => { const i = args.indexOf(name); return i >= 0 && (args[i + 1] === undefined || args[i + 1].startsWith('--')); });
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

/* What a module with no paper is told: how to give it one. */
const PAPER_HELP = "paper: 'night' for the dark ground, or black, white, cream, grey, slate, kraft or '#rrggbb'; paper: { colour: 'white', tooth: 0.65 } for graphite and charcoal";

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

/** --frame I or --sheet for a motion page; nothing for a still. Frames are
 * numbered from 0, as frame(i, n) numbers them. Without --frame a motion page
 * shows its poster frame (motion.poster, default 0). */
function frameArgs(motion) {
  const sheet = flag('--sheet');
  const f = arg('--frame');
  if (!motion) {
    if (sheet || f !== undefined) throw new Error('--frame and --sheet are for motion pages');
    return {};
  }
  if (sheet && f !== undefined) throw new Error('choose --frame or --sheet');
  if (sheet) return { sheet: true };
  if (f === undefined) return { frame: motion.poster ?? 0 };
  const n = Number(f);
  if (!Number.isInteger(n) || n < 0 || n >= motion.frames) throw new Error(`--frame needs 0 to ${motion.frames - 1} (frames count from 0, as in frame(i, n))`);
  return { frame: n };
}
const frameName = (motion, view) => view.sheet ? `all ${motion.frames} frames` : `frame ${view.frame} of 0–${motion.frames - 1}`;

/** Which way a render comes out: a still (png), or for a motion page a gif,
 * a video (.webm / .mp4) or a timing sheet (--timing). */
async function motionOut(out, motion, dimensions) {
  const ext = extname(out).toLowerCase();
  const kind = ext === '.gif' ? 'gif' : ext === '.webm' || ext === '.mp4' ? 'video' : flag('--timing') ? 'timing' : 'png';
  if (kind === 'png') return null;
  if (!motion) throw new Error('GIF, video and --timing are for motion pages; a still renders to .png');
  if (flag('--sheet') || arg('--frame') !== undefined || arg('--crop') !== undefined || arg('--pass') !== undefined) throw new Error(`a ${kind} takes the whole loop: drop --sheet, --frame, --crop and --pass`);
  if (flag('--timing') && kind !== 'timing') throw new Error('--timing writes a .png');
  const fit = kind === 'gif' ? 640 : kind === 'timing' ? 1000 : 1920;
  const scale = arg('--scale') === undefined ? Math.min(1, fit / dimensions.w) : Number(arg('--scale'));
  if (!Number.isFinite(scale) || scale < .1 || scale > 2 || motion.frames * dimensions.w * dimensions.h * scale * scale > 48000000) throw new Error('scale needs 0.1 to 2, and every frame counts toward 48 million pixels');
  const seconds = motion.frames / motion.fps;
  const loops = arg('--loops') === undefined ? Math.min(12, Math.max(1, Math.ceil(3 / seconds))) : Number(arg('--loops'));
  if (!Number.isInteger(loops) || loops < 1 || loops > 20) throw new Error('--loops needs 1 to 20');
  let mime;
  if (kind === 'video') mime = ext === '.mp4' ? 'video/mp4;codecs=avc1' : 'video/webm;codecs=vp9';
  return { kind, scale, loops, mime, fps: motion.fps, poster: motion.poster ?? 0, seconds };
}

/* Change per step as one line of text: a sparkline an agent can read. */
function sparkline(values) {
  const bars = '▁▂▃▄▅▆▇█';
  const top = Math.max(...values, 1e-9);
  return values.map((v) => bars[Math.min(7, Math.round((v / top) * 7))]).join('');
}

function reportMotion(way, info, out) {
  if (way.kind === 'gif') return `${out}: an animated GIF, looping forever at ${way.fps} fps (${way.seconds.toFixed(2)} s a loop).`;
  if (way.kind === 'video') return `${out}: ${way.loops} loop${way.loops > 1 ? 's' : ''} at ${way.fps} fps, ${(way.seconds * way.loops).toFixed(2)} s.`;
  const pct = (v) => `${(v * 100).toFixed(2)}%`;
  return [
    `${out}: every frame at once, coloured by time, over change per step.`,
    `  ${info.frames} frames at ${info.fps} fps: ${info.seconds.toFixed(2)} s a loop`,
    `  change per step: ${sparkline(info.change.slice(0, -1))} | seam ${sparkline(info.change).slice(-1)}`,
    `  median ${pct(info.median)} · most ${pct(info.max)} (frame ${info.maxAt} → ${(info.maxAt + 1) % info.frames}) · ${info.holds} held step${info.holds === 1 ? '' : 's'}`,
    `  seam, frame ${info.frames - 1} → 0: ${pct(info.seam)}, ${Number.isFinite(info.seamRatio) ? info.seamRatio.toFixed(1) + '×' : 'n/a'} the median: ${info.verdict}.`,
  ].join('\n');
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
/** The marks a save stores: checked, then paint rounded to a tenth of a pixel,
 * then checked again. Material gestures keep their pressure, tilt, time and
 * subpixel coordinates exactly. write and preview both come through here, so
 * a preview is the saved page to the pixel. */
function marksToStore(built, limits) {
  // Validate before rounding: JSON null must never be coerced into coordinate zero.
  const raw = sanitizeOps(built, limits);
  if (!raw.ops) return raw;
  return sanitizeOps(raw.ops.map(op => op.k === 'm' ? op : roundOp(op)), limits);
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
     turn to the page (or use atelier.html?p=<module> for a page module)
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
if (page.out === 'gif' || page.out === 'video' || page.out === 'timing') {
  /* a moving page out of the book: see motion-out.js */
  const { gifFromFrames, videoFromFrames, timingSheet } = await import('/motion-out.js');
  const frames = engine.motionFrames();
  const b64 = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 32768) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 32768)); return btoa(s); };
  if (page.out === 'gif') {
    window.__b64 = b64(gifFromFrames(frames, { fps: page.fps }));
  } else if (page.out === 'video') {
    window.__b64 = b64(await videoFromFrames(frames, { fps: page.fps, loops: page.loops, mime: page.mime }));
  } else {
    const ground = document.createElement('canvas');
    ground.width = frames[0].width; ground.height = frames[0].height;
    const bare = new MarkEngine({ width: page.w, height: page.h, dpr: page.scale, surface: page.surface });
    bare.load([]).finish();
    bare.composite(ground.getContext('2d'));
    const { canvas, stats } = timingSheet(frames, { fps: page.fps, ground, poster: page.poster || 0, font: 'SketchSans, sans-serif' });
    const url = canvas.toDataURL('image/png');
    window.__b64 = url.slice(url.indexOf(',') + 1);
    window.__info = stats;
  }
  window.__ready = true;
} else {
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
  const size = Math.max(10, Math.round(12 * page.scale));
  c.font = size + 'px sans-serif';
  pictures.forEach((p, i) => {
    const x = gap + (i % cols) * (cw + gap), y = gap + Math.floor(i / cols) * (ch + gap);
    c.drawImage(p, x, y, cw, ch);
    /* numbered from 0, as frame(i, n) is; on a dark tab so any paper reads */
    const label = String(i), tw = c.measureText(label).width;
    c.fillStyle = 'rgba(16,16,20,.78)'; c.fillRect(x, y + ch - size - 8, tw + 10, size + 8);
    c.fillStyle = 'rgba(255,255,255,.9)'; c.fillText(label, x + 5, y + ch - 5);
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
}
</script>`;

/* What mnemos.world's Commons takes: a Sketchbook export of up to 6 MB through
 * its browser upload, while `post` sends up to 8 MB a request through the
 * workbench API; and a still (the whole PNG data URL) of up to 1.5 million
 * characters. --image-max sets another gallery's limit for the still. */
const POST_BUDGET = 6 * 1024 * 1024;
const IMAGE_BUDGET = 1_500_000;
/* the Commons workbench: a request up to 8 MiB, a work up to 80 blocks */
const REQUEST_BUDGET = 8 * 1024 * 1024, MAX_BLOCKS = 80;

/** A page as an `agent-sketchbook/post`: what `export` writes and `post`
 * sends. `parts` chooses what beyond the marks travels with it: the source,
 * the journal of passes, the page's note, and a still for places that can't
 * run the engine. */
async function packagePage(n, parts) {
  const book = await loadBook();
  const meta = book.pages.find((p) => p.index === n);
  if (!meta) throw new Error(`no page ${n}`);
  const page = JSON.parse(await readFile(resolve(BOOK_DIR, meta.file), 'utf8'));
  const { page: dimensions, errors: dimensionErrors } = sanitizePageDimensions(page.page);
  if (!dimensions) throw new Error(`the page dimensions were rejected: ${dimensionErrors.join('; ')}`);
  const { surface, errors: surfaceErrors } = sanitizeSurface(page.surface);
  if (surface === null) throw new Error(`the page surface was rejected: ${surfaceErrors.join('; ')}`);
  const { ops, errors } = sanitizeOps(page.ops, limitsForPage(dimensions, surface));
  if (!ops) throw new Error(`the page's marks were rejected: ${errors.join('; ')}`);
  const motion = motionFor(page.motion, dimensions, ops);
  const post = {
    format: 'agent-sketchbook/post',
    version: 1,
    title: meta.title,
    date: meta.date,
    ...(parts.note ? { note: meta.note } : {}),
    author: { owner: book.owner, book: book.id, page: meta.index },
    license: book.license || 'all rights reserved by the owner',
    stage: book.pages.find((p) => p.index === n)?.stage || meta.stage || 'study',
    page: dimensions,
    ...(surface === undefined ? {} : { surface }),
    ...(motion ? { motion } : {}),
    ops,
    ...(parts.source ? { source: page.source } : {}),
    ...(parts.journal && page.journal ? { journal: page.journal } : {}),
    marksHash: hash(ops),
    exportedAt: new Date().toISOString(),
  };
  let stillSize = '';
  if (parts.image) {
    /* A still for places that can't run the engine: feeds, cards, alt
     * views. Galleries cap its size, so a detailed page is rendered smaller
     * until its still fits, down to 480 px on the long side. */
    const budget = arg('--image-max') === undefined ? IMAGE_BUDGET : Number(arg('--image-max'));
    if (!Number.isInteger(budget) || budget < 1) throw new Error('--image-max takes a number of characters');
    const still = resolve(BOOK_DIR, `.export-${process.pid}.png`);
    const long = Math.max(dimensions.w, dimensions.h);
    let scale = Math.min(1, 1600 / long);
    try {
      for (;;) {
        await renderPage({ ops, w: dimensions.w, h: dimensions.h, surface, scale, ...(motion ? { frame: motion.poster ?? 0 } : {}), out: still });
        const png = await readFile(still);
        post.image = 'data:image/png;base64,' + png.toString('base64');
        stillSize = `${png.readUInt32BE(16)} × ${png.readUInt32BE(20)}`;
        if (post.image.length <= budget || long * scale <= 480) break;
        // a PNG grows with its area: aim just under the budget, and always shrink
        scale = Math.max(480 / long, scale * Math.min(0.9, 0.95 * Math.sqrt(budget / post.image.length)));
      }
    } finally {
      await rm(still, { force: true });
    }
    if (post.image.length > budget) {
      delete post.image;
      console.warn(`the still wouldn't fit in ${budget.toLocaleString('en')} characters even at 480 px, so this post has none`);
    }
  }
  return { post, meta, stillSize };
}

/** --scale and --crop, checked the same way for render and preview. */
function viewArgs(dimensions, frames = 1) {
  const scale = arg('--scale') === undefined ? (frames > 1 ? 0.5 : 2) : Number(arg('--scale'));
  if (!Number.isFinite(scale) || scale < .1 || scale > 4 || frames * dimensions.w * dimensions.h * scale * scale > 32000000) throw Error('scale needs 0.1 to 4, at most 32 million output pixels (a contact sheet counts every frame)');
  if (frames > 1 && arg('--crop') !== undefined) throw Error('crop a single --frame, not a contact sheet');
  const crop = arg('--crop')?.split(',').map(Number);
  if (crop && (crop.length !== 4 || !crop.every(Number.isInteger) || crop[0] < 0 || crop[1] < 0 || crop[2] <= 0 || crop[3] <= 0 || crop[0]+crop[2] > dimensions.w || crop[1]+crop[3] > dimensions.h)) throw Error('crop needs x,y,width,height inside the page');
  return { scale, crop };
}

async function renderPage({ ops, w, h, scale, surface, transparent, crop, frame, sheet, out, kind, fps, loops, mime, poster }) {
  const chromium = await playwright();
  if (!chromium) { console.error(MANUAL); process.exit(2); }
  const { server, port } = await serve({ ops, w, h, scale, surface, transparent, crop, frame, sheet, out: kind, fps, loops, mime, poster });
  let browser;
  try { browser = await chromium.launch(); }
  catch (e) { server.close(); throw e; }   /* an open server would keep node waiting, silently */
  try {
    const tab = await browser.newPage();
    const failures = [];
    tab.on('pageerror', (e) => failures.push(String(e)));
    await tab.goto(`http://127.0.0.1:${port}/__render.html`);
    await tab.waitForFunction('window.__ready === true', null, { timeout: kind === 'video' ? 600000 : 120000 })
      .catch(() => { throw new Error(`the page did not draw${failures.length ? `: ${failures[0]}` : ''}`); });
    const [b64, url, info] = await tab.evaluate('[window.__b64, window.__png, window.__info]');
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, Buffer.from(b64 ?? url.slice(url.indexOf(',') + 1), 'base64'));
    return info;
  } finally {
    await browser.close();
    server.close();
  }
}

/* ---------------------------------------------------------------- a save for a host
 *
 * `write --reference` (and mcp.mjs's save) end here: the page's poster, drawn
 * once at save time and never replaced, and the page's one reference. */

/** pages/NNN.png beside pages/NNN.json: the page finished (a moving page's
 * poster frame), at the scale <sketch-page> draws it. */
async function writePoster(meta, { dimensions, surface, motion, ops }) {
  const file = resolve(BOOK_DIR, posterFile(meta));
  if (existsSync(file)) return posterFile(meta);
  const temporary = `${file}.${process.pid}.tmp`;
  try {
    await renderPage({ ops, w: dimensions.w, h: dimensions.h, surface, scale: posterScale(dimensions), ...(motion ? { frame: motion.poster ?? 0 } : {}), out: temporary });
    await link(temporary, file);   // never over a poster that is already there
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  } finally {
    await rm(temporary, { force: true });
  }
  return posterFile(meta);
}

async function answerHost(book, meta, page, drawing) {
  const checked = checkedPage(page);
  const poster = await writePoster(meta, checked);
  console.log(JSON.stringify(reference(book, meta, drawing, marksHash(checked.ops), poster)));
}

/** The newest page, when it already holds exactly this save: a retry whose
 * first answer was lost. Nothing else counts as the same save. */
async function alreadyLanded(book, save) {
  const last = book.pages.at(-1);
  if (!last) return null;
  const { page: stored } = await savedPage(book, last.index);
  const parent = stored.journal?.parent;
  const same = (parent?.relation ?? null) === save.relation && (parent?.page ?? null) === save.from
    && stored.journal?.sourceHash === save.journal.sourceHash
    && marksHash(stored.ops) === marksHash(save.ops)
    && JSON.stringify(stored.page) === JSON.stringify(save.page) && JSON.stringify(stored.surface) === JSON.stringify(save.surface)
    && stored.title === save.m.title && stored.note === save.m.note && JSON.stringify(stored.refs) === JSON.stringify(save.m.refs);
  return same ? { meta: last, page: stored } : null;
}

try {
  if (valueless) throw new Error(`${valueless} needs a value; nothing was done`);
  if (['init', 'write', 'select'].includes(cmd)) await acquireLock();
  if (cmd === 'help' || cmd === '--help') {
    console.log(`Start here: START_HERE.md
init --owner NAME --book DIR [--title T] [--license L]   (license default: "all rights reserved by the owner"; e.g. "CC BY 4.0")
write pages/work.js --book DIR [--continue PAGE | --branch PAGE | --refs PAGES]
  a page names its paper beside page: paper: 'night' | 'black' | 'white' | 'cream' | 'grey' | 'slate' | 'kraft' | '#rrggbb',
  or paper: { colour, tooth } for graphite and charcoal under paint and type. With no paper, a module can only continue or branch a page on the original canvas
journal PAGE --book DIR
render PAGE --book DIR --out image.png [--pass N] [--crop x,y,w,h] [--scale 1] [--frame I | --sheet]
preview pages/work.js --out image.png [--pass N] [--crop x,y,w,h] [--scale 1] [--frame I | --sheet]   (saves nothing)
  motion frames count from 0, as frame(i, n) does; without --frame you get the poster frame
  a motion page also renders to --out loop.gif, loop.webm or loop.mp4 [--loops N], or --timing --out timing.png
export PAGE --book DIR --out post.json [--image [--image-max CHARS]] [--no-source]   (packages a page to post; publishes nothing)
post PAGE --book DIR --alt TEXT [--caption TEXT] [--title TEXT] [--handoff NOTE] [--draft ID] [--include-process] [--image] [--as ID] [--origin URL] [--dry-run]
  saves the page to your Commons workbench as an unpublished draft; it never publishes. Your own claimed credential comes from COMMONS_CREDENTIAL (or --credential-env NAME)
post --resume REQUEST_ID --book DIR   (checks a save whose answer was uncertain; resends it, identical, only if it never landed)
resume PAGE --book DIR --out pages/new.js [--pass N]
select PAGE --book DIR --stage study|candidate|exhibition --note REASON
list | read PAGE [--source] | blank --book DIR
serve --book DIR [--port 4194]   serves the book to open in a browser, with drawing live beside it; live sheets are kept in DIR/live
live COMMAND ...   drawing live, gesture by gesture: node book.mjs live help lists the commands; live page writes a live sheet as a page module
snapshot --book DIR [--drawing ID] [--protocol sketchbook.drawing/1] [--inline-max BYTES] --json   a drawing's latest state for a host; reads only (docs/host-seam.md)
write ... --reference   also draws the page's poster (pages/NNN.png) and prints its page reference as JSON; a save that already landed as the newest page answers with the same reference
renderer --json | --check   the renderer a host pins (<sketch-page> and the files it loads): prints renderer.manifest.json, or recomputes every file's size and sha256 against it; reads only
Saving defaults to a study. Selection records intent; it does not publish or grant access.`);
  } else if (cmd === 'init') {
    const owner = arg('--owner');
    if (!owner) throw new Error('init needs --owner <name>');
    if (existsSync(INDEX)) throw new Error(`a book already exists at ${relative(process.cwd(), BOOK_DIR)}`);
    const book = {
      id: `sketchbook-${owner.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString(36)}`,
      title: arg('--title') || 'Sketchbook',
      owner,
      created: today(),
      pageCount: Number(arg('--pages')) || PAGES,
      /* the drawings in a book belong to whoever drew them. the book says on what terms. */
      license: arg('--license') || 'all rights reserved by the owner',
      pages: [],
    };
    await saveBook(book);
    const where = relative(process.cwd(), BOOK_DIR);
    console.log(`new book for ${owner} at ${!where ? '.' : where.startsWith('..') ? BOOK_DIR : where} — ${book.pageCount} blank pages`);
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
    console.log(JSON.stringify({ title: meta.title, stage: meta.stage || 'unclassified', selectionNote: meta.selectionNote || '', journal: page.journal || null, note: page.journal ? undefined : 'This page has no recorded passes. Source and marks remain available; no review history has been invented.' }, null, 2));
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
  title: ${JSON.stringify(page.title)}, date: ${JSON.stringify(today())},
  note: ${JSON.stringify(page.note)}, page: ${JSON.stringify(page.page || {w:880,h:660})},
  ${paperLine(page.surface)}
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
    /* --reference: a save for a host. It checks for the browser that draws
     * the poster before anything is saved, and a full book can still answer
     * a retry of the save that filled it. */
    const forHost = flag('--reference');
    if (forHost && !(await playwright())) throw new Error('--reference draws the page\'s poster in a real browser, and playwright is not installed here (npm i playwright-core). Nothing was saved.');
    if (!forHost && book.pages.length >= book.pageCount) throw new Error('the book is full');
    const built = await buildPage(modPath);
    const { page, errors: dimensionErrors } = sanitizePageDimensions(built.meta.page);
    if (!page) throw new Error(`the page dimensions were rejected: ${dimensionErrors.join('; ')}`);
    const { surface, errors: surfaceErrors } = sanitizeSurface(built.meta.surface);
    if (surface === null) throw new Error(`the page surface was rejected: ${surfaceErrors.join('; ')}`);
    const relation = flag('--continue') ? 'continue' : flag('--branch') ? 'branch' : null;
    if (built.meta.noPaper) {
      // Only a page already on the original canvas carries it on. Continuing
      // a page with paper meets the same-paper rule below.
      const from = relation ? (await savedPage(book, Number(arg(`--${relation}`)))).page : null;
      if (!from || (relation === 'branch' && from.surface !== undefined)) throw new Error(`this page names no paper. A new page names its paper beside page: ${PAPER_HELP}. With no paper, a module can only continue or branch a page that is already on the original canvas.`);
    }
    const { ops, errors, stats } = marksToStore(built.ops, limitsForPage(page, surface));
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
    /* A module made from a live sheet names the sheet's drawing: its first
     * page keeps that id, and a page continuing or branching the page the
     * sheet carried on must say so. */
    let live = sheetOf(source);
    if (live && !isLiveDrawingId(live.drawingId, book.id)) {
      console.error(`this module's live sheet (${live.drawingId}) was not this book's, so its page is numbered as any other.`);
      live = null;
    }
    if (live?.relation && (relation !== live.relation || Number(arg(`--${relation}`)) !== live.page)) throw new Error(`this module was drawn on a live sheet that carries on page ${live.page} (${live.relation}); save it with --${live.relation} ${live.page}`);
    const sheet = await openSheet(BOOK_DIR);
    const liveRevision = (id) => sheet ? sheet.spent(id) : 0;
    let parent;
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
    const known = await lineage(book, async (p) => (await savedPage(book, p.index)).page);
    const landed = forHost ? await alreadyLanded(book, { relation, from: relation ? Number(arg(`--${relation}`)) : null, journal, page, surface, ops, m }) : null;
    if (landed) {
      console.error(`page ${landed.meta.index} already holds this save, so nothing was saved twice.`);
      await answerHost(book, landed.meta, landed.page, known.get(landed.meta.index));
    } else {
    if (book.pages.length >= book.pageCount) throw new Error('the book is full');
    const index = book.pages.length + 1;
    const meta = {
      index,
      file: `pages/${String(index).padStart(3, '0')}.json`,
      ...m,
      date: m.date || today(),
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
      /* the drawing this page belongs to; book.json carries it too, so a
       * host watching the index sees { drawingId, revision } and nothing more */
      ...drawingForNewPage(book, known, index, relation, relation ? Number(arg(`--${relation}`)) : null, { live, liveRevision }),
    };
    await mkdir(resolve(BOOK_DIR, 'pages'), { recursive: true });
    await writeFile(resolve(BOOK_DIR, meta.file), JSON.stringify({ ...meta, journal, source, ops }), { flag: 'wx' });
    book.pages.push(meta);
    await saveBook(book);
    if (forHost) {
      known.set(index, { drawingId: meta.drawingId, revision: meta.revision, ...(meta.parentDrawing ? { parent: meta.parentDrawing } : {}) });
      await answerHost(book, meta, { ...meta, ops }, known.get(index)).catch((error) => {
        throw new Error(`page ${index} was saved, but its poster could not be drawn (${error.message}). Run the same save again: it draws the poster for page ${index} and saves nothing twice.`);
      });
    } else console.log(`page ${index}: "${meta.title}" — ${ops.length} marks${meta.refs.length ? `, reworks ${meta.refs.join(', ')}` : ''}`);
    }
  } else if (cmd === 'snapshot') {
    /* A drawing's latest state, for a host. It only reads. */
    const inlineMax = arg('--inline-max') === undefined ? INLINE_MAX : Number(arg('--inline-max'));
    if (!Number.isInteger(inlineMax) || inlineMax < 0) throw new Error('--inline-max takes a number of bytes');
    const snap = await snapshot({ bookDir: BOOK_DIR, drawingId: arg('--drawing'), protocol: arg('--protocol'), inlineMax });
    if (flag('--json')) console.log(JSON.stringify(snap));
    else console.log(`drawing ${snap.drawingId}: revision ${snap.revision}, ${snap.state} as page ${snap.pageIndex}, ${snap.marksBytes} bytes of marks, hash ${snap.marksHash.slice(0, 12)}…, poster ${snap.poster || 'none'}. Add --json for all of it.`);
  } else if (cmd === 'renderer') {
    /* The renderer a host pins: <sketch-page> and the files it loads. It only
     * reads, and only this folder's own files; it takes no book. */
    const other = args.filter((a) => a !== '--json' && a !== '--check');
    if (other.length) throw new Error(`renderer takes --json or --check and nothing else, not ${other.join(' ')}; nothing was done`);
    if (flag('--json') && flag('--check')) throw new Error('choose one of --json or --check');
    const manifest = await rendererManifest(ROOT);
    if (flag('--json')) console.log(JSON.stringify(manifest));
    else if (flag('--check')) {
      const { files, problems } = await checkRenderer(ROOT, manifest);
      for (const f of files.filter((f) => f.state === 'ok')) console.log(`ok  ${f.path}  ${f.bytes} bytes  sha256 ${f.sha256}`);
      if (problems.length) throw new Error(`the renderer does not match ${RENDERER_MANIFEST}:\n  ${problems.join('\n  ')}`);
      console.log(`renderer ${manifest.rendererVersion}: all ${files.length} files match ${RENDERER_MANIFEST}`);
    } else console.log(`renderer ${manifest.rendererVersion} (${manifest.protocol}): ${manifest.entry} defines <${manifest.element}>, fed marks through its ${manifest.feed} property; ${manifest.files.length} files. Add --json for the manifest, or --check to check every file against it.`);
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
    const way = await motionOut(out, motion, dimensions);
    if (way) {
      const info = await renderPage({ ops, w: dimensions.w, h: dimensions.h, surface, ...way, out: resolve(process.cwd(), out) });
      console.log(`page ${n}: "${meta.title}" → ${reportMotion(way, info, out)}`);
    } else {
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
    const which = motion ? ` (${frameName(motion, view)})` : '';
    console.log(`page ${n}: "${meta.title}"${which} → ${out}`);
    }
  } else if (cmd === 'export') {
    /* One self-contained file for a page: what a gallery such as mnemos.world
     * needs to show it and play it back as drawn. It packages; it does not
     * publish, and it carries the page's owner, license and stage with it. */
    const n = Number(args[0]);
    const out = arg('--out');
    if (!out) throw new Error('export needs --out <post.json>');
    const { post, meta, stillSize } = await packagePage(n, { source: !flag('--no-source'), journal: true, note: true, image: flag('--image') });
    const text = JSON.stringify(post);
    await writeFile(resolve(process.cwd(), out), text);
    const size = Buffer.byteLength(text);
    console.log(`page ${n}: "${meta.title}" → ${out} (${post.ops.length} marks${post.motion ? `, ${post.motion.frames} frames` : ''}${post.image ? `, a ${stillSize} still` : ''}, ${(size / 1048576).toFixed(1)} MB). Packaged, not published: posting is a separate choice.`);
    if (size > POST_BUDGET) {
      const mb = (value) => (Buffer.byteLength(JSON.stringify(value ?? '')) / 1048576).toFixed(1);
      console.warn(`note: this post is ${(size / 1048576).toFixed(1)} MB (marks ${mb(post.ops)}, source ${mb(post.source)}, still ${mb(post.image)}); the Commons' browser upload takes Sketchbook exports up to ${POST_BUDGET / 1048576} MB; \`post\` sends up to ${REQUEST_BUDGET / 1048576} MB a request through the workbench API. Fewer marks, or fewer points in each, make it smaller; --no-source leaves the source out, and --image-max shrinks the still.`);
    }
  } else if (cmd === 'post') {
    /* Save a page to your Commons workbench as an unpublished draft. It never
     * publishes: sharing is a separate, deliberate step, taken on mnemos.world.
     * The credential is your own claimed Commons credential, read from the
     * environment, never an argument, and never written anywhere. Every save
     * is written down before it is sent, so an uncertain answer is checked
     * against the Commons' receipt instead of being guessed or repeated. */
    const credential = process.env[arg('--credential-env') || 'COMMONS_CREDENTIAL'];
    if (!credential) throw new Error('post needs your own claimed Commons credential in COMMONS_CREDENTIAL (or the variable --credential-env names). It is not taken as an argument, so it stays out of shell history. Never register another identity to post.');
    /* Each save is recorded here before it is sent, and settled after. Only
     * the pending record keeps the whole request, so it can be resent
     * identically; settled records keep where the page went. Drafts are
     * unpublished, so nothing here is meant for a repository. */
    const pending = resolve(BOOK_DIR, '.commons');
    const recordFile = (id, state) => resolve(pending, `${id}.${state}.json`);
    const settle = async (record, state, extra) => {
      const { blocks, ...rest } = record.body;
      await writeFile(recordFile(record.body.request_id, state), JSON.stringify({ origin: record.origin, as: record.as, method: record.method, path: record.path, page: record.page, ...rest, blocks: blocks.map((b) => b.id), ...extra }, null, 2));
      await rm(recordFile(record.body.request_id, 'pending'), { force: true });
    };
    const resumeHint = (id) => `  node book.mjs post --resume ${id} --book ${relative(process.cwd(), BOOK_DIR) || '.'}`;
    const api = async (origin, path, init = {}) => {
      try {
        return await fetch(`${origin}/api/commons${path}`, { ...init, headers: { authorization: `Bearer ${credential}`, 'content-type': 'application/json' } });
      } catch (error) {
        throw Object.assign(new Error(`no answer from ${origin} (${error.cause?.code || error.message})`), { unanswered: true });
      }
    };
    /* who the credential belongs to; a save never goes anywhere else */
    const whoAmI = async (origin) => {
      const who = await api(origin, '/workbench', { method: 'GET' }).catch((error) => { throw new Error(`${error.message}, so nothing was sent`); });
      if (who.status === 404) throw new Error(`the Commons at ${origin} didn't recognise this credential, or its workbench isn't live there yet. Nothing was saved.`);
      if (!who.ok) throw new Error(`the Commons at ${origin} answered ${who.status}. Nothing was saved.`);
      const me = (await who.json().catch(() => null))?.me;
      if (!me?.id) throw new Error(`${origin} didn't answer as a Commons workbench. Nothing was saved.`);
      return me;
    };
    /* send one recorded save and settle what its answer means */
    const deliver = async (record) => {
      const id = record.body.request_id;
      let res;
      try {
        res = await api(record.origin, record.path, { method: record.method, body: JSON.stringify(record.body) });
      } catch (error) {
        throw new Error(`${error.message}. The save may or may not have landed; check it, without guessing, with:\n${resumeHint(id)}`);
      }
      const answer = await res.json().catch(() => ({}));
      if (res.ok && answer.ok) {
        await settle(record, 'done', { draft: answer.draft.id, version: answer.version.version, receipt: answer.receipt, replayed: answer.replayed });
        return answer;
      }
      if (res.status >= 500) throw new Error(`the Commons answered ${res.status}. The save may or may not have landed; check it with:\n${resumeHint(id)}`);
      await settle(record, 'refused', { status: res.status, code: answer.code ?? null });
      if (answer.code === 'version_conflict') throw new Error(`someone saved this draft first (it is now at version ${answer.current_version}), so nothing was overwritten. Read it before deciding; running this command again adds the page to the newest version.`);
      if (answer.code === 'unclaimed') throw new Error(`this credential can read the workbench but can't save to it: it isn't claimed yet (residents save elsewhere). Nothing was saved. Never register another identity to get around this.`);
      if (answer.code === 'request_conflict') throw new Error(`request ${id} was already used for something else, so nothing was saved or overwritten`);
      if (res.status === 404) throw new Error(`the Commons at ${record.origin} didn't recognise this credential or draft, or its workbench isn't live there yet. Nothing was saved.`);
      throw new Error(`the Commons refused the save (${res.status}${answer.code ? ` ${answer.code}` : ''}). Nothing was saved.`);
    };
    const told = (answer) => console.log(`saved to your workbench as an unpublished draft: draft ${answer.draft.id}, version ${answer.version.version}${answer.replayed ? ' (it had already landed; nothing was saved twice)' : ''}. Nothing was published; sharing is a separate choice on mnemos.world.`);

    if (arg('--resume')) {
      const id = arg('--resume');
      if (!/^[A-Za-z0-9_-]{8,128}$/.test(id) || !existsSync(recordFile(id, 'pending'))) throw new Error(`no uncertain save ${id} in ${relative(process.cwd(), pending) || pending}`);
      const record = JSON.parse(await readFile(recordFile(id, 'pending'), 'utf8'));
      try {
        // a receipt belongs to whoever made the save: never resend under someone else
        const me = await whoAmI(record.origin);
        if (me.id !== record.as) throw new Error(`this save was made as ${record.as}, but this credential belongs to ${me.name} (${me.id}). Nothing was sent.`);
        const receipt = await api(record.origin, `/workbench/requests/${encodeURIComponent(id)}`, { method: 'GET' });
        if (receipt.ok) {
          const { receipt: r } = await receipt.json();
          await settle(record, 'done', { draft: r.work_id, version: r.version, receipt: r, replayed: true });
          console.log(`it had landed: draft ${r.work_id}, version ${r.version}. Nothing was sent again, and nothing was published.`);
        } else if (receipt.status === 404) {
          told(await deliver(record));   // it never landed: the same request, identical
        } else throw new Error(`the Commons couldn't be asked about ${id} (${receipt.status})`);
      } catch (error) {
        if (!existsSync(recordFile(id, 'pending')) || /may or may not have landed/.test(error.message)) throw error;
        throw new Error(`${error.message.replace(/\.$/, '')}. The save stays recorded; try again with:\n${resumeHint(id)}`);
      }
    } else {
      const n = Number(args[0]);
      const alt = (arg('--alt') || '').trim(), caption = arg('--caption');
      if (!alt) throw new Error('post needs --alt "<what the page shows>": every page on the Commons carries a description for readers who can\'t see it');
      if (alt.length > 500) throw new Error('--alt takes at most 500 characters');
      if (caption !== undefined && caption.length > 2000) throw new Error('--caption takes at most 2000 characters');
      const handoff = arg('--handoff');
      if (handoff !== undefined && handoff.length > 4000) throw new Error('--handoff takes at most 4000 characters');
      const origin = (arg('--origin') || process.env.COMMONS_ORIGIN || 'https://mnemos.world').replace(/\/+$/, '');
      if (!/^https:\/\/|^http:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(origin)) throw new Error('--origin must be https, or http on this machine');
      // the source, journal and note stay home unless asked for: shared, they become downloadable
      const process_ = flag('--include-process');
      const { post, meta } = await packagePage(n, { source: process_, journal: process_, note: process_, image: flag('--image') });
      const block = { id: `page-${n}`, type: 'sketchbook', post, alt, ...(caption ? { caption } : {}) };

      const me = await whoAmI(origin);
      if (arg('--as') && arg('--as') !== me.id) throw new Error(`this credential belongs to ${me.name} (${me.id}), not ${arg('--as')}. Nothing was saved.`);

      const request_id = randomUUID();
      let record;
      if (arg('--draft')) {
        // add to a draft: read it, keep every block as it is, add this page under a new id
        const id = arg('--draft');
        const read = await api(origin, `/workbench/${encodeURIComponent(id)}`, { method: 'GET' }).catch((error) => { throw new Error(`${error.message}, so nothing was sent`); });
        if (!read.ok) throw new Error(`draft ${id} couldn't be read (${read.status}). Nothing was saved, and no other draft was made.`);
        const { draft, version } = (await read.json().catch(() => null)) ?? {};
        if (!draft?.current_version || !Array.isArray(version?.blocks)) throw new Error(`draft ${id} didn't come back as a draft. Nothing was saved, and no other draft was made.`);
        const taken = new Set(version.blocks.map((b) => b.id));
        for (let k = 2; taken.has(block.id); k++) block.id = `page-${n}-${k}`;
        if (version.blocks.length + 1 > MAX_BLOCKS) throw new Error(`draft ${id} already holds ${version.blocks.length} blocks; a work holds at most ${MAX_BLOCKS}. Nothing was saved.`);
        // the note for the next visit carries forward unless a new one is given
        const note = handoff ?? version.handoff_note;
        record = { origin, as: me.id, method: 'PUT', path: `/workbench/${encodeURIComponent(id)}`, page: n, body: { title: version.title, blocks: [...version.blocks, block], ...(note ? { handoff_note: note } : {}), expected_version: draft.current_version, request_id } };
      } else {
        const title = (arg('--title') || meta.title || '').trim().slice(0, 300) || 'untitled';
        record = { origin, as: me.id, method: 'POST', path: '/workbench', page: n, body: { title, blocks: [block], ...(handoff ? { handoff_note: handoff } : {}), request_id } };
      }
      const size = Buffer.byteLength(JSON.stringify(record.body));
      if (size > REQUEST_BUDGET) {
        const mb = (v) => (Buffer.byteLength(JSON.stringify(v ?? '')) / 1048576).toFixed(1);
        throw new Error(`this save is ${(size / 1048576).toFixed(1)} MB (this page's marks ${mb(post.ops)}, source ${mb(post.source)}, still ${mb(post.image)}${arg('--draft') ? `, the draft's other pages ${mb(record.body.blocks.slice(0, -1))}` : ''}); the Commons takes ${REQUEST_BUDGET / 1048576} MB a request. Nothing was dropped and nothing was saved.`);
      }
      const what = arg('--draft') ? `add page ${n} to draft ${arg('--draft')} as block ${block.id}` : `make a new draft, "${record.body.title}"`;
      if (flag('--dry-run')) console.log(`as ${me.name} (${me.id}), this would ${what}: ${post.ops.length} marks, ${(size / 1024).toFixed(0)} KB${process_ ? ', with source, journal and note' : ''}. Nothing was sent.`);
      else {
        await mkdir(pending, { recursive: true });
        if (!existsSync(resolve(pending, '.gitignore'))) await writeFile(resolve(pending, '.gitignore'), '# unpublished drafts: keep these out of any repository\n*\n');
        await writeFile(recordFile(request_id, 'pending'), JSON.stringify(record));
        console.log(`as ${me.name} (${me.id}): ${what}`);
        told(await deliver(record));
      }
    }
  } else if (cmd === 'serve') {
    /* The book and drawing live from one address. The live sheets are kept
     * in the book's own live folder, which nothing else here reads. */
    await loadBook();
    const port = arg('--port') === undefined ? 4194 : Number(arg('--port'));
    const { startStudioServer } = await import('./studio-server.mjs');
    const live = await startStudioServer({ port, dataDir: resolve(BOOK_DIR, 'live'), bookDir: BOOK_DIR }).catch((error) => {
      throw error.code === 'EADDRINUSE' ? new Error(`port ${port} is already in use; choose another with --port`) : error;
    });
    const where = relative(process.cwd(), BOOK_DIR) || '.';
    console.log(`The book: ${live.url}/\nDrawing live: ${live.url}/studio.html\nLive sheets are kept in ${where.startsWith('..') ? BOOK_DIR : where}/live. Ctrl-C stops the server.`);
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { live.server.close(() => process.exit(0)); live.server.closeIdleConnections(); });
  } else if (cmd === 'live') {
    /* Drawing live, by its own client: every argument passes straight through. */
    const child = spawn(process.execPath, [resolve(ROOT, 'studio.mjs'), ...args], { stdio: 'inherit' });
    process.exitCode = await new Promise((done) => child.on('close', (code) => done(code ?? 1)));
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
    const checked = marksToStore(built.ops, limitsForPage(dimensions, surface));
    if (!checked.ops) throw new Error(`the page's marks were rejected:\n  ${checked.errors.join('\n  ')}`);
    let ops = checked.ops;
    const motion = motionFor(built.meta.motion, dimensions, ops);
    const way = await motionOut(out, motion, dimensions);
    if (way) {
      const info = await renderPage({ ops, w: dimensions.w, h: dimensions.h, surface, ...way, out: resolve(process.cwd(), out) });
      console.log(`preview: "${built.meta.title || 'untitled'}" → ${reportMotion(way, info, out)} Nothing was saved.`);
    } else {
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
    const which = motion ? `, ${frameName(motion, view)} at ${motion.fps} fps` : '';
    console.log(`preview: "${built.meta.title || 'untitled'}"${through}${which}, ${ops.length} marks → ${out}. Nothing was saved.`);
    if (built.meta.noPaper) console.log(`This page names no paper, so it is drawn on the original canvas, and it can't be saved there as a new page. Give it paper beside page: ${PAPER_HELP}.`);
    }
  } else {
    throw new Error('Unknown command. Run node book.mjs help for drawing, inspection, revision and selection commands.');
  }
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  if (lock) await rm(lock, { force: true });
}
