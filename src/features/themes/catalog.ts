export const themes = [
  {
    id: 'faulty-terminal',
    name: 'Faulty Terminal',
    description: 'Green phosphor, scanlines and interactive glitches',
    hue: 113,
  },
] as const;

export type ThemeId = (typeof themes)[number]['id'];

/** Retired palettes keep the user's layout when upgrading. */
export function resolveThemeId(value: unknown): ThemeId | null {
  if (value === 'faulty-terminal') return value;
  return ['violet', 'ocean', 'jade', 'amber', 'rose'].includes(String(value))
    ? 'faulty-terminal'
    : null;
}
