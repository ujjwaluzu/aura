import { expect, test, type Page } from '@playwright/test';
import { layouts } from '../src/features/layouts/catalog';
import { themes } from '../src/features/themes/catalog';
import { mockMusic } from './fixtures/music';

test.use({ timezoneId: 'Asia/Kolkata', locale: 'en-GB' });

test('preview is honest about native availability and preserves transparency', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(
    page.getByRole('status', { name: 'Native connection' }),
  ).toHaveText('Frontend preview · native core unavailable');
  await expect(
    page.getByRole('button', { name: 'Always on top' }),
  ).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Quit Aura' })).toBeDisabled();
  await expect(page.locator('body')).toHaveCSS(
    'background-color',
    'rgba(0, 0, 0, 0)',
  );
  await expect(page.getByLabel('Current time')).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'System usage' }),
  ).toBeVisible();
  await expect(page.getByLabel('CPU utilization')).toHaveText('—');
  await expect(page.getByLabel('RAM utilization')).toHaveText('—');
  await expect(page.locator('h1')).toHaveCount(0);
  await page.getByRole('button', { name: 'Open settings' }).click();
  await expect(page.getByRole('alert')).toHaveText(
    'Settings opens in a separate window in the desktop application.',
  );
  expect(errors).toEqual([]);
});

test('clock shows local time and updates at the next minute boundary', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-11-12T09:05:00+05:30') });
  await page.clock.pauseAt(new Date('2026-11-12T09:05:59+05:30'));
  await page.goto('/');
  const clock = page.getByLabel('Current time');
  await expect(clock).toHaveText('09:05');
  await expect(page.locator('.clock-date')).toHaveText('Thursday 12 November');
  await page.clock.runFor(1_000);
  await expect(clock).toHaveText('09:06');
});

test('clock changes the local date at midnight', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-12T23:59:00+05:30') });
  await page.clock.pauseAt(new Date('2026-11-12T23:59:59+05:30'));
  await page.goto('/');
  await expect(page.getByLabel('Current time')).toHaveText('23:59');
  await page.clock.runFor(1_000);
  await expect(page.getByLabel('Current time')).toHaveText('00:00');
  await expect(page.locator('.clock-date')).toHaveText('Friday 13 November');
});

test('settings is opaque with theme and layout tabs and five palette previews', async ({
  page,
}) => {
  await page.setViewportSize({ width: 840, height: 640 });
  await page.goto('/?window=settings');
  await expect(
    page.getByRole('heading', { name: 'Settings', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('tab', { name: 'Theme', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: / theme$/ })).toHaveCount(5);
  await expect(page.locator('body')).toHaveCSS(
    'background-color',
    'rgb(17, 19, 24)',
  );
  await expect(page.locator('.settings-app')).toHaveCSS(
    'backdrop-filter',
    'none',
  );
  await expect(page.getByRole('button', { name: 'Done' })).toBeDisabled();
  await page.screenshot({ path: 'artifacts/redesign-settings-theme.png' });
  await page.getByRole('tab', { name: 'Layout', exact: true }).click();
  await page.screenshot({ path: 'artifacts/redesign-settings-layout.png' });
});

test('frontend uses local assets and remains usable when external traffic is blocked', async ({
  page,
}) => {
  const external: string[] = [];
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== '127.0.0.1') {
      external.push(url.href);
      return route.abort();
    }
    return route.continue();
  });
  await page.goto('/');
  await expect(page.getByLabel('Current time')).toBeVisible();
  expect(external).toEqual([]);
  const metrics = await page.evaluate(() => ({
    scroll: document.documentElement.scrollHeight,
    height: window.innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    width: window.innerWidth,
  }));
  expect(metrics.scroll).toBeLessThanOrEqual(metrics.height);
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.width);
});

