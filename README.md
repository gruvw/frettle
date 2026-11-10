# Frettle

A fretboard visualizer for guitar, bass, ukulele, mandolin, mandola and banjo. Pick a chord or a scale and see where every note sits on the neck.

**Try it at [frettle.gruvw.com](https://frettle.gruvw.com)**

<p align="center">
  <img src="docs/images/desktop.png" alt="Frettle on a laptop: A minor pentatonic with its first group outlined, and an Am7 chord shape at the nut" width="100%">
</p>

<p align="center">
  <img src="docs/images/phone-neck.png" alt="Frettle on a phone: a G chord shape over the G major scale" width="280">
  &nbsp;&nbsp;
  <img src="docs/images/phone-chord.png" alt="Frettle on a phone: the chord panel open for A minor on a ukulele" width="280">
</p>

## What it does

- Every note on the neck: guitar, bass, ukulele, mandolin, mandola and banjo
- Alternate tunings: Drop D, DADGAD, open G, low G ukulele, banjo double C and more, or custom ones, saved by name
- Chords in any key, every shape up the neck, with intervals on each note
- Scales and modes, one hand-sized group at a time (pentatonic boxes, CAGED positions)
- Shows when a chord fits the scale
- Notes spelled for the key: F♯ in D major, B♭ in F major
- Tap a note to hear it, strum a chord, play a scale
- Capo, octave shading and a left-handed mode
- Chord list: the chords of a song, each keeping its shape
- Share links: pick what goes in (neck, chord, scale, chord list)
- Phone first, works offline, installable (PWA)

## Running it yourself

There's nothing to build or install. The static website is in the `web/` directory: an HTML, a CSS and a JS file, plus the manifest, service worker and icons.

```sh
cd web
python3 -m http.server
```

Then open http://localhost:8000. Opening `index.html` straight from disk works too, without offline mode.

No frameworks or libraries. The sound is synthesized in the browser, and settings are saved in localStorage.

## Support

Frettle is free, with no ads. It can be supported on Ko-fi:

[![Support Frettle on Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/gruvw)
