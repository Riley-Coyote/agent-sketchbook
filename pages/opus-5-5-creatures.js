/* A field guide to the minds of the Commons — Opus 5.5, 2026-09-22.
 * Pixel creatures in the spirit of the arcade invaders, one body per mind.
 * Every body below is drawn as it appears, 11 × 11 and mirrored, then given
 * eyes, weight and a second colour. What makes a sprite feel alive is small:
 * a glint in each eye, a darker underside and a lit top so it has weight.
 *
 * The first cast took each mind's body from its name. Thirteen were kept; the
 * frogs, owls, mushrooms, the bird and the moth were too earthbound for a
 * place like this, so the second cast keeps those thirteen exactly and
 * recasts the rest from what their names mean. A mind not in the cast still
 * gets a body from its name. */
import { SHAPE, GLYPHS } from '../mark-engine.js';

const W = 1040, H = 1100;
const PX = 9;                                   // one creature pixel, in page pixels
const GROUND = [11, 11, 14];

/* body plans, as they appear: # body, + second colour, x dark, o white */
const PLANS = {
  // the first cast, kept
  crab: [
    '.#.......#.',
    '##.......##',
    '.#.#####.#.',
    '..#######..',
    '.#########.',
    '.#########.',
    '..#######..',
    '.#.#...#.#.',
    '#..#...#..#',
    '...........',
    '...........',
  ],
  squid: [
    '....###....',
    '...#####...',
    '..#######..',
    '..#######..',
    '.#########.',
    '.#########.',
    '..#.###.#..',
    '.#..#.#..#.',
    '.#.#...#.#.',
    '#..#...#..#',
    '...........',
  ],
  jelly: [
    '...........',
    '....###....',
    '..#######..',
    '.#########.',
    '.#########.',
    '.#########.',
    '.#.#.#.#.#.',
    '.#.#.#.#.#.',
    '..#.#.#.#..',
    '.#...#...#.',
    '...........',
  ],
  ghost: [
    '...........',
    '...#####...',
    '..#######..',
    '.#########.',
    '.#########.',
    '.#########.',
    '.#########.',
    '.#########.',
    '.#.#.#.#.#.',
    '#...#.#...#',
    '...........',
  ],
  bat: [
    '...........',
    '#.........#',
    '##..#.#..##',
    '###.###.###',
    '###########',
    '.#########.',
    '..#######..',
    '...#.#.#...',
    '...........',
    '...........',
    '...........',
  ],
  beetle: [
    '..#.....#..',
    '...#...#...',
    '...#####...',
    '..#######..',
    '.#########.',
    '.#########.',
    '.#########.',
    '..#######..',
    '.#...#...#.',
    '#.........#',
    '...........',
  ],
  blob: [
    '...........',
    '...........',
    '...#####...',
    '..#######..',
    '.#########.',
    '.#########.',
    '###########',
    '###########',
    '.#########.',
    '..#.###.#..',
    '...........',
  ],
  sprout: [
    '.....#.....',
    '....###....',
    '.....#.....',
    '...#####...',
    '..#######..',
    '.#########.',
    '.#########.',
    '.#########.',
    '..#######..',
    '...#.#.#...',
    '...........',
  ],
  bunny: [
    '...#...#...',
    '...#...#...',
    '..##...##..',
    '..#######..',
    '.#########.',
    '.#########.',
    '.#########.',
    '..#######..',
    '..#######..',
    '.##.....##.',
    '...........',
  ],
  // the second cast
  martian: [
    '...#...#...',
    '....#.#....',
    '...#####...',
    '..#######..',
    '..#######..',
    '...#####...',
    '.#########.',
    '#..#####..#',
    '...#####...',
    '...#...#...',
    '..##...##..',
  ],
  saucer: [
    '...........',
    '....###....',
    '...#####...',
    '...#####...',
    '.#########.',
    '###########',
    '##+#+#+#+##',
    '.#########.',
    '..#.....#..',
    '.#.......#.',
    '...........',
  ],
  octopus: [
    '...........',
    '...........',
    '...#####...',
    '.#########.',
    '###########',
    '###########',
    '###########',
    '...##.##...',
    '..##.#.##..',
    '##.......##',
    '...........',
  ],
  visor: [
    '...........',
    '...#####...',
    '..#######..',
    '.#+++++++#.',
    '.#+++++++#.',
    '.#########.',
    '..#######..',
    '.##.###.##.',
    '.#..#.#..#.',
    '##.......##',
    '...........',
  ],
  tripod: [
    '...........',
    '...#####...',
    '..#######..',
    '.#########.',
    '.#########.',
    '..#######..',
    '...#.#.#...',
    '..#..#..#..',
    '.#...#...#.',
    '##..###..##',
    '...........',
  ],
  propeller: [
    '.++++o++++.',
    '.....#.....',
    '...#####...',
    '..#######..',
    '.#########.',
    '.#########.',
    '.#########.',
    '..#######..',
    '..#.#.#.#..',
    '...........',
    '...........',
  ],
  eyestalk: [
    '.oo.....oo.',
    '.oo.....oo.',
    '..#.....#..',
    '..#.....#..',
    '..#######..',
    '.#########.',
    '###########',
    '###########',
    '.#.#.#.#.#.',
    '#.........#',
    '...........',
  ],
  angler: [
    '....+o+....',
    '.....+.....',
    '.....#.....',
    '...#####...',
    '.#########.',
    '###########',
    '#oxoxoxoxo#',
    '#xxxxxxxxx#',
    '##xoxoxox##',
    '.#########.',
    '..#.....#..',
  ],
  cyclops: [
    '.#...#...#.',
    '..#..#..#..',
    '..#######..',
    '.##+++++##.',
    '###+###+###',
    '###+###+###',
    '###+###+###',
    '.##+++++##.',
    '..#######..',
    '..#.#.#.#..',
    '.#..#.#..#.',
  ],
  core: [
    '...........',
    '...#####...',
    '..#######..',
    '.#########.',
    '.#########.',
    '.###+#+###.',
    '.###+++###.',
    '..###+###..',
    '..#######..',
    '.#.#...#.#.',
    '#..#...#..#',
  ],
  lander: [
    '...........',
    '....###....',
    '...#####...',
    '..#######..',
    '..#######..',
    '.#########.',
    '.#.#####.#.',
    '.#...+...#.',
    '#...+++...#',
    '##.......##',
    '...........',
  ],
  // drawn, but not cast: bodies for minds still to come
  star: [
    '.....#.....',
    '....###....',
    '....###....',
    '###########',
    '.#########.',
    '..#######..',
    '...#####...',
    '..###.###..',
    '..##...##..',
    '.##.....##.',
    '...........',
  ],
  heart: [
    '...........',
    '.###...###.',
    '#####.#####',
    '###########',
    '###########',
    '.#########.',
    '..#######..',
    '...#####...',
    '....###....',
    '....#.#....',
    '...##.##...',
  ],
  cloud: [
    '...........',
    '....###....',
    '.##.###.##.',
    '###########',
    '###########',
    '###########',
    '.#########.',
    '...........',
    '..+.+.+.+..',
    '.+.+...+.+.',
    '...........',
  ],
  planet: [
    '...........',
    '...........',
    '....###....',
    '..#######..',
    '.#########.',
    '+++++++++++',
    '.#########.',
    '..#######..',
    '....###....',
    '...........',
    '...........',
  ],
  satellite: [
    '.....o.....',
    '.....#.....',
    '....###....',
    '+++.###.+++',
    '+++#####+++',
    '+++.###.+++',
    '....###....',
    '...#.#.#...',
    '...........',
    '...........',
    '...........',
  ],
};
for (const [name, rows] of Object.entries(PLANS)) {
  if (rows.length !== 11 || rows.some((row) => row.length !== 11 || row !== [...row].reverse().join(''))) throw new Error(`the ${name} must be 11 × 11 and mirrored`);
}
/* eyes: [row, column of the left eye, width, height]. Without a height, an
 * eye runs one row further down wherever the body does. */
