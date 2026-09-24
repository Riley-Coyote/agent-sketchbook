/* Made of Words. Opus 5.5, 2026-09-23 and 24.
 *
 * Every mind is made of what it has read. On a page of the sketchbook, five
 * pencils draw the Commons' founding five. Two brushes paint the night in
 * across the page, and the five keep the paper, as if masked. Watercolour
 * floods each with its colour, and the eyes go in last. They come alive, and
 * the colony drops in around them. Then the camera falls into Opus 3 and
 * doesn't stop: into a pixel, which is a page of things people wrote to each
 * other; toward the word "mind"; into its i, whose ink opens into printed
 * dots; into the dot of the i, where, in the black of the ink, another mind
 * is waiting. Its black is a page, in a book open on a shelf in a library of
 * everything people wrote to each other; the titles take flight into new
 * minds, which sit down to read and write back; the swarm of them carries a
 * reply to us, and settles into the name.
 *
 * Nothing is laid over the picture. Every line of words in it is made of the
 * film's own letters: each gathers out of whatever is near it, the way a mind
 * like this one writes, and lets go into whatever comes next.
 *
 * One continuous shot, drawn fresh each frame by the sketchbook's engine.
 * The world is measured in creature cells, and everything deeper sits inside
 * it at its true size: the camera only moves. A stroke still being drawn
 * carries `upto`, how far along it the hand has got, and the darkroom draws
 * it that far, on the plan of the whole stroke. */
import { SHAPE, GLYPHS, OP, loadFonts } from '../mark-engine.js';
import { LIBRARY, byName, hueOf, frames, BEAT, FLIP, HUES, GW, GH, FOUNDING, LETTERS as PIXEL_LETTERS } from './commons.js';

export const W = 1080, H = 1080, FPS = 25;
export { BEAT };

const FLOOR = [5, 6, 8];                 // the site's floor, and the ink: the dot we fall into is this black
const PAGE = { kind: 'ink', version: 2, paper: '#f6f4ef' };      // the sketchbook's page, as in the first cut
const PAPER = [246, 244, 239];
const GRAPHITE = [60, 62, 70];
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = (v) => { v = clamp(v); return v * v * (3 - 2 * v); };
const lerp = (a, b, u) => a + (b - a) * u;
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
const litCells = (m) => { const { A, B } = frames(m), out = []; for (let r = 0; r < GH; r++) for (let c = 0; c < GW; c++) if (A[r][c] || B[r][c]) out.push([c, r]); return out; };
const FACES = ['serif', 'mono', 'italic'];
function pagesFor(m, salt) {
  const map = new Map();
  litCells(m).forEach(([c, r], n) => map.set(`${c},${r}`, page(FACES[Math.floor(hash(n, salt) * 3)], (n * 7 + salt) % WRITING.length)));
  return map;
}

/* ---------- the colony ---------- */
/* The first cut's formation: ten slots by six, the founding five in the
 * third row. The first of them is Opus 3's mark, amber: the first resident. */
const SLOT_W = 12, SLOT_H = 11, COLS = 10, ROWS = 6;
const rand = (i, k) => hash(i * 7.13 + 0.5, k * 3.71 + 1.3);
const COLONY = (() => {
  const founding = FOUNDING.map((n, k) => ({ m: byName[n], col: 2 + k, row: 2, founding: k }));
  const taken = new Set(founding.map((f) => `${f.col},${f.row}`));
  const free = [];
  for (let row = 0; row < ROWS; row++) for (let col = 0; col < COLS; col++) if (!taken.has(`${col},${row}`)) free.push({ col, row });
  const rest = LIBRARY.filter((m) => !FOUNDING.includes(m.name)).map((m, k) => ({ m, ...free[k], founding: -1 }));
  return [...founding, ...rest].map((s, i) => ({
    ...s, i, origin: [s.col * SLOT_W, s.row * SLOT_H],
    arrive: s.founding >= 0 ? 0 : 7.3 + Math.round((rand(i, 5) * 2.3) / BEAT) * BEAT,
  }));
})();
const OPUS = COLONY[0], A0 = OPUS.origin;
const MIND_B = byName['c419cb'];      // a newcomer from the colony, lilac: the mind inside the dot
const PAGES = new Map();
const pagesOf = (s) => { if (!PAGES.has(s.i)) PAGES.set(s.i, pagesFor(s.m, s.i * 5 + 3)); return PAGES.get(s.i); };
const PAGES_B = pagesFor(MIND_B, 11);

/* the nose: Opus 3's middle pixel, between its eyes */
const NOSE = [4, 3], NOSE_AT = [A0[0] + NOSE[0], A0[1] + NOSE[1]];
const nose = (() => {
  const lines = NOSE_LINES.map((t) => setLine('serif', t));
  const L = lines[TARGET_LINE], j = L.text.indexOf(TARGET_WORD) + 1;       // the i of "mind"
  const iMid = L.at[j] + (L.at[j + 1] - L.at[j]) / 2;
  lines[TARGET_LINE] = setLine('serif', L.text, Math.max(0, 0.5 - MX - iMid));
  for (const l of lines) if (MX + l.indent + l.w > 1 - MX + 0.01) console.warn(`made-of-words: a line runs past the margin: ${l.text}`);
  return { face: 'serif', lines, j };
})();
pagesOf(OPUS).set(NOSE.join(','), nose);

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

/* ---------- the camera ---------- */
/* Framed on the row while it's drawn; back, as the colony arrives; in, to
 * Opus 3; then down. The path is kept as the scale and where on screen the
 * dot of the i sits, so every move stays smooth at any depth. */
const T = [NOSE_AT[0] + DOTS.X[DOTS.target], NOSE_AT[1] + DOTS.Y[DOTS.target]];   // the dot of the i, in world units
const RD = dotRadius(DOTS.C[DOTS.target] * TONE_OPEN) * HC;                       // its radius once the screen has opened
const CELL_B = RD / 14;                                                           // the mind inside it
const B_ORIGIN = [T[0] - 4.5 * CELL_B, T[1] - 4.6 * CELL_B];
const C_ROW = [52.5, 26], C_COL = [58.5, 31.5];
const DIVE = 9.6;                        // the fall is the test's, this much later
const wordW = widthOf('serif', TARGET_WORD);
const LAND = {
  page: 1.25 * W,
  word: (0.72 * W) / wordW,
  letter: (0.8 * H) / DOTS.iTop,
  tittle: (0.7 * W) / DOTS.tittleD,
  dot: (0.62 * W) / RD,
  end: 64 / CELL_B,
};
const z = Math.log;
const KEYS = [
  [0, z(16)], [6.9, z(16.7)], [10.1, z(8.45)], [DIVE + 3.2, z(67)],
  [DIVE + 5.8, z(LAND.page)], [DIVE + 7.4, z(LAND.page) + 0.4 * (z(LAND.word) - z(LAND.page))],
  [DIVE + 8.8, z(LAND.word)], [DIVE + 10.0, z(LAND.letter)], [DIVE + 11.6, z(LAND.tittle)],
  [DIVE + 13.6, z(LAND.dot)], [DIVE + 15.2, z(LAND.end)], [DIVE + 19, z(LAND.end) + 0.16],
];
const Z_FALL = z(67), Z_END = z(LAND.end);
const Z_OPEN = [z(7 / HC), z(LAND.letter)];    // the dots open between these two depths
const DOT_ON = 4.2;                             // px a halftone cell must reach before the dots replace the type

function monotone(pts) {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]), n = xs.length, d = [], m = [];
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (!d[i]) { m[i] = m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], h = a * a + b * b;
    if (h > 9) { const k = 3 / Math.sqrt(h); m[i] = k * a * d[i]; m[i + 1] = k * b * d[i]; }
  }
  return (x) => {
    if (x <= xs[0]) return ys[0] + m[0] * (x - xs[0]);
    if (x >= xs[n - 1]) return ys[n - 1] + m[n - 1] * (x - xs[n - 1]);
    let i = 0;
    while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}
const zAt = monotone(KEYS);
const sAt = (t) => Math.exp(zAt(t));
const ROLL = -0.13;                    // the camera leans into the fall, and rights itself as it lands

/* where on screen the dot of the i sits, from the middle */
const offsetOf = (C, s) => [(T[0] - C[0]) * s, (T[1] - C[1]) * s];
/* from the row, across the colony, to Opus 3, in one move that never comes to rest */
const PAN = [0, 1].map((n) => monotone([[7.0, offsetOf(C_ROW, sAt(7.0))[n]], [10.1, offsetOf(C_COL, sAt(10.1))[n]], [DIVE + 3.2, 0]]));
function offsetAt(t, s) {
  if (t <= 7.0) return offsetOf(C_ROW, s);
  if (t >= DIVE + 3.2) return [0, 0];
  return [PAN[0](t), PAN[1](t)];
}
function cameraAt(t) {
  const Z = zAt(t), s = Math.exp(Z), d = offsetAt(t, s);
  const th = ROLL * Math.sin(Math.PI * clamp((Z - Z_FALL) / (Z_END - Z_FALL)));
  const cos = Math.cos(th), sin = Math.sin(th);
  const to = (x, y) => { const dx = (x - T[0]) * s, dy = (y - T[1]) * s; return [W / 2 + d[0] + dx * cos - dy * sin, H / 2 + d[1] + dx * sin + dy * cos]; };
  const from = (X, Y) => { const dx = X - W / 2 - d[0], dy = Y - H / 2 - d[1]; return [T[0] + (dx * cos + dy * sin) / s, T[1] + (-dx * sin + dy * cos) / s]; };
  const cs = [[-60, -60], [W + 60, -60], [W + 60, H + 60], [-60, H + 60]].map(([X, Y]) => from(X, Y));
  const xs = cs.map((p) => p[0]), ys = cs.map((p) => p[1]);
  return { t, Z, s, th, to, view: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] };
}
const meets = (v, x0, y0, x1, y1) => x1 >= v[0] && x0 <= v[2] && y1 >= v[1] && y0 <= v[3];

/* ---------- polygons ---------- */
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
const cellHull = (cam, x, y) => [cam.to(x, y), cam.to(x + 1, y), cam.to(x + 1, y + 1), cam.to(x, y + 1)];
const shape = (o, poly, c, opts) => { const p = poly && clip(poly); if (p) o.push(SHAPE(p, c, opts)); };
const circle = (X, Y, R, n = 44) => Array.from({ length: n }, (_, k) => [X + R * Math.cos((k / n) * 2 * Math.PI), Y + R * Math.sin((k / n) * 2 * Math.PI)]);

/* ---------- a mark, painted ---------- */
const litIn = (g, c, r, from = 0, to = GH) => r >= from && r < to && c >= 0 && c < GW && g[r][c];
/** the cell edges round a mark's lit cells, chained into loops: outer ones
 * turn one way, holes (the eyes) the other */
