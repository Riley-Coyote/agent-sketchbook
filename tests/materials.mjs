/* node tests/materials.mjs — behavior of the paper, drawing hand and replay. */
import assert from 'node:assert/strict';
import { MaterialSurface } from '../material-engine.js';
import { MarkEngine } from '../mark-engine.js';
import { SketchSession } from '../sketch-session.js';

const page = { w: 160, h: 100 };
const surface = { version: 1, paper: 'white', tooth: .72, seed: 41 };
const fields = ['dark', 'darkLoose', 'light', 'lightLoose'];
const sheet = (settings = {}) => new MaterialSurface({ width: page.w, height: page.h, surface: { ...surface, ...settings } });
const session = () => new SketchSession({ page, surface, title: 'Material behavior study' });
const sample = (x, y, p = .6, t = 0, tiltX = 0, tiltY = 0) => ({ x, y, p, t, tiltX, tiltY });
const stroke = (tool, samples, size = 6, strength = 1) => ({ k: 'm', tool, size, strength, samples });
const line = (p = .6, time = 800) => [sample(20, 50, p), sample(140, 50, p, time)];
const sum = values => values.reduce((total, value) => total + value, 0);
const mass = (material, includeCarrier = false) => fields.reduce((total, field) => total + sum(material[field]), 0) + (includeCarrier ? material.carrier.dark + material.carrier.light : 0);
const state = material => ({ ...Object.fromEntries(fields.map(field => [field, material[field].slice()])), carrier: { ...material.carrier } });
const samePigment = (a, b, message) => assert.deepEqual(state(a), state(b), message);
const regionMass = (material, left, top, right, bottom) => {
  let total = 0;
  for (let y = Math.ceil(top * material.scaleY); y < bottom * material.scaleY; y++) {
    for (let x = Math.ceil(left * material.scaleX); x < right * material.scaleX; x++) {
      const i = y * material.width + x;
      for (const field of fields) total += material[field][i];
    }
  }
  return total;
};
const coverage = (material, threshold = .01) => {
  let count = 0;
  for (let i = 0; i < material.dark.length; i++) if (material.dark[i] + material.darkLoose[i] + material.light[i] + material.lightLoose[i] > threshold) count++;
  return count;
};
const bounds = material => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let y = 0; y < material.height; y++) for (let x = 0; x < material.width; x++) {
    const i = y * material.width + x;
    if (material.dark[i] + material.darkLoose[i] > 1e-7) {
      minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
  }
  return { w: maxX - minX + 1, h: maxY - minY + 1 };
};
const meanLight = pixels => {
  let total = 0;
  for (let i = 0; i < pixels.data.length; i += 4) total += (pixels.data[i] + pixels.data[i + 1] + pixels.data[i + 2]) / 3;
  return total / (pixels.width * pixels.height);
};

// The same gesture responds to authored contact, rather than an automatic taper.
{
  const faint = sheet(), heavy = sheet(), lifted = sheet();
  faint.run(stroke('graphite-2b', line(.18)));
  heavy.run(stroke('graphite-2b', line(.85)));
  lifted.run(stroke('graphite-2b', line(0)));
  assert.ok(mass(heavy) > mass(faint) * 2, 'greater pressure deposits visibly more pigment');
  assert.ok(coverage(heavy) > coverage(faint), 'greater pressure enlarges contact');
  assert.equal(mass(lifted), 0, 'zero pressure has no paper contact');
  assert.ok(meanLight(heavy.pixels({ x: 20, y: 46, w: 120, h: 8 })) < meanLight(faint.pixels({ x: 20, y: 46, w: 120, h: 8 })), 'the rendered pressured stroke is darker');

  const upright = sheet(), tiltedX = sheet(), tiltedY = sheet();
  upright.run(stroke('graphite-6b', [sample(80, 50, .7)], 10));
  tiltedX.run(stroke('graphite-6b', [sample(80, 50, .7, 0, 75, 0)], 10));
  tiltedY.run(stroke('graphite-6b', [sample(80, 50, .7, 0, 0, 75)], 10));
  assert.ok(bounds(tiltedX).w > bounds(upright).w * 2, 'tilting lays the side of the pencil across the sheet');
  assert.ok(bounds(tiltedX).w > bounds(tiltedX).h * 2, 'horizontal tilt has a wide footprint');
  assert.ok(bounds(tiltedY).h > bounds(tiltedY).w * 2, 'rotating the tilt rotates the footprint');

  const fast = sheet(), slow = sheet();
  fast.run(stroke('graphite-2b', line(.6, 80)));
  slow.run(stroke('graphite-2b', line(.6, 2400)));
  assert.ok(mass(slow) > mass(fast), 'slower travel deposits more pigment over the same path');
  const dab = sheet(), held = sheet();
  dab.run(stroke('graphite-2b', [sample(80, 50)], 8));
  held.run(stroke('graphite-2b', [sample(80, 50), sample(80, 50, .6, 900)], 8));
  assert.ok(mass(held) > mass(dab) * 3, 'stationary contact darkens the held point');
}

