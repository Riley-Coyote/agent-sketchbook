/** Local, durable drawing bridge for drawing live. Run: node studio-server.mjs [--port 4194] [--data DIR] [--book DIR],
 * or node book.mjs serve, which keeps the live sheets in the book's own live folder. */
import http from 'node:http';
import { createReadStream } from 'node:fs';
import { mkdir, open, readFile, readdir, realpath, rename, rm, stat } from 'node:fs/promises';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { SketchSession } from './sketch-session.js';
import { lineage, liveDrawingId, savedRevision } from './host-seam.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const MAX_BODY = 32 * 1024 * 1024;
const MAX_OUTPUT_PIXELS = 4_000_000;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.md': 'text/plain; charset=utf-8' };
const inside = (file, folder) => file === folder || file.startsWith(folder + sep);
const fail = (status, message) => Object.assign(new Error(message), { status });
const loopback = host => ['127.0.0.1', 'localhost', '[::1]'].includes(host);
const lessonKey = lesson => lesson.id || JSON.stringify([lesson.title, lesson.observation, lesson.lesson, lesson.next, lesson.region, lesson.at, lesson.tool, lesson.settings]);

async function atomicJSON(path, value) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  let handle;
  try {
    handle = await open(temporary, 'wx', 0o600);
    await handle.writeFile(JSON.stringify(value) + '\n');
    await handle.sync();
    await handle.close();
    handle = null;
    await rename(temporary, path);
  } finally {
    await handle?.close();
    await rm(temporary, { force: true });
  }
}

async function bodyJSON(req) {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) throw fail(415, 'Use Content-Type: application/json');
  const length = Number(req.headers['content-length']);
  if (Number.isFinite(length) && length > MAX_BODY) throw fail(413, 'Drawing request exceeds 32 MiB');
  let bytes = 0;
  const chunks = [];
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > MAX_BODY) throw fail(413, 'Drawing request exceeds 32 MiB');
    chunks.push(chunk);
  }
  let body;
  try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw fail(400, 'Request body must be valid JSON'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw fail(400, 'Request body must be an object');
  return body;
}

function json(res, status, value) {
  const body = Buffer.from(JSON.stringify(value));
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': body.length });
  res.end(body);
}

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let bit = 0; bit < 8; bit++) n = (n >>> 1) ^ ((n & 1) ? 0xedb88320 : 0);
  return n >>> 0;
});
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const name = Buffer.from(type);
  const out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length, 0);
  name.copy(out, 4);
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([name, data])), out.length - 4);
  return out;
}
export function encodePNG({ width, height, data }) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > MAX_OUTPUT_PIXELS || data.length !== width * height * 4) throw fail(400, 'Invalid PNG dimensions');
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = 6;
  const raw = Buffer.alloc(height * (width * 4 + 1));
  const rgba = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  for (let y = 0; y < height; y++) rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', header), pngChunk('IDAT', deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0))]);
}

function inspectRegion(search, page) {
  const number = (key, fallback) => search.has(key) ? Number(search.get(key)) : fallback;
  const x = number('x', 0), y = number('y', 0), w = number('w', page.w), h = number('h', page.h);
  const scale = number('scale', 1);
  if (![x, y, w, h].every(Number.isInteger) || x < 0 || y < 0 || w < 1 || h < 1 || x >= page.w || y >= page.h || !Number.isFinite(scale) || scale < 0.1 || scale > 4) throw fail(400, 'Inspection needs positive integer bounds inside the page and scale between 0.1 and 4');
  const region = { x, y, w: Math.min(w, page.w - x), h: Math.min(h, page.h - y) };
  const width = Math.max(1, Math.round(region.w * scale)), height = Math.max(1, Math.round(region.h * scale));
  if (width * height > MAX_OUTPUT_PIXELS) throw fail(400, 'Inspection exceeds four million output pixels; use a smaller scale or crop');
  return { region, scale };
}

