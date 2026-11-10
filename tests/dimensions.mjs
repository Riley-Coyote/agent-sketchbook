/* node tests/dimensions.mjs — dimensions survive sandboxing and book persistence. */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LIMITS, sanitizeOps, sanitizePageDimensions, limitsForPage } from '../validate.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const run = promisify(execFile);
const stroke = (x, y) => ({ k: 's', pts: [[0, 0], [x, y]], layer: 'line', brush: 'liner', w: 0.5 });

assert.deepEqual(sanitizePageDimensions().page, { w: 880, h: 660 });
assert.deepEqual(limitsForPage({ w: 880, h: 660 }), LIMITS);
for (const input of [null, [], 'large', {}, { w: 880 }, { w: -1, h: 660 }, { w: 0, h: 1 }, { w: 10.5, h: 20 }, { w: '880', h: 660 }, { w: Infinity, h: 1 }, { w: 4097, h: 1 }, { w: 4096, h: 2048 }]) {
  const result = sanitizePageDimensions(input);
  assert.equal(result.page, null, `reject dimensions ${JSON.stringify(input)}`);
  assert.ok(result.errors.length);
}
const large = { w: 2560, h: 1440 };
assert.deepEqual(sanitizePageDimensions(large).page, large);
assert.ok(sanitizeOps([stroke(2480, 1380)], limitsForPage(large)).ops);
assert.equal(sanitizeOps([stroke(2480, 1380)]).ops, null);
assert.equal(sanitizeOps([stroke(large.w + 401, 10)], limitsForPage(large)).ops, null);
assert.equal(limitsForPage({ w: 600, h: 600 }).maxOps, LIMITS.maxOps);
assert.ok(limitsForPage(large).maxOps > LIMITS.maxOps);

const fixtures = await mkdtemp(join(ROOT, 'tests', 'dimension-fixtures-'));
const book = await mkdtemp(join(tmpdir(), 'sketchbook-dimensions-'));
const tool = (...args) => run(process.execPath, [join(ROOT, 'book.mjs'), ...args, '--book', book], { cwd: ROOT });
const pageModule = (page, op) => `export default ${JSON.stringify({ title: 'dimension test', date: '2026-09-04', note: 'Testing page dimensions across the sandbox and persistence boundary.', paper: 'night', ...(page === undefined ? {} : { page }) }).replace(/}$/, '')}, build() { return ${JSON.stringify([op])}; } };\n`;
try {
  const legacySource = join(fixtures, 'legacy.js');
  const largeSource = join(fixtures, 'large.js');
  const invalidSource = join(fixtures, 'invalid.js');
  await writeFile(legacySource, pageModule(undefined, stroke(800, 600)));
  await writeFile(largeSource, pageModule(large, stroke(2480, 1380)));
  await writeFile(invalidSource, pageModule({ w: 4096, h: 2048 }, stroke(10, 10)));
  const compiled = await run(process.execPath, ['--experimental-vm-modules', '--no-warnings', join(ROOT, 'sandbox.mjs'), largeSource]);
  assert.deepEqual(JSON.parse(compiled.stdout).meta.page, large);
  await tool('init', '--owner', 'dimension test');
  await tool('write', legacySource);
  await tool('write', largeSource, '--refs', '1');
  const index = JSON.parse(await readFile(join(book, 'book.json'), 'utf8'));
  assert.deepEqual(index.pages.map(p => p.page), [{ w: 880, h: 660 }, large]);
  const saved = JSON.parse(await readFile(join(book, 'pages', '002.json'), 'utf8'));
  assert.deepEqual(saved.page, large);
  assert.deepEqual(saved.ops[0].pts.at(-1), [2480, 1380]);
  assert.deepEqual(saved.refs, [1]);
  const read = JSON.parse((await tool('read', '2')).stdout);
  assert.deepEqual(read.page, large);
  await assert.rejects(tool('write', invalidSource), error => error.code === 1 && /dimensions were rejected/.test(error.stderr));
  const unchanged = JSON.parse(await readFile(join(book, 'book.json'), 'utf8'));
  assert.equal(unchanged.pages.length, 2, 'invalid dimensions do not append a page');
  console.log('Page dimension defaults, bounds, sandbox metadata, coordinate limits, persistence and readback passed.');
} finally {
  await rm(fixtures, { recursive: true, force: true });
  await rm(book, { recursive: true, force: true });
}
