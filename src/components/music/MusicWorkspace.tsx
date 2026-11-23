import { useState } from 'react';
import { useMusic } from '../../hooks/useMusic';
import { isDesktop } from '../../lib/native';
import { openPlayer } from '../../features/integrations/music';
import { PlaybackControls } from './PlaybackControls';
import { DialogPanel } from '../ui/DialogPanel';
import { PagedText } from '../ui/PagedText';
import { version } from '../../../package.json';

export function MusicWorkspace() {
  const music = useMusic();
  const [diagnostics, setDiagnostics] = useState(false);
  const [copied, setCopied] = useState('');
  const report = {
    app: `Aura ${version}`,
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
    errors: Array.from(
      new Set(
        [...music.details, ...music.recentDiagnostics].map(({ code }) => code),
      ),
    ).map((code) => ({ code })),
  };
  return (
    <div className="music-workspace">
      <div className="music-section-scroll">
        <div className="music-player-grid">
          <section className="settings-music-card music-now-playing-card">
            <div className="settings-music-card-heading">
              <h2>Now playing</h2>
              <button
                type="button"
                disabled={!isDesktop()}
                onClick={() => void music.refreshPlayback()}
              >
                Refresh players
              </button>
            </div>
            <PlaybackControls
              playback={music.playback}
              presentation="settings"
            />
          </section>
          <section className="settings-music-card">
            <h2>Browser media</h2>
            <p>
              Aura reads playback from Windows media sessions. Start music or a
              video in your browser, then choose its player. No Google or
              YouTube authorization is needed.
            </p>
            <p className="music-muted">
              Title, artist, artwork and controls depend on what the browser
              shares with Windows. Playback continues when Settings closes.
            </p>
            <button
              type="button"
              disabled={!isDesktop()}
              onClick={() =>
                void openPlayer({ kind: 'home' }).catch(music.reportError)
              }
            >
              Open YouTube Music
            </button>
          </section>
        </div>
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
            <div className="music-recent-diagnostics">
              <PagedText
                text={[
                  music.playbackError ?? '',
                  ...music.details.map((d) => `${d.code}: ${d.message}`),
                  ...music.recentDiagnostics.map(
                    (d) =>
                      `${d.code} ${new Date(d.recordedAt).toLocaleTimeString()}`,
                  ),
                  JSON.stringify(report, null, 2),
                ]
                  .filter(Boolean)
                  .join('\n')}
              />
            </div>
            <div className="diagnostics-footer">
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard
                    .writeText(JSON.stringify(report, null, 2))
                    .then(
                      () =>
                        setCopied('Copied diagnostics without credentials.'),
                      () =>
                        setCopied(
                          'Could not copy. Select the diagnostic text above.',
                        ),
                    );
                }}
              >
                Copy diagnostics
              </button>
              <span role="status">{copied}</span>
            </div>
          </DialogPanel>
        )}
      </div>
    </div>
  );
}
