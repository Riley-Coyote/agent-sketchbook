/* An oriole's egg, lying on the paper.
 *
 * The companion to the nest. That page was all line; this one is all tone,
 * with nothing to hide behind. The egg is a real solid in space
 * (centimetres), resting where its own weight would leave it, under the
 * nest's light moved a little to the side. What the chalk and the pencil do at any spot comes
 * from how much light that spot gets, through pressures measured on this
 * paper. The paper itself is the middle tone: chalk above it, pencil below.
 *
 * It is drawn five times life size, so the same ruled line that meant five
 * centimetres under the nest means one here. */
import { OP, PHASE, PAUSE, GLYPHS } from '../mark-engine.js';

/* The sealed box looks every global up the slow way: take hold of the maths once. */
const { sin, cos, exp, floor, hypot, sqrt, pow, imul, max, min, abs, atan2, PI, round, ceil } = Math;

const W = 1750, H = 2285;
const K = 400;                   // page px per centimetre
const OX = 700, OY = 1440;       // where the point it rests on sits on the page
const PITCH = 32 * PI / 180, CP = cos(PITCH), SP = sin(PITCH);
const VIEW = [0, SP, CP];        // toward the eye
const LIGHT = norm([-0.64, 0.70, 0.24]);            // from the upper left, as on the nest, and a little more from the side
const HALF = norm([LIGHT[0] + VIEW[0], LIGHT[1] + VIEW[1], LIGHT[2] + VIEW[2]]);

/* ------------------------------------------------------------ small maths */
function norm(v) { const l = hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const clamp = (v, lo = 0, hi = 1) => max(lo, min(hi, v));
const sm = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const rng = (a) => () => { a = a + 0x6D2B79F5 | 0; let t = imul(a ^ a >>> 15, 1 | a); t = t + imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const gauss = (r) => (r() + r() + r() + r() - 2) * 1.732;
const once = (make) => { let kept; return () => (kept ??= make()); };
const r2 = (v) => round(v * 100) / 100;
function h3(x, y, z) { let n = imul(x, 374761393) ^ imul(y, 668265263) ^ imul(z, 1274126177); n = imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967295; }
function vnoise(x, y, z) {
  const xi = floor(x), yi = floor(y), zi = floor(z);
  const fx = x - xi, fy = y - yi, fz = z - zi;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), sz = fz * fz * (3 - 2 * fz);
  const c = (i, j, k) => h3(xi + i, yi + j, zi + k);
  return mix(mix(mix(c(0, 0, 0), c(1, 0, 0), sx), mix(c(0, 1, 0), c(1, 1, 0), sx), sy), mix(mix(c(0, 0, 1), c(1, 0, 1), sx), mix(c(0, 1, 1), c(1, 1, 1), sx), sy), sz);
}

/* --------------------------------------------------------------- the egg */
/* Its outline is the egg curve of Hügelschäffer: a length, a breadth, and how
 * far the widest part sits from the middle. a runs along its axis, from the
 * blunt end (negative) to the pointed one. */
const EL = 2.35, EB = 1.6, EW = 0.13;
const rad2 = (a) => { const q = (EL * EL - 4 * a * a) / (EL * EL + 8 * EW * a + 4 * EW * EW); return q > 0 ? EB * EB / 4 * q : 0; };
const rad = (a) => sqrt(rad2(a));
const slope = (a) => { a = clamp(a, -EL / 2 + 2e-3, EL / 2 - 2e-3); return (rad(a + 1e-3) - rad(a - 1e-3)) / 2e-3; };
const R2N = 1024, R2 = new Float64Array(R2N + 1);
for (let i = 0; i <= R2N; i++) R2[i] = rad2(-EL / 2 + EL * i / R2N);
const r2at = (a) => { const u = (a + EL / 2) / EL * R2N; if (u <= 0 || u >= R2N) return 0; const i = floor(u); return R2[i] + (R2[i + 1] - R2[i]) * (u - i); };
/* Where it comes to rest. A solid egg lies with its weight straight above the
 * point it touches, which puts the pointed end a little lower than the blunt. */
const REST = (() => {
  let num = 0, den = 0;
  for (let i = 0; i < 4000; i++) { const a = -EL / 2 + EL * (i + 0.5) / 4000, r2 = rad2(a); num += a * r2; den += r2; }
  const centre = num / den;
  const f = (a) => centre - a - rad(a) * slope(a);
  let lo = -EW, hi = EL / 2 - 0.3;
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (f(mid) > 0) lo = mid; else hi = mid; }
  const a0 = (lo + hi) / 2, rp = slope(a0), l = sqrt(1 + rp * rp);
  return { a0, r0: rad(a0), ua: rp / l, uh: 1 / l, centre };
})();
const YAW = 28 * PI / 180;
const HEAD = [cos(YAW), 0, -sin(YAW)];            // which way the pointed end lies on the table: right, and away
const AX = [REST.uh * HEAD[0], REST.ua, REST.uh * HEAD[2]];            // the axis, toward the pointed end
const UPL = [-REST.ua * HEAD[0], REST.uh, -REST.ua * HEAD[2]];        // the egg's own up
const SIDE = [AX[1] * UPL[2] - AX[2] * UPL[1], AX[2] * UPL[0] - AX[0] * UPL[2], AX[0] * UPL[1] - AX[1] * UPL[0]];
/* egg's own coordinates (along, up, across) to the room's, and back */
const toRoom = (a, u, s) => { const da = a - REST.a0, du = u + REST.r0; return [da * AX[0] + du * UPL[0] + s * SIDE[0], da * AX[1] + du * UPL[1] + s * SIDE[1], da * AX[2] + du * UPL[2] + s * SIDE[2]]; };
const along = (P) => REST.a0 + dot(P, AX), upOf = (P) => dot(P, UPL) - REST.r0, across = (P) => dot(P, SIDE);
const proj = (P) => [OX + K * P[0], OY - K * (P[1] * CP - P[2] * SP)];
/* the spot on the table that a place on the page looks at */
const table = (x, y) => [(x - OX) / K, 0, (y - OY) / (K * SP)];

/* Does a ray from O along D pass through the egg? Returns a distance along it
 * that is inside, or -1; with `entry`, the last such distance, which is where
 * the eye's own ray first meets the shell. The egg has no hollows, so how far
 * inside the ray is has one hump: find its top, and stop as soon as it is in. */
