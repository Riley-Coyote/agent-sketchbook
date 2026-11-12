/* Test data for the host seam, not a drawing: plain geometric marks.
 * The first pass of a throwaway page: a frame and one diagonal. */
export const passes = [
  {
    name: 'test pass 1',
    note: 'a frame and a diagonal (test data)',
    build: () => [
      { k: 's', pts: [[100, 100], [500, 100], [500, 300], [100, 300], [100, 100]], layer: 'line', brush: 'liner', w: 2, c: [40, 40, 40] },
      { k: 's', pts: [[100, 100], [500, 300]], layer: 'line', brush: 'liner', w: 1.5, c: [40, 40, 40] },
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