// Repeated work meets the same tooth and accumulates instead of replacing marks.
{
  const paper = sheet(), tooth = paper.tooth.slice();
  const pass = stroke('vine-charcoal', line(.28), 12);
  paper.run(pass);
  const firstMass = mass(paper), firstCoverage = coverage(paper, .035);
  const firstLight = meanLight(paper.pixels());
  for (let i = 0; i < 5; i++) paper.run(pass);
  assert.deepEqual(paper.tooth, tooth, 'successive strokes encounter identical paper grain');
  assert.ok(mass(paper) > firstMass * 3, 'repeated passes build pigment');
  assert.ok(coverage(paper, .035) > firstCoverage, 'more grain crosses a visible deposit threshold');
  assert.ok(meanLight(paper.pixels()) < firstLight, 'built-up grain is visible in rendered paper');
  assert.deepEqual(sheet().tooth, tooth, 'seeded paper can be restored exactly');
  assert.notDeepEqual(sheet({ seed: 42 }).tooth, tooth, 'a different sheet seed changes its grain');
  paper.clear();
  assert.equal(mass(paper, true), 0);
  assert.deepEqual(paper.tooth, tooth, 'clearing marks preserves the sheet');

  const black = sheet({ paper: 'black' });
  const before = meanLight(black.pixels({ x: 20, y: 44, w: 120, h: 12 }));
  black.run(stroke('white-chalk', line(.85), 10));
  assert.ok(sum(black.light) + sum(black.lightLoose) > 0);
  assert.equal(sum(black.dark) + sum(black.darkLoose), 0);
  assert.ok(meanLight(black.pixels({ x: 20, y: 44, w: 120, h: 12 })) > before + 10, 'white chalk brightens black paper');
  assert.ok(black.pixels().data.every((value, i) => i % 4 !== 3 || value === 255), 'paper remains opaque');
}

// Blending transports actual loose pigment and never creates a grey paint stroke.
{
  const blank = sheet();
  const smear = stroke('stump', [sample(40, 50, .8), sample(122, 50, .8, 1300)], 16);
  blank.run(smear);
  assert.equal(mass(blank, true), 0, 'a clean stump cannot mark blank paper');
  const blend = sheet();
  blend.run(stroke('vine-charcoal', [sample(28, 50, .9), sample(48, 50, .9, 1000)], 14));
  blend.run(stroke('white-chalk', [sample(35, 50, .6), sample(48, 50, .6, 600)], 8));
  assert.equal(regionMass(blend, 75, 40, 130, 60), 0);
  const before = mass(blend, true), beforeSource = regionMass(blend, 28, 40, 48, 60);
  blend.run(smear);
  assert.ok(regionMass(blend, 75, 40, 130, 60) > .01, 'stump carries source pigment into formerly blank paper');
  assert.ok(regionMass(blend, 28, 40, 48, 60) < beforeSource, 'source loses loose pigment as it is picked up');
  assert.ok(blend.carrier.dark > 0 && blend.carrier.light > 0, 'stump carries both dark and light pigment');
  assert.ok(Math.abs(mass(blend, true) - before) / before < 1e-6, 'sheet plus stump conserves pigment during blending');
  const deposits = state(blend);
  blend.clean();
  assert.deepEqual(blend.carrier, { dark: 0, light: 0 });
  for (const field of fields) assert.deepEqual(blend[field], deposits[field], 'cleaning the stump does not erase the sheet');
}

