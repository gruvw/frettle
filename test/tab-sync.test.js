/* Open tabs share settings, saved tunings, the chord list and custom
   shapes. A tab saving merges its own changes (since it last looked) into
   what is stored, so it never erases what another tab saved meanwhile.
   mergeShared(base: what this tab last saw, mine: this tab now, theirs:
   what is stored now). */
const test = require('node:test');
const assert = require('node:assert');
const { mergeShared } = require('../web/script.js');

const shared = (parts = {}) => ({ prefs: {}, saved: {}, list: [], drawn: [], ...parts });
const tuning = (name, notes) => ({ name, tuning: notes });
const chip = (chord, bass = 0, more = {}) => ({ chord, bass, ...more });
const chips = (merged) => merged.list.map((c) => `${c.chord}*${c.bass}`);

test('a tab that missed a saved tuning keeps it when it saves (the 8/10 bug)', () => {
  const base = shared({ prefs: { octaves: false } });
  const theirs = shared({ prefs: { octaves: false }, saved: { guitar: [tuning('Low', 'D2-A2-D3-G3-B3-E4')] } });
  const mine = shared({ prefs: { octaves: true } });   // (this tab only switched octaves on)
  const merged = mergeShared(base, mine, theirs);
  assert.deepStrictEqual(merged.saved, theirs.saved);
  assert.strictEqual(merged.prefs.octaves, true);
});

test('settings merge one by one', () => {
  const base = shared({ prefs: { flats: false, octaves: false } });
  const mine = shared({ prefs: { flats: true, octaves: false } });
  const theirs = shared({ prefs: { flats: false, octaves: true } });
  assert.deepStrictEqual(mergeShared(base, mine, theirs).prefs, { flats: true, octaves: true });
});

test('saved tunings are known by their notes: two of one name both stay', () => {
  const base = shared();
  const mine = shared({ saved: { guitar: [tuning('Practice', 'Ds2-As2-D3-G3-B3-E4')] } });
  const theirs = shared({ saved: { guitar: [tuning('Practice', 'E2-A2-D3-G3-B3-Ds4')] } });
  const merged = mergeShared(base, mine, theirs);
  assert.deepStrictEqual(merged.saved.guitar.map((t) => t.tuning).sort(), ['Ds2-As2-D3-G3-B3-E4', 'E2-A2-D3-G3-B3-Ds4']);
});

test('the same notes saved by two tabs are one tuning', () => {
  const merged = mergeShared(shared(), shared({ saved: { guitar: [tuning('Mine', 'D2-A2-D3-G3-B3-E4')] } }),
    shared({ saved: { guitar: [tuning('Theirs', 'D2-A2-D3-G3-B3-E4')] } }));
  assert.strictEqual(merged.saved.guitar.length, 1);
});

test('a removed tuning stays removed, a renamed one renamed', () => {
  const a = tuning('A', 'D2-A2-D3-G3-B3-E4');
  const b = tuning('B', 'C2-G2-C3-F3-A3-D4');
  const base = shared({ saved: { guitar: [a, b] } });
  const mine = shared({ saved: { guitar: [{ ...b, name: 'B2' }] } });   // (A removed here, B renamed)
  const theirs = shared({ saved: { guitar: [a, b] } });
  assert.deepStrictEqual(mergeShared(base, mine, theirs).saved.guitar, [{ ...b, name: 'B2' }]);
});

test('chord list: chips added in each tab are all kept', () => {
  const base = shared({ list: [chip('C-maj')] });
  const mine = shared({ list: [chip('C-maj'), chip('G-maj')] });
  const theirs = shared({ list: [chip('C-maj'), chip('A-min')] });
  assert.deepStrictEqual(chips(mergeShared(base, mine, theirs)), ['C-maj*0', 'A-min*0', 'G-maj*0']);
});

test('chord list: their new order is kept, my added chip goes at the end', () => {
  const base = shared({ list: [chip('C-maj'), chip('G-maj'), chip('A-min')] });
  const mine = shared({ list: [chip('C-maj'), chip('G-maj'), chip('A-min'), chip('F-maj')] });
  const theirs = shared({ list: [chip('A-min'), chip('C-maj'), chip('G-maj')] });
  assert.deepStrictEqual(chips(mergeShared(base, mine, theirs)), ['A-min*0', 'C-maj*0', 'G-maj*0', 'F-maj*0']);
});

test('chord list: my new order is kept, their added chip goes at the end', () => {
  const base = shared({ list: [chip('C-maj'), chip('G-maj'), chip('A-min')] });
  const mine = shared({ list: [chip('A-min'), chip('C-maj'), chip('G-maj')] });
  const theirs = shared({ list: [chip('C-maj'), chip('G-maj'), chip('A-min'), chip('D-min')] });
  assert.deepStrictEqual(chips(mergeShared(base, mine, theirs)), ['A-min*0', 'C-maj*0', 'G-maj*0', 'D-min*0']);
});

test('chord list: a chip I put in the middle or at the start stays there', () => {
  const base = shared({ list: [chip('C-maj'), chip('G-maj')] });
  const mine = shared({ list: [chip('A-min'), chip('C-maj'), chip('F-maj'), chip('G-maj')] });
  const theirs = shared({ list: [chip('C-maj'), chip('G-maj'), chip('D-min')] });
  assert.deepStrictEqual(chips(mergeShared(base, mine, theirs)), ['A-min*0', 'C-maj*0', 'F-maj*0', 'G-maj*0', 'D-min*0']);
});

test('chord list: a chip is known by its chord and bass, removals win', () => {
  const base = shared({ list: [chip('C-maj'), chip('C-maj', 1), chip('G-maj')] });
  const mine = shared({ list: [chip('C-maj'), chip('C-maj', 1), chip('G-maj', 0, { shapes: { x: '320003' } })] });   // (G's shape changed here)
  const theirs = shared({ list: [chip('C-maj', 1), chip('G-maj')] });   // (C removed there)
  const merged = mergeShared(base, mine, theirs);
  assert.deepStrictEqual(chips(merged), ['C-maj*1', 'G-maj*0']);
  assert.deepStrictEqual(merged.list[1].shapes, { x: '320003' });
});

test('custom shapes from both tabs are kept, removed ones are not', () => {
  const one = { chord: 'C-maj', frets: 'x32010' };
  const two = { chord: 'G-maj', frets: '320003' };
  const three = { chord: 'D-maj', frets: 'xx0232' };
  const merged = mergeShared(shared({ drawn: [one] }), shared({ drawn: [two] }), shared({ drawn: [one, three] }));
  assert.deepStrictEqual(merged.drawn, [three, two]);
});

test('nothing stored yet: mine as it is', () => {
  const mine = shared({ prefs: { flats: true } });
  assert.strictEqual(mergeShared(null, mine, null), mine);
});

test('a tab that never saw what is stored adds to it, erasing nothing', () => {
  const theirs = shared({ saved: { guitar: [tuning('Low', 'D2-A2-D3-G3-B3-E4')] }, list: [chip('C-maj')] });
  const merged = mergeShared(null, shared({ list: [chip('G-maj')] }), theirs);
  assert.deepStrictEqual(merged.saved, theirs.saved);
  assert.deepStrictEqual(chips(merged), ['C-maj*0', 'G-maj*0']);
});
