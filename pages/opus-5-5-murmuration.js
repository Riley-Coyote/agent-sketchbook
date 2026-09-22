/* each one watching seven — Opus 5.5, 2026-09-22.
 * A murmuration at the blue hour. The sky is laid in with the brush; every
 * bird is a small lift of that light with the eraser, so the flock exists only
 * as the places where the sky has been taken away. */
import { OP, DOT, PHASE, PAUSE, OCCLUDE, seed } from '../mark-engine.js';

const W = 1800, H = 1100, HZ = 930;

/* one deterministic stream, seeded from the engine's own hash */
function stream(salt) {
  let a = Math.floor(seed(salt * 1.713 + 0.37, salt * 0.291 + 5.1) * 4294967296) >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const lerp = (a, b, t) => a + (b - a) * t;
const mix = (c0, c1, t) => c0.map((v, i) => Math.round(lerp(v, c1[i], t)));
const q = (p) => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10];

/* ------------------------------------------------------------ the sky */
/* visible colour by height, zenith → horizon */
const RAMP = [
  [0.00, [14, 20, 44]],
  [0.30, [24, 38, 78]],
  [0.55, [44, 70, 118]],
  [0.75, [86, 118, 160]],
  [0.90, [146, 172, 194]],
  [1.00, [196, 212, 216]],
];
function skyAt(t) {
  t = Math.max(0, Math.min(1, t));
  for (let i = 1; i < RAMP.length; i++) {
    if (t <= RAMP[i][0]) {
      const [t0, c0] = RAMP[i - 1], [t1, c1] = RAMP[i];
      return mix(c0, c1, (t - t0) / (t1 - t0));
    }
  }
  return RAMP[RAMP.length - 1][1];
}

function sky() {
  const r = stream(11);
  const o = [PHASE('Blue hour')];
  let k = 0;
  for (let y = -50; y <= HZ + 40; y += 3.5 + r() * 2.5, k++) {
    const pts = [];
    const ph = r() * 6.28, amp = 0.4 + r() * 1.1;
    for (let x = -330; x <= W + 330; x += 60) {
      pts.push(q([x, y + Math.sin(x * 0.0023 + ph) * amp + (r() - 0.5) * 0.6]));
    }
    o.push(OP('s', pts, 'tone', 'brush', 6, skyAt((y + 50) / (HZ + 50)), 1));
  }
  return o;
}

/* ------------------------------------------------------------ the ground */
/* a winter limb: a slightly bent stroke, then two or three children */
function limb(o, r, x0, y0, len, ang, depth, wt) {
  const n = Math.max(3, Math.round(len / 5));
  const bend = (r() - 0.5) * 0.5;
  const pts = [[x0, y0]];
  let x = x0, y = y0, a = ang;
  for (let i = 1; i <= n; i++) {
    a += bend / n + (r() - 0.5) * 0.1;
    x += Math.cos(a) * len / n;
    y += Math.sin(a) * len / n;
    pts.push([x, y]);
  }
  o.push(OP('s', pts.map(q), 'tone', 'eraser', wt));
  if (depth <= 0 || len < 2.5) return;
  const kids = 2 + (r() < 0.4 ? 1 : 0);
  for (let k = 0; k < kids; k++) {
    const at = k === 0 ? n : Math.max(1, Math.floor(n * (0.4 + r() * 0.5)));
    const side = k % 2 ? 1 : -1;
    let ca = a + side * (0.3 + r() * 0.55);
    ca = lerp(ca, -Math.PI / 2, 0.12); // reaching back toward the light
    limb(o, r, pts[at][0], pts[at][1], len * (0.6 + r() * 0.18), ca, depth - 1, Math.max(0.12, wt * 0.66));
  }
}

