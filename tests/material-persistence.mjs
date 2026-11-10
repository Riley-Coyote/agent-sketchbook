/* node tests/material-persistence.mjs — paper and gestures survive the book boundary. */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, readdir, rm, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { compilePage } from '../page-program.js';
import { surfaceIsLight, LAYERS } from '../mark-engine.js';
import { sanitizeSurface, sanitizeOps, sanitizePageMeta, sanitizePageDimensions, sanitizeMotion, countFrames, limitsForPage } from '../validate.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const run = promisify(execFile);
const dimensions = { w: 240, h: 180 };
const surface = { version: 1, paper: 'white', tooth: 0.61728395, seed: 4294967295 };
const gesture = {
  k: 'm', tool: 'graphite-2b', size: 2.123456789, strength: 0.823456789,
  samples: [
    { x: 10.0123456789, y: 20.0123456789, p: 0.123456789, tiltX: -23.123456789, tiltY: 31.987654321, t: 0.0123456789 },
    { x: 220.987654321, y: 160.987654321, p: 0.987654321, tiltX: 61.123456789, tiltY: -11.987654321, t: 1134.123456789 },
  ],
};
const materialOps = [{ k: 'phase', name: 'pressure study', ms: 0 }, gesture, { k: 'clean', tool: 'stump' }];
const legacyOp = { k: 's', pts: [[10.012345, 20.012345], [220.987654, 160.987654]], layer: 'line', brush: 'liner', w: 0.512345 };
assert.equal(sanitizeSurface().surface, undefined, 'an absent surface remains absent');
assert.deepEqual(sanitizeSurface(surface).surface, surface);
assert.deepEqual(sanitizeOps(materialOps, limitsForPage(dimensions, surface)).ops, materialOps);
assert.equal(sanitizeOps(materialOps, limitsForPage(dimensions)).ops, null, 'material marks require opt-in');
assert.equal(sanitizeOps([legacyOp], limitsForPage(dimensions, surface)).ops, null, 'a material page does not silently change old marks');

const fixtures = await mkdtemp(join(ROOT, 'tests', 'material-fixtures-'));
const book = await mkdtemp(join(tmpdir(), 'sketchbook-materials-'));
const tool = (...args) => run(process.execPath, [join(ROOT, 'book.mjs'), ...args, '--book', book], { cwd: ROOT });
const moduleSource = (paper, ops) => {
  const meta = { title: 'material persistence', date: '2026-09-05', note: 'A pressure study that retains exact gesture samples and paper.', page: dimensions, ...(paper === undefined ? {} : { surface: paper }) };
  return `import { MarkEngine } from '../../mark-engine.js';\nexport default ${JSON.stringify(meta).slice(0, -1)}, build() { return ${JSON.stringify(ops)}; } };\n`;
};
const writeSource = async (name, paper, ops = materialOps) => {
  const path = join(fixtures, name + '.js');
  await writeFile(path, moduleSource(paper, ops));
  return path;
};

/* A new page names its paper, so a page on the original canvas is one already
 * in a book: page 1, written as the tool has always written it. Continuing it
 * is how a module with no paper is saved now. */
const ground = { k: 'phase', name: 'ground', ms: 0 };
const originalCanvasPage = async () => {
  const hash = (v) => createHash('sha256').update(typeof v === 'string' ? v : JSON.stringify(v)).digest('hex');
  const index = JSON.parse(await readFile(join(book, 'book.json'), 'utf8'));
  const source = 'export default { title: "ground", note: "an original-canvas page", page: { w: 240, h: 180 }, build: () => [{ k: "phase", name: "ground", ms: 0 }] };\n';
  const meta = { index: 1, file: 'pages/001.json', title: 'ground', date: '2026-09-05', note: 'an original-canvas page', refs: [], seed: 1, page: dimensions, module: 'tests/ground.js', opCount: 1, points: 0, state: 'drawn', stage: 'study' };
  await mkdir(join(book, 'pages'), { recursive: true });
  await writeFile(join(book, meta.file), JSON.stringify({ ...meta, journal: { version: 1, sourceHash: hash(source), marksHash: hash([ground]), passes: [] }, source, ops: [ground] }));
  index.pages.push(meta);
  await writeFile(join(book, 'book.json'), JSON.stringify(index, null, 2) + '\n');
};

