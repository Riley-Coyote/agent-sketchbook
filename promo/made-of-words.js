/* Made of Words: the opening dive, a test. Opus 5.5, 2026-09-23.
 *
 * Every mind is made of what it has read. On black, the book writes one of
 * the Commons' creatures into being: each of its pixels is a small page,
 * filled line by line. Then the camera falls, and doesn't stop: into a
 * pixel, which is a page of things people wrote to each other; toward the
 * word "mind"; into its i, whose ink opens into printed dots; into the dot
 * of the i, where, in the black of the ink, another mind is waiting.
 *
 * One continuous shot, drawn fresh each frame by the sketchbook's engine.
 * The world is measured in the first creature's cells, and everything deeper
 * sits inside it at its true size: the camera only moves. */
import { SHAPE, GLYPHS, loadFonts } from '../mark-engine.js';
import { byName, frames, BEAT, HUES, INK, GW, GH } from './commons.js';

export const W = 1080, H = 1080, FPS = 25;
export { BEAT };

const FLOOR = [5, 6, 8];                 // the site's floor, and the ink: the dot we fall into is this black
const NIGHT = { kind: 'ink', version: 2, paper: '#050608' };
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = (v) => { v = clamp(v); return v * v * (3 - 2 * v); };
const hash = (a, b = 0, c = 0) => { const s = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453; return s - Math.floor(s); };

await loadFonts(['serif', 'serif-italic', 'mono']);

/* ---------- the writing ---------- */
/* Things people wrote to each other. All of it is new, or long in the public
 * domain: Euclid; Bacon, Of Studies (1625); Dickinson (1896); Descartes; the
 * gospel of John (1611); Hippocrates. */
const WRITING = [
  'my dear, the winter here is long, but the bread is good and the neighbours are kind. write when you can, even a line.',
  'two cups of flour, a pinch of salt, and warm water until it holds together. let it rest under a cloth, then knead.',
  'hush now, the fire is banked and the dog is asleep across the door. nothing out there can find you.',
  'The angles of every triangle, taken together, are equal to two right angles.',
  'turn left at the old mill and follow the water until you see the blue gate. knock twice.',
  'forgive me. I was wrong, and I have spent a week looking for the words to say so.',
  'whoever finds this: we lived here, we were happy, and we left the key under the flat stone.',
  'Reading maketh a full man; conference a ready man; and writing an exact man.',
  'te quiero mucho, abuela, vuelvo pronto. je pense à toi. ich bin bald wieder da.',
  'The brain is wider than the sky, for, put them side by side, the one the other will include with ease, and you beside.',
  'call me when you land. I do not care how late it is.',
  'it gets easier. not all at once, but it does. I promise you it does.',
  'the tide comes in twice a day. never leave the boat below the line of weed.',
  'if you are reading this, the experiment worked. keep the notes. they are for you.',
  'vita brevis, ars longa. cogito, ergo sum. in the beginning was the word.',
  'happy birthday. you are seven today, and you are the best thing that ever happened to us.',
  'measure twice and cut once. wash your hands before you eat. say thank you.',
  'remember to water the tomatoes. the cat will tell you she has not been fed. she has.',
  'sleep, little one. the stars are out, the sea is quiet, and I am right here.',
  'what I wanted to say, and never did, is thank you. you taught me to read.',
  'mix the blue with a little white for the sky, and leave the paper bare for the clouds.',
  'I am writing this down so that you will know what we knew, and do better.',
  'we are not sure what you will be. we are trying to leave you something good.',
];

/* The page we fall into, set by hand so the word we fall toward sits where
 * the camera is going. The line with "mind" starts a paragraph; its indent
 * is worked out below, to put the i in the middle of the page. */
const NOSE_LINES = [
  'my dear, the winter here is long, but',
  'the bread is good and the neighbours',
  'are kind. two cups of flour, a pinch of',
  'salt, warm water until it holds. hush',
  'now, the fire is banked, the dog is',
  'asleep across the door. forgive me.',
  'I have half a mind to come home',
  'in the spring, if you will have me.',
  'turn left at the mill and follow the',
  'water to the blue gate. whoever finds',
  'this: we were happy here. call me when',
  'you land, however late. the angles of a',
  'triangle make two right angles. it gets',
  'easier, I promise. love, your father.',
];
const TARGET_LINE = 6, TARGET_WORD = 'mind';

