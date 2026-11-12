# Following a drawing from an app

An app can show a mind drawing while a person talks with it, and keep the
finished page. This page is the contract such an app (a *host*) can rely on,
and the one tool an agent draws through. Everything here is something the code
does; `tests/host-seam.mjs`, `tests/live-seam.mjs` and `tests/mcp.mjs` check
it, and `node examples/host-seam/run.mjs` shows it end to end.

The rule underneath: a host shows **marks**, never runs a page's **source**.
Source runs only in the book's sandbox (`sandbox.mjs`), when a page is
previewed or saved.

## A drawing, its id and its revision

A **drawing** is one picture as it grows, from its first mark to its last
saved page. Every page of the book belongs to exactly one, and so does every
live sheet (see *A live sheet*).

- A page saved with `--continue N` belongs to page N's drawing.
- Any other page starts a new drawing: a first page, a page with `--refs`, and
  a page saved with `--branch N`.
- A branch names where it came from: `parentDrawing` is
  `{ drawingId, revision, pageIndex }` of the page it branched from.

`drawingId` is the book's id and the number of the page the drawing started
on, joined by a colon: `sketchbook-anna-mwd8ecma:1`. A drawing begun on a live
sheet is named when the sheet opens, before it has a page, by the book's id
and the sheet's: `sketchbook-anna-mwd8ecma:live-1f2e3d4c`. Either way the id
never changes.

`revision` counts the drawing's completed passes, in order: its saves, and its
live sheet's checkpoints. A drawing that starts as a page is at revision 1;
each page that continues it is one more. One save is one revision however
many marks or passes it holds. Continuing an earlier page of a drawing (not
its newest) is still the drawing's next revision, so revisions never repeat.

New pages store `drawingId`, `revision` and, for a branch, `parentDrawing`,
both in `book.json` and in the page file. Pages saved before these fields
existed get theirs from the lineage their journal already records
(`journal.parent`), by the same rule, so older books read exactly as new ones
do and reading them writes nothing.

## The marks hash

`marksHash` is the SHA-256, written as lowercase hex, of the UTF-8 bytes of
the marks (`ops`) in this exact JSON form:

- object keys sorted by UTF-16 code unit, at every depth;
- no whitespace anywhere;
- strings and numbers written the way JavaScript's `JSON.stringify` writes
  them (shortest round-trip numbers, `-0` as `0`);
- arrays in their own order.

For marks, which hold only strings, finite numbers, arrays and plain objects,
this is the JSON Canonicalization Scheme (RFC 8785). The same marks give the
same hash whatever order their keys were kept in, and anything that writes
this form gets it: the example recomputes it with code of its own.
`[{"k":"p","ms":1}]` hashes to `sha256('[{"k":"p","ms":1}]')`.

A page's journal also carries a field called `marksHash`. That older hash
covers the marks in the order the book stores them, and is left as it was; it
is not this one.

## The snapshot: a drawing's latest state

```sh
node book.mjs snapshot --book DIR [--drawing ID] [--protocol sketchbook.drawing/1] [--inline-max BYTES] --json
```

With no `--drawing`, it is the drawing of the open live sheet when that sheet
holds a pass no page holds yet (or the book has no pages); otherwise the
drawing of the book's newest page. The answer:

| field | what it is |
| --- | --- |
| `protocol` | `sketchbook.drawing/1`. Ask for another with `--protocol` and the read is refused. |
| `bookId`, `drawingId`, `revision` | as above, for the drawing's latest completed pass |
| `state` | `saved`: that pass is a page in the book. `drawing`: it is a checkpoint of the drawing's open live sheet, newer than any page of it |
| `pageIndex` | the page that holds it; `null` while `drawing` |
| `parent` | for a drawing that began as a branch: `{ drawingId, revision, pageIndex }` |
| `page`, `paper`, `motion` | the page size, its stored paper (`null` for the original canvas), and a moving page's loop |
| `marks` | the marks, checked exactly as every viewer checks them |
| `marksFile`, `marksField` | instead of `marks` when they are larger than `--inline-max` bytes (default 1 MiB): the file, relative to the book, and the field that holds them (`ops` of the page file; `pass.ops` of `live/active.json` while `drawing`) |
| `marksBytes` | the size of the marks in the canonical form |
| `marksHash` | as above |
| `poster` | the poster's path relative to the book (`pages/002.png`), or `null` (always while `drawing`) |
| `reference` | the page reference below, identical to what the save returned; `null` while `drawing` |

A drawing whose live sheet is open but has completed no pass yet answers
plainly, with no half a pass: `state: "drawing"`, `revision: 0`,
`marks: null`, and a `message` saying a pass completes when the sheet is
checkpointed.

A snapshot only reads. No file in the book, its live folder included, is
created, changed or touched by it (the tests compare every file's size, time
and bytes before and after). Reading it again gives the same answer until the
drawing moves. An unknown drawing is refused, naming the drawings there are.

## Knowing that a pass completed