{
  const source = sheet();
  source.run(stroke('compressed-charcoal', line(.7), 14));
  source.run(stroke('graphite-2b', line(.65), 8));
  const kneaded = source.clone(), precise = source.clone();
  const before = mass(source);
  kneaded.run(stroke('kneaded-eraser', line(.7), 10));
  precise.run(stroke('precision-eraser', line(.7), 10));
  const gentleLift = before - mass(kneaded), firmLift = before - mass(precise);
  assert.ok(gentleLift > 0 && firmLift > gentleLift * 1.2, 'kneaded lifting is gentler than a precision eraser at equal pressure and size');
  assert.ok(meanLight(precise.pixels()) > meanLight(kneaded.pixels()), 'firmer erasure reveals more paper');
  assert.equal(mass(source), before, 'editing a clone cannot affect its source pigment');
}

const timedGesture = [
  sample(20.124, 20.987, .08, 13.25, 0, 0),
  sample(55.333, 36.875, .65, 211.75, 42, 5),
  sample(84.5, 65.125, .9, 600.5, 22, -11),
  sample(84.5, 65.125, .4, 811.875, 50, 9),
  sample(137.25, 40.125, .01, 1101.125, 0, 0),
];

// All ways of moving the hand must leave exactly the same pigment, not just a similar PNG.
{
  const live = session().select('graphite-6b', { size: 5.25, strength: .82 });
  live.touch(timedGesture[0]);
  live.move(timedGesture.slice(1, 3));
  live.move(timedGesture.slice(3));
  const whileTouching = state(live.material);
  live.lift();
  assert.deepEqual(state(live.material), whileTouching, 'lifting records the gesture without repainting it');
  const replay = sheet();
  replay.run(live.ops[0]);
  samePigment(live.material, replay, 'streamed touch/move/lift equals the recorded full stroke exactly');
  const fullStroke = session().select('graphite-6b', { size: 5.25, strength: .82 }).stroke(timedGesture);
  samePigment(live.material, fullStroke.material, 'stroke and live contact use the same deposition');
  assert.deepEqual(live.pixels().data, fullStroke.pixels().data);

  const first = state(live.material);
  live.select('vine-charcoal', { size: 11 }).stroke(line(.7));
  live.select('stump', { size: 15 }).stroke([sample(80, 50, .6), sample(130, 60, .7, 900)]);
  const final = state(live.material);
  live.undo().undo();
  assert.deepEqual(state(live.material), first, 'undo restores deposits and stump state exactly');
  live.redo().redo();
  assert.deepEqual(state(live.material), final, 'redo restores the complete finished state exactly');
  live.replay();
  assert.deepEqual(state(live.material), final, 'session replay is deterministic');
}