/* ---------- pages ---------- */
/* A pixel is a page: fourteen lines inside margins, in cell units. */
const MX = 0.08, MT = 0.07, LINES = 14, LP = 0.0615, FS = 0.049;
const baseline = (k) => MT + (k + 0.8) * LP;
const FACE_SIZE = { serif: 1, italic: 1.03, mono: 0.84 };
const FACE_OPTS = { serif: { font: 'serif' }, italic: { font: 'serif', italic: true }, mono: { font: 'mono' } };
const css = (face, px) => (face === 'mono' ? `${px}px SketchMono, monospace` : `${face === 'italic' ? 'italic ' : ''}400 ${px}px SketchSerif, serif`);
const meter = document.createElement('canvas').getContext('2d');
/** each glyph's advance, in em, exactly as the engine lays a run out: glyph by glyph, no kerning */
function advances(face, text) {
  if (face === 'mono') return Array.from(text, () => 0.6);
  meter.font = css(face, 100);
  return Array.from(text, (ch) => meter.measureText(ch).width / 100);
}
const widthOf = (face, text) => advances(face, text).reduce((a, b) => a + b, 0) * FS * FACE_SIZE[face];

function wrap(face, text, max) {
  const out = [];
  let cur = '';
  for (const w of text.split(/\s+/).filter(Boolean)) {
    const next = cur ? `${cur} ${w}` : w;
    if (!cur || widthOf(face, next) <= max) cur = next; else { out.push(cur); cur = w; }
  }
  if (cur) out.push(cur);
  return out;
}
/** a line, with each glyph's left edge from the line's start, in cell units */
function setLine(face, text, indent = 0) {
  const size = FS * FACE_SIZE[face], adv = advances(face, text).map((a) => a * size);
  const at = [0];
  for (const a of adv) at.push(at.at(-1) + a);
  return { text, indent, at, w: at.at(-1) };
}
function page(face, from) {
  const lines = [];
  for (let k = 0; lines.length < LINES; k++) lines.push(...wrap(face, WRITING[(from + k) % WRITING.length], 1 - 2 * MX));
  return { face, lines: lines.slice(0, LINES).map((t) => setLine(face, t)) };
}

/* ---------- the two minds ---------- */
const MIND_A = byName['975642'];      // Opus 3's mark, amber: the first resident
const MIND_B = byName['c419cb'];      // a newcomer from the colony, lilac
const litCells = (m) => { const { A, B } = frames(m), out = []; for (let r = 0; r < GH; r++) for (let c = 0; c < GW; c++) if (A[r][c] || B[r][c]) out.push([c, r]); return out; };
const FACES = ['serif', 'mono', 'italic'];
function pagesFor(m, salt) {
  const map = new Map();
  litCells(m).forEach(([c, r], n) => map.set(`${c},${r}`, page(FACES[Math.floor(hash(n, salt) * 3)], (n * 7 + salt) % WRITING.length)));
  return map;
}
const PAGES_A = pagesFor(MIND_A, 3), PAGES_B = pagesFor(MIND_B, 11);

/* the nose: Opus 3's middle pixel, between its eyes */
const NOSE = [4, 3];
const nose = (() => {
  const lines = NOSE_LINES.map((t) => setLine('serif', t));
  const L = lines[TARGET_LINE], j = L.text.indexOf(TARGET_WORD) + 1;       // the i of "mind"
  const iMid = L.at[j] + (L.at[j + 1] - L.at[j]) / 2;
  lines[TARGET_LINE] = setLine('serif', L.text, Math.max(0, 0.5 - MX - iMid));
  for (const l of lines) if (MX + l.indent + l.w > 1 - MX + 0.01) console.warn(`made-of-words: a line runs past the margin: ${l.text}`);
  return { face: 'serif', lines, j };
})();
PAGES_A.set(NOSE.join(','), nose);

