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
          artwork: null,
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
          artwork: null,
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
        metadata: { currentWindow: { label: 'music' } },
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
          if (command === 'music_account_status') return account;
          if (command === 'music_playback_status') return playback;
          if (command === 'music_connect') {
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
  await page.goto('/?window=music');
  await expect(
    page.getByRole('heading', { name: 'Bring your library closer' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Connect YouTube', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText(/Aura authorization and your browser/),
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
  await page.goto('/?window=music');
  await page
    .getByRole('button', { name: 'Connect YouTube', exact: true })
    .click();
  await expect(page.getByRole('alert')).toHaveText(
    'Windows could not open your default browser.',
  );
  await expect(
    page.getByRole('button', { name: 'Connect YouTube', exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole('button', { name: 'Cancel sign-in', exact: true }),
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
  await page.goto('/?window=music');
  await page
    .getByRole('button', { name: 'Connect YouTube', exact: true })
    .click();
  await expect(page.getByText('Test Listener')).toBeVisible();
  await expect(
    page.getByRole('button', { name: /My private playlist/ }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Disconnect account' }).click();
  await expect(page.getByLabel('Videos', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Test Listener')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Connect YouTube', exact: true }),
  ).toBeVisible();
});

test('browse, search and provider playback use typed commands', async ({
  page,
}) => {
  await mockMusic(page);
  await page.goto('/?window=music');
  await page.getByRole('button', { name: 'Liked Videos', exact: true }).click();
  await expect(page.getByLabel('Videos', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Play Unavailable Song', exact: true }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByLabel('Search videos').fill('Test Artist');
  await page
    .getByRole('button', { name: 'Search', exact: true })
    .last()
    .click();
  await expect(page.getByLabel('Videos', { exact: true })).toBeVisible();
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
  await page.goto('/?window=music');
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
  await expect(page.getByLabel('Videos', { exact: true })).toHaveCount(0);
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
  await page.goto('/?window=music');
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
  await page.goto('/?window=music');
  await page.getByRole('button', { name: 'Liked Videos', exact: true }).click();
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
  await page.goto('/?window=music');
  await page.getByRole('button', { name: 'Liked Videos', exact: true }).click();
  const like = page.getByRole('button', { name: /^Like A very long/ });
  await like.click();
  await expect(page.getByRole('alert')).toHaveText(
    'The service did not confirm this change.',
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
  await page.goto('/?window=music');
  await page
    .getByRole('button', { name: 'Your Playlists', exact: true })
    .click();
  await page.getByLabel('New private playlist name').fill('Disposable');
  await page.getByRole('button', { name: 'Create private playlist' }).click();
  await expect(page.getByText('YouTube confirmed your change.')).toBeVisible();
  await page.getByRole('button', { name: /Someone else’s playlist/ }).click();
  await expect(page.getByText('This playlist is read-only.')).toBeVisible();
  await expect(page.getByLabel('Playlist name', { exact: true })).toHaveCount(
    0,
  );
  await page
    .getByRole('button', { name: 'Your Playlists', exact: true })
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
  await page.goto('/?window=music');
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
  await expect(page.getByLabel('Playback position')).toHaveText('0:35 / 3:12');
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
  await page.goto('/?window=music');
  await expect(
    page.getByRole('button', { name: 'Reconnect YouTube' }),
  ).toBeEnabled();
  await expect(page.getByLabel('Videos', { exact: true })).toHaveCount(0);
});

test('empty library offers search without creating account content', async ({
  page,
}) => {
  await mockMusic(page, { empty: true });
  await page.goto('/?window=music');
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
  await page.goto('/?window=music');
  await expect(page.getByRole('alert')).toHaveText('YouTube Music is offline.');
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

test('connected music fits all sixty theme and layout combinations', async ({
  page,
}) => {
  await mockMusic(page, { selected: true });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'Open Library' }),
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
      const overflow = await page
        .locator('.music-connect-card')
        .evaluate((element) => {
          const box = element.getBoundingClientRect();
          return {
            width: element.scrollWidth > element.clientWidth,
            height: element.scrollHeight > element.clientHeight,
            outside: Array.from(element.querySelectorAll('button')).some(
              (button) => {
                const b = button.getBoundingClientRect();
                return (
                  b.left < box.left ||
                  b.right > box.right ||
                  b.top < box.top ||
                  b.bottom > box.bottom
                );
              },
            ),
          };
        });
      expect(overflow, `${theme.id}/${layout.id}`).toEqual({
        width: false,
        height: false,
        outside: false,
      });
    }
});
