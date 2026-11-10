/* tests/one-page.mjs — node tests/one-page.mjs
 * One page: a page names its paper, and paper with tooth takes graphite
 * under paint and type. Old pages keep their meaning: the original canvas,
 * paper without tooth and the old graphite form render byte for byte as they
 * did before this change. Self-contained: serves this folder itself and
 * drives headless Chromium via the repository's own playwright-core.
 *
 * Parity compares against the engine at BASE, one-sketchbook before one
 * page, straight from git and rendered in the same browser.
 */
import { createServer } from 'node:http';
import { readFile, writeFile, mkdtemp, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compilePage } from '../page-program.js';
import { sanitizeSurface, sanitizeOps, limitsForPage } from '../validate.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = '34baa1f';
let pass = 0, fail = 0;
const ok = (c, name) => { if (c) { pass++; console.log(`  ok   ${name}`); } else { fail++; console.log(`  FAIL ${name}`); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const hash = (v) => createHash('sha256').update(typeof v === 'string' ? v : JSON.stringify(v)).digest('hex');

const before = {};
try {
  for (const f of ['mark-engine.js', 'material-engine.js']) before[f] = execFileSync('git', ['show', `${BASE}:${f}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 });
} catch { /* reported below */ }

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.woff': 'font/woff' };
const server = createServer(async (req, res) => {
  let path = decodeURIComponent((req.url || '/').split('?')[0]);
  if (path === '/__blank.html') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<!doctype html><meta charset="utf-8"><body>'); }
  const old = path.match(/^\/base\/(mark-engine|material-engine)\.js$/);
  if (old && before[`${old[1]}.js`]) { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(before[`${old[1]}.js`]); }
  if (path.startsWith('/base/')) path = path.slice(5);
  const file = resolve(ROOT, '.' + path);
  if (relative(ROOT, file).startsWith('..') || !existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
  res.end(await readFile(file));
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${server.address().port}`;

const fixtures = await mkdtemp(join(ROOT, 'tests', 'one-page-fixtures-'));
const scratch = await mkdtemp(join(tmpdir(), 'sketch-one-page-'));
const cli = (...args) => {
  const r = spawnSync(process.execPath, [join(ROOT, 'book.mjs'), ...args], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 });
  return { code: r.status, out: r.stdout, err: r.stderr };
};
const module = async (name, fields, ops) => {
  const path = join(fixtures, `${name}.js`);
  await writeFile(path, `export default ${JSON.stringify({ title: name, date: '2026-11-09', note: `one page: ${name}`, page: { w: 160, h: 120 }, ...fields }).slice(0, -1)}, build: () => ${JSON.stringify(ops)} };\n`);
  return path;
};
const saved = async (book, n) => JSON.parse(await readFile(join(book, 'pages', `${String(n).padStart(3, '0')}.json`), 'utf8'));
const stroke = (y, c) => ({ k: 's', pts: [[10, y], [150, y]], layer: 'line', brush: 'liner', w: 1, ...(c ? { c } : {}) });
const gesture = (y, tool = 'graphite-2b', p = 0.7) => ({ k: 'm', tool, size: 2.2, strength: 1, samples: [{ x: 12, y, p, tiltX: 0, tiltY: 0, t: 0 }, { x: 148, y: y + 4, p, tiltX: 0, tiltY: 0, t: 600 }] });

/* A book with one page on the original canvas, as the tool has always
 * written it: book.json and pages/001.json, with no surface anywhere. */
async function originalCanvasBook(dir, ops) {
  const source = `export default { title: 'night walk', note: 'drawn before pages named their paper', build: () => ${JSON.stringify(ops)} };\n`;
  const meta = { index: 1, file: 'pages/001.json', title: 'night walk', date: '2026-09-01', note: 'drawn before pages named their paper', refs: [], seed: 1, page: { w: 160, h: 120 }, module: 'pages/night-walk.js', opCount: ops.length, points: 2 * ops.length, state: 'drawn', stage: 'study' };
  await mkdir(join(dir, 'pages'), { recursive: true });
  await writeFile(join(dir, meta.file), JSON.stringify({ ...meta, journal: { version: 1, sourceHash: hash(source), marksHash: hash(ops), passes: [] }, source, ops }));
  await writeFile(join(dir, 'book.json'), JSON.stringify({ id: 'sketchbook-fixture-0', title: 'Sketchbook', owner: 'fixture', created: '2026-09-01', pageCount: 48, license: 'all rights reserved by the owner', pages: [meta] }, null, 2) + '\n');
}

const { chromium } = await import('playwright-core');
const browser = await chromium.launch();
const tab = await browser.newPage();
const errors = [];
tab.on('pageerror', (e) => errors.push(String(e)));
await tab.goto(`${base}/__blank.html`);

try {
  console.log('paper');
  {
    const build = () => [stroke(20)];
    ok(same(compilePage({ build, paper: 'cream' }).meta.surface, { kind: 'ink', version: 2, paper: 'cream' }), "paper: 'cream' is the surface { kind: 'ink', version: 2, paper: 'cream' }");
    ok(same(sanitizeSurface(compilePage({ build, paper: 'cream' }).meta.surface), sanitizeSurface({ kind: 'ink', version: 2, paper: 'cream' })), 'and is stored exactly as the spelled-out surface is');
    ok(same(compilePage({ build, paper: { colour: 'white', tooth: 0.65 } }).meta.surface, { kind: 'ink', version: 2, paper: 'white', tooth: 0.65, seed: 17 }), 'the object form adds tooth, with seed 17 by default');
    ok(same(compilePage({ build, paper: { tooth: 0.4, seed: 9 } }).meta.surface, { kind: 'ink', version: 2, paper: 'night', tooth: 0.4, seed: 9 }), 'colour defaults to night; a seed is kept');
    ok(same(compilePage({ build, paper: { colour: 'kraft' } }).meta.surface, { kind: 'ink', version: 2, paper: 'kraft' }), 'without tooth there are no tooth or seed keys');
    let both = '';
    try { compilePage({ build, paper: 'cream', surface: { kind: 'ink', version: 2, paper: 'cream' } }); } catch (e) { both = e.message; }
    ok(/not both/.test(both), 'paper and surface together is an error');
    ok(compilePage({ build }).meta.noPaper === true && !('noPaper' in compilePage({ build, paper: 'night' }).meta) && !('noPaper' in compilePage({ build, surface: { version: 1, paper: 'white', tooth: 0.5, seed: 1 } }).meta), 'a module that names neither is flagged; one that names either is not');
    ok(sanitizeSurface({ kind: 'ink', version: 2, paper: 'cream', tooth: 1.2 }).surface === null && sanitizeSurface({ kind: 'ink', version: 2, seed: 4 }).surface === null, 'tooth outside 0..1, or a seed without tooth, is refused');
  }

  console.log('saving');
  const book = join(scratch, 'book');
  cli('init', '--owner', 'One page', '--book', book);
  {
    const cream = await module('cream', { paper: 'cream' }, [stroke(20)]);
    const toothed = await module('toothed', { paper: { colour: 'white', tooth: 0.65 } }, [gesture(40), stroke(60, [180, 40, 40])]);
    const both = await module('both', { paper: 'cream', surface: { kind: 'ink', version: 2, paper: 'cream' } }, [stroke(20)]);
    ok(cli('write', cream, '--book', book).code === 0 && same((await saved(book, 1)).surface, { kind: 'ink', version: 2, paper: '#f3eee2' }), "write stores paper: 'cream' as { kind: 'ink', version: 2, paper: '#f3eee2' }");
    ok(cli('write', toothed, '--book', book).code === 0 && same((await saved(book, 2)).surface, { kind: 'ink', version: 2, paper: '#f6f6f3', tooth: 0.65, seed: 17 }), 'and the object form with its tooth and seed');
    const index = await readFile(join(book, 'book.json'), 'utf8');
    ok(!/noPaper/.test(index) && !/noPaper/.test(JSON.stringify(await saved(book, 1))), 'the flag is never written into a saved page');
    const refused = cli('write', both, '--book', book);
    ok(refused.code === 1 && /not both/.test(refused.err), 'write refuses paper and surface together');
    ok(same((await saved(book, 2)).ops.map((o) => o.k), ['m', 's']), 'a toothed page keeps gestures beside strokes');
  }

  console.log('a page with no paper');
  const older = join(scratch, 'older');
  const first = [stroke(30)];
  await originalCanvasBook(older, first);
  {
    const nameless = await module('nameless', {}, [...first, stroke(50)]);
    const look = cli('preview', nameless, '--out', join(scratch, 'nameless.png'), '--scale', '1');
    ok(look.code === 0 && /Nothing was saved/.test(look.out) && /names no paper/.test(look.out) && /original canvas/.test(look.out) && /paper: 'night'/.test(look.out) && existsSync(join(scratch, 'nameless.png')), 'preview draws it and says, in one line, how to give it paper');
    ok(look.out.trim().split('\n').length === 2, 'the note is one line beside the usual one');
    const indexBefore = await readFile(join(book, 'book.json'), 'utf8');
    const w = cli('write', nameless, '--book', book);
    ok(w.code === 1 && /names no paper/.test(w.err) && /paper: 'night' for the dark ground/.test(w.err) && /cream/.test(w.err) && /tooth: 0\.65/.test(w.err), 'write refuses it, and shows the fix');
    ok(cli('write', nameless, '--book', book, '--refs', '1').code === 1 && (await readFile(join(book, 'book.json'), 'utf8')) === indexBefore, 'refs are no way round it, and nothing is saved');
    const cont = cli('write', nameless, '--book', older, '--continue', '1');
    const two = cont.code === 0 && await saved(older, 2);
    ok(two && !('surface' in two) && same(two.ops.slice(0, 1), first) && two.ops.length === 2, '--continue from a page on the original canvas saves it there, as before');
    const branch = cli('write', await module('branch', {}, [stroke(80)]), '--book', older, '--branch', '1');
    ok(branch.code === 0 && !('surface' in await saved(older, 3)), '--branch from such a page is accepted too');
    const onPaper = cli('write', await module('onto-paper', {}, [stroke(20), stroke(90)]), '--book', book, '--continue', '1');
    ok(onPaper.code === 1 && /same paper and dimensions/.test(onPaper.err), 'continuing a page with paper meets the same-paper rule');
    const branchPaper = cli('write', nameless, '--book', book, '--branch', '1');
    ok(branchPaper.code === 1 && /names no paper/.test(branchPaper.err), 'branching a page with paper asks for paper');
    const words = [look.out, w.err, branchPaper.err].join('\n');
    ok(!/second canvas|legacy|\bv2\b|version 2|ink surface/i.test(words), 'none of it says second canvas, legacy, v2, version 2 or ink surface');
  }

  console.log('resume');
  {
    const graphite = await module('graphite', { surface: { version: 2, paper: 'white', tooth: 0.6, seed: 25 } }, [gesture(40, 'graphite-6b'), { k: 'clean', tool: 'stump' }]);
    ok(cli('write', graphite, '--book', book).code === 0, 'an old graphite page is still written as it was');
    const cases = [
      [older, 2, (s) => !/\bpaper:/.test(s) && !/\bsurface:/.test(s), 'an original-canvas page resumes with neither paper nor surface'],
      [book, 1, (s) => /\bpaper: "cream",/.test(s), 'a page with paper resumes as paper, by name'],
      [book, 2, (s) => /\bpaper: \{"colour":"white","tooth":0\.65,"seed":17\},/.test(s), 'a toothed page resumes as the object form'],
      [book, 3, (s) => /\bsurface: \{"version":2,"paper":"white","tooth":0\.6,"seed":25\},/.test(s) && !/\bpaper:/.test(s), 'an old graphite page keeps its surface'],
    ];
    for (const [where, n, looks, name] of cases) {
      const out = join(fixtures, `resumed-${relative(scratch, where)}-${n}.js`);
      const r = cli('resume', String(n), '--book', where, '--out', out);
      const source = r.code === 0 ? await readFile(out, 'utf8') : '';
      const again = cli('write', out, '--book', where, '--continue', String(n));
      const index = JSON.parse(await readFile(join(where, 'book.json'), 'utf8'));
      const back = again.code === 0 && await saved(where, index.pages.length);
      const was = await saved(where, n);
      ok(looks(source) && back && same(back.surface, was.surface) && same(back.ops, was.ops), `${name}, and continues on the same paper (${again.code === 0 ? 'saved' : again.err.trim()})`);
    }
  }

  console.log('validation');
  {
    const P = { w: 400, h: 300 };
    const toothed = limitsForPage(P, { kind: 'ink', version: 2, paper: 'cream', tooth: 0.7 });
    const plain = limitsForPage(P, { kind: 'ink', version: 2, paper: 'cream' });
    const original = limitsForPage(P);
    const sheet = limitsForPage(P, { version: 2, paper: 'white', tooth: 0.6, seed: 25 });
    const mixed = [gesture(40), { k: 'clean', tool: 'stump' }, stroke(60), { k: 't', text: 'type', x: 20, y: 90 }, { k: 'f', poly: [[10, 10], [60, 10], [60, 40]] }, { ...stroke(70), overprint: true, brush: 'glaze', layer: 'tone' }, { k: 'd', x: 30, y: 30, r: 4, layer: 'tone', brush: 'soft' }];
    ok(sanitizeOps(mixed, toothed).ops?.length === mixed.length, 'paper with tooth takes gestures and clean beside strokes, type, shapes, glazes and dots');
    const late = { ...gesture(40), samples: [{ x: 10, y: 10, p: 0.5, t: 100 }, { x: 20, y: 20, p: 0.5, t: 50 }] };
    ok(sanitizeOps([late], toothed).ops === null && sanitizeOps([late], sheet).ops === null, 'under the same sample checks');
    const heavy = { k: 'm', tool: 'compressed-charcoal', size: 80, samples: Array.from({ length: 12 }, (_, i) => ({ x: i % 2 ? 700 : -300, y: 150, p: 1, tiltX: 85, tiltY: 0, t: i * 10 })) };
    ok(sanitizeOps([heavy], toothed).errors.some((e) => /contact budget/.test(e)) && sanitizeOps([heavy], sheet).errors.some((e) => /contact budget/.test(e)), 'and the same contact budget');
    const refusal = (limits) => sanitizeOps([gesture(40)], limits).errors.join(' ');
    ok(/tooth: 0\.65/.test(refusal(plain)) && /tooth: 0\.65/.test(refusal(original)) && sanitizeOps([{ k: 'clean', tool: 'stump' }], plain).ops === null, 'paper without tooth and the original canvas refuse gestures, and show the fix');
    ok(sanitizeOps([stroke(60)], sheet).ops === null && sanitizeOps([gesture(40), { k: 'clean', tool: 'stump' }, { k: 'p', ms: 10 }, { k: 'phase', name: 'x' }], sheet).ops?.length === 4, 'the old graphite form keeps its rule: gestures, clean, pauses and phases');
    const all = [refusal(plain), sanitizeOps([stroke(60)], sheet).errors.join(' '), sanitizeOps([{ k: 't', text: 'x', x: 1, y: 1 }], original).errors.join(' '), sanitizeOps([{ ...stroke(60), overprint: true }], original).errors.join(' '), sanitizeSurface({ kind: 'ink', version: 3 }).errors.join(' '), sanitizeSurface({ paper: 'cream' }).errors.join(' ')].join('\n');
    ok(!/second canvas|legacy|\bv2\b|version 2|ink surface/i.test(all), 'refusals name paper, never the second canvas');
  }

  console.log('old pages, byte for byte');
  if (!before['mark-engine.js']) ok(false, `the engine at ${BASE} is not in this clone`);
  else {
    for (const name of ['moth', 'example-riso-harbour', 'example-tide-table', 'opus-5-5-moth', 'opus-5-5-drapery']) {
      const r = await tab.evaluate(async ({ name }) => {
        const [now, then, mod] = await Promise.all([import('/mark-engine.js'), import('/base/mark-engine.js'), import(`/pages/${name}.js`)]);
        const page = mod.default;
        const { w, h } = page.page || { w: 880, h: 660 };
        const draw = async (Engine) => {
          const e = new Engine({ width: w, height: h, dpr: 1, surface: page.surface });
          e.load(page.build());
          await e.ready?.();
          e.finish();
          const c = document.createElement('canvas'); c.width = w; c.height = h;
          e.composite(c.getContext('2d'));
          return { data: c.getContext('2d').getImageData(0, 0, w, h).data, sheet: !!e.dry };
        };
        const a = await draw(now.MarkEngine), b = await draw(then.MarkEngine);
        let diff = 0;
        for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) diff++;
        return { diff, sheet: a.sheet, kind: page.surface ? (page.surface.kind === 'ink' ? 'paper' : 'old graphite') : 'original canvas' };
      }, { name });
      ok(r.diff === 0 && !r.sheet, `${name}.js (${r.kind}) renders byte-identical to ${BASE} (${r.diff} differing bytes)`);
    }
    const viaPaper = await module('via-paper', { paper: 'cream' }, [stroke(30), { k: 't', text: 'cream', x: 20, y: 80, size: 18 }, { k: 'f', poly: [[90, 60], [150, 60], [150, 110]], c: [40, 90, 200], alpha: 0.6 }]);
    const viaSurface = await module('via-surface', { surface: { kind: 'ink', version: 2, paper: 'cream' } }, [stroke(30), { k: 't', text: 'cream', x: 20, y: 80, size: 18 }, { k: 'f', poly: [[90, 60], [150, 60], [150, 110]], c: [40, 90, 200], alpha: 0.6 }]);
    cli('preview', viaPaper, '--out', join(scratch, 'via-paper.png'), '--scale', '2');
    cli('preview', viaSurface, '--out', join(scratch, 'via-surface.png'), '--scale', '2');
    const [pa, pb] = await Promise.all([readFile(join(scratch, 'via-paper.png')).catch(() => null), readFile(join(scratch, 'via-surface.png')).catch(() => null)]);
    ok(pa && pb && pa.length > 1000 && pa.equals(pb), `a page via paper: 'cream' and via the spelled-out surface render byte-identical PNGs (${pa?.length} and ${pb?.length} bytes)`);
  }

  console.log('graphite on the page');
  {
    const r = await tab.evaluate(async () => {
      const { MarkEngine, OP, SHAPE, GLYPHS } = await import('/mark-engine.js');
      const W = 240, H = 160;
      const surface = { kind: 'ink', version: 2, paper: '#f3eee2', tooth: 0.7, seed: 17 };
      const pencil = (y, x0 = 20, x1 = 220, tool = 'graphite-6b') => ({ k: 'm', tool, size: 3, strength: 1, samples: Array.from({ length: 9 }, (_, i) => ({ x: x0 + (x1 - x0) * i / 8, y, p: 0.85, tiltX: 0, tiltY: 0, t: i * 90 })) });
      const px = (e) => { const c = document.createElement('canvas'); c.width = e.w * e.dpr; c.height = e.h * e.dpr; e.composite(c.getContext('2d')); return c.getContext('2d').getImageData(0, 0, c.width, c.height).data; };
      const mean = (d, x0, y0, x1, y1, w = W) => { let s = 0, n = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * w + x) * 4; s += (d[i] + d[i + 1] + d[i + 2]) / 3; n++; } return s / n; };
      const at = (d, x, y, w = W) => Array.from(d.slice((y * w + x) * 4, (y * w + x) * 4 + 3));
      const out = {};

      const blank = new MarkEngine({ width: W, height: H, dpr: 1, surface }).load([]).finish();
      const drawn = new MarkEngine({ width: W, height: H, dpr: 1, surface }).load([pencil(40), pencil(42), pencil(44)]).finish();
      const b = px(blank), g = px(drawn);
      out.blankPaper = mean(b, 0, 0, W, H);
      out.paperColour = [0, 1, 2].map((c) => Math.round(b.filter((_, i) => i % 4 === c).reduce((s, v) => s + v, 0) / (W * H)));
      out.under = mean(g, 40, 38, 200, 47); out.beside = mean(g, 40, 100, 200, 110); out.blankUnder = mean(b, 40, 38, 200, 47);
      out.sheet = !!drawn.dry && !!blank.dry;

      // a red stroke over the graphite shows red; an opaque shape over it hides it
      const red = OP('s', [[120, 10], [120, 150]], 'line', 'brush', 2, [200, 30, 30], 1);
      const cover = SHAPE([[150, 20], [200, 20], [200, 70], [150, 70]], [40, 90, 200], { alpha: 1 });
      const mixedOps = [pencil(40), pencil(42), pencil(44), red, cover];
      const mixed = px(new MarkEngine({ width: W, height: H, dpr: 1, surface }).load(mixedOps).finish());
      out.redOnGraphite = at(mixed, 120, 42);
      out.coverOnGraphite = at(mixed, 175, 42); out.coverOnPaper = at(mixed, 175, 62);

      // order is by material, not time: graphite laid after the shape still sits under it
      const late = px(new MarkEngine({ width: W, height: H, dpr: 1, surface }).load([cover, pencil(40), pencil(42), pencil(44)]).finish());
      out.lateUnderCover = at(late, 175, 42);

      // replay in uneven slices ends on what finish() draws, with a coat a gesture interrupts, type, a clean and a lift
      const glaze = (y) => OP('s', [[10, y], [230, y]], 'tone', 'glaze', 5, [60, 120, 200], 0.5, { overprint: true });
      const all = [glaze(30), glaze(36), pencil(33, 30, 200, 'graphite-2b'), glaze(42), { k: 'm', tool: 'stump', size: 14, strength: 1, samples: [{ x: 40, y: 40, p: 0.6, tiltX: 0, tiltY: 0, t: 0 }, { x: 160, y: 44, p: 0.6, tiltX: 0, tiltY: 0, t: 500 }] }, { k: 'clean', tool: 'stump' }, GLYPHS('graphite under type', 20, 120, { font: 'serif', size: 20 }), { k: 'm', tool: 'kneaded-eraser', size: 12, strength: 1, samples: [{ x: 60, y: 40, p: 0.8, tiltX: 0, tiltY: 0, t: 0 }, { x: 62, y: 41, p: 0.8, tiltX: 0, tiltY: 0, t: 400 }] }, cover];
      const fin = new MarkEngine({ width: W, height: H, dpr: 2, surface }); fin.load(all); await fin.ready(); fin.finish();
      const rep = new MarkEngine({ width: W, height: H, dpr: 2, surface }); rep.load(all); await rep.ready(); rep.replay();
      let steps = 0, pens = 0;
      while (rep.tick(0.013 + (steps % 7) * 0.011, 3) && steps < 100000) { steps++; if (rep.pen) pens++; }
      const A = px(fin), B = px(rep);
      let diff = 0; for (let i = 0; i < A.length; i++) if (A[i] !== B[i]) diff++;
      out.replayDiff = diff; out.steps = steps; out.pens = pens;

      // append continues the page; drawFrame and motion frames work on such a page
      const app = new MarkEngine({ width: W, height: H, dpr: 2, surface }); app.load(all.slice(0, 4)); await app.ready(); app.finish(); app.append(all.slice(4));
      const C = px(app); let adiff = 0; for (let i = 0; i < A.length; i++) if (A[i] !== C[i]) adiff++;
      out.appendDiff = adiff;
      const loop = new MarkEngine({ width: W, height: H, dpr: 1, surface }).load([pencil(40), { k: 'frame' }, pencil(100), { k: 'frame' }, red]);
      const frames = loop.motionFrames().map((c) => c.getContext('2d').getImageData(0, 0, W, H).data);
      out.frames = frames.length;
      out.frame0Dark = mean(frames[0], 40, 38, 200, 47) < out.blankUnder - 10 && Math.abs(mean(frames[0], 40, 96, 200, 106) - out.blankPaper) < 6;
      out.frame1Dark = mean(frames[1], 40, 96, 200, 106) < out.blankUnder - 10 && Math.abs(mean(frames[1], 40, 38, 200, 47) - mean(b, 40, 38, 200, 47)) < 1;
      loop.drawFrame(2);
      out.frame2Red = at(px(loop), 120, 42);
      out.dataURL = fin.toDataURL().length > blank.toDataURL().length;

      // night paper with tooth: its ground is night's, and chalk shows on it
      const nightSurface = { kind: 'ink', version: 2, paper: 'night', tooth: 0.7, seed: 17 };
      const night = px(new MarkEngine({ width: W, height: H, dpr: 1, surface: nightSurface }).load([]).finish());
      const flat = px(new MarkEngine({ width: W, height: H, dpr: 1, surface: { kind: 'ink', version: 2, paper: 'night' } }).load([]).finish());
      out.nightGround = mean(night, 0, 0, W, H) - mean(flat, 0, 0, W, H);
      out.nightCorner = [at(night, 2, 2), at(flat, 2, 2), at(night, W - 3, H - 3), at(flat, W - 3, H - 3)];
      const chalk = px(new MarkEngine({ width: W, height: H, dpr: 1, surface: nightSurface }).load([pencil(40, 20, 220, 'white-chalk'), pencil(42, 20, 220, 'white-chalk')]).finish());
      out.chalk = mean(chalk, 40, 37, 200, 46) - mean(night, 40, 37, 200, 46);
      return out;
    });
    ok(r.sheet, 'paper with tooth holds a sheet as the paper itself');
    ok(Math.abs(r.paperColour[0] - 243) < 4 && Math.abs(r.paperColour[1] - 238) < 4 && Math.abs(r.paperColour[2] - 226) < 4, `the paper is its colour, with grain (${r.paperColour})`);
    ok(r.under < r.blankUnder - 25 && Math.abs(r.beside - r.blankPaper) < 6, `a pencil gesture darkens the paper where it runs (${r.blankUnder.toFixed(0)} → ${r.under.toFixed(0)}) and nowhere else (${r.beside.toFixed(0)})`);
    ok(r.redOnGraphite[0] > r.redOnGraphite[1] + 80 && r.redOnGraphite[0] > r.redOnGraphite[2] + 80, `a coloured stroke over graphite shows its colour (${r.redOnGraphite})`);
    const near = (c) => c.every((v, i) => Math.abs(v - [40, 90, 200][i]) <= 1);
    ok(same(r.coverOnGraphite, r.coverOnPaper) && near(r.coverOnGraphite), `an opaque shape over graphite hides it (${r.coverOnGraphite} over graphite, ${r.coverOnPaper} over paper)`);
    ok(same(r.lateUnderCover, r.coverOnPaper), 'graphite laid after the shape still sits under it: order is by material, not time');
    ok(r.replayDiff === 0 && r.steps > 20, `replay in ${r.steps} uneven slices ends on exactly what finish() draws (${r.replayDiff} differing bytes)`);
    ok(r.pens > r.steps / 2, 'the pen is known while gestures and marks are drawn');
    ok(r.appendDiff === 0, `append continues a toothed page to the same pixels (${r.appendDiff} differing bytes)`);
    ok(r.frames === 3 && r.frame0Dark && r.frame1Dark && r.frame2Red[0] > r.frame2Red[1] + 80, 'motion frames each draw their own graphite, fresh, and drawFrame reaches them');
    ok(r.dataURL, 'toDataURL flattens the sheet and the layers');
    ok(Math.abs(r.nightGround) < 3 && r.nightCorner[0].every((v, i) => Math.abs(v - r.nightCorner[1][i]) < 6) && r.nightCorner[2].every((v, i) => Math.abs(v - r.nightCorner[3][i]) < 6), `night with tooth keeps night's radial ground (mean differs by ${r.nightGround.toFixed(2)})`);
    ok(r.chalk > 25, `chalk shows on night paper with tooth (+${r.chalk.toFixed(0)})`);
  }

  console.log('a toothed page through the book');
  {
    const mixed = await module('mixed', { paper: { colour: 'cream', tooth: 0.7 } }, [gesture(40, 'graphite-6b'), gesture(43, 'graphite-6b'), stroke(70, [200, 30, 30]), { k: 't', text: 'type', x: 20, y: 100, size: 18, font: 'serif' }, { k: 'f', poly: [[100, 20], [150, 20], [150, 60], [100, 60]], c: [40, 90, 200] }]);
    const look = cli('preview', mixed, '--out', join(scratch, 'mixed-preview.png'), '--scale', '1');
    const w = cli('write', mixed, '--book', book);
    const n = JSON.parse(await readFile(join(book, 'book.json'), 'utf8')).pages.length;
    const r = cli('render', String(n), '--book', book, '--out', join(scratch, 'mixed-render.png'), '--scale', '1');
    const [a, b] = await Promise.all([readFile(join(scratch, 'mixed-preview.png')).catch(() => null), readFile(join(scratch, 'mixed-render.png')).catch(() => null)]);
    const shown = a && await tab.evaluate(async (b64) => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
      const at = (x, y) => Array.from(ctx.getImageData(x, y, 1, 1).data.slice(0, 3));
      // the darkest point where the two gestures run, left of the shape
      let graphite = [255, 255, 255];
      for (let y = 38; y < 50; y++) for (let x = 40; x < 90; x++) { const c = at(x, y); if (c[0] + c[1] + c[2] < graphite[0] + graphite[1] + graphite[2]) graphite = c; }
      return { size: [img.width, img.height], paper: at(150, 110), graphite, shape: at(125, 30) };
    }, a.toString('base64'));
    ok(look.code === 0 && !/names no paper/.test(look.out) && w.code === 0 && r.code === 0 && a?.equals(b), 'preview, write and render draw a toothed page, and the saved render matches its preview');
    ok(shown && shown.graphite.every((v, i) => v < shown.paper[i] - 30) && shown.shape.every((v, i) => Math.abs(v - [40, 90, 200][i]) <= 1), `the render holds paper, graphite and paint (${JSON.stringify(shown)})`);
  }

  console.log('browser sandbox');
  {
    const r = await tab.evaluate(async () => {
      const { runPageSource, loadModules } = await import('/sandbox-browser.js');
      const modules = await loadModules(['/mark-engine.js']);
      const loop = `import { OP } from './mark-engine.js';
export default { title: 'walk', note: 'a bar that walks', page: { w: 120, h: 80 }, paper: 'cream', motion: { frames: 4, fps: 6, poster: 2 },
  frame: (i) => [OP('s', [[10 + i * 25, 10], [10 + i * 25, 70]], 'line', 'brush', 3)] };`;
      const got = await runPageSource(loop, { modules });
      const still = await runPageSource(`export default { title: 'g', note: 'n', paper: { colour: 'white', tooth: 0.6 }, build: () => [{ k: 'm', tool: 'graphite-2b', samples: [{ x: 1, y: 1, p: 0.5, t: 0 }, { x: 40, y: 9, p: 0.5, t: 200 }] }, { k: 's', pts: [[0, 0], [9, 9]], layer: 'line', brush: 'liner' }] };`, { modules });
      return { motion: got.meta.motion, breaks: got.ops.filter((o) => o.k === 'frame').length, surface: got.meta.surface, still: still.meta.surface, kinds: still.ops.map((o) => o.k) };
    });
    ok(same(r.motion, { frames: 4, fps: 6, poster: 2 }) && r.breaks === 3, `a motion page runs in the browser sandbox and comes back with its motion (${JSON.stringify(r.motion)}, ${r.breaks} breaks)`);
    ok(same(r.surface, { kind: 'ink', version: 2, paper: '#f3eee2' }) && same(r.still, { kind: 'ink', version: 2, paper: '#f6f6f3', tooth: 0.6, seed: 17 }) && same(r.kinds, ['m', 's']), 'paper crosses the browser sandbox as it does the book');
  }

  ok(errors.length === 0, `no page errors${errors.length ? ': ' + errors[0] : ''}`);
} finally {
  await browser.close();
  server.close();
  await rm(fixtures, { recursive: true, force: true });
  await rm(scratch, { recursive: true, force: true });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
