import { invoke } from '@tauri-apps/api/core';
import type { SystemSnapshot } from '../../types/system-monitor';
import { isDesktop } from '../../lib/native';

export function getSystemSnapshot(): Promise<SystemSnapshot> {
  if (!isDesktop())
    return Promise.reject(
      new Error('System usage is available in the desktop application.'),
    );
  return invoke<SystemSnapshot>('get_system_snapshot');
}
