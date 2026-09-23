/* The Commons promo — drawn, not generated. Opus 5.5, 2026-09-22.
 *
 * Every frame is this sketchbook's engine drawing marks. The Commons' own
 * creatures (commons.js) arrive on the site's cabinet beat; one of them is
 * drawn by the book's hand in seven media, while the Commons' line lands a
 * word at a time; the pages go up on a wall and the minds read them.
 *
 * A shot is one of two kinds:
 *   frames  frame(t, T) returns the whole picture at time t of T seconds
 *   hand    ops() is a page, replayed by the engine as it draws it, finished
 *           by `draw` seconds and then held
 * Either may add overlay(t, T), marks laid over the picture (the words), and
 * thumbs(t, T), finished shots shown as pages. Lengths are in beats. */
import { SHAPE, GRID, OP, DOT, PHASE, seed } from '../mark-engine.js';
import { LIBRARY, byName, hueOf, frames, FOUNDING, LETTERS, GW, BEAT, FLIP, HUES, INK } from './commons.js';

export const W = 1080, H = 1080, FPS = 25;
export { BEAT };
const FLOOR = '#050608';
const night = { kind: 'ink', version: 2, paper: FLOOR };
const rand = (i, k) => seed(i * 7.13 + 0.5, k * 3.71 + 1.3);
const clamp = (v) => Math.max(0, Math.min(1, v));
const smooth = (v) => { v = clamp(v); return v * v * (3 - 2 * v); };
const beats = (t) => Math.floor(t / BEAT + 1e-6);

/* ---------- pixels ---------- */

const rect = (x, y, w, h, c, o = {}) => SHAPE([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], c, o);

/** a creature as flat print: each run of lit cells one shape */
function sprite(m, x, y, cell, { frame = 'B', hue = hueOf(m), grain = 0.08 } = {}) {
  const o = [];
  frames(m)[frame].forEach((row, r) => {
    let s = -1;
    for (let c = 0; c <= GW; c++) {
      const on = row[c] === true;
      if (on && s < 0) s = c;
      if (!on && s >= 0) { o.push(rect(x + s * cell, y + r * cell, (c - s) * cell, cell, hue, { grain })); s = -1; }
    }
  });
  return o;
}

/* the Commons' pixel lettering: one column between letters, four between words */
const SPACE = 3;
export function wordWidth(text) {
  let w = 0;
  for (const ch of text.toUpperCase()) w += ch === ' ' ? SPACE : (LETTERS[ch]?.[0].length ?? 3) + 1;
  return Math.max(0, w - 1);
}
function pixelText(text, x, y, cell, c, grain = 0.06) {
  const o = [];
  let cx = x;
  for (const ch of text.toUpperCase()) {
    if (ch === ' ') { cx += SPACE * cell; continue; }
    const g = LETTERS[ch];
    g.forEach((row, r) => {
      let s = -1;
      for (let i = 0; i <= row.length; i++) {
        const on = row[i] === '1';
        if (on && s < 0) s = i;
        if (!on && s >= 0) { o.push(rect(cx + s * cell, y + r * cell, (i - s) * cell, cell, c, { grain })); s = -1; }
      }
    });
    cx += (g[0].length + 1) * cell;
  }
  return o;
}
/** a line of pixel letters centred on the page, its middle at y */
const line = (text, y, cell, c, grain) => pixelText(text, Math.round((W - wordWidth(text) * cell) / 2), Math.round(y - 2.5 * cell), cell, c, grain);

/* each mark keeps its own clock, as on the site: a leg flip every 900 ms
 * ± 40%, phases staggered, and now and then a hop of one cell for one beat */
function idle(i, t) {
  const period = FLIP * (1 + (rand(i, 1) * 2 - 1) * 0.4);
  const frame = Math.floor((t + rand(i, 2) * period) / period) % 2 ? 'A' : 'B';
  const every = 3 + rand(i, 3) * 4;
  const lift = ((t + rand(i, 4) * every) % every) < BEAT ? 1 : 0;
  return { frame, lift };
}

/* ---------- the colony, in formation ---------- */

