import { Component, type ReactNode } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { isDesktop } from '../../lib/native';

/** Rendering failures get a recovery action; decorative failures may fall back silently. */
export class AppErrorBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode },
  { failed: boolean; closeFailed: boolean }
> {
  state = { failed: false, closeFailed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    if (this.props.fallback !== undefined) return this.props.fallback;
    return (
      <main className="app-recovery" role="alert" data-tauri-drag-region>
        <strong>Aura couldn’t display this window.</strong>
        <p>Reload to try again. Your saved preferences will be kept.</p>
        <div>
          <button type="button" onClick={() => window.location.reload()}>
            Reload Aura
          </button>
          {isDesktop() && (
            <button
              type="button"
              onClick={() => {
                void getCurrentWindow()
                  .close()
                  .catch(() => this.setState({ closeFailed: true }));
              }}
            >
              Close window
            </button>
          )}
        </div>
        {this.state.closeFailed && <p>Use the taskbar to close this window.</p>}
      </main>
    );
  }
}
