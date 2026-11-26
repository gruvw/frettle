'use strict';

/* Frettle's script, part 3 of 4 (see music.js): sound, out (notes, chords,
   scales played) and in (the tuner). */

/* ==========================================================================
   4. Sound
   (The piano's notes: see strike.)
   Plucked strings synthesised in the browser (Karplus-Strong): a short burst
   of noise circulates in a delay line one period long and is softened a
   little on every pass, which sounds like a plucked string. Each pitch is
   computed once and kept: ahead, in a worker (warmUp), or on first use.
   To sound clear but not buzzy: the burst is softened more for high notes
   (a softer pick) and shaped as if plucked away from the bridge (some
   harmonics cancel), low strings lose a little of their long-ringing fizz,
   and every note goes through a light tone shaping, a little body warmth, a
   small room made from decaying noise, and a soft limiter.
   ========================================================================== */
const STRUM_GAP = 0.035;   // seconds between strings in a strum
const ROLL_GAP = 0.012;    // ... between a piano chord's keys (struck together, barely rolled)
const NOTE_GAP = 0.25;    // ... between notes played one at a time: a scale, a group, a chord arpeggiated
let audio = null;
const pluckCache = new Map();
const SOUND_RATE = 48000;   // the plucks' and the room's (most devices play at it; the browser converts for the others)
/* A sound's buffer. Where the browser allows it, one needs no audio (which
   only starts at a first tap): every sound can then be made ahead, in idle
   time, so the first one plays at once (warmUp). */
function newBuffer(channels, length, rate) {
  try { return new AudioBuffer({ numberOfChannels: channels, length, sampleRate: rate }); }
  catch { return audio ? audio.ctx.createBuffer(channels, length, rate) : null; }
}
const SOUNDS_AHEAD = Boolean(newBuffer(1, 1, SOUND_RATE));

/* Sound stopped by the browser: going again. Suspended until a first
   tap; on iPhones also "interrupted" (a call, another app, the screen
   locked), which a tap ends too. One closed for good: a new one. */
function wakeAudio() {
  if (audio && audio.ctx.state !== 'running' && audio.ctx.state !== 'closed') audio.ctx.resume().catch(() => { /* (not yet: the next tap) */ });
}
function audioOut() {
  if (audio && audio.ctx.state === 'closed') audio = null;
  if (!audio) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    audioKind('playback');
    const ctx = new AC();
    audio = { ctx, out: soundChain(ctx) };
    // (cut off: a call, Siri, the screen locked: the metronome shown stopped, not on and silent)
    ctx.addEventListener('statechange', () => { if (ctx.state !== 'running' && audio && audio.ctx === ctx && metroOn()) stopMetronome(); });
  }
  wakeAudio();
  return audio;
}
/* What kind of sound this is, for iPhones (Safari 16.4 on): played as an
   app's music ('playback'), it is heard with the ring switch on silent too
   (as 'ambient', the browser's own, it is not); while the tuner listens,
   'play-and-record', which the microphone needs. Elsewhere: nothing. */
function audioKind(type) {
  try { if (navigator.audioSession && navigator.audioSession.type !== type) navigator.audioSession.type = type; } catch { /* (not allowed: as it was) */ }
}
/* The audio starts at the first tap or key press anywhere (the browser
   allows it no sooner), so it is running by the time a note is played */
function startAudioEarly() {
  const start = () => {
    if (navigator.userActivation && !navigator.userActivation.isActive) return;   // (not yet a tap the browser counts: the next one)
    const a = audioOut();
    if (a && a.ctx.state === 'running') EARLY_EVENTS.forEach((type) => document.removeEventListener(type, start, true));
  };
  EARLY_EVENTS.forEach((type) => document.addEventListener(type, start, true));
}
const EARLY_EVENTS = ['pointerdown', 'pointerup', 'keydown', 'touchend'];
/* Make sounds ahead, one at a time in a worker (or when the page is
   idle): the room, then the chord's and the scale's notes (likely played first), then every
   other note of the instrument, from the middle out. Called on every
   render: the list starts over (anything made is kept). */
let warmList = [];
let warming = false;
function warmUp(ch, sc) {
  if (!SOUNDS_AHEAD) return;
  const inst = instrument();
  const piano = Boolean(inst.piano);
  const first = [...(ch && ch.shape ? shapeMidis(ch.shape.frets) : []), ...(sc ? scalePitches(sc) : [])];
  const all = [];
  if (piano) for (let k = 0; k < inst.keys; k++) all.push(inst.low + k);
  else inst.strings.forEach((_, s) => { for (let f = startFret(inst, s); f <= inst.frets; f++) all.push(fretPitch(inst, s, f)); });
  all.sort((a, b) => Math.abs(a - 64) - Math.abs(b - 64));
  const cache = piano ? pianoCache : pluckCache;
  warmList = [...new Set([...first, ...all])].filter((m) => !cache.has(m)).map((midi) => ({ midi, piano }));
  if (!roomBuffer) warmList.unshift({ room: true });
  if (warming || !warmList.length) return;
  warming = true;
  const idle = window.requestIdleCallback;
  const later = (f) => (idle ? idle(f, { timeout: 2000 }) : setTimeout(f, 40));
  const step = (deadline) => {
    do {
      const job = warmList.shift();
      if (!job) break;
      if (job.room) roomImpulse();
      else if ((job.piano ? pianoCache : pluckCache).has(job.midi)) continue;
      else if (makeInWorker(job, () => later(step))) return;   // (made in the background: on with the list once it is back)
      else if (job.piano) pianoTone(job.midi);
      else pluck(job.midi);
    } while (deadline && !deadline.didTimeout && deadline.timeRemaining() > 8);
    if (warmList.length) later(step); else warming = false;
  };
  later(step);
}


const SAFE_CURVE = Float32Array.from({ length: 8193 }, (_, i) => {   // (for -2 to 2: fed at half, see soundChain)
  const x = 2 * (i / 4096 - 1);
  const over = Math.abs(x) - 0.8;
  return over <= 0 ? x : Math.sign(x) * (0.8 + 0.2 * Math.tanh(over / 0.2));
});
/* Notes → tone filter → body → (dry + room) → soft limiter → speakers.
   Returns the node notes connect to. */
function soundChain(ctx) {
  const input = ctx.createGain();
  const tone = ctx.createBiquadFilter();   // rounds off only the very top, where plucks fizz
  tone.type = 'lowpass';
  tone.frequency.value = 9000;
  tone.Q.value = 0.5;
  const body = ctx.createBiquadFilter();   // a little wooden warmth
  body.type = 'peaking';
  body.frequency.value = 220;
  body.Q.value = 0.9;
  body.gain.value = 2;
  const presence = ctx.createBiquadFilter();   // a touch less of the piercing band, not enough to dull it
  presence.type = 'peaking';
  presence.frequency.value = 3200;
  presence.Q.value = 1.2;
  presence.gain.value = -1.5;
  const limiter = ctx.createDynamicsCompressor();   // soft: only tames loud strums
  limiter.threshold.value = -14;
  limiter.knee.value = 12;
  limiter.ratio.value = 4;
  limiter.attack.value = 0.006;
  limiter.release.value = 0.25;
  const volume = ctx.createGain();
  volume.gain.value = 0.9;
  input.connect(tone);
  tone.connect(body);
  body.connect(presence);
  presence.connect(limiter);
  if (ctx.createConvolver) {   // the room
    const room = ctx.createConvolver();
    room.buffer = roomImpulse(ctx.sampleRate);   // (a room must be at the audio's own rate)
    const wet = ctx.createGain();
    wet.gain.value = 0.1;
    presence.connect(room);
    room.connect(wet);
    wet.connect(limiter);
  }
  limiter.connect(volume);
  /* Last, a safety: nothing at all up to -2 dBFS (every sound here stays
     under it), above, rounded off rather than clipped (the metronome's
     clicks, which skip the limiter, on a loud chord). input.direct: in
     there, for them */
  const safety = ctx.createWaveShaper();
  safety.curve = SAFE_CURVE;
  const half = ctx.createGain();   // (a curve maps -1 to 1 only: up to twice as loud rounded too, never cut flat)
  half.gain.value = 0.5;
  volume.connect(half);
  half.connect(safety);
  safety.connect(ctx.destination);
  input.direct = half;
  return input;
}

/* A small room's echo, made rather than recorded: soft noise fading out
   in under a second, slightly different in each ear. */
let roomBuffer = null;
function roomImpulse(sr = SOUND_RATE) {
  if (roomBuffer && roomBuffer.sampleRate === sr) return roomBuffer;
  const len = Math.floor(sr * 0.9);
  const ir = newBuffer(2, len, sr);
  const gap = Math.floor(sr * 0.012);   // first reflections arrive after 12 ms
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    let lp = 0;
    for (let i = gap; i < len; i++) {
      const t = (i - gap) / sr;
      lp = 0.55 * lp + 0.45 * (Math.random() * 2 - 1);   // darker than plain noise
      d[i] = lp * Math.exp(-t * 8) * 0.5;
    }
  }
  roomBuffer = ir;
  return ir;
}

/* A plucked note's samples, at `sr`, and the playback rate that puts it in
   tune. Self contained (no outside names): it also runs in a worker. */
// (a plucked note's length, as pluckSamples makes it: written there too, as
// it is sent on its own to make sounds ahead, see warmUp)
const pluckSeconds = (midi) => (midi < 48 ? 1.55 : 1.2);
function pluckSamples(midi, sr) {
  const freq = 440 * 2 ** ((midi - 69) / 12);
  // Averaging each sample with the next one shortens the loop by half a
  // sample, so it sounds at sr / (n - 0.5); playbackRate fixes the rounding
  const n = Math.max(2, Math.floor(sr / freq + 0.5));
  const rate = freq / (sr / (n - 0.5));
  const seconds = midi < 48 ? 1.55 : 1.2;   // note length (low notes ring a bit longer; see pluckSeconds)
  const len = Math.floor(sr * seconds);
  const data = new Float32Array(len);

  // Excitation: smoothed noise, smoother for higher notes (a softer pick
  // where the buzz would be), without DC offset
  const high = Math.min(1, Math.max(0, (midi - 40) / 40));   // 0 for a low E, 1 four octaves up
  const soft = 0.45 + 0.25 * high;
  const loop = new Float32Array(n);
  let prev = 0;
  for (let i = 0; i < n; i++) { prev = (1 - soft) * (Math.random() * 2 - 1) + soft * prev; loop[i] = prev; }
  // Plucked a fifth of the way from the bridge: subtracting a copy shifted by
  // that much cancels every fifth harmonic and rounds the tone
  const shift = Math.max(1, Math.round(n * 0.2));
  const plucked = loop.map((v, i) => v - loop[(i + n - shift) % n]);
  const mean = plucked.reduce((a, v) => a + v, 0) / n;
  let power = 0;
  for (let i = 0; i < n; i++) { loop[i] = plucked[i] - mean; power += loop[i] * loop[i]; }
  const gain = 0.2 / (Math.sqrt(power / n) || 1);   // every note plucked equally hard
  for (let i = 0; i < n; i++) loop[i] *= gain;

  const damping = 0.9965;             // extra loss per pass: shorter, less boomy low notes
  const fade = Math.floor(sr * 0.4);  // gentle fade over the last 0.4 s, never a click
  const attack = Math.floor(sr * 0.004);   // 4 ms fade-in takes the edge off the attack
  // Low strings keep their high harmonics for long; on small speakers (that
  // cannot play the low fundamental) that is all you hear, a buzz. A gentle
  // low-pass that follows the pitch keeps them round.
  const smooth = 1 - Math.exp((-2 * Math.PI * Math.min(12000, freq * 36)) / sr);
  let y = 0;
  let k = 0;
  for (let i = 0; i < len; i++) {
    const next = (k + 1) % n;
    const env = i < attack ? i / attack : i > len - fade ? (len - i) / fade : 1;
    y += smooth * (loop[k] - y);
    data[i] = y * env;
    loop[k] = damping * 0.5 * (loop[k] + loop[next]);
    k = next;
  }
  return { data, rate };
}