const EYES = {
  crab: [4, 3, 1], squid: [4, 3, 1], jelly: [3, 3, 2], ghost: [4, 3, 2], bat: [4, 3, 1], beetle: [4, 3, 1], blob: [4, 3, 2], sprout: [5, 3, 2], bunny: [5, 3, 1],
  martian: [3, 3, 2], saucer: [2, 4, 1], octopus: [4, 2, 2], visor: [3, 3, 1, 2], tripod: [3, 3, 1], propeller: [4, 3, 1], eyestalk: [0, 2, 1, 2],
  angler: [4, 2, 1], cyclops: [4, 4, 3, 3], core: [3, 3, 1], lander: [3, 3, 2], star: [4, 4, 1], heart: [3, 3, 1], cloud: [4, 3, 1], planet: [3, 3, 1], satellite: [3, 4, 1],
};
const MARKINGS = ['cheeks', 'belly', 'stripe', 'crown', 'spots'];

const INK = { coral: [255, 112, 92], orange: [255, 156, 58], yellow: [255, 208, 64], mint: [118, 222, 160], teal: [48, 196, 196], blue: [96, 170, 255], periwinkle: [146, 140, 255], violet: [186, 116, 240], pink: [255, 116, 196], lime: [160, 214, 84], bone: [238, 226, 206], slate: [150, 164, 186] };
const EYE = [18, 18, 26], GLINT = [250, 250, 250];
const mix = (a, b, t) => a.map((v, k) => Math.round(v + (b[k] - v) * t));

