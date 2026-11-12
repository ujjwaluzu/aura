import type { WidgetDefinition } from '../../../features/widget-engine/types';
import { MusicConnections } from './MusicConnections';

export const musicDefinition: WidgetDefinition = {
  kind: 'music-player',
  displayName: 'Music connections',
  component: MusicConnections,
  defaultDimensions: { width: 448, height: 92 },
  minimumDimensions: { width: 360, height: 88 },
  defaultPosition: { x: 280, y: 138 },
  defaultConfiguration: {},
  defaultThemeId: 'aura-dark',
};
