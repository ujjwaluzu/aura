import { expect, test, type Page } from '@playwright/test';

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

test('settings placeholder renders at its own entry with no persistent-preferences claim', async ({
  page,
}) => {
  await page.setViewportSize({ width: 520, height: 480 });
  await page.goto('/?window=settings');
  await expect(
    page.getByRole('heading', { name: 'Make it yours.' }),
  ).toBeVisible();
  await expect(
    page.getByText('Preferences are not saved in this phase.'),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Close settings' }),
  ).toBeDisabled();
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
        metadata: { currentWindow: { label: 'widget-host' } },
        invoke: async (command: string) => {
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
          metadata: { currentWindow: { label: 'widget-host' } },
          invoke: async (command: string) => {
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

test('reference layout places usage cards above two honest music entry points', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const spotify = page.getByRole('button', { name: 'Connect Spotify' });
  const youtube = page.getByRole('button', { name: 'Connect YouTube Music' });
  await expect(spotify).toBeVisible();
  await expect(youtube).toBeVisible();
  const cpu = await page.locator('.usage-card').first().boundingBox();
  const ram = await page.locator('.usage-card').last().boundingBox();
  const music = await page
    .getByRole('region', { name: 'Music connections' })
    .boundingBox();
  const clock = await page.getByRole('region', { name: 'Clock' }).boundingBox();
  expect(cpu && ram && music && clock).toBeTruthy();
  expect(ram!.y).toBe(cpu!.y);
  expect(ram!.x).toBeGreaterThan(cpu!.x);
  expect(music!.y).toBeGreaterThan(cpu!.y + cpu!.height);
  expect(clock!.x).toBeLessThan(cpu!.x);
  await spotify.click();
  await expect(
    page.getByRole('region', { name: 'Music connections' }).getByRole('status'),
  ).toHaveText('Spotify connection is coming soon.');
  await youtube.click();
  await expect(
    page.getByRole('region', { name: 'Music connections' }).getByRole('status'),
  ).toHaveText('YouTube Music connection is coming soon.');
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
