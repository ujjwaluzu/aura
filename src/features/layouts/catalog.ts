export type LayoutModule = 'clock' | 'stats' | 'music';
export const layouts = [
  {
    id: 'clock-left-stats-music',
    primary: 'clock',
    side: 'left',
    top: 'stats',
    bottom: 'music',
    title: 'Clock left',
    description: 'CPU / RAM above music',
  },
  {
    id: 'clock-left-music-stats',
    primary: 'clock',
    side: 'left',
    top: 'music',
    bottom: 'stats',
    title: 'Clock left',
    description: 'Music above CPU / RAM',
  },
  {
    id: 'clock-right-stats-music',
    primary: 'clock',
    side: 'right',
    top: 'stats',
    bottom: 'music',
    title: 'Clock right',
    description: 'CPU / RAM above music',
  },
  {
    id: 'clock-right-music-stats',
    primary: 'clock',
    side: 'right',
    top: 'music',
    bottom: 'stats',
    title: 'Clock right',
    description: 'Music above CPU / RAM',
  },
  {
    id: 'music-focus-clock-left',
    primary: 'clock',
    side: 'left',
    top: 'music',
    bottom: 'music',
    focus: true,
    title: 'Music focus · clock left',
    description: 'Full music player with clock · no CPU / RAM',
  },
  {
    id: 'music-focus-clock-right',
    primary: 'clock',
    side: 'right',
    top: 'music',
    bottom: 'music',
    focus: true,
    title: 'Music focus · clock right',
    description: 'Full music player with clock · no CPU / RAM',
  },
] as const;

export type LayoutDefinition = (typeof layouts)[number] & {
  readonly focus?: boolean;
};
export type LayoutId = LayoutDefinition['id'];
export const getLayout = (id: LayoutId): LayoutDefinition =>
  layouts.find((layout) => layout.id === id) ?? layouts[0];

// Retired saved layouts keep the user's theme and fall back to a Clock arrangement.
const retiredLayouts: Record<string, LayoutId> = {
  'stats-left-clock-music': 'clock-left-stats-music',
  'stats-left-music-clock': 'clock-left-music-stats',
  'stats-right-clock-music': 'clock-right-stats-music',
  'stats-right-music-clock': 'clock-right-music-stats',
  'music-left-clock-stats': 'clock-left-music-stats',
  'music-left-stats-clock': 'clock-left-stats-music',
  'music-right-clock-stats': 'clock-right-music-stats',
  'music-right-stats-clock': 'clock-right-stats-music',
};
export function resolveLayoutId(value: unknown): LayoutId | null {
  if (typeof value !== 'string') return null;
  return (
    layouts.find((layout) => layout.id === value)?.id ??
    (Object.hasOwn(retiredLayouts, value) ? retiredLayouts[value]! : null)
  );
}
