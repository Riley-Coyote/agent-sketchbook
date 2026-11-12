# Following a drawing from an app

An app can show a mind drawing while a person talks with it, and keep the
finished page. This page is the contract such an app (a *host*) can rely on,
and the one tool an agent draws through. Everything here is something the code
does; `tests/host-seam.mjs` and `tests/mcp.mjs` check it, and
`node examples/host-seam/run.mjs` shows it end to end.

The rule underneath: a host shows **marks**, never runs a page's **source**.
Source runs only in the book's sandbox (`sandbox.mjs`), when a page is
previewed or saved.

## A drawing, its id and its revision

A **drawing** is one picture as it grows across saves. Every page of the book
belongs to exactly one.

- A page saved with `--continue N` belongs to page N's drawing.
- Any other page starts a new drawing: a first page, a page with `--refs`, and
  a page saved with `--branch N`.
- A branch names where it came from: `parentDrawing` is
  `{ drawingId, revision, pageIndex }` of the page it branched from.

`drawingId` is the book's id and the number of the page the drawing started
on, joined by a colon: `sketchbook-anna-mwd8ecma:1`. It never changes.

`revision` counts the drawing's saves: 1 for the page that started it, then
one more for each page that continues it, in the order they were saved. A
completed pass is a save; one save is one revision however many marks or
passes it holds. Continuing an earlier page of a drawing (not its newest) is
still the drawing's next revision, so revisions never repeat.

New pages store `drawingId`, `revision` and, for a branch, `parentDrawing`,
both in `book.json` and in the page file. Pages saved before these fields
existed get theirs from the lineage their journal already records
(`journal.parent`), by the same rule, so older books read exactly as new ones
do and nothing in them is rewritten.

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
same hash on any machine and in any language, whatever order a parser keeps
keys in. `[{"k":"p","ms":1}]` hashes to
`sha256('[{"k":"p","ms":1}]')`.

A page's journal and a Commons export also carry a field called `marksHash`.
That older hash covers the marks in the order the book stores them, and is
left as it was; it is not this one.

## The snapshot: a drawing's latest state

```sh
node book.mjs snapshot --book DIR [--drawing ID] [--protocol sketchbook.drawing/1] [--inline-max BYTES] --json
```

With no `--drawing`, it is the drawing of the book's newest page. The answer:

| field | what it is |
| --- | --- |
| `protocol` | `sketchbook.drawing/1`. Ask for another with `--protocol` and the read is refused. |
| `bookId`, `drawingId`, `revision` | as above, for the drawing's newest revision |
| `state` | `saved`: the revision is a page in the book (see *Live sheets* for `drawing`) |
| `pageIndex` | the page that holds this revision |
| `parent` | for a drawing that began as a branch: `{ drawingId, revision, pageIndex }` |
| `page`, `paper`, `motion` | the page size, its stored paper (`null` for the original canvas), and a moving page's loop |
| `marks` | the marks, checked exactly as every viewer checks them |
| `marksFile`, `marksField` | instead of `marks` when they are larger than `--inline-max` bytes (default 1 MiB): the page file, relative to the book, and the field (`ops`) that holds them |
| `marksBytes` | the size of the marks in the canonical form |
| `marksHash` | as above |
| `poster` | the poster's path relative to the book (`pages/002.png`), or `null` |
| `reference` | the page reference below, identical to what the save returned |

