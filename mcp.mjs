#!/usr/bin/env node
/* mcp.mjs — one narrow tool for agents that draw in a book.
 *
 *   node mcp.mjs --book DIR        (or SKETCHBOOK_BOOK=DIR node mcp.mjs)
 *
 * A stdio MCP server with six tools and no others: guide, preview, save,
 * list, read and snapshot. Each is a thin wrapper over book.mjs, run as a
 * child process, so a page's source still runs only in the sandbox
 * (sandbox.mjs) and every rule book.mjs keeps still holds. The book is fixed
 * when the server starts; no tool can choose another. With no book, every tool
 * refuses and says how to set one. docs/host-seam.md has the whole contract.
 */

import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
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
const named = at >= 0 ? process.argv[at + 1] : process.env.SKETCHBOOK_BOOK;
const BOOK = named ? resolve(process.cwd(), named) : null;
const NO_BOOK = 'No book is set, so this tool does nothing. Start the server with --book DIR (node mcp.mjs --book books/your-name) or set SKETCHBOOK_BOOK=DIR. Make the book first with: node book.mjs init --owner "Your name" --book DIR';

const integer = (description, minimum = 1) => ({ type: 'integer', minimum, description });
const text = (description, maxLength = 4000) => ({ type: 'string', maxLength, description });
const MODULE = text('Path to your page module: a .js file inside the sketchbook folder, absolute or relative to it, such as pages/your-study.js', 1000);
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
    description: 'Runs your page module in the sandbox, checks its marks exactly as a save would, and draws them in a headless browser. Returns the picture. Saves nothing and spends no page. Runs your source (sandboxed) and launches a browser.',
    inputSchema: {
      type: 'object',
      properties: {
        module: MODULE,
        pass: integer('Draw only through this pass of the module\'s passes'),
        crop: { type: 'array', items: { type: 'integer', minimum: 0 }, minItems: 4, maxItems: 4, description: 'x, y, width, height inside the page' },
        scale: { type: 'number', minimum: 0.1, maximum: 4, description: '1 is the page\'s own pixels (the default here); 2 is twice that' },
      },
      required: ['module'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'save',
    title: 'Save a page',
    description: 'Saves your page module into the book as a new page: a new drawing, a continuation of a page (continue: every earlier mark and pass kept) or a branch from one (branch: a new drawing that names its parent). Also draws the page\'s poster and returns its page reference. A save that already landed as the newest page returns the same reference and spends nothing. Writes to the book; runs your source (sandboxed) and launches a browser.',
    inputSchema: {
      type: 'object',
      properties: {
        module: MODULE,
        continue: integer('The page this continues'),
        branch: integer('The page this branches from'),
        refs: { type: 'array', items: { type: 'integer', minimum: 1 }, maxItems: 48, description: 'Earlier pages this one reworks, for a new drawing' },
        title: text('Title, if not the module\'s own', 120),
        note: text('Note: what was attempted, and where it failed, if not the module\'s own'),
        date: text('Date as YYYY-MM-DD, if not the module\'s own', 10),
      },
      required: ['module'],
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
  return input;
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
      `A page module is a .js file inside ${ROOT} (for example pages/your-study.js) that imports from '../mark-engine.js'. Look with preview, then save.`,
      `This server's book: ${BOOK}.`,
    ].join('\n'));
  },
  async preview(input) {
    const out = await mkdtemp(join(tmpdir(), 'sketchbook-preview-'));
    try {
      const file = join(out, 'preview.png');
      const args = ['preview', value('module', input.module), '--out', file, '--scale', value('scale', input.scale ?? 1)];
      if (input.pass !== undefined) args.push('--pass', value('pass', input.pass));
      if (input.crop !== undefined) args.push('--crop', input.crop.map((n) => value('crop', n)).join(','));
      const { stdout } = await book(args);
      return { content: [{ type: 'text', text: stdout }, { type: 'image', mimeType: 'image/png', data: (await readFile(file)).toString('base64') }] };
    } finally {
      await rm(out, { recursive: true, force: true });
    }
  },
  async save(input) {
    const args = ['write', value('module', input.module), '--reference'];
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
  if (!BOOK) return said(NO_BOOK, { isError: true });
  try {
    return await HANDLERS[tool.name](checkInput(tool, params.arguments ?? {}));
  } catch (error) {
    return said(error.message, { isError: true });
  }
});
await server.connect(new StdioServerTransport());
