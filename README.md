# Frettle

A fretboard visualizer for guitar, bass and ukulele. Pick a chord or a scale and see where every note sits on the neck.

**Try it at [frettle.gruvw.com](https://frettle.gruvw.com)**

<p align="center">
  <img src="docs/images/desktop.png" alt="Frettle on a laptop: A minor pentatonic split into groups, with an Am7 chord shape at the nut" width="100%">
</p>

<p align="center">
  <img src="docs/images/phone-neck.png" alt="Frettle on a phone: a G chord shape over the G major scale" width="280">
  &nbsp;&nbsp;
  <img src="docs/images/phone-chord.png" alt="Frettle on a phone: the chord panel open for A minor on a ukulele" width="280">
</p>

## What it does

- Shows every note on the neck for guitar, bass, ukulele (high or low G) and baritone ukulele
- Chords: pick a root and a type, then flip through the shapes up the neck. Each note shows its interval (R, 3, 5...) and barres are drawn in
- Scales: the modes, minors, pentatonics, blues and a few more, with the triads that fit. You can split the scale into hand-sized groups or hide the notes outside it
- Tells you when a chord fits the scale you picked
- Capo, octave shading, and tap any note to hear it or strum the whole chord
- Spells notes for the key, so you get F♯ in D major and B♭ in F major
- Built for phones first, works offline once loaded, and can be added to your home screen

## Running it yourself

There's nothing to build or install. The site is in `web/`: an HTML, a CSS and a JS file, plus the manifest, service worker and icons.

```sh
cd web
python3 -m http.server
```

Then open http://localhost:8000. Opening `index.html` straight from disk works too.

No frameworks or libraries. The sound is synthesized in the browser, and your settings are saved in localStorage.
