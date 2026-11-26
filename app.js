'use strict';

/* ==========================================================================
   Frettle's script, part 4 of 4 (see music.js): Name a chord, the page
   drawn, its events, the start.

   A rule for touch screens: a swipe to scroll must never set anything off.
   Plain actions listen for 'click' (the browser already leaves out swipes,
   and taps that only stop a scroll still gliding). Anything that acts on
   press (a sound, mostly) goes through onPress, or the neck's own handler
   (setupNeckTaps): never a bare 'pointerdown' listener, which fires as soon
   as a finger lands, swipe or not. The few 'pointerdown' listeners left
   only watch (the chord list's drag and its × and +, the sheet's drag,
   starting the audio, the keyboard focus, keeping the screen on, the
   install card's count).
   ========================================================================== */

/* ==========================================================================
   Name a chord: notes placed on the neck are named. While it is on, a tap
   on the neck places that string's note there (the same fret again lifts
   it; the open string rings or is muted; a banjo's drone can be fretted
   here, though the shape finder never frets it) and nothing
   else changes; what cannot be used meanwhile is hidden (the chord list, the
   shape bar, the tabs and panels, the instrument, tuning and capo, Share).
   It starts from the shape on screen, or from nothing. Placing a note sounds
   it and lights it up (lifting or muting one does not), unless taps are
   muted (a setting); Play strums them all.
   The notes get a name for each of them that can be the root, the most
   likely first: the arrows step through them, changing only the name (and
   the intervals marked on the notes), never the notes. A root picked with
   the arrows stays picked as notes come and go (its name, wherever it
   falls among the others), until that note itself goes: then the most
   likely name again.
   Two ways out, both back to the neck as usual: Select puts the chord named
   on the neck with this very shape (kept as a custom shape when the shape
   finder does not list it), in the inversion of its bass note; Cancel (or
   Escape) leaves everything as it was, the chord on screen or none.
   The naming works on the notes, not the frets (see nameChord).
   ========================================================================== */
let naming = null;   // { frets: per string, -1 muted; pick: the name picked (0: the most likely); root: the root picked with the arrows, or null; letter: its root's other name, picked (Alternative root), or null; letterRoot: the root, a pitch class, that letter names; letterAt: the naming shift it was picked under (see letterOf) }
// The names of the notes placed, one per root, the most likely first
function namerReadings() {
  const sc = currentScale();
  return nameChord(shapeMidis(naming.frets), sc && sc.def.steps.length < 12 ? sc.set : null);
}
const ORDINALS = { 5: '5th', 9: '9th' };
const readingSymbol = (r) => chordName(r.root, r.def, r.bassIndex, namerLetter(r));
// (the root's other name, picked for the name picked: its letter, or null)
const namerLetter = (r) => (naming && r && naming.letter !== null && naming.letterRoot === mod12(r.root) && naming.letterAt === nameShift() ? naming.letter : null);
// (a name with another root picked: the root's usual name again)
function namerSettle() {
  const r = namerReadings()[naming.pick];
  if (!r || naming.letterRoot !== mod12(r.root)) naming.letter = null;
}
// The notes placed, drawn on the neck like a chord's shape: with the
// intervals of the name picked (none: no name yet)
function namerChord() {
  const r = namerReadings()[naming.pick];
  const tones = r ? chordTones(r.root, r.def) : [];
  return { naming: true, shape: { frets: naming.frets }, degOfPc: new Map(tones.map((t) => [t.pc, t.deg])), interval: r && r.def.span ? r.def : null,
    spell: r ? chordSpelling(r.root, r.def, namerLetter(r)) : { names: new Map() } };
}
function openNamer() {
  if (naming) return;
  const ch = currentChord();
  naming = { frets: ch && ch.shape ? ch.shape.frets.slice() : instrument().strings.map(() => -1), pick: 0, root: null, letter: null, letterRoot: null, letterAt: 0 };
  // Its notes named as the chord on screen is, as if its root were picked
  // with the arrows (D♭maj7sus4(♭9)/E𝄫 stays that, not the likeliest name
  // for those notes): its type with its bass, else its type, else its root
  // (its root's other name too, if picked so)
  if (ch && ch.shape) {
    const readings = namerReadings();
    const same = (r) => mod12(r.root) === mod12(ch.root);
    const at = [(r) => same(r) && r.def.id === ch.def.id && r.bassIndex === ch.bassIndex, (r) => same(r) && r.def.id === ch.def.id, same]
      .map((test) => readings.findIndex(test)).find((i) => i >= 0);
    if (at !== undefined) {
      Object.assign(naming, { pick: at, root: readings[at].root });
      if (letterOf(state.chord) !== null) Object.assign(naming, { letter: letterOf(state.chord), letterRoot: mod12(ch.root), letterAt: nameShift() });
    }
  }
  stopGroup();
  stopScale();
  stopArpeggio();
  ui.tab = null;   // (phones: the sheet closes)
  document.body.classList.add('naming');
  render();
  fitNamer();   // (its room, as it shows)
  // The neck in view, to place the notes: opened from the chord panel, under
  // it, the page shorter now (that panel hidden), the neck can be above the
  // window; mostly out of view, it comes back, as when the layout changes
  const box = els.neck.closest('.neck-scroll').getBoundingClientRect();
  if (Math.min(box.bottom, window.innerHeight) - Math.max(box.top, 0) < Math.min(box.height, window.innerHeight) * 0.6) refocus();
  els.namer.focus({ preventScroll: true });   // the keyboard carries on in the bar (its button is hidden now)
}
function closeNamer(select) {
  if (!naming) return;
  const reading = select ? namerReadings()[naming.pick] : null;
  if (select && !reading) return;
  const letter = namerLetter(reading);   // (its root's other name, if picked: the chord's, see keepLetter)
  const text = fretsText(naming.frets);
  const focused = els.namer.contains(document.activeElement);
  if (!reading && naming.scaleMoved) ui.revealGroup = true;   // (cancelled: a scale picked meanwhile shows its group, see draw)
  naming = null;
  document.body.classList.remove('naming');
  if (reading) {
    const { root, def } = reading;
    if (!state.chord.on || state.chord.type !== def.id) resetInversion();   // as a chord picked from the menus
    state.chord = { on: true, root, type: def.id, ...letterPair(letter) };
    state.loose = false;
    // Its bass note's inversion ("Any bass note" stays so)
    if (state.inversion[state.instrument] !== 'any') state.inversion[state.instrument] = String(reading.bassIndex);
    if (!chordShapes(root, def, inversionFor(def)).some((x) => fretsText(x.frets) === text)) keepDrawn(root, def.id, text);
    const at = currentChord().shapes.findIndex((x) => fretsText(x.frets) === text);
    state.shape = at < 0 ? null : at;
    menuPick = 'other';   // a new chip for it, or its chip first, remembering this shape (trackChord)
    ui.reveal = true;
  }
  render();
  // The keyboard goes back to where it came from (the bar is hidden now):
  // the mode's button, or on phones, where it sits in the closed sheet, the Chord tab
  if (focused) (isWide() ? els.namerOpen : document.querySelector('.tab[data-tab="chord"]')).focus({ preventScroll: true });
}
// A tap on the neck while naming
function namerTap(cell) {
  const inst = instrument();
  if (cell.dataset.key !== undefined) {   // a piano key: in, or out again
    const k = Number(cell.dataset.key);
    const on = !naming.frets.includes(k);
    naming.frets = on ? [...naming.frets, k].sort((a, b) => a - b) : naming.frets.filter((x) => x !== k);
    namerRepick();
    const sound = on && !state.muteTaps;
    if (sound) playNote(inst.low + k);
    render();
    if (sound) flashKey(k);
    return;
  }
  const s = Number(cell.dataset.s);
  const f = Number(cell.dataset.f);
  const frets = naming.frets;
  let placed;
  if (f === startFret(inst, s) + capo()) placed = frets[s] = frets[s] === 0 ? -1 : 0;   // open: rings, or is muted
  else placed = frets[s] = frets[s] === f - capo() ? -1 : f - capo();
  namerRepick();
  const sound = placed >= 0 && !state.muteTaps;
  if (sound) playNote(fretPitch(inst, s, f));
  render();
  if (sound) flashCell(s, f);
}
/* The notes placed moved together, one fret along the neck (the piano: one
   key): -1 toward the nut, +1 toward the body, the same shape a semitone
   lower or higher. Not past an open string or the neck's last fret, nor
   the keyboard's ends: null, no move. Its buttons (namerUpStep): as drawn
   on screen where it runs top to bottom (phones: a neck from its nut, the
   piano from its lowest key), up toward the top; on a piano drawn across
   (wide screens), up a key higher and down a key lower, by ear. On a neck
   across, as on phones: up toward the nut, down toward the body. */
const pianoAcross = () => instrument().piano && !els.neck.classList.contains('vertical');
const namerUpStep = () => (pianoAcross() ? 1 : -1);
function namerMoved(step) {
  const inst = instrument();
  if (inst.piano) {
    const keys = naming.frets.map((k) => k + step);
    return keys.length && keys.every((k) => k >= 0 && k < inst.keys) ? keys : null;
  }
  if (!naming.frets.some((f) => f >= 0)) return null;
  const top = cappedInstrument().frets;
  const moved = naming.frets.map((f, s) => {
    if (f < 0) return f;   // (muted: stays so)
    const open = startFret(inst, s);   // (a banjo's short string: its fret 5 is its open string)
    if (step < 0) return f === 0 ? NaN : f - 1 === open ? 0 : f - 1;
    return f === 0 ? open + 1 : f + 1;
  });
  return moved.every((f) => Number.isFinite(f) && f <= top) ? moved : null;
}
function namerMove(step) {
  const moved = namerMoved(step);
  if (!moved) return;
  naming.frets = moved;
  if (naming.root !== null) naming.root = mod12(naming.root + step);   // (the root picked with the arrows, moved with them)
  namerRepick();
  render();
  if (!focusInView()) revealFocus();   // the neck follows the notes past the edge of the view
}
function namerStep(step) {
  const readings = namerReadings();
  const n = readings.length;
  if (n < 2) return;
  naming.pick = (naming.pick + step + n) % n;
  naming.root = readings[naming.pick].root;
  namerSettle();
  render();
}
// The notes changed: the name of the root picked with the arrows while that
// note is still placed (null: none picked, or it is gone), else the most likely
function namerRepick() {
  if (naming.root !== null && !shapeMidis(naming.frets).some((m) => mod12(m) === naming.root)) naming.root = null;
  naming.pick = Math.max(0, namerReadings().findIndex((r) => r.root === naming.root));
  namerSettle();
}
/* Before a draw: the notes placed as they now sound. Past the end of the
   neck (a capo moved up), lifted; sounding otherwise (another tuning, a
   capo), named again as when they change, the name picked kept to one
   there is (see namerRepick): the neck and the bar show the same name. */
function namerHeard() {
  if (!instrument().piano) {
    const top = cappedInstrument().frets;
    naming.frets = naming.frets.map((f) => (f > top ? -1 : f));
  }
  const heard = shapeMidis(naming.frets).join(' ');
  if (naming.heard !== undefined && naming.heard !== heard) namerRepick();
  naming.heard = heard;
  naming.pick = Math.min(naming.pick, Math.max(0, namerReadings().length - 1));
}
function namerClear() {
  naming.frets = instrument().piano ? [] : naming.frets.map(() => -1);
  naming.root = null;
  naming.pick = 0;
  naming.letter = null;
  render();
}
function namerPlay() {
  if (naming.frets.some((f) => f >= 0)) strumFrets(naming.frets);
}
function renderNamer() {
  const readings = namerReadings();
  naming.pick = Math.min(naming.pick, Math.max(0, readings.length - 1));
  const r = readings[naming.pick] || null;
  const notes = shapeMidis(naming.frets);
  els.namerSelect.disabled = !r;
  els.namerPlay.disabled = els.namerClear.disabled = !notes.length;
  showStrum(els.namerPlay, 'Play the notes', 'Play', `Play the notes (Space), ${HOLD_HINT}`);
  els.namerPrev.disabled = els.namerNext.disabled = readings.length < 2;
  els.namerMute.setAttribute('aria-pressed', String(Boolean(state.muteTaps)));
  // The moves: off where the notes cannot go further (or there are none)
  const what = instrument().piano ? 'key' : 'fret';
  els.namerUp.disabled = !namerMoved(namerUpStep());
  els.namerDown.disabled = !namerMoved(-namerUpStep());
  const piano = instrument().piano;
  for (const [el, words] of [[els.namerUp, !piano ? 'toward the nut' : pianoAcross() ? 'higher' : 'lower'], [els.namerDown, !piano ? 'toward the body' : pianoAcross() ? 'lower' : 'higher']]) {
    const text = `Move the notes one ${what} ${words}`;
    el.title = text;
    el.setAttribute('aria-label', text);
  }
  // Alternative root, as the chord panel's: off with no name yet, for D, G
  // and A (one name), and for a root the scale shown names
  const free = r && !scaleRootName(r.root) && otherRoot(r.root, ownChordSpelling(r.root, r.def).root);
  els.namerAlt.disabled = !free;
  els.namerAlt.setAttribute('aria-pressed', String(Boolean(free && namerLetter(r) !== null)));
  /* What the name (its symbol, the bass after a slash: "C/E") means in
     words ("C major, 1st inversion", as the chord panel says it; some run
     long): on phones on its own line above, the whole width; on wide
     screens under its number, beside the name. Phones, beside the name:
     its number ("Name 1/3", with more than one) over the shape's frets
     ("x32010", the keys on a piano), as the shape stepper's (wide screens
     have the neck right there), fitted as the steppers' (fitInfo). */
  const wide = isWide();
  let caption = '';
  if (r) {
    const spell = chordSpelling(r.root, r.def, namerLetter(r));
    const missing = r.missing.length ? `, no ${r.missing.map((d) => ORDINALS[d]).join(' or ')}` : '';
    const inverted = r.bassIndex ? `, ${INVERSION_NAMES[r.bassIndex].toLowerCase()}` : '';
    const meaning = `${noteText(spell.root)} ${r.def.name.toLowerCase()}${inverted}${missing}`;
    const count = readings.length > 1 ? `Name ${naming.pick + 1}/${readings.length}` : '';
    els.namerSymbol.innerHTML = tx(readingSymbol(r));
    els.namerSymbol.title = readingSymbol(r);
    const frets = shapeShort({ piano: Boolean(instrument().piano), frets: naming.frets }, spell);   // (spelled as the name: B♭ D F)
    const main = wide ? meaning : frets;
    const counts = readings.length > 1 ? fitsAttr([count, `${naming.pick + 1}/${readings.length}`]) : '';
    els.namerText.innerHTML = (count ? `<span class="dock-count" ${counts}>${esc(count)}</span>` : '')
      + `<span class="dock-main namer-main${wide || instrument().piano ? '' : ' mono'}" title="${esc(wide ? meaning : `Shape: ${frets}`)}">${esc(main)}</span>`;
    caption = wide ? '' : meaning;
  } else {
    els.namerSymbol.innerHTML = '';
    els.namerSymbol.title = '';
    const msg = notes.length ? 'Add a different note' : `Tap the ${instrument().piano ? 'keys' : 'neck'} to place notes`;
    els.namerText.innerHTML = `<span class="dock-msg">${msg}</span>`;
  }
  els.namerCaption.textContent = caption;
  els.namerCaption.title = caption;
  if (!wide) fitText(els.namerCaption, 11);
  fitInfo(els.namerSymbol.parentElement);
}

/* Play the group shown, string after string as it runs (low to high; a
   re-entrant tuning's high string first, as its place in the group:
   the ukulele's g, C, E, A), lighting each note on the neck. As
   the scale's Play: pressing again (or Space) while it plays stops it, its
   button a Stop meanwhile; picking another group, scale... stops it too. */
let groupRun = null;     // { sources, timers }
function playGroup() {
  const g = ui.groups[ui.group];
  const sc = currentScale();
  if (groupRun) { stopGroup(); return; }
  if (!g || !sc) return;
  stopScale();
  stopArpeggio();
  const inst = instrument();
  const notes = [];
  if (g.keys) {   // a keyboard's: its keys in the scale, low to high
    for (let k = g.keys[0]; k <= g.keys[1]; k++) if (sc.set.has(mod12(inst.low + k))) notes.push({ k, midi: inst.low + k });
  } else {
    for (const { s, a, b } of g.bars) {   // (its strings in group order)
      for (let f = a; f <= b; f++) if (sc.set.has(mod12(fretPitch(inst, s, f)))) notes.push({ s, f, midi: fretPitch(inst, s, f) });
    }
  }
  groupRun = { key: groupKey(g, sc), sources: [], timers: [] };
  notes.forEach((x, i) => {
    groupRun.sources.push(playNote(x.midi, i * NOTE_GAP, 0.5));
    groupRun.timers.push(setTimeout(() => (g.keys ? flashKey(x.k) : flashCell(x.s, x.f)), i * NOTE_GAP * 1000));
  });
  // Done once the last note has started: it rings on, and Play is back
  groupRun.timers.push(setTimeout(() => { groupRun = null; renderGroupPlay(); }, (notes.length - 1) * NOTE_GAP * 1000 + 50));
  renderGroupPlay();
}
// The group as played: another scale, tuning, capo or group stops it (see draw)
const groupKey = (g, sc) => (g && sc ? [scaleKey(sc), g.keys ? `keys:${g.keys.join('-')}` : g.bars.map((b) => `${b.s}:${b.a}-${b.b}`)].join('|') : '');
function stopGroup() {
  if (!groupRun) return;
  for (const src of groupRun.sources) { try { if (src) src.stop(); } catch { /* already over */ } }
  for (const t of groupRun.timers) clearTimeout(t);
  groupRun = null;
  renderGroupPlay();
}
// A group stepper's play button: Play, or Stop while the group plays
function showGroupPlay(bar) {
  const playing = Boolean(groupRun);
  bar.play.querySelector('.ico').outerHTML = playing ? STOP_ICON : PLAY_ICON;
  bar.play.querySelector('.strum-label').innerHTML = playStopLabel(playing);
  bar.play.setAttribute('aria-label', playing ? 'Stop the group' : 'Play the group');
  bar.play.title = bar.play.getAttribute('aria-label') + (keysOnGroups() ? ' (Space)' : '');
}
function renderGroupPlay() {
  if (!els.quickGroupBar.hidden) showGroupPlay(groupStepper());
  if (ui.dockMode === 'group' && !els.dockShapeBar.hidden) showGroupPlay(dockStepper());
}

/* Play the scale once, low to high (root to octave), from its lowest root
   you can play (above the capo), lighting each note in the Notes row. The
   last note rings out. Pressing again stops it; so does picking another
   scale. A note of the row can also be tapped to hear it. */
let scaleRun = null;     // { key, sources, timers }
function scalePitches(sc) {   // the Notes row's pitches, root to octave
  const low = instrument().piano ? 60 : Math.min(...instrument().strings) + capo();   // (the piano: from middle C up)
  const start = low + mod12(sc.root - low);
  return [...sc.def.steps.map((step) => start + step), start + 12];
}
function pingScaleNote(i) {
  ping(els.scaleNotes.querySelectorAll('.scale-note')[i]);
}
/* Play: the row follows the note sounding, in its middle (a row wider than
   the panel: the chromatic scale on a phone). Scrolled before the note
   lights up, no further than the row goes: its glow widens the row for a
   moment, which would let it scroll past its end and back. */
function followScaleNote(i) {
  const row = els.scaleNotes;
  const note = row.querySelectorAll('.scale-note')[i];
  if (!note || row.scrollWidth <= row.clientWidth) return;
  const [at, room] = [note.getBoundingClientRect(), row.getBoundingClientRect()];
  const left = row.scrollLeft + at.left + at.width / 2 - (room.left + room.width / 2);
  row.scrollTo({ left: Math.max(0, Math.min(left, row.scrollWidth - row.clientWidth)), behavior: 'smooth' });
}
function playScale() {
  if (scaleRun) { stopScale(); return; }
  const sc = currentScale();
  if (!sc) return;
  stopGroup();
  stopArpeggio();
  const pitches = scalePitches(sc);
  scaleRun = { key: scaleKey(sc), sources: [], timers: [] };
  pitches.forEach((midi, i) => {
    scaleRun.sources.push(playNote(midi, i * NOTE_GAP, 0.5));
    scaleRun.timers.push(setTimeout(() => { followScaleNote(i); pingScaleNote(i); }, i * NOTE_GAP * 1000));
  });
  // Done once the last note has started: it rings on, and Play is back
  scaleRun.timers.push(setTimeout(() => { scaleRun = null; renderPlayButton(); }, (pitches.length - 1) * NOTE_GAP * 1000 + 50));
  renderPlayButton();
}
function stopScale() {
  if (!scaleRun) return;
  for (const src of scaleRun.sources) { try { if (src) src.stop(); } catch { /* already over */ } }
  for (const t of scaleRun.timers) clearTimeout(t);
  scaleRun = null;
  els.scaleNotes.scrollTo({ left: els.scaleNotes.scrollLeft });   // (the row stops where it is)
  renderPlayButton();
}
// A note tapped: it alone (a scale playing stops, the row where it is)
function playScaleNote(i) {
  const sc = currentScale();
  if (!sc) return;
  stopScale();
  playNote(scalePitches(sc)[i]);
  pingScaleNote(i);
}
const scaleKey = (sc) => (sc ? [sc.root, sc.def.id, instrument().strings, capo()].join('|') : '');
const PLAY_ICON = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M8 5.2v13.6a.8.8 0 0 0 1.2.7l10.8-6.8a.8.8 0 0 0 0-1.4L9.2 4.5A.8.8 0 0 0 8 5.2z"/></svg>';
const STOP_ICON = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';
// A Play / Stop label: both words, one over the other, the other one unseen,
// so the button keeps one width either way (styles.css: .swap)
const playStopLabel = (playing, word = 'Play') => `<span class="swap"><span${playing ? ' class="off"' : ''}>${word}</span><span${playing ? '' : ' class="off"'}>Stop</span></span>`;
/* The strum buttons (the chord panel's, the chord stepper's, Name a
   chord's): Strum (Play: a keyboard's chord, the notes placed), or Stop
   while the chord is arpeggiated (see arpeggiate) */
const HOLD_HINT = 'hold for one note at a time';
function showStrum(btn, label, word, title) {
  const playing = Boolean(arpRun);
  btn.querySelector('.ico').outerHTML = playing ? STOP_ICON : PLAY_ICON;
  btn.querySelector('.strum-label, .tx').innerHTML = playStopLabel(playing, word);
  btn.setAttribute('aria-label', playing ? 'Stop' : label);
  btn.title = playing ? 'Stop' : title;
}
function renderStrumButtons() {
  const piano = Boolean(instrument().piano);
  const space = keysOnGroups(currentChord()) ? '' : ' (Space)';   // (Space playing the group instead)
  showStrum(els.chordStrum, piano ? 'Play the chord' : 'Strum the shape', piano ? 'Play' : 'Strum', `${piano ? 'Play the chord' : 'Strum the shape'}${space}, ${HOLD_HINT}`);
  if (ui.dockMode !== 'group' && !els.dockShapeBar.hidden) {
    const [label, word] = piano ? ['Play the chord', 'Play'] : ['Strum', 'Strum'];
    showStrum(els.dockStrum, label, word, `${label}${keysOnGroups(currentChord()) ? '' : ' (Space)'}, ${HOLD_HINT}`);
  }
  if (naming) showStrum(els.namerPlay, 'Play the notes', 'Play', `Play the notes (Space), ${HOLD_HINT}`);
}
function renderPlayButton() {
  const playing = Boolean(scaleRun);
  els.scalePlay.innerHTML = `${playing ? STOP_ICON : PLAY_ICON}<span class="btn-label">${playStopLabel(playing)}</span>`;
  els.scalePlay.setAttribute('aria-label', playing ? 'Stop the scale' : 'Play the scale');
  els.scalePlay.title = playing ? 'Stop' : 'Play the scale, low to high';
}

/* ==========================================================================
   5. Rendering
   Phones (narrow): vertical neck, controls in a dock with tabs that open a
   sheet. Wide screens: horizontal neck, panels below it. WIDE_QUERY must
   match the media query at the end of styles.css.
   ========================================================================== */
const WIDE_QUERY = '(min-width: 900px), (orientation: landscape) and (min-width: 640px)';
const wideMedia = typeof window !== 'undefined' ? window.matchMedia(WIDE_QUERY) : null;
const isWide = () => Boolean(wideMedia && wideMedia.matches);
const ui = { tab: null, shapeKey: null, groups: [], group: -1, groupAt: null, chordRoot: undefined };   // open dock tab (phones), last shape shown, scale groups
const els = {};
/* Text for a pill or circle, wrapped so its capital letters can be centred
   exactly (see .tx in styles.css) */
const tx = (s) => `<span class="tx">${esc(s)}</span>`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* A row redrawn from scratch drops the keyboard focus with its old buttons
   (the next Enter or Space would do nothing). The focus goes back to the
   same button of the new row, found by its data- attributes; when that one
   is gone or switched off (a string at the end of its range, a reset that
   is no longer needed), to the nearest button of the same item, after it
   first; else to the row's selected chip, or its first button. */
const FOCUS_ROWS = '#tuneList, #shapeList, #groupList, #recentList, #dockRecentList, #scaleTriads, #scaleNotes';
function keepFocus(redraw) {
  const el = document.activeElement;
  const row = el && el.closest ? el.closest(FOCUS_ROWS) : null;
  if (!row) { redraw(); return; }
  const key = [...el.attributes].filter((a) => a.name.startsWith('data-')).map((a) => `[${a.name}="${CSS.escape(a.value)}"]`).join('');
  const item = el.closest('li');
  const at = item ? [[...row.children].indexOf(item), [...item.children].indexOf(el)] : null;
  redraw();
  if (row.contains(document.activeElement)) return;   // not redrawn after all
  const usable = (b) => Boolean(b && b.matches('button:not(:disabled)'));
  let next = key ? row.querySelector(key) : null;
  if (!usable(next) && at && row.children[at[0]]) {
    const buttons = [...row.children[at[0]].children];
    next = buttons.slice(at[1]).find(usable) || buttons.slice(0, at[1]).reverse().find(usable);
  }
  if (!usable(next)) next = row.querySelector('button.selected:not(:disabled)') || row.querySelector('button:not(:disabled)');
  if (next) next.focus({ preventScroll: true });
}

function render() { keepFocus(draw); }
function draw() {
  // While no scale is shown, its root follows the chord's: picking a scale
  // type then gives the scale of the chord you are on (A minor pentatonic
  // over A, not C). A root picked for the scale itself stays until the
  // chord's root changes.
  if (!state.scale.on && state.chord.root !== ui.chordRoot) state.scale.root = state.chord.root;
  ui.chordRoot = state.chord.root;
  // A bass note the chord does not have (a 3rd inversion on a triad) goes
  // back to the instrument's default, as the Inversion menu says: kept as is,
  // the next 7th chord would come back in that old inversion (and links
  // would carry it)
  if (state.chord.on) state.inversion[state.instrument] = inversionFor(findChord(state.chord.type));
  if (naming) namerHeard();
  settleLetters();
  const ch = currentChord();
  const sc = currentScale();
  if (ch && ch.shapes.length) state.shape = ch.index;
  trackChord();
  renderHeader();
  renderRecent();
  renderNeck(naming ? namerChord() : ch, sc);
  warmUp(ch, sc);
  if (groupRun && groupRun.key !== groupKey(ui.groups[ui.group], sc)) stopGroup();   // what it was playing is gone
  if (arpRun && arpRun.key !== arpKey()) stopArpeggio();   // (the chord arpeggiated, the same)
  const seen = noteFocus(ch, sc);   // (what was last acted on: the phone's stepper, the keys and the neck's scroll follow it)
  renderChordPanel(ch, sc);
  renderScalePanel(sc, ch);
  fitSwitches();
  els.resetAll.disabled = Boolean(naming) || (!state.chord.on && !state.scale.on && !capo());
  renderDock(ch, sc);
  renderFolds(ch, sc);
  saveState();
  clearLink();
  // Scroll the neck to what was last acted on (phones: the page up or down;
  // wide screens: the neck sideways), see revealFocus: the chord when its
  // shape changes (picked, stepped, a chip, an inversion...), the scale
  // group when one is picked or the scale changes. Not while naming: the
  // neck stays where the notes are being placed (moved past the edge of
  // the view, it follows them: see namerMove); what changes meanwhile (a
  // scale picked) is seen then, not when the namer closes: Select shows
  // the notes selected, where they are (C7 E7 G7, not the C4 group);
  // Cancel, the scale's group, as it would have shown (see closeNamer)
  const { neckKey, chordKey, scaleKey, first, sameNeck } = seen;
  if (naming) {
    if (sameNeck && scaleKey && scaleKey !== ui.scaleKey) naming.scaleMoved = true;
    Object.assign(ui, { neckKey, chordKey, scaleKey, reveal: false, revealGroup: false });
    return;
  }
  // The piano, as it comes on screen (opened on it, or picked): its chord's
  // shape in view, or else middle C (a keyboard is long, and starts far down)
  const pianoNow = instrument().piano && ui.shownInst !== state.instrument;
  ui.shownInst = state.instrument;
  if (pianoNow) revealFocus(first ? 'auto' : 'smooth');
  // (opening the page: only when what it shows is out of view, as a high
  // shape from a link, so the page starts where it is otherwise)
  else if (first) requestAnimationFrame(() => { if (!focusInView()) revealFocus('auto'); });
  else if (ui.reveal || ui.revealGroup || !sameNeck || (chordKey && chordKey !== ui.chordKey) || (scaleKey && scaleKey !== ui.scaleKey)) revealFocus();
  ui.neckKey = neckKey;
  ui.chordKey = chordKey;
  ui.scaleKey = scaleKey;
  ui.reveal = false;
  ui.revealGroup = false;
}

