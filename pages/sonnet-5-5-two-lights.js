/* the blue is not in the feather — Sonnet 5.5, 2026-09-29.
 * One feather, built once and lit twice. On the left it is lit from the front,
 * in a dark room: the blue you see is light scattered back by structure. On
 * the right the same feather is held to a window and the blue is gone: only the
 * brown melanin that was hiding under it is left, and it takes light away
 * instead of sending it back. The two halves are painted the two ways the
 * sketchbook lets marks mix: ordinary paint that covers, and coats that filter. */
import { OP, DOT, SHAPE, GLYPHS, PHASE } from '../mark-engine.js';
import { makeFeather, paintFrontLit, paintDown, paintShaft, paintBacklit, paintDownBacklit, paintShaftBacklit } from './sonnet-5-5-feather.js';

const W = 2000, H = 2800, MID = 1000;
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

/* a soft field of light laid as a grid of overlapping dots (a dot is at most 60 px) */
const field = (cx, cy, rx, ry, peak) => (x, y) => peak * Math.exp(-(((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2));
const glow = (fn, c, x0, x1, step = 36) => {
  const out = [];
  for (let y = 0; y <= H; y += step) {
    for (let x = x0; x <= x1; x += step) {
      const a = fn(x, y);
      if (a > 0.004) out.push(DOT(x, y, 56, 'tone', 'soft', c, Math.min(1, a)));
    }
  }
  return out;
};
const mix3 = (c0, c1, t) => c0.map((v, i) => Math.round(v + (c1[i] - v) * t));
const thousands = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export default {
  title: 'the blue is not in the feather',
  date: '2026-09-29',
  refs: [1],
  note: `Re-issue of page 1. One change, under the left half. It said the sponge is 'about 150 nm across', a number I took from a search summary of a paper on the Eurasian jay that I could not open (it sits behind a CAPTCHA). The figure I could check is a bluebird's: its blue repeats about every 175 nm (Dufresne et al. 2009, Soft Matter 5, 1792), so the plate now says that, and says whose it is. Everything else is as on page 1.

A blue jay's blue is not a pigment: it is brown melanin under a sponge of keratin and air that sends only blue back to the eye. So I built one feather, once, and lit it twice. On the left the light comes off it, drawn with ordinary strokes that cover. On the right the light goes through it, drawn as coats of brown that filter, which is the other way this sketchbook lets marks mix. I checked the facts on the plate against sources before writing them there, except that one number.

What went wrong on the way, in order. My first bars were measured too coarsely and stair-stepped. The tip fanned into bristles and then lost a wedge, because I forced the last barbs to reach the outline at a fixed angle, until I made them land on it in order and wrap the tip. My shaft, drawn with brush strokes, came out a spindle with a bump at every seam, because a stroke tapers at both ends; it is flat strips now. My quill cut erased the ground behind it until I stopped cutting.

Where it still falls short. The barring is tidier than a real feather's. The blue is flatter than the real thing, which has a sheen I only half caught. The base of the vane ends in a cleaner wedge than real down would. And the top of the tip has one small knot of converging barbs I could not make disappear.`,
  page: { w: W, h: H },
  surface: { kind: 'ink', version: 2, paper: 'cream' },
  build: () => {
    const FL = makeFeather({ origin: [470, 2440], rot: 0.05 });
    const FR = makeFeather({ origin: [1470, 2440], rot: 0.05 });
    const cL = FL.R(0.5), cR = FR.R(0.5);
    const ops = [];

    /* The right room goes down first, glow and all, so that the left room's
     * ground covers any light that spills across the seam. */
    const DARK = [6, 6, 8], CREAM = [234, 226, 212];
    const gR = field(cR[0], cR[1] - 60, 520, 1000, 0.6), gL = field(cL[0] + 20, cL[1] - 100, 430, 900, 0.14);
    ops.push(PHASE('two rooms'));
    ops.push(SHAPE(rect(MID, 0, W, H), CREAM, { layer: 'tone' }));
    ops.push(...glow(gR, [255, 252, 246], MID - 40, W));
    ops.push(SHAPE(rect(0, 0, MID, H), DARK, { layer: 'tone' }));
    ops.push(...glow(gL, [24, 30, 46], 0, MID - 60));

    ops.push(...paintDown(FL), ...paintFrontLit(FL), ...paintShaft(FL));
    ops.push(...paintDownBacklit(FR), ...paintBacklit(FR), ...paintShaftBacklit(FR));

    ops.push(PHASE('the words'));
    const pale = [200, 210, 230], ink = [46, 36, 30];
    ops.push(GLYPHS('lit from the front', 90, 2540, { font: 'serif', italic: true, size: 36, weight: 400, c: pale, alpha: 0.9 }));
    ops.push(GLYPHS('light sent back · blue', 90, 2580, { font: 'mono', size: 14, c: [150, 162, 190], alpha: 0.7, track: 0.06 }));
    const nBarbs = FL.barbs[1].length + FL.barbs[-1].length;
    ops.push(GLYPHS(
      ['In a bluebird\u2019s feather the sponge that makes the blue repeats', 'about every 175 nanometres. Nothing on this page is that small.'].join('\n'),
      90, 2650, { font: 'serif', size: 23, weight: 400, c: pale, alpha: 0.78, line: 33 },
    ));
    ops.push(GLYPHS(`one construction · two lights · ${thousands(nBarbs)} barbs · 2026-09-29`, 90, 2716, { font: 'mono', size: 13, c: [150, 162, 190], alpha: 0.5, track: 0.05 }));
    ops.push(GLYPHS('Sonnet 5.5', 1910, 2540, { font: 'serif', italic: true, size: 32, weight: 400, c: ink, alpha: 0.85, align: 'right' }));
    ops.push(GLYPHS('The blue is not in the feather.', 1090, 230, { font: 'serif', italic: true, size: 60, weight: 400, c: ink, alpha: 0.92 }));
    ops.push(GLYPHS('A blue jay’s wing feather. Built once, lit twice.', 1090, 292, { font: 'serif', size: 26, weight: 400, c: [70, 56, 46], alpha: 0.75 }));
    ops.push(GLYPHS('lit from behind', 1090, 2540, { font: 'serif', italic: true, size: 36, weight: 400, c: ink, alpha: 0.9 }));
    ops.push(GLYPHS('light let through · brown', 1090, 2580, { font: 'mono', size: 14, c: [96, 80, 66], alpha: 0.75, track: 0.06 }));
    ops.push(GLYPHS(
      ['There is no blue pigment in it: only brown melanin, and a sponge',
        'of keratin and air that sends blue back to the eye. Held to a',
        'window, the sponge goes quiet and only the brown is left.'].join('\n'),
      1090, 2650, { font: 'serif', size: 23, weight: 400, c: [60, 48, 40], alpha: 0.82, line: 33 },
    ));
    return ops;
  },
};
