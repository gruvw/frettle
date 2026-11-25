/* Note spelling, on every root: scales use each letter once (G♯ harmonic
   minor has F𝄪); chords stack in thirds, double sharps and
   flats where a degree needs one (Cdim7 is C E♭ G♭ B𝄫), three from a
   root's other name (B♯aug's F♯𝄪). A root is written as its key is easier
   (fewer accidentals: D♭ major, not C♯; when both are as easy, as the
   Flats setting has it: F♯ or G♭ major), or with
   its other name when picked (C♯ major, 7 sharps; B♯ D𝄪 F𝄪), which every
   pitch but D, G and A has: so every key signature can be shown. */
const test = require('node:test');
const assert = require('node:assert');
const { ALL_SCALES, ALL_CHORDS, spellScale, spellChord, rootNames, noteText, readChord, noteToken, ownChordSpelling } = require('./frettle.js');

const NATURAL = [0, 2, 4, 5, 7, 9, 11];   // C D E F G A B
const mod12 = (n) => ((n % 12) + 12) % 12;
const named = (n, pc) => n.pc === pc && mod12(NATURAL[n.letter] + n.acc) === pc;
const degreeLetter = (degree) => (degree === 'R' ? 0 : Number(degree.replace(/\D/g, '')) - 1) % 7;
// Each root as written: as usual (null), and with each of its names
const roots = (pc) => [null, ...rootNames(pc).filter(Boolean)];

test('every scale names its notes, from either name of its root', () => {
  const bad = [];
  for (const def of ALL_SCALES) {
    for (let root = 0; root < 12; root++) {
      for (const name of roots(root)) {
        const { notes } = spellScale(root, def, name);
        // (up to two sharps or flats, three from a root's other name: B♯ whole-tone's F♯𝄪)
        if (notes.some((n, i) => !named(n, mod12(root + def.steps[i])) || Math.abs(n.acc) > (name ? 3 : 2))) bad.push(`${def.id} on ${name ? noteText(name) : root}`);
      }
    }
  }
  assert.deepStrictEqual(bad, []);
});

test('seven-note scales use each letter once, in order', () => {
  const bad = [];
  // (but the altered scale, as jazz writes it: C D♭ E♭ E, not F♭)
  for (const def of ALL_SCALES.filter((d) => d.steps.length === 7 && d.id !== 'altered')) {
    for (let root = 0; root < 12; root++) {
      for (const name of roots(root)) {
        const { notes } = spellScale(root, def, name);
        if (notes.some((n, i) => n.letter !== (notes[0].letter + i) % 7)) bad.push(`${def.id} on ${root}: ${notes.map(noteText).join(' ')}`);
      }
    }
  }
  assert.deepStrictEqual(bad, []);
});

test('chords stack in thirds, double sharps and flats where a degree needs one', () => {
  const bad = [];
  for (const def of ALL_CHORDS) {
    for (let root = 0; root < 12; root++) {
      const { notes } = spellChord(root, def);
      const ok = notes.every((n, i) => {
        const letter = (notes[0].letter + degreeLetter(def.degrees[i])) % 7;
        return named(n, mod12(root + def.steps[i])) && Math.abs(n.acc) <= 2 && n.letter === letter;
      });
      if (!ok) bad.push(`${def.id} on ${root}: ${notes.map(noteText).join(' ')}`);
    }
  }
  assert.deepStrictEqual(bad, []);
});

test("a chord from its root's other name, picked, stacks in thirds (up to three sharps or flats)", () => {
  const bad = [];
  for (const def of ALL_CHORDS) {
    for (let root = 0; root < 12; root++) {
      for (const name of rootNames(root).filter(Boolean)) {
        const { notes } = spellChord(root, def, name);
        const ok = notes[0].letter === name.letter && notes.every((n, i) => {
          const letter = (name.letter + degreeLetter(def.degrees[i])) % 7;
          return named(n, mod12(root + def.steps[i])) && Math.abs(n.acc) <= 3 && n.letter === letter;
        });
        if (!ok) bad.push(`${def.id} on ${noteText(name)}: ${notes.map(noteText).join(' ')}`);
      }
    }
  }
  assert.deepStrictEqual(bad, []);
});

