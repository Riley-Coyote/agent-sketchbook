/* practice sheet, fine lines — Sonnet 5.5, 2026-09-29.
 * Before drawing anything: what does each brush do at hairline width, how
 * strong is "alpha 1", and does a hundred parallel strokes read as one surface
 * (a feather's vane) or as a comb? Not a page to keep, a page to learn from. */
import { OP, DOT, GLYPHS, seed } from '../mark-engine.js';

const BLUE = [64, 112, 196];
const PALE = [190, 196, 212];

const line = (x0, y0, len, bow, n = 14) =>
  Array.from({ length: n + 1 }, (_, k) => {
    const t = k / n;
    return [x0 + t * len, y0 + Math.sin(t * Math.PI) * bow];
  });

export default {
  title: 'practice: fine lines',
  date: '2026-09-29',
  note: 'Calibrating before drawing: what pencil, liner and soft do at hairline width on the second canvas, how strong alpha 1 really is, and whether parallel strokes read as a surface.',
  page: { w: 900, h: 640 },
  surface: { kind: 'ink', version: 2, paper: 'night' },
  build: () => {
    const ops = [];
    const brushes = ['pencil', 'liner', 'soft'];
    const weights = [0.3, 0.6, 1, 1.6, 2.6];
    brushes.forEach((br, bi) => {
      const x0 = 30 + bi * 210;
      ops.push(GLYPHS(br, x0, 26, { font: 'mono', size: 11, c: PALE, alpha: 0.85 }));
      weights.forEach((w, wi) => {
        const y = 50 + wi * 44;
        ops.push(GLYPHS(`w${w}`, x0, y + 4, { font: 'mono', size: 8, c: PALE, alpha: 0.6 }));
        // alpha 1 on the left, alpha 0.5 on the right, five strokes each 3px apart
        [1, 0.5].forEach((a, ai) => {
          for (let s = 0; s < 5; s++) {
            const xs = x0 + 26 + ai * 88;
            ops.push(OP('s', line(xs, y + s * 3, 74, 3, 8), 'line', br, w, BLUE, a));
          }
        });
      });
    });

    // a fan of "barbs": one rachis, many strokes hung from it at ~48 degrees
    const bx = 60, by = 330, rach = 200, ang = (48 * Math.PI) / 180;
    ops.push(OP('s', [[bx, by], [bx + rach, by]], 'line', 'pencil', 1.6, [210, 200, 170], 1));
    let i = 0;
    for (let s = 0; s < rach - 10; s += 1.3) {
      const jitter = (seed(i, 9) - 0.5) * 0.09;
      const a = ang + jitter;
      const L = 90 + seed(i, 3) * 8;
      const p0 = [bx + s, by];
      const pts = Array.from({ length: 9 }, (_, k) => {
        const t = k / 8;
        // barbs curve gently toward the tip of the feather
        return [p0[0] + Math.cos(a - t * 0.35) * L * t, p0[1] + Math.sin(a - t * 0.35) * L * t];
      });
      const lift = 0.55 + 0.45 * seed(i, 5);
      const c = BLUE.map((v, k) => Math.round(v * (0.75 + 0.4 * lift) + (k === 2 ? 0 : 0)));
      ops.push(OP('s', pts, 'line', 'pencil', 0.9, c, 0.5 + 0.5 * seed(i, 7)));
      i++;
    }

    // the same fan, wider strokes underneath and finer ones over them
    const bx2 = 360;
    ops.push(OP('s', [[bx2, by], [bx2 + rach, by]], 'line', 'pencil', 1.6, [210, 200, 170], 1));
    i = 0;
    for (let s = 0; s < rach - 10; s += 3.4) {
      const a = ang + (seed(i, 19) - 0.5) * 0.09;
      const L = 90 + seed(i, 13) * 8;
      const pts = Array.from({ length: 9 }, (_, k) => {
        const t = k / 8;
        return [bx2 + s + Math.cos(a - t * 0.35) * L * t, by + Math.sin(a - t * 0.35) * L * t];
      });
      ops.push(OP('s', pts, 'tone', 'soft', 1.1, [46, 84, 160], 0.9));
      i++;
    }
    i = 0;
    for (let s = 0; s < rach - 10; s += 1.3) {
      const a = ang + (seed(i, 29) - 0.5) * 0.09;
      const L = 90 + seed(i, 23) * 8;
      const pts = Array.from({ length: 9 }, (_, k) => {
        const t = k / 8;
        return [bx2 + s + Math.cos(a - t * 0.35) * L * t, by + Math.sin(a - t * 0.35) * L * t];
      });
      ops.push(OP('s', pts, 'line', 'pencil', 0.55, [120, 170, 230], 0.25 + 0.5 * seed(i, 27)));
      i++;
    }

    // dots: how big is a soft dot of radius 6 at alpha 1, and 0.3
    [1, 0.6, 0.3].forEach((a, k) => {
      ops.push(DOT(700 + k * 60, 340, 10, 'accent', 'soft', BLUE, a));
    });
    return ops;
  },
};
