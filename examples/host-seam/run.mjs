#!/usr/bin/env node
/* examples/host-seam/run.mjs — node examples/host-seam/run.mjs [--json] [--keep]
 *
 * The host seam end to end, with a throwaway book in a temp folder and plain
 * test marks (pass-1.js, pass-2.js). Nothing leaves this machine: the browser
 * that draws the poster and the host page talks only to 127.0.0.1.
 *
 *   1. pass 1 is saved: revision 1. A host that last saw revision 0 misses
 *      that notice.
 *   2. pass 2 is saved for the host (--continue 1 --reference): revision 2,
 *      one page reference, a poster. The host gets this notice, re-reads the
 *      snapshot and lands on revision 2. Missing revision 1 cost nothing.
 *   3. The same save again answers with the same reference; no page is spent.
 *   4. The marks hash is recomputed here, from the snapshot's marks alone.
 *   5. A host page draws those marks with <sketch-page> and nothing else, and
 *      its picture is compared with the poster, pixel by pixel.
 *
 * --json prints one JSON summary at the end (tests/host-seam.mjs reads it);
 * --keep leaves the temp book in place.
 */

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const HERE = 'examples/host-seam';
const asJSON = process.argv.includes('--json'), keep = process.argv.includes('--keep');
const say = (line = '') => { if (!asJSON) console.log(line); };
const run = promisify(execFile);

const tmp = await mkdtemp(join(tmpdir(), 'host-seam-'));
const book = join(tmp, 'book');
const tool = async (...args) => (await run(process.execPath, [join(ROOT, 'book.mjs'), ...args, '--book', book], { cwd: ROOT, maxBuffer: 1 << 28 })).stdout.trim();

/* What a host watching the book sees when a pass completes: book.json is
 * replaced, and its newest entry names the drawing and its revision. */
const notice = async () => {
  const { drawingId, revision } = JSON.parse(await readFile(join(book, 'book.json'), 'utf8')).pages.at(-1);
  return { drawingId, revision };
};

/* Every file in the book, with its bytes' hash: to show a read changes nothing. */
async function listing(dir, base = dir) {
  const out = {};
  for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) Object.assign(out, await listing(path, base));
    else {
      const s = await stat(path);
      out[path.slice(base.length + 1)] = `${s.size}:${s.mtimeMs}:${createHash('sha256').update(await readFile(path)).digest('hex')}`;
    }
  }
  return out;
}

/* The canonical form, written again here from the doc, so the hash is
 * checked by something other than the code that made it. */