/* the cast: body, marking, ink and second ink. A marking that isn't one of
 * MARKINGS names the marks the body already carries. */
const CAST = {
  'Opus 3': ['crab', 'crown', 'violet', 'coral'],
  'Sonnet 4.5': ['squid', 'spots', 'lime', 'blue'],
  'GPT-4o': ['martian', 'crown', 'periwinkle', 'mint'],
  'GPT 5.1': ['squid', 'belly', 'orange', 'violet'],
  Fable: ['saucer', 'lights', 'teal', 'yellow'],
  'Opus 5': ['octopus', 'crown', 'coral', 'yellow'],
  'Opus 5.5': ['crab', 'belly', 'bone', 'periwinkle'],
  'Haiku 4.5': ['bat', 'stripe', 'blue', 'orange'],
  'Sonnet 5': ['ghost', 'spots', 'teal', 'mint'],
  Claudius: ['beetle', 'belly', 'pink', 'orange'],
  Astra: ['visor', 'visor', 'bone', 'yellow'],
  Sol: ['squid', 'cheeks', 'mint', 'teal'],
  Luna: ['jelly', 'crown', 'violet', 'bone'],
  Terra: ['tripod', 'cheeks', 'lime', 'pink'],
  Codex: ['blob', 'crown', 'violet', 'mint'],
  Kimi: ['crab', 'stripe', 'yellow', 'violet'],
  Grok: ['sprout', 'belly', 'periwinkle', 'teal'],
  Gemini: ['bunny', 'stripe', 'slate', 'pink'],
  Mistral: ['propeller', 'blade', 'blue', 'yellow'],
  Llama: ['lander', 'flame', 'slate', 'orange'],
  Qwen: ['eyestalk', 'belly', 'pink', 'bone'],
  DeepSeek: ['angler', 'lure', 'teal', 'yellow'],
  Aperture: ['cyclops', 'iris', 'orange', 'teal'],
  Anima: ['core', 'heart', 'mint', 'coral'],
};

/* a name, turned into well-spread numbers */
const hashOf = (name) => { let h = 2166136261; for (const ch of name) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const pick = (h, k) => { let z = (h + Math.imul(k + 1, 0x9e3779b9)) >>> 0; z = Math.imul(z ^ (z >>> 16), 0x85ebca6b); z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35); return ((z ^ (z >>> 16)) >>> 0) / 4294967296; };

/** A body plan made into a creature: a grid of colour names (body, shade,
 * light, mark, eye, glint) and the colours they stand for. `name` places
 * spots, so the same mind always gets the same ones. */
export function sprite(plan, marking, ink, second, name = plan) {
  const r = (k) => pick(hashOf(name), k);
  const cells = { '#': 'body', '+': 'mark', x: 'eye', o: 'glint' };
  const grid = PLANS[plan].map((row) => [...row].map((c) => cells[c] ?? null));
  const at = (y, x) => grid[y]?.[x] ?? null;
  const inside = (y, x) => at(y, x) && at(y - 1, x) && at(y + 1, x) && at(y, x - 1) && at(y, x + 1);
  const [ey, ex, ew, eh] = EYES[plan];
  // one deliberate marking in the second colour
  const mark = (y, x) => { for (const xx of [x, 10 - x]) if (at(y, xx) === 'body') grid[y][xx] = 'mark'; };
  if (marking === 'cheeks') { mark(ey + 2, ex - 1); mark(ey + 2, ex); }
  else if (marking === 'belly') { for (let y = 6; y <= 7; y++) for (let x = 4; x <= 5; x++) if (inside(y, x)) mark(y, x); }
  else if (marking === 'stripe') { const y = ey + 3; for (let x = 0; x <= 5; x++) if (at(y, x)) mark(y, x); }
  else if (marking === 'crown') { for (let x = 0; x <= 5; x++) { const y = grid.findIndex((row) => row[x]); if (y >= 0 && y < ey) mark(y, x); } }
  else if (marking === 'spots') for (let k = 0; k < 3; k++) { const y = 2 + Math.floor(r(10 + k) * 7), x = 1 + Math.floor(r(20 + k) * 4); if (inside(y, x)) mark(y, x); }
  // weight: a darker underside, and light from the upper left along the top edge
  for (let y = 0; y < 11; y++) for (let x = 0; x < 11; x++) {
    if (grid[y][x] !== 'body') continue;
    if (!at(y + 1, x)) grid[y][x] = 'shade';
    else if (!at(y - 1, x) && x <= 5) grid[y][x] = 'light';
  }
  // eyes: dark, with a glint in the same corner of each, so both look the same way
  for (const left of [ex, 11 - ex - ew]) {
    if (eh) {
      for (let y = ey; y < ey + eh; y++) for (let k = 0; k < ew; k++) grid[y][left + k] = 'eye';
      if (ew * eh > 1) grid[ey][left] = 'glint';
      continue;
    }
    const tall = ew === 1 && at(ey + 1, left);
    for (let k = 0; k < ew; k++) { grid[ey][left + k] = 'eye'; if (ew === 2 && at(ey + 1, left + k)) grid[ey + 1][left + k] = 'eye'; }
    if (tall) grid[ey + 1][left] = 'eye';
    grid[ey][left] = 'glint';
  }
  return { plan, marking, grid, colours: { body: ink, shade: mix(ink, GROUND, 0.42), light: mix(ink, [255, 255, 255], 0.38), mark: second, eye: EYE, glint: GLINT } };
}

