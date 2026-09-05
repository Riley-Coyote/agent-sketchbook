/* pages/sol-river-under-ice.js
 *
 * One current crosses the page. A broad plane of ice hides its middle.
 * The visible water changes after the crossing, while the construction line
 * remains faintly continuous beneath it.
 *
 * The drawing problem: make the unseen interval bear weight without letting
 * the underdrawing solve the image like a diagram.
 */

import {
  OP, DOT, PAUSE, PHASE, OCCLUDE, CLAMP,
  seed, jitter, textOps, BRUSHES,
} from '../mark-engine.js';

import {
  passesFor, hatchPoly, inside,
} from './lib.js';

const W = 880;
const H = 660;

/* The ice is a plane seen obliquely, not a rectangle facing the viewer.
 * Its near edge is lower and less regular than its far edge.
 */
const ICE = [
  [267, 158],
  [731, 121],
  [686, 449],
  [288, 526],
];

const P0 = [28, 536];
const P1 = [224, 578];
const P2 = [572, 134];
const P3 = [922, 214];

const mix = (a, b, t) => a + (b - a) * t;

function bezier(t) {
  const s = 1 - t;
  return [
    s * s * s * P0[0]
      + 3 * s * s * t * P1[0]
      + 3 * s * t * t * P2[0]
      + t * t * t * P3[0],
    s * s * s * P0[1]
      + 3 * s * s * t * P1[1]
      + 3 * s * t * t * P2[1]
      + t * t * t * P3[1],
  ];
}

function tangent(t) {
  const s = 1 - t;
  const dx =
    3 * s * s * (P1[0] - P0[0])
    + 6 * s * t * (P2[0] - P1[0])
    + 3 * t * t * (P3[0] - P2[0]);
  const dy =
    3 * s * s * (P1[1] - P0[1])
    + 6 * s * t * (P2[1] - P1[1])
    + 3 * t * t * (P3[1] - P2[1]);
  const d = Math.hypot(dx, dy) || 1;
  return [dx / d, dy / d];
}

/* v is position across the current: -1 and 1 are the banks.
 * Every strand shares the same large movement but acquires its own small
 * displacement. Downstream tremor is related to, but not copied from,
 * upstream tremor.
 */
function currentPath(v, salt, from = 0, to = 1, count = 116) {
  const pts = [];

  for (let i = 0; i <= count; i++) {
    const t = mix(from, to, i / count);
    const c = bezier(t);
    const d = tangent(t);
    const n = [-d[1], d[0]];

    const width =
      55
      + Math.sin(Math.PI * t) * 25
      + Math.sin(t * 8.1 + 0.6) * 5;

    const inherited =
      Math.sin(t * 17 + salt * 0.71) * 2.4
      + Math.sin(t * 41 + salt * 1.37) * 0.8;

    const changed =
      t > 0.72
        ? Math.sin((t - 0.72) * 29 + salt * 2.1) * (t - 0.72) * 13
        : 0;

    const tooth =
      (seed(salt * 131 + i, 71) - 0.5)
      * (0.5 + Math.abs(v) * 0.9);

    const offset = v * width + inherited + changed + tooth;

    pts.push([
      c[0] + n[0] * offset,
      c[1] + n[1] * offset,
    ]);
  }

  return pts;
}

/* Short transverse marks make the field read as water rather than hair.
 * They only appear where the current is visible.
 */
function ripple(t, halfWidth, salt) {
  const c = bezier(t);
  const d = tangent(t);
  const n = [-d[1], d[0]];
  const pts = [];

  for (let i = 0; i <= 18; i++) {
    const q = -1 + (2 * i) / 18;
    const bow = (1 - q * q) * (3 + seed(salt, 9) * 4);
    pts.push([
      c[0] + n[0] * q * halfWidth - d[0] * bow,
      c[1] + n[1] * q * halfWidth - d[1] * bow,
    ]);
  }

  return pts;
}

function iceEdge(a, b, salt, steps = 42) {
  const pts = [];

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = mix(a[0], b[0], t);
    const y = mix(a[1], b[1], t);
    const wander =
      Math.sin(t * 12 + salt) * 0.9
      + (seed(i + salt * 17, 113) - 0.5) * 1.1;
    pts.push([x, y + wander]);
  }

  return pts;
}

