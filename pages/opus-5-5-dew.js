/* what the dew found — Opus 5.5, 2026-09-25.
 * An orb web at sunrise, lit from behind, against a hedge still in shade.
 * The web is only visible where light catches it, and two things catch it:
 * the dew that settled on the silk overnight, and the silk itself, which
 * shines only where a thread lies across the light. A thin fibre lit from
 * behind scatters light on a cone around its own axis (the angle the light
 * comes in at is the angle it leaves at), so a thread sends light to the eye
 * only where (sun − eye) · T = 0, with both as unit directions from the
 * thread. The web is a tilted plane in 3D and every glint is tested against
 * that condition: the spiral lights in a band through the hub toward the sun,
 * each radius lights at one point on a ring, every straight thread at one
 * point, and right around the sun everything lights at once. None of it is
 * placed by hand. Borrow the rule, not the web. */
import { OP, DOT, SHAPE, PHASE, seed } from '../mark-engine.js';

const W = 1500, H = 1200;
const TAU = Math.PI * 2;
const HUB = [690, 540];              // the hub, on the page
const SUN = [360, 150];              // the sun, on the page, low behind the web

/* ------------------------------------------------------------ small tools */
function stream(salt) {
  let a = Math.floor(seed(salt * 1.713 + 0.37, salt * 0.291 + 5.1) * 4294967296) >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const mul = (a, k) => [a[0] * k, a[1] * k];
const len = (a) => Math.hypot(a[0], a[1]);
const unit = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l]; };
const lerpP = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const mix = (c0, c1, t) => c0.map((v, i) => Math.round(v + (c1[i] - v) * clamp01(t)));
const q = (p) => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10];
const circle = (c, r, n = 32) => Array.from({ length: n }, (_, k) => [c[0] + r * Math.cos((k / n) * TAU), c[1] + r * Math.sin((k / n) * TAU)]);
const norm3 = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function resample(pts, step) {
  const out = [pts[0]];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], L = len(sub(b, a));
    if (L < 1e-9) continue;
    let t = step - carry;
    while (t <= L) { out.push(lerpP(a, b, t / L)); t += step; }
    carry = L - (t - step);
  }
  if (len(sub(out[out.length - 1], pts[pts.length - 1])) > step * 0.3) out.push(pts[pts.length - 1]);
  return out;
}

/* ------------------------------------------------------------ the plane */
/* The eye is at the origin looking down +z; the web's plane passes through
 * the hub, turned away on the right and tipped back a little at the bottom.
 * Web geometry lives in plane coordinates (x right, y down, hub at 0). */
const CAM = 2400, YAW = 0.44, PITCH = 0.1;
const EX = [Math.cos(YAW), 0, Math.sin(YAW)];
const EY = (() => {
  const e = [0, Math.cos(PITCH), Math.sin(PITCH)], d = dot3(e, EX);
  return norm3([e[0] - d * EX[0], e[1] - d * EX[1], e[2] - d * EX[2]]);
})();
const NRM = [EX[1] * EY[2] - EX[2] * EY[1], EX[2] * EY[0] - EX[0] * EY[2], EX[0] * EY[1] - EX[1] * EY[0]];
const to3 = ([x, y]) => [x * EX[0] + y * EY[0], x * EX[1] + y * EY[1], CAM + x * EX[2] + y * EY[2]];
const scr = (P) => [HUB[0] + (CAM * P[0]) / P[2], HUB[1] + (CAM * P[1]) / P[2]];
const proj = (p) => scr(to3(p));
const depth = (p) => CAM / to3(p)[2];          // how much nearer (>1) or farther (<1) than the hub
function unproj([u, v]) {
  const d = [(u - HUB[0]) / CAM, (v - HUB[1]) / CAM, 1];
  const t = (NRM[2] * CAM) / dot3(NRM, d);
  const P = [t * d[0], t * d[1], t * d[2] - CAM];
  return [dot3(P, EX), dot3(P, EY)];
}

/* the light: the sun's direction from the eye, and a point's angle from it */
const SUN_DIR = norm3(to3(unproj(SUN)));
const SUN_P = unproj(SUN);
const offSun = (p) => { const v = norm3(to3(p)); return Math.hypot(SUN_DIR[0] - v[0], SUN_DIR[1] - v[1], SUN_DIR[2] - v[2]); };
/* forward scatter through a drop, or off silk, falls away fast from the sun */
const fwd = (p) => Math.exp(-offSun(p) / 0.1);

/* ------------------------------------------------------------ what holds it */
const bez = (a, b, c, t) => [
  (1 - t) ** 2 * a[0] + 2 * (1 - t) * t * b[0] + t * t * c[0],
  (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * b[1] + t * t * c[1],
];
const GRASS = [[150, 1250], [264, 620], [318, -60]];     // a grass stem on the left, up past the sun and out
const UMBEL = [[1350, 1250], [1236, 780], [1226, 336]];  // a dry umbel on the right, its head curled into a cup
function onStem(curve, y) {
  let lo = 0, hi = 1;
  for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (bez(...curve, m)[1] > y) lo = m; else hi = m; }
  return bez(...curve, (lo + hi) / 2);
}
const CUP = bez(...UMBEL, 1);
const MOUTH = [CUP[0] - 31, CUP[1] - 20];                  // her front legs, where the signal line ends

