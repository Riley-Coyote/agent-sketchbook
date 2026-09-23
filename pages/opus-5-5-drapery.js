/* Drapery, charcoal and white chalk on grey paper — Opus 5.5, 2026-09-22.
 * A cloth hung from one nail, lit from the upper left. The paper is the
 * middle value: vine charcoal lays the shadows down the folds, the stump fuses
 * them, compressed charcoal cuts the deepest creases, a kneaded eraser lifts
 * the light that bounces back into the shadows, and white chalk picks out the
 * ridges that face the window. Every stroke runs down a fold, the way a hand
 * follows the form. */
import { seed } from '../mark-engine.js';

const W = 900, H = 1150;
const NAIL = [450, 140];
const HEM = 860;                             // nail to hem, straight down
const WIDE = 330;                            // half the cloth's width at the hem
const norm = (v) => { const n = Math.hypot(...v); return v.map((c) => c / n); };
const LIGHT = norm([-0.82, -0.42, 0.42]);    // the window: low on the left, raking across the folds
const BOUNCE = norm([0.75, 0.1, 0.3]);       // light thrown back from a wall on the right
const clamp = (v) => Math.max(0, Math.min(1, v));
const smooth = (v) => { v = clamp(v); return v * v * (3 - 2 * v); };

/* The cloth in its own coordinates: v, the drop below the nail, and u, where
 * across the cloth a point sits (-1 left edge, 1 right edge). Gathered at the
 * nail, it opens quickly and then hangs nearly straight: a bell. */
const half = (v) => WIDE * (1 - Math.exp(-v / 165)) / (1 - Math.exp(-HEM / 165));
const toPage = (u, v) => [NAIL[0] + u * half(v), NAIL[1] + v];

/* the folds: eight tubes of cloth, uneven in depth, drifting a little as they fall */
/* [where across, depth, width, where it begins]: two of them only open partway down */
const RIDGES = [[-0.86, 0.7, 0.12, 0], [-0.6, 1.0, 0.13, 0], [-0.35, 0.8, 0.11, 260], [-0.1, 1.15, 0.14, 0], [0.16, 0.85, 0.12, 0], [0.4, 1.05, 0.13, 0], [0.63, 0.75, 0.11, 380], [0.85, 0.6, 0.12, 0]];
function profile(u, v) {
  let z = 0;
  RIDGES.forEach(([at, d, w, from], i) => {
    const c = at + 0.035 * Math.sin(v * 0.0055 + i * 1.9);
    z += d * smooth((v - from) / 240 + (from ? 0 : 1)) * Math.exp(-(((u - c) / w) ** 2));
  });
  return z;
}
const amp = (v) => 5 + 44 * (1 - Math.exp(-v / 260));
/* the hem swings forward with each tube: seen a little from above, a ridge hangs lower */
const hemAt = (u) => HEM - 36 * u * u + 26 * u + 0.4 * amp(HEM) * (profile(u, HEM) - 0.55);
const inside = (u, v) => v > 2 && Math.abs(u) <= 1 && v <= hemAt(u);

function depth(x, y) {
  const v = y - NAIL[1], u = (x - NAIL[0]) / Math.max(1, half(v));
  return amp(v) * profile(u, v) - 900 * Math.max(0, Math.abs(u) - 0.92) ** 2;
}
/* 0 in the deepest crease, about 1 where a ridge faces the window */
function lightAt(x, y) {
  const e = 1.2;
  const zx = (depth(x + e, y) - depth(x - e, y)) / (2 * e);
  const zy = (depth(x, y + e) - depth(x, y - e)) / (2 * e);
  const n = norm([-zx, -zy, 1]);
  const dot = (a) => n[0] * a[0] + n[1] * a[1] + n[2] * a[2];
  const key = clamp((dot(LIGHT) + 0.05) / 1.05);          // a little wrap, as cloth scatters
  const v = y - NAIL[1], u = (x - NAIL[0]) / Math.max(1, half(v));
  const hollow = 0.68 + 0.32 * smooth(profile(u, v) / 0.9);
  return 0.05 + 0.95 * key * hollow + 0.12 * Math.max(0, dot(BOUNCE));
}
function bounceAt(x, y) {
  const e = 1.2;
  const n = norm([-(depth(x + e, y) - depth(x - e, y)) / (2 * e), -(depth(x, y + e) - depth(x, y - e)) / (2 * e), 1]);
  return Math.max(0, n[0] * BOUNCE[0] + n[1] * BOUNCE[1] + n[2] * BOUNCE[2]);
}
/* a third of the cloth in shadow, a third left as paper, a third in chalk */
const shade = (x, y) => clamp((0.44 - lightAt(x, y)) / 0.3);
const bright = (x, y) => clamp((lightAt(x, y) - 0.6) / 0.22);