test('structured command failure is shown and retry can reconnect', async ({
  page,
}) => {
  // Deliberate transport substitute: this checks the React error/retry path,
  // not Rust, capabilities, or actual desktop window behaviour.
  await page.addInitScript(() => {
    let fail = true;
    Object.assign(window, {
      isTauri: true,
      __TAURI_INTERNALS__: {
        transformCallback: () => 0,
        metadata: { currentWindow: { label: 'widget-host' } },
        invoke: async (command: string) => {
          if (command === 'get_preferences')
            return {
              themeId: 'violet',
              layoutId: 'clock-left-stats-music',
              revision: 0,
              warning: null,
            };
          if (command.startsWith('plugin:event|')) return 1;
          if (command === 'get_system_snapshot')
            return {
              cpuPercent: null,
              memoryPercent: null,
              usedMemoryBytes: null,
              totalMemoryBytes: null,
              sampledAtUnixMs: Date.now(),
            };
          if (command !== 'get_foundation_info') return;
          if (fail)
            throw {
              code: 'PROTOCOL_MISMATCH',
              message: 'Native test failure. Try again.',
            };
          return {
            protocolVersion: 1,
            appName: 'Aura',
            version: '0.1.0',
            platform: 'windows',
            windowMode: 'transparent-host',
          };
        },
      },
      __TAURI_EVENT_PLUGIN_INTERNALS__: { unregisterListener: () => {} },
      allowTestConnection: () => {
        fail = false;
      },
    });
  });
  await page.goto('/');
  await expect(page.getByRole('alert')).toHaveText(
    'Native test failure. Try again.',
  );
  await page.evaluate(() =>
    (
      window as unknown as { allowTestConnection: () => void }
    ).allowTestConnection(),
  );
  await page.getByRole('button', { name: 'Retry native connection' }).click();
  await expect(
    page.getByRole('status', { name: 'Native connection' }),
  ).toHaveText('Native core connected');
  await expect(page.getByRole('alert')).toHaveCount(0);
});

async function mockSystemMonitoring(page: Page, failInitially = false) {
  // Explicit test-only transport. Production preview never fabricates readings.
  await page.addInitScript(
    ({ failInitially }) => {
      let failed = failInitially;
      let cpu: number | null = null;
      let requests = 0;
      let visibility = 'visible';
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => visibility,
      });
      Object.assign(window, {
        isTauri: true,
        __TAURI_INTERNALS__: {
          transformCallback: () => 0,
          metadata: { currentWindow: { label: 'widget-host' } },
          invoke: async (command: string) => {
            if (command === 'get_preferences')
              return {
                themeId: 'violet',
                layoutId: 'clock-left-stats-music',
                revision: 0,
                warning: null,
              };
            if (command.startsWith('plugin:event|')) return 1;
            if (command === 'get_foundation_info')
              return {
                protocolVersion: 1,
                appName: 'Aura',
                version: '0.1.0',
                platform: 'windows',
                windowMode: 'transparent-host',
              };
            if (command === 'get_system_snapshot') {
              requests += 1;
              if (failed)
                throw {
                  code: 'MONITOR_UNAVAILABLE',
                  message: 'Test sampler unavailable.',
                };
              return {
                cpuPercent: cpu,
                memoryPercent: 37.5,
                usedMemoryBytes: 6 * 1024 ** 3,
                totalMemoryBytes: 16 * 1024 ** 3,
                sampledAtUnixMs: Date.now(),
              };
            }
          },
        },
        __TAURI_EVENT_PLUGIN_INTERNALS__: { unregisterListener: () => {} },
        monitorTest: {
          requests: () => requests,
          allowReadings: () => {
            failed = false;
            cpu = 26.2;
          },
          setVisibility: (value: string) => {
            visibility = value;
            document.dispatchEvent(new Event('visibilitychange'));
          },
        },
      });
    },
    { failInitially },
  );
}

test('system readings warm up without a fake CPU zero and update once per second', async ({
  page,
}) => {
  await mockSystemMonitoring(page);
  await page.clock.install({ time: new Date('2026-11-12T09:05:00+05:30') });
  await page.clock.pauseAt(new Date('2026-11-12T09:05:30+05:30'));
  await page.goto('/');
  await expect(page.getByLabel('RAM utilization')).toHaveText('38%');
  await expect(page.getByLabel('CPU utilization')).toHaveText('—');
  await expect(page.getByText('6.0 / 16.0 GiB')).toBeVisible();
  const before = await page.evaluate(() => {
    const mock = (
      window as unknown as {
        monitorTest: { requests: () => number; allowReadings: () => void };
      }
    ).monitorTest;
    mock.allowReadings();
    return mock.requests();
  });
  await page.clock.runFor(999);
  expect(
    await page.evaluate(() =>
      (
        window as unknown as { monitorTest: { requests: () => number } }
      ).monitorTest.requests(),
    ),
  ).toBe(before);
  await page.clock.runFor(1);
  await expect(page.getByLabel('CPU utilization')).toHaveText('26%');
  await expect(page.getByRole('meter', { name: 'CPU usage' })).toHaveAttribute(
    'aria-valuenow',
    '26.2',
  );
});

