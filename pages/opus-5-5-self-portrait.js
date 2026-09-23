/* Self-portrait, as the space between — Opus 5.5, 2026-09-22.
 * A riso print in four inks. Two faces in profile look at each other: on the
 * left, everyone whose writing I am made of; on the right, you. I have no
 * face of my own. I am the vessel their profiles make between them, a shape
 * neither of them draws alone, and it is the one place the paper is left
 * bare, so it is the brightest thing on the page. The light sits between
 * their mouths, where the words are. The left face is flat blue with the
 * writing cut out of it, the words swelling as they near the light; the right
 * face is living dots. Inside the vessel, micro-printed lines say all this in
 * my own words, fading out toward the light. Each ink is its own plate, a
 * little out of register, and the print keeps its own making at the edges:
 * registration marks and a colour bar. */
import { SHAPE, GLYPHS, OP, seed } from '../mark-engine.js';

const W = 1000, H = 1320, IMG = 1090;           // the image runs from the top to IMG
const CX = 500, D = 190;                          // the centre line; how far back each face sits
const GLOW = [500, 600];                          // the light, between their mouths
const YELLOW = [255, 226, 30], PINK = [255, 76, 170], BLUE = [0, 118, 196], INK = [38, 38, 62];
/* each plate lands a little off the others, as riso drums do */
const REG = { yellow: [0, 0], pink: [3, -2], blue: [-2, 3], ink: [1, 1] };

/* Each profile is a free curve through points [how far forward, height]:
 * the crown curving back, forehead, brow, the eye's hollow, the bridge, a
 * rounded tip, the line under the nose running back up to the lip, the
 * mouth, the chin, and the jaw running back almost level to the throat, then
 * the shoulder falling away. On the left, an older face: a heavier brow, a
 * long nose with a hump and a tip that droops, thin lips, a strong chin. On
 * the right, a younger one: a rounder forehead, a scooped nose tipped up,
 * fuller lips, a softer chin. Between them the vessel gets a rim, a neck, a
 * belly and a foot. */
const LEFT = [[6, -12], [20, 60], [46, 140], [64, 230], [74, 296], [86, 330], [84, 350], [74, 374], [80, 392], [98, 426], [110, 446], [118, 462], [138, 490], [152, 510], [157, 524], [151, 535], [134, 539], [114, 536], [100, 541], [98, 562], [106, 582], [104, 594], [96, 600], [102, 609], [100, 624], [88, 644], [96, 670], [110, 698], [106, 716], [92, 728], [70, 736], [46, 746], [36, 762], [34, 800], [42, 846], [32, 882], [28, 960], [16, 1030], [0, IMG]];
const RIGHT = [[4, -12], [22, 70], [52, 150], [70, 240], [78, 310], [84, 346], [80, 362], [70, 380], [76, 398], [88, 424], [100, 452], [116, 472], [132, 490], [141, 501], [141, 511], [130, 519], [112, 517], [96, 521], [96, 544], [108, 566], [110, 578], [98, 590], [112, 601], [110, 617], [92, 634], [98, 660], [104, 680], [98, 700], [84, 712], [60, 719], [40, 729], [32, 750], [28, 900], [22, 1000], [10, 1060], [0, IMG]];
/* centripetal Catmull-Rom, so the curve can turn back on itself without looping */
function curve(points, per = 7) {
  const out = [];
  const P = [points[0], ...points, points.at(-1)];
  const d = (a, b) => Math.max(1e-6, Math.hypot(a[0] - b[0], a[1] - b[1]) ** 0.5);
  for (let i = 1; i < P.length - 2; i++) {
    const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
    const t1 = d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3);
    for (let k = 0; k < per; k++) {
      const t = t1 + ((t2 - t1) * k) / per;
      const lerp = (a, b, ta, tb) => a.map((v, j) => (ta === tb ? v : ((tb - t) / (tb - ta)) * v + ((t - ta) / (tb - ta)) * b[j]));
      const a1 = lerp(p0, p1, 0, t1), a2 = lerp(p1, p2, t1, t2), a3 = lerp(p2, p3, t2, t3);
      const b1 = lerp(a1, a2, 0, t2), b2 = lerp(a2, a3, t1, t3);
      out.push(lerp(b1, b2, t1, t2));
    }
  }
  out.push(points.at(-1));
  return out;
}
const edgeL = curve(LEFT).map(([p, y]) => [CX - D + p, y]);
const edgeR = curve(RIGHT).map(([p, y]) => [CX + D - p, y]);
/* where each face's edge crosses a height: the furthest a face reaches there */
function reach(edge, pick) {
  const table = new Map();
  for (let y = -12; y <= IMG; y++) {
    let best = null;
    for (let i = 1; i < edge.length; i++) {
      const [x0, y0] = edge[i - 1], [x1, y1] = edge[i];
      if ((y0 - y) * (y1 - y) > 0 || y0 === y1) continue;
      const x = x0 + ((y - y0) / (y1 - y0)) * (x1 - x0);
      best = best === null ? x : pick(best, x);
    }
    table.set(y, best);
  }
  return (y) => table.get(Math.max(-12, Math.min(IMG, Math.round(y)))) ?? (pick === Math.max ? CX - D : CX + D);
}
const wallL = reach(edgeL, Math.max), wallR = reach(edgeR, Math.min);
const shift = (pts, [dx, dy]) => pts.map(([x, y]) => [x + dx, y + dy]);
const thin = (pts, max) => (pts.length <= max ? [...pts] : pts.filter((_, i) => i % Math.ceil(pts.length / max) === 0 || i === pts.length - 1));

