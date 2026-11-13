import { expect, test, type Page } from '@playwright/test';
import { layouts } from '../src/features/layouts/catalog';
import { themes } from '../src/features/themes/catalog';

async function mockMusic(
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
    artwork?: boolean;
    accountLoading?: boolean;
    playbackLoading?: boolean;
    connectPending?: boolean;
  } = {},
) {
  await page.addInitScript((options) => {
    let account = {
      status: options.account ?? 'connected',
      name: 'Test Listener',
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
          source: 'chrome.exe',
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
    const emit = (event: string, payload: unknown) => {
      for (const [id, listener] of listeners)
        if (listener.event === event)
          callbacks.get(listener.handler)?.({ event, id, payload });
    };
    Object.assign(window, {
      isTauri: true,
      musicTest: {
        calls,
        emit,
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
          if (command === 'get_foundation_info')
            return {
              protocolVersion: 1,
              appName: 'Aura',
              version: 'test',
              platform: 'windows',
              windowMode: 'transparent-host',
            };
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
            if (options.volumeError)
              throw {
                code: 'BROWSER_VOLUME_UNAVAILABLE',
                message: 'Volume failed',
              };
            return args.level ?? 0.5;
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
                playlists: [
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
              tracks:
                query.kind === 'playlist'
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
              nextPageToken: query.pageToken ? null : 'next-page',
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

test('music preview is opaque and account authorization stays gated', async ({
  page,
}) => {
  await page.setViewportSize({ width: 960, height: 680 });
  await page.setViewportSize({ width: 960, height: 720 });
  await page.goto('/?window=settings&destination=music-player');
  await expect(
    page.getByRole('heading', { name: 'Now playing' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Connect YouTube', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText(/Aura authorization and the official player/),
  ).toBeVisible();
  await expect(page.locator('body')).toHaveCSS(
    'background-color',
    'rgb(17, 19, 24)',
  );
  await expect(page.getByLabel('Windows media session')).toHaveValue('');
  await page.screenshot({
    path: 'artifacts/aura-music-onboarding.png',
    fullPage: true,
  });
});

test('failed browser activation exits waiting and shows an actionable error', async ({
  page,
}) => {
  await mockMusic(page, {
    account: 'disconnected',
    connectError: 'Windows could not open your default browser.',
  });
  await page.setViewportSize({ width: 960, height: 720 });
  await page.goto('/?window=settings&destination=music-player');
  await page
    .getByRole('button', { name: 'Connect YouTube', exact: true })
    .click();
  await expect(page.getByRole('alert')).toHaveText(
    'Account request failed. Refresh status or try connecting again.',
  );
  await expect(
    page.getByRole('button', { name: 'Retry connection', exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole('button', { name: 'Cancel authorization', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: /Waiting for Google/ }),
  ).toHaveCount(0);
});

test('connect verifies account and disconnect removes account content', async ({
  page,
}) => {
  await mockMusic(page, { account: 'disconnected' });
  await page.setViewportSize({ width: 960, height: 680 });
  await page.setViewportSize({ width: 960, height: 720 });
  await page.goto('/?window=settings&destination=music-player');
  await page
    .getByRole('button', { name: 'Connect YouTube', exact: true })
    .click();
  await expect(page.getByText('Connected as Test Listener')).toBeVisible();
  await page.getByRole('button', { name: 'Playlists', exact: true }).click();
  await expect(
    page.getByRole('button', { name: /My private playlist/ }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Player', exact: true }).click();
  await page.getByRole('button', { name: 'Disconnect account' }).click();
  await expect(
    page.getByRole('list', { name: 'Videos', exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText('Test Listener')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Connect YouTube', exact: true }),
  ).toBeVisible();
});

test('browse, search and provider playback use typed commands', async ({
  page,
}) => {
  await mockMusic(page);
  await page.setViewportSize({ width: 960, height: 720 });
  await page.goto('/?window=settings&destination=music-playlists');
  await page.getByRole('button', { name: 'Liked videos', exact: true }).click();
  await expect(
    page.getByRole('list', { name: 'Videos', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Play Unavailable Song', exact: true }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByLabel('Search videos').fill('Test Artist');
  await page
    .getByRole('button', { name: 'Search', exact: true })
    .last()
    .click();
  await expect(
    page.getByRole('list', { name: 'Videos', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: /^Play A very long/ }).click();
  const calls = await page.evaluate(
    () =>
      (window as unknown as { musicTest: { calls: unknown[] } }).musicTest
        .calls,
  );
  expect(calls).toContainEqual({
    command: 'music_open_player',
    args: { target: { kind: 'track', id: 'dQw4w9WgXcQ' } },
  });
  expect(calls).toContainEqual({
    command: 'music_browse',
    args: { query: { kind: 'search', query: 'Test Artist', filter: 'music' } },
  });
});

test('search category changes wait for submit and YouTube is an explicit alternate player', async ({
  page,
}) => {
  await mockMusic(page);
  await page.setViewportSize({ width: 960, height: 720 });
  await page.goto('/?window=settings&destination=music-playlists');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByLabel('Search videos').fill('Fixture video');
  await expect(page.getByLabel('Search category')).toHaveValue('music');
  await page
    .getByRole('button', { name: 'Search', exact: true })
    .last()
    .click();
  await expect(
    page.getByRole('button', { name: /^Play A very long/ }),
  ).toBeEnabled();
  await page
    .getByRole('button', { name: /^Open A very long.* on YouTube$/ })
    .click();
  const before = await page.evaluate(
    () =>
      (
        window as unknown as { musicTest: { calls: { command: string }[] } }
      ).musicTest.calls.filter((c) => c.command === 'music_browse').length,
  );
  await page.getByLabel('Search category').selectOption('all');
  await expect(
    page.getByRole('list', { name: 'Videos', exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () =>
        (
          window as unknown as { musicTest: { calls: { command: string }[] } }
        ).musicTest.calls.filter((c) => c.command === 'music_browse').length,
    ),
  ).toBe(before);
  await page
    .getByRole('button', { name: 'Search', exact: true })
    .last()
    .click();
  await expect(
    page.getByRole('button', { name: /^Play A very long/ }),
  ).toBeEnabled();
  const calls = await page.evaluate(
    () =>
      (window as unknown as { musicTest: { calls: unknown[] } }).musicTest
        .calls,
  );
  expect(calls).toContainEqual({
    command: 'music_browse',
    args: { query: { kind: 'search', query: 'Fixture video', filter: 'all' } },
  });
  expect(calls).toContainEqual({
    command: 'music_open_player',
    args: { target: { kind: 'track', id: 'dQw4w9WgXcQ', player: 'youtube' } },
  });
});

test('provider cursors append without collapsing duplicate playlist occurrences', async ({
  page,
}) => {
  await mockMusic(page);
  await page.setViewportSize({ width: 960, height: 720 });
  await page.goto('/?window=settings&destination=music-playlists');
  await page.getByRole('button', { name: /My private playlist/ }).click();
  await expect(page.locator('.music-track')).toHaveCount(2);
  await page.getByRole('button', { name: 'Load more', exact: true }).click();
  await expect(page.locator('.music-track')).toHaveCount(3);
  await expect(
    page.getByRole('button', { name: 'Move Third Song up' }),
  ).toBeEnabled();
  const calls = await page.evaluate(
    () =>
      (window as unknown as { musicTest: { calls: unknown[] } }).musicTest
        .calls,
  );
  expect(calls).toContainEqual({
    command: 'music_browse',
    args: {
      query: { kind: 'playlist', id: 'PLowned', pageToken: 'next-page' },
    },
  });
  await page.getByRole('button', { name: 'Reload view' }).click();
  await expect(page.locator('.music-track')).toHaveCount(2);
});

test('reloaded provider ratings replace the last confirmed local change', async ({
  page,
}) => {
  await mockMusic(page);
  await page.setViewportSize({ width: 960, height: 720 });
  await page.goto('/?window=settings&destination=music-playlists');
  await page.getByRole('button', { name: 'Liked videos', exact: true }).click();
  await page.getByRole('button', { name: /^Like A very long/ }).click();
  const unlike = page.getByRole('button', { name: /^Unlike A very long/ });
  await expect(unlike).toBeEnabled();
  await page.evaluate(() => {
    (
      window as unknown as {
        musicTest: { setRating: (liked: boolean) => void };
      }
    ).musicTest.setRating(false);
  });
  await page.getByRole('button', { name: 'Reload view' }).click();
  await expect(
    page.getByRole('button', { name: /^Like A very long/ }),
  ).toBeEnabled();
});

test('failed writes do not show success or retry and require an explicit reload', async ({
  page,
}) => {
  await mockMusic(page, { failedWrite: true });
  await page.setViewportSize({ width: 960, height: 720 });
  await page.goto('/?window=settings&destination=music-playlists');
  await page.getByRole('button', { name: 'Liked videos', exact: true }).click();
  const like = page.getByRole('button', { name: /^Like A very long/ });
  await like.click();
  await expect(page.getByRole('alert')).toHaveText(
    'Could not reach YouTube. Check your connection and refresh.',
  );
  await expect(page.getByText('YouTube confirmed your change.')).toHaveCount(0);
  await expect(like).toBeDisabled();
  const writes = await page.evaluate(
    () =>
      (
        window as unknown as { musicTest: { calls: { command: string }[] } }
      ).musicTest.calls.filter((call) => call.command === 'music_change')
        .length,
  );
  expect(writes).toBe(1);
  await page.getByRole('button', { name: 'Reload view' }).click();
  await expect(like).toBeEnabled();
});

test('playlist ownership governs rename, removal, reordering and destination selection', async ({
  page,
}) => {
  await mockMusic(page);
  await page.setViewportSize({ width: 960, height: 720 });
  await page.goto('/?window=settings&destination=music-playlists');
  await page.getByRole('button', { name: 'Playlists', exact: true }).click();
  await page.getByLabel('New private playlist name').fill('Disposable');
  await page.getByRole('button', { name: 'Create private playlist' }).click();
  await expect(page.getByText('YouTube confirmed your change.')).toBeVisible();
  await page.getByRole('button', { name: /Someone else’s playlist/ }).click();
  await expect(page.getByText('This playlist is read-only.')).toBeVisible();
  await expect(page.getByLabel('Playlist name', { exact: true })).toHaveCount(
    0,
  );
  await page
    .getByRole('button', { name: 'Back to playlists', exact: true })
    .click();
  await page.getByRole('button', { name: /My private playlist/ }).click();
  await page.getByLabel('Playlist name', { exact: true }).fill('Renamed');
  await page.getByRole('button', { name: 'Rename', exact: true }).click();
  await page.getByRole('button', { name: 'Move Second Song up' }).click();
  await expect(
    page.getByRole('button', { name: 'Remove Second Song from playlist' }),
  ).toBeEnabled();
  await page
    .getByRole('button', { name: 'Remove Second Song from playlist' })
    .click();
  await expect(
    page.getByRole('button', { name: 'Add Second Song to playlist' }),
  ).toBeEnabled();
  await page
    .getByRole('button', { name: 'Add Second Song to playlist' })
    .click();
  await page.getByLabel('Destination playlist').selectOption('PLother');
  await expect(
    page.getByRole('button', { name: 'Add song', exact: true }),
  ).toBeDisabled();
  await page.getByLabel('Destination playlist').selectOption('PLowned');
  await expect(
    page.getByRole('button', { name: 'Add song', exact: true }),
  ).toBeEnabled();
  await page.getByRole('button', { name: 'Add song', exact: true }).click();
  const changes = await page.evaluate(() =>
    (
      window as unknown as {
        musicTest: { calls: { command: string; args: { change?: unknown } }[] };
      }
    ).musicTest.calls
      .filter((call) => call.command === 'music_change')
      .map((call) => call.args.change),
  );
  expect(changes).toEqual([
    { kind: 'create', title: 'Disposable' },
    { kind: 'rename', id: 'PLowned', title: 'Renamed' },
    { kind: 'move', id: 'PLowned', itemId: 'second', direction: 'up' },
    { kind: 'remove', id: 'PLowned', itemId: 'second' },
    { kind: 'add', id: 'PLowned', trackId: 'dQw4w9WgXcQ' },
  ]);
});

test('sessions require selection and unsupported controls stay disabled', async ({
  page,
}) => {
  await mockMusic(page, { account: 'disconnected' });
  await page.setViewportSize({ width: 960, height: 720 });
  await page.goto('/?window=settings&destination=music-player');
  await expect(page.getByLabel('Windows media session')).toHaveValue('');
  await expect(
    page.getByRole('button', { name: 'Pause playback' }),
  ).toHaveCount(0);
  await page.getByLabel('Windows media session').selectOption('browser-1');
  await expect(
    page.getByRole('button', { name: 'Pause playback' }),
  ).toBeEnabled();
  await expect(
    page.getByRole('button', { name: 'Previous track' }),
  ).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Next track' })).toBeDisabled();
  await expect(page.locator('.player-time')).toContainText('elapsed');
  await page.getByRole('button', { name: 'Pause playback' }).click();
  await page.getByLabel('Windows media session').selectOption('browser-2');
  await expect(
    page.getByRole('button', { name: 'Resume playback' }),
  ).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Next track' })).toBeEnabled();
});

test('expired account exposes reconnect without library content', async ({
  page,
}) => {
  await mockMusic(page, { account: 'expired' });
  await page.setViewportSize({ width: 960, height: 720 });
  await page.goto('/?window=settings&destination=music-player');
  await expect(
    page.getByRole('button', { name: 'Retry connection' }),
  ).toBeEnabled();
  await expect(
    page.getByRole('list', { name: 'Videos', exact: true }),
  ).toHaveCount(0);
});

test('empty library offers search without creating account content', async ({
  page,
}) => {
  await mockMusic(page, { empty: true });
  await page.setViewportSize({ width: 960, height: 720 });
  await page.goto('/?window=settings&destination=music-playlists');
  await expect(
    page.getByText(
      'No YouTube content here yet. Try a search or create a private playlist.',
    ),
  ).toBeVisible();
});

test('offline library exposes a retry read without any write', async ({
  page,
}) => {
  await mockMusic(page, { failedBrowse: true });
  await page.setViewportSize({ width: 960, height: 720 });
  await page.goto('/?window=settings&destination=music-playlists');
  await expect(page.getByRole('alert')).toHaveText(
    'Could not reach YouTube. Check your connection and refresh.',
  );
  await expect(page.getByRole('button', { name: 'Reload view' })).toBeEnabled();
  const writes = await page.evaluate(
    () =>
      (
        window as unknown as { musicTest: { calls: { command: string }[] } }
      ).musicTest.calls.filter((call) => call.command === 'music_change')
        .length,
  );
  expect(writes).toBe(0);
});

for (const artwork of [false, true])
  test(`all 70 theme/layout combinations fit with ${artwork ? 'loaded' : 'missing'} artwork`, async ({
    page,
  }) => {
    await mockMusic(page, { selected: true, artwork });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(
      page.getByRole('button', { name: 'More music actions' }),
    ).toBeVisible();
    for (const theme of themes)
      for (const layout of layouts) {
        await page.evaluate(
          ({ themeId, layoutId }) =>
            (
              window as unknown as {
                musicTest: { setPreferences: (patch: unknown) => void };
              }
            ).musicTest.setPreferences({ themeId, layoutId }),
          { themeId: theme.id, layoutId: layout.id },
        );
        await expect(page.getByLabel('Aura widget host')).toHaveAttribute(
          'data-layout',
          layout.id,
        );
        const metrics = await page
          .locator('.music-connect-card')
          .evaluate((element) => {
            const box = element.getBoundingClientRect();
            const essentials = Array.from(
              element.querySelectorAll(
                'button, [role="slider"], .player-artwork, .player-information',
              ),
            );
            return {
              scroll:
                element.scrollWidth > element.clientWidth ||
                element.scrollHeight > element.clientHeight,
              documentScroll:
                document.documentElement.scrollHeight > innerHeight ||
                document.documentElement.scrollWidth > innerWidth,
              outside: essentials.some((el) => {
                const b = el.getBoundingClientRect();
                return (
                  b.left < box.left ||
                  b.right > box.right ||
                  b.top < box.top ||
                  b.bottom > box.bottom
                );
              }),
              targets: Array.from(element.querySelectorAll('button')).every(
                (el) => {
                  const b = el.getBoundingClientRect();
                  return b.width >= 28 && b.height >= 28;
                },
              ),
            };
          });
        expect(metrics, `${theme.id}/${layout.id}`).toEqual({
          scroll: false,
          documentScroll: false,
          outside: false,
          targets: true,
        });
        await expect(page.locator('.player-artwork img')).toHaveCount(
          artwork ? 1 : 0,
        );
      }
  });

test('account failure stays unknown while playback loads independently', async ({
  page,
}) => {
  await mockMusic(page, { accountError: true, selected: true });
  await page.setViewportSize({ width: 960, height: 720 });
  await page.goto('/?window=settings&destination=music-player');
  await expect(
    page.getByText('Connection availability is unknown.', { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Pause playback' }),
  ).toBeEnabled();
  await expect(
    page.getByRole('button', { name: 'Retry connection' }),
  ).toBeDisabled();
  await expect(
    page.getByText('Account connection is unavailable in this build.'),
  ).toHaveCount(0);
});

test('playback failure does not block a connected library account', async ({
  page,
}) => {
  await mockMusic(page, { playbackError: true });
  await page.setViewportSize({ width: 960, height: 720 });
  await page.goto('/?window=settings&destination=music-player');
  await expect(page.getByText('Connected as Test Listener')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Retry playback' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Playlists', exact: true }).click();
  await expect(
    page.getByRole('button', { name: /My private playlist/ }),
  ).toBeVisible();
});

test('search, playlist drill-down and scroll position survive section switches', async ({
  page,
}) => {
  await mockMusic(page);
  await page.setViewportSize({ width: 720, height: 560 });
  await page.goto('/?window=settings&destination=music-playlists');
  await page.getByRole('button', { name: /My private playlist/ }).click();
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByLabel('Search videos').fill('remember this search');
  await page
    .getByRole('button', { name: 'Search', exact: true })
    .last()
    .click();
  await expect(page.getByRole('list', { name: 'Videos' })).toBeVisible();
  const scroll = await page
    .locator('.music-section-scroll:not([hidden])')
    .evaluate((el) => {
      el.scrollTop = 30;
      return el.scrollTop;
    });
  await page.getByRole('button', { name: 'Playlists', exact: true }).click();
  await expect(page.getByLabel('Playlist name', { exact: true })).toHaveValue(
    'Playlist details',
  );
  await page.getByRole('tab', { name: 'Theme', exact: true }).click();
  await page.getByRole('tab', { name: 'Music', exact: true }).click();
  await expect(page.getByLabel('Playlist name', { exact: true })).toHaveValue(
    'Playlist details',
  );
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByLabel('Search videos')).toHaveValue(
    'remember this search',
  );
  expect(
    await page
      .locator('.music-section-scroll:not([hidden])')
      .evaluate((el) => el.scrollTop),
  ).toBe(scroll);
});

for (const layoutId of [
  'clock-left-stats-music',
  'music-left-clock-stats',
  'music-focus-clock-left',
]) {
  test(`${layoutId}: More contains volume and destinations, Escape/outside restore focus`, async ({
    page,
  }) => {
    await mockMusic(page, { selected: true });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.evaluate(
      (layoutId) =>
        (
          window as unknown as {
            musicTest: { setPreferences: (p: unknown) => void };
          }
        ).musicTest.setPreferences({ layoutId }),
      layoutId,
    );
    const more = page.getByRole('button', { name: 'More music actions' });
    await more.click();
    const panel = page.getByRole('dialog', { name: 'More music actions' });
    await expect(panel).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Close music actions' }),
    ).toBeFocused();
    const volume = page.getByRole('slider', { name: 'Browser volume' });
    await expect(volume).toHaveAttribute('aria-valuenow', '50');
    await volume.focus();
    await page.keyboard.press('ArrowRight');
    await expect(volume).toHaveAttribute('aria-valuenow', '51');
    const overflow = await panel.evaluate((el) => {
      const card = el.closest('.music-connect-card')!.getBoundingClientRect();
      return Array.from(el.querySelectorAll('button, [role="slider"]')).some(
        (child) => {
          const b = child.getBoundingClientRect();
          return (
            b.left < card.left ||
            b.top < card.top ||
            b.right > card.right ||
            b.bottom > card.bottom
          );
        },
      );
    });
    expect(overflow).toBe(false);
    await page.screenshot({ path: `artifacts/redesign-${layoutId}-more.png` });
    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
    await expect(more).toBeFocused();
    await page.screenshot({ path: `artifacts/redesign-${layoutId}.png` });
    await more.click();
    await page.locator('.clock-widget').click();
    await expect(panel).toHaveCount(0);
    await expect(more).toBeFocused();
    await more.click();
    await page.getByRole('button', { name: 'Change player' }).click();
    const calls = await page.evaluate(
      () =>
        (window as unknown as { musicTest: { calls: unknown[] } }).musicTest
          .calls,
    );
    expect(calls).toContainEqual({
      command: 'open_settings',
      args: { destination: 'music-player' },
    });
  });
  test(`${layoutId}: failed volume offers recovery within the card`, async ({
    page,
  }) => {
    await mockMusic(page, { selected: true, volumeError: true });
    await page.goto('/');
    await page.evaluate(
      (layoutId) =>
        (
          window as unknown as {
            musicTest: { setPreferences: (p: unknown) => void };
          }
        ).musicTest.setPreferences({ layoutId }),
      layoutId,
    );
    await page.getByRole('button', { name: 'More music actions' }).click();
    await expect(page.getByText('Volume unavailable')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Retry volume' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Change player' }),
    ).toBeVisible();
  });
}

test('explicit navigation events take priority and omitted destinations retain the section', async ({
  page,
}) => {
  await mockMusic(page);
  await page.setViewportSize({ width: 960, height: 720 });
  await page.goto('/?window=settings&destination=layout');
  await expect(page.getByRole('tab', { name: 'Layout' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.evaluate(() =>
    (
      window as unknown as {
        musicTest: { emit: (e: string, p: unknown) => void };
      }
    ).musicTest.emit('aura://settings-navigate', 'music-search'),
  );
  await expect(page.getByRole('tab', { name: 'Music' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByLabel('Search videos')).toBeVisible();
});

test('account loading is visible while playback stays usable', async ({
  page,
}) => {
  await mockMusic(page, { accountLoading: true, selected: true });
  await page.setViewportSize({ width: 960, height: 720 });
  await page.goto('/?window=settings&destination=music-player');
  await expect(page.getByText('Checking account connection…')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Connect YouTube', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'Pause playback' }),
  ).toBeEnabled();
});

test('authorization explains the browser step and can be cancelled', async ({
  page,
}) => {
  await mockMusic(page, { account: 'disconnected', connectPending: true });
  await page.setViewportSize({ width: 960, height: 720 });
  await page.goto('/?window=settings&destination=music-player');
  await page
    .getByRole('button', { name: 'Connect YouTube', exact: true })
    .click();
  await expect(
    page.getByText(/Finish authorization in your browser/),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Cancel authorization' }).click();
  await expect(
    page.getByRole('button', { name: 'Connect YouTube', exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole('button', { name: 'Cancel authorization' }),
  ).toHaveCount(0);
});

test('diagnostic copying excludes account identifiers and raw error text', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await mockMusic(page, {
    connectError: 'secret_token=do-not-copy',
    account: 'disconnected',
  });
  await page.setViewportSize({ width: 960, height: 720 });
  await page.goto('/?window=settings&destination=music-player');
  await page
    .getByRole('button', { name: 'Connect YouTube', exact: true })
    .click();
  await page.getByText('Diagnostics', { exact: true }).click();
  await page.getByRole('button', { name: 'Copy diagnostics' }).click();
  await expect(
    page.getByText('Copied diagnostics without credentials.'),
  ).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain('OPEN_BROWSER');
  expect(copied).not.toMatch(
    /do-not-copy|secret_token|Test Listener|UCfixture/,
  );
});

for (const layoutId of [
  'clock-left-stats-music',
  'music-left-clock-stats',
  'music-focus-clock-left',
]) {
  test(`${layoutId}: library account state never gates playback`, async ({
    page,
  }) => {
    await mockMusic(page, { selected: true });
    await page.goto('/');
    await page.evaluate(
      (layoutId) =>
        (
          window as unknown as {
            musicTest: { setPreferences: (p: unknown) => void };
          }
        ).musicTest.setPreferences({ layoutId }),
      layoutId,
    );
    for (const status of [
      'disconnected',
      'expired',
      'unavailable',
      'connecting',
      'connected',
    ]) {
      await page.evaluate(
        (status) =>
          (
            window as unknown as {
              musicTest: { emit: (e: string, p: unknown) => void };
            }
          ).musicTest.emit('aura://music-account-changed', {
            status,
            revision: 1,
            name: null,
            channelId: null,
            message: null,
            validationBuild: false,
          }),
        status,
      );
      await expect(
        page.getByRole('button', { name: 'Pause playback' }),
      ).toBeEnabled();
      await expect(
        page.getByRole('button', { name: 'More music actions' }),
      ).toBeVisible();
      await expect(page.getByRole('combobox')).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: /Connect YouTube/ }),
      ).toHaveCount(0);
    }
    await page.evaluate(() =>
      (
        window as unknown as {
          musicTest: { emit: (e: string, p: unknown) => void };
        }
      ).musicTest.emit('aura://playback-changed', {
        sessions: [],
        selectedId: null,
        message: 'The selected player closed. Choose a media session again.',
      }),
    );
    await expect(page.getByText('No music playing')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Open Music' }),
    ).toBeVisible();
  });
  test(`${layoutId}: playback loading has a distinct empty state`, async ({
    page,
  }) => {
    await mockMusic(page, { playbackLoading: true });
    await page.goto('/');
    await page.evaluate(
      (layoutId) =>
        (
          window as unknown as {
            musicTest: { setPreferences: (p: unknown) => void };
          }
        ).musicTest.setPreferences({ layoutId }),
      layoutId,
    );
    await expect(page.getByText('Finding players…')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Open Music' }),
    ).toBeVisible();
  });
}

test('metadata changes retain the selected player and More focus target', async ({
  page,
}) => {
  await mockMusic(page, { selected: true });
  await page.goto('/');
  const more = page.getByRole('button', { name: 'More music actions' });
  await more.click();
  await page.evaluate(() =>
    (
      window as unknown as {
        musicTest: { emit: (e: string, p: unknown) => void };
      }
    ).musicTest.emit('aura://playback-changed', {
      sessions: [
        {
          id: 'browser-1',
          source: 'chrome.exe',
          title: 'The next track',
          artist: 'New artist',
          artwork: null,
          playing: true,
          durationSeconds: 180,
          positionSeconds: 0,
          updatedAtUnixMs: Date.now(),
          canPlay: true,
          canPause: true,
          canNext: true,
          canPrevious: true,
          canSeek: true,
        },
      ],
      selectedId: 'browser-1',
      message: null,
    }),
  );
  await page.keyboard.press('Escape');
  await expect(more).toBeFocused();
  await expect(page.locator('.player-information strong')).toHaveText(
    'The next track',
  );
  await expect(
    page.getByRole('button', { name: 'Pause playback' }),
  ).toBeEnabled();
});

test('Settings can inspect a widget failure after opening later', async ({
  page,
  context,
}) => {
  await mockMusic(page, { selected: true, volumeError: true });
  await page.goto('/');
  await page.getByRole('button', { name: 'More music actions' }).click();
  await expect(page.getByText('Volume unavailable')).toBeVisible();
  const settings = await context.newPage();
  await settings.setViewportSize({ width: 960, height: 720 });
  await settings.goto('/?window=settings&destination=music-player');
  await settings.getByText('Diagnostics', { exact: true }).click();
  await expect(settings.locator('.music-recent-diagnostics')).toContainText(
    'BROWSER_VOLUME_UNAVAILABLE',
  );
  const stored = await settings.evaluate(() =>
    localStorage.getItem('aura.music.recent-errors'),
  );
  expect(stored).not.toMatch(/Volume failed|Test Listener|UCfixture/);
});