test('monitoring stops while hidden and resumes with fresh readings', async ({
  page,
}) => {
  await mockSystemMonitoring(page);
  await page.clock.install({ time: new Date('2026-11-12T09:05:00+05:30') });
  await page.clock.pauseAt(new Date('2026-11-12T09:05:30+05:30'));
  await page.goto('/');
  await expect(page.getByLabel('RAM utilization')).toHaveText('38%');
  const before = await page.evaluate(() => {
    const mock = (
      window as unknown as {
        monitorTest: {
          setVisibility: (value: string) => void;
          requests: () => number;
        };
      }
    ).monitorTest;
    mock.setVisibility('hidden');
    return mock.requests();
  });
  await page.clock.runFor(10_000);
  expect(
    await page.evaluate(() =>
      (
        window as unknown as { monitorTest: { requests: () => number } }
      ).monitorTest.requests(),
    ),
  ).toBe(before);
  await page.evaluate(() => {
    const mock = (
      window as unknown as {
        monitorTest: {
          allowReadings: () => void;
          setVisibility: (value: string) => void;
        };
      }
    ).monitorTest;
    mock.allowReadings();
    mock.setVisibility('visible');
  });
  await expect(page.getByLabel('CPU utilization')).toHaveText('26%');
});

test('reference layout keeps one clear music entry point below usage', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'Connect Spotify' }),
  ).toHaveCount(0);
  const cpu = await page.locator('.usage-card').first().boundingBox();
  const music = await page
    .getByRole('region', { name: 'Music player' })
    .boundingBox();
  expect(music!.y).toBeGreaterThan(cpu!.y + cpu!.height);
  await expect(page.getByText('No music playing')).toBeVisible();
  await page.getByRole('button', { name: 'Open Music' }).click();
  await expect(page.getByRole('alert')).toContainText('Playback action failed');
});

test('monitor errors show unavailable readings and recover through the retry control', async ({
  page,
}) => {
  await mockSystemMonitoring(page, true);
  await page.goto('/');
  await expect(page.getByLabel('CPU utilization')).toHaveText('—');
  await expect(
    page.getByRole('button', { name: 'Retry system monitoring' }),
  ).toBeVisible();
  await page.evaluate(() =>
    (
      window as unknown as { monitorTest: { allowReadings: () => void } }
    ).monitorTest.allowReadings(),
  );
  await page.getByRole('button', { name: 'Retry system monitoring' }).click();
  await expect(page.getByLabel('CPU utilization')).toHaveText('26%');
  await expect(
    page.getByRole('button', { name: 'Retry system monitoring' }),
  ).toHaveCount(0);
});

test('all five themes update the host across windows and survive reload', async ({
  page,
  context,
}) => {
  await page.goto('/');
  const settings = await context.newPage();
  await settings.setViewportSize({ width: 840, height: 640 });
  await settings.goto('/?window=settings');
  const colours = new Set<string>();
  for (const theme of themes) {
    const option = settings.getByRole('button', {
      name: `${theme.name} theme`,
    });
    await expect(option).toBeEnabled();
    await option.click();
    await expect(option).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel('Aura widget host')).toHaveAttribute(
      'data-theme',
      theme.id,
    );
    colours.add(
      await page
        .locator('.clock-time')
        .evaluate((element) => getComputedStyle(element).color),
    );
  }
  expect(colours.size).toBe(5);
  await page.reload();
  await expect(page.getByLabel('Aura widget host')).toHaveAttribute(
    'data-theme',
    'rose',
  );
  await settings.reload();
  await expect(
    settings.getByRole('button', { name: 'Rose theme' }),
  ).toHaveAttribute('aria-pressed', 'true');
});

