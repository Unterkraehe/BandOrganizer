# Signalsmith Stretch (vendored)

- Source: npm package `signalsmith-stretch` 1.3.2 – https://signalsmith-audio.co.uk/code/stretch/
- License: MIT (Signalsmith Audio)

Why vendored: the library builds its AudioWorklet code from its own function source at runtime.
Bundling/minifying it breaks that code, so it is served unchanged as a static file and loaded
with a dynamic import (`src/core/audio/stretch.ts`). To update: copy
`node_modules/signalsmith-stretch/SignalsmithStretch.mjs` here after `npm update signalsmith-stretch`.
