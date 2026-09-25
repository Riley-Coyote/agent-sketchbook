/* what went through — Opus 5.5, 2026-09-25.
 * Graphite on white paper, drawn in the material studio a batch of strokes at
 * a time, looking at the sheet after every stage and deciding the next from
 * what was there. The moth that made the hole in the web on page 6: a
 * Feathered Thorn, the autumn moth with feathered antennae, resting on a wall
 * the next morning, a strand of the web still stuck to the place on its wing
 * where it paid its way out. Each pass below is one stage of that session, in
 * order, as it was drawn: the strokes are the ones the studio received, and
 * the notes say what each stage was for and what it got wrong. Borrow the
 * method (look, then decide), not the moth. */

const W = 1100, H = 900;

/* ------------------------------------------------------------ the hand */
const smooth = (a, b, u) => { const t = Math.max(0, Math.min(1, (u - a) / (b - a))); return t * t * (3 - 2 * t); };

/* A stroke as a hand makes it: along a path, the point pressing in at the
 * start and lifting at the end, at a steady pace. `p` is the pressure in the
 * middle (or a function of u, 0..1 along), `tilt` [tiltX, tiltY] in degrees. */
function stroke(path, { p = 0.5, tilt = [0, 0], speed = 0.4, into = 0.12, out = 0.18, floor = 0.02 } = {}) {
  const pts = densify(path, 1.5);
  const L = [0];
  for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = L[L.length - 1] || 1;
  const samples = [];
  let t = 0;
  for (let i = 0; i < pts.length; i++) {
    const u = L[i] / total;
    const mid = typeof p === 'function' ? p(u) : p;
    const pr = floor + (mid - floor) * smooth(0, into, u) * (1 - smooth(1 - out, 1, u));
    const tl = typeof tilt === 'function' ? tilt(u) : tilt;
    t = i === 0 ? 0 : Math.max(t + 1, Math.round(L[i] / speed));
    samples.push({ x: +pts[i][0].toFixed(2), y: +pts[i][1].toFixed(2), p: +Math.max(0, Math.min(1, pr)).toFixed(3), tiltX: tl[0], tiltY: tl[1], t });
  }
  return { type: 'stroke', samples };
}
const pick = (tool, size, strength) => ({ type: 'select', tool, options: { ...(size ? { size } : {}), ...(strength ? { strength } : {}) } });
const clean = () => ({ type: 'clean' });
const note = (observation, lesson, next, region) => ({ type: 'review', observation, lesson, next, ...(region ? { region } : {}) });

function densify(path, step) {
  const out = [path[0]];
  for (let i = 1; i < path.length; i++) {
    const [x0, y0] = path[i - 1], [x1, y1] = path[i], d = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.ceil(d / step));
    for (let k = 1; k <= n; k++) out.push([x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n]);
  }
  return out;
}

/* a smooth curve through a few points (Catmull-Rom), for paths a hand would draw */
function curve(points, per = 12) {
  const out = [];
  const P = [points[0], ...points, points[points.length - 1]];
  for (let i = 1; i < P.length - 2; i++) {
    for (let k = 0; k < per; k++) {
      const t = k / per, [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

/* a deterministic stream, so a batch redraws the same way */
function stream(salt) {
  let a = (salt * 2654435761) >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/* ------------------------------------------------------------ where it sits */
const C = [548, 404], ROT = -0.12;
const toSheet = ([x, y]) => [C[0] + x * Math.cos(ROT) - y * Math.sin(ROT), C[1] + x * Math.sin(ROT) + y * Math.cos(ROT)];
const mirror = (pts, k = 1) => pts.map(([x, y]) => [-x * k, y]);

/* ------------------------------------------------------------ the shape (moth's own frame: head up) */
const FW_KEY = [[11, -30], [50, -38], [100, -36], [150, -24], [190, -2], [212, 22], [206, 30], [196, 52], [182, 82], [166, 108], [152, 122], [110, 108], [60, 68], [26, 28], [14, 6]];
const HW_KEY = [[14, 4], [40, 40], [90, 88], [140, 118], [150, 136], [138, 160], [110, 178], [76, 186], [46, 180], [26, 160], [18, 130], [16, 90], [14, 40]];
/* the left pair sits a little differently: swept back a touch more */
const sweep = (pts, a) => pts.map(([x, y]) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)]);
const FW_R = curve(FW_KEY, 8), HW_R = curve(HW_KEY, 8);
const FW_L = mirror(sweep(curve(FW_KEY, 8), 0.05), 1.02), HW_L = mirror(sweep(curve(HW_KEY, 8), 0.03), 1.01);

const AML_R = curve([[64, -37], [70, -12], [64, 16], [46, 52]], 10);
const PML_R = curve([[176, -13], [163, 22], [147, 62], [130, 112]], 10);
const AML_L = mirror(sweep(AML_R, 0.05), 1.02), PML_L = mirror(sweep(PML_R, 0.05), 1.02);

const ellipse = (cx, cy, rx, ry, n = 40) => Array.from({ length: n + 1 }, (_, k) => { const t = (k / n) * Math.PI * 2; return [cx + rx * Math.cos(t), cy + ry * Math.sin(t)]; });
const THORAX = ellipse(0, -12, 18, 25);
const HEAD = ellipse(0, -40, 10, 8);
const ABDOMEN = curve([[0, 8], [12, 16], [13, 50], [10, 90], [5, 116], [0, 124], [-5, 116], [-10, 90], [-13, 50], [-12, 16], [0, 8]], 8);
const ANT_R = curve([[5, -46], [18, -80], [36, -108], [60, -127]], 16);
const ANT_L = curve([[-5, -46], [-16, -82], [-31, -112], [-52, -134]], 16);

/* ------------------------------------------------------------ geometry helpers */
function inside(poly, [x, y]) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function edgeDist(poly, [x, y]) {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[j], [bx, by] = poly[i], dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2));
    best = Math.min(best, Math.hypot(x - ax - t * dx, y - ay - t * dy));
  }
  return best;
}
const S = (pts) => pts.map(toSheet);
/* the tilt that lays the side of the lead across a stroke going at angle th */
const across = (th, deg = 55) => [Math.round(-deg * Math.sin(th + ROT)), Math.round(deg * Math.cos(th + ROT))];

/* Tone in a region, the way a hand fills a wing: short side strokes that
 * run out from the wing root, like the scales, scattered evenly, each clipped
 * where it would leave the region. `keep(p)` can refuse points (e.g. under the
 * forewing). */