/* The piano: each key's sound worked out once (then kept), as a struck
   string does: its harmonics a little sharp of whole multiples (stiff
   steel), shaped by where the hammer hits (1/8.5 of the way along) and by
   its soft felt (the high ones give out, sooner down low), each fading on
   its own (high ones sooner, low notes slowest), fast at first, then
   slowly (the strike, then the ring); two strings a hair apart from the
   bass up (one at the very bottom), which slowly beat; and the hammer's
   soft knock. Kept at a low rate (the top harmonic kept is under 7.5 kHz)
   to be quick to work out. Self contained (no outside names): it also
   runs in a worker. */
function pianoSamples(midi, sr) {
  const f0 = 440 * 2 ** ((midi - 69) / 12);
  const x = Math.min(1, Math.max(0, (midi - 21) / 87));   // 0 at the bottom (A0), 1 at the top (C8)
  const len = Math.floor(sr * (midi < 48 ? 1.55 : 1.2));   // as long as a plucked note (pluckSamples)
  const data = new Float32Array(len);
  const stiff = 0.00008 * 2 ** (3.6 * x);         // how sharp the harmonics run
  const ring = 0.2 + 15 * (1 - x) ** 3.2;         // the fundamental's slow fade (seconds): as long as a plucked note rings
  const felt = 900 + 3200 * x;                    // where the harmonics start to give out (Hz)
  const cents = midi < 30 ? [0] : [-0.6, 0.7];    // the strings
  let seed = midi * 7919 + 13;                    // (the same sound every time)
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let n = 1; n <= 48; n++) {
    const fn = n * f0 * Math.sqrt(1 + stiff * n * n);
    if (fn > 7500) break;
    const amp = Math.abs(Math.sin(Math.PI * n / 8.5)) / n ** 0.7 / Math.sqrt(1 + (fn / felt) ** 4);
    if (amp < 0.002) continue;   // (too soft to hear)
    const tau = ring / (1 + fn / 700);
    const fast = Math.exp(-1 / (sr * tau * 0.18));
    const slow = Math.exp(-1 / (sr * tau));
    const end = Math.min(len, Math.floor(sr * tau * 9));   // (all but silent by then)
    for (const c of cents) {
      // A step round the circle per sample (no sine to work out each time)
      const w = (2 * Math.PI * fn * 2 ** ((c * (1 + 0.15 * n)) / 1200)) / sr;
      const cw = Math.cos(w);
      const sw = Math.sin(w);
      const phase = rnd() * 2 * Math.PI;
      let re = (Math.cos(phase) * amp) / cents.length;
      let im = (Math.sin(phase) * amp) / cents.length;
      let e1 = 0.7;
      let e2 = 0.3;
      for (let i = 0; i < end; i++) {
        data[i] += im * (e1 + e2);
        const r = re * cw - im * sw;
        im = re * sw + im * cw;
        re = r;
        e1 *= fast;
        e2 *= slow;
      }
    }
  }
  // The hammer's knock: a short burst of soft noise
  const soft = 1 - Math.exp((-2 * Math.PI * Math.min(4000, 600 + f0 * 2)) / sr);
  let lp = 0;
  for (let i = 0; i < sr * 0.06; i++) {
    lp += soft * (rnd() * 2 - 1 - lp);
    data[i] += 0.12 * lp * Math.exp(-i / (sr * 0.01));
  }
  // Every key as loud (the top a little softer: the ear hears it more),
  // with a 2 ms start and a 0.4 s end: never a click
  const early = Math.floor(sr * 0.3);
  let power = 0;
  for (let i = 0; i < early; i++) power += data[i] * data[i];
  // (as loud to the ear as a plucked note at the same pitch, measured
  // through the app's sound path: the low notes need the most help, the
  // high ones less than none; above the highest fret, as loud as it)
  const level = 10 ** (Math.min(4.5, Math.max(-3.5, 5.6 - 0.19 * (midi - 40))) / 20);
  const gain = (0.115 * (1 - 0.3 * x) * level) / (Math.sqrt(power / early) || 1);
  const rise = sr * 0.002;
  const fade = sr * 0.4;
  for (let i = 0; i < len; i++) data[i] *= gain * Math.min(1, i / rise, (len - i) / fade);
  return data;
}
const PIANO_RATE = 24000;
const pianoCache = new Map();   // a key's sound (an AudioBuffer), by MIDI number
const toBuffer = (data, rate) => {
  const buffer = newBuffer(1, data.length, rate);
  buffer.getChannelData(0).set(data);
  return buffer;
};
/* A note's sound, made now if not made yet (most are made ahead: warmUp) */
function pluck(midi) {
  if (!pluckCache.has(midi)) keepSound({ piano: false, midi, ...pluckSamples(midi, SOUND_RATE) });
  return pluckCache.get(midi);
}
function pianoTone(midi) {
  if (!pianoCache.has(midi)) keepSound({ piano: true, midi, data: pianoSamples(midi, PIANO_RATE) });
  return pianoCache.get(midi);
}
function keepSound({ piano, midi, data, rate }) {
  if (piano) { if (!pianoCache.has(midi)) pianoCache.set(midi, toBuffer(data, PIANO_RATE)); }
  else if (!pluckCache.has(midi)) pluckCache.set(midi, { buffer: toBuffer(data, SOUND_RATE), rate });
}
/* Sounds made ahead in a worker, so the page never waits on them (where
   one can't be made: in idle time, warmUp). `done` is called once the
   sound is back; false: no worker. */
let soundWorker = null;   // (false: none to be had)
let soundDone = null;
function makeInWorker(job, done) {
  if (soundWorker === null) {
    try {
      const code = `${pluckSamples}\n${pianoSamples}\nonmessage = (e) => {
        const { piano, midi } = e.data;
        const made = piano ? { data: pianoSamples(midi, ${PIANO_RATE}) } : pluckSamples(midi, ${SOUND_RATE});
        postMessage({ piano, midi, ...made }, [made.data.buffer]);
      };`;
      soundWorker = new Worker(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
      const next = () => {
        const then = soundDone;
        soundDone = null;
        if (then) then();
      };
      soundWorker.onmessage = (e) => { keepSound(e.data); next(); };
      soundWorker.onerror = () => { soundWorker = false; next(); };   // (none after all: on in idle time)
    } catch {
      soundWorker = false;
    }
  }
  if (!soundWorker) return false;
  soundDone = done;
  soundWorker.postMessage({ piano: job.piano, midi: job.midi });
  return true;
}
/* Strike a key; returns something to stop it (the damper: a quick fade) */
function strike(a, midi, delay, level) {
  const { ctx } = a;
  const src = ctx.createBufferSource();
  src.buffer = pianoTone(midi);
  src.playbackRate.value = pitchA / PITCH_USUAL;   // (as playNote's)
  const gain = ctx.createGain();
  gain.gain.value = level;
  src.connect(gain);
  gain.connect(a.out);
  src.start(ctx.currentTime + delay);
  return {
    stop: () => {
      const t = ctx.currentTime;   // (one not started yet never will)
      gain.gain.setTargetAtTime(0, t, 0.03);
      try { src.stop(t + 0.2); } catch { /* over */ }
    },
  };
}

/* Play a pitch now, or `delay` seconds from now: plucked, or on the piano
   struck */
function playNote(midi, delay = 0, level = 0.55) {
  const a = audioOut();
  if (!a) return;
  if (state && findInstrument(state.instrument).piano) return strike(a, midi, delay, level);
  const { buffer, rate } = pluck(midi);
  const src = a.ctx.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = (rate * pitchA) / PITCH_USUAL;   // (made at A 440: played at the reference pitch)
  const gain = a.ctx.createGain();
  gain.gain.value = level;
  src.connect(gain);
  gain.connect(a.out);
  src.start(a.ctx.currentTime + delay);
  return src;
}

/* Light up a note while it sounds: on the neck, or any pill (ping). The
   class goes once its animations are over (the pop, the ring, a hidden
   note's fade, a dimmed one's), or cut short (hidden meanwhile): one left
   on would play them again whenever the pill is shown again (a sheet
   reopened, a panel moved), long after the note sounded. */
function ping(el) {
  if (!el) return;
  const cls = el.classList.contains('out') ? 'peek' : 'ping';   // a hidden note shows for a moment
  el.classList.remove(cls);
  void el.offsetWidth;   // restart the animation
  el.classList.add(cls);
  const turn = (el.pingTurn = (el.pingTurn || 0) + 1);   // (pinged again meanwhile: that one's to clear)
  const running = el.getAnimations ? el.getAnimations({ subtree: true }) : [];
  Promise.allSettled(running.map((anim) => anim.finished)).then(() => { if (el.pingTurn === turn) el.classList.remove(cls); });
}
function flashCell(s, f, delay = 0) {
  setTimeout(() => els.neck.querySelectorAll(`.cell[data-s="${s}"][data-f="${f}"] .note`).forEach(ping), delay * 1000);   // (and its copy in the strip)
}
function flashKey(k, delay = 0) {   // a piano key
  setTimeout(() => ping(els.neck.querySelector(`.key[data-key="${k}"] .note`)), delay * 1000);
}

/* Tap a note on the neck to hear it (not behind the capo; a note hidden by
   "Only scale notes" sounds too, and shows for a moment).
   With a mouse or a pen it sounds on press. On a touch screen it sounds once
   the finger has rested TAP_DELAY ms without moving (or on release, if that
   comes first), so swiping to scroll the neck never plays notes, nor does
   a touch that stops a scroll still gliding. Each finger is followed on its
   own, so two quick taps both sound. */
const TAP_DELAY = 120;  // ms (long enough for a swipe to have moved by then)
const TAP_SLOP = 8;     // px a finger may move and still count as a tap
// A glide is set going by a finger and lasts a few seconds at most: only
// those scrolls count (not the page's own, as it brings a shape into view,
// which a touch does not stop: a tap then still plays)
let lastSwipe = -Infinity;    // when a finger last moved
let lastScroll = -Infinity;   // when something (the page, a row) last scrolled after one
if (typeof document !== 'undefined') {   // (not in test/, which runs the script without a page)
  document.addEventListener('touchmove', () => { lastSwipe = performance.now(); }, { capture: true, passive: true });
  document.addEventListener('scroll', () => { if (performance.now() - lastSwipe < 3000) lastScroll = performance.now(); }, { capture: true, passive: true });
}
const stillScrolling = () => performance.now() - lastScroll < 120;
function setupNeckTaps() {
  const taps = new Map();   // pointerId → { cell, x, y, timer, done }
  const playable = (target) => {
    const cell = target.closest('.cell, .key');
    return cell && !cell.matches('.behind, .no-string, .waiting') ? cell : null;
  };
  const play = (cell) => {
    if (naming) { namerTap(cell); return; }
    if (cell.dataset.key !== undefined) {   // a keyboard's key
      const k = Number(cell.dataset.key);
      playNote(instrument().low + k);
      flashKey(k);
      if (cell.querySelector('.note.chord, .note.ghost')) keepChord();
      return;
    }
    const s = Number(cell.dataset.s);
    const f = Number(cell.dataset.f);
    playNote(fretPitch(instrument(), s, f));
    flashCell(s, f);
    if (cell.querySelector('.note.chord, .note.ghost')) keepChord();   // a note of the chord: it is being used
  };
  const cancel = (e) => {
    const tap = taps.get(e.pointerId);
    if (tap) { clearTimeout(tap.timer); taps.delete(e.pointerId); }
  };
  els.neck.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;   // main button only
    const cell = playable(e.target);
    if (!cell) return;
    if (e.pointerType !== 'touch') { play(cell); return; }
    if (stillScrolling()) return;   // (the touch stops the glide: no note)
    const tap = { cell, x: e.clientX, y: e.clientY, done: false };
    tap.timer = setTimeout(() => { tap.done = true; play(cell); }, TAP_DELAY);
    taps.set(e.pointerId, tap);
  });
  els.neck.addEventListener('pointermove', (e) => {
    const tap = taps.get(e.pointerId);
    if (tap && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > TAP_SLOP) cancel(e);
  });
  els.neck.addEventListener('pointerup', (e) => {
    const tap = taps.get(e.pointerId);
    if (!tap) return;
    clearTimeout(tap.timer);
    if (!tap.done) play(tap.cell);
    taps.delete(e.pointerId);
  });
  els.neck.addEventListener('pointercancel', cancel);   // the browser started scrolling
  els.neck.addEventListener('contextmenu', (e) => e.preventDefault());   // no long-press menu
}