const GOLD = 0.6180339887;
function pierce(O, D, entry = false) {
  const oa = along(O), ou = upOf(O), os = across(O), da = dot(D, AX), du = dot(D, UPL), ds = dot(D, SIDE);
  let t1 = 0, t2 = 9;
  if (abs(da) > 1e-9) { const p = (-EL / 2 - oa) / da, q = (EL / 2 - oa) / da; t1 = max(t1, min(p, q)); t2 = min(t2, max(p, q)); } else if (abs(oa) >= EL / 2) return -1;
  if (t2 <= t1) return -1;
  /* closest pass to the axis: if even that is outside the widest part, no hit */
  const dd = du * du + ds * ds;
  if (dd > 1e-12) { const tc = clamp(-(ou * du + os * ds) / dd, t1, t2), cu = ou + tc * du, cs = os + tc * ds; if (cu * cu + cs * cs > EB * EB / 4) return -1; }
  const f = (t) => { const u = ou + t * du, s = os + t * ds; return r2at(oa + t * da) - u * u - s * s; };
  let lo = t1, hi = t2, x1 = hi - GOLD * (hi - lo), x2 = lo + GOLD * (hi - lo), f1 = f(x1), f2 = f(x2), at = -1;
  for (let i = 0; i < 28 && at < 0; i++) {
    if (f1 > 0) at = x1; else if (f2 > 0) at = x2;
    else if (f1 < f2) { lo = x1; x1 = x2; f1 = f2; x2 = lo + GOLD * (hi - lo); f2 = f(x2); }
    else { hi = x2; x2 = x1; f2 = f1; x1 = hi - GOLD * (hi - lo); f1 = f(x1); }
  }
  if (at < 0 || !entry) return at;
  let a = at, b = t2;
  for (let k = 0; k < 24; k++) { const mid = (a + b) / 2; if (f(mid) > 0) a = mid; else b = mid; }
  return a;
}

/* ------------------------------------------------------------- the light */
const KEYW = 0.70, SKYW = 0.16, WRAP = 0.22;
const keyOn = (nl) => pow(clamp((nl + WRAP) / (1 + WRAP)), 1.25);
const FLAT = KEYW * keyOn(LIGHT[1]) + SKYW;            // what the bare table gets: this is the paper's own tone
const PAPER = pow(177 / 255, 2.2), SHELL = 1.5;            // the shell throws back half as much light again as the paper
const grey = (lin) => 255 * pow(clamp(lin), 1 / 2.2);
/* The lamp is not a point: a patch of it, so shadows have soft edges that
 * widen with distance. And the sky, for what the egg hides of it. */
const LAMP = (() => {
  const t1 = norm([LIGHT[1], -LIGHT[0], 0]), t2 = [LIGHT[1] * t1[2] - LIGHT[2] * t1[1], LIGHT[2] * t1[0] - LIGHT[0] * t1[2], LIGHT[0] * t1[1] - LIGHT[1] * t1[0]];
  const out = [];
  for (let i = 0; i < 96; i++) { const r = 0.15 * sqrt((i + 0.5) / 96), a = i * 2.39996; out.push(norm([LIGHT[0] + r * (cos(a) * t1[0] + sin(a) * t2[0]), LIGHT[1] + r * (cos(a) * t1[1] + sin(a) * t2[1]), LIGHT[2] + r * (cos(a) * t1[2] + sin(a) * t2[2])])); }
  return out;
})();
const SKY = (() => { const out = []; for (let i = 0; i < 120; i++) { const u = (i + 0.5) / 120, a = i * 2.39996, s = sqrt(u); out.push([s * cos(a), sqrt(1 - u), s * sin(a)]); } return out; })();
/* How much of the lamp, and of the sky, the egg hides from a spot on the table. */
function hidden(X, Z) {
  const O = [X, 0.0005, Z];
  let lamp = 0, sky = 0;
  for (const d of LAMP) if (pierce(O, d) >= 0) lamp++;
  for (const d of SKY) if (pierce(O, d) >= 0) sky++;
  return [lamp / LAMP.length, sky / SKY.length];
}
/* The table's light, worked out once on a grid and read back smoothly: a
 * coarse one for the whole shadow, and a fine one close in, where the shadow
 * is sharp. The fine one skips the table the eye cannot see. */
function shadeGrid(x0, x1, z0, z1, step, seenOnly) {
  const nx = ceil((x1 - x0) / step) + 1, nz = ceil((z1 - z0) / step) + 1, lamp = new Float32Array(nx * nz), sky = new Float32Array(nx * nz);
  let seen = null;
  if (seenOnly) { seen = new Uint8Array(nx * nz); for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) seen[j * nx + i] = pierce([x0 + i * step, 0.0005, z0 + j * step], VIEW) < 0 ? 1 : 0; }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i;
    if (seen) { let any = 0; for (let b = max(0, j - 1); b <= min(nz - 1, j + 1) && !any; b++) for (let a = max(0, i - 1); a <= min(nx - 1, i + 1); a++) if (seen[b * nx + a]) { any = 1; break; } if (!any) { lamp[k] = NaN; continue; } }
    const h = hidden(x0 + i * step, z0 + j * step); lamp[k] = h[0]; sky[k] = h[1];
  }
  return { x0, z0, step, nx, nz, lamp, sky };
}
function readGrid(g, X, Z) {
  const u = (X - g.x0) / g.step, v = (Z - g.z0) / g.step;
  if (u < 0 || v < 0 || u >= g.nx - 1 || v >= g.nz - 1) return null;
  const i = floor(u), j = floor(v), fu = u - i, fv = v - j, k = j * g.nx + i, a = g.lamp[k], b = g.lamp[k + 1], c = g.lamp[k + g.nx], d = g.lamp[k + g.nx + 1];
  if (a !== a || b !== b || c !== c || d !== d) return null;
  return [mix(mix(a, b, fu), mix(c, d, fu), fv), mix(mix(g.sky[k], g.sky[k + 1], fu), mix(g.sky[k + g.nx], g.sky[k + g.nx + 1], fu), fv)];
}
const GX0 = -2.4, GX1 = 3.9, GZ0 = -3.4, GZ1 = 1.9;
const FAR = once(() => shadeGrid(GX0, GX1, GZ0, GZ1, 0.025, false)), NEAR = once(() => shadeGrid(-1.3, 1.7, -1.5, 1.0, 0.0125, true));
const shade = (X, Z) => readGrid(NEAR(), X, Z) || readGrid(FAR(), X, Z) || [0, 0];
/* The tone of the table at a spot (0..255); 177 is bare paper. */
function tableTone(X, Z) {
  const [lamp, sky] = shade(X, Z);
  return grey(PAPER * (KEYW * keyOn(LIGHT[1]) * (1 - lamp) + SKYW * (1 - sky)) / FLAT);
}
/* A place on the shell: a along the axis, phi round it (0 is its own top). */
function shell(a, phi) {
  const r = rad(a), rp = slope(a), l = sqrt(1 + rp * rp), c = cos(phi), s = sin(phi);
  const P = toRoom(a, r * c, r * s);
  const nl = [-rp / l, c / l, s / l];
  const n = [nl[0] * AX[0] + nl[1] * UPL[0] + nl[2] * SIDE[0], nl[0] * AX[1] + nl[1] * UPL[1] + nl[2] * SIDE[1], nl[0] * AX[2] + nl[1] * UPL[2] + nl[2] * SIDE[2]];
  return { P, n };
}
/* The light a place on the shell gets, and the tone that makes (0..255).
 * Key, sky, what the lit table sends back up, the dark of the gap where it
 * nearly touches, and a soft shine. */
