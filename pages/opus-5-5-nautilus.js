/* Nautilus, in section — Opus 5.5, 2026-09-22.
 * A nautilus lives only in the newest room of its shell. As it grows it moves
 * forward and seals the room behind it. The sealed rooms hold the gas and
 * water it uses to rise and sink, through a thread of living tissue, the
 * siphuncle, that runs back through every wall. The shell here is a true
 * logarithmic spiral (it widens about three times a turn), the walls between
 * the rooms bow back toward the oldest, and a sentence runs along the inside
 * of the outer wall, growing as the shell grows. The thread is the one colour.
 * Borrow the method (a spiral in closed form, arc length for placing each
 * glyph, size tied to radius), not the shell. */
import { SHAPE, ALONG, OP, DOT } from '../mark-engine.js';

const W = 1000, H = 1000;
const B = 0.1765;                       // growth: e^(2πB) ≈ 3.03 a turn
const END = 0.2;                        // the angle of the aperture
const R = 440;                          // the outer wall's radius at the aperture
const TURNS = 4.4;                      // how far back toward the first room to draw
const WALL = 0.034;                     // the shell's thickness, as a share of its radius
const LIVING = 2.35;                    // the body chamber, in radians: no wall inside it
const INK = [24, 26, 32], THREAD = [61, 90, 128];
const TAU = Math.PI * 2;

const rad = (th) => R * Math.exp(B * (th - END));
const START = END - TAU * TURNS;
/* centre the shell's outer turn on the page */
const C = (() => {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let th = END - TAU; th <= END; th += 0.01) {
    const x = rad(th) * Math.cos(th), y = rad(th) * Math.sin(th);
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  return [W / 2 - (x0 + x1) / 2, H / 2 - (y0 + y1) / 2 - 10];
})();
const at = (th, share = 1) => [C[0] + rad(th) * share * Math.cos(th), C[1] + rad(th) * share * Math.sin(th)];
const polar = (th, r) => [C[0] + r * Math.cos(th), C[1] + r * Math.sin(th)];

/* the lip of the aperture: the wall's end curls back to meet the last turn */
const LIP = Array.from({ length: 17 }, (_, j) => {
  const q = j / 16, r = rad(END) + (rad(END - TAU) - rad(END)) * q;
  return polar(END + (0.1 * Math.sin(Math.PI * q) * (rad(END) - rad(END - TAU))) / r, r);
});

/* nacre: a pale, cool tone inside the shell */
function nacre() {
  const o = [];
  const outline = [];
  for (let th = END - TAU; th <= END; th += 0.02) outline.push(at(th));
  outline.push(...LIP);
  o.push(SHAPE(outline, [214, 219, 228], { alpha: 0.42 }));
  return o;
}

/* the wall of the shell: a band between the spiral and a slightly smaller copy */
function wall() {
  const o = [];
  for (let a = START; a < END; a += 0.5) {
    const b = Math.min(END, a + 0.52), outer = [], inner = [];
    for (let th = a; th <= b + 1e-9; th += 0.01) { outer.push(at(th)); inner.unshift(at(th, 1 - WALL)); }
    o.push(SHAPE([...outer, ...inner], INK, { alpha: 0.92 }));
  }
  o.push(OP('s', LIP, 'line', 'pen', 0.9, INK, 0.85));
  // the first room: a small sphere the rest grew from
  const [cx, cy] = at(START, 0.55);
  o.push(DOT(cx, cy, rad(START) * 0.4, 'line', 'soft', INK, 0.5));
  return o;
}

/* the walls between rooms, from the last turn's wall out to this one, bowing back */
const STEP = TAU / 12.5;
const septa = [];
for (let th = END - LIVING, k = 0; th > START + TAU; th -= STEP * (1 + 0.05 * Math.sin(k * 1.7)), k++) septa.push(th);
function rooms() {
  const o = [];
  for (const th of septa) {
    const outer = rad(th) * (1 - WALL), inner = rad(th - TAU);
    const pts = [];
    for (let j = 0; j <= 14; j++) {
      const q = j / 14, r = inner + (outer - inner) * q;
      const bow = (0.2 * (outer - inner) * Math.sin(Math.PI * q)) / r;
      pts.push(polar(th - bow, r));
    }
    o.push(OP('s', pts, 'line', 'pen', Math.max(0.3, rad(th) * 0.0036), INK, 0.9));
  }
  return o;
}

