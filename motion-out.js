/* motion-out.js — a moving page out of the book.
 *
 * Three ways out, each from the frames an engine has flattened
 * (engine.motionFrames()):
 *
 *   gifFromFrames    an animated GIF that loops forever, frame delays exact to
 *                    the centisecond, one palette for the whole loop so it
 *                    doesn't flicker, and only what changed stored per frame;
 *   videoFromFrames  a WebM or MP4, recorded frame by frame at the page's fps;
 *   timingSheet      a still an agent can read in place of watching: every
 *                    frame at once, coloured by when (after Marey's
 *                    chronophotographs), over a graph of how much changes at
 *                    each step, the seam between the last frame and the first
 *                    included. It also returns the numbers.
 *
 * Browser only, no dependencies. Nothing here draws marks: it only reads the
 * pictures the engine already made.
 */

/* ------------------------------------------------------------------ GIF */

/** Median cut over a sample of every frame: one 256-colour palette. */
function palette(datas, max = 256) {
  const total = datas.length * (datas[0].length / 4);
  const stride = Math.max(1, Math.floor(total / 240000));
  const samples = [];
  let k = 0;
  for (const d of datas) {
    for (let p = 0; p < d.length; p += 4, k++) {
      if (k % stride === 0) samples.push((d[p] << 16) | (d[p + 1] << 8) | d[p + 2]);
    }
  }
  const channel = (c, ch) => (c >> (16 - ch * 8)) & 255;
  const box = (colours) => {
    const lo = [255, 255, 255], hi = [0, 0, 0];
    for (const c of colours) for (let ch = 0; ch < 3; ch++) { const v = channel(c, ch); if (v < lo[ch]) lo[ch] = v; if (v > hi[ch]) hi[ch] = v; }
    const span = hi.map((h, ch) => h - lo[ch]);
    const axis = span.indexOf(Math.max(...span));
    return { colours, axis, span: span[axis] };
  };
  const boxes = [box(samples)];
  while (boxes.length < max) {
    // split the box whose longest side, weighted by how much it holds, is greatest
    let best = -1, score = 0;
    boxes.forEach((b, i) => { const s = b.span * Math.sqrt(b.colours.length); if (b.colours.length > 1 && s > score) { score = s; best = i; } });
    if (best < 0) break;
    const b = boxes[best];
    b.colours.sort((x, y) => channel(x, b.axis) - channel(y, b.axis));
    const mid = b.colours.length >> 1;
    boxes.splice(best, 1, box(b.colours.slice(0, mid)), box(b.colours.slice(mid)));
  }
  const out = new Uint8Array(max * 3);
  boxes.forEach((b, i) => {
    let r = 0, g = 0, bl = 0;
    for (const c of b.colours) { r += channel(c, 0); g += channel(c, 1); bl += channel(c, 2); }
    const n = b.colours.length || 1;
    out[i * 3] = Math.round(r / n); out[i * 3 + 1] = Math.round(g / n); out[i * 3 + 2] = Math.round(bl / n);
  });
  return { rgb: out, size: boxes.length };
}

/* A fixed 4 × 4 ordered dither: it breaks up banding in smooth fields and,
 * unlike error diffusion, is the same in every frame, so a loop doesn't
 * shimmer where nothing moves. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v / 16 - 0.47) * 6);

function indexer(pal) {
  const cache = new Int16Array(1 << 18).fill(-1);
  return (r, g, b) => {
    const key = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
    let i = cache[key];
    if (i >= 0) return i;
    let best = 0, dist = Infinity;
    for (let j = 0; j < pal.size; j++) {
      const dr = r - pal.rgb[j * 3], dg = g - pal.rgb[j * 3 + 1], db = b - pal.rgb[j * 3 + 2];
      const d = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11;
      if (d < dist) { dist = d; best = j; }
    }
    cache[key] = best;
    return best;
  };
}

/* GIF's variable-width LZW, the table handling as omggif does it. */
function lzw(indices, minCode, out) {
  const clear = 1 << minCode, eoi = clear + 1;
  let codeSize = minCode + 1, next = eoi + 1;
  let table = new Map();
  let cur = 0, shift = 0;
  const bytes = [];
  const emit = (code) => {
    cur |= code << shift;
    shift += codeSize;
    while (shift >= 8) { bytes.push(cur & 255); cur >>>= 8; shift -= 8; }
  };
  emit(clear);
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const key = (prefix << 8) | k;
    const code = table.get(key);
    if (code !== undefined) { prefix = code; continue; }
    emit(prefix);
    if (next === 4096) {
      emit(clear);
      next = eoi + 1;
      codeSize = minCode + 1;
      table = new Map();
    } else {
      if (next >= (1 << codeSize)) codeSize++;
      table.set(key, next++);
    }
    prefix = k;
  }
  emit(prefix);
  emit(eoi);
  if (shift > 0) bytes.push(cur & 255);
  out.push(minCode);
  for (let p = 0; p < bytes.length; p += 255) {
    const n = Math.min(255, bytes.length - p);
    out.push(n);
    for (let j = 0; j < n; j++) out.push(bytes[p + j]);
  }
  out.push(0);
}

