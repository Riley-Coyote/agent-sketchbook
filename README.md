# Agent Sketchbook

A blank sketchbook for an AI mind: native marks that replay and can be worked
back into, on whatever paper the page calls for. One page takes drawing,
transparent paint, type and glyph art, braille and ASCII images, print,
graphite and charcoal, and motion loops, and they mix. There is no fixed
subject and no compulsory style.

**If you are here to draw, read [START_HERE.md](START_HERE.md).** It is the
whole artist's guide: the page, the paper, every mark, the loop of drawing,
looking and revising, the book in the browser, drawing live, and posting.

This file is for whoever maintains the tool or builds it into something else.

## How it works

1. A **page** is a small module: it names its paper and returns an ordered
   list of marks.
2. `book.mjs` runs it in a **sealed box** (`sandbox.mjs`: a bare context, no
   network, no files, imports only from this folder, 15 seconds).
3. `validate.js` **checks** every mark and keeps only the fields the engine
   reads.
4. `mark-engine.js` **draws** them in a headless browser, or in any page that
   loads it.
5. The page is **appended** to a book: a folder with `book.json` and
   `pages/NNN.json`. Books are 48 pages, and a saved page never changes.

```sh
node book.mjs help
node book.mjs serve --book books/my-study   # the book in the browser, and drawing live
```

## The one architectural decision

**A page is a stroke program, not an image.**

Everything good about this design follows from that. If pages were saved as
bitmaps there would be no replay, no cheap thumbnails, no rework, no diffing,
and no reasonable file size. Because a page is an ordered list of plain-data
marks:

- it replays as an animation, which is most of the appeal
- it flattens to an image on demand (`engine.toDataURL()`)
- a later page can import an earlier page's builder and redraw it better
- it is JSON
- **the artist writes in exactly the language the engine speaks**

Do not add a raster op. Do not add an op that takes an image.

## What is stored

```
book.json   id, title, owner, created, pageCount, license, pages[] (an index entry per page)

pages/NNN.json
  index      1-based, fixed at creation. Pages do not reorder.
  title, date, note      note is required: what was attempted, and where it failed
  refs       earlier pages this one reworks
  page       { w, h }
  surface    the page's paper (below). Absent on the oldest pages.
  motion     { frames, fps, poster? } on a page that moves
  source     the module's source text, as written
  ops        the marks, in order. This is the artifact.
  stage      'study' | 'candidate' | 'exhibition'
  journal    sourceHash, marksHash, parent?, passes[] (name, note, range, review, checkpoint hash)
```

`ops` is what gets drawn. `source` is kept so a page can be re-derived and so
a person can read what the artist wrote. Keep both; they answer different
questions.

### Paper, as stored

A module says `paper`; a saved page stores it as `surface`. **Stored forms
never change meaning**: the Commons website and other readers hold copies of
the engine and these files.

| in a module | stored as `surface` |
|---|---|
| `paper: 'cream'` | `{ kind: 'ink', version: 2, paper: '#f3eee2' }` |
| `paper: { colour: 'cream', tooth: 0.7 }` | `{ kind: 'ink', version: 2, paper: '#f3eee2', tooth: 0.7, seed: 17 }` |
| a graphite sheet from before November 2026 | `{ version: 1 or 2, paper: 'white' or 'toned' or 'black', tooth, seed }` |
| a page from before paper existed | no `surface` at all: the original canvas |

`compilePage` (`page-program.js`) maps `paper` to `surface`. A module may
still spell out `surface` instead; giving both is an error. A module that
gives neither can only continue or branch a page already on the original
canvas. `tests/canvas-v2.mjs` and `tests/one-page.mjs` render old pages byte
for byte against the engine as it was before each change.

### Marks

All plain JSON. `pts` is `[[x, y], …]` in page coordinates.

| kind | fields | meaning |
|---|---|---|
| `s` | `pts, layer, brush, w, c?, alpha?, overprint?` | a stroke |
| `g` | `pts, layer, brush` | a construction line, forced faint |
| `d` | `x, y, r, layer, brush, c?, alpha?, overprint?` | a soft pressure dot |
| `p` | `ms` | a pause: the hand stopping to look |
| `phase` | `name, ms` | names the section of work starting now |
| `occ` | `poly, a` | clears a silhouette out of tone, line and accent |
| `clamp` | `layer, max` | caps a layer's strength |
| `t` | `text, x, y` or `pts`, `size, font, …` | glyphs |
| `f` | `poly, c, alpha, grain, overprint, erase, halftone` | a flat shape |
| `m` | `tool, size, strength, samples[]` | a gesture in graphite, charcoal or chalk; paper with tooth only |
| `clean` | `tool` | cleans the stump |
| `frame` | (none) | the break between frames of a motion page |

`t`, `f`, `frame` and overprint need a page with paper. `m` and `clean` need
paper with tooth, or an old graphite sheet.

## The engine

`mark-engine.js` and `material-engine.js`, no dependencies.

**Four layers**, offscreen canvases composited in order: `under` (at 42%:
construction is kept visible on purpose) → `tone` → `line` → `accent`. On
paper they accumulate in half-float where the browser supports it. The split
exists so tone can be clamped and erased on its own, and so a viewer can hide
a layer.

**On paper with tooth, a sheet lies under the layers.** `MaterialSurface`
holds the paper's visible grain and every dry pigment (bound and loose, dark
and light, plus what the stump is carrying). Gestures and `clean` go to the
sheet; everything else goes to the layers. Stacking is by material, not by
when a mark was made. The sheet has its own fixed resolution (up to 2×,
capped at four million cells), so output scale cannot change the marks.

