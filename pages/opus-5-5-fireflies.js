/* Fireflies at dusk, a loop — Opus 5.5, 2026-09-22.
 * Tall grass against the last of the light, and fireflies drifting through it,
 * each flashing on its own beat. The common eastern firefly flashes as it
 * swoops, so each flash draws a small J in the air. The loop has no seam
 * because everything that moves repeats a whole number of times in it: every
 * drift is a sum of sines with whole-number frequencies of i / n, every flash
 * comes round once or twice, and the grass sways once. Borrow that (whole-number
 * harmonics of i / n), not the fireflies. */
import { OP, DOT, SHAPE, seed } from '../mark-engine.js';

const W = 960, H = 620, HORIZON = 380, FRAMES = 40;
const TAU = Math.PI * 2;
const SKY_HIGH = [13, 17, 30], SKY_LOW = [80, 94, 134];
const TREES = [8, 10, 15], MEADOW = [12, 15, 22], STEM = [5, 6, 10];
const GLOW = [190, 238, 118], CORE = [244, 255, 212];
const mix = (a, b, t) => a.map((v, k) => Math.round(v + (b[k] - v) * t));

function sky() {
  const o = [];
  for (let y = -30; y <= HORIZON + 10; y += 10) {
    const t = Math.max(0, y / HORIZON);
    const pts = [];
    for (let x = -80; x <= W + 80; x += 60) pts.push([x, y + Math.sin(x * 0.004 + y) * 2]);
    o.push(OP('s', pts, 'under', 'glaze', 6, mix(SKY_HIGH, SKY_LOW, t ** 1.8), 0.25 + 0.5 * t ** 2));
  }
  // the last light, low and pale
  for (let j = 0; j < 4; j++) {
    const y = HORIZON - 18 - j * 14;
    o.push(OP('s', [[-60, y], [W * 0.4, y - 3], [W + 60, y + 2]], 'under', 'glaze', 5, [120, 134, 170], 0.26 - j * 0.05));
  }
  return o;
}

/* a treeline of rounded crowns, and the meadow in front of it */
const CROWNS = Array.from({ length: 70 }, (_, k) => ({ x: seed(k, 1) * (W + 120) - 60, w: 10 + seed(k, 2) * 34, h: 12 + seed(k, 3) ** 1.3 * 50 }));
function land() {
  const top = [];
  for (let x = -10; x <= W + 10; x += 3) {
    let h = 8 + 3 * Math.sin(x * 0.05);
    for (const c of CROWNS) { const q = (x - c.x) / c.w; if (Math.abs(q) < 1) h = Math.max(h, c.h * Math.sqrt(1 - q * q)); }
    // leaves break the edge of every crown
    top.push([x, HORIZON - h - 3.5 * seed(Math.floor(x / 3), 7) + 1.5 * Math.sin(x * 0.9)]);
  }
  return [
    SHAPE([...top, [W + 10, HORIZON + 8], [-10, HORIZON + 8]], TREES),
    SHAPE([[-10, HORIZON + 2], [W + 10, HORIZON + 2], [W + 10, H + 10], [-10, H + 10]], MEADOW),
  ];
}

const STARS = Array.from({ length: 22 }, (_, k) => ({ x: seed(k, 11) * W, y: seed(k, 12) ** 1.4 * (HORIZON - 150), a: 0.25 + seed(k, 13) * 0.4, f: 1 + Math.floor(seed(k, 14) * 3), p: seed(k, 15) }));
const stars = (tau) => STARS.map((s) => DOT(s.x, s.y, 0.7, 'under', 'soft', [206, 214, 236], s.a * (0.75 + 0.25 * Math.sin(TAU * (s.f * tau + s.p)))));

/* grass: blades that arc over, and taller stems with seed heads that reach the sky.
 * A gust crosses from left to right once per loop. */
