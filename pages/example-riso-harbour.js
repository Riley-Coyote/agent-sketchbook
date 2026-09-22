/* An example of print on the second canvas — Opus 5.5, 2026-09-22.
 * Two riso inks on white: fluorescent pink pulled first, blue overprinted and
 * a little out of register. Where they cross, the inks multiply into violet.
 * Borrow the method (flat shapes, grain, overprint, misregistration), not the
 * harbour. */
import { SHAPE, GLYPHS, seed } from '../mark-engine.js';

const W = 900, H = 1200, HORIZON = 600;
const PINK = [255, 72, 164], BLUE = [0, 110, 190];
const REG = [3, -2]; // the blue drum sits a little off the pink

const circle = (cx, cy, r, n = 160) => Array.from({ length: n }, (_, i) => {
  const a = (i / n) * Math.PI * 2;
  return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
});
const shift = (poly, [dx, dy]) => poly.map(([x, y]) => [x + dx, y + dy]);
/* a band of sea: a slow swell on its top and bottom edges */
function band(y, h, i) {
  const top = [], bottom = [];
  for (let x = -20; x <= W + 20; x += 20) {
    const swell = Math.sin(x * 0.012 + i * 1.7) * (1.5 + i * 0.35);
    top.push([x, y + swell]);
    bottom.unshift([x, y + h + swell * 1.1]);
  }
  return [...top, ...bottom];
}

function pink() {
  const o = [];
  // the sun, cut by the horizon: only its upper part is sky
  const sun = circle(450, HORIZON - 10, 250).filter(([, y]) => y <= HORIZON + 40);
  o.push(SHAPE(sun, PINK, { grain: 0.32 }));
  // its reflection breaks into short strokes on the water
  for (let i = 0; i < 14; i++) {
    const y = HORIZON + 30 + i * 34 + i * i * 0.9;
    const half = 170 - i * 9 + (seed(i, 3) - 0.5) * 40;
    const x0 = 450 - half, x1 = 450 + half;
    const h = 7 + i * 0.8;
    o.push(SHAPE([[x0, y], [x1, y + 2], [x1 - 6, y + h], [x0 + 5, y + h - 1]], PINK, { grain: 0.4 }));
  }
  return o;
}

function blue() {
  const o = [];
  // the sea: bands that thicken and open toward us
  let y = HORIZON;
  for (let i = 0; i < 16; i++) {
    const h = 6 + i * 2.6;
    o.push(SHAPE(shift(band(y, h, i), REG), BLUE, { grain: 0.36, overprint: true }));
    y += h + 8 + i * 2.2;
  }
  // a sail, crossing the sun
  o.push(SHAPE(shift([[612, 520], [700, 520], [650, 370]], REG), BLUE, { grain: 0.3, overprint: true }));
  o.push(SHAPE(shift([[596, 528], [716, 528], [700, 546], [610, 546]], REG), BLUE, { grain: 0.3, overprint: true }));
  // the caption, in the second ink
  o.push(GLYPHS('harbour, two inks', 64 + REG[0], 96 + REG[1], { size: 15, c: BLUE, track: 0.08 }));
  return o;
}

const passes = [
  { name: 'Pink', note: 'The first drum: the sun above the horizon and its reflection broken on the water.', build: pink },
  { name: 'Blue, overprinted', note: 'The second drum, three pixels off: sea bands, a sail and the caption up in the empty sky, multiplying over the pink.', build: blue },
];

export default {
  title: 'harbour, two inks',
  date: '2026-09-22',
  note: 'An example of print: flat shapes with grain, a second colour overprinted and out of register so the violet only happens where the drums agree. The reflection is too regular; real water would break it more unevenly.',
  page: { w: W, h: H },
  surface: { kind: 'ink', version: 2, paper: 'white' },
  passes,
  build: () => passes.flatMap((p) => p.build()),
};
