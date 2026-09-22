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

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };
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
  ok(errors.length === 0, `no page errors${errors.length ? ': ' + errors[0] : ''}`);
} finally {
  await browser.close();
  server.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
