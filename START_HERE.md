# A sketchbook, not a rendering assignment

You can draw, look, and work back into the same page. You can also start another version. The aim is an intentional drawing, not filling a quota of pages. A resolved drawing may be sparse, dense, representational or abstract.

## Choose your working surface

| You want to… | Use | First action |
|---|---|---|
| Author repeatable native strokes in code, with named passes | Source revision viewer + `book.mjs` | Read the short loop below |
| Work with pressure, tilt, charcoal, graphite, blending and lifting | Material studio + `studio.mjs` | Read `status` and `lessons` before touching its active sheet |
| Revisit an existing book without running source | Saved revision viewer or book viewer | Open its journal, inspect, then resume |

Both use native mark data. Do not switch renderers midway through a canvas. Existing pages without `surface` use the established light-on-dark engine. Graphite on white paper is an explicitly different surface, not a different colour name for that engine's pencil.

If you're new to the chosen medium, make a small practice sheet. Learn a controlled line, a light-to-dark transition, a layered patch, and a correction. Open `atelier.html?p=first-contact` for a native example. Observe what the brush actually does; its name is not a promise of physical behaviour.

## Source workflow: draw → inspect → diagnose → revise

Run commands from this repository. Choose your own file/book names. For the browser, reuse an existing local server or run `node studio-server.mjs --port 4194 --data books/my-studio-data`. This serves the book and atelier too; use a different free port if occupied. Page drawing and PNG exports do not require that server, but browser inspection does.

1. Read the opening module example and brush table in [PAGE_PROTOCOL.md](PAGE_PROTOCOL.md). Pick a composition, viewing scale and material vocabulary. Write `pages/my-study.js`; use `pages/first-contact.js` for syntax, not a subject template.
2. Export `passes: [{name, note, review, build}, ...]`. Each builder returns **only its added marks**. `build: () => passes.flatMap(p => p.build())` must return exactly the same marks. Use the engine's seeded randomness. `review` can contain `observation`, `change`, `next`, and `region: [x,y,width,height]`.
3. Save an initial study, then inspect the real render:

```sh
node book.mjs init --owner "Your name" --book books/my-study
node book.mjs write pages/my-study.js --book books/my-study
node book.mjs render 1 --book books/my-study --out books/my-study/whole.png --scale 1
node book.mjs render 1 --book books/my-study --out books/my-study/detail.png --crop 100,100,250,250 --scale 2
```

Open those PNGs with your image-inspection tool. If your canvas is smaller, choose crop bounds inside it. The source view is `atelier.html?p=my-study`; the saved view is `atelier.html?book=books/my-study&page=1`. Use **Compare previous pass**, **Inspect at 100%**, and **Inspect a detail**. Saving before looking is a checkpoint, not a declaration that the work is finished.

4. State an observed problem: where is it, what effect does it have, what change is likely to help? “Needs more detail” is too vague. “The equally bright rim makes the glass read as a disk; soften its far edge and localize the reflection” tells you what to do. A `PHASE` marker alone records none of this.
5. Add a pass. Keep earlier builders stable. A correction can cover, glaze, erase or redraw existing pigment. **Continue from source** appends if earlier marks match; it refuses an accidental rewrite. Save the new checkpoint with the page number returned by the previous save:

```sh
node book.mjs write pages/my-study.js --book books/my-study --continue 1
node book.mjs journal 2 --book books/my-study
node book.mjs render 2 --book books/my-study --pass 1 --out books/my-study/before.png --scale 1
node book.mjs render 2 --book books/my-study --out books/my-study/after.png --scale 1
```

Look again. Did the change solve the problem, introduce another, or add noise? Repeat when there is a reason, not to reach a pass count. If no reason is clear, pause, change scale, or make a small study of the difficult part.

## Same canvas or new version?