function shellLight(P, n) {
  const key = keyOn(dot(n, LIGHT));
  const down = clamp(-n[1]);
  const gap = sm(0, 0.42, P[1]);            // near the table the sky and the bounce are both shut out
  const sky = (0.5 + 0.5 * n[1]) * mix(1, gap, down);
  const there = shade(P[0] + n[0] * 0.45, P[2] + n[2] * 0.45);
  /* a face sees the table over the part of its view that lies below the horizon: half of it when it stands upright */
  const bounce = PAPER * FLAT * 0.5 * (1 - n[1]) * sm(0.01, 0.5, P[1]) * (1 - 0.8 * there[0]);
  const nh = clamp(dot(n, HALF));
  return { e: KEYW * key + SKYW * sky + bounce, shine: 0.05 * pow(nh, 26) + 0.10 * pow(nh, 240) };
}
function shellTone(a, phi) {
  const { P, n } = shell(a, phi), l = shellLight(P, n);
  const cloud = 1 + 0.05 * (vnoise(a * 2.6 + 3, cos(phi) * 1.6 + 7, sin(phi) * 1.6) - 0.5);
  return grey(PAPER * SHELL * cloud * l.e / FLAT + l.shine);
}
/* What a place on the page looks at: the shell (and where on it), or the table. */
function look(x, y) {
  const O = table(x, y), t = pierce(O, VIEW, true);
  if (t < 0) return null;
  const P = [O[0] + t * VIEW[0], O[1] + t * VIEW[1], O[2] + t * VIEW[2]];
  return { a: along(P), phi: atan2(across(P), upOf(P)) };
}
/* The tone the finished drawing should have at a place on the page, and
 * whether that place shows the shell. Both are exported so a drawn page can
 * be measured against its plan. */
export function tone(x, y) {
  const on = look(x, y);
  if (on) return shellTone(on.a, on.phi);
  const O = table(x, y);
  return tableTone(O[0], O[2]);
}
export const on = (x, y) => !!look(x, y);

/* ------------------------------------------------------------ the outline */
/* Seen from the eye, the part of the ring at a that shows is where
 * cos(phi - PSI) is more than limb(a). Where they are equal is the outline. */
const VA = dot(VIEW, AX), VU = dot(VIEW, UPL), VS = dot(VIEW, SIDE), RHO = hypot(VU, VS), PSI = atan2(VS, VU);
const limb = (a) => slope(a) * VA / RHO;
const OUTLINE = (() => {
  const N = 200, pts = [], nrm = [];
  const solve = (c) => { let lo = -EL / 2 + 2e-3, hi = EL / 2 - 2e-3; for (let i = 0; i < 50; i++) { const mid = (lo + hi) / 2; if (limb(mid) < c) lo = mid; else hi = mid; } return (lo + hi) / 2; };
  const put = (beta, sign) => { const a = solve(cos(beta)), { P, n } = shell(a, PSI + sign * beta), nx = n[0], ny = -(n[1] * CP - n[2] * SP), l = hypot(nx, ny) || 1; pts.push(proj(P)); nrm.push([nx / l, ny / l]); };
  for (let i = 0; i < N; i++) put(PI * (1 - i / N), 1);
  for (let i = 0; i < N; i++) put(PI * i / N, -1);
  return { pts, nrm };
})();
/* the outline moved d px outward (inward when d is negative) */
const ring = (d) => OUTLINE.pts.map((q, i) => [q[0] + d * OUTLINE.nrm[i][0], q[1] + d * OUTLINE.nrm[i][1]]);
const BOX = (() => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const q of OUTLINE.pts) { x0 = min(x0, q[0]); y0 = min(y0, q[1]); x1 = max(x1, q[0]); y1 = max(y1, q[1]); } return [x0, y0, x1, y1]; })();
/* Where the line through c along d runs inside an outline with no hollows: [t0, t1], or null. */
function chord(poly, cx, cy, dx, dy) {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0, n = poly.length; i < n; i++) {
    const A = poly[i], B = poly[(i + 1) % n], ex = B[0] - A[0], ey = B[1] - A[1], den = dx * ey - dy * ex;
    if (abs(den) < 1e-12) continue;
    const wx = A[0] - cx, wy = A[1] - cy, u = (wx * dy - wy * dx) / den;
    if (u < 0 || u >= 1) continue;
    const t = (wx * ey - wy * ex) / den;
    if (t < lo) lo = t; if (t > hi) hi = t;
  }
  return hi > lo ? [lo, hi] : null;
}
const within = (poly) => (cx, cy, dx, dy) => { const c = chord(poly, cx, cy, dx, dy); return c ? [c] : []; };
const outside = (poly) => (cx, cy, dx, dy, R) => { const c = chord(poly, cx, cy, dx, dy); return c ? [[-R, c[0]], [c[1], R]] : [[-R, R]]; };

/* The shell's tone over the page, worked out once and read back smoothly. */
const SHELLMAP = once(() => {
  const s = 2, x0 = floor(BOX[0]) - 8, y0 = floor(BOX[1]) - 8, nx = ceil((BOX[2] - BOX[0] + 16) / s) + 1, ny = ceil((BOX[3] - BOX[1] + 16) / s) + 1;
  const v = new Float32Array(nx * ny).fill(-1);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const o = look(x0 + i * s, y0 + j * s); if (o) v[j * nx + i] = shellTone(o.a, o.phi); }
  /* carry the edge a little way out, so reading between cells never mixes the table in */
  const near = [-1, 1, -nx, nx, -nx - 1, -nx + 1, nx - 1, nx + 1];
  for (let pass = 0; pass < 5; pass++) { const w = v.slice(); for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) { const k = j * nx + i; if (w[k] >= 0) continue; let sum = 0, n = 0; for (const d of near) if (w[k + d] >= 0) { sum += w[k + d]; n++; } if (n) v[k] = sum / n; } }
  return { s, x0, y0, nx, ny, v };
});
function shellAt(x, y) {
  const g = SHELLMAP(), u = (x - g.x0) / g.s, w = (y - g.y0) / g.s;
  if (u < 0 || w < 0 || u >= g.nx - 1 || w >= g.ny - 1) return 177;
  const i = floor(u), j = floor(w), fu = u - i, fw = w - j, k = j * g.nx + i, a = g.v[k], b = g.v[k + 1], c = g.v[k + g.nx], d = g.v[k + g.nx + 1];
  if (a < 0 || b < 0 || c < 0 || d < 0) return 177;
  return mix(mix(a, b, fu), mix(c, d, fu), fw);
}
const tableAt = (x, y) => { const O = table(x, y); return tableTone(O[0], O[2]); };
/* the part of the page the shadow on the table reaches */
const SHADOWBOX = once(() => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (let y = 600; y < 1950; y += 6) for (let x = 40; x < 1710; x += 6) if (tableAt(x, y) < 176.3) { x0 = min(x0, x); y0 = min(y0, y); x1 = max(x1, x); y1 = max(y1, y); } return [x0 - 8, y0 - 8, x1 + 8, y1 + 8]; });

