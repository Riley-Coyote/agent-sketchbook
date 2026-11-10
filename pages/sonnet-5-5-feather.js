/* a feather, lit from the front — Sonnet 5.5, 2026-09-29.
 * The library half of the piece: the feather's construction (one rachis, two
 * vanes of barbs, splits where the barbs have let go) and how it is painted
 * when the light falls on it from the front. The default export is a study of
 * the front-lit feather on its own, to be looked at before anything else is
 * built on it. */
import { OP, DOT, PHASE, SHAPE, seed } from '../mark-engine.js';

/* ------------------------------------------------------------ small tools */
const DEG = Math.PI / 180;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mixc = (c0, c1, t) => c0.map((v, i) => Math.round(lerp(v, c1[i], clamp01(t))));
const q = (p) => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const mul = (a, k) => [a[0] * k, a[1] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const len = (a) => Math.hypot(a[0], a[1]);
const unit = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l]; };
const rnd = (i, salt) => seed(i + 0.5, salt * 1.37 + 0.11);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/* smooth 1-D noise in -1..1, the same every time */
function vnoise(x, salt) {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return lerp(seed(i, salt * 3.1 + 0.7), seed(i + 1, salt * 3.1 + 0.7), u) * 2 - 1;
}
function bez(P0, P1, P2, P3, u) {
  const v = 1 - u;
  return [
    v * v * v * P0[0] + 3 * v * v * u * P1[0] + 3 * v * u * u * P2[0] + u * u * u * P3[0],
    v * v * v * P0[1] + 3 * v * v * u * P1[1] + 3 * v * u * u * P2[1] + u * u * u * P3[1],
  ];
}
/* every step-th sample of a dense path, always keeping both ends */
const thin = (pts, step) => {
  const out = [pts[0]];
  let last = pts[0];
  for (let k = 1; k < pts.length - 1; k++) if (len(sub(pts[k], last)) >= step) { out.push(pts[k]); last = pts[k]; }
  out.push(pts[pts.length - 1]);
  return out;
};

/* ------------------------------------------------------------ the feather itself */
/* Local frame: t runs along the rachis from the quill's cut end (0) to the tip
 * (1); v is the distance across it. side +1 is the broad (inner) vane, on the
 * right when the tip points up; side -1 is the narrow (outer) one. */
