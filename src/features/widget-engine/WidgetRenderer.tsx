import { widgetRegistry } from './registry';
import type { WidgetInstance } from './types';

/** Layout owns positioning; this renderer only resolves visible widget content. */
export function WidgetRenderer({ instance }: { instance: WidgetInstance }) {
  const definition = widgetRegistry.get(instance.kind);
  if (!instance.visible || !definition) return null;
  const Component = definition.component;
  return (
    <Component
      instanceId={instance.id}
      configuration={instance.configuration}
      themeId={instance.themeId}
    />
  );
}
