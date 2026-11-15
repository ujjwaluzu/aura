import { expect, test } from '@playwright/test';
import { layouts } from '../src/features/layouts/catalog';
import { themes } from '../src/features/themes/catalog';
import { mockMusic } from './fixtures/music';

// Music behavior tests do not exercise the background animation. Keep the
// browser fixture still so software-rendered CI runs stay responsive.
test.use({ reducedMotion: 'reduce' });

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
  await page
    .getByRole('button', { name: 'Edit playlist', exact: true })
    .click();
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
  test(`all 30 theme/layout combinations fit with ${artwork ? 'loaded' : 'missing'} artwork`, async ({
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

test('search, playlist drill-down and result pages survive section switches', async ({
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
  const position = await page
    .locator('nav[aria-label="Results pages"]:visible [role="status"]')
    .innerText();
  await page.getByRole('button', { name: 'Playlists', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Edit playlist', exact: true }),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'Theme', exact: true }).click();
  await page.getByRole('tab', { name: 'Music', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Edit playlist', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByLabel('Search videos')).toHaveValue(
    'remember this search',
  );
  await expect(
    page.locator('nav[aria-label="Results pages"]:visible [role="status"]'),
  ).toHaveText(position);
});

for (const layoutId of [
  'clock-left-stats-music',
  'clock-right-music-stats',
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
    await expect(
      page.getByRole('dialog', { name: 'Choose playback player' }),
    ).toBeVisible();
    await page
      .getByRole('combobox', { name: 'Choose playback player' })
      .selectOption('browser-2');
    await expect(
      page.getByRole('button', { name: 'Resume playback' }),
    ).toBeEnabled();
    const calls = await page.evaluate(
      () =>
        (window as unknown as { musicTest: { calls: unknown[] } }).musicTest
          .calls,
    );
    expect(calls).toContainEqual({
      command: 'music_select_session',
      args: { id: 'browser-2' },
    });
    expect(calls).not.toContainEqual({
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
  'clock-right-music-stats',
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
    await expect(page.getByText('Ready to play')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Start YouTube Music' }),
    ).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Open Music' })).toHaveCount(
      0,
    );
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
      page.getByRole('button', { name: 'Start YouTube Music' }),
    ).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Open Music' })).toHaveCount(
      0,
    );
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

test('a track transition keeps the selected player visible while Windows reconnects', async ({
  page,
}) => {
  await mockMusic(page, {
    selected: true,
    account: 'unavailable',
    sessionCount: 1,
  });
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'Pause playback' }),
  ).toBeVisible();
  await page.evaluate(() => {
    const fixture = (
      window as unknown as {
        musicTest: { emit: (event: string, state: unknown) => void };
      }
    ).musicTest;
    fixture.emit('aura://playback-changed', {
      sessions: [],
      selectedId: 'browser-1',
      message: null,
    });
  });
  await expect(page.getByText('Reconnecting player…')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Open Music', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Waiting for selected player' }),
  ).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'More music actions' }),
  ).toBeEnabled();
  await page.evaluate(() => {
    (
      window as unknown as {
        musicTest: { emit: (event: string, state: unknown) => void };
      }
    ).musicTest.emit('aura://playback-changed', {
      sessions: [
        {
          id: 'browser-1',
          source: 'Chrome',
          title: 'Recovered next track',
          artist: 'Next artist',
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
    });
  });
  await expect(page.locator('.player-information strong')).toHaveText(
    'Recovered next track',
  );
  await expect(page.getByRole('button', { name: 'Next track' })).toBeEnabled();
  await expect(
    page.getByRole('button', { name: 'Pause playback' }),
  ).toBeEnabled();
  await expect(page.getByText('Reconnecting player…')).toHaveCount(0);
});

test('artwork arriving after a track change renders without hiding playback controls', async ({
  page,
}) => {
  await mockMusic(page, { selected: true, artwork: true, sessionCount: 1 });
  await page.goto('/');
  await expect(page.locator('.player-artwork img')).toBeVisible();
  await page.evaluate(() => {
    const fixture = (
      window as unknown as {
        musicTest: { emit: (event: string, state: unknown) => void };
      }
    ).musicTest;
    fixture.emit('aura://playback-changed', {
      sessions: [
        {
          id: 'browser-1',
          source: 'chrome.exe',
          title: 'Next track',
          artist: 'Artist',
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
    });
  });
  await expect(page.locator('.player-artwork img')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Pause playback' }),
  ).toBeEnabled();
  await page.evaluate(() => {
    (
      window as unknown as {
        musicTest: { emit: (event: string, state: unknown) => void };
      }
    ).musicTest.emit('aura://playback-changed', {
      sessions: [
        {
          id: 'browser-1',
          source: 'chrome.exe',
          title: 'Next track',
          artist: 'Artist',
          artwork:
            'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="20" height="20"%3E%3Crect width="20" height="20" fill="red"/%3E%3C/svg%3E',
          playing: true,
          durationSeconds: 180,
          positionSeconds: 1,
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
    });
  });
  await expect(page.locator('.player-artwork img')).toBeVisible();
  await expect(page.locator('.player-artwork img')).toHaveJSProperty(
    'naturalWidth',
    20,
  );
  await expect(page.locator('.player-information strong')).toHaveText(
    'Next track',
  );
});

test('a new track retries artwork even when the preceding track image failed', async ({
  page,
}) => {
  await mockMusic(page, { selected: true, artwork: true, sessionCount: 1 });
  await page.goto('/');
  const image = page.locator('.player-artwork img');
  await expect(image).toBeVisible();
  const artwork = await image.getAttribute('src');
  await image.dispatchEvent('error');
  await expect(image).toHaveCount(0);
  await page.evaluate((artwork) => {
    (
      window as unknown as {
        musicTest: { emit: (event: string, state: unknown) => void };
      }
    ).musicTest.emit('aura://playback-changed', {
      sessions: [
        {
          id: 'browser-1',
          source: 'chrome.exe',
          title: 'Next track, same album',
          artist: 'Test Artist',
          artwork,
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
    });
  }, artwork);
  await expect(image).toBeVisible();
  await expect(image).toHaveJSProperty('naturalWidth', 100);
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

for (const layoutId of [
  'clock-left-stats-music',
  'clock-right-music-stats',
  'music-focus-clock-left',
]) {
  test(`${layoutId}: a connected account controls the sole player without opening Settings`, async ({
    page,
  }) => {
    await mockMusic(page, { sessionCount: 1 });
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
    await expect(page.getByRole('button', { name: 'Open Music' })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole('button', { name: 'Pause playback' }),
    ).toBeEnabled();
    await page.getByRole('button', { name: 'Pause playback' }).click();
    const calls = await page.evaluate(
      () =>
        (
          window as unknown as {
            musicTest: { calls: { command: string; args: unknown }[] };
          }
        ).musicTest.calls,
    );
    const select = calls.findIndex((c) => c.command === 'music_select_session');
    const pause = calls.findIndex((c) => c.command === 'music_media_control');
    expect(select).toBeGreaterThan(-1);
    expect(pause).toBeGreaterThan(select);
    expect(calls[pause]).toEqual({
      command: 'music_media_control',
      args: { action: 'pause' },
    });
    expect(calls.some((c) => c.command === 'open_settings')).toBe(false);
    await page.screenshot({
      path: `artifacts/widget-direct-controls-${layoutId}.png`,
    });
  });
  test(`${layoutId}: connected users can choose a player inside the widget`, async ({
    page,
  }) => {
    await mockMusic(page);
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
    await expect(page.getByRole('button', { name: 'Open Music' })).toHaveCount(
      0,
    );
    await page.getByRole('button', { name: 'Choose playback player' }).click();
    const picker = page.getByRole('combobox', {
      name: 'Choose playback player',
    });
    await page.keyboard.press('Tab');
    await expect(picker).toBeFocused();
    await picker.selectOption('browser-2');
    await expect(
      page.getByRole('button', { name: 'Resume playback' }),
    ).toBeEnabled();
    await page.getByRole('button', { name: 'Next track' }).click();
    const calls = await page.evaluate(
      () =>
        (window as unknown as { musicTest: { calls: unknown[] } }).musicTest
          .calls,
    );
    expect(calls).toContainEqual({
      command: 'music_media_control',
      args: { action: 'next' },
    });
    expect(calls).not.toContainEqual({
      command: 'open_settings',
      args: { destination: 'music-player' },
    });
  });
  test(`${layoutId}: Play starts the official player when no session exists`, async ({
    page,
  }) => {
    await mockMusic(page, { sessionCount: 0 });
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
    await expect(page.getByText('Ready to play')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open Music' })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole('button', { name: 'Previous track' }),
    ).toBeDisabled();
    await expect(
      page.getByRole('button', { name: 'Next track' }),
    ).toBeDisabled();
    await page.getByRole('button', { name: 'Start YouTube Music' }).click();
    const calls = await page.evaluate(
      () =>
        (window as unknown as { musicTest: { calls: unknown[] } }).musicTest
          .calls,
    );
    expect(calls).toContainEqual({
      command: 'music_open_player',
      args: { target: { kind: 'home' } },
    });
    await page.screenshot({ path: `artifacts/widget-ready-${layoutId}.png` });
  });
}

test('a failed player selection never sends a playback command to another session', async ({
  page,
}) => {
  await mockMusic(page, { sessionCount: 1, failedSelect: true });
  await page.goto('/');
  await page.getByRole('button', { name: 'Pause playback' }).click();
  await expect(page.getByRole('alert')).toContainText('Playback action failed');
  const calls = await page.evaluate(
    () =>
      (window as unknown as { musicTest: { calls: { command: string }[] } })
        .musicTest.calls,
  );
  expect(calls.some((c) => c.command === 'music_select_session')).toBe(true);
  expect(calls.some((c) => c.command === 'music_media_control')).toBe(false);
});

test('the sole player is bound before seeking and volume commands', async ({
  page,
}) => {
  await mockMusic(page, { sessionCount: 1 });
  await page.goto('/');
  const progress = page.getByRole('slider', { name: 'Track progress' });
  await progress.focus();
  await page.keyboard.press('ArrowRight');
  await page.getByRole('button', { name: 'More music actions' }).click();
  await expect(
    page.getByRole('slider', { name: 'Browser volume' }),
  ).toHaveAttribute('aria-valuenow', '50');
  await page.getByRole('slider', { name: 'Browser volume' }).focus();
  await page.keyboard.press('ArrowRight');
  const calls = await page.evaluate(
    () =>
      (
        window as unknown as {
          musicTest: { calls: { command: string; args: unknown }[] };
        }
      ).musicTest.calls,
  );
  const selection = calls.findIndex(
    (c) => c.command === 'music_select_session',
  );
  expect(
    calls.findIndex((c) => c.command === 'music_media_seek'),
  ).toBeGreaterThan(selection);
  expect(calls).toContainEqual({
    command: 'music_media_volume',
    args: { level: 0.51, sessionId: 'browser-1' },
  });
});

test('connected ready and picker controls fit every theme and arrangement', async ({
  page,
}) => {
  await mockMusic(page, { sessionCount: 0 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  for (const theme of themes)
    for (const layout of layouts) {
      await page.evaluate(
        ({ themeId, layoutId }) =>
          (
            window as unknown as {
              musicTest: { setPreferences: (p: unknown) => void };
            }
          ).musicTest.setPreferences({ themeId, layoutId }),
        { themeId: theme.id, layoutId: layout.id },
      );
      await expect(page.getByLabel('Aura widget host')).toHaveAttribute(
        'data-layout',
        layout.id,
      );
      await expect(
        page.getByRole('button', { name: 'Start YouTube Music' }),
      ).toBeVisible();
      for (const mode of ['ready', 'picker']) {
        if (mode === 'picker') {
          await page
            .getByRole('button', { name: 'More music actions' })
            .click();
          await page.getByRole('button', { name: 'Change player' }).click();
        }
        const outside = await page
          .locator('.music-connect-card')
          .evaluate((el) => {
            const box = el.getBoundingClientRect();
            return (
              Array.from(el.querySelectorAll('button, select, [role="slider"]'))
                .filter((control) => !control.closest('[inert]'))
                .some((control) => {
                  const b = control.getBoundingClientRect();
                  return (
                    b.left < box.left ||
                    b.right > box.right ||
                    b.top < box.top ||
                    b.bottom > box.bottom ||
                    b.height < 28
                  );
                }) ||
              el.scrollHeight > el.clientHeight ||
              el.scrollWidth > el.clientWidth
            );
          });
        expect(outside, `${theme.id}/${layout.id}/${mode}`).toBe(false);
        if (mode === 'picker') await page.keyboard.press('Escape');
      }
    }
});

for (const layoutId of [
  'clock-left-stats-music',
  'clock-right-music-stats',
  'music-focus-clock-left',
]) {
  test(`${layoutId}: inline volume sits between transport and More and works without opening actions`, async ({
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
    const volume = page.getByRole('slider', { name: 'Browser volume' });
    await expect(volume).toHaveAttribute('aria-valuenow', '50');
    const transport = await page.locator('.music-transport').boundingBox();
    const slider = await volume.boundingBox();
    const more = await page
      .getByRole('button', { name: 'More music actions' })
      .boundingBox();
    expect(slider!.x).toBeGreaterThanOrEqual(transport!.x + transport!.width);
    expect(slider!.x + slider!.width).toBeLessThanOrEqual(more!.x);
    expect(slider!.width).toBeGreaterThanOrEqual(28);
    expect(slider!.height).toBeGreaterThanOrEqual(28);
    await volume.focus();
    await page.keyboard.press('ArrowRight');
    await expect(volume).toHaveAttribute('aria-valuenow', '51');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.screenshot({
      path: `artifacts/widget-inline-volume-${layoutId}.png`,
    });
    const calls = await page.evaluate(
      () =>
        (window as unknown as { musicTest: { calls: unknown[] } }).musicTest
          .calls,
    );
    expect(calls).toContainEqual({
      command: 'music_media_volume',
      args: { level: 0.51, sessionId: 'browser-1' },
    });
  });
}

test('Brave volume automatically recovers after its audio session appears', async ({
  page,
}) => {
  await mockMusic(page, { selected: true, source: 'Brave', volumeFailures: 2 });
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'Retry volume' }),
  ).toBeVisible();
  const slider = page.getByRole('slider', { name: 'Browser volume' });
  await expect(slider).toHaveAttribute('aria-valuenow', '50');
  await expect(slider).not.toHaveAttribute('aria-disabled', 'true');
  const diagnostics = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('aura.music.recent-errors') ?? '[]'),
  );
  expect(
    diagnostics.filter(
      (d: { code: string }) => d.code === 'BROWSER_VOLUME_PENDING',
    ),
  ).toHaveLength(1);
});
test('a failed volume write reads the actual level and recovers without replaying the write', async ({
  page,
}) => {
  await mockMusic(page, {
    selected: true,
    source: 'Brave',
    volumeWriteFailure: true,
  });
  await page.goto('/');
  const slider = page.getByRole('slider', { name: 'Browser volume' });
  await expect(slider).toHaveAttribute('aria-valuenow', '50');
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  await expect(slider).toHaveAttribute('aria-valuenow', '50');
  const writes = () =>
    page.evaluate(() =>
      (
        window as unknown as {
          musicTest: {
            calls: {
              command: string;
              args: { level?: number | null; sessionId?: string };
            }[];
          };
        }
      ).musicTest.calls.filter(
        (c) => c.command === 'music_media_volume' && c.args.level != null,
      ),
    );
  await expect.poll(async () => (await writes()).length).toBe(1);
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  await expect(slider).toHaveAttribute('aria-valuenow', '51');
  expect(await writes()).toHaveLength(2);
});
test('a late volume read cannot undo a newer successful adjustment', async ({
  page,
}) => {
  await mockMusic(page, { selected: true, source: 'Brave' });
  await page.goto('/');
  await expect(
    page.getByRole('slider', { name: 'Browser volume' }),
  ).toHaveAttribute('aria-valuenow', '50');
  await page.evaluate(() =>
    (
      window as unknown as { musicTest: { holdNextVolumeRead(): void } }
    ).musicTest.holdNextVolumeRead(),
  );
  await page.getByRole('button', { name: 'More music actions' }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as unknown as { musicTest: { isVolumeReadHeld(): boolean } }
        ).musicTest.isVolumeReadHeld(),
      ),
    )
    .toBe(true);
  const slider = page.getByRole('slider', { name: 'Browser volume' });
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  await expect(slider).toHaveAttribute('aria-valuenow', '51');
  await page.evaluate(() =>
    (
      window as unknown as { musicTest: { releaseVolumeRead(): void } }
    ).musicTest.releaseVolumeRead(),
  );
  await expect(slider).toHaveAttribute('aria-valuenow', '51');
});
test('volume retries stop when the player leaves the visible widget page', async ({
  page,
}) => {
  await page.clock.install();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockMusic(page, {
    selected: true,
    source: 'Brave',
    volumeFailures: 100,
  });
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'Retry volume' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Next widget page' }).click();
  const queries = () =>
    page.evaluate(
      () =>
        (
          window as unknown as { musicTest: { calls: { command: string }[] } }
        ).musicTest.calls.filter((c) => c.command === 'music_media_volume')
          .length,
    );
  const before = await queries();
  await page.clock.runFor(31000);
  expect(await queries()).toBe(before);
});
test('unsupported volume controls do not retry indefinitely', async ({
  page,
}) => {
  await page.clock.install();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockMusic(page, {
    selected: true,
    source: 'Spotify',
    volumeError: true,
    volumeErrorCode: 'BROWSER_VOLUME_UNSUPPORTED',
  });
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'Retry volume' }),
  ).toBeVisible();
  const queries = () =>
    page.evaluate(
      () =>
        (
          window as unknown as { musicTest: { calls: { command: string }[] } }
        ).musicTest.calls.filter((c) => c.command === 'music_media_volume')
          .length,
    );
  const before = await queries();
  await page.clock.runFor(31000);
  expect(await queries()).toBe(before);
});

test('switching players cancels the previous browser volume retry', async ({
  page,
}) => {
  await page.clock.install();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockMusic(page, { selected: true, source: 'Brave', volumeError: true });
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'Retry volume' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'More music actions' }).click();
  await page.getByRole('button', { name: 'Change player' }).click();
  await page.evaluate(() =>
    (
      window as unknown as {
        musicTest: { setVolumeAvailable(value: boolean): void };
      }
    ).musicTest.setVolumeAvailable(true),
  );
  await page
    .getByRole('combobox', { name: 'Choose playback player' })
    .selectOption('browser-2');
  await expect(
    page.getByRole('slider', { name: 'Browser volume' }),
  ).toHaveAttribute('aria-valuenow', '50');
  const queries = () =>
    page.evaluate(
      () =>
        (
          window as unknown as {
            musicTest: {
              calls: { command: string; args: { sessionId?: string } }[];
            };
          }
        ).musicTest.calls.filter(
          (c) =>
            c.command === 'music_media_volume' &&
            c.args.sessionId === 'browser-1',
        ).length,
    );
  const before = await queries();
  await page.clock.runFor(31000);
  expect(await queries()).toBe(before);
  await page.getByRole('slider', { name: 'Browser volume' }).focus();
  await page.keyboard.press('ArrowRight');
  const lastWrite = await page.evaluate(() =>
    (
      window as unknown as {
        musicTest: {
          calls: {
            command: string;
            args: { level?: number | null; sessionId?: string };
          }[];
        };
      }
    ).musicTest.calls
      .filter((c) => c.command === 'music_media_volume' && c.args.level != null)
      .at(-1),
  );
  expect(lastWrite?.args).toEqual({ level: 0.51, sessionId: 'browser-2' });
});
test('volume recovery pauses while hidden and resumes on visibility', async ({
  page,
}) => {
  await page.clock.install();
  await mockMusic(page, { selected: true, source: 'Brave', volumeError: true });
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'Retry volume' }),
  ).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => true,
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const queries = () =>
    page.evaluate(
      () =>
        (
          window as unknown as { musicTest: { calls: { command: string }[] } }
        ).musicTest.calls.filter((c) => c.command === 'music_media_volume')
          .length,
    );
  const before = await queries();
  await page.clock.runFor(31000);
  expect(await queries()).toBe(before);
  await page.evaluate(() => {
    (
      window as unknown as {
        musicTest: { setVolumeAvailable(value: boolean): void };
      }
    ).musicTest.setVolumeAvailable(true);
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => false,
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(
    page.getByRole('slider', { name: 'Browser volume' }),
  ).toHaveAttribute('aria-valuenow', '50');
});
