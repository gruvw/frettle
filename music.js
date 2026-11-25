'use strict';

/* ==========================================================================
   Frettle: chord and scale visualizer. Its script comes in four parts,
   loaded in this order (index.html), into one scope, as one script:
     music.js   1. Music data, 2. Chord shape finder, chord names (no page)
     state.js   3. State: settings, saving, links, sharing, tabs in step
     sound.js   4. Sound, and the tuner
     app.js     Name a chord, 5. Rendering, 6. Events, the start
   A part uses what a later one makes only once the page has started (in a
   function called then), never as it loads. tests/ run the four the same
   way, without a page (test/frettle.js).
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
   A keyboard has keys, not strings (`piano`): `keys` of them from MIDI `low`
   up. The piano: 88, from A0 (21) to C8 (108), white keys and black as a
   piano's (7 and 5 an octave); the Uniso: 97, from C0 (12) to C8, a 6-6
   whole-tone keyboard (`wholeTone`: 6 white keys an octave, C D E F♯ G♯
   A♯, and 6 black keys, C♯ D♯ F G A B, one between each two whites). No
   tuning or capo; its scale groups are an octave each (keyboardGroups);
   a chord's shapes are its notes close together,
   one place on the keyboard after another (pianoShapes), written as key
   numbers counted from its lowest key (the piano's 0 to 87). */
const PIANO_LOW = 21;
const PIANO_KEYS = 88;
const INSTRUMENTS = [
  { id: 'guitar', family: 'Guitar', name: 'Guitar', short: 'Guitar', strings: [40, 45, 50, 55, 59, 64], frets: 24 },
  { id: 'guitar7', family: 'Guitar', name: '7-string Guitar', short: '7-string', strings: [35, 40, 45, 50, 55, 59, 64], frets: 24 },
  { id: 'bass', family: 'Bass', name: 'Bass', short: 'Bass', strings: [28, 33, 38, 43], frets: 24 },
  { id: 'bass5', family: 'Bass', name: '5-string Bass', short: '5-string', strings: [23, 28, 33, 38, 43], frets: 24 },
  { id: 'ukulele', family: 'Ukulele', name: 'Ukulele', short: 'Ukulele', strings: [67, 60, 64, 69], frets: 18, smallFrets: true },
  { id: 'baritone', family: 'Ukulele', name: 'Baritone Ukulele', short: 'Baritone', strings: [50, 55, 59, 64], frets: 18, smallFrets: true },
  { id: 'piano', family: 'Keyboard', name: 'Piano', short: 'Piano', strings: [], frets: 0, piano: true, low: PIANO_LOW, keys: PIANO_KEYS },
  { id: 'uniso', family: 'Keyboard', name: 'Uniso', short: 'Uniso', strings: [], frets: 0, piano: true, low: 12, keys: 97, wholeTone: true },
  { id: 'mandolin', family: 'Mandolin', name: 'Mandolin', short: 'Mandolin', strings: [55, 62, 69, 76], frets: 24, span: 5, smallFrets: true, fifths: true },
  { id: 'mandola', family: 'Mandolin', name: 'Mandola', short: 'Mandola', strings: [48, 55, 62, 69], frets: 24, span: 5, smallFrets: true, fifths: true },
  { id: 'banjo', family: 'Banjo', name: 'Banjo', short: 'Banjo', strings: [67, 50, 55, 59, 62], starts: [5, 0, 0, 0, 0], frets: 22,
    dots: { single: [3, 5, 7, 10, 15, 17, 19, 22], double: [12] } },
];
/* Other tunings, for the instruments that have common ones; the first is the
   standard tuning. `flats`: write its notes with flats (E♭ standard). `short`:
   for the Setup tab on phones, when the name is too long for it. */
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
  mandola: [
    { id: 'standard', name: 'Standard', strings: [48, 55, 62, 69] },
    { id: 'octave', name: 'Octave', strings: [43, 50, 57, 64] },   // the octave mandola, G2 D3 A3 E4: a mandolin's notes, an octave down
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
  guitar: '0', guitar7: '0', bass: '0', bass5: '0', ukulele: 'any', baritone: 'any', mandolin: 'any', mandola: 'any', banjo: 'any', piano: '0', uniso: '0' };
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
   The shape finder never frets the drone; a shape placed in Name a chord
   may (a fret past its start). */
const shapeNeckFret = (inst, s, f, capo) => (f === 0 ? startFret(inst, s) : f) + capo;
// Pitch of a shape's fret on string s (inst: with the capo on, see cappedInstrument)
const shapePitch = (inst, s, f) => inst.strings[s] + (f > 0 ? f - startFret(inst, s) : 0);

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
    { id: 'blues', name: 'Minor blues', short: 'Min. blues', steps: [0, 3, 5, 6, 7, 10] },   // (id: as links have it)
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

/* Chords: semitone steps from the root and the interval label of each tone.
   Their symbol and name: as any chord's, from its degrees, by the one namer
   (describeChord, applied after it): C7(♭9), "Dominant 7th with ♭9", as
   Name a chord writes C7(♭9,♯9); the power chord's its own. */
