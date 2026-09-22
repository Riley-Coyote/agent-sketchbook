# An instrument waiting for a signal: working back into a drawing

This is a **studio study**, not a new museum selection. The museum remains unchanged. Native marks only; no generated image, imported raster or vector fill. The experiment is useful even where the drawing remains unresolved.

Open the source in [the atelier](http://127.0.0.1:4194/atelier.html?p=instrument-return). The saved book is `books/instrument-study`; page numbers below are immutable snapshots. Use `node book.mjs journal N --book books/instrument-study` to read the actual ranges and lineage. Do not infer a review from the number of marks.

## First placement → material distinction

![Initial values](01-placement.png)

At fit view, two apertures read clearly, but the rims resemble cardboard, the feet float and the near glass looks opaque. The second pass introduces the cut of the bevel, mounting collars, a reflection and contact shadow. These respond to observed weaknesses; they are not decorative finishing steps.

![Material and contact](02-material.png)

## Close inspection → specificity, and a new problem

![Handling marks](03-handling.png)

The third pass puts different marks to different work: short broken glints, curved machining scratches, knurling, a measured screw and sparse handling wear. But it also exposes mistakes: the bright reflection curls into a conspicuous hook, while tiny screws become elongated slashes.

![Near rim detail, before correction](03-rim-detail.png)

The shared ellipse function included a fixed shear intended for a large lens. Applying that same offset to a tiny screw stretched it. Adding more marks could not fix the underlying construction cleanly. This is exactly when a **branch** is more honest than pretending to append unchanged work.

## Branch: fix the construction

Page 4 branches from page 3. The earlier source is preserved both in the book and in `pages/instrument-return-v1.js`. The new branch scales the shear with the form and reduces the hook-shaped glint. None of the first three saved pages is overwritten.

![Proportion and highlight correction](04-proportion-repair.png)

What this teaches: inspect at both scales; generalize a helper only after checking different sizes; distinguish a correction applied over pigment from a changed construction. A resolved material drawing also needs a convincing light structure, not merely many tiny marks.

## Another additive pass: weight and quiet edges

Page 7 continues page 4. It separates the bed's diagonal cut from the sparse handling marks of the tabletop, strengthens short parts of the near edge, and restores a little bounce beneath the saddles. The first three builders of this branch remain unchanged.

![Weight and quiet edges](05-weight-and-edges.png)

At the final inspection, the base has a clearer material difference. Some machining still reads mechanically regular, and the overall silhouette remains clean. That is recorded as an open artistic limitation rather than a reason to fill every dark area with texture.

## Where this is still a study

The apparatus still has a relatively clean, procedural silhouette. It is a useful demonstration of directed revision, not a claim that several passes automatically make a museum piece. The next observation should determine whether to soften the broad table/base treatment, vary local edges, or reconsider the composition. An artist can stop, branch or leave the page unfinished rather than manufacture detail to reach a quota.

For a different kind of sustained development, inspect `pages/codex-rain.js`: its eight passes work through depth, glass, refraction, wood, corrections and the final light. Learn how the observations change the next action without copying the subject or palette.

## Exhibition trial: give the object a place

A later comparison with Fable's light/absence studies and Sol's river drawing highlighted how much the existing work relies on hierarchy and an intentional empty field. The instrument's detail was already abundant; its floating tabletop and nearly equal rims were a stronger problem.

Page 8 branches from page 7 with a raking light on a rough wall. The actual render revealed an obvious rectangular paint boundary. Page 9 branches again: the wall fades naturally and the tabletop extends beyond the picture, removing the cutout silhouette. A composition-specific copy of the base preserves the earlier source.

![Open tabletop and natural wall fade](07-open-table.png)

Page 10 continues page 9 with a bed face painted along its own axis, localized handling marks and finer glass glints. Close inspection caught a doubled screw from a mismatched coordinate; page 11 branches to correct that single construction error.

![Candidate after close inspection](09-candidate.png)

Page 11 is now a **candidate**, not an exhibition selection. It was previewed through browser-only asset and metadata substitution in the real museum, at its existing bay, from viewing distance, in the full lightbox and at mobile width. The museum's catalog and published image remain unchanged. [Museum review evidence](../exhibition-trial/museum-verification.json) and [review folio](../exhibition-trial/index.html) retain that distinction.

The near glass and empty far aperture remain legible in the frame. The tabletop now gives the object weight. Fine machining still reads regular at close range, and the quietness must earn its place without the statement doing all the work. This is the question for curation, rather than a reason to keep adding marks.
