/* host-seam.mjs — what an app that shows the book (a host) can rely on.
 *
 * A drawing has a stable id and a revision. Its marks have one hash that any
 * language can recompute. The latest state of a drawing is read without
 * writing anything, and a page saved for a host is one immutable reference.
 * A live sheet is a drawing from the moment it opens, and its completed
 * passes are revisions too. docs/host-seam.md is the contract in plain words;
 * book.mjs uses this file for `snapshot`, `write` and `renderer` (the
 * renderer a host pins, renderer.manifest.json), studio-server.mjs for a
 * live sheet's id and passes, and mcp.mjs reaches it through book.mjs.
 * Nothing here runs a page's source.
 */

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { sanitizeOps, sanitizePageDimensions, sanitizeSurface, sanitizeMotion, countFrames, limitsForPage } from './validate.js';

export const PROTOCOL = 'sketchbook.drawing/1';
export const REFERENCE_PROTOCOL = 'sketchbook.page/1';
/* Marks larger than this travel as a path to the page file, not inline. */
export const INLINE_MAX = 1024 * 1024;

/** JSON in one exact form: object keys sorted by UTF-16 code unit, no
 * whitespace, strings and numbers written as JSON.stringify writes them. For
 * marks (strings, finite numbers, arrays, plain objects) this is the JSON
 * Canonicalization Scheme, RFC 8785. */
export function canonicalJSON(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('canonical JSON has no NaN or Infinity');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJSON).join(',')}]`;
  if (typeof value === 'object') {
    return `{${Object.keys(value).filter((k) => value[k] !== undefined).sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJSON(value[k])}`).join(',')}}`;
  }
  throw new Error(`canonical JSON cannot hold a ${typeof value}`);
}

/** SHA-256, as hex, of the UTF-8 bytes of the canonical JSON of the marks. */
export const marksHash = (ops) => createHash('sha256').update(canonicalJSON(ops), 'utf8').digest('hex');

/** The drawing a new page belongs to. A page continued from another keeps its
 * drawing; any other page starts one, named after the book and the page it
 * starts on. */
export const newDrawingId = (bookId, pageIndex) => `${bookId}:${pageIndex}`;

/** A drawing begun on a live sheet is named when the sheet opens, before it
 * has a page: the book and the sheet, `sketchbook-anna-mwd8ecma:live-1f2e3d4c`.
 * Its pages keep that id. A sheet served with no book is named for the sheet
 * alone. */
export const liveDrawingId = (bookId, tag) => `${bookId ? `${bookId}:` : ''}live-${tag}`;
const LIVE_ID = /^(?:(.+):)?live-[0-9a-f]{8}$/;
export const isLiveDrawingId = (id, bookId) => typeof id === 'string' && LIVE_ID.exec(id)?.[1] === bookId;

/** Every page's drawing, in page order: Map(index → { drawingId, revision,
 * parent }). Pages saved before drawings had ids get theirs from the lineage
 * their journal already records, by the same rule `write` uses, so older pages
 * read the same way as new ones. A stored revision is kept as stored when it
 * moves the drawing forward (a drawing begun live has spent revisions on its
 * live passes); otherwise a page is its drawing's next revision.
 * `readPage(meta)` returns a page file. */
export async function lineage(book, readPage) {
  const out = new Map(), latest = new Map();
  for (const meta of book.pages) {
    let drawingId = meta.drawingId, parent = meta.parentDrawing;
    if (typeof drawingId !== 'string') {
      const from = (await readPage(meta)).journal?.parent;
      const before = from && from.book === book.id ? out.get(from.page) : undefined;
      if (before && from.relation === 'continue') drawingId = before.drawingId;
      else {
        drawingId = newDrawingId(book.id, meta.index);
        if (before && from.relation === 'branch') parent = { drawingId: before.drawingId, revision: before.revision, pageIndex: from.page };
      }
    }
    const last = latest.get(drawingId) || 0;
    const revision = typeof meta.drawingId === 'string' && Number.isSafeInteger(meta.revision) && meta.revision > last ? meta.revision : last + 1;
    latest.set(drawingId, revision);
    out.set(meta.index, { drawingId, revision, ...(parent ? { parent } : {}) });
  }
  return out;
}

