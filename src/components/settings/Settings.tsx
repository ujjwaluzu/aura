import { useEffect, useState, type KeyboardEvent } from 'react';
import { Check, LayoutTemplate, Music2, Palette } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';
import { themes } from '../../features/themes/catalog';
import { getLayout, layouts } from '../../features/layouts/catalog';
import { usePreferences } from '../../hooks/usePreferences';
import {
  errorMessage,
  isDesktop,
  type MusicSection,
  type SettingsDestination,
} from '../../lib/native';
import { WidgetPreview } from './WidgetPreview';
import { MusicWorkspace } from '../music/MusicWorkspace';

const tabs = ['theme', 'layout', 'music'] as const;
function initialDestination(): SettingsDestination {
  const params = new URLSearchParams(location.search);
  const value = params.get('destination');
  return [
    'theme',
    'layout',
    'music-player',
    'music-search',
    'music-playlists',
    'music-liked',
  ].includes(value ?? '')
    ? (value as SettingsDestination)
    : params.get('window') === 'music'
      ? 'music-playlists'
      : 'theme';
}
export function Settings() {
  const initial = initialDestination();
  const [tab, setTab] = useState<(typeof tabs)[number]>(
    initial.startsWith('music-') ? 'music' : (initial as 'theme' | 'layout'),
  );
  const [section, setSection] = useState<MusicSection>(
    initial.startsWith('music-')
      ? (initial.slice(6) as MusicSection)
      : 'player',
  );
  const [windowError, setWindowError] = useState<string | null>(null);
  const { preferences, ready, saving, saved, error, update } = usePreferences();
  const layout = getLayout(preferences.layoutId);
  useEffect(() => {
    if (!isDesktop()) return;
    let active = true;
    let stop: (() => void) | undefined;
    void listen<SettingsDestination>(
      'aura://settings-navigate',
      ({ payload }) => {
        if (!active) return;
        if (payload.startsWith('music-')) {
          setTab('music');
          setSection(payload.slice(6) as MusicSection);
        } else setTab(payload as 'theme' | 'layout');
      },
    )
      .then((unlisten) => {
        if (active) stop = unlisten;
        else unlisten();
      })
      .catch((e: unknown) => setWindowError(errorMessage(e)));
    return () => {
      active = false;
      stop?.();
    };
  }, []);
  const navigateTabs = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next =
      event.key === 'Home'
        ? 'theme'
        : event.key === 'End'
          ? 'music'
          : tabs[
              (tabs.indexOf(tab) + (event.key === 'ArrowRight' ? 1 : 2)) %
                tabs.length
            ]!;
    setTab(next);
    document.getElementById(`tab-${next}`)?.focus();
  };
  return (
    <main className="settings-app" data-theme={preferences.themeId}>
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
        {tabs.map((id) => (
          <button
            key={id}
            type="button"
            id={`tab-${id}`}
            role="tab"
            aria-selected={tab === id}
            aria-controls={`panel-${id}`}
            tabIndex={tab === id ? 0 : -1}
            onClick={() => setTab(id)}
          >
            {id === 'theme' ? (
              <Palette size={16} />
            ) : id === 'layout' ? (
              <LayoutTemplate size={16} />
            ) : (
              <Music2 size={16} />
            )}
            {id[0]!.toUpperCase() + id.slice(1)}
          </button>
        ))}
      </div>
      <section
        className="settings-scroll"
        hidden={tab !== 'theme'}
        id="panel-theme"
        role="tabpanel"
        aria-labelledby="tab-theme"
        tabIndex={0}
      >
        <div className="settings-section-heading">
          <h2>Choose your colour</h2>
          <p>{themes.length} palettes. Your layout stays the same.</p>
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
      <section
        className="settings-scroll"
        hidden={tab !== 'layout'}
        id="panel-layout"
        role="tabpanel"
        aria-labelledby="tab-layout"
        tabIndex={0}
      >
        <div className="settings-section-heading">
          <h2>Arrange your space</h2>
          <p>All {layouts.length} arrangements. Changes apply immediately.</p>
        </div>
        {(['clock', 'stats', 'music', 'focus'] as const).map((group) => {
          const options = layouts.filter((item) =>
            group === 'focus'
              ? getLayout(item.id).focus
              : !getLayout(item.id).focus && item.primary === group,
          );
          return (
            <section className="layout-group" key={group}>
              <h3>
                {
                  {
                    clock: 'Clock',
                    stats: 'System usage',
                    music: 'Music',
                    focus: 'Music focus',
                  }[group]
                }{' '}
                <small>{options.length}</small>
              </h3>
              <div className="layout-grid" aria-busy={saving}>
                {options.map((option) => (
                  <button
                    type="button"
                    className="preference-option layout-option"
                    key={option.id}
                    aria-label={`${option.title}, ${option.description}`}
                    aria-pressed={preferences.layoutId === option.id}
                    disabled={!ready || saving}
                    onClick={() => void update({ layoutId: option.id })}
                  >
                    <WidgetPreview
                      theme={preferences.themeId}
                      layout={option}
                    />
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
          );
        })}
      </section>
      <section
        className="settings-music-panel"
        hidden={tab !== 'music'}
        id="panel-music"
        role="tabpanel"
        aria-labelledby="tab-music"
      >
        <MusicWorkspace section={section} onSection={setSection} />
      </section>
      <footer className="settings-footer">
        <span role="status">
          {error
            ? 'Failed to save. Try selecting again.'
            : !ready
              ? 'Loading preferences…'
              : saving
                ? 'Saving…'
                : saved
                  ? 'Saved'
                  : 'Changes apply immediately'}
        </span>
        <button
          type="button"
          disabled={!isDesktop()}
          onClick={() =>
            void getCurrentWindow()
              .close()
              .catch((e: unknown) => setWindowError(errorMessage(e)))
          }
        >
          Done
        </button>
      </footer>
      {(error || windowError) && (
        <p className="settings-error" role="alert">
          {error ?? windowError}
        </p>
      )}
    </main>
  );
}