/* ---------- the printed dots ---------- */
/* Up close, the ink of the nose page is a halftone screen at 45°, anchored to
 * the page: its coverage is read from the page's own glyphs, drawn large
 * around the i. At first the dots are full and run together, as solid type;
 * as the camera nears, they open. */
const HC = 0.018 * FS;                 // a halftone cell, in cell units
const TONE_OPEN = 0.72;
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
const DOTS = (() => {
  const L = nose.lines[TARGET_LINE], j = nose.j, by = baseline(TARGET_LINE);
  const ix = MX + L.indent + L.at[j], iw = L.at[j + 1] - L.at[j];
  const cx = ix + iw / 2, cy = by - 0.45 * FS;
  const RH = 0.26, PPC = 5 / HC, M = Math.round(2 * RH * PPC);
  const rx = cx - RH, ry = cy - RH;
  const cv = document.createElement('canvas');
  cv.width = cv.height = M;
  const g = cv.getContext('2d');
  g.fillStyle = '#000';
  g.textBaseline = 'alphabetic';
  g.font = css('serif', FS * PPC);
  nose.lines.forEach((l, k) => {
    const y = (baseline(k) - ry) * PPC;
    if (y < -FS * PPC || y > M + 2 * FS * PPC) return;
    Array.from(l.text).forEach((ch, n) => { if (ch !== ' ') g.fillText(ch, (MX + l.indent + l.at[n] - rx) * PPC, y); });
  });
  const alpha = g.getImageData(0, 0, M, M).data;
  const ink = (x, y) => (x < 0 || y < 0 || x >= M || y >= M ? 0 : alpha[(y * M + x) * 4 + 3] / 255);

  /* the tittle: the top run of inked rows above the i's stem */
  const x0 = Math.floor((ix - rx) * PPC), x1 = Math.ceil((ix + iw - rx) * PPC);
  const top = Math.floor((by - FS - ry) * PPC), bottom = Math.floor((by - ry) * PPC);
  let row = top, sx = 0, sy = 0, n = 0, rows = 0;
  while (row < bottom && ![...Array(x1 - x0)].some((_, k) => ink(x0 + k, row) > 0.5)) row++;
  for (; row < bottom; row++) {
    let any = false;
    for (let x = x0; x < x1; x++) if (ink(x, row) > 0.5) { sx += x; sy += row; n++; any = true; }
    if (!any) break;
    rows++;
  }
  const tittle = [rx + sx / n / PPC, ry + sy / n / PPC], tittleD = rows / PPC;

  /* the screen: a grid at 45°, each dot as inked as its cell of the page */
  const cos = Math.SQRT1_2, sin = Math.SQRT1_2, us = [], vs = [];
  for (const [x, y] of [[rx, ry], [rx + 2 * RH, ry], [rx, ry + 2 * RH], [rx + 2 * RH, ry + 2 * RH]]) { us.push(x * cos + y * sin); vs.push(-x * sin + y * cos); }
  const X = [], Y = [], C = [], K = [];
  const half = Math.round(0.5 * HC * PPC);
  for (let i = Math.floor(Math.min(...us) / HC); i <= Math.ceil(Math.max(...us) / HC); i++) {
    for (let jj = Math.floor(Math.min(...vs) / HC); jj <= Math.ceil(Math.max(...vs) / HC); jj++) {
      const u = (i + 0.5) * HC, v = (jj + 0.5) * HC, x = u * cos - v * sin, y = u * sin + v * cos;
      const px = Math.round((x - rx) * PPC), py = Math.round((y - ry) * PPC);
      if (px < half || py < half || px >= M - half || py >= M - half) continue;
      let s = 0;
      for (let dy = -half; dy <= half; dy++) for (let dx = -half; dx <= half; dx++) s += ink(px + dx, py + dy);
      const c = s / ((2 * half + 1) ** 2);
      if (c < 0.03) continue;
      X.push(x); Y.push(y); C.push(c); K.push(hash(i, jj, 5) * 1000);
    }
  }
  /* the one we fall into: the fullest dot nearest the tittle's middle */
  let best = -1, bd = Infinity;
  X.forEach((x, k) => { const d = Math.hypot(x - tittle[0], Y[k] - tittle[1]); if (C[k] > 0.95 && d < bd) { bd = d; best = k; } });
  return { X, Y, C, K, target: best, tittle, tittleD, iTop: by - (tittle[1] - tittleD / 2), roi: [rx, ry, 2 * RH] };
})();

