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

- Every note on the neck: guitar (6 or 7 strings), bass (4 or 5), ukulele, baritone ukulele, mandolin, mandola, 5-string banjo
- Alternate tunings: Drop D, DADGAD, open tunings, half or whole step down, low G ukulele, banjo double C and more
- Chords in any key, every shape up the neck, with intervals on each note and barres drawn in
- Voicings: root position, any inversion, or any bass note
- Chord list: the chords you play, each keeping its shape and voicing, to jump around a song
- Scales: modes, minors, pentatonics, blues and more, with formula, related scales and fitting triads
- Scale groups: one hand-sized box at a time (pentatonic boxes, CAGED positions)
- Only the scale's notes, or every note on the neck
- Capo, octave shading, left-handed mode
- Tap a note to hear it, strum a chord, play a scale
- Warns when a chord has notes outside the scale
- Notes spelled for the key: F♯ in D major, B♭ in F major
- Share links: neck, chord, scale and chord list, you pick what goes in
- Opening a link shows what it changes before loading anything
- Phone first, works offline, installable (PWA)

## Running it yourself

There's nothing to build or install. The static website is in the `web/` directory: an HTML, a CSS and a JS file, plus the manifest, service worker and icons.

```sh
cd web
python3 -m http.server
```

Then open http://localhost:8000. Opening `index.html` straight from disk works too, you just don't get offline mode.

No frameworks or libraries. The sound is synthesized in the browser, and your settings are saved in localStorage.

## Support

Frettle is free, with no ads. If it helps you play, you can support it on Ko-fi:

[![Support Frettle on Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/gruvw)