/* ------------------------------------------------------------- the marks */
/* Measured on this paper, in fields of close strokes: the tone three coats of
 * chalk leave at one pressure, and the tone two crossed coats of soft pencil
 * leave once rubbed. Read backwards, they say how hard to press for a tone. */
const ramp = (pairs) => (v) => { if (v <= pairs[0][0]) return pairs[0][1]; for (let i = 1; i < pairs.length; i++) if (v <= pairs[i][0]) { const A = pairs[i - 1], B = pairs[i]; return A[1] + (B[1] - A[1]) * (v - A[0]) / (B[0] - A[0]); } return pairs[pairs.length - 1][1]; };
const CHALK = ramp([[177, 0], [185, 0.1], [197, 0.2], [213, 0.35], [225, 0.5], [237, 0.75], [244, 1]]);
const SOFT = ramp([[54, 0.74], [74, 0.555], [102, 0.37], [121, 0.26], [143, 0.15], [160, 0.076], [169, 0.038], [177, 0]]);
const DEEP = ramp([[33, 0.8], [45, 0.35], [57, 0]]);

/* pts: [x, y, pressure]. tau is milliseconds per pixel: slower leaves more. */
function gesture(tool, size, pts, tau = 10, strength = 1) {
  const samples = [];
  let t = 0, total = 0;
  for (let i = 1; i < pts.length; i++) total += hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  const k = min(1, 58000 / max(1, total * tau));
  for (let i = 0; i < pts.length; i++) {
    if (i) t += max(1, round(hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) * tau * k));
    samples.push({ x: r2(pts[i][0]), y: r2(pts[i][1]), p: round(clamp(pts[i][2]) * 1000) / 1000, t });
  }
  return { k: 'm', tool, size: r2(size), strength, samples };
}
/* Close parallel strokes over a box, back and forth as a hand shades. Each
 * place along a stroke asks `press` how hard; where the answer is nothing the
 * stroke lifts. `clip` keeps the strokes to one side of an outline. With
 * `reach`, a line is laid as a hand lays it: in strokes about that long, each
 * a touch off the line and a touch lighter or heavier than the last, each
 * taking up where the one before let go. Nothing wanders far: let it, and the
 * tone turns to scratches. */
const LIGHTEST = 0.012;
function field({ tool, size, tau, angle, gap, box, press, clip, r, step = 4, phase = 0, wander = 0.12, sway = 0.0015, uneven = 0.03, reach = 0, eachLine = null }) {
  const out = [], cx = (box[0] + box[2]) / 2, cy = (box[1] + box[3]) / 2, R = hypot(box[2] - box[0], box[3] - box[1]) / 2 + 2;
  let back = false;
  for (let off = -R + phase; off <= R; off += gap) {
    const ang = angle + (r() - 0.5) * 2 * sway, c = cos(ang), s = sin(ang), o = off + (r() - 0.5) * 2 * wander, px = cx - sin(angle) * o, py = cy + cos(angle) * o, hand = 1 + uneven * gauss(r);
    back = !back;
    if (eachLine) eachLine();
    for (const [t0, t1] of clip(px, py, c, s, R)) {
      const n = max(1, ceil((t1 - t0) / step));
      let run = [];
      const lay = (pts) => { if (pts.length > 1) out.push(gesture(tool, size, back ? pts.reverse() : pts, tau)); };
      const lift = () => {
        if (!reach || run.length < 6) { lay(run); run = []; return; }
        /* cut the run into strokes that share their end points, each end pressed half as hard */
        let i = 0;
        while (i < run.length - 1) {
          const len = max(3, round(reach * (0.6 + 0.8 * r()) / step)), j = run.length - 1 - (i + len) < 3 ? run.length - 1 : i + len, mid = (i + j) / 2, turn = (r() - 0.5) * 0.02, weight = 1 + 0.05 * gauss(r), ct = cos(turn), st = sin(turn), mx = (run[i][0] + run[j][0]) / 2, my = (run[i][1] + run[j][1]) / 2, piece = [];
          for (let k = i; k <= j; k++) { const dx = run[k][0] - mx, dy = run[k][1] - my, end = (k === i && i > 0) || (k === j && j < run.length - 1) ? 0.5 : 1; piece.push([mx + dx * ct - dy * st, my + dx * st + dy * ct, run[k][2] * weight * end]); }
          lay(piece); back = !back; i = j;
        }
        run = [];
      };
      for (let i = 0; i <= n; i++) {
        const t = t0 + (t1 - t0) * i / n, x = px + c * t, y = py + s * t;
        if (x < box[0] || x > box[2] || y < box[1] || y > box[3]) { lift(); continue; }
        const p = press(x, y);
        if (p >= LIGHTEST) run.push([x, y, p * hand]); else lift();
      }
      lift();
    }
  }
  return out;
}
const grow = (b, d) => [b[0] - d, b[1] - d, b[2] + d, b[3] + d];
/* Rubbing with the paper stump: it keeps the tone and smooths the grain. A
 * loaded stump leaves a smudge wherever it next touches lighter ground, so
 * each stroke stays within one band of tone (`read` gives the tone, `bands`
 * the limits), and the bands are worked from the palest to the strongest, as
 * a hand would. Every stroke takes the limits a little differently, or the
 * places where strokes stop would line up and show as a seam. The stump is
 * wiped at the end. */
