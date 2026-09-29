/* the maze — Sonnet 5.5, 2026-09-29.
 * The physics half of "the size of the blue". In a blue jay's feather barb the
 * blue is made by a maze of keratin and air that grows by itself: two things
 * that will not stay mixed un-mix, like oil and water, and are frozen hard
 * before they finish. Here the maze is grown the same way (the Cahn–Hilliard
 * rule for un-mixing, stepped on a grid), its grain is measured from the
 * picture with a Fourier transform, and the colour is worked out from that
 * measurement. Nothing here draws a mark; the pages that import it do. */

/* ------------------------------------------------------------ Fourier transform */
const plans = new Map();
function plan(n) {
  if (plans.has(n)) return plans.get(n);
  const levels = Math.round(Math.log2(n));
  const cos = new Float64Array(n / 2), sin = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) { cos[i] = Math.cos((2 * Math.PI * i) / n); sin[i] = Math.sin((2 * Math.PI * i) / n); }
  const rev = new Uint32Array(n);
  for (let i = 0; i < n; i++) { let r = 0; for (let b = 0; b < levels; b++) r |= ((i >> b) & 1) << (levels - 1 - b); rev[i] = r; }
  const tr = new Float64Array(n), ti = new Float64Array(n);
  const run = (re, im, off, stride, inv) => {
    for (let i = 0; i < n; i++) { const j = rev[i]; tr[i] = re[off + j * stride]; ti[i] = im[off + j * stride]; }
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1, step = n / size;
      for (let i = 0; i < n; i += size) {
        for (let j = 0, k = 0; j < half; j++, k += step) {
          const wr = cos[k], wi = inv ? sin[k] : -sin[k];
          const a = i + j, b = a + half;
          const xr = tr[b] * wr - ti[b] * wi, xi = tr[b] * wi + ti[b] * wr;
          tr[b] = tr[a] - xr; ti[b] = ti[a] - xi; tr[a] += xr; ti[a] += xi;
        }
      }
    }
    for (let i = 0; i < n; i++) { re[off + i * stride] = tr[i]; im[off + i * stride] = ti[i]; }
  };
  plans.set(n, run);
  return run;
}
export function fft2(re, im, nx, ny, inv) {
  const fx = plan(nx), fy = plan(ny);
  for (let y = 0; y < ny; y++) fx(re, im, y * nx, 1, inv);
  for (let x = 0; x < nx; x++) fy(re, im, x, nx, inv);
  if (inv) { const s = 1 / (nx * ny); for (let i = 0; i < re.length; i++) { re[i] *= s; im[i] *= s; } }
}