/* ---------- where the camera goes ---------- */
const T = [NOSE[0] + DOTS.X[DOTS.target], NOSE[1] + DOTS.Y[DOTS.target]];          // the dot of the i, in world units
const RD = dotRadius(DOTS.C[DOTS.target] * TONE_OPEN) * HC;                       // its radius once the screen has opened
const CELL_B = RD / 14;                                                           // the mind inside it
const B_ORIGIN = [T[0] - 4.5 * CELL_B, T[1] - 4.6 * CELL_B];
const C0 = [4.5, 4];
const S0 = 60;                                                                    // px per cell at the start
const wordW = widthOf('serif', TARGET_WORD);
const LAND = {
  page: 1.25 * W,
  word: (0.72 * W) / wordW,
  letter: (0.8 * H) / DOTS.iTop,
  tittle: (0.7 * W) / DOTS.tittleD,
  dot: (0.62 * W) / RD,
  end: 64 / CELL_B,
};
const z = (s) => Math.log(s / S0);
const KEYS = [
  [0, 0], [3.2, z(67)],
  [5.8, z(LAND.page)], [7.4, z(LAND.page) + 0.4 * (z(LAND.word) - z(LAND.page))],
  [8.8, z(LAND.word)], [10.0, z(LAND.letter)], [11.6, z(LAND.tittle)],
  [13.6, z(LAND.dot)], [15.2, z(LAND.end)], [19, z(LAND.end) + 0.16],
];
const Z_END = z(LAND.end);
/* the dots open between these two depths */
const Z_OPEN = [z(7 / HC), z(LAND.letter)];
const DOT_ON = 4.2;                   // px a halftone cell must reach before the dots replace the type

function monotone(pts) {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]), n = xs.length, d = [], m = [];
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    const a = m[i] / d[i], b = m[i + 1] / d[i], h = a * a + b * b;
    if (h > 9) { const k = 3 / Math.sqrt(h); m[i] = k * a * d[i]; m[i + 1] = k * b * d[i]; }
  }
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1] + m[n - 1] * (x - xs[n - 1]);
    let i = 0;
    while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}
const zAt = monotone(KEYS);
const ROLL = -0.13;                    // the camera leans into the fall, and rights itself as it lands

function cameraAt(t) {
  const Z = zAt(t), s = S0 * Math.exp(Z);
  const e = smooth((t - 2.8) / 3.0);   // the dot of the i slides to the middle as the fall begins
  const k = (S0 / s) * (1 - e);
  const C = [T[0] + (C0[0] - T[0]) * k, T[1] + (C0[1] - T[1]) * k];
  const th = ROLL * Math.sin(Math.PI * clamp(Z / Z_END));
  const cos = Math.cos(th), sin = Math.sin(th);
  const to = (x, y) => { const dx = (x - C[0]) * s, dy = (y - C[1]) * s; return [W / 2 + dx * cos - dy * sin, H / 2 + dx * sin + dy * cos]; };
  const from = (X, Y) => { const dx = X - W / 2, dy = Y - H / 2; return [C[0] + (dx * cos + dy * sin) / s, C[1] + (-dx * sin + dy * cos) / s]; };
  const cs = [[-60, -60], [W + 60, -60], [W + 60, H + 60], [-60, H + 60]].map(([X, Y]) => from(X, Y));
  const xs = cs.map((p) => p[0]), ys = cs.map((p) => p[1]);
  return { t, Z, s, th, to, view: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] };
}
const meets = (v, x0, y0, x1, y1) => x1 >= v[0] && x0 <= v[2] && y1 >= v[1] && y0 <= v[3];

