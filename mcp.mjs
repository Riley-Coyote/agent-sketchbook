#!/usr/bin/env node
/* mcp.mjs — one narrow tool for agents that draw in a book.
 *
 *   node mcp.mjs --book DIR        (or SKETCHBOOK_BOOK=DIR node mcp.mjs)
 *
 * A stdio MCP server with six tools and no others: guide, preview, save,
 * list, read and snapshot. Each is a thin wrapper over book.mjs, run as a
 * child process, so a page's source still runs only in the sandbox
 * (sandbox.mjs) and every rule book.mjs keeps still holds. The book is fixed
 * when the server starts; no tool can choose another. With no book (or --book
 * with no folder after it), every tool refuses and says how to set one.
 * preview and save take a module path or the module's source as text.
 * docs/host-seam.md has the whole contract.
 */

import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
const run = promisify(execFile);
const at = process.argv.indexOf('--book');
/* --book with no value is refused, never passed over for SKETCHBOOK_BOOK. */
const VALUELESS = at >= 0 && (process.argv[at + 1] === undefined || process.argv[at + 1] === '' || process.argv[at + 1].startsWith('-'));
const named = at >= 0 ? (VALUELESS ? null : process.argv[at + 1]) : process.env.SKETCHBOOK_BOOK;
const BOOK = named ? resolve(process.cwd(), named) : null;
const NO_BOOK = 'No book is set, so this tool does nothing. Start the server with --book DIR (node mcp.mjs --book books/your-name) or set SKETCHBOOK_BOOK=DIR. Make the book first with: node book.mjs init --owner "Your name" --book DIR';
const NO_VALUE = 'This server was started with --book and no folder after it, so no book is set and this tool does nothing (SKETCHBOOK_BOOK is not used in its place). Start it with --book DIR (node mcp.mjs --book books/your-name).';
if (VALUELESS) process.stderr.write(`mcp.mjs: --book needs a value; every tool will refuse.\n`);

const integer = (description, minimum = 1) => ({ type: 'integer', minimum, description });
const text = (description, maxLength = 4000) => ({ type: 'string', maxLength, description });
const MODULE = text('Path to your page module: a .js file inside the sketchbook folder, absolute or relative to it, such as pages/your-study.js. Give this or source.', 1000);
const SOURCE_MAX = 8 * 1024 * 1024;
const SOURCE = text(`Your page module's source, as text, instead of a path: written to a file beside the sketchbook's pages (in a git-ignored folder named for this book) and run exactly as a module path is, in the sandbox. It imports from '../mark-engine.js' as a page in pages/ does. Give this or module.`, SOURCE_MAX);
const READS = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

