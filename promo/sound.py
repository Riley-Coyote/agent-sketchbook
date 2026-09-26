"""The sound of Made of Words. Every sound has a cause in the picture: the film
itself says when each pencil stroke, brush, landing, lift and letter happens
(`node promo/render.mjs --film made-of-words --events`), and this places a
sound on each, at its frame. The recorded sounds come from ElevenLabs (sound
effects and music); the letters' bells, the tiles' notes and the creatures'
first sounds are synthesised here, in the music's key.

  python3 promo/sound.py --fx       make the recorded sounds that are missing
  python3 promo/sound.py --music    compose the score, in sections timed to the film
  python3 promo/sound.py            mix: voices, score, sounds → the narrated cut

The key comes from ELEVENLABS_API_KEY in the environment and is never printed.
Everything is written to promo/out/sound/, which git ignores.
"""
import json, os, pathlib, sys, urllib.error, urllib.request

ROOT = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
SOUND = ROOT / 'out' / 'sound'

# name: (what it is, seconds, how closely to follow the words, loops)
FX = {
    'pencil_sketch':  ('Close-up foley of a graphite pencil sketching quick light strokes on thick drawing paper, dry scratchy texture, intimate and quiet, no music', 10, 0.5, False),
    'pencil_hatch':   ('Close-up foley of a pencil hatching back and forth quickly on paper, rhythmic dry graphite scratching, intimate, no music', 8, 0.5, False),
    'brush_wet':      ('A wide soft brush loaded with ink sweeping long slow wet strokes across paper, smooth soft swishing, close and intimate, no music', 8, 0.5, False),
    'watercolor':     ('Watercolour paint blooming on wet paper, gentle soft liquid spreading and tiny water sounds, very quiet and close, no music', 6, 0.4, False),
    'brush_dab':      ('A few tiny soft dabs of a fine wet paintbrush tip on paper, gentle and very close', 2, 0.5, False),
    'dive':           ('A long smooth airy whoosh that slowly builds and deepens, like falling gently through soft air, cinematic and calm, no music', 12, 0.4, False),
    'paper_close':    ('Very close soft rustle of paper fibres and grain, delicate granular texture, quiet', 6, 0.4, False),
    'into_black':     ('A deep soft sub bass swell that blooms slowly and fades away into silence, like entering a dark quiet space', 5, 0.4, False),
    'library':        ('Room tone of a vast quiet old library at night, soft still air, a very faint distant creak of wooden shelves, calm, no voices, no music', 22, 0.4, True),
    'pages_lift':     ('Thousands of paper pages fluttering up into the air together like a flock of birds taking off, a rising rush of soft paper wings', 8, 0.5, False),
    'murmuration':    ('The soft rushing whoosh of thousands of wings of a starling murmuration turning overhead, wind-like, swelling and fading', 12, 0.4, False),
    'swoop':          ('A quick soft paper swoosh, like a small card gliding past close by', 1.2, 0.5, False),
    'tap':            ('A single very soft light tap of a small wooden block set down on a wooden shelf', 0.6, 0.6, False),
    'book_rise':      ('A small cloth-bound book sliding up gently against a wooden shelf, soft wooden scrape', 1.4, 0.5, False),
    'page_breath':    ('A soft long exhale of paper, pages gently breathing out, an airy whisper-like rustle', 3, 0.4, False),
    'swarm_gather':   ('Soft paper wings rushing in from all around and gathering together, a rising flutter', 4, 0.5, False),
    'rush':           ('A fast rising whoosh rushing forward, soft wind building to a peak and stopping', 2, 0.5, False),
    'cover_open':     ('A heavy old cloth-bound book cover swinging open slowly, a soft creak of the spine and a gentle low thump as it settles', 2.5, 0.5, False),
    'flock_home':     ('Soft fluttering pages drifting away into the distance, receding gently into quiet', 5, 0.4, False),
    # after Fable: a murmuration heard from a distance is a soft roar like wind, not flapping; letters taking
    # their tiles sound like type being set
    'flock_roar':     ('A soft distant roar like wind moving through tall grass, slowly swelling and thinning in waves, calm, no flapping', 14, 0.5, False),
    'type_set':       ('Metal letterpress type being set by hand in a composing stick, tiny soft clicks of lead type, close and gentle, unhurried', 8, 0.6, False),
}