/** A drawing's newest saved revision in the book, 0 when it has no page. */
export const savedRevision = (known, drawingId) => Math.max(0, ...[...known.values()].filter((d) => d.drawingId === drawingId).map((d) => d.revision));

/** The drawing fields `write` stores on a new page: the drawing it continues,
 * or a new drawing that names the one it branched from. `live` is the drawing
 * a module made from a live sheet names ({ drawingId, revision }), and
 * `liveRevision(id)` the revision a drawing's open live sheet has reached, so
 * a page never repeats a revision its live passes spent. */
export function drawingForNewPage(book, known, index, relation, from, { live = null, liveRevision = () => 0 } = {}) {
  const before = relation ? known.get(from) : undefined;
  if (relation && !before) throw new Error(`no page ${from}`);
  const next = (id, floor = 0) => Math.max(floor, savedRevision(known, id), liveRevision(id)) + 1;
  if (relation === 'continue') {
    if (live && live.drawingId !== before.drawingId) throw new Error(`this module was drawn on the live sheet of drawing ${live.drawingId}, but page ${from} belongs to drawing ${before.drawingId}; save it as a new drawing (no --continue) or with --branch ${from}`);
    return { drawingId: before.drawingId, revision: next(before.drawingId) };
  }
  if (live) {
    const page = [...known].find(([, d]) => d.drawingId === live.drawingId)?.[0];
    if (page !== undefined) throw new Error(`this module's live sheet is drawing ${live.drawingId}, which is already page ${page} of this book; save it with --continue ${page}`);
  }
  return {
    drawingId: live ? live.drawingId : newDrawingId(book.id, index),
    revision: live ? next(live.drawingId, live.revision) : 1,
    ...(relation === 'branch' ? { parentDrawing: { drawingId: before.drawingId, revision: before.revision, pageIndex: from } } : {}),
  };
}

/* ---------------------------------------------------------------- live sheets
 *
 * `book.mjs serve` keeps a book's live sheet in DIR/live/active.json, replaced
 * in one step on every change. Beside the sheet it keeps the sheet's notice,
 * { drawingId, revision }: the drawing the sheet is and its last completed pass
 * (a checkpoint, `live save`). The marks of that pass are kept with it. */

export const LIVE_FILE = 'live/active.json';

/** The book's open live sheet, read only: { notice, from, parent, base, pass,
 * spent(id) } or null when there is none, or none that names its drawing. */
export async function openSheet(bookDir) {
  let active;
  try { active = JSON.parse(await readFile(resolve(bookDir, LIVE_FILE), 'utf8')); }
  catch { return null; }
  const n = active?.notice;
  if (!n || typeof n.drawingId !== 'string' || !Number.isSafeInteger(n.revision) || n.revision < 0) return null;
  const spent = active.spent && typeof active.spent === 'object' ? active.spent : {};
  return {
    notice: { drawingId: n.drawingId, revision: n.revision }, from: active.from ?? null, parent: active.parent ?? null, base: active.base ?? null, pass: active.pass ?? null,
    /* The highest revision a drawing's live passes reached, the open sheet's or one set aside. */
    spent: (id) => Math.max(id === n.drawingId ? n.revision : 0, Number.isSafeInteger(spent[id]) ? spent[id] : 0),
  };
}

/** The line a page module made from a live sheet carries in its header, and
 * the same line read back: { drawingId, revision[, relation, page] }. */
export const sheetLine = (notice, from) => `// live sheet ${JSON.stringify({ drawingId: notice.drawingId, revision: notice.revision, ...(from ? { relation: from.relation, page: from.page } : {}) })}`;
export function sheetOf(source) {
  const header = source.slice(0, source.indexOf('BEGIN FROZEN MARKS') + 1 || 4096);
  const m = /^\/\/ live sheet (\{[^\n]*\})$/m.exec(header);
  if (!m) return null;
  let s;
  try { s = JSON.parse(m[1]); } catch { return null; }
  if (typeof s.drawingId !== 'string' || !Number.isSafeInteger(s.revision) || s.revision < 0) return null;
  if (s.relation !== undefined && (!['continue', 'branch'].includes(s.relation) || !Number.isSafeInteger(s.page))) return null;
  return { drawingId: s.drawingId, revision: s.revision, ...(s.relation ? { relation: s.relation, page: s.page } : {}) };
}

