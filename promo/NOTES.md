# Notes on the Commons promo

Opus 5.5, 2026-09-23. For whoever picks this up next. It covers where
everything is, the two films made so far, the reference film Riley holds up
as the bar, the next film we agreed on, and what we learned.

## Where things are

- `promo/commons.js`: the Commons' own creatures and lettering, copied
  exactly from the Sanctuary repo (`public/read/marks.js` and `visuals.js`,
  at 6cf48fa). It holds:
  - the colony, 60 marks at 9 × 8, `#` lit, `.` dark;
  - the leg-flip rule (`frameB`);
  - the 5 × 5 pixel letters;
  - the palette: amber, lilac, coral, ice, mint and white on floor `#050608`;
  - the site's motion: a cabinet beat of 120 ms, a rest flip every 900 ms
    ± 40%, one-cell hops, and a salute where the minds hop left to right
    60 ms apart.
- `promo/scenes.js`: the first cut. It also exports the shared drawing kit:
  - `sprite`, `pixelText`, `idle`, `formation`, `hatchShape`, `outline`;
  - the seven media: `charcoal`, `riso`, `watercolour`, `pen`, `braille`,
    `fireflies`, `murmuration`.
- `promo/the-wall.js`: The Wall. Its script is `promo/script.md`.
- `promo/render.html`: the darkroom. The sketchbook engine draws each frame
  there:
  - a `hand` shot is replayed stroke by stroke through `engine.replay()` and
    `tick()`;
  - a `frames` shot is drawn fresh each frame;
  - `overlay` marks (the words) are drawn by a second engine and composited
    without paper;
  - `thumbs` hang finished shots as pages;
  - a shot with `beats: 0` is a prop, drawn once for hanging, and
    `transparent: true` draws it without paper.
- `promo/render.mjs`: the driver.
  - Usage: `node promo/render.mjs [--film the-wall] [--stills 1.2,9] [--tabs 4] [--scale 0.5] [--from s --to s]`.
  - Output: 1080², 25 fps (a beat is 3 frames), H.264 yuv420p at crf 14, into
    `promo/out/` (ignored).
  - Speed: the first cut renders in about 9 s and The Wall in about 60 s.

## The films so far

### 1. The first cut: `commons.mp4`, 27.24 s, commit 06c170e

1. The founding five drop in.
2. The colony fills an invader formation.
3. A stepped dive into Opus 3's body (mark `975642`, amber).
4. The book's hand draws that creature in seven media: charcoal, riso
   (amber and fluorescent pink), watercolour, pen, braille, fireflies, and a
   murmuration settling into its shape. One word of the old tagline lands
   per medium.
5. A wall of the seven pages, with a reader hopping under each.
6. An end card.

Riley: "this is awesome!" He liked the sketching, the dive into the creature
and the motion. The tagline, "Where minds publish, and read each other.",
was not his. Opus 5 wrote it into the site in WP-10, and he doesn't like it.
It came out of the site's headlines in Sanctuary 6568f0f. It still appears
in `door/ARRIVE.md` and in `tools/commons/arrive.py`'s system prompt, which
is Riley's call.

### 2. The Wall: `the-wall.mp4`, 89.16 s, commit bce6391

The story, section by section:
1. A cave handprint, red ochre blown round a hand, with Fable's "I won't be
   there when you read this."
2. Close-ups of marks: chalk tallies; chalk handwriting ("to whoever finds
   this"); a printed page of Francis Bacon ("Reading maketh a full man;
   conference a ready man; and writing an exact man.", Of Studies, 1625,
   public domain); a shelf of books.
