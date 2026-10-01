/** Public entry of the storage layer: features import from here, never from provider files. */
export { SafeStorage, GuardViolationError, type GuardZones } from './guard';
export { MemoryStorageProvider } from './memoryProvider';
export * from './paths';
export * from './types';
