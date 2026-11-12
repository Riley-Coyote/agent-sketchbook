/* examples/host-seam/host-check.mjs — a host drawing a snapshot's marks.
 *
 * host.html is given a snapshot's { page, paper, motion, marks } and nothing
 * else, and draws them with the book's <sketch-page>. The server here answers
 * only for the host page, that element and the engine it imports; every
 * other request is refused and recorded. The host's picture is compared with
 * the poster, pixel by pixel, in a headless browser that is closed before this
 * returns. run.mjs and tests/host-seam.mjs both use it.
 */

import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';

const HERE = 'examples/host-seam';

export async function hostDraws({ root, snap, poster }) {
  const marksFile = JSON.stringify({ drawingId: snap.drawingId, revision: snap.revision, page: snap.page, paper: snap.paper, ...(snap.motion ? { motion: snap.motion } : {}), marks: snap.marks });
  const allowed = new Set([`/${HERE}/host.html`, '/sketch-page.js', '/mark-engine.js', '/material-engine.js', '/validate.js']);
  const requests = [], refused = [];
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    requests.push(path);
    const send = (type, body) => { res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' }); res.end(body); };
    if (path === `/${HERE}/marks.json`) return send('application/json', marksFile);
    if (path === '/__poster.png') return send('image/png', poster);
    if (allowed.has(path) || /^\/fonts\/[a-z0-9-]+\.woff2?$/.test(path)) {
      return send(path.endsWith('.html') ? 'text/html' : path.startsWith('/fonts/') ? 'font/woff' : 'text/javascript', await readFile(join(root, path)));
    }
    refused.push(path);
    res.writeHead(404); res.end();
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  let compare;
  const { chromium } = await import('playwright-core');
  let browser;
  try {
    browser = await chromium.launch();
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
    await browser?.close();
    server.close();
  }
  const sourceRequested = requests.filter((p) => /pass-\d\.js$|\/pages\/|\/book|sandbox|book\.mjs/.test(p));
  return { compare, requests: [...new Set(requests)], refused, sourceRequested };
}