/* What was last acted on (ui.focus): the chord when its shape changes
   (picked, stepped, a chip, an inversion...: ui.reveal, or its shape and
   name, on the same neck), the scale group when one is picked
   (ui.revealGroup) or the scale changes with its groups shown (Groups
   switched on too); opening a panel on phones too (openTab). */
function noteFocus(ch, sc) {
  const neckKey = [state.instrument, instrument().strings, capo()].join('|');
  // (the chord by its root and type, not its name: respelt by an
  // Alternative root, the same chord on the same keys, nothing acted on)
  const chordKey = ch && ch.shape ? [ch.root, ch.def.id, tabOf(ch.shape)].join('|') : null;
  const scaleKey = sc && ui.groups.length ? [sc.root, sc.def.id].join('|') : null;   // (with its groups shown)
  const first = ui.neckKey === undefined;
  const sameNeck = neckKey === ui.neckKey;
  if (!naming && (ui.reveal || (sameNeck && chordKey && chordKey !== ui.chordKey))) ui.focus = 'chord';
  // (naming too: a scale picked meanwhile is the last thing acted on, its
  // groups for the keys, though the neck stays put; see draw)
  if (ui.revealGroup || (sameNeck && scaleKey && scaleKey !== ui.scaleKey)) ui.focus = 'group';
  return { neckKey, chordKey, scaleKey, first, sameNeck };
}
/* What the arrow keys step and Space plays: what was last acted on (see
   noteFocus), the chord's shapes or the scale's groups (Groups on); the one
   there is when the other is not. As the phone's one stepper (renderDock). */
function keysOnGroups(ch = currentChord()) {
  if (!ui.groups.length) return false;
  return !ch || ui.focus === 'group';
}
/* What the neck scrolls to: what was last acted on (ui.focus), the chord's
   shape or the scale group, and only that one; when it is not on the neck,
   the other; on a piano with neither, middle C. Naming a chord: the notes
   placed, only (they are what is edited; none placed: nothing). */
function focusNotes() {
  const chord = [...els.neck.querySelectorAll('.cell:not(.strip-cell) .note.chord, .key .note.chord')];
  if (naming) return chord;
  const g = ui.groups[ui.group];
  const group = g ? groupNotes(g) : [];
  if (ui.focus === 'group' && group.length) return group;
  if (chord.length) return chord;
  if (group.length) return group;
  return instrument().piano ? [els.neck.querySelector(`.key[data-key="${60 - instrument().low}"]`)].filter(Boolean) : [];
}
function revealFocus(behavior = 'smooth') {
  const notes = focusNotes();
  if (notes.length) revealShape(notes, behavior);
}
// Whether it is all in the part of the neck you can see
function focusInView() {
  // (open strings: shown at the edge by the strip, wherever the neck is)
  const notes = focusNotes().filter((n) => { const cell = n.closest('.cell'); return !cell || Number(cell.dataset.f) > capo(); });
  if (!notes.length) return true;
  const rects = notes.map((n) => n.getBoundingClientRect());
  const strip = els.neck.querySelector('.neck-strip');
  if (isWide()) {
    const box = els.neck.closest('.neck-scroll').getBoundingClientRect();
    const lefty = state.leftHanded;
    const held = strip ? strip.offsetWidth : 0;
    return rects.every((r) => r.left >= box.left + (lefty ? 0 : held) - 1 && r.right <= box.right - (lefty ? held : 0) + 1);
  }
  const cover = (els.sheet.classList.contains('open') ? els.sheet : els.dockBar).getBoundingClientRect().top;
  return rects.every((r) => r.top >= (strip ? strip.offsetHeight : 0) - 1 && r.bottom <= cover + 1);
}

/* The phone turned (or the window resized past the layout's edge): the
   page starts over in its new layout, so what was last acted on is brought
   back into view (revealFocus), or else the neck. */
function refocus() {
  const panel = els.neck.closest('.neck-panel');
  const toPanel = () => window.scrollTo({ top: panel.getBoundingClientRect().top + window.scrollY - parseFloat(getComputedStyle(panel).marginTop), behavior: 'auto' });
  if (isWide()) toPanel();   // (the neck in view; then sideways, below)
  if (focusNotes().length) revealFocus('auto');
  else if (!isWide()) toPanel();
  placeStrip();   // (the open strings where the neck now sits, at once)
}

// A scale group's notes on the neck: each string's first and last (a
// keyboard's: its first and last key)
function groupNotes(g) {
  if (g.keys) return g.keys.map((k) => els.neck.querySelector(`.key[data-key="${k}"] .note`)).filter(Boolean);
  return g.bars.flatMap(({ s, a, b }) => [a, b].map((f) => els.neck.querySelector(`.cell[data-s="${s}"][data-f="${f}"]:not(.strip-cell) .note`))).filter(Boolean);
}

/* The chord list's chips, then (after a thin line) the recent chords',
   dashed, in the dock (phones), the quick bar (wide screens) and the chord
   panel. The chord on screen's chip is lit: a list chip has an × to take
   it out, a recent chip a + to put it in the list. */
const X_CHIP_ICON = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M7 7l10 10M17 7L7 17"/></svg>';
const TRAIL_EDGE = '<svg class="trail-edge" aria-hidden="true"><rect width="100%" height="100%" rx="15" ry="15"/></svg>';   // (rx: half of --recent-h)
const TRAIL_CHIP_EDGE = TRAIL_EDGE.replace(/r([xy])="15"/g, 'r$1="11"');   // (a popup's chip, 22px high)
const PLUS_CHIP_ICON = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
function renderRecent() {
  const show = state.list.length + state.recent.length > 0;   // (some recent chord is always shown when any is kept)
  els.dockRecent.hidden = !show;
  els.recentLine.hidden = !show;
  updateQuickBar();
  if (!show) { els.dockRecentList.innerHTML = els.recentList.innerHTML = ''; ui.chipKey = ''; return; }
  const full = state.list.length >= LIST_MAX;
  const shown = recentEntry();
  const sc = currentScale();
  const chip = (r, i, pinned) => {
    const def = findChord(r.type);
    const spell = chordSpelling(r.root, def, letterOf(r));
    const on = r === shown;
    const name = entrySymbol(r);
    const num = listNumeral(sc, r.root, def);   // (a chord of the scale on one of its triads: "ii")
    const cls = `${pinned ? 'pinned' : 'trail'}${on ? ' on' : ''}${!pinned && full ? ' bare' : ''}`;
    const tap = `<button type="button" class="chip recent${on ? ' selected' : ''}" ${pinned ? 'data-i' : 'data-r'}="${i}" aria-pressed="${on}" ` +
      `title="${esc(`${noteText(spell.root)} ${def.name.toLowerCase()}${r.bass ? `, ${INVERSION_NAMES[r.bass].toLowerCase()}` : ''}${num ? `, ${num} in ${sc.rootName} ${scaleTitle(sc.def)}` : ''}${pinned ? '' : ', recent'}`)}">` +
      `<span class="tx">${num ? `<span class="chip-num">${esc(num)}</span>` : ''}${esc(name)}</span></button>`;   // (one line of text: the numeral on the name's baseline)
    // A recent chip: its dashed edge (drawn, for dashes longer than a
    // browser's dashed line) and its + (none while the list is full)
    const side = pinned
      ? (on ? `<button type="button" class="recent-remove" data-remove="${i}" aria-label="Remove ${esc(name)} from the chord list" ` +
        `title="Remove ${esc(name)} from the chord list">${X_CHIP_ICON}</button>` : '')
      : (full ? '' : `<button type="button" class="recent-pin" data-pin="${i}" aria-label="Add ${esc(name)} to the chord list" ` +
        `title="Add ${esc(name)} to the chord list">${PLUS_CHIP_ICON}</button>`);
    return `<li class="${cls}">${pinned ? '' : TRAIL_EDGE}${tap}${side}</li>`;
  };
  const recent = shownRecent();
  const html = state.list.map((r, i) => chip(r, i, true)).join('')
    + (state.list.length && recent.length ? '<li class="recent-sep" aria-hidden="true"></li>' : '')
    + recent.map((r) => chip(r, state.recent.indexOf(r), false)).join('');
  els.dockRecentList.innerHTML = html;
  els.recentList.innerHTML = html;
  scrollHint(els.dockRecentList);
  scrollHint(els.recentList);
  fitDashes(els.dockRecentList);
  fitDashes(els.recentList);
  // When the chips change (one picked, added, edited or removed), scroll the
  // row so the selected one shows whole
  const chipKey = html;
  if (chipKey !== ui.chipKey && ui.keepRow) ui.chipKey = chipKey;   // a chip moved: the row stays where it is
  ui.keepRow = false;
  if (chipKey !== ui.chipKey) {
    const smooth = ui.chipKey !== undefined;
    ui.chipKey = chipKey;
    requestAnimationFrame(() => { chipInView(els.dockRecentList, smooth); chipInView(els.recentList, smooth); });
  }
}
/* A recent chip's dashes: about 6px with 4px gaps, stretched a little so a
   whole number of them goes round the edge (else the one where the edge
   closes comes out shorter). A row out of sight is fitted when it shows. */
function fitDashes(row, chips = 'li.trail') {
  for (const li of row.querySelectorAll(chips)) {
    const rect = li.querySelector('.trail-edge rect');
    let edge = 0;
    try { edge = li.offsetWidth ? rect.getTotalLength() : 0; } catch { edge = 0; }   // (none while out of sight)
    if (!edge) continue;
    const step = edge / Math.max(1, Math.round(edge / 10));
    li.style.setProperty('--dash', `${(step * 0.6).toFixed(3)} ${(step * 0.4).toFixed(3)}`);
  }
}
/* The thin bar under a row of recent chords: shown when the chips do not
   all fit, its thumb as long as the part in view and where it is */
function scrollHint(row) {
  const box = row.parentElement;
  if (!box.querySelector('.scroll-hint')) return;   // (the chord panel's list: the site's own scrollbar)
  const max = row.scrollWidth - row.clientWidth;
  const scrolls = max > 1;
  box.classList.toggle('scrolls', scrolls);
  if (!scrolls) return;
  const track = box.clientWidth;
  const thumb = Math.max(24, (track * row.clientWidth) / row.scrollWidth);
  box.style.setProperty('--thumb', `${thumb}px`);
  box.style.setProperty('--at', `${(track - thumb) * Math.min(1, Math.max(0, row.scrollLeft / max))}px`);
}
function chipInView(row, smooth) {   // scroll a row of chips sideways so the selected one is whole
  const chip = row.querySelector('li.on');
  if (!chip || !row.clientWidth) return;
  // Where the chip sits in the row's content, so a scroll still under way
  // (quick picks in a row) cannot throw the result off: scroll to a place,
  // not by an amount
  const pad = 8;
  const start = chip.getBoundingClientRect().left - row.getBoundingClientRect().left + row.scrollLeft;
  const end = start + chip.offsetWidth;
  const max = row.scrollWidth - row.clientWidth;
  let left = row.scrollLeft;
  if (start - pad < left) left = start - pad;
  else if (end + pad > left + row.clientWidth) left = end + pad - row.clientWidth;
  left = Math.round(Math.min(max, Math.max(0, left)));
  if (left !== Math.round(row.scrollLeft)) row.scrollTo({ left, behavior: smooth ? 'smooth' : 'auto' });
}

/* Phones: when the shape changes, scroll the page so the shape sits in the
   middle of the part of the neck you can see: from the top of the screen to
   the top of the dock (or of the open sheet), measured where they actually
   are. The page never scrolls past the top of the neck panel and the margin
   above it (with a capo, past the capo's fret), so the highest position
   still shows that edge. The same for a scale group (see revealFocus). */
function revealShape(notes = [...els.neck.querySelectorAll('.cell:not(.strip-cell) .note.chord, .key .note.chord')], behavior = 'smooth') {
  // (open strings: shown at the edge by the strip, wherever the neck is; the
  // fretted notes are what to bring into view, as focusInView counts them)
  const fretted = els.neck.querySelector('.neck-strip') ? notes.filter((n) => { const cell = n.closest('.cell'); return !cell || Number(cell.dataset.f) > capo(); }) : notes;
  if (fretted.length) notes = fretted;
  if (!notes.length) return;
  if (isWide()) { revealAcross(notes, behavior); return; }
  const rects = notes.map((n) => n.getBoundingClientRect());
  const top = Math.min(...rects.map((r) => r.top));
  const bottom = Math.max(...rects.map((r) => r.bottom));
  const cover = els.sheet.classList.contains('open') ? els.sheet : els.dockBar;
  const viewBottom = cover.getBoundingClientRect().top;
  // The view starts under the strip (held at the top once the nut is past)
  const strip = els.neck.querySelector('.neck-strip');
  const viewTop = strip ? strip.offsetHeight : 0;
  // Centre the shape; one too tall to fit starts at the top of the view
  const delta = bottom - top > viewBottom - viewTop - 24 ? top - viewTop - 24 : (top + bottom) / 2 - (viewTop + viewBottom) / 2;
  // Highest: the neck panel with its margin, or with a capo, its fret (the
  // frets behind it cannot be played) with more room, part of the fret
  // behind it showing and the interval badges clear of the edge
  const panel = els.neck.closest('.neck-panel');
  const capoCell = capo() ? els.neck.querySelector(`.cell[data-f="${capo()}"]`) : null;
  const margin = capoCell ? 20 : parseFloat(getComputedStyle(panel).marginTop);
  const edge = (capoCell || panel).getBoundingClientRect().top;
  window.scrollTo({ top: Math.max(edge + window.scrollY - margin, window.scrollY + delta), behavior });
}

/* Wide screens: the same rule sideways, when the neck is wider than its
   panel: the shape (or group) is centred in the part of the neck you can
   see, as far as the scroll goes; one too wide to fit starts at its end
   nearest the nut. With a capo, the neck never scrolls past the capo's
   fret (the frets behind it cannot be played). */
function revealAcross(notes, behavior = 'smooth') {
  const box = els.neck.closest('.neck-scroll');
  if (box.scrollWidth <= box.clientWidth + 1) return;
  const frame = box.getBoundingClientRect();
  const rects = notes.map((n) => n.getBoundingClientRect());
  const left = Math.min(...rects.map((r) => r.left));
  const right = Math.max(...rects.map((r) => r.right));
  const pad = 24;
  const lefty = box.classList.contains('lefty');   // the nut on the right
  // The view starts after the strip (held at the nut's end once it is past)
  const strip = els.neck.querySelector('.neck-strip');
  const held = strip ? strip.offsetWidth : 0;
  const view = { left: frame.left + (lefty ? 0 : held), right: frame.right - (lefty ? held : 0) };
  view.width = view.right - view.left;
  let delta = right - left > view.width - 2 * pad
    ? (lefty ? right - (view.right - pad) : left - (view.left + pad))
    : (left + right) / 2 - (view.left + view.right) / 2;
  const capoCell = capo() ? els.neck.querySelector(`.cell[data-f="${capo()}"]`) : null;
  if (capoCell) {   // the frets behind the capo stay out of view, as on phones (the capo's fret at the edge, with some room)
    const c = capoCell.getBoundingClientRect();
    delta = lefty ? Math.min(delta, c.right - (frame.right - 20)) : Math.max(delta, c.left - (frame.left + 20));
  }
  if (Math.abs(delta) > 1) box.scrollBy({ left: delta, behavior });
}

/* Neck settings live in the neck's header on wide screens and in the dock's
   "Setup" tab on phones; the instrument menu in the neck's header, or above
   the neck on phones. In index.html everything starts in its wide-screen
   place, which is right before this runs on both layouts: on phones those
   places are hidden or in the closed sheet (only the instrument menu shows
   on phones before that: its slot keeps its room, see .inst-slot). */
function placeSettings() {
  const wide = isWide();
  const slot = wide ? els.settingsWideSlot : els.settingsNarrowSlot;
  if (els.settings.parentElement !== slot) slot.appendChild(els.settings);
  // The instrument menu: the neck's title on wide screens, above the neck on phones
  const instSlot = wide ? els.instWideSlot : els.instNarrowSlot;
  if (els.instrumentPicker.parentElement !== instSlot) instSlot.appendChild(els.instrumentPicker);
  if (els.resetAll.parentElement !== instSlot) instSlot.appendChild(els.resetAll);   // (beside it: after it on wide screens, on the left on phones, see .reset-btn)
  // Chord and scale switches: at the end of the panel's title row on wide screens,
  // under the menus on phones (Name a chord and Groups there at the end of
  // the title row: each sheet's own extra, the others two side by side). Play the scale: before Deselect on wide
  // screens (as Strum is for chords), on the Notes line on phones.
  const put = (el, parent, before = null) => { if (el.parentElement !== parent || el.nextElementSibling !== before) parent.insertBefore(el, before); };
  // The phone dock's chord list and shape bar: in the quick bar under the
  // neck on wide screens, before the groups' bar (which only exists there)
  if (wide) {
    put(els.chordSwitches, els.chordHead);
    put(els.namerOpen, els.chordSwitches);
    put(els.scaleSwitches, els.scaleHead);
    put(els.tglScaleGroups, els.scaleSwitches);
    put(els.scalePlay, els.scaleBar, els.scaleClear);
    put(els.dockRecent, els.quickInner, els.quickGroupBar);
    put(els.dockShapeBar, els.quickInner, els.quickGroupBar);
    put(els.namer, els.neckPanel);   // Name a chord: in the quick bar's place
    arrange(els.settings, neckHeadOrder(els.neckHead.classList.contains('two')));   // (as fitNeckHead last had it)
  } else {
    put(els.chordSwitches, els.chordBar, els.chordStrum);
    put(els.namerOpen, els.chordHead);
    put(els.tglScaleGroups, els.scaleHead);
    for (const el of [els.namerOpen, els.tglScaleGroups]) el.classList.remove('whole');   // (out of the switches' grid, see fitSwitches)
    put(els.scaleSwitches, els.scaleBar, els.scaleClear);
    put(els.scalePlay, els.notesLine);
    put(els.dockRecent, els.dockBar, els.dockTabs);
    put(els.dockShapeBar, els.dockBar, els.dockTabs);
    put(els.namer, els.dockBar, els.dockTabs);
    // (the tuning menu, the capo's, then the tools: two tiles side by side under the capo, see .tool-btn)
    arrange(els.tuningRow, [els.tuningSelect]);
    arrange(els.settings, [els.tuningRow, els.capoSelect, els.metroTool, els.tunerOpen, els.tglOctaves, els.tglFlats]);
  }
}
/* `parent`'s children in this order, first (moving only those out of
   place: one with the focus keeps it); the header's line break, if not in
   it, taken out (others left after them, for their own place next) */
function arrange(parent, list) {
  list.forEach((el, i) => { if (parent.children[i] !== el) parent.insertBefore(el, parent.children[i] || null); });
  if (neckBreak && neckBreak.parentElement === parent && !list.includes(neckBreak)) neckBreak.remove();
}

/* Wide screens: the neck's header. On the left its title (the instrument
   menu, Reset), the tuning and the capo; on the right the switches, then the
   tools. On one line when it all fits; else two, balanced: the title and the
   tools, then under them the tuning, the capo and the switches (the tuning
   under the instrument; the tools above the switches, as on phones). Which, from what they measure (the system's font
   sets that), on resizing and as the title changes (the instrument, the
   reference pitch, the tuning's name); the capo menu as wide whatever it
   shows (fitPills). The tools sit in .tuning-row there (its pills'
   styles); the tuning menu, an item of its own. Too narrow still for two
   (a long title on a small screen): the lines wrap. */
const TUNING_CHARS = 22;   // (a tuning's name in the neck's header: past this, cut short)
// (at most n characters, the last of them "…" if cut)
const clipText = (text, n) => { const chars = [...text]; return chars.length <= n ? text : `${chars.slice(0, n - 1).join('').trimEnd()}…`; };
const HEAD_SPLIT = 16;   // (the least room between the left and the right: twice that between two items)
let neckBreak = null;
function neckHeadOrder(two) {
  if (!neckBreak) { neckBreak = document.createElement('span'); neckBreak.className = 'neck-break'; }
  const switches = [els.tglOctaves, els.tglFlats];
  return two ? [els.tuningRow, neckBreak, els.tuningSelect, els.capoSelect, ...switches]
    : [els.tuningSelect, els.capoSelect, ...switches, els.tuningRow];
}
function fitNeckHead() {
  if (els.settings.parentElement !== els.settingsWideSlot) return;   // (phones; or turning to wide, not moved yet: placeSettings, then render, call it again)
  arrange(els.tuningRow, [els.metroTool, els.tunerOpen]);
  fitPills();
  // (each as wide as it wants, none squeezed: see .neck-head in styles.css)
  for (const el of [els.instrumentPicker, els.tuningSelect]) el.style.maxWidth = '';
  const gap = parseFloat(getComputedStyle(els.neckHead).columnGap) || 0;
  const width = (list) => {
    const seen = list.filter((el) => el.getClientRects().length);   // (shown: a piano has no tuning, capo, tuner...)
    return seen.reduce((sum, el) => sum + el.getBoundingClientRect().width, 0) + gap * Math.max(0, seen.length - 1);
  };
  const room = els.neckHead.clientWidth;
  const title = width([els.instrumentPicker, els.resetAll]);
  const neck = width([els.tuningSelect, els.capoSelect]);
  const switches = width([els.tglOctaves, els.tglFlats]), tools = width([els.tuningRow]);
  const two = title + gap + neck + HEAD_SPLIT + switches + gap + tools > room;
  els.neckHead.classList.toggle('two', two);
  arrange(els.settings, neckHeadOrder(two));
  // Two lines, and one still too long (the longest instrument's name with a
  // reference pitch, a long saved tuning's, on a small screen): the name on
  // it cut short ("…"), never an item wrapped onto a line of its own
  if (!two) return;
  const cut = (el, over, least) => { if (over > 0) el.style.maxWidth = `${Math.max(least, el.getBoundingClientRect().width - over)}px`; };
  cut(els.instrumentPicker, title + HEAD_SPLIT + tools - room, HEAD_LEAST);
  cut(els.tuningSelect, neck + HEAD_SPLIT + switches - room, HEAD_LEAST);
}
const HEAD_LEAST = 96;   // (cut short, no narrower: a few letters still read)
/* The capo menu as wide as its widest choice ("Capo 12") */
let pillsFor = '';
function fitPills() {
  const id = state.instrument;
  const capos = ['No capo', `Capo ${maxCapo(id)}`];
  const key = [id, ...capos].join('|');
  if (key === pillsFor || !els.capoSelect.getClientRects().length) return;   // (a piano: none shown, none measured)
  pillsFor = key;
  for (const [el, labels] of [[els.capoSelect, capos]]) {
    const kept = el.textContent;
    el.style.setProperty('--pill-w', 'max-content');   // (flex: none, so never squeezed: see styles.css)
    const most = Math.max(...labels.map((label) => { el.textContent = label; return el.getBoundingClientRect().width; }));   // (not offsetWidth: rounded, it can cut the widest by a hair)
    el.textContent = kept;
    el.style.setProperty('--pill-w', `${Math.ceil(most)}px`);
  }
}

/* Custom tuning: a popup with each string laid out as on the neck (phones:
   columns, the lowest string on the left, mirrored left-handed; wide
   screens: rows, the highest string on top), each a semitone up or down at
   a time, within two octaves of standard. A note tuned away from standard is
   in the accent colour, and its string number turns into a button that puts
   that string back; tapping a note plays it. Landing on a preset (Drop
   D...) names it. Nothing changes on the neck (nor in what is saved) until
   Select, which puts the tuning on the neck (a preset's notes: that preset);
   Cancel (Escape, a tap outside) leaves the one you had. It starts from the
   custom tuning, or the one on the neck. */
let tune = null;   // { draft: open string pitches }
function openTuneEdit() {
  tune = { draft: (state.custom[state.instrument] || instrument().strings).slice() };
  tuneSet(tune.draft);
  if (els.tuneEdit.showModal) els.tuneEdit.showModal(); else els.tuneEdit.setAttribute('open', '');
}
function tuneSet(strings) {
  tune.draft = strings;
  keepFocus(renderTuneEdit);   // the + or − just used keeps the focus
}
// Select: the tuning on the neck
function applyTune(strings) {
  const id = state.instrument;
  const preset = matchTuning(id, strings);
  changeNeck(() => {
    if (preset) {   // a preset's notes (or a saved tuning's): that one
      state.tuning[id] = preset.id;
      // standard (Reset, or tuned back to it): the custom tuning goes back to
      // standard too, nothing kept; another one: it stays as it was
      if (preset.id === tuningsOf(id)[0].id) delete state.custom[id];
    } else {
      state.tuning[id] = 'custom';
      state.custom[id] = strings;
    }
  });
  render();
}
function tuneStep(s, step) {
  const base = tuningsOf(state.instrument)[0].strings;
  const m = tune.draft[s] + step;
  if (Math.abs(m - base[s]) > CUSTOM_RANGE) return;
  const strings = tune.draft.slice();
  strings[s] = m;
  tuneSet(strings);
}
// (its head on the circle, well clear of where it starts; its two sides alike either side of
// the arc as it looks, the chord along a side's length: 14° in from the tangent)
const RESET_ICON = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4.57 13.04A7.5 7.5 0 1 0 6.7 6.7"/><path d="M10.19 7.57L6.7 6.7L7.57 3.2"/></svg>';
/* The strings in neck order, laid out by styles.css for the screen's width
   (as the neck itself): each with its number (a reset button when it is
   tuned away from standard), + and −, and its note (tap: hear it). At the
   end of a string's range its + or − is greyed out but stays a button
   (aria-disabled), so it keeps the keyboard focus: one more press does
   nothing (tuneStep), rather than land on another button. */
function renderTuneEdit() {
  const id = state.instrument;
  const base = tuningsOf(id)[0].strings;
  const strings = tune.draft;
  const preset = matchTuning(id, strings);
  els.tuneName.textContent = preset ? preset.name : 'Custom';
  els.tuneName.title = preset && preset.saved ? preset.name : '';
  els.tuneName.classList.toggle('custom', !preset);
  // Save: for a tuning not yet in the menu (a preset's or a saved one's
  // notes are already there)
  els.tuneSave.disabled = Boolean(preset);
  if (preset && !els.tuneNaming.hidden) endNaming();
  else updateNaming();
  els.tuneList.classList.toggle('lefty', state.leftHanded);
  els.tuneList.style.setProperty('--n', strings.length);
  const inst = findInstrument(id);
  els.tuneList.innerHTML = strings.map((m, s) => {
    const n = strings.length - s;   // string 1: the highest
    const off = m - base[s];
    const name = stringNote(inst, s, noteText(plainNote(m, state.flats)));   // (a drone: g4)
    const oct = Math.floor(m / 12) - 1;
    const num = off
      ? `<button type="button" class="tune-num reset" data-reset="${s}" title="String ${n} back to standard (${stringNote(inst, s, noteText(plainNote(base[s], state.flats)))})" aria-label="String ${n} back to standard">${RESET_ICON}${n}</button>`
      : `<span class="tune-num">${n}</span>`;
    return `<li class="tune-string">${num}` +
      `<button type="button" class="tune-step up" data-string="${s}" data-step="1" aria-label="String ${n} up a semitone"${off >= CUSTOM_RANGE ? ' aria-disabled="true"' : ''}>+</button>` +
      `<button type="button" class="tune-note${off ? ' changed' : ''}" data-play="${m}" aria-label="String ${n}: ${name}${oct}, play it">${name}<span class="tune-oct">${oct}</span></button>` +
      `<button type="button" class="tune-step down" data-string="${s}" data-step="-1" aria-label="String ${n} down a semitone"${off <= -CUSTOM_RANGE ? ' aria-disabled="true"' : ''}>−</button></li>`;
  }).join('');
  els.tuneReset.disabled = strings.every((m, i) => m === base[i]);
}
/* Save: the buttons give way to a field for its name (empty: Save stays
   off); Save keeps the tuning under that name and picks it, Cancel goes
   back to the buttons */
