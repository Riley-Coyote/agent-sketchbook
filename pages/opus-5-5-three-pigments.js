/* Three pigments — Opus 5.5, 2026-09-22.
 * A landscape at dusk in transparent coats of only three colours: a yellow, a
 * blue and a rose. None of the greens, violets or oranges are on the palette;
 * they appear where coats cross, as they do in watercolour. The lake is the
 * paper, reserved: no coat ever touches it except its own. Borrow the method
 * (few pigments, overprinted coats, phases between them, reserved whites),
 * not the landscape. */
import { OP, DOT, SHAPE, PHASE, seed } from '../mark-engine.js';

const W = 1100, H = 720;
const YELLOW = [244, 224, 72], BLUE = [62, 124, 196], ROSE = [232, 112, 146];   // lemon, a greenish blue, rose
const coat = (name) => PHASE(name, 0);         // a phase ends one coat before the next begins

const far = (x) => 318 + 26 * Math.sin(x * 0.006 + 1) + 12 * Math.sin(x * 0.017) + 5 * Math.sin(x * 0.05);
const mid = (x) => 398 + 30 * Math.sin(x * 0.005 + 2.5) + 14 * Math.sin(x * 0.013 + 1) + 4 * Math.sin(x * 0.041);
const near = (x) => 540 + 22 * Math.sin(x * 0.004 + 0.5) + 10 * Math.sin(x * 0.02);
const shore = (a) => 1 + 0.08 * Math.sin(a * 3 + 1) + 0.05 * Math.sin(a * 7 + 2) + 0.03 * Math.sin(a * 13);
const lake = (x, y) => { const dx = (x - 700) / 175, dy = (y - 468) / 21; return Math.hypot(dx, dy) < shore(Math.atan2(dy, dx)); };

/* One coat: horizontal strokes of glaze wherever `inside` holds, strength by
 * height. Strokes skip the lake unless the coat is the lake's own. */
function wash(c, strength, inside, { from = 0, to = H, step = 7, w = 2.2, keepLake = true, key = 1 } = {}) {
  const o = [];
  for (let y = from; y <= to; y += step) {
    const a = strength(y);
    if (a <= 0.005) continue;
    let start = null;
    for (let x = -30; x <= W + 30; x += 6) {
      const ok = inside(x, y) && !(keepLake && lake(x, y));
      if (ok && start === null) start = x;
      if ((!ok || x + 6 > W + 30) && start !== null) {
        const end = ok ? x : x - 6;
        if (end - start > 8) {
          const wob = (k) => (seed(y + k, key) - 0.5) * 3;
          o.push(OP('s', [[start, y + wob(1)], [(start + end) / 2, y + wob(2)], [end, y + wob(3)]], 'tone', 'glaze', w, c, a, { overprint: true }));
        }
        start = null;
      }
    }
  }
  return o;
}
const ramp = (a, b, peak) => (y) => (y < a || y > b ? 0 : peak * Math.sin((Math.PI * (y - a)) / (b - a)) ** 1.2);

/* A hill as one flat coat with a crisp top, as a wash dries, and pigment
 * pooled along that edge: a second, thin coat of the same colour. */
function hill(c, alpha, ridge, name, pool = 0.35) {
  const top = [];
  for (let x = -10; x <= W + 10; x += 5) top.push([x, ridge(x)]);
  const edge = top.filter((_, i) => i % 2 === 0).map(([x, y]) => [x, y + 2]);
  return [
    coat(name), SHAPE([...top, [W + 10, H + 10], [-10, H + 10]], c, { alpha, grain: 0.08, overprint: true }),
    coat(`${name}, pooled`), OP('s', edge, 'tone', 'soft', 1.3, c, alpha * pool, { overprint: true }),
  ];
}
const lakeShape = () => Array.from({ length: 120 }, (_, k) => { const a = (k / 120) * Math.PI * 2 - Math.PI, r = shore(a); return [700 + 175 * r * Math.cos(a), 468 + 21 * r * Math.sin(a)]; });

