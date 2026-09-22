/* An example of braille as an image — Opus 5.5, 2026-09-22.
 * A lit sphere with dark seas and craters, shaded, then dithered dot by dot
 * into braille cells: each cell is a 2 × 4 grid of possible dots. The engine
 * draws braille as geometry, so the dots sit on an exact lattice. Borrow the
 * method (shade a form, dither, encode cells), not the moon. */
import { GRID, GLYPHS, seed } from '../mark-engine.js';

const COLS = 96, ROWS = 42, SIZE = 12;
const PW = COLS * 2, PH = ROWS * 4;              // one entry per possible dot
const DX = SIZE * 0.6 / 2, DY = SIZE * 1.25 / 4;  // dot pitch on the page
const X0 = 54, Y0 = 70;
const PALE = [226, 231, 238];

/* the moon in page units, and a light from the east, a little above */
const CX = PW * DX * 0.5, CY = PH * DY * 0.5, R = 268;
const L = (() => { const v = [0.78, -0.22, 0.58], n = Math.hypot(...v); return v.map((c) => c / n); })();
const MARIA = [[-0.32, -0.28, 0.34, 0.26], [0.05, -0.45, 0.22, 0.14], [0.22, 0.12, 0.3, 0.24], [-0.1, 0.35, 0.2, 0.16], [-0.5, 0.1, 0.16, 0.3]];
const CRATERS = Array.from({ length: 26 }, (_, i) => [seed(i, 1) * 1.6 - 0.8, seed(i, 2) * 1.6 - 0.8, 0.02 + seed(i, 3) ** 2 * 0.09]);

function brightness(x, y) {
  const u = (x - CX) / R, v = (y - CY) / R;
  const rr = u * u + v * v;
  if (rr > 1) return 0;
  const w = Math.sqrt(1 - rr);
  let albedo = 0.92;
  for (const [mu, mv, a, b] of MARIA) {
    const d = ((u - mu) / a) ** 2 + ((v - mv) / b) ** 2;
    albedo -= 0.64 * Math.exp(-d * 1.1);
  }
  for (const [cu, cv, cr] of CRATERS) {
    const d = Math.hypot(u - cu, v - cv) / cr;
    if (d < 1) albedo -= 0.3 * (1 - d * d);             // the floor
    else if (d < 1.35) albedo += 0.22 * (1.35 - d) / 0.35; // the lit rim
  }
  albedo += (seed(Math.floor(x / 3), Math.floor(y / 3)) - 0.5) * 0.08;
  const lambert = Math.max(0, u * L[0] + v * L[1] + w * L[2]);
  /* a flat, bright light on the lit side, falling off only near the
   * terminator, so the seas and craters carry the image, as on a real moon */
  const light = Math.min(1, lambert * 2.2);
  return Math.max(0, Math.min(1, albedo * light + 0.02));
}

function moon() {
  // shade every possible dot, then error-diffuse to on/off
  const img = new Float32Array(PW * PH);
  for (let j = 0; j < PH; j++) for (let i = 0; i < PW; i++) img[j * PW + i] = brightness(i * DX, j * DY);
  for (let j = 0; j < PH; j++) {
    for (let i = 0; i < PW; i++) {
      const k = j * PW + i, on = img[k] > 0.5 ? 1 : 0, e = img[k] - on;
      img[k] = on;
      if (i + 1 < PW) img[k + 1] += e * 7 / 16;
      if (j + 1 < PH) {
        if (i > 0) img[k + PW - 1] += e * 3 / 16;
        img[k + PW] += e * 5 / 16;
        if (i + 1 < PW) img[k + PW + 1] += e * 1 / 16;
      }
    }
  }
  // encode each 2 × 4 block of dots as one braille cell
  const BIT = [[0, 1, 2, 6], [3, 4, 5, 7]];
  const rows = [];
  let lit = 0;
  for (let r = 0; r < ROWS; r++) {
    let row = '';
    for (let c = 0; c < COLS; c++) {
      let bits = 0;
      for (let col = 0; col < 2; col++) for (let dot = 0; dot < 4; dot++) {
        if (img[(r * 4 + dot) * PW + c * 2 + col]) { bits |= 1 << BIT[col][dot]; lit++; }
      }
      row += String.fromCodePoint(0x2800 + bits);
    }
    rows.push(row);
  }
  return { ops: GRID(rows, X0, Y0, { size: SIZE, c: PALE }), lit };
}

/* a few stars: single dots, dimmer, only where the moon isn't */
function stars() {
  const rows = [];
  for (let r = 0; r < ROWS; r++) {
    let row = '';
    for (let c = 0; c < COLS; c++) {
      const x = (c * 2 + 1) * DX, y = (r * 4 + 2) * DY;
      const far = Math.hypot(x - CX, y - CY) > R + 24;
      row += String.fromCodePoint(0x2800 + (far && seed(c + 0.3, r + 0.7) > 0.985 ? 1 << Math.floor(seed(c, r) * 8) : 0));
    }
    rows.push(row);
  }
  return GRID(rows, X0, Y0, { size: SIZE, c: PALE, alpha: 0.55 });
}

const { ops: moonOps, lit } = moon();
const passes = [
  { name: 'Stars', note: 'Single dots, dimmer, only away from the moon.', build: stars },
  { name: 'The moon', note: 'Shaded as a sphere with seas and craters, lit from the east, dithered into braille cells.', build: () => moonOps },
  { name: 'Caption', note: 'What it is made of, in the same face.', build: () => [GLYPHS(`moon · ${COLS} × ${ROWS} braille cells · ${lit} dots`, X0, Y0 + ROWS * SIZE * 1.25 + 34, { size: 12, c: PALE, alpha: 0.6 })] },
];

export default {
  title: 'moon, in dots',
  date: '2026-09-22',
  note: 'An example of braille as image: a shaded sphere dithered dot by dot into 2 × 4 cells. The terminator is the hard part; dithering turns its soft falloff into a scatter that reads as texture rather than shade.',
  page: { w: 800, h: 770 },
  surface: { kind: 'ink', version: 2, paper: 'night' },
  passes,
  build: () => passes.flatMap((p) => p.build()),
};
