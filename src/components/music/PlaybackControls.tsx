import { useEffect, useRef, useState } from 'react';
import {
  MoreHorizontal,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  X,
} from 'lucide-react';
import type { MediaAction, PlaybackState } from '../../types/music';
import {
  mediaControl,
  mediaSeek,
  mediaVolume,
  selectSession,
} from '../../features/integrations/music';
import { musicError, openSettings } from '../../lib/native';
import { useMusic } from '../../hooks/useMusic';
import { IconButton } from '../ui/IconButton';
import { ElasticSlider } from './ElasticSlider';
import {
  PlayerPresentation,
  type MusicPresentation,
} from './PlayerPresentation';

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
  const session = playback.sessions.find((s) => s.id === playback.selectedId);
  const compact = presentation !== 'settings';
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(false);
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
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const selectedId = useRef(playback.selectedId);
  useEffect(() => {
    selectedId.current = playback.selectedId;
  }, [playback.selectedId]);
  const sessionId = session?.id;
  useEffect(() => {
    if (!sessionId || (compact && !more)) return;
    let live = true;
    void mediaVolume().then(
      (level) => {
        if (live) {
          setVolume({ sessionId, level: level * 100 });
          setVolumeError(null);
        }
      },
      (e: unknown) => {
        if (live) {
          setVolumeError({ sessionId, message: 'Volume unavailable' });
          reportError(e);
        }
      },
    );
    return () => {
      live = false;
    };
  }, [sessionId, compact, more, volumeReload, reportError]);
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
          'button:not(:disabled), [role="slider"][tabindex="0"]',
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
  }, [more]);
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
  const showSettings = (destination: 'music-player' | 'music-playlists') =>
    void openSettings(destination).then(() => {
      setMore(false);
      trigger.current?.focus();
    }, fail);
  const shownVolume =
    volume && volume.sessionId === sessionId ? volume.level : null;
  const shownVolumeError =
    volumeError?.sessionId === sessionId ? volumeError?.message : null;
  const volumeControl = (
    <div className="player-volume">
      <span>
        {shownVolumeError ??
          (shownVolume === null ? 'Loading volume…' : 'Browser volume')}
      </span>
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
          setVolumeBusy(true);
          void mediaVolume(level / 100)
            .then(
              (actual) => {
                if (selectedId.current === sessionId) {
                  setVolume({ sessionId, level: actual * 100 });
                  setVolumeError(null);
                }
              },
              (e: unknown) => {
                if (selectedId.current === sessionId) {
                  setVolumeError({ sessionId, message: 'Volume unavailable' });
                  reportError(e);
                }
              },
            )
            .finally(() => setVolumeBusy(false));
        }}
      />
      {shownVolumeError && (
        <button
          type="button"
          onClick={() => {
            setVolumeError(null);
            setVolume(null);
            setVolumeReload((n) => n + 1);
          }}
        >
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
      {session ? (
        <div className="player-main" inert={more}>
          <PlayerPresentation
            session={session}
            presentation={presentation}
            progress={
              <ElasticSlider
                label="Track progress"
                max={Math.max(1, session.durationSeconds)}
                value={position}
                disabled={
                  !session.canSeek || busy || session.durationSeconds <= 0
                }
                onChange={(seconds) =>
                  setSeekPosition({
                    sessionId: session.id,
                    seconds,
                    snapshotAt: session.updatedAtUnixMs,
                  })
                }
                onChangeEnd={(seconds) =>
                  void mediaSeek(seconds).catch((e: unknown) => {
                    setSeekPosition(null);
                    fail(e);
                  })
                }
              />
            }
            time={
              !compact && (
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
                    disabled={busy || !session.canPrevious}
                    onClick={() => void perform('previous')}
                  >
                    <SkipBack size={15} />
                  </IconButton>
                  <IconButton
                    label={
                      session.playing ? 'Pause playback' : 'Resume playback'
                    }
                    disabled={
                      busy ||
                      (session.playing ? !session.canPause : !session.canPlay)
                    }
                    onClick={() =>
                      void perform(session.playing ? 'pause' : 'play')
                    }
                  >
                    {session.playing ? <Pause size={15} /> : <Play size={15} />}
                  </IconButton>
                  <IconButton
                    label="Next track"
                    disabled={busy || !session.canNext}
                    onClick={() => void perform('next')}
                  >
                    <SkipForward size={15} />
                  </IconButton>
                </div>
                {compact && (
                  <button
                    type="button"
                    ref={trigger}
                    className="icon-button player-more"
                    title="More music actions"
                    aria-label="More music actions"
                    aria-expanded={more}
                    aria-haspopup="dialog"
                    onClick={() => setMore(true)}
                  >
                    <MoreHorizontal size={16} />
                  </button>
                )}
              </>
            }
          />
          {!compact && volumeControl}
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
            <button type="button" onClick={() => showSettings('music-player')}>
              Open Music
            </button>
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
          aria-label="More music actions"
        >
          <div className="player-more-heading">
            <strong>Music actions</strong>
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
          <div className="player-more-content">
            {volumeControl}
            <div className="player-more-links">
              <button
                type="button"
                onClick={() => showSettings('music-playlists')}
              >
                Library
              </button>
              <button
                type="button"
                onClick={() => showSettings('music-player')}
              >
                Change player
              </button>
            </div>
          </div>
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
