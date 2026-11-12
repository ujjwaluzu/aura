import { useEffect, useState } from 'react';
import { getSystemSnapshot } from '../features/integrations/system-monitor';
import { errorMessage, isDesktop } from '../lib/native';
import type { SystemSnapshot } from '../types/system-monitor';

interface MonitorState {
  status: 'preview' | 'loading' | 'ready' | 'paused' | 'error';
  snapshot: SystemSnapshot | null;
  error: string | null;
}

export function useSystemMonitor() {
  const [state, setState] = useState<MonitorState>({
    status: isDesktop() ? 'loading' : 'preview',
    snapshot: null,
    error: null,
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!isDesktop()) return;
    let active = true;
    let generation = 0;
    let inFlight = false;
    let timer: number | undefined;

    const sample = async () => {
      if (!active || document.visibilityState !== 'visible' || inFlight) return;
      const request = generation;
      inFlight = true;
      let continuePolling = false;
      try {
        const snapshot = await getSystemSnapshot();
        if (active && request === generation) {
          setState({ status: 'ready', snapshot, error: null });
          continuePolling = true;
        }
      } catch (error) {
        if (active && request === generation) {
          const paused =
            typeof error === 'object' &&
            error !== null &&
            'code' in error &&
            error.code === 'MONITOR_PAUSED';
          setState({
            status: paused ? 'paused' : 'error',
            snapshot: null,
            error: paused ? null : errorMessage(error),
          });
        }
      } finally {
        inFlight = false;
        if (active && document.visibilityState === 'visible') {
          if (request !== generation) void sample();
          else if (continuePolling)
            timer = window.setTimeout(() => void sample(), 1_000);
        }
      }
    };

    const resume = () => {
      generation += 1;
      window.clearTimeout(timer);
      void sample();
    };
    void sample();
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('focus', resume);
    return () => {
      active = false;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('focus', resume);
    };
  }, [attempt]);

  const retry = () => {
    setState({ status: 'loading', snapshot: null, error: null });
    setAttempt((value) => value + 1);
  };

  return { ...state, retry };
}
