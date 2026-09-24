/* A human hand, drawn in the sketchbook's line: a right hand seen from the
 * back, reaching up, the index finger out to tip a book from a shelf and
 * the others curled. Opus 5.5, 2026-09-24.
 *
 * The outline is set down point by point from a hand's proportions (the
 * knuckles a hundred units across, the palm a little longer than the
 * fingers, the curled fingers showing only their first joints from behind,
 * the thumb low on the near side) and smoothed through those points into
 * one line a pencil can go round. The knuckles and joints get short marks,
 * as a draughtsman leaves them. It is filled with the page's own paper, so
 * it reads as anyone's hand. */
const KEY = [
  /* forearm, up its near side to the wrist */
  [-44, 340], [-40, 250], [-36, 170], [-34, 118],
  /* the thumb: out from low on the hand, its outer edge to the tip */
  [-44, 96], [-58, 72], [-72, 48], [-82, 24], [-87, 4], [-86, -10], [-79, -15],
  /* its inner edge, back to the web */
  [-72, -8], [-66, 6], [-60, 18], [-54, 26],
  /* index: up its outer side, over the hooked tip, down its inner side */
  [-52, 8], [-54, -26], [-56, -60], [-54, -86], [-48, -100], [-38, -104], [-30, -98], [-28, -84], [-30, -58], [-30, -26], [-28, -8],
  /* middle, ring and little: curled, so only their first joints from behind */
  [-24, -22], [-20, -38], [-12, -46], [-2, -46], [5, -38], [6, -16],
  [9, -30], [15, -40], [24, -41], [31, -33], [32, -12],
  [36, -22], [42, -30], [50, -30], [56, -22], [57, -6],
  /* down the far edge of the hand to the wrist, and the forearm */
  [60, 20], [58, 56], [52, 90], [46, 118], [48, 170], [52, 250], [56, 340],
];
/* the marks: a short curve over each knuckle and joint, the thumb's crease */
const arc = (a, b, bulge, n = 7) => Array.from({ length: n }, (_, k) => {
  const u = k / (n - 1), m = 4 * u * (1 - u);
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u + bulge * m];
});
export const HAND_MARKS = [
  arc([-49, 0], [-32, 0], 2.6), arc([-53, -57], [-35, -57], 2.2),
  arc([-22, -7], [1, -7], 3), arc([10, -3], [28, -3], 2.6), arc([36, 3], [52, 3], 2.2),
  arc([-12, -42], [0, -40], 2), arc([16, -36], [27, -35], 1.8),
  /* the nail on the tip of the index */
  [[-48, -88], [-49, -95], [-45, -100], [-38, -100], [-35, -95], [-36, -88]],
  /* the thumb's joint, and the ridge of a tendon down the back of the hand */
  arc([-78, 16], [-66, 22], 2.4), [[-40, 58], [-33, 76], [-27, 98]],
];
/** where the index finger's tip is, in hand units: what touches the book */
export const HAND_TIP = [-40, -104];

/* Catmull-Rom through the key points, closed */
export const HAND_OUTLINE = (() => {
  const n = KEY.length, out = [];
  for (let i = 0; i < n; i++) {
    const p0 = KEY[(i - 1 + n) % n], p1 = KEY[i], p2 = KEY[(i + 1) % n], p3 = KEY[(i + 2) % n];
    for (let k = 0; k < 6; k++) {
      const t = k / 6, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((a) => 0.5 * (2 * p1[a] + (-p0[a] + p2[a]) * t + (2 * p0[a] - 5 * p1[a] + 4 * p2[a] - p3[a]) * t2 + (-p0[a] + 3 * p1[a] - 3 * p2[a] + p3[a]) * t3)));
    }
  }
  return out;
})();

/* The hand that holds the book open to read it: a left hand from the
 * front, its thumb along the page's lower corner, the fingers behind the
 * cover, the heel of the hand and the wrist below the book. Units as above;
 * the book's lower edge runs through y = 0, the page to the right of x = 0. */
const HOLD_KEY = [
  [-86, 300], [-80, 200], [-72, 120], [-66, 70], [-58, 34],
  /* the thumb, laid across the page's corner */
  [-44, 8], [-24, -14], [0, -32], [22, -46], [38, -52], [46, -48], [44, -38], [30, -26], [10, -10], [-8, 6],
  /* under the book: the side of the first finger, the heel of the hand */
  [-4, 18], [12, 30], [18, 52], [10, 84], [-2, 118], [-10, 200], [-14, 300],
];
export const HOLD_MARKS = [
  [[28, -44], [34, -46], [40, -44], [41, -39]],                  // the thumbnail's edge
  arc([-6, -26], [2, -12], 2.2), [[-40, 60], [-44, 90], [-46, 120]],
];
export const HOLD_OUTLINE = (() => {
  const n = HOLD_KEY.length, out = [];
  for (let i = 0; i < n; i++) {
    const p0 = HOLD_KEY[(i - 1 + n) % n], p1 = HOLD_KEY[i], p2 = HOLD_KEY[(i + 1) % n], p3 = HOLD_KEY[(i + 2) % n];
    for (let k = 0; k < 6; k++) {
      const t = k / 6, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((a) => 0.5 * (2 * p1[a] + (-p0[a] + p2[a]) * t + (2 * p0[a] - 5 * p1[a] + 4 * p2[a] - p3[a]) * t2 + (-p0[a] + 3 * p1[a] - 3 * p2[a] + p3[a]) * t3)));
    }
  }
  return out;
})();
