/* validate.js — marks are data another mind produced. Check them before the
 * engine draws them, whether they came from the book, a chat message, or the
 * sandbox. Runs in node and in the browser. No dependencies beyond the engine's
 * name tables.
 */

import { BRUSHES, LAYERS, PAPERS_V2 } from './mark-engine.js';
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

const KINDS = new Set(['s', 'g', 'd', 'p', 'phase', 'occ', 'clamp', 'm', 'clean', 't', 'f', 'frame']);
/* Glyphs, flat shapes and motion frames belong to the second canvas. */
const INK_ONLY = new Set(['t', 'f', 'frame']);
/* A halftone screen: { cell 2..60 px, angle -90..90 degrees, shape 'dot' |
 * 'line', tone }. The tone is 0..1, or a ramp: { from: [x, y, v], to: [x, y,
 * v] } or { at: [x, y], r, inner, outer }. Returns a clean copy or a reason. */
function sanitizeHalftone(h) {
  const why = 'halftone needs { cell 2..60, angle -90..90, shape dot|line, tone 0..1 or a ramp }';
  if (!h || typeof h !== 'object' || Array.isArray(h)) return why;
  const out = { cell: h.cell ?? 8, angle: h.angle ?? 45, shape: h.shape ?? 'dot' };
  if (!num(out.cell) || out.cell < 2 || out.cell > 60 || !num(out.angle) || Math.abs(out.angle) > 90 || !['dot', 'line'].includes(out.shape)) return why;
  const v01 = (v) => num(v) && v >= 0 && v <= 1;
  const at = (p, n) => Array.isArray(p) && p.length === n && p.every(num) && Math.abs(p[0]) <= 1e5 && Math.abs(p[1]) <= 1e5;
  const t = h.tone ?? 0.5;
  if (typeof t === 'number') { if (!v01(t)) return 'halftone tone needs 0..1'; out.tone = t; }
  else if (t && at(t.from, 3) && at(t.to, 3) && v01(t.from[2]) && v01(t.to[2])) out.tone = { from: [...t.from], to: [...t.to] };
  else if (t && at(t.at, 2) && num(t.r) && t.r > 0 && t.r <= 1e5 && v01(t.inner) && v01(t.outer)) out.tone = { at: [...t.at], r: t.r, inner: t.inner, outer: t.outer };
  else return 'halftone tone needs 0..1, { from: [x, y, v], to: [x, y, v] } or { at: [x, y], r, inner, outer }';
  return out;
}
/* Overprinting strokes and dots multiply like pigment. It needs the second
 * canvas, and an eraser cuts rather than prints. */
function overprintProblem(o, limits) {
  if (typeof o.overprint !== 'boolean') return 'overprint is true or false';
  if (!o.overprint) return null;
  if (limits.surface?.kind !== 'ink') return 'overprint needs the second canvas: surface: { kind: \'ink\', version: 2 }';
  if (o.k === 'g') return 'construction lines cannot overprint';
  if (o.brush === 'eraser') return 'an eraser cuts; it cannot print over';
  return null;
}
const MAX_FRAMES = 96;
const MAX_TEXT = 4000;
const LAYER_KEYS = new Set(LAYERS.map((l) => l.key));
const BRUSH_KEYS = new Set(Object.keys(BRUSHES));

const num = (v) => typeof v === 'number' && Number.isFinite(v);
/* an optional colour on a stroke or dot: three whole numbers 0–255 */
const colour = (c) => Array.isArray(c) && c.length === 3 && c.every((v) => Number.isInteger(v) && v >= 0 && v <= 255) ? [c[0], c[1], c[2]] : null;

/** An explicit version keeps the established renderer the default forever. */
export function sanitizeSurface(input) {
  if (input === undefined) return { surface: undefined, errors: [] };
  if (input && typeof input === 'object' && !Array.isArray(input) && input.kind === 'ink') {
    const named = typeof input.paper === 'string' && Object.hasOwn(PAPERS_V2, input.paper);
    const hex = typeof input.paper === 'string' && /^#[0-9a-f]{6}$/i.test(input.paper);
    if (input.version !== 2 || !(named || hex || input.paper === undefined)) {
      return { surface: null, errors: [`an ink surface needs version 2 and paper ${Object.keys(PAPERS_V2).join('/')} or #rrggbb`] };
    }
    const paper = input.paper === undefined ? 'night' : named ? PAPERS_V2[input.paper] : input.paper.toLowerCase();
    return { surface: { kind: 'ink', version: 2, paper }, errors: [] };
  }
  if (!input || typeof input !== 'object' || Array.isArray(input) || (input.version !== 1 && input.version !== 2)
    || !Object.hasOwn(PAPERS, input.paper)
    || !num(input.tooth) || input.tooth < 0 || input.tooth > 1
    || !Number.isInteger(input.seed) || input.seed < 0 || input.seed > 4294967295) {
    return { surface: null, errors: ['surface needs version 1 or 2 (a grain you can see), paper white/toned/black, tooth 0..1 and a uint32 seed'] };
  }
  return { surface: { version: input.version, paper: input.paper, tooth: input.tooth, seed: input.seed }, errors: [] };
}

