export const themes = [
  {
    id: 'violet',
    name: 'Violet',
    description: 'The original lavender glow',
    hue: 266,
  },
  {
    id: 'ocean',
    name: 'Ocean',
    description: 'Cool blue, clear and calm',
    hue: 210,
  },
  { id: 'jade', name: 'Jade', description: 'A soft green glow', hue: 155 },
  { id: 'amber', name: 'Amber', description: 'Warm gold after dark', hue: 38 },
  { id: 'rose', name: 'Rose', description: 'A muted rose finish', hue: 338 },
] as const;

export type ThemeId = (typeof themes)[number]['id'];