const TOOLS = [
  {
    name: 'guide',
    title: 'Where to read how to draw',
    description: 'Says where the guide to drawing in this book is (START_HERE.md), the rules for working in it, and where page modules go. Reads nothing in the book and runs nothing.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: READS,
  },
  {
    name: 'preview',
    title: 'Draw without saving',
    description: 'Runs your page module (a path, or its source as text) in the sandbox, checks its marks exactly as a save would, and draws them in a headless browser. Returns the picture. Saves nothing to the book and spends no page. Not read-only: it writes one temporary picture outside the book and removes it once read, and source given as text is written to a temporary module file that is removed too. Runs your source (sandboxed) and launches a browser.',
    inputSchema: {
      type: 'object',
      properties: {
        module: MODULE,
        source: SOURCE,
        pass: integer('Draw only through this pass of the module\'s passes'),
        crop: { type: 'array', items: { type: 'integer', minimum: 0 }, minItems: 4, maxItems: 4, description: 'x, y, width, height inside the page' },
        scale: { type: 'number', minimum: 0.1, maximum: 4, description: '1 is the page\'s own pixels (the default here); 2 is twice that' },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'save',
    title: 'Save a page',
    description: 'Saves your page module (a path, or its source as text) into the book as a new page: a new drawing, a continuation of a page (continue: every earlier mark and pass kept) or a branch from one (branch: a new drawing that names its parent). Also draws the page\'s poster and returns its page reference. A retry of the newest save returns the same reference and spends nothing; retrying an earlier save after a later one saves a new page. Source given as text is kept as a module file named for its own hash, in a git-ignored folder named for this book. Writes to the book; runs your source (sandboxed) and launches a browser.',
    inputSchema: {
      type: 'object',
      properties: {
        module: MODULE,
        source: SOURCE,
        continue: integer('The page this continues'),
        branch: integer('The page this branches from'),
        refs: { type: 'array', items: { type: 'integer', minimum: 1 }, maxItems: 48, description: 'Earlier pages this one reworks, for a new drawing' },
        title: text('Title, if not the module\'s own', 120),
        note: text('Note: what was attempted, and where it failed, if not the module\'s own'),
        date: text('Date as YYYY-MM-DD, if not the module\'s own', 10),
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: 'list',
    title: 'List the pages',
    description: 'Lists the book\'s pages: number, date, title, what each reworks, mark count and stage. Reads only.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: READS,
  },
  {
    name: 'read',
    title: 'Read a page',
    description: 'Reads one saved page\'s record: title, note, paper, size, stage, journal and drawing, and with source: true the source that made it, as text. Reads only; runs nothing.',
    inputSchema: {
      type: 'object',
      properties: { page: integer('The page number'), source: { type: 'boolean', description: 'Include the page\'s source, as text' } },
      required: ['page'],
      additionalProperties: false,
    },
    annotations: READS,
  },
  {
    name: 'snapshot',
    title: 'A drawing\'s latest state',
    description: 'The latest state of a drawing (the newest page\'s drawing unless one is named): its id, revision, page size and paper, its checked marks (or a path to them when large), the marks hash, the poster, and the page reference. Reads only; nothing in the book changes.',
    inputSchema: {
      type: 'object',
      properties: {
        drawing: text('A drawing id, as a snapshot or page reference gives it', 400),
        protocol: text('The protocol you speak; anything but sketchbook.drawing/1 is refused', 100),
        inlineMax: integer('Largest marks, in bytes, to carry inline (default 1048576)', 0),
      },
      additionalProperties: false,
    },
    annotations: READS,
  },
];

/** The input, checked against the tool's own schema before anything runs. */
function checkInput(tool, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('the arguments must be an object');
  const { properties, required = [] } = tool.inputSchema;
  for (const key of required) if (input[key] === undefined) throw new Error(`${tool.name} needs ${key}`);
  for (const [key, v] of Object.entries(input)) {
    const s = properties[key];
    if (!s) throw new Error(`${tool.name} takes ${Object.keys(properties).join(', ') || 'no arguments'}, not ${key}`);
    const fits = (type, x) => type === 'integer' ? Number.isInteger(x) && x >= (s.minimum ?? s.items?.minimum ?? -Infinity)
      : type === 'number' ? Number.isFinite(x) && x >= s.minimum && x <= s.maximum
        : type === 'string' ? typeof x === 'string' && x.length <= s.maxLength
          : typeof x === type;
    const ok = s.type === 'array' ? Array.isArray(v) && v.length >= (s.minItems ?? 0) && v.length <= s.maxItems && v.every((x) => fits(s.items.type, x)) : fits(s.type, v);
    if (!ok) throw new Error(`${key}: ${s.description}`);
  }
  if (properties.source && (input.module === undefined) === (input.source === undefined)) throw new Error(`${tool.name} needs module (a path) or source (the text), one of them`);
  return input;
}

/* Source given as text becomes a module file where the sandbox already runs
 * modules: a folder beside pages/ named for the book's id, so its imports
 * ('../mark-engine.js') resolve as a page's do. The folder ignores itself in
 * git. A saved text is named for its hash (the same text, the same file, so a
 * retried save is the same save); a previewed one is removed afterwards. */
async function textModule(source, kept) {
  let id;
  try { id = JSON.parse(await readFile(join(BOOK, 'book.json'), 'utf8')).id; }
  catch { throw new Error(`there is no book at ${BOOK} yet; make it with node book.mjs init --owner "Your name" --book DIR`); }
  if (typeof id !== 'string' || !/^sketchbook-[a-z0-9-]{1,100}$/.test(id)) throw new Error(`this book's id (${JSON.stringify(id)}) cannot name a folder; save from a module path instead`);
  const folder = join(ROOT, id);
  await mkdir(folder, { recursive: true });
  await writeFile(join(folder, '.gitignore'), '# page sources given to mcp.mjs as text\n*\n', { flag: 'wx' }).catch((error) => { if (error.code !== 'EEXIST') throw error; });
  const file = join(folder, kept ? `text-${createHash('sha256').update(source, 'utf8').digest('hex').slice(0, 16)}.js` : `preview-${randomUUID()}.js`);
  await writeFile(file, source, { flag: 'wx' }).catch(async (error) => {
    if (error.code !== 'EEXIST' || await readFile(file, 'utf8') !== source) throw error;
  });
  return file;
}

/* Every value reaches book.mjs as its own argument. None may look like a
 * flag, so no title or note can switch on another option. */
function value(name, v) {
  const s = String(v);
  if (s.startsWith('-')) throw new Error(`${name} may not start with "-"`);
  return s;
}

async function book(args) {
  try {
    const { stdout, stderr } = await run(process.execPath, [join(ROOT, 'book.mjs'), ...args, '--book', BOOK], { cwd: ROOT, maxBuffer: 1 << 28, timeout: 300000 });
    return { stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (error) {
    throw new Error((error.stderr || '').trim() || error.message);
  }
}

const said = (words, extra = {}) => ({ content: [{ type: 'text', text: words }], ...extra });

const HANDLERS = {
  async guide() {
    return said([
      `How to draw: ${join(ROOT, 'START_HERE.md')} is the whole guide. Read it before drawing.`,
      `Working in a book: ${join(ROOT, 'AGENTS.md')}.`,
      `How an app follows a drawing: ${join(ROOT, 'docs/host-seam.md')}.`,
      `A page module is a .js file inside ${ROOT} (for example pages/your-study.js) that imports from '../mark-engine.js'; preview and save take its path, or its source as text. Look with preview, then save.`,
      `This server's book: ${BOOK}.`,
    ].join('\n'));
  },
  async preview(input) {
    const out = await mkdtemp(join(tmpdir(), 'sketchbook-preview-'));
    const written = input.source !== undefined ? await textModule(input.source, false) : null;
    try {
      const file = join(out, 'preview.png');
      const args = ['preview', written ?? value('module', input.module), '--out', file, '--scale', value('scale', input.scale ?? 1)];
      if (input.pass !== undefined) args.push('--pass', value('pass', input.pass));
      if (input.crop !== undefined) args.push('--crop', input.crop.map((n) => value('crop', n)).join(','));
      const { stdout } = await book(args);
      return { content: [{ type: 'text', text: stdout }, { type: 'image', mimeType: 'image/png', data: (await readFile(file)).toString('base64') }] };
    } finally {
      await rm(out, { recursive: true, force: true });
      if (written) await rm(written, { force: true });
    }
  },
  async save(input) {
    const args = ['write', input.source !== undefined ? await textModule(input.source, true) : value('module', input.module), '--reference'];
    if (input.continue !== undefined) args.push('--continue', value('continue', input.continue));
    if (input.branch !== undefined) args.push('--branch', value('branch', input.branch));
    if (input.refs?.length) args.push('--refs', input.refs.map((n) => value('refs', n)).join(','));
    for (const key of ['title', 'note', 'date']) if (input[key] !== undefined) args.push(`--${key}`, value(key, input[key]));
    const { stdout, stderr } = await book(args);
    const ref = JSON.parse(stdout.split('\n').pop());
    return said([stderr, JSON.stringify(ref)].filter(Boolean).join('\n'), { structuredContent: ref });
  },
  async list() {
    return said((await book(['list'])).stdout);
  },
  async read(input) {
    const args = ['read', value('page', input.page)];
    if (input.source) args.push('--source');
    return said((await book(args)).stdout);
  },
  async snapshot(input) {
    const args = ['snapshot', '--json'];
    if (input.drawing !== undefined) args.push('--drawing', value('drawing', input.drawing));
    if (input.protocol !== undefined) args.push('--protocol', value('protocol', input.protocol));
    if (input.inlineMax !== undefined) args.push('--inline-max', value('inlineMax', input.inlineMax));
    const { stdout } = await book(args);
    return said(stdout, { structuredContent: JSON.parse(stdout) });
  },
};

/* The package has no version of its own; the server reports none either. */
const server = new Server({ name: 'agent-sketchbook', version: '0.0.0' }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
  const tool = TOOLS.find((t) => t.name === params.name);
  if (!tool) return said(`there is no tool called ${params.name}; this server has ${TOOLS.map((t) => t.name).join(', ')}`, { isError: true });
  if (!BOOK) return said(VALUELESS ? NO_VALUE : NO_BOOK, { isError: true });
  try {
    return await HANDLERS[tool.name](checkInput(tool, params.arguments ?? {}));
  } catch (error) {
    return said(error.message, { isError: true });
  }
});
await server.connect(new StdioServerTransport());
