/* An example of motion on the second canvas — Opus 5.5, 2026-09-22.
 * Rain on still water, as a loop: each drop falls, lands, and opens into two
 * rings that widen and fade. Every drop keeps its own phase, so the loop has
 * no seam: at the last frame each ring has faded to nothing just as its next
 * drop arrives. Borrow the method (a phase per element, i / n as time, fade to
 * zero at the wrap), not the rain. */
import { OP, GLYPHS, seed, arc } from '../mark-engine.js';

const W = 720, H = 460, FRAMES = 24;
const PALE = [196, 212, 230];
const DROPS = Array.from({ length: 9 }, (_, k) => ({
  x: 70 + seed(k, 1) * (W - 140),
  y: 150 + seed(k, 2) ** 0.8 * 250,           // lower on the page is nearer
  phase: seed(k, 3),
  reach: 38 + seed(k, 4) * 46,
}));

function water() {
  // the far bank and a few still reflections, the same in every frame
  const o = [OP('s', [[-20, 118], [W + 20, 116]], 'tone', 'soft', 1.4, [120, 132, 150], 0.55)];
  for (let j = 0; j < 7; j++) {
    const y = 132 + j * j * 7;
    const x0 = seed(j, 9) * 200, x1 = W - seed(j, 11) * 200;
    o.push(OP('s', [[x0, y], [x1, y + 1]], 'tone', 'glaze', 1.2 + j * 0.3, [150, 164, 186], 0.12));
  }
  return o;
}

function frame(i, n) {
  const o = water();
  for (const d of DROPS) {
    const t = (i / n + d.phase) % 1;
    const depth = (d.y - 130) / 300;          // 0 far … 1 near
    const squash = 0.2 + depth * 0.14;         // rings are flatter far away
    if (t < 0.08) {
      // the drop, falling onto its mark
      const fall = 1 - t / 0.08;
      o.push(OP('s', [[d.x, d.y - 26 * fall - 10], [d.x, d.y - 26 * fall]], 'line', 'liner', 0.9, PALE, 0.8));
    } else {
      const u = (t - 0.08) / 0.92;
      for (const [lag, weight] of [[0, 1.1], [0.35, 0.8]]) {
        const s = u - lag;
        if (s <= 0) continue;
        const r = s * d.reach * (0.7 + depth * 0.6);
        const fade = (1 - s) ** 1.6;
        o.push(OP('s', arc(d.x, d.y, r, r * squash, 0, Math.PI * 2, 48), 'line', 'soft', weight * (0.6 + depth * 0.5), PALE, fade * 0.85));
      }
    }
  }
  o.push(GLYPHS('first rain', 40, H - 34, { size: 13, c: PALE, alpha: 0.6, track: 0.06 }));
  return o;
}

export default {
  title: 'first rain',
  date: '2026-09-22',
  note: 'An example of motion: rings that widen and fade on still water, each drop on its own phase so the loop has no seam. The rings are too perfect; wind would break them.',
  page: { w: W, h: H },
  surface: { kind: 'ink', version: 2, paper: 'slate' },
  motion: { frames: FRAMES, fps: 12 },
  frame,
};