/* Anything that sounds plays on press, like the neck: at once with a mouse
   or a pen; with a finger after TAP_DELAY (or on lifting it, if sooner), and
   not at all if it moves past TAP_SLOP first (it was a swipe to scroll).
   Enter or Space on a focused one plays it too. */
function onPress(box, selector, act) {   // (selector null: the box itself, a button)
  const taps = new Map();
  const target = (e) => {
    const el = selector ? e.target.closest(selector) : box;
    return el && box.contains(el) && !el.disabled ? el : null;
  };
  const cancel = (e) => {
    const tap = taps.get(e.pointerId);
    if (tap) { clearTimeout(tap.timer); taps.delete(e.pointerId); }
  };
  box.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    const el = target(e);
    if (!el) return;
    if (e.pointerType !== 'touch') { act(el); return; }
    if (stillScrolling()) return;
    const tap = { el, x: e.clientX, y: e.clientY, done: false };
    tap.timer = setTimeout(() => { tap.done = true; act(el); }, TAP_DELAY);
    taps.set(e.pointerId, tap);
  });
  box.addEventListener('pointermove', (e) => {
    const tap = taps.get(e.pointerId);
    if (tap && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > TAP_SLOP) cancel(e);
  });
  box.addEventListener('pointerup', (e) => {
    const tap = taps.get(e.pointerId);
    if (!tap) return;
    clearTimeout(tap.timer);
    if (!tap.done) act(tap.el);
    taps.delete(e.pointerId);
  });
  box.addEventListener('pointercancel', cancel);
  box.addEventListener('click', (e) => {   // the keyboard (a pointer played it on press)
    const el = e.detail === 0 && target(e);
    if (el) act(el);
  });
}

/* A strum button: tapped, it strums; held (HOLD_MS, as a chip held to be
   dragged), it arpeggiates. What it plays is known only once let go
   (sooner) or held long enough, so it sounds then, not on press. A swipe to scroll that starts on it plays
   nothing, as with onPress: a finger moving past TAP_SLOP, the browser
   taking over (pointercancel), or a glide still going when it lands; a
   mouse let go off it, nothing either. Enter or Space on it, focused: the
   tap. (Space anywhere else: the same, see the keys in 6. Events.) */
function onHold(btn, tap, hold) {
  let press = null;   // { id, x, y, touch, timer }
  const drop = () => { if (press) { clearTimeout(press.timer); press = null; } };
  btn.addEventListener('pointerdown', (e) => {
    if (e.button > 0 || btn.disabled) return;
    const touch = e.pointerType === 'touch';
    if (touch && stillScrolling()) return;
    drop();
    press = { id: e.pointerId, x: e.clientX, y: e.clientY, touch };
    press.timer = setTimeout(() => { press = null; hold(); }, HOLD_MS);
  });
  btn.addEventListener('pointermove', (e) => {
    if (press && press.id === e.pointerId && press.touch && Math.hypot(e.clientX - press.x, e.clientY - press.y) > TAP_SLOP) drop();
  });
  btn.addEventListener('pointerup', (e) => {
    if (!press || press.id !== e.pointerId) return;
    drop();
    tap();
  });
  btn.addEventListener('pointercancel', drop);
  btn.addEventListener('pointerleave', (e) => { if (press && !press.touch && press.id === e.pointerId) drop(); });
  btn.addEventListener('contextmenu', (e) => e.preventDefault());   // (no long-press menu)
  btn.addEventListener('click', (e) => { if (e.detail === 0 && !btn.disabled) tap(); });   // (the keyboard)
}

/* Browsers only let sound start after a tap or a key press, and some only
   count the end of a tap. Waking the audio on those events means the very
   first note of a visit is not lost. */
if (typeof document !== 'undefined') {
  for (const type of ['pointerup', 'touchend', 'keydown']) {
    document.addEventListener(type, wakeAudio, { passive: true });
  }
}

/* Strum the current shape from the top string down, skipping muted ones. */
function strum() {
  const ch = currentChord();
  if (!ch || !ch.shape) return;
  keepChord();
  strumFrets(ch.shape.frets);
}
function strumFrets(frets) {
  const inst = instrument();
  if (inst.piano) {   // the keys together, rolled a little, low to high
    frets.forEach((k, i) => {
      playNote(inst.low + k, i * ROLL_GAP, 0.6);   // (louder than a strum's notes: a piano chord has fewer, as loud in all)
      flashKey(k, i * ROLL_GAP);
    });
    return;
  }
  const c = capo();
  let i = 0;
  frets.forEach((f, s) => {
    if (f < 0) return;
    const delay = i++ * STRUM_GAP;
    playNote(shapePitch(inst, s, f) + c, delay, 0.45);
    flashCell(s, shapeNeckFret(inst, s, f, c), delay);
  });
}

/* A chord one note at a time (a strum button held, or Space): the shape
   shown, or the notes placed (Name a chord), in a strum's order, NOTE_GAP
   apart, as the scale and its groups play, each lit as it sounds. Its
   button a Stop meanwhile: tapped (or Space) it stops, as does playing the
   scale or a group, or another chord, shape or notes (see draw). */
let arpRun = null;   // { key, sources, timers }
// (what it plays: the notes placed, naming; else the shape shown; '' none)
function arpKey() {
  if (naming) return naming.frets.some((f) => f >= 0) ? `namer|${naming.frets}|${instrument().strings}|${capo()}` : '';
  const ch = currentChord();
  return ch && ch.shape ? [ch.root, ch.def.id, ch.bassIndex, ch.shape.frets, instrument().strings, capo()].join('|') : '';
}
function arpeggiate() {
  if (arpRun) { stopArpeggio(); return; }
  const key = arpKey();
  if (!key) return;
  const frets = naming ? naming.frets : currentChord().shape.frets;
  if (!naming) keepChord();
  stopScale();
  stopGroup();
  const inst = instrument();
  const c = capo();
  const notes = inst.piano ? frets.map((k) => ({ midi: inst.low + k, k }))
    : frets.flatMap((f, s) => (f < 0 ? [] : [{ midi: shapePitch(inst, s, f) + c, s, f: shapeNeckFret(inst, s, f, c) }]));
  arpRun = { key, sources: [], timers: [] };
  notes.forEach((x, i) => {
    arpRun.sources.push(playNote(x.midi, i * NOTE_GAP, inst.piano ? 0.6 : 0.5));
    arpRun.timers.push(setTimeout(() => (x.k !== undefined ? flashKey(x.k) : flashCell(x.s, x.f)), i * NOTE_GAP * 1000));
  });
  // Done once the last note has started: it rings on, and the button is back
  arpRun.timers.push(setTimeout(() => { arpRun = null; renderStrumButtons(); }, (notes.length - 1) * NOTE_GAP * 1000 + 50));
  renderStrumButtons();
}
function stopArpeggio() {
  if (!arpRun) return;
  for (const src of arpRun.sources) { try { if (src) src.stop(); } catch { /* already over */ } }
  for (const t of arpRun.timers) clearTimeout(t);
  arpRun = null;
  renderStrumButtons();
}
// A strum button tapped: its strum (Name a chord: the notes placed); while
// an arpeggio plays, it stops it
function strumTapped() {
  if (arpRun) stopArpeggio();
  else if (naming) namerPlay();
  else strum();
}

/* ==========================================================================
   Tuner: a popup that listens with the microphone (not on the keyboards).
   What is heard is always under the needle, in the middle: a strip of
   notes (C0 to C8) slides under it, the tuning's open strings in purple,
   the string picked outlined, a note played in tune on one of them green;
   under it the same strip ten times closer (cents), around the nearest
   note. Nothing heard yet: the strip rests on middle C, dimmed; once quiet
   again, dimmed where the last note was. Above them, the tuning's strings:
   a tap plays one and makes it the target (which way to turn the peg, how
   far), tapped again, no target. Folded, those go and the tuner is
   chromatic: any note, no strings marked. It always opens unfolded, no
   string picked. Without the microphone (refused, none, no way
   to ask), the strings stay, to tune by ear, and a message says how to get
   it back in place of the strips.
   The pitch: YIN (de Cheveigné and Kawahara), its difference function
   worked out with an FFT, on the last 4096 samples (85 ms at 48 kHz: enough
   for a 5-string bass's low B), every frame; a median of the last few
   against stray readings, then eased on screen.
   ========================================================================== */
const TUNER_LOW = 12;       // C0, the strip's first note (midi)
const TUNER_HIGH = 108;     // C8, its last
const TUNER_REST = 60;      // middle C: where it rests until a note is heard
const IN_TUNE = 4;          // cents either way that count as in tune
const TUNER_HOLD = 700;     // ms a note stays after it fades out
const TUNER_SETTLE = 200;   // ms after a pluck its cents are not shown (see tunerFrame)
const FINE_PX = 5;          // the fine strip: px per cent
/* The reference pitch: A4's, in Hz (440 as usual; 415 for Baroque
   players, 442 for some orchestras...). The tuner measures against it,
   every note plays at it (playNote: its speed); kept on this device (in
   the instrument menu: see setPitch). Within PITCH_MIN and PITCH_MAX: every
   pitch in use (392, French Baroque, to 466, Venetian); past them, a
   transposition, as the capo is */
