'use strict';

/* ==========================================================================
   Frettle: fretboard visualizer
   1. Music data      2. Chord shape finder (pure, no DOM)
   3. State           4. Sound          5. Rendering      6. Events
   ========================================================================== */

/* ==========================================================================
   1. Music data
   ========================================================================== */
const STORAGE_KEY = 'frettle.settings.v1';
const TOGGLES = [['tglLowG', 'lowG'], ['tglOctaves', 'octaves'], ['tglFlats', 'flats'], ['tglAllTones', 'allTones']];   // [button id, state key]
const SHARP_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const FLAT_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];

/* Open strings as MIDI notes (C4 = 60), from the string nearest your face
   when you hold the instrument to the one nearest the floor. The standard
   ukulele is re-entrant: its first-listed string is a high G. */
const INSTRUMENTS = [
  { id: 'guitar', name: 'Guitar', strings: [40, 45, 50, 55, 59, 64], frets: 22 },
  { id: 'bass', name: 'Bass', strings: [28, 33, 38, 43], frets: 20 },
  { id: 'ukulele', name: 'Standard Ukulele', strings: [67, 60, 64, 69], frets: 18, note: 'high G' },
  { id: 'baritone', name: 'Baritone Ukulele', strings: [50, 55, 59, 64], frets: 18 },
];
/* Default "Voicing" per instrument: '0' = root in the bass, 'any' = any bass note.
   Ukulele chords (re-entrant G) and baritone chords often have another note lowest. */
const DEFAULT_VOICING = { guitar: '0', bass: '0', ukulele: 'any', baritone: 'any' };
const MAX_CAPO = 12;
const SINGLE_DOTS = [3, 5, 7, 9, 15, 17, 19, 21];
const DOUBLE_DOTS = [12, 24];