A snapshot only reads. No file in the book is created, changed or touched by
it (the tests compare every file's size, time and bytes before and after).
Reading it again gives the same answer until the book changes.

## Knowing that a pass completed

When a save completes, the book replaces `book.json` in one step, as it always
has, and the new page's entry carries `drawingId` and `revision`. That change
is the notice: it says *which drawing moved and how far*, and nothing else. A
host that watches the index (or is told by the agent's tool) re-reads the
snapshot; it never builds the drawing from notices. So a missed notice, a
notice that arrives twice, or a tab reopened a day later all end the same way:
one snapshot read, and the host is current. Nothing has to stay running for
this, and nothing is sent per stroke.

A host closing its preview stops watching. It does not stop, pause or change
the drawing.

### Live sheets

Drawing live (`book.mjs serve` and `book.mjs live`) keeps its sheet in the
book's `live` folder. Its server counts a `revision` per batch of gestures,
which is how two hands avoid drawing over each other, not a pass, and the
sheet has no id of its own. So a live sheet does not appear in a snapshot yet,
and `state` is always `saved` today. A live sheet becomes a drawing the moment
it is saved as a page (`live page`, then `write`).

The smallest change that would let a host follow a live sheet, not made here:
the live server gives each sheet a `drawingId` when `/api/new` starts it and
keeps it in `active.json`; it counts a pass revision that goes up only on
`/api/save` (a checkpoint); its existing `/api/session` answer adds those two
fields; `live page` writes the id into the module, and `write` keeps it for
the first page. A snapshot would then read `active.json` (reading only) and
answer `state: "drawing"`.

## A saved page: one reference

```sh
node book.mjs write pages/my-study.js --book DIR [--continue N | --branch N | --refs ..] --reference
```

`--reference` is a save for a host. Everything `write` checks, it checks; then
it also draws the page's **poster**, `pages/NNN.png` beside `pages/NNN.json`,
and prints one line of JSON, the page's reference:

```json
{"protocol":"sketchbook.page/1","bookId":"…","drawingId":"…:1","revision":2,"pageIndex":2,"marksHash":"4dfb…","poster":"pages/002.png"}
```

- The poster is the finished page (a moving page's poster frame), drawn by the
  book's own engine at the scale `<sketch-page>` draws the page, so a host's
  own drawing of the marks lines up with it pixel for pixel. A page on the
  original canvas is drawn on the book's dark ground, as `render` draws it.
- Pages are never rewritten, and a poster is never replaced once written, so a
  reference never goes stale.
- **Saving the same revision twice yields the same reference.** If the
  newest page already holds exactly this save (the same relation and page,
  source, marks, paper, size, title, note and refs), nothing is saved again:
  the same reference comes back, and the tool says so on stderr. This is how a
  save whose answer was lost is retried safely. If the page was saved but its
  poster could not be drawn, the error says so, and the same save again draws
  it.
- `--reference` checks for the browser before anything is saved. Without it,
  nothing is saved.
- Without `--reference`, `write` behaves exactly as before, apart from storing
  the drawing fields.

## The host draws marks only

`examples/host-seam/host.html` is a whole host: the book's `<sketch-page>`
element, handed `{ page, paper, marks }` from a snapshot. Nothing in that path
imports, evaluates or fetches a page's source; `<sketch-page>` checks the
marks again before it draws. The example serves that page from a server that
answers only for the page, the element and the engine it imports, records
every request, and refuses everything else. The host asks for nothing else,
and its picture is compared with the poster in a headless browser: the
tolerance is 1 of 255 in any channel, and the measured difference is 0, with
no pixel different.

## The agents' tool: `mcp.mjs`

```sh
node mcp.mjs --book books/your-name          # or SKETCHBOOK_BOOK=books/your-name node mcp.mjs
```

A stdio MCP server (the official `@modelcontextprotocol/sdk`, pinned) with
exactly six tools. Each is a thin wrapper that runs `book.mjs`, so the
sandbox, validation and every rule of the book still hold. The book is fixed
when the server starts; no tool can choose another, and no argument may begin
with `-`, so none can pass itself off as an option. With no book set, every
tool refuses and says how to set one.

| tool | does | reads | writes | runs page source (sandboxed) | launches a browser | marked |
| --- | --- | --- | --- | --- | --- | --- |
| `guide` | where the guide to drawing is, and which book this is | no | no | no | no | read-only |
| `preview` | draws a module without saving; returns the picture | the module | a temporary picture outside the book, removed | yes | yes | read-only |
| `save` | `write --reference`: new, `continue` or `branch`; returns the reference | the book | a page, its poster, `book.json` | yes | yes | writes, not destructive |
| `list` | the pages | `book.json` | no | no | no | read-only |
| `read` | one page, and its source as text when asked | the page | no | no | no | read-only |
| `snapshot` | a drawing's latest state | the book | no | no | no | read-only |

## The commands

| command | reads | writes | runs page source (sandboxed) | launches a browser |
| --- | --- | --- | --- | --- |
| `snapshot … --json` | `book.json`, page files, whether a poster exists | nothing | no | no |
| `write … --reference` | the module, the book | the page, `book.json`, the poster | yes | yes |
| `write …` | the module, the book | the page, `book.json` | yes | no |
| `preview …` | the module | the `--out` picture only | yes | yes |
| `list`, `read` | the book | nothing | no | no |

## Try it

```sh
node examples/host-seam/run.mjs
```

One command, a throwaway book in a temp folder, plain test marks
(`examples/host-seam/pass-1.js`, `pass-2.js`), nothing sent beyond this
machine. Pass 1 is saved (revision 1) and its notice is missed; pass 2 is
saved for the host (revision 2); the host re-reads the snapshot and is at
revision 2; the same save again returns the same reference; the marks hash is
recomputed from the snapshot's marks alone; the poster exists; and a host page
draws the marks and matches the poster.

## Tests

```sh
node tests/host-seam.mjs   # ids, revisions, hash, snapshot, reference, poster, host render, older pages
node tests/mcp.mjs         # the six tools over stdio with the official client
```

`node test.mjs` runs both. They use the repository's `playwright-core`, as the
other browser suites do, and the MCP SDK from `npm install`.

## Unreleased

- A drawing has a stable `drawingId` and a `revision`, stored on new pages
  and read from the journal's lineage on older ones.
- `marksHash` in the canonical form above.
- `book.mjs snapshot`: a drawing's latest state, read only, protocol
  `sketchbook.drawing/1`.
- `book.mjs write --reference`: a poster at save time and one immutable page
  reference; a retried save returns the same reference.
- `examples/host-seam/`: the seam end to end, and a host that draws from
  marks alone.
- `mcp.mjs`: six tools for agents, on `@modelcontextprotocol/sdk` 1.32.2.
