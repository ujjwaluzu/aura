import { useEffect, useRef, useState } from 'react';
import {
  getPreferences,
  subscribePreferences,
  updatePreferences,
} from '../lib/preferences';
import { errorMessage } from '../lib/native';
import {
  defaultPreferences,
  type Preferences,
  type PreferencesPatch,
} from '../types/preferences';

export function usePreferences() {
  const [preferences, setPreferences] = useState(defaultPreferences);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const request = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    let active = true;
    let unlisten: (() => void) | undefined;
    const accept = (next: Preferences) => {
      if (active)
        setPreferences((previous) =>
          next.revision >= previous.revision ? next : previous,
        );
    };
    const start = async () => {
      try {
        // Register before reading, so an update cannot be lost during startup.
        const stop = await subscribePreferences(accept);
        if (!active) {
          stop();
          return;
        }
        unlisten = stop;
        accept(await getPreferences());
      } catch (error) {
        if (active) setError(errorMessage(error));
      } finally {
        if (active) setReady(true);
      }
    };
    void start();
    return () => {
      active = false;
      mounted.current = false;
      unlisten?.();
    };
  }, []);

  const update = async (patch: PreferencesPatch) => {
    const id = ++request.current;
    setSaving(true);
    setError(null);
    try {
      const next = await updatePreferences(patch);
      if (mounted.current) {
        setPreferences((previous) =>
          next.revision >= previous.revision ? next : previous,
        );
        if (id === request.current) setSaved(true);
      }
    } catch (error) {
      if (mounted.current && id === request.current)
        setError(errorMessage(error));
    } finally {
      if (mounted.current && id === request.current) setSaving(false);
    }
  };

  return { preferences, ready, saving, saved, error, update };
}