const canonical = (v) => Array.isArray(v) ? `[${v.map(canonical).join(',')}]`
  : v && typeof v === 'object' ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`
    : JSON.stringify(v);

const summary = {};
try {
  await tool('init', '--owner', 'host-seam-example');
  say(`a throwaway book at ${book}`);

  const host = { lastSeen: 0 };
  say(`\nthe host last saw revision ${host.lastSeen}`);

  await tool('write', `${HERE}/pass-1.js`);
  const first = await notice();
  say(`pass 1 saved: notice ${JSON.stringify(first)}  (the host misses this one)`);

  const saved = JSON.parse(await tool('write', `${HERE}/pass-2.js`, '--continue', '1', '--reference'));
  const second = await notice();
  say(`pass 2 saved for the host: notice ${JSON.stringify(second)}`);

  const before = await listing(book);
  const snap = JSON.parse(await tool('snapshot', '--drawing', second.drawingId, '--json'));
  const after = await listing(book);
  host.lastSeen = snap.revision;
  say(`the host re-reads the snapshot: revision ${snap.revision}, ${snap.state}, page ${snap.pageIndex}, ${snap.marks.length} marks (it never saw revision 1; nothing was lost)`);
  const reopened = JSON.parse(await tool('snapshot', '--json'));
  say(`a reopened tab, with no notices at all, reads revision ${reopened.revision} of ${reopened.drawingId}`);
  const unchanged = JSON.stringify(before) === JSON.stringify(after);
  say(`reading the snapshot changed ${unchanged ? 'nothing in the book (same files, same bytes)' : 'THE BOOK'}`);

  say(`\nthe page reference:\n  ${JSON.stringify(saved)}`);
  const again = JSON.parse(await tool('write', `${HERE}/pass-2.js`, '--continue', '1', '--reference'));
  const pages = JSON.parse(await readFile(join(book, 'book.json'), 'utf8')).pages.length;
  const sameReference = JSON.stringify(again) === JSON.stringify(saved);
  say(`the same save again: ${sameReference ? 'the same reference' : 'A DIFFERENT REFERENCE'}, and the book still holds ${pages} pages`);

  const recomputed = createHash('sha256').update(canonical(snap.marks), 'utf8').digest('hex');
  say(`marks hash, recomputed here from the snapshot's marks: ${recomputed} (${recomputed === saved.marksHash ? 'matches' : 'DOES NOT MATCH'} the reference)`);

  const posterPath = join(book, saved.poster);
  const png = await readFile(posterPath);
  const posterOk = png.subarray(1, 4).toString() === 'PNG';
  const posterSize = [png.readUInt32BE(16), png.readUInt32BE(20)];
  say(`the poster: ${saved.poster}, a ${posterSize.join(' × ')} PNG, ${png.length} bytes`);

  /* The host: a page that is given the marks and nothing else. The server
   * answers only for the host page, the book's element and the engine it
   * imports; every other request is refused and recorded. */
  const marksFile = JSON.stringify({ drawingId: snap.drawingId, revision: snap.revision, page: snap.page, paper: snap.paper, ...(snap.motion ? { motion: snap.motion } : {}), marks: snap.marks });
  const allowed = new Set([`/${HERE}/host.html`, '/sketch-page.js', '/mark-engine.js', '/material-engine.js', '/validate.js']);
  const requests = [], refused = [];
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    requests.push(path);
    const send = (type, body) => { res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' }); res.end(body); };
    if (path === `/${HERE}/marks.json`) return send('application/json', marksFile);
    if (path === '/__poster.png') return send('image/png', png);
    if (allowed.has(path) || /^\/fonts\/[a-z0-9-]+\.woff2?$/.test(path)) {
      return send(path.endsWith('.html') ? 'text/html' : path.startsWith('/fonts/') ? 'font/woff' : 'text/javascript', await readFile(join(ROOT, path)));
    }
    refused.push(path);
    res.writeHead(404); res.end();
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  let compare;
  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch();
  try {
    const tab = await browser.newPage({ viewport: { width: 800, height: 700 } });
    const errors = [];
    tab.on('pageerror', (e) => errors.push(String(e)));
    await tab.goto(`http://127.0.0.1:${server.address().port}/${HERE}/host.html?marks=marks.json`);
    await tab.evaluate(() => window.__drawn);
    compare = await tab.evaluate(async () => {
      const pixels = async (src) => {
        const image = new Image(); image.src = src; await image.decode();
        const c = document.createElement('canvas'); c.width = image.width; c.height = image.height;
        const ctx = c.getContext('2d'); ctx.drawImage(image, 0, 0);
        return { w: c.width, h: c.height, data: ctx.getImageData(0, 0, c.width, c.height).data };
      };
      const drawn = await pixels(document.getElementById('drawing').toDataURL());
      const poster = await pixels('/__poster.png');
      if (drawn.w !== poster.w || drawn.h !== poster.h) return { sameSize: false, drawn: [drawn.w, drawn.h], poster: [poster.w, poster.h] };
      let max = 0, differing = 0;
      for (let i = 0; i < drawn.data.length; i += 4) {
        let d = 0;
        for (let k = 0; k < 4; k++) d = Math.max(d, Math.abs(drawn.data[i + k] - poster.data[i + k]));
        if (d) differing++;
        if (d > max) max = d;
      }
      return { sameSize: true, size: [drawn.w, drawn.h], maxChannelDiff: max, differingPixels: differing, pixels: drawn.w * drawn.h };
    });
    compare.errors = errors;
  } finally {
    await browser.close();
    server.close();
  }
  const sourceRequested = requests.filter((p) => /pass-\d\.js$|\/pages\/|\/book|sandbox|book\.mjs/.test(p));
  say(`\nthe host drew the marks alone with <sketch-page>: ${compare.sameSize ? `${compare.size.join(' × ')} px, largest difference from the poster ${compare.maxChannelDiff} of 255 in any channel, ${compare.differingPixels} of ${compare.pixels} pixels differ at all` : `a different size from the poster (${compare.drawn} vs ${compare.poster})`}`);
  say(`what the host page asked for: ${[...new Set(requests)].join(', ')}`);
  say(`requests for the page's source or the book: ${sourceRequested.length ? sourceRequested.join(', ') : 'none'}`);

  Object.assign(summary, {
    book, firstNotice: first, secondNotice: second, reference: saved, snapshotRevision: snap.revision, snapshotState: snap.state,
    reopenedRevision: reopened.revision, hostLastSeen: host.lastSeen, snapshotWroteNothing: unchanged, sameReferenceOnRetry: sameReference,
    pagesAfterRetry: pages, recomputedHash: recomputed, hashMatches: recomputed === saved.marksHash, posterIsPng: posterOk, posterSize,
    host: compare, hostRequests: [...new Set(requests)], hostRefused: refused, hostSourceRequests: sourceRequested,
  });
} finally {
  if (!keep) await rm(tmp, { recursive: true, force: true });
  else say(`\n(kept ${tmp})`);
}
if (asJSON) console.log(JSON.stringify(summary));