const PITCH_USUAL = 440;
const PITCH_MIN = 390;
const PITCH_MAX = 470;
const PITCH_KEY = 'frettle-pitch';
let pitchA = PITCH_USUAL;
try {
  const kept = typeof localStorage === 'undefined' ? NaN : Number(localStorage.getItem(PITCH_KEY));
  if (kept >= PITCH_MIN && kept <= PITCH_MAX) pitchA = Math.round(kept);
} catch { /* (none kept: as usual) */ }
function setPitch(hz) {
  pitchA = Math.max(PITCH_MIN, Math.min(PITCH_MAX, Math.round(hz)));
  try { if (pitchA === PITCH_USUAL) localStorage.removeItem(PITCH_KEY); else localStorage.setItem(PITCH_KEY, String(pitchA)); } catch { /* not kept */ }
  renderPitch();
}
const refText = () => `A = ${pitchA} Hz`;
// (shown where it is: the instrument menu's row, if open; the tuner's title)
function renderPitch() {
  const row = document.querySelector('#pitchRow');
  if (row) {
    row.querySelector('.pitch-value').textContent = refText();
    row.querySelector('[data-pitch="-1"]').disabled = pitchA <= PITCH_MIN;
    row.querySelector('[data-pitch="1"]').disabled = pitchA >= PITCH_MAX;
    row.querySelector('.pitch-reset').hidden = pitchA === PITCH_USUAL;
  }
  if (els.tunerPitch) { els.tunerPitch.textContent = refText(); els.tunerPitch.hidden = pitchA === PITCH_USUAL; }   // (the tuner's: only when not as usual)
  if (typeof renderHeader === 'function' && els.instrumentPicker) renderHeader();   // (the instrument's button: there too, when not as usual)
}
const hzMidi = (hz) => 69 + 12 * Math.log2(hz / pitchA);
const midiHz = (m) => pitchA * 2 ** ((m - 69) / 12);

// FFT, in place (re, im: a power of two long); inverse: unscaled
const fftTables = new Map();
function fft(re, im, inverse = false) {
  const n = re.length;
  let t = fftTables.get(n);
  if (!t) {
    const bits = Math.round(Math.log2(n));
    const rev = new Uint32Array(n);
    for (let i = 0; i < n; i++) { let r = 0; for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b); rev[i] = r; }
    const cos = new Float64Array(n / 2);
    const sin = new Float64Array(n / 2);
    for (let i = 0; i < n / 2; i++) { cos[i] = Math.cos((2 * Math.PI * i) / n); sin[i] = Math.sin((2 * Math.PI * i) / n); }
    t = { rev, cos, sin };
    fftTables.set(n, t);
  }
  for (let i = 0; i < n; i++) {
    const j = t.rev[i];
    if (j > i) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let size = 2; size <= n; size *= 2) {
    const half = size / 2;
    const step = n / size;
    for (let i = 0; i < n; i += size) {
      for (let j = 0; j < half; j++) {
        const wr = t.cos[j * step];
        const wi = inverse ? t.sin[j * step] : -t.sin[j * step];
        const a = i + j;
        const b = a + half;
        const xr = re[b] * wr - im[b] * wi;
        const xi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - xr; im[b] = im[a] - xi;
        re[a] += xr; im[a] += xi;
      }
    }
  }
}
/* The pitch of a sound (samples, a power of two long, at `rate`): its
   frequency, and how clear it is (0 to 1), or null (no clear pitch, or
   none between minHz and maxHz). The difference of the sound with itself
   shifted by each lag, normalised by its mean so far: the first dip under
   the threshold is the period (the deepest one past it: an octave too low
   is never as deep first), between samples by a parabola. */
const YIN_THRESHOLD = 0.1;   // (lower, a weak fundamental's half-period dip passes for the period: an octave up; higher, more noise does)
// (its working arrays, kept for the next frame: none made 60 times a second)
const yinBuffers = new Map();
function yinScratch(n) {
  if (!yinBuffers.has(n)) yinBuffers.set(n, { re: new Float64Array(n), im: new Float64Array(n), re2: new Float64Array(n), im2: new Float64Array(n), energy: new Float64Array(n + 1), d: new Float64Array(n / 2 + 1), dn: new Float64Array(n / 2 + 1) });
  return yinBuffers.get(n);
}
/* Read twice: the whole sound, then only its low part. A stiff string
   (a thick unwound one: a guitar's G, a ukulele's G) has its overtones a
   little sharp of whole multiples, loud as it is plucked: read whole,
   the note reads up to 20 cents sharp for its first few hundred ms. So
   the first reading says which note it is, the second, the sound kept to
   its fundamental and 2nd harmonic (FILTER_OVER times the first reading),
   within a third of it, how in tune. x: twice the samples read, the
   older half only there for the filter to have settled by the newer (from
   silence, its first ms would ring, and read off). */
const FILTER_OVER = 2.5;
function detectPitch(x, rate, minHz = 25, maxHz = 4200) {
  const half = x.length / 2;
  const rough = yinPitch(x.subarray(half), rate, minHz, maxHz);
  if (!rough) return null;
  const fine = yinPitch(lowPass(x, rate, rough.hz * FILTER_OVER).subarray(half), rate, rough.hz / 1.25, rough.hz * 1.25);
  return fine ? { hz: fine.hz, clarity: rough.clarity } : rough;
}
// (low-passed: two Butterworth sections, -24 dB an octave past `cutoff`)
const lowBuffers = new Map();
function lowPass(x, rate, cutoff) {
  if (!lowBuffers.has(x.length)) lowBuffers.set(x.length, new Float64Array(x.length));
  const y = lowBuffers.get(x.length);
  const w = Math.tan((Math.PI * Math.min(cutoff, rate * 0.45)) / rate);
  for (let pass = 0; pass < 2; pass++) {
    const q = pass ? 1.3066 : 0.5412;   // (a 4th-order Butterworth's two sections)
    const norm = 1 / (1 + w / q + w * w);
    const [b0, b1, a1, a2] = [w * w * norm, 2 * w * w * norm, 2 * (w * w - 1) * norm, (1 - w / q + w * w) * norm];
    let x1 = 0;
    let x2 = 0;
    let y1 = 0;
    let y2 = 0;
    const src = pass ? y : x;
    for (let i = 0; i < x.length; i++) {   // (plain numbers: this runs 16 000 times a frame)
      const v = src[i];
      const out = b0 * v + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = v; y2 = y1; y1 = out;
      y[i] = out;
    }
  }
  return y;
}
function yinPitch(x, rate, minHz, maxHz) {
  const n = x.length;
  const tauMax = Math.min(Math.floor(rate / minHz), Math.floor(n / 2));
  const tauMin = Math.max(2, Math.floor(rate / maxHz));
  const w = n - tauMax;   // the window compared
  let mean = 0;
  for (let i = 0; i < n; i++) mean += x[i];
  mean /= n;
  const { re, im, re2, im2, energy, d, dn } = yinScratch(n);   // (energy: running sums of the squares)
  for (let i = 0; i < n; i++) { re[i] = x[i] - mean; im[i] = 0; re2[i] = i < w ? re[i] : 0; im2[i] = 0; }
  for (let i = 0; i < n; i++) energy[i + 1] = energy[i] + re[i] * re[i];
  if (energy[w] <= 1e-12) return null;
  // r(τ) = Σ x[j] x[j+τ], j < w: the whole sound against its window
  fft(re, im);
  fft(re2, im2);
  for (let i = 0; i < n; i++) {
    const a = re[i] * re2[i] + im[i] * im2[i];
    const b = im[i] * re2[i] - re[i] * im2[i];
    re[i] = a; im[i] = b;
  }
  fft(re, im, true);
  for (let tau = 1; tau <= tauMax; tau++) d[tau] = Math.max(0, energy[w] + energy[tau + w] - energy[tau] - (2 * re[tau]) / n);
  dn[0] = 1;
  let sum = 0;
  for (let tau = 1; tau <= tauMax; tau++) { sum += d[tau]; dn[tau] = sum > 0 ? (d[tau] * tau) / sum : 1; }
  let best = -1;
  for (let tau = tauMin; tau < tauMax; tau++) {
    if (dn[tau] < YIN_THRESHOLD) {
      while (tau + 1 < tauMax && dn[tau + 1] < dn[tau]) tau++;
      best = tau;
      break;
    }
  }
  if (best < 0) return null;
  const [a, b, c] = [d[best - 1], d[best], d[best + 1]];
  const curve = a - 2 * b + c;
  const shift = curve > 0 ? Math.max(-1, Math.min(1, (a - c) / (2 * curve))) : 0;
  const hz = rate / (best + shift);
  return hz >= minHz && hz <= maxHz ? { hz, clarity: 1 - dn[best] } : null;
}
const TUNER_START = 0.002;   // the least level (RMS, about -54 dBFS) a note can start at
const TUNER_TAIL = 0.0001;   // ... it is followed down to, fading (about -80 dBFS; or twice the room's level, if more)
const TUNER_STEADY = 3;      // readings in a row, close together, before a note shows
const TUNER_MEDIAN = 7;      // the readings a note's pitch is the median of (about 120 ms)
const EASE_SMALL_MS = 120;   // the needle easing to a pitch near it, within EASE_NEAR (time to go two thirds of the way)
const EASE_BIG_MS = 45;      // ... to one further: a new note
const EASE_NEAR = 0.12;      // (semitones)
const TUNER_STILL = 0.01;    // (semitones: a cent, see tunerFrame)
/* A pitch heard in these samples, as a midi number with its fraction, or
   null. A note starts as a string does, with an attack: well above the
   room's own level (learnt between notes, quickly down, slowly up; a hum,
   a fan, a fridge, steady, are learnt too, so never taken for a note, even
   with a pitch of their own); once it has, it is followed as it fades,
   down to just above that level, however long it lasts (plucked again
   and again, or an electric guitar's sustain). */
const TUNER_WARM_MS = 300;   // as the microphone starts: the room only listened to (its first samples can be silence)
function hearPitch(x, rate, minHz, maxHz) {
  let sq = 0;
  for (let i = x.length / 2; i < x.length; i++) sq += x[i] * x[i];   // (the newer half: the one read, see detectPitch)
  const level = Math.sqrt(sq / (x.length / 2));
  const now = performance.now();
  if (now < tuner.warmUntil) { tuner.floor = tuner.floor === null || !tuner.floor ? level : tuner.floor + (level - tuner.floor) * 0.2; return null; }
  if (tuner.floor === null) tuner.floor = level;
  // (an attack: twice as loud as at any time in the last 100 ms)
  tuner.levels = [...(tuner.levels || []).slice(-5), level];
  tuner.attack = level > 2 * Math.min(...tuner.levels.slice(0, -1), Infinity);
  const following = tuner.pitch !== null;
  const start = Math.max(TUNER_START, tuner.floor * 3);
  tuner.quiet = level < start;   // (too quiet for a note to start: only the note followed is heard, see tunerFrame)
  const found = level >= (following ? Math.max(TUNER_TAIL, tuner.floor * 2) : start) ? detectPitch(x, rate, minHz, maxHz) : null;
  // (between notes: down at once; up slowly, on what has no pitch and is
  // not well above it, an attack never; under a note, not at all)
  if (!following) {
    if (level < tuner.floor) tuner.floor = level;
    else if (!found && level < tuner.floor * 3) tuner.floor += (level - tuner.floor) * 0.02;
  }
  return found ? hzMidi(found.hz) : null;
}