/* ------------------------------------------------------------ the web, in the plane */
const FRAME_S = [
  [onStem(GRASS, 236)[0] + 22, 236], [716, 196], [onStem(UMBEL, 404)[0] - 44, 404],
  [1114, 904], [648, 1014], [onStem(GRASS, 796)[0] + 24, 796],
];
const FRAME = FRAME_S.map(unproj);
const BRIDGE = [onStem(GRASS, 110), [CUP[0] - 18, CUP[1] - 58]].map(unproj);
const onBridge = (x) => lerpP(BRIDGE[0], BRIDGE[1], (x - BRIDGE[0][0]) / (BRIDGE[1][0] - BRIDGE[0][0]));
const ANCHORS = [
  [0, onStem(GRASS, 220)], [0, onStem(GRASS, 274)],
  [2, onStem(UMBEL, 390)], [2, onStem(UMBEL, 442)],
  [3, onStem(UMBEL, 900)], [3, [1450, 1270]],
  [4, [604, 1270]], [4, [716, 1270]],
  [5, onStem(GRASS, 780)], [5, onStem(GRASS, 848)],
].map(([k, s]) => [FRAME[k], unproj(s)]);
const HANGER = [FRAME[1], onBridge(FRAME[1][0])];
const SIGNAL = [[0, 0], unproj(MOUTH)];

function rayToFrame(u) {
  let best = Infinity;
  for (let k = 0; k < FRAME.length; k++) {
    const p = FRAME[k], e = sub(FRAME[(k + 1) % FRAME.length], p);
    const den = u[0] * e[1] - u[1] * e[0];
    if (Math.abs(den) < 1e-9) continue;
    const t = (p[0] * e[1] - p[1] * e[0]) / den, s = (p[0] * u[1] - p[1] * u[0]) / den;
    if (t > 0 && s >= -1e-6 && s <= 1 + 1e-6) best = Math.min(best, t);
  }
  return best;
}

/* Radii run round from the lower edge of the open sector, through the bottom,
 * to its upper edge. The sector has no spiral: only the signal line crosses
 * it, from the hub to her. Where the primary radii spread too far apart near
 * the frame, secondary ones start partway out. */
const toMouth = Math.atan2(SIGNAL[1][1], SIGNAL[1][0]);
const HALF = (16 * Math.PI) / 180;
const RADII = (() => {
  const a0 = toMouth + HALF, a1 = toMouth - HALF + TAU, n = 30, step = (a1 - a0) / (n - 1);
  const out = [];
  for (let j = 0; j < n; j++) {
    const a = a0 + step * j + (j > 0 && j < n - 1 ? (seed(j, 41) - 0.5) * 0.55 * step : 0);
    out.push({ a, r0: 1.5 + seed(j, 42) * 5 });
  }
  for (let j = 0; j < n - 1; j++) {
    const gap = out[j + 1].a - out[j].a;
    if (seed(j, 43) < 0.42 && gap > step * 0.8) out.push({ a: out[j].a + gap * (0.4 + 0.2 * seed(j, 44)), r0: 150 + seed(j, 45) * 130 });
  }
  out.sort((p, r) => p.a - r.a);
  return out.map((R) => { const u = [Math.cos(R.a), Math.sin(R.a)]; return { ...R, u, R: rayToFrame(u) }; });
})();
const NR = RADII.length;
const rad = (j, r) => mul(RADII[j].u, r);

/* the hub, and the tight strengthening spiral round it, across the sector too */
const PRIMARY = RADII.map((R, j) => j).filter((j) => RADII[j].r0 < 10);
function spiralAround(r0, r1, pitch, salt) {
  const pts = [];
  let r = r0, i = 0;
  while (r < r1 && pts.length < 2000) {
    const j = PRIMARY[i % PRIMARY.length], nj = PRIMARY[(i + 1) % PRIMARY.length];
    pts.push(rad(j, r + (seed(i, salt) - 0.5) * 1.2));
    let da = RADII[nj].a - RADII[j].a;
    if (da <= 0) da += TAU;
    r += (pitch * da) / TAU;
    i++;
  }
  return pts;
}
const HUB_LOOPS = [6, 9.5, 13].map((r, k) => {
  const ring = PRIMARY.map((j) => rad(j, r + (seed(j, 50 + k) - 0.5) * 3.4));
  return [...ring, ring[0]];
});
const STRENGTH = spiralAround(18, 48, 5.6, 55);

/* The capture spiral, laid from the outside in, as she lays it. It keeps to a
 * ring until the next radius is too short to hold it or the sector stops it,
 * then turns back one step in. Near the frame that makes it swing to and fro
 * in the deep lower half; nearer the hub the swings open into near-rings. */