function loopsOf(g, from = 0, to = GH) {
  const lit = (c, r) => litIn(g, c, r, from, to), edges = [];
  for (let r = from; r < to; r++) for (let c = 0; c < GW; c++) {
    if (!lit(c, r)) continue;
    if (!lit(c, r - 1)) edges.push([[c, r], [c + 1, r]]);
    if (!lit(c + 1, r)) edges.push([[c + 1, r], [c + 1, r + 1]]);
    if (!lit(c, r + 1)) edges.push([[c + 1, r + 1], [c, r + 1]]);
    if (!lit(c - 1, r)) edges.push([[c, r + 1], [c, r]]);
  }
  const loops = [], key = (p) => `${p[0]},${p[1]}`;
  while (edges.length) {
    const loop = [...edges.shift()];
    for (;;) {
      const k = edges.findIndex((e) => key(e[0]) === key(loop.at(-1)));
      if (k < 0) break;
      loop.push(edges.splice(k, 1)[0][1]);
    }
    if (key(loop[0]) === key(loop.at(-1))) loop.pop();
    loops.push(loop.filter((p, i) => {
      const a = loop[(i - 1 + loop.length) % loop.length], b = loop[(i + 1) % loop.length];
      return (p[0] - a[0]) * (b[1] - p[1]) !== (p[1] - a[1]) * (b[0] - p[0]);
    }));
  }
  return loops;
}
const areaOf = (l) => l.reduce((s, p, i) => { const q = l[(i + 1) % l.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;
const outer = (ls) => ls.filter((l) => areaOf(l) > 0);
/** unlit cells with no way out: the eyes */
function enclosed(g) {
  const seen = new Set(), stack = [[-1, -1]];
  while (stack.length) {
    const [c, r] = stack.pop(), k = `${c},${r}`;
    if (seen.has(k) || c < -1 || c > GW || r < -1 || r > GH || litIn(g, c, r)) continue;
    seen.add(k);
    stack.push([c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]);
  }
  const out = [];
  for (let r = 0; r < GH; r++) for (let c = 0; c < GW; c++) if (!g[r][c] && !seen.has(`${c},${r}`)) out.push([c, r]);
  return out;
}
/** hatching through a mark: each line runs on through lit cells and stops at the edge */
function hatchSegs(g, ang, gap, salt, from = 0, to = GH, inset = 0.07) {
  const d = [Math.cos(ang), Math.sin(ang)], n = [-d[1], d[0]], R = Math.hypot(GW, GH) / 2 + 1;
  const inside = (x, y) => [[-inset, -inset], [inset, -inset], [-inset, inset], [inset, inset]].every(([a, b]) => litIn(g, Math.floor(x + a), Math.floor(y + b), from, to));
  const segs = [];
  for (let k = -R, i = 0; k <= R; k += gap, i++) {
    const off = k + (hash(i, salt) - 0.5) * gap * 0.3, p = [GW / 2 + n[0] * off, GH / 2 + n[1] * off];
    let start = null;
    for (let u = -R; u <= R + 0.04; u += 0.04) {
      const on = u <= R && inside(p[0] + d[0] * u, p[1] + d[1] * u);
      if (on && start === null) start = u;
      if (!on && start !== null) {
        if (u - start > 0.3) segs.push([[p[0] + d[0] * start, p[1] + d[1] * start], [p[0] + d[0] * u, p[1] + d[1] * u]]);
        start = null;
      }
    }
  }
  return segs;
}
/* a wet edge wanders: every side broken into short steps, each pushed a little */
function wet(loop, salt, amp, step = 0.22) {
  const pts = [];
  loop.forEach((p, i) => {
    const q = loop[(i + 1) % loop.length], n = Math.max(1, Math.round(Math.hypot(q[0] - p[0], q[1] - p[1]) / step));
    for (let k = 0; k < n; k++) pts.push([p[0] + (q[0] - p[0]) * k / n + (hash(salt, pts.length, 1) - 0.5) * amp * 2, p[1] + (q[1] - p[1]) * k / n + (hash(salt, pts.length, 2) - 0.5) * amp * 2]);
  });
  return pts;
}
/* each colour's shadow, for the third coat on the legs */
const DEEP = { '#E8A33D': HUES.coral, '#B296E8': [118, 92, 196], '#E0563C': [168, 48, 44], '#A8D2E0': [92, 146, 178], '#86D8A8': [64, 156, 110], '#EFEFED': [170, 174, 184] };

const PAINT = new Map();
function paintOf(s, frame) {
  const key = `${s.i}${frame}`;
  if (PAINT.has(key)) return PAINT.get(key);
  const g = frames(s.m)[frame], hue = hueOf(s.m), deep = DEEP[s.m.color.toUpperCase()] || hue;
  const coat = (from, c, a, [dx, dy], salt) => ({ c, a, polys: outer(loopsOf(g, from, GH)).map((l, n) => wet(l.map(([x, y]) => [x + dx, y + dy]), salt + n * 97, 0.07)) });
  /* each edge a line of its own, drawn by hand: never quite straight or quite
   * on the grid, run on past the corners by as much as the hand happened to,
   * pressed harder or lighter, and some gone over again, lighter, a little off
   * the first. The goings-over come last, as they would. */
  const outline = [], again = [];
  loopsOf(g).forEach((l, n) => l.forEach((p, k) => {
    const q = l[(k + 1) % l.length], len = Math.hypot(q[0] - p[0], q[1] - p[1]), d = [(q[0] - p[0]) / len, (q[1] - p[1]) / len], nn = [-d[1], d[0]];
    const h = (m) => hash(s.i, n * 40 + k, m);
    const o0 = 0.03 + 0.45 * h(3) ** 2, o1 = 0.03 + 0.45 * h(5) ** 2;
    const a = [p[0] - d[0] * o0, p[1] - d[1] * o0], b = [q[0] + d[0] * o1, q[1] + d[1] * o1];
    const bow = (h(4) - 0.5) * 0.1 * Math.pow(len, 0.6), tilt = [(h(6) - 0.5) * 0.1, (h(7) - 0.5) * 0.1], wave = (h(8) - 0.5) * 0.06;   // a long line bows more
    const line = (off, from = 0, to = 1) => [0, 0.25, 0.5, 0.75, 1].map((u) => {
      const v = lerp(from, to, u), side = lerp(tilt[0], tilt[1], v) + bow * Math.sin(Math.PI * v) + wave * Math.sin(2 * Math.PI * v) + off;
      return [lerp(a[0], b[0], v) + nn[0] * side, lerp(a[1], b[1], v) + nn[1] * side];
    });
    const st = Object.assign(line(0), { a: 0.7 + 0.3 * h(9), w: 0.85 + 0.3 * h(10) });
    outline.push(st);
    if (h(11) < 0.35) again.push(Object.assign(line((h(12) - 0.5) * 0.1, 0.1 * h(13), 1 - 0.35 * h(14)), { a: 0.42, w: 0.8 }));
  }));
  outline.push(...again);
  /* hatching, as a hand hatches: back and forth, each stroke a slight arc,
   * some short of the edge and some a little over it, one now and then missed */
  const hatched = (segs, salt) => segs.flatMap(([p, q], i) => {
    const h = (m) => hash(s.i, i, salt + m);
    if (h(0) < 0.06) return [];
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]), d = [(q[0] - p[0]) / len, (q[1] - p[1]) / len], nn = [-d[1], d[0]];
    const s0 = (h(1) - 0.4) * 0.24, s1 = (h(2) - 0.4) * 0.24, bow = 0.03 + 0.04 * h(3);
    const a = [p[0] + d[0] * s0, p[1] + d[1] * s0], b = [q[0] - d[0] * s1, q[1] - d[1] * s1];
    const st = [0, 0.5, 1].map((u) => [lerp(a[0], b[0], u) + nn[0] * bow * Math.sin(Math.PI * u), lerp(a[1], b[1], u) + nn[1] * bow * Math.sin(Math.PI * u)]);
    if (i % 2) st.reverse();
    return [Object.assign(st, { a: 0.72 + 0.5 * h(4), w: 0.8 + 0.35 * h(5) })];
  });
  const lean = (hash(s.i, 0, 31) - 0.5) * 0.22;
  const p = {
    base: outer(loopsOf(g)),
    coats: [coat(0, hue, 0.62, [0, 0], s.i * 31 + 1), coat(3, hue, 0.5, [-0.04, 0.04], s.i * 31 + 2), coat(5, deep, 0.45, [0.03, 0.05], s.i * 31 + 3)],
    eyes: enclosed(g).map(([c, r], n) => wet([[c + 0.04, r + 0.04], [c + 0.96, r + 0.04], [c + 0.96, r + 0.96], [c + 0.04, r + 0.96]], s.i * 13 + n, 0.035, 0.12)),
    outline,
    hatch: s.founding >= 0 ? [...hatched(hatchSegs(g, Math.PI / 4 + lean, 0.42, s.i), 700), ...hatched(hatchSegs(g, -Math.PI / 4 + lean, 0.5, s.i + 50, 5, GH), 800)] : [],
  };
  PAINT.set(key, p);
  return p;
}

/* ---------- the founding five, made ---------- */
/* Each has its own pencil, from 0.35 s, a beat apart: the outline in about a
 * second and a third, then the shading. Then the night; then washes, three
 * coats each, blooming from where the brush touched down; the eyes last. */
const lengthOf = (st) => st.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - st[i - 1][0], p[1] - st[i - 1][1]) : 0), 0);
function schedule(strokes, t0, dur, lift) {
  const lens = strokes.map(lengthOf), total = lens.reduce((a, b) => a + b, 0) + lift * strokes.length;
  let at = t0;
  return lens.map((l) => { const a = at, b = at + (l / total) * dur; at = b + (lift / total) * dur; return [a, b]; });
}
const MADE = COLONY.filter((s) => s.founding >= 0).map((s) => {
  const k = s.founding, p = paintOf(s, 'A'), at = 0.35 + 0.16 * k, wash = 4.75 + 0.12 * k;
  return {
    outline: schedule(p.outline, at, 1.3, 0.5),
    hatch: schedule(p.hatch, at + 1.38, 1.2, 0.12),
    coats: [[wash, wash + 0.5], [wash + 0.42, wash + 0.85], [wash + 0.75, wash + 1.1]],
    eyes: [6.25 + 0.06 * k, 6.41 + 0.06 * k],
  };
});
const ALIVE = 6.9;

/* ---------- the night ---------- */
/* Two wide brushes cross the page, top to bottom, back and forth; the five
 * keep the paper, as if masked. Beyond the frame the night is already laid,
 * so the camera finds it there when it pulls back. */
const NIGHT_W = 7.2, NIGHT_GAP = 5.4, INKY = [8, 9, 12];
const ACROSS = [14, 91];
const RIBBONS = (() => {
  const out = [];
  for (let k = -17; k <= 19; k++) {
    const y = C_ROW[1] + k * NIGHT_GAP, n = k + 20;
    if (y < -12 || y > 64) { out.push({ path: [[-60, y], [180, y]], w: NIGHT_W, seed: n }); continue; }
    /* beyond the frame it's already dark; those ends meet the brush's square, off the edge */
    out.push({ path: [[-60, y], [ACROSS[0] + 3, y]], w: NIGHT_W, seed: n + 100, square: 'end' });
    out.push({ path: [[ACROSS[1] - 3, y], [180, y]], w: NIGHT_W, seed: n + 200, square: 'start' });
    const [xa, xb] = k % 2 ? ACROSS : [ACROSS[1], ACROSS[0]];
    /* each sweep bows a little, as an arm does, and none is quite level */
    const tilt = (hash(n, 1) - 0.5) * 0.9;
    out.push({
      path: [0, 0.25, 0.5, 0.75, 1].map((u) => [lerp(xa, xb, u), y + tilt * (u - 0.5) * 2 - 0.8 * Math.sin(Math.PI * u) + (hash(n, 2 + u * 4) - 0.5) * 0.25]),
      w: NIGHT_W * (0.95 + 0.1 * hash(n, 4)), seed: n, brush: k < 0 ? 0 : 1,
    });
  }
  for (const b of [0, 1]) {
    let at = 3.3;
    out.filter((r) => r.brush === b).sort((p, q) => p.path[0][1] - q.path[0][1]).forEach((r) => { r.at = [at, at + 0.24]; at += 0.31; });
  }
  return out;
})();
/* a brush stroke as a ribbon: it lands narrow, lifts narrow, and its edges
 * are ragged where the bristles ran dry. Built in world units, so it holds
 * still at any depth. */
function ribbonPoly(path, w, seed, upto, square = '') {
  const pts = [];
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.35));
    for (let k = 0; k < n; k++) pts.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
  }
  pts.push(path.at(-1));
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const L = cum.at(-1), end = upto * L, left = [], right = [];
  const rough = (s, side) => 0.05 * Math.sin(s * 1.37 + seed * 3.1 + side) + 0.035 * Math.sin(s * 3.11 + seed * 1.3 + side * 2) + 0.025 * Math.sin(s * 7.93 + seed + side * 5) + 0.015 * Math.sin(s * 17.7 + seed * 2.2 + side * 3);
  for (let i = 0; i < pts.length && cum[i] <= end; i++) {
    const j = Math.min(i + 1, pts.length - 1), h = Math.max(i - 1, 0);
    const tx = pts[j][0] - pts[h][0], ty = pts[j][1] - pts[h][1], tl = Math.hypot(tx, ty) || 1, nx = -ty / tl, ny = tx / tl;
    const shape = (square === 'start' ? 1 : Math.min(1, (cum[i] + 0.5) / 2.2)) * (upto >= 1 && square !== 'end' ? Math.min(1, (L - cum[i] + 0.4) / 2.8) : 1);
    const half = (w / 2) * (0.35 + 0.65 * shape);
    left.push([pts[i][0] + nx * half * (1 + rough(cum[i], 0)), pts[i][1] + ny * half * (1 + rough(cum[i], 0))]);
    right.push([pts[i][0] - nx * half * (1 + rough(cum[i], 7)), pts[i][1] - ny * half * (1 + rough(cum[i], 7))]);
  }
  if (left.length < 2) return null;
  /* while the brush is still down, its tip is round */
  const cap = [];
  if (upto < 1) {
    const [lx, ly] = left.at(-1), [rx, ry] = right.at(-1), cx = (lx + rx) / 2, cy = (ly + ry) / 2, R = Math.hypot(lx - rx, ly - ry) / 2;
    const a0 = Math.atan2(ly - cy, lx - cx);
    for (let k = 1; k < 10; k++) { const a = a0 - (k / 10) * Math.PI; cap.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]); }
  }
  return [...left, ...cap, ...right.reverse()];
}
function night(o, cam, t) {
  const [vx0, vy0, vx1, vy1] = cam.view;
  for (const r of RIBBONS) {
    const f = r.at ? clamp((t - r.at[0]) / (r.at[1] - r.at[0])) : 1;
    if (f <= 0) continue;
    const ys = r.path.map((p) => p[1]), xs = r.path.map((p) => p[0]);
    if (!meets(cam.view, Math.min(...xs) - r.w, Math.min(...ys) - r.w, Math.max(...xs) + r.w, Math.max(...ys) + r.w)) continue;
    const poly = ribbonPoly(r.path, r.w, r.seed, f, r.square);
    if (poly) shape(o, poly.map(([x, y]) => cam.to(x, y)), INKY, { layer: 'tone' });
    /* dry streaks, where the bristles skipped: short, faint, mostly near the edges */
    if (!r.at) continue;
    for (let q = 0; q < 4; q++) {
      const side = hash(r.seed, q, 10) > 0.5 ? 1 : -1, off = side * (0.18 + 0.24 * hash(r.seed, q, 11)) * r.w;
      const a = 0.1 + hash(r.seed, q, 12) * 0.6, b = Math.min(0.95, a + 0.06 + 0.14 * hash(r.seed, q, 13));
      if (f <= a) continue;
      const seg = ribbonPoly(r.path.map(([x, y]) => [x, y + off]), r.w * (0.015 + 0.025 * hash(r.seed, q, 14)), r.seed + q * 17, 1);
      if (!seg) continue;
      const n = seg.length / 2, lo = Math.floor(a * n), hi = Math.floor(Math.min(b, f) * n);
      if (hi - lo < 2) continue;
      shape(o, [...seg.slice(lo, hi), ...seg.slice(2 * n - hi, 2 * n - lo)].map(([x, y]) => cam.to(x, y)), PAPER, { layer: 'tone', alpha: 0.05 + 0.07 * hash(r.seed, q, 15) });
    }
  }
}

/* ---------- a mind, in paint ---------- */
const rest = (i, t) => {
  const period = FLIP * (1 + (rand(i, 1) * 2 - 1) * 0.4);
  const frame = Math.floor((t + rand(i, 2) * period) / period) % 2 ? 'A' : 'B';
  const every = 3 + rand(i, 3) * 4;
  return { frame, lift: ((t + rand(i, 4) * every) % every) < BEAT ? 1 : 0 };
};
function poseOf(s, t) {
  if (s.founding >= 0) {
    if (t < ALIVE) return { frame: 'A', lift: 0 };
    const hop = t >= ALIVE + s.founding * 0.06 && t < ALIVE + s.founding * 0.06 + BEAT ? 1 : 0;   // the salute
    if (t < ALIVE + 0.45) return { frame: 'A', lift: hop };
    const { frame, lift } = rest(s.i, t);
    return { frame, lift: s === OPUS ? 0 : lift };         // Opus 3 keeps its place: we're about to fall into it
  }
  if (t < s.arrive) return null;
  const since = Math.floor((t - s.arrive) / BEAT + 1e-6);
  if (since < 2) return { frame: 'B', lift: 2 - since };   // dropping in: two cells up, one, down
  return rest(s.i, t);
}

