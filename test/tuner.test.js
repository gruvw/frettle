/* The tuner's pitch detection: plucked-string-like tones (a weak or
   missing fundamental, strong overtones, decay, noise), from a 5-string
   bass's low B to a mandolin's high frets, at the usual sample rates, read
   to within a cent (2 under F♯1: a window holds under two of their periods),
   never an octave off; silence and noise read as nothing. */
const test = require('node:test');
const assert = require('node:assert');
const { detectPitch, hzMidi, midiHz } = require('./frettle.js');
// (detectPitch reads the newer half of what it is given: 4096 samples, 85 ms
// at 48 kHz; the older half settles its filter, as the tuner gives it)

// A seeded random, so every run hears the same noise
let seed = 1;
const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
// One window of a tone: harmonics with these levels, decaying, plus noise
function tone(hz, rate, n, levels, noise = 0.01, start = 0.3) {
  const x = new Float32Array(n);
  const phases = levels.map(() => random() * 2 * Math.PI);
  for (let i = 0; i < n; i++) {
    const t = start + i / rate;
    let v = 0;
    levels.forEach((a, h) => { v += a * Math.exp(-t * (1 + h)) * Math.sin(2 * Math.PI * hz * (h + 1) * t + phases[h]); });
    x[i] = 0.3 * v + noise * (random() * 2 - 1);
  }
  return x;
}
const PLUCK = [0.5, 1, 0.6, 0.45, 0.3, 0.2, 0.12, 0.08];   // a guitar's: the 2nd harmonic the strongest
const WEAK_ROOT = [0.08, 1, 0.8, 0.5, 0.3, 0.2];            // a bass through a phone's microphone: hardly any fundamental

test('tones from B0 to E6 read to within a cent (2 under F♯1), at 44.1 and 48 kHz', () => {
  const bad = [];
  for (const rate of [44100, 48000]) {
    for (let m = 23; m <= 88; m++) {
      for (const detune of [-37, 0, 17]) {
        const want = m + detune / 100;
        for (const levels of m < 40 ? [PLUCK, WEAK_ROOT] : [PLUCK]) {
          const got = detectPitch(tone(midiHz(want), rate, 8192, levels), rate, 25, 4200);
          if (!got) { bad.push(`${rate} ${want}: nothing`); continue; }
          const off = (hzMidi(got.hz) - want) * 100;
          if (Math.abs(off) > (want < 30 ? 2 : 1)) bad.push(`${rate} ${want.toFixed(2)}: ${off.toFixed(2)} cents${Math.abs(off) > 1100 ? ' (an octave)' : ''}`);
        }
      }
    }
  }
  assert.deepStrictEqual(bad, []);
});

test('a weak fundamental (a small microphone) is not read an octave up', () => {
  // (the fundamental a tenth of the next harmonic, -20 dB: fainter, the
  // sound itself repeats at half its period, and the tuner goes by the
  // note's attack and the tuning's strings, see tunerFrame)
  const WEAK = [0.1, 1, 0.3, 0.7, 0.2, 0.4];
  const bad = [];
  for (let m = 28; m <= 64; m++) {
    for (const start of [0.1, 0.4, 0.8]) {
      const got = detectPitch(tone(midiHz(m), 48000, 8192, WEAK, 0.01, start), 48000, 25, 4200);
      const off = got ? hzMidi(got.hz) - m : null;
      if (off === null || Math.abs(off) > 0.5) bad.push(`${m} from ${start}s: ${off === null ? 'nothing' : `${off.toFixed(2)} semitones`}`);
    }
  }
  assert.deepStrictEqual(bad, []);
});

test('other strings ringing along an octave or two under the note do not pull it down', () => {
  // (a high E played, the low E and the open strings sharing its notes
  // ringing quietly with it, each a tenth as loud: the sound repeats at
  // their longer periods too. Louder than that, as a fading note's can be,
  // it is the note's attack the tuner goes by, see tunerFrame)
  const bad = [];
  for (const [m, along] of [[64, [52, 40, 47]], [59, [47, 40]], [55, [43, 50]], [57, [45, 40]]]) {
    for (const start of [0.1, 0.5, 1]) {
      const x = tone(midiHz(m), 48000, 8192, PLUCK, 0.01, start);
      const level = Math.sqrt(x.reduce((sum, v) => sum + v * v, 0) / x.length);   // (each a tenth as loud as the note, -20 dB)
      along.forEach((a, k) => { for (let i = 0; i < x.length; i++) x[i] += 0.1 * level * Math.SQRT2 * Math.sin(2 * Math.PI * midiHz(a) * (i / 48000) + k); });
      const got = detectPitch(x, 48000, midiHz(33), 4200);
      const off = got ? hzMidi(got.hz) - m : null;
      if (off === null || Math.abs(off) > 0.5) bad.push(`${m} from ${start}s: ${off === null ? 'nothing' : `${off.toFixed(2)} semitones`}`);
    }
  }
  assert.deepStrictEqual(bad, []);
});

test('a stiff string, its overtones sharp, reads in tune from its pluck on', () => {
  // (a thick unwound string, a guitar's G, a ukulele's: its overtones a
  // little sharp of whole multiples, loud as it is plucked, fading fast;
  // the string itself exactly in tune: read whole, up to 20 cents sharp)
  const bad = [];
  for (const m of [55, 67]) {
    for (const stiffness of [0.0003, 0.0008]) {
      const n = 48000;
      const x = new Float32Array(n);
      const amps = Array.from({ length: 16 }, (_, k) => (k === 0 ? 0.6 : 1 / (k + 1)));
      for (let i = 0; i < n; i++) {
        const t = i / 48000;
        x[i] = 0.1 * amps.reduce((v, a, k) => v + a * Math.exp(-t * (1.5 + 2.5 * k)) * Math.sin(2 * Math.PI * (k + 1) * midiHz(m) * Math.sqrt(1 + stiffness * (k + 1) ** 2) * t + k), 0) + 0.0005 * (random() * 2 - 1);
      }
      for (let at = 0; at + 8192 <= n; at += 2400) {   // (every 50 ms, from the pluck)
        const got = detectPitch(x.subarray(at, at + 8192), 48000, midiHz(33), 4200);
        const off = got ? (hzMidi(got.hz) - m) * 100 : null;
        if (off === null || Math.abs(off) > 3) bad.push(`${m}, stiffness ${stiffness}, ${Math.round((at + 4096) / 48)} ms: ${off === null ? 'nothing' : `${off.toFixed(1)} cents`}`);
      }
    }
  }
  assert.deepStrictEqual(bad, []);
});

test('a tuner listening for a guitar (from a fifth under its low E) hears its strings', () => {
  for (const m of [40, 45, 50, 55, 59, 64]) {
    const got = detectPitch(tone(midiHz(m - 0.2), 48000, 8192, PLUCK), 48000, midiHz(40 - 7), 4200);
    assert.ok(got && Math.abs(hzMidi(got.hz) - (m - 0.2)) < 0.01, `string ${m}`);
  }
});

test('silence and noise have no pitch', () => {
  assert.strictEqual(detectPitch(new Float32Array(8192), 48000), null);
  const noise = new Float32Array(8192).map(() => random() * 2 - 1);
  assert.strictEqual(detectPitch(noise, 48000), null);
});