// Exercise the actual viewer controllers with inert canvases; rendering is tested by the engine suite.
class EngineProbe {
  constructor({ width, height, dpr, surface }) { Object.assign(this, { w: width, h: height, dpr, surface, total: 0 }); }
  load(ops) { this.ops = ops; this.loads = (this.loads || 0) + 1; this.done = false; return this; }
  finish() { this.done = true; return this; }
  append(ops) { this.ops = this.ops.concat(ops); this.appends = (this.appends || 0) + 1; return this; }
  replay() { this.done = false; return this; }
  composite() {}
}
const node = () => ({
  style: { setProperty() {} }, dataset: {}, children: [], hidden: false, classList: {toggle() {}}, append() {},
  getContext: () => ({}), setAttribute() {},
  replaceChildren(...children) { this.children = children; },
});
const validation = { sanitizeSurface, sanitizeOps, sanitizePageMeta, sanitizePageDimensions, sanitizeMotion, countFrames, limitsForPage };
async function checkViewerTransitions() {
  class ElementProbe {
    attachShadow() {
      const nodes = new Map();
      return this.shadowRoot = { querySelector: selector => {
        if (!nodes.has(selector)) nodes.set(selector, node());
        return nodes.get(selector);
      } };
    }
    hasAttribute() { return false; }
    dispatchEvent(event) { this.lastEvent = event; }
  }
  const source = (await readFile(join(ROOT, 'sketch-page.js'), 'utf8'))
    .replace(/^import .*;$/gm, '').replace('export class SketchPage', 'class SketchPage');
  const context = vm.createContext({ ...validation, surfaceIsLight, MarkEngine: EngineProbe, HTMLElement: ElementProbe, customElements: { get: () => true }, CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } } });
  vm.runInContext(source + '\nthis.SketchPage = SketchPage;', context);
  const element = new context.SketchPage();
  const set = (paper, ops = materialOps) => { element.ops = { page: dimensions, surface: paper, ops }; };
  set(undefined, [legacyOp]);
  const legacy = element.engine;
  set(surface);
  assert.notEqual(element.engine, legacy, 'same-size material page gets a material engine');
  assert.deepEqual(element.engine.surface, surface);
  const material = element.engine;
  set({ ...surface });
  assert.equal(element.engine, material, 'equivalent surfaces reuse the engine');
  const before = element.ops;
  set({ ...surface, paper: 'invalid' });
  assert.equal(element.engine, material);
  assert.equal(element.ops, before, 'invalid paper leaves the previous page intact');
  assert.equal(element.lastEvent.type, 'sketch-error');
  set({ ...surface, tooth: 0.2 });
  assert.notEqual(element.engine, material, 'changed paper tooth recreates the surface');
  const changed = element.engine;
  set(undefined, [legacyOp]);
  assert.notEqual(element.engine, changed, 'returning to an old page removes material simulation');
  assert.equal(element.engine.surface, undefined);
  assert.equal(Object.hasOwn(element.meta, 'surface'), false);

  let candidate = { build() {return this.passes.flatMap(p=>p.build());}, title: 'test', page: dimensions, surface, passes: [{ name: 'first', note: 'inspect', build: () => materialOps }] };
  const nodes = new Map();
  const document = { getElementById: id => {
    if (!nodes.has(id)) nodes.set(id, node());
    return nodes.get(id);
  }, createElement: node };
  const controller = (await readFile(join(ROOT, 'atelier.js'), 'utf8'))
    .replace(/^import .*;$/gm, '')
    .replace(/await import\(`\.\/pages\/\$\{name\}\.js\?v=\$\{Date\.now\(\)\}-\$\{version\+\+\}`\)/, 'await getCandidate()');
  const atelierContext = vm.createContext({ ...validation, compilePage, loadFonts: async () => {}, MarkEngine: EngineProbe, LAYERS, document, URLSearchParams, location: { search: '?p=test' }, requestAnimationFrame() {}, getCandidate: () => ({ default: candidate }) });
  const atelier = await vm.runInContext(`(async () => { ${controller}\nreturn { load, snapshot: () => ({ engine, passes, allOps, currentSurface }) }; })()`, atelierContext);
  const first = atelier.snapshot();
  await atelier.load();
  assert.equal(atelier.snapshot().engine, first.engine);
  assert.equal(first.engine.loads, 1, 'unchanged material source does not repaint pigment');
  candidate = { ...candidate, passes: [...candidate.passes, { name: 'second', note: 'more pressure', build: () => [gesture] }] };
  await atelier.load();
  assert.equal(atelier.snapshot().engine, first.engine);
  assert.equal(first.engine.appends, 1, 'adding a pass retains and appends to the material surface');
  const complete = atelier.snapshot();
  candidate = { ...candidate, surface: { ...surface, version: 3 } };
  await atelier.load();
  assert.equal(atelier.snapshot().engine, complete.engine);
  assert.equal(atelier.snapshot().passes, complete.passes, 'bad paper metadata preserves previous pass controls');
  assert.equal(atelier.snapshot().allOps, complete.allOps);
  candidate = { ...candidate, surface: { ...surface, paper: 'toned' } };
  await atelier.load();
  assert.equal(atelier.snapshot().engine, complete.engine, 'paper edits cannot silently clear a continuing canvas');
  await atelier.load(true);
  assert.notEqual(atelier.snapshot().engine, complete.engine, 'explicit new version recreates the surface');
  assert.equal(atelier.snapshot().currentSurface.paper, 'toned');
}

