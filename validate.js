/* validate.js — marks are data another mind produced. Check them before the
 * engine draws them, whether they came from the book, a chat message, or the
 * sandbox. Runs in node and in the browser. No dependencies beyond the engine's
 * name tables.
 */

import { BRUSHES, LAYERS } from './mark-engine.js';
import { MATERIAL_TOOLS, PAPERS } from './material-engine.js';

export const LIMITS = {
  maxOps: 20000,
  maxPoints: 600000,
  maxStrokePoints: 4000,
  maxPolyPoints: 512,
  maxPauseMs: 5000,
  maxWeight: 6,
  maxDotRadius: 60,
  page: { w: 880, h: 660 },
  margin: 400, /* how far off the page a point may go */
};

const KINDS = new Set(['s', 'g', 'd', 'p', 'phase', 'occ', 'clamp', 'm', 'clean']);
const LAYER_KEYS = new Set(LAYERS.map((l) => l.key));
const BRUSH_KEYS = new Set(Object.keys(BRUSHES));

const num = (v) => typeof v === 'number' && Number.isFinite(v);
/* an optional colour on a stroke or dot: three whole numbers 0–255 */
const colour = (c) => Array.isArray(c) && c.length === 3 && c.every((v) => Number.isInteger(v) && v >= 0 && v <= 255) ? [c[0], c[1], c[2]] : null;

/** An explicit version keeps the established renderer the default forever. */
export function sanitizeSurface(input) {
  if (input === undefined) return { surface: undefined, errors: [] };
  if (!input || typeof input !== 'object' || Array.isArray(input) || input.version !== 1
    || !Object.hasOwn(PAPERS, input.paper)
    || !num(input.tooth) || input.tooth < 0 || input.tooth > 1
    || !Number.isInteger(input.seed) || input.seed < 0 || input.seed > 4294967295) {
    return { surface: null, errors: ['surface needs version 1, paper white/toned/black, tooth 0..1 and a uint32 seed'] };
  }
  return { surface: { version: 1, paper: input.paper, tooth: input.tooth, seed: input.seed }, errors: [] };
}

/** Page geometry is explicit metadata, never inferred from untrusted marks. */
export function sanitizePageDimensions(input) {
  if (input === undefined) return { page: { ...LIMITS.page }, errors: [] };
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || !Number.isInteger(input.w) || !Number.isInteger(input.h)
    || input.w <= 0 || input.h <= 0 || input.w > 4096 || input.h > 4096
    || input.w * input.h > 8000000) {
    return { page: null, errors: ['page needs integer w and h from 1 to 4096, with at most 8000000 pixels'] };
  }
  return { page: { w: input.w, h: input.h }, errors: [] };
}

/** Larger pages have a bounded larger mark budget; original pages keep theirs. */
export function limitsForPage(page, surface = undefined) {
  const checked = sanitizePageDimensions(page);
  if (checked.errors.length) throw new RangeError(checked.errors[0]);
  const material = sanitizeSurface(surface);
  if (material.errors.length) throw new RangeError(material.errors[0]);
  const large = checked.page.w * checked.page.h > LIMITS.page.w * LIMITS.page.h;
  return { ...LIMITS, page: checked.page, ...(large ? { maxOps: 120000, maxPoints: 2000000 } : {}), ...(material.surface ? { surface: material.surface } : {}) };
}

/**
 * Returns { ops, errors, stats }. `ops` is a clean copy holding only the
 * fields the engine reads, or null if anything was rejected. Errors are
 * capped at 20 so a hostile payload cannot flood the caller.
 */