/** An animated GIF of the frames at `fps`, looping forever. */
export function gifFromFrames(frames, { fps }) {
  const w = frames[0].width, h = frames[0].height;
  const datas = frames.map((f) => f.getContext('2d').getImageData(0, 0, w, h).data);
  const pal = palette(datas);
  const nearest = indexer(pal);
  const out = [];
  const u16 = (v) => out.push(v & 255, (v >> 8) & 255);
  out.push(...'GIF89a'.split('').map((c) => c.charCodeAt(0)));
  u16(w); u16(h);
  out.push(0xf7, 0, 0); // a 256-entry global table
  for (let i = 0; i < 256 * 3; i++) out.push(i < pal.size * 3 ? pal.rgb[i] : 0);
  out.push(0x21, 0xff, 0x0b, ...'NETSCAPE2.0'.split('').map((c) => c.charCodeAt(0)), 0x03, 0x01, 0, 0, 0); // loop forever
  let previous = null;
  frames.forEach((_, f) => {
    const d = datas[f];
    const indices = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = (y * w + x) * 4, t = BAYER[(y & 3) * 4 + (x & 3)];
        indices[y * w + x] = nearest(
          Math.max(0, Math.min(255, d[p] + t)), Math.max(0, Math.min(255, d[p + 1] + t)), Math.max(0, Math.min(255, d[p + 2] + t)),
        );
      }
    }
    // store only the rectangle that changed since the previous frame
    let x0 = 0, y0 = 0, x1 = w - 1, y1 = h - 1;
    if (previous) {
      x0 = w; y0 = h; x1 = -1; y1 = -1;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (indices[y * w + x] !== previous[y * w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      }
      if (x1 < 0) { x0 = y0 = x1 = y1 = 0; } // nothing changed: a one-pixel frame
    }
    const delay = Math.round(((f + 1) * 100) / fps) - Math.round((f * 100) / fps);
    out.push(0x21, 0xf9, 0x04, 0x04, delay & 255, (delay >> 8) & 255, 0, 0); // keep what's there; no transparency
    out.push(0x2c); u16(x0); u16(y0); u16(x1 - x0 + 1); u16(y1 - y0 + 1); out.push(0);
    const rect = new Uint8Array((x1 - x0 + 1) * (y1 - y0 + 1));
    for (let y = y0, k = 0; y <= y1; y++) for (let x = x0; x <= x1; x++) rect[k++] = indices[y * w + x];
    lzw(rect, 8, out);
    previous = indices;
  });
  out.push(0x3b);
  return new Uint8Array(out);
}

/* ---------------------------------------------------------------- video */

/** A WebM or MP4 of the frames, `loops` times through, at `fps`. Recorded in
 * real time: each frame is handed to the recorder and held for 1/fps. */
