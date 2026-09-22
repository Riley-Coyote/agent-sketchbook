/* One compilation contract for the CLI, browser sandbox and trusted atelier.
 * Keep this function self-contained: sandboxes evaluate its source locally. */
export function compilePage(page) {
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
    return { ops, meta: { title: page.title, date: page.date, note: page.note, refs: page.refs, seed: page.seed, page: page.page, surface: page.surface, motion: { frames: m.frames, fps, ...(m.poster !== undefined ? { poster: m.poster } : {}) } } };
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
  return { ops, meta: { title: page.title, date: page.date, note: page.note, refs: page.refs, seed: page.seed, page: page.page, surface: page.surface, ...(passes ? { passes } : {}) } };
}
