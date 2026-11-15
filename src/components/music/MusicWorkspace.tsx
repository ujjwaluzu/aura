import { useState, type ReactNode } from 'react';
import { useMusic } from '../../hooks/useMusic';
import { isDesktop, type MusicSection } from '../../lib/native';
import { openMusicPolicy, openPlayer } from '../../features/integrations/music';
import { PlaybackControls } from './PlaybackControls';
import { MusicLibrary } from './MusicLibrary';
import { MusicPolicy } from './MusicPolicy';
import { DialogPanel } from '../ui/DialogPanel';
import { PagedText } from '../ui/PagedText';
import { version } from '../../../package.json';

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
  const [diagnostics, setDiagnostics] = useState(false);
  const [policy, setPolicy] = useState<'connect' | 'view' | null>(null);
  const connected = music.account.status === 'connected';
  const report = {
    app: `Aura ${version}`,
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
        <div className="music-player-grid">
          <section className="settings-music-card music-now-playing-card">
            <div className="settings-music-card-heading">
              <div>
                <h2>Now playing</h2>
              </div>
              <button
                type="button"
                disabled={!isDesktop()}
                onClick={() =>
                  music.playbackError
                    ? void music.refreshPlayback()
                    : void openPlayer({ kind: 'home' }).catch(music.reportError)
                }
              >
                {music.playbackError
                  ? 'Retry playback'
                  : 'Open official player'}
              </button>
            </div>
            {music.playbackError && (
              <span className="sr-only" role="alert">
                Could not load playback.
              </span>
            )}
            <PlaybackControls
              playback={music.playback}
              presentation="settings"
            />
          </section>
          <section className="settings-music-card music-account-card">
            <h2>YouTube library account</h2>
            {music.loading ? (
              <p role="status">Checking account connection…</p>
            ) : !music.accountKnown ? (
              <p role="alert">
                Could not check your account. Connection availability is
                unknown.
              </p>
            ) : (
              <p
                className="music-account-status-copy"
                title={
                  connected
                    ? `Connected as ${music.account.name ?? 'YouTube account'}`
                    : undefined
                }
              >
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
                  onClick={() => setPolicy('connect')}
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
                Refresh status
              </button>
            </div>
            {music.account.status === 'disconnected' &&
              music.account.message && (
                <p role="status">{music.account.message}</p>
              )}
            <div className="settings-music-actions music-policy-actions">
              <button type="button" onClick={() => setPolicy('view')}>
                Privacy and terms
              </button>
              <button
                type="button"
                disabled={!isDesktop()}
                onClick={() =>
                  void openMusicPolicy('googlePermissions').catch(
                    music.reportError,
                  )
                }
              >
                Manage Google access
              </button>
            </div>
            <p className="music-muted">
              Aura authorization and the official player’s sign-in are separate.
              Playback continues when Settings closes.
            </p>
          </section>
        </div>
        {policy && (
          <MusicPolicy
            connecting={policy === 'connect'}
            onClose={() => setPolicy(null)}
            onAccept={() => {
              setPolicy(null);
              void music.connect();
            }}
            onError={music.reportError}
          />
        )}
        <button
          type="button"
          className="music-diagnostics-toggle"
          aria-expanded={diagnostics}
          onClick={() => setDiagnostics(true)}
        >
          Diagnostics
        </button>
        {diagnostics && (
          <DialogPanel
            title="Diagnostics"
            onClose={() => setDiagnostics(false)}
          >
            <p>
              Build:{' '}
              {!music.accountKnown
                ? 'Unknown - refresh account status'
                : music.account.validationBuild
                  ? 'Developer validation'
                  : 'Regular - release requirements apply'}
            </p>
            <div className="music-recent-diagnostics">
              <PagedText
                text={[
                  music.account.message ?? '',
                  music.error ?? music.playbackError ?? '',
                  ...music.details.map(
                    (detail) => `${detail.code}: ${detail.message}`,
                  ),
                  ...music.recentDiagnostics.map(
                    (item) =>
                      `${item.code} ${new Date(item.recordedAt).toLocaleTimeString()}`,
                  ),
                  JSON.stringify(report, null, 2),
                ]
                  .filter(Boolean)
                  .join('\n')}
              />
            </div>
            <div className="diagnostics-footer">
              <button type="button" onClick={() => void copyDiagnostics()}>
                Copy diagnostics
              </button>
              <span role="status">{copied}</span>
            </div>
          </DialogPanel>
        )}
      </PersistentSection>
      {sections.slice(1).map(
        ([id]) =>
          id !== 'player' && (
            <PersistentSection key={id} active={section === id}>
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
