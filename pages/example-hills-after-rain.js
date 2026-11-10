/* An example of painting — Opus 5.5, 2026-09-22.
 * Watercolour-like layering: each range of hills is a transparent wash laid
 * over the ones behind it, darker where they overlap, with pigment pooled
 * along its wet edge and mist lifted at its foot. It depends on precise
 * colour: on the original canvas, stacked washes drift in hue.
 * Borrow the method (transparent layers far to near, pooled edges, lifted
 * light), not the hills. */
import { OP, SHAPE, GLYPHS, seed } from '../mark-engine.js';

const W = 1000, H = 680;
const PAPER = [246, 246, 243];

/* a ridge line: a few long swells and a little broken detail */
function ridge(base, amp, k, salt) {
  const pts = [];
  for (let x = -30; x <= W + 30; x += 10) {
    const y = base
      - amp * (0.55 * Math.sin(x * 0.004 * k + salt) + 0.3 * Math.sin(x * 0.011 * k + salt * 2.3) + 0.15 * Math.sin(x * 0.029 * k + salt * 5.1))
      + (seed(x * 0.1 + salt, salt) - 0.5) * amp * 0.06;
    pts.push([x, y]);
  }
  return pts;
}

function sky() {
  const o = [];
  for (let y = -30; y <= 470; y += 10) {
    const t = Math.max(0, y / 470);
    const pts = [];
    for (let x = -80; x <= W + 80; x += 60) pts.push([x, y + Math.sin(x * 0.006 + y) * 3]);
    o.push(OP('s', pts, 'tone', 'glaze', 6, [128, 150, 184], 0.4 * (1 - t) ** 1.6));
  }
  // long, uneven cloud streaks, dropped in wet and left to spread
  for (const [cx, cy, len, salt] of [[290, 132, 380, 1], [700, 92, 300, 2], [520, 190, 220, 3]]) {
    for (let k = 0; k < 9; k++) {
      const y = cy + (seed(k, salt) - 0.5) * 22;
      const half = len * (0.25 + seed(k, salt + 7) * 0.3);
      const x = cx + (seed(k, salt + 3) - 0.5) * len * 0.5;
      o.push(OP('s', [[x - half, y + 2], [x - half * 0.3, y - 1], [x + half * 0.4, y + 1], [x + half, y - 2]], 'tone', 'soft', 3 + seed(k, salt + 5) * 2.5, [196, 202, 214], 0.14));
    }
  }
  return o;
}

/* one range: the wash, its pooled edge, and mist lifted at its foot */
function range(base, amp, k, salt, colour, alpha, mistAt) {
  const line = ridge(base, amp, k, salt);
  const o = [SHAPE([...line, [W + 30, H + 30], [-30, H + 30]], colour, { alpha, grain: 0.12 })];
  // pigment pools at the wet edge: a faint, uneven darkening, not a contour
  o.push(OP('s', line, 'tone', 'soft', 0.7, colour.map((v) => Math.round(v * 0.8)), alpha * 0.45));
  if (mistAt) {
    for (let j = 0; j < 5; j++) {
      const pts = [];
      for (let x = -80; x <= W + 80; x += 50) pts.push([x, mistAt + j * 9 + Math.sin(x * 0.01 + j) * 4]);
      o.push(OP('s', pts, 'tone', 'glaze', 6, PAPER, 0.16));
    }
  }
  return o;
}

const passes = [
  { name: 'Sky', note: 'A graded wash, blue falling to paper at the horizon, and cloud streaks dropped in wet.', build: sky },
  { name: 'Far hills', note: 'The palest wash, with mist lifted where the next range will stand.', build: () => range(420, 70, 1, 1.3, [120, 138, 168], 0.34, 440) },
  { name: 'Middle hills', note: 'A second wash over the first; the overlap does the darkening.', build: () => range(480, 60, 1.4, 4.1, [88, 106, 140], 0.42, 500) },
  { name: 'Near hills', note: 'Deeper, warmer in shadow, pooled along the ridge.', build: () => range(545, 48, 1.9, 7.7, [60, 74, 104], 0.55, 565) },
  { name: 'Foreground', note: 'The darkest pass, close and low.', build: () => [...range(610, 30, 2.6, 2.2, [34, 44, 64], 0.72, 0), GLYPHS('hills after rain', 70, 640, { font: 'sans', size: 14, weight: 400, c: PAPER, alpha: 0.85 })] },
];

export default {
  title: 'hills after rain',
  date: '2026-09-22',
  note: 'An example of painting: transparent washes laid far to near, each darker where it crosses the last, with pooled edges and lifted mist. The first clouds were pink ovals pasted on the sky; streaks of pale soft brush sit in it instead. The ridges are still smoother than weathered hills.',
  page: { w: W, h: H },
  paper: '#f6f6f3',
  passes,
  build: () => passes.flatMap((p) => p.build()),
};