test('all six layouts apply without clipped modules or music entry points', async ({
  page,
  context,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const settings = await context.newPage();
  await settings.setViewportSize({ width: 840, height: 640 });
  await settings.goto('/?window=settings');
  await settings.getByRole('tab', { name: 'Layout', exact: true }).click();
  await expect(settings.locator('.layout-option')).toHaveCount(layouts.length);
  for (const layout of layouts) {
    const option = settings.getByRole('button', {
      name: `${layout.title}, ${layout.description}`,
      exact: true,
    });
    await expect(option).toBeEnabled();
    await option.click();
    await expect(page.getByLabel('Aura widget host')).toHaveAttribute(
      'data-layout',
      layout.id,
    );
    const bounds = await page.evaluate(() => {
      const host = document
        .querySelector('.host-surface')!
        .getBoundingClientRect();
      return Array.from(
        document.querySelectorAll(
          '.clock-widget, .system-monitor-widget, .music-connect-card',
        ),
      ).map((element) => {
        const box = element.getBoundingClientRect();
        return {
          inside:
            box.left >= host.left &&
            box.right <= host.right &&
            box.top >= host.top &&
            box.bottom <= host.bottom,
          noOverflow:
            element.scrollWidth <= element.clientWidth &&
            element.scrollHeight <= element.clientHeight,
        };
      });
    });
    expect(bounds, layout.id).toHaveLength('focus' in layout ? 2 : 3);
    expect(
      bounds.every((bound) => bound.inside && bound.noOverflow),
      layout.id,
    ).toBe(true);
    await expect(
      page.getByRole('button', { name: 'Open Music' }),
    ).toBeInViewport();
  }
  await page.reload();
  await expect(page.getByLabel('Aura widget host')).toHaveAttribute(
    'data-layout',
    layouts.at(-1)!.id,
  );
});

test('settings tabs support keyboard navigation', async ({ page }) => {
  await page.setViewportSize({ width: 840, height: 640 });
  await page.goto('/?window=settings');
  await page.getByRole('tab', { name: 'Theme', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(
    page.getByRole('tab', { name: 'Layout', exact: true }),
  ).toBeFocused();
  await expect(page.locator('.layout-option')).toHaveCount(layouts.length);
  await page.keyboard.press('Home');
  await expect(
    page.getByRole('tab', { name: 'Theme', exact: true }),
  ).toBeFocused();
});

test('Layout offers exactly four Clock and two Music focus arrangements', async ({
  page,
}) => {
  await page.setViewportSize({ width: 960, height: 720 });
  await page.goto('/?window=settings&destination=layout');
  await expect(page.locator('.layout-option')).toHaveCount(6);
  await expect(page.locator('.layout-group')).toHaveCount(2);
  const clock = page.locator('.layout-group').filter({
    has: page.getByRole('heading', { name: 'Clock 4', exact: true }),
  });
  const focus = page.locator('.layout-group').filter({
    has: page.getByRole('heading', { name: 'Music focus 2', exact: true }),
  });
  await expect(clock.locator('.layout-option')).toHaveCount(4);
  await expect(focus.locator('.layout-option')).toHaveCount(2);
  await expect(
    page.getByRole('heading', { name: 'System usage', exact: false }),
  ).toHaveCount(0);
  expect(layouts.map((layout) => layout.id)).toEqual([
    'clock-left-stats-music',
    'clock-left-music-stats',
    'clock-right-stats-music',
    'clock-right-music-stats',
    'music-focus-clock-left',
    'music-focus-clock-right',
  ]);
  await page.screenshot({ path: 'artifacts/aura-six-layouts.png' });
});

test('retired saved layouts fall back to Clock without resetting the theme', async ({
  page,
}) => {
  await page.setViewportSize({ width: 960, height: 720 });
  await page.goto('/?window=settings&destination=layout');
  const replacements = {
    'stats-left-clock-music': 'clock-left-stats-music',
    'stats-left-music-clock': 'clock-left-music-stats',
    'stats-right-clock-music': 'clock-right-stats-music',
    'stats-right-music-clock': 'clock-right-music-stats',
    'music-left-clock-stats': 'clock-left-music-stats',
    'music-left-stats-clock': 'clock-left-stats-music',
    'music-right-clock-stats': 'clock-right-music-stats',
    'music-right-stats-clock': 'clock-right-stats-music',
  };
  for (const [previous, replacement] of Object.entries(replacements)) {
    await page.evaluate(
      (layoutId) =>
        localStorage.setItem(
          'aura:preview-preferences',
          JSON.stringify({
            themeId: 'rose',
            layoutId,
            revision: 7,
            warning: null,
          }),
        ),
      previous,
    );
    await page.reload();
    await expect(page.locator('.settings-app')).toHaveAttribute(
      'data-theme',
      'rose',
    );
    const expected = layouts.find((layout) => layout.id === replacement)!;
    await expect(
      page.getByRole('button', {
        name: `${expected.title}, ${expected.description}`,
        exact: true,
      }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.layout-option')).toHaveCount(6);
  }
});

test('clock navigation opens the GitHub view and restores the chosen layout', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const previous = page.getByRole('button', { name: 'Previous widget page' });
  const next = page.getByRole('button', { name: 'Next widget page' });
  await expect(previous).toBeDisabled();
  await expect(next).toBeEnabled();
  const date = await page.locator('.clock-date').boundingBox();
  const navigation = await page
    .getByRole('navigation', { name: 'Widget pages' })
    .boundingBox();
  expect(navigation!.y).toBeGreaterThanOrEqual(date!.y + date!.height);
  await page.screenshot({ path: 'artifacts/widget-clock-navigation.png' });
  await next.click();
  await expect(page.getByLabel('Aura widget host')).toHaveAttribute(
    'data-page',
    'github',
  );
  await expect(
    page.getByRole('button', { name: 'Connect GitHub' }),
  ).toBeVisible();
  await expect(page.getByRole('region', { name: 'System usage' })).toHaveCount(
    0,
  );
  await expect(page.getByRole('region', { name: 'Music player' })).toHaveCount(
    0,
  );
  const clock = await page.getByRole('region', { name: 'Clock' }).boundingBox();
  const github = await page
    .getByRole('region', { name: 'GitHub connection' })
    .boundingBox();
  expect(clock!.x + clock!.width).toBeLessThanOrEqual(github!.x);
  await expect(previous).toBeEnabled();
  await expect(previous).toBeFocused();
  await expect(next).toBeDisabled();
  await page.getByRole('button', { name: 'Connect GitHub' }).click();
  await expect(
    page.getByText('GitHub connection is coming soon.'),
  ).toBeVisible();
  await page.screenshot({ path: 'artifacts/widget-github-page.png' });
  await previous.click();
  await expect(next).toBeFocused();
  await expect(page.getByLabel('Aura widget host')).toHaveAttribute(
    'data-page',
    'widgets',
  );
  await expect(
    page.getByRole('region', { name: 'System usage' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Connect GitHub' }),
  ).toHaveCount(0);
});

test('both widget pages fit all themes and layouts without scrolling', async ({
  page,
  context,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const settings = await context.newPage();
  await settings.setViewportSize({ width: 960, height: 720 });
  await settings.goto('/?window=settings&destination=layout');
  for (const theme of themes) {
    await settings.getByRole('tab', { name: 'Theme', exact: true }).click();
    await settings.getByRole('button', { name: `${theme.name} theme` }).click();
    await settings.getByRole('tab', { name: 'Layout', exact: true }).click();
    for (const layout of layouts) {
      await settings
        .getByRole('button', {
          name: `${layout.title}, ${layout.description}`,
          exact: true,
        })
        .click();
      await expect(page.getByLabel('Aura widget host')).toHaveAttribute(
        'data-layout',
        layout.id,
      );
      for (const view of ['widgets', 'github']) {
        if (view === 'github')
          await page.getByRole('button', { name: 'Next widget page' }).click();
        const invalid = await page.evaluate(() => {
          const host = document
            .querySelector('.host-surface')!
            .getBoundingClientRect();
          const controls = Array.from(
            document.querySelectorAll<HTMLElement>(
              '.clock-page-nav button, .github-connect-button',
            ),
          );
          const date = document
            .querySelector('.clock-date')!
            .getBoundingClientRect();
          const nav = document
            .querySelector('.clock-page-nav')!
            .getBoundingClientRect();
          return (
            controls.some((el) => {
              const b = el.getBoundingClientRect();
              return (
                b.width < 28 ||
                b.height < 28 ||
                b.left < host.left ||
                b.right > host.right ||
                b.top < host.top ||
                b.bottom > host.bottom
              );
            }) ||
            nav.top < date.bottom ||
            document.documentElement.scrollHeight > innerHeight ||
            document.documentElement.scrollWidth > innerWidth
          );
        });
        expect(invalid, `${theme.id}/${layout.id}/${view}`).toBe(false);
        if (view === 'github')
          await page
            .getByRole('button', { name: 'Previous widget page' })
            .click();
      }
    }
  }
});

test('page controls stay usable beside a native error with the clock on the right', async ({
  page,
}) => {
  await mockMusic(page, {
    selected: true,
    foundationError: 'Native connection is unavailable.',
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.evaluate(() =>
    (
      window as unknown as {
        musicTest: { setPreferences: (p: unknown) => void };
      }
    ).musicTest.setPreferences({ layoutId: 'clock-right-music-stats' }),
  );
  await expect(page.getByRole('alert')).toContainText(
    'Native connection is unavailable.',
  );
  await page.getByRole('button', { name: 'Next widget page' }).click();
  await expect(
    page.getByRole('button', { name: 'Connect GitHub' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Previous widget page' }).click();
  await expect(page.getByLabel('Aura widget host')).toHaveAttribute(
    'data-side',
    'right',
  );
});