/** Motion is explicit metadata: { frames, fps }. The frame count must match
 * the breaks in the marks, which callers check with countFrames(). */
export function sanitizeMotion(input, page = undefined) {
  if (input === undefined) return { motion: undefined, errors: [] };
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || !Number.isInteger(input.frames) || input.frames < 2 || input.frames > MAX_FRAMES
    || typeof input.fps !== 'number' || !(input.fps >= 1 && input.fps <= 30)) {
    return { motion: null, errors: [`motion needs frames 2..${MAX_FRAMES} and fps 1..30`] };
  }
  /* Viewers keep every frame as a picture to loop smoothly; bound the total. */
  if (page && input.frames * page.w * page.h > 24000000) {
    return { motion: null, errors: ['motion is too large: frames × width × height must stay under 24 million pixels'] };
  }
  if (input.poster !== undefined && (!Number.isInteger(input.poster) || input.poster < 0 || input.poster >= input.frames)) {
    return { motion: null, errors: [`motion poster is a frame index, 0..${input.frames - 1}`] };
  }
  return { motion: { frames: input.frames, fps: input.fps, ...(input.poster ? { poster: input.poster } : {}) }, errors: [] };
}

export const countFrames = (ops) => 1 + ops.reduce((n, o) => n + (o.k === 'frame' ? 1 : 0), 0);

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
  let frames = 1;
  for (let i = 0; i < input.length; i++) {
    const o = input[i];
    if (!o || typeof o !== 'object') { err(i, 'not an object'); continue; }
    if (!KINDS.has(o.k)) { err(i, `unknown kind ${JSON.stringify(o.k)}`); continue; }
    const material = limits.surface && limits.surface.kind !== 'ink';
    if (material ? !['m', 'clean', 'p', 'phase'].includes(o.k) : ['m', 'clean'].includes(o.k)) {
      err(i, 'material gestures require a versioned surface; material and legacy marks cannot be mixed'); continue;
    }
    if (INK_ONLY.has(o.k) && limits.surface?.kind !== 'ink') {
      err(i, "glyphs, shapes and motion need the second canvas: surface: { kind: 'ink', version: 2 }"); continue;
    }
    if (o.k === 'frame') {
      frames++;
      if (frames > MAX_FRAMES) { err(i, `more than ${MAX_FRAMES} frames`); break; }
      out.push({ k: 'frame' });
      continue;
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
      if (o.overprint !== undefined) { const why = overprintProblem(o, limits); if (why) { err(i, why); continue; } if (o.overprint) s.overprint = true; }
      out.push(s);
    } else if (o.k === 'd') {
      if (!inRange([o.x, o.y]) || !num(o.r) || o.r <= 0 || o.r > limits.maxDotRadius) { err(i, 'dot out of range'); continue; }
      if (!LAYER_KEYS.has(o.layer)) { err(i, `unknown layer ${JSON.stringify(o.layer)}`); continue; }
      if (!BRUSH_KEYS.has(o.brush)) { err(i, `unknown brush ${JSON.stringify(o.brush)}`); continue; }
      const d = { k: 'd', x: o.x, y: o.y, r: o.r, layer: o.layer, brush: o.brush };
      if (o.c !== undefined) { const c = colour(o.c); if (!c) { err(i, 'colour is not [r, g, b]'); continue; } d.c = c; }
      if (o.alpha !== undefined) { if (!num(o.alpha) || o.alpha < 0 || o.alpha > 1) { err(i, 'alpha out of range'); continue; } d.alpha = o.alpha; }
      if (o.overprint !== undefined) { const why = overprintProblem(o, limits); if (why) { err(i, why); continue; } if (o.overprint) d.overprint = true; }
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
    } else if (o.k === 't') {
      if (typeof o.text !== 'string' || !o.text.length || o.text.length > MAX_TEXT || /[\u0000-\u0009\u000b-\u001f\u007f]/.test(o.text)) { err(i, `text needs 1..${MAX_TEXT} characters, no control characters but newline`); continue; }
      const t = { k: 't', text: o.text };
      if (o.pts !== undefined) {
        const pts = cleanPts(i, o.pts, limits.maxStrokePoints);
        if (!pts) continue;
        t.pts = pts;
        points += pts.length;
      } else {
        if (!inRange([o.x, o.y])) { err(i, 'text needs an on-page x, y or a path in pts'); continue; }
        t.x = o.x; t.y = o.y;
      }
      const size = o.size ?? 16;
      if (!num(size) || size < 2 || size > 600) { err(i, 'text size needs 2..600 px'); continue; }
      t.size = size;
      const font = o.font ?? 'mono';
      if (!['mono', 'sans', 'serif'].includes(font)) { err(i, "font needs 'mono', 'sans' or 'serif'"); continue; }
      t.font = font;
      const layer = o.layer ?? 'line';
      if (!LAYER_KEYS.has(layer)) { err(i, `unknown layer ${JSON.stringify(layer)}`); continue; }
      t.layer = layer;
      if (o.c !== undefined) { const c = colour(o.c); if (!c) { err(i, 'colour is not [r, g, b]'); continue; } t.c = c; }
      if (o.alpha !== undefined) { if (!num(o.alpha) || o.alpha < 0 || o.alpha > 1) { err(i, 'alpha out of range'); continue; } t.alpha = o.alpha; }
      if (o.rot !== undefined) { if (!num(o.rot) || Math.abs(o.rot) > 32) { err(i, 'rot needs radians, |rot| ≤ 32'); continue; } t.rot = o.rot; }
      if (o.track !== undefined) { if (!num(o.track) || o.track < -0.5 || o.track > 4) { err(i, 'track needs -0.5..4 em'); continue; } t.track = o.track; }
      if (o.align !== undefined) { if (!['left', 'center', 'right'].includes(o.align)) { err(i, 'align needs left, center or right'); continue; } t.align = o.align; }
      if (o.line !== undefined) { if (!num(o.line) || o.line < size * 0.5 || o.line > size * 4) { err(i, 'line height needs 0.5..4 × size'); continue; } t.line = o.line; }
      if (o.weight !== undefined) { if (!Number.isInteger(o.weight) || o.weight < 100 || o.weight > 900) { err(i, 'weight needs 100..900'); continue; } t.weight = o.weight; }
      if (o.wob !== undefined) { if (!num(o.wob) || o.wob < 0 || o.wob > 1) { err(i, 'wob needs 0..1'); continue; } t.wob = o.wob; }
      if (o.erase !== undefined) { if (typeof o.erase !== 'boolean') { err(i, 'erase is true or false'); continue; } if (o.erase) t.erase = true; }
      points += o.text.length;
      out.push(t);
    } else if (o.k === 'f') {
      const poly = cleanPts(i, o.poly, limits.maxPolyPoints, 3);
      if (!poly) continue;
      const f = { k: 'f', poly };
      const layer = o.layer ?? 'tone';
      if (!LAYER_KEYS.has(layer)) { err(i, `unknown layer ${JSON.stringify(layer)}`); continue; }
      f.layer = layer;
      if (o.c !== undefined) { const c = colour(o.c); if (!c) { err(i, 'colour is not [r, g, b]'); continue; } f.c = c; }
      if (o.alpha !== undefined) { if (!num(o.alpha) || o.alpha < 0 || o.alpha > 1) { err(i, 'alpha out of range'); continue; } f.alpha = o.alpha; }
      if (o.grain !== undefined) { if (!num(o.grain) || o.grain < 0 || o.grain > 1) { err(i, 'grain needs 0..1'); continue; } f.grain = o.grain; }
      if (o.erase !== undefined) { if (typeof o.erase !== 'boolean') { err(i, 'erase is true or false'); continue; } if (o.erase) f.erase = true; }
      if (o.overprint !== undefined) { if (typeof o.overprint !== 'boolean') { err(i, 'overprint is true or false'); continue; } if (o.overprint) f.overprint = true; }
      if (f.erase && f.overprint) { err(i, 'a shape either cuts (erase) or prints over (overprint), not both'); continue; }
      if (o.halftone !== undefined) { const h = sanitizeHalftone(o.halftone); if (typeof h === 'string') { err(i, h); continue; } f.halftone = h; }
      points += poly.length;
      out.push(f);
    } else if (o.k === 'clamp') {
      if (!LAYER_KEYS.has(o.layer)) { err(i, `unknown layer ${JSON.stringify(o.layer)}`); continue; }
      if (!num(o.max) || o.max < 0 || o.max > 1) { err(i, 'clamp out of range'); continue; }
      out.push({ k: 'clamp', layer: o.layer, max: o.max });
    }
    if (points > limits.maxPoints) { errors.push(`${points}+ points, limit ${limits.maxPoints}`); break; }
  }
  const stats = { ops: out.length, points, frames };
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