function startNaming() {
  if (!tune || els.tuneSave.disabled) return;
  els.tuneSaveName.value = '';
  els.tuneActions.hidden = true;
  els.tuneNaming.hidden = false;
  updateNaming();
  els.tuneSaveName.focus();
}
function endNaming() {
  const back = !els.tuneNaming.hidden && els.tuneNaming.contains(document.activeElement);
  els.tuneNaming.hidden = true;
  els.tuneActions.hidden = false;
  if (back) (els.tuneSave.disabled ? els.tuneDone : els.tuneSave).focus();
}
function updateNaming() {
  els.tuneNameSave.disabled = !cleanName(els.tuneSaveName.value) || els.tuneSave.disabled;
}
function saveTune() {
  const name = cleanName(els.tuneSaveName.value);
  if (!tune || !name || matchTuning(state.instrument, tune.draft)) return;
  const id = state.instrument;
  const strings = tune.draft.slice();
  (state.saved[id] = state.saved[id] || []).push({ name, strings });
  // Kept by its name now (and on the neck): the custom tuning goes back to standard
  changeNeck(() => {
    state.tuning[id] = savedId(strings);
    delete state.custom[id];
  });
  tune = null;
  closeTuneEdit(false);
  render();
}

/* The tuning menu: the presets, then the Custom section: Custom (opens the
   Tuning popup: tune each string, save it) and the saved tunings, picked
   like presets, each with its bookmark and an × to delete it */
function openTuningMenu() {
  const own = state.custom[state.instrument];
  openPicker({
    title: 'Tuning', value: instrument().tuning.id,
    groups: [
      { items: tuningsOf(state.instrument).map((t) => ({ value: t.id, label: t.name, sub: tuningNotes(t.strings, Boolean(t.flats), state.instrument) })) },
      { label: 'Custom', items: [
        { value: 'custom', label: 'Custom', icon: EDIT_ICON, cls: 'custom-pick', title: 'Tune each string',
          sub: own ? tuningNotes(own, state.flats, state.instrument) : 'Tune each string' },
        ...savedTunings(state.instrument).map((t) => ({ value: t.id, label: t.name, icon: BOOKMARK_ICON, title: t.name,
          sub: tuningNotes(t.strings, state.flats, state.instrument), remove: `Delete ${t.name}` })),
      ] },
    ],
    onPick: (v) => {
      if (v === 'custom') { openTuneEdit(); return; }
      changeNeck(() => { state.tuning[state.instrument] = v; });
      render();
    },
    onRemove: askDeleteTuning,
  });
}

/* Deleting a saved tuning (its × in the tuning menu): asked first, then
   gone for good. The neck, if it was in it, goes back to standard tuning. */
let deleting = null;   // the saved tuning's id
function askDeleteTuning(tuningId) {
  const t = savedTunings(state.instrument).find((x) => x.id === tuningId);
  if (!t) return;
  deleting = t.id;
  els.tuneDeleteName.textContent = t.name;
  els.tuneDeleteNotes.textContent = tuningNotes(t.strings, state.flats, state.instrument);
  if (els.tuneDelete.showModal) els.tuneDelete.showModal(); else els.tuneDelete.setAttribute('open', '');
  els.tuneDeleteCancel.focus();
}
function closeDeleteTuning() {
  deleting = null;
  if (els.tuneDelete.open) {
    if (els.tuneDelete.close) els.tuneDelete.close(); else els.tuneDelete.removeAttribute('open');
  }
}
function deleteTuning() {
  const id = state.instrument;
  const gone = deleting;
  closeDeleteTuning();
  if (!gone || !state.saved[id]) return;
  state.saved[id] = state.saved[id].filter((t) => savedId(t.strings) !== gone);
  if (!state.saved[id].length) delete state.saved[id];
  if (state.tuning[id] === gone) changeNeck(() => { state.tuning[id] = 'standard'; });
  render();
  if (els.picker.open) openTuningMenu();   // the menu, without it
}

// Select puts it on the neck; Cancel leaves what you had
function closeTuneEdit(keep) {
  const t = tune;
  tune = null;
  endNaming();
  if (els.tuneEdit.open) {
    if (els.tuneEdit.close) els.tuneEdit.close(); else els.tuneEdit.removeAttribute('open');
  }
  if (t && keep) applyTune(t.draft);
}

let pickerPick = null;
let pickerToggle = null;
const X_ICON = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M7 7l10 10M17 7L7 17"/></svg>';
const BOOKMARK_ICON = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 4h11a1 1 0 0 1 1 1v15.2l-6.5-4.4-6.5 4.4V5a1 1 0 0 1 1-1z"/></svg>';
const EDIT_ICON = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 19.5h4l11-11-4-4-11 11v4z"/><path d="M14 6l4 4"/></svg>';
let pickerRemove = null;
/* Picker popup: tiles to tap instead of a long dropdown list. `groups` is
   [{ label, items: [{ value, label, sub, tag, icon, cls, title, style,
   remove }] }]; the chosen value goes to onPick; `layout`: the grid's
   class ('roots': the 12 notes). An item with `remove` (its words) has an
   × beside its tile, which hands its value to onRemove (a saved tuning).
   An optional `note` is a line of help under the tiles: the legend of the
   teal dot on the tiles that fit the scale. When no tile has the dot, it
   says so instead (`noteNone`), without a dot. */
// (tools: a switch on the title row, as a panel's, which leaves the menu
// open: its html, with data-toggle; onToggle, what a tap on it does)
// (foot: more html under it all, a setting of its own: the instrument menu's reference pitch)
function openPicker({ title, groups, value, layout = '', note = '', noteNone = '', onPick, onRemove = null, tools = '', onToggle = null, foot = '' }) {
  const dots = groups.some((g) => g.items.some((it) => it.cls === 'fits'));
  const legend = !note ? '' : dots || !noteNone ? `<p class="picker-note">${esc(note)}</p>` : `<p class="picker-note empty">${esc(noteNone)}</p>`;
  els.pickerTitle.textContent = title;
  els.pickerTools.innerHTML = tools;
  els.pickerBody.innerHTML = groups.map((g) =>
    (g.label ? `<div class="label picker-label">${esc(g.label)}</div>` : '') +
    `<div class="picker-grid ${layout}">${g.items.map((it) => {
      const sel = String(it.value) === String(value);
      const cls = `pick${sel ? ' selected' : ''}${it.cls ? ` ${it.cls}` : ''}`;
      // An icon before the name (a saved tuning's bookmark), and an × next
      // to the tile to remove it (a separate button: not inside the tile)
      const tile = `<button type="button" class="${cls}" data-value="${esc(it.value)}" aria-pressed="${sel}"` +
        `${it.style ? ` style="${it.style}"` : ''}${it.title ? ` title="${esc(it.title)}"` : ''}>` +
        (it.icon ? `<span class="pick-name with-icon"><span class="pick-icon">${it.icon}</span><span class="pick-text">${esc(it.label)}</span></span>`
          : `<span class="pick-name">${esc(it.label)}</span>`) +
        `${it.tag ? `<span class="pick-tag">${tx(it.tag)}</span>` : ''}` +
        `${it.sub ? `<span class="pick-sub">${esc(it.sub)}</span>` : ''}</button>`;
      return it.remove ? `<div class="pick-wrap">${tile}<button type="button" class="pick-remove" data-remove="${esc(it.value)}" ` +
        `aria-label="${esc(it.remove)}" title="${esc(it.remove)}">${X_ICON}</button></div>` : tile;
    }).join('')}</div>`
  ).join('') + legend + foot;
  pickerPick = onPick;
  pickerRemove = onRemove;
  pickerToggle = onToggle;
  const fresh = !els.picker.open;   // (else the same menu again, a tile removed: it stays where it was)
  const kept = els.pickerBody.scrollTop;
  if (fresh) { if (els.picker.showModal) els.picker.showModal(); else els.picker.setAttribute('open', ''); }
  peekPicker();
  const selected = els.pickerBody.querySelector('.pick.selected');
  if (selected) selected.focus({ preventScroll: true });
  const body = els.pickerBody;
  if (!fresh) body.scrollTop = kept;
  else if (selected) {
    // The current choice in the middle of a list that scrolls (as far as it goes)
    const scale = body.getBoundingClientRect().height / body.offsetHeight || 1;   // (the popup grows in as it opens)
    const at = (selected.getBoundingClientRect().top - body.getBoundingClientRect().top) / scale + body.scrollTop;
    body.scrollTop = at - (body.clientHeight - selected.offsetHeight) / 2;
  }
}
/* A list that scrolls ends partway through a tile, never just under a row
   of them: so it plainly goes on. Its height is cut, if need be, through
   the last tile that shows, between a third and two thirds of the way down
   (as little as that takes). Never by more than a tenth of the screen's
   height (PEEK_MOST): on a short screen (a phone on its side) a popup
   that would get much shorter stays as it is, a row's edge at its bottom,
   rather than show too little. */
const PEEK_MOST = 0.1;
function peekPicker() {
  const body = els.pickerBody;
  body.style.maxHeight = '';
  if (!els.picker.open || body.scrollHeight <= body.clientHeight + 1) return;
  const scale = body.getBoundingClientRect().height / body.offsetHeight || 1;
  const top = body.getBoundingClientRect().top;
  const seen = body.clientHeight;   // (the bottom edge, from the list's top)
  const tiles = [...body.querySelectorAll('.pick')].map((el) => {
    const r = el.getBoundingClientRect();
    const y = (r.top - top) / scale + body.scrollTop;
    return { y, h: r.height / scale };
  });
  // (the lowest place a tile can be cut, the bottom edge at most)
  const cut = Math.max(-Infinity, ...tiles.filter((t) => t.y + t.h * 0.3 <= seen).map((t) => Math.min(seen, t.y + t.h * 0.7)));
  if (cut >= seen - 1 || cut < seen - window.innerHeight * PEEK_MOST) return;   // one is cut well already, or it would take too much
  body.style.maxHeight = `${Math.round(cut)}px`;
}
function closePicker() {
  if (els.picker.close) els.picker.close(); else els.picker.removeAttribute('open');
}
/* The root menus (chord, scale): each pitch with its names, the one a
   pick writes it with on top (C♯ minor, D♭ major; both as easy, F♯ / G♭
   major: as the Flats setting has it, a chord's as the scale shown leans,
   see chordTie; no type yet: as the Flats setting has it), the other under
   it (the Alternative root); a name the scale shown gives a chord's root,
   alone. `fits(pc)` marks the roots whose chord fits the scale (or, with
   no chord, that are in it). From C, as named: with a capo named from,
   the C played first (what it sounds, its value). */
const rootItems = (lines, fits = () => false) => [{ items: SHARP_NAMES.map((_, i) => {
  const pc = mod12(i + nameShift());
  const [first, second] = lines(pc);
  return { value: pc, label: noteText(first), sub: second ? noteText(second) : '', cls: [second ? 'two' : '', fits(pc) ? 'fits' : ''].join(' ').trim() };
}) }];
// (a root's names as the neck writes notes, first line first)
function rootLines(pc) {
  const [main, other] = rootNames(pc);
  return other && main.acc && state.flats ? [other, main] : [main, other];
}
// (... as a scale or chord of this type writes it: def null, no type yet)
function typedLines(pc, def, chord = false) {
  if (!def) return rootLines(pc);
  const used = (chord ? spellChord(pc, def) : spellScale(pc, def)).root;
  return [used, otherRoot(pc, used)];
}
/* A root menu's button: the name used, its other one in brackets
   ("E♭ (D♯)"); a root alone, with no type yet, both names as its menu
   lists them ("C♯ / D♭"); a name the scale shown decides, alone. */
function rootLabel(pc, used = null) {
  if (!used) return rootLines(pc).filter(Boolean).map(noteText).join(' / ');
  const other = otherRoot(pc, used);
  return other ? `${noteText(used)} (${noteText(other)})` : noteText(used);
}

/* The chord's notes that are outside the shown scale: [] when it fits, null
   when there is no scale to compare with (none, or the chromatic scale). */
function outsideScale(rootPc, def, sc) {
  if (!sc || sc.def.steps.length >= 12) return null;
  return chordTones(rootPc, def).filter((t) => !sc.set.has(t.pc));
}
/* Chord notes outside the shown scale get an amber mark on the neck and in
   the chord panel (the same amber as the panel's "Outside D Major" line) */
const offKeyTest = (sc) => (sc && sc.def.steps.length < 12 ? (pc) => !sc.set.has(mod12(pc)) : () => false);
const fitsScale = (rootPc, def, sc) => { const out = outsideScale(rootPc, def, sc); return Boolean(out && !out.length); };
/* Help line for the chord pickers when a scale is shown */
const fitsNote = (sc) => (sc && sc.def.steps.length < 12 ? `Every note is in ${scaleInText(sc)}` : '');
/* With no chord (type "None"), any note of the scale can be the root */
const rootNote = (sc) => (sc && sc.def.steps.length < 12 ? `In ${scaleInText(sc)}` : '');
const inScale = (pc, sc) => Boolean(sc && sc.def.steps.length < 12 && sc.set.has(pc));

let measureCtx = null;   // (the canvas fitText and fitSymbol measure on)
/* Words that may not fit their place: the first of their forms that does
   (the whole, then shorter ones: "Diminished 5th", "Dim. 5th"); none does:
   the shortest (in a smaller font first, given a min), cut with "…". The forms stay on it (data-fits), to fit
   them again when the room changes (a sheet opening, the window). */
const textWidth = (el) => {   // (its text's own width, not its box's: to the fraction of a pixel)
  const range = document.createRange();
  range.selectNodeContents(el);
  return range.getBoundingClientRect().width;
};
const textRoom = (el) => {   // (the width its text has, to the fraction of a pixel, as text-overflow sees it)
  const cs = getComputedStyle(el);
  return el.getBoundingClientRect().width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) -
    parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth);
};
function fitWords(el, forms = null, min = 0) {   // (min: past the shortest, a smaller font, no smaller than this, as fitText)
  if (forms) el.dataset.fits = JSON.stringify(forms);
  if (min) el.dataset.fitMin = min;
  const all = forms || JSON.parse(el.dataset.fits || '[]');
  el.style.fontSize = '';
  for (const f of all) {
    el.textContent = f;
    if (textWidth(el) <= textRoom(el) + 0.01) return;   // (not scrollWidth: whole pixels, a fraction too long would pass, and be cut)
  }
  if (el.dataset.fitMin) fitText(el, Number(el.dataset.fitMin));
}
const refitWords = (root = document) => root.querySelectorAll('[data-fits]').forEach((el) => fitWords(el));
const fitsAttr = (forms) => `data-fits="${esc(JSON.stringify([...new Set(forms)]))}"`;
// Shorter words for the long ones of chord and interval names
const SHORT_WORDS = [[/Half-diminished/g, 'Half-dim.'], [/Minor-major/g, 'Min-maj'], [/Diminished/g, 'Dim.'], [/Augmented/g, 'Aug.'],
  [/Dominant/g, 'Dom.'], [/Suspended/g, 'Sus.'], [/Perfect/g, 'Perf.'], [/Major/g, 'Maj.'], [/Minor/g, 'Min.']];
const shortWords = (text) => SHORT_WORDS.reduce((t, [re, to]) => t.replace(re, to), text);

/* Shrink the text of a fixed-size box until it fits on one line (long chord
   symbols like C♯m(maj7)). Measured on a canvas, so it also works while the
   box is hidden (a closed sheet on phones). */
function fitText(el, min = 0) {   // (min: no smaller than this, the rest cut with "…" by styles.css)
  el.style.fontSize = '';
  const cs = getComputedStyle(el);
  const room = parseFloat(cs.width) - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const size = parseFloat(cs.fontSize);
  if (!(room > 0)) return;
  measureCtx = measureCtx || document.createElement('canvas').getContext('2d');
  measureCtx.font = `${cs.fontWeight} ${size}px ${cs.fontFamily}`;
  const width = measureCtx.measureText(el.textContent).width;
  if (width > room) el.style.fontSize = `${Math.max(min, Math.floor((size * room) / width))}px`;
}

/* The chord's name in its card: on one line, a smaller font where it does
   not fit, down to SYMBOL_SPLIT of its size; past that, on two lines where
   a name can break (before its brackets or its bass note, after a comma in
   its brackets: "B♭m7♭5" / "(add11,♭9,♭13)/F♭"), at that size, smaller
   again only if it must (to its width, or its height). The split that
   lets it be largest, the more natural ones first when nearly as large:
   the bass note under the chord (as written as a fraction), then the
   brackets on a line of their own, then after a comma. Two lines only
   where they let it be larger than one would. */
const SYMBOL_SPLIT = 0.65;
function fitSymbol(el, text, slashBass) {
  el.textContent = text;
  el.classList.remove('two');
  el.style.fontSize = '';
  const cs = getComputedStyle(el);
  const room = parseFloat(cs.width) - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const high = parseFloat(cs.height);
  const size = parseFloat(cs.fontSize);
  if (!(room > 0)) return;
  measureCtx = measureCtx || document.createElement('canvas').getContext('2d');
  measureCtx.font = `${cs.fontWeight} ${size}px ${cs.fontFamily}`;
  const width = (t) => measureCtx.measureText(t).width;   // (at the full size)
  const one = Math.min(size, (size * room) / width(text));
  if (one >= size * SYMBOL_SPLIT) { if (one < size) el.style.fontSize = `${Math.floor(one)}px`; return; }
  // Where it can break: before "(", before its bass note's "/" (not the one
  // of 6/9), after a "," in the brackets
  const breaks = [];   // [where, how natural: the larger, the more]
  for (let i = 1; i < text.length; i++) {
    if (slashBass && i === text.lastIndexOf('/')) breaks.push([i, 1 / 0.85]);
    else if (text[i] === '(') breaks.push([i, 1 / 0.9]);
    else if (text[i - 1] === ',') breaks.push([i, 1]);
  }
  let best = null;
  for (const [i, natural] of breaks) {
    const lines = [text.slice(0, i), text.slice(i)];
    const wide = Math.max(...lines.map(width));
    const fit = Math.min(size * SYMBOL_SPLIT, (size * room) / wide, high / (2 * 1.1));   // (two lines of 1.1 high)
    if (!best || fit * natural > best.fit * best.natural) best = { lines, fit, natural };
  }
  if (!best || best.fit <= one) { el.style.fontSize = `${Math.floor(one)}px`; return; }
  el.innerHTML = best.lines.map(esc).join('<br>');
  el.classList.add('two');
  el.style.fontSize = `${Math.floor(best.fit)}px`;
}

/* The middle of a stepper, or of Name a chord: the name (a pill) beside
   two lines, its number ("Shape 1/4, fret 11", "Name 1/3") over what it
   is (its frets, the notes, its meaning). The name whole, beside room for
   its number at the least ("1/4"): a smaller font first (no smaller than
   11px), cut short only past that; hidden on the smallest phones
   (styles.css: the Chord tab says it), its room then theirs. Its number,
   in what the name leaves, in its own size: the longest of its forms
   that fits ("Shape 1/4, fret 11", "Shape 1/4", "1/4"). The line under
   it, whole where it fits, a little smaller where not (no smaller than
   12px), then cut short. Fitted again when its room changes (a phone
   turned, the window resized: setupInfoFit). */
function fitInfo(info) {
  const pill = info.querySelector('.dock-symbol');
  const tab = info.querySelector('.dock-tab');
  if (!pill || !tab) return;
  const count = tab.querySelector('.dock-count[data-fits]');
  const main = tab.querySelector('.dock-main');
  pill.style.fontSize = '';
  tab.style.minWidth = '';
  if (main) main.style.fontSize = '';
  const forms = count ? JSON.parse(count.dataset.fits) : [];
  if (count) count.textContent = count.title = forms[0];
  if (!info.clientWidth) return;   // (hidden: fitted once shown)
  if (count) count.textContent = forms[forms.length - 1];
  const name = pill.querySelector('.tx');
  if (name && getComputedStyle(pill).display !== 'none') {
    const box = getComputedStyle(info);
    const ps = getComputedStyle(pill);
    const least = count ? Math.ceil(textWidth(count)) : 0;
    const room = info.clientWidth - parseFloat(box.paddingLeft) - parseFloat(box.paddingRight) - parseFloat(box.columnGap) -
      parseFloat(ps.paddingLeft) - parseFloat(ps.paddingRight) - least - 1;   // (the 1: rounding)
    const size = parseFloat(ps.fontSize);
    const width = textWidth(name);
    if (width > room) pill.style.fontSize = `${Math.max(11, Math.floor((size * room) / width))}px`;
    tab.style.minWidth = `${least}px`;   // (none without a number: the name first)
  }
  if (count) fitWords(count);
  if (main) fitText(main, 12);
}
/* The shape's note cards: room for a scrollbar under them only when they
   scroll (else the line under them, "Not in this shape", would sit far
   below). Again when the row's width changes (setupInfoFit). */
function fitNotesRow() {
  const row = els.chordTones;
  row.classList.remove('fits');
  row.classList.toggle('fits', row.scrollWidth <= row.clientWidth);
}
const infoWidths = new WeakMap();
function setupInfoFit() {
  if (!window.ResizeObserver) return;
  const watch = new ResizeObserver((entries) => {
    for (const { target } of entries) {
      if (infoWidths.get(target) === target.clientWidth) continue;   // (a height change: nothing to fit)
      infoWidths.set(target, target.clientWidth);
      if (target === els.chordTones) fitNotesRow();
      else if (target === els.namer) fitNamer();
      else fitInfo(target);
    }
  });
  for (const info of [els.dockShape, els.quickGroupInfo, els.namerSymbol.parentElement, els.chordTones, els.namer]) watch.observe(info);
}
/* Name a chord's bar, as the room it has goes. Wide screens: its title
   row's buttons with their words beside Cancel and Select; with their
   icons alone (.tight); Cancel and Select narrower too (.snug); then
   those two on a row of their own, at the bottom, as on phones
   (.stacked). Phones: the title "Name" (.short), then its pencil alone
   (.brief), its words still read out whole. Never a button over the
   title, which keeps its room. */
const NAMER_FITS = ['tight', 'snug', 'stacked'];
const NAMER_PHONE_FITS = ['short', 'brief'];
function fitNamer() {
  const bar = els.namer;
  bar.classList.remove(...NAMER_FITS, ...NAMER_PHONE_FITS);
  if (bar.hidden) return;
  const head = bar.querySelector('.namer-head');
  const title = head.querySelector('.namer-title');
  const tight = () => head.scrollWidth > head.clientWidth + 1 || title.scrollWidth > title.clientWidth + 1
    || title.getBoundingClientRect().right + 16 > els.namerMute.getBoundingClientRect().left;   // (16px at least between them)
  for (const fit of isWide() ? NAMER_FITS : NAMER_PHONE_FITS) {
    if (!tight()) break;
    bar.classList.add(fit);
  }
}

/* The steppers: a chord's shapes or a scale's groups, one at a time, with
   arrows, a button to hear it and one to show its panel.
   Phones: one, in the dock, for the chord's shapes; with no chord but a
   scale in groups, for the groups instead. Wide screens: in the quick bar
   under the neck, one for each, shown when there is something to step
   through (the chord's, as soon as a chord is picked). */
const DOCK_LABELS = {
  chord: ['Previous shape', 'Next shape', 'Show the chord panel', 'Strum', 'Strum'],
  keys: ['Previous shape', 'Next shape', 'Show the chord panel', 'Play the chord', 'Play'],   // (the piano's chord: played, not strummed)
  group: ['Previous group', 'Next group', 'Show the scale panel', 'Play the group', 'Play'],
};
function fillStepper(bar, mode, ch, sc) {
  const group = mode === 'group' ? ui.groups[ui.group] : null;
  bar.root.classList.toggle('groups', mode === 'group');
  const [prevLabel, nextLabel, openLabel, playLabel, playText] = DOCK_LABELS[mode === 'chord' && instrument().piano ? 'keys' : mode];
  bar.prev.setAttribute('aria-label', prevLabel);
  bar.next.setAttribute('aria-label', nextLabel);
  // (no shape: said first, the bar's words cut short or hidden on a narrow screen)
  const infoLabel = mode === 'chord' && ch && !ch.shape ? `No playable shape, ${openLabel.toLowerCase()}` : openLabel;
  bar.info.setAttribute('aria-label', infoLabel);
  bar.play.setAttribute('aria-label', playLabel);
  bar.play.querySelector('.strum-label').textContent = playText;
  if (mode !== 'group') bar.play.querySelector('.ico').outerHTML = PLAY_ICON;   // (the dock's, back from a group's Stop)
  if (group) {
    bar.prev.disabled = bar.next.disabled = ui.groups.length < 2;
    bar.play.disabled = false;
    bar.symbol.innerHTML = tx(sc.rootName);
    const n = `${ui.group + 1}/${ui.groups.length}`;
    bar.tab.innerHTML = `<span class="dock-count" ${fitsAttr([...(group.keys ? [] : [`Group ${n}, ${groupPlace(group, capo())}`]), `Group ${n}`, n])}></span>` +   // (a keyboard's place: in its span)
      `<span class="dock-main dock-words">${esc(groupSpan(group, capo()))}</span>`;   // (frets counted from the capo)
  } else {
    const many = Boolean(ch && ch.shapes.length > 1);
    bar.prev.disabled = bar.next.disabled = !many;
    bar.play.disabled = !ch || !ch.shape;
    bar.symbol.innerHTML = ch ? tx(ch.symbol) : '';   // (empty: hidden)
    if (!ch) bar.tab.innerHTML = '<span class="dock-msg">No chord selected</span>';
    else if (!ch.shape) bar.tab.innerHTML = '<span class="dock-msg">No playable shape</span>';   // words, not tab: the normal font
    else {
      const n = `${ch.index + 1}/${ch.shapes.length}`;
      bar.tab.innerHTML = `<span class="dock-count" ${fitsAttr([`Shape ${n}, ${shapeWhere(ch.shape)}${ch.shape.drawn ? ', custom' : ''}`, `Shape ${n}, ${shapeWhere(ch.shape)}`, `Shape ${n}`, n])}></span>` +
        `<span class="dock-main${ch.shape.piano ? ' dock-words' : ''}">${esc(shapeShort(ch.shape))}</span>`;   // (a piano's: notes, in words)
    }
  }
  // Their keys, as the panels' buttons say them: the arrows and Space step and
  // play what keysOnGroups says (the phone's one stepper: always its own)
  const keys = (mode === 'group') === keysOnGroups(ch);
  for (const [btn, key] of [[bar.prev, '←'], [bar.next, '→'], [bar.play, 'Space']]) btn.title = btn.getAttribute('aria-label') + (keys ? ` (${key})` : '');
  if (mode === 'group') showGroupPlay(bar);   // (Play, or Stop while it plays)
  else showStrum(bar.play, playLabel, playText, `${bar.play.title}, ${HOLD_HINT}`);   // (Strum, or Stop while arpeggiated)
  bar.info.title = infoLabel;
  bar.symbol.title = ch && mode === 'chord' ? ch.symbol : '';
  fitInfo(bar.info);
}
const dockStepper = () => ({ root: els.dockShapeBar, prev: els.dockPrev, next: els.dockNext, info: els.dockShape, play: els.dockStrum, symbol: els.dockSymbol, tab: els.dockTab });
const groupStepper = () => ({ root: els.quickGroupBar, prev: els.quickGroupPrev, next: els.quickGroupNext, info: els.quickGroupInfo, play: els.quickGroupPlay, symbol: els.quickGroupSymbol, tab: els.quickGroupTab });
/* The quick bar shows when it has something in it */
function updateQuickBar() {
  els.quickBar.hidden = !isWide() || Boolean(naming) || (els.dockRecent.hidden && els.dockShapeBar.hidden && els.quickGroupBar.hidden);
}
function renderDock(ch, sc) {
  const group = sc ? ui.groups[ui.group] : null;
  if (isWide()) {
    ui.dockMode = 'chord';
    els.dockShapeBar.hidden = !ch;
    fillStepper(dockStepper(), 'chord', ch, sc);
    els.quickGroupBar.hidden = !group;
    if (group) fillStepper(groupStepper(), 'group', ch, sc);
  } else {
    // Phones: one stepper, for what was last acted on (see noteFocus): the
    // chord's shapes, or the scale's groups (Groups on); the one there is when
    // the other is not; none with neither (just the tabs)
    const mode = group && (!ch || ui.focus === 'group') ? 'group' : 'chord';
    ui.dockMode = mode;   // (its buttons step and play that)
    els.dockShapeBar.hidden = !ch && !group;
    fillStepper(dockStepper(), mode, ch, sc);
    els.quickGroupBar.hidden = true;
  }
  updateQuickBar();
  els.namer.hidden = !naming;
  if (naming) renderNamer();
  els.instrumentPicker.disabled = Boolean(naming);   // (shown as plain text: the neck the notes are on)

  els.tabChordValue.textContent = ch ? ch.symbol : 'None';
  els.tabScaleValue.textContent = sc ? `${sc.rootName} ${sc.def.short}` : 'None';
  fitText(els.tabChordValue, 10);   // (a long name: a smaller font first, then cut short)
  fitText(els.tabScaleValue, 10);
  // What the Setup sheet sets: the capo if there is one, else the tuning
  // (the instrument has its own menu above the neck)
  // (the piano: its keys, nothing to tune)
  const tuning = instrument().tuning;
  const piano = Boolean(instrument().piano);
  els.tabNeckValue.textContent = piano ? `${instrument().keys} keys` : capo() ? `Capo ${capo()}` : tuningName(instrument()) ? tuning.short || tuning.name : 'Standard';

  const open = !isWide() && ui.tab !== null;
  for (const tab of els.tabs) tab.setAttribute('aria-pressed', String(open && tab.dataset.tab === ui.tab));
  for (const panel of els.sheetPanels) panel.classList.toggle('active', panel.dataset.tab === ui.tab);
  els.sheet.classList.toggle('open', open);
  document.body.classList.toggle('sheet-open', open);   // extra scroll room under the neck
  els.sheet.setAttribute('aria-hidden', String(!isWide() && !open));
}