{
  const originalDocument = globalThis.document;
  globalThis.document = { createElement: () => ({ getContext: () => ({ scale() {}, setTransform() {}, clearRect() {} }) }) };
  try {
    const ops = [
      { k: 'phase', name: 'drawing', ms: 0 },
      stroke('vine-charcoal', timedGesture, 10),
      { k: 'p', ms: 13 },
      stroke('stump', [sample(50, 35, .7), sample(115, 60, .6, 523.33)], 13),
      { k: 'clean', tool: 'stump' },
      stroke('graphite-2b', [sample(42.5, 70.2, .7, 10.5)], 3),
      stroke('kneaded-eraser', [sample(80, 55, .6), sample(80, 55, .6, 222)], 9),
    ];
    const make = dpr => new MarkEngine({ width: page.w, height: page.h, dpr, surface });
    const finished = make(2).load(ops).finish();
    const animated = make(.5).load(ops).replay();
    const steps = [.007, .013, .032, .019];
    for (let i = 0; animated.cursor && i < 10000; i++) animated.tick(steps[i % steps.length], 1);
    assert.ok(animated.done && !animated.cursor, 'irregular replay ticks finish');
    samePigment(animated.material, finished.material, 'animated replay applies each sample exactly once, independent of display resolution');
    const growing = make(1).load(ops.slice(0, 3)).finish();
    growing.append(ops.slice(3), { animate: true });
    for (let i = 0; growing.cursor && i < 10000; i++) growing.tick(.017, 3);
    samePigment(growing.material, finished.material, 'animated append preserves earlier pigment and stump behavior');
  } finally {
    if (originalDocument === undefined) delete globalThis.document; else globalThis.document = originalDocument;
  }
}

// Invalid direct commands and rejected atomic batches preserve the current hand and sheet.
{
  const live = session().select('graphite-6b', { size: 4 }).touch(timedGesture[0]).move(timedGesture.slice(1, 3));
  const clone = live.clone();
  clone.move(timedGesture.slice(3)).lift();
  assert.ok(live.active && !clone.active, 'cloning does not lift the original hand');
  assert.equal(live.export().active.samples.length, 3);
  assert.notDeepEqual(state(live.material), state(clone.material), 'clone movement edits an independent pigment buffer');
  const before = live.export(), pigments = state(live.material), revision = live.revision;
  assert.throws(() => live.apply([
    { type: 'move', samples: [timedGesture[3]] },
    { type: 'move', samples: [sample(100, 70, -.01, 950)] },
  ]), /pressure|sample/);
  assert.deepEqual(live.export(), before, 'a later failing atomic action preserves active gesture and metadata');
  assert.deepEqual(state(live.material), pigments, 'a failed atomic batch cannot leave partial pigment');
  assert.equal(live.revision, revision, 'rejected commands emit no successful revision');
  for (const invalid of [-.01, 1.01, NaN, Infinity, '0.5']) {
    assert.throws(() => live.move([sample(110, 70, invalid, 1000)]), /pressure|sample/);
    assert.deepEqual(live.export(), before);
    assert.deepEqual(state(live.material), pigments);
  }
  live.undo();
  assert.equal(live.active, false);
  assert.equal(mass(live.material), 0, 'undo during contact cancels the unfinished stroke');
  for (const invalid of [-.1, 1.1, NaN, Infinity, '0.2']) {
    const beforeInvalid = live.export();
    assert.throws(() => live.touch(sample(50, 50, invalid)), /pressure|sample/);
    assert.throws(() => live.stroke([sample(20, 20), sample(100, 50, invalid, 300)]), /pressure|sample/);
    assert.deepEqual(live.export(), beforeInvalid);
    assert.equal(mass(live.material), 0, 'invalid touch or stroke cannot change paper');
  }
  assert.throws(() => live.stroke([sample(10, 10, .5, 200), sample(30, 30, .5, 199)]), /time|sample/);
  assert.throws(() => live.stroke([sample(10, 10, .5, 0, 91)]), /tilt|sample/);
}

