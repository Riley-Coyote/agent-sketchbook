/* tests/canvas-v2.mjs — node tests/canvas-v2.mjs
 * The second canvas (surface: { kind: 'ink', version: 2 }) and the promise
 * that came with it: pages that don't ask for it render exactly as before.
 * Self-contained: serves this folder itself and drives headless Chromium via
 * the repository's own playwright-core.
 *
 * Legacy parity compares against the engine at the checkpoint tag taken
 * before the overhaul, rendered in the same browser, so it holds on any
 * machine rather than against pixel hashes from one Chromium build.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TAG = 'sketchbook-before-overhaul-2026-09-22';
let pass = 0, fail = 0;
const ok = (c, name) => { if (c) { pass++; console.log(`  ok   ${name}`); } else { fail++; console.log(`  FAIL ${name}`); } };

/* The pre-overhaul engine, straight from git, served under /legacy/. */
const legacy = {};
try {
  for (const f of ['mark-engine.js', 'material-engine.js']) {
    legacy[f] = execFileSync('git', ['show', `${TAG}:${f}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 });
  }
} catch {
  console.log(`  skip legacy parity: tag ${TAG} is not in this clone`);
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.woff': 'font/woff' };
const server = createServer(async (req, res) => {
  const path = decodeURIComponent((req.url || '/').split('?')[0]);
  if (path === '/__blank.html') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<!doctype html><meta charset="utf-8"><body>'); }
  const old = path.match(/^\/legacy\/(mark-engine|material-engine)\.js$/);
  if (old && legacy[`${old[1]}.js`]) { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(legacy[`${old[1]}.js`]); }
  const file = resolve(ROOT, '.' + path);
  if (relative(ROOT, file).startsWith('..') || !existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
  res.end(await readFile(file));
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${server.address().port}`;

const { chromium } = await import('playwright-core');
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`${base}/__blank.html`);

try {
  if (legacy['mark-engine.js']) {
    console.log('legacy parity');
    for (const name of ['first-contact', 'codex-rain', 'moth', 'study']) {
      if (!existsSync(resolve(ROOT, 'pages', `${name}.js`))) continue;
      const same = await page.evaluate(async ({ name }) => {
        const [now, then, mod] = await Promise.all([
          import('/mark-engine.js'), import('/legacy/mark-engine.js'), import(`/pages/${name}.js`),
        ]);
        const page = mod.default;
        const { w, h } = page.page || { w: 880, h: 660 };
        const draw = (Engine) => {
          const e = new Engine({ width: w, height: h, dpr: 1 });
          e.load(page.build()).finish();
          const c = document.createElement('canvas'); c.width = w; c.height = h;
          e.composite(c.getContext('2d'));
          return c.getContext('2d').getImageData(0, 0, w, h).data;
        };
        const a = draw(now.MarkEngine), b = draw(then.MarkEngine);
        let diff = 0;
        for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff++;
        return diff;
      }, { name });
      ok(same === 0, `${name}.js renders byte-identical to the pre-overhaul engine (${same} differing bytes)`);
    }
  }

  console.log('second canvas');
  const r = await page.evaluate(async () => {
    const { MarkEngine, OP, paperIsLight, INK_DARK } = await import('/mark-engine.js');
    const W = 160, H = 60;
    const flat = (e) => { const c = document.createElement('canvas'); c.width = e.w * e.dpr; c.height = e.h * e.dpr; e.composite(c.getContext('2d')); return c.getContext('2d'); };
    const band = (brush, c, alpha, w = 5) => Array.from({ length: 6 }, (_, i) => OP('s', [[-40, 8 + i * 9], [W + 40, 8 + i * 9]], 'tone', brush, w, c, alpha));
    const out = {};

    // Translucent colour lands on the colour asked for.
    for (const [key, surface] of [['v1', undefined], ['v2', { kind: 'ink', version: 2, paper: '#000000' }]]) {
      const e = new MarkEngine({ width: W, height: H, dpr: 1, surface });
      e.load(band('wash', [86, 118, 160], 1, 6)).finish();
      out[key] = Array.from(flat(e).getImageData(80, 30, 1, 1).data.slice(0, 3));
      out[`${key}float`] = e.float;
    }

    // A thin eraser line through a painted field marks every column along its
    // length. On the old canvas, stamps smaller than their spacing leave
    // gaps; at this weight they nearly vanish altogether.
    for (const [key, surface] of [['thinV1', undefined], ['thinV2', { kind: 'ink', version: 2, paper: '#000000' }]]) {
      const e = new MarkEngine({ width: W, height: H, dpr: 2, surface });
      e.load([...band('brush', [200, 200, 200], 1, 6), OP('s', [[10, 30.3], [150, 30.3]], 'tone', 'eraser', 0.2)]).finish();
      const d = flat(e).getImageData(0, 0, W * 2, H * 2).data;
      const mins = [];
      for (let x = 60; x < 240; x++) {
        let min = 255;
        for (let y = 54; y <= 68; y++) min = Math.min(min, d[(y * W * 2 + x) * 4]);
        mins.push(min);
      }
      // The field is 200. A gap is a column the line leaves near 200.
      out[key] = { darkest: Math.min(...mins), lightest: Math.max(...mins) };
    }

    // Replay in uneven chunks ends on exactly the finished drawing.
    {
      const ops = [...band('glaze', [180, 90, 60], 0.6), OP('s', [[5, 5], [150, 50]], 'line', 'pencil', 1), OP('s', [[5, 50], [150, 5]], 'tone', 'eraser', 0.3)];
      const surface = { kind: 'ink', version: 2, paper: 'cream' };
      const a = new MarkEngine({ width: W, height: H, dpr: 1, surface }); a.load(ops).finish();
      const b = new MarkEngine({ width: W, height: H, dpr: 1, surface }); b.load(ops).replay();
      let steps = 0; while (b.tick(0.013 + (steps % 7) * 0.011, 3) && steps < 100000) steps++;
      const pa = flat(a).getImageData(0, 0, W, H).data, pb = flat(b).getImageData(0, 0, W, H).data;
      let diff = 0; for (let i = 0; i < pa.length; i++) if (pa[i] !== pb[i]) diff++;
      out.replayDiff = diff; out.replaySteps = steps;
    }

    // Paper belongs to the page; ink turns dark on light paper.
    {
      const e = new MarkEngine({ width: W, height: H, dpr: 1, surface: { kind: 'ink', version: 2, paper: 'cream' } });
      e.load([]).finish();
      out.paper = Array.from(flat(e).getImageData(3, 3, 1, 1).data.slice(0, 3));
      out.darkInk = JSON.stringify(e.ink) === JSON.stringify(INK_DARK) && paperIsLight('cream') && !paperIsLight('night');
    }
    return out;
  });

  const near = (a, b, tol) => a.every((v, i) => Math.abs(v - b[i]) <= tol);
  ok(r.v2float, 'layers accumulate in half-float in this browser');
  ok(near(r.v2, [86, 118, 160], 3), `stacked wash lands on its colour (${r.v2}; the old canvas gave ${r.v1})`);
  ok(!near(r.v1, [86, 118, 160], 3), 'the old canvas still drifts (it is untouched, for legacy pages)');
  ok(r.thinV2.lightest < 170 && r.thinV2.darkest < 140, `a thin eraser line marks every column, no gaps (columns ${r.thinV2.darkest}–${r.thinV2.lightest} on a field of 200)`);
  ok(r.thinV1.darkest > 180, `the old canvas still loses it (its darkest column is ${r.thinV1.darkest}; untouched, for legacy pages)`);
  ok(r.replayDiff === 0, `replay in ${r.replaySteps} uneven steps ends on the finished drawing (${r.replayDiff} differing bytes)`);
  ok(near(r.paper, [243, 238, 226], 1), `cream paper is painted under the page (${r.paper})`);
  ok(r.darkInk, 'default ink is dark on light paper and light on night');

  console.log('glyphs and shapes');
  const g = await page.evaluate(async () => {
    const { MarkEngine, GLYPHS, GRID, ALONG, SHAPE, OP, loadFonts } = await import('/mark-engine.js');
    await loadFonts();
    const surface = { kind: 'ink', version: 2, paper: '#ffffff' };
    const draw = async (ops, w = 200, h = 80, dpr = 1) => {
      const e = new MarkEngine({ width: w, height: h, dpr, surface });
      e.load(ops); await e.ready(); e.finish();
      const c = document.createElement('canvas'); c.width = w * dpr; c.height = h * dpr;
      e.composite(c.getContext('2d'));
      return c.getContext('2d').getImageData(0, 0, w * dpr, h * dpr).data;
    };
    const inked = (d) => { let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 200) n++; return n; };
    const out = {};
    out.faces = document.fonts.check('16px SketchMono') && document.fonts.check('400 16px SketchSans');
    // A block grid is solid: no seam where cells meet, across columns or rows.
    const solid = await draw(GRID(['████████', '████████', '████████'], 20, 30, { size: 16 }));
    const px = (d, x, y, w = 200) => d[(y * w + x) * 4];
    const cw = 16 * 0.6, lh = 16 * 1.25, top = 30 - 0.8 * lh;
    const seams = [];
    for (let c = 1; c < 8; c++) seams.push(px(solid, Math.round(20 + c * cw), Math.round(top + lh * 1.5)));
    for (let r = 1; r < 3; r++) seams.push(px(solid, Math.round(20 + cw * 3.5), Math.round(top + r * lh)));
    out.seams = Math.max(...seams);
    out.solid = px(solid, Math.round(20 + cw * 3.5), Math.round(top + lh * 1.5));
    // At half alpha an overlap would show as a darker line and a gap as a lighter one.
    const half = await draw(GRID(['████████', '████████', '████████'], 20, 30, { size: 16, alpha: 0.5 }));
    const halfSeams = [];
    for (let c = 1; c < 8; c++) halfSeams.push(px(half, Math.round(20 + c * cw), Math.round(top + lh * 1.5)));
    for (let r = 1; r < 3; r++) halfSeams.push(px(half, Math.round(20 + cw * 3.5), Math.round(top + r * lh)));
    out.halfSolid = px(half, Math.round(20 + cw * 3.5), Math.round(top + lh * 1.5));
    out.halfSeams = Math.max(...halfSeams.map((v) => Math.abs(v - out.halfSolid))) + out.halfSolid;
    // Braille is drawn as dots: the blank pattern draws nothing, the full one does.
    out.brailleBlank = inked(await draw([GLYPHS('⠀⠀⠀', 20, 40, { size: 24 })]));
    out.brailleFull = inked(await draw([GLYPHS('⣿⣿⣿', 20, 40, { size: 24 })]));
    // Glyphs set in the bundled face, and text on a path is laid along it.
    out.text = inked(await draw([GLYPHS('mark', 10, 50, { font: 'sans', size: 40 })]));
    out.along = inked(await draw([ALONG('along', [[10, 60], [190, 20]], { size: 18 })]));
    // Erased text lifts pigment out of what is beneath it.
    const field = SHAPE([[0, 0], [200, 0], [200, 80], [0, 80]], [20, 20, 20]);
    out.fieldInk = inked(await draw([field]));
    out.cutInk = inked(await draw([field, GLYPHS('HOLE', 10, 60, { font: 'sans', size: 50, weight: 800, layer: 'tone', erase: true })]));
    // Grain knocks pores out of a shape, the same way every time.
    const grainy = [SHAPE([[0, 0], [200, 0], [200, 80], [0, 80]], [20, 20, 20], { grain: 0.8 })];
    const a = await draw(grainy), b = await draw(grainy);
    let same = true; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) { same = false; break; }
    out.grainPores = 200 * 80 - inked(a);
    out.grainSame = same;
    // Replay types glyphs one by one and ends on the finished page.
    const ops = [field, ...GRID(['a⣿█▚', '╭──╮'], 10, 30, { size: 14, c: [240, 240, 240] }), ALONG('path', [[10, 70], [150, 50]], { font: 'sans', size: 16, c: [200, 60, 40] }), OP('s', [[5, 5], [190, 75]], 'line', 'pencil', 1)];
    const f = new MarkEngine({ width: 200, height: 80, dpr: 1, surface }); f.load(ops); await f.ready(); f.finish();
    const r = new MarkEngine({ width: 200, height: 80, dpr: 1, surface }); r.load(ops); await r.ready(); r.replay();
    let steps = 0; while (r.tick(0.009 + (steps % 5) * 0.007, 2) && steps < 100000) steps++;
    const flatten = (e) => { const c = document.createElement('canvas'); c.width = 200; c.height = 80; e.composite(c.getContext('2d')); return c.getContext('2d').getImageData(0, 0, 200, 80).data; };
    const fa = flatten(f), fb = flatten(r);
    let diff = 0; for (let i = 0; i < fa.length; i++) if (fa[i] !== fb[i]) diff++;
    out.replayDiff = diff;
    return out;
  });
  ok(g.faces, 'the bundled mono and sans faces load');
  ok(g.seams <= g.solid + 2, `a block grid has no seams between cells or rows (seam ${g.seams}, solid ${g.solid})`);
  ok(g.halfSeams <= g.halfSolid + 2, `a half-alpha block grid neither gaps nor darkens at joins (seam ${g.halfSeams}, solid ${g.halfSolid})`);
  ok(g.brailleBlank === 0 && g.brailleFull > 80, `braille is drawn as dots (blank pattern ${g.brailleBlank} px, full ${g.brailleFull} px)`);
  ok(g.text > 150 && g.along > 60, `glyphs render, on a baseline and along a path (${g.text}, ${g.along} px)`);
  ok(g.fieldInk === 16000 && g.cutInk < 15000, `erased text lifts the pigment beneath (${16000 - g.cutInk} px cut)`);
  ok(g.grainPores > 400 && g.grainPores < 9000 && g.grainSame, `grain knocks pores out of a shape, deterministically (${g.grainPores} px)`);
  ok(g.replayDiff === 0, `replay types the glyphs and ends on the finished page (${g.replayDiff} differing bytes)`);

  console.log('motion');
  const mo = await page.evaluate(async () => {
    const { MarkEngine, GLYPHS, OP } = await import('/mark-engine.js');
    const { compilePage } = await import('/page-program.js');
    const surface = { kind: 'ink', version: 2, paper: '#000000' };
    const loop = { title: 'loop', date: '2026-09-22', note: 'x', page: { w: 120, h: 60 }, surface, motion: { frames: 6, fps: 8 },
      frame: (i, n) => [OP('s', [[10 + i * 15, 10], [10 + i * 15, 50]], 'line', 'brush', 2), GLYPHS(String(i), 100, 30, { size: 14 })] };
    const { ops, meta } = compilePage(loop);
    const out = { breaks: ops.filter((o) => o.k === 'frame').length, meta: meta.motion };
    const e = new MarkEngine({ width: 120, height: 60, dpr: 1, surface });
    e.load(ops); await e.ready();
    out.count = e.frameCount;
    const grab = () => { const c = document.createElement('canvas'); c.width = 120; c.height = 60; e.composite(c.getContext('2d')); return c.toDataURL(); };
    e.finish(); const still = grab();
    e.drawFrame(0); const f0 = grab();
    e.drawFrame(3); const f3 = grab();
    out.stillIsFirst = still === f0;
    out.framesDiffer = f0 !== f3;
    out.pictures = e.motionFrames().length;
    e.drawFrame(0); out.leftOnFirst = grab() === f0;
    const errs = [];
    for (const bad of [{ ...loop, frame: undefined }, { ...loop, motion: { frames: 1 } }, { ...loop, motion: { frames: 97 } }, { ...loop, motion: { frames: 6, fps: 60 } }, { ...loop, passes: [] }]) {
      try { compilePage(bad); errs.push('accepted'); } catch (err) { errs.push(err.message); }
    }
    out.refused = errs.filter((m) => m !== 'accepted').length;
    return out;
  });
  ok(mo.breaks === 5 && mo.meta.frames === 6 && mo.meta.fps === 8, 'frame(i, n) compiles to one list of marks with frame breaks');
  ok(mo.count === 6, 'the engine splits the frames');
  ok(mo.stillIsFirst && mo.framesDiffer, 'finish() shows the first frame, and frames differ');
  ok(mo.pictures === 6 && mo.leftOnFirst, 'every frame flattens once for looping, leaving the first frame showing');
  ok(mo.refused === 5, 'a motion page needs frame(), 2..96 frames, fps 1..30, and no passes');

  const { sanitizeSurface, sanitizeOps, limitsForPage } = await import('../validate.js');
  console.log('validation');
  ok(sanitizeSurface({ kind: 'ink', version: 2, paper: 'cream' }).surface?.paper === '#f3eee2', 'a named paper resolves to its colour');
  ok(sanitizeSurface({ kind: 'ink', version: 2 }).surface?.paper === 'night', 'paper defaults to night');
  ok(sanitizeSurface({ kind: 'ink', version: 2, paper: 'teal' }).surface === null, 'an unknown paper is refused');
  ok(sanitizeSurface({ kind: 'ink', version: 3 }).surface === null, 'an unknown version is refused');
  ok(sanitizeSurface({ version: 1, paper: 'white', tooth: 0.5, seed: 1 }).surface?.paper === 'white', 'the graphite studio surface is unchanged');
  const inkLimits = limitsForPage({ w: 400, h: 300 }, { kind: 'ink', version: 2 });
  ok(sanitizeOps([{ k: 's', pts: [[0, 0], [10, 10]], layer: 'line', brush: 'liner' }], inkLimits).ops?.length === 1, 'ink pages take ordinary marks');
  ok(sanitizeOps([{ k: 'clean', tool: 'stump' }], inkLimits).ops === null, 'ink pages refuse material gestures');
  const legacyLimits = limitsForPage({ w: 400, h: 300 });
  ok(sanitizeOps([{ k: 't', text: 'hi', x: 10, y: 10 }], legacyLimits).ops === null, 'glyphs are refused on pages without the second canvas');
  ok(sanitizeOps([{ k: 't', text: 'hi', x: 10, y: 10, font: 'serif' }], inkLimits).ops === null, 'an unbundled face is refused');
  ok(sanitizeOps([{ k: 't', text: 'x'.repeat(4001), x: 10, y: 10 }], inkLimits).ops === null, 'text over 4000 characters is refused');
  ok(sanitizeOps([{ k: 't', text: 'a\u0007b', x: 10, y: 10 }], inkLimits).ops === null, 'control characters are refused');
  ok(sanitizeOps([{ k: 'f', poly: [[0, 0], [10, 0], [10, 10]], grain: 2 }], inkLimits).ops === null, 'grain outside 0..1 is refused');
  const t = sanitizeOps([{ k: 't', text: 'line one\nline two', pts: [[0, 0], [50, 50]], size: 12, font: 'sans', weight: 300, rot: 0.1, erase: true, junk: 1 }], inkLimits).ops;
  ok(t && t[0].pts && t[0].weight === 300 && t[0].erase === true && !('junk' in t[0]), 'glyph marks keep only the fields the engine reads');
  const { sanitizeMotion, countFrames } = await import('../validate.js');
  ok(sanitizeOps([{ k: 'frame' }], legacyLimits).ops === null, 'frames are refused without the second canvas');
  ok(sanitizeOps(Array.from({ length: 97 }, () => ({ k: 'frame' })), inkLimits).ops === null, 'more than 96 frames is refused');
  ok(countFrames([{ k: 'p', ms: 1 }, { k: 'frame' }, { k: 'frame' }]) === 3, 'frames are counted from their breaks');
  ok(sanitizeMotion({ frames: 96, fps: 12 }, { w: 1000, h: 1000 }).motion === null, 'motion is bounded by frames × page area');
  ok(sanitizeMotion({ frames: 24, fps: 12 }, { w: 400, h: 300 }).motion?.fps === 12, 'ordinary motion is accepted');

  console.log('motion in the book');
  {
    const { mkdtemp, writeFile: write, readFile: read, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const run = (args) => execFileSync(process.execPath, ['book.mjs', ...args], { cwd: ROOT, encoding: 'utf8' });
    const module = join(ROOT, 'pages', `_motion-test-${process.pid}.js`);
    const dir = await mkdtemp(join(tmpdir(), 'sketch-motion-'));
    await write(module, `import { OP } from '../mark-engine.js';
export default { title: 'test loop', date: '2026-09-22', note: 'a bar that walks', page: { w: 160, h: 90 },
  surface: { kind: 'ink', version: 2, paper: 'cream' }, motion: { frames: 4, fps: 6 },
  frame: (i) => [OP('s', [[20 + i * 30, 20], [20 + i * 30, 70]], 'line', 'brush', 3)] };
`);
    try {
      const preview = run(['preview', module, '--out', join(dir, 'sheet.png'), '--sheet']);
      ok(/all 4 frames/.test(preview) && /Nothing was saved/.test(preview), 'preview renders a contact sheet and saves nothing');
      run(['init', '--owner', 'Test', '--book', join(dir, 'book')]);
      run(['write', module, '--book', join(dir, 'book')]);
      const saved = JSON.parse(await read(join(dir, 'book', 'pages', '001.json'), 'utf8'));
      ok(saved.motion?.frames === 4 && saved.motion?.fps === 6 && saved.ops.filter((o) => o.k === 'frame').length === 3, 'write keeps the motion and its frame breaks');
      const render = run(['render', '1', '--book', join(dir, 'book'), '--out', join(dir, 'f2.png'), '--frame', '2', '--scale', '1']);
      ok(/frame 2 of 4/.test(render), 'render draws a chosen frame of a saved motion page');
      const sheet = await read(join(dir, 'sheet.png'));
      ok(sheet.length > 2000 && sheet.readUInt32BE(16) > 160 * 0.5 * 2, `the contact sheet holds the frames side by side (${sheet.readUInt32BE(16)} px wide)`);
    } finally {
      await rm(module, { force: true });
      await rm(dir, { recursive: true, force: true });
    }
  }
  ok(errors.length === 0, `no page errors${errors.length ? ': ' + errors[0] : ''}`);
} finally {
  await browser.close();
  server.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