/* Phones: drag the sheet down by its handle or its title to close it. A
   short drag springs back; a tap on the handle or the title closes it too. */
function setupSheetDrag() {
  let startY = null;
  let dy = 0;
  let t0 = 0;
  let dragged = false;
  const begin = (e) => {
    if (isWide() || !els.sheet.classList.contains('open')) return;
    dragged = false;
    if (e.target.closest('.panel-head button, .panel-head .status')) return;
    if (e.currentTarget !== els.sheetClose && els.sheetBody.scrollTop > 0) return;   // title only at the top
    startY = e.clientY; dy = 0; t0 = performance.now(); dragged = false;
    els.sheet.style.transition = 'none';
  };
  const move = (e) => {
    if (startY === null) return;
    dy = Math.max(0, e.clientY - startY);
    if (dy > 4) dragged = true;
    els.sheet.style.transform = `translateY(${dy}px)`;
  };
  const end = () => {
    if (startY === null) return;
    const fast = dy / Math.max(1, performance.now() - t0) > 0.6;   // a quick flick also closes
    startY = null;
    els.sheet.style.transition = '';
    els.sheet.style.transform = '';
    if (dy > 80 || (fast && dy > 24)) openTab(null);
  };
  const handles = [els.sheetClose, ...els.sheet.querySelectorAll('.panel-head')];
  for (const h of handles) h.addEventListener('pointerdown', begin);
  // While dragging, the finger moves the sheet, nothing else (no scroll:
  // cancelled at its first move, as on the dock, setupDockTouch)
  for (const h of handles) h.addEventListener('touchmove', (e) => { if (startY !== null && e.cancelable) e.preventDefault(); }, { passive: false });
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
  // A drag that springs back must not count as a tap on the handle
  els.sheetClose.addEventListener('click', () => {
    if (dragged) { dragged = false; return; }
    openTab(null);
  });
  // The titles are not buttons: keyboards and screen readers use the handle
  for (const head of els.sheet.querySelectorAll('.panel-head')) {
    head.addEventListener('click', (e) => {
      if (isWide() || ui.tab === null || e.target.closest('button, .status')) return;
      if (dragged) { dragged = false; return; }
      openTab(null);
    });
  }
}

/* Phones: a swipe on the dock does not scroll the page under it; only
   something in the dock that can scroll that way does (a row of chips
   sideways, an open panel up and down), and only while it has room left
   that way. The first move of the touch is cancelled, so the browser never
   starts a scroll (touch-action: none, on the other hand, still starts an
   unseen glide, and the next tap is lost stopping it).
   What scrolls is what is under the finger's point, which near an edge is
   not always the touch's target (a finger is wider than a point: touching
   the bar right under an open panel can target the panel), so both must
   be in the same scroller, else the page under the dock would scroll. */
function setupDockTouch() {
  const dock = document.getElementById('dock');
  let x0 = 0;
  let y0 = 0;
  let under = null;   // what is under the finger's point
  const scroller = (el, sideways) => {
    for (; el && el !== dock.parentElement; el = el.parentElement) {
      const style = getComputedStyle(el);
      const overflow = sideways ? style.overflowX : style.overflowY;
      const room = sideways ? el.scrollWidth > el.clientWidth : el.scrollHeight > el.clientHeight;
      if (room && (overflow === 'auto' || overflow === 'scroll')) return el;
    }
    return null;
  };
  // Room left in the way the finger goes (a finger going up scrolls down)
  const hasRoom = (el, sideways, d) => {
    const at = sideways ? el.scrollLeft : el.scrollTop;
    const end = sideways ? el.scrollWidth - el.clientWidth : el.scrollHeight - el.clientHeight;
    const pos = Math.abs(at);   // (right to left: scrollLeft goes negative)
    return d < 0 ? pos < end - 1 : pos > 1;
  };
  dock.addEventListener('touchstart', (e) => {
    x0 = e.touches[0].clientX;
    y0 = e.touches[0].clientY;
    under = document.elementFromPoint(x0, y0);
  }, { passive: true });
  dock.addEventListener('touchmove', (e) => {
    if (!e.cancelable || isWide()) return;   // (a scroll already under way: its own; wide screens: the dock is part of the page)
    const t = e.touches[0];
    const dx = t.clientX - x0;
    const dy = t.clientY - y0;
    const sideways = Math.abs(dx) > Math.abs(dy);
    const el = scroller(e.target, sideways);
    const ok = el && dock.contains(under) && scroller(under, sideways) === el && hasRoom(el, sideways, sideways ? dx : dy);
    if (e.touches.length > 1 || !ok) e.preventDefault();
  }, { passive: false });
}

/* A stepper's middle button: the panel it steps through, its hero card
   (the chord's name, or the scale's) in the middle of the room there is:
   phones, its sheet opens, scrolled to it; wide screens, the page scrolls
   to it (the panel unfolded). With no card (no chord, no scale): the
   panel's top. */
function showPanel(tab) {
  const panel = tab === 'chord' ? els.panelChord : els.panelScale;
  const hero = () => {
    const head = panel.querySelector('.np-head');
    return head && head.getClientRects().length ? head : null;
  };
  if (!isWide()) {
    openTab(tab);
    const card = ui.tab === tab && hero();
    if (card) {
      const [at, room] = [card.getBoundingClientRect(), els.sheetBody.getBoundingClientRect()];
      els.sheetBody.scrollTop += at.top + at.height / 2 - (room.top + room.height / 2);
    }
    return;
  }
  if (state.folded[tab]) { state.folded[tab] = false; render(); }
  const card = hero();
  if (card) card.scrollIntoView({ block: 'center', behavior: 'smooth' });
  else panel.scrollIntoView({ block: 'start', behavior: 'smooth' });
}
function openTab(tab) {
  const wasOpen = ui.tab !== null;
  ui.tab = ui.tab === tab ? null : tab;
  // A panel opened: what it is about is what is acted on (the chord's, or the
  // scale's groups: the stepper and the neck follow, see noteFocus)
  if (ui.tab === 'chord') ui.focus = 'chord';
  else if (ui.tab === 'scale') ui.focus = 'group';
  const ch = currentChord();
  renderDock(ch, currentScale());
  if (ui.tab) {
    els.sheetBody.scrollTop = 0;
    refitWords(els.sheet);   // (its words fitted to the room they now have)
    if (ui.tab === 'scale') requestAnimationFrame(() => keepChipVisible(els.groupList));
    // Once the sheet has slid up, make sure the shape is still visible above
    // it: wait for its own slide animation (or not at all, if it has none)
    const sliding = els.sheet.getAnimations ? els.sheet.getAnimations() : [];
    Promise.all(sliding.map((a) => a.finished)).then(() => { if (ui.tab) revealFocus(); }, () => {});
  } else if (wasOpen) {
    revealFocus();   // closed: centre it again in the now taller view (the chord, or the group just picked)
  }
}

/* Wide screens: the chord and scale panels, folded or not (state.folded;
   on phones each is a sheet of its own: never folded). Folded, its title
   says what it shows ("Chord C/E", "Scale C Major"). */
function renderFolds(ch, sc) {
  const wide = isWide();
  for (const [key, panel, value] of [['chord', els.panelChord, ch ? ch.symbol : 'None'],
    ['scale', els.panelScale, sc ? `${sc.rootName} ${scaleTitle(sc.def)}` : 'None']]) {
    const folded = wide && state.folded[key];
    panel.classList.toggle('folded', folded);
    const btn = panel.querySelector('.panel-fold');
    btn.setAttribute('aria-expanded', String(!folded));
    btn.setAttribute('aria-label', `${folded ? 'Unfold' : 'Fold'} the ${key} panel`);
    btn.title = folded ? `Show the ${key} panel` : `Fold the ${key} panel to its title`;
    const v = panel.querySelector('.fold-value');
    v.hidden = !folded;
    v.innerHTML = folded ? tx(value) : '';
  }
  fitPanelHeads();
}
/* Wide screens: the chord and scale panels' title rows. The title (and the
   shape or group count), then the switches and the panel's button (Name a
   chord; Groups) at the end: on one line when they fit; else that button
   on the title's line, the switches under it (as on phones, where those two
   are on the title row). The title cut short ("…") if even that is too
   long (a folded panel's: "Scale C Mixolydian ♭6") */
const PANEL_TOOLS = { chord: 'namerOpen', scale: 'tglScaleGroups' };
function fitPanelHeads() {
  for (const [key, panel] of [['chord', els.panelChord], ['scale', els.panelScale]]) {
    const head = panel.querySelector('.panel-head'), title = head.querySelector('.theory-title');
    const tool = els[PANEL_TOOLS[key]];
    title.style.maxWidth = '';
    if (!isWide() || !head.getClientRects().length) { head.classList.remove('two'); continue; }
    const gap = parseFloat(getComputedStyle(head).columnGap) || 0;
    const shown = [title, head.querySelector('.status'), ...head.querySelectorAll('.switch-row > *')].filter((el) => el && el.getClientRects().length);
    const widths = new Map(shown.map((el) => [el, el.getBoundingClientRect().width]));
    const sum = (list) => list.reduce((s, el) => s + widths.get(el), 0) + gap * Math.max(0, list.length - 1);
    const room = head.clientWidth;
    const two = sum(shown) > room && shown.includes(tool) && shown.length > 3;   // (one switch more at least: else nothing to put under)
    head.classList.toggle('two', two);
    if (!two) continue;
    const top = shown.filter((el) => el === title || el.classList.contains('status') || el === tool);
    const over = sum(top) + HEAD_SPLIT - room;
    if (over > 0) title.style.maxWidth = `${Math.max(HEAD_LEAST, widths.get(title) - over)}px`;
  }
}
/* The arrow or the title folds a panel, or unfolds it; folded, a click
   anywhere on it unfolds it too (but on its switches and buttons: those do
   their own thing) */
function setupFolds() {
  for (const [key, panel] of [['chord', els.panelChord], ['scale', els.panelScale]]) {
    panel.addEventListener('click', (e) => {
      if (!isWide()) return;
      const title = e.target.closest('.theory-title');
      if (state.folded[key] ? title || !e.target.closest('button, a, input, select, label') : title) {
        state.folded[key] = !state.folded[key];
        render();
      }
    });
  }
}

function renderHeader() {
  const inst = instrument();
  document.body.classList.toggle('piano', Boolean(inst.piano));   // (styles.css hides what a piano has no use for)
  els.neck.closest('.neck-panel').setAttribute('aria-label', inst.piano ? inst.name : 'Fretboard');
  const tuned = tuningName(inst);
  // (and the reference pitch, when not as usual: muted as the tuning, after
  // it, so as not to be forgotten; whole, the tuning's name cut short first)
  const pitch = pitchA === PITCH_USUAL ? '' : `A = ${pitchA}`;   // (short, as musicians write it: "A = 432 Hz" in the menu and the tuner)
  const more = (tuned ? `<span class="inst-tname">${esc(tuned)}</span>` : '') + (pitch ? `<span class="inst-pitch">${pitch}</span>` : '');   // (the tuning's name: phones only, the menu beside it on wide screens)
  els.instrumentPicker.innerHTML = `<span class="inst-label"><span class="inst-name">${esc(inst.name)}</span>` +
    (more ? ` <span class="inst-tuning">${more}</span>` : '') + '</span>';   // (the space: phones, where they wrap)
  els.instrumentPicker.setAttribute('aria-label', `Instrument: ${[inst.name, tuned, pitch && refText()].filter(Boolean).join(', ')}`);
  els.instrumentPicker.title = inst.piano ? 'Change instrument or reference pitch' : 'Change instrument, reference pitch or left-handed';   // (as its menu has them: a keyboard, nothing to mirror)
  stackInstLabel();
  const c = capo();
  // (the neck's header: at most TUNING_CHARS of its name, "…" past them, all of it in its tooltip)
  const tuningLabel = tuned || 'Standard tuning';
  const shown = els.settings.parentElement === els.settingsWideSlot ? clipText(tuningLabel, TUNING_CHARS) : tuningLabel;
  els.tuningSelect.textContent = shown;
  els.tuningSelect.title = shown !== tuningLabel ? tuningLabel : 'How the strings are tuned';
  els.tuningSelect.classList.toggle('on', Boolean(tuned));
  els.capoSelect.textContent = c ? `Capo ${c}` : 'No capo';
  els.capoSelect.classList.toggle('on', c > 0);
  for (const [id, key] of TOGGLES) {
    els[id].setAttribute('aria-pressed', String(state[key]));
  }
  fitNeckHead();
}

/* Phones: a tuning with no room beside the instrument's name goes under it,
   stacked, the button as wide as the longer of the two (wrapped as a line,
   it would keep the whole width it was given) */
function stackInstLabel() {
  const label = els.instrumentPicker.querySelector('.inst-label');
  const tuning = label && label.querySelector('.inst-tuning');
  if (!label) return;
  label.classList.remove('stacked');
  if (!tuning || els.instrumentPicker.parentElement !== els.instNarrowSlot) return;
  // (on the line under the name: its middle well under the name's; their
  // boxes, padded for the trimmed text, overlap either way)
  const under = (a, b) => { const [x, y] = [a, b].map((el) => el.getBoundingClientRect()); return x.top + x.height / 2 - (y.top + y.height / 2) > y.height / 2; };
  tuning.classList.remove('split');
  if (under(tuning, label.querySelector('.inst-name'))) label.classList.add('stacked');
  // (stacked, and the reference pitch still not beside the tuning's name:
  // a line of its own too, without the dot)
  const [tname, pitch] = [tuning.querySelector('.inst-tname'), tuning.querySelector('.inst-pitch')];
  if (label.classList.contains('stacked') && tname && pitch && under(pitch, tname)) tuning.classList.add('split');
}
/* "Drop D", "C G D G B D" (custom), or '' for the standard tuning */
const tuningName = (inst) => (inst.tuning && inst.tuning.id !== 'standard' ? inst.tuning.name : '');
/* Open string names, low to high: "D A D G B E". A short string (a banjo's
   drone) is written in small letters, as banjo players write it: "g D G B D".
   A string on the standard tuning's note in another octave has its octave:
   "G3 C E A" (low G ukulele), "E1 A D G B E"; so has one on another
   tuning's (`other`) note in another octave, as both are shown side by
   side: "F2 A D G B E → F3 A D G B E". (Words only: links and saved
   tunings keep the pitches.) */
function tuningNotes(strings, flats = false, instId = null, other = null) {
  const inst = instId && findInstrument(instId);
  const standard = inst && !inst.piano && inst.strings.length === strings.length ? inst.strings : null;
  const octave = (to, m, s) => to && to.length === strings.length && m !== to[s] && mod12(m) === mod12(to[s]);
  return strings.map((m, s) => {
    const n = plainNote(m, flats);
    const moved = octave(standard, m, s) || octave(other, m, s);
    return stringNote(inst, s, moved ? pitchText(m, n) : noteText(n));
  }).join(' ');
}
const stringNote = (inst, s, name) => (inst && startFret(inst, s) ? name.charAt(0).toLowerCase() + name.slice(1) : name);

const MUTE_BADGE = '×';   // (a muted string's badge: drawn as MUTE_ICON)
const MUTE_ICON = '<svg class="ico mute-ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" ' +
  'stroke-width="3" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';

/* Scale groups, as players learn them (the five pentatonic boxes, the CAGED
   positions of the major scale): the scale as it lies under the hand in one
   place on the neck, string after string, each string's notes within reach
   of the fingers. Neighbouring groups share notes (less than 3/4 of them),
   so moving from one to the next keeps a note or two under the fingers, and
   together they cover the whole neck.
   Each group is an unbroken run of the scale from its lowest note to its
   highest, each note once: 2 or 3 notes on a string (2 in a pentatonic; the
   open position may leave one, see handGroups), no string's notes
   spread over more than 4 frets (one finger per fret), the group 5 frets
   wide, 6 where the scale allows no less. Open strings sit at the nut,
   before fret 1: the open position is frets 1 to 4. Mandolin and mandola
   frets are about half as wide, so their hand reaches further (REACH): up
   to 7 frets, 3 or 4 notes on a string.
   Only complete groups are returned: every string, every note playable (not
   cut off by the nut, the capo or the last fret), in order up the neck. Each
   group is a list of bars, one per string: the frets from its first to its
   last note (a to b), and its outline's (da to db: further, to meet the
   string before or after, see handGroups). A banjo's drone is left out: groups are played on the long
   strings.
   Returns [{ id, bars: [{ s, a, b, da, db }] }]. */
const groupsCache = { key: null, groups: [] };
function scaleGroups(inst, sc, capo) {
  const L = sc.def.steps.length;
  if (L >= 12) return [];   // chromatic: nothing to group
  const key = [inst.id, inst.strings, inst.frets, inst.fifths, sc.def.id, sc.root, capo].join('|');
  if (groupsCache.key === key) return groupsCache.groups;
  const long = inst.strings.map((m, s) => s).filter((s) => !startFret(inst, s));
  // Strings from the lowest to the highest. A re-entrant string (the high G
  // of a standard ukulele) is grouped as if it were an octave lower: same
  // note names on the same frets, and groups that follow the neck instead of
  // jumping across it.
  const pitches = long.map((s) => inst.strings[s]);
  for (let i = pitches.length - 2; i >= 0; i--) while (pitches[i] >= pitches[i + 1]) pitches[i] -= 12;
  const order = pitches.map((m, i) => ({ m, s: long[i] }));
  let groups = handGroups(inst, sc, capo, order, inst.fifths ? REACH.short : REACH.long);
  // Long frets: over a fifth of the scale's notes in no group (the whole-tone
  // scale, most scales in drop and open tunings), then a longer reach on a
  // string (REACH.loose), its groups kept if they hold more than one note more
  if (!inst.fifths) {
    const missed = (found) => {
      const held = new Set();
      for (const g of found) for (let q = 0; q < order.length; q++) for (let f = g.A[q]; f <= g.B[q]; f++) held.add(`${q}:${f}`);
      let all = 0;
      let out = 0;
      order.forEach(({ m }, q) => {
        for (let f = capo; f <= inst.frets; f++) if (sc.set.has(mod12(m + f))) { all++; if (!held.has(`${q}:${f}`)) out++; }
      });
      return { all, out };
    };
    const now = missed(groups);
    if (now.out > LOOSE_AFTER * now.all) {
      const loose = handGroups(inst, sc, capo, order, REACH.loose);
      if (now.out - missed(loose).out > 1) groups = loose;
    }
  }
  groups = groups.map((g, id) => ({ id, bars: order.map(({ s }, q) => ({ s, a: g.A[q], b: g.B[q], da: g.DA[q], db: g.DB[q] })) }));
  groupsCache.key = key;
  groupsCache.groups = groups;
  return groups;
}

/* A note's place in the scale, counted in steps from the root's lowest
   octave (rank), and back: a rank's distance from the root in semitones */
const scaleRank = (sc, midi) => {
  const L = sc.def.steps.length;
  const rel = midi - sc.root;
  const d = sc.def.steps.indexOf(mod12(rel));
  return d < 0 ? null : Math.floor(rel / 12) * L + d;
};
const rankSemis = (sc, r) => {
  const L = sc.def.steps.length;
  return 12 * Math.floor(r / L) + sc.def.steps[((r % L) + L) % L];
};

/* How far the hand reaches, in frets from the first note to the last: on
   one string (run), and across a group (group). Long frets (guitar, bass,
   ukulele, banjo): 4 frets on a string, one finger per fret, and 5 for a
   group, 6 with a stretch, never more. Short frets (mandolin, mandola,
   tuned in fifths): 7 frets on a string and for a group, 8 with a
   stretch. Where those leave over a fifth of a scale's notes out of every
   group (LOOSE_AFTER; see scaleGroups), long frets reach 5 frets on a
   string (loose). */
const REACH = { long: { run: 3, group: 4 }, loose: { run: 4, group: 4 }, short: { run: 6, group: 6 } };
const LOOSE_AFTER = 0.2;
/* What a note left out of every group costs (below the first group, above
   the last, or between two). More than a stretch: a group that can be
   played there is shown. */
const MISS_COST = 4;
/* What a group whose strings don't all share a fret with the next costs,
   each such string: compact groups first, where they can be played */
const FOLD_COST = 1.5;
const fewer = (x, y) => {   // compare two costs, most important first
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i];
  return false;
};
/* First every group the hand can play: from each note of the lowest string,
   every way to split the run up the strings (2 notes or more on a string,
   each string's notes within reach, the whole within a stretch). A string
   that shares no fret with the one before (FOLD_COST: compact groups
   first) has its outline stretched to meet it, within a string's reach
   (bridge): one outline, round a note or two not in it. Then the groups to
   show, by dynamic programming from the nut up, each one starting on a
   fret higher up than the one before, no lower on any string, sharing less
   than 3/4 of its notes with it (starting inside it on every string, on
   its last note at best, or on the note right after it, unless leaving
   notes out costs less than the groups that would take them in). Costs
   compared most important first:
   - together: notes left out of every group (MISS_COST); groups wider than
     the reach, 2 (twice a cube of the frets too many); strings sharing no
     fret with the one before (FOLD_COST); and notes a group passes over (a scale note inside its
     frets, on a string, that it leaves out though it would go on with it),
     2 each; a group wider than the tightest one starting on the same note,
     0.75 a fret; and neighbours that share no note on a string, 0.3 a
     string (so a group stays tight rather than share a note with the one
     before on 2 strings, but is not dropped to save a fret)
   - neighbours that share no note on a string
   - the fewest groups (the most ground covered by each move of the hand)
   - the most compact groups. */
function handGroups(inst, sc, capo, order, reach) {
  const n = order.length;
  const N = inst.frets;
  // Each string's playable ranks, from the capo to the last fret
  const lo = [];
  const hi = [];
  for (const { m } of order) {
    let a = Infinity;
    let b = -Infinity;
    for (let f = capo; f <= N; f++) {
      const r = scaleRank(sc, m + f);
      if (r !== null) { a = Math.min(a, r); b = Math.max(b, r); }
    }
    lo.push(a);
    hi.push(b);
  }
  if (lo.some((a, q) => a > hi[q])) return [];
  const fret = (q, r) => rankSemis(sc, r) + sc.root - order[q].m;
  const fret1 = (f) => Math.max(f, capo + 1);   // the nut (or capo) column counts as fret 1
  // Notes the hand passes over: on a string, a scale note inside the group's
  // frets (low to high) but not in the group (a to b), and lower or higher
  // than all of its notes (first to last: one the group would naturally go
  // on with; a note it already plays on another string is fine)
  const passedOver = (A, B, low, high, first, last) => {
    let passed = 0;
    for (let q = 0; q < n; q++) {
      for (let f = low; f <= high; f++) {
        if (f >= A[q] && f <= B[q]) continue;
        const k = scaleRank(sc, order[q].m + f);
        if (k !== null && (k < first || k > last)) passed++;
      }
    }
    return passed;
  };
  // Two strings side by side in a group (q and the one before), the
  // second's notes from fret a to b, the first's outline from pa to pb:
  // their outlines, made to share a fret where the notes don't (the
  // second's stretched towards the first, else the first's towards the
  // second), no outline over more frets than a string's notes may be
  // (reach.run), nor round a scale note the group does not play there (it
  // would look played on that string); null: they can't be. Returns [the
  // first's from, to, the second's from, to, 1 if stretched].
  const bare = (q, x, y) => { for (let f = x; f <= y; f++) if (scaleRank(sc, order[q].m + f) !== null) return false; return true; };
  const bridge = (q, pa, pb, a, b) => {
    if (b >= pa && a <= pb) return [pa, pb, a, b, 0];
    const fits = (x, y) => y - fret1(x) <= reach.run;
    if (b < pa) {
      if (fits(a, pa) && bare(q, b + 1, pa)) return [pa, pb, a, pa, 1];
      if (fits(b, pb) && bare(q - 1, b, pa - 1)) return [b, pb, a, b, 1];
    } else {
      if (fits(pb, b) && bare(q, pb, a - 1)) return [pa, pb, pb, b, 1];
      if (fits(pa, a) && bare(q - 1, pb + 1, a)) return [pa, a, a, b, 1];
    }
    return null;
  };
  // What a group itself costs: 2 for one fret too wide (see the costs
  // above), 2 for each note passed over
  const groupCost = (span, passed) => 2 * Math.max(0, span - reach.group) ** 3 + 2 * passed;

  // The groups, with at least minLen notes a string and no wider than
  // stretch frets
  const solve = (minLen, stretch) => {
    const cands = [];
    const S = new Array(n);   // first rank on each string
    const A = new Array(n);   // first fret on each string
    const B = new Array(n);   // last fret on each string
    const DA = new Array(n);  // the outline's first fret on each string (see bridge)
    const DB = new Array(n);  // and its last
    // Runs on string q from rank r on; low and high: the group's frets so far
    // (fretted notes only); folds: strings sharing no fret with the one before
    const walk = (q, r, low, high, folds) => {
      if (q === n) {
        const E = S.map((x, i) => (i + 1 < n ? S[i + 1] : r) - 1);   // last rank on each string
        const span = high - low;
        const cost = groupCost(span, passedOver(A, B, low, high, S[0], E[n - 1])) + FOLD_COST * folds;
        cands.push({ S: S.slice(), E, A: A.slice(), B: B.slice(), DA: DA.slice(), DB: DB.slice(), cost, span, low });
        return;
      }
      if (r < lo[q] || r > hi[q]) return;
      const a = fret(q, r);
      for (let len = minLen; r + len - 1 <= hi[q]; len++) {
        if (len - (a <= capo ? 1 : 0) > MAX_FINGERS) break;   // (a finger a fretted note; the open string needs none)
        const b = fret(q, r + len - 1);
        const from = fret1(a);
        if (b - from > reach.run) break;
        const l2 = Math.min(low, from);
        const h2 = Math.max(high, b);
        if (h2 - l2 > stretch) { if (b > high) break; continue; }
        const was = q ? [DA[q - 1], DB[q - 1]] : null;
        const join = q ? bridge(q, DA[q - 1], DB[q - 1], a, b) : [0, 0, a, b, 0];
        if (!join) continue;
        S[q] = r;
        A[q] = a;
        B[q] = b;
        if (q) [DA[q - 1], DB[q - 1]] = [join[0], join[1]];
        [DA[q], DB[q]] = [join[2], join[3]];
        walk(q + 1, r + len, l2, h2, folds + join[4]);
        if (q) [DA[q - 1], DB[q - 1]] = was;
      }
    };
    for (let r = lo[0]; r <= hi[0]; r++) walk(0, r, Infinity, -Infinity, 0);
    // The open position as players know it: every scale note from the nut
    // (or the capo) to the 4th fret, on every string, taking in the open
    // strings a straight run would leave out (D major pentatonic on guitar:
    // 0,2 | 0,2 | 0,2,4 | 2 | 0,3 | 0,2). It skips no note, and plays none
    // twice: where two strings are a third apart (a guitar's G and B), the
    // lower one's last note is the next one's first, kept on one string only.
    // Taken off the string that still plays two notes or more without it
    // (the other one, if only one does), else off the fretted one: the open
    // string stays (else off the lower string). A string so left with one
    // note is the open position's only one.
    const box = { S: [], E: [], A: [], B: [], DA: [], DB: [] };
    let boxFolds = 0;
    let ok = true;
    const notes = order.map(({ m }) => {   // each string's scale notes there, low to high: { r: rank, f: fret }
      const out = [];
      for (let f = capo; f <= Math.min(capo + 4, N); f++) {
        const r = scaleRank(sc, m + f);
        if (r !== null) out.push({ r, f });
      }
      return out;
    });
    const trimmed = notes.map(() => false);
    for (let q = 1; q < n; q++) {
      const below = notes[q - 1];
      const here = notes[q];
      while (below.length && here.length && here[0].r <= below[below.length - 1].r) {
        const spare = (list) => list.length - 1 >= minLen;
        const open = (note) => note.f <= capo;
        const offBelow = spare(below) !== spare(here) ? spare(below)
          : open(below[below.length - 1]) === open(here[0]) || open(here[0]);
        if (offBelow) { below.pop(); trimmed[q - 1] = true; } else { here.shift(); trimmed[q] = true; }
      }
    }
    for (let q = 0; q < n && ok; q++) {
      const ranks = notes[q].map((x) => x.r);
      const frets = notes[q].map((x) => x.f);
      ok = ranks.length >= (trimmed[q] ? 1 : minLen) && ranks.length > 0;
      if (!ok) break;
      if (q && ranks[0] > box.E[q - 1] + 1) ok = false;   // a note skipped
      const [a, b] = [frets[0], frets[frets.length - 1]];
      const join = q ? bridge(q, box.DA[q - 1], box.DB[q - 1], a, b) : [0, 0, a, b, 0];
      if (!join) { ok = false; break; }
      if (q) [box.DA[q - 1], box.DB[q - 1]] = [join[0], join[1]];
      boxFolds += join[4];
      box.S.push(ranks[0]);
      box.E.push(ranks[ranks.length - 1]);
      box.A.push(a);
      box.B.push(b);
      box.DA.push(join[2]);
      box.DB.push(join[3]);
    }
    if (ok) {
      const low = Math.min(...box.A.map(fret1));
      const high = Math.max(...box.B);
      const span = high - low;
      if (span <= stretch) cands.push({ ...box, cost: groupCost(span, 0) + FOLD_COST * boxFolds, span, low });
    }
    if (!cands.length) return [];
    for (const g of cands) g.size = g.S.reduce((k, x, q) => k + g.E[q] - x + 1, 0);   // its notes
    cands.sort((g, h) => g.S[0] - h.S[0] || g.low - h.low);   // in order of their first note, then of their first fret
    // A group wider than the tightest one starting on the same note: 0.75 for
    // each fret more (banjo G minor at fret 17: frets 17 to 20, not 16 to 20)
    const tightest = new Map();
    for (const g of cands) tightest.set(g.S[0], Math.min(tightest.get(g.S[0]) ?? Infinity, g.span));
    for (const g of cands) g.cost += 0.75 * (g.span - tightest.get(g.S[0]));

    // Groups in order of their first note: the best way to reach each one
    // from the nut, through groups lower on the neck
    // What the notes left out between the ends of the group before and g cost
    const left = (g, ends) => {
      let k = 0;
      for (let q = 0; q < n; q++) for (let r = ends[q] + 1; r < g.S[q]; r++) k += MISS_COST;
      return k;
    };
    const best = cands.map((g) => ({ cost: [left(g, lo.map((a) => a - 1)) + g.cost, 0, 1, g.span], prev: -1 }));
    const back = 2 * (reach.run + 2);   // how far back (in ranks of the lowest string) the group before can start
    let from = 0;
    for (let j = 0; j < cands.length; j++) {
      const g = cands[j];
      while (cands[from].S[0] < g.S[0] - back) from++;
      for (let i = from; i < j; i++) {
        const p = cands[i];
        // g starts on a fret higher up, goes no lower on any string, and
        // shares less than 3/4 of its notes with p (or of p's)
        let up = g.low > p.low;
        let apart = 0;   // strings where they share no note
        let shared = 0;
        for (let q = 0; q < n && up; q++) {
          up = g.S[q] >= p.S[q] && g.E[q] >= p.E[q];
          if (g.S[q] > p.E[q]) apart++;
          shared += Math.max(0, Math.min(g.E[q], p.E[q]) - Math.max(g.S[q], p.S[q]) + 1);
        }
        if (!up || shared >= 0.75 * Math.min(g.size, p.size)) continue;
        const c = best[i].cost;
        const cost = [c[0] + left(g, p.E) + g.cost + 0.3 * apart, c[1] + apart, c[2] + 1, c[3] + g.span];
        if (fewer(cost, best[j].cost)) best[j] = { cost, prev: i };
      }
    }
    // The last group: the best once the notes above it are counted
    let last = -1;
    let lastCost = null;
    cands.forEach((g, j) => {
      const c = best[j].cost;
      const top = { S: hi.map((b) => b + 1) };
      const cost = [c[0] + left(top, g.E), ...c.slice(1)];
      if (!lastCost || fewer(cost, lastCost)) { lastCost = cost; last = j; }
    });
    const out = [];
    for (let j = last; j >= 0; j = best[j].prev) out.unshift(cands[j]);
    return out;
  };

  // A scale with a gap too wide for two notes on a string within reach gets
  // single notes there
  const L = sc.def.steps.length;
  let minLen = 2;
  for (let i = 0; i < L; i++) if (rankSemis(sc, i + 1) - rankSemis(sc, i) > reach.run) minLen = 1;
  // Some scales and tunings leave no straight run within a stretch over most
  // of the neck (the whole-tone scale on guitar, open C): then single notes
  // on a string too, if groups then cover more of it
  const all = lo.reduce((k, a, q) => k + hi[q] - a + 1, 0);
  const covered = (groups) => {
    const notes = new Set();
    for (const g of groups) for (let q = 0; q < n; q++) for (let r = g.S[q]; r <= g.E[q]; r++) notes.add(`${q}:${r}`);
    return notes.size;
  };
  let groups = [];
  let most = -1;
  for (const [len, stretch] of [[minLen, reach.group + 1], [1, reach.group + 1]]) {
    const found = solve(len, stretch);
    const k = covered(found);
    if (k > most) { groups = found; most = k; }
    if (most >= 0.6 * all) break;
  }
  return groups;   // (the frets of each string's notes, A to B, and of its outline, DA to DB)
}

