/* Opt-in dry media. The legacy stamp engine never enters this renderer.
 * Pigment lives on a fixed sheet: bound and loose dark/light deposits, plus
 * the pigment carried by a blending stump. All state is derived from gestures.
 * No DOM is needed until a caller asks to composite onto a canvas. */
export const MATERIAL_VERSION = 1;
export const DEFAULT_SURFACE = { version: 1, paper: 'white', tooth: .65, seed: 17 };
export const PAPERS = {
  white: { name: 'Warm white', rgb: [246, 243, 234] },
  toned: { name: 'Toned grey', rgb: [159, 156, 148] },
  black: { name: 'Black paper', rgb: [25, 26, 29] },
};
export const MATERIAL_TOOLS = {
  'graphite-hb': { name: 'HB pencil', description: 'A firm point. Fine grain, restrained darks, little loose pigment.', size: 1.6, deposit: .045, bound: .88, reach: .18, edge: .75 },
  'graphite-2b': { name: '2B pencil', description: 'A softer graphite point for building tone and hatching.', size: 2.2, deposit: .074, bound: .72, reach: .3, edge: .6 },
  'graphite-6b': { name: '6B pencil', description: 'Soft, rich graphite. The side shades broadly and blends readily.', size: 3, deposit: .11, bound: .51, reach: .44, edge: .45 },
  'vine-charcoal': { name: 'Vine charcoal', description: 'Open, friable grain. Lifts easily and moves with the stump.', size: 9, deposit: .065, bound: .08, reach: .1, edge: .3 },
  'compressed-charcoal': { name: 'Compressed charcoal', description: 'Dense darks, a broad contact and more persistent pigment.', size: 7, deposit: .13, bound: .31, reach: .4, edge: .45 },
  'white-chalk': { name: 'White chalk', description: 'Light pigment for toned and black paper. Blends with existing charcoal.', size: 5, deposit: .10, bound: .25, reach: .26, edge: .4, light: true },
  stump: { name: 'Blending stump', description: 'Picks up loose pigment and carries it into the next marks. Clean to empty it.', size: 18, mode: 'smudge', edge: .2 },
  'kneaded-eraser': { name: 'Kneaded eraser', description: 'Gently lifts loose pigment. Dab to recover a soft light.', size: 18, mode: 'lift', edge: .15 },
  'precision-eraser': { name: 'Precision eraser', description: 'A narrow, firmer edge for highlights and corrections.', size: 2.5, mode: 'erase', edge: .8 },
};

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const mix = (a, b, t) => a + (b - a) * t;
function noise(x, y, seed) {
  let n = Math.imul(x ^ seed, 374761393) ^ Math.imul(y, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
/* Lattice noise, smoothly interpolated: soft bumps one unit across. */
function smoothNoise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = noise(xi, yi, seed), b = noise(xi + 1, yi, seed), c = noise(xi, yi + 1, seed), d = noise(xi + 1, yi + 1, seed);
  return mix(mix(a, b, sx), mix(c, d, sx), sy);
}

/** Samples are timed contact measurements, not an imposed stroke envelope.
 * Segment boundaries are visited once. Streaming and replay share this exact
 * quadrature, including stationary contact, so a held point can darken. */
export function gestureSamples(op) {
  const out = [];
  if (!op.samples.length) return out;
  const first = op.samples[0];
  out.push({ ...first, dose: .35, progress: 0 });
  const end = op.samples.at(-1).t, start = first.t;
  for (let i = 1; i < op.samples.length; i++) {
    out.push(...segmentSamples(op, op.samples[i - 1], op.samples[i], start, end));
  }
  return out;
}

export function segmentSamples(op, a, b, start = a.t, end = b.t) {
  const distance = Math.hypot(b.x - a.x, b.y - a.y), dt = b.t - a.t;
  const spacing = Math.max(.22, Math.min(1.2, op.size * .18));
  const n = Math.max(1, Math.ceil(distance / spacing), Math.ceil(dt / 32));
  // Dose integrates distance and dwell time instead of the number of input
  // points. Faster travel deposits less pigment along the same path.
  const dose = (distance / Math.max(.7, op.size * .24) + dt / 70) / n;
  const out = [];
  for (let j = 1; j <= n; j++) {
    const u = j / n;
    const sample = { dose, progress: end === start ? 1 : (mix(a.t, b.t, u) - start) / (end - start) };
    for (const key of ['x', 'y', 'p', 'tiltX', 'tiltY', 't']) sample[key] = mix(a[key], b[key], u);
    out.push(sample);
  }
  return out;
}

export class MaterialSurface {
  constructor({ width, height, surface = DEFAULT_SURFACE }) {
    this.w = width; this.h = height; this.surface = { ...surface };
    // Stable physical resolution: export/thumbnail scale cannot change the
    // paper or simulation. Bound to four million cells per sheet.
    this.scale = Math.min(2, Math.sqrt(4000000 / (width * height)));
    this.width = Math.max(1, Math.floor(width * this.scale));
    this.height = Math.max(1, Math.floor(height * this.scale));
    this.scaleX = this.width / width; this.scaleY = this.height / height;
    const n = this.width * this.height;
    this.dark = new Float32Array(n); this.darkLoose = new Float32Array(n);
    this.light = new Float32Array(n); this.lightLoose = new Float32Array(n);
    this.tooth = new Float32Array(n);
    const s = surface.seed;
    /* Version 2 paper has its grain at the scale an eye sees it: soft bumps a
     * couple of page pixels across over a slower, felted cockle. Version 1's
     * grain is finer than a pixel, so it averages away and reads as smooth. */
    this.deep = surface.version >= 2;
    for (let y = 0; y < this.height; y++) for (let x = 0; x < this.width; x++) {
      const fine = noise(x, y, s);
      if (this.deep) {
        const px = x / this.scaleX, py = y / this.scaleY;
        this.tooth[y * this.width + x] = smoothNoise(px / 1.7, py / 1.7, s) * .55 + smoothNoise(px / 4.6, py / 3.4, s ^ 0x9e3779b9) * .3 + fine * .15;
      } else {
        const fiber = noise(Math.floor(x / 3), Math.floor(y / 2), s ^ 0x5bd1e995);
        this.tooth[y * this.width + x] = fine * .72 + fiber * .28;
      }
    }
    this.carrier = { dark: 0, light: 0 };
    this.dirty = true;
    this.dirtyBounds = { x0: 0, y0: 0, x1: this.width - 1, y1: this.height - 1 };
  }

  clear() {
    for (const key of ['dark', 'darkLoose', 'light', 'lightLoose']) this[key].fill(0);
    this.clean(); this.dirty = true;
    this.dirtyBounds = { x0: 0, y0: 0, x1: this.width - 1, y1: this.height - 1 };
  }
  clean() { this.carrier = { dark: 0, light: 0 }; }
  clone() {
    const copy = Object.create(MaterialSurface.prototype);
    Object.assign(copy, this);
    for (const key of ['dark', 'darkLoose', 'light', 'lightLoose']) copy[key] = this[key].slice();
    copy.carrier = { ...this.carrier }; copy.canvas = null; copy.dirty = true;
    copy.dirtyBounds = { x0: 0, y0: 0, x1: this.width - 1, y1: this.height - 1 };
    return copy;
  }

  run(op, from = 0, to = 1, prepared = undefined) {
    if (op.k === 'clean') { if (from === 0) this.clean(); return; }
    if (op.k !== 'm') return;
    const samples = prepared || gestureSamples(op);
    for (const sample of samples) {
      // Each contact measurement is applied exactly once across tick slices.
      if ((from === 0 ? sample.progress >= 0 : sample.progress > from) && sample.progress <= to) this.stamp(op, sample);
    }
  }

  stamp(op, sample) {
    const tool = MATERIAL_TOOLS[op.tool], p = sample.p, strength = op.strength ?? 1;
    if (p === 0 || strength === 0) return;
    const tilt = Math.min(1, Math.hypot(sample.tiltX, sample.tiltY) / 85);
    const angle = Math.atan2(sample.tiltY, sample.tiltX);
    const wide = tool.mode ? 1 + tilt * .25 : 1 + tilt * 3.4;
    const rx = op.size * .5 * wide * (.45 + .55 * Math.sqrt(p));
    const ry = op.size * .5 * (.3 + .7 * Math.sqrt(p));
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const bx = Math.hypot(rx * cos, ry * sin) + .6 / this.scale;
    const by = Math.hypot(rx * sin, ry * cos) + .6 / this.scale;
    const x0 = Math.max(0, Math.floor((sample.x - bx) * this.scaleX));
    const y0 = Math.max(0, Math.floor((sample.y - by) * this.scaleY));
    const x1 = Math.min(this.width - 1, Math.ceil((sample.x + bx) * this.scaleX));
    const y1 = Math.min(this.height - 1, Math.ceil((sample.y + by) * this.scaleY));
    const dose = sample.dose ?? 1;
    const pixels = tool.mode === 'smudge' ? [] : null;
    let contactSum = 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const dx = (x + .5) / this.scaleX - sample.x, dy = (y + .5) / this.scaleY - sample.y;
      const u = dx * cos + dy * sin, v = -dx * sin + dy * cos;
      // Half-cell antialiasing retains even a subpixel hard pencil point.
      const r = Math.hypot(u / (rx + .35 / this.scale), v / (ry + .35 / this.scale));
      if (r >= 1) continue;
      const edge = clamp((1 - r) / (1 - tool.edge));
      const i = y * this.width + x;
      if (tool.mode === 'smudge') {
        const contact = edge * p * strength;
        pixels.push(i, contact); contactSum += contact;
      } else if (tool.mode === 'lift' || tool.mode === 'erase') {
        const firm = tool.mode === 'erase';
        const looseRate = 1 - Math.exp(-dose * strength * p * edge * (firm ? .72 : .24));
        const fixedRate = 1 - Math.exp(-dose * strength * p * edge * (firm ? .4 : .035));
        this.darkLoose[i] *= 1 - looseRate; this.lightLoose[i] *= 1 - looseRate;
        this.dark[i] *= 1 - fixedRate; this.light[i] *= 1 - fixedRate;
      } else {
        const filled = this.dark[i] + this.darkLoose[i] + this.light[i] + this.lightLoose[i];
        const relief = (this.tooth[i] - .5) * this.surface.tooth;
        // Low pressure meets high fibers first. Deposits fill the valleys;
        // later passes meet the same relief with a shallower remaining tooth.
        // On version 2 paper the grain keeps its say as pressure rises, and its
        // pits stay light however hard the stick is pressed: friable vine
        // charcoal bridges them, soft graphite gets further in (its `reach`).
        // Only pigment pushed by the stump fills them.
        let contact = clamp((p * .9 + tool.reach - relief * (this.deep ? 1 + .6 * p : 1) - .12) * 2.4 + filled * .16);
        if (this.deep) {
          const pit = clamp((relief - .07) / .12);
          contact *= 1 - pit * pit * (3 - 2 * pit) * clamp(1 - tool.reach * 1.6);
        }
        const amount = dose * strength * tool.deposit * Math.pow(p, .8) * edge * contact / (1 + filled * .18);
        const fixed = tool.light ? this.light : this.dark;
        const loose = tool.light ? this.lightLoose : this.darkLoose;
        fixed[i] += amount * tool.bound; loose[i] += amount * (1 - tool.bound);
      }
    }
    if (pixels && contactSum > 0) {
      const transfer = 1 - Math.exp(-dose * .16);
      const darkDrop = this.carrier.dark * transfer, lightDrop = this.carrier.light * transfer;
      this.carrier.dark -= darkDrop; this.carrier.light -= lightDrop;
      for (let k = 0; k < pixels.length; k += 2) {
        const i = pixels[k], contact = pixels[k + 1];
        const pickup = 1 - Math.exp(-dose * contact * .32);
        const dark = this.darkLoose[i] * pickup, light = this.lightLoose[i] * pickup;
        this.darkLoose[i] -= dark; this.lightLoose[i] -= light;
        this.carrier.dark += dark; this.carrier.light += light;
        this.darkLoose[i] += darkDrop * contact / contactSum;
        this.lightLoose[i] += lightDrop * contact / contactSum;
      }
    }
    this.dirty = true;
    if (x1 >= x0 && y1 >= y0) {
      const b = this.dirtyBounds;
      this.dirtyBounds = b ? { x0: Math.min(b.x0, x0), y0: Math.min(b.y0, y0), x1: Math.max(b.x1, x1), y1: Math.max(b.y1, y1) } : { x0, y0, x1, y1 };
    }
  }

  /** Opaque paper and mixed pigment. Internal deposition buffers remain
   * separate so blending and lifting are never just translucent paint. */
  pixels(region = {}) {
    const x = region.x ?? 0, y = region.y ?? 0, w = region.w ?? this.w, h = region.h ?? this.h;
    const scale = region.scale ?? 1;
    if (![x, y, w, h, scale].every(Number.isFinite) || x < 0 || y < 0 || w <= 0 || h <= 0 || scale <= 0
      || x + w > this.w || y + h > this.h) throw new RangeError('inspection must fit the page and contain at most 4000000 pixels');
    const width = Math.max(1, Math.round(w * scale)), height = Math.max(1, Math.round(h * scale));
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width * height > 4000000) throw new RangeError('inspection contains more than 4000000 pixels');
    const data = new Uint8ClampedArray(width * height * 4), paper = PAPERS[this.surface.paper].rgb;
    for (let py = 0; py < height; py++) for (let px = 0; px < width; px++) {
      const ix = Math.min(this.width - 1, Math.floor((x + (px + .5) * w / width) * this.scaleX));
      const iy = Math.min(this.height - 1, Math.floor((y + (py + .5) * h / height) * this.scaleY));
      const i = iy * this.width + ix, out = (py * width + px) * 4;
      const dark = this.dark[i] + this.darkLoose[i], light = this.light[i] + this.lightLoose[i];
      const total = dark + light, cover = 1 - Math.exp(-total * 1.7);
      const pigment = total > 0 ? (dark * 22 + light * 251) / total : 0;
      const grain = (this.tooth[i] - .5) * this.surface.tooth * (this.deep ? 10 : 4);
      for (let c = 0; c < 3; c++) data[out + c] = mix(paper[c] + grain, pigment, cover);
      data[out + 3] = 255;
    }
    return { width, height, data };
  }

  composite(ctx, width, height) {
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      this.canvas.width = this.width; this.canvas.height = this.height;
    }
    if (this.dirty && this.dirtyBounds) {
      const { x0, y0, x1, y1 } = this.dirtyBounds, w = x1 - x0 + 1, h = y1 - y0 + 1;
      const paint = this.canvas.getContext('2d');
      const image = paint.createImageData(w, h), paper = PAPERS[this.surface.paper].rgb;
      // Update only touched paper. Converting an entire multi-megapixel sheet
      // after every pen event would make the hand lag behind its own gesture.
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const i = y * this.width + x, out = ((y - y0) * w + x - x0) * 4;
        const dark = this.dark[i] + this.darkLoose[i], light = this.light[i] + this.lightLoose[i];
        const total = dark + light, cover = 1 - Math.exp(-total * 1.7);
        const pigment = total > 0 ? (dark * 22 + light * 251) / total : 0;
        const grain = (this.tooth[i] - .5) * this.surface.tooth * (this.deep ? 10 : 4);
        for (let c = 0; c < 3; c++) image.data[out + c] = mix(paper[c] + grain, pigment, cover);
        image.data[out + 3] = 255;
      }
      paint.putImageData(image, x0, y0);
      this.dirty = false;
      this.dirtyBounds = null;
    }
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, width, height); ctx.drawImage(this.canvas, 0, 0, width, height); ctx.restore();
  }
}
