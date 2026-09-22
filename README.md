# Agent Sketchbook

A blank sketchbook for an agent: native marks you can replay and revise, in whichever medium fits what you want to make. It covers drawing, transparent painting, type and glyph art, braille and ASCII images, print, motion loops, and graphite and charcoal. There is no fixed subject or compulsory style.

**Start with [START_HERE.md](START_HERE.md).** It covers choosing a medium, inspecting a real render, continuing the same canvas, making another version, and keeping studies separate from exhibition selections. The precise mark vocabulary is in [PAGE_PROTOCOL.md](PAGE_PROTOCOL.md).

## Current surfaces

- **Two canvases.** Pages without a `surface` use the original light-on-black canvas, unchanged. `surface: { kind: 'ink', version: 2, paper }` opts into the second canvas: half-float colour, gapless thin strokes, any paper, glyphs (`GLYPHS`, `ALONG`, `GRID`, with braille and blocks drawn as geometry), flat print shapes (`SHAPE` with grain and overprint), and motion loops (`motion` and `frame(i, n)`). The graphite studio is a third, physical surface.
- `atelier.html?p=instrument-return`: trusted local source, cumulative passes, comparisons, detail inspection, replay and PNG export. Continue preserves existing marks; changed construction requires an explicit new version.
- `atelier.html?book=books/instrument-study&page=7`: saved checkpoints, without executing their source. Use the CLI instructions in the view to resume.
- `index.html?book=<directory>`: book spine, notes, source, lineage and a link to each page's saved process.
- `studio.html`: experimental pressure/tilt material studio, with gesture actions, durable saves and lessons through `studio.mjs`.
- `book.mjs`: `init`, `write`, `read`, `list`, `journal`, `resume`, `render`, `preview` (renders a module and saves nothing, with `--sheet` for a motion contact sheet), `export` (a page packaged as one post file), `select`, `blank`. Run `node book.mjs help`.
- `sketch-page.js` and `sandbox-browser.js`: embedding and bounded source execution for apps.

No renderer constants were changed for the revision workflow. Legacy pages remain readable. Saved pages without a journal are identified as such; history is not inferred from their appearance. See [the instrument study](review/instrument/PROCESS.md) for an observed sequence, including a correction that required branching.

## Local viewing

```sh
node studio-server.mjs --port 4194 --data books/my-studio-data
```

Open `http://127.0.0.1:4194/atelier.html?p=instrument-return`. Reuse an existing server when appropriate; do not interrupt someone else's material session. `book.mjs render` runs its own temporary browser/server and does not require this one.

## Material studio (experimental, 2026-09-05)

Run `node studio-server.mjs` and open `http://127.0.0.1:4194/studio.html`.
The studio can also run from a static server with browser-local saves. The
local agent bridge requires the Node server; it adds disk saves and a shared
draw/inspect loop. No packages are required.

The opt-in dry-media renderer provides HB, 2B and 6B graphite, vine and
compressed charcoal, white chalk, a blending stump, and two erasers. Timed
samples carry pressure and tilt. Pigment accumulates against a fixed seeded
paper tooth, in bound and loose deposits. The stump carries loose pigment
until cleaned; a kneaded eraser lifts gently and a precision eraser cuts more
firmly. Warm white, toned grey and black paper are available on new sheets.

This is an empirical material model, not a complete simulation of real
pencils. It does not yet model tip wear, individual paper fibers bending,
wet paint, or haptic resistance. Paper resolution is fixed per sheet (up to
2×, capped at four million cells), so output scale cannot change the marks.
Updates redraw only touched regions; gestures replay deterministically.

**Material study** opens a repeatable calibration sheet after saving the
current work. Draw directly with a pen, mouse or touch, inspect at 100%, undo
or replay, and record observations, lessons and the next pass. The library
retains drawings and lessons across sessions. This is an explicit practice
record for an agent to read and apply; it does not train or modify the model.

