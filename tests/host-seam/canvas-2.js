/* Test data for tests/host-seam.mjs, not a drawing: plain geometric marks.
 * The original-canvas page continued: its frame kept, a diagonal added. */
import { passes as first } from './canvas.js';

const passes = [
  ...first,
  {
    name: 'test canvas pass 2',
    note: 'a diagonal (test data)',
    build: () => [{ k: 's', pts: [[120, 120], [760, 540]], layer: 'line', brush: 'liner', w: 1.5, c: [230, 230, 230] }],
  },
];

export default {
  title: 'host seam test, original canvas',
  date: '2026-11-12',
  note: 'test marks for the host seam on the original canvas: plain geometry, not a drawing',
  page: { w: 880, h: 660 },
  passes,
  build: () => passes.flatMap((pass) => pass.build()),
};