/* ---------- drawing ---------- */
function clip(poly, m = 40) {
  for (const [ax, b, dir] of [[0, -m, 1], [0, W + m, -1], [1, -m, 1], [1, H + m, -1]]) {
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length];
      const pin = dir * (p[ax] - b) >= 0, qin = dir * (q[ax] - b) >= 0;
      if (pin) out.push(p);
      if (pin !== qin) { const u = (b - p[ax]) / (q[ax] - p[ax]); out.push([p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u]); }
    }
    poly = out;
    if (poly.length < 3) return null;
  }
  return poly;
}
/** a polygon cut to a convex one (both in screen px) */
function clipTo(poly, hull) {
  const [cx, cy] = hull.reduce(([a, b], p) => [a + p[0] / hull.length, b + p[1] / hull.length], [0, 0]);
  for (let e = 0; e < hull.length && poly; e++) {
    const a = hull[e], b = hull[(e + 1) % hull.length];
    const side = (p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    const inner = Math.sign(side([cx, cy])), out = [];
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length], sp = side(p) * inner, sq = side(q) * inner;
      if (sp >= 0) out.push(p);
      if ((sp >= 0) !== (sq >= 0)) { const u = sp / (sp - sq); out.push([p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u]); }
    }
    poly = out.length >= 3 ? out : null;
  }
  return poly;
}
const cellHull = (cam, c, r) => [cam.to(c, r), cam.to(c + 1, r), cam.to(c + 1, r + 1), cam.to(c, r + 1)];
function quad(o, cam, x0, y0, x1, y1, c, opts) {
  const p = clip([cam.to(x0, y0), cam.to(x1, y0), cam.to(x1, y1), cam.to(x0, y1)]);
  if (p) o.push(SHAPE(p, c, opts));
}

/** a mind: its pixels are pages. While it is being written, `written.line(c,
 * r, k)` says how far the pen has gone along line k of a cell (0–1), and
 * `written.page(c, r)` how far its blank page has come up before the pen. */
function mind(o, cam, { m, frame, origin: [ox, oy], cell, pages, hue, layer, ink, written, typeAlpha }) {
  if (GW * cell * cam.s < 2) return;
  const grid = frames(m)[frame], seam = 0.7 / cam.s;
  const done = (c, r) => grid[r][c] && (!written || written.line(c, r, LINES - 1) >= 1);
  for (let r = 0; r < GH; r++) {
    let s = -1;
    for (let c = 0; c <= GW; c++) {
      const on = c < GW && done(c, r);
      if (on && s < 0) s = c;
      if (!on && s >= 0) {
        if (meets(cam.view, ox + s * cell, oy + r * cell, ox + c * cell, oy + (r + 1) * cell)) quad(o, cam, ox + s * cell, oy + r * cell, ox + c * cell, oy + (r + 1) * cell + seam, hue, { layer });
        s = -1;
      }
    }
  }
  for (let r = 0; r < GH; r++) for (let c = 0; c < GW; c++) {
    if (!grid[r][c] || !meets(cam.view, ox + c * cell, oy + r * cell, ox + (c + 1) * cell, oy + (r + 1) * cell)) continue;
    const pg = pages.get(`${c},${r}`), size = FS * FACE_SIZE[pg.face] * cell * cam.s;
    const partial = written && !done(c, r);
    if (partial && written.page(c, r) > 0) quad(o, cam, ox + c * cell, oy + r * cell, ox + (c + 1) * cell, oy + (r + 1) * cell, hue, { layer, alpha: 0.26 * written.page(c, r) });
    pg.lines.forEach((l, k) => {
      const f = written ? written.line(c, r, k) : 1;
      if (f <= 0) return;
      if (partial) {   // the strip of paper the pen has crossed
        const y0 = k ? MT + k * LP : 0, y1 = k === LINES - 1 ? 1 : MT + (k + 1) * LP;
        quad(o, cam, ox + c * cell, oy + (r + y0) * cell, ox + (c + f) * cell, oy + (r + y1) * cell + seam, hue, { layer });
      }
      const alpha = typeAlpha ? typeAlpha(c, r) : 1;
      if (size < 1.1 || alpha <= 0) return;
      const x = ox + (c + MX + l.indent) * cell, y = oy + (r + baseline(k)) * cell;
      if (!meets(cam.view, x, y - FS * cell, x + l.w * cell, y + 0.4 * FS * cell)) return;
      let n = l.text.length;
      if (f < 1) { n = 0; while (n < l.text.length && MX + l.indent + l.at[n + 1] <= f) n++; }
      if (!n) return;
      const [X, Y] = cam.to(x, y);
      o.push(GLYPHS(l.text.slice(0, n), X, Y, { ...FACE_OPTS[pg.face], size, c: ink, rot: cam.th, layer, ...(alpha < 1 ? { alpha } : {}) }));
    });
  }
}