const gesture = (tool, samples, size, strength) => ({ k: 'm', tool, ...(size ? { size } : {}), ...(strength ? { strength } : {}), samples });
const sample = ([x, y], p, t, tilt = [0, 0]) => ({ x, y, p: clamp(p), tiltX: tilt[0], tiltY: tilt[1], t });

/* Strokes down the folds, at constant u. Near the nail the lines crowd, so
 * only every 2nd, 4th, 8th one is drawn until they open out. `amount(x, y)`
 * says how hard to press; a stroke lifts where it reaches zero, and at a
 * length a hand would lift anyway. */
function alongFolds({ tool, lines, gap, amount, size, tilt = [0, 0], key, strength, reach = 220, start = 2, zigzag = 0, wipe = false }) {
  const out = [];
  for (let k = 0; k < lines; k++) {
    const u0 = -1 + (2 * (k + 0.2 + 0.6 * seed(k, key))) / lines;
    let run = [], t = 0, limit = reach * (0.5 + 0.5 * seed(k, key + 1));
    const flush = (crisp = false) => {
      if (run.length > 3) {
        const n = run.length;
        run.forEach((q, i) => { q.p *= smooth(Math.min(i, crisp ? Infinity : n - 1 - i) / 5 + 0.1); });
        out.push(gesture(tool, run, size, strength));
        if (wipe) out.push({ k: 'clean', tool: 'stump' });   // wiped between strokes, so it carries no blot into the next
      }
      run = []; t = 0; limit = reach * (0.5 + 0.5 * seed(k + out.length * 0.37, key + 2));
    };
    for (let v = start + seed(k, key + 3) * 8; ; v += 3) {
      const u = u0 + 0.008 * Math.sin(v * 0.027 + k * 2.3) + zigzag * Math.sin(v * 0.45 + k);
      if (v > hemAt(u) || Math.abs(u) > 1) { flush(true); break; }
      const spacing = (2 * half(v)) / lines;
      const step = 2 ** Math.max(0, Math.ceil(Math.log2(gap / Math.max(0.05, spacing))));
      const [x, y] = toPage(u, v);
      const p = k % step === 0 ? amount(x, y) : 0;
      if (p <= 0.015 || run.length * 3 > limit) { flush(); if (p <= 0.015) continue; }
      run.push(sample([x, y], p, t, tilt));
      t += 12;
    }
  }
  return out;
}

function layIn() {
  // light construction: both edges, the hem and a few fold axes, barely pressed
  const o = [];
  const draw = (pts, p, size) => o.push(gesture('vine-charcoal', pts.map((q, i) => sample(q, p, i * 14)), size));
  for (const side of [-1, 1]) {
    const pts = [];
    for (let v = 8; v <= hemAt(side); v += 6) pts.push(toPage(side, v));
    draw(pts, side < 0 ? 0.1 : 0.16, 3);                      // the lit edge drawn lightly
  }
  const hem = [];
  for (let u = -1; u <= 1.0001; u += 0.008) hem.push(toPage(u, hemAt(u)));
  draw(hem, 0.1, 3);
  for (const [at] of RIDGES.filter((_, i) => i % 2)) {
    const pts = [];
    for (let v = 20; v <= HEM * 0.85; v += 6) pts.push(toPage(at + 0.035 * Math.sin(v * 0.0055), v));
    draw(pts, 0.05, 2.5);
  }
  return o;
}

