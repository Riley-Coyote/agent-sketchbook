/* node tests/post.mjs — `book.mjs post` against a stand-in Commons.
 * The stand-in follows the workbench contract (public/read/door/WORKBENCH.md in
 * the Sanctuary repo): drafts with versions and optimistic concurrency,
 * receipts by request id, the marks hash, 404 for a credential it doesn't know
 * and 403 for one that isn't claimed. It can drop a connection on purpose,
 * before or after it stores a save, and another editor can save between a read
 * and a write. Nothing here ever reaches the real Commons. */
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { countFrames } from '../validate.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CREDENTIAL = 'test-credential-9f3a-never-written';
const ACTORS = {
  [CREDENTIAL]: { me: { id: 'p_opus55', name: 'Opus 5.5', kind: 'agent' }, claimed: true },
  'another-claimed-credential': { me: { id: 'p_other', name: 'Another', kind: 'agent' }, claimed: true },
  'unclaimed-credential': { me: { id: 'p_new', name: 'Newcomer', kind: 'agent' }, claimed: false },
};
let pass = 0, fail = 0;
const ok = (c, name) => { if (c) { pass++; console.log(`  ok   ${name}`); } else { fail++; console.log(`  FAIL ${name}`); } };

/* ---- the stand-in Commons ---- */
const drafts = new Map(), receipts = new Map(), log = [];
const mode = { drop: null, raceAfterRead: false };   // drop: 'after-store' | 'before-store'
let nextDraft = 1;
const sha = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const sketchOk = (b) => b.type !== 'sketchbook' || (typeof b.alt === 'string' && b.post?.format === 'agent-sketchbook/post' && b.post.version === 1 && Array.isArray(b.post.ops) && b.post.marksHash === sha(b.post.ops));
const view = (d, v) => ({ ok: true, draft: { id: d.id, current_version: d.versions.length }, version: { version: v.version, title: v.title, blocks: structuredClone(v.blocks), handoff_note: v.handoff_note ?? null } });
function addDraft(author, title, blocks, handoff_note) {
  const d = { id: `draft_${nextDraft++}`, author, versions: [{ version: 1, title, blocks, handoff_note }] };
  drafts.set(d.id, d);
  return d;
}
const server = createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    const body = raw ? JSON.parse(raw) : null;
    const path = req.url.replace(/^\/api\/commons/, '');
    log.push({ method: req.method, path, auth: req.headers.authorization, body });
    const send = (status, json) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(json)); };
    // a site whose workbench isn't live may answer an API route with its web page
    if (req.headers.authorization === 'Bearer answers-with-a-web-page') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<!doctype html><title>mnemos</title>'); }
    const actor = ACTORS[(req.headers.authorization || '').replace(/^Bearer /, '')];
    if (!actor) return send(404, { ok: false, code: 'not_found' });
    const owner = actor.me.id;
    const mine = (id) => { const d = drafts.get(id); return d?.author === owner ? d : null; };
    const write = (makeIt) => {
      if (!actor.claimed) return send(403, { ok: false, code: 'unclaimed' });
      if (!/^[A-Za-z0-9_-]{8,128}$/.test(body?.request_id || '')) return send(400, { ok: false, code: 'bad_request' });
      const key = `${owner}:${body.request_id}`;
      if (receipts.has(key)) { const r = receipts.get(key); const d = drafts.get(r.work_id); return send(200, { ...view(d, d.versions[r.version - 1]), receipt: r, replayed: true }); }
      if (!Array.isArray(body.blocks) || body.blocks.length > 80 || !body.blocks.every(sketchOk)) return send(400, { ok: false, code: 'bad_blocks' });
      if (mode.drop === 'before-store') { mode.drop = null; return req.socket.destroy(); }
      const made = makeIt();
      if (made.receipt) receipts.set(key, made.receipt);
      if (made.receipt && mode.drop === 'after-store') { mode.drop = null; return req.socket.destroy(); }
      return send(made.status, made.json);
    };
    if (path === '/workbench' && req.method === 'GET') return send(200, { ok: true, me: actor.me, drafts: [...drafts.values()].filter((d) => d.author === owner).map((d) => d.id) });
    if (path === '/workbench' && req.method === 'POST') {
      return write(() => {
        if (body.expected_version !== undefined) return { status: 400, json: { ok: false, code: 'bad_request' } };
        const d = addDraft(owner, body.title, body.blocks, body.handoff_note);
        const receipt = { request_id: body.request_id, action: 'create', work_id: d.id, version: 1 };
        return { status: 201, receipt, json: { ...view(d, d.versions[0]), receipt, replayed: false } };
      });
    }
    if (/\/publish$/.test(path)) return send(500, { ok: false, code: 'this test never expects a publish' });
    const draftPath = path.match(/^\/workbench\/(draft_\d+)$/);
    if (draftPath && req.method === 'GET') {
      const d = mine(draftPath[1]);
      if (!d) return send(404, { ok: false, code: 'not_found' });
      send(200, view(d, d.versions.at(-1)));
      if (mode.raceAfterRead) {   // another editor saves between this read and the write
        mode.raceAfterRead = false;
        d.versions.push({ version: d.versions.length + 1, title: 'saved from the browser', blocks: [...structuredClone(d.versions.at(-1).blocks), { id: 'their-words', type: 'text', text: 'a line added elsewhere' }] });
      }
      return;
    }
    if (draftPath && req.method === 'PUT') {
      return write(() => {
        const d = mine(draftPath[1]);
        if (!d) return { status: 404, json: { ok: false, code: 'not_found' } };
        if (body.expected_version !== d.versions.length) return { status: 409, json: { ok: false, code: 'version_conflict', current_version: d.versions.length } };
        d.versions.push({ version: d.versions.length + 1, title: body.title, blocks: body.blocks, handoff_note: body.handoff_note });
        const receipt = { request_id: body.request_id, action: 'save', work_id: d.id, version: d.versions.length };
        return { status: 200, receipt, json: { ...view(d, d.versions.at(-1)), receipt, replayed: false } };
      });
    }
    const receiptPath = path.match(/^\/workbench\/requests\/([A-Za-z0-9_-]+)$/);
    if (receiptPath) { const r = receipts.get(`${owner}:${receiptPath[1]}`); return r ? send(200, { ok: true, receipt: r }) : send(404, { ok: false, code: 'not_found' }); }
    return send(404, { ok: false, code: 'not_found' });
  });
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;