/* Scales: semitone steps from the root. */
const SCALES = [
  { group: 'Major & modes', items: [
    { id: 'major', name: 'Major (Ionian)', steps: [0, 2, 4, 5, 7, 9, 11] },
    { id: 'dorian', name: 'Dorian', steps: [0, 2, 3, 5, 7, 9, 10] },
    { id: 'phrygian', name: 'Phrygian', steps: [0, 1, 3, 5, 7, 8, 10] },
    { id: 'lydian', name: 'Lydian', steps: [0, 2, 4, 6, 7, 9, 11] },
    { id: 'mixolydian', name: 'Mixolydian', steps: [0, 2, 4, 5, 7, 9, 10] },
    { id: 'minor', name: 'Natural minor (Aeolian)', steps: [0, 2, 3, 5, 7, 8, 10] },
    { id: 'locrian', name: 'Locrian', steps: [0, 1, 3, 5, 6, 8, 10] },
  ] },
  { group: 'Minor variants', items: [
    { id: 'harmonic-minor', name: 'Harmonic minor', steps: [0, 2, 3, 5, 7, 8, 11] },
    { id: 'melodic-minor', name: 'Melodic minor', steps: [0, 2, 3, 5, 7, 9, 11] },
  ] },
  { group: 'Pentatonic & blues', items: [
    { id: 'major-pentatonic', name: 'Major pentatonic', steps: [0, 2, 4, 7, 9] },
    { id: 'minor-pentatonic', name: 'Minor pentatonic', steps: [0, 3, 5, 7, 10] },
    { id: 'blues', name: 'Blues', steps: [0, 3, 5, 6, 7, 10] },
  ] },
  { group: 'Symmetric', items: [
    { id: 'whole-tone', name: 'Whole tone', steps: [0, 2, 4, 6, 8, 10] },
    { id: 'dim-wh', name: 'Diminished (whole-half)', steps: [0, 2, 3, 5, 6, 8, 9, 11] },
    { id: 'dim-hw', name: 'Diminished (half-whole)', steps: [0, 1, 3, 4, 6, 7, 9, 10] },
    { id: 'chromatic', name: 'Chromatic', steps: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
  ] },
];

/* Chords: semitone steps from the root and the interval label of each tone. */
const chord = (id, name, symbol, steps, degrees) => ({ id, name, symbol, steps, degrees: degrees.split(' ') });
const CHORDS = [
  { group: 'Triads', items: [
    chord('maj', 'Major', '', [0, 4, 7], 'R 3 5'),
    chord('min', 'Minor', 'm', [0, 3, 7], 'R b3 5'),
    chord('dim', 'Diminished', 'dim', [0, 3, 6], 'R b3 b5'),
    chord('aug', 'Augmented', 'aug', [0, 4, 8], 'R 3 #5'),
    chord('sus2', 'Suspended 2nd', 'sus2', [0, 2, 7], 'R 2 5'),
    chord('sus4', 'Suspended 4th', 'sus4', [0, 5, 7], 'R 4 5'),
    chord('p5', 'Power chord', '5', [0, 7], 'R 5'),
  ] },
  { group: 'Sixths & sevenths', items: [
    chord('6', 'Major 6th', '6', [0, 4, 7, 9], 'R 3 5 6'),
    chord('m6', 'Minor 6th', 'm6', [0, 3, 7, 9], 'R b3 5 6'),
    chord('7', 'Dominant 7th', '7', [0, 4, 7, 10], 'R 3 5 b7'),
    chord('maj7', 'Major 7th', 'maj7', [0, 4, 7, 11], 'R 3 5 7'),
    chord('m7', 'Minor 7th', 'm7', [0, 3, 7, 10], 'R b3 5 b7'),
    chord('mmaj7', 'Minor-major 7th', 'm(maj7)', [0, 3, 7, 11], 'R b3 5 7'),
    chord('m7b5', 'Half-diminished 7th', 'm7♭5', [0, 3, 6, 10], 'R b3 b5 b7'),
    chord('dim7', 'Diminished 7th', 'dim7', [0, 3, 6, 9], 'R b3 b5 bb7'),
    chord('aug7', 'Augmented 7th', 'aug7', [0, 4, 8, 10], 'R 3 #5 b7'),
    chord('7sus4', 'Dominant 7th sus4', '7sus4', [0, 5, 7, 10], 'R 4 5 b7'),
  ] },
  { group: 'Extended', items: [
    chord('add9', 'Add 9', 'add9', [0, 4, 7, 14], 'R 3 5 9'),
    chord('madd9', 'Minor add 9', 'm(add9)', [0, 3, 7, 14], 'R b3 5 9'),
    chord('69', 'Six-nine', '6/9', [0, 4, 7, 9, 14], 'R 3 5 6 9'),
    chord('9', 'Dominant 9th', '9', [0, 4, 7, 10, 14], 'R 3 5 b7 9'),
    chord('maj9', 'Major 9th', 'maj9', [0, 4, 7, 11, 14], 'R 3 5 7 9'),
    chord('m9', 'Minor 9th', 'm9', [0, 3, 7, 10, 14], 'R b3 5 b7 9'),
    chord('7b9', 'Dominant 7th flat 9', '7♭9', [0, 4, 7, 10, 13], 'R 3 5 b7 b9'),
    chord('7s9', 'Dominant 7th sharp 9', '7♯9', [0, 4, 7, 10, 15], 'R 3 5 b7 #9'),
    chord('m11', 'Minor 11th', 'm11', [0, 3, 7, 10, 14, 17], 'R b3 5 b7 9 11'),
    chord('13', 'Dominant 13th', '13', [0, 4, 7, 10, 14, 21], 'R 3 5 b7 9 13'),
  ] },
];

/* Other common ways to write each chord symbol. */
const CHORD_ALIASES = {
  maj: ['M', 'maj'], min: ['min', '−'], dim: ['°', 'm♭5'], aug: ['+', '(♯5)'], p5: ['(no3)'],
  6: ['M6', 'maj6'], m6: ['min6', '−6'], 7: ['dom7'], maj7: ['M7', 'Δ7'], m7: ['min7', '−7'],
  mmaj7: ['mM7', 'mΔ7'], m7b5: ['ø7', 'min7♭5'], dim7: ['°7'], aug7: ['+7', '7♯5'],
  add9: ['add2'], madd9: ['m(add2)'], maj9: ['M9', 'Δ9'], m9: ['min9', '−9'], 69: ['6add9'],
};
const DEGREE_NAMES = {
  R: 'Root', b2: 'Minor 2nd', 2: 'Major 2nd', b3: 'Minor 3rd', 3: 'Major 3rd', 4: 'Perfect 4th',
  b5: 'Diminished 5th', 5: 'Perfect 5th', '#5': 'Augmented 5th', 6: 'Major 6th',
  bb7: 'Diminished 7th', b7: 'Minor 7th', 7: 'Major 7th', b9: 'Minor 9th', 9: 'Major 9th',
  '#9': 'Augmented 9th', 11: 'Perfect 11th', 13: 'Major 13th',
};
const INVERSION_NAMES = ['Root position', '1st inversion', '2nd inversion', '3rd inversion', '4th inversion', '5th inversion'];
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
const TRIAD_TYPES = ['maj', 'min', 'dim', 'aug'];
const STEP_NAMES = { 1: 'H', 2: 'W', 3: 'W+H', 4: '2W' };

const ALL_CHORDS = CHORDS.flatMap((g) => g.items);
const ALL_SCALES = SCALES.flatMap((g) => g.items);
const findChord = (id) => ALL_CHORDS.find((c) => c.id === id);
const findScale = (id) => ALL_SCALES.find((s) => s.id === id);
const findInstrument = (id) => INSTRUMENTS.find((i) => i.id === id);
const mod12 = (n) => ((n % 12) + 12) % 12;
const fmtDeg = (d) => d.replace(/b/g, '♭').replace(/#/g, '♯');

function chordTones(rootPc, def) {
  return def.steps.map((step, i) => ({ pc: mod12(rootPc + step), deg: def.degrees[i] }));
}

/* ==========================================================================
   2. Chord shape finder
   Slides a 4-fret window up the neck. In each window every string may be
   muted, open (near the nut only) or fretted on a chord tone. A combination
   is kept when it is playable:
   - it sounds every required tone (the 5th is optional in 4+ note chords),
   - the lowest sounding note matches the chosen voicing,
   - at most 4 fingers, where one finger may barre the lowest fret,
   - muted strings sit at the edges (one inner mute allowed on 6 strings).
   Each shape gets a score (fuller, simpler, complete chords score higher)
   and the best one or two per neck position are kept, sorted nut → body.
   ========================================================================== */
const SHAPE_SPAN = 4;      // frets covered by the hand
const MAX_FINGERS = 4;
const OPEN_MAX_POS = 4;    // open strings only combine with shapes that start at fret ≤ 4

function findShapes(inst, rootPc, def, voicing) {
  const tones = chordTones(rootPc, def);
  const n = inst.strings.length;
  const chordPcs = new Set(tones.map((t) => t.pc));
  const bassPc = voicing === 'any' ? null : tones[Number(voicing)].pc;
  // The 5th may be left out of 4+ note chords, the 9th out of 11th and 13th chords
  const hasUpper = def.degrees.includes('11') || def.degrees.includes('13');
  const optional = tones
    .filter((t) => ((t.deg === '5' && tones.length >= 4) || (t.deg === '9' && hasUpper)) && t.pc !== bassPc)
    .map((t) => t.pc);
  const required = tones.map((t) => t.pc).filter((pc) => !optional.includes(pc));
  const minSounding = Math.min(n, Math.max(required.length, tones.length <= 2 ? 2 : 3));
  const maxInner = n >= 6 ? 1 : 0;
  // On a re-entrant tuning (ukulele high G) the lowest note matters little
  const reentrant = inst.strings.some((m, i) => i > 0 && m < inst.strings[i - 1]);
  const found = [];

  function evaluate(frets, pos) {
    const sound = [];
    frets.forEach((f, s) => { if (f >= 0) sound.push({ s, f, midi: inst.strings[s] + f }); });
    if (sound.length < minSounding) return null;

    // Each shape is generated once: in the window starting at its lowest fretted note
    const fretted = sound.filter((x) => x.f > 0);
    const minFret = fretted.length ? Math.min(...fretted.map((x) => x.f)) : 0;
    if (fretted.length ? minFret !== pos : pos !== 1) return null;

    // Muted strings: any number on the low side, one on the high side, few inside
    const first = sound[0].s;
    const last = sound[sound.length - 1].s;
    const leading = first;
    const trailing = n - 1 - last;
    const inner = last - first + 1 - sound.length;
    if (inner > maxInner || trailing > 1) return null;

    const pcs = new Set(sound.map((x) => mod12(x.midi)));
    if (required.some((pc) => !pcs.has(pc))) return null;

    const lowest = sound.reduce((a, b) => (b.midi < a.midi ? b : a));
    const bass = mod12(lowest.midi);
    if (bassPc !== null && bass !== bassPc) return null;

    // Fingers: one per fretted note, but one finger may barre several strings
    // on the same fret if no open or lower-fretted string lies in between
    let fingers = fretted.length;
    for (const v of new Set(fretted.map((x) => x.f))) {
      const at = fretted.filter((x) => x.f === v).map((x) => x.s);
      if (at.length < 2) continue;
      const lo = Math.min(...at);
      const hi = Math.max(...at);
      const blocked = frets.some((f, s) => s > lo && s < hi && f >= 0 && f < v);
      if (!blocked) fingers = Math.min(fingers, fretted.length - at.length + 1);
    }
    if (fingers > MAX_FINGERS) return null;

    // Open strings ringing between fretted notes high up are awkward to keep clear
    let awkwardOpens = 0;
    sound.forEach((x, i) => {
      if (x.f !== 0 || i === 0 || i === sound.length - 1) return;
      if (sound[i - 1].f > 0 && sound[i + 1].f > 0 && Math.max(sound[i - 1].f, sound[i + 1].f) >= 3) awkwardOpens++;
    });

    const midis = sound.map((x) => x.midi);
    const unisons = midis.length - new Set(midis).size;
    const span = fretted.length ? Math.max(...fretted.map((x) => x.f)) - minFret : 0;
    const opens = sound.length - fretted.length;
    const optionalHit = optional.filter((pc) => pcs.has(pc)).length;

    const maxFret = minFret + span;
    let score = optionalHit * 2 + sound.length * 1.2;
    score -= inner * 2.5 + trailing * 2 + leading * (n >= 6 ? 0.4 : 2);
    score -= fingers * 0.5 + span * 0.6 + (span >= 3 ? 0.8 : 0) + unisons * 0.5 + awkwardOpens * 1.5;
    if (opens && maxFret <= 4) score += 0.5 * opens;      // classic open chords
    if (opens && maxFret > 4) score -= 1.5;               // open strings far from the hand
    if (bassPc === null && bass === rootPc && !reentrant) score += n >= 6 ? 3 : 1.5;   // root lowest

    const center = fretted.length ? fretted.reduce((a, x) => a + x.f, 0) / fretted.length : 0;
    return {
      frets: frets.slice(),
      pos: minFret,
      center,
      score,
      sig: midis.slice().sort((a, b) => a - b).join(','),
    };
  }

  for (let pos = 1; pos <= inst.frets; pos++) {
    const top = Math.min(inst.frets, pos + SHAPE_SPAN - 1);
    const options = inst.strings.map((open) => {
      const list = [-1];
      if (pos <= OPEN_MAX_POS && chordPcs.has(mod12(open))) list.push(0);
      for (let f = pos; f <= top; f++) if (chordPcs.has(mod12(open + f))) list.push(f);
      return list;
    });
    const frets = new Array(n);
    const walk = (s) => {
      if (s === n) {
        const shape = evaluate(frets, pos);
        if (shape) found.push(shape);
        return;
      }
      for (const f of options[s]) { frets[s] = f; walk(s + 1); }
    };
    walk(0);
  }
  return pickShapes(found);
}

/* Two shapes are variants of each other when one is the other with strings
   muted, or when a single fret differs and at most one string is muted.
   Swapping an open string for a fretted note counts as a different shape,
   since both versions are usually worth knowing (G: 3 2 0 0 0 3 / 3 2 0 0 3 3). */
function isVariant(a, b) {
  let shared = 0;
  let frets = 0;
  let mutes = 0;
  let openSwap = false;
  a.frets.forEach((f, s) => {
    const g = b.frets[s];
    if (f < 0 && g < 0) return;
    if (f < 0 || g < 0) { mutes++; return; }
    shared++;
    if (f !== g) {
      frets++;
      if (f === 0 || g === 0) openSwap = true;
    }
  });
  if (openSwap || shared - frets < 2) return false;
  return frets === 0 || (frets === 1 && mutes <= 1);
}

/* Best shapes first; skip variants of a better shape and shapes much worse
   than the best one. The list starts with the best shape near the nut (the
   one chord charts show), then the others from the nut up the neck. */
function pickShapes(found) {
  if (!found.length) return [];
  found.sort((a, b) => b.score - a.score);
  const floor = found[0].score - 7;
  const out = [];
  for (const shape of found) {
    if (shape.score < floor) break;
    if (out.some((o) => o.sig === shape.sig || isVariant(o, shape))) continue;
    out.push(shape);
  }
  out.sort((a, b) => a.pos - b.pos || b.score - a.score);
  const near = out.filter((x) => x.pos <= OPEN_MAX_POS);
  const first = (near.length ? near : out).reduce((a, b) => (b.score > a.score ? b : a));
  return [first, ...out.filter((x) => x !== first)];
}

const tabOf = (shape) => shape.frets.map((f) => (f < 0 ? 'x' : f)).join(' ');

/* Node (tests) gets the pure part; the browser runs the app below. */
if (typeof module !== 'undefined') {
  module.exports = { INSTRUMENTS, ALL_CHORDS, findShapes, findChord, findInstrument, tabOf };
}

/* ==========================================================================
   3. State (instrument, switches, capo, chord and scale are saved to
   localStorage; the voicing and the shape shown are not)
   ========================================================================== */
function defaultState() {
  return {
    instrument: 'guitar',
    v: 2,
    flats: false,
    allTones: false,
    octaves: false,
    lowG: false,                      // standard ukulele tuned with a low G (G3)
    chord: { on: true, root: 0, type: 'maj' },
    capo: 0,                          // fret of the capo, 0 = none (all instruments)
    voicing: { ...DEFAULT_VOICING },  // per instrument, this visit only
    shape: 0,                         // index in the shape list, this visit only
    scale: { on: false, root: 0, type: 'major' },
  };
}

function loadState() {
  const s = defaultState();
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!saved || typeof saved !== 'object') return s;
    if (findInstrument(saved.instrument)) s.instrument = saved.instrument;
    for (const k of ['flats', 'allTones', 'octaves', 'lowG']) {
      if (typeof saved[k] === 'boolean') s[k] = saved[k];
    }
    if (saved.chord && findChord(saved.chord.type)) {
      s.chord = { on: saved.chord.on !== false, root: mod12(Number(saved.chord.root) || 0), type: saved.chord.type };
    }
    if (saved.scale && findScale(saved.scale.type)) {
      s.scale = { on: saved.scale.on === true, root: mod12(Number(saved.scale.root) || 0), type: saved.scale.type };
    }
    if (Number.isInteger(saved.capo) && saved.capo >= 0 && saved.capo <= MAX_CAPO) s.capo = saved.capo;
  } catch {
    /* storage unavailable or corrupt: keep defaults */
  }
  return s;
}