const chord = (id, steps, degrees, own = {}) => ({ id, steps, degrees: degrees.split(' '), ...own });
const CHORDS = [
  { group: 'Triads', items: [
    chord('maj', [0, 4, 7], 'R 3 5'),
    chord('min', [0, 3, 7], 'R b3 5'),
    chord('dim', [0, 3, 6], 'R b3 b5'),
    chord('aug', [0, 4, 8], 'R 3 #5'),
    chord('sus2', [0, 2, 7], 'R 2 5'),
    chord('sus4', [0, 5, 7], 'R 4 5'),
    chord('p5', [0, 7], 'R 5', { name: 'Power chord', symbol: '5' }),   // (a chord of its own: not the interval, C(P5))
  ] },
  { group: 'Sixths & sevenths', items: [
    chord('6', [0, 4, 7, 9], 'R 3 5 6'),
    chord('m6', [0, 3, 7, 9], 'R b3 5 6'),
    chord('7', [0, 4, 7, 10], 'R 3 5 b7'),
    chord('maj7', [0, 4, 7, 11], 'R 3 5 7'),
    chord('m7', [0, 3, 7, 10], 'R b3 5 b7'),
    chord('mmaj7', [0, 3, 7, 11], 'R b3 5 7'),
    chord('m7b5', [0, 3, 6, 10], 'R b3 b5 b7'),
    chord('dim7', [0, 3, 6, 9], 'R b3 b5 bb7'),
    chord('aug7', [0, 4, 8, 10], 'R 3 #5 b7'),
    chord('7sus4', [0, 5, 7, 10], 'R 4 5 b7'),
  ] },
  { group: 'Extended', items: [
    chord('add9', [0, 4, 7, 14], 'R 3 5 9'),
    chord('madd9', [0, 3, 7, 14], 'R b3 5 9'),
    chord('69', [0, 4, 7, 9, 14], 'R 3 5 6 9'),
    chord('9', [0, 4, 7, 10, 14], 'R 3 5 b7 9'),
    chord('maj9', [0, 4, 7, 11, 14], 'R 3 5 7 9'),
    chord('m9', [0, 3, 7, 10, 14], 'R b3 5 b7 9'),
    chord('7b9', [0, 4, 7, 10, 13], 'R 3 5 b7 b9'),
    chord('7s9', [0, 4, 7, 10, 15], 'R 3 5 b7 #9'),
    chord('m11', [0, 3, 7, 10, 14, 17], 'R b3 5 b7 9 11'),
    chord('13', [0, 4, 7, 10, 14, 21], 'R 3 5 b7 9 13'),
  ] },
];