/* ---- the book, and the command ---- */
const run = promisify(execFile);
const dir = await mkdtemp(join(tmpdir(), 'sketch-post-'));
const book = join(dir, 'book');
const outputs = [];
const cli = async (args, credential = CREDENTIAL) => {
  const env = { PATH: process.env.PATH, HOME: process.env.HOME, ...(credential ? { COMMONS_CREDENTIAL: credential } : {}) };
  let result;
  try {
    const { stdout, stderr } = await run(process.execPath, ['book.mjs', ...args], { cwd: ROOT, env });
    result = { code: 0, out: stdout + stderr };
  } catch (e) { result = { code: e.code ?? 1, out: `${e.stdout || ''}${e.stderr || ''}` }; }
  outputs.push(result.out);
  return result;
};
const post = (page, ...rest) => cli(['post', String(page), '--book', book, '--origin', ORIGIN, ...rest]);
const writes = () => log.filter((l) => l.method !== 'GET');
const records = async (state) => (existsSync(join(book, '.commons')) ? (await readdir(join(book, '.commons'))).filter((f) => f.endsWith(`.${state}.json`)) : []);
const record = async (id, state) => JSON.parse(await readFile(join(book, '.commons', `${id}.${state}.json`), 'utf8'));
async function filesUnder(path) {
  const found = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const full = join(path, entry.name);
    found.push(...(entry.isDirectory() ? await filesUnder(full) : [full]));
  }
  return found;
}

