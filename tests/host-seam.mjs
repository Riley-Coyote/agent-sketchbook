/* tests/host-seam.mjs — node tests/host-seam.mjs
 * The host seam (docs/host-seam.md): a drawing's stable id and revision, the
 * canonical marks hash, a snapshot that never writes, one immutable page
 * reference with its poster, a host that draws from marks alone, and pages
 * saved before any of this reading the same way. Self-contained: throwaway
 * books in a temp folder, plain test marks, the repository's own
 * playwright-core. Older pages come from the book tool at BASE, straight from
 * git, so they are stored exactly as that tool stored them.
 */

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { inflateSync } from 'node:zlib';
import { canonicalJSON, marksHash, posterScale } from '../host-seam.mjs';
import { sanitizeOps, sanitizePageDimensions, limitsForPage } from '../validate.js';
import { hostDraws } from '../examples/host-seam/host-check.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = '47c3e67';   // the book tool before the host seam
const TOLERANCE = 1;      // largest allowed difference, of 255, between a host's drawing and the poster
const run = promisify(execFile);
let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log(`  ok   ${name}`); } else { fail++; console.log(`  FAIL ${name}`); } };
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const tmp = await mkdtemp(join(tmpdir(), 'host-seam-test-'));

async function listing(dir, base = dir) {
  const out = {};
  for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) { out[path.slice(base.length + 1) + '/'] = 'dir'; Object.assign(out, await listing(path, base)); }
    else { const s = await stat(path); out[path.slice(base.length + 1)] = `${s.size} ${s.mtimeMs} ${sha(await readFile(path))}`; }
  }
  return out;
}
const tool = (book, root = ROOT) => async (...args) => run(process.execPath, [join(root, 'book.mjs'), ...args, '--book', book], { cwd: root, maxBuffer: 1 << 28 });
const index = async (book) => JSON.parse(await readFile(join(book, 'book.json'), 'utf8'));
const pageFile = async (book, n) => JSON.parse(await readFile(join(book, 'pages', `${String(n).padStart(3, '0')}.json`), 'utf8'));
/* PNG to RGBA, all five row filters (Chromium's encoder uses them). */
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

