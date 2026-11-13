import { invoke } from '@tauri-apps/api/core';
import { isDesktop } from '../../lib/native';
import type {
  MediaAction,
  MusicAccountState,
  MusicChange,
  MusicPage,
  MusicQuery,
  MusicTarget,
  PlaybackState,
} from '../../types/music';

export const unavailableAccount: MusicAccountState = {
  revision: 0,
  status: 'unavailable',
  name: null,
  channelId: null,
  validationBuild: false,
  message:
    'YouTube account connection is unavailable until Aura’s Google client, official API integration and public release requirements are validated.',
};
export const emptyPlayback: PlaybackState = {
  sessions: [],
  selectedId: null,
  message: null,
};
const desktop = <T>(command: string, args?: Record<string, unknown>) => {
  if (!isDesktop())
    return Promise.reject(
      new Error('Open Aura’s desktop application to use music services.'),
    );
  return invoke<T>(command, args);
};
export const openMusic = () => desktop<void>('open_music');
export const accountStatus = () =>
  desktop<MusicAccountState>('music_account_status');
export const connectMusic = () => desktop<MusicAccountState>('music_connect');
export const disconnectMusic = () =>
  desktop<MusicAccountState>('music_disconnect');
export const browseMusic = (query: MusicQuery) =>
  desktop<MusicPage>('music_browse', { query });
export const changeMusic = (change: MusicChange) =>
  desktop<void>('music_change', { change });
export const openPlayer = (target: MusicTarget) =>
  desktop<void>('music_open_player', { target });
export const getArtwork = (url: string) =>
  desktop<string>('music_artwork', { url });
export const playbackStatus = () =>
  desktop<PlaybackState>('music_playback_status');
export const selectSession = (id: string | null) =>
  desktop<void>('music_select_session', { id });
export const mediaControl = (action: MediaAction) =>
  desktop<void>('music_media_control', { action });
export const mediaSeek = (positionSeconds: number) =>
  desktop<void>('music_media_seek', { positionSeconds });
export const mediaVolume = (level?: number) =>
  desktop<number>('music_media_volume', { level: level ?? null });

/** Preserve duplicate playlist videos by their unique occurrence IDs. */
export function appendMusicPage(
  previous: MusicPage | null,
  next: MusicPage,
): MusicPage {
  if (!previous) return next;
  const tracks = new Set<string>();
  const playlists = new Set<string>();
  return {
    ...next,
    tracks: [...previous.tracks, ...next.tracks].filter((track, index) => {
      const key =
        track.itemId ?? track.id ?? `unavailable-${track.position ?? index}`;
      if (tracks.has(key)) return false;
      tracks.add(key);
      return true;
    }),
    playlists: [...previous.playlists, ...next.playlists].filter((playlist) => {
      if (playlists.has(playlist.id)) return false;
      playlists.add(playlist.id);
      return true;
    }),
  };
}
