/* screen-marks.js — gestures for drawing on a screen, expanded into marks.
 *
 * The reference for Prompt Ghost's screen marks (see its docs/SCREEN-MARKS.md).
 * A model says "circle that, arrow from this to that, write 'here'"; this turns
 * it into the engine's op list in the pen, with the hand's unevenness. No
 * outline: the pencil reads by density, and its colour is tuned to the ground
 * (pigment on a light page, chalk on a dark one).
 *
 *   import { expandGestures } from './screen-marks.js';
 *   const ops = expandGestures(gestures, { color: [255, 122, 89], ground: (x, y) => 'light' | 'dark' });
 *
 * Gestures (targets are page rects {x, y, w, h}; the app resolves element ids
 * and normalized bounds to these before calling):
 *   { kind: 'circle',    target }
 *   { kind: 'underline', target }
 *   { kind: 'arrow',     from, to }          rects or points {x, y}
 *   { kind: 'bracket',   target, side }      'left' | 'right' | 'top' | 'bottom'
 *   { kind: 'text',      at: {x, y}, text }
 *   { kind: 'cross',     target }
 * Any gesture may carry `color: [r, g, b]`.
 */

import { OP, PAUSE, PHASE, jitter, seed, textOps } from './mark-engine.js';

const WOB = 1.1;

/** Ground under a path: 'light' or 'dark', from the caller's sampler. */
function groundFor(pts, opts) {
  if (opts.ground === 'light' || opts.ground === 'dark') return opts.ground;
  if (typeof opts.ground === 'function') {
    let light = 0, n = 0;
    for (let i = 0; i < pts.length; i += Math.max(1, Math.floor(pts.length / 6))) { n++; if (opts.ground(pts[i][0], pts[i][1]) === 'light') light++; }
    return light * 2 >= n ? 'light' : 'dark';
  }
  return 'light';
}

/** A pencil's colour on a ground: pigment on white, chalk on black. No outline. */
export function tone(color, ground) {
  const k = ground === 'light' ? 0.78 : 1;                 /* darker on a light page */
  const lift = ground === 'dark' ? 0.22 : 0;               /* lighter, chalkier on a dark one */
  return color.map((v) => Math.round(Math.min(255, v * k + (255 - v) * lift)));
}

/** One pencil stroke. */
export function penStroke(pts, w, color, opts = {}, wob = WOB) {
  const p = jitter(pts, wob);
  return [OP('s', p, 'line', 'pen', w, tone(color, groundFor(p, opts)))];
}

const center = (r) => (r.w === undefined ? [r.x, r.y] : [r.x + r.w / 2, r.y + r.h / 2]);
const asRect = (r) => (r.w === undefined ? { x: r.x - 6, y: r.y - 6, w: 12, h: 12 } : r);

/** A point on a rect's edge in the direction of another point. */
function edgeToward(r, to) {
  const rect = asRect(r);
  const [cx, cy] = center(rect);
  const dx = to[0] - cx, dy = to[1] - cy;
  const hw = rect.w / 2 + 8, hh = rect.h / 2 + 8;
  const t = Math.min(hw / Math.max(1e-6, Math.abs(dx)), hh / Math.max(1e-6, Math.abs(dy)));
  return [cx + dx * t, cy + dy * t];
}

export function circle(target, color, opts, k) {
  const r = asRect(target);
  const pad = 10 + Math.min(r.w, r.h) * 0.12;
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  const rx = r.w / 2 + pad, ry = r.h / 2 + pad;
  const a0 = Math.PI * (0.55 + seed(k, 1) * 0.6); /* start somewhere on the upper left */
  const turns = 1.08 + seed(k, 2) * 0.12;          /* overshoot the join, never close neatly */
  const pts = [];
  const n = 48;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = a0 + t * Math.PI * 2 * turns;
    /* the loop drifts: a hand's ellipse is not concentric */
    const drift = 1 + Math.sin(t * Math.PI * 2 + seed(k, 3) * 6) * 0.05;
    pts.push([cx + Math.cos(a) * rx * drift + (t * 4 - 2), cy + Math.sin(a) * ry * drift * (0.96 + seed(k, 4) * 0.08)]);
  }
  return penStroke(pts, 1, color, opts, WOB * 1.2);
}

export function underline(target, color, opts, k) {
  const r = asRect(target);
  const y = r.y + r.h + 4 + seed(k, 5) * 3;
  const pts = [];
  for (let i = 0; i <= 14; i++) {
    const t = i / 14;
    pts.push([r.x - 3 + (r.w + 8) * t, y + Math.sin(t * Math.PI) * 2.5 + (seed(k, i) - 0.5) * 1.5]);
  }
  const ops = penStroke(pts, 1, color, opts);
  if (seed(k, 6) > 0.55) {
    /* sometimes twice, shorter, for emphasis */
    const p2 = pts.slice(2, 11).map((p) => [p[0] + 6, p[1] + 5]);
    ops.push(...penStroke(p2, 0.85, color, opts));
  }
  return ops;
}

