/* tests/renderer.mjs — node tests/renderer.mjs
 * The renderer a host pins (docs/host-seam.md, "Pinning the renderer"):
 * renderer.manifest.json names exactly the files <sketch-page> loads, with
 * sizes and digests that match them; a script that changes without the
 * rendererVersion going up is caught; `book.mjs renderer` prints and checks
 * the manifest; and the host's checker, examples/host-seam/verify-renderer.mjs,
 * passes on the renderer laid out as a host keeps it and fails on one changed
 * byte, a missing file or an extra script. No browser. Throwaway copies live in
 * a temp folder; nothing in this folder is changed.
 */

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { checkRenderer, rendererManifest, rendererVersionRule, RENDERER_PROTOCOL, RENDERER_MANIFEST } from '../host-seam.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VERIFY = resolve(ROOT, 'examples/host-seam/verify-renderer.mjs');
const run = promisify(execFile);
let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log(`  ok   ${name}`); } else { fail++; console.log(`  FAIL ${name}`); } };
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const node = (file, args, cwd = ROOT) => run(process.execPath, [file, ...args], { cwd }).then((r) => ({ code: 0, ...r }), (e) => ({ code: e.code, stdout: e.stdout || '', stderr: e.stderr || '' }));
const tmp = await mkdtemp(join(tmpdir(), 'renderer-test-'));

/* The renderer laid out as a host keeps it: the files and the manifest, nothing else. */
async function hostFolder(name, manifest) {
  const dir = join(tmp, name);
  await mkdir(join(dir, 'fonts'), { recursive: true });
  for (const f of manifest.files) await cp(resolve(ROOT, f.path), join(dir, f.path));
  await cp(resolve(ROOT, RENDERER_MANIFEST), join(dir, RENDERER_MANIFEST));
  return dir;
}
/* One byte changed, inside the file's opening comment, so the script still runs. */
async function changeOneByte(file) {
  const bytes = await readFile(file);
  const at = bytes.indexOf('the hand');
  bytes[at] = bytes[at] === 0x74 ? 0x54 : 0x74;   // t <-> T
  await writeFile(file, bytes);
}

