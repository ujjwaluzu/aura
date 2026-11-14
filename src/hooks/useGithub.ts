import { useCallback, useEffect, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { errorMessage, isDesktop } from '../lib/native';
import {
  githubPreview,
  githubStatus,
  githubRefresh,
  githubWorkRefresh,
} from '../features/integrations/github';
import type { GithubState } from '../types/github';

export function useGithub(active: boolean, workActive = false) {
  const [state, setState] = useState<GithubState>(githubPreview);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(false);
  const accept = useCallback((next: GithubState) => {
    if (!next || !Number.isFinite(next.revision)) {
      if (mounted.current)
        setError('GitHub status is unavailable. Refresh to retry.');
      return;
    }
    if (mounted.current)
      setState((previous) =>
        next.revision >= previous.revision ? next : previous,
      );
  }, []);
  useEffect(() => {
    mounted.current = true;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    if (isDesktop()) {
      void (async () => {
        try {
          const stop = await listen<GithubState>(
            'aura://github-state',
            ({ payload }) => {
              if (!disposed) accept(payload);
            },
          );
          if (disposed) {
            stop();
            return;
          }
          unlisten = stop;
          accept(await githubStatus());
        } catch {
          if (!disposed)
            setError('GitHub status is unavailable. Refresh to retry.');
        }
      })();
    }
    return () => {
      disposed = true;
      mounted.current = false;
      unlisten?.();
    };
  }, [accept]);
  const run = useCallback(
    async (operation: () => Promise<GithubState | void>) => {
      setError(null);
      try {
        const next = await operation();
        if (next) accept(next);
      } catch (e) {
        if (mounted.current) setError(errorMessage(e));
      }
    },
    [accept],
  );
  useEffect(() => {
    let disposed = false;
    if (active && isDesktop()) {
      void githubRefresh(true).then(
        (next) => {
          if (!disposed) accept(next);
        },
        () => {
          if (!disposed)
            setError('GitHub status is unavailable. Refresh to retry.');
        },
      );
    }
    return () => {
      disposed = true;
    };
  }, [active, accept]);
  useEffect(() => {
    let disposed = false;
    if (workActive && isDesktop())
      void githubWorkRefresh(true).then(
        (next) => {
          if (!disposed) accept(next);
        },
        () => {
          if (!disposed) setError('Work is unavailable. Refresh to retry.');
        },
      );
    return () => {
      disposed = true;
    };
  }, [workActive, accept]);
  return { state, error, run };
}
