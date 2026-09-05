/* A repeatable calibration sheet. These are ordinary timed gestures; no
 * hidden brushes, images, fills or special-case rendering of the examples. */
import { textOps } from './mark-engine.js';
import { DEFAULT_SURFACE } from './material-engine.js';

export function createPracticeDrawing() {
  const ops = [];
  const stroke = (tool, size, points, pressure = .55, tilt = 0, duration = 650, strength = 1) => {
    ops.push({ k: 'm', tool, size, strength, samples: points.map(([x, y], i) => ({ x, y,
      p: typeof pressure === 'function' ? pressure(i / Math.max(1, points.length - 1)) : pressure,
      tiltX: tilt ? 12 : 0, tiltY: tilt, t: duration * i / Math.max(1, points.length - 1) })) });
  };
  const label = (text, x, y, size = 11) => {
    for (const op of textOps(text, x, y, size, 'line', 'pencil', 0, .5)) {
      if (op.pts?.length > 1) for (let pass = 0; pass < 2; pass++) stroke('graphite-6b', 1.25, op.pts, .85, 0, Math.max(90, op.pts.length * 32));
    }
  };
  const path = (x, y, width, n = 36) => Array.from({ length: n }, (_, i) => [x + width * i / (n - 1), y + 1.8 * Math.sin(i / (n - 1) * 3.2)]);
  const swatch = (tool, x, y, w, h, count = 12, p = .55, tilt = 55, size = 3) => {
    for (let row = 0; row < count; row++) {
      const points = path(x + (row % 3) * .7, y + h * row / Math.max(1, count - 1), w);
      if (row % 2) points.reverse();
      stroke(tool, size, points, p, tilt, 420);
    }
  };
  label('a study of contact', 55, 49, 23);
  label('pressure, grain, and a little patience', 57, 80, 11);

  label('01  pressure', 57, 128, 13);
  for (const [i, tool, name] of [[0, 'graphite-hb', 'hb'], [1, 'graphite-2b', '2b'], [2, 'graphite-6b', '6b']]) {
    label(name, 58, 165 + i * 31, 11);
    stroke(tool, 3, path(100, 160 + i * 31, 220, 45), (u) => .05 + .93 * u, 15, 1200);
  }
  label('light touch to a firm point', 57, 263, 10);

  label('02  the side of a pencil', 396, 128, 13);
  for (let row = 0; row < 8; row++) stroke('graphite-2b', 2.2, path(399, 155 + row * 8, 112), .5, 0, 450);
  for (let row = 0; row < 8; row++) stroke('graphite-2b', 2.2, path(555, 155 + row * 8, 112), .5, 72, 450);
  label('upright', 402, 242, 10); label('laid on its side', 550, 242, 10);
  label('same pressure and tool', 396, 263, 10);

  label('03  the same grain', 746, 128, 13);
  for (let col = 0; col < 3; col++) {
    for (let pass = 0; pass <= col * 2; pass++) swatch('graphite-6b', 750 + col * 92, 159, 67, 48, 9, .3, 65, 2.8);
    label(`${col * 2 + 1} pass${col ? 'es' : ''}`, 747 + col * 92, 242, 10);
  }
  label('build into the tooth', 746, 263, 10);

  label('04  pigment can travel', 57, 333, 13);
  swatch('vine-charcoal', 62, 365, 80, 54, 13, .65, 35, 6);
  stroke('stump', 25, [[97, 394], [134, 394], [177, 394], [236, 390], [314, 382]], .6, 0, 1400);
  label('charcoal carried into clean paper', 57, 450, 10);
  ops.push({ k: 'clean', tool: 'stump' });

  label('05  recover the light', 396, 333, 13);
  swatch('compressed-charcoal', 404, 366, 240, 53, 16, .55, 30, 5);
  stroke('kneaded-eraser', 24, [[447, 409], [453, 385], [466, 373], [481, 379], [488, 407]], .6, 0, 850);
  stroke('precision-eraser', 2.8, [[549, 411], [562, 376], [579, 404], [601, 371]], .9, 0, 800);
  label('soft lifting      a cut of light', 396, 450, 10);

  label('06  give tone a form', 746, 333, 13);
  // A cast shadow, followed by a curved accumulation of graphite. Pressure
  // describes the light, while each individual gesture still leaves grain.
  for (let i = 0; i < 15; i++) {
    const half = 105 * Math.sqrt(1 - Math.pow((i - 7) / 8, 2));
    stroke('vine-charcoal', 4, path(880 - half, 615 + i, half * 2), .16 + .08 * Math.sin(i / 15 * Math.PI), 60, 450);
  }
  const cx = 875, cy = 512, radius = 102;
  for (let row = 0; row < 121; row++) {
    const ny = -.985 + row / 120 * 1.97, half = Math.sqrt(1 - ny * ny);
    const pts = [], pressures = [];
    for (let k = 0; k < 55; k++) {
      const nx = (-half + 2 * half * k / 54) * .996;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      const illumination = Math.max(0, -.48 * nx - .56 * ny + .66 * nz);
      pts.push([cx + nx * radius, cy + ny * radius]);
      pressures.push(.075 + .62 * Math.pow(1 - illumination, 1.2));
    }
    stroke('graphite-6b', 2.7, pts, (u) => pressures[Math.round(u * 54)], 15, 730);
  }
  stroke('kneaded-eraser', 13, [[836, 466], [845, 457], [859, 455]], .5, 0, 450);
  label('graphite, built a line at a time', 746, 691, 10);

  label('07  keep looking', 57, 531, 13);
  label('the paper stays where it is.', 57, 565, 12);
  label('the hand chooses how to meet it.', 57, 592, 12);
  label('draw. step back. learn. return.', 57, 646, 13);
  label('material study  /  01', 57, 717, 10);
  return { version: 1, title: 'A study of contact', page: { w: 1100, h: 780 }, surface: { ...DEFAULT_SURFACE }, ops,
    tool: 'graphite-2b', settings: { size: 2.2, strength: 1 }, reviews: [
      { at: ops.length, observation: 'A repeatable first study: pressure ramps; upright versus side contact; repeated passes; carried charcoal; two erasers; a graphite sphere.',
        lesson: 'Change one contact variable at a time. Compare the same tool on the same grain, then inspect the edge and the filled valleys.',
        next: 'Make a short mark beside a swatch, inspect at 100%, then record what actually changed.', tool: 'graphite-2b', settings: { size: 2.2, strength: 1 } },
    ] };
}
