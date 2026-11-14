import type { Page } from '@playwright/test';

export async function mockMusic(
  page: Page,
  options: {
    account?: string;
    failedWrite?: boolean;
    selected?: boolean;
    failedBrowse?: boolean;
    empty?: boolean;
    connectError?: string;
    accountError?: boolean;
    playbackError?: boolean;
    volumeError?: boolean;
    volumeFailures?: number;
    volumeWriteFailure?: boolean;
    volumeErrorCode?: string;
    source?: string;
    artwork?: boolean;
    accountLoading?: boolean;
    playbackLoading?: boolean;
    connectPending?: boolean;
    sessionCount?: number;
    failedSelect?: boolean;
    largeLibrary?: boolean;
    foundationError?: string;
    accountName?: string;
  } = {},
) {
  await page.addInitScript((options) => {
    let account = {
      status: options.account ?? 'connected',
      name: options.accountName ?? 'Test Listener',
      channelId: 'UCfixture',
      message: null,
      validationBuild: true,
    };
    let preferences = {
      themeId: 'violet',
      layoutId: 'clock-left-stats-music',
      revision: 0,
      warning: null,
    };
    const callbacks = new Map<number, (event: unknown) => void>();
    const listeners = new Map<number, { event: string; handler: number }>();
    let next = 1;
    const calls: { command: string; args: Record<string, unknown> }[] = [];
    const track = {
      id: 'dQw4w9WgXcQ',
      title:
        'A very long track title for the compact desktop widget and playlist',
      channelTitle: 'Test Artist',
      position: 0,
      duration: '3:12',
      artworkUrl: null,
      liked: false,
      available: true,
      itemId: 'first',
    };
    const playback = {
      sessions: [
        {
          id: 'browser-1',
          source: options.source ?? 'chrome.exe',
          title: track.title,
          artist: 'Test Artist',
          playing: true,
          positionSeconds: 35,
          updatedAtUnixMs: Date.now(),
          durationSeconds: 192,
          artwork: options.artwork
            ? 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect width="100" height="100" fill="%237e719f"/%3E%3C/svg%3E'
            : null,
          canPlay: true,
          canPause: true,
          canPrevious: false,
          canNext: false,
          canSeek: true,
        },
        {
          id: 'browser-2',
          source: 'msedge.exe',
          title: 'A podcast in another browser',
          artist: 'Other',
          playing: false,
          positionSeconds: 0,
          updatedAtUnixMs: Date.now(),
          durationSeconds: 99,
          artwork: options.artwork
            ? 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect width="100" height="100" fill="%237e719f"/%3E%3C/svg%3E'
            : null,
          canPlay: true,
          canPause: false,
          canPrevious: true,
          canNext: true,
          canSeek: true,
        },
      ],
      selectedId: options.selected ? 'browser-1' : (null as string | null),
      message: null,
    };
    if (options.sessionCount !== undefined)
      playback.sessions = playback.sessions.slice(0, options.sessionCount);
    let volumeAvailable = !options.volumeError;
    let volumeFailures = options.volumeFailures ?? 0;
    let failVolumeWrite = options.volumeWriteFailure ?? false;
    let volumeLevel = 0.5;
    let holdVolumeRead = false;
    let releaseVolumeRead: (() => void) | null = null;
    const emit = (event: string, payload: unknown) => {
      if (
        event === 'aura://playback-changed' &&
        typeof payload === 'object' &&
        payload !== null
      )
        Object.assign(playback, payload);
      for (const [id, listener] of listeners)
        if (listener.event === event)
          callbacks.get(listener.handler)?.({ event, id, payload });
    };
    Object.assign(window, {
      isTauri: true,
      musicTest: {
        calls,
        emit,
        setVolumeAvailable: (available: boolean) => {
          volumeAvailable = available;
        },
        holdNextVolumeRead: () => {
          holdVolumeRead = true;
        },
        isVolumeReadHeld: () => releaseVolumeRead !== null,
        releaseVolumeRead: () => {
          releaseVolumeRead?.();
          releaseVolumeRead = null;
        },
        setRating: (liked: boolean) => {
          track.liked = liked;
        },
        setPreferences: (patch: Partial<typeof preferences>) => {
          preferences = {
            ...preferences,
            ...patch,
            revision: preferences.revision + 1,
          };
          emit('aura://preferences-changed', preferences);
        },
      },
      __TAURI_EVENT_PLUGIN_INTERNALS__: { unregisterListener: () => {} },
      __TAURI_INTERNALS__: {
        metadata: {
          currentWindow: {
            label: location.search ? 'settings' : 'widget-host',
          },
        },
        transformCallback: (callback: (event: unknown) => void) => {
          const id = next++;
          callbacks.set(id, callback);
          return id;
        },
        unregisterCallback: (id: number) => callbacks.delete(id),
        invoke: async (command: string, args: Record<string, unknown> = {}) => {
          calls.push({ command, args });
          if (command === 'plugin:event|listen') {
            const id = next++;
            listeners.set(id, {
              event: args.event as string,
              handler: args.handler as number,
            });
            return id;
          }
          if (command === 'plugin:event|unlisten') {
            listeners.delete(args.eventId as number);
            return;
          }
          if (command === 'get_preferences') return preferences;
          if (command === 'get_foundation_info') {
            if (options.foundationError)
              throw {
                code: 'NATIVE_FAILURE',
                message: options.foundationError,
              };
            return {
              protocolVersion: 1,
              appName: 'Aura',
              version: 'test',
              platform: 'windows',
              windowMode: 'transparent-host',
            };
          }
          if (command === 'get_system_snapshot')
            return {
              cpuPercent: 20,
              memoryPercent: 40,
              usedMemoryBytes: 4,
              totalMemoryBytes: 10,
              sampledAtUnixMs: Date.now(),
            };
          if (command === 'music_account_status') {
            if (options.accountLoading) return new Promise(() => {});
            if (options.accountError)
              throw { code: 'OFFLINE', message: 'Status request failed' };
            return account;
          }
          if (command === 'music_playback_status') {
            if (options.playbackLoading) return new Promise(() => {});
            if (options.playbackError)
              throw {
                code: 'MEDIA_UNAVAILABLE',
                message: 'Playback request failed',
              };
            return playback;
          }
          if (command === 'music_media_volume') {
            if (args.sessionId && args.sessionId !== playback.selectedId)
              throw {
                code: 'MEDIA_SESSION_CHANGED',
                message: 'The selected player changed.',
              };
            const write = typeof args.level === 'number';
            if (
              !volumeAvailable ||
              (!write && volumeFailures-- > 0) ||
              (write && failVolumeWrite)
            ) {
              failVolumeWrite = false;
              throw {
                code:
                  options.volumeErrorCode ??
                  (volumeAvailable
                    ? 'BROWSER_VOLUME_PENDING'
                    : 'BROWSER_VOLUME_UNAVAILABLE'),
                message: 'Volume failed',
              };
            }
            if (write) volumeLevel = args.level as number;
            if (!write && holdVolumeRead) {
              holdVolumeRead = false;
              const captured = volumeLevel;
              return new Promise((resolve) => {
                releaseVolumeRead = () => resolve(captured);
              });
            }
            return volumeLevel;
          }
          if (command === 'music_connect') {
            if (options.connectPending) return new Promise(() => {});
            if (options.connectError)
              throw { code: 'OPEN_BROWSER', message: options.connectError };
            account = { ...account, status: 'connected' };
            emit('aura://music-account-changed', account);
            return account;
          }
          if (command === 'music_disconnect') {
            account = { ...account, status: 'disconnected', name: '' };
            emit('aura://music-account-changed', account);
            return account;
          }
          if (command === 'music_select_session') {
            if (options.failedSelect)
              throw {
                code: 'MEDIA_UNAVAILABLE',
                message: 'The player closed before selection.',
              };
            playback.selectedId = args.id as string | null;
            emit('aura://playback-changed', playback);
            return;
          }
          if (command === 'music_browse') {
            if (options.failedBrowse)
              throw { code: 'OFFLINE', message: 'YouTube Music is offline.' };
            if (options.empty)
              return {
                tracks: [],
                playlists: [],
                playlist: null,
                nextPageToken: null,
              };
            const query = args.query as {
              kind: string;
              id?: string;
              pageToken?: string;
            };
            if (query.kind === 'playlists')
              return {
                tracks: [],
                playlists: options.largeLibrary
                  ? Array.from({ length: 18 }, (_, i) => ({
                      id: i === 0 ? 'PLowned' : `PLfixture${i}`,
                      title: `Playlist ${i + 1} with a long title`,
                      editable: true,
                      artworkUrl: null,
                    }))
                  : [
                      {
                        id: 'PLowned',
                        title: 'My private playlist',
                        editable: false,
                        artworkUrl: null,
                      },
                      {
                        id: 'PLother',
                        title: 'Someone else’s playlist',
                        editable: false,
                        artworkUrl: null,
                      },
                    ],
                playlist: null,
                nextPageToken: null,
              };
            return {
              tracks: options.largeLibrary
                ? Array.from({ length: 50 }, (_, i) => ({
                    ...track,
                    id: `video${i}`,
                    itemId: `item${i}`,
                    title: `Video ${i + 1} with a long title`,
                    position: i,
                  }))
                : query.kind === 'playlist'
                  ? query.pageToken
                    ? [
                        track,
                        {
                          ...track,
                          title: 'Third Song',
                          itemId: 'third',
                          position: 2,
                        },
                      ]
                    : [
                        track,
                        { ...track, title: 'Second Song', itemId: 'second' },
                      ]
                  : [
                      track,
                      {
                        ...track,
                        title: 'Unavailable Song',
                        id: null,
                        itemId: null,
                        available: false,
                      },
                    ],
              playlists: [],
              playlist:
                query.kind === 'playlist'
                  ? {
                      id: query.id,
                      title: 'Playlist details',
                      editable: query.id === 'PLowned',
                      artworkUrl: null,
                    }
                  : null,
              nextPageToken:
                options.largeLibrary || query.pageToken ? null : 'next-page',
            };
          }
          if (command === 'music_change' && options.failedWrite)
            throw {
              code: 'OFFLINE',
              message: 'The service did not confirm this change.',
            };
          if (command === 'music_change') {
            const change = args.change as { kind: string; liked?: boolean };
            if (change.kind === 'like') track.liked = change.liked === true;
          }
          return;
        },
      },
    });
  }, options);
}
