# F9 – Audio Engine

| | |
|---|---|
| **ID** | F9 |
| **Status** | Planned – spikes pending (§7) |
| **Type** | Core module (`src/core/audio/`), no own menu entry |
| **Depends on** | F1 (file access) |
| **Used by** | F4 Songs (player, mini player, fullscreen song view), F7 Setlists (later: practice playlist) |

## 1. Goal

One central, robust audio engine for the whole app. Besides normal playback it supports band-practice features in the fullscreen song view: **pitch shifting** and **tempo change**, independent of each other, in real time.

## 2. User Stories

- As a member, I play a song and it keeps playing while I browse the app (R-UX-08).
- As a member, I slow a song down to 80 % to learn a part, without the pitch dropping.
- As a member, I shift a song down 2 semitones to match our live tuning or the singer's range, without the tempo changing.
- As a member, I loop a section (A–B) to practice it, combined with tempo and pitch.
- As a member, I control playback from the lock screen / headphones.

## 3. Capabilities

| Capability | v1 | Notes |
|---|---|---|
| Play / pause / seek / position / duration | ✅ | |
| Global single instance (mini player + fullscreen) | ✅ | Only one song plays at a time |
| Tempo change, pitch preserved | ✅ | Recommended range 50–150 %; best quality 75–150 % |
| Pitch shift, tempo preserved | ✅ | Semitone steps (e.g. −12 … +12), maybe cent fine-tuning |
| Pitch + tempo combined | ✅ | Independent controls |
| A–B loop | ✅ | Decided for v1 (F4 §6.9); supported by the chosen library |
| Lock screen / media keys (Media Session API) | ✅ | Title, play/pause, seek |
| Waveform display | later | |
| Offline playback | later (L1) | Engine reads from cache if present |

### Queue (for setlist mode)

- The engine accepts an ordered queue of songs (from setlist mode, F3 §5) with `next()`, `previous()` and optional auto-advance.
- Songs with missing files are skipped.
- Preloading: while a song plays, the next song is downloaded in the background so the transition is fast (memory: only current + next decoded).

## 4. Technical Approach (proposal)

**Library:** [`signalsmith-stretch`](https://www.npmjs.com/package/signalsmith-stretch) — MIT license (OK for a public repo), official Web Audio release (WASM + AudioWorklet). It supports playback rate, semitone pitch shift and loop points on loaded audio buffers, and can stream buffers in chunks. Its authors note time-stretching sounds best between 0.75× and 1.5×.

Alternatives considered:

| Option | Why not (for now) |
|---|---|
| Plain `<audio>` with `playbackRate` + `preservesPitch` | Tempo change works natively, but **no independent pitch shift**. Could remain a fallback. |
| SoundTouchJS | Workable, older algorithm, generally lower quality |
| Rubber Band (WASM) | Excellent quality, but GPL/commercial licensing |
| Superpowered SDK | Commercial license |

**Pipeline:**

```
HiDrive ──fetch (with auth header)──► audio file bytes
      ──► decode (Web Audio decodeAudioData) ──► AudioBuffer
      ──► signalsmith-stretch AudioWorklet (rate, semitones, loop)
      ──► gain (volume) ──► speakers
```

- **Loading:** the file is downloaded with `fetch` + auth header (solves the "audio element can't send auth headers" problem from F1). Bytes are kept in a small in-memory/Cache-Storage cache, which later becomes the basis for offline mode (L1).
- **Memory:** a decoded 5-minute stereo song is roughly 100 MB of PCM data. Only the current (and maybe the next) song stays decoded.
- **Start delay:** the file must be downloaded before playback starts. At ~100 songs of typical MP3 size this is a few seconds on mobile; show a clear loading state (R-UX-03). Chunked streaming into the worklet is a possible later optimization.
- **API for features (draft):**

```ts
interface AudioEngine {
  load(songId: string): Promise<void>;
  play(): void; pause(): void; seek(seconds: number): void;
  setTempo(rate: number): void;          // 1.0 = original
  setPitch(semitones: number): void;     // 0 = original
  setLoop(start: number | null, end?: number): void;
  state: Observable<{ songId; status; position; duration; tempo; pitch; loop }>;
}
```

## 5. Behaviour & Rules

- Exactly one engine instance for the whole app (lives in the app shell, not in a screen).
- Tempo/pitch settings: reset per song by default; option to remember per song and member (stored like a private setting, see §6). *(open)*
- Changing tempo/pitch must not cause clicks/jumps in playback.
- Audio files are only read, never written (R-DATA-02).

## 6. Data Model & Storage

- Device-local: decoded/raw audio cache, last volume.
- Optional: `_BandApp/songs/<songId>/practice/<memberId>.json` with remembered tempo/pitch/loop (only if we decide to remember settings).

## 7. Risks & Spikes

1. **iOS background playback:** Web Audio in an installed PWA may pause when the screen locks or the app goes to the background. Must be tested on a real iPhone early. Fallback idea: use plain `<audio>` (blob URL) when tempo = 100 % and pitch = 0, switch to Web Audio only when effects are active.
2. **CPU on older phones:** the pitch/time algorithm runs in real time; check with `presetCheaper` if needed.
3. **Large files** (WAV/FLAC): download time and memory; maybe warn or limit.

## 8. Decisions

| Topic | Decision |
|---|---|
| Tempo | 50–150 %, steps of 5 % (slider 1 %), independent of pitch |
| Pitch | −12 to +12 whole semitones, independent of tempo |
| Remember settings | Per member, song and version, incl. A–B loop (F4 §7.3) |
| A–B loop | v1 |
| Count-in / metronome, autoscroll | not in v1 |
| Default version | Engine always loads the song's Band-Version unless the member picks another (F4 §6.8) |

## 9. Out of Scope / Later

- Recording, multitrack/stem mixing
- Waveform display
