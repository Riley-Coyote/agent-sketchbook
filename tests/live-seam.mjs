/* tests/live-seam.mjs — node tests/live-seam.mjs
 * The live sheet in the host seam (docs/host-seam.md, "A live sheet"): a
 * drawing id from the moment a sheet opens, kept by its page; a revision per
 * completed pass, never per gesture; a snapshot of the sheet in progress that
 * writes nothing; a notice of { drawingId, revision } and nothing more; a
 * watcher that misses notices or leaves changing nothing; sheets that carry
 * on or branch a page; and a plain write that launches no browser.
 * Self-contained: `book.mjs serve` on a free port with a throwaway book in a
 * temp folder, plain test marks (straight lines), the repository's own
 * playwright-core for the one save that draws a poster.
 */

import { spawn, execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { marksHash } from '../host-seam.mjs';
import { startStudioServer } from '../studio-server.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const run = promisify(execFile);
let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log(`  ok   ${name}`); } else { fail++; console.log(`  FAIL ${name}`); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

const scratch = await mkdtemp(join(tmpdir(), 'sketchbook-live-seam-'));
const fixtures = await mkdtemp(join(ROOT, 'tests', 'live-seam-fixtures-'));
const book = join(scratch, 'book');
const tool = (...args) => run(process.execPath, [join(ROOT, 'book.mjs'), ...args], { cwd: ROOT, maxBuffer: 1 << 28 });
const cli = (...args) => tool(...args, '--book', book);
let server, url;
const live = (...args) => tool('live', ...args, '--url', url);
const json = async (...args) => JSON.parse((await live(...args)).stdout);
const snapshot = async (...args) => JSON.parse((await cli('snapshot', ...args, '--json')).stdout);
const session = async () => (await fetch(`${url}/api/session`)).json();
const active = async () => JSON.parse(await readFile(join(book, 'live', 'active.json'), 'utf8'));
let gestures = 0, batches = 0;
const line = (x1, y1, x2, y2) => ({ type: 'stroke', samples: [{ x: x1, y: y1, p: 0.5, t: 0 }, { x: x2, y: y2, p: 0.6, t: 500 }] });
async function draw(...actions) {
  const file = join(scratch, 'actions.json');
  // A tool is chosen at the start of a batch, unless a gesture is still on the paper.
  const down = ['move', 'lift'].includes(actions[0].type);
  await writeFile(file, JSON.stringify([...(down ? [] : [{ type: 'select', tool: 'graphite-2b', options: { size: 2 } }]), ...actions]));
  gestures += actions.filter((a) => ['stroke', 'touch'].includes(a.type)).length; batches++;
  return json('actions', '--file', file);
}

/* Every file in the book (its live folder too), with size, time and bytes. */
async function listing(dir, base = dir) {
  const out = {};
  for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) { out[path.slice(base.length + 1) + '/'] = 'dir'; Object.assign(out, await listing(path, base)); }
    else { const s = await stat(path); out[path.slice(base.length + 1)] = `${s.size} ${s.mtimeMs} ${sha(await readFile(path))}`; }
  }
  return out;
}

/* The same three passes, drawn the same way, on a new blank sheet. With
 * `watcher`, a consumer reads the notice and the snapshot after passes 1 and
 * 2, then leaves before pass 3. Returns what the sheet did. */
async function threePasses(title, watcher) {
  const opened = await json('new', '--title', title, '--width', '400', '--height', '300', '--paper', 'white');
  const trail = { opened: opened.notice, notices: [], hashes: [], reads: 0, unchanged: true };
  const look = async () => {
    const before = await listing(book);
    const seen = (await session()).notice;
    const snap = await snapshot('--drawing', seen.drawingId);
    trail.reads++;
    trail.unchanged &&= same(before, await listing(book));
    return snap;
  };
  const passes = [[line(40, 40, 360, 40), line(40, 260, 360, 260)], [line(40, 40, 40, 260), line(360, 40, 360, 260)], [line(40, 40, 360, 260)]];
  for (const [i, marks] of passes.entries()) {
    for (const m of marks) await draw(m);
    const saved = await json('save', '--name', `pass ${i + 1}`);
    trail.notices.push(saved.notice);
    trail.hashes.push(marksHash((await active()).pass.ops));
    if (watcher && i < 2) await look();
  }
  const end = await session();
  trail.editCounter = end.revision - opened.revision;
  trail.ops = end.drawing.ops;
  return trail;
}

