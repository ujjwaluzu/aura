import { SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import { GlassSurface } from '../ui/GlassSurface';
import { Text } from '../ui/Text';
import { WindowBar } from '../ui/WindowBar';

export function SettingsPlaceholder() {
  const [error, setError] = useState<string | null>(null);
  return (
    <main className="app-frame">
      <GlassSurface className="settings-surface">
        <WindowBar settings onError={setError} />
        <div className="settings-content">
          <SlidersHorizontal
            size={30}
            strokeWidth={1.2}
            className="text-accent"
          />
          <span className="eyebrow">A space for the details</span>
          <h1>Make it yours.</h1>
          <Text>
            Theme, layout and startup preferences will live here as Aura grows.
          </Text>
          <div className="settings-note">
            This is the settings window foundation.
            <br />
            Preferences are not saved in this phase.
          </div>
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
        </div>
      </GlassSurface>
    </main>
  );
}
