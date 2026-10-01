# F9 – Audio Engine

| | |
|---|---|
| **ID** | F9 |
| **Status** | Implemented (v0.6.0): playback, tempo, pitch, A–B loop, practice settings. iPhone retest with active effects pending |

> **Implementation notes (v0.6.0)**
> - Two modes, switched seamlessly at the current position: **element** (`<audio>` + blob URL, default) and **effects** (Web Audio + Signalsmith Stretch), the latter only while tempo ≠ 100 % or pitch ≠ 0.
> - The A–B loop also works in element mode (position watch), so a loop alone doesn't need Web Audio.
> - Signalsmith Stretch 1.3.2 (MIT) is **vendored** as a static file (`public/vendor/signalsmith-stretch/`) and loaded with a dynamic import: the library builds its AudioWorklet from its own source text, which bundling/minifying breaks.
> - Devices with ≤ 4 CPU cores use the `cheaper` preset.
> - The AudioContext is created/resumed inside the user's tap (iOS).
> - Tested in desktop Chromium: tempo 80 % + −2 semitones plays correctly. iPhone test with effects (incl. lock screen) still open.

> **v0 decisions (M2):** playback uses a plain `<audio>` element with a typed blob URL (best background behaviour on iOS). A silent sound is played inside the first tap (`unlock()`) because iOS only allows playback started by a gesture and the download is asynchronous. Last 3 songs stay cached as blob URLs. Web Audio + signalsmith-stretch will only be switched on while tempo/pitch/loop are active (M4, §7 fallback plan).
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

1. ✅ *Tested 2026-09-28 on iPhone (v0.5): playback with `<audio>` + blob URL works, incl. lock screen / background.* Still to test in M4: the same with Web Audio while tempo/pitch are active.
   **iOS background playback:** Web Audio in an installed PWA may pause when the screen locks or the app goes to the background. Must be tested on a real iPhone early. Fallback idea: use plain `<audio>` (blob URL) when tempo = 100 % and pitch = 0, switch to Web Audio only when effects are active.
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

## 8a. Player (v0.16.0)

One full-screen player for listening and practising (`features/songs/player/PlayerPage.tsx`, route `/player`) – it grows out of the mini player (clip-path from the bottom edge, `--dur-sheet` 280 ms) and closes back down (⌄, back gesture; ← back logic of `useBack`). Replaces the practice view and the setlist banner in Songs.

- **Which song:** `?song=<id>` (from a song page) → the playing track → the first playable song of the playing setlist; nothing at all → "Gerade läuft nichts." + "Zu den Songs".
- **Tabs** (`?view=`): **Songtext** (lyrics with A−/A+, notes as a panel on phones / beside the lyrics on tablets), **Üben** (`PracticeControls`: tempo, pitch, A–B loop, reset – only while this song plays), **Setlist** (only while a setlist plays: `SetlistQueue`).
- **Header:** ⌄ close · title + one subtitle line (version, or "Setlist · 3 / 12", plus active practice settings – always reserved, R-UI-11) · ⋯ (Zum Song, Zur Setlist).
- **Bottom:** version choice (only with several versions), seek bar with note markers and loop, transport ⏮ ↺ ⏯ ↻ ⏭ (⏮ ⏭ only in a setlist, otherwise hidden in place). Toasts float above it (`--dock-h` set to the dock height while open).
- The screen below does not slide (`overlays` in `NavigationContext`); the mini player is hidden while the player is open. Screen stays on (Wake Lock).

## 9. Out of Scope / Later

- Recording, multitrack/stem mixing
- Waveform display

> **State slices (v0.11)** – `usePlayer()` returns the full state including the position (~4 updates per second): only the mini player, the song page's player controls and the player (`/player`, ex practice view) use it. Everything else uses `usePlaySong()` or `usePlayerSelect(selector)` (shallow-compared slice), so lists and providers don't re-render while music plays. `PlayerState.ended` counts finished tracks (setlist mode advances on it).