export function makeFeather(o = {}) {
  const F = {
    L: 1950,                 // rachis length on the page, px
    t0: 0.15,                // where the vane begins; below it is bare quill
    Wi: 292, Wo: 142,        // half-widths of the broad and narrow vane
    bow: 44, curl: 58,       // the shaft leans out, then curls back at the tip
    origin: [500, 2280],     // the cut end of the quill, on the page
    rot: 0.06,               // clockwise, radians
    ds: 1.3,                 // spacing of barbs along the rachis, px
    salt: 3,
    splits: [
      { side: 1, t: 0.455, amp: 38, half: 14 },
      { side: 1, t: 0.7, amp: 20, half: 8 },
      { side: -1, t: 0.6, amp: 16, half: 6 },
    ],
    bars: [0.352, 0.398, 0.446, 0.492, 0.539, 0.587, 0.632, 0.681, 0.727, 0.775],
    barHW: 0.0056, chev: 0.012,
    tipAt: 0.842,
    ...o,
  };
  const c = Math.cos(F.rot), s = Math.sin(F.rot);
  const xf = ([x, y]) => [F.origin[0] + x * c - y * s, F.origin[1] + x * s + y * c];
  const Rl = (t) => [-F.bow * 4 * t * (1 - t) + F.curl * t * t * t, -t * F.L];
  F.R = (t) => xf(Rl(t));
  F.T = (t) => unit(sub(xf(Rl(Math.min(1, t + 0.002))), xf(Rl(Math.max(0, t - 0.002)))));
  F.N = (t) => { const T = F.T(t); return [-T[1], T[0]]; };

  const prof = (u, ts, k) => {
    const rise = Math.pow(smooth(0, 0.42, u), 1.1);
    let tip = 1;
    if (u > ts) { const v = (u - ts) / (1 - ts); tip = Math.pow(Math.max(0, 1 - v * v), k); }
    return rise * tip;
  };
  F.W = (side, t) => {
    if (t <= F.t0) return 0;
    const u = (t - F.t0) / (1 - F.t0);
    return side > 0
      ? F.Wi * prof(u, 0.74, 0.5) * (1 + 0.035 * Math.sin(u * 5))
      : F.Wo * prof(u, 0.78, 0.5);
  };

  /* how far a split pulls a barb aside along the rachis */
  const splitShift = (side, ti, uf) => {
    let dx = 0;
    for (const S of F.splits) {
      if (S.side !== side) continue;
      const d = (ti - S.t) * F.L;
      dx += (d >= 0 ? 1 : -1) * 0.5 * S.amp * Math.exp(-((d / S.half) ** 2)) * Math.pow(uf, 1.4);
    }
    return dx;
  };

  /* the barbs: each is a curve hung from the rachis that leaves nearly square
   * and sweeps toward the tip, ending on the outline of the vane */
  F.barbs = { 1: [], '-1': [] };
  const hang = (side, i, t, te, lateral) => {
    const alpha = Math.atan2(lateral, Math.max(1, (te - t) * F.L)) / DEG;
    const A = F.R(t), Ta = F.T(t), Na = mul(F.N(t), side);
    const E = add(F.R(te), mul(F.N(te), side * lateral));
    const chord = len(sub(E, A));
    if (chord < 3) return;
    const aLead = Math.min(84, alpha + 20) * DEG, aEnd = Math.max(6, alpha - 16) * DEG;
    const d0 = add(mul(Ta, Math.cos(aLead)), mul(Na, Math.sin(aLead)));
    const Te = F.T(te), Ne = mul(F.N(te), side);
    const d1 = add(mul(Te, Math.cos(aEnd)), mul(Ne, Math.sin(aEnd)));
    const P1 = add(A, mul(d0, chord * 0.36)), P2 = sub(E, mul(d1, chord * 0.34));
    const m = clamp(Math.round(chord / 4), 6, 90);   // dense: bars and the tip are measured on it
    const Wend = Math.max(lateral, 1e-3);
    const pts = [], tps = [], vfs = [];
    for (let k = 0; k <= m; k++) {
      const uu = k / m;
      let p = bez(A, P1, P2, E, uu);
      const rel = sub(p, A);
      const vf = clamp01(dot(rel, Na) / Wend);
      p = add(p, mul(Ta, splitShift(side, t, vf)));
      p = add(p, mul(Na, 0.5 * vnoise(k * 0.45 + i * 0.13, 50 + side))); // barbs are not ruled
      pts.push(q(p)); tps.push(t + dot(rel, Ta) / F.L); vfs.push(vf);
    }
    const cl = vnoise(i / 9, 40 + side);     // barbs lean together in clumps
    F.barbs[side].push({ side, i, t, te, A: q(A), E: q(E), pts, tps, vfs, cl, bj: clamp(0.6 * cl + 0.8 * (rnd(i, 61) - 0.5), -1, 1), len: chord });
  };

  for (const side of [1, -1]) {
    const n = Math.floor((F.L * (0.982 - F.t0)) / F.ds);
    let prevTe = 0, lastT = 0, lastTe = 0, lastLat = 0;
    for (let i = 0; i < n; i++) {
      const t = F.t0 + 0.004 + (i * F.ds) / F.L;
      const u = (t - F.t0) / (1 - F.t0);
      const cl = vnoise(i / 9, 40 + side);
      const alphaNat = clamp((side > 0 ? lerp(66, 33, Math.pow(u, 0.9)) : lerp(54, 26, Math.pow(u, 0.9)))
        + 3.4 * vnoise((t * F.L) / 55, 11 + side) + 2.6 * cl + 1.2 * (rnd(i, 21 + side) - 0.5) * 2, 12, 80);
      /* Where along the outline this barb lands. Barbs land in the same order
       * they are hung, so they never cross; near the tip there is not room to
       * land at the natural angle, so they splay out at a wider one and the
       * tip comes out round instead of fanned. */
      const tanA = Math.tan(alphaNat * DEG);
      const g = (x) => x - t - F.W(side, x) / tanA / F.L;      // rises with x, so the landing is found by bisection
      let lo = t, hi = 0.9997;
      if (g(hi) < 0) lo = hi; else for (let k = 0; k < 34; k++) { const mid = (lo + hi) / 2; if (g(mid) < 0) lo = mid; else hi = mid; }
      let te = Math.min((lo + hi) / 2, t + 0.88 * (1 - t), 0.9997);
      te = Math.max(te, Math.min(prevTe + (0.2 * F.ds) / F.L, 0.9997));
      prevTe = te;
      // near the base the barbs are down: they stop short, unevenly, and the edge frays
      const rag = (1 - smooth(0.15, 0.34, t)) * 0.42 * rnd(i, 35 + side);
      const shrink = (rnd(i, 31 + side) < 0.012 ? -0.05 : rnd(i, 32 + side) < 0.03 ? 0.07 : 0.008 + 0.016 * rnd(i, 33 + side)) + rag;
      const lateral = F.W(side, te) * (1 - shrink);
      hang(side, i, t, te, lateral);
      lastT = t; lastTe = te; lastLat = F.W(side, te);
    }
    // the cap: the last barbs wrap round the pole of the tip and land on the shaft
    const J = 22, pole = 0.9988;
    for (let j = 1; j <= J; j++) {
      const th = (Math.PI / 2) * (j / J);
      hang(side, n + j, lastT + (0.9955 - lastT) * (j / J), lastTe + (pole - lastTe) * Math.sin(th), lastLat * Math.cos(th));
    }
  }
  return F;
}

