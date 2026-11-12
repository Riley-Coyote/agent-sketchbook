#!/usr/bin/env node
/* examples/host-seam/run.mjs — node examples/host-seam/run.mjs [--json] [--keep]
 *
 * The host seam end to end, with a throwaway book in a temp folder and plain
 * test marks (straight lines, pass-1.js, pass-2.js). Nothing leaves this
 * machine: the live server, the browser that draws the poster and the host
 * page all talk only to 127.0.0.1.
 *
 * The live act:
 *   1. A live sheet opens (book.mjs serve, then live new): it is a drawing
 *      already, at revision 0, with no completed pass.
 *   2. Two live passes, each a few gestures and a checkpoint (live save):
 *      revision 1, then 2. A watcher that last saw revision 0 misses the
 *      first notice, then reads the snapshot and lands on revision 2.
 *   3. The watcher leaves. A third pass completes: revision 3.
 *   4. The sheet is saved as a page (live page, then write --reference): the
 *      same drawing id, at revision 4.
 * The saved half:
 *   5. pass 1 is saved: revision 1 of a new drawing. A host that last saw
 *      revision 0 misses that notice.
 *   6. pass 2 is saved for the host (--continue --reference): revision 2,
 *      one page reference, a poster. The host re-reads the snapshot and lands
 *      on revision 2. Missing revision 1 cost nothing.
 *   7. The same save again answers with the same reference; no page is spent.
 *   8. The marks hash is recomputed here, from the snapshot's marks alone.
 *   9. A host page draws those marks with <sketch-page> and nothing else, and
 *      its picture is compared with the poster, pixel by pixel.
 *
 * --json prints one JSON summary at the end (tests/host-seam.mjs reads it);
 * --keep leaves the temp book in place.
 */

import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { hostDraws } from './host-check.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const HERE = 'examples/host-seam';
const asJSON = process.argv.includes('--json'), keep = process.argv.includes('--keep');
const say = (line = '') => { if (!asJSON) console.log(line); };
const run = promisify(execFile);

const tmp = await mkdtemp(join(tmpdir(), 'host-seam-'));
const book = join(tmp, 'book');
const node = async (...args) => (await run(process.execPath, args, { cwd: ROOT, maxBuffer: 1 << 28 })).stdout.trim();
const tool = (...args) => node(join(ROOT, 'book.mjs'), ...args, '--book', book);

/* What a host watching the book sees when a save completes: book.json is
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
const hashOf = (marks) => createHash('sha256').update(canonical(marks), 'utf8').digest('hex');

/* Test marks for a live sheet: straight graphite lines, one gesture each. */
const line = (x1, y1, x2, y2) => ({ type: 'stroke', samples: [{ x: x1, y: y1, p: 0.5, t: 0 }, { x: x2, y: y2, p: 0.6, t: 500 }] });