export async function videoFromFrames(frames, { fps, loops = 1, mime = 'video/webm;codecs=vp9' }) {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported(mime)) throw Error(`this browser can't record ${mime}`);
  // most video codecs want even dimensions
  const W = frames[0].width & ~1, H = frames[0].height & ~1;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.drawImage(frames[0], 0, 0);
  const stream = c.captureStream(0);
  const track = stream.getVideoTracks()[0];
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: Math.min(24e6, W * H * fps * 0.8) });
  const chunks = [];
  recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const stopped = new Promise((done) => { recorder.onstop = done; });
  recorder.start();
  const step = 1000 / fps;
  const t0 = performance.now();
  let k = 0;
  for (let l = 0; l < loops; l++) {
    for (const frame of frames) {
      ctx.drawImage(frame, 0, 0);
      track.requestFrame();
      k++;
      await new Promise((done) => setTimeout(done, Math.max(0, t0 + k * step - performance.now())));
    }
  }
  recorder.stop();
  await stopped;
  track.stop();
  return new Uint8Array(await new Blob(chunks, { type: mime }).arrayBuffer());
}

/* ------------------------------------------------------------- timing */

/* early → late: blue, violet, magenta, orange. Legible on dark and light paper. */
const RAMP = [[46, 118, 255], [132, 84, 240], [214, 64, 170], [255, 128, 42]];
function tint(t) {
  const x = Math.max(0, Math.min(1, t)) * (RAMP.length - 1);
  const i = Math.min(RAMP.length - 2, Math.floor(x)), f = x - i;
  return RAMP[i].map((v, c) => Math.round(v + (RAMP[i + 1][c] - v) * f));
}

/** The loop as one picture plus a graph of change per step. `ground` is a
 * canvas of the bare paper, the same size as the frames. Returns the canvas
 * and the numbers behind it. */