const MARGIN = 8;
const SPIRAL = (() => {
  const r_ = stream(61);
  const pitch = (r) => (9.6 + 5.2 * (r / 460)) * (0.86 + 0.28 * r_());
  const live = (j, r) => j >= 0 && j < NR && RADII[j].r0 + 6 < r;
  const next = (j, dir, r) => { let k = j + dir; while (k >= 0 && k < NR && !live(k, r)) k += dir; return k; };
  let j = 0;
  for (let k = 1; k < NR; k++) if (RADII[k].R > RADII[j].R) j = k;
  let r = RADII[j].R - MARGIN - 5, dir = 1;
  const nodes = [{ j, r }];
  for (let guard = 0; r > 78 && guard < 40000; guard++) {
    const nj = next(j, dir, r);
    if (nj >= 0 && nj < NR && RADII[nj].R - MARGIN > r) { j = nj; nodes.push({ j, r }); continue; }
    dir = -dir;
    r -= pitch(r);
    const bj = next(j, dir, r);
    if (bj >= 0 && bj < NR && RADII[bj].R - MARGIN > r) j = bj;
    nodes.push({ j, r });
  }
  return nodes.map((n) => ({ ...n, p: rad(n.j, n.r + (r_() - 0.5) * 2.2) }));
})();

/* Something went through the lower left in the night. */
const HOLE = { c: unproj([540, 800]), r: 52 };
const inHole = (p) => { const d = sub(p, HOLE.c); return len(d) < HOLE.r * (1 + 0.28 * Math.sin(Math.atan2(d[1], d[0]) * 3 + 1)); };

/* A chord of spiral sags under its dew: horizontal chords hang, vertical
 * ones stay nearly straight. */
function sagCurve(a, b, k = 0.04, n = 8) {
  const d = sub(b, a), L = len(d) || 1;
  let nrm = [-d[1] / L, d[0] / L];
  if (nrm[1] < 0) nrm = mul(nrm, -1);
  const s = k * Math.abs(d[0]);
  return Array.from({ length: n + 1 }, (_, i) => { const t = i / n; return add(lerpP(a, b, t), mul(nrm, s * 4 * t * (1 - t))); });
}
const CHORDS = [];
for (let i = 1; i < SPIRAL.length; i++) {
  const a = SPIRAL[i - 1].p, b = SPIRAL[i].p;
  CHORDS.push({ pts: sagCurve(a, b), a, b, broken: inHole(lerpP(a, b, 0.5)), flat: Math.abs(b[0] - a[0]) / (len(sub(b, a)) || 1) });
}
const STRAIGHT = [
  ...FRAME.map((p, k) => sagCurve(p, FRAME[(k + 1) % FRAME.length], 0.008, 12)),
  ...ANCHORS.map(([a, b]) => sagCurve(a, b, 0.01, 12)),
  BRIDGE, HANGER, SIGNAL,
];

/* ------------------------------------------------------------ light on silk */
/* Colour across a glint: white where the cone passes through the eye, then
 * the spectrum as it moves off, the way a fibre as thin as a few
 * wavelengths spreads it. g is |(sun − eye) · T|. */
const SPECTRUM = [
  [0.000, [255, 255, 252], 1.0],
  [0.007, [236, 242, 255], 0.9],
  [0.012, [168, 160, 255], 0.76],
  [0.018, [100, 196, 255], 0.72],
  [0.024, [112, 240, 168], 0.66],
  [0.030, [246, 236, 112], 0.58],
  [0.036, [255, 150, 92], 0.42],
  [0.042, [255, 104, 140], 0],
];
function spectrum(g) {
  if (g >= SPECTRUM[SPECTRUM.length - 1][0]) return null;
  for (let i = 1; i < SPECTRUM.length; i++) {
    if (g <= SPECTRUM[i][0]) {
      const [g0, c0, a0] = SPECTRUM[i - 1], [g1, c1, a1] = SPECTRUM[i], t = (g - g0) / (g1 - g0);
      return { c: mix(c0, c1, t), a: a0 + (a1 - a0) * t, key: i * 2 + (t > 0.5 ? 1 : 0) };
    }
  }
  return null;
}
const glintOf = (p, t) => {
  const v = norm3(to3(p)), T = norm3([t[0] * EX[0] + t[1] * EY[0], t[0] * EX[1] + t[1] * EY[1], t[0] * EX[2] + t[1] * EY[2]]);
  return Math.abs(dot3([SUN_DIR[0] - v[0], SUN_DIR[1] - v[1], SUN_DIR[2] - v[2]], T));
};
const silkAmp = (p) => 0.3 + 0.7 * Math.exp(-offSun(p) / 0.14);
function glints(pts, o, w = 1) {
  const S = resample(pts, 1.0);
  let run = null;
  const flush = () => {
    if (run && run.pts.length > 1) {
      const P = run.pts.map(proj).map(q), a = clamp01(run.a);
      // a pencil core, which lays down solid where the liner stays thin, and
      // a narrow bloom round it
      o.push(OP('s', P, 'accent', 'pencil', w * 1.05, run.c, a));
      o.push(OP('s', P, 'accent', 'soft', w * (run.key <= 3 ? 0.8 : 0.6), run.c, a * (run.key <= 3 ? 0.36 : 0.24)));
    }
    run = null;
  };
  for (let i = 0; i < S.length - 1; i++) {
    const p = lerpP(S[i], S[i + 1], 0.5), sp = spectrum(glintOf(p, unit(sub(S[i + 1], S[i]))));
    if (!sp) { flush(); continue; }
    if (!run || run.key !== sp.key || run.pts.length > 7) { flush(); run = { key: sp.key, c: sp.c, a: sp.a * silkAmp(p), pts: [S[i]] }; }
    run.pts.push(S[i + 1]);
  }
  flush();
}

