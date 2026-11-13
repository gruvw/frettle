/* Note spelling, on every root: scales use each letter once (G♯ harmonic
   minor has an F double sharp); chords stack in thirds as chord charts
   write them, never with a double sharp or flat (Cdim7 is C E♭ G♭ A). */
const test = require('node:test');
const assert = require('node:assert');
const { ALL_SCALES, ALL_CHORDS, spellScale, spellChord, noteText } = require('../web/script.js');

const NATURAL = [0, 2, 4, 5, 7, 9, 11];   // C D E F G A B
const mod12 = (n) => ((n % 12) + 12) % 12;
const named = (n, pc) => n.pc === pc && mod12(NATURAL[n.letter] + n.acc) === pc;
const degreeLetter = (degree) => (degree === 'R' ? 0 : Number(degree.replace(/\D/g, '')) - 1) % 7;

test('every scale names its notes', () => {
  const bad = [];
  for (const def of ALL_SCALES) {
    for (let root = 0; root < 12; root++) {
      for (const flats of [false, true]) {
        const { notes } = spellScale(root, def, flats);
        if (notes.some((n, i) => !named(n, mod12(root + def.steps[i])) || Math.abs(n.acc) > 2)) bad.push(`${def.id} on ${root}`);
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
      for (const flats of [false, true]) {
        const { notes } = spellScale(root, def, flats);
        if (notes.some((n, i) => n.letter !== (notes[0].letter + i) % 7)) bad.push(`${def.id} on ${root}: ${notes.map(noteText).join(' ')}`);
      }
    }
  }
  assert.deepStrictEqual(bad, []);
});

test('chords stack in thirds, without double sharps or flats', () => {
  const bad = [];
  for (const def of ALL_CHORDS) {
    for (let root = 0; root < 12; root++) {
      for (const flats of [false, true]) {
        const { notes } = spellChord(root, def, flats);
        const ok = notes.every((n, i) => {
          const letter = (notes[0].letter + degreeLetter(def.degrees[i])) % 7;
          const fits = Math.abs(mod12(n.pc - NATURAL[letter] + 6) - 6) <= 1;   // (its own letter needs one accidental at most)
          return named(n, mod12(root + def.steps[i])) && Math.abs(n.acc) <= 1 && (!fits || n.letter === letter);
        });
        if (!ok) bad.push(`${def.id} on ${root}: ${notes.map(noteText).join(' ')}`);
      }
    }
  }
  assert.deepStrictEqual(bad, []);
});

test('familiar spellings', () => {
  const chord = (root, id) => spellChord(root, ALL_CHORDS.find((d) => d.id === id), false).notes.map(noteText).join(' ');
  const scale = (root, id) => spellScale(root, ALL_SCALES.find((d) => d.id === id), false).notes.map(noteText).join(' ');
  assert.strictEqual(chord(0, '7'), 'C E G B♭');
  assert.strictEqual(chord(6, 'maj'), 'F♯ A♯ C♯');
  assert.strictEqual(chord(11, 'dim7'), 'B D F A♭');
  assert.strictEqual(chord(0, 'dim7'), 'C E♭ G♭ A');
  assert.strictEqual(chord(4, '7s9'), 'E G♯ B D G');
  assert.strictEqual(scale(6, 'major'), 'F♯ G♯ A♯ B C♯ D♯ E♯');
  assert.strictEqual(scale(5, 'major'), 'F G A B♭ C D E');
  assert.strictEqual(scale(9, 'minor'), 'A B C D E F G');
});