# the score, in sections cut to the film's beats (milliseconds), in D major so the letters' bells belong to it
SCORE = {
    'positive_global_styles': ['cinematic ambient score', 'intimate and restrained', 'felt piano', 'soft string ensemble', 'warm',
                               'contemplative', '67 bpm, the creatures\' own step', 'D major', 'instrumental'],
    'negative_global_styles': ['vocals', 'singing', 'choir', 'drums', 'percussion', 'beats', 'synth arpeggios', 'epic trailer',
                               'heavy bass', 'distortion', 'EDM'],
    'sections': [
        ('Sketchbook', 6900, ['solo felt piano', 'very sparse single notes', 'delicate', 'quiet', 'curious'], ['strings', 'full chords']),
        ('Waking', 5900, ['felt piano, gentle rising arpeggios', 'a little warmth and wonder', 'soft'], ['strings']),
        ('The fall', 11800, ['low warm drone', 'soft piano notes descending', 'suspended', 'slowly building anticipation', 'mysterious'], ['bright melody']),
        ('Every mind', 3400, ['near silence', 'one soft held piano chord', 'stillness'], ['rhythm', 'movement']),
        ('The library', 13000, ['warm strings enter softly beneath the piano', 'the space opens wide', 'gentle swell', 'wonder'], ['tension']),
        ('The flight', 13000, ['strings rise and soar with gentle momentum', 'flowing piano arpeggios', 'uplifting but restrained', 'building'], ['drums']),
        ('Reading', 13000, ['calm tender piano melody', 'soft sustained strings', 'steady and contemplative', 'hopeful'], ['crescendo']),
        ('The swarm', 5600, ['strings swell and gather momentum', 'crescendo', 'rising toward a peak'], ['drums']),
        ('The reply', 6400, ['almost silent', 'one soft high sustained note', 'very quiet piano', 'intimate'], ['strings swell', 'rhythm']),
        ('The name', 8900, ['warm resolution', 'soft strings and piano together', 'gentle major chords', 'arriving home', 'hopeful'], ['tension']),
        ('Where many minds meet', 6060, ['a final soft chord ringing out', 'fading slowly to silence'], ['new melody']),
    ],
}

# a second reading of the score: handmade, like the pictures. The first came back sounding like stock music.
HANDMADE = {
    'positive': ['modern classical', 'neoclassical minimalism', 'intimate felt piano recorded very close, with audible hammers, pedal and the room',
                 'sparse solo cello and violin', 'analog warmth', 'tender and unhurried', 'like a private piano recording late at night'],
    'negative': ['corporate', 'stock music', 'on-hold music', 'upbeat', 'generic background music', 'pop', 'bright synth pads'],
}

def section_lengths():
    """each section's length in ms, from the film's marks: the score is cut to the film, whatever its length"""
    ev = json.loads((ROOT / 'out' / 'made-of-words-events.json').read_text())
    m, L = ev['marks'], ev['length'] - ev.get('intro', 0.0)          # the score is the film's own, after the cover
    edges = [0, 6.9, m['fall'], m['mindB'] - 0.3, m['library'], m['flight'], m['reading'], m['take'], m['cover'], m['T7'], m['tag'], L]
    ms = [round((b - a) * 1000) for a, b in zip(edges, edges[1:])]
    ms[-1] += round(L * 1000) - sum(ms)
    return ms

def compose(name='score', handmade=False):
    out = SOUND / f'{name}.mp3'
    if out.exists(): return print(f'{name} is already made')
    # music_v2_5 takes its plan as chunks, each carrying the whole score's styles as well as its own
    lengths = section_lengths()
    plan = {'chunks': [{'text': '[Instrumental]', 'duration_ms': lengths[k], 'context_adherence': 'high',
                        'positive_styles': pos + SCORE['positive_global_styles'] + (HANDMADE['positive'] if handmade else []),
                        'negative_styles': neg + SCORE['negative_global_styles'] + (HANDMADE['negative'] if handmade else [])}
                       for k, (n, _, pos, neg) in enumerate(SCORE['sections'])]}
    print('score:', sum(lengths) / 1000, 's in', len(lengths), 'sections')
    out.write_bytes(post('https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128', {'composition_plan': plan, 'model_id': 'music_v2_5'}))
    print('made', name)