test("every key signature can be shown: its key as usual, or its root's other name", () => {
  const major = ALL_SCALES.find((d) => d.id === 'major');
  const minor = ALL_SCALES.find((d) => d.id === 'minor');
  const reach = (def, root) => roots(root).map((name) => noteText(spellScale(root, def, name).root));
  const names = { 'C': 0, 'G': 7, 'D': 2, 'A': 9, 'E': 4, 'B': 11, 'F♯': 6, 'C♯': 1, 'F': 5, 'B♭': 10, 'E♭': 3, 'A♭': 8, 'D♭': 1, 'G♭': 6, 'C♭': 11 };
  const minors = { 'A': 9, 'E': 4, 'B': 11, 'F♯': 6, 'C♯': 1, 'G♯': 8, 'D♯': 3, 'A♯': 10, 'D': 2, 'G': 7, 'C': 0, 'F': 5, 'B♭': 10, 'E♭': 3, 'A♭': 8 };
  const missing = [
    ...Object.entries(names).filter(([n, pc]) => !reach(major, pc).includes(n)).map(([n]) => `${n} major`),
    ...Object.entries(minors).filter(([n, pc]) => !reach(minor, pc).includes(n)).map(([n]) => `${n} minor`),
  ];
  assert.deepStrictEqual(missing, []);
});

test('familiar spellings', () => {
  const chord = (root, id) => spellChord(root, ALL_CHORDS.find((d) => d.id === id)).notes.map(noteText).join(' ');
  const scale = (root, id, name) => spellScale(root, ALL_SCALES.find((d) => d.id === id), name).notes.map(noteText).join(' ');
  const other = (pc) => rootNames(pc)[1];
  assert.strictEqual(chord(0, '7'), 'C E G B♭');
  assert.strictEqual(chord(6, 'maj'), 'F♯ A♯ C♯');
  assert.strictEqual(chord(11, 'dim7'), 'B D F A♭');
  assert.strictEqual(chord(0, 'dim7'), 'C E♭ G♭ B𝄫');
  assert.strictEqual(chord(4, '7s9'), 'E G♯ B D F𝄪');
  assert.strictEqual(spellChord(0, ALL_CHORDS.find((d) => d.id === 'aug'), rootNames(0)[1]).notes.map(noteText).join(' '), 'B♯ D𝄪 F♯𝄪');   // (C's other name)
  assert.strictEqual(chord(1, 'maj'), 'D♭ F A♭');
  assert.strictEqual(chord(3, 'min'), 'D♯ F♯ A♯');   // (D♯m and E♭m as easy: the sharp one, as with Flats off)
  assert.strictEqual(scale(6, 'major'), 'F♯ G♯ A♯ B C♯ D♯ E♯');
  assert.strictEqual(scale(5, 'major'), 'F G A B♭ C D E');
  assert.strictEqual(scale(9, 'minor'), 'A B C D E F G');
  assert.strictEqual(scale(1, 'major'), 'D♭ E♭ F G♭ A♭ B♭ C');
  assert.strictEqual(scale(1, 'major', other(1)), 'D♭ E♭ F G♭ A♭ B♭ C');   // (D♭: its other name)
  assert.strictEqual(scale(1, 'major', rootNames(1)[0]), 'C♯ D♯ E♯ F♯ G♯ A♯ B♯');
  assert.strictEqual(scale(11, 'major', other(11)), 'C♭ D♭ E♭ F♭ G♭ A♭ B♭');
});

/* A link writes a chord's root as Share shows it, which can be a scale's
   name for it (F𝄪 in G♯ harmonic minor, B♯ in C♯ major): read with no
   scale, the chord keeps it (the C♯-shared-as-D♭ and F𝄪dim-opened-as-Gdim
   bugs). Every note every scale writes, from either name of its root, as
   a chord's root in a link, reads back written the same. */
test('a chord shared under any scale reads back with its root as written', () => {
  const bad = [];
  const def = ALL_CHORDS.find((d) => d.id === 'dim');
  for (const scale of ALL_SCALES.filter((d) => d.steps.length < 12)) {
    for (let root = 0; root < 12; root++) {
      for (const name of rootNames(root).filter(Boolean)) {
        for (const n of spellScale(root, scale, name).notes) {
          const read = readChord(`${noteToken(n)}-${def.id}`);
          const back = read && ownChordSpelling(read.root, read.def, read.letter).root;
          if (!back || back.letter !== n.letter || back.acc !== n.acc) bad.push(`${noteText(name)} ${scale.id}: ${noteText(n)}dim read as ${back ? noteText(back) : 'nothing'}dim`);
        }
      }
    }
  }
  assert.deepStrictEqual([...new Set(bad)], []);
});