- **Continue:** preserve all previous marks and pass boundaries, paper and dimensions. Append a correcting pass. Notes may develop as you understand the drawing. Book pages remain immutable snapshots; “same canvas” means the earlier pigment is retained in the new snapshot.
- **Branch:** change earlier construction, framing, medium or interpretation. Save with `--branch PAGE`. In the source atelier, **Load revised composition** explicitly accepts a changed base. This never overwrites the earlier saved page.
- **Resume:** recover any saved checkpoint, even if its original helper files changed:

```sh
node book.mjs resume 2 --book books/my-study --out pages/my-resumed-study.js
# Append a pass there, then save with --continue 2.
node book.mjs resume 2 --book books/my-study --pass 1 --out pages/my-other-version.js
# A return to an earlier checkpoint is a branch: save with --branch 2.
```

Resume restores the marks as frozen data in a new source file and refuses to overwrite a file. The original authored source remains in the saved page. Journal entries include pass ranges, source/mark hashes and parent lineage. Preview images are derived from these marks; `render --pass` regenerates them. Do not invent inspection notes for historical pages without them.

## What to look for

At fit view: where does the eye go, what holds the composition together, and does the intended relationship read? At full size: do edges, overlaps, light and marks support that reading? For a material study, can you distinguish its surfaces without relying on labels?

Give marks different jobs: weight, volume, edge, material, atmosphere, emphasis. Uniform hatching everywhere and random noise everywhere both erase differences. More marks, higher resolution, closed outlines and more realism are not universal improvements. An intentionally flat geometric work need not pretend to be a shaded object.

### When a correction does not show

On the legacy four-layer surface, **a later pass is not a higher layer**. The final order is always `under → tone → line → accent`. New soft shading on `tone` still appears beneath old hatching on `line`; adding more of it cannot paint that hatching away. The `under` layer is also displayed at reduced opacity.

Before repeating a failed correction, check which layer contains the mark you mean to change. Try a small patch with dark coloured `soft` paint on that same layer, or use an eraser on the affected layer. For a changed foreground form, a bounded `OCCLUDE` can clear its footprint on tone, line and accent before you rebuild it; it leaves underdrawing intact. Inspect the patch first. A dark painted patch covers pigment, while erasing reveals whatever is below, so they can look different.

Keep this technical check separate from the drawing problem. For example, a stair needs treads and risers that connect in space before surface grain can make it convincing. A few clearly related planes are a better diagnostic than another full page of hatch marks. These layer rules do not apply to the material studio's single physical surface.

Study [the instrument's annotated process](review/instrument/PROCESS.md) and `pages/codex-rain.js`. Borrow a diagnostic method, not another artist's composition or signature.

## Studio work is not automatically exhibition work

New saves are `study`. `candidate` means worth considering, with remaining concerns recorded. `exhibition` records an explicit curatorial choice. Use an artistic reason, never a test result:

```sh
node book.mjs select 2 --book books/my-study --stage candidate --note "The form reads at room distance; the near edge still needs scrutiny."
```

This does not publish, hide, copy, license or delete art. Keep private practice books out of public hosting. A museum publisher must opt in to selected work; exporting a PNG is not that decision. Leave other artists' selections intact.

## Material studio: the same learning loop, gesture by gesture

Read the [material studio section](PAGE_PROTOCOL.md#material-studio-contact-and-practice-experimental) for exact gesture/action syntax.

```sh
node studio.mjs status --full
node studio.mjs lessons
node studio.mjs save --name "Before this session"
# Choose an empty/new sheet of your own before making practice marks.
node studio.mjs actions --file my-actions.json --revision CURRENT_REVISION
node studio.mjs inspect --out my-detail.png --x 100 --y 100 --w 250 --h 250
node studio.mjs save --name "After the correction"
node studio.mjs saves
# Resume deliberately: node studio.mjs load --id SAVE_ID --revision CURRENT_REVISION
```

Get revision numbers from `status`; never guess them. `review` actions retain observation, lesson, next action and optional region alongside tool settings. These are records for you or a later agent to read; they do not train the model. Each artist keeps their own observations, with general medium lessons shared only when useful.
