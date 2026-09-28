// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { appRootFor, loadBand, setupBand, updateBand } from '@/core/band/band';
import { detectLogoType, LogoFileError, storeLogo } from '@/core/band/logo';
import { ConflictError, MemoryStorageProvider, SafeStorage } from '@/core/storage';
import { initials } from './model';
import { createMember, listMembers, NameTakenError, setMemberActive, updateMember } from './repository';

const HOME = '/users/band';
const APP = appRootFor(HOME);

describe('band setup (F1 §3)', () => {
  let provider: MemoryStorageProvider;
  let storage: SafeStorage;
  beforeEach(() => {
    provider = new MemoryStorageProvider();
    provider.seed(`${HOME}/Songs/a.mp3`, 'audio');
    storage = new SafeStorage(provider, { appRoot: APP });
  });

  it('creates the app folder, README and app.json', async () => {
    const { band, joined } = await setupBand(storage, HOME, { bandName: ' Overload ', color: '#E30613', uploadFolderName: 'Band-App Uploads' });
    expect(joined).toBe(false);
    expect(band.value).toMatchObject({ bandName: 'Overload', branding: { color: '#E30613' }, uploads: { root: `${HOME}/Band-App Uploads` } });
    expect(provider.has(`${APP}/README.txt`)).toBe(true);
    expect((await loadBand(storage, APP))?.value.id).toBe(band.value.id);
  });

  it('joins an existing band instead of overwriting it', async () => {
    const first = await setupBand(storage, HOME, { bandName: 'A', color: null, uploadFolderName: 'Up' });
    const second = await setupBand(storage, HOME, { bandName: 'B', color: null, uploadFolderName: 'Up' });
    expect(second.joined).toBe(true);
    expect(second.band.value.id).toBe(first.band.value.id);
    expect(second.band.value.bandName).toBe('A');
  });

  it('updates the band with a conflict check', async () => {
    const { band } = await setupBand(storage, HOME, { bandName: 'A', color: null, uploadFolderName: 'Up' });
    const updated = await updateBand(storage, APP, band, 'm_1', { bandName: 'Overload' });
    expect(updated.value).toMatchObject({ bandName: 'Overload', updatedBy: 'm_1' });
    await expect(updateBand(storage, APP, band, 'm_2', { bandName: 'Old' })).rejects.toBeInstanceOf(ConflictError);
  });

  it('accepts only real PNG/SVG logos and never overwrites', async () => {
    const png = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])]);
    const svg = new Blob(['<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>']);
    await expect(detectLogoType(png)).resolves.toBe('png');
    await expect(detectLogoType(svg)).resolves.toBe('svg');
    await expect(detectLogoType(new Blob(['GIF89a']))).rejects.toBeInstanceOf(LogoFileError);
    await expect(detectLogoType(new Blob([new Uint8Array(3 * 1024 * 1024)]))).rejects.toMatchObject({ reason: 'size' });
    const path = await storeLogo(storage, APP, 'dark', svg);
    expect(path).toMatch(/^\/users\/band\/_BandApp\/branding\/logo-dark-\d+\.svg$/);
  });
});

describe('members (F2)', () => {
  let storage: SafeStorage;
  beforeEach(() => {
    storage = new SafeStorage(new MemoryStorageProvider(), { appRoot: APP });
  });

  it('creates members with free colors and lists them sorted', async () => {
    const lisa = await createMember(storage, APP, { displayName: 'Lisa', role: 'Gesang' }, []);
    const tom = await createMember(storage, APP, { displayName: 'tom', role: null }, [lisa.value]);
    expect(lisa.value.color).toBe('c01');
    expect(tom.value.color).toBe('c02');
    expect(lisa.value.createdBy).toBe(lisa.value.id);
    const listed = await listMembers(storage, APP);
    expect(listed.map((m) => m.value.displayName)).toEqual(['Lisa', 'tom']);
  });

  it('rejects duplicate names among active members (case-insensitive)', async () => {
    const lisa = await createMember(storage, APP, { displayName: 'Lisa', role: null }, []);
    await expect(createMember(storage, APP, { displayName: ' lisa ', role: null }, [lisa.value])).rejects.toBeInstanceOf(NameTakenError);
    await expect(createMember(storage, APP, { displayName: '', role: null }, [])).rejects.toThrow();
  });

  it('edits, deactivates and reactivates without deleting', async () => {
    const lisa = await createMember(storage, APP, { displayName: 'Lisa', role: null }, []);
    const edited = await updateMember(storage, APP, lisa, { displayName: 'Lisa M.', role: 'Gesang', color: 'c05' }, [lisa.value]);
    expect(edited.value).toMatchObject({ displayName: 'Lisa M.', role: 'Gesang', color: 'c05' });
    const former = await setMemberActive(storage, APP, edited, false, 'm_other', [edited.value]);
    expect(former.value).toMatchObject({ active: false, deactivatedBy: 'm_other' });
    // name is free again while inactive
    const newLisa = await createMember(storage, APP, { displayName: 'Lisa M.', role: null }, [former.value]);
    await expect(setMemberActive(storage, APP, former, true, 'm_x', [former.value, newLisa.value])).rejects.toBeInstanceOf(NameTakenError);
    expect((await listMembers(storage, APP)).length).toBe(2);
  });

  it('builds initials', () => {
    expect(initials('Lisa')).toBe('LI');
    expect(initials('Tom Meyer')).toBe('TM');
    expect(initials('  ')).toBe('?');
  });
});
