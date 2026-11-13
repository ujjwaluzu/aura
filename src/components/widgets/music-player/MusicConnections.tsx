import { useState } from 'react';
import { GlassSurface } from '../../ui/GlassSurface';
import type { WidgetProps } from '../../../features/widget-engine/types';
import { useMusic } from '../../../hooks/useMusic';
import { openMusic } from '../../../features/integrations/music';
import { errorMessage } from '../../../lib/native';
import { PlaybackControls } from '../../music/PlaybackControls';

function SpotifyMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="#1ed760" />
      <g fill="none" stroke="#12331e" strokeLinecap="round">
        <path d="M6.2 9.2c3.6-1.1 7.9-.8 11.7 1" strokeWidth="1.9" />
        <path d="M6.9 12.2c3.1-.8 6.6-.5 9.9.9" strokeWidth="1.65" />
        <path d="M7.7 15.1c2.7-.6 5.5-.3 8.2.8" strokeWidth="1.45" />
      </g>
    </svg>
  );
}

function YouTubeMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="1" y="4" width="22" height="16" rx="5" fill="#f34b5a" />
      <path d="m10 8 6 4-6 4Z" fill="white" />
    </svg>
  );
}

export function MusicConnections({ themeId }: WidgetProps) {
  const [notice, setNotice] = useState<string | null>(null);
  const { account, playback } = useMusic();
  const selected = playback.sessions.some(
    (session) => session.id === playback.selectedId,
  );
  const showLibrary = async () => {
    setNotice(null);
    try {
      await openMusic();
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };
  return (
    <GlassSurface
      variant="inset"
      opacity={0.35}
      className={`music-connect-card ${selected ? 'music-connect-card-playing' : ''}`}
      aria-label="Music connections"
      data-theme={themeId}
      data-tauri-drag-region
    >
      {account.status === 'connected' || selected ? (
        <div className="music-widget-connected">
          <PlaybackControls playback={playback} compact />
          {!selected && (
            <button
              className="music-library-button"
              type="button"
              onClick={() => void showLibrary()}
            >
              Library
            </button>
          )}
        </div>
      ) : (
        <div className="music-connect-actions">
          <button
            className="music-connect-button"
            type="button"
            onClick={() => setNotice('Spotify connection is coming soon.')}
          >
            <SpotifyMark />
            <span>Connect Spotify</span>
          </button>
          <button
            className="music-connect-button"
            type="button"
            onClick={() => void showLibrary()}
          >
            <YouTubeMark />
            <span>Connect YouTube</span>
          </button>
        </div>
      )}
      <p className="music-connect-notice" role="status" aria-live="polite">
        {notice}
      </p>
    </GlassSurface>
  );
}
