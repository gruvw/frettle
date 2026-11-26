'use strict';

/* Frettle's script, part 2 of 4 (see music.js): the state, what is saved
   and shared. */

/* ==========================================================================
   3. State (instrument, switches, chord and scale are saved to
   localStorage, the tuning, capo and inversion for each instrument; the
   shape shown comes back as its chip remembers it)
   ========================================================================== */
function defaultState() {
  return {
    instrument: 'guitar',
    flats: false,
    allTones: false,
    scaleOnly: true,                  // hide the notes that are not in the scale
    scaleGroups: true,                // outline the scale one hand-sized group at a time
    leftHanded: false,                // mirror the neck
    octaves: false,
    muteTaps: false,                  // Name a chord: notes placed are silent
    nameFromCapo: true,               // with a capo, names as played above it (see nameShift)
    tuning: {},                       // tuning id per instrument ('custom': your own; 'saved:…': a saved one, see savedId)
    capo: {},                         // fret of the capo per instrument (none: left out)
    custom: {},                       // your own tuning per instrument: open string pitches
    saved: {},                        // saved tunings per instrument: [{ name, strings }]
    chord: { on: true, root: 0, type: 'maj', letter: null, letterAt: 0 },   // off: type null (see chordOff); letter: the letter its root is written with, picked (its other name) or a link's (F𝄪dim; see chordSpelling), under the naming shift letterAt (see letterOf)
    list: [],                         // the chord list, as built [{ root, type, bass, letter, inversions, shapes, used }], shared by all instruments
    recent: [],                       // the last chords used that are not in it (RECENT_KEEP kept, RECENT_MAX shown), newest first
    drawn: [],                        // custom shapes (Name a chord): [{ root, type, neck, frets }], newest last (see listShapes)
    inversion: { ...DEFAULT_INVERSION },  // per instrument
    shape: null,                      // index in the shape list, this visit only (null: the chord's home shape, homeShape)
    loose: false,                     // the chord on screen is a link's, on a shape its chip does not have: shown apart from it (see applyLink)
    scale: { on: true, root: 0, type: 'major', letter: null, letterAt: 0 },   // off: type null (see scaleOff); letter: its root's other name, picked (see scaleSpelling), under letterAt (see letterOf)
    share: { neck: true, chord: true, scale: true, list: true },   // what the Share popup puts in the link (list: the chord list; once 'recent', off by default, so an old saved choice is not read)
    folded: { chord: false, scale: false },   // wide screens: a panel folded to its title row
  };
}

// The settings that are switches, saved for all instruments and tabs
const PREF_SWITCHES = ['flats', 'allTones', 'octaves', 'scaleOnly', 'scaleGroups', 'leftHanded', 'muteTaps', 'nameFromCapo'];
/* Saved settings, in two parts: how you like to see things (prefs), and
   what is on the neck (work: the neck, chord, scale and chord list, the
   parts a link can hold, written the same way as in a link). Each value is
   checked as it is read; a wrong or missing one keeps its default. */
// What is saved, as written (saveState), or null
function readSaved() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    return saved && saved.v === SAVE_VERSION ? saved : null;
  } catch { return null; }
}
// A state from what is saved (by default, what is in storage now)
function loadState(saved) {
  const s = defaultState();
  try {
    if (saved === undefined) {
      for (const key of OLD_STORAGE_KEYS) localStorage.removeItem(key);
      saved = readSaved();
    }
    if (!saved || saved.v !== SAVE_VERSION) return s;
    const prefs = saved.prefs || {};
    const work = saved.work || {};
    for (const k of PREF_SWITCHES) {
      if (typeof prefs[k] === 'boolean') s[k] = prefs[k];
    }
    for (const k of Object.keys(s.share)) {
      if (prefs.share && typeof prefs.share[k] === 'boolean') s.share[k] = prefs.share[k];
    }
    for (const k of Object.keys(s.folded)) {
      if (prefs.folded && typeof prefs.folded[k] === 'boolean') s.folded[k] = prefs.folded[k];
    }
    if (readInstrument(work.instrument)) s.instrument = work.instrument;
    for (const { id } of INSTRUMENTS) {
      // Saved tunings: each with a name and its notes, none twice
      for (const e of Array.isArray(work.saved && work.saved[id]) ? work.saved[id] : []) {
        const name = cleanName(e && e.name);
        const notes = e && readCustom(id, e.tuning);
        if (!name || !notes || savedTunings(id, s.saved).some((t) => sameStrings(t, notes))) continue;
        (s.saved[id] = s.saved[id] || []).push({ name, strings: notes });
      }
      const strings = readCustom(id, work.custom && work.custom[id]);
      if (strings) s.custom[id] = strings;
      const t = work.tuning && work.tuning[id];
      const known = t === 'custom' ? strings
        : String(t).startsWith('saved:') ? savedTunings(id, s.saved).some((x) => x.id === t) : readTuning(id, t);
      if (known) s.tuning[id] = t;
      const preset = strings && matchTuning(id, strings, s.saved);
      if (preset && s.tuning[id] === 'custom') s.tuning[id] = preset.id;   // the same as a preset (or a saved one): that one
      if (strings && sameStrings(tuningsOf(id)[0], strings)) delete s.custom[id];   // standard: nothing kept ("Tune each string")
      // (one capo for all instruments, as it was first saved: the instrument on screen keeps it)
      const c = readCapo(typeof work.capo === 'number' ? (id === s.instrument ? work.capo : 0) : work.capo && work.capo[id], id);
      if (c) s.capo[id] = c;
    }
    for (const { id } of INSTRUMENTS) {
      const v = work.inversion && work.inversion[id];
      if (INVERSIONS.includes(v)) s.inversion[id] = v;
    }
    const chord = readChord(work.chord);
    if (chord) s.chord = chord.def ? { on: true, root: chord.root, type: chord.def.id, ...readPlayed(chord, work.chordName, work.chordNameAt, chordNameAs) } : { on: false, root: chord.root, type: null, ...letterPair(null) };
    s.chordBass = chord && chord.def ? chord.bass : null;   // (which of its chips was on screen: see init)
    s.looseFrets = chord && chord.def && chord.frets ? chord.frets : null;   // (a chord shown apart from its chip: its shape, see init)
    const scale = readScale(work.scale);
    if (scale) s.scale = scale.def ? { on: true, root: scale.root, type: scale.def.id, ...readPlayed(scale, work.scaleName, work.scaleNameAt, rootAs) } : { on: false, root: scale.root, type: null, ...letterPair(null) };
    // (its bass: saved since chips are told apart by it; as saved before, worked out in init)
    const entry = (e) => {
      const r = e && readChord(e.chord);
      if (!r || !r.def) return null;
      const bass = Number.isInteger(e.bass) && e.bass >= 0 && e.bass < r.def.steps.length ? e.bass : undefined;
      const at = readShift(e.nameAt);   // (its root's name when not its usual one: picked, or a link's, see keepLetter; under that naming shift, see letterOf)
      const letter = pickedLetter(r.root, r.def, readName(e.name), chordNameAs, at);
      return { root: r.root, type: r.def.id, bass, used: Number(e.used) || 0, inversions: readInversions(e.inversions || e.voicings), shapes: readShapes(e.shapes), ...entryPair(letterPair(letter, at)) };   // (inversions: saved before as "voicings")
    };
    const known = (r) => [...s.list, ...s.recent].some((x) => sameEntry(x, r));
    // As saved before there were recent chords, every chord kept was in the
    // list (made as you went): they all stay in it, the lone chord before a
    // list (solo) is the recent one
    const recent = Array.isArray(work.recent) ? work.recent : work.solo ? [work.solo] : [];
    for (const e of Array.isArray(work.list) ? work.list : []) {
      const r = entry(e);
      if (r && s.list.length < LIST_MAX && !known(r)) s.list.push(r);
    }
    for (const e of recent) {
      const r = entry(e);
      if (r && s.recent.length < RECENT_KEEP && !known(r)) s.recent.push(r);
    }
    // Custom shapes: their chord, neck (open strings and capo) and frets
    for (const d of Array.isArray(work.drawn) ? work.drawn : []) {
      const c = d && readChord(d.chord);
      if (!c || !c.def || !NECK_RE.test(d.neck) || !FRETS_RE.test(d.frets)) continue;
      s.drawn = s.drawn.filter((x) => !(x.root === c.root && x.type === c.def.id && x.neck === d.neck && x.frets === d.frets));
      s.drawn.push({ root: c.root, type: c.def.id, neck: d.neck, frets: d.frets });
    }
    s.drawn = s.drawn.slice(-DRAWN_MAX);
    // Which was used last, as saved: all before this visit's picks (negative)
    s.recent.map((r, i) => [r, i]).sort(([a, i], [b, j]) => a.used - b.used || i - j)
      .forEach(([r], rank) => { r.used = rank - RECENT_KEEP; });
  } catch {
    /* storage unavailable or corrupt: keep defaults */
  }
  return s;
}

/* A chord as saved: one way whatever the scale on screen spells it (D♯m
   in B major, E♭m in E♭ major, both "Ds-min"; else two tabs with different
   scales would see one chip as two, and save it back and forth) */
const savedChord = (root, type) => `${noteToken(plainNote(root, false))}-${type}`;
// (with its root's name when not its usual one: see keepLetter)
// (under the naming shift it was picked in, when not 0: see letterOf)
const savedEntry = (r) => {
  const at = Number.isInteger(r.letter) ? r.letterAt || 0 : 0;
  const name = atShift(at, () => chordNameAs(r.root, r.letter));
  return { chord: savedChord(r.root, r.type), bass: r.bass, ...(name ? { name: noteToken(name), ...(at ? { nameAt: at } : {}) } : {}), inversions: r.inversions, shapes: r.shapes };
};
// A state's shared parts as saved (see saveState): settings, saved tunings,
// the chord list and custom shapes
function sharedForm(s) {
  const { share, folded } = s;
  return copyJSON({
    prefs: { ...Object.fromEntries(PREF_SWITCHES.map((k) => [k, s[k]])), share, folded },
    saved: Object.fromEntries(Object.entries(s.saved).filter(([, list]) => list.length)
      .map(([id, list]) => [id, list.map((t) => ({ name: t.name, tuning: customText(t.strings) }))])),
    list: s.list.map(savedEntry),
    drawn: s.drawn.map((d) => ({ chord: savedChord(d.root, d.type), neck: d.neck, frets: d.frets })),
  });
}
// The state as saved: { v, prefs, work }
function savedForm() {
  const shared = sharedForm(state);
  const order = [...state.recent].sort((a, b) => a.used - b.used);   // used: 0 for the recent chord unused longest
  const shown = state.chord.on ? currentChord() : null;
  const saved = {
    v: SAVE_VERSION,
    prefs: shared.prefs,
    work: {
      instrument: state.instrument,
      tuning: state.tuning,
      custom: Object.fromEntries(Object.entries(state.custom).map(([id, strings]) => [id, customText(strings)])),
      saved: shared.saved,
      capo: state.capo,
      inversion: state.inversion,   // (each instrument's, as its menu shows it: a reload shows it again, not as worked out anew)
      // (with its bass: which of its chips it is; shown apart from it, its shape too)
      chord: shown ? chordBassText(shown.root, shown.def, shown.bassIndex, state.chord) + (state.loose && shown.shape ? `.${fretsText(shown.shape.frets)}` : '')
        : noteToken(plainNote(state.chord.root, false)),
      ...playedFields('chord', shown && playedName(state.chord, shown.root, chordNameAs)),
      scale: state.scale.on ? scaleText(state.scale.root, findScale(state.scale.type)) : noteToken(plainNote(state.scale.root, false)),
      ...playedFields('scale', state.scale.on && playedName(state.scale, state.scale.root, rootAs)),
      list: shared.list,
      recent: state.recent.map((r) => ({ ...savedEntry(r), used: order.indexOf(r) })),
      drawn: shared.drawn,
    },
  };
  return copyJSON(saved);   // (sharing nothing with the state: see saveState)
}

/* Several tabs: each shows its own view (instrument, tuning and capo, the
   custom tuning, chord, scale, inversion, recent chords: the one last
   saved is what a reload or a new tab opens on), while the settings (prefs)
   and the library (saved tunings, the chord list, custom shapes) are the
   same in all of them. A tab saving writes its view, and of the shared
   parts only what it changed since it last saw them (sharedBase), merged
   into what is stored now (mergeShared): an older tab never erases what a
   newer one saved. Another tab's save (the storage event), or this tab
   coming back into view, brings the shared parts in (syncShared). */
let sharedBase = null;     // the shared parts as this tab last read or wrote them
let viewWritten = null;    // its view as it last wrote it (nothing new: nothing written)
/* Those two are copies, sharing no object with the state: else a change on
   screen changes them too, and looks like nothing new (never saved; and
   what was saved before then comes back as another tab's: a panel unfolded
   folding again at the next save) */
const copyJSON = (x) => JSON.parse(JSON.stringify(x));
const SHARED_WORK = ['saved', 'list', 'drawn'];
const sharedOf = (saved) => ({ prefs: saved.prefs, ...Object.fromEntries(SHARED_WORK.map((k) => [k, saved.work[k]])) });
/* What is stored now, its shared parts as this tab writes them: read as a
   reload reads it (anything damaged or unknown left out), so they compare
   with this tab's, and the merge never meets what it cannot read. null:
   nothing stored */
const storedShared = () => { const stored = readSaved(); return stored ? sharedForm(loadState(stored)) : null; };
const viewOf = (saved) => Object.fromEntries(Object.entries(saved.work).filter(([k]) => !SHARED_WORK.includes(k)));
// The same content (objects whatever the order of their keys)
const sortedJSON = (x) => JSON.stringify(x, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : v));
const sameJSON = (a, b) => sortedJSON(a) === sortedJSON(b);
/* mine, changed from base (this tab's changes), into theirs (what is stored):
   - prefs: each one, mine where I changed it, else theirs
   - saved tunings, per instrument, each one known by its notes (no two the
     same; names may repeat): theirs, with the ones I added and without the
     ones I removed, mine renamed
   - the chord list, each chip known by its chord and bass: its order mine if
     I reordered it (less the chips they removed, plus the ones they added,
     last), else theirs (less the chips I removed, plus the ones I added,
     each where I put it: before the chip it is before here, else last).
     A chip in both: merged as it is edited, part by part (mergeChip), so
     two tabs' changes to different instruments are both kept
   - custom shapes, each one known by all it holds: theirs, with mine added,
     without mine removed */
function mergeShared(base, mine, theirs) {
  if (!theirs) return mine;
  base = base || { prefs: {}, saved: {}, list: [], drawn: [] };   // (never seen: all of mine is new, theirs kept)
  const prefs = { ...theirs.prefs };
  for (const k of Object.keys(mine.prefs)) if (!sameJSON(mine.prefs[k], base.prefs && base.prefs[k])) prefs[k] = mine.prefs[k];
  const keyed = (list, key) => new Map((list || []).map((x) => [key(x), x]));
  // (one in both: combine(mine, base, theirs); only in mine, mine (added
  // here); only in theirs, theirs)
  const pick = (k, B, M, T, combine) => (M.has(k) && T.has(k) ? combine(M.get(k), B.get(k), T.get(k)) : M.has(k) ? M.get(k) : T.get(k));
  const mergeSet = (b, m, t, key, combine = (mm, bb, tt) => tt, placed = false) => {
    const [B, M, T] = [keyed(b, key), keyed(m, key), keyed(t, key)];
    const out = [...T.keys()].filter((k) => !(B.has(k) && !M.has(k)));   // (less mine removed)
    const mk = [...M.keys()];
    for (let i = mk.length - 1; i >= 0; i--) {   // (plus mine added: last, or placed)
      if (B.has(mk[i]) || T.has(mk[i])) continue;
      const next = placed ? mk.slice(i + 1).find((k) => out.includes(k)) : undefined;
      out.splice(next === undefined ? out.length : out.indexOf(next), 0, mk[i]);
    }
    return out.map((k) => pick(k, B, M, T, combine));
  };
  const saved = {};
  for (const id of new Set([...Object.keys(theirs.saved || {}), ...Object.keys(mine.saved || {})])) {
    const list = mergeSet((base.saved || {})[id], (mine.saved || {})[id], (theirs.saved || {})[id], (t) => t.tuning, (m, b, t) => (b && m.name !== b.name ? m : t));
    if (list.length) saved[id] = list;
  }
  const chipKey = (e) => `${e.chord}*${e.bass}`;
  // (reordered: the chips that were and still are, in another order; adding or removing one is not)
  const [was, is] = [(base.list || []).map(chipKey), (mine.list || []).map(chipKey)];
  let list;
  if (sameJSON(is.filter((k) => was.includes(k)), was.filter((k) => is.includes(k)))) {
    list = mergeSet(base.list, mine.list, theirs.list, chipKey, mergeChip, true);
  } else {   // my order, with their removals and additions
    const [B, M, T] = [keyed(base.list, chipKey), keyed(mine.list, chipKey), keyed(theirs.list, chipKey)];
    const keys = [...M.keys()].filter((k) => !(B.has(k) && !T.has(k)));
    for (const k of T.keys()) if (!B.has(k) && !keys.includes(k)) keys.push(k);
    list = keys.map((k) => pick(k, B, M, T, mergeChip));
  }
  const drawn = mergeSet(base.drawn, mine.drawn, theirs.drawn, (d) => JSON.stringify(d)).slice(-DRAWN_MAX);
  return { prefs, saved, list: list.slice(0, LIST_MAX), drawn };
}
/* One chip in both, mine changed from base into theirs, as it is edited:
   each remembered shape (by neck setting) and inversion (by instrument),
   mine where I set it, changed it or removed it, else theirs; its name
   (the root written its other way: name and nameAt together), the same.
   Base unknown (both added it): mine where I have it, else theirs */