try {
  await cli('init', '--owner', 'live-seam-test');
  const bookId = JSON.parse(await readFile(join(book, 'book.json'), 'utf8')).id;
  server = spawn(process.execPath, [join(ROOT, 'book.mjs'), 'serve', '--port', '0', '--book', book], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  url = await new Promise((done, reject) => {
    let out = '', err = '';
    const timer = setTimeout(() => reject(new Error(`serve did not start: ${err}`)), 15000);
    server.stderr.on('data', (b) => { err += b; });
    server.once('exit', (code) => { clearTimeout(timer); reject(new Error(`serve exited ${code}: ${err}`)); });
    server.stdout.on('data', (b) => { out += b; if (out.includes('Ctrl-C')) { clearTimeout(timer); done(out.match(/^The book: (http:\/\/127\.0\.0\.1:\d+)\/$/m)[1]); } });
  });

  console.log('a live sheet is a drawing from its first mark');
  const opened = await json('new', '--title', 'live seam test', '--width', '400', '--height', '300', '--paper', 'white');
  const D = opened.notice.drawingId;
  ok(new RegExp(`^${bookId}:live-[0-9a-f]{8}$`).test(D) && opened.notice.revision === 0, `a new sheet has its drawing id when it opens, at revision 0 (${D})`);
  ok(same((await active()).notice, opened.notice) && same((await session()).notice, opened.notice), 'the id is kept in the live folder beside the sheet, and the session answer carries it');
  const before0 = await listing(book);
  const empty = await snapshot();
  const emptyNamed = await snapshot('--drawing', D);
  ok(empty.drawingId === D && empty.state === 'drawing' && empty.revision === 0 && empty.marks === null && /none of its passes has completed yet/.test(empty.message) && same(empty, emptyNamed),
    `with no completed pass, the snapshot says so plainly: revision 0, marks null, "${empty.message}"`);
  ok(same(before0, await listing(book)), 'and reading it wrote nothing');

  console.log('a pass is a checkpoint, not a gesture');
  const counterAtOpen = (await session()).revision;
  await draw(line(40, 40, 360, 40), line(40, 260, 360, 260));
  const n1 = (await session()).notice;
  await draw({ type: 'touch', sample: { x: 40, y: 40, p: 0.4, t: 0 } });
  await draw({ type: 'move', samples: [{ x: 40, y: 150, p: 0.5, t: 300 }] });
  await draw({ type: 'move', samples: [{ x: 40, y: 260, p: 0.5, t: 600 } ] }, { type: 'lift' });
  const sheet = (await session()).drawing;
  const putBody = { revision: (await session()).revision, drawing: sheet };
  const put = await fetch(`${url}/api/session`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(putBody) });
  ok(put.status === 200, 'the live view\'s whole-sheet write (PUT /api/session) is accepted as before');
  const n2 = (await session()).notice;
  ok(same(n1, opened.notice) && same(n2, opened.notice), 'gestures, gesture batches and whole-sheet writes leave the notice as it was');
  const pass1 = await json('save', '--name', 'pass 1');
  await draw(line(360, 40, 360, 260));
  const pass2 = await json('save', '--name', 'pass 2');
  const counter = pass2.revision - counterAtOpen;
  ok(pass1.notice.revision === 1 && pass2.notice.revision === 2 && pass2.notice.drawingId === D, `each checkpoint is one revision: ${gestures} gestures in ${batches} batches, one whole-sheet write and 2 checkpoints moved the edit counter by ${counter}, the drawing's revision by 2`);
  const measured = { gestures, batches, editCounter: counter, revisions: pass2.notice.revision };

  console.log('the snapshot sees the sheet in progress');
  const atPass2 = (await session()).drawing.ops;
  await draw(line(40, 40, 360, 260));     // after pass 2, not yet a pass
  const listed = await listing(book);
  const snap = await snapshot();
  const snapNamed = await snapshot('--drawing', D);
  const large = await snapshot('--inline-max', '10');
  ok(snap.state === 'drawing' && snap.revision === 2 && snap.pageIndex === null && snap.reference === null && snap.poster === null && same(snap, snapNamed), 'a sheet ahead of the book reads as state "drawing" at its last completed pass, by default and by name');
  ok(same(snap.marks, atPass2) && snap.marks.length === atPass2.length && snap.marksHash === marksHash(atPass2), `its marks are pass 2's (${snap.marks.length}), checked and hashed, not the gesture drawn since`);
  ok(same(snap.page, { w: 400, h: 300 }) && snap.paper.tooth === 0.65, 'with the sheet\'s page size and paper');
  ok(large.marks === undefined && large.marksFile === 'live/active.json' && large.marksField === 'pass.ops' && marksHash((await active()).pass.ops) === large.marksHash, `large marks travel as a path (${large.marksFile}, ${large.marksField}) with the same hash`);
  await snapshot(); await snapshot('--drawing', D);
  const after = await listing(book);
  ok(same(Object.keys(listed), Object.keys(after)), `five snapshot reads of a live sheet left the listing as it was (${Object.keys(after).length} entries)`);
  ok(same(listed, after), 'and every file, active.json too, has the same size, time and bytes');

  console.log('the notice');
  const said = await session();
  ok(Object.keys(said.notice).sort().join() === 'drawingId,revision' && same((await active()).notice, said.notice), 'the notice is { drawingId, revision } and nothing more, in the session answer and in active.json');

  console.log('a watcher that misses a notice, or leaves');
  const watched = await threePasses('watched', true);
  const alone = await threePasses('alone', false);
  ok(watched.reads === 2 && watched.unchanged, 'the watcher\'s reads (session answer, then snapshot) changed no file');
  ok(same(watched.notices.map((n) => n.revision), [1, 2, 3]) && same(alone.notices.map((n) => n.revision), [1, 2, 3]), 'the watched sheet and the unwatched one both go 1, 2, 3');
  ok(same(watched.hashes, alone.hashes) && same(watched.ops, alone.ops) && watched.editCounter === alone.editCounter, `after the watcher leaves, pass 3 is what it would have been: the same marks hash at every pass, the same marks, the same edit count (${watched.editCounter})`);
  {
    /* a watcher that last saw 0 and misses pass 1 */
    const lastSeen = 0;
    const sheetNow = await session();
    const s = await snapshot('--drawing', sheetNow.notice.drawingId);
    ok(lastSeen < 1 && s.revision === 3 && s.marksHash === alone.hashes[2], 'one that saw nothing reads the snapshot and lands on revision 3, the same marks as pass 3');
  }

  console.log('the sheet becomes a page with its id');
  await json('new', '--title', 'to be a page', '--width', '400', '--height', '300', '--paper', 'white');
  const P = (await session()).notice.drawingId;
  await draw(line(40, 40, 360, 40));
  await json('save', '--name', 'pass 1');
  await draw({ type: 'review', observation: 'One line, then two.', lesson: '', next: '' }, line(40, 260, 360, 260));
  await json('save', '--name', 'pass 2');
  const module = relative(ROOT, join(fixtures, 'p.js'));
  const printed = (await live('page', '--out', module, '--note', 'test marks for the live seam', '--book', book)).stdout;
  const source = await readFile(join(ROOT, module), 'utf8');
  ok(source.split('\n')[1] === `// live sheet ${JSON.stringify({ drawingId: P, revision: 2 })}`, 'live page writes the sheet\'s drawing into the module\'s header');
  const writeLine = printed.split('\n').find((l) => l.trim().startsWith('node '))?.trim();
  ok(writeLine === `node book.mjs write ${module} --book ${book}`, 'and prints the same write line as before');
  /* a plain write, with no browser to be had: it does not need one */
  const noBrowser = { ...process.env, PLAYWRIGHT_BROWSERS_PATH: join(scratch, 'no-browsers') };
  await mkdir(noBrowser.PLAYWRIGHT_BROWSERS_PATH);
  const plain = await run(process.execPath, [join(ROOT, 'book.mjs'), 'write', module, '--book', book], { cwd: ROOT, env: noBrowser });
  const page1 = JSON.parse(await readFile(join(book, 'book.json'), 'utf8')).pages[0];
  ok(/page 1:/.test(plain.stdout) && page1.drawingId === P && page1.revision === 3, `the page keeps the id the sheet had while live (${P}), at the revision after its two live passes (${page1.revision})`);
  const withPoster = await run(process.execPath, [join(ROOT, 'book.mjs'), 'write', module, '--book', book, '--reference'], { cwd: ROOT, env: noBrowser }).catch((e) => e);
  ok(!(await readdir(join(book, 'pages'))).some((f) => f.endsWith('.png')) && withPoster.code === 1, 'a plain write saved its page where no browser can be launched; the same save asking for a poster could not draw it there');
  const unaided = await Promise.all([['snapshot', '--json'], ['list'], ['read', '1']].map((a) => run(process.execPath, [join(ROOT, 'book.mjs'), ...a, '--book', book], { cwd: ROOT, env: noBrowser }).then(() => true, () => false)));
  ok(unaided.every(Boolean), 'snapshot, list and read need no browser either');
  const savedSnap = await snapshot('--drawing', P);
  ok(savedSnap.state === 'saved' && savedSnap.revision === 3 && savedSnap.pageIndex === 1, 'once saved, the same drawing id reads "saved" at the next revision');
  const twice = await cli('write', module).catch((e) => e);
  ok(twice.code === 1 && /already page 1 of this book; save it with --continue 1/.test(twice.stderr), 'saving the sheet\'s module again as a new drawing is refused, naming --continue 1');
  await draw(line(40, 40, 360, 260));
  const after3 = await json('save', '--name', 'pass after the page');
  ok(after3.notice.revision === 4 && (await snapshot('--drawing', P)).state === 'drawing', 'a pass after the page is the next revision again (4), read as "drawing"');

  console.log('a pass set aside never gives its revision again');
  await json('new', '--title', 'another', '--width', '400', '--height', '300', '--paper', 'white');
  const back = await snapshot('--drawing', P);
  ok(back.state === 'saved' && back.revision === 3, 'with its sheet set aside unsaved, the drawing reads as its newest page again (revision 3)');
  const cont = await json('new', '--continue', '1');
  ok(cont.notice.drawingId === P && cont.notice.revision === 3 && same(cont.from, { relation: 'continue', page: 1 }) && cont.marks === page1.opCount, 'live new --continue 1 opens page 1\'s marks as the same drawing, at its saved revision');
  await draw(line(200, 40, 200, 260));
  const contPass = await json('save', '--name', 'continued');
  ok(contPass.notice.revision === 5, 'its first pass is revision 5: revision 4 went to the pass set aside');
  const contModule = relative(ROOT, join(fixtures, 'c.js'));
  const contPrinted = (await live('page', '--out', contModule, '--note', 'test marks, continued live', '--book', book)).stdout;
  const contLine = contPrinted.split('\n').find((l) => l.trim().startsWith('node '))?.trim();
  ok(contLine === `node book.mjs write ${contModule} --book ${book} --continue 1`, 'live page prints the write line with --continue 1');
  const wrong = await cli('write', contModule).catch((e) => e);
  ok(wrong.code === 1 && /carries on page 1 \(continue\); save it with --continue 1/.test(wrong.stderr), 'saved without --continue, it is refused and told how');
  await run('/bin/sh', ['-c', contLine], { cwd: ROOT });
  const page2 = JSON.parse(await readFile(join(book, 'book.json'), 'utf8')).pages[1];
  const page2File = JSON.parse(await readFile(join(book, 'pages', '002.json'), 'utf8'));
  ok(page2.drawingId === P && page2.revision === 6 && page2File.journal.parent.relation === 'continue' && page2File.journal.passes.length === 3, 'the continued sheet saves as page 2 of the same drawing, revision 6, with page 1\'s passes kept and its own added');

  console.log('a branch from a page');
  const br = await json('new', '--branch', '2', '--title', 'branched');
  const B = br.notice.drawingId;
  const brSnap = await snapshot('--drawing', B);
  ok(B !== P && /:live-[0-9a-f]{8}$/.test(B) && br.notice.revision === 0 && same(brSnap.parent, { drawingId: P, revision: 6, pageIndex: 2 }) && brSnap.marks === null, 'live new --branch 2 is a new drawing that names its parent, with no pass yet');
  await draw(line(300, 40, 100, 260));
  await json('save', '--name', 'branch pass');
  const brModule = relative(ROOT, join(fixtures, 'b.js'));
  const brPrinted = (await live('page', '--out', brModule, '--note', 'test marks, branched live', '--book', book)).stdout;
  const brLine = brPrinted.split('\n').find((l) => l.trim().startsWith('node '))?.trim();
  ok(brLine === `node book.mjs write ${brModule} --book ${book} --branch 2`, 'live page prints the write line with --branch 2');
  await run('/bin/sh', ['-c', brLine], { cwd: ROOT });
  const page3 = JSON.parse(await readFile(join(book, 'book.json'), 'utf8')).pages[2];
  ok(page3.drawingId === B && page3.revision === 2 && same(page3.parentDrawing, { drawingId: P, revision: 6, pageIndex: 2 }), 'and saves as a page with that id and that parent');
  const missing = await fetch(`${url}/api/new`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: (await session()).revision, continue: 9 }) });
  ok(missing.status === 404, 'a sheet cannot carry on a page that is not there');
  await cli('write', 'examples/host-seam/pass-1.js');
  const inked = await live('new', '--continue', '4').catch((e) => e);
  ok(inked.code === 1 && /paper with tooth/.test(inked.stderr), 'nor one whose paper has no tooth (page 4: ink on cream)');

  console.log('a checkpoint taken up again is a new drawing');
  const saves = (await json('saves')).saves;
  const loaded = await json('load', '--id', saves.find((s) => s.name === 'pass 1').id);
  ok(loaded.notice.revision === 0 && ![D, P, B].includes(loaded.notice.drawingId), 'live load opens a new drawing, at revision 0');

  console.log('a sheet kept before sheets had ids');
  {
    const data = join(scratch, 'old-live');
    await mkdir(data, { recursive: true });
    const oldSheet = { version: 1, revision: 4, drawing: { version: 1, title: 'old', page: { w: 200, h: 100 }, surface: { kind: 'ink', version: 2, paper: '#f6f6f3', tooth: 0.65, seed: 17 }, ops: [], reviews: [], tool: 'graphite-2b', settings: { size: 2.2, strength: 1 }, redo: [] }, lessons: [] };
    await writeFile(join(data, 'active.json'), JSON.stringify(oldSheet));
    const s = await startStudioServer({ port: 0, dataDir: data, bookDir: book });
    try {
      const kept = JSON.parse(await readFile(join(data, 'active.json'), 'utf8'));
      const answer = await (await fetch(`${s.url}/api/session`)).json();
      ok(kept.revision === 4 && same(kept.drawing, oldSheet.drawing) && new RegExp(`^${bookId}:live-[0-9a-f]{8}$`).test(kept.notice.drawingId) && kept.notice.revision === 0 && same(answer.notice, kept.notice), 'is named when the server starts, and kept so; its marks and edit counter are as they were');
    } finally { await s.close(); }
  }

  console.log('measured');
  console.log(`  ${JSON.stringify(measured)}`);
} finally {
  if (server && server.exitCode === null) { const exited = new Promise((done) => server.once('exit', done)); server.kill('SIGTERM'); await exited; }
  ok(server?.exitCode === 0, 'the live server stops on SIGTERM');
  await rm(fixtures, { recursive: true, force: true });
  await rm(scratch, { recursive: true, force: true });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
