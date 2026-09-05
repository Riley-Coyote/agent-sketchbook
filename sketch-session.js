/* The hand's direct API. Timed contact, feedback, revisions and practice notes
 * use the same material simulation in the browser and the local agent server. */
import { MaterialSurface, MATERIAL_TOOLS, DEFAULT_SURFACE, segmentSamples } from './material-engine.js';
import { sanitizeSurface, sanitizePageDimensions, sanitizeOps, limitsForPage } from './validate.js';

const copy = (value) => structuredClone(value);
const fail = (message) => { throw new Error(message); };
function shortString(value, max, name) {
  if (typeof value !== 'string' || value.length > max) throw new TypeError(`${name} must be text of at most ${max} characters`);
  return value;
}

export class SketchSession {
  constructor({ page = { w: 1100, h: 780 }, surface = DEFAULT_SURFACE, title = 'Untitled study' } = {}) {
    this.listeners = new Set(); this.revision = 0;
    this._configure(page, surface);
    this.title = shortString(title, 120, 'title');
    this._ops = []; this._redo = []; this.reviews = []; this._active = null;
    this.tool = 'graphite-2b'; this.settings = { size: MATERIAL_TOOLS[this.tool].size, strength: 1 };
  }
  _configure(page, surface) {
    const dimensions = sanitizePageDimensions(page), paper = sanitizeSurface(surface);
    if (!dimensions.page || !paper.surface) fail([...dimensions.errors, ...paper.errors, 'a studio sheet needs a versioned surface'].join('; '));
    this.page = dimensions.page; this.surface = paper.surface;
    this.limits = limitsForPage(this.page, this.surface);
    this.material = new MaterialSurface({ width: this.page.w, height: this.page.h, surface: this.surface });
  }
  get ops() { return this._ops; }
  get active() { return this._active !== null; }
  get canUndo() { return this.active || this._ops.length > 0; }
  get canRedo() { return !this.active && this._redo.length > 0; }
  subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  _changed() { this.revision++; for (const listener of this.listeners) listener(this); }
  _idle() { if (this.active) fail('lift the tool before changing tools, undoing, or reviewing'); }
  _checked(op) {
    const result = sanitizeOps([...this._ops, op], this.limits);
    if (!result.ops) fail(result.errors.join('; '));
    return result.ops.at(-1);
  }
  _sample(sample, fallbackTime = 0) {
    if (!sample || typeof sample !== 'object' || Array.isArray(sample)) fail('a contact sample must be an object');
    return { x: sample.x, y: sample.y, p: sample.p ?? .5, tiltX: sample.tiltX ?? 0, tiltY: sample.tiltY ?? 0, t: sample.t ?? fallbackTime };
  }
  select(tool, options = {}) {
    this._idle();
    if (!Object.hasOwn(MATERIAL_TOOLS, tool)) fail('unknown material tool');
    const size = options.size ?? MATERIAL_TOOLS[tool].size, strength = options.strength ?? 1;
    const checked = this._checked({ k: 'm', tool, size, strength, samples: [{ x: 0, y: 0, p: 0, tiltX: 0, tiltY: 0, t: 0 }] });
    this.tool = tool; this.settings = { size: checked.size, strength: checked.strength }; this._changed();
    return this;
  }
  touch(sample) {
    this._idle();
    const op = this._checked({ k: 'm', tool: this.tool, ...this.settings, samples: [this._sample(sample)] });
    this._active = op;
    this.material.stamp(op, { ...op.samples[0], dose: .35 });
    this._changed(); return this;
  }
  move(samples) {
    if (!this.active) fail('touch the paper before moving');
    if (!Array.isArray(samples) || !samples.length) fail('move needs an array of samples');
    let t = this._active.samples.at(-1).t;
    const extra = samples.map((sample) => { const p = this._sample(sample, t + 16); t = p.t; return p; });
    const previousCount = this._active.samples.length;
    const op = this._checked({ ...this._active, samples: [...this._active.samples, ...extra] });
    // Validate the entire candidate before touching any pigment.
    for (let i = previousCount; i < op.samples.length; i++) {
      for (const sample of segmentSamples(op, op.samples[i - 1], op.samples[i])) this.material.stamp(op, sample);
    }
    this._active = op; this._changed(); return this;
  }
  lift() {
    if (!this.active) return this;
    this._ops = [...this._ops, this._active]; this._active = null; this._redo = [];
    this._changed(); return this;
  }
  stroke(samples) {
    this._idle();
    if (!Array.isArray(samples) || !samples.length) fail('stroke needs contact samples');
    let t = -16;
    const normalized = samples.map((sample) => { const p = this._sample(sample, t + 16); t = p.t; return p; });
    const op = this._checked({ k: 'm', tool: this.tool, ...this.settings, samples: normalized });
    this.material.run(op); this._ops = [...this._ops, op]; this._redo = [];
    this._changed(); return this;
  }
  clean() {
    this._idle();
    const op = this._checked({ k: 'clean', tool: 'stump' });
    this.material.clean(); this._ops = [...this._ops, op]; this._redo = [];
    this._changed(); return this;
  }
  _rebuild() {
    this.material.clear();
    for (const op of this._ops) this.material.run(op);
    if (this._active) this.material.run(this._active);
  }
  undo() {
    if (this.active) { this._active = null; this._rebuild(); this._changed(); return this; }
    if (!this._ops.length) return this;
    this._redo.push(this._ops.at(-1)); this._ops = this._ops.slice(0, -1);
    this._rebuild(); this._changed(); return this;
  }
  redo() {
    this._idle(); if (!this._redo.length) return this;
    const op = this._redo.pop(); this.material.run(op); this._ops = [...this._ops, op];
    this._changed(); return this;
  }
  replay() { this._rebuild(); this._changed(); return this; }
  review({ observation = '', lesson = '', next = '', region = undefined } = {}) {
    this._idle();
    if (this.reviews.length >= 256) fail('this sheet already has 256 reviews');
    const entry = { observation: shortString(observation, 4000, 'observation'), lesson: shortString(lesson, 4000, 'lesson'), next: shortString(next, 4000, 'next'), at: this._ops.length, tool: this.tool, settings: { ...this.settings } };
    if (!entry.observation.trim() && !entry.lesson.trim() && !entry.next.trim()) fail('write an observation, lesson, or next step');
    if (region) { this._checkRegion(region); entry.region = { x: region.x, y: region.y, w: region.w, h: region.h }; }
    this.reviews = [...this.reviews, entry]; this._changed(); return entry;
  }
  _checkRegion(region) {
    const { x, y, w, h } = region;
    if (![x, y, w, h].every(Number.isFinite) || x < 0 || y < 0 || w <= 0 || h <= 0 || x + w > this.page.w || y + h > this.page.h) fail('inspection region must fit the sheet');
  }
  pixels(region = {}) { return this.material.pixels(region); }
  draw(ctx, width = ctx.canvas.width, height = ctx.canvas.height) { this.material.composite(ctx, width, height); }
  inspect(region = {}) {
    const pixels = this.pixels(region), canvas = document.createElement('canvas');
    canvas.width = pixels.width; canvas.height = pixels.height;
    const ctx = canvas.getContext('2d'), image = ctx.createImageData(pixels.width, pixels.height);
    image.data.set(pixels.data); ctx.putImageData(image, 0, 0); return canvas;
  }
  export() {
    return copy({ version: 1, title: this.title, page: this.page, surface: this.surface, ops: this._ops, reviews: this.reviews,
      tool: this.tool, settings: this.settings, ...(this._active ? { active: this._active } : {}), redo: this._redo });
  }
  import(drawing) {
    if (!drawing || drawing.version !== 1 || !drawing.surface) fail('unsupported studio drawing version or missing surface');
    if (drawing.active && drawing.active.k !== 'm') fail('active contact must be a material gesture');
    // Construct and validate away from the live sheet. A failed import cannot
    // clear the current drawing, tool, undo stack, or practice notes.
    const candidate = new SketchSession({ page: drawing.page, surface: drawing.surface, title: drawing.title ?? 'Untitled study' });
    const result = sanitizeOps(drawing.ops, candidate.limits);
    if (!result.ops) fail(result.errors.join('; '));
    candidate._ops = result.ops;
    candidate.select(drawing.tool ?? 'graphite-2b', drawing.settings ?? {});
    if (drawing.active) candidate._active = candidate._checked(drawing.active);
    if (drawing.redo !== undefined) {
      const redo = sanitizeOps(drawing.redo, candidate.limits);
      if (!redo.ops) fail(redo.errors.join('; '));
      // Redo must also fit once returned to the page.
      const combined = sanitizeOps([...candidate._ops, ...redo.ops], candidate.limits);
      if (!combined.ops) fail(combined.errors.join('; '));
      candidate._redo = redo.ops;
    }
    if (drawing.reviews !== undefined) {
      if (!Array.isArray(drawing.reviews) || drawing.reviews.length > 256) fail('invalid reviews');
      for (const review of drawing.reviews) {
        candidate._active = null;
        const entry = candidate.review(review);
        if (!Number.isInteger(review.at) || review.at < 0) fail('invalid review checkpoint');
        entry.at = review.at;
        if (review.tool && Object.hasOwn(MATERIAL_TOOLS, review.tool)) entry.tool = review.tool;
        if (review.settings) {
          const checked = sanitizeOps([{ k: 'm', tool: entry.tool, ...review.settings, samples: [{ x: 0, y: 0, p: 0, t: 0 }] }], candidate.limits);
          if (!checked.ops) fail('invalid review tool settings');
          entry.settings = { size: checked.ops[0].size, strength: checked.ops[0].strength };
        }
      }
      if (drawing.active) candidate._active = candidate._checked(drawing.active);
    }
    candidate._rebuild(); this._adopt(candidate); return this;
  }
  clone() {
    const candidate = Object.create(SketchSession.prototype);
    Object.assign(candidate, this);
    candidate.material = this.material.clone(); candidate.listeners = new Set();
    candidate._ops = this._ops.slice(); candidate._redo = this._redo.slice(); candidate.reviews = copy(this.reviews);
    candidate._active = this._active ? copy(this._active) : null;
    candidate.settings = { ...this.settings }; candidate.page = { ...this.page }; candidate.surface = { ...this.surface };
    return candidate;
  }
  _adopt(candidate) {
    const listeners = this.listeners, revision = this.revision;
    Object.assign(this, candidate); this.listeners = listeners; this.revision = revision; this._changed();
  }
  apply(actions, { atomic = true } = {}) {
    if (!Array.isArray(actions) || !actions.length || actions.length > 256) fail('actions must contain 1..256 commands');
    const target = atomic ? this.clone() : this;
    for (const action of actions) {
      if (!action || typeof action !== 'object') fail('invalid action');
      switch (action.type) {
        case 'select': target.select(action.tool, action.options); break;
        case 'touch': target.touch(action.sample); break;
        case 'move': target.move(action.samples); break;
        case 'lift': target.lift(); break;
        case 'stroke': target.stroke(action.samples); break;
        case 'clean': target.clean(); break;
        case 'undo': target.undo(); break;
        case 'redo': target.redo(); break;
        case 'review': target.review(action); break;
        default: fail(`unknown action ${action.type}`);
      }
    }
    if (atomic) this._adopt(target); return this;
  }
}
