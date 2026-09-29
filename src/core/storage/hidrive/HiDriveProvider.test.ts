// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { AlreadyExistsError, ConflictError, NotFoundError } from '../types';
import { HiDriveProvider } from './HiDriveProvider';

type Handler = (method: string, url: URL) => Response;

function setup(handler: Handler) {
  const calls: { method: string; url: URL; auth: string | null }[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    calls.push({ method, url, auth: new Headers(init?.headers).get('Authorization') });
    return handler(method, url);
  }) as unknown as typeof fetch;
  let token = 't1';
  const provider = new HiDriveProvider({
    apiBase: 'https://api.test/2.1',
    getAccessToken: async () => token,
    refreshAccessToken: async () => (token = 't2'),
    fetchImpl,
  });
  return { provider, calls };
}

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });

describe('HiDriveProvider (request shapes, to be verified in S1)', () => {
  it('lists a folder with member fields', async () => {
    const { provider, calls } = setup(() =>
      json({ members: [{ name: 'a.mp3', type: 'file', id: 'b1', size: 3, mtime: 1_790_000_000, chash: 'h' }, { name: 'Sub', type: 'dir' }] }),
    );
    const entries = await provider.list('/users/band/Songs');
    expect(calls[0]!.url.pathname).toBe('/2.1/dir');
    expect(calls[0]!.url.searchParams.get('path')).toBe('root/users/band/Songs');
    expect(calls[0]!.url.searchParams.get('fields')).toContain('members.mtime');
    expect(calls[0]!.auth).toBe('Bearer t1');
    expect(entries).toEqual([
      expect.objectContaining({ path: '/users/band/Songs/a.mp3', type: 'file', id: 'b1', version: '1790000000:h' }),
      expect.objectContaining({ path: '/users/band/Songs/Sub', type: 'folder' }),
    ]);
  });

  it('maps 404 to null in stat and retries once after 401 with a refreshed token', async () => {
    let first = true;
    const { provider, calls } = setup((_m, url) => {
      if (url.pathname.endsWith('/meta') && first) {
        first = false;
        return json({ msg: 'expired' }, 401);
      }
      return json({ msg: 'not found' }, 404);
    });
    await expect(provider.stat('/x')).resolves.toBeNull();
    expect(calls.map((c) => c.auth)).toEqual(['Bearer t1', 'Bearer t2']);
  });

  it('creates new files with POST dir/name and never overwrites (409 → AlreadyExists)', async () => {
    const { provider, calls } = setup((method, url) => {
      if (url.pathname.endsWith('/meta')) return url.searchParams.get('path') === 'root/up/Songs' ? json({ type: 'dir' }) : json({}, 404);
      if (method === 'POST' && url.pathname.endsWith('/file')) return json({}, 409);
      return json({});
    });
    await expect(provider.createFile('/up/Songs/a.mp3', 'x')).rejects.toBeInstanceOf(AlreadyExistsError);
    const post = calls.find((c) => c.method === 'POST')!;
    expect(post.url.searchParams.get('dir')).toBe('root/up/Songs');
    expect(post.url.searchParams.get('name')).toBe('a.mp3');
    expect(post.url.searchParams.has('on_exist')).toBe(false);
  });

  it('checks the version before updating a record (R-DATA-07)', async () => {
    const { provider, calls } = setup((_m, url) =>
      url.pathname.endsWith('/meta') ? json({ type: 'file', mtime: 2, chash: 'new' }) : json({}),
    );
    await expect(provider.writeText('/app/a.json', '{}', { expectedVersion: '1:old' })).rejects.toBeInstanceOf(ConflictError);
    expect(calls.some((c) => c.method === 'PUT')).toBe(false);
  });

  it('reads the home folder of the account', async () => {
    const { provider } = setup(() => json({ home: 'root/users/overload', alias: 'overload' }));
    await expect(provider.getUserInfo()).resolves.toEqual({ home: '/users/overload', alias: 'overload' });
  });

  it('throws NotFound for missing files', async () => {
    const { provider } = setup(() => json({}, 404));
    await expect(provider.readText('/nope.txt')).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('HiDrive path format', () => {
  it('sends paths relative to the storage root ("root/…") and reads them back', async () => {
    const { toApiPath, fromApiPath } = await import('./HiDriveProvider');
    expect(toApiPath('/users/overload/_BandApp')).toBe('root/users/overload/_BandApp');
    expect(toApiPath('/')).toBe('root');
    expect(fromApiPath('root/users/overload')).toBe('/users/overload');
    expect(fromApiPath('/root/users/overload')).toBe('/users/overload');
    expect(fromApiPath('root')).toBe('/');
    expect(fromApiPath('/users/overload')).toBe('/users/overload');
  });
});

describe('URL-encoded names from HiDrive', () => {
  it('decodes names and paths of listed objects', async () => {
    const { provider } = setup(() =>
      json({ members: [{ name: 'Neue%20Songs', path: 'root/users/band/Neue%20Songs', type: 'dir' }, { name: 'L%C3%BCgen%20(Live).mp3', type: 'file' }] }),
    );
    const entries = await provider.list('/users/band');
    expect(entries.map((e) => [e.name, e.path])).toEqual([
      ['Neue Songs', '/users/band/Neue Songs'],
      ['Lügen (Live).mp3', '/users/band/Lügen (Live).mp3'],
    ]);
  });
});

describe('updating existing files', () => {
  it('overwrites with PUT /file addressed by dir + name (regression v0.9.0)', async () => {
    const { provider, calls } = setup((_method, url) =>
      url.pathname.endsWith('/meta') ? json({ type: 'file', mtime: 1, chash: 'a' }) : json({}),
    );
    await provider.writeText('/users/band/_BandApp/setlists/s_1/setlist.json', '{}', { expectedVersion: '1:a' });
    const put = calls.find((c) => c.method === 'PUT')!;
    expect(put.url.pathname).toBe('/2.1/file');
    expect(put.url.searchParams.get('dir')).toBe('root/users/band/_BandApp/setlists/s_1');
    expect(put.url.searchParams.get('name')).toBe('setlist.json');
    expect(put.url.searchParams.has('path')).toBe(false);
  });
});
