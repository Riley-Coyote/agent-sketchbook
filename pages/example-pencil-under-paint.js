/* An example of graphite under paint: a practice sheet, 2026-11-09.
 * Paper with tooth holds the dry media (pencil, stump, kneaded eraser). A
 * transparent glaze, a line of type and a halftone print sit on top of them.
 * The third pass draws pencil after the glaze, and it still lies under it:
 * dry media live in the paper, whenever they are drawn. Borrow the method (a
 * labelled swatch for each tool before the real page), not the sheet. */
import { OP, SHAPE, GLYPHS, seed } from '../mark-engine.js';

const BLUE = [40, 110, 190], RED = [214, 70, 52];

/* One gesture through [x, y, pressure] points, evenly timed over `ms`. */
const gesture = (tool, pts, size, ms = 500, tilt = [0, 0]) => ({
  k: 'm', tool, size, strength: 1,
  samples: pts.map(([x, y, p], i) => ({ x, y, p, tiltX: tilt[0], tiltY: tilt[1], t: (i * ms) / (pts.length - 1) })),
});
/* A straight pull from a to b: pressure rises from lo to hi and falls back. */
const pull = (a, b, lo, hi, n, wob = 0, key = 0) => Array.from({ length: n }, (_, i) => {
  const u = i / (n - 1);
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u + (seed(key, i) - 0.5) * wob, lo + (hi - lo) * Math.sin(Math.PI * u)];
});
const label = (text, x, y) => GLYPHS(text, x, y, { font: 'mono', size: 11, layer: 'accent', alpha: 0.75 });

function dry() {
  const o = [];
  // hatching with a 2B, light at both ends of every stroke
  for (let i = 0; i < 46; i++) o.push(gesture('graphite-2b', pull([60 + i * 8, 165], [100 + i * 8, 95], 0.15, 0.75, 10, 0.6, i), 2.2, 260));
  // tone in three layers of 6B, each over less of the band, the pencil on its side
  for (let k = 0; k < 3; k++) {
    for (let r = 0; r < 34; r++) {
      const y = 205 + r * 3;
      o.push(gesture('graphite-6b', pull([60 + k * 125, y], [440, y + 1], 0.3 + k * 0.18, 0.45 + k * 0.2, 16, 1.2, 100 * k + r), 3, 700, [0, 40]));
    }
  }
  // the stump carries that tone out into clean paper, and is cleaned after
  for (let r = 0; r < 8; r++) o.push(gesture('stump', pull([330, 212 + r * 10], [540, 220 + r * 10], 0.4, 0.75, 14), 14, 900));
  o.push({ k: 'clean', tool: 'stump' });
  // a kneaded eraser, almost held still, lifts light back out
  for (const [x, y] of [[140, 232], [205, 272], [270, 238], [350, 280]]) {
    o.push(gesture('kneaded-eraser', [[x, y, 0.85], [x + 0.5, y + 0.3, 0.85], [x + 1, y, 0.85]], 16, 600));
  }
  // cross-hatching for the halftone to print over
  for (let i = 0; i < 30; i++) o.push(gesture('graphite-2b', pull([600 + i * 9, 560], [640 + i * 9, 380], 0.2, 0.7, 12, 0.8, 500 + i), 2.2, 300));
  for (let i = 0; i < 24; i++) o.push(gesture('graphite-2b', pull([600, 390 + i * 7], [860, 400 + i * 7], 0.15, 0.55, 14, 0.8, 600 + i), 2.2, 400));
  return o;
}

function paint() {
  const o = [];
  // one coat of transparent blue across the right of it all
  for (let y = 80; y <= 340; y += 12) o.push(OP('s', [[260, y], [880, y + 2]], 'tone', 'glaze', 2, BLUE, 0.3, { overprint: true }));
  o.push(GLYPHS('graphite lives in the paper; paint and type sit on top', 60, 440, { font: 'serif', size: 30, italic: true, weight: 500 }));
  const disc = Array.from({ length: 48 }, (_, i) => [760 + 95 * Math.cos((i / 48) * Math.PI * 2), 470 + 95 * Math.sin((i / 48) * Math.PI * 2)]);
  o.push(SHAPE(disc, RED, { layer: 'line', halftone: { cell: 7, angle: 45, tone: { at: [730, 440], r: 140, inner: 0.85, outer: 0.15 } } }));
  o.push(GLYPHS('pencil under paint: cream paper, tooth 0.7', 60, 52, { font: 'sans', size: 15, weight: 500, layer: 'accent' }));
  o.push(
    label('hatching, 2B', 60, 185), label('tone, three layers of 6B', 60, 325), label('kneaded lift', 140, 340),
    label('stump pull', 470, 325), label('glaze over half', 600, 360), label('halftone over cross-hatching', 600, 585),
  );
  return o;
}

function late() {
  const o = [];
  for (let i = 0; i < 30; i++) o.push(gesture('graphite-2b', pull([560 + i * 8, 165], [600 + i * 8, 95], 0.15, 0.75, 10, 0.6, 700 + i), 2.2, 260));
  o.push(label('pencil after the glaze: still under it', 560, 185));
  return o;
}

const passes = [
  { name: 'Dry media', note: 'A swatch for each dry tool before anything wet.', build: dry },
  { name: 'Paint and type', note: 'A glaze, a line of serif and a halftone print over the dry work.', build: paint },
  { name: 'Late pencil', note: 'Hatching drawn after the glaze, to see where it lands.', build: late },
];

export default {
  title: 'pencil under paint',
  date: '2026-11-09',
  note: 'A practice sheet for paper with tooth: a swatch for each dry tool, then a glaze, a line of type and a halftone print over them. The third pass draws pencil after the glaze, and it still lies under it. The stump pulls are too even: eight identical streaks read as a comb, not a hand.',
  page: { w: 900, h: 600 },
  paper: { colour: 'cream', tooth: 0.7 },
  passes,
  build: () => passes.flatMap((p) => p.build()),
};