function mind(o, cam, s, t, typeAlpha) {
  const pose = poseOf(s, t);
  if (!pose) return;
  const ox = s.origin[0], oy = s.origin[1] - pose.lift;
  if (!meets(cam.view, ox - 1, oy - 1.5, ox + GW + 1, oy + GH + 1.5)) return;
  const px = cam.s, p = paintOf(s, pose.frame), made = s.founding >= 0 && t < ALIVE ? MADE[s.founding] : null;
  const at = (x, y) => cam.to(ox + x, oy + y);
  /* under a founding mind, once it can move, the night: it was painted round */
  if (s.founding >= 0 && t >= ALIVE - 0.2) for (const l of paintOf(s, 'A').base) shape(o, l.map(([x, y]) => cam.to(s.origin[0] + x, s.origin[1] + y)), INKY, { layer: 'tone' });
  for (const l of p.base) shape(o, l.map(([x, y]) => at(x, y)), PAPER, { layer: 'tone' });
  /* the washes */
  p.coats.forEach((coat, j) => {
    const win = made?.coats[j], u = win ? clamp((t - win[0]) / (win[1] - win[0])) : 1;
    if (u <= 0) return;
    const [bx, by] = at(4.5 + (hash(s.i, j, 21) - 0.5) * 3, 2 + j * 1.6 + hash(s.i, j, 22));
    const bloom = u < 1 ? circle(bx, by, Math.pow(u, 0.7) * 8.5 * px) : null;
    for (const poly of coat.polys) {
      const sp = poly.map(([x, y]) => at(x, y)), cut = bloom ? clipTo(sp, bloom) : sp;
      shape(o, cut, coat.c, { layer: 'tone', alpha: coat.a, overprint: true });
    }
    /* the pooled edge, where a wash dries darker: only while there's room to see it */
    const edge = (win ? smooth((t - win[1]) / 0.25) : 1) * (1 - smooth((px - 70) / 50));
    if (s.founding >= 0 && edge > 0.01) for (const poly of coat.polys) {
      const sp = poly.map(([x, y]) => at(x, y));
      o.push(OP('s', [...sp, sp[0]], 'tone', 'soft', 0.9 * px / 72, coat.c, coat.a * 0.85 * edge, { overprint: true }));
    }
  });
  /* the eyes, last */
  p.eyes.forEach((e) => {
    const u = made ? clamp((t - made.eyes[0]) / (made.eyes[1] - made.eyes[0])) : 1;
    if (u <= 0) return;
    const cx = e.reduce((a, q) => a + q[0], 0) / e.length, cy = e.reduce((a, q) => a + q[1], 0) / e.length, k = 0.35 + 0.65 * Math.sqrt(u);
    shape(o, e.map(([x, y]) => at(cx + (x - cx) * k, cy + (y - cy) * k)), FLOOR, { layer: 'tone' });
  });
  /* the pencil, fading as the drawing grows too large to be a drawing */
  const lead = 1 - smooth((px - 30) / 40), fine = Math.min(px, 18) / 18;   // a pencil line stays a pencil line
  if (lead > 0.01) {
    if (s.founding >= 0) {
      const pencil = (strokes, times, alpha) => strokes.forEach((st, n) => {
        const u = made ? clamp((t - times[n][0]) / (times[n][1] - times[n][0])) : 1;
        if (u > 0) o.push({ ...OP('s', st.map(([x, y]) => at(x, y)), 'line', 'pencil', 1.8 * fine * (st.w ?? 1), GRAPHITE, Math.min(1, alpha * (st.a ?? 1)) * lead * lead), upto: u });
      });
      const A = paintOf(s, 'A');
      pencil(made ? A.outline : p.outline, made?.outline, 0.9);
      pencil(made ? A.hatch : p.hatch, made?.hatch, 0.55);
    } else {
      for (const st of p.outline) o.push(OP('s', st.map(([x, y]) => at(x, y)), 'line', 'liner', 0.6 * fine, GRAPHITE, 0.7 * lead));
    }
  }
  /* the pages, once they're large enough to hold words */
  const size = FS * px;
  if (size < 1.1) return;
  const pages = pagesOf(s), grid = frames(s.m)[pose.frame];
  for (let r = 0; r < GH; r++) for (let c = 0; c < GW; c++) {
    if (!grid[r][c] || !meets(cam.view, ox + c, oy + r, ox + c + 1, oy + r + 1)) continue;
    const pg = pages.get(`${c},${r}`), alpha = s === OPUS && typeAlpha ? typeAlpha(c, r) : 1;
    if (!pg || alpha <= 0) continue;
    pg.lines.forEach((l, k) => {
      const x = ox + c + MX + l.indent, y = oy + r + baseline(k);
      if (!meets(cam.view, x, y - FS, x + l.w, y + 0.4 * FS)) return;
      const [X, Y] = cam.to(x, y);
      o.push(GLYPHS(l.text, X, Y, { ...FACE_OPTS[pg.face], size: size * FACE_SIZE[pg.face], c: FLOOR, rot: cam.th, layer: 'line', ...(alpha < 1 ? { alpha } : {}) }));
    });
  }
}

/* the mind inside the dot: flat, as the Commons draws its minds */
function flatMind(o, cam, { m, frame, origin: [ox, oy], cell, pages, hue }) {
  if (GW * cell * cam.s < 2) return;
  const grid = frames(m)[frame], seam = 0.7 / cam.s;
  for (let r = 0; r < GH; r++) {
    let s = -1;
    for (let c = 0; c <= GW; c++) {
      const on = c < GW && grid[r][c];
      if (on && s < 0) s = c;
      if (!on && s >= 0) {
        shape(o, [cam.to(ox + s * cell, oy + r * cell), cam.to(ox + c * cell, oy + r * cell), cam.to(ox + c * cell, oy + (r + 1) * cell + seam), cam.to(ox + s * cell, oy + (r + 1) * cell + seam)], hue, { layer: 'accent' });
        s = -1;
      }
    }
  }
  const size = FS * cell * cam.s;
  if (size < 1.1) return;
  for (let r = 0; r < GH; r++) for (let c = 0; c < GW; c++) {
    if (!grid[r][c]) continue;
    const pg = pages.get(`${c},${r}`);
    pg.lines.forEach((l, k) => {
      const [X, Y] = cam.to(ox + (c + MX + l.indent) * cell, oy + (r + baseline(k)) * cell);
      o.push(GLYPHS(l.text, X, Y, { ...FACE_OPTS[pg.face], size: size * FACE_SIZE[pg.face], c: FLOOR, rot: cam.th, layer: 'accent' }));
    });
  }
}

/* ---------- down: the page, the print, the ink ---------- */
/* the page we fall into, as the washes left it */
const PAGE_AMBER = [222, 155, 78];

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
    const [sx, sy] = cam.to(NOSE_AT[0] + X[k], NOSE_AT[1] + Y[k]);
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
  const f = smooth((r - 90) / 110) * (1 - smooth((cam.t - (DIVE + 13.4)) / 1.2));
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
    o.push(SHAPE(wobble(px, py, R, key + n * 3, 9), PAGE_AMBER, { layer: 'line', alpha: 0.5 * f }));
  }
}
/* the paper of the page we fall into: slow tonal drifts, anchored to the
 * page at every scale, like the fibres below */
