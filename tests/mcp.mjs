/* tests/mcp.mjs — node tests/mcp.mjs
 * mcp.mjs, driven over stdio by the official MCP client: exactly six tools,
 * each marked read-only or not as it is, every tool refusing without a book,
 * and each tool doing what book.mjs does. Throwaway books in a temp folder,
 * plain test marks.
 */

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const run = promisify(execFile);
let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log(`  ok   ${name}`); } else { fail++; console.log(`  FAIL ${name}`); } };
const SIX = ['guide', 'list', 'preview', 'read', 'save', 'snapshot'];
const tmp = await mkdtemp(join(tmpdir(), 'sketchbook-mcp-test-'));

/* The server gets only what it needs: no SKETCHBOOK_BOOK from this shell. */
async function connect(args = [], env = {}) {
  const base = Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'SKETCHBOOK_BOOK'));
  const transport = new StdioClientTransport({ command: process.execPath, args: [join(ROOT, 'mcp.mjs'), ...args], cwd: ROOT, env: { ...base, ...env }, stderr: 'pipe' });
  const client = new Client({ name: 'sketchbook-mcp-test', version: '0.0.0' });
  await client.connect(transport);
  return client;
}
const words = (r) => r.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n');

try {
  console.log('without a book');
  {
    const client = await connect();
    const { tools } = await client.listTools();
    ok(tools.map((t) => t.name).sort().join() === SIX.join(), `the handshake lists exactly six tools: ${tools.map((t) => t.name).join(', ')}`);
    const readOnly = Object.fromEntries(tools.map((t) => [t.name, t.annotations?.readOnlyHint]));
    ok(readOnly.save === false && ['guide', 'list', 'preview', 'read', 'snapshot'].every((n) => readOnly[n] === true), 'save is marked as writing; the other five as read-only');
    ok(tools.find((t) => t.name === 'save').annotations.destructiveHint === false && tools.every((t) => t.annotations.openWorldHint === false), 'none is destructive (a book only grows) or reaches beyond this machine');
    const answers = await Promise.all(SIX.map((name) => client.callTool({ name, arguments: name === 'read' ? { page: 1 } : ['preview', 'save'].includes(name) ? { module: 'examples/host-seam/pass-1.js' } : {} })));
    ok(answers.every((a) => a.isError && /No book is set/.test(words(a)) && /--book DIR/.test(words(a)) && /SKETCHBOOK_BOOK/.test(words(a))), 'every tool refuses, and says how to set the book');
    await client.close();
  }

  const book = join(tmp, 'book');
  await run(process.execPath, [join(ROOT, 'book.mjs'), 'init', '--owner', 'mcp-test', '--book', book], { cwd: ROOT });

  console.log('with a book');
  {
    const client = await connect([], { SKETCHBOOK_BOOK: book });
    const guide = await client.callTool({ name: 'guide', arguments: {} });
    ok(!guide.isError && words(guide).includes(join(ROOT, 'START_HERE.md')) && words(guide).includes(book), 'guide (book from SKETCHBOOK_BOOK) says where the guide is and which book this is');
    const preview = await client.callTool({ name: 'preview', arguments: { module: 'examples/host-seam/pass-1.js' } });
    const image = preview.content?.find((c) => c.type === 'image');
    ok(!preview.isError && image && Buffer.from(image.data, 'base64').subarray(1, 4).toString() === 'PNG' && /Nothing was saved/.test(words(preview)), 'preview returns the picture and saves nothing');
    ok(JSON.parse(await readFile(join(book, 'book.json'), 'utf8')).pages.length === 0, 'the book is still empty after a preview');
    const first = await client.callTool({ name: 'save', arguments: { module: 'examples/host-seam/pass-1.js' } });
    ok(!first.isError && first.structuredContent?.revision === 1 && first.structuredContent.poster === 'pages/001.png', 'save makes revision 1, with its poster');
    const second = await client.callTool({ name: 'save', arguments: { module: 'examples/host-seam/pass-2.js', continue: 1 } });
    ok(second.structuredContent?.revision === 2 && second.structuredContent.drawingId === first.structuredContent.drawingId, 'save with continue keeps the drawing and makes revision 2');
    const retry = await client.callTool({ name: 'save', arguments: { module: 'examples/host-seam/pass-2.js', continue: 1 } });
    ok(JSON.stringify(retry.structuredContent) === JSON.stringify(second.structuredContent) && /nothing was saved twice/.test(words(retry)), 'the same save again returns the same reference');
    const branch = await client.callTool({ name: 'save', arguments: { module: 'tests/host-seam/branch.js', branch: 1 } });
    ok(branch.structuredContent?.revision === 1 && branch.structuredContent.drawingId !== first.structuredContent.drawingId, 'save with branch starts a new drawing');
    const list = await client.callTool({ name: 'list', arguments: {} });
    ok(/3 of 48 pages drawn/.test(words(list)), 'list lists the book');
    const read = await client.callTool({ name: 'read', arguments: { page: 2, source: true } });
    ok(/"revision": 2/.test(words(read)) && /test pass 2/.test(words(read)), 'read shows a page and, asked, its source as text');
    const snap = await client.callTool({ name: 'snapshot', arguments: { drawing: first.structuredContent.drawingId } });
    ok(snap.structuredContent?.protocol === 'sketchbook.drawing/1' && snap.structuredContent.revision === 2 && JSON.stringify(snap.structuredContent.reference) === JSON.stringify(second.structuredContent), 'snapshot gives the drawing\'s latest state and its reference');
    const other = await client.callTool({ name: 'snapshot', arguments: { protocol: 'sketchbook.drawing/9' } });
    ok(other.isError && /does not know/.test(words(other)), 'snapshot refuses a protocol it does not speak');
    const sneaky = await client.callTool({ name: 'save', arguments: { module: 'tests/hostile-fetch.js', title: '--unsafe' } });
    ok(sneaky.isError && /may not start with "-"/.test(words(sneaky)), 'no argument can pass itself off as a flag (a title of --unsafe is refused)');
    const hostile = await client.callTool({ name: 'save', arguments: { module: 'tests/hostile-fetch.js' } });
    ok(hostile.isError && /sandbox: fetch is not defined/.test(words(hostile)), 'a hostile module is refused by the sandbox');
    const escape = await client.callTool({ name: 'preview', arguments: { module: 'book.mjs' } });
    ok(escape.isError && /not allowed/.test(words(escape)), 'a module outside what the sandbox allows is refused');
    const extra = await client.callTool({ name: 'list', arguments: { book: '/elsewhere' } });
    ok(extra.isError && /takes no arguments, not book/.test(words(extra)), 'no tool can choose another book');
    const unknown = await client.callTool({ name: 'write', arguments: {} });
    ok(unknown.isError && /no tool called write/.test(words(unknown)), 'a seventh tool does not exist');
    ok(JSON.parse(await readFile(join(book, 'book.json'), 'utf8')).pages.length === 3, 'refused calls saved nothing');
    await client.close();
  }

  console.log('the book from --book');
  {
    const client = await connect(['--book', book]);
    const list = await client.callTool({ name: 'list', arguments: {} });
    ok(!list.isError && /3 of 48/.test(words(list)), '--book DIR sets the book');
    await client.close();
  }
} finally {
  await rm(tmp, { recursive: true, force: true });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
