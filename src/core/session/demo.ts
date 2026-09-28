import { MemoryStorageProvider } from '@/core/storage';

export const DEMO_HOME = '/users/demo';

/**
 * Demo mode: an in-memory HiDrive with a few "existing band files", so the app can be tried
 * without an account. Nothing is saved – reloading ends the demo.
 */
export function createDemoProvider(): MemoryStorageProvider {
  const provider = new MemoryStorageProvider();
  provider.seed(`${DEMO_HOME}/Songs/Hell Is Empty.mp3`, 'demo audio');
  provider.seed(`${DEMO_HOME}/Songs/Burning Sky (Demo).mp3`, 'demo audio');
  provider.seed(`${DEMO_HOME}/Texte/Hell Is Empty.pdf`, 'demo lyrics');
  provider.seed(`${DEMO_HOME}/Fotos/Proberaum.jpg`, 'demo photo');
  return provider;
}