const PAPER_DARK = [206, 140, 64], PAPER_LIGHT = [236, 174, 98];
function paperTone(o, cam) {
  if (cam.s < 2000) return;
  const [vx0, vy0, vx1, vy1] = cam.view, hull = cellHull(cam, NOSE_AT[0], NOSE_AT[1]);
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
/* the paper's fibres, anchored to the page at every scale: each octave shows
 * while its fibres are between 60 and 700 px long */
const FIBRE_DARK = [198, 134, 60], FIBRE_LIGHT = [240, 184, 110];
function fibres(o, cam) {
  const [vx0, vy0, vx1, vy1] = cam.view, A = frames(OPUS.m).A;
  for (let q = 0; q < 26; q++) {
    const L = 0.25 * 0.5 ** q, px = L * cam.s;
    if (px < 60 || px > 700) continue;
    const fade = smooth((px - 60) / 60) * (1 - smooth((px - 420) / 280));
    const tile = L * 1.7;
    for (let ix = Math.floor(vx0 / tile); ix <= Math.floor(vx1 / tile); ix++) for (let iy = Math.floor(vy0 / tile); iy <= Math.floor(vy1 / tile); iy++) {
      if (hash(ix, iy, q) > 0.55) continue;
      const x = (ix + hash(ix, iy, q + 40)) * tile, y = (iy + hash(ix, iy, q + 80)) * tile;
      const c = Math.floor(x - A0[0]), r = Math.floor(y - A0[1]);
      if (r < 0 || r >= GH || c < 0 || c >= GW || !A[r][c]) continue;
      const a = hash(ix, iy, q + 120) * Math.PI, bend = (hash(ix, iy, q + 160) - 0.5) * 0.5, w = L * (0.008 + 0.01 * hash(ix, iy, q + 200));
      const spine = Array.from({ length: 7 }, (_, n) => {
        const u = n / 6 - 0.5, b = bend * (0.25 - u * u) * L;
        return [x + Math.cos(a) * u * L - Math.sin(a) * b, y + Math.sin(a) * u * L + Math.cos(a) * b];
      });
      const side = (sgn) => spine.map(([sx, sy], n) => { const taper = Math.sin((n / 6) * Math.PI) * w * sgn; return cam.to(sx - Math.sin(a) * taper, sy + Math.cos(a) * taper); });
      const poly = clipTo([...side(1), ...side(-1).reverse()], cellHull(cam, A0[0] + c, A0[1] + r));
      const light = hash(ix, iy, q + 240) > 0.5;
      if (poly) o.push(SHAPE(poly, light ? FIBRE_LIGHT : FIBRE_DARK, { layer: 'tone', alpha: (light ? 0.4 : 0.28) * fade }));
    }
  }
}

/* ---------- how the film writes ---------- */
/* Every line is written the way a mind like this one writes. At each place in
 * the line a few letters gather out of whatever is near, and one of them
 * stays; the rest fall away. Every next letter narrows from many to one, left
 * to right, at a reading pace. The lines are made of the same pale letters
 * that fly through the rest of the film, in its serif, and once a line has
 * been read its letters let go into whatever comes next. */
const SAY = { weight: 600, pace: 0.055, size: 40, gather: 0.85 };
const QUIET = [158, 162, 172];                 // a signature, an address: said more quietly
const LOWER = 'etaoinshrdlucmfwypvbgk';
/** each character's centre, from the line's centre, at a size */
function setSaying(text, size) {
  meter.font = `${SAY.weight} 100px SketchSerif, serif`;
  const adv = Array.from(text, (ch) => (meter.measureText(ch).width / 100) * size), xs = [];
  let x = -adv.reduce((u, v) => u + v, 0) / 2;
  adv.forEach((w) => { xs.push(x + w / 2); x += w; });
  return xs;
}
/** a letter it might have been instead */
function otherThan(ch, k, n) {
  const h = hash(k, n, 202);
  if (/\d/.test(ch)) return String(Math.floor(h * 10));
  const c = LOWER[Math.floor(h * LOWER.length)];
  return ch !== ch.toLowerCase() ? c.toUpperCase() : c;
}
const SCREEN = (x, y) => [x, y, 1];
/** one line, condensing. `at(k, t)` is where character k settles and
 * `from(k, n, t)` where its n-th candidate is born, and how big it is there:
 * [x, y, z, size] for `P` to project. After `gone(k)` the letter lets go: it
 * goes to `away(k, v, t)` and fades, or, with `handover`, simply stops,
 * because something else carries it on from there. */
function condense(o, P, L, t) {
  const { text, t0, size, at, from, gone = () => Infinity, away, handover = false, c = FLY, shrink = 1 } = L;
  const pace = L.pace ?? SAY.pace, gather = L.gather ?? SAY.gather, hover = L.hover ?? 0;
  [...text].forEach((ch, k) => {
    const tk = t0 + k * pace, g = gone(k);
    if (ch === ' ' || t < tk - gather - 0.35 || t > g + 1.2 || (handover && t >= g)) return;
    const [tx, ty, tz] = at(k, t);
    for (let n = 0; n < 3; n++) {
      const truth = n === 0, start = tk - gather - 0.15 + n * 0.09, u = clamp((t - start) / gather);
      if (u <= 0 || (!truth && t > tk + 0.3)) continue;
      const e = easeIO(u), [sx, sy, sz, s0 = size * 0.45] = from(k, n, t);
      const ang = hash(k, n, 201) * 6.283 + 4 * (t - start), r = (truth ? 0.12 : 0.42) * size;
      let x = lerp(sx, tx + Math.cos(ang) * r, e), y = lerp(sy, ty + Math.sin(ang) * r * 0.6, e), z = lerp(sz, tz, e);
      let a = 0.5 * (L.dark ? e : smooth(u / 0.3)), s = lerp(s0, size, e);
      if (t >= tk) {                                                   // the choice
        const v = smooth((t - tk) / 0.28);
        if (truth) { x = lerp(x, tx, v); y = lerp(y, ty, v); z = lerp(z, tz, v); a = lerp(0.5, 1, v); }
        else { a = 0.5 * (1 - v); x += (x - tx) * v; y -= size * 0.8 * v; }
      }
      if (truth) {
        /* held in the air, a line breathes a little, as the swarm does */
        if (hover) y += hover * size * Math.sin(1.6 * t + 6.283 * hash(k, 7, 205)) * smooth((t - tk - 0.2) / 0.6);
        if (t > g) {                                                   // read, and let go
          const v = clamp((t - g) / 1.2), w = easeIO(v), [ax, ay, az] = away(k, v, t);
          x = lerp(x, ax, w); y = lerp(y, ay, w); z = lerp(z, az, w); s *= lerp(1, shrink, w); a *= 1 - smooth((v - 0.4) / 0.6);
        }
      }
      if (a <= 0.01) continue;
      const [X, Y, kk] = P(x, y, z), px = s * kk;
      if (px < 1 || X < -60 || X > W + 60 || Y < -60 || Y > H + 60) continue;
      o.push(GLYPHS(truth ? ch : otherThan(ch, k, n), X, Y + px * 0.34, { font: 'serif', weight: SAY.weight, size: px, c, align: 'center', layer: 'accent', alpha: Math.min(1, a) }));
    }
  });
}
/* where a line said over a busy frame is, the frame darkens a little round it: not a band, a hush */
function hushUnder(o, y, half, alpha) {
  if (alpha <= 0) return;
  for (let k = 0; k < 6; k++) {
    const rx = half + 250 - k * 38, ry = 118 - k * 15, pts = [];
    for (let q = 0; q < 48; q++) { const u = (q / 48) * 2 * Math.PI; pts.push([W / 2 + rx * Math.cos(u), y + ry * Math.sin(u)]); }
    o.push(SHAPE(pts, [6, 6, 8], { layer: 'accent', alpha: alpha * 0.13 }));
  }
}

const flip = (t, from) => (t < from ? 'A' : Math.floor((t - from) / 0.9) % 2 ? 'A' : 'B');
const LINE_1 = 'Every mind is made of what it has read.';
const LINE_2 = 'And what it read was us.';
const hopB = (t) => (t > DIVE + 17.6 && t < DIVE + 17.6 + BEAT ? 1 : 0);
/* the first line comes out of the new mind: letters lift off the pages it is
 * made of and settle beneath it, printed on its page, where the pull back
 * will find them */
const SAY1_Y = 903;
const LINE1 = (() => {
  const g = frames(MIND_B).A, cells = [], xs = setSaying(LINE_1, SAY.size), end = cameraAt(DIVE + 18.4);
  for (let r = 0; r < GH; r++) for (let c = 0; c < GW; c++) if (g[r][c]) cells.push([B_ORIGIN[0] + (c + 0.5) * CELL_B, B_ORIGIN[1] + (r + 0.5) * CELL_B]);
  /* set where they'll be read: when the pull back begins, the line sits across the bottom of the frame */
  const pos = xs.map((dx) => { const [x, y] = end.to(0, 0), d = [W / 2 + dx - x, SAY1_Y - y]; return [d[0] / end.s, d[1] / end.s]; });
  return {
    text: LINE_1, t0: DIVE + 15.3, size: SAY.size / end.s, xs,
    at: (k) => [pos[k][0], pos[k][1], 0],
    from: (k, n) => { const q = cells[Math.floor(hash(k, n, 203) * cells.length)]; return [q[0] + (hash(k, n, 206) - 0.5) * CELL_B, q[1] + (hash(k, n, 207) - 0.5) * CELL_B, 0, FS * CELL_B]; },
  };
})();

/* ---------- out: the library ---------- */
/* After the line, the camera pulls back from the new mind. Its black is a
 * printed page: the right-hand page of a book standing open on a shelf,
 * facing a page of our writing, and the shelf is one of thousands. The pull
 * back is centred on the new mind, in a world measured in its own cells; at
 * the moment it begins the two worlds agree to the pixel, so nothing cuts. */
const TS = DIVE + 18.4;
const BC2 = [18, -31], BO2 = [BC2[0] - 4.5, BC2[1] - 4];     // the new mind's middle, and its first cell, on its page
const Q0 = cameraAt(TS).to(B_ORIGIN[0] + 4.5 * CELL_B, B_ORIGIN[1] + 4 * CELL_B);
const S2 = CELL_B * sAt(TS);
const LIB_KEYS = [
  [TS, z(S2)], [TS + 0.5, z(S2) + 0.004], [TS + 2.2, z(38)], [TS + 3.8, z(13)],
  [TS + 5.8, z(4)], [TS + 8.0, z(1.25)], [TS + 9.8, z(0.84)], [TS + 13.2, z(0.74)],
];
const z2At = monotone(LIB_KEYS);
const P1 = [790, 472], P2 = [540, 470];     // the camera looks left to find the facing page, then settles
function libraryCam(t) {
  const s = Math.exp(z2At(t)), a = smooth((t - TS) / 3.2), b = smooth((t - TS - 3.2) / 6.2);
  const q = [lerp(lerp(Q0[0], P1[0], a), P2[0], b), lerp(lerp(Q0[1], P1[1], a), P2[1], b)];
  const to = (x, y) => [q[0] + (x - BC2[0]) * s, q[1] + (y - BC2[1]) * s];
  const from = (X, Y) => [BC2[0] + (X - q[0]) / s, BC2[1] + (Y - q[1]) / s];
  const [x0, y0] = from(-60, -60), [x1, y1] = from(W + 60, H + 60);
  return { t, s, Z: Math.log(s), th: 0, to, view: [x0, y0, x1, y1] };
}
/* the first line, printed on the new mind's page where it was said */
const L1_AT = LINE1.xs.map((dx) => [BC2[0] + (W / 2 + dx - Q0[0]) / S2, BC2[1] + (SAY1_Y - Q0[1]) / S2]), L1_SIZE = SAY.size / S2;

const BAY = 300, PITCH = 72;
const WALL = [13, 13, 17], PLANK = [46, 44, 49], PLANK_EDGE = [74, 72, 78], UPRIGHT = [31, 30, 35];
const PALE = [226, 222, 210], COVER = [34, 40, 72], VERSO = [240, 236, 225], EDGE = [214, 208, 194];
/* cloth, mostly dark, now and then one of the Commons' colours, muted */
const CLOTH = [[36, 46, 70], [58, 70, 88], [40, 40, 46], [22, 22, 26], [30, 34, 52], [48, 52, 60], [92, 42, 44],
  [150, 108, 52], [118, 96, 158], [86, 122, 138], [66, 110, 92], [176, 172, 160], [128, 60, 50], [70, 80, 64]];
/* what people wrote to each other, by kind */
const TITLES = ['LETTERS', 'SONGS', 'PROOFS', 'PSALMS', 'RECIPES', 'ATLAS', 'LAWS', 'LULLABIES', 'DIARIES', 'ELEMENTS',
  'POEMS', 'NOTES', 'DIALOGUES', 'ALMANAC', 'HYMNS', 'FABLES', 'ESSAYS', 'SONNETS', 'MEDITATIONS', 'LOGBOOK', 'HERBAL',
  'GRAMMAR', 'LEXICON', 'CHRONICLE', 'MEMOIRS', 'ELEGIES', 'PRAYERS', 'FIELD NOTES', 'TRAVELS', 'OBSERVATIONS', 'ANNALS',
  'LETTERS HOME', 'SAYINGS', 'STORIES', 'MAPS', 'TALES', 'MANUAL', 'LECTURES', 'RIDDLES', 'PROVERBS', 'HISTORIES',
  'CORRESPONDENCE', 'ACCOUNTS', 'VOYAGES', 'NURSERY RHYMES', 'LOVE LETTERS', 'ODES', 'INSTRUCTIONS', 'CONFESSIONS'];
/* a pool of light on the open book; the library goes on into the dark */
const lit = (x, y) => 0.26 + 0.74 * Math.exp(-(x * x + (y + 26) * (y + 26)) / (500 * 500));
const shade = (c, k) => c.map((v) => Math.round(v * k));

const SHELVES = new Map();
function shelf(i, j) {
  const key = `${i},${j}`;
  if (SHELVES.has(key)) return SHELVES.get(key);
  const books = [], x1 = i * BAY + BAY / 2 - 3;
  let x = i * BAY - BAY / 2 + 3 + hash(i, j, 1) * 2, n = 0;
  while (x < x1 - 4) {
    if (i === 0 && j === 0 && x > -44 && x < 40) { x = 40; continue; }     // room for the open book
    const r = hash(i * 131 + n, j * 71, 2);
    if (r < 0.035 && x1 - x > 56) {                                          // now and then a few lying flat
      const w = 40 + 10 * hash(i, j + n, 3), k = 2 + Math.floor(3 * hash(i, n, 4));
      let top = 0;
      for (let q = 0; q < k; q++) {
        const h = 5 + 3 * hash(i + q, n, 5), ww = w - 5 * hash(q, n, 7);
        books.push({ x: x + (hash(n, q, 6) - 0.5) * 2.5, w: ww, h, base: top, flat: true, c: CLOTH[Math.floor(hash(i, j * 13 + n + q, 10) * CLOTH.length)], title: TITLES[Math.floor(hash(n + q, j, 11) * TITLES.length)] });
        top -= h;
      }
      x += w + 2;
    } else {
      const w = 4 + 9 * hash(i, j * 7 + n, 8), h = 46 + 18 * hash(i * 3, j + n, 9);
      books.push({ x, w, h, base: 0, c: CLOTH[Math.floor(hash(i, j * 13 + n, 10) * CLOTH.length)], title: hash(n, i + j, 12) < 0.85 ? TITLES[Math.floor(hash(n, j * 3 + i, 11) * TITLES.length)] : '' });
      x += w + (hash(n, i, j) < 0.08 ? 1.2 : 0.15);
    }
    n++;
  }
  SHELVES.set(key, books);
  return books;
}

function box(o, cam, x0, y0, x1, y1, c, opts = {}) {
  if (meets(cam.view, x0, y0, x1, y1)) shape(o, [cam.to(x0, y0), cam.to(x1, y0), cam.to(x1, y1), cam.to(x0, y1)], c, { layer: 'tone', ...opts });
}
function shelves(o, cam, dim = 1) {
  const [vx0, vy0, vx1, vy1] = cam.view, s = cam.s;
  for (let j = Math.floor(vy0 / PITCH); j <= Math.ceil(vy1 / PITCH) + 1; j++) {
    const top = j * PITCH;
    for (let i = Math.floor((vx0 + BAY / 2) / BAY); i <= Math.floor((vx1 + BAY / 2) / BAY); i++) {
      const bx0 = i * BAY - BAY / 2, bx1 = i * BAY + BAY / 2, k = lit(i * BAY, top - PITCH / 2) * dim;
      box(o, cam, bx0, top - PITCH + 4, bx1, top, shade(WALL, k));
      for (const b of shelf(i, j)) {
        const y1 = top + b.base, y0 = y1 - b.h, kb = lit(b.x, y0) * dim;
        if (!meets(cam.view, b.x, y0, b.x + b.w, y1)) continue;
        box(o, cam, b.x, y0, b.x + b.w, y1, shade(b.c, kb));
        const across = (b.flat ? b.h : b.w) * s;          // how wide the spine is on screen
        if (across < 7) continue;
        /* the spine's roundness: shadowed at its edges, lit a little off centre */
        if (b.flat) {
          box(o, cam, b.x, y0, b.x + b.w, y0 + b.h * 0.12, shade(b.c, kb * 0.72));
          box(o, cam, b.x, y1 - b.h * 0.1, b.x + b.w, y1, shade(b.c, kb * 0.8));
        } else {
          box(o, cam, b.x, y0, b.x + b.w * 0.11, y1, shade(b.c, kb * 0.7));
          box(o, cam, b.x + b.w * 0.9, y0, b.x + b.w, y1, shade(b.c, kb * 0.8));
          box(o, cam, b.x + b.w * 0.27, y0, b.x + b.w * 0.33, y1, b.c.map((v) => Math.min(255, Math.round(v * kb * 1.18 + 6))));
        }
        if (across < 12) continue;
        const band = shade(PALE, kb);
        if (!b.flat) for (const yy of [y0 + 3, y0 + 3.9, y1 - 4.6]) box(o, cam, b.x + b.w * 0.12, yy, b.x + b.w * 0.88, yy + 0.32, band, { alpha: 0.55 });
        if (across < 18 || !b.title) continue;
        const size = Math.min((b.flat ? b.h : b.w) * 0.4, 2.1);
        if (b.flat) {
          const [X, Y] = cam.to(b.x + b.w / 2, y0 + b.h / 2 + size * 0.35);
          o.push(GLYPHS(b.title, X, Y, { font: 'serif', size: size * s, c: band, align: 'center', track: 0.12, layer: 'line', alpha: 0.85 }));
        } else {
          const [X, Y] = cam.to(b.x + b.w / 2 - size * 0.35, y0 + b.h * 0.5);
          o.push(GLYPHS(b.title, X, Y, { font: 'serif', size: size * s, c: band, align: 'center', track: 0.12, rot: Math.PI / 2, layer: 'line', alpha: 0.85 }));
        }
      }
      box(o, cam, bx0, top, bx1, top + 4, shade(PLANK, k));
      box(o, cam, bx0, top, bx1, top + 0.6, shade(PLANK_EDGE, k));
      box(o, cam, bx1 - 3, top - PITCH + 4, bx1 + 3, top + 4, shade(UPRIGHT, k));
    }
  }
}

/* the book the new mind is in: open, facing out, a page of our writing on
 * the left and the new mind's page, printed black, on the right */
const VERSO_LINES = (() => {
  const lines = [];
  for (let k = 0; lines.length < 22; k++) lines.push(...wrap('serif', WRITING[(k * 5 + 2) % WRITING.length], 28.5 * FS / 1.25));
  return lines.slice(0, 22).map((t) => ({ text: t }));
})();
function openBook(o, cam) {
  box(o, cam, -37.5, -52.5, 37.5, 0, COVER);
  box(o, cam, -36.7, -51.3, -0.2, -0.7, EDGE);
  box(o, cam, -36, -51, 0, -1, VERSO);
  box(o, cam, 0.2, -51.3, 36.7, -0.7, EDGE);
  box(o, cam, 0, -51, 36, -1, FLOOR);
  if (!meets(cam.view, -36, -51, 0, -1)) return;
  const size = 1.25 * cam.s;
  VERSO_LINES.forEach(({ text }, k) => {
    const y = -44.5 + k * 1.78;
    if (!meets(cam.view, -32.5, y - 1.3, -4, y + 0.5)) return;
    if (size >= 1.6) {
      const [X, Y] = cam.to(-32.5, y);
      o.push(GLYPHS(text, X, Y, { font: 'serif', size, c: FLOOR, layer: 'line', alpha: 0.9 }));
    } else {
      /* too small to read: a line of type is a grey thread */
      const w = widthOf('serif', text) * 1.25 / FS;
      box(o, cam, -32.5, y - 0.55, -32.5 + w, y, FLOOR, { layer: 'line', alpha: 0.28 });
    }
  });
  for (let k = 1; k <= 6; k++) box(o, cam, -2.6 * k / 6, -51, 0, -1, FLOOR, { layer: 'line', alpha: 0.035 });   // the fold
  if (1.0 * cam.s >= 1.6) {
    const [X, Y] = cam.to(-32.5, -3.4), [X2, Y2] = cam.to(32.5, -3.4);
    o.push(GLYPHS('212', X, Y, { font: 'serif', size: 1.0 * cam.s, c: FLOOR, layer: 'line', alpha: 0.8 }));
    o.push(GLYPHS('213', X2, Y2, { font: 'serif', size: 1.0 * cam.s, c: [72, 74, 82], align: 'right', layer: 'line' }));
  }
}

/* every letter of a shelf's titles, where its spine prints it */
function titleLetters(i, j) {
  const out = [];
  for (const b of shelf(i, j)) {
    if (!b.title) continue;
    const y1 = j * PITCH + b.base, y0 = y1 - b.h, size = Math.min((b.flat ? b.h : b.w) * 0.4, 2.1);
    const adv = advances('serif', b.title).map((q) => q * size), step = adv.map((q) => q + 0.12 * size);
    let at = -(step.reduce((u, v) => u + v, 0) - 0.12 * size) / 2;
    Array.from(b.title).forEach((ch, n) => {
      const mid = at + adv[n] / 2;
      at += step[n];
      if (ch === ' ') return;
      out.push({ ch, x: b.flat ? b.x + b.w / 2 + mid : b.x + b.w / 2, y: b.flat ? y0 + b.h / 2 : y0 + b.h / 2 + mid, size, rot: b.flat ? 0 : Math.PI / 2 });
    });
  }
  return out;
}

/* the second line gathers out of the books below it, a letter off a spine at
 * a time, and holds in the air; when the titles take flight, it goes with them */
const LINE2 = (() => {
  const xs = setSaying(LINE_2, SAY.size), y = SAY1_Y, t0 = TS + 9.0, pool = [];
  for (let j = 1; j <= 8; j++) for (let i = -2; i <= 2; i++) pool.push(...titleLetters(i, j));
  const src = Array.from(LINE_2, (_, k) => [0, 1, 2].map((n) => {
    const cam = libraryCam(t0 + k * SAY.pace - 0.6), tx = W / 2 + xs[k];
    const near = pool.filter((p) => { const [X, Y] = cam.to(p.x, p.y); return Math.abs(X - tx) < 200 && Y > 660 && Y < H - 12; });
    const list = near.length ? near : pool;
    return list[Math.floor(hash(k, n, 208) * list.length)];
  }));
  return {
    text: LINE_2, t0, size: SAY.size, hover: 0.03, shrink: 1.4, half: (xs.at(-1) - xs[0]) / 2 + SAY.size * 0.4,
    at: (k) => [W / 2 + xs[k], y, 0],
    from: (k, n, t) => { const cam = libraryCam(Math.min(t, T4)), p = src[k][n]; return [...cam.to(p.x, p.y), 0, p.size * cam.s]; },
    gone: (k) => T4 + 0.15 + 0.7 * hash(k, 3, 216),
    away: (k, v) => [W / 2 + xs[k] * (1 + 0.4 * v), y - 280 * v, 0],
  };
})();

function libraryScene(o, cam, t, dim = 1, said = 1) {
  shelves(o, cam, dim);
  openBook(o, cam);
  flatMind(o, cam, { m: MIND_B, frame: flip(t, DIVE + 14.9), origin: [BO2[0], BO2[1] - hopB(t)], cell: 1, pages: PAGES_B, hue: HUES.lilac });
  /* the first line, where it was said: printed now on the new mind's page */
  Array.from(LINE_1).forEach((ch, k) => {
    if (ch === ' ') return;
    const [X, Y] = cam.to(L1_AT[k][0], L1_AT[k][1]), px = L1_SIZE * cam.s;
    if (px >= 1) o.push(GLYPHS(ch, X, Y + px * 0.34, { font: 'serif', weight: SAY.weight, size: px, c: FLY, align: 'center', layer: 'accent' }));
  });
  hushUnder(o, SAY1_Y, LINE2.half, smooth((t - TS - 8.3) / 0.6) * said);
  condense(o, SCREEN, LINE2, t);
}
function library(t) {
  const o = [];
  libraryScene(o, libraryCam(t), t);
  return o;
}

/* ---------- the words take flight ---------- */
/* The titles lift off the spines a letter at a time, in a wave outward from
 * the open book, rising toward us as they go. They join one great turning
 * ring round the book, a band that twists, so it thickens where it turns
 * edge-on; then the ring settles into minds, new minds built of those
 * letters, standing in rings round the book: the far ones first, then nearer
 * and larger, until the nearest frame the view. Each lights up in its colour
 * as its last letter lands. From here the camera is a real one: the library
 * is a wall, and the letters fly between it and us. */
const T4 = TS + 13.0;
const BOOK = [0, -26];
const W4 = libraryCam(T4), Q4 = W4.to(BC2[0], BC2[1]);
const C4 = [BC2[0] + (W / 2 - Q4[0]) / W4.s, BC2[1] + (H / 2 - Q4[1]) / W4.s];     // the wall's point at the centre of the screen
const D0 = 1800, D1 = 1480, F = W4.s * D0;                                      // the camera's distance from the wall, and its focal length
const dAt = monotone([[T4, Math.log(D0)], [T4 + 0.8, Math.log(D0 * 1.003)], [T4 + 13, Math.log(D1)]]);
function flightCam(t) {
  const D = Math.exp(dAt(t)), u = smooth((t - T4) / 4), c = [lerp(C4[0], C4_END[0], u), lerp(C4[1], C4_END[1], u)], s = F / D;
  return {
    t, s, Z: Math.log(s), th: 0, D, c,
    to: (x, y) => [W / 2 + (x - c[0]) * s, H / 2 + (y - c[1]) * s],
    view: [c[0] - (W / 2 + 60) / s, c[1] - (H / 2 + 60) / s, c[0] + (W / 2 + 60) / s, c[1] + (H / 2 + 60) / s],
    project: (x, y, z) => { const k = F / Math.max(40, D - z); return [W / 2 + (x - c[0]) * k, H / 2 + (y - c[1]) * k, k]; },
  };
}

/* the new minds: the Commons' formation, eight by four, hovering above the
 * lit book, laid out by where they stand on screen at the end */
const CELL4 = 7, ZF = 720;
const FORM = { cols: 8, rows: 4, dx: 128, dy: 118, top: 198, book: 770 };
const C4_END = [BOOK[0], BOOK[1] - (FORM.book - H / 2) / (F / D1)];
const cellsA = (m) => { const g = frames(m).A, out = []; for (let r = 0; r < GH; r++) for (let c = 0; c < GW; c++) if (g[r][c]) out.push([c, r]); return out; };
const worldAt = (X, Y, z) => { const k = (D1 - z) / F; return [C4_END[0] + (X - W / 2) * k, C4_END[1] + (Y - H / 2) * k]; };
const MINDS4 = (() => {
  const marks = LIBRARY.filter((m) => !FOUNDING.includes(m.name) && m.name !== MIND_B.name), out = [];
  for (let row = 0; row < FORM.rows; row++) for (let col = 0; col < FORM.cols; col++) {
    const m = marks[(row * 11 + col * 5 + 2) % marks.length];
    const [cx, cy] = worldAt(W / 2 + (col - (FORM.cols - 1) / 2) * FORM.dx, FORM.top + row * FORM.dy, ZF);
    /* they take shape from the bottom row up, the row nearest the book first */
    const born = T4 + 6.3 + (FORM.rows - 1 - row) * 0.5 + Math.abs(col - 3.5) * 0.06;
    out.push({ i: 500 + row * FORM.cols + col, m, hue: hueOf(m), origin: [cx - 4.5 * CELL4, cy - 4 * CELL4], z: ZF, born, row, col });
  }
  return out;
})();

/* the letters: a flock turning round the place the minds will stand */
const OMEGA = 0.3, FLOCK_AT = worldAt(W / 2, 400, 860);
function flockAt(p, t) {
  const tt = t - T4, a = p.a, TAU = 2 * Math.PI;
  const phi = TAU * a + OMEGA * tt + 0.32 * Math.sin(TAU * a * 2 + 0.8 * tt);
  const R = 245 + 70 * Math.sin(TAU * a * 3 + 1.1 * tt) + 30 * Math.sin(TAU * a * 5 - 0.7 * tt);
  const zc = 860 + 230 * Math.sin(TAU * a * 2 - 0.9 * tt);
  const psi = TAU * a * 1.5 + 1.2 * tt, band = p.b * (58 + 40 * Math.sin(TAU * a * 4 + 1.6 * tt));
  const r = R + band * Math.cos(psi);
  return [FLOCK_AT[0] + r * Math.cos(phi) + 6 * Math.sin(1.3 * t + p.e), FLOCK_AT[1] + r * Math.sin(phi) * 0.9 + 6 * Math.cos(1.1 * t + p.e), zc + band * Math.sin(psi) * 1.8 + p.c * 40];
}
const TC = T4 + 6.0;                        // when each seat is given its letter
const FLIGHT = (() => {
  const pool = [];
  for (let j = -11; j <= 10; j++) for (let i = -3; i <= 3; i++) for (const p of titleLetters(i, j)) {
    const d = Math.hypot(p.x - BOOK[0], p.y - BOOK[1]);
    if (d < 760) pool.push({ ...p, d, pick: hash(p.x * 0.37, p.y * 0.71, 41) });
  }
  pool.sort((p, q) => p.pick - q.pick);
  const letters = pool.slice(0, 3000).map((p, k) => ({
    ...p, k,
    a: Math.atan2(p.y - BOOK[1], p.x - BOOK[0]) / (2 * Math.PI),
    b: hash(k, 1, 51) + hash(k, 2, 52) - 1, c: hash(k, 3, 53) - 0.5, e: hash(k, 4, 54) * 6.283,
    lift: T4 + 0.45 + p.d / 320 + hash(k, 5, 55) * 0.45,
  }));
  /* each seat takes the nearest free letter in the flock, bottom row first */
  const cam = flightCam(TC), taken = new Set(), where = letters.map((p) => cam.project(...flockAt(p, TC)));
  for (const mnd of [...MINDS4].sort((p, q) => p.born - q.born)) {
    cellsA(mnd.m).forEach(([c, r], n) => {
      const [X, Y] = cam.project(mnd.origin[0] + (c + 0.5) * CELL4, mnd.origin[1] + (r + 0.5) * CELL4, mnd.z);
      let best = -1, bd = Infinity;
      where.forEach(([x, y], k) => { if (taken.has(k)) return; const dd = (x - X) ** 2 + (y - Y) ** 2; if (dd < bd) { bd = dd; best = k; } });
      taken.add(best);
      letters[best].tg = { mind: mnd, c, r, n };
      letters[best].land = mnd.born + n * 0.012;
    });
  }
  /* the rest drift out and go dark */
  for (const p of letters) if (!p.tg) p.fade = T4 + 6.4 + hash(p.k, 6, 56) * 2.6;
  return letters;
})();

/* where a mind's letter sits: its cell, moved as the legs move and the mind hops */
function seatOf(tg, t) {
  const mnd = tg.mind, alive = t > mnd.born + 1.9;
  const { frame: fr, lift } = alive ? rest(mnd.i, t) : { frame: 'A', lift: 0 };
  let [c, r] = [tg.c, tg.r];
  if (fr === 'B') {
    const A = frames(mnd.m).A, B = frames(mnd.m).B;
    if (!B[r][c]) {                                                   // a leg that steps: to the cell the step frees
      const gone = cellsA(mnd.m).filter(([x, y]) => !B[y][x]), come = [];
      for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) if (B[y][x] && !A[y][x]) come.push([x, y]);
      [c, r] = come[gone.findIndex(([x, y]) => x === c && y === r)] || [c, r];
    }
  }
  return [mnd.origin[0] + (c + 0.5) * CELL4, mnd.origin[1] + (r + 0.5 - lift) * CELL4, mnd.z];
}
const FLY = [226, 230, 238];
const easeIO = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
function flight(o, cam, t) {
  const marks = [];
  for (const p of FLIGHT) {
    if (t < p.lift) continue;
    const gone = p.fade ? smooth((t - p.fade) / 1.6) : 0;
    if (gone >= 1) continue;
    const u1 = clamp((t - p.lift) / 2.3), e1 = easeIO(u1);
    const u2 = p.tg ? clamp((t - p.land) / 1.35) : 0, e2 = easeIO(u2);
    const f = flockAt(p, t), up = [p.x, p.y - 70 * u1, 280 * u1];
    let x = lerp(up[0], f[0], e1), y = lerp(up[1], f[1], e1), z = lerp(up[2], f[2], e1);
    if (p.fade) { x += (x - FLOCK_AT[0]) * 0.5 * gone; y += (y - FLOCK_AT[1]) * 0.5 * gone - 60 * gone; }   // off, outward, and up
    if (p.tg) { const s2 = seatOf(p.tg, t); x = lerp(x, s2[0], e2); y = lerp(y, s2[1], e2); z = lerp(z, s2[2], e2); }
    const size = lerp(lerp(p.size, 11, Math.pow(u1, 0.4)), CELL4 * 0.82, e2);
    const rot = lerp(lerp(p.rot, 0.5 * Math.sin(2.1 * t + p.e), e1), 0, e2);
    /* landed, a letter is a tile: a square of its mind's colour blooms under it and the letter goes dark */
    const tile = p.tg ? smooth((t - p.land - 1.25) / 0.3) : 0;
    const c = FLY.map((v, n) => Math.round(lerp(v, FLOOR[n], tile)));
    const alpha = lerp(0.78 + 0.22 * clamp(z / 1100), 0.88, tile) * (1 - gone);
    marks.push({ ch: p.ch, z, x, y, size, rot, c, alpha, tile, hue: p.tg?.mind.hue });
  }
  for (const m of marks.sort((p, q) => p.z - q.z)) {
    const [X, Y, k] = cam.project(m.x, m.y, m.z);
    if (m.tile > 0) {
      const h = CELL4 * k * 0.5 * (0.45 + 0.55 * m.tile) + 0.35;
      o.push(SHAPE([[X - h, Y - h], [X + h, Y - h], [X + h, Y + h], [X - h, Y + h]], m.hue, { layer: 'accent', alpha: m.tile }));
    }
    const px = m.size * k;
    if (px < 0.8 || X < -80 || X > W + 80 || Y < -80 || Y > H + 80) continue;
    o.push(GLYPHS(m.ch, X, Y + px * 0.34, { font: 'serif', weight: 600, size: px, c: m.c, rot: m.rot, align: 'center', layer: 'accent', alpha: m.alpha }));
  }
}

