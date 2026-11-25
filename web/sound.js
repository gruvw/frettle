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
    const ctx = new AC();
    audio = { ctx, out: soundChain(ctx) };
  }
  wakeAudio();
  return audio;
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
  volume.connect(ctx.destination);
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
  src.playbackRate.value = rate;
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
const FINE_PX = 5;          // the fine strip: px per cent
const hzMidi = (hz) => 69 + 12 * Math.log2(hz / 440);
const midiHz = (m) => 440 * 2 ** ((m - 69) / 12);

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
function detectPitch(x, rate, minHz = 25, maxHz = 4200) {
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
const TUNER_TAIL = 0.0007;   // ... it is followed down to, fading (about -63 dBFS)
const TUNER_STEADY = 3;      // readings in a row, close together, before a note shows
/* A pitch heard in these samples, as a midi number with its fraction, or
   null. A note starts as a string does, with an attack: well above the
   room's own level (learnt between notes, quickly down, slowly up; a hum,
   a fan, a fridge, steady, are learnt too, so never taken for a note, even
   with a pitch of their own); once it has, it is followed as it fades,
   down to just above that level. A sound that has not faded to half after
   TUNER_STEADY_MS is no string (a fridge starting): the room's level, from
   then on. */
const TUNER_STEADY_MS = 8000;
const TUNER_WARM_MS = 300;   // as the microphone starts: the room only listened to (its first samples can be silence)
function hearPitch(x, rate, minHz, maxHz) {
  let sq = 0;
  for (let i = 0; i < x.length; i++) sq += x[i] * x[i];
  const level = Math.sqrt(sq / x.length);
  const now = performance.now();
  if (now < tuner.warmUntil) { tuner.floor = tuner.floor === null || !tuner.floor ? level : tuner.floor + (level - tuner.floor) * 0.2; return null; }
  if (tuner.floor === null) tuner.floor = level;
  // (an attack: twice as loud as at any time in the last 100 ms)
  tuner.levels = [...(tuner.levels || []).slice(-5), level];
  tuner.attack = level > 2 * Math.min(...tuner.levels.slice(0, -1), Infinity);
  const following = tuner.pitch !== null;
  const gate = following ? Math.max(TUNER_TAIL, tuner.floor * 1.5) : Math.max(TUNER_START, tuner.floor * 3);
  const found = level >= gate ? detectPitch(x, rate, minHz, maxHz) : null;
  // (between notes: down at once; up slowly, on what has no pitch and is
  // not well above it, an attack never; under a note, not at all)
  if (!following) {
    if (level < tuner.floor) tuner.floor = level;
    else if (!found && level < tuner.floor * 3) tuner.floor += (level - tuner.floor) * 0.02;
    Object.assign(tuner, { noteLevel: level, noteAt: now });   // (where the next note starts)
  } else if (now - tuner.noteAt > TUNER_STEADY_MS && level > tuner.noteLevel / 2) {
    tuner.floor = level;   // (never fading: no string)
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
  tuner.strings = inst.strings.slice();
  // (always as it first was: the strings shown, none picked, on middle C)
  Object.assign(tuner, { target: null, folded: false, mutedUntil: 0, pitch: null, recent: [], odd: 0, shown: TUNER_REST, fineNote: null, drawn: '', floor: null });
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
function tunerClosed() {   // (the popup gone, however: the microphone off)
  stopMic();
  cancelAnimationFrame(tuner.raf);
  tuner.status = 'off';
}
function measureTuner() {
  const cell = els.tunerTape.firstElementChild;
  tuner.cell = cell ? cell.offsetWidth : 48;
  tuner.width = els.tunerStrip.clientWidth;
  tuner.fineWidth = els.tunerFine.clientWidth;
  tuner.drawn = '';
}
/* The microphone, asked for (the browser asks the first time). Refused: for
   good (the site blocked: only the browser's settings can change that) or
   for now (the question dismissed: it can be asked again). Its sound kept
   raw: the processing meant for calls (echo, noise, level) would blur the
   pitch. */
async function startMic() {
  const token = ++tuner.token;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { setTunerStatus('unsupported'); return; }
  const a = audioOut();   // (started in the tap, while the browser allows it)
  setTunerStatus('asking');
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
  } catch (err) {
    if (token !== tuner.token) return;
    if (err && (err.name === 'NotFoundError' || err.name === 'OverconstrainedError')) setTunerStatus('nomic');
    else if (err && (err.name === 'NotAllowedError' || err.name === 'SecurityError')) setTunerStatus(await micBlocked() ? 'blocked' : 'dismissed');
    else setTunerStatus(err && err.name === 'NotSupportedError' ? 'unsupported' : 'error');
    return;
  }
  if (token !== tuner.token || !els.tuner.open || !a) { stream.getTracks().forEach((t) => t.stop()); if (!a && token === tuner.token) setTunerStatus('unsupported'); return; }
  wakeAudio();
  tuner.stream = stream;
  tuner.source = a.ctx.createMediaStreamSource(stream);
  tuner.analyser = a.ctx.createAnalyser();
  tuner.analyser.fftSize = a.ctx.sampleRate > 50000 ? 8192 : 4096;
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
  }
  /* A note shows once steady: TUNER_STEADY readings in a row close
     together (a click, a word, a stray reading moves nothing); one far from
     them starts a new note, which shows once steady too. Gone quiet, the
     strips stay where the last note was, dimmed (the next note likely near
     it): on middle C only before any */
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
  if (heard !== null) {
    const med = tuner.recent.length ? median(tuner.recent) : heard;
    if (Math.abs(heard - med) > 0.6) {
      tuner.odd++;
      if (tuner.odd >= TUNER_STEADY || tuner.pitch === null) { tuner.recent = [heard]; tuner.odd = 0; }
    } else {
      tuner.odd = 0;
      tuner.recent.push(heard);
      if (tuner.recent.length > 5) tuner.recent.shift();
    }
    if (tuner.odd === 0 && tuner.recent.length >= TUNER_STEADY) { tuner.pitch = median(tuner.recent); tuner.heardAt = now; }
  } else {
    if (tuner.pitch === null) tuner.recent = [];   // (not steady yet: no note)
    if (tuner.pitch !== null && now - tuner.heardAt > TUNER_HOLD) Object.assign(tuner, { pitch: null, recent: [], odd: 0 });
  }
  if (tuner.pitch !== null) {
    tuner.shown += (tuner.pitch - tuner.shown) * 0.35;
    if (Math.abs(tuner.pitch - tuner.shown) < 0.0005) tuner.shown = tuner.pitch;
  }
  drawTuner();
}
const median = (list) => { const s = [...list].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
// The strips where they are now, the note heard, the hint
function drawTuner() {
  if (!els.tuner.open || els.tunerView.hidden) return;
  const folded = tunerFolded();
  const { pitch, shown } = tuner;
  const near = pitch === null ? null : Math.round(pitch);
  const cents = pitch === null ? 0 : (pitch - near) * 100;
  const onString = near !== null && (folded || tuner.strings.includes(near));
  const ok = onString && Math.abs(cents) <= IN_TUNE;
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
  tuner.mutedUntil = performance.now() + pluckSeconds(tuner.strings[s]) * 950;
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
