import { useEffect, useRef, useState } from 'react';
import {
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume1,
  Volume2,
} from 'lucide-react';
import type { MediaAction, PlaybackState } from '../../types/music';
import {
  mediaControl,
  mediaSeek,
  mediaVolume,
  selectSession,
} from '../../features/integrations/music';
import { errorMessage } from '../../lib/native';
import { IconButton } from '../ui/IconButton';
import { ElasticSlider } from './ElasticSlider';

function time(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}
export function PlaybackControls({
  playback,
  compact = false,
}: {
  playback: PlaybackState;
  compact?: boolean;
}) {
  const session = playback.sessions.find((s) => s.id === playback.selectedId);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [seekPosition, setSeekPosition] = useState<{
    sessionId: string;
    seconds: number;
    snapshotAt: number;
  } | null>(null);
  const [now, setNow] = useState(0);
  const [volume, setVolume] = useState<number | null>(null);
  const [volumeForSession, setVolumeForSession] = useState<string | null>(null);
  const volumeTimer = useRef<number | null>(null);
  const pendingVolume = useRef<{ level: number; sessionId: string } | null>(
    null,
  );
  const sessionId = session?.id;
  useEffect(() => {
    let live = true;
    if (volumeTimer.current !== null) window.clearTimeout(volumeTimer.current);
    volumeTimer.current = null;
    pendingVolume.current = null;
    if (sessionId)
      void mediaVolume()
        .then((value) => {
          if (live) {
            setVolume(value * 100);
            setVolumeForSession(sessionId);
          }
        })
        .catch(() => {
          if (live) setVolumeForSession(null);
        });
    return () => {
      live = false;
      if (volumeTimer.current !== null)
        window.clearTimeout(volumeTimer.current);
    };
  }, [sessionId]);
  const shownVolume = volumeForSession === sessionId ? volume : null;
  useEffect(() => {
    if (!compact || !session?.playing) return;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [compact, session?.id, session?.playing]);
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
          ? Math.max(0, now - (session?.updatedAtUnixMs ?? now)) / 1000
          : 0),
    );
  const perform = async (action: MediaAction) => {
    setError(null);
    setBusy(true);
    try {
      await mediaControl(action);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  const choose = async (id: string) => {
    setError(null);
    setBusy(true);
    try {
      await selectSession(id || null);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  const applyVolume = (level: number, targetSessionId: string) =>
    void mediaVolume(level / 100)
      .then((actual) => {
        setVolume(actual * 100);
        setVolumeForSession(targetSessionId);
      })
      .catch((e) => setError(errorMessage(e)));
  return (
    <div
      className={`music-playback ${compact ? 'music-playback-compact' : ''}`}
    >
      {(!compact || (!session && playback.sessions.length > 0)) && (
        <label className="music-session-label">
          Windows media session
          <select
            value={playback.selectedId ?? ''}
            disabled={busy}
            onChange={(event) => void choose(event.target.value)}
          >
            <option value="">Choose a media session</option>
            {playback.sessions.map((s) => (
              <option value={s.id} key={s.id}>
                {s.title || 'Untitled'} · {s.source}
              </option>
            ))}
          </select>
        </label>
      )}
      {session ? (
        <>
          <div className="music-now-playing">
            {session.artwork ? (
              <img src={session.artwork} alt="" />
            ) : (
              <div className="music-artwork-placeholder">
                <Play size={18} />
              </div>
            )}
            <div>
              <strong title={session.title}>
                {session.title || 'Untitled'}
              </strong>
              <span title={session.artist}>
                {session.artist || session.source}
              </span>
            </div>
          </div>
          {compact && (
            <div className="music-progress">
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
                  void mediaSeek(seconds).catch((e) =>
                    setError(errorMessage(e)),
                  )
                }
              />
            </div>
          )}
          <div className="music-transport">
            <IconButton
              label="Previous track"
              disabled={busy || !session.canPrevious}
              onClick={() => void perform('previous')}
            >
              <SkipBack size={15} />
            </IconButton>
            <IconButton
              label={session.playing ? 'Pause playback' : 'Resume playback'}
              disabled={
                busy || (session.playing ? !session.canPause : !session.canPlay)
              }
              onClick={() => void perform(session.playing ? 'pause' : 'play')}
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
            {!compact && (
              <span aria-label="Playback position">
                {time(session.positionSeconds)} /{' '}
                {time(session.durationSeconds)}
              </span>
            )}
          </div>
          {compact && (
            <div
              className="music-volume"
              title={
                shownVolume === null
                  ? 'Select an active browser media session to enable volume.'
                  : 'Controls audio volume for this browser.'
              }
            >
              <ElasticSlider
                label="Browser volume"
                max={100}
                value={shownVolume ?? 0}
                disabled={shownVolume === null}
                leftIcon={<Volume1 />}
                rightIcon={<Volume2 />}
                onChange={(level) => {
                  setVolume(level);
                  pendingVolume.current = { level, sessionId: session.id };
                  if (volumeTimer.current === null) {
                    volumeTimer.current = window.setTimeout(() => {
                      volumeTimer.current = null;
                      const pending = pendingVolume.current;
                      if (pending)
                        void mediaVolume(pending.level / 100).catch((e) =>
                          setError(errorMessage(e)),
                        );
                    }, 90);
                  }
                }}
                onChangeEnd={(level) => {
                  if (volumeTimer.current !== null)
                    window.clearTimeout(volumeTimer.current);
                  volumeTimer.current = null;
                  pendingVolume.current = null;
                  applyVolume(level, session.id);
                }}
              />
            </div>
          )}
        </>
      ) : (
        <p className="music-session-empty">
          {playback.message ??
            (playback.sessions.length
              ? 'Choose a media session in Aura Music.'
              : 'Play in YouTube Music to see Windows controls.')}
        </p>
      )}
      {error && (
        <p className="music-inline-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
