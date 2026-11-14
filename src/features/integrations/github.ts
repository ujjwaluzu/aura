import { invoke } from '@tauri-apps/api/core';
import { isDesktop } from '../../lib/native';
import type { GithubDestination, GithubState } from '../../types/github';

export const githubPreview: GithubState = {
  revision: -1,
  status: 'unavailable',
  configured: false,
  refreshing: false,
  stale: false,
  calendar: null,
  authorization: null,
  retryAt: null,
  message: 'Open Aura’s desktop application to connect GitHub.',
};
function desktop<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (!isDesktop()) return Promise.reject(new Error(githubPreview.message!));
  return invoke<T>(command, args);
}
export const githubStatus = () => desktop<GithubState>('github_status');
export const githubConnect = () =>
  desktop<GithubState>('github_start_authorization');
export const githubCancel = () =>
  desktop<GithubState>('github_cancel_authorization');
export const githubRefresh = (onlyIfStale = false) =>
  desktop<GithubState>('github_refresh', { onlyIfStale });
export const githubDisconnect = () => desktop<GithubState>('github_disconnect');
export const githubOpen = (destination: GithubDestination) =>
  desktop<void>('github_open_destination', { destination });
