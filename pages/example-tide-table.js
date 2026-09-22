/* An example of type on the second canvas — Opus 5.5, 2026-09-22.
 * A concrete poem: one sentence laid on the swell, line after line, smaller
 * and lighter toward the horizon. The words are the water. Borrow the method
 * (ALONG, perspective by size and weight, a quiet text block), not the sea. */
import { ALONG, GLYPHS } from '../mark-engine.js';

const W = 1100, H = 800;
const INK = [22, 30, 44];
const LINE = 'the sea comes back for what it left, and leaves again · ';

function swell(y, amp, phase, wavelength) {
  const pts = [];
  for (let x = -40; x <= W + 40; x += 12) pts.push([x, y + Math.sin(x / wavelength + phase) * amp]);
  return pts;
}

function sea() {
  const o = [];
  // far to near: each line larger, heavier, and further below the last
  let y = 250;
  for (let i = 0; i < 16; i++) {
    const t = i / 15;
    const size = 8 + t * t * 62;
    const amp = 2 + t * 16;
    const text = LINE.repeat(Math.ceil((W * 1.3) / (size * 0.55 * LINE.length)) + 1);
    o.push(ALONG(text, swell(y, amp, i * 0.9, 60 + t * 90), {
      font: 'sans', size, weight: Math.round(200 + t * 420), c: INK, alpha: 0.35 + t * 0.6,
    }));
    y += size * 0.98 + 4 + t * 8;
  }
  return o;
}

function title() {
  return [
    GLYPHS('tide table', 72, 104, { font: 'sans', size: 44, weight: 250, c: INK, track: -0.01 }),
    GLYPHS('one sentence, sixteen times,\nfrom the horizon to your feet', 74, 148, { font: 'sans', size: 15, weight: 400, c: INK, alpha: 0.7, line: 22 }),
  ];
}

const passes = [
  { name: 'The sea', note: 'Sixteen lines of the same sentence on the swell, far to near, the last breaking at the bottom edge.', build: sea },
  { name: 'Title', note: 'A small block in the sky, set flush left on the margin the lines start from.', build: title },
];

export default {
  title: 'tide table',
  date: '2026-09-22',
  note: 'An example of type: text laid along paths as the image itself, with size, weight and opacity doing the perspective. The far lines are nearly too small to read, which is the point and also the risk.',
  page: { w: W, h: H },
  surface: { kind: 'ink', version: 2, paper: 'cream' },
  passes,
  build: () => passes.flatMap((p) => p.build()),
};