/* Other common ways to write each chord symbol. */
const CHORD_ALIASES = {
  maj: ['M', 'maj'], min: ['min', '−'], dim: ['°', 'm♭5'], aug: ['+', '(♯5)'], p5: ['(no3)'],
  6: ['M6', 'maj6'], m6: ['min6', '−6'], 7: ['dom7'], maj7: ['M7', 'Δ7'], m7: ['min7', '−7'],
  mmaj7: ['mM7', 'mΔ7'], m7b5: ['ø7', 'min7♭5'], dim7: ['°7'], aug7: ['+7', '7♯5'],
  add9: ['add2'], madd9: ['m(add2)'], maj9: ['M9', 'Δ9'], m9: ['min9', '−9'], 69: ['6add9'],
  '7b9': ['7♭9'], '7s9': ['7♯9'],
};
const DEGREE_NAMES = {
  R: 'Root', b2: 'Minor 2nd', 2: 'Major 2nd', b3: 'Minor 3rd', 3: 'Major 3rd', 4: 'Perfect 4th',
  b5: 'Diminished 5th', 5: 'Perfect 5th', '#5': 'Augmented 5th', 6: 'Major 6th',
  bb7: 'Diminished 7th', b7: 'Minor 7th', 7: 'Major 7th', b9: 'Minor 9th', 9: 'Major 9th',
  '#9': 'Augmented 9th', 11: 'Perfect 11th', 13: 'Major 13th',
  b6: 'Minor 6th', '#11': 'Augmented 11th', b13: 'Minor 13th',
};
// (as many as a chord can have notes: the namer's readings run to twelve,
// every note, and its bass can be any of them)
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
const fmtDeg = (d) => d.replace(/bb/g, '𝄫').replace(/##/g, '𝄪').replace(/b/g, '♭').replace(/#/g, '♯');   // (♭♭7 as 𝄫7)

function chordTones(rootPc, def) {
  return def.steps.map((step, i) => ({ pc: mod12(rootPc + step), deg: def.degrees[i] }));
}
// A degree in words: "Major 3rd"; past the 13th's, as an interval over an
// octave ("Minor 10th", "Major 16th")
function degreeName(d) {
  if (DEGREE_NAMES[d]) return DEGREE_NAMES[d];
  const m = /^(b|#)?(\d+)$/.exec(d);
  if (!m) return '';
  const n = Number(m[2]);
  if (!m[1] && n > 1 && (n - 1) % 7 === 0) return OCTAVE_WORDS[(n - 1) / 7] || `${(n - 1) / 7}-octave`;   // (8: "Perfect octave", 15: "Double octave", as the interval)
  const perfect = [1, 4, 5].includes(((n - 1) % 7) + 1);
  return `${m[1] === '#' ? 'Augmented' : m[1] === 'b' ? (perfect ? 'Diminished' : 'Minor') : perfect ? 'Perfect' : 'Major'} ${ordinalOf(n)}`;
}

/* ==========================================================================
   Note spelling
   Notes are named the way a key is written. Each note of a scale or chord
   gets its letter from its degree (a 7-note scale uses each letter once, a
   chord's 3rd is two letters above its root...), and its sharp or flat from
   its pitch: F major has B♭ (not A♯), G♯ harmonic minor has F𝄪, Cdim7 is
   C E♭ G♭ B𝄫. A black-key root is spelled like the major or minor key with
   fewer accidentals (D♭ major, C♯ minor); when both are equal (F♯/G♭ major,
   D♯/E♭ minor) the Flats switch decides. Notes outside the key follow the
   key's direction (sharps in sharp keys, flats in flat keys). A root's
   other name can take a note to three (B♯aug: B♯ D𝄪 F♯𝄪).
   ========================================================================== */
const LETTERS = 'CDEFGAB';
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];
// Sharps (+) or flats (-): a pair as its own sign, 𝄪 or 𝄫, one more before
// it (three: ♯𝄪, ♭𝄫). The four signs drawn by accidentals.woff2 (styles.css).
const accText = (n) => (n % 2 ? (n > 0 ? '♯' : '♭') : '') + (n > 0 ? '𝄪' : '𝄫').repeat(Math.floor(Math.abs(n) / 2));
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
const noteText = (n) => LETTERS[n.letter] + accText(n.acc);
/* Octave numbers follow the letter: B♯3 sounds like C4, C♭4 like B3. */
const pitchText = (midi, n) => noteText(n) + (Math.floor((midi - n.acc) / 12) - 1);
/* A note with no key to follow: natural, or sharp / flat as asked. */
function plainNote(pc, flats) {
  pc = mod12(pc);
  if (LETTER_PC.includes(pc)) return spellAs(pc, LETTER_PC.indexOf(pc));
  return spellAs(pc, LETTER_PC.indexOf(mod12(pc + (flats ? 1 : -1))));
}

/* Names from capo: with a capo on a fretted neck and that switch on (one
   setting for all instruments, on by default), everything is named by the
   note played above the capo, as song sheets write it ("Capo 2: G", the G
   shape, sounding A): spelled from the played note (what sounds less the
   capo), with every rule as usual (the easier key, Flats, the scale's
   names), then kept by the pitch that sounds. So a spelling's notes keep
   the pitch class that sounds (pc), with the played note's letter and sign
   (acc), and its names are looked up by what sounds, as everywhere else;
   only names change, never what is stored or played (links and saved
   settings write what sounds: atShift(0)). Keyboards have no capo: named
   as they sound. nameShift(): the capo named from, or 0 */
let shiftOverride = null;   // (a shift to name under for a moment: see atShift)
const nameShift = () => shiftOverride ?? (state && state.nameFromCapo && !findInstrument(state.instrument).piano ? capo() : 0);
function atShift(k, fn) {
  const was = shiftOverride;
  shiftOverride = k;
  try { return fn(); } finally { shiftOverride = was; }
}
// (a note named under shift k: from the played pitch class to the one that sounds, or back with -k)
const shiftNote = (n, k) => (n && mod12(k) ? { ...n, pc: mod12(n.pc + k) } : n);
function shiftSpelling(sp, k) {
  if (!mod12(k)) return sp;
  const names = new Map();
  for (const [pc, n] of sp.names) names.set(mod12(pc + k), shiftNote(n, k));
  return { ...sp, root: shiftNote(sp.root, k), notes: sp.notes.map((n) => shiftNote(n, k)), names };
}
// (a loose note, with no key to follow: natural, or as flats asks; its
// octave, as named: a played note's)
const freeNote = (pc, flats) => { const k = nameShift(); return shiftNote(plainNote(pc - k, flats), k); };
const pitchName = (midi, n) => pitchText(midi - nameShift(), n);

/* A pitch's names as a root: the main one (natural, or sharp) and its
   other one (D, G and A have none): C (B♯), C♯ (D♭), E (F♭), F (E♯),
   B (C♭). A scale or chord is written from the main one or the other, as
   the easier key, or as picked (the Alternative root switch). */
function rootNames(pc) {
  const k = nameShift();
  pc = mod12(pc - k);
  if (!LETTER_PC.includes(pc)) return [plainNote(pc, false), plainNote(pc, true)].map((n) => shiftNote(n, k));
  const letter = LETTER_PC.indexOf(pc);
  return [spellAs(pc, letter), [spellAs(pc, (letter + 6) % 7), spellAs(pc, (letter + 1) % 7)].find((n) => Math.abs(n.acc) === 1) || null].map((n) => shiftNote(n, k));
}
// (the name of that root with this letter: null when it has none so)
const rootAs = (pc, letter) => (Number.isInteger(letter) ? rootNames(pc).find((n) => n && n.letter === letter) || null : null);
// (a chord's own root: any name of it, up to three sharps or flats, as a
// note is written: the scale's name for it as shared or kept (F𝄪 for G, G♯
// harmonic minor's vii°), not only the two a root has to pick from, see
// rootAs; what Share shows is what a link opens)
const chordNameAs = (pc, letter) => {
  if (!Number.isInteger(letter)) return null;
  const k = nameShift();
  const n = spellAs(pc - k, letter);
  return Math.abs(n.acc) <= 3 ? shiftNote(n, k) : null;
};
// (its name other than this one: null for D, G and A)
const otherRoot = (pc, name) => rootNames(pc).find((n) => n && n.letter !== name.letter) || null;

/* Spell a scale or chord from its root. offsets: letter offset of each note
   from the root (null: no letters, e.g. chromatic). Each note keeps its
   letter, with up to three sharps or flats (only from a root's other name:
   B♯aug's F♯𝄪, C♭dim7's B♭𝄫) */
function spellNotes(root, steps, offsets, flats) {
  return steps.map((step, i) => (offsets ? spellAs(root.pc + step, (root.letter + offsets[i]) % 7) : plainNote(root.pc + step, flats)));
}
// (a root with two names as easy, F♯ / G♭ major, D♯ / E♭ minor: the one
// the Flats setting has)
const tieFlats = () => Boolean(state && state.flats);
// (tie: the root's flat name when both are as easy, see tieFlats, chordTie)
function spellKey(rootPc, steps, offsets, preferFlats, forcedRoot = null, minorKey = false, tie = tieFlats()) {
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
      || (tie ? x.acc - y.acc : y.acc - x.acc))[0];
  }
  const lean = keyNotes(root).reduce((sum, n) => sum + n.acc, 0);
  const flats = lean < 0 || (lean === 0 && preferFlats);
  const notes = spellNotes(root, steps, offsets, flats);
  const names = new Map();
  for (const n of notes) if (!names.has(n.pc)) names.set(n.pc, n);
  return { root, notes, names, flats, lean };   // (lean: its key's sharps, + , or flats, -)
}
/* A scale from its root: written as the easier key (the fewer
   accidentals: D♭ major, not C♯; C♯ minor, not D♭), as the Flats setting
   has it when both are as easy (F♯ or G♭ major), or from the root given (its
   other name, chosen: C♯ major, with its 7 sharps) */
