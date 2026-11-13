export interface MusicAccountState {
  revision: number;
  status:
    'unavailable' | 'disconnected' | 'connecting' | 'connected' | 'expired';
  name: string | null;
  channelId: string | null;
  message: string | null;
  validationBuild: boolean;
}
export interface MusicTrack {
  id: string | null;
  title: string;
  channelTitle: string;
  duration: string | null;
  artworkUrl: string | null;
  liked: boolean | null;
  available: boolean;
  itemId: string | null;
  position: number | null;
}
export interface MusicPlaylist {
  id: string;
  title: string;
  editable: boolean;
  artworkUrl: string | null;
}
export interface MusicPage {
  tracks: MusicTrack[];
  playlists: MusicPlaylist[];
  playlist: MusicPlaylist | null;
  nextPageToken: string | null;
}
export type MusicQuery =
  | {
      kind: 'search';
      query: string;
      filter: 'music' | 'all';
      pageToken?: string | undefined;
    }
  | { kind: 'liked' | 'playlists'; pageToken?: string | undefined }
  | { kind: 'playlist'; id: string; pageToken?: string | undefined };
export type MusicChange =
  | { kind: 'like'; id: string; liked: boolean }
  | { kind: 'create'; title: string }
  | { kind: 'rename'; id: string; title: string }
  | { kind: 'add'; id: string; trackId: string }
  | { kind: 'remove'; id: string; itemId: string }
  | { kind: 'move'; id: string; itemId: string; direction: 'up' | 'down' };
export interface PlaybackSession {
  id: string;
  source: string;
  title: string;
  artist: string;
  playing: boolean;
  positionSeconds: number;
  updatedAtUnixMs: number;
  durationSeconds: number;
  artwork: string | null;
  canPlay: boolean;
  canPause: boolean;
  canPrevious: boolean;
  canNext: boolean;
  canSeek: boolean;
}
export interface PlaybackState {
  sessions: PlaybackSession[];
  selectedId: string | null;
  message: string | null;
}
export type MusicTarget = (
  { kind: 'home' } | { kind: 'track' | 'playlist'; id: string }
) & { player?: 'youtubeMusic' | 'youtube' };
export type MediaAction = 'play' | 'pause' | 'previous' | 'next';
