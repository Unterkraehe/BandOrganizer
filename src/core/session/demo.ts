import { MemoryStorageProvider } from '@/core/storage';
import { createDemoSongs } from './demoAudio';

export const DEMO_HOME = '/users/demo';

/**
 * Demo mode: an in-memory HiDrive with generated songs and a few other "existing band files",
 * so the app can be tried without an account. Nothing is saved – reloading ends the demo.
 */
export function createDemoProvider(): MemoryStorageProvider {
  const provider = new MemoryStorageProvider();
  const short = import.meta.env.MODE === 'test';
  const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
  const ages = [120, 90, 60, 3, 30];
  Object.entries(createDemoSongs(short)).forEach(([path, blob], index) =>
    provider.seed(`${DEMO_HOME}/${path}`, blob, daysAgo(ages[index] ?? 100)),
  );
  provider.seed(`${DEMO_HOME}/Texte/Midnight Engine.txt`, 'Demo-Songtext');
  provider.seed(`${DEMO_HOME}/Fotos/Proberaum.jpg`, 'demo photo');
  provider.seed(`${DEMO_HOME}/.versteckt/nicht-scannen.mp3`, 'hidden');
  return provider;
}
