import { expect, test, type Page } from '@playwright/test';

const previewThemes = {
  galaxy: [
    'Galaxy',
    'Twinkling stars, gentle rotation and click-to-warp flight.',
  ],
  'faulty-terminal': [
    'Faulty Terminal',
    'Green phosphor, scanlines and interactive glitches.',
  ],
  'letter-glitch': ['Letter Glitch', 'Letters, mint flashes and click tears.'],
  'pixel-snow': ['Pixel Snow', 'Falling snowflakes with a soft glow.'],
};

async function expectTheme(page: Page, id: keyof typeof previewThemes) {
  const [name, description] = previewThemes[id];
  await expect(page.locator('[data-theme][aria-pressed="true"]')).toHaveCount(
    1,
  );
  await expect(page.getByRole('button', { name, exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('#theme-image')).toHaveJSProperty(
    'src',
    new URL(`/aura/images/widget-${id}.png`, page.url()).href,
  );
  await expect(page.locator('#theme-image')).toHaveAttribute(
    'alt',
    `Aura application in ${name} theme with synthetic demonstration data.`,
  );
  await expect(page.locator('#theme-caption')).toHaveText(
    `${name}. ${description}`,
  );
}

test('theme preview survives refresh for mouse and keyboard selections', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./');
  await expectTheme(page, 'galaxy');
  await page.getByRole('button', { name: 'Pixel Snow', exact: true }).click();
  await page.reload();
  await expectTheme(page, 'pixel-snow');

  await page.getByRole('button', { name: 'Pixel Snow', exact: true }).focus();
  await page.keyboard.press('ArrowLeft');
  await expectTheme(page, 'letter-glitch');
  await page.reload();
  await expectTheme(page, 'letter-glitch');

  await page
    .getByRole('button', { name: 'Letter Glitch', exact: true })
    .focus();
  await page.keyboard.press('Home');
  await expectTheme(page, 'faulty-terminal');
  await page.reload();
  await expectTheme(page, 'faulty-terminal');

  await page.getByRole('button', { name: 'Galaxy', exact: true }).click();
  await page.reload();
  await expectTheme(page, 'galaxy');
  expect(errors).toEqual([]);
});

test('invalid saved themes use Galaxy and allow a new choice to be saved', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./');
  for (const value of [
    'unknown-theme',
    'constructor',
    '__proto__',
    'toString',
    '{"theme":"galaxy"}',
    '',
  ]) {
    await page.evaluate(
      (value) => localStorage.setItem('aura.website.theme', value),
      value,
    );
    await page.reload();
    await expectTheme(page, 'galaxy');
    await expect(page.locator('.contribution-grid > i')).toHaveCount(65);
  }
  await page
    .getByRole('button', { name: 'Letter Glitch', exact: true })
    .click();
  await page.reload();
  await expectTheme(page, 'letter-glitch');
  expect(errors).toEqual([]);
});

for (const failure of ['access', 'read', 'write'] as const) {
  test(`theme controls still work when storage ${failure} fails`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript((failure) => {
      if (failure === 'access') {
        Object.defineProperty(window, 'localStorage', {
          configurable: true,
          get() {
            throw new DOMException('Storage blocked', 'SecurityError');
          },
        });
      } else {
        if (failure === 'write')
          localStorage.setItem('aura.website.theme', 'pixel-snow');
        Object.defineProperty(
          Storage.prototype,
          failure === 'read' ? 'getItem' : 'setItem',
          {
            configurable: true,
            value() {
              throw new DOMException(
                'Storage unavailable',
                failure === 'write' ? 'QuotaExceededError' : 'SecurityError',
              );
            },
          },
        );
      }
    }, failure);
    await page.goto('./');
    await expectTheme(page, failure === 'write' ? 'pixel-snow' : 'galaxy');
    await page
      .getByRole('button', { name: 'Faulty Terminal', exact: true })
      .click();
    await expectTheme(page, 'faulty-terminal');
    await page.keyboard.press('End');
    await expectTheme(page, 'pixel-snow');
    await page.reload();
    await expectTheme(page, failure === 'write' ? 'pixel-snow' : 'galaxy');
    await expect(page.locator('.contribution-grid > i')).toHaveCount(65);
    expect(errors).toEqual([]);
  });
}

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