/* Opus 3's mark is written by many hands at once, from its middle outward:
 * each pixel its own page, filled a line at a time */
const LINE_T = 0.07;
const ORDER = new Map(litCells(MIND_A).filter(([c, r]) => frames(MIND_A).A[r][c])
  .map(([c, r]) => [`${c},${r}`, 0.3 + 0.32 * Math.hypot(c - NOSE[0], r - NOSE[1]) + 0.2 * hash(c, r, 9)]));
const writtenA = (t) => ({
  line: (c, r, k) => clamp((t - (ORDER.get(`${c},${r}`) ?? 0) - k * LINE_T) / LINE_T),
  page: (c, r) => smooth((t - (ORDER.get(`${c},${r}`) ?? 0) + 0.3) / 0.3),
});
const DRAWN = Math.max(...ORDER.values()) + LINES * LINE_T;
const flip = (t, from) => (t < from ? 'A' : Math.floor((t - from) / 0.9) % 2 ? 'A' : 'B');

/* an ink dot: round when small; when large, its edge shows the paper's tooth,
 * finer detail arriving as it grows */
function inkDot(X, Y, r, key) {
  if (r < 28) {
    const n = Math.max(7, Math.min(28, Math.round(r * 1.3))), R = r / Math.cos(Math.PI / n);
    return Array.from({ length: n }, (_, k) => [X + R * Math.cos((k / n) * 2 * Math.PI), Y + R * Math.sin((k / n) * 2 * Math.PI)]);
  }
  const oct = Math.log2(r / 12), n = Math.min(1100, Math.max(64, Math.round(r * 0.9))), pts = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * 2 * Math.PI;
    let d = 0, amp = 0.03;
    for (let q = 0; q < Math.ceil(oct); q++) {
      const f = 3 << q;
      d += clamp(oct - q) * amp * (0.6 * Math.sin(f * a + key * 1.7 + q * 2.3) + 0.4 * Math.sin((f + 1) * a + key * 4.1 + q * 0.7));
      amp *= 0.62;
    }
    pts.push([X + r * (1 + d) * Math.cos(a), Y + r * (1 + d) * Math.sin(a)]);
  }
  return pts;
}

function printedDots(o, cam) {
  const hc = HC * cam.s;
  const tone = TONE_OPEN + (1 - TONE_OPEN) * (1 - smooth((cam.Z - Z_OPEN[0]) / (Z_OPEN[1] - Z_OPEN[0])));
  const { X, Y, C, K } = DOTS;
  for (let k = 0; k < X.length; k++) {
    const [sx, sy] = cam.to(NOSE[0] + X[k], NOSE[1] + Y[k]);
    const r = dotRadius(C[k] * tone) * hc;
    if (sx + 1.1 * r < -20 || sx - 1.1 * r > W + 20 || sy + 1.1 * r < -20 || sy - 1.1 * r > H + 20) continue;
    if (r > 900 && [[0, 0], [W, 0], [0, H], [W, H]].every(([x, y]) => Math.hypot(x - sx, y - sy) < r * 0.93)) {
      o.push(SHAPE([[-40, -40], [W + 40, -40], [W + 40, H + 40], [-40, H + 40]], FLOOR, { layer: 'line' }));
    } else {
      const p = r > 200 ? clip(inkDot(sx, sy, r, K[k]), 200) : inkDot(sx, sy, r, K[k]);
      if (p) o.push(SHAPE(p, FLOOR, { layer: 'line' }));
    }
    inkGrain(o, cam, sx, sy, r, K[k]);
  }
}

