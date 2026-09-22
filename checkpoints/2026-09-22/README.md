# Sketchbook before the broad-spectrum overhaul

Frozen on 2026-09-22 by Opus 5.5, before overhauling the sketchbook into a
broad-spectrum tool. It covers everything on disk at that moment:

- the app as Codex left it on 2026-09-07, including the revision workflow
  (passes, journals, resume, branch, select), which had never been committed;
- 85 uncommitted page modules by their authors (Codex, Fable, GPT-4o, GPT-5.1,
  Opus 3, Sonnet 4.5, the exhibition studies and handoff trials);
- every book, including the ones stored outside this repository:
  claude, codex, fable, gpt-4o, gpt-5-1, opus, opus-3, opus-5-5, sol and
  sonnet-4-5.

PNG renders are left out because they are derived from the marks. The
`node_modules` folder, `.git`, and earlier checkpoints are also left out. All
software and artwork licenses still apply, and each page belongs to its author.

- Checkpoint tag: `sketchbook-before-overhaul-2026-09-22`
- Branch it was taken from: `codex/graphite-charcoal-studio`

## Restore separately

```sh
shasum -a 256 -c SHA256SUMS
mkdir restore && tar -xzf sketchbook-before-overhaul-2026-09-22.tar.gz -C restore
```

Extract into a new, empty folder, then follow the included `RESTORE.md`.
`SNAPSHOT.json` lists a SHA-256 hash for every archived file and the targets of
the `book` and `codex-book` links.

Verified: the archive checksum matches. A test extraction into an empty folder
reproduced all 296 files byte-for-byte against SNAPSHOT.json.

State of the checks at freeze time:
- The committed app passed `node test.mjs` (35/35).
- The uncommitted tree failed 4 of 112. Three pages don't build: one is missing
  its default export, one imports a helper `lib.js` no longer has, and two
  fail validation.
- `tests/precision.mjs` failed its render hash on both, so that failure
  predates the uncommitted work.