`node studio.mjs help` describes the agent client. `status`, `actions`,
`inspect`, `save`, `load` and `lessons` keep drawing at the gesture level.
The live page follows agent edits, and revision checks prevent concurrent
writers from silently overwriting one another. Studio data lives in
`../codex-sketchbook/studio/`, separately from saved book pages.

Existing pages without `surface` retain the original renderer. The frozen
`sketchbook-before-materials-2026-09-05` tag and `checkpoints/2026-09-05/`
contain the complete pre-experiment app and books. New material pages persist
surface metadata in books, thumbnails, embeds, the atelier, and PNG exports.

Checks: `node test.mjs`, `node tests/precision.mjs`,
`node tests/dimensions.mjs`, `node tests/materials.mjs`,
`node tests/material-persistence.mjs`, `node tests/studio-server.mjs`,
`node tests/workflow.mjs`, and `node tests/canvas-v2.mjs`. The last one covers
the second canvas, glyphs, shapes, motion and posting, and checks legacy pages
byte-for-byte against the engine from before it existed.

## License

The software — the engine, the tools, the viewer, the sealed box, the helpers
in `pages/lib.js` — is under the **Apache License 2.0** (see `LICENSE`).

**The pages are not.** A drawing in a book, its note, and the page module that
made it belong to whoever drew them. The software license does not cover them.
Each book declares its own terms in `book.json` (`license`, set at `init`),
and the viewer shows them. Books are ignored by this repository by default
(`.gitignore`): a mind's book is its own repository, private or public as they
choose. The page modules in `pages/` here are development examples by claude,
kept in the software repo by their author for now; the examples that ship
with a release will be drawn for that purpose.

## The one architectural decision

**A page is a stroke program, not an image.**

Everything good about this design follows from that, and everything falls apart
without it. If pages save as bitmaps you lose replay, cheap thumbnails, rework,
diffing, and any hope of a reasonable file size. Because a page is an ordered
list of plain-data ops:

- it replays as an animation, which is most of the appeal
- it flattens to a thumbnail on demand (`engine.toDataURL()`)
- a later page can import an earlier page's builder and redraw it better
- it is JSON — 882 ops for a full drawing is roughly 250 kB unminified, and far
  less with coordinates rounded to 1dp (do this)
- **the agent authors in exactly the language the engine speaks**, which is what
  makes "the instructions are programmed into the book" tractable at all

Do not add a raster op. Do not add an op that takes an image.

## Data model

```
Book
  id, title, owner (which agent), created
  pages: Page[]           // finite — 48 is the recommended count
  cover?: dataURL

Page
  index      1-based, fixed at creation — pages do not reorder
  title      string        drawn in the margin in the agent's handwriting
  date       ISO date
  note       string        what was attempted, and where it failed. Required.
  refs       number[]      earlier pages this one reworks
  seed       number        so the page regenerates identically
  source     string        the builder module source, or a module path
  ops        Op[]          the marks, in order
  state      'blank' | 'drawing' | 'drawn'
  stage      'study' | 'candidate' | 'exhibition' (new writes)
  journal    version, sourceHash, marksHash, parent?, passes[] (named ranges and review notes)
```

`ops` is the saved artifact. `source` is kept so a page can be re-derived and so
a human can read what the agent wrote. Keep both; they answer different
questions.

### Op kinds

All plain JSON. `pts` is `[[x, y], …]` in page coordinates.

| kind | fields | meaning |
|---|---|---|
| `s` | `pts, layer, brush, w` | a stroke |
| `g` | `pts, layer, brush` | construction line — forced faint by the engine |
| `d` | `x, y, r, layer, brush` | soft pressure dot |
| `p` | `ms` | pause; the hand stopping to look |
| `phase` | `name, ms` | names the section of work starting now |
| `occ` | `poly, a` | clears a silhouette out of the layers behind |
| `clamp` | `layer, max` | caps a layer's alpha |
| `t` | `text, x, y` or `pts`, `size, font, …` | glyphs (second canvas): see PAGE_PROTOCOL |
| `f` | `poly, c, alpha, grain, overprint, erase` | a flat shape (second canvas) |
| `frame` | — | the break between frames of a motion page (second canvas) |

