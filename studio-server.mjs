/** Local, durable drawing bridge. Run: node studio-server.mjs [--port 4194] [--data DIR]. */
import http from 'node:http';
import { createReadStream } from 'node:fs';
import { mkdir, open, readFile, readdir, realpath, rename, rm, stat } from 'node:fs/promises';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { SketchSession } from './sketch-session.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
const MAX_BODY = 32 * 1024 * 1024;
const MAX_OUTPUT_PIXELS = 4_000_000;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff' };
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

export async function startStudioServer({ port = 4194, dataDir = resolve(ROOT, '../codex-sketchbook/studio') } = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Port must be an integer between 0 and 65535');
  dataDir = resolve(dataDir);
  const savesDir = join(dataDir, 'saves'), activePath = join(dataDir, 'active.json');
  await mkdir(savesDir, { recursive: true });
  let session = new SketchSession();
  let revision = 0;
  let lessons = [];
  try {
    const active = JSON.parse(await readFile(activePath, 'utf8'));
    if (!Number.isSafeInteger(active.revision) || active.revision < 0) throw new Error('Invalid saved revision');
    session.import(active.drawing);
    revision = active.revision;
    if (Array.isArray(active.lessons)) lessons = active.lessons;
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error(`Cannot restore studio active.json: ${error.message}. Original file has been preserved.`);
    await atomicJSON(activePath, { version: 1, revision, drawing: session.export(), lessons });
  }
  const snapshot = () => ({ revision, drawing: session.export() });
  const staticRoots = [await realpath(ROOT)];
  for (const name of ['book', 'codex-book']) {
    try { staticRoots.push(await realpath(join(ROOT, name))); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
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
  async function commit(candidate) {
    const drawing = candidate.export();
    const combined = new Map(lessons.map(lesson => [lessonKey(lesson), lesson]));
    for (const review of drawing.reviews || []) {
      const lesson = { ...review, title: drawing.title };
      const key = lessonKey(lesson);
      if (!combined.has(key)) combined.set(key, lesson);
    }
    const next = { version: 1, revision: revision + 1, drawing, lessons: [...combined.values()] };
    await atomicJSON(activePath, next);
    session = candidate;
    revision = next.revision;
    lessons = next.lessons;
    return snapshot();
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
          throw fail(404, 'Unknown studio API route');
        }
        const allowed = (req.method === 'PUT' && url.pathname === '/api/session') || (req.method === 'POST' && ['/api/actions', '/api/new', '/api/save', '/api/load'].includes(url.pathname));
        if (!allowed) throw fail(405, 'Method or route is not supported');
        const body = await bodyJSON(req);
        const result = await exclusive(async () => {
          if (!Number.isSafeInteger(body.revision) || body.revision !== revision) throw Object.assign(fail(409, 'Revision conflict'), { revision });
          if (url.pathname === '/api/new') {
            const candidate = new SketchSession({ ...(body.title === undefined ? {} : { title: body.title }), ...(body.page === undefined ? {} : { page: body.page }), ...(body.surface === undefined ? {} : { surface: body.surface }) });
            await saveDrawing();
            return commit(candidate);
          }
          if (url.pathname === '/api/load') {
            if (typeof body.id !== 'string' || !/^[a-zA-Z0-9-]+$/.test(body.id)) throw fail(400, 'Invalid save id');
            let saved;
            try { saved = JSON.parse(await readFile(join(savesDir, `${body.id}.json`), 'utf8')); }
            catch (error) { if (error.code === 'ENOENT') throw fail(404, 'Saved study not found'); throw error; }
            const candidate = new SketchSession();
            candidate.import(saved.drawing);
            await saveDrawing();
            return commit(candidate);
          }
          if (url.pathname === '/api/save') {
            const save = await saveDrawing(body.name);
            return { ...await commit(session), save };
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
      const path = resolve(ROOT, '.' + (decoded === '/' ? '/studio.html' : decoded));
      if (!inside(path, ROOT) || !MIME[extname(path).toLowerCase()]) throw fail(404, 'File not found');
      let actual, info;
      try { actual = await realpath(path); info = await stat(actual); }
      catch (error) { if (['ENOENT', 'ENOTDIR'].includes(error.code)) throw fail(404, 'File not found'); throw error; }
      if (!staticRoots.some(root => inside(actual, root)) || !info.isFile()) throw fail(403, 'Path is not served');
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
  return { server, port: boundPort, dataDir, url: `http://127.0.0.1:${boundPort}`, close: () => new Promise((done, reject) => server.close(error => error ? reject(error) : done())) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2), options = {};
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--port' && args[i + 1] !== undefined) options.port = Number(args[++i]);
      else if (args[i] === '--data' && args[i + 1]) options.dataDir = args[++i];
      else throw new Error('Usage: node studio-server.mjs [--port 4194] [--data DIR]');
    }
    const studio = await startStudioServer(options);
    process.stdout.write(JSON.stringify({ ready: true, url: studio.url, port: studio.port, dataDir: studio.dataDir }) + '\n');
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { studio.server.close(() => process.exit(0)); studio.server.closeIdleConnections(); });
  } catch (error) {
    process.stderr.write(`Studio server: ${error.message}\n`);
    process.exitCode = 1;
  }
}
