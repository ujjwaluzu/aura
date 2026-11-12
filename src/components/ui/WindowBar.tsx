import { Minus, Settings2, X } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { errorMessage, isDesktop } from '../../lib/native';
import { IconButton } from './IconButton';

export function WindowBar({
  settings,
  onSettings,
  onError,
}: {
  settings?: boolean;
  onSettings?: () => void;
  onError: (message: string) => void;
}) {
  const run = async (action: 'minimize' | 'close') => {
    try {
      await getCurrentWindow()[action]();
    } catch (error) {
      onError(errorMessage(error));
    }
  };
  return (
    <header className="window-bar">
      <div className="window-drag" data-tauri-drag-region>
        <img src="/aura.svg" alt="" width="28" height="28" draggable="false" />
        <span data-tauri-drag-region>Aura</span>
        {settings && (
          <span className="window-subtitle" data-tauri-drag-region>
            / Settings
          </span>
        )}
      </div>
      <nav className="flex items-center gap-1" aria-label="Window controls">
        {!settings && (
          <IconButton label="Open settings" onClick={onSettings}>
            <Settings2 size={16} />
          </IconButton>
        )}
        <IconButton
          label="Minimize window"
          disabled={!isDesktop()}
          onClick={() => void run('minimize')}
        >
          <Minus size={17} />
        </IconButton>
        <IconButton
          label={settings ? 'Close settings' : 'Quit Aura'}
          className="close-button"
          disabled={!isDesktop()}
          onClick={() => void run('close')}
        >
          <X size={17} />
        </IconButton>
      </nav>
    </header>
  );
}
