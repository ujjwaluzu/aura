import { useState } from 'react';
import { Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import type { MediaAction, PlaybackState } from '../../types/music';
import { mediaControl, selectSession } from '../../features/integrations/music';
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
      {!compact && (
        <label className="music-session-label">
          Windows media session
          <select
            value={playback.selectedId ?? ''}
            disabled={busy}
            onChange={(event) => void choose(event.target.value)}
          >
            <option value="">Choose the YouTube Music session</option>
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
            {session.artwork && <img src={session.artwork} alt="" />}
            <div>
              <strong title={session.title}>
                {session.title || 'Untitled'}
              </strong>
              <span title={session.artist}>
                {session.artist || session.source}
              </span>
            </div>
          </div>
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
