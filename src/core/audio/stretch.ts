/**
 * Thin typed wrapper around the Signalsmith Stretch Web Audio node (MIT, WASM/AudioWorklet).
 * Loaded on demand, only when tempo/pitch effects are used (F9 §4).
 */

export interface StretchSchedule {
  active?: boolean;
  input?: number;
  rate?: number;
  semitones?: number;
  loopStart?: number;
  loopEnd?: number;
  output?: number;
}

export interface StretchNode extends AudioNode {
  schedule: (change: StretchSchedule) => void;
  addBuffers: (channels: Float32Array[]) => Promise<number>;
  dropBuffers: (toSeconds?: number) => Promise<unknown>;
  setUpdateInterval: (seconds: number, callback?: (inputTime: number) => void) => void;
  configure: (options: { blockMs?: number | null; intervalMs?: number; splitComputation?: boolean; preset?: 'default' | 'cheaper' }) => void;
  inputTime: number;
}

/**
 * Loaded unbundled from /vendor (see public/vendor/signalsmith-stretch/README.md): the library
 * creates its AudioWorklet from its own source text, which minification would break.
 */
export async function createStretch(ctx: AudioContext): Promise<StretchNode> {
  const url = `${import.meta.env.BASE_URL}vendor/signalsmith-stretch/SignalsmithStretch.mjs`;
  const module = (await import(/* @vite-ignore */ url)) as { default: (ctx: AudioContext) => Promise<StretchNode> };
  const node = await module.default(ctx);
  // Older/smaller devices: cheaper preset to avoid glitches (F9 §7 risk 2)
  if ((navigator.hardwareConcurrency ?? 8) <= 4) node.configure({ blockMs: null, preset: 'cheaper' });
  node.connect(ctx.destination);
  return node;
}
