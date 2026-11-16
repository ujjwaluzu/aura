import { expect, test } from '@playwright/test';

test('responsive showcase, theme controls, policies and versioned download', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // Explicit fixture metadata exercises rendering; publication uses actual bytes.
  const release = {
    version: '0.1.3-beta.1',
    sizeBytes: 2200000,
    sha256: 'a'.repeat(64),
    releaseUrl: 'https://github.com/ujjwaluzu/aura/releases/tag/v0.1.3-beta.1',
    downloadUrl:
      'https://github.com/ujjwaluzu/aura/releases/download/v0.1.3-beta.1/Aura_0.1.3-beta.1_x64-setup.exe',
  };
  await page.route('**/release.json', (route) =>
    route.fulfill({ json: release }),
  );
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Desktop widgets.',
  );
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Made for Windows.',
  );
  await expect(
    page.locator('.eyebrow, .icon, .hero-asterisk, .settings-star'),
  ).toHaveCount(0);
  for (const link of await page
    .getByRole('link', { name: 'Download Windows Beta' })
    .all())
    await expect(link).toHaveAttribute('href', release.downloadUrl);
  await expect(page.locator('[data-size]').first()).toHaveText('2.10 MiB');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('link', { name: 'Skip to content' }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  const theme = page.getByRole('button', { name: 'Galaxy', exact: true });
  await theme.focus();
  await page.keyboard.press('Enter');
  await expect(theme).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#theme-image')).toHaveAttribute(
    'src',
    '/aura/images/widget-galaxy.png',
  );
  await expect(page.locator('#theme-caption')).toContainText('Galaxy');
  await expect(page.locator('.theme-card-art img')).toHaveCount(4);
  await expect(
    page
      .getByRole('navigation', { name: 'Footer', exact: true })
      .getByRole('link', { name: 'Features', exact: true }),
  ).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(
    page.getByRole('button', { name: 'Letter Glitch', exact: true }),
  ).toBeFocused();
  await expect(page.locator('#theme-image')).toHaveAttribute(
    'src',
    '/aura/images/widget-letter-glitch.png',
  );
  await page.keyboard.press('Home');
  await expect(
    page.getByRole('button', { name: 'Faulty Terminal', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');

  await expect(page.locator('.hero-screenshot')).toHaveAttribute(
    'src',
    /images\/aura-galaxy-clean\.png$/,
  );
  await expect(page.locator('.site-header .brand-mark')).toHaveAttribute(
    'src',
    /images\/aura-mark\.svg$/,
  );
  expect(await page.locator('body').innerText()).not.toContain('\u2014');
  await page
    .getByText('Does Aura start with Windows?', { exact: true })
    .click();
  await expect(page.locator('details[open]')).toContainText(
    'Settings, then General',
  );
  await expect(page.locator('details[open]')).toHaveCount(1);
  await page.evaluate(() => document.fonts.ready);
  for (const font of [
    '600 40px "Bodoni Moda"',
    '400 40px Anton',
    '400 16px "DM Sans"',
  ]) {
    expect(
      await page.evaluate((font) => document.fonts.check(font), font),
    ).toBe(true);
  }
  await page.locator('img').evaluateAll((images) =>
    images.forEach((image) => {
      if (image instanceof HTMLImageElement) image.loading = 'eager';
    }),
  );
  await expect
    .poll(() =>
      page
        .locator('img')
        .evaluateAll((images) =>
          images.every(
            (image) =>
              image instanceof HTMLImageElement &&
              image.complete &&
              image.naturalWidth > 0,
          ),
        ),
    )
    .toBe(true);
  await page.screenshot({
    path: `artifacts/website-${testInfo.project.name}.png`,
    fullPage: true,
    animations: 'disabled',
  });
  for (const [path, title] of [
    ['privacy.html', 'Aura privacy policy'],
    ['music-terms.html', 'Aura Music terms'],
  ]) {
    await page.goto(path!);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(title!);
    expect(await page.locator('body').innerText()).not.toContain('\u2014');
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  expect(errors).toEqual([]);
});

test('unavailable metadata falls back to explicit prerelease page', async ({
  page,
}) => {
  await page.route('**/release.json', (route) =>
    route.fulfill({ status: 503, body: 'Unavailable' }),
  );
  await page.goto('./');
  await expect(page.locator('.download-link').first()).toHaveText(
    'View beta release on GitHub',
  );
  await expect(page.locator('.download-link').first()).toHaveAttribute(
    'href',
    'https://github.com/ujjwaluzu/aura/releases/tag/v0.1.3-beta.1',
  );
});