function mergeChip(m, b, t) {
  b = b || {};
  const byKey = (k) => {
    const [bm, mm] = [b[k] || {}, m[k] || {}];
    const out = { ...(t[k] || {}) };
    for (const key of new Set([...Object.keys(bm), ...Object.keys(mm)])) {
      if (sameJSON(mm[key], bm[key])) continue;   // (not changed here: theirs)
      if (Object.hasOwn(mm, key)) out[key] = mm[key]; else delete out[key];
    }
    return out;
  };
  const named = sameJSON([m.name, m.nameAt], [b.name, b.nameAt]) ? t : m;
  return {
    chord: t.chord, bass: t.bass,
    ...(named.name ? { name: named.name, ...(named.nameAt ? { nameAt: named.nameAt } : {}) } : {}),
    inversions: byKey('inversions'), shapes: byKey('shapes'),
  };
}
function saveState() {
  pruneDrawn();
  const own = savedForm();
  const mine = sharedOf(own);
  const view = viewOf(own);
  if (sharedBase && sameJSON(mine, sharedBase) && sameJSON(view, viewWritten)) return;   // (nothing new from this tab)
  const merged = mergeShared(sharedBase, mine, storedShared());
  const out = { v: SAVE_VERSION, prefs: merged.prefs, work: { ...view, ...Object.fromEntries(SHARED_WORK.map((k) => [k, merged[k]])) } };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(out)); } catch { /* ignore */ }
  sharedBase = copyJSON(merged);
  viewWritten = copyJSON(view);
  if (!sameJSON(merged, mine)) { adoptShared(out); requestAnimationFrame(render); }   // (another tab's changes too)
}
// The shared parts of what is saved, into this tab's state (its view kept)
function adoptShared(saved) {
  const s = loadState(saved);
  // (the shape on screen stays: shapes are picked by their place in the
  // list, and a custom shape from another tab can come in before it)
  const was = state.chord.on ? currentChord() : null;
  const keep = was && was.shape ? fretsText(was.shape.frets) : null;
  const inUse = drawnInUse();
  const drawnBefore = state.drawn;
  for (const k of PREF_SWITCHES) state[k] = s[k];
  state.share = s.share;
  state.folded = s.folded;
  // A saved tuning on screen that another tab removed: kept as a custom one
  for (const [id, t] of Object.entries(state.tuning)) {
    if (!String(t).startsWith('saved:') || savedTunings(id, s.saved).some((x) => x.id === t)) continue;
    const strings = readCustom(id, String(t).slice(6));
    if (strings) { state.custom[id] = strings; state.tuning[id] = 'custom'; } else state.tuning[id] = tuningsOf(id)[0].id;
  }
  state.saved = s.saved;
  for (const r of s.list) if (r.bass === undefined) r.bass = legacyBass(r);
  state.list = s.list;
  state.recent = state.recent.filter((r) => !state.list.some((x) => sameEntry(x, r)));   // (a chord now in the list: its chip there)
  state.drawn = s.drawn;
  // (a custom shape in use here that the other tab no longer uses: kept)
  const sameDrawn = (x, d) => x.neck === d.neck && drawnKey(x.root, x.type, x.frets) === drawnKey(d.root, d.type, d.frets);
  for (const d of drawnBefore) if (inUse.has(drawnKey(d.root, d.type, d.frets)) && !state.drawn.some((x) => sameDrawn(x, d))) state.drawn.push(d);
  const now = keep !== null ? currentChord() : null;
  if (now && (!now.shape || fretsText(now.shape.frets) !== keep)) {
    const at = now.shapes.findIndex((sh) => fretsText(sh.frets) === keep);
    if (at >= 0) state.shape = at;
  }
  // (its root's name as its chip now has it: picked in another tab, the
  // most recent; nothing saved here for it, see keepLetter)
  const entry = recentEntry();
  if (entry && state.list.includes(entry)) Object.assign(state.chord, pairOf(entry));
}
// Another tab saved (or this one comes back): the shared parts as stored now
function syncShared() {
  const theirs = storedShared();
  if (!theirs || !sharedBase) return;
  if (sameJSON(theirs, sharedBase)) return;
  const mine = sharedOf(savedForm());
  const merged = mergeShared(sharedBase, mine, theirs);
  adoptShared({ v: SAVE_VERSION, prefs: merged.prefs, work: { ...viewOf(savedForm()), ...Object.fromEntries(SHARED_WORK.map((k) => [k, merged[k]])) } });
  sharedBase = copyJSON(theirs);   // (what is stored: mine, if I had changed anything since, is written next)
  render();
}

/* Text forms shared by links and saved settings: each part is written one
   way, and read back (checked) one way.
   A note: "A", "Bb", "Fs" (sharps as s: a # would be escaped in a link).
   A chord: its root as spelled on screen, a hyphen, its type: "A-m7"; with
   a shape, its frets after a dot: "A-m7.x-0-2-0-1-0"; a root alone is no
   chord (the root kept for the menus). A scale: "A-minor-pentatonic", or a
   root alone for none. */