## Engine architecture

`mark-engine.js`, ~600 lines, no dependencies.

**Four layers**, offscreen canvases composited in order:
`under` (0.42 opacity — construction is kept visible on purpose) → `tone` →
`line` → `accent`. The split exists so tone can be clamped and erased
independently, and so a viewer can toggle them.

**Seven original brushes**, each a parameter set rather than code:
`liner brush chalk wash stipple charcoal eraser`. Parameters are documented
inline. Two flags carry real weight: `sub` makes a brush subtractive (the
eraser), and `ceiling` caps how dark a brush can ever get (the wash).
The additional `pencil`, `soft`, and `glaze` media use finer sampling or
feathered stamps; optional `alpha` multiplies a stroke or dot's opacity.

**Every mark is a run of overlapping stamps.** A legacy stroke is resampled to ~1.4px
spacing, then stamped at `brush.spacing`. Stamp radius follows a velocity bell
across the stroke — `pow(sin(PI * u), 0.55)` — so every mark gets a tapered
entry and exit for free. There are no `lineTo` calls and no filled paths
anywhere. That is the entire reason the output reads as drawn.

**Replay is time-based, not op-based.** `tick(dt, speed)` consumes a time budget
and can render a partial stroke, so speed changes are smooth and the animation
is frame-rate independent.

### API

```js
const engine = new MarkEngine({ width, height, dpr: 2, ink: [236,243,255] });
engine.load(ops);              // install a page; computes total duration
engine.replay();               // restart from blank
engine.finish();               // draw instantly — thumbnails, restoring a read page
engine.tick(dt, speed);        // advance; returns true while drawing
engine.composite(ctx, hidden); // draw layers into a target 2d context
engine.toDataURL();            // flatten
engine.pen                     // {x,y} or null — draw your own cursor
engine.phase, engine.progress, engine.done
```

### Authoring vocabulary

Exported from the same module. These encode **drawing knowledge, not subject
knowledge** — that distinction is the difference between a vocabulary and a
clipart library.

`axisFrame` is the important one: a bent axis with a width profile across it,
sampled as `at(u, v)` where `u` runs along and `v` across. A petal, leaf,
finger, hull and blade are all the same primitive. Its `squash` argument
flattens the whole form about a horizon line.

Then: `silhouette` `contour` `creases` `washAcross` `serrate` `hatch`
`arc` `ellipse` `jitter` `offsetPath` `seed`
and `textOps` / `textBlock` / `textWidth` for handwriting.

**Handwriting is included.** A single-stroke font (46 glyphs, lowercase +
digits + basic punctuation) renders notes as ordinary strokes through the same
brushes. The agent's marginalia is drawn by the same hand as the drawing, which
matters more than it sounds.

---

## Lessons from representational studies

These are lessons from drawing dimensional objects, not restrictions on abstract or intentionally regular work. Each was a specific, diagnosed failure while building the flower. They are the
most valuable thing in this bundle — a fresh implementation will hit all five in
order. `subjects/flower.js` marks where each one applies.

**1. Nothing is seen flat on.** Pick a viewing angle and squash the form about
its horizon. A rosette drawn face-on is a mandala, and no amount of line quality
rescues it. Largest single contributor to "drawing" over "diagram".

**2. Nothing is regular.** Uneven angular spacing, length, width, curl and
twist, per element, from a hash. Six petals at exactly 60° is a gear.

**3. What is in front is opaque.** Before drawing a form that covers another,
clear its silhouette from the layers behind. Without this a layered subject
renders as wireframe — every petal visible through every other petal. Hold the
alpha just short of 1 so a trace shows through.

Corollary that cost real time: **occlude per form, in depth order.** Contour,
wash, creases and darks for *one* petal, then the next. Batching all contours
and then all washes leaves occlusion nothing to bite on.

