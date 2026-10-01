import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Microphone recording for voice notes (F4 §6.4a, v0.19.0) – MediaRecorder, no extra library.
 * The microphone is only requested when the user taps "record" (the browser asks once).
 */

export type RecorderState =
  | { kind: 'idle' }
  | { kind: 'starting' }
  | { kind: 'recording'; seconds: number }
  | { kind: 'done'; blob: Blob; mime: string; durationSec: number; url: string }
  | { kind: 'error'; reason: 'unsupported' | 'denied' | 'failed' };

/**
 * MP4/AAC first: it plays on iPhones and Android alike. WebM/Opus only where MP4 can't be recorded
 * (older Chrome/Firefox) – iPhones before iOS 17.4 can't play those (device checklist).
 */
const MIME_PREFERENCE = ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];

export function recordingSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);
}

export function pickRecordingMime(): string {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return '';
  return MIME_PREFERENCE.find((mime) => MediaRecorder.isTypeSupported(mime)) ?? '';
}

export function useRecorder(maxSeconds: number, onStart?: () => void) {
  const [state, setState] = useState<RecorderState>({ kind: 'idle' });
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const url = useRef<string | null>(null);

  const release = () => {
    window.clearInterval(timer.current);
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
  };
  const revoke = () => {
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = null;
  };
  useEffect(
    () => () => {
      if (recorder.current?.state === 'recording') recorder.current.stop();
      release();
      revoke();
    },
    [],
  );

  const stop = useCallback(() => {
    if (recorder.current?.state === 'recording') recorder.current.stop();
  }, []);

  const start = useCallback(async () => {
    if (!recordingSupported()) return setState({ kind: 'error', reason: 'unsupported' });
    revoke();
    setState({ kind: 'starting' });
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (error) {
      const name = (error as DOMException)?.name;
      return setState({ kind: 'error', reason: name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'failed' });
    }
    try {
      const mime = pickRecordingMime();
      const rec = new MediaRecorder(stream.current, mime ? { mimeType: mime, audioBitsPerSecond: 64_000 } : undefined);
      const chunks: Blob[] = [];
      const startedAt = Date.now();
      rec.ondataavailable = (event) => event.data.size > 0 && chunks.push(event.data);
      rec.onstop = () => {
        release();
        const type = rec.mimeType || mime || chunks[0]?.type || 'audio/webm';
        const blob = new Blob(chunks, { type });
        if (!blob.size) return setState({ kind: 'error', reason: 'failed' });
        url.current = URL.createObjectURL(blob);
        setState({ kind: 'done', blob, mime: type, durationSec: Math.min(maxSeconds, (Date.now() - startedAt) / 1000), url: url.current });
      };
      recorder.current = rec;
      onStart?.();
      rec.start(1000);
      setState({ kind: 'recording', seconds: 0 });
      timer.current = window.setInterval(() => {
        const seconds = Math.floor((Date.now() - startedAt) / 1000);
        if (seconds >= maxSeconds) rec.stop();
        else setState((current) => (current.kind === 'recording' ? { kind: 'recording', seconds } : current));
      }, 250);
    } catch {
      release();
      setState({ kind: 'error', reason: 'failed' });
    }
  }, [maxSeconds, onStart]);

  const discard = useCallback(() => {
    stop();
    release();
    revoke();
    setState({ kind: 'idle' });
  }, [stop]);

  /** after saving: forget the recording without revoking it (the note still plays it from memory) */
  const reset = useCallback(() => {
    url.current = null;
    setState({ kind: 'idle' });
  }, []);

  return { state, start, stop, discard, reset };
}