// Study notes, checkpoints, tools and unfinished contact are part of the drawing's durable record.
{
  const original = session().select('graphite-hb', { size: 2.125, strength: .78 }).stroke(line(.4));
  original.review({ observation: 'The lighter pass leaves paper tooth visible.', lesson: 'Use several passes for middle values.', next: 'Try the side of a softer pencil.', region: { x: 15, y: 40, w: 130, h: 20 } });
  original.select('graphite-6b', { size: 7.5, strength: .62 }).stroke(timedGesture).undo();
  original.touch(sample(80, 30, .1, 0));
  const exported = original.export();
  const restored = session().import(exported);
  assert.deepEqual(restored.export(), exported, 'import preserves reviews, tools, redo and active contact');
  samePigment(restored.material, original.material, 'import reconstructs exactly the same working pigment');
  assert.equal(restored.reviews[0].tool, 'graphite-hb', 'review records the tool used at that checkpoint');
  assert.equal(restored.reviews[0].settings.size, 2.125);
  exported.ops[0].samples[0].p = 0;
  exported.reviews[0].lesson = 'changed outside the sheet';
  assert.equal(original.ops[0].samples[0].p, .4, 'export returns an independent record');
  assert.notEqual(original.reviews[0].lesson, exported.reviews[0].lesson);

  const baseline = restored.export(), baselinePigment = state(restored.material), revision = restored.revision;
  const corruptions = [
    drawing => { drawing.ops[0].samples[0].p = -.01; },
    drawing => { drawing.ops[0].samples[1].t = drawing.ops[0].samples[0].t; },
    drawing => { drawing.active.samples[0].tiltX = 91; },
    drawing => { drawing.active = { k: 'clean', tool: 'stump' }; },
    drawing => { drawing.active = { k: 'phase', name: 'invalid contact', ms: 0 }; },
    drawing => { drawing.surface.version = 2; },
    drawing => { delete drawing.surface; },
    drawing => { drawing.reviews[0].at = -1; },
    drawing => { drawing.reviews[0].region.w = page.w + 1; },
  ];
  for (const corrupt of corruptions) {
    const candidate = structuredClone(baseline);
    corrupt(candidate);
    assert.throws(() => restored.import(candidate), 'corrupt records must be rejected');
    assert.deepEqual(restored.export(), baseline, 'a rejected import retains the working drawing and review history');
    assert.deepEqual(state(restored.material), baselinePigment);
    assert.equal(restored.revision, revision);
  }
  assert.throws(() => restored.pixels({ x: 150, y: 0, w: 20, h: 20 }), /inspection/);
  assert.throws(() => restored.pixels({ scale: 100 }), /inspection/);
  assert.throws(() => restored.pixels({ x: 0, y: 0, w: 1e-10, h: 100, scale: 1e6 }), /inspection/, 'the actual rounded output dimensions must satisfy the pixel budget');
  const maximumCrop = restored.pixels({ x: 0, y: 0, w: 100, h: 100, scale: 20 });
  assert.equal(maximumCrop.width, 2000);
  assert.equal(maximumCrop.height, 2000);
  assert.equal(maximumCrop.data.length, 4000000 * 4, 'an exact four-million-pixel inspection remains supported');
}

