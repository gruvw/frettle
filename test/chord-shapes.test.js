/* Chord shapes: on every instrument and tuning (and a capo), for every chord of
   the menu on every root and in every inversion, each shape the finder
   offers fits the neck, plays only the chord's notes and has the chosen
   note in the bass. On the piano, every shape also plays every note. */
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

test('Piano shapes', () => {
  const bad = [];
  for (const def of ALL_CHORDS) {
    for (let root = 0; root < 12; root++) {
      const tones = chordTones(root, def);
      for (const inversion of inversions(def)) {
        const shapes = pianoShapes(root, def, inversion);
        if (!shapes.length) bad.push(`${def.id} on ${root}, inversion ${inversion}: no shapes`);
        for (const { frets: keys } of shapes) {
          const at = `${def.id} on ${root}, inversion ${inversion}: keys ${keys.join(' ')}`;
          const midis = keys.map((k) => PIANO_LOW + k);
          if (!keys.every((k, i) => Number.isInteger(k) && k >= 0 && k < PIANO_KEYS && (!i || k > keys[i - 1]))) bad.push(`${at}: not keys of the keyboard, low to high`);
          const played = new Set(midis.map(mod12));
          if (played.size !== tones.length || tones.some((t) => !played.has(t.pc))) bad.push(`${at}: not every note of the chord, or another`);
          if (inversion !== 'any' && mod12(midis[0]) !== tones[Number(inversion)].pc) bad.push(`${at}: wrong bass`);
        }
      }
    }
  }
  assert.deepStrictEqual(bad, []);
});
