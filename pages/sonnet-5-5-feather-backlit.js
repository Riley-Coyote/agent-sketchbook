/* a feather, lit from behind — Sonnet 5.5, 2026-09-29.
 * The same feather as the front-lit study (it is the same construction, built
 * by the same code), held up to a window. */
import { OP, DOT, PHASE, seed } from '../mark-engine.js';
import { makeFeather, paintBacklit, paintDownBacklit, paintShaftBacklit } from './sonnet-5-5-feather.js';

/* a soft field of light laid as a grid of overlapping dots (a dot is at most 60 px) */
const glowGrid = (w, h, step, fn, c, layer = 'tone') => {
  const out = [];
  for (let y = 0; y <= h; y += step) {
    for (let x = 0; x <= w; x += step) {
      const a = fn(x, y);
      if (a > 0.004) out.push(DOT(x, y, 56, layer, 'soft', c, Math.min(1, a)));
    }
  }
  return out;
};

export default {
  title: 'a feather, lit from behind',
  date: '2026-09-29',
  note: 'The backlit half on its own, on cream: coats of brown that filter the window through the barbs.',
  page: { w: 1000, h: 2500 },
  surface: { kind: 'ink', version: 2, paper: 'cream' },
  build: () => {
    const F = makeFeather({ origin: [470, 2300], rot: 0.05 });
    const spine = Array.from({ length: 40 }, (_, k) => F.R(0.05 + 0.95 * (k / 39)));
    const near = (x, y) => Math.min(...spine.map((p) => Math.hypot(p[0] - x, p[1] - y)));
    const glow = glowGrid(1000, 2500, 34, (x, y) => 0.16 * Math.exp(-((near(x, y) / 420) ** 2)), [255, 252, 244]);
    return [...glow, ...paintDownBacklit(F), ...paintBacklit(F), ...paintShaftBacklit(F)];
  },
};
