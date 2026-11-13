import { useState } from 'react';
import { Pin, RefreshCw, Settings2, Minus, X } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { GlassSurface } from '../components/ui/GlassSurface';
import { IconButton } from '../components/ui/IconButton';
import { Settings } from '../components/settings/Settings';
import { useNativeConnection } from '../hooks/useNativeConnection';
import { errorMessage, isDesktop, openSettings } from '../lib/native';
import { WidgetRenderer } from '../features/widget-engine/WidgetRenderer';
import type { WidgetInstance } from '../features/widget-engine/types';
import { clockDefinition } from '../components/widgets/clock/definition';
import { systemMonitorDefinition } from '../components/widgets/system-monitor/definition';
import { musicDefinition } from '../components/widgets/music-player/definition';
import { AmbientWave } from '../components/ui/AmbientWave';
import { usePreferences } from '../hooks/usePreferences';
import { WidgetArrangement } from '../features/layouts/WidgetArrangement';
import { getLayout } from '../features/layouts/catalog';

const clock: WidgetInstance = {
  id: 'host-clock',
  kind: clockDefinition.kind,
  dimensions: clockDefinition.defaultDimensions,
  position: clockDefinition.defaultPosition,
  configuration: clockDefinition.defaultConfiguration,
  visible: true,
  themeId: clockDefinition.defaultThemeId,
};

const systemMonitor: WidgetInstance = {
  id: 'host-system-monitor',
  kind: systemMonitorDefinition.kind,
  dimensions: systemMonitorDefinition.defaultDimensions,
  position: systemMonitorDefinition.defaultPosition,
  configuration: systemMonitorDefinition.defaultConfiguration,
  visible: true,
  themeId: systemMonitorDefinition.defaultThemeId,
};

const music: WidgetInstance = {
  id: 'host-music',
  kind: musicDefinition.kind,
  dimensions: musicDefinition.defaultDimensions,
  position: musicDefinition.defaultPosition,
  configuration: musicDefinition.defaultConfiguration,
  visible: true,
  themeId: musicDefinition.defaultThemeId,
};

export function App() {
  return ['settings', 'music'].includes(
    new URLSearchParams(window.location.search).get('window') ?? '',
  ) ? (
    <Settings />
  ) : (
    <WidgetHost />
  );
}

function WidgetHost() {
  const { preferences } = usePreferences();
  const layout = getLayout(preferences.layoutId);
  const widgets = { clock, stats: systemMonitor, music };
  const { connection, reconnect } = useNativeConnection();
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

  const windowAction = async (action: 'minimize' | 'close') => {
    try {
      await getCurrentWindow()[action]();
    } catch (error) {
      setError(errorMessage(error));
    }
  };

  return (
    <main className="app-frame widget-frame">
      <GlassSurface
        className="host-surface"
        opacity={0.79}
        aria-label="Aura widget host"
        data-theme={preferences.themeId}
        data-layout={preferences.layoutId}
        data-primary={layout.primary}
        data-side={layout.side}
        data-focus={layout.focus ? 'music' : undefined}
      >
        <AmbientWave />
        <div
          className="host-drag-strip"
          data-tauri-drag-region
          aria-hidden="true"
        />
        <WidgetArrangement
          layout={layout}
          render={(module) => (
            <WidgetRenderer
              instance={{ ...widgets[module], themeId: preferences.themeId }}
            />
          )}
        />
        <nav className="host-tools" aria-label="Window controls">
          <IconButton
            label="Always on top"
            aria-pressed={pinned}
            disabled={!isDesktop() || pinBusy}
            onClick={() => void togglePin()}
          >
            <Pin size={17} />
          </IconButton>
          <IconButton label="Open settings" onClick={() => void showSettings()}>
            <Settings2 size={17} />
          </IconButton>
          <IconButton
            label="Minimize window"
            disabled={!isDesktop()}
            onClick={() => void windowAction('minimize')}
          >
            <Minus size={18} />
          </IconButton>
          <IconButton
            label="Quit Aura"
            className="close-button"
            disabled={!isDesktop()}
            onClick={() => void windowAction('close')}
          >
            <X size={18} />
          </IconButton>
        </nav>
        <div className="sr-only">
          <span role="status" aria-label="Native connection">
            {connection.status === 'connected'
              ? 'Native core connected'
              : connection.status === 'preview'
                ? 'Frontend preview · native core unavailable'
                : connection.status === 'connecting'
                  ? 'Connecting to native core…'
                  : 'Native core unavailable'}
          </span>
        </div>
        {(error || connection.status === 'error') && (
          <div className="host-notice">
            <p role="alert" title={error ?? connection.error ?? undefined}>
              {error ?? connection.error}
            </p>
            {connection.status === 'error' && (
              <IconButton
                label="Retry native connection"
                onClick={() => void reconnect()}
              >
                <RefreshCw size={14} />
              </IconButton>
            )}
          </div>
        )}
      </GlassSurface>
    </main>
  );
}
