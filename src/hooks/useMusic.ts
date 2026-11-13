import { useCallback, useEffect, useRef, useState } from 'react';
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

export function useMusic() {
  const [account, setAccount] = useState<MusicAccountState>(unavailableAccount);
  const [playback, setPlayback] = useState<PlaybackState>(emptyPlayback);
  const [loading, setLoading] = useState(isDesktop);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const version = useRef(0);
  const mounted = useRef(false);
  const accountRevision = useRef(0);
  const acceptAccount = useCallback((next: MusicAccountState) => {
    if ((next.revision ?? 0) < accountRevision.current) return;
    accountRevision.current = next.revision ?? 0;
    setAccount(next);
  }, []);
  const refresh = useCallback(async () => {
    if (!isDesktop()) return;
    const request = ++version.current;
    setLoading(true);
    setError(null);
    try {
      const result = await accountStatus();
      if (mounted.current && request === version.current && result)
        acceptAccount(result);
    } catch (error) {
      if (mounted.current && request === version.current)
        setError(errorMessage(error));
    } finally {
      if (mounted.current && request === version.current) setLoading(false);
    }
  }, [acceptAccount]);
  useEffect(() => {
    mounted.current = true;
    let active = true;
    const subscriptions: UnlistenFn[] = [];
    if (isDesktop()) {
      void (async () => {
        try {
          const unlisten = await listen<MusicAccountState>(
            'aura://music-account-changed',
            ({ payload }) => {
              if (!active || (payload.revision ?? 0) < accountRevision.current)
                return;
              if (payload.status !== 'connected') clearMusicArtwork();
              ++version.current;
              acceptAccount(payload);
              setLoading(false);
              setError(null);
            },
          );
          if (!active) {
            unlisten();
            return;
          }
          subscriptions.push(unlisten);
          const stopPlayback = await listen<PlaybackState>(
            'aura://playback-changed',
            ({ payload }) => {
              if (active) setPlayback(payload);
            },
          );
          if (!active) {
            stopPlayback();
            return;
          }
          subscriptions.push(stopPlayback);
          // Subscribe before starting the native event service. Its initial snapshot
          // is emitted asynchronously and no interval polls native sessions.
          const state = await playbackStatus();
          if (active && state) setPlayback(state);
          if (active) await refresh();
        } catch (error) {
          if (active) {
            setError(errorMessage(error));
            setLoading(false);
          }
        }
      })();
    }
    return () => {
      active = false;
      mounted.current = false;
      subscriptions.forEach((stop) => stop());
    };
  }, [refresh, acceptAccount]);
  const connect = async () => {
    setBusy(true);
    setError(null);
    setAccount((current) => ({ ...current, status: 'connecting' }));
    const request = ++version.current;
    try {
      const result = await connectMusic();
      if (mounted.current && version.current === request) acceptAccount(result);
    } catch (error) {
      if (mounted.current && version.current === request) {
        setError(errorMessage(error));
        setAccount((current) => ({ ...current, status: 'disconnected' }));
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  const disconnect = async () => {
    clearMusicArtwork();
    ++version.current;
    setError(null);
    try {
      const result = await disconnectMusic();
      if (mounted.current) {
        acceptAccount(result);
        setBusy(false);
      }
    } catch (error) {
      if (mounted.current) setError(errorMessage(error));
    }
  };
  return {
    account,
    playback,
    loading,
    busy,
    error,
    refresh,
    connect,
    disconnect,
  };
}