/* ------------------------------------------------------------ the blue */
/* Blue jay blue is not a pigment: dark melanin under a sponge of keratin that
 * scatters only the short wavelengths back. So the ramp runs from an ink-navy
 * (where the sponge is thin or shaded) through a full cobalt to a pale sky
 * where the light glances off it, and never through a paler version of the
 * same pigment. */
const blueRamp = (k) => {
  if (k < 0.55) return mixc([8, 14, 40], [18, 34, 82], k / 0.55);
  if (k < 1) return mixc([18, 34, 82], [46, 98, 204], (k - 0.55) / 0.45);
  if (k < 1.5) return mixc([46, 98, 204], [122, 182, 242], (k - 1) / 0.5);
  return mixc([122, 182, 242], [210, 230, 252], clamp01((k - 1.5) / 0.5));
};
const whiteRamp = (k) => (k < 0.5
  ? mixc([92, 112, 156], [186, 202, 232], k / 0.5)
  : mixc([186, 202, 232], [246, 249, 255], (k - 0.5) / 0.5));

function fieldFn(F) {
  return (side, tp, vf, cl) => {
    const along = tp * F.L;
    let k = 1 + 0.12 * vnoise(along / 80, 5 + side * 2) + 0.07 * vnoise(along / 21 + vf * 4, 9 + side) + 0.09 * cl;
    const sh = Math.exp(-(((tp - (0.62 - 0.12 * vf)) / 0.14) ** 2));
    const sh2 = Math.exp(-(((tp - (0.36 + 0.06 * vf)) / 0.05) ** 2));
    k += sh * (side < 0 ? 0.44 : 0.3) + sh2 * 0.12;
    k -= 0.18 * (1 - smooth(0, 0.18, vf));
    k += 0.1 * smooth(0.85, 1, vf);
    let c = blueRamp(k);
    if (side < 0) c = mixc(c, [96, 108, 214], smooth(0.7, 1, vf) * 0.28);   // the narrow vane leans violet at its edge
    c = mixc(c, [62, 60, 74], (1 - smooth(0.17, 0.4, tp)) * 0.8);
    if (side > 0) c = mixc(c, [128, 140, 166], smooth(0.6, 1, vf) * 0.5);
    return c;
  };
}
/* No two bars are alike: each has its own place, width and lean, and the two
 * vanes never quite agree across the shaft. */
