import type { ComponentType } from 'react';

export type WidgetKind = 'clock' | 'system-monitor' | 'music-player' | 'notes';
export type WidgetConfig = Readonly<
  Record<string, string | number | boolean | null>
>;
export interface Dimensions {
  width: number;
  height: number;
}
export interface Position {
  x: number;
  y: number;
}

export interface WidgetProps {
  instanceId: string;
  configuration: WidgetConfig;
  themeId: string;
}

/** A definition describes one widget type. State belongs to its instances. */
export interface WidgetDefinition {
  kind: WidgetKind;
  displayName: string;
  component: ComponentType<WidgetProps>;
  defaultDimensions: Dimensions;
  minimumDimensions: Dimensions;
  defaultPosition: Position;
  defaultConfiguration: WidgetConfig;
  defaultThemeId: string;
}

/** Coordinates and dimensions use logical pixels, relative to a host monitor. */
export interface WidgetInstance {
  id: string;
  kind: WidgetKind;
  dimensions: Dimensions;
  position: Position;
  configuration: WidgetConfig;
  visible: boolean;
  themeId: string;
}