/* a small deterministic stream of random numbers */
export function stream(seed0) {
  let a = seed0 >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------ the un-mixing */
/* Cahn–Hilliard: phi is how much of the mixture is keratin (+1) or air (-1);
 *   d(phi)/dt = laplacian( phi^3 - phi - kappa * laplacian(phi) ).
 * Stepped in Fourier space with a stabilised semi-implicit scheme, so a large
 * step still behaves. Start from a faint noise and it grows a maze whose grain
 * is set by kappa, then slowly coarsens, until something stops it. */
export function grow({ nx, ny, kappa = 2.14, dt = 2, A = 2, seed = 7, amp = 0.1, mean = 0 }) {
  const N = nx * ny, R = stream(seed);
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < N; i++) re[i] = mean + amp * (R() * 2 - 1);
  fft2(re, im, nx, ny, false);
  const pr = re.slice(), pi = im.slice();
  const k2 = new Float64Array(N);
  for (let y = 0; y < ny; y++) {
    for (let x = 0; x < nx; x++) {
      const kx = (2 * Math.PI * (x <= nx / 2 ? x : x - nx)) / nx, ky = (2 * Math.PI * (y <= ny / 2 ? y : y - ny)) / ny;
      k2[y * nx + x] = kx * kx + ky * ky;
    }
  }
  const a1 = new Float64Array(N), a2 = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const den = 1 + dt * k2[i] * (kappa * k2[i] + A);
    a1[i] = (1 + dt * k2[i] * A) / den; a2[i] = (dt * k2[i]) / den;
  }
  const phi = new Float64Array(N), wr = new Float64Array(N), wi = new Float64Array(N);
  const toReal = () => { wr.set(pr); wi.set(pi); fft2(wr, wi, nx, ny, true); phi.set(wr); };
  toReal();
  let steps = 0;
  return {
    phi, nx, ny,
    get steps() { return steps; },
    step() {
      for (let i = 0; i < N; i++) { const p = phi[i]; wr[i] = p * p * p - p; wi[i] = 0; }
      fft2(wr, wi, nx, ny, false);
      for (let i = 0; i < N; i++) { pr[i] = a1[i] * pr[i] - a2[i] * wr[i]; pi[i] = a1[i] * pi[i] - a2[i] * wi[i]; }
      toReal();
      steps++;
    },
    /* the maze's period in cells, from where the spectrum's ring peaks: the
     * radial average of the power, smoothed, and its highest point */
    peakPeriod() {
      const nb = 260, dk = 0.004, sum = new Float64Array(nb), cnt = new Float64Array(nb);
      for (let i = 0; i < N; i++) {
        const b = Math.floor(Math.sqrt(k2[i]) / dk);
        if (b < nb) { sum[b] += pr[i] * pr[i] + pi[i] * pi[i]; cnt[b]++; }
      }
      const avg = Array.from(sum, (v, i) => (cnt[i] ? v / cnt[i] : 0));
      const sm = avg.map((_, i) => { let t = 0, c = 0; for (let d = -4; d <= 4; d++) { const j = i + d; if (j >= 0 && j < nb) { t += avg[j]; c++; } } return t / c; });
      let pk = 30;
      for (let i = 30; i < nb - 4; i++) if (sm[i] > sm[pk]) pk = i;
      const y0 = sm[pk - 1], y1 = sm[pk], y2 = sm[pk + 1];
      const off = (y0 - y2) / (2 * (y0 - 2 * y1 + y2) || 1);
      return (2 * Math.PI) / ((pk + off + 0.5) * dk);
    },
    /* (the plain average, kept for comparison: the maze's sharp edges drag it short) */
    period() {
      let sk = 0, s = 0;
      for (let i = 0; i < N; i++) {
        const k = Math.sqrt(k2[i]);
        if (k < 0.15) continue;
        const w = pr[i] * pr[i] + pi[i] * pi[i];
        sk += k * w; s += w;
      }
      return (2 * Math.PI) / (sk / s);
    },
  };
}

/* ------------------------------------------------------------ measuring the ring */
/* Cut a square window out of the maze, fade its edges, pad it with zeros (which
 * only makes the spectrum smoother to look at), and take its power spectrum.
 * A maze with one grain size puts its power on a ring: the ring's radius is
 * the grain. Returns the spectrum, the ring's radius in bins, and the period. */