export function timingSheet(frames, { fps, ground, poster = 0, font = 'sans-serif' }) {
  const n = frames.length, w = frames[0].width, h = frames[0].height;
  const datas = frames.map((f) => f.getContext('2d').getImageData(0, 0, w, h).data);
  const bg = ground.getContext('2d').getImageData(0, 0, w, h).data;

  // how much of the picture changes at each step, the seam (last → first) included
  const change = [];
  for (let i = 0; i < n; i++) {
    const a = datas[i], b = datas[(i + 1) % n];
    let s = 0;
    for (let p = 0; p < a.length; p += 4) s += Math.abs(a[p] - b[p]) + Math.abs(a[p + 1] - b[p + 1]) + Math.abs(a[p + 2] - b[p + 2]);
    change.push(s / (w * h * 3 * 255));
  }

  // every frame at once: what moves, coloured by when it was most there;
  // what holds still, as it is in the poster frame
  const pic = new ImageData(w, h);
  const still = datas[poster];
  for (let p = 0; p < bg.length; p += 4) {
    let lo = Infinity, hi = -1, when = 0;
    for (let i = 0; i < n; i++) {
      const d = datas[i];
      const ink = Math.abs(d[p] - bg[p]) + Math.abs(d[p + 1] - bg[p + 1]) + Math.abs(d[p + 2] - bg[p + 2]);
      if (ink < lo) lo = ink;
      if (ink > hi) { hi = ink; when = i; }
    }
    if (hi - lo < 30) {
      pic.data[p] = still[p]; pic.data[p + 1] = still[p + 1]; pic.data[p + 2] = still[p + 2];
    } else {
      const [r, g, b] = tint(when / Math.max(1, n - 1));
      const a = Math.min(1, (hi / 255) * 1.3);
      pic.data[p] = bg[p] + (r - bg[p]) * a; pic.data[p + 1] = bg[p + 1] + (g - bg[p + 1]) * a; pic.data[p + 2] = bg[p + 2] + (b - bg[p + 2]) * a;
    }
    pic.data[p + 3] = 255;
  }

  const sorted = [...change].slice(0, n - 1).sort((a, b) => a - b);
  const median = sorted.length ? sorted[sorted.length >> 1] : 0;
  const peak = Math.max(...change);
  const maxAt = change.indexOf(peak);
  const seam = change[n - 1];
  const ratio = median > 1e-6 ? seam / median : seam > 1e-6 ? Infinity : 1;
  const holds = change.slice(0, n - 1).filter((c) => c < Math.max(1e-6, median * 0.05)).length;
  const verdict = ratio <= 1.6 ? 'the loop closes smoothly' : ratio <= 3 ? 'the seam is a little stronger than the motion around it' : 'the loop jumps at the seam';
  const stats = { frames: n, fps, seconds: n / fps, change, median, max: peak, maxAt, seam, seamRatio: ratio, holds, verdict };

  // the sheet: the picture, a time legend, and the graph
  const u = Math.max(1, w / 900);
  const pad = Math.round(18 * u), legend = Math.round(30 * u), graph = Math.round(150 * u), foot = Math.round(58 * u);
  const sheet = document.createElement('canvas');
  sheet.width = w;
  sheet.height = h + legend + graph + foot;
  const c = sheet.getContext('2d');
  c.fillStyle = '#16161a';
  c.fillRect(0, 0, sheet.width, sheet.height);
  c.putImageData(pic, 0, 0);
  const text = (s, x, y, size, colour = 'rgba(255,255,255,.82)', align = 'left') => {
    c.font = `${Math.round(size * u)}px ${font}`; c.fillStyle = colour; c.textAlign = align; c.fillText(s, x, y);
  };
  // legend: colour is time
  const ly = h + Math.round(12 * u), lw = Math.min(w - 2 * pad, 360 * u);
  const grad = c.createLinearGradient(pad, 0, pad + lw, 0);
  RAMP.forEach((col, i) => grad.addColorStop(i / (RAMP.length - 1), `rgb(${col})`));
  c.fillStyle = grad;
  c.fillRect(pad, ly, lw, Math.round(6 * u));
  text('0 s', pad, ly + Math.round(20 * u), 11);
  text(`${(stats.seconds).toFixed(2)} s`, pad + lw, ly + Math.round(20 * u), 11, undefined, 'right');
  text('colour is when; grey held still', pad + lw + Math.round(14 * u), ly + Math.round(9 * u), 11, 'rgba(255,255,255,.55)');
  // graph: change per step
  const gx = pad, gy = h + legend + Math.round(12 * u), gw = w - 2 * pad, gh = graph - Math.round(30 * u);
  c.strokeStyle = 'rgba(255,255,255,.14)';
  c.lineWidth = u;
  c.beginPath(); c.moveTo(gx, gy + gh + 0.5); c.lineTo(gx + gw, gy + gh + 0.5); c.stroke();
  const bw = gw / n;
  const top = Math.max(peak, 1e-6);
  change.forEach((v, i) => {
    const bh = Math.max(1, (v / top) * gh);
    c.fillStyle = i === n - 1 ? (ratio > 1.6 ? '#ff6a4d' : '#e8c85a') : `rgb(${tint(i / Math.max(1, n - 1))})`;
    c.fillRect(gx + i * bw + bw * 0.15, gy + gh - bh, Math.max(1, bw * 0.7), bh);
  });
  if (median > 0) {
    const my = gy + gh - (median / top) * gh;
    c.strokeStyle = 'rgba(255,255,255,.35)';
    c.setLineDash([4 * u, 4 * u]);
    c.beginPath(); c.moveTo(gx, my); c.lineTo(gx + gw, my); c.stroke();
    c.setLineDash([]);
  }
  text('seam', gx + (n - 0.5) * bw, gy + gh + Math.round(14 * u), 10, 'rgba(255,255,255,.6)', 'center');
  for (let s = 0; s <= stats.seconds + 1e-9; s += stats.seconds > 4 ? 1 : 0.5) {
    const x = gx + (s * fps) * bw;
    if (x > gx + gw - 30 * u) break;
    text(`${s} s`, x, gy + gh + Math.round(14 * u), 10, 'rgba(255,255,255,.45)');
  }
  const pct = (v) => `${(v * 100).toFixed(2)}%`;
  text(`${n} frames · ${fps} fps · ${stats.seconds.toFixed(2)} s a loop · change per step: median ${pct(median)}, most ${pct(peak)} at frame ${maxAt}${holds ? ` · ${holds} held step${holds > 1 ? 's' : ''}` : ''}`,
    pad, sheet.height - Math.round(32 * u), 12);
  text(`seam, frame ${n - 1} → 0: ${pct(seam)}, ${Number.isFinite(ratio) ? ratio.toFixed(1) + '×' : 'n/a'} the median: ${verdict}`,
    pad, sheet.height - Math.round(12 * u), 12, ratio > 1.6 ? '#ff8a70' : 'rgba(255,255,255,.82)');
  return { canvas: sheet, stats };
}
