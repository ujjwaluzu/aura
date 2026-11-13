import { useState, type KeyboardEvent } from 'react';
import {
  Check,
  ExternalLink,
  LayoutTemplate,
  Music2,
  Palette,
  RefreshCw,
} from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { themes } from '../../features/themes/catalog';
import { getLayout, layouts } from '../../features/layouts/catalog';
import { usePreferences } from '../../hooks/usePreferences';
import { errorMessage, isDesktop } from '../../lib/native';
import { openMusic } from '../../features/integrations/music';
import { useMusic } from '../../hooks/useMusic';
import { PlaybackControls } from '../music/PlaybackControls';
import { WidgetPreview } from './WidgetPreview';

export function Settings() {
  const [tab, setTab] = useState<'theme' | 'layout' | 'music'>('theme');
  const [windowError, setWindowError] = useState<string | null>(null);
  const [musicWindowError, setMusicWindowError] = useState<string | null>(null);
  const { preferences, ready, saving, saved, error, update } = usePreferences();
  const music = useMusic();
  const layout = getLayout(preferences.layoutId);

  const navigateTabs = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const tabs = ['theme', 'layout', 'music'] as const;
    const currentIndex = tabs.indexOf(tab);
    const next =
      event.key === 'Home'
        ? tabs[0]
        : event.key === 'End'
          ? tabs[tabs.length - 1]
          : tabs[
              (currentIndex +
                (event.key === 'ArrowRight' ? 1 : -1) +
                tabs.length) %
                tabs.length
            ];
    const nextTab = next ?? 'theme';
    setTab(nextTab);
    document.getElementById(`tab-${nextTab}`)?.focus();
  };
  const launchMusic = async () => {
    setMusicWindowError(null);
    try {
      await openMusic();
    } catch (error) {
      setMusicWindowError(errorMessage(error));
    }
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
        <button
          type="button"
          id="tab-music"
          role="tab"
          aria-selected={tab === 'music'}
          aria-controls="panel-music"
          tabIndex={tab === 'music' ? 0 : -1}
          onClick={() => setTab('music')}
        >
          <Music2 size={16} />
          Music
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
        ) : tab === 'layout' ? (
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
        ) : (
          <section id="panel-music" role="tabpanel" aria-labelledby="tab-music">
            <div className="settings-section-heading">
              <h2>Music</h2>
              <p>
                Manage your account, playback session, and music focused layout.
              </p>
            </div>
            <div className="settings-music-grid">
              <section
                className="settings-music-card"
                aria-labelledby="music-account-heading"
              >
                <div className="settings-music-card-heading">
                  <div>
                    <h3 id="music-account-heading">YouTube Music account</h3>
                    <p>
                      {music.account.status === 'connected'
                        ? `Connected as ${music.account.name ?? 'YouTube account'}`
                        : music.account.status === 'unavailable'
                          ? 'Account connection is unavailable in this build.'
                          : music.account.status === 'expired'
                            ? 'Your session expired. Reconnect to continue.'
                            : 'Connect to browse your library and manage playlists.'}
                    </p>
                  </div>
                  <span
                    className={`settings-music-status is-${music.account.status}`}
                  >
                    {music.account.status === 'connected'
                      ? 'Connected'
                      : music.account.status === 'connecting'
                        ? 'Connecting'
                        : music.account.status === 'unavailable'
                          ? 'Unavailable'
                          : music.account.status === 'expired'
                            ? 'Expired'
                            : 'Not connected'}
                  </span>
                </div>
                {music.error && (
                  <p className="settings-music-error" role="alert">
                    {music.error}
                  </p>
                )}
                {music.account.message &&
                  music.account.status !== 'connected' && (
                    <p className="settings-music-note">
                      {music.account.message}
                    </p>
                  )}
                <div className="settings-music-actions">
                  {music.account.status === 'connected' ? (
                    <button
                      type="button"
                      disabled={music.busy}
                      onClick={() => void music.disconnect()}
                    >
                      Disconnect
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={
                        music.busy ||
                        music.loading ||
                        music.account.status === 'unavailable'
                      }
                      onClick={() => void music.connect()}
                    >
                      {music.account.status === 'connecting'
                        ? 'Waiting for Google…'
                        : music.account.status === 'expired'
                          ? 'Reconnect'
                          : 'Connect YouTube Music'}
                    </button>
                  )}
                  <button
                    type="button"
                    className="settings-music-secondary"
                    disabled={!isDesktop() || music.loading}
                    onClick={() => void music.refresh()}
                  >
                    <RefreshCw size={14} /> Refresh status
                  </button>
                  <button
                    type="button"
                    className="settings-music-secondary"
                    disabled={!isDesktop()}
                    onClick={() => void launchMusic()}
                  >
                    <ExternalLink size={14} /> Open music library
                  </button>
                </div>
                {musicWindowError && (
                  <p className="settings-music-error" role="alert">
                    {musicWindowError}
                  </p>
                )}
              </section>
              <section
                className="settings-music-card settings-music-playback"
                aria-labelledby="music-playback-heading"
              >
                <div className="settings-music-card-heading">
                  <div>
                    <h3 id="music-playback-heading">Windows playback</h3>
                    <p>
                      Controls the media session playing in YouTube Music or
                      another app.
                    </p>
                  </div>
                </div>
                <PlaybackControls playback={music.playback} compact />
              </section>
              <section
                className="settings-music-card"
                aria-labelledby="music-diagnostics-heading"
              >
                <div className="settings-music-card-heading">
                  <div>
                    <h3 id="music-diagnostics-heading">Session diagnostics</h3>
                    <p>
                      {music.playback.sessions.length
                        ? `${music.playback.sessions.length} Windows media ${music.playback.sessions.length === 1 ? 'session' : 'sessions'} detected`
                        : (music.playback.message ??
                          'No Windows media sessions detected yet.')}
                    </p>
                  </div>
                </div>
                {music.playback.sessions.length > 0 ? (
                  <ul className="settings-music-sessions">
                    {music.playback.sessions.map((session) => (
                      <li key={session.id}>
                        <span className="settings-music-session-main">
                          <strong>{session.title || 'Untitled media'}</strong>
                          <small>
                            {session.artist || 'Unknown artist'} ·{' '}
                            {session.source}
                          </small>
                        </span>
                        <span className="settings-music-session-state">
                          {session.playing ? 'Playing' : 'Paused'}
                          {session.id === music.playback.selectedId
                            ? ' · Selected'
                            : ''}
                        </span>
                        <small className="settings-music-capabilities">
                          {[
                            session.canPlay || session.canPause
                              ? 'play/pause'
                              : null,
                            session.canPrevious ? 'previous' : null,
                            session.canNext ? 'next' : null,
                            session.canSeek ? 'seek' : null,
                          ]
                            .filter(Boolean)
                            .join(' · ') || 'No transport controls reported'}
                        </small>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
              <section
                className="settings-music-card"
                aria-labelledby="music-focus-heading"
              >
                <div className="settings-music-card-heading">
                  <div>
                    <h3 id="music-focus-heading">Music focus layout</h3>
                    <p>
                      Give the player more room and hide CPU / RAM. Choose which
                      side the clock uses.
                    </p>
                  </div>
                </div>
                <div className="settings-music-actions">
                  {layouts
                    .filter((option) => 'focus' in option && option.focus)
                    .map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        className={
                          preferences.layoutId === option.id
                            ? 'is-selected'
                            : 'settings-music-secondary'
                        }
                        disabled={!ready || saving}
                        aria-pressed={preferences.layoutId === option.id}
                        onClick={() => void update({ layoutId: option.id })}
                      >
                        {option.side === 'left' ? 'Clock left' : 'Clock right'}
                      </button>
                    ))}
                </div>
              </section>
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