const tuner = {
  status: 'off',   // the microphone: 'asking', 'on', 'blocked' (refused for good), 'dismissed' (refused, can ask again), 'nomic', 'unsupported', 'error'
  token: 0,        // (each start: one overtaken by a close or another start drops its stream)
  stream: null, source: null, analyser: null, buf: null, raf: 0,
  target: null,    // the string picked: its index
  folded: false,   // the strings hidden: chromatic
  mutedUntil: 0,   // (until when the microphone is not listened to: a string's note playing)
  strings: [],     // the tuning's open strings (midi), as listed
  recent: [],      // the last pitches heard (midi), for their median
  odd: 0,          // readings in a row far from those
  pitch: null,     // the pitch heard (midi, its fraction), or null
  floor: null,     // the room's own level (see hearPitch; null: not heard yet)
  heardAt: 0,      // when last heard (ms)
  shown: TUNER_REST,   // where the strips are, as drawn (eased toward the pitch)
  settleUntil: 0,  // (until when a pluck's cents are not shown, see tunerFrame)
  settleNote: null, settleAim: null,   // (... its note, where the strips wait meanwhile)
  aim: null,       // (where the strips are going: the pitch, or where they wait, see tunerFrame)
  sliding: false,  // (... from far: not there yet)
  heardAim: null,  // (the pitch the strips last went to, heard: not a note waited on, nor middle C at rest)
  waiting: false,  // (a note just plucked, its cents not shown yet)
  fineNote: null,  // the note the fine strip is drawn around
  drawn: '',       // (what the strips last showed: nothing changed, nothing touched)
  cell: 0, width: 0, fineWidth: 0,   // (sizes, read as it opens and on resize)
};
const tunerFolded = () => tuner.folded;
const tunerFlats = (inst) => state.flats || Boolean(inst.tuning && inst.tuning.flats);
const tunerNote = (m) => pitchText(m, plainNote(m, tunerFlats(instrument())));
// (... its octave smaller, as everywhere in the tuner: E₂)
const tunerNoteHtml = (m) => { const n = plainNote(m, tunerFlats(instrument())); return `${esc(noteText(n))}<span class="tuner-oct">${Math.floor((m - n.acc) / 12) - 1}</span>`; };
const tunerLive = () => tuner.status === 'on' || tuner.status === 'asking';
function openTuner() {
  const inst = instrument();
  if (inst.piano || els.tuner.open) return;
  renderPitch();   // (its title: the reference pitch)
  // (the metronome on: paused while it listens, on again once it closes)
  metro.paused = metroOn();
  if (metro.paused) stopMetronome();
  tuner.strings = inst.strings.slice();
  // (always as it first was: the strings shown, none picked, on middle C)
  Object.assign(tuner, { target: null, folded: false, mutedUntil: 0, pitch: null, recent: [], odd: 0, shown: TUNER_REST, settleUntil: 0, settleNote: null, aim: null, sliding: false, heardAim: null, waiting: false, fineNote: null, drawn: '', floor: null });
  // The strip: every note from C0 to C8, the strings' marked
  els.tunerTape.innerHTML = Array.from({ length: TUNER_HIGH - TUNER_LOW + 1 }, (_, i) => {
    const m = TUNER_LOW + i;
    return `<span class="tn${plainNote(m, false).acc ? ' acc' : ''}" data-m="${m}">${tunerNoteHtml(m)}</span>`;
  }).join('');
  if (els.tuner.showModal) els.tuner.showModal(); else els.tuner.setAttribute('open', '');
  renderTuner();
  measureTuner();
  startMic();   // (in the tap: the browser asks now, and the sound may start)
  cancelAnimationFrame(tuner.raf);
  tuner.raf = requestAnimationFrame(tunerFrame);
}
function closeTuner() {
  if (els.tuner.open) { if (els.tuner.close) els.tuner.close(); else els.tuner.removeAttribute('open'); }
  tunerClosed();
}
function tunerClosed() {   // (the popup gone, however: the microphone off, the metronome on again if it was)
  stopMic();
  cancelAnimationFrame(tuner.raf);
  tuner.status = 'off';
  if (metro.paused) { metro.paused = false; startMetronome(); }
}
function measureTuner() {
  const cell = els.tunerTape.firstElementChild;
  tuner.cell = cell ? cell.offsetWidth : 48;
  tuner.width = els.tunerStrip.clientWidth;
  tuner.fineWidth = els.tunerFine.clientWidth;
  tuner.drawn = '';
}
/* The microphone, asked for (the browser asks the first time). Refused: for
   good (the site blocked, or no question shown at all: only the browser's
   settings can change that) or for now (the question dismissed: it can be
   asked again). Its sound kept raw: the processing meant for calls (echo,
   noise, level) would blur the pitch. */