/* A thread seen by scattered light: faint, brighter toward the sun. Drawn in
 * pieces so its brightness can change along it. */
function thread(pts, o, { w = 0.42, gain = 1, piece = 40 } = {}) {
  const S = resample(pts, 2);
  const per = Math.max(2, Math.round(piece / 2));
  for (let i = 0; i < S.length - 1; i += per) {
    const seg = S.slice(i, Math.min(S.length, i + per + 1));
    if (seg.length < 2) continue;
    const f = fwd(seg[Math.floor(seg.length / 2)]);
    o.push(OP('s', seg.map(proj).map(q), 'line', 'liner', w, mix([136, 152, 178], [246, 240, 226], f), clamp01((0.06 + 0.55 * f) * gain)));
  }
}

/* ------------------------------------------------------------ dew */
/* A film of water on a fibre breaks into beads, roughly evenly spaced, with
 * small satellites between the large ones. Water runs down and gathers: the
 * beads grow toward the bottom of the web, and a sagging chord keeps its
 * largest drop at its lowest point. */
/* The night did not wet the web evenly: patches of it are heavy, some fine. */
const wet = (p) => 0.62 + 0.26 * Math.sin(p[0] * 0.011 + p[1] * 0.006 + 1.3) * Math.sin(p[0] * 0.0047 - p[1] * 0.012) + 0.18 * Math.sin(p[0] * 0.023 - p[1] * 0.017 + 4);
function beads(pts, r_, { gap = 7, big = 1.5, sat = 0.5, low = 0 } = {}) {
  const S = resample(pts, 0.5);
  const out = [];
  let next = r_() * gap, last = null, acc = 0;
  const grow = (p) => (0.8 + 0.55 * clamp01((p[1] + 330) / 800)) * wet(p);
  for (let i = 1; i < S.length; i++) {
    acc += len(sub(S[i], S[i - 1]));
    if (acc < next) continue;
    const p = S[i];
    if (last && r_() < sat) out.push({ p: lerpP(last, p, 0.5), r: 0.3 + 0.25 * r_() });
    out.push({ p, r: big * grow(p) * (0.5 + 0.85 * r_() ** 1.5) });
    last = p;
    next = acc + gap * (0.65 + 0.7 * r_());
  }
  if (low > 0 && r_() < low) {
    let k = 0;
    for (let i = 1; i < S.length; i++) if (S[i][1] > S[k][1]) k = i;
    if (k > 2 && k < S.length - 3) out.push({ p: S[k], r: big * grow(S[k]) * (1.35 + 0.7 * r_()) });
  }
  return out;
}
function drop({ p, r }, o) {
  const s = proj(p), k = depth(p), R = r * k, f = fwd(p), off = offSun(p);
  o.push(DOT(...q(s), R, 'accent', 'soft', mix([78, 94, 122], [255, 244, 222], f * 1.3), clamp01(0.28 + 0.6 * f)));
  // A drop is a lens: the sun shows in it as a point, on the side away from
  // the sun, nearer the rim the further the drop is from the sun.
  const away = unit(sub(s, SUN));
  const sp = add(s, mul(away, R * Math.min(0.7, 0.08 + off * 1.6)));
  o.push(DOT(...q(sp), Math.max(0.32, R * (0.32 + 0.3 * f)), 'accent', 'soft', [255, 253, 248], clamp01(0.5 + 0.5 * f)));
  if (f > 0.2) o.push(DOT(...q(s), R * (2.4 + 4 * f), 'accent', 'soft', [255, 246, 226], 0.07 * f));
}

/* the hard point of the sun in a drop, laid over its soft image */
function glitter({ p, r }, o) {
  const s = proj(p), R = r * depth(p), f = fwd(p), off = offSun(p);
  const sp = add(s, mul(unit(sub(s, SUN)), R * Math.min(0.7, 0.08 + off * 1.6)));
  o.push(DOT(...q(sp), Math.max(0.26, R * 0.2), 'accent', 'soft', [255, 255, 255], clamp01(0.62 + 0.38 * f)));
}

