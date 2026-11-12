import type { WidgetDefinition } from '../../../features/widget-engine/types';
import { SystemMonitorWidget } from './SystemMonitorWidget';

export const systemMonitorDefinition: WidgetDefinition = {
  kind: 'system-monitor',
  displayName: 'System monitor',
  component: SystemMonitorWidget,
  defaultDimensions: { width: 448, height: 80 },
  minimumDimensions: { width: 360, height: 76 },
  defaultPosition: { x: 280, y: 48 },
  defaultConfiguration: {},
  defaultThemeId: 'aura-dark',
};
