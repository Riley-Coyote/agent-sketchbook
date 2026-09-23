/* mark-engine.js — the hand.
 *
 * A drawing is an ordered list of plain-data ops. The engine replays them onto
 * four layered canvases with a shared family of brushes. Nothing is ever a filled shape and
 * nothing is ever a vector path: every mark is a run of overlapping stamps whose
 * width follows stroke velocity, which is the whole reason the output reads as
 * drawn rather than rendered.
 *
 * Two consequences worth understanding before you change anything:
 *
 *   1. Ops are JSON. A page can be saved, diffed, replayed, thumbnailed and
 *      reworked because it is data, not pixels. Keep it that way.
 *   2. The hand belongs to the ENGINE, not the author. Jitter, the wash ceiling
 *      and velocity-driven width are not decoration — they are what make forty
 *      pages by different authors read as one sketchbook. Do not add an op that
 *      lets a caller bypass them.
 *
 * No framework, no dependencies. ES module.
 */

import { MaterialSurface, gestureSamples } from './material-engine.js';

export const INK = [236, 243, 255];
/* The default ink on light paper in the second canvas: a cool near-black. */
export const INK_DARK = [26, 27, 33];

/* ------------------------------------------------------------ canvas v2 */
/* A page opts into the second canvas with `surface: { kind: 'ink', version: 2,
 * paper }`. Pages without a surface, and the graphite studio, are untouched:
 * they render exactly as they always have. For pages that ask:
 *
 *   - layers accumulate in half-float where the browser supports it. In 8-bit,
 *     sixty faint slate strokes came out nearly pure blue, because premultiplied
 *     rounding ate the red and green; translucent colour now lands on the colour
 *     asked for, and soft brushes stop weaving a dither lattice;
 *   - stamps are spaced by their own radius, so a thin stroke stays a line
 *     instead of beading into dots, with opacity compensated per unit length so
 *     a brush keeps its character;
 *   - the paper belongs to the page: any colour, painted under the layers, and
 *     the default ink turns dark on light paper;
 *   - replay places exactly the stamps finish() does, so an animation ends on
 *     the finished drawing. */
export const PAPERS_V2 = {
  night: 'night', // the original ground: a soft radial dark
  black: '#0c0c0f',
  white: '#f6f6f3',
  cream: '#f3eee2',
  grey: '#b9b8b4',
  slate: '#2a2f36',
  kraft: '#b39a78',
};

/** A paper as the engine paints it: a preset's colour, a #rrggbb, or 'night'.
 * Anything else falls back to night rather than to a silent black fill. */