try {
  console.log('the example');
  {
    const { stdout } = await run(process.execPath, [join(ROOT, 'examples/host-seam/run.mjs'), '--json'], { cwd: ROOT, maxBuffer: 1 << 26 });
    const r = JSON.parse(stdout.trim().split('\n').pop());
    const L = r.live;
    ok(L.opened.revision === 0 && L.empty.state === 'drawing' && L.empty.marks === null && L.drawingId === L.opened.drawingId, `the live act: a sheet opens as a drawing, at revision 0, with no pass yet (${L.drawingId})`);
    ok(L.notices.map((n) => n.revision).join() === '1,2,3' && L.notices.every((n) => n.drawingId === L.drawingId) && L.noticeBetweenGestures.revision === 1, `three live passes are revisions 1, 2 and 3; gestures between checkpoints leave the notice as it was (${L.gestures} gestures in ${L.batches} batches moved the edit counter by ${L.editCounterMoved})`);
    ok(L.watcherSaw.revision === 2 && L.watcherLastSeen === 2 && L.snapshot.state === 'drawing' && L.snapshot.hashMatches && L.snapshotWroteNothing, 'a watcher that missed revision 1 reads the live snapshot and lands on revision 2, the sheet\'s marks, writing nothing');
    ok(L.page.drawingId === L.drawingId && L.page.revision === 4 && L.savedState === 'saved' && L.savedRevision === 4, 'the sheet saved as a page keeps its id, at revision 4, and reads "saved"');
    ok(r.firstNotice.revision === 1 && r.secondNotice.revision === 2 && r.firstNotice.drawingId === r.secondNotice.drawingId, `two passes, one drawing: revision 1, then 2 (${r.secondNotice.drawingId})`);
    ok(Object.keys(r.secondNotice).sort().join() === 'drawingId,revision', 'a notice carries { drawingId, revision } and nothing more');
    ok(r.hostLastSeen === 2 && r.snapshotRevision === 2 && r.snapshotState === 'saved', 'a host that last saw 0 and missed revision 1 reads the snapshot and lands on 2');
    ok(r.reopenedRevision === 2, 'a reopened tab, with no notices at all, reads revision 2');
    ok(r.snapshotWroteNothing, 'reading the snapshot left every file in the book as it was');
    ok(r.sameReferenceOnRetry && r.pagesAfterRetry === 3, 'the same save again answers with the same reference and spends no page (the book holds its 3 pages)');
    ok(r.hashMatches, `the marks hash recomputed from the snapshot's marks alone matches (${r.recomputedHash.slice(0, 16)}…)`);
    ok(r.posterIsPng && r.reference.poster === 'pages/003.png', `the poster was written at save time (${r.posterSize.join(' × ')})`);
    ok(r.host.sameSize && r.host.maxChannelDiff <= TOLERANCE, `the host's drawing from marks alone matches the poster: largest difference ${r.host.maxChannelDiff} of 255 (tolerance ${TOLERANCE}), ${r.host.differingPixels} of ${r.host.pixels} pixels differ`);
    ok(r.hostSourceRequests.length === 0 && r.hostRefused.length === 0 && r.host.errors.length === 0, `the host asked for no source and no book file: ${r.hostRequests.join(', ')}`);
    const hostPage = await readFile(join(ROOT, 'examples/host-seam/host.html'), 'utf8');
    ok(!/pass-\d|sandbox|book\.mjs|pages\/|import\(|\beval\b|new Function/.test(hostPage), 'the host page itself names no source, sandbox or book file');
  }

  console.log('drawing id and revision');
  const book = join(tmp, 'book');
  const cli = tool(book);
  {
    await cli('init', '--owner', 'host-seam-test');
    await cli('write', 'examples/host-seam/pass-2.js');
    let pages = (await index(book)).pages;
    ok(pages[0].revision === 1 && (await pageFile(book, 1)).journal.passes.length === 2 && pages[0].opCount === 4, 'one save of a module with two passes and four marks is one revision, not one per mark');
    await rm(book, { recursive: true });
    await cli('init', '--owner', 'host-seam-test');
    await cli('write', 'examples/host-seam/pass-1.js');
    await cli('write', 'examples/host-seam/pass-2.js', '--continue', '1');
    await cli('write', 'tests/host-seam/branch.js', '--branch', '1');
    await cli('write', 'examples/host-seam/pass-2.js', '--continue', '1');
    pages = (await index(book)).pages;
    const id = pages[0].drawingId;
    ok(typeof id === 'string' && pages[1].drawingId === id && pages[3].drawingId === id, `--continue keeps the drawing id (${id})`);
    ok(pages.map((p) => p.revision).join() === '1,2,1,3', `revisions go up by one per save of a drawing (${pages.map((p) => p.revision).join(', ')})`);
    ok(pages[2].drawingId !== id && pages[2].revision === 1, 'a branch is a new drawing, at revision 1');
    ok(JSON.stringify(pages[2].parentDrawing) === JSON.stringify({ drawingId: id, revision: 1, pageIndex: 1 }), 'and names the drawing, revision and page it branched from');
    const files = await Promise.all([1, 2, 3, 4].map((n) => pageFile(book, n)));
    ok(files.every((f, i) => f.drawingId === pages[i].drawingId && f.revision === pages[i].revision), 'the page files carry the same drawing fields as the index');
    const snap = JSON.parse((await cli('snapshot', '--drawing', id, '--json')).stdout);
    ok(snap.revision === 3 && snap.pageIndex === 4 && snap.poster === null, 'the snapshot is the drawing\'s latest revision; a save without --reference has no poster');
    const newest = JSON.parse((await cli('snapshot', '--json')).stdout);
    ok(newest.drawingId === id && newest.pageIndex === 4, 'with no drawing named, the snapshot is the newest page\'s drawing');
    const branch = JSON.parse((await cli('snapshot', '--drawing', pages[2].drawingId, '--json')).stdout);
    ok(branch.revision === 1 && JSON.stringify(branch.parent) === JSON.stringify(pages[2].parentDrawing), 'a branch\'s snapshot names its parent');
    const refsBook = join(tmp, 'refs');
    await tool(refsBook)('init', '--owner', 'host-seam-test');
    await tool(refsBook)('write', 'examples/host-seam/pass-1.js');
    await tool(refsBook)('write', 'examples/host-seam/pass-2.js', '--refs', '1');
    const withRefs = (await index(refsBook)).pages;
    ok(withRefs[1].drawingId !== withRefs[0].drawingId && withRefs[1].revision === 1 && withRefs[1].drawingId.endsWith(':2'), 'a page saved with --refs starts a new drawing of its own');
  }

  console.log('the marks hash');
  {
    const page = await pageFile(book, 2);
    const shuffled = page.ops.map((op) => Object.fromEntries(Object.entries(op).reverse()));
    ok(JSON.stringify(shuffled) !== JSON.stringify(page.ops) && marksHash(shuffled) === marksHash(page.ops), 'the same marks with their keys in another order give the same hash');
    ok(canonicalJSON({ b: 1, a: [1.5, -0, 'é\n'], c: { z: true, y: null } }) === '{"a":[1.5,0,"é\\n"],"b":1,"c":{"y":null,"z":true}}', 'the canonical form: sorted keys, no whitespace, numbers and strings as JSON writes them');
    ok(marksHash([{ k: 'p', ms: 1 }]) === sha('[{"k":"p","ms":1}]'), 'the hash is SHA-256 of the canonical form\'s UTF-8 bytes');
    const elsewhere = (await run(process.execPath, ['-e', `import('${join(ROOT, 'host-seam.mjs')}').then(m => console.log(m.marksHash(JSON.parse(process.argv[1]))))`, JSON.stringify(page.ops)])).stdout.trim();
    ok(elsewhere === marksHash(page.ops), 'another process, from the marks as JSON text, gets the same hash');
    const snap = JSON.parse((await cli('snapshot', '--drawing', page.drawingId, '--json')).stdout);
    ok(snap.marksHash === marksHash(page.ops) && JSON.stringify(snap.marks) === JSON.stringify((await pageFile(book, 4)).ops), 'the snapshot carries the stored marks, checked, and their hash');
    ok(page.journal.marksHash !== marksHash(page.ops), 'the journal\'s older hash (marks in stored order) is left as it was');
  }

  console.log('the snapshot reads only');
  {
    const before = await listing(book);
    const a = (await cli('snapshot', '--json')).stdout;
    const b = (await cli('snapshot', '--json')).stdout;
    const large = JSON.parse((await cli('snapshot', '--inline-max', '10', '--json')).stdout);
    await cli('snapshot');
    const refused = await cli('snapshot', '--protocol', 'sketchbook.drawing/2').catch((e) => e);
    const unknown = await cli('snapshot', '--drawing', 'nobody:9').catch((e) => e);
    const after = await listing(book);
    ok(JSON.stringify(Object.keys(before)) === JSON.stringify(Object.keys(after)), `the book's listing is the same after five reads (${Object.keys(after).length} entries)`);
    ok(JSON.stringify(before) === JSON.stringify(after), 'and every file has the same size, time and bytes');
    ok(a === b, 'reading twice gives the same answer');
    ok(large.marks === undefined && large.marksFile === 'pages/004.json' && large.marksField === 'ops' && large.marksBytes > 10, `large marks travel as a path with their size (${large.marksFile}, ${large.marksBytes} bytes)`);
    const viaPath = (await pageFile(book, 4))[large.marksField];
    ok(marksHash(viaPath) === large.marksHash, 'and the marks at that path have the snapshot\'s hash');
    ok(refused.code === 1 && /does not know "sketchbook.drawing\/2"/.test(refused.stderr), 'an unknown protocol is refused');
    ok(unknown.code === 1 && /no drawing "nobody:9"/.test(unknown.stderr), 'an unknown drawing is refused, naming the ones there are');
  }

  console.log('a save for a host');
  {
    const hostBook = join(tmp, 'host');
    const host = tool(hostBook);
    await host('init', '--owner', 'host-seam-test');
    await host('write', 'examples/host-seam/pass-1.js');
    const noPoster = await listing(hostBook);
    const started = Date.now();
    const ref = JSON.parse((await host('write', 'examples/host-seam/pass-2.js', '--continue', '1', '--reference')).stdout);
    const posterStat = await stat(join(hostBook, 'pages/002.png'));
    ok(!noPoster['pages/002.png'] && posterStat.mtimeMs >= started - 1000, 'the poster is written by the save itself');
    ok(Object.keys(ref).join() === 'protocol,bookId,drawingId,revision,pageIndex,marksHash,poster' && ref.protocol === 'sketchbook.page/1', 'the reference is { protocol, bookId, drawingId, revision, pageIndex, marksHash, poster }');
    const saved = await listing(hostBook);
    const again = await host('write', 'examples/host-seam/pass-2.js', '--continue', '1', '--reference');
    ok(again.stdout.trim() === JSON.stringify(ref) && /already holds this save/.test(again.stderr), 'the same save again: the same reference');
    const afterRetry = await listing(hostBook);
    ok(['pages/002.json', 'pages/002.png'].every((f) => saved[f] === afterRetry[f]) && (await index(hostBook)).pages.length === 2, 'and the saved page and its poster are untouched: same bytes, same time');
    await host('write', 'tests/host-seam/branch.js', '--branch', '1', '--reference');
    const later = await listing(hostBook);
    ok(['pages/001.json', 'pages/002.json', 'pages/002.png'].every((f) => saved[f] === later[f]), 'a later save leaves every earlier page and poster as it was');
    const snap = JSON.parse((await host('snapshot', '--drawing', ref.drawingId, '--json')).stdout);
    ok(JSON.stringify(snap.reference) === JSON.stringify(ref), 'the snapshot of that revision carries the identical reference');
    /* the retry rule: only a retry of the newest save is the same save */
    const older = await host('write', 'examples/host-seam/pass-2.js', '--continue', '1', '--reference');
    const olderRef = JSON.parse(older.stdout);
    ok(olderRef.pageIndex === 4 && olderRef.revision === 3 && JSON.stringify(olderRef) !== JSON.stringify(ref) && !/already holds/.test(older.stderr) && (await index(hostBook)).pages.length === 4, 'retrying an earlier save after a later one saves a new page (page 4, revision 3), not the earlier reference');
    /* a page saved whose poster could not be drawn: the same save again draws it */
    const noBrowser = { ...process.env, PLAYWRIGHT_BROWSERS_PATH: join(tmp, 'no-browsers') };
    await mkdir(noBrowser.PLAYWRIGHT_BROWSERS_PATH, { recursive: true });
    const cut = await run(process.execPath, [join(ROOT, 'book.mjs'), 'write', 'tests/host-seam/branch.js', '--branch', '1', '--reference', '--book', hostBook], { cwd: ROOT, env: noBrowser }).catch((e) => e);
    const cutPages = (await index(hostBook)).pages.length;
    ok(cut.code === 1 && /page 5 was saved, but its poster could not be drawn/.test(cut.stderr) && /Run the same save again/.test(cut.stderr) && cutPages === 5 && !existsSync(join(hostBook, 'pages/005.png')), 'a save whose poster cannot be drawn says the page was saved and how to get its poster');
    const mended = JSON.parse((await host('write', 'tests/host-seam/branch.js', '--branch', '1', '--reference')).stdout);
    ok(mended.pageIndex === 5 && mended.poster === 'pages/005.png' && existsSync(join(hostBook, 'pages/005.png')) && (await index(hostBook)).pages.length === 5, 'and the same save again draws it, saving nothing twice');
    const hostile = await host('write', 'tests/hostile-fetch.js', '--reference').catch((e) => e);
    ok(hostile.code === 1 && /sandbox: fetch is not defined/.test(hostile.stderr), 'a hostile module is still refused by the sandbox');
  }

  console.log('a flag with no value');
  {
    const bare = (...args) => run(process.execPath, [join(ROOT, 'book.mjs'), ...args], { cwd: ROOT, timeout: 20000 }).catch((e) => e);
    const flagBook = join(tmp, 'flags');
    await tool(flagBook)('init', '--owner', 'host-seam-test');
    const last = await bare('snapshot', '--json', '--book');
    ok(last.code === 1 && /--book needs a value/.test(last.stderr) && existsSync(join(ROOT, 'book', 'book.json')), '--book as the last argument is refused, though ./book is a book it could have fallen back to');
    const before = await bare('snapshot', '--book', '--json');
    ok(before.code === 1 && /--book needs a value/.test(before.stderr), '--book followed by another flag is refused');
    const drawing = await bare('snapshot', '--drawing', '--json', '--book', flagBook);
    ok(drawing.code === 1 && /--drawing needs a value/.test(drawing.stderr), 'so is --drawing, and every other value flag');
    const cont = await bare('write', 'examples/host-seam/pass-2.js', '--continue', '--reference', '--book', flagBook);
    ok(cont.code === 1 && /--continue needs a value/.test(cont.stderr) && (await index(flagBook)).pages.length === 0, 'write --continue with no page is refused, and saves nothing');
    const serve = await bare('serve', '--book', flagBook, '--port');
    ok(serve.code === 1 && /--port needs a value/.test(serve.stderr), 'serve --port with no value is refused, and starts nothing');
    const server = await run(process.execPath, [join(ROOT, 'studio-server.mjs'), '--port', '0', '--data', join(tmp, 'flag-live'), '--book'], { cwd: ROOT, timeout: 20000 }).catch((e) => e);
    ok(server.code === 1 && /Usage:/.test(server.stderr), 'the live server refuses --book with no value');
    const client = await bare('live', 'status', '--url');
    ok(client.code === 1 && /Unexpected argument: --url/.test(client.stderr), 'and so does the live client, for --url');
  }

  console.log('posters a host can line up with');
  {
    /* A page on the original canvas, stored by hand as the oldest pages were,
     * continued with --reference: its poster is on the book's dark ground,
     * exactly as render draws the page. */
    const canvasBook = join(tmp, 'canvas');
    const cli = tool(canvasBook);
    await cli('init', '--owner', 'host-seam-test');
    const built = JSON.parse((await run(process.execPath, ['--experimental-vm-modules', '--no-warnings', join(ROOT, 'sandbox.mjs'), join(ROOT, 'tests/host-seam/canvas.js')], { maxBuffer: 1 << 26 })).stdout.trim().split('\n').pop());
    const dims = sanitizePageDimensions(built.meta.page).page;
    const { ops } = sanitizeOps(built.ops, limitsForPage(dims, undefined));
    const indexFile = await index(canvasBook);
    const meta = { index: 1, file: 'pages/001.json', title: built.meta.title, date: built.meta.date, note: built.meta.note, refs: [], seed: 1, page: dims, module: 'tests/host-seam/canvas.js', opCount: ops.length, points: 0, state: 'drawn', stage: 'study' };
    await mkdir(join(canvasBook, 'pages'), { recursive: true });
    await writeFile(join(canvasBook, meta.file), JSON.stringify({ ...meta, source: await readFile(join(ROOT, meta.module), 'utf8'), ops }));
    await writeFile(join(canvasBook, 'book.json'), JSON.stringify({ ...indexFile, pages: [meta] }, null, 2) + '\n');
    const ref = JSON.parse((await cli('write', 'tests/host-seam/canvas-2.js', '--continue', '1', '--reference')).stdout);
    ok((await pageFile(canvasBook, 2)).surface === undefined && ref.poster === 'pages/002.png', 'an original-canvas page saved for a host has a poster');
    await cli('render', '2', '--out', join(tmp, 'canvas-render.png'), '--scale', String(posterScale(dims)));
    const poster = pixels(await readFile(join(canvasBook, ref.poster))), rendered = pixels(await readFile(join(tmp, 'canvas-render.png')));
    let max = 0, opaque = true;
    for (let i = 0; i < poster.data.length; i++) { max = Math.max(max, Math.abs(poster.data[i] - rendered.data[i])); if (i % 4 === 3 && poster.data[i] !== 255) opaque = false; }
    const corner = [...poster.data.subarray(0, 3)];
    ok(poster.width === rendered.width && poster.height === rendered.height && max === 0, `its poster is render's picture of the page at the poster's scale, pixel for pixel (${poster.width} × ${poster.height}, largest difference ${max})`);
    ok(opaque && corner.every((v) => v < 30), `on the book's dark ground: every pixel opaque, the corner ${corner.join(',')}`);

    /* A moving page: its poster is its poster frame, and a host drawing the
     * snapshot's marks with <sketch-page> lines up with it. */
    const moving = join(tmp, 'moving');
    const mv = tool(moving);
    await mv('init', '--owner', 'host-seam-test');
    const mref = JSON.parse((await mv('write', 'tests/host-seam/loop.js', '--reference')).stdout);
    const msnap = JSON.parse((await mv('snapshot', '--json')).stdout);
    ok(msnap.motion?.frames === 4 && msnap.motion.poster === 2 && mref.poster === 'pages/001.png', 'a moving page saved for a host has a poster, and its snapshot carries the loop');
    const drawn = await hostDraws({ root: ROOT, snap: msnap, poster: await readFile(join(moving, mref.poster)) });
    ok(drawn.compare.sameSize && drawn.compare.maxChannelDiff <= TOLERANCE && drawn.compare.errors.length === 0 && drawn.sourceRequested.length === 0, `a host drawing its marks alone lines up with the poster: largest difference ${drawn.compare.maxChannelDiff} of 255, ${drawn.compare.differingPixels} of ${drawn.compare.pixels} pixels differ`);
  }

  console.log('older pages');
  {
    /* The book tool at BASE, as it was, run from a folder inside this one so
     * it finds the same playwright-core. Its pages carry no drawing fields. */
    const old = join(ROOT, 'books', `host-seam-old-${process.pid}`);
    await mkdir(old, { recursive: true });
    try {
      const files = ['book.mjs', 'page-program.js', 'validate.js', 'sandbox.mjs', 'mark-engine.js', 'material-engine.js', 'motion-out.js'];
      for (const f of files) await writeFile(join(old, f), (await run('git', ['show', `${BASE}:${f}`], { cwd: ROOT, maxBuffer: 1 << 26 })).stdout);
      await cp(join(ROOT, 'fonts'), join(old, 'fonts'), { recursive: true });
      await cp(join(ROOT, 'examples/host-seam'), join(old, 'examples/host-seam'), { recursive: true });
      await cp(join(ROOT, 'tests/host-seam'), join(old, 'tests/host-seam'), { recursive: true });
      const oldBook = join(tmp, 'old');
      const before = tool(oldBook, old);
      await before('init', '--owner', 'host-seam-test');
      await before('write', 'examples/host-seam/pass-1.js');
      await before('write', 'examples/host-seam/pass-2.js', '--continue', '1');
      await before('write', 'tests/host-seam/branch.js', '--branch', '1');
      const stored = (await index(oldBook)).pages;
      ok(stored.every((p) => p.drawingId === undefined && p.revision === undefined), 'the old tool stored pages with no drawing fields');
      const now = tool(oldBook);
      const listed = await listing(oldBook);
      const one = JSON.parse((await now('snapshot', '--drawing', `${(await index(oldBook)).id}:1`, '--json')).stdout);
      const two = JSON.parse((await now('snapshot', '--json')).stdout);
      ok(one.revision === 2 && one.pageIndex === 2 && one.drawingId.endsWith(':1'), 'an old continuation reads as revision 2 of the drawing it continues');
      ok(two.revision === 1 && two.drawingId.endsWith(':3') && JSON.stringify(two.parent) === JSON.stringify({ drawingId: one.drawingId, revision: 1, pageIndex: 1 }), 'an old branch reads as a new drawing naming its parent');
      ok(one.marksHash === marksHash((await pageFile(oldBook, 2)).ops), 'and its marks hash is the hash of the stored marks');
      ok(JSON.stringify(await listing(oldBook)) === JSON.stringify(listed), 'reading the old book wrote nothing to it');
      await now('write', 'examples/host-seam/pass-2.js', '--continue', '2');
      const added = (await index(oldBook)).pages.at(-1);
      ok(added.drawingId === one.drawingId && added.revision === 3, 'a new save continuing an old page joins its drawing at the next revision');
      const beforeReads = await listing(oldBook);
      const reads = [await now('list'), await now('read', '2'), await now('journal', '2')];
      ok(/4 of 48/.test(reads[0].stdout) && /"title"/.test(reads[1].stdout) && /"journal"/.test(reads[2].stdout), 'list, read and journal still read the old pages');
      ok(JSON.stringify(await listing(oldBook)) === JSON.stringify(beforeReads), 'and write nothing to the book');

      /* Existing pages render as they did: the same page, rendered by the
       * old tool and by this one, byte for byte. */
      for (const n of ['1', '2', '3']) {
        await before('render', n, '--out', join(tmp, `old-${n}.png`), '--scale', '1');
        await now('render', n, '--out', join(tmp, `new-${n}.png`), '--scale', '1');
      }
      const same = await Promise.all(['1', '2', '3'].map(async (n) => sha(await readFile(join(tmp, `old-${n}.png`))) === sha(await readFile(join(tmp, `new-${n}.png`)))));
      ok(same.every(Boolean), 'pages 1–3 render byte-identical with the old tool and this one');
    } finally {
      await rm(old, { recursive: true, force: true });
    }
  }
} finally {
  await rm(tmp, { recursive: true, force: true });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