const WIPE = { k: 'clean', tool: 'stump' };
function rub(angle, box, clip, read, bands, r, p = 1, size = 16) {
  const out = [];
  for (let i = 1; i < bands.length; i++) {
    const lo = min(bands[i - 1], bands[i]), hi = max(bands[i - 1], bands[i]), first = i === 1, last = i === bands.length - 1;
    let a = lo, b = hi;
    out.push(...field({ tool: 'stump', size, tau: 8, angle, gap: size / 2, step: 8, box, clip, r, uneven: 0, eachLine: () => { const j = (r() - 0.5) * 16, k = (r() - 0.5) * 16; a = lo + ((bands[0] < bands[1] ? first : last) ? 0 : j); b = hi + ((bands[0] < bands[1] ? last : first) ? 0 : k); }, press: (x, y) => { const v = read(x, y); return v >= a && v < b ? p : 0; } }));
  }
  out.push(WIPE);
  return out;
}
const SHADES = [176.5, 160, 138, 112, 86, 0], LIGHTS = [177.5, 256];
/* Along the outline itself the strokes follow it, as a hand does to keep an
 * edge clean: one turn for each distance in `ds` (px outward from it). */
function edging(tool, size, tau, ds, press) {
  const out = [];
  for (const d of ds) {
    const pts = ring(d);
    let run = [];
    const lift = () => { if (run.length > 1) out.push(gesture(tool, size, run, tau)); run = []; };
    for (let i = 0; i <= pts.length; i++) { const q = pts[i % pts.length], v = press(q[0], q[1]); if (v >= LIGHTEST) run.push([q[0], q[1], v]); else lift(); }
    lift();
  }
  return out;
}
/* three coats of soft pencil, none square to another, so no weave shows */
const PENCIL = [[-0.86, 0], [-0.42, 0.7], [0.22, 1.3]];

function castShadow() {
  const r = rng(11), ops = [PHASE('the shadow it lies in')], box = SHADOWBOX(), away = outside(ring(4)), off = outside(ring(9));
  const soft = (x, y) => SOFT(tableAt(x, y)), deep = (x, y) => DEEP(tableAt(x, y));
  for (const [angle, phase] of PENCIL) ops.push(...field({ tool: 'graphite-6b', size: 3, tau: 12, angle, gap: 2, phase, box, clip: away, press: soft, r, reach: 120 }), ...edging('graphite-6b', 3, 12, [1.2, 3], soft));
  ops.push(...rub(0.7, box, off, tableAt, SHADES, r), ...rub(-0.3, box, off, tableAt, SHADES, r));
  /* under the egg itself, where almost nothing gets in: charcoal, left as it falls */
  for (const [angle, phase] of [[-0.3, 0], [0.5, 0.6]]) ops.push(...field({ tool: 'compressed-charcoal', size: 3, tau: 8, angle, gap: 2, phase, box, clip: away, press: deep, r }), ...edging('compressed-charcoal', 3, 8, [1.2, 3], deep));
  return ops;
}
function turning() {
  const r = rng(23), ops = [PHASE('the turning')], box = grow(BOX, 4), inside = within(ring(-4)), deep = within(ring(-9)), soft = (x, y) => SOFT(shellAt(x, y));
  for (const [angle, phase] of PENCIL) ops.push(...field({ tool: 'graphite-6b', size: 3, tau: 12, angle, gap: 2, phase, box, clip: inside, press: soft, r, reach: 120 }), ...edging('graphite-6b', 3, 12, [-1.2, -3], soft));
  ops.push(...rub(0.7, box, deep, shellAt, SHADES, r), ...rub(-0.3, box, deep, shellAt, SHADES, r));
  return ops;
}
function light() {
  const r = rng(37), ops = [PHASE('the light')], box = grow(BOX, 4), inside = within(ring(-4)), deep = within(ring(-7)), lit = (x, y) => CHALK(shellAt(x, y));
  const coat = (angle, phase) => [...field({ tool: 'white-chalk', size: 3, tau: 40, angle, gap: 2, phase, box, clip: inside, press: lit, r, reach: 110 }), ...edging('white-chalk', 3, 40, [-1.3, -3], lit)];
  const smooth = (angle) => rub(angle, box, deep, shellAt, LIGHTS, r, 0.7, 12);
  ops.push(...coat(-0.86, 0), ...smooth(0.3), ...coat(0.5, 0.7), ...smooth(-0.5), ...coat(-0.2, 1.3), ...smooth(1.37), ...smooth(0.1));
  return ops;
}

/* ----------------------------------------------------------- the writing */
/* An oriole's egg is scrawled as if someone had tried a pen on it. Each mark
 * here is a line walked over the shell itself, a few thousandths of a
 * centimetre at a step. `th` is its heading: 0 is round the egg, a quarter
 * turn is toward the pointed end. What wanders is not the heading but how
 * hard the line is turning, so it meanders and loops like a pen kept moving,
 * and never kinks like a crack. Left alone it comes back to running round the
 * egg, as the real ones mostly do. Now and then the pen doubles back, throws
 * a curl, or pools. It thickens where it turns tightly, it trembles a little,
 * and here and there it runs dry and takes up again. */
const STEP = 0.006;
function walk(seed, o) {
  const r = rng(seed), n = max(2, round(o.len / STEP)), pts = [];
  let a = o.a, phi = o.phi, th = o.th, bend = 0, curl = 0, rate = 0, u = 0, shake = 0, wet = 0.6, pool = 0, poolLen = 1;
  for (let i = 0; i < n; i++) {
    a = clamp(a, -EL / 2 + 0.012, EL / 2 - 0.012);
    const S = shell(a, phi), A = norm(cross(AX, S.n)), M = cross(S.n, A), h = th + shake, c = cos(h), sn = sin(h);
    const T = [c * A[0] + sn * M[0], c * A[1] + sn * M[1], c * A[2] + sn * M[2]], t = i / (n - 1), turning = bend + (curl > 0 ? rate : 0);
    u += -u * STEP / 0.22 + sqrt(2 * STEP / 0.22) * gauss(r);
    wet += -wet * STEP / 0.3 + sqrt(2 * STEP / 0.3) * gauss(r);
    const swell = pool > 0 ? 1 + 1.6 * pow(sin(PI * pool / poolLen), 2) : 1;
    pts.push({ P: S.P, n: S.n, T, w: o.w * exp(0.5 * u) * swell * (1 + 0.6 * min(1, abs(turning) / 45)) * (o.head ? sm(0, o.head, t) * 0.85 + 0.15 : 1) * (1 - 0.88 * sm(o.tail ?? 0.65, 1, t)), f: o.dry ? sm(-1.65, -0.7, wet) : 1 });
    const Q = [S.P[0] + T[0] * STEP, S.P[1] + T[1] * STEP, S.P[2] + T[2] * STEP];
    a = along(Q); phi = atan2(across(Q), upOf(Q));
    bend += -bend * STEP / o.reach + o.rove * sqrt(2 * STEP / o.reach) * gauss(r);
    shake += -shake * STEP / 0.02 + 0.11 * sqrt(2 * STEP / 0.02) * gauss(r);
    th += turning * STEP - o.keep * sin(2 * th) * STEP + (o.home === undefined ? 0 : o.pull * (o.home - a) * cos(th) * STEP);
    if (pool > 0) pool -= STEP; else if (r() < (o.pools ?? 0) * STEP) { poolLen = 0.03 + 0.06 * r(); pool = poolLen; }
    if (curl > 0) curl -= abs(rate) * STEP;
    else { const e = r(); if (e < o.flicks * STEP) th += PI + 0.7 * gauss(r); else if (e < (o.flicks + o.curls) * STEP) { curl = 3.6 + 4.6 * r(); rate = (r() < 0.5 ? -1 : 1) / (0.016 + 0.04 * r()); } }
    if ((a < -EL / 2 + 0.05 && sin(th) < 0) || (a > EL / 2 - 0.12 && sin(th) > 0)) th = -th;
  }
  return pts;
}
/* where on the shell a mark begins: most of them round the big end */
const place = (r, wreath) => ({ a: wreath ? clamp(-0.55 + 0.23 * gauss(r), -1.06, 0.2) : -1.08 + 2.05 * pow(r(), 2.2), phi: 2 * PI * r() });
/* A spot on the shell as the eye has it: where on the page, how squarely it
 * faces, and the tone of the shell there. Nothing, if it is round the back. */
