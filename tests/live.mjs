/* tests/live.mjs — node tests/live.mjs
 * Drawing live is the sketchbook's live mode. A live sheet is a page's paper,
 * it becomes a page in one step, and the book's own command serves both.
 * Self-contained: runs `book.mjs serve` on a free port with a scratch book
 * outside this folder, draws through `book.mjs live`, and renders through
 * book.mjs with the repository's own playwright-core.
 */
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inflateSync } from 'node:zlib';
import http from 'node:http';
import { compilePage } from '../page-program.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const run = promisify(execFile);
let pass = 0, fail = 0;
const ok = (c, name) => { if (c) { pass++; console.log(`  ok   ${name}`); } else { fail++; console.log(`  FAIL ${name}`); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* PNG to RGBA, all five row filters: Chromium's encoder uses them. */
function pixels(bytes) {
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20), channels = bytes[25] === 6 ? 4 : 3, idat = [];
  for (let o = 8; o < bytes.length;) { const n = bytes.readUInt32BE(o); if (bytes.toString('ascii', o + 4, o + 8) === 'IDAT') idat.push(bytes.subarray(o + 8, o + 8 + n)); o += n + 12; }
  const raw = inflateSync(Buffer.concat(idat)), stride = width * channels, data = new Uint8Array(width * height * 4);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)], line = Uint8Array.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? line[i - channels] : 0, b = prev[i], c = i >= channels ? prev[i - channels] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      line[i] = (line[i] + [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][filter]) & 255;
    }
    for (let x = 0; x < width; x++) for (let k = 0; k < 4; k++) data[(y * width + x) * 4 + k] = k < channels ? line[x * channels + k] : 255;
    prev = line;
  }
  return { width, height, data };
}

const scratch = await mkdtemp(join(tmpdir(), 'sketchbook-live-'));
const fixtures = await mkdtemp(join(ROOT, 'tests', 'live-fixtures-'));
const book = join(scratch, 'elsewhere');
const tool = (...args) => run(process.execPath, [join(ROOT, 'book.mjs'), ...args], { cwd: ROOT, maxBuffer: 1 << 26 });
let server, url;
const live = (...args) => tool('live', ...args, '--url', url);
const json = async (...args) => JSON.parse((await live(...args)).stdout);
const raw = (path, headers = {}) => new Promise((done, reject) => {
  http.get(`${url}${path}`, { headers }, (res) => { const chunks = []; res.on('data', (c) => chunks.push(c)); res.on('end', () => done({ status: res.statusCode, type: res.headers['content-type'], body: Buffer.concat(chunks) })); }).on('error', reject);
});
const actions = async (list) => { const file = join(scratch, 'actions.json'); await writeFile(file, JSON.stringify(list)); return json('actions', '--file', file); };
const at = (x, y, p, t) => ({ x, y, p, t });

