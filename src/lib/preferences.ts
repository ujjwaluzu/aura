import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { isDesktop } from './native';
import { resolveThemeId, themes } from '../features/themes/catalog';
import { layouts, resolveLayoutId } from '../features/layouts/catalog';
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

function normalize(value: unknown): Preferences | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Preferences;
  const layoutId = resolveLayoutId(item.layoutId);
  const themeId = resolveThemeId(item.themeId);
  if (!layoutId || !themeId) return null;
  const next = { ...item, layoutId, themeId };
  return valid(next) ? next : null;
}

function previewPreferences(): Preferences {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(previewKey) ?? 'null',
    );
    return normalize(value) ?? defaultPreferences;
  } catch {
    return defaultPreferences;
  }
}

export async function getPreferences(): Promise<Preferences> {
  const preferences = isDesktop()
    ? await invoke<Preferences>('get_preferences')
    : previewPreferences();
  const normalized = normalize(preferences);
  if (!normalized) throw new Error('Preferences could not be loaded.');
  return normalized;
}

export async function updatePreferences(
  patch: PreferencesPatch,
): Promise<Preferences> {
  if (isDesktop()) {
    const next = normalize(
      await invoke<Preferences>('set_preferences', { patch }),
    );
    if (!next) throw new Error('Preferences could not be loaded.');
    return next;
  }
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
        const normalized = normalize(event.payload);
        if (normalized) callback(normalized);
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
