import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import {
  accountStatus,
  connectMusic,
  disconnectMusic,
  emptyPlayback,
  playbackStatus,
  unavailableAccount,
} from '../features/integrations/music';
import { errorMessage, isDesktop } from '../lib/native';
import type { MusicAccountState, PlaybackState } from '../types/music';
import { clearMusicArtwork } from '../features/integrations/music-artwork';

const diagnosticKey = 'aura.music.recent-errors';
type RecentDiagnostic = { code: string; recordedAt: number };
function readDiagnostics(
  value: string | null = localStorage.getItem(diagnosticKey),
): RecentDiagnostic[] {
  try {
    const parsed: unknown = JSON.parse(value ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item: unknown): item is RecentDiagnostic => {
        if (typeof item !== 'object' || item === null) return false;
        const entry = item as Partial<RecentDiagnostic>;
        return (
          typeof entry.code === 'string' &&
          /^[A-Z_]{1,64}$/.test(entry.code) &&
          typeof entry.recordedAt === 'number' &&
          Number.isFinite(entry.recordedAt) &&
          entry.recordedAt <= Date.now() &&
          Date.now() - entry.recordedAt < 3_600_000
        );
      })
      .slice(-10);
  } catch {
    return [];
  }
}

export function useMusicState() {
  const [account, setAccount] = useState<MusicAccountState>(() =>
    isDesktop()
      ? { ...unavailableAccount, status: 'disconnected', message: null }
      : unavailableAccount,
  );
  const [playback, setPlayback] = useState<PlaybackState>(emptyPlayback);
  const [loading, setLoading] = useState(isDesktop);
  const [accountKnown, setAccountKnown] = useState(!isDesktop());
  const [playbackLoading, setPlaybackLoading] = useState(isDesktop);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [details, setDetails] = useState<{ code: string; message: string }[]>(
    [],
  );
  const [recentDiagnostics, setRecentDiagnostics] = useState<
    RecentDiagnostic[]
  >(() => {
    try {
      return readDiagnostics();
    } catch {
      return [];
    }
  });
  useEffect(() => {
    const receive = (event: StorageEvent) => {
      if (event.key === diagnosticKey)
        setRecentDiagnostics(readDiagnostics(event.newValue));
    };
    window.addEventListener('storage', receive);
    return () => window.removeEventListener('storage', receive);
  }, []);
  const reportError = useCallback((error: unknown) => {
    const rawCode =
      typeof error === 'object' && error !== null && 'code' in error
        ? String(error.code)
        : 'UNKNOWN';
    const code = /^[A-Z_]{1,64}$/.test(rawCode) ? rawCode : 'UNKNOWN';
    // Share only allowlisted codes and times. Settings can explain widget failures
    // even when it opens later; messages, identifiers and credentials stay out of storage.
    try {
      const recent = [
        ...readDiagnostics(),
        { code, recordedAt: Date.now() },
      ].slice(-10);
      localStorage.setItem(diagnosticKey, JSON.stringify(recent));
      setRecentDiagnostics(recent);
    } catch {
      /* Diagnostics must never block recovery. */
    }

    setDetails((current) => [
      ...current.slice(-9),
      { code, message: errorMessage(error) },
    ]);
  }, []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const version = useRef(0);
  const playbackVersion = useRef(0);
  const mounted = useRef(false);
  const accountRevision = useRef(0);
  const acceptAccount = useCallback((next: MusicAccountState) => {
    if ((next.revision ?? 0) < accountRevision.current) return;
    accountRevision.current = next.revision ?? 0;
    if (next.status !== 'connected') clearMusicArtwork();
    setAccount(next);
    setAccountKnown(true);
  }, []);
  const refresh = useCallback(
    async (background = false) => {
      if (!isDesktop()) return;
      const request = ++version.current;
      if (!background) setLoading(true);
      setError(null);
      try {
        const result = await accountStatus();
        if (mounted.current && request === version.current && result)
          acceptAccount(result);
      } catch (e) {
        reportError(e);
        if (mounted.current && request === version.current)
          setError(errorMessage(e));
      } finally {
        if (mounted.current && request === version.current) setLoading(false);
      }
    },
    [acceptAccount, reportError],
  );
  useEffect(() => {
    if (account.status !== 'connected') return;
    // Native code rechecks the grant at most every thirty minutes. Polling
    // status also lets every open window discard data after remote revocation.
    const timer = window.setInterval(() => void refresh(true), 60_000);
    return () => window.clearInterval(timer);
  }, [account.status, refresh]);
  const refreshPlayback = useCallback(async () => {
    if (!isDesktop()) return;
    const request = ++playbackVersion.current;
    setPlaybackLoading(true);
    setPlaybackError(null);
    try {
      const state = await playbackStatus();
      if (mounted.current && request === playbackVersion.current && state)
        setPlayback(state);
    } catch (e) {
      reportError(e);
      if (mounted.current && request === playbackVersion.current)
        setPlaybackError(errorMessage(e));
    } finally {
      if (mounted.current && request === playbackVersion.current)
        setPlaybackLoading(false);
    }
  }, [reportError]);
  useEffect(() => {
    mounted.current = true;
    let active = true;
    const subscriptions: UnlistenFn[] = [];
    const keep = (stop: UnlistenFn) => {
      if (active) subscriptions.push(stop);
      else stop();
    };
    if (isDesktop()) {
      // Each subscription and request starts independently. Subscribe before its snapshot.
      void (async () => {
        try {
          keep(
            await listen<MusicAccountState>(
              'aura://music-account-changed',
              ({ payload }) => {
                if (
                  !active ||
                  (payload.revision ?? 0) < accountRevision.current
                )
                  return;
                ++version.current;
                acceptAccount(payload);
                setLoading(false);
                setBusy(false);
                setError(null);
              },
            ),
          );
        } catch (e) {
          if (active) reportError(e);
        }
        if (active) await refresh();
      })();
      void (async () => {
        try {
          keep(
            await listen<PlaybackState>(
              'aura://playback-changed',
              ({ payload }) => {
                if (!active) return;
                ++playbackVersion.current;
                setPlayback(payload);
                setPlaybackLoading(false);
                setPlaybackError(null);
              },
            ),
          );
        } catch (e) {
          if (active) reportError(e);
        }
        if (active) await refreshPlayback();
      })();
    }
    return () => {
      active = false;
      mounted.current = false;
      subscriptions.forEach((stop) => stop());
    };
  }, [refresh, refreshPlayback, acceptAccount, reportError]);
  const connect = async () => {
    setBusy(true);
    setError(null);
    setAccount((current) => ({ ...current, status: 'connecting' }));
    const request = ++version.current;
    try {
      const result = await connectMusic();
      if (mounted.current && version.current === request) acceptAccount(result);
    } catch (e) {
      reportError(e);
      if (mounted.current && version.current === request) {
        setError(errorMessage(e));
        setAccount((current) => ({ ...current, status: 'disconnected' }));
      }
    } finally {
      if (mounted.current && version.current === request) setBusy(false);
    }
  };
  const disconnect = async () => {
    clearMusicArtwork();
    const request = ++version.current;
    setError(null);
    setBusy(true);
    try {
      const result = await disconnectMusic();
      if (mounted.current && version.current === request) acceptAccount(result);
    } catch (e) {
      reportError(e);
      if (mounted.current) setError(errorMessage(e));
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  return {
    account,
    playback,
    loading,
    busy,
    accountKnown,
    playbackLoading,
    playbackError,
    details,
    recentDiagnostics,
    reportError,
    error,
    refresh,
    refreshPlayback,
    connect,
    disconnect,
  };
}
export type MusicState = ReturnType<typeof useMusicState>;
export const MusicContext = createContext<MusicState | null>(null);
export function useMusic() {
  const state = useContext(MusicContext);
  if (!state) throw new Error('Music must be used within MusicProvider');
  return state;
}
