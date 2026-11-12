import type { WidgetDefinition } from '../../../features/widget-engine/types';
import { SystemMonitorWidget } from './SystemMonitorWidget';

export const systemMonitorDefinition: WidgetDefinition = {
  kind: 'system-monitor',
  displayName: 'System monitor',
  component: SystemMonitorWidget,
  defaultDimensions: { width: 600, height: 106 },
  minimumDimensions: { width: 460, height: 96 },
  defaultPosition: { x: 420, y: 62 },
  defaultConfiguration: {},
  defaultThemeId: 'aura-dark',
};
