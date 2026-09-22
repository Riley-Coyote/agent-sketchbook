> New to the book? Read [START_HERE.md](START_HERE.md) first. This is the detailed mark contract.

# Page protocol — what ships inside the book

This is the document a mind reads once, when it is handed a sketchbook and has
to produce its next page. Everything in it is about *how to draw*, never *what
to draw* — the book has no subject.

---

## You have been given a sketchbook

It has 48 pages. It is yours. Nobody will grade it.

You draw in it by writing a **page module**: a function that returns an ordered
list of marks. You do not get to draw pixels, and you cannot draw a clean line —
the book has a hand of its own, and everything you write goes through it. Your
job is to decide what goes down, in what order, with what weight.

A page is data. It is saved, so tomorrow you can turn back to it, see what you
did, and draw it again better on a later page.

## The shape of a page

```js
import { OP, DOT, PAUSE, PHASE, OCCLUDE, CLAMP, jitter, seed, arc,
         axisFrame, silhouette, contour, creases, washAcross, textOps } from '../mark-engine.js';

export default {
  title: 'six attempts at a hand',
  date: '2026-09-01',
  note: 'Wanted the knuckles to read without drawing every crease. Third one '
      + 'from the left is the only one that works. The others are too even.',
  refs: [4],            // earlier pages this one reworks (optional)
  page: { w: 1600, h: 1000 }, // optional; defaults to 880 × 660
  build: () => [ /* ops, in the order the hand should make them */ ],
};
```

- `build` is **synchronous and pure**: it takes nothing, touches nothing, and
  returns an array of marks. It runs in a sealed box — no screen, no network,
  no files, no clock you can rely on — with a time limit of 15 seconds.
- **Points are `[x, y]` pairs, and a path or polygon is an array of them:**
  `[[x, y], [x, y], …]`. Every `pts` and `poly` below takes that form.
- The default page is **880 × 660**, origin top-left, y down. A module can
  declare `page: { w, h }` with positive integer dimensions up to 4096 per side
  and 8,000,000 logical pixels total. The book and viewers preserve the aspect
  ratio. On the original canvas the paper is black and the ink is light; the
  second canvas takes any paper (see below). A mark may wander up to 400 px
  off the page; further is refused.
- Default-page limits: 20,000 marks, 600,000 points in all. Larger-area pages
  allow 120,000 marks and 2,000,000 points. Every stroke still has at most
  4,000 points. Use `limitsForPage(page)` when validating a custom canvas.
- `title`, `date` and `note` are written in the margin in your own handwriting.
  **The note is not optional and it is not a caption.** Say what you were
  trying and where it failed. A sketchbook full of successes is a portfolio,
  and a portfolio is a much less interesting object.
- You may import the engine, the helpers in `pages/lib.js`, and **any earlier
  page** — importing page 3's builder and changing one thing is how you rework
  it. Nothing else can be imported. Anything random must come from `seed()` so
  the page redraws identically.

## What you can draw with

The original seven brushes keep their character and rendering. Three additional
media support finer, more realistic work while still painting overlapping stamps.

| brush | what it is |
|---|---|
| `liner` | a hairline. edges, veins, handwriting. thin even at weight 1 |
| `brush` | the smooth bright. width follows speed, so it swells mid-stroke |
| `chalk` | dry media: it breaks up at speed, so long strokes come out grainy. the last sparkle, not the body of a tone |
| `wash` | the floor of every tone. wide, faint, and it has a **ceiling** — it cannot get brighter than 40% no matter how much you lay down |
| `stipple` | scattered dots along a path. ground, pollen, texture |
| `charcoal` | an angled dark-ish stamp. throat of a flower, the base of a form |
| `eraser` | takes ink away. on black paper that means it **draws shadow** |
| `pencil` | fine, dense, continuous stamps; a minimum radius of 0.075 logical px for precise edges and material texture |
| `soft` | feathered strokes for smooth local shading and painting over earlier marks |
| `glaze` | broad, faint, feathered strokes for translucent colour and tonal integration |

Strokes and dots accept an optional RGB colour and opacity multiplier:
`OP('s', pts, 'line', 'soft', weight, [r,g,b], alpha)` and
`DOT(x, y, radius, 'accent', 'soft', [r,g,b], alpha)`. RGB channels are integer
0–255; alpha is 0–1. Omit both to retain the old light ink and brush opacity.
Coloured paint can cover old pigment; an eraser instead removes it. A glaze is
not the old wash and does not inherit its ceiling.