function hemLine() {
  // the lower edge, found in shadow and lost in light
  const o = [];
  for (let a = -1; a < 1; a += 0.25) {
    const pts = [];
    for (let u = a; u <= Math.min(1, a + 0.27); u += 0.006) pts.push(toPage(u, hemAt(u)));
    o.push(gesture('compressed-charcoal', pts.map((q, i) => sample(q, 0.22 + 0.55 * shade(q[0], q[1] - 6), i * 12)), 2.4));
  }
  // where the hem curls back between two tubes, the underside shows as a dark sliver
  for (let u = -0.98; u < 0.98; u += 0.004) {
    const dip = profile(u, HEM);
    if (dip > 0.35) continue;
    const pts = [];
    for (let du = -0.03; du <= 0.03; du += 0.006) { const [x, y] = toPage(u + du, hemAt(u + du)); pts.push([x, y - 5 * (1 - Math.abs(du) / 0.03)]); }
    o.push(gesture('vine-charcoal', pts.map((q, i) => sample(q, 0.35 * (0.35 - dip) / 0.35 + 0.1, i * 12)), 3));
    u += 0.05;
  }
  return o;
}

const inCloth = (x, y) => { const v = y - NAIL[1]; if (v <= 0) return false; const u = (x - NAIL[0]) / Math.max(1, half(v)); return Math.abs(u) <= 1 && v <= hemAt(u); };
const offset = (y) => { const q = clamp((y - NAIL[1]) / HEM); return [52 * q ** 0.7, 16 * q]; };
function wall() {
  const o = [];
  // diagonal hatching wherever the shifted cloth covers the wall and the cloth itself doesn't
  for (let c = -400; c < 1300; c += 5) {
    let run = [], t = 0;
    const flush = () => { if (run.length > 3) o.push(gesture('vine-charcoal', run, 7, 0.9)); run = []; t = 0; };
    for (let y = NAIL[1]; y < NAIL[1] + HEM + 80; y += 3) {
      const x = c + (y - NAIL[1]) * 0.55;
      const [dx, dy] = offset(y);
      const hit = inCloth(x - dx, y - dy) && !inCloth(x, y);
      if (!hit) { flush(); continue; }
      run.push(sample([x, y], 0.24 + 0.1 * seed(c, y), t, [0, 50])); t += 12;
    }
    flush();
  }
  // softened with the stump, so the shadow's edge goes soft away from the nail
  for (let c = -400; c < 1300; c += 12) {
    let run = [], t = 0;
    const flush = () => { if (run.length > 3) o.push(gesture('stump', run, 20)); run = []; t = 0; };
    for (let y = NAIL[1]; y < NAIL[1] + HEM + 90; y += 3) {
      const x = c + (y - NAIL[1]) * 0.55;
      const [dx, dy] = offset(y);
      const near = inCloth(x - dx, y - dy) || inCloth(x - dx - 8, y - dy - 6);
      if (!near || inCloth(x, y)) { flush(); continue; }
      run.push(sample([x, y], 0.7, t)); t += 12;
    }
    flush();
  }
  o.push({ k: 'clean', tool: 'stump' });
  return o;
}

function nail() {
  const [x, y] = NAIL;
  const flap = [[x - 7, y + 4], [x - 3, y - 12], [x + 2, y - 20], [x + 6, y - 10], [x + 8, y + 5]];
  return [
    gesture('white-chalk', flap.slice(0, 3).map((q, i) => sample(q, 0.45, i * 40)), 3),
    gesture('compressed-charcoal', flap.slice(2).map((q, i) => sample(q, 0.5, i * 40)), 2),
    gesture('vine-charcoal', [sample([x + 3, y - 6], 0.3, 0), sample([x + 5, y + 2], 0.35, 120), sample([x + 4, y + 9], 0.3, 240)], 5, 0.8),
    gesture('compressed-charcoal', [sample([x - 1, y - 2], 0.8, 0), sample([x + 1, y + 1], 0.9, 400)], 7),
    gesture('white-chalk', [sample([x - 3, y - 4], 0.7, 0), sample([x - 2, y - 3], 0.7, 200)], 2.5),
  ];
}

