/* Chord naming (Name a chord): notes in, names out. Every chord of the
   menu is named as itself, in any inversion, and a general name (one the
   menu doesn't have, like C6(♯5)) says every note it is given. */
const test = require('node:test');
const assert = require('node:assert');
const { ALL_CHORDS, nameChord, spellChord, noteText, degreesOver, chordOf } = require('../web/script.js');

const mod12 = (n) => ((n % 12) + 12) % 12;
const symbol = (r) => {
  const spell = spellChord(r.root, r.def, false);
  return noteText(spell.root) + r.def.symbol + (r.bassIndex ? `/${noteText(spell.notes[r.bassIndex])}` : '');
};
// A chord's notes, its inversion's note in the bass (an octave below the rest)
const voiced = (root, def, inversion) => {
  const bass = 48 + mod12(root + def.steps[inversion]);
  const rest = def.steps.filter((_, i) => i !== inversion).map((step) => {
    let m = 60 + mod12(root + step);
    while (m <= bass) m += 12;
    return m;
  });
  return [bass, ...rest];
};

test('every chord of the menu, in root position, is named first as itself', () => {
  const bad = [];
  for (const def of ALL_CHORDS) {
    for (let root = 0; root < 12; root++) {
      const [first] = nameChord(voiced(root, def, 0));
      if (!first || first.root !== root || first.def.id !== def.id || first.bassIndex) bad.push(`${def.id} on ${root}: ${first ? symbol(first) : 'no name'}`);
    }
  }
  assert.deepStrictEqual(bad, []);
});

test('every inversion is among the names, its bass after the slash', () => {
  const bad = [];
  for (const def of ALL_CHORDS) {
    for (let root = 0; root < 12; root++) {
      for (let inversion = 1; inversion < def.steps.length; inversion++) {
        const readings = nameChord(voiced(root, def, inversion));
        if (!readings.some((r) => r.root === root && r.def.id === def.id && r.bassIndex === inversion)) bad.push(`${def.id} on ${root}, inversion ${inversion}`);
      }
    }
  }
  assert.deepStrictEqual(bad, []);
});

test('familiar names', () => {
  const first = (...midis) => symbol(nameChord(midis)[0]);
  assert.strictEqual(first(60, 64, 67), 'C');
  assert.strictEqual(first(57, 60, 64), 'Am');
  assert.strictEqual(first(55, 59, 62, 65), 'G7');
  assert.strictEqual(first(52, 60, 67), 'C/E');
  assert.strictEqual(first(48, 55), 'C5');
  assert.ok(nameChord([60, 64, 68, 69]).map(symbol).includes('C6(♯5)'));
});

test('one note in octaves is an interval of its span', () => {
  assert.strictEqual(symbol(nameChord([48, 60])[0]), 'C(P8)');
  assert.strictEqual(symbol(nameChord([48, 72])[0]), 'C(P15)');
  assert.strictEqual(symbol(nameChord([48, 60, 72])[0]), 'C(P15)');
  assert.deepStrictEqual(nameChord([60]), []);
  assert.deepStrictEqual(nameChord([60, 60]), []);
});

/* What a general name says (C7(♯9), Cm6(♯11), Csus4add9...): the degrees it
   needs, and those it may leave out without saying (the 5th; the 9th and
   11th under a 13th, the 9th under an 11th) */
const ALTERED = { '♭5': 'b5', '♯5': '#5', '♭9': 'b9', '♯9': '#9', '♯11': '#11', '♭13': 'b13' };
const NAME = /^(dim7|m7♭5|dim|aug7|aug|m\(maj(7|9|11|13)\)|maj(7|9|11|13)|m(7|9|11|13)|(7|9|11|13)|m6\/9|6\/9|m6|6|m|5|)(sus[24])?(add(?:6|9|11|13))?(?:\((.*)\))?$/;
function says(name) {
  const m = NAME.exec(name);
  if (!m) return null;
  const [, core, mmaj, maj, min, dom, sus, add, more] = m;
  const need = new Set(['R']);
  const may = new Set(['5']);
  const third = (t) => { if (!sus) need.add(t); };
  const seventh = (t, s, top) => { third(t); need.add(s); if (top !== '7') need.add(top); for (const x of ['9', '11']) if (Number(x) < Number(top)) may.add(x); };
  if (core === 'dim7') ['b3', 'b5', 'bb7'].forEach((x) => need.add(x));
  else if (core === 'm7♭5') ['b3', 'b5', 'b7'].forEach((x) => need.add(x));
  else if (core === 'dim') ['b3', 'b5'].forEach((x) => need.add(x));
  else if (core === 'aug7') ['3', '#5', 'b7'].forEach((x) => need.add(x));
  else if (core === 'aug') ['3', '#5'].forEach((x) => need.add(x));
  else if (mmaj) seventh('b3', '7', mmaj);
  else if (maj) seventh('3', '7', maj);
  else if (min) seventh('b3', 'b7', min);
  else if (dom) seventh('3', 'b7', dom);
  else if (core.includes('6')) { third(core.startsWith('m') ? 'b3' : '3'); need.add('6'); if (core.includes('/9')) need.add('9'); }
  else if (core === 'm') need.add('b3');
  else if (core === '5') need.add('5');
  else third('3');
  if (sus) need.add(sus === 'sus4' ? '4' : '2');
  if (add) need.add(add.slice(3));
  for (const x of more ? more.split(',') : []) {
    if (x === 'no3') need.delete('3');
    else if (x.startsWith('add')) need.add(x.slice(3));
    else if (ALTERED[x]) need.add(ALTERED[x]);
    else return null;
  }
  return { need, may };
}

test('a general name says every note, and no other', () => {
  const bad = [];
  for (let mask = 0; mask < 2048; mask++) {   // every set of notes over C
    const pcs = [0, ...[...Array(11).keys()].filter((i) => mask & (1 << i)).map((i) => i + 1)];
    if (pcs.length < 3) continue;
    const degrees = degreesOver(0, pcs);
    const def = degrees && chordOf(degrees);
    if (!def || !def.custom) continue;
    const said = says(def.symbol);
    const unsaid = said ? degrees.filter((d) => !said.need.has(d) && !said.may.has(d)) : [];
    const wrong = said ? [...said.need].filter((d) => !degrees.includes(d)) : [];
    if (!said || unsaid.length || wrong.length) bad.push(`${degrees.join(' ')}: C${def.symbol}`);
  }
  assert.deepStrictEqual(bad, []);
});