function renderNeck(ch, sc) {
  const inst = instrument();
  if (inst.piano) { renderPiano(ch, sc); return; }
  els.neck.className = 'neck';
  els.neck.setAttribute('aria-label', 'Fretboard notes');
  const n = inst.strings.length;
  const N = inst.frets;
  const c = capo();
  const offKey = offKeyTest(sc);   // chord notes outside the scale
  // Phones: vertical neck. Row 1 holds the string numbers, then the open
  // strings, then one row per fret; the lowest string is on the left.
  // Wide screens: horizontal neck. Row 1 holds the fret numbers, then one row
  // per string with the highest string on top (as in tab).
  const vertical = !isWide();
  // The capo covers the strings that run from the nut (all but a banjo's
  // drone, which sits first); `nut` is where each string starts ringing
  const short = inst.strings.filter((m, s) => startFret(inst, s)).length;
  const nut = (s) => startFret(inst, s) + c;
  let cellAt, rulerAt, labelAt, capoAt;
  if (vertical) {
    els.neck.style.gridTemplateColumns = `var(--label-w) repeat(${n}, minmax(0, 1fr))`;
    els.neck.closest('.neck-panel').style.setProperty('--strings', n);   // (the panel no wider than its strings need, styles.css)
    cellAt = (s, f) => `grid-row:${f + 2};grid-column:${s + 2}`;
    rulerAt = (f) => `grid-row:${f + 2};grid-column:1`;
    labelAt = (s) => `grid-row:1;grid-column:${s + 2}`;
    capoAt = `grid-row:${c + 2};grid-column:${short + 2} / span ${n - short}`;
  } else {
    els.neck.style.gridTemplateColumns = `var(--label-w) var(--open-w) repeat(${N}, minmax(var(--cell-min, var(--cell-w)), 1fr))`;   // (--cell-min: see fitScroll)
    cellAt = (s, f) => `grid-row:${n - s + 1};grid-column:${f + 2}`;
    rulerAt = (f) => `grid-row:1;grid-column:${f + 2}`;
    labelAt = (s) => `grid-row:${n - s + 1};grid-column:1`;
    capoAt = `grid-row:2 / span ${n - short};grid-column:${c + 2}`;
  }
  // Vertical: the open-string row is 3px taller, since the nut is 3px thicker
  // than a fret wire; its notes get as much room as any other
  els.neck.style.gridTemplateRows = vertical ? 'var(--ruler-row) calc(var(--row-h) + 3px)' : 'var(--ruler-row)';
  els.neck.style.gridAutoRows = 'var(--row-h)';
  els.neck.style.setProperty('--strings', n);   // (the strip's grid, see styles.css)
  els.neck.classList.toggle('vertical', vertical);
  els.neck.classList.toggle('horizontal', !vertical);
  els.neck.classList.toggle('octaves', state.octaves);
  // Left-handed: the neck is mirrored by laying its grid out right to left
  // (styles.css), so nothing here changes; the scroller starts at the nut
  els.neck.parentElement.classList.toggle('lefty', state.leftHanded);

  // Shape frets count from the capo; place them at their real fret
  const shapeAt = new Map();
  if (ch && ch.shape) {
    const pitches = ch.shape.frets.map((f, s) => (f >= 0 ? shapePitch(inst, s, f) + c : Infinity));
    const low = Math.min(...pitches);
    ch.shape.frets.forEach((f, s) => {
      if (f >= 0) shapeAt.set(`${s}:${shapeNeckFret(inst, s, f, c)}`, shapeDegree(ch, pitches[s], low));
    });
  }
  const ghosts = ch && !ch.naming && (state.allTones || !ch.shape);   // (naming: only the notes placed)
  // Notes outside the key: as the key writes them, else flats if asked for or
  // if the tuning is written in flats (E♭ standard)
  // (notes named: as the scale's key leans, else the chord's; neither, or
  // no name picked yet in Name a chord: the Flats setting, or a flat tuning's)
  const keyFlats = sc ? sc.spell.flats : ch && ch.spell.flats !== undefined ? ch.spell.flats : state.flats || Boolean(inst.tuning && inst.tuning.flats);
  // (behind a capo named from, see nameShift: as they sound, since nothing
  // there is played above it, as the tuning names the strings; sharps or
  // flats as the key that sounds leans)
  const shift = nameShift();
  const soundFlats = !shift ? keyFlats : atShift(0, () => (sc ? scaleSpelling(sc.root, sc.def).flats
    : state.chord.on && !naming ? chordSpelling(state.chord.root, findChord(state.chord.type), letterOf(state.chord)).flats : keyFlats));
  const onlyScale = Boolean(sc && state.scaleOnly);
  const groups = sc && state.scaleGroups ? scaleGroups(inst, sc, c) : [];
  // Another instrument (or the capo taken off, see its picker): back to the
  // first group. Anything else (another scale root or type, tuning, another
  // capo, Groups switched off and on): the
  // group at the place picked, or the nearest one (pickGroup).
  if (ui.groupInst !== state.instrument) {
    ui.groupInst = state.instrument;
    ui.groupAt = null;
  }
  ui.groups = groups;
  ui.group = pickGroup(groups);
  // The group shown: its cells (string:fret); every other note but the
  // chord's a little dimmer
  const grouped = new Set();
  for (const { s, a, b } of groups[ui.group] ? groups[ui.group].bars : []) for (let f = a; f <= b; f++) grouped.add(`${s}:${f}`);

  // One octave number per shaded band, on its first cell you can play: the
  // lowest-listed string in the band, at its lowest fret not behind the capo
  // (open strings included; a band wholly behind the capo keeps it on its
  // first cell, faded with it). That is the bottom-left of the band on the
  // horizontal neck and its top-left on the vertical one. An octave can make
  // two separate bands (a ukulele's high G, a banjo's drone): each gets its
  // number. C4 = middle C, as on the piano. (Named from a capo: as the
  // notes are, played above it, see nameShift.)
  const octaveOf = (s, f) => Math.floor((fretPitch(inst, s, f) - (f < nut(s) ? 0 : shift)) / 12) - 1;
  const octaveLabels = new Set();
  if (state.octaves) {
    // Scanning string by string, fret by fret, the first cell met of a band
    // starts it: gather the whole band (cells of the same octave touching
    // along a string or across to the next string), then label it
    const seen = new Set();
    const onNeck = (s, f) => s >= 0 && s < n && f >= startFret(inst, s) && f <= N;
    const before = (x, y) => x[0] - y[0] || x[1] - y[1];   // string, then fret
    inst.strings.forEach((open, s) => {
      for (let f = startFret(inst, s); f <= N; f++) {
        if (seen.has(`${s}:${f}`)) continue;
        const o = octaveOf(s, f);
        const band = [[s, f]];
        seen.add(`${s}:${f}`);
        for (let i = 0; i < band.length; i++) {
          const [a, g] = band[i];
          for (const [x, y] of [[a, g - 1], [a, g + 1], [a - 1, g], [a + 1, g]]) {
            if (!onNeck(x, y) || seen.has(`${x}:${y}`) || octaveOf(x, y) !== o) continue;
            seen.add(`${x}:${y}`);
            band.push([x, y]);
          }
        }
        const playable = band.filter(([x, y]) => y >= nut(x)).sort(before);
        const [ls, lf] = playable.length ? playable[0] : [s, f];
        octaveLabels.add(`${ls}:${lf}`);
      }
    });
  }

  const html = [];
  const starts = [];   // each string's first cell (the nut, the capo, a drone's start or spike), for the strip
  const singleDots = inst.dots ? inst.dots.single : SINGLE_DOTS;
  const doubleDots = inst.dots ? inst.dots.double : DOUBLE_DOTS;
  // Fret numbers. With a capo they count from it, like everything else
  // (chord shapes, their tab, scale groups, a note's place): the capo's fret
  // says "Capo" (the horizontal neck; on the vertical one its bar shows it),
  // the frets behind it have no number. The inlay dots stay where they are
  // on the neck.
  for (let f = 1; f <= N; f++) {
    const dots = doubleDots.includes(f) ? 2 : singleDots.includes(f) ? 1 : 0;
    const marks = '<i></i>'.repeat(dots);
    const label = f < c ? marks : f === c ? (vertical ? '' : 'Capo') : `${f - c}${marks}`;
    const title = f === c ? ` title="Capo on fret ${f}"` : '';
    html.push(`<div class="ruler${dots ? ' mark' : ''}${f === c ? ' capo' : f < c ? ' behind' : ''}" style="${rulerAt(f)}"${title}>${label}</div>`);
  }

  inst.strings.forEach((open, s) => {
    const sw = Math.min(3.2, Math.max(1, (72 - open) / 10)).toFixed(1);
    const num = stringNumber(s);
    const start = startFret(inst, s);
    const stop = start ? 'spike' : 'capo';   // what holds the string down past its start
    // A short string's number sits just before where it starts, as the
    // others sit just before the nut
    html.push(start
      ? `<div class="slabel short" style="${cellAt(s, start - 1)}" title="String ${num}">${num}</div>`
      : `<div class="slabel" style="${labelAt(s)}" title="String ${num}">${num}</div>`);
    for (let f = 0; f <= N; f++) {
      const mark = singleDots.includes(f) || doubleDots.includes(f);
      // Before a short string starts there is no fingerboard: nothing to show
      if (f < start) {
        html.push(`<div class="cell no-string" data-s="${s}" data-f="${f}" style="${cellAt(s, f)}" aria-hidden="true"></div>`);
        continue;
      }
      const midi = fretPitch(inst, s, f);
      const pc = mod12(midi);
      const key = `${s}:${f}`;
      // Where it is played: its fret counted from the capo (a banjo's
      // drone: from its spike), or open; behind the capo, only its string
      const where = f < nut(s) ? `string ${num}` : f > nut(s) ? `string ${num}, fret ${f - c}`
        : `string ${num}, ${c ? `at the ${stop}` : 'open'}`;
      // Each pill is spelled by its role: chord notes as in the chord, scale
      // notes as in the scale, other notes in the key's direction
      let cls = 'note';
      const behind = f < nut(s);
      let n = behind ? plainNote(pc, soundFlats) : freeNote(pc, keyFlats);
      let deg = null;
      let badge = '';   // chord notes: interval in a small corner badge, note name in the pill

      if (f < nut(s)) {
        cls += ' plain';   // behind the capo: shown for reference, but cannot be played
      } else if (f === nut(s) && ch && ch.shape && ch.shape.frets[s] < 0) {
        // A string the shape does not play: its open note, with a pink ×
        // badge where a chord note has its interval (with "Only scale
        // notes" too: it says which string, not a note to play); quiet,
        // or as a scale note when the scale shown has it. With All chord
        // tones, a chord tone there shows as the others do (its × amber,
        // as their intervals, when the scale shown does not have it)
        const tone = ghosts && ch.degOfPc.has(pc);
        if (tone) deg = ch.degOfPc.get(pc);
        cls += ` mute named${tone ? ` ghost${deg === 'R' ? ' root' : ''}${offKey(pc) ? ' off-key' : ''}`
          : sc && sc.set.has(pc) ? ` scale${pc === sc.root ? ' scale-root' : ''}` : ''}`;
        // (named by the role it shows: a chord tone as the chord, else a
        // scale note as the scale, else as any other note; not the chord's
        // F♭ for a C major scale's E, All chord tones off)
        n = (tone && ch.spell.names.get(pc)) || (sc && sc.set.has(pc) && sc.spell.names.get(pc)) || n;
      } else if (shapeAt.has(key) || (ghosts && ch.degOfPc.has(pc))) {
        deg = shapeAt.has(key) ? shapeAt.get(key) : ch.degOfPc.get(pc);
        cls += `${shapeAt.has(key) ? ' chord' : ' ghost'}${deg === 'R' ? ' root' : ''}${offKey(pc) ? ' off-key' : ''}`;
        badge = deg ? fmtDeg(deg) : '';   // (naming: no interval before a name)
        n = ch.spell.names.get(pc) || n;
      } else if (sc && sc.set.has(pc)) {
        cls += ` scale${pc === sc.root ? ' scale-root' : ''}`;
        n = sc.spell.names.get(pc) || n;
      } else {
        // off: shown, but not in the scale; out: hidden ("Only scale notes"),
        // except an open string's note (at the nut, the capo or a banjo's
        // spike): the strings' notes are always shown
        cls += onlyScale && f !== nut(s) ? ' plain out' : sc ? ' plain off' : ' plain';
      }
      // (the chord's own notes never; a note not in the scale is never one of
      // the group's, even within its outline; a string the shape does not
      // play: its note, not its ×, see .ungrouped)
      if (grouped.size && !/ (chord|ghost)\b/.test(cls) && (cls.includes(' scale') ? !grouped.has(key) : cls.includes(' off') || cls.includes(' named'))) cls += ' ungrouped';
      const text = noteText(n);
      let title = `${behind ? pitchText(midi, n) : pitchName(midi, n)}${deg ? ` (${degreeName(deg)})` : ''}, ${where}`;
      if (cls.includes(' off-key')) title += `, not in ${scaleInText(sc)}`;
      if (f < nut(s)) title += `, behind the ${stop}`;
      if (cls.includes(' mute')) {
        title = cls.includes(' named') ? `${pitchName(midi, n)}${deg ? ` (${degreeName(deg)})` : ''}, ${where}, not played` : `String ${num} not played`;
        if (cls.includes(' off-key')) title += `, not in ${scaleInText(sc)}`;
      }
      const octave = octaveOf(s, f);
      const cellCls = `cell ${f === 0 ? 'open' : 'fret'}${mark ? ' mark' : ''}${octave % 2 ? ' o-alt' : ''}` +
        `${f < nut(s) ? ' behind' : ''}${c && f === nut(s) ? ' capo' : ''}${start && f === start ? ' string-start' : ''}${f === N ? ' end' : ''}`;
      const inner = cls.includes(' mute') && !cls.includes(' named') ? MUTE_ICON : tx(text);
      if (cls.includes(' named')) badge = MUTE_BADGE;
      const octTag = octaveLabels.has(key) ? `<span class="oct" title="Octave ${octave}">${tx(String(octave))}</span>` : '';
      const pill = `<span class="${cls}" title="${esc(title)}">${inner}` +
        `${badge === MUTE_BADGE ? `<span class="deg-badge mute-badge" aria-hidden="true">${MUTE_ICON}</span>`
          : badge ? `<span class="deg-badge" aria-hidden="true">${tx(badge)}</span>` : ''}</span>`;
      html.push(`<div class="${cellCls}" role="gridcell" data-s="${s}" data-f="${f}" style="${cellAt(s, f)};--sw:${sw}px">${octTag}${pill}</div>`);
      if (f === nut(s)) starts.push({ s, f, cellCls, sw, pill, num, octTag });
    }
  });
  // The capo clamps all strings just behind its fret wire (a banjo's drone:
  // a spike holds it down the same number of frets past its start)
  if (c) {
    html.push(`<div class="capo-bar" style="${capoAt}" ` +
      `title="Place the capo here, just behind fret ${c}" aria-hidden="true"></div>`);
    inst.strings.forEach((m, s) => {
      if (startFret(inst, s)) html.push(`<div class="capo-bar spike" style="${cellAt(s, nut(s))}" aria-hidden="true"></div>`);
    });
  }
  // Barres: a pink band behind the notes the finger lies across (a drone
  // ringing beside the shape does not stop a barre)
  if (ch && ch.shape) {
    const fretted = ch.shape.frets.map((f, s) => (startFret(inst, s) ? -1 : f));
    for (const { fret, from, to } of barresFor(fretted)) {
      const at = vertical ? `grid-row:${fret + c + 2};grid-column:${from + 2} / ${to + 3}`
        : `grid-column:${fret + c + 2};grid-row:${n - to + 1} / ${n - from + 2}`;
      html.push(`<div class="barre" style="${at};--k:${to - from + 1}" aria-hidden="true"><i></i></div>`);
    }
  }
  html.push('<svg class="group-layer" aria-hidden="true"></svg>');
  html.push(stripHtml(vertical, n, c, short, starts));
  els.neck.innerHTML = html.join('');
  drawGroups();
  fitScroll();
  placeStrip();
}

/* A keyboard (the piano, the Uniso): its keys, low to high (phones: from
   the top down, the keys' fronts on the left, the octave numbers on the
   right; wide screens: from left to right, the octave numbers above). Each
   key's note is a pill as on the neck: on a white key in the part in front
   of the black keys, on a black key near its front. Sizes and places are
   in styles.css, from each key's place among the white keys (--i: a white
   key's own, a black key's the white key it starts on), the same shapes on
   both keyboards (a black key as narrow and short, for its white keys),
   the Uniso's keys a little wider on wide screens (for a note inside a
   black key): its black keys one between each two white keys, its C and F
   keys grey (.marked), as its own are. The octave's number sits by its C. */
const BLACK_PCS = new Set([1, 3, 6, 8, 10]);
const keysText = (inst) => `${inst.keys} keys, ${[inst.low, inst.low + inst.keys - 1].map((m) => pitchText(m, plainNote(m))).join(' to ')}`;   // ("88 keys, A0 to C8")
function renderPiano(ch, sc) {
  const inst = instrument();
  const vertical = !isWide();
  const isBlack = (pc) => (inst.wholeTone ? pc % 2 === 1 : BLACK_PCS.has(pc));
  els.neck.className = `neck piano${inst.wholeTone ? ' whole-tone' : ''} ${vertical ? 'vertical' : 'horizontal'}`;
  els.neck.removeAttribute('style');   // (the neck's grid)
  els.neck.setAttribute('aria-label', `${inst.name} keys`);
  els.neck.parentElement.classList.remove('lefty');   // (a piano is not mirrored)
  // Its scale groups (Groups on): an octave each, picked as a neck's (see
  // pickGroup); the one picked marked by a bar over its keys' far ends,
  // over its keys only, not a black key just past either end (.group-bar),
  // no note dimmer
  if (ui.groupInst !== state.instrument) {
    ui.groupInst = state.instrument;
    ui.groupAt = null;
  }
  ui.groups = sc && state.scaleGroups && sc.def.steps.length < 12 ? keyboardGroups(inst, sc) : [];
  ui.group = pickGroup(ui.groups);
  const range = ui.groups[ui.group] ? ui.groups[ui.group].keys : null;
  const offKey = offKeyTest(sc);
  const onlyScale = Boolean(sc && state.scaleOnly);
  const keyFlats = sc ? sc.spell.flats : ch && ch.spell.flats !== undefined ? ch.spell.flats : state.flats;   // (as the neck's)
  const played = new Set(ch && ch.shape ? ch.shape.frets : []);
  const ghosts = ch && !ch.naming && (state.allTones || !ch.shape);
  const html = [];
  let white = 0;
  let pending = '';
  let barFrom = '';
  let barTo = '';
  for (let k = 0; k < inst.keys; k++) {
    const midi = inst.low + k;
    const pc = mod12(midi);
    const black = isBlack(pc);
    const octave = Math.floor(midi / 12) - 1;
    if (pc === 0) html.push(`<span class="oct-label${octave === 4 ? ' mid' : ''}${k === 0 ? ' first' : ''}${k === inst.keys - 1 ? ' last' : ''}" style="--i:${white}" title="Octave ${octave}${octave === 4 ? ', middle C' : ''}">${tx(String(octave))}${octave === 4 ? '<i></i>' : ''}</span>`);   // (middle C's: a dot by it, as an inlay fret's number)   // (at each C: the piano's few keys of octave 0 go without)
    let cls = 'note';
    let n = plainNote(pc, keyFlats);
    let deg = null;
    if (played.has(k) || (ghosts && ch.degOfPc.has(pc))) {
      deg = played.has(k) ? shapeDegree(ch, midi, inst.low + Math.min(...played)) : ch.degOfPc.get(pc);
      cls += `${played.has(k) ? ' chord' : ' ghost'}${deg === 'R' ? ' root' : ''}${offKey(pc) ? ' off-key' : ''}`;
      n = ch.spell.names.get(pc) || n;
    } else if (sc && sc.set.has(pc)) {
      cls += ` scale${pc === sc.root ? ' scale-root' : ''}`;
      n = sc.spell.names.get(pc) || n;
    } else {
      cls += onlyScale ? ' plain out' : sc ? ' plain off' : ' plain';
    }
    // (the group's bar: from where its first key starts to where its last
    // ends, at their far ends: a black key's sides; a white key's far end
    // stops at the black key beside it, which is not in the group)
    const blackBeside = (d) => k + d >= 0 && k + d < inst.keys && isBlack(mod12(midi + d));
    if (range && k === range[0]) barFrom = black ? `calc(${white} * var(--wk) - var(--bk) / 2)` : `calc(${white} * var(--wk)${blackBeside(-1) ? ' + var(--bk) / 2' : ''})`;
    if (range && k === range[1]) barTo = black ? `calc(${white} * var(--wk) + var(--bk) / 2)` : `calc(${white + 1} * var(--wk)${blackBeside(1) ? ' - var(--bk) / 2' : ''})`;
    let title = `${pitchText(midi, n)}${deg ? ` (${degreeName(deg)})` : ''}, key ${k + 1}`;
    if (cls.includes(' off-key')) title += `, not in ${scaleInText(sc)}`;
    const badge = deg ? `<span class="deg-badge" aria-hidden="true">${tx(fmtDeg(deg))}</span>` : '';
    const key = `<div class="key ${black ? 'black' : 'white'}${inst.wholeTone && (pc === 0 || pc === 5) ? ' marked' : ''}" data-key="${k}" style="--i:${white}">` +
      `<span class="${cls}" title="${esc(title)}">${tx(noteText(n))}${badge}</span></div>`;
    // A black key comes after the white key above it, so it lies over both
    // its white keys with no stacking of its own (which would hold its
    // badge under the next black key's note)
    if (black) pending = key;
    else {
      html.push(key, pending);
      pending = '';
      white++;
    }
  }
  if (range) html.push(`<span class="group-bar" style="--from:${barFrom};--to:${barTo}" aria-hidden="true"></span>`);
  els.neck.style.setProperty('--whites', white);
  els.neck.innerHTML = html.join('');
  fitScroll();
}

/* Wide screens: a neck (or keyboard) only a little wider than its panel
   would scroll a few pixels, which looks like a mistake. It is made wider
   then, its frets (or white keys) a little wider, the notes as they are,
   to scroll at least SCROLL_MIN: a scroll that shows something. Measured
   at its own width first (each fret at least --cell-w, each white key
   36px, the Uniso's 46px), from the frets' (keys') widths as they are,
   whatever makes it scroll. On every draw and whenever the neck or its panel changes size. */
