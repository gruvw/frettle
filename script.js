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
const SAVE_VERSION = 3;   // raised when a default changes for people with saved settings
const TOGGLES = [['tglOctaves', 'octaves'], ['tglFlats', 'flats'], ['tglLefty', 'leftHanded'], ['tglAllTones', 'allTones'],
  ['tglScaleOnly', 'scaleOnly'], ['tglScaleGroups', 'scaleGroups']];   // [button id, state key]
const SHARP_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

/* Open strings as MIDI notes (C4 = 60), from the string nearest your face
   when you hold the instrument to the one nearest the floor. The standard
   ukulele is re-entrant: its first-listed string is a high G. A mandolin's
   strings come in pairs tuned alike: each pair is one string here, as on
   mandolin charts; the mandola is a mandolin a fifth lower (C G D A), played
   with the same shapes. `span` is how many frets a hand covers (small
   mandolin frets: one more); `fifths`: tuned in fifths, which changes scale
   groups. */
const INSTRUMENTS = [
  { id: 'guitar', family: 'Guitar', name: 'Guitar', short: 'Guitar', strings: [40, 45, 50, 55, 59, 64], frets: 22 },
  { id: 'guitar7', family: 'Guitar', name: '7-string Guitar', short: '7-string', strings: [35, 40, 45, 50, 55, 59, 64], frets: 24 },
  { id: 'bass', family: 'Bass', name: 'Bass', short: 'Bass', strings: [28, 33, 38, 43], frets: 20 },
  { id: 'bass5', family: 'Bass', name: '5-string Bass', short: '5-string', strings: [23, 28, 33, 38, 43], frets: 24 },
  { id: 'ukulele', family: 'Ukulele', name: 'Ukulele', short: 'Ukulele', strings: [67, 60, 64, 69], frets: 18 },
  { id: 'baritone', family: 'Ukulele', name: 'Baritone Ukulele', short: 'Baritone', strings: [50, 55, 59, 64], frets: 18 },
  { id: 'mandolin', family: 'Mandolin', name: 'Mandolin', short: 'Mandolin', strings: [55, 62, 69, 76], frets: 20, span: 5, fifths: true },
  { id: 'mandola', family: 'Mandolin', name: 'Mandola', short: 'Mandola', strings: [48, 55, 62, 69], frets: 20, span: 5, fifths: true },
];
/* Other tunings, for the instruments that have common ones; the first is the
   standard tuning. `flats`: write its notes with flats (E♭ standard). */
const TUNINGS = {
  guitar7: [
    { id: 'standard', name: 'Standard', strings: [35, 40, 45, 50, 55, 59, 64] },
    { id: 'drop-a', name: 'Drop A', strings: [33, 40, 45, 50, 55, 59, 64] },
  ],
  bass: [
    { id: 'standard', name: 'Standard', strings: [28, 33, 38, 43] },
    { id: 'drop-d', name: 'Drop D', strings: [26, 33, 38, 43] },
  ],
  guitar: [
    { id: 'standard', name: 'Standard', strings: [40, 45, 50, 55, 59, 64] },
    { id: 'drop-d', name: 'Drop D', strings: [38, 45, 50, 55, 59, 64] },
    { id: 'half-down', name: 'Half step down', strings: [39, 44, 49, 54, 58, 63], flats: true },
    { id: 'whole-down', name: 'Whole step down', strings: [38, 43, 48, 53, 57, 62] },
    { id: 'drop-c', name: 'Drop C', strings: [36, 43, 48, 53, 57, 62] },
    { id: 'dadgad', name: 'DADGAD', strings: [38, 45, 50, 55, 57, 62] },
    { id: 'open-g', name: 'Open G', strings: [38, 43, 50, 55, 59, 62] },
    { id: 'open-d', name: 'Open D', strings: [38, 45, 50, 54, 57, 62] },
    { id: 'open-e', name: 'Open E', strings: [40, 47, 52, 56, 59, 64] },
    { id: 'open-c', name: 'Open C', strings: [36, 43, 48, 55, 60, 64] },
  ],
  ukulele: [
    { id: 'standard', name: 'Standard (high G)', strings: [67, 60, 64, 69] },
    { id: 'low-g', name: 'Low G', strings: [55, 60, 64, 69] },
  ],
};
/* An instrument in one of its tunings (the standard one if none or unknown) */
function tunedInstrument(id, tuningId = 'standard') {
  const inst = findInstrument(id);
  const list = TUNINGS[id];
  if (!list) return inst;
  const tuning = list.find((t) => t.id === tuningId) || list[0];
  return { ...inst, strings: tuning.strings, tuning };
}
/* Default "Voicing" per instrument: '0' = root in the bass, 'any' = any bass note.
   Ukulele chords (re-entrant G), baritone, mandolin and mandola chords often
   have another note lowest. */
const DEFAULT_VOICING = { guitar: '0', guitar7: '0', bass: '0', bass5: '0', ukulele: 'any', baritone: 'any', mandolin: 'any', mandola: 'any' };
const MAX_CAPO = 12;
const SINGLE_DOTS = [3, 5, 7, 9, 15, 17, 19, 21];
const DOUBLE_DOTS = [12, 24];

/* Scales: semitone steps from the root; `short` is the name shown in the
   phone's tab bar, where space is tight. */