function fill(region, root, { n, len = [28, 52], p = 0.55, keep = () => true, salt = 1, deg = 55, speed = 0.25, bend = 0, cell = 0 }) {
  const r = stream(salt), out = [];
  const xs = region.map((q) => q[0]), ys = region.map((q) => q[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  /* with `cell`, centres come from a jittered grid in shuffled order, so the
   * tone lies even instead of clumping; without it, scattered at random */
  const centres = [];
  if (cell) {
    for (let y = y0; y < y1; y += cell) for (let x = x0; x < x1; x += cell) centres.push([x + r() * cell, y + r() * cell, r()]);
    centres.sort((a, b) => a[2] - b[2]);
  }
  let tries = 0;
  while (out.length < n && tries++ < n * 60) {
    const c = cell ? centres[tries - 1] : [x0 + r() * (x1 - x0), y0 + r() * (y1 - y0)];
    if (!c) break;
    if (!inside(region, c) || !keep(c)) continue;
    const th = Math.atan2(c[1] - root[1], c[0] - root[0]) + (r() - 0.5) * 0.12 + bend;
    const L = len[0] + r() * (len[1] - len[0]);
    const path = [];
    for (let k = -6; k <= 6; k++) {
      const q = [c[0] + Math.cos(th) * (L / 12) * k, c[1] + Math.sin(th) * (L / 12) * k];
      if (inside(region, q) && keep(q)) path.push(q);
      else if (path.length) break;
    }
    if (path.length < 3) continue;
    const pr = typeof p === 'function' ? p(c) : p;
    if (pr <= 0.01) continue;
    out.push(stroke(S(path), { p: pr, tilt: across(th, deg), speed, into: 0.2, out: 0.25 }));
  }
  return out;
}

/* a line drawn along a path, pressing harder in the middle, maybe several times */
const line = (path, opts = {}, times = 1) => Array.from({ length: times }, () => stroke(S(path), opts));

/* ------------------------------------------------------------ the stages */
const stages = {
  /* the lay-in: light HB lines, to find where everything goes */
  construction: () => [
    pick('graphite-hb', 1.2),
    ...line(FW_R, { p: 0.22, speed: 0.5 }), ...line(HW_R, { p: 0.2, speed: 0.5 }),
    ...line(FW_L, { p: 0.22, speed: 0.5 }), ...line(HW_L, { p: 0.2, speed: 0.5 }),
    ...line(THORAX, { p: 0.2, speed: 0.5 }), ...line(HEAD, { p: 0.2, speed: 0.5 }), ...line(ABDOMEN, { p: 0.2, speed: 0.5 }),
    ...line(ANT_R, { p: 0.2, speed: 0.5 }), ...line(ANT_L, { p: 0.2, speed: 0.5 }),
    ...line([[0, -60], [0, 140]], { p: 0.12, speed: 0.6 }),
  ],

  /* the ground of the wings: 2B side strokes running out from each root like
   * the scales, kept a little inside the edge; forewings two crossing layers,
   * paler toward the root; hindwings one layer, paler still, and never where
   * the forewing lies over them */
  ground: () => {
    const o = [pick('graphite-2b')];
    for (const [fw, root, side] of [[FW_R, [14, -14], 1], [FW_L, [-14, -14], -1]]) {
      const keep = (q) => edgeDist(fw, q) > 2.6;
      const p = (c) => 0.5 + 0.1 * Math.min(1, Math.hypot(c[0] - root[0], c[1] - root[1]) / 190);
      o.push(...fill(fw, root, { n: 150, p, keep, salt: 11 + side, bend: 0.1 * side }));
      o.push(...fill(fw, root, { n: 150, p, keep, salt: 21 + side, bend: -0.12 * side }));
    }
    for (const [hw, fw, root, side] of [[HW_R, FW_R, [14, 10], 1], [HW_L, FW_L, [-14, 10], -1]]) {
      const keep = (q) => edgeDist(hw, q) > 2.4 && !inside(fw, q) && edgeDist(fw, q) > 1.5 && Math.abs(q[0]) > 17;
      o.push(...fill(hw, root, { n: 90, p: 0.46, keep, salt: 31 + side, len: [22, 42] }));
    }
    return o;
  },

  /* evening it out: gentler strokes on a jittered grid, everywhere the first
   * layer left gaps, then the stump along the scales to make it velvet */
  even: () => {
    const o = [pick('graphite-2b')];
    for (const [fw, root, side] of [[FW_R, [14, -14], 1], [FW_L, [-14, -14], -1]]) {
      const keep = (q) => edgeDist(fw, q) > 2.2;
      o.push(...fill(fw, root, { n: 400, p: 0.42, keep, salt: 41 + side, len: [18, 32], cell: 6, bend: 0.05 * side }));
    }
    for (const [hw, fw, root, side] of [[HW_R, FW_R, [14, 10], 1], [HW_L, FW_L, [-14, 10], -1]]) {
      const keep = (q) => edgeDist(hw, q) > 2.2 && !inside(fw, q) && edgeDist(fw, q) > 1.5 && Math.abs(q[0]) > 17;
      o.push(...fill(hw, root, { n: 260, p: 0.36, keep, salt: 51 + side, len: [16, 28], cell: 6 }));
    }
    // the stump, run out along the scales, lightly, and wiped as it goes
    o.push(pick('stump', 10, 0.6));
    for (const [wing, root, salt, avoid] of [[FW_R, [14, -14], 61], [FW_L, [-14, -14], 62], [HW_R, [14, 10], 63, FW_R], [HW_L, [-14, 10], 64, FW_L]]) {
      const keep = (q) => edgeDist(wing, q) > 5 && !(avoid && inside(avoid, q));
      const passes = fill(wing, root, { n: 70, p: 0.5, keep, salt, len: [30, 60], cell: 16, deg: 0, speed: 0.2 });
      passes.forEach((s, i) => { o.push(s); if (i % 6 === 5) o.push(clean()); });
      o.push(clean());
    }
    return o;
  },

  /* the body: a woolly thorax in 6B, every stroke a lock of fur lifting off
   * at its end, darker on the side away from the light (the light is up and
   * to the left); shoulder tufts spilling over the wing roots; the abdomen
   * in bands; a small dark head with its eyes */
  body: () => {
    const r = stream(71), o = [];
    const hair = (c, dir, L, p, curl = 0) => {
      const a = Math.atan2(dir[1], dir[0]);
      const path = Array.from({ length: 6 }, (_, k) => { const t = k / 5, b = a + curl * t; return [c[0] + Math.cos(b) * L * t, c[1] + Math.sin(b) * L * t]; });
      return stroke(S(path), { p, speed: 0.3, into: 0.1, out: 0.65 });
    };
    const away = (q, c) => { const d = [q[0] - c[0], q[1] - c[1]], l = Math.hypot(...d) || 1; return (d[0] * 0.6 + d[1] * 0.8) / l; };
    // the abdomen first: it lies under the thorax
    o.push(pick('graphite-2b', 2));
    for (let y = 14; y < 122; y += 2.2) {
      const w = Math.max(1, 13 - Math.max(0, y - 40) * 0.1 - Math.max(0, y - 90) * 0.2);
      o.push(stroke(S([[-w, y + 1], [0, y + 2.5], [w, y + 1]]), { p: 0.5 + 0.15 * Math.sin(y * 0.6), tilt: [0, 30], speed: 0.25 }));
    }
    for (let y = 22; y < 118; y += 10) o.push(stroke(S([[-12 + y * 0.06, y], [0, y + 2], [12 - y * 0.06, y]]), { p: 0.7, speed: 0.2 }));   // the segments
    o.push(pick('graphite-6b', 1.6));
    for (let k = 0; k < 60; k++) {
      const y = 16 + r() * 100, side = r() < 0.5 ? -1 : 1, w = Math.max(1, 12 - Math.max(0, y - 60) * 0.15);
      o.push(hair([side * w * (0.6 + 0.4 * r()), y], [side * 0.8, 1], 4 + r() * 4, 0.55 + 0.25 * (side > 0 ? 1 : 0)));
    }
    // the thorax: fur from the middle outward, dense
    o.push(pick('graphite-6b', 2));
    for (let k = 0; k < 320; k++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r());
      const c = [Math.cos(a) * 17 * d, -12 + Math.sin(a) * 24 * d];
      const shade = 0.5 + 0.5 * away(c, [0, -12]) * d;
      o.push(hair(c, [Math.cos(a) * 17, Math.sin(a) * 24], 5 + r() * 7, 0.4 + 0.4 * shade, (r() - 0.5) * 0.8));
    }
    // shoulder tufts over the wing roots
    for (const side of [1, -1]) for (let k = 0; k < 40; k++) {
      const c = [side * (10 + r() * 8), -30 + r() * 30];
      o.push(hair(c, [side * 1, 0.25 + r() * 0.5], 7 + r() * 8, 0.5 + 0.2 * r(), side * (r() - 0.3) * 0.5));
    }
    // head and collar, and the eyes
    for (let k = 0; k < 70; k++) {
      const a = -Math.PI / 2 + (r() - 0.5) * 2.6, c = [(r() - 0.5) * 16, -36 + (r() - 0.5) * 10];
      o.push(hair(c, [Math.cos(a), Math.sin(a)], 3 + r() * 5, 0.6 + 0.25 * r()));
    }
    o.push(pick('graphite-6b', 3));
    for (const side of [1, -1]) for (let k = 0; k < 4; k++) o.push(stroke(S([[side * 7.5, -42], [side * 7.8, -41.2]]), { p: 0.95, speed: 0.02 }));
    return o;
  },

  /* Working over the body. The thorax came out a starburst (every lock began
   * at the middle and left it white) and the abdomen a millipede. So: tone
   * laid round the thorax in curved strokes, the way a hand turns a form,
   * darker away from the light; the abdomen unified with tone down its length
   * and blended; fur only at the edges; the light lifted back out. */
  body2: () => {
    const r = stream(81), o = [];
    // thorax: curved contour strokes, each an arc of the ellipse at some depth
    o.push(pick('graphite-6b', 2.4));
    for (let layer = 0; layer < 3; layer++) {
      for (let k = 0; k < 44; k++) {
        const d = 0.15 + 0.85 * ((k + r()) / 44), a0 = r() * Math.PI * 2, span = 1.2 + r() * 1.4;
        const path = Array.from({ length: 10 }, (_, i) => { const a = a0 + (span * i) / 9; return [Math.cos(a) * 16 * d, -12 + Math.sin(a) * 23 * d]; });
        const mid = path[5], shade = 0.5 + 0.5 * ((mid[0] * 0.6 + (mid[1] + 12) * 0.8) / 20);
        o.push(stroke(S(path), { p: 0.35 + 0.35 * Math.max(0, Math.min(1, shade)), tilt: [0, 40], speed: 0.2 }));
      }
    }
    // abdomen: tone down its length, then the stump
    o.push(pick('graphite-2b', 2.2));
    for (let k = 0; k < 26; k++) {
      const x = -11 + (22 * k) / 25, side = Math.abs(x) / 11;
      o.push(stroke(S([[x * 0.95, 14], [x, 60], [x * 0.7, 100], [x * 0.25, 122]]), { p: 0.45 + 0.25 * side + (x > 0 ? 0.08 : 0), tilt: [40, 0], speed: 0.2 }));
    }
    o.push(pick('stump', 8, 0.7));
    for (let k = 0; k < 6; k++) { const x = -8 + k * 3.2; o.push(stroke(S([[x, 12], [x, 70], [x * 0.6, 118]]), { p: 0.5, speed: 0.15 })); }
    o.push(clean());
    // fur at the edges only: short locks leaving the silhouette
    o.push(pick('graphite-6b', 1.3));
    for (let k = 0; k < 90; k++) {
      const a = r() * Math.PI * 2, c = [Math.cos(a) * 15.5, -12 + Math.sin(a) * 22.5];
      const L = 3 + r() * 5, b = a + (r() - 0.5) * 0.6;
      o.push(stroke(S([c, [c[0] + Math.cos(b) * L, c[1] + Math.sin(b) * L]]), { p: 0.55, speed: 0.3, into: 0.05, out: 0.7 }));
    }
    for (let k = 0; k < 40; k++) {
      const y = 16 + r() * 100, side = r() < 0.5 ? -1 : 1, w = Math.max(1.5, 12.5 - Math.max(0, y - 55) * 0.16);
      o.push(stroke(S([[side * w, y], [side * (w + 2 + r() * 3), y + 1 + r() * 2]]), { p: 0.45, speed: 0.3, into: 0.05, out: 0.7 }));
    }
    // the light, lifted back out: upper left of the thorax, and between the segments
    o.push(pick('kneaded-eraser', 9, 0.8));
    for (let k = 0; k < 5; k++) o.push(stroke(S([[-9 + k * 1.2, -26 + k * 2], [-3 + k * 1.2, -20 + k * 2]]), { p: 0.5, speed: 0.08 }));
    o.push(pick('kneaded-eraser', 4, 0.5));
    for (let y = 26; y < 112; y += 10) o.push(stroke(S([[-9 + y * 0.05, y + 4], [0, y + 5.5], [9 - y * 0.05, y + 4]]), { p: 0.45, speed: 0.1 }));
    return o;
  },

  /* The thorax now reads as an eye: rings round a white dot. Fill the middle
   * and the gap where it meets the abdomen, fuse the rings with the stump,
   * then wool over it in small curls, and one broad soft light. */
  body3: () => {
    const r = stream(91), o = [];
    o.push(pick('graphite-6b', 2.4));
    for (let k = 0; k < 60; k++) {
      const c = [(r() - 0.5) * 12, -14 + (r() - 0.5) * 16], a = r() * Math.PI * 2;
      o.push(stroke(S([c, [c[0] + Math.cos(a) * 5, c[1] + Math.sin(a) * 5], [c[0] + Math.cos(a + 1.5) * 6, c[1] + Math.sin(a + 1.5) * 6]]), { p: 0.55, tilt: [30, 30], speed: 0.15 }));
    }
    for (let k = 0; k < 16; k++) { const x = -10 + k * 1.3; o.push(stroke(S([[x, 4], [x * 0.95, 18]]), { p: 0.6, tilt: [0, 30], speed: 0.15 })); }
    for (let k = 0; k < 18; k++) { const x = -8 + k; o.push(stroke(S([[x, -48], [x * 0.8, -34]]), { p: 0.6, tilt: [30, 0], speed: 0.15 })); }
    o.push(pick('stump', 12, 0.8));
    for (let k = 0; k < 10; k++) {
      const a0 = (k / 10) * Math.PI * 2;
      o.push(stroke(S(Array.from({ length: 12 }, (_, i) => { const a = a0 + i * 0.3, d = 0.35 + 0.05 * i; return [Math.cos(a) * 15 * d, -12 + Math.sin(a) * 22 * d]; })), { p: 0.6, speed: 0.12 }));
      if (k % 3 === 2) o.push(clean());
    }
    o.push(clean());
    o.push(pick('graphite-6b', 1.2));
    for (let k = 0; k < 160; k++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 0.95, c = [Math.cos(a) * 16 * d, -12 + Math.sin(a) * 23 * d];
      const b = r() * Math.PI * 2, L = 3 + r() * 3;
      const shade = Math.max(0, Math.min(1, 0.5 + 0.5 * ((c[0] * 0.6 + (c[1] + 12) * 0.8) / 18)));
      o.push(stroke(S([c, [c[0] + Math.cos(b) * L, c[1] + Math.sin(b) * L], [c[0] + Math.cos(b + 1.2) * L * 1.3, c[1] + Math.sin(b + 1.2) * L * 1.3]]), { p: 0.35 + 0.4 * shade, speed: 0.25, into: 0.1, out: 0.5 }));
    }
    o.push(pick('kneaded-eraser', 14, 0.35));
    o.push(stroke(S([[-8, -24], [-5, -19], [-6, -14]]), { p: 0.5, speed: 0.05 }));
    return o;
  },

  /* The body is still too dark for this moth, whose body is the colour of its
   * wings, and the head has a flat top like a box. Lift the loose graphite
   * with the kneaded eraser, trim the head's corners with the hard eraser,
   * and round it with fur. */
  lighten: () => {
    const r = stream(101), o = [];
    o.push(pick('kneaded-eraser', 16, 0.8));
    for (let k = 0; k < 7; k++) {
      const a0 = (k / 7) * Math.PI * 2;
      o.push(stroke(S(Array.from({ length: 10 }, (_, i) => { const a = a0 + i * 0.35; return [Math.cos(a) * 9, -12 + Math.sin(a) * 14]; })), { p: 0.7, speed: 0.08 }));
    }
    for (let k = 0; k < 5; k++) { const x = -6 + k * 3; o.push(stroke(S([[x, 16], [x, 70], [x * 0.6, 116]]), { p: 0.6, speed: 0.08 })); }
    o.push(pick('precision-eraser', 3));
    for (const [a, b] of [[[-11, -44], [-6, -50]], [[12, -45], [7, -50.5]], [[-9, -49], [9, -50]]]) o.push(stroke(S([a, b]), { p: 0.8, speed: 0.1 }));
    o.push(pick('graphite-2b', 1.3));
    for (let k = 0; k < 50; k++) {
      const a = -Math.PI + r() * Math.PI, c = [Math.cos(a) * 8, -41 + Math.sin(a) * 6.5];
      const b = a + (r() - 0.5) * 0.7, L = 2 + r() * 4;
      o.push(stroke(S([c, [c[0] + Math.cos(b) * L, c[1] + Math.sin(b) * L]]), { p: 0.5, speed: 0.3, into: 0.05, out: 0.7 }));
    }
    return o;
  },

  /* That lift went round in a circle and made the eye worse. Seen from above,
   * a moth's thorax is fur combed backward, not rings. So: flatten it with
   * straight lifts, lay one even tone down its length, then comb the fur back
   * toward the abdomen, fanning out, darker on the side away from the light. */
  comb: () => {
    const r = stream(111), o = [];
    o.push(pick('kneaded-eraser', 20, 0.85));
    for (let k = 0; k < 9; k++) { const y = -32 + k * 5; o.push(stroke(S([[-16, y], [16, y + 1]]), { p: 0.7, speed: 0.07 })); }
    for (let k = 0; k < 7; k++) { const x = -12 + k * 4; o.push(stroke(S([[x, -34], [x, 10]]), { p: 0.7, speed: 0.07 })); }
    o.push(pick('graphite-2b', 2.2));
    for (let k = 0; k < 40; k++) {
      const x = -15 + (30 * k) / 39, top = -12 - 23 * Math.sqrt(Math.max(0, 1 - (x / 16) ** 2)), bot = -12 + 23 * Math.sqrt(Math.max(0, 1 - (x / 16) ** 2));
      o.push(stroke(S([[x * 0.9, top + 1], [x, (top + bot) / 2], [x * 1.05, bot - 1]]), { p: 0.5 + (x > 0 ? 0.08 : 0), tilt: [40, 0], speed: 0.18 }));
    }
    o.push(pick('graphite-6b', 1.2));
    for (let k = 0; k < 220; k++) {
      const x = (r() - 0.5) * 30, lim = 23 * Math.sqrt(Math.max(0, 1 - (x / 16) ** 2)), y = -12 + (r() * 2 - 1) * lim * 0.95;
      const dir = [x * 0.035 + (r() - 0.5) * 0.25, 1], L = 5 + r() * 6;
      const shade = Math.max(0, Math.min(1, 0.45 + 0.02 * x + 0.012 * (y + 12)));
      o.push(stroke(S([[x, y], [x + dir[0] * L * 0.5, y + L * 0.5], [x + dir[0] * L * 1.1, y + L]]), { p: 0.3 + 0.45 * shade, speed: 0.3, into: 0.1, out: 0.6 }));
    }
    return o;
  },

  /* The pattern that makes it a Feathered Thorn: the band between the two
   * cross-lines a shade darker, the lines themselves, the outer one edged
   * pale; the small spot in the band; a pale spot near the tip; a fine dark
   * line along the outer edge and the fringe beyond it; the faint line
   * carrying on across the hindwing. */
  pattern: () => {
    const r = stream(121), o = [];
    const L = (pts) => mirror(sweep(pts, 0.05), 1.02);
    const sides = [
      { fw: FW_R, aml: AML_R, pml: PML_R, disc: [104, 12], apex: [194, 15], root: [14, -14], hw: HW_R, hline: [[150, 132], [122, 160], [84, 170], [44, 156]] },
      { fw: FW_L, aml: AML_L, pml: PML_L, disc: L([[104, 12]])[0], apex: L([[194, 15]])[0], root: [-14, -14], hw: HW_L, hline: mirror(sweep([[150, 132], [122, 160], [84, 170], [44, 156]], 0.03), 1.01) },
    ];
    o.push(pick('graphite-2b'));
    for (const s of sides) {
      const band = [...s.aml, ...s.pml.slice().reverse()];
      const keep = (q) => edgeDist(s.fw, q) > 2.4 && inside(band, q);
      o.push(...fill(s.fw, s.root, { n: 220, p: 0.4, keep, salt: 131 + s.root[0], len: [14, 26], cell: 5 }));
    }
    o.push(pick('graphite-6b', 1.7));
    for (const s of sides) {
      o.push(...line(curve(s.aml.filter((_, i) => i % 3 === 0), 6).map(([x, y], i) => [x + Math.sin(i * 0.9) * 0.8, y]), { p: 0.72, speed: 0.12 }, 2));
      o.push(...line(s.pml, { p: 0.78, speed: 0.12 }, 2));
      for (let k = 0; k < 3; k++) { const [x, y] = s.disc; o.push(stroke(S([[x - 1.6, y], [x, y - 1.8], [x + 1.6, y], [x, y + 1.8], [x - 1.4, y]]), { p: 0.85, speed: 0.05 })); }
      o.push(stroke(S(s.fw.slice(Math.round(s.fw.length * 0.38), Math.round(s.fw.length * 0.73))), { p: 0.6, speed: 0.15 }));   // the fine line along the outer edge
    }
    o.push(pick('graphite-hb', 1.2));
    for (const s of sides) {
      o.push(...line(s.fw.slice(0, Math.round(s.fw.length * 0.4)), { p: 0.55, speed: 0.15 }));   // the leading edge, crisp
      o.push(...line(curve(s.hline, 8), { p: 0.35, speed: 0.2 }));
      // the fringe: short, fine, straight out from the outer edge
      const edge = s.fw.slice(Math.round(s.fw.length * 0.4), Math.round(s.fw.length * 0.72));
      for (let i = 1; i < edge.length; i++) {
        const [x0, y0] = edge[i - 1], [x1, y1] = edge[i], nx = y1 - y0, ny = -(x1 - x0), l = Math.hypot(nx, ny) || 1, sg = s.root[0] > 0 ? 1 : -1;
        for (let k = 0; k < 3; k++) {
          const t = (k + r()) / 3, c = [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t], len = 3.5 + r() * 2;
          o.push(stroke(S([c, [c[0] + (sg * nx / l) * len, c[1] + (sg * ny / l) * len]]), { p: 0.4, speed: 0.4, into: 0.1, out: 0.5 }));
        }
      }
    }
    // pale: beside the outer line, and the spot near the tip
    o.push(pick('kneaded-eraser', 4, 0.9));
    for (const s of sides) {
      const sg = s.root[0] > 0 ? 1 : -1;
      o.push(stroke(S(s.pml.map(([x, y]) => [x + 3.4 * sg, y + 1.2])), { p: 0.8, speed: 0.06 }));
    }
    o.push(pick('precision-eraser', 3, 0.8));
    for (const s of sides) for (let k = 0; k < 2; k++) { const [x, y] = s.apex; o.push(stroke(S([[x - 1.2, y], [x + 1.2, y + 0.4]]), { p: 0.8, speed: 0.05 })); }
    return o;
  },

  /* The feathers it is named for: each antenna a fine shaft with two rows of
   * comb teeth, angled toward the tip, longest a little way out from the head
   * and shortening to nothing at the tip. */
  antennae: () => {
    const r = stream(141), o = [];
    for (const ant of [ANT_R, ANT_L]) {
      const pts = ant;
      o.push(pick('graphite-2b', 1.3));
      o.push(stroke(S(pts), { p: (u) => 0.7 - 0.35 * u, speed: 0.15, into: 0.03, out: 0.15 }));
      o.push(pick('graphite-hb', 0.9));
      const Ls = [0];
      for (let i = 1; i < pts.length; i++) Ls.push(Ls[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      const total = Ls[Ls.length - 1];
      for (let s = 4; s < total - 2; s += 2.1) {
        let i = 1;
        while (i < pts.length - 1 && Ls[i] < s) i++;
        const t = (s - Ls[i - 1]) / (Ls[i] - Ls[i - 1] || 1);
        const p0 = [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t];
        const T = [pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]], l = Math.hypot(...T) || 1, u = s / total;
        const len = 9.5 * Math.sin(Math.PI * Math.min(1, u * 1.05 + 0.05)) ** 0.7 * (1 - 0.55 * u);
        for (const side of [1, -1]) {
          const a = Math.atan2(T[1], T[0]) + side * (0.9 + (r() - 0.5) * 0.15);
          o.push(stroke(S([p0, [p0[0] + Math.cos(a) * len, p0[1] + Math.sin(a) * len]]), { p: 0.45, speed: 0.4, into: 0.1, out: 0.5 }));
        }
      }
    }
    return o;
  },

  /* the head still has a box's flat top: round it off with the hard eraser
   * along an arc just outside where the head should end, then soften the new
   * edge with a few tufts */
  head: () => {
    const r = stream(151), o = [pick('precision-eraser', 3.2, 1)];
    for (const k of [0, 1.2, 2.4]) {
      const arc = Array.from({ length: 14 }, (_, i) => { const a = Math.PI + (Math.PI * i) / 13; return [Math.cos(a) * (10 + k), -41 + Math.sin(a) * (8.8 + k)]; });
      o.push(stroke(S(arc), { p: 0.9, speed: 0.08 }));
    }
    o.push(pick('graphite-2b', 1.1));
    for (let k = 0; k < 36; k++) {
      const a = Math.PI + r() * Math.PI, c = [Math.cos(a) * 8.2, -41 + Math.sin(a) * 7];
      const b = a + (r() - 0.5) * 0.5, L = 1.5 + r() * 2.5;
      o.push(stroke(S([c, [c[0] + Math.cos(b) * L, c[1] + Math.sin(b) * L]]), { p: 0.5, speed: 0.3, into: 0.05, out: 0.7 }));
    }
    return o;
  },

  /* Its shadow on the wall. The light is up and to the left, so the shadow
   * falls down and to the right: a thin band below the wings, which lie
   * almost flat, a wider one off the body, which stands higher, and a faint
   * line for each antenna. Strokes run the way the light runs; the stump
   * softens the far edge. Only where the wall shows. */
  shadow: () => {
    const r = stream(161), o = [];
    const WING = [FW_R, HW_R, FW_L, HW_L], BODY = [THORAX, ABDOMEN, HEAD];
    const onMoth = (q) => [...WING, ...BODY].some((p) => inside(p, q));
    const shift = (q, [dx, dy]) => [q[0] - dx, q[1] - dy];
    const wingOff = [6.7, 10.9], bodyOff = [8.3, 15.1];
    const cast = (q) => !onMoth(q) && (WING.some((p) => inside(p, shift(q, wingOff))) || BODY.some((p) => inside(p, shift(q, bodyOff))));
    const box = [[-240, -60], [240, -60], [240, 220], [-240, 220]];
    o.push(pick('graphite-2b', 2.6));
    o.push(...fill(box, [-3000, -3000], { n: 900, p: 0.34, keep: cast, salt: 171, len: [6, 12], cell: 3.2, deg: 45, speed: 0.3 }));
    o.push(pick('graphite-hb', 1));
    for (const ant of [ANT_R, ANT_L]) o.push(stroke(S(ant.map(([x, y]) => [x + 12, y + 17])), { p: (u) => 0.32 - 0.2 * u, speed: 0.25 }));
    o.push(pick('stump', 7, 0.5));
    const edge = [...WING, ...BODY];
    for (let k = 0; k < 120; k++) {
      const q = [-230 + r() * 460, -50 + r() * 260];
      if (!cast(q)) continue;
      o.push(stroke(S([q, [q[0] + 4, q[1] + 6]]), { p: 0.5, speed: 0.1 }));
      if (k % 10 === 9) o.push(clean());
    }
    o.push(clean());
    return o;
  },

  /* The shadow reads as a dotted outline, parted from the wing by a thin
   * white rim: the margin I kept clear inside every wing. On the lit edges
   * that rim is a fair light; on the shaded edges it is wrong. Close it with
   * a fine line just inside those edges, then run the stump along the
   * shadow's length so it goes soft. */
  edges: () => {
    const o = [];
    const LIGHT = [-0.45, -0.89];                       // toward the light, in the moth's frame
    const shaded = (poly, sg) => {
      const runs = [];
      let run = [];
      for (let i = 1; i < poly.length; i++) {
        const [x0, y0] = poly[i - 1], [x1, y1] = poly[i];
        let nx = y1 - y0, ny = -(x1 - x0);
        const l = Math.hypot(nx, ny) || 1;
        nx /= l; ny /= l;
        const mid = [(x0 + x1) / 2, (y0 + y1) / 2];
        if (inside(poly, [mid[0] + nx * 2, mid[1] + ny * 2])) { nx = -nx; ny = -ny; }   // make the normal point outward
        if (nx * LIGHT[0] + ny * LIGHT[1] < -0.15) run.push([mid[0] - nx * 1.1, mid[1] - ny * 1.1, nx, ny]);
        else if (run.length) { runs.push(run); run = []; }
      }
      if (run.length) runs.push(run);
      return runs.filter((r) => r.length > 3);
    };
    const polys = [FW_R, HW_R, FW_L, HW_L];
    o.push(pick('graphite-2b', 1.4));
    for (const poly of polys) for (const run of shaded(poly)) o.push(stroke(S(run.map(([x, y]) => [x, y])), { p: 0.55, speed: 0.12 }));
    o.push(pick('stump', 6, 0.6));
    for (const poly of polys) for (const run of shaded(poly)) {
      for (const d of [3.5, 6]) {
        o.push(stroke(S(run.map(([x, y, nx, ny]) => [x + nx * d, y + ny * d])), { p: 0.55, speed: 0.1 }));
        o.push(clean());
      }
    }
    return o;
  },

  /* Still wrong up close: the fine line landed inside the white rim and split
   * it in two, and the shadow stays speckled, because a light touch leaves
   * the paper's pits white and only the stump pushes graphite into them. So
   * three close lines fill the rim, and the stump goes along the shadow
   * harder and more often. */
  edges2: () => {
    const o = [];
    const LIGHT = [-0.45, -0.89];
    const shadedRuns = (poly) => {
      const runs = [];
      let run = [];
      for (let i = 1; i < poly.length; i++) {
        const [x0, y0] = poly[i - 1], [x1, y1] = poly[i];
        let nx = y1 - y0, ny = -(x1 - x0);
        const l = Math.hypot(nx, ny) || 1;
        nx /= l; ny /= l;
        const mid = [(x0 + x1) / 2, (y0 + y1) / 2];
        if (inside(poly, [mid[0] + nx * 2, mid[1] + ny * 2])) { nx = -nx; ny = -ny; }
        if (nx * LIGHT[0] + ny * LIGHT[1] < -0.15) run.push([mid[0], mid[1], nx, ny]);
        else if (run.length) { runs.push(run); run = []; }
      }
      if (run.length) runs.push(run);
      return runs.filter((r) => r.length > 3);
    };
    const polys = [FW_R, HW_R, FW_L, HW_L];
    o.push(pick('graphite-2b', 1.6));
    for (const poly of polys) for (const run of shadedRuns(poly)) for (const d of [0.7, 1.5, 2.3]) {
      o.push(stroke(S(run.map(([x, y, nx, ny]) => [x - nx * d, y - ny * d])), { p: 0.5, speed: 0.12 }));
    }
    o.push(pick('stump', 7, 1));
    for (const poly of polys) for (const run of shadedRuns(poly)) {
      for (const d of [2, 4, 6, 8, 4]) {
        o.push(stroke(S(run.map(([x, y, nx, ny]) => [x + nx * d, y + ny * d])), { p: 0.8, speed: 0.08 }));
        o.push(clean());
      }
    }
    return o;
  },

  /* white slivers still run either side of those thin lines: one broad
   * stroke of the lead's side along the rim covers it, and the stump fuses
   * it into the wing */
  edges3: () => {
    const o = [];
    const LIGHT = [-0.45, -0.89];
    const shadedRuns = (poly) => {
      const runs = [];
      let run = [];
      for (let i = 1; i < poly.length; i++) {
        const [x0, y0] = poly[i - 1], [x1, y1] = poly[i];
        let nx = y1 - y0, ny = -(x1 - x0);
        const l = Math.hypot(nx, ny) || 1;
        nx /= l; ny /= l;
        const mid = [(x0 + x1) / 2, (y0 + y1) / 2];
        if (inside(poly, [mid[0] + nx * 2, mid[1] + ny * 2])) { nx = -nx; ny = -ny; }
        if (nx * LIGHT[0] + ny * LIGHT[1] < -0.15) run.push([mid[0], mid[1], nx, ny]);
        else if (run.length) { runs.push(run); run = []; }
      }
      if (run.length) runs.push(run);
      return runs.filter((r) => r.length > 3);
    };
    const polys = [FW_R, HW_R, FW_L, HW_L];
    o.push(pick('graphite-2b', 2.4));
    for (const poly of polys) for (const run of shadedRuns(poly)) {
      const path = run.map(([x, y, nx, ny]) => [x - nx * 1.5, y - ny * 1.5]);
      const [x0, y0] = path[0], [x1, y1] = path[path.length - 1];
      const th = Math.atan2(y1 - y0, x1 - x0);
      o.push(stroke(S(path), { p: 0.55, tilt: across(th, 50), speed: 0.1 }));
    }
    o.push(pick('stump', 5, 0.9));
    for (const poly of polys) for (const run of shadedRuns(poly)) {
      o.push(stroke(S(run.map(([x, y, nx, ny]) => [x - nx * 2.5, y - ny * 2.5])), { p: 0.7, speed: 0.08 }));
      o.push(clean());
    }
    return o;
  },

  /* What it paid. A moth gets out of a web by leaving the scales of its wings
   * on the glue. Near the tip of the left forewing they are gone: the bare
   * wing is nearly clear, the wall shows through it, the veins still cross
   * it, and a few scales hang on at the ragged edge. A strand of silk is
   * still stuck there and hangs down the wall, with a scale or two on it and
   * its own faint shadow. */
  paid: () => {
    const r = stream(181), o = [];
    const L = (pts) => mirror(sweep(pts, 0.05), 1.02);
    const centre = [176, 8];
    const ragged = (a) => 1 + 0.22 * Math.sin(a * 3 + 1) + 0.14 * Math.sin(a * 7 + 2) + 0.08 * Math.sin(a * 13);
    const inPatch = (q) => { const dx = (q[0] - centre[0]) / 24, dy = (q[1] - centre[1]) / 15; return Math.hypot(dx, dy) < ragged(Math.atan2(dy, dx)); };
    // scrub the scales off with the hard eraser, short strokes every way
    o.push(pick('precision-eraser', 5, 0.8));
    for (let k = 0; k < 170; k++) {
      const c = [centre[0] + (r() - 0.5) * 50, centre[1] + (r() - 0.5) * 34];
      if (!inPatch(c) || edgeDist(FW_R, c) < 1.5) continue;
      const a = r() * Math.PI, l = 3 + r() * 4, e = [c[0] + Math.cos(a) * l, c[1] + Math.sin(a) * l];
      if (!inPatch(e)) continue;
      o.push(stroke(S(L([c, e])), { p: 0.8, speed: 0.1 }));
    }
    // the veins still run through the bare place
    o.push(pick('graphite-2b', 1));
    for (const end of [[212, 20], [204, 44], [192, 62]]) {
      const root = [14, -14], path = [];
      for (let t = 0; t <= 1.0001; t += 0.02) { const q = [root[0] + (end[0] - root[0]) * t, root[1] + (end[1] - root[1]) * t - 6 * Math.sin(Math.PI * t)]; if (inPatch(q)) path.push(q); }
      if (path.length > 2) o.push(stroke(S(L(path)), { p: 0.42, speed: 0.15 }));
    }
    // a few scales hang on at the ragged edge
    for (let k = 0; k < 40; k++) {
      const a = r() * Math.PI * 2, rr = ragged(a) * (0.78 + r() * 0.2), c = [centre[0] + Math.cos(a) * 24 * rr, centre[1] + Math.sin(a) * 15 * rr];
      if (edgeDist(FW_R, c) < 2) continue;
      const b = Math.atan2(c[1] + 14, c[0] - 14);
      o.push(stroke(S(L([c, [c[0] + Math.cos(b) * 2.2, c[1] + Math.sin(b) * 2.2]])), { p: 0.5, speed: 0.2 }));
    }
    // the strand: stuck at the wing's edge by the bare place, hanging down the wall
    const at = toSheet(L([[204, 30]])[0]);
    const strand = curve([at, [at[0] - 6, at[1] + 70], [at[0] + 10, at[1] + 150], [at[0] - 4, at[1] + 230], [at[0] - 18, at[1] + 282], [at[0] - 11, at[1] + 296], [at[0] - 4, at[1] + 288]], 14);
    o.push(pick('graphite-hb', 0.7));
    o.push(stroke(strand, { p: (u) => 0.5 - 0.15 * u, speed: 0.1, into: 0.02, out: 0.06 }));
    o.push(stroke(strand.map(([x, y]) => [x + 5, y + 7]).slice(3), { p: 0.2, speed: 0.12, into: 0.05, out: 0.1 }));
    o.push(pick('graphite-2b', 1.1));
    for (const t of [0.08, 0.15, 0.31, 0.47]) {
      const q = strand[Math.round(t * (strand.length - 1))];
      o.push(stroke([q, [q[0] + 1.6, q[1] + 1.2]], { p: 0.55, speed: 0.05 }));
    }
    return o;
  },

  /* The strand all but vanished at arm's length, and it is the thread back
   * to the web: go over it again with a softer pencil, its shadow too, and
   * make the scales on it flecks you can find. Then the front legs, reaching
   * past the head to hold the wall, each with a shadow. */
  hold: () => {
    const o = [];
    const L = (pts) => mirror(sweep(pts, 0.05), 1.02);
    const at = toSheet(L([[204, 30]])[0]);
    const strand = curve([at, [at[0] - 6, at[1] + 70], [at[0] + 10, at[1] + 150], [at[0] - 4, at[1] + 230], [at[0] - 18, at[1] + 282], [at[0] - 11, at[1] + 296], [at[0] - 4, at[1] + 288]], 14);
    o.push(pick('graphite-2b', 1));
    o.push(stroke(strand, { p: (u) => 0.62 - 0.2 * u, speed: 0.08, into: 0.02, out: 0.06 }));
    o.push(pick('graphite-hb', 0.9));
    o.push(stroke(strand.map(([x, y]) => [x + 5, y + 7]).slice(3), { p: 0.34, speed: 0.1, into: 0.05, out: 0.1 }));
    o.push(pick('graphite-2b', 1.7));
    for (const t of [0.08, 0.15, 0.31, 0.47, 0.6]) {
      const q = strand[Math.round(t * (strand.length - 1))];
      o.push(stroke([[q[0] - 0.8, q[1] - 0.6], [q[0] + 1.4, q[1] + 1.1]], { p: 0.6, speed: 0.04 }));
    }
    // the front legs: femur out, tibia forward, the foot on the wall
    for (const side of [1, -1]) {
      const leg = [[side * 9, -32], [side * 21, -40], [side * 27, -54], [side * 33, -58]];
      o.push(pick('graphite-2b', 1.3));
      o.push(stroke(S(leg.slice(0, 3)), { p: 0.6, speed: 0.12 }));
      o.push(pick('graphite-2b', 0.9));
      o.push(stroke(S(leg.slice(2)), { p: 0.55, speed: 0.12 }));
      o.push(pick('graphite-hb', 0.9));
      o.push(stroke(S(leg.slice(1).map(([x, y]) => [x + 3, y + 4.5])), { p: 0.3, speed: 0.15 }));
    }
    return o;
  },
};


/* ------------------------------------------------------------ into the book */
/* What the studio made of my actions: a selection sets the tool for the
 * strokes after it, a stroke becomes a gesture, a clean empties the stump. */
const DEFAULT_SIZE = { 'graphite-hb': 1.6, 'graphite-2b': 2.2, 'graphite-6b': 3, stump: 18, 'kneaded-eraser': 18, 'precision-eraser': 2.5 };
function toOps(actions) {
  let tool = 'graphite-2b', size = 2.2, strength = 1;
  const ops = [];
  for (const a of actions) {
    if (a.type === 'select') { tool = a.tool; size = a.options.size ?? DEFAULT_SIZE[tool]; strength = a.options.strength ?? 1; }
    else if (a.type === 'stroke') ops.push({ k: 'm', tool, size, strength, samples: a.samples });
    else if (a.type === 'clean') ops.push({ k: 'clean', tool: 'stump' });
  }
  return ops;
}
const NOTES = {
  construction: ['Lay-in', 'Light HB lines to find where everything goes: the four wings, the body, the antennae, the axis.'],
  ground: ['Ground of the wings', 'Side strokes of 2B running out from each wing root, the way the scales lie; two crossing layers on the forewings, one on the hindwings. It came out streaky, like feathers.'],
  even: ['Evening it out', 'Gentler strokes on a jittered grid so the tone lies even instead of clumping, then the stump along the scales. The wings go from feathers to powder.'],
  body: ['The body', 'A woolly thorax in 6B, the abdomen in bands. It failed: every lock of fur began at the middle of the thorax and left it white, a starburst; and the bands with hairs at their sides made the abdomen a millipede.'],
  body2: ['Working over the body', 'Tone laid round the thorax in curved strokes, the abdomen unified down its length and blended, fur only at the edges. The abdomen came right; the thorax became rings round a white dot, an eye.'],
  body3: ['Filling the eye', 'The middle filled, the rings fused with the stump, wool in small curls. Better, but the head had come out with a flat top, a box.'],
  lighten: ['Lifting', 'The body was far darker than this moth, whose body is the colour of its wings. The kneaded eraser went round the thorax in a circle, which lifted a light ring and made the eye worse.'],
  comb: ['Combing', 'Seen from above a thorax is fur combed backward, not rings: straight lifts to flatten it, one even tone, then the fur combed back toward the abdomen, fanning out. The eye is gone.'],
  pattern: ['The pattern', 'What makes it a Feathered Thorn: the band between the two cross-lines a shade darker, the lines, the outer one edged pale, the small spot in the band, a pale spot near the tip, a fine line along the outer edge and the fringe beyond it.'],
  antennae: ['The antennae', 'The feathers it is named for: fine shafts with two rows of comb teeth angled toward the tips, longest near the head.'],
  head: ['Rounding the head', 'The hard eraser along an arc just outside where the head should end, then a few tufts to soften the new edge.'],
  shadow: ['Its shadow on the wall', 'The light is up and to the left, so the shadow falls down and to the right: a thin band below the wings, which lie almost flat, a wider one off the body, a faint line for each antenna.'],
  edges: ['Closing the shaded edges, first try', 'The shadow read as a dotted outline, parted from the wing by the white rim I had kept inside every wing. A fine line meant to close the rim landed inside it and split it in two.'],
  edges2: ['Second try', 'Three close lines in the rim, and the stump along the shadow harder: a light touch leaves the paper’s pits white and only the stump pushes graphite into them. White slivers remained.'],
  edges3: ['Third try', 'One broad stroke of the lead’s side along the rim, fused into the wing with the stump. The shaded edges now read as a margin with its shadow beyond.'],
  paid: ['What it paid', 'A moth gets out of a web by leaving the scales of its wings on the glue. Near the tip of the left forewing they are scrubbed away with the hard eraser, the veins still crossing the bare place and a few scales hanging on at its edge; a strand of silk still stuck there hangs down the wall.'],
  hold: ['Holding on', 'The strand all but vanished at arm’s length, so it is gone over again with a softer pencil, and the scales on it made findable. The front legs reach past the head to hold the wall.'],
};
const passes = Object.entries(NOTES).map(([stage, [name, note]]) => ({ name, note, build: () => toOps(stages[stage]()) }));

export default {
  title: 'what went through',
  date: '2026-09-25',
  note: 'Graphite on white paper, drawn in the studio a batch of strokes at a time, looking after every stage: as near to drawing by hand as this book comes. The moth that made the hole in the web on page 6, a Feathered Thorn resting on a wall the next morning. A moth gets out of a web by leaving the scales of its wings on the glue, so near the tip of its left forewing they are gone, and a strand of silk still hangs from the place. On the way the thorax was a starburst, then an eye, and a lift that went round in a circle made the eye worse; only combing the fur back cured it. The shadow read as a dotted outline parted from the wing by a white rim and took three tries to close. Still unresolved: the body is darker than this moth’s is, the hindwings are streakier than scales, and up close the worn patch reads as bubbles more than bare wing.',
  page: { w: W, h: H },
  surface: { version: 2, paper: 'white', tooth: 0.6, seed: 25 },
  passes,
  build: () => passes.flatMap((p) => p.build()),
};