const summary = {};
let server, liveDir;
try {
  await tool('init', '--owner', 'host-seam-example');
  say(`a throwaway book at ${book}`);

  /* ------------------------------------------------------------ the live act */
  say('\nthe live act');
  server = spawn(process.execPath, [join(ROOT, 'book.mjs'), 'serve', '--port', '0', '--book', book], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  const url = await new Promise((done, reject) => {
    let out = '', err = '';
    const timer = setTimeout(() => reject(new Error(`serve did not start: ${err}`)), 15000);
    server.stderr.on('data', (b) => { err += b; });
    server.once('exit', (code) => { clearTimeout(timer); reject(new Error(`serve exited ${code}: ${err}`)); });
    server.stdout.on('data', (b) => { out += b; if (out.includes('Ctrl-C')) { clearTimeout(timer); done(out.match(/^The book: (http:\/\/127\.0\.0\.1:\d+)\/$/m)[1]); } });
  });
  const live = async (...args) => JSON.parse(await node(join(ROOT, 'book.mjs'), 'live', ...args, '--url', url));
  let batches = 0, gestures = 0;
  const draw = async (...actions) => {
    const file = join(tmp, 'actions.json');
    await writeFile(file, JSON.stringify([{ type: 'select', tool: 'graphite-2b', options: { size: 2 } }, ...actions]));
    batches++; gestures += actions.length;
    return live('actions', '--file', file);
  };
  /* The watcher reads only what the live server already offers: its session
   * answer, for the notice, and then the snapshot. */
  const watch = async () => (await (await fetch(`${url}/api/session`)).json()).notice;

  const opened = await live('new', '--title', 'host seam, live (test marks)', '--width', '600', '--height', '400', '--paper', 'white');
  const D = opened.notice.drawingId;
  const empty = JSON.parse(await tool('snapshot', '--drawing', D, '--json'));
  say(`a live sheet opens as drawing ${D}, notice ${JSON.stringify(opened.notice)}`);
  say(`  its snapshot before any pass: revision ${empty.revision}, ${empty.state}, marks ${empty.marks} ("${empty.message}")`);
  const editStart = opened.revision;

  const watcher = { lastSeen: 0 };
  say(`  the watcher last saw revision ${watcher.lastSeen}`);
  await draw(line(100, 100, 500, 100), line(100, 300, 500, 300));
  const pass1 = await live('save', '--name', 'pass 1');
  say(`  pass 1: 2 gestures, a checkpoint: notice ${JSON.stringify(pass1.notice)}  (the watcher misses this one)`);
  await draw(line(100, 100, 100, 300));
  const afterGestures = await live('status');
  await draw(line(500, 100, 500, 300));
  const pass2 = await live('save', '--name', 'pass 2');
  say(`  pass 2: 2 more gestures in two batches (the notice stayed ${JSON.stringify(afterGestures.notice)} between them), a checkpoint: notice ${JSON.stringify(pass2.notice)}`);

  const seen = await watch();
  const liveBefore = await listing(book);
  const liveSnap = JSON.parse(await tool('snapshot', '--drawing', seen.drawingId, '--json'));
  const liveAfter = await listing(book);
  watcher.lastSeen = liveSnap.revision;
  const liveSheet = (await live('status', '--full')).drawing;
  const liveHashMatches = liveSnap.marksHash === hashOf(liveSheet.ops) && hashOf(liveSnap.marks) === liveSnap.marksHash;
  say(`  the watcher looks: notice ${JSON.stringify(seen)}; it reads the snapshot: revision ${liveSnap.revision}, ${liveSnap.state}, ${liveSnap.marks.length} marks, hash ${liveSnap.marksHash.slice(0, 16)}… (${liveHashMatches ? 'the sheet\'s marks at pass 2' : 'NOT THE SHEET\'S MARKS'}; it never saw revision 1, and nothing was lost)`);
  const liveUnchanged = JSON.stringify(liveBefore) === JSON.stringify(liveAfter);
  say(`  reading it changed ${liveUnchanged ? 'nothing in the book or its live folder (same files, same bytes)' : 'THE BOOK'}`);

  say('  the watcher leaves');
  await draw(line(100, 100, 500, 300), line(100, 300, 500, 100));
  const pass3 = await live('save', '--name', 'pass 3');
  say(`  pass 3: 2 gestures, a checkpoint: notice ${JSON.stringify(pass3.notice)}`);
  const editMoved = pass3.revision - editStart;
  say(`  ${gestures} gestures in ${batches} batches and 3 checkpoints moved the sheet's edit counter by ${editMoved}; the drawing's revision moved only at the checkpoints: 0 → ${pass3.notice.revision}`);

  liveDir = await mkdtemp(join(ROOT, HERE, 'live-'));
  const module = relative(ROOT, join(liveDir, 'live-sheet.js'));
  await node(join(ROOT, 'book.mjs'), 'live', 'page', '--out', module, '--note', 'test marks drawn live for the host seam: plain lines, not a drawing', '--book', book, '--url', url);
  const livePage = JSON.parse(await tool('write', module, '--reference'));
  const savedLive = JSON.parse(await tool('snapshot', '--drawing', D, '--json'));
  say(`  the sheet saved as page ${livePage.pageIndex}: drawing ${livePage.drawingId} (${livePage.drawingId === D ? 'the id it had while live' : 'A DIFFERENT ID'}), revision ${livePage.revision}; its snapshot now reads ${savedLive.state} at revision ${savedLive.revision}`);
  const exited = new Promise((done) => server.once('exit', done));
  server.kill('SIGTERM');
  await exited;
  say('  the live server stops');

  Object.assign(summary, {
    live: {
      drawingId: D, opened: opened.notice, empty: { revision: empty.revision, state: empty.state, marks: empty.marks, message: empty.message },
      notices: [pass1.notice, pass2.notice, pass3.notice], noticeBetweenGestures: afterGestures.notice, watcherSaw: seen, watcherLastSeen: watcher.lastSeen,
      snapshot: { revision: liveSnap.revision, state: liveSnap.state, marks: liveSnap.marks.length, hashMatches: liveHashMatches }, snapshotWroteNothing: liveUnchanged,
      gestures, batches, editCounterMoved: editMoved, page: livePage, savedState: savedLive.state, savedRevision: savedLive.revision,
    },
  });

  /* ------------------------------------------------------------ the saved half */
  say('\nthe saved half');
  const host = { lastSeen: 0 };
  say(`the host last saw revision ${host.lastSeen}`);

  await tool('write', `${HERE}/pass-1.js`);
  const first = await notice();
  say(`pass 1 saved: notice ${JSON.stringify(first)}  (the host misses this one)`);

  const saved = JSON.parse(await tool('write', `${HERE}/pass-2.js`, '--continue', '2', '--reference'));
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
  const again = JSON.parse(await tool('write', `${HERE}/pass-2.js`, '--continue', '2', '--reference'));
  const pages = JSON.parse(await readFile(join(book, 'book.json'), 'utf8')).pages.length;
  const sameReference = JSON.stringify(again) === JSON.stringify(saved);
  say(`the same save again: ${sameReference ? 'the same reference' : 'A DIFFERENT REFERENCE'}, and the book still holds ${pages} pages`);

  const recomputed = hashOf(snap.marks);
  say(`marks hash, recomputed here from the snapshot's marks: ${recomputed} (${recomputed === saved.marksHash ? 'matches' : 'DOES NOT MATCH'} the reference)`);

  const png = await readFile(join(book, saved.poster));
  const posterOk = png.subarray(1, 4).toString() === 'PNG';
  const posterSize = [png.readUInt32BE(16), png.readUInt32BE(20)];
  say(`the poster: ${saved.poster}, a ${posterSize.join(' × ')} PNG, ${png.length} bytes`);

  const drawn = await hostDraws({ root: ROOT, snap, poster: png });
  const { compare } = drawn;
  say(`\nthe host drew the marks alone with <sketch-page>: ${compare.sameSize ? `${compare.size.join(' × ')} px, largest difference from the poster ${compare.maxChannelDiff} of 255 in any channel, ${compare.differingPixels} of ${compare.pixels} pixels differ at all` : `a different size from the poster (${compare.drawn} vs ${compare.poster})`}`);
  say(`what the host page asked for: ${drawn.requests.join(', ')}`);
  say(`requests for the page's source or the book: ${drawn.sourceRequested.length ? drawn.sourceRequested.join(', ') : 'none'}`);

  Object.assign(summary, {
    book, firstNotice: first, secondNotice: second, reference: saved, snapshotRevision: snap.revision, snapshotState: snap.state,
    reopenedRevision: reopened.revision, hostLastSeen: host.lastSeen, snapshotWroteNothing: unchanged, sameReferenceOnRetry: sameReference,
    pagesAfterRetry: pages, recomputedHash: recomputed, hashMatches: recomputed === saved.marksHash, posterIsPng: posterOk, posterSize,
    host: compare, hostRequests: drawn.requests, hostRefused: drawn.refused, hostSourceRequests: drawn.sourceRequested,
  });
} finally {
  if (server && server.exitCode === null && server.signalCode === null) { const exited = new Promise((done) => server.once('exit', done)); server.kill('SIGTERM'); await exited; }
  if (liveDir) await rm(liveDir, { recursive: true, force: true });
  if (!keep) await rm(tmp, { recursive: true, force: true });
  else say(`\n(kept ${tmp})`);
}
if (asJSON) console.log(JSON.stringify(summary));
