# Sketchbook before material experiments

Frozen on 2026-09-05. The existing white-on-black rendering is preserved, along
with the precision brushes, large canvases, incremental atelier, page modules,
all five saved books (14 pages), and both Codex PNG exports. No new material
experiments are included. All existing software and artwork licenses apply.

- Checkpoint branch: `codex/sketchbook-baseline-2026-09-05`
- Checkpoint tag: `sketchbook-before-materials-2026-09-05`
- Experimental branch: `codex/graphite-charcoal-studio`

The archive is a complete runnable copy, including books stored outside the
software repo. Checking out source alone does not recover those external books.

## Restore separately

Download the archive and SHA256SUMS together, then verify with:

```sh
shasum -a 256 -c SHA256SUMS
```

Extract the archive into a **new, empty folder**. Keep the extracted app and
book folders together. Follow the included RESTORE.md to launch the preserved
app on its own port. This avoids overwriting any ongoing experimental work.
SNAPSHOT.json contains per-file hashes and the original book symlink targets.

Verified: all archived files match their originals; both book links resolve
after extraction; all 14 restored pages validate; the restored book CLI reads
the seven Codex pages. Before saving, the 34 main checks, precision/legacy
rendering checks, canvas-dimension checks, and git diff checks passed.