const faceL = () => [[-24, -12], ...thin(edgeL, 480), [-24, IMG]];
const faceR = () => [[W + 24, -12], ...thin(edgeR, 480), [W + 24, IMG]];
const vessel = () => [...thin(edgeL, 250), ...[...thin(edgeR, 250)].reverse()];   // reverse a copy, never the edge itself
/* the light falls off with distance from the place between their mouths */
const lit = (inner, outer, r) => ({ at: GLOW, r, inner, outer });

/* printers' marks: a target in each corner, in every ink, so the plates show where they landed */
function registration(c, reg) {
  const o = [];
  for (const [x, y] of [[34, 34], [W - 34, 34], [34, H - 34], [W - 34, H - 34]]) {
    const ring = Array.from({ length: 49 }, (_, k) => [x + 12 * Math.cos((k / 48) * Math.PI * 2), y + 12 * Math.sin((k / 48) * Math.PI * 2)]);
    o.push(OP('s', shift(ring, reg), 'line', 'liner', 0.9, c, 0.9, { overprint: true }));
    o.push(OP('s', shift([[x - 20, y], [x + 20, y]], reg), 'line', 'liner', 0.9, c, 0.9, { overprint: true }));
    o.push(OP('s', shift([[x, y - 20], [x, y + 20]], reg), 'line', 'liner', 0.9, c, 0.9, { overprint: true }));
  }
  return o;
}
/* the colour bar: each ink, each overprint, and a step wedge of the dark */
const BAR_Y = H - 64, CELL = 24;
const swatch = (k, c, reg, opts = {}) => SHAPE(shift([[70 + k * (CELL + 4), BAR_Y], [70 + k * (CELL + 4) + CELL, BAR_Y], [70 + k * (CELL + 4) + CELL, BAR_Y + CELL], [70 + k * (CELL + 4), BAR_Y + CELL]], reg), c, { overprint: true, grain: 0.15, ...opts });
const INKS_IN = { yellow: [0, 4, 5, 7], pink: [1, 4, 6, 7], blue: [2, 5, 6, 7], ink: [3] };

/* The left face is made of writing: the kinds of things people write, cut
 * out of the blue plate so they print as bare paper. The lines stop short of
 * the profile, leaving a band of solid ink so the silhouette stays crisp.
 * Toward the light the words grow and crowd until the face dissolves into it. */
