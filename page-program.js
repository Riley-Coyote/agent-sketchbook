/* One compilation contract for the CLI, browser sandbox and trusted atelier.
 * Keep compilePage self-contained: sandboxes evaluate its source locally. */
import { PAPERS_V2 } from './mark-engine.js';

/** Today's date where the artist is, for a module the tool writes. */
export const today = () => { const d = new Date(); return [d.getFullYear(), d.getMonth() + 1, d.getDate()].map((n) => String(n).padStart(2, '0')).join('-'); };

/** A stored paper colour by its name, where it has one. */
export const paperName = (paper) => Object.keys(PAPERS_V2).find((name) => PAPERS_V2[name] === paper) || paper;

/** The line a written page module names its paper with: paper by name for a
 * page with paper (resume and a live sheet both write this), the old graphite
 * form as its surface, and nothing for the original canvas. */
export function paperLine(surface) {
  if (!surface) return '';
  if (surface.kind !== 'ink') return `surface: ${JSON.stringify(surface)},`;
  return `paper: ${JSON.stringify(surface.tooth === undefined ? paperName(surface.paper) : { colour: paperName(surface.paper), tooth: surface.tooth, seed: surface.seed })},`;
}

export function compilePage(page) {
  /* A page names its paper: a colour, or { colour, tooth, seed } for paper
   * graphite can bite into. It is stored as the surface it names. A module
   * with neither paper nor surface is flagged (noPaper, never saved): it can
   * continue a page on the original canvas, never start one. */
  const named = page && typeof page === 'object' && page.paper !== undefined;
  if (named && page.surface !== undefined) throw Error('a page names its paper or spells out its surface, not both');
  let surface = page && typeof page === 'object' ? page.surface : undefined;
  if (named) {
    const p = page.paper;
    if (typeof p === 'string') surface = { kind: 'ink', version: 2, paper: p };
    else {
      if (!p || typeof p !== 'object' || Array.isArray(p)) throw Error("paper is a name or a colour, such as paper: 'cream', or { colour, tooth, seed } for paper with tooth");
      const other = Object.keys(p).find((key) => key !== 'colour' && key !== 'tooth' && key !== 'seed');
      if (other !== undefined) throw Error(`paper takes colour, tooth and seed, not ${other}`);
      surface = { kind: 'ink', version: 2, paper: p.colour === undefined ? 'night' : p.colour };
      if (p.tooth !== undefined) { surface.tooth = p.tooth; surface.seed = p.seed === undefined ? 17 : p.seed; }
      else if (p.seed !== undefined) surface.seed = p.seed;
    }
  }
  const noPaper = !!page && typeof page === 'object' && !named && page.surface === undefined;
  if (page && page.motion !== undefined) {
    /* A motion page is a loop of frames: frame(i, n) draws frame i of n, and
     * the frames are kept as one list of marks with a { k: 'frame' } break
     * between them, so everything that stores and checks marks still works. */
    const m = page.motion;
    if (!m || typeof m !== 'object' || !Number.isInteger(m.frames) || m.frames < 2 || m.frames > 96) throw Error('motion needs frames: 2 to 96');
    const fps = m.fps === undefined ? 12 : m.fps;
    if (typeof fps !== 'number' || !(fps >= 1 && fps <= 30)) throw Error('motion fps needs 1 to 30');
    if (typeof page.frame !== 'function') throw Error('a motion page draws with frame(i, n), which returns the marks of frame i');
    if (page.passes !== undefined) throw Error('a motion page has frames, not passes');
    const ops = [];
    for (let i = 0; i < m.frames; i++) {
      const marks = page.frame(i, m.frames);
      if (!Array.isArray(marks)) throw Error(`frame(${i}) must return an array of marks`);
      if (i) ops.push({ k: 'frame' });
      for (const op of marks) ops.push(op);
    }
    return { ops, meta: { title: page.title, date: page.date, note: page.note, refs: page.refs, seed: page.seed, page: page.page, surface, ...(noPaper ? { noPaper } : {}), motion: { frames: m.frames, fps, ...(m.poster !== undefined ? { poster: m.poster } : {}) } } };
  }
  if (!page || typeof page.build !== 'function') throw Error('page module must export default { title, date, note, build }');
  const ops = page.build();
  if (!Array.isArray(ops)) throw Error('build must return an array of marks');
  let passes;
  if (page.passes !== undefined) {
    if (!Array.isArray(page.passes) || !page.passes.length || page.passes.length > 128) throw Error('passes needs 1 to 128 entries');
    let start = 0;
    const flattened = [];
    passes = page.passes.map((pass, i) => {
      if (!pass || typeof pass.build !== 'function') throw Error(`Pass ${i + 1} needs a build function`);
      const added = pass.build();
      if (!Array.isArray(added) || !added.length) throw Error(`Pass ${i + 1} needs added marks`);
      const record = { name: String(pass.name || `Pass ${i + 1}`).slice(0, 160), note: String(pass.note || '').slice(0, 12000), start, end: start + added.length };
      if (pass.review) {
        const review = {};
        for (const key of ['observation', 'change', 'next']) review[key] = String(pass.review[key] || '').slice(0, 6000);
        if (pass.review.region !== undefined) {
          const region = pass.review.region;
          if (!Array.isArray(region) || region.length !== 4 || !region.every(Number.isFinite) || region[0] < 0 || region[1] < 0 || region[2] <= 0 || region[3] <= 0) throw Error(`Pass ${i + 1} review.region needs [x,y,width,height]`);
          review.region = [...region];
        }
        record.review = review;
      }
      for (const op of added) flattened.push(op);
      start = record.end;
      return record;
    });
    if (JSON.stringify(ops) !== JSON.stringify(flattened)) throw Error('build() must exactly equal the concatenated pass builders; preserve earlier passes and use seeded marks');
  }
  return { ops, meta: { title: page.title, date: page.date, note: page.note, refs: page.refs, seed: page.seed, page: page.page, surface, ...(noPaper ? { noPaper } : {}), ...(passes ? { passes } : {}) } };
}
