import type { WidgetDefinition } from '../../../features/widget-engine/types';
import { SystemMonitorWidget } from './SystemMonitorWidget';

export const systemMonitorDefinition: WidgetDefinition = {
  kind: 'system-monitor',
  displayName: 'System monitor',
  component: SystemMonitorWidget,
  defaultDimensions: { width: 336, height: 188 },
  minimumDimensions: { width: 260, height: 160 },
  defaultPosition: { x: 279, y: 0 },
  defaultConfiguration: {},
  defaultThemeId: 'aura-dark',
};