const MIC_ANSWER_MS = 400;   // (refused sooner than this: no one was asked)
async function startMic() {
  const token = ++tuner.token;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { setTunerStatus('unsupported'); return; }
  const a = audioOut();   // (started in the tap, while the browser allows it)
  audioKind('play-and-record');   // (before the microphone, after the sound's first start: see audioKind)
  setTunerStatus('asking');
  let stream;
  const asked = performance.now();
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
  } catch (err) {
    if (token !== tuner.token) return;
    // (refused at once: no question was shown, as no one answers one that
    // fast; the browser will not ask, whatever its permission says: Chrome
    // after a few dismissed, for a while, or an installed app on Android)
    const unasked = performance.now() - asked < MIC_ANSWER_MS;
    if (err && (err.name === 'NotFoundError' || err.name === 'OverconstrainedError')) setTunerStatus('nomic');
    else if (err && (err.name === 'NotAllowedError' || err.name === 'SecurityError')) setTunerStatus(await micBlocked() || unasked ? 'blocked' : 'dismissed');
    else setTunerStatus(err && err.name === 'NotSupportedError' ? 'unsupported' : 'error');
    return;
  }
  if (token !== tuner.token || !els.tuner.open || !a) { stream.getTracks().forEach((t) => t.stop()); if (!a && token === tuner.token) setTunerStatus('unsupported'); return; }
  wakeAudio();
  tuner.stream = stream;
  tuner.source = a.ctx.createMediaStreamSource(stream);
  tuner.analyser = a.ctx.createAnalyser();
  tuner.analyser.fftSize = 2 * (a.ctx.sampleRate > 50000 ? 8192 : 4096);   // (the newer half read, the older for detectPitch's filter)
  tuner.source.connect(tuner.analyser);   // (heard only: never played back)
  tuner.buf = new Float32Array(tuner.analyser.fftSize);
  Object.assign(tuner, { floor: null, warmUntil: performance.now() + TUNER_WARM_MS });
  setTunerStatus('on');
}
function stopMic() {
  tuner.token++;
  if (tuner.stream) tuner.stream.getTracks().forEach((t) => t.stop());
  if (tuner.source) tuner.source.disconnect();
  Object.assign(tuner, { stream: null, source: null, analyser: null, buf: null, pitch: null, recent: [] });
  if (audio) audioKind('playback');
}
// (refused for good: the browser says so; it may not say, then: not for good)
let micPermission = null;
async function micBlocked() {
  try {
    if (!micPermission) {
      micPermission = await navigator.permissions.query({ name: 'microphone' });
      // Changed in the browser's settings while the tuner is open: allowed,
      // it listens; asking again possible, the button for it
      micPermission.addEventListener('change', () => {
        if (!els.tuner.open || tunerLive()) return;
        if (micPermission.state === 'granted') startMic();
        else if (micPermission.state === 'prompt') setTunerStatus('dismissed');
      });
    }
    return micPermission.state === 'denied';
  } catch { return false; }
}
function setTunerStatus(status) {
  tuner.status = status;
  renderTuner();
}
const TUNER_MESSAGES = {   // [what happened, what to do, its button]
  blocked: ['The microphone is blocked', 'Allow it in your browser’s settings for this site.', ''],
  dismissed: ['The tuner needs the microphone', '', 'Allow microphone'],
  nomic: ['No microphone found', '', 'Try again'],
  unsupported: ['No microphone in this browser', '', ''],
  error: ['The microphone couldn’t start', '', 'Try again'],
};
// The popup's parts, for the microphone's status and the fold
function renderTuner() {
  const inst = instrument();
  const message = TUNER_MESSAGES[tuner.status];
  const folded = tunerFolded() && !message;   // (no microphone: the strings, to tune by ear)
  els.tunerFold.hidden = Boolean(message);
  els.tunerFold.setAttribute('aria-expanded', String(!folded));
  els.tunerFold.title = folded ? 'Show the strings' : 'Hide the strings: a chromatic tuner';
  els.tunerFold.setAttribute('aria-label', els.tunerFold.title);
  els.tunerHead.classList.toggle('folded', folded);
  // (as the instrument menu shows them: its name, then any tuning but the standard one)
  els.tunerTuning.innerHTML = folded ? '<span class="inst-name">Chromatic</span>'
    : `<span class="inst-name">${esc(inst.name)}</span>${tuningName(inst) ? `<span class="inst-tuning">${esc(tuningName(inst))}</span>` : ''}`;
  els.tunerStrings.hidden = folded;
  // (its room kept when hidden: the tuning beside the instrument's name
  // does not jump to the next line as it appears, on a narrow screen)
  els.tunerClear.style.visibility = folded || tuner.target === null ? 'hidden' : '';
  // (built once as it opens, then only marked: a press keeps its button, its splash and its focus)
  const built = tuner.strings.map((m) => tunerNote(m)).join(' ');
  if (els.tunerStrings.dataset.built !== built) {
    els.tunerStrings.dataset.built = built;
    els.tunerStrings.innerHTML = tuner.strings.map((m, s) => `<button type="button" class="tuner-string" data-s="${s}" aria-pressed="false" ` +
      `title="String ${tuner.strings.length - s}: ${esc(tunerNote(m))}. Tap to hear it and tune to it, again to stop">` +
      `<span class="tuner-num">${tuner.strings.length - s}</span><span class="tuner-name">${tunerNoteHtml(m)}</span></button>`).join('');
  }
  for (const el of els.tunerStrings.children) el.setAttribute('aria-pressed', String(!folded && tuner.target === Number(el.dataset.s)));
  els.tunerView.hidden = Boolean(message);
  els.tunerMessage.hidden = !message;
  if (message) {
    els.tunerHint.textContent = 'Tap a string to tune to it';   // (by ear)
    els.tunerHint.className = 'tuner-hint';
    els.tunerMessageTitle.textContent = message[0];
    els.tunerMessageText.textContent = message[1];
    els.tunerMessageText.hidden = !message[1];
    els.tunerRetry.hidden = !message[2];
    els.tunerRetry.textContent = message[2];
  }
  // (the strings marked on the strip: not when folded)
  for (const el of els.tunerTape.children) {
    const m = Number(el.dataset.m);
    el.classList.toggle('string', !folded && tuner.strings.includes(m));
    el.classList.toggle('target', !folded && tuner.target !== null && tuner.strings[tuner.target] === m);
  }
  tuner.fineNote = null;
  tuner.drawn = '';
  drawTuner();
}
function tunerFrame(now) {
  tuner.raf = requestAnimationFrame(tunerFrame);
  let heard = null;
  const muted = now < tuner.mutedUntil;   // (a string's note playing: its own sound not heard as yours)
  if (muted && tuner.pitch !== null) Object.assign(tuner, { pitch: null, recent: [], odd: 0 });
  if (tuner.analyser && !muted) {
    tuner.analyser.getFloatTimeDomainData(tuner.buf);
    const folded = tunerFolded();
    // (listening for the strings, from a fifth under the lowest; chromatic: all)
    const low = folded || !tuner.strings.length ? 25 : Math.max(25, midiHz(Math.min(...tuner.strings) - 7));
    heard = hearPitch(tuner.buf, tuner.analyser.context.sampleRate, low, 4200);
    if (heard !== null && tuner.attack && now >= tuner.settleUntil) Object.assign(tuner, { settleUntil: now + TUNER_SETTLE, settleNote: null });
  }
  /* A note's octave is the one heard as it starts (the string plucked
     louder than anything then): until the next attack, a reading whole
     octaves away is that note. A string never jumps an octave as it
     fades; a reading does: its fundamental fading first (an octave up),
     or the other strings ringing along, an octave or two under it, longer
     than it (an octave down). */
  if (heard !== null && tuner.pitch !== null && !tuner.attack) {
    const octaves = Math.round((heard - tuner.pitch) / 12);
    if (octaves && Math.abs(heard - 12 * octaves - tuner.pitch) < 0.6) heard -= 12 * octaves;
  }
  /* A note starting an octave above one of the tuning's strings, itself
     none of them: that string (its fundamental too faint to be heard, as a
     phone hears a bass's low E). Not when chromatic: no strings to go by. */
  else if (heard !== null && !tuner.folded) {
    const string = (m) => tuner.strings.some((open) => Math.abs(m - open) < 0.6);
    if (!string(heard) && string(heard - 12)) heard -= 12;
  }
  /* Fading, under where a note can start: only that note (after its
     octave, as above), however faint; anything else heard then (a hum,
     the room) is nothing, not a new note */
  if (heard !== null && tuner.quiet && tuner.pitch !== null && Math.abs(heard - tuner.pitch) > 0.6) heard = null;
  /* A note shows once steady: TUNER_STEADY readings in a row close
     together (a click, a word, a stray reading moves nothing), its pitch
     the median of the last TUNER_MEDIAN; one far from them starts a new
     note, which shows once steady too. Gone quiet, the strips stay where
     the last note was, dimmed (the next note likely near it): on middle C
     only before any */
  if (heard !== null) {
    const med = tuner.recent.length ? median(tuner.recent) : heard;
    if (Math.abs(heard - med) > 0.6) {
      tuner.odd++;
      if (tuner.odd >= TUNER_STEADY || tuner.pitch === null) { tuner.recent = [heard]; tuner.odd = 0; }
    } else {
      tuner.odd = 0;
      tuner.recent.push(heard);
      if (tuner.recent.length > TUNER_MEDIAN) tuner.recent.shift();
    }
    if (tuner.odd === 0 && tuner.recent.length >= TUNER_STEADY) { tuner.pitch = median(tuner.recent); tuner.heardAt = now; }
  } else {
    if (tuner.pitch === null) tuner.recent = [];   // (not steady yet: no note)
    if (tuner.pitch !== null && now - tuner.heardAt > TUNER_HOLD) Object.assign(tuner, { pitch: null, recent: [], odd: 0 });
  }
  /* For TUNER_SETTLE after a pluck, its cents are not shown: a string
     plucked is sharp at first, settling, and its fundamental thrown off
     by the guitar's body. The note shows at once; its cents as they were
     (the same note plucked again), or none yet (another: on the note,
     neither in tune nor which way, see drawTuner) */
  let aim = tuner.pitch;
  if (now >= tuner.settleUntil) tuner.waiting = false;
  else if (tuner.pitch !== null) {
    const note = Math.round(tuner.pitch);
    if (note !== tuner.settleNote) {
      const kept = tuner.heardAim !== null && Math.round(tuner.heardAim) === note;
      Object.assign(tuner, { settleNote: note, settleAim: kept ? tuner.heardAim : note, waiting: !kept });
    }
    aim = tuner.settleAim;
  }
  // (still: where the strips are going moves only by more than TUNER_STILL;
  // a string's own wobble, a cent or so, moves nothing, a peg turned does)
  if (aim !== null && tuner.aim !== null && !tuner.waiting && Math.round(aim) === Math.round(tuner.aim) && Math.abs(aim - tuner.aim) < TUNER_STILL) aim = tuner.aim;
  if (aim !== null) tuner.heardAim = tuner.waiting ? null : aim;
  tuner.aim = aim;
  // The needle eases there: gently over a few cents, quickly to a new
  // note; by the time passed, not by frames (a 120 Hz screen as a 60 Hz one)
  const dt = Math.min(100, now - (tuner.frameAt || now));
  tuner.frameAt = now;
  if (aim !== null) {
    // (sliding: from further than EASE_NEAR until there, within half a cent; see drawTuner)
    if (Math.abs(aim - tuner.shown) > EASE_NEAR) tuner.sliding = true;
    else if (Math.abs(aim - tuner.shown) < 0.005) tuner.sliding = false;
    const ease = Math.abs(aim - tuner.shown) > EASE_NEAR ? EASE_BIG_MS : EASE_SMALL_MS;
    tuner.shown += (aim - tuner.shown) * (1 - Math.exp(-dt / ease));
    if (Math.abs(aim - tuner.shown) < 0.0005) tuner.shown = aim;
  }
  drawTuner();
}
const median = (list) => { const s = [...list].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
// The strips where they are now, the note heard, the hint
function drawTuner() {
  if (!els.tuner.open || els.tunerView.hidden) return;
  const folded = tunerFolded();
  const { shown } = tuner;
  // The note, as heard; how far off, as the needle says it, eased (sliding
  // to a new note: where it is going, not every cent it passes).
  // In tune once within IN_TUNE, out again only past a cent more: a note
  // at the edge does not blink
  const near = tuner.pitch === null ? null : Math.round(tuner.pitch);
  const pitch = tuner.pitch === null ? null : tuner.sliding ? tuner.aim : shown;
  const cents = pitch === null ? 0 : (pitch - near) * 100;
  const onString = near !== null && (folded || tuner.strings.includes(near));
  const ok = onString && !tuner.waiting && Math.abs(cents) <= IN_TUNE + (tuner.inTune ? 1 : 0);
  tuner.inTune = ok;
  const target = folded || tuner.target === null ? null : tuner.strings[tuner.target];
  els.tunerTape.style.transform = `translateX(${(tuner.width / 2 - (shown - TUNER_LOW + 0.5) * tuner.cell).toFixed(1)}px)`;
  // The fine strip: around the note nearest to where the strips are
  const around = Math.max(TUNER_LOW, Math.min(TUNER_HIGH, Math.round(shown)));
  if (around !== tuner.fineNote) drawFine(around, folded);
  els.tunerFineTape.style.transform = `translateX(${(tuner.fineWidth / 2 - (shown * 100 - ((around - 1) * 100 - 50)) * FINE_PX).toFixed(1)}px)`;
  // What changed since the last frame: the note heard, in tune or not, the target's side
  const targetX = target === null ? null : tuner.width / 2 + (target - shown) * tuner.cell;
  const edge = tuner.width * 0.14;
  const side = targetX === null ? '' : targetX < edge ? 'left' : targetX > tuner.width - edge ? 'right' : '';
  const hint = tunerHint(pitch, near, cents, ok, target);
  const key = [near, ok, side, hint.text, tuner.status].join('|');
  if (key === tuner.drawn) return;
  tuner.drawn = key;
  els.tunerView.classList.toggle('idle', pitch === null);
  els.tunerView.classList.toggle('ok', ok);
  els.tunerView.dataset.note = near === null ? '' : String(near);
  for (const el of els.tunerTape.querySelectorAll('.near, .ok')) el.classList.remove('near', 'ok');
  for (const el of els.tunerFineTape.querySelectorAll('.ok')) el.classList.remove('ok');
  if (near !== null) {
    const el = els.tunerTape.querySelector(`[data-m="${near}"]`);
    if (el) el.classList.add('near', ...(ok ? ['ok'] : []));
    if (ok) for (const el of els.tunerFineTape.querySelectorAll(`[data-m="${near}"]`)) el.classList.add('ok');   // (its band, its name)
  }
  els.tunerLeft.hidden = side !== 'left';
  els.tunerRight.hidden = side !== 'right';
  if (side) els[side === 'left' ? 'tunerLeft' : 'tunerRight'].querySelector('.tuner-edge-name').innerHTML = tunerNoteHtml(target);
  for (const el of els.tunerStrings.children) el.classList.toggle('ok', ok && !folded && tuner.strings[Number(el.dataset.s)] === near);
  els.tunerHint.innerHTML = hint.html;
  els.tunerHint.className = `tuner-hint${hint.cls ? ` ${hint.cls}` : ''}`;
}
/* The line under the strips: nothing heard yet, what to play; the target
   picked, which way to turn and how far; else the note heard and how far
   off it is */
const ARROW_UP = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M6 11l6-6 6 6"/></svg>';
const ARROW_DOWN = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M6 13l6 6 6-6"/></svg>';
function tunerHint(pitch, near, cents, ok, target) {
  // (text: what it says; html: the same, the notes' octaves smaller)
  const say = (parts, cls = '', icon = '') => ({
    text: parts.map((p) => (typeof p === 'number' ? tunerNote(p) : p)).join(''),
    html: `${icon}<span>${parts.map((p) => (typeof p === 'number' ? tunerNoteHtml(p) : esc(p))).join('')}</span>`,
    cls,
  });
  if (tuner.status === 'asking') return say(['Allow the microphone to start']);
  if (pitch === null) return say(tunerFolded() ? ['Play a note'] : target === null ? ['Play a string to tune to it'] : ['Play the ', target, ' string']);
  if (tuner.waiting) return say([near]);   // (just plucked: its cents to come)
  if (target !== null) {
    const off = (pitch - target) * 100;
    if (Math.abs(off) <= IN_TUNE) return say([target, ' in tune'], 'ok');
    const steps = Math.round(Math.abs(off) / 100);
    const far = Math.abs(off) < 100 ? `${Math.round(Math.abs(off))} cents` : `${steps} semitone${steps === 1 ? '' : 's'}`;
    return say([off < 0 ? 'Tune up to ' : 'Tune down to ', target, `, ${far}`], 'turn', off < 0 ? ARROW_UP : ARROW_DOWN);
  }
  if (ok) return say([near, ' in tune'], 'ok');
  const by = Math.round(Math.abs(cents));
  return say(by ? [near, `, ${by} cent${by === 1 ? '' : 's'} ${cents < 0 ? 'flat' : 'sharp'}`] : [near]);
}
// The fine strip around a note: its cents, a tick every 5, numbered every
// 10, the note's name at 0, the band in tune around it (the strings'
// purple, the target's outlined, as on the strip), the notes either side too
function drawFine(around, folded) {
  tuner.fineNote = around;
  const html = [];
  const x = (k, c) => ((k - (around - 1)) * 100 + c + 50) * FINE_PX;
  for (let k = around - 1; k <= around + 1; k++) {
    if (k < TUNER_LOW || k > TUNER_HIGH) continue;
    const string = !folded && tuner.strings.includes(k);
    const target = !folded && tuner.target !== null && tuner.strings[tuner.target] === k;
    html.push(`<span class="fz${string ? ' string' : ''}${target ? ' target' : ''}" data-m="${k}" style="left:${x(k, -IN_TUNE)}px;width:${2 * IN_TUNE * FINE_PX}px"></span>`);
    for (let c = -50; c < 50; c += 5) {
      const cls = c === 0 ? ' zero' : c % 10 === 0 ? ' major' : '';
      html.push(`<span class="ft${cls}" style="left:${x(k, c)}px"></span>`);
      if (c && c % 10 === 0 && Math.abs(c) < 50) html.push(`<span class="fl" style="left:${x(k, c)}px">${c > 0 ? '+' : '−'}${Math.abs(c)}</span>`);
    }
    html.push(`<span class="fl name${string ? ' string' : ''}" data-m="${k}" style="left:${x(k, 0)}px">${tunerNoteHtml(k)}</span>`);
  }
  els.tunerFineTape.innerHTML = html.join('');
  tuner.drawn = '';
}
// A string tapped: heard, and the target (tapped again: heard again; Clear,
// no target)
function pickTunerString(s) {
  playNote(tuner.strings[s]);
  tuner.target = s;
  // (the microphone would hear it: not listened to for 95% of its length,
  // the rest too faint to start a note)
  tuner.mutedUntil = performance.now() + (pluckSeconds(tuner.strings[s]) * 950 * PITCH_USUAL) / pitchA;   // (played slower at a lower reference pitch: longer)
  renderTuner();
  ping(els.tunerStrings.children[s]);   // (the amber splash, as every note that sounds)
}
function clearTunerTarget() {
  tuner.target = null;
  renderTuner();
}
function foldTuner() {
  tuner.folded = !tuner.folded;
  renderTuner();
}

/* ==========================================================================
   Metronome
   A bar of clicks, made for its tempo and time signature, looped by the
   audio itself: in time to the sample however busy the page, and on in a
   hidden tab (no timer to fall behind). Changed as it plays: the new bar
   from the next beat, the count going on (a new time signature: from its
   first beat). The first beat a higher "tic", the others a "tac"; in 7/4
   (4+3), 5/8 (3+2), 6/8, 7/8 (2+2+3), 9/8, 12/8 each group's first a
   little louder; with none, every beat a tac. The beats light up as they are heard. On until
   stopped, its popup closed too (its button outlined meanwhile); paused
   while the tuner listens.
   ========================================================================== */
const METRO_MIN = 30;
const METRO_MAX = 250;
const METRO_KEY = 'frettle-metronome';   // (the tempo and time signature, as last set: none too)
/* (two rows: in quarters, then in eighths). Each its usual groups, then
   the other ways it is often felt; with none at all after (each beat the
   same but the first), the beats row tapped goes through them (see
   cycleGroups) */
const METERS = [
  { name: '2/4', groups: [2] }, { name: '3/4', groups: [3] }, { name: '4/4', groups: [4], alts: [[2, 2]] },
  { name: '5/4', groups: [5], alts: [[3, 2], [2, 3]] }, { name: '7/4', groups: [4, 3], alts: [[3, 4], [2, 2, 3]] },
  { name: '5/8', groups: [3, 2], alts: [[2, 3]] }, { name: '6/8', groups: [3, 3], alts: [[2, 2, 2]] },
  { name: '7/8', groups: [2, 2, 3], alts: [[3, 2, 2], [2, 3, 2]] }, { name: '9/8', groups: [3, 3, 3], alts: [[2, 2, 2, 3], [3, 2, 2, 2]] },
  { name: '12/8', groups: [3, 3, 3, 3], alts: [[6, 6]] },
];
// (each beat's click: 0 the first, 1 a group's first, 2 any other; no time signature, a bar of one tac)
const meterLevels = (meter, groups = meterGroups(meter)) => (meter === null ? [2] : groups.flatMap((n, g) => Array.from({ length: n }, (_, i) => (i ? 2 : g ? 1 : 0))));
/* Its groups: as chosen (the beats row tapped), else as usual (7/8: 2+2+3);
   the ways it can be grouped, the usual first */
const meterGroups = (meter) => (meter === null ? [1] : metro.groups[meter] || METERS.find((m) => m.name === meter).groups);
const meterBeats = (meter) => METERS.find((m) => m.name === meter).groups.reduce((a, b) => a + b, 0);
function groupings(meter) {
  if (meter === null) return [[1]];
  const { groups, alts = [] } = METERS.find((m) => m.name === meter);
  return [groups, ...alts, ...(groups.length > 1 ? [[meterBeats(meter)]] : [])];
}
// The tempo's Italian name, as written over a score (up to each bound)
const TEMPO_NAMES = [[40, 'Grave'], [60, 'Largo'], [66, 'Larghetto'], [76, 'Adagio'], [108, 'Andante'], [120, 'Moderato'], [156, 'Allegro'], [176, 'Vivace'], [200, 'Presto'], [Infinity, 'Prestissimo']];
const tempoName = (bpm) => TEMPO_NAMES.find(([upTo]) => bpm < upTo)[1];
const metro = {
  bpm: 100, meter: '4/4', loaded: false,
  bars: [],        // the bars scheduled, the latest last: { src, from (when it starts, audio time), start (its beat 0), dur (a beat), beats, first, meter }
  taps: [],        // (tap tempo: when tapped, ms)
  raf: 0, beat: null, retimed: 0, retimer: 0, newMeter: false,
  paused: false,   // (stopped while the tuner listens: on again once it closes)
  groups: {},      // (the time signature's groups as chosen, if not as usual: { '7/8': [3, 2, 2] }; another time signature, forgotten)
};
function loadMetronome() {
  if (metro.loaded) return;
  metro.loaded = true;
  try {
    const saved = JSON.parse(localStorage.getItem(METRO_KEY)) || {};
    if (saved.meter === null || METERS.some((m) => m.name === saved.meter)) metro.meter = saved.meter;
    if (Number.isFinite(saved.bpm)) metro.bpm = Math.max(METRO_MIN, Math.min(METRO_MAX, Math.round(saved.bpm)));
    const groups = metro.meter !== null && (saved.groups || {})[metro.meter];   // (its time signature's other grouping, if one of its)
    const known = groups && groupings(metro.meter).find((g) => String(g) === String(groups));
    if (known) metro.groups[metro.meter] = known;
  } catch { /* (none kept: as it comes) */ }
}
const saveMetronome = () => { try { localStorage.setItem(METRO_KEY, JSON.stringify({ bpm: metro.bpm, meter: metro.meter, groups: metro.groups })); } catch { /* not kept */ } };
/* The beats row tapped: its time signature's next way of grouping them
   (after the last, the usual again). As it plays: from the next beat, the
   count going on. The usual: nothing kept */
function cycleGroups() {
  const meter = metro.meter;
  const ways = groupings(meter);
  if (ways.length < 2) return;
  const now = ways.findIndex((g) => String(g) === String(meterGroups(meter)));
  const next = ways[(now + 1) % ways.length];
  if (next === ways[0]) delete metro.groups[meter]; else metro.groups[meter] = next;
  metroChanged();
}

/* A click: a small wooden block struck, as a metronome's: a few
   resonances (a wooden bar's, not whole multiples) dying within some tens
   of ms, a short knock under them, and the strike itself, a burst of noise
   ringing at the block's middle, over in a couple of ms. Nothing sharp: no
   edge at its start, little above 4 kHz. The tic a major third above the
   tac, a group's first between them; each a little louder than the next. */
const metroClicks = new Map();   // (audio rate → the three clicks, made once)
function metroClick(rate, level) {
  const hz = [1318.5, 1174.7, 1046.5][level];   // (E6, D6, C6: a whole tone apart, mi re do)
  const peak = [0.76, 0.53, 0.63][level];   // (1.5 dB apart as heard: the tic louder than a note tapped, the tacs as loud or a little more, a strum louder still: see metroLoop)
  const modes = [[1, 1, 0.022], [2.3, 0.7, 0.012], [3.4, 0.4, 0.007]];   // (× hz, level, seconds to fade to a third)
  const n = Math.round(rate * 0.11);
  const fade = Math.round(rate * 0.012);
  // (the strike's ring: a resonator at 2.2 × hz, as a 2-pole filter)
  const r = Math.exp((-Math.PI * hz * 0.9) / rate);
  const c = 2 * r * Math.cos((2 * Math.PI * hz * 2.2) / rate);
  const x = new Float32Array(n);
  let seed = 7;
  let y1 = 0;
  let y2 = 0;
  let max = 0;
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    let v = 0;
    for (const [k, a, tau] of modes) v += a * Math.exp(-t / tau) * Math.sin(2 * Math.PI * hz * k * t);
    v += 0.3 * Math.exp(-t / 0.005) * Math.sin(2 * Math.PI * hz * 0.32 * t);   // (the knock)
    seed = (seed * 16807) % 2147483647;
    const y = ((seed / 2147483647) * 2 - 1) * Math.exp(-t / 0.0015) + c * y1 - r * r * y2;
    y2 = y1;
    y1 = y;
    v += 0.2 * y;
    v *= Math.min(1, t / 0.0004) * Math.min(1, (n - i) / fade);
    x[i] = v;
    max = Math.max(max, Math.abs(v));
  }
  for (let i = 0; i < n; i++) x[i] *= peak / max;
  return x;
}
// A bar of clicks, a whole number of samples long (a beat: exactly a share of it)
function metroBar(ctx) {
  const rate = ctx.sampleRate;
  if (!metroClicks.has(rate)) metroClicks.set(rate, [0, 1, 2].map((level) => metroClick(rate, level)));
  const clicks = metroClicks.get(rate);
  const levels = meterLevels(metro.meter);
  const beats = levels.length;
  const length = Math.round((beats * 60 * rate) / metro.bpm);
  const buffer = ctx.createBuffer(1, length, rate);
  const data = buffer.getChannelData(0);
  levels.forEach((level, b) => {
    const at = Math.round((b * length) / beats);
    data.set(clicks[level].subarray(0, length - at), at);
  });
  return { buffer, beats, dur: length / rate / beats };
}
// That bar, looped from `when` (audio time), from its beat `first`
function metroLoop(when, first) {
  const a = audio;
  const { buffer, beats, dur } = metroBar(a.ctx);
  const src = a.ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  src.connect(a.out.direct || a.out);   // (not through the limiter: it would take a click's sharp start for a loud sound and turn it all down)
  src.start(when, first * dur);
  return { src, from: when, start: when - first * dur, dur, beats, first, meter: metro.meter };
}
const metroOn = () => metro.bars.length > 0;
function startMetronome() {
  const a = audioOut();
  if (!a) return;
  stopMetronome();
  metro.bars = [metroLoop(a.ctx.currentTime + 0.06, 0)];
  renderMetronome();
  metroFrame();
}
function stopMetronome() {
  for (const bar of metro.bars) { try { bar.src.stop(); } catch { /* (already) */ } }
  metro.bars = [];
  clearTimeout(metro.retimer);
  metro.retimer = 0;
  cancelAnimationFrame(metro.raf);
  showMetroBeat(-1);
  renderMetronome();
}
/* The tempo or time signature changed as it plays: the new bar from the
   next beat (not too near to be on time), the old one stopped there; a bar
   still to come (changed again before it began) replaced */