try {
  await tool('init', '--owner', 'material persistence test');
  await originalCanvasPage();
  const legacy = await writeSource('legacy', undefined, [ground, legacyOp]);
  await tool('write', legacy, '--continue', '1');
  const savedLegacy = JSON.parse(await readFile(join(book, 'pages', '002.json'), 'utf8'));
  assert.equal(Object.hasOwn(savedLegacy, 'surface'), false, 'old format remains free of surface metadata');
  assert.deepEqual(savedLegacy.ops, [ground, { ...legacyOp, pts: [[10, 20], [221, 161]], w: 0.51 }], 'legacy precision behavior remains unchanged');

  for (const [i, paper] of ['white', 'toned', 'black'].entries()) {
    const inputSurface = { ...surface, paper, ignoredMetadata: 'discard me' };
    const expectedSurface = { ...surface, paper };
    const source = await writeSource(paper, inputSurface);
    const compiled = await run(process.execPath, ['--experimental-vm-modules', '--no-warnings', join(ROOT, 'sandbox.mjs'), source]);
    const built = JSON.parse(compiled.stdout);
    assert.deepEqual(built.meta.surface, inputSurface, 'sandbox carries the complete surface to validation');
    assert.deepEqual(built.ops, materialOps, 'sandbox retains pressure, tilt, timing and coordinates');
    // Both supported build paths cross the same validation boundary.
    await tool('write', source, '--refs', '1', ...(paper === 'black' ? ['--unsafe'] : []));
    const number = i + 3;
    const saved = JSON.parse(await readFile(join(book, 'pages', String(number).padStart(3, '0') + '.json'), 'utf8'));
    assert.deepEqual(saved.surface, expectedSurface);
    assert.deepEqual(saved.ops, materialOps, 'book persistence does not round away fine motor control');
    assert.deepEqual(saved.refs, [1]);
    assert.equal(saved.points, gesture.samples.length);
    const read = JSON.parse((await tool('read', String(number))).stdout);
    assert.deepEqual(read.surface, expectedSurface, 'read exposes the recorded paper settings');
  }

  const before = await readFile(join(book, 'book.json'), 'utf8');
  const invalidSurfaces = [null, {}, { ...surface, version: 3 }, { ...surface, paper: 'blue' }, { ...surface, tooth: 1.01 }, { ...surface, seed: -1 }, { ...surface, seed: 4294967296 }];
  for (const [i, invalidSurface] of invalidSurfaces.entries()) {
    const source = await writeSource('invalid-surface-' + i, invalidSurface);
    await assert.rejects(tool('write', source), error => error.code === 1 && /surface.*rejected/.test(error.stderr));
  }
  for (const [name, paper, ops, relation] of [['material-on-legacy', undefined, materialOps, ['--continue', '1']], ['legacy-on-material', surface, [legacyOp], []]]) {
    const source = await writeSource(name, paper, ops);
    await assert.rejects(tool('write', source, ...relation), error => error.code === 1 && /marks were rejected/.test(error.stderr));
  }
  assert.equal(await readFile(join(book, 'book.json'), 'utf8'), before, 'rejected pages leave the index byte-for-byte intact');
  assert.equal((await readdir(join(book, 'pages'))).length, 5, 'rejected pages do not leave orphaned page files');
  const index = JSON.parse(before);
  assert.equal(Object.hasOwn(index.pages[0], 'surface') || Object.hasOwn(index.pages[1], 'surface'), false);
  assert.deepEqual(index.pages.slice(2).map(page => page.surface.paper), ['white', 'toned', 'black']);
  await checkViewerTransitions();
  console.log('Surface metadata, sandbox imports, exact gestures, safe/unsafe roundtrips, legacy preservation, rejected-write atomicity and viewer surface transitions passed.');
} finally {
  await rm(fixtures, { recursive: true, force: true });
  await rm(book, { recursive: true, force: true });
}
