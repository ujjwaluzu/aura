import { expect, test, type Page } from '@playwright/test';

async function mockStartup(page: Page) {
  await page.addInitScript(() => {
    let enabled = true;
    let failRead = false;
    let failWrite = false;
    let delayed = false;
    let complete: (() => void) | undefined;
    let reads = 0;
    let writes = 0;
    Object.assign(window, {
      isTauri: true,
      __TAURI_INTERNALS__: {
        transformCallback: () => 0,
        metadata: { currentWindow: { label: 'settings' } },
        invoke: async (command: string, args: { enabled?: boolean }) => {
          if (command === 'get_preferences')
            return {
              themeId: 'faulty-terminal',
              layoutId: 'clock-left-stats-music',
              revision: 0,
              warning: null,
            };
          if (command.startsWith('plugin:event|')) return 1;
          if (command === 'get_startup_status') {
            reads++;
            if (delayed)
              await new Promise<void>((resolve) => {
                complete = resolve;
              });
            if (failRead)
              throw {
                code: 'STARTUP_READ',
                message:
                  'Cannot read Windows startup. Check your startup policy and try again.',
              };
            return { available: true, enabled, warning: null };
          }
          if (command === 'set_startup_enabled') {
            writes++;
            if (delayed)
              await new Promise<void>((resolve) => {
                complete = resolve;
              });
            if (failWrite)
              throw {
                code: 'STARTUP_REGISTRATION',
                message:
                  'Cannot change Windows startup. Check Windows Settings > Apps > Startup and try again.',
              };
            enabled = args.enabled!;
            return { available: true, enabled, warning: null };
          }
        },
      },
      __TAURI_EVENT_PLUGIN_INTERNALS__: { unregisterListener: () => {} },
      startupTest: {
        configure: (options: {
          enabled?: boolean;
          failRead?: boolean;
          failWrite?: boolean;
          delayed?: boolean;
        }) => {
          enabled = options.enabled ?? enabled;
          failRead = options.failRead ?? failRead;
          failWrite = options.failWrite ?? failWrite;
          delayed = options.delayed ?? delayed;
        },
        finish: () => {
          delayed = false;
          complete?.();
        },
        counts: () => ({ reads, writes }),
      },
    });
  });
}

type StartupTest = {
  configure: (options: {
    enabled?: boolean;
    failRead?: boolean;
    failWrite?: boolean;
    delayed?: boolean;
  }) => void;
  finish: () => void;
  counts: () => { reads: number; writes: number };
};
const fixture = (
  page: Page,
  options: Parameters<StartupTest['configure']>[0],
) =>
  page.evaluate(
    (options) =>
      (window as unknown as { startupTest: StartupTest }).startupTest.configure(
        options,
      ),
    options,
  );

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 840, height: 640 });
});

test('General preview disables startup and explains the desktop requirement', async ({
  page,
}) => {
  await page.goto('/?window=settings&destination=general');
  await expect(
    page.getByRole('switch', { name: 'Start Aura with Windows' }),
  ).toBeDisabled();
  await expect(
    page.getByText(/Startup is unavailable in frontend preview/),
  ).toBeVisible();
  await expect(
    page.getByText(/Windows Settings → Apps → Startup/),
  ).toBeVisible();
  await page.screenshot({ path: 'artifacts/startup-general-preview.png' });
});

test('General reads on every open and supports tab and switch keyboard navigation', async ({
  page,
}) => {
  await mockStartup(page);
  await page.goto('/?window=settings');
  expect(
    await page.evaluate(() =>
      (window as unknown as { startupTest: StartupTest }).startupTest.counts(),
    ),
  ).toEqual({ reads: 0, writes: 0 });
  await page.getByRole('tab', { name: 'Theme', exact: true }).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(
    page.getByRole('tab', { name: 'General', exact: true }),
  ).toBeFocused();
  const toggle = page.getByRole('switch', { name: 'Start Aura with Windows' });
  await expect(toggle).toBeChecked();
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('tabpanel', { name: 'General', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(toggle).toBeFocused();
  await page.keyboard.press('Space');
  await expect(toggle).not.toBeChecked();
  await page.keyboard.press('Enter');
  await expect(toggle).toBeChecked();
  await page.getByRole('tab', { name: 'Theme', exact: true }).click();
  await fixture(page, { enabled: false });
  await page.getByRole('tab', { name: 'General', exact: true }).click();
  await expect(toggle).not.toBeChecked();
  expect(
    await page.evaluate(() =>
      (window as unknown as { startupTest: StartupTest }).startupTest.counts(),
    ),
  ).toEqual({ reads: 2, writes: 2 });
  await page.getByRole('tab', { name: 'General', exact: true }).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(
    page.getByRole('tab', { name: 'Music', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(
    page.getByRole('tab', { name: 'General', exact: true }),
  ).toBeFocused();
});

test('pending changes keep confirmed status and failed writes show recovery', async ({
  page,
}) => {
  await mockStartup(page);
  await page.goto('/?window=settings&destination=general');
  const toggle = page.getByRole('switch', { name: 'Start Aura with Windows' });
  await expect(toggle).toBeChecked();
  await fixture(page, { delayed: true, failWrite: true });
  await toggle.click();
  await expect(toggle).toBeDisabled();
  await expect(toggle).toBeChecked();
  await expect(page.locator('.startup-card')).toHaveAttribute(
    'aria-busy',
    'true',
  );
  await page.evaluate(() =>
    (window as unknown as { startupTest: StartupTest }).startupTest.finish(),
  );
  await expect(page.getByRole('alert')).toContainText(
    'Cannot change Windows startup',
  );
  await expect(toggle).toBeEnabled();
  await expect(toggle).toBeChecked();
  await fixture(page, { failWrite: false });
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.screenshot({
    path: 'artifacts/startup-general-native-fixture.png',
  });
});

test('failed reads stay unavailable until refreshed and never write a default', async ({
  page,
}) => {
  await mockStartup(page);
  await page.goto('/?window=settings');
  await fixture(page, { failRead: true, delayed: true });
  await page.getByRole('tab', { name: 'General', exact: true }).click();
  const toggle = page.getByRole('switch', { name: 'Start Aura with Windows' });
  await expect(toggle).toBeDisabled();
  await page.evaluate(() =>
    (window as unknown as { startupTest: StartupTest }).startupTest.finish(),
  );
  await expect(page.getByRole('alert')).toContainText(
    'Cannot read Windows startup',
  );
  await expect(toggle).toBeDisabled();
  await fixture(page, { failRead: false, enabled: false });
  await page.getByRole('button', { name: 'Refresh startup status' }).click();
  await expect(toggle).toBeEnabled();
  await expect(toggle).not.toBeChecked();
  expect(
    await page.evaluate(() =>
      (window as unknown as { startupTest: StartupTest }).startupTest.counts(),
    ),
  ).toEqual({ reads: 2, writes: 0 });
});