const SCALES = [
  { group: 'Major & modes', items: [
    { id: 'major', name: 'Major (Ionian)', short: 'Major', steps: [0, 2, 4, 5, 7, 9, 11] },
    { id: 'dorian', name: 'Dorian', short: 'Dorian', steps: [0, 2, 3, 5, 7, 9, 10] },
    { id: 'phrygian', name: 'Phrygian', short: 'Phrygian', steps: [0, 1, 3, 5, 7, 8, 10] },
    { id: 'lydian', name: 'Lydian', short: 'Lydian', steps: [0, 2, 4, 6, 7, 9, 11] },
    { id: 'mixolydian', name: 'Mixolydian', short: 'Mixolyd.', steps: [0, 2, 4, 5, 7, 9, 10] },
    { id: 'minor', name: 'Natural minor (Aeolian)', short: 'Minor', steps: [0, 2, 3, 5, 7, 8, 10] },
    { id: 'locrian', name: 'Locrian', short: 'Locrian', steps: [0, 1, 3, 5, 6, 8, 10] },
  ] },
  { group: 'Minor variants', items: [
    { id: 'harmonic-minor', name: 'Harmonic minor', short: 'Harm. min', steps: [0, 2, 3, 5, 7, 8, 11] },
    { id: 'melodic-minor', name: 'Melodic minor', short: 'Mel. min', steps: [0, 2, 3, 5, 7, 9, 11] },
  ] },
  { group: 'Pentatonic & blues', items: [
    { id: 'major-pentatonic', name: 'Major pentatonic', short: 'Maj. pent', steps: [0, 2, 4, 7, 9] },
    { id: 'minor-pentatonic', name: 'Minor pentatonic', short: 'Min. pent', steps: [0, 3, 5, 7, 10] },
    { id: 'blues', name: 'Blues', short: 'Blues', steps: [0, 3, 5, 6, 7, 10] },
  ] },
  { group: 'Symmetric', items: [
    { id: 'whole-tone', name: 'Whole tone', short: 'W. tone', steps: [0, 2, 4, 6, 8, 10] },
    { id: 'dim-wh', name: 'Diminished (whole-half)', short: 'Dim. W-H', steps: [0, 2, 3, 5, 6, 8, 9, 11] },
    { id: 'dim-hw', name: 'Diminished (half-whole)', short: 'Dim. H-W', steps: [0, 1, 3, 4, 6, 7, 9, 10] },
    { id: 'chromatic', name: 'Chromatic', short: 'Chromatic', steps: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
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
   Note spelling
   Notes are named the way a key is written. Each note of a scale or chord
   gets its letter from its degree (a 7-note scale uses each letter once, a
   chord's 3rd is two letters above its root...), and its sharp or flat from
   its pitch: F major has B♭ (not A♯), G♯ harmonic minor has F♯♯, Cdim7 is
   C E♭ G♭ B♭♭. A black-key root is spelled like the major or minor key with
   fewer accidentals (D♭ major, C♯ minor); when both are equal (F♯/G♭ major,
   D♯/E♭ minor) the Flats switch decides. Notes outside the key follow the
   key's direction (sharps in sharp keys, flats in flat keys).
   ========================================================================== */
const LETTERS = 'CDEFGAB';
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];
const ACCIDENTALS = { '-2': '♭♭', '-1': '♭', 0: '', 1: '♯', 2: '♯♯' };
const KEY_STEPS = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10] };
// Letter (degree number) of each note, for scales that do not use 7 letters once
const SCALE_LETTERS = {
  'major-pentatonic': [1, 2, 3, 5, 6], 'minor-pentatonic': [1, 3, 4, 5, 7], blues: [1, 3, 4, 5, 5, 7],
  'whole-tone': [1, 2, 3, 4, 5, 7], 'dim-wh': [1, 2, 3, 4, 5, 6, 6, 7], 'dim-hw': [1, 2, 3, 3, 4, 5, 6, 7],
};

/* A pitch class written with a given letter: { pc, letter, acc }. */
function spellAs(pc, letter) {
  let acc = mod12(pc - LETTER_PC[letter]);
  if (acc > 6) acc -= 12;
  return { pc: mod12(pc), letter, acc };
}
const noteText = (n) => LETTERS[n.letter] + ACCIDENTALS[n.acc];
/* Octave numbers follow the letter: B♯3 sounds like C4, C♭4 like B3. */
const pitchText = (midi, n) => noteText(n) + (Math.floor((midi - n.acc) / 12) - 1);
/* A note with no key to follow: natural, or sharp / flat as asked. */
function plainNote(pc, flats) {
  pc = mod12(pc);
  if (LETTER_PC.includes(pc)) return spellAs(pc, LETTER_PC.indexOf(pc));
  return spellAs(pc, LETTER_PC.indexOf(mod12(pc + (flats ? 1 : -1))));
}

/* Spell a scale or chord from its root. offsets: letter offset of each note
   from the root (null: no letters, e.g. chromatic). */
function spellNotes(root, steps, offsets, flats) {
  return steps.map((step, i) => {
    const n = offsets ? spellAs(root.pc + step, (root.letter + offsets[i]) % 7) : plainNote(root.pc + step, flats);
    return Math.abs(n.acc) > 2 ? plainNote(root.pc + step, flats) : n;
  });
}
function spellKey(rootPc, steps, offsets, preferFlats, forcedRoot = null) {
  const minor = steps.some((x) => mod12(x) === 3) && !steps.some((x) => mod12(x) === 4);
  const keySteps = KEY_STEPS[minor ? 'minor' : 'major'];
  const keyNotes = (root) => keySteps.map((st, i) => spellAs(root.pc + st, (root.letter + i) % 7));
  const cost = (root) => keyNotes(root).reduce((sum, n) => sum + Math.abs(n.acc) + (Math.abs(n.acc) > 1 ? 10 : 0), 0);
  const doubles = (root) => spellNotes(root, steps, offsets, preferFlats).filter((n) => Math.abs(n.acc) > 1).length;
  let root = forcedRoot;
  if (!root) {
    const pc = mod12(rootPc);
    const choices = LETTER_PC.includes(pc) || !offsets
      ? [plainNote(pc, preferFlats)]
      : [plainNote(pc, false), plainNote(pc, true)];
    root = choices.sort((x, y) => cost(x) - cost(y) || doubles(x) - doubles(y)
      || (preferFlats ? x.acc - y.acc : y.acc - x.acc))[0];
  }
  const lean = keyNotes(root).reduce((sum, n) => sum + n.acc, 0);
  const flats = lean < 0 || (lean === 0 && preferFlats);
  const notes = spellNotes(root, steps, offsets, flats);
  const names = new Map();
  for (const n of notes) if (!names.has(n.pc)) names.set(n.pc, n);
  return { root, notes, names, flats };
}
function spellScale(rootPc, def, preferFlats) {
  const offsets = def.steps.length >= 12 ? null : (SCALE_LETTERS[def.id] || [1, 2, 3, 4, 5, 6, 7]).map((d) => d - 1);
  return spellKey(rootPc, def.steps, offsets, preferFlats);
}
const degreeOffset = (deg) => (deg === 'R' ? 0 : (Number(deg.replace(/\D/g, '')) - 1) % 7);
function spellChord(rootPc, def, preferFlats, forcedRoot = null) {
  return spellKey(rootPc, def.steps, def.degrees.map(degreeOffset), preferFlats, forcedRoot);
}

/* ==========================================================================
   2. Chord shape finder
   1) Every playable shape is generated: within a 4-fret window, each string
      is muted, open (near the nut) or fretted on a chord tone, and the shape
      must sound every required tone (the 5th may be left out of 4+ note
      chords, the 9th out of 11th and 13th chords), have the chosen bass
      note, need at most 4 fingers and keep muted strings sensible.
   2) Each shape is described by a few measured features (strings sounding,
      muted strings, fingers, barre, stretch, open strings, position...).
   3) Its score is the weighted sum of those features. The weights (below)
      were tuned so the first shape matches standard chord charts for guitar,
      ukulele and baritone ukulele, and so the listed shapes match a large
      reference chord database.
   The best shape comes first, then the others from the nut up the neck.
   ========================================================================== */
const SHAPE_SPAN = 4;      // frets covered by the hand
const MAX_FINGERS = 4;
const OPEN_MAX_POS = 5;    // open strings only combine with shapes that start at fret ≤ 5
const SHAPE_WEIGHTS = {
  sound: 0.25,        // per sounding string
  opt: 2.75,          // optional tone (5th, or 9th of 11/13 chords) present
  lead: -0.4,         // muted string below the bass (6 strings)
  leadSmall: -4,      // muted string below the bass (4 strings)
  inner: -3.75,       // muted string between sounding ones
  trail: -4.5,        // muted string above the top note
  fingers: -0.12,     // per finger
  barre: 0.25,        // index finger barre
  span: -0.6,         // per fret of stretch
  bigspan: -2.8,      // stretch of 3+ frets
  openLow: 0,         // open string in an open-position chord
  openHigh: -4,       // per open string in a shape that reaches fret 5 or higher
  sandwich: -2.25,    // open string ringing between fretted notes up the neck
  barreOpen: -0.5,    // open string beside a barre that holds the bass
  unison: -0.25,      // same pitch twice
  rootBass: 3,        // root is the lowest note (6 strings)
  rootBassSmall: 1,   // root is the lowest note (4 strings)
  pos: -0.5,          // per fret of position (only used to pick the first shape)
};

/* Barres to draw on the neck for a shape, as chord charts show them: the
   index finger across the lowest fret when the shape is a movable one (no
   open strings), or when it would need more than four fingers without it;
   then a second finger across neighbouring strings at the highest fret if
   the shape still needs one. Never drawn over a muted or open string.
   Returns [{ fret, from, to }], strings from low to high. */
function barresFor(frets) {
  const fretted = [];
  frets.forEach((f, s) => { if (f > 0) fretted.push({ s, f }); });
  if (fretted.length < 2) return [];
  const low = Math.min(...fretted.map((x) => x.f));
  const high = Math.max(...fretted.map((x) => x.f));
  const atLow = fretted.filter((x) => x.f === low).map((x) => x.s);
  const from = Math.min(...atLow);
  const to = Math.max(...atLow);
  const out = [];
  let fingers = fretted.length;   // one finger per note, until a barre takes several
  const indexBarre = atLow.length >= 2 && !frets.slice(from, to + 1).some((f) => f < low);
  if (indexBarre && (!frets.includes(0) || fingers > MAX_FINGERS)) {
    out.push({ fret: low, from, to });
    fingers = 1 + fretted.filter((x) => x.f > low).length;
  }
  if (fingers > MAX_FINGERS && high > low) {
    const top = fretted.filter((x) => x.f === high).map((x) => x.s).sort((x, y) => x - y);
    if (top.length >= 2 && top[top.length - 1] - top[0] === top.length - 1) out.push({ fret: high, from: top[0], to: top[top.length - 1] });
  }
  return out;
}

/* Fingers needed: the index finger may barre the lowest fret (if no open
   or muted string lies under the barre: the barre would make it sound), and
   one more finger may barre adjacent strings at the highest fret (as in an
   A-shape barre chord). */
function fingersFor(frets) {
  const fretted = [];
  frets.forEach((f, s) => { if (f > 0) fretted.push({ s, f }); });
  if (!fretted.length) return { fingers: 0, barre: false, barreFrom: -1 };
  const low = Math.min(...fretted.map((x) => x.f));
  const high = Math.max(...fretted.map((x) => x.f));
  const atLow = fretted.filter((x) => x.f === low).map((x) => x.s);
  const lo = Math.min(...atLow);
  const hi = Math.max(...atLow);
  const barre = atLow.length >= 2 && !frets.slice(lo, hi + 1).some((f) => f < low);
  let fingers = barre ? 1 : atLow.length;
  const rest = fretted.filter((x) => x.f > low);
  if (high > low) {
    const top = rest.filter((x) => x.f === high).map((x) => x.s).sort((x, y) => x - y);
    const adjacent = top.length >= 2 && top[top.length - 1] - top[0] === top.length - 1;
    fingers += adjacent ? rest.length - top.length + 1 : rest.length;
  }
  return { fingers, barre, barreFrom: barre ? lo : -1 };
}

function shapeCandidates(inst, rootPc, def, voicing) {
  const tones = chordTones(rootPc, def);
  const n = inst.strings.length;
  const chordPcs = new Set(tones.map((t) => t.pc));
  const bassPc = voicing === 'any' ? null : tones[Number(voicing)].pc;
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

    const first = sound[0].s;
    const last = sound[sound.length - 1].s;
    const trail = n - 1 - last;
    const inner = last - first + 1 - sound.length;
    if (inner > maxInner || trail > 1) return null;

    const pcs = new Set(sound.map((x) => mod12(x.midi)));
    if (required.some((pc) => !pcs.has(pc))) return null;

    const lowest = sound.reduce((x, y) => (y.midi < x.midi ? y : x));
    const bass = mod12(lowest.midi);
    if (bassPc !== null && bass !== bassPc) return null;

    const { fingers, barre, barreFrom } = fingersFor(frets);
    if (fingers > MAX_FINGERS) return null;

    // Open strings ringing between fretted notes high up are awkward to keep clear
    let sandwich = 0;
    sound.forEach((x, i) => {
      if (x.f !== 0 || i === 0 || i === sound.length - 1) return;
      if (sound[i - 1].f > 0 && sound[i + 1].f > 0 && Math.max(sound[i - 1].f, sound[i + 1].f) >= 3) sandwich++;
    });
    const midis = sound.map((x) => x.midi);
    const span = fretted.length ? Math.max(...fretted.map((x) => x.f)) - minFret : 0;
    const opens = sound.length - fretted.length;
    const maxFret = minFret + span;
    const small = n < 5;   // 4 strings: ukulele, bass, mandolin, mandola
    const feat = {
      sound: sound.length,
      opt: optional.filter((pc) => pcs.has(pc)).length,
      lead: small ? 0 : first,
      leadSmall: small ? first : 0,
      inner,
      trail,
      fingers,
      barre: barre ? 1 : 0,
      span,
      bigspan: span >= 3 ? 1 : 0,
      openLow: opens && maxFret <= 4 ? opens : 0,
      openHigh: maxFret >= 5 ? opens : 0,
      sandwich,
      barreOpen: barre && barreFrom === first && opens ? 1 : 0,
      unison: midis.length - new Set(midis).size,
      rootBass: !small && bassPc === null && bass === rootPc && !reentrant ? 1 : 0,
      rootBassSmall: small && bassPc === null && bass === rootPc && !reentrant ? 1 : 0,
      pos: minFret,
    };
    const center = fretted.length ? fretted.reduce((acc, x) => acc + x.f, 0) / fretted.length : 0;
    return { frets: frets.slice(), pos: minFret, center, feat, sig: midis.slice().sort((x, y) => x - y).join(',') };
  }

  for (let pos = 1; pos <= inst.frets; pos++) {
    const top = Math.min(inst.frets, pos + (inst.span || SHAPE_SPAN) - 1);
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
  return found;
}

function findShapes(inst, rootPc, def, voicing, weights = SHAPE_WEIGHTS) {
  return pickShapes(shapeCandidates(inst, rootPc, def, voicing), weights, chartShape(inst, rootPc, def));
}

/* Two shapes are variants of each other when one is the other with strings
   muted, or when a single fret differs and at most one string is muted.
   Near the nut, swapping an open string for a fretted note counts as a
   different shape, since both versions are worth knowing (G: 3 2 0 0 0 3 /
   3 2 0 0 3 3); higher up, an open string in a fretted shape is a variant.
   A fret that moves more than 2 frets means another hand position, so the
   shapes are different. */
const openPosition = (frets) => Math.max(...frets) <= 4;
function isVariant(a, b) {
  let shared = 0;
  let frets = 0;
  let mutes = 0;
  let openSwap = false;
  let far = false;
  a.frets.forEach((f, s) => {
    const g = b.frets[s];
    if (f < 0 && g < 0) return;
    if (f < 0 || g < 0) { mutes++; return; }
    shared++;
    if (f !== g) {
      frets++;
      if (f === 0 || g === 0) openSwap = true;
      else if (Math.abs(f - g) > 2) far = true;   // a different hand position
    }
  });
  if (far || (openSwap && openPosition(a.frets) && openPosition(b.frets)) || shared - frets < 2) return false;
  return frets === 0 || (frets === 1 && mutes <= 1);
}

/* Standard chord-chart shapes for the most used chords, strings low to high,
   roots C C♯ D E♭ E F F♯ G A♭ A B♭ B. When the chart shape is playable on
   the current neck (and fits the chosen voicing) it comes first, since that
   is the shape players expect. A table also serves any tuning with the same
   note names (low-G ukulele), the same tuning shifted (a capo), or shifted
   by a fixed interval (baritone ukulele = ukulele a fourth lower). */
const CHART_SHAPES = [
  { strings: [40, 45, 50, 55, 59, 64], types: {
    maj: 'x32010 x46664 xx0232 x68886 022100 133211 244322 320003 466544 x02220 x13331 x24442',
    min: 'x35543 x46654 xx0231 x68876 022000 133111 244222 355333 466444 x02210 x13321 x24432',
    7: 'x32310 x46464 xx0212 x68686 020100 131211 242322 320001 464544 x02020 x13131 x21202',
    m7: 'x35343 x46454 xx0211 x68676 020000 131111 242222 353333 464444 x02010 x13121 x20202',
    maj7: 'x32000 x46564 xx0222 x68786 021100 xx3210 xx4321 320002 4x554x x02120 x13231 x24342',
  } },
  { strings: [67, 60, 64, 69], types: {
    maj: '0003 1114 2220 0331 4442 2010 3121 0232 5343 2100 3211 4322',
    min: '0333 1444 2210 3321 0432 1013 2120 0231 1342 2000 3111 4222',
    7: '0001 1112 2223 3334 1202 2313 3424 0212 1323 0100 1211 2322',
    m7: '3333 1102 2213 3324 0202 1313 2424 0211 1322 0000 1111 2222',
    maj7: '0002 1113 2224 3335 1302 2413 3524 0222 1333 1100 3210 3322',
  } },
];
function chartShape(inst, rootPc, def) {
  // A 7-string guitar plays the 6-string chart shapes, its low string muted
  if (inst.strings.length === 7) {
    const six = chartShape({ ...inst, strings: inst.strings.slice(1) }, rootPc, def);
    return six && [-1, ...six];
  }
  for (const chart of CHART_SHAPES) {
    if (chart.strings.length !== inst.strings.length || !chart.types[def.id]) continue;
    const shift = mod12(inst.strings[0] - chart.strings[0]);
    if (!inst.strings.every((m, i) => mod12(m - chart.strings[i]) === shift)) continue;
    const shape = chart.types[def.id].split(' ')[mod12(rootPc - shift)];
    return [...shape].map((c) => (c === 'x' ? -1 : Number(c)));
  }
  return null;
}

/* Score every candidate and keep the good ones: shapes much worse than the
   best are dropped, and so are variants of a better shape. Position on the
   neck only matters for choosing the first shape (the chart shape when there
   is one, else the best scoring one); the others follow from the nut up. */
const SHAPE_FLOOR = 7;     // keep shapes within this much of the best (ignoring position)
function pickShapes(found, weights, chart = null) {
  if (!found.length) return [];
  for (const shape of found) {
    let score = 0;
    for (const k in shape.feat) score += (weights[k] || 0) * shape.feat[k];
    shape.score = score;
    shape.quality = score - (weights.pos || 0) * shape.feat.pos;
  }
  found.sort((x, y) => y.quality - x.quality || x.pos - y.pos);
  const floor = found[0].quality - SHAPE_FLOOR;
  const chartKey = chart && chart.join(',');
  const pinned = chartKey ? found.find((x) => x.frets.join(',') === chartKey) : null;
  const out = pinned ? [pinned] : [];
  for (const shape of found) {
    if (shape === pinned || shape.quality < floor) continue;
    const i = out.findIndex((o) => o.sig === shape.sig || isVariant(o, shape));
    if (i < 0) { out.push(shape); continue; }
    // Of two near-equal variants, keep the one that does not mute an inner string
    const o = out[i];
    if (o !== pinned && shape.feat.inner < o.feat.inner && shape.quality >= o.quality - 2) out[i] = shape;
  }
  const first = pinned || out.reduce((x, y) => (y.score > x.score || (y.score === x.score && y.pos < x.pos) ? y : x));
  return [first, ...out.filter((x) => x !== first).sort((x, y) => x.pos - y.pos || y.score - x.score)];
}

const tabOf = (shape) => shape.frets.map((f) => (f < 0 ? 'x' : f)).join(' ');
/* Compact tab for tight spaces: "x32010", spaced only when a fret has two digits */
/* Where a shape sits, as players say it: "open" for an open-position shape
   (open strings, nothing above fret 4), else "fret N", its lowest fretted
   fret (counted from the capo, like the tab). */
const shapePlace = (shape) => (shape.pos === 0 || (shape.frets.includes(0) && openPosition(shape.frets))
  ? 'open' : `fret ${shape.pos}`);
const shortTab = (shape) => shape.frets.map((f) => (f < 0 ? 'x' : f)).join(shape.frets.some((f) => f > 9) ? ' ' : '');

/* Node (tests) gets the pure part; the browser runs the app below. */
if (typeof module !== 'undefined') {
  module.exports = {
    barresFor, fingersFor, INSTRUMENTS, TUNINGS, tunedInstrument, ALL_CHORDS, findShapes, findChord, findInstrument, tabOf,
    shapeCandidates, pickShapes, chartShape, SHAPE_WEIGHTS,
    ALL_SCALES, spellScale, spellChord, noteText, pitchText, plainNote };
  module.exports.groupsFor = (...args) => scaleGroups(...args);
}

/* ==========================================================================
   3. State (instrument, switches, capo, chord and scale are saved to
   localStorage; the voicing and the shape shown are not)
   ========================================================================== */
function defaultState() {
  return {
    instrument: 'guitar',
    flats: false,
    allTones: false,
    scaleOnly: true,                  // hide the notes that are not in the scale
    scaleGroups: true,                // outline the scale in groups of notes per string
    leftHanded: false,                // mirror the neck
    octaves: false,
    tuning: {},                       // tuning id per instrument that has several
    chord: { on: true, root: 0, type: 'maj' },
    recent: [],                       // recently used chords [{ root, type, shapes }], shared by all instruments
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
    for (const k of ['flats', 'allTones', 'octaves', 'scaleOnly', 'scaleGroups', 'leftHanded']) {
      if (typeof saved[k] === 'boolean') s[k] = saved[k];
    }
    // A default that changed is applied once to settings saved before it:
    // version 2 turned the groups on, version 3 "Only scale notes"
    if (!(saved.v >= 2)) s.scaleGroups = true;
    if (!(saved.v >= 3)) s.scaleOnly = true;
    if (saved.chord && findChord(saved.chord.type)) {
      s.chord = { on: saved.chord.on !== false, root: mod12(Number(saved.chord.root) || 0), type: saved.chord.type };
    }
    // Recent chords: one list (an older save had a list per instrument: they
    // are merged, the current instrument's first)
    const lists = Array.isArray(saved.recent) ? [saved.recent]
      : saved.recent && typeof saved.recent === 'object'
        ? Object.entries(saved.recent).sort(([a], [b]) => (b === s.instrument) - (a === s.instrument)).map(([, l]) => l) : [];
    for (const r of lists.flat()) {
      if (!r || !findChord(r.type) || !Number.isInteger(r.root) || s.recent.length >= RECENT_MAX) continue;
      if (s.recent.some((x) => x.root === mod12(r.root) && x.type === r.type)) continue;
      const shapes = {};
      const kept = r.shapes && typeof r.shapes === 'object' ? r.shapes : typeof r.context === 'string' ? { [r.context]: r.shape } : {};
      for (const [ctx, shape] of Object.entries(kept)) if (Number.isInteger(shape) && shape >= 0) shapes[ctx] = shape;
      s.recent.push({ root: mod12(r.root), type: r.type, used: -RECENT_MAX + s.recent.length, shapes });
    }
    if (saved.scale && findScale(saved.scale.type)) {
      s.scale = { on: saved.scale.on === true, root: mod12(Number(saved.scale.root) || 0), type: saved.scale.type };
    }
    if (Number.isInteger(saved.capo) && saved.capo >= 0 && saved.capo <= MAX_CAPO) s.capo = saved.capo;
    for (const id of Object.keys(TUNINGS)) {
      const t = saved.tuning && saved.tuning[id];
      if (TUNINGS[id].some((x) => x.id === t)) s.tuning[id] = t;
    }
    if (saved.lowG === true && !s.tuning.ukulele) s.tuning.ukulele = 'low-g';   // the old "Low G" switch
  } catch {
    /* storage unavailable or corrupt: keep defaults */
  }
  return s;
}

function saveState() {
  const { instrument, flats, allTones, octaves, tuning, scaleOnly, scaleGroups, leftHanded, capo, chord, scale } = state;
  const saved = { v: SAVE_VERSION, instrument, flats, allTones, octaves, tuning, scaleOnly, scaleGroups, leftHanded, capo, chord, scale };
  saved.recent = state.recent.map(({ root, type, shapes }) => ({ root, type, shapes }));
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(saved)); } catch { /* ignore */ }
}

