import type { ThemeId } from '../features/themes/catalog';
import type { LayoutId } from '../features/layouts/catalog';

export interface Preferences {
  themeId: ThemeId;
  layoutId: LayoutId;
  revision: number;
  warning: string | null;
}
export type PreferencesPatch = Partial<
  Pick<Preferences, 'themeId' | 'layoutId'>
>;
export const defaultPreferences: Preferences = {
  themeId: 'faulty-terminal',
  layoutId: 'clock-left-stats-music',
  revision: 0,
  warning: null,
};