function ground() {
  const r = stream(23);
  const o = [PHASE('The ground')];
  const poly = [[-20, HZ + 6]];
  for (let x = 0; x <= W; x += 30) poly.push(q([x, HZ + 5 + r() * 2]));
  poly.push([W + 20, HZ + 6], [W + 20, H + 20], [-20, H + 20]);
  o.push(OCCLUDE(poly, 1));
  // the horizon itself, drawn: long eraser strokes lifting the lowest light
  for (let k = 0; k < 3; k++) {
    const pts = [];
    for (let x = -60; x <= W + 60; x += 40) pts.push(q([x, HZ + 2 + k * 2.2 + (r() - 0.5) * 1.2]));
    o.push(OP('s', pts, 'tone', 'eraser', 1.1));
  }
  // still water between the reeds: hairline glints, brightest where the birds come down
  for (let k = 0; k < 90; k++) {
    const depth = r();
    const y = HZ + 11 + depth * 26;
    const cx = 480 + r() * 600, len = 6 + r() * r() * 90 * (1 - depth * 0.5);
    const near = Math.max(0, 1 - Math.abs(cx - 745) / 300);
    const pts = [];
    for (let x = cx - len / 2; x <= cx + len / 2 + 0.1; x += Math.max(3, len / 6)) pts.push(q([x, y + (r() - 0.5) * 0.3]));
    if (pts.length < 2) continue;
    o.push(OP('s', pts, 'tone', 'pencil', 1 + r() * 0.8, mix([200, 214, 220], [70, 98, 140], depth), 0.25 + 0.6 * near * (1 - depth * 0.7)));
  }
  o.push(PAUSE(300));
  // hedgerow: dense low scribble along two stretches of the field edge
  for (const [x0, x1, hmax] of [[-20, 520, 13], [1010, 1260, 9], [1640, 1820, 11]]) {
    for (let x = x0; x < x1; x += 1.6 + r() * 2.2) {
      const e = Math.min(1, (x - x0) / 40, (x1 - x) / 40);
      const h = e * hmax * (0.45 + 0.55 * (0.5 + 0.5 * Math.sin(x * 0.037 + Math.sin(x * 0.011) * 2))) * (0.7 + r() * 0.3);
      if (h < 1) continue;
      const lean = (r() - 0.5) * 3;
      o.push(OP('s', [q([x, HZ + 5]), q([x + lean * 0.5, HZ + 4 - h * 0.6]), q([x + lean, HZ + 4 - h])], 'tone', 'eraser', 0.35 + r() * 0.3));
    }
  }
  // reeds in the open stretch, leaning with a little wind; fine dark pencil, not the
  // eraser, which beads into dots at this width
  const REED = [11, 11, 15];
  const clump = (x) => 0.5 + 0.3 * Math.sin(x * 0.019 + 1.3) + 0.2 * Math.sin(x * 0.047 + 0.4);
  for (let x = 450; x < 1090; x += 1.6 + r() * 4) {
    const edge = Math.min(1, (x - 450) / 110, (1090 - x) / 110);
    const c = clump(x) * edge;
    if (r() > 0.25 + c) continue;
    const base = HZ + 6 + r() * r() * 32;
    const top = HZ + 4 - (1.5 + 11 * c + r() * r() * 5);
    const h = base - top;
    const lean = 1.5 + r() * 3;
    const tip = [x + lean, base - h];
    o.push(OP('s', [q([x, base]), q([x + lean * 0.3, base - h * 0.5]), q(tip)], 'tone', 'pencil', 0.9 + r() * 0.6, REED, 1));
    if (r() < 0.05) o.push(OP('s', [q([tip[0] - 0.2, tip[1] + 1.8]), q([tip[0] + 0.1, tip[1] - 0.8])], 'tone', 'pencil', 1.8, REED, 1));
  }
  o.push(PAUSE(300));
  // bare trees: one old one on the left, a pair on the right
  for (const [x, h, lean, depth] of [[300, 44, -0.06, 7], [1470, 30, 0.08, 7], [1552, 22, -0.1, 6]]) {
    limb(o, r, x, HZ + 6, h, -Math.PI / 2 + lean, depth, h / 26);
  }
  return o;
}

/* ------------------------------------------------------------ the flock */
const F = 1300, CX = W * 0.5, CY = HZ;
const proj = ([X, Y, Z]) => [CX + F * X / Z, CY - F * Y / Z];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const sc = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => sc(a, 1 / (Math.hypot(a[0], a[1], a[2]) || 1));

/* A flock is a path placed on the page and then given depth: [x, y, metres away],
 * a half-width profile along it, and a count. The sheet around the path curls,
 * so where it turns edge-on to us the birds stack into dark ridges. */