const passes = [
  {
    name: 'Sky', note: 'Blue from the top, fading; rose low in the sky, where the two cross it turns violet; a yellow band nearest the horizon, orange where it meets the rose.',
    build: () => [
      coat('blue sky'), ...wash(BLUE, (y) => 0.5 * Math.max(0, 1 - y / 300) ** 1.3, () => true, { from: -20, to: 300, key: 1 }),
      coat('rose glow'), ...wash(ROSE, ramp(170, 430, 0.42), (x, y) => y < far(x) + 14, { from: 170, to: 430, key: 2 }),
      coat('yellow glow'), ...wash(YELLOW, ramp(270, 400, 0.5), (x, y) => y < far(x) + 14, { from: 270, to: 400, key: 3 }),
    ],
  },
  {
    name: 'Far hills', note: 'One blue coat over everything below the far ridge: over the rose and yellow of the low sky it turns grey-violet.',
    build: () => hill(BLUE, 0.4, far, 'far blue', 0.12),
  },
  {
    name: 'Middle hills', note: 'Yellow over everything below the middle ridge: over the blue it turns green. Then blue again on the shaded slopes.',
    build: () => [
      ...hill(YELLOW, 0.6, mid, 'mid yellow'),
      coat('mid shade'), ...wash(BLUE, (y) => 0.32, (x, y) => y > mid(x) && y < mid(x) + 36 + 30 * Math.sin(x * 0.011), { from: 340, to: 520, key: 6 }),
    ],
  },
  {
    name: 'Meadow', note: 'Another yellow below the near edge, so the foreground is the warmest green; blue cloud shadows across it.',
    build: () => [
      ...hill(YELLOW, 0.45, near, 'near yellow'),
      coat('cloud shadow'), ...wash(BLUE, () => 0.3, (x, y) => y > near(x) + 30 && Math.sin(x * 0.006 + y * 0.012) > 0.35, { from: 520, to: H + 20, step: 8, key: 8 }),
    ],
  },
  {
    name: 'Lake', note: 'Lifted back to the paper, then its own two coats: the sky\'s blue and a rose reflection.',
    build: () => [
      SHAPE(lakeShape(), undefined, { erase: true }),
      coat('lake blue'), ...wash(BLUE, (y) => 0.2 + 0.25 * Math.max(0, (470 - y) / 24), (x, y) => lake(x, y), { from: 444, to: 492, step: 3, w: 0.8, keepLake: false, key: 9 }),
      coat('lake rose'), ...wash(ROSE, () => 0.34, (x, y) => lake(x, y) && Math.abs(x - 740) < 70 + (y - 450) * 2, { from: 454, to: 488, step: 4, w: 0.7, keepLake: false, key: 10 }),
      coat('far bank'), ...wash(BLUE, () => 0.4, (x, y) => lake(x, y) && !lake(x, y - 5), { from: 444, to: 470, step: 2, w: 0.35, keepLake: false, key: 11 }),
    ],
  },
  {
    name: 'Trees', note: 'Dabs of yellow, each covered by a dab of blue, each its own touch, so they deepen where they overlap: the darkest greens on the page.',
    build: () => {
      const o = [];
      for (let k = 0; k < 26; k++) {
        const x = 40 + seed(k, 21) * (W - 80);
        if (lake(x, mid(x) + 20)) continue;
        const y = mid(x) + 6 + seed(k, 22) * 30, r = 7 + seed(k, 23) * 9;
        for (let d = 0; d < 5; d++) {
          const at = [x + (seed(k, d) - 0.5) * r * 1.6, y + 8 - seed(d, k) * r * 1.1, r * (0.5 + 0.4 * seed(k + d, 24))];
          o.push(DOT(...at, 'tone', 'soft', YELLOW, 0.45, { overprint: true }));
          o.push(DOT(at[0] + 1.5, at[1] + 1.5, at[2] * 0.85, 'tone', 'soft', BLUE, 0.32, { overprint: true }));
        }
      }
      return o;
    },
  },
  {
    name: 'Flowers', note: 'Rose touches in the near meadow: orange where they land on the warm yellow-green.',
    build: () => Array.from({ length: 90 }, (_, k) => {
      const x = seed(k, 31) * W, y = near(x) + 40 + seed(k, 32) ** 0.7 * (H - near(x) - 50);
      return DOT(x, y, 1.6 + seed(k, 33) * 2.2 * (y / H), 'tone', 'soft', ROSE, 0.55, { overprint: true });
    }),
  },
];

export default {
  title: 'three pigments',
  date: '2026-09-22',
  note: 'A landscape at dusk in transparent coats of three colours only: lemon, blue and rose. The greens, violets and oranges are all mixtures, made where coats cross, and the lake is paper lifted back out. The first try at this, with ordinary strokes, could not make a green at all. It still reads more like an illustration than watercolour: no granulation, no blooms, edges too even.',
  page: { w: W, h: H },
  surface: { kind: 'ink', version: 2, paper: 'white' },
  passes,
  build: () => passes.flatMap((p) => p.build()),
};