function saveState() {
  const { instrument, flats, allTones, octaves, lowG, capo, chord, scale } = state;
  const saved = { instrument, flats, allTones, octaves, lowG, capo, chord, scale };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(saved)); } catch { /* ignore */ }
}

let state = null;
let shapeCache = { key: '', shapes: [] };

/* The selected instrument; the standard ukulele can swap its high G for a low G. */
function instrument() {
  const inst = findInstrument(state.instrument);
  if (inst.id !== 'ukulele' || !state.lowG) return inst;
  return { ...inst, strings: [55, ...inst.strings.slice(1)], note: 'low G' };
}
const capo = () => state.capo;

/* The instrument as it sounds with the capo on: every open string raised,
   fewer frets left. Chord shapes are found on this, so their fret numbers
   count from the capo (0 = the string rings at the capo). */
function cappedInstrument() {
  const inst = instrument();
  const c = capo();
  return { ...inst, strings: inst.strings.map((m) => m + c), frets: inst.frets - c };
}
const noteName = (pc) => (state.flats ? FLAT_NAMES : SHARP_NAMES)[mod12(pc)];
const pitchName = (midi) => noteName(midi) + (Math.floor(midi / 12) - 1);
const stringNumber = (s) => instrument().strings.length - s;   // 1 = string nearest the floor

