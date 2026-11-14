export const themes = [
  {
    id: 'faulty-terminal',
    name: 'Faulty Terminal',
    description: 'Green phosphor, scanlines and interactive glitches',
    hue: 113,
  },
  {
    id: 'galaxy',
    name: 'Galaxy',
    description: 'Twinkling stars, gentle rotation and click-to-warp flight',
    hue: 225,
  },
  {
    id: 'letter-glitch',
    name: 'Letter Glitch',
    description: 'Letters, mint flashes and click tears',
    hue: 152,
  },
  {
    id: 'pixel-snow',
    name: 'Pixel Snow',
    description: 'Falling snowflakes with a soft glow',
    hue: 202,
  },
] as const;

export type ThemeId = (typeof themes)[number]['id'];

/** Retired palettes keep the user's layout when upgrading. */
export function resolveThemeId(value: unknown): ThemeId | null {
  const theme = themes.find((item) => item.id === value);
  if (theme) return theme.id;
  return ['violet', 'ocean', 'jade', 'amber', 'rose'].includes(String(value))
    ? 'faulty-terminal'
    : null;
}