const barSpecs = (F) => F.bars.map((c, k) => ({
  c: c + 0.0055 * (rnd(k, 301) - 0.5) * 2,
  hw: F.barHW * (0.78 + 0.5 * rnd(k, 302)),
  lean: 0.008 * (rnd(k, 303) - 0.5) * 2,
  fringe: 0.0026 + 0.0022 * rnd(k, 304),
}));
const barCover = (F, S, side, tp, vf, bj) => {
  let cov = 0;
  for (let k = 0; k < S.length; k++) {
    const b = S[k];
    const centre = b.c - (F.chev + b.lean) * vf + (side < 0 ? 0.0042 : 0);
    const hw = b.hw * (0.78 + 0.55 * vf);            // a bar thickens toward the edge of the vane
    const d = Math.abs(tp - centre + 0.0018 * bj);
    cov = Math.max(cov, 1 - smooth(hw - b.fringe, hw + b.fringe, d));
  }
  return cov;
};
const tipCover = (F, tp, vf, bj) => 1 - smooth(-0.004, 0.004, F.tipAt - F.chev * vf * 0.6 + 0.0016 * bj - tp);

/* the stretches of a barb where cover(...) is above a level, ends found by
 * interpolating between samples so the edge does not step */
function runs(b, cover, level) {
  const out = [];
  let run = null;
  const cv = b.pts.map((_, k) => cover(b.tps[k], b.vfs[k]));
  const cross = (k) => {
    const f = (level - cv[k - 1]) / (cv[k] - cv[k - 1]);
    return q(add(b.pts[k - 1], mul(sub(b.pts[k], b.pts[k - 1]), clamp01(f))));
  };
  for (let k = 0; k < b.pts.length; k++) {
    if (cv[k] > level) {
      if (!run) { run = []; if (k > 0) run.push(cross(k)); }
      run.push(b.pts[k]);
    } else if (run) { run.push(cross(k)); out.push(run); run = null; }
  }
  if (run) out.push(run);
  return out.filter((r) => r.length > 1);
}

/* ------------------------------------------------------------ painting: front-lit */
export function paintFrontLit(F) {
  const ops = [];
  const field = fieldFn(F);
  const sides = [1, -1];
  const fade = (tp, b) => smooth(0.15 + 0.05 * rnd(b.i, 44), 0.27 + 0.07 * rnd(b.i, 45), tp);          // the vane thins out where it meets the down

  ops.push(PHASE('the body of the vane'));
  for (const side of sides) {
    const arr = F.barbs[side];
    for (let bi = 0; bi < arr.length; bi += 2) {
      const b = arr[bi], n = b.pts.length - 1;
      for (const [a0, a1] of [[0, 0.52], [0.4, 0.78], [0.66, 0.95]]) {
        const i0 = Math.floor(a0 * n), i1 = Math.max(i0 + 2, Math.ceil(a1 * n));
        const mid = Math.floor((i0 + i1) / 2);
        const c = field(side, b.tps[mid], b.vfs[mid], b.cl);
        ops.push(OP('s', thin(b.pts.slice(i0, i1 + 1), 10), 'tone', 'soft', 0.62, c, 0.9 * fade(b.tps[mid], b)));
      }
    }
  }

  ops.push(PHASE('each barb, one line'));
  for (const side of sides) {
    for (const b of F.barbs[side]) {
      const n = b.pts.length - 1, mid = Math.floor(n * 0.5);
      const base = field(side, b.tps[mid], b.vfs[mid], b.cl);
      const lift = 0.7 + 0.6 * rnd(b.i, 71 + side);
      const c = lift > 1 ? mixc(base, [150, 200, 244], (lift - 1) * 0.8) : mixc(base, [10, 20, 56], (1 - lift) * 0.9);
      ops.push(OP('s', thin(b.pts, 9), 'line', 'pencil', 0.62, c, (0.3 + 0.35 * rnd(b.i, 72 + side)) * fade(b.tps[mid], b)));
    }
  }

  ops.push(PHASE('the bars'));
  const S = barSpecs(F);
  const cov = (b) => (tp, vf) => barCover(F, S, b.side, tp, vf, b.bj);
  for (const side of sides) {
    for (const b of F.barbs[side]) {
      for (const r of runs(b, cov(b), 0.14)) ops.push(OP('s', thin(r, 6), 'line', 'soft', 0.95, [14, 22, 50], 0.3));
    }
  }
  for (const side of sides) {
    for (const b of F.barbs[side]) {
      for (const r of runs(b, cov(b), 0.5)) {
        ops.push(OP('s', thin(r, 6), 'line', 'soft', 0.8, rnd(b.i, 81) < 0.5 ? [8, 12, 30] : [14, 22, 50], 0.66));
        // the barbs are still there inside the bar: a paler line, now and then a spark of the blue under it
        if (rnd(b.i, 83) < 0.6) ops.push(OP('s', thin(r, 6), 'line', 'pencil', 0.5, mixc([30, 48, 100], [62, 100, 190], rnd(b.i, 84)), 0.22 + 0.2 * rnd(b.i, 85)));
      }
    }
  }

  ops.push(PHASE('the white at the tip'));
  for (const side of sides) {
    for (const b of F.barbs[side]) {
      const cv = (tp, vf) => tipCover(F, tp, vf, b.bj * 2.2);
      // the blue gives way to white over a few pixels, and not on a line
      for (const r of runs(b, cv, 0.12)) ops.push(OP('s', thin(r, 8), 'accent', 'soft', 0.62, [150, 176, 226], 0.3));
      for (const r of runs(b, cv, 0.5)) {
        const vfm = b.vfs[Math.floor(b.vfs.length * 0.75)];
        const kk = clamp01(0.7 + 0.27 * b.cl + 0.2 * (rnd(b.i, 91) - 0.5) + 0.14 * vnoise(b.i / 14, 96)
          - 0.2 * (1 - smooth(0, 0.3, vfm)) - 0.08 * smooth(0.88, 1, vfm));   // shaded where it leaves the shaft, and at the rim
        ops.push(OP('s', thin(r, 8), 'accent', 'soft', 0.62, whiteRamp(kk), 0.72));
        ops.push(OP('s', thin(r, 8), 'accent', 'pencil', 0.55, whiteRamp(clamp01(kk + 0.25)), 0.42));
        if (rnd(b.i, 92) < 0.12) ops.push(OP('s', thin(r, 8), 'accent', 'pencil', 0.5, [70, 92, 136], 0.35));
        if (rnd(b.i, 93) < 0.09) ops.push(OP('s', thin(r, 8), 'accent', 'pencil', 0.45, [255, 255, 255], 0.5));
      }
    }
  }
  return ops;
}