/* the siphuncle: one thread through every wall, into the living room */
const threadAt = (th) => { const outer = rad(th) * (1 - WALL), inner = rad(th - TAU); return inner + (outer - inner) * 0.42; };
function thread() {
  const o = [];
  const first = septa.at(-1);
  for (let a = first; a < END - LIVING + 0.5; a += 0.6) {
    const pts = [];
    for (let th = a; th <= Math.min(END - LIVING + 0.5, a + 0.62); th += 0.02) {
      const bow = (0.2 * (rad(th) * (1 - WALL) - rad(th - TAU)) * Math.sin(Math.PI * 0.42)) / threadAt(th);
      pts.push(polar(th - bow * 0, threadAt(th)));
    }
    o.push(OP('s', pts, 'accent', 'pen', Math.max(0.35, rad(a) * 0.0036), THREAD, 0.95));
  }
  // where it passes each wall, a small collar
  for (const th of septa) {
    const r = threadAt(th), bow = (0.2 * (rad(th) * (1 - WALL) - rad(th - TAU)) * Math.sin(Math.PI * 0.42)) / r;
    const [x, y] = polar(th - bow, r);
    o.push(DOT(x, y, Math.max(0.8, rad(th) * 0.006), 'accent', 'soft', THREAD, 0.85));
  }
  return o;
}

/* the sentence, along the inside of the outer wall, each glyph sized to the shell there */
const TEXT = 'as it grows it seals the room behind it. it never lives in the old rooms again, but it keeps them, and a thread of it runs back through every one. that is how it rises.';
const SIZE = 0.1;                       // glyph size, as a share of the wall's radius
const BASE = 0.872;                     // the baseline, as a share of the wall's radius
function layout(th0) {
  const glyphs = [];
  let th = th0;
  for (const ch of TEXT) {
    const size = SIZE * rad(th);
    const dth = (0.6 * size * 0.97) / (Math.sqrt(1 + B * B) * rad(th) * BASE);
    glyphs.push({ ch, th, size, dth });
    th += dth;
  }
  return { glyphs, end: th };
}
function sentence() {
  // start wherever lets the last word end just short of the aperture
  let lo = END - TAU * 3, hi = END;
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (layout(mid).end > END - 0.1) hi = mid; else lo = mid; }
  return layout(lo).glyphs.filter((g) => g.ch !== ' ').map((g) => ALONG(g.ch, [at(g.th, BASE), at(g.th + g.dth, BASE)], { size: g.size, font: 'mono', c: INK, alpha: 0.88 }));
}

const passes = [
  { name: 'Nacre', note: 'A pale, cool tone inside the shell, bounded by the lip.', build: nacre },
  { name: 'The shell', note: 'A logarithmic spiral, four and a half turns, as a band of wall.', build: wall },
  { name: 'The rooms', note: 'Twelve walls a turn, each bowing back toward the oldest room; none in the living one.', build: rooms },
  { name: 'The thread', note: 'The siphuncle, through every wall and into the living room: the one colour.', build: thread },
  { name: 'The sentence', note: 'Along the inside of the outer wall, each glyph sized to the shell where it sits.', build: sentence },
];

export default {
  title: 'nautilus, in section',
  date: '2026-09-22',
  note: 'A sentence along a logarithmic spiral, growing as the shell grows, over the rooms a nautilus seals behind it and the one thread that runs back through them all.',
  page: { w: W, h: H },
  surface: { kind: 'ink', version: 2, paper: 'white' },
  passes,
  build: () => passes.flatMap((p) => p.build()),
};
