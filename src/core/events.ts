/**
 * App-wide system events (F6 §4.2): stores announce important changes, the chat turns them into
 * small info lines. Decoupled so features don't depend on the chat.
 */
export type ItemRef = { type: 'song' | 'event' | 'setlist'; id: string; occurrence?: string };

export interface SystemEvent {
  key: 'event.cancelled' | 'event.uncancelled' | 'event.changed' | 'song.bandVersion' | 'band.branding';
  params: Record<string, string>;
  context?: ItemRef;
}

type Listener = (event: SystemEvent) => void;
const listeners = new Set<Listener>();

export function emitSystemEvent(event: SystemEvent) {
  listeners.forEach((l) => {
    try {
      l(event);
    } catch (error) {
      console.error('System event listener failed', error);
    }
  });
}

export function onSystemEvent(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
