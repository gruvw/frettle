'use strict';

/* ==========================================================================
   Frettle: chord and scale visualizer
   1. Music data      2. Chord shape finder (pure, no DOM)
   3. State           4. Sound          5. Rendering      6. Events

   A rule for touch screens: a swipe to scroll must never set anything off.
   Plain actions listen for 'click' (the browser already leaves out swipes,
   and taps that only stop a scroll still gliding). Anything that acts on
   press (a sound, mostly) goes through onPress, or the neck's own handler
   (setupNeckTaps): never a bare 'pointerdown' listener, which fires as soon
   as a finger lands, swipe or not. The few 'pointerdown' listeners left
   only watch (the chord list's drag, the sheet's drag, the scroll check,
   keeping the screen on, the install card's count).
   ========================================================================== */

/* ==========================================================================
   1. Music data
   ========================================================================== */
const STORAGE_KEY = 'frettle';
const OLD_STORAGE_KEYS = ['frettle.settings.v1'];   // removed: their settings are not read
const SAVE_VERSION = 1;   // a save of another version is not read: defaults instead
const TOGGLES = [['tglOctaves', 'octaves'], ['tglFlats', 'flats'], ['tglLefty', 'leftHanded'], ['tglAllTones', 'allTones'],
  ['tglScaleOnly', 'scaleOnly'], ['tglScaleGroups', 'scaleGroups']];   // [button id, state key]
const SHARP_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

/* Open strings as MIDI notes (C4 = 60), from the string nearest your face
   when you hold the instrument to the one nearest the floor. The standard
   ukulele is re-entrant: its first-listed string is a high G. A mandolin's
   strings come in pairs tuned alike: each pair is one string here, as on
   mandolin charts; the mandola is a mandolin a fifth lower (C G D A), played
   with the same shapes. The 5-string banjo's first-listed string is a short,
   high drone: it starts at the 5th fret (`starts`, the fret where each
   string begins) and its open note is the one listed. `span` is how many
   frets a hand covers (small mandolin frets: one more); `smallFrets`: a
   short neck, where the fingers stretch further (see stretchOk); `fifths`:
   tuned in fifths, which changes scale groups; `dots`: inlay frets, if not a
   guitar's.
   The piano has keys, not strings (`piano`): its 88 keys from A0 (MIDI 21)
   to C8 (108). No tuning, capo or groups; a chord's shapes are its notes
   close together, one place on the keyboard after another (pianoShapes),
   written as key numbers counted from its lowest key (0 to 87). */
const PIANO_LOW = 21;
const PIANO_KEYS = 88;
const INSTRUMENTS = [
  { id: 'guitar', family: 'Guitar', name: 'Guitar', short: 'Guitar', strings: [40, 45, 50, 55, 59, 64], frets: 22 },
  { id: 'guitar7', family: 'Guitar', name: '7-string Guitar', short: '7-string', strings: [35, 40, 45, 50, 55, 59, 64], frets: 24 },
  { id: 'bass', family: 'Bass', name: 'Bass', short: 'Bass', strings: [28, 33, 38, 43], frets: 20 },
  { id: 'bass5', family: 'Bass', name: '5-string Bass', short: '5-string', strings: [23, 28, 33, 38, 43], frets: 24 },
  { id: 'ukulele', family: 'Ukulele', name: 'Ukulele', short: 'Ukulele', strings: [67, 60, 64, 69], frets: 18, smallFrets: true },
  { id: 'baritone', family: 'Ukulele', name: 'Baritone Ukulele', short: 'Baritone', strings: [50, 55, 59, 64], frets: 18, smallFrets: true },
  { id: 'piano', family: 'Piano', name: 'Piano', short: 'Piano', strings: [], frets: 0, piano: true },
  { id: 'mandolin', family: 'Mandolin', name: 'Mandolin', short: 'Mandolin', strings: [55, 62, 69, 76], frets: 20, span: 5, smallFrets: true, fifths: true },
  { id: 'mandola', family: 'Mandolin', name: 'Mandola', short: 'Mandola', strings: [48, 55, 62, 69], frets: 20, span: 5, smallFrets: true, fifths: true },
  { id: 'banjo', family: 'Banjo', name: 'Banjo', short: 'Banjo', strings: [67, 50, 55, 59, 62], starts: [5, 0, 0, 0, 0], frets: 22,
    dots: { single: [3, 5, 7, 10, 15, 17, 19, 22], double: [12] } },
];
/* Other tunings, for the instruments that have common ones; the first is the
   standard tuning. `flats`: write its notes with flats (E♭ standard). `short`:
   for the Neck tab on phones, when the name is too long for it. */
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
    { id: 'half-down', name: 'Half step down', short: 'Half down', strings: [39, 44, 49, 54, 58, 63], flats: true },
    { id: 'whole-down', name: 'Whole step down', short: 'Whole down', strings: [38, 43, 48, 53, 57, 62] },
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
  banjo: [   // the drone first: g D G B D
    { id: 'standard', name: 'Open G (standard)', strings: [67, 50, 55, 59, 62] },
    { id: 'double-c', name: 'Double C', strings: [67, 48, 55, 60, 62] },
    { id: 'c', name: 'C tuning', strings: [67, 48, 55, 59, 62] },
    { id: 'g-modal', name: 'G modal (Sawmill)', short: 'G modal', strings: [67, 50, 55, 60, 62] },
    { id: 'open-d', name: 'Open D', strings: [66, 50, 54, 57, 62] },
  ],
};
/* An instrument's tunings: its common ones, or just its standard one */
const tuningsOf = (id) => TUNINGS[id] || [{ id: 'standard', name: 'Standard', strings: findInstrument(id).strings }];
/* Your own tuning for an instrument (one each, kept in state.custom), named
   by its notes: "C G D G B D". Each string within two octaves of standard.
   None kept: it holds standard ("Tune each string" in the menu). */
const CUSTOM_RANGE = 24;   // semitones either way from standard
function customTuning(id) {
  const strings = typeof state === 'object' && state && state.custom && state.custom[id];
  return strings ? { id: 'custom', name: tuningNotes(strings, state.flats, id), short: 'Custom', custom: true, strings } : null;
}
/* Saved tunings: custom tunings kept under a name, any number per
   instrument (state.saved: { instrument: [{ name, strings }] }), in the
   order saved. They are treated as presets: picked from the tuning menu,
   matched by their notes (a custom tuning, or a link's, that lands on one
   is that one). Their id is their notes; a link holds only the notes. */
const NAME_MAX = 24;
const savedId = (strings) => `saved:${customText(strings)}`;
function savedTunings(id, saved = typeof state === 'object' && state ? state.saved : {}) {
  return ((saved && saved[id]) || []).map((t) => ({ id: savedId(t.strings), name: t.name, short: t.name, saved: true, strings: t.strings }));
}
/* A name as typed: spaces at either end and runs of spaces trimmed, and the
   invisible characters that could upset the page (controls, text direction
   overrides) left out */