const SCROLL_MIN = 102;   // px: two frets (2 × --cell-w)
function fitScroll() {
  const neck = els.neck;
  const scroller = neck.parentElement;
  neck.style.removeProperty('--cell-min');
  neck.style.removeProperty('--wk-min');
  if (!neck.classList.contains('horizontal')) return;
  const over = scroller.scrollWidth - scroller.clientWidth;
  if (over <= 0 || over >= SCROLL_MIN) return;
  if (neck.classList.contains('piano')) {
    const whites = neck.querySelectorAll('.key.white');
    const wk = whites[0].getBoundingClientRect().width;
    neck.style.setProperty('--wk-min', `${wk + (SCROLL_MIN - over) / whites.length}px`);
  } else {
    const cells = neck.querySelectorAll('.cell.fret:not(.strip-cell)');
    const last = cells[cells.length - 1];   // (the last fret's: its number, the frets' count; 1fr each, so all as wide)
    if (!last) return;
    const cell = last.getBoundingClientRect().width;
    neck.style.setProperty('--cell-min', `${cell + (SCROLL_MIN - over) / Number(last.dataset.f)}px`);
  }
}


/* The strip: each string's first cell (its open note at the nut, or at the
   capo, a banjo's drone at its start or its spike), as on the neck, with
   the chord's ✕ or open mark, held at the edge of the view once the neck
   has scrolled past it: phones, at the top of the screen as the page
   scrolls down; wide screens, at the nut's end of the neck as it scrolls
   sideways. It is drawn over the neck (its notes, barres, capo and group
   outlines pass under it), is tapped as the neck is, and stays within the
   neck. Where a string's first cell has not reached it yet (a drone
   starting at the 5th fret), the neck shows through. Not a copy that
   speaks: the neck's own cells do (aria-hidden). */
function stripHtml(vertical, n, c, short, starts) {
  // Phones: row 1 is room above the notes (for their badges), row 2 the
  // cells; wide screens: row 1 is the fret numbers' row, then one per string
  const at = (s, col) => (vertical ? `grid-row:2;grid-column:${s + 2}` : `grid-row:${n - s + 1};grid-column:${col}`);
  const under = (s) => (vertical ? `grid-row:1 / 3;grid-column:${s + 2}` : `grid-row:${n - s + 1};grid-column:2`);
  // Its background is laid under each string's place (not the whole strip),
  // so the neck shows through a place still waiting
  const parts = [vertical ? '<i class="strip-under" style="grid-row:1 / 3;grid-column:1"></i>'
    : `<i class="strip-under" style="grid-row:1 / span ${n + 1};grid-column:1"></i><i class="strip-under" style="grid-row:1;grid-column:2"></i>`];
  for (const x of starts) {
    parts.push(`<i class="strip-under" data-s="${x.s}" style="${under(x.s)}"></i>`);
    if (!vertical) parts.push(`<div class="slabel" data-s="${x.s}" style="${at(x.s, 1)}">${x.num}</div>`);   // (a drone's: with its cell, its own number beside it until then)
    parts.push(`<div class="${x.cellCls} strip-cell" data-s="${x.s}" data-f="${x.f}" style="${at(x.s, 2)};--sw:${x.sw}px">${x.octTag}${x.pill}</div>`);
  }
  if (c) {   // the capo across the strings from the nut, a spike on a drone
    parts.push(`<div class="capo-bar" style="${vertical ? `grid-row:2;grid-column:${short + 2} / span ${n - short}` : `grid-row:2 / span ${n - short};grid-column:2`}"></div>`);
    for (const x of starts) if (x.s < short) parts.push(`<div class="capo-bar spike" data-s="${x.s}" style="${at(x.s, 2)}"></div>`);
  }
  const place = vertical ? 'grid-row:2;grid-column:1 / -1' : `grid-row:1 / span ${n + 1};grid-column:1 / span 2`;
  return `<div class="neck-strip" aria-hidden="true" style="${place}">${parts.join('')}</div>`;
}
/* A string's place in the strip shows once its first cell on the neck has
   reached it (and goes on under it, out of view): the two are then in the
   same spot, so the note does not jump. Each string on its own (a drone
   starting at the 5th fret comes later); the strip shows with the first. */
function placeStrip() {
  const strip = els.neck.querySelector('.neck-strip');
  if (!strip) return;
  const vertical = els.neck.classList.contains('vertical');
  const lefty = state.leftHanded;
  let any = false;
  for (const cell of strip.querySelectorAll('.strip-cell')) {
    const { s, f } = cell.dataset;
    const real = els.neck.querySelector(`.cell[data-s="${s}"][data-f="${f}"]:not(.strip-cell)`);
    if (!real) continue;
    // (by their nut's edge, the same line for every string in the strip,
    // so a drone's nut or a capo meets the others' exactly)
    const a = real.getBoundingClientRect();
    const b = cell.getBoundingClientRect();
    const past = vertical ? a.bottom < b.bottom - 0.5 : lefty ? a.left > b.left + 0.5 : a.right < b.right - 0.5;
    for (const part of strip.querySelectorAll(`[data-s="${s}"]`)) part.classList.toggle('waiting', !past);   // (its cell, background, number and spike)
    any = any || past;
  }
  strip.classList.toggle('on', any);
}
let stripFrame = 0;
const queueStrip = () => { if (!stripFrame) stripFrame = requestAnimationFrame(() => { stripFrame = 0; placeStrip(); }); };

/* Draw the group picked (ui.groups[ui.group]) in the scale's colour, one
   at a time (the arrows and chips step through them). It is an outline
   measured from the cells on screen: an SVG path that is inset a
   little from the cells and has every corner rounded, inner ones included.
   Redrawn whenever the neck changes size. */
const GROUP_INSET = 2;   // keeps the line clear of a root note's ring
const GROUP_RADIUS = 9;
function drawGroups() {
  const layer = els.neck.querySelector('.group-layer');
  if (!layer) return;
  const group = (ui.groups || [])[ui.group];
  const box = els.neck.getBoundingClientRect();
  // (as big as the neck by its style, never a fraction of a pixel past it: no
  // scroll of its own, see fitScroll)
  layer.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
  if (!group) { layer.innerHTML = ''; return; }

  const vertical = els.neck.classList.contains('vertical');
  // Work in (u, v): u runs along the strings (towards the body), v across them.
  // Along u, a cell is measured without its fret wire or nut (a border) and
  // the capo's padding: the note sits in the middle of what is left, so a
  // group gets the same room before its first note as after its last. The
  // capo's cell has no room left before its notes (lifted off the capo bar):
  // there the line goes past the wire (or nut) behind the capo, as far from
  // it as the line keeps from a wire everywhere else, the wire inside.
  const cellEl = (s, f) => els.neck.querySelector(`.cell[data-s="${s}"][data-f="${f}"]:not(.strip-cell)`);
  const cellBox = (s, f) => {
    const cell = cellEl(s, f);
    const r = cell.getBoundingClientRect();
    const cs = getComputedStyle(cell);
    const px = (prop) => parseFloat(cs[prop]) || 0;
    const b = vertical
      ? { u0: r.top - box.top + px('borderTopWidth') + px('paddingTop'),
        u1: r.bottom - box.top - px('borderBottomWidth') - px('paddingBottom'),
        v0: r.left - box.left, v1: r.right - box.left }
      : { u0: r.left - box.left + px('borderLeftWidth') + px('paddingLeft'),
        u1: r.right - box.left - px('borderRightWidth') - px('paddingRight'),
        v0: r.top - box.top, v1: r.bottom - box.top };
    const behind = cell.classList.contains('capo') && cellEl(s, f - 1);
    if (behind) {
      const p = behind.getBoundingClientRect();
      const ps = getComputedStyle(behind);
      const past = 2 * GROUP_INSET;   // (the line: GROUP_INSET in from a box's edge; as far again past the wire)
      if (vertical) b.u0 = p.bottom - box.top - parseFloat(ps.borderBottomWidth) - past;
      else if (p.left < r.left) b.u0 = p.right - box.left - parseFloat(ps.borderRightWidth) - past;
      else b.u1 = p.left - box.left + parseFloat(ps.borderLeftWidth) + past;   // (mirrored: the frets run leftwards)
    }
    return b;
  };
  layer.innerHTML = [group].map((g) => {   // one group at a time: the one picked
    const bars = g.bars.map(({ s, a, b, da = a, db = b }) => {   // (its outline: past its notes where a string shares no fret with the next)
      const first = cellBox(s, da);
      const last = cellBox(s, db);
      // min / max: on a mirrored (left-handed) neck the frets run leftwards
      return { u0: Math.min(first.u0, last.u0), u1: Math.max(first.u1, last.u1), v0: first.v0, v1: first.v1 };
    }).sort((p, q) => p.v0 - q.v0);
    const points = staircase(bars, GROUP_INSET).map(([u, v]) => (vertical ? [v, u] : [u, v]));
    return `<path class="g-a" d="${roundedPath(points, GROUP_RADIUS)}"/>`;
  }).join('');
}

/* Outline of stacked bars (one per string, each covering a range along u),
   moved inwards by d: walk down the far side, then back up the near side. */
function staircase(bars, d) {
  const same = (x, y) => Math.abs(x - y) < 0.5;
  const last = bars[bars.length - 1];
  const pts = [[bars[0].u0 + d, bars[0].v0 + d], [bars[0].u1 - d, bars[0].v0 + d]];
  for (let i = 0; i + 1 < bars.length; i++) {
    const y = (bars[i].v1 + bars[i + 1].v0) / 2;
    if (same(bars[i].u1, bars[i + 1].u1)) continue;
    const k = bars[i + 1].u1 > bars[i].u1 ? 1 : -1;   // the step's edge belongs to the wider bar
    pts.push([bars[i].u1 - d, y + k * d], [bars[i + 1].u1 - d, y + k * d]);
  }
  pts.push([last.u1 - d, last.v1 - d], [last.u0 + d, last.v1 - d]);
  for (let i = bars.length - 2; i >= 0; i--) {
    const y = (bars[i].v1 + bars[i + 1].v0) / 2;
    if (same(bars[i].u0, bars[i + 1].u0)) continue;
    const k = bars[i + 1].u0 < bars[i].u0 ? 1 : -1;
    pts.push([bars[i + 1].u0 + d, y + k * d], [bars[i].u0 + d, y + k * d]);
  }
  return pts;
}

/* Closed path through the points with every corner rounded (radius r, or
   less where an edge is too short). */
function roundedPath(pts, r) {
  const n = pts.length;
  const parts = [];
  for (let i = 0; i < n; i++) {
    const [px, py] = pts[i];
    const [ax, ay] = pts[(i + n - 1) % n];
    const [bx, by] = pts[(i + 1) % n];
    const la = Math.hypot(ax - px, ay - py);
    const lb = Math.hypot(bx - px, by - py);
    const rr = Math.min(r, la / 2, lb / 2);
    const p1 = [px + ((ax - px) / la) * rr, py + ((ay - py) / la) * rr];
    const p2 = [px + ((bx - px) / lb) * rr, py + ((by - py) / lb) * rr];
    parts.push(`${i ? 'L' : 'M'}${p1[0].toFixed(1)} ${p1[1].toFixed(1)}`,
      `Q${px.toFixed(1)} ${py.toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`);
  }
  return `${parts.join(' ')}Z`;
}

// (named from the capo: what it sounds as, named as with no capo)
const soundsAs = (name) => `Capo ${nameShift()}, <span class="np-tail">sounds as ${esc(name)}</span>`;
function renderChordPanel(ch, sc) {
  // (its root's name: the scale's, when it has that root; else the one used
  // and its other one; no type yet, both)
  const named = scaleRootName(state.chord.root);
  els.chordRoot.textContent = named ? noteText(named) : rootLabel(state.chord.root, ch && ch.spell.root);
  // The switch: the chord's root under its other name; always there (the
  // panel stays put), off where there is none to pick: no chord, D, G and
  // A, or a root the scale names
  const other = ch && !named && otherRoot(ch.root, ch.spell.root);
  els.tglChordAlt.disabled = !other;
  els.tglChordAlt.setAttribute('aria-pressed', String(Boolean(other && letterOf(state.chord) !== null)));
  fitWords(els.chordType, ch ? [...new Set([ch.def.name, shortWords(ch.def.name)])] : ['None'], 12);   // ("Half-dim. 7th" when the whole name does not fit)

  // No chord: the bass the next one gets, without a note to name yet
  const inversion = ch ? ch.inversion : state.inversion[state.instrument];
  els.chordInversion.textContent = inversion === 'any' ? 'Any bass note'
    : ch ? `${INVERSION_NAMES[Number(inversion)]}, ${noteText(ch.spell.notes[Number(inversion)])} in bass`
      : INVERSION_NAMES[Number(inversion)];

  els.chordClear.disabled = !ch;
  els.chordInversion.disabled = !ch || Boolean(ch.def.span);   // (an interval: in root position only, see inversionFor)
  // No shape to play: every chord tone shows on the neck (renderNeck), so the
  // switch shows on, and can't be turned off
  const noShape = Boolean(ch && !ch.shape);
  els.tglAllTones.disabled = !ch || noShape;
  if (noShape) els.tglAllTones.setAttribute('aria-pressed', 'true');
  els.shapePrev.disabled = els.shapeNext.disabled = !ch || ch.shapes.length < 2;
  els.chordStrum.disabled = !ch || !ch.shape;
  renderStrumButtons();   // (Strum or Play, or Stop: a chord arpeggiated)

  if (!ch) {
    els.chordSymbol.textContent = '';
    els.chordSymbol.classList.remove('on');
    els.chordName.textContent = 'No chord selected';
    els.chordMeta.textContent = 'Pick a chord type, or tap a triad in the Scale panel.';
    els.chordShapeNote.textContent = '';
    els.chordPosition.textContent = '';
    els.chordAlt.textContent = '';
    els.chordCapo.hidden = true;
    els.chordKey.hidden = true;
    els.chordTones.innerHTML = '<li class="np-placeholder">The notes of the selected shape appear here.</li>';
    els.chordMissing.hidden = true;
    els.shapeCount.hidden = true;
    els.shapeList.innerHTML = '';
    els.shapeList.dataset.empty = 'No chord selected';
    return;
  }

  const rootName = ch.rootName;
  els.chordSymbol.classList.add('on');
  fitSymbol(els.chordSymbol, ch.symbol, ch.bassIndex > 0);
  els.chordName.textContent = `${rootName} ${ch.def.name.toLowerCase()}`;
  const optional = optionalTones(ch.def, String(ch.bassIndex), Boolean(instrument().piano));   // (in brackets, as in the Chord type menu; never the shape's bass)
  // (an octave: one note, the root and its octave, "1 8"; two octaves, "1 15")
  const octaves = ch.def.span && ch.def.steps.length === 1 ? ch.def.span / 12 : 0;
  const formula = octaves ? `1 ${7 * octaves + 1}` : ch.def.degrees.map((d, i) => {
    const deg = fmtDeg(d === 'R' ? '1' : d);
    return optional.has(i) ? `(${deg})` : deg;
  }).join(' ');
  // Its formula, then its notes: each once, from the root up, as spelled for
  // the chord, the ones a shape may leave out in brackets, as the formula and
  // the Chord type menu (the shape's notes, bass to top, with any doubled,
  // are below), after a bar; on two lines, the notes on the second, no bar
  // (see .np-parts)
  const spelled = octaves ? `${noteText(ch.spell.root)} ${noteText(ch.spell.root)}`
    : ch.spell.notes.map((n, i) => (optional.has(i) ? `(${noteText(n)})` : noteText(n))).join(' ');
  els.chordMeta.innerHTML = `<span class="np-parts"><span class="np-tail">Formula: ${esc(formula)}</span><span class="np-tail np-then">${esc(spelled)}</span></span>`;
  // Its inversion, on its own line (the shape's: with "Any bass note" too)
  els.chordPosition.textContent = INVERSION_NAMES[ch.bassIndex];
  // Phones: where the shape is and its frets, as the dock writes them ("Open:
  // x32010": the dock's line can be cut short by a long name; its number is
  // there and on the panel's arrows); a piano's, its keys. A custom shape:
  // a bookmark before it, as on its chip.
  const where = ch.shape && shapeWhere(ch.shape);
  els.chordShapeNote.innerHTML = !ch.shape ? 'No playable shape'
    : `${ch.shape.drawn ? BOOKMARK_ICON : ''}${esc(`${ch.shape.piano ? '' : `${where[0].toUpperCase()}${where.slice(1)}: `}${shapeShort(ch.shape)}`)}`;   // ("Fret 9: 11 12 9 11 9 9", the place apart from the frets)
  const slash = ch.bassIndex ? `/${noteText(ch.spell.notes[ch.bassIndex])}` : '';
  const aliases = (CHORD_ALIASES[ch.def.id] || []).map((a) => rootName + a + slash);
  els.chordAlt.textContent = aliases.length ? `=\u00a0${aliases.join(', ')}` : '';   // (the = never alone at a line's end)
  // With a capo, name the shape to play: the chord moved down by the capo
  // (no shape: nothing to play); named from the capo (see nameShift), the
  // name is the shape's, so what it sounds like instead, as named with no
  // capo (see soundsAs)
  const fromCapo = nameShift() > 0;
  const c = ch.shape || fromCapo ? capo() : 0;
  els.chordCapo.hidden = !c;
  const moved = c && !fromCapo ? spellChord(ch.root - c, ch.def) : null;   // (as its key writes it: a shape, not a chord of the scale)
  const shapeName = moved ? noteText(moved.root) + ch.def.symbol + (ch.bassIndex ? `/${noteText(moved.notes[ch.bassIndex])}` : '') : '';
  const sounds = fromCapo ? atShift(0, () => chordName(ch.root, ch.def, ch.bassIndex, letterOf(state.chord))) : '';
  // (one idea: wrapped, the comma stays and the second half moves whole)
  els.chordCapo.innerHTML = !c ? '' : fromCapo ? soundsAs(sounds)
    : `With capo ${c}, <span class="np-tail">play the ${esc(shapeName)} shape</span>`;
  els.tonesLabel.textContent = 'Shape notes, bass to top';

  // With a scale shown: does the chord fit it, and if not, which notes do not
  const outside = outsideScale(ch.root, ch.def, sc);
  els.chordKey.hidden = !outside;
  if (outside) {
    const key = scaleInText(sc);
    const num = chordNumeral(sc, ch.root, ch.def, letterOf(state.chord));   // ("Every note is in C major (ii)", "Outside C major (♭VII): B♭")
    const keyNum = `${esc(key)}${num ? ` (${esc(num)})` : ''}`;
    els.chordKey.classList.toggle('out', outside.length > 0);
    // (the notes kept together: on two lines, the break comes after the colon)
    els.chordKey.innerHTML = outside.length
      ? `<span>Outside ${keyNum}: <span class="np-tail">${esc(outside.map((t) => noteText(ch.spell.names.get(t.pc))).join(', '))}</span></span>`
      : `<span>Every note is in ${keyNum}</span>`;
  }

  els.shapeCount.hidden = false;
  els.shapeCount.classList.toggle('warn', !ch.shapes.length);
  els.shapeCount.textContent = ch.shapes.length ? `Shape ${ch.index + 1}/${ch.shapes.length}` : 'No shape';

  if (!ch.shape) {
    // (why, and what to try, as the case is: an interval in root position
    // only, its inversion picker off; "Any bass note" only when not on it
    // and it has a shape)
    const inst = instrument();
    const range = inst.piano ? inst.keys - 1 : Math.max(...inst.strings) + inst.frets - (Math.min(...inst.strings) + capo());
    const why = ch.def.span ? (ch.def.span > range ? 'This interval is wider than this instrument’s whole range.' : 'This interval’s two notes can’t be played together on this instrument.')
      : ch.inversion !== 'any' && chordShapes(ch.root, ch.def, 'any').length ? 'No playable shape for this inversion on this instrument. Try “Any bass note”.'
        : 'No playable shape for this chord on this instrument.';
    els.chordTones.innerHTML = `<li class="np-placeholder">${why}</li>`;
    els.chordMissing.hidden = true;
    els.shapeList.innerHTML = '';
    els.shapeList.dataset.empty = 'No shapes found';
    return;
  }

  const inst = cappedInstrument();
  // Each note, where it is played: a string and fret, or a key (its number,
  // from 1, as pianos count them: middle C is the piano's key 40)
  const notes = inst.piano
    ? ch.shape.frets.map((k) => ({ k, midi: inst.low + k }))
    : ch.shape.frets
      .map((f, s) => ({ f, s, midi: shapePitch(inst, s, f) }))
      .filter((x) => x.f >= 0)
      .sort((a, b) => a.midi - b.midi || a.s - b.s);
  const offKey = offKeyTest(sc);
  els.chordTones.innerHTML = notes.map((x) => {
    const deg = shapeDegree(ch, x.midi, notes[0].midi);   // (an octave's: R, 8, 15...)
    const name = pitchName(x.midi, ch.spell.names.get(mod12(x.midi)));
    const open = c && !startFret(inst, x.s) ? 'capo' : 'open';   // a banjo's drone rings open past its spike
    const loc = inst.piano ? `key ${x.k + 1}` : x.f === 0 ? `str ${stringNumber(x.s)}, ${open}` : `str ${stringNumber(x.s)}, fr ${x.f}`;
    const where = inst.piano ? `data-key="${x.k}"` : `data-s="${x.s}" data-f="${shapeNeckFret(inst, x.s, x.f, c)}"`;
    const off = offKey(x.midi);
    return `<li class="np-note${deg === 'R' ? ' root' : ''}${off ? ' off-key' : ''}" data-midi="${x.midi}" ${where} ` +
      `title="Click to hear ${esc(name)}${off ? `, not in ${scaleInText(sc)}` : ''}">` +
      `<span class="np-note-name">${esc(name)}</span>` +
      `<span class="np-deg">${tx(fmtDeg(deg))}</span>` +
      `<span class="np-role" ${fitsAttr([degreeName(deg), shortWords(degreeName(deg))])}>${esc(degreeName(deg))}</span>` +
      `<span class="np-loc"><kbd>${tx(loc)}</kbd></span></li>`;
  }).join('');
  refitWords(els.chordTones);   // (each interval's name: shorter where it does not fit)
  fitNotesRow();
  // The chord's notes the shape leaves out (a 13th's 9th, say: see optionalTones)
  const played = new Set(notes.map((x) => mod12(x.midi)));
  const missing = chordTones(ch.root, ch.def).filter((t) => !played.has(t.pc));
  els.chordMissing.hidden = !missing.length;
  els.chordMissing.innerHTML = missing.length
    ? `Not in this shape: <span class="np-tail">${missing.map((t) => `<span class="np-item">${esc(`${noteText(ch.spell.names.get(t.pc))} (${degreeName(t.deg).toLowerCase()})`)}</span>`).join(', ')}</span>`
    : '';

  els.shapeList.innerHTML = ch.shapes.map((shape, i) => {
    const where = shapeWhere(shape);
    const sel = i === ch.index;
    const what = `${shape.drawn ? 'Custom shape, ' : ''}${shape.piano ? 'notes' : 'strings'} low to high`;
    return `<li><button type="button" class="chip${sel ? ' selected' : ''}${shape.drawn ? ' custom' : ''}" data-shape="${i}" aria-pressed="${sel}" ` +
      `title="${esc(what[0].toUpperCase() + what.slice(1))}: ${esc(shapeTab(shape))}">` +
      `${shape.drawn ? BOOKMARK_ICON : ''}` + (shape.piano
        // (the piano: its notes, the lowest, where it sits, in the label's colour)
        ? `<span class="tx"><span class="chip-lead">${esc(where)}</span> ${esc(shapeTab(shape).split(' ').slice(1).join(' '))}</span></button></li>`
        // (where it sits, "Fret 5", "Open" as the group chips, on the tab's baseline: one line, as the triads)
        : `<span class="mono tx"><span class="chip-num">${esc(where[0].toUpperCase() + where.slice(1))}</span>${esc(tabOf(shape))}</span></button></li>`);
  }).join('');
  keepChipVisible();
}

/* Scroll a chip list sideways (never the page) to show the selected chip. */
function keepChipVisible(list = els.shapeList) {
  const chip = list.querySelector('.chip.selected');
  if (!chip) return;
  const li = chip.parentElement;
  const left = li.offsetLeft;
  const right = left + li.offsetWidth;
  if (left < list.scrollLeft) list.scrollLeft = left - 8;
  else if (right > list.scrollLeft + list.clientWidth) list.scrollLeft = right - list.clientWidth + 8;
}

/* Phones: switches two a row; an odd one out, the last, takes the whole
   row rather than leave a gap (which ones show changes: no chord, the
   piano's fewer) */
function fitSwitches() {
  for (const row of document.querySelectorAll('.switch-row, .settings')) {
    const shown = [...row.querySelectorAll(':scope > .pill-toggle, :scope > .tool-btn, :scope > .tool-wrap')].filter((el) => getComputedStyle(el).display !== 'none');   // (the tools, two tiles of the grid too)
    shown.forEach((el, i) => el.classList.toggle('whole', i === shown.length - 1 && shown.length % 2 === 1));
  }
}
function renderScalePanel(sc, ch) {
  // The root as the scale writes it, its other name in brackets ("E♭ (D♯)");
  // no type yet, both names as the menu lists them ("C♯ / D♭")
  els.scaleRoot.textContent = rootLabel(state.scale.root, sc && sc.spell.root);
  els.tglScaleAlt.disabled = !sc || !otherRoot(sc.root, sc.spell.root);
  els.tglScaleAlt.setAttribute('aria-pressed', String(Boolean(sc && letterOf(state.scale) !== null)));
  // (shorter when the whole name does not fit: "Major (Ionian)", "Major")
  fitWords(els.scaleType, sc ? [...new Set([sc.def.name, sc.def.name.replace(/ \(.*\)$/, ''), sc.def.short])] : ['None'], 12);
  els.scaleClear.disabled = !sc;
  // The chromatic scale has every note: nothing to hide or to group
  els.tglScaleOnly.disabled = els.tglScaleGroups.disabled = !sc || sc.def.steps.length >= 12;
  els.tglScaleGroups.title = instrument().piano ? 'Mark the scale an octave at a time, with a bar over its keys, and step from one to the next'
    : 'Outline the scale in hand-sized groups, a few notes per string, and step from one to the next';
  renderGroupLine(sc, ch);

  if (scaleRun && scaleRun.key !== scaleKey(sc)) stopScale();   // another scale (or none): stop playing the old one
  els.scalePlay.disabled = !sc;
  if (!sc) {
    els.scaleSymbol.textContent = '';
    els.scaleSymbol.classList.remove('on');
    els.scaleName.textContent = 'No scale selected';
    els.scaleMeta.textContent = 'Pick a scale type to see its notes.';
    els.scaleAlt.textContent = '';
    els.scaleCapo.hidden = true;
    els.scaleNotes.innerHTML = '<li class="empty-text" style="grid-row:1">The notes of the scale appear here.</li>';
    els.scaleTriads.innerHTML = '<span class="empty-text">The triads that fit the scale appear here.</span>';
    return;
  }

  // Description, like the Chord panel's: name, formula and the common
  // scales with the same notes
  const degrees = scaleDegrees(sc);
  els.scaleSymbol.textContent = sc.rootName;
  els.scaleSymbol.classList.add('on');
  fitText(els.scaleSymbol);
  els.scaleName.textContent = `${sc.rootName} ${scaleTitle(sc.def)}`;
  els.scaleMeta.textContent = `Formula: ${degrees.join(' ')}`;   // (as the chord's)
  const relatives = relativeScales(sc);
  // ("♪ = A natural minor": the same notes, as the chord's "= CM, Cmaj"; ♪ and = kept together, never alone at a line's end)
  els.scaleAlt.innerHTML = relatives.length ? `♪\u00a0=\u00a0<span class="np-tail">${relatives.map((r) => `<span class="np-item">${esc(r)}</span>`).join(', ')}</span>` : '';
  // Named from a capo (see nameShift): what it sounds like, as the chord's
  const sounds = nameShift() ? atShift(0, () => `${noteText(scaleSpelling(sc.root, sc.def).root)} ${scaleTitle(sc.def)}`) : '';
  els.scaleCapo.hidden = !sounds;
  els.scaleCapo.innerHTML = sounds ? soundsAs(sounds) : '';

  // Notes with their interval on top, and the step to the next note below
  const pill = (deg) => `<span class="scale-deg" aria-hidden="true">${tx(deg === '1' ? 'R' : deg)}</span>`;
  const parts = [];
  sc.spell.notes.forEach((n, i) => {
    parts.push(`<li><button type="button" class="scale-note${i === 0 ? ' root' : ''}" data-i="${i}" ` +
      `title="Hear ${esc(noteText(n))}, ${i === 0 ? 'the root' : degrees[i]}">${tx(noteText(n))}${pill(degrees[i])}</button></li>`);
    const next = i + 1 < sc.def.steps.length ? sc.def.steps[i + 1] : 12;
    const gap = next - sc.def.steps[i];
    parts.push(`<li class="scale-gap" aria-label="${gap} semitones"><span>${STEP_NAMES[gap] || gap}</span></li>`);
  });
  parts.push(`<li><button type="button" class="scale-note octave" data-i="${sc.def.steps.length}" ` +
    `title="Hear ${esc(sc.rootName)}, an octave up">${tx(sc.rootName)}${pill('1')}</button></li>`);
  els.scaleNotes.innerHTML = parts.join('');

  const triads = scaleTriads(sc);
  if (!triads) {
    els.scaleTriads.innerHTML = '<span class="empty-text">Every triad fits in the chromatic scale</span>';
    return;
  }
  if (!triads.length) {
    els.scaleTriads.innerHTML = '<span class="empty-text">This scale contains no major, minor, diminished or augmented triad</span>';
    return;
  }
  els.scaleTriads.innerHTML = triads.map((t) => {
    const def = findChord(t.type);
    const sel = ch && ch.root === t.root && ch.def.id === t.type;
    return `<button type="button" class="chip${sel ? ' selected' : ''}" data-root="${t.root}" data-type="${t.type}" ` +
      `title="Select ${esc(t.name)} ${def.name.toLowerCase()}"><span class="tx"><span class="chip-num">${esc(t.num)}</span>` +
      `${esc(t.name + def.symbol)}</span></button>`;   // (as the chord list's chips)
  }).join('');
}