try {
  const manifest = await rendererManifest(ROOT);
  const scripts = manifest.files.filter((f) => f.kind === 'script');
  const fonts = manifest.files.filter((f) => f.kind === 'font');

  console.log('the manifest');
  {
    ok(manifest.protocol === RENDERER_PROTOCOL && Number.isInteger(manifest.rendererVersion) && manifest.rendererVersion >= 1, `protocol ${manifest.protocol}, rendererVersion ${manifest.rendererVersion}`);
    ok(manifest.entry === 'sketch-page.js' && manifest.element === 'sketch-page' && manifest.feed === 'ops', 'entry sketch-page.js, element sketch-page, fed through ops');
    const entry = await readFile(resolve(ROOT, manifest.entry), 'utf8');
    ok(/customElements\.define\('sketch-page',/.test(entry) && /\bset ops\(v\)/.test(entry), 'the entry defines <sketch-page> and its ops property');
    ok(manifest.files.length === 8 && scripts.length === 4 && fonts.length === 4, `eight files: ${scripts.length} scripts and ${fonts.length} fonts`);
    ok(scripts.every((f) => f.license === 'private' && !('licenseFile' in f)), 'scripts are private (the repository LICENSE)');
    const texts = await Promise.all(fonts.map((f) => readFile(resolve(ROOT, f.licenseFile ?? 'none'), 'utf8').catch(() => '')));
    ok(fonts.every((f, i) => f.license === 'OFL-1.1' && /SIL OPEN FONT LICENSE Version 1\.1/i.test(texts[i])), 'fonts are OFL-1.1, each naming its licence text, which is there');
    ok(manifest.files.every((f) => Object.keys(f).every((k) => ['path', 'bytes', 'sha256', 'kind', 'license', 'licenseFile'].includes(k))), 'every entry holds only path, bytes, sha256, kind, license (and a font its licenseFile)');
    const { files, problems } = await checkRenderer(ROOT, manifest);
    ok(!problems.length && files.every((f) => f.state === 'ok'), `every file matches its size and sha256${problems.length ? `: ${problems.join('; ')}` : ''}`);
  }

  console.log('what the renderer loads');
  {
    /* Static imports of each script, resolved against it. The four import only each
     * other; nothing is imported at run time; the only URLs the engine resolves are
     * the fonts, and the only fetch is <sketch-page>'s src attribute. */
    const names = new Set(scripts.map((f) => f.path));
    const edges = {};
    let dynamic = 0, urls = 0, fetches = 0;
    for (const f of scripts) {
      const text = await readFile(resolve(ROOT, f.path), 'utf8');
      const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      const specifiers = [
        ...code.matchAll(/^\s*import\s+(?:[^;'"]*?\bfrom\s*)?['"]([^'"]+)['"]/gm),
        ...code.matchAll(/^\s*export\s+(?:\*(?:\s+as\s+\w+)?|\{[^}]*\})\s*from\s*['"]([^'"]+)['"]/gm),
      ].map((m) => m[1]);
      edges[f.path] = specifiers.map((s) => (s.startsWith('./') || s.startsWith('../') ? posix.normalize(posix.join(posix.dirname(f.path), s)) : s));
      dynamic += [...code.matchAll(/\bimport\s*\(/g)].length + [...code.matchAll(/\b(?:importScripts|Worker|SharedWorker)\s*\(/g)].length;
      urls += [...code.matchAll(/\bnew URL\(/g)].length;
      fetches += [...code.matchAll(/\bfetch\(/g)].length;
    }
    const all = Object.values(edges).flat();
    ok(all.length > 0 && all.every((p) => names.has(p)), `the four scripts import only each other (${Object.entries(edges).map(([k, v]) => `${k} → ${v.join(', ') || 'nothing'}`).join('; ')})`);
    const reached = new Set([manifest.entry]);
    for (let grew = true; grew;) { grew = false; for (const p of [...reached]) for (const q of edges[p] || []) if (!reached.has(q)) { reached.add(q); grew = true; } }
    ok(reached.size === names.size && [...names].every((n) => reached.has(n)), 'from the entry, the imports reach all four scripts');
    ok(dynamic === 0, 'no import(), worker or importScripts');
    const engine = await readFile(resolve(ROOT, 'mark-engine.js'), 'utf8');
    const fontFiles = [...engine.matchAll(/file: '\.\/(fonts\/[^']+)'/g)].map((m) => m[1]).sort();
    ok(JSON.stringify(fontFiles) === JSON.stringify(fonts.map((f) => f.path).sort()), `the fonts the engine loads are the manifest's four (${fontFiles.join(', ')})`);
    ok(urls === 1 && /new URL\(f\.file, import\.meta\.url\)/.test(engine), 'the one URL the engine builds is a font, beside mark-engine.js');
    const page = await readFile(resolve(ROOT, 'sketch-page.js'), 'utf8');
    ok(fetches === 1 && /const res = await fetch\(src\);/.test(page), 'the one fetch is <sketch-page>\'s src attribute, which a host does not use');
  }

  console.log('the version rule');
  {
    const bumped = (m, changes, version = m.rendererVersion) => ({ ...m, rendererVersion: version, files: m.files.map((f) => (changes[f.path] ? { ...f, sha256: changes[f.path] } : f)) });
    const other = '0'.repeat(64);
    ok(rendererVersionRule(manifest, manifest).ok, 'nothing changed: same version is right');
    const silent = rendererVersionRule(manifest, bumped(manifest, { 'mark-engine.js': other }));
    ok(!silent.ok && silent.changed.join() === 'mark-engine.js', 'a script changed without the version going up is caught, by name');
    ok(rendererVersionRule(manifest, bumped(manifest, { 'mark-engine.js': other }, manifest.rendererVersion + 1)).ok, 'the same change with the version up passes');
    ok(!rendererVersionRule(manifest, { ...manifest, files: manifest.files.filter((f) => f.path !== 'validate.js') }).ok, 'a script taken away without the version going up is caught');
    ok(rendererVersionRule(manifest, bumped(manifest, { 'fonts/inter.woff': other })).ok, 'the rule is about scripts: a font alone does not require it');
    /* Against the manifest where this branch left the main line, if it has one. */
    let base = null, why = '';
    try {
      const mergeBase = (await run('git', ['merge-base', 'HEAD', 'origin/main'], { cwd: ROOT })).stdout.trim();
      try { base = { at: mergeBase.slice(0, 7), manifest: JSON.parse((await run('git', ['show', `${mergeBase}:${RENDERER_MANIFEST}`], { cwd: ROOT })).stdout) }; }
      catch { why = `${RENDERER_MANIFEST} is not there yet at the merge base with origin/main (${mergeBase.slice(0, 7)})`; }
    } catch { why = 'no merge base with origin/main here'; }
    if (base) {
      const r = rendererVersionRule(base.manifest, manifest);
      ok(r.ok, `against ${base.at} (merge base with origin/main): ${r.changed.length ? `${r.changed.join(', ')} changed and the version went ${base.manifest.rendererVersion} → ${manifest.rendererVersion}` : 'no script changed'}`);
    } else console.log(`  skip against the main line: ${why}`);
  }

  console.log('book.mjs renderer');
  {
    const book = resolve(ROOT, 'book.mjs');
    const check = await node(book, ['renderer', '--check']);
    ok(check.code === 0 && /^renderer \d+: all 8 files match renderer\.manifest\.json$/m.test(check.stdout) && check.stdout.trim().split('\n').length === 9, '--check passes: one line per file and the verdict');
    const json = await node(book, ['renderer', '--json']);
    ok(json.code === 0 && JSON.stringify(JSON.parse(json.stdout)) === JSON.stringify(manifest), '--json prints the manifest');
    const unknown = await node(book, ['renderer', '--check', '--strict']);
    ok(unknown.code === 1 && /not --strict; nothing was done/.test(unknown.stderr) && !unknown.stdout, 'an unknown flag is refused');
    const both = await node(book, ['renderer', '--json', '--check']);
    ok(both.code === 1 && /choose one of --json or --check/.test(both.stderr), '--json and --check together are refused');
    const valueless = await node(book, ['renderer', '--check', '--book']);
    ok(valueless.code === 1 && /--book needs a value/.test(valueless.stderr), 'a value flag with no value is refused');
    /* The command checks the folder it lives in: a copy of the tool with one byte of
     * the engine changed, and one with a font gone. */
    for (const [name, spoil, expect] of [
      ['changed', (d) => changeOneByte(join(d, 'mark-engine.js')), /differs: mark-engine\.js \(60476 bytes, sha256 [0-9a-f]{64}; the manifest has 60476 bytes, sha256 3862c4b7/],
      ['missing', (d) => rm(join(d, 'fonts/inter.woff')), /missing: fonts\/inter\.woff/],
    ]) {
      const dir = join(tmp, `tool-${name}`);
      await mkdir(dir);
      for (const e of await readdir(ROOT)) if (/\.(m?js)$/.test(e) || e === 'fonts' || e === RENDERER_MANIFEST) await cp(resolve(ROOT, e), join(dir, e), { recursive: true });
      await spoil(dir);
      const r = await node(join(dir, 'book.mjs'), ['renderer', '--check'], dir);
      ok(r.code === 1 && expect.test(r.stderr) && r.stderr.trim().split('\n').length === 2, `--check fails, naming the one ${name} file`);
    }
  }

  console.log('verify-renderer.mjs');
  {
    const good = await hostFolder('host', manifest);
    const pass1 = await node(VERIFY, [good]);
    ok(pass1.code === 0 && /^verdict: pass — all 8 files match renderer \d+/m.test(pass1.stdout) && (pass1.stdout.match(/^ok {7}/gm) || []).length === 8, 'passes on the renderer laid out as a host keeps it');
    const kept = join(tmp, 'kept.manifest.json');
    await cp(resolve(ROOT, RENDERER_MANIFEST), kept);
    await rm(join(good, RENDERER_MANIFEST));
    ok((await node(VERIFY, [good, '--manifest', kept])).code === 0, 'passes with the manifest kept apart, by --manifest');
    const changed = await hostFolder('host-changed', manifest);
    await changeOneByte(join(changed, 'mark-engine.js'));
    const r1 = await node(VERIFY, [changed]);
    ok(r1.code === 1 && /^DIFFERS  mark-engine\.js /m.test(r1.stdout) && /^verdict: FAIL — 7 of 8/m.test(r1.stdout), 'fails on one changed byte, naming the file');
    const fontChanged = await hostFolder('host-font', manifest);
    const fontBytes = await readFile(join(fontChanged, 'fonts/inter.woff'));
    fontBytes[fontBytes.length - 1] ^= 1;
    await writeFile(join(fontChanged, 'fonts/inter.woff'), fontBytes);
    ok((await node(VERIFY, [fontChanged])).code === 1, 'fails on one changed byte of a font');
    const missing = await hostFolder('host-missing', manifest);
    await rm(join(missing, 'validate.js'));
    const r2 = await node(VERIFY, [missing]);
    ok(r2.code === 1 && /^MISSING  validate\.js$/m.test(r2.stdout), 'fails on a missing file');
    const extra = await hostFolder('host-extra', manifest);
    await writeFile(join(extra, 'helper.js'), 'export {};\n');
    const r3 = await node(VERIFY, [extra]);
    ok(r3.code === 1 && /^EXTRA    helper\.js/m.test(r3.stdout) && /8 of 8 files match.*1 extra script/.test(r3.stdout), 'fails on an extra script beside the renderer');
    const whole = await node(VERIFY, [ROOT]);
    ok(whole.code === 1 && (whole.stdout.match(/^ok {7}/gm) || []).length === 8 && /^EXTRA    page-program\.js/m.test(whole.stdout), 'on this whole folder: all 8 match, and the other scripts here are refused as extra');
    const strayManifest = join(tmp, 'outside.manifest.json');
    await writeFile(strayManifest, JSON.stringify({ ...manifest, files: [...manifest.files, { path: '../secret.js', bytes: 1, sha256: '0'.repeat(64), kind: 'script', license: 'private' }] }));
    ok((await node(VERIFY, [good, '--manifest', strayManifest])).code === 2, 'a manifest naming a file outside the folder is refused');
    ok((await node(VERIFY, [good, '--manifest'])).code === 2 && (await node(VERIFY, [good, '--quiet'])).code === 2 && (await node(VERIFY, [])).code === 2, 'no folder, an unknown flag, or --manifest with no file is refused');
    const own = await readFile(VERIFY, 'utf8');
    ok([...own.matchAll(/from '([^']+)'/g)].every((m) => m[1].startsWith('node:')), 'the checker imports only Node\'s own modules');
    ok(sha(await readFile(join(good, 'mark-engine.js'))) === manifest.files.find((f) => f.path === 'mark-engine.js').sha256, 'the host copy is byte for byte the files here');
  }
} finally {
  await rm(tmp, { recursive: true, force: true });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
