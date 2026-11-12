/* Test data for tests/host-seam.mjs, not a drawing: plain geometric marks.
 * A page with no paper, as the oldest pages were drawn: on the original
 * canvas. The test stores it by hand, the way those pages were stored. */
export const passes = [
  {
    name: 'test canvas pass 1',
    note: 'a light frame on the original canvas (test data)',
    build: () => [
      { k: 's', pts: [[120, 120], [760, 120], [760, 540], [120, 540], [120, 120]], layer: 'line', brush: 'liner', w: 2, c: [230, 230, 230] },
    ],
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