/* A live sheet is a drawing from the moment it opens (docs/host-seam.md).
 * Beside the sheet, active.json keeps its notice, { drawingId, revision }: the
 * drawing and its last completed pass, which goes up only when the sheet is
 * checkpointed (/api/save), never per gesture. With the notice: the page the
 * sheet continues or branches (from), the drawing a branch came from
 * (parent), that page's passes (base), and the marks of the last completed
 * pass (pass). The top-level `revision` is the sheet's edit counter, which
 * keeps two hands from drawing over each other; it is not a drawing's
 * revision. */
function keptSheet(active) {
  const n = active?.notice;
  if (!n || typeof n.drawingId !== 'string' || n.drawingId.length > 300 || !Number.isSafeInteger(n.revision) || n.revision < 0) return null;
  const kept = { notice: { drawingId: n.drawingId, revision: n.revision } };
  for (const key of ['from', 'parent', 'base', 'pass']) if (active[key] && typeof active[key] === 'object') kept[key] = active[key];
  return kept;
}
const sheetFields = (sheet) => ({ notice: sheet.notice, ...['from', 'parent', 'base', 'pass'].reduce((o, key) => sheet[key] ? { ...o, [key]: sheet[key] } : o, {}) });
/* `spent` remembers the highest revision each drawing's sheets reached here,
 * so a pass set aside unsaved (live new, live load) never has its revision
 * given again, by a later sheet or by a page. */
function keptSpent(active) {
  const out = {};
  if (active?.spent && typeof active.spent === 'object') for (const [id, n] of Object.entries(active.spent)) if (Number.isSafeInteger(n) && n > 0) out[id] = n;
  return out;
}
const spending = (spent, notice) => notice.revision > (spent[notice.drawingId] || 0) ? { ...spent, [notice.drawingId]: notice.revision } : spent;

/* `/book/…` is answered from bookDir, wherever it is on disk, so `/` opens
 * that book; everything else comes from this folder. */