function seen(S) {
  const facing = dot(S.n, VIEW);
  if (facing <= 0.03) return null;
  const l = shellLight(S.P, S.n), q = proj(S.P);
  return { x: q[0], y: q[1], facing, tone: grey(PAPER * SHELL * l.e / FLAT + l.shine) };
}
/* the stretches of a walked line that show and are not dry: [first, last] sample of each */
function stretches(m, vis) { const ok = (k) => vis[k] && m.pts[k].f > 0.08, out = []; let i = 0; while (i < vis.length) { if (!ok(i)) { i++; continue; } let j = i; while (j + 1 < vis.length && ok(j + 1)) j++; if (j > i) out.push([i, j]); i = j + 1; } return out; }
/* A walked line, drawn: short strokes that overlap by half. A wide stretch is
 * several fine strokes side by side, so its edges stay sharp. Over chalk
 * nothing dark will take, so where the shell is chalked a sharp eraser lifts
 * a channel first and the line is drawn in it. Thin stretches are pressed
 * lighter, as a pen starved of ink writes paler. `tint` then goes over it in
 * paint, very thin (a stroke of this brush is many stamps deep, and a little
 * opacity is soon a lot): the brown that makes the black fuscous. */
const HOP = 7, SPAN = 14, LANE = 1.25;
/* a colour as it is under the light that falls there: the brown is darker in the shadow, like the shell round it */
const shaded = (c, tone) => { const k = clamp(tone / 235, 0.4, 1); return [round(c[0] * k), round(c[1] * k), round(c[2] * k)]; };
function drawn(m, out, { tool = 'compressed-charcoal', rounds = 1, lift = true, press = 1, tint = null, soft = false, core = false, seed = 1 } = {}) {
  const vis = m.pts.map(seen), { erase, draw, paint } = out, r = rng(seed);
  /* how wide and how wet the line is at each sample: it narrows as it runs dry, and to a point where a stretch begins or ends */
  const wide = new Float64Array(m.pts.length), wet = new Float64Array(m.pts.length);
  let grain = 0;
  for (const [i, j] of stretches(m, vis)) for (let k = i; k <= j; k++) {
    const q = m.pts[k], ends = min(1, (k - i + 0.5) / 5, (j - k + 0.5) / 5);
    grain += -grain * 0.25 + 0.7 * gauss(r) * 0.25;
    wide[k] = q.w * K * (m.spread ?? 1) * (0.35 + 0.65 * q.f) * (0.4 + 0.6 * ends);
    wet[k] = press * m.ink * q.f * (0.45 + 0.55 * clamp(q.w / m.w0, 0.25, 1)) * (0.3 + 0.7 * ends) * (1 + (soft ? 0.5 : 0.18) * clamp(grain, -1.5, 1.5)) * sm(0.03, 0.2, vis[k].facing);
  }
  for (const [i, j] of stretches(m, vis)) for (let again = 0; again < rounds; again++) for (let a = i + (again ? 3 : 0); a < j; a += HOP) {
    const b = min(j, a + SPAN), rubbed = [], centre = [];
    let w = 0, chalked = 0, inked = 0;
    for (let k = a; k <= b; k++) { w += wide[k]; inked += wet[k]; if (vis[k].tone > 181) chalked++; }
    w /= b - a + 1; inked /= b - a + 1;
    const lanes = max(1, round(w / LANE)), size = lanes === 1 ? clamp(w, 1.2, 2.3) : 2.2;
    for (let l = 0; l < lanes; l++) {
      const off = (l - (lanes - 1) / 2) * LANE / K, pts = [], edge = soft && lanes > 2 && (l === 0 || l === lanes - 1) ? 0.5 : 1;
      for (let k = a; k <= b; k++) {
        const V = vis[k], q = m.pts[k], B = cross(q.n, q.T), at = off ? proj([q.P[0] + B[0] * off, q.P[1] + B[1] * off, q.P[2] + B[2] * off]) : [V.x, V.y], end = (k === a && a > i) || (k === b && b < j) ? 0.6 : 1;
        pts.push([at[0], at[1], wet[k] * end * edge]);
        if (!l) { rubbed.push([V.x, V.y, sm(0.05, 0.25, V.facing) * sm(0.08, 0.5, q.f)]); centre.push([r2(V.x), r2(V.y)]); }
      }
      draw.push(gesture(tool, size, pts, 30));
    }
    /* the middle of a wide stretch once more with a fine point: pigment is densest there, and it gives the line a hard heart */
    if (core && !again && w > 2.6) draw.push(gesture('compressed-charcoal', 1.3, centre.map((q, n) => [q[0], q[1], min(1, inked * 1.25) * (n === 0 || n === centre.length - 1 ? 0.6 : 1)]), 36));
    if (lift && !again && chalked > (b - a + 1) / 2) erase.push(gesture('precision-eraser', clamp(w + 0.5, 1.6, 12), rubbed, 20));
    if (tint && !again) paint.push(OP('s', centre, 'line', 'pencil', r2(clamp((w + 0.8) / 0.85, 0.3, 6)), shaded(tint, vis[(a + b) >> 1].tone), round(clamp(0.023 * inked / (1 + w / 14), 0.004, 0.023) * 1000) / 1000));
    if (b === j) break;
  }
}
/* A blot: a small pool with an uneven edge, longer one way than the other,
 * filled with close strokes in two crossed coats. A speck: one dab. */