function spellScale(rootPc, def, root = null) {
  const k = nameShift();
  return shiftSpelling(playedScale(rootPc - k, def, shiftNote(root, -k)), k);
}
function playedScale(rootPc, def, root) {
  if (def.steps.length >= 12) return spellChromatic(rootPc, def, root);
  const offsets = (SCALE_LETTERS[def.id] || [1, 2, 3, 4, 5, 6, 7]).map((d) => d - 1);
  // A scale with a ♭2 and a ♭6 is read in a minor key, whatever its 3rd:
  // C♯ Phrygian dominant (C♯ D E♯ F♯...), not D♭ (D♭ E𝄫 F...)
  const dark = offsets && def.steps.includes(1) && def.steps.includes(8);
  return spellKey(rootPc, def.steps, offsets, false, root, dark);
}
/* The chromatic scale from its root: the root's major scale (the root
   spelled with the fewer accidentals, as a key), and each note in between
   as the one of its two names that is plain (D, not C𝄪; F, not E♯), as
   the Flats setting has it when both are (C's C♯ or D♭: a chromatic scale
   is no key, nothing else decides). Every note's badge then says what
   its name does, 3 and 7 where they are: D♭ is D♭ D E♭ E F ... ; F♯ is F♯
   G G♯ A A♯ B C C♯ D D♯ E E♯ (its 7th, E♯, the major scale's own) */
function spellChromatic(rootPc, def, forcedRoot = null) {
  const pc = mod12(rootPc);
  const cost = (root) => MAJOR_STEPS.reduce((sum, st, i) => { const n = spellAs(root.pc + st, (root.letter + i) % 7); return sum + Math.abs(n.acc) + (Math.abs(n.acc) > 1 ? 10 : 0); }, 0);
  const root = forcedRoot || (LETTER_PC.includes(pc) ? plainNote(pc, false)
    : [plainNote(pc, false), plainNote(pc, true)].sort((x, y) => cost(x) - cost(y) || (tieFlats() ? x.acc - y.acc : y.acc - x.acc))[0]);
  const preferFlats = tieFlats();
  const plain = (n) => Math.abs(n.acc) <= 1 && !(n.acc && LETTER_PC.includes(n.pc));
  const offsets = def.steps.map((st) => {
    const i = MAJOR_STEPS.indexOf(st);
    if (i >= 0) return i;
    const above = MAJOR_STEPS.findIndex((m) => m > st);
    const [up, down] = [above - 1, above].map((o) => spellAs(root.pc + st, (root.letter + o) % 7));   // (the degree below raised, the one above lowered)
    if (plain(up) !== plain(down)) return plain(up) ? above - 1 : above;
    return preferFlats ? above : above - 1;
  });
  return spellKey(rootPc, def.steps, offsets, preferFlats, root);
}
const degreeOffset = (deg) => (deg === 'R' ? 0 : (Number(deg.replace(/\D/g, '')) - 1) % 7);
/* A chord's notes stacked in thirds, each letter from its degree, as its
   interval badges have it: double sharps and flats where the degree needs
   one (Cdim7 is C E♭ G♭ B𝄫, E7♯9 is E G♯ B D F𝄪), as in scales (G♯
   harmonic minor has F𝄪) */
// (forcedRoot: its root as the scale shown names it, or as picked: its
// other name, B♯ D𝄪 F𝄪, or the name a link wrote it with, F𝄪dim; see
// chordSpelling)
function spellChord(rootPc, def, forcedRoot = null) {
  const k = nameShift();
  return shiftSpelling(spellKey(rootPc - k, def.steps, def.degrees.map(degreeOffset), false, shiftNote(forcedRoot, -k), false, chordTie()), k);
}
// (a chord's root with both names as easy, F♯ / G♭ major, D♯ / E♭ minor:
// as the scale shown leans, the flat one in a flat key (F major's G♭), the
// sharp one in a sharp key; with no scale, one that leans neither way
// (C major, A minor) or the chromatic one, as the Flats setting has it)
function chordTie() {
  const def = state && state.scale.on ? findScale(state.scale.type) : null;
  const sc = def && def.steps.length < 12 ? scaleSpelling(state.scale.root, def) : null;
  return sc && sc.lean ? sc.lean < 0 : tieFlats();
}

/* ==========================================================================
   2. Chord shape finder
   1) Every playable shape is generated: within a 4-fret window, each string
      is muted, open (near the nut; anywhere as a last resort) or fretted
      on a chord tone, and the shape must sound every required tone (the
      5th may be left out of 4+ note chords, the 9th out of 11th and 13th
      chords), have the chosen bass
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
const OPEN_MAX_POS = 5;    // open strings only combine with shapes that start at fret ≤ 5 (but as a last resort: relaxed 2)
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
   required tone (the banjo's D7, 0 2 1 0, has no F♯). relaxed: for a chord
   that has no shape otherwise, one more muted string allowed between the
   notes and one more after them, and the long 4-fret stretches (still
   within a hand's width and four fingers): the ukulele's Am(add9),
   4 x 5 3; the bass's D9/F♯, 2 5 2 5. relaxed 2, for a chord with
   none even so: open strings with a shape higher up the neck too (the
   ukulele's A13/G, 0 9 9 9). relaxed 3, last, for an interval with none
   even so: any strings muted around its notes, as two notes are plucked
   (the guitar's C(m13), 20 x x x 21 x). droneMidis: the drones that ring
   with a shape, by pitch (an interval's notes are pitches: the banjo's
   E(m10), E3 on string 4 fret 2 under its open g, G4). */