def key():
    k = os.environ.get('ELEVENLABS_API_KEY')
    if not k: sys.exit('ELEVENLABS_API_KEY is not set')
    return k

def post(url, body):
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={'xi-api-key': key(), 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=900) as r: return r.read()
    except urllib.error.HTTPError as e:
        sys.exit(f'{url.split("?")[0]}: {e.code} {e.read()[:400].decode(errors="replace")}')

def make_fx():
    for name, (text, seconds, influence, loop) in FX.items():
        out = SOUND / f'{name}.mp3'
        if out.exists(): continue
        body = {'text': text, 'duration_seconds': seconds, 'prompt_influence': influence}
        if loop: body['loop'] = True
        out.write_bytes(post('https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128', body))
        print('made', name)

# ---------------------------------------------------------------- the mix
import subprocess
import numpy as np

SR = 48000
VOICE_DB, MUSIC_DB = -18.0, -6.0          # every line of voice at one level; the score's level under it all
SCORE_FILE = 'score'                       # which reading of the score is in the cut
PENTA = [0, 2, 4, 7, 9]                    # D major pentatonic, over D: every bell belongs to the score
D4 = 293.66

def note(step, octave=0):
    """the step-th note of the pentatonic, from D4"""
    o, k = divmod(step, 5)
    return D4 * 2 ** (o + octave + PENTA[k] / 12)

def load(name, stereo=False):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(SOUND / f'{name}.mp3' if not str(name).endswith(('.mp3', '.wav')) else name),
                          '-ac', '2' if stereo else '1', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    x = np.frombuffer(raw, dtype=np.float32).copy()
    return x.reshape(-1, 2).T if stereo else x

