import { useState, type ReactNode } from 'react';
import { useMusic } from '../../hooks/useMusic';
import { isDesktop, type MusicSection } from '../../lib/native';
import { openPlayer } from '../../features/integrations/music';
import { PlaybackControls } from './PlaybackControls';
import { MusicLibrary } from './MusicLibrary';

const sections = [
  ['player', 'Player'],
  ['search', 'Search'],
  ['playlists', 'Playlists'],
  ['liked', 'Liked videos'],
] as const;
function PersistentSection({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}) {
  const [visited, setVisited] = useState(active);
  if (active && !visited) setVisited(true);
  return (
    <div className="music-section-scroll" hidden={!active}>
      {visited && children}
    </div>
  );
}
export function MusicWorkspace({
  section,
  onSection,
}: {
  section: MusicSection;
  onSection: (section: MusicSection) => void;
}) {
  const music = useMusic();
  const [copied, setCopied] = useState('');
  const connected = music.account.status === 'connected';
  const report = {
    app: 'Aura 0.1.0',
    validationBuild: music.account.validationBuild,
    accountStatus: music.loading
      ? 'loading'
      : music.accountKnown
        ? music.account.status
        : 'unknown',
    playbackLoading: music.playbackLoading,
    sessions: music.playback.sessions.map(
      ({
        source,
        playing,
        canPlay,
        canPause,
        canPrevious,
        canNext,
        canSeek,
      }) => ({
        source,
        playing,
        canPlay,
        canPause,
        canPrevious,
        canNext,
        canSeek,
      }),
    ),
    // Native messages may contain account identifiers. Only allow diagnostic codes in copied output.
    errors: Array.from(
      new Set([
        ...music.details.map(({ code }) => code),
        ...music.recentDiagnostics.map(({ code }) => code),
      ]),
    ).map((code) => ({ code })),
  };
  const copyDiagnostics = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
      setCopied('Copied diagnostics without credentials.');
    } catch {
      setCopied('Could not copy. Select the diagnostic text above.');
    }
  };
  return (
    <div className="music-workspace">
      <nav className="music-section-nav" aria-label="Music sections">
        {sections.map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-current={section === id ? 'page' : undefined}
            onClick={() => onSection(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      <PersistentSection active={section === 'player'}>
        <section className="settings-music-card">
          <div className="settings-music-card-heading">
            <div>
              <h2>Now playing</h2>
              <p>
                Choose a Windows player. Playback works independently of your
                Aura account.
              </p>
            </div>
            <button
              type="button"
              disabled={!isDesktop()}
              onClick={() =>
                void openPlayer({ kind: 'home' }).catch(music.reportError)
              }
            >
              Open official player
            </button>
          </div>
          {music.playbackLoading && <p role="status">Finding players…</p>}
          {music.playbackError && (
            <p role="alert">
              Could not load playback.{' '}
              <button
                type="button"
                onClick={() => void music.refreshPlayback()}
              >
                Retry playback
              </button>
            </p>
          )}
          <PlaybackControls playback={music.playback} presentation="settings" />
        </section>
        <section className="settings-music-card music-account-card">
          <h2>YouTube library account</h2>
          {music.loading ? (
            <p role="status">Checking account connection…</p>
          ) : !music.accountKnown ? (
            <p role="alert">
              Could not check your account. Connection availability is unknown.
            </p>
          ) : (
            <p>
              {connected
                ? `Connected as ${music.account.name ?? 'YouTube account'}`
                : music.account.status === 'connecting'
                  ? 'Finish authorization in your browser. Aura will wait for up to three minutes.'
                  : music.account.status === 'expired'
                    ? 'Your authorization expired. Reconnect to browse your library.'
                    : music.account.status === 'unavailable'
                      ? 'Account connection is unavailable in this build.'
                      : 'Connect to search YouTube videos and manage your playlists and likes.'}
            </p>
          )}
          {music.error && (
            <p className="music-inline-error" role="alert">
              Account request failed. Refresh status or try connecting again.{' '}
              {music.error?.toLowerCase().includes('timed out') &&
                'Authorization timed out. Try connecting again.'}
            </p>
          )}
          {music.accountKnown && music.account.message && !connected && (
            <p className="music-muted">{music.account.message}</p>
          )}
          <div className="settings-music-actions">
            {connected ? (
              <button
                type="button"
                disabled={music.busy}
                onClick={() => void music.disconnect()}
              >
                Disconnect account
              </button>
            ) : music.account.status === 'connecting' ? (
              <button type="button" onClick={() => void music.disconnect()}>
                Cancel authorization
              </button>
            ) : (
              <button
                type="button"
                disabled={
                  !isDesktop() ||
                  music.busy ||
                  music.loading ||
                  !music.accountKnown ||
                  music.account.status === 'unavailable'
                }
                onClick={() => void music.connect()}
              >
                {music.account.status === 'expired' || music.error
                  ? 'Retry connection'
                  : 'Connect YouTube'}
              </button>
            )}
            <button
              type="button"
              disabled={!isDesktop() || music.loading}
              onClick={() => void music.refresh()}
            >
              Refresh account status
            </button>
          </div>
          <p className="music-muted">
            Aura authorization and the official player’s browser sign-in are
            separate. Choose the same Google account in both. Closing Settings
            leaves playback running.
          </p>
        </section>
        <details className="music-diagnostics">
          <summary>Diagnostics</summary>
          <p>
            Build:{' '}
            {!music.accountKnown
              ? 'Unknown - refresh account status'
              : music.account.validationBuild
                ? 'Developer validation · not approved for public release'
                : 'Regular · release requirements apply'}
          </p>
          <pre>{JSON.stringify(report, null, 2)}</pre>
          {music.recentDiagnostics.length > 0 && (
            <div className="music-recent-diagnostics">
              <p>Recent issues from Aura windows (last hour)</p>
              <ul>
                {music.recentDiagnostics.map((item, index) => (
                  <li key={index}>
                    <code>{item.code}</code>{' '}
                    <time dateTime={new Date(item.recordedAt).toISOString()}>
                      {new Date(item.recordedAt).toLocaleTimeString()}
                    </time>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="music-inline-error">
            {music.error ?? music.playbackError}
          </p>
          {music.details.map((detail, index) => (
            <p className="music-inline-error" key={index}>
              {detail.code}: {detail.message}
            </p>
          ))}
          <button type="button" onClick={() => void copyDiagnostics()}>
            Copy diagnostics
          </button>
          <span role="status">{copied}</span>
        </details>
      </PersistentSection>
      {sections.slice(1).map(
        ([id]) =>
          id !== 'player' && (
            <PersistentSection key={id} active={section === id}>
              <h2>{sections.find(([key]) => key === id)?.[1]}</h2>
              {connected ? (
                <MusicLibrary section={id} />
              ) : (
                <div className="settings-music-card">
                  <p>
                    {music.loading
                      ? 'Checking your library account…'
                      : music.accountKnown
                        ? 'Connect your YouTube account in Player to browse this section.'
                        : 'Could not check your account. Refresh its status in Player.'}
                  </p>
                  <button type="button" onClick={() => onSection('player')}>
                    Go to Player
                  </button>
                </div>
              )}
            </PersistentSection>
          ),
      )}
    </div>
  );
}