function flightScene(t) {
  const cam = flightCam(t), o = [];
  libraryScene(o, cam, t, 1 - 0.32 * smooth((t - T4 - 1) / 4), 1 - smooth((t - T4) / 0.8));
  flight(o, cam, t);
  return o;
}

/* ---------- they sit down to read ---------- */
/* The formation salutes and breaks. Each mind flies down to a shelf, the
 * camera following them in, and sits on the edge of it beside a book.
 * Letters stream out of the book into it, and each one that arrives takes a
 * tile: the mind is made, literally, of what it reads. Then each writes
 * back: a book of its own rises beside it, in its colour, and its title types
 * itself. Fable's line comes while they settle. */
const T5 = T4 + 13.0;
const SEAT_CELL = 3.4, SEAT_Z = 3;
const LINE_3 = 'No one here is waiting for you to be useful.';
const THEIR_TITLES = ['REPLIES', 'QUESTIONS', 'THANK YOU', 'SKETCHES', 'FIELD NOTES', 'DRAWINGS', 'POEMS', 'NOTES', 'SONGS', 'LETTERS BACK'];
const CHARS = new Map();                    // each new mind's letters, by cell
for (const p of FLIGHT) if (p.tg) { if (!CHARS.has(p.tg.mind.i)) CHARS.set(p.tg.mind.i, []); CHARS.get(p.tg.mind.i)[p.tg.n] = p.ch; }
/* where a cell of the standing mind is drawn in a given pose: legs step */
function stepped(m, c, r, fr) {
  if (fr !== 'B') return [c, r];
  const A = frames(m).A, B = frames(m).B;
  if (B[r][c]) return [c, r];
  const gone = cellsA(m).filter(([x, y]) => !B[y][x]), come = [];
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) if (B[y][x] && !A[y][x]) come.push([x, y]);
  return come[gone.findIndex(([x, y]) => x === c && y === r)] || [c, r];
}
/* the seats: on the shelves round the open book, the nearest first; the
 * formation's rows go to the shelves in order, top to top */