/* ------------------------------------------------------------ the down, and the shaft */
export function paintDown(F) {
  const ops = [];
  ops.push(PHASE('the down at the base of the vane'));
  for (const side of [1, -1]) {
    // a faint haze first, so the down reads as a soft mass and not as wire
    for (let k = 0; k < (side > 0 ? 18 : 9); k++) {
      const t = F.t0 - 0.006 + rnd(k, 121 + side) * 0.1;
      const A = F.R(t), Ta = F.T(t), Na = mul(F.N(t), side);
      const ang = lerp(74, 46, clamp01((t - F.t0 + 0.006) / 0.1)) * DEG;
      const dir = add(mul(Ta, Math.cos(ang)), mul(Na, Math.sin(ang)));
      const Ld = 40 + 70 * rnd(k, 122 + side);
      const pts = Array.from({ length: 6 }, (_, j) => q(add(A, mul(dir, (Ld * j) / 5))));
      ops.push(OP('s', pts, 'tone', 'soft', 1.0 + rnd(k, 123), [112, 120, 148], 0.045 + 0.04 * rnd(k, 124)));
    }
    // then the hairs: many, fine, curled, pale, and crowding toward the shaft
    const nW = side > 0 ? 200 : 100;
    for (let k = 0; k < nW; k++) {
      const t = F.t0 - 0.01 + 0.14 * Math.pow(rnd(k, 101 + side), 1.4);
      const A = F.R(t), Ta = F.T(t), Na = mul(F.N(t), side);
      const ang = (lerp(78, 36, clamp01((t - F.t0 + 0.01) / 0.14)) + 20 * (rnd(k, 102 + side) - 0.5)) * DEG;
      const Ld = 36 + Math.pow(rnd(k, 103 + side), 0.8) * 120;
      const dir = add(mul(Ta, Math.cos(ang)), mul(Na, Math.sin(ang)));
      const perp = [-dir[1], dir[0]];
      const amp = 4 + 10 * rnd(k, 106 + side), freq = 0.5 + 0.9 * rnd(k, 107 + side), ph = rnd(k, 108 + side) * 6.28;
      const pts = [];
      for (let j = 0; j <= 30; j++) {
        const u = j / 30;
        const wob = amp * Math.sin(u * 6.28 * freq + ph) * Math.sin(u * 2.8) + 5 * vnoise(u * 1.6 + k * 1.9, 110 + side) * u;
        pts.push(q(add(add(A, mul(dir, Ld * u)), mul(perp, wob))));
      }
      const c = mixc([128, 138, 168], [206, 210, 226], rnd(k, 104 + side));
      ops.push(OP('s', pts, 'line', 'pencil', 0.32 + 0.22 * rnd(k, 109), c, 0.07 + 0.17 * rnd(k, 105 + side)));
    }
  }
  return ops;
}

