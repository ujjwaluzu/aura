import { expect, test, type Page } from '@playwright/test';
import { mockMusic } from './fixtures/music';
async function fixedViewport(page: Page) {
  const before = await page.evaluate(() => ({
    x: window.scrollX,
    y: window.scrollY,
  }));
  await page.mouse.move(350, 300);
  await page.mouse.wheel(500, 700);
  await page.keyboard.press('PageDown');
  await expect
    .poll(() => page.evaluate(() => ({ x: window.scrollX, y: window.scrollY })))
    .toEqual(before);
  const problems = await page.evaluate(() => {
    const errors: string[] = [];
    for (const el of Array.from(
      document.querySelectorAll<HTMLElement>(
        'button, input, select, [role="slider"], h2, h3, p, pre',
      ),
    )) {
      if (
        !el.getClientRects().length ||
        el.closest('[inert], [aria-hidden="true"]')
      )
        continue;
      const box = el.getBoundingClientRect();
      for (
        let parent = el.parentElement;
        parent;
        parent = parent.parentElement
      ) {
        const style = getComputedStyle(parent);
        if (!/(hidden|clip|auto|scroll)/.test(style.overflow)) continue;
        const bounds = parent.getBoundingClientRect();
        if (
          box.top < bounds.top - 1 ||
          box.bottom > bounds.bottom + 1 ||
          box.left < bounds.left - 1 ||
          box.right > bounds.right + 1
        ) {
          errors.push(
            `${el.tagName}: ${el.getAttribute('aria-label') ?? el.textContent?.slice(0, 45)}`,
          );
          break;
        }
      }
    }
    const scrollable = Array.from(
      document.querySelectorAll<HTMLElement>('*'),
    ).filter((el) => {
      const style = getComputedStyle(el);
      return (
        (/^(auto|scroll)$/.test(style.overflowY) &&
          el.scrollHeight > el.clientHeight + 1) ||
        (/^(auto|scroll)$/.test(style.overflowX) &&
          el.scrollWidth > el.clientWidth + 1)
      );
    });
    return { errors, scrollable: scrollable.map((el) => el.className) };
  });
  expect(problems).toEqual({ errors: [], scrollable: [] });
}
for (const viewport of [
  { width: 720, height: 560 },
  { width: 960, height: 720 },
]) {
  test(`Settings stays fixed with reachable controls at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await mockMusic(page, { selected: true, largeLibrary: true });
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/?window=settings');
    await expect(
      page.getByRole('button', { name: 'Violet theme' }),
    ).toBeEnabled();
    await fixedViewport(page);
    await page.getByRole('tab', { name: 'Layout', exact: true }).click();
    await expect(page.locator('.layout-option')).toHaveCount(6);
    await fixedViewport(page);
    await page.screenshot({
      path: `artifacts/no-scroll-layout-${viewport.width}.png`,
    });
    await page.getByRole('tab', { name: 'Music', exact: true }).click();
    await page.getByRole('button', { name: 'Player', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Pause playback' }),
    ).toBeEnabled();
    await fixedViewport(page);
    await page.screenshot({
      path: `artifacts/no-scroll-player-${viewport.width}.png`,
    });
    await page
      .getByRole('button', { name: 'Diagnostics', exact: true })
      .click();
    await fixedViewport(page);
    const nextDiagnostic = page.getByRole('button', {
      name: 'Next diagnostic page',
    });
    if (await nextDiagnostic.isEnabled()) {
      await nextDiagnostic.click();
      await fixedViewport(page);
    }
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Playlists', exact: true }).click();
    await expect(
      page.getByRole('button', { name: /^Playlist 1 with/ }),
    ).toBeVisible();
    await fixedViewport(page);
    await page.getByRole('button', { name: 'Next results page' }).click();
    await fixedViewport(page);
    await page.getByRole('button', { name: 'Previous results page' }).click();
    await page.getByRole('button', { name: /^Playlist 1 with/ }).click();
    await expect(page.getByRole('list', { name: 'Videos' })).toBeVisible();
    await fixedViewport(page);
    await page
      .getByRole('button', { name: 'Edit playlist', exact: true })
      .click();
    await fixedViewport(page);
    await page.keyboard.press('Escape');
    await page
      .getByRole('button', {
        name: 'Add Video 1 with a long title to playlist',
      })
      .click();
    await fixedViewport(page);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Next results page' }).click();
    await fixedViewport(page);
    await page
      .getByRole('button', { name: 'Liked videos', exact: true })
      .click();
    await fixedViewport(page);
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await page.getByLabel('Search videos').fill('Music');
    await page
      .getByRole('button', { name: 'Search', exact: true })
      .last()
      .click();
    await expect(page.getByRole('list', { name: 'Videos' })).toBeVisible();
    await fixedViewport(page);
    await page.screenshot({
      path: `artifacts/no-scroll-search-${viewport.width}.png`,
    });
  });
}

test('the widget cannot scroll, including fractional display-size rounding and long errors', async ({
  page,
}) => {
  await mockMusic(page, {
    selected: true,
    foundationError: 'A long native error. '.repeat(100),
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  for (const height of [263, 264, 265]) {
    await page.setViewportSize({ width: 760, height });
    await expect(page.getByRole('alert')).toBeVisible();
    const before = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
    await page.mouse.move(700, 240);
    await page.mouse.wheel(1000, 1000);
    await page.keyboard.press('PageDown');
    expect(await page.evaluate(() => ({ x: scrollX, y: scrollY }))).toEqual(
      before,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollHeight <= innerHeight,
      ),
    ).toBe(true);
  }
});

for (const account of [
  'disconnected',
  'expired',
  'connecting',
  'unavailable',
]) {
  test(`account ${account} stays fully reachable without scrolling at minimum size`, async ({
    page,
  }) => {
    await mockMusic(page, { account, selected: true });
    await page.setViewportSize({ width: 720, height: 560 });
    await page.goto('/?window=settings&destination=music-player');
    await expect(
      page.getByRole('button', { name: 'Pause playback' }),
    ).toBeEnabled();
    await fixedViewport(page);
  });
}

test('account loading and failures fit the fixed window', async ({ page }) => {
  await mockMusic(page, { accountError: true, selected: true });
  await page.setViewportSize({ width: 720, height: 560 });
  await page.goto('/?window=settings&destination=music-player');
  await expect(
    page.getByText(/Connection availability is unknown/),
  ).toBeVisible();
  await fixedViewport(page);
});

test('every video remains reachable through result pages without extra provider requests', async ({
  page,
}) => {
  await mockMusic(page, { largeLibrary: true });
  await page.setViewportSize({ width: 720, height: 560 });
  await page.goto('/?window=settings&destination=music-liked');
  await expect(page.getByRole('list', { name: 'Videos' })).toBeVisible();
  const readCount = () =>
    page.evaluate(
      () =>
        (
          window as unknown as { musicTest: { calls: { command: string }[] } }
        ).musicTest.calls.filter((call) => call.command === 'music_browse')
          .length,
    );
  await expect
    .poll(() => page.locator('.music-track').count())
    .toBeGreaterThan(1);
  const beforePaging = await readCount();
  const seen = new Set<string>();
  for (let count = 0; count < 50; count++) {
    for (const title of await page
      .locator('.music-section-scroll:not([hidden]) .music-track-copy strong')
      .allTextContents())
      seen.add(title);
    await fixedViewport(page);
    const next = page.getByRole('button', { name: 'Next results page' });
    if (!(await next.isEnabled())) break;
    await next.click();
  }
  expect(seen.size).toBe(50);
  const lastTitle = await page
    .locator('.music-section-scroll:not([hidden]) .music-track-copy strong')
    .first()
    .innerText();
  expect(await readCount()).toBe(beforePaging);
  await page.getByRole('button', { name: 'Playlists', exact: true }).click();
  await expect(
    page.getByRole('button', { name: /^Playlist 1 with/ }),
  ).toBeVisible();
  const beforeReturn = await readCount();
  await page.getByRole('button', { name: 'Liked videos', exact: true }).click();
  await expect(
    page
      .locator('.music-section-scroll:not([hidden]) .music-track-copy strong')
      .first(),
  ).toHaveText(lastTitle);
  expect(await readCount()).toBe(beforeReturn);
});

test('long account names fit without pushing actions outside the window', async ({
  page,
}) => {
  await mockMusic(page, {
    selected: true,
    accountName: 'A very long channel name '.repeat(15),
  });
  await page.setViewportSize({ width: 720, height: 560 });
  await page.goto('/?window=settings&destination=music-player');
  await expect(
    page.getByRole('button', { name: 'Disconnect account' }),
  ).toBeVisible();
  await fixedViewport(page);
});

test('account loading retains visible player controls at minimum size', async ({
  page,
}) => {
  await mockMusic(page, { selected: true, accountLoading: true });
  await page.setViewportSize({ width: 720, height: 560 });
  await page.goto('/?window=settings&destination=music-player');
  await expect(page.getByText('Checking account connection…')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Pause playback' }),
  ).toBeEnabled();
  await fixedViewport(page);
});

test('an uncertain playlist edit can be checked without scrolling or retrying the write', async ({
  page,
}) => {
  await mockMusic(page, { failedWrite: true });
  await page.setViewportSize({ width: 720, height: 560 });
  await page.goto('/?window=settings&destination=music-playlists');
  await page.getByRole('button', { name: /My private playlist/ }).click();
  await page
    .getByRole('button', { name: 'Edit playlist', exact: true })
    .click();
  await page
    .getByLabel('Playlist name', { exact: true })
    .fill('A rename to check');
  await page.getByRole('button', { name: 'Rename', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit playlist' });
  await expect(dialog.getByRole('alert')).toContainText(
    'Could not reach YouTube',
  );
  await expect(
    dialog.getByRole('button', { name: 'Refresh result' }),
  ).toBeVisible();
  await fixedViewport(page);
  await dialog.getByRole('button', { name: 'Refresh result' }).click();
  await expect(dialog).toHaveCount(0);
  const writes = await page.evaluate(
    () =>
      (
        window as unknown as { musicTest: { calls: { command: string }[] } }
      ).musicTest.calls.filter((call) => call.command === 'music_change')
        .length,
  );
  expect(writes).toBe(1);
});