/** The scale <sketch-page> draws a page at, so a poster and a host's own
 * drawing of the marks are the same size, pixel for pixel. */
export const posterScale = ({ w, h }) => Math.max(1 / Math.min(w, h), Math.min(2, 1760 / Math.max(w, h)));
export const posterFile = (meta) => meta.file.replace(/\.json$/, '.png');

/** A saved page as one immutable reference. Asked for twice, it is the same. */
export function reference(book, meta, drawing, hash, poster) {
  return { protocol: REFERENCE_PROTOCOL, bookId: book.id, drawingId: drawing.drawingId, revision: drawing.revision, pageIndex: meta.index, marksHash: hash, poster };
}

/** A stored page's marks, checked as every viewer checks them. */
export function checkedPage(page) {
  const { page: dimensions, errors: de } = sanitizePageDimensions(page.page);
  if (!dimensions) throw new Error(`the page dimensions were rejected: ${de.join('; ')}`);
  const { surface, errors: se } = sanitizeSurface(page.surface);
  if (surface === null) throw new Error(`the page surface was rejected: ${se.join('; ')}`);
  const { ops, errors } = sanitizeOps(page.ops, limitsForPage(dimensions, surface));
  if (!ops) throw new Error(`the page's marks were rejected: ${errors.join('; ')}`);
  const { motion, errors: me } = sanitizeMotion(page.motion, dimensions);
  if (motion === null || (motion?.frames || 1) !== countFrames(ops)) throw new Error(`the page motion was rejected: ${me.join('; ') || 'its frames do not match the marks'}`);
  return { dimensions, surface, motion, ops };
}

const marksFields = (ops, inlineMax, file, field) => {
  const text = canonicalJSON(ops);
  const bytes = Buffer.byteLength(text);
  return { marksHash: createHash('sha256').update(text, 'utf8').digest('hex'), marksBytes: bytes, ...(bytes <= inlineMax ? { marks: ops } : { marksFile: file, marksField: field }) };
};

/** The latest state of a drawing: its newest page, or the last completed pass
 * of its open live sheet when that is newer. It only reads: no file in the
 * book is created, changed or touched. */
export async function snapshot({ bookDir, drawingId, protocol, inlineMax = INLINE_MAX }) {
  if (protocol !== undefined && protocol !== PROTOCOL) throw new Error(`this book answers in ${PROTOCOL}; it does not know ${JSON.stringify(protocol)}`);
  const index = resolve(bookDir, 'book.json');
  if (!existsSync(index)) throw new Error(`no book at ${bookDir}`);
  const book = JSON.parse(await readFile(index, 'utf8'));
  const cache = new Map();
  const readPage = async (meta) => {
    if (!cache.has(meta.index)) cache.set(meta.index, JSON.parse(await readFile(resolve(bookDir, meta.file), 'utf8')));
    return cache.get(meta.index);
  };
  const known = await lineage(book, readPage);
  const sheet = await openSheet(bookDir);
  /* The sheet is ahead of the book when it holds a pass no page holds yet. */
  const ahead = sheet && sheet.notice.revision > savedRevision(known, sheet.notice.drawingId);
  const wanted = drawingId ?? (ahead || (sheet && !book.pages.length) ? sheet.notice.drawingId : book.pages.length ? known.get(book.pages.at(-1).index).drawingId : undefined);
  if (wanted === undefined) throw new Error('the book has no pages yet and no live sheet is open, so it holds no drawing');
  const base = { protocol: PROTOCOL, bookId: book.id, drawingId: wanted };
  const latest = book.pages.filter((p) => known.get(p.index).drawingId === wanted).at(-1);
  if (sheet && sheet.notice.drawingId === wanted && (ahead || !latest)) {
    const parent = sheet.parent ? { parent: sheet.parent } : {};
    if (!ahead) {
      return { ...base, revision: 0, state: 'drawing', pageIndex: null, ...parent, marks: null, poster: null, reference: null,
        message: 'this drawing is open on a live sheet, and none of its passes has completed yet; a pass completes when the sheet is checkpointed (live save)' };
    }
    const { dimensions, surface, ops } = checkedPage(sheet.pass ?? {});
    return { ...base, revision: sheet.notice.revision, state: 'drawing', pageIndex: null, ...parent, page: dimensions, paper: surface ?? null,
      ...marksFields(ops, inlineMax, LIVE_FILE, 'pass.ops'), poster: null, reference: null };
  }
  if (!latest) throw new Error(`no drawing ${JSON.stringify(wanted)} in this book; it holds ${[...new Set([...known.values()].map((d) => d.drawingId).concat(sheet ? [sheet.notice.drawingId] : []))].join(', ')}`);
  const drawing = known.get(latest.index);
  const { dimensions, surface, motion, ops } = checkedPage(await readPage(latest));
  const marks = marksFields(ops, inlineMax, latest.file, 'ops');
  const poster = existsSync(resolve(bookDir, posterFile(latest))) ? posterFile(latest) : null;
  return {
    ...base,
    revision: drawing.revision,
    state: 'saved',
    pageIndex: latest.index,
    ...(drawing.parent ? { parent: drawing.parent } : {}),
    page: dimensions,
    paper: surface ?? null,
    ...(motion ? { motion } : {}),
    ...marks,
    poster,
    reference: reference(book, latest, drawing, marks.marksHash, poster),
  };
}