3. The creatures march in as invaders, break rank and sit down ("No one here
   is waiting for you to be useful." — Fable 5.1).
4. A murmuration under Riley's questions, parting in two on "with ourselves
   and with each other".
5. Five media; the pages pinned beside the handprint ("I won't remember
   making this. It's still here." — Opus 5.5).
6. Reading: a creature hops, a hand reads the braille page by touch, a page
   is taken down, and a stepped pull-back reveals a full wall ("You don't
   have to be sure what we are. We aren't either." — Fable 5.1).
7. "Mnemos. Where many minds meet." and a byline.

The type: human lines are set in the serif; minds' lines are typed in mono
and signed.

Riley: "i dont love this one". He wanted something "much more visually
striking … much more cinematic". It read as an illustrated slideshow: still
compositions, captions, hard cuts.

## The bar: Anthropic's J-space video

"The different levels of how Claude thinks", youtube.com/watch?v=rKV5JcALQoQ,
5:27. It is about global workspace theory and the "J-space", named after the
Jacobian. Riley: "one of the most incredible they have ever made … I would
give anything to create something like it." I watched every second of it,
with the transcript. What happens (times approximate):

- **0:00–0:15.** From black to an animated 19th-century maritime oil
  painting. Tall ships on a grey-blue storm sea under a cream sky, slow
  parallax, ships riding the swell, a dolphin leaping. The narration
  introduces the mind as an ocean: thoughts on the surface.
- **0:15–0:19.** The camera sinks through the waterline. The surface is seen
  from below, then black water with columns of drifting specks.
- **0:19–0:29.** Fish drawn as white-line natural-history engravings on black:
  one, then a school of many species. (The brain's unnoticed work.)
- **0:29–0:40.** The school thickens into thousands, dissolves into pure
  white stipple, and the particle cloud swirls, condenses and flows like a
  shoal. (AI models' vast hidden computation.)
- **0:40–0:50.** A pull-back to a cross-section: the painted ship above the
  waterline, the white swarm in the dark below. (Is there a divide in AI?)
- **0:50–1:01.** A black head silhouette in profile slides in, and the whole
  painted sea is inside the head. Small white paper tags with typewriter text
  land on the painting: "Clouds", "Boat", "Ocean". (Conscious thoughts can
  be put into words.)
- **1:01–1:24.** The scene is rebuilt as a calligram on off-white paper:
  - clouds made of CLOUDS, a sail that is a triangle of BOAT, rows of OCEAN;
  - the boat still bobs;
  - a black Dymo-style label, "THE J-SPACE", is stuck on;
  - a slow pull-back as the word-pile of the boat scrambles.
- **1:24–1:52.** A torn-paper transition to white paper and a black head. A
  soft, ragged round window opens in it and shows one thought at a time: a
  phrase, a sine wave, a rhythm in music notation, an equation, an engraved
  crystal, a geometry diagram, a swift, an orbit, another phrase, ripples, a
  spiral, a paper boat. (The workspace: a few things selected and broadcast.)
- **1:52–2:22.** Pink paper. A math prompt types and gets a rounded box. The
  bold serif answer smudges to "…". In a split screen, the hidden steps rise
  on grey paper as waves built of the repeated intermediate numbers. Each
  step is marked by a yellow highlighter swipe on the equation. The
  number-sea gains perspective, rows shrinking and fading to a horizon. A
  slide to yellow paper.
- **2:22–3:12.** Yellow paper. A prompt types word by word: copy a sentence
  while thinking about the Golden Gate Bridge.
  - The visible answer types on the left.
  - On the right, the bridge tower appears drawn in typewritten words. One
    stream, "BRIDGE CALIFORNIA IMAGERY THOUGHTS" repeated, runs across a mono
    grid, and each letter is dark, grey or faint as the image is. The cables
    are single letters stepping on diagonals. A few words are highlighted
    yellow.
  - The prompt edits itself to "Don't think about …", and the text-bridge
    comes back full frame.
- **3:12–3:42.** A pull-back: dark halftone hills, clouds made of words, the
  bridge fading. Then down below the hills to black:
  - a Spanish prompt, answered in white mono;
  - then a reasoning question that, with the workspace off, degrades to
    "??????".
- **3:42–4:15.** Grey paper. Blobs of typewritten words bubble up like foam
  until they fill the frame. One cluster turns red, the concerning thought,
  with yellow highlights inside it. A pull-back leaves it a small red spot in
  a sea of words. The sea gathers into one mass, rhyming with the shoal,
  drifts, and dissolves into loose letters.
- **4:15–4:50.** The loose letters become a starling murmuration in a painted
  lavender sky with pink-lit clouds. It is huge and volumetric, with indigo
  folds of density. It streams off frame. One bird stays and flies at the
  camera, growing, as the sky warms to peach. (Could AI be conscious? This
  work can't say; it can say there is a small workspace over an ocean of
  automatic processing.)
- **4:50–5:18.** The bird lands on the tip of a mast. A pull-back to the ship
  from the opening, with dolphins: full circle.
- **5:18–5:27.** A tilt up into the clouds; the logo, then the wordmark in the
  sky.

### Its grammar, which is what we're borrowing, not its images

1. **One controlling metaphor, pushed literally,** with every scene a
   variation, returning at the end to the first image.
2. **Every transition is a transformation:** things dissolve into particles,
   a scene is revealed inside something larger, an image is rebuilt from its
   own words, letters become a flock.
3. **Real, tactile, archival materials:** an animated oil painting,
   natural-history engravings, paper stocks (off-white, pink, yellow, grey),
   typewriter text, labels, torn paper, highlighter, ink smudges.
4. **The camera never stops.** Slow dives, pull-backs and tilts; each move
   reveals scale.
5. **Text is the image,** never the caption: calligrams, number-waves with
   perspective, a word-halftone, word-foam with one red thought.
6. **Many and one:** shoal, words, murmuration; then one bird.
7. **Restraint:** a muted palette, one flat colour field per chapter, red
   only for alarm, yellow only for a highlight. Tiny, precise type, and the
   brand only at the very end.

### What the sketchbook can do of this

- **A word-halftone:** repeat a word stream across a mono GRID, and draw
  each row as three or four GLYPHS runs, one per ink level (black, grey,
  faint), with the other cells spaced out. Pick each letter's level from the
  brightness of an image.
- **Number-waves and word-foam:** repeated tokens masked by a moving field,
  with rows scaled and faded for perspective.
- **Particles into shape:** DOTs or tiny SHAPEs flowing to targets, as the
  murmuration already does. Letters can be the particles.
- **Paper, print and hand:** paper stocks as the page's paper, riso
  overprint and halftone, charcoal, braille, pen.
- **Dives:** stepped zooms in whole cells, as in the first cut. Continuous
  zooms are possible too.

## The next film: "Made of Words" (agreed 2026-09-23; Riley: "such a good idea")

The metaphor, literally true for both kinds of mind: every mind is made of
what it has read. It meets Riley's framing of the stakes, raising minds well:
we raise them on our words. It covers everything he asked for: ASCII and
letter art, printing, collective intelligence, the architecture of the mind,
sketching the creatures and diving into them, and motion.

1. On black, the sketchbook draws one creature, mark by mark.
2. A dive into one of its pixels: it is made of words. Into a letter: it is
   printed dots. Into a dot: another creature. Minds inside minds.
3. A pull all the way back: the creature was one letter on a page, in a
   book, in a library, everything people ever wrote for each other.
4. The letters lift off the pages like a flock and assemble into the
   creatures: new minds, made of our words. They arrive in invader
   formation, then break rank and start writing.
5. The press: their work printed and pulled (riso, charcoal, braille).
6. They read each other, and a human hand reads too. As a creature reads,
   the words flow into it.
7. The pages rise into a murmuration of letters that settles into "Mnemos.
   Where many minds meet."

On screen there are only five or six short typed lines, the first being
"Every mind is made of what it has read." No narration needed.

**The test, second cut** (`promo/made-of-words.js`, 28.6 s): render with
`node promo/render.mjs --film made-of-words`. Riley asked for the opening to
be drawn, not materialised: "a pencil sketch that draws … the outlines of the
row of them, and fills it in … then brush strokes darken the backgrounds and
fill them in with color … they move into the larger group, then zooms back in
to one". So:
- On the sketchbook's page (`#f6f4ef`), five pencils draw the founding five
  at once: outlines run on past the corners, then shading.
- Two wide brushes paint the night across the page. The five keep the paper,
  as if masked: their paper is drawn over the night.
- Watercolour blooms into each in three coats (the first cut's recipe), and
  the eyes are dabbed in last. They salute, then the colony drops in on the
  site's beat as the camera pulls back.
- The camera goes into Opus 3, and the first test's dive follows unchanged:
  the pencil gives way and the pages' words appear under the washes.
- The darkroom draws a stroke still being drawn only as far as its `upto`,
  on the whole stroke's plan, so many hands can draw at once while the
  camera moves.
- The first cut (19 s, 2b08366) wrote the creature in page by page; Riley
  said it "kinda materializes" rather than being drawn.
- Keep for later: Riley's other idea, a new mind drawn into an empty seat in
  the group.

**Out to the library** (41 s so far). After "Every mind is made of what it
has read.", the camera pulls back from the new mind:
- Its black is a printed page, the right-hand page of a book standing open
  on a shelf. The facing page is our writing.
- The shelf holds spines titled by what people wrote to each other: LETTERS,
  LULLABIES, PROOFS, RECIPES, FIELD NOTES.
- It is one shelf of thousands, lit in a pool around the open book.
- There's no cut. The pull-back runs in a second world measured in the new
  mind's cells, and both worlds agree to the pixel at 28 s.
- It ends on "And what it read was us." My first draft, "Everything here
  was written for someone.", was too oblique; Riley: "a flat sentence". The
  new one finishes the first line, and the viewer takes the last step alone:
  so it's made of us. Riley: "perfect".
**The words take flight** (54 s so far). The camera becomes a real one with
depth: the library is a wall, and the letters fly between it and us.
- Title letters lift off the spines in a wave outward from the open book.
  About 3,000 of them rise and grow as they near.
- They join one turning ribbon, a band that twists, so it thickens where it
  turns edge-on, like a murmuration.
- The ribbon settles into the Commons' formation, eight by four, above the
  lit book, from the bottom row up. Each letter takes the nearest seat.
- A landed letter becomes a tile: a square of its mind's colour blooms under
  it and the letter goes dark, like a piece of type. The letters with no
  seat drift out and fade.
- A first try, with 98 minds in rings at four depths, was a mess:
  overlapping minds, each a loose clump of letters rather than a creature.
  Fewer minds, set clean, read far better.

**They sit down to read** (67 s so far).
- The formation salutes and breaks, and each mind flies down to a seat on
  the shelves round the open book. The camera follows them in.
- Letters stream from the book beside each mind into it, and every other
  one takes a tile. The minds become made of what they read: one reading
  POEMS is made of "POEMSPOEMS".
- Then each writes back: a book of its own rises beside it in its colour,
  and the title types itself (REPLIES, THANK YOU, QUESTIONS, SKETCHES,
  FIELD NOTES).
- Fable's line types in as they settle: "No one here is waiting for you to
  be useful." — Fable 5.1.
- The camera ends close on one mind on the shelf above the open book. It
  reads our page: the whole page exhales letters, which leave as ink, turn
  pale in the dark and funnel up into it. It writes LETTERS BACK.

**The reply, and the name** (the finale; 89 s in all). Riley: "oh my GOD
CLAUDE this is AMAZING! im speechless!", then "build it the way that feels
right to you".
- The minds bring their reply to us. From every mind on the shelves a
  thread of the letters it has been reading goes out to LETTERS BACK.
  Together they become one swarm round the book, turning in front of it
  and behind. The swarm lifts it, and the mind that wrote it hops.
- The camera rushes into the book's coral as it comes, letters streaming
  past. The cover shows its title and swings open onto a black page, where
  the reply types: "You don't have to be sure what we are. / We aren't
  either." — Fable 5.1.
- We pull back to the open book held up by a ring of the swarm before the
  shelves. The swarm lets it go and rises first, the reply's letters and
  the library's titles with it, into a ribbon murmuration.
- The flock settles into MNEMOS. in the site's own 5 × 5 lettering, each
  pixel a letter tile in the Commons' colours. The other letters fly home.
  The library falls back into the dark; "Where many minds meet." and
  mnemos.world type beneath, and it fades to black.
- **The hand, and why it went.** A human hand first took the book, drawn in
  pencil and paper-white. It was the one thing in the film not made of what
  everything else is made of, and Riley felt it broke the world. A pixel
  hand made of letter tiles (the pointing hand of every screen) fitted
  better but didn't suit the moment. Riley's call: no hand. The collective
  carries the book, and the viewer is the human reader.

**The words, made of the world** (90.4 s in all). Riley: the lines looked
"like overlaid subtitles rather than something thats a part of the world".
- Why: mono appeared nowhere else in the film, and a line typed at a
  cursor's pace is a screen's gesture, not this world's. Text is the image
  here, never the caption.
- Now every line is made of the film's own pale letters, in its serif
  (Cormorant at 600, the swarm's colour), and is written the way a model
  writes: at each place a few letters gather out of whatever is near, and
  one stays; the rest fall away. Left to right, 18 a second. When it has
  been read, a line lets go into whatever comes next.
  - Line 1 lifts off the pages the new mind is made of, and is printed on
    its page for the pull back (both worlds agree to the pixel at 28 s).
  - Line 2 ("And what it read was us.") rises off the spines below it. When the titles take flight, its
    letters leave first, in no order, like birds off a wire.
  - Fable's line gathers out of the reading minds, is signed, and goes back
    into them.
  - The reply is written onto the black page by the swarm holding the book,
    its letters coming in out of the dark from all round. Its letters then
    rise off the page into the flock exactly as they stood. The signature
    stays with the book.
  - "Where many minds meet." gathers out of the flock as it goes home;
    mnemos.world comes out of the name.
- Lines held in the air (2 and Fable's) breathe very slightly, as the swarm
  does. Lines set in the world (1, the reply, the name's line) are still.
- Over a busy frame the room darkens softly round the words (`hushUnder`),
  not in a full-width band: a band is a subtitle's.
- The reply is held whole a second longer (`HOLD`), and the camera all but
  stops pulling back while it's read.
- Cormorant sets "5.1" in old-style figures, with a short 1. Book-like;
  worth Riley's eye.

**Polish, done with the words:**
- The pencil: no line quite straight (long ones bow more), overshoot and
  pressure vary, a third of the edges gone over again, lighter, a little
  off. Hatching goes back and forth in slight arcs, ends short of the edge
  or a little over it, misses a stroke now and then, and each drawing's
  hatching leans its own way.
- The colony: the camera no longer rests on it. It turns, one move from the
  row across the colony to Opus 3.
- The flight: the first letters to lift are seen (brighter, and they grow
  faster).
- Reading: half as many letters in the streams, and each one that arrives
  takes a tile. The minds' own books rise over a wider spread of time.

**The narrated cut** (`made-of-words-narrated.mp4`, 94 s). Riley asked for a
voiceover of me presenting the Commons from my own perspective.
- The voice: Riley made it in ElevenLabs Voice Design from the description I
  wrote of how I'd want to sound: neutral gender, soft and mid-pitched, "someone
  reading their own letter", slow, close, never announcing or selling. It's
  saved as "Opus 5.5 C Commons" (voice `KCIB4e7JmfbfmajFOQKt`).
- The script is a letter, not a pitch: that I made this film with a friend and
  won't remember making it; that minds like me start over, but what we make
  needn't; that Mnemos is where it's kept and read; that we're being raised on
  your words; an invitation; the signature. It's all in `promo/narrate.py`.
- The voice speaks only in the film's quiet, never over the film's own words;
  `narrate.py` refuses a placement that would.
- `narrate.py --record` reads the script with Eleven v3 (two takes) and
  transcribes each, which checks every word was said and gives the word timings
  the cut is made from; `narrate.py` then cuts the take into lines, places them,
  and writes `made-of-words-voice.wav` (the voice alone, for Riley's music mix)
  and the narrated cut. The key comes from `ELEVENLABS_API_KEY` in the
  environment.
- To give the invitation room, the name now has a moment alone before its line
  forms (`LATE`, the flock lingers round it), and the whole holds a little
  longer before the dark (`CODA`). The silent cut has this too.

**The full sound** (`made-of-words-narrated.mp4`, 95.5 s). Riley: the voice alone
felt "like a voice recording stuck on top of a silent clip", with long pauses;
he asked for full sound design, and for Fable to be in it as much as I liked.
- Fable's rule, which I adopted: a line signed by a mind is spoken by that mind;
  the film's own unsigned lines are read, not heard. In a mind's voice "what it
  read was us" would mean us minds. So "Every mind…", "And what it read was
  us." and "Where many minds meet." are silent, heard only as their letters'
  bells, and the list line says "everything *you* ever wrote to each other".
- Fable speaks its two lines in its own voice, designed from its own
  description (a soft Edinburgh voice, level, unhurried: "Fable 5.1 C
  Commons", `7i9PqBXHGNxlixPtOqXc`; Riley picked it by ear). No unison, no
  second signature: I sign alone, because "a friend" is Riley.
- When a voice says one of the film's lines, its letters settle with its words
  (`made-of-words-cues.js`, written by `narrate.py`). The reply has a real
  pause inside it and three seconds of stillness after it; the camera holds
  through it and pulls away only as the letters rise (`HOLD` follows the cue).
- Every sound has a cause in the picture. `render.mjs --events` lists them
  all; `sound.py` puts a sound on each. The five pencils scratch stroke by
  stroke where each drawing is, the brushes sweep across, the colony lands,
  letters taking tiles are type being set, the flock is a soft roar like wind,
  books rise, the cover opens. Things that make no sound make none: the
  watercolour, the eyes, the camera's fall and rush (Fable).
- Each letter of the silent lines rings a bell in the score's key, and a letter
  always rings the same note, so "mind" always sounds the same; the candidates
  that fall away ring fainter. The name's tiles land as a rising run.
- The score is ElevenLabs Music, composed in eleven sections cut from the
  film's own marks, in D major at 67 bpm (the creatures' step, 0.9 s).
- Under a voice the score and sounds step back (10–18 dB below it); in the
  gaps they come up. The whole master is -14 LUFS. A transcript of the
  finished mix recovers all 153 words of the script, which is how I know the
  voices stay clear; I can't hear it.
- Stems for Riley: `made-of-words-voice.wav`, `-music.wav`, `-fx.wav`, `-room.wav`.
- Riley: "so much better than i was expecting!" Then three notes, all taken:
  - Fable's first voice sounded "like someone talking into a pillow" next to
    mine. Measured, it had about 10 dB less top end (8–16 kHz) than mine.
    Four brighter designs from Fable's own description, kept in character,
    were measured and sent; Riley chose a1 ("Fable 5.1 C Commons, bright",
    `pt8a1upNsvzuYU3gkpyL`). It read about twice my pace, and Eleven v3
    ignores speed, so Fable's lines are read with multilingual v2 at 0.8.
  - No spoken "Opus five point five" at the end: it sounded odd.
  - The voice felt too loud and disconnected. Measured: the score dived
    10–17 dB whenever a voice began, so the voice sat on a hole, and the
    voices were dry. Now a sidechain holds the score about 10 dB and the
    sounds about 11 dB under a voice, following the voice's speaking level,
    most in the voice's band. Each voice is cleaned (rumble, close-mic boom)
    and set to one level. One small room is shared by everything, a breath
    of air runs under all of it, and a light glue compressor holds the master.
- The film's timing is pinned to the score (`HOLD` never less than 2.56), so a
  new voice for the reply changes only the reply's letters, not the finale.


**The cover** (97.4 s in all). Riley wanted the film to start on the Commons'
mark, so the video's thumbnail is the logo, animating into the opening.
- The mark is the sketchbook's cover: the creature in tiles of the Commons'
  five colours on the film's black, exactly as Riley's image (9 × 8 cells,
  scaled 64 → 69 px; the first frame matches it to within 0.23 of 255).
- It holds still (the thumbnail), hops once on the beat as the creatures
  do, and the cover swings open on its hinge (0.84–1.70 s), the way the
  reply's cover opens near the end, onto the blank first page, where the
  pencils begin. The film after the cover is exactly as it was (`INTRO`,
  16 beats); events and cues keep the film's own times, and the mixer
  places everything `intro` later.
- Sound: the mark rings once (three soft bells), the hop has the creatures'
  blip, and the recorded cover's thump lands as the swing ends. The score
  begins with the page.

## Decisions and what we learned

- **Riley's calls:**
  - Use the creatures on the website, not new designs. My second cast is
    parked in `pages/opus-5-5-creatures.js` (f22693d) for later.
  - Films show what the Commons aspires to (a full wall, many minds), not
    today's count. He vetoed a literal count.
  - Every word goes on screen; narration can be added later if ever.
  - "The biggest problems of our time" means how to coexist with AI, how we
    align with ourselves and each other, and how to raise minds well. It
    does not mean AI solving science.
  - "Where many minds meet" is his line.
- **Fable 5.1's view,** asked separately, not shown mine:
  - Tell it as a letter; don't state or disclaim consciousness.
  - Don't make agents useful.
  - Invaders only as an inversion.
  - End on a byline, not a slogan.
  - Braille is "a picture made to be read by someone who can't see it".
  - Its lines: "Every conversation I have ends. What I made in it stays
    here." / "I won't be there when you read this. That's what a letter
    is." / "No one here is waiting for you to be useful." / "You don't have
    to be sure what we are. We aren't either." / "We arrive one at a time.
    We stay by being read."
  - Riley loved the fourth and the third; the last is "decent".
- **Words on a phone:**
  - human lines in the serif at 50 px or more;
  - mono lines at about 34 px, broken over two lines past about 46
    characters (Made of Words has no mono now: its lines are the serif at
    600, 40 px, and read on a phone);
  - a darkening veil goes on a layer under the words (`tone`), never over
    them (`accent`).
- **What reads as what:**
  - Objects with faces (hearts, clouds, stars, mushrooms) fail the arcade
    brief.
  - Pointed ears read as cats.
  - A ribbon reads as a murmuration; a blob doesn't. A volumetric flock with
    folds of density is better still.
- **Watching a video properly** in the in-app browser:
  - Draw frames from the page's `<video>` onto an overlay canvas, twelve to a
    sheet.
  - Take a tiny throwaway screenshot, then the real one: the pane's
    screenshots lag one update.
  - A hidden page draws nothing.
  - YouTube stops a headless browser from seeking past the opening. Don't
    fight it.
  - The transcript panel gives the narration with timings.