function voicingFor(def) {
  const v = state.voicing[state.instrument];
  return v === 'any' || (/^\d+$/.test(v) && Number(v) < def.steps.length) ? v : '0';
}

/* Everything the views need about the selected chord, or null. */
function currentChord() {
  if (!state.chord.on) return null;
  const def = findChord(state.chord.type);
  const root = state.chord.root;
  const voicing = voicingFor(def);
  const tones = chordTones(root, def);
  const key = [instrument().strings.join(','), capo(), root, def.id, voicing].join('|');
  if (shapeCache.key !== key) shapeCache = { key, shapes: findShapes(cappedInstrument(), root, def, voicing) };
  const shapes = shapeCache.shapes;
  const index = shapes.length ? Math.min(state.shape, shapes.length - 1) : -1;
  return {
    def, root, voicing, tones, shapes, index,
    shape: shapes[index] || null,
    degOfPc: new Map(tones.map((t) => [t.pc, t.deg])),
    symbol: noteName(root) + def.symbol,
  };
}

function currentScale() {
  if (!state.scale.on) return null;
  const def = findScale(state.scale.type);
  const pcs = def.steps.map((s) => mod12(state.scale.root + s));
  return { def, root: state.scale.root, pcs, set: new Set(pcs) };
}

/* Change the chord and show its first shape. */
function updateChord(patch) {
  Object.assign(state.chord, patch, { on: true });
  state.shape = 0;
  render();
}

function selectShape(index) {
  const ch = currentChord();
  if (!ch || !ch.shapes.length) return;
  state.shape = (index + ch.shapes.length) % ch.shapes.length;
  render();
}

/* ==========================================================================
   4. Sound
   Plucked strings synthesised in the browser (Karplus-Strong): a short burst
   of noise circulates in a delay line one period long and is softened a
   little on every pass, which sounds like a plucked string. Each pitch is
   computed once, on first use, and kept.
   ========================================================================== */
const STRUM_GAP = 0.035;   // seconds between strings in a strum
let audio = null;
const pluckCache = new Map();

function audioOut() {
  if (!audio) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    const ctx = new AC();
    const limiter = ctx.createDynamicsCompressor();   // keeps strums from clipping
    const volume = ctx.createGain();
    volume.gain.value = 0.8;
    limiter.connect(volume);
    volume.connect(ctx.destination);
    audio = { ctx, out: limiter };
  }
  if (audio.ctx.state === 'suspended') audio.ctx.resume();
  return audio;
}