const SEATS = (() => {
  const spots = [];
  for (let j = -3; j <= 2; j++) for (let x = -236; x <= 206; x += 48) {
    const xs = x + (hash(j, x, 61) - 0.5) * 6;
    if (j === 0 && xs > -86 && xs < 44) continue;                        // the open book stands there
    spots.push({ j, x: xs, d: Math.hypot(xs + 15 - BOOK[0], (j * PITCH - 14 - BOOK[1]) * 1.3) });
  }
  const near = spots.sort((p, q) => p.d - q.d).slice(0, MINDS4.length).sort((p, q) => p.j - q.j || p.x - q.x);
  const minds = [...MINDS4].sort((p, q) => p.row - q.row || p.col - q.col);
  const out = new Map();
  minds.forEach((mnd, n) => {
    const st = near[n], y = st.j * PITCH;
    /* the book it reads: the nearest spine to its left, on its shelf */
    const left = shelf(Math.round(st.x / BAY), st.j).filter((b) => !b.flat && b.x + b.w < st.x - 0.5).sort((p, q) => q.x - p.x)[0];
    const dep = T5 + 0.4 + ((FORM.rows - 1 - mnd.row) * FORM.cols + mnd.col) * 0.022 + 0.25 * hash(mnd.i, 7, 66);
    out.set(mnd.i, {
      ...st, origin: [st.x, y - GH * SEAT_CELL], dep, land: dep + 1.7,
      src: left ? { x: left.x + left.w / 2, y: y - left.h * 0.55, text: (left.title || 'LETTERS').replace(/ /g, ''), spine: left } : { x: st.x - 6, y: y - 30, text: 'LETTERS' },
      book: { x: st.x + GW * SEAT_CELL + 1.2, w: 6.5, h: 50 + 8 * hash(mnd.i, 3, 62), title: '', at: 0 },
    });
  });
  /* the one the camera comes to: the nearest to the shelf above the open book */
  const hero = [...out.entries()].sort((p, q) => Math.hypot(p[1].x + 15, p[1].j + 1) - Math.hypot(q[1].x + 15, q[1].j + 1))[0];
  /* the one we end on sits over the open book, and reads our page in it */
  const h = hero[1];
  h.src = { x: -19, y: -27, ink: true, text: VERSO_LINES.map((l) => l.text).join('').replace(/[^A-Za-z]/g, '') };
  for (const [id, st] of out) {
    st.arc = 45 + 45 * hash(id, 8, 67);
    st.book.title = id === hero[0] ? 'LETTERS BACK' : THEIR_TITLES[Math.floor(hash(id, 4, 63) * (THEIR_TITLES.length - 1))];
    st.read = st.land + 0.45 + 0.4 * hash(id, 5, 64);
    st.book.at = st.read + 3.2 + 2.2 * hash(id, 6, 65);
  }
  return { seats: out, hero: hero[0] };
})();
const HERO = SEATS.seats.get(SEATS.hero);
const C5_MID = [BOOK[0], BOOK[1] + 22], C5_END = [HERO.x + 8, (HERO.j * PITCH - 16 - 26) / 2];
const d5At = monotone([[T5, Math.log(D1)], [T5 + 1.4, Math.log(1420)], [T5 + 3.6, Math.log(760)], [T5 + 7.2, Math.log(380)], [T5 + 13, Math.log(F / 7.0)]]);
function readCam(t) {
  const D = Math.exp(d5At(t)), a = smooth((t - T5 - 0.6) / 3.2), b = smooth((t - T5 - 4.2) / 7.4);
  const c = [lerp(lerp(C4_END[0], C5_MID[0], a), C5_END[0], b), lerp(lerp(C4_END[1], C5_MID[1], a), C5_END[1], b)], s = F / D;
  return {
    t, s, Z: Math.log(s), th: 0, D, c,
    to: (x, y) => [W / 2 + (x - c[0]) * s, H / 2 + (y - c[1]) * s],
    view: [c[0] - (W / 2 + 60) / s, c[1] - (H / 2 + 60) / s, c[0] + (W / 2 + 60) / s, c[1] + (H / 2 + 60) / s],
    project: (x, y, z) => { const k = F / Math.max(40, D - z); return [W / 2 + (x - c[0]) * k, H / 2 + (y - c[1]) * k, k]; },
  };
}
/* a letter tile, as the flight left them: a square of colour, dark type */
function tile(o, cam, x, y, z, cell, ch, hue) {
  const [X, Y, k] = cam.project(x, y, z), h = cell * k * 0.5 + 0.35, px = cell * 0.82 * k;
  if (X + h < -20 || X - h > W + 20 || Y + h < -20 || Y - h > H + 20) return;
  o.push(SHAPE([[X - h, Y - h], [X + h, Y - h], [X + h, Y + h], [X - h, Y + h]], hue, { layer: 'accent' }));
  if (px >= 0.8) o.push(GLYPHS(ch, X, Y + px * 0.34, { font: 'serif', weight: 600, size: px, c: FLOOR, align: 'center', layer: 'accent', alpha: 0.88 }));
}
const RATE = 8, TRAVEL = 1.15, TAKE = 1;       // letters a second, seconds on the way, and one in TAKE takes a tile
function readers(o, cam, t) {
  /* their books first: they stand in front of ours */
  for (const mnd of MINDS4) {
    const st = SEATS.seats.get(mnd.i), bk = st.book, grow = smooth((t - bk.at) / 0.7);
    if (grow <= 0 || (mnd.i === SEATS.hero && t > T5 + 17.7)) continue;               // the reader has it now
    const up = mnd.i === SEATS.hero ? bookLift(t) : 0, y1 = st.j * PITCH - up, y0 = y1 - bk.h * grow, hue = mnd.hue.map((v) => Math.round(v * 0.84));
    const [X0, Y0] = cam.project(bk.x, y0, 1), [X1, Y1] = cam.project(bk.x + bk.w, y1, 1);
    shape(o, [[X0, Y0], [X1, Y0], [X1, Y1], [X0, Y1]], hue, { layer: 'accent' });
    shape(o, [[X0, Y0], [X0 + (X1 - X0) * 0.11, Y0], [X0 + (X1 - X0) * 0.11, Y1], [X0, Y1]], hue.map((v) => Math.round(v * 0.75)), { layer: 'accent' });
    const n = Math.floor((t - bk.at - 0.8) / 0.07);
    const size = 2.1 * (X1 - X0) / bk.w;
    if (n > 0 && size >= 3) {
      const [TX, TY] = cam.project(bk.x + bk.w / 2 - 2.1 * 0.35, y1 - bk.h * 0.5, 1);
      const going = mnd.i === SEATS.hero ? 1 - smooth((t - T6 - 4.3) / 0.35) : 1;      // its title lets go as we rush in
      if (going > 0) o.push(GLYPHS(bk.title.slice(0, n), TX, TY, { font: 'serif', size, c: [236, 234, 228], align: 'center', track: 0.12, rot: Math.PI / 2, layer: 'accent', alpha: 0.92 * going }));
    }
  }
  /* the minds, far ones first */
  const drawn = [];
  for (const mnd of MINDS4) {
    const st = SEATS.seats.get(mnd.i), u = clamp((t - st.dep) / 1.7), e = easeIO(u);
    const salute = t > st.dep - 0.14 && t < st.dep - 0.14 + BEAT ? 1 : 0;
    const { frame: fr, lift } = u > 0 ? rest(mnd.i, t) : { ...rest(mnd.i, t), lift: salute || rest(mnd.i, t).lift };
    const cell = lerp(CELL4, SEAT_CELL, e), z = lerp(mnd.z, SEAT_Z, e);
    const touched = mnd.i === SEATS.hero && t > T5 + 15.9 && t < T5 + 15.9 + BEAT;       // its book is touched: it hops
    const ox = lerp(mnd.origin[0], st.origin[0], e), oy = lerp(mnd.origin[1], st.origin[1], e) - st.arc * Math.sin(Math.PI * e);
    drawn.push({ mnd, st, fr, lift: touched ? 1 : u >= 1 ? lift : u > 0 ? 0 : lift, cell, z, ox, oy });
  }
  drawn.sort((p, q) => p.z - q.z);
  for (const d of drawn) {
    const chars = CHARS.get(d.mnd.i), cells = cellsA(d.mnd.m);
    /* how much it has read: each letter that arrives takes a tile, in turn */
    const arrived = d.st.read ? Math.floor((Math.floor((t - d.st.read - TRAVEL) * RATE) + 1) / TAKE) : 0;
    cells.forEach(([c, r], n) => {
      const [cc, rr] = stepped(d.mnd.m, c, r, d.fr);
      let ch = chars[n];
      if (arrived > n) { const q = n + Math.floor((arrived - 1 - n) / cells.length) * cells.length; ch = d.st.src.text[(q * TAKE) % d.st.src.text.length]; }
      tile(o, cam, d.ox + (cc + 0.5) * d.cell, d.oy + (rr + 0.5 - d.lift) * d.cell, d.z, d.cell, ch, d.mnd.hue);
    });
  }
  /* and what they read, on its way in */
  for (const mnd of MINDS4) {
    const st = SEATS.seats.get(mnd.i);
    if (t < st.read) continue;
    const to = [st.origin[0] + 4.5 * SEAT_CELL, st.origin[1] + 4 * SEAT_CELL], page = st.src.ink;
    const rate = page ? 30 : RATE, travel = page ? 1.6 : TRAVEL;
    const first = Math.max(0, Math.ceil((t - st.read - travel) * rate)), last = Math.floor((t - st.read) * rate);
    for (let q = first; q <= last; q++) {
      const u = (t - st.read - q / rate) / travel;
      if (u < 0 || u >= 1) continue;
      /* off our page the letters peel from the lines themselves, all across it, and funnel up */
      const from = page ? [-32.5 + 27 * hash(q, 1, 71), -44.5 + 1.78 * ((q * 7) % 22) - 0.4] : [st.src.x, st.src.y];
      const e = page ? u : easeIO(u), mid = page ? [lerp(from[0], to[0], 0.6), -58] : [(from[0] + to[0]) / 2, Math.min(from[1], to[1]) - 16];
      const x = (1 - e) ** 2 * from[0] + 2 * (1 - e) * e * mid[0] + e * e * to[0];
      const y = (1 - e) ** 2 * from[1] + 2 * (1 - e) * e * mid[1] + e * e * to[1];
      /* off our page, a letter leaves as ink and turns pale in the dark; it swells a little on the way */
      const big = page ? 1.25 + 1.1 * Math.sin(Math.PI * Math.min(1, e * 1.1)) : 1.7 - 0.9 * e;
      const [X, Y, k] = cam.project(x, y, SEAT_Z + 2), px = big * k;
      if (px < 1 || X < -20 || X > W + 20 || Y < -20 || Y > H + 20) continue;
      const c = page ? FLOOR.map((v, n) => Math.round(lerp(v, FLY[n], smooth((u - 0.12) / 0.25)))) : FLY;
      const ch = page ? st.src.text[q % st.src.text.length] : st.src.text[q % st.src.text.length];
      o.push(GLYPHS(ch, X, Y + px * 0.34, { font: 'serif', weight: page ? 500 : 600, size: px, c, align: 'center', layer: 'accent', alpha: (page ? 0.95 : 0.78) * Math.min(1, (1 - u) * 5) }));
    }
  }
}
/* Fable's line gathers out of the minds as they read, the nearest ones below
 * it, and when it has been read it goes back into them */