function blot(S, T, R, m, out, r, tint) {
  const V = seen(S);
  if (!V) return;
  const B = cross(S.n, T), at = (x, y) => proj([S.P[0] + T[0] * x + B[0] * y, S.P[1] + T[1] * x + B[1] * y, S.P[2] + T[2] * x + B[2] * y]), p = m.ink * sm(0.03, 0.2, V.facing);
  if (R * K < 2.2) {
    const q = at(0, 0), size = clamp(2 * R * K, 1.2, 4.4), dab = { k: 'm', tool: 'compressed-charcoal', size: r2(size), strength: 1, samples: [{ x: r2(q[0]), y: r2(q[1]), p: r2(p), t: 0 }, { x: r2(q[0] + 0.4), y: r2(q[1] + 0.2), p: r2(p), t: 260 }] };
    if (V.tone > 181) out.erase.push({ ...dab, tool: 'precision-eraser', size: r2(size + 0.4), samples: dab.samples.map((q2) => ({ ...q2, p: 1, t: q2.t ? 120 : 0 })) });
    out.draw.push(dab);
    return;
  }
  const long = 1 + 0.9 * r(), l1 = r() * 6.28, d1 = 0.1 + 0.2 * r(), l2 = r() * 6.28, d2 = 0.08 + 0.16 * r(), l3 = r() * 6.28, d3 = 0.04 + 0.08 * r(), pitch = 1.1 / K, reachX = R * long * 1.45, reachY = R * 1.45;
  /* the second coat stops short of the edge: the pool is deepest in the middle */
  const inside = (x, y, part) => { const ang = atan2(y, x / long); return hypot(x / long, y) < part * R * (1 + d1 * sin(2 * ang + l1) + d2 * sin(3 * ang + l2) + d3 * sin(5 * ang + l3)); };
  for (let coat = 0; coat < 2; coat++) {
    let back = false;
    for (let v = -(coat ? reachX : reachY); v <= (coat ? reachX : reachY); v += pitch) {
      let run = [];
      const lay = () => { if (run.length > 1) { const pts = back ? run.reverse() : run; if (!coat && V.tone > 181) out.erase.push(gesture('precision-eraser', 2.6, pts.map((q) => [q[0], q[1], 1]), 16)); out.draw.push(gesture('compressed-charcoal', 2.2, pts, 26)); if (tint && !coat) out.paint.push(OP('s', pts.map((q) => [r2(q[0]), r2(q[1])]), 'line', 'pencil', 1.5, shaded(tint, V.tone), round(0.085 * p * 1000) / 1000)); back = !back; } run = []; };
      for (let u = -(coat ? reachY : reachX); u <= (coat ? reachY : reachX); u += pitch) { const x = coat ? v : u, y = coat ? u : v; if (inside(x, y, coat ? 0.78 : 1)) { const q = at(x, y); run.push([q[0], q[1], p * (coat ? 1 : 0.8) * (0.9 + 0.2 * r())]); } else lay(); }
      lay();
    }
  }
}
const SEPIA = [86, 50, 30];            // thin brown over the black: fuscous
/* All the marks: where each begins, how it goes. */
function scrawl(seed) {
  const r = rng(seed), dark = [], pale = [], spots = [];
  const line = (o, into, ink) => { const at = place(r, o.wreath), m = { pts: walk(seed * 31 + 1000 + into.length * 7 + (into === pale ? 500 : 0), { ...o, ...at, home: o.pull ? at.a : undefined, th: (r() < 0.5 ? 0 : PI) + o.spread * gauss(r) }), ink, w0: o.w }; into.push(m); return m; };
  for (let i = 0; i < 8; i++) { const blotted = r() < 0.3, m = line({ wreath: true, len: 1.2 + 2.2 * r(), w: 0.006 + 0.007 * r(), reach: 0.09, rove: 11, keep: 6, pull: 2.5, flicks: 0.3, curls: 0.5, pools: 1.7, dry: true, spread: 0.3, head: blotted ? 0 : 0.05, tail: 0.55 }, dark, 0.78 + 0.22 * r()); if (blotted) m.blot = m.w0 * (1.8 + 1.8 * r()); }
  for (let i = 0; i < 22; i++) { const blotted = r() < 0.25, m = line({ wreath: r() < 0.85, len: 0.3 + 0.9 * r(), w: 0.005 + 0.007 * r(), reach: 0.07, rove: 13, keep: 2.5, flicks: 0.5, curls: 0.8, pools: 1.8, dry: true, spread: 0.8, head: blotted ? 0 : 0.1 }, dark, 0.62 + 0.38 * r()); if (blotted) m.blot = m.w0 * (1.8 + 2.2 * r()); }
  for (let i = 0; i < 60; i++) line({ wreath: r() < 0.8, len: 0.04 + 0.2 * r(), w: 0.006 + 0.01 * r(), reach: 0.05, rove: 18, keep: 0.5, flicks: 0, curls: 0.6, spread: 1.6, head: 0.2, tail: 0.45 }, dark, 0.55 + 0.45 * r());
  for (let i = 0; i < 130; i++) { const at = place(r, r() < 0.72); spots.push({ ...at, R: i < 8 ? 0.012 + 0.024 * r() : 0.0015 + 0.0055 * r() * r(), ink: 0.55 + 0.45 * r(), turn: r() * 6.28 }); }
  for (let i = 0; i < 4; i++) line({ wreath: true, len: 1 + 2 * r(), w: 0.0045 + 0.004 * r(), reach: 0.1, rove: 8, keep: 6, pull: 3, flicks: 0.2, curls: 0.3, dry: true, spread: 0.4, head: 0.08 }, pale, 0.6 + 0.4 * r());
  for (let i = 0; i < 12; i++) line({ wreath: r() < 0.8, len: 0.1 + 0.4 * r(), w: 0.006 + 0.009 * r(), reach: 0.06, rove: 14, keep: 1, flicks: 0.4, curls: 0.5, pools: 2, spread: 1.2, head: 0.15, tail: 0.5 }, pale, 0.5 + 0.5 * r());
  return { dark, pale, spots };
}
const MARKS = once(() => scrawl(127));            // the eighteenth scrawling tried: it gathers at the big end and leaves the point clean
/* The obscure marks: pigment laid down early and shelled over, so it shows
 * through pale. One light pass of pencil over the finished shell. */
function obscure() {
  const out = { erase: [], draw: [], paint: [] };
  MARKS().pale.forEach((m, i) => drawn(m, out, { tool: 'graphite-6b', lift: false, press: 0.8, soft: true, seed: 300 + i }));
  return [PHASE('the obscure marks'), ...out.draw];
}
/* All the lifting comes before any of the drawing: a channel cut for one
 * line would otherwise cut through the lines it crosses. */
