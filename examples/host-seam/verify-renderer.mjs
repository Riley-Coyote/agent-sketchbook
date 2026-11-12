#!/usr/bin/env node
/* examples/host-seam/verify-renderer.mjs — a host's check of the renderer.
 *
 *   node verify-renderer.mjs <folder> [--manifest <file>]
 *
 * The folder holds the sketchbook's renderer as a host loads it:
 * sketch-page.js, mark-engine.js, material-engine.js and validate.js side by
 * side, and the four fonts in fonts/. The manifest (renderer.manifest.json;
 * by default the one in the folder) names each file with its size and
 * SHA-256. Every file is read and recomputed, one line each, then a verdict.
 * It exits 0 only when every file matches and the folder's top level holds
 * no .js file the manifest doesn't name; 1 on any mismatch; 2 when it was
 * asked wrongly. Node's own modules only, so a host can copy this one file.
 */

import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const PROTOCOL = 'sketchbook.renderer/1';
/* A file's place in the folder: relative, plain names, no "..", nothing hidden. */
const PLAIN_PATH = /^(?:[a-z0-9][a-z0-9._-]*\/)*[a-z0-9][a-z0-9._-]*$/i;

function refuse(message) {
  console.error(`${message}\nusage: node verify-renderer.mjs <folder> [--manifest <file>]`);
  process.exit(2);
}

const args = process.argv.slice(2);
let folder, manifestPath;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--manifest') {
    if (args[i + 1] === undefined || args[i + 1].startsWith('--')) refuse('--manifest needs a file; nothing was checked');
    manifestPath = args[++i];
  } else if (args[i].startsWith('-')) refuse(`unknown option ${args[i]}; nothing was checked`);
  else if (folder !== undefined) refuse(`one folder only, not ${folder} and ${args[i]}`);
  else folder = args[i];
}
if (folder === undefined) refuse('which folder?');
folder = resolve(folder);
manifestPath = resolve(manifestPath ?? join(folder, 'renderer.manifest.json'));

let manifest;
try { manifest = JSON.parse(await readFile(manifestPath, 'utf8')); } catch (error) { refuse(`cannot read the manifest ${manifestPath}: ${error.message}`); }
if (manifest?.protocol !== PROTOCOL) refuse(`the manifest's protocol is ${JSON.stringify(manifest?.protocol)}, not ${PROTOCOL}`);
const files = Array.isArray(manifest.files) ? manifest.files : [];
for (const f of files) {
  if (typeof f?.path !== 'string' || !PLAIN_PATH.test(f.path)) refuse(`the manifest names a file outside the folder: ${JSON.stringify(f?.path)}`);
  if (!Number.isInteger(f.bytes) || !/^[0-9a-f]{64}$/.test(f.sha256)) refuse(`the manifest's entry for ${f.path} has no size or sha256`);
}
if (!files.length || !files.some((f) => f.path === manifest.entry)) refuse(`the manifest's entry ${JSON.stringify(manifest.entry)} is not among its files`);

let bad = 0;
for (const f of files) {
  let bytes;
  try { bytes = await readFile(join(folder, f.path)); } catch {
    bad++;
    console.log(`MISSING  ${f.path}`);
    continue;
  }
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (bytes.length === f.bytes && sha256 === f.sha256) console.log(`ok       ${f.path}  ${bytes.length} bytes  sha256 ${sha256}`);
  else {
    bad++;
    console.log(`DIFFERS  ${f.path}  ${bytes.length} bytes (manifest: ${f.bytes})  sha256 ${sha256} (manifest: ${f.sha256})`);
  }
}
const named = new Set(files.map((f) => f.path));
const extra = (await readdir(folder, { withFileTypes: true }))
  .filter((e) => e.name.endsWith('.js') && !named.has(e.name)).map((e) => e.name).sort();
for (const name of extra) console.log(`EXTRA    ${name}  (a script the manifest does not name)`);

const matched = files.length - bad;
if (bad || extra.length) {
  console.log(`verdict: FAIL — ${matched} of ${files.length} files match renderer ${manifest.rendererVersion}${extra.length ? `; ${extra.length} extra script${extra.length > 1 ? 's' : ''}` : ''}`);
  process.exit(1);
}
console.log(`verdict: pass — all ${files.length} files match renderer ${manifest.rendererVersion}, and no other script is beside them`);