export async function startStudioServer({ port = 4194, dataDir = resolve(ROOT, '../codex-sketchbook/studio'), bookDir = join(ROOT, 'book') } = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Port must be an integer between 0 and 65535');
  dataDir = resolve(dataDir); bookDir = resolve(bookDir);
  const savesDir = join(dataDir, 'saves'), activePath = join(dataDir, 'active.json');
  await mkdir(savesDir, { recursive: true });
  /* The book the sheets belong to, read fresh each time: null when there is none. */
  const readBook = async () => {
    try { return JSON.parse(await readFile(join(bookDir, 'book.json'), 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  };
  const drawingsOf = (book) => lineage(book, async (meta) => JSON.parse(await readFile(join(bookDir, meta.file), 'utf8')));
  const freshSheet = async () => ({ notice: { drawingId: liveDrawingId((await readBook())?.id, randomUUID().slice(0, 8)), revision: 0 } });
  let session = new SketchSession();
  let revision = 0;
  let lessons = [];
  let sheet = null;
  let spent = {};
  try {
    const active = JSON.parse(await readFile(activePath, 'utf8'));
    if (!Number.isSafeInteger(active.revision) || active.revision < 0) throw new Error('Invalid saved revision');
    session.import(active.drawing);
    revision = active.revision;
    if (Array.isArray(active.lessons)) lessons = active.lessons;
    sheet = keptSheet(active);
    spent = keptSpent(active);
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error(`Cannot restore the live sheet from active.json: ${error.message}. The file has been kept as it was.`);
  }
  // A new sheet, or one kept before sheets had ids, is named now and kept so.
  if (!sheet) {
    sheet = await freshSheet();
    await atomicJSON(activePath, { version: 1, revision, drawing: session.export(), lessons, ...sheetFields(sheet), spent });
  }
  const snapshot = () => ({ revision, drawing: session.export(), ...sheetFields({ ...sheet, pass: null }) });
  const real = async (path) => { try { return await realpath(path); } catch (error) { if (error.code !== 'ENOENT') throw error; return null; } };
  const staticRoots = [await realpath(ROOT), await real(join(ROOT, 'codex-book'))].filter(Boolean);
  const bookRoot = await real(bookDir), liveRoot = await realpath(dataDir);
  async function saveDrawing(name = session.export().title || 'Untitled study') {
    if (typeof name !== 'string' || !name.trim() || name.length > 160) throw fail(400, 'Save name must contain 1–160 characters');
    const id = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
    const saved = { version: 1, id, name: name.trim(), savedAt: new Date().toISOString(), revision, drawing: session.export() };
    await atomicJSON(join(savesDir, `${id}.json`), saved);
    return { id, name: saved.name, savedAt: saved.savedAt, title: saved.drawing.title, page: saved.drawing.page, marks: saved.drawing.ops.length };
  }
  async function allSaves() {
    const files = (await readdir(savesDir)).filter(name => /^[a-zA-Z0-9-]+\.json$/.test(name));
    const saves = await Promise.all(files.map(async file => JSON.parse(await readFile(join(savesDir, file), 'utf8'))));
    return saves.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  }
  async function commit(candidate, nextSheet = sheet) {
    const drawing = candidate.export();
    const combined = new Map(lessons.map(lesson => [lessonKey(lesson), lesson]));
    for (const review of drawing.reviews || []) {
      const lesson = { ...review, title: drawing.title };
      const key = lessonKey(lesson);
      if (!combined.has(key)) combined.set(key, lesson);
    }
    const nextSpent = spending(spent, nextSheet.notice);
    const next = { version: 1, revision: revision + 1, drawing, lessons: [...combined.values()], ...sheetFields(nextSheet), spent: nextSpent };
    await atomicJSON(activePath, next);
    session = candidate;
    revision = next.revision;
    lessons = next.lessons;
    sheet = nextSheet;
    spent = nextSpent;
    return snapshot();
  }
  /* A checkpoint completes a pass: the drawing's next revision, after its own
   * passes and any page of it already in the book. */
  async function completedPass() {
    const book = await readBook();
    const saved = book ? savedRevision(await drawingsOf(book), sheet.notice.drawingId) : 0;
    const { title, page, surface, ops } = session.export();
    return { ...sheet, notice: { drawingId: sheet.notice.drawingId, revision: Math.max(sheet.notice.revision, saved, spent[sheet.notice.drawingId] || 0) + 1 }, pass: { title, page, surface, ops } };
  }
  /* A new sheet: blank, or a page of the book carried on (continue: the same
   * drawing) or taken somewhere new (branch: a new drawing naming its parent). */
  async function openSheet(body) {
    if (body.continue !== undefined && body.branch !== undefined) throw fail(400, 'Choose continue or branch, not both');
    const relation = body.continue !== undefined ? 'continue' : body.branch !== undefined ? 'branch' : null;
    if (!relation) return { candidate: new SketchSession({ ...(body.title === undefined ? {} : { title: body.title }), ...(body.page === undefined ? {} : { page: body.page }), ...(body.surface === undefined ? {} : { surface: body.surface }) }), opened: await freshSheet() };
    const n = body[relation];
    if (!Number.isSafeInteger(n) || n < 1) throw fail(400, `${relation} needs a page number`);
    if (body.page !== undefined || body.surface !== undefined) throw fail(400, `A sheet that carries on page ${n} keeps its paper and size`);
    const book = await readBook();
    if (!book) throw fail(400, 'There is no book here to carry a page from; serve one with node book.mjs serve --book DIR');
    const meta = book.pages.find(p => p.index === n);
    if (!meta) throw fail(404, `No page ${n} in this book`);
    const page = JSON.parse(await readFile(join(bookDir, meta.file), 'utf8'));
    if (!page.surface) throw fail(400, `Page ${n} is on the original canvas; a live sheet needs paper with tooth`);
    if (page.motion) throw fail(400, `Page ${n} moves; a live sheet is one still drawing`);
    const candidate = new SketchSession();
    candidate.import({ version: 1, title: body.title ?? page.title, page: page.page, surface: page.surface, ops: page.ops, reviews: [], redo: [] });
    const known = await drawingsOf(book), drawing = known.get(n);
    const passes = page.journal?.passes?.length ? page.journal.passes.map(({ name, note, review, start, end }) => ({ name, note, ...(review ? { review } : {}), start, end })) : [{ name: `Page ${n}`, note: '', start: 0, end: page.ops.length }];
    const carried = { from: { relation, page: n }, base: { end: page.ops.length, passes } };
    if (relation === 'branch') return { candidate, opened: { ...await freshSheet(), ...carried, parent: { drawingId: drawing.drawingId, revision: drawing.revision, pageIndex: n } } };
    // The same drawing: a pass this sheet's drawing already completed live stays its latest.
    const kept = sheet.notice.drawingId === drawing.drawingId && sheet.notice.revision > savedRevision(known, drawing.drawingId) && sheet.pass;
    return { candidate, opened: { notice: { drawingId: drawing.drawingId, revision: kept ? sheet.notice.revision : savedRevision(known, drawing.drawingId) }, ...carried, ...(kept ? { pass: sheet.pass } : {}) } };
  }
  let queue = Promise.resolve();
  const exclusive = operation => {
    const result = queue.then(operation);
    queue = result.catch(() => {});
    return result;
  };
  let boundPort;
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    try {
      let host;
      try { host = new URL(`http://${req.headers.host}`); } catch { throw fail(403, 'Loopback Host required'); }
      if (!loopback(host.hostname) || Number(host.port || 80) !== boundPort || host.pathname !== '/') throw fail(403, 'Loopback Host required');
      if (req.headers.origin) {
        let origin;
        try { origin = new URL(req.headers.origin); } catch { throw fail(403, 'Same-origin request required'); }
        if (origin.origin !== host.origin) throw fail(403, 'Same-origin request required');
      }
      const url = new URL(req.url, host);
      if (url.pathname.startsWith('/api/')) {
        if (req.method === 'GET') {
          await queue;
          if (url.pathname === '/api/session') return json(res, 200, snapshot());
          if (url.pathname === '/api/saves') return json(res, 200, { saves: (await allSaves()).map(({ id, name, savedAt, drawing }) => ({ id, name, savedAt, title: drawing.title, page: drawing.page, marks: drawing.ops.length })) });
          if (url.pathname === '/api/lessons') {
            const drawings = [{ drawing: session.export(), savedAt: null }, ...await allSaves()];
            const seen = new Set(), allLessons = [];
            for (const lesson of lessons) {
              const key = lessonKey(lesson);
              seen.add(key); allLessons.push(lesson);
            }
            for (const { drawing, savedAt } of drawings) for (const review of drawing.reviews || []) {
              const key = lessonKey({ ...review, title: drawing.title });
              if (!seen.has(key)) { seen.add(key); allLessons.push({ ...review, title: drawing.title, savedAt }); }
            }
            return json(res, 200, { lessons: allLessons });
          }
          if (url.pathname === '/api/inspect') {
            const { region, scale } = inspectRegion(url.searchParams, session.export().page);
            const png = encodePNG(session.pixels({ ...region, scale }));
            res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': png.length, 'X-Sketchbook-Revision': revision, 'X-Sketchbook-Region': JSON.stringify(region) });
            return res.end(png);
          }
          throw fail(404, 'Unknown API route');
        }
        const allowed = (req.method === 'PUT' && url.pathname === '/api/session') || (req.method === 'POST' && ['/api/actions', '/api/new', '/api/save', '/api/load'].includes(url.pathname));
        if (!allowed) throw fail(405, 'Method or route is not supported');
        const body = await bodyJSON(req);
        const result = await exclusive(async () => {
          if (!Number.isSafeInteger(body.revision) || body.revision !== revision) throw Object.assign(fail(409, 'Revision conflict'), { revision });
          if (url.pathname === '/api/new') {
            const { candidate, opened } = await openSheet(body);
            await saveDrawing();
            return commit(candidate, opened);
          }
          if (url.pathname === '/api/load') {
            if (typeof body.id !== 'string' || !/^[a-zA-Z0-9-]+$/.test(body.id)) throw fail(400, 'Invalid save id');
            let saved;
            try { saved = JSON.parse(await readFile(join(savesDir, `${body.id}.json`), 'utf8')); }
            catch (error) { if (error.code === 'ENOENT') throw fail(404, 'That saved sheet was not found'); throw error; }
            const candidate = new SketchSession();
            candidate.import(saved.drawing);
            await saveDrawing();
            // A checkpoint taken up again is a new drawing, as a return to an earlier checkpoint is a branch.
            return commit(candidate, await freshSheet());
          }
          if (url.pathname === '/api/save') {
            const passed = await completedPass();
            const save = await saveDrawing(body.name);
            return { ...await commit(session, passed), save };
          }
          const candidate = session.clone();
          if (url.pathname === '/api/session') candidate.import(body.drawing);
          else {
            if (!Array.isArray(body.actions) || body.actions.length < 1 || body.actions.length > 256) throw fail(400, 'Provide between 1 and 256 drawing actions');
            candidate.apply(body.actions, { atomic: false });
          }
          return commit(candidate);
        });
        return json(res, 200, result);
      }
      if (!['GET', 'HEAD'].includes(req.method)) throw fail(405, 'Static files are read-only');
      let decoded;
      try { decoded = decodeURIComponent(url.pathname); } catch { throw fail(400, 'Malformed path'); }
      if (decoded.includes('\0') || decoded.includes('\\') || decoded.split('/').some(part => part.startsWith('.'))) throw fail(403, 'Path is not served');
      const mounted = decoded === '/book' || decoded.startsWith('/book/');
      const base = mounted ? bookDir : ROOT;
      const path = resolve(base, '.' + (mounted ? decoded.slice(5) : decoded === '/' ? '/index.html' : decoded));
      if (!inside(path, base) || !MIME[extname(path).toLowerCase()]) throw fail(404, 'File not found');
      let actual, info;
      try { actual = await realpath(path); info = await stat(actual); }
      catch (error) { if (['ENOENT', 'ENOTDIR'].includes(error.code)) throw fail(404, 'File not found'); throw error; }
      // The live sheets are reached through the API, never as files.
      const roots = mounted ? [bookRoot] : staticRoots;
      if (!roots.some(root => root && inside(actual, root)) || inside(actual, liveRoot) || !info.isFile()) throw fail(403, 'Path is not served');
      res.writeHead(200, { 'Content-Type': MIME[extname(path).toLowerCase()], 'Content-Length': info.size });
      if (req.method === 'HEAD') return res.end();
      const stream = createReadStream(actual);
      stream.on('error', () => res.destroy());
      stream.pipe(res);
    } catch (error) {
      if (res.headersSent) return res.destroy();
      const status = error.status || (error.code ? 500 : 400);
      json(res, status, { error: error.message, ...(error.revision === undefined ? {} : { revision: error.revision }) });
    }
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 10_000;
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => { server.off('error', reject); resolveListen(); });
  });
  boundPort = server.address().port;
  return { server, port: boundPort, dataDir, bookDir, url: `http://127.0.0.1:${boundPort}`, close: () => new Promise((done, reject) => server.close(error => error ? reject(error) : done())) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2), options = {};
    for (let i = 0; i < args.length; i++) {
      // A flag with no value is refused, never passed over.
      const given = args[i + 1] !== undefined && args[i + 1] !== '' && !args[i + 1].startsWith('--');
      if (args[i] === '--port' && given) options.port = Number(args[++i]);
      else if (args[i] === '--data' && given) options.dataDir = args[++i];
      else if (args[i] === '--book' && given) options.bookDir = args[++i];
      else throw new Error('Usage: node studio-server.mjs [--port 4194] [--data DIR] [--book DIR]');
    }
    const studio = await startStudioServer(options);
    process.stdout.write(JSON.stringify({ ready: true, url: studio.url, port: studio.port, dataDir: studio.dataDir }) + '\n');
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { studio.server.close(() => process.exit(0)); studio.server.closeIdleConnections(); });
  } catch (error) {
    process.stderr.write(`Drawing live: ${error.message}\n`);
    process.exitCode = 1;
  }
}
