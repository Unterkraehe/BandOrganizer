import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { config, isHiDriveConfigured } from '@/config';
import { completeLoginIfPending, startLogin, type CallbackResult } from '@/core/auth/login';
import { clearTokens, getAccessToken, loadTokens, refreshTokens, AuthError } from '@/core/auth/tokens';
import { appRootFor, loadBand, setupBand, updateBand, type BandConfig, type BandSetupInput, type Versioned } from '@/core/band/band';
import { adoptLogo, readLogo, storeLogo, type LogoVariant } from '@/core/band/logo';
import { applyBandTheme } from '@/core/color/bandTheme';
import { HiDriveProvider } from '@/core/storage/hidrive/HiDriveProvider';
import { ConflictError, SafeStorage, type StorageProvider } from '@/core/storage';
import type { Member } from '@/features/members/model';
import {
  createMember,
  listMembers,
  setMemberActive,
  updateMember,
  type MemberInput,
} from '@/features/members/repository';
import { emitSystemEvent } from '@/core/events';
import { onAppResume } from '@/core/resume';
import { createDemoProvider, DEMO_HOME, withDemoLatency } from './demo';

/**
 * Connection, band and member session for the whole app (F1, F2).
 * Screens before the app shell: Welcome → (Band setup) → "Wer bist du?" → app.
 */

export type Mode = 'hidrive' | 'demo';

export type SessionStatus =
  | { kind: 'loading' }
  | { kind: 'signedOut'; loginError?: 'denied' | 'state' | 'exchange' | 'expired' }
  | { kind: 'error'; message: 'network' | 'unknown' }
  | { kind: 'needsSetup' }
  | { kind: 'selectMember' }
  | { kind: 'ready' };

interface Connection {
  mode: Mode;
  provider: StorageProvider;
  home: string;
  appRoot: string;
  alias: string | null;
}