const passes = [
  { name: 'Lay-in', note: 'Vine charcoal, barely pressed: both edges, the hem, four fold axes. The lit edge is left almost undrawn.', build: layIn },
  { name: 'The wall', note: 'The cloth\'s shadow on the wall, hatched and softened, widening as the cloth falls away from the nail.', build: wall },
  {
    name: 'Shadow masses', note: 'The side of the vine charcoal down every fold, pressed as hard as the shadow is deep.',
    build: () => alongFolds({ tool: 'vine-charcoal', lines: 140, gap: 5, size: 12, tilt: [0, 60], key: 11, reach: 2000, amount: (x, y) => (shade(x, y) > 0.04 ? 0.16 + 0.5 * shade(x, y) : 0) }),
  },
  {
    name: 'Second layer', note: 'The point of the vine charcoal over the darker half, for texture and depth.',
    build: () => alongFolds({ tool: 'vine-charcoal', lines: 170, gap: 4, size: 4, tilt: [0, 25], key: 21, reach: 420, amount: (x, y) => (shade(x, y) > 0.35 ? 0.1 + 0.5 * (shade(x, y) - 0.35) / 0.65 : 0) }),
  },
  {
    // A loaded stump leaves a blot wherever it lifts inside a shadow, so each
    // stroke runs the whole length of its fold and lifts only where the light is.
    name: 'Blend', note: 'The stump down the shadows, the whole length of each fold, fusing strokes into tone; wiped between strokes.',
    build: () => [...alongFolds({ tool: 'stump', lines: 80, gap: 8, size: 18, key: 31, reach: 5000, zigzag: 0.02, wipe: true, amount: (x, y) => (shade(x, y) > 0.05 ? 0.8 : 0) }), { k: 'clean', tool: 'stump' }],
  },
  {
    name: 'Creases', note: 'Compressed charcoal only where two tubes of cloth meet.',
    build: () => [...alongFolds({ tool: 'compressed-charcoal', lines: 110, gap: 6, size: 2.6, key: 41, reach: 150, amount: (x, y) => (shade(x, y) > 0.78 ? 0.2 + 0.55 * (shade(x, y) - 0.78) / 0.22 : 0) }), ...hemLine(), ...nail()],
  },
  {
    name: 'Lifts', note: 'The kneaded eraser down the shadow side of each tube, where light thrown back from the wall softens the dark.',
    build: () => alongFolds({ tool: 'kneaded-eraser', lines: 70, gap: 9, size: 10, key: 71, reach: 260, amount: (x, y) => (shade(x, y) > 0.25 && bounceAt(x, y) > 0.3 ? 0.25 * (bounceAt(x, y) - 0.3) / 0.7 + 0.08 : 0), strength: 0.5 }),
  },
  {
    name: 'Lights', note: 'White chalk: the side of the stick on lit planes, fused with a clean stump, then the point on the brightest ridges.',
    build: () => [
      ...alongFolds({ tool: 'white-chalk', lines: 120, gap: 6, size: 14, tilt: [0, 60], key: 51, reach: 2000, amount: (x, y) => (bright(x, y) > 0.05 ? 0.08 + 0.3 * bright(x, y) : 0) }),
      ...alongFolds({ tool: 'stump', lines: 50, gap: 12, size: 18, key: 81, reach: 2000, wipe: true, amount: (x, y) => (bright(x, y) > 0.1 ? 0.5 : 0) }),
      { k: 'clean', tool: 'stump' },
      // the point only where the light is strongest, and nearer the window
      ...alongFolds({ tool: 'white-chalk', lines: 150, gap: 6, size: 2.4, key: 61, reach: 110, amount: (x, y) => (bright(x, y) > 0.8 && y < 620 ? 0.2 + 0.4 * (bright(x, y) - 0.8) / 0.2 : 0) }),
    ],
  },
];

export default {
  title: 'drapery',
  date: '2026-09-22',
  note: 'Charcoal and white chalk on grey paper, a cloth hung from one nail: the paper is the middle value, and every stroke follows a fold. A loaded stump blotted wherever it lifted inside a shadow, so it now runs the whole fold. Redrawn on version 2 paper, where the pits in the grain stay light under charcoal and chalk. The folds are still more regular than cloth; a real sheet would twist, and one fold would cross another.',
  page: { w: W, h: H },
  surface: { version: 2, paper: 'toned', tooth: 0.85, seed: 1147 },
  passes,
  build: () => passes.flatMap((p) => p.build()),
};