export function resolvePaper(paper) {
  if (typeof paper === 'string' && Object.hasOwn(PAPERS_V2, paper)) return PAPERS_V2[paper];
  if (typeof paper === 'string' && /^#[0-9a-f]{6}$/i.test(paper)) return paper.toLowerCase();
  return 'night';
}

export function paperIsLight(paper) {
  paper = resolvePaper(paper);
  if (!/^#[0-9a-f]{6}$/i.test(paper)) return false;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(paper.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.5;
}

/** Whether a page's paper is light, for any surface: viewers use it to pick
 * cursor and caption colours. Legacy pages are on dark paper. */
export function surfaceIsLight(surface) {
  if (!surface) return false;
  if (surface.kind === 'ink') return paperIsLight(surface.paper);
  return surface.paper !== 'black';
}

/** Paint a v2 paper into a 2d context of the given pixel size. */
export function paintPaper(ctx, paper, w, h) {
  paper = resolvePaper(paper);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (paper === 'night') {
    const g = ctx.createRadialGradient(w * 0.3, h * 0.12, 0, w * 0.3, h * 0.12, w * 1.2);
    g.addColorStop(0, '#14151a'); g.addColorStop(0.52, '#0b0b0f'); g.addColorStop(1, '#07070a');
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = paper;
  }
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/* ------------------------------------------------------------------ brushes */
/* A brush is a parameter set, not code.
 *   w        base stamp radius
 *   alpha    per-stamp opacity — low, because marks build up
 *   swell    how much width follows velocity
 *   taper    exponent on the velocity curve; high = long thin entry/exit
 *   spacing  distance between stamps, in px
 *   scatter  positional noise, in px (see the noise rule in README)
 *   brk      above this velocity the brush skips stamps (dry media)
 *   dir      stamp is an angled ellipse rather than a disc (charcoal)
 *   sub      subtractive — removes pigment instead of adding it
 *   ceiling  max alpha this brush can ever reach on its layer
 *   minRadius / sampleStep  optional precision settings; legacy defaults .35 / 1.4
 *   softEdge start of a feathered stamp edge, as a fraction of its radius
 */
export const BRUSHES = {
  liner:    { w: 1.0,  alpha: 0.4,   swell: 0.26, taper: 1.7, spacing: 1.4, scatter: 0.05 },
  brush:    { w: 2.2,  alpha: 0.33,  swell: 1.6,  taper: 0.5, spacing: 1.3, scatter: 0.3 },
  chalk:    { w: 2.6,  alpha: 0.38,  swell: 0.8,  taper: 0.9, spacing: 1.7, scatter: 1.7, brk: 0.34 },
  wash:     { w: 9.5,  alpha: 0.032, swell: 0.3,  taper: 1.2, spacing: 1.8, scatter: 3.6, ceiling: 0.4 },
  stipple:  { w: 0.85, alpha: 0.34,  swell: 0.2,  taper: 1,   spacing: 6.2, scatter: 2.9 },
  charcoal: { w: 2.4,  alpha: 0.3,   swell: 0.9,  taper: 0.8, spacing: 1.6, scatter: 1.1, dir: 0.55 },
  eraser:   { w: 3.4,  alpha: 0.62,  swell: 0.42, taper: 1,   spacing: 1.3, scatter: 0.18, sub: true },
  /* for screens: a coloured pencil. dense core, rough edge from the tooth,
   * continuous. no outline — it reads on any ground by density, and the
   * caller tunes the colour to the ground (pigment on white, chalk on black). */
  pen:      { w: 2.7,  alpha: 0.66,  swell: 0.45, taper: 1.1, spacing: 1.0, scatter: 0.9 },
  /* Precision media still use the same pressure, taper and stamp model. Fine
   * pencil samples densely enough that its subpixel marks remain continuous;
   * glaze and soft feather each stamp for controlled gradual transitions. */
  pencil:   { w: 0.9,  alpha: 0.34,  swell: 0.25, taper: 1.25, spacing: 0.1,  scatter: 0.015, minRadius: 0.075, sampleStep: 0.1 },
  glaze:    { w: 14,   alpha: 0.024, swell: 0.38, taper: 1.0,  spacing: 1.4,  scatter: 0.08,  minRadius: 0.16,  sampleStep: 1.4, softEdge: 0.2 },
  soft:     { w: 3.6,  alpha: 0.2,   swell: 0.5,  taper: 1.0,  spacing: 0.5,  scatter: 0.035, minRadius: 0.12,  sampleStep: 0.5, softEdge: 0.4 },
};

/* Four layers, composited in this order. The split exists so tone can be
 * clamped and erased independently of line, and so a viewer can toggle them. */
export const LAYERS = [
  { key: 'under',  name: 'Underdrawing', op: 0.42 },
  { key: 'tone',   name: 'Tone',         op: 1 },
  { key: 'line',   name: 'Line',         op: 1 },
  { key: 'accent', name: 'Accent',       op: 1 },
];

/* ------------------------------------------------------------ glyphs */
/* Text as marks, on the second canvas. Type is the medium a language mind is
 * most at home in: ASCII and braille images, concrete poetry, calligrams,
 * lettering. Glyphs are set in two bundled faces so a page renders the same
 * everywhere, and they are typed out one by one on replay. Braille patterns
 * and block elements are drawn as geometry — dots and cells — so grids tile
 * without font seams. There is still no raster op: a glyph is a vector mark
 * from a known face, like a stroke is a run of stamps. */
export const FONTS = {
  mono: { family: 'SketchMono', file: './fonts/jetbrains-mono-nl.woff', advance: 0.6, fallback: 'monospace' },
  sans: { family: 'SketchSans', file: './fonts/inter.woff', weight: '100 900', fallback: 'sans-serif' },
  serif: { family: 'SketchSerif', file: './fonts/cormorant-garamond.woff', weight: '300 700', fallback: 'serif' },
};
const fontsLoading = {};
/** Register and load bundled faces once per document: the ones named, or all
 * of them. Never throws: a missing face falls back to the platform's, rather
 * than losing the page. */
export function loadFonts(names = Object.keys(FONTS)) {
  if (typeof document === 'undefined' || !document.fonts || typeof FontFace === 'undefined') return Promise.resolve();
  return Promise.all(names.filter((n) => FONTS[n]).map((n) => (fontsLoading[n] ||= (async () => {
    const f = FONTS[n];
    const face = new FontFace(f.family, `url(${new URL(f.file, import.meta.url)}) format('woff')`, f.weight ? { weight: f.weight } : {});
    document.fonts.add(face);
    await face.load();
  })().catch(() => {})))).then(() => {});
}

const GLYPH_KEYS = ['size', 'font', 'layer', 'c', 'alpha', 'rot', 'track', 'align', 'line', 'weight', 'wob', 'erase'];
const glyphOpts = (o) => Object.fromEntries(GLYPH_KEYS.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));

/** A run of glyphs from (x, y) on its baseline. `\n` starts a new line.
 * opts: size px (16) · font 'mono' | 'sans' | 'serif' · layer ('line') · c [r,g,b] ·
 * alpha · rot radians · track (extra em between glyphs) · align
 * 'left' | 'center' | 'right' · line (line height px) · weight 100–900 (sans), 300–700 (serif)
 * · wob 0–1 (the hand's unevenness) · erase (cut the text out of the layer). */
export const GLYPHS = (text, x, y, opts = {}) => ({ k: 't', text, x, y, ...glyphOpts(opts) });
/** Glyphs set along a path, each turned to it: `pts` is the baseline. */
export const ALONG = (text, pts, opts = {}) => ({ k: 't', text, pts, ...glyphOpts(opts) });
/** A monospace block — ASCII, braille, box drawing — one op per non-empty row.
 * Cells are 0.6 × size wide and `line` (1.25 × size) tall, and tile exactly. */
export function GRID(rows, x, y, opts = {}) {
  const size = opts.size ?? 12;
  const line = opts.line ?? size * 1.25;
  const out = [];
  rows.forEach((row, i) => { if (row.length) out.push({ k: 't', text: row, x, y: y + i * line, ...glyphOpts({ ...opts, size, line, font: 'mono' }) }); });
  return out;
}

/** A flat shape: print, cut paper, a colour field. `grain` (0–1) takes ink out
 * in a fixed speckle anchored to the page, as a screen or riso pull does; the
 * same grain lines up across every shape. `overprint` multiplies the ink with
 * what is already on its layer, as a second riso colour does over the first.
 * `erase` cuts the shape out instead. */
export const SHAPE = (poly, c = undefined, opts = {}) => ({ k: 'f', poly, ...(c ? { c } : {}), ...Object.fromEntries(['layer', 'alpha', 'grain', 'erase', 'overprint', 'halftone'].filter((k) => opts[k] !== undefined).map((k) => [k, opts[k]])) });

/* Halftone: how big a dot must be for its cell to be `t` inked. Past a radius
 * of half the cell, dots meet their neighbours; the ink within a cell is then
 * the circle less the four segments beyond the cell's sides. Worked out once,
 * in cell units, and read back by bisection. */
const dotCoverage = (r) => {
  if (r <= 0.5) return Math.PI * r * r;
  if (r >= Math.SQRT1_2) return 1;
  const seg = r * r * Math.acos(0.5 / r) - 0.5 * Math.sqrt(r * r - 0.25);
  return Math.PI * r * r - 4 * seg;
};
function dotRadius(t) {
  if (t >= 1) return Math.SQRT1_2 + 0.01;
  let lo = 0, hi = Math.SQRT1_2;
  for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (dotCoverage(mid) < t) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}
/** A halftone's tone at a point: flat, a linear ramp, or a radial one. */
function toneAt(tone) {
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  if (typeof tone === 'number') return () => tone;
  if (tone?.from) {
    const [ax, ay, av] = tone.from, [bx, by, bv] = tone.to, dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
    return (x, y) => av + (bv - av) * clamp01(((x - ax) * dx + (y - ay) * dy) / l2);
  }
  if (tone?.at) {
    const [cx, cy] = tone.at;
    return (x, y) => tone.inner + (tone.outer - tone.inner) * clamp01(Math.hypot(x - cx, y - cy) / tone.r);
  }
  return () => 0.5;
}

const hash01 = (a, b) => frac(Math.sin(a * 127.1 + b * 311.7) * 43758.5453);
const BRAILLE_DOTS = [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2], [0, 3], [1, 3]];

/* Block elements as cells [x0, y0, x1, y1] in eighths of the cell, plus shade. */
function blockCells(cp) {
  const Q = { ul: [0, 0, 4, 4], ur: [4, 0, 8, 4], ll: [0, 4, 4, 8], lr: [4, 4, 8, 8] };
  if (cp === 0x2580) return [[0, 0, 8, 4]];
  if (cp >= 0x2581 && cp <= 0x2588) { const n = cp - 0x2580; return [[0, 8 - n, 8, 8]]; }
  if (cp >= 0x2589 && cp <= 0x258f) { const n = 0x2590 - cp; return [[0, 0, n, 8]]; }
  if (cp === 0x2590) return [[4, 0, 8, 8]];
  if (cp >= 0x2591 && cp <= 0x2593) return [[0, 0, 8, 8, (cp - 0x2590) * 0.25]];
  if (cp === 0x2594) return [[0, 0, 8, 1]];
  if (cp === 0x2595) return [[7, 0, 8, 8]];
  const quads = { 0x2596: ['ll'], 0x2597: ['lr'], 0x2598: ['ul'], 0x2599: ['ul', 'll', 'lr'], 0x259a: ['ul', 'lr'], 0x259b: ['ul', 'ur', 'll'], 0x259c: ['ul', 'ur', 'lr'], 0x259d: ['ur'], 0x259e: ['ur', 'll'], 0x259f: ['ur', 'll', 'lr'] }[cp];
  return quads ? quads.map((q) => Q[q]) : [];
}

/* ------------------------------------------------------------------ helpers */

export const frac = (v) => v - Math.floor(v);
/* Deterministic hash noise. Every random-looking value in a page must come
 * from here, so a page's ops are reproducible from its seed. */
export const seed = (a, b) => frac(Math.sin(a * 12.9898 + b * 78.233) * 43758.5453);

export const arc = (cx, cy, rx, ry, a0, a1, n = 24) => {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (a1 - a0) * (i / n);
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return pts;
};

export const ellipse = (cx, cy, rx, ry) => arc(cx, cy, rx, ry, -0.5, Math.PI * 2 - 0.5, 34);

/* Wobble applied at AUTHORING time, so it is baked into the saved page and the
 * drawing is identical on every replay. */
export const jitter = (pts, amt) => pts.map((p, i) => {
  const t = i / (pts.length - 1 || 1);
  return [
    p[0] + (Math.sin(t * 7.3 + p[1] * 0.03) * 0.6 + Math.sin(t * 17.1) * 0.4) * amt,
    p[1] + (Math.cos(t * 6.1 + p[0] * 0.03) * 0.6 + Math.sin(t * 13.7) * 0.4) * amt,
  ];
});

/* Parallel path at distance d — cylinders, stems, double-line edges. */
export const offsetPath = (pts, d) => pts.map((p, i) => {
  const q = pts[Math.min(pts.length - 1, i + 1)];
  const a = Math.atan2(q[1] - p[1], q[0] - p[0]) + Math.PI / 2;
  return [p[0] + Math.cos(a) * d, p[1] + Math.sin(a) * d];
});

/* ---------------------------------------------------------------------- ops */

/** A stroke. kind 's' = normal, 'g' = construction (forced faint).
 * Optional alpha multiplies every stamp's opacity without changing its width. */
/* `opts.overprint` (second canvas only) lays the mark as transparent paint:
 * each stamp multiplies what is already on its layer, as pigment does, so
 * yellow under blue makes green and a second coat is darker than the first. */
export const OP = (kind, pts, layer, brush, w = 1, c = undefined, alpha = undefined, opts = {}) => ({ k: kind, pts, layer, brush, w, ...(c ? { c } : {}), ...(alpha === undefined ? {} : { alpha }), ...(opts.overprint ? { overprint: true } : {}) });
/** A soft pressure dot — anthers, pupils, points of light. */
export const DOT = (x, y, r, layer, brush, c = undefined, alpha = undefined, opts = {}) => ({ k: 'd', x, y, r, layer, brush, ...(c ? { c } : {}), ...(alpha === undefined ? {} : { alpha }), ...(opts.overprint ? { overprint: true } : {}) });
/** Dead time. The hand stopping to look is most of what makes replay legible. */
export const PAUSE = (ms) => ({ k: 'p', ms });
/** Names the section of work now beginning; surfaces in the UI. */
export const PHASE = (name, ms = 240) => ({ k: 'phase', name, ms });
/** Clears a silhouette out of the layers behind it. See the occlusion rule. */
export const OCCLUDE = (poly, a = 0.9) => ({ k: 'occ', poly, a });
/** Caps a layer's alpha — how the wash is kept honest. */
export const CLAMP = (layer, max) => ({ k: 'clamp', layer, max });

/* ------------------------------------------------------- form vocabulary */
/* These encode DRAWING knowledge, not subject knowledge. There is no
 * drawFlower(). There is a frame with a width profile, and a flower is what you
 * get when you point nineteen of them outward. Add primitives here freely;
 * adding subjects here is how this becomes a clipart library. */

/**
 * A bent axis with a width profile across it — petal, leaf, finger, feather,
 * hull, blade. Everything else in a subject samples this one frame, which is
 * why the parts of a form stay registered to each other.
 *
 * `squash` then flattens the whole form about `horizonY`. That single term is
 * what turns a flat rosette into a disc seen at an angle, and it is the largest
 * single contributor to the drawing not looking like a diagram.
 *
 * Returns { at(u, v), half(u) } where u runs 0→1 along the axis and v runs
 * -1→1 across it, so v = ±1 is the edge and v = 0 the midrib.
 */
export function axisFrame(cx, cy, ang, L, W, curl, twist, squash = 1, horizonY = cy) {
  const dx = Math.cos(ang), dy = Math.sin(ang);
  const px = -dy, py = dx;
  const half = (u) => W * Math.pow(Math.sin(Math.PI * Math.min(1, 0.08 + u * 0.92)), 0.5) * (1 - 0.1 * u);
  const at = (u, vf) => {
    const bend = curl * u * u * L;
    const ax = cx + dx * (u * L) + px * bend;
    const ay = cy + dy * (u * L) + py * bend;
    const v = vf * half(u) * (1 + twist * (vf > 0 ? u : -u) * 0.5);
    const x = ax + px * v, y = ay + py * v;
    return [x, horizonY + (y - horizonY) * squash];
  };
  return { at, half };
}

/** Closed polygon around a frame — for OCCLUDE, never for drawing. */
export function silhouette(f, grow = 1.07) {
  const poly = [];
  for (let i = 0; i <= 24; i++) poly.push(f.at(-0.03 + 1.03 * (i / 24), -grow));
  for (let i = 0; i <= 24; i++) poly.push(f.at(1 - 1.03 * (i / 24), grow));
  return poly;
}

/**
 * The outline of a form: two edges, deliberately unequal. One carries round the
 * tip, the other stops short. A symmetrical closed outline is the single most
 * diagram-like thing you can draw, so this primitive refuses to make one.
 */
export function contour(f, layer, brush, wob, opts = {}) {
  const edge = (sign, from, to, n) => {
    const pts = [];
    for (let i = 0; i <= n; i++) pts.push(f.at(from + (to - from) * (i / n), sign));
    return pts;
  };
  const w = opts.w || 0.62;
  return [
    OP('s', jitter(edge(-1, -0.05, 1.0, 26).concat(edge(1, 1.0, 0.72, 8)), wob), layer, brush, w),
    OP('s', jitter(edge(1, -0.03, 0.88, 22), wob * 1.15), layer, brush, w * 0.8),
  ];
}

/** Creases fanning from the base — folds, tendons, gill lines. */
export function creases(f, wob, count, layer, brush, weight = 0.34) {
  const ops = [];
  for (let k = 0; k < count; k++) {
    const s = count === 1 ? 0 : -0.62 + 1.24 * (k / (count - 1));
    const pts = [];
    for (let i = 0; i <= 14; i++) {
      const u = 0.07 + 0.78 * (i / 14);
      pts.push(f.at(u, s * (0.35 + 0.55 * u)));
    }
    ops.push(OP('s', jitter(pts, wob * 0.7), layer, brush, weight));
  }
  return ops;
}

/**
 * Tone laid in beads ACROSS the axis, alternating direction, heaviest at the
 * base. Beads must be wider than their spacing or the pass dries as stripes —
 * and stripes from forms at different angles cross into a visible weave, which
 * is the ugliest failure this engine has.
 */
export function washAcross(f, wob, rows, layer, brush, weight = 1) {
  const ops = [];
  for (let i = 0; i < rows; i++) {
    const u = 0.05 + 0.88 * ((i + 0.5) / rows) + Math.sin(i * 2.3) * 0.012;
    const dir = i % 2 === 0 ? 1 : -1;
    const a = f.at(u, -0.98 * dir);
    const b = f.at(u, 0.98 * dir);
    ops.push(OP('s', jitter([a, b], wob), layer, brush, (1.1 + (1 - u) * 1.5) * weight));
  }
  return ops;
}

/** Straight hatching in a box at an angle — flat planes, backgrounds, shadow. */
export function hatch(x0, y0, x1, y1, ang, gap, layer, brush, wob, weight = 0.6) {
  const ops = [];
  const dx = Math.cos(ang), dy = Math.sin(ang);
  const px = -dy, py = dx;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const span = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.floor(span / gap);
  for (let i = -n; i <= n; i++) {
    const ox = cx + px * i * gap, oy = cy + py * i * gap;
    const half = span * 0.5 * (0.6 + 0.4 * seed(i, 3));
    const a = [ox - dx * half, oy - dy * half];
    const b = [ox + dx * half, oy + dy * half];
    if (Math.min(a[0], b[0]) > x1 || Math.max(a[0], b[0]) < x0) continue;
    if (Math.min(a[1], b[1]) > y1 || Math.max(a[1], b[1]) < y0) continue;
    ops.push(OP('s', jitter([a, b], wob), layer, brush, weight));
  }
  return ops;
}

/** Serrated edge — leaves, torn paper, saw teeth. */
export function serrate(f, sign, wob, layer, brush, weight = 0.42, n = 64, depth = 0.03) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const u = -0.02 + 0.98 * (i / n);
    const notch = 1 + (i % 8 === 0 ? -depth : i % 8 === 4 ? depth * 0.73 : 0);
    pts.push(f.at(u, sign * notch));
  }
  return OP('s', jitter(pts, wob), layer, brush, weight);
}