def level(x):
    """a sound's loudness, as the RMS of its loud parts, in dB"""
    m = x if x.ndim == 1 else x.mean(0)
    frames = m[: len(m) // 2400 * 2400].reshape(-1, 2400)
    r = np.sqrt((frames ** 2).mean(1)) + 1e-9
    loud = np.sort(r)[len(r) // 2:]
    return 20 * np.log10(loud.mean())

def normal(x, db=-20.0):
    return x * 10 ** ((db - level(x)) / 20)

class Bus:
    """a stereo track; times given to it are the film's own, after the cover, and `off` places them in the cut"""
    def __init__(self, seconds, off=0.0): self.x = np.zeros((2, int(seconds * SR) + SR), np.float32); self.off = off
    def put(self, sig, t, db=0.0, pan=0.0, fade_in=0.004, fade_out=0.02):
        """a mono sound at t seconds, panned (-1 left … 1 right, or a pair to move across it), with short fades"""
        sig = np.asarray(sig, np.float32).copy()
        n = len(sig)
        if n == 0: return
        fi, fo = min(n, int(fade_in * SR)), min(n, int(fade_out * SR))
        if fi: sig[:fi] *= np.linspace(0, 1, fi)
        if fo: sig[-fo:] *= np.linspace(1, 0, fo)
        p = np.linspace(pan[0], pan[1], n) if isinstance(pan, tuple) else np.full(n, pan)
        a = (np.clip(p, -1, 1) + 1) * np.pi / 4
        i = int(round((t + self.off) * SR))
        if i < 0: sig, a, i = sig[-i:], a[-i:], 0
        j = min(self.x.shape[1], i + len(sig))
        g = 10 ** (db / 20)
        self.x[0, i:j] += g * np.cos(a[: j - i]) * sig[: j - i]
        self.x[1, i:j] += g * np.sin(a[: j - i]) * sig[: j - i]
    def put2(self, st, t, db=0.0):
        i = int(round((t + self.off) * SR)); j = min(self.x.shape[1], i + st.shape[1])
        self.x[:, i:j] += 10 ** (db / 20) * st[:, : j - i]

def grain(src, dur, seed, fade=0.01):
    """a piece of a recorded sound, from somewhere in its middle"""
    n = max(int(dur * SR), 32)
    lo, hi = int(0.05 * len(src)), max(int(0.05 * len(src)) + 1, len(src) - n - int(0.05 * len(src)))
    i = lo + int((np.sin(seed * 12.9898) * 43758.5453 % 1) * (hi - lo))
    g = src[i:i + n].copy()
    f = min(len(g) // 2, int(fade * SR))
    if f: g[:f] *= np.linspace(0, 1, f); g[-f:] *= np.linspace(1, 0, f)
    return g

from scipy.signal import butter, sosfilt, sosfiltfilt, fftconvolve

def filt(x, kind, hz, order=2, zero_phase=False):
    sos = butter(order, hz, btype=kind, fs=SR, output='sos')
    return (sosfiltfilt if zero_phase else sosfilt)(sos, x, axis=-1).astype(np.float32)

def shelf_low(x, hz, db):
    """a gentle low shelf: the part below hz raised or lowered by db"""
    low = filt(x, 'lowpass', hz, 1, zero_phase=True)
    return (x + (10 ** (db / 20) - 1) * low).astype(np.float32)

def voiced(x):
    """a voice cleaned as an engineer would: no rumble, less of the close microphone's boom"""
    return shelf_low(filt(x, 'highpass', 80), 220, -2.5)

def compress(x, thresh=-24.0, ratio=2.0, attack=0.015, release=0.25, block=0.005):
    """a gentle compressor on a stereo bus: levels evened, not squashed"""
    n = int(block * SR); m = x.shape[1] // n
    rms = np.sqrt((np.abs(x[:, : m * n]).max(0).reshape(m, n) ** 2).mean(1)) + 1e-9
    lvl = 20 * np.log10(rms)
    a, r = np.exp(-block / attack), np.exp(-block / release)
    env = np.empty(m); e = lvl[0]
    for i, v in enumerate(lvl):
        e = a * e + (1 - a) * v if v > e else r * e + (1 - r) * v
        env[i] = e
    gain_db = np.minimum(0, (thresh - env) * (1 - 1 / ratio))
    g = np.interp(np.arange(x.shape[1]), (np.arange(m) + 0.5) * n, 10 ** (gain_db / 20))
    return (x * g).astype(np.float32)

def room_ir(rt60=0.75, predelay=0.014, seed=3):
    """one small, soft room for everything to share: early reflections, then a darkening tail"""
    n = int((rt60 * 1.4 + predelay) * SR); t = np.arange(n) / SR
    rng = np.random.default_rng(seed); ir = np.zeros((2, n), np.float32)
    tail = np.exp(-6.91 * np.clip(t - predelay, 0, None) / rt60) * (t >= predelay + 0.02)
    for c in range(2):
        ir[c] = rng.standard_normal(n) * tail
        for d, g in [(0.009, 0.55), (0.014, 0.42), (0.021, 0.34), (0.029, 0.26), (0.038, 0.2), (0.051, 0.14)]:
            ir[c, int((predelay + d * (1 + 0.11 * c)) * SR)] += g * (1 if (c + int(d * 1000)) % 2 else -1)
    ir = filt(ir, 'lowpass', 5500)
    return ir / np.sqrt((ir ** 2).sum(1, keepdims=True))

def speaking(voice_bus, look=0.4, hold=0.9, release=1.0):
    """0 … 1, how much a voice is speaking: held through the gaps between words, rising a little before it"""
    from scipy.ndimage import maximum_filter1d
    v = np.abs(voice_bus).mean(0); win = int(0.05 * SR)
    env = np.sqrt(np.convolve(v ** 2, np.ones(win) / win, mode='same'))
    on = maximum_filter1d((env > 10 ** (-40 / 20)).astype(np.float32), int(hold * SR))
    on = np.roll(on, -int(look * SR))
    k = np.hanning(int(release * SR)); k /= k.sum()
    return np.clip(np.convolve(on, k, mode='same'), 0, 1).astype(np.float32)

def short_level(x, win=0.4, block=0.05):
    """short-term level in dB, every `block` seconds"""
    m = np.abs(x).mean(0) if x.ndim == 2 else np.abs(x)
    n = int(block * SR); k = len(m) // n
    ms = (m[: k * n].reshape(k, n) ** 2).mean(1)
    w = max(1, int(win / block)); ms = np.convolve(ms, np.ones(w) / w, mode='same')
    return 10 * np.log10(ms + 1e-12)

def keep_under(bus, voice_bus, margin, held, block=0.05, attack=0.15, release=0.9):
    """a sidechain: while a voice speaks, how far to turn a bus down so it stays `margin` dB under the voice,
    and no further. Smoothed so it never pumps. Returns a gain per sample."""
    from scipy.ndimage import maximum_filter1d
    V, B = short_level(voice_bus), short_level(bus)
    V = maximum_filter1d(V, int(1.6 / block))              # the voice's speaking level, not the gaps between its words
    k = min(len(V), len(B))
    h = held[: k * int(block * SR): int(block * SR)][:k]
    want = np.minimum(0, (V[:k] - margin) - B[:k]) * h
    a, r = np.exp(-block / attack), np.exp(-block / release)
    g = np.empty(k); e = 0.0
    for i, w in enumerate(want):
        e = a * e + (1 - a) * w if w < e else r * e + (1 - r) * w
        g[i] = e
    return np.interp(np.arange(bus.shape[1]), (np.arange(k) + 0.5) * int(block * SR), 10 ** (g / 20)).astype(np.float32)

def rnd(k, salt=0):
    return (np.sin(k * 127.1 + salt * 311.7) * 43758.5453) % 1

# synthesised: the letters' bells, the tiles' notes, the creatures' first sounds
def bell(freq, vel=1.0, decay=1.6):
    t = np.arange(int(decay * 1.6 * SR)) / SR
    y = sum(a * np.sin(2 * np.pi * freq * r * t) * np.exp(-t / (decay * d)) for r, a, d in
            [(1.0, 1.0, 1.0), (2.0, 0.3, 0.55), (3.01, 0.1, 0.3), (4.16, 0.05, 0.2), (5.43, 0.025, 0.12)])
    return (vel * y * np.minimum(1, t / 0.003) / 1.2).astype(np.float32)

def marimba(freq, vel=1.0):
    t = np.arange(int(1.4 * SR)) / SR
    y = sum(a * np.sin(2 * np.pi * freq * r * t) * np.exp(-t / d) for r, a, d in [(1.0, 1.0, 0.45), (3.99, 0.22, 0.09), (9.2, 0.04, 0.03)])
    return (vel * y * np.minimum(1, t / 0.002) / 1.1).astype(np.float32)

def blip(freq, vel=1.0, dur=0.11):
    t = np.arange(int(dur * SR)) / SR
    ph = 2 * np.pi * np.cumsum(freq * (1 - 0.05 * t / dur)) / SR
    y = (2 / np.pi) * np.arcsin(np.sin(ph))
    y = np.convolve(y, np.ones(9) / 9, mode='same')          # soften the corners
    return (vel * y * np.minimum(1, t / 0.004) * np.exp(-t / 0.04)).astype(np.float32)

def letter_step(ch):
    """a letter always rings the same note: the letters mean what they are"""
    if ch.isdigit(): return int(ch) % 10
    if ch.isalpha(): return (ord(ch.lower()) - 97) % 10
    return None

def pan_of(x): return float(np.clip((x * 2 - 1) * 0.8, -0.85, 0.85))

def density(times, t0, t1, step=0.05):
    """how many things happen per second, smoothed, over [t0, t1)"""
    bins = np.zeros(int((t1 - t0) / step) + 1)
    for t in times:
        if t0 <= t < t1: bins[int((t - t0) / step)] += 1
    k = np.hanning(9); k /= k.sum()
    return np.convolve(bins / step, k, mode='same')

def shaped(src, t0, curve, step=0.05):
    """a long sound whose loudness follows a curve (0 … 1) sampled every `step` seconds from t0"""
    n = min(len(src), int(len(curve) * step * SR))
    env = np.interp(np.arange(n) / SR, np.arange(len(curve)) * step, curve)
    return src[:n] * env

def mix():
    import narrate
    ev = json.loads((ROOT / 'out' / 'made-of-words-events.json').read_text())
    L, M, OFF = ev['length'], ev['marks'], ev.get('intro', 0.0)
    fx, bells, voice, music = Bus(L, OFF), Bus(L, OFF), Bus(L, OFF), Bus(L, OFF)
    S = {name: normal(load(name)) for name in FX}

    # the cover: the mark rings once, hops with the creatures' own sound, and the cover swings open
    for k, step in enumerate([0, 2, 4]):
        bells.put(bell(note(step + 5), 0.8, 2.2), -OFF + 0.06 + 0.03 * k, -30, (k - 1) * 0.3)
    bells.put(blip(note(7)), -OFF + 4 * 0.12, -17, 0.0)
    creak = S['cover_open']; thump = int(np.argmax(np.abs(creak))) / SR
    fx.put(creak, -OFF + 1.62 - thump, -12, -0.2, 0.02, 0.4)

    # the sketchbook: five pencils, a grain of scratch for each stroke, where its drawing is
    for k, e in enumerate(ev['pencil']):
        src = S['pencil_sketch'] if e['kind'] == 'outline' else S['pencil_hatch']
        d = max(e['d'], 0.035) + 0.03
        fx.put(grain(src, d, k + 1, 0.006), e['t'], -9 + 3 * np.log10(0.3 + e['len']), pan_of(e['x']), 0.004, 0.012)
    for k, e in enumerate(ev['brush']):              # the night, a sweep at a time, moving across
        fx.put(grain(S['brush_wet'], e['d'] + 0.12, k + 50, 0.03), e['t'], -8, (pan_of(e['x0']), pan_of(e['x1'])), 0.03, 0.08)
    # the washes and the eyes make no sound, so they have none (Fable: things that make no sound should make none)
    for e in ev['salute']:                           # they come alive: five first notes, rising
        bells.put(blip(note(5 + e['k'])), e['t'], -14, pan_of(e['x']))
    for k, e in enumerate(ev['arrive']):             # the colony, landing
        bells.put(blip(note(int(rnd(k, 3) * 8) + 3), 0.8, 0.08), e['t'], -24 + 4 * rnd(k, 4), pan_of(e['x']))

    # the fall into the page is the camera's, and a camera makes no sound: the score falls instead

    # every line of the film, a bell for each letter as it settles, and fainter ones for the candidates that fall away
    # the film's own lines are heard only as their bells; a line a voice speaks needs none, and under the reply
    # there is only its voice and the swarm settling
    for name in ['line1', 'line2', 'sign1', 'tagline', 'address']:
        quiet = name.startswith('sign') or name == 'address'
        for k, e in enumerate(ev[name]):
            step = letter_step(e['ch'])
            if step is None and e['ch'] != '.': continue
            f = note(step + 5) / (2 if e['ch'].isupper() else 1) if step is not None else note(0)
            db = (-31 if quiet else -25) + 2 * rnd(k, 7)
            bells.put(bell(f, 1.0, 1.4), e['t'] + 0.06, db, pan_of(e['x']))
            for n in (1, 2):
                bells.put(bell(f * 2 ** ((rnd(k, 10 + n) - 0.5) * 0.08), 0.6, 0.35), e['t'] - 0.02 * n, db - 11, pan_of(e['x']) + (n - 1.5) * 0.3)

    # the library: the room, and the air of it
    room = normal(load('library'), -20)
    for t in np.arange(M['library'], M['take'] + 6, len(room) / SR - 2.0):
        fx.put(room, t, -12, 0.0, 1.5, 1.5)

    # the flight: the letters lift off the spines, turn as one flock, and land in new minds
    lift = density([e['t'] for e in ev['lift']], M['flight'], M['flight'] + 14)
    fx.put(shaped(S['pages_lift'], M['flight'], np.clip(lift / lift.max() * 1.3, 0, 1)), M['flight'], -11, 0.0, 0.2, 1.5)
    roar = S['flock_roar']                           # from a distance a murmuration is a soft roar, like wind
    fx.put(roar[: int(12 * SR)], M['flight'] + 2.0, -18, (-0.3, 0.3), 2.5, 3.0)
    for k, e in enumerate(ev['born']):               # each new mind, as it lights
        bells.put(marimba(note([0, 2, 4, 5][e['row']] + [0, 2, 4, 7][e['col'] % 4] // 2, -1), 0.9), e['t'], -21, pan_of(e['x']))
    for k, e in enumerate(ev['land'][::3]):          # letters landing as tiles: type being set
        fx.put(grain(S['type_set'], 0.07, k + 300, 0.005), e['t'], -31 + 3 * rnd(k, 8), pan_of(e['x']))

    # reading: each mind flies down to its seat, lands, reads; its own book rises beside it
    for k, e in enumerate(ev['seat']):
        fx.put(S['swoop'], e['t'] + 0.4, -24, pan_of(e['x']), 0.05, 0.3)
        fx.put(grain(S['tap'], 0.2, k + 400, 0.01), e['land'], -20, pan_of(e['x']))
    for k, e in enumerate(ev['book']):
        fx.put(S['book_rise'], e['t'], -21 if not e['hero'] else -15, pan_of(e['x']), 0.02, 0.3)
    for k, e in enumerate(ev['settype']):            # each letter a reader takes, set like type: a soft rain of it
        fade = np.clip((M['take'] + 1.5 - e['t']) / 1.5, 0, 1)
        if fade > 0 and (e['hero'] or k % 2 == 0):
            fx.put(grain(S['type_set'], 0.06, k + 900, 0.004), e['t'], -31 + 3 * rnd(k, 9) + 20 * np.log10(fade + 1e-3), pan_of(e['x']))
    hero = next(e for e in ev['read'] if e['hero'])
    fx.put(S['page_breath'], hero['t'] + 5.0, -18, pan_of(hero['x']), 0.5, 1.0)

    # the reply carried to us
    fx.put(S['swarm_gather'], M['take'] + 0.8, -10, 0.0, 0.5, 0.8)
    fx.put(S['book_rise'], M['lift'], -12, 0.1)
    bells.put(blip(note(7)), M['touched'], -16, 0.1)
    # the rush into the book is the camera's: no sound of its own; the swarm carries it, then settles under the reply
    fx.put(roar[int(4 * SR): int(13 * SR)], M['cover'] - 0.5, -26, 0.0, 1.0, 2.5)
    fx.put(S['cover_open'], M['cover'] - 0.1, -9, 0.2, 0.01, 0.6)

    # the name: the letters rise, turn, the tiles land left to right as a run of notes, the rest fly home
    fx.put(S['pages_lift'], M['T7'], -18, 0.0, 0.3, 2.0)
    fx.put(roar, M['T7'] + 1.0, -20, (0.3, -0.3), 2.0, 3.0)
    tiles = sorted(ev['tile'], key=lambda e: e['x'])
    for k, e in enumerate(tiles):
        bells.put(marimba(note(int(k / len(tiles) * 10) + (4 - e['row']) % 2, -1), 0.8), e['t'], -27, pan_of(e['x']))
    fx.put(S['flock_home'], min(e['t'] for e in ev['home']) + 0.3, -13, 0.0, 0.5, 1.5)

    # the voices, where narrate.py put them
    takes = {}
    for who, text, cue, at, words, (a, b), take in narrate.placed():
        if take not in takes: takes[take] = voiced(load(narrate.VOICE_DIR / f'{take}.mp3'))
        a0 = max(0.0, a - 0.12)
        line = normal(takes[take][int(a0 * SR): int((b + 0.4) * SR)], VOICE_DB)       # every line at the same level
        voice.put(line, at - (a - a0), narrate.QUIETER.get(text, 0.0), 0.0, 0.03, 0.25)
    voice.x = compress(voice.x, thresh=VOICE_DB - 4, ratio=2.0)

    # the score, under it all, stepping back whenever a voice speaks
    score = load(SCORE_FILE, stereo=True)
    score = score * 10 ** ((-20 - level(score)) / 20)
    music.put2(score, 0.0, MUSIC_DB)
    # when a voice speaks, the score makes room where the voice lives (the middle of the spectrum, 250 Hz – 5 kHz)
    # and keeps its body and air; the sounds step back a little. No hole opens under the voice.
    held = speaking(voice.x)
    low, high = filt(music.x, 'lowpass', 250, 2, True), filt(music.x, 'highpass', 5000, 2, True)
    mid = music.x - low - high
    g = keep_under(music.x, voice.x, 10.0, held)           # the score stays 10 dB under a voice: fully in the voice's band,
    music.x = (low * g ** 0.6 + mid * g + high * g ** 0.6).astype(np.float32)   # partly in its body and air
    fx.x *= keep_under(fx.x, voice.x, 11.0, held)
    bells.x *= keep_under(bells.x, voice.x, 13.0, held)
    # under the reply almost nothing: its voice, and the swarm settling (Fable: the stillest moment in the film)
    t = np.arange(music.x.shape[1]) / SR - OFF
    still = np.clip((t - M['cover'] - 0.6) / 0.8, 0, 1) * np.clip((M['T7'] + 0.4 - t) / 0.6, 0, 1)
    music.x *= 1 - 0.7 * still
    fx.x *= 1 - 0.5 * still

    # one small room for all of it, so the voices stand where the pencils and pages are
    ir = room_ir()
    send = voice.x * 10 ** (-15 / 20) + bells.x * 10 ** (-9 / 20) + fx.x * 10 ** (-17 / 20)
    room_bus = np.stack([fftconvolve(send[c], ir[c])[: send.shape[1]] for c in range(2)]).astype(np.float32)
    # and a breath of air under everything, so there is never dead silence
    air = normal(load('library'), -20)
    for t0 in np.arange(-OFF, L - OFF, len(air) / SR - 2.0): fx.put(air, t0, -44, 0.0, 1.5, 1.5)
    # it all goes dark together
    dark = np.clip((np.arange(fx.x.shape[1]) / SR - OFF - M['dark']) / 1.4, 0, 1)
    for bus in (fx, bells, music): bus.x *= (1 - dark) ** 2
    room_bus *= (1 - dark * 0.7) ** 2

    out = ROOT / 'out'
    stems = {'voice': voice.x, 'music': music.x, 'fx': fx.x + bells.x, 'room': room_bus}
    total = compress(voice.x + music.x + fx.x + bells.x + room_bus, thresh=-22, ratio=1.4, attack=0.03, release=0.3)   # glue
    n = int(L * SR)
    scale = min(1.0, 0.98 / np.abs(total).max())          # one scale for all, so the stems still add up to the mix
    for name, x in [*stems.items(), ('mix', total)]:
        write_wav(out / f'made-of-words-{name}.wav', x[:, :n] * scale)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(out / 'made-of-words-mix.wav'),
                    '-af', 'loudnorm=I=-14:TP=-1.0:LRA=11', '-ar', str(SR), str(out / 'made-of-words-master.wav')], check=True)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(out / 'made-of-words.mp4'), '-i', str(out / 'made-of-words-master.wav'),
                    '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart',
                    str(out / 'made-of-words-narrated.mp4')], check=True)
    print('mixed: made-of-words-master.wav, the stems, and made-of-words-narrated.mp4')

def write_wav(path, x):
    x = np.clip(x, -1, 1)
    from scipy.io import wavfile
    wavfile.write(path, SR, (x.T * 32767).astype(np.int16))

if __name__ == '__main__':
    SOUND.mkdir(parents=True, exist_ok=True)
    if '--fx' in sys.argv: make_fx()
    if '--music' in sys.argv: compose(); compose('score_handmade', handmade=True)
    if len(sys.argv) == 1: mix()