export function measureRing(phi, nx, ny, cx, cy, win, pad) {
  const re = new Float64Array(pad * pad), im = new Float64Array(pad * pad);
  let mean = 0;
  for (let y = 0; y < win; y++) for (let x = 0; x < win; x++) mean += phi[(cy - (win >> 1) + y) * nx + (cx - (win >> 1) + x)];
  mean /= win * win;
  for (let y = 0; y < win; y++) {
    const wy = 0.5 - 0.5 * Math.cos((2 * Math.PI * (y + 0.5)) / win);
    for (let x = 0; x < win; x++) {
      const wx = 0.5 - 0.5 * Math.cos((2 * Math.PI * (x + 0.5)) / win);
      re[y * pad + x] = (phi[(cy - (win >> 1) + y) * nx + (cx - (win >> 1) + x)] - mean) * wx * wy;
    }
  }
  fft2(re, im, pad, pad, false);
  // power, moved so that zero frequency sits in the middle
  const P = new Float64Array(pad * pad);
  for (let y = 0; y < pad; y++) {
    for (let x = 0; x < pad; x++) {
      const sx = (x + pad / 2) % pad, sy = (y + pad / 2) % pad;
      P[sy * pad + sx] = re[y * pad + x] * re[y * pad + x] + im[y * pad + x] * im[y * pad + x];
    }
  }
  // radial average, and its peak
  const nb = pad / 2, sum = new Float64Array(nb), cnt = new Float64Array(nb);
  for (let y = 0; y < pad; y++) {
    for (let x = 0; x < pad; x++) {
      const r = Math.hypot(x - pad / 2, y - pad / 2), b = Math.floor(r);
      if (b < nb) { sum[b] += P[y * pad + x]; cnt[b]++; }
    }
  }
  const radial = Array.from(sum, (s, i) => (cnt[i] ? s / cnt[i] : 0));
  let peak = 3;
  for (let i = 3; i < nb - 2; i++) if (radial[i] > radial[peak]) peak = i;
  // where the peak really sits, between the bins
  const y0 = radial[peak - 1], y1 = radial[peak], y2 = radial[peak + 1];
  const off = (y0 - y2) / (2 * (y0 - 2 * y1 + y2) || 1);
  const ringBins = peak + off;
  return { P, pad, radial, ringBins, periodCells: pad / ringBins };
}

/* ------------------------------------------------------------ what colour the ring says */
/* A ring of grain d sends back light of wavelength about 2 * n * d (light
 * scattered from neighbouring layers of the maze lines up when the round trip
 * is one wavelength), where n is the mix of keratin and air that light sees.
 * Then the wavelength is turned into a colour with the CIE observer (Wyman,
 * Sloan and Shirley's fit), for a reflection band about 75 nm wide. */
const g = (l, mu, s1, s2) => { const t = (l - mu) / (l < mu ? s1 : s2); return Math.exp(-0.5 * t * t); };
const xbar = (l) => 1.056 * g(l, 599.8, 37.9, 31.0) + 0.362 * g(l, 442.0, 16.0, 26.7) - 0.065 * g(l, 501.1, 20.4, 26.2);
const ybar = (l) => 0.821 * g(l, 568.8, 46.9, 40.5) + 0.286 * g(l, 530.9, 16.3, 31.1);
const zbar = (l) => 1.217 * g(l, 437.0, 11.8, 36.0) + 0.681 * g(l, 459.0, 26.0, 13.8);
export function bandColour(lambda, sigma = 32, whiteMix = 0.02) {
  let X = 0, Y = 0, Z = 0;
  for (let l = 380; l <= 720; l += 5) {
    const s = Math.exp(-0.5 * ((l - lambda) / sigma) ** 2);
    X += s * xbar(l); Y += s * ybar(l); Z += s * zbar(l);
  }
  let r = 3.2406 * X - 1.5372 * Y - 0.4986 * Z, gg = -0.9689 * X + 1.8758 * Y + 0.0415 * Z, b = 0.0557 * X - 0.2040 * Y + 1.0570 * Z;
  r = Math.max(0, r); gg = Math.max(0, gg); b = Math.max(0, b);
  let m = Math.max(r, gg, b) || 1;
  // a real maze also scatters some light of every colour, which adds a little white
  r = r / m * (1 - whiteMix) + whiteMix; gg = gg / m * (1 - whiteMix) + whiteMix; b = b / m * (1 - whiteMix) + whiteMix;
  m = 1;
  const enc = (v) => { v /= m; return Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055)); };
  return [enc(r), enc(gg), enc(b)];
}

/* ------------------------------------------------------------ tracing the maze */
/* Marching squares on a window of the field, padded with air all round, so
 * every outline closes. Returns closed loops in grid units, x to the right. */