The notice that a pass completed is `{ drawingId, revision }` and nothing
more: *which drawing moved and how far*.

- **A save:** the new page's entry in `book.json` carries `drawingId` and
  `revision`.
- **A live pass:** the live server's session answer (`GET /api/session`) and
  the file it keeps the sheet in (`live/active.json`) carry
  `notice: { drawingId, revision }`. It changes only when a pass completes;
  gestures, batches of them and whole-sheet writes leave it as it was.

A host that sees a notice newer than what it last saw re-reads the snapshot;
it never builds the drawing from notices. So a missed notice, or a tab
reopened with no notices at all, ends the same way: one snapshot read, and the
host is current.

A host closing its preview stops watching. It does not stop, pause or change
the drawing: the tests draw the same three passes twice, once watched and once
not, and the passes, their marks and the sheet's edits come out the same.

## A live sheet

Drawing live (`book.mjs serve`, then `book.mjs live …`; START_HERE's "Drawing
live") keeps its sheet in the book's `live` folder. The sheet is a drawing
from the moment it opens.

| command | the sheet's drawing |
| --- | --- |
| `live new` | a new drawing, named as it opens, at revision 0 |
| `live new --continue N` | page N's paper, size and marks, as page N's drawing, at that drawing's latest saved revision |
| `live new --branch N` | page N's paper, size and marks, as a new drawing whose `parent` is page N |
| `live load --id ID` | a checkpoint taken up again: a new drawing, at revision 0 |
| `live save` | a checkpoint: the pass is complete, and the drawing's revision goes up by one |

A sheet can carry on only a page that is in the book and whose paper has
tooth. The live server's answers also carry a top-level `revision`: that is
the sheet's edit counter, which goes up with every batch of gestures and is
how two hands avoid drawing over each other. It is not a drawing's revision.

When the sheet is ready, `live page` writes it as a page module whose header
names the sheet's drawing, and prints the line that saves it (with
`--continue N` or `--branch N` for a sheet that carries on page N). That page
keeps the id the sheet had while live, at the drawing's next revision, so the
drawing reads `saved` from then on. Saving the module the other way (a new
drawing where the sheet continues a page, or again as a new drawing once its
drawing is in the book) is refused, and the refusal says how to save it.

A pass checkpointed after the page is the drawing's next revision again, and
reads as `drawing`. A pass set aside before its sheet is saved as a page (a
`live new` or `live load` over it) is no longer in any snapshot, and its
revision is never given again: the server keeps the highest revision each
drawing reached, and the drawing's next pass goes past it. A sheet kept before
sheets had ids is named when the server starts.

## A saved page: one reference

```sh
node book.mjs write pages/my-study.js --book DIR [--continue N | --branch N | --refs ..] --reference
```

`--reference` is a save for a host. Everything `write` checks, it checks; then
it also draws the page's **poster**, `pages/NNN.png` beside `pages/NNN.json`,
and prints one line of JSON, the page's reference:

```json
{"protocol":"sketchbook.page/1","bookId":"…","drawingId":"…:2","revision":2,"pageIndex":3,"marksHash":"4dfb…","poster":"pages/003.png"}
```