const noteToken = (n) => LETTERS[n.letter] + (n.acc > 0 ? 's'.repeat(n.acc) : 'b'.repeat(-n.acc));
function readName(text) {   // "A", "Bb", "Fs" (or "F#", "F♯") → the note as written, or null
  const m = /^([A-Ga-g])([#s♯]{1,3}|[b♭]{1,3})?$/.exec(text || '');   // (three: a chord's bass, C♭dim7/B♭𝄫)
  if (!m) return null;
  const acc = m[2] ? (/[#s♯]/.test(m[2]) ? 1 : -1) * m[2].length : 0;
  const letter = LETTERS.indexOf(m[1].toUpperCase());
  return { pc: mod12(LETTER_PC[letter] + acc), letter, acc };
}
const readNote = (text) => { const n = readName(text); return n ? n.pc : null; };   // → its pitch class, or null
/* A root's name as read (a link, saved settings): its letter, null when
   it is not a name of that root (as: a scale's two names, rootAs; a
   chord's, any with up to three sharps or flats, chordNameAs). Whether it
   is the usual one or not (the Alternative root switch on) depends on
   where it shows (the Flats setting, the scale shown), so that is settled
   then, when it shows: see settleLetters, keepLetter. */
// (at: the naming shift the name is written under, see letterOf: a name as
// played above a capo; 0, as everything else is written, as it sounds)
function pickedLetter(root, def, name, as = rootAs, at = 0) {   // (as: chordNameAs for a chord's)
  return atShift(at, () => (name && def && mod12(name.pc + at) === mod12(root) && as(root, name.letter) ? name.letter : null));
}
// (a naming shift as read: a capo's fret, else 0)
const readShift = (v) => (Number.isInteger(v) && v > 0 && v <= MAX_CAPO ? v : 0);
/* A root's name picked under a capo (see letterOf), as saved or shared:
   apart from the name as it sounds (which a reader with no capo, or the
   switch off, or an older Frettle, reads), the name as played and the capo:
   { name, at }, null for none. Read back (readPlayed) only as a name of
   that root under that capo. */
function playedName(x, root, as) {
  const at = x && Number.isInteger(x.letter) ? x.letterAt || 0 : 0;
  const n = at ? atShift(at, () => as(root, x.letter)) : null;
  return n ? { name: noteToken(n), at } : null;
}
const playedFields = (key, played) => (played ? { [`${key}Name`]: played.name, [`${key}NameAt`]: played.at } : {});
// (read: { letter, letterAt }, the one as played if it is one, else the one as it sounds)
function readPlayed(read, name, at, as) {
  const shift = readShift(at);
  const played = shift ? pickedLetter(read.root, read.def, readName(name), as, shift) : null;
  return played !== null ? letterPair(played, shift) : letterPair(read.letter, 0);
}
const fretsText = (frets) => frets.map((f) => (f < 0 ? 'x' : f)).join('-');
const FRETS_RE = /^(x|\d{1,2})(-(x|\d{1,2}))*$/;
// "A-minor-pentatonic" → { root, id }, "A" → { root, id: null } (ids may contain hyphens, roots do not)
function readPair(text) {
  const m = /^([^-]+)(?:-(.+))?$/.exec(text || '');
  const name = m ? readName(m[1]) : null;
  return name ? { root: name.pc, name, id: m[2] || null } : null;
}
// (saved settings: a chord's root as named with no scale to follow, the one
// picked (letter) or as usual, so it reads the same with another scale or
// none (a link's: as on screen, see shownChordText);
// a scale: its root as it writes it, its Alternative root as it is)
// (all as it sounds: atShift(0); x: what has its root's name picked, see letterOf)
// A chord with its bass note when not the root ("C-maj*E", C/E), as chips are told apart
const chordBassText = (root, def, bass, x = null) => atShift(0, () => {
  const spell = ownChordSpelling(root, def, letterOf(x));
  return `${noteToken(spell.root)}-${def.id}${bass ? `*${noteToken(spell.notes[bass])}` : ''}`;
});
// (a link's: spelled as on screen, the scale's name for its root too, as
// the Share popup shows it: C♯ in C♯ major is "Cs-maj", read with no scale
// as C♯, its Alternative root on; see pickedLetter)
const shownChordText = (root, def, bass, x = null) => atShift(0, () => {
  const spell = chordSpelling(root, def, letterOf(x));
  return `${noteToken(spell.root)}-${def.id}${bass ? `*${noteToken(spell.notes[bass])}` : ''}`;
});
const scaleText = (root, def) => atShift(0, () => `${noteToken(scaleSpelling(root, def).root)}-${def.id}`);
// → { root, def (null: none), frets ('' without a shape), bass (its place
// in the chord's notes; null: not said) }, or null when wrong
function readChord(text) {
  const [name, frets = ''] = String(text || '').split('.');
  const [pairText, bassText] = name.split('*');
  const pair = readPair(pairText);
  const def = pair && pair.id && findChord(pair.id);
  if (!pair || (pair.id && (!def || def.id !== pair.id)) || (frets && !FRETS_RE.test(frets))) return null;
  const pc = def && bassText ? readNote(bassText) : null;
  const at = pc === null ? -1 : def.steps.findIndex((st) => mod12(pair.root + st) === pc);
  return { root: pair.root, def: def || null, frets, bass: at >= 0 ? at : null, letter: pickedLetter(pair.root, def, pair.name, chordNameAs) };
}
function readScale(text) {   // → { root, def (null: none), letter (see pickedLetter) }, or null when wrong
  const pair = readPair(text);
  const def = pair && pair.id && findScale(pair.id);
  if (!pair || (pair.id && (!def || def.id !== pair.id))) return null;
  return { root: pair.root, def: def || null, letter: pickedLetter(pair.root, def, pair.name) };
}
// The neck: each value, or null when wrong
const readInstrument = (id) => (findInstrument(id) ? id : null);
const readTuning = (inst, id) => (tuningsOf(inst).some((t) => t.id === id) ? id : null);
/* A custom tuning: each open string as a note and octave, low to high (as
   the strings are listed): "D2-A2-D3-G3-B3-E4" */
const pitchToken = (m) => `${noteToken(plainNote(m, false))}${Math.floor(m / 12) - 1}`;
const customText = (strings) => strings.map(pitchToken).join('-');
// One string: its note and octave, then a hyphen before the next one. The
// octave can be -1 (a 5-string bass's low B down an octave: "B-1-E1-..."),
// so each note is read with its octave rather than split at every hyphen.
const PITCH_RE = /^([A-Ga-g](?:[#s♯]{1,2}|[b♭]{1,2})?)(-?\d)(?:-(?=.)|$)/;
function readCustom(inst, text) {   // → open string pitches, or null when wrong
  const base = tuningsOf(inst)[0].strings;
  if (!base.length) return null;   // (the piano: no strings to tune)
  const strings = [];
  for (let rest = String(text || ''), m; rest; rest = rest.slice(m[0].length)) {
    m = PITCH_RE.exec(rest);
    if (!m) return null;
    const pc = readNote(m[1]);
    const letter = m[1][0].toUpperCase();
    const acc = mod12(pc - LETTER_PC[LETTERS.indexOf(letter)] + 6) - 6;   // -2..+2
    strings.push((Number(m[2]) + 1) * 12 + LETTER_PC[LETTERS.indexOf(letter)] + acc);
  }
  if (strings.length !== base.length) return null;
  return strings.every((m, i) => m !== null && Math.abs(m - base[i]) <= CUSTOM_RANGE) ? strings : null;
}
const maxCapo = (inst) => Math.min(MAX_CAPO, findInstrument(inst).frets - SHAPE_SPAN);   // a hand's width of frets stays
function readCapo(value, inst) {
  const c = Number(value);
  return Number.isInteger(c) && c >= 0 && c <= maxCapo(inst) ? c : null;
}
// A chip's remembered inversions: { instrument: inversion }
function readInversions(value) {
  const inversions = {};
  for (const [inst, v] of Object.entries(value && typeof value === 'object' ? value : {})) {
    if (findInstrument(inst) && INVERSIONS.includes(v)) inversions[inst] = v;
  }
  return inversions;
}
// A chip's remembered shapes: { neck setting: frets }
function readShapes(value) {
  const shapes = {};
  for (const [ctx, frets] of Object.entries(value && typeof value === 'object' ? value : {})) {
    if (typeof frets === 'string' && FRETS_RE.test(frets)) shapes[ctx] = frets;
  }
  return shapes;
}

/* Shareable links, made by the Share popup (the address bar stays clean:
   what is on the neck is saved on the device, not in the address):
     ?instrument=guitar&tuning=drop-d&capo=2
     &chord=A-m7*C.x-3-2-0-1-0&scale=A-minor-pentatonic
     &list=C-maj_Fs-m.2-4-4-2-2-2_F-maj
   Each part is left out when not shared, and the tuning and capo when they
   are the defaults.
   How you like to see the neck (left-handed, flats, octaves, the switches)
   stays yours: it is not in the link.
   A chord is written the same way alone (chord) and in the chord list
   (list, chords split by _): its root (sharps as s, flats as b, as spelled
   on screen), a hyphen, its type, after a * its bass note when not the
   root (D-maj*Fs: D/F♯), then after a dot the shape as its frets (x for a
   muted string), left out when the link opens on it anyway (see
   shapeToken) or has no neck. Frets, so a link keeps showing the same
   shape even if the shape list changes. The inversion shown (a bass note,
   or any) is not in the link: the chord opens in the one for its bass (see
   plainInversion). Links from before may hold it: "inversion", or before
   that "voicing". */
const NONE = 'none';   // a link's chord or scale: none on the neck it was shared from
const LINK_KEYS = ['instrument', 'tuning', 'capo', 'inversion', 'voicing', 'chord', 'scale', 'list'];
const INVERSIONS = [...INVERSION_NAMES.keys()].map(String).concat('any');   // a bass note (any of a chord's, up to twelve: see INVERSION_NAMES), or any
/* A chord of the link with its shape, when not the first one and only with
   the neck (a custom shape always: it is not among the shapes found where
   the link opens). The chord on screen and a chip of the list: the name,
   bass and all (D/F♯: kept without the neck too, see keepBass), and the
   shape (the chip's: the one it comes back with, see recallChip). */
function shapeToken(root, def, { shapes, index, inversion }, bass) {
  const shape = shapes[index];
  if (!shape) return '';
  // (left out only when the link opens on it anyway: its first shape, in
  // the inversion the link opens in for its bass, see plainInversion)
  const plain = index === homeShape(shapes, root, inversion) && !shape.drawn && plainInversion(root, def, bass) === inversion;
  return plain ? '' : `.${fretsText(shape.frets)}`;
}
// A bass note's inversion, as named (no bass named: the root, as links
// write it; null: not one of this chord's)
const namedInversion = (def, bass) => {
  const want = String(Number.isInteger(bass) ? bass : 0);
  return inversionFor(def, want) === want ? want : null;
};
// The inversion a link's chord opens in for its bass note: the default one
// when its first shape has that bass already (A, as picked from the menus),
// else that bass's; null: no shape with that bass on this neck
function plainInversion(root, def, bass) {
  const want = String(bass);
  if (inversionFor(def, want) !== want || !listShapes(root, def, want).length) return null;
  const usual = inversionFor(def, DEFAULT_INVERSION[state.instrument]);
  const shapes = listShapes(root, def, usual);
  const first = shapes[homeShape(shapes, root, usual)];
  return first && bassIndexOf(root, def, first) === bass ? usual : want;
}
function chordToken(neck) {
  const ch = currentChord();
  return shownChordText(ch.root, ch.def, ch.bassIndex, state.chord) + (neck ? shapeToken(ch.root, ch.def, ch, ch.bassIndex) : '');
}
function listToken(entry, neck) {
  const def = findChord(entry.type);
  return shownChordText(entry.root, def, entry.bass, entry) + (neck ? shapeToken(entry.root, def, chipShape(entry), entry.bass) : '');
}

/* What the link holds: the neck (instrument, tuning, capo), the chord, the
   scale and the chord list, as asked */
function linkParams({ neck = true, chord = true, scale = true, recent = false } = {}) {
  const p = new URLSearchParams();
  const inst = instrument();
  if (neck) {
    p.set('instrument', state.instrument);
    if (inst.tuning.custom || inst.tuning.saved) p.set('tuning', customText(inst.strings));   // your own (saved or not): its notes, not its name
    else if (inst.tuning.id !== 'standard') p.set('tuning', inst.tuning.id);
    if (capo()) p.set('capo', String(capo()));
  }
  // No chord on the neck: the link says so (loaded, it clears theirs); one
  // left out (its switch off): not in the link (theirs stays). The scale too.
  // (a root's name picked as played above the capo, see letterOf: apart,
  // for whoever opens it with that capo named from it; see playedName)
  const played = (x, root, as) => { const n = neck && capo() ? playedName(x, root, as) : null; return n && n.at === capo() ? n.name : ''; };
  if (!state.chord.on) p.set('chord', NONE);
  else if (chord) p.set('chord', chordToken(neck));
  if (state.chord.on && chord && played(state.chord, state.chord.root, chordNameAs)) p.set('chordas', played(state.chord, state.chord.root, chordNameAs));
  if (recent && state.list.length) {
    p.set('list', state.list.map((r) => listToken(r, neck)).join('_'));
    const names = state.list.map((r) => played(r, r.root, chordNameAs));
    if (names.some(Boolean)) p.set('listas', names.join('_'));
  }
  if (!state.scale.on) p.set('scale', NONE);
  else if (scale) p.set('scale', scaleText(state.scale.root, findScale(state.scale.type)));
  if (state.scale.on && scale && played(state.scale, state.scale.root, rootAs)) p.set('scaleas', played(state.scale, state.scale.root, rootAs));
  return p;
}

/* Puts a link on the neck. All of it (fresh, a first visit: no chord, scale
   or capo unless the link has one), or the parts chosen in the Open link popup
   (parts: { neck, chord, scale, recent }): what is not taken stays as it
   was. A chord or scale left out of the link stays as it was too; "none"
   takes it off. Without the neck (instrument, tuning, capo), the chords come on your
   neck, on their first shapes (the link's shapes are for its neck), with
   the same bass note (C/E stays C/E, on a piano too) where your neck has a
   shape for it. Returns false for an address without a link. */
function applyLink(search, parts = null, fresh = false) {
  const p = new URLSearchParams(search);
  if (!LINK_KEYS.some((k) => p.has(k))) return false;
  const take = (k) => !parts || parts[k];
  const neck = take('neck') && p.has('instrument');   // (a link can leave the neck out)
  // Your chord's chip, as it is on screen (its bass: the shape's), for when
  // the link leaves your chord as it is
  const own = state.chord.on ? { root: state.chord.root, type: state.chord.type, bass: shownBass() } : null;
  const ownShape = state.loose && currentChord().shape ? fretsText(currentChord().shape.frets) : null;   // (yours shown apart from its chip: on that shape)
  const linkInversion = p.has('inversion') ? p.get('inversion') : p.get('voicing');   // (a link from before: "voicing")
  // A chord's bass on the link's own neck (its shape's lowest note; else
  // its name's, the link's inversion, or the root) and the inversion that gives
  // it on this neck: { bass, inversion }; null: none to keep (no shape here)
  const linkInst = p.has('instrument') && readInstrument(p.get('instrument')) ? p.get('instrument') : null;
  const keepBass = (c) => {
    // (no bass named: the root, as a link names any other: D/F♯ is D-maj*Fs)
    let bass = Number.isInteger(c.bass) ? c.bass : /^\d+$/.test(linkInversion || '') ? Number(linkInversion) : 0;
    if (c.frets && linkInst) {
      const frets = readFrets(c.frets);
      const piano = Boolean(findInstrument(linkInst).piano);
      const tuned = tuningsOf(linkInst).find((t) => t.id === readTuning(linkInst, p.get('tuning')));
      const strings = piano ? [] : readCustom(linkInst, p.get('tuning')) || (tuned || tuningsOf(linkInst)[0]).strings;
      const lift = piano ? findInstrument(linkInst).low : readCapo(p.get('capo') || 0, linkInst) || 0;
      const neck = { ...findInstrument(linkInst), strings };
      const notes = piano ? frets.map((k) => lift + k) : frets.map((f, i) => (f < 0 || strings[i] === undefined ? null : shapePitch(neck, i, f) + lift)).filter((m) => m !== null);
      if (notes.length) {
        const low = mod12(Math.min(...notes));
        const i = c.def.steps.findIndex((st) => mod12(c.root + st) === low);
        if (i >= 0) bass = i;
      }
    }
    const inversion = plainInversion(c.root, c.def, bass);
    return inversion === null ? null : { bass, inversion };
  };
  // A link without an instrument (written by hand) shows on yours, as you tuned it
  if (neck && readInstrument(p.get('instrument'))) {
    state.instrument = p.get('instrument');
    // A custom tuning (its notes) takes the custom tuning's place, unless it
    // is a preset's notes, or a saved tuning's: then that one
    const strings = readCustom(state.instrument, p.get('tuning'));
    const preset = strings && matchTuning(state.instrument, strings);
    if (strings && !preset) state.custom[state.instrument] = strings;
    state.tuning[state.instrument] = preset ? preset.id : strings ? 'custom' : readTuning(state.instrument, p.get('tuning')) || 'standard';
  }
  if (neck) setCapo(readCapo(p.get('capo') || 0, state.instrument) || 0);
  // (a root's name picked under the link's capo, named from it: as played,
  // apart; see playedName)
  const linkShift = readShift(Number(p.get('capo')));
  const chord = readChord(p.get('chord'));
  const linkChord = take('chord') && chord && chord.def;
  if (linkChord) { state.chord = { on: true, root: chord.root, type: chord.def.id, ...readPlayed(chord, p.get('chordas'), linkShift, chordNameAs) }; state.loose = false; }
  else if (take('chord') && (fresh || p.get('chord') === NONE)) chordOff();
  if (neck && linkChord) {
    // Its bass note (D-maj*Fs, its shape's, or the root), as without the neck
    // (see keepBass; a link from before: its inversion), then its shape in
    // the inversion that lists it (an "Any bass note" one may list it alone)
    // (a bass, named or the root, that has no shape on this neck: kept, the
    // chord shown without a shape, as it was shared: C9/G on a bass, D9 in
    // root position on a ukulele)
    const kept = keepBass(chord);
    let inversion = INVERSIONS.includes(linkInversion) ? linkInversion : kept ? kept.inversion : namedInversion(chord.def, chord.bass) || DEFAULT_INVERSION[state.instrument];
    if (chord.frets) {
      const listed = (v) => listShapes(chord.root, chord.def, inversionFor(chord.def, v)).some((shape) => fretsText(shape.frets) === chord.frets);
      const found = [inversion, DEFAULT_INVERSION[state.instrument], ...INVERSIONS].find(listed);
      if (found) inversion = inversionFor(chord.def, found);
    }
    state.inversion[state.instrument] = inversion;
  } else if (linkChord) {   // (its bass where your neck plays it, else the default inversion, as a chord picked)
    const kept = keepBass(chord);
    state.inversion[state.instrument] = kept ? kept.inversion : DEFAULT_INVERSION[state.instrument];
  }
  const scale = readScale(p.get('scale'));
  if (take('scale') && scale && scale.def) state.scale = { on: true, root: scale.root, type: scale.def.id, ...readPlayed(scale, p.get('scaleas'), linkShift, rootAs) };
  else if (take('scale') && (fresh || p.get('scale') === NONE)) scaleOff();
  state.shape = null;
  const ch = neck && linkChord && chord.frets ? currentChord() : null;
  let at = ch ? ch.shapes.findIndex((shape) => fretsText(shape.frets) === chord.frets) : -1;
  // A shape the finder does not list (drawn in Name a chord): kept as the
  // chord's custom shape, when it plays the chord's notes on this neck
  if (ch && at < 0 && playsChord(chord.root, chord.def, readFrets(chord.frets))) {
    keepDrawn(chord.root, chord.def.id, chord.frets);
    at = currentChord().shapes.findIndex((shape) => fretsText(shape.frets) === chord.frets);
  }
  if (at >= 0) state.shape = at;
  // The chord list: it replaces yours, each chord on the shape it was shared
  // with (no chord in it: yours stays). The recent chords stay, less those
  // now in the list.
  if (take('recent') && p.has('list')) {
    const list = [];
    const played = (p.get('listas') || '').split('_');
    for (const [i, item] of p.get('list').split('_').entries()) {
      const c = readChord(item);
      if (!c || !c.def || list.length >= LIST_MAX) continue;
      // its shape, for the neck it was shared with (without it, the first),
      // in the inversion that lists it: the link's, the default, or another
      const entry = newEntry(c.root, c.def.id, Number.isInteger(c.bass) ? c.bass : undefined);
      setPair(entry, otherPair(c.root, c.def, readPlayed(c, played[i], linkShift, chordNameAs)));   // (its root's name as shared, when not its usual one: under the scale now shown, see above)
      const tries = [linkInversion, DEFAULT_INVERSION[state.instrument], ...INVERSIONS].filter((v) => INVERSIONS.includes(v));
      const listed = (v) => listShapes(c.root, c.def, inversionFor(c.def, v)).some((shape) => fretsText(shape.frets) === c.frets);
      let inversion = c.frets && neck && tries.find(listed);
      // (a custom shape, as for the chord above)
      if (c.frets && neck && !inversion && playsChord(c.root, c.def, readFrets(c.frets))) {
        keepDrawn(c.root, c.def.id, c.frets);
        inversion = tries.find(listed);
      }
      if (inversion) {
        entry.inversions[state.instrument] = inversionFor(c.def, inversion);
        entry.shapes[shapeContext(c.def, inversionFor(c.def, inversion))] = c.frets;
        entry.bass = bassIndexOf(c.root, c.def, { frets: readFrets(c.frets) });   // (its frets say it)
      } else if (!neck) {   // (on your neck: its bass kept, as for the chord above)
        const kept = keepBass(c);
        entry.inversions[state.instrument] = kept ? kept.inversion : DEFAULT_INVERSION[state.instrument];
        if (kept && entry.bass === undefined) entry.bass = kept.bass;
      } else if (linkInversion === null) {   // (no shape: the first one, in the inversion for its bass, as it was shared; no bass named: the root)
        if (entry.bass === undefined) entry.bass = 0;
        entry.inversions[state.instrument] = plainInversion(c.root, c.def, entry.bass) ?? namedInversion(c.def, entry.bass) ?? DEFAULT_INVERSION[state.instrument];
      } else if (entry.bass) {   // (a link from before, with its inversion: that of its bass)
        entry.inversions[state.instrument] = inversionFor(c.def, String(entry.bass));
      }
      if (entry.bass === undefined) entry.bass = legacyBass(entry);   // (a link from before chips had a bass)
      if (list.some((r) => sameEntry(r, entry))) continue;
      // A chord you have already (saved or recent): your chip, still
      // remembering its shapes and inversions on other necks; with the link's
      // neck, its shape there the link's (without it: yours, on your neck)
      const own = [...state.list, ...state.recent].find((r) => sameEntry(r, entry));
      if (own) {
        const merged = { ...own, shapes: { ...own.shapes }, inversions: { ...own.inversions } };
        setPair(merged, pairOf(entry));   // (its root's name, as the link's list has it)
        if (neck) {
          const at = chipShape(entry);
          const shape = at.shapes[at.index];
          const ctx = shapeContext(c.def, at.inversion);
          merged.inversions[state.instrument] = at.inversion;
          delete merged.shapes[ctx];
          if (shape) merged.shapes[ctx] = fretsText(shape.frets);
        }
        list.push(merged);
        continue;
      }
      list.push(entry);
    }
    if (list.length) {
      state.list = list;
      state.recent = state.recent.filter((r) => !list.some((x) => sameEntry(x, r)));
    }
  }
  // Your own chord: on its chip, as it remembers it (the shape you had, a
  // C/E stays C/E), where this neck can play it; shown apart from its chip,
  // on the shape it had, if this neck still lists it
  const ownAt = ownShape && !linkChord && state.chord.on ? currentChord().shapes.findIndex((sh) => fretsText(sh.frets) === ownShape) : -1;
  if (ownAt >= 0) state.shape = ownAt;
  else if (!linkChord) { state.loose = false; recallChip((own && chipEntry(own.root, own.type, own.bass)) || recentEntry(), false, true); }
  else if (state.chord.on) {
    // The link's chord: its chip (one made for it if need be) remembers the
    // shape it came on, so a reload brings that shape back. A chip of yours
    // that comes back on another shape keeps it: the chord is shown apart
    // from it (the link's list, when loaded, has its chips' shapes). Without
    // the link's neck, the link has no shape: on your chip's.
    let entry = recentEntry();
    if (!entry) addRecent(entry = newEntry(state.chord.root, state.chord.type, shownBass()));
    else if (!neck) recallChip(entry);
    else {
      const back = chipShape(entry);
      const was = back.shapes[back.index];
      const now = currentChord().shape;
      state.loose = Boolean(now) && (!was || fretsText(was.frets) !== fretsText(now.frets));
    }
    if (!state.loose) { rememberShape(entry); keepLetter(entry); }
  }
  return true;
}

/* Opened from a link: a popup says what it holds and what it would replace,
   and you load all of it or only some (the chord, the chord list, the
   scale). It loads straight away when there is nothing of yours to lose: a
   first visit, or when no row would say Replaces, Reorders, Removes or
   Clears: for the chord and the scale, you have none or the link holds the
   same (the chord's shape too); the link's list keeps every chord already
   in the list, in its order, on its shape; the link's neck (if it has one)
   is yours already. Until you choose, your own neck is shown and the
   address keeps the link. */
let pendingLink = null;   // { search, preview, has, parts, same: the parts that change nothing }
function startLink(search) {
  const p = new URLSearchParams(search);
  if (!LINK_KEYS.some((k) => p.has(k))) return;
  let saved = null;
  try { saved = localStorage.getItem(STORAGE_KEY); } catch { /* storage unavailable */ }
  if (!saved) { loadLink(search, null, true); return; }
  // A chord or scale left out of the link (or a list) keeps yours: no row.
  // "None" takes yours off, so it is asked about (no row when you have none).
  const asks = (k, on) => p.has(k) && (p.get(k) !== NONE || on);
  const has = { neck: p.has('instrument'), chord: asks('chord', state.chord.on), scale: asks('scale', state.scale.on), recent: p.has('list') };
  const preview = linkPreview(search, has);   // (may find has.recent false)
  if (!preview.loses) { loadLink(search, has); return; }
  pendingLink = { search, preview, has, parts: { ...has }, same: {} };   // all switched on
}
// A link loaded: the neck then goes to what it brought, its chord, or else
// its scale's group (see revealFocus)
function loadLink(search, parts = null, fresh = false) {
  applyLink(search, parts, fresh);
  const p = new URLSearchParams(search);
  const took = (k) => (!parts || parts[k]) && p.has(k);
  if (took('chord') && state.chord.on) ui.reveal = true;
  else if (took('scale') && state.scale.on) ui.revealGroup = true;
}

/* A chord as the link popup shows it: its name and its shape ("A (x07650)":
   a link can change only the shape), or '' (none) */
const chordLine = (ch) => (!ch ? '' : ch.shape ? `${ch.symbol} (${shapeShort(ch.shape)})` : ch.symbol);
// ...its name and shape apart: { name, shape }, or null
const chordParts = (ch) => (!ch ? null : { name: ch.symbol, shape: ch.shape ? shapeShort(ch.shape) : '' });
/* What a link would show, worked out on a copy of the state: the setup, the
   chord, the scale and the chord list, and whether it is all yours already.
   parts: what is loaded (all of it by default) */
function linkPreview(search, has, parts = null) {
  const mine = state;
  const mySetup = setupKey();
  const myChord = chordLine(currentChord());
  const shapeOf = (r) => { const at = chipShape(r); return at.shapes[at.index] ? shapeShort(at.shapes[at.index], chordSpelling(r.root, findChord(r.type), letterOf(r))) : ''; };
  // (your chips' shapes, worked out on your own state: the link's custom
  // shapes are not yours)
  const yourShapes = new Map(mine.list.map((r) => [r, shapeOf(r)]));
  state = JSON.parse(JSON.stringify(mine));
  try {
    // (your list as it is: the link's replaces it, when loaded and not empty,
    // as on Load; your chips the link's chord or list has, still yours)
    const yourList = state.list;
    applyLink(search, parts);
    const ch = currentChord();
    const sc = currentScale();
    if (has.recent && (!parts || parts.recent) && state.list === yourList) has.recent = false;   // no list in the link after all
    // Shapes the link changes on its neck (without it, yours stay), as
    // "xx7650". On your own setup, the shape your chip comes back with; on a
    // new one, only a shape your chip remembers there (else nothing to set
    // the link's against: the frets of another neck say nothing)
    const withNeck = has.neck && (!parts || parts.neck);
    const moves = withNeck && setupKey() !== mySetup;
    const piano = Boolean(instrument().piano);
    const remembered = (own, def, inversion) => {   // (its shape kept for this neck and inversion, or null)
      const text = own && own.shapes && own.shapes[shapeContext(def, inversion)];
      return text ? shapeShort({ frets: readFrets(text), piano }, chordSpelling(own.root, def, letterOf(own))) : null;
    };
    // Your saved chips whose shape the link's list changes: { name: [yours, the link's] }
    const listShapes = {};
    if (has.recent && withNeck) {
      for (const r of state.list) {
        const own = mine.list.find((x) => sameEntry(x, r));
        if (!own) continue;
        const yours = moves ? remembered(own, findChord(r.type), chipShape(r).inversion) : yourShapes.get(own);
        if (yours !== null && yours !== shapeOf(r)) listShapes[entrySymbol(r)] = [yours, shapeOf(r)];
      }
    }
    // The chord on a new setup: the shape its chip remembers there, or null
    const chordOwn = moves && ch && [...mine.list, ...mine.recent].find((x) => sameEntry(x, { root: ch.root, type: ch.def.id, bass: ch.bassIndex }));
    const chordMemory = chordOwn ? remembered(chordOwn, ch.def, ch.inversion) : null;
    // Yours goes if you have one and the link's differs (a neck, you always have)
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const chords = (s) => s.list.map((r) => [r.root, r.type, r.bass]);
    // (a list's chords that are in the other too, in its order)
    const shared = (list, other) => list.filter((r) => other.some((x) => sameEntry(x, r))).map((r) => `${r.root}:${r.type}:${r.bass}`).join(' ');
    const loses = (has.neck && setupKey() !== mySetup)
      || (has.chord && mine.chord.on && myChord !== chordLine(ch))   // (its shape too)
      || (has.scale && mine.scale.on && !same(mine.scale, state.scale))
      || (has.recent && chords(mine).some(([root, type, bass]) => !state.list.some((r) => sameEntry(r, { root, type, bass }))))   // a chord of yours it drops
      || (has.recent && shared(mine.list, state.list) !== shared(state.list, mine.list))   // or puts in another order
      || Object.keys(listShapes).length > 0;   // or reshapes
    return {
      setup: has.neck ? setupText() : null,
      setupKey: has.neck ? setupKey() : null,
      setupParts: has.neck ? setupParts() : null,
      // the link's custom tuning: it takes the custom tuning's place
      custom: has.neck && state.tuning[state.instrument] === 'custom' ? { inst: state.instrument, strings: state.custom[state.instrument] } : null,
      // null: not in the link (no row), '': none
      chord: has.chord ? chordLine(ch) : null,
      chordParts: has.chord ? chordParts(ch) : null,
      chordMemory,
      scale: has.scale ? (sc ? `${sc.rootName} ${scaleTitle(sc.def)}` : '') : null,
      list: has.recent ? listNames() : null,
      listShapes,
      loses,
    };
  } finally {
    state = mine;
  }
}

function openLinkPopup() {
  renderLinkPopup();
  if (els.linkOpen.showModal) els.linkOpen.showModal(); else els.linkOpen.setAttribute('open', '');
}
/* One row per part: the switch (a tick instead when nothing would change),
   its name, a tag for what Load does with it (Replaces, Adds, Removes,
   Reorders, Clears, Not loaded, No change), and what is on the neck now →
   what the link has: the one you end up with bright, the other struck
   through (or just what changes, see neckDiff). Chords show as chips, so
   a long list wraps chip by chip; the link's part goes under the current
   one when both do not fit on a line. */
const lkEmpty = (v) => (Array.isArray(v) ? !v.length : !v);
// A chord name in a popup's chip, which breaks (when it must: a long name on
// a narrow screen) before its brackets and bass, and after its commas:
// "C♯m7♭5 / (add11,♭9, / ♭13) / /A"
const chipText = (name) => esc(name).replace(/\(|\//g, '<wbr>$&').replace(/,/g, ',<wbr>');
const lkValue = (v, cls) => (lkEmpty(v) ? `<span class="lk-val none ${cls}">None</span>`
  : Array.isArray(v) ? `<span class="lk-val chips ${cls}">${v.map((n) => `<span class="lk-chip">${chipText(n)}</span>`).join('')}</span>`
    : `<span class="lk-val ${cls}">${esc(v)}</span>`);
const CHECK_ICON = '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
function renderLinkPopup() {
  const { preview, parts, has } = pendingLink;
  const ch = currentChord();
  const sc = currentScale();
  // The link's chord (and list) as it lands: on the link's neck, or with
  // Setup switched off, yours (another shape, see applyLink); under the
  // link's scale, or with Scale switched off, yours (a root your scale names
  // its own way: C♯ as D♭)
  // (land(over): the link as it lands with the parts as switched, `over`
  // forced: the link's scale with Scale switched off, say, still on the
  // neck it would land on)
  pendingLink.as = pendingLink.as || {};
  const land = (over = {}) => {
    const p = { ...parts, ...over };
    const on = ['neck', 'scale', 'recent'].map((k) => !has[k] || p[k]);   // (a part not in the link: as with it on)
    if (on.every(Boolean)) return preview;
    const key = on.join('|');
    if (!pendingLink.as[key]) pendingLink.as[key] = linkPreview(pendingLink.search, { ...has }, { chord: true, neck: on[0], scale: on[1], recent: on[2] });
    return pendingLink.as[key];
  };
  const shown = land();
  const linkChord = preview.chord === null ? null : shown.chord;
  const linkParts = preview.chord === null ? preview.chordParts : shown.chordParts;
  const nowParts = chordParts(ch);
  // The link's setup replacing yours: its chord and list shown by name,
  // their shapes only against a shape your chip remembers on that setup (the
  // frets of another instrument, tuning or capo say nothing next to yours).
  // The same names, No change, yet they come with the setup: their shapes,
  // and what they sound (a capo moved, with Names from capo: E major shared
  // with a capo on 2 reads D major, as yours does with none; left behind,
  // yours would read C major there)
  const newSetup = has.neck && parts.neck && setupKey() !== preview.setupKey;
  pendingLink.withSetup = {};
  // The list's chips whose shape changes: only with the link's neck (see
  // applyLink; on a new setup, see linkPreview)
  // (the link's list, and its scale, as they land even when switched off)
  const reshaped = has.neck && !parts.neck ? {} : preview.listShapes || {};
  const reshapes = Object.keys(reshaped).length > 0;
  const scaleNow = sc ? `${sc.rootName} ${scaleTitle(sc.def)}` : '';
  const rows = [   // [row, part, now, the link's]: text, or a list of chord names
    [els.linkNeck, 'neck', setupText(), preview.setup],
    // (compared with its shape; shown by name, the shapes only when the name stays: see below)
    [els.linkChord, 'chord', ch ? [chordLine(ch)] : [], linkChord === null ? null : [linkChord].filter(Boolean)],
    // (the list and the scale: the link's as they would land, even switched
    // off: on the neck the Setup row says, named from its capo)
    [els.linkList, 'recent', listNames(), preview.list === null ? null : land({ recent: true }).list],
    [els.linkScale, 'scale', scaleNow, preview.scale === null ? null : land({ scale: true }).scale],
  ];
  let loads = false;   // Load: only with something switched on
  for (let [row, key, now, link] of rows) {
    row.hidden = link === null;
    if (link === null) continue;
    let same = key === 'neck' ? setupKey() === preview.setupKey : String(now) === String(link) && !(key === 'recent' && reshapes);
    const memory = newSetup ? preview.chordMemory : null;   // (the chord's shape your chip has on the new setup)
    if (key === 'chord' && newSetup) {
      same = (nowParts ? nowParts.name : '') === (linkParts ? linkParts.name : '')
        && !(memory && linkParts && memory !== linkParts.shape);
    }
    if (newSetup && key !== 'neck') pendingLink.withSetup[key] = same && !lkEmpty(link);
    // The chord: by its name ("C → D"); the same name, another shape: the name
    // once, its shapes after it, as a list's chip ("A (xx7650 x 12 11 x 10 12)")
    let reshapedChord = null;
    if (key === 'chord') {
      if (nowParts && linkParts && nowParts.name === linkParts.name && !same) reshapedChord = { [nowParts.name]: [newSetup ? memory : nowParts.shape, linkParts.shape] };
      now = nowParts ? [nowParts.name] : [];
      link = linkParts ? [linkParts.name] : [];
    }
    pendingLink.same[key] = same;
    const empty = lkEmpty;
    const show = lkValue;
    const on = parts[key] && !same;
    row.classList.toggle('same', same);
    row.disabled = same;
    row.setAttribute('aria-pressed', String(on));
    row.querySelector('.lk-icon').innerHTML = same ? CHECK_ICON : '';
    const tag = row.querySelector('.lk-tag');
    // A list that only gains chords Adds; one that only drops some Removes
    // (both keeping the order of the others); the same chords in another
    // order Reorders; anything else Replaces
    const inOrder = key === 'recent' && String(now.filter((n) => link.includes(n))) === String(link.filter((n) => now.includes(n)));
    const gains = key === 'recent' && !reshapes && inOrder && !empty(now) && now.every((n) => link.includes(n));
    const drops = key === 'recent' && !reshapes && inOrder && !empty(link) && link.every((n) => now.includes(n));
    const reorders = key === 'recent' && !reshapes && !same && now.length === link.length && now.every((n) => link.includes(n));
    const what = empty(now) || gains ? 'Adds' : empty(link) ? 'Clears' : drops ? 'Removes' : reorders ? 'Reorders' : 'Replaces';
    tag.textContent = same ? 'No change' : !on ? 'Not loaded' : what;
    tag.className = `lk-tag${on ? (what === 'Adds' ? ' gain' : ' lose') : ''}`;
    const diff = !same && (key === 'neck' ? neckDiff(setupParts(), preview.setupParts, on, Boolean(customOff(preview.custom)), preview.setupKey.split('|')[1] !== setupKey().split('|')[1], preview.setupKey.split('|')[1].split(',').map(Number))
      : reorders ? show(link, on ? 'win' : 'lose')   // (just the new order)
        : key === 'recent' ? listDiff(now, link, on, reshaped)
        : reshapedChord ? listDiff(now, link, on, reshapedChord) : '');
    if (on) loads = true;
    row.querySelector('.lk-change').innerHTML = (same ? show(link, 'win') : diff
      || `${show(now, on ? 'lose' : 'win')}<span class="lk-to"><span class="lk-arrow" aria-label="to">→</span>${show(link, on ? 'win' : 'lose')}</span>`)
      + (key === 'neck' ? customLine(preview.custom, on) : '');
  }
  els.linkLoad.disabled = !loads;
}

/* A small change shows in place, not as the whole thing twice. On the same
   instrument, the neck is one line where only the tuning or capo that
   changes shows both: "Bass (Drop D, capo 3 capo 2)", the one you end up
   with bright, the other struck through. A chord list that shares chords is
   one row of chips: first the chords it loses, struck through, then the
   list you end up with, the chords it gains outlined, and a chord whose
   shape changes with both shapes after its name. Anything else: now → the link's. */
/* The custom tuning a link replaces without it being on the neck (on a
   preset, or another instrument): its notes, or null */
function customOff(custom) {
  if (!custom) return null;
  const { inst, strings } = custom;
  const mine = state.custom[inst];
  if (!mine || String(mine) === String(strings) || (state.instrument === inst && state.tuning[inst] === 'custom')) return null;
  return mine;
}
// Its line under the neck's: the custom tuning now → the link's
function customLine(custom, on) {
  const mine = customOff(custom);
  if (!mine) return '';
  const notes = (list, other) => tuningNotes(list, state.flats, custom.inst, other);
  return `<span class="lk-extra">${lkValue(notes(mine, custom.strings), on ? 'lose' : 'win')}`
    + `<span class="lk-to"><span class="lk-arrow" aria-label="to">→</span>${lkValue(notes(custom.strings, mine), on ? 'win' : 'lose')}</span></span>`;
}
function neckDiff(now, link, on, customLater = false, retuned = false, linkStrings = null) {
  if (now[0] !== link[0]) return '';
  // Two tunings written alike, an octave apart on a string: that string's
  // octave on both ("F2 A D G B E → F3 A D G B E")
  const mine = instrument().strings;
  const written = (strings, text, other) => (text === tuningNotes(strings, state.flats, state.instrument) ? tuningNotes(strings, state.flats, state.instrument, other) : text);
  if (retuned && linkStrings && now[1] === link[1]) [now, link] = [[now[0], written(mine, now[1], linkStrings), now[2]], [link[0], written(linkStrings, link[1], mine), link[2]]];
  // (two saved tunings of the same name: both, an arrow between them,
  // "Practice → Practice")
  const part = (a, b, differ = a !== b) => (!differ ? esc(a)
    : `<span class="${on ? 'lk-old' : 'lk-new'}">${esc(a)}</span> ${a === b ? '<span class="lk-arrow" aria-label="to">→</span> ' : ''}<span class="${on ? 'lk-new' : 'lk-old'}">${esc(b)}</span>`);
  // the link's custom tuning replaces the one kept aside: here only the
  // preset that goes (the line under it shows the custom tuning's change)
  const tuning = customLater ? `<span class="${on ? 'lk-old' : 'lk-new'}">${esc(now[1])}</span>` : part(now[1], link[1], now[1] !== link[1] || retuned);
  return `<span class="lk-val diff">${esc(now[0])} (${tuning}, ${part(now[2], link[2])})</span>`;
}
function listDiff(now, link, on, reshaped = {}) {
  if (!now.length || !link.length || !now.some((n) => link.includes(n))) return '';
  const [kept, other] = on ? [link, now] : [now, link];
  // a chip in both whose shape changes: its shapes after its name, as the
  // neck's tuning and capo: "A (xx7650 x 12 11 x 10 12)"
  const label = (n) => (!reshaped[n] ? chipText(n) : `${chipText(n)} (<span class="${on ? 'lk-old' : 'lk-new'}">${esc(reshaped[n][0])}</span> `
    + `<span class="${on ? 'lk-new' : 'lk-old'}">${esc(reshaped[n][1])}</span>)`);
  const chip = (n, cls = '') => `<span class="lk-chip${cls}">${label(n)}</span>`;
  return `<span class="lk-val chips diff">${other.filter((n) => !kept.includes(n)).map((n) => chip(n, ' gone')).join('')}`
    + `${kept.map((n) => chip(n, on && !other.includes(n) ? ' added' : '')).join('')}</span>`;
}
// Load (what is switched on), or nothing (Cancel, the ×, Escape, a tap outside)
function closeLink(load) {
  const link = pendingLink;
  pendingLink = null;
  if (els.linkOpen.open) {
    if (els.linkOpen.close) els.linkOpen.close(); else els.linkOpen.removeAttribute('open');
  }
  if (!link) return;
  if (load) {
    // A part marked No change is left as it is (a chord's shapes, a list's
    // remembered shapes stay yours); the neck, as it is the same, still
    // places the link's chord on its shape. The same chord, list or scale
    // with a new setup: the link's, on its shapes there, reading as the
    // popup said (see renderLinkPopup)
    const parts = { ...link.parts };
    for (const k of ['chord', 'scale', 'recent']) if (link.same[k] && !link.withSetup[k]) parts[k] = false;
    loadLink(link.search, parts);
    shownChord = undefined;   // loaded, not picked (its chip, if a chord came: see applyLink)
  }
  render();
}

/* Once a link is loaded (or left), it leaves the address: a reload shows
   your saved neck, and does not ask again. Until you choose in the popup it
   stays, so a reload asks again. */
function clearLink() {
  if (pendingLink || typeof history === 'undefined' || !history.replaceState) return;
  const p = new URLSearchParams(location.search);
  if (!LINK_KEYS.some((k) => p.has(k))) return;
  for (const k of LINK_KEYS) p.delete(k);
  const query = p.toString();
  try { history.replaceState(history.state, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash}`); } catch { /* the link stays */ }
}

/* The text for the share sheet (and Copy text): the setup, then what is
   on it, the chord list on a line of its own:
     Guitar (Drop D, capo 2) E♭dim over A♭ major scale
     Chords: C, C/E, B, E♭7sus4
   ("Guitar A♭ major scale", "Guitar E♭dim chord"); no chord or scale, the
   list after the setup: "Guitar: C, C/E, B", or alone: "C, C/E, B" */
function linkSummary({ neck = true, chord = true, scale = true, recent = false } = {}) {
  const inst = instrument();
  const ch = chord ? currentChord() : null;
  const sc = scale ? currentScale() : null;
  const tuned = [tuningName(inst), capo() ? `capo ${capo()}` : ''].filter(Boolean).join(', ');
  // (named from the capo, see nameShift: the capo said, as a song sheet
  // says it, with the neck left out too)
  const setup = neck ? `${inst.name}${tuned ? ` (${tuned})` : ''}` : '';
  const lead = !neck && nameShift() ? `Capo ${nameShift()}: ` : '';
  const scaleText = sc && `${sc.rootName} ${scaleTitle(sc.def)}${/ scale$/.test(scaleTitle(sc.def)) ? '' : ' scale'}`;   // (not "whole tone scale scale")
  const what = ch && sc ? `${ch.symbol} over ${scaleText}` : sc ? scaleText : ch ? `${ch.symbol} chord` : '';
  const chords = (recent ? listNames() : []).join(', ');
  if (!what) return setup && chords ? `${setup}: ${chords}` : setup || (chords && lead + chords);
  return lead + [[setup, what].filter(Boolean).join(' '), chords && `Chords: ${chords}`].filter(Boolean).join('\n');
}
const listNames = () => state.list.map(entrySymbol);

/* Share: a popup shows what is on the neck, one row per part that is set
   (the neck, the chord, the chord list, the scale), each switched in or
   out of the link (all of them the first time, then as you last left
   them), then shares it: the phone's share sheet, or the link copied (the
   Share button says so for a moment); Copy text copies the words alone. */
// Drawn 1 unit left of centre: its two dots on the right make it look right-heavy otherwise
const SHARE_ICON = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><g transform="translate(-1 0)"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></g></svg>';
const DONE_ICON = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const shareSheet = () => Boolean(navigator.share) && window.matchMedia('(pointer: coarse)').matches;
function openShare() {
  renderShare();
  if (els.share.showModal) els.share.showModal(); else els.share.setAttribute('open', '');
}
function closeShare() {
  clearTimeout(shareTimer);
  clearTimeout(textTimer);
  resetShareText();
  if (els.share.close) els.share.close(); else els.share.removeAttribute('open');
}
// "Guitar (Drop D, capo 2)", "Ukulele (standard tuning, no capo)"
function setupParts() {   // [instrument, tuning, capo] (the piano: its name alone)
  const inst = instrument();
  if (inst.piano) return [inst.name, '', ''];
  return [inst.name, tuningName(inst) || 'standard tuning', capo() ? `capo ${capo()}` : 'no capo'];
}
function setupText() {
  const [name, tuning, capoText] = setupParts();
  return tuning ? `${name} (${tuning}, ${capoText})` : name;
}
// The setup as it sounds: two saved tunings may share a name, never their notes
const setupKey = () => [state.instrument, instrument().strings, capo()].join('|');
function renderShare() {
  const ch = currentChord();
  const sc = currentScale();
  const rows = [   // [row, part, what is on the neck: text, or chord names]
    [els.shareNeck, 'neck', setupText()],
    [els.shareChord, 'chord', ch ? [ch.symbol] : []],
    [els.shareRecent, 'list', listNames()],
    [els.shareScale, 'scale', sc ? `${sc.rootName} ${scaleTitle(sc.def)}` : ''],
  ];
  for (const [row, key, value] of rows) {
    // Nothing of it on the neck: no row (its switch stays as you left it)
    const has = !lkEmpty(value);
    row.hidden = !has;
    if (!has) continue;
    const on = Boolean(state.share[key]);
    row.setAttribute('aria-pressed', String(on));
    const tag = row.querySelector('.lk-tag');
    tag.textContent = on ? 'Included' : 'Not included';
    tag.className = `lk-tag${on ? ' gain' : ''}`;
    row.querySelector('.lk-change').innerHTML = lkValue(value, on ? 'win' : 'off');   // left out: dimmed, not struck through
  }
  const opts = shareChoice();
  els.shareGo.disabled = !Object.values(opts).some(Boolean);
  els.shareGo.innerHTML = shareSheet() ? `${SHARE_ICON}${tx('Share link')}` : tx('Copy link');
  els.shareGo.parentElement.classList.remove('failing');
  els.shareText.disabled = els.shareGo.disabled;
}
function shareChoice() {
  return {
    neck: state.share.neck,
    chord: state.share.chord && state.chord.on,
    scale: state.share.scale && state.scale.on,
    recent: state.share.list && state.list.length > 0,
  };
}
async function shareLink() {
  const opts = shareChoice();
  const url = new URL(`?${linkParams(opts)}`, location.href).href;
  if (shareSheet()) {
    try { await navigator.share({ title: 'Frettle', text: linkSummary(opts), url }); closeShare(); } catch { /* closed */ }
    return;
  }
  shareDone(await copyText(url));
}
async function copyText(value) {   // true if copied
  try { await navigator.clipboard.writeText(value); return true; } catch {
    const field = document.createElement('textarea');   // older browsers
    field.value = value;
    field.setAttribute('readonly', '');
    field.style.cssText = 'position:fixed;opacity:0';
    els.share.append(field);   // inside the popup: the page behind it cannot take focus
    field.select();
    let copied = false;
    try { copied = document.execCommand('copy'); } catch { /* not allowed */ }
    field.remove();
    return copied;
  }
}

/* Copy text: the share sheet's text alone (see linkSummary), no link. The
   popup stays open, its icon a tick for
   a moment (not copied: a warning sign; in its icon, not the main button's
   words, so the row keeps its width) */
const COPY_ICON = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3"/></svg>';
const WARN_ICON = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.01"/></svg>';
let textTimer = 0;
let textStatusTimer = 0;
async function shareTextOnly() {
  const copied = await copyText(linkSummary(shareChoice()));
  els.shareStatus.textContent = copied ? 'Text copied' : 'Could not copy the text';
  clearTimeout(textStatusTimer);
  textStatusTimer = setTimeout(() => { els.shareStatus.textContent = ''; }, 2000);
  clearTimeout(textTimer);
  els.shareText.querySelector('.ico').outerHTML = copied ? DONE_ICON : WARN_ICON;
  els.shareText.classList.toggle('failed', !copied);
  textTimer = setTimeout(resetShareText, copied ? 1600 : 2000);
}
function resetShareText() {   // (its icon only: "Text" stays)
  els.shareText.querySelector('.ico').outerHTML = COPY_ICON;
  els.shareText.classList.remove('failed');
}

/* Copied: the popup closes, and the Share button says so for a moment
   (a tick and "Copied", in the same width). Not copied: the popup stays
   open and its button says so. */
let shareTimer = 0;
let copiedTimer = 0;
const SHARE_BUTTON = () => `${SHARE_ICON}<span class="btn-label">Share</span>`;
function shareDone(copied) {
  els.shareStatus.textContent = copied ? 'Link copied' : 'Could not copy the link';
  clearTimeout(copiedTimer);
  copiedTimer = setTimeout(() => { els.shareStatus.textContent = ''; }, 2000);
  if (!copied) {
    els.shareGo.innerHTML = tx('Could not copy the link');
    els.shareGo.parentElement.classList.add('failing');   // (its words the whole row a moment, Copy text aside)
    clearTimeout(shareTimer);
    shareTimer = setTimeout(renderShare, 2000);
    return;
  }
  closeShare();
  const btn = els.shareOpen;
  btn.innerHTML = `${DONE_ICON}<span class="btn-label">Copied</span>`;
  btn.classList.add('done');
  clearTimeout(copiedTimer);
  copiedTimer = setTimeout(() => {
    els.shareStatus.textContent = '';
    btn.innerHTML = SHARE_BUTTON();
    btn.classList.remove('done');
  }, 1600);
}

let state = null;
let shapeCache = { key: '', shapes: [] };

/* The selected instrument, in its selected tuning */
const instrument = () => tunedInstrument(state.instrument, state.tuning[state.instrument]);
/* The capo, kept per instrument like the tuning: each instrument comes back
   as it was left */
const capo = () => state.capo[state.instrument] || 0;
function setCapo(c) {
  if (c) state.capo[state.instrument] = c; else delete state.capo[state.instrument];
}

/* The instrument as it sounds with the capo on: every open string raised,
   fewer frets left. Chord shapes are found on this, so their fret numbers
   count from the capo (0 = the string rings at the capo). */
function cappedInstrument() {
  const inst = instrument();
  const c = capo();
  return { ...inst, strings: inst.strings.map((m) => m + c), frets: inst.frets - c };
}
/* Spelling of the selected chord / scale (or, for pickers, of any root and
   type). Each is written as the easier key (see spellScale), or from its
   root's other name when the Alternative root switch has it (a chord's,
   also the name a link wrote it with: F𝄪dim): letter, the root's letter
   so picked (null: none). A choice that the type now writes
   anyway is no choice any more (see settleLetters). A chord whose root
   the selected scale has borrows the scale's name for it, so the ii chord
   of D♭ major is E♭m, not D♯m (its own choice kept for when there is no
   such scale); another root, its own. */
function scaleSpelling(rootPc, def, letter = mod12(rootPc) === mod12(state.scale.root) ? letterOf(state.scale) : null) {
  const auto = spellScale(rootPc, def);
  const picked = rootAs(rootPc, letter);
  return picked && picked.letter !== auto.root.letter ? spellScale(rootPc, def, picked) : auto;
}
// (the chord as written with no scale to follow: its own)
function ownChordSpelling(rootPc, def, letter = null) {
  const auto = spellChord(rootPc, def);
  const picked = chordNameAs(rootPc, letter);
  return picked && picked.letter !== auto.root.letter ? spellChord(rootPc, def, picked) : auto;
}
// (the name the selected scale gives this root, if it has it: null else)
// (not the chromatic scale's: it has every note, named as the Flats setting
// has it, not as a key would; a chord names its own root there, as with no
// scale)
function scaleRootName(rootPc) {
  if (!state.scale.on) return null;
  const def = findScale(state.scale.type);
  return def.steps.length < 12 ? scaleSpelling(state.scale.root, def).names.get(mod12(rootPc)) || null : null;
}
function chordSpelling(rootPc, def, letter = null) {
  const named = scaleRootName(rootPc);
  if (!named) return ownChordSpelling(rootPc, def, letter);
  return spellChord(rootPc, def, named);   // (B♯ D𝄪 F𝄪 in C♯ major)
}
const stringNumber = (s) => instrument().strings.length - s;   // 1 = string nearest the floor

/* The inversion set for this instrument, or its default (root position on
   the guitars, the basses and the keyboards, any bass note on the others:
   DEFAULT_INVERSION) when the chord has no such bass note (a 3rd inversion
   on a triad); an interval, always root position */
function inversionFor(def, v = state.inversion[state.instrument]) {
  if (def.span) return '0';   // (an interval: its root below, "any bass note" too: turned over, it is another interval; a tritone, the same span)
  return v === 'any' || (/^\d+$/.test(v) && Number(v) < def.steps.length) ? v : DEFAULT_INVERSION[state.instrument];
}

/* The shapes of any chord, here and now (the instrument, tuning, capo and
   inversion on screen) */
const shapesMemo = new Map();
function chordShapes(root, def, inversion = inversionFor(def)) {
  const inst = cappedInstrument();
  const key = [inst.id, inst.strings.join(','), capo(), mod12(root), def.id, inversion].join('|');
  if (!shapesMemo.has(key)) {
    if (shapesMemo.size > 200) shapesMemo.clear();
    shapesMemo.set(key, inst.piano ? pianoShapes(mod12(root), def, inversion, inst) : findShapes(inst, root, def, inversion));
  }
  return shapesMemo.get(key);
}

/* A note of a chord's shape: its degree, as its pitch class has it; an
   interval's (ch.interval: its type) by its distance from the shape's
   lowest note, low (see intervalDegree): C4 D5 D6, R 9 16. */
const shapeDegree = (ch, midi, low) => (ch.interval && intervalDegree(ch.interval, midi - low)) || ch.degOfPc.get(mod12(midi));
/* Everything the views need about the selected chord, or null. */
function currentChord() {
  if (!state.chord.on) return null;
  const def = findChord(state.chord.type);
  const root = state.chord.root;
  const inversion = inversionFor(def);
  const tones = chordTones(root, def);
  const spell = chordSpelling(root, def, letterOf(state.chord));
  const key = [state.instrument, instrument().strings.join(','), capo(), root, def.id, inversion, drawnFrets(root, def.id).join(' ')].join('|');   // (the instrument too: two with the same strings, another neck: its frets, its reach)
  if (shapeCache.key !== key) {
    const shapes = listShapes(root, def, inversion);
    shapeCache = { key, shapes, home: homeShape(shapes, root, inversion) };
  }
  const { shapes, home } = shapeCache;
  const index = shapes.length ? Math.min(state.shape ?? home, shapes.length - 1) : -1;   // (none picked: its home shape)
  const shape = shapes[index] || null;
  // Its bass: the shape's lowest note (no shape: the inversion's)
  const bassIndex = shape ? bassIndexOf(root, def, shape) : /^\d+$/.test(inversion) ? Number(inversion) : 0;
  return {
    def, root, inversion, tones, shapes, index, home, shape, bassIndex,
    degOfPc: new Map(tones.map((t) => [t.pc, t.deg])),
    interval: def.span ? def : null,   // (its notes labelled by their distance, see shapeDegree)
    spell,
    rootName: noteText(spell.root),
    symbol: chordName(root, def, bassIndex, letterOf(state.chord)),   // ("C/E": see chordName)
  };
}

function currentScale() {
  if (!state.scale.on) return null;
  const def = findScale(state.scale.type);
  const pcs = def.steps.map((s) => mod12(state.scale.root + s));
  const spell = scaleSpelling(state.scale.root, def);
  return { def, root: state.scale.root, pcs, set: new Set(pcs), spell, rootName: noteText(spell.root) };
}

/* Turning the chord or the scale off ("None", Deselect, a link without one)
   keeps only its root: the type is forgotten, so nothing can go on reading
   an old type (every way back on picks a new one) */
function chordOff() { state.chord.on = false; state.chord.type = null; state.loose = false; openEntry = null; resetInversion(); }   // and its chip is final
function scaleOff() { state.scale.on = false; state.scale.type = null; }

/* A new chord (another root or type, or no chord) starts from the default
   inversions: an inversion is chosen for a chord, not kept for the next
   one. A chip brings back its own. */
const resetInversion = () => { state.inversion = { ...DEFAULT_INVERSION }; };
/* A chord picked from the menus (or a triad): its first shape. A new chord
   (another root or type) starts from each instrument's default inversion
   (root position, or "Any bass note" where few chords have one): an
   inversion picked for one chord does not follow to the next (its chip
   keeps it) */
function updateChord(patch) {
  const out = menuOutcome('root' in patch ? patch.root : state.chord.root, findChord('type' in patch ? patch.type : state.chord.type));
  if (out.fresh) resetInversion();
  Object.assign(state.chord, patch, { on: true }, out.pair);
  state.loose = false;
  state.shape = menuShape(out.entry);
  menuPick = 'root' in patch ? ('type' in patch ? 'both' : 'root') : 'type' in patch ? 'type' : 'other';
  render();
}
/* What a pick from the chord menus gives (a root, a type), as updateChord
   sets it, so the menus show it before (a tile: the name and notes the
   chord will have): fresh, another chord (another root or type, or none
   on), from the instrument's default inversion; its inversion; the bass
   it will show (its shape's, see menuChip); its chip, if it has one; its
   root's name, letter: another root, the usual one; another type, the
   one picked (Alternative root) while the type does not write it anyway
   (see settleLetters); a chord that has a chip already (the list's, a
   recent one) as the chip has it, as its shape (an F♭ major kept in the
   list stays F♭ when E is picked again: a chip's name changes only with
   the Alternative root, on its chord). */
function menuOutcome(root, def) {
  const fresh = !state.chord.on || def.id !== state.chord.type || root !== state.chord.root;
  const newRoot = !state.chord.on || root !== state.chord.root;
  const inversion = inversionFor(def, fresh ? DEFAULT_INVERSION[state.instrument] : state.inversion[state.instrument]);
  // (its bass: the inversion's, or "any bass note", its first shape's)
  let bass = /^\d+$/.test(inversion) ? Number(inversion) : null;
  if (bass === null) {
    const shapes = listShapes(root, def, inversion);
    bass = shapes.length ? bassIndexOf(root, def, shapes[homeShape(shapes, root, inversion)]) : 0;
  }
  const entry = chipEntry(root, def.id, bass);
  let pair = newRoot ? letterPair(null) : pairOf(state.chord);
  if (fresh && entry) pair = pairOf(entry);
  pair = settledPair(pair, root, () => spellChord(root, def).root, chordNameAs);
  return { fresh, inversion, bass, entry, letter: letterOf(pair), pair };   // (letter: as it shows, see letterOf)
}

/* A chord picked from the menus that has a chip already (the list's, a
   recent one): the shape the chip remembers in this inversion, not lost to
   the first one (a custom shape among them); null: none, its first shape */
function menuShape(entry = menuChip()) {
  const def = findChord(state.chord.type);
  const inversion = inversionFor(def);
  if (!listShapes(state.chord.root, def, inversion).length) return null;
  return entry ? rememberedShape(entry, inversion) : null;
}
// (the chip of the chord the menus now have, with the bass it will show)
const menuChip = () => menuOutcome(state.chord.root, findChord(state.chord.type)).entry;

/* The chord list and the recent chords, for all instruments. The list is
   the one you build (a song's chords): a chord goes in when you tap the +
   on its recent chip and out with its × (Clear empties it); nothing joins
   or leaves it by itself, and Share sends it. The recent chords are the
   last chords used that are not in it (the chord on screen among them), so
   you can go back to one: a new one goes first. RECENT_KEEP are kept; the
   row shows about that many chords in all, so the ones used last fill what
   the list leaves (a short list, a longer history), never fewer than
   RECENT_MAX. When one goes into the list, the one used before them shows
   in its place; past RECENT_KEEP the one unused longest goes (saved, so a
   reload keeps who was used last). They are never shared.
   The in-between chord of picking a root, then a type, does not pile up: a
   recent chord made by picking a root stays open, and if the very next
   thing you do is pick a type, that edits it. Anything else (another root,
   strumming or tapping its notes, a shape, a chip, a triad, the +) makes it
   final. Picking only a type always makes a new one.
   A chip is a chord and its bass note: D and D/F♯ are two chips. A shape
   or inversion with another bass lights that one's chip if there is one;
   else the recent chip on screen takes the new bass (renamed), while a
   list chip stays as it is and the chord gets a new recent chip.
   Each chip remembers the shape you chose for it, per instrument, tuning,
   capo and inversion (`shapes`): tapping the chip, or coming back to this
   instrument, brings that shape back, and so does picking the chord from the
   menus (a new one starts from its first shape). Shapes only change in
   memory when you choose them, never because a setting reset them.
   A link's chord on a shape its chip does not have (the chord list not
   loaded with it) is shown apart from the chip (state.loose): no chip is
   lit, and the chip keeps its shape (a chord has one chip). It ends when
   the chord on screen changes (another chord or bass, a chip, the menus,
   another neck). */
const LIST_MAX = 16;
const RECENT_MAX = 3;    // recent chords shown, at least
const RECENT_KEEP = 6;   // ... kept, and the chords the row aims to show in all
let recentClock = 0;
let shownChord;          // instrument and chord at the last render
let openEntry = null;    // the recent chord a root pick made, which the next type pick may still edit
let menuPick = '';       // how the chord on screen was just picked: 'root', 'type', 'both' or 'other' (menus)
let chipPick = false;    // ... or from its chip
const shapeContext = (def = findChord(state.chord.type), inversion = inversionFor(def)) => [instrument().piano ? instrument().id : instrument().strings, capo(), inversion].join('|');
/* Custom shapes: drawn in Name a chord, when the shape finder does not list
   them. Kept per chord and neck (open strings and capo: the same frets on
   another neck are other notes), the last DRAWN_MAX: a chip remembering
   one, another chip (a link's) one of its own, each is kept. Listed
   among the chord's shapes, after the first, by their place on the neck,
   when the inversion allows their bass note; marked as custom where shapes
   are shown. Saved and shared (as frets) like any shape. Kept while in use
   (see pruneDrawn). */
const DRAWN_MAX = 40;
const NECK_RE = /^(-?\d+(,-?\d+)*|piano|uniso)\|\d+$/;
const neckContext = () => [instrument().piano ? instrument().id : instrument().strings, capo()].join('|');   // (a keyboard: its name, its keys counted from its own lowest)
const readFrets = (text) => String(text).split('-').map((f) => (f === 'x' ? -1 : Number(f)));
// A chord's custom shapes on this neck: their frets, one per bass note
function drawnFrets(root, type) {
  const neck = neckContext();
  return state.drawn.filter((x) => x.root === mod12(root) && x.type === type && x.neck === neck).map((x) => x.frets);
}
function keepDrawn(root, type, frets) {
  const neck = neckContext();
  state.drawn = state.drawn.filter((x) => !(x.root === mod12(root) && x.type === type && x.neck === neck && x.frets === frets));
  state.drawn.push({ root: mod12(root), type, neck, frets });
  state.drawn = state.drawn.slice(-DRAWN_MAX);
}
/* A custom shape is kept while it is in use: on screen, or remembered by a
   chip (the chord list's, or this tab's recent chords). One this tab stops
   using goes (at the next save); the first save of a tab, every one not in
   use here. Another tab may still use one (on its screen, its recent
   chords): it keeps it then, and saves it back (adoptShared). */
const drawnKey = (root, type, frets) => `${mod12(root)}|${type}|${frets}`;
function drawnInUse() {
  const used = new Set();
  for (const r of [...state.list, ...state.recent]) for (const text of Object.values(r.shapes || {})) used.add(drawnKey(r.root, r.type, text));
  // The chord on screen's: all of them, not only the one shown, while its
  // shapes are stepped through (dropping one would shift the others under
  // the shape's number: the next strum, another shape)
  const ch = state.chord.on ? currentChord() : null;
  if (ch) for (const sh of ch.shapes) if (sh.drawn) used.add(drawnKey(ch.root, ch.def.id, fretsText(sh.frets)));
  return used;
}
let drawnUsed = null;   // the custom shapes this tab used at its last save (null: none yet)
function pruneDrawn() {
  const now = drawnInUse();
  const was = drawnUsed;
  state.drawn = state.drawn.filter((d) => { const key = drawnKey(d.root, d.type, d.frets); return now.has(key) || (was && !was.has(key)); });
  drawnUsed = now;
}
// A shape's notes on the neck as it is (capo on): their pitches, low string
// first (the piano: its keys, low to high)
const shapeMidis = (frets) => {
  const inst = cappedInstrument();
  if (inst.piano) return frets.map((k) => inst.low + k);
  return frets.map((f, s) => (f < 0 ? null : shapePitch(inst, s, f))).filter((m) => m !== null);
};
/* A chord's name, the way it is written everywhere (chips, panels, links,
   Name a chord): its symbol, and after a slash its bass note when that is
   not the root ("C/E": C major, 1st inversion). The bass is the shape's
   lowest note, as the chord tone it is (bassIndex: 0 the root, 1 the 2nd
   note of the chord's formula...). */
function bassIndexOf(root, def, shape) {
  const notes = shape ? shapeMidis(shape.frets) : [];
  if (!notes.length) return 0;
  const low = mod12(Math.min(...notes));
  const i = def.steps.findIndex((st) => mod12(root + st) === low);
  return Math.max(0, i);
}
function chordName(root, def, bassIndex = 0, letter = null) {
  const spell = chordSpelling(root, def, letter);
  return noteText(spell.root) + def.symbol + (bassIndex ? `/${noteText(spell.notes[bassIndex])}` : '');
}
// A chord of the list (or a recent one), named with its bass note: C, C/E
const entrySymbol = (r) => chordName(r.root, findChord(r.type), r.bass, letterOf(r));
/* The bass of a chip saved before chips had one: as it showed then, on
   this neck (the inversion and shape it was last used with here, or the
   default) */
function legacyBass(r) {
  const def = findChord(r.type);
  const inversion = inversionFor(def, (r.inversions && r.inversions[state.instrument]) || DEFAULT_INVERSION[state.instrument]);
  const shapes = listShapes(r.root, def, inversion);
  const frets = r.shapes && r.shapes[shapeContext(def, inversion)];
  const at = frets ? shapes.findIndex((x) => fretsText(x.frets) === frets) : -1;
  const shape = shapes[at >= 0 ? at : homeShape(shapes, r.root, inversion)];
  return shape ? bassIndexOf(r.root, def, shape) : /^\d+$/.test(inversion) ? Number(inversion) : 0;
}

/* A shape in words. Strings: its tab ("x 3 2 0 1 0", "x32010") and its
   place ("fret 3"). The piano: its notes, low to high, as the chord on
   screen spells them ("C4 E4 G4"), and its lowest one ("C4"). */
// (spell: the chord's spelling the key is named in; the chord on screen's by default)
const chordOnSpell = () => (state.chord.on ? chordSpelling(state.chord.root, findChord(state.chord.type), letterOf(state.chord)) : null);
const pianoName = (k, spell = chordOnSpell()) => {
  const m = instrument().low + k;
  return pitchName(m, (spell && spell.names.get(mod12(m))) || freeNote(m, state.flats));
};
const shapeTab = (shape, spell = chordOnSpell()) => (shape.piano ? shape.frets.map((k) => pianoName(k, spell)).join(' ') : tabOf(shape));
const shapeShort = (shape, spell) => (shape.piano ? shapeTab(shape, spell) : shortTab(shape));
const shapeWhere = (shape) => (shape.piano ? pianoName(shape.frets[0]) : shapePlace(shape));
// A shape that fits this neck and plays only notes of the chord, at least
// two (how a link's custom shape is checked). The piano: keys of the
// keyboard, low to high, each once.
function playsChord(root, def, frets) {
  const inst = cappedInstrument();
  const pcs0 = new Set(chordTones(root, def).map((t) => t.pc));
  // (an interval's: just that interval, its root below, see intervalOf)
  const isIt = (midis) => !def.span || (mod12(Math.min(...midis)) === root && (intervalOf(midis) || {}).id === def.id);
  if (inst.piano) {
    return frets.length >= 2 && frets.every((k, i) => Number.isInteger(k) && k >= 0 && k < inst.keys && (!i || k > frets[i - 1]))
      && frets.every((k) => pcs0.has(mod12(inst.low + k))) && isIt(frets.map((k) => inst.low + k));
  }
  if (frets.length !== inst.strings.length) return false;
  if (frets.some((f, s) => !Number.isInteger(f) || f < -1 || f > inst.frets || (f > 0 && f <= startFret(inst, s)))) return false;   // (a drone: fretted past its start)
  const pcs = new Set(chordTones(root, def).map((t) => t.pc));
  const notes = shapeMidis(frets);
  return notes.length >= 2 && notes.every((m) => pcs.has(mod12(m))) && isIt(notes);
}
function listShapes(root, def, inversion = inversionFor(def)) {
  let shapes = chordShapes(root, def, inversion);
  const piano = Boolean(instrument().piano);
  for (const text of drawnFrets(root, def.id)) {
    if (shapes.some((x) => fretsText(x.frets) === text)) continue;
    const frets = readFrets(text);
    if (!playsChord(root, def, frets)) continue;   // (drawn on another instrument tuned the same, past this one's frets)
    if (inversion !== 'any' && mod12(Math.min(...shapeMidis(frets))) !== chordTones(root, def)[Number(inversion)].pc) continue;
    const fretted = frets.filter((f) => f > 0);
    const shape = { frets, pos: piano ? frets[0] : fretted.length ? Math.min(...fretted) : 0, drawn: true, piano };
    const after = shapes.findIndex((x, i) => (piano || i > 0) && x.pos > shape.pos);   // (a neck's first shape stays first)
    const at = shapes.length ? (after < 0 ? shapes.length : after) : 0;
    shapes = [...shapes.slice(0, at), shape, ...shapes.slice(at)];
  }
  return shapes;
}
/* A chord's chip, in the list or the recent chords: a chord and its bass
   note (D and D/F♯ are two chips, each named so), its shapes and inversions
   remembered for each neck */
const newEntry = (root, type, bass) => ({ root, type, bass, shapes: {}, inversions: {} });
const sameEntry = (a, b) => a.root === b.root && a.type === b.type && a.bass === b.bass;
const chipEntry = (root, type, bass) => [...state.list, ...state.recent].find((r) => sameEntry(r, { root, type, bass })) || null;
const shownBass = () => (state.chord.on ? currentChord().bassIndex : null);   // the chord on screen's bass (its shape's, or its inversion's)
const recentEntry = () => (state.chord.on && !state.loose ? chipEntry(state.chord.root, state.chord.type, shownBass()) : null);   // the chord on screen's (none: shown apart)

// A chord into the recent ones, first; past RECENT_KEEP the one unused longest goes
function addRecent(entry) {
  if (!state.recent.includes(entry)) state.recent.unshift(entry);
  entry.used = ++recentClock;
  trimRecent();
}
function trimRecent() {
  while (state.recent.length > RECENT_KEEP) {
    const old = state.recent.reduce((a, b) => (a.used <= b.used ? a : b));
    state.recent.splice(state.recent.indexOf(old), 1);
  }
}
// The recent chords shown, those used last (in their order): what the list
// leaves of RECENT_KEEP chords, at least RECENT_MAX
function shownRecent() {
  const room = Math.max(RECENT_MAX, RECENT_KEEP - state.list.length);
  const last = [...state.recent].sort((a, b) => b.used - a.used).slice(0, room);
  return state.recent.filter((r) => last.includes(r));
}

/* The shape a chip remembers for the chord on screen, here and now (or the
   first): kept as its frets, so it stays the same shape even if the shape
   list changes */
function rememberedShape(entry = recentEntry(), inversion = null) {
  if (!entry) return null;
  const def = findChord(entry.type);
  inversion = inversion || chipInversion(entry, def);
  const frets = entry.shapes && entry.shapes[shapeContext(def, inversion)];
  const at = frets ? listShapes(entry.root, def, inversion).findIndex((shape) => fretsText(shape.frets) === frets) : -1;
  return at < 0 ? null : at;   // (none: the home shape)
}
// The inversion a chip was last used with on this instrument (or the one set now)
function chipInversion(entry, def) {
  const v = entry && entry.inversions && entry.inversions[state.instrument];
  return inversionFor(def, v || state.inversion[state.instrument]);
}
// A chip's chord back on screen: its inversion (or, with fallback, the
// default), then its shape; its bass whatever those give (its name says
// it: D/F♯ comes back as D/F♯, in that inversion if need be, shape or none;
// with onlyPlayable, only where this neck has a shape for it)
function recallChip(entry = recentEntry(), fallback = false, onlyPlayable = false) {
  if (!entry) return;
  const v = entry.inversions && entry.inversions[state.instrument];
  if (v || fallback) state.inversion[state.instrument] = v || DEFAULT_INVERSION[state.instrument];
  state.shape = rememberedShape(entry);
  const ch = state.chord.on ? currentChord() : null;
  if (!ch || entry.bass === undefined || ch.bassIndex === entry.bass) return;
  const want = String(entry.bass);
  if (onlyPlayable && !listShapes(ch.root, ch.def, inversionFor(ch.def, want)).length) return;
  state.inversion[state.instrument] = want;
  state.shape = rememberedShape(entry, inversionFor(ch.def, want));
}
// Where a chip's chord comes back, worked out as recallChip does without
// putting it on screen: { inversion, shapes, index } (-1: no shape)
function chipShape(entry) {
  const def = findChord(entry.type);
  const at = (inversion) => {
    const shapes = listShapes(entry.root, def, inversion);
    return { inversion, shapes, index: shapes.length ? rememberedShape(entry, inversion) ?? homeShape(shapes, entry.root, inversion) : -1 };
  };
  const got = at(chipInversion(entry, def));
  const shape = got.shapes[got.index];
  const bass = shape ? bassIndexOf(entry.root, def, shape) : /^\d+$/.test(got.inversion) ? Number(got.inversion) : 0;
  return entry.bass === undefined || bass === entry.bass ? got : at(inversionFor(def, String(entry.bass)));
}
/* The neck changes (another instrument, tuning or capo): the chord on
   screen keeps its name, bass note and all (Bdim/F stays Bdim/F on the
   guitar). Its chip's shape there if that has the same bass, else the
   first shape with it; if the new neck has none, as its chip remembers. */
function changeNeck(change) {
  state.loose = false;   // (a link's shape was for the link's neck: back on the chord's chip)
  const before = currentChord();
  const bass = before && before.shape ? before.bassIndex : null;
  const entry = recentEntry();   // (its chip: the same chip after, where the new neck can play its bass)
  change();
  state.shape = null;
  recallChip(entry || recentEntry(), false, true);
  if (bass === null) return;
  const now = currentChord();
  if (!now || (now.shape && now.bassIndex === bass)) return;
  const want = String(bass);
  if (inversionFor(now.def, want) !== want || !listShapes(now.root, now.def, want).length) return;
  state.inversion[state.instrument] = want;
  state.shape = null;
}
/* The capo moved, named from it (Names from capo, a fretted neck; see
   nameShift): the shapes stay, and so do their names; what sounds moves.
   Everything kept as it sounds moves with it: the chord and the scale
   (their roots, and a name picked for them, see letterOf), the chord list
   and the recent chords (a chip's shapes on this neck carried to the new
   capo; on other necks forgotten, they played the chord before: their
   first shapes there), this neck's custom shapes (copied: another tab may
   still play the old one), Name a chord's root picked. The shape on screen
   stays where the new capo has it. With the switch off, or no capo moved,
   the chords stay as they sound, as with any other neck change. */
function moveCapo(c) {
  const from = capo();
  const d = c - from;
  if (!d || !state.nameFromCapo || instrument().piano) { changeNeck(() => setCapo(c)); return; }
  const was = state.chord.on ? currentChord() : null;
  const keep = was && was.shape ? fretsText(was.shape.frets) : null;
  changeNeck(() => {
    moveWork(d, from);
    setCapo(c);
  });
  const now = keep !== null && state.chord.on ? currentChord() : null;
  const at = now ? now.shapes.findIndex((sh) => fretsText(sh.frets) === keep) : -1;
  if (at >= 0) state.shape = at;
}
function moveWork(d, from) {
  const strings = String(instrument().strings);
  const up = (pc) => mod12(pc + d);
  // (a name picked: to the shift it now names from; one past any capo, gone)
  const moved = (x) => {
    const at = (x.letterAt || 0) + d;
    return Number.isInteger(x.letter) && at >= 0 && at <= MAX_CAPO ? letterPair(x.letter, at) : letterPair(null);
  };
  for (const x of [state.chord, state.scale]) Object.assign(x, { root: up(x.root) }, moved(x));
  const here = `${strings}|${from}|`;
  for (const r of [...state.list, ...state.recent]) {
    r.root = up(r.root);
    setPair(r, moved(r));
    r.shapes = Object.fromEntries(Object.entries(r.shapes || {}).filter(([k]) => k.startsWith(here))
      .map(([k, frets]) => [`${strings}|${from + d}|${k.slice(here.length)}`, frets]));
  }
  for (const x of state.drawn.filter((x) => x.neck === `${strings}|${from}`)) {
    const copy = { root: up(x.root), type: x.type, neck: `${strings}|${from + d}`, frets: x.frets };
    state.drawn = state.drawn.filter((y) => !(y.root === copy.root && y.type === copy.type && y.neck === copy.neck && y.frets === copy.frets));
    state.drawn.push(copy);
  }
  state.drawn = state.drawn.slice(-DRAWN_MAX);
  if (naming) {
    if (naming.root !== null) naming.root = up(naming.root);
    if (naming.letter !== null) Object.assign(naming, { letterRoot: up(naming.letterRoot) }, moved(naming));
  }
}
// The capo menu's switch, on its title row as a panel's switches are, what
// it does in its tooltip
function capoSwitch() {
  const what = 'Name chords, scales and notes by the shapes played above the capo, as song sheets do (off: as they sound)';
  return `<button type="button" id="tglNameFromCapo" class="pill-toggle" data-toggle aria-pressed="${state.nameFromCapo}" title="${esc(what)}">` +
    '<span class="pill-dot" aria-hidden="true"></span><span class="pill-label">Names from capo</span></button>';
}
function rememberShape(entry = recentEntry()) {
  const ch = currentChord();
  if (!entry || !ch || !ch.shape) return;
  entry.inversions = { ...entry.inversions, [state.instrument]: ch.inversion };
  const ctx = shapeContext();
  entry.shapes = { ...entry.shapes };
  delete entry.shapes[ctx];
  entry.shapes[ctx] = fretsText(ch.shape.frets);   // newest last; keep the last few settings only
  const keys = Object.keys(entry.shapes);
  for (const k of keys.slice(0, Math.max(0, keys.length - 4))) delete entry.shapes[k];
}

/* Called on every render: what you did is worked out from what changed on
   screen since the last render (the chord, and how it was picked: menuPick,
   chipPick), not reported by each control. Anything that changes the chord
   must go through updateChord (menus), playChip (chips) or set those flags,
   or it will count as a plain new chord. */
function trackChord() {
  const bass = shownBass();
  const key = state.chord.on ? `${state.chord.root}:${state.chord.type}:${bass}` : '';
  const sameInst = shownChord !== undefined && shownChord.inst === state.instrument;
  // A chord shown apart from its chip: until it changes, or its chip goes
  if (state.loose && (!state.chord.on || (shownChord && shownChord.key !== key) || !chipEntry(state.chord.root, state.chord.type, bass))) state.loose = false;
  const setup = [state.instrument, instrument().strings, capo()].join('|');
  if (!shownChord || shownChord.setup !== setup) openEntry = null;   // a new instrument, tuning or capo: final
  const how = menuPick;
  const changed = sameInst && (shownChord.key !== key || how !== '');
  const fromChip = chipPick;
  const prev = shownChord && shownChord.entry;
  menuPick = '';
  chipPick = false;
  shownChord = { inst: state.instrument, key, setup, entry: recentEntry() };
  if (!state.chord.on) return;
  if (!changed) {
    // The chord on screen always has its chip: the one the page opens on
    // (saved, or a link's), or one whose bass another neck can't play
    if (!shownChord.entry && !state.loose) {
      addRecent(shownChord.entry = newEntry(state.chord.root, state.chord.type, bass));
      rememberShape(shownChord.entry);
    }
    keepLetter(shownChord.entry);   // its name as the chord's (Flats changed, a scale: see settleLetters)
    return;
  }
  const open = how === 'type' && openEntry && state.recent.includes(openEntry) ? openEntry : null;
  openEntry = null;
  let entry = shownChord.entry;
  if (!entry && open) {                // root, then type: the same chip, edited
    Object.assign(open, newEntry(state.chord.root, state.chord.type, bass));
    entry = open;
  } else if (!entry && prev && state.recent.includes(prev) && prev.root === state.chord.root && prev.type === state.chord.type) {
    prev.bass = bass;                  // the same chord, another bass (a shape, an inversion): its recent chip, renamed
    entry = prev;
  } else if (!entry) {                 // a new chord (or a list chip's, with another bass): a new recent chip
    entry = newEntry(state.chord.root, state.chord.type, bass);
    if (how === 'root') openEntry = entry;   // the next type pick may still edit it
  } else if (open && open !== entry) { // root, then type, landing on a chord already there
    state.recent.splice(state.recent.indexOf(open), 1);
  }
  shownChord.entry = entry;
  // Not in the list: one of the recent chords, first when new (a recent
  // chip tapped stays where it is)
  if (!state.list.includes(entry)) addRecent(entry);
  if (!fromChip) rememberShape(entry);   // picked from the menus: its first shape
  keepLetter(entry);
}
/* A chip carries its root's name only when it is not its usual one (the
   Alternative root switch, or a link's F𝄪dim): that of the chord on
   screen, its chord, as it was last picked (see settleLetters) */
function keepLetter(entry) {
  if (!entry) return;
  setPair(entry, otherPair(state.chord.root, findChord(state.chord.type), pairOf(state.chord)));   // (not yet settled, see pickedLetter)
}
// (a chord root's letter as read or picked, when it is not its usual name
// here (its other one, the Alternative root; a link's F𝄪): else null,
// nothing to keep)
const otherLetter = (root, def, letter) => (Number.isInteger(letter) && def && chordNameAs(root, letter) && letter !== spellChord(root, def).root.letter ? letter : null);
// (... under the naming shift it was picked in, see letterOf)
const otherPair = (root, def, pair) => letterPair(atShift(pair.letterAt, () => otherLetter(root, def, pair.letter)), pair.letterAt);
/* A root's name picked (the Alternative root) or read (a link's F𝄪dim) is
   a letter, kept with the naming shift it was picked under (letterAt: 0,
   named as it sounds; a capo, named from it: see nameShift). It names that
   root under that shift only: G♭ picked with capo 3, named from it, is
   the A that sounds, which no other shift writes with a G (G𝄪 with no
   capo); there, the root's usual name, the pick kept for when that shift
   is back (the switch turned on again, the instrument with that capo).
   Moving the capo, named from it, moves it along (see moveCapo). */
const letterOf = (x) => (x && Number.isInteger(x.letter) && (x.letterAt || 0) === nameShift() ? x.letter : null);
const letterPair = (letter, at = nameShift()) => (Number.isInteger(letter) ? { letter, letterAt: at } : { letter: null, letterAt: 0 });
const pairOf = (x) => letterPair(x && Number.isInteger(x.letter) ? x.letter : null, (x && x.letterAt) || 0);
// (a chip's: only when it has one, letterAt only when not 0)
const entryPair = (pair) => (pair.letter === null ? {} : { letter: pair.letter, ...(pair.letterAt ? { letterAt: pair.letterAt } : {}) });
function setPair(entry, pair) {
  delete entry.letter;
  delete entry.letterAt;
  Object.assign(entry, entryPair(pair));
}
/* A root's other name, picked, that its scale or chord type writes anyway
   (D♯ picked for D♯ major, then minor: D♯ minor is the easier key) is no
   choice any more: the switch goes off, the name stays. Same for one that
   is not a name of that root. A chord keeps its own under a scale that
   names its root (see chordSpelling). */
const settledLetter = (letter, root, auto, as = rootAs) => (Number.isInteger(letter) && as(root, letter) && letter !== auto.letter ? letter : null);
// (one picked under another naming shift: kept as it is, for that shift, see letterOf)
const settledPair = (pair, root, auto, as = rootAs) => (pair.letter === null || pair.letterAt !== nameShift() ? pair : letterPair(settledLetter(pair.letter, root, auto(), as)));
function settleLetters() {
  const keep = settledPair;
  Object.assign(state.scale, state.scale.on ? keep(pairOf(state.scale), state.scale.root, () => spellScale(state.scale.root, findScale(state.scale.type)).root) : letterPair(null));
  Object.assign(state.chord, state.chord.on ? keep(pairOf(state.chord), state.chord.root, () => spellChord(state.chord.root, findChord(state.chord.type)).root, chordNameAs) : letterPair(null));
  // Name a chord's, as the chord's (Flats on: G♭ the usual name, picked or not)
  if (naming && naming.letter !== null && naming.letterAt === nameShift()) {
    const r = namerReadings()[naming.pick];
    if (!r || naming.letterRoot !== mod12(r.root) || settledLetter(naming.letter, r.root, ownChordSpelling(r.root, r.def).root) === null) naming.letter = null;
  }
}

function keepChord() { openEntry = null; }   // strummed, cycled, its notes played: this chip is final

// A chip tapped: its chord on screen (in the list: data-i, recent: data-r)
function playChip(entry) {
  if (!entry) return;
  keepChord();
  state.chord = { on: true, root: entry.root, type: entry.type, ...pairOf(entry) };
  state.loose = false;
  recallChip(entry, true);   // as it was last used: its inversion and shape
  chipPick = true;
  ui.reveal = true;   // phones: bring the shape into view, even if this chip was already the one on screen
  ui.chipKey = '';    // ... and the chip itself, whole
  render();
}

/* The + on a recent chip: its chord joins the end of the list (it leaves
   the recent ones). The chord on screen stays. */
function pinChord(i) {
  const entry = state.recent[i];
  if (!entry || state.list.length >= LIST_MAX) return;
  if (openEntry === entry) openEntry = null;   // final
  state.recent.splice(i, 1);
  state.list.push(entry);
  render();
  focusChip(`[data-i="${state.list.length - 1}"]`);
}
// The keyboard focus, after a + or an ×: on the chord's chip where it went
function focusChip(selector) {
  const row = document.activeElement && document.activeElement.closest && document.activeElement.closest('.recent-chips');
  const chip = row && row.querySelector(selector);
  if (chip) chip.focus({ preventScroll: true });
}
/* The × on the list's chip of the chord on screen: it leaves the list. The
   chord stays on screen, so it is back with the recent ones, first. */
function unpinChord(i) {
  const entry = state.list[i];
  if (!entry) return;
  const shown = entry === recentEntry();
  state.list.splice(i, 1);
  if (shown) addRecent(entry);
  render();
  if (shown) focusChip(`[data-r="${state.recent.indexOf(entry)}"]`);
}

/* Chips dropped in a new order (a drag): the chips before the line are the
   list, those after it the recent chords. A recent chip dropped among the
   list's chips joins the list there (as its + would, if there is room); a
   list chip dropped past the line leaves it, and is one of the recent
   chords there (the one unused longest making room). `order`: the entries,
   with LINE where the line is. */
const LINE = 'line';
function dropChips(order) {
  const cut = order.indexOf(LINE);
  const list = order.slice(0, cut);
  const recent = order.slice(cut + 1);
  if (list.length > LIST_MAX) return;   // no room: it goes back
  for (const r of recent) if (!state.recent.includes(r)) r.used = ++recentClock;   // just put there
  for (const r of list) if (r === openEntry) openEntry = null;   // in the list: final
  // (the ones kept out of sight stay, after those shown)
  const hidden = state.recent.filter((r) => !recent.includes(r) && !list.includes(r));
  state.list = list;
  state.recent = [...recent, ...hidden];
  trimRecent();
  ui.keepRow = true;
  render();
}
/* Move a list chip to another place in the list (Shift+← / →). Its place
   only: which chord is on screen, and which was used last, stay. */
function moveRecent(from, to) {
  const list = state.list;
  if (from === to || !list[from] || to < 0 || to >= list.length) return;
  list.splice(to, 0, ...list.splice(from, 1));
  ui.keepRow = true;
  render();
}

/* Drag a chip to reorder the row, or across the line between the list and
   the recent chords (dropChips). With a finger: press and hold it still
   (HOLD_MS), then drag; a quick tap still picks the chord and a swipe still
   scrolls the row. With a mouse or a pen: press and move a few pixels. The
   chip lifts and moves along the row with the pointer, held where it was
   pressed, the others
   slide aside to show where it will land, and the row scrolls when the
   pointer nears either end. While dragging, the line is there even when one
   side is empty (at the end of the list, or before the recent chords), so a
   chip can always cross it. */
const HOLD_MS = 350;
function setupChipDrag(row) {
  let drag = null;   // { li, entry, id, x, y, touch, timer, on, items, from, at, scroll, frame, ghost, line }
  let swallowClick = false;
  const stop = () => {
    if (!drag) return;
    clearTimeout(drag.timer);
    cancelAnimationFrame(drag.frame);
    for (const it of drag.items || []) it.style.transform = '';
    if (drag.ghost) drag.ghost.remove();
    if (drag.line) drag.line.remove();
    drag.li.classList.remove('dragging');
    row.classList.remove('reordering');
    drag = null;
  };
  const begin = () => {
    drag.on = true;
    swallowClick = true;
    if (navigator.vibrate) try { navigator.vibrate(10); } catch { /* not allowed */ }
    // A mouse keeps the drag even off the row; a finger needs nothing: its
    // events already go to the chip it pressed (moving that capture, as
    // Android browsers do, would end the drag at once)
    if (!drag.touch) try { drag.li.setPointerCapture(drag.id); } catch { /* already released */ }
    if (!row.querySelector(':scope > .recent-sep')) {   // no line: one for the drag
      drag.line = document.createElement('li');
      drag.line.className = 'recent-sep';
      drag.line.setAttribute('aria-hidden', 'true');
      if (drag.li.classList.contains('trail')) row.prepend(drag.line); else row.append(drag.line);
    }
    drag.items = [...row.children];
    drag.from = drag.items.indexOf(drag.li);
    drag.rects = drag.items.map((it) => it.getBoundingClientRect());
    drag.scroll = row.scrollLeft;
    drag.at = drag.from;
    // The chip lifts out of the row (a copy above everything, so nothing
    // clips it), held where it was pressed, and leaves an outlined slot
    // where it will land. The copy sits in a row of its own with the same
    // classes as its row's (the dock's or the panel's), so it keeps its
    // look exactly (list or recent, lit or not) until it is dropped.
    const r = drag.rects[drag.from];
    drag.grab = drag.x - r.left;
    drag.ghost = document.createElement('div');
    drag.ghost.className = `chip-lift${row.closest('.dock-recent') ? ' dock-recent' : ''}`;
    const copyRow = document.createElement('ol');
    copyRow.className = 'recent-chips';
    copyRow.append(drag.li.cloneNode(true));
    drag.ghost.append(copyRow);
    Object.assign(drag.ghost.style, { top: `${r.top}px`, transformOrigin: `${drag.grab}px 50%` });
    document.body.append(drag.ghost);
    drag.li.classList.add('dragging');
    row.classList.add('reordering');
    const edge = () => {   // near an end: scroll that way
      if (!drag) return;
      const box = row.getBoundingClientRect();
      const speed = drag.px < box.left + 32 ? -8 : drag.px > box.right - 32 ? 8 : 0;
      if (speed) { row.scrollLeft += speed; place(); }
      drag.frame = requestAnimationFrame(edge);
    };
    place();   // lifted right away, under the pointer
    drag.frame = requestAnimationFrame(edge);
  };
  const place = () => {
    const shift = row.scrollLeft - drag.scroll;   // the row scrolled since the drag began
    const { rects, from, grab } = drag;
    // The copy: along the row, the point it is held by under the pointer
    // (the scale grows it around that point, so it stays there)
    drag.ghost.style.transform = `translate(${drag.px - grab}px, -3px) scale(1.12)`;
    // Where it lands: past the middle of each chip it is dragged over; its
    // slot moves there
    const mid = drag.px - grab + rects[from].width / 2 + shift;
    let at = from;
    while (at < rects.length - 1 && mid > rects[at + 1].left + rects[at + 1].width / 2) at++;
    while (at > 0 && mid < rects[at - 1].left + rects[at - 1].width / 2) at--;
    drag.at = at;
    const slot = at > from ? rects[at].right - rects[from].width : rects[at].left;
    drag.li.style.transform = at === from ? '' : `translateX(${slot - rects[from].left}px)`;
    const gap = parseFloat(getComputedStyle(row).columnGap) || 6;
    const size = rects[from].width + gap;
    drag.items.forEach((it, i) => {
      if (i === from) return;
      const by = from < at && i > from && i <= at ? -size : from > at && i < from && i >= at ? size : 0;
      it.style.transform = by ? `translateX(${by}px)` : '';
    });
  };
  // The entries in the row's order, with LINE for the line
  const entryOf = (li) => {
    if (li.classList.contains('recent-sep')) return LINE;
    const chip = li.querySelector('[data-i], [data-r]');
    return chip.dataset.i !== undefined ? state.list[Number(chip.dataset.i)] : state.recent[Number(chip.dataset.r)];
  };
  row.addEventListener('pointerdown', (e) => {
    if (e.button > 0 || drag || e.target.closest('.recent-remove, .recent-pin')) return;
    const li = e.target.closest('li');
    if (!li || !li.querySelector('[data-i], [data-r]')) return;
    drag = { li, id: e.pointerId, x: e.clientX, y: e.clientY, px: e.clientX, touch: e.pointerType === 'touch', on: false };
    if (drag.touch) drag.timer = setTimeout(() => { if (drag && !drag.on) begin(); }, HOLD_MS);
  });
  row.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.on) {
      const moved = Math.hypot(e.clientX - drag.x, e.clientY - drag.y);
      if (drag.touch) { if (moved > 8) stop(); return; }   // moved before the hold: a swipe
      if (moved < 5) return;
      drag.px = e.clientX;
      begin();
      return;
    }
    drag.px = e.clientX;
    place();
  });
  row.addEventListener('pointerup', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const { on, from, at, items } = drag;
    const order = on ? items.map(entryOf) : null;
    stop();
    if (!on || from === at) return;
    order.splice(at, 0, ...order.splice(from, 1));
    dropChips(order);
  });
  row.addEventListener('pointercancel', stop);
  row.addEventListener('lostpointercapture', (e) => { if (drag && drag.on && !drag.touch && e.target === drag.li && e.pointerId === drag.id) stop(); });
  // While dragging, a finger does not scroll the page or the row
  row.addEventListener('touchmove', (e) => { if (drag && drag.on) e.preventDefault(); }, { passive: false });
  row.addEventListener('contextmenu', (e) => { if (drag) e.preventDefault(); });   // a long press is a drag here
  // The click that ends a drag picks nothing
  row.addEventListener('click', (e) => {
    if (!swallowClick) return;
    swallowClick = false;
    e.stopImmediatePropagation();
    e.preventDefault();
  }, true);
  row.addEventListener('pointerdown', () => { swallowClick = false; }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && drag && drag.on) { e.stopPropagation(); stop(); } }, true);
  // Shift+← / → moves the focused list chip
  row.addEventListener('keydown', (e) => {
    const chip = e.target.closest('[data-i]');
    if (!chip || !e.shiftKey || e.altKey || e.ctrlKey || e.metaKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    e.preventDefault();
    e.stopPropagation();
    const from = Number(chip.dataset.i);
    const to = from + (e.key === 'ArrowRight' ? 1 : -1);
    if (to < 0 || to >= state.list.length) return;
    moveRecent(from, to);
    const moved = row.querySelector(`[data-i="${to}"]`);
    if (moved) moved.focus();
  });
}

/* Reset: no chord, no scale, no capo (the chord list, the instrument and
   its tuning stay), once asked. Off when there is nothing to reset, and
   while naming a chord. */
function askReset() {
  // What goes: each with its name, as its panel or menu shows it
  const ch = currentChord();
  const sc = currentScale();
  els.resetWhat.innerHTML = [
    ch && ['Chord', ch.symbol],
    sc && ['Scale', `${sc.rootName} ${scaleTitle(sc.def)}`],
    capo() && ['Capo', `Fret ${capo()}`],
  ].filter(Boolean).map(([what, name]) => `<span class="label">${what}</span><span class="delete-name">${tx(name)}</span>`).join('');
  if (els.resetAsk.showModal) els.resetAsk.showModal(); else els.resetAsk.setAttribute('open', '');
  els.resetAskCancel.focus();
}
function closeReset() {
  if (!els.resetAsk.open) return;
  if (els.resetAsk.close) els.resetAsk.close(); else els.resetAsk.removeAttribute('open');
}
function resetAll() {
  closeReset();
  if (capo()) { ui.groupAt = null; moveCapo(0); }   // (as No capo in its menu: back to the first group; named from it, the chord list keeps its names, see moveCapo)
  chordOff();
  scaleOff();
  ui.tab = null;   // (phones: the sheet closes, as on Deselect)
  render();
}

/* The bin: the list and the recent chords empty, and the chord on screen
   goes with them. With chords saved in the list, asked first: all of them
   (Clear all), or only the recent ones (Clear recent, when there are some:
   the saved ones stay). With none saved, the recent ones go straight away. */
const chordCount = (n, what) => `${n} ${what} chord${n === 1 ? '' : 's'}`;
function askClearRecent() {
  if (!state.list.length) { clearRecent(); return; }
  const saved = state.list.map(entrySymbol);
  const recent = shownRecent().map(entrySymbol);
  els.listClearCount.textContent = chordCount(saved.length, 'saved');
  els.listClearNames.innerHTML = lkValue(saved, 'win');   // chips, as in the share popup
  // the recent ones under them, quieter: dashed chips, as in the chord list
  els.listClearRecentCount.textContent = chordCount(recent.length, 'recent');
  els.listClearRecentNames.innerHTML = `<span class="lk-val chips recent">${recent.map((n) => `<span class="lk-chip trail">${TRAIL_CHIP_EDGE}${chipText(n)}</span>`).join('')}</span>`;
  for (const el of [els.listClearRecentCount, els.listClearRecentNames, els.listClearRecentGo]) el.hidden = !recent.length;
  if (els.listClear.showModal) els.listClear.showModal(); else els.listClear.setAttribute('open', '');
  fitDashes(els.listClearRecentNames, '.lk-chip.trail');
  els.listClearCancel.focus();
}
function closeClearRecent() {
  if (els.listClear.open) {
    if (els.listClear.close) els.listClear.close(); else els.listClear.removeAttribute('open');
  }
}
function clearRecent() {
  closeClearRecent();
  state.list = [];
  state.recent = [];
  chordOff();
  render();
}
// Only the recent chords: the saved ones stay, and so does the chord on
// screen if it is one of them (a recent one goes with its chip)
function clearRecentOnly() {
  closeClearRecent();
  const shown = state.chord.on ? chipEntry(state.chord.root, state.chord.type, shownBass()) : null;   // (shown apart from it too: it goes with it)
  state.recent = [];
  openEntry = null;
  if (state.chord.on && !state.list.includes(shown)) chordOff();
  render();
}

const stepShape = (step) => { const ch = currentChord(); if (ch) selectShape(ch.index + step); };   // the next shape, or the one before
function selectShape(index) {
  const ch = currentChord();
  if (!ch || !ch.shapes.length) return;
  keepChord();   // cycling its shapes: this chord is being used
  state.shape = (index + ch.shapes.length) % ch.shapes.length;
  rememberShape();
  render();
}

/* Scale groups overlap, so one is picked at a time (ui.group), stepped
   through like a chord's shapes. The place picked on the neck is kept
   (ui.groupAt: the group's lowest fret, as its chip names it, and the fret
   in its middle), so the hand stays there when the scale changes (another
   root or type, tuning or capo): the group that starts at the same fret if
   there is one, else the nearest (the one whose middle is nearest of two
   as near). Before any pick, on another instrument, or with the capo taken
   off: the first group (nearest the nut); on a keyboard, the one about
   middle C, as its chord's home shape is (homeShape: its notes' middle
   nearest E4). A keyboard's groups (keyboardGroups): by their keys, as a
   neck's by their frets. */
const groupFrets = (g) => (g.keys ? g.keys : [Math.min(...g.bars.map((b) => b.a)), Math.max(...g.bars.map((b) => b.b))]);
const groupMid = (g) => { const [a, b] = groupFrets(g); return (a + b) / 2; };
function pickGroup(groups) {
  if (!groups.length) return -1;
  if (ui.groupAt === null) {
    if (!groups[0].keys) return 0;
    const far = (g) => Math.abs(g.mid - 64);
    return groups.reduce((best, g, i) => (far(g) < far(groups[best]) ? i : best), 0);
  }
  const far = (g) => [Math.abs(groupFrets(g)[0] - ui.groupAt.low), Math.abs(groupMid(g) - ui.groupAt.mid)];
  let best = 0;
  groups.forEach((g, i) => {
    const [low, mid] = far(g);
    const [bestLow, bestMid] = far(groups[best]);
    if (low < bestLow || (low === bestLow && mid < bestMid)) best = i;
  });
  return best;
}
function selectGroup(index) {
  const groups = ui.groups;
  if (!groups.length) return;
  const i = (index + groups.length) % groups.length;
  stopGroup();
  ui.groupAt = { low: groupFrets(groups[i])[0], mid: groupMid(groups[i]) };
  ui.revealGroup = true;
  render();
}
/* "Open" (a note at the nut, or at the capo), else its lowest fret, counted
   from the capo like a chord shape's; a keyboard's: its root ("C4") */
const groupPlace = (g, capo) => (g.keys ? groupKeyName(g.keys[0]) : g.bars.some((b) => b.a === capo) ? 'open' : `fret ${groupFrets(g)[0] - capo}`);
const groupKeyName = (k) => pianoName(k, (currentScale() || {}).spell);   // (a key of a keyboard's group: named as in the scale)
// Where a group lies, as its stepper and chip say: "Frets 2 to 5", "C4 to C5"
const groupSpan = (g, capo) => (g.keys ? `${groupKeyName(g.keys[0])} to ${groupKeyName(g.keys[1])}` : `Frets ${groupFrets(g)[0] - capo} to ${groupFrets(g)[1] - capo}`);

/* A keyboard's scale groups: an octave each, from the scale's root to the
   next (both in it: played root to root), every one the keyboard holds,
   low to high, with its notes' middle (mid, MIDI: see pickGroup). Shown by
   a bar over its keys' far ends (.group-bar, see renderPiano), no note
   dimmer. */
function keyboardGroups(inst, sc) {
  const groups = [];
  for (let m = inst.low + mod12(sc.root - inst.low); m + 12 < inst.low + inst.keys; m += 12) {
    const notes = [];
    for (let x = m; x <= m + 12; x++) if (sc.set.has(mod12(x))) notes.push(x);
    groups.push({ keys: [m - inst.low, m + 12 - inst.low], mid: notes.reduce((sum, x) => sum + x, 0) / notes.length });
  }
  return groups;
}
