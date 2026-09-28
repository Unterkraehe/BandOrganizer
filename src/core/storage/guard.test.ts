// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { GuardViolationError, SafeStorage } from './guard';
import { MemoryStorageProvider } from './memoryProvider';
import { InvalidPathError } from './paths';
import { AlreadyExistsError, ConflictError } from './types';

const APP = '/users/band/_BandApp';
const UPLOADS = '/users/band/Band-App Uploads';
const FOREIGN_FILE = '/users/band/Songs/Hell Is Empty.mp3';

describe('SafeStorage (R-DATA-04)', () => {
  let provider: MemoryStorageProvider;
  let storage: SafeStorage;

  beforeEach(() => {
    provider = new MemoryStorageProvider();
    provider.seed(FOREIGN_FILE, 'existing band audio');
    provider.seed('/users/band/Setlists/Alt.xlsx', 'existing sheet');
    storage = new SafeStorage(provider, { appRoot: APP, uploadRoot: UPLOADS });
  });

  describe('zones', () => {
    it('classifies paths', () => {
      expect(storage.zoneOf(`${APP}/members/m_1.json`)).toBe('app');
      expect(storage.zoneOf(APP)).toBe('app');
      expect(storage.zoneOf(`${UPLOADS}/Songs/x.mp3`)).toBe('upload');
      expect(storage.zoneOf(FOREIGN_FILE)).toBe('foreign');
      expect(storage.zoneOf('/users/band/_BandAppX/file.json')).toBe('foreign');
    });

    it('rejects dangerous zone configurations', () => {
      expect(() => new SafeStorage(provider, { appRoot: '/' })).toThrow();
      expect(() => new SafeStorage(provider, { appRoot: APP, uploadRoot: '/' })).toThrow();
      expect(() => new SafeStorage(provider, { appRoot: APP, uploadRoot: `${APP}/uploads` })).toThrow();
      expect(() => new SafeStorage(provider, { appRoot: `${UPLOADS}/app`, uploadRoot: UPLOADS })).toThrow();
    });
  });

  describe('reading', () => {
    it('allows reading foreign files', async () => {
      await expect(storage.readText(FOREIGN_FILE)).resolves.toBe('existing band audio');
      await expect(storage.list('/users/band/Songs')).resolves.toHaveLength(1);
    });
  });

  describe('foreign data is never modified', () => {
    it.each([
      ['writeText', () => storage.writeText(FOREIGN_FILE, 'x')],
      ['writeJson', () => storage.writeJson('/users/band/Songs/new.json', {})],
      ['createFile', () => storage.createFile('/users/band/Songs/new.mp3', 'x')],
      ['createFolder', () => storage.createFolder('/users/band/Neu')],
      ['move', () => storage.move(FOREIGN_FILE, `${APP}/stolen.mp3`)],
      ['move into foreign', () => storage.move(`${APP}/a.json`, '/users/band/a.json')],
      ['delete', () => storage.delete(FOREIGN_FILE)],
      ['delete folder', () => storage.delete('/users/band/Songs')],
      ['delete root', () => storage.delete('/')],
    ])('blocks %s', async (_name, action) => {
      await expect(action()).rejects.toBeInstanceOf(GuardViolationError);
      await expect(provider.readText(FOREIGN_FILE)).resolves.toBe('existing band audio');
      expect(provider.has('/users/band/Songs')).toBe(true);
    });

    it('blocks path tricks', async () => {
      await expect(storage.delete(`${APP}/../Songs/Hell Is Empty.mp3`)).rejects.toBeInstanceOf(InvalidPathError);
      await expect(storage.writeText('relative/path.json', 'x')).rejects.toBeInstanceOf(InvalidPathError);
      await expect(storage.delete('/users/band/_BandAppX/x')).rejects.toBeInstanceOf(GuardViolationError);
    });
  });

  describe('app data folder', () => {
    it('allows create, update, move and delete inside it', async () => {
      const path = `${APP}/members/m_1.json`;
      const created = await storage.writeJson(path, { name: 'Lisa' });
      await storage.writeJson(path, { name: 'Lisa M.' }, { expectedVersion: created.version });
      await expect(storage.readJson(path)).resolves.toEqual({ name: 'Lisa M.' });
      await storage.move(path, `${APP}/members/m_2.json`);
      await storage.delete(`${APP}/members/m_2.json`);
      expect(provider.has(`${APP}/members/m_2.json`)).toBe(false);
    });

    it('never moves or deletes the app folder itself', async () => {
      await storage.writeJson(`${APP}/app.json`, {});
      await expect(storage.delete(APP)).rejects.toBeInstanceOf(GuardViolationError);
      await expect(storage.move(APP, `${APP}-old`)).rejects.toBeInstanceOf(GuardViolationError);
    });

    it('reports conflicts instead of overwriting (R-DATA-07)', async () => {
      const path = `${APP}/calendar/e_1.json`;
      const v1 = await storage.writeJson(path, { title: 'A' });
      await storage.writeJson(path, { title: 'B' }, { expectedVersion: v1.version });
      await expect(storage.writeJson(path, { title: 'C' }, { expectedVersion: v1.version })).rejects.toBeInstanceOf(
        ConflictError,
      );
      await expect(storage.readJson(path)).resolves.toEqual({ title: 'B' });
    });
  });

  describe('upload root (create-only)', () => {
    it('allows creating new files and folders', async () => {
      await storage.createFolder(`${UPLOADS}/Songs/Neuer Song`);
      await storage.createFile(`${UPLOADS}/Songs/Neuer Song/demo.mp3`, 'audio');
      await expect(storage.readText(`${UPLOADS}/Songs/Neuer Song/demo.mp3`)).resolves.toBe('audio');
    });

    it('never overwrites an existing upload', async () => {
      const path = `${UPLOADS}/Songs/A/a.mp3`;
      await storage.createFile(path, 'first');
      await expect(storage.createFile(path, 'second')).rejects.toBeInstanceOf(AlreadyExistsError);
      await expect(storage.readText(path)).resolves.toBe('first');
    });

    it('blocks update, move and delete of uploads', async () => {
      const path = `${UPLOADS}/Songs/A/a.txt`;
      await storage.createFile(path, 'text');
      await expect(storage.writeText(path, 'changed')).rejects.toBeInstanceOf(GuardViolationError);
      await expect(storage.writeJson(`${UPLOADS}/x.json`, {})).rejects.toBeInstanceOf(GuardViolationError);
      await expect(storage.move(path, `${UPLOADS}/Songs/A/b.txt`)).rejects.toBeInstanceOf(GuardViolationError);
      await expect(storage.delete(path)).rejects.toBeInstanceOf(GuardViolationError);
      await expect(storage.delete(`${UPLOADS}/Songs`)).rejects.toBeInstanceOf(GuardViolationError);
      await expect(storage.createFile(UPLOADS, 'x')).rejects.toBeInstanceOf(GuardViolationError);
      await expect(storage.readText(path)).resolves.toBe('text');
    });
  });

  describe('without upload root', () => {
    it('treats everything outside the app folder as read-only', async () => {
      const appOnly = new SafeStorage(provider, { appRoot: APP });
      await expect(appOnly.createFile(`${UPLOADS}/x.mp3`, 'x')).rejects.toBeInstanceOf(GuardViolationError);
    });
  });
});

describe('folder creation stays inside the zones', () => {
  it('creates missing parents from the zone root down, never above it', async () => {
    const provider = new MemoryStorageProvider();
    provider.seed('/users/band/Songs/a.mp3', 'x'); // home exists
    const storage = new SafeStorage(provider, { appRoot: APP, uploadRoot: UPLOADS });
    await storage.writeJson(`${APP}/songs/s1/notes/public/n1.json`, {});
    expect(provider.has(`${APP}/songs/s1/notes/public`)).toBe(true);
    await storage.createFile(`${UPLOADS}/Songs/Neu/a.mp3`, 'x');
    expect(provider.has(`${UPLOADS}/Songs/Neu`)).toBe(true);
  });

  it('fails instead of creating folders above a zone when the home is missing', async () => {
    const provider = new MemoryStorageProvider();
    const storage = new SafeStorage(provider, { appRoot: '/users/nobody/_BandApp' });
    await expect(storage.writeJson('/users/nobody/_BandApp/app.json', {})).rejects.toThrow();
    expect(provider.has('/users/nobody')).toBe(false);
  });
});