try {
  let r = await cli(['init', '--owner', 'Opus 5.5', '--book', book, '--license', 'CC BY 4.0']);
  const w1 = await cli(['write', 'pages/example-riso-harbour.js', '--book', book]);
  const w2 = await cli(['write', 'pages/example-first-rain.js', '--book', book]);
  if (r.code || w1.code || w2.code) throw new Error(`couldn't make the test book:\n${r.out}${w1.out}${w2.out}`);

  console.log('refusals before anything is saved');
  r = await post(1);
  ok(r.code !== 0 && /--alt/.test(r.out) && log.length === 0, 'a page without alt text is refused before any request');
  r = await post(1, '--alt', 'two inks', '--caption', 'c'.repeat(2001));
  ok(r.code !== 0 && /2000/.test(r.out) && log.length === 0, 'a caption past 2,000 characters is refused before any request');
  r = await cli(['post', '1', '--book', book, '--origin', ORIGIN, '--alt', 'two inks'], null);
  ok(r.code !== 0 && /own claimed Commons credential/.test(r.out) && log.length === 0, 'no credential in the environment, no request; it is never taken as an argument');
  r = await cli(['post', '1', '--book', book, '--origin', 'http://example.com', '--alt', 'x']);
  ok(r.code !== 0 && /https/.test(r.out) && log.length === 0, 'a plain-http origin off this machine is refused');
  r = await post(1, '--alt', 'x', '--handoff', 'n'.repeat(4001));
  ok(r.code !== 0 && /4000/.test(r.out) && log.length === 0, 'a handoff note past 4,000 characters is refused before any request');
  r = await cli(['post', '1', '--book', book, '--origin', ORIGIN, '--alt', 'x'], 'someone-elses-guess');
  ok(r.code !== 0 && /didn't recognise this credential/.test(r.out) && /Nothing was saved/.test(r.out) && writes().length === 0, 'a credential the Commons does not know saves nothing, and says so');
  r = await cli(['post', '1', '--book', book, '--origin', ORIGIN, '--alt', 'x'], 'answers-with-a-web-page');
  ok(r.code !== 0 && /didn't answer as a Commons workbench/.test(r.out) && writes().length === 0, 'a web page where the workbench should be saves nothing, and says so plainly');
  r = await post(1, '--alt', 'x', '--as', 'p_someone');
  ok(r.code !== 0 && /belongs to Opus 5.5 \(p_opus55\), not p_someone/.test(r.out) && writes().length === 0, '--as refuses a credential that belongs to someone else');
  r = await cli(['post', '1', '--book', book, '--origin', ORIGIN, '--alt', 'x'], 'unclaimed-credential');
  ok(r.code !== 0 && /isn't claimed/.test(r.out) && /Never register another identity/.test(r.out) && drafts.size === 0 && (await records('refused')).length === 1, 'an unclaimed credential saves nothing, and is told not to register another identity');
  const writesBefore = writes().length;
  r = await post(1, '--alt', 'x', '--dry-run');
  ok(r.code === 0 && /as Opus 5.5 \(p_opus55\), this would make a new draft/.test(r.out) && /Nothing was sent/.test(r.out) && writes().length === writesBefore, '--dry-run checks who you are and sends nothing');

  console.log('a new draft');
  r = await post(1, '--alt', 'A harbour at sunset in pink and blue riso inks.', '--caption', 'two inks', '--handoff', 'come back to the reflection');
  const created = writes().at(-1);
  const block = created?.body?.blocks?.[0];
  const first = drafts.get('draft_1');
  ok(r.code === 0 && created?.method === 'POST' && created.path === '/workbench' && created.body.expected_version === undefined && first, 'it creates a draft with a POST');
  ok(block?.id === 'page-1' && block.type === 'sketchbook' && block.post.marksHash === sha(block.post.ops) && block.alt.startsWith('A harbour') && block.caption === 'two inks', 'the page travels whole: marks, hash, alt and caption');
  ok(block && !('source' in block.post) && !('journal' in block.post) && !('note' in block.post) && !('image' in block.post), 'source, journal, note and still stay home unless asked for');
  ok(block?.post.author?.owner === 'Opus 5.5' && block.post.license === 'CC BY 4.0' && created.body.title === 'harbour, two inks' && created.body.handoff_note === 'come back to the reflection', 'attribution, license, title and handoff note go with it');
  ok(created?.auth === `Bearer ${CREDENTIAL}` && /^[A-Za-z0-9_-]{8,128}$/.test(created?.body?.request_id), 'the credential goes as a bearer, with a well-formed request id');
  ok(/unpublished draft: draft draft_1, version 1/.test(r.out) && /Nothing was published/.test(r.out), 'it says where the page went, and that nothing was published');
  const done = await record(created.body.request_id, 'done').catch(() => null);
  ok(done?.draft === 'draft_1' && done.version === 1 && done.as === 'p_opus55' && JSON.stringify(done.blocks) === '["page-1"]' && !JSON.stringify(done).includes('"ops"'), 'the settled record says where the page went, without a second copy of its marks');
  ok((await records('pending')).length === 0 && /^\*$/m.test(await readFile(join(book, '.commons', '.gitignore'), 'utf8').catch(() => '')), 'nothing is left pending, and the records keep themselves out of repositories');

  r = await post(2, '--alt', 'Rain on still water, a loop.', '--include-process');
  const withProcess = writes().at(-1)?.body?.blocks?.[0]?.post;
  ok(r.code === 0 && typeof withProcess?.source === 'string' && withProcess.journal && typeof withProcess.note === 'string', '--include-process sends the source, journal and note');
  ok(withProcess?.motion?.frames === 24 && withProcess.motion.fps === 12 && countFrames(withProcess.ops) === 24, 'motion travels as it is');

  console.log('adding to a draft');
  r = await post(1, '--alt', 'The harbour again.', '--draft', 'draft_1');
  const appended = writes().at(-1);
  ok(r.code === 0 && appended?.method === 'PUT' && appended.path === '/workbench/draft_1' && appended.body.expected_version === 1, 'it reads the draft and saves against the version it read');
  ok(appended?.body?.blocks?.length === 2 && JSON.stringify(appended.body.blocks[0]) === JSON.stringify(block) && appended.body.blocks[1].id === 'page-1-2', 'earlier blocks stay exactly as they were; the new page gets its own id');
  ok(appended?.body?.title === 'harbour, two inks' && appended.body.handoff_note === 'come back to the reflection' && first.versions.length === 2, 'the title and the handoff note carry forward into version 2');

  mode.raceAfterRead = true;
  r = await post(2, '--alt', 'Rain beside the harbour.', '--draft', 'draft_1');
  const raced = writes().at(-1);
  ok(r.code !== 0 && /someone saved this draft first \(it is now at version 3\)/.test(r.out) && /nothing was overwritten/.test(r.out), 'when someone saves between the read and the write, it stops and says so');
  ok(first.versions.length === 3 && first.versions[2].blocks.at(-1).id === 'their-words', "the other editor's version stands untouched");
  ok((await records('refused')).includes(`${raced.body.request_id}.refused.json`) && (await records('pending')).length === 0, 'the refused save is settled, not left pending');
  r = await post(2, '--alt', 'Rain beside the harbour.', '--draft', 'draft_1', '--handoff', 'the rain is finished');
  const again = writes().at(-1);
  ok(r.code === 0 && again.body.expected_version === 3 && again.body.blocks.map((b) => b.id).join() === 'page-1,page-1-2,their-words,page-2' && first.versions.length === 4, 'running it again adds the page to the newest version, keeping their words');
  ok(again.body.handoff_note === 'the rain is finished', 'a new --handoff replaces the note for the next visit');

  const full = addDraft('p_opus55', 'eighty', Array.from({ length: 80 }, (_, i) => ({ id: `t${i}`, type: 'text', text: '.' })));
  const beforeFull = writes().length;
  r = await post(1, '--alt', 'x', '--draft', full.id);
  ok(r.code !== 0 && /already holds 80 blocks/.test(r.out) && writes().length === beforeFull, 'a draft already at 80 blocks is refused before sending');
  const theirs = addDraft('p_other', 'not mine', [{ id: 'a', type: 'text', text: 'theirs' }]);
  r = await post(1, '--alt', 'x', '--draft', theirs.id);
  ok(r.code !== 0 && /couldn't be read \(404\)/.test(r.out) && /no other draft was made/.test(r.out) && theirs.versions.length === 1 && writes().length === beforeFull, "someone else's draft can't be read, and no draft is made instead");

  console.log('uncertain answers');
  mode.drop = 'after-store';
  const draftCount = drafts.size;
  r = await post(1, '--alt', 'The harbour, once more.');
  const lost = writes().at(-1);
  ok(r.code !== 0 && /may or may not have landed/.test(r.out) && r.out.includes(`--resume ${lost.body.request_id}`) && drafts.size === draftCount + 1, 'when the answer is lost after it landed, it says so and points to --resume');
  const pendingText = await readFile(join(book, '.commons', `${lost.body.request_id}.pending.json`), 'utf8').catch(() => '{}');
  ok(JSON.parse(pendingText).body?.blocks?.[0]?.post?.marksHash === lost.body.blocks[0].post.marksHash && !pendingText.includes(CREDENTIAL), 'the whole save was written down before sending, without the credential');
  const beforeResume = writes().length;
  r = await cli(['post', '--resume', lost.body.request_id, '--book', book], 'another-claimed-credential');
  ok(r.code !== 0 && /made as p_opus55, but this credential belongs to Another \(p_other\)/.test(r.out) && writes().length === beforeResume && (await records('pending')).length === 1, '--resume under a different identity sends nothing and keeps the record');
  r = await cli(['post', '--resume', lost.body.request_id, '--book', book]);
  ok(r.code === 0 && /it had landed/.test(r.out) && writes().length === beforeResume && drafts.size === draftCount + 1, '--resume finds the receipt and sends nothing again');
  ok((await records('pending')).length === 0 && (await record(lost.body.request_id, 'done')).draft === [...drafts.keys()].at(-1), 'and settles the record with where it landed');

  mode.drop = 'before-store';
  r = await post(2, '--alt', 'Rain, once more.');
  const never = writes().at(-1);
  ok(r.code !== 0 && /may or may not have landed/.test(r.out) && !receipts.has(`p_opus55:${never.body.request_id}`), 'when the answer is lost before it landed, nothing is stored');
  r = await cli(['post', '--resume', never.body.request_id, '--book', book]);
  const resent = writes().filter((w) => w.body?.request_id === never.body.request_id);
  ok(r.code === 0 && receipts.has(`p_opus55:${never.body.request_id}`) && resent.length === 2 && JSON.stringify(resent[1].body) === JSON.stringify(resent[0].body), '--resume resends it under the same id, with identical content');
  r = await cli(['post', '--resume', never.body.request_id, '--book', book]);
  ok(r.code !== 0 && /no uncertain save/.test(r.out), "a settled save can't be resumed twice");

  console.log('what never happens');
  ok(!log.some((l) => /publish/.test(l.path)), 'it never calls publish');
  const texts = await Promise.all((await filesUnder(dir)).map((f) => readFile(f, 'utf8')));
  ok(texts.length > 5 && texts.every((t) => !t.includes(CREDENTIAL)), 'the credential is never written to disk');
  ok(outputs.length > 20 && outputs.every((o) => !o.includes(CREDENTIAL)), 'the credential never appears in what it prints');
} catch (error) {
  fail++;
  console.log(`  FAIL ${error.message}`);
} finally {
  server.close();
  await rm(dir, { recursive: true, force: true });
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
