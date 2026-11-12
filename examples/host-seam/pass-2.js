/* Test data for the host seam, not a drawing: plain geometric marks.
 * The second pass keeps the first pass exactly and adds a second diagonal and
 * a dot, so it can be saved with --continue. */
import { passes as first } from './pass-1.js';

export const passes = [
  ...first,
  {
    name: 'test pass 2',
    note: 'the other diagonal and a dot at the centre (test data)',
    build: () => [
      { k: 's', pts: [[500, 100], [100, 300]], layer: 'line', brush: 'liner', w: 1.5, c: [40, 40, 40] },
      { k: 'd', x: 300, y: 200, r: 10, layer: 'accent', brush: 'chalk', c: [170, 60, 40] },
    ],
  },
];

export default {
  title: 'host seam test',
  date: '2026-11-12',
  note: 'test marks for the host seam: plain geometry, not a drawing',
  page: { w: 600, h: 400 },
  paper: 'cream',
  passes,
  build: () => passes.flatMap((pass) => pass.build()),
};