interface SessionContextValue {
  status: SessionStatus;
  mode: Mode | null;
  alias: string | null;
  storage: SafeStorage | null;
  appRoot: string | null;
  home: string | null;
  band: BandConfig | null;
  members: Member[];
  currentMember: Member | null;
  logoUrls: { dark: string | null; light: string | null };
  hiDriveConfigured: boolean;
  connect: () => void;
  startDemo: () => Promise<void>;
  disconnect: () => void;
  retry: () => void;
  completeSetup: (input: BandSetupInput) => Promise<{ joined: boolean }>;
  selectMember: (memberId: string) => void;
  switchProfile: () => void;
  createProfile: (input: MemberInput) => Promise<Member>;
  updateProfile: (input: MemberInput) => Promise<void>;
  setMemberActiveState: (memberId: string, active: boolean) => Promise<void>;
  updateBandSettings: (changes: Partial<Pick<BandConfig, 'bandName' | 'branding' | 'uploads' | 'scan'>>) => Promise<void>;
  uploadLogo: (variant: LogoVariant, file: File) => Promise<void>;
  /** Uses an image from the HiDrive (copied into `_BandApp/branding/`, the original stays untouched). */
  pickLogo: (variant: LogoVariant, path: string) => Promise<void>;
  removeLogo: (variant: LogoVariant) => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

const memberKey = (bandId: string) => `bandapp.member.${bandId}`;

function readMemberSession(bandId: string): string | null {
  try {
    return localStorage.getItem(memberKey(bandId));
  } catch {
    return null;
  }
}

function writeMemberSession(bandId: string, memberId: string | null) {
  try {
    if (memberId) localStorage.setItem(memberKey(bandId), memberId);
    else localStorage.removeItem(memberKey(bandId));
  } catch {
    // ignore
  }
}

function hiDriveProvider(): HiDriveProvider {
  return new HiDriveProvider({
    apiBase: config.hidrive.apiBase,
    getAccessToken: () => getAccessToken(),
    refreshAccessToken: async () => {
      const tokens = loadTokens();
      if (!tokens) throw new AuthError('expired', 'Not connected');
      return (await refreshTokens(tokens)).accessToken;
    },
  });
}

export function SessionProvider({ children, autoStart = true }: { children: ReactNode; autoStart?: boolean }) {
  const [status, setStatus] = useState<SessionStatus>({ kind: autoStart ? 'loading' : 'signedOut' });
  const [connection, setConnection] = useState<Connection | null>(null);
  const [band, setBand] = useState<Versioned<BandConfig> | null>(null);
  const [members, setMembers] = useState<Versioned<Member>[]>([]);
  const [currentMemberId, setCurrentMemberId] = useState<string | null>(null);
  const [logoUrls, setLogoUrls] = useState<{ dark: string | null; light: string | null }>({ dark: null, light: null });
  const [attempt, setAttempt] = useState(0);
  const loginResult = useRef<CallbackResult | null>(null);

  const storage = useMemo(() => {
    if (!connection) return null;
    return new SafeStorage(connection.provider, { appRoot: connection.appRoot, home: connection.home });
  }, [connection]);

  // Back after a while: band settings and members may have changed on another device
  useEffect(() => {
    if (!connection) return;
    return onAppResume(() => {
      const appOnly = new SafeStorage(connection.provider, { appRoot: connection.appRoot });
      void Promise.all([loadBand(appOnly, connection.appRoot), listMembers(appOnly, connection.appRoot)])
        .then(([b, m]) => {
          if (b) setBand(b);
          setMembers(m);
        })
        .catch((error) => console.warn('Refreshing band data failed', error));
    });
  }, [connection]);

  /** Loads band + members for a connection and decides the next screen. */
  const enter = useCallback(async (conn: Connection) => {
    const appOnly = new SafeStorage(conn.provider, { appRoot: conn.appRoot });
    const loadedBand = await loadBand(appOnly, conn.appRoot);
    setConnection(conn);
    setBand(loadedBand);
    if (!loadedBand) {
      setMembers([]);
      setStatus({ kind: 'needsSetup' });
      return;
    }
    const loadedMembers = await listMembers(appOnly, conn.appRoot);
    setMembers(loadedMembers);
    const remembered = readMemberSession(loadedBand.value.id);
    const valid = loadedMembers.find((m) => m.value.id === remembered && m.value.active);
    setCurrentMemberId(valid ? valid.value.id : null);
    setStatus({ kind: valid ? 'ready' : 'selectMember' });
  }, []);

  // Start: finish a pending login, then connect with stored tokens.
  useEffect(() => {
    if (!autoStart) return;
    let cancelled = false;
    (async () => {
      loginResult.current ??= await completeLoginIfPending();
      const result = loginResult.current;
      if (result.status === 'error') {
        if (!cancelled) setStatus({ kind: 'signedOut', loginError: result.reason });
        return;
      }
      if (!loadTokens()) {
        if (!cancelled) setStatus({ kind: 'signedOut' });
        return;
      }
      try {
        const provider = hiDriveProvider();
        const { home, alias } = await provider.getUserInfo();
        if (cancelled) return;
        await enter({ mode: 'hidrive', provider, home, appRoot: appRootFor(home), alias });
      } catch (error) {
        if (cancelled) return;
        if (error instanceof AuthError && error.reason === 'expired') {
          clearTokens();
          setStatus({ kind: 'signedOut', loginError: 'expired' });
        } else {
          console.error('Connecting to HiDrive failed', error);
          setStatus({ kind: 'error', message: navigator.onLine ? 'unknown' : 'network' });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [autoStart, enter, attempt]);

  // Band color for the whole app (design system §3.2)
  useEffect(() => {
    applyBandTheme(band?.value.branding.color ?? null);
  }, [band?.value.branding.color]);

  // Logo files → object URLs
  const logoDark = band?.value.branding.logoDark ?? null;
  const logoLight = band?.value.branding.logoLight ?? null;
  useEffect(() => {
    if (!storage) return;
    let cancelled = false;
    const urls: string[] = [];
    const load = async (path: string | null) => {
      if (!path) return null;
      try {
        const url = URL.createObjectURL(await readLogo(storage, path));
        urls.push(url);
        return url;
      } catch (error) {
        console.warn('Loading the band logo failed', path, error);
        return null;
      }
    };
    void Promise.all([load(logoDark), load(logoLight)]).then(([dark, light]) => {
      if (!cancelled) setLogoUrls({ dark, light });
    });
    return () => {
      cancelled = true;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [storage, logoDark, logoLight]);

  const requireReady = () => {
    if (!storage || !connection || !band) throw new Error('Session not ready');
    return { storage, appRoot: connection.appRoot, band };
  };

  /**
   * Links a logo file (or none) in app.json. Only this one field changes, so if app.json changed
   * meanwhile (another device, or an outdated version here) it is reloaded and the change applied once more.
   */
  const setLogoPath = async (variant: LogoVariant, path: string | null) => {
    const { storage: s, appRoot, band: b } = requireReady();
    const key = variant === 'dark' ? 'logoDark' : 'logoLight';
    const apply = (current: Versioned<BandConfig>) =>
      updateBand(s, appRoot, current, currentMemberId ?? 'setup', { branding: { ...current.value.branding, [key]: path } });
    try {
      setBand(await apply(b));
    } catch (error) {
      const fresh = error instanceof ConflictError ? await loadBand(s, appRoot) : null;
      if (!fresh) throw error;
      setBand(await apply(fresh));
    }
    if (path) emitSystemEvent({ key: 'band.branding', params: { actor: currentMemberId ?? '' } });
  };

  const value: SessionContextValue = {
    status,
    mode: connection?.mode ?? null,
    alias: connection?.alias ?? null,
    storage,
    appRoot: connection?.appRoot ?? null,
    home: connection?.home ?? null,
    band: band?.value ?? null,
    members: members.map((m) => m.value),
    currentMember: members.find((m) => m.value.id === currentMemberId)?.value ?? null,
    logoUrls,
    hiDriveConfigured: isHiDriveConfigured(),

    connect: () => startLogin(),

    startDemo: async () => {
      setStatus({ kind: 'loading' });
      await enter({ mode: 'demo', provider: withDemoLatency(createDemoProvider()), home: DEMO_HOME, appRoot: appRootFor(DEMO_HOME), alias: null });
    },

    disconnect: () => {
      if (band) writeMemberSession(band.value.id, null);
      clearTokens();
      applyBandTheme(null);
      setConnection(null);
      setBand(null);
      setMembers([]);
      setCurrentMemberId(null);
      setStatus({ kind: 'signedOut' });
    },

    retry: () => {
      setStatus({ kind: 'loading' });
      setAttempt((n) => n + 1);
    },

    completeSetup: async (input) => {
      if (!connection) throw new Error('Not connected');
      const appOnly = new SafeStorage(connection.provider, { appRoot: connection.appRoot });
      const result = await setupBand(appOnly, connection.home, input);
      await enter(connection);
      return { joined: result.joined };
    },

    selectMember: (memberId) => {
      if (!band) return;
      writeMemberSession(band.value.id, memberId);
      setCurrentMemberId(memberId);
      setStatus({ kind: 'ready' });
    },

    switchProfile: () => {
      if (!band) return;
      // Also the place to clear private caches (F2 §5.5) once they exist.
      writeMemberSession(band.value.id, null);
      setCurrentMemberId(null);
      setStatus({ kind: 'selectMember' });
    },

    createProfile: async (input) => {
      const { storage: s, appRoot } = requireReady();
      const created = await createMember(s, appRoot, input, members.map((m) => m.value));
      setMembers(await listMembers(s, appRoot));
      return created.value;
    },

    updateProfile: async (input) => {
      const { storage: s, appRoot } = requireReady();
      const current = members.find((m) => m.value.id === currentMemberId);
      if (!current) throw new Error('No profile selected');
      await updateMember(s, appRoot, current, input, members.map((m) => m.value));
      setMembers(await listMembers(s, appRoot));
    },

    setMemberActiveState: async (memberId, active) => {
      const { storage: s, appRoot, band: b } = requireReady();
      const target = members.find((m) => m.value.id === memberId);
      if (!target || !currentMemberId) return;
      await setMemberActive(s, appRoot, target, active, currentMemberId, members.map((m) => m.value));
      setMembers(await listMembers(s, appRoot));
      if (!active && memberId === currentMemberId) {
        writeMemberSession(b.value.id, null);
        setCurrentMemberId(null);
        setStatus({ kind: 'selectMember' });
      }
    },

    updateBandSettings: async (changes) => {
      const { storage: s, appRoot, band: b } = requireReady();
      setBand(await updateBand(s, appRoot, b, currentMemberId ?? 'setup', changes));
      if (changes.branding && changes.branding.color !== b.value.branding.color) {
        emitSystemEvent({ key: 'band.branding', params: { actor: currentMemberId ?? '' } });
      }
    },

    uploadLogo: async (variant, file) => {
      const { storage: s, appRoot } = requireReady();
      await setLogoPath(variant, await storeLogo(s, appRoot, variant, file));
    },

    pickLogo: async (variant, path) => {
      const { storage: s, appRoot } = requireReady();
      await setLogoPath(variant, await adoptLogo(s, appRoot, variant, path));
    },

    // Only the link is removed; the file stays (R-DATA-05).
    removeLogo: (variant) => setLogoPath(variant, null),
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used inside SessionProvider');
  return context;
}