Four layers, composited in this order:

| layer | what it is for |
|---|---|
| `under` | construction. shown at 42% on purpose, never hidden |
| `tone` | wash. capped at the wash ceiling **only when the page adds `CLAMP('tone', BRUSHES.wash.ceiling)`**, usually once near the end. Nothing clamps it for you. |
| `line` | edges, creases, handwriting |
| `accent` | everything above the clamp: brush, chalk, highlights. **the brights live here** |

Marks:

| op | what it is |
|---|---|
| `OP('s', pts, layer, brush, w)` | a stroke. `w` multiplies the brush's width (0.1–6) |
| `OP('g', pts, 'under', brush)` | a construction line, forced faint |
| `DOT(x, y, r, layer, brush)` | a soft pressure dot |
| `PAUSE(ms)` | stopping to look |
| `PHASE(name)` | naming the section of work you are starting |
| `OCCLUDE(poly, a)` | clearing what a form covers, on tone, line and accent |
| `CLAMP(layer, max)` | capping a layer's tone — `CLAMP('tone', BRUSHES.wash.ceiling)` once, near the end |

Forms, from the engine:

| helper | what it gives you |
|---|---|
| `axisFrame(cx, cy, ang, L, W, curl, twist, squash, horizonY)` | a bent axis with a width profile — petal, leaf, finger, hull, blade. `f.at(u, v)`: u along, v across (±1 = edge) |
| `silhouette(frame, grow)` | that form's outline, for `OCCLUDE` |
| `contour(frame, layer, brush, wob, {w})` | its two edges, deliberately unequal |
| `creases(frame, wob, n, layer, brush)` | folds fanning from the base |
| `washAcross(frame, wob, rows, layer, brush, weight)` | tone in beads across the axis |
| `serrate(frame, sign, wob, layer, brush)` | a toothed edge |
| `hatch(x0, y0, x1, y1, ang, gap, layer, brush, wob)` | straight parallel tone in a box |
| `textOps(text, x, y, size, layer, brush, wob, weight)` | handwriting. **`size` is the letter height in px** — 18 for a title, 11–12 for a caption |
| `textBlock(text, x, y, size, maxW, lineH, …)` | wrapped handwriting |
| `arc` `ellipse` `jitter` `offsetPath` `seed` | geometry: exact arguments in the reference below |

And from the studio (`pages/lib.js`), drawing knowledge that earlier pages
found the hard way:

| helper | what it gives you |
|---|---|
| `passesFor(lum, {gain})` | a brightness 0–1 → the wash/brush/chalk passes that build it. use it instead of guessing weights |
| `sphereRings(cx, cy, r, L, wob, {bounce, ambient, gain})` | a sphere shaded as rings around the light |
| `sphereMeridians(…)` | cross-hatch on its lit side |
| `hatchPoly(poly, ang, gap, wob, passes, skip, salt)` | hatching clipped to any polygon; `skip(pt)` for cast shadows |
| `shadeParam(sample, uN, vN, L, wob, opts)` | shade any surface `sample(u, v) → {p, n}` with strokes along u; `opts.lamp` for a placed light, `opts.modulate` for local darkening |
| `tube(A, B, r0, r1, ry, hint)` `ellipsoid(C, ax, ay, az, la, lb, lc)` `sphere(C, r, axis)` | surfaces for `shadeParam` |
| `hull(pts)` | the outline of a straight form's visible samples, for `OCCLUDE` |
| `castOnPlane(p, O, n, L)` | where a point's shadow lands on a table |
| `highlight(x, y, r)` | a specular, as chalk dots |

There is no `drawFlower` and no `drawHand`. There is a frame with a width
profile, and a flower is what you get when you point nineteen of them outward.
If you find yourself wanting a subject helper, you want a page module instead.

## Lessons from representational studies

These diagnose unwanted flatness when drawing dimensional subjects. They are
not validation rules: symmetry, flatness, repetition and multiple light sources
can all be intentional artistic choices. Each lesson came from a specific study.

**1. Nothing is seen flat on.** Pick a viewing angle and squash the form about
its horizon. A rosette drawn face-on is a mandala; a palm shaded in rings
around the viewer's eye is a bullseye. `axisFrame`'s `squash` exists for this
and is the largest single difference between "drawing" and "diagram".

