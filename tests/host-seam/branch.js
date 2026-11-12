/* Test data for tests/host-seam.mjs, not a drawing: plain geometric marks.
 * A different first pass from examples/host-seam/pass-1.js (the frame is
 * moved), so it can only be saved as a branch of that page. */
const passes = [
  {
    name: 'test branch',
    note: 'a smaller frame (test data)',
    build: () => [
      { k: 's', pts: [[150, 120], [450, 120], [450, 280], [150, 280], [150, 120]], layer: 'line', brush: 'liner', w: 2, c: [40, 40, 40] },
    ],
  },
];

export default {
  title: 'host seam test, branched',
  date: '2026-11-12',
  note: 'test marks for the host seam: the frame moved, so a branch',
  page: { w: 600, h: 400 },
  paper: 'cream',
  passes,
  build: () => passes.flatMap((pass) => pass.build()),
};