/* Shareable links. The address holds what is on the neck, so it can be
   shared, bookmarked or reloaded as it is:
     ?instrument=guitar&tuning=drop-d&capo=2&chord=A-m7&voicing=1
     &shape=x-0-2-0-1-0&scale=A-minor-pentatonic
   Only what differs from the defaults is written (the instrument always).
   How you like to see the neck (left-handed, flats, octaves, the switches)
   stays yours: it is not in the link. A shape is written as its frets, so a
   link keeps showing the same shape even if the shape list changes. */
const LINK_KEYS = ['instrument', 'tuning', 'capo', 'chord', 'voicing', 'shape', 'scale'];
const VOICINGS = ['0', '1', '2', '3', '4', '5', 'any'];
const linkNote = (n) => LETTERS[n.letter] + (n.acc > 0 ? '#'.repeat(n.acc) : 'b'.repeat(-n.acc));
function parseLinkNote(text) {   // "A", "Bb", "F#" (or "Fs", "F♯") → pitch class
  const m = /^([A-Ga-g])([#s♯]{1,2}|[b♭]{1,2})?$/.exec(text || '');
  if (!m) return null;
  const acc = m[2] ? (/[#s♯]/.test(m[2]) ? 1 : -1) * m[2].length : 0;
  return mod12(LETTER_PC[LETTERS.indexOf(m[1].toUpperCase())] + acc);
}
const linkFrets = (frets) => frets.map((f) => (f < 0 ? 'x' : f)).join('-');
/* "A-minor-pentatonic" → { root, id } (ids may contain hyphens, roots do not) */
function parseLinkPair(text) {
  const m = /^([^-]+)-(.+)$/.exec(text || '');
  const root = m && parseLinkNote(m[1]);
  return root === null || !m ? null : { root, id: m[2] };
}

function linkParams() {
  const p = new URLSearchParams();
  const inst = instrument();
  p.set('instrument', state.instrument);
  if (inst.tuning && inst.tuning.id !== 'standard') p.set('tuning', inst.tuning.id);
  if (capo()) p.set('capo', String(capo()));
  if (state.chord.on) {
    const def = findChord(state.chord.type);
    p.set('chord', `${linkNote(chordSpelling(state.chord.root, def).root)}-${def.id}`);
    const voicing = state.voicing[state.instrument];
    if (voicing !== DEFAULT_VOICING[state.instrument]) p.set('voicing', voicing);
    const ch = currentChord();
    if (ch && ch.shape && ch.index > 0) p.set('shape', linkFrets(ch.shape.frets));
  }
  if (state.scale.on) {
    const def = findScale(state.scale.type);
    p.set('scale', `${linkNote(scaleSpelling(state.scale.root, def).root)}-${def.id}`);
  }
  return p;
}

/* Opened from a link: show what it holds, and nothing left over from your
   last visit (no chord, scale or capo unless the link has one). Returns
   false for an address without a link. */
function applyLink(search) {
  const p = new URLSearchParams(search);
  if (!LINK_KEYS.some((k) => p.has(k))) return false;
  // A link without an instrument (written by hand) shows on yours, as you tuned it
  if (findInstrument(p.get('instrument'))) {
    state.instrument = p.get('instrument');
    const tunings = TUNINGS[state.instrument];
    if (tunings) state.tuning[state.instrument] = tunings.some((t) => t.id === p.get('tuning')) ? p.get('tuning') : 'standard';
  }
  const c = Number(p.get('capo') || 0);
  state.capo = Number.isInteger(c) && c >= 0 && c <= MAX_CAPO ? c : 0;
  const chord = parseLinkPair(p.get('chord'));
  if (chord && findChord(chord.id) && findChord(chord.id).id === chord.id) state.chord = { on: true, root: chord.root, type: chord.id };
  else state.chord.on = false;
  state.voicing[state.instrument] = VOICINGS.includes(p.get('voicing')) ? p.get('voicing') : DEFAULT_VOICING[state.instrument];
  const scale = parseLinkPair(p.get('scale'));
  if (scale && findScale(scale.id) && findScale(scale.id).id === scale.id) state.scale = { on: true, root: scale.root, type: scale.id };
  else state.scale.on = false;
  state.shape = 0;
  const ch = state.chord.on && p.get('shape') ? currentChord() : null;
  const at = ch ? ch.shapes.findIndex((shape) => linkFrets(shape.frets) === p.get('shape')) : -1;
  if (at > 0) state.shape = at;
  return true;
}

/* Keep the address in step with the neck, right away (a reload shows what
   you just picked). Safari refuses too many address updates in a row: then
   it is tried again a moment later. */
let linkRetry = 0;
function syncLink() {
  if (typeof history === 'undefined' || !history.replaceState) return;
  clearTimeout(linkRetry);
  const query = `?${linkParams()}`;
  if (query === location.search) return;
  try { history.replaceState(history.state, '', `${location.pathname}${query}${location.hash}`); } catch {
    linkRetry = setTimeout(syncLink, 1000);
  }
}

/* A line for the share sheet: "Am7 over A minor pentatonic, on guitar (capo 2)" */
function linkSummary() {
  const ch = currentChord();
  const sc = currentScale();
  const what = [ch && ch.symbol, sc && `${sc.rootName} ${scaleTitle(sc.def)}`].filter(Boolean).join(' over ');
  const inst = instrument();
  const setup = [tuningName(inst), capo() ? `capo ${capo()}` : ''].filter(Boolean).join(', ');
  return `${what || 'The neck'}, on ${inst.name.toLowerCase()}${setup ? ` (${setup})` : ''}`;
}

/* Share: the phone's share sheet, or copy the link. A copied link turns the
   button's icon into a tick for a moment. */
// Drawn 1 unit left of centre: its two dots on the right make it look right-heavy otherwise
const SHARE_ICON = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><g transform="translate(-1 0)"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></g></svg>';
const DONE_ICON = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
async function shareLink() {
  const url = new URL(`?${linkParams()}`, location.href).href;
  if (navigator.share && window.matchMedia('(pointer: coarse)').matches) {
    try { await navigator.share({ title: 'Frettle', text: linkSummary(), url }); } catch { /* closed */ }
    return;
  }
  let copied = false;
  try { await navigator.clipboard.writeText(url); copied = true; } catch {
    const field = document.createElement('textarea');   // older browsers
    field.value = url;
    field.setAttribute('readonly', '');
    field.style.cssText = 'position:fixed;opacity:0';
    document.body.append(field);
    field.select();
    try { copied = document.execCommand('copy'); } catch { /* not allowed */ }
    field.remove();
  }
  shareDone(copied ? 'Link copied' : 'Could not copy: copy the address to share this view', copied);
}

let shareTimer = 0;
function shareDone(text, copied) {
  els.shareStatus.textContent = text;
  els.shareOpen.title = text;
  els.shareOpen.classList.toggle('done', copied);
  if (copied) els.shareOpen.innerHTML = `${DONE_ICON}<span class="btn-label">Copied</span>`;
  clearTimeout(shareTimer);
  shareTimer = setTimeout(() => {
    els.shareOpen.classList.remove('done');
    els.shareOpen.innerHTML = `${SHARE_ICON}<span class="btn-label">Share</span>`;
    els.shareOpen.title = 'Share a link to what is on the neck';
    els.shareStatus.textContent = '';
  }, 1600);
}

let state = null;
let shapeCache = { key: '', shapes: [] };

/* The selected instrument, in its selected tuning */
const instrument = () => tunedInstrument(state.instrument, state.tuning[state.instrument]);
const capo = () => state.capo;

/* The instrument as it sounds with the capo on: every open string raised,
   fewer frets left. Chord shapes are found on this, so their fret numbers
   count from the capo (0 = the string rings at the capo). */
function cappedInstrument() {
  const inst = instrument();
  const c = capo();
  return { ...inst, strings: inst.strings.map((m) => m + c), frets: inst.frets - c };
}
/* Spelling of the selected chord / scale (or, for pickers, of any root and
   type). A chord inside the selected scale borrows the scale's spelling of
   its root, so the ii chord of D♭ major is E♭m, not D♯m. */
function scaleSpelling(rootPc, def) {
  return spellScale(rootPc, def, state.flats);
}
function chordSpelling(rootPc, def) {
  const sc = state.scale.on ? scaleSpelling(state.scale.root, findScale(state.scale.type)) : null;
  return spellChord(rootPc, def, state.flats, (sc && sc.names.get(mod12(rootPc))) || null);
}
const stringNumber = (s) => instrument().strings.length - s;   // 1 = string nearest the floor

/* The voicing set for this instrument, or its default (root position on
   guitar and bass, any bass note on the others) when the chord has no such
   bass note (a 3rd inversion on a triad) */
function voicingFor(def) {
  const v = state.voicing[state.instrument];
  return v === 'any' || (/^\d+$/.test(v) && Number(v) < def.steps.length) ? v : DEFAULT_VOICING[state.instrument];
}

/* Everything the views need about the selected chord, or null. */
function currentChord() {
  if (!state.chord.on) return null;
  const def = findChord(state.chord.type);
  const root = state.chord.root;
  const voicing = voicingFor(def);
  const tones = chordTones(root, def);
  const spell = chordSpelling(root, def);
  const key = [instrument().strings.join(','), capo(), root, def.id, voicing].join('|');
  if (shapeCache.key !== key) shapeCache = { key, shapes: findShapes(cappedInstrument(), root, def, voicing) };
  const shapes = shapeCache.shapes;
  const index = shapes.length ? Math.min(state.shape, shapes.length - 1) : -1;
  return {
    def, root, voicing, tones, shapes, index,
    shape: shapes[index] || null,
    degOfPc: new Map(tones.map((t) => [t.pc, t.deg])),
    spell,
    rootName: noteText(spell.root),
    symbol: noteText(spell.root) + def.symbol,
  };
}

function currentScale() {
  if (!state.scale.on) return null;
  const def = findScale(state.scale.type);
  const pcs = def.steps.map((s) => mod12(state.scale.root + s));
  const spell = scaleSpelling(state.scale.root, def);
  return { def, root: state.scale.root, pcs, set: new Set(pcs), spell, rootName: noteText(spell.root) };
}

/* Change the chord and show its first shape. */
function updateChord(patch) {   // a chord picked from the menus (or a triad): its first shape
  Object.assign(state.chord, patch, { on: true });
  state.shape = 0;
  menuPick = 'root' in patch ? ('type' in patch ? 'both' : 'root') : 'type' in patch ? 'type' : 'other';
  render();
}

/* Recent chords, one list for all instruments: a chord joins it as soon as
   it is shown, in a fixed place so a song's chords stay put while switching
   between them. Past RECENT_MAX, the one unused longest makes room.
   The in-between chord of picking a root, then a type, does not pile up: a
   chip made by picking a root stays open, and if the very next thing you do
   is pick a type, that edits the same chip. Anything else (another root,
   strumming or tapping its notes, a shape, a chip, a triad) makes the chip
   final. Picking only a type always makes a new chip.
   Each chip remembers the shape you chose for it, per instrument, tuning,
   capo and voicing (`shapes`): tapping the chip, or coming back to this
   instrument, brings that shape back. Picking the chord from the menus starts
   from its first shape, as always (and the chip remembers that). Shapes only
   change in memory when you choose them, never because a setting reset them. */
const RECENT_MAX = 8;
let recentClock = 0;
let shownChord;          // instrument and chord at the last render
let openEntry = null;    // the chip a root pick made, which the next type pick may still edit
let menuPick = '';       // how the chord on screen was just picked: 'root', 'type', 'both' or 'other' (menus)
let chipPick = false;    // ... or from its chip
const shapeContext = () => [instrument().strings, capo(), voicingFor(findChord(state.chord.type))].join('|');
const recentList = () => state.recent;
const recentEntry = () => state.chord.on &&
  recentList().find((r) => r.root === state.chord.root && r.type === state.chord.type);

/* The shape a chip remembers for the chord on screen, here and now (or the first) */
function rememberedShape(entry = recentEntry()) {
  const shape = entry && entry.shapes && entry.shapes[shapeContext()];
  return Number.isInteger(shape) ? shape : 0;
}
function rememberShape(entry = recentEntry()) {
  if (!entry) return;
  const ctx = shapeContext();
  entry.shapes = { ...entry.shapes };
  delete entry.shapes[ctx];
  entry.shapes[ctx] = state.shape;   // newest last; keep the last few settings only
  const keys = Object.keys(entry.shapes);
  for (const k of keys.slice(0, Math.max(0, keys.length - 4))) delete entry.shapes[k];
}

/* Called on every render: what you did is worked out from what changed on
   screen since the last render (the chord, and how it was picked: menuPick,
   chipPick), not reported by each control. Anything that changes the chord
   must go through updateChord (menus), playRecent (chips) or set those flags,
   or it will count as a plain new chord. */
function trackChord() {
  const list = recentList();
  const key = state.chord.on ? `${state.chord.root}:${state.chord.type}` : '';
  const sameInst = shownChord !== undefined && shownChord.inst === state.instrument;
  const setup = [state.instrument, instrument().strings, capo()].join('|');
  if (!shownChord || shownChord.setup !== setup) openEntry = null;   // a new instrument, tuning or capo: final
  const how = menuPick;
  const changed = sameInst && (shownChord.key !== key || how !== '');
  const fromChip = chipPick;
  menuPick = '';
  chipPick = false;
  shownChord = { inst: state.instrument, key, setup };
  if (!changed || !state.chord.on) return;
  const open = how === 'type' && openEntry && list.includes(openEntry) ? openEntry : null;
  openEntry = null;
  let entry = recentEntry();
  if (!entry && open) {                // root, then type: the same chip, edited
    open.root = state.chord.root;
    open.type = state.chord.type;
    open.shapes = {};
    entry = open;
  } else if (!entry) {                 // a new chord: a new chip
    if (list.length >= RECENT_MAX) list.splice(list.indexOf(list.reduce((a, b) => (a.used <= b.used ? a : b))), 1);
    entry = { root: state.chord.root, type: state.chord.type, shapes: {} };
    list.push(entry);
    if (how === 'root') openEntry = entry;   // the next type pick may still edit it
  } else if (open && open !== entry) { // root, then type, landing on a chord already there
    list.splice(list.indexOf(open), 1);
  }
  entry.used = ++recentClock;
  if (!fromChip) rememberShape(entry);   // picked from the menus: its first shape
}

function keepChord() { openEntry = null; }   // strummed, cycled, its notes played: this chip is final

function playRecent(i) {
  const entry = recentList()[i];
  if (!entry) return;
  keepChord();
  state.chord = { on: true, root: entry.root, type: entry.type };
  state.shape = rememberedShape(entry);
  chipPick = true;
  ui.reveal = true;   // phones: bring the shape into view, even if this chip was already the one on screen
  ui.chipKey = '';    // ... and the chip itself, whole
  render();
}

function removeRecent(i) {   // the chord stays on screen, its chip goes
  const list = recentList();
  if (openEntry === list[i]) openEntry = null;
  list.splice(i, 1);
  render();
}

function clearRecent() {   // keep only the chord shown now
  keepChord();
  const entry = recentEntry();
  state.recent = entry ? [entry] : [];
  render();
}

function selectShape(index) {
  const ch = currentChord();
  if (!ch || !ch.shapes.length) return;
  keepChord();   // cycling its shapes: this chord is being used
  state.shape = (index + ch.shapes.length) % ch.shapes.length;
  rememberShape();
  render();
}

/* ==========================================================================
   4. Sound
   Plucked strings synthesised in the browser (Karplus-Strong): a short burst
   of noise circulates in a delay line one period long and is softened a
   little on every pass, which sounds like a plucked string. Each pitch is
   computed once, on first use, and kept.
   To sound clear but not buzzy: the burst is softened more for high notes
   (a softer pick) and shaped as if plucked away from the bridge (some
   harmonics cancel), low strings lose a little of their long-ringing fizz,
   and every note goes through a light tone shaping, a little body warmth, a
   small room made from decaying noise, and a soft limiter.
   ========================================================================== */
const STRUM_GAP = 0.035;   // seconds between strings in a strum
let audio = null;
const pluckCache = new Map();

function audioOut() {
  if (!audio) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    const ctx = new AC();
    audio = { ctx, out: soundChain(ctx) };
  }
  if (audio.ctx.state === 'suspended') audio.ctx.resume();
  return audio;
}

/* Notes → tone filter → body → (dry + room) → soft limiter → speakers.
   Returns the node notes connect to. */
function soundChain(ctx) {
  const input = ctx.createGain();
  const tone = ctx.createBiquadFilter();   // rounds off only the very top, where plucks fizz
  tone.type = 'lowpass';
  tone.frequency.value = 9000;
  tone.Q.value = 0.5;
  const body = ctx.createBiquadFilter();   // a little wooden warmth
  body.type = 'peaking';
  body.frequency.value = 220;
  body.Q.value = 0.9;
  body.gain.value = 2;
  const presence = ctx.createBiquadFilter();   // a touch less of the piercing band, not enough to dull it
  presence.type = 'peaking';
  presence.frequency.value = 3200;
  presence.Q.value = 1.2;
  presence.gain.value = -1.5;
  const limiter = ctx.createDynamicsCompressor();   // soft: only tames loud strums
  limiter.threshold.value = -14;
  limiter.knee.value = 12;
  limiter.ratio.value = 4;
  limiter.attack.value = 0.006;
  limiter.release.value = 0.25;
  const volume = ctx.createGain();
  volume.gain.value = 0.9;
  input.connect(tone);
  tone.connect(body);
  body.connect(presence);
  presence.connect(limiter);
  if (ctx.createConvolver) {   // the room
    const room = ctx.createConvolver();
    room.buffer = roomImpulse(ctx);
    const wet = ctx.createGain();
    wet.gain.value = 0.1;
    presence.connect(room);
    room.connect(wet);
    wet.connect(limiter);
  }
  limiter.connect(volume);
  volume.connect(ctx.destination);
  return input;
}

/* A small room's echo, made rather than recorded: soft noise fading out
   in under a second, slightly different in each ear. */
function roomImpulse(ctx) {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * 0.9);
  const ir = ctx.createBuffer(2, len, sr);
  const gap = Math.floor(sr * 0.012);   // first reflections arrive after 12 ms
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    let lp = 0;
    for (let i = gap; i < len; i++) {
      const t = (i - gap) / sr;
      lp = 0.55 * lp + 0.45 * (Math.random() * 2 - 1);   // darker than plain noise
      d[i] = lp * Math.exp(-t * 8) * 0.5;
    }
  }
  return ir;
}

function pluck(ctx, midi) {
  if (pluckCache.has(midi)) return pluckCache.get(midi);
  const sr = ctx.sampleRate;
  const freq = 440 * 2 ** ((midi - 69) / 12);
  // Averaging each sample with the next one shortens the loop by half a
  // sample, so it sounds at sr / (n - 0.5); playbackRate fixes the rounding
  const n = Math.max(2, Math.floor(sr / freq + 0.5));
  const rate = freq / (sr / (n - 0.5));
  const seconds = midi < 48 ? 1.55 : 1.2;   // note length (low notes ring a bit longer)
  const len = Math.floor(sr * seconds);
  const buffer = ctx.createBuffer(1, len, sr);
  const data = buffer.getChannelData(0);

  // Excitation: smoothed noise, smoother for higher notes (a softer pick
  // where the buzz would be), without DC offset
  const high = Math.min(1, Math.max(0, (midi - 40) / 40));   // 0 for a low E, 1 four octaves up
  const soft = 0.45 + 0.25 * high;
  const loop = new Float32Array(n);
  let prev = 0;
  for (let i = 0; i < n; i++) { prev = (1 - soft) * (Math.random() * 2 - 1) + soft * prev; loop[i] = prev; }
  // Plucked a fifth of the way from the bridge: subtracting a copy shifted by
  // that much cancels every fifth harmonic and rounds the tone
  const shift = Math.max(1, Math.round(n * 0.2));
  const plucked = loop.map((v, i) => v - loop[(i + n - shift) % n]);
  const mean = plucked.reduce((a, v) => a + v, 0) / n;
  let power = 0;
  for (let i = 0; i < n; i++) { loop[i] = plucked[i] - mean; power += loop[i] * loop[i]; }
  const gain = 0.2 / (Math.sqrt(power / n) || 1);   // every note plucked equally hard
  for (let i = 0; i < n; i++) loop[i] *= gain;

  const damping = 0.9965;             // extra loss per pass: shorter, less boomy low notes
  const fade = Math.floor(sr * 0.4);  // gentle fade over the last 0.4 s, never a click
  const attack = Math.floor(sr * 0.004);   // 4 ms fade-in takes the edge off the attack
  // Low strings keep their high harmonics for long; on small speakers (that
  // cannot play the low fundamental) that is all you hear, a buzz. A gentle
  // low-pass that follows the pitch keeps them round.
  const smooth = 1 - Math.exp((-2 * Math.PI * Math.min(12000, freq * 36)) / sr);
  let y = 0;
  let k = 0;
  for (let i = 0; i < len; i++) {
    const next = (k + 1) % n;
    const env = i < attack ? i / attack : i > len - fade ? (len - i) / fade : 1;
    y += smooth * (loop[k] - y);
    data[i] = y * env;
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
  return src;
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

/* Tap a note on the neck to hear it (not behind the capo, not a hidden note).
   With a mouse or a pen it sounds on press. On a touch screen it sounds once
   the finger has rested TAP_DELAY ms without moving (or on release, if that
   comes first), so swiping to scroll the neck never plays notes. Each finger
   is followed on its own, so two quick taps both sound. */
const TAP_DELAY = 40;   // ms
const TAP_SLOP = 8;     // px a finger may move and still count as a tap
function setupNeckTaps() {
  const taps = new Map();   // pointerId → { cell, x, y, timer, done }
  const playable = (target) => {
    const cell = target.closest('.cell');
    return cell && !cell.classList.contains('behind') && !cell.classList.contains('empty') ? cell : null;
  };
  const play = (cell) => {
    const s = Number(cell.dataset.s);
    const f = Number(cell.dataset.f);
    playNote(instrument().strings[s] + f);
    flashCell(s, f);
    if (cell.querySelector('.note.chord, .note.ghost')) keepChord();   // a note of the chord: it is being used
  };
  const cancel = (e) => {
    const tap = taps.get(e.pointerId);
    if (tap) { clearTimeout(tap.timer); taps.delete(e.pointerId); }
  };
  els.neck.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;   // main button only
    const cell = playable(e.target);
    if (!cell) return;
    if (e.pointerType !== 'touch') { play(cell); return; }
    const tap = { cell, x: e.clientX, y: e.clientY, done: false };
    tap.timer = setTimeout(() => { tap.done = true; play(cell); }, TAP_DELAY);
    taps.set(e.pointerId, tap);
  });
  els.neck.addEventListener('pointermove', (e) => {
    const tap = taps.get(e.pointerId);
    if (tap && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > TAP_SLOP) cancel(e);
  });
  els.neck.addEventListener('pointerup', (e) => {
    const tap = taps.get(e.pointerId);
    if (!tap) return;
    clearTimeout(tap.timer);
    if (!tap.done) play(tap.cell);
    taps.delete(e.pointerId);
  });
  els.neck.addEventListener('pointercancel', cancel);   // the browser started scrolling
  els.neck.addEventListener('contextmenu', (e) => e.preventDefault());   // no long-press menu
}

/* Browsers only let sound start after a tap or a key press, and some only
   count the end of a tap. Waking the audio on those events means the very
   first note of a visit is not lost. */
if (typeof document !== 'undefined') {
  for (const type of ['pointerup', 'touchend', 'keydown']) {
    document.addEventListener(type, () => { if (audio && audio.ctx.state === 'suspended') audio.ctx.resume(); }, { passive: true });
  }
}

/* Strum the current shape from the top string down, skipping muted ones. */
function strum() {
  const ch = currentChord();
  if (!ch || !ch.shape) return;
  keepChord();
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

/* Play the scale once, low to high (root to octave), from its lowest root
   you can play (above the capo), lighting each note in the Notes row. The
   last note rings out. Pressing again stops it; so does picking another
   scale. A note of the row can also be tapped to hear it. */
const SCALE_GAP = 0.3;   // seconds between notes
let scaleRun = null;     // { key, sources, timers }
function scalePitches(sc) {   // the Notes row's pitches, root to octave
  const low = Math.min(...instrument().strings) + capo();
  const start = low + mod12(sc.root - low);
  return [...sc.def.steps.map((step) => start + step), start + 12];
}
function pingScaleNote(i) {
  const note = els.scaleNotes.querySelectorAll('.scale-note')[i];
  if (!note) return;
  note.classList.remove('ping');
  void note.offsetWidth;   // restart the animation
  note.classList.add('ping');
}
function playScale() {
  if (scaleRun) { stopScale(); return; }
  const sc = currentScale();
  if (!sc) return;
  const pitches = scalePitches(sc);
  scaleRun = { key: scaleKey(sc), sources: [], timers: [] };
  pitches.forEach((midi, i) => {
    scaleRun.sources.push(playNote(midi, i * SCALE_GAP, 0.5));
    scaleRun.timers.push(setTimeout(() => pingScaleNote(i), i * SCALE_GAP * 1000));
  });
  // Done once the last note has started: it rings on, and Play is back
  scaleRun.timers.push(setTimeout(() => { scaleRun = null; renderPlayButton(); }, (pitches.length - 1) * SCALE_GAP * 1000 + 50));
  renderPlayButton();
}
function stopScale() {
  if (!scaleRun) return;
  for (const src of scaleRun.sources) { try { if (src) src.stop(); } catch { /* already over */ } }
  for (const t of scaleRun.timers) clearTimeout(t);
  scaleRun = null;
  renderPlayButton();
}
function playScaleNote(i) {
  const sc = currentScale();
  if (!sc) return;
  playNote(scalePitches(sc)[i]);
  pingScaleNote(i);
}
const scaleKey = (sc) => (sc ? [sc.root, sc.def.id, instrument().strings, capo()].join('|') : '');
const PLAY_ICON = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M8 5.2v13.6a.8.8 0 0 0 1.2.7l10.8-6.8a.8.8 0 0 0 0-1.4L9.2 4.5A.8.8 0 0 0 8 5.2z"/></svg>';
const STOP_ICON = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';
function renderPlayButton() {
  const playing = Boolean(scaleRun);
  els.scalePlay.innerHTML = `${playing ? STOP_ICON : PLAY_ICON}<span class="btn-label">${playing ? 'Stop' : 'Play'}</span>`;
  els.scalePlay.setAttribute('aria-label', playing ? 'Stop the scale' : 'Play the scale');
  els.scalePlay.title = playing ? 'Stop' : 'Play the scale, low to high';
}

/* ==========================================================================
   5. Rendering
   Phones (narrow): vertical neck, controls in a dock with tabs that open a
   sheet. Wide screens: horizontal neck, panels below it. WIDE_QUERY must
   match the media query at the end of styles.css.
   ========================================================================== */
const WIDE_QUERY = '(min-width: 900px), (orientation: landscape) and (min-width: 640px)';
const wideMedia = typeof window !== 'undefined' ? window.matchMedia(WIDE_QUERY) : null;
const isWide = () => Boolean(wideMedia && wideMedia.matches);
const ui = { tab: null, shapeKey: null, groups: [], chordRoot: undefined };   // open dock tab (phones), last shape shown
const els = {};
/* Text for a pill or circle, wrapped so its capital letters can be centred
   exactly (see .tx in styles.css) */
const tx = (s) => `<span class="tx">${esc(s)}</span>`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function render() {
  // While no scale is shown, its root follows the chord's: picking a scale
  // type then gives the scale of the chord you are on (A minor pentatonic
  // over A, not C). A root picked for the scale itself stays until the
  // chord's root changes.
  if (!state.scale.on && state.chord.root !== ui.chordRoot) state.scale.root = state.chord.root;
  ui.chordRoot = state.chord.root;
  // A bass note the chord does not have (a 3rd inversion on a triad) goes
  // back to the instrument's default, as the Voicing menu says: kept as is,
  // the next 7th chord would come back in that old inversion (and links
  // would carry it)
  if (state.chord.on) state.voicing[state.instrument] = voicingFor(findChord(state.chord.type));
  const ch = currentChord();
  const sc = currentScale();
  if (ch && ch.shapes.length) state.shape = ch.index;
  trackChord();
  renderHeader();
  renderRecent();
  renderNeck(ch, sc);
  renderChordPanel(ch, sc);
  renderScalePanel(sc, ch);
  renderDock(ch, sc);
  saveState();
  syncLink();
  // Phones: when the shape changes, scroll the neck so it is in view
  const key = ch && ch.shape ? [instrument().strings, capo(), ch.symbol, tabOf(ch.shape)].join('|') : null;
  if (key && ui.shapeKey !== null && (key !== ui.shapeKey || ui.reveal)) revealShape();
  ui.shapeKey = key || '';
  ui.reveal = false;
}

/* The recent chords, as chips in the dock (phones) and the chord panel
   (wide screens); shown once there are two to switch between */
function renderRecent() {
  const list = recentList();
  const show = list.length >= 2;
  els.dockRecent.hidden = !show;
  els.recentLine.hidden = !show;
  if (!show) return;
  const html = list.map((r, i) => {
    const def = findChord(r.type);
    const spell = chordSpelling(r.root, def);
    const on = state.chord.on && r.root === state.chord.root && r.type === state.chord.type;
    const name = noteText(spell.root) + def.symbol;
    // The chord on screen also gets an × to take it off the list
    return `<li${on ? ' class="on"' : ''}><button type="button" class="chip recent${on ? ' selected' : ''}" data-i="${i}" aria-pressed="${on}" ` +
      `title="${esc(`${noteText(spell.root)} ${def.name.toLowerCase()}`)}"><span class="tx">${esc(name)}</span></button>` +
      (on ? `<button type="button" class="recent-remove" data-remove="${i}" aria-label="Remove ${esc(name)} from the recent chords" ` +
        `title="Remove ${esc(name)} from the recent chords"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M7 7l10 10M17 7L7 17"/></svg></button>` : '') + '</li>';
  }).join('');
  els.dockRecentList.innerHTML = html;
  els.recentList.innerHTML = html;
  // When the chips change (one picked, added, edited or removed), scroll the
  // row so the selected one shows whole
  const chipKey = html;
  if (chipKey !== ui.chipKey) {
    const smooth = ui.chipKey !== undefined;
    ui.chipKey = chipKey;
    requestAnimationFrame(() => { chipInView(els.dockRecentList, smooth); chipInView(els.recentList, smooth); });
  }
}
function chipInView(row, smooth) {   // scroll a row of chips sideways so the selected one is whole
  const chip = row.querySelector('li.on');
  if (!chip || !row.clientWidth) return;
  // Where the chip sits in the row's content, so a scroll still under way
  // (quick picks in a row) cannot throw the result off: scroll to a place,
  // not by an amount
  const pad = 8;
  const start = chip.getBoundingClientRect().left - row.getBoundingClientRect().left + row.scrollLeft;
  const end = start + chip.offsetWidth;
  const max = row.scrollWidth - row.clientWidth;
  let left = row.scrollLeft;
  if (start - pad < left) left = start - pad;
  else if (end + pad > left + row.clientWidth) left = end + pad - row.clientWidth;
  left = Math.round(Math.min(max, Math.max(0, left)));
  if (left !== Math.round(row.scrollLeft)) row.scrollTo({ left, behavior: smooth ? 'smooth' : 'auto' });
}

/* Phones: when the shape changes, scroll the page so the shape sits in the
   middle of the part of the neck you can see: from the top of the screen to
   the top of the dock (or of the open sheet), measured where they actually
   are. The page never scrolls past the top of the neck panel and the margin
   above it (with a capo, past the capo's fret), so the highest position
   still shows that edge. */
function revealShape() {
  if (isWide()) return;
  const notes = [...els.neck.querySelectorAll('.note.chord')];
  if (!notes.length) return;
  const rects = notes.map((n) => n.getBoundingClientRect());
  const top = Math.min(...rects.map((r) => r.top));
  const bottom = Math.max(...rects.map((r) => r.bottom));
  const cover = els.sheet.classList.contains('open') ? els.sheet : els.dockBar;
  const viewBottom = cover.getBoundingClientRect().top;
  // Centre the shape; one too tall to fit starts at the top of the view
  const delta = bottom - top > viewBottom - 24 ? top - 24 : (top + bottom) / 2 - viewBottom / 2;
  // Highest: the neck panel with its margin, or with a capo, its fret (the
  // frets behind it cannot be played) with more room, part of the fret
  // behind it showing and the interval badges clear of the edge
  const panel = els.neck.closest('.neck-panel');
  const capoCell = capo() ? els.neck.querySelector(`.cell[data-f="${capo()}"]`) : null;
  const margin = capoCell ? 20 : parseFloat(getComputedStyle(panel).marginTop);
  const edge = (capoCell || panel).getBoundingClientRect().top;
  window.scrollTo({ top: Math.max(edge + window.scrollY - margin, window.scrollY + delta), behavior: 'smooth' });
}

/* Neck settings live in the neck's header on wide screens and in the dock's
   "Neck" tab on phones; the instrument menu in the neck's header, or above
   the neck on phones. */
function placeSettings() {
  const wide = isWide();
  const slot = wide ? els.settingsWideSlot : els.settingsNarrowSlot;
  if (els.settings.parentElement !== slot) slot.appendChild(els.settings);
  // The instrument menu: the neck's title on wide screens, above the neck on phones
  const instSlot = wide ? els.instWideSlot : els.instNarrowSlot;
  if (els.instrumentPicker.parentElement !== instSlot) instSlot.appendChild(els.instrumentPicker);
  // Chord and scale switches: at the end of the panel's title row on wide screens,
  // under the menus on phones. Play the scale: before Deselect on wide
  // screens (as Strum is for chords), on the Notes line on phones.
  const put = (el, parent, before = null) => { if (el.parentElement !== parent || el.nextElementSibling !== before) parent.insertBefore(el, before); };
  if (wide) {
    put(els.chordSwitches, els.chordHead);
    put(els.scaleSwitches, els.scaleHead);
    put(els.scalePlay, els.scaleBar, els.scaleClear);
  } else {
    put(els.chordSwitches, els.chordBar, els.chordStrum);
    put(els.scaleSwitches, els.scaleBar, els.scaleClear);
    put(els.scalePlay, els.notesLine);
  }
}

/* Picker popup: tiles to tap instead of a long dropdown list. `groups` is
   [{ label, items: [{ value, label, sub }] }]; the chosen value goes to onPick.
   An optional `note` is a line of help under the tiles. */
let pickerPick = null;
function openPicker({ title, groups, value, layout = '', note = '', onPick }) {
  els.pickerTitle.textContent = title;
  els.pickerBody.innerHTML = groups.map((g) =>
    (g.label ? `<div class="label picker-label">${esc(g.label)}</div>` : '') +
    `<div class="picker-grid ${layout}">${g.items.map((it) => {
      const sel = String(it.value) === String(value);
      const cls = `pick${sel ? ' selected' : ''}${it.cls ? ` ${it.cls}` : ''}`;
      return `<button type="button" class="${cls}" data-value="${esc(it.value)}" aria-pressed="${sel}"` +
        `${it.style ? ` style="${it.style}"` : ''}>` +
        `<span class="pick-name">${esc(it.label)}</span>` +
        `${it.tag ? `<span class="pick-tag">${esc(it.tag)}</span>` : ''}` +
        `${it.sub ? `<span class="pick-sub">${esc(it.sub)}</span>` : ''}</button>`;
    }).join('')}</div>`
  ).join('') + (note ? `<p class="picker-note">${esc(note)}</p>` : '');
  pickerPick = onPick;
  if (els.picker.showModal) els.picker.showModal(); else els.picker.setAttribute('open', '');
  const selected = els.pickerBody.querySelector('.pick.selected');
  if (selected) { selected.focus({ preventScroll: true }); selected.scrollIntoView({ block: 'nearest' }); }
}
function closePicker() {
  if (els.picker.close) els.picker.close(); else els.picker.removeAttribute('open');
}
/* The 12 roots, each spelled as it would be for the given chord or scale type,
   with the other name of the black keys below (D♭ / C♯), as the neck may
   use either; `fits(pc)` marks the roots whose chord fits the scale */
const rootItems = (spellRoot, fits = () => false) => [{ items: SHARP_NAMES.map((_, pc) => {
  const label = noteText(spellRoot(pc));
  const other = [true, false].map((flats) => noteText(plainNote(pc, flats))).find((n) => n !== label);
  return { value: pc, label, sub: LETTER_PC.includes(pc) ? '' : other, cls: fits(pc) ? 'fits' : '' };
}) }];

/* The chord's notes that are outside the shown scale: [] when it fits, null
   when there is no scale to compare with (none, or the chromatic scale). */
function outsideScale(rootPc, def, sc) {
  if (!sc || sc.def.steps.length >= 12) return null;
  return chordTones(rootPc, def).filter((t) => !sc.set.has(t.pc));
}
/* Chord notes outside the shown scale get an amber mark on the neck and in
   the chord panel (the same amber as the panel's "Outside D Major" line) */
const offKeyTest = (sc) => (sc && sc.def.steps.length < 12 ? (pc) => !sc.set.has(mod12(pc)) : () => false);
const fitsScale = (rootPc, def, sc) => { const out = outsideScale(rootPc, def, sc); return Boolean(out && !out.length); };
/* Help line for the chord pickers when a scale is shown */
const fitsNote = (sc) => (sc && sc.def.steps.length < 12 ? `Every note is in ${sc.rootName} ${sc.def.short}` : '');

/* Shrink the text of a fixed-size box until it fits on one line (long chord
   symbols like C♯m(maj7)). Measured on a canvas, so it also works while the
   box is hidden (a closed sheet on phones). */
let measureCtx = null;
function fitText(el) {
  el.style.fontSize = '';
  const cs = getComputedStyle(el);
  const room = parseFloat(cs.width) - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const size = parseFloat(cs.fontSize);
  if (!(room > 0)) return;
  measureCtx = measureCtx || document.createElement('canvas').getContext('2d');
  measureCtx.font = `${cs.fontWeight} ${size}px ${cs.fontFamily}`;
  const width = measureCtx.measureText(el.textContent).width;
  if (width > room) el.style.fontSize = `${Math.floor((size * room) / width)}px`;
}

/* Phones: the shape bar, the tab values and which sheet is open. */
function renderDock(ch, sc) {
  els.dockShapeBar.hidden = !ch;   // no chord: just the tabs
  const many = Boolean(ch && ch.shapes.length > 1);
  els.dockPrev.disabled = els.dockNext.disabled = !many;
  els.dockStrum.disabled = !ch || !ch.shape;
  els.dockSymbol.textContent = ch ? ch.symbol : '';
  if (!ch) els.dockTab.innerHTML = '<span class="dock-msg">No chord selected</span>';
  else if (!ch.shape) els.dockTab.innerHTML = '<span class="dock-msg">No playable shape</span>';   // words, not tab: the normal font
  else {
    els.dockTab.innerHTML = `<span class="dock-count">Shape ${ch.index + 1}/${ch.shapes.length}, ${shapePlace(ch.shape)}</span>` +
      `<span>${esc(shortTab(ch.shape))}</span>`;
  }

  els.tabChordValue.textContent = ch ? ch.symbol : 'None';
  els.tabScaleValue.textContent = sc ? `${sc.rootName} ${sc.def.short}` : 'None';
  // What the Neck sheet sets: the capo if there is one, else the tuning
  // (the instrument has its own menu above the neck)
  els.tabNeckValue.textContent = capo() ? `Capo ${capo()}` : tuningName(instrument()) || 'Standard';

  const open = !isWide() && ui.tab !== null;
  for (const tab of els.tabs) tab.setAttribute('aria-pressed', String(open && tab.dataset.tab === ui.tab));
  for (const panel of els.sheetPanels) panel.classList.toggle('active', panel.dataset.tab === ui.tab);
  els.sheet.classList.toggle('open', open);
  document.body.classList.toggle('sheet-open', open);   // extra scroll room under the neck
  els.sheet.setAttribute('aria-hidden', String(!isWide() && !open));
}

/* Phones: drag the sheet down by its handle or its title to close it. A
   short drag springs back; a tap on the handle or the title closes it too. */
function setupSheetDrag() {
  let startY = null;
  let dy = 0;
  let t0 = 0;
  let dragged = false;
  const begin = (e) => {
    if (isWide() || !els.sheet.classList.contains('open')) return;
    dragged = false;
    if (e.target.closest('.panel-head button, .panel-head .status')) return;
    if (e.currentTarget !== els.sheetClose && els.sheet.scrollTop > 0) return;   // title only at the top
    startY = e.clientY; dy = 0; t0 = performance.now(); dragged = false;
    els.sheet.style.transition = 'none';
  };
  const move = (e) => {
    if (startY === null) return;
    dy = Math.max(0, e.clientY - startY);
    if (dy > 4) dragged = true;
    els.sheet.style.transform = `translateY(${dy}px)`;
  };
  const end = () => {
    if (startY === null) return;
    const fast = dy / Math.max(1, performance.now() - t0) > 0.6;   // a quick flick also closes
    startY = null;
    els.sheet.style.transition = '';
    els.sheet.style.transform = '';
    if (dy > 80 || (fast && dy > 24)) openTab(null);
  };
  const handles = [els.sheetClose, ...els.sheet.querySelectorAll('.panel-head')];
  for (const h of handles) h.addEventListener('pointerdown', begin);
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
  // A drag that springs back must not count as a tap on the handle
  els.sheetClose.addEventListener('click', () => {
    if (dragged) { dragged = false; return; }
    openTab(null);
  });
  // The titles are not buttons: keyboards and screen readers use the handle
  for (const head of els.sheet.querySelectorAll('.panel-head')) {
    head.addEventListener('click', (e) => {
      if (isWide() || ui.tab === null || e.target.closest('button, .status')) return;
      if (dragged) { dragged = false; return; }
      openTab(null);
    });
  }
}

function openTab(tab) {
  const wasOpen = ui.tab !== null;
  ui.tab = ui.tab === tab ? null : tab;
  const ch = currentChord();
  renderDock(ch, currentScale());
  if (ui.tab) {
    els.sheet.scrollTop = 0;
    // Once the sheet has slid up, make sure the shape is still visible above
    // it: wait for its own slide animation (or not at all, if it has none)
    const sliding = els.sheet.getAnimations ? els.sheet.getAnimations() : [];
    Promise.all(sliding.map((a) => a.finished)).then(() => { if (ui.tab) revealShape(); }, () => {});
  } else if (wasOpen) {
    revealShape();   // closed: centre the shape again in the now taller view
  }
}

function renderHeader() {
  const inst = instrument();
  const tuned = tuningName(inst);
  els.instrumentPicker.innerHTML = `<span class="inst-name">${esc(inst.name)}</span>` +
    (tuned ? `<span class="inst-tuning">${esc(tuned)}</span>` : '');
  els.instrumentPicker.setAttribute('aria-label', `Instrument: ${inst.name}${tuned ? `, ${tuned}` : ''}`);
  const c = capo();
  els.tuningSelect.hidden = !inst.tuning;
  els.tuningSelect.textContent = tuned || 'Standard tuning';
  els.tuningSelect.classList.toggle('on', Boolean(tuned));
  els.capoSelect.textContent = c ? `Capo ${c}` : 'No capo';
  els.capoSelect.classList.toggle('on', c > 0);
  for (const [id, key] of TOGGLES) {
    els[id].setAttribute('aria-pressed', String(state[key]));
  }
}

/* "Drop D", or '' for the standard tuning (and instruments with only one) */
const tuningName = (inst) => (inst.tuning && inst.tuning.id !== 'standard' ? inst.tuning.name : '');
/* Open string names, low to high: "D A D G B E" */
const tuningNotes = (strings, flats = false) => strings.map((m) => noteText(plainNote(m, flats))).join(' ');

const MUTE_ICON = '<svg class="ico mute-ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" ' +
  'stroke-width="3" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';

/* Scale groups, as players learn them: N notes per string (3 for 7- and
   8-note scales, 2 for pentatonic and other small ones, one more on a
   mandolin or mandola), continuing from string to string. Every string's scale notes are split into
   consecutive runs, so groups never share a note; group 0 starts on the
   first root of the lowest string (for the minor pentatonic that is the
   classic "box 1").
   Only complete groups are returned: N notes on every string, all playable
   (not cut off by the nut, the capo or the last fret). Each group is a list
   of bars, one per string: the frets from its first to its last note.
   Returns [{ id, bars: [{ s, a, b }] }]. */
function scaleGroups(inst, sc, capo) {
  const L = sc.def.steps.length;
  if (L >= 12) return [];   // chromatic: nothing to group
  // One more note per string on an instrument tuned in fifths (mandolin, mandola):
  // its strings are further apart, so each holds a longer run of the scale
  const nps = (L <= 6 ? 2 : 3) + (inst.fifths ? 1 : 0);
  const N = inst.frets;
  const n = inst.strings.length;
  const rankOf = (midi) => {
    const rel = midi - sc.root;
    const d = sc.def.steps.indexOf(mod12(rel));
    return d < 0 ? null : Math.floor(rel / 12) * L + d;   // position in the scale, counted in steps
  };
  // Strings from the lowest to the highest. A re-entrant string (the high G
  // of a standard ukulele) is grouped as if it were an octave lower: same
  // note names on the same frets, and groups that follow the neck instead of
  // jumping across it.
  const pitches = inst.strings.slice();
  for (let s = n - 2; s >= 0; s--) while (pitches[s] >= pitches[s + 1]) pitches[s] -= 12;
  const order = pitches.map((m, s) => ({ m, s }));
  const lowest = order[0];
  let offset = 0;
  for (let f = capo; f <= N; f++) {
    if (mod12(lowest.m + f) === sc.root) { offset = rankOf(lowest.m + f); break; }
  }
  const groups = new Map();   // id → Map(string → { s, a, b, count })
  order.forEach(({ m, s }, p) => {
    for (let f = capo; f <= N; f++) {
      const rank = rankOf(m + f);
      if (rank === null) continue;
      const id = Math.floor((rank - offset - p * nps) / nps);
      if (!groups.has(id)) groups.set(id, new Map());
      const bars = groups.get(id);
      const bar = bars.get(s);
      if (bar) { bar.b = f; bar.count++; } else bars.set(s, { s, a: f, b: f, count: 1 });
    }
  });
  const out = [];
  for (const [id, bars] of groups) {
    const list = [...bars.values()];
    if (list.length === n && list.every((bar) => bar.count === nps)) {
      out.push({ id, bars: list.map(({ s, a, b }) => ({ s, a, b })) });
    }
  }
  return out.sort((x, y) => x.id - y.id);
}

function renderNeck(ch, sc) {
  const inst = instrument();
  const n = inst.strings.length;
  const N = inst.frets;
  const c = capo();
  const offKey = offKeyTest(sc);   // chord notes outside the scale
  // Phones: vertical neck. Row 1 holds the string numbers, then the open
  // strings, then one row per fret; the lowest string is on the left.
  // Wide screens: horizontal neck. Row 1 holds the fret numbers, then one row
  // per string with the highest string on top (as in tab).
  const vertical = !isWide();
  let cellAt, rulerAt, labelAt, capoAt;
  if (vertical) {
    els.neck.style.gridTemplateColumns = `var(--label-w) repeat(${n}, minmax(0, 1fr))`;
    cellAt = (s, f) => `grid-row:${f + 2};grid-column:${s + 2}`;
    rulerAt = (f) => `grid-row:${f + 2};grid-column:1`;
    labelAt = (s) => `grid-row:1;grid-column:${s + 2}`;
    capoAt = `grid-row:${c + 2};grid-column:2 / span ${n}`;
  } else {
    els.neck.style.gridTemplateColumns = `var(--label-w) var(--open-w) repeat(${N}, minmax(var(--cell-w), 1fr))`;
    cellAt = (s, f) => `grid-row:${n - s + 1};grid-column:${f + 2}`;
    rulerAt = (f) => `grid-row:1;grid-column:${f + 2}`;
    labelAt = (s) => `grid-row:${n - s + 1};grid-column:1`;
    capoAt = `grid-row:2 / span ${n};grid-column:${c + 2}`;
  }
  // Vertical: the open-string row is 3px taller, since the nut is 3px thicker
  // than a fret wire; its notes get as much room as any other
  els.neck.style.gridTemplateRows = vertical ? 'var(--ruler-row) calc(var(--row-h) + 3px)' : 'var(--ruler-row)';
  els.neck.style.gridAutoRows = 'var(--row-h)';
  els.neck.classList.toggle('vertical', vertical);
  els.neck.classList.toggle('horizontal', !vertical);
  els.neck.classList.toggle('octaves', state.octaves);
  // Left-handed: the neck is mirrored by laying its grid out right to left
  // (styles.css), so nothing here changes; the scroller starts at the nut
  els.neck.parentElement.classList.toggle('lefty', state.leftHanded);

  // Shape frets count from the capo; place them at their real fret
  const shapeAt = new Map();
  if (ch && ch.shape) {
    ch.shape.frets.forEach((f, s) => {
      if (f >= 0) shapeAt.set(`${s}:${f + c}`, ch.degOfPc.get(mod12(inst.strings[s] + c + f)));
    });
  }
  const ghosts = ch && (state.allTones || !ch.shape);
  // Notes outside the key: as the key writes them, else flats if asked for or
  // if the tuning is written in flats (E♭ standard)
  const keyFlats = sc ? sc.spell.flats : ch ? ch.spell.flats : state.flats || Boolean(inst.tuning && inst.tuning.flats);
  const onlyScale = Boolean(sc && state.scaleOnly);
  ui.groups = sc && state.scaleGroups ? scaleGroups(inst, sc, c) : [];

  // One octave number per octave, on its first cell: the lowest-listed
  // string that reaches that octave, at its lowest fret (open strings
  // included). That is the bottom-left of the band on the horizontal neck
  // and its top-left on the vertical one. C4 = middle C, as on the piano.
  const octaveOf = (s, f) => Math.floor((inst.strings[s] + f) / 12) - 1;
  const octaveLabels = new Set();
  if (state.octaves) {
    const best = new Map();   // octave → { s, f }
    inst.strings.forEach((open, s) => {
      for (let f = 0; f <= N; f++) {
        const o = octaveOf(s, f);
        const b = best.get(o);
        if (!b || s < b.s || (s === b.s && f < b.f)) best.set(o, { s, f });
      }
    });
    for (const b of best.values()) octaveLabels.add(`${b.s}:${b.f}`);
  }

  const html = [];
  for (let f = 1; f <= N; f++) {
    const dots = DOUBLE_DOTS.includes(f) ? 2 : SINGLE_DOTS.includes(f) ? 1 : 0;
    const label = f === c && !vertical ? 'Capo' : `${f}${'<i></i>'.repeat(dots)}`;
    const title = f === c ? ` title="Capo on fret ${f}"` : '';
    html.push(`<div class="ruler${dots ? ' mark' : ''}${f === c ? ' capo' : ''}" style="${rulerAt(f)}"${title}>${label}</div>`);
  }

  inst.strings.forEach((open, s) => {
    const sw = Math.min(3.2, Math.max(1, (72 - open) / 10)).toFixed(1);
    const num = stringNumber(s);
    html.push(`<div class="slabel" style="${labelAt(s)}" title="String ${num}">${num}</div>`);
    for (let f = 0; f <= N; f++) {
      const midi = open + f;
      const pc = mod12(midi);
      const key = `${s}:${f}`;
      const mark = SINGLE_DOTS.includes(f) || DOUBLE_DOTS.includes(f);
      const where = f === 0 ? `string ${num}, open` : `string ${num}, fret ${f}`;
      // Each pill is spelled by its role: chord notes as in the chord, scale
      // notes as in the scale, other notes in the key's direction
      let cls = 'note';
      let n = plainNote(pc, keyFlats);
      let deg = null;
      let badge = '';   // chord notes: interval in a small corner badge, note name in the pill

      if (f < c) {
        cls += ' plain';   // behind the capo: shown for reference, but cannot be played
      } else if (f === c && ch && ch.shape && ch.shape.frets[s] < 0) {
        cls += ' mute';
      } else if (shapeAt.has(key) || (ghosts && ch.degOfPc.has(pc))) {
        deg = shapeAt.has(key) ? shapeAt.get(key) : ch.degOfPc.get(pc);
        cls += `${shapeAt.has(key) ? ' chord' : ' ghost'}${deg === 'R' ? ' root' : ''}${offKey(pc) ? ' off-key' : ''}`;
        badge = fmtDeg(deg);
        n = ch.spell.names.get(pc) || n;
      } else if (sc && sc.set.has(pc)) {
        cls += ` scale${pc === sc.root ? ' scale-root' : ''}`;
        n = sc.spell.names.get(pc) || n;
      } else {
        cls += onlyScale ? ' plain out' : sc ? ' plain off' : ' plain';   // off: shown, but not in the scale
      }
      const text = noteText(n);
      let title = `${pitchText(midi, n)}${deg ? ` (${DEGREE_NAMES[deg]})` : ''}, ${where}`;
      if (cls.includes(' off-key')) title += `, not in ${sc.rootName} ${sc.def.short}`;
      if (f < c) title += ', behind the capo';
      if (cls.includes(' mute')) title = `String ${num} not played`;
      const octave = octaveOf(s, f);
      const empty = onlyScale && cls.includes(' out');
      const cellCls = `cell ${f === 0 ? 'open' : 'fret'}${mark ? ' mark' : ''}${octave % 2 ? ' o-alt' : ''}` +
        `${f < c ? ' behind' : ''}${c && f === c ? ' capo' : ''}${empty ? ' empty' : ''}`;
      const inner = cls.includes(' mute') ? MUTE_ICON : tx(text);
      const octTag = octaveLabels.has(key) ? `<span class="oct" title="Octave ${octave}">${octave}</span>` : '';
      html.push(
        `<div class="${cellCls}" role="gridcell" data-s="${s}" data-f="${f}" style="${cellAt(s, f)};--sw:${sw}px">` +
        `${octTag}<span class="${cls}" title="${esc(title)}">${inner}` +
        `${badge ? `<span class="deg-badge" aria-hidden="true">${tx(badge)}</span>` : ''}</span></div>`
      );
    }
  });
  // The capo clamps all strings just behind its fret wire
  if (c) {
    html.push(`<div class="capo-bar" style="${capoAt}" ` +
      `title="Place the capo here, just behind fret ${c}" aria-hidden="true"></div>`);
  }
  // Barres: a pink band behind the notes the finger lies across
  if (ch && ch.shape) {
    for (const { fret, from, to } of barresFor(ch.shape.frets)) {
      const at = vertical ? `grid-row:${fret + c + 2};grid-column:${from + 2} / ${to + 3}`
        : `grid-column:${fret + c + 2};grid-row:${n - to + 1} / ${n - from + 2}`;
      html.push(`<div class="barre" style="${at};--k:${to - from + 1}" aria-hidden="true"><i></i></div>`);
    }
  }
  html.push('<svg class="group-layer" aria-hidden="true"></svg>');
  els.neck.innerHTML = html.join('');
  drawGroups();
}

/* Draw the scale groups (ui.groups) as one outline per group, measured from
   the cells on screen: an SVG path that is inset a little from the cells (so
   neighbouring groups never touch) and has every corner rounded, inner ones
   included. Redrawn whenever the neck changes size. */
const GROUP_INSET = 2;   // keeps the line clear of a root note's ring
const GROUP_RADIUS = 9;
function drawGroups() {
  const layer = els.neck.querySelector('.group-layer');
  if (!layer) return;
  const groups = ui.groups || [];
  const box = els.neck.getBoundingClientRect();
  layer.setAttribute('width', box.width);
  layer.setAttribute('height', box.height);
  layer.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
  if (!groups.length) { layer.innerHTML = ''; return; }

  const vertical = els.neck.classList.contains('vertical');
  // Work in (u, v): u runs along the strings (towards the body), v across them.
  // Along u, a cell is measured without its fret wire or nut (a border) and
  // the capo's padding: the note sits in the middle of what is left, so a
  // group gets the same room before its first note as after its last.
  const cellBox = (s, f) => {
    const cell = els.neck.querySelector(`.cell[data-s="${s}"][data-f="${f}"]`);
    const r = cell.getBoundingClientRect();
    const cs = getComputedStyle(cell);
    const px = (prop) => parseFloat(cs[prop]) || 0;
    return vertical
      ? { u0: r.top - box.top + px('borderTopWidth') + px('paddingTop'),
        u1: r.bottom - box.top - px('borderBottomWidth') - px('paddingBottom'),
        v0: r.left - box.left, v1: r.right - box.left }
      : { u0: r.left - box.left + px('borderLeftWidth') + px('paddingLeft'),
        u1: r.right - box.left - px('borderRightWidth') - px('paddingRight'),
        v0: r.top - box.top, v1: r.bottom - box.top };
  };
  layer.innerHTML = groups.map((g) => {
    const bars = g.bars.map(({ s, a, b }) => {
      const first = cellBox(s, a);
      const last = cellBox(s, b);
      // min / max: on a mirrored (left-handed) neck the frets run leftwards
      return { u0: Math.min(first.u0, last.u0), u1: Math.max(first.u1, last.u1), v0: first.v0, v1: first.v1 };
    }).sort((p, q) => p.v0 - q.v0);
    const points = staircase(bars, GROUP_INSET).map(([u, v]) => (vertical ? [v, u] : [u, v]));
    return `<path class="${g.id % 2 ? 'g-b' : 'g-a'}" d="${roundedPath(points, GROUP_RADIUS)}"/>`;
  }).join('');
}

/* Outline of stacked bars (one per string, each covering a range along u),
   moved inwards by d: walk down the far side, then back up the near side. */
function staircase(bars, d) {
  const same = (x, y) => Math.abs(x - y) < 0.5;
  const last = bars[bars.length - 1];
  const pts = [[bars[0].u0 + d, bars[0].v0 + d], [bars[0].u1 - d, bars[0].v0 + d]];
  for (let i = 0; i + 1 < bars.length; i++) {
    const y = (bars[i].v1 + bars[i + 1].v0) / 2;
    if (same(bars[i].u1, bars[i + 1].u1)) continue;
    const k = bars[i + 1].u1 > bars[i].u1 ? 1 : -1;   // the step's edge belongs to the wider bar
    pts.push([bars[i].u1 - d, y + k * d], [bars[i + 1].u1 - d, y + k * d]);
  }
  pts.push([last.u1 - d, last.v1 - d], [last.u0 + d, last.v1 - d]);
  for (let i = bars.length - 2; i >= 0; i--) {
    const y = (bars[i].v1 + bars[i + 1].v0) / 2;
    if (same(bars[i].u0, bars[i + 1].u0)) continue;
    const k = bars[i + 1].u0 < bars[i].u0 ? 1 : -1;
    pts.push([bars[i + 1].u0 + d, y + k * d], [bars[i].u0 + d, y + k * d]);
  }
  return pts;
}

/* Closed path through the points with every corner rounded (radius r, or
   less where an edge is too short). */
function roundedPath(pts, r) {
  const n = pts.length;
  const parts = [];
  for (let i = 0; i < n; i++) {
    const [px, py] = pts[i];
    const [ax, ay] = pts[(i + n - 1) % n];
    const [bx, by] = pts[(i + 1) % n];
    const la = Math.hypot(ax - px, ay - py);
    const lb = Math.hypot(bx - px, by - py);
    const rr = Math.min(r, la / 2, lb / 2);
    const p1 = [px + ((ax - px) / la) * rr, py + ((ay - py) / la) * rr];
    const p2 = [px + ((bx - px) / lb) * rr, py + ((by - py) / lb) * rr];
    parts.push(`${i ? 'L' : 'M'}${p1[0].toFixed(1)} ${p1[1].toFixed(1)}`,
      `Q${px.toFixed(1)} ${py.toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`);
  }
  return `${parts.join(' ')}Z`;
}

function renderChordPanel(ch, sc) {
  const def = findChord(state.chord.type);
  const spell = ch ? ch.spell : chordSpelling(state.chord.root, def);
  els.chordRoot.textContent = noteText(spell.root);
  els.chordType.textContent = ch ? ch.def.name : 'None';

  const voicing = voicingFor(def);
  els.chordVoicing.textContent = voicing === 'any' ? 'Any bass note'
    : `${INVERSION_NAMES[Number(voicing)]}, ${noteText(spell.notes[Number(voicing)])} in bass`;

  els.chordClear.disabled = !ch;
  els.chordVoicing.disabled = !ch;
  els.tglAllTones.disabled = !ch;
  els.shapePrev.disabled = els.shapeNext.disabled = !ch || ch.shapes.length < 2;
  els.chordStrum.disabled = !ch || !ch.shape;

  if (!ch) {
    els.chordSymbol.textContent = '';
    els.chordSymbol.classList.remove('on');
    els.chordName.textContent = 'No chord selected';
    els.chordMeta.textContent = 'Pick a chord type, or tap a triad in the Scale panel.';
    els.chordAlt.textContent = '';
    els.chordCapo.hidden = true;
    els.chordKey.hidden = true;
    els.chordTones.innerHTML = '<li class="np-placeholder">The notes of the selected shape appear here.</li>';
    els.shapeCount.hidden = true;
    els.shapeList.innerHTML = '';
    els.shapeList.dataset.empty = 'No chord selected';
    return;
  }

  const rootName = ch.rootName;
  els.chordSymbol.textContent = ch.symbol;
  els.chordSymbol.classList.add('on');
  fitText(els.chordSymbol);
  els.chordName.textContent = `${rootName} ${ch.def.name.toLowerCase()}`;
  const voicingLabel = ch.voicing === 'any' ? 'Any bass note' : INVERSION_NAMES[Number(ch.voicing)];
  const formula = ch.def.degrees.map((d) => fmtDeg(d === 'R' ? '1' : d)).join(' ');
  els.chordMeta.textContent = `${voicingLabel}, formula ${formula}`;
  const aliases = (CHORD_ALIASES[ch.def.id] || []).map((a) => rootName + a);
  els.chordAlt.textContent = aliases.length ? `= ${aliases.join(', ')}` : '';
  // With a capo, name the shape to play: the chord moved down by the capo
  const c = capo();
  els.chordCapo.hidden = !c;
  const shapeName = c ? noteText(spellChord(ch.root - c, ch.def, state.flats).root) : '';
  els.chordCapo.textContent = c ? `With capo ${c}, play the ${shapeName}${ch.def.symbol} shape` : '';
  els.tonesLabel.textContent = c ? 'Shape notes, bass to top, frets from the capo' : 'Shape notes, bass to top';

  // With a scale shown: does the chord fit it, and if not, which notes do not
  const outside = outsideScale(ch.root, ch.def, sc);
  els.chordKey.hidden = !outside;
  if (outside) {
    const key = `${sc.rootName} ${sc.def.short}`;
    els.chordKey.classList.toggle('out', outside.length > 0);
    els.chordKey.textContent = outside.length
      ? `Outside ${key}: ${outside.map((t) => noteText(ch.spell.names.get(t.pc))).join(', ')}`
      : `Every note is in ${key}`;
  }

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
  const offKey = offKeyTest(sc);
  els.chordTones.innerHTML = notes.map((x) => {
    const deg = ch.degOfPc.get(mod12(x.midi));
    const name = pitchText(x.midi, ch.spell.names.get(mod12(x.midi)));
    const open = c ? 'capo' : 'open';
    const loc = x.f === 0 ? `str ${stringNumber(x.s)}, ${open}` : `str ${stringNumber(x.s)}, fr ${x.f}`;
    const off = offKey(x.midi);
    return `<li class="np-note${deg === 'R' ? ' root' : ''}${off ? ' off-key' : ''}" data-midi="${x.midi}" data-s="${x.s}" ` +
      `data-f="${x.f + c}" title="Click to hear ${esc(name)}${off ? `, not in ${sc.rootName} ${sc.def.short}` : ''}">` +
      `<span class="np-note-name">${esc(name)}</span>` +
      `<span class="np-deg">${tx(fmtDeg(deg))}</span>` +
      `<span class="np-role">${esc(DEGREE_NAMES[deg])}</span>` +
      `<span class="np-loc"><kbd>${loc}</kbd></span></li>`;
  }).join('');

  els.shapeList.innerHTML = ch.shapes.map((shape, i) => {
    const where = shapePlace(shape);
    const sel = i === ch.index;
    return `<li><button type="button" class="chip${sel ? ' selected' : ''}" data-shape="${i}" aria-pressed="${sel}" ` +
      `title="Strings low to high${c ? ', frets from the capo' : ''}: ${tabOf(shape)}"><span class="chip-num tx">${where}</span>` +
      `<span class="mono tx">${tabOf(shape)}</span></button></li>`;
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
  els.scaleRoot.textContent = sc ? sc.rootName : noteText(scaleSpelling(state.scale.root, findScale(state.scale.type)).root);
  els.scaleType.textContent = sc ? sc.def.name : 'None';
  els.scaleClear.disabled = !sc;
  els.tglScaleOnly.disabled = els.tglScaleGroups.disabled = !sc;
  els.tglScaleGroups.disabled = !sc || sc.def.steps.length >= 12;

  if (scaleRun && scaleRun.key !== scaleKey(sc)) stopScale();   // another scale (or none): stop playing the old one
  els.scalePlay.disabled = !sc;
  if (!sc) {
    els.scaleSymbol.textContent = '';
    els.scaleSymbol.classList.remove('on');
    els.scaleName.textContent = 'No scale selected';
    els.scaleMeta.textContent = 'Pick a scale type to see its notes on the neck.';
    els.scaleAlt.textContent = '';
    els.scaleNotes.innerHTML = '<li class="empty-text" style="grid-row:1">The notes of the scale appear here.</li>';
    els.scaleTriads.innerHTML = '<span class="empty-text">The triads that fit the scale appear here.</span>';
    return;
  }

  // Description, like the Chord panel's: name, formula and the common
  // scales with the same notes
  const degrees = scaleDegrees(sc.def);
  els.scaleSymbol.textContent = sc.rootName;
  els.scaleSymbol.classList.add('on');
  fitText(els.scaleSymbol);
  els.scaleName.textContent = `${sc.rootName} ${scaleTitle(sc.def)}`;
  els.scaleMeta.textContent = `Formula ${degrees.join(' ')}`;
  const relatives = relativeScales(sc);
  els.scaleAlt.textContent = relatives.length ? `Same notes as ${relatives.join(', ')}` : '';

  // Notes with their interval on top, and the step to the next note below
  const pill = (deg) => `<span class="scale-deg" aria-hidden="true">${deg === '1' ? 'R' : deg}</span>`;
  const parts = [];
  sc.spell.notes.forEach((n, i) => {
    parts.push(`<li><button type="button" class="scale-note${i === 0 ? ' root' : ''}" data-i="${i}" ` +
      `title="Hear ${esc(noteText(n))}, ${i === 0 ? 'the root' : degrees[i]}">${tx(noteText(n))}${pill(degrees[i])}</button></li>`);
    const next = i + 1 < sc.def.steps.length ? sc.def.steps[i + 1] : 12;
    const gap = next - sc.def.steps[i];
    parts.push(`<li class="scale-gap" aria-label="${gap} semitones"><span>${STEP_NAMES[gap] || gap}</span></li>`);
  });
  parts.push(`<li><button type="button" class="scale-note octave" data-i="${sc.def.steps.length}" ` +
    `title="Hear ${esc(sc.rootName)}, an octave up">${tx(sc.rootName)}${pill('1')}</button></li>`);
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
      `title="Select ${esc(t.name)} ${def.name.toLowerCase()}"><span class="chip-num tx">${esc(t.num)}</span>` +
      `<span class="tx">${esc(t.name + def.symbol)}</span></button>`;
  }).join('');
}

/* Triads of the scale, in scale order. In a 7-note scale each degree gets
   the triad built from the scale's own thirds (degrees 1-3-5 from it); in
   other scales, every major, minor, diminished or augmented triad whose
   notes are all in the scale. Each gets a roman numeral from its root's
   degree (letter distance from the scale root), with ♭ or ♯ when that degree
   differs from the major scale's (A minor: i ii° ♭III iv v ♭VI ♭VII), lower
   case for minor and diminished, ° for diminished, + for augmented. */
const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];
const triadType = (third, fifth) => (third === 4 && fifth === 7 ? 'maj' : third === 3 && fifth === 7 ? 'min'
  : third === 3 && fifth === 6 ? 'dim' : third === 4 && fifth === 8 ? 'aug' : null);
function scaleTriads(sc) {
  const notes = sc.spell.notes;
  if (notes.length >= 12) return null;
  const found = [];
  if (notes.length === 7) {
    notes.forEach((n, i) => {
      const type = triadType(mod12(notes[(i + 2) % 7].pc - n.pc), mod12(notes[(i + 4) % 7].pc - n.pc));
      if (type) found.push({ n, type });
    });
  } else {
    const seen = new Set();
    for (const n of notes) {
      if (seen.has(n.pc)) continue;
      seen.add(n.pc);
      for (const type of TRIAD_TYPES) {
        if (findChord(type).steps.every((st) => sc.set.has(mod12(n.pc + st)))) found.push({ n, type });
      }
    }
  }
  return found.map(({ n, type }) => {
    const degree = (n.letter - sc.spell.root.letter + 7) % 7;   // 0 = I
    let shift = mod12(n.pc - sc.root) - MAJOR_STEPS[degree];
    if (shift > 6) shift -= 12;
    if (shift < -6) shift += 12;
    const accidental = shift < 0 ? '♭'.repeat(-shift) : '♯'.repeat(shift);
    const numeral = type === 'maj' || type === 'aug' ? ROMAN[degree] : ROMAN[degree].toLowerCase();
    return { root: n.pc, type, name: noteText(n), num: accidental + numeral + (type === 'dim' ? '°' : type === 'aug' ? '+' : '') };
  });
}

/* The scale's name in a sentence: "A natural minor", "A Dorian" (mode
   names keep their capital), "A blues scale" */
const SCALE_TITLES = {
  major: 'major', minor: 'natural minor', blues: 'blues scale', 'whole-tone': 'whole tone scale',
  'dim-wh': 'diminished whole-half', 'dim-hw': 'diminished half-whole', chromatic: 'chromatic scale',
};
const MODE_NAMES = ['Dorian', 'Phrygian', 'Lydian', 'Mixolydian', 'Locrian'];
const scaleTitle = (def) => SCALE_TITLES[def.id] || (MODE_NAMES.includes(def.name) ? def.name : def.name.toLowerCase());

/* Interval of each scale note from the root, by its degree (the letter the
   scale is spelled with) and how far it sits from the major scale's:
   A minor pentatonic is 1 ♭3 4 5 ♭7 */
const CHROMATIC_DEGREES = ['1', '♭2', '2', '♭3', '3', '4', '♭5', '5', '♭6', '6', '♭7', '7'];
function scaleDegrees(def) {
  if (def.steps.length >= 12) return CHROMATIC_DEGREES;
  const degrees = SCALE_LETTERS[def.id] || [1, 2, 3, 4, 5, 6, 7];
  return def.steps.map((step, i) => {
    const d = degrees[i];
    const shift = step - MAJOR_STEPS[d - 1];
    return (shift < 0 ? '♭'.repeat(-shift) : '♯'.repeat(shift)) + d;
  });
}

/* Common scales with exactly the same notes: A minor and C major, D Dorian
   and C major... Only the major, natural minor and pentatonic scales are
   named, the ones people know these notes by. */
const RELATIVE_IDS = ['major', 'minor', 'major-pentatonic', 'minor-pentatonic'];
function relativeScales(sc) {
  if (sc.def.steps.length >= 12) return [];
  const found = [];
  for (const id of RELATIVE_IDS) {
    if (id === sc.def.id) continue;
    const def = findScale(id);
    if (def.steps.length !== sc.set.size) continue;
    for (const n of sc.spell.notes) {
      if (def.steps.every((st) => sc.set.has(mod12(n.pc + st)))) found.push(`${noteText(n)} ${id === 'minor' ? 'minor' : scaleTitle(def)}`);
    }
  }
  return found;
}

/* ==========================================================================
   6. Events
   ========================================================================== */
function init() {
  for (const id of ['instrumentPicker', 'tuningSelect', 'neck', 'tglOctaves', 'tglFlats', 'tglLefty', 'tglAllTones',
    'chordRoot', 'chordType', 'chordVoicing', 'chordClear', 'chordSymbol', 'chordName', 'chordMeta',
    'chordAlt', 'chordCapo', 'chordKey', 'chordStrum', 'tonesLabel', 'capoSelect', 'chordTones', 'shapeCount', 'shapePrev', 'shapeNext', 'shapeList',
    'scaleRoot', 'scaleType', 'scaleClear', 'scaleNotes', 'scaleTriads', 'scaleSymbol', 'scaleName', 'scaleMeta', 'scaleAlt',
    'dockRecent', 'dockRecentList', 'dockRecentClear', 'recentLine', 'recentList', 'recentClear',
    'settings', 'settingsWideSlot', 'settingsNarrowSlot', 'instWideSlot', 'instNarrowSlot', 'sheet', 'sheetClose',
    'dockShapeBar', 'tglScaleOnly', 'tglScaleGroups', 'picker', 'pickerTitle', 'pickerBody', 'pickerClose', 'dockPrev', 'dockNext', 'dockStrum', 'dockShape', 'dockSymbol', 'dockTab',
    'tabChordValue', 'tabScaleValue', 'tabNeckValue', 'about', 'aboutOpen', 'aboutClose', 'shareOpen', 'shareStatus', 'scalePlay']) {
    els[id] = document.getElementById(id);
  }
  els.dockBar = document.querySelector('.dock-bar');
  els.chordBar = document.querySelector('.chord-bar');
  els.scaleBar = document.querySelector('.scale-bar');
  els.chordSwitches = els.chordBar.querySelector('.switch-row');
  els.scaleSwitches = els.scaleBar.querySelector('.switch-row');
  els.chordHead = document.querySelector('#panelChord .panel-head');
  els.scaleHead = document.querySelector('#panelScale .panel-head');
  els.notesLine = document.querySelector('.notes-line');
  els.tabs = [...document.querySelectorAll('.tab')];
  els.sheetPanels = [...els.sheet.querySelectorAll('.panel[data-tab]')];
  state = loadState();
  applyLink(location.search);   // opened from a shared link

  // Instrument and tuning: popups, each tile showing the open strings
  els.instrumentPicker.addEventListener('click', () => openPicker({
    title: 'Instrument', value: state.instrument,
    groups: [...new Set(INSTRUMENTS.map((i) => i.family))].map((family) => ({   // one group per family
      label: family,
      items: INSTRUMENTS.filter((i) => i.family === family).map((i) => {
        const t = tunedInstrument(i.id, state.tuning[i.id]);
        return { value: i.id, label: i.name, sub: tuningNotes(t.strings, t.tuning && t.tuning.flats) };
      }),
    })),
    onPick: (v) => {
      if (v === state.instrument) return;
      state.instrument = v;
      state.shape = rememberedShape();   // the shape last chosen for this chord on that instrument
      render();
    },
  }));
  els.tuningSelect.addEventListener('click', () => {
    const list = TUNINGS[state.instrument];
    if (!list) return;
    openPicker({
      title: 'Tuning', value: instrument().tuning.id,
      groups: [{ items: list.map((t) => ({ value: t.id, label: t.name, sub: tuningNotes(t.strings, t.flats) })) }],
      onPick: (v) => { state.tuning[state.instrument] = v; state.shape = rememberedShape(); render(); },
    });
  });

  for (const [id, key] of TOGGLES) {
    els[id].addEventListener('click', () => {
      state[key] = !state[key];
      render();
    });
  }

  setupNeckTaps();
  els.chordTones.addEventListener('click', (e) => {
    const card = e.target.closest('[data-midi]');
    if (!card) return;
    playNote(Number(card.dataset.midi));
    flashCell(card.dataset.s, card.dataset.f);
    keepChord();
  });
  // Strum buttons sound on press, like a plucked string. A click from the
  // keyboard (Enter, or Space on a button reached with Tab) still strums.
  for (const btn of [els.chordStrum, els.dockStrum]) {
    btn.addEventListener('pointerdown', (e) => { if (e.button === 0 && !btn.disabled) strum(); });
    btn.addEventListener('click', (e) => { if (e.detail === 0) strum(); });
  }

  // Recent chords: tap to switch, × on the current one to remove it, Clear to start over
  for (const list of [els.dockRecentList, els.recentList]) {
    list.addEventListener('click', (e) => {
      const remove = e.target.closest('[data-remove]');
      if (remove) { removeRecent(Number(remove.dataset.remove)); return; }
      const chip = e.target.closest('[data-i]');
      if (chip) playRecent(Number(chip.dataset.i));
    });
  }
  els.dockRecentClear.addEventListener('click', clearRecent);
  els.recentClear.addEventListener('click', clearRecent);

  // Dock (phones): shape bar, tabs and the sheet they open
  els.dockPrev.addEventListener('click', () => selectShape(state.shape - 1));
  els.dockNext.addEventListener('click', () => selectShape(state.shape + 1));
  els.dockShape.addEventListener('click', () => openTab('chord'));
  for (const tab of els.tabs) tab.addEventListener('click', () => openTab(tab.dataset.tab));
  setupSheetDrag();

  // Switching between phone and wide layouts (rotating, resizing)
  const relayout = () => {
    placeSettings();
    if (isWide()) ui.tab = null;
    render();
  };
  if (wideMedia.addEventListener) wideMedia.addEventListener('change', relayout);
  else wideMedia.addListener(relayout);
  if (window.ResizeObserver) {
    new ResizeObserver(() => drawGroups()).observe(els.neck);   // keep group outlines on their cells
  }

  // Root alone never turns a chord or scale on: "None" in the type menu means off
  // Moving the capo keeps the chord and shows its first shape from the capo
  els.capoSelect.addEventListener('click', () => openPicker({
    title: 'Capo', layout: 'roots', value: capo(),
    groups: [
      { items: [{ value: 0, label: 'No capo', cls: 'none', style: 'grid-column: 1 / -1' }] },
      { label: 'Fret where the capo sits', items: Array.from(
        { length: Math.min(MAX_CAPO, instrument().frets - SHAPE_SPAN) },
        (_, i) => ({ value: i + 1, label: String(i + 1) })) },
    ],
    onPick: (v) => { state.capo = Number(v); state.shape = 0; render(); },
  }));

  // Clearing the chord or the scale also closes its panel on phones
  const clearChord = () => { state.chord.on = false; ui.tab = null; render(); };
  const clearScale = () => {   // closes the sheet: centre the shape again, as on closing it
    const wasOpen = ui.tab !== null;
    state.scale.on = false;
    ui.tab = null;
    render();
    if (wasOpen) revealShape();
  };

  // Root and type buttons open the picker popup
  els.chordRoot.addEventListener('click', () => openPicker({
    title: 'Chord root', layout: 'roots', value: state.chord.root, note: fitsNote(currentScale()),
    groups: rootItems((pc) => chordSpelling(pc, findChord(state.chord.type)).root,
      (pc) => fitsScale(pc, findChord(state.chord.type), currentScale())),
    onPick: (v) => {
      const root = Number(v);
      if (state.chord.on) updateChord({ root });
      else { state.chord.root = root; render(); }
    },
  }));
  els.chordType.addEventListener('click', () => openPicker({
    title: 'Chord type', note: fitsNote(currentScale()),
    groups: [{ items: [{ value: '', label: 'None', sub: 'Hide the chord', cls: 'none' }] }, ...CHORDS.map((g) => ({
      label: g.group,
      items: g.items.map((c) => ({
        value: c.id,
        label: c.name,
        tag: noteText(chordSpelling(state.chord.root, c).root) + c.symbol,
        sub: chordSpelling(state.chord.root, c).notes.map(noteText).join(' '),
        cls: fitsScale(state.chord.root, c, currentScale()) ? 'fits' : '',
      })),
    }))],
    value: state.chord.on ? state.chord.type : '',
    onPick: (v) => (v ? updateChord({ type: v }) : clearChord()),
  }));
  els.scaleRoot.addEventListener('click', () => openPicker({
    title: 'Scale root', layout: 'roots', value: state.scale.root,
    groups: rootItems((pc) => scaleSpelling(pc, findScale(state.scale.type)).root),
    onPick: (v) => { state.scale.root = Number(v); render(); },
  }));
  els.scaleType.addEventListener('click', () => openPicker({
    title: 'Scale type',
    groups: [{ items: [{ value: '', label: 'None', sub: 'Hide the scale', cls: 'none' }] }, ...SCALES.map((g) => ({
      label: g.group,
      items: g.items.map((sc) => ({
        value: sc.id,
        label: sc.name,
        sub: sc.steps.length >= 12 ? 'All 12 notes' : scaleSpelling(state.scale.root, sc).notes.map(noteText).join(' '),
      })),
    }))],
    value: state.scale.on ? state.scale.type : '',
    onPick: (v) => {
      if (!v) { clearScale(); return; }
      Object.assign(state.scale, { type: v, on: true });
      render();
    },
  }));
  els.pickerBody.addEventListener('click', (e) => {
    const pick = e.target.closest('.pick');
    if (!pick) return;
    const handler = pickerPick;
    closePicker();
    if (handler) handler(pick.dataset.value);
  });
  els.pickerClose.addEventListener('click', closePicker);
  // About popup: opened from the header, closed like the picker
  els.shareOpen.addEventListener('click', shareLink);
  els.scalePlay.addEventListener('click', playScale);
  // A note of the Notes row: heard on press with a mouse, on release with a
  // finger (so swiping the row to scroll it plays nothing), and with Enter
  let pressedNote = null;
  els.scaleNotes.addEventListener('pointerdown', (e) => {
    pressedNote = null;
    const note = e.target.closest('.scale-note');
    if (!note || e.pointerType === 'touch' || e.button > 0) return;
    pressedNote = note;
    playScaleNote(Number(note.dataset.i));
  });
  els.scaleNotes.addEventListener('click', (e) => {
    const note = e.target.closest('.scale-note');
    if (!note) return;
    const pressed = pressedNote;
    pressedNote = null;
    if (note === pressed && e.detail > 0) return;   // heard on press already (a key press is not)
    playScaleNote(Number(note.dataset.i));
  });
  els.aboutOpen.addEventListener('click', () => { if (els.about.showModal) els.about.showModal(); else els.about.setAttribute('open', ''); });
  const closeAbout = () => { if (els.about.close) els.about.close(); else els.about.removeAttribute('open'); };
  els.aboutClose.addEventListener('click', closeAbout);
  els.about.addEventListener('click', (e) => { if (e.target === els.about) closeAbout(); });
  // A tap on the dimmed backdrop (outside the card) closes the popup
  els.picker.addEventListener('click', (e) => { if (e.target === els.picker) closePicker(); });
  els.chordVoicing.addEventListener('click', () => {
    const def = findChord(state.chord.type);
    const spell = chordSpelling(state.chord.root, def);
    openPicker({
      title: 'Voicing', value: voicingFor(def),
      groups: [{ label: 'Bass note, the lowest one played', items: [
        ...chordTones(state.chord.root, def).map((t, i) => ({
          value: String(i),
          label: INVERSION_NAMES[i],
          tag: noteText(spell.notes[i]),
          sub: i === 0 ? 'Root in the bass' : `${fmtDeg(t.deg)} in the bass`,
        })),
        { value: 'any', label: 'Any bass note', sub: 'Any inversion' },
      ] }],
      onPick: (v) => { state.voicing[state.instrument] = v; updateChord({}); },
    });
  });
  els.chordClear.addEventListener('click', clearChord);
  els.shapePrev.addEventListener('click', () => selectShape(state.shape - 1));
  els.shapeNext.addEventListener('click', () => selectShape(state.shape + 1));
  els.shapeList.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-shape]');
    if (chip) selectShape(Number(chip.dataset.shape));
  });

  els.scaleClear.addEventListener('click', clearScale);
  els.scaleTriads.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-type]');
    if (chip) updateChord({ root: Number(chip.dataset.root), type: chip.dataset.type });
  });

  // ← / → cycle through the shapes, Space strums, Escape closes the open
  // sheet. Space strums as soon as it is pressed, once per press. It is left
  // to a focused button only when you are moving around with the keyboard
  // (Tab): a button that has the focus after a click or a tap (Strum, a
  // switch, or the menu button a popup hands the focus back to) would
  // otherwise take Space and act on it.
  let keyboardFocus = false;   // the focus was last moved with the keyboard
  document.addEventListener('pointerdown', () => { keyboardFocus = false; }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Tab') keyboardFocus = true; }, true);
  const spaceStrums = (e) => e.key === ' ' && !els.picker.open && !els.about.open && !e.altKey && !e.ctrlKey && !e.metaKey &&
    !e.target.closest('input, textarea') && !(e.target.closest('button') && keyboardFocus);
  document.addEventListener('keyup', (e) => { if (spaceStrums(e)) e.preventDefault(); });   // no click on release
  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (els.picker.open || els.about.open) return;   // a popup handles its own keys (Escape closes it)
    if (e.key === 'Escape' && ui.tab) { openTab(null); return; }
    if (e.target.closest('input, textarea')) return;
    if (spaceStrums(e)) {
      e.preventDefault();
      if (!e.repeat) strum();   // holding Space strums once: release it to strum again
      return;
    }
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const ch = currentChord();
    if (!ch || ch.shapes.length < 2) return;
    e.preventDefault();
    selectShape(state.shape + (e.key === 'ArrowRight' ? 1 : -1));
  });

  placeSettings();
  render();
  keepScreenOn();
  installable();
}

/* Keep the screen from dimming while Frettle is open (handy on a music
   stand). The browser drops the lock when the page is hidden, so it is asked
   for again when the page comes back, and on taps for browsers that only
   allow it after a user gesture. */
let wakeLock = null;
async function keepScreenOn() {
  if (!('wakeLock' in navigator) || wakeLock || document.visibilityState !== 'visible') return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } catch {
    /* refused (battery saver, unsupported context): the screen dims as usual */
  }
}
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', keepScreenOn);
  document.addEventListener('pointerdown', keepScreenOn);
}

/* Offline support and "Add to home screen": register the service worker
   (only possible when the site is served over http(s), not from a file). */
function installable() {
  if (!('serviceWorker' in navigator) || !location.protocol.startsWith('http')) return;
  navigator.serviceWorker.register('sw.js').catch(() => { /* offline use simply stays unavailable */ });
}

if (typeof document !== 'undefined') init();
