export interface WidgetTheme {
  id: string;
  name: string;
  /** Allowlisted CSS custom-property overrides, validated before applying. */
  tokens: Partial<
    Record<
      '--color-accent' | '--color-text' | '--glass-opacity' | '--blur-surface',
      string
    >
  >;
}
