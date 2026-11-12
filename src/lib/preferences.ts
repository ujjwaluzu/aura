import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { isDesktop } from './native';
import { themes } from '../features/themes/catalog';
import { layouts } from '../features/layouts/catalog';
import {
  defaultPreferences,
  type Preferences,
  type PreferencesPatch,
} from '../types/preferences';

const previewKey = 'aura:preview-preferences';

function valid(value: unknown): value is Preferences {
  if (!value || typeof value !== 'object') return false;
  const item = value as Preferences;
  return (
    themes.some((theme) => theme.id === item.themeId) &&
    layouts.some((layout) => layout.id === item.layoutId) &&
    Number.isSafeInteger(item.revision) &&
    item.revision >= 0
  );
}

function previewPreferences(): Preferences {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(previewKey) ?? 'null',
    );
    return valid(value) ? value : defaultPreferences;
  } catch {
    return defaultPreferences;
  }
}

export async function getPreferences(): Promise<Preferences> {
  const preferences = isDesktop()
    ? await invoke<Preferences>('get_preferences')
    : previewPreferences();
  if (!valid(preferences)) throw new Error('Preferences could not be loaded.');
  return preferences;
}

export async function updatePreferences(
  patch: PreferencesPatch,
): Promise<Preferences> {
  if (isDesktop()) return invoke<Preferences>('set_preferences', { patch });
  // Browser development preview only; production persistence is owned by Rust.
  const current = previewPreferences();
  const next: Preferences = {
    ...current,
    ...patch,
    revision: current.revision + 1,
    warning: null,
  };
  if (!valid(next))
    throw new Error('Choose one of the available themes and layouts.');
  localStorage.setItem(previewKey, JSON.stringify(next));
  window.dispatchEvent(
    new CustomEvent('aura:preview-preferences', { detail: next }),
  );
  return next;
}

export async function subscribePreferences(
  callback: (preferences: Preferences) => void,
): Promise<UnlistenFn> {
  if (isDesktop())
    return listen<Preferences>(
      'aura://preferences-changed',
      (event) => {
        if (valid(event.payload)) callback(event.payload);
      },
      { target: { kind: 'Window', label: getCurrentWindow().label } },
    );
  const changed = () => callback(previewPreferences());
  window.addEventListener('storage', changed);
  window.addEventListener('aura:preview-preferences', changed);
  return () => {
    window.removeEventListener('storage', changed);
    window.removeEventListener('aura:preview-preferences', changed);
  };
}
