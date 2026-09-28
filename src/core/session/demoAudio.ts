/**
 * Generated demo songs (no copyrighted material): short instrumental loops rendered as WAV,
 * so the player and the iPhone lock-screen test (spike S3) work in demo mode.
 */

interface DemoSongSpec {
  bpm: number;
  /** root note as MIDI number */
  root: number;
  /** chord roots relative to the song root, one per bar, looped */
  progression: number[];
  minor: boolean;
  seconds: number;
  drive: number;
}

const SAMPLE_RATE = 22050;

const midiToHz = (note: number) => 440 * 2 ** ((note - 69) / 12);

function render(spec: DemoSongSpec): Float32Array {
  const total = Math.floor(spec.seconds * SAMPLE_RATE);
  const out = new Float32Array(total);
  const beat = 60 / spec.bpm;
  const bar = beat * 4;
  const third = spec.minor ? 3 : 4;
  let noiseSeed = 12345;
  const noise = () => {
    noiseSeed = (noiseSeed * 1103515245 + 12345) & 0x7fffffff;
    return noiseSeed / 0x3fffffff - 1;
  };

  for (let i = 0; i < total; i++) {
    const t = i / SAMPLE_RATE;
    const barIndex = Math.floor(t / bar);
    const chordRoot = spec.root + spec.progression[barIndex % spec.progression.length]!;
    const inBeat = t % beat;
    const beatIndex = Math.floor(t / beat) % 4;
    const fadeIn = Math.min(1, t / 1.5);
    const fadeOut = Math.min(1, (spec.seconds - t) / 2);

    // pad chord
    let sample = 0;
    for (const interval of [0, third, 7]) {
      const f = midiToHz(chordRoot + interval);
      sample += 0.07 * Math.sin(2 * Math.PI * f * t) + 0.02 * Math.sin(2 * Math.PI * f * 2 * t);
    }
    // bass on every beat
    const bassEnv = Math.exp(-inBeat * 5);
    const bassF = midiToHz(chordRoot - 12);
    const bassWave = Math.sin(2 * Math.PI * bassF * t);
    sample += 0.22 * bassEnv * Math.tanh(bassWave * (1 + spec.drive));
    // arpeggio eighths
    const eighth = beat / 2;
    const step = Math.floor(t / eighth) % 4;
    const arpNote = chordRoot + 12 + [0, third, 7, 12][step]!;
    sample += 0.06 * Math.exp(-(t % eighth) * 9) * Math.sin(2 * Math.PI * midiToHz(arpNote) * t);
    // kick on 1 and 3, snare-ish noise on 2 and 4, hats on eighths
    if (beatIndex % 2 === 0) sample += 0.35 * Math.exp(-inBeat * 18) * Math.sin(2 * Math.PI * (50 + 90 * Math.exp(-inBeat * 30)) * inBeat);
    else sample += 0.12 * Math.exp(-inBeat * 14) * noise();
    sample += 0.025 * Math.exp(-(t % eighth) * 60) * noise();

    out[i] = Math.max(-1, Math.min(1, sample * fadeIn * fadeOut));
  }
  return out;
}

function toWav(samples: Float32Array): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeString = (offset: number, text: string) => [...text].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) view.setInt16(44 + i * 2, Math.round(samples[i]! * 32767), true);
  return new Blob([buffer], { type: 'audio/wav' });
}

/** Demo songs: relative path in the demo HiDrive → WAV blob. Short clips in tests. */
export function createDemoSongs(short = false): Record<string, Blob> {
  const s = (seconds: number) => (short ? 1 : seconds);
  const specs: Record<string, DemoSongSpec> = {
    'Songs/01 - Midnight Engine.wav': { bpm: 132, root: 40, progression: [0, 0, 5, 7], minor: true, seconds: s(75), drive: 3 },
    'Songs/02_Rust_and_Thunder.wav': { bpm: 118, root: 45, progression: [0, 8, 5, 7], minor: true, seconds: s(70), drive: 2 },
    'Songs/Open Road.wav': { bpm: 104, root: 43, progression: [0, 5, 9, 7], minor: false, seconds: s(80), drive: 1 },
    'Proben/2026-09-17/Slow Burn (Probe).wav': { bpm: 76, root: 38, progression: [0, 3, 5, 3], minor: true, seconds: s(90), drive: 0.5 },
    'Demos/Neon Nights (Demo).wav': { bpm: 124, root: 42, progression: [0, 7, 9, 5], minor: false, seconds: s(60), drive: 1.5 },
    'Live/2025 Stadtfest/Midnight Engine (Live).wav': { bpm: 138, root: 40, progression: [0, 0, 5, 7], minor: true, seconds: s(70), drive: 3.5 },
  };
  return Object.fromEntries(Object.entries(specs).map(([path, spec]) => [path, toWav(render(spec))]));
}
