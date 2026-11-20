/* Chord shapes: on every instrument and tuning (and a capo), for every chord of
   the menu on every root and in every inversion, each shape the finder
   offers fits the neck, plays only the chord's notes and has the chosen
   note in the bass. On the keyboards (the piano, the Uniso), every shape also plays every note. */
const test = require('node:test');
const assert = require('node:assert');
const { INSTRUMENTS, TUNINGS, ALL_CHORDS, chordTones, findShapes, pianoShapes, startFret, shapePitch, PIANO_LOW, PIANO_KEYS } = require('../web/script.js');

const mod12 = (n) => ((n % 12) + 12) % 12;
const inversions = (def) => [...def.steps.keys()].map(String).concat('any');

for (const base of INSTRUMENTS.filter((i) => !i.piano)) {
  test(`${base.name} shapes`, () => {
    const bad = [];
    let count = 0;
    for (const [i, tuning] of (TUNINGS[base.id] || [{ id: 'standard', strings: base.strings }]).entries()) {
      for (const capo of i ? [0] : [0, 3]) {   // (a capo on the first tuning)
        // (as the app has it, with a capo: every string higher, fewer frets)
        const inst = { ...base, strings: tuning.strings.map((m) => m + capo), frets: base.frets - capo };
        for (const def of ALL_CHORDS) {
          for (let root = 0; root < 12; root++) {
            const pcs = new Set(chordTones(root, def).map((t) => t.pc));
            for (const inversion of inversions(def)) {
              for (const shape of findShapes(inst, root, def, inversion)) {
                count++;
                const { frets } = shape;
                const at = `${tuning.id}, capo ${capo}, ${def.id} on ${root}, inversion ${inversion}: ${frets.join(' ')}`;
                const fits = frets.length === inst.strings.length && frets.every((f, s) => Number.isInteger(f) && f >= -1 && f <= inst.frets
                  && !(startFret(inst, s) && f > 0));   // (the finder never frets a banjo's drone)
                if (!fits) { bad.push(`${at}: doesn't fit the neck`); continue; }
                const midis = frets.flatMap((f, s) => (f < 0 ? [] : [shapePitch(inst, s, f)]));
                if (midis.length < 2) bad.push(`${at}: fewer than two notes`);
                if (midis.some((m) => !pcs.has(mod12(m)))) bad.push(`${at}: a note not in the chord`);
                if (inversion !== 'any' && mod12(Math.min(...midis)) !== chordTones(root, def)[Number(inversion)].pc) bad.push(`${at}: wrong bass`);
              }
            }
          }
        }
      }
    }
    assert.ok(count > 0, 'no shapes at all');
    assert.deepStrictEqual(bad, []);
  });
}

for (const inst of INSTRUMENTS.filter((i) => i.piano)) test(`${inst.name} shapes`, () => {   // (the piano, the Uniso)
  const bad = [];
  if (inst.id === 'piano' && (inst.low !== PIANO_LOW || inst.keys !== PIANO_KEYS)) bad.push('the piano: not 88 keys from A0');
  for (const def of ALL_CHORDS) {
    for (let root = 0; root < 12; root++) {
      const tones = chordTones(root, def);
      for (const inversion of inversions(def)) {
        const shapes = pianoShapes(root, def, inversion, inst);
        if (!shapes.length) bad.push(`${def.id} on ${root}, inversion ${inversion}: no shapes`);
        for (const { frets: keys } of shapes) {
          const at = `${def.id} on ${root}, inversion ${inversion}: keys ${keys.join(' ')}`;
          const midis = keys.map((k) => inst.low + k);
          if (!keys.every((k, i) => Number.isInteger(k) && k >= 0 && k < inst.keys && (!i || k > keys[i - 1]))) bad.push(`${at}: not keys of the keyboard, low to high`);
          const played = new Set(midis.map(mod12));
          if (played.size !== tones.length || tones.some((t) => !played.has(t.pc))) bad.push(`${at}: not every note of the chord, or another`);
          if (inversion !== 'any' && mod12(midis[0]) !== tones[Number(inversion)].pc) bad.push(`${at}: wrong bass`);
        }
      }
    }
  }
  assert.deepStrictEqual(bad, []);
});

/* Intervals (two notes, or one in octaves): on every instrument and tuning,
   every one two strings can play within a hand's reach (an open string
   anywhere; a banjo's drone open only) has shapes, and each shape plays
   just that interval, its root below (the banjo's drone counted when it
   rings: E(m10), E3 under its open g, G4), and is named so by Name a
   chord (a 5th within the octave: the power chord). */
const { customChord, nameChord, intervalOf } = require('../web/script.js');
const INTERVALS = [
  ...['b2', '2', 'b3', '3', '4', 's4', 'b5', '5', 's5', 'b6', '6', 'bb7', 'b7', '7'].map((d) => `i-${d}`),
  ...['min', 'maj', 'perf', 'aug'].flatMap((q) => [...Array(16).keys()].map((k) => `i-${q}${k + 9}`)),
  'i-8', 'i-15', 'i-22',
].map(customChord).filter(Boolean);
test('every playable interval has shapes, and each is that interval', () => {
  const bad = [];
  for (const base of INSTRUMENTS.filter((i) => !i.piano)) {
    for (const tuning of TUNINGS[base.id] || [{ id: 'standard', strings: base.strings }]) {
      const inst = { ...base, strings: tuning.strings };
      const reach = (inst.span || 4) - 1;
      const frets = (s) => (startFret(inst, s) ? [0] : [...Array(inst.frets + 1).keys()]);
      for (const def of INTERVALS) {
        for (let root = 0; root < 12; root++) {
          const at = `${base.id} ${tuning.id}, ${def.id} on ${root}`;
          const shapes = findShapes(inst, root, def, '0');
          for (const { frets: fr } of shapes) {
            const midis = fr.flatMap((f, s) => (f < 0 ? [] : [shapePitch(inst, s, f)]));
            const low = Math.min(...midis);
            const ok = mod12(low) === root && Math.max(...midis) - low === def.span
              && (def.steps.length === 1 || new Set(midis).size === 2);
            if (!ok) bad.push(`${at}: ${fr.join(' ')} is not the interval`);
            const named = nameChord(midis)[0];
            if ((intervalOf(midis) || {}).id !== def.id || !named || named.root !== root
              || named.def.id !== (def.id === 'i-5' ? 'p5' : def.id)) bad.push(`${at}: ${fr.join(' ')} is named ${named ? named.def.id : 'nothing'}`);
          }
          if (shapes.length) continue;
          const playable = inst.strings.some((_, a) => inst.strings.some((__, b) => a !== b && frets(a).some((x) => frets(b).some((y) => {
            const lo = shapePitch(inst, a, x);
            const both = [x, y].filter((f) => f > 0);
            return mod12(lo) === root && shapePitch(inst, b, y) - lo === def.span && (both.length < 2 || Math.abs(x - y) <= reach);
          }))));
          if (playable) bad.push(`${at}: no shape, though two strings play it`);
        }
      }
    }
  }
  assert.deepStrictEqual(bad, []);
});
