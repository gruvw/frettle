/* Open tabs share settings, saved tunings, the chord list and custom
   shapes. A tab saving merges its own changes (since it last looked) into
   what is stored, so it never erases what another tab saved meanwhile.
   mergeShared(base: what this tab last saw, mine: this tab now, theirs:
   what is stored now). */
const test = require('node:test');
const assert = require('node:assert');
const { mergeShared, loadState, sharedForm, SAVE_VERSION } = require('./frettle.js');

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

test('damaged saved data is read as a reload reads it: merging it never fails', () => {
  const junk = { v: SAVE_VERSION, prefs: { flats: 'yes', share: 3 },
    work: { list: [null, 7, { chord: 'H-zz' }, { chord: 'C-maj', bass: 0 }], saved: { guitar: [null, { name: '', tuning: 'bad' }] }, drawn: 'x' } };
  const theirs = sharedForm(loadState(junk));
  assert.deepStrictEqual(chips(theirs), ['C-maj*0']);
  assert.deepStrictEqual(theirs.saved, {});
  const mine = sharedForm(loadState({ v: SAVE_VERSION, prefs: {}, work: { list: [{ chord: 'G-maj', bass: 0 }] } }));
  assert.deepStrictEqual(chips(mergeShared(null, mine, theirs)), ['C-maj*0', 'G-maj*0']);
});

/* A chip in both tabs: merged as it is edited, part by part. Its shapes are
   remembered by neck setting, its inversions by instrument; each of those,
   mine where I changed it (or removed it), else theirs */
const GUITAR = 'guitar*E2-A2-D3-G3-B3-E4*0*0', PIANO = 'piano**0*0', BASS = 'bass*E1-A1-D2-G2*0*0';
const cMaj = (shapes = {}, inversions = {}, more = {}) => chip('C-maj', 0, { inversions, shapes, ...more });

test('chips: my guitar shape and their piano shape are both kept (different instruments)', () => {
  const base = shared({ list: [cMaj()] });
  const mine = shared({ list: [cMaj({ [GUITAR]: 'x32010' })] });
  const theirs = shared({ list: [cMaj({ [PIANO]: '48.52.55' })] });
  assert.deepStrictEqual(mergeShared(base, mine, theirs).list[0].shapes, { [GUITAR]: 'x32010', [PIANO]: '48.52.55' });
  // (and the other way round: whichever tab saves)
  assert.deepStrictEqual(mergeShared(base, theirs, mine).list[0].shapes, { [GUITAR]: 'x32010', [PIANO]: '48.52.55' });
});

test('chips: one shape changed in both tabs: mine (the tab saving now)', () => {
  const base = shared({ list: [cMaj({ [GUITAR]: 'x32010' })] });
  const mine = shared({ list: [cMaj({ [GUITAR]: '8.10.10.9.8.8' })] });
  const theirs = shared({ list: [cMaj({ [GUITAR]: 'x35553', [PIANO]: '48.52.55' })] });
  assert.deepStrictEqual(mergeShared(base, mine, theirs).list[0].shapes, { [GUITAR]: '8.10.10.9.8.8', [PIANO]: '48.52.55' });
});

test('chips: a shape I went back from stays gone, their other shapes stay', () => {
  const base = shared({ list: [cMaj({ [GUITAR]: 'x32010', [BASS]: 'x3' })] });
  const mine = shared({ list: [cMaj({ [BASS]: 'x3' })] });
  const theirs = shared({ list: [cMaj({ [GUITAR]: 'x32010', [BASS]: 'x3', [PIANO]: '48.52.55' })] });
  assert.deepStrictEqual(mergeShared(base, mine, theirs).list[0].shapes, { [BASS]: 'x3', [PIANO]: '48.52.55' });
});

test('chips: inversions merge by instrument, shapes and name each on their own', () => {
  const base = shared({ list: [cMaj({}, { guitar: 'root', piano: 'root' })] });
  const mine = shared({ list: [cMaj({}, { guitar: 'first', piano: 'root' })] });
  const theirs = shared({ list: [cMaj({ [PIANO]: '52.55.60' }, { guitar: 'root', piano: 'first' }, { name: 'B#' })] });
  const merged = mergeShared(base, mine, theirs).list[0];
  assert.deepStrictEqual(merged.inversions, { guitar: 'first', piano: 'first' });
  assert.deepStrictEqual(merged.shapes, { [PIANO]: '52.55.60' });
  assert.strictEqual(merged.name, 'B#');   // (theirs: not renamed here)
});

test('chips: merged part by part whoever reordered the list', () => {
  const base = shared({ list: [cMaj(), chip('G-maj', 0, { inversions: {}, shapes: {} })] });
  const mine = shared({ list: [chip('G-maj', 0, { inversions: {}, shapes: {} }), cMaj({ [GUITAR]: 'x32010' })] });   // (reordered here)
  const theirs = shared({ list: [cMaj({ [PIANO]: '48.52.55' }), chip('G-maj', 0, { inversions: {}, shapes: {} })] });
  const merged = mergeShared(base, mine, theirs);
  assert.deepStrictEqual(chips(merged), ['G-maj*0', 'C-maj*0']);
  assert.deepStrictEqual(merged.list[1].shapes, { [GUITAR]: 'x32010', [PIANO]: '48.52.55' });
});

test('chips: a chip they removed stays removed, even with my shape change', () => {
  const base = shared({ list: [cMaj(), chip('G-maj', 0, { inversions: {}, shapes: {} })] });
  const mine = shared({ list: [cMaj({ [GUITAR]: 'x32010' }), chip('G-maj', 0, { inversions: {}, shapes: {} })] });
  const theirs = shared({ list: [chip('G-maj', 0, { inversions: {}, shapes: {} })] });
  assert.deepStrictEqual(chips(mergeShared(base, mine, theirs)), ['G-maj*0']);
});

test('chips: the same chip added in both tabs: mine where I set it, theirs elsewhere', () => {
  const mine = shared({ list: [cMaj({ [GUITAR]: 'x32010' })] });
  const theirs = shared({ list: [cMaj({ [PIANO]: '48.52.55', [GUITAR]: 'x35553' })] });
  assert.deepStrictEqual(mergeShared(shared(), mine, theirs).list[0].shapes, { [GUITAR]: 'x32010', [PIANO]: '48.52.55' });
});