export function arrow(from, to, color, opts, k) {
  const A = edgeToward(from, center(asRect(to)));
  const B = edgeToward(to, center(asRect(from)));
  const dx = B[0] - A[0], dy = B[1] - A[1];
  const L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L, ny = dx / L;
  const bow = (seed(k, 7) - 0.5) * L * 0.22; /* a slightly curved shaft */
  const pts = [];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    const s = Math.sin(t * Math.PI) * bow;
    pts.push([A[0] + dx * t + nx * s, A[1] + dy * t + ny * s]);
  }
  const ops = penStroke(pts, 1, color, opts);
  /* the head: two strokes back from the tip, uneven */
  const tip = pts[pts.length - 1], prev = pts[pts.length - 3];
  const ang = Math.atan2(tip[1] - prev[1], tip[0] - prev[0]);
  const len = 13 + L * 0.04;
  for (const sg of [-1, 1]) {
    const a = ang + Math.PI + sg * (0.42 + seed(k, 8 + sg) * 0.16);
    ops.push(...penStroke([[tip[0], tip[1]], [tip[0] + Math.cos(a) * len * (0.9 + seed(k, 9 + sg) * 0.2), tip[1] + Math.sin(a) * len]], 1, color, opts));
  }
  return ops;
}

export function bracket(target, side, color, opts, k) {
  const r = asRect(target);
  const g = 8, ear = 10 + Math.min(r.w, r.h) * 0.08;
  let pts;
  if (side === 'right') pts = [[r.x + r.w + g - ear, r.y - 2], [r.x + r.w + g, r.y - 2], [r.x + r.w + g + seed(k, 10) * 2, r.y + r.h + 2], [r.x + r.w + g - ear, r.y + r.h + 2]];
  else if (side === 'top') pts = [[r.x - 2, r.y - g + ear], [r.x - 2, r.y - g], [r.x + r.w + 2, r.y - g + seed(k, 10) * 2], [r.x + r.w + 2, r.y - g + ear]];
  else if (side === 'bottom') pts = [[r.x - 2, r.y + r.h + g - ear], [r.x - 2, r.y + r.h + g], [r.x + r.w + 2, r.y + r.h + g + seed(k, 10) * 2], [r.x + r.w + 2, r.y + r.h + g - ear]];
  else pts = [[r.x - g + ear, r.y - 2], [r.x - g, r.y - 2], [r.x - g - seed(k, 10) * 2, r.y + r.h + 2], [r.x - g + ear, r.y + r.h + 2]];
  return penStroke(pts, 1, color, opts);
}

export function cross(target, color, opts, k) {
  const r = asRect(target);
  const o = 4 + seed(k, 11) * 4;
  return [
    ...penStroke([[r.x - o, r.y - o], [r.x + r.w + o, r.y + r.h + o]], 1.1, color, opts),
    ...penStroke([[r.x + r.w + o * 0.7, r.y - o], [r.x - o * 0.7, r.y + r.h + o]], 1.1, color, opts),
  ];
}

export function text(at, str, color, opts, size = 16) {
  const ink = textOps(str, at.x, at.y, size, 'line', 'pen', 0.5, 0.85);
  const c = tone(color, groundFor(ink.flatMap((o) => o.pts), opts));
  for (const o of ink) o.c = c;
  return ink;
}

/**
 * Expand a list of gestures into marks. `opts.color` is the pen (the user's
 * wheel); a gesture's own `color` overrides it. `opts.ground` is 'light',
 * 'dark', or a function (x, y) → either, used to tune the pencil's tone.
 */
export function expandGestures(gestures, opts = {}) {
  const color = opts.color || [150, 205, 255];
  const ops = [];
  gestures.forEach((g, k) => {
    const c = g.color || color;
    const kk = k + (opts.seed || 0) * 17;
    ops.push(PHASE(g.kind, 120));
    switch (g.kind) {
      case 'circle': ops.push(...circle(g.target, c, opts, kk)); break;
      case 'underline': ops.push(...underline(g.target, c, opts, kk)); break;
      case 'arrow': ops.push(...arrow(g.from, g.to, c, opts, kk)); break;
      case 'bracket': ops.push(...bracket(g.target, g.side || 'left', c, opts, kk)); break;
      case 'cross': ops.push(...cross(g.target, c, opts, kk)); break;
      case 'text': ops.push(...text(g.at, String(g.text || '').slice(0, 80), c, opts, g.size)); break;
      default: break;
    }
    ops.push(PAUSE(140 + seed(kk, 12) * 120));
  });
  return ops;
}
