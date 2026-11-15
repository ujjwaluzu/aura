import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { errorMessage, isDesktop } from '../../lib/native';

type StartupStatus = {
  available: boolean;
  enabled: boolean;
  warning: string | null;
};

export function GeneralSettings() {
  const [status, setStatus] = useState<StartupStatus | null>(null);
  const [pending, setPending] = useState(isDesktop());
  const [error, setError] = useState<string | null>(null);
  const active = useRef(false);
  const busy = useRef(false);

  const readStatus = async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const result = await invoke<StartupStatus>('get_startup_status');
      if (active.current) setStatus(result);
    } catch (e) {
      if (active.current) {
        setStatus(null);
        setError(errorMessage(e));
      }
    } finally {
      busy.current = false;
      if (active.current) setPending(false);
    }
  };

  useEffect(() => {
    active.current = true;
    if (isDesktop() && !busy.current) {
      busy.current = true;
      void invoke<StartupStatus>('get_startup_status').then(
        (result) => {
          if (active.current) {
            setStatus(result);
            setPending(false);
          }
          busy.current = false;
        },
        (e: unknown) => {
          if (active.current) {
            setError(errorMessage(e));
            setPending(false);
          }
          busy.current = false;
        },
      );
    }
    return () => {
      active.current = false;
    };
  }, []);

  const changeStartup = async () => {
    if (!status?.available || busy.current) return;
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await invoke<StartupStatus>('set_startup_enabled', {
        enabled: !status.enabled,
      });
      if (active.current) setStatus(result);
    } catch (e) {
      // A write can succeed before readback fails. Re-read without claiming
      // success, and mark status unknown if Windows cannot be queried either.
      let actual: StartupStatus | null = null;
      try {
        actual = await invoke<StartupStatus>('get_startup_status');
      } catch {
        /* Keep the change error. */
      }
      if (active.current) {
        setStatus(actual);
        setError(errorMessage(e));
      }
    } finally {
      busy.current = false;
      if (active.current) setPending(false);
    }
  };

  return (
    <>
      <div className="settings-section-heading">
        <h2>General</h2>
        <p>Choose how Aura starts on your desktop.</p>
      </div>
      <div className="startup-card" aria-busy={pending}>
        <div className="control-row">
          <div className="control-copy">
            <span className="control-title" id="startup-label">
              Start Aura with Windows
            </span>
            <p id="startup-description">
              Open your widget when you sign in, with your saved theme and
              layout.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={status?.enabled ?? false}
            aria-labelledby="startup-label"
            aria-describedby="startup-description startup-status startup-note"
            disabled={pending || !status?.available}
            onClick={() => void changeStartup()}
            className="toggle"
          >
            <span />
          </button>
        </div>
        <p id="startup-status" role="status">
          {!isDesktop()
            ? 'Startup is unavailable in frontend preview. Open the installed Aura app to change it.'
            : pending
              ? 'Checking Windows startup…'
              : !status
                ? 'Startup status unavailable.'
                : !status.available
                  ? status.warning
                  : status.enabled
                    ? 'Registered to start with Windows.'
                    : 'Not registered to start with Windows.'}
        </p>
        <p id="startup-note">
          Windows Settings → Apps → Startup can override this registration. If
          Aura does not open at sign-in, check that it is enabled there. Closing
          Aura exits it until you open it again or next sign in.
        </p>
        {(error || (status?.available && status.warning)) && (
          <p className="startup-error" role="alert">
            {error ?? status?.warning}
          </p>
        )}
        {isDesktop() && (error || (status?.warning && status.available)) && (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setPending(true);
              setError(null);
              void readStatus();
            }}
          >
            Refresh startup status
          </button>
        )}
      </div>
    </>
  );
}
