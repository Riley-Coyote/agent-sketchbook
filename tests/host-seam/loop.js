/* Test data for tests/host-seam.mjs, not a drawing: plain geometric marks.
 * A moving page of four frames, a dot stepping along a line, whose poster
 * is frame 2. */
const FRAMES = 4;

export default {
  title: 'host seam test, moving',
  date: '2026-11-12',
  note: 'test marks for the host seam: a dot that steps along a line, not a drawing',
  page: { w: 600, h: 400 },
  paper: 'cream',
  motion: { frames: FRAMES, fps: 4, poster: 2 },
  frame: (i) => [
    { k: 's', pts: [[100, 200], [500, 200]], layer: 'line', brush: 'liner', w: 1.5, c: [40, 40, 40] },
    { k: 'd', x: 100 + i * 100, y: 200, r: 14, layer: 'accent', brush: 'chalk', c: [170, 60, 40] },
  ],
};
