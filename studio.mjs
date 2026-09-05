/** Purpose-built motor/inspection client for the local sketchbook studio. */
import { readFile, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const HELP = `Sketchbook studio — start node studio-server.mjs first.

  node studio.mjs status [--full]
  node studio.mjs actions --file actions.json [--revision N]
  node studio.mjs inspect --out detail.png [--x X --y Y --w W --h H --scale 1]
  node studio.mjs export --out painting.png [--scale 1]
  node studio.mjs new --title "Study" [--width 1100 --height 780 --paper white]
  node studio.mjs save [--name "Checkpoint"]
  node studio.mjs saves
  node studio.mjs load --id SAVE_ID
  node studio.mjs lessons

Every command accepts --url http://127.0.0.1:4194.
actions.json may be an action array or {revision,actions}; --file - reads stdin.
The server rejects stale revisions instead of overwriting another drawing.
`;

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
      export: ['out', 'scale'], new: ['title', 'width', 'height', 'paper', 'tooth', 'seed', 'revision'],
      save: ['name', 'revision'], load: ['id', 'revision'], saves: [], lessons: [],
    };
    for (const key of Object.keys(options)) if (key !== 'url' && !accepted[command]?.includes(key)) throw new Error(`Unsupported option for ${command}: --${key}`);
    const base = new URL(options.url || 'http://127.0.0.1:4194');
    if (base.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname) || base.username || base.password || base.pathname !== '/' || base.search || base.hash) throw new Error('--url must be an HTTP loopback studio address');
    const request = async (path, body, method = 'POST') => {
      let response;
      try {
        response = await fetch(new URL(path, base), { ...(body === undefined ? {} : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), signal: AbortSignal.timeout(60_000) });
      } catch (error) { throw new Error(`Cannot reach studio at ${base.origin}: ${error.message}`); }
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
      if (!options.paper && (options.tooth !== undefined || options.seed !== undefined)) throw new Error('--tooth and --seed require --paper');
      result = summary(await (await request('/api/new', { revision: await revision(), ...(options.title ? { title: options.title } : {}), ...(options.width === undefined ? {} : { page: { w: Number(options.width), h: Number(options.height) } }), ...(options.paper ? { surface: { version: 1, paper: options.paper, tooth: options.tooth === undefined ? 0.65 : Number(options.tooth), seed: options.seed === undefined ? 17 : Number(options.seed) } } : {}) })).json());
    } else if (command === 'save') result = summary(await (await request('/api/save', { revision: await revision(), ...(options.name ? { name: options.name } : {}) })).json());
    else if (command === 'load') {
      if (!options.id) throw new Error('load requires --id');
      result = summary(await (await request('/api/load', { revision: await revision(), id: options.id })).json());
    } else if (command === 'saves') result = await (await request('/api/saves')).json();
    else if (command === 'lessons') result = await (await request('/api/lessons')).json();
    else throw new Error(`Unknown command: ${command}\n${HELP}`);
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  }
} catch (error) {
  process.stderr.write(`Studio: ${error.message}\n`);
  process.exitCode = 1;
}