function cleanName(name) {
  if (typeof name !== 'string') return '';
  const text = name.replace(/[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').replace(/\s+/g, ' ').trim();
  return Array.from(text).slice(0, NAME_MAX).join('').trim();   // (by character: an emoji is not cut in half)
}
/* The preset tuning with these open strings, if any (a custom tuning that
   lands on one is that one), else the saved one */
const sameStrings = (t, strings) => t.strings.length === strings.length && t.strings.every((m, i) => m === strings[i]);
const matchPreset = (id, strings) => tuningsOf(id).find((t) => sameStrings(t, strings)) || null;
const matchTuning = (id, strings, saved) => matchPreset(id, strings) || savedTunings(id, saved).find((t) => sameStrings(t, strings)) || null;
/* An instrument in one of its tunings (the standard one if none or unknown) */
function tunedInstrument(id, tuningId = 'standard') {
  const inst = findInstrument(id);
  const list = tuningsOf(id);
  const tuning = (tuningId === 'custom' && customTuning(id))
    || (String(tuningId).startsWith('saved:') && savedTunings(id).find((t) => t.id === tuningId))
    || list.find((t) => t.id === tuningId) || list[0];
  return { ...inst, strings: tuning.strings, tuning };
}
/* Default "Inversion" (state.inversion) per instrument: '0' = root in the bass, 'any' = any bass note.
   Ukulele chords (re-entrant G), baritone, mandolin, mandola and banjo chords
   often have another note lowest (the banjo's open G chord has D in the bass). */
const DEFAULT_INVERSION = {
  guitar: '0', guitar7: '0', bass: '0', bass5: '0', ukulele: 'any', baritone: 'any', mandolin: 'any', mandola: 'any', banjo: 'any', piano: '0' };
const MAX_CAPO = 12;
const SINGLE_DOTS = [3, 5, 7, 9, 15, 17, 19, 21];
const DOUBLE_DOTS = [12, 24];

/* Short strings (the banjo's drone). Fret numbers on the neck are the neck's
   own, as in banjo tab: the drone's first fret is the 6th. A capo leaves the
   drone alone; banjo players raise it by the same amount (a spike or a
   5th-string capo at fret 5 + capo), and so does Frettle. */
const startFret = (inst, s) => (inst.starts ? inst.starts[s] : 0);
/* Pitch of string s at neck fret f, for f at or past where the string starts */
const fretPitch = (inst, s, f) => inst.strings[s] + f - startFret(inst, s);
/* Neck fret of a shape's fret (shapes count from the capo; 0 = the string
   rings open, which for the drone is where it starts, past its spike).
   Shapes never fret the drone. */
const shapeNeckFret = (inst, s, f, capo) => (f === 0 ? startFret(inst, s) : f) + capo;

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
  { group: 'Harmonic & melodic minor', items: [
    { id: 'harmonic-minor', name: 'Harmonic minor', short: 'Harm. min', steps: [0, 2, 3, 5, 7, 8, 11] },
    { id: 'phrygian-dominant', name: 'Phrygian dominant', short: 'Phryg. dom.', steps: [0, 1, 4, 5, 7, 8, 10] },
    { id: 'melodic-minor', name: 'Melodic minor', short: 'Mel. min', steps: [0, 2, 3, 5, 7, 9, 11] },
    { id: 'lydian-dominant', name: 'Lydian dominant', short: 'Lyd. dom.', steps: [0, 2, 4, 6, 7, 9, 10] },
    { id: 'altered', name: 'Altered (super Locrian)', short: 'Altered', steps: [0, 1, 3, 4, 6, 8, 10] },
  ] },
  { group: 'Pentatonic & blues', items: [
    { id: 'major-pentatonic', name: 'Major pentatonic', short: 'Maj. pent', steps: [0, 2, 4, 7, 9] },
    { id: 'minor-pentatonic', name: 'Minor pentatonic', short: 'Min. pent', steps: [0, 3, 5, 7, 10] },
    { id: 'major-blues', name: 'Major blues', short: 'Maj. blues', steps: [0, 2, 3, 4, 7, 9] },
    { id: 'blues', name: 'Blues', short: 'Blues', steps: [0, 3, 5, 6, 7, 10] },
    { id: 'hirajoshi', name: 'Hirajoshi', short: 'Hirajoshi', steps: [0, 2, 3, 7, 8] },
  ] },
  { group: 'Double harmonic', items: [
    { id: 'double-harmonic-major', name: 'Double harmonic major', short: 'Dbl. harm. maj', steps: [0, 1, 4, 5, 7, 8, 11] },
    { id: 'double-harmonic-minor', name: 'Double harmonic minor', short: 'Dbl. harm. min', steps: [0, 2, 3, 6, 7, 8, 11] },
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
  b6: 'Minor 6th', '#11': 'Augmented 11th', b13: 'Minor 13th',
};
// (as many as a chord can have notes: the namer's readings run to seven,
// a 13th with its tensions, and a piano key can be any of them)
const INVERSION_NAMES = ['Root position', '1st inversion', '2nd inversion', '3rd inversion', ...[4, 5, 6, 7, 8, 9, 10, 11].map((n) => `${n}th inversion`)];
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
const TRIAD_TYPES = ['maj', 'min', 'dim', 'aug'];
const STEP_NAMES = { 1: 'H', 2: 'W', 3: 'W+H', 4: '2W' };

const ALL_CHORDS = CHORDS.flatMap((g) => g.items);
const ALL_SCALES = SCALES.flatMap((g) => g.items);
const findChord = (id) => ALL_CHORDS.find((c) => c.id === id) || customChord(id);
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
  'major-blues': [1, 2, 3, 3, 5, 6], hirajoshi: [1, 2, 3, 5, 6], altered: [1, 2, 3, 3, 5, 6, 7],   // (the altered scale as jazz writes it: C D♭ E♭ E, not F♭)
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
   from the root (null: no letters, e.g. chromatic). A note that would need
   more accidentals than `most` is written plainly instead (in the
   direction it leans: B♭♭ as A, F♭♭ as E♭, F♯♯ as G). */
function spellNotes(root, steps, offsets, flats, most = 2) {
  return steps.map((step, i) => {
    const n = offsets ? spellAs(root.pc + step, (root.letter + offsets[i]) % 7) : plainNote(root.pc + step, flats);
    return Math.abs(n.acc) > most ? plainNote(root.pc + step, most < 2 ? n.acc < 0 : flats) : n;
  });
}
function spellKey(rootPc, steps, offsets, preferFlats, forcedRoot = null, minorKey = false, most = 2) {
  const minor = minorKey || (steps.some((x) => mod12(x) === 3) && !steps.some((x) => mod12(x) === 4));
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
  const notes = spellNotes(root, steps, offsets, flats, most);
  const names = new Map();
  for (const n of notes) if (!names.has(n.pc)) names.set(n.pc, n);
  return { root, notes, names, flats };
}
function spellScale(rootPc, def, preferFlats) {
  const offsets = def.steps.length >= 12 ? null : (SCALE_LETTERS[def.id] || [1, 2, 3, 4, 5, 6, 7]).map((d) => d - 1);
  // A scale with a ♭2 and a ♭6 is read in a minor key, whatever its 3rd:
  // C♯ Phrygian dominant (C♯ D E♯ F♯...), not D♭ (D♭ E♭♭ F...)
  const dark = offsets && def.steps.includes(1) && def.steps.includes(8);
  return spellKey(rootPc, def.steps, offsets, preferFlats, null, dark);
}
const degreeOffset = (deg) => (deg === 'R' ? 0 : (Number(deg.replace(/\D/g, '')) - 1) % 7);
/* A chord's notes as chord charts write them: no double sharps or flats
   (Cdim7 is C E♭ G♭ A, E7♯9 is E G♯ B D G); its interval badges keep the
   theory (♭♭7, ♯9). Scales keep theirs: each letter once (G♯ harmonic
   minor has F♯♯). */
function spellChord(rootPc, def, preferFlats, forcedRoot = null) {
  return spellKey(rootPc, def.steps, def.degrees.map(degreeOffset), preferFlats, forcedRoot, false, 1);
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

/* A full 4-fret stretch on a long neck (guitar, bass, banjo): one finger per
   fret, so its top fret takes the pinky, and the ring finger as well only
   when the index holds a single note on the lowest fret (banjo E♭m 1 3 4 4).
   Three notes up there, or two with the index on several strings, are out
   of reach (banjo C 0 2 5 5 5, guitar 4 1 1 1 4 4). Small frets (ukulele,
   mandolin) allow it: ukulele C♯m 1 4 4 4. */
function stretchOk(inst, frets) {
  if (inst.smallFrets) return true;
  const fretted = frets.filter((f) => f > 0);
  if (!fretted.length) return true;
  const low = Math.min(...fretted);
  const high = Math.max(...fretted);
  if (high - low < 3) return true;
  const top = fretted.filter((f) => f === high).length;
  const bottom = fretted.filter((f) => f === low).length;
  return top === 1 || (top === 2 && bottom === 1);
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

/* The chord tones a shape may leave out (their places in the chord's
   tones): the 5th of a chord of four notes or more, the 9th of an 11th or
   13th; never the bass note asked for (inversion). None on a piano: its
   shapes play every tone. */
function optionalTones(def, inversion, piano = false) {
  const out = new Set();
  if (piano) return out;
  const upper = def.degrees.includes('11') || def.degrees.includes('13');
  def.degrees.forEach((d, i) => {
    if (((d === '5' && def.degrees.length >= 4) || (d === '9' && upper)) && String(i) !== inversion) out.add(i);
  });
  return out;
}

/* extraPcs: notes also ringing (a banjo's open drone), which count as chord
   tones the shape has. forced: a chart shape kept even if it leaves out a
   required tone (the banjo's D7, 0 2 1 0, has no F♯). */
function shapeCandidates(inst, rootPc, def, inversion, extraPcs = [], forced = null) {
  const tones = chordTones(rootPc, def);
  const n = inst.strings.length;
  const chordPcs = new Set(tones.map((t) => t.pc));
  const bassPc = inversion === 'any' ? null : tones[Number(inversion)].pc;
  const optional = [...optionalTones(def, inversion)].map((i) => tones[i].pc);
  const required = tones.map((t) => t.pc).filter((pc) => !optional.includes(pc));
  const minSounding = Math.min(n, Math.max(required.length, tones.length <= 2 ? 2 : 3));
  const maxInner = n >= 6 ? 1 : 0;
  // Top strings left out: one at most, but any number for a power chord (two
  // notes) on a guitar's 5 strings or more, played on the low strings (G5:
  // 3 5 5 x x x; a 4-string instrument plays its own across all four)
  const maxTrail = tones.length <= 2 && n >= 5 ? n : 1;
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
    if (inner > maxInner || trail > maxTrail) return null;

    const pcs = new Set(sound.map((x) => mod12(x.midi)));
    const complete = required.every((pc) => pcs.has(pc) || extraPcs.includes(pc));
    if (!complete && !(forced && frets.join(',') === forced.join(','))) return null;

    const lowest = sound.reduce((x, y) => (y.midi < x.midi ? y : x));
    const bass = mod12(lowest.midi);
    if (bassPc !== null && bass !== bassPc) return null;

    const { fingers, barre, barreFrom } = fingersFor(frets);
    if (fingers > MAX_FINGERS || !stretchOk(inst, frets)) return null;

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
      // (a power chord: best on three strings, root, 5th and octave, G5 3 5 5 x x x)
      sound: maxTrail > 1 ? -Math.abs(sound.length - 3) : sound.length,
      opt: optional.filter((pc) => pcs.has(pc) || extraPcs.includes(pc)).length,
      lead: small ? 0 : first,
      leadSmall: small ? first : 0,
      inner,
      trail: maxTrail > 1 ? 0 : trail,   // (a power chord's: as it is played)
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

function findShapes(inst, rootPc, def, inversion, weights = SHAPE_WEIGHTS) {
  if (inst.starts) return droneShapes(inst, rootPc, def, inversion, weights);
  return pickShapes(shapeCandidates(inst, rootPc, def, inversion), weights, chartShape(inst, rootPc, def));
}

/* Banjo: chords are fretted on the long strings, as on any 4-string
   instrument. The drone then rings open when its note is in the chord, as
   banjo players let it, and is left out otherwise; it is never fretted in
   a chord. A ringing drone counts as a chord tone: C7 is 2 3 1 2 under an
   open g (its 5th), A7 can be the A barre under an open g (its 7th).
   It never sets the bass: high up the neck, where all the fretted notes
   are above it, it is left out (as banjo players skip it there), and a
   shape that needed it for a chord tone goes. */
function droneShapes(inst, rootPc, def, inversion, weights) {
  const long = inst.strings.map((m, s) => s).filter((s) => !startFret(inst, s));
  const drones = inst.strings.map((m, s) => s).filter((s) => startFret(inst, s));
  const longInst = { ...inst, strings: long.map((s) => inst.strings[s]), starts: undefined };
  const tones = chordTones(rootPc, def);
  const chordPcs = new Set(tones.map((t) => t.pc));
  const optional = [...optionalTones(def, inversion)].map((i) => tones[i].pc);
  const required = tones.map((t) => t.pc).filter((pc) => !optional.includes(pc));
  const rings = (s) => chordPcs.has(mod12(inst.strings[s]));
  const ringing = drones.filter(rings).map((s) => mod12(inst.strings[s]));
  const chart = chartShape(longInst, rootPc, def);
  const low = (shape) => Math.min(...shape.frets.map((f, q) => (f < 0 ? Infinity : longInst.strings[q] + f)));
  // A drone that rings with this shape: in the chord, and above its lowest note
  const ringsWith = (s, shape) => rings(s) && inst.strings[s] > low(shape);
  const candidates = shapeCandidates(longInst, rootPc, def, inversion, ringing, chart).filter((shape) => {
    if (chart && shape.frets.join(",") === chart.join(",")) return true;   // (a chart shape: kept, as there)
    const pcs = new Set(shape.frets.flatMap((f, q) => (f < 0 ? [] : [mod12(longInst.strings[q] + f)])));
    for (const s of drones) if (ringsWith(s, shape)) pcs.add(mod12(inst.strings[s]));
    return required.every((pc) => pcs.has(pc));
  });
  return pickShapes(candidates, weights, chart).map((shape) => {
    const frets = inst.strings.map((m, s) => (startFret(inst, s) ? (ringsWith(s, shape) ? 0 : -1) : shape.frets[long.indexOf(s)]));
    return { ...shape, frets };
  });
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
   the current neck (and fits the chosen inversion) it comes first, since that
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
  // Banjo, its four long strings in open G (D G B D), from the Deering and
  // Walkin' on Water (wowrec) chord charts. Where those give a shape without
  // the root (A7 2 0 2 2, Am7 2 0 1 2...), a shape with it is used instead,
  // or none ('-': the finder's best comes first). D7 0 2 1 0 as Deering,
  // Dummies and most charts teach it; A7 from Deering's movable shapes.
  { strings: [50, 55, 59, 62], types: {
    maj: '2012 3123 0234 5345 2102 3213 4324 0000 1111 2222 3333 4444',
    min: '1011 2122 0233 1344 2002 3113 4224 5335 1101 2212 3323 4434',
    7: '2312 3423 0210 5645 2100 3211 4322 0003 4111 2225 6333 1201',
    m7: '1311 2422 0213 4321 2000 3111 4222 0333 6444 - - 0204',
    maj7: '- - 4220 - 2101 - - 0004 - - - 1304',
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
    return shape === '-' ? null : [...shape].map((c) => (c === 'x' ? -1 : Number(c)));
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

/* A chord's shapes on the piano: its notes close together, as written (a
   9th above the octave, as C9's D), with the inversion's note in the bass and
   the others above it in their order (a note below the bass goes up an
   octave): C E G, E G C, G C E. One shape per place on the keyboard where it
   fits. "Any bass note": every inversion, at every place. The first one is
   the one nearest the middle of the keyboard (its notes' average nearest
   E4; "any bass note": in root position), then the others up the keyboard, then on from its bottom: the arrows
   move up an octave at a time and come round. An octave alone (one note)
   is played as two, the octave apart.
   Returns [{ frets: keys from A0 (0) up, pos: the lowest, piano: true }]. */
function pianoShapes(rootPc, def, inversion) {
  const steps = def.steps.length > 1 ? def.steps : [0, 12];
  const basses = inversion === 'any' ? def.steps.map((_, i) => i) : [Number(inversion) || 0].filter((i) => i < def.steps.length);
  const shapes = [];
  for (const b of basses) {
    const bass = steps[b];
    const up = steps.map((st) => { let x = st; while (x < bass || (x === bass && st !== bass)) x += 12; return x - bass; });
    const offsets = [...new Set(up)].sort((x, y) => x - y);   // (the bass first: 0)
    for (let low = PIANO_LOW + mod12(rootPc + bass - PIANO_LOW); low + offsets[offsets.length - 1] < PIANO_LOW + PIANO_KEYS; low += 12) {
      shapes.push({ frets: offsets.map((o) => low + o - PIANO_LOW), pos: low - PIANO_LOW, piano: true });
    }
  }
  return shapes.sort((x, y) => x.pos - y.pos || keysMid(x) - keysMid(y));   // low to high
}
const keysMid = (sh) => sh.frets.reduce((sum, k) => sum + k, 0) / sh.frets.length + PIANO_LOW;   // a piano shape's middle (MIDI)
/* The shape a chord starts on (its first shape, a fresh chord or "back to
   the first"): the finder's first on a neck; on the piano, where they go
   low to high, the one around middle C (with "Any bass note", in root
   position) */
function homeShape(shapes, root, inversion) {
  if (!shapes.length || !shapes[0].piano) return 0;
  const found = shapes.filter((sh) => !sh.drawn && (inversion !== 'any' || mod12(sh.frets[0] + PIANO_LOW) === mod12(root)));
  if (!found.length) return 0;
  const home = found.reduce((best, sh) => (Math.abs(keysMid(sh) - 64) < Math.abs(keysMid(best) - 64) ? sh : best));
  return shapes.indexOf(home);
}

/* ==========================================================================
   Chord types beyond the menus' (named in Name a chord). Any set of notes
   gets a name: above a root, each interval takes its usual role (3rd,
   5th, 7th, 9th, 11th, 13th, or an altered one: ♭9, ♯11...) and the symbol
   is written the usual way (C7(♯11), Cmaj9, Cm(add9), C7sus4, C(no3)).
   Two notes are named after their interval (C(M3): C and the major 3rd
   above). Such a chord is a type like the others (its shapes, spelling,
   chip, link, save), its id its intervals: "i-3-5-b7-s11" (# as s, the
   root left out).
   ========================================================================== */
const DEGREE_STEPS = { R: 0, b2: 1, 2: 2, b3: 3, 3: 4, 4: 5, b5: 6, 5: 7, '#5': 8, b6: 8, 6: 9, bb7: 9, b7: 10, 7: 11,
  b9: 13, 9: 14, '#9': 15, 11: 17, '#11': 18, b13: 20, 13: 21 };
const DEGREE_RANK = Object.keys(DEGREE_STEPS).sort((a, b) => DEGREE_STEPS[a] - DEGREE_STEPS[b]);   // (by pitch: an object lists number-like keys first)
const byDegree = (a, b) => DEGREE_RANK.indexOf(a) - DEGREE_RANK.indexOf(b);
// Two notes: the interval, short (in the symbol) and in words
const INTERVALS = { b2: ['m2', 'Minor 2nd'], 2: ['M2', 'Major 2nd'], b3: ['m3', 'Minor 3rd'], 3: ['M3', 'Major 3rd'],
  4: ['P4', 'Perfect 4th'], b5: ['TT', 'Tritone'], 5: ['P5', 'Perfect 5th'], b6: ['m6', 'Minor 6th'],
  6: ['M6', 'Major 6th'], b7: ['m7', 'Minor 7th'], 7: ['M7', 'Major 7th'] };
const DYAD_DEGREES = [null, 'b2', '2', 'b3', '3', '4', 'b5', '5', 'b6', '6', 'b7', '7'];
const ORDINAL = { 7: '7th', 9: '9th', 11: '11th', 13: '13th' };
/* The symbol and name of a chord written as its degrees */
function describeChord(degrees) {
  const d = new Set(degrees.filter((x) => x !== 'R'));
  if (d.size === 1) {
    const [x] = d;
    return { symbol: `(${INTERVALS[x][0]})`, name: `${INTERVALS[x][1]} interval` };
  }
  const third = d.has('3') ? '3' : d.has('b3') ? 'b3' : null;
  const minor = third === 'b3';
  const sev = d.has('b7') ? 'b7' : d.has('7') ? '7' : d.has('bb7') ? 'bb7' : null;
  const sus = third ? '' : d.has('4') ? '4' : d.has('2') ? '2' : '';
  const used = new Set();   // degrees the symbol's core already says
  let core;
  let words;
  if (minor && d.has('b5') && sev === 'bb7') { core = 'dim7'; words = 'Diminished 7th'; used.add('b5'); }
  else if (minor && d.has('b5') && sev === 'b7') { core = 'm7♭5'; words = 'Half-diminished 7th'; used.add('b5'); }
  else if (minor && d.has('b5') && !sev && !d.has('6')) { core = 'dim'; words = 'Diminished'; used.add('b5'); }
  else if (third === '3' && d.has('#5') && sev !== '7') { core = sev ? 'aug7' : 'aug'; words = sev ? 'Augmented 7th' : 'Augmented'; used.add('#5'); }
  else if (sev === 'b7' || sev === '7') {
    // The highest natural extension above a 7th names it (C13: its 9th and 11th go without saying)
    const top = ['13', '11', '9'].find((x) => d.has(x));
    const n = top || '7';
    for (const x of ['9', '11', '13']) if (top && Number(x) <= Number(top)) used.add(x);
    if (sev === 'b7') { core = (minor ? 'm' : '') + n; words = `${minor ? 'Minor' : 'Dominant'} ${ORDINAL[n]}`; }
    else { core = minor ? `m(maj${n})` : `maj${n}`; words = `${minor ? 'Minor-major' : 'Major'} ${ORDINAL[n]}`; }
  } else if (d.has('6')) {
    const nine = d.has('9');
    if (nine) used.add('9');
    core = (minor ? 'm' : '') + (nine ? '6/9' : '6');
    words = `${minor ? 'Minor' : 'Major'} ${nine ? 'six-nine' : '6th'}`;
  } else if (third) { core = minor ? 'm' : ''; words = minor ? 'Minor' : 'Major'; }
  else if (!sus && d.has('5')) { core = '5'; words = 'Power chord'; }
  else { core = ''; words = sus ? '' : 'Chord'; }
  for (const x of ['3', 'b3', 'b7', '7', 'bb7', '6', '5', sus]) used.add(x);
  if (sus) words = `${words}${words ? ', s' : 'S'}uspended ${sus === '4' ? '4th' : '2nd'}`;
  // Added notes (no 7th), then altered ones, then a missing 3rd
  const adds = ['9', '11', '13'].filter((x) => d.has(x) && !used.has(x));
  const alts = ['b5', '#5', 'b9', '#9', '#11', 'b13'].filter((x) => d.has(x) && !used.has(x));
  const no3 = !third && !sus && core !== '5';
  let symbol = core + (sus ? `sus${sus}` : '');
  const extras = [...adds.map((x) => `add${x}`), ...alts.map(fmtDeg), ...(no3 ? ['no3'] : [])];
  // A major chord's first added note is written plainly (Cadd9), the rest in brackets
  if (!minor && core === '' && !sus && adds.length && extras[0] === `add${adds[0]}`) symbol += extras.shift();
  if (extras.length) symbol += `(${extras.join(',')})`;
  // (Minor with added 9th, 11th and ♭13)
  const more = [...adds.map((x) => ORDINAL[x]), ...alts.map(fmtDeg)];
  const list = more.length > 1 ? `${more.slice(0, -1).join(', ')} and ${more[more.length - 1]}` : more.join('');
  const name = `${words}${list ? ` with ${adds.length ? 'added ' : ''}${list}` : ''}${no3 ? ', no 3rd' : ''}`;
  return { symbol, name: name.charAt(0).toUpperCase() + name.slice(1) };
}
const customDefs = new Map();
/* One note in octaves (C3 and C4): an interval too, its own type, the one
   with a single note to its name */
const OCTAVE_ID = 'i-8';
const OCTAVE = { id: OCTAVE_ID, steps: [0], degrees: ['R'], custom: true, symbol: '(P8)', name: 'Perfect octave interval' };
function customChord(id) {
  if (id === OCTAVE_ID) return OCTAVE;
  if (typeof id !== 'string' || !/^i(-[a-z0-9]+)+$/.test(id)) return undefined;
  if (customDefs.has(id)) return customDefs.get(id);
  const degrees = ['R', ...id.slice(2).split('-').map((x) => x.replace(/s/g, '#'))];
  const steps = degrees.map((x) => DEGREE_STEPS[x]);
  const ok = steps.every((x) => x !== undefined) && new Set(steps.map(mod12)).size === steps.length
    && customId(degrees) === id && (degrees.length > 2 || DYAD_DEGREES.includes(degrees[1]));
  const def = ok ? { id, steps, degrees, custom: true, ...describeChord(degrees) } : undefined;
  if (customDefs.size > 200) customDefs.clear();
  customDefs.set(id, def);
  return def;
}
const customId = (degrees) => `i-${degrees.filter((x) => x !== 'R').sort(byDegree).map((x) => x.replace(/#/g, 's')).join('-')}`;
// A chord type from its degrees: a menu's when one has exactly these, else its own
function chordOf(degrees) {
  const key = degrees.slice().sort(byDegree).join(' ');
  return ALL_CHORDS.find((c) => c.degrees.slice().sort(byDegree).join(' ') === key) || customChord(customId(degrees));
}
/* The role of each note above a root (null: two 7ths, not read on this root) */
function degreesOver(root, pcs) {
  const i = new Set(pcs.map((pc) => mod12(pc - root)).filter((x) => x));
  const has = (x) => i.has(x);
  if (has(10) && has(11)) return null;
  const third = has(4) ? '3' : has(3) ? 'b3' : null;
  const sev = has(10) || has(11);
  const role = (x) => ({
    1: 'b9', 2: third || has(5) ? '9' : '2', 3: has(4) ? '#9' : 'b3', 4: '3', 5: third ? '11' : '4',
    6: has(7) ? '#11' : 'b5', 7: '5', 8: has(7) || has(6) || third === 'b3' ? 'b13' : '#5',
    9: sev ? '13' : third === 'b3' && has(6) ? 'bb7' : '6', 10: 'b7', 11: '7' })[x];
  return ['R', ...[...i].map(role)].sort(byDegree);
}

/* ==========================================================================
   Naming a chord from its notes (Name a chord): one name for each note
   that can be the root, best first. A chord type of the menus comes first
   for its root: one whose tones are all there, or all but those a shape may
   leave out (the 5th of a chord of 4 notes or more, the 9th of an 11th or
   13th chord); else the general name of the notes above that root. Best:
   a menu's type with nothing left out, in any inversion (x3221x is Am/C
   rather than C6 without its 5th), the root in the bass, the simpler type
   (triads, then 6ths and 7ths, then the others), a 5th, fewer altered or
   added notes, notes all in the scale shown. Notes, not
   frets: any instrument can be read this way (a keyboard too).
   ========================================================================== */
function nameChord(midis, scalePcs = null) {
  const pcs = [...new Set(midis.map(mod12))];
  if (pcs.length === 1 && new Set(midis).size > 1) return [{ root: pcs[0], def: OCTAVE, bassIndex: 0, missing: [], score: 0 }];
  if (pcs.length < 2) return [];
  const bass = mod12(Math.min(...midis));
  const best = new Map();   // root → its best reading
  const offer = (r) => { const was = best.get(r.root); if (!was || r.score > was.score) best.set(r.root, r); };
  const fits = (root, def) => Boolean(scalePcs) && chordTones(root, def).every((t) => scalePcs.has(t.pc));
  CHORDS.forEach((group, rank) => group.items.forEach((def, order) => {
    const upper = def.degrees.includes('11') || def.degrees.includes('13');
    for (const root of pcs) {
      const tones = chordTones(root, def);
      const tonePcs = new Set(tones.map((t) => t.pc));
      if (!pcs.every((pc) => tonePcs.has(pc))) continue;
      const missing = tones.filter((t) => !pcs.includes(t.pc));
      if (missing.some((t) => !((t.deg === '5' && tones.length >= 4) || (t.deg === '9' && upper)))) continue;
      const bassIndex = tones.findIndex((t) => t.pc === bass);
      const score = (bassIndex === 0 ? 4 : 0) - 4.5 * missing.length - 0.5 * rank - 0.01 * order + (fits(root, def) ? 0.3 : 0);
      offer({ root, def, bassIndex, missing: missing.map((t) => t.deg), score });
    }
  }));
  // The general names, for the roots no menu type reads: two notes by their
  // interval above the bass; more on each note as the root
  const roots = pcs.length === 2 ? [bass] : pcs;
  for (const root of roots) {
    if (best.has(root)) continue;
    const degrees = pcs.length === 2 ? ['R', DYAD_DEGREES[mod12(pcs.find((pc) => pc !== root) - root)]] : degreesOver(root, pcs);
    const def = degrees && chordOf(degrees);
    if (!def) continue;
    const tones = chordTones(root, def);
    const bassIndex = tones.findIndex((t) => t.pc === bass);
    const odd = def.degrees.filter((x) => ['b5', '#5', 'b9', '#9', '#11', 'b13'].includes(x)).length;
    const adds = def.custom && !def.degrees.some((x) => ['b7', '7', 'bb7'].includes(x)) ? def.degrees.filter((x) => ['9', '11', '13'].includes(x)).length : 0;
    const no3 = def.symbol.includes('no3');
    const no5 = pcs.length > 2 && !def.degrees.some((x) => ['5', 'b5', '#5'].includes(x));   // (D/A, not A6sus4)
    // (a general name comes after any menu type with all its notes, in any
    // inversion: x43222 is F♯m(maj7)/C♯, not D♭aug(add11); two notes after a
    // power chord's root only)
    const general = !def.custom ? 0 : pcs.length === 2 ? 2.5 : 5.5;
    const score = (bassIndex === 0 ? 4 : 0) - general - 0.8 * odd - 0.4 * adds - 1.5 * no3 - 2 * no5 + (fits(root, def) ? 0.3 : 0);
    offer({ root, def, bassIndex, missing: [], score });
  }
  // The likeliest first; even ones, the simplest name first (not the order
  // of the strings)
  return [...best.values()].sort((a, b) => b.score - a.score || a.def.symbol.length - b.def.symbol.length);
}

/* Node (tests) gets the pure part; the browser runs the app below. */
if (typeof module !== 'undefined') {
  module.exports = {
    barresFor, fingersFor, INSTRUMENTS, TUNINGS, tunedInstrument, ALL_CHORDS, findShapes, findChord, findInstrument, tabOf,
    shapeCandidates, pickShapes, chartShape, SHAPE_WEIGHTS, pianoShapes,
    ALL_SCALES, spellScale, spellChord, noteText, pitchText, plainNote, nameChord, describeChord, customChord };
  module.exports.groupsFor = (...args) => scaleGroups(...args);
}

/* ==========================================================================
   3. State (instrument, switches, chord and scale are saved to
   localStorage, the tuning and the capo for each instrument; the inversion
   and the shape shown are not)
   ========================================================================== */
function defaultState() {
  return {
    instrument: 'guitar',
    flats: false,
    allTones: false,
    scaleOnly: true,                  // hide the notes that are not in the scale
    scaleGroups: true,                // outline the scale one hand-sized group at a time
    leftHanded: false,                // mirror the neck
    octaves: false,
    muteTaps: false,                  // Name a chord: notes placed are silent
    tuning: {},                       // tuning id per instrument ('custom': your own)
    capo: {},                         // fret of the capo per instrument (none: left out)
    custom: {},                       // your own tuning per instrument: open string pitches
    saved: {},                        // saved tunings per instrument: [{ name, strings }]
    chord: { on: true, root: 0, type: 'maj' },   // off: type null (see chordOff)
    list: [],                         // the chord list, as built [{ root, type, inversions, shapes }], shared by all instruments
    recent: [],                       // the last chords used that are not in it (RECENT_KEEP kept, RECENT_MAX shown), newest first
    drawn: [],                        // custom shapes (Name a chord): [{ root, type, neck, frets }], newest last (see listShapes)
    inversion: { ...DEFAULT_INVERSION },  // per instrument, this visit only
    shape: null,                      // index in the shape list, this visit only (null: the chord's home shape, homeShape)
    scale: { on: true, root: 0, type: 'major' },   // off: type null (see scaleOff)
    share: { neck: true, chord: true, scale: true, list: true },
    folded: { chord: false, scale: false },   // wide screens: a panel folded to its title row   // what the Share popup puts in the link (list: the chord list; once 'recent', off by default, so an old saved choice is not read)
  };
}

/* Saved settings, in two parts: how you like to see things (prefs), and
   what is on the neck (work: the neck, chord, scale and chord list, the
   parts a link can hold, written the same way as in a link). Each value is
   checked as it is read; a wrong or missing one keeps its default. */
function loadState() {
  const s = defaultState();
  try {
    for (const key of OLD_STORAGE_KEYS) localStorage.removeItem(key);
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!saved || saved.v !== SAVE_VERSION) return s;
    const prefs = saved.prefs || {};
    const work = saved.work || {};
    for (const k of ['flats', 'allTones', 'octaves', 'scaleOnly', 'scaleGroups', 'leftHanded', 'muteTaps']) {
      if (typeof prefs[k] === 'boolean') s[k] = prefs[k];
    }
    for (const k of Object.keys(s.share)) {
      if (prefs.share && typeof prefs.share[k] === 'boolean') s.share[k] = prefs.share[k];
    }
    for (const k of Object.keys(s.folded)) {
      if (prefs.folded && typeof prefs.folded[k] === 'boolean') s.folded[k] = prefs.folded[k];
    }
    if (readInstrument(work.instrument)) s.instrument = work.instrument;
    for (const { id } of INSTRUMENTS) {
      // Saved tunings: each with a name and its notes, none twice
      for (const e of Array.isArray(work.saved && work.saved[id]) ? work.saved[id] : []) {
        const name = cleanName(e && e.name);
        const notes = e && readCustom(id, e.tuning);
        if (!name || !notes || savedTunings(id, s.saved).some((t) => sameStrings(t, notes))) continue;
        (s.saved[id] = s.saved[id] || []).push({ name, strings: notes });
      }
      const strings = readCustom(id, work.custom && work.custom[id]);
      if (strings) s.custom[id] = strings;
      const t = work.tuning && work.tuning[id];
      const known = t === 'custom' ? strings
        : String(t).startsWith('saved:') ? savedTunings(id, s.saved).some((x) => x.id === t) : readTuning(id, t);
      if (known) s.tuning[id] = t;
      const preset = strings && matchTuning(id, strings, s.saved);
      if (preset && s.tuning[id] === 'custom') s.tuning[id] = preset.id;   // the same as a preset (or a saved one): that one
      if (strings && sameStrings(tuningsOf(id)[0], strings)) delete s.custom[id];   // standard: nothing kept ("Tune each string")
      // (one capo for all instruments, as it was first saved: the instrument on screen keeps it)
      const c = readCapo(typeof work.capo === 'number' ? (id === s.instrument ? work.capo : 0) : work.capo && work.capo[id], id);
      if (c) s.capo[id] = c;
    }
    const chord = readChord(work.chord);
    if (chord) s.chord = chord.def ? { on: true, root: chord.root, type: chord.def.id } : { on: false, root: chord.root, type: null };
    s.chordBass = chord && chord.def ? chord.bass : null;   // (which of its chips was on screen: see init)
    const scale = readScale(work.scale);
    if (scale) s.scale = scale.def ? { on: true, root: scale.root, type: scale.def.id } : { on: false, root: scale.root, type: null };
    // (its bass: saved since chips are told apart by it; as saved before, worked out in init)
    const entry = (e) => {
      const r = e && readChord(e.chord);
      if (!r || !r.def) return null;
      const bass = Number.isInteger(e.bass) && e.bass >= 0 && e.bass < r.def.steps.length ? e.bass : undefined;
      return { root: r.root, type: r.def.id, bass, used: Number(e.used) || 0, inversions: readInversions(e.inversions || e.voicings), shapes: readShapes(e.shapes) };   // (inversions: saved before as "voicings")
    };
    const known = (r) => [...s.list, ...s.recent].some((x) => sameEntry(x, r));
    // As saved before there were recent chords, every chord kept was in the
    // list (made as you went): they all stay in it, the lone chord before a
    // list (solo) is the recent one
    const recent = Array.isArray(work.recent) ? work.recent : work.solo ? [work.solo] : [];
    for (const e of Array.isArray(work.list) ? work.list : []) {
      const r = entry(e);
      if (r && s.list.length < LIST_MAX && !known(r)) s.list.push(r);
    }
    for (const e of recent) {
      const r = entry(e);
      if (r && s.recent.length < RECENT_KEEP && !known(r)) s.recent.push(r);
    }
    // Custom shapes: their chord, neck (open strings and capo) and frets
    // (one per bass note: see keepDrawn; saved before, one per chord)
    for (const d of Array.isArray(work.drawn) ? work.drawn : []) {
      const c = d && readChord(d.chord);
      if (!c || !c.def || !NECK_RE.test(d.neck) || !FRETS_RE.test(d.frets)) continue;
      s.drawn = s.drawn.filter((x) => !(x.root === c.root && x.type === c.def.id && x.neck === d.neck && x.frets === d.frets));
      s.drawn.push({ root: c.root, type: c.def.id, neck: d.neck, frets: d.frets });
    }
    s.drawn = s.drawn.slice(-DRAWN_MAX);
    // Which was used last, as saved: all before this visit's picks (negative)
    s.recent.map((r, i) => [r, i]).sort(([a, i], [b, j]) => a.used - b.used || i - j)
      .forEach(([r], rank) => { r.used = rank - RECENT_KEEP; });
  } catch {
    /* storage unavailable or corrupt: keep defaults */
  }
  return s;
}

function saveState() {
  const { flats, allTones, octaves, scaleOnly, scaleGroups, leftHanded, muteTaps, share, folded } = state;
  const order = [...state.recent].sort((a, b) => a.used - b.used);   // used: 0 for the recent chord unused longest
  const entry = (r) => ({ chord: chordText(r.root, findChord(r.type)), bass: r.bass, inversions: r.inversions, shapes: r.shapes });
  const shown = state.chord.on ? currentChord() : null;
  const saved = {
    v: SAVE_VERSION,
    prefs: { flats, allTones, octaves, scaleOnly, scaleGroups, leftHanded, muteTaps, share, folded },
    work: {
      instrument: state.instrument,
      tuning: state.tuning,
      custom: Object.fromEntries(Object.entries(state.custom).map(([id, strings]) => [id, customText(strings)])),
      saved: Object.fromEntries(Object.entries(state.saved).filter(([, list]) => list.length)
        .map(([id, list]) => [id, list.map((t) => ({ name: t.name, tuning: customText(t.strings) }))])),
      capo: state.capo,
      chord: shown ? chordBassText(shown.root, shown.def, shown.bassIndex) : noteToken(plainNote(state.chord.root, state.flats)),   // (with its bass: which of its chips it is)
      scale: state.scale.on ? scaleText(state.scale.root, findScale(state.scale.type)) : noteToken(plainNote(state.scale.root, state.flats)),
      list: state.list.map(entry),
      recent: state.recent.map((r) => ({ ...entry(r), used: order.indexOf(r) })),
      drawn: state.drawn.map((d) => ({ chord: chordText(d.root, findChord(d.type)), neck: d.neck, frets: d.frets })),
    },
  };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(saved)); } catch { /* ignore */ }
}

/* Text forms shared by links and saved settings: each part is written one
   way, and read back (checked) one way.
   A note: "A", "Bb", "Fs" (sharps as s: a # would be escaped in a link).
   A chord: its root as spelled on screen, a hyphen, its type: "A-m7"; with
   a shape, its frets after a dot: "A-m7.x-0-2-0-1-0"; a root alone is no
   chord (the root kept for the menus). A scale: "A-minor-pentatonic", or a
   root alone for none. */
const noteToken = (n) => LETTERS[n.letter] + (n.acc > 0 ? 's'.repeat(n.acc) : 'b'.repeat(-n.acc));
function readNote(text) {   // "A", "Bb", "Fs" (or "F#", "F♯") → pitch class, or null
  const m = /^([A-Ga-g])([#s♯]{1,2}|[b♭]{1,2})?$/.exec(text || '');
  if (!m) return null;
  const acc = m[2] ? (/[#s♯]/.test(m[2]) ? 1 : -1) * m[2].length : 0;
  return mod12(LETTER_PC[LETTERS.indexOf(m[1].toUpperCase())] + acc);
}
const fretsText = (frets) => frets.map((f) => (f < 0 ? 'x' : f)).join('-');
const FRETS_RE = /^(x|\d{1,2})(-(x|\d{1,2}))*$/;
// "A-minor-pentatonic" → { root, id }, "A" → { root, id: null } (ids may contain hyphens, roots do not)
function readPair(text) {
  const m = /^([^-]+)(?:-(.+))?$/.exec(text || '');
  const root = m ? readNote(m[1]) : null;
  return root === null ? null : { root, id: m[2] || null };
}
const chordText = (root, def) => `${noteToken(chordSpelling(root, def).root)}-${def.id}`;
// A chord with its bass note when not the root ("C-maj*E", C/E), as chips are told apart
const chordBassText = (root, def, bass) => chordText(root, def) + (bass ? `*${noteToken(chordSpelling(root, def).notes[bass])}` : '');
const scaleText = (root, def) => `${noteToken(scaleSpelling(root, def).root)}-${def.id}`;
// → { root, def (null: none), frets ('' without a shape), bass (its place
// in the chord's notes; null: not said) }, or null when wrong
function readChord(text) {
  const [name, frets = ''] = String(text || '').split('.');
  const [pairText, bassText] = name.split('*');
  const pair = readPair(pairText);
  const def = pair && pair.id && findChord(pair.id);
  if (!pair || (pair.id && (!def || def.id !== pair.id)) || (frets && !FRETS_RE.test(frets))) return null;
  const pc = def && bassText ? readNote(bassText) : null;
  const at = pc === null ? -1 : def.steps.findIndex((st) => mod12(pair.root + st) === pc);
  return { root: pair.root, def: def || null, frets, bass: at >= 0 ? at : null };
}
function readScale(text) {   // → { root, def (null: none) }, or null when wrong
  const pair = readPair(text);
  const def = pair && pair.id && findScale(pair.id);
  if (!pair || (pair.id && (!def || def.id !== pair.id))) return null;
  return { root: pair.root, def: def || null };
}
// The neck: each value, or null when wrong
const readInstrument = (id) => (findInstrument(id) ? id : null);
const readTuning = (inst, id) => (tuningsOf(inst).some((t) => t.id === id) ? id : null);
/* A custom tuning: each open string as a note and octave, low to high (as
   the strings are listed): "D2-A2-D3-G3-B3-E4" */
const pitchToken = (m) => `${noteToken(plainNote(m, false))}${Math.floor(m / 12) - 1}`;
const customText = (strings) => strings.map(pitchToken).join('-');
// One string: its note and octave, then a hyphen before the next one. The
// octave can be -1 (a 5-string bass's low B down an octave: "B-1-E1-..."),
// so each note is read with its octave rather than split at every hyphen.
const PITCH_RE = /^([A-Ga-g](?:[#s♯]{1,2}|[b♭]{1,2})?)(-?\d)(?:-(?=.)|$)/;
function readCustom(inst, text) {   // → open string pitches, or null when wrong
  const base = tuningsOf(inst)[0].strings;
  if (!base.length) return null;   // (the piano: no strings to tune)
  const strings = [];
  for (let rest = String(text || ''), m; rest; rest = rest.slice(m[0].length)) {
    m = PITCH_RE.exec(rest);
    if (!m) return null;
    const pc = readNote(m[1]);
    const letter = m[1][0].toUpperCase();
    const acc = mod12(pc - LETTER_PC[LETTERS.indexOf(letter)] + 6) - 6;   // -2..+2
    strings.push((Number(m[2]) + 1) * 12 + LETTER_PC[LETTERS.indexOf(letter)] + acc);
  }
  if (strings.length !== base.length) return null;
  return strings.every((m, i) => m !== null && Math.abs(m - base[i]) <= CUSTOM_RANGE) ? strings : null;
}
const maxCapo = (inst) => Math.min(MAX_CAPO, findInstrument(inst).frets - SHAPE_SPAN);   // a hand's width of frets stays
function readCapo(value, inst) {
  const c = Number(value);
  return Number.isInteger(c) && c >= 0 && c <= maxCapo(inst) ? c : null;
}
// A chip's remembered inversions: { instrument: inversion }
function readInversions(value) {
  const inversions = {};
  for (const [inst, v] of Object.entries(value && typeof value === 'object' ? value : {})) {
    if (findInstrument(inst) && INVERSIONS.includes(v)) inversions[inst] = v;
  }
  return inversions;
}
// A chip's remembered shapes: { neck setting: frets }
function readShapes(value) {
  const shapes = {};
  for (const [ctx, frets] of Object.entries(value && typeof value === 'object' ? value : {})) {
    if (typeof frets === 'string' && FRETS_RE.test(frets)) shapes[ctx] = frets;
  }
  return shapes;
}

/* Shareable links, made by the Share popup (the address bar stays clean:
   what is on the neck is saved on the device, not in the address):
     ?instrument=guitar&tuning=drop-d&capo=2
     &chord=A-m7*C.x-3-2-0-1-0&scale=A-minor-pentatonic
     &list=C-maj_Fs-m.2-4-4-2-2-2_F-maj
   Each part is left out when not shared, and the tuning and capo when they
   are the defaults.
   How you like to see the neck (left-handed, flats, octaves, the switches)
   stays yours: it is not in the link.
   A chord is written the same way alone (chord) and in the chord list
   (list, chords split by _): its root (sharps as s, flats as b, as spelled
   on screen), a hyphen, its type, after a * its bass note when not the
   root (D-maj*Fs: D/F♯), then after a dot the shape as its frets (x for a
   muted string), left out when the link opens on it anyway (see
   shapeToken) or has no neck. Frets, so a link keeps showing the same
   shape even if the shape list changes. The inversion shown (a bass note,
   or any) is not in the link: the chord opens in the one for its bass (see
   plainInversion). Links from before may hold it: "inversion", or before
   that "voicing". */
const NONE = 'none';   // a link's chord or scale: none on the neck it was shared from
const LINK_KEYS = ['instrument', 'tuning', 'capo', 'inversion', 'voicing', 'chord', 'scale', 'list'];
const INVERSIONS = [...INVERSION_NAMES.keys()].map(String).concat('any');   // a bass note (any of a chord's, up to seven: see INVERSION_NAMES), or any
/* A chord of the link with its shape, when not the first one and only with
   the neck (a custom shape always: it is not among the shapes found where
   the link opens). The chord on screen and a chip of the list: the name,
   bass and all (D/F♯: kept without the neck too, see keepBass), and the
   shape (the chip's: the one it comes back with, see recallChip). */
function shapeToken(root, def, { shapes, index, inversion }, bass) {
  const shape = shapes[index];
  if (!shape) return '';
  // (left out only when the link opens on it anyway: its first shape, in
  // the inversion the link opens in for its bass, see plainInversion)
  const plain = index === homeShape(shapes, root, inversion) && !shape.drawn && plainInversion(root, def, bass) === inversion;
  return plain ? '' : `.${fretsText(shape.frets)}`;
}
// The inversion a link's chord opens in for its bass note: the default one
// when its first shape has that bass already (A, as picked from the menus),
// else that bass's; null: no shape with that bass on this neck
function plainInversion(root, def, bass) {
  const want = String(bass);
  if (inversionFor(def, want) !== want || !listShapes(root, def, want).length) return null;
  const usual = inversionFor(def, DEFAULT_INVERSION[state.instrument]);
  const shapes = listShapes(root, def, usual);
  const first = shapes[homeShape(shapes, root, usual)];
  return first && bassIndexOf(root, def, first) === bass ? usual : want;
}
function chordToken(neck) {
  const ch = currentChord();
  return chordBassText(ch.root, ch.def, ch.bassIndex) + (neck ? shapeToken(ch.root, ch.def, ch, ch.bassIndex) : '');
}
function listToken(entry, neck) {
  const def = findChord(entry.type);
  return chordBassText(entry.root, def, entry.bass) + (neck ? shapeToken(entry.root, def, chipShape(entry), entry.bass) : '');
}

/* What the link holds: the neck (instrument, tuning, capo), the chord, the
   scale and the chord list, as asked */
function linkParams({ neck = true, chord = true, scale = true, recent = false } = {}) {
  const p = new URLSearchParams();
  const inst = instrument();
  if (neck) {
    p.set('instrument', state.instrument);
    if (inst.tuning.custom || inst.tuning.saved) p.set('tuning', customText(inst.strings));   // your own (saved or not): its notes, not its name
    else if (inst.tuning.id !== 'standard') p.set('tuning', inst.tuning.id);
    if (capo()) p.set('capo', String(capo()));
  }
  // No chord on the neck: the link says so (loaded, it clears theirs); one
  // left out (its switch off): not in the link (theirs stays). The scale too.
  if (!state.chord.on) p.set('chord', NONE);
  else if (chord) p.set('chord', chordToken(neck));
  if (recent && state.list.length) {
    p.set('list', state.list.map((r) => listToken(r, neck)).join('_'));
  }
  if (!state.scale.on) p.set('scale', NONE);
  else if (scale) p.set('scale', scaleText(state.scale.root, findScale(state.scale.type)));
  return p;
}

/* Puts a link on the neck. All of it (fresh, a first visit: no chord, scale
   or capo unless the link has one), or the parts chosen in the Open link popup
   (parts: { neck, chord, scale, recent }): what is not taken stays as it
   was. A chord or scale left out of the link stays as it was too; "none"
   takes it off. Without the neck (instrument, tuning, capo), the chords come on your
   neck, on their first shapes (the link's shapes are for its neck), with
   the same bass note (C/E stays C/E, on a piano too) where your neck has a
   shape for it. Returns false for an address without a link. */
function applyLink(search, parts = null, fresh = false) {
  const p = new URLSearchParams(search);
  if (!LINK_KEYS.some((k) => p.has(k))) return false;
  const take = (k) => !parts || parts[k];
  const neck = take('neck') && p.has('instrument');   // (a link can leave the neck out)
  // Your chord's chip, as it is on screen (its bass: the shape's), for when
  // the link leaves your chord as it is
  const own = state.chord.on ? { root: state.chord.root, type: state.chord.type, bass: shownBass() } : null;
  const linkInversion = p.has('inversion') ? p.get('inversion') : p.get('voicing');   // (a link from before: "voicing")
  // A chord's bass on the link's own neck (its shape's lowest note; else
  // its name's, the link's inversion, or the root) and the inversion that gives
  // it on this neck: { bass, inversion }; null: none to keep (no shape here)
  const linkInst = p.has('instrument') && readInstrument(p.get('instrument')) ? p.get('instrument') : null;
  const keepBass = (c) => {
    // (no bass named: the root, as a link names any other: D/F♯ is D-maj*Fs)
    let bass = Number.isInteger(c.bass) ? c.bass : /^\d+$/.test(linkInversion || '') ? Number(linkInversion) : 0;
    if (c.frets && linkInst) {
      const frets = readFrets(c.frets);
      const piano = Boolean(findInstrument(linkInst).piano);
      const tuned = tuningsOf(linkInst).find((t) => t.id === readTuning(linkInst, p.get('tuning')));
      const strings = piano ? [] : readCustom(linkInst, p.get('tuning')) || (tuned || tuningsOf(linkInst)[0]).strings;
      const lift = piano ? PIANO_LOW : readCapo(p.get('capo') || 0, linkInst) || 0;
      const notes = piano ? frets.map((k) => lift + k) : frets.map((f, i) => (f < 0 || strings[i] === undefined ? null : strings[i] + lift + f)).filter((m) => m !== null);
      if (notes.length) {
        const low = mod12(Math.min(...notes));
        const i = c.def.steps.findIndex((st) => mod12(c.root + st) === low);
        if (i >= 0) bass = i;
      }
    }
    const inversion = plainInversion(c.root, c.def, bass);
    return inversion === null ? null : { bass, inversion };
  };
  // A link without an instrument (written by hand) shows on yours, as you tuned it
  if (neck && readInstrument(p.get('instrument'))) {
    state.instrument = p.get('instrument');
    // A custom tuning (its notes) takes the custom tuning's place, unless it
    // is a preset's notes, or a saved tuning's: then that one
    const strings = readCustom(state.instrument, p.get('tuning'));
    const preset = strings && matchTuning(state.instrument, strings);
    if (strings && !preset) state.custom[state.instrument] = strings;
    state.tuning[state.instrument] = preset ? preset.id : strings ? 'custom' : readTuning(state.instrument, p.get('tuning')) || 'standard';
  }
  if (neck) setCapo(readCapo(p.get('capo') || 0, state.instrument) || 0);
  const chord = readChord(p.get('chord'));
  const linkChord = take('chord') && chord && chord.def;
  if (linkChord) state.chord = { on: true, root: chord.root, type: chord.def.id };
  else if (take('chord') && (fresh || p.get('chord') === NONE)) chordOff();
  if (neck && linkChord) {
    // Its bass note (D-maj*Fs, its shape's, or the root), as without the neck
    // (see keepBass; a link from before: its inversion), then its shape in
    // the inversion that lists it (an "Any bass note" one may list it alone)
    const kept = keepBass(chord);
    let inversion = INVERSIONS.includes(linkInversion) ? linkInversion : kept ? kept.inversion : DEFAULT_INVERSION[state.instrument];
    if (chord.frets) {
      const listed = (v) => listShapes(chord.root, chord.def, inversionFor(chord.def, v)).some((shape) => fretsText(shape.frets) === chord.frets);
      const found = [inversion, DEFAULT_INVERSION[state.instrument], ...INVERSIONS].find(listed);
      if (found) inversion = inversionFor(chord.def, found);
    }
    state.inversion[state.instrument] = inversion;
  } else if (linkChord) {   // (its bass where your neck plays it, else the default inversion, as a chord picked)
    const kept = keepBass(chord);
    state.inversion[state.instrument] = kept ? kept.inversion : DEFAULT_INVERSION[state.instrument];
  }
  const scale = readScale(p.get('scale'));
  if (take('scale') && scale && scale.def) state.scale = { on: true, root: scale.root, type: scale.def.id };
  else if (take('scale') && (fresh || p.get('scale') === NONE)) scaleOff();
  state.shape = null;
  const ch = neck && linkChord && chord.frets ? currentChord() : null;
  let at = ch ? ch.shapes.findIndex((shape) => fretsText(shape.frets) === chord.frets) : -1;
  // A shape the finder does not list (drawn in Name a chord): kept as the
  // chord's custom shape, when it plays the chord's notes on this neck
  if (ch && at < 0 && playsChord(chord.root, chord.def, readFrets(chord.frets))) {
    keepDrawn(chord.root, chord.def.id, chord.frets);
    at = currentChord().shapes.findIndex((shape) => fretsText(shape.frets) === chord.frets);
  }
  if (at >= 0) state.shape = at;
  // The chord list: it replaces yours, each chord on the shape it was shared
  // with (no chord in it: yours stays). The recent chords stay, less those
  // now in the list.
  if (take('recent') && p.has('list')) {
    const list = [];
    for (const item of p.get('list').split('_')) {
      const c = readChord(item);
      if (!c || !c.def || list.length >= LIST_MAX) continue;
      // its shape, for the neck it was shared with (without it, the first),
      // in the inversion that lists it: the link's, the default, or another
      const entry = newEntry(c.root, c.def.id, Number.isInteger(c.bass) ? c.bass : undefined);
      const tries = [linkInversion, DEFAULT_INVERSION[state.instrument], ...INVERSIONS].filter((v) => INVERSIONS.includes(v));
      const listed = (v) => listShapes(c.root, c.def, inversionFor(c.def, v)).some((shape) => fretsText(shape.frets) === c.frets);
      let inversion = c.frets && neck && tries.find(listed);
      // (a custom shape, as for the chord above)
      if (c.frets && neck && !inversion && playsChord(c.root, c.def, readFrets(c.frets))) {
        keepDrawn(c.root, c.def.id, c.frets);
        inversion = tries.find(listed);
      }
      if (inversion) {
        entry.inversions[state.instrument] = inversionFor(c.def, inversion);
        entry.shapes[shapeContext(c.def, inversionFor(c.def, inversion))] = c.frets;
        entry.bass = bassIndexOf(c.root, c.def, { frets: readFrets(c.frets) });   // (its frets say it)
      } else if (!neck) {   // (on your neck: its bass kept, as for the chord above)
        const kept = keepBass(c);
        entry.inversions[state.instrument] = kept ? kept.inversion : DEFAULT_INVERSION[state.instrument];
        if (kept && entry.bass === undefined) entry.bass = kept.bass;
      } else if (linkInversion === null) {   // (no shape: the first one, in the inversion for its bass, as it was shared; no bass named: the root)
        if (entry.bass === undefined) entry.bass = 0;
        entry.inversions[state.instrument] = plainInversion(c.root, c.def, entry.bass) ?? DEFAULT_INVERSION[state.instrument];
      } else if (entry.bass) {   // (a link from before, with its inversion: that of its bass)
        entry.inversions[state.instrument] = inversionFor(c.def, String(entry.bass));
      }
      if (entry.bass === undefined) entry.bass = legacyBass(entry);   // (a link from before chips had a bass)
      if (list.some((r) => sameEntry(r, entry))) continue;
      // A chord you have already (saved or recent): your chip, still
      // remembering its shapes and inversions on other necks; with the link's
      // neck, its shape there the link's (without it: yours, on your neck)
      const own = [...state.list, ...state.recent].find((r) => sameEntry(r, entry));
      if (own) {
        const merged = { ...own, shapes: { ...own.shapes }, inversions: { ...own.inversions } };
        if (neck) {
          const at = chipShape(entry);
          const shape = at.shapes[at.index];
          const ctx = shapeContext(c.def, at.inversion);
          merged.inversions[state.instrument] = at.inversion;
          delete merged.shapes[ctx];
          if (shape) merged.shapes[ctx] = fretsText(shape.frets);
        }
        list.push(merged);
        continue;
      }
      list.push(entry);
    }
    if (list.length) {
      state.list = list;
      state.recent = state.recent.filter((r) => !list.some((x) => sameEntry(x, r)));
    }
  }
  // Your own chord: on its chip, as it remembers it (the shape you had, a
  // C/E stays C/E), where this neck can play it
  if (!linkChord) recallChip((own && chipEntry(own.root, own.type, own.bass)) || recentEntry(), false, true);
  // The link's chord: its chip (one made for it if need be) remembers the
  // shape it came on, so a reload brings that shape back, not the chip's old one
  else if (state.chord.on) {
    let entry = recentEntry();
    if (!entry) addRecent(entry = newEntry(state.chord.root, state.chord.type, shownBass()));
    rememberShape(entry);
  }
  return true;
}

/* Opened from a link: a popup says what it holds and what it would replace,
   and you load all of it or only some (the chord, the chord list, the
   scale). It loads straight away when there is nothing of yours to lose: a
   first visit, or when no row would say Replaces, Removes or Clears: for
   the chord and the scale, you have none or the link holds the same; the
   link's list keeps every chord already in the list; the link's neck (if it has one)
   is yours already. Until you choose, your own
   neck is shown and the address keeps the link. */
let pendingLink = null;   // { search, preview, has, parts, same: the parts that change nothing }
function startLink(search) {
  const p = new URLSearchParams(search);
  if (!LINK_KEYS.some((k) => p.has(k))) return;
  let saved = null;
  try { saved = localStorage.getItem(STORAGE_KEY); } catch { /* storage unavailable */ }
  if (!saved) { loadLink(search, null, true); return; }
  // A chord or scale left out of the link (or a list) keeps yours: no row.
  // "None" takes yours off, so it is asked about (no row when you have none).
  const asks = (k, on) => p.has(k) && (p.get(k) !== NONE || on);
  const has = { neck: p.has('instrument'), chord: asks('chord', state.chord.on), scale: asks('scale', state.scale.on), recent: p.has('list') };
  const preview = linkPreview(search, has);   // (may find has.recent false)
  if (!preview.loses) { loadLink(search, has); return; }
  pendingLink = { search, preview, has, parts: { ...has }, same: {} };   // all switched on
}
// A link loaded: the neck then goes to what it brought, its chord, or else
// its scale's group (see revealFocus)
function loadLink(search, parts = null, fresh = false) {
  applyLink(search, parts, fresh);
  const p = new URLSearchParams(search);
  const took = (k) => (!parts || parts[k]) && p.has(k);
  if (took('chord') && state.chord.on) ui.reveal = true;
  else if (took('scale') && state.scale.on) ui.revealGroup = true;
}

/* A chord as the link popup shows it: its name and its shape ("A (x07650)":
   a link can change only the shape), or '' (none) */
const chordLine = (ch) => (!ch ? '' : ch.shape ? `${ch.symbol} (${shapeShort(ch.shape)})` : ch.symbol);
// ...its name and shape apart: { name, shape }, or null
const chordParts = (ch) => (!ch ? null : { name: ch.symbol, shape: ch.shape ? shapeShort(ch.shape) : '' });
/* What a link would show, worked out on a copy of the state: the setup, the
   chord, the scale and the chord list, and whether it is all yours already.
   parts: what is loaded (all of it by default) */
function linkPreview(search, has, parts = null) {
  const mine = state;
  const mySetup = setupText();
  const myChord = chordLine(currentChord());
  state = JSON.parse(JSON.stringify(mine));
  state.list = [];   // the list shown is the link's, not yours
  try {
    applyLink(search, parts);
    const ch = currentChord();
    const sc = currentScale();
    if (has.recent && !state.list.length) has.recent = false;   // no list in the link after all
    // Shapes the link changes on its neck (without it, yours stay), as
    // "xx7650". On your own setup, the shape your chip comes back with; on a
    // new one, only a shape your chip remembers there (else nothing to set
    // the link's against: the frets of another neck say nothing)
    const withNeck = has.neck && (!parts || parts.neck);
    const moves = withNeck && setupText() !== mySetup;
    const piano = Boolean(instrument().piano);
    const remembered = (own, def, inversion) => {   // (its shape kept for this neck and inversion, or null)
      const text = own && own.shapes && own.shapes[shapeContext(def, inversion)];
      return text ? shapeShort({ frets: readFrets(text), piano }) : null;
    };
    const shapeOf = (r) => { const at = chipShape(r); return at.shapes[at.index] ? shapeShort(at.shapes[at.index]) : ''; };
    // Your saved chips whose shape the link's list changes: { name: [yours, the link's] }
    const listShapes = {};
    if (has.recent && withNeck) {
      for (const r of state.list) {
        const own = mine.list.find((x) => sameEntry(x, r));
        if (!own) continue;
        const yours = moves ? remembered(own, findChord(r.type), chipShape(r).inversion) : shapeOf(own);
        if (yours !== null && yours !== shapeOf(r)) listShapes[entrySymbol(r)] = [yours, shapeOf(r)];
      }
    }
    // The chord on a new setup: the shape its chip remembers there, or null
    const chordOwn = moves && ch && [...mine.list, ...mine.recent].find((x) => sameEntry(x, { root: ch.root, type: ch.def.id, bass: ch.bassIndex }));
    const chordMemory = chordOwn ? remembered(chordOwn, ch.def, ch.inversion) : null;
    // Yours goes if you have one and the link's differs (a neck, you always have)
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const chords = (s) => s.list.map((r) => [r.root, r.type, r.bass]);
    // (a list's chords that are in the other too, in its order)
    const shared = (list, other) => list.filter((r) => other.some((x) => sameEntry(x, r))).map((r) => `${r.root}:${r.type}:${r.bass}`).join(' ');
    const loses = (has.neck && setupText() !== mySetup)
      || (has.chord && mine.chord.on && myChord !== chordLine(ch))   // (its shape too)
      || (has.scale && mine.scale.on && !same(mine.scale, state.scale))
      || (has.recent && chords(mine).some(([root, type, bass]) => !state.list.some((r) => sameEntry(r, { root, type, bass }))))   // a chord of yours it drops
      || (has.recent && shared(mine.list, state.list) !== shared(state.list, mine.list))   // or puts in another order
      || Object.keys(listShapes).length > 0;   // or reshapes
    return {
      setup: has.neck ? setupText() : null,
      setupParts: has.neck ? setupParts() : null,
      // the link's custom tuning: it takes the custom tuning's place
      custom: has.neck && state.tuning[state.instrument] === 'custom' ? { inst: state.instrument, strings: state.custom[state.instrument] } : null,
      // null: not in the link (no row), '': none
      chord: has.chord ? chordLine(ch) : null,
      chordParts: has.chord ? chordParts(ch) : null,
      chordMemory,
      scale: has.scale ? (sc ? `${sc.rootName} ${scaleTitle(sc.def)}` : '') : null,
      list: has.recent ? listNames() : null,
      listShapes,
      loses,
    };
  } finally {
    state = mine;
  }
}

function openLinkPopup() {
  renderLinkPopup();
  if (els.linkOpen.showModal) els.linkOpen.showModal(); else els.linkOpen.setAttribute('open', '');
}
/* One row per part: the switch (a tick instead when nothing would change),
   its name, a tag for what Load does with it (Replaces, Adds, Removes,
   Clears, Not loaded, No change), and what is on the neck now → what the link has: the
   one you end up with bright, the other struck through (or just what
   changes, see neckDiff). Chords show as
   chips, so a long list wraps chip by chip; the link's part goes under the
   current one when both do not fit on a line. */
const lkEmpty = (v) => (Array.isArray(v) ? !v.length : !v);
// A chord name in a popup's chip, which breaks (when it must: a long name on
// a narrow screen) before its brackets and bass, and after its commas:
// "C♯m7♭5 / (add11,♭9, / ♭13) / /A"
const chipText = (name) => esc(name).replace(/\(|\//g, '<wbr>$&').replace(/,/g, ',<wbr>');
const lkValue = (v, cls) => (lkEmpty(v) ? `<span class="lk-val none ${cls}">None</span>`
  : Array.isArray(v) ? `<span class="lk-val chips ${cls}">${v.map((n) => `<span class="lk-chip">${chipText(n)}</span>`).join('')}</span>`
    : `<span class="lk-val ${cls}">${esc(v)}</span>`);
const CHECK_ICON = '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
function renderLinkPopup() {
  const { preview, parts, has } = pendingLink;
  const ch = currentChord();
  const sc = currentScale();
  // The link's chord on the neck it lands on: the link's, or with Setup
  // switched off, yours (another shape, see applyLink)
  let linkChord = preview.chord;
  let linkParts = preview.chordParts;
  if (linkChord !== null && has.neck && !parts.neck) {
    if (pendingLink.ownNeck === undefined) {
      const own = linkPreview(pendingLink.search, { ...has }, { chord: true });
      pendingLink.ownNeck = [own.chord, own.chordParts];
    }
    [linkChord, linkParts] = pendingLink.ownNeck;
  }
  const nowParts = chordParts(ch);
  // The link's setup replacing yours: its chord and list shown by name,
  // their shapes only against a shape your chip remembers on that setup (the
  // frets of another instrument, tuning or capo say nothing next to yours);
  // the same names, No change, yet their shapes come with the setup
  const newSetup = has.neck && parts.neck && setupText() !== preview.setup;
  pendingLink.withSetup = {};
  // The list's chips whose shape changes: only with the link's neck (see
  // applyLink; on a new setup, see linkPreview)
  const reshaped = has.neck && !parts.neck ? {} : preview.listShapes || {};
  const reshapes = Object.keys(reshaped).length > 0;
  const rows = [   // [row, part, now, the link's]: text, or a list of chord names
    [els.linkNeck, 'neck', setupText(), preview.setup],
    // (compared with its shape; shown by name, the shapes only when the name stays: see below)
    [els.linkChord, 'chord', ch ? [chordLine(ch)] : [], linkChord === null ? null : [linkChord].filter(Boolean)],
    [els.linkList, 'recent', listNames(), preview.list],
    [els.linkScale, 'scale', sc ? `${sc.rootName} ${scaleTitle(sc.def)}` : '', preview.scale],
  ];
  let loads = false;   // Load: only with something switched on
  for (let [row, key, now, link] of rows) {
    row.hidden = link === null;
    if (link === null) continue;
    let same = String(now) === String(link) && !(key === 'recent' && reshapes);
    const memory = newSetup ? preview.chordMemory : null;   // (the chord's shape your chip has on the new setup)
    if (key === 'chord' && newSetup) {
      same = (nowParts ? nowParts.name : '') === (linkParts ? linkParts.name : '')
        && !(memory && linkParts && memory !== linkParts.shape);
    }
    if (newSetup && (key === 'chord' || key === 'recent')) pendingLink.withSetup[key] = same && !lkEmpty(link);
    // The chord: by its name ("C → D"); the same name, another shape: the name
    // once, its shapes after it, as a list's chip ("A (xx7650 x 12 11 x 10 12)")
    let reshapedChord = null;
    if (key === 'chord') {
      if (nowParts && linkParts && nowParts.name === linkParts.name && !same) reshapedChord = { [nowParts.name]: [newSetup ? memory : nowParts.shape, linkParts.shape] };
      now = nowParts ? [nowParts.name] : [];
      link = linkParts ? [linkParts.name] : [];
    }
    pendingLink.same[key] = same;
    const empty = lkEmpty;
    const show = lkValue;
    const on = parts[key] && !same;
    row.classList.toggle('same', same);
    row.disabled = same;
    row.setAttribute('aria-pressed', String(on));
    row.querySelector('.lk-icon').innerHTML = same ? CHECK_ICON : '';
    const tag = row.querySelector('.lk-tag');
    // A list that only gains chords Adds; one that only drops some Removes
    // (both keeping the order of the others); the same chords in another
    // order Reorders; anything else Replaces
    const inOrder = key === 'recent' && String(now.filter((n) => link.includes(n))) === String(link.filter((n) => now.includes(n)));
    const gains = key === 'recent' && !reshapes && inOrder && !empty(now) && now.every((n) => link.includes(n));
    const drops = key === 'recent' && !reshapes && inOrder && !empty(link) && link.every((n) => now.includes(n));
    const reorders = key === 'recent' && !reshapes && !same && now.length === link.length && now.every((n) => link.includes(n));
    const what = empty(now) || gains ? 'Adds' : empty(link) ? 'Clears' : drops ? 'Removes' : reorders ? 'Reorders' : 'Replaces';
    tag.textContent = same ? 'No change' : !on ? 'Not loaded' : what;
    tag.className = `lk-tag${on ? (what === 'Adds' ? ' gain' : ' lose') : ''}`;
    const diff = !same && (key === 'neck' ? neckDiff(setupParts(), preview.setupParts, on, Boolean(customOff(preview.custom)))
      : reorders ? show(link, on ? 'win' : 'lose')   // (just the new order)
        : key === 'recent' ? listDiff(now, link, on, reshaped)
        : reshapedChord ? listDiff(now, link, on, reshapedChord) : '');
    if (on) loads = true;
    row.querySelector('.lk-change').innerHTML = (same ? show(link, 'win') : diff
      || `${show(now, on ? 'lose' : 'win')}<span class="lk-to"><span class="lk-arrow" aria-label="to">→</span>${show(link, on ? 'win' : 'lose')}</span>`)
      + (key === 'neck' ? customLine(preview.custom, on) : '');
  }
  els.linkLoad.disabled = !loads;
}

/* A small change shows in place, not as the whole thing twice. On the same
   instrument, the neck is one line where only the tuning or capo that
   changes shows both: "Bass (Drop D, capo 3 capo 2)", the one you end up
   with bright, the other struck through. A chord list that shares chords is
   one row of chips: first the chords it loses, struck through, then the
   list you end up with, the chords it gains outlined, and a chord whose
   shape changes with both shapes after its name. Anything else: now → the link's. */
/* The custom tuning a link replaces without it being on the neck (on a
   preset, or another instrument): its notes, or null */
function customOff(custom) {
  if (!custom) return null;
  const { inst, strings } = custom;
  const mine = state.custom[inst];
  if (!mine || String(mine) === String(strings) || (state.instrument === inst && state.tuning[inst] === 'custom')) return null;
  return mine;
}
// Its line under the neck's: the custom tuning now → the link's
function customLine(custom, on) {
  const mine = customOff(custom);
  if (!mine) return '';
  const notes = (list) => tuningNotes(list, state.flats, custom.inst);
  return `<span class="lk-extra">${lkValue(notes(mine), on ? 'lose' : 'win')}`
    + `<span class="lk-to"><span class="lk-arrow" aria-label="to">→</span>${lkValue(notes(custom.strings), on ? 'win' : 'lose')}</span></span>`;
}
function neckDiff(now, link, on, customLater = false) {
  if (now[0] !== link[0]) return '';
  const part = (a, b) => (a === b ? esc(a)
    : `<span class="${on ? 'lk-old' : 'lk-new'}">${esc(a)}</span> <span class="${on ? 'lk-new' : 'lk-old'}">${esc(b)}</span>`);
  // the link's custom tuning replaces the one kept aside: here only the
  // preset that goes (the line under it shows the custom tuning's change)
  const tuning = customLater ? `<span class="${on ? 'lk-old' : 'lk-new'}">${esc(now[1])}</span>` : part(now[1], link[1]);
  return `<span class="lk-val diff">${esc(now[0])} (${tuning}, ${part(now[2], link[2])})</span>`;
}
function listDiff(now, link, on, reshaped = {}) {
  if (!now.length || !link.length || !now.some((n) => link.includes(n))) return '';
  const [kept, other] = on ? [link, now] : [now, link];
  // a chip in both whose shape changes: its shapes after its name, as the
  // neck's tuning and capo: "A (xx7650 x 12 11 x 10 12)"
  const label = (n) => (!reshaped[n] ? chipText(n) : `${chipText(n)} (<span class="${on ? 'lk-old' : 'lk-new'}">${esc(reshaped[n][0])}</span> `
    + `<span class="${on ? 'lk-new' : 'lk-old'}">${esc(reshaped[n][1])}</span>)`);
  const chip = (n, cls = '') => `<span class="lk-chip${cls}">${label(n)}</span>`;
  return `<span class="lk-val chips diff">${other.filter((n) => !kept.includes(n)).map((n) => chip(n, ' gone')).join('')}`
    + `${kept.map((n) => chip(n, on && !other.includes(n) ? ' added' : '')).join('')}</span>`;
}
// Load (what is switched on), or nothing (Cancel, the ×, Escape, a tap outside)
function closeLink(load) {
  const link = pendingLink;
  pendingLink = null;
  if (els.linkOpen.open) {
    if (els.linkOpen.close) els.linkOpen.close(); else els.linkOpen.removeAttribute('open');
  }
  if (!link) return;
  if (load) {
    // A part marked No change is left as it is (a chord's shapes, a list's
    // remembered shapes stay yours); the neck, as it is the same, still
    // places the link's chord on its shape. The same chord or list with a new
    // setup: on the link's shapes there (see renderLinkPopup)
    const parts = { ...link.parts };
    for (const k of ['chord', 'scale', 'recent']) if (link.same[k] && !link.withSetup[k]) parts[k] = false;
    loadLink(link.search, parts);
    shownChord = undefined;   // loaded, not picked (its chip, if a chord came: see applyLink)
  }
  render();
}

/* Once a link is loaded (or left), it leaves the address: a reload shows
   your saved neck, and does not ask again. Until you choose in the popup it
   stays, so a reload asks again. */
function clearLink() {
  if (pendingLink || typeof history === 'undefined' || !history.replaceState) return;
  const p = new URLSearchParams(location.search);
  if (!LINK_KEYS.some((k) => p.has(k))) return;
  for (const k of LINK_KEYS) p.delete(k);
  const query = p.toString();
  try { history.replaceState(history.state, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash}`); } catch { /* the link stays */ }
}

/* A line for the share sheet: "Am7 over A minor pentatonic, on guitar
   (capo 2)", with the recent chords if shared: "..., chords C, G, Am and F" */
function linkSummary({ neck = true, chord = true, scale = true, recent = false } = {}) {
  const ch = chord ? currentChord() : null;
  const sc = scale ? currentScale() : null;
  const what = [ch && ch.symbol, sc && `${sc.rootName} ${scaleTitle(sc.def)}`].filter(Boolean).join(' over ');
  const chords = recent ? listNames() : [];
  const list = chords.length > 1 ? `chords ${chords.slice(0, -1).join(', ')} and ${chords[chords.length - 1]}` : chords.length ? `chord list ${chords[0]}` : '';
  const inst = instrument();
  const setup = [tuningName(inst), capo() ? `capo ${capo()}` : ''].filter(Boolean).join(', ');
  const on = neck ? ` on ${inst.name.toLowerCase()}${setup ? ` (${setup})` : ''}` : '';
  return `${[what, list].filter(Boolean).join(', ') || 'The neck'}${(what || list) && on ? ',' : ''}${on}`;
}
const listNames = () => state.list.map(entrySymbol);

/* Share: a popup shows what is on the neck, one row per part that is set
   (the neck, the chord, the chord list, the scale), each switched in or out of the
   link (all but the chord list the first time, then as you last left
   them), then shares it: the phone's share sheet, or the link copied (the
   Share button says so for a moment). */
// Drawn 1 unit left of centre: its two dots on the right make it look right-heavy otherwise
const SHARE_ICON = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><g transform="translate(-1 0)"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></g></svg>';
const DONE_ICON = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const shareSheet = () => Boolean(navigator.share) && window.matchMedia('(pointer: coarse)').matches;
function openShare() {
  renderShare();
  if (els.share.showModal) els.share.showModal(); else els.share.setAttribute('open', '');
}
function closeShare() {
  clearTimeout(shareTimer);
  if (els.share.close) els.share.close(); else els.share.removeAttribute('open');
}
// "Guitar (Drop D, capo 2)", "Ukulele (standard tuning, no capo)"
function setupParts() {   // [instrument, tuning, capo] (the piano: its name alone)
  const inst = instrument();
  if (inst.piano) return [inst.name, '', ''];
  return [inst.name, tuningName(inst) || 'standard tuning', capo() ? `capo ${capo()}` : 'no capo'];
}
function setupText() {
  const [name, tuning, capoText] = setupParts();
  return tuning ? `${name} (${tuning}, ${capoText})` : name;
}
function renderShare() {
  const ch = currentChord();
  const sc = currentScale();
  const rows = [   // [row, part, what is on the neck: text, or chord names]
    [els.shareNeck, 'neck', setupText()],
    [els.shareChord, 'chord', ch ? [ch.symbol] : []],
    [els.shareRecent, 'list', listNames()],
    [els.shareScale, 'scale', sc ? `${sc.rootName} ${scaleTitle(sc.def)}` : ''],
  ];
  for (const [row, key, value] of rows) {
    // Nothing of it on the neck: no row (its switch stays as you left it)
    const has = !lkEmpty(value);
    row.hidden = !has;
    if (!has) continue;
    const on = Boolean(state.share[key]);
    row.setAttribute('aria-pressed', String(on));
    const tag = row.querySelector('.lk-tag');
    tag.textContent = on ? 'Included' : 'Not included';
    tag.className = `lk-tag${on ? ' gain' : ''}`;
    row.querySelector('.lk-change').innerHTML = lkValue(value, on ? 'win' : 'off');   // left out: dimmed, not struck through
  }
  const opts = shareChoice();
  els.shareGo.disabled = !Object.values(opts).some(Boolean);
  els.shareGo.innerHTML = shareSheet() ? `${SHARE_ICON}${tx('Share link')}` : tx('Copy link');
}
function shareChoice() {
  return {
    neck: state.share.neck,
    chord: state.share.chord && state.chord.on,
    scale: state.share.scale && state.scale.on,
    recent: state.share.list && state.list.length > 0,
  };
}
async function shareLink() {
  const opts = shareChoice();
  const url = new URL(`?${linkParams(opts)}`, location.href).href;
  if (shareSheet()) {
    try { await navigator.share({ title: 'Frettle', text: linkSummary(opts), url }); closeShare(); } catch { /* closed */ }
    return;
  }
  let copied = false;
  try { await navigator.clipboard.writeText(url); copied = true; } catch {
    const field = document.createElement('textarea');   // older browsers
    field.value = url;
    field.setAttribute('readonly', '');
    field.style.cssText = 'position:fixed;opacity:0';
    els.share.append(field);   // inside the popup: the page behind it cannot take focus
    field.select();
    try { copied = document.execCommand('copy'); } catch { /* not allowed */ }
    field.remove();
  }
  shareDone(copied);
}

/* Copied: the popup closes, and the Share button says so for a moment
   (a tick and "Copied", in the same width). Not copied: the popup stays
   open and its button says so. */
let shareTimer = 0;
let copiedTimer = 0;
const SHARE_BUTTON = () => `${SHARE_ICON}<span class="btn-label">Share</span>`;
function shareDone(copied) {
  els.shareStatus.textContent = copied ? 'Link copied' : 'Could not copy the link';
  clearTimeout(copiedTimer);
  copiedTimer = setTimeout(() => { els.shareStatus.textContent = ''; }, 2000);
  if (!copied) {
    els.shareGo.innerHTML = tx('Could not copy the link');
    clearTimeout(shareTimer);
    shareTimer = setTimeout(renderShare, 2000);
    return;
  }
  closeShare();
  const btn = els.shareOpen;
  btn.innerHTML = `${DONE_ICON}<span class="btn-label">Copied</span>`;
  btn.classList.add('done');
  clearTimeout(copiedTimer);
  copiedTimer = setTimeout(() => {
    els.shareStatus.textContent = '';
    btn.innerHTML = SHARE_BUTTON();
    btn.classList.remove('done');
  }, 1600);
}

let state = null;
let shapeCache = { key: '', shapes: [] };

/* The selected instrument, in its selected tuning */
const instrument = () => tunedInstrument(state.instrument, state.tuning[state.instrument]);
/* The capo, kept per instrument like the tuning: each instrument comes back
   as it was left */
const capo = () => state.capo[state.instrument] || 0;
function setCapo(c) {
  if (c) state.capo[state.instrument] = c; else delete state.capo[state.instrument];
}

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

/* The inversion set for this instrument, or its default (root position on
   guitar and bass, any bass note on the others) when the chord has no such
   bass note (a 3rd inversion on a triad) */
function inversionFor(def, v = state.inversion[state.instrument]) {
  return v === 'any' || (/^\d+$/.test(v) && Number(v) < def.steps.length) ? v : DEFAULT_INVERSION[state.instrument];
}

/* The shapes of any chord, here and now (the instrument, tuning, capo and
   inversion on screen) */
const shapesMemo = new Map();
function chordShapes(root, def, inversion = inversionFor(def)) {
  const inst = cappedInstrument();
  const key = [inst.id, inst.strings.join(','), capo(), mod12(root), def.id, inversion].join('|');
  if (!shapesMemo.has(key)) {
    if (shapesMemo.size > 200) shapesMemo.clear();
    shapesMemo.set(key, inst.piano ? pianoShapes(mod12(root), def, inversion) : findShapes(inst, root, def, inversion));
  }
  return shapesMemo.get(key);
}

/* Everything the views need about the selected chord, or null. */
function currentChord() {
  if (!state.chord.on) return null;
  const def = findChord(state.chord.type);
  const root = state.chord.root;
  const inversion = inversionFor(def);
  const tones = chordTones(root, def);
  const spell = chordSpelling(root, def);
  const key = [instrument().strings.join(','), capo(), root, def.id, inversion, drawnFrets(root, def.id).join(' ')].join('|');
  if (shapeCache.key !== key) {
    const shapes = listShapes(root, def, inversion);
    shapeCache = { key, shapes, home: homeShape(shapes, root, inversion) };
  }
  const { shapes, home } = shapeCache;
  const index = shapes.length ? Math.min(state.shape ?? home, shapes.length - 1) : -1;   // (none picked: its home shape)
  const shape = shapes[index] || null;
  // Its bass: the shape's lowest note (no shape: the inversion's)
  const bassIndex = shape ? bassIndexOf(root, def, shape) : /^\d+$/.test(inversion) ? Number(inversion) : 0;
  return {
    def, root, inversion, tones, shapes, index, home, shape, bassIndex,
    degOfPc: new Map(tones.map((t) => [t.pc, t.deg])),
    spell,
    rootName: noteText(spell.root),
    symbol: chordName(root, def, bassIndex),   // ("C/E": see chordName)
  };
}

function currentScale() {
  if (!state.scale.on) return null;
  const def = findScale(state.scale.type);
  const pcs = def.steps.map((s) => mod12(state.scale.root + s));
  const spell = scaleSpelling(state.scale.root, def);
  return { def, root: state.scale.root, pcs, set: new Set(pcs), spell, rootName: noteText(spell.root) };
}

/* Turning the chord or the scale off ("None", Deselect, a link without one)
   keeps only its root: the type is forgotten, so nothing can go on reading
   an old type (every way back on picks a new one) */
function chordOff() { state.chord.on = false; state.chord.type = null; openEntry = null; resetInversion(); }   // and its chip is final
function scaleOff() { state.scale.on = false; state.scale.type = null; }
/* A root with no type picked: written as the scale on screen writes it, or
   else as the neck does (Flats setting) */
function plainRoot(pc, sc = currentScale()) {
  return (sc && sc.spell.names.get(mod12(pc))) || plainNote(pc, state.flats);
}

/* Change the chord and show its first shape. */
/* A new chord type (or no chord) starts from the default inversions: an
   inversion is chosen for a chord, not kept for the next one. A new root
   keeps it (the same chord, moved). A chip brings back its own. */
const resetInversion = () => { state.inversion = { ...DEFAULT_INVERSION }; };
function updateChord(patch) {   // a chord picked from the menus (or a triad): its first shape
  if ('type' in patch && (patch.type !== state.chord.type || !state.chord.on)) resetInversion();
  Object.assign(state.chord, patch, { on: true });
  state.shape = null;
  menuPick = 'root' in patch ? ('type' in patch ? 'both' : 'root') : 'type' in patch ? 'type' : 'other';
  render();
}

/* The chord list and the recent chords, for all instruments. The list is
   the one you build (a song's chords): a chord goes in when you tap the +
   on its recent chip and out with its × (Clear empties it); nothing joins
   or leaves it by itself, and Share sends it. The recent chords are the
   last chords used that are not in it (the chord on screen among them), so
   you can go back to one: a new one goes first. RECENT_KEEP are kept; the
   row shows about that many chords in all, so the ones used last fill what
   the list leaves (a short list, a longer history), never fewer than
   RECENT_MAX. When one goes into the list, the one used before them shows
   in its place; past RECENT_KEEP the one unused longest goes (saved, so a
   reload keeps who was used last). They are never shared.
   The in-between chord of picking a root, then a type, does not pile up: a
   recent chord made by picking a root stays open, and if the very next
   thing you do is pick a type, that edits it. Anything else (another root,
   strumming or tapping its notes, a shape, a chip, a triad, the +) makes it
   final. Picking only a type always makes a new one.
   A chip is a chord and its bass note: D and D/F♯ are two chips. A shape
   or inversion with another bass lights that one's chip if there is one;
   else the recent chip on screen takes the new bass (renamed), while a
   list chip stays as it is and the chord gets a new recent chip.
   Each chip remembers the shape you chose for it, per instrument, tuning,
   capo and inversion (`shapes`): tapping the chip, or coming back to this
   instrument, brings that shape back. Picking the chord from the menus starts
   from its first shape, as always (and the chip remembers that). Shapes only
   change in memory when you choose them, never because a setting reset them. */
const LIST_MAX = 16;
const RECENT_MAX = 3;    // recent chords shown, at least
const RECENT_KEEP = 6;   // ... kept, and the chords the row aims to show in all
let recentClock = 0;
let shownChord;          // instrument and chord at the last render
let openEntry = null;    // the recent chord a root pick made, which the next type pick may still edit
let menuPick = '';       // how the chord on screen was just picked: 'root', 'type', 'both' or 'other' (menus)
let chipPick = false;    // ... or from its chip
const shapeContext = (def = findChord(state.chord.type), inversion = inversionFor(def)) => [instrument().strings, capo(), inversion].join('|');
/* Custom shapes: drawn in Name a chord, when the shape finder does not list
   them. Kept per chord, bass note and neck (open strings and capo: the same
   frets on another neck are other notes), one each, as a chip is a chord
   and its bass (A and A/C♯ each keep their own), the last DRAWN_MAX. Listed
   among the chord's shapes, after the first, by their place on the neck,
   when the inversion allows their bass note; marked as custom where shapes
   are shown. Saved and shared (as frets) like any shape. */
const DRAWN_MAX = 40;
const NECK_RE = /^(-?\d+(,-?\d+)*|piano)\|\d+$/;
const neckContext = () => [instrument().piano ? 'piano' : instrument().strings, capo()].join('|');
const readFrets = (text) => String(text).split('-').map((f) => (f === 'x' ? -1 : Number(f)));
// A chord's custom shapes on this neck: their frets, one per bass note
function drawnFrets(root, type) {
  const neck = neckContext();
  return state.drawn.filter((x) => x.root === mod12(root) && x.type === type && x.neck === neck).map((x) => x.frets);
}
function keepDrawn(root, type, frets) {
  const neck = neckContext();
  const def = findChord(type);
  const bass = (text) => bassIndexOf(root, def, { frets: readFrets(text) });
  state.drawn = state.drawn.filter((x) => !(x.root === mod12(root) && x.type === type && x.neck === neck && bass(x.frets) === bass(frets)));
  state.drawn.push({ root: mod12(root), type, neck, frets });
  state.drawn = state.drawn.slice(-DRAWN_MAX);
}
// A shape's notes on the neck as it is (capo on): their pitches, low string
// first (the piano: its keys, low to high)
const shapeMidis = (frets) => {
  const inst = cappedInstrument();
  if (inst.piano) return frets.map((k) => PIANO_LOW + k);
  return frets.map((f, s) => (f < 0 ? null : inst.strings[s] + f)).filter((m) => m !== null);
};
/* A chord's name, the way it is written everywhere (chips, panels, links,
   Name a chord): its symbol, and after a slash its bass note when that is
   not the root ("C/E": C major, 1st inversion). The bass is the shape's
   lowest note, as the chord tone it is (bassIndex: 0 the root, 1 the 2nd
   note of the chord's formula...). */
function bassIndexOf(root, def, shape) {
  const notes = shape ? shapeMidis(shape.frets) : [];
  if (!notes.length) return 0;
  const low = mod12(Math.min(...notes));
  const i = def.steps.findIndex((st) => mod12(root + st) === low);
  return Math.max(0, i);
}
function chordName(root, def, bassIndex = 0) {
  const spell = chordSpelling(root, def);
  return noteText(spell.root) + def.symbol + (bassIndex ? `/${noteText(spell.notes[bassIndex])}` : '');
}
// A chord of the list (or a recent one), named with its bass note: C, C/E
const entrySymbol = (r) => chordName(r.root, findChord(r.type), r.bass);
/* The bass of a chip saved before chips had one: as it showed then, on
   this neck (the inversion and shape it was last used with here, or the
   default) */
function legacyBass(r) {
  const def = findChord(r.type);
  const inversion = inversionFor(def, (r.inversions && r.inversions[state.instrument]) || DEFAULT_INVERSION[state.instrument]);
  const shapes = listShapes(r.root, def, inversion);
  const frets = r.shapes && r.shapes[shapeContext(def, inversion)];
  const at = frets ? shapes.findIndex((x) => fretsText(x.frets) === frets) : -1;
  const shape = shapes[at >= 0 ? at : homeShape(shapes, r.root, inversion)];
  return shape ? bassIndexOf(r.root, def, shape) : /^\d+$/.test(inversion) ? Number(inversion) : 0;
}

/* A shape in words. Strings: its tab ("x 3 2 0 1 0", "x32010") and its
   place ("fret 3"). The piano: its notes, low to high, as the chord on
   screen spells them ("C4 E4 G4"), and its lowest one ("C4"). */
const pianoName = (k) => {
  const m = PIANO_LOW + k;
  const spell = state.chord.on ? chordSpelling(state.chord.root, findChord(state.chord.type)) : null;
  return pitchText(m, (spell && spell.names.get(mod12(m))) || plainNote(m, state.flats));
};
const shapeTab = (shape) => (shape.piano ? shape.frets.map(pianoName).join(' ') : tabOf(shape));
const shapeShort = (shape) => (shape.piano ? shapeTab(shape) : shortTab(shape));
const shapeWhere = (shape) => (shape.piano ? pianoName(shape.frets[0]) : shapePlace(shape));
// A shape that fits this neck and plays only notes of the chord, at least
// two (how a link's custom shape is checked). The piano: keys of the
// keyboard, low to high, each once.
function playsChord(root, def, frets) {
  const inst = cappedInstrument();
  const pcs0 = new Set(chordTones(root, def).map((t) => t.pc));
  if (inst.piano) {
    return frets.length >= 2 && frets.every((k, i) => Number.isInteger(k) && k >= 0 && k < PIANO_KEYS && (!i || k > frets[i - 1]))
      && frets.every((k) => pcs0.has(mod12(PIANO_LOW + k)));
  }
  if (frets.length !== inst.strings.length) return false;
  if (frets.some((f, s) => !Number.isInteger(f) || f < -1 || f > inst.frets || (startFret(inst, s) && f > 0))) return false;
  const pcs = new Set(chordTones(root, def).map((t) => t.pc));
  const notes = shapeMidis(frets);
  return notes.length >= 2 && notes.every((m) => pcs.has(mod12(m)));
}
function listShapes(root, def, inversion = inversionFor(def)) {
  let shapes = chordShapes(root, def, inversion);
  const piano = Boolean(instrument().piano);
  for (const text of drawnFrets(root, def.id)) {
    if (shapes.some((x) => fretsText(x.frets) === text)) continue;
    const frets = readFrets(text);
    if (inversion !== 'any' && mod12(Math.min(...shapeMidis(frets))) !== chordTones(root, def)[Number(inversion)].pc) continue;
    const fretted = frets.filter((f) => f > 0);
    const shape = { frets, pos: piano ? frets[0] : fretted.length ? Math.min(...fretted) : 0, drawn: true, piano };
    const after = shapes.findIndex((x, i) => (piano || i > 0) && x.pos > shape.pos);   // (a neck's first shape stays first)
    const at = shapes.length ? (after < 0 ? shapes.length : after) : 0;
    shapes = [...shapes.slice(0, at), shape, ...shapes.slice(at)];
  }
  return shapes;
}
/* A chord's chip, in the list or the recent chords: a chord and its bass
   note (D and D/F♯ are two chips, each named so), its shapes and inversions
   remembered for each neck */
const newEntry = (root, type, bass) => ({ root, type, bass, shapes: {}, inversions: {} });
const sameEntry = (a, b) => a.root === b.root && a.type === b.type && a.bass === b.bass;
const chipEntry = (root, type, bass) => [...state.list, ...state.recent].find((r) => sameEntry(r, { root, type, bass })) || null;
const shownBass = () => (state.chord.on ? currentChord().bassIndex : null);   // the chord on screen's bass (its shape's, or its inversion's)
const recentEntry = () => (state.chord.on ? chipEntry(state.chord.root, state.chord.type, shownBass()) : null);   // the chord on screen's

// A chord into the recent ones, first; past RECENT_KEEP the one unused longest goes
function addRecent(entry) {
  if (!state.recent.includes(entry)) state.recent.unshift(entry);
  entry.used = ++recentClock;
  trimRecent();
}
function trimRecent() {
  while (state.recent.length > RECENT_KEEP) {
    const old = state.recent.reduce((a, b) => (a.used <= b.used ? a : b));
    state.recent.splice(state.recent.indexOf(old), 1);
  }
}
// The recent chords shown, those used last (in their order): what the list
// leaves of RECENT_KEEP chords, at least RECENT_MAX
function shownRecent() {
  const room = Math.max(RECENT_MAX, RECENT_KEEP - state.list.length);
  const last = [...state.recent].sort((a, b) => b.used - a.used).slice(0, room);
  return state.recent.filter((r) => last.includes(r));
}

/* The shape a chip remembers for the chord on screen, here and now (or the
   first): kept as its frets, so it stays the same shape even if the shape
   list changes */
function rememberedShape(entry = recentEntry(), inversion = null) {
  if (!entry) return null;
  const def = findChord(entry.type);
  inversion = inversion || chipInversion(entry, def);
  const frets = entry.shapes && entry.shapes[shapeContext(def, inversion)];
  const at = frets ? listShapes(entry.root, def, inversion).findIndex((shape) => fretsText(shape.frets) === frets) : -1;
  return at < 0 ? null : at;   // (none: the home shape)
}
// The inversion a chip was last used with on this instrument (or the one set now)
function chipInversion(entry, def) {
  const v = entry && entry.inversions && entry.inversions[state.instrument];
  return inversionFor(def, v || state.inversion[state.instrument]);
}
// A chip's chord back on screen: its inversion (or, with fallback, the
// default), then its shape; its bass whatever those give (its name says
// it: D/F♯ comes back as D/F♯, in that inversion if need be, shape or none;
// with onlyPlayable, only where this neck has a shape for it)
function recallChip(entry = recentEntry(), fallback = false, onlyPlayable = false) {
  if (!entry) return;
  const v = entry.inversions && entry.inversions[state.instrument];
  if (v || fallback) state.inversion[state.instrument] = v || DEFAULT_INVERSION[state.instrument];
  state.shape = rememberedShape(entry);
  const ch = state.chord.on ? currentChord() : null;
  if (!ch || entry.bass === undefined || ch.bassIndex === entry.bass) return;
  const want = String(entry.bass);
  if (onlyPlayable && !listShapes(ch.root, ch.def, inversionFor(ch.def, want)).length) return;
  state.inversion[state.instrument] = want;
  state.shape = rememberedShape(entry, inversionFor(ch.def, want));
}
// Where a chip's chord comes back, worked out as recallChip does without
// putting it on screen: { inversion, shapes, index } (-1: no shape)
function chipShape(entry) {
  const def = findChord(entry.type);
  const at = (inversion) => {
    const shapes = listShapes(entry.root, def, inversion);
    return { inversion, shapes, index: shapes.length ? rememberedShape(entry, inversion) ?? homeShape(shapes, entry.root, inversion) : -1 };
  };
  const got = at(chipInversion(entry, def));
  const shape = got.shapes[got.index];
  const bass = shape ? bassIndexOf(entry.root, def, shape) : /^\d+$/.test(got.inversion) ? Number(got.inversion) : 0;
  return entry.bass === undefined || bass === entry.bass ? got : at(inversionFor(def, String(entry.bass)));
}
/* The neck changes (another instrument, tuning or capo): the chord on
   screen keeps its name, bass note and all (Bdim/F stays Bdim/F on the
   guitar). Its chip's shape there if that has the same bass, else the
   first shape with it; if the new neck has none, as its chip remembers. */
function changeNeck(change) {
  const before = currentChord();
  const bass = before && before.shape ? before.bassIndex : null;
  const entry = recentEntry();   // (its chip: the same chip after, where the new neck can play its bass)
  change();
  state.shape = null;
  recallChip(entry || recentEntry(), false, true);
  if (bass === null) return;
  const now = currentChord();
  if (!now || (now.shape && now.bassIndex === bass)) return;
  const want = String(bass);
  if (inversionFor(now.def, want) !== want || !listShapes(now.root, now.def, want).length) return;
  state.inversion[state.instrument] = want;
  state.shape = null;
}
function rememberShape(entry = recentEntry()) {
  const ch = currentChord();
  if (!entry || !ch || !ch.shape) return;
  entry.inversions = { ...entry.inversions, [state.instrument]: ch.inversion };
  const ctx = shapeContext();
  entry.shapes = { ...entry.shapes };
  delete entry.shapes[ctx];
  entry.shapes[ctx] = fretsText(ch.shape.frets);   // newest last; keep the last few settings only
  const keys = Object.keys(entry.shapes);
  for (const k of keys.slice(0, Math.max(0, keys.length - 4))) delete entry.shapes[k];
}

/* Called on every render: what you did is worked out from what changed on
   screen since the last render (the chord, and how it was picked: menuPick,
   chipPick), not reported by each control. Anything that changes the chord
   must go through updateChord (menus), playChip (chips) or set those flags,
   or it will count as a plain new chord. */
function trackChord() {
  const bass = shownBass();
  const key = state.chord.on ? `${state.chord.root}:${state.chord.type}:${bass}` : '';
  const sameInst = shownChord !== undefined && shownChord.inst === state.instrument;
  const setup = [state.instrument, instrument().strings, capo()].join('|');
  if (!shownChord || shownChord.setup !== setup) openEntry = null;   // a new instrument, tuning or capo: final
  const how = menuPick;
  const changed = sameInst && (shownChord.key !== key || how !== '');
  const fromChip = chipPick;
  const prev = shownChord && shownChord.entry;
  menuPick = '';
  chipPick = false;
  shownChord = { inst: state.instrument, key, setup, entry: recentEntry() };
  if (!state.chord.on) return;
  if (!changed) {
    // The chord on screen always has its chip: the one the page opens on
    // (saved, or a link's), or one whose bass another neck can't play
    if (!shownChord.entry) addRecent(shownChord.entry = newEntry(state.chord.root, state.chord.type, bass));
    return;
  }
  const open = how === 'type' && openEntry && state.recent.includes(openEntry) ? openEntry : null;
  openEntry = null;
  let entry = shownChord.entry;
  if (!entry && open) {                // root, then type: the same chip, edited
    Object.assign(open, newEntry(state.chord.root, state.chord.type, bass));
    entry = open;
  } else if (!entry && prev && state.recent.includes(prev) && prev.root === state.chord.root && prev.type === state.chord.type) {
    prev.bass = bass;                  // the same chord, another bass (a shape, an inversion): its recent chip, renamed
    entry = prev;
  } else if (!entry) {                 // a new chord (or a list chip's, with another bass): a new recent chip
    entry = newEntry(state.chord.root, state.chord.type, bass);
    if (how === 'root') openEntry = entry;   // the next type pick may still edit it
  } else if (open && open !== entry) { // root, then type, landing on a chord already there
    state.recent.splice(state.recent.indexOf(open), 1);
  }
  shownChord.entry = entry;
  // Not in the list: one of the recent chords, first when new (a recent
  // chip tapped stays where it is)
  if (!state.list.includes(entry)) addRecent(entry);
  if (!fromChip) rememberShape(entry);   // picked from the menus: its first shape
}

function keepChord() { openEntry = null; }   // strummed, cycled, its notes played: this chip is final

// A chip tapped: its chord on screen (in the list: data-i, recent: data-r)
function playChip(entry) {
  if (!entry) return;
  keepChord();
  state.chord = { on: true, root: entry.root, type: entry.type };
  recallChip(entry, true);   // as it was last used: its inversion and shape
  chipPick = true;
  ui.reveal = true;   // phones: bring the shape into view, even if this chip was already the one on screen
  ui.chipKey = '';    // ... and the chip itself, whole
  render();
}

/* The + on a recent chip: its chord joins the end of the list (it leaves
   the recent ones). The chord on screen stays. */
function pinChord(i) {
  const entry = state.recent[i];
  if (!entry || state.list.length >= LIST_MAX) return;
  if (openEntry === entry) openEntry = null;   // final
  state.recent.splice(i, 1);
  state.list.push(entry);
  render();
  focusChip(`[data-i="${state.list.length - 1}"]`);
}
// The keyboard focus, after a + or an ×: on the chord's chip where it went
function focusChip(selector) {
  const row = document.activeElement && document.activeElement.closest && document.activeElement.closest('.recent-chips');
  const chip = row && row.querySelector(selector);
  if (chip) chip.focus({ preventScroll: true });
}
/* The × on the list's chip of the chord on screen: it leaves the list. The
   chord stays on screen, so it is back with the recent ones, first. */
function unpinChord(i) {
  const entry = state.list[i];
  if (!entry) return;
  const shown = entry === recentEntry();
  state.list.splice(i, 1);
  if (shown) addRecent(entry);
  render();
  if (shown) focusChip(`[data-r="${state.recent.indexOf(entry)}"]`);
}

/* Chips dropped in a new order (a drag): the chips before the line are the
   list, those after it the recent chords. A recent chip dropped among the
   list's chips joins the list there (as its + would, if there is room); a
   list chip dropped past the line leaves it, and is one of the recent
   chords there (the one unused longest making room). `order`: the entries,
   with LINE where the line is. */
const LINE = 'line';
function dropChips(order) {
  const cut = order.indexOf(LINE);
  const list = order.slice(0, cut);
  const recent = order.slice(cut + 1);
  if (list.length > LIST_MAX) return;   // no room: it goes back
  for (const r of recent) if (!state.recent.includes(r)) r.used = ++recentClock;   // just put there
  for (const r of list) if (r === openEntry) openEntry = null;   // in the list: final
  // (the ones kept out of sight stay, after those shown)
  const hidden = state.recent.filter((r) => !recent.includes(r) && !list.includes(r));
  state.list = list;
  state.recent = [...recent, ...hidden];
  trimRecent();
  ui.keepRow = true;
  render();
}
/* Move a list chip to another place in the list (Shift+← / →). Its place
   only: which chord is on screen, and which was used last, stay. */
function moveRecent(from, to) {
  const list = state.list;
  if (from === to || !list[from] || to < 0 || to >= list.length) return;
  list.splice(to, 0, ...list.splice(from, 1));
  ui.keepRow = true;
  render();
}

/* Drag a chip to reorder the row, or across the line between the list and
   the recent chords (dropChips). With a finger: press and hold it still
   (HOLD_MS), then drag; a quick tap still picks the chord and a swipe still
   scrolls the row. With a mouse or a pen: press and move a few pixels. The
   chip lifts and moves along the row with the pointer, held where it was
   pressed, the others
   slide aside to show where it will land, and the row scrolls when the
   pointer nears either end. While dragging, the line is there even when one
   side is empty (at the end of the list, or before the recent chords), so a
   chip can always cross it. */
const HOLD_MS = 350;
function setupChipDrag(row) {
  let drag = null;   // { li, entry, id, x, y, touch, timer, on, items, from, at, scroll, frame, ghost, line }
  let swallowClick = false;
  const stop = () => {
    if (!drag) return;
    clearTimeout(drag.timer);
    cancelAnimationFrame(drag.frame);
    for (const it of drag.items || []) it.style.transform = '';
    if (drag.ghost) drag.ghost.remove();
    if (drag.line) drag.line.remove();
    drag.li.classList.remove('dragging');
    row.classList.remove('reordering');
    drag = null;
  };
  const begin = () => {
    drag.on = true;
    swallowClick = true;
    if (navigator.vibrate) try { navigator.vibrate(10); } catch { /* not allowed */ }
    // A mouse keeps the drag even off the row; a finger needs nothing: its
    // events already go to the chip it pressed (moving that capture, as
    // Android browsers do, would end the drag at once)
    if (!drag.touch) try { drag.li.setPointerCapture(drag.id); } catch { /* already released */ }
    if (!row.querySelector(':scope > .recent-sep')) {   // no line: one for the drag
      drag.line = document.createElement('li');
      drag.line.className = 'recent-sep';
      drag.line.setAttribute('aria-hidden', 'true');
      if (drag.li.classList.contains('trail')) row.prepend(drag.line); else row.append(drag.line);
    }
    drag.items = [...row.children];
    drag.from = drag.items.indexOf(drag.li);
    drag.rects = drag.items.map((it) => it.getBoundingClientRect());
    drag.scroll = row.scrollLeft;
    drag.at = drag.from;
    // The chip lifts out of the row (a copy above everything, so nothing
    // clips it), held where it was pressed, and leaves an outlined slot
    // where it will land. The copy sits in a row of its own with the same
    // classes as its row's (the dock's or the panel's), so it keeps its
    // look exactly (list or recent, lit or not) until it is dropped.
    const r = drag.rects[drag.from];
    drag.grab = drag.x - r.left;
    drag.ghost = document.createElement('div');
    drag.ghost.className = `chip-lift${row.closest('.dock-recent') ? ' dock-recent' : ''}`;
    const copyRow = document.createElement('ol');
    copyRow.className = 'recent-chips';
    copyRow.append(drag.li.cloneNode(true));
    drag.ghost.append(copyRow);
    Object.assign(drag.ghost.style, { top: `${r.top}px`, transformOrigin: `${drag.grab}px 50%` });
    document.body.append(drag.ghost);
    drag.li.classList.add('dragging');
    row.classList.add('reordering');
    const edge = () => {   // near an end: scroll that way
      if (!drag) return;
      const box = row.getBoundingClientRect();
      const speed = drag.px < box.left + 32 ? -8 : drag.px > box.right - 32 ? 8 : 0;
      if (speed) { row.scrollLeft += speed; place(); }
      drag.frame = requestAnimationFrame(edge);
    };
    place();   // lifted right away, under the pointer
    drag.frame = requestAnimationFrame(edge);
  };
  const place = () => {
    const shift = row.scrollLeft - drag.scroll;   // the row scrolled since the drag began
    const { rects, from, grab } = drag;
    // The copy: along the row, the point it is held by under the pointer
    // (the scale grows it around that point, so it stays there)
    drag.ghost.style.transform = `translate(${drag.px - grab}px, -3px) scale(1.12)`;
    // Where it lands: past the middle of each chip it is dragged over; its
    // slot moves there
    const mid = drag.px - grab + rects[from].width / 2 + shift;
    let at = from;
    while (at < rects.length - 1 && mid > rects[at + 1].left + rects[at + 1].width / 2) at++;
    while (at > 0 && mid < rects[at - 1].left + rects[at - 1].width / 2) at--;
    drag.at = at;
    const slot = at > from ? rects[at].right - rects[from].width : rects[at].left;
    drag.li.style.transform = at === from ? '' : `translateX(${slot - rects[from].left}px)`;
    const gap = parseFloat(getComputedStyle(row).columnGap) || 6;
    const size = rects[from].width + gap;
    drag.items.forEach((it, i) => {
      if (i === from) return;
      const by = from < at && i > from && i <= at ? -size : from > at && i < from && i >= at ? size : 0;
      it.style.transform = by ? `translateX(${by}px)` : '';
    });
  };
  // The entries in the row's order, with LINE for the line
  const entryOf = (li) => {
    if (li.classList.contains('recent-sep')) return LINE;
    const chip = li.querySelector('[data-i], [data-r]');
    return chip.dataset.i !== undefined ? state.list[Number(chip.dataset.i)] : state.recent[Number(chip.dataset.r)];
  };
  row.addEventListener('pointerdown', (e) => {
    if (e.button > 0 || drag || e.target.closest('.recent-remove, .recent-pin')) return;
    const li = e.target.closest('li');
    if (!li || !li.querySelector('[data-i], [data-r]')) return;
    drag = { li, id: e.pointerId, x: e.clientX, y: e.clientY, px: e.clientX, touch: e.pointerType === 'touch', on: false };
    if (drag.touch) drag.timer = setTimeout(() => { if (drag && !drag.on) begin(); }, HOLD_MS);
  });
  row.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.on) {
      const moved = Math.hypot(e.clientX - drag.x, e.clientY - drag.y);
      if (drag.touch) { if (moved > 8) stop(); return; }   // moved before the hold: a swipe
      if (moved < 5) return;
      drag.px = e.clientX;
      begin();
      return;
    }
    drag.px = e.clientX;
    place();
  });
  row.addEventListener('pointerup', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const { on, from, at, items } = drag;
    const order = on ? items.map(entryOf) : null;
    stop();
    if (!on || from === at) return;
    order.splice(at, 0, ...order.splice(from, 1));
    dropChips(order);
  });
  row.addEventListener('pointercancel', stop);
  row.addEventListener('lostpointercapture', (e) => { if (drag && drag.on && !drag.touch && e.target === drag.li && e.pointerId === drag.id) stop(); });
  // While dragging, a finger does not scroll the page or the row
  row.addEventListener('touchmove', (e) => { if (drag && drag.on) e.preventDefault(); }, { passive: false });
  row.addEventListener('contextmenu', (e) => { if (drag) e.preventDefault(); });   // a long press is a drag here
  // The click that ends a drag picks nothing
  row.addEventListener('click', (e) => {
    if (!swallowClick) return;
    swallowClick = false;
    e.stopImmediatePropagation();
    e.preventDefault();
  }, true);
  row.addEventListener('pointerdown', () => { swallowClick = false; }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && drag && drag.on) { e.stopPropagation(); stop(); } }, true);
  // Shift+← / → moves the focused list chip
  row.addEventListener('keydown', (e) => {
    const chip = e.target.closest('[data-i]');
    if (!chip || !e.shiftKey || e.altKey || e.ctrlKey || e.metaKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    e.preventDefault();
    e.stopPropagation();
    const from = Number(chip.dataset.i);
    const to = from + (e.key === 'ArrowRight' ? 1 : -1);
    if (to < 0 || to >= state.list.length) return;
    moveRecent(from, to);
    const moved = row.querySelector(`[data-i="${to}"]`);
    if (moved) moved.focus();
  });
}

/* The bin: the list and the recent chords empty, and the chord on screen
   goes with them. With chords saved in the list, asked first: all of them
   (Clear all), or only the recent ones (Clear recent, when there are some:
   the saved ones stay). With none saved, the recent ones go straight away. */
const chordCount = (n, what) => `${n} ${what} chord${n === 1 ? '' : 's'}`;
function askClearRecent() {
  if (!state.list.length) { clearRecent(); return; }
  const saved = state.list.map(entrySymbol);
  const recent = shownRecent().map(entrySymbol);
  els.listClearCount.textContent = chordCount(saved.length, 'saved');
  els.listClearNames.innerHTML = lkValue(saved, 'win');   // chips, as in the share popup
  // the recent ones under them, quieter: dashed chips, as in the chord list
  els.listClearRecentCount.textContent = chordCount(recent.length, 'recent');
  els.listClearRecentNames.innerHTML = `<span class="lk-val chips recent">${recent.map((n) => `<span class="lk-chip trail">${TRAIL_CHIP_EDGE}${chipText(n)}</span>`).join('')}</span>`;
  for (const el of [els.listClearRecentCount, els.listClearRecentNames, els.listClearRecentGo]) el.hidden = !recent.length;
  if (els.listClear.showModal) els.listClear.showModal(); else els.listClear.setAttribute('open', '');
  fitDashes(els.listClearRecentNames, '.lk-chip.trail');
  els.listClearCancel.focus();
}
function closeClearRecent() {
  if (els.listClear.open) {
    if (els.listClear.close) els.listClear.close(); else els.listClear.removeAttribute('open');
  }
}
function clearRecent() {
  closeClearRecent();
  state.list = [];
  state.recent = [];
  chordOff();
  render();
}
// Only the recent chords: the saved ones stay, and so does the chord on
// screen if it is one of them (a recent one goes with its chip)
function clearRecentOnly() {
  closeClearRecent();
  const shown = recentEntry();
  state.recent = [];
  openEntry = null;
  if (state.chord.on && !state.list.includes(shown)) chordOff();
  render();
}

const stepShape = (step) => { const ch = currentChord(); if (ch) selectShape(ch.index + step); };   // the next shape, or the one before
function selectShape(index) {
  const ch = currentChord();
  if (!ch || !ch.shapes.length) return;
  keepChord();   // cycling its shapes: this chord is being used
  state.shape = (index + ch.shapes.length) % ch.shapes.length;
  rememberShape();
  render();
}

/* Scale groups overlap, so one is picked at a time (ui.group), stepped
   through like a chord's shapes. The place picked on the neck is kept
   (ui.groupAt: the group's lowest fret, as its chip names it, and the fret
   in its middle), so the hand stays there when the scale changes (another
   root or type, tuning or capo): the group that starts at the same fret if
   there is one, else the nearest (the one whose middle is nearest of two
   as near). Before any pick, or on another instrument: the first group
   (nearest the nut). */
const groupFrets = (g) => [Math.min(...g.bars.map((b) => b.a)), Math.max(...g.bars.map((b) => b.b))];
const groupMid = (g) => { const [a, b] = groupFrets(g); return (a + b) / 2; };
function pickGroup(groups) {
  if (!groups.length) return -1;
  if (ui.groupAt === null) return 0;
  const far = (g) => [Math.abs(groupFrets(g)[0] - ui.groupAt.low), Math.abs(groupMid(g) - ui.groupAt.mid)];
  let best = 0;
  groups.forEach((g, i) => {
    const [low, mid] = far(g);
    const [bestLow, bestMid] = far(groups[best]);
    if (low < bestLow || (low === bestLow && mid < bestMid)) best = i;
  });
  return best;
}
function selectGroup(index) {
  const groups = ui.groups;
  if (!groups.length) return;
  const i = (index + groups.length) % groups.length;
  stopGroup();
  ui.groupAt = { low: groupFrets(groups[i])[0], mid: groupMid(groups[i]) };
  ui.revealGroup = true;
  render();
}
/* "Open" (a note at the nut, or at the capo), else its lowest fret, counted
   from the capo like a chord shape's */
const groupPlace = (g, capo) => (g.bars.some((b) => b.a === capo) ? 'open' : `fret ${groupFrets(g)[0] - capo}`);

/* ==========================================================================
   4. Sound
   (The piano's notes: see strike.)
   Plucked strings synthesised in the browser (Karplus-Strong): a short burst
   of noise circulates in a delay line one period long and is softened a
   little on every pass, which sounds like a plucked string. Each pitch is
   computed once and kept: ahead, in a worker (warmUp), or on first use.
   To sound clear but not buzzy: the burst is softened more for high notes
   (a softer pick) and shaped as if plucked away from the bridge (some
   harmonics cancel), low strings lose a little of their long-ringing fizz,
   and every note goes through a light tone shaping, a little body warmth, a
   small room made from decaying noise, and a soft limiter.
   ========================================================================== */
const STRUM_GAP = 0.035;   // seconds between strings in a strum
const ROLL_GAP = 0.012;    // ... between a piano chord's keys (struck together, barely rolled)
let audio = null;
const pluckCache = new Map();
const SOUND_RATE = 48000;   // the plucks' and the room's (most devices play at it; the browser converts for the others)
/* A sound's buffer. Where the browser allows it, one needs no audio (which
   only starts at a first tap): every sound can then be made ahead, in idle
   time, so the first one plays at once (warmUp). */
function newBuffer(channels, length, rate) {
  try { return new AudioBuffer({ numberOfChannels: channels, length, sampleRate: rate }); }
  catch { return audio ? audio.ctx.createBuffer(channels, length, rate) : null; }
}
const SOUNDS_AHEAD = Boolean(newBuffer(1, 1, SOUND_RATE));

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
/* The audio starts at the first tap or key press anywhere (the browser
   allows it no sooner), so it is running by the time a note is played */
function startAudioEarly() {
  const start = () => {
    if (navigator.userActivation && !navigator.userActivation.isActive) return;   // (not yet a tap the browser counts: the next one)
    const a = audioOut();
    if (a && a.ctx.state !== 'suspended') EARLY_EVENTS.forEach((type) => document.removeEventListener(type, start, true));
  };
  EARLY_EVENTS.forEach((type) => document.addEventListener(type, start, true));
}
const EARLY_EVENTS = ['pointerdown', 'pointerup', 'keydown', 'touchend'];
/* Make sounds ahead, one at a time in a worker (or when the page is
   idle): the room, then the chord's and the scale's notes (likely played first), then every
   other note of the instrument, from the middle out. Called on every
   render: the list starts over (anything made is kept). */
let warmList = [];
let warming = false;
function warmUp(ch, sc) {
  if (!SOUNDS_AHEAD) return;
  const inst = instrument();
  const piano = Boolean(inst.piano);
  const first = [...(ch && ch.shape ? shapeMidis(ch.shape.frets) : []), ...(sc ? scalePitches(sc) : [])];
  const all = [];
  if (piano) for (let k = 0; k < PIANO_KEYS; k++) all.push(PIANO_LOW + k);
  else inst.strings.forEach((_, s) => { for (let f = startFret(inst, s); f <= inst.frets; f++) all.push(fretPitch(inst, s, f)); });
  all.sort((a, b) => Math.abs(a - 64) - Math.abs(b - 64));
  const cache = piano ? pianoCache : pluckCache;
  warmList = [...new Set([...first, ...all])].filter((m) => !cache.has(m)).map((midi) => ({ midi, piano }));
  if (!roomBuffer) warmList.unshift({ room: true });
  if (warming || !warmList.length) return;
  warming = true;
  const idle = window.requestIdleCallback;
  const later = (f) => (idle ? idle(f, { timeout: 2000 }) : setTimeout(f, 40));
  const step = (deadline) => {
    do {
      const job = warmList.shift();
      if (!job) break;
      if (job.room) roomImpulse();
      else if ((job.piano ? pianoCache : pluckCache).has(job.midi)) continue;
      else if (makeInWorker(job, () => later(step))) return;   // (made in the background: on with the list once it is back)
      else if (job.piano) pianoTone(job.midi);
      else pluck(job.midi);
    } while (deadline && !deadline.didTimeout && deadline.timeRemaining() > 8);
    if (warmList.length) later(step); else warming = false;
  };
  later(step);
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
    room.buffer = roomImpulse(ctx.sampleRate);   // (a room must be at the audio's own rate)
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
let roomBuffer = null;
function roomImpulse(sr = SOUND_RATE) {
  if (roomBuffer && roomBuffer.sampleRate === sr) return roomBuffer;
  const len = Math.floor(sr * 0.9);
  const ir = newBuffer(2, len, sr);
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
  roomBuffer = ir;
  return ir;
}

/* A plucked note's samples, at `sr`, and the playback rate that puts it in
   tune. Self contained (no outside names): it also runs in a worker. */
function pluckSamples(midi, sr) {
  const freq = 440 * 2 ** ((midi - 69) / 12);
  // Averaging each sample with the next one shortens the loop by half a
  // sample, so it sounds at sr / (n - 0.5); playbackRate fixes the rounding
  const n = Math.max(2, Math.floor(sr / freq + 0.5));
  const rate = freq / (sr / (n - 0.5));
  const seconds = midi < 48 ? 1.55 : 1.2;   // note length (low notes ring a bit longer)
  const len = Math.floor(sr * seconds);
  const data = new Float32Array(len);

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
  return { data, rate };
}

/* The piano: each key's sound worked out once (then kept), as a struck
   string does: its harmonics a little sharp of whole multiples (stiff
   steel), shaped by where the hammer hits (1/8.5 of the way along) and by
   its soft felt (the high ones give out, sooner down low), each fading on
   its own (high ones sooner, low notes slowest), fast at first, then
   slowly (the strike, then the ring); two strings a hair apart from the
   bass up (one at the very bottom), which slowly beat; and the hammer's
   soft knock. Kept at a low rate (the top harmonic kept is under 7.5 kHz)
   to be quick to work out. Self contained (no outside names): it also
   runs in a worker. */
function pianoSamples(midi, sr) {
  const f0 = 440 * 2 ** ((midi - 69) / 12);
  const x = Math.min(1, Math.max(0, (midi - 21) / 87));   // 0 at the bottom (A0), 1 at the top (C8)
  const len = Math.floor(sr * (2.6 - 1.4 * x));   // (seconds)
  const data = new Float32Array(len);
  const stiff = 0.00008 * 2 ** (3.6 * x);         // how sharp the harmonics run
  const ring = 0.35 + 3 * (1 - x) ** 1.7;         // the fundamental's slow fade (seconds)
  const felt = 900 + 3200 * x;                    // where the harmonics start to give out (Hz)
  const cents = midi < 30 ? [0] : [-0.6, 0.7];    // the strings
  let seed = midi * 7919 + 13;                    // (the same sound every time)
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let n = 1; n <= 48; n++) {
    const fn = n * f0 * Math.sqrt(1 + stiff * n * n);
    if (fn > 7500) break;
    const amp = Math.abs(Math.sin(Math.PI * n / 8.5)) / n ** 0.7 / Math.sqrt(1 + (fn / felt) ** 4);
    if (amp < 0.002) continue;   // (too soft to hear)
    const tau = ring / (1 + fn / 700);
    const fast = Math.exp(-1 / (sr * tau * 0.18));
    const slow = Math.exp(-1 / (sr * tau));
    const end = Math.min(len, Math.floor(sr * tau * 9));   // (all but silent by then)
    for (const c of cents) {
      // A step round the circle per sample (no sine to work out each time)
      const w = (2 * Math.PI * fn * 2 ** ((c * (1 + 0.15 * n)) / 1200)) / sr;
      const cw = Math.cos(w);
      const sw = Math.sin(w);
      const phase = rnd() * 2 * Math.PI;
      let re = (Math.cos(phase) * amp) / cents.length;
      let im = (Math.sin(phase) * amp) / cents.length;
      let e1 = 0.7;
      let e2 = 0.3;
      for (let i = 0; i < end; i++) {
        data[i] += im * (e1 + e2);
        const r = re * cw - im * sw;
        im = re * sw + im * cw;
        re = r;
        e1 *= fast;
        e2 *= slow;
      }
    }
  }
  // The hammer's knock: a short burst of soft noise
  const soft = 1 - Math.exp((-2 * Math.PI * Math.min(4000, 600 + f0 * 2)) / sr);
  let lp = 0;
  for (let i = 0; i < sr * 0.06; i++) {
    lp += soft * (rnd() * 2 - 1 - lp);
    data[i] += 0.12 * lp * Math.exp(-i / (sr * 0.01));
  }
  // Every key as loud (the top a little softer: the ear hears it more),
  // with a 2 ms start and a 0.4 s end: never a click
  const early = Math.floor(sr * 0.3);
  let power = 0;
  for (let i = 0; i < early; i++) power += data[i] * data[i];
  // (as loud to the ear as a plucked note at the same pitch, measured
  // through the app's sound path: the low notes need the most help)
  const level = 10 ** (Math.min(5.2, Math.max(0.4, 5.2 - 0.13 * (midi - 40))) / 20);
  const gain = (0.115 * (1 - 0.3 * x) * level) / (Math.sqrt(power / early) || 1);
  const rise = sr * 0.002;
  const fade = sr * 0.4;
  for (let i = 0; i < len; i++) data[i] *= gain * Math.min(1, i / rise, (len - i) / fade);
  return data;
}
const PIANO_RATE = 24000;
const pianoCache = new Map();   // a key's sound (an AudioBuffer), by MIDI number
const toBuffer = (data, rate) => {
  const buffer = newBuffer(1, data.length, rate);
  buffer.getChannelData(0).set(data);
  return buffer;
};
/* A note's sound, made now if not made yet (most are made ahead: warmUp) */
function pluck(midi) {
  if (!pluckCache.has(midi)) keepSound({ piano: false, midi, ...pluckSamples(midi, SOUND_RATE) });
  return pluckCache.get(midi);
}
function pianoTone(midi) {
  if (!pianoCache.has(midi)) keepSound({ piano: true, midi, data: pianoSamples(midi, PIANO_RATE) });
  return pianoCache.get(midi);
}
function keepSound({ piano, midi, data, rate }) {
  if (piano) { if (!pianoCache.has(midi)) pianoCache.set(midi, toBuffer(data, PIANO_RATE)); }
  else if (!pluckCache.has(midi)) pluckCache.set(midi, { buffer: toBuffer(data, SOUND_RATE), rate });
}
/* Sounds made ahead in a worker, so the page never waits on them (where
   one can't be made: in idle time, warmUp). `done` is called once the
   sound is back; false: no worker. */
let soundWorker = null;   // (false: none to be had)
let soundDone = null;
function makeInWorker(job, done) {
  if (soundWorker === null) {
    try {
      const code = `${pluckSamples}\n${pianoSamples}\nonmessage = (e) => {
        const { piano, midi } = e.data;
        const made = piano ? { data: pianoSamples(midi, ${PIANO_RATE}) } : pluckSamples(midi, ${SOUND_RATE});
        postMessage({ piano, midi, ...made }, [made.data.buffer]);
      };`;
      soundWorker = new Worker(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
      const next = () => {
        const then = soundDone;
        soundDone = null;
        if (then) then();
      };
      soundWorker.onmessage = (e) => { keepSound(e.data); next(); };
      soundWorker.onerror = () => { soundWorker = false; next(); };   // (none after all: on in idle time)
    } catch {
      soundWorker = false;
    }
  }
  if (!soundWorker) return false;
  soundDone = done;
  soundWorker.postMessage({ piano: job.piano, midi: job.midi });
  return true;
}
/* Strike a key; returns something to stop it (the damper: a quick fade) */
function strike(a, midi, delay, level) {
  const { ctx } = a;
  const src = ctx.createBufferSource();
  src.buffer = pianoTone(midi);
  const gain = ctx.createGain();
  gain.gain.value = level;
  src.connect(gain);
  gain.connect(a.out);
  src.start(ctx.currentTime + delay);
  return {
    stop: () => {
      const t = ctx.currentTime;   // (one not started yet never will)
      gain.gain.setTargetAtTime(0, t, 0.03);
      try { src.stop(t + 0.2); } catch { /* over */ }
    },
  };
}

/* Play a pitch now, or `delay` seconds from now: plucked, or on the piano
   struck */
function playNote(midi, delay = 0, level = 0.55) {
  const a = audioOut();
  if (!a) return;
  if (state && findInstrument(state.instrument).piano) return strike(a, midi, delay, level);
  const { buffer, rate } = pluck(midi);
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

/* Light up a note while it sounds: on the neck, or any pill (ping). */
function ping(el) {
  if (!el) return;
  const cls = el.classList.contains('out') ? 'peek' : 'ping';   // a hidden note shows for a moment
  el.classList.remove(cls);
  void el.offsetWidth;   // restart the animation
  el.classList.add(cls);
  if (cls === 'peek') {   // hidden again once its fade is over (not when the ring's ends)
    const done = (e) => { if (e.animationName === 'peek') { el.classList.remove('peek'); el.removeEventListener('animationend', done); } };
    el.addEventListener('animationend', done);
  }
}
function flashCell(s, f, delay = 0) {
  setTimeout(() => els.neck.querySelectorAll(`.cell[data-s="${s}"][data-f="${f}"] .note`).forEach(ping), delay * 1000);   // (and its copy in the strip)
}
function flashKey(k, delay = 0) {   // a piano key
  setTimeout(() => ping(els.neck.querySelector(`.key[data-key="${k}"] .note`)), delay * 1000);
}

/* Tap a note on the neck to hear it (not behind the capo; a note hidden by
   "Only scale notes" sounds too, and shows for a moment).
   With a mouse or a pen it sounds on press. On a touch screen it sounds once
   the finger has rested TAP_DELAY ms without moving (or on release, if that
   comes first), so swiping to scroll the neck never plays notes, nor does
   a touch that stops a scroll still gliding. Each finger is followed on its
   own, so two quick taps both sound. */
const TAP_DELAY = 120;  // ms (long enough for a swipe to have moved by then)
const TAP_SLOP = 8;     // px a finger may move and still count as a tap
// A glide is set going by a finger and lasts a few seconds at most: only
// those scrolls count (not the page's own, as it brings a shape into view,
// which a touch does not stop: a tap then still plays)
let lastSwipe = -Infinity;    // when a finger last moved
let lastScroll = -Infinity;   // when something (the page, a row) last scrolled after one
if (typeof document !== 'undefined') {   // (not in tests/, which run this file without a page)
  document.addEventListener('touchmove', () => { lastSwipe = performance.now(); }, { capture: true, passive: true });
  document.addEventListener('scroll', () => { if (performance.now() - lastSwipe < 3000) lastScroll = performance.now(); }, { capture: true, passive: true });
}
const stillScrolling = () => performance.now() - lastScroll < 120;
function setupNeckTaps() {
  const taps = new Map();   // pointerId → { cell, x, y, timer, done }
  const playable = (target) => {
    const cell = target.closest('.cell, .key');
    return cell && !cell.matches('.behind, .no-string, .waiting') ? cell : null;
  };
  const play = (cell) => {
    if (naming) { namerTap(cell); return; }
    if (cell.dataset.key !== undefined) {   // a piano key
      const k = Number(cell.dataset.key);
      playNote(PIANO_LOW + k);
      flashKey(k);
      if (cell.querySelector('.note.chord, .note.ghost')) keepChord();
      return;
    }
    const s = Number(cell.dataset.s);
    const f = Number(cell.dataset.f);
    playNote(fretPitch(instrument(), s, f));
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
    if (stillScrolling()) return;   // (the touch stops the glide: no note)
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

/* Anything that sounds plays on press, like the neck: at once with a mouse
   or a pen; with a finger after TAP_DELAY (or on lifting it, if sooner), and
   not at all if it moves past TAP_SLOP first (it was a swipe to scroll).
   Enter or Space on a focused one plays it too. */
function onPress(box, selector, act) {   // (selector null: the box itself, a button)
  const taps = new Map();
  const target = (e) => {
    const el = selector ? e.target.closest(selector) : box;
    return el && box.contains(el) && !el.disabled ? el : null;
  };
  const cancel = (e) => {
    const tap = taps.get(e.pointerId);
    if (tap) { clearTimeout(tap.timer); taps.delete(e.pointerId); }
  };
  box.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    const el = target(e);
    if (!el) return;
    if (e.pointerType !== 'touch') { act(el); return; }
    if (stillScrolling()) return;
    const tap = { el, x: e.clientX, y: e.clientY, done: false };
    tap.timer = setTimeout(() => { tap.done = true; act(el); }, TAP_DELAY);
    taps.set(e.pointerId, tap);
  });
  box.addEventListener('pointermove', (e) => {
    const tap = taps.get(e.pointerId);
    if (tap && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > TAP_SLOP) cancel(e);
  });
  box.addEventListener('pointerup', (e) => {
    const tap = taps.get(e.pointerId);
    if (!tap) return;
    clearTimeout(tap.timer);
    if (!tap.done) act(tap.el);
    taps.delete(e.pointerId);
  });
  box.addEventListener('pointercancel', cancel);
  box.addEventListener('click', (e) => {   // the keyboard (a pointer played it on press)
    const el = e.detail === 0 && target(e);
    if (el) act(el);
  });
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
  strumFrets(ch.shape.frets);
}
function strumFrets(frets) {
  const inst = instrument();
  if (inst.piano) {   // the keys together, rolled a little, low to high
    frets.forEach((k, i) => {
      playNote(PIANO_LOW + k, i * ROLL_GAP, 0.6);   // (louder than a strum's notes: a piano chord has fewer, as loud in all)
      flashKey(k, i * ROLL_GAP);
    });
    return;
  }
  const c = capo();
  let i = 0;
  frets.forEach((f, s) => {
    if (f < 0) return;
    const delay = i++ * STRUM_GAP;
    playNote(inst.strings[s] + c + f, delay, 0.45);
    flashCell(s, shapeNeckFret(inst, s, f, c), delay);
  });
}

/* ==========================================================================
   Name a chord: notes placed on the neck are named. While it is on, a tap
   on the neck places that string's note there (the same fret again lifts
   it; the open string, or a banjo's drone, rings or is muted) and nothing
   else changes; what cannot be used meanwhile is hidden (the chord list, the
   shape bar, the tabs and panels, the instrument, tuning and capo, Share).
   It starts from the shape on screen, or from nothing. Placing a note sounds
   it and lights it up (lifting or muting one does not), unless taps are
   muted (a setting); Play strums them all.
   The notes get a name for each of them that can be the root, the most
   likely first: the arrows step through them, changing only the name (and
   the intervals marked on the notes), never the notes.
   Two ways out, both back to the neck as usual: Select puts the chord named
   on the neck with this very shape (kept as a custom shape when the shape
   finder does not list it), in the inversion of its bass note; Cancel (or
   Escape) leaves everything as it was, the chord on screen or none.
   The naming works on the notes, not the frets (see nameChord).
   ========================================================================== */
let naming = null;   // { frets: per string, -1 muted; pick: the name picked (0: the most likely) }
// The names of the notes placed, one per root, the most likely first
function namerReadings() {
  const sc = currentScale();
  return nameChord(shapeMidis(naming.frets), sc && sc.def.steps.length < 12 ? sc.set : null);
}
const ORDINALS = { 5: '5th', 9: '9th' };
const readingSymbol = (r) => chordName(r.root, r.def, r.bassIndex);
// The notes placed, drawn on the neck like a chord's shape: with the
// intervals of the name picked (none: no name yet)
function namerChord() {
  const r = namerReadings()[naming.pick];
  const tones = r ? chordTones(r.root, r.def) : [];
  return { naming: true, shape: { frets: naming.frets }, degOfPc: new Map(tones.map((t) => [t.pc, t.deg])),
    spell: r ? chordSpelling(r.root, r.def) : { names: new Map() } };
}
function openNamer() {
  if (naming) return;
  const ch = currentChord();
  naming = { frets: ch && ch.shape ? ch.shape.frets.slice() : instrument().strings.map(() => -1), pick: 0 };
  stopGroup();
  stopScale();
  ui.tab = null;   // (phones: the sheet closes)
  document.body.classList.add('naming');
  render();
  els.namer.focus({ preventScroll: true });   // the keyboard carries on in the bar (its button is hidden now)
}
function closeNamer(select) {
  if (!naming) return;
  const reading = select ? namerReadings()[naming.pick] : null;
  if (select && !reading) return;
  const text = fretsText(naming.frets);
  const focused = els.namer.contains(document.activeElement);
  naming = null;
  document.body.classList.remove('naming');
  if (reading) {
    const { root, def } = reading;
    if (!state.chord.on || state.chord.type !== def.id) resetInversion();   // as a chord picked from the menus
    state.chord = { on: true, root, type: def.id };
    // Its bass note's inversion ("Any bass note" stays so)
    if (state.inversion[state.instrument] !== 'any') state.inversion[state.instrument] = String(reading.bassIndex);
    if (!chordShapes(root, def, inversionFor(def)).some((x) => fretsText(x.frets) === text)) keepDrawn(root, def.id, text);
    const at = currentChord().shapes.findIndex((x) => fretsText(x.frets) === text);
    state.shape = at < 0 ? null : at;
    menuPick = 'other';   // a new chip for it, or its chip first, remembering this shape (trackChord)
    ui.reveal = true;
  }
  render();
  // The keyboard goes back to where it came from (the bar is hidden now):
  // the mode's button, or on phones, where it sits in the closed sheet, the Chord tab
  if (focused) (isWide() ? els.namerOpen : document.querySelector('.tab[data-tab="chord"]')).focus({ preventScroll: true });
}
// A tap on the neck while naming
function namerTap(cell) {
  const inst = instrument();
  if (cell.dataset.key !== undefined) {   // a piano key: in, or out again
    const k = Number(cell.dataset.key);
    const on = !naming.frets.includes(k);
    naming.frets = on ? [...naming.frets, k].sort((a, b) => a - b) : naming.frets.filter((x) => x !== k);
    naming.pick = 0;
    const sound = on && !state.muteTaps;
    if (sound) playNote(PIANO_LOW + k);
    render();
    if (sound) flashKey(k);
    return;
  }
  const s = Number(cell.dataset.s);
  const f = Number(cell.dataset.f);
  const frets = naming.frets;
  let placed;
  if (f === startFret(inst, s) + capo()) placed = frets[s] = frets[s] === 0 ? -1 : 0;   // open: rings, or is muted
  else if (startFret(inst, s)) return;   // a banjo's drone is never fretted in a chord
  else placed = frets[s] = frets[s] === f - capo() ? -1 : f - capo();
  naming.pick = 0;
  const sound = placed >= 0 && !state.muteTaps;
  if (sound) playNote(fretPitch(inst, s, f));
  render();
  if (sound) flashCell(s, f);
}
function namerStep(step) {
  const n = namerReadings().length;
  if (n < 2) return;
  naming.pick = (naming.pick + step + n) % n;
  render();
}
function namerClear() {
  naming.frets = instrument().piano ? [] : naming.frets.map(() => -1);
  naming.pick = 0;
  render();
}
function namerPlay() {
  if (naming.frets.some((f) => f >= 0)) strumFrets(naming.frets);
}
function renderNamer() {
  const readings = namerReadings();
  naming.pick = Math.min(naming.pick, Math.max(0, readings.length - 1));
  const r = readings[naming.pick] || null;
  const notes = shapeMidis(naming.frets);
  els.namerSelect.disabled = !r;
  els.namerPlay.disabled = els.namerClear.disabled = !notes.length;
  els.namerPrev.disabled = els.namerNext.disabled = readings.length < 2;
  els.namerMute.setAttribute('aria-pressed', String(Boolean(state.muteTaps)));
  /* What the name (its symbol, the bass after a slash: "C/E") means in
     words ("C major, 1st inversion", as the chord panel says it; some run
     long): on phones on its own line above, the whole width; on wide
     screens under its number, beside the name. Phones, beside the name:
     its number ("Name 1/3", with more than one) over the shape's frets
     ("x32010", the keys on a piano), as the shape stepper's (wide screens
     have the neck right there), fitted as the steppers' (fitInfo). */
  const wide = isWide();
  let caption = '';
  if (r) {
    const spell = chordSpelling(r.root, r.def);
    const missing = r.missing.length ? `, no ${r.missing.map((d) => ORDINALS[d]).join(' or ')}` : '';
    const inverted = r.bassIndex ? `, ${INVERSION_NAMES[r.bassIndex].toLowerCase()}` : '';
    const meaning = `${noteText(spell.root)} ${r.def.name.toLowerCase()}${inverted}${missing}`;
    const count = readings.length > 1 ? `Name ${naming.pick + 1}/${readings.length}` : '';
    els.namerSymbol.innerHTML = tx(readingSymbol(r));
    els.namerSymbol.title = readingSymbol(r);
    const frets = shapeShort({ piano: Boolean(instrument().piano), frets: naming.frets });
    const main = wide ? meaning : frets;
    const counts = readings.length > 1 ? fitsAttr([count, `${naming.pick + 1}/${readings.length}`]) : '';
    els.namerText.innerHTML = (count ? `<span class="dock-count" ${counts}>${esc(count)}</span>` : '')
      + `<span class="dock-main namer-main${wide || instrument().piano ? '' : ' mono'}" title="${esc(wide ? meaning : `Shape: ${frets}`)}">${esc(main)}</span>`;
    caption = wide ? '' : meaning;
  } else {
    els.namerSymbol.innerHTML = '';
    els.namerSymbol.title = '';
    const msg = notes.length ? 'Add a different note' : `Tap the ${instrument().piano ? 'keys' : 'neck'} to place notes`;
    els.namerText.innerHTML = `<span class="dock-msg">${msg}</span>`;
  }
  els.namerCaption.textContent = caption;
  els.namerCaption.title = caption;
  if (!wide) fitText(els.namerCaption, 11);
  fitInfo(els.namerSymbol.parentElement);
}

/* Play the group shown, low to high, lighting each note on the neck. As
   the scale's Play: pressing again (or Space) while it plays stops it, its
   button a Stop meanwhile; picking another group, scale... stops it too. */
const GROUP_GAP = 0.2;   // seconds between notes
let groupRun = null;     // { sources, timers }
function playGroup() {
  const g = ui.groups[ui.group];
  const sc = currentScale();
  if (groupRun) { stopGroup(); return; }
  if (!g || !sc) return;
  stopScale();
  const inst = instrument();
  const notes = [];
  for (const { s, a, b } of g.bars) {
    for (let f = a; f <= b; f++) if (sc.set.has(mod12(fretPitch(inst, s, f)))) notes.push({ s, f, midi: fretPitch(inst, s, f) });
  }
  notes.sort((x, y) => x.midi - y.midi);
  groupRun = { key: groupKey(g, sc), sources: [], timers: [] };
  notes.forEach((x, i) => {
    groupRun.sources.push(playNote(x.midi, i * GROUP_GAP, 0.5));
    groupRun.timers.push(setTimeout(() => flashCell(x.s, x.f), i * GROUP_GAP * 1000));
  });
  // Done once the last note has started: it rings on, and Play is back
  groupRun.timers.push(setTimeout(() => { groupRun = null; renderGroupPlay(); }, (notes.length - 1) * GROUP_GAP * 1000 + 50));
  renderGroupPlay();
}
// The group as played: another scale, tuning, capo or group stops it (see draw)
const groupKey = (g, sc) => (g && sc ? [scaleKey(sc), g.bars.map((b) => `${b.s}:${b.a}-${b.b}`)].join('|') : '');
function stopGroup() {
  if (!groupRun) return;
  for (const src of groupRun.sources) { try { if (src) src.stop(); } catch { /* already over */ } }
  for (const t of groupRun.timers) clearTimeout(t);
  groupRun = null;
  renderGroupPlay();
}
// A group stepper's play button: Play, or Stop while the group plays
function showGroupPlay(bar) {
  const playing = Boolean(groupRun);
  bar.play.querySelector('.ico').outerHTML = playing ? STOP_ICON : PLAY_ICON;
  bar.play.querySelector('.strum-label').innerHTML = playStopLabel(playing);
  bar.play.setAttribute('aria-label', playing ? 'Stop the group' : 'Play the group');
  bar.play.title = bar.play.getAttribute('aria-label') + (keysOnGroups() ? ' (Space)' : '');
}
function renderGroupPlay() {
  if (!els.quickGroupBar.hidden) showGroupPlay(groupStepper());
  if (ui.dockMode === 'group' && !els.dockShapeBar.hidden) showGroupPlay(dockStepper());
}

/* Play the scale once, low to high (root to octave), from its lowest root
   you can play (above the capo), lighting each note in the Notes row. The
   last note rings out. Pressing again stops it; so does picking another
   scale. A note of the row can also be tapped to hear it. */
const SCALE_GAP = 0.3;   // seconds between notes
let scaleRun = null;     // { key, sources, timers }
function scalePitches(sc) {   // the Notes row's pitches, root to octave
  const low = instrument().piano ? 60 : Math.min(...instrument().strings) + capo();   // (the piano: from middle C up)
  const start = low + mod12(sc.root - low);
  return [...sc.def.steps.map((step) => start + step), start + 12];
}
function pingScaleNote(i) {
  ping(els.scaleNotes.querySelectorAll('.scale-note')[i]);
}
function playScale() {
  if (scaleRun) { stopScale(); return; }
  const sc = currentScale();
  if (!sc) return;
  stopGroup();
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
// A Play / Stop label: both words, one over the other, the other one unseen,
// so the button keeps one width either way (styles.css: .swap)
const playStopLabel = (playing) => `<span class="swap"><span${playing ? ' class="off"' : ''}>Play</span><span${playing ? '' : ' class="off"'}>Stop</span></span>`;
function renderPlayButton() {
  const playing = Boolean(scaleRun);
  els.scalePlay.innerHTML = `${playing ? STOP_ICON : PLAY_ICON}<span class="btn-label">${playStopLabel(playing)}</span>`;
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
const ui = { tab: null, shapeKey: null, groups: [], group: -1, groupAt: null, chordRoot: undefined };   // open dock tab (phones), last shape shown, scale groups
const els = {};
/* Text for a pill or circle, wrapped so its capital letters can be centred
   exactly (see .tx in styles.css) */
const tx = (s) => `<span class="tx">${esc(s)}</span>`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* A row redrawn from scratch drops the keyboard focus with its old buttons
   (the next Enter or Space would do nothing). The focus goes back to the
   same button of the new row, found by its data- attributes; when that one
   is gone or switched off (a string at the end of its range, a reset that
   is no longer needed), to the nearest button of the same item, after it
   first; else to the row's selected chip, or its first button. */
const FOCUS_ROWS = '#tuneList, #shapeList, #groupList, #recentList, #dockRecentList, #scaleTriads, #scaleNotes';
function keepFocus(redraw) {
  const el = document.activeElement;
  const row = el && el.closest ? el.closest(FOCUS_ROWS) : null;
  if (!row) { redraw(); return; }
  const key = [...el.attributes].filter((a) => a.name.startsWith('data-')).map((a) => `[${a.name}="${CSS.escape(a.value)}"]`).join('');
  const item = el.closest('li');
  const at = item ? [[...row.children].indexOf(item), [...item.children].indexOf(el)] : null;
  redraw();
  if (row.contains(document.activeElement)) return;   // not redrawn after all
  const usable = (b) => Boolean(b && b.matches('button:not(:disabled)'));
  let next = key ? row.querySelector(key) : null;
  if (!usable(next) && at && row.children[at[0]]) {
    const buttons = [...row.children[at[0]].children];
    next = buttons.slice(at[1]).find(usable) || buttons.slice(0, at[1]).reverse().find(usable);
  }
  if (!usable(next)) next = row.querySelector('button.selected:not(:disabled)') || row.querySelector('button:not(:disabled)');
  if (next) next.focus({ preventScroll: true });
}

function render() { keepFocus(draw); }
function draw() {
  // While no scale is shown, its root follows the chord's: picking a scale
  // type then gives the scale of the chord you are on (A minor pentatonic
  // over A, not C). A root picked for the scale itself stays until the
  // chord's root changes.
  if (!state.scale.on && state.chord.root !== ui.chordRoot) state.scale.root = state.chord.root;
  ui.chordRoot = state.chord.root;
  // A bass note the chord does not have (a 3rd inversion on a triad) goes
  // back to the instrument's default, as the Inversion menu says: kept as is,
  // the next 7th chord would come back in that old inversion (and links
  // would carry it)
  if (state.chord.on) state.inversion[state.instrument] = inversionFor(findChord(state.chord.type));
  const ch = currentChord();
  const sc = currentScale();
  if (ch && ch.shapes.length) state.shape = ch.index;
  trackChord();
  renderHeader();
  renderRecent();
  if (naming && !instrument().piano) {   // (a capo moved up meanwhile: notes past the end of the neck are lifted)
    const top = cappedInstrument().frets;
    naming.frets = naming.frets.map((f) => (f > top ? -1 : f));
  }
  renderNeck(naming ? namerChord() : ch, sc);
  warmUp(ch, sc);
  if (groupRun && groupRun.key !== groupKey(ui.groups[ui.group], sc)) stopGroup();   // what it was playing is gone
  const seen = noteFocus(ch, sc);   // (what was last acted on: the phone's stepper, the keys and the neck's scroll follow it)
  renderChordPanel(ch, sc);
  renderScalePanel(sc, ch);
  renderDock(ch, sc);
  renderFolds(ch, sc);
  saveState();
  clearLink();
  // Scroll the neck to what was last acted on (phones: the page up or down;
  // wide screens: the neck sideways), see revealFocus: the chord when its
  // shape changes (picked, stepped, a chip, an inversion...), the scale
  // group when one is picked or the scale changes. Not while naming: the
  // neck stays where the notes are being placed.
  if (naming) return;
  const { neckKey, chordKey, scaleKey, first, sameNeck } = seen;
  // The piano, as it comes on screen (opened on it, or picked): its chord's
  // shape in view, or else middle C (a keyboard is long, and starts far down)
  const pianoNow = instrument().piano && ui.shownInst !== state.instrument;
  ui.shownInst = state.instrument;
  if (pianoNow) revealFocus(first ? 'auto' : 'smooth');
  // (opening the page: only when what it shows is out of view, as a high
  // shape from a link, so the page starts where it is otherwise)
  else if (first) requestAnimationFrame(() => { if (!focusInView()) revealFocus('auto'); });
  else if (ui.reveal || ui.revealGroup || !sameNeck || (chordKey && chordKey !== ui.chordKey) || (scaleKey && scaleKey !== ui.scaleKey)) revealFocus();
  ui.neckKey = neckKey;
  ui.chordKey = chordKey;
  ui.scaleKey = scaleKey;
  ui.reveal = false;
  ui.revealGroup = false;
}

/* What was last acted on (ui.focus): the chord when its shape changes
   (picked, stepped, a chip, an inversion...: ui.reveal, or its shape and
   name, on the same neck), the scale group when one is picked
   (ui.revealGroup) or the scale changes with its groups shown (Groups
   switched on too); opening a panel on phones too (openTab). */
function noteFocus(ch, sc) {
  const neckKey = [state.instrument, instrument().strings, capo()].join('|');
  const chordKey = ch && ch.shape ? [ch.symbol, tabOf(ch.shape)].join('|') : null;
  const scaleKey = sc && ui.groups.length ? [sc.root, sc.def.id].join('|') : null;   // (with its groups shown)
  const first = ui.neckKey === undefined;
  const sameNeck = neckKey === ui.neckKey;
  if (!naming) {
    if (ui.reveal || (sameNeck && chordKey && chordKey !== ui.chordKey)) ui.focus = 'chord';
    if (ui.revealGroup || (sameNeck && scaleKey && scaleKey !== ui.scaleKey)) ui.focus = 'group';
  }
  return { neckKey, chordKey, scaleKey, first, sameNeck };
}
/* What the arrow keys step and Space plays: what was last acted on (see
   noteFocus), the chord's shapes or the scale's groups (Groups on); the one
   there is when the other is not. As the phone's one stepper (renderDock). */
function keysOnGroups(ch = currentChord()) {
  if (!ui.groups.length) return false;
  return !ch || ui.focus === 'group';
}
/* What the neck scrolls to: what was last acted on (ui.focus), the chord's
   shape or the scale group, and only that one; when it is not on the neck,
   the other; on a piano with neither, middle C. */
function focusNotes() {
  const chord = [...els.neck.querySelectorAll('.cell:not(.strip-cell) .note.chord, .key .note.chord')];
  const g = ui.groups[ui.group];
  const group = g ? groupNotes(g) : [];
  if (ui.focus === 'group' && group.length) return group;
  if (chord.length) return chord;
  if (group.length) return group;
  return instrument().piano ? [els.neck.querySelector(`.key[data-key="${60 - PIANO_LOW}"]`)].filter(Boolean) : [];
}
function revealFocus(behavior = 'smooth') {
  const notes = focusNotes();
  if (notes.length) revealShape(notes, behavior);
}
// Whether it is all in the part of the neck you can see
function focusInView() {
  // (open strings: shown at the edge by the strip, wherever the neck is)
  const notes = focusNotes().filter((n) => { const cell = n.closest('.cell'); return !cell || Number(cell.dataset.f) > capo(); });
  if (!notes.length) return true;
  const rects = notes.map((n) => n.getBoundingClientRect());
  const strip = els.neck.querySelector('.neck-strip');
  if (isWide()) {
    const box = els.neck.closest('.neck-scroll').getBoundingClientRect();
    const lefty = state.leftHanded;
    const held = strip ? strip.offsetWidth : 0;
    return rects.every((r) => r.left >= box.left + (lefty ? 0 : held) - 1 && r.right <= box.right - (lefty ? held : 0) + 1);
  }
  const cover = (els.sheet.classList.contains('open') ? els.sheet : els.dockBar).getBoundingClientRect().top;
  return rects.every((r) => r.top >= (strip ? strip.offsetHeight : 0) - 1 && r.bottom <= cover + 1);
}

/* The phone turned (or the window resized past the layout's edge): the
   page starts over in its new layout, so what was last acted on is brought
   back into view (revealFocus), or else the neck. */
function refocus() {
  const panel = els.neck.closest('.neck-panel');
  const toPanel = () => window.scrollTo({ top: panel.getBoundingClientRect().top + window.scrollY - parseFloat(getComputedStyle(panel).marginTop), behavior: 'auto' });
  if (isWide()) toPanel();   // (the neck in view; then sideways, below)
  if (focusNotes().length) revealFocus('auto');
  else if (!isWide()) toPanel();
  placeStrip();   // (the open strings where the neck now sits, at once)
}

// A scale group's notes on the neck: each string's first and last
function groupNotes(g) {
  return g.bars.flatMap(({ s, a, b }) => [a, b].map((f) => els.neck.querySelector(`.cell[data-s="${s}"][data-f="${f}"]:not(.strip-cell) .note`))).filter(Boolean);
}

/* The chord list's chips, then (after a thin line) the recent chords',
   dashed, in the dock (phones), the quick bar (wide screens) and the chord
   panel. The chord on screen's chip is lit: a list chip has an × to take
   it out, a recent chip a + to put it in the list. */
const X_CHIP_ICON = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M7 7l10 10M17 7L7 17"/></svg>';
const TRAIL_EDGE = '<svg class="trail-edge" aria-hidden="true"><rect width="100%" height="100%" rx="15" ry="15"/></svg>';   // (rx: half of --recent-h)
const TRAIL_CHIP_EDGE = TRAIL_EDGE.replace(/r([xy])="15"/g, 'r$1="11"');   // (a popup's chip, 22px high)
const PLUS_CHIP_ICON = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
function renderRecent() {
  const show = state.list.length + state.recent.length > 0;   // (some recent chord is always shown when any is kept)
  els.dockRecent.hidden = !show;
  els.recentLine.hidden = !show;
  updateQuickBar();
  if (!show) { els.dockRecentList.innerHTML = els.recentList.innerHTML = ''; ui.chipKey = ''; return; }
  const full = state.list.length >= LIST_MAX;
  const shown = recentEntry();
  const chip = (r, i, pinned) => {
    const def = findChord(r.type);
    const spell = chordSpelling(r.root, def);
    const on = r === shown;
    const name = entrySymbol(r);
    const cls = `${pinned ? 'pinned' : 'trail'}${on ? ' on' : ''}${!pinned && full ? ' bare' : ''}`;
    const tap = `<button type="button" class="chip recent${on ? ' selected' : ''}" ${pinned ? 'data-i' : 'data-r'}="${i}" aria-pressed="${on}" ` +
      `title="${esc(`${noteText(spell.root)} ${def.name.toLowerCase()}${r.bass ? `, ${INVERSION_NAMES[r.bass].toLowerCase()}` : ''}${pinned ? '' : ', recent'}`)}"><span class="tx">${esc(name)}</span></button>`;
    // A recent chip: its dashed edge (drawn, for dashes longer than a
    // browser's dashed line) and its + (none while the list is full)
    const side = pinned
      ? (on ? `<button type="button" class="recent-remove" data-remove="${i}" aria-label="Remove ${esc(name)} from the chord list" ` +
        `title="Remove ${esc(name)} from the chord list">${X_CHIP_ICON}</button>` : '')
      : (full ? '' : `<button type="button" class="recent-pin" data-pin="${i}" aria-label="Add ${esc(name)} to the chord list" ` +
        `title="Add ${esc(name)} to the chord list">${PLUS_CHIP_ICON}</button>`);
    return `<li class="${cls}">${pinned ? '' : TRAIL_EDGE}${tap}${side}</li>`;
  };
  const recent = shownRecent();
  const html = state.list.map((r, i) => chip(r, i, true)).join('')
    + (state.list.length && recent.length ? '<li class="recent-sep" aria-hidden="true"></li>' : '')
    + recent.map((r) => chip(r, state.recent.indexOf(r), false)).join('');
  els.dockRecentList.innerHTML = html;
  els.recentList.innerHTML = html;
  scrollHint(els.dockRecentList);
  scrollHint(els.recentList);
  fitDashes(els.dockRecentList);
  fitDashes(els.recentList);
  // When the chips change (one picked, added, edited or removed), scroll the
  // row so the selected one shows whole
  const chipKey = html;
  if (chipKey !== ui.chipKey && ui.keepRow) ui.chipKey = chipKey;   // a chip moved: the row stays where it is
  ui.keepRow = false;
  if (chipKey !== ui.chipKey) {
    const smooth = ui.chipKey !== undefined;
    ui.chipKey = chipKey;
    requestAnimationFrame(() => { chipInView(els.dockRecentList, smooth); chipInView(els.recentList, smooth); });
  }
}
/* A recent chip's dashes: about 6px with 4px gaps, stretched a little so a
   whole number of them goes round the edge (else the one where the edge
   closes comes out shorter). A row out of sight is fitted when it shows. */
function fitDashes(row, chips = 'li.trail') {
  for (const li of row.querySelectorAll(chips)) {
    const rect = li.querySelector('.trail-edge rect');
    let edge = 0;
    try { edge = li.offsetWidth ? rect.getTotalLength() : 0; } catch { edge = 0; }   // (none while out of sight)
    if (!edge) continue;
    const step = edge / Math.max(1, Math.round(edge / 10));
    li.style.setProperty('--dash', `${(step * 0.6).toFixed(3)} ${(step * 0.4).toFixed(3)}`);
  }
}
/* The thin bar under a row of recent chords: shown when the chips do not
   all fit, its thumb as long as the part in view and where it is */
function scrollHint(row) {
  const box = row.parentElement;
  if (!box.querySelector('.scroll-hint')) return;   // (the chord panel's list: the site's own scrollbar)
  const max = row.scrollWidth - row.clientWidth;
  const scrolls = max > 1;
  box.classList.toggle('scrolls', scrolls);
  if (!scrolls) return;
  const track = box.clientWidth;
  const thumb = Math.max(24, (track * row.clientWidth) / row.scrollWidth);
  box.style.setProperty('--thumb', `${thumb}px`);
  box.style.setProperty('--at', `${(track - thumb) * Math.min(1, Math.max(0, row.scrollLeft / max))}px`);
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
   still shows that edge. The same for a scale group (see revealFocus). */
function revealShape(notes = [...els.neck.querySelectorAll('.cell:not(.strip-cell) .note.chord, .key .note.chord')], behavior = 'smooth') {
  if (!notes.length) return;
  if (isWide()) { revealAcross(notes, behavior); return; }
  const rects = notes.map((n) => n.getBoundingClientRect());
  const top = Math.min(...rects.map((r) => r.top));
  const bottom = Math.max(...rects.map((r) => r.bottom));
  const cover = els.sheet.classList.contains('open') ? els.sheet : els.dockBar;
  const viewBottom = cover.getBoundingClientRect().top;
  // The view starts under the strip (held at the top once the nut is past)
  const strip = els.neck.querySelector('.neck-strip');
  const viewTop = strip ? strip.offsetHeight : 0;
  // Centre the shape; one too tall to fit starts at the top of the view
  const delta = bottom - top > viewBottom - viewTop - 24 ? top - viewTop - 24 : (top + bottom) / 2 - (viewTop + viewBottom) / 2;
  // Highest: the neck panel with its margin, or with a capo, its fret (the
  // frets behind it cannot be played) with more room, part of the fret
  // behind it showing and the interval badges clear of the edge
  const panel = els.neck.closest('.neck-panel');
  const capoCell = capo() ? els.neck.querySelector(`.cell[data-f="${capo()}"]`) : null;
  const margin = capoCell ? 20 : parseFloat(getComputedStyle(panel).marginTop);
  const edge = (capoCell || panel).getBoundingClientRect().top;
  window.scrollTo({ top: Math.max(edge + window.scrollY - margin, window.scrollY + delta), behavior });
}

/* Wide screens: the same rule sideways, when the neck is wider than its
   panel: the shape (or group) is centred in the part of the neck you can
   see, as far as the scroll goes; one too wide to fit starts at its end
   nearest the nut. With a capo, the neck never scrolls past the capo's
   fret (the frets behind it cannot be played). */
function revealAcross(notes, behavior = 'smooth') {
  const box = els.neck.closest('.neck-scroll');
  if (box.scrollWidth <= box.clientWidth + 1) return;
  const frame = box.getBoundingClientRect();
  const rects = notes.map((n) => n.getBoundingClientRect());
  const left = Math.min(...rects.map((r) => r.left));
  const right = Math.max(...rects.map((r) => r.right));
  const pad = 24;
  const lefty = box.classList.contains('lefty');   // the nut on the right
  // The view starts after the strip (held at the nut's end once it is past)
  const strip = els.neck.querySelector('.neck-strip');
  const held = strip ? strip.offsetWidth : 0;
  const view = { left: frame.left + (lefty ? 0 : held), right: frame.right - (lefty ? held : 0) };
  view.width = view.right - view.left;
  let delta = right - left > view.width - 2 * pad
    ? (lefty ? right - (view.right - pad) : left - (view.left + pad))
    : (left + right) / 2 - (view.left + view.right) / 2;
  const capoCell = capo() ? els.neck.querySelector(`.cell[data-f="${capo()}"]`) : null;
  if (capoCell) {   // the frets behind the capo stay out of view, as on phones (the capo's fret at the edge, with some room)
    const c = capoCell.getBoundingClientRect();
    delta = lefty ? Math.min(delta, c.right - (frame.right - 20)) : Math.max(delta, c.left - (frame.left + 20));
  }
  if (Math.abs(delta) > 1) box.scrollBy({ left: delta, behavior });
}

/* Neck settings live in the neck's header on wide screens and in the dock's
   "Setup" tab on phones; the instrument menu in the neck's header, or above
   the neck on phones. In index.html everything starts in its wide-screen
   place, which is right before this runs on both layouts: on phones those
   places are hidden or in the closed sheet (only the instrument menu shows
   on phones before that: its slot keeps its room, see .inst-slot). */
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
  // The phone dock's chord list and shape bar: in the quick bar under the
  // neck on wide screens, before the groups' bar (which only exists there)
  if (wide) {
    put(els.chordSwitches, els.chordHead);
    put(els.scaleSwitches, els.scaleHead);
    put(els.scalePlay, els.scaleBar, els.scaleClear);
    put(els.dockRecent, els.quickInner, els.quickGroupBar);
    put(els.dockShapeBar, els.quickInner, els.quickGroupBar);
    put(els.namer, els.neckPanel);   // Name a chord: in the quick bar's place
  } else {
    put(els.chordSwitches, els.chordBar, els.chordStrum);
    put(els.scaleSwitches, els.scaleBar, els.scaleClear);
    put(els.scalePlay, els.notesLine);
    put(els.dockRecent, els.dockBar, els.dockTabs);
    put(els.dockShapeBar, els.dockBar, els.dockTabs);
    put(els.namer, els.dockBar, els.dockTabs);
  }
}

/* Picker popup: tiles to tap instead of a long dropdown list. `groups` is
   [{ label, items: [{ value, label, sub }] }]; the chosen value goes to onPick.
   An optional `note` is a line of help under the tiles: the legend of the
   teal dot on the tiles that fit the scale. When no tile has the dot, it
   says so instead (`noteNone`), without a dot. */
/* Custom tuning: a popup with each string laid out as on the neck (phones:
   columns, the lowest string on the left, mirrored left-handed; wide
   screens: rows, the highest string on top), each a semitone up or down at
   a time, within two octaves of standard. A note tuned away from standard is
   in the accent colour, and its string number turns into a button that puts
   that string back; tapping a note plays it. Landing on a preset (Drop
   D...) names it. Nothing changes on the neck (nor in what is saved) until
   Done, which puts the tuning on the neck (a preset's notes: that preset);
   Cancel (Escape, a tap outside) leaves the one you had. It starts from the
   custom tuning, or the one on the neck. */
let tune = null;   // { draft: open string pitches }
function openTuneEdit() {
  tune = { draft: (state.custom[state.instrument] || instrument().strings).slice() };
  tuneSet(tune.draft);
  if (els.tuneEdit.showModal) els.tuneEdit.showModal(); else els.tuneEdit.setAttribute('open', '');
}
function tuneSet(strings) {
  tune.draft = strings;
  keepFocus(renderTuneEdit);   // the + or − just used keeps the focus
}
// Done: the tuning on the neck
function applyTune(strings) {
  const id = state.instrument;
  const preset = matchTuning(id, strings);
  changeNeck(() => {
    if (preset) {   // a preset's notes (or a saved tuning's): that one
      state.tuning[id] = preset.id;
      // standard (Reset, or tuned back to it): the custom tuning goes back to
      // standard too, nothing kept; another one: it stays as it was
      if (preset.id === tuningsOf(id)[0].id) delete state.custom[id];
    } else {
      state.tuning[id] = 'custom';
      state.custom[id] = strings;
    }
  });
  render();
}
function tuneStep(s, step) {
  const base = tuningsOf(state.instrument)[0].strings;
  const m = tune.draft[s] + step;
  if (Math.abs(m - base[s]) > CUSTOM_RANGE) return;
  const strings = tune.draft.slice();
  strings[s] = m;
  tuneSet(strings);
}
const RESET_ICON = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 4.5v4h4"/></svg>';
/* The strings in neck order, laid out by styles.css for the screen's width
   (as the neck itself): each with its number (a reset button when it is
   tuned away from standard), + and −, and its note (tap: hear it). At the
   end of a string's range its + or − is greyed out but stays a button
   (aria-disabled), so it keeps the keyboard focus: one more press does
   nothing (tuneStep), rather than land on another button. */
function renderTuneEdit() {
  const id = state.instrument;
  const base = tuningsOf(id)[0].strings;
  const strings = tune.draft;
  const preset = matchTuning(id, strings);
  els.tuneName.textContent = preset ? preset.name : 'Custom';
  els.tuneName.title = preset && preset.saved ? preset.name : '';
  els.tuneName.classList.toggle('custom', !preset);
  // Save: for a tuning not yet in the menu (a preset's or a saved one's
  // notes are already there)
  els.tuneSave.disabled = Boolean(preset);
  if (preset && !els.tuneNaming.hidden) endNaming();
  else updateNaming();
  els.tuneList.classList.toggle('lefty', state.leftHanded);
  els.tuneList.style.setProperty('--n', strings.length);
  const inst = findInstrument(id);
  els.tuneList.innerHTML = strings.map((m, s) => {
    const n = strings.length - s;   // string 1: the highest
    const off = m - base[s];
    const name = stringNote(inst, s, noteText(plainNote(m, state.flats)));   // (a drone: g4)
    const oct = Math.floor(m / 12) - 1;
    const num = off
      ? `<button type="button" class="tune-num reset" data-reset="${s}" title="String ${n} back to standard (${stringNote(inst, s, noteText(plainNote(base[s], state.flats)))})" aria-label="String ${n} back to standard">${RESET_ICON}${n}</button>`
      : `<span class="tune-num">${n}</span>`;
    return `<li class="tune-string">${num}` +
      `<button type="button" class="tune-step up" data-string="${s}" data-step="1" aria-label="String ${n} up a semitone"${off >= CUSTOM_RANGE ? ' aria-disabled="true"' : ''}>+</button>` +
      `<button type="button" class="tune-note${off ? ' changed' : ''}" data-play="${m}" aria-label="String ${n}: ${name}${oct}, play it">${name}<span class="tune-oct">${oct}</span></button>` +
      `<button type="button" class="tune-step down" data-string="${s}" data-step="-1" aria-label="String ${n} down a semitone"${off <= -CUSTOM_RANGE ? ' aria-disabled="true"' : ''}>−</button></li>`;
  }).join('');
  els.tuneReset.disabled = strings.every((m, i) => m === base[i]);
}
/* Save: the buttons give way to a field for its name (empty: Save stays
   off); Save keeps the tuning under that name and picks it, Cancel goes
   back to the buttons */
function startNaming() {
  if (!tune || els.tuneSave.disabled) return;
  els.tuneSaveName.value = '';
  els.tuneActions.hidden = true;
  els.tuneNaming.hidden = false;
  updateNaming();
  els.tuneSaveName.focus();
}
function endNaming() {
  const back = !els.tuneNaming.hidden && els.tuneNaming.contains(document.activeElement);
  els.tuneNaming.hidden = true;
  els.tuneActions.hidden = false;
  if (back) (els.tuneSave.disabled ? els.tuneDone : els.tuneSave).focus();
}
function updateNaming() {
  els.tuneNameSave.disabled = !cleanName(els.tuneSaveName.value) || els.tuneSave.disabled;
}
function saveTune() {
  const name = cleanName(els.tuneSaveName.value);
  if (!tune || !name || matchTuning(state.instrument, tune.draft)) return;
  const id = state.instrument;
  const strings = tune.draft.slice();
  (state.saved[id] = state.saved[id] || []).push({ name, strings });
  // Kept by its name now (and on the neck): the custom tuning goes back to standard
  changeNeck(() => {
    state.tuning[id] = savedId(strings);
    delete state.custom[id];
  });
  tune = null;
  closeTuneEdit(false);
  render();
}

/* The tuning menu: the presets, then the Custom section: Custom (opens the
   Tuning popup: tune each string, save it) and the saved tunings, picked
   like presets, each with its bookmark and an × to delete it */
function openTuningMenu() {
  const own = state.custom[state.instrument];
  openPicker({
    title: 'Tuning', value: instrument().tuning.id,
    groups: [
      { items: tuningsOf(state.instrument).map((t) => ({ value: t.id, label: t.name, sub: tuningNotes(t.strings, Boolean(t.flats), state.instrument) })) },
      { label: 'Custom', items: [
        { value: 'custom', label: 'Custom', icon: EDIT_ICON, cls: 'custom-pick', title: 'Tune each string',
          sub: own ? tuningNotes(own, state.flats, state.instrument) : 'Tune each string' },
        ...savedTunings(state.instrument).map((t) => ({ value: t.id, label: t.name, icon: BOOKMARK_ICON, title: t.name,
          sub: tuningNotes(t.strings, state.flats, state.instrument), remove: `Delete ${t.name}` })),
      ] },
    ],
    onPick: (v) => {
      if (v === 'custom') { openTuneEdit(); return; }
      changeNeck(() => { state.tuning[state.instrument] = v; });
      render();
    },
    onRemove: askDeleteTuning,
  });
}

/* Deleting a saved tuning (its × in the tuning menu): asked first, then
   gone for good. The neck, if it was in it, goes back to standard tuning. */
let deleting = null;   // the saved tuning's id
function askDeleteTuning(tuningId) {
  const t = savedTunings(state.instrument).find((x) => x.id === tuningId);
  if (!t) return;
  deleting = t.id;
  els.tuneDeleteName.textContent = t.name;
  els.tuneDeleteNotes.textContent = tuningNotes(t.strings, state.flats, state.instrument);
  if (els.tuneDelete.showModal) els.tuneDelete.showModal(); else els.tuneDelete.setAttribute('open', '');
  els.tuneDeleteCancel.focus();
}
function closeDeleteTuning() {
  deleting = null;
  if (els.tuneDelete.open) {
    if (els.tuneDelete.close) els.tuneDelete.close(); else els.tuneDelete.removeAttribute('open');
  }
}
function deleteTuning() {
  const id = state.instrument;
  const gone = deleting;
  closeDeleteTuning();
  if (!gone || !state.saved[id]) return;
  state.saved[id] = state.saved[id].filter((t) => savedId(t.strings) !== gone);
  if (!state.saved[id].length) delete state.saved[id];
  if (state.tuning[id] === gone) changeNeck(() => { state.tuning[id] = 'standard'; });
  render();
  if (els.picker.open) openTuningMenu();   // the menu, without it
}

// Done puts it on the neck; Cancel leaves what you had
function closeTuneEdit(keep) {
  const t = tune;
  tune = null;
  endNaming();
  if (els.tuneEdit.open) {
    if (els.tuneEdit.close) els.tuneEdit.close(); else els.tuneEdit.removeAttribute('open');
  }
  if (t && keep) applyTune(t.draft);
}

let pickerPick = null;
const X_ICON = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M7 7l10 10M17 7L7 17"/></svg>';
const BOOKMARK_ICON = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 4h11a1 1 0 0 1 1 1v15.2l-6.5-4.4-6.5 4.4V5a1 1 0 0 1 1-1z"/></svg>';
const EDIT_ICON = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 19.5h4l11-11-4-4-11 11v4z"/><path d="M14 6l4 4"/></svg>';
let pickerRemove = null;
function openPicker({ title, groups, value, layout = '', note = '', noteNone = '', onPick, onRemove = null }) {
  const dots = groups.some((g) => g.items.some((it) => it.cls === 'fits'));
  const legend = !note ? '' : dots || !noteNone ? `<p class="picker-note">${esc(note)}</p>` : `<p class="picker-note empty">${esc(noteNone)}</p>`;
  els.pickerTitle.textContent = title;
  els.pickerBody.innerHTML = groups.map((g) =>
    (g.label ? `<div class="label picker-label">${esc(g.label)}</div>` : '') +
    `<div class="picker-grid ${layout}">${g.items.map((it) => {
      const sel = String(it.value) === String(value);
      const cls = `pick${sel ? ' selected' : ''}${it.cls ? ` ${it.cls}` : ''}`;
      // An icon before the name (a saved tuning's bookmark), and an × next
      // to the tile to remove it (a separate button: not inside the tile)
      const tile = `<button type="button" class="${cls}" data-value="${esc(it.value)}" aria-pressed="${sel}"` +
        `${it.style ? ` style="${it.style}"` : ''}${it.title ? ` title="${esc(it.title)}"` : ''}>` +
        (it.icon ? `<span class="pick-name with-icon"><span class="pick-icon">${it.icon}</span><span class="pick-text">${esc(it.label)}</span></span>`
          : `<span class="pick-name">${esc(it.label)}</span>`) +
        `${it.tag ? `<span class="pick-tag">${tx(it.tag)}</span>` : ''}` +
        `${it.sub ? `<span class="pick-sub">${esc(it.sub)}</span>` : ''}</button>`;
      return it.remove ? `<div class="pick-wrap">${tile}<button type="button" class="pick-remove" data-remove="${esc(it.value)}" ` +
        `aria-label="${esc(it.remove)}" title="${esc(it.remove)}">${X_ICON}</button></div>` : tile;
    }).join('')}</div>`
  ).join('') + legend;
  pickerPick = onPick;
  pickerRemove = onRemove;
  const fresh = !els.picker.open;   // (else the same menu again, a tile removed: it stays where it was)
  const kept = els.pickerBody.scrollTop;
  if (fresh) { if (els.picker.showModal) els.picker.showModal(); else els.picker.setAttribute('open', ''); }
  peekPicker();
  const selected = els.pickerBody.querySelector('.pick.selected');
  if (selected) selected.focus({ preventScroll: true });
  const body = els.pickerBody;
  if (!fresh) body.scrollTop = kept;
  else if (selected) {
    // The current choice in the middle of a list that scrolls (as far as it goes)
    const scale = body.getBoundingClientRect().height / body.offsetHeight || 1;   // (the popup grows in as it opens)
    const at = (selected.getBoundingClientRect().top - body.getBoundingClientRect().top) / scale + body.scrollTop;
    body.scrollTop = at - (body.clientHeight - selected.offsetHeight) / 2;
  }
}
/* A list that scrolls ends partway through a tile, never just under a row
   of them: so it plainly goes on. Its height is cut, if need be, through
   the middle of the last tile that shows. */
function peekPicker() {
  const body = els.pickerBody;
  body.style.maxHeight = '';
  if (!els.picker.open || body.scrollHeight <= body.clientHeight + 1) return;
  const scale = body.getBoundingClientRect().height / body.offsetHeight || 1;
  const top = body.getBoundingClientRect().top;
  const seen = body.clientHeight;   // (the bottom edge, from the list's top)
  const tiles = [...body.querySelectorAll('.pick')].map((el) => {
    const r = el.getBoundingClientRect();
    const y = (r.top - top) / scale + body.scrollTop;
    return { y, h: r.height / scale };
  });
  if (tiles.some((t) => t.y < seen - t.h * 0.3 && t.y + t.h > seen + t.h * 0.3)) return;   // one is cut well: fine
  const last = tiles.filter((t) => t.y < seen - 24).pop();
  if (last) body.style.maxHeight = `${Math.round(last.y + last.h / 2)}px`;
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
const fitsNote = (sc) => (sc && sc.def.steps.length < 12 ? `Every note is in ${scaleInText(sc)}` : '');
/* With no chord (type "None"), any note of the scale can be the root */
const rootNote = (sc) => (sc && sc.def.steps.length < 12 ? `In ${scaleInText(sc)}` : '');
const inScale = (pc, sc) => Boolean(sc && sc.def.steps.length < 12 && sc.set.has(pc));

/* Shrink the text of a fixed-size box until it fits on one line (long chord
   symbols like C♯m(maj7)). Measured on a canvas, so it also works while the
   box is hidden (a closed sheet on phones). */
let measureCtx = null;
/* Words that may not fit their place: the first of their forms that does
   (the whole, then shorter ones: "Diminished 5th", "Dim. 5th"); none does:
   the shortest (in a smaller font first, given a min), cut with "…". The forms stay on it (data-fits), to fit
   them again when the room changes (a sheet opening, the window). */
const textWidth = (el) => {   // (its text's own width, not its box's: to the fraction of a pixel)
  const range = document.createRange();
  range.selectNodeContents(el);
  return range.getBoundingClientRect().width;
};
const textRoom = (el) => {   // (the width its text has, to the fraction of a pixel, as text-overflow sees it)
  const cs = getComputedStyle(el);
  return el.getBoundingClientRect().width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) -
    parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth);
};
function fitWords(el, forms = null, min = 0) {   // (min: past the shortest, a smaller font, no smaller than this, as fitText)
  if (forms) el.dataset.fits = JSON.stringify(forms);
  if (min) el.dataset.fitMin = min;
  const all = forms || JSON.parse(el.dataset.fits || '[]');
  el.style.fontSize = '';
  for (const f of all) {
    el.textContent = f;
    if (textWidth(el) <= textRoom(el) + 0.01) return;   // (not scrollWidth: whole pixels, a fraction too long would pass, and be cut)
  }
  if (el.dataset.fitMin) fitText(el, Number(el.dataset.fitMin));
}
const refitWords = (root = document) => root.querySelectorAll('[data-fits]').forEach((el) => fitWords(el));
const fitsAttr = (forms) => `data-fits="${esc(JSON.stringify([...new Set(forms)]))}"`;
// Shorter words for the long ones of chord and interval names
const SHORT_WORDS = [[/Half-diminished/g, 'Half-dim.'], [/Minor-major/g, 'Min-maj'], [/Diminished/g, 'Dim.'], [/Augmented/g, 'Aug.'],
  [/Dominant/g, 'Dom.'], [/Suspended/g, 'Sus.'], [/Perfect/g, 'Perf.'], [/Major/g, 'Maj.'], [/Minor/g, 'Min.'], [/ flat /g, ' ♭'], [/ sharp /g, ' ♯']];
const shortWords = (text) => SHORT_WORDS.reduce((t, [re, to]) => t.replace(re, to), text);

function fitText(el, min = 0) {   // (min: no smaller than this, the rest cut with "…" by styles.css)
  el.style.fontSize = '';
  const cs = getComputedStyle(el);
  const room = parseFloat(cs.width) - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const size = parseFloat(cs.fontSize);
  if (!(room > 0)) return;
  measureCtx = measureCtx || document.createElement('canvas').getContext('2d');
  measureCtx.font = `${cs.fontWeight} ${size}px ${cs.fontFamily}`;
  const width = measureCtx.measureText(el.textContent).width;
  if (width > room) el.style.fontSize = `${Math.max(min, Math.floor((size * room) / width))}px`;
}

/* The chord's name in its card: on one line, a smaller font where it does
   not fit, down to SYMBOL_SPLIT of its size; past that, on two lines where
   a name can break (before its brackets or its bass note, after a comma in
   its brackets: "B♭m7♭5" / "(add11,♭9,♭13)/F♭"), at that size, smaller
   again only if it must (to its width, or its height). The split that
   lets it be largest, the more natural ones first when nearly as large:
   the bass note under the chord (as written as a fraction), then the
   brackets on a line of their own, then after a comma. Two lines only
   where they let it be larger than one would. */
const SYMBOL_SPLIT = 0.65;
function fitSymbol(el, text, slashBass) {
  el.textContent = text;
  el.classList.remove('two');
  el.style.fontSize = '';
  const cs = getComputedStyle(el);
  const room = parseFloat(cs.width) - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const high = parseFloat(cs.height);
  const size = parseFloat(cs.fontSize);
  if (!(room > 0)) return;
  measureCtx = measureCtx || document.createElement('canvas').getContext('2d');
  measureCtx.font = `${cs.fontWeight} ${size}px ${cs.fontFamily}`;
  const width = (t) => measureCtx.measureText(t).width;   // (at the full size)
  const one = Math.min(size, (size * room) / width(text));
  if (one >= size * SYMBOL_SPLIT) { if (one < size) el.style.fontSize = `${Math.floor(one)}px`; return; }
  // Where it can break: before "(", before its bass note's "/" (not the one
  // of 6/9), after a "," in the brackets
  const breaks = [];   // [where, how natural: the larger, the more]
  for (let i = 1; i < text.length; i++) {
    if (slashBass && i === text.lastIndexOf('/')) breaks.push([i, 1 / 0.85]);
    else if (text[i] === '(') breaks.push([i, 1 / 0.9]);
    else if (text[i - 1] === ',') breaks.push([i, 1]);
  }
  let best = null;
  for (const [i, natural] of breaks) {
    const lines = [text.slice(0, i), text.slice(i)];
    const wide = Math.max(...lines.map(width));
    const fit = Math.min(size * SYMBOL_SPLIT, (size * room) / wide, high / (2 * 1.1));   // (two lines of 1.1 high)
    if (!best || fit * natural > best.fit * best.natural) best = { lines, fit, natural };
  }
  if (!best || best.fit <= one) { el.style.fontSize = `${Math.floor(one)}px`; return; }
  el.innerHTML = best.lines.map(esc).join('<br>');
  el.classList.add('two');
  el.style.fontSize = `${Math.floor(best.fit)}px`;
}

/* The middle of a stepper, or of Name a chord: the name (a pill) beside
   two lines, its number ("Shape 1/4, fret 11", "Name 1/3") over what it
   is (its frets, the notes, its meaning). The name whole, beside room for
   its number at the least ("1/4"): a smaller font first (no smaller than
   11px), cut short only past that; hidden on the smallest phones
   (styles.css: the Chord tab says it), its room then theirs. Its number,
   in what the name leaves, in its own size: the longest of its forms
   that fits ("Shape 1/4, fret 11", "Shape 1/4", "1/4"). The line under
   it, whole where it fits, a little smaller where not (no smaller than
   12px), then cut short. Fitted again when its room changes (a phone
   turned, the window resized: setupInfoFit). */
function fitInfo(info) {
  const pill = info.querySelector('.dock-symbol');
  const tab = info.querySelector('.dock-tab');
  if (!pill || !tab) return;
  const count = tab.querySelector('.dock-count[data-fits]');
  const main = tab.querySelector('.dock-main');
  pill.style.fontSize = '';
  tab.style.minWidth = '';
  if (main) main.style.fontSize = '';
  const forms = count ? JSON.parse(count.dataset.fits) : [];
  if (count) count.textContent = count.title = forms[0];
  if (!info.clientWidth) return;   // (hidden: fitted once shown)
  if (count) count.textContent = forms[forms.length - 1];
  const name = pill.querySelector('.tx');
  if (name && getComputedStyle(pill).display !== 'none') {
    const box = getComputedStyle(info);
    const ps = getComputedStyle(pill);
    const least = count ? Math.ceil(textWidth(count)) : 0;
    const room = info.clientWidth - parseFloat(box.paddingLeft) - parseFloat(box.paddingRight) - parseFloat(box.columnGap) -
      parseFloat(ps.paddingLeft) - parseFloat(ps.paddingRight) - least - 1;   // (the 1: rounding)
    const size = parseFloat(ps.fontSize);
    const width = textWidth(name);
    if (width > room) pill.style.fontSize = `${Math.max(11, Math.floor((size * room) / width))}px`;
    tab.style.minWidth = `${least}px`;   // (none without a number: the name first)
  }
  if (count) fitWords(count);
  if (main) fitText(main, 12);
}
/* The shape's note cards: room for a scrollbar under them only when they
   scroll (else the line under them, "Not in this shape", would sit far
   below). Again when the row's width changes (setupInfoFit). */
function fitNotesRow() {
  const row = els.chordTones;
  row.classList.remove('fits');
  row.classList.toggle('fits', row.scrollWidth <= row.clientWidth);
}
const infoWidths = new WeakMap();
function setupInfoFit() {
  if (!window.ResizeObserver) return;
  const watch = new ResizeObserver((entries) => {
    for (const { target } of entries) {
      if (infoWidths.get(target) === target.clientWidth) continue;   // (a height change: nothing to fit)
      infoWidths.set(target, target.clientWidth);
      if (target === els.chordTones) fitNotesRow();
      else fitInfo(target);
    }
  });
  for (const info of [els.dockShape, els.quickGroupInfo, els.namerSymbol.parentElement, els.chordTones]) watch.observe(info);
}

/* The steppers: a chord's shapes or a scale's groups, one at a time, with
   arrows, a button to hear it and one to show its panel.
   Phones: one, in the dock, for the chord's shapes; with no chord but a
   scale in groups, for the groups instead. Wide screens: in the quick bar
   under the neck, one for each, shown when there is something to step
   through (the chord's, as soon as a chord is picked). */
const DOCK_LABELS = {
  chord: ['Previous shape', 'Next shape', 'Show the chord panel', 'Strum', 'Strum'],
  keys: ['Previous shape', 'Next shape', 'Show the chord panel', 'Play the chord', 'Play'],   // (the piano's chord: played, not strummed)
  group: ['Previous group', 'Next group', 'Show the scale panel', 'Play the group', 'Play'],
};
function fillStepper(bar, mode, ch, sc) {
  const group = mode === 'group' ? ui.groups[ui.group] : null;
  bar.root.classList.toggle('groups', mode === 'group');
  const [prevLabel, nextLabel, openLabel, playLabel, playText] = DOCK_LABELS[mode === 'chord' && instrument().piano ? 'keys' : mode];
  bar.prev.setAttribute('aria-label', prevLabel);
  bar.next.setAttribute('aria-label', nextLabel);
  // (no shape: said first, the bar's words cut short or hidden on a narrow screen)
  const infoLabel = mode === 'chord' && ch && !ch.shape ? `No playable shape, ${openLabel.toLowerCase()}` : openLabel;
  bar.info.setAttribute('aria-label', infoLabel);
  bar.play.setAttribute('aria-label', playLabel);
  bar.play.querySelector('.strum-label').textContent = playText;
  if (mode !== 'group') bar.play.querySelector('.ico').outerHTML = PLAY_ICON;   // (the dock's, back from a group's Stop)
  if (group) {
    const [a, b] = groupFrets(group).map((f) => f - capo());   // counted from the capo
    bar.prev.disabled = bar.next.disabled = ui.groups.length < 2;
    bar.play.disabled = false;
    bar.symbol.innerHTML = tx(sc.rootName);
    const n = `${ui.group + 1}/${ui.groups.length}`;
    bar.tab.innerHTML = `<span class="dock-count" ${fitsAttr([`Group ${n}, ${groupPlace(group, capo())}`, `Group ${n}`, n])}></span>` +
      `<span class="dock-main dock-words">Frets ${a} to ${b}</span>`;
  } else {
    const many = Boolean(ch && ch.shapes.length > 1);
    bar.prev.disabled = bar.next.disabled = !many;
    bar.play.disabled = !ch || !ch.shape;
    bar.symbol.innerHTML = ch ? tx(ch.symbol) : '';   // (empty: hidden)
    if (!ch) bar.tab.innerHTML = '<span class="dock-msg">No chord selected</span>';
    else if (!ch.shape) bar.tab.innerHTML = '<span class="dock-msg">No playable shape</span>';   // words, not tab: the normal font
    else {
      const n = `${ch.index + 1}/${ch.shapes.length}`;
      bar.tab.innerHTML = `<span class="dock-count" ${fitsAttr([`Shape ${n}, ${shapeWhere(ch.shape)}${ch.shape.drawn ? ', custom' : ''}`, `Shape ${n}, ${shapeWhere(ch.shape)}`, `Shape ${n}`, n])}></span>` +
        `<span class="dock-main${ch.shape.piano ? ' dock-words' : ''}">${esc(shapeShort(ch.shape))}</span>`;   // (a piano's: notes, in words)
    }
  }
  // Their keys, as the panels' buttons say them: the arrows and Space step and
  // play what keysOnGroups says (the phone's one stepper: always its own)
  const keys = (mode === 'group') === keysOnGroups(ch);
  for (const [btn, key] of [[bar.prev, '←'], [bar.next, '→'], [bar.play, 'Space']]) btn.title = btn.getAttribute('aria-label') + (keys ? ` (${key})` : '');
  if (mode === 'group') showGroupPlay(bar);   // (Play, or Stop while it plays)
  bar.info.title = infoLabel;
  bar.symbol.title = ch && mode === 'chord' ? ch.symbol : '';
  fitInfo(bar.info);
}
const dockStepper = () => ({ root: els.dockShapeBar, prev: els.dockPrev, next: els.dockNext, info: els.dockShape, play: els.dockStrum, symbol: els.dockSymbol, tab: els.dockTab });
const groupStepper = () => ({ root: els.quickGroupBar, prev: els.quickGroupPrev, next: els.quickGroupNext, info: els.quickGroupInfo, play: els.quickGroupPlay, symbol: els.quickGroupSymbol, tab: els.quickGroupTab });
/* The quick bar shows when it has something in it */
function updateQuickBar() {
  els.quickBar.hidden = !isWide() || Boolean(naming) || (els.dockRecent.hidden && els.dockShapeBar.hidden && els.quickGroupBar.hidden);
}
function renderDock(ch, sc) {
  const group = sc ? ui.groups[ui.group] : null;
  if (isWide()) {
    ui.dockMode = 'chord';
    els.dockShapeBar.hidden = !ch;
    fillStepper(dockStepper(), 'chord', ch, sc);
    els.quickGroupBar.hidden = !group;
    if (group) fillStepper(groupStepper(), 'group', ch, sc);
  } else {
    // Phones: one stepper, for what was last acted on (see noteFocus): the
    // chord's shapes, or the scale's groups (Groups on); the one there is when
    // the other is not; none with neither (just the tabs)
    const mode = group && (!ch || ui.focus === 'group') ? 'group' : 'chord';
    ui.dockMode = mode;   // (its buttons step and play that)
    els.dockShapeBar.hidden = !ch && !group;
    fillStepper(dockStepper(), mode, ch, sc);
    els.quickGroupBar.hidden = true;
  }
  updateQuickBar();
  els.namer.hidden = !naming;
  if (naming) renderNamer();
  els.instrumentPicker.disabled = Boolean(naming);   // (shown as plain text: the neck the notes are on)

  els.tabChordValue.textContent = ch ? ch.symbol : 'None';
  els.tabScaleValue.textContent = sc ? `${sc.rootName} ${sc.def.short}` : 'None';
  fitText(els.tabChordValue, 10);   // (a long name: a smaller font first, then cut short)
  fitText(els.tabScaleValue, 10);
  // What the Setup sheet sets: the capo if there is one, else the tuning
  // (the instrument has its own menu above the neck)
  // (the piano: its keys, nothing to tune)
  const tuning = instrument().tuning;
  const piano = Boolean(instrument().piano);
  els.tabNeckValue.textContent = piano ? '88 keys' : capo() ? `Capo ${capo()}` : tuningName(instrument()) ? tuning.short || tuning.name : 'Standard';

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
    if (e.currentTarget !== els.sheetClose && els.sheetBody.scrollTop > 0) return;   // title only at the top
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
  // While dragging, the finger moves the sheet, nothing else (no scroll:
  // cancelled at its first move, as on the dock, setupDockTouch)
  for (const h of handles) h.addEventListener('touchmove', (e) => { if (startY !== null && e.cancelable) e.preventDefault(); }, { passive: false });
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

/* Phones: a swipe on the dock does not scroll the page under it; only
   something in the dock that can scroll that way does (a row of chips
   sideways, an open panel up and down), and only while it has room left
   that way. The first move of the touch is cancelled, so the browser never
   starts a scroll (touch-action: none, on the other hand, still starts an
   unseen glide, and the next tap is lost stopping it).
   What scrolls is what is under the finger's point, which near an edge is
   not always the touch's target (a finger is wider than a point: touching
   the bar right under an open panel can target the panel), so both must
   be in the same scroller, else the page under the dock would scroll. */
function setupDockTouch() {
  const dock = document.getElementById('dock');
  let x0 = 0;
  let y0 = 0;
  let under = null;   // what is under the finger's point
  const scroller = (el, sideways) => {
    for (; el && el !== dock.parentElement; el = el.parentElement) {
      const style = getComputedStyle(el);
      const overflow = sideways ? style.overflowX : style.overflowY;
      const room = sideways ? el.scrollWidth > el.clientWidth : el.scrollHeight > el.clientHeight;
      if (room && (overflow === 'auto' || overflow === 'scroll')) return el;
    }
    return null;
  };
  // Room left in the way the finger goes (a finger going up scrolls down)
  const hasRoom = (el, sideways, d) => {
    const at = sideways ? el.scrollLeft : el.scrollTop;
    const end = sideways ? el.scrollWidth - el.clientWidth : el.scrollHeight - el.clientHeight;
    const pos = Math.abs(at);   // (right to left: scrollLeft goes negative)
    return d < 0 ? pos < end - 1 : pos > 1;
  };
  dock.addEventListener('touchstart', (e) => {
    x0 = e.touches[0].clientX;
    y0 = e.touches[0].clientY;
    under = document.elementFromPoint(x0, y0);
  }, { passive: true });
  dock.addEventListener('touchmove', (e) => {
    if (!e.cancelable || isWide()) return;   // (a scroll already under way: its own; wide screens: the dock is part of the page)
    const t = e.touches[0];
    const dx = t.clientX - x0;
    const dy = t.clientY - y0;
    const sideways = Math.abs(dx) > Math.abs(dy);
    const el = scroller(e.target, sideways);
    const ok = el && dock.contains(under) && scroller(under, sideways) === el && hasRoom(el, sideways, sideways ? dx : dy);
    if (e.touches.length > 1 || !ok) e.preventDefault();
  }, { passive: false });
}

/* A stepper's middle button: the panel it steps through. Phones: its
   sheet opens; wide screens: the page scrolls down to it. */
function showPanel(tab) {
  if (!isWide()) { openTab(tab); return; }
  const panel = tab === 'chord' ? els.panelChord : els.panelScale;
  panel.scrollIntoView({ block: 'start', behavior: 'smooth' });
}
function openTab(tab) {
  const wasOpen = ui.tab !== null;
  ui.tab = ui.tab === tab ? null : tab;
  // A panel opened: what it is about is what is acted on (the chord's, or the
  // scale's groups: the stepper and the neck follow, see noteFocus)
  if (ui.tab === 'chord') ui.focus = 'chord';
  else if (ui.tab === 'scale') ui.focus = 'group';
  const ch = currentChord();
  renderDock(ch, currentScale());
  if (ui.tab) {
    els.sheetBody.scrollTop = 0;
    refitWords(els.sheet);   // (its words fitted to the room they now have)
    if (ui.tab === 'scale') requestAnimationFrame(() => keepChipVisible(els.groupList));
    // Once the sheet has slid up, make sure the shape is still visible above
    // it: wait for its own slide animation (or not at all, if it has none)
    const sliding = els.sheet.getAnimations ? els.sheet.getAnimations() : [];
    Promise.all(sliding.map((a) => a.finished)).then(() => { if (ui.tab) revealFocus(); }, () => {});
  } else if (wasOpen) {
    revealFocus();   // closed: centre it again in the now taller view (the chord, or the group just picked)
  }
}

/* Wide screens: the chord and scale panels, folded or not (state.folded;
   on phones each is a sheet of its own: never folded). Folded, its title
   says what it shows ("Chord C/E", "Scale C Major"). */
function renderFolds(ch, sc) {
  const wide = isWide();
  for (const [key, panel, value] of [['chord', els.panelChord, ch ? ch.symbol : 'None'],
    ['scale', els.panelScale, sc ? `${sc.rootName} ${scaleTitle(sc.def)}` : 'None']]) {
    const folded = wide && state.folded[key];
    panel.classList.toggle('folded', folded);
    const btn = panel.querySelector('.panel-fold');
    btn.setAttribute('aria-expanded', String(!folded));
    btn.setAttribute('aria-label', `${folded ? 'Unfold' : 'Fold'} the ${key} panel`);
    btn.title = folded ? `Show the ${key} panel` : `Fold the ${key} panel to its title`;
    const v = panel.querySelector('.fold-value');
    v.hidden = !folded;
    v.innerHTML = folded ? tx(value) : '';
  }
}
/* The arrow or the title folds a panel, or unfolds it; folded, a click
   anywhere on it unfolds it too (but on its switches and buttons: those do
   their own thing) */
function setupFolds() {
  for (const [key, panel] of [['chord', els.panelChord], ['scale', els.panelScale]]) {
    panel.addEventListener('click', (e) => {
      if (!isWide()) return;
      const title = e.target.closest('.theory-title');
      if (state.folded[key] ? title || !e.target.closest('button, a, input, select, label') : title) {
        state.folded[key] = !state.folded[key];
        render();
      }
    });
  }
}

function renderHeader() {
  const inst = instrument();
  document.body.classList.toggle('piano', Boolean(inst.piano));   // (styles.css hides what a piano has no use for)
  els.neck.closest('.neck-panel').setAttribute('aria-label', inst.piano ? 'Piano' : 'Fretboard');
  const tuned = tuningName(inst);
  els.instrumentPicker.innerHTML = `<span class="inst-name">${esc(inst.name)}</span>` +
    (tuned ? `<span class="inst-tuning">${esc(tuned)}</span>` : '');
  els.instrumentPicker.setAttribute('aria-label', `Instrument: ${inst.name}${tuned ? `, ${tuned}` : ''}`);
  const c = capo();
  els.tuningSelect.textContent = tuned || 'Standard tuning';
  els.tuningSelect.classList.toggle('on', Boolean(tuned));
  els.capoSelect.textContent = c ? `Capo ${c}` : 'No capo';
  els.capoSelect.classList.toggle('on', c > 0);
  for (const [id, key] of TOGGLES) {
    els[id].setAttribute('aria-pressed', String(state[key]));
  }
}

/* "Drop D", "C G D G B D" (custom), or '' for the standard tuning */
const tuningName = (inst) => (inst.tuning && inst.tuning.id !== 'standard' ? inst.tuning.name : '');
/* Open string names, low to high: "D A D G B E". A short string (a banjo's
   drone) is written in small letters, as banjo players write it: "g D G B D".
   (Words only: links and saved tunings keep the pitches.) */
function tuningNotes(strings, flats = false, instId = null) {
  const inst = instId && findInstrument(instId);
  return strings.map((m, s) => stringNote(inst, s, noteText(plainNote(m, flats)))).join(' ');
}
const stringNote = (inst, s, name) => (inst && startFret(inst, s) ? name.charAt(0).toLowerCase() + name.slice(1) : name);

const MUTE_BADGE = '×';   // (a muted string's badge: drawn as MUTE_ICON)
const MUTE_ICON = '<svg class="ico mute-ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" ' +
  'stroke-width="3" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';

/* Scale groups, as players learn them (the five pentatonic boxes, the CAGED
   positions of the major scale): the scale as it lies under the hand in one
   place on the neck, string after string, each string's notes within reach
   of the fingers. Neighbouring groups share notes (less than 3/4 of them),
   so moving from one to the next keeps a note or two under the fingers, and
   together they cover the whole neck.
   Each group is an unbroken run of the scale from its lowest note to its
   highest: 2 or 3 notes on a string (2 in a pentatonic), no string's notes
   spread over more than 4 frets (one finger per fret), the group 5 frets
   wide, 6 where the scale allows no less. Open strings sit at the nut,
   before fret 1: the open position is frets 1 to 4. Mandolin and mandola
   frets are about half as wide, so their hand reaches further (REACH): up
   to 7 frets, 3 or 4 notes on a string.
   Only complete groups are returned: every string, every note playable (not
   cut off by the nut, the capo or the last fret), in order up the neck. Each
   group is a list of bars, one per string: the frets from its first to its
   last note (a to b), and its outline's (da to db: further, to meet the
   string before or after, see handGroups). A banjo's drone is left out: groups are played on the long
   strings.
   Returns [{ id, bars: [{ s, a, b }] }]. */
const groupsCache = { key: null, groups: [] };
function scaleGroups(inst, sc, capo) {
  const L = sc.def.steps.length;
  if (L >= 12) return [];   // chromatic: nothing to group
  const key = [inst.strings, inst.frets, inst.fifths, sc.def.id, sc.root, capo].join('|');
  if (groupsCache.key === key) return groupsCache.groups;
  const long = inst.strings.map((m, s) => s).filter((s) => !startFret(inst, s));
  // Strings from the lowest to the highest. A re-entrant string (the high G
  // of a standard ukulele) is grouped as if it were an octave lower: same
  // note names on the same frets, and groups that follow the neck instead of
  // jumping across it.
  const pitches = long.map((s) => inst.strings[s]);
  for (let i = pitches.length - 2; i >= 0; i--) while (pitches[i] >= pitches[i + 1]) pitches[i] -= 12;
  const order = pitches.map((m, i) => ({ m, s: long[i] }));
  const groups = handGroups(inst, sc, capo, order, inst.fifths ? REACH.short : REACH.long);
  groupsCache.key = key;
  groupsCache.groups = groups;
  return groups;
}

/* A note's place in the scale, counted in steps from the root's lowest
   octave (rank), and back: a rank's distance from the root in semitones */
const scaleRank = (sc, midi) => {
  const L = sc.def.steps.length;
  const rel = midi - sc.root;
  const d = sc.def.steps.indexOf(mod12(rel));
  return d < 0 ? null : Math.floor(rel / 12) * L + d;
};
const rankSemis = (sc, r) => {
  const L = sc.def.steps.length;
  return 12 * Math.floor(r / L) + sc.def.steps[((r % L) + L) % L];
};

/* How far the hand reaches, in frets from the first note to the last: on
   one string (run), and across a group (group). Long frets (guitar, bass,
   ukulele, banjo): 4 frets on a string, one finger per fret, and 5 for a
   group, 6 with a stretch, never more. Short frets (mandolin, mandola,
   tuned in fifths): 7 frets on a string and for a group, 8 with a
   stretch. */
const REACH = { long: { run: 3, group: 4 }, short: { run: 6, group: 6 } };
/* What a note left out of every group costs (below the first group, above
   the last, or between two). More than a stretch: a group that can be
   played there is shown. */
const MISS_COST = 4;
/* What a group whose strings don't all share a fret with the next costs,
   each such string: compact groups first, where they can be played */
const FOLD_COST = 1.5;
const fewer = (x, y) => {   // compare two costs, most important first
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i];
  return false;
};
/* First every group the hand can play: from each note of the lowest string,
   every way to split the run up the strings (2 notes or more on a string,
   each string's notes within reach, the whole within a stretch). A string
   that shares no fret with the one before (FOLD_COST: compact groups
   first) has its outline stretched to meet it, within a string's reach
   (bridge): one outline, round a note or two not in it. Then the groups to
   show, by dynamic programming from the nut up, each one starting on a
   fret higher up than the one before, no lower on any string, sharing less
   than 3/4 of its notes with it (starting inside it on every string, on
   its last note at best, or on the note right after it, unless leaving
   notes out costs less than the groups that would take them in). Costs
   compared most important first:
   - together: notes left out of every group (MISS_COST); groups wider than
     the reach, 2 (twice a cube of the frets too many); strings sharing no
     fret with the one before (FOLD_COST); and notes a group passes over (a scale note inside its
     frets, on a string, that it leaves out though it would go on with it),
     2 each; a group wider than the tightest one starting on the same note,
     0.75 a fret; and neighbours that share no note on a string, 0.3 a
     string (so a group stays tight rather than share a note with the one
     before on 2 strings, but is not dropped to save a fret)
   - neighbours that share no note on a string
   - the fewest groups (the most ground covered by each move of the hand)
   - the most compact groups. */
function handGroups(inst, sc, capo, order, reach) {
  const n = order.length;
  const N = inst.frets;
  // Each string's playable ranks, from the capo to the last fret
  const lo = [];
  const hi = [];
  for (const { m } of order) {
    let a = Infinity;
    let b = -Infinity;
    for (let f = capo; f <= N; f++) {
      const r = scaleRank(sc, m + f);
      if (r !== null) { a = Math.min(a, r); b = Math.max(b, r); }
    }
    lo.push(a);
    hi.push(b);
  }
  if (lo.some((a, q) => a > hi[q])) return [];
  const fret = (q, r) => rankSemis(sc, r) + sc.root - order[q].m;
  const fret1 = (f) => Math.max(f, capo + 1);   // the nut (or capo) column counts as fret 1
  // Notes the hand passes over: on a string, a scale note inside the group's
  // frets (low to high) but not in the group (a to b), and lower or higher
  // than all of its notes (first to last: one the group would naturally go
  // on with; a note it already plays on another string is fine)
  const passedOver = (A, B, low, high, first, last) => {
    let passed = 0;
    for (let q = 0; q < n; q++) {
      for (let f = low; f <= high; f++) {
        if (f >= A[q] && f <= B[q]) continue;
        const k = scaleRank(sc, order[q].m + f);
        if (k !== null && (k < first || k > last)) passed++;
      }
    }
    return passed;
  };
  // What a group itself costs: 2 for one fret too wide (see the costs
  // above), 2 for each note passed over
  // Two strings side by side in a group, the second's notes from fret a to
  // b, the first's outline from pa to pb: their outlines, made to share a
  // fret where the notes don't (the second's stretched towards the first,
  // else the first's towards the second), no outline over more frets than a
  // string's notes may be (reach.run); null: they can't be. Returns [the
  // first's from, to, the second's from, to, 1 if stretched].
  const bridge = (pa, pb, a, b) => {
    if (b >= pa && a <= pb) return [pa, pb, a, b, 0];
    const fits = (x, y) => y - fret1(x) <= reach.run;
    if (b < pa) {
      if (fits(a, pa)) return [pa, pb, a, pa, 1];
      if (fits(b, pb)) return [b, pb, a, b, 1];
    } else {
      if (fits(pb, b)) return [pa, pb, pb, b, 1];
      if (fits(pa, a)) return [pa, a, a, b, 1];
    }
    return null;
  };
  const groupCost = (span, passed) => 2 * Math.max(0, span - reach.group) ** 3 + 2 * passed;

  // The groups, with at least minLen notes a string and no wider than
  // stretch frets
  const solve = (minLen, stretch) => {
    const cands = [];
    const S = new Array(n);   // first rank on each string
    const A = new Array(n);   // first fret on each string
    const B = new Array(n);   // last fret on each string
    const DA = new Array(n);  // the outline's first fret on each string (see bridge)
    const DB = new Array(n);  // and its last
    // Runs on string q from rank r on; low and high: the group's frets so far
    // (fretted notes only); folds: strings sharing no fret with the one before
    const walk = (q, r, low, high, folds) => {
      if (q === n) {
        const E = S.map((x, i) => (i + 1 < n ? S[i + 1] : r) - 1);   // last rank on each string
        const span = high - low;
        const cost = groupCost(span, passedOver(A, B, low, high, S[0], E[n - 1])) + FOLD_COST * folds;
        cands.push({ S: S.slice(), E, A: A.slice(), B: B.slice(), DA: DA.slice(), DB: DB.slice(), cost, span, low });
        return;
      }
      if (r < lo[q] || r > hi[q]) return;
      const a = fret(q, r);
      for (let len = minLen; r + len - 1 <= hi[q]; len++) {
        const b = fret(q, r + len - 1);
        const from = fret1(a);
        if (b - from > reach.run) break;
        const l2 = Math.min(low, from);
        const h2 = Math.max(high, b);
        if (h2 - l2 > stretch) { if (b > high) break; continue; }
        const was = q ? [DA[q - 1], DB[q - 1]] : null;
        const join = q ? bridge(DA[q - 1], DB[q - 1], a, b) : [0, 0, a, b, 0];
        if (!join) continue;
        S[q] = r;
        A[q] = a;
        B[q] = b;
        if (q) [DA[q - 1], DB[q - 1]] = [join[0], join[1]];
        [DA[q], DB[q]] = [join[2], join[3]];
        walk(q + 1, r + len, l2, h2, folds + join[4]);
        if (q) [DA[q - 1], DB[q - 1]] = was;
      }
    };
    for (let r = lo[0]; r <= hi[0]; r++) walk(0, r, Infinity, -Infinity, 0);
    // The open position as players know it: every scale note from the nut
    // (or the capo) to the 4th fret, on every string. Its run may play a note
    // twice (where two strings are a third apart, like a guitar's G and B),
    // but it skips none, and it takes in the open strings a straight run
    // would leave out (D major pentatonic on guitar: 0,2 | 0,2 | 0,2,4 |
    // 2,4 | 0,3 | 0,2).
    const box = { S: [], E: [], A: [], B: [], DA: [], DB: [] };
    let boxFolds = 0;
    let ok = true;
    for (let q = 0; q < n && ok; q++) {
      const ranks = [];
      const frets = [];
      for (let f = capo; f <= Math.min(capo + 4, N); f++) {
        const r = scaleRank(sc, order[q].m + f);
        if (r !== null) { ranks.push(r); frets.push(f); }
      }
      ok = ranks.length >= minLen && ranks.length > 0;
      if (!ok) break;
      if (q && ranks[0] > box.E[q - 1] + 1) ok = false;   // a note skipped
      const [a, b] = [frets[0], frets[frets.length - 1]];
      const join = q ? bridge(box.DA[q - 1], box.DB[q - 1], a, b) : [0, 0, a, b, 0];
      if (!join) { ok = false; break; }
      if (q) [box.DA[q - 1], box.DB[q - 1]] = [join[0], join[1]];
      boxFolds += join[4];
      box.S.push(ranks[0]);
      box.E.push(ranks[ranks.length - 1]);
      box.A.push(a);
      box.B.push(b);
      box.DA.push(join[2]);
      box.DB.push(join[3]);
    }
    if (ok) {
      const low = Math.min(...box.A.map(fret1));
      const high = Math.max(...box.B);
      const span = high - low;
      if (span <= stretch) cands.push({ ...box, cost: groupCost(span, 0) + FOLD_COST * boxFolds, span, low });
    }
    if (!cands.length) return [];
    for (const g of cands) g.size = g.S.reduce((k, x, q) => k + g.E[q] - x + 1, 0);   // its notes
    cands.sort((g, h) => g.S[0] - h.S[0] || g.low - h.low);   // in order of their first note, then of their first fret
    // A group wider than the tightest one starting on the same note: 0.75 for
    // each fret more (banjo G minor at fret 17: frets 17 to 20, not 16 to 20)
    const tightest = new Map();
    for (const g of cands) tightest.set(g.S[0], Math.min(tightest.get(g.S[0]) ?? Infinity, g.span));
    for (const g of cands) g.cost += 0.75 * (g.span - tightest.get(g.S[0]));

    // Groups in order of their first note: the best way to reach each one
    // from the nut, through groups lower on the neck
    // What the notes left out between the ends of the group before and g cost
    const left = (g, ends) => {
      let k = 0;
      for (let q = 0; q < n; q++) for (let r = ends[q] + 1; r < g.S[q]; r++) k += MISS_COST;
      return k;
    };
    const best = cands.map((g) => ({ cost: [left(g, lo.map((a) => a - 1)) + g.cost, 0, 1, g.span], prev: -1 }));
    const back = 2 * (reach.run + 2);   // how far back (in ranks of the lowest string) the group before can start
    let from = 0;
    for (let j = 0; j < cands.length; j++) {
      const g = cands[j];
      while (cands[from].S[0] < g.S[0] - back) from++;
      for (let i = from; i < j; i++) {
        const p = cands[i];
        // g starts on a fret higher up, goes no lower on any string, and
        // shares less than 3/4 of its notes with p (or of p's)
        let up = g.low > p.low;
        let apart = 0;   // strings where they share no note
        let shared = 0;
        for (let q = 0; q < n && up; q++) {
          up = g.S[q] >= p.S[q] && g.E[q] >= p.E[q];
          if (g.S[q] > p.E[q]) apart++;
          shared += Math.max(0, Math.min(g.E[q], p.E[q]) - Math.max(g.S[q], p.S[q]) + 1);
        }
        if (!up || shared >= 0.75 * Math.min(g.size, p.size)) continue;
        const c = best[i].cost;
        const cost = [c[0] + left(g, p.E) + g.cost + 0.3 * apart, c[1] + apart, c[2] + 1, c[3] + g.span];
        if (fewer(cost, best[j].cost)) best[j] = { cost, prev: i };
      }
    }
    // The last group: the best once the notes above it are counted
    let last = -1;
    let lastCost = null;
    cands.forEach((g, j) => {
      const c = best[j].cost;
      const top = { S: hi.map((b) => b + 1) };
      const cost = [c[0] + left(top, g.E), ...c.slice(1)];
      if (!lastCost || fewer(cost, lastCost)) { lastCost = cost; last = j; }
    });
    const out = [];
    for (let j = last; j >= 0; j = best[j].prev) out.unshift(cands[j]);
    return out;
  };

  // A scale with a gap too wide for two notes on a string within reach gets
  // single notes there
  const L = sc.def.steps.length;
  let minLen = 2;
  for (let i = 0; i < L; i++) if (rankSemis(sc, i + 1) - rankSemis(sc, i) > reach.run) minLen = 1;
  // Some scales and tunings leave no straight run within a stretch over most
  // of the neck (the whole-tone scale on guitar, open C): then single notes
  // on a string too, if groups then cover more of it
  const all = lo.reduce((k, a, q) => k + hi[q] - a + 1, 0);
  const covered = (groups) => {
    const notes = new Set();
    for (const g of groups) for (let q = 0; q < n; q++) for (let r = g.S[q]; r <= g.E[q]; r++) notes.add(`${q}:${r}`);
    return notes.size;
  };
  let groups = [];
  let most = -1;
  for (const [len, stretch] of [[minLen, reach.group + 1], [1, reach.group + 1]]) {
    const found = solve(len, stretch);
    const k = covered(found);
    if (k > most) { groups = found; most = k; }
    if (most >= 0.6 * all) break;
  }
  return groups.map((g, id) => ({ id, bars: order.map(({ s }, q) => ({ s, a: g.A[q], b: g.B[q], da: g.DA[q], db: g.DB[q] })) }));
}

function renderNeck(ch, sc) {
  const inst = instrument();
  if (inst.piano) { renderPiano(ch, sc); return; }
  els.neck.className = 'neck';
  els.neck.setAttribute('aria-label', 'Fretboard notes');
  const n = inst.strings.length;
  const N = inst.frets;
  const c = capo();
  const offKey = offKeyTest(sc);   // chord notes outside the scale
  // Phones: vertical neck. Row 1 holds the string numbers, then the open
  // strings, then one row per fret; the lowest string is on the left.
  // Wide screens: horizontal neck. Row 1 holds the fret numbers, then one row
  // per string with the highest string on top (as in tab).
  const vertical = !isWide();
  // The capo covers the strings that run from the nut (all but a banjo's
  // drone, which sits first); `nut` is where each string starts ringing
  const short = inst.strings.filter((m, s) => startFret(inst, s)).length;
  const nut = (s) => startFret(inst, s) + c;
  let cellAt, rulerAt, labelAt, capoAt;
  if (vertical) {
    els.neck.style.gridTemplateColumns = `var(--label-w) repeat(${n}, minmax(0, 1fr))`;
    els.neck.closest('.neck-panel').style.setProperty('--strings', n);   // (the panel no wider than its strings need, styles.css)
    cellAt = (s, f) => `grid-row:${f + 2};grid-column:${s + 2}`;
    rulerAt = (f) => `grid-row:${f + 2};grid-column:1`;
    labelAt = (s) => `grid-row:1;grid-column:${s + 2}`;
    capoAt = `grid-row:${c + 2};grid-column:${short + 2} / span ${n - short}`;
  } else {
    els.neck.style.gridTemplateColumns = `var(--label-w) var(--open-w) repeat(${N}, minmax(var(--cell-w), 1fr))`;
    cellAt = (s, f) => `grid-row:${n - s + 1};grid-column:${f + 2}`;
    rulerAt = (f) => `grid-row:1;grid-column:${f + 2}`;
    labelAt = (s) => `grid-row:${n - s + 1};grid-column:1`;
    capoAt = `grid-row:2 / span ${n - short};grid-column:${c + 2}`;
  }
  // Vertical: the open-string row is 3px taller, since the nut is 3px thicker
  // than a fret wire; its notes get as much room as any other
  els.neck.style.gridTemplateRows = vertical ? 'var(--ruler-row) calc(var(--row-h) + 3px)' : 'var(--ruler-row)';
  els.neck.style.gridAutoRows = 'var(--row-h)';
  els.neck.style.setProperty('--strings', n);   // (the strip's grid, see styles.css)
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
      if (f >= 0) shapeAt.set(`${s}:${shapeNeckFret(inst, s, f, c)}`, ch.degOfPc.get(mod12(inst.strings[s] + c + f)));
    });
  }
  const ghosts = ch && !ch.naming && (state.allTones || !ch.shape);   // (naming: only the notes placed)
  // Notes outside the key: as the key writes them, else flats if asked for or
  // if the tuning is written in flats (E♭ standard)
  const keyFlats = sc ? sc.spell.flats : ch ? ch.spell.flats : state.flats || Boolean(inst.tuning && inst.tuning.flats);
  const onlyScale = Boolean(sc && state.scaleOnly);
  const groups = sc && state.scaleGroups ? scaleGroups(inst, sc, c) : [];
  // Another instrument: back to the first group. Anything else (another
  // scale root or type, tuning, capo, Groups switched off and on): the
  // group at the place picked, or the nearest one (pickGroup).
  if (ui.groupInst !== state.instrument) {
    ui.groupInst = state.instrument;
    ui.groupAt = null;
  }
  ui.groups = groups;
  ui.group = pickGroup(groups);

  // One octave number per shaded band, on its first cell you can play: the
  // lowest-listed string in the band, at its lowest fret not behind the capo
  // (open strings included; a band wholly behind the capo keeps it on its
  // first cell, faded with it). That is the bottom-left of the band on the
  // horizontal neck and its top-left on the vertical one. An octave can make
  // two separate bands (a ukulele's high G, a banjo's drone): each gets its
  // number. C4 = middle C, as on the piano.
  const octaveOf = (s, f) => Math.floor(fretPitch(inst, s, f) / 12) - 1;
  const octaveLabels = new Set();
  if (state.octaves) {
    // Scanning string by string, fret by fret, the first cell met of a band
    // starts it: gather the whole band (cells of the same octave touching
    // along a string or across to the next string), then label it
    const seen = new Set();
    const onNeck = (s, f) => s >= 0 && s < n && f >= startFret(inst, s) && f <= N;
    const before = (x, y) => x[0] - y[0] || x[1] - y[1];   // string, then fret
    inst.strings.forEach((open, s) => {
      for (let f = startFret(inst, s); f <= N; f++) {
        if (seen.has(`${s}:${f}`)) continue;
        const o = octaveOf(s, f);
        const band = [[s, f]];
        seen.add(`${s}:${f}`);
        for (let i = 0; i < band.length; i++) {
          const [a, g] = band[i];
          for (const [x, y] of [[a, g - 1], [a, g + 1], [a - 1, g], [a + 1, g]]) {
            if (!onNeck(x, y) || seen.has(`${x}:${y}`) || octaveOf(x, y) !== o) continue;
            seen.add(`${x}:${y}`);
            band.push([x, y]);
          }
        }
        const playable = band.filter(([x, y]) => y >= nut(x)).sort(before);
        const [ls, lf] = playable.length ? playable[0] : [s, f];
        octaveLabels.add(`${ls}:${lf}`);
      }
    });
  }

  const html = [];
  const starts = [];   // each string's first cell (the nut, the capo, a drone's start or spike), for the strip
  const singleDots = inst.dots ? inst.dots.single : SINGLE_DOTS;
  const doubleDots = inst.dots ? inst.dots.double : DOUBLE_DOTS;
  // Fret numbers. With a capo they count from it, like everything else
  // (chord shapes, their tab, scale groups, a note's place): the capo's fret
  // says "Capo" (the horizontal neck; on the vertical one its bar shows it),
  // the frets behind it have no number. The inlay dots stay where they are
  // on the neck.
  for (let f = 1; f <= N; f++) {
    const dots = doubleDots.includes(f) ? 2 : singleDots.includes(f) ? 1 : 0;
    const marks = '<i></i>'.repeat(dots);
    const label = f < c ? marks : f === c ? (vertical ? '' : 'Capo') : `${f - c}${marks}`;
    const title = f === c ? ` title="Capo on fret ${f}"` : '';
    html.push(`<div class="ruler${dots ? ' mark' : ''}${f === c ? ' capo' : f < c ? ' behind' : ''}" style="${rulerAt(f)}"${title}>${label}</div>`);
  }

  inst.strings.forEach((open, s) => {
    const sw = Math.min(3.2, Math.max(1, (72 - open) / 10)).toFixed(1);
    const num = stringNumber(s);
    const start = startFret(inst, s);
    const stop = start ? 'spike' : 'capo';   // what holds the string down past its start
    // A short string's number sits just before where it starts, as the
    // others sit just before the nut
    html.push(start
      ? `<div class="slabel short" style="${cellAt(s, start - 1)}" title="String ${num}">${num}</div>`
      : `<div class="slabel" style="${labelAt(s)}" title="String ${num}">${num}</div>`);
    for (let f = 0; f <= N; f++) {
      const mark = singleDots.includes(f) || doubleDots.includes(f);
      // Before a short string starts there is no fingerboard: nothing to show
      if (f < start) {
        html.push(`<div class="cell no-string" data-s="${s}" data-f="${f}" style="${cellAt(s, f)}" aria-hidden="true"></div>`);
        continue;
      }
      const midi = fretPitch(inst, s, f);
      const pc = mod12(midi);
      const key = `${s}:${f}`;
      // Where it is played: its fret counted from the capo (a banjo's
      // drone: from its spike), or open; behind the capo, only its string
      const where = f < nut(s) ? `string ${num}` : f > nut(s) ? `string ${num}, fret ${f - c}`
        : `string ${num}, ${c ? `at the ${stop}` : 'open'}`;
      // Each pill is spelled by its role: chord notes as in the chord, scale
      // notes as in the scale, other notes in the key's direction
      let cls = 'note';
      let n = plainNote(pc, keyFlats);
      let deg = null;
      let badge = '';   // chord notes: interval in a small corner badge, note name in the pill

      if (f < nut(s)) {
        cls += ' plain';   // behind the capo: shown for reference, but cannot be played
      } else if (f === nut(s) && ch && ch.shape && ch.shape.frets[s] < 0) {
        // A string the shape does not play: its open note, with a pink ×
        // badge where a chord note has its interval (with "Only scale
        // notes" too: it says which string, not a note to play); quiet,
        // or as a scale note when the scale shown has it
        cls += ` mute named${sc && sc.set.has(pc) ? ` scale${pc === sc.root ? ' scale-root' : ''}` : ''}`;
        n = ch.spell.names.get(pc) || (sc && sc.spell.names.get(pc)) || n;
      } else if (shapeAt.has(key) || (ghosts && ch.degOfPc.has(pc))) {
        deg = shapeAt.has(key) ? shapeAt.get(key) : ch.degOfPc.get(pc);
        cls += `${shapeAt.has(key) ? ' chord' : ' ghost'}${deg === 'R' ? ' root' : ''}${offKey(pc) ? ' off-key' : ''}`;
        badge = deg ? fmtDeg(deg) : '';   // (naming: no interval before a name)
        n = ch.spell.names.get(pc) || n;
      } else if (sc && sc.set.has(pc)) {
        cls += ` scale${pc === sc.root ? ' scale-root' : ''}`;
        n = sc.spell.names.get(pc) || n;
      } else {
        // off: shown, but not in the scale; out: hidden ("Only scale notes"),
        // except an open string's note (at the nut, the capo or a banjo's
        // spike): the strings' notes are always shown
        cls += onlyScale && f !== nut(s) ? ' plain out' : sc ? ' plain off' : ' plain';
      }
      const text = noteText(n);
      let title = `${pitchText(midi, n)}${deg ? ` (${DEGREE_NAMES[deg]})` : ''}, ${where}`;
      if (cls.includes(' off-key')) title += `, not in ${scaleInText(sc)}`;
      if (f < nut(s)) title += `, behind the ${stop}`;
      if (cls.includes(' mute')) title = cls.includes(' named') ? `${pitchText(midi, n)}, ${where}, not played` : `String ${num} not played`;
      const octave = octaveOf(s, f);
      const cellCls = `cell ${f === 0 ? 'open' : 'fret'}${mark ? ' mark' : ''}${octave % 2 ? ' o-alt' : ''}` +
        `${f < nut(s) ? ' behind' : ''}${c && f === nut(s) ? ' capo' : ''}${start && f === start ? ' string-start' : ''}`;
      const inner = cls.includes(' mute') && !cls.includes(' named') ? MUTE_ICON : tx(text);
      if (cls.includes(' named')) badge = MUTE_BADGE;
      const octTag = octaveLabels.has(key) ? `<span class="oct" title="Octave ${octave}">${tx(String(octave))}</span>` : '';
      const pill = `<span class="${cls}" title="${esc(title)}">${inner}` +
        `${badge === MUTE_BADGE ? `<span class="deg-badge mute-badge" aria-hidden="true">${MUTE_ICON}</span>`
          : badge ? `<span class="deg-badge" aria-hidden="true">${tx(badge)}</span>` : ''}</span>`;
      html.push(`<div class="${cellCls}" role="gridcell" data-s="${s}" data-f="${f}" style="${cellAt(s, f)};--sw:${sw}px">${octTag}${pill}</div>`);
      if (f === nut(s)) starts.push({ s, f, cellCls, sw, pill, num, octTag });
    }
  });
  // The capo clamps all strings just behind its fret wire (a banjo's drone:
  // a spike holds it down the same number of frets past its start)
  if (c) {
    html.push(`<div class="capo-bar" style="${capoAt}" ` +
      `title="Place the capo here, just behind fret ${c}" aria-hidden="true"></div>`);
    inst.strings.forEach((m, s) => {
      if (startFret(inst, s)) html.push(`<div class="capo-bar spike" style="${cellAt(s, nut(s))}" aria-hidden="true"></div>`);
    });
  }
  // Barres: a pink band behind the notes the finger lies across (a drone
  // ringing beside the shape does not stop a barre)
  if (ch && ch.shape) {
    const fretted = ch.shape.frets.map((f, s) => (startFret(inst, s) ? -1 : f));
    for (const { fret, from, to } of barresFor(fretted)) {
      const at = vertical ? `grid-row:${fret + c + 2};grid-column:${from + 2} / ${to + 3}`
        : `grid-column:${fret + c + 2};grid-row:${n - to + 1} / ${n - from + 2}`;
      html.push(`<div class="barre" style="${at};--k:${to - from + 1}" aria-hidden="true"><i></i></div>`);
    }
  }
  html.push('<svg class="group-layer" aria-hidden="true"></svg>');
  html.push(stripHtml(vertical, n, c, short, starts));
  els.neck.innerHTML = html.join('');
  drawGroups();
  placeStrip();
}

/* The piano: its 88 keys, low to high (phones: from the top down, the
   keys' fronts on the left by the octave numbers; wide screens: from left
   to right, the octave numbers above). Each key's note is a pill as on the
   neck: on a white key in the part in front of the black keys, on a black
   key near its front. Sizes and places are in styles.css, from each key's
   place among the white keys (--i: a white key's own, a black key's the
   white key it starts on). The octave's number sits by its first key (A0,
   then each C). */
const BLACK_PCS = new Set([1, 3, 6, 8, 10]);
function renderPiano(ch, sc) {
  const vertical = !isWide();
  els.neck.className = `neck piano ${vertical ? 'vertical' : 'horizontal'}`;
  els.neck.removeAttribute('style');   // (the neck's grid)
  els.neck.setAttribute('aria-label', 'Piano keys');
  els.neck.parentElement.classList.remove('lefty');   // (a piano is not mirrored)
  ui.groups = [];
  ui.group = -1;
  const offKey = offKeyTest(sc);
  const onlyScale = Boolean(sc && state.scaleOnly);
  const keyFlats = sc ? sc.spell.flats : ch ? ch.spell.flats : state.flats;
  const played = new Set(ch && ch.shape ? ch.shape.frets : []);
  const ghosts = ch && !ch.naming && (state.allTones || !ch.shape);
  const html = [];
  let white = 0;
  let pending = '';
  for (let k = 0; k < PIANO_KEYS; k++) {
    const midi = PIANO_LOW + k;
    const pc = mod12(midi);
    const black = BLACK_PCS.has(pc);
    const octave = Math.floor(midi / 12) - 1;
    if (pc === 0) html.push(`<span class="oct-label${octave === 4 ? ' mid' : ''}${k === PIANO_KEYS - 1 ? ' last' : ''}" style="--i:${white}" title="Octave ${octave}${octave === 4 ? ', middle C' : ''}">${tx(String(octave))}</span>`);   // (at each C: the few keys of octave 0 go without)
    let cls = 'note';
    let n = plainNote(pc, keyFlats);
    let deg = null;
    if (played.has(k) || (ghosts && ch.degOfPc.has(pc))) {
      deg = ch.degOfPc.get(pc);
      cls += `${played.has(k) ? ' chord' : ' ghost'}${deg === 'R' ? ' root' : ''}${offKey(pc) ? ' off-key' : ''}`;
      n = ch.spell.names.get(pc) || n;
    } else if (sc && sc.set.has(pc)) {
      cls += ` scale${pc === sc.root ? ' scale-root' : ''}`;
      n = sc.spell.names.get(pc) || n;
    } else {
      cls += onlyScale ? ' plain out' : sc ? ' plain off' : ' plain';
    }
    let title = `${pitchText(midi, n)}${deg ? ` (${DEGREE_NAMES[deg]})` : ''}, key ${k + 1}`;
    if (cls.includes(' off-key')) title += `, not in ${scaleInText(sc)}`;
    const badge = deg ? `<span class="deg-badge" aria-hidden="true">${tx(fmtDeg(deg))}</span>` : '';
    const key = `<div class="key ${black ? 'black' : 'white'}" data-key="${k}" style="--i:${white}">` +
      `<span class="${cls}" title="${esc(title)}">${tx(noteText(n))}${badge}</span></div>`;
    // A black key comes after the white key above it, so it lies over both
    // its white keys with no stacking of its own (which would hold its
    // badge under the next black key's note)
    if (black) pending = key;
    else {
      html.push(key, pending);
      pending = '';
      white++;
    }
  }
  els.neck.style.setProperty('--whites', white);
  els.neck.innerHTML = html.join('');
}

/* The strip: each string's first cell (its open note at the nut, or at the
   capo, a banjo's drone at its start or its spike), as on the neck, with
   the chord's ✕ or open mark, held at the edge of the view once the neck
   has scrolled past it: phones, at the top of the screen as the page
   scrolls down; wide screens, at the nut's end of the neck as it scrolls
   sideways. It is drawn over the neck (its notes, barres, capo and group
   outlines pass under it), is tapped as the neck is, and stays within the
   neck. Where a string's first cell has not reached it yet (a drone
   starting at the 5th fret), the neck shows through. Not a copy that
   speaks: the neck's own cells do (aria-hidden). */
function stripHtml(vertical, n, c, short, starts) {
  // Phones: row 1 is room above the notes (for their badges), row 2 the
  // cells; wide screens: row 1 is the fret numbers' row, then one per string
  const at = (s, col) => (vertical ? `grid-row:2;grid-column:${s + 2}` : `grid-row:${n - s + 1};grid-column:${col}`);
  const under = (s) => (vertical ? `grid-row:1 / 3;grid-column:${s + 2}` : `grid-row:${n - s + 1};grid-column:2`);
  // Its background is laid under each string's place (not the whole strip),
  // so the neck shows through a place still waiting
  const parts = [vertical ? '<i class="strip-under" style="grid-row:1 / 3;grid-column:1"></i>'
    : `<i class="strip-under" style="grid-row:1 / span ${n + 1};grid-column:1"></i><i class="strip-under" style="grid-row:1;grid-column:2"></i>`];
  for (const x of starts) {
    parts.push(`<i class="strip-under" data-s="${x.s}" style="${under(x.s)}"></i>`);
    if (!vertical) parts.push(`<div class="slabel" data-s="${x.s}" style="${at(x.s, 1)}">${x.num}</div>`);   // (a drone's: with its cell, its own number beside it until then)
    parts.push(`<div class="${x.cellCls} strip-cell" data-s="${x.s}" data-f="${x.f}" style="${at(x.s, 2)};--sw:${x.sw}px">${x.octTag}${x.pill}</div>`);
  }
  if (c) {   // the capo across the strings from the nut, a spike on a drone
    parts.push(`<div class="capo-bar" style="${vertical ? `grid-row:2;grid-column:${short + 2} / span ${n - short}` : `grid-row:2 / span ${n - short};grid-column:2`}"></div>`);
    for (const x of starts) if (x.s < short) parts.push(`<div class="capo-bar spike" data-s="${x.s}" style="${at(x.s, 2)}"></div>`);
  }
  const place = vertical ? 'grid-row:2;grid-column:1 / -1' : `grid-row:1 / span ${n + 1};grid-column:1 / span 2`;
  return `<div class="neck-strip" aria-hidden="true" style="${place}">${parts.join('')}</div>`;
}
/* A string's place in the strip shows once its first cell on the neck has
   reached it (and goes on under it, out of view): the two are then in the
   same spot, so the note does not jump. Each string on its own (a drone
   starting at the 5th fret comes later); the strip shows with the first. */
function placeStrip() {
  const strip = els.neck.querySelector('.neck-strip');
  if (!strip) return;
  const vertical = els.neck.classList.contains('vertical');
  const lefty = state.leftHanded;
  let any = false;
  for (const cell of strip.querySelectorAll('.strip-cell')) {
    const { s, f } = cell.dataset;
    const real = els.neck.querySelector(`.cell[data-s="${s}"][data-f="${f}"]:not(.strip-cell)`);
    if (!real) continue;
    // (by their nut's edge, the same line for every string in the strip,
    // so a drone's nut or a capo meets the others' exactly)
    const a = real.getBoundingClientRect();
    const b = cell.getBoundingClientRect();
    const past = vertical ? a.bottom < b.bottom - 0.5 : lefty ? a.left > b.left + 0.5 : a.right < b.right - 0.5;
    for (const part of strip.querySelectorAll(`[data-s="${s}"]`)) part.classList.toggle('waiting', !past);   // (its cell, background, number and spike)
    any = any || past;
  }
  strip.classList.toggle('on', any);
}
let stripFrame = 0;
const queueStrip = () => { if (!stripFrame) stripFrame = requestAnimationFrame(() => { stripFrame = 0; placeStrip(); }); };

/* Draw the group picked (ui.groups[ui.group]) in the scale's colour, one
   at a time (the arrows and chips step through them). It is an outline
   measured from the cells on screen: an SVG path that is inset a
   little from the cells and has every corner rounded, inner ones included.
   Redrawn whenever the neck changes size. */
const GROUP_INSET = 2;   // keeps the line clear of a root note's ring
const GROUP_RADIUS = 9;
function drawGroups() {
  const layer = els.neck.querySelector('.group-layer');
  if (!layer) return;
  const group = (ui.groups || [])[ui.group];
  const box = els.neck.getBoundingClientRect();
  layer.setAttribute('width', box.width);
  layer.setAttribute('height', box.height);
  layer.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
  if (!group) { layer.innerHTML = ''; return; }

  const vertical = els.neck.classList.contains('vertical');
  // Work in (u, v): u runs along the strings (towards the body), v across them.
  // Along u, a cell is measured without its fret wire or nut (a border) and
  // the capo's padding: the note sits in the middle of what is left, so a
  // group gets the same room before its first note as after its last.
  const cellBox = (s, f) => {
    const cell = els.neck.querySelector(`.cell[data-s="${s}"][data-f="${f}"]:not(.strip-cell)`);
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
  layer.innerHTML = [group].map((g) => {   // one group at a time: the one picked
    const bars = g.bars.map(({ s, a, b, da = a, db = b }) => {   // (its outline: past its notes where a string shares no fret with the next)
      const first = cellBox(s, da);
      const last = cellBox(s, db);
      // min / max: on a mirrored (left-handed) neck the frets run leftwards
      return { u0: Math.min(first.u0, last.u0), u1: Math.max(first.u1, last.u1), v0: first.v0, v1: first.v1 };
    }).sort((p, q) => p.v0 - q.v0);
    const points = staircase(bars, GROUP_INSET).map(([u, v]) => (vertical ? [v, u] : [u, v]));
    return `<path class="g-a" d="${roundedPath(points, GROUP_RADIUS)}"/>`;
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
  els.chordRoot.textContent = ch ? ch.rootName : noteText(plainRoot(state.chord.root, sc));
  fitWords(els.chordType, ch ? [...new Set([ch.def.name, shortWords(ch.def.name)])] : ['None'], 12);   // ("Half-dim. 7th" when the whole name does not fit)

  // No chord: the bass the next one gets, without a note to name yet
  const inversion = ch ? ch.inversion : state.inversion[state.instrument];
  els.chordInversion.textContent = inversion === 'any' ? 'Any bass note'
    : ch ? `${INVERSION_NAMES[Number(inversion)]}, ${noteText(ch.spell.notes[Number(inversion)])} in bass`
      : INVERSION_NAMES[Number(inversion)];

  els.chordClear.disabled = !ch;
  els.chordInversion.disabled = !ch;
  // No shape to play: every chord tone shows on the neck (renderNeck), so the
  // switch shows on, and can't be turned off
  const noShape = Boolean(ch && !ch.shape);
  els.tglAllTones.disabled = !ch || noShape;
  if (noShape) els.tglAllTones.setAttribute('aria-pressed', 'true');
  els.shapePrev.disabled = els.shapeNext.disabled = !ch || ch.shapes.length < 2;
  els.chordStrum.disabled = !ch || !ch.shape;
  const piano = Boolean(instrument().piano);
  els.chordStrum.querySelector('.tx').textContent = piano ? 'Play' : 'Strum';
  const space = keysOnGroups(ch) ? '' : ' (Space)';   // (Space playing the group instead)
  els.chordStrum.title = piano ? `Play the chord${space}` : `Strum the shape${space}`;

  if (!ch) {
    els.chordSymbol.textContent = '';
    els.chordSymbol.classList.remove('on');
    els.chordName.textContent = 'No chord selected';
    els.chordMeta.textContent = 'Pick a chord type, or tap a triad in the Scale panel.';
    els.chordShapeNote.textContent = '';
    els.chordPosition.textContent = '';
    els.chordAlt.textContent = '';
    els.chordCapo.hidden = true;
    els.chordKey.hidden = true;
    els.chordTones.innerHTML = '<li class="np-placeholder">The notes of the selected shape appear here.</li>';
    els.chordMissing.hidden = true;
    els.shapeCount.hidden = true;
    els.shapeList.innerHTML = '';
    els.shapeList.dataset.empty = 'No chord selected';
    return;
  }

  const rootName = ch.rootName;
  els.chordSymbol.classList.add('on');
  fitSymbol(els.chordSymbol, ch.symbol, ch.bassIndex > 0);
  els.chordName.textContent = `${rootName} ${ch.def.name.toLowerCase()}`;
  const optional = optionalTones(ch.def, String(ch.bassIndex), Boolean(instrument().piano));   // (in brackets, as in the Chord type menu; never the shape's bass)
  const formula = ch.def.degrees.map((d, i) => {
    const deg = fmtDeg(d === 'R' ? '1' : d);
    return optional.has(i) ? `(${deg})` : deg;
  }).join(' ');
  // Its formula, then its notes: each once, from the root up, as spelled for
  // the chord, the ones a shape may leave out in brackets, as the formula and
  // the Chord type menu (the shape's notes, bass to top, with any doubled,
  // are below). On two lines, the break comes after the comma.
  const spelled = ch.spell.notes.map((n, i) => (optional.has(i) ? `(${noteText(n)})` : noteText(n))).join(' ');
  els.chordMeta.innerHTML = `<span class="np-tail">Formula ${esc(formula)},</span> <span class="np-tail">${esc(spelled)}</span>`;   // (each part whole on its line while it fits one)
  // Its inversion, on its own line (the shape's: with "Any bass note" too)
  els.chordPosition.textContent = INVERSION_NAMES[ch.bassIndex];
  // Phones: where the shape is and its frets, as the dock writes them ("Open:
  // x32010": the dock's line can be cut short by a long name; its number is
  // there and on the panel's arrows); a piano's, its keys. A custom shape:
  // a bookmark before it, as on its chip.
  const where = ch.shape && shapeWhere(ch.shape);
  els.chordShapeNote.innerHTML = !ch.shape ? 'No playable shape'
    : `${ch.shape.drawn ? BOOKMARK_ICON : ''}${esc(`${ch.shape.piano ? '' : `${where[0].toUpperCase()}${where.slice(1)}: `}${shapeShort(ch.shape)}`)}`;   // ("Fret 9: 11 12 9 11 9 9", the place apart from the frets)
  const slash = ch.bassIndex ? `/${noteText(ch.spell.notes[ch.bassIndex])}` : '';
  const aliases = (CHORD_ALIASES[ch.def.id] || []).map((a) => rootName + a + slash);
  els.chordAlt.textContent = aliases.length ? `=\u00a0${aliases.join(', ')}` : '';   // (the = never alone at a line's end)
  // With a capo, name the shape to play: the chord moved down by the capo
  const c = capo();
  els.chordCapo.hidden = !c;
  const moved = c ? spellChord(ch.root - c, ch.def, state.flats) : null;
  const shapeName = c ? noteText(moved.root) + ch.def.symbol + (ch.bassIndex ? `/${noteText(moved.notes[ch.bassIndex])}` : '') : '';
  // (one idea: wrapped, the comma stays and the second half moves whole)
  els.chordCapo.innerHTML = c ? `With capo ${c}, <span class="np-tail">play the ${esc(shapeName)} shape</span>` : '';
  els.tonesLabel.textContent = 'Shape notes, bass to top';

  // With a scale shown: does the chord fit it, and if not, which notes do not
  const outside = outsideScale(ch.root, ch.def, sc);
  els.chordKey.hidden = !outside;
  if (outside) {
    const key = scaleInText(sc);
    els.chordKey.classList.toggle('out', outside.length > 0);
    // (the notes kept together: on two lines, the break comes after the colon)
    els.chordKey.innerHTML = outside.length
      ? `<span>Outside ${esc(key)}: <span class="np-tail">${esc(outside.map((t) => noteText(ch.spell.names.get(t.pc))).join(', '))}</span></span>`
      : `<span>Every note is in ${esc(key)}</span>`;
  }

  els.shapeCount.hidden = false;
  els.shapeCount.classList.toggle('warn', !ch.shapes.length);
  els.shapeCount.textContent = ch.shapes.length ? `Shape ${ch.index + 1}/${ch.shapes.length}` : 'No shape';

  if (!ch.shape) {
    els.chordTones.innerHTML = '<li class="np-placeholder">No playable shape for this inversion on this instrument. Try “Any bass note”.</li>';
    els.chordMissing.hidden = true;
    els.shapeList.innerHTML = '';
    els.shapeList.dataset.empty = 'No shapes found';
    return;
  }

  const inst = cappedInstrument();
  // Each note, where it is played: a string and fret, or a piano key (its
  // number, 1 to 88, as pianos count them: middle C is key 40)
  const notes = inst.piano
    ? ch.shape.frets.map((k) => ({ k, midi: PIANO_LOW + k }))
    : ch.shape.frets
      .map((f, s) => ({ f, s, midi: inst.strings[s] + f }))
      .filter((x) => x.f >= 0)
      .sort((a, b) => a.midi - b.midi || a.s - b.s);
  const offKey = offKeyTest(sc);
  els.chordTones.innerHTML = notes.map((x) => {
    const deg = ch.degOfPc.get(mod12(x.midi));
    const name = pitchText(x.midi, ch.spell.names.get(mod12(x.midi)));
    const open = c && !startFret(inst, x.s) ? 'capo' : 'open';   // a banjo's drone rings open past its spike
    const loc = inst.piano ? `key ${x.k + 1}` : x.f === 0 ? `str ${stringNumber(x.s)}, ${open}` : `str ${stringNumber(x.s)}, fr ${x.f}`;
    const where = inst.piano ? `data-key="${x.k}"` : `data-s="${x.s}" data-f="${shapeNeckFret(inst, x.s, x.f, c)}"`;
    const off = offKey(x.midi);
    return `<li class="np-note${deg === 'R' ? ' root' : ''}${off ? ' off-key' : ''}" data-midi="${x.midi}" ${where} ` +
      `title="Click to hear ${esc(name)}${off ? `, not in ${scaleInText(sc)}` : ''}">` +
      `<span class="np-note-name">${esc(name)}</span>` +
      `<span class="np-deg">${tx(fmtDeg(deg))}</span>` +
      `<span class="np-role" ${fitsAttr([DEGREE_NAMES[deg], shortWords(DEGREE_NAMES[deg])])}>${esc(DEGREE_NAMES[deg])}</span>` +
      `<span class="np-loc"><kbd>${tx(loc)}</kbd></span></li>`;
  }).join('');
  refitWords(els.chordTones);   // (each interval's name: shorter where it does not fit)
  fitNotesRow();
  // The chord's notes the shape leaves out (a 13th's 9th, say: see optionalTones)
  const played = new Set(notes.map((x) => mod12(x.midi)));
  const missing = chordTones(ch.root, ch.def).filter((t) => !played.has(t.pc));
  els.chordMissing.hidden = !missing.length;
  els.chordMissing.innerHTML = missing.length
    ? `Not in this shape: <span class="np-tail">${missing.map((t) => `<span class="np-item">${esc(`${noteText(ch.spell.names.get(t.pc))} (${DEGREE_NAMES[t.deg].toLowerCase()})`)}</span>`).join(', ')}</span>`
    : '';

  els.shapeList.innerHTML = ch.shapes.map((shape, i) => {
    const where = shapeWhere(shape);
    const sel = i === ch.index;
    const what = `${shape.drawn ? 'Custom shape, ' : ''}${shape.piano ? 'notes' : 'strings'} low to high`;
    return `<li><button type="button" class="chip${sel ? ' selected' : ''}${shape.drawn ? ' custom' : ''}" data-shape="${i}" aria-pressed="${sel}" ` +
      `title="${esc(what[0].toUpperCase() + what.slice(1))}: ${esc(shapeTab(shape))}">` +
      `${shape.drawn ? BOOKMARK_ICON : ''}` + (shape.piano
        // (the piano: its notes, the lowest, where it sits, in the label's colour)
        ? `<span class="tx"><span class="chip-lead">${esc(where)}</span> ${esc(shapeTab(shape).split(' ').slice(1).join(' '))}</span></button></li>`
        : `<span class="chip-num tx">${esc(where[0].toUpperCase() + where.slice(1))}</span>` +   // ("Fret 5", "Open": as the group chips)
          `<span class="mono tx">${esc(tabOf(shape))}</span></button></li>`);
  }).join('');
  keepChipVisible();
}

/* Scroll a chip list sideways (never the page) to show the selected chip. */
function keepChipVisible(list = els.shapeList) {
  const chip = list.querySelector('.chip.selected');
  if (!chip) return;
  const li = chip.parentElement;
  const left = li.offsetLeft;
  const right = left + li.offsetWidth;
  if (left < list.scrollLeft) list.scrollLeft = left - 8;
  else if (right > list.scrollLeft + list.clientWidth) list.scrollLeft = right - list.clientWidth + 8;
}

function renderScalePanel(sc, ch) {
  // The root as the menu lists it (Flats setting), and in brackets as the
  // scale writes it when that differs: C♯ (D♭) for C♯ major
  const listed = noteText(plainNote(state.scale.root, state.flats));
  els.scaleRoot.textContent = sc && sc.rootName !== listed ? `${listed} (${sc.rootName})` : listed;
  // (shorter when the whole name does not fit: "Major (Ionian)", "Major")
  fitWords(els.scaleType, sc ? [...new Set([sc.def.name, sc.def.name.replace(/ \(.*\)$/, ''), sc.def.short])] : ['None'], 12);
  els.scaleClear.disabled = !sc;
  // The chromatic scale has every note: nothing to hide or to group
  els.tglScaleOnly.disabled = els.tglScaleGroups.disabled = !sc || sc.def.steps.length >= 12;
  renderGroupLine(sc, ch);

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
  els.scaleAlt.innerHTML = relatives.length ? `Same notes as <span class="np-tail">${relatives.map((r) => `<span class="np-item">${esc(r)}</span>`).join(', ')}</span>` : '';

  // Notes with their interval on top, and the step to the next note below
  const pill = (deg) => `<span class="scale-deg" aria-hidden="true">${tx(deg === '1' ? 'R' : deg)}</span>`;
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

/* The scale's groups as chips, from the nut up: shown while Groups is on */
function renderGroupLine(sc, ch) {
  const on = Boolean(sc && state.scaleGroups && sc.def.steps.length < 12 && !instrument().piano);   // (no groups on a piano)
  els.groupLine.hidden = !on;
  els.groupPrev.disabled = els.groupNext.disabled = ui.groups.length < 2;
  // The arrow keys step the groups when keysOnGroups says (else the chord's shapes)
  const keys = keysOnGroups(ch);
  els.groupPrev.title = `Previous group${keys ? ' (←)' : ''}`;
  els.groupNext.title = `Next group${keys ? ' (→)' : ''}`;
  // Its count by the panel's title, as the chord's shapes ("Group 2/9")
  els.groupCount.hidden = !on;
  els.groupCount.classList.toggle('warn', on && !ui.groups.length);
  els.groupCount.textContent = !on ? '' : ui.groups.length ? `Group ${ui.group + 1}/${ui.groups.length}` : 'No group';
  if (!on) { els.groupList.innerHTML = ''; return; }
  const c = capo();
  els.groupList.dataset.empty = 'No group fits on this neck';
  els.groupList.innerHTML = ui.groups.map((g, i) => {
    const sel = i === ui.group;
    const [a, b] = groupFrets(g).map((f) => f - c);   // counted from the capo
    const place = groupPlace(g, c);
    return `<li><button type="button" class="chip group-chip${sel ? ' selected' : ''}" data-group="${i}" aria-pressed="${sel}" ` +
      `title="Group ${i + 1}, frets ${a} to ${b}"><span class="tx">${place[0].toUpperCase()}${place.slice(1)}</span></button></li>`;
  }).join('');
  requestAnimationFrame(() => keepChipVisible(els.groupList));
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
  'phrygian-dominant': 'Phrygian dominant', 'lydian-dominant': 'Lydian dominant', altered: 'altered scale',
  'major-blues': 'major blues scale', hirajoshi: 'Hirajoshi scale',
};
const MODE_NAMES = ['Dorian', 'Phrygian', 'Lydian', 'Mixolydian', 'Locrian'];
const scaleTitle = (def) => SCALE_TITLES[def.id] || (MODE_NAMES.includes(def.name) ? def.name : def.name.toLowerCase());
// The scale's short name in a sentence ("Every note is in C major", "not in
// D harm. min"): lower case, as its title is, but a name (Dorian, Hirajoshi)
const scaleInText = (sc) => {
  const short = sc.def.short;
  return `${sc.rootName} ${/^[A-Z]/.test(scaleTitle(sc.def)) ? short : short[0].toLowerCase() + short.slice(1)}`;
};

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
    'chordRoot', 'chordType', 'chordInversion', 'chordClear', 'chordSymbol', 'chordName', 'chordMeta', 'chordPosition', 'chordShapeNote',
    'chordAlt', 'chordCapo', 'chordKey', 'chordStrum', 'tonesLabel', 'capoSelect', 'chordTones', 'chordMissing', 'shapeCount', 'groupCount', 'shapePrev', 'shapeNext', 'shapeList',
    'scaleRoot', 'scaleType', 'scaleClear', 'scaleNotes', 'scaleTriads', 'scaleSymbol', 'scaleName', 'scaleMeta', 'scaleAlt',
    'dockRecent', 'dockRecentList', 'dockRecentClear', 'recentLine', 'recentList', 'recentClear',
    'settings', 'settingsWideSlot', 'settingsNarrowSlot', 'instWideSlot', 'instNarrowSlot', 'sheet', 'sheetBody', 'sheetClose',
    'dockShapeBar', 'tglScaleOnly', 'tglScaleGroups', 'picker', 'pickerTitle', 'pickerBody', 'pickerClose', 'dockPrev', 'dockNext', 'dockStrum', 'dockShape', 'dockSymbol', 'dockTab',
    'tabChordValue', 'tabScaleValue', 'tabNeckValue', 'about', 'aboutOpen', 'aboutClose', 'shareOpen', 'shareStatus', 'scalePlay',
    'tuneEdit', 'tuneClose', 'tuneName', 'tuneList', 'tuneReset', 'tuneCancel', 'tuneDone',
    'tuneActions', 'tuneSave', 'tuneNaming', 'tuneSaveName', 'tuneNameCancel', 'tuneNameSave',
    'tuneDelete', 'tuneDeleteClose', 'tuneDeleteName', 'tuneDeleteNotes', 'tuneDeleteCancel', 'tuneDeleteGo',
    'listClear', 'listClearClose', 'listClearCount', 'listClearNames', 'listClearRecentCount', 'listClearRecentNames', 'listClearRecentGo', 'listClearCancel', 'listClearGo',
    'share', 'shareClose', 'shareCancel', 'shareNeck', 'shareChord', 'shareScale', 'shareRecent', 'shareGo',
    'linkOpen', 'linkClose', 'linkNeck', 'linkChord', 'linkScale', 'linkList', 'linkKeep', 'linkLoad',
    'groupLine', 'groupPrev', 'groupNext', 'groupList',
    'namer', 'namerOpen', 'namerMute', 'namerClear', 'namerPrev', 'namerNext', 'namerSymbol', 'namerText', 'namerCaption', 'namerPlay', 'namerCancel', 'namerSelect',
    'quickBar', 'quickInner', 'quickGroupBar', 'quickGroupPrev', 'quickGroupNext', 'quickGroupInfo', 'quickGroupSymbol', 'quickGroupTab', 'quickGroupPlay']) {
    els[id] = document.getElementById(id);
  }
  els.dockBar = document.querySelector('.dock-bar');
  els.neckPanel = document.querySelector('.neck-panel');
  els.dockTabs = document.querySelector('.dock-bar .tabs');
  els.panelChord = document.getElementById('panelChord');
  els.panelScale = document.getElementById('panelScale');
  els.chordBar = document.querySelector('.chord-bar');
  els.scaleBar = document.querySelector('.scale-bar');
  els.chordSwitches = document.querySelector('#panelChord .switch-row');
  els.scaleSwitches = document.querySelector('#panelScale .switch-row');
  els.chordHead = document.querySelector('#panelChord .panel-head');
  els.scaleHead = document.querySelector('#panelScale .panel-head');
  els.notesLine = document.querySelector('.notes-line');
  els.tabs = [...document.querySelectorAll('.tab')];
  els.sheetPanels = [...els.sheet.querySelectorAll('.panel[data-tab]')];
  state = loadState();
  ui.chordRoot = state.chord.root;   // (as saved: a scale root picked while no scale shows stays, see draw)
  for (const r of [...state.list, ...state.recent]) if (r.bass === undefined) r.bass = legacyBass(r);   // (saved before chips had a bass)
  const { root, type } = state.chord;
  const chips = [...state.list, ...state.recent];
  // the chord on screen as its chip remembers it (inversion, shape): the chip
  // it was saved as (saved before: its only chip)
  // (no bass saved with it: the root, as a link's; saved before chips had
  // a bass: its only chip, whatever its bass)
  if (state.chord.on) recallChip(chips.find((r) => sameEntry(r, { root, type, bass: state.chordBass ?? 0 })) || chips.find((r) => r.root === root && r.type === type));
  delete state.chordBass;
  startLink(location.search);   // opened from a shared link

  // Instrument and tuning: popups, each tile showing the open strings
  els.instrumentPicker.addEventListener('click', () => openPicker({
    title: 'Instrument', value: state.instrument,
    groups: [...new Set(INSTRUMENTS.map((i) => i.family))].map((family) => ({   // one group per family
      label: family,
      items: INSTRUMENTS.filter((i) => i.family === family).map((i) => {
        const t = tunedInstrument(i.id, state.tuning[i.id]);
        // a preset in its usual spelling (Open D's F♯, E♭ for half step down);
        // a custom tuning as the Flats switch says
        const flats = t.tuning.custom || t.tuning.saved ? state.flats : Boolean(t.tuning.flats);
        return { value: i.id, label: i.name, sub: i.piano ? '88 keys, A0 to C8' : tuningNotes(t.strings, flats, i.id) };
      }),
    })),
    onPick: (v) => {
      if (v === state.instrument) return;
      changeNeck(() => { state.instrument = v; });   // (the chord keeps its bass; else as last used on that instrument)
      render();
    },
  }));
  els.tuningSelect.addEventListener('click', openTuningMenu);
  // Custom tuning popup
  els.tuneList.addEventListener('click', (e) => {
    const step = e.target.closest('[data-step]');
    if (step) { tuneStep(Number(step.dataset.string), Number(step.dataset.step)); return; }
    const reset = e.target.closest('[data-reset]');   // one string back to standard
    if (reset) {
      const s = Number(reset.dataset.reset);
      const strings = tune.draft.slice();
      strings[s] = tuningsOf(state.instrument)[0].strings[s];
      tuneSet(strings);
      return;
    }
  });
  onPress(els.tuneList, '[data-play]', (note) => { playNote(Number(note.dataset.play)); ping(note); });   // heard, with the amber flash
  els.tuneReset.addEventListener('click', () => tuneSet(tuningsOf(state.instrument)[0].strings.slice()));
  els.tuneDone.addEventListener('click', () => closeTuneEdit(true));
  els.tuneCancel.addEventListener('click', () => closeTuneEdit(false));
  els.tuneClose.addEventListener('click', () => closeTuneEdit(false));
  els.tuneEdit.addEventListener('click', (e) => { if (e.target === els.tuneEdit) closeTuneEdit(false); });
  els.tuneEdit.addEventListener('close', () => closeTuneEdit(false));   // Escape
  // Escape while naming: back to the buttons, the popup stays
  els.tuneEdit.addEventListener('cancel', (e) => { if (!els.tuneNaming.hidden) { e.preventDefault(); endNaming(); } });
  els.tuneSave.addEventListener('click', startNaming);
  els.tuneSaveName.addEventListener('input', updateNaming);
  els.tuneNameCancel.addEventListener('click', endNaming);
  els.tuneNaming.addEventListener('submit', (e) => { e.preventDefault(); saveTune(); });   // Save, or Enter
  // Delete a saved tuning
  els.tuneDeleteGo.addEventListener('click', deleteTuning);
  els.tuneDeleteCancel.addEventListener('click', closeDeleteTuning);
  els.tuneDeleteClose.addEventListener('click', closeDeleteTuning);
  els.tuneDelete.addEventListener('click', (e) => { if (e.target === els.tuneDelete) closeDeleteTuning(); });
  els.tuneDelete.addEventListener('close', () => { deleting = null; });   // Escape

  for (const [id, key] of TOGGLES) {
    els[id].addEventListener('click', () => {
      state[key] = !state[key];
      render();
    });
  }

  setupNeckTaps();
  startAudioEarly();
  onPress(els.chordTones, '[data-midi]', (card) => {
    playNote(Number(card.dataset.midi));
    ping(card.querySelector('.np-deg'));   // its interval pill, like the note on the neck
    if (card.dataset.key !== undefined) flashKey(card.dataset.key); else flashCell(card.dataset.s, card.dataset.f);
    keepChord();
  });
  // Strum buttons sound on press, like a plucked string. A click from the
  // keyboard (Enter, or Space on a button reached with Tab) still strums.
  // With no chord, the dock's button plays the scale group shown.
  const strumOrPlay = () => (keysOnGroups() ? playGroup() : strum());
  // (on touch screens, as the neck's notes: a swipe to scroll that starts
  // on them plays nothing, onPress)
  for (const btn of [els.chordStrum, els.dockStrum, els.quickGroupPlay]) {
    const act = btn === els.dockStrum ? () => (ui.dockMode === 'group' ? playGroup() : strum()) : btn === els.quickGroupPlay ? playGroup : strum;
    onPress(btn, null, act);
  }

  // Name a chord: in and out, Mute, Clear, the names; Play sounds on press
  els.namerOpen.addEventListener('click', openNamer);
  els.namerSelect.addEventListener('click', () => closeNamer(true));
  els.namerCancel.addEventListener('click', () => closeNamer(false));
  els.namerClear.addEventListener('click', namerClear);
  els.namerPrev.addEventListener('click', () => namerStep(-1));
  els.namerNext.addEventListener('click', () => namerStep(1));
  els.namerMute.addEventListener('click', () => { state.muteTaps = !state.muteTaps; render(); });
  onPress(els.namerPlay, null, namerPlay);

  // The chord list and the recent chords: tap to switch, × on the current
  // list chip to take it out, + on a recent one to put it in, Clear to
  // start over
  for (const list of [els.dockRecentList, els.recentList]) {
    // The × and the + act only when the press started on them (a drag
    // ending over one, or a press that slid onto it, does nothing)
    let pressed = null;
    list.addEventListener('pointerdown', (e) => { pressed = e.target.closest('[data-remove], [data-pin]'); }, true);
    list.addEventListener('click', (e) => {
      const side = e.target.closest('[data-remove], [data-pin]');
      if (side) {
        if (e.detail !== 0 && side !== pressed) return;
        if (side.dataset.remove !== undefined) unpinChord(Number(side.dataset.remove));
        else pinChord(Number(side.dataset.pin));
        return;
      }
      const chip = e.target.closest('[data-i], [data-r]');
      if (chip) playChip(chip.dataset.i !== undefined ? state.list[Number(chip.dataset.i)] : state.recent[Number(chip.dataset.r)]);
    });
  }
  for (const list of [els.dockRecentList, els.recentList]) {
    setupChipDrag(list);
    list.addEventListener('scroll', () => scrollHint(list), { passive: true });
    if (window.ResizeObserver) new ResizeObserver(() => { scrollHint(list); fitDashes(list); }).observe(list);   // shown, rotated, resized
  }
  els.dockRecentClear.addEventListener('click', askClearRecent);
  els.recentClear.addEventListener('click', askClearRecent);
  els.listClearGo.addEventListener('click', clearRecent);
  els.listClearRecentGo.addEventListener('click', clearRecentOnly);
  els.listClearCancel.addEventListener('click', closeClearRecent);
  els.listClearClose.addEventListener('click', closeClearRecent);
  els.listClear.addEventListener('click', (e) => { if (e.target === els.listClear) closeClearRecent(); });

  // Dock (phones): shape bar, tabs and the sheet they open
  // (no chord: the scale's groups)
  // The dock's stepper: the chord's shapes or the scale's groups, as it shows (renderDock)
  const dockGroups = () => ui.dockMode === 'group';
  els.dockPrev.addEventListener('click', () => (dockGroups() ? selectGroup(ui.group - 1) : stepShape(-1)));
  els.dockNext.addEventListener('click', () => (dockGroups() ? selectGroup(ui.group + 1) : stepShape(1)));
  els.dockShape.addEventListener('click', () => showPanel(dockGroups() ? 'scale' : 'chord'));
  // The groups' stepper (wide screens, in the quick bar)
  els.quickGroupPrev.addEventListener('click', () => selectGroup(ui.group - 1));
  els.quickGroupNext.addEventListener('click', () => selectGroup(ui.group + 1));
  els.quickGroupInfo.addEventListener('click', () => showPanel('scale'));
  for (const tab of els.tabs) tab.addEventListener('click', () => openTab(tab.dataset.tab));
  setupSheetDrag();
  setupFolds();
  setupInfoFit();
  setupDockTouch();

  // Switching between phone and wide layouts (rotating, resizing)
  const relayout = () => {
    placeSettings();
    if (isWide()) ui.tab = null;
    render();
    requestAnimationFrame(refocus);   // (once the new layout is in place)
  };
  if (wideMedia.addEventListener) wideMedia.addEventListener('change', relayout);
  else wideMedia.addListener(relayout);
  if (window.ResizeObserver) {
    new ResizeObserver(() => { drawGroups(); queueStrip(); }).observe(els.neck);   // keep group outlines on their cells
  }
  // The strip follows the page (phones) and the neck's own scroll (wide screens)
  window.addEventListener('scroll', queueStrip, { passive: true });
  window.addEventListener('resize', queueStrip, { passive: true });
  window.addEventListener('resize', () => { if (els.picker.open) peekPicker(); }, { passive: true });
  els.neck.parentElement.addEventListener('scroll', queueStrip, { passive: true });

  // Root alone never turns a chord or scale on: "None" in the type menu means off
  // Moving the capo keeps the chord and shows its first shape from the capo
  els.capoSelect.addEventListener('click', () => openPicker({
    title: 'Capo', layout: 'roots', value: capo(),
    groups: [
      { items: [{ value: 0, label: 'No capo', cls: 'none', style: 'grid-column: 1 / -1' }] },
      { label: 'Fret where the capo sits', items: Array.from(
        { length: maxCapo(state.instrument) },
        (_, i) => ({ value: i + 1, label: String(i + 1) })) },
    ],
    onPick: (v) => { changeNeck(() => setCapo(Number(v))); render(); },
  }));

  // Clearing the chord or the scale also closes its panel on phones
  const clearChord = () => { chordOff(); ui.tab = null; render(); };
  const clearScale = () => {   // closes the sheet: centre the shape again, as on closing it
    const wasOpen = ui.tab !== null;
    scaleOff();
    ui.tab = null;
    render();
    if (wasOpen) revealFocus();
  };

  // Root and type buttons open the picker popup
  els.chordRoot.addEventListener('click', () => openPicker({
    title: 'Chord root', layout: 'roots', value: state.chord.root,
    note: state.chord.on ? fitsNote(currentScale()) : rootNote(currentScale()),
    noteNone: 'No root fits this chord type and scale',
    groups: state.chord.on
      ? rootItems((pc) => chordSpelling(pc, findChord(state.chord.type)).root, (pc) => fitsScale(pc, findChord(state.chord.type), currentScale()))
      : rootItems((pc) => plainRoot(pc), (pc) => inScale(pc, currentScale())),
    onPick: (v) => {
      const root = Number(v);
      if (state.chord.on) updateChord({ root });
      else { state.chord.root = root; render(); }
    },
  }));
  els.chordType.addEventListener('click', () => openPicker({
    title: 'Chord type', note: fitsNote(currentScale()), noteNone: 'No chord type fits this root and scale',
    groups: [{ items: [{ value: '', label: 'None', sub: 'Hide the chord', cls: 'none' }] }, ...CHORDS.map((g) => ({
      label: g.group,
      items: g.items.map((c) => ({
        value: c.id,
        label: c.name,
        tag: noteText(chordSpelling(state.chord.root, c).root) + c.symbol,
        // (in brackets: notes a shape may leave out, here: this instrument and bass note)
        sub: (() => {
          const optional = optionalTones(c, inversionFor(c), Boolean(instrument().piano));
          return chordSpelling(state.chord.root, c).notes.map((n, i) => (optional.has(i) ? `(${noteText(n)})` : noteText(n))).join(' ');
        })(),
        cls: fitsScale(state.chord.root, c, currentScale()) ? 'fits' : '',
      })),
    }))],
    value: state.chord.on ? state.chord.type : '',
    onPick: (v) => (v ? updateChord({ type: v }) : clearChord()),
  }));
  els.scaleRoot.addEventListener('click', () => openPicker({
    title: 'Scale root', layout: 'roots', value: state.scale.root,
    // Plain names (Flats setting): picking a root starts a new scale, unrelated
    // to the one shown, which then names its root its own way (C♯ major: D♭)
    groups: rootItems((pc) => plainNote(pc, state.flats)),
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
    const remove = e.target.closest('[data-remove]');
    if (remove) { if (pickerRemove) pickerRemove(remove.dataset.remove); return; }
    const pick = e.target.closest('.pick');
    if (!pick) return;
    const handler = pickerPick;
    closePicker();
    if (handler) handler(pick.dataset.value);
  });
  els.pickerClose.addEventListener('click', closePicker);
  // About popup: opened from the header, closed like the picker
  els.shareOpen.addEventListener('click', openShare);
  els.shareClose.addEventListener('click', closeShare);
  els.share.addEventListener('click', (e) => { if (e.target === els.share) closeShare(); });
  els.shareCancel.addEventListener('click', closeShare);
  for (const [btn, key] of [[els.shareNeck, 'neck'], [els.shareChord, 'chord'], [els.shareScale, 'scale'], [els.shareRecent, 'list']]) {
    btn.addEventListener('click', () => { state.share[key] = !state.share[key]; saveState(); renderShare(); });
  }
  els.shareGo.addEventListener('click', shareLink);
  // Open link popup
  for (const [btn, key] of [[els.linkNeck, 'neck'], [els.linkChord, 'chord'], [els.linkScale, 'scale'], [els.linkList, 'recent']]) {
    btn.addEventListener('click', () => { pendingLink.parts[key] = !pendingLink.parts[key]; renderLinkPopup(); });
  }
  els.linkLoad.addEventListener('click', () => closeLink(true));
  els.linkKeep.addEventListener('click', () => closeLink(false));
  els.linkClose.addEventListener('click', () => closeLink(false));
  els.linkOpen.addEventListener('click', (e) => { if (e.target === els.linkOpen) closeLink(false); });
  els.linkOpen.addEventListener('close', () => closeLink(false));   // Escape
  // Play (Stop) on press, like the strum buttons; from the keyboard too
  onPress(els.scalePlay, null, playScale);
  // A note of the Notes row: heard on press (a swipe to scroll the row plays nothing)
  onPress(els.scaleNotes, '.scale-note', (note) => playScaleNote(Number(note.dataset.i)));
  els.aboutOpen.addEventListener('click', () => { if (els.about.showModal) els.about.showModal(); else els.about.setAttribute('open', ''); });
  const closeAbout = () => { if (els.about.close) els.about.close(); else els.about.removeAttribute('open'); };
  els.aboutClose.addEventListener('click', closeAbout);
  els.about.addEventListener('click', (e) => { if (e.target === els.about) closeAbout(); });
  // A tap on the dimmed backdrop (outside the card) closes the popup
  els.picker.addEventListener('click', (e) => { if (e.target === els.picker) closePicker(); });
  els.chordInversion.addEventListener('click', () => {
    const def = findChord(state.chord.type);
    const spell = chordSpelling(state.chord.root, def);
    openPicker({
      title: 'Inversion', value: inversionFor(def),
      groups: [{ label: 'Bass note, the lowest one played', items: [
        ...chordTones(state.chord.root, def).map((t, i) => ({
          value: String(i),
          label: INVERSION_NAMES[i],
          tag: noteText(spell.notes[i]),
          sub: i === 0 ? 'Root in the bass' : `${fmtDeg(t.deg)} in the bass`,
        })),
        { value: 'any', label: 'Any bass note', sub: 'Any inversion' },
      ] }],
      onPick: (v) => { state.inversion[state.instrument] = v; updateChord({}); },
    });
  });
  els.chordClear.addEventListener('click', clearChord);
  els.shapePrev.addEventListener('click', () => stepShape(-1));
  els.shapeNext.addEventListener('click', () => stepShape(1));
  els.shapeList.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-shape]');
    if (chip) selectShape(Number(chip.dataset.shape));
  });
  els.groupPrev.addEventListener('click', () => selectGroup(ui.group - 1));
  els.groupNext.addEventListener('click', () => selectGroup(ui.group + 1));
  els.groupList.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-group]');
    if (chip) selectGroup(Number(chip.dataset.group));
  });

  els.scaleClear.addEventListener('click', clearScale);
  els.scaleTriads.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-type]');
    if (chip) updateChord({ root: Number(chip.dataset.root), type: chip.dataset.type });
  });

  // ← / → cycle through the shapes, Space strums, Escape closes the open
  // sheet. With no chord, ← / → step through the scale's groups and Space
  // plays the one shown. Space strums as soon as it is pressed, once per press. It is left
  // to a focused button only when you are moving around with the keyboard
  // (Tab): a button that has the focus after a click or a tap (Strum, a
  // switch, or the menu button a popup hands the focus back to) would
  // otherwise take Space and act on it.
  // A control that takes the keyboard focus shows whole, with its focus ring
  // (browsers leave one that is half out of a scrolling row where it is, its
  // ring cut off): the row, the popup or the page scrolls just enough (the
  // room is the controls' scroll-margin in styles.css). Taps and clicks
  // scroll nothing.
  document.addEventListener('focusin', (e) => {
    if (e.target.matches && e.target.matches(':focus-visible')) e.target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
  let keyboardFocus = false;   // the focus was last moved with the keyboard
  document.addEventListener('pointerdown', () => { keyboardFocus = false; }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Tab') keyboardFocus = true; }, true);
  const popupOpen = () => !!document.querySelector('dialog[open]');
  const spaceStrums = (e) => e.key === ' ' && !popupOpen() && !e.altKey && !e.ctrlKey && !e.metaKey &&
    !e.target.closest('input, textarea') && !(e.target.closest('button') && keyboardFocus);
  document.addEventListener('keyup', (e) => { if (spaceStrums(e)) e.preventDefault(); });   // no click on release
  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (popupOpen()) return;   // a popup handles its own keys (Escape closes it)
    if (naming) {   // Name a chord: Escape leaves it, Space plays the notes placed, ← / → the names
      if (e.key === 'Escape') { e.preventDefault(); closeNamer(false); return; }
      if (spaceStrums(e)) { e.preventDefault(); if (!e.repeat) namerPlay(); }
      else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.target.closest('input, textarea')) {
        e.preventDefault();
        namerStep(e.key === 'ArrowRight' ? 1 : -1);   // another name, the same notes
      }
      return;
    }
    if (e.key === 'Escape' && ui.tab) { openTab(null); return; }
    if (e.target.closest('input, textarea')) return;
    if (spaceStrums(e)) {
      e.preventDefault();
      if (!e.repeat) strumOrPlay();   // holding Space strums once: release it to strum again
      return;
    }
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const step = e.key === 'ArrowRight' ? 1 : -1;
    const ch = currentChord();
    if (keysOnGroups(ch)) {
      if (ui.groups.length > 1) { e.preventDefault(); selectGroup(ui.group + step); }
      return;
    }
    if (!ch || ch.shapes.length < 2) return;
    e.preventDefault();
    selectShape(ch.index + step);
  });

  placeSettings();
  render();
  if (pendingLink) openLinkPopup();
  keepScreenOn();
  installable();
  setupInstallTip();
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

/* Suggest installing the app, gently: only in a browser that can (or
   where it can be done by hand: not in another app's built-in browser),
   only if not installed already, and only once the app has been in use a
   while on this visit (two minutes on screen and a few taps), at a pause
   (a few seconds without one), never right away. It stays until answered. "Not now": asked once more on a visit a
   week or more later (again after a while); "Not now" again, or the app
   installed: never again. "Install": the browser's own install where it
   offers one, else the steps for this browser. */
const INSTALL_KEY = 'frettle-install-tip';
const INSTALL_AFTER = 120;   // seconds on screen this visit
const INSTALL_TAPS = 6;      // ... and presses (a touch, a click or a key)
const INSTALL_PAUSE = 4000;  // ms without one, just before
const INSTALL_AGAIN = 7 * 24 * 3600 * 1000;   // ms before asking the second time
function setupInstallTip() {
  const tip = document.getElementById('installTip');
  const text = document.getElementById('installText');
  const later = document.getElementById('installLater');
  const now = document.getElementById('installNow');
  // To try it: the address with ?install-tip shows it at once, whatever was
  // answered before, and keeps no answer
  const trying = new URLSearchParams(location.search).has('install-tip');
  const read = () => { try { return JSON.parse(localStorage.getItem(INSTALL_KEY)) || {}; } catch { return {}; } };
  const write = (v) => { if (trying) return; try { localStorage.setItem(INSTALL_KEY, JSON.stringify(v)); } catch { /* not kept: asked again next visit */ } };
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  if (standalone && !trying) { write({ ...read(), installed: true }); return; }
  let offer = null;   // the browser's own install (Chrome, Edge, Samsung Internet...)
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); offer = e; });   // (its own banner: not shown, this one is, later)
  window.addEventListener('appinstalled', () => { write({ ...read(), installed: true }); tip.hidden = true; });

  // Where installing is done by hand: the steps (null: not possible here,
  // without the browser's own). Not in another app's built-in browser
  // (Instagram, Facebook...: no "Add to Home Screen" there): on iPhones those
  // leave Safari's name out of theirs, or add their own. Chrome, Edge,
  // Samsung Internet on Android offer their own install (none: installed
  // already, or not possible).
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const inApp = /FBAN|FBAV|Instagram|Line\/|MicroMessenger|Snapchat|TikTok|musical_ly|Bytedance|Pinterest|LinkedInApp|GSA\/|; wv\)/.test(ua) || (ios && !/Safari\//.test(ua));
  const macSafari = !ios && /Macintosh/.test(ua) && /Version\/(\d+)/.test(ua) && Number(ua.match(/Version\/(\d+)/)[1]) >= 17 && /Safari/.test(ua) && !/Chrome|Chromium|Edg|Firefox|OPR/.test(ua);   // ("Add to Dock": Safari 17 on)
  const SHARE_ICON = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>';
  const steps = inApp ? null
    : ios ? `Tap ${SHARE_ICON} Share, then “More” (if shown), then “Add to Home Screen”.`
      : macSafari ? 'In the menu bar: File, then “Add to Dock”.'
        : /Android/.test(ua) && /Firefox/.test(ua) ? 'Open the menu (⋮), then “Install”.'
          : trying ? 'Open the browser’s menu, then “Install” or “Add to Home Screen”.'   // (trying it where the browser offers its own, or none)
            : null;

  const due = () => {
    const v = read();
    if (v.installed || (v.declined || 0) >= 2) return false;
    return !v.declined || Date.now() - (v.at || 0) >= INSTALL_AGAIN;
  };
  if (!due() && !trying) return;
  // Installed already? Chrome and Edge can tell (manifest.json:
  // related_applications); elsewhere it can't be known from the browser
  let installed = false;
  if (navigator.getInstalledRelatedApps) {
    navigator.getInstalledRelatedApps().then((apps) => {
      if (apps.length) { installed = true; write({ ...read(), installed: true }); }
    }).catch(() => { /* unknown: as if not */ });
  }
  const answer = () => {   // "Not now", or the steps read
    const v = read();
    write({ ...v, declined: (v.declined || 0) + 1, at: Date.now() });
    tip.hidden = true;
  };
  later.addEventListener('click', answer);
  now.addEventListener('click', async () => {
    if (offer) {
      const asked = offer;
      offer = null;   // (the browser's install asks only once)
      asked.prompt();
      const { outcome } = await asked.userChoice.catch(() => ({ outcome: 'dismissed' }));
      if (outcome === 'accepted') { write({ ...read(), installed: true }); tip.hidden = true; } else answer();
      return;
    }
    text.innerHTML = `<strong>Install Frettle</strong><span>${steps}</span>`;
    later.hidden = true;
    now.textContent = 'Done';
    now.classList.remove('primary');
    now.onclick = answer;   // (replaces this handler's work: the steps are read)
  }, { once: true });
  if (trying) { tip.hidden = false; return; }

  // On screen and in use a while (time only counts while the page shows)
  let seconds = 0;
  let taps = 0;
  let lastTap = 0;
  const tap = () => { taps++; lastTap = performance.now(); };
  document.addEventListener('pointerdown', tap, true);
  document.addEventListener('keydown', tap, true);
  const tick = setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    seconds++;
    if (installed) { clearInterval(tick); return; }
    if (seconds < INSTALL_AFTER || taps < INSTALL_TAPS || performance.now() - lastTap < INSTALL_PAUSE) return;
    if (document.querySelector('dialog[open]') || !(offer || steps)) return;   // (a menu open: once it closes; no way to install yet: maybe later)
    clearInterval(tick);
    document.removeEventListener('pointerdown', tap, true);
    document.removeEventListener('keydown', tap, true);
    tip.hidden = false;
  }, 1000);
}

if (typeof document !== 'undefined') init();