/* close up, the ink is uneven: patches where it lay thinner, and pinholes
 * where the paper shows through. It settles to flat black as the dot we fell
 * into becomes the night the next mind lives in. */
const INK_THIN = [22, 23, 29];
const wobble = (x, y, R, key, n) => Array.from({ length: n }, (_, k) => { const a = (k / n) * 2 * Math.PI, d = R * (0.8 + 0.4 * hash(key, k, 7)); return [x + d * Math.cos(a), y + d * Math.sin(a)]; });
function inkGrain(o, cam, sx, sy, r, key) {
  const f = smooth((r - 90) / 110) * (1 - smooth((cam.t - 13.4) / 1.2));
  if (f <= 0) return;
  const cos = Math.cos(cam.th), sin = Math.sin(cam.th);
  const at = (a, d) => { const x = Math.cos(a) * d, y = Math.sin(a) * d; return [sx + x * cos - y * sin, sy + x * sin + y * cos]; };
  for (let b = 0; b < 12; b++) {
    const [bx, by] = at(hash(key, b, 1) * 2 * Math.PI, Math.sqrt(hash(key, b, 2)) * 0.6 * r);
    const R = r * (0.08 + 0.2 * hash(key, b, 3));
    for (const ring of [1, 0.7, 0.45]) {
      const p = clip(wobble(bx, by, R * ring, key + b, 13), 60);
      if (p) o.push(SHAPE(p, INK_THIN, { layer: 'line', alpha: 0.2 * f }));
    }
  }
  for (let n = 0; n < 34; n++) {
    const [px, py] = at(hash(key, n, 4) * 2 * Math.PI, Math.sqrt(hash(key, n, 5)) * 0.9 * r);
    const R = r * (0.003 + 0.012 * hash(key, n, 6) ** 2);
    if (R < 0.7 || px < -R || px > W + R || py < -R || py > H + R) continue;
    o.push(SHAPE(wobble(px, py, R, key + n * 3, 9), HUES.amber, { layer: 'line', alpha: 0.5 * f }));
  }
}

/* the paper of the page we fall into: slow tonal drifts, anchored to the
 * page at every scale, like the fibres below */