/* The scale's groups as chips, from the nut up: shown while Groups is on */
function renderGroupLine(sc, ch) {
  const on = Boolean(sc && state.scaleGroups && sc.def.steps.length < 12);
  els.groupLine.hidden = !on;
  els.groupPrev.disabled = els.groupNext.disabled = ui.groups.length < 2;
  // The arrow keys step the groups when keysOnGroups says (else the chord's shapes)
  const keys = keysOnGroups(ch);
  els.groupPrev.title = `Previous group${keys ? ' (←)' : ''}`;
  els.groupNext.title = `Next group${keys ? ' (→)' : ''}`;
  // Its count by the panel's title, as the chord's shapes ("Group 2/9")
  els.groupCount.hidden = !on;
  els.groupCount.classList.toggle('warn', on && !ui.groups.length);
  els.groupCount.textContent = !on ? '' : ui.groups.length ? `Group ${ui.group + 1}/${ui.groups.length}` : 'No group';
  if (!on) { els.groupList.innerHTML = ''; return; }
  const c = capo();
  els.groupList.dataset.empty = 'No group fits on this neck';
  els.groupList.innerHTML = ui.groups.map((g, i) => {
    const sel = i === ui.group;
    const place = groupPlace(g, c);
    const span = groupSpan(g, c);
    return `<li><button type="button" class="chip group-chip${sel ? ' selected' : ''}" data-group="${i}" aria-pressed="${sel}" ` +
      `title="Group ${i + 1}, ${esc(span[0].toLowerCase() + span.slice(1))}"><span class="tx">${esc(place[0].toUpperCase() + place.slice(1))}</span></button></li>`;
  }).join('');
  requestAnimationFrame(() => keepChipVisible(els.groupList));
}

/* Triads of the scale, in scale order. In a 7-note scale each degree gets
   the triad built from the scale's own thirds (degrees 1-3-5 from it); in
   other scales, every major, minor, diminished or augmented triad whose
   notes are all in the scale. Each gets a roman numeral from its root's
   degree (letter distance from the scale root), with ♭ or ♯ when that degree
   differs from the major scale's (A minor: i ii° ♭III iv v ♭VI ♭VII), lower
   case for minor and diminished, ° for diminished, + for augmented. */
const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];
const triadType = (third, fifth) => (third === 4 && fifth === 7 ? 'maj' : third === 3 && fifth === 7 ? 'min'
  : third === 3 && fifth === 6 ? 'dim' : third === 4 && fifth === 8 ? 'aug' : null);
function scaleTriads(sc) {
  const notes = sc.spell.notes;
  if (notes.length >= 12) return null;
  const found = [];
  // Seven notes on seven letters: on each, the triad stacked in thirds
  // (every other note); else every triad whose notes are in the scale (the
  // altered scale has E♭ and E: A♭ and A♭aug both fit)
  if (notes.length === 7 && new Set(notes.map((n) => n.letter)).size === 7) {
    notes.forEach((n, i) => {
      const type = triadType(mod12(notes[(i + 2) % 7].pc - n.pc), mod12(notes[(i + 4) % 7].pc - n.pc));
      if (type) found.push({ n, type });
    });
  } else {
    const seen = new Set();
    for (const n of notes) {
      if (seen.has(n.pc)) continue;
      seen.add(n.pc);
      for (const type of TRIAD_TYPES) {
        if (findChord(type).steps.every((st) => sc.set.has(mod12(n.pc + st)))) found.push({ n, type });
      }
    }
  }
  return found.map(({ n, type }) => ({ root: n.pc, type, name: noteText(n), num: degreeNumeral(sc, n, findChord(type)) }));
}
/* A chord's degree in a scale, as a Roman numeral, from its root as the
   scale spells it (n), measured against the major scale: ii, V, ♭VII (in
   minor: i, ♭III). Its case is its 3rd (minor: lower; major, or none:
   upper), then ° (diminished), ø (half-diminished) or + (augmented). */
function degreeNumeral(sc, n, def) {
  const degree = (n.letter - sc.spell.root.letter + 7) % 7;   // 0 = I
  let shift = mod12(n.pc - sc.root) - MAJOR_STEPS[degree];
  if (shift > 6) shift -= 12;
  if (shift < -6) shift += 12;
  const has = (d) => def.degrees.includes(d);
  const minor = has('b3') && !has('3');
  const sign = minor && has('b5') && !has('5') ? (has('b7') ? 'ø' : '°') : has('3') && has('#5') && !has('5') ? '+' : '';
  return accText(shift) + (minor ? ROMAN[degree].toLowerCase() : ROMAN[degree]) + sign;
}
/* ...any chord's, with a scale on screen (not the chromatic one): a chord
   of 3 notes or more (or a power chord), in the scale or not (B♭ in C
   major: ♭VII), its root as its name spells it (G♭dim: ♭v°, F♯dim: ♯iv°).
   The chord panel's line about the scale ends with it. */
function chordNumeral(sc, root, def, letter = null) {
  if (!sc || sc.def.steps.length >= 12 || (def.steps.length < 3 && def.id !== 'p5')) return '';
  return degreeNumeral(sc, chordSpelling(root, def, letter).root, def);
}
/* ...the same, on a chord of the list: only for a chord built on one of
   the scale's triads (its root, 3rd and 5th: one of those the scale panel
   lists), every other note in the scale too: Dm7 ii, G7 V, Bm7♭5 viiø in
   C major, not Gsus4 (no 3rd), nor B♭ (not in it); not Fm in A harmonic
   minor either (its A♭ sounds as the scale's G♯, but F's triad there is
   F A C) */
function listNumeral(sc, root, def) {
  const has = (d) => def.degrees.includes(d);
  const type = has('3') ? (has('5') ? 'maj' : has('#5') ? 'aug' : null) : has('b3') ? (has('5') ? 'min' : has('b5') ? 'dim' : null) : null;
  if (!type || !sc || !(scaleTriads(sc) || []).some((t) => t.root === mod12(root) && t.type === type)) return '';
  if (!chordTones(root, def).every((t) => sc.set.has(t.pc))) return '';
  return chordNumeral(sc, root, def);
}

/* The scale's name in a sentence: "A natural minor", "A Dorian" (mode
   names keep their capital), "A blues scale" */
const SCALE_TITLES = {
  major: 'major', minor: 'natural minor', blues: 'minor blues scale', 'whole-tone': 'whole tone scale',
  'dim-wh': 'diminished whole-half', 'dim-hw': 'diminished half-whole', chromatic: 'chromatic scale',
  'phrygian-dominant': 'Phrygian dominant', 'lydian-dominant': 'Lydian dominant', altered: 'altered scale',
  'major-blues': 'major blues scale', hirajoshi: 'Hirajoshi scale',
};
const MODE_NAMES = ['Dorian', 'Phrygian', 'Lydian', 'Mixolydian', 'Locrian'];
const scaleTitle = (def) => SCALE_TITLES[def.id] || (MODE_NAMES.includes(def.name) ? def.name : def.name.toLowerCase());
// The scale's short name in a sentence ("Every note is in C major", "not in
// D harm. min"): lower case, as its title is, but a name (Dorian, Hirajoshi)
const scaleInText = (sc) => {
  const short = sc.def.short;
  return `${sc.rootName} ${/^[A-Z]/.test(scaleTitle(sc.def)) ? short : short[0].toLowerCase() + short.slice(1)}`;
};

/* Interval of each scale note from the root, by its degree (the letter the
   scale is spelled with) and how far it sits from the major scale's:
   A minor pentatonic is 1 ♭3 4 5 ♭7 */
function scaleDegrees(sc) {
  const { notes, root } = sc.spell;
  return notes.map((n) => {   // (from the notes as spelled: C♯ is ♯1, D♭ ♭2, as the note names say)
    const d = (n.letter - root.letter + 7) % 7;
    let shift = mod12(n.pc - sc.root) - MAJOR_STEPS[d];
    if (shift > 6) shift -= 12;
    if (shift < -6) shift += 12;
    return accText(shift) + (d + 1);
  });
}

/* Scales with exactly the same notes, as people relate them: the major
   scale's modes by the major and minor scales they are known by (D Dorian:
   C major, A minor), the pentatonic and blues pairs, harmonic minor and its
   5th mode, melodic minor with its jazz modes, the two double harmonic
   scales (the major scale's other modes would make too long a list: C
   major names only A minor). The symmetric scales repeat their notes from
   other roots of their own: C whole tone is D E F♯ G♯ B♭ whole tone; a
   diminished scale also names the other kind from one root, the best known
   (C whole-half: D half-whole). Roots as the scale on screen spells them,
   but a white key's (E♯, F♭, B♯, C♭) and a double sharp or flat's, plainly
   (F♯ melodic minor: B Lydian dominant, F altered, not E♯ altered). */
const MODE_RELATIVES = ['major', 'minor'];
const RELATIVES = {
  major: ['minor'], minor: ['major'],
  dorian: MODE_RELATIVES, phrygian: MODE_RELATIVES, lydian: MODE_RELATIVES, mixolydian: MODE_RELATIVES, locrian: MODE_RELATIVES,
  'major-pentatonic': ['minor-pentatonic'], 'minor-pentatonic': ['major-pentatonic'],
  'major-blues': ['blues'], blues: ['major-blues'],
  'harmonic-minor': ['phrygian-dominant'], 'phrygian-dominant': ['harmonic-minor'],
  'melodic-minor': ['lydian-dominant', 'altered'], 'lydian-dominant': ['melodic-minor', 'altered'], altered: ['melodic-minor', 'lydian-dominant'],
  'double-harmonic-major': ['double-harmonic-minor'], 'double-harmonic-minor': ['double-harmonic-major'],
  'whole-tone': ['whole-tone'], 'dim-wh': ['dim-wh', 'dim-hw'], 'dim-hw': ['dim-hw', 'dim-wh'],
};
const RELATIVE_FROM = { 'dim-wh': { 'dim-hw': 2 }, 'dim-hw': { 'dim-wh': 10 } };   // (the other kind: only from this root, in semitones up)
const RELATIVE_NAMES = { minor: 'minor', 'major-blues': 'major blues', blues: 'minor blues', altered: 'altered', 'whole-tone': 'whole tone', 'dim-wh': 'whole-half', 'dim-hw': 'half-whole' };
// → ["C major", "A minor"], ["E♭ G♭ A whole-half", "D half-whole"]: one item per kind, its roots apart by spaces
function relativeScales(sc) {
  return (RELATIVES[sc.def.id] || []).map((id) => {
    const def = findScale(id);
    const from = RELATIVE_FROM[sc.def.id] && RELATIVE_FROM[sc.def.id][id];
    const roots = def.steps.length !== sc.set.size ? [] : sc.spell.notes.filter((n) => (id !== sc.def.id || n.pc !== mod12(sc.root))
      && (from === undefined || n.pc === mod12(sc.root + from)) && def.steps.every((st) => sc.set.has(mod12(n.pc + st))));
    // (each root as the scale writes it, so C♯ major's are A♯ minor and E♯
    // Phrygian, as each of those writes itself; a double sharp or flat,
    // which no root's name has, plainly: G𝄪 as A)
    const plain = (n) => (Math.abs(n.acc) > 1 ? freeNote(n.pc, n.acc < 0) : n);
    return roots.length ? `${roots.map((n) => noteText(plain(n))).join(' ')} ${RELATIVE_NAMES[id] || scaleTitle(def)}` : null;
  }).filter(Boolean);
}

/* ==========================================================================
   6. Events
   ========================================================================== */
