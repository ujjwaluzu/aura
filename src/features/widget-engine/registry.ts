import type { WidgetDefinition, WidgetKind } from './types';
import { clockDefinition } from '../../components/widgets/clock/definition';
import { systemMonitorDefinition } from '../../components/widgets/system-monitor/definition';

/** Add a definition when its widget is implemented. No dynamic plugin loading. */
const definitions: readonly WidgetDefinition[] = [
  clockDefinition,
  systemMonitorDefinition,
];

export const widgetRegistry: ReadonlyMap<WidgetKind, WidgetDefinition> =
  new Map(definitions.map((definition) => [definition.kind, definition]));
