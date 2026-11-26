/* The metronome's sound and counting: each click soft-edged and short,
   most of it under 4 kHz (a wooden block's, not a beep's or a buzzer's),
   the first beat's higher than the others; each time signature's beats,
   its groups' firsts marked (none: every beat the same). */
const test = require('node:test');
const assert = require('node:assert');
const { metroClick, meterLevels, tempoName, METERS } = require('./frettle.js');
const { fft } = globalThis;

// Its spectrum: the share of its energy under 4 kHz, and its middle (centroid)
function spectrum(x, rate) {
  const n = 8192;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  re.set(x);
  fft(re, im);
  let total = 0;
  let low = 0;
  let mid = 0;
  for (let k = 1; k < n / 2; k++) {
    const hz = (k * rate) / n;
    const p = re[k] ** 2 + im[k] ** 2;
    total += p;
    if (hz < 4000) low += p;
    mid += p * hz;
  }
  return { under4k: low / total, centroid: mid / total };
}

// How loud it sounds: weighted as hearing is (ITU-R BS.1770's K-weighting,
// its 48 kHz filters), the loudest 100 ms, in dB
function loudness(x) {
  let y = Float64Array.from(x);
  for (const [b, a] of [[[1.53512485958697, -2.69169618940638, 1.19839281085285], [1, -1.69065929318241, 0.73248077421585]], [[1, -2, 1], [1, -1.99004745483398, 0.99007225036621]]]) {
    const out = new Float64Array(y.length);
    let [x1, x2, y1, y2] = [0, 0, 0, 0];
    for (let i = 0; i < y.length; i++) { const v = y[i]; const o = b[0] * v + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2; [x2, x1, y2, y1] = [x1, v, y1, o]; out[i] = o; }
    y = out;
  }
  let best = 0;
  let sum = 0;
  for (let i = 0; i < y.length + 4800; i++) { sum += (y[i] || 0) ** 2; if (i >= 4800) sum -= (y[i - 4800] || 0) ** 2; best = Math.max(best, sum / 4800); }
  return 10 * Math.log10(best);
}

test('each click is short, soft-edged, mostly under 4 kHz; the first beat\'s higher', () => {
  for (const rate of [44100, 48000]) {
    const [tic, accent, tac] = [0, 1, 2].map((level) => metroClick(rate, level));
    for (const x of [tic, accent, tac]) {
      const peak = Math.max(...x.map(Math.abs));
      assert.ok(peak > 0.25 && peak <= 0.78, `peak ${peak}`);   // (under where the safety starts rounding, 0.8: see soundChain)
      assert.ok(Math.abs(x[0]) < 0.01 && Math.abs(x[x.length - 1]) < 0.001, 'no edge at either end');
      assert.ok(x.length / rate <= 0.12, 'over within 120 ms');
      assert.ok(spectrum(x, rate).under4k > 0.9, 'nothing harsh');
    }
    assert.ok(spectrum(tic, rate).centroid > 1.15 * spectrum(tac, rate).centroid, 'tic higher than tac');
    assert.ok(spectrum(accent, rate).centroid > 1.05 * spectrum(tac, rate).centroid && spectrum(accent, rate).centroid < spectrum(tic, rate).centroid, 'a group\'s first between them');
    if (rate === 48000) {   // (each about 1.5 dB louder than the next)
      assert.ok(loudness(tic) - loudness(accent) > 1 && loudness(tic) - loudness(accent) < 2.5, 'the tic a little louder than a group\'s first');
      assert.ok(loudness(accent) - loudness(tac) > 1 && loudness(accent) - loudness(tac) < 2.5, 'a group\'s first a little louder than a tac');
    }
  }
});

test('each time signature\'s beats: the first, then each group\'s first', () => {
  assert.deepStrictEqual(METERS.map((m) => m.name), ['2/4', '3/4', '4/4', '5/4', '7/4', '5/8', '6/8', '7/8', '9/8', '12/8']);
  assert.deepStrictEqual(meterLevels('4/4'), [0, 2, 2, 2]);
  assert.deepStrictEqual(meterLevels('3/4'), [0, 2, 2]);
  assert.deepStrictEqual(meterLevels('7/4'), [0, 2, 2, 2, 1, 2, 2]);   // (4+3)
  assert.deepStrictEqual(meterLevels('5/8'), [0, 2, 2, 1, 2]);   // (3+2)
  assert.deepStrictEqual(meterLevels('6/8'), [0, 2, 2, 1, 2, 2]);
  assert.deepStrictEqual(meterLevels('7/8'), [0, 2, 1, 2, 1, 2, 2]);
  assert.deepStrictEqual(meterLevels('12/8'), [0, 2, 2, 1, 2, 2, 1, 2, 2, 1, 2, 2]);
  assert.deepStrictEqual(meterLevels(null), [2]);   // (none: every beat a tac)
  assert.deepStrictEqual(meterLevels('7/8', [3, 2, 2]), [0, 2, 2, 1, 2, 1, 2]);   // (its groups as set)
});

test('tempo names, as over a score', () => {
  assert.deepStrictEqual([30, 40, 60, 72, 100, 112, 120, 160, 180, 220].map(tempoName),
    ['Grave', 'Largo', 'Larghetto', 'Adagio', 'Andante', 'Moderato', 'Allegro', 'Vivace', 'Presto', 'Prestissimo']);
});
