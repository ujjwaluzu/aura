import { expect, test } from '@playwright/test';
import { mockGithub } from './fixtures/github';
import { themes } from '../src/features/themes/catalog';

test('a rendering failure offers reload and recovers without clearing preferences', async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('aura:render-fault')) return;
    sessionStorage.setItem('aura:render-fault', 'done');
    Intl.DateTimeFormat = new Proxy(Intl.DateTimeFormat, {
      construct(target, args) {
        if (args[1]?.hour12 !== undefined)
          throw new Error('Rendering fault fixture');
        return Reflect.construct(target, args);
      },
    });
  });
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText(
    'Aura couldn’t display this window.',
  );
  await page.getByRole('button', { name: 'Reload Aura' }).click();
  await expect(page.getByLabel('Current time')).toBeVisible();
  await expect(page.locator('.app-recovery')).toHaveCount(0);
});

test('a graphics initialization failure keeps the widget controls usable', async ({
  page,
}) => {
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.getContext = new Proxy(
      HTMLCanvasElement.prototype.getContext,
      {
        apply(target, receiver, args) {
          if (args[0] === 'webgl2') throw new Error('Graphics fault fixture');
          return Reflect.apply(target, receiver, args);
        },
      },
    );
  });
  await page.goto('/');
  await expect(page.getByLabel('Current time')).toBeVisible();
  await expect(page.locator('.app-recovery')).toHaveCount(0);
  await page.getByRole('button', { name: 'Next widget page' }).click();
  await expect(page.getByLabel('Aura widget host')).toHaveAttribute(
    'data-page',
    'github',
  );
});

test('lost graphics contexts stop the effect without removing widget content', async ({
  page,
}) => {
  await mockGithub(page, { theme: 'pixel-snow' });
  await page.goto('/');
  await page.locator('.pixel-snow-canvas').evaluate((canvas) => {
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
  });
  await expect(page.locator('.theme-background canvas')).toHaveCount(0);
  await expect(page.getByLabel('Current time')).toBeVisible();
  await page.getByRole('button', { name: 'Next widget page' }).click();
  await expect(page.getByLabel('Aura widget host')).toHaveAttribute(
    'data-page',
    'github',
  );
});

for (const theme of themes) {
  test(`${theme.name} responds when OS reduced motion changes`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await mockGithub(page, { theme: theme.id });
    await page.goto('/');
    const canvas = page.locator('.theme-background canvas');
    await expect(canvas).toBeVisible();
    const original = await canvas.elementHandle();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect
      .poll(() => original!.evaluate((element) => element.isConnected))
      .toBe(false);
    await expect(canvas).toBeVisible();
    const still = await canvas.elementHandle();
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect
      .poll(() => still!.evaluate((element) => element.isConnected))
      .toBe(false);
    await expect(canvas).toBeVisible();
    await expect(page.getByLabel('Current time')).toBeVisible();
  });
}