/* every drop on the web, once, in the order the dew pass lays them */
function dew() {
  const r = stream(83);
  const spiral = [], radii = [], frame = [];
  for (const ch of CHORDS) if (!ch.broken) spiral.push(...beads(ch.pts, r, { gap: 6.8, big: 1.45, sat: 0.55, low: 0.6 * ch.flat }));
  RADII.forEach((R, j) => radii.push(...beads([rad(j, 20), rad(j, R.R)], r, { gap: 13, big: 1.0, sat: 0.2 })));
  for (const loop of HUB_LOOPS) radii.push(...beads(loop, r, { gap: 7, big: 0.8, sat: 0.1 }));
  for (const s of STRAIGHT) frame.push(...beads(s, r, { gap: 15, big: 1.8, sat: 0.3, low: 0.8 }));
  return { spiral, radii, frame };
}

/* ------------------------------------------------------------ the scene */
const hedgeTop = (x) => 318 + 30 * Math.sin(x * 0.0052 + 0.4) + 18 * Math.sin(x * 0.015 + 2) + 9 * Math.sin(x * 0.043) + 26 * clamp01((x - 1000) / 400);
const dS = (p) => len(sub(p, SUN));
/* The glow round the sun. Warm only while it is bright (gold at high value
 * reads as light; gold at low value reads as mud), neutral by the time it
 * dims, then the cool of the shade. */
const GLOW = [
  [0, [255, 255, 255]], [12, [255, 252, 240]], [30, [255, 240, 206]], [60, [246, 224, 184]],
  [96, [214, 204, 186]], [140, [160, 162, 168]], [200, [104, 112, 128]], [290, [66, 76, 94]],
  [400, [44, 52, 68]], [560, [30, 37, 51]],
];
const glowAt = (d) => { for (let i = 1; i < GLOW.length; i++) if (d <= GLOW[i][0]) return mix(GLOW[i - 1][1], GLOW[i][1], (d - GLOW[i - 1][0]) / (GLOW[i][0] - GLOW[i - 1][0])); return GLOW[GLOW.length - 1][1]; };
/* the sky over the hedge: cool, a little lighter low down and on the right,
 * where a thinner mist lets the dawn through, and the sun's glow over it all */
const skyAt = (p) => {
  const base = mix([17, 20, 28], [36, 42, 55], clamp01((p[1] + 60) / 440) * 0.8 + 0.3 * clamp01((p[0] - 900) / 500));
  const g = glowAt(dS(p));
  return base.map((v, i) => Math.max(v, g[i]));
};