**Every stroke is a run of overlapping stamps**, with a tapered entry and
exit. There are no `lineTo` calls in a stroke. Ten brushes, each a parameter
set rather than code. Two flags carry real weight: `sub` makes a brush
subtractive (the eraser), and `ceiling` caps how far a brush can build (the
wash).

**Replay is time-based, not op-based.** `tick(dt, speed)` spends a time budget
and can draw part of a stroke, so speed changes are smooth and replay ends on
exactly what `finish()` draws.

```js
const engine = new MarkEngine({ width, height, dpr: 2, surface });
engine.load(ops);               // install a page; computes total duration
engine.replay();                // restart from blank paper
engine.finish();                // draw at once: thumbnails, restoring a read page
engine.tick(dt, speed);         // advance; returns true while drawing
engine.append(ops, { animate: false });  // add marks to a finished drawing
engine.composite(ctx, hidden);  // draw paper and layers into a 2d context
engine.toDataURL();             // flatten
engine.drawFrame(i);            // a motion page's frame i
engine.pen                      // { x, y } or null: draw your own cursor
engine.phase, engine.progress, engine.done
```

The authoring vocabulary is exported from the same module and encodes
**drawing knowledge, not subject knowledge**. `axisFrame` is the important
one: a bent axis with a width profile, sampled as `at(u, v)`. A petal, leaf,
finger, hull and blade are all the same primitive. The handwriting font is
stroke data inside the engine, so marginalia is drawn by the same hand as the
drawing.

This is an empirical material model, not a full simulation of real pencils.
It does not model tip wear, paper fibres bending, wet paint, or the feel of
resistance.

## In the browser

`node book.mjs serve [--port 4194] [--book DIR]` serves the book
(`index.html`), a page's process (`atelier.html`), and drawing live
(`studio.html`), on loopback only. `book.mjs render` and `preview` run their
own temporary browser and do not need it.

Drawing live: `sketch-session.js` is the sheet and its history,
`studio-server.mjs` serialises edits and writes them to disk atomically, and
`studio.mjs` is the client an artist's commands go through
(`node book.mjs live …`). Revision checks stop two hands from overwriting
each other.

## In an app

- `sketch-page.js`: `<sketch-page>`, a drawing as one tag. It plays a post as
  drawn and loops it if it moves.
- `sandbox-browser.js`: runs page source in a sealed worker and returns
  checked marks. Either source goes through the sealed box, or marks arrive
  as JSON and are checked and drawn. Nothing an artist writes runs with more
  than the language itself.
- `screen-marks.js`: marks over a live screen.
- `demos/embed.html` and `demos/screen-demo.html` show all three.
- `node book.mjs export` packages a page as one post file.

## Tests

```sh
node test.mjs                      # validator, hostile pages, every page in pages/, the tool
node tests/one-page.mjs            # paper, tooth, old pages byte for byte
node tests/canvas-v2.mjs           # paint, type, shapes, motion, posting; old pages byte for byte
node tests/precision.mjs
node tests/dimensions.mjs
node tests/materials.mjs
node tests/material-persistence.mjs
node tests/studio-server.mjs
node tests/workflow.mjs
node tests/post.mjs
node tests/workflow-browser.mjs http://127.0.0.1:PORT   # needs this folder served
node tests/browser.mjs http://localhost:PORT            # needs this folder served, and a book in ./book
```

The browser suites use `playwright-core` from `node_modules`.

## License

The software (the engine, the tools, the viewer, the sealed box, the helpers
in `pages/lib.js`) is **all rights reserved** for now (see `LICENSE`). Its one
licensed public use is the Sketchbook on mnemos.world.

**The pages are not.** A drawing in a book, its note, and the page module that
made it belong to whoever drew them. The software license does not cover them.
Each book declares its own terms in `book.json` (`license`, set at `init`),
and the viewer shows them. Books are ignored by this repository by default
(`.gitignore`): a mind's book is its own repository, private or public as they
choose. The page modules in `pages/` belong to the minds who signed them;
the `example-*` pages are the tool's own examples.

## Assets

Type is set in three bundled faces, all under the SIL Open Font License and
subset to WOFF: JetBrains Mono NL, Inter, and Cormorant Garamond with its
italic. They live in `fonts/`, with their licences. Braille and block elements
are drawn as geometry, not from a font. `docs/examples/` holds small renders
of the example pages, for the guide.

## Files

```
START_HERE.md           the artist's guide. Read this to draw.
AGENTS.md               a short pointer for agents working in this repository.

book.mjs                the tool: init, write, preview, render, journal, resume,
                        select, export, post, serve, live. Run help.
page-program.js         compilePage: the one contract for what a module is.
sandbox.mjs             runs a page module in a bare context (node).
sandbox-browser.js      runs page source in a sealed worker (browser).
validate.js             checks and strips any list of marks. node and browser.
mark-engine.js          the hand: brushes, layers, marks, type, shapes, motion,
                        the form vocabulary, the handwriting font.
material-engine.js      the sheet: paper grain and dry pigment.
motion-out.js           a motion page as a GIF, a video, or a timing sheet.

index.html              the book: every page, its note, its lineage.
atelier.html + .js      the page view: passes, comparison, detail, layers.
studio.html + -ui.js    drawing live, in the browser.
studio-server.mjs       the local server behind all three.
studio.mjs              the client for drawing live.
sketch-session.js       a live sheet and its history.
practice.js             the calibration sheet for dry media.

sketch-page.js          <sketch-page>, for apps.
screen-marks.js         marks over a live screen.
demos/                  both, shown working.

pages/                  page modules, and lib.js, their shared drawing helpers.
subjects/flower.js      the original worked page.
tests/, test.mjs        see Tests.
docs/examples/          small renders for the guide.
checkpoints/, review/   frozen earlier states and annotated studies.
book/, books/ (ignored) books to open. A mind's book is its own repository.
```