function retimeMetronome(newMeter) {
  if (!metroOn()) return;
  const now = audio.ctx.currentTime;
  const last = metro.bars[metro.bars.length - 1];
  let when;
  let first;
  if (now < last.from - 0.01) {
    try { last.src.stop(); } catch { /* (already) */ }
    metro.bars.pop();
    when = last.from;
    first = newMeter ? 0 : last.first;
  } else {
    let k = Math.floor((now - last.start) / last.dur) + 1;
    if (last.start + k * last.dur - now < 0.03) k++;
    when = last.start + k * last.dur;
    first = newMeter ? 0 : k % last.beats;
    last.src.stop(when);
  }
  metro.bars.push(metroLoop(when, first));
  metro.bars.splice(0, Math.max(0, metro.bars.length - 3));   // (the ones long over: let go)
}
// (dragging the tempo: retimed at most every METRO_RETIME ms, the last change always)
const METRO_RETIME = 80;
function metroChanged(newMeter = false) {
  saveMetronome();
  renderMetronome();
  if (!metroOn()) return;
  metro.newMeter = metro.newMeter || newMeter;
  if (metro.retimer) return;
  const go = () => { metro.retimer = 0; metro.retimed = performance.now(); const m = metro.newMeter; metro.newMeter = false; retimeMetronome(m); };
  const wait = METRO_RETIME - (performance.now() - metro.retimed);
  if (wait <= 0) go(); else metro.retimer = setTimeout(go, wait);
}
function setMetroTempo(bpm) {
  bpm = Math.max(METRO_MIN, Math.min(METRO_MAX, Math.round(bpm)));
  if (bpm === metro.bpm) return;
  metro.bpm = bpm;
  metroChanged();
}
// (the one selected tapped again: none)
// (another time signature, or none: grouped as usual, any other grouping forgotten)
function setMetroMeter(meter) {
  metro.meter = meter === metro.meter ? null : meter;
  metro.groups = {};
  metroChanged(true);
}
/* Tap tempo: the beat tapped, the tempo its taps' (the last 6; one more
   than 2 s after the last starts over: slower than the slowest tempo) */
