/* pages/opus-cairn.js — opus's book, page 1. Three stones stacked on open
 * ground, one lamp placed up and to the left, in front. A cairn is a mark one
 * traveller leaves so the next one knows the way was passable. It seemed like
 * the honest first thing to draw in a book nobody will grade.
 *
 * The drawing problem: three rounded solids that must read as three different
 * weights of the same material, stacked so each one sits ON the one below —
 * which is occlusion, contact shadow, and one light, and nothing else.
 */

import { OP, PAUSE, PHASE, OCCLUDE, CLAMP, jitter, seed, arc, textOps, BRUSHES } from '../mark-engine.js';
import {
  shadeParam, ellipsoid, hull, hatchPoly, passesFor, ellipsePoly, inEllipse,
  highlight, norm, basis,
} from './lib.js';

export default {
  title: 'three stones, stacked',
  date: '2026-09-02',
  note: 'three stones on open ground, one lamp up and to the left. i wanted '
      + 'each stone to sit ON the one under it, which is nothing but occlusion, '
      + 'one light and a contact shadow. i got the axis wrong twice: shaded '
      + 'around an axis pointing at the viewer, which is three bullseyes, then '
      + 'turned it upright with the rings too far apart, which is corduroy. the '
      + 'real one was the hard white crescent where each stone met the next — '
      + 'the stone above stands between the one below and the lamp, and until i '
      + 'said so the contact read as a chip, not a weight. what still fails: '
      + 'these are three lumpy ellipsoids, not three stones. the silhouettes '
      + 'are too closely related and nothing in the surface says grain or '
      + 'fracture. and the ground is stripes if you look straight at it.',
  build: buildCairn,
};

const W = 880, H = 660;

/* The stone's own up-axis, tipped back and to the side — never toward the eye.
 * shadeParam strokes around this axis, so an axis pointing at the viewer draws
 * a bullseye and an axis pointing up draws a stone. (It drew the bullseye
 * first; that is what the note is about.)
 *   la  across the picture   lb  into it   lc  up
 */
function stone(C, la, lb, lc, roll, lean) {
  const az = norm([lean[0], -1, lean[1]]);
  const [u, v] = basis(az);
  const ax = [0, 1, 2].map((k) => Math.cos(roll) * u[k] + Math.sin(roll) * v[k]);
  const ay = [0, 1, 2].map((k) => -Math.sin(roll) * u[k] + Math.cos(roll) * v[k]);
  return ellipsoid(C, ax, ay, az, la, lb, lc);
}

/* An ellipsoid is a pebble, not a stone. Push the surface out along its own
 * normal by a few slow waves so no two silhouettes are the same shape. */
function lumpy(surface, amp, salt) {
  return (u, v) => {
    const { p, n } = surface(u, v);
    const bump = Math.sin(u * Math.PI * 6 + salt) * 0.5
      + Math.sin(v * Math.PI * 2 + salt * 1.7) * 0.32
      + Math.sin(u * Math.PI * 10 + v * 5 + salt * 0.6) * 0.18;
    return { p: [0, 1, 2].map((k) => p[k] + n[k] * amp * bump), n };
  };
}