**2. Nothing is regular.** Uneven spacing, uneven length, uneven curl, per
element, from `seed()`. Six petals at exactly 60° apart is a gear. Joints the
same size as the fingers are a robot.

**3. What is in front is opaque.** Before you draw a form that covers another,
`OCCLUDE` its silhouette — and only the *visible* part of it, or you will wipe
the table beyond the form. Do it *per form*, in depth order: contour, wash,
dark for one petal, then the next. Batching all contours and then all washes
leaves occlusion nothing to bite on.

**4. What will be covered goes down first.** Stem before bloom. Table before
hand. Background before figure. You are painting, not compositing.

**5. One light, and remember which way round the paper is.** Fix a key
direction and let every form take its tone from it — a form turned into the
light takes more pigment, one turned away is left nearer the bare paper. Ink
here is *light on black*, so the eraser draws **shadow**, not highlight: rim
light is chalk going on, the eraser is for the gap a near form throws onto a
far one, the crease at a knuckle, the edge of a nail.

## Tone, on black paper

Page 2 of the first book was a sphere and a cube drawn four times to learn
these. They are worth more than the brushes.

- **The wash floods.** It reaches its ceiling within a few overlapping strokes,
  so you cannot build a gradient by laying more of it. **Width is the gradient**:
  thin wash where it is dark, wide where it is light. `passesFor` does this.
- **The brights are not on the tone layer.** `tone` is clamped at the end;
  anything that must read brighter than the wash ceiling goes on `accent`.
- **A stroke thins to about half its width at both ends** — the hand slows
  there. Space your strokes for the ends, not the middle, or a tone dries as
  corduroy.
- **Chalk is grainy by nature.** Long chalk strokes break up; that is its
  character. Smooth brightness is `brush`; chalk is the last sparkle.
- **Shadow is unpainted paper.** The eraser is far too hard to make a soft
  shadow. Leave the wash out of a cast shadow; let the bounce back in with a
  thin one.
- **Rings around the light are rings of one value.** Shade a rounded form as
  rings around the axis that points at the light, and each ring needs one
  weight. Close the rings, or their seams line up into a bare ray.
- **A placed lamp beats a direction.** Light that falls off across the subject
  is what stops every finger from being lit the same.
- **Wash beads must be wider than their spacing**, or the pass dries as
  stripes, and stripes from forms at different angles cross into a weave.

## How to use the book well

- **One subject per spread.** Notes and lineage on the left, the drawing on the
  right.
- **Say what failed.** In the note, in the margin, on the page.
- **Rework earlier pages.** The most valuable page in a sketchbook is page 30
  attacking what page 4 got wrong. Import its builder, change the thing the
  note complained about, and save with `refs: [4]`. The book shows the lineage
  both ways.
- **Leave pages unfinished.** Abandoning something at the construction stage
  is a legitimate page.
- **Use the underdrawing.** It stays visible at 42% on purpose. Do not hide it.
- **Do not draw the same subject as the last three pages** unless you are
  explicitly working a problem.
- **Practise the thing you're about to need.** If tone is what the piece
  needs, a sphere on a table will tell you whether you can control it. For
  type it's a line of glyphs at three sizes, for print two overlapping pulls,
  for motion an eight-frame loop. It's a study, not a required first page.

## Putting a page in the book

### Working repeatedly into one canvas

The local trusted-source atelier is `atelier.html?p=your-module`. In addition to
the normal `build`, export `passes: [{ name, note, build }, ...]`. Each pass
returns only its added marks; the page's `build` concatenates all passes. The
example `pages/codex-rain.js` demonstrates eight inspected passes.

1. Build the first pass, inspect it at fit and full size, and record a specific
   visual diagnosis in its note.
2. Add another pass. **Continue from source** checks the entire candidate before
   changing the painting. When the old marks remain an exact prefix, it appends
   the additions onto the retained pigment; unchanged source does not repaint.
3. Cover, glaze, erase, and redraw where necessary. Keep earlier pass builders
   stable so the history records what was actually seen.
4. Pass buttons show cumulative checkpoints. **Replay this pass** starts with
   the earlier passes already complete. Export captures the selected checkpoint.
5. Save checkpoints through `book.mjs write` throughout the work, initially as a study.
   Use `--continue PAGE` for retained earlier marks or `--branch PAGE` for changed
   construction. The book remains append-only; see `START_HERE.md` for resuming.
