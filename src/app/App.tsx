import { useState } from 'react';
import {
  Clock3,
  Layers2,
  Music2,
  Pin,
  RefreshCw,
  StickyNote,
  Waves,
  Activity,
  ArrowUpRight,
} from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { GlassSurface } from '../components/ui/GlassSurface';
import { WindowBar } from '../components/ui/WindowBar';
import { Text } from '../components/ui/Text';
import { ControlRow, Toggle } from '../components/ui/Controls';
import { Stack } from '../components/ui/Stack';
import { IconButton } from '../components/ui/IconButton';
import { SettingsPlaceholder } from '../components/settings/SettingsPlaceholder';
import { useNativeConnection } from '../hooks/useNativeConnection';
import { errorMessage, isDesktop, openSettings } from '../lib/native';

export function App() {
  return new URLSearchParams(window.location.search).get('window') ===
    'settings' ? (
    <SettingsPlaceholder />
  ) : (
    <WidgetHost />
  );
}

function WidgetHost() {
  const { connection, reconnect } = useNativeConnection();
  const [opacity, setOpacity] = useState(86);
  const [pinned, setPinned] = useState(false);
  const [pinBusy, setPinBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showSettings = async () => {
    setError(null);
    try {
      await openSettings();
    } catch (error) {
      setError(errorMessage(error));
    }
  };
  const togglePin = async () => {
    setPinBusy(true);
    setError(null);
    try {
      await getCurrentWindow().setAlwaysOnTop(!pinned);
      setPinned(!pinned);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setPinBusy(false);
    }
  };

  return (
    <main className="app-frame">
      <GlassSurface
        className="host-surface"
        opacity={opacity / 100}
        aria-label="Aura widget host"
      >
        <WindowBar onSettings={() => void showSettings()} onError={setError} />
        <div className="host-content">
          <div className="intro">
            <span className="eyebrow">
              <span className="little-line" /> Your desktop, considered
            </span>
            <h1>
              A little more calm.
              <br />
              <span>A little more you.</span>
            </h1>
            <Text>A home for the things you like to keep close.</Text>
          </div>
          <div className="widget-space">
            <div className="widget-space-heading">
              <Layers2 size={16} strokeWidth={1.5} />
              <span>Your widget space</span>
              <span className="phase-label">Foundation</span>
            </div>
            <div className="widget-empty">
              <div className="planned-icons" aria-hidden="true">
                <Clock3 />
                <Activity />
                <Music2 />
                <StickyNote />
              </div>
              <p>Something good starts with a little space.</p>
              <span>Clock, system monitor, music and notes are planned.</span>
            </div>
          </div>
          <Stack className="controls">
            <ControlRow
              icon={<Waves size={18} />}
              title="Glass opacity"
              description="Find your balance of light and shade."
            >
              <div className="opacity-control">
                <input
                  aria-label="Glass opacity"
                  type="range"
                  min="65"
                  max="96"
                  value={opacity}
                  onChange={(event) => setOpacity(Number(event.target.value))}
                />
                <output aria-live="off">{opacity}%</output>
              </div>
            </ControlRow>
            <ControlRow
              icon={<Pin size={18} />}
              title="Always on top"
              description={
                isDesktop()
                  ? 'Keep Aura above your other windows.'
                  : 'Available in the desktop application.'
              }
            >
              <Toggle
                label="Always on top"
                checked={pinned}
                onChange={() => void togglePin()}
                disabled={!isDesktop() || pinBusy}
              />
            </ControlRow>
          </Stack>
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
          {connection.status === 'error' && (
            <p className="error-message" role="alert">
              {connection.error}
            </p>
          )}
        </div>
        <footer className="status-bar">
          <span
            className={`connection-status status-${connection.status}`}
            role="status"
            aria-label="Native connection"
          >
            <span className="status-dot" />
            {connection.status === 'connected'
              ? 'Native core connected'
              : connection.status === 'preview'
                ? 'Frontend preview · native core unavailable'
                : connection.status === 'connecting'
                  ? 'Connecting to native core…'
                  : 'Native core unavailable'}
          </span>
          {connection.status === 'error' ? (
            <IconButton
              label="Retry native connection"
              onClick={() => void reconnect()}
            >
              <RefreshCw size={14} />
            </IconButton>
          ) : (
            <button
              type="button"
              className="text-button"
              onClick={() => void showSettings()}
            >
              Settings <ArrowUpRight size={13} />
            </button>
          )}
          <span className="version">
            v{connection.info?.version ?? '0.1.0'}
          </span>
        </footer>
      </GlassSurface>
    </main>
  );
}