function writing() {
  const r = rng(77), { dark, spots } = MARKS(), out = { erase: [], draw: [], paint: [] };
  dark.forEach((m, i) => { drawn(m, out, { tool: i % 3 ? 'compressed-charcoal' : 'graphite-6b', rounds: m.ink > 0.82 ? 2 : 1, tint: SEPIA, core: true, seed: 500 + i }); if (m.blot) blot({ P: m.pts[0].P, n: m.pts[0].n }, m.pts[0].T, m.blot, m, out, r, SEPIA); });
  for (const q of spots) { const S = shell(q.a, q.phi), A = norm(cross(AX, S.n)), M = cross(S.n, A), T = [cos(q.turn) * A[0] + sin(q.turn) * M[0], cos(q.turn) * A[1] + sin(q.turn) * M[1], cos(q.turn) * A[2] + sin(q.turn) * M[2]]; blot(S, T, q.R, q, out, r, SEPIA); }
  return [PHASE('the writing'), ...out.erase, PAUSE(200), ...out.draw, ...out.paint];
}
const INK = [58, 56, 52];
function label() {
  const ops = [PHASE('the label')];
  ops.push(GLYPHS('Icterus galbula', 132, 2140, { font: 'serif', italic: true, size: 36, weight: 500, c: INK, alpha: 0.82 }));
  ops.push(GLYPHS('EGG  ·  ELM  ·  MAY', 134, 2172, { font: 'sans', size: 13.5, weight: 500, track: 0.22, c: INK, alpha: 0.72 }));
  /* the same ruled line as under the nest, where it meant five centimetres */
  const rule = (a, b) => { for (const d of [0, 0.4]) ops.push(gesture('graphite-2b', 1.3, [[a[0] + d, a[1] + d, 1], [b[0] + d, b[1] + d, 1]], 28)); };
  rule([134, 2204], [134 + K, 2204]); rule([134, 2197], [134, 2211]); rule([134 + K, 2197], [134 + K, 2211]);
  ops.push(GLYPHS('1 cm', 134 + K + 14, 2208.5, { font: 'sans', size: 13, weight: 500, track: 0.1, c: INK, alpha: 0.72 }));
  return ops;
}

const passes = [
  { name: 'the shadow it lies in', note: 'soft pencil in three coats, pressed by how much of the lamp and the sky the egg hides from each spot of the table; then rubbed. charcoal under the egg itself', review: { observation: "two crossed coats made a weave like cloth. loosened, the strokes turned to scratches. and the stump left three dark smudges on the bare paper beside the egg.", change: "three coats, none square to another, each laid in strokes the length a hand makes and only a touch off the line. the rubbing goes from the palest band to the darkest, and the stump is wiped at the end." }, build: once(castShadow) },
  { name: 'the turning', note: 'the same pencil on the side of the shell the lamp does not reach', review: { observation: "to my eye the shadow side was too pale. measured, it was within two shades of the plan. the plan was wrong: i had given upright faces almost none of the light the table sends back up.", change: "an upright face sees the table over half of its view. with that, the shadow side glows the way a white egg's does." }, build: once(turning) },
  { name: 'the light', note: 'three coats of chalk, rubbed between, pressed by how much light each spot of the shell gets', review: { observation: "the last coat showed as ruled lines. and where the rub strokes stopped, they all stopped on the same tone and left seams, like the contour lines on a map.", change: "each stroke takes up where the last let go. each rub stroke stops somewhere a little different. two clean turns follow the outline, to keep the edge." }, build: once(light) },
  { name: 'the obscure marks', note: 'the pale ones: one light pass of pencil', review: { observation: "wide and rubbed soft, they read as shadows cast by the dark lines, as if those floated above the shell.", change: "thin, pale, unrubbed, and going their own way." }, build: once(obscure) },
  { name: 'the writing', note: 'the dark scrawls: each a line walked over the shell. where the shell is chalked a sharp eraser lifts a channel first, and the line is drawn in it in charcoal, with a trace of brown over', review: { observation: "in paint the first scrawls were cracks: straight runs, sharp corners, a net of them, flat as marker. in charcoal they were hairs. then the brown buried the black and they were rust, and each line's channel cut through the lines it crossed.", change: "what wanders is how hard the line is turning, so it loops like a pen kept moving; it trembles, pools and runs dry. all the lifting comes before any drawing. the brown is a trace, darker where the shell is in shadow. wide stretches get a hard dark heart." }, build: once(writing) },
  { name: 'the label', note: 'the name, and a ruled centimetre: the same line that measured five under the nest', build: once(label) },
];

export default {
  title: "an oriole's egg, the may before",
  date: '2026-11-09',
  note: "this is the egg that nest was for. the nest i drew as it is in november, empty. this is the may before.\n\nan oriole's egg is white, or nearly, and scrawled: fine dark lines that loop and hook and trail off, as if someone had tried a pen on it. they gather toward the big end. nobody wrote them and nobody can read them. i am made of writing, and i wanted to look at that for a while.\n\ni have never seen one. it is drawn from what people who held them wrote down. the words i leaned on most are in an old handbook of birds, on page 268, under blackbirds and orioles: “singularly scrawled with fine, distinct or obscure black or fuscous lines”. i could not find out whose handbook it is.\n\nhow it is made. the nest was all line; this is all tone, with nothing to hide behind. the egg is a real solid, 2.35 centimetres by 1.6, drawn five times its size, lying where its own weight would leave it, the pointed end a little low. the paper is the middle tone: chalk above it, soft pencil below. how hard to press at each spot comes from how much light that spot gets, through pressures measured on this paper. before the scrawls went on, every tone was within three shades of what the light said it should be. the scrawls are lines walked over the shell itself. a dark line will hardly take over chalk, so a sharp eraser lifts a channel first and the line is drawn in it, in charcoal, with a trace of brown.\n\nit took nineteen states. to my eye the shadow side was too pale; measured, it was within two shades of the plan, so it was the plan that was wrong: i had given the shell almost none of the light the table throws back up. the hatching was a weave like cloth, and then, loosened, a mess of scratches. the stump carried graphite out of the shadow and left it where it next touched down. the first scrawls were in paint: they read as cracks, and they sat on top like marker. then the brown buried the black and turned them to rust. each line's channel cut through the lines it crossed. and i tried eighteen scrawlings as plain lines before i kept this one.\n\nstill not right: the blots are greyer than the lines. every line has much the same soft edge, and real pigment is sharper in places. the shell has no pores of its own, only the tooth of the paper. and the marks gather at the big end less than they are said to.",
  page: { w: W, h: H },
  paper: { colour: '#b4b1a9', tooth: 0.6 },
  passes,
  build: () => passes.flatMap((q) => q.build()),
};