function tapTempo() {
  const now = performance.now();
  const taps = metro.taps;
  if (taps.length && now - taps[taps.length - 1] > 2000) taps.length = 0;
  taps.push(now);
  if (taps.length > 6) taps.shift();
  const btn = els.metroTap;
  btn.classList.remove('tapped');
  void btn.offsetWidth;   // (the flash again)
  btn.classList.add('tapped');
  if (taps.length >= 2) setMetroTempo(60000 / ((taps[taps.length - 1] - taps[0]) / (taps.length - 1)));
}
/* Where the clicks are, as heard now: the bar, the beat's count in it and
   how far into that beat (0 to 1), or null (not started yet, or stopped).
   Heard: the audio's time as the browser says it reaches the speakers
   (else less the latency it gives), METRO_LEAD ahead (a frame on its way
   to the screen) */
const METRO_LEAD = 0.02;
function metroHeard(lead = 0) {
  if (!metroOn() || audio.ctx.state !== 'running') return null;
  const ctx = audio.ctx;
  const stamp = ctx.getOutputTimestamp ? ctx.getOutputTimestamp() : null;
  const t = (stamp && stamp.performanceTime > 0 ? stamp.contextTime + (performance.now() - stamp.performanceTime) / 1000
    : ctx.currentTime - (ctx.outputLatency || ctx.baseLatency || 0)) + lead;
  let bar = null;
  for (const b of metro.bars) if (b.from <= t) bar = b;
  if (!bar) return null;
  const at = (t - bar.start) / bar.dur + 1e-6;
  const k = Math.floor(at);
  return { bar, k, into: at - k };
}
/* The beats shown as heard, every frame while it plays and its popup is
   open (none in a hidden tab, or closed: the clicks go on): the beat's dot
   lit at once as it sounds, then fading quickly, out a moment before the
   next beat (with no time signature, the one dot: a blink each beat, never
   seemingly on all along) */
const METRO_FADE = 0.08;   // s its fade lasts (at most a quarter of a beat)
const METRO_OFF = 0.07;    // s it is out before the next beat (at most a fifth)
function metroFrame() {
  cancelAnimationFrame(metro.raf);
  metro.raf = 0;
  if (!metroOn() || !els.metronome.open) return;
  metro.raf = requestAnimationFrame(metroFrame);
  const h = metroHeard(METRO_LEAD);
  if (!h || h.bar.meter !== metro.meter) { showMetroBeat(-1); return; }
  const { bar, k, into } = h;
  const fade = Math.min(METRO_FADE, bar.dur / 4);
  els.metroBeats.style.setProperty('--fade', `${Math.round(fade * 1000)}ms`);
  showMetroBeat(((k % bar.beats) + bar.beats) % bar.beats, `${bar.from}:${k}`, (1 - into) * bar.dur < fade + Math.min(METRO_OFF, bar.dur / 5));
}
// (each beat known by its bar and count: the same dot lit again at the next)
function showMetroBeat(beat, which = String(beat), ending = false) {
  const dots = [...els.metroBeats.querySelectorAll('.metro-beat')];
  if (which !== metro.beat) {
    metro.beat = which;
    dots.forEach((dot, i) => { dot.classList.remove('on', 'ending'); if (i === beat) dot.classList.add('on'); });
  }
  if (dots[beat]) dots[beat].classList.toggle('ending', ending);
}
function renderMetronome() {
  if (!els.metronome) return;
  const { bpm, meter } = metro;
  els.metroBpm.textContent = bpm;
  els.metroMarking.textContent = tempoName(bpm);
  els.metroTempo.value = bpm;
  els.metroTempo.style.setProperty('--f', ((bpm - METRO_MIN) / (METRO_MAX - METRO_MIN)).toFixed(4));
  els.metroTempo.setAttribute('aria-valuetext', `${bpm} BPM, ${tempoName(bpm)}`);
  els.metroSlower.disabled = bpm <= METRO_MIN;
  els.metroFaster.disabled = bpm >= METRO_MAX;
  for (const b of els.metroMeters.children) {
    b.setAttribute('aria-pressed', String(b.dataset.meter === meter));
    b.title = b.dataset.meter === meter ? 'Tap again for none: every beat the same' : '';
  }
  /* The beats: drawn again for another time signature, or other groups (a
     group's first a little apart, a little bigger; with no time signature,
     its one dot full size, its click a tac all the same). The row a button,
     tapped, the next way of grouping them (none to choose: still) */
  const groups = meterGroups(meter);
  const drawn = `${meter}:${groups}`;
  if (els.metroBeats.dataset.drawn !== drawn) {
    els.metroBeats.dataset.drawn = drawn;
    els.metroBeats.innerHTML = meterLevels(meter).map((level, i) => `<span class="metro-cell${level === 1 ? ' group' : ''}"><span class="metro-beat${level === 0 || meter === null ? ' first' : ''}"></span></span>`).join('');
    metro.beat = null;
    fitMetroBeats();
  }
  const ways = groupings(meter);
  const said = meter === null ? 'Every beat the same' : groups.length > 1 ? `Grouped ${groups.join('+')}` : `${meterBeats(meter)} beats, no groups`;
  els.metroBeats.disabled = ways.length < 2;
  els.metroBeats.setAttribute('aria-label', ways.length < 2 ? said : `${said}: tap for another grouping`);
  els.metroBeats.title = ways.length < 2 ? '' : `${said} (tap for another grouping)`;
  const on = metroOn();
  els.metroOpen.classList.toggle('on', on);   // (still on once closed: its button outlined, a stop at its end)
  els.metroTool.classList.toggle('on', on);
  els.metroStop.hidden = !on;
  els.metroShown.textContent = bpm;   // (its tempo in place of its name while it plays)
  els.metroOpen.setAttribute('aria-label', on ? `Metronome, ${bpm} BPM` : 'Metronome');
  els.metroOpen.title = on ? `Metronome: on, ${bpm} BPM` : 'Metronome: keep time';
  els.metroGo.innerHTML = `${on ? STOP_ICON : PLAY_ICON}<span class="tx">${playStopLabel(on, 'Start')}</span>`;
  els.metroGo.setAttribute('aria-label', on ? 'Stop' : 'Start');
  els.metroGo.title = `${on ? 'Stop' : 'Start'} (Space)`;
}
/* The dots as big as the bar leaves room for: as set, else .smaller, else
   .smallest; room: a dot lit (its border, 3px, 2 at the smallest) clear of
   the next by METRO_CLEAR at least. Once seen (its popup open: a hidden one
   measures nothing), drawn again, or the window resized; as laid out (the
   popup still growing in, a dot lit: no matter) */
const METRO_CLEAR = 2;
const METRO_SIZES = [['', 3], ['smaller', 3], ['smallest', 2]];
function fitMetroBeats() {
  const row = els.metroBeats;
  if (!els.metronome.open) return;
  // (each cell's middle, as drawn, in the popup's own scale: it grows in, from 98%; the cells stay put, whatever their dots' size)
  const scale = row.getBoundingClientRect().width / row.offsetWidth || 1;
  const cells = [...row.querySelectorAll('.metro-cell')];
  const at = cells.map((cell) => { const b = cell.getBoundingClientRect(); return (b.left + b.right) / 2 / scale; });
  for (const [size, border] of METRO_SIZES) {
    row.classList.remove('smaller', 'smallest');
    if (size) row.classList.add(size);
    const r = cells.map((cell) => cell.firstElementChild.offsetWidth / 2);   // (its dot's size as set, lit or not)
    if (size === 'smallest' || !at.some((x, i) => i > 0 && x - at[i - 1] - (r[i - 1] + r[i] + border) < METRO_CLEAR)) return;
  }
}
function openMetronome() {
  if (els.metronome.open) return;
  loadMetronome();
  if (!els.metroMeters.children.length) {
    els.metroMeters.innerHTML = METERS.map(({ name }) => {
      const [top, bottom] = name.split('/');
      return `<button type="button" class="metro-meter" data-meter="${name}" aria-pressed="false" aria-label="${name}"><span aria-hidden="true">${top}</span><span aria-hidden="true">${bottom}</span></button>`;
    }).join('');
  }
  metro.taps = [];
  metro.beat = null;
  renderMetronome();
  if (els.metronome.showModal) els.metronome.showModal(); else els.metronome.setAttribute('open', '');
  fitMetroBeats();
  els.metroGo.focus({ preventScroll: true });   // (Space: start, stop)
  metroFrame();   // (on meanwhile: its beats shown again)
}
function closeMetronome() {
  if (els.metronome.open) { if (els.metronome.close) els.metronome.close(); else els.metronome.removeAttribute('open'); }
}
// − and +: a step a press, held, faster and faster; by the keyboard (Enter, Space), a step
// (the metronome's tempo, the reference pitch: `step()` takes one). Held
// on a phone: no long-press menu (as the strum button's), and no scroll
// starting from it, which would end the hold (see .hold-step)
function holdStep(btn, step) {
  btn.classList.add('hold-step');
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
  let timer = 0;
  const stop = () => { clearTimeout(timer); timer = 0; };
  const again = (wait) => { timer = setTimeout(() => { step(); if (btn.disabled) stop(); else again(wait > 100 ? 100 : Math.max(35, wait * 0.93)); }, wait); };
  btn.addEventListener('pointerdown', (e) => {
    if (e.button > 0 || btn.disabled) return;
    stop();
    step();
    again(400);
  });
  for (const type of ['pointerup', 'pointerleave', 'pointercancel']) btn.addEventListener(type, stop);
  btn.addEventListener('click', (e) => { if (e.detail === 0) step(); });
}
