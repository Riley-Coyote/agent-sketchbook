/** End-to-end local agent API, disk recovery, conflict isolation, and PNG/CLI checks. */
import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { once } from 'node:events';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import http from 'node:http';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const work = await mkdtemp(join(tmpdir(), 'sketch-studio-api-'));
const run = promisify(execFile);
let child, url;
async function start() {
  child = spawn(process.execPath, [join(ROOT, 'studio-server.mjs'), '--port', '0', '--data', join(work, 'data')], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '', errors = '';
  child.stderr.on('data', bytes => { errors += bytes; });
  await new Promise((resolveReady, reject) => {
    const timer = setTimeout(() => reject(new Error(`Studio start timed out: ${errors}`)), 10000);
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Studio exited ${code}: ${errors}`)); });
    child.stdout.on('data', bytes => {
      output += bytes;
      if (output.includes('\n')) {
        try { url = JSON.parse(output.split('\n')[0]).url; clearTimeout(timer); resolveReady(); }
        catch (error) { clearTimeout(timer); reject(error); }
      }
    });
  });
}
async function stop() {
  if (!child || child.exitCode !== null) return;
  const exited = once(child, 'exit');
  child.kill('SIGTERM');
  await exited;
}
const get = path => fetch(url + path);
const send = (path, body, headers = {}, method = 'POST') => fetch(url + path, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
async function state() { return (await get('/api/session')).json(); }
const point = (x, y, p, t) => ({ x, y, p, t, tiltX: 0, tiltY: 0 });
function pngPixels(bytes) {
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20), compressed = [];
  for (let offset = 8; offset < bytes.length;) {
    const length = bytes.readUInt32BE(offset), type = bytes.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') compressed.push(bytes.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const raw = inflateSync(Buffer.concat(compressed));
  assert.equal(raw.length, (width * 4 + 1) * height);
  for (let y = 0; y < height; y++) assert.equal(raw[y * (width * 4 + 1)], 0);
  return { width, height, raw };
}

try {
  await start();
  const original = await state();
  assert.equal(original.revision, 0);
  assert.equal(original.drawing.ops.length, 0);
  const foreignHostStatus = await new Promise((done, reject) => {
    const req = http.get(url + '/api/session', { headers: { Host: 'attacker.example' } }, response => { response.resume(); done(response.statusCode); });
    req.on('error', reject);
  });
  assert.equal(foreignHostStatus, 403);
  assert.equal((await send('/api/actions', { revision: 0, actions: [] }, { Origin: 'https://attacker.example' })).status, 403);
  assert.equal((await send('/api/actions', { revision: 0, actions: [] }, { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await get('/.git/config')).status, 403);
  assert.equal((await get('/studio-server.mjs')).status, 404);
  assert.equal((await get('/..%2f..%2fetc/passwd')).status, 403);
  assert.equal((await get('/material-engine.js')).status, 200);
  const blankPNG = await (await get('/api/inspect')).arrayBuffer();
  const blank = pngPixels(Buffer.from(blankPNG));
  assert.equal(blank.width, original.drawing.page.w);
  assert.equal(blank.height, original.drawing.page.h);
  assert.equal((await get('/api/inspect?x=-1')).status, 400);
  assert.equal((await get('/api/inspect?scale=4')).status, 400);
  assert.equal((await get('/api/inspect?w=0')).status, 400);
  assert.equal((await send('/api/actions', { revision: 0, actions: [{ type: 'select', tool: 'graphite-2b' }, { type: 'invalid-operation' }] })).status, 400);
  assert.deepEqual(await state(), original, 'entire invalid action batch leaves state and revision unchanged');
  let response = await send('/api/actions', { revision: 0, actions: [
    { type: 'select', tool: 'graphite-2b', options: { size: 7, strength: 1 } },
    { type: 'stroke', samples: [point(30, 50, 0.3, 0), point(130, 50, 0.9, 500)] },
    { type: 'review', observation: 'Higher pressure darkens the stroke.', lesson: 'Build midtones with several light passes.', next: 'Compare an angled pencil stroke.' },
  ] }, { Origin: url });
  assert.equal(response.status, 200, await response.clone().text());
  const drawn = await response.json();
  assert.equal(drawn.revision, 1);
  assert.ok(drawn.drawing.ops.length > 0);
  assert.equal(drawn.drawing.reviews.length, 1);
  response = await send('/api/session', { revision: 0, drawing: original.drawing }, {}, 'PUT');
  assert.equal(response.status, 409);
  assert.equal((await response.json()).revision, 1);
  assert.deepEqual(await state(), drawn);
  const inspect = await get('/api/inspect?x=20&y=30&w=140&h=50&scale=2');
  assert.equal(inspect.headers.get('x-sketchbook-revision'), '1');
  const cropped = pngPixels(Buffer.from(await inspect.arrayBuffer()));
  assert.equal(cropped.width, 280);
  assert.equal(cropped.height, 100);
  assert.ok(new Set(cropped.raw).size > 8, 'PNG contains drawn pigment variation');
  const beforeInvalid = await state();
  const malformed = structuredClone(beforeInvalid.drawing);
  malformed.ops.push({ k: 'm', tool: 'bad-tool', samples: [point(10, 10, 1, 0)] });
  assert.equal((await send('/api/session', { revision: 1, drawing: malformed }, {}, 'PUT')).status, 400);
  assert.deepEqual(await state(), beforeInvalid, 'invalid imported drawing leaves state untouched');
  const saved = await (await send('/api/save', { revision: 1, name: 'Pressure study' })).json();
  assert.equal(saved.revision, 2);
  assert.ok(saved.save.id);
  assert.equal((await (await get('/api/saves')).json()).saves.length, 1);
  response = await send('/api/actions', { revision: 2, actions: [{ type: 'undo' }] });
  assert.equal(response.status, 200);
  const undone = await response.json();
  assert.equal(undone.drawing.ops.length, 0, 'undo history survives API save and separate requests');
  response = await send('/api/actions', { revision: 3, actions: [{ type: 'redo' }] });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).drawing.ops.length, drawn.drawing.ops.length);
  const created = await (await send('/api/new', { revision: 4, title: 'Second page' })).json();
  assert.equal(created.revision, 5);
  assert.equal(created.drawing.ops.length, 0);
  assert.equal((await (await get('/api/lessons')).json()).lessons.length, 1, 'practice lesson persists into the next session');
  const loaded = await (await send('/api/load', { revision: 5, id: saved.save.id })).json();
  assert.equal(loaded.revision, 6);
  assert.deepEqual(loaded.drawing, drawn.drawing);
  const disk = JSON.parse(await readFile(join(work, 'data/active.json'), 'utf8'));
  assert.equal(disk.revision, 6);
  assert.deepEqual(disk.drawing, drawn.drawing);
  await stop();
  await start();
  assert.deepEqual(await state(), loaded, 'restart restores the durable active drawing and server revision');
  const cli = async (...args) => run(process.execPath, [join(ROOT, 'studio.mjs'), ...args, '--url', url], { cwd: ROOT });
  assert.equal(JSON.parse((await cli('status')).stdout).revision, 6);
  const pngPath = join(work, 'detail.png');
  const inspected = JSON.parse((await cli('inspect', '--x', '20', '--y', '30', '--w', '140', '--h', '50', '--out', pngPath)).stdout);
  assert.equal(inspected.path, pngPath);
  assert.equal(pngPixels(await readFile(pngPath)).width, 140);
  const actionsPath = join(work, 'actions.json');
  await writeFile(actionsPath, JSON.stringify([{ type: 'review', observation: 'The earlier pressure study is restored.', lesson: 'Saved checkpoints preserve material behavior.', next: 'Continue the same study.' }]));
  assert.equal(JSON.parse((await cli('actions', '--file', actionsPath)).stdout).revision, 7);
  await assert.rejects(cli('actions', '--file', actionsPath, '--revision', '6'), error => /Revision conflict/.test(error.stderr));
  const touching = await (await send('/api/actions', { revision: 7, actions: [{ type: 'touch', sample: point(160, 100, 0.5, 0) }] })).json();
  assert.ok(touching.drawing.active);
  const moved = await (await send('/api/actions', { revision: 8, actions: [{ type: 'move', samples: [point(250, 100, 0.8, 500)] }] })).json();
  assert.equal(moved.drawing.active.samples.length, 2, 'gesture remains active across motor requests');
  const lifted = await (await send('/api/actions', { revision: 9, actions: [{ type: 'lift' }] })).json();
  assert.equal(lifted.drawing.active, undefined);
  assert.equal(lifted.drawing.ops.length, drawn.drawing.ops.length + 1);
  const competing = await Promise.all([0, 1].map(i => send('/api/actions', { revision: 10, actions: [{ type: 'review', observation: `Concurrent review ${i}`, lesson: 'Inspect the current revision before writing.', next: 'Continue after checking for conflicts.' }] })));
  assert.deepEqual(competing.map(reply => reply.status).sort(), [200, 409], 'only one mutation can commit against a shared revision');
  const reviewed = await state();
  const lessonsBefore = (await (await get('/api/lessons')).json()).lessons;
  assert.equal(lessonsBefore.length, 3);
  const withoutReviews = { ...reviewed.drawing, reviews: [] };
  response = await send('/api/session', { revision: 11, drawing: withoutReviews }, {}, 'PUT');
  assert.equal(response.status, 200);
  assert.deepEqual((await (await get('/api/lessons')).json()).lessons, lessonsBefore, 'lessons survive later drawing replacement independently of checkpoint history');
  await stop();
  const damaged = '{"incomplete":';
  await writeFile(join(work, 'data/active.json'), damaged);
  await assert.rejects(run(process.execPath, [join(ROOT, 'studio-server.mjs'), '--port', '0', '--data', join(work, 'data')]), error => /Cannot restore the live sheet from active.json/.test(error.stderr));
  assert.equal(await readFile(join(work, 'data/active.json'), 'utf8'), damaged, 'startup never replaces an unreadable drawing with a blank sheet');
  console.log('Studio API: transactional actions, revision conflicts, safe loopback/static access, PNG crops, durable saves/lessons, restart recovery, and CLI passed.');
} finally {
  await stop();
  await rm(work, { recursive: true, force: true });
}