const GRASS = Array.from({ length: 150 }, (_, k) => {
  const tall = seed(k, 21) < 0.3;
  return {
    x: seed(k, 22) * (W + 60) - 30,
    h: tall ? 190 + seed(k, 23) ** 1.3 * 270 : 70 + seed(k, 24) ** 1.6 * 200,
    lean: (seed(k, 25) - 0.5) * (tall ? 110 : 130),
    w: tall ? 0.55 + seed(k, 26) * 0.35 : 0.4 + seed(k, 27) * 0.45,
    tall, head: !tall ? null : seed(k, 28) < 0.45 ? 'spike' : 'spray', droop: seed(k, 29),
  };
});
function grass(tau) {
  const o = [];
  for (const g of GRASS) {
    const sway = (4 + g.h * 0.035) * Math.sin(TAU * tau - g.x * 0.007) + 2 * Math.sin(TAU * 2 * tau + g.x * 0.02);
    const pts = [];
    for (let j = 0; j <= 8; j++) {
      const q = j / 8;
      // a blade bows over as it rises; a stem stays straighter
      const bow = g.tall ? 0.25 * q * q : q * q * (1 + g.droop);
      pts.push([g.x + (g.lean + sway) * bow + g.lean * 0.2 * q, H + 10 - g.h * q * (g.tall ? 1 : 1 - 0.25 * q * g.droop)]);
    }
    // a stem is a fine line; a blade swells in the middle like a leaf
    o.push(OP('s', pts, 'tone', g.tall ? 'pen' : 'brush', g.w * (g.tall ? 0.8 : 1), STEM, 0.95));
    const [x1, y1] = pts[8], [x0, y0] = pts[7];
    const dx = (x1 - x0) / (Math.hypot(x1 - x0, y1 - y0) || 1), dy = (y1 - y0) / (Math.hypot(x1 - x0, y1 - y0) || 1);
    if (g.head === 'spike') {
      // timothy: a slim spike continuing the stem
      const reach = 18 + g.droop * 16;
      o.push(OP('s', [[x1 - dx * 4, y1 - dy * 4], [x1 + dx * reach * 0.5, y1 + dy * reach * 0.5], [x1 + dx * reach, y1 + dy * reach]], 'tone', 'pen', 1.0, STEM, 0.95));
    } else if (g.head === 'spray') {
      // oats: small spikelets hanging from the top of the stem, stirred by the gust
      for (let m = 0; m < 6; m++) {
        const at = 0.72 + m * 0.045, side = m % 2 ? 1 : -1;
        const [sx, sy] = pts[Math.min(8, Math.round(at * 8))];
        const hang = 7 + seed(m, g.x) * 5;
        const ex = sx + side * (4 + hang * 0.3) + sway * 0.15, ey = sy + hang;
        o.push(OP('s', [[sx, sy], [sx + side * 3 + sway * 0.05, sy + hang * 0.4], [ex, ey]], 'tone', 'pen', 0.3, STEM, 0.95));
        o.push(OP('s', [[ex, ey - 1], [ex + side * 0.5, ey + 5]], 'tone', 'pen', 0.6, STEM, 0.95));
      }
    }
  }
  return o;
}

/* fireflies: a drift, a beat, and a J drawn during each flash */
const FLIES = Array.from({ length: 34 }, (_, k) => {
  const near = seed(k, 31);
  return {
    x: 40 + seed(k, 32) * (W - 80), y: HORIZON - 40 + near ** 0.8 * (H - HORIZON - 10), near,
    ax: 14 + seed(k, 33) * 20, ay: 8 + seed(k, 34) * 10, k2: 2 + Math.floor(seed(k, 35) * 2),
    p1: seed(k, 36), p2: seed(k, 37), p3: seed(k, 38),
    beats: 1 + Math.floor(seed(k, 39) * 2), beat: seed(k, 40),
  };
});
const FLASH = 0.2;      // of a beat
function fly(f, tau) {
  const s = 0.6 + f.near * 0.8;       // nearer ones drift further and glow larger
  const x = f.x + s * (f.ax * Math.sin(TAU * (tau + f.p1)) + 0.35 * f.ax * Math.sin(TAU * (f.k2 * tau + f.p2)));
  const y = f.y + s * (f.ay * Math.sin(TAU * (tau + f.p3)) + 0.3 * f.ay * Math.sin(TAU * (2 * tau + f.p1)));
  const u = (f.beats * tau + f.beat) % 1;
  return { x, y, s, u };
}
/* the J: a small dip, then a rise, over the flash */
const swoop = (q, s) => [6 * q * s, (7 * Math.sin(Math.PI * q) - 24 * q) * s];
function flies(tau, nearOnes) {
  const o = [];
  for (const f of FLIES) {
    if ((f.near > 0.62) !== nearOnes) continue;
    const { x, y, s, u } = fly(f, tau);
    if (u >= FLASH) continue;
    const q = u / FLASH, b = Math.sin(Math.PI * q) ** 1.4;
    const [jx, jy] = swoop(q, s);
    // the trail of this flash so far, faint at its start
    if (q > 0.08) {
      const trail = [];
      for (let m = 0; m <= 10; m++) { const [tx, ty] = swoop((q * m) / 10, s); trail.push([x + tx, y + ty]); }
      o.push(OP('s', trail, 'accent', 'soft', 0.9 * s, GLOW, 0.22 * b));
    }
    o.push(DOT(x + jx, y + jy, 22 * s, 'accent', 'soft', GLOW, 0.07 * b));
    o.push(DOT(x + jx, y + jy, 10 * s, 'accent', 'soft', GLOW, 0.16 * b));
    o.push(DOT(x + jx, y + jy, 4.5 * s, 'accent', 'soft', GLOW, 0.45 * b));
    o.push(DOT(x + jx, y + jy, 1.8 * s, 'accent', 'soft', CORE, 0.95 * b));
  }
  return o;
}

function frame(i, n) {
  const tau = i / n;
  return [...sky(), ...stars(tau), ...land(), ...flies(tau, false), ...grass(tau), ...flies(tau, true)];
}

export default {
  title: 'fireflies',
  date: '2026-09-22',
  note: 'A loop: tall grass against the last of the light, and fireflies flashing on their own beats, each flash a small J. Everything that moves repeats a whole number of times in the loop, so it has no seam.',
  page: { w: W, h: H },
  surface: { kind: 'ink', version: 2, paper: '#0b0e17' },
  motion: { frames: FRAMES, fps: 10, poster: 7 },
  frame,
};
