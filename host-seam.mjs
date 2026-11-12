/* host-seam.mjs — what an app that shows the book (a host) can rely on.
 *
 * A drawing has a stable id and a revision. Its marks have one hash that any
 * language can recompute. The latest state of a drawing is read without
 * writing anything, and a page saved for a host is one immutable reference.
 * docs/host-seam.md is the contract in plain words; book.mjs uses this file
 * for `snapshot` and `write --reference`, and mcp.mjs reaches it through
 * book.mjs. Nothing here runs a page's source.
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

/** Every page's drawing, in page order: Map(index → { drawingId, revision,
 * parent }). Pages saved before drawings had ids get theirs from the lineage
 * their journal already records, by the same rule `write` uses, so older pages
 * read the same way as new ones. `readPage(meta)` returns a page file. */
export async function lineage(book, readPage) {
  const out = new Map(), count = new Map();
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
    const revision = (count.get(drawingId) || 0) + 1;
    count.set(drawingId, revision);
    out.set(meta.index, { drawingId, revision, ...(parent ? { parent } : {}) });
  }
  return out;
}

/** The drawing fields `write` stores on a new page: the drawing it continues,
 * or a new drawing that names the one it branched from. */
export function drawingForNewPage(book, known, index, relation, from) {
  const before = relation ? known.get(from) : undefined;
  if (relation && !before) throw new Error(`no page ${from}`);
  if (relation === 'continue') {
    const revision = 1 + [...known.values()].filter((d) => d.drawingId === before.drawingId).length;
    return { drawingId: before.drawingId, revision };
  }
  return {
    drawingId: newDrawingId(book.id, index),
    revision: 1,
    ...(relation === 'branch' ? { parentDrawing: { drawingId: before.drawingId, revision: before.revision, pageIndex: from } } : {}),
  };
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

/** The latest state of a drawing. It only reads: no file in the book is
 * created, changed or touched. */
export async function snapshot({ bookDir, drawingId, protocol, inlineMax = INLINE_MAX }) {
  if (protocol !== undefined && protocol !== PROTOCOL) throw new Error(`this book answers in ${PROTOCOL}; it does not know ${JSON.stringify(protocol)}`);
  const index = resolve(bookDir, 'book.json');
  if (!existsSync(index)) throw new Error(`no book at ${bookDir}`);
  const book = JSON.parse(await readFile(index, 'utf8'));
  if (!book.pages.length) throw new Error('the book has no pages yet, so it holds no drawing');
  const cache = new Map();
  const readPage = async (meta) => {
    if (!cache.has(meta.index)) cache.set(meta.index, JSON.parse(await readFile(resolve(bookDir, meta.file), 'utf8')));
    return cache.get(meta.index);
  };
  const known = await lineage(book, readPage);
  const wanted = drawingId ?? known.get(book.pages.at(-1).index).drawingId;
  const latest = book.pages.filter((p) => known.get(p.index).drawingId === wanted).at(-1);
  if (!latest) throw new Error(`no drawing ${JSON.stringify(wanted)} in this book; it holds ${[...new Set([...known.values()].map((d) => d.drawingId))].join(', ')}`);
  const drawing = known.get(latest.index);
  const { dimensions, surface, motion, ops } = checkedPage(await readPage(latest));
  const text = canonicalJSON(ops);
  const hash = createHash('sha256').update(text, 'utf8').digest('hex');
  const bytes = Buffer.byteLength(text);
  const poster = existsSync(resolve(bookDir, posterFile(latest))) ? posterFile(latest) : null;
  return {
    protocol: PROTOCOL,
    bookId: book.id,
    drawingId: drawing.drawingId,
    revision: drawing.revision,
    state: 'saved',
    pageIndex: latest.index,
    ...(drawing.parent ? { parent: drawing.parent } : {}),
    page: dimensions,
    paper: surface ?? null,
    ...(motion ? { motion } : {}),
    marksHash: hash,
    marksBytes: bytes,
    ...(bytes <= inlineMax ? { marks: ops } : { marksFile: latest.file, marksField: 'ops' }),
    poster,
    reference: reference(book, latest, drawing, hash, poster),
  };
}
