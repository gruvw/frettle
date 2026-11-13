/* Scale groups: the rules every group follows, checked on every
   instrument, tuning, scale, root and capo (script.js: scaleGroups,
   handGroups):
   - a group covers every string, its notes playable (from the capo to the
     last fret), each string's first and last fret a scale note
   - an unbroken run of the scale, string after string, low to high: no
     scale note skipped (one may be played twice, as in the open position)
   - on a string, its notes within reach: 4 frets (7 on a mandolin or
     mandola), the open string counting as fret 1 (the capo's fret, with one)
   - the whole group within 6 frets (8 on a mandolin or mandola)
   - its outline: on each string, round all of its notes, within the same
     reach, sharing a fret with the next string's (one outline), and round
     no scale note the group does not play there
   - each group starts on a higher fret than the one before
   - no two groups share 3/4 or more of the notes of the smaller one */
const test = require('node:test');
const assert = require('node:assert');
const { scaleGroups, INSTRUMENTS, TUNINGS, ALL_SCALES, REACH, startFret } = require('../web/script.js');

const CAPOS = [0, 3];
const scales = ALL_SCALES.filter((d) => d.steps.length < 12);   // (chromatic: no groups)

test('every scale group follows the rules', () => {
  const failures = [];
  let groupCount = 0;
  for (const base of INSTRUMENTS.filter((i) => !i.piano)) {
    for (const tuning of TUNINGS[base.id] || [{ id: 'standard', strings: base.strings }]) {
      const inst = { ...base, strings: tuning.strings };
      const reach = inst.fifths ? REACH.short : REACH.long;
      const long = inst.strings.map((m, s) => s).filter((s) => !startFret(inst, s));
      // Low to high, a re-entrant string an octave lower (as scaleGroups orders them)
      const pitch = long.map((s) => inst.strings[s]);
      for (let i = pitch.length - 2; i >= 0; i--) while (pitch[i] >= pitch[i + 1]) pitch[i] -= 12;
      for (const def of scales) {
        for (let root = 0; root < 12; root++) {
          const set = new Set(def.steps.map((x) => (x + root) % 12));
          const inScale = (m) => set.has(((m % 12) + 12) % 12);
          const next = (m) => { let x = m + 1; while (!inScale(x)) x++; return x; };   // the scale note after
          for (const capo of CAPOS) {
            const name = `${inst.id} ${tuning.id}, ${root} ${def.id}, capo ${capo}`;
            const fail = (what) => failures.push(`${name}: ${what}`);
            const fret1 = (f) => Math.max(f, capo + 1);
            const groups = scaleGroups(inst, { def, root, set }, capo);
            groupCount += groups.length;
            const notesOf = [];
            let lastLow = -Infinity;
            for (const [gi, g] of groups.entries()) {
              const where = `group ${gi + 1}`;
              if (g.bars.length !== long.length || g.bars.some((b, q) => b.s !== long[q])) { fail(`${where}: not one bar per string, low to high`); continue; }
              const notes = new Set();
              let prevLast = null;
              let low = Infinity;
              let high = -Infinity;
              g.bars.forEach(({ a, b, da, db }, q) => {
                const at = `${where}, string ${q + 1} from the lowest`;
                const m = pitch[q];
                if (!(a >= capo && b <= inst.frets && a <= b)) fail(`${at}: frets ${a} to ${b} not playable`);
                if (!inScale(m + a) || !inScale(m + b)) fail(`${at}: frets ${a} to ${b} don't start and end on scale notes`);
                if (b - fret1(a) > reach.run) fail(`${at}: notes over ${b - fret1(a) + 1} frets`);
                if (!(da <= a && db >= b)) fail(`${at}: outline ${da} to ${db} leaves out notes at ${a} to ${b}`);
                if (db - fret1(da) > reach.run) fail(`${at}: outline over ${db - fret1(da) + 1} frets`);
                for (let f = da; f <= db; f++) if ((f < a || f > b) && inScale(m + f)) fail(`${at}: outline round fret ${f}, a scale note not played there`);
                if (q) {
                  const p = g.bars[q - 1];
                  if (Math.max(p.da, da) > Math.min(p.db, db)) fail(`${at}: outline shares no fret with the string before`);
                }
                if (prevLast !== null && m + a > next(prevLast)) fail(`${at}: skips a scale note after the string before`);
                prevLast = m + b;
                for (let f = a; f <= b; f++) if (inScale(m + f)) notes.add(`${q}:${f}`);
                low = Math.min(low, fret1(a));
                high = Math.max(high, b);
              });
              if (high - low > reach.group + 1) fail(`${where}: over ${high - low + 1} frets`);
              if (low <= lastLow) fail(`${where}: starts on fret ${low}, not higher than the group before (${lastLow})`);
              lastLow = low;
              notesOf.push(notes);
            }
            for (let i = 0; i < notesOf.length; i++) {
              for (let j = i + 1; j < notesOf.length; j++) {
                const shared = [...notesOf[i]].filter((k) => notesOf[j].has(k)).length;
                if (shared >= 0.75 * Math.min(notesOf[i].size, notesOf[j].size)) fail(`groups ${i + 1} and ${j + 1} share ${shared} notes`);
              }
            }
          }
        }
      }
    }
  }

  assert.ok(groupCount > 0, 'no groups at all');
  assert.deepStrictEqual(failures, []);
});