function pluck(ctx, midi) {
  if (pluckCache.has(midi)) return pluckCache.get(midi);
  const sr = ctx.sampleRate;
  const freq = 440 * 2 ** ((midi - 69) / 12);
  // Averaging each sample with the next one shortens the loop by half a
  // sample, so it sounds at sr / (n - 0.5); playbackRate fixes the rounding
  const n = Math.max(2, Math.floor(sr / freq + 0.5));
  const rate = freq / (sr / (n - 0.5));
  const seconds = midi < 48 ? 3 : 2.2;
  const len = Math.floor(sr * seconds);
  const buffer = ctx.createBuffer(1, len, sr);
  const data = buffer.getChannelData(0);

  // Excitation: slightly smoothed noise without DC offset
  const loop = new Float32Array(n);
  let prev = 0;
  for (let i = 0; i < n; i++) { prev = 0.6 * (Math.random() * 2 - 1) + 0.4 * prev; loop[i] = prev; }
  const mean = loop.reduce((a, v) => a + v, 0) / n;
  for (let i = 0; i < n; i++) loop[i] -= mean;

  const damping = 0.997;              // extra loss per pass: shorter, less boomy low notes
  const fade = Math.floor(sr * 0.25); // fade out the tail so it never clicks
  let k = 0;
  for (let i = 0; i < len; i++) {
    const next = (k + 1) % n;
    data[i] = loop[k] * (i > len - fade ? (len - i) / fade : 1);
    loop[k] = damping * 0.5 * (loop[k] + loop[next]);
    k = next;
  }
  const sound = { buffer, rate };
  pluckCache.set(midi, sound);
  return sound;
}

/* Play a pitch now, or `delay` seconds from now. */
function playNote(midi, delay = 0, level = 0.55) {
  const a = audioOut();
  if (!a) return;
  const { buffer, rate } = pluck(a.ctx, midi);
  const src = a.ctx.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = rate;
  const gain = a.ctx.createGain();
  gain.gain.value = level;
  src.connect(gain);
  gain.connect(a.out);
  src.start(a.ctx.currentTime + delay);
}

/* Light up a note on the neck while it sounds. */
function flashCell(s, f, delay = 0) {
  setTimeout(() => {
    const note = els.neck.querySelector(`.cell[data-s="${s}"][data-f="${f}"] .note`);
    if (!note) return;
    note.classList.remove('ping');
    void note.offsetWidth;   // restart the animation
    note.classList.add('ping');
  }, delay * 1000);
}

/* Strum the current shape from the top string down, skipping muted ones. */
function strum() {
  const ch = currentChord();
  if (!ch || !ch.shape) return;
  const inst = instrument();
  const c = capo();
  let i = 0;
  ch.shape.frets.forEach((f, s) => {
    if (f < 0) return;
    const delay = i++ * STRUM_GAP;
    playNote(inst.strings[s] + c + f, delay, 0.45);
    flashCell(s, f + c, delay);
  });
}

/* ==========================================================================
   5. Rendering
   ========================================================================== */