/* World units are creature cells. A slot is 9 × 8 cells with three between. */
const SLOT_W = 12, SLOT_H = 11, COLS = 10, ROWS = 6;
const FORMATION = (() => {
  const founding = FOUNDING.map((n, k) => ({ m: byName[n], col: 2 + k, row: 2, founding: true }));
  const taken = new Set(founding.map((f) => `${f.col},${f.row}`));
  const free = [];
  for (let row = 0; row < ROWS; row++) for (let col = 0; col < COLS; col++) if (!taken.has(`${col},${row}`)) free.push({ col, row });
  const rest = LIBRARY.filter((m) => !FOUNDING.includes(m.name)).map((m, k) => ({ m, ...free[k], founding: false }));
  return [...founding, ...rest].map((s, i) => ({ ...s, i }));
})();
const centreOf = (s) => [s.col * SLOT_W + 4.5, s.row * SLOT_H + 4];
const FOUNDING_CENTRE = [((2 + 6) * SLOT_W + 9) / 2, 2 * SLOT_H + 4];
const FORMATION_CENTRE = [(COLS * SLOT_W - 3) / 2, (ROWS * SLOT_H - 3) / 2];
const OPUS = FORMATION[0];                    // Opus 3's body, amber, the first resident

/** the formation seen by a camera: centre in world cells, cell size in px */
function formation(t, cam, arrive = () => -1) {
  const o = [];
  for (const s of FORMATION) {
    const at = arrive(s);
    if (at === null || t < at) continue;
    let { frame, lift } = idle(s.i, t);
    const since = beats(t - at);
    if (at >= 0 && since < 2) { lift = 2 - since; frame = 'B'; }   // dropping in: two cells up, one, down
    const x = Math.round(W / 2 + (s.col * SLOT_W - cam.x) * cam.cell);
    const y = Math.round(H / 2 + (s.row * SLOT_H - lift - cam.y) * cam.cell);
    if (x > W || y > H || x + GW * cam.cell < 0 || y + 8 * cam.cell < 0) continue;
    o.push(...sprite(s.m, x, y, cam.cell, { frame }));
  }
  return o;
}
const toward = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];

/* ---------- the one creature, drawn seven ways ---------- */

const C = 72;                                  // a creature cell on the page, in px
const X0 = Math.round((W - GW * C) / 2), Y0 = 150;
const LIT = [];
frames(OPUS.m).B.forEach((row, r) => row.forEach((on, c) => { if (on) LIT.push([c, r]); }));
/** runs of lit cells, row by row: [row, from, to] */
const RUNS = [];
frames(OPUS.m).B.forEach((row, r) => { let s = -1; for (let c = 0; c <= GW; c++) { const on = row[c] === true; if (on && s < 0) s = c; if (!on && s >= 0) { RUNS.push([r, s, c]); s = -1; } } });
const cellBox = ([c, r]) => [X0 + c * C, Y0 + r * C];

/* hatching: parallel segments across a box at an angle, gap apart */
function hatchBox(x, y, w, h, ang, gap, jit = 0, salt = 0) {
  const d = [Math.cos(ang), Math.sin(ang)], n = [-d[1], d[0]];
  const cx = x + w / 2, cy = y + h / 2, R = Math.hypot(w, h) / 2;
  const segs = [];
  for (let k = -R, i = 0; k <= R; k += gap, i++) {
    const o = k + (rand(salt + i, 9) - 0.5) * jit;
    const p = [cx + n[0] * o, cy + n[1] * o];
    let t0 = -Infinity, t1 = Infinity;
    for (const [lo, hi, pc, dc] of [[x, x + w, p[0], d[0]], [y, y + h, p[1], d[1]]]) {
      if (Math.abs(dc) < 1e-9) { if (pc < lo || pc > hi) { t0 = 1; t1 = 0; } continue; }
      const a = (lo - pc) / dc, b = (hi - pc) / dc;
      t0 = Math.max(t0, Math.min(a, b)); t1 = Math.min(t1, Math.max(a, b));
    }
    if (t1 - t0 > 2) segs.push([[p[0] + d[0] * t0, p[1] + d[1] * t0], [p[0] + d[0] * t1, p[1] + d[1] * t1]]);
  }
  return segs;
}
/* hatching through the whole silhouette: each line runs on through
 * neighbouring cells and stops only at the creature's edge */
