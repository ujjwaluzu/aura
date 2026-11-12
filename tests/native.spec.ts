import { chromium, expect, test } from '@playwright/test';

/** Attach only to Aura's debug WebView2, started locally by the developer.
 * No debug endpoint is configured in the production application. */
test('real Rust IPC, window controls, settings isolation and host-owned shutdown', async () => {
  test.setTimeout(60_000);
  const endpoint = process.env.AURA_NATIVE_CDP;
  if (!endpoint)
    throw new Error('Start a debug Aura instance and set AURA_NATIVE_CDP.');
  const browser = await chromium.connectOverCDP(endpoint);
  const context = browser.contexts()[0];
  if (!context) throw new Error('No Aura WebView context found.');
  const host = context
    .pages()
    .find(
      (page) =>
        page.url().startsWith('http://tauri.localhost/') &&
        !page.url().includes('window=settings'),
    );
  if (!host) throw new Error('No Aura host page found.');

  await expect(
    host.getByRole('status', { name: 'Native connection' }),
  ).toHaveText('Native core connected');
  const invoke = <T>(
    page: typeof host,
    command: string,
    args: Record<string, unknown> = {},
    captureError = false,
  ) =>
    page.evaluate(
      ({ command, args, captureError }) => {
        const internals = (
          window as unknown as {
            __TAURI_INTERNALS__: {
              invoke: (
                command: string,
                args: Record<string, unknown>,
              ) => Promise<unknown>;
            };
          }
        ).__TAURI_INTERNALS__;
        return internals.invoke(command, args).catch((error: unknown) => {
          if (captureError) return error;
          throw error;
        });
      },
      { command, args, captureError },
    ) as Promise<T>;

  const info = await invoke<{
    appName: string;
    platform: string;
    protocolVersion: number;
  }>(host, 'get_foundation_info', { protocolVersion: 1 });
  expect(info).toMatchObject({
    appName: 'Aura',
    platform: 'windows',
    protocolVersion: 1,
  });
  await expect(host.locator('body')).toHaveCSS(
    'background-color',
    'rgba(0, 0, 0, 0)',
  );
  const bounds = await host.evaluate(() => ({
    content: document.documentElement.scrollHeight,
    viewport: innerHeight,
  }));
  expect(bounds.content).toBeLessThanOrEqual(bounds.viewport);
  await expect(host.getByLabel('Current time')).toBeVisible();
  // Allow a few logical pixels for native frame/DPI rounding.
  expect(bounds.viewport).toBeGreaterThanOrEqual(208);
  expect(bounds.viewport).toBeLessThanOrEqual(216);
  await expect(host.getByRole('region', { name: 'Widget space' })).toBeEmpty();
  await host.screenshot({
    path: 'artifacts/aura-compact-native.png',
    omitBackground: true,
    animations: 'disabled',
  });
  const rejected = await invoke(
    host,
    'get_foundation_info',
    { protocolVersion: 0 },
    true,
  );
  expect(rejected).toMatchObject({ code: 'PROTOCOL_MISMATCH' });

  // DOM activation checks the React -> IPC -> native path; physical dragging,
  // hit testing and desktop composition remain manual QA.
  await host
    .getByRole('button', { name: 'Always on top' })
    .dispatchEvent('click');
  await expect(
    host.getByRole('button', { name: 'Always on top' }),
  ).toHaveAttribute('aria-pressed', 'true');
  await host
    .getByRole('button', { name: 'Always on top' })
    .dispatchEvent('click');
  await expect(
    host.getByRole('button', { name: 'Always on top' }),
  ).toHaveAttribute('aria-pressed', 'false');

  const settingsEvent = context.waitForEvent('page');
  await host
    .getByRole('button', { name: 'Open settings' })
    .dispatchEvent('click');
  const settings = await settingsEvent;
  await expect(
    settings.getByRole('heading', { name: 'Make it yours.' }),
  ).toBeVisible();
  const denied = await invoke(
    settings,
    'get_foundation_info',
    { protocolVersion: 1 },
    true,
  );
  expect(String(denied)).toMatch(/not allowed|not found|denied/i);
  await host
    .getByRole('button', { name: 'Open settings' })
    .dispatchEvent('click');
  expect(
    context.pages().filter((page) => page.url().includes('window=settings')),
  ).toHaveLength(1);

  const closed = settings.waitForEvent('close');
  await settings
    .getByRole('button', { name: 'Close settings' })
    .dispatchEvent('click');
  await closed;
  await expect(
    host.getByRole('status', { name: 'Native connection' }),
  ).toHaveText('Native core connected');
  const reopened = context.waitForEvent('page');
  await host
    .getByRole('button', { name: 'Open settings' })
    .dispatchEvent('click');
  const secondSettings = await reopened;
  await expect(secondSettings.getByRole('heading')).toBeVisible();
  const disconnected = new Promise<void>((resolve) =>
    browser.once('disconnected', () => resolve()),
  );
  await host
    .getByRole('button', { name: 'Quit Aura' })
    .dispatchEvent('click')
    .catch(() => {});
  await disconnected;
});
