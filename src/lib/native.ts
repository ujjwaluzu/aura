import { invoke, isTauri } from '@tauri-apps/api/core';
import type { FoundationInfo } from '../types/native';

export const isDesktop = () => isTauri();

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  )
    return error.message;
  return typeof error === 'string'
    ? error
    : 'The native operation could not be completed.';
}

export async function getFoundationInfo(): Promise<FoundationInfo> {
  if (!isDesktop())
    throw new Error('Open the desktop application to connect to Rust.');
  const info = await invoke<FoundationInfo>('get_foundation_info', {
    protocolVersion: 1,
  });
  if (info.protocolVersion !== 1)
    throw new Error('Frontend and native versions do not match. Restart Aura.');
  return info;
}

export type MusicSection = 'player' | 'search' | 'playlists' | 'liked';
export type SettingsDestination = 'theme' | 'layout' | `music-${MusicSection}`;
export async function openSettings(
  destination?: SettingsDestination,
): Promise<void> {
  if (!isDesktop())
    throw new Error(
      'Settings opens in a separate window in the desktop application.',
    );
  await invoke('open_settings', { destination: destination ?? null });
}

/** User-facing recovery; raw structured errors stay in the window diagnostics. */
export function musicError(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String(error.code)
      : '';
  if (/TIMEOUT/.test(code))
    return 'This took too long. Check your connection and try again.';
  if (/EXPIRED|AUTH/.test(code))
    return 'Your authorization expired. Reconnect your account in Player.';
  if (/NETWORK|OFFLINE/.test(code))
    return 'Could not reach YouTube. Check your connection and refresh.';
  if (/VOLUME/.test(code))
    return 'Volume is unavailable. Try again while the browser is playing audio.';
  if (/FORBIDDEN|READ_ONLY/.test(code))
    return 'This action is unavailable for this account or playlist.';
  return 'The action could not finish. Refresh to check the result.';
}
