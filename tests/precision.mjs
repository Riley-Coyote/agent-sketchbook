/* node tests/precision.mjs — deterministic renderer contract tests. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { MarkEngine, BRUSHES, OP, DOT, PHASE } from '../mark-engine.js';
import { sanitizeOps, sanitizePageDimensions, limitsForPage, LIMITS } from '../validate.js';

class Context {
  constructor() { this.draws = []; this.globalAlpha = 1; this.globalCompositeOperation = 'source-over'; this.stack = []; }
  scale() {}
  setTransform() {}
  clearRect() { this.draws = []; }
  save() { this.stack.push([this.fillStyle, this.globalAlpha, this.globalCompositeOperation]); }
  restore() { [this.fillStyle, this.globalAlpha, this.globalCompositeOperation] = this.stack.pop(); }
  beginPath() { this.path = []; }
  arc(...args) { this.path.push(['arc', ...args]); }
  ellipse(...args) { this.path.push(['ellipse', ...args]); }
  moveTo(...args) { this.path.push(['moveTo', ...args]); }
  lineTo(...args) { this.path.push(['lineTo', ...args]); }
  closePath() { this.path.push(['closePath']); }
  createRadialGradient(...args) {
    const g = { radial: args, stops: [] };
    g.addColorStop = (t, colour) => g.stops.push([t, colour]);
    return g;
  }
  fill() {
    const style = typeof this.fillStyle === 'string' ? this.fillStyle : { radial: this.fillStyle.radial, stops: this.fillStyle.stops };
    this.draws.push({ path: this.path, style, alpha: this.globalAlpha, composite: this.globalCompositeOperation });
  }
}
globalThis.document = { createElement: () => ({ getContext: () => new Context() }) };
const make = () => new MarkEngine({ width: 880, height: 660, dpr: 1 });
const drawing = (engine) => Object.fromEntries(Object.entries(engine.layers).map(([k, l]) => [k, l.ctx.draws]));
const legacyNames = ['liner', 'brush', 'chalk', 'wash', 'stipple', 'charcoal', 'eraser', 'pen'];
const legacyOps = legacyNames.map((brush, i) => OP('s', [[10 + i, 30], [13, 35], [28, 42]], 'line', brush, .47, [71, 103, 147]));
legacyOps.push(OP('g', [[4, 8], [14, 18]], 'under', 'wash', .32), DOT(17, 26, 3, 'accent', 'brush'), DOT(31, 22, 2, 'tone', 'eraser'));
const legacy = make().load(legacyOps).finish();
const digest = createHash('sha256').update(JSON.stringify(drawing(legacy))).digest('hex');
// The engine before the precision media change (4fc1609, 2026-09-02) draws
// exactly this. The change itself came in 660c7d5, and every committed engine
// since gives the same digest, so the old brushes were never touched. The value
// first recorded here (1fc160f6...) matched no committed engine; it was taken
// from a working copy, and was re-derived from history on 2026-09-22. All eight
// old brushes, construction, coloured ink, additive dots and erasing are
// covered.
assert.equal(digest, '7a6cc95f590d6810b7e81165b3684747d65f1247f5738a8e0c89284e3b5855d0');

const precisionOps = [
  OP('s', [[0, 0], [14, 0]], 'line', 'pencil', .08, undefined, .25),
  OP('s', [[10, 20], [30, 24]], 'tone', 'glaze', .8, [210, 140, 80], .35),
  OP('s', [[30, 20], [50, 22]], 'accent', 'soft', .4, undefined, 0),
  DOT(70, 80, 1, 'accent', 'pencil', undefined, .1),
  OP('s', [[5, 10], [15, 10]], 'tone', 'eraser', .8, undefined, .15),
  OP('g', [[5, 5], [15, 8]], 'under', 'pencil', .8, undefined, .3),
];
assert.deepEqual(sanitizeOps(precisionOps).ops, precisionOps);
for (const alpha of [-.001, 1.001, NaN, Infinity, '0.5', null]) {
  assert.equal(sanitizeOps([{ ...precisionOps[0], alpha }]).ops, null);
  assert.equal(sanitizeOps([{ ...precisionOps[3], alpha }]).ops, null);
}
for (const alpha of [0, .25, 1]) {
  assert.equal(sanitizeOps([{ ...precisionOps[0], alpha }]).ops[0].alpha, alpha);
  assert.equal(sanitizeOps([{ ...precisionOps[3], alpha }]).ops[0].alpha, alpha);
}
assert.ok(!('alpha' in OP('s', [[0, 0], [1, 1]], 'line', 'liner')));

const fine = make().load([precisionOps[0]]).finish();
const pencilDraws = fine.layers.line.ctx.draws;
assert.ok(pencilDraws.length > 90, 'pencil samples subpixel strokes densely');
assert.ok(pencilDraws.every((d) => d.path[0][3] === BRUSHES.pencil.minRadius));
assert.ok(pencilDraws.every((d) => d.alpha === .25));
for (let i = 1; i < pencilDraws.length; i++) {
  const a = pencilDraws[i - 1].path[0], b = pencilDraws[i].path[0];
  assert.ok(Math.hypot(a[1] - b[1], a[2] - b[2]) < a[3] + b[3], 'the narrowest pencil stamps still overlap');
}
const media = make().load(precisionOps.slice(1)).finish();
assert.ok(media.layers.tone.ctx.draws.some((d) => d.style.stops?.at(-1)[1] === 'rgba(210,140,80,0)'));
assert.ok(media.layers.tone.ctx.draws.filter((d) => d.composite === 'destination-out').every((d) => d.alpha === .15));
assert.ok(media.layers.accent.ctx.draws.some((d) => d.alpha === 0));
assert.equal(media.layers.accent.ctx.draws.at(-1).alpha, .1, 'dot receives its alpha multiplier');
assert.equal(media.layers.accent.ctx.globalAlpha, 1, 'opacity does not leak into the next mark');
assert.ok(media.layers.under.ctx.draws.every((d) => d.alpha === .3 && d.style === 'rgba(236,243,255,0.075)'), 'construction remains forced faint');

assert.deepEqual(sanitizePageDimensions().page, { w: 880, h: 660 });
assert.deepEqual(sanitizePageDimensions({ w: 3200, h: 2500, extra: true }), { page: { w: 3200, h: 2500 }, errors: [] });
for (const page of [null, [], {}, { w: 100 }, { w: 0, h: 100 }, { w: 1.1, h: 100 }, { w: '100', h: 100 }, { w: 4097, h: 10 }, { w: 4096, h: 4096 }]) {
  assert.equal(sanitizePageDimensions(page).page, null);
  assert.throws(() => limitsForPage(page), RangeError);
}
assert.deepEqual(limitsForPage(), LIMITS);
const large = limitsForPage({ w: 1920, h: 1080 });
assert.equal(large.maxOps, 120000);
assert.equal(large.maxPoints, 2000000);
assert.equal(limitsForPage({ w: 600, h: 400 }).maxOps, LIMITS.maxOps);
const wideMark = OP('s', [[1800, 1000], [1919, 1079]], 'line', 'pencil');
assert.equal(sanitizeOps([wideMark]).ops, null);
assert.deepEqual(sanitizeOps([wideMark], large).ops, [wideMark]);
assert.equal(sanitizeOps([{ ...wideMark, pts: [[2321, 10], [10, 10]] }], large).ops, null);
const many = new Array(LIMITS.maxOps + 1).fill({ k: 'p', ms: 0 });
assert.equal(sanitizeOps(many).ops, null);
assert.equal(sanitizeOps(many, large).ops.length, many.length);

const full = make().load([...legacyOps, ...precisionOps]).finish();
const growing = make().load(legacyOps).finish();
const cache = growing.cache;
const retainedStamp = growing.layers.line.ctx.draws[0];
growing.append(precisionOps);
assert.equal(growing.cache, cache);
assert.equal(growing.layers.line.ctx.draws[0], retainedStamp, 'existing pigment is retained');
assert.equal(legacyOps.length, legacyNames.length + 3, 'append does not mutate the original op list');
assert.deepEqual(drawing(growing), drawing(full), 'append equals painting all marks in order');
assert.equal(growing.total, full.total);
assert.equal(growing.done, true);
assert.equal(growing.progress, 1);

const animated = make().load(legacyOps).finish();
const retained = JSON.stringify(drawing(animated));
animated.append([PHASE('detail', 0), ...precisionOps], { animate: true });
assert.equal(JSON.stringify(drawing(animated)), retained, 'animated append waits for a tick');
assert.equal(animated.cursor.i, legacyOps.length);
assert.equal(animated.done, false);
assert.throws(() => animated.append(precisionOps), /finish the current drawing/);
animated.tick(1000);
assert.deepEqual(drawing(animated), drawing(full));
assert.equal(animated.done, true);
assert.equal(animated.phase, null);
assert.equal(animated.cursor, null);
assert.deepEqual(drawing(make().append(precisionOps)), drawing(make().load(precisionOps).finish()), 'append can begin a blank page');
assert.throws(() => make().append(null), TypeError);
console.log('Precision media, alpha, page limits, incremental painting, and legacy rendering passed.');