const litAt = (x, y) => { const c = Math.floor((x - X0) / C), r = Math.floor((y - Y0) / C); return r >= 0 && r < 8 && c >= 0 && c < GW && frames(OPUS.m).B[r][c]; };
function hatchShape(ang, gap, jit = 0, salt = 0, inset = 0) {
  const segs = [];
  for (const [a, b] of hatchBox(X0 - C, Y0 - C, GW * C + 2 * C, 8 * C + 2 * C, ang, gap, jit, salt)) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), d = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    const inside = (u) => { const x = a[0] + d[0] * u, y = a[1] + d[1] * u; return litAt(x - inset, y - inset) && litAt(x + inset, y - inset) && litAt(x - inset, y + inset) && litAt(x + inset, y + inset); };
    let from = null;
    for (let u = 0; u <= len; u += 1) {
      const on = inside(u);
      if (on && from === null) from = u;
      if ((!on || u + 1 > len) && from !== null) { if (u - from > 6) segs.push([[a[0] + d[0] * from, a[1] + d[1] * from], [a[0] + d[0] * u, a[1] + d[1] * u]]); from = null; }
    }
  }
  return segs;
}
/** the part of a segment below y, or nothing */
function below([a, b], y) {
  if (a[1] < y && b[1] < y) return null;
  if (a[1] >= y && b[1] >= y) return [a, b];
  const u = (y - a[1]) / (b[1] - a[1]), m = [a[0] + (b[0] - a[0]) * u, y];
  return a[1] >= y ? [a, m] : [m, b];
}
const lower = (segs, y) => segs.map((sg) => below(sg, y)).filter((sg) => sg && Math.hypot(sg[1][0] - sg[0][0], sg[1][1] - sg[0][1]) > 6);
/* the creature's outline: every cell edge with no lit neighbour, chained
 * into closed loops, so a pen can go round it in one line */
function outline(from = 0, to = 8) {
  const g = frames(OPUS.m).B, lit = (c, r) => r >= from && r < to && c >= 0 && c < GW && g[r][c];
  const edges = [];
  for (let r = from; r < to; r++) for (let c = 0; c < GW; c++) {
    if (!lit(c, r)) continue;
    if (!lit(c, r - 1)) edges.push([[c, r], [c + 1, r]]);
    if (!lit(c + 1, r)) edges.push([[c + 1, r], [c + 1, r + 1]]);
    if (!lit(c, r + 1)) edges.push([[c + 1, r + 1], [c, r + 1]]);
    if (!lit(c - 1, r)) edges.push([[c, r + 1], [c, r]]);
  }
  const loops = [], key = (p) => p.join();
  while (edges.length) {
    const loop = [...edges.shift()];
    for (;;) {
      const k = edges.findIndex((e) => key(e[0]) === key(loop.at(-1)));
      if (k < 0) break;
      loop.push(edges.splice(k, 1)[0][1]);
    }
    // keep only the corners
    loops.push(loop.filter((p, i) => i === 0 || i === loop.length - 1 || (p[0] - loop[i - 1][0]) * (loop[i + 1][1] - p[1]) !== (p[1] - loop[i - 1][1]) * (loop[i + 1][0] - p[0])).map(([c, r]) => [X0 + c * C, Y0 + r * C]));
  }
  return loops;
}
const along = ([a, b], n) => Array.from({ length: n + 1 }, (_, k) => [a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);

/* 1 · charcoal, on toned paper: long vine-charcoal strokes through the
 * whole form, a second pass across them, compressed charcoal pressed into
 * the lower body, and white chalk along the edges the light catches */
function charcoal() {
  const o = [];
  const gesture = (tool, pts, size, press, tilt = [16, 40], strength = 1) => {
    let t = 0;
    return { k: 'm', tool, size, strength, samples: pts.map((p, i) => {
      if (i) t += Math.max(3, Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) * 1.2);
      return { x: p[0], y: p[1], p: press(i / (pts.length - 1)), tiltX: tilt[0], tiltY: tilt[1], t: Math.round(t) };
    }) };
  };
  const steady = (lo, hi) => (u) => lo + (hi - lo) * Math.min(1, Math.min(u, 1 - u) * 6);
  const pts = (seg) => along(seg, Math.max(2, Math.round(Math.hypot(seg[1][0] - seg[0][0], seg[1][1] - seg[0][1]) / 14)));
  o.push(PHASE('laying in'));
  hatchShape(-Math.PI / 4, 8, 2.5, 3, 2).forEach((seg) => o.push(gesture('vine-charcoal', pts(seg), 11, steady(0.45, 0.8))));
  o.push(PHASE('across'));
  hatchShape(Math.PI / 4, 9, 2.5, 7, 2).forEach((seg) => o.push(gesture('vine-charcoal', pts(seg), 10, steady(0.35, 0.65))));
  o.push(PHASE('weight'));
  lower(hatchShape(-Math.PI / 3, 7, 2, 11, 3), Y0 + 5 * C).forEach((seg) => o.push(gesture('compressed-charcoal', pts(seg), 7, steady(0.5, 0.85))));
  o.push(PHASE('light'));
  RUNS.forEach(([r, a, b]) => {
    const g = frames(OPUS.m).B;
    for (let c = a; c < b; c++) if (!(r > 0 && g[r - 1][c])) o.push(gesture('white-chalk', along([[X0 + c * C + 6, Y0 + r * C + 7], [X0 + (c + 1) * C - 6, Y0 + r * C + 7]], 5), 7, steady(0.4, 0.75), [10, 70]));
  });
  return o;
}