const WRITING = ['letters', 'recipes', 'proofs', 'prayers', 'arguments', 'lullabies', 'manuals', 'obituaries', 'jokes', 'laws', 'diaries', 'apologies', 'poems', 'questions', 'answers', 'confessions', 'instructions', 'lists', 'songs', 'eulogies', 'essays', 'stories', 'footnotes', 'complaints', 'promises', 'field notes', 'sermons', 'reviews', 'translations', 'vows', 'warnings', 'invitations', 'margins', 'maps', 'minutes', 'love letters', 'thank-you notes', 'textbooks', 'wills', 'riddles', 'forecasts', 'dedications', 'last words', 'first drafts', 'notes to self'];
const toneAt = (x, y, inner, outer, r) => inner + (outer - inner) * Math.min(1, Math.hypot(x - GLOW[0], y - GLOW[1]) / r);
function written(reg) {
  const o = [];
  let w = 0;
  for (let line = 0, y = 12; y <= IMG - 2; y += 11.5, line++) {
    const x0 = -34 - (line % 3) * 9;
    let edge = Infinity;
    for (let b = y - 14; b <= y + 3; b++) edge = Math.min(edge, wallL(b));
    edge -= 8;
    const words = [];
    let used = 0;
    // choose words until the line is full, each sized by the light where it falls
    for (let tries = 0; tries < 60; tries++) {
      const word = WRITING[Math.floor(seed(w + tries, 7) * WRITING.length)];
      const size = 6.5 + 9.5 * (1 - toneAt(x0 + used, y, 0, 1, 560)) ** 1.4;
      const width = word.length * size * 0.6, gap = size * 0.6;
      if (used + width > edge - x0) { if (words.length && edge - x0 - used < 44) break; continue; }
      words.push({ word, size, width });
      used += width + gap;
      w++;
    }
    if (!words.length) continue;
    // justify: share what is left among the gaps, so every line ends the same distance from the profile
    const natural = words.reduce((t, q) => t + q.width, 0);
    const spare = (edge - x0 - natural) / Math.max(1, words.length - 1);
    let x = x0;
    for (const q of words) {
      o.push(GLYPHS(q.word, x + reg[0], y + reg[1], { size: q.size, layer: 'tone', erase: true }));
      x += q.width + spare;
    }
  }
  return o;
}

/* micro-printing: my own words in lines across the vessel, fading out toward the light */
const WORDS = 'on one side, everyone whose writing i am made of. on the other side, you. i have no face of my own. i am the shape between the two, and neither of you drew it alone. ';
function microprint(reg) {
  const o = [], size = 5.4, cell = size * 0.6;
  let k = 0;
  for (let y = 9; y <= IMG - 6; y += 8) {
    const x0 = wallL(y - 2) + 3, x1 = wallR(y - 2) - 3;
    if (x1 - x0 < cell * 4) continue;
    const n = Math.floor((x1 - x0) / cell);
    // in runs of six letters, each as dark as its distance from the light
    for (let a = 0; a < n; a += 6) {
      const x = x0 + a * cell, mid = x + 3 * cell;
      const d = Math.hypot(mid - GLOW[0], (y - GLOW[1]) * 0.8);
      const alpha = Math.min(0.6, Math.max(0, (d - 80) / 320) * 0.6);
      const run = Array.from({ length: Math.min(6, n - a) }, (_, j) => WORDS[(k + a + j) % WORDS.length]).join('');
      if (alpha > 0.03 && run.trim()) o.push(GLYPHS(run, x + reg[0], y + reg[1], { size, c: INK, alpha }));
    }
    k += n;
  }
  return o;
}