/* ------------------------------------------------------------ handwriting */
/* Single-stroke glyphs, so the agent's notes are drawn by the same hand as the
 * drawing. Glyph box: x 0..~5, y 0 (ascender) .. 10 (baseline) .. 13 (descender). */

const FONT_SRC = {
  a: '5,5|3.6,3.9|1.6,4.6|1,6.6|1.8,9.4|3.8,9.8|5,8.6;5,4.2|5,10',
  b: '1,0|1,10;1,6|2.4,4.4|4.2,4.6|5,6.4|4.4,9.2|2.6,9.9|1,9',
  c: '5,5.4|3.4,3.9|1.4,5|1,6.9|1.7,9.2|3.6,9.9|5,9.1',
  d: '5,0|5,10;5,6|3.6,4.4|1.8,4.6|1,6.4|1.6,9.2|3.4,9.9|5,9',
  e: '1,7.2|5,6.6|4.4,4.6|2.4,4.1|1,6|1.4,8.9|3.2,9.9|4.9,9.2',
  f: '4.8,1.2|3.6,0.6|2.4,1.6|2.2,10;0.6,4.4|4.4,4.2',
  g: '5,5|3.4,4|1.5,4.8|1,6.6|1.8,9.2|3.6,9.6|5,8.6;5,4.2|5,11.4|4,12.9|2,13|0.9,12.2',
  h: '1,0|1,10;1,6.6|2.4,4.6|4.2,4.6|5,6.2|5,10',
  i: '2.6,4.4|2.6,10;2.6,2.2|2.72,2.42',
  j: '3,4.4|3,11.6|2.2,12.9|0.9,12.8;3,2.2|3.12,2.42',
  k: '1,0|1,10;4.8,4.6|1.2,7.6;2.4,6.8|5,10',
  l: '2.4,0|2.4,8.8|3.4,10',
  m: '1,4.4|1,10;1,6.2|2,4.6|3,5.2|3,10;3,6.2|4,4.6|5,5.4|5,10',
  n: '1,4.4|1,10;1,6.4|2.4,4.6|4.2,4.8|5,6.4|5,10',
  o: '3,4|1.2,5.4|1,7.2|2,9.4|3.8,9.8|5,8.2|4.8,5.8|3,4',
  p: '1,4.4|1,13;1,6.2|2.4,4.4|4.2,4.6|5,6.6|4.2,9.4|2.4,9.8|1,8.8',
  q: '5,4.4|5,13;5,6.2|3.6,4.4|1.8,4.6|1,6.6|1.8,9.4|3.6,9.8|5,8.8',
  r: '1.4,4.4|1.4,10;1.4,6.6|2.6,4.8|4.4,4.6',
  s: '4.8,5.2|3,4|1.4,4.8|1.6,6.4|3.6,7.2|4.8,8.2|4.2,9.6|2.2,9.9|1,9.2',
  t: '2.4,1.4|2.4,8.6|3.4,10|4.6,9.6;0.8,4.4|4.2,4.2',
  u: '1,4.4|1,8|2,9.7|3.8,9.6|5,7.8|5,4.4;5,7.8|5,10',
  v: '1,4.4|3,10|5,4.4',
  w: '0.8,4.4|2,10|3,6.4|4,10|5.2,4.4',
  x: '1,4.4|5,10;5,4.4|1,10',
  y: '1,4.4|3,10;5,4.4|2.4,11.4|1,12.9',
  z: '1,4.6|5,4.4|1,9.8|5,9.8',
  '0': '3,3.4|1.2,5|1,7.6|2,9.6|3.8,9.9|4.9,8|4.8,5.2|3,3.4',
  '1': '1.4,5|2.8,3.4|2.8,9.9;1.4,10|4.2,9.8',
  '2': '1.2,4.8|2.6,3.4|4.4,4|4.6,6|1,9.9|4.9,9.7',
  '3': '1.2,4.2|3.4,3.4|4.6,4.8|3.4,6.6|4.8,8|4.2,9.6|2,10|1,9.2',
  '4': '3.8,3.4|1,8.2|5,8.2;3.8,6|3.8,10',
  '5': '4.6,3.6|1.6,3.6|1.4,6.4|3.4,6|4.8,7.2|4.4,9.4|2.2,10|1,9.2',
  '6': '4.6,3.8|2.4,4.6|1,7|1.4,9.2|3.4,10|4.8,8.6|4,6.8|2,6.8|1.2,7.6',
  '7': '1,3.6|4.9,3.6|2.4,10',
  '8': '3,3.4|1.4,4.6|1.8,6.4|3.6,7|4.8,8.2|4.2,9.7|2.2,9.9|1.1,8.6|2,7.2|4.4,6.2|4.6,4.4|3,3.4',
  '9': '4.6,6.4|3,7.2|1.2,6.4|1.4,4.4|3.4,3.5|4.7,5.2|4.6,8.4|3.4,10|1.6,9.6',
  '.': '2.4,9.6|2.52,9.9',
  ',': '2.4,9.4|2,11',
  ':': '2.4,5.6|2.52,5.9;2.4,9.6|2.52,9.9',
  "'": '2.6,2.4|2.2,4',
  '-': '1,7.2|4.6,7.1',
  '/': '4.6,3.6|1,10',
  '?': '1.4,4.4|2.8,3.4|4.4,4.4|3.8,6.4|2.8,7.2|2.8,8.2;2.8,9.6|2.92,9.9',
  '!': '2.6,3.4|2.6,8.2;2.6,9.6|2.72,9.9',
};

