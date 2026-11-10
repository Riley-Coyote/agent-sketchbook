/** Purpose-built motor/inspection client for drawing live. */
import { readFile, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { compilePage, paperLine, paperName, today } from './page-program.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
const HELP = `Drawing live: start the server first, with node book.mjs serve.
Through the book these are node book.mjs live <command>; directly, node studio.mjs <command>.

  status [--full]
  actions --file actions.json [--revision N]
  inspect --out detail.png [--x X --y Y --w W --h H --scale 1]
  export --out drawing.png [--scale 1]
  new --title "Study" [--width 1100 --height 780] [--paper white --tooth 0.65 --seed 17]
    a new live sheet: any paper a page names (night, black, white, cream, grey, slate, kraft or '#rrggbb'),
    with tooth from 0 to 1. A live sheet holds dry media only: graphite, charcoal, chalk, the stump and erasers.
  page --out pages/name.js [--title T] [--note N] [--book DIR]
    writes the live sheet as a page module, a pass for each review, and prints how to save it to the book
  save [--name "Checkpoint"]
  saves
  load --id SAVE_ID
  lessons

Every command accepts --url http://127.0.0.1:4194.
actions.json may be an action array or {revision,actions}; --file - reads stdin.
The server rejects stale revisions instead of overwriting another drawing.
`;

/* A sheet's gestures as a page module: one pass for the marks before each
 * review (reviews with nothing new between them share a pass), and the marks
 * after the last review as a final pass. A review written before any mark is
 * the first pass's note. Gestures are frozen data, one per line, as resume
 * writes them. */
function pageModule(drawing, { title, note }) {
  const ops = drawing.ops, groups = [];
  for (const review of [...drawing.reviews || []].sort((a, b) => a.at - b.at)) {
    const at = Math.min(review.at, ops.length);
    if (groups.at(-1)?.at === at) groups.at(-1).reviews.push(review); else groups.push({ at, reviews: [review] });
  }
  const joined = (reviews, key) => reviews.map((review) => review[key].trim()).filter(Boolean).join('\n\n');
  const before = groups[0]?.at === 0 ? groups.shift().reviews : [];
  const passes = [];
  let start = 0;
  for (const { at, reviews } of groups) {
    const region = reviews.findLast((review) => review.region)?.region;
    passes.push({ end: at, review: { observation: joined(reviews, 'observation'), change: joined(reviews, 'lesson'), next: joined(reviews, 'next'), ...(region ? { region: [region.x, region.y, region.w, region.h] } : {}) } });
  }
  if (!passes.length || passes.at(-1).end < ops.length) passes.push({ end: ops.length });
  const data = passes.map((pass, i) => {
    const entry = { name: `Pass ${i + 1}`, note: i === 0 ? before.flatMap((review) => [review.observation, review.lesson, review.next]).map((text) => text.trim()).filter(Boolean).join('\n\n') : '', ...(pass.review ? { review: pass.review } : {}), ops: ops.slice(start, pass.end) };
    start = pass.end;
    return entry;
  });
  const frozen = '[\n' + data.map(({ ops, ...entry }) => `${JSON.stringify(entry).slice(0, -1)},"ops":[\n${ops.map((op) => JSON.stringify(op)).join(',\n')}\n]}`).join(',\n') + '\n]';
  return `// Drawn live, gesture by gesture: "${drawing.title.replace(/[\r\n]+/g, ' ')}". Earlier marks are frozen data.
// Add a new pass; do not change these checkpoints when continuing.
// BEGIN FROZEN MARKS (one operation per line; fold this block while editing)
const saved = ${frozen};
// END FROZEN MARKS — add your next pass below
const passes = saved.map(({ops, ...entry}) => ({...entry, build: () => ops}));
// passes.push({name: 'Next pass', note: 'What changed after looking', build: () => [...]});
export default {
  title: ${JSON.stringify(title)}, date: ${JSON.stringify(today())},
  note: ${JSON.stringify(note)}, page: ${JSON.stringify(drawing.page)},
  ${paperLine(drawing.surface)}
  passes, build: () => passes.flatMap(pass => pass.build())
};
`;
}
const paperWords = (surface) => surface.kind === 'ink' ? `${paperName(surface.paper)} paper, tooth ${surface.tooth}, seed ${surface.seed}` : `${surface.paper} graphite paper, tooth ${surface.tooth}, seed ${surface.seed}`;
const shell = (word) => /^[\w@%+=:,./-]+$/.test(word) ? word : `'${word.replace(/'/g, `'\\''`)}'`;

function parseArgs(args) {
  const command = args.shift() || 'help', options = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--full') options.full = true;
    else if (args[i].startsWith('--') && args[i + 1] !== undefined && !args[i + 1].startsWith('--')) options[args[i].slice(2)] = args[++i];
    else throw new Error(`Unexpected argument: ${args[i]}`);
  }
  return { command, options };
}
async function atomicOutput(path, bytes) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try { await writeFile(temporary, bytes); await rename(temporary, path); }
  finally { await rm(temporary, { force: true }); }
}

try {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (['help', '--help', '-h'].includes(command)) process.stdout.write(HELP);
  else {
    const accepted = {
      status: ['full'], actions: ['file', 'revision'], inspect: ['out', 'x', 'y', 'w', 'h', 'scale'],
      export: ['out', 'scale'], new: ['title', 'width', 'height', 'paper', 'tooth', 'seed', 'revision'], page: ['out', 'title', 'note', 'book'],
      save: ['name', 'revision'], load: ['id', 'revision'], saves: [], lessons: [],
    };
    for (const key of Object.keys(options)) if (key !== 'url' && !accepted[command]?.includes(key)) throw new Error(`Unsupported option for ${command}: --${key}`);
    const base = new URL(options.url || 'http://127.0.0.1:4194');
    if (base.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname) || base.username || base.password || base.pathname !== '/' || base.search || base.hash) throw new Error('--url must be a loopback http address, such as http://127.0.0.1:4194');
    const request = async (path, body, method = 'POST') => {
      let response;
      try {
        response = await fetch(new URL(path, base), { ...(body === undefined ? {} : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), signal: AbortSignal.timeout(60_000) });
      } catch (error) { throw new Error(`cannot reach the live sheet at ${base.origin} (${error.message}); start it with node book.mjs serve`); }
      if (!response.ok) {
        const problem = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(`${response.status}: ${problem.error}${problem.revision === undefined ? '' : ` (current revision ${problem.revision}; inspect current state before retrying)`}`);
      }
      return response;
    };
    const getSession = async () => (await request('/api/session')).json();
    const revision = async fallback => {
      const value = options.revision === undefined ? (fallback === undefined ? (await getSession()).revision : fallback) : Number(options.revision);
      if (!Number.isSafeInteger(value) || value < 0) throw new Error('Revision must be a non-negative integer');
      return value;
    };
    const summary = state => ({ url: base.origin, revision: state.revision, title: state.drawing.title, page: state.drawing.page, surface: state.drawing.surface, marks: state.drawing.ops.length, reviews: state.drawing.reviews?.length || 0, ...(state.save ? { save: state.save } : {}) });
    let result;
    if (command === 'status') { const state = await getSession(); result = options.full ? state : summary(state); }
    else if (command === 'actions') {
      if (!options.file) throw new Error('actions requires --file (use - for stdin)');
      const content = options.file === '-' ? await readFile('/dev/stdin', 'utf8') : await readFile(resolve(options.file), 'utf8');
      const input = JSON.parse(content), actions = Array.isArray(input) ? input : input.actions;
      if (!Array.isArray(actions)) throw new Error('Action file must be an array or {revision,actions}');
      result = summary(await (await request('/api/actions', { revision: await revision(input.revision), actions })).json());
    } else if (['inspect', 'export'].includes(command)) {
      if (!options.out) throw new Error(`${command} requires --out file.png`);
      const search = new URLSearchParams();
      for (const key of command === 'inspect' ? ['x', 'y', 'w', 'h', 'scale'] : ['scale']) if (options[key] !== undefined) search.set(key, options[key]);
      const response = await request(`/api/inspect?${search}`), path = resolve(options.out);
      await atomicOutput(path, Buffer.from(await response.arrayBuffer()));
      result = { path, revision: Number(response.headers.get('x-sketchbook-revision')), region: JSON.parse(response.headers.get('x-sketchbook-region')) };
    } else if (command === 'new') {
      if ((options.width === undefined) !== (options.height === undefined)) throw new Error('Provide both --width and --height');
      const surface = { kind: 'ink', version: 2, paper: options.paper ?? 'white', tooth: options.tooth === undefined ? 0.65 : Number(options.tooth), seed: options.seed === undefined ? 17 : Number(options.seed) };
      result = summary(await (await request('/api/new', { revision: await revision(), ...(options.title ? { title: options.title } : {}), ...(options.width === undefined ? {} : { page: { w: Number(options.width), h: Number(options.height) } }), surface })).json());
    } else if (command === 'page') {
      if (!options.out?.endsWith('.js')) throw new Error('page needs --out pages/name.js');
      const out = resolve(options.out);
      // book.mjs write runs only modules inside the sketchbook's folder.
      if (!out.startsWith(ROOT + sep) || relative(ROOT, out).split(sep)[0] === 'book') throw new Error(`a page module lives inside the sketchbook's folder, ${ROOT}, outside book/: book.mjs write runs only those`);
      const { drawing } = await getSession();
      if (drawing.active) throw new Error('the tool is still on the paper; lift it before making the sheet a page');
      if (!drawing.ops.length) throw new Error('this live sheet has no marks yet; draw before making it a page');
      const note = (options.note ?? drawing.reviews?.at(-1)?.observation ?? '').trim();
      if (!note) throw new Error('a page needs a note: give --note, or record a review with an observation first');
      await mkdir(dirname(out), { recursive: true });
      try { await writeFile(out, pageModule(drawing, { title: options.title ?? drawing.title, note }), { flag: 'wx' }); }
      catch (error) { if (error.code === 'EEXIST') throw new Error(`${options.out} already exists; nothing was overwritten. Choose another name.`); throw error; }
      // The module must build to exactly this sheet's gestures, op by op, or it is not kept.
      let built, differs;
      try {
        built = compilePage((await import(`${pathToFileURL(out)}?${randomUUID()}`)).default);
        differs = Array.from({ length: Math.max(built.ops.length, drawing.ops.length) }, (_, i) => i).find((i) => JSON.stringify(built.ops[i]) !== JSON.stringify(drawing.ops[i]));
      } catch (error) { await rm(out, { force: true }); throw error; }
      if (differs !== undefined) { await rm(out, { force: true }); throw new Error(`the page module did not build to this sheet's marks (from mark ${differs}), so it was not kept`); }
      const book = options.book ? resolve(options.book) : resolve(ROOT, 'book');
      // Paths as book.mjs prints them: relative here, absolute when they climb out.
      const where = (path) => { const near = relative(process.cwd(), path); return !near ? '.' : near.startsWith('..') ? path : near; };
      const write = ['node', where(resolve(ROOT, 'book.mjs')), 'write', where(out), '--book', where(book)].map(shell).join(' ');
      process.stdout.write(`${where(out)}: "${built.meta.title}", ${built.ops.length} marks in ${built.meta.passes.length} pass${built.meta.passes.length === 1 ? '' : 'es'} on ${paperWords(drawing.surface)}. Nothing is in the book yet; to save it as a page:\n  ${write}\n`);
    } else if (command === 'save') result = summary(await (await request('/api/save', { revision: await revision(), ...(options.name ? { name: options.name } : {}) })).json());
    else if (command === 'load') {
      if (!options.id) throw new Error('load requires --id');
      result = summary(await (await request('/api/load', { revision: await revision(), id: options.id })).json());
    } else if (command === 'saves') result = await (await request('/api/saves')).json();
    else if (command === 'lessons') result = await (await request('/api/lessons')).json();
    else throw new Error(`Unknown command: ${command}\n${HELP}`);
    if (result !== undefined) process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  }
} catch (error) {
  process.stderr.write(`Drawing live: ${error.message}\n`);
  process.exitCode = 1;
}