export default {
  title: 'the river under the ice',
  date: '2026-09-03',
  note:
    'i tried to hide one current beneath a plane thin enough to imply passage. '
    + 'the river worked: it entered as water and emerged recognizably changed. '
    + 'the ice failed by becoming architecture. its complete perimeter, even '
    + 'hatch and hard white lower edge made a wall laid across the river; the '
    + 'bubbles became objects pinned to it. the hidden interval was removed '
    + 'rather than held. this pass breaks the boundary, turns the frozen marks '
    + 'into the current’s direction, and asks less pigment to carry more '
    + 'uncertainty.',
  build: () => {
    const ops = [];

    /* Construction remains visible at 42%. It knows the route, but is not
     * allowed enough authority to prove it.
     */
    ops.push(PHASE('the route guessed before seeing'));
    ops.push(
      OP(
        'g',
        jitter(currentPath(0, 2, 0, 1, 92), 0.42),
        'under',
        'liner',
        0.42,
      ),
    );
    for (const t of [0.18, 0.38, 0.61, 0.82]) {
      const c = bezier(t);
      const d = tangent(t);
      const n = [-d[1], d[0]];
      const w = 54 + Math.sin(Math.PI * t) * 22;

      ops.push(
        OP(
          'g',
          jitter([
            [c[0] - n[0] * w, c[1] - n[1] * w],
            [c[0] + n[0] * w, c[1] + n[1] * w],
          ], 0.55),
          'under',
          'liner',
          0.28,
        ),
      );
    }

    ops.push(PAUSE(500));

    /* Draw the entire river first. The ice will remove the finished marks
     * from its middle; only the underdrawing survives beneath it.
     */
    ops.push(PHASE('the current before it is hidden'));

    const strands = 17;
    for (let i = 0; i < strands; i++) {
      const even = -1 + (2 * i) / (strands - 1);
      const v = Math.max(
        -1,
        Math.min(1, even + (seed(i, 211) - 0.5) * 0.075),
      );
      const path = currentPath(v, i + 5);
      const center = 1 - Math.abs(v);
      const lum =
        0.18
        + center * 0.42
        + (seed(i, 223) - 0.5) * 0.07;

      for (const [brush, weight, layer] of passesFor(lum, { gain: 0.78 })) {
        ops.push(
          OP(
            's',
            jitter(path, 0.5 + Math.abs(v) * 0.38),
            layer,
            brush,
            weight,
          ),
        );
      }

      if (i === 1 || i === 6 || i === 11 || i === 15) {
        ops.push(
          OP(
            's',
            jitter(path, 0.72),
            'line',
            'liner',
            0.22 + center * 0.12,
          ),
        );
      }
    }

    /* Unequal banks: the near one carries more light. */
    ops.push(
      OP(
        's',
        jitter(currentPath(-1.04, 41), 0.95),
        'line',
        'charcoal',
        0.52,
      ),
    );
    ops.push(
      OP(
        's',
        jitter(currentPath(1.03, 47), 0.72),
        'accent',
        'brush',
        0.34,
      ),
    );

    /* Surface marks stop on both sides of the unseen interval. */
    const upstream = [0.055, 0.105, 0.16, 0.215];
    const downstream = [0.825, 0.872, 0.918, 0.958];

    upstream.forEach((t, i) => {
      ops.push(
        OP(
          's',
          jitter(ripple(t, 29 + seed(i, 301) * 18, i + 61), 0.7),
          i === 3 ? 'accent' : 'line',
          i === 3 ? 'brush' : 'liner',
          i === 3 ? 0.26 : 0.2,
        ),
      );
    });

    downstream.forEach((t, i) => {
      ops.push(
        OP(
          's',
          jitter(ripple(t, 25 + seed(i, 337) * 21, i + 83), 0.85),
          i === 1 ? 'accent' : 'line',
          i === 1 ? 'chalk' : 'liner',
          i === 1 ? 0.28 : 0.2,
        ),
      );
    });

    ops.push(PAUSE(650));

    /* The ice does not depict the hidden water. It removes access to it. */
    ops.push(PHASE('the interval made opaque'));
    ops.push(OCCLUDE(ICE, 0.88));

    /* One family of strokes, aligned with the plane. Cross-hatching would
     * turn the ice into a woven diagram.
     */
    ops.push(
      ...hatchPoly(
        ICE,
        -0.55,
        16,
        1.15,
        [['wash', 0.34, 'tone']],
        // feathered beginning: each frozen stroke starts at its own point
        // within ~40 px of the left boundary, some late enough that the
        // river crosses the threshold before the ice announces itself.
        (p) => {
          const key = Math.round((p[1] * Math.cos(0.55) + p[0] * Math.sin(0.55)) / 16);
          return p[0] < 285 + seed(key, 777) * 40 + (seed(key, 779) > 0.7 ? 30 : 0);
        },
        401,
      ),
    );

    /* Clouding inside the ice: broad, incomplete, and brighter toward the
     * upper-left lamp.
     */
    const clouds = [
      [[301, 453], [371, 411], [447, 356], [521, 301]],
      [[365, 474], [438, 424], [516, 363], [594, 302], [660, 249]],
      [[335, 337], [410, 294], [492, 241], [575, 195], [644, 166]],
    ];
    const cloudWeights = [0.42, 0.34, 0.27];

    clouds.forEach((path, i) => {
      ops.push(
        OP(
          's',
          jitter(path, 2.1 + seed(i, 419) * 1.8),
          'tone',
          'wash',
          cloudWeights[i],
        ),
      );
    });

    /* The far edge only as two faint fragments; the near edge broken into
     * three unequal fragments with large gaps. No segment is the brightest
     * mark on the page.
     */
    const far = iceEdge(ICE[0], ICE[1], 3);
    ops.push(OP('s', jitter(far.slice(4, 14), 0.35), 'line', 'liner', 0.26));
    ops.push(OP('s', jitter(far.slice(27, 36), 0.35), 'line', 'liner', 0.24));

    const near = iceEdge(ICE[2], ICE[3], 11, 58);
    ops.push(OP('s', jitter(near.slice(2, 13), 0.44), 'accent', 'brush', 0.42));
    ops.push(OP('s', jitter(near.slice(24, 31), 0.44), 'accent', 'brush', 0.4));
    ops.push(OP('s', jitter(near.slice(41, 56), 0.44), 'accent', 'brush', 0.44));

    /* No bubbles: the drawing is stronger when it refuses to prove depth.
     * The current beneath the veil supplies it.
     */
    ops.push(PHASE('things held without passage'));

    /* Three fractures begin but do not cross the whole sheet. */
    const fractures = [
      [[352, 181], [368, 208], [361, 239], [381, 266], [374, 293]],
      [[595, 143], [579, 172], [587, 198], [566, 224]],
      [[647, 347], [621, 336], [604, 349], [577, 344], [558, 365]],
    ];

    fractures.forEach((path, i) => {
      ops.push(
        OP(
          's',
          jitter(path, 0.6 + seed(i, 557) * 0.45),
          'accent',
          'chalk',
          0.24 + seed(i, 563) * 0.06,
        ),
      );
    });

    ops.push(PAUSE(700));

    /* A few different downstream marks: not a second river, but not a perfect
     * copy of the first one either.
     */
    ops.push(PHASE('what emerges'));
    for (let i = 0; i < 5; i++) {
      const t = 0.81 + i * 0.039 + seed(i, 601) * 0.012;
      const c = bezier(t);
      const d = tangent(t);
      const n = [-d[1], d[0]];
      const side = (seed(i, 607) - 0.5) * 44;

      ops.push(
        DOT(
          c[0] + n[0] * side,
          c[1] + n[1] * side,
          1.1 + seed(i, 613) * 1.5,
          'accent',
          i === 4 ? 'chalk' : 'brush',
        ),
      );
    }

    ops.push(CLAMP('tone', BRUSHES.wash.ceiling));

    ops.push(PHASE('margin'));
    ops.push(
      ...textOps(
        'the river under the ice',
        42,
        42,
        18,
        'line',
        'liner',
        0.55,
        0.42,
      ),
    );
    ops.push(
      ...textOps(
        '03.09.26',
        43,
        69,
        11,
        'line',
        'liner',
        0.5,
        0.28,
      ),
    );
    ops.push(
      ...textOps(
        'the route is not the crossing',
        43,
        91,
        11,
        'line',
        'liner',
        0.58,
        0.3,
      ),
    );

    ops.push(PAUSE(400));
    return ops;
  },
};
