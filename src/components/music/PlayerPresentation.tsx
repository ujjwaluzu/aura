import { useState, type ReactNode } from 'react';
import { Music2 } from 'lucide-react';
import type { PlaybackSession } from '../../types/music';
export type MusicPresentation =
  'horizontal' | 'vertical' | 'focus' | 'settings';
/** Shared visual layout for live controls and static arrangement previews. */
export function PlayerPresentation({
  session,
  presentation,
  progress,
  controls,
  time,
}: {
  session: Pick<PlaybackSession, 'title' | 'artist' | 'source' | 'artwork'>;
  presentation: MusicPresentation;
  progress: ReactNode;
  controls: ReactNode;
  time?: ReactNode;
}) {
  const trackKey = `${session.title}\0${session.artist}\0${session.source}`;
  const [failedArtwork, setFailedArtwork] = useState<{
    image: string | null;
    track: string;
  } | null>(null);
  return (
    <div className={`player-presentation player-${presentation}`}>
      <div className="player-artwork">
        {session.artwork &&
        (session.artwork !== failedArtwork?.image ||
          trackKey !== failedArtwork.track) ? (
          <img
            key={`${trackKey}\0${session.artwork}`}
            src={session.artwork}
            alt=""
            onError={() =>
              setFailedArtwork({ image: session.artwork, track: trackKey })
            }
          />
        ) : (
          <span className="music-artwork-placeholder">
            <Music2 size={24} />
          </span>
        )}
      </div>
      <div className="player-information">
        <strong title={session.title}>
          {session.title || 'Untitled media'}
        </strong>
        <span title={session.artist || session.source}>
          {session.artist || session.source}
        </span>
      </div>
      <div className="player-progress">
        {progress}
        {time}
      </div>
      <div className="player-controls">{controls}</div>
    </div>
  );
}