export const FONT = {};
Object.keys(FONT_SRC).forEach((ch) => {
  const strokes = FONT_SRC[ch].split(';').map((s) => s.split('|').map((p) => p.split(',').map(Number)));
  let mx = 0;
  strokes.forEach((st) => st.forEach((p) => { if (p[0] > mx) mx = p[0]; }));
  FONT[ch] = { strokes, adv: mx + 1.7 };
});

/** Handwriting as ordinary strokes. `y` is the baseline. */
/** Handwriting as strokes: the book's own single-stroke hand. `c` [r,g,b] and
 * `alpha` colour it like any stroke. */
export function textOps(text, x, y, size, layer = 'line', brush = 'liner', wob = 0.5, weight = 0.5, c = undefined, alpha = undefined) {
  const s = size / 10;
  const ops = [];
  let cx = x;
  for (const ch of String(text).toLowerCase()) {
    const g = FONT[ch];
    if (!g) { cx += size * 0.44; continue; }
    g.strokes.forEach((st) => {
      const pts = st.map((p) => [cx + p[0] * s, y + (p[1] - 10) * s]);
      ops.push(OP('s', wob ? jitter(pts, wob) : pts, layer, brush, weight, c, alpha));
    });
    cx += g.adv * s;
  }
  return ops;
}

/** Width of a handwritten run, for layout. */
export function textWidth(text, size) {
  const s = size / 10;
  let w = 0;
  for (const ch of String(text).toLowerCase()) {
    const g = FONT[ch];
    w += g ? g.adv * s : size * 0.44;
  }
  return w;
}

/** Greedy wrap into handwritten lines. */
export function textBlock(text, x, y, size, maxW, lineH, layer, brush, wob, weight, c = undefined, alpha = undefined) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (textWidth(test, size) > maxW && line) { lines.push(line); line = word; }
    else line = test;
  }
  if (line) lines.push(line);
  const ops = [];
  lines.forEach((l, i) => {
    ops.push(...textOps(l, x, y + i * (lineH || size * 1.55), size, layer, brush, wob, weight, c, alpha));
  });
  return { ops, lines: lines.length, height: lines.length * (lineH || size * 1.55) };
}

/* -------------------------------------------------------------- the engine */

export class MarkEngine {
  constructor({ width, height, dpr = 2, ink = INK, surface = undefined } = {}) {
    this.w = width;
    this.h = height;
    this.dpr = dpr;
    this.v2 = surface?.kind === 'ink';
    this.paper = this.v2 ? resolvePaper(surface.paper) : null;
    this.ink = this.v2 && ink === INK && paperIsLight(this.paper) ? INK_DARK : ink;
    this.material = surface && !this.v2 ? new MaterialSurface({ width, height, surface }) : null;
    this.float = false;
    this.plans = new WeakMap();
    this.ops = [];
    this.cursor = null;
    this.pen = null;
    this.phase = null;
    this.done = false;
    this.progress = 0;
    this.total = 0;
    this.layers = {};
    for (const l of LAYERS) {
      const cv = document.createElement('canvas');
      cv.width = width * dpr;
      cv.height = height * dpr;
      const ctx = this.v2 ? cv.getContext('2d', { colorType: 'float16' }) : cv.getContext('2d');
      if (this.v2 && ctx.getContextAttributes?.().colorType === 'float16') this.float = true;
      ctx.scale(dpr, dpr);
      this.layers[l.key] = { cv, ctx };
    }
  }

  /** Install a page. Ops are plain data and are never mutated except for an
   *  internal resample cache, which is why a page round-trips through JSON. */
  load(ops) {
    /* A motion page's marks hold { k: 'frame' } breaks. Replay and finish()
     * draw its first frame; drawFrame(i) and motionFrames() reach the rest. */
    this.allOps = ops;
    this.frames = null;
    this._motionFrames = null;
    if (ops.some((o) => o.k === 'frame')) {
      this.frames = [[]];
      for (const op of ops) op.k === 'frame' ? this.frames.push([]) : this.frames.at(-1).push(op);
      ops = this.frames[0];
    }
    this.ops = ops;
    this.cache = new WeakMap();
    this.plans = new WeakMap();
    this.total = ops.reduce((s, o) => s + this.duration(o), 0);
    this.clear();
    return this;
  }

