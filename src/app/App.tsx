import { useState } from 'react';
import { Pin, RefreshCw, Settings2, Minus, X } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { GlassSurface } from '../components/ui/GlassSurface';
import { IconButton } from '../components/ui/IconButton';
import { SettingsPlaceholder } from '../components/settings/SettingsPlaceholder';
import { useNativeConnection } from '../hooks/useNativeConnection';
import { errorMessage, isDesktop, openSettings } from '../lib/native';
import { WidgetRenderer } from '../features/widget-engine/WidgetRenderer';
import type { WidgetInstance } from '../features/widget-engine/types';
import { clockDefinition } from '../components/widgets/clock/definition';
import { systemMonitorDefinition } from '../components/widgets/system-monitor/definition';

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
      <GlassSurface className="host-surface" aria-label="Aura widget host">
        <WidgetRenderer instance={clock} />
        <div className="widget-divider" aria-hidden="true" />
        <WidgetRenderer instance={systemMonitor} />
        <nav className="host-tools" aria-label="Window controls">
          <IconButton
            label="Always on top"
            aria-pressed={pinned}
            disabled={!isDesktop() || pinBusy}
            onClick={() => void togglePin()}
          >
            <Pin size={13} />
          </IconButton>
          <IconButton label="Open settings" onClick={() => void showSettings()}>
            <Settings2 size={13} />
          </IconButton>
          <IconButton
            label="Minimize window"
            disabled={!isDesktop()}
            onClick={() => void windowAction('minimize')}
          >
            <Minus size={14} />
          </IconButton>
          <IconButton
            label="Quit Aura"
            className="close-button"
            disabled={!isDesktop()}
            onClick={() => void windowAction('close')}
          >
            <X size={14} />
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
            <p role="alert">{error ?? connection.error}</p>
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