6. Saved `journal.passes` retain each name, note, start/end op range, optional
   review (`observation`, `change`, `next`, `region: [x,y,w,h]`) and checkpoint hash.
   `build()` must exactly equal the concatenated builders. A pass label is not
   proof of inspection. Legacy pages without passes remain valid.

The atelier imports local modules directly, like `page.html`. Use it for your own
trusted drawing source; use the sealed sandbox for source from other people.
The engine API is `engine.append(ops, { animate: false })`, called after the
current drawing is finished. It preserves existing pigment and resample caches.

### Saving

From a shell, in the agent-sketchbook repository root (use `--book books/YOUR_BOOK` to choose storage):

```bash
node book.mjs write pages/your-page.js --refs 3
node book.mjs list
node book.mjs read 3 --source
```

Your module runs in the sealed box, its marks are checked, and the page is
appended with the next number. It cannot be reordered or overwritten. A book
that is full is full. New saves default to `study`; `select` records a separate
curatorial decision without publishing the page. Selection events live in the
book index, while the saved page preserves its original checkpoint metadata.

In an app, one of two things happens: your **source** is handed to the same
sealed box in the browser and the marks come back checked, or you hand over
**marks** directly — a JSON array of the ops above — and they are checked and
drawn. Either way nothing you write runs with more than the language itself.

## What not to do

- Use the precision media when their control helps the subject. Marks still
  pass through the engine's stamps, taper, and grain; there is no raster import.
- On the first canvas, do not try to fill a shape. A filled shape is visible
  at once as not-drawn, and there is no op for it. The second canvas has
  `SHAPE` for work that is meant to be flat; use it as a medium, not as a
  shortcut past the hand.
- On the first canvas, do not write a page that is only handwriting. On the
  second, type is a medium of its own: a page of glyphs is a page.
- Do not produce a page you cannot say anything about in the note.
- Do not reach outside the box. It will not let you, and the attempt is the
  only thing that gets recorded.
## The second canvas: paper and precise colour

Declare `surface: { kind: 'ink', version: 2, paper }` to draw on the second
canvas. `paper` is `night` (the original dark ground, the default), `black`,
`white`, `cream`, `grey`, `slate`, `kraft`, or any `#rrggbb`. Every brush, op
and helper above works the same way. Only four things change:

- **Colour is precise.** Layers accumulate in half-float where the browser
  supports it. On the first canvas, many faint strokes drift in 8-bit
  rounding: sixty strokes of slate glaze land nearly pure blue, a stacked wash
  snaps into hue-shifted stripes, and soft brushes weave a fine dither
  lattice. Here they land on the colour you asked for.
- **Thin strokes stay lines.** Stamps are spaced by their own size, so a
  weight-0.2 eraser or liner no longer beads into dots or vanishes. Opacity
  per unit of length is compensated, so each brush keeps its character.
- **The paper is part of the page.** It is painted under the layers in every
  viewer and export. On light paper the default ink is a cool near-black; the
  eraser reveals the paper, whatever its colour.
- **Replay ends on the finished drawing.** The animation places exactly the
  stamps that `finish()` does.

Pages without a surface render exactly as they always have; the tests compare
them byte-for-byte against the engine from before this canvas existed.

### Transparent paint: coats that mix like pigment

Ordinary strokes mix like light. A later stroke covers what is under it in
proportion to its opacity, so blue laid over yellow stays blue, and a colour
laid again and again never gets darker than itself. Watercolour and glazes
work differently. Each layer of pigment filters the light through the ones
beneath it, so yellow under blue makes green, and every coat is darker than
the last. Pass `{ overprint: true }` as the last argument to `OP` or `DOT` to
paint that way:

```js
OP('s', pts, 'tone', 'glaze', 6, [242, 200, 20], 0.5, { overprint: true })
```

- **A coat is one wash.** Consecutive overprinted strokes of one colour on
  one layer build up together, like a wet wash. Then they multiply what was on
  the layer before. Any other mark, a `PAUSE` or a `PHASE` ends the coat. A
  sky laid with fifty strokes is one coat, and `PHASE('second coat')` between
  two runs of the same colour makes them two.
- **The first coat looks like ordinary paint.** Mixing starts with the second.
- **Coats mix within their layer.** They multiply what is on the same layer,
  and the layers still stack in order over the paper. Keep colours that should
  mix on one layer; `tone` is a good home. The paper doesn't tint a glaze. To
  paint on a coloured ground, lay the ground as a first coat.
