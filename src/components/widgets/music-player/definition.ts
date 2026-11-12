import type { WidgetDefinition } from '../../../features/widget-engine/types';
import { MusicConnections } from './MusicConnections';

export const musicDefinition: WidgetDefinition = {
  kind: 'music-player',
  displayName: 'Music connections',
  component: MusicConnections,
  defaultDimensions: { width: 600, height: 154 },
  minimumDimensions: { width: 460, height: 134 },
  defaultPosition: { x: 420, y: 180 },
  defaultConfiguration: {},
  defaultThemeId: 'aura-dark',
};
