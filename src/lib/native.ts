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

export async function openSettings(): Promise<void> {
  if (!isDesktop())
    throw new Error(
      'Settings opens in a separate window in the desktop application.',
    );
  await invoke('open_settings');
}