export function traceLoops(phi, nx, ny, gx0, gy0, w, h, level = 0) {
  const W = w + 2, H = h + 2;   // grid points of the padded window
  const v = new Float64Array(W * H);
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const gx = gx0 - 1 + i, gy = gy0 - 1 + j;
      const inside = i > 0 && j > 0 && i < W - 1 && j < H - 1 && gx >= 0 && gy >= 0 && gx < nx && gy < ny;
      v[j * W + i] = inside ? phi[gy * nx + gx] - level : -1 - level;
    }
  }
  // edge ids: horizontal edge (i,j)-(i+1,j) = 2*(j*W+i); vertical (i,j)-(i,j+1) = 2*(j*W+i)+1
  const pos = new Map();
  const at = (id) => {
    let p = pos.get(id);
    if (p) return p;
    const e = id >> 1, i = e % W, j = (e - i) / W;
    if ((id & 1) === 0) { const a = v[j * W + i], b = v[j * W + i + 1]; p = [i + a / (a - b), j]; }
    else { const a = v[j * W + i], d = v[(j + 1) * W + i]; p = [i, j + a / (a - d)]; }
    pos.set(id, p);
    return p;
  };
  const nbr = new Map();
  const link = (a, b) => {
    if (!nbr.has(a)) nbr.set(a, []);
    if (!nbr.has(b)) nbr.set(b, []);
    nbr.get(a).push(b); nbr.get(b).push(a);
  };
  for (let j = 0; j < H - 1; j++) {
    for (let i = 0; i < W - 1; i++) {
      const a = v[j * W + i], b = v[j * W + i + 1], c = v[(j + 1) * W + i + 1], d = v[(j + 1) * W + i];
      const idx = (a > 0 ? 1 : 0) | (b > 0 ? 2 : 0) | (c > 0 ? 4 : 0) | (d > 0 ? 8 : 0);
      if (idx === 0 || idx === 15) continue;
      const T = 2 * (j * W + i), Bt = 2 * ((j + 1) * W + i), Lf = 2 * (j * W + i) + 1, Rt = 2 * (j * W + i + 1) + 1;
      switch (idx) {
        case 1: case 14: link(T, Lf); break;
        case 2: case 13: link(T, Rt); break;
        case 3: case 12: link(Lf, Rt); break;
        case 4: case 11: link(Rt, Bt); break;
        case 6: case 9: link(T, Bt); break;
        case 7: case 8: link(Lf, Bt); break;
        case 5: case 10: {
          const centre = (a + b + c + d) / 4 > 0;
          if ((idx === 5) === centre) { link(T, Rt); link(Lf, Bt); } else { link(T, Lf); link(Rt, Bt); }
          break;
        }
        default: break;
      }
    }
  }
  const used = new Set(), loops = [];
  for (const start of nbr.keys()) {
    if (used.has(start)) continue;
    const loop = [];
    let prev = -1, cur = start;
    for (;;) {
      used.add(cur);
      const p = at(cur);
      loop.push([p[0] - 1 + gx0, p[1] - 1 + gy0]);       // back to grid units of the whole field
      const ns = nbr.get(cur);
      const nxt = ns[0] !== prev && !used.has(ns[0]) ? ns[0] : ns[1] !== prev && !used.has(ns[1]) ? ns[1] : -1;
      if (nxt === -1) break;
      prev = cur; cur = nxt;
    }
    if (loop.length > 3) loops.push(loop);
  }
  return loops;
}