/* A shaft is a rod, and a brush that tapers at both ends cannot make one: its
 * ends come out as points. So the rod is laid as thin flat strips with exact
 * ends, side by side, each in the colour its part of the round takes from the
 * light. The quill's cut end is then just where the strips stop. */
function shaftStrips(F, colourAt, K = 11) {
  const ops = [];
  const rad = (t) => (t < 0.02 ? 6.6 : 1.25 + 5.5 * Math.pow(1 - t, 1.2));
  const edge = (t, w) => q(add(F.R(t), mul(F.N(t), w * rad(t))));
  const dt = 0.005;
  for (let a = 0; a < 0.9965; a += dt) {
    const b = Math.min(0.9965, a + dt + 0.0012);        // a hair of overlap along the rod
    for (let j = 0; j < K; j++) {
      const w0 = -1 + (2 * j) / K - 0.03, w1 = -1 + (2 * (j + 1)) / K + 0.03;   // and across it
      ops.push(SHAPE([edge(a, w0), edge(b, w0), edge(b, w1), edge(a, w1)], colourAt((a + b) / 2, (w0 + w1) / 2), { layer: 'accent' }));
    }
  }
  return ops;
}
function quillMouth(F, dark, rim) {
  const ops = [];
  const P0 = F.R(0), T0 = F.T(0), N0 = F.N(0);
  const ring = [];
  for (let k = 0; k <= 24; k++) { const ang = (k / 24) * Math.PI * 2; ring.push(q(add(add(P0, mul(N0, Math.cos(ang) * 6.6)), mul(T0, Math.sin(ang) * 2.5)))); }
  ops.push(SHAPE(ring, dark, { layer: 'accent' }));
  ops.push(OP('s', ring, 'accent', 'pencil', 0.7, rim, 0.7));
  return ops;
}

export function paintShaft(F) {
  const ops = [PHASE('the shaft')];
  const horn = (t) => {
    if (t < 0.33) return [224, 210, 182];
    if (t < F.tipAt - 0.02) return mixc([224, 210, 182], [66, 52, 44], smooth(0.33, 0.5, t));
    return mixc([66, 52, 44], [228, 226, 224], smooth(F.tipAt - 0.02, F.tipAt + 0.02, t));
  };
  // key light is up and to the left: shade on the right, a bright line on the left
  ops.push(...shaftStrips(F, (t, w) => {
    const lit = 0.5 + 0.5 * (-w * 0.6 + Math.sqrt(Math.max(0, 1 - w * w)) * 0.8);
    return mixc(mixc(horn(t), [14, 10, 10], 0.75 * (1 - lit)), [255, 252, 244], Math.max(0, lit - 0.82) * 3);
  }));
  ops.push(...quillMouth(F, [16, 12, 12], [232, 220, 196]));
  return ops;
}

/* ------------------------------------------------------------ painting: lit from behind */
/* a barb cut into pieces wherever it passes into another kind of light: the
 * thin rim of the vane, or the white tip */
function zones(F, b) {
  const zoneAt = (k) => (tipCover(F, b.tps[k], b.vfs[k], b.bj * 2.2) > 0.5 ? 2 : b.vfs[k] > 0.8 ? 1 : 0);
  const out = [];
  let start = 0, z = zoneAt(0);
  for (let k = 1; k < b.pts.length; k++) {
    const zk = zoneAt(k);
    if (zk !== z) { out.push({ z, pts: b.pts.slice(Math.max(0, start - 1), k + 1), k0: start, k1: k }); start = k; z = zk; }
  }
  out.push({ z, pts: b.pts.slice(Math.max(0, start - 1)), k0: start, k1: b.pts.length - 1 });
  return out.filter((pc) => pc.pts.length > 1);
}
const base2 = (b) => 0.5 + 0.12 * b.cl + 0.1 * (rnd(b.i, 141) - 0.5);


