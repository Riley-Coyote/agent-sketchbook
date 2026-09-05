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
 *   node book.mjs blank
 *
 * `--book <dir>` picks the book (default: ./book). One folder per mind.
 *
 * write runs the module in the sandbox (sandbox.mjs: no globals, no network,
 * imports only from this folder, a time limit) and keeps only marks that pass
 * validate.js. `--unsafe` imports the module directly; for your own pages
 * while developing, never for someone else's.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve, dirname, relative, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { sanitizeOps, sanitizePageMeta, sanitizePageDimensions, limitsForPage } from './validate.js';

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
  await writeFile(INDEX, JSON.stringify(book, null, 2) + '\n');
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
    if (!page || typeof page.build !== 'function') throw new Error('a page module exports default { title, date, note, build }');
    return { ops: page.build(), meta: { title: page.title, date: page.date, note: page.note, refs: page.refs, seed: page.seed, page: page.page } };
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

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };

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
const engine = new MarkEngine({ width: page.w, height: page.h, dpr: page.scale });
engine.load(page.ops).finish();
const flat = engine.toDataURL();
if (page.transparent) { window.__png = flat; }
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
</script>`;

async function renderPage({ ops, w, h, scale, transparent, out }) {
  const chromium = await playwright();
  if (!chromium) { console.error(MANUAL); process.exit(2); }
  const { server, port } = await serve({ ops, w, h, scale, transparent });
  const browser = await chromium.launch();
  try {
    const tab = await browser.newPage();
    const failures = [];
    tab.on('pageerror', (e) => failures.push(String(e)));
    await tab.goto(`http://127.0.0.1:${port}/__render.html`);
    await tab.waitForFunction('typeof window.__png === "string"', null, { timeout: 60000 })
      .catch(() => { throw new Error(`the page did not draw${failures.length ? `: ${failures[0]}` : ''}`); });
    const url = await tab.evaluate('window.__png');
    await writeFile(out, Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
  } finally {
    await browser.close();
    server.close();
  }
}

try {
  if (cmd === 'init') {
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
      console.log(`  ${String(p.index).padStart(2)}  ${p.date}  ${p.title}${refs}  (${p.opCount} marks)`);
    }
  } else if (cmd === 'read') {
    const book = await loadBook();
    const n = Number(args[0]);
    const meta = book.pages.find((p) => p.index === n);
    if (!meta) throw new Error(`no page ${n}`);
    const page = JSON.parse(await readFile(resolve(BOOK_DIR, meta.file), 'utf8'));
    const { ops, source, ...rest } = page;
    console.log(JSON.stringify({ ...rest, opCount: ops.length, sourceBytes: source.length }, null, 2));
    if (flag('--source')) console.log('\n' + source);
  } else if (cmd === 'blank') {
    const book = await loadBook();
    console.log(book.pageCount - book.pages.length);
  } else if (cmd === 'write') {
    const book = await loadBook();
    if (!args[0] || args[0].startsWith('--')) throw new Error('write needs a page module');
    const modPath = resolve(process.cwd(), args[0]);
    if (book.pages.length >= book.pageCount) throw new Error('the book is full');
    const built = await buildPage(modPath);
    const { page, errors: dimensionErrors } = sanitizePageDimensions(built.meta.page);
    if (!page) throw new Error(`the page dimensions were rejected: ${dimensionErrors.join('; ')}`);
    const { ops, errors, stats } = sanitizeOps((built.ops || []).map(roundOp), limitsForPage(page));
    if (!ops) throw new Error(`the page's marks were rejected:\n  ${errors.join('\n  ')}`);
    if (ops.length === 0) throw new Error('the page has no marks');
    const { meta: m } = sanitizePageMeta({
      title: arg('--title') || built.meta.title,
      date: arg('--date') || built.meta.date,
      note: arg('--note') || built.meta.note,
      refs: (arg('--refs') || '').split(',').filter(Boolean).map(Number).concat(built.meta.refs || []),
    });
    if (!m.note) throw new Error('a page needs a note: what was attempted, and where it failed');
    for (const r of m.refs) if (!book.pages.some((p) => p.index === r)) throw new Error(`refs page ${r}, which is not in the book`);
    const source = await readFile(modPath, 'utf8');
    const index = book.pages.length + 1;
    const meta = {
      index,
      file: `pages/${String(index).padStart(3, '0')}.json`,
      ...m,
      date: m.date || new Date().toISOString().slice(0, 10),
      seed: built.meta.seed ?? index,
      page,
      module: relative(ROOT, modPath),
      opCount: ops.length,
      points: stats.points,
      state: 'drawn',
    };
    await mkdir(resolve(BOOK_DIR, 'pages'), { recursive: true });
    await writeFile(resolve(BOOK_DIR, meta.file), JSON.stringify({ ...meta, source, ops }));
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
    const { ops, errors } = sanitizeOps(page.ops, limitsForPage(dimensions));
    if (!ops) throw new Error(`the page's marks were rejected: ${errors.join('; ')}`);
    const scale = Number(arg('--scale')) || 2;
    await renderPage({
      ops,
      w: dimensions.w,
      h: dimensions.h,
      scale,
      transparent: flag('--transparent'),
      out: resolve(process.cwd(), out),
    });
    console.log(`page ${n}: "${meta.title}" → ${out} (${dimensions.w * scale}×${dimensions.h * scale})`);
  } else {
    throw new Error('commands: init --owner <name>, list, read <n> [--source], write <module.js> [--refs a,b], render <n> --out <png> [--scale 2] [--transparent], blank   (--book <dir> on any)');
  }
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