/* fewer points on a loop, keeping its shape to within tol */
export function simplifyLoop(pts, tol) {
  const n = pts.length;
  if (n < 8) return pts;
  const dist = (p, a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
    if (l2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
  };
  const keep = new Uint8Array(n);
  const rdp = (i0, i1) => {
    const stack = [[i0, i1]];
    while (stack.length) {
      const [s, e] = stack.pop();
      let best = -1, bd = tol;
      for (let i = s + 1; i < e; i++) { const d = dist(pts[i], pts[s], pts[e]); if (d > bd) { bd = d; best = i; } }
      if (best >= 0) { keep[best] = 1; stack.push([s, best], [best, e]); }
    }
  };
  // split the loop at its two most distant points so both halves are open curves
  let far = 0, fd = 0;
  for (let i = 1; i < n; i++) { const d = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]); if (d > fd) { fd = d; far = i; } }
  keep[0] = 1; keep[far] = 1;
  rdp(0, far);
  const back = pts.slice(far).concat([pts[0]]);
  const sub = back;
  const keepBack = new Uint8Array(sub.length);
  const stack2 = [[0, sub.length - 1]];
  keepBack[0] = 1; keepBack[sub.length - 1] = 1;
  while (stack2.length) {
    const [s, e] = stack2.pop();
    let best = -1, bd = tol;
    for (let i = s + 1; i < e; i++) { const d = dist(sub[i], sub[s], sub[e]); if (d > bd) { bd = d; best = i; } }
    if (best >= 0) { keepBack[best] = 1; stack2.push([s, best], [best, e]); }
  }
  const out = [];
  for (let i = 0; i <= far; i++) if (keep[i]) out.push(pts[i]);
  for (let i = 1; i < sub.length - 1; i++) if (keepBack[i]) out.push(sub[i]);
  return out;
}

export function polyArea(pts) {
  let a = 0;
  for (let i = 0, n = pts.length; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; a += p[0] * q[1] - q[0] * p[1]; }
  return a / 2;
}
export function inPoly(pt, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a[1] > pt[1]) !== (b[1] > pt[1]) && pt[0] < ((b[0] - a[0]) * (pt[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}

/* The maze as flat shapes, tile by tile: each tile's outlines come back
 * nested, and a shape drawn inside another is the other phase (an air island in
 * the keratin, a keratin island in that). depth even = keratin, odd = air. */
export function tileShapes(phi, nx, ny, tile = 64, level = 0, tol = 0.18, maxPts = 500) {
  const out = [];
  for (let ty = 0; ty < ny; ty += tile) {
    for (let tx = 0; tx < nx; tx += tile) {
      const x0 = Math.max(0, tx - 1), y0 = Math.max(0, ty - 1);
      const w = Math.min(nx, tx + tile + 1) - x0, h = Math.min(ny, ty + tile + 1) - y0;
      let loops = traceLoops(phi, nx, ny, x0, y0, w, h, level).map((l) => simplifyLoop(l, tol));
      loops = loops.filter((l) => l.length >= 3 && Math.abs(polyArea(l)) > 0.6);
      const depth = loops.map((l, i) => { let d = 0; for (let k = 0; k < loops.length; k++) if (k !== i && inPoly(l[0], loops[k])) d++; return d; });
      const order = loops.map((_, i) => i).sort((a, b) => depth[a] - depth[b]);
      for (const i of order) {
        let l = loops[i];
        if (l.length > maxPts) l = simplifyLoop(l, tol * 3);
        if (l.length > maxPts) l = l.filter((_, k) => k % Math.ceil(l.length / maxPts) === 0);
        out.push({ pts: l, depth: depth[i] });
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------ what light sees of the mix */
/* The share of the maze that is keratin: the cells where the field is above zero. */
export function keratinShare(phi) {
  let k = 0;
  for (let i = 0; i < phi.length; i++) if (phi[i] > 0) k++;
  return k / phi.length;
}
/* The average refractive index of a mix of keratin (1.58, from the literature the
 * plate cites) and air (1.0). Dufresne et al. 2009 average the squares of the
 * indices, and that is the rule that turns their 1.25 into 62% air. */
export const N_KERATIN = 1.58;
export function meanIndex(share, nKeratin = N_KERATIN) {
  return Math.sqrt(share * nKeratin * nKeratin + (1 - share));
}
