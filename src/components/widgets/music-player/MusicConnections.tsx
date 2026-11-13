import { GlassSurface } from '../../ui/GlassSurface';
import type { WidgetProps } from '../../../features/widget-engine/types';
import { useMusic } from '../../../hooks/useMusic';
import { usePreferences } from '../../../hooks/usePreferences';
import { getLayout } from '../../../features/layouts/catalog';
import { PlaybackControls } from '../../music/PlaybackControls';
export function MusicConnections({ themeId }: WidgetProps) {
  const music = useMusic();
  const { preferences } = usePreferences();
  const layout = getLayout(preferences.layoutId);
  const presentation = layout.focus ? 'focus' : 'horizontal';
  return (
    <GlassSurface
      variant="inset"
      opacity={0.35}
      className="music-connect-card"
      aria-label="Music player"
      data-theme={themeId}
    >
      <PlaybackControls playback={music.playback} presentation={presentation} />
    </GlassSurface>
  );
}