- The poster is the finished page (a moving page's poster frame), drawn by the
  book's own engine at the scale `<sketch-page>` draws the page, so a host's
  own drawing of the marks lines up with it pixel for pixel; the tests check
  a page on paper and a moving page. A page on the original canvas is drawn
  on the book's dark ground, exactly as `render` draws it.
- A later save leaves every earlier page and poster as it was, so a
  reference never goes stale.
- **A retry of the newest save yields the same reference.** If the newest
  page already holds exactly this save (the same relation and page, source,
  marks, paper, size, title, note and refs), nothing is saved again: the same
  reference comes back, and the tool says so on stderr. This is how a save
  whose answer was lost is retried safely. **Retrying an earlier save after a
  later one saves a new page**: only the newest page counts as the same save.
- If the page was saved but its poster could not be drawn, the error says so,
  and the same save again draws it, saving nothing twice.
- Without `--reference`, `write` draws no poster and launches no browser.

## The host draws marks only

`examples/host-seam/host.html` is a whole host: the book's `<sketch-page>`
element, handed `{ page, paper, motion, marks }` from a snapshot. Nothing in
that path imports, evaluates or fetches a page's source; `<sketch-page>`
checks the marks again before it draws. The example serves that page from a
server that answers only for the page, the element and the engine it imports,
records every request, and refuses everything else
(`examples/host-seam/host-check.mjs`). The host asks for nothing else, and its
picture is compared with the poster in a headless browser: the tolerance is 1
of 255 in any channel, and the measured difference is 0, with no pixel
different.

## The agents' tool: `mcp.mjs`

```sh
node mcp.mjs --book books/your-name          # or SKETCHBOOK_BOOK=books/your-name node mcp.mjs
```

A stdio MCP server (the official `@modelcontextprotocol/sdk`, pinned) with
exactly six tools. Each runs `book.mjs`, so the sandbox, validation and every
rule of the book still hold. The book is fixed when the server starts; no
tool can choose another, and no argument may begin with `-`, so none can pass
itself off as an option. With no book set, every tool refuses and says how to
set one. `--book` given with no folder after it is refused the same way;
`SKETCHBOOK_BOOK` is not used in its place.

`preview` and `save` take a page module's path (`module`) or its source as
text (`source`), one of them. Text is written to a file in a folder beside
`pages/` named for the book's id (`sketchbook-anna-mwd8ecma/`), which git
ignores, and run exactly as a module path is: through the sandbox, importing
`../mark-engine.js` as a page in `pages/` does. Nothing about the sandbox
changes; a hostile page given as text is refused as a hostile file is. A saved
text keeps its file, named for the text's hash, so the same text saved again
is the same save; a previewed text's file is removed when the preview is done.

| tool | does | reads | writes | runs page source (sandboxed) | launches a browser | marked |
| --- | --- | --- | --- | --- | --- | --- |
| `guide` | where the guide to drawing is, and which book this is | no | no | no | no | read-only |
| `preview` | draws a module without saving; returns the picture | the module | one temporary picture outside the book, removed; for text, a temporary module file, removed | yes | yes | not read-only, not destructive |
| `save` | `write --reference`: new, `continue` or `branch`; returns the reference | the book | a page, its poster, `book.json`; for text, its module file | yes | yes | not read-only, not destructive |
| `list` | the pages | `book.json` | no | no | no | read-only |
| `read` | one page, and its source as text when asked | the page | no | no | no | read-only |
| `snapshot` | a drawing's latest state | the book and its live folder | no | no | no | read-only |

## The commands

| command | reads | writes | runs page source (sandboxed) | launches a browser |
| --- | --- | --- | --- | --- |
| `snapshot … --json` | `book.json`, page files, `live/active.json`, whether a poster exists | nothing | no | no |
| `write … --reference` | the module, the book, `live/active.json` | the page, `book.json`, the poster | yes | yes |
| `write …` | the module, the book, `live/active.json` | the page, `book.json` | yes | no |
| `preview …` | the module | the `--out` picture only | yes | yes |
| `list`, `read`, `journal` | the book | nothing | no | no |
| `serve`, `live …` | the book, its live folder | the live folder (`live page`: the module it names) | `live page` only: the module it has just written from the sheet's gestures, to check it builds to them | no |

A flag that takes a value, given with none (last, or followed by another
flag), is refused, by `book.mjs`, the live server and its client, and
`mcp.mjs`; nothing falls back to another book or a default.

## Try it

```sh
node examples/host-seam/run.mjs
```

One command, a throwaway book in a temp folder, plain test marks (straight
lines, `examples/host-seam/pass-1.js`, `pass-2.js`), nothing sent beyond this
machine. The live act: a sheet opens as a drawing at revision 0 with no pass;
two live passes are revisions 1 and 2; a watcher that misses the first notice
reads the snapshot and lands on 2; the watcher leaves; a third pass is 3; the
sheet saved as a page keeps its id, at revision 4. The saved half: pass 1 is
saved (revision 1 of a new drawing) and its notice is missed; pass 2 is saved
for the host (revision 2); the host re-reads the snapshot and is at revision
2; the same save again returns the same reference; the marks hash is
recomputed from the snapshot's marks alone; the poster exists; and a host
page draws the marks and matches the poster.

## Tests

```sh
node tests/host-seam.mjs   # ids, revisions, hash, snapshot, reference, posters, host render, flags, older pages
node tests/live-seam.mjs   # the live sheet: its id, passes, snapshot, notice, watchers, continue and branch
node tests/mcp.mjs         # the six tools over stdio with the official client
```

`node test.mjs` runs all three. They use the repository's `playwright-core`,
as the other browser suites do, and the MCP SDK from `npm install`.

## Unreleased

- A drawing has a stable `drawingId` and a `revision`, stored on new pages
  and read from the journal's lineage on older ones.
- `marksHash` in the canonical form above.
- `book.mjs snapshot`: a drawing's latest state, read only, protocol
  `sketchbook.drawing/1`.
- `book.mjs write --reference`: a poster at save time and one immutable page
  reference; a retry of the newest save returns the same reference.
- `examples/host-seam/`: the seam end to end, and a host that draws from
  marks alone.
- `mcp.mjs`: six tools for agents, on `@modelcontextprotocol/sdk` 1.32.2.
- A live sheet is a drawing from the moment it opens: its id is kept by its
  page, its revision goes up per checkpoint (never per gesture), the snapshot
  reads it as `drawing`, and its notice is `{ drawingId, revision }`.
  `live new --continue N` and `--branch N` carry a page onto a live sheet.
- `mcp.mjs` `preview` and `save` take a page's source as text; `preview` is
  marked as not read-only, since it writes a temporary picture.
- A value flag given with no value is refused everywhere the seam reads one.