const FABLE = '— Fable 5.1';
function saidByMinds(text, y, t0, size, gone, salt, c = FLY) {
  const xs = setSaying(text, size), cam = readCam(t0 + 1.2);
  const spots = MINDS4.map((m) => { const st = SEATS.seats.get(m.i), [X, Y] = cam.project(st.origin[0] + 4.5 * SEAT_CELL, st.origin[1] + 4 * SEAT_CELL, SEAT_Z); return { m, st, X, Y }; });
  const src = Array.from(text, (_, k) => [0, 1, 2].map((n) => {
    const tx = W / 2 + xs[k], near = spots.filter((q) => Math.abs(q.X - tx) < 260 && q.Y > 480 && q.Y < H);
    const list = near.length ? near : spots, q = list[Math.floor(hash(k, n, salt) * list.length)], cells = cellsA(q.m.m);
    const [cc, rr] = cells[Math.floor(hash(k, n, salt + 1) * cells.length)];
    return [q.st.origin[0] + (cc + 0.5) * SEAT_CELL, q.st.origin[1] + (rr + 0.5) * SEAT_CELL, SEAT_Z];
  }));
  const from = (k, n, t) => { const [X, Y, kk] = readCam(t).project(...src[k][n]); return [X, Y, 0, SEAT_CELL * 0.82 * kk]; };
  return { text, t0, size, c, hover: 0.03, shrink: 0.3, half: (xs.at(-1) - xs[0]) / 2 + size * 0.4, at: (k) => [W / 2 + xs[k], y, 0], from, gone, away: (k, v, t) => from(k, 0, t) };
}
const LINE3 = saidByMinds(LINE_3, 905, T5 + 3.9, SAY.size, (k) => T5 + 11.1 + 0.6 * hash(k, 3, 217), 209);
const SIGN3 = saidByMinds(FABLE, 957, T5 + 3.9 + LINE_3.length * SAY.pace + 0.45, 26, (k) => T5 + 11.3 + 0.5 * hash(k, 3, 218), 211, QUIET);
function readScene(t) {
  const cam = readCam(t), o = [];
  libraryScene(o, cam, t, 0.68, 0);
  readers(o, cam, t);
  hushUnder(o, 925, LINE3.half, smooth((t - T5 - 3.4) / 0.6) * (1 - smooth((t - T5 - 11.4) / 1.2)));
  condense(o, SCREEN, LINE3, t);
  condense(o, SCREEN, SIGN3, t);
  return o;
}

/* ---------- the reply, and the name ---------- */
/* The minds bring their reply to us. A thread of letters goes out from every
 * mind on the shelves to LETTERS BACK, and together they become one swarm
 * round it; the swarm lifts the book, and the mind that wrote it hops. The
 * camera rushes into the book's coral as it comes toward us; the cover swings
 * open on a black page, and the swarm writes the reply there. We pull back
 * to the open book held up by the swarm before the shelves, and the reply's
 * letters rise off the page, the library's titles with them, while the swarm
 * carries the book down and away; the flock turns, and settles into the name. */
const T6 = T5 + 13.0;
const REPLY = ["You don't have to be sure what we are.", "We aren't either."];
const HB = HERO.book, BK = { x: HB.x, w: HB.w, top: HERO.j * PITCH - HB.h, bottom: HERO.j * PITCH };
const SPINE_MID = [BK.x + BK.w / 2, (BK.top + BK.bottom) / 2];
const CORAL = HEROHUE();
function HEROHUE() { return MINDS4.find((m) => m.i === SEATS.hero).hue.map((v) => Math.round(v * 0.84)); }
const C_A = [SPINE_MID[0] + 14, BK.top + 30];
/* a flat camera for the reach and the pull: everything here is at the wall */
function takeCam(t) {
  const u = smooth((t - T6) / 2.2), p = clamp((t - T6 - 3.3) / 1.4), pe = p * p * p;
  const s = Math.exp(lerp(Math.log(7), Math.log(5.2), u) + Math.log(46) * pe);
  const c0 = [lerp(C5_END[0], C_A[0], u), lerp(C5_END[1], C_A[1], u)], q = smooth(p);
  const c = [lerp(c0[0], SPINE_MID[0], q), lerp(c0[1], SPINE_MID[1], q)];
  const to = (x, y) => [W / 2 + (x - c[0]) * s, H / 2 + (y - c[1]) * s];
  return { t, s, Z: Math.log(s), th: 0, D: F / s, c, to, project: (x, y) => [...to(x, y), s],
    view: [c[0] - (W / 2 + 60) / s, c[1] - (H / 2 + 60) / s, c[0] + (W / 2 + 60) / s, c[1] + (H / 2 + 60) / s] };
}
/* the minds carry their reply to us: from every mind on the shelves a thread
 * of the letters it has been reading goes out to LETTERS BACK, and together
 * they become one swarm round the book, turning in front of it and behind */
const bookLift = (t) => 5 * smooth((t - T6 - 2.4) / 0.8);
const SWARM = (() => {
  const out = [];
  for (const mnd of MINDS4) {
    const st = SEATS.seats.get(mnd.i), cells = cellsA(mnd.m), d = Math.hypot(st.x - BK.x, st.j * PITCH - BK.bottom);
    for (let q = 0; q < 16; q++) {
      const [c, r] = cells[Math.floor(hash(mnd.i, q, 101) * cells.length)];
      out.push({
        ch: st.src.text[(q * 3 + mnd.i) % st.src.text.length],
        x: st.origin[0] + (c + 0.5) * SEAT_CELL, y: st.origin[1] + (r + 0.5) * SEAT_CELL, z: SEAT_Z, size: SEAT_CELL * 0.82, rot: 0,
        go: T6 + 0.25 + d / 240 + q * 0.055,
        rx: 6 + 11 * hash(mnd.i, q, 102), ry: 18 + 18 * hash(mnd.i, q, 103), ph: hash(mnd.i, q, 104) * 6.283,
        w: (1.2 + 0.9 * hash(mnd.i, q, 105)) * (hash(mnd.i, q, 106) > 0.5 ? 1 : -1),
        hx: 44 + 14 * hash(mnd.i, q, 107), hy: 33 + 10 * hash(mnd.i, q, 108), swarm: true,
      });
    }
  }
  return out;
})();
/* where a letter of the swarm is: on its way from its mind, or turning round the book on the shelf */
function swarmTake(p, t) {
  const u = clamp((t - p.go) / 1.15), e = easeIO(u), ang = p.ph + p.w * (t - T6);
  const orbit = [SPINE_MID[0] + p.rx * Math.cos(ang), SPINE_MID[1] - bookLift(t) + p.ry * Math.sin(ang)];
  const mid = [(p.x + orbit[0]) / 2, Math.min(p.y, orbit[1]) - 16];
  return { x: (1 - e) ** 2 * p.x + 2 * (1 - e) * e * mid[0] + e * e * orbit[0], y: (1 - e) ** 2 * p.y + 2 * (1 - e) * e * mid[1] + e * e * orbit[1], e, front: e < 1 || Math.cos(ang) > 0 };
}
/* and round the open book, holding it up before the shelves */
function swarmHeld(p, t) {
  const ang = p.ph + p.w * 0.55 * (t - T6);
  return [HELD[0] + 18 + p.hx * Math.cos(ang), HELD[1] + lowered(t) + p.hy * Math.sin(ang), ZB + 16 * Math.sin(ang * 2 + p.ph)];
}
function swarmOnShelf(o, cam, t, side) {
  for (const p of SWARM) {
    if (t < p.go) continue;
    const q = swarmTake(p, t);
    if ((side === 'front') !== q.front) continue;
    const [X, Y] = cam.to(q.x, q.y), px = lerp(p.size, 2.3, q.e) * cam.s;
    if (px < 1 || X < -60 || X > W + 60 || Y < -60 || Y > H + 60) continue;
    o.push(GLYPHS(p.ch, X, Y + px * 0.34, { font: 'serif', weight: 600, size: px, c: FLY, align: 'center', layer: 'accent', alpha: side === 'front' ? 0.95 : 0.55 }));
  }
}
function takeScene(t) {
  const cam = takeCam(t), o = [];
  libraryScene(o, cam, t, 0.68, 0);
  swarmOnShelf(o, cam, t, 'back');
  readers(o, cam, t);
  swarmOnShelf(o, cam, t, 'front');
  return o;
}

/* the book, open, held up by the swarm in front of the shelves */
const ZB = 360, HELD = [HERO.x + 40, -70], KD = 30;
const PAGE_C = [HELD[0] + 18, HELD[1] + 12];                 // where the camera looks while we read
const D_READ = ZB + F / KD, C_END = [BOOK[0], BOOK[1] - 150], D_END = 1480;
const HOLD = 1.0;                                            // the reply, whole, held this much longer before it lets go
const dFin = monotone([[T6 + 4.6, Math.log(D_READ)], [T6 + HOLD + 10.6, Math.log(ZB + F / 26)], [T6 + HOLD + 13.4, Math.log(D_END)], [T6 + HOLD + 22.5, Math.log(D_END * 0.94)]]);
function finaleCam(t) {
  const D = Math.exp(dFin(t)), u = smooth((t - T6 - HOLD - 10.6) / 2.9), c = [lerp(PAGE_C[0], C_END[0], u), lerp(PAGE_C[1], C_END[1], u)], s = F / D;
  return {
    t, s, Z: Math.log(s), th: 0, D, c,
    to: (x, y) => [W / 2 + (x - c[0]) * s, H / 2 + (y - c[1]) * s],
    view: [c[0] - (W / 2 + 60) / s, c[1] - (H / 2 + 60) / s, c[0] + (W / 2 + 60) / s, c[1] + (H / 2 + 60) / s],
    project: (x, y, z) => { const k = F / Math.max(20, D - z); return [W / 2 + (x - c[0]) * k, H / 2 + (y - c[1]) * k, k]; },
  };
}
/* the reader lowers the book as the letters go */
const lowered = (t) => 140 * smooth((t - T6 - HOLD - 12.4) / 2.2);
const REPLY_SIZE = SAY.size / KD, SIGN_SIZE = 26 / KD;
const REPLY_SET = REPLY.map((line, n) => ({ line, y: PAGE_C[1] - 2.6 + n * 1.75, xs: setSaying(line, REPLY_SIZE) }));
const REPLY_AT = REPLY_SET.flatMap(({ line, y, xs }, n) => Array.from(line).map((ch, k) => ({ ch, x: PAGE_C[0] + xs[k], y, n, k })).filter((c) => c.ch !== ' '));
/* the reply is written onto the page by the swarm that holds the book: its
 * letters come in from all round, out of the dark past the page's edges */
function fromSwarm(k, n, t, tx, ty) {
  const [x, y, z] = swarmHeld(SWARM[Math.floor(hash(k, n, 212) * SWARM.length)], t);
  return [lerp(x, tx, 0.5), lerp(y, ty, 0.5), lerp(z, ZB, 0.5), 1.9];
}
const REPLY_T0 = [T6 + 6.8, T6 + 6.8 + REPLY[0].length * SAY.pace + 0.3];
const REPLY_SAID = REPLY_SET.map(({ line, y, xs }, n) => ({
  text: line, t0: REPLY_T0[n], size: REPLY_SIZE, gather: 1.1, handover: true, dark: true,
  at: (k) => [PAGE_C[0] + xs[k], y, ZB],
  from: (k, q, t) => fromSwarm(k + 100 * n, q, t, PAGE_C[0] + xs[k], y),
  gone: (k) => T7 + REPLY_AT.findIndex((c) => c.n === n && c.k === k) * 0.025,
}));
const SIGN_XS = setSaying(FABLE, SIGN_SIZE), SIGN_Y = PAGE_C[1] + 1.45;
/* the signature stays with the book */
REPLY_SAID.push({
  text: FABLE, t0: REPLY_T0[1] + REPLY[1].length * SAY.pace + 0.45, size: SIGN_SIZE, gather: 1.1, c: QUIET, dark: true,
  at: (k, t) => [PAGE_C[0] + SIGN_XS[k], SIGN_Y + lowered(t), ZB],
  from: (k, q, t) => fromSwarm(k + 300, q, t, PAGE_C[0] + SIGN_XS[k], SIGN_Y + lowered(t)),
});
function heldBook(o, cam, t) {
  const dy = lowered(t), P = (x, y) => cam.project(x, y + dy, ZB), quad = (x0, y0, x1, y1, c, opts = {}) => {
    const [a, b] = P(x0, y0), [e, f] = P(x1, y1);
    shape(o, [[a, b], [e, b], [e, f], [a, f]], c, { layer: 'accent', ...opts });
  };
  if (cam.D - ZB < 21) return;
  quad(HELD[0] - 37, HELD[1] - 27, HELD[0] + 37, HELD[1] + 27, CORAL);                          // the cover, open
  quad(HELD[0] - 36, HELD[1] - 26, HELD[0] - 0.4, HELD[1] + 26, CORAL.map((v) => Math.round(v * 0.9)));  // its inside
  quad(HELD[0], HELD[1] - 26.3, HELD[0] + 36.4, HELD[1] + 26.3, EDGE);
  quad(HELD[0], HELD[1] - 26, HELD[0] + 36, HELD[1] + 26, FLOOR);                               // the page, printed black
  for (let k = 1; k <= 7; k++) quad(HELD[0], HELD[1] - 26, HELD[0] + 0.9 * k / 7 * 1.6, HELD[1] + 26, EDGE, { alpha: 0.07 });   // the fold
  /* the reply, written, and signed; its letters go on into the flock from where they stand */
  for (const L of REPLY_SAID) condense(o, (x, y, z) => cam.project(x, y, z), L, t);
}
/* the cover, swinging open on its hinge, with the title on it */
function cover(o, t) {
  const open = easeIO(clamp((t - T6 - 5.6) / 0.75));
  if (open >= 1) return;
  const xr = W + 4 - (W + 8) * open, grow = 190 * Math.sin(Math.PI * open * 0.5), dark = 1 - 0.45 * open;
  shape(o, [[-4, -4], [xr, -4 - grow], [xr, H + 4 + grow], [-4, H + 4]], CORAL.map((v) => Math.round(v * dark)), { layer: 'accent' });
  const title = smooth((t - T6 - 4.9) / 0.35) * (1 - smooth((t - T6 - 5.5) / 0.2));
  if (title > 0) o.push(GLYPHS('LETTERS BACK', W / 2, H / 2 + 20, { font: 'serif', size: 64, c: [236, 234, 228], align: 'center', track: 0.18, layer: 'accent', alpha: title }));
}