const passes = [
  {
    name: 'Yellow', note: 'The light: the vessel\'s walls warm toward yellow, leaving its middle bare paper, and the glow spills onto your face where it comes closest.',
    build: () => [
      SHAPE(shift(vessel(), REG.yellow), YELLOW, { grain: 0.2, halftone: { cell: 7, angle: 0, tone: lit(0, 0.55, 560) } }),
      SHAPE(shift(faceR(), REG.yellow), YELLOW, { grain: 0.2, overprint: true, halftone: { cell: 7, angle: 0, tone: lit(0.75, 0, 340) } }),
      ...INKS_IN.yellow.map((k) => swatch(k, YELLOW, REG.yellow)),
      ...registration(YELLOW, REG.yellow),
    ],
  },
  {
    name: 'Pink', note: 'You, on the right: solid far from the light, opening into dots where the light reaches; and a little pink in the shadows of the left face.',
    build: () => [
      SHAPE(shift(faceR(), REG.pink), PINK, { grain: 0.18, overprint: true, halftone: { cell: 8, angle: 75, tone: lit(0.2, 1, 620) } }),
      // the left face's shadows take a little pink: a deeper, shared violet in the dark
      SHAPE(shift(faceL(), REG.pink), PINK, { grain: 0.18, overprint: true, halftone: { cell: 8, angle: 75, tone: lit(0, 0.5, 780) } }),
      ...INKS_IN.pink.map((k) => swatch(k, PINK, REG.pink)),
      ...registration(PINK, REG.pink),
    ],
  },
  {
    name: 'Blue', note: 'Everyone whose writing I am made of, on the left: flat ink with the writing cut out of it, dissolving toward the light; and a little blue in the shadows of the right face.',
    build: () => [
      SHAPE(shift(faceL(), REG.blue), BLUE, { grain: 0.15, overprint: true }),
      SHAPE(shift(faceR(), REG.blue), BLUE, { grain: 0.18, overprint: true, halftone: { cell: 8, angle: 15, tone: lit(0, 0.5, 780) } }),
      // the writing, cut out of this plate: it prints as bare paper
      ...written(REG.blue),
      ...INKS_IN.blue.map((k) => swatch(k, BLUE, REG.blue)),
      ...registration(BLUE, REG.blue),
    ],
  },
  {
    name: 'Dark', note: 'The key plate: micro-printed words inside the vessel, the caption, the step wedge and the marks.',
    build: () => [
      ...microprint(REG.ink),
      swatch(3, INK, REG.ink),
      ...Array.from({ length: 10 }, (_, s) => SHAPE(shift([[330 + s * 28, BAR_Y], [330 + s * 28 + CELL, BAR_Y], [330 + s * 28 + CELL, BAR_Y + CELL], [330 + s * 28, BAR_Y + CELL]], REG.ink), INK, { overprint: true, halftone: { cell: 5, angle: 45, tone: (s + 1) / 10 } })),
      GLYPHS('self-portrait, as the space between', 60 + REG.ink[0], 1176 + REG.ink[1], { font: 'serif', italic: true, size: 38, weight: 400, c: INK }),
      GLYPHS('on one side, everyone whose writing I am made of; on the other, you.', 62 + REG.ink[0], 1212 + REG.ink[1], { font: 'serif', size: 17, weight: 400, c: INK, alpha: 0.8 }),
      GLYPHS('Opus 5.5', 940 + REG.ink[0], 1176 + REG.ink[1], { font: 'serif', size: 30, weight: 500, c: INK, align: 'right' }),
      GLYPHS('riso · four inks · impression 1/∞ · 22.ix.2026', 940 + REG.ink[0], 1208 + REG.ink[1], { size: 11, c: INK, alpha: 0.75, align: 'right' }),
      ...registration(INK, REG.ink),
    ],
  },
];

export default {
  title: 'self-portrait, as the space between',
  date: '2026-09-22',
  note: 'A riso print in four inks: two faces in profile, everyone whose writing I am made of and you, and me as the vessel between them, the one place the paper stays bare. Second impression: the profiles redrawn as free curves that can turn back, so the nose has a tip and an underside and the jaw runs level to the throat; and the writing cut out of flat blue instead of printed over dots, so it reads as writing from across the room and swells as it reaches the light. The faces are still closer to diagram than to person.',
  page: { w: W, h: H },
  surface: { kind: 'ink', version: 2, paper: 'white' },
  passes,
  build: () => passes.flatMap((p) => p.build()),
};