export function sanitizeOps(input, limits = LIMITS) {
  const errors = [];
  const err = (i, msg) => { if (errors.length < 20) errors.push(`op ${i}: ${msg}`); };
  if (!Array.isArray(input)) return { ops: null, errors: ['ops is not an array'], stats: null };
  if (input.length > limits.maxOps) return { ops: null, errors: [`${input.length} ops, limit ${limits.maxOps}`], stats: null };
  const lo = -limits.margin, hiX = limits.page.w + limits.margin, hiY = limits.page.h + limits.margin;
  const inRange = (p) => num(p[0]) && num(p[1]) && p[0] >= lo && p[0] <= hiX && p[1] >= lo && p[1] <= hiY;
  const cleanPts = (i, pts, max, min = 2) => {
    if (!Array.isArray(pts) || pts.length < min) { err(i, `needs at least ${min} points`); return null; }
    if (pts.length > max) { err(i, `${pts.length} points, limit ${max}`); return null; }
    const out = new Array(pts.length);
    for (let k = 0; k < pts.length; k++) {
      const p = pts[k];
      if (!Array.isArray(p) || !inRange(p)) { err(i, `point ${k} is not a finite on-page [x, y]`); return null; }
      out[k] = [p[0], p[1]];
    }
    return out;
  };
  const out = [];
  let points = 0;
  let materialWork = 0;
  for (let i = 0; i < input.length; i++) {
    const o = input[i];
    if (!o || typeof o !== 'object') { err(i, 'not an object'); continue; }
    if (!KINDS.has(o.k)) { err(i, `unknown kind ${JSON.stringify(o.k)}`); continue; }
    if (limits.surface ? !['m', 'clean', 'p', 'phase'].includes(o.k) : ['m', 'clean'].includes(o.k)) {
      err(i, 'material gestures require a versioned surface; material and legacy marks cannot be mixed'); continue;
    }
    if (o.k === 'm') {
      if (!Object.hasOwn(MATERIAL_TOOLS, o.tool)) { err(i, 'unknown material tool'); continue; }
      const size = o.size ?? MATERIAL_TOOLS[o.tool].size, strength = o.strength ?? 1;
      if (!num(size) || size < .2 || size > 80 || !num(strength) || strength < 0 || strength > 1) { err(i, 'material size or strength out of range'); continue; }
      if (!Array.isArray(o.samples) || !o.samples.length || o.samples.length > limits.maxStrokePoints) { err(i, 'material gesture needs 1..4000 samples'); continue; }
      const samples = [];
      for (const s of o.samples) {
        if (!s || typeof s !== 'object' || !inRange([s.x, s.y]) || !num(s.p) || s.p < 0 || s.p > 1
          || !num(s.t) || s.t < 0 || s.t > 60000 || (samples.length && s.t <= samples.at(-1).t)
          || !num(s.tiltX ?? 0) || Math.abs(s.tiltX ?? 0) > 90 || !num(s.tiltY ?? 0) || Math.abs(s.tiltY ?? 0) > 90) {
          err(i, 'invalid gesture sample: x/y, pressure 0..1, tilt -90..90, and increasing time 0..60000 required'); break;
        }
        const clean = { x: s.x, y: s.y, p: s.p, tiltX: s.tiltX ?? 0, tiltY: s.tiltY ?? 0, t: s.t };
        const a = samples.at(-1);
        const stamps = a ? Math.max(1, Math.ceil(Math.hypot(s.x - a.x, s.y - a.y) / Math.max(.22, Math.min(1.2, size * .18))), Math.ceil((s.t - a.t) / 32)) : 1;
        materialWork += stamps * Math.max(1, size * size * (1 + Math.min(1, Math.hypot(clean.tiltX, clean.tiltY) / 85) * 3.4));
        samples.push(clean);
      }
      if (materialWork > 200000000) { err(i, 'material contact budget exceeded; use shorter or narrower gestures'); break; }
      if (samples.length !== o.samples.length) continue;
      points += samples.length;
      out.push({ k: 'm', tool: o.tool, size, strength, samples });
    } else if (o.k === 'clean') {
      if (o.tool !== 'stump') { err(i, 'only the stump carries cleanable pigment'); continue; }
      out.push({ k: 'clean', tool: 'stump' });
    } else if (o.k === 's' || o.k === 'g') {
      const pts = cleanPts(i, o.pts, limits.maxStrokePoints);
      if (!pts) continue;
      if (!LAYER_KEYS.has(o.layer)) { err(i, `unknown layer ${JSON.stringify(o.layer)}`); continue; }
      if (!BRUSH_KEYS.has(o.brush)) { err(i, `unknown brush ${JSON.stringify(o.brush)}`); continue; }
      const w = o.w === undefined ? 1 : o.w;
      if (!num(w) || w <= 0 || w > limits.maxWeight) { err(i, `weight ${o.w} out of range`); continue; }
      points += pts.length;
      const s = { k: o.k, pts, layer: o.layer, brush: o.brush, w };
      if (o.c !== undefined) { const c = colour(o.c); if (!c) { err(i, 'colour is not [r, g, b]'); continue; } s.c = c; }
      if (o.alpha !== undefined) { if (!num(o.alpha) || o.alpha < 0 || o.alpha > 1) { err(i, 'alpha out of range'); continue; } s.alpha = o.alpha; }
      out.push(s);
    } else if (o.k === 'd') {
      if (!inRange([o.x, o.y]) || !num(o.r) || o.r <= 0 || o.r > limits.maxDotRadius) { err(i, 'dot out of range'); continue; }
      if (!LAYER_KEYS.has(o.layer)) { err(i, `unknown layer ${JSON.stringify(o.layer)}`); continue; }
      if (!BRUSH_KEYS.has(o.brush)) { err(i, `unknown brush ${JSON.stringify(o.brush)}`); continue; }
      const d = { k: 'd', x: o.x, y: o.y, r: o.r, layer: o.layer, brush: o.brush };
      if (o.c !== undefined) { const c = colour(o.c); if (!c) { err(i, 'colour is not [r, g, b]'); continue; } d.c = c; }
      if (o.alpha !== undefined) { if (!num(o.alpha) || o.alpha < 0 || o.alpha > 1) { err(i, 'alpha out of range'); continue; } d.alpha = o.alpha; }
      out.push(d);
    } else if (o.k === 'p') {
      if (!num(o.ms) || o.ms < 0 || o.ms > limits.maxPauseMs) { err(i, 'pause out of range'); continue; }
      out.push({ k: 'p', ms: o.ms });
    } else if (o.k === 'phase') {
      if (typeof o.name !== 'string' || o.name.length > 64) { err(i, 'phase name is not a short string'); continue; }
      const ms = o.ms === undefined ? 240 : o.ms;
      if (!num(ms) || ms < 0 || ms > limits.maxPauseMs) { err(i, 'phase pause out of range'); continue; }
      out.push({ k: 'phase', name: o.name, ms });
    } else if (o.k === 'occ') {
      const poly = cleanPts(i, o.poly, limits.maxPolyPoints, 3);
      if (!poly) continue;
      const a = o.a === undefined ? 0.9 : o.a;
      if (!num(a) || a < 0 || a > 1) { err(i, 'occlusion alpha out of range'); continue; }
      points += poly.length;
      out.push({ k: 'occ', poly, a });
    } else if (o.k === 'clamp') {
      if (!LAYER_KEYS.has(o.layer)) { err(i, `unknown layer ${JSON.stringify(o.layer)}`); continue; }
      if (!num(o.max) || o.max < 0 || o.max > 1) { err(i, 'clamp out of range'); continue; }
      out.push({ k: 'clamp', layer: o.layer, max: o.max });
    }
    if (points > limits.maxPoints) { errors.push(`${points}+ points, limit ${limits.maxPoints}`); break; }
  }
  const stats = { ops: out.length, points };
  return errors.length ? { ops: null, errors, stats } : { ops: out, errors, stats };
}

/** Meta fields a page carries besides its marks — checked the same way. */
export function sanitizePageMeta(meta) {
  const errors = [];
  const str = (k, max) => {
    const v = meta[k];
    if (v === undefined || v === null) return '';
    if (typeof v !== 'string') { errors.push(`${k} is not a string`); return ''; }
    return v.length > max ? v.slice(0, max) : v;
  };
  const out = {
    title: str('title', 120) || 'untitled',
    date: /^\d{4}-\d{2}-\d{2}$/.test(meta.date || '') ? meta.date : '',
    note: str('note', 4000),
    refs: Array.isArray(meta.refs) ? meta.refs.filter((r) => Number.isInteger(r) && r > 0 && r < 1000).slice(0, 16) : [],
  };
  return { meta: out, errors };
}
