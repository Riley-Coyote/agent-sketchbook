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
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { canonicalJSON, marksHash } from '../host-seam.mjs';

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

try {
  console.log('the example');
  {
    const { stdout } = await run(process.execPath, [join(ROOT, 'examples/host-seam/run.mjs'), '--json'], { cwd: ROOT, maxBuffer: 1 << 26 });
    const r = JSON.parse(stdout.trim().split('\n').pop());
    ok(r.firstNotice.revision === 1 && r.secondNotice.revision === 2 && r.firstNotice.drawingId === r.secondNotice.drawingId, `two passes, one drawing: revision 1, then 2 (${r.secondNotice.drawingId})`);
    ok(Object.keys(r.secondNotice).sort().join() === 'drawingId,revision', 'a notice carries { drawingId, revision } and nothing more');
    ok(r.hostLastSeen === 2 && r.snapshotRevision === 2 && r.snapshotState === 'saved', 'a host that last saw 0 and missed revision 1 reads the snapshot and lands on 2');
    ok(r.reopenedRevision === 2, 'a reopened tab, with no notices at all, reads revision 2');
    ok(r.snapshotWroteNothing, 'reading the snapshot left every file in the book as it was');
    ok(r.sameReferenceOnRetry && r.pagesAfterRetry === 2, 'the same save again answers with the same reference and spends no page');
    ok(r.hashMatches, `the marks hash recomputed from the snapshot's marks alone matches (${r.recomputedHash.slice(0, 16)}…)`);
    ok(r.posterIsPng && r.reference.poster === 'pages/002.png', `the poster was written at save time (${r.posterSize.join(' × ')})`);
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
    const hostile = await host('write', 'tests/hostile-fetch.js', '--reference').catch((e) => e);
    ok(hostile.code === 1 && /sandbox: fetch is not defined/.test(hostile.stderr), 'a hostile module is still refused by the sandbox');
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
      await now('list'); await now('read', '2'); await now('journal', '2');
      ok(true, 'list, read and journal still read the old pages');

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