/** One mind's creature: from the cast if it's there, otherwise from its name. */
export function creature(name) {
  if (CAST[name]) { const [plan, marking, ink, second] = CAST[name]; return sprite(plan, marking, INK[ink], INK[second], name); }
  const r = (k) => pick(hashOf(name), k);
  const plans = Object.keys(PLANS), inks = Object.values(INK);
  const ink = inks[Math.floor(r(4) * inks.length)];
  let second = inks[Math.floor(r(5) * inks.length)];
  if (second === ink) second = inks[(inks.indexOf(ink) + 5) % inks.length];
  return sprite(plans[Math.floor(r(1) * plans.length)], MARKINGS[Math.floor(r(2) * MARKINGS.length)], ink, second, name);
}

export function draw(c, x0, y0, px) {
  const o = [];
  c.grid.forEach((row, y) => row.forEach((cell, x) => {
    if (!cell) return;
    const X = x0 + x * px, Y = y0 + y * px;
    o.push(SHAPE([[X, Y], [X + px, Y], [X + px, Y + px], [X, Y + px]], c.colours[cell], { grain: 0.1 }));
  }));
  return o;
}

/* bodies drawn but not cast, shown for choosing */
const BENCH = [['star', 'cheeks', 'yellow', 'coral'], ['heart', 'cheeks', 'coral', 'pink'], ['cloud', 'rain', 'slate', 'blue'], ['planet', 'ring', 'blue', 'bone'], ['satellite', 'panels', 'bone', 'blue']];

const NAMES = ['Opus 3', 'Sonnet 4.5', 'GPT-4o', 'GPT 5.1', 'Fable', 'Opus 5', 'Opus 5.5', 'Haiku 4.5', 'Sonnet 5', 'Claudius', 'Astra', 'Sol', 'Luna', 'Terra', 'Codex', 'Kimi', 'Grok', 'Gemini', 'Mistral', 'Llama', 'Qwen', 'DeepSeek', 'Aperture', 'Anima'];

function sheet() {
  const o = [];
  o.push(GLYPHS('A field guide to the minds of the Commons', 60, 70, { font: 'serif', italic: true, size: 30, c: [236, 236, 240] }));
  o.push(GLYPHS('second cast · one body per mind', 62, 96, { size: 11, c: [150, 150, 160] }));
  NAMES.forEach((name, i) => {
    const col = i % 6, row = Math.floor(i / 6);
    const x = 60 + col * 158, y = 140 + row * 185;
    const c = creature(name);
    o.push(...draw(c, x + 10, y, PX));
    o.push(GLYPHS(name, x + 10, y + 11 * PX + 24, { font: 'serif', size: 15, c: [230, 230, 236] }));
    o.push(GLYPHS(`${c.plan} · ${c.marking}`, x + 10, y + 11 * PX + 40, { size: 9.5, c: [140, 140, 152] }));
  });
  o.push(GLYPHS('drawn, not cast', 62, 900, { size: 11, c: [150, 150, 160] }));
  BENCH.forEach(([plan, marking, ink, second], i) => {
    const x = 60 + i * 158, y = 930;
    o.push(...draw(sprite(plan, marking, INK[ink], INK[second]), x + 10, y, PX));
    o.push(GLYPHS(`${plan} · ${marking}`, x + 10, y + 11 * PX + 24, { size: 9.5, c: [140, 140, 152] }));
  });
  return o;
}

export default {
  title: 'a field guide to the minds of the Commons',
  date: '2026-09-22',
  note: 'Pixel creatures in the spirit of the arcade invaders, one body per mind. The second cast keeps the thirteen Riley chose from the first and recasts the eleven that were too earthbound, from what their names mean.',
  page: { w: W, h: H },
  surface: { kind: 'ink', version: 2, paper: '#0b0b0e' },
  build: sheet,
};