const els = {};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function fillSelect(select, groups, value) {
  select.innerHTML = groups.map((g) => {
    const opts = g.items.map((o) => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('');
    return g.group ? `<optgroup label="${esc(g.group)}">${opts}</optgroup>` : opts;
  }).join('');
  select.value = String(value);
}

const rootOptions = () => [{ items: SHARP_NAMES.map((_, pc) => ({ value: pc, label: noteName(pc) })) }];

function render() {
  const ch = currentChord();
  const sc = currentScale();
  if (ch && ch.shapes.length) state.shape = ch.index;
  renderHeader();
  renderNeck(ch, sc);
  renderChordPanel(ch);
  renderScalePanel(sc, ch);
  saveState();
}

function renderHeader() {
  const inst = instrument();
  els.instrumentPicker.innerHTML = INSTRUMENTS.map((i) =>
    `<button type="button" class="btn" role="radio" data-inst="${i.id}" aria-checked="${i.id === inst.id}">${esc(i.name)}</button>`
  ).join('');
  const tuning = inst.strings.map((m) => noteName(m)).join(' ');
  const extra = inst.note ? `, ${inst.note}` : '';
  const c = capo();
  const capoText = c ? `, capo ${c}: ${inst.strings.map((m) => noteName(m + c)).join(' ')}` : '';
  els.neckTitle.innerHTML = `${esc(inst.name)}<span class="muted h2-sub">${esc(tuning)}${esc(extra)}, ${inst.frets} frets${esc(capoText)}</span>`;
  const maxCapo = Math.min(MAX_CAPO, inst.frets - SHAPE_SPAN);
  fillSelect(els.capoSelect, [{ items: Array.from({ length: maxCapo + 1 }, (_, i) => ({
    value: i, label: i ? `Capo ${i}` : 'No capo',
  })) }], c);
  els.capoSelect.classList.toggle('on', c > 0);
  for (const [id, key] of TOGGLES) {
    els[id].setAttribute('aria-pressed', String(state[key]));
  }
  els.tglLowG.hidden = inst.id !== 'ukulele';
}

function renderNeck(ch, sc) {
  const inst = instrument();
  const n = inst.strings.length;
  const N = inst.frets;
  const c = capo();
  // Columns: string number, open strings, frets 1..N. Row 1 is the ruler,
  // then one row per string with the highest string on top (as in tab).
  const place = (r, c) => `grid-row:${r};grid-column:${c + 1}`;
  const row = (s) => n - s + 1;
  els.neck.style.gridTemplateColumns = `var(--label-w) var(--open-w) repeat(${N}, minmax(var(--cell-w), 1fr))`;
  els.neck.classList.toggle('octaves', state.octaves);

  // Shape frets count from the capo; place them at their real fret
  const shapeAt = new Map();
  if (ch && ch.shape) {
    ch.shape.frets.forEach((f, s) => {
      if (f >= 0) shapeAt.set(`${s}:${f + c}`, ch.degOfPc.get(mod12(inst.strings[s] + c + f)));
    });
  }
  const ghosts = ch && (state.allTones || !ch.shape);

  // One octave number per octave, on its bottom-left cell: the lowest row
  // of the neck that reaches that octave, at its leftmost fret (open
  // strings included). C4 = middle C, as on the piano.
  const octaveOf = (s, f) => Math.floor((inst.strings[s] + f) / 12) - 1;
  const octaveLabels = new Set();
  if (state.octaves) {
    const best = new Map();   // octave → { s, f, r }
    inst.strings.forEach((open, s) => {
      for (let f = 0; f <= N; f++) {
        const o = octaveOf(s, f);
        const b = best.get(o);
        const r = row(s);
        if (!b || r > b.r || (r === b.r && f < b.f)) best.set(o, { s, f, r });
      }
    });
    for (const b of best.values()) octaveLabels.add(`${b.s}:${b.f}`);
  }

  const html = [];
  for (let f = 1; f <= N; f++) {
    const dots = DOUBLE_DOTS.includes(f) ? 2 : SINGLE_DOTS.includes(f) ? 1 : 0;
    const label = f === c ? 'Capo' : `${f}${'<i></i>'.repeat(dots)}`;
    html.push(`<div class="ruler${dots ? ' mark' : ''}${f === c ? ' capo' : ''}" style="${place(1, f + 1)}">${label}</div>`);
  }

  inst.strings.forEach((open, s) => {
    const r = row(s);
    const sw = Math.min(3.2, Math.max(1, (72 - open) / 10)).toFixed(1);
    const num = stringNumber(s);
    html.push(`<div class="slabel" style="${place(r, 0)}" title="String ${num}">${num}</div>`);
    for (let f = 0; f <= N; f++) {
      const midi = open + f;
      const pc = mod12(midi);
      const key = `${s}:${f}`;
      const mark = SINGLE_DOTS.includes(f) || DOUBLE_DOTS.includes(f);
      const where = f === 0 ? `string ${num}, open` : `string ${num}, fret ${f}`;
      let cls = 'note';
      let text = noteName(pc);
      let title = `${pitchName(midi)}, ${where}`;

      if (f < c) {
        // Behind the capo: shown for reference, but cannot be played
        cls += ' plain';
        title += ', behind the capo';
      } else if (f === c && ch && ch.shape && ch.shape.frets[s] < 0) {
        cls += ' mute';
        text = '×';
        title = `String ${num} not played`;
      } else if (shapeAt.has(key)) {
        const deg = shapeAt.get(key);
        cls += ` chord${deg === 'R' ? ' root' : ''}`;
        text = fmtDeg(deg);
        title = `${pitchName(midi)} (${DEGREE_NAMES[deg]}), ${where}`;
      } else if (ghosts && ch.degOfPc.has(pc)) {
        const deg = ch.degOfPc.get(pc);
        cls += ` ghost${deg === 'R' ? ' root' : ''}`;
        text = fmtDeg(deg);
        title = `${pitchName(midi)} (${DEGREE_NAMES[deg]}), ${where}`;
      } else if (sc && sc.set.has(pc)) {
        cls += ` scale${pc === sc.root ? ' scale-root' : ''}`;
      } else {
        cls += ' plain';
      }
      const octave = octaveOf(s, f);
      const cellCls = `cell ${f === 0 ? 'open' : 'fret'}${mark ? ' mark' : ''}${octave % 2 ? ' o-alt' : ''}` +
        `${f < c ? ' behind' : ''}${c && f === c ? ' capo' : ''}`;
      const octTag = octaveLabels.has(key) ? `<span class="oct" title="Octave ${octave}">${octave}</span>` : '';
      html.push(
        `<div class="${cellCls}" role="gridcell" data-s="${s}" data-f="${f}" style="${place(r, f + 1)};--sw:${sw}px">` +
        `${octTag}<span class="${cls}" title="${esc(title)}">${esc(text)}</span></div>`
      );
    }
  });
  // The capo clamps all strings just behind its fret wire
  if (c) {
    html.push(`<div class="capo-bar" style="grid-row:2 / span ${n};grid-column:${c + 2}" ` +
      `title="Place the capo here, just behind fret ${c}" aria-hidden="true"></div>`);
  }
  els.neck.innerHTML = html.join('');
}

function renderChordPanel(ch) {
  fillSelect(els.chordRoot, rootOptions(), state.chord.root);
  fillSelect(els.chordType, [{ items: [{ value: '', label: 'None' }] }, ...CHORDS.map((g) => ({
    group: g.group,
    items: g.items.map((c) => ({ value: c.id, label: c.name })),
  }))], ch ? state.chord.type : '');

  const def = findChord(state.chord.type);
  const tones = chordTones(state.chord.root, def);
  fillSelect(els.chordVoicing, [{ items: [
    ...tones.map((t, i) => ({
      value: String(i),
      label: i === 0 ? `Root position, ${noteName(t.pc)} in bass` : `${INVERSION_NAMES[i]}, ${noteName(t.pc)} (${fmtDeg(t.deg)}) in bass`,
    })),
    { value: 'any', label: 'Any bass note' },
  ] }], voicingFor(def));

  els.chordClear.disabled = !ch;
  els.chordVoicing.disabled = !ch;
  els.shapePrev.disabled = els.shapeNext.disabled = !ch || ch.shapes.length < 2;
  els.chordStrum.disabled = !ch || !ch.shape;

  if (!ch) {
    els.chordSymbol.textContent = '';
    els.chordSymbol.classList.remove('on');
    els.chordMode.textContent = '';
    els.chordName.textContent = 'No chord selected';
    els.chordMeta.textContent = 'Pick a chord type, or click a triad in the scale below.';
    els.chordAlt.textContent = '';
    els.chordCapo.hidden = true;
    els.chordTones.innerHTML = '<li class="np-placeholder">The notes of the selected shape appear here.</li>';
    els.shapeCount.hidden = true;
    els.shapeList.innerHTML = '';
    els.shapeList.dataset.empty = 'No chord selected';
    return;
  }

  const rootName = noteName(ch.root);
  els.chordSymbol.textContent = ch.symbol;
  els.chordSymbol.classList.add('on');
  els.chordMode.textContent = 'Selected';
  els.chordName.textContent = `${rootName} ${ch.def.name.toLowerCase()}`;
  const voicingLabel = ch.voicing === 'any' ? 'Any bass note' : INVERSION_NAMES[Number(ch.voicing)];
  const formula = ch.def.degrees.map((d) => fmtDeg(d === 'R' ? '1' : d)).join(' ');
  els.chordMeta.textContent = `${voicingLabel}, formula ${formula}`;
  const aliases = (CHORD_ALIASES[ch.def.id] || []).map((a) => rootName + a);
  els.chordAlt.textContent = aliases.length ? `= ${aliases.join(', ')}` : '';
  // With a capo, name the shape to play: the chord moved down by the capo
  const c = capo();
  els.chordCapo.hidden = !c;
  els.chordCapo.textContent = c ? `With capo ${c}, play the ${noteName(ch.root - c)}${ch.def.symbol} shape` : '';
  els.tonesLabel.textContent = c ? 'Shape notes, bass to top, frets from the capo' : 'Shape notes, bass to top';

  els.shapeCount.hidden = false;
  els.shapeCount.classList.toggle('warn', !ch.shapes.length);
  els.shapeCount.textContent = ch.shapes.length ? `Shape ${ch.index + 1} / ${ch.shapes.length}` : 'No shape';

  if (!ch.shape) {
    els.chordTones.innerHTML = '<li class="np-placeholder">No playable shape for this voicing on this instrument. ' +
      'Try “Any bass note”. Every chord tone is marked on the neck meanwhile.</li>';
    els.shapeList.innerHTML = '';
    els.shapeList.dataset.empty = 'No shapes found';
    return;
  }

  const inst = cappedInstrument();
  const notes = ch.shape.frets
    .map((f, s) => ({ f, s, midi: inst.strings[s] + f }))
    .filter((x) => x.f >= 0)
    .sort((a, b) => a.midi - b.midi || a.s - b.s);
  els.chordTones.innerHTML = notes.map((x) => {
    const deg = ch.degOfPc.get(mod12(x.midi));
    const open = c ? 'capo' : 'open';
    const loc = x.f === 0 ? `str ${stringNumber(x.s)}, ${open}` : `str ${stringNumber(x.s)}, fr ${x.f}`;
    return `<li class="np-note${deg === 'R' ? ' root' : ''}" data-midi="${x.midi}" data-s="${x.s}" ` +
      `data-f="${x.f + c}" title="Click to hear ${esc(pitchName(x.midi))}">` +
      `<span class="np-note-name">${esc(pitchName(x.midi))}</span>` +
      `<span class="np-deg">${esc(fmtDeg(deg))}</span>` +
      `<span class="np-role">${esc(DEGREE_NAMES[deg])}</span>` +
      `<span class="np-loc"><kbd>${loc}</kbd></span></li>`;
  }).join('');

  els.shapeList.innerHTML = ch.shapes.map((shape, i) => {
    const hasOpen = shape.frets.includes(0);
    const where = shape.pos === 0 || (hasOpen && shape.pos <= OPEN_MAX_POS) ? 'open' : `fr ${shape.pos}`;
    const sel = i === ch.index;
    return `<li><button type="button" class="chip${sel ? ' selected' : ''}" data-shape="${i}" aria-pressed="${sel}" ` +
      `title="Strings low to high${c ? ', frets from the capo' : ''}: ${tabOf(shape)}"><span class="chip-num">${where}</span>` +
      `<span class="mono">${tabOf(shape)}</span></button></li>`;
  }).join('');
  keepChipVisible();
}

/* Scroll the shape list sideways (never the page) to show the selected chip. */
function keepChipVisible() {
  const list = els.shapeList;
  const chip = list.querySelector('.chip.selected');
  if (!chip) return;
  const li = chip.parentElement;
  const left = li.offsetLeft;
  const right = left + li.offsetWidth;
  if (left < list.scrollLeft) list.scrollLeft = left - 8;
  else if (right > list.scrollLeft + list.clientWidth) list.scrollLeft = right - list.clientWidth + 8;
}

function renderScalePanel(sc, ch) {
  fillSelect(els.scaleRoot, rootOptions(), state.scale.root);
  fillSelect(els.scaleType, [{ items: [{ value: '', label: 'None' }] }, ...SCALES.map((g) => ({
    group: g.group,
    items: g.items.map((s) => ({ value: s.id, label: s.name })),
  }))], sc ? state.scale.type : '');
  els.scaleClear.disabled = !sc;

  if (!sc) {
    els.scaleNotes.innerHTML = '<li class="empty-text" style="grid-row:1">No scale selected</li>';
    els.scaleTriads.innerHTML = '<span class="empty-text">Pick a scale type</span>';
    return;
  }

  const parts = [];
  sc.pcs.forEach((pc, i) => {
    parts.push(`<li class="scale-note${i === 0 ? ' root' : ''}">${esc(noteName(pc))}</li>`);
    const next = i + 1 < sc.def.steps.length ? sc.def.steps[i + 1] : 12;
    const gap = next - sc.def.steps[i];
    parts.push(`<li class="scale-gap" aria-label="${gap} semitones"><span>${STEP_NAMES[gap] || gap}</span></li>`);
  });
  parts.push(`<li class="scale-note octave">${esc(noteName(sc.root))}</li>`);
  els.scaleNotes.innerHTML = parts.join('');

  const triads = scaleTriads(sc);
  if (!triads) {
    els.scaleTriads.innerHTML = '<span class="empty-text">Every triad fits in the chromatic scale</span>';
    return;
  }
  if (!triads.length) {
    els.scaleTriads.innerHTML = '<span class="empty-text">This scale contains no major, minor, diminished or augmented triad</span>';
    return;
  }
  els.scaleTriads.innerHTML = triads.map((t) => {
    const def = findChord(t.type);
    const sel = ch && ch.root === t.root && ch.def.id === t.type;
    return `<button type="button" class="chip${sel ? ' selected' : ''}" data-root="${t.root}" data-type="${t.type}" ` +
      `title="Select ${esc(noteName(t.root))} ${def.name.toLowerCase()}"><span class="chip-num">${esc(t.num)}</span>` +
      `${esc(noteName(t.root) + def.symbol)}</button>`;
  }).join('');
}

/* Seven-note scales: stack thirds on each degree (roman numerals).
   Other scales: every major/minor/dim/aug triad whose notes are all in it. */
function scaleTriads(sc) {
  const st = sc.def.steps;
  if (st.length === 12) return null;
  const out = [];
  if (st.length === 7) {
    st.forEach((step, i) => {
      const third = mod12(st[(i + 2) % 7] - step);
      const fifth = mod12(st[(i + 4) % 7] - step);
      const type = third === 4 && fifth === 7 ? 'maj'
        : third === 3 && fifth === 7 ? 'min'
        : third === 3 && fifth === 6 ? 'dim'
        : third === 4 && fifth === 8 ? 'aug' : null;
      if (!type) return;
      const upper = type === 'maj' || type === 'aug';
      const num = (upper ? ROMAN[i] : ROMAN[i].toLowerCase()) + (type === 'dim' ? '°' : type === 'aug' ? '+' : '');
      out.push({ root: mod12(sc.root + step), type, num });
    });
    return out;
  }
  st.forEach((step, i) => {
    const root = mod12(sc.root + step);
    for (const type of TRIAD_TYPES) {
      if (findChord(type).steps.every((s) => sc.set.has(mod12(root + s)))) out.push({ root, type, num: String(i + 1) });
    }
  });
  return out;
}

/* ==========================================================================
   6. Events
   ========================================================================== */
function init() {
  for (const id of ['instrumentPicker', 'neckTitle', 'neck', 'tglLowG', 'tglOctaves', 'tglFlats', 'tglAllTones',
    'chordRoot', 'chordType', 'chordVoicing', 'chordClear', 'chordSymbol', 'chordMode', 'chordName', 'chordMeta',
    'chordAlt', 'chordCapo', 'chordStrum', 'tonesLabel', 'capoSelect', 'chordTones', 'shapeCount', 'shapePrev', 'shapeNext', 'shapeList',
    'scaleRoot', 'scaleType', 'scaleClear', 'scaleNotes', 'scaleTriads']) {
    els[id] = document.getElementById(id);
  }
  state = loadState();

  els.instrumentPicker.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-inst]');
    if (!btn || btn.dataset.inst === state.instrument) return;
    state.instrument = btn.dataset.inst;
    state.shape = 0;
    render();
  });

  for (const [id, key] of TOGGLES) {
    els[id].addEventListener('click', () => {
      state[key] = !state[key];
      if (key === 'lowG') state.shape = 0;   // new tuning, new shapes: start from the first
      render();
    });
  }

  // Clicking the neck jumps to a shape that uses that fret (or the nearest one)
  // Click a note on the neck to hear it (not behind the capo)
  els.neck.addEventListener('click', (e) => {
    const cell = e.target.closest('.cell');
    if (!cell || cell.classList.contains('behind')) return;
    const s = Number(cell.dataset.s);
    const f = Number(cell.dataset.f);
    playNote(instrument().strings[s] + f);
    flashCell(s, f);
  });
  els.chordTones.addEventListener('click', (e) => {
    const card = e.target.closest('[data-midi]');
    if (!card) return;
    playNote(Number(card.dataset.midi));
    flashCell(card.dataset.s, card.dataset.f);
  });
  els.chordStrum.addEventListener('click', strum);

  // Root alone never turns a chord or scale on: "None" in the type menu means off
  // Moving the capo keeps the chord and shows its first shape from the capo
  els.capoSelect.addEventListener('change', () => {
    state.capo = Number(els.capoSelect.value);
    state.shape = 0;
    render();
  });

  els.chordRoot.addEventListener('change', () => {
    const root = Number(els.chordRoot.value);
    if (state.chord.on) updateChord({ root });
    else { state.chord.root = root; render(); }
  });
  els.chordType.addEventListener('change', () => {
    if (els.chordType.value) updateChord({ type: els.chordType.value });
    else { state.chord.on = false; render(); }
  });
  els.chordVoicing.addEventListener('change', () => {
    state.voicing[state.instrument] = els.chordVoicing.value;
    updateChord({});
  });
  els.chordClear.addEventListener('click', () => { state.chord.on = false; render(); });
  els.shapePrev.addEventListener('click', () => selectShape(state.shape - 1));
  els.shapeNext.addEventListener('click', () => selectShape(state.shape + 1));
  els.shapeList.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-shape]');
    if (chip) selectShape(Number(chip.dataset.shape));
  });

  els.scaleRoot.addEventListener('change', () => {
    state.scale.root = Number(els.scaleRoot.value);
    render();
  });
  els.scaleType.addEventListener('change', () => {
    if (els.scaleType.value) Object.assign(state.scale, { type: els.scaleType.value, on: true });
    else state.scale.on = false;
    render();
  });
  els.scaleClear.addEventListener('click', () => { state.scale.on = false; render(); });
  els.scaleTriads.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-type]');
    if (chip) updateChord({ root: Number(chip.dataset.root), type: chip.dataset.type });
  });

  // ← / → cycle through the shapes, Space strums (not while a control has focus)
  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target.closest('select, input, textarea')) return;
    if (e.key === ' ' && !e.target.closest('button')) {
      e.preventDefault();
      strum();
      return;
    }
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const ch = currentChord();
    if (!ch || ch.shapes.length < 2) return;
    e.preventDefault();
    selectShape(state.shape + (e.key === 'ArrowRight' ? 1 : -1));
  });

  render();
}

if (typeof document !== 'undefined') init();