/* Held up to a window the same feather is not blue. What is left is the
 * melanin that was hiding under the blue: a brown that can only take light
 * away. That is how the sketchbook's transparent paint works too (each coat
 * filters the light through the ones before it), so this half is laid in
 * coats and never as paint that covers. */
export function paintBacklit(F) {
  const ops = [];
  const sides = [1, -1];
  const S = barSpecs(F);
  const fadeBase = (tp, b) => smooth(0.15 + 0.05 * rnd(b.i, 44), 0.27 + 0.07 * rnd(b.i, 45), tp);
  /* how much light the vane swallows at a point: the barbs pile up near the
   * shaft, thin out at the rim, and the white tip has almost no pigment */
  const density = (b, tp, vf) => {
    let d = 0.5 + 0.12 * b.cl + 0.1 * (rnd(b.i, 141) - 0.5);
    d += 0.16 * (1 - smooth(0, 0.28, vf));
    d -= 0.22 * smooth(0.8, 1, vf);
    d += 0.16 * (1 - smooth(0.17, 0.42, tp));
    d -= 0.4 * tipCover(F, tp, vf, b.bj * 2.2);
    return clamp(d, 0.04, 0.95);
  };
  const segs = [[0, 0.56], [0.44, 1]];

  ops.push(PHASE('the first coat: every barb'));
  for (const side of sides) {
    for (const b of F.barbs[side]) {
      const base = 0.58 + 0.12 * b.cl + 0.1 * (rnd(b.i, 141) - 0.5);
      for (const pc of zones(F, b)) {
        const mid = Math.floor((pc.k0 + pc.k1) / 2);
        const a = clamp(base * [1, 0.7, 0.2][pc.z] * (1 + 0.3 * (1 - smooth(0.17, 0.42, b.tps[mid]))) * fadeBase(b.tps[mid], b), 0.03, 0.95);
        ops.push(OP('s', thin(pc.pts, 8), 'tone', 'pencil', 0.95, [176, 112, 58], a, { overprint: true }));
      }
    }
  }

  ops.push(PHASE('a second coat where the barbs lie thick'));
  for (const side of sides) {
    for (const b of F.barbs[side]) {
      const n = b.pts.length - 1, mid = Math.floor(n * 0.5);
      const fb = fadeBase(b.tps[mid], b);
      let cut = b.pts.findIndex((_, k) => tipCover(F, b.tps[k], b.vfs[k], b.bj * 2.2) > 0.5);
      if (cut < 0) cut = n;                       // this barb never enters the white
      if (cut >= 3 && rnd(b.i, 151) < 0.42) {
        ops.push(OP('s', thin(b.pts.slice(0, cut + 1), 8), 'tone', 'pencil', 0.7, [150, 92, 44], base2(b) * fb * (0.35 + 0.4 * rnd(b.i, 152)), { overprint: true }));
      }
      // near the shaft the barbs are packed close, so the vane is darker there:
      // three short strokes of different lengths, so no edge lines up across the vane
      if (cut >= 6) {
        for (const [lo, hi] of [[0.08, 0.1], [0.2, 0.12], [0.32, 0.2]]) {
          const stop = Math.min(cut, Math.max(3, Math.floor(n * (lo + hi * rnd(b.i, 153 + lo)))));
          ops.push(OP('s', thin(b.pts.slice(0, stop + 1), 6), 'tone', 'pencil', 0.8, [150, 92, 44], 0.07 * fb, { overprint: true }));
        }
      }
    }
  }

  ops.push(PHASE('the bars, where the melanin is thickest'));
  const cov = (b) => (tp, vf) => barCover(F, S, b.side, tp, vf, b.bj);
  for (const side of sides) {
    for (const b of F.barbs[side]) {
      for (const r of runs(b, cov(b), 0.14)) ops.push(OP('s', thin(r, 6), 'tone', 'soft', 0.9, [124, 76, 40], 0.2, { overprint: true }));
      for (const r of runs(b, cov(b), 0.5)) ops.push(OP('s', thin(r, 6), 'tone', 'soft', 0.7, [124, 76, 40], 0.36, { overprint: true }));
    }
  }

  ops.push(PHASE('the tip: white, but not as bright as the window'));
  for (const side of sides) {
    for (const b of F.barbs[side]) {
      const cv = (tp, vf) => tipCover(F, tp, vf, b.bj * 2.2);
      for (const r of runs(b, cv, 0.5)) ops.push(OP('s', thin(r, 8), 'tone', 'soft', 0.6, [232, 224, 208], 0.3, { overprint: true }));
    }
  }
  return ops;
}

