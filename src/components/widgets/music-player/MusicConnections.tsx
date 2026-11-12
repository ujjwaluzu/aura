import { useState } from 'react';
import { GlassSurface } from '../../ui/GlassSurface';
import type { WidgetProps } from '../../../features/widget-engine/types';

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

function YouTubeMusicMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="#f34b5a" />
      <circle
        cx="12"
        cy="12"
        r="7.3"
        fill="none"
        stroke="white"
        strokeWidth="1.2"
      />
      <path d="m10 8 6 4-6 4Z" fill="white" />
    </svg>
  );
}

/** Provider entry points only. No authentication or connected state yet. */
export function MusicConnections({ themeId }: WidgetProps) {
  const [notice, setNotice] = useState<string | null>(null);
  return (
    <GlassSurface
      variant="inset"
      opacity={0.35}
      className="music-connect-card"
      aria-label="Music connections"
      data-theme={themeId}
      data-tauri-drag-region
    >
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
          onClick={() => setNotice('YouTube Music connection is coming soon.')}
        >
          <YouTubeMusicMark />
          <span>Connect YouTube Music</span>
        </button>
      </div>
      <p className="music-connect-notice" role="status" aria-live="polite">
        {notice}
      </p>
    </GlassSurface>
  );
}