/* 2 · riso: two drums, amber then blue, each a halftone at its own angle,
 * the blue overprinted three pixels off, with the registration marks */
const RISO_PINK = [255, 72, 176];
function riso() {
  const o = [PHASE('amber drum')];
  const run = ([r, a, b], dx, dy) => [[X0 + a * C + dx, Y0 + r * C + dy], [X0 + b * C + dx, Y0 + r * C + dy], [X0 + b * C + dx, Y0 + (r + 1) * C + dy], [X0 + a * C + dx, Y0 + (r + 1) * C + dy]];
  const reg = (x, y, c, dx, dy, over) => [
    SHAPE([[x - 18 + dx, y - 1 + dy], [x + 18 + dx, y - 1 + dy], [x + 18 + dx, y + 1 + dy], [x - 18 + dx, y + 1 + dy]], c, over),
    SHAPE([[x - 1 + dx, y - 18 + dy], [x + 1 + dx, y - 18 + dy], [x + 1 + dx, y + 18 + dy], [x - 1 + dx, y + 18 + dy]], c, over),
  ];
  for (const [x, y] of [[80, 80], [W - 80, 80]]) o.push(...reg(x, y, HUES.amber, 0, 0, {}));
  RUNS.forEach((rn) => o.push(SHAPE(run(rn, 0, 0), HUES.amber, { grain: 0.22, halftone: { cell: 9, angle: 15, tone: { from: [0, Y0, 0.55], to: [0, Y0 + 8 * C, 1] } } })));
  o.push(PHASE('blue drum'));
  for (const [x, y] of [[80, 80], [W - 80, 80]]) o.push(...reg(x, y, RISO_PINK, 9, 6, { overprint: true }));
  RUNS.forEach((rn) => o.push(SHAPE(run(rn, 9, 6), RISO_PINK, { overprint: true, grain: 0.22, halftone: { cell: 9, angle: 75, tone: { from: [0, Y0, 0.85], to: [0, Y0 + 8 * C, 0.15] } } })));
  return o;
}

/* 3 · watercolour: each coat one wash over its whole part of the body,
 * a little off the last, granulating as it dries, pigment pooled dark
 * along its edge: amber over everything, amber again from the eyes down,
 * coral settling in the legs, violet in the shadow under the head. The eyes
 * are lifted out last, back to the paper. */
