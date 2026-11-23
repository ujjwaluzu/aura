import { expect, test } from '@playwright/test';
import { layouts } from '../src/features/layouts/catalog';
import { themes } from '../src/features/themes/catalog';
import { mockMusic } from './fixtures/music';
test.use({ reducedMotion: 'reduce' });
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

test('browser playback needs no YouTube account and legacy links open the player', async ({
  page,
}) => {
  await mockMusic(page, { accountError: true, selected: true });
  await page.goto('/?window=settings&destination=music-playlists');
  await expect(
    page.getByRole('heading', { name: 'Browser media' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Pause playback' }),
  ).toBeEnabled();
  await expect(
    page.getByRole('button', {
      name: /Connect YouTube|Playlists|Liked videos/,
    }),
  ).toHaveCount(0);
  const calls = await page.evaluate(
    () =>
      (window as unknown as { musicTest: { calls: { command: string }[] } })
        .musicTest.calls,
  );
  expect(
    calls.some((c) =>
      /music_(account_status|connect|browse|change)/.test(c.command),
    ),
  ).toBe(false);
});