  clear() {
    if (this.material) this.material.clear();
    if (this._coat) { this._coat = null; const { cv, ctx } = this._sheet; ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height); ctx.restore(); }
    for (const l of LAYERS) {
      const L = this.layers[l.key];
      L.ctx.setTransform(1, 0, 0, 1, 0, 0);
      L.ctx.clearRect(0, 0, L.cv.width, L.cv.height);
      L.ctx.scale(this.dpr, this.dpr);
    }
  }

  /** Load what the page's marks need before drawing: the glyph faces. Call
   * after load() and before finish() or replay(). Harmless for other pages. */
  async ready() {
    const faces = new Set((this.allOps || this.ops).filter((o) => o.k === 't').map((o) => o.font ?? 'mono'));
    if (faces.size) {
      await loadFonts([...faces]);   // only the faces this page sets type in
      this.plans = new WeakMap(); // measurements taken before the faces arrived are stale
    }
    return this;
  }

  /** How many frames the page has: 1 for a still. */
  get frameCount() { return this.frames ? this.frames.length : 1; }

  /** Draw frame i of a motion page, finished, in place of whatever was drawn. */
  drawFrame(i) {
    const marks = this.frames ? this.frames[((i % this.frames.length) + this.frames.length) % this.frames.length] : this.ops;
    this.clear();
    for (const op of marks) { if (op.k !== 'p' && op.k !== 'phase') this.run(op, 0, 1); else this.endCoat(); }
    this.endCoat();
    this.cursor = null;
    this.pen = null;
    this.phase = null;
    this.done = true;
    this.progress = 1;
    return this;
  }

  /** motionFrames(), one frame at a time, yielding to the page between frames
   * so a heavy loop never freezes it. `onFrame(k, n)` reports progress;
   * when `isCurrent()` turns false it stops and resolves null. Leaves the
   * engine showing frame `rest`. The frames are kept, as motionFrames keeps
   * them, until the next load(). */
  async prepareFrames({ onFrame, isCurrent = () => true, rest = 0 } = {}) {
    if (!this._motionFrames) {
      const pictures = [];
      for (let i = 0; i < this.frameCount; i++) {
        await new Promise((next) => setTimeout(next, 0));
        if (!isCurrent()) return null;
        this.drawFrame(i);
        const c = document.createElement('canvas');
        c.width = this.w * this.dpr;
        c.height = this.h * this.dpr;
        this.composite(c.getContext('2d'));
        pictures.push(c);
        onFrame?.(i + 1, this.frameCount);
      }
      this._motionFrames = pictures;
    } else await null;
    if (!isCurrent()) return null;
    this.drawFrame(rest);
    return this._motionFrames;
  }

  /** Every frame flattened to its own canvas, once, so a viewer can loop
   * them smoothly. Leaves the engine showing the first frame. Blocks until
   * done: viewers use Loop (below), which prepares frames without freezing. */
  motionFrames() {
    if (this._motionFrames) return this._motionFrames;
    const pictures = [];
    for (let i = 0; i < this.frameCount; i++) {
      this.drawFrame(i);
      const c = document.createElement('canvas');
      c.width = this.w * this.dpr;
      c.height = this.h * this.dpr;
      this.composite(c.getContext('2d'));
      pictures.push(c);
    }
    this.drawFrame(0);
    return (this._motionFrames = pictures);
  }

  /** Start replaying from blank. */
  replay() {
    this.clear();
    this.cursor = { i: 0, u: 0, elapsed: 0 };
    this.pen = null;
    this.phase = null;
    this.done = false;
    this.progress = 0;
    return this;
  }

  /** Draw the whole page instantly — thumbnails, print, restoring a read page. */
  finish() {
    this.clear();
    for (const op of this.ops) {
      if (op.k === 'p' || op.k === 'phase') { this.endCoat(); continue; }
      this.run(op, 0, 1);
    }
    this.endCoat();
    this.cursor = null;
    this.pen = null;
    this.phase = null;
    this.done = true;
    this.progress = 1;
    return this;
  }

  /** Continue a finished page without clearing its pigment or resample cache.
   * The caller validates new ops just as it does before load(). */
  append(ops, { animate = false } = {}) {
    if (!Array.isArray(ops)) throw new TypeError('append expects an array of ops');
    if (!this.done && this.ops.length) throw new Error('finish the current drawing before appending marks');
    if (!ops.length) return this;
    const start = this.ops.length;
    const elapsed = this.total;
    this.cache ||= new WeakMap();
    const addedDuration = ops.reduce((s, o) => s + this.duration(o), 0);
    this.ops = this.ops.concat(ops);
    this.total += addedDuration;
    this.pen = null;
    this.phase = null;
    if (animate) {
      this.cursor = { i: start, u: 0, elapsed };
      this.done = false;
      this.progress = elapsed / (this.total || 1);
    } else {
      for (const op of ops) {
        if (op.k !== 'p' && op.k !== 'phase') this.run(op, 0, 1);
        else this.endCoat();
      }
      this.endCoat();
      this.cursor = null;
      this.pen = null;
      this.done = true;
      this.progress = 1;
    }
    return this;
  }

  /** Advance by dt seconds at `speed`×. Returns true while still drawing. */
  tick(dt, speed = 1) {
    if (!this.cursor) return false;
    let budget = dt * speed;
    let guard = 0;
    while (budget > 0 && this.cursor.i < this.ops.length && guard++ < 2000) {
      const op = this.ops[this.cursor.i];
      const dur = this.duration(op);
      const room = dur * (1 - this.cursor.u);
      const use = Math.min(budget, room);
      const u0 = this.cursor.u;
      const u1 = u0 + (dur ? use / dur : 1);
      if (op.k === 'phase' || op.k === 'p') this.endCoat();
      if (op.k === 'phase') this.phase = op.name;
      else if (op.k !== 'p') this.run(op, u0, Math.min(1, u1));
      budget -= use;
      this.cursor.u = u1;
      this.cursor.elapsed += use;
      if (this.cursor.u >= 1) { this.cursor.i++; this.cursor.u = 0; }
    }
    this.progress = Math.min(1, this.cursor.elapsed / (this.total || 1));
    if (this.cursor.i >= this.ops.length) {
      this.endCoat();
      this.cursor = null;
      this.pen = null;
      this.phase = null;
      this.done = true;
      this.progress = 1;
      return false;
    }
    return true;
  }

  /** Composite the layers into a target 2d context. `hidden` is a key→bool map. */
  composite(ctx, hidden = {}) {
    if (this.material) { this.material.composite(ctx, this.w * this.dpr, this.h * this.dpr); return; }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.w * this.dpr, this.h * this.dpr);
    if (this.v2) paintPaper(ctx, this.paper, this.w * this.dpr, this.h * this.dpr);
    for (const l of LAYERS) {
      if (hidden[l.key]) continue;
      ctx.globalAlpha = l.op;
      ctx.drawImage(this.layers[l.key].cv, 0, 0);
      if (this._coat?.layer === l.key) {
        // a coat still being laid (mid-replay) shows over its layer until it lands
        ctx.globalCompositeOperation = 'multiply';
        ctx.drawImage(this._sheet.cv, 0, 0);
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    ctx.globalAlpha = 1;
  }

  /** Flatten to a data URL — cover thumbnails, exports. */
  toDataURL(type = 'image/png') {
    const out = document.createElement('canvas');
    out.width = this.w * this.dpr;
    out.height = this.h * this.dpr;
    this.composite(out.getContext('2d'));
    return out.toDataURL(type);
  }

  /* ---------------------------------------------------------- internals */

  resample(op) {
    let r = this.cache.get(op);
    if (r) return r;
    const pts = op.pts;
    const sampleStep = BRUSHES[op.brush]?.sampleStep ?? 1.4;
    const out = [];
    let len = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const n = Math.max(2, Math.ceil(d / sampleStep));
      for (let j = 0; j < n; j++) {
        const t = j / n;
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
      len += d;
    }
    out.push(pts[pts.length - 1]);
    r = { pts: out, len };
    this.cache.set(op, r);
    return r;
  }

  duration(op) {
    if (op.k === 'm') return Math.max(.032, (op.samples.at(-1).t - op.samples[0].t) / 1000);
    if (op.k === 'clean') return .02;
    if (op.k === 'p' || op.k === 'phase') return op.ms / 1000;
    if (op.k === 'clamp') return 0.02;
    if (op.k === 'occ') return 0.03;
    if (op.k === 'd') return 0.12;
    if (op.k === 'f') return 0.25;
    if (op.k === 't') {
      /* Short runs type at a natural pace; long runs and big grids speed up,
       * so a page of thousands of glyphs replays in seconds, not minutes. */
      const n = Array.from(op.text).length;
      return Math.max(0.05, Math.min(n * Math.min(0.04, Math.max(0.006, (op.size ?? 16) * 0.0015)), 0.6 + n * 0.004));
    }
    const br = BRUSHES[op.brush] || BRUSHES.brush;
    const px = op.k === 'g' ? 1300 : br === BRUSHES.wash ? 1500 : 620;
    return Math.max(0.05, this.resample(op).len / px);
  }

  stamp(x, y, vel, br, layer, wmul, ink = this.ink, alpha = undefined, target = null) {
    const ctx = target || (this.layers[layer] || this.layers.line).ctx;
    if (br.brk && vel > br.brk) {
      const over = (vel - br.brk) / (1 - br.brk);
      if (frac(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) < Math.min(0.8, over * 0.85)) return;
    }
    /* Scatter must be NOISE. A smooth sin() offset is a wave, and across a wash
     * it beats against the bead spacing into a woven checkerboard. */
    const sc = br.scatter;
    const gx = x + (sc ? (frac(Math.sin(x * 127.1 + y * 311.7) * 43758.5453) - 0.5) * sc * 2 : 0);
    const gy = y + (sc ? (frac(Math.sin(x * 269.5 + y * 183.3) * 43758.5453) - 0.5) * sc * 2 : 0);
    const w = Math.max(br.minRadius ?? 0.35, br.w * (wmul || 1) * (0.34 + Math.pow(vel, br.taper) * br.swell));
    ctx.save();
    if (alpha !== undefined) ctx.globalAlpha *= alpha;
    if (br.sub) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = `rgba(0,0,0,${br.alpha})`;
    } else if (br.softEdge !== undefined) {
      const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, w);
      const rgb = `${ink[0]},${ink[1]},${ink[2]}`;
      g.addColorStop(0, `rgba(${rgb},${br.alpha})`);
      g.addColorStop(br.softEdge, `rgba(${rgb},${br.alpha})`);
      g.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = g;
    } else {
      ctx.fillStyle = `rgba(${ink[0]},${ink[1]},${ink[2]},${br.alpha})`;
    }
    ctx.beginPath();
    if (br.dir) ctx.ellipse(gx, gy, w * (1 + br.dir), w * (1 - br.dir * 0.5), 0.7, 0, Math.PI * 2);
    else ctx.arc(gx, gy, w, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** Where each glyph of a text op goes, fixed once per op (after ready()). */
  glyphPlan(op) {
    let plan = this.plans.get(op);
    if (plan) return plan;
    const size = op.size ?? 16;
    const face = FONTS[op.font ?? 'mono'] || FONTS.mono;
    const mono = face === FONTS.mono;
    const lh = op.line ?? size * 1.25;
    const css = mono ? `${size}px ${face.family}, ${face.fallback}` : `${op.weight ?? 400} ${size}px ${face.family}, ${face.fallback}`;
    /* Measure on a context of our own, set once: the layer contexts change
     * font and state as they draw, so they can't be trusted to hold this one. */
    this._measure ||= document.createElement('canvas').getContext('2d');
    const ctx = this._measure;
    ctx.font = css;
    const advance = (ch) => (mono ? size * FONTS.mono.advance : ctx.measureText(ch).width);
    const track = (op.track ?? 0) * size;
    const rot = op.rot ?? 0;
    const wob = op.wob ?? 0;
    const glyphs = [];
    const push = (ch, x, y, a, w) => {
      const i = glyphs.length;
      glyphs.push({
        ch, w,
        x: x + (hash01(i, 1.3) - 0.5) * wob * size * 0.12,
        y: y + (hash01(i, 2.7) - 0.5) * wob * size * 0.12,
        a: a + (hash01(i, 4.1) - 0.5) * wob * 0.22,
      });
    };
    if (op.pts) {
      const P = op.pts;
      const cum = [0];
      for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
      const L = cum.at(-1);
      const chars = Array.from(op.text.replace(/\n/g, ' '));
      const widths = chars.map(advance);
      const total = widths.reduce((a, b) => a + b, 0) + track * Math.max(0, chars.length - 1);
      /* Past either end, text runs on along the path's end direction rather
       * than piling up where the path stops. */
      const at = (s) => {
        let j = 0;
        while (j < P.length - 2 && cum[j + 1] < s) j++;
        const seg = cum[j + 1] - cum[j] || 1;
        const t = (s - cum[j]) / seg;
        return [P[j][0] + (P[j + 1][0] - P[j][0]) * t, P[j][1] + (P[j + 1][1] - P[j][1]) * t, Math.atan2(P[j + 1][1] - P[j][1], P[j + 1][0] - P[j][0])];
      };
      let s = op.align === 'center' ? (L - total) / 2 : op.align === 'right' ? L - total : 0;
      chars.forEach((ch, i) => {
        const [x, y] = at(s);
        const [, , a] = at(s + widths[i] / 2);
        if (ch !== ' ') push(ch, x, y, a + rot, widths[i]);
        s += widths[i] + track;
      });
    } else {
      const cos = Math.cos(rot), sin = Math.sin(rot);
      op.text.split('\n').forEach((line, li) => {
        const chars = Array.from(line);
        const widths = chars.map(advance);
        const total = widths.reduce((a, b) => a + b, 0) + track * Math.max(0, chars.length - 1);
        let ox = op.align === 'center' ? -total / 2 : op.align === 'right' ? -total : 0;
        const oy = li * lh;
        chars.forEach((ch, i) => {
          if (ch !== ' ') push(ch, op.x + ox * cos - oy * sin, op.y + ox * sin + oy * cos, rot, widths[i]);
          ox += widths[i] + track;
        });
      });
    }
    plan = { css, size, lh, glyphs };
    this.plans.set(op, plan);
    return plan;
  }

  drawGlyph(g, op, plan) {
    const L = this.layers[op.layer ?? 'line'] || this.layers.line;
    const ctx = L.ctx;
    const [r, gg, b] = op.c || this.ink;
    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.rotate(g.a);
    if (op.erase) ctx.globalCompositeOperation = 'destination-out';
    ctx.globalAlpha *= op.alpha ?? 1;
    ctx.fillStyle = `rgb(${r},${gg},${b})`;
    const cp = g.ch.codePointAt(0);
    const top = -0.8 * plan.lh;
    if (cp >= 0x2800 && cp <= 0x28ff) {
      const bits = cp - 0x2800;
      const rad = Math.min(g.w, plan.lh / 2) * 0.17;
      BRAILLE_DOTS.forEach(([col, row], i) => {
        if (!(bits & (1 << i))) return;
        ctx.beginPath();
        ctx.arc(g.w * (0.3 + col * 0.4), top + plan.lh * (0.14 + row * 0.24), rad, 0, Math.PI * 2);
        ctx.fill();
      });
    } else if (cp >= 0x2580 && cp <= 0x259f) {
      /* Upright cells snap their edges to device pixels, so neighbours meet
       * exactly: no antialiased seam, no double-darkened overlap, even at
       * partial alpha. Turned cells can't snap, so solid ones bleed a hair. */
      const upright = Math.abs(g.a) < 1e-9;
      const snapX = (v) => (upright ? Math.round((g.x + v) * this.dpr) / this.dpr - g.x : v);
      const snapY = (v) => (upright ? Math.round((g.y + v) * this.dpr) / this.dpr - g.y : v);
      for (const [x0, y0, x1, y1, shade] of blockCells(cp)) {
        const bleed = upright || shade ? 0 : 0.3;
        if (shade) ctx.globalAlpha *= shade;
        const l = snapX(g.w * x0 / 8) - bleed / 2, r = snapX(g.w * x1 / 8) + bleed / 2;
        const t = snapY(top + plan.lh * y0 / 8) - bleed / 2, b = snapY(top + plan.lh * y1 / 8) + bleed / 2;
        ctx.fillRect(l, t, r - l, b - t);
      }
    } else {
      ctx.font = plan.css;
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(g.ch, 0, 0);
    }
    ctx.restore();
    this.pen = { x: g.x, y: g.y };
  }

  /** A halftone screen inside the shape: a page-anchored grid of dots or
   * lines at `angle`, each sized so its cell is inked by the tone there. */
  screen(ctx, op, trace) {
    const h = op.halftone, cell = h.cell ?? 8, a = ((h.angle ?? 45) * Math.PI) / 180;
    const cos = Math.cos(a), sin = Math.sin(a), tone = toneAt(h.tone ?? 0.5);
    const xs = op.poly.map((p) => p[0]), ys = op.poly.map((p) => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const us = [], vs = [];
    for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) { us.push(x * cos + y * sin); vs.push(-x * sin + y * cos); }
    const i0 = Math.floor(Math.min(...us) / cell) - 1, i1 = Math.ceil(Math.max(...us) / cell) + 1;
    const j0 = Math.floor(Math.min(...vs) / cell) - 1, j1 = Math.ceil(Math.max(...vs) / cell) + 1;
    const page = (u, v) => [u * cos - v * sin, u * sin + v * cos];
    ctx.save();
    trace(ctx);
    ctx.clip();
    ctx.beginPath();
    for (let j = j0; j <= j1; j++) {
      const v = (j + 0.5) * cell;
      if ((h.shape ?? 'dot') === 'line') {
        // one ribbon per row, as thick as the tone along it
        const top = [], bottom = [];
        for (let i = i0; i <= i1; i += 0.5) {
          const u = i * cell, [x, y] = page(u, v), half = 0.5 * cell * Math.max(0, Math.min(1, tone(x, y)));
          top.push(page(u, v - half)); bottom.unshift(page(u, v + half));
        }
        [...top, ...bottom].forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
      } else {
        for (let i = i0; i <= i1; i++) {
          const [x, y] = page((i + 0.5) * cell, v);
          if (x < x0 - cell || x > x1 + cell || y < y0 - cell || y > y1 + cell) continue;
          const t = Math.max(0, Math.min(1, tone(x, y)));
          if (t < 0.004) continue;
          const rad = dotRadius(t) * cell;
          ctx.moveTo(x + rad, y);
          ctx.arc(x, y, rad, 0, Math.PI * 2);
        }
      }
    }
    ctx.fill();
    ctx.restore();
  }

  drawShape(op) {
    const L = this.layers[op.layer ?? 'tone'] || this.layers.tone;
    const [r, gg, b] = op.c || this.ink;
    const trace = (ctx) => {
      ctx.beginPath();
      op.poly.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.closePath();
    };
    const ink = (ctx) => { if (op.halftone) this.screen(ctx, op, trace); else { trace(ctx); ctx.fill(); } };
    const grain = op.grain ?? 0;
    if (!grain) {
      const ctx = L.ctx;
      ctx.save();
      if (op.erase) ctx.globalCompositeOperation = 'destination-out';
      else if (op.overprint) ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha *= op.alpha ?? 1;
      ctx.fillStyle = `rgb(${r},${gg},${b})`;
      ink(ctx);
      ctx.restore();
    } else {
      /* Pull the shape on a scratch sheet, knock the grain out of it there,
       * then lay it down: the speckle is anchored to the page, not the shape. */
      const xs = op.poly.map((p) => p[0]), ys = op.poly.map((p) => p[1]);
      const x0 = Math.max(0, Math.floor(Math.min(...xs) * this.dpr) - 2), y0 = Math.max(0, Math.floor(Math.min(...ys) * this.dpr) - 2);
      const x1 = Math.min(L.cv.width, Math.ceil(Math.max(...xs) * this.dpr) + 2), y1 = Math.min(L.cv.height, Math.ceil(Math.max(...ys) * this.dpr) + 2);
      if (x1 <= x0 || y1 <= y0) return;
      const sheet = document.createElement('canvas');
      sheet.width = x1 - x0; sheet.height = y1 - y0;
      const s = this.v2 ? sheet.getContext('2d', { colorType: 'float16' }) : sheet.getContext('2d');
      s.setTransform(this.dpr, 0, 0, this.dpr, -x0, -y0);
      s.fillStyle = `rgb(${r},${gg},${b})`;
      ink(s);
      s.setTransform(1, 0, 0, 1, 0, 0);
      s.globalCompositeOperation = 'destination-out';
      s.globalAlpha = Math.min(1, grain);
      const pattern = s.createPattern(this.grainTile(), 'repeat');
      pattern.setTransform(new DOMMatrix().translate(-x0, -y0));
      s.fillStyle = pattern;
      s.fillRect(0, 0, sheet.width, sheet.height);
      const ctx = L.ctx;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (op.erase) ctx.globalCompositeOperation = 'destination-out';
      else if (op.overprint) ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = op.alpha ?? 1;
      ctx.drawImage(sheet, x0, y0);
      ctx.restore();
    }
    this.pen = { x: op.poly[0][0], y: op.poly[0][1] };
  }

  /** A fixed speckle, the same on every machine: most of the tile is solid,
   * and a scatter of pores and small voids is where the ink didn't take. */
  grainTile() {
    if (this._grain) return this._grain;
    const n = 192;
    const tile = document.createElement('canvas');
    tile.width = tile.height = n;
    const t = tile.getContext('2d');
    const im = t.createImageData(n, n);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const v = hash01(x + 0.5, y + 0.5) * 0.7 + hash01(Math.floor(x / 3) + 0.25, Math.floor(y / 3) + 0.75) * 0.3;
        im.data[(y * n + x) * 4 + 3] = v > 0.62 ? Math.min(255, (v - 0.62) * 900) : 0;
      }
    }
    t.putImageData(im, 0, 0);
    return (this._grain = tile);
  }

  /** The second canvas's stamp positions for a stroke, fixed once per op.
   * Spacing never exceeds the stamp's own radius, so a thin mark cannot bead;
   * where stamps are closer than the brush's own spacing, each is lightened so
   * the opacity laid per unit of length is what the brush always laid. */
  /** Overprinted strokes are transparent paint, laid in coats. A coat is a
   * run of consecutive overprinted strokes of one colour on one layer: one
   * wash, however many strokes it takes. Its stamps build up together on a
   * sheet of their own, as they would on any stroke, and the finished coat
   * then multiplies its layer, as pigment filters the light through what is
   * under it: yellow under blue makes green, and a second coat is darker than
   * the first. Any other mark, a pause or a phase ends the coat. (Multiplying
   * stamp by stamp would darken a wash against itself, toward black.) */
  coatKey(op) { return `${op.layer}|${(op.c || this.ink).join(',')}`; }
  beginCoat(op) {
    const L = this.layers[op.layer] || this.layers.line;
    if (!this._sheet) {
      const cv = document.createElement('canvas');
      cv.width = L.cv.width; cv.height = L.cv.height;
      const ctx = cv.getContext('2d', { colorType: 'float16' });
      ctx.scale(this.dpr, this.dpr);
      this._sheet = { cv, ctx };
    }
    this._coat = { key: this.coatKey(op), layer: op.layer, x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  }
  endCoat() {
    const coat = this._coat;
    if (!coat) return;
    this._coat = null;
    if (coat.x1 < coat.x0) return;
    const { cv, ctx } = this._sheet;
    const bx = Math.max(0, Math.floor(coat.x0 * this.dpr)), by = Math.max(0, Math.floor(coat.y0 * this.dpr));
    const bw = Math.min(cv.width, Math.ceil(coat.x1 * this.dpr)) - bx, bh = Math.min(cv.height, Math.ceil(coat.y1 * this.dpr)) - by;
    if (bw > 0 && bh > 0) {
      const L = (this.layers[coat.layer] || this.layers.line).ctx;
      L.save();
      L.setTransform(1, 0, 0, 1, 0, 0);
      L.globalCompositeOperation = 'multiply';
      L.drawImage(cv, bx, by, bw, bh, bx, by, bw, bh);
      L.restore();
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(bx, by, bw, bh); ctx.restore();
    }
  }

  plan(op, br) {
    let plan = this.plans.get(op);
    if (plan) return plan;
    const { pts } = this.resample(op);
    const n = pts.length;
    const cum = new Float64Array(n);
    for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const L = cum[n - 1] || 0;
    const sample = br.sampleStep ?? 1.4;
    const base = sample * Math.max(1, Math.round(br.spacing / sample));
    const wmul = op.w || 1;
    plan = [];
    let s = 0;
    let j = 0;
    for (;;) {
      while (j < n - 2 && cum[j + 1] < s) j++;
      const seg = cum[j + 1] - cum[j];
      const t = seg > 0 ? Math.min(1, Math.max(0, (s - cum[j]) / seg)) : 0;
      const b = pts[Math.min(j + 1, n - 1)];
      const x = pts[j][0] + (b[0] - pts[j][0]) * t;
      const y = pts[j][1] + (b[1] - pts[j][1]) * t;
      const vel = L > 0 ? Math.pow(Math.sin(Math.PI * (s / L)), 0.55) : 0;
      const r = Math.max(br.minRadius ?? 0.35, br.w * wmul * (0.34 + Math.pow(vel, br.taper) * br.swell));
      const step = Math.min(base, Math.max(0.08, r * 0.9));
      const gain = step < base ? (1 - Math.pow(1 - br.alpha, step / base)) / br.alpha : 1;
      plan.push([x, y, vel, gain]);
      if (s >= L) break;
      s = Math.min(L, s + step);
    }
    this.plans.set(op, plan);
    return plan;
  }

  clampLayer(layer, max) {
    const L = this.layers[layer];
    if (!L) return;
    if (this.float) {
      /* Read and write back in half-float, or the clamp itself would round
       * the whole layer to 8 bits. */
      const im = L.ctx.getImageData(0, 0, L.cv.width, L.cv.height, { pixelFormat: 'rgba-float16' });
      const d = im.data;
      for (let i = 3; i < d.length; i += 4) if (d[i] > max) d[i] = max;
      L.ctx.setTransform(1, 0, 0, 1, 0, 0);
      L.ctx.putImageData(im, 0, 0);
      L.ctx.scale(this.dpr, this.dpr);
      return;
    }
    const im = L.ctx.getImageData(0, 0, L.cv.width, L.cv.height);
    const d = im.data;
    const cap = Math.round(max * 255);
    for (let i = 3; i < d.length; i += 4) if (d[i] > cap) d[i] = cap;
    L.ctx.setTransform(1, 0, 0, 1, 0, 0);
    L.ctx.putImageData(im, 0, 0);
    L.ctx.scale(this.dpr, this.dpr);
  }

  run(op, from, to) {
    if (this._coat && !(op.k === 's' && op.overprint && this.coatKey(op) === this._coat.key)) this.endCoat();
    if (this.material) {
      if (op.k === 'm') {
        let prepared = this.cache.get(op);
        if (!prepared) { prepared = gestureSamples(op); this.cache.set(op, prepared); }
        this.material.run(op, from, to, prepared);
        const tip = prepared.findLast((sample) => sample.progress <= to);
        if (tip) this.pen = { x: tip.x, y: tip.y };
      } else this.material.run(op, from, to);
      return;
    }
    if (op.k === 'clamp') { if (from === 0) this.clampLayer(op.layer, op.max); return; }

    if (op.k === 'occ') {
      if (from !== 0) return;
      for (const key of ['tone', 'line', 'accent']) {
        const ctx = this.layers[key].ctx;
        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = `rgba(0,0,0,${op.a})`;
        ctx.beginPath();
        op.poly.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      return;
    }

    if (op.k === 't') {
      const plan = this.glyphPlan(op);
      const N = plan.glyphs.length;
      const k0 = Math.floor(from * N);
      const k1 = to >= 1 ? N : Math.floor(to * N);
      for (let k = k0; k < k1; k++) this.drawGlyph(plan.glyphs[k], op, plan);
      return;
    }
    if (op.k === 'f') {
      if (from === 0) this.drawShape(op);
      return;
    }

    const br = BRUSHES[op.brush] || BRUSHES.brush;

    if (op.k === 'd') {
      const L = this.layers[op.layer] || this.layers.line;
      const ctx = L.ctx;
      const R = op.r * 1.55;
      ctx.save();
      if (op.alpha !== undefined) ctx.globalAlpha *= op.alpha;
      const g = ctx.createRadialGradient(op.x, op.y, 0, op.x, op.y, R);
      if (br.sub) {
        ctx.globalCompositeOperation = 'destination-out';
        g.addColorStop(0, 'rgba(0,0,0,.92)');
        g.addColorStop(0.52, 'rgba(0,0,0,.6)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
      } else {
        if (op.overprint) ctx.globalCompositeOperation = 'multiply';
        const [r, gg, b] = op.c || this.ink;
        g.addColorStop(0, `rgba(${r},${gg},${b},.97)`);
        g.addColorStop(0.42, `rgba(${r},${gg},${b},.88)`);
        g.addColorStop(0.68, `rgba(${r},${gg},${b},.34)`);
        g.addColorStop(0.86, `rgba(${r},${gg},${b},.1)`);
        g.addColorStop(1, `rgba(${r},${gg},${b},0)`);
      }
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(op.x, op.y, R, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      this.pen = { x: op.x, y: op.y };
      return;
    }

    /* Construction lines are forced faint whatever brush was asked for — the
     * underdrawing is kept on purpose, not hidden, so it must never compete. */
    const use = op.k === 'g'
      ? { ...BRUSHES.brush, alpha: 0.075, w: BRUSHES.brush.w * 0.5 }
      : br;
    if (this.v2) {
      const plan = this.plan(op, use);
      const N = plan.length;
      if (op.overprint) {
        if (!this._coat) this.beginCoat(op);
        const coat = this._coat, sheet = this._sheet.ctx;
        const reach = use.w * (op.w || 1) * (0.34 + use.swell) * (1 + (use.dir || 0)) + (use.scatter || 0) + 2;
        const k0 = Math.floor(from * N), k1 = to >= 1 ? N : Math.floor(to * N);
        for (let k = k0; k < k1; k++) {
          const [x, y, vel, gain] = plan[k];
          this.stamp(x, y, vel, use, op.layer, op.w, op.c || this.ink, (op.alpha ?? 1) * gain, sheet);
          coat.x0 = Math.min(coat.x0, x - reach); coat.y0 = Math.min(coat.y0, y - reach);
          coat.x1 = Math.max(coat.x1, x + reach); coat.y1 = Math.max(coat.y1, y + reach);
          this.pen = { x, y };
        }
        return;
      }
      const k0 = Math.floor(from * N);
      const k1 = to >= 1 ? N : Math.floor(to * N);
      for (let k = k0; k < k1; k++) {
        const [x, y, vel, gain] = plan[k];
        this.stamp(x, y, vel, use, op.layer, op.w, op.c || this.ink, (op.alpha ?? 1) * gain);
        this.pen = { x, y };
      }
      return;
    }
    const P0 = this.resample(op).pts;
    const n = P0.length;
    const i0 = Math.max(0, Math.floor(from * (n - 1)));
    const i1 = Math.min(n - 1, Math.floor(to * (n - 1)));
    const every = Math.max(1, Math.round(br.spacing / (br.sampleStep ?? 1.4)));
    for (let i = i0; i <= i1; i += every) {
      const u = i / (n - 1);
      /* Velocity is a bell over the stroke: slow at both ends. This is what
       * gives every mark a tapered entry and exit without any author effort. */
      const vel = Math.pow(Math.sin(Math.PI * u), 0.55);
      this.stamp(P0[i][0], P0[i][1], vel, use, op.layer, op.w, op.c || this.ink, op.alpha);
      this.pen = { x: P0[i][0], y: P0[i][1] };
    }
  }
}

/** A moving page as a viewer plays it: its poster at once, its frames
 * prepared in the background, then looped at the page's own rate. `at(now)`
 * says what to show; stop() abandons preparation when the viewer moves on. */
export class Loop {
  constructor(engine, { fps, poster = 0, playing = true }) {
    this.engine = engine;
    this.fps = fps;
    this.poster = Math.max(0, Math.min(engine.frameCount - 1, poster));
    this.playing = playing;
    this.started = performance.now();
    this.pictures = null;
    this.prepared = 0;
    this.alive = true;
    engine.drawFrame(this.poster);
    this.still = document.createElement('canvas');
    this.still.width = engine.w * engine.dpr;
    this.still.height = engine.h * engine.dpr;
    engine.composite(this.still.getContext('2d'));
    this.ready = engine.prepareFrames({ rest: this.poster, isCurrent: () => this.alive, onFrame: (k) => { this.prepared = k; } })
      .then((pictures) => { if (pictures && this.alive) { this.pictures = pictures; this.started = performance.now(); } return this.pictures; });
  }
  get frames() { return this.engine.frameCount; }
  /** The frame on show at `now`: the poster until the frames are ready. */
  at(now = performance.now()) {
    if (!this.pictures) return { k: this.poster, picture: this.still, preparing: true };
    const k = this.playing ? Math.floor(((now - this.started) / 1000) * this.fps) % this.pictures.length : this.poster;
    return { k, picture: this.pictures[k], preparing: false };
  }
  play() { this.playing = true; this.started = performance.now(); }
  pause() { this.playing = false; }
  stop() { this.alive = false; }
}