- **Keep glazes light.** Coats multiply, so a few at alpha 0.3–0.6 go a long
  way. Six strong coats of one blue are nearly black.
- Erasers and construction lines can't overprint. Dots can, and each one is
  its own dab.
- In replay a coat shows as it is laid and settles when it ends. Replay still
  ends on exactly what `finish()` draws.

### Glyphs: type as a medium

The second canvas also takes text as marks. Use it for ASCII and braille
images, concrete poetry, calligrams and lettering, whenever the words are the
drawing. Three faces are bundled so a page renders the same everywhere:

- `mono`: JetBrains Mono, without ligatures. Cells, code, labels that count.
- `sans`: Inter, weights 100–900. Clean, modern, neutral.
- `serif`: Cormorant Garamond, weights 300–700. The literary voice: verse,
  letters, anything that should read like a book. Its range is Latin,
  curly quotes and dashes. It has no italic yet.

A page loads only the faces it uses. Glyphs are typed out one by one on
replay.

```js
import { GLYPHS, ALONG, GRID } from '../mark-engine.js';
GLYPHS('a line of text\nand another', x, y, { font: 'sans', size: 28, weight: 300 })
ALONG('words that turn as the path turns', pts, { size: 16, align: 'center' })
GRID(['┌──┐', '│⣿▚│', '└──┘'], x, y, { size: 12 })   // one mark per row
```

| option | meaning |
|---|---|
| `size` | glyph size in px (2–600, default 16) |
| `font` | `mono` (default), `sans` or `serif` |
| `weight` | `sans` 100–900, `serif` 300–700; `mono` has one weight |
| `c`, `alpha`, `layer` | as for strokes; text defaults to `line` |
| `rot` | turn the whole run, in radians |
| `track` | extra space between glyphs, in em (−0.5–4) |
| `align` | `left`, `center` or `right`: about `x` for a run, along the path for `ALONG` |
| `line` | line height in px for `\n` and `GRID` rows (default 1.25 × size) |
| `wob` | 0–1: the hand's unevenness, fixed per glyph |
| `erase` | cut the text out of whatever is on its layer |

`y` is the **baseline** of the first line, as in type. For `ALONG`, the path
is the baseline.

Monospace cells are exactly 0.6 × size wide and one line tall. **Braille
patterns (U+2800–28FF) and block elements (U+2580–259F) are drawn as geometry**
(dots and cells snapped to the pixel grid), so a braille image or a block
gradient tiles with no seams at any alpha. Text on a path runs on past the
path's end along its last direction rather than piling up.

### Shapes: print and cut paper

`SHAPE(poly, [r,g,b], { alpha, grain, overprint, erase, layer })` lays a
flat shape. It is for work that is *meant* to be flat: screen and riso
prints, cut paper, fields of colour.

- `grain` (0–1) knocks a fixed speckle out of the ink, as a pull does. The
  speckle is anchored to the page, so overlapping shapes share it.
- `overprint` multiplies the ink with what is already on its layer, as a
  second riso colour does over the first: yellow over cyan prints green.
- `erase` cuts the shape out instead.
- To misregister, offset one colour's shapes a few pixels.

Shapes default to the `tone` layer.

### Motion: a loop of frames

A page on the second canvas can move. Instead of `build`, give it `motion`
and `frame(i, n)`, which returns the marks of frame `i` of `n`:

```js
export default {
  title, date, note, page: { w: 600, h: 400 },
  surface: { kind: 'ink', version: 2, paper: 'night' },
  motion: { frames: 24, fps: 12 },          // 2–96 frames, 1–30 fps
  frame: (i, n) => [ /* the marks of this frame */ ],
};
```

Every frame is drawn fresh, so anything can change from one to the next.
Use `i / n` as the phase of the loop, so the last frame hands back to the
first.

- **Frames count from 0 everywhere**, as `frame(i, n)` counts them: in
  `--frame`, on the contact sheet, and in `motion.poster`.
- **`motion.poster`** is the frame that stands for the page: in a plain
  `render`, in thumbnails, in `export --image`, and wherever the loop is
  paused. It defaults to 0, but the first frame is often the emptiest, so
  choose one: `motion: { frames: 40, fps: 12, poster: 37 }`.
- Viewers loop the frames and pause on a click. With reduced motion asked
  for, they wait on the poster frame. To watch a loop in the browser, open
  `page.html?p=my-loop`. The atelier shows a moving page as a still.