// A pixel-backed canvas checks partial uploads against an independent full-sheet read.
// Its write log also verifies that a small pen movement does not convert the whole page.
{
  class PixelCanvas {
    constructor(width = 0, height = 0) {
      this._width = width; this._height = height;
      this.data = new Uint8ClampedArray(width * height * 4);
      this.context = {
        canvas: this, uploads: [], globalAlpha: 1,
        save() {}, restore() {}, setTransform() {},
        createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
        putImageData: (image, x, y) => {
          assert.ok(x >= 0 && y >= 0 && x + image.width <= this.width && y + image.height <= this.height, 'partial uploads stay inside the backing canvas');
          for (let row = 0; row < image.height; row++) {
            const start = row * image.width * 4;
            this.data.set(image.data.subarray(start, start + image.width * 4), ((y + row) * this.width + x) * 4);
          }
          this.context.uploads.push({ x, y, width: image.width, height: image.height });
        },
        clearRect: (x, y, w, h) => {
          for (let row = y; row < y + h; row++) this.data.fill(0, (row * this.width + x) * 4, (row * this.width + x + w) * 4);
        },
        drawImage: (source, x, y, w, h) => {
          assert.deepEqual([x, y, w, h], [0, 0, source.width, source.height], 'this comparison uses the native pixel grid without rescaling');
          assert.deepEqual([this.width, this.height], [source.width, source.height]);
          this.data.set(source.data);
        },
      };
    }
    get width() { return this._width; }
    get height() { return this._height; }
    set width(value) { this._width = value; this.data = new Uint8ClampedArray(this.width * this.height * 4); }
    set height(value) { this._height = value; this.data = new Uint8ClampedArray(this.width * this.height * 4); }
    getContext() { return this.context; }
  }
  const originalDocument = globalThis.document;
  globalThis.document = { createElement: () => new PixelCanvas() };
  try {
    const live = session();
    const target = new PixelCanvas(live.material.width, live.material.height);
    const compose = (material = live.material, message = 'partial composition matches a fresh full-sheet pixel conversion') => {
      material.composite(target.getContext('2d'), target.width, target.height);
      const complete = material.pixels({ scale: material.scale });
      assert.deepEqual([target.width, target.height], [complete.width, complete.height]);
      assert.deepEqual(target.data, complete.data, message);
      return material.canvas.getContext('2d').uploads;
    };
    const initial = compose();
    assert.deepEqual(initial, [{ x: 0, y: 0, width: target.width, height: target.height }], 'initial composition paints the complete paper');
    compose();
    assert.equal(initial.length, 1, 'an unchanged sheet does not upload any new pigment pixels');
    live.select('graphite-6b', { size: 4 }).touch(sample(23.25, 41.75, .7));
    const touch = compose().at(-1);
    assert.ok(touch.width * touch.height < target.width * target.height / 20, 'a small contact uploads a small region instead of converting the whole page');
    live.move([sample(31.5, 46.75, .8, 160), sample(42.25, 49.5, .6, 330, 35, 5)]);
    const movement = compose().at(-1);
    assert.ok(movement.width * movement.height < target.width * target.height / 10, 'live pointer movement updates only its touched neighborhood');
    live.lift();
    const writesBeforeLift = initial.length;
    compose();
    assert.equal(initial.length, writesBeforeLift, 'lifting an already displayed gesture does not repaint it');
    live.select('precision-eraser', { size: 3 }).stroke([sample(24, 42, .9), sample(36, 47, .9, 280)]);
    compose(undefined, 'erased pixels replace prior pigment without leaving stale dark marks');
    live.select('white-chalk', { size: 5 }).stroke([sample(37, 49, .8), sample(46, 50, .8, 400)]);
    live.select('stump', { size: 7 }).stroke([sample(38, 49, .7), sample(58, 55, .7, 500)]);
    compose(undefined, 'mixed pigment and moved loose deposits update correctly in partial composition');

    // Several distant changes can arrive before a frame; their dirty bounds must be united.
    live.select('graphite-2b', { size: 3 }).stroke([sample(.1, .1, .8)]).stroke([sample(159.9, 99.9, .8)]);
    compose(undefined, 'dirty-region union includes disjoint contacts and clipped page corners');
    const finished = target.data.slice();
    const clone = live.material.clone();
    const cloneWrites = compose(clone);
    assert.deepEqual(cloneWrites, [{ x: 0, y: 0, width: target.width, height: target.height }], 'a clone populates its new canvas with the full sheet');
    assert.deepEqual(target.data, finished);
    clone.run(stroke('kneaded-eraser', [sample(38, 48, .8)], 12));
    compose(clone);
    compose(live.material, 'painting a clone leaves the original cached canvas and pigment intact');
    assert.deepEqual(target.data, finished);

    live.material.clear();
    const cleared = compose().at(-1);
    assert.deepEqual(cleared, { x: 0, y: 0, width: target.width, height: target.height }, 'clearing resets every cached canvas pixel to paper');
    assert.deepEqual(target.data, sheet().pixels({ scale: live.material.scale }).data);
    live.replay();
    const replayed = compose().at(-1);
    assert.deepEqual(replayed, { x: 0, y: 0, width: target.width, height: target.height }, 'replay redraws the complete restored page');
    assert.deepEqual(target.data, finished, 'clear followed by replay restores the complete displayed image exactly');
  } finally {
    if (originalDocument === undefined) delete globalThis.document; else globalThis.document = originalDocument;
  }
}

console.log('Pressure, tilt, dwell, grain, chalk, conservative blending, lifting, live/replay equality, undo/redo, atomic commands, durable practice records and partial canvas uploads passed.');