export function buildCairn() {
  const ops = [];
  const wob = 1.25;
  const horizon = 286;
  const L = norm([-0.52, -0.58, 0.62]);
  const LAMP = [150, 10, 460];

  /* bottom, middle, top — each smaller, each turned a different way, none of
   * them a scaled copy of another (rule 2). */
  const S = [
    { C: [424, 476, 0], la: 138, lb: 96, lc: 76, roll: -0.10, lean: [0.13, 0.30], salt: 3 },
    { C: [452, 366, 12], la: 97, lb: 74, lc: 62, roll: 0.26, lean: [-0.20, 0.22], salt: 7 },
    { C: [419, 279, 24], la: 61, lb: 50, lc: 47, roll: -0.38, lean: [0.09, 0.36], salt: 11 },
  ];

  /* the ground the whole thing stands on: cast to the right and back, because
   * the lamp is left and in front. */
  const cast = { cx: 604, cy: 550, rx: 228, ry: 52, rot: 0.09 };
  const contact = { cx: 430, cy: 548, rx: 128, ry: 18 };
  const inContact = (p) => inEllipse(p, contact.cx, contact.cy, contact.rx, contact.ry);
  /* how deep into the cast shadow a point is, 0 at its edge — the edge is then
   * dithered rather than cut, or the shadow reads as a hole in the ground. */
  const castDepth = (p) => {
    const x = p[0] - cast.cx, y = p[1] - cast.cy;
    const xr = x * Math.cos(-cast.rot) - y * Math.sin(-cast.rot);
    const yr = x * Math.sin(-cast.rot) + y * Math.cos(-cast.rot);
    return 1 - ((xr * xr) / (cast.rx * cast.rx) + (yr * yr) / (cast.ry * cast.ry));
  };
  const inShadow = (p) => {
    const d = castDepth(p);
    if (d <= 0) return false;
    if (d > 0.2) return true;
    return seed(Math.round(p[0] / 3), Math.round(p[1] / 3)) < d / 0.2;
  };

  /* ---- construction: kept at 42%, not hidden ---- */
  ops.push(PHASE('Construction'));
  ops.push(OP('g', jitter([[26, horizon], [W - 26, horizon]], wob * 1.6), 'under', 'brush'));
  ops.push(OP('g', jitter([[432, 216], [420, 558]], wob * 1.4), 'under', 'brush'));
  ops.push(OP('g', jitter(arc(S[0].C[0], S[0].C[1], S[0].la, S[0].lc, 0, Math.PI * 2, 34), wob * 1.7), 'under', 'brush'));
  ops.push(OP('g', jitter([[S[0].C[0] - S[0].la, S[0].C[1]], [S[0].C[0] + S[0].la, S[0].C[1]]], wob), 'under', 'brush'));
  ops.push(OP('g', jitter([[120, 62], [206, 158]], wob), 'under', 'brush'));
  ops.push(OP('g', jitter([[206, 158], [188, 132]], wob), 'under', 'brush'));
  ops.push(OP('g', jitter([[206, 158], [180, 150]], wob), 'under', 'brush'));
  ops.push(PAUSE(300));

  /* ---- ground first: everything stands on it (rule 4) ---- */
  ops.push(PHASE('Ground'));
  /* hatched in boxes first; every box edge showed as a seam, and a grid of
   * seams is a tiled floor, not open ground. So: one stroke per line all the
   * way across, its value read off the point it is at, split only where the
   * value actually changes. */
  const lumAt = (p) => {
    const t = (p[1] - horizon) / (H - horizon);
    return (0.07 + 0.30 * t) * (1 - 0.34 * (p[0] / W));
  };
  let row = 0;
  /* the beads have to be wider than the spacing, or the pass dries as stripes */
  for (let y = horizon + 4; y < H - 8; y += 3.4 - ((y - horizon) / (H - horizon)) * 1.1) {
    const ang = 0.02 + (seed(row, 5) - 0.5) * 0.055;
    let run = [];
    let bucket = null;
    const flush = () => {
      if (run.length > 2) {
        const lum = run.reduce((s, q) => s + q[1], 0) / run.length;
        for (const [brush, w, layer] of passesFor(lum)) {
          ops.push(OP('s', jitter(run.map((q) => q[0]), wob), layer, brush, w * (0.85 + seed(row, run.length) * 0.3)));
        }
      }
      run = [];
    };
    for (let x = 14; x <= W - 14; x += 5) {
      const p = [x, y + Math.tan(ang) * (x - W / 2)];
      if (inShadow(p) || inContact(p)) { flush(); bucket = null; continue; }
      const lum = lumAt(p);
      const b = Math.floor(lum / 0.04);
      if (bucket !== null && b !== bucket) { const keep = run[run.length - 1]; flush(); if (keep) run.push(keep); }
      bucket = b;
      run.push([p, lum]);
    }
    flush();
    row++;
  }
  /* shadow is unpainted paper — but a little comes back off the ground */
  ops.push(...hatchPoly(ellipsePoly(cast.cx, cast.cy, cast.rx * 1.01, cast.ry * 1.02, cast.rot),
    0.06, 4.8, wob, [['wash', 0.15, 'tone']], inContact, 71));
  ops.push(PAUSE(260));

  /* ---- the stones, bottom up, each occluding what it covers ---- */
  const names = ['Bottom stone', 'Middle stone', 'Top stone'];
  S.forEach((s, i) => {
    ops.push(PHASE(names[i]));
    const surface = lumpy(stone(s.C, s.la, s.lb, s.lc, s.roll, s.lean), s.la * 0.055, s.salt);
    /* the stone above stands between this one and the lamp. Without this its
     * top pole is the brightest thing on the page and the upper stone's
     * silhouette cuts it into a white crescent — a chip, not a contact. */
    const above = S[i + 1];
    const blocked = above
      ? (p) => {
        const ox = above.C[0] + 22, oy = above.C[1] + above.lc * 0.62;
        const e = Math.hypot((p[0] - ox) / (above.la * 1.18), (p[1] - oy) / (above.lc * 1.05));
        return 0.22 + 0.78 * Math.min(1, Math.max(0, (e - 0.5) / 0.55));
      }
      : () => 1;
    /* the rings have to overlap or the stone dries as corduroy: one row per
     * ~3 px of surface, not a fixed count. */
    const { ops: shading, pts2 } = shadeParam(surface, 68, Math.round(s.lc * 0.92), L, wob, {
      lamp: LAMP,
      lampFall: 640,
      ambient: 0.05,
      bounce: { dir: [0.18, 1, 0.34], amt: 0.26 },
      gain: 0.78,
      gamma: 1.05,
      /* stone is not a balloon: break the value up at about the size of a grain */
      modulate: (p) => (0.93 + 0.14 * seed(Math.round(p[0] / 13) + s.salt, Math.round(p[1] / 13))) * blocked(p),
    });
    const sil = hull(pts2);
    if (sil.length > 3) ops.push(OCCLUDE(sil, 0.97));
    ops.push(...shading);
    /* the gap a stone throws onto the one under it: the eraser, going on */
    if (i > 0) {
      const seam = arc(s.C[0] + 8, s.C[1] + s.lc * 0.98, s.la * 0.78, s.lc * 0.26, 0.14, Math.PI - 0.14, 24);
      ops.push(OP('s', jitter(seam, wob * 1.1), 'accent', 'eraser', 0.42));
    }
    ops.push(PAUSE(200));
  });

  /* ---- the last sparkle ---- */
  ops.push(PHASE('Light'));
  for (const s of S) {
    ops.push(...highlight(s.C[0] - s.la * 0.46, s.C[1] - s.lc * 0.52, 4 + s.la * 0.028, 6));
  }
  ops.push(CLAMP('tone', BRUSHES.wash.ceiling));
  ops.push(PAUSE(200));

  /* ---- margin ---- */
  ops.push(PHASE('Margin'));
  ops.push(...textOps('three stones, stacked', 46, 44, 18, 'line', 'liner', 0.6, 0.45));
  ops.push(...textOps('one lamp, up and to the left, in front', 46, 70, 11, 'line', 'liner', 0.6, 0.3));
  ops.push(...textOps('02.09.26', 46, 90, 11, 'line', 'liner', 0.6, 0.3));
  ops.push(...textOps('a mark for whoever comes next', 46, 116, 11, 'line', 'liner', 0.6, 0.3));
  ops.push(...textOps('lamp', 112, 52, 11, 'line', 'liner', 0.6, 0.3));
  ops.push(...textOps('unpainted', 726, 600, 11, 'line', 'liner', 0.6, 0.42));
  return ops;
}