- A motion page has no passes. To revise one, save the new version as a
  branch of the old (`--branch PAGE`) and say in the note what changed.
- The book stores the frames as one list of marks with a `{ k: 'frame' }`
  between them. Frames × width × height is bounded at 24 million pixels.

You can't watch your own loop, so look at it in two ways that fit an image
tool:

- **The contact sheet** shows every frame in order, numbered from 0: *what*
  happens.
- **The timing sheet** shows *when*. Every frame is laid over one picture,
  and whatever moves is coloured by the moment it was there, blue early to
  orange late, while what holds still stays as it is. Under it is a graph of
  how much of the picture changes at each step, including the seam from the
  last frame back to the first. The command prints the same numbers, and a
  line of bars you can read without opening the image:

```sh
node book.mjs preview pages/my-loop.js --out books/my-loop/sheet.png --sheet
node book.mjs preview pages/my-loop.js --out books/my-loop/frame-7.png --frame 7 --scale 1
node book.mjs preview pages/my-loop.js --timing --out books/my-loop/timing.png
#   change per step: ▂▁▂▂▂▃▂▂▃▂▂▃▂▂▃▂▂▃▃▆▄▂▃▃▃▃▃▂▃▂▃▂▂▂▂▁▁▆█ | seam █
#   seam, frame 39 → 0: 0.15%, 5.3× the median: the loop jumps at the seam.
```

A seam that is much stronger than the steps around it means the loop jumps
when it wraps. That's a flaw if you meant it to be seamless, and a beat if
you didn't. A run of near-empty steps is a hold.

For people, a loop also renders as an **animated GIF** (one palette for the
whole loop, delays exact to 1/100 s, looping forever) or a **video**:

```sh
node book.mjs preview pages/my-loop.js --out books/my-loop/loop.gif
node book.mjs preview pages/my-loop.js --out books/my-loop/loop.webm --loops 3   # or .mp4
```

Video is recorded in real time, so frame timing is accurate to a few
milliseconds, and `--loops` defaults to at least three seconds of it. `render`
takes the same options for a saved page.

### Helper reference

Exact arguments for everything a page can import from `../mark-engine.js`.
Optional arguments show their defaults.

| helper | returns |
|---|---|
| `seed(a, b)` | a number in [0, 1), the same for the same `a, b`. All randomness comes from here |
| `arc(cx, cy, rx, ry, a0, a1, n = 24)` | `n + 1` points along an elliptical arc from angle `a0` to `a1` (radians) |
| `ellipse(cx, cy, rx, ry)` | a closed ring of points |
| `jitter(pts, amt)` | the points, wobbled by up to about `amt` px, deterministically |
| `offsetPath(pts, d)` | the path shifted `d` px to one side, for double lines and edges |
| `OP(kind, pts, layer, brush, w = 1, c, alpha, opts)` | a stroke (`'s'`) or construction line (`'g'`); `opts.overprint` lays a stroke as transparent paint (second canvas) |
| `DOT(x, y, r, layer, brush, c, alpha, opts)` | a soft dot; `opts.overprint` as for `OP` |
| `PAUSE(ms)` `PHASE(name, ms = 240)` `OCCLUDE(poly, a = 0.9)` `CLAMP(layer, max)` | timing, naming, clearing, capping |
| `textOps(text, x, y, size, layer = 'line', brush = 'liner', wob = 0.5, weight = 0.5, c, alpha)` | handwriting as strokes, in colour if `c` is given; `y` is the baseline |
| `textWidth(text, size)` | the width of a handwritten run, for layout |
| `textBlock(text, x, y, size, maxW, lineH, layer, brush, wob, weight, c, alpha)` | wrapped handwriting: `{ ops, lines, height }` |
| `GLYPHS(text, x, y, opts)` `ALONG(text, pts, opts)` `GRID(rows, x, y, opts)` | glyph marks, second canvas (above) |
| `SHAPE(poly, c, opts)` | a flat shape, second canvas (above) |
| `axisFrame` `silhouette` `contour` `creases` `washAcross` `serrate` `hatch` | the form vocabulary (the table near the top) |

`c` is always `[r, g, b]`, whole numbers 0–255. `alpha` is 0–1.

## Material studio: contact and practice (experimental)

The established white-on-black engine is unchanged for pages without a
`surface`. To use the new materials, declare a versioned surface beside
`page`, and return material gestures rather than legacy strokes:

```js
export default {
  title: 'Pressure study', date: '2026-09-05', note: 'What I tried and learned.',
  page: { w: 1100, h: 780 },
  surface: { version: 1, paper: 'white', tooth: .65, seed: 17 },
  build: () => [{
    k: 'm', tool: 'graphite-2b', size: 2.2, strength: 1,
    samples: [
      { x: 80, y: 100, p: .15, tiltX: 0, tiltY: 0, t: 0 },
      { x: 240, y: 100, p: .8, tiltX: 10, tiltY: 60, t: 800 },
    ],
  }],
};
```

`size` is contact diameter in logical pixels (.2–80); pressure `p` is 0–1,
tilt is degrees from upright on each axis (-90–90), and `t` is milliseconds
within the gesture (strictly increasing, 0–60000). Pressure changes both
contact width and deposition. Tilt sets the orientation and width of the
contact ellipse. Stationary samples are meaningful: a held point deposits
more than a passing point. Zero pressure leaves no pigment. There is no
automatic bell-shaped pressure curve or added wobble in material gestures.

Tools: `graphite-hb`, `graphite-2b`, `graphite-6b`, `vine-charcoal`,
`compressed-charcoal`, `white-chalk`, `stump`, `kneaded-eraser`,
`precision-eraser`. `strength` defaults to 1 and scales deposition/lifting.
Clean carried pigment with `{ k: 'clean', tool: 'stump' }`. A dirty stump can
mark clean paper; a clean stump cannot create pigment. A loaded stump also leaves a
blot where it lifts inside a dark area, as a real one does. Run it the whole
length of a form, lift where the light is, and clean it between strokes.

The paper's grain shows at light pressure. A hard press fills the tooth and
reads as smooth, almost airbrushed. For charcoal that looks like charcoal,
build tone in several light layers on a rough sheet (tooth .8 or more). The erasers remove
deposits from the sheet. All material gestures act on one physical sheet,
not independent layers. Legacy and material marks cannot be mixed on a page.
Pause and phase ops are supported in both renderers.

Paper is `white`, `toned`, or `black`; tooth is 0–1; seed is a uint32.
Paper stays fixed for the life of a sheet. Start a new sheet to change it.
The resolution of the material field is fixed independently of thumbnail or
export dimensions. Inspect crops at 2× to see its finest available detail.
Every sample is preserved in saved book pages without coordinate rounding.
Validation caps interpolation work as well as raw sample counts.

## Draw, look, learn, continue

Start `node studio-server.mjs`. Open the connected studio at
`http://127.0.0.1:4194/studio.html`. Agents use the same hand as direct pointer
input; no subject names, shapes, raster imports, or image prompts are motor
commands. First read `node studio.mjs status` and `node studio.mjs lessons`.

Send a JSON action array with `node studio.mjs actions --file actions.json`:

```json
[
  {"type":"select","tool":"graphite-2b","options":{"size":2.2}},
  {"type":"touch","sample":{"x":80,"y":100,"p":0.15,"t":0}},
  {"type":"move","samples":[{"x":240,"y":100,"p":0.8,"tiltY":60,"t":800}]},
  {"type":"lift"}
]
```

`touch`, `move`, and `lift` can span requests. Use `stroke` with a sample
array for a complete gesture. `clean`, `undo`, `redo` and `review` are also
actions. A batch is atomic: rejected input leaves the sheet untouched. For
concurrent work, include the last inspected revision in
`{"revision":N,"actions":[...]}`; never blindly retry a revision conflict.

Inspect the whole composition with `node studio.mjs inspect --out view.png`.
Then inspect a region with `--x 70 --y 80 --w 220 --h 80 --scale 2`. Each
result identifies its revision. Study the actual image before deciding the
next marks. Save a checkpoint with `node studio.mjs save --name "First pass"`.
Record a `review` action containing `observation`, `lesson`, `next`, and an
optional `{x,y,w,h}` region. These notes retain the mark count and tool settings
and remain in the library for later sessions; learning means reading and
applying these explicit lessons, not implicit model training.

The studio autosaves its active sheet and carries full gesture data in JSON.
New sheets and loaded drawings archive the previous sheet. PNG exports are
paper-inclusive. The HTTP bridge binds to loopback, checks origins, serializes
edits and writes disk state atomically. The browser shows remote edits while
preserving a local copy if an agent edits during a user's stroke.

The original page protocol above still applies to legacy pages.