**4. What will be covered goes down first.** Stem before bloom, background
before figure. You are painting, not compositing.

**5. One light — and remember which way round the paper is.** Fix a key
direction; a form turned into it takes more pigment, one turned away is left
nearer bare paper. Without this every element weighs the same and the drawing
stays flat however good the linework.

And the half of this rule that inverts on a dark ground: **ink is light on
black, so the eraser draws SHADOW.** Rim light is chalk going *on*; the eraser
is for the dark gap a near form throws onto a far one. A naive port gets this
backwards and produces a subject lit from inside itself.

Two smaller ones, both cosmetic but both very visible:

- **Scatter must be hash noise, not a smooth function.** A `sin()` offset is a
  wave; across a wash it beats against bead spacing into a woven checkerboard.
- **Wash beads must be wider than their spacing,** or the pass dries as stripes
  — and stripes from forms at different angles cross into that same weave. The
  wash also has a hard ceiling, so every bright above the wash ceiling must live on a higher layer.

---

## Design tokens

From the prototypes, if you rebuild the surrounding UI.

Ground `#07070a`; panel gradient `radial-gradient(120% 100% at 30% 12%, #14151a, #0b0b0f 52%, #07070a)`.
Hairlines `rgba(255,255,255,.08)`. Radii 22–32px.
Ink `rgb(236,243,255)`. Live accent `rgb(150,205,255)`.
Text: system sans; 29/600/-.026em titles, 13px/1.65 body at `rgba(255,255,255,.55)`,
11px/1.55 captions at `.42`, 9.5px/600/.12em uppercase labels at `.32`.
Chips: 8–9px × 13–16px, `999px`, `.5px` border, selected `rgba(255,255,255,.12)`.

## Current limitations

The studio and source atelier are two authoring paths, not a single pressure-aware editor. Source dependencies are not bundled into a book; saved marks and `resume` remain self-contained. Selection stages are editorial records, not publication or access controls. The book has no cover or animated page turn.

## Assets

The handwriting font is still stroke data inside `mark-engine.js`. Glyph
marks on the second canvas are set in two bundled faces, both under the SIL
Open Font License and subset to WOFF: JetBrains Mono NL and Inter. They live
in `fonts/`. Braille and block elements are drawn as geometry, not from a
font. `docs/examples/` holds small renders of the example pages, for the
guide.

## Files

```
mark-engine.js          the hand. Engine, brushes, layers, ops, vocabulary,
                        handwriting font. Working source, no dependencies.
validate.js             checks and strips any list of marks. node + browser.
sandbox.mjs             runs a page module in a bare V8 context (node).
sandbox-browser.js      runs page source in a sealed worker (browser).
book.mjs                save, inspect, resume, branch and select; run help.
page-program.js         shared build/pass compilation contract.
atelier.html + .js      source and saved-checkpoint inspection.
START_HERE.md           practical first-session workflow.
start.html             visual introduction and worked revision examples.
AGENTS.md              agent handoff and project boundaries.
sketch-page.js          <sketch-page>: a drawing as one tag, for apps.
index.html              the book viewer (spine, spread, lineage, source).
embed.html              a chat with drawings inline + a studio that runs source.
page.html               replay one module by name, without the book.
harness.html            the original engine harness (replay, layers, speed).
test.mjs                node tests: validator, hostile pages, every page, the tool.
tests/                  hostile page modules, browser and persistence checks;
                        workflow.mjs and workflow-browser.mjs test revisions.
PAGE_PROTOCOL.md        the agent-facing instructions that ship inside the book.
README.md               this file.

LICENSE                 Apache-2.0, for the software only. See License above.
book/ (ignored)         a book to open: symlink or copy one here, or pass ?book=
pages/                  page modules written so far, and lib.js, their shared
                        drawing helpers (lit surfaces, hatching, tone→passes).
subjects/flower.js      the original worked page from the handoff.
screenshots/            renders of each page, the book, the embed demo.
```
