#!/usr/bin/env node
/* Render the Commons promo: every frame drawn by the sketchbook's engine in
 * a headless browser (render.html), then joined into a film by ffmpeg.
 *
 *   node promo/render.mjs                         the whole film → promo/out/commons.mp4
 *   node promo/render.mjs --scale 0.5             a half-size draft, quicker
 *   node promo/render.mjs --stills 1.2,9.4,20     single frames at those seconds, as PNGs
 *   node promo/render.mjs --from 8 --to 12        part of the film
 *   node promo/render.mjs --tabs 4                frames drawn in four tabs at once
 *   node promo/render.mjs --film the-wall         another film: promo/the-wall.js
 *   node promo/render.mjs --log                   show what the darkroom prints
 */
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const arg = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const scale = Number(arg('--scale') || 1);
const FILM = arg('--film') || 'scenes';
const OUT = resolve(process.cwd(), arg('--out') || resolve(ROOT, `promo/out/${FILM === 'scenes' ? 'commons' : FILM}.mp4`));
const MIME = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.woff': 'font/woff', '.woff2': 'font/woff2', '.png': 'image/png' };

const server = createServer(async (req, res) => {
  const file = resolve(ROOT, '.' + decodeURIComponent((req.url || '/').split('?')[0]));
  if (relative(ROOT, file).startsWith('..') || !existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
  res.end(await readFile(file));
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const url = `http://127.0.0.1:${server.address().port}/promo/render.html?scale=${scale}&film=${FILM}`;

let chromium;
for (const name of ['playwright-core', 'playwright']) { try { ({ chromium } = await import(name)); break; } catch { /* the next one */ } }
if (!chromium) throw new Error('rendering needs Playwright: npm install playwright');
const browser = await chromium.launch();
const open = async () => {
  const tab = await browser.newPage();
  const failures = [];
  tab.on('pageerror', (e) => failures.push(String(e)));
  if (args.includes('--log')) tab.on('console', (m) => console.log(`[darkroom] ${m.text()}`));
  await tab.goto(url);
  await tab.waitForFunction('window.__ready === true', null, { timeout: 60000 }).catch(() => { throw new Error(`the darkroom didn't open: ${failures[0] || 'no error given'}`); });
  return tab;
};
const grab = async (tab, f) => Buffer.from((await tab.evaluate((n) => window.renderFrame(n), f)).split(',')[1], 'base64');

try {
  const first = await open();
  const film = await first.evaluate(() => window.promo);
  if (arg('--stills')) {
    const dir = resolve(dirname(OUT), 'stills');
    await mkdir(dir, { recursive: true });
    for (const s of arg('--stills').split(',').map(Number)) {
      const f = Math.min(film.frames - 1, Math.round(s * film.fps));
      await writeFile(resolve(dir, `${s.toFixed(2)}s.png`), await grab(first, f));
      console.log(`${s.toFixed(2)} s → ${relative(process.cwd(), resolve(dir, `${s.toFixed(2)}s.png`))}`);
    }
  } else {
    const from = Math.round(Number(arg('--from') || 0) * film.fps);
    const to = Math.min(film.frames, arg('--to') ? Math.round(Number(arg('--to')) * film.fps) : film.frames);
    const dir = resolve(dirname(OUT), 'frames');
    await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });
    const tabs = [first, ...(await Promise.all(Array.from({ length: Math.max(0, Number(arg('--tabs') || 3) - 1) }, open)))];
    const per = Math.ceil((to - from) / tabs.length);
    const started = Date.now();
    let done = 0;
    await Promise.all(tabs.map(async (tab, k) => {
      for (let f = from + k * per; f < Math.min(to, from + (k + 1) * per); f++) {
        await writeFile(resolve(dir, `${String(f - from).padStart(5, '0')}.png`), await grab(tab, f));
        if (++done % 50 === 0) console.log(`${done} of ${to - from} frames, ${((Date.now() - started) / done).toFixed(0)} ms a frame`);
      }
    }));
    await promisify(execFile)('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(film.fps), '-i', resolve(dir, '%05d.png'),
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '14', '-preset', 'slow', '-movflags', '+faststart', OUT]);
    console.log(`${to - from} frames at ${film.fps} fps, ${((to - from) / film.fps).toFixed(2)} s → ${relative(process.cwd(), OUT)}`);
  }
} finally {
  await browser.close();
  server.close();
}
