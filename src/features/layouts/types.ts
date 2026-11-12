import type { WidgetInstance } from '../widget-engine/types';

export interface SavedLayout {
  schemaVersion: 1;
  id: string;
  name: string;
  monitorId: string;
  widgets: WidgetInstance[];
}