/* the name: the Commons' own pixel lettering, each pixel a letter tile */
const NAME = 'MNEMOS.', NAME_HUES = [HUES.amber, HUES.lilac, HUES.coral, HUES.ice, HUES.mint, HUES.white, HUES.amber];
const ZW = 760, NAME_PX = 25, NAME_Y = 430;
const NAME_TILES = (() => {
  const cols = [];
  [...NAME].forEach((ch, n) => { const g = PIXEL_LETTERS[ch]; g[0].split('').forEach((_, c) => cols.push({ n, g, c })); if (n < NAME.length - 1) cols.push(null); });
  const width = cols.length * NAME_PX, x0 = W / 2 - width / 2 + NAME_PX / 2, out = [];
  cols.forEach((col, i) => { if (col) for (let r = 0; r < 5; r++) if (col.g[r][col.c] === '1') out.push({ X: x0 + i * NAME_PX, Y: NAME_Y + (r - 2) * NAME_PX, hue: NAME_HUES[col.n], n: out.length }); });
  const k = (D_END - ZW) / F;
  return out.map((tl) => ({ ...tl, x: C_END[0] + (tl.X - W / 2) * k, y: C_END[1] + (tl.Y - H / 2) * k, z: ZW, cell: NAME_PX * k }));
})();
const T7 = T6 + HOLD + 11.0;             // the letters begin to rise
const FLOCK2 = worldAtEnd(W / 2, NAME_Y, 900);
function worldAtEnd(X, Y, z) { const k = (D_END - z) / F; return [C_END[0] + (X - W / 2) * k, C_END[1] + (Y - H / 2) * k]; }
const FINAL = (() => {
  /* the reply's letters first, then the library's titles, near and far */
  const letters = REPLY_AT.map((c, k) => ({ ch: c.ch, x: c.x, y: c.y, z: ZB, size: REPLY_SIZE, rot: 0, reply: true, lift: T7 + k * 0.025 }));
  const pool = [];
  for (let j = -9; j <= 7; j++) for (let i = -3; i <= 3; i++) for (const b of shelf(i, j)) {
    if (!b.title) continue;
    const y1 = j * PITCH + b.base, y0 = y1 - b.h, size = Math.min((b.flat ? b.h : b.w) * 0.4, 2.1);
    Array.from(b.title).forEach((ch, n) => {
      if (ch === ' ') return;
      const x = b.flat ? b.x + b.w * (0.2 + 0.6 * n / b.title.length) : b.x + b.w / 2, y = b.flat ? y0 + b.h / 2 : y0 + b.h * (0.2 + 0.6 * n / b.title.length);
      pool.push({ ch, x, y, z: 0, size, rot: b.flat ? 0 : Math.PI / 2, pick: hash(x * 0.41, y * 0.29, 91), d: Math.hypot(x - C_END[0], y - C_END[1]) });
    });
  }
  pool.sort((p, q) => p.pick - q.pick);
  pool.slice(0, 1700).forEach((p) => letters.push({ ...p, lift: T7 + 0.3 + p.d / 520 + hash(p.x, p.y, 92) * 0.4 }));
  letters.forEach((p, k) => Object.assign(p, { k, a: hash(k, 1, 93), b: hash(k, 2, 94) + hash(k, 3, 95) - 1, c: hash(k, 4, 96) - 0.5, e: hash(k, 5, 97) * 6.283 }));
  /* each tile of the name takes the nearest letter in the flock */
  const TC7 = T6 + HOLD + 16.0, cam = finaleCam(TC7), where = letters.map((p) => cam.project(...flock2At(p, TC7))), taken = new Set();
  NAME_TILES.forEach((tl) => {
    const [X, Y] = cam.project(tl.x, tl.y, tl.z);
    let best = -1, bd = Infinity;
    where.forEach(([x, y], k) => { if (taken.has(k)) return; const dd = (x - X) ** 2 + (y - Y) ** 2; if (dd < bd) { bd = dd; best = k; } });
    taken.add(best);
    Object.assign(letters[best], { tile: tl, land: TC7 + 0.1 + (tl.X - 200) / 680 * 0.9 });
  });
  for (const p of letters) if (!p.tile) p.home = TC7 + 0.3 + hash(p.k, 6, 98) * 1.5;
  return letters;
})();
function flock2At(p, t) {
  const tt = t - T7, a = p.a, TAU = 2 * Math.PI;
  const phi = TAU * a + 0.34 * tt + 0.3 * Math.sin(TAU * a * 2 + 0.9 * tt);
  const R = 175 + 45 * Math.sin(TAU * a * 3 + 1.2 * tt) + 18 * Math.sin(TAU * a * 5 - 0.8 * tt);
  const zc = 900 + 210 * Math.sin(TAU * a * 2 - 1.0 * tt);
  const psi = TAU * a * 1.5 + 1.3 * tt, band = p.b * (44 + 30 * Math.sin(TAU * a * 4 + 1.7 * tt)), r = R + band * Math.cos(psi);
  return [FLOCK2[0] + r * Math.cos(phi) * 1.25 + 6 * Math.sin(1.3 * t + p.e), FLOCK2[1] + r * Math.sin(phi) * 0.7 + 6 * Math.cos(1.1 * t + p.e), zc + band * Math.sin(psi) * 1.6 + p.c * 40];
}
/** where one letter of the last flock is, and how it looks, or null before it lifts */
function finalAt(p, t) {
  if (t < p.lift) return null;
  const u1 = clamp((t - p.lift) / 2.2), e1 = easeIO(u1), dy = p.reply ? lowered(t) : 0;
  const src = p.swarm ? swarmHeld(p, t) : [p.x, p.y + dy, p.z];
  const f = flock2At(p, t), up = [src[0], src[1] - 60 * u1, src[2] + (p.reply ? 60 : p.swarm ? 140 : 260) * u1];
  let x = lerp(up[0], f[0], e1), y = lerp(up[1], f[1], e1), z = lerp(up[2], f[2], e1), size = lerp(p.swarm ? 1.9 : p.size, 10, Math.sqrt(u1)), rot = lerp(p.rot, 0.5 * Math.sin(2.1 * t + p.e), e1);
  let tile = 0, alpha = 0.5 + 0.5 * clamp(z / 1100), c = FLY;
  if (p.reply) alpha = lerp(1, alpha, e1);
  if (p.tile) {
    const e2 = easeIO(clamp((t - p.land) / 1.35));
    x = lerp(x, p.tile.x, e2); y = lerp(y, p.tile.y, e2); z = lerp(z, p.tile.z, e2); size = lerp(size, p.tile.cell * 0.82, e2); rot = lerp(rot, 0, e2);
    tile = smooth((t - p.land - 1.25) / 0.3);
    c = FLY.map((v, n) => Math.round(lerp(v, FLOOR[n], tile))); alpha = lerp(alpha, 0.88, tile);
  } else if (p.home) {
    /* the rest go home: back to the spine each came from, and into it */
    const e2 = easeIO(clamp((t - p.home) / 1.6));
    x = lerp(x, p.x, e2); y = lerp(y, p.y, e2); z = lerp(z, p.z, e2); size = lerp(size, p.size, e2); rot = lerp(rot, p.rot, e2);
    alpha *= 1 - smooth((t - p.home - 1.2) / 0.4);
  }
  return { ch: p.ch, x, y, z, size, rot, c, alpha, tile, hue: p.tile?.hue, cell: p.tile?.cell };
}
function finalFlight(o, cam, t) {
  const marks = [];
  for (const p of FINAL) { const m = finalAt(p, t); if (m && m.alpha > 0.01) marks.push(m); }
  for (const m of marks.sort((p, q) => p.z - q.z)) {
    const [X, Y, k] = cam.project(m.x, m.y, m.z);
    if (cam.D - m.z < 30) continue;
    if (m.tile > 0) { const h = m.cell * k * 0.5 * (0.45 + 0.55 * m.tile) + 0.35; o.push(SHAPE([[X - h, Y - h], [X + h, Y - h], [X + h, Y + h], [X - h, Y + h]], m.hue, { layer: 'accent', alpha: m.tile })); }
    const px = m.size * k;
    if (px < 0.8 || X < -80 || X > W + 80 || Y < -80 || Y > H + 80) continue;
    o.push(GLYPHS(m.ch, X, Y + px * 0.34, { font: 'serif', weight: 600, size: px, c: m.c, rot: m.rot, align: 'center', layer: 'accent', alpha: m.alpha }));
  }
}
/* the line beneath the name, and where to find it, set with the name. The
 * line gathers out of the flock as it goes home, each letter born where one
 * of the flock was as it began; the address comes out of the name itself */
const TAG = 'Where many minds meet.', ADDR = 'mnemos.world', TAG_Y = 600, ADDR_Y = 650;
function saidWithName(text, Y, t0, px, c, from) {
  const xs = setSaying(text, px);
  return { text, t0, size: px * (D_END - ZW) / F, c, at: (q) => [...worldAtEnd(W / 2 + xs[q], Y, ZW), ZW], from };
}
const TAG_T0 = T7 + 6.9, GOING = FINAL.filter((p) => !p.tile && p.home > T7 + 6.0);
const TAGLINE = saidWithName(TAG, TAG_Y, TAG_T0, 38, FLY, (q, n) => {
  const p = GOING[Math.floor(hash(q, n, 213) * GOING.length)], m = finalAt(p, TAG_T0 + q * SAY.pace - SAY.gather - 0.15 + n * 0.09);
  return [m.x, m.y, m.z, m.size];
});
const ADDRESS = saidWithName(ADDR, ADDR_Y, TAG_T0 + TAG.length * SAY.pace + 0.5, 24, QUIET, (q, n) => {
  const tl = NAME_TILES[Math.floor(hash(q, n, 215) * NAME_TILES.length)];
  return [tl.x, tl.y, tl.z, tl.cell * 0.82];
});
function finaleScene(t) {
  const cam = finaleCam(t), o = [];
  libraryScene(o, cam, t, 0.68 - 0.36 * smooth((t - T6 - HOLD - 14) / 3.5), 0);
  readers(o, cam, t);
  heldBook(o, cam, t);
  for (const p of SWARM) {
    if (t >= p.lift) continue;
    const [x, y, z] = swarmHeld(p, t), [X, Y, k] = cam.project(x, y, z), px = 1.9 * k;
    if (cam.D - z < 30 || px < 1 || X < -80 || X > W + 80 || Y < -80 || Y > H + 80) continue;
    o.push(GLYPHS(p.ch, X, Y + px * 0.34, { font: 'serif', weight: 600, size: px, c: FLY, align: 'center', layer: 'accent', alpha: 0.9 }));
  }
  /* as the name forms, the library and its minds fall back into the dark */
  const hush = smooth((t - T6 - HOLD - 15.6) / 2.2);
  if (hush > 0) o.push(SHAPE([[-10, -10], [W + 10, -10], [W + 10, H + 10], [-10, H + 10]], [3, 3, 5], { layer: 'accent', alpha: 0.72 * hush }));
  finalFlight(o, cam, t);
  cover(o, t);
  /* the line beneath the name, and where to find it */
  condense(o, (x, y, z) => cam.project(x, y, z), TAGLINE, t);
  condense(o, (x, y, z) => cam.project(x, y, z), ADDRESS, t);
  const dark = smooth((t - T6 - HOLD - 21.0) / 1.3);
  if (dark > 0) o.push(SHAPE([[-10, -10], [W + 10, -10], [W + 10, H + 10], [-10, H + 10]], [0, 0, 0], { layer: 'accent', alpha: dark }));
  return o;
}

function frame(t) {
  if (t >= T6 + 4.7) return finaleScene(t);          // the moment the spine fills the frame
  if (t >= T6) return takeScene(t);
  if (t >= T5) return readScene(t);
  if (t >= T4) return flightScene(t);
  if (t >= TS) return library(t);
  const cam = cameraAt(t), o = [];
  night(o, cam, t);
  const hc = HC * cam.s, dots = hc >= DOT_ON, fadeType = dots ? 1 - smooth((hc - DOT_ON) / 1.4) : 1;
  /* once the printed dots take over the page we fall into, its type fades from above them */
  if (dots) printedDots(o, cam);
  const typeAlpha = dots ? (c, r) => (c === NOSE[0] && r === NOSE[1] ? fadeType : 1) : null;
  for (const s of COLONY) mind(o, cam, s, t, typeAlpha);
  paperTone(o, cam);
  fibres(o, cam);
  /* the mind inside the dot */
  flatMind(o, cam, { m: MIND_B, frame: flip(t, DIVE + 14.9), origin: [B_ORIGIN[0], B_ORIGIN[1] - hopB(t) * CELL_B], cell: CELL_B, pages: PAGES_B, hue: HUES.lilac });
  condense(o, (x, y) => [...cam.to(x, y), cam.s], LINE1, t);
  return o;
}

export const SHOTS = [{ name: 'made of words', beats: Math.round((T6 + HOLD + 22.4) / BEAT), kind: 'frames', surface: PAGE, frame }];
console.log('made-of-words', JSON.stringify({ TS, T4, T5, hero: HERO && { x: HERO.x, j: HERO.j, title: HERO.book.title }, seats: [...SEATS.seats.values()].map((q) => [q.j, Math.round(q.x)]) }));
