import type { WidgetDefinition, WidgetKind } from './types';

/** Add a definition when its widget is implemented. No dynamic plugin loading. */
const definitions: readonly WidgetDefinition[] = [];

export const widgetRegistry: ReadonlyMap<WidgetKind, WidgetDefinition> =
  new Map(definitions.map((definition) => [definition.kind, definition]));
