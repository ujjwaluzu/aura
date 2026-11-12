import { useState, type KeyboardEvent } from 'react';
import { Check, LayoutTemplate, Palette } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { themes } from '../../features/themes/catalog';
import { getLayout, layouts } from '../../features/layouts/catalog';
import { usePreferences } from '../../hooks/usePreferences';
import { errorMessage, isDesktop } from '../../lib/native';
import { WidgetPreview } from './WidgetPreview';

export function Settings() {
  const [tab, setTab] = useState<'theme' | 'layout'>('theme');
  const [windowError, setWindowError] = useState<string | null>(null);
  const { preferences, ready, saving, saved, error, update } = usePreferences();
  const layout = getLayout(preferences.layoutId);

  const navigateTabs = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next =
      event.key === 'Home'
        ? 'theme'
        : event.key === 'End'
          ? 'layout'
          : tab === 'theme'
            ? 'layout'
            : 'theme';
    setTab(next);
    document.getElementById(`tab-${next}`)?.focus();
  };
  const done = async () => {
    try {
      await getCurrentWindow().close();
    } catch (error) {
      setWindowError(errorMessage(error));
    }
  };

  return (
    <main className="settings-app">
      <header className="settings-heading">
        <img src="/aura.svg" alt="" width="32" height="32" />
        <div>
          <h1>Settings</h1>
          <p>Make Aura feel like your desktop.</p>
        </div>
      </header>
      <div
        className="settings-tabs"
        role="tablist"
        aria-label="Settings sections"
        onKeyDown={navigateTabs}
      >
        <button
          type="button"
          id="tab-theme"
          role="tab"
          aria-selected={tab === 'theme'}
          aria-controls="panel-theme"
          tabIndex={tab === 'theme' ? 0 : -1}
          onClick={() => setTab('theme')}
        >
          <Palette size={16} />
          Theme
        </button>
        <button
          type="button"
          id="tab-layout"
          role="tab"
          aria-selected={tab === 'layout'}
          aria-controls="panel-layout"
          tabIndex={tab === 'layout' ? 0 : -1}
          onClick={() => setTab('layout')}
        >
          <LayoutTemplate size={16} />
          Layout
        </button>
      </div>
      <div className="settings-scroll">
        {tab === 'theme' ? (
          <section id="panel-theme" role="tabpanel" aria-labelledby="tab-theme">
            <div className="settings-section-heading">
              <h2>Choose your colour</h2>
              <p>Five palettes. Your layout stays the same.</p>
            </div>
            <div className="theme-grid" aria-busy={saving}>
              {themes.map((theme) => (
                <button
                  type="button"
                  className="preference-option theme-option"
                  key={theme.id}
                  aria-label={`${theme.name} theme`}
                  aria-pressed={preferences.themeId === theme.id}
                  disabled={!ready || saving}
                  onClick={() => void update({ themeId: theme.id })}
                >
                  <WidgetPreview theme={theme.id} layout={layout} />
                  <span className="option-copy">
                    <strong>{theme.name}</strong>
                    <small>{theme.description}</small>
                  </span>
                  {preferences.themeId === theme.id && (
                    <span className="option-check" aria-hidden="true">
                      <Check size={13} />
                    </span>
                  )}
                </button>
              ))}
            </div>
          </section>
        ) : (
          <section
            id="panel-layout"
            role="tabpanel"
            aria-labelledby="tab-layout"
          >
            <div className="settings-section-heading">
              <h2>Arrange your space</h2>
              <p>All 12 arrangements. CPU and RAM stay together.</p>
            </div>
            <div className="layout-grid" aria-busy={saving}>
              {layouts.map((option) => (
                <button
                  type="button"
                  className="preference-option layout-option"
                  key={option.id}
                  aria-label={`${option.title}, ${option.description}`}
                  aria-pressed={preferences.layoutId === option.id}
                  disabled={!ready || saving}
                  onClick={() => void update({ layoutId: option.id })}
                >
                  <WidgetPreview theme={preferences.themeId} layout={option} />
                  <span className="option-copy">
                    <strong>{option.title}</strong>
                    <small>{option.description}</small>
                  </span>
                  {preferences.layoutId === option.id && (
                    <span className="option-check" aria-hidden="true">
                      <Check size={13} />
                    </span>
                  )}
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
      <footer className="settings-footer">
        <p role={error || windowError ? 'alert' : 'status'}>
          {error ??
            windowError ??
            preferences.warning ??
            (saving
              ? 'Saving…'
              : saved
                ? isDesktop()
                  ? 'Saved on this device'
                  : 'Saved in this browser preview'
                : 'Selections apply instantly.')}
        </p>
        <button
          className="settings-done"
          type="button"
          onClick={() => void done()}
          disabled={!isDesktop()}
        >
          Done
        </button>
      </footer>
    </main>
  );
}
