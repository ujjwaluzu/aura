import { useEffect, useState } from 'react';
import { Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import type { MediaAction, PlaybackState } from '../../types/music';
import {
  mediaControl,
  mediaSeek,
  selectSession,
} from '../../features/integrations/music';
import { errorMessage } from '../../lib/native';
import { IconButton } from '../ui/IconButton';

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
            <input
              className="music-progress"
              type="range"
              aria-label="Track progress"
              min={0}
              max={Math.max(1, session.durationSeconds)}
              step={1}
              value={position}
              style={{
                background: `linear-gradient(90deg, var(--color-accent) ${session.durationSeconds > 0 ? (position / session.durationSeconds) * 100 : 0}%, rgba(255,255,255,.12) ${session.durationSeconds > 0 ? (position / session.durationSeconds) * 100 : 0}%)`,
              }}
              disabled={
                !session.canSeek || busy || session.durationSeconds <= 0
              }
              onChange={(event) =>
                setSeekPosition({
                  sessionId: session.id,
                  seconds: Number(event.target.value),
                  snapshotAt: session.updatedAtUnixMs,
                })
              }
              onPointerUp={() => {
                if (seekPosition?.sessionId === session.id)
                  void mediaSeek(seekPosition.seconds).catch((e) =>
                    setError(errorMessage(e)),
                  );
              }}
              onKeyUp={() => {
                if (seekPosition?.sessionId === session.id)
                  void mediaSeek(seekPosition.seconds).catch((e) =>
                    setError(errorMessage(e)),
                  );
              }}
            />
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