function catmull(pts, u) {
  const n = pts.length - 1;
  const f = Math.min(n - 1e-9, Math.max(0, u * n));
  const i = Math.floor(f), t = f - i;
  const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n, i + 2)];
  return p1.map((_, k) => 0.5 * (2 * p1[k] + (p2[k] - p0[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t * t + (3 * p1[k] - p0[k] - 3 * p2[k] + p3[k]) * t * t * t));
}
const gauss = (u, m, s) => Math.exp(-(((u - m) / s) ** 2));
const CURL = 1.5;

function murmur(spec) {
  const { keys, halfWidth, count, salt, twist = [0.2, 3.0], band = () => 1 } = spec;
  const r = stream(salt);
  const spine = (u) => { const [sx, sy, Z] = catmull(keys, u); return [(sx - CX) * Z / F, (CY - sy) * Z / F, Z]; };
  const thick = (u) => 4 + 0.07 * halfWidth(u);
  const frameAt = (u) => {
    const T = norm(sub(spine(Math.min(1, u + 1e-3)), spine(Math.max(0, u - 1e-3))));
    const N0 = norm(cross(T, [0, 1, 0]));
    const B0 = cross(N0, T);
    const th = twist[0] + twist[1] * u + 0.5 * Math.sin(u * 5);
    return { T, D: add(sc(N0, Math.cos(th)), sc(B0, Math.sin(th))), E: add(sc(N0, -Math.sin(th)), sc(B0, Math.cos(th))) };
  };
  // birds per unit of path follow width times speed, so density stays even in space
  const wts = [];
  for (let i = 0; i <= 400; i++) {
    const u = i / 400;
    const d = sub(spine(Math.min(1, u + 1e-3)), spine(Math.max(0, u - 1e-3)));
    wts.push(halfWidth(u) * Math.hypot(d[0], d[1], d[2]));
  }
  const wmax = Math.max(...wts);
  const o = [];
  let made = 0, tries = 0;
  while (made < count && tries++ < count * 40) {
    const u = r();
    if (r() > wts[Math.round(u * 400)] / wmax) continue;
    const v = r() * 2 - 1;
    if (Math.abs(v) > 0.85 && r() < (Math.abs(v) - 0.85) / 0.15) continue;
    if (r() > band(u, v)) continue;
    const n = (r() + r() + r() - 1.5) / 1.5;
    const { T, D, E } = frameAt(u);
    const hw = halfWidth(u), R = hw / CURL, phi = v * CURL;
    let P = add(add(add(spine(u), sc(D, R * Math.sin(phi))), sc(E, R * (1 - Math.cos(phi)))), sc(E, n * thick(u)));
    if (r() < 0.015) P = add(P, [(r() - 0.5) * 70, (r() - 0.5) * 50, (r() - 0.5) * 70]);
    const heading = norm(add(T, [(r() - 0.5) * 0.5, (r() - 0.5) * 0.3, (r() - 0.5) * 0.5]));
    const wing = norm(cross(heading, [0, 1, 0]));
    const up = norm(cross(wing, heading));
    const span = 2.2 * (0.8 + r() * 0.4);
    const flap = (r() - 0.5) * 2;
    const a = proj(add(add(P, sc(wing, -span / 2)), sc(up, flap * span * 0.35)));
    const b = proj(add(P, sc(heading, span * 0.12)));
    const c = proj(add(add(P, sc(wing, span / 2)), sc(up, flap * span * 0.35)));
    if (b[1] > HZ + 2) continue;
    if (Math.hypot(a[0] - c[0], a[1] - c[1]) < 1.6) o.push(DOT(...q(b), 0.55 + 0.2 * r(), 'tone', 'eraser'));
    else o.push(OP('s', [q(a), q(b), q(c)], 'tone', 'eraser', 0.22 + 0.1 * r()));
    made++;
  }
  return o;
}

/* It swings right, curls back on itself, and pours down into the reed bed. */
const flock = () => [PHASE('The flock'), ...murmur({
  keys: [[560, 300, 820], [820, 250, 760], [1120, 330, 700], [1180, 470, 720], [1000, 560, 760], [860, 660, 740], [780, 790, 720], [745, 922, 700]],
  halfWidth: (u) => 3 + 150 * gauss(u, 0.3, 0.22) + 50 * gauss(u, 0.6, 0.1) + 28 * gauss(u, 0.8, 0.1),
  // agitation: a wave of turning passes through the body as a denser band
  band: (u, v) => 0.6 + 0.4 * Math.max(gauss(u - 0.1 * v, 0.37, 0.035), 0.6 * gauss(u + 0.08 * v, 0.2, 0.03)),
  count: 40000, salt: 37,
})];

/* Far off and late, a small group on its way in. */
const latecomers = () => [PHASE('Latecomers'), ...murmur({
  keys: [[196, 468, 1700], [238, 446, 1660], [262, 470, 1640], [300, 452, 1620], [352, 470, 1600]],
  halfWidth: (u) => 3 + 30 * gauss(u, 0.3, 0.16) + 8 * gauss(u, 0.75, 0.15),
  twist: [2.0, 4.5], count: 520, salt: 43,
})];

/* ------------------------------------------------------------ the first stars */
function stars() {
  const r = stream(51);
  const o = [PHASE('The first stars')];
  for (const [x, y, s] of [[180, 90, 0.9], [1330, 70, 0.7], [1590, 170, 0.8], [420, 160, 0.6], [1720, 40, 0.65], [60, 260, 0.55]]) {
    o.push(DOT(x, y, s, 'accent', 'brush', [222, 230, 255], 0.5 + r() * 0.25));
  }
  // the evening star, low in the west, and a breath of halo around it
  o.push(DOT(1655, 640, 4.2, 'accent', 'brush', [205, 218, 242], 0.14));
  o.push(DOT(1655, 640, 1.25, 'accent', 'brush', [250, 250, 246], 0.95));
  return o;
}

const passes = [
  { name: 'Blue hour', note: 'The ground of the whole drawing: horizontal brush from a deep zenith to a pale band at the horizon.', review: {
    observation: 'Glaze wove a regular dither lattice at 2x; wash snapped into hard coloured stripes; a glow I laid low on the right came out darker than the sky under it.',
    change: 'Opaque brush rows 3.5-6px apart, nearly straight, each coloured from one ramp; the glow removed.',
    next: 'Faint horizontal seams remain in the darkest sky at fit view.', region: [0, 0, 700, 260] }, build: sky },
  { name: 'The ground', note: 'Clear below the horizon, then draw its edge: hedgerow and bare winter trees with the eraser, reeds with fine dark pencil, water as hairline glints.', review: {
    observation: 'Thin eraser reeds beaded into dotted lines; the first water was a glowing lens that looked pasted on; a sapling sat exactly where the birds come down.',
    change: 'Reeds in dark pencil, clumped with gaps; water as ninety short glints, brightest under the landing; sapling removed.',
    next: 'The reed bed still reads slightly as vertical hatching up close.', region: [430, 860, 700, 110] }, build: ground },
  { name: 'The flock', note: 'A curled, twisting sheet of birds in three dimensions, projected. Each bird is an eraser chevron or a lifted dot; the dark ridges are where the sheet turns edge-on to us.', review: {
    observation: 'The first flock, 7,000 birds on a flat twisted sheet high in the darkest sky, read as dust: no core, no fold, barely any contrast.',
    change: 'Curled the sheet so it turns edge-on, 40,000 birds, moved into lighter sky, and gave it a tail that pours into the reed bed.',
    next: 'The body is more even than a real flock; it wants a truer dark core.', region: [540, 60, 900, 700] }, build: flock },
  { name: 'Latecomers', note: 'A small, distant group in the empty sky on the left, still on its way in: depth for the main flock, and a diagonal from them to it to the reeds.', review: {
    observation: 'The first version was a clean arc, too big: an eyebrow in the sky.',
    change: 'Smaller, lower and looser: a knot with a thread.',
    next: '', region: [140, 400, 280, 110] }, build: latecomers },
  { name: 'The first stars', note: 'A few faint stars high up, and the evening star low in the west where the light went.', build: stars },
];

export default {
  title: 'each one watching seven',
  date: '2026-09-22',
  note: 'A murmuration at the blue hour, over the reed bed where they will roost. The sky is laid in with the brush; every bird is a small lift of that light with the eraser, so the flock is only the places where the sky has been taken away. No bird leads. Each one watches its nearest neighbours, about seven, and the shape is what that adds up to. The volume comes from a curled sheet in three dimensions: where it turns edge-on to us the birds stack into dark ridges. It failed first as dust (too few birds on a flat sheet, high in the darkest sky), then as a flock with a pasted-on pond. Still unresolved: faint seams in the upper sky, and a body more even than a real one.',
  page: { w: W, h: H },
  passes,
  build: () => passes.flatMap((p) => p.build()),
};