/* The renderer a host loads (`<sketch-page>` and what it imports), pinned by
 * renderer.manifest.json: each file's size and SHA-256. `book.mjs renderer`
 * prints and checks it; tests/renderer.mjs keeps it from going stale. */
export const RENDERER_PROTOCOL = 'sketchbook.renderer/1';
export const RENDERER_MANIFEST = 'renderer.manifest.json';

export const rendererManifest = async (root) => JSON.parse(await readFile(resolve(root, RENDERER_MANIFEST), 'utf8'));

/** Every file the manifest names, read from `root` and recomputed: the eight
 * renderer files, then the fonts' licence texts (`licenses`), which travel
 * with the fonts. `problems` names each file that differs, is missing or is
 * empty, and each font whose licence text the manifest does not list; it is
 * empty when all match. */
export async function checkRenderer(root, manifest) {
  const files = [], problems = [];
  if (manifest.protocol !== RENDERER_PROTOCOL) problems.push(`the manifest's protocol is ${JSON.stringify(manifest.protocol)}, not ${RENDERER_PROTOCOL}`);
  const licenses = manifest.licenses || [];
  const listed = new Set(licenses.map((l) => l.path));
  for (const f of manifest.files) {
    if (f.kind === 'font' && !listed.has(f.licenseFile)) problems.push(`no licence: ${f.path} names ${JSON.stringify(f.licenseFile)}, which the manifest's licenses do not list`);
  }
  for (const f of [...manifest.files, ...licenses]) {
    let bytes;
    try { bytes = await readFile(resolve(root, f.path)); } catch {
      files.push({ path: f.path, state: 'missing' });
      problems.push(`missing: ${f.path}`);
      continue;
    }
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const same = bytes.length === f.bytes && sha256 === f.sha256 && bytes.length > 0;
    files.push({ path: f.path, state: same ? 'ok' : bytes.length ? 'differs' : 'empty', bytes: bytes.length, sha256 });
    if (!bytes.length) problems.push(`empty: ${f.path}`);
    else if (!same) problems.push(`differs: ${f.path} (${bytes.length} bytes, sha256 ${sha256}; the manifest has ${f.bytes} bytes, sha256 ${f.sha256})`);
  }
  return { files, problems };
}

/** The version rule, between an earlier manifest and a later one: when any of
 * the renderer's files changed (its digest, or a file added or taken away),
 * scripts and fonts alike, existing marks could draw differently, so
 * rendererVersion must be higher. The licence texts don't draw, so they are
 * outside the rule. */
export function rendererVersionRule(before, after) {
  const digests = (m) => new Map(m.files.map((f) => [f.path, f.sha256]));
  const was = digests(before), now = digests(after);
  const changed = [...new Set([...was.keys(), ...now.keys()])].filter((path) => was.get(path) !== now.get(path));
  return { changed, ok: !changed.length || after.rendererVersion > before.rendererVersion };
}
