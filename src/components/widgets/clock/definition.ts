import type { WidgetDefinition } from '../../../features/widget-engine/types';
import { ClockWidget } from './ClockWidget';

export const clockDefinition: WidgetDefinition = {
  kind: 'clock',
  displayName: 'Clock',
  component: ClockWidget,
  defaultDimensions: { width: 278, height: 188 },
  minimumDimensions: { width: 240, height: 160 },
  defaultPosition: { x: 0, y: 0 },
  defaultConfiguration: { hour12: false },
  defaultThemeId: 'aura-dark',
};