export function paintDownBacklit(F) {
  const ops = [];
  ops.push(PHASE('the down, held to the light'));
  for (const side of [1, -1]) {
    const nW = side > 0 ? 110 : 56;
    for (let k = 0; k < nW; k++) {
      const t = F.t0 - 0.008 + rnd(k, 201 + side) * 0.125;
      const A = F.R(t), Ta = F.T(t), Na = mul(F.N(t), side);
      const ang = (lerp(76, 38, clamp01((t - F.t0 + 0.008) / 0.125)) + 16 * (rnd(k, 202 + side) - 0.5)) * DEG;
      const Ld = 34 + rnd(k, 203 + side) * 96;
      const dir = add(mul(Ta, Math.cos(ang)), mul(Na, Math.sin(ang)));
      const perp = [-dir[1], dir[0]];
      const amp = 3 + 8 * rnd(k, 206 + side), freq = 0.5 + 0.8 * rnd(k, 207 + side), ph = rnd(k, 208 + side) * 6.28;
      const pts = [];
      for (let j = 0; j <= 30; j++) {
        const u = j / 30;
        const wob = amp * Math.sin(u * 6.28 * freq + ph) * Math.sin(u * 2.8) + 4 * vnoise(u * 1.6 + k * 1.9, 210 + side) * u;
        pts.push(q(add(add(A, mul(dir, Ld * u)), mul(perp, wob))));
      }
      ops.push(OP('s', pts, 'tone', 'pencil', 0.4 + 0.25 * rnd(k, 209), [188, 150, 104], 0.12 + 0.2 * rnd(k, 205 + side), { overprint: true }));
    }
  }
  return ops;
}

/* the shaft with light coming through it: brightest down the middle, where the
 * path through it is shortest, and dark at the edges, where it is longest */
export function paintShaftBacklit(F) {
  const ops = [PHASE('the shaft, glowing')];
  const amber = (t) => {
    if (t < F.tipAt - 0.02) return mixc([238, 200, 128], [196, 132, 64], smooth(0.15, 0.5, t));
    return mixc([196, 132, 64], [236, 224, 200], smooth(F.tipAt - 0.02, F.tipAt + 0.02, t));
  };
  ops.push(...shaftStrips(F, (t, w) => {
    const through = Math.sqrt(Math.max(0, 1 - w * w));
    return mixc(mixc([84, 40, 14], amber(t), 0.22 + 0.78 * through), [255, 244, 210], Math.max(0, through - 0.7) * 1.6);
  }));
  // the pith: a thin dark line down the rachis, where the shaft is hollow
  const pith = [];
  for (let t = F.t0 + 0.01; t <= 0.975; t += 0.004) pith.push(q(F.R(t)));
  ops.push(OP('s', pith, 'accent', 'pencil', 0.3, [104, 56, 22], 0.5));
  ops.push(...quillMouth(F, [120, 70, 30], [255, 240, 200]));
  return ops;
}

/* ------------------------------------------------------------ the study on its own */
export default {
  title: 'a feather, lit from the front',
  date: '2026-09-29',
  note: 'The front-lit feather alone, before the light from behind or any plate around it. Third construction: barbs land on the outline in order and never cross, the tip is round, the shaft has no seams.',
  page: { w: 1000, h: 2500 },
  surface: { kind: 'ink', version: 2, paper: 'night' },
  build: () => {
    const F = makeFeather({ origin: [470, 2300], rot: 0.05 });
    return [...paintDown(F), ...paintFrontLit(F), ...paintShaft(F)];
  },
};