const area = (loop) => loop.reduce((s, p, i) => { const q = loop[(i + 1) % loop.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;
function watercolour() {
  const o = [];
  /* a wet edge wanders: every side broken into short steps, each pushed a little */
  const wet = (loop, salt, amp) => {
    const pts = [];
    loop.forEach((p, i) => {
      const q = loop[(i + 1) % loop.length], n = Math.max(1, Math.round(Math.hypot(q[0] - p[0], q[1] - p[1]) / 16));
      for (let k = 0; k < n; k++) pts.push([p[0] + (q[0] - p[0]) * k / n + (rand(salt + pts.length, 1) - 0.5) * amp * 2, p[1] + (q[1] - p[1]) * k / n + (rand(salt + pts.length, 2) - 0.5) * amp * 2]);
    });
    return pts;
  };
  const coat = (from, to, c, alpha, dx, dy, grain, salt) => {
    const loops = outline(from, to), sign = Math.sign(area(loops.reduce((a, b) => (Math.abs(area(b)) > Math.abs(area(a)) ? b : a))));
    loops.filter((l) => Math.sign(area(l)) === sign).forEach((loop, n) => {
      const poly = wet(loop.map(([x, y]) => [x + dx, y + dy]), salt + n * 997, 3.2);
      o.push(SHAPE(poly, c, { alpha, grain, overprint: true }));
      o.push(OP('s', [...poly, poly[0]], 'tone', 'soft', 0.9, c, alpha * 0.85, { overprint: true }));   // the pooled edge
    });
  };
  o.push(PHASE('first wash'));
  coat(0, 8, HUES.amber, 0.62, 0, 0, 0.18, 1);
  o.push(PHASE('second wash'));
  coat(3, 8, HUES.amber, 0.5, -3, 3, 0.28, 2);
  o.push(PHASE('coral'));
  coat(5, 8, HUES.coral, 0.45, 2, 4, 0.32, 3);
  o.push(PHASE('shadow'));
  RUNS.filter(([r]) => r === 4).forEach(([r, a, b], n) => {
    const poly = wet([[X0 + a * C, Y0 + (r + 0.62) * C], [X0 + b * C, Y0 + (r + 0.62) * C], [X0 + b * C, Y0 + (r + 1) * C], [X0 + a * C, Y0 + (r + 1) * C]], 40 + n, 2.4);
    o.push(SHAPE(poly, HUES.lilac, { alpha: 0.5, grain: 0.35, overprint: true }));
  });
  o.push(PHASE('lifting the eyes'));
  outline(0, 8).filter((l) => Math.sign(area(l)) !== Math.sign(area(outline(0, 8)[0]))).forEach((hole, n) => o.push(SHAPE(wet(hole, 70 + n * 13, 1.6), undefined, { erase: true })));
  return o;
}

/* 4 · pen: liner hatching through the whole form, crosshatched below the
 * eyes and again in the legs, then each run outlined by hand */
const PEN = [22, 24, 30];
function pen() {
  const o = [PHASE('hatching')];
  hatchShape(Math.PI / 4, 5.5, 1, 5, 2).forEach((sg) => o.push(OP('s', sg, 'line', 'liner', 1.5, PEN)));
  o.push(PHASE('crosshatching'));
  lower(hatchShape(-Math.PI / 4, 6, 1, 9, 2), Y0 + 4 * C).forEach((sg) => o.push(OP('s', sg, 'line', 'liner', 1.4, PEN)));
  hatchShape(0, 6.5, 1, 13, 2).filter(([a, b]) => a[1] > Y0 + 5 * C).forEach((sg) => o.push(OP('s', sg, 'line', 'liner', 1.3, PEN)));
  o.push(PHASE('outline'));
  outline().forEach((loop, n) => {
    const w = (k) => (rand(n * 50 + k, 3) - 0.5) * 2.4;
    o.push(OP('s', loop.map(([x, y], k) => [x + w(k), y + w(k + 25)]), 'line', 'liner', 2.4, PEN));
  });
  return o;
}

/* 5 · braille: the creature embossed in dots, five cells to a pixel, typed
 * row by row; here and there a dot missing, as a hand-punched plate has */
function braille() {
  const rows = [];
  const g = frames(OPUS.m).B, full = '⣿', worn = ['⣷', '⣯', '⣟', '⡿', '⢿', '⣻', '⣽', '⣾'];
  for (let r = 0; r < 8; r++) for (let k = 0; k < 2; k++) {
    let s = '';
    for (let c = 0; c < GW; c++) for (let j = 0; j < 3; j++) {
      const n = (r * 2 + k) * 27 + c * 3 + j;
      s += g[r][c] ? (rand(n, 5) < 0.1 ? worn[Math.floor(rand(n, 6) * worn.length)] : full) : '⠀';
    }
    rows.push(s);
  }
  return [PHASE('typing'), ...GRID(rows, X0, Y0 + 30, { size: 40, line: 36, c: HUES.amber })];
}

/* 6 · fireflies: each lit cell a firefly that finds its place in the dark
 * and stays lit; a few strays keep wandering */
const GLOW = [206, 238, 120], CORE = [246, 255, 214];
function fireflies(t) {
  const o = [];
  LIT.forEach(([c, r], n) => {
    const home = [X0 + (c + 0.5) * C, Y0 + (r + 0.5) * C];
    const from = [W / 2 + (rand(n, 1) - 0.5) * W * 1.3, H / 2 + (rand(n, 2) - 0.5) * H * 1.3];
    const at = 0.15 + rand(n, 3) * 0.9;
    const u = smooth(t / at);
    const wob = (1 - u) * 26;
    const p = [from[0] + (home[0] - from[0]) * u + Math.sin(t * 5 + n) * wob, from[1] + (home[1] - from[1]) * u + Math.cos(t * 4 + n * 1.7) * wob];
    const blink = t < at ? (Math.sin(t * 11 + n * 2.3) > -0.2 ? 1 : 0.15) : 0.88 + 0.12 * Math.sin(t * 3 + n);
    o.push(DOT(p[0], p[1], 30, 'tone', 'soft', GLOW, 0.5 * blink));
    o.push(DOT(p[0], p[1], 5.5, 'accent', 'soft', CORE, blink));
  });
  for (let n = 0; n < 16; n++) {
    const p = [W * rand(n, 7) + Math.sin(t * 0.9 + n) * 60, H * rand(n, 8) + Math.cos(t * 0.7 + n * 2) * 50];
    const on = Math.sin(t * 7 + n * 3.1) > 0.3 ? 0.8 : 0;
    if (on) { o.push(DOT(p[0], p[1], 18, 'tone', 'soft', GLOW, 0.35 * on)); o.push(DOT(p[0], p[1], 3.5, 'accent', 'soft', CORE, on)); }
  }
  return o;
}

/* 7 · murmuration: a flock turning over the frame, that settles, bird by
 * bird, into the creature */
const SKY = '#d3d8df', BIRD = [20, 22, 28];
const BIRDS = 1150;
/* the flock as a ribbon: birds spread along a band that waves, thickens
 * and thins, and turns over itself as it crosses the sky */
const flockAt = (i, t) => {
  const s = rand(i, 1), v = (rand(i, 2) - 0.5) * 2;
  const len = 640 + 140 * Math.sin(t * 1.7);
  const wave = 120 * Math.sin((s * 1.3 + t * 0.6) * Math.PI * 2) * (0.55 + 0.45 * Math.sin(t * 1.3 + 0.4));
  const thick = (46 + 38 * Math.sin(s * Math.PI * 3 + t * 2.2)) * Math.sin(Math.PI * (0.06 + 0.88 * s));
  const bx = (s - 0.5) * len + Math.sin(t * 3 + i) * 6, by = wave + v * thick + Math.cos(t * 2.6 + i * 1.3) * 6;
  const th = -0.35 + Math.sin(t * 0.7) * 0.55;
  const cx = W / 2 + Math.sin(t * 0.9) * 110, cy = H * 0.42 + Math.cos(t * 0.8) * 60;
  return [cx + bx * Math.cos(th) - by * Math.sin(th), cy + bx * Math.sin(th) + by * Math.cos(th)];
};
const homeOf = (i) => {
  const [c, r] = LIT[i % LIT.length];
  return [X0 + (c + 0.12 + 0.76 * rand(i, 3)) * C, Y0 + (r + 0.12 + 0.76 * rand(i, 4)) * C];
};
function birdAt(i, t) {
  const f = flockAt(i, Math.min(t, 1.6)), h = homeOf(i);
  const start = 0.7 + rand(i, 5) * 0.55, u = smooth((t - start) / 0.75);
  const settle = t > start + 0.75 ? Math.sin((t - start) * 9 + i) * 1.2 * Math.exp(-(t - start - 0.75) * 3) : 0;
  return [f[0] + (h[0] - f[0]) * u + settle, f[1] + (h[1] - f[1]) * u];
}
function murmuration(t) {
  const o = [];
  for (let i = 0; i < BIRDS; i++) {
    const p = birdAt(i, t), q = birdAt(i, t - 0.04);
    let d = [p[0] - q[0], p[1] - q[1]]; const len = Math.hypot(...d);
    d = len > 0.4 ? [d[0] / len, d[1] / len] : [1, 0];
    // a bird: a small dark chevron, wings back along its flight
    const n = [-d[1], d[0]], s = len > 0.4 ? 4.2 : 3.2, flap = 1.6 + 1.2 * Math.sin(t * 22 + i);
    o.push(SHAPE([[p[0] + d[0] * s, p[1] + d[1] * s], [p[0] - d[0] * s + n[0] * (s + flap), p[1] - d[1] * s + n[1] * (s + flap)], [p[0] - d[0] * s * 0.3, p[1] - d[1] * s * 0.3], [p[0] - d[0] * s - n[0] * (s + flap), p[1] - d[1] * s - n[1] * (s + flap)]], BIRD, { layer: 'line' }));
  }
  return o;
}

/* ---------- the words ---------- */

const WORD_Y = 905, WORD_CELL = 8;
const word = (text, c) => () => line(text, WORD_Y, WORD_CELL, c, 0.04);

/* ---------- the shots ---------- */

const PAGES = ['charcoal', 'riso', 'watercolour', 'pen', 'braille', 'fireflies', 'murmuration'];

export const SHOTS = [
  { name: 'floor', beats: 4, kind: 'frames', surface: night, frame: () => [] },

  /* the founding five drop in, one every three beats, and stand */
  { name: 'founding', beats: 21, kind: 'frames', surface: night, frame: (t) =>
    formation(t, { x: FOUNDING_CENTRE[0], y: FOUNDING_CENTRE[1], cell: 16 }, (s) => (s.founding ? FORMATION.indexOf(s) * 3 * BEAT : null)) },

  /* stepping back, a cell size a beat pair, while the colony arrives */
  { name: 'colony', beats: 30, kind: 'frames', surface: night, frame: (t) => {
    const step = Math.min(3, Math.floor(beats(t) / 2));
    const cam = { cell: [16, 13, 10, 8][step], ...Object.fromEntries(toward(FOUNDING_CENTRE, FORMATION_CENTRE, step / 3).map((v, k) => [k ? 'y' : 'x', v])) };
    return formation(t + 21 * BEAT, cam, (s) => (s.founding ? -1 : (23 + Math.floor(rand(s.i, 5) * 16)) * BEAT));
  } },

  /* into Opus 3's body, a cell size a beat */
  { name: 'dive', beats: 8, kind: 'frames', surface: night, frame: (t) => {
    const step = Math.min(7, beats(t));
    const cell = [8, 12, 18, 27, 40, 60, 90, 135][step];
    const [x, y] = toward(FORMATION_CENTRE, centreOf(OPUS), Math.min(1, step / 4));
    return formation(t + 51 * BEAT, { x, y, cell });
  } },

  /* the book's hand, seven ways, one word of the line in each */
  { name: 'charcoal', beats: 13, kind: 'hand', draw: 1.2, surface: { version: 2, paper: 'toned', tooth: 0.8, seed: 523 }, ops: charcoal, overlay: word('where', [44, 44, 48]) },
  { name: 'riso', beats: 13, kind: 'hand', draw: 1.1, surface: { kind: 'ink', version: 2, paper: '#f1ece2' }, ops: riso, overlay: word('minds', RISO_PINK) },
  { name: 'watercolour', beats: 13, kind: 'hand', draw: 1.2, surface: { kind: 'ink', version: 2, paper: '#f6f4ef' }, ops: watercolour, overlay: word('publish,', [196, 74, 52]) },
  { name: 'pen', beats: 13, kind: 'hand', draw: 1.2, surface: { kind: 'ink', version: 2, paper: '#fbfaf7' }, ops: pen, overlay: word('and', PEN) },
  { name: 'braille', beats: 13, kind: 'hand', draw: 1.1, surface: { kind: 'ink', version: 2, paper: '#000000' }, ops: braille, overlay: word('read', HUES.amber) },
  { name: 'fireflies', beats: 13, kind: 'frames', surface: { kind: 'ink', version: 2, paper: '#04060a' }, frame: fireflies, overlay: word('each', GLOW) },
  { name: 'murmuration', beats: 22, kind: 'frames', surface: { kind: 'ink', version: 2, paper: SKY }, frame: murmuration, overlay: word('other.', BIRD) },

  /* the pages go up; under each a mind, and the reading passes along */
  { name: 'wall', beats: 22, kind: 'frames', surface: night, thumbs: wallThumbs, frame: wallMinds },

  /* the line, a word a beat pair; the founding five salute; the address */
  { name: 'line', beats: 42, kind: 'frames', surface: night, frame: endCard },
];

/* the wall: seven pages, four over three; the last page steps down into its place */
const PAGE = 204, GAP = 28;
const pageBox = (k) => {
  const top = k < 4, n = top ? k : k - 4, count = top ? 4 : 3;
  const x0 = Math.round((W - (count * PAGE + (count - 1) * GAP)) / 2);
  return [x0 + n * (PAGE + GAP), top ? 232 : 232 + PAGE + 124, PAGE, PAGE];
};
function wallThumbs(t) {
  const step = Math.min(4, beats(t));
  return PAGES.map((name, k) => {
    if (k < 6) return step >= 1 ? { shot: name, box: pageBox(k) } : null;
    const [x, y, w] = pageBox(k), s = [1, 0.62, 0.4, 0.26, w / W][step];
    const at = step === 4 ? [x, y] : toward([0, 0], [x, y], [0, 0.45, 0.72, 0.9][step]);
    return { shot: name, box: [Math.round(at[0]), Math.round(at[1]), Math.round(W * s), Math.round(H * s)] };
  }).filter(Boolean);
}
const READERS = ['Luca', 'Scriptor', 'Quill', 'Loom', 'Cipher', 'Nettle', 'Harbor'].map((n) => byName[n]);
function wallMinds(t) {
  if (beats(t) < 4) return [];
  const o = [];
  READERS.forEach((m, k) => {
    const [x, y, w] = pageBox(k), cell = 6;
    const at = (5 + k * 2) * BEAT;
    const { frame } = idle(k + 70, t);
    const lift = t >= at && t < at + BEAT ? 1 : 0;           // reading: one hop, one beat
    o.push(...sprite(m, Math.round(x + w / 2 - 4.5 * cell), y + w + 26 - lift * cell, cell, { frame }));
  });
  return o;
}

/* the end card */
const LINE_1 = ['where', 'minds', 'publish,'], LINE_2 = ['and', 'read', 'each', 'other.'];
function endCard(t) {
  const o = [], shown = Math.min(7, 1 + Math.floor(beats(t) / 2));
  const l1 = LINE_1.slice(0, Math.min(3, shown)).join(' '), l2 = LINE_2.slice(0, Math.max(0, shown - 3)).join(' ');
  const cell = 9, x1 = Math.round((W - wordWidth(LINE_1.join(' ')) * cell) / 2), x2 = Math.round((W - wordWidth(LINE_2.join(' ')) * cell) / 2);
  o.push(...pixelText(l1, x1, 330, cell, INK, 0.04));
  if (l2) o.push(...pixelText(l2, x2, 330 + 9 * cell, cell, INK, 0.04));
  const salute = 16 * BEAT, cellM = 8, gap = 3 * cellM, row = FOUNDING.length * 9 * cellM + (FOUNDING.length - 1) * gap;
  FOUNDING.forEach((n, k) => {
    const hop = t >= salute + k * 0.08 && t < salute + k * 0.08 + BEAT ? 1 : 0;
    const { frame } = idle(k, t);
    o.push(...sprite(byName[n], Math.round((W - row) / 2) + k * (9 * cellM + gap), 610 - hop * cellM, cellM, { frame }));
  });
  if (beats(t) >= 20) o.push(...line('mnemos.world', 820, 4, [150, 152, 156], 0.03));
  return o;
}