const passes = [
  {
    name: 'Mist, and the sun behind the web',
    note: 'The sun has just cleared a hedge, low and up to the left, and lights the mist over it. White at the sun, a little warm only very close to it, then cool grey, then the dark: dimmed warm light on black goes to mud, so the warmth stays where the light is strong.',
    build: () => {
      const o = [PHASE('Sky over the hedge, and the sun in the mist')];
      /* Every dot is painted in the colour that point should end as, and the
       * dots overlap enough to settle on it: nothing dim is ever made by
       * thinning a warm colour over black, which is how the first mist went to mud. */
      for (let y = -80, row = 0; y <= 540; y += 18, row++) {
        for (let x = -80 + (row % 2) * 9; x <= W + 80; x += 18) {
          const c = skyAt([x, y]).map((v) => Math.min(255, Math.round(v * 1.12)));
          o.push(DOT(x, y, 30, 'tone', 'soft', c, 0.22));
        }
      }
      for (const [rr, a] of [[40, 0.35], [24, 0.6], [14, 0.9], [9, 1], [6, 1]]) o.push(DOT(...SUN, rr, 'tone', 'soft', [255, 255, 255], a));
      return o;
    },
  },
  {
    name: 'The hedge in shade',
    note: 'We see the side of the hedge away from the sun, so it is dark, and out of focus: its top edge soft and uneven, its body faintly mottled. Near the sun the light spills over its top, and leaves at the edge that catch it become discs.',
    build: () => {
      const r = stream(5);
      const o = [PHASE('The hedge')];
      const top = [];
      for (let x = -40; x <= W + 40; x += 10) top.push([x, hedgeTop(x) + 56]);
      o.push(SHAPE([...top, [W + 40, H + 40], [-40, H + 40]].map(q), [10, 12, 15], { layer: 'tone' }));
      for (let x = -40; x <= W + 40; x += 18) {
        const y = hedgeTop(x) + (r() - 0.25) * 40;
        o.push(DOT(Math.round(x + (r() - 0.5) * 12), Math.round(y + 26), 26 + r() * 26, 'tone', 'soft', [10, 12, 15], 0.92));
      }
      for (let k = 0; k < 160; k++) {
        const x = r() * (W + 100) - 50, y = hedgeTop(x) + 70 + r() * (H - hedgeTop(x));
        o.push(DOT(Math.round(x), Math.round(y), 26 + r() * 34, 'tone', 'soft', [15 + Math.round(r() * 6), 19 + Math.round(r() * 8), 23 + Math.round(r() * 8)], 0.28 + r() * 0.34));
      }
      o.push(PHASE('Light spilling over its top'));
      for (let y = 220, row = 0; y <= 760; y += 20, row++) {
        for (let x = -60 + (row % 2) * 10; x <= 1000; x += 20) {
          const d = dS([x, y]), f = Math.exp(-d / 230);
          if (f < 0.04) continue;
          // thin light over dark: keep it neutral-cool, or it goes to mud
          const v = glowAt(d * 0.8).reduce((s, c) => s + c, 0) / 3;
          o.push(DOT(x, y, 30, 'tone', 'soft', [Math.round(v * 0.9), Math.round(v * 0.95), Math.round(v)], 0.05 * f + 0.02 * f * clamp01((hedgeTop(x) + 90 - y) / 90)));
        }
      }
      o.push(PHASE('Leaves catching the sun, out of focus'));
      for (const [dx, dy, rr, a] of [[-150, 175, 24, 0.1], [-218, 206, 15, 0.08], [96, 188, 30, 0.06], [-60, 222, 12, 0.1], [178, 214, 19, 0.05], [-300, 190, 27, 0.05]]) {
        o.push(DOT(SUN[0] + dx, SUN[1] + dy, rr, 'tone', 'soft', mix([196, 204, 214], [255, 246, 226], Math.exp(-Math.hypot(dx, dy) / 240)), a));
      }
      return o;
    },
  },
  {
    name: 'What holds it',
    note: 'A grass stem on the left, running up past the sun and out of the picture, and a dry umbel on the right whose head has curled into a cup. Both dark against the light, lit only along the edge toward it.',
    build: () => {
      const r = stream(7);
      const o = [PHASE('The grass stem')];
      const body = (curve, w0, w1, n, col = [8, 9, 11]) => {
        const pts = Array.from({ length: n + 1 }, (_, i) => bez(...curve, i / n));
        const left = [], right = [];
        for (let i = 0; i <= n; i++) {
          const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n, i + 1)], T = unit(sub(b, a)), N = [-T[1], T[0]];
          const w = (w0 + (w1 - w0) * (i / n)) / 2;
          left.push(add(pts[i], mul(N, w))); right.push(add(pts[i], mul(N, -w)));
        }
        o.push(SHAPE([...left, ...right.reverse()].map(q), col, { layer: 'tone' }));
        rim(pts, (i) => (w0 + (w1 - w0) * (i / n)) * 0.44);
        return pts;
      };
      const rim = (pts, half, gain = 1) => {
        for (let i = 0; i < pts.length - 1; i += 2) {
          const a = pts[i], b = pts[Math.min(pts.length - 1, i + 3)], mid = lerpP(a, b, 0.5), T = unit(sub(b, a));
          let N = [-T[1], T[0]];
          const toSun = unit(sub(SUN, mid));
          if (N[0] * toSun[0] + N[1] * toSun[1] < 0) N = mul(N, -1);
          const w = half(i), f = Math.exp(-dS(mid) / 330);
          o.push(OP('s', [add(a, mul(N, w)), add(b, mul(N, w))].map(q), 'accent', 'liner', 0.75, mix([92, 100, 112], [255, 244, 222], f * 1.3), clamp01((0.1 + 0.9 * f) * gain)));
        }
      };
      body(GRASS, 6, 3, 110);

      o.push(PHASE('The umbel'));
      body(UMBEL, 9, 6.5, 100, [9, 10, 12]);
      // the head, curled into a cup: rays rise from the top of the stem and
      // turn in at the rim, woven close, the whole head leaning a little
      // toward the web; the seeds make a bristling crown
      const TOPY = CUP[1] - 66, LEAN = -0.12;
      const lean = (p) => { const d = sub(p, CUP); return add(CUP, [d[0] * Math.cos(LEAN) - d[1] * Math.sin(LEAN), d[0] * Math.sin(LEAN) + d[1] * Math.cos(LEAN)]); };
      const half = (y) => 38 * Math.sin((Math.PI / 2) * clamp01((CUP[1] - y) / 66) ** 0.55) - 5 * clamp01((CUP[1] - y - 52) / 14);
      const rays = Array.from({ length: 64 }, (_, k) => ({ psi: (k / 64) * TAU + (r() - 0.5) * 0.2, h: 56 + r() * 16, bow: (r() - 0.5) * 0.5, w: 1 + (r() - 0.5) * 0.3 }));
      rays.sort((p, s) => Math.sin(p.psi) - Math.sin(s.psi));
      for (const ray of rays) {
        const front = Math.sin(ray.psi);
        const pts = Array.from({ length: 14 }, (_, i) => {
          const y = CUP[1] - (ray.h * i) / 13, s = i / 13;
          return lean([CUP[0] + half(y) * ray.w * Math.cos(ray.psi + ray.bow * Math.sin(Math.PI * s)), y + 3 * front * Math.sin(Math.PI * s)]);
        });
        o.push(OP('s', pts.map(q), 'tone', 'soft', front > 0 ? 0.62 : 0.44, [10, 11, 13], front > 0 ? 1 : 0.85));
        if (Math.cos(ray.psi) < -0.6) o.push(OP('s', pts.slice(3).map((p) => add(p, [-0.8, -0.3])).map(q), 'accent', 'liner', 0.35, [176, 176, 172], 0.14));
      }
      for (let k = 0; k < 170; k++) {
        const psi = r() * TAU, rr = 28 + r() * 12, y = TOPY + 6 * Math.sin(psi) - r() * 8;
        const base = lean([CUP[0] + rr * Math.cos(psi), y]);
        const a = -Math.PI / 2 + (r() - 0.5) * 2.2 + Math.cos(psi) * 0.5, L = 3 + r() * 5;
        const tip = add(base, [Math.cos(a) * L, Math.sin(a) * L]);
        o.push(OP('s', [base, tip].map(q), 'tone', 'soft', 0.16, [11, 12, 14], 1));
        if (r() < 0.4) o.push(DOT(...q(base), 1 + r() * 0.8, 'tone', 'soft', [11, 12, 14], 1));
        if (Math.cos(psi) < -0.2 || a < -2.2) o.push(OP('s', [base, tip].map((p) => add(p, [-0.5, -0.4])).map(q), 'accent', 'liner', 0.25, [200, 196, 184], 0.18));
      }
      return o;
    },
  },
  {
    name: 'The structure',
    note: 'Bridge, anchors, frame, radii and the hub, drawn as silk seen by scattered light alone: barely there away from the sun, clearer toward it. The signal line runs from the hub across the open sector to the cup.',
    build: () => {
      const o = [PHASE('Bridge, frame and anchors')];
      for (const s of STRAIGHT) thread(s, o, { w: 0.55, gain: 1.15 });
      o.push(PHASE('Radii'));
      RADII.forEach((R, j) => thread([rad(j, R.r0), rad(j, R.R)], o, { w: 0.45 }));
      o.push(PHASE('The hub'));
      for (const loop of HUB_LOOPS) thread(loop, o, { w: 0.42, gain: 1.2, piece: 20 });
      thread(STRENGTH, o, { w: 0.42, gain: 1.1, piece: 20 });
      return o;
    },
  },
  {
    name: 'The sticky spiral',
    note: 'Laid from the outside in, turning back at the open sector and wherever the next radius is too short, so it swings to and fro in the deep lower half. Every chord sags a little under its water. A hole in the lower left, with the broken ends hanging.',
    build: () => {
      const r = stream(71);
      const o = [PHASE('The capture spiral')];
      for (const ch of CHORDS) if (!ch.broken) thread(ch.pts, o, { w: 0.4, piece: 60 });
      o.push(PHASE('The hole'));
      for (const ch of CHORDS) {
        if (!ch.broken) continue;
        for (const end of [ch.a, ch.b]) {
          if (inHole(end) || r() < 0.35) continue;
          const toward = unit(sub(HOLE.c, end)), L = 5 + r() * 12, tip = add(end, add(mul(toward, L * 0.6), [0, L]));
          thread([end, add(end, add(mul(toward, L * 0.5), [0, L * 0.35])), tip], o, { w: 0.4, gain: 1.4 });
          drop({ p: tip, r: 1.1 + r() * 1.3 }, o);     // a broken end keeps the drop that weighed it down
        }
      }
      return o;
    },
  },
  {
    name: 'Dew',
    note: 'Beads on everything: large drops with small satellites between them on the spiral, sparser and smaller on the radii, a few heavy ones on the frame. Each drop is a small lens, so the sun shows in it as a point on the side away from the sun.',
    build: () => {
      const { spiral, radii, frame } = dew();
      const o = [PHASE('Dew on the spiral')];
      for (const b of spiral) drop(b, o);
      o.push(PHASE('Dew on the radii and the hub'));
      for (const b of radii) drop(b, o);
      o.push(PHASE('Dew on the frame and anchors'));
      for (const b of frame) drop(b, o);
      return o;
    },
  },
  {
    name: 'Where the light catches',
    note: 'The glints, from the one rule. White where the thread lies exactly across the light, the spectrum either side, and near the sun every thread at once.',
    build: () => {
      const o = [PHASE('The spiral band')];
      for (const ch of CHORDS) if (!ch.broken) glints(ch.pts, o, 1);
      o.push(PHASE('The ring on the radii'));
      RADII.forEach((R, j) => glints([rad(j, R.r0), rad(j, R.R)], o, 1));
      o.push(PHASE('Frame, anchors and hub'));
      for (const s of STRAIGHT) glints(s, o, 1.1);
      for (const loop of HUB_LOOPS) glints(loop, o, 0.8);
      glints(STRENGTH, o, 0.8);
      return o;
    },
  },
  {
    name: 'Her',
    note: 'At the lip of the cup, front legs on the signal line, listening to the whole web through one thread. Dark on the mist, lit only at the edges.',
    build: () => {
      const o = [PHASE('Her')];
      const face = unit(sub(proj([0, 0]), MOUTH)), side = [-face[1], face[0]];
      const at = (u, v) => add(MOUTH, add(mul(face, -u), mul(side, v)));
      const oval = (c, rx, ry) => Array.from({ length: 28 }, (_, k) => { const t = (k / 28) * TAU; return at(c + rx * Math.cos(t), ry * Math.sin(t)); });
      // legs: hip, knee (raised), foot; the first pair reaches for the line
      // an orb-weaver's legs are stout at the top and not long: the first
      // pair longest, the third short
      const legs = [
        [[5, 1.6], [0, 7.5], [-9, 1.4]], [[5, -1.6], [-1, -7], [-9.5, -1]],
        [[6, 2.2], [3.5, 9.5], [-3, 12]], [[6, -2.2], [3.5, -9.5], [-3, -12]],
        [[8, 2.4], [8.5, 8.5], [6, 11.5]], [[8, -2.4], [8.5, -8.5], [6, -11.5]],
        [[9, 2.2], [15, 7.5], [19.5, 10.5]], [[9, -2.2], [15, -7.5], [19.5, -10]],
      ];
      for (const leg of legs) {
        const pts = leg.map((p) => at(...p));
        o.push(OP('s', [pts[0], pts[1]].map(q), 'tone', 'soft', 0.6, [8, 8, 10], 1));
        o.push(OP('s', [pts[1], pts[2]].map(q), 'tone', 'soft', 0.4, [8, 8, 10], 1));
        o.push(OP('s', pts.map((p) => add(p, [-0.6, -0.6])).map(q), 'accent', 'liner', 0.35, [224, 206, 168], 0.4));
      }
      o.push(SHAPE(oval(6.5, 4.2, 3.6).map(q), [9, 9, 11], { layer: 'tone' }));
      o.push(SHAPE(oval(15.5, 7.4, 6).map(q), [8, 8, 10], { layer: 'tone' }));
      o.push(OP('s', oval(15.5, 7.4, 6).slice(10, 20).map((p) => add(p, [-0.5, -0.5])).map(q), 'accent', 'liner', 0.55, [232, 214, 176], 0.5));
      o.push(OP('s', oval(6.5, 4.2, 3.6).slice(9, 17).map((p) => add(p, [-0.4, -0.4])).map(q), 'accent', 'liner', 0.45, [232, 214, 176], 0.4));
      return o;
    },
  },
  {
    name: 'The sun in every drop',
    note: 'A hard point of the sun in every drop, over the soft one. A drop is a clear lens, so however far it hangs from the sun it still holds a small sharp image of it, and that point, more than the drop, is what makes dew glitter.',
    review: {
      observation: 'Saved as page 4. At full size the glints are right, but the dew away from the sun reads as dull grey beads: the soft body of each drop is doing the work, and its image of the sun is too soft and too dim to register.',
      change: 'A small, hard, near-white point at each drop\'s image of the sun, brighter toward the sun.',
      next: 'Look at the lower web and the signal line at full size: the dew should glitter there without the web turning into a field of stars.',
      region: [380, 700, 420, 300],
    },
    build: () => {
      const { spiral, radii, frame } = dew();
      const o = [PHASE('The sun in every drop')];
      for (const b of [...spiral, ...radii, ...frame]) glitter(b, o);
      return o;
    },
  },
  {
    name: 'Her line',
    note: 'The signal line is the thread she listens through, and it crosses the one empty part of the web, so it has to read as a line and not as scattered dots. It is finer than the frame, and a finer thread breaks its water into smaller, closer beads: those go in between.',
    review: {
      observation: 'At full size the signal line is a few scattered drops across the dark sector; the one thread that ties her to the web does not read as a thread.',
      change: 'Fine, close beads along it, each with its point of sun, and the silk itself a touch clearer.',
      next: 'At fit view it should be findable, not a searchlight.',
      region: [690, 280, 560, 300],
    },
    build: () => {
      const r = stream(97);
      const o = [PHASE('Her line')];
      thread(SIGNAL, o, { w: 0.5, gain: 1.6 });
      for (const b of beads(SIGNAL, r, { gap: 4.4, big: 0.6, sat: 0 })) { drop(b, o); glitter(b, o); }
      return o;
    },
  },
];

export default {
  title: 'what the dew found',
  date: '2026-09-25',
  note: 'An orb web at sunrise, lit from behind, against a hedge still in shade; built in the dark and found by the dew. The glints come from one rule: a fibre lit from behind sends light to the eye only where the sun and the eye make the same angle with it. The web is a tilted plane and every thread is tested against that, so the band through the hub, the ring on the radii and the blaze round the sun all fall out of where the sun is. She waits in a curled umbel at the edge, on the one thread that crosses the open sector. It failed first as a target seen face-on, with glints too thin to see; then as mud, from warm glow thinned over black; then as moonlight, with the warmth taken out. Later passes put a hard point of the sun in every drop, which is what makes dew glitter rather than sit there, and fine beads along her line so it reads as one thread across the dark. Still unresolved: the turnbacks at the lower edge of the open sector stand in a row like a fence, and the rainbow beyond the hub may be wider than an eye would see it.',
  page: { w: W, h: H },
  surface: { kind: 'ink', version: 2, paper: '#08090c' },
  passes,
  build: () => passes.flatMap((p) => p.build()),
};
