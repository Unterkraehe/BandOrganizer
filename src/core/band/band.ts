import { config } from '@/config';
import { newId } from '@/core/data/ids';
import { migrate } from '@/core/data/migrate';
import { nowIso, type RecordBase } from '@/core/data/record';
import { AlreadyExistsError, joinPath, type SafeStorage } from '@/core/storage';

/** `_BandApp/app.json` (overview §8, design system §8, F10 §6). */
export interface BandConfig extends RecordBase {
  bandName: string;
  branding: {
    color: string | null;
    /** paths of the logo files (app-created, in _BandApp/branding/) */
    logoDark: string | null;
    logoLight: string | null;
  };
  uploads: {
    root: string;
    createdFolders: string[];
  };
  scan: {
    excludedPaths: string[];
  };
}

export const BAND_SCHEMA_VERSION = 1;
/** Before a member exists, records created during setup are attributed to "setup". */
export const SETUP_ACTOR = 'setup';

export interface Versioned<T> {
  value: T;
  version: string | undefined;
}

export const appRootFor = (home: string) => joinPath(home, config.appFolderName);
const appJsonPath = (appRoot: string) => joinPath(appRoot, 'app.json');

const README = `Dieser Ordner gehört zur Band-App (Overload App).

Hier speichert die App ihre eigenen Daten: Profile, Notizen, Termine, Setlists, Chat.
Bitte nichts in diesem Ordner von Hand ändern, verschieben oder löschen –
sonst können Daten in der App verloren gehen.

Eure übrigen Dateien (Songs, Songtexte, Fotos, …) liest die App nur.
Sie ändert oder löscht nie etwas, das sie nicht selbst angelegt hat.
`;

export async function loadBand(storage: SafeStorage, appRoot: string): Promise<Versioned<BandConfig> | null> {
  const entry = await storage.stat(appJsonPath(appRoot));
  if (!entry) return null;
  const raw = await storage.readJson<unknown>(entry.path);
  return { value: migrate<BandConfig>(raw, BAND_SCHEMA_VERSION, []), version: entry.version };
}

export interface BandSetupInput {
  bandName: string;
  color: string | null;
  uploadFolderName: string;
}

/**
 * First-time band setup (F1 §3). Creates `_BandApp/`, the README and `app.json` with
 * create-only semantics: if another member set up the band at the same moment, this
 * member simply joins that band (F1 §7).
 */
export async function setupBand(
  storage: SafeStorage,
  home: string,
  input: BandSetupInput,
): Promise<{ band: Versioned<BandConfig>; joined: boolean }> {
  const appRoot = appRootFor(home);
  const existing = await loadBand(storage, appRoot);
  if (existing) return { band: existing, joined: true };

  await storage.createFolder(appRoot);
  await storage.createFile(joinPath(appRoot, 'README.txt'), README).catch((error: unknown) => {
    if (!(error instanceof AlreadyExistsError)) throw error;
  });

  const now = nowIso();
  const band: BandConfig = {
    id: newId('b'),
    schemaVersion: BAND_SCHEMA_VERSION,
    bandName: input.bandName.trim(),
    branding: { color: input.color, logoDark: null, logoLight: null },
    uploads: { root: joinPath(home, sanitizeFolderName(input.uploadFolderName) || config.defaultUploadFolderName), createdFolders: [] },
    scan: { excludedPaths: [] },
    createdAt: now,
    createdBy: SETUP_ACTOR,
    updatedAt: now,
    updatedBy: SETUP_ACTOR,
    deletedAt: null,
    deletedBy: null,
  };

  try {
    const entry = await storage.createFile(appJsonPath(appRoot), JSON.stringify(band, null, 2) + '\n');
    return { band: { value: band, version: entry.version }, joined: false };
  } catch (error) {
    if (!(error instanceof AlreadyExistsError)) throw error;
    const winner = await loadBand(storage, appRoot);
    if (!winner) throw error;
    return { band: winner, joined: true };
  }
}

export async function updateBand(
  storage: SafeStorage,
  appRoot: string,
  current: Versioned<BandConfig>,
  memberId: string,
  changes: Partial<Pick<BandConfig, 'bandName' | 'branding' | 'uploads' | 'scan'>>,
): Promise<Versioned<BandConfig>> {
  const next: BandConfig = { ...current.value, ...changes, updatedAt: nowIso(), updatedBy: memberId };
  const entry = await storage.writeJson(appJsonPath(appRoot), next, { expectedVersion: current.version });
  return { value: next, version: entry.version };
}

/** Removes characters HiDrive doesn't allow in names and trims. */
export function sanitizeFolderName(name: string): string {
  return name.replace(/[/\\\0]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
}