function shapeCandidates(inst, rootPc, def, inversion, extraPcs = [], forced = null, relaxed = 0, droneMidis = []) {
  const tones = chordTones(rootPc, def);
  const n = inst.strings.length;
  const chordPcs = new Set(tones.map((t) => t.pc));
  const bassPc = inversion === 'any' ? null : tones[Number(inversion)].pc;
  const optional = [...optionalTones(def, inversion)].map((i) => tones[i].pc);
  const required = tones.map((t) => t.pc).filter((pc) => !optional.includes(pc));
  // (a note the drone rings needs no string here: the banjo's Em7/B, 0 x 4 3 2)
  const minSounding = Math.min(n, Math.max(required.filter((pc) => !extraPcs.includes(pc)).length, tones.length <= 2 ? 2 : 3));
  const plucked = def.span && relaxed > 2;   // (an interval's last resort: any strings muted, see above)
  const maxInner = plucked ? n : (n >= 6 ? 1 : 0) + (relaxed ? 1 : 0);
  // On a re-entrant tuning (ukulele high G) the lowest note matters little
  const reentrant = inst.strings.some((m, i) => i > 0 && m < inst.strings[i - 1]);
  // Top strings left out: one at most, but any number for a power chord (two
  // notes), played on the low strings (G5: 3 5 5 x x x; on a bass, E5: 0 2 x x);
  // not on a re-entrant tuning, whose low strings aren't its lowest notes
  const maxTrail = plucked || (tones.length <= 2 && !reentrant) ? n : relaxed ? 2 : 1;
  const found = [];

  function evaluate(frets, pos) {
    const sound = [];
    frets.forEach((f, s) => { if (f >= 0) sound.push({ s, f, midi: inst.strings[s] + f }); });
    // (an interval's: a drone above its notes that is one of them, see droneShapes)
    const drone = droneRings(def, sound.map((x) => x.midi), droneMidis);
    if (sound.length + drone.length < minSounding) return null;

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
    if (def.span && !spans(def, [...sound.map((x) => x.midi), ...drone])) return null;
    const complete = required.every((pc) => pcs.has(pc) || extraPcs.includes(pc));
    if (!complete && !(forced && frets.join(',') === forced.join(','))) return null;

    const lowest = sound.reduce((x, y) => (y.midi < x.midi ? y : x));
    const bass = mod12(lowest.midi);
    if (bassPc !== null && bass !== bassPc) return null;

    const { fingers, barre, barreFrom } = fingersFor(frets);
    if (fingers > MAX_FINGERS || (!relaxed && !stretchOk(inst, frets))) return null;

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
      // (a power chord: best on three strings, root, 5th and octave, G5 3 5 5 x x x;
      // on four strings, on two, root and 5th: the bass's E5, 0 2 x x)
      sound: maxTrail > 1 ? -Math.abs(sound.length - (n >= 5 ? 3 : 2)) : sound.length,
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
      if ((pos <= OPEN_MAX_POS || relaxed > 1) && chordPcs.has(mod12(open))) list.push(0);
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

// An interval type's notes: its span from the lowest to the highest; two
// notes a simple or compound interval's (in unison too, not another octave
// between: C3 C4 D4 is no major 9th, the namer reads it C(M2)); an octave's,
// one note in octaves (C3 C4 C5, two octaves, as the namer reads it)
const spans = (def, midis) => Math.max(...midis) - Math.min(...midis) === def.span && (def.steps.length === 1 || new Set(midis).size === 2);
// The drones that ring with an interval's fretted notes (midis): those above
// them that keep it the interval (the others are left unplayed); none for a
// chord, whose drones go by its notes' names (see droneShapes)
const droneRings = (def, midis, drones) => (def.span && midis.length
  ? drones.filter((m) => m > Math.min(...midis) && spans(def, [...midis, m])) : []);
// (none as usual: the relaxed rules, then with open strings anywhere, then
// for an interval any strings muted, see shapeCandidates)
function findShapes(inst, rootPc, def, inversion, weights = SHAPE_WEIGHTS) {
  const find = (relaxed) => {
    if (inst.starts && def.span) {   // (a ringing drone counts)
      return droneShapes(inst, rootPc, def, inversion, weights, relaxed)
        .filter((sh) => spans(def, sh.frets.flatMap((f, s) => (f < 0 ? [] : [shapePitch(inst, s, f)]))));
    }
    if (inst.starts) return droneShapes(inst, rootPc, def, inversion, weights, relaxed);
    return pickShapes(shapeCandidates(inst, rootPc, def, inversion, [], null, relaxed), weights, chartShape(inst, rootPc, def));
  };
  const last = def.span ? 3 : 2;
  for (let relaxed = 0; relaxed <= last; relaxed++) {
    const shapes = find(relaxed);
    if (shapes.length || relaxed === last) return shapes;
  }
}

/* Banjo: chords are fretted on the long strings, as on any 4-string
   instrument. The drone then rings open when its note is in the chord, as
   banjo players let it, and is left out otherwise; it is never fretted in
   a chord. A ringing drone counts as a chord tone: C7 is 2 3 1 2 under an
   open g (its 5th), A7 can be the A barre under an open g (its 7th).
   It never sets the bass: high up the neck, where all the fretted notes
   are above it, it is left out (as banjo players skip it there), and a
   shape that needed it for a chord tone goes. An interval's notes are
   pitches: the drone rings when it is one of them (E(m10): E3 under the
   open g, G4), and is left out when it would make another interval. */
function droneShapes(inst, rootPc, def, inversion, weights, relaxed = 0) {
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
  // A drone that rings with this shape: in the chord, and above its lowest
  // note (an interval's: one of its notes, see droneRings)
  const pitches = (shape) => shape.frets.flatMap((f, q) => (f < 0 ? [] : [longInst.strings[q] + f]));
  const ringsWith = (s, shape) => rings(s) && inst.strings[s] > low(shape)
    && (!def.span || droneRings(def, pitches(shape), [inst.strings[s]]).length > 0);
  const droneMidis = def.span ? drones.filter(rings).map((s) => inst.strings[s]) : [];
  const candidates = shapeCandidates(longInst, rootPc, def, inversion, ringing, chart, relaxed, droneMidis).filter((shape) => {
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
   shapes are different. A shape of four strings or more that leaves out the
   low strings and keeps the bass note is not a variant either: it is played
   with another hand shape (the small F, x x 3 2 1 1, beside the barre,
   1 3 3 2 1 1). */
const openPosition = (frets) => Math.max(...frets) <= 4;
// (a shape's bass note: its lowest)
const bassPcOf = (shape) => mod12(Number(shape.sig.split(',')[0]));
// (the first string it plays)
const leadString = (shape) => shape.frets.findIndex((f) => f >= 0);
function isVariant(a, b) {
  // (a shape of four strings or more on higher strings, its bass note the
  // same: its own hand shape, see above)
  const sounding = (shape) => shape.frets.filter((f) => f >= 0).length;
  if (leadString(a) !== leadString(b) && bassPcOf(a) === bassPcOf(b) && Math.min(sounding(a), sounding(b)) >= 4) return false;
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
/* Where a shape sits, as players say it: "open" for an open-position shape
   (open strings, nothing above fret 4), else "fret N", its lowest fretted
   fret (counted from the capo, like the tab). */
const shapePlace = (shape) => (shape.pos === 0 || (shape.frets.includes(0) && openPosition(shape.frets))
  ? 'open' : `fret ${shape.pos}`);
/* Compact tab for tight spaces: "x32010", spaced only when a fret has two digits */
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
   Returns [{ frets: keys from its lowest (0) up, pos: the lowest, piano:
   true }], on the keyboard `inst` (the piano by default). */
function pianoShapes(rootPc, def, inversion, inst = findInstrument('piano')) {
  const { low: LOW, keys: KEYS } = inst;
  const steps = def.span ? [0, def.span] : def.steps;
  const basses = def.span ? [0].filter(() => inversion === 'any' || !Number(inversion))   // (an interval of a set span: its root in the bass)
    : inversion === 'any' ? def.steps.map((_, i) => i) : [Number(inversion) || 0].filter((i) => i < def.steps.length);
  const shapes = [];
  for (const b of basses) {
    const bass = steps[b];
    const up = steps.map((st) => { let x = st; while (x < bass || (x === bass && st !== bass)) x += 12; return x - bass; });
    const offsets = [...new Set(up)].sort((x, y) => x - y);   // (the bass first: 0)
    for (let low = LOW + mod12(rootPc + bass - LOW); low + offsets[offsets.length - 1] < LOW + KEYS; low += 12) {
      shapes.push({ frets: offsets.map((o) => low + o - LOW), pos: low - LOW, piano: true });
    }
  }
  return shapes.sort((x, y) => x.pos - y.pos || keysMid(x) - keysMid(y));   // low to high
}
const keysMid = (sh, low = 0) => sh.frets.reduce((sum, k) => sum + k, 0) / sh.frets.length + low;   // a keyboard shape's middle (MIDI, from its lowest key `low`)
/* The shape a chord starts on (its first shape, a fresh chord or "back to
   the first"): the finder's first on a neck; on the piano, where they go
   low to high, the one around middle C (with "Any bass note", in root
   position) */
function homeShape(shapes, root, inversion) {
  if (!shapes.length || !shapes[0].piano) return 0;
  const { low } = instrument();
  const found = shapes.filter((sh) => !sh.drawn && (inversion !== 'any' || mod12(sh.frets[0] + low) === mod12(root)));
  if (!found.length) return 0;
  const home = found.reduce((best, sh) => (Math.abs(keysMid(sh, low) - 64) < Math.abs(keysMid(best, low) - 64) ? sh : best));
  return shapes.indexOf(home);
}

/* ==========================================================================
   Chord names: one namer (describeChord) for the menus' chords and for
   any other set of notes (Name a chord). Above a root, each interval
   takes its usual role (3rd, 5th, 7th, 9th, 11th, 13th, or an altered
   one: ♭9, ♯11...) and the symbol is written the usual way (C7(♯11),
   Cmaj9, Cm(add9), C7sus4, C(no3)). Two notes are named after their
   interval (C(M3): C and the major 3rd above). A chord beyond the menus'
   is a type like the others (its shapes, spelling, chip, link, save),
   its id its intervals: "i-3-5-b7-s11" (# as s, the root left out).
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
const ORDINAL = { 6: '6th', 7: '7th', 9: '9th', 11: '11th', 13: '13th' };
/* The symbol and name of a chord written as its degrees */
function describeChord(degrees) {
  const d = new Set(degrees.filter((x) => x !== 'R'));
  if (d.size === 1) {
    const [x] = d;
    return { symbol: `(${INTERVALS[x][0]})`, name: `${INTERVALS[x][1]} interval` };
  }
  const third = d.has('3') ? '3' : d.has('b3') ? 'b3' : null;
  const minor = third === 'b3';
  const sev = d.has('7') ? '7' : d.has('b7') ? 'b7' : d.has('bb7') ? 'bb7' : null;   // (both: the major one, the ♭7 added)
  const sus = third ? '' : d.has('4') ? '4' : d.has('2') ? '2' : '';
  const used = new Set();   // degrees the symbol's core already says
  let core;
  let words;
  if (minor && d.has('b5') && sev === 'bb7') { core = 'dim7'; words = 'Diminished 7th'; used.add('b5'); }
  else if (minor && d.has('b5') && sev === 'b7') { core = 'm7♭5'; words = 'Half-diminished 7th'; used.add('b5'); }
  else if (minor && d.has('b5') && !sev && !d.has('6')) { core = 'dim'; words = 'Diminished'; used.add('b5'); }
  else if (third === '3' && d.has('#5') && sev !== '7' && !d.has('6')) { core = sev ? 'aug7' : 'aug'; words = sev ? 'Augmented 7th' : 'Augmented'; used.add('#5'); }
  else if (sev === 'b7' || sev === '7') {
    // The highest natural extension above a 7th names it, the ones below
    // going without saying (C11: its 9th), but a 13th over a major 3rd:
    // its 11th left out, as the menus' C13 (R 3 5 ♭7 9 13), one there
    // said, C13(add11); a minor 13th's 11th goes without saying
    const top = ['13', '11', '9'].find((x) => d.has(x));
    const n = top || '7';
    for (const x of ['9', '11', '13']) if (top && Number(x) <= Number(top) && !(x === '11' && top === '13' && !minor)) used.add(x);
    if (sev === 'b7') { core = (minor ? 'm' : '') + n; words = `${minor ? 'Minor' : 'Dominant'} ${ORDINAL[n]}`; }
    else { core = minor ? `m(maj${n})` : `maj${n}`; words = `${minor ? 'Minor-major' : 'Major'} ${ORDINAL[n]}`; }
  } else if (d.has('6')) {
    const nine = d.has('9');
    used.add('6');
    if (nine) used.add('9');
    core = (minor ? 'm' : '') + (nine ? '6/9' : '6');
    words = `${minor ? 'Minor' : 'Major'} ${nine ? 'six-nine' : '6th'}`;
  } else if (third) { core = minor ? 'm' : ''; words = minor ? 'Minor' : 'Major'; }
  else if (!sus && d.has('5')) { core = '5'; words = 'Power chord'; }
  else { core = ''; words = sus ? '' : 'Chord'; }
  for (const x of ['3', 'b3', sev, '5', sus]) used.add(x);   // (one 7th: the other, if any, added)
  if (sus) words = `${words}${words ? ', s' : 'S'}uspended ${sus === '4' ? '4th' : '2nd'}`;
  // Added notes (those its core does not say: Cadd9, C13(add11)), then
  // altered ones, then a missing 3rd (every note said: C E G♯ A is
  // C6(♯5), not Caug)
  const adds = ['6', '9', '11', '13'].filter((x) => d.has(x) && !used.has(x));
  const alts = ['b5', '#5', 'b7', 'b9', '#9', '#11', 'b13'].filter((x) => d.has(x) && !used.has(x));
  // (an altered note sounding with its natural one is added, not altered:
  // C E G B♭ D♭ D is C9(add♭9), its 9th still there; C9(♭9) would lower it.
  // Fifths need none: G♭ with G is read as a ♯11, C9(♯11))
  const NATURAL = { b5: '5', '#5': '5', b7: '7', b9: '9', '#9': '9', '#11': '11', b13: '13' };
  const beside = (x) => d.has(NATURAL[x]);
  const no3 = !third && !sus && core !== '5';
  let symbol = core + (sus ? `sus${sus}` : '');
  const extras = [...adds.map((x) => `add${x}`), ...alts.map((x) => (beside(x) ? `add${fmtDeg(x)}` : fmtDeg(x))), ...(no3 ? ['no3'] : [])];
  // A major chord's first added note is written plainly (Cadd9), the rest in brackets
  if (!minor && core === '' && !sus && adds.length && extras[0] === `add${adds[0]}`) symbol += extras.shift();
  if (extras.length) symbol += `(${extras.join(',')})`;
  // (Minor with added 9th, 11th and ♭13)
  const more = [...adds.map((x) => ORDINAL[x]), ...alts.map(fmtDeg)];
  const list = more.length > 1 ? `${more.slice(0, -1).join(', ')} and ${more[more.length - 1]}` : more.join('');
  const name = `${words}${list ? ` with ${adds.length || alts.some(beside) ? 'added ' : ''}${list}` : ''}${no3 ? ', no 3rd' : ''}`;
  return { symbol, name: name.charAt(0).toUpperCase() + name.slice(1) };
}
// (the menus' chords named so too: the one namer for all, see CHORDS)
for (const def of ALL_CHORDS) if (def.symbol === undefined) Object.assign(def, describeChord(def.degrees));
const customDefs = new Map();
/* One note in octaves: an interval too, a type of its own for each span
   (C3 and C4: C(P8), an octave; C3 and C5: C(P15), two octaves), its id
   the interval's number ("i-8", "i-15"); its shapes span just that */
const OCTAVE_MAX = 8;   // (a keyboard's keys: the Uniso's C0 to C8)
const OCTAVE_WORDS = [null, 'Perfect octave', 'Double octave', 'Triple octave'];
const octaveDefs = new Map();
/* Two notes more than an octave apart, the same way: C4 and D5, C(M9), a
   major 9th; its id the quality and the number ("i-maj9"), its notes the
   simple interval's, its shapes spanning just that */
const QUALITY = { min: ['m', 'Minor'], maj: ['M', 'Major'], perf: ['P', 'Perfect'], aug: ['A', 'Augmented'] };
const COMPOUND_SEMIS = { min: [1, 3, 8, 10], maj: [2, 4, 9, 11], perf: [5, 7], aug: [6] };   // (the tritone, above an octave: an augmented 11th, ...)
const intervalNumber = (simple) => [0, 2, 2, 3, 3, 4, 4, 5, 6, 6, 7, 7][simple];   // (1: unison ... 7: 7th; the tritone a 4th)
const ordinalOf = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;
const compoundDefs = new Map();
function compoundType(span) {
  const simple = mod12(span);
  const quality = Object.keys(COMPOUND_SEMIS).find((q) => COMPOUND_SEMIS[q].includes(simple));
  if (!quality) return undefined;
  const n = intervalNumber(simple) + 7 * Math.floor(span / 12);
  if (span < 13 || span > 12 * OCTAVE_MAX + 11) return undefined;
  if (!compoundDefs.has(span)) {
    // (its degree the interval it is, spelled and shown so: a major 9th's
    // D is its 9, not a 2; an augmented 11th's is F♯, not G♭)
    const degree = `${quality === 'min' ? 'b' : quality === 'aug' ? '#' : ''}${n}`;
    compoundDefs.set(span, { id: `i-${quality}${n}`, steps: [0, simple], degrees: ['R', degree], custom: true, span,
      symbol: `(${QUALITY[quality][0]}${n})`, name: `${QUALITY[quality][1]} ${ordinalOf(n)} interval` });
  }
  return compoundDefs.get(span);
}
function octaveType(k) {
  if (!Number.isInteger(k) || k < 1 || k > OCTAVE_MAX) return undefined;
  if (!octaveDefs.has(k)) {
    const n = 7 * k + 1;
    octaveDefs.set(k, { id: `i-${n}`, steps: [0], degrees: ['R'], custom: true, span: 12 * k,
      symbol: `(P${n})`, name: `${OCTAVE_WORDS[k] || `${k}-octave`} interval` });
  }
  return octaveDefs.get(k);
}
function customChord(id) {
  const octave = /^i-(\d+)$/.exec(String(id));
  if (octave && (octave[1] - 1) % 7 === 0) return octaveType((octave[1] - 1) / 7);
  const compound = /^i-(min|maj|perf|aug)(\d+)$/.exec(String(id));
  if (compound) {
    const n = Number(compound[2]);
    const simple = COMPOUND_SEMIS[compound[1]].find((x) => intervalNumber(x) === ((n - 1) % 7) + 1);
    const def = simple === undefined ? undefined : compoundType(simple + 12 * Math.floor((n - 1) / 7));
    return def && def.id === id ? def : undefined;
  }
  if (typeof id !== 'string' || !/^i(-[a-z0-9]+)+$/.test(id)) return undefined;
  if (customDefs.has(id)) return customDefs.get(id);
  const degrees = ['R', ...id.slice(2).split('-').map((x) => x.replace(/s/g, '#'))];
  const steps = degrees.map((x) => DEGREE_STEPS[x]);
  const ok = steps.every((x) => x !== undefined) && new Set(steps.map(mod12)).size === steps.length
    && customId(degrees) === id && (degrees.length > 2 || DYAD_DEGREES.includes(degrees[1]));
  // (two notes: the interval, its shapes just that, the root below, as the
  // namer reads it: E3 F♯3 an E(M2), E2 F♯3 an E(M9))
  const def = ok ? { id, steps, degrees, custom: true, ...(degrees.length === 2 ? { span: steps[1] } : {}), ...describeChord(degrees) } : undefined;
  if (customDefs.size > 200) customDefs.clear();
  customDefs.set(id, def);
  return def;
}
const customId = (degrees) => `i-${degrees.filter((x) => x !== 'R').sort(byDegree).map((x) => x.replace(/#/g, 's')).join('-')}`;
/* The interval some pitches make: one note or two, any of them doubled at
   octaves, its root the lowest. One note: its octaves, from the lowest to
   the highest (C3 C4 C5: C(P15)). Two: from the lowest to the other's
   lowest, the higher ones its doublings (C4 D5 D6: C(M9), not C(M2);
   C4 C5 D5 too; C4 D4 D5: C(M2)); within the octave the plain interval
   (C4 G4: C(P5), though the namer reads a root and 5th within the octave
   as the power chord, see nameChord). undefined: none (one pitch, three
   notes or more, too wide). */
function intervalOf(midis) {
  const low = Math.min(...midis);
  const pcs = new Set(midis.map(mod12));
  if (pcs.size === 1) return octaveType((Math.max(...midis) - low) / 12);
  if (pcs.size !== 2) return undefined;
  const span = Math.min(...midis.filter((m) => mod12(m - low))) - low;
  return span < 12 ? customChord(customId(['R', DYAD_DEGREES[span]])) : compoundType(span);
}
/* An interval's note by its distance from the lowest (above): R, the
   root's octaves 8, 15..., the other note its degree (C(M9)'s D5, 9) and
   that an octave up and more (D6, 16). null: not one of its notes there. */
function intervalDegree(def, above) {
  if (!mod12(above)) return above > 0 ? String(7 * (above / 12) + 1) : above === 0 ? 'R' : null;
  const m = def.steps.length === 2 ? /^(b|#)?(\d+)$/.exec(def.degrees[1]) : null;
  const k = (above - def.span) / 12;
  return m && Number.isInteger(k) && k >= 0 ? `${m[1] || ''}${Number(m[2]) + 7 * k}` : null;
}
// A chord type from its degrees: a menu's when one has exactly these, else its own
function chordOf(degrees) {
  const key = degrees.slice().sort(byDegree).join(' ');
  return ALL_CHORDS.find((c) => c.degrees.slice().sort(byDegree).join(' ') === key) || customChord(customId(degrees));
}
/* The role of each note above a root (null: two 7ths with no 3rd, not
   read on this root; with one, both: the major one the chord's, the other
   added, see describeChord: C E G B♭ B, Cmaj7(add♭7)) */
function degreesOver(root, pcs) {
  const i = new Set(pcs.map((pc) => mod12(pc - root)).filter((x) => x));
  const has = (x) => i.has(x);
  if (has(10) && has(11) && !has(3) && !has(4)) return null;
  const third = has(4) ? '3' : has(3) ? 'b3' : null;
  const sev = has(10) || has(11);
  // (a diminished 7th only over a ♭5: with the 5th, the tritone is a ♯11 and this a 6th)
  const role = (x) => ({
    1: 'b9', 2: third || has(5) ? '9' : '2', 3: has(4) ? '#9' : 'b3', 4: '3', 5: third ? '11' : '4',
    6: has(7) ? '#11' : 'b5', 7: '5', 8: has(7) || has(6) || third === 'b3' ? 'b13' : '#5',
    9: sev ? '13' : third === 'b3' && has(6) && !has(7) ? 'bb7' : '6', 10: 'b7', 11: '7' })[x];
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
  // One or two notes (any doubled): the interval they make (see intervalOf)
  const interval = pcs.length <= 2 ? intervalOf(midis) : undefined;
  if (pcs.length === 1) return interval ? [{ root: pcs[0], def: interval, bassIndex: 0, missing: [], score: 0 }] : [];
  const bass = mod12(Math.min(...midis));
  // (two notes more than an octave apart, any doubled: that interval, not
  // a power chord on the bass, C4 G5 a C(P12); unless a root has its 5th
  // within the octave above it, C3 C4 G4 a C5; over its 5th, as before:
  // G2 G3 C4 a C5/G too)
  const compound = Boolean(interval && interval.span > 12)
    && !midis.some((m) => mod12(m) === bass && midis.some((x) => x > m && x - m < 12));
  const best = new Map();   // root → its best reading
  const offer = (r) => { const was = best.get(r.root); if (!was || r.score > was.score) best.set(r.root, r); };
  const fits = (root, def) => Boolean(scalePcs) && chordTones(root, def).every((t) => scalePcs.has(t.pc));
  CHORDS.forEach((group, rank) => group.items.forEach((def, order) => {
    const upper = def.degrees.includes('11') || def.degrees.includes('13');
    for (const root of pcs) {
      if (compound && root === bass) continue;
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
  // interval above the bass (see intervalOf); more on each note as the root
  const roots = pcs.length === 2 ? [bass] : pcs;
  for (const root of roots) {
    if (best.has(root)) continue;
    const degrees = pcs.length === 2 ? null : degreesOver(root, pcs);
    const def = pcs.length === 2 ? interval : degrees && chordOf(degrees);
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