function init() {
  for (const id of ['instrumentPicker', 'tuningSelect', 'neck', 'tglOctaves', 'tglFlats', 'tglLefty', 'tglAllTones',
    'chordRoot', 'chordType', 'chordInversion', 'chordClear', 'chordSymbol', 'chordName', 'chordMeta', 'chordPosition', 'chordShapeNote',
    'chordAlt', 'chordCapo', 'scaleCapo', 'chordKey', 'chordStrum', 'tonesLabel', 'capoSelect', 'chordTones', 'chordMissing', 'shapeCount', 'groupCount', 'shapePrev', 'shapeNext', 'shapeList',
    'scaleRoot', 'scaleType', 'scaleClear', 'tglScaleAlt', 'tglChordAlt', 'scaleNotes', 'scaleTriads', 'scaleSymbol', 'scaleName', 'scaleMeta', 'scaleAlt',
    'dockRecent', 'dockRecentList', 'dockRecentClear', 'recentLine', 'recentList', 'recentClear',
    'settings', 'settingsWideSlot', 'settingsNarrowSlot', 'neckHead', 'tuningRow', 'setupHead', 'instWideSlot', 'instNarrowSlot', 'sheet', 'sheetBody', 'sheetClose',
    'dockShapeBar', 'tglScaleOnly', 'tglScaleGroups', 'picker', 'pickerTitle', 'pickerTools', 'pickerBody', 'tunerPitch', 'metroOpen', 'metroTool', 'metroStop', 'metroShown', 'metronome', 'metroClose', 'metroTap', 'metroSlower', 'metroFaster', 'metroBpm', 'metroMarking', 'metroTempo', 'metroMeters', 'metroBeats', 'metroGo', 'tunerOpen', 'tuner', 'tunerClose', 'tunerHead', 'tunerTuning', 'tunerFold', 'tunerStrings', 'tunerView', 'tunerStrip', 'tunerTape', 'tunerLeft', 'tunerRight', 'tunerFine', 'tunerFineTape', 'tunerHint', 'tunerClear', 'tunerMessage', 'tunerMessageTitle', 'tunerMessageText', 'tunerRetry', 'pickerClose', 'dockPrev', 'dockNext', 'dockStrum', 'dockShape', 'dockSymbol', 'dockTab',
    'tabChordValue', 'tabScaleValue', 'tabNeckValue', 'about', 'aboutOpen', 'aboutClose', 'shareOpen', 'shareStatus', 'scalePlay',
    'tuneEdit', 'tuneClose', 'tuneName', 'tuneList', 'tuneReset', 'tuneDone',
    'tuneActions', 'tuneSave', 'tuneNaming', 'tuneSaveName', 'tuneNameCancel', 'tuneNameSave',
    'tuneDelete', 'tuneDeleteClose', 'tuneDeleteName', 'tuneDeleteNotes', 'tuneDeleteCancel', 'tuneDeleteGo',
    'resetAll', 'resetAsk', 'resetWhat', 'resetAskClose', 'resetAskCancel', 'resetAskGo',
    'listClear', 'listClearClose', 'listClearCount', 'listClearNames', 'listClearRecentCount', 'listClearRecentNames', 'listClearRecentGo', 'listClearCancel', 'listClearGo',
    'share', 'shareClose', 'shareNeck', 'shareChord', 'shareScale', 'shareRecent', 'shareGo', 'shareText',
    'linkOpen', 'linkClose', 'linkNeck', 'linkChord', 'linkScale', 'linkList', 'linkKeep', 'linkLoad',
    'groupLine', 'groupPrev', 'groupNext', 'groupList',
    'namer', 'namerOpen', 'namerMute', 'namerUp', 'namerDown', 'namerAlt', 'namerClear', 'namerPrev', 'namerNext', 'namerSymbol', 'namerText', 'namerCaption', 'namerPlay', 'namerCancel', 'namerSelect',
    'quickBar', 'quickInner', 'quickGroupBar', 'quickGroupPrev', 'quickGroupNext', 'quickGroupInfo', 'quickGroupSymbol', 'quickGroupTab', 'quickGroupPlay']) {
    els[id] = document.getElementById(id);
  }
  // A page and a script of two versions (an update half arrived, see sw.js):
  // the page again, for both of one version (once: never in a loop); never
  // the script on a page it was not made for
  const RELOADED = 'frettle-reloaded';
  const whole = Object.values(els).every(Boolean);
  try {
    if (whole) sessionStorage.removeItem(RELOADED);
    else if (!sessionStorage.getItem(RELOADED)) {
      sessionStorage.setItem(RELOADED, '1');
      location.reload();
    }
  } catch { /* (no session storage: as it is) */ }
  if (!whole) return;
  els.dockBar = document.querySelector('.dock-bar');
  els.neckPanel = document.querySelector('.neck-panel');
  els.dockTabs = document.querySelector('.dock-bar .tabs');
  els.panelChord = document.getElementById('panelChord');
  els.panelScale = document.getElementById('panelScale');
  els.chordBar = document.querySelector('.chord-bar');
  els.scaleBar = document.querySelector('.scale-bar');
  els.chordSwitches = document.querySelector('#panelChord .switch-row');
  els.scaleSwitches = document.querySelector('#panelScale .switch-row');
  els.chordHead = document.querySelector('#panelChord .panel-head');
  els.scaleHead = document.querySelector('#panelScale .panel-head');
  els.notesLine = document.querySelector('.notes-line');
  els.tabs = [...document.querySelectorAll('.tab')];
  els.sheetPanels = [...els.sheet.querySelectorAll('.panel[data-tab]')];
  state = loadState();
  ui.chordRoot = state.chord.root;   // (as saved: a scale root picked while no scale shows stays, see draw)
  for (const r of [...state.list, ...state.recent]) if (r.bass === undefined) r.bass = legacyBass(r);   // (saved before chips had a bass)
  // What this tab saw saved: what it changes from here on is what it writes
  // of the shared parts (see saveState)
  sharedBase = storedShared();
  const { root, type } = state.chord;
  const chips = [...state.list, ...state.recent];
  // The chord on screen: shown apart from its chip (see applyLink), on the
  // shape it had, in the inversion saved, while this neck lists it; else as
  // its chip remembers it (inversion, shape): the chip it was saved as (no
  // bass saved with it: the root, as a link's; saved before chips had a
  // bass: its only chip, whatever its bass)
  const looseAt = state.chord.on && state.looseFrets ? currentChord().shapes.findIndex((sh) => fretsText(sh.frets) === state.looseFrets) : -1;
  if (looseAt >= 0) Object.assign(state, { shape: looseAt, loose: true });
  else if (state.chord.on) recallChip(chips.find((r) => sameEntry(r, { root, type, bass: state.chordBass ?? 0 })) || chips.find((r) => r.root === root && r.type === type));
  delete state.chordBass;
  delete state.looseFrets;
  startLink(location.search);   // opened from a shared link

  // Instrument and tuning: popups, each tile showing the open strings
  els.instrumentPicker.addEventListener('click', () => openPicker({
    title: 'Instrument', value: state.instrument,
    groups: [...new Set(INSTRUMENTS.map((i) => i.family))].map((family) => ({   // one group per family
      label: family,
      items: INSTRUMENTS.filter((i) => i.family === family).map((i) => {
        const t = tunedInstrument(i.id, state.tuning[i.id]);
        // a preset in its usual spelling (Open D's F♯, E♭ for half step down);
        // a custom tuning as the Flats switch says
        const flats = t.tuning.custom || t.tuning.saved ? state.flats : Boolean(t.tuning.flats);
        return { value: i.id, label: i.name, sub: i.piano ? keysText(i) : tuningNotes(t.strings, flats, i.id) };
      }),
    })),
    onPick: (v) => {
      if (v === state.instrument) return;
      changeNeck(() => { state.instrument = v; });   // (the chord keeps its bass; else as last used on that instrument)
      render();
    },
    // Under the instruments, your preferences, set once: left-handed (a switch
    // as the others, on its label's line if there is room), the reference
    // pitch (every instrument's: see setPitch). Set apart from them (a rule, a
    // label as a field's), not one more family
    foot: `<div id="pitchRow" class="pitch-foot">
        <div class="prefs-head"><div class="label">Preferences</div><div class="pref-slot"></div></div>
        <div class="pitch-grid"><span class="pref-name">Reference pitch</span>
          <button type="button" class="btn small pitch-reset" title="Back to A = ${PITCH_USUAL} Hz" hidden><span class="tx">Reset</span></button>
          <button type="button" class="btn icon" data-pitch="-1" aria-label="Lower" title="Lower by 1 Hz"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 12h12"/></svg></button>
          <span class="pitch-value" aria-live="polite"></span>
          <button type="button" class="btn icon" data-pitch="1" aria-label="Higher" title="Higher by 1 Hz"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 12h12M12 6v12"/></svg></button>
        </div>
      </div>`,
  }));
  els.instrumentPicker.addEventListener('click', () => {   // (its preferences: their buttons, as drawn)
    const row = document.querySelector('#pitchRow');
    if (!row || row.dataset.wired) return;
    row.querySelector('.pref-slot').append(els.tglLefty);   // (the switch itself: its state, its click, see TOGGLES)
    row.dataset.wired = '1';
    holdStep(row.querySelector('[data-pitch="-1"]'), () => setPitch(pitchA - 1));
    holdStep(row.querySelector('[data-pitch="1"]'), () => setPitch(pitchA + 1));
    row.querySelector('.pitch-reset').addEventListener('click', () => { setPitch(PITCH_USUAL); row.querySelector('[data-pitch="1"]').focus({ preventScroll: true }); });
    renderPitch();
  });
  els.tuningSelect.addEventListener('click', openTuningMenu);
  // The tuner: its microphone off whenever it closes (×, Escape, outside it)
  // or the page is hidden, back on when the page comes back
  els.tunerOpen.addEventListener('click', openTuner);
  els.tunerClose.addEventListener('click', closeTuner);
  els.tuner.addEventListener('close', tunerClosed);
  els.tuner.addEventListener('click', (e) => { if (e.target === els.tuner) closeTuner(); });
  els.tunerFold.addEventListener('click', foldTuner);
  // (folded: a click anywhere on its head unfolds it, as a folded panel's; its arrow does its own)
  els.tunerHead.addEventListener('click', (e) => { if (els.tunerHead.classList.contains('folded') && !e.target.closest('button')) foldTuner(); });
  els.tunerClear.addEventListener('click', clearTunerTarget);
  onPress(els.tunerStrings, '[data-s]', (b) => pickTunerString(Number(b.dataset.s)));   // (on press, as every note that sounds)
  els.tunerRetry.addEventListener('click', startMic);
  window.addEventListener('resize', () => { if (els.tuner.open) measureTuner(); stackInstLabel(); }, { passive: true });
  // The neck's header: fitted again whenever its width changes (resizing,
  // turning to wide: once the neck there is drawn, the panel's width final)
  if (window.ResizeObserver) {
    let headWidth = 0;
    new ResizeObserver(() => { const w = els.neckHead.clientWidth; if (w !== headWidth) { headWidth = w; fitNeckHead(); } }).observe(els.neckHead);
    let panelWidth = 0;   // (the chord and scale panels' title rows: theirs, as wide as each other)
    new ResizeObserver(() => { const w = els.panelChord.clientWidth; if (w !== panelWidth) { panelWidth = w; fitPanelHeads(); } }).observe(els.panelChord);
  } else window.addEventListener('resize', fitNeckHead, { passive: true });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { pillsFor = ''; fitNeckHead(); });   // (measured again in the font itself)
  document.addEventListener('visibilitychange', () => {
    if (!els.tuner.open) return;
    if (document.visibilityState === 'hidden') { if (tunerLive()) { stopMic(); tuner.status = 'paused'; } }
    else if (tuner.status === 'paused') startMic();
  });
  // The metronome: on until stopped, its popup closed too (×, Escape, outside it)
  els.metroOpen.addEventListener('click', openMetronome);
  els.metroStop.addEventListener('click', stopMetronome);   // (at the button's end while it plays: stopped without opening it)
  els.metroClose.addEventListener('click', closeMetronome);
  els.metronome.addEventListener('click', (e) => { if (e.target === els.metronome) closeMetronome(); });
  els.metroGo.addEventListener('click', () => (metroOn() ? stopMetronome() : startMetronome()));
  els.metroTap.addEventListener('pointerdown', (e) => { if (e.button === 0) tapTempo(); });   // (on press: as tapped, not as let go)
  els.metroTap.addEventListener('click', (e) => { if (e.detail === 0) tapTempo(); });   // (the keyboard)
  holdStep(els.metroSlower, () => setMetroTempo(metro.bpm - 1));
  holdStep(els.metroFaster, () => setMetroTempo(metro.bpm + 1));
  els.metroTempo.addEventListener('input', () => setMetroTempo(Number(els.metroTempo.value)));
  els.metroMeters.addEventListener('click', (e) => { const b = e.target.closest('[data-meter]'); if (b) setMetroMeter(b.dataset.meter); });
  els.metroBeats.addEventListener('click', cycleGroups);   // (the beats row: the next way of grouping them)
  window.addEventListener('resize', fitMetroBeats);   // (its dots smaller only while the row is too narrow for them)
  // Its keys: Space starts and stops (but on a button: that button), T taps, + and − (↑ ↓) step
  els.metronome.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const onButton = e.target.closest('button');
    const onSlider = e.target === els.metroTempo;
    if (e.key === ' ' && !onButton) { e.preventDefault(); if (!e.repeat) els.metroGo.click(); }
    else if (e.key === 't' || e.key === 'T') { e.preventDefault(); if (!e.repeat) tapTempo(); }
    else if (!onSlider && (e.key === '+' || e.key === '=' || e.key === 'ArrowUp')) { e.preventDefault(); setMetroTempo(metro.bpm + 1); }
    else if (!onSlider && (e.key === '-' || e.key === '−' || e.key === 'ArrowDown')) { e.preventDefault(); setMetroTempo(metro.bpm - 1); }
  });
  // Custom tuning popup
  els.tuneList.addEventListener('click', (e) => {
    const step = e.target.closest('[data-step]');
    if (step) { tuneStep(Number(step.dataset.string), Number(step.dataset.step)); return; }
    const reset = e.target.closest('[data-reset]');   // one string back to standard
    if (reset) {
      const s = Number(reset.dataset.reset);
      const strings = tune.draft.slice();
      strings[s] = tuningsOf(state.instrument)[0].strings[s];
      tuneSet(strings);
      return;
    }
  });
  onPress(els.tuneList, '[data-play]', (note) => { playNote(Number(note.dataset.play)); ping(note); });   // heard, with the amber flash
  els.tuneReset.addEventListener('click', () => tuneSet(tuningsOf(state.instrument)[0].strings.slice()));
  els.tuneDone.addEventListener('click', () => closeTuneEdit(true));
  els.tuneClose.addEventListener('click', () => closeTuneEdit(false));
  els.tuneEdit.addEventListener('click', (e) => { if (e.target === els.tuneEdit) closeTuneEdit(false); });
  els.tuneEdit.addEventListener('close', () => closeTuneEdit(false));   // Escape
  // Escape while naming: back to the buttons, the popup stays
  els.tuneEdit.addEventListener('cancel', (e) => { if (!els.tuneNaming.hidden) { e.preventDefault(); endNaming(); } });
  els.tuneSave.addEventListener('click', startNaming);
  els.tuneSaveName.addEventListener('input', updateNaming);
  els.tuneNameCancel.addEventListener('click', endNaming);
  els.tuneNaming.addEventListener('submit', (e) => { e.preventDefault(); saveTune(); });   // Save, or Enter
  // Delete a saved tuning
  els.tuneDeleteGo.addEventListener('click', deleteTuning);
  els.tuneDeleteCancel.addEventListener('click', closeDeleteTuning);
  els.tuneDeleteClose.addEventListener('click', closeDeleteTuning);
  els.tuneDelete.addEventListener('click', (e) => { if (e.target === els.tuneDelete) closeDeleteTuning(); });
  els.tuneDelete.addEventListener('close', () => { deleting = null; });   // Escape

  for (const [id, key] of TOGGLES) {
    els[id].addEventListener('click', () => {
      state[key] = !state[key];
      render();
    });
  }

  setupNeckTaps();
  startAudioEarly();
  onPress(els.chordTones, '[data-midi]', (card) => {
    playNote(Number(card.dataset.midi));
    ping(card.querySelector('.np-deg'));   // its interval pill, like the note on the neck
    if (card.dataset.key !== undefined) flashKey(card.dataset.key); else flashCell(card.dataset.s, card.dataset.f);
    keepChord();
  });
  // Strum buttons: tapped, they strum; held, the chord one note at a time
  // (onHold: they sound once let go, or held long enough; a swipe to scroll
  // that starts on them plays nothing). A click from the keyboard (Enter,
  // or Space on a button reached with Tab) strums. The dock's button plays
  // what its stepper shows (ui.dockMode): the chord, or the scale group;
  // the groups' own stepper's, the group, one note at a time either way, on
  // press (onPress)
  onHold(els.chordStrum, strumTapped, arpeggiate);
  onHold(els.dockStrum, () => (ui.dockMode === 'group' ? playGroup() : strumTapped()), () => (ui.dockMode === 'group' ? playGroup() : arpeggiate()));
  onPress(els.quickGroupPlay, null, playGroup);

  // Name a chord: in and out, Mute, Clear, the names; Play sounds on press
  els.namerOpen.addEventListener('click', openNamer);
  els.namerSelect.addEventListener('click', () => closeNamer(true));
  els.namerCancel.addEventListener('click', () => closeNamer(false));
  els.namerClear.addEventListener('click', namerClear);
  els.namerUp.addEventListener('click', () => namerMove(namerUpStep()));
  els.namerDown.addEventListener('click', () => namerMove(-namerUpStep()));
  els.namerPrev.addEventListener('click', () => namerStep(-1));
  els.namerNext.addEventListener('click', () => namerStep(1));
  els.namerMute.addEventListener('click', () => { state.muteTaps = !state.muteTaps; render(); });
  els.namerAlt.addEventListener('click', () => {
    const r = namerReadings()[naming.pick];
    const other = r && otherRoot(r.root, ownChordSpelling(r.root, r.def).root);
    if (!other) return;
    Object.assign(naming, namerLetter(r) !== null ? { letter: null, letterRoot: null, letterAt: 0 } : { letter: other.letter, letterRoot: mod12(r.root), letterAt: nameShift() });
    render();
  });
  // Alternative root: the root's other name for the scale, or for the chord
  // (and its chip: see keepLetter); off, its key's again
  els.tglScaleAlt.addEventListener('click', () => {
    const sc = currentScale();
    const other = sc && otherRoot(sc.root, sc.spell.root);
    if (!other) return;
    Object.assign(state.scale, letterPair(letterOf(state.scale) !== null ? null : other.letter));
    render();
  });
  els.tglChordAlt.addEventListener('click', () => {
    const ch = currentChord();
    const other = ch && !scaleRootName(ch.root) && otherRoot(ch.root, ch.spell.root);
    if (!other) return;
    Object.assign(state.chord, letterPair(letterOf(state.chord) !== null ? null : other.letter));
    keepLetter(recentEntry());
    render();
  });
  onHold(els.namerPlay, strumTapped, arpeggiate);

  // The chord list and the recent chords: tap to switch, × on the current
  // list chip to take it out, + on a recent one to put it in, Clear to
  // start over
  for (const list of [els.dockRecentList, els.recentList]) {
    // The × and the + act only when the press started on them (a drag
    // ending over one, or a press that slid onto it, does nothing)
    let pressed = null;
    list.addEventListener('pointerdown', (e) => { pressed = e.target.closest('[data-remove], [data-pin]'); }, true);
    list.addEventListener('click', (e) => {
      const side = e.target.closest('[data-remove], [data-pin]');
      if (side) {
        if (e.detail !== 0 && side !== pressed) return;
        if (side.dataset.remove !== undefined) unpinChord(Number(side.dataset.remove));
        else pinChord(Number(side.dataset.pin));
        return;
      }
      const chip = e.target.closest('[data-i], [data-r]');
      if (chip) playChip(chip.dataset.i !== undefined ? state.list[Number(chip.dataset.i)] : state.recent[Number(chip.dataset.r)]);
    });
  }
  for (const list of [els.dockRecentList, els.recentList]) {
    setupChipDrag(list);
    list.addEventListener('scroll', () => scrollHint(list), { passive: true });
    if (window.ResizeObserver) new ResizeObserver(() => { scrollHint(list); fitDashes(list); }).observe(list);   // shown, rotated, resized
  }
  els.dockRecentClear.addEventListener('click', askClearRecent);
  els.recentClear.addEventListener('click', askClearRecent);
  els.resetAll.addEventListener('click', askReset);
  els.resetAskGo.addEventListener('click', resetAll);
  els.resetAskCancel.addEventListener('click', closeReset);
  els.resetAskClose.addEventListener('click', closeReset);
  els.resetAsk.addEventListener('click', (e) => { if (e.target === els.resetAsk) closeReset(); });
  els.listClearGo.addEventListener('click', clearRecent);
  els.listClearRecentGo.addEventListener('click', clearRecentOnly);
  els.listClearCancel.addEventListener('click', closeClearRecent);
  els.listClearClose.addEventListener('click', closeClearRecent);
  els.listClear.addEventListener('click', (e) => { if (e.target === els.listClear) closeClearRecent(); });

  // Dock (phones): shape bar, tabs and the sheet they open
  // The dock's stepper: the chord's shapes or the scale's groups, as it shows (renderDock)
  const dockGroups = () => ui.dockMode === 'group';
  els.dockPrev.addEventListener('click', () => (dockGroups() ? selectGroup(ui.group - 1) : stepShape(-1)));
  els.dockNext.addEventListener('click', () => (dockGroups() ? selectGroup(ui.group + 1) : stepShape(1)));
  els.dockShape.addEventListener('click', () => showPanel(dockGroups() ? 'scale' : 'chord'));
  // The groups' stepper (wide screens, in the quick bar)
  els.quickGroupPrev.addEventListener('click', () => selectGroup(ui.group - 1));
  els.quickGroupNext.addEventListener('click', () => selectGroup(ui.group + 1));
  els.quickGroupInfo.addEventListener('click', () => showPanel('scale'));
  for (const tab of els.tabs) tab.addEventListener('click', () => openTab(tab.dataset.tab));
  setupSheetDrag();
  setupFolds();
  setupInfoFit();
  setupDockTouch();

  // Switching between phone and wide layouts (rotating, resizing)
  const relayout = () => {
    placeSettings();
    if (isWide()) ui.tab = null;
    render();
    requestAnimationFrame(refocus);   // (once the new layout is in place)
  };
  if (wideMedia.addEventListener) wideMedia.addEventListener('change', relayout);
  else wideMedia.addListener(relayout);
  if (window.ResizeObserver) {
    new ResizeObserver(() => { drawGroups(); fitScroll(); queueStrip(); }).observe(els.neck);   // keep group outlines on their cells
    new ResizeObserver(() => fitScroll()).observe(els.neck.parentElement);   // (the panel narrower or wider: see fitScroll)
  }
  // The strip follows the page (phones) and the neck's own scroll (wide screens)
  window.addEventListener('scroll', queueStrip, { passive: true });
  window.addEventListener('resize', queueStrip, { passive: true });
  window.addEventListener('resize', () => { if (els.picker.open) peekPicker(); }, { passive: true });
  els.neck.parentElement.addEventListener('scroll', queueStrip, { passive: true });

  // Moving the capo keeps the chord and shows its first shape from the capo
  // (named from the capo: the same shape and name, see moveCapo). Under the
  // the title, the Names from capo switch (see capoSwitch): a tap on it
  // leaves the menu open
  const openCapo = () => openPicker({
    title: 'Capo', layout: 'roots', value: capo(),
    groups: [
      { items: [{ value: 0, label: 'No capo', cls: 'none', style: 'grid-column: 1 / -1' }] },
      { label: 'Fret where the capo sits', items: Array.from(
        { length: maxCapo(state.instrument) },
        (_, i) => ({ value: i + 1, label: String(i + 1) })) },
    ],
    tools: capoSwitch(),
    onPick: (v) => {
      if (!Number(v) && capo()) ui.groupAt = null;   // (the capo taken off: back to the first group)
      moveCapo(Number(v));
      render();
    },
    onToggle: () => {   // (only the switch changes in the menu: the rest stays as it is, focus too)
      state.nameFromCapo = !state.nameFromCapo;
      render();
      const sw = els.pickerTools.querySelector('#tglNameFromCapo');
      if (sw) sw.setAttribute('aria-pressed', String(state.nameFromCapo));
    },
  });
  els.capoSelect.addEventListener('click', openCapo);

  // Clearing the chord or the scale also closes its panel on phones
  const clearChord = () => { chordOff(); ui.tab = null; render(); };
  const clearScale = () => {   // closes the sheet: centre the shape again, as on closing it
    const wasOpen = ui.tab !== null;
    scaleOff();
    ui.tab = null;
    render();
    if (wasOpen) revealFocus();
  };

  // Root and type buttons open the picker popup. Root alone never turns a
  // chord or scale on: "None" in the type menu means off
  els.chordRoot.addEventListener('click', () => openPicker({
    title: 'Chord root', layout: 'roots', value: state.chord.root,
    note: state.chord.on ? fitsNote(currentScale()) : rootNote(currentScale()),
    noteNone: 'No root fits this chord type and scale',
    // (a root the scale shown names: that name alone, see chordSpelling)
    // (a chord on: the name the pick will have, see menuOutcome)
    groups: rootItems((pc) => {
      const named = scaleRootName(pc);
      if (named) return [named, null];
      if (!state.chord.on) return typedLines(pc, null, true);
      const def = findChord(state.chord.type);
      const used = ownChordSpelling(pc, def, menuOutcome(pc, def).letter).root;
      return [used, otherRoot(pc, used)];
    },
      state.chord.on ? (pc) => fitsScale(pc, findChord(state.chord.type), currentScale()) : (pc) => inScale(pc, currentScale())),
    onPick: (v) => {
      const root = Number(v);
      if (state.chord.on) updateChord({ root });
      else { state.chord.root = root; render(); }
    },
  }));
  els.chordType.addEventListener('click', () => openPicker({
    title: 'Chord type', note: fitsNote(currentScale()), noteNone: 'No chord type fits this root and scale',
    groups: [{ items: [{ value: '', label: 'None', sub: 'Hide the chord', cls: 'none' }] }, ...CHORDS.map((g) => ({
      label: g.group,
      items: g.items.map((c) => ({
        value: c.id,
        label: c.name,
        // (as the pick will have it, see menuOutcome: its root's name, its
        // notes, in brackets those a shape may leave out, here: this
        // instrument and the bass note it will have)
        ...(() => {
          const out = menuOutcome(state.chord.root, c);
          const spell = chordSpelling(state.chord.root, c, out.letter);
          const optional = optionalTones(c, String(out.bass), Boolean(instrument().piano));
          return { tag: noteText(spell.root) + c.symbol, sub: spell.notes.map((n, i) => (optional.has(i) ? `(${noteText(n)})` : noteText(n))).join(' ') };
        })(),
        cls: fitsScale(state.chord.root, c, currentScale()) ? 'fits' : '',
      })),
    }))],
    value: state.chord.on ? state.chord.type : '',
    onPick: (v) => (v ? updateChord({ type: v }) : clearChord()),
  }));
  els.scaleRoot.addEventListener('click', () => openPicker({
    title: 'Scale root', layout: 'roots', value: state.scale.root,
    // (another root: written as its key has it, the switch off; its own,
    // as it is, see onPick)
    groups: rootItems((pc) => {
      if (!state.scale.on || pc !== state.scale.root) return typedLines(pc, state.scale.on ? findScale(state.scale.type) : null);
      const used = scaleSpelling(pc, findScale(state.scale.type)).root;
      return [used, otherRoot(pc, used)];
    }),
    onPick: (v) => {
      if (Number(v) !== state.scale.root) Object.assign(state.scale, letterPair(null));
      state.scale.root = Number(v);
      render();
    },
  }));
  els.scaleType.addEventListener('click', () => openPicker({
    title: 'Scale type',
    groups: [{ items: [{ value: '', label: 'None', sub: 'Hide the scale', cls: 'none' }] }, ...SCALES.map((g) => ({
      label: g.group,
      items: g.items.map((sc) => ({
        value: sc.id,
        label: sc.name,
        sub: sc.steps.length >= 12 ? 'All 12 notes' : scaleSpelling(state.scale.root, sc).notes.map(noteText).join(' '),
      })),
    }))],
    value: state.scale.on ? state.scale.type : '',
    onPick: (v) => {
      if (!v) { clearScale(); return; }
      Object.assign(state.scale, { type: v, on: true });
      render();
    },
  }));
  els.pickerBody.addEventListener('click', (e) => {
    const remove = e.target.closest('[data-remove]');
    if (remove) { if (pickerRemove) pickerRemove(remove.dataset.remove); return; }
    const pick = e.target.closest('.pick');
    if (!pick) return;
    const handler = pickerPick;
    closePicker();
    if (handler) handler(pick.dataset.value);
  });
  els.pickerClose.addEventListener('click', closePicker);
  els.pickerTools.addEventListener('click', (e) => { if (e.target.closest('[data-toggle]') && pickerToggle) pickerToggle(); });
  // Share popup: opened from the header
  els.shareOpen.addEventListener('click', openShare);
  els.shareClose.addEventListener('click', closeShare);
  els.share.addEventListener('click', (e) => { if (e.target === els.share) closeShare(); });
  for (const [btn, key] of [[els.shareNeck, 'neck'], [els.shareChord, 'chord'], [els.shareScale, 'scale'], [els.shareRecent, 'list']]) {
    btn.addEventListener('click', () => { state.share[key] = !state.share[key]; saveState(); renderShare(); });
  }
  els.shareGo.addEventListener('click', shareLink);
  els.shareText.addEventListener('click', shareTextOnly);
  // Open link popup
  for (const [btn, key] of [[els.linkNeck, 'neck'], [els.linkChord, 'chord'], [els.linkScale, 'scale'], [els.linkList, 'recent']]) {
    btn.addEventListener('click', () => { pendingLink.parts[key] = !pendingLink.parts[key]; renderLinkPopup(); });
  }
  els.linkLoad.addEventListener('click', () => closeLink(true));
  els.linkKeep.addEventListener('click', () => closeLink(false));
  els.linkClose.addEventListener('click', () => closeLink(false));
  els.linkOpen.addEventListener('click', (e) => { if (e.target === els.linkOpen) closeLink(false); });
  els.linkOpen.addEventListener('close', () => closeLink(false));   // Escape
  // Play (Stop) on press, like the strum buttons; from the keyboard too
  onPress(els.scalePlay, null, playScale);
  // A note of the Notes row: heard on press (a swipe to scroll the row plays nothing)
  onPress(els.scaleNotes, '.scale-note', (note) => playScaleNote(Number(note.dataset.i)));
  // About popup: opened from the header, closed like the picker
  els.aboutOpen.addEventListener('click', () => { if (els.about.showModal) els.about.showModal(); else els.about.setAttribute('open', ''); });
  const closeAbout = () => { if (els.about.close) els.about.close(); else els.about.removeAttribute('open'); };
  els.aboutClose.addEventListener('click', closeAbout);
  els.about.addEventListener('click', (e) => { if (e.target === els.about) closeAbout(); });
  // A tap on the dimmed backdrop (outside the card) closes the popup
  els.picker.addEventListener('click', (e) => { if (e.target === els.picker) closePicker(); });
  els.chordInversion.addEventListener('click', () => {
    const def = findChord(state.chord.type);
    const spell = chordSpelling(state.chord.root, def, letterOf(state.chord));
    openPicker({
      title: 'Inversion', value: inversionFor(def),
      groups: [{ items: [   // (one section: no heading)
        ...chordTones(state.chord.root, def).map((t, i) => ({
          value: String(i),
          label: INVERSION_NAMES[i],
          tag: noteText(spell.notes[i]),
          sub: i === 0 ? 'Root in the bass' : `${fmtDeg(t.deg)} in the bass`,
        })),
        { value: 'any', label: 'Any bass note', sub: 'Any inversion' },
      ] }],
      onPick: (v) => { state.inversion[state.instrument] = v; updateChord({}); },
    });
  });
  els.chordClear.addEventListener('click', clearChord);
  els.shapePrev.addEventListener('click', () => stepShape(-1));
  els.shapeNext.addEventListener('click', () => stepShape(1));
  els.shapeList.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-shape]');
    if (chip) selectShape(Number(chip.dataset.shape));
  });
  els.groupPrev.addEventListener('click', () => selectGroup(ui.group - 1));
  els.groupNext.addEventListener('click', () => selectGroup(ui.group + 1));
  els.groupList.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-group]');
    if (chip) selectGroup(Number(chip.dataset.group));
  });

  els.scaleClear.addEventListener('click', clearScale);
  els.scaleTriads.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-type]');
    if (chip) updateChord({ root: Number(chip.dataset.root), type: chip.dataset.type });
  });

  // ← / → cycle through the shapes, Space strums, Escape closes the open
  // sheet. With no chord, or the groups last acted on (keysOnGroups), ← / →
  // step through the scale's groups and Space plays the one shown. Space strums as soon as it is pressed, once per press. It is left
  // to a focused button only when you are moving around with the keyboard
  // (Tab): a button that has the focus after a click or a tap (Strum, a
  // switch, or the menu button a popup hands the focus back to) would
  // otherwise take Space and act on it.
  // A control that takes the keyboard focus shows whole, with its focus ring
  // (browsers leave one that is half out of a scrolling row where it is, its
  // ring cut off): the row, the popup or the page scrolls just enough (the
  // room is the controls' scroll-margin in styles.css). Taps and clicks
  // scroll nothing.
  /* The focus moved with the keyboard: Tab, or an arrow (Home, End...) that
     moved it; not a shortcut (Space, Escape, T: the focus they put back on a
     button is no reason to show it), nor a click or tap. html.keyboard: its
     rings shown (styles.css), only then */
  let keyboardFocus = false;
  const setKeyboardFocus = (on) => { keyboardFocus = on; document.documentElement.classList.toggle('keyboard', on); };
  const MOVE_KEYS = new Set(['Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown']);
  let moveKeyAt = -Infinity;
  document.addEventListener('pointerdown', () => { setKeyboardFocus(false); moveKeyAt = -Infinity; }, true);
  document.addEventListener('keydown', (e) => {
    if (!MOVE_KEYS.has(e.key)) return;
    moveKeyAt = performance.now();
    if (e.key === 'Tab') setKeyboardFocus(true);
  }, true);
  document.addEventListener('focusin', (e) => {
    if (performance.now() - moveKeyAt < 250) setKeyboardFocus(true);   // (an arrow, a moment ago: it moved the focus)
    if (keyboardFocus && e.target.matches && e.target.matches(':focus-visible')) e.target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, true);
  const popupOpen = () => !!document.querySelector('dialog[open]');
  const spaceStrums = (e) => e.key === ' ' && !popupOpen() && !e.altKey && !e.ctrlKey && !e.metaKey &&
    !e.target.closest('input, textarea') && !(e.target.closest('button') && keyboardFocus);
  // Space, as a strum button (onHold): tapped, the strum, once let go; held
  // (HOLD_MS), the chord one note at a time; pressed while that plays, it
  // stops. (When the keys step the groups: the group, at once.)
  let spaceHold = null;   // { timer }, or { stopped }: a press under way
  const spaceDown = () => {
    if (spaceHold) return;
    if (arpRun) { stopArpeggio(); spaceHold = { stopped: true }; return; }
    spaceHold = { timer: setTimeout(() => { spaceHold = { stopped: true }; arpeggiate(); }, HOLD_MS) };
  };
  const spaceUp = () => {
    const press = spaceHold;
    spaceHold = null;
    if (press && !press.stopped) { clearTimeout(press.timer); strumTapped(); }
  };
  window.addEventListener('blur', () => { if (spaceHold) clearTimeout(spaceHold.timer); spaceHold = null; });   // (let go elsewhere: nothing)
  document.addEventListener('keyup', (e) => {
    if (!spaceStrums(e)) return;
    e.preventDefault();   // no click on release
    spaceUp();
  });
  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (popupOpen()) return;   // a popup handles its own keys (Escape closes it)
    if (naming) {   // Name a chord: Escape leaves it, Space plays the notes placed, ← / → the names
      if (e.key === 'Escape') { e.preventDefault(); closeNamer(false); return; }
      if (spaceStrums(e)) { e.preventDefault(); if (!e.repeat) spaceDown(); }
      else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.target.closest('input, textarea')) {
        e.preventDefault();
        namerStep(e.key === 'ArrowRight' ? 1 : -1);   // another name, the same notes
      }
      return;
    }
    if (e.key === 'Escape' && ui.tab) { openTab(null); return; }
    if (e.target.closest('input, textarea')) return;
    if (spaceStrums(e)) {
      e.preventDefault();
      if (!e.repeat) { if (keysOnGroups()) playGroup(); else spaceDown(); }   // (held: once, see spaceDown)
      return;
    }
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const step = e.key === 'ArrowRight' ? 1 : -1;
    const ch = currentChord();
    if (keysOnGroups(ch)) {
      if (ui.groups.length > 1) { e.preventDefault(); selectGroup(ui.group + step); }
      return;
    }
    if (!ch || ch.shapes.length < 2) return;
    e.preventDefault();
    selectShape(ch.index + step);
  });

  placeSettings();
  render();
  if (pendingLink) openLinkPopup();
  keepScreenOn();
  installable();
  setupInstallTip();
}

/* Keep the screen from dimming while Frettle is open (handy on a music
   stand). The browser drops the lock when the page is hidden, so it is asked
   for again when the page comes back, and on taps for browsers that only
   allow it after a user gesture. */
let wakeLock = null;
async function keepScreenOn() {
  if (!('wakeLock' in navigator) || wakeLock || document.visibilityState !== 'visible') return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } catch {
    /* refused (battery saver, unsupported context): the screen dims as usual */
  }
}
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', keepScreenOn);
  // Other tabs: their settings and library, as they save them (see saveState)
  window.addEventListener('storage', (e) => { if (e.key === STORAGE_KEY) syncShared(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncShared(); });
  document.addEventListener('pointerdown', keepScreenOn);
}

/* Offline support and "Add to home screen": register the service worker
   (only possible when the site is served over http(s), not from a file). */
function installable() {
  if (!('serviceWorker' in navigator) || !location.protocol.startsWith('http')) return;
  navigator.serviceWorker.register('sw.js').catch(() => { /* offline use simply stays unavailable */ });
}

/* Suggest installing the app, gently: only in a browser that can (or
   where it can be done by hand: not in another app's built-in browser),
   only if not installed already, and only once the app has been in use a
   while on this visit (a minute on screen and a few taps), at a pause
   (a few seconds without one), never right away. It stays until answered. "Not now": asked once more on a visit a
   week or more later (again after a while); "Not now" again, or the app
   installed: never again. "Install": the browser's own install where it
   offers one, else the steps for this browser. */
const INSTALL_KEY = 'frettle-install-tip';
const INSTALL_AFTER = 60;    // seconds on screen this visit
const INSTALL_TAPS = 6;      // ... and presses (a touch, a click or a key)
const INSTALL_PAUSE = 3000;  // ms without one, just before
const INSTALL_AGAIN = 7 * 24 * 3600 * 1000;   // ms before asking the second time
function setupInstallTip() {
  const tip = document.getElementById('installTip');
  const text = document.getElementById('installText');
  const later = document.getElementById('installLater');
  const now = document.getElementById('installNow');
  // To try it: the address with ?install-tip shows it at once, whatever was
  // answered before, and keeps no answer
  const trying = new URLSearchParams(location.search).has('install-tip');
  const read = () => { try { return JSON.parse(localStorage.getItem(INSTALL_KEY)) || {}; } catch { return {}; } };
  const write = (v) => { if (trying) return; try { localStorage.setItem(INSTALL_KEY, JSON.stringify(v)); } catch { /* not kept: asked again next visit */ } };
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  if (standalone && !trying) { write({ ...read(), installed: true }); return; }
  let offer = null;   // the browser's own install (Chrome, Edge, Samsung Internet...)
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); offer = e; });   // (its own banner: not shown, this one is, later)
  window.addEventListener('appinstalled', () => { write({ ...read(), installed: true }); tip.hidden = true; });

  // Where installing is done by hand: the steps (null: not possible here,
  // without the browser's own). Not in another app's built-in browser
  // (Instagram, Facebook...: no "Add to Home Screen" there): on iPhones those
  // leave Safari's name out of theirs, or add their own. Chrome, Edge,
  // Samsung Internet on Android offer their own install (none: installed
  // already, or not possible).
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const inApp = /FBAN|FBAV|Instagram|Line\/|MicroMessenger|Snapchat|TikTok|musical_ly|Bytedance|Pinterest|LinkedInApp|GSA\/|; wv\)/.test(ua) || (ios && !/Safari\//.test(ua));
  const macSafari = !ios && /Macintosh/.test(ua) && /Version\/(\d+)/.test(ua) && Number(ua.match(/Version\/(\d+)/)[1]) >= 17 && /Safari/.test(ua) && !/Chrome|Chromium|Edg|Firefox|OPR/.test(ua);   // ("Add to Dock": Safari 17 on)
  const SHARE_ICON = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>';
  const steps = inApp ? null
    : ios ? `Tap ${SHARE_ICON} Share, then “More” (if shown), then “Add to Home Screen”.`
      : macSafari ? 'In the menu bar: File, then “Add to Dock”.'
        : /Android/.test(ua) && /Firefox/.test(ua) ? 'Open the menu (⋮), then “Install”.'
          : trying ? 'Open the browser’s menu, then “Install” or “Add to Home Screen”.'   // (trying it where the browser offers its own, or none)
            : null;

  const due = () => {
    const v = read();
    if (v.installed || (v.declined || 0) >= 2) return false;
    return !v.declined || Date.now() - (v.at || 0) >= INSTALL_AGAIN;
  };
  if (!due() && !trying) return;
  // Installed already? Chrome and Edge can tell (manifest.json:
  // related_applications); elsewhere it can't be known from the browser
  let installed = false;
  if (navigator.getInstalledRelatedApps) {
    navigator.getInstalledRelatedApps().then((apps) => {
      if (apps.length) { installed = true; write({ ...read(), installed: true }); }
    }).catch(() => { /* unknown: as if not */ });
  }
  const answer = () => {   // "Not now", or the steps read
    const v = read();
    write({ ...v, declined: (v.declined || 0) + 1, at: Date.now() });
    tip.hidden = true;
  };
  later.addEventListener('click', answer);
  now.addEventListener('click', async () => {
    if (offer) {
      const asked = offer;
      offer = null;   // (the browser's install asks only once)
      asked.prompt();
      const { outcome } = await asked.userChoice.catch(() => ({ outcome: 'dismissed' }));
      if (outcome === 'accepted') { write({ ...read(), installed: true }); tip.hidden = true; } else answer();
      return;
    }
    text.innerHTML = `<strong>How to install</strong><span>${steps}</span>`;
    later.hidden = true;
    now.textContent = 'Done';
    now.classList.remove('primary');
    now.onclick = answer;   // (replaces this handler's work: the steps are read)
  }, { once: true });
  if (trying) { tip.hidden = false; return; }

  // On screen and in use a while (time only counts while the page shows)
  let seconds = 0;
  let taps = 0;
  let lastTap = 0;
  const tap = () => { taps++; lastTap = performance.now(); };
  document.addEventListener('pointerdown', tap, true);
  document.addEventListener('keydown', tap, true);
  const tick = setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    seconds++;
    if (installed) { clearInterval(tick); return; }
    if (seconds < INSTALL_AFTER || taps < INSTALL_TAPS || performance.now() - lastTap < INSTALL_PAUSE) return;
    if (document.querySelector('dialog[open]') || !(offer || steps)) return;   // (a menu open: once it closes; no way to install yet: maybe later)
    clearInterval(tick);
    document.removeEventListener('pointerdown', tap, true);
    document.removeEventListener('keydown', tap, true);
    tip.hidden = false;
  }, 1000);
}

if (typeof document !== 'undefined') init();

/* Node (test/, which runs the four parts without a page, see
   test/frettle.js): the parts the tests check, none of them the interface */
if (typeof module !== 'undefined') {
  module.exports = {
    detectPitch, hzMidi, midiHz, metroClick, meterLevels, tempoName, METERS,
    INSTRUMENTS, TUNINGS, tunedInstrument, findInstrument, startFret, shapePitch, PIANO_LOW, PIANO_KEYS,
    ALL_CHORDS, findChord, chordTones, findShapes, pianoShapes, barresFor, fingersFor, tabOf,
    shapeCandidates, pickShapes, chartShape, SHAPE_WEIGHTS,
    ALL_SCALES, spellScale, spellChord, rootNames, noteText, pitchText, plainNote,
    readChord, noteToken, ownChordSpelling,
    nameChord, describeChord, customChord, chordOf, degreesOver, intervalOf, intervalDegree,
    scaleGroups, groupsFor: scaleGroups, REACH, MAX_FINGERS, mergeShared, loadState, sharedForm, SAVE_VERSION };
}
