import { useEffect, useRef, useState } from 'react';
import {
  MoreHorizontal,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import type { MediaAction, PlaybackState } from '../../types/music';
import {
  mediaControl,
  mediaSeek,
  mediaVolume,
  selectSession,
  openPlayer,
} from '../../features/integrations/music';
import { musicError, openSettings } from '../../lib/native';
import { useMusic } from '../../hooks/useMusic';
import { IconButton } from '../ui/IconButton';
import { ElasticSlider } from './ElasticSlider';
import {
  PlayerPresentation,
  type MusicPresentation,
} from './PlayerPresentation';

function volumeErrorCode(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : 'UNKNOWN';
}
function volumeFailureMessage(error: unknown) {
  return volumeErrorCode(error) === 'BROWSER_VOLUME_PENDING'
    ? 'Waiting for browser audio...'
    : 'Volume unavailable';
}
function retryableVolumeError(error: unknown) {
  return [
    'BROWSER_VOLUME_PENDING',
    'BROWSER_VOLUME_UNAVAILABLE',
    'MEDIA_UNAVAILABLE',
  ].includes(volumeErrorCode(error));
}
function time(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}
export function PlaybackControls({
  playback,
  presentation = 'settings',
}: {
  playback: PlaybackState;
  presentation?: MusicPresentation;
}) {
  const music = useMusic();
  const reportError = music.reportError;
  const compact = presentation !== 'settings';
  const connected = music.account.status === 'connected';
  const session =
    playback.sessions.find((s) => s.id === playback.selectedId) ??
    (compact && connected && !playback.message && playback.sessions.length === 1
      ? playback.sessions[0]
      : undefined);
  const reconnecting = Boolean(playback.selectedId) && !session;
  const showPlayer = Boolean(session) || reconnecting || (compact && connected);
  const displaySession = session ?? {
    title: reconnecting
      ? 'Reconnecting player…'
      : music.playbackLoading
        ? 'Finding players…'
        : music.playbackError || playback.message?.includes('unavailable')
          ? 'Player unavailable'
          : playback.sessions.length
            ? 'Choose a player'
            : 'Ready to play',
    artist: reconnecting
      ? 'Waiting for the selected player'
      : playback.sessions.length
        ? 'Select a player to control playback'
        : 'Start a song in YouTube Music',
    source: reconnecting ? 'Windows media player' : 'YouTube Music',
    artwork: null,
  };
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(false);
  const [panelMode, setPanelMode] = useState<'more' | 'players'>('more');
  const [seekPosition, setSeekPosition] = useState<{
    sessionId: string;
    seconds: number;
    snapshotAt: number;
  } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [volume, setVolume] = useState<{
    sessionId: string;
    level: number;
  } | null>(null);
  const [volumeError, setVolumeError] = useState<{
    sessionId: string;
    message: string;
  } | null>(null);
  const [volumeReload, setVolumeReload] = useState(0);
  const [volumeBusy, setVolumeBusy] = useState(false);
  const volumeRequest = useRef(0);
  const volumeWriting = useRef(false);
  const lastVolumeDiagnostic = useRef<string | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const selectedId = useRef(playback.selectedId);
  useEffect(() => {
    selectedId.current = playback.selectedId;
  }, [playback.selectedId]);
  const sessionId = session?.id;
  const boundSessionId = playback.selectedId;

  useEffect(() => {
    if (!sessionId) return;
    let live = true;
    let reading = false;
    let attempts = 0;
    let timer: number | undefined;
    const schedule = (delay: number) => {
      window.clearTimeout(timer);
      if (live && !document.hidden)
        timer = window.setTimeout(() => void load(), delay);
    };
    const load = async () => {
      if (!live || document.hidden || reading) return;
      if (volumeWriting.current) {
        schedule(200);
        return;
      }
      reading = true;
      const request = ++volumeRequest.current;
      try {
        if (boundSessionId !== sessionId) {
          if (selectedId.current && selectedId.current !== sessionId) return;
          await selectSession(sessionId);
          if (!live || request !== volumeRequest.current) return;
        }
        const level = await mediaVolume(undefined, sessionId);
        if (live && request === volumeRequest.current) {
          setVolume({ sessionId, level: level * 100 });
          setVolumeError(null);
          lastVolumeDiagnostic.current = null;
          attempts = 0;
        }
      } catch (e) {
        if (live && request === volumeRequest.current) {
          setVolumeError({ sessionId, message: volumeFailureMessage(e) });
          const diagnostic = `${sessionId}:${volumeErrorCode(e)}`;
          if (lastVolumeDiagnostic.current !== diagnostic) {
            lastVolumeDiagnostic.current = diagnostic;
            reportError(e);
          }
          if (retryableVolumeError(e))
            schedule(Math.min(30000, 500 * 2 ** Math.min(attempts++, 6)));
        }
      } finally {
        reading = false;
      }
    };
    const resume = () => {
      window.clearTimeout(timer);
      if (!document.hidden) {
        attempts = 0;
        void load();
      }
    };
    void load();
    window.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', resume);
    return () => {
      live = false;
      window.clearTimeout(timer);
      window.removeEventListener('focus', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [
    sessionId,
    session?.source,
    session?.playing,
    boundSessionId,
    more,
    volumeReload,
    reportError,
  ]);
  useEffect(() => {
    if (!more) return;
    const focusTarget = trigger.current;
    panel.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const close = () => {
      setMore(false);
      focusTarget?.focus();
    };
    const pointer = (e: PointerEvent) => {
      if (!panel.current?.contains(e.target as Node)) {
        e.preventDefault();
        close();
      }
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close();
      }
      if (e.key === 'Tab') {
        const controls = panel.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), select:not(:disabled), [role="slider"][tabindex="0"]',
        );
        if (!controls?.length) return;
        const first = controls[0]!;
        const last = controls[controls.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('pointerdown', pointer, true);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', pointer, true);
      document.removeEventListener('keydown', key);
      focusTarget?.focus();
    };
  }, [more, panelMode]);
  useEffect(() => {
    if (!session?.playing) return;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [session?.id, session?.playing]);
  const position =
    (seekPosition &&
    session &&
    seekPosition.sessionId === session.id &&
    session.updatedAtUnixMs <= seekPosition.snapshotAt
      ? seekPosition.seconds
      : null) ??
    Math.min(
      session?.durationSeconds ?? 0,
      (session?.positionSeconds ?? 0) +
        (session?.playing
          ? Math.max(0, now - session.updatedAtUnixMs) / 1000
          : 0),
    );
  const fail = (e: unknown) => {
    reportError(e);
    setError(musicError(e));
  };
  const perform = async (action: MediaAction) => {
    setError(null);
    setBusy(true);
    try {
      if (session && playback.selectedId !== session.id)
        await selectSession(session.id);
      await mediaControl(action);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  const choose = async (id: string) => {
    setError(null);
    setBusy(true);
    try {
      await selectSession(id || null);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  const startPlayback = async () => {
    if (playback.sessions.length) {
      setPanelMode('players');
      setMore(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await openPlayer({ kind: 'home' });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  const chooseHere = async (id: string) => {
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      await selectSession(id);
      setMore(false);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  const showSettings = (destination: 'music-player' | 'music-playlists') =>
    void openSettings(destination).then(() => {
      setMore(false);
      trigger.current?.focus();
    }, fail);
  const shownVolume =
    volume && volume.sessionId === sessionId ? volume.level : null;
  const shownVolumeError =
    volumeError?.sessionId === sessionId ? volumeError?.message : null;
  const volumeStatus =
    shownVolumeError ??
    (!session
      ? 'Choose a player for volume'
      : shownVolume === null
        ? 'Loading volume…'
        : 'Browser volume');
  const retryVolume = () => {
    setVolumeError(null);
    setVolume(null);
    setVolumeReload((n) => n + 1);
  };
  const volumeSlider = (
    <ElasticSlider
      label="Browser volume"
      max={100}
      value={shownVolume ?? 0}
      disabled={shownVolume === null || volumeBusy}
      onChange={(level) => {
        if (sessionId) setVolume({ sessionId, level });
      }}
      onChangeEnd={(level) => {
        if (!sessionId) return;
        const request = ++volumeRequest.current;
        volumeWriting.current = true;
        setVolumeBusy(true);
        void mediaVolume(level / 100, sessionId)
          .then(
            (actual) => {
              if (
                selectedId.current === sessionId &&
                request === volumeRequest.current
              ) {
                setVolume({ sessionId, level: actual * 100 });
                setVolumeError(null);
                lastVolumeDiagnostic.current = null;
              }
            },
            (e: unknown) => {
              if (
                selectedId.current === sessionId &&
                request === volumeRequest.current
              ) {
                setVolumeError({ sessionId, message: volumeFailureMessage(e) });
                const diagnostic = `${sessionId}:${volumeErrorCode(e)}`;
                if (lastVolumeDiagnostic.current !== diagnostic) {
                  lastVolumeDiagnostic.current = diagnostic;
                  reportError(e);
                }
                if (retryableVolumeError(e)) setVolumeReload((n) => n + 1);
              }
            },
          )
          .finally(() => {
            volumeWriting.current = false;
            setVolumeBusy(false);
          });
      }}
    />
  );
  const volumeControl = (
    <div className="player-volume">
      <span>{volumeStatus}</span>
      {volumeSlider}
      {shownVolumeError && (
        <button type="button" onClick={retryVolume}>
          Retry volume
        </button>
      )}
    </div>
  );
  return (
    <div className={`music-playback playback-${presentation}`}>
      {!compact && (
        <label className="music-session-label">
          Windows media session
          <select
            value={playback.selectedId ?? ''}
            disabled={busy}
            onChange={(e) => void choose(e.target.value)}
          >
            <option value="">Choose a media session</option>
            {playback.sessions.map((s) => (
              <option value={s.id} key={s.id}>
                {s.source} · {s.title || 'Untitled media'} ·{' '}
                {s.playing ? 'Playing' : 'Paused'}
              </option>
            ))}
          </select>
        </label>
      )}
      {!compact && playback.message && <p role="status">{playback.message}</p>}
      {showPlayer ? (
        <div
          className="player-main"
          inert={more}
          aria-hidden={more || undefined}
        >
          <PlayerPresentation
            session={displaySession}
            presentation={presentation}
            progress={
              <ElasticSlider
                label="Track progress"
                max={Math.max(1, session?.durationSeconds ?? 0)}
                value={position}
                disabled={
                  !session?.canSeek || busy || session.durationSeconds <= 0
                }
                onChange={(seconds) =>
                  setSeekPosition({
                    sessionId: session?.id ?? '',
                    seconds,
                    snapshotAt: session?.updatedAtUnixMs ?? 0,
                  })
                }
                onChangeEnd={(seconds) => {
                  if (!session) return;
                  const select =
                    playback.selectedId === session.id
                      ? Promise.resolve()
                      : selectSession(session.id);
                  void select
                    .then(() => mediaSeek(seconds))
                    .catch((e: unknown) => {
                      setSeekPosition(null);
                      fail(e);
                    });
                }}
              />
            }
            time={
              !compact &&
              session && (
                <span className="player-time">
                  {time(position)} elapsed ·{' '}
                  {time(Math.max(0, session.durationSeconds - position))}{' '}
                  remaining
                </span>
              )
            }
            controls={
              <>
                <div className="music-transport">
                  <IconButton
                    label="Previous track"
                    disabled={busy || !session?.canPrevious}
                    onClick={() => void perform('previous')}
                  >
                    <SkipBack size={15} />
                  </IconButton>
                  <IconButton
                    label={
                      reconnecting
                        ? 'Waiting for selected player'
                        : session
                          ? session.playing
                            ? 'Pause playback'
                            : 'Resume playback'
                          : playback.sessions.length
                            ? 'Choose playback player'
                            : 'Start YouTube Music'
                    }
                    disabled={
                      busy ||
                      reconnecting ||
                      music.playbackLoading ||
                      Boolean(
                        session &&
                        (session.playing
                          ? !session.canPause
                          : !session.canPlay),
                      )
                    }
                    onClick={() =>
                      session
                        ? void perform(session.playing ? 'pause' : 'play')
                        : void startPlayback()
                    }
                  >
                    {session?.playing ? (
                      <Pause size={15} />
                    ) : (
                      <Play size={15} />
                    )}
                  </IconButton>
                  <IconButton
                    label="Next track"
                    disabled={busy || !session?.canNext}
                    onClick={() => void perform('next')}
                  >
                    <SkipForward size={15} />
                  </IconButton>
                </div>
                {
                  <div
                    className="player-volume-inline"
                    title={
                      shownVolume === null || shownVolumeError
                        ? volumeStatus
                        : `Browser volume: ${Math.round(shownVolume)}%`
                    }
                  >
                    {shownVolumeError ? (
                      <IconButton
                        label="Retry volume"
                        title="Volume unavailable. Retry volume"
                        onClick={retryVolume}
                      >
                        <VolumeX size={14} />
                      </IconButton>
                    ) : (
                      <>
                        <Volume2 size={12} aria-hidden="true" />
                        {volumeSlider}
                      </>
                    )}
                  </div>
                }
                {compact && (
                  <button
                    type="button"
                    ref={trigger}
                    className="icon-button player-more"
                    title="More music actions"
                    aria-label="More music actions"
                    aria-expanded={more}
                    aria-haspopup="dialog"
                    onClick={() => {
                      setPanelMode('more');
                      setMore(true);
                    }}
                  >
                    <MoreHorizontal size={16} />
                  </button>
                )}
              </>
            }
          />
        </div>
      ) : (
        <div className="player-empty">
          <span>
            {music.playbackLoading
              ? 'Finding players…'
              : music.playbackError || playback.message?.includes('unavailable')
                ? 'Player unavailable'
                : 'No music playing'}
          </span>
          {compact ? (
            playback.sessions.length ? (
              <button
                type="button"
                ref={trigger}
                onClick={() => {
                  setPanelMode('players');
                  setMore(true);
                }}
              >
                Choose player
              </button>
            ) : (
              <button
                type="button"
                onClick={() => showSettings('music-player')}
              >
                Open Music
              </button>
            )
          ) : (
            <p>Start the official player, then select its session above.</p>
          )}
        </div>
      )}
      {more && compact && (
        <div
          className="player-more-panel"
          ref={panel}
          role="dialog"
          aria-label={
            panelMode === 'players'
              ? 'Choose playback player'
              : 'More music actions'
          }
        >
          <div className="player-more-heading">
            <strong>
              {panelMode === 'players' ? 'Choose player' : 'Music actions'}
            </strong>
            <IconButton
              label="Close music actions"
              onClick={() => {
                setMore(false);
                trigger.current?.focus();
              }}
            >
              <X size={15} />
            </IconButton>
          </div>
          {panelMode === 'players' ? (
            <label className="player-session-picker">
              Windows media session
              <select
                aria-label="Choose playback player"
                value={playback.selectedId ?? ''}
                disabled={busy || !playback.sessions.length}
                onChange={(event) => void chooseHere(event.target.value)}
              >
                <option value="">
                  {playback.sessions.length
                    ? 'Choose a media session'
                    : 'Start a song to find its player'}
                </option>
                {playback.sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.source} · {s.title || 'Untitled media'} ·{' '}
                    {s.playing ? 'Playing' : 'Paused'}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div className="player-more-content">
              {volumeControl}
              <div className="player-more-links">
                <button
                  type="button"
                  onClick={() => showSettings('music-playlists')}
                >
                  Library
                </button>
                <button type="button" onClick={() => setPanelMode('players')}>
                  Change player
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {error && (
        <div className="player-error" role="alert">
          <span>{compact ? 'Playback action failed.' : error}</span>
          <button type="button" onClick={() => showSettings('music-player')}>
            {compact ? 'Details' : 'Check player'}
          </button>
          <button type="button" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