try {
  await tool('init', '--owner', 'Live test', '--title', 'A book elsewhere', '--book', book);
  const listedBefore = (await tool('list', '--book', book)).stdout;

  /* one command: the book and drawing live from one address */
  server = spawn(process.execPath, [join(ROOT, 'book.mjs'), 'serve', '--port', '0', '--book', book], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  const printed = await new Promise((done, reject) => {
    let out = '', err = '';
    const timer = setTimeout(() => reject(new Error(`serve did not start: ${err}`)), 15000);
    server.stderr.on('data', (b) => { err += b; });
    server.once('exit', (code) => { clearTimeout(timer); reject(new Error(`serve exited ${code}: ${err}`)); });
    server.stdout.on('data', (b) => { out += b; if (out.includes('Ctrl-C')) { clearTimeout(timer); done(out); } });
  });
  url = printed.match(/^The book: (http:\/\/127\.0\.0\.1:\d+)\/$/m)?.[1];
  ok(url && printed.includes(`Drawing live: ${url}/studio.html`) && printed.includes(`${book}/live`), `serve prints the book's address and the live sheet's (${url})`);

  /* the same paper: a new live sheet is stored in a page's form */
  ok(same((await json('new', '--title', 'Plain')).surface, { kind: 'ink', version: 2, paper: '#f6f6f3', tooth: 0.65, seed: 17 }), 'new with no paper is white paper with tooth 0.65 and seed 17, in the page form');
  const made = await json('new', '--title', 'Cream study', '--width', '400', '--height', '300', '--paper', 'cream', '--tooth', '0.7', '--seed', '23');
  const cream = { kind: 'ink', version: 2, paper: '#f3eee2', tooth: 0.7, seed: 23 };
  ok(same(made.surface, cream), 'new --paper cream --tooth 0.7 --seed 23 is { kind: ink, version: 2, paper: #f3eee2, tooth: 0.7, seed: 23 }');
  ok(same(JSON.parse(await readFile(join(book, 'live', 'active.json'), 'utf8')).drawing.surface, cream), "and is kept so in the book's live folder");
  let refused = await tool('live', 'new', '--paper', 'toned', '--url', url).then(() => '', (e) => e.stderr);
  ok(/paper is night, black, white, cream, grey, slate, kraft or '#rrggbb'/.test(refused), "an old studio paper name is refused with the papers a page names");

  /* a review before any mark, two passes with reviews, and marks after the last */
  const drawn = await actions([
    { type: 'review', observation: 'Plan: two pencil lines, a charcoal shadow.', lesson: '', next: '' },
    { type: 'select', tool: 'graphite-6b', options: { size: 6 } },
    { type: 'stroke', samples: [at(40, 60, .3, 0), at(200, 90, .9, 600), at(360, 70, .5, 1100)] },
    { type: 'stroke', samples: [at(50, 120, .6, 0), at(340, 160, .7, 900)] },
    { type: 'review', observation: "The soft pencil catches the cream's tooth.", lesson: 'Lighter passes keep the grain open.', next: 'A charcoal shadow under the lines.', region: { x: 30, y: 40, w: 340, h: 140 } },
    { type: 'select', tool: 'vine-charcoal' },
    { type: 'stroke', samples: [at(60, 220, .5, 0), at(330, 240, .8, 1200)] },
    { type: 'select', tool: 'stump' },
    { type: 'stroke', samples: [at(80, 225, .6, 0), at(300, 235, .6, 800)] },
    { type: 'review', observation: 'The stump pulled the charcoal into a band.', lesson: 'The stump carries what it picks up.', next: 'Lift a light edge.' },
    { type: 'select', tool: 'kneaded-eraser' },
    { type: 'stroke', samples: [at(120, 228, .7, 0), at(220, 232, .7, 500)] },
  ]);
  const sheet = (await json('status', '--full')).drawing;
  ok(drawn.marks === 5 && sheet.ops.length === 5, 'five gestures on the live sheet');

  /* a live sheet holds dry media only */
  const wet = { ...sheet, ops: [...sheet.ops, { k: 's', pts: [[10, 10], [90, 90]], layer: 'line', brush: 'pencil' }] };
  const putWet = await fetch(`${url}/api/session`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: (await json('status')).revision, drawing: wet }) });
  ok(putWet.status === 400 && /dry media only/.test((await putWet.json()).error), 'a stroke of paint is refused: a live sheet holds dry media only');

  /* a live sheet becomes a page */
  const module = join(fixtures, 'cream.js');
  const said = (await live('page', '--out', relative(ROOT, module), '--book', book)).stdout;
  const line = said.split('\n').find((l) => l.trim().startsWith('node '))?.trim();
  ok(line === `node book.mjs write ${relative(ROOT, module)} --book ${book}`, `page prints the exact write line (${line})`);
  const source = await readFile(module, 'utf8');
  ok(source.includes('paper: {"colour":"cream","tooth":0.7,"seed":23},'), 'the module names its paper in the object form, by name');
  ok(sheet.ops.every((op) => source.split('\n').includes(JSON.stringify(op)) || source.split('\n').includes(JSON.stringify(op) + ',')), 'each gesture is frozen data on its own line');
  const built = compilePage((await import(pathToFileURL(module).href)).default);
  ok(built.ops.length === sheet.ops.length && built.ops.every((op, i) => same(op, sheet.ops[i])), `the module builds to exactly the sheet's ${sheet.ops.length} gestures, op by op`);
  const passes = built.meta.passes;
  ok(same(passes.map((p) => [p.start, p.end]), [[0, 2], [2, 4], [4, 5]]), `passes are cut at each review (${JSON.stringify(passes.map((p) => [p.start, p.end]))})`);
  ok(same(passes[0].review, { observation: "The soft pencil catches the cream's tooth.", change: 'Lighter passes keep the grain open.', next: 'A charcoal shadow under the lines.', region: [30, 40, 340, 140] }) && passes[1].review.change === 'The stump carries what it picks up.' && !passes[2].review, 'each review rides its pass as { observation, change: its lesson, next, region }');
  ok(passes[0].note === 'Plan: two pencil lines, a charcoal shadow.' && built.meta.note === 'The stump pulled the charcoal into a band.', "a review before any mark is the first pass's note; the page's note is the last review's observation");
  const again = await live('page', '--out', relative(ROOT, module)).then(() => '', (e) => e.stderr);
  ok(/already exists; nothing was overwritten/.test(again) && (await readFile(module, 'utf8')) === source, 'page refuses to overwrite a file');

  /* the printed line, run as printed */
  await run('/bin/sh', ['-c', line], { cwd: ROOT });
  const saved = JSON.parse(await readFile(join(book, 'pages', '001.json'), 'utf8'));
  ok(saved.ops.length === sheet.ops.length && saved.ops.every((op, i) => same(op, sheet.ops[i])) && same(saved.surface, sheet.surface), "the written page holds the sheet's gestures and paper exactly");
  ok(saved.journal.passes.length === 3 && saved.title === 'Cream study', 'with its three passes and its title');

  /* the same sheet, cell for cell: the page's render against the sheet's own inspect image */
  const render = (scale) => tool('render', '1', '--book', book, '--out', join(scratch, `page-${scale}.png`), '--scale', String(scale));
  await render(2); await render(1);
  await live('export', '--out', join(scratch, 'sheet-2.png'), '--scale', '2');
  const page2 = pixels(await readFile(join(scratch, 'page-2.png'))), sheet2 = pixels(await readFile(join(scratch, 'sheet-2.png')));
  let max = 0;
  for (let i = 0; i < page2.data.length; i++) max = Math.max(max, Math.abs(page2.data[i] - sheet2.data[i]));
  ok(page2.width === 800 && sheet2.width === 800 && max === 0, `at scale 2, one pixel per pigment cell, the render equals the sheet's inspect image (largest difference ${max})`);
  /* at scale 1 the render filters four cells into a pixel; the inspect image
   * samples one. Measured against the 2x2 average of the sheet's own cells. */
  const page1 = pixels(await readFile(join(scratch, 'page-1.png')));
  let worst = 0;
  for (let y = 0; y < page1.height; y++) for (let x = 0; x < page1.width; x++) for (let k = 0; k < 3; k++) {
    let sum = 0;
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) sum += sheet2.data[((2 * y + dy) * sheet2.width + 2 * x + dx) * 4 + k];
    worst = Math.max(worst, Math.abs(sum / 4 - page1.data[(y * page1.width + x) * 4 + k]));
  }
  ok(worst <= 1, `at scale 1 the render is the sheet's cells averaged four to a pixel, within rounding (largest difference ${worst})`);

  /* serve --book: that book at /, its files only */
  const root = await raw('/');
  ok(root.status === 200 && root.type === 'text/html; charset=utf-8' && root.body.includes('<title>Sketchbook</title>'), '/ opens the book (index.html)');
  ok(JSON.parse((await raw('/book/book.json')).body).owner === 'Live test', '/book/ answers from the book outside the repo');
  ok((await raw('/book/..%2fbook.mjs')).status === 403 && (await raw('/book/%2e%2e%2fstudio.mjs')).status === 403, 'a path climbing out of the book is refused');
  await writeFile(join(scratch, 'outside.json'), '{"secret":true}');
  await symlink(join(scratch, 'outside.json'), join(book, 'outside.json'));
  ok((await raw('/book/outside.json')).status === 403, 'a link inside the book to a file outside it is refused');
  ok((await raw('/book/live/active.json')).status === 403, 'the live sheets are not served as files');
  ok((await raw('/book/book.json', { Host: 'attacker.example' })).status === 403, 'loopback only, as before');

  /* the guide opens as text */
  const guide = await raw('/START_HERE.md');
  ok(guide.status === 200 && guide.type === 'text/plain; charset=utf-8' && guide.body.equals(await readFile(join(ROOT, 'START_HERE.md'))), 'START_HERE.md is sent as utf-8 plain text');

  /* book.mjs live passes its arguments through */
  const direct = await run(process.execPath, [join(ROOT, 'studio.mjs'), 'status', '--url', url], { cwd: ROOT });
  ok((await live('status')).stdout === direct.stdout, 'book.mjs live status prints what studio.mjs status prints');
  const unknown = await tool('live', 'paint', '--url', url).then(() => null, (e) => e);
  ok(unknown?.code === 1 && /Unknown command: paint/.test(unknown.stderr), "and its refusals and exit code");

  /* a sheet saved in the old graphite form still loads, draws, inspects and saves */
  const oldSurface = { version: 1, paper: 'toned', tooth: 0.6, seed: 5 };
  const oldGesture = { k: 'm', tool: 'graphite-2b', size: 2.2, strength: 1, samples: [{ x: 20, y: 30, p: 0.4, tiltX: 0, tiltY: 0, t: 0 }, { x: 200, y: 120, p: 0.8, tiltX: 10, tiltY: 0, t: 700 }] };
  await writeFile(join(book, 'live', 'saves', 'old-form.json'), JSON.stringify({ version: 1, id: 'old-form', name: 'Old pressure study', savedAt: '2026-09-01T00:00:00.000Z', revision: 3, drawing: { version: 1, title: 'Old pressure study', page: { w: 240, h: 180 }, surface: oldSurface, ops: [oldGesture], reviews: [], tool: 'graphite-2b', settings: { size: 2.2, strength: 1 }, redo: [] } }));
  const loaded = await json('load', '--id', 'old-form');
  ok(same(loaded.surface, oldSurface) && loaded.marks === 1, 'an old-form sheet loads with its surface as it was');
  await actions([{ type: 'stroke', samples: [at(30, 150, .6, 0), at(210, 140, .6, 600)] }]);
  await live('inspect', '--out', join(scratch, 'old.png'));
  const oldImage = pixels(await readFile(join(scratch, 'old.png')));
  ok(oldImage.width === 240 && oldImage.height === 180, 'draws and inspects');
  const kept = await json('save', '--name', 'Old form kept');
  const keptFile = JSON.parse(await readFile(join(book, 'live', 'saves', `${kept.save.id}.json`), 'utf8'));
  ok(same(keptFile.drawing.surface, oldSurface) && keptFile.drawing.ops.length === 2, 'and saves in its own form');
  const noNote = await live('page', '--out', relative(ROOT, join(fixtures, 'old.js'))).then(() => '', (e) => e.stderr);
  ok(/a page needs a note/.test(noNote), 'a sheet with no review and no --note is refused: a page needs a note');
  await live('page', '--out', relative(ROOT, join(fixtures, 'old.js')), '--note', 'An old sheet, carried into the book.', '--book', book);
  ok((await readFile(join(fixtures, 'old.js'), 'utf8')).includes(`surface: ${JSON.stringify(oldSurface)},`), 'an old-form sheet becomes a page with its surface spelled out');
  await tool('write', join(fixtures, 'old.js'), '--book', book);
  const oldPage = JSON.parse(await readFile(join(book, 'pages', '002.json'), 'utf8'));
  ok(same(oldPage.surface, oldSurface) && same(oldPage.ops, keptFile.drawing.ops), 'and is written with its gestures and paper exactly');

  /* nothing else picks up the live folder */
  const listed = (await tool('list', '--book', book)).stdout;
  ok(listed.split('\n')[0] === listedBefore.split('\n')[0].replace('0 of 48', '2 of 48') && !/live|saves|active/.test(listed), 'list shows the two pages and nothing from the live folder');
  await tool('export', '1', '--book', book, '--out', join(scratch, 'post.json'));
  const post = JSON.parse(await readFile(join(scratch, 'post.json'), 'utf8'));
  ok(same(post.ops, saved.ops) && !JSON.stringify(post).includes('active.json') && !JSON.stringify(post).includes('/live/'), 'export packages the page alone');
} finally {
  if (server && server.exitCode === null) { const exited = new Promise((done) => server.once('exit', done)); server.kill('SIGTERM'); await exited; }
  ok(server?.exitCode === 0, 'the server stops on SIGTERM');
  await rm(fixtures, { recursive: true, force: true });
  await rm(scratch, { recursive: true, force: true });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