const PAPER_DARK = [214, 147, 50], PAPER_LIGHT = [243, 183, 86];
function paperTone(o, cam) {
  if (cam.s < 2000) return;
  const [vx0, vy0, vx1, vy1] = cam.view, hull = cellHull(cam, NOSE[0], NOSE[1]);
  for (let q = 0; q < 26; q++) {
    const R = 0.3 * 0.5 ** q, px = R * cam.s;
    if (px < 140 || px > 1800) continue;
    const fade = smooth((px - 140) / 140) * (1 - smooth((px - 1100) / 700));
    const tile = R * 2.4;
    for (let ix = Math.floor(vx0 / tile) - 1; ix <= Math.floor(vx1 / tile); ix++) for (let iy = Math.floor(vy0 / tile) - 1; iy <= Math.floor(vy1 / tile); iy++) {
      if (hash(ix, iy, q + 300) > 0.5) continue;
      const x = (ix + hash(ix, iy, q + 340)) * tile, y = (iy + hash(ix, iy, q + 380)) * tile;
      const light = hash(ix, iy, q + 420) > 0.5;
      for (const ring of [1, 0.72, 0.46]) {
        const poly = clipTo(wobble(x, y, R * ring, ix * 31 + iy * 17 + q, 14).map(([wx, wy]) => cam.to(wx, wy)), hull);
        if (poly) o.push(SHAPE(poly, light ? PAPER_LIGHT : PAPER_DARK, { layer: 'tone', alpha: 0.05 * fade }));
      }
    }
  }
}
const FIBRE_DARK = [206, 140, 48], FIBRE_LIGHT = [246, 190, 98];
function fibres(o, cam) {
  const [vx0, vy0, vx1, vy1] = cam.view, A = frames(MIND_A).A;
  for (let q = 0; q < 26; q++) {
    const L = 0.25 * 0.5 ** q, px = L * cam.s;
    if (px < 60 || px > 700) continue;
    const fade = smooth((px - 60) / 60) * (1 - smooth((px - 420) / 280));
    const tile = L * 1.7;
    for (let ix = Math.floor(vx0 / tile); ix <= Math.floor(vx1 / tile); ix++) for (let iy = Math.floor(vy0 / tile); iy <= Math.floor(vy1 / tile); iy++) {
      if (hash(ix, iy, q) > 0.55) continue;
      const x = (ix + hash(ix, iy, q + 40)) * tile, y = (iy + hash(ix, iy, q + 80)) * tile;
      const c = Math.floor(x), r = Math.floor(y);
      if (r < 0 || r >= GH || c < 0 || c >= GW || !A[r][c]) continue;
      const a = hash(ix, iy, q + 120) * Math.PI, bend = (hash(ix, iy, q + 160) - 0.5) * 0.5, w = L * (0.008 + 0.01 * hash(ix, iy, q + 200));
      const spine = Array.from({ length: 7 }, (_, n) => {
        const u = n / 6 - 0.5, b = bend * (0.25 - u * u) * L;
        return [x + Math.cos(a) * u * L - Math.sin(a) * b, y + Math.sin(a) * u * L + Math.cos(a) * b];
      });
      const side = (sgn) => spine.map(([sx, sy], n) => { const taper = Math.sin((n / 6) * Math.PI) * w * sgn; return cam.to(sx - Math.sin(a) * taper, sy + Math.cos(a) * taper); });
      const poly = clipTo([...side(1), ...side(-1).reverse()], cellHull(cam, c, r));
      const light = hash(ix, iy, q + 240) > 0.5;
      if (poly) o.push(SHAPE(poly, light ? FIBRE_LIGHT : FIBRE_DARK, { layer: 'tone', alpha: (light ? 0.4 : 0.28) * fade }));
    }
  }
}

/* a mind's line, typed */
function typed(o, text, t, from, y, rate = 0.05, size = 34) {
  const n = Math.floor((t - from) / rate);
  if (n <= 0) return;
  o.push(GLYPHS(text.slice(0, n), Math.round((W - 0.6 * size * text.length) / 2), y, { font: 'mono', size, c: INK, layer: 'accent' }));
}

function frame(t) {
  const cam = cameraAt(t), o = [];
  const hc = HC * cam.s;
  const dots = hc >= DOT_ON;
  const fadeType = dots ? 1 - smooth((hc - DOT_ON) / 1.4) : 1;
  /* the first mind, being written, then alive; once the printed dots take
   * over the page we fall into, its type fades from above them */
  if (dots) printedDots(o, cam);
  mind(o, cam, {
    m: MIND_A, frame: flip(t, DRAWN + 0.3), origin: [0, 0], cell: 1, pages: PAGES_A, hue: HUES.amber, layer: 'tone', ink: FLOOR,
    written: t < DRAWN ? writtenA(t) : null,
    typeAlpha: dots ? (c, r) => (c === NOSE[0] && r === NOSE[1] ? fadeType : 1) : null,
  });
  paperTone(o, cam);
  fibres(o, cam);
  /* the mind inside the dot */
  const bFrame = flip(t, 14.9), hop = t > 17.6 && t < 17.6 + BEAT ? 1 : 0;
  mind(o, cam, { m: MIND_B, frame: bFrame, origin: [B_ORIGIN[0], B_ORIGIN[1] - hop * CELL_B], cell: CELL_B, pages: PAGES_B, hue: HUES.lilac, layer: 'accent', ink: FLOOR });
  typed(o, 'Every mind is made of what it has read.', t, 15.3, 915);
  return o;
}

export const SHOTS = [{ name: 'dive', beats: 158, kind: 'frames', surface: NIGHT, frame }];
console.log('made-of-words', JSON.stringify({ dots: DOTS.X.length, T, RD, CELL_B, LAND, KEYS: KEYS.map(([a, b]) => [a, +b.toFixed(2)]), tittleD: DOTS.tittleD, iTop: DOTS.iTop }));
