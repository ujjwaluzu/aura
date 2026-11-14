import { expect, test, type Page } from '@playwright/test';
import { mockGithub } from './fixtures/github';
test.use({ reducedMotion: 'reduce' });
const nextPage = (page: Page) =>
  page.getByRole('button', { name: 'Next widget page' });
const previousPage = (page: Page) =>
  page.getByRole('button', { name: 'Previous widget page' });
async function openWork(page: Page) {
  await page.goto('/');
  await nextPage(page).click();
  await expect(nextPage(page)).toBeEnabled();
  await nextPage(page).click();
}
async function signal(page: Page, name: 'approve' | 'deny' | 'workOffline') {
  await page.evaluate(
    (name) =>
      (
        window as unknown as { githubTest: Record<string, () => void> }
      ).githubTest[name](),
    name,
  );
}

async function expectWorkToFit(page: Page) {
  const violations = await page.evaluate(() => {
    const failures: string[] = [];
    const panel = document
      .querySelector('.github-work-card')!
      .getBoundingClientRect();
    const tools = document
      .querySelector('.host-tools')!
      .getBoundingClientRect();
    if (panel.top < tools.bottom + 4)
      failures.push('Panel touches window controls');
    const selectors = [
      '.github-work-row',
      '.github-work-row strong',
      '.github-work-age',
      '.github-work-meta',
      '.github-work-repository-name',
      '.github-work-number',
      '.github-work-review',
      '.github-work-checks',
      '.github-work-heading h3',
      '.github-work-account',
      '.github-work-health',
      '.github-work-updated',
      '.github-view-all',
      '.github-work-pagination',
      '.github-work-pagination button',
      '.github-actions > button',
      '.github-account > button',
      '.github-menu button',
      '.github-work-tiles button',
      '.github-work-tiles strong',
      '.github-work-tiles button > span:first-child',
      '.clock-page-nav > button',
      '.github-onboarding > p',
      '.github-connect-actions button',
      '.github-code',
      '.github-onboarding .github-connect-button',
      '.github-work-access-message',
    ].join(',');
    for (const element of Array.from(
      document.querySelectorAll<HTMLElement>(selectors),
    )) {
      if (!element.getClientRects().length) continue;
      const box = element.getBoundingClientRect();
      const root = element
        .closest('.github-work-sidebar, .github-work-card')
        ?.getBoundingClientRect();
      if (!root) continue;
      const name = element.className || element.tagName;
      if (
        box.left < root.left - 1 ||
        box.right > root.right + 1 ||
        box.top < root.top - 1 ||
        box.bottom > root.bottom + 1
      )
        failures.push(`${name}: outside panel`);
      if (element.scrollHeight > element.clientHeight + 1)
        failures.push(
          `${name}: text clipped vertically (${element.clientHeight}/${element.scrollHeight})`,
        );
      const ellipsis = element.matches(
        '.github-work-title, .github-work-repository-name, .github-work-account',
      );
      if (!ellipsis && element.scrollWidth > element.clientWidth + 1)
        failures.push(`${name}: text clipped horizontally`);
      if (
        ellipsis &&
        element.scrollWidth > element.clientWidth &&
        getComputedStyle(element).textOverflow !== 'ellipsis'
      )
        failures.push(`${name}: missing ellipsis`);
      const row = element.closest('.github-work-row');
      if (row && element !== row) {
        const bounds = row.getBoundingClientRect();
        if (
          box.top < bounds.top ||
          box.bottom > bounds.bottom ||
          box.left < bounds.left ||
          box.right > bounds.right
        )
          failures.push(`${name}: outside row`);
      }
    }
    const tiles = document
      .querySelector('.github-work-tiles')!
      .getBoundingClientRect();
    const nav = document
      .querySelector('.clock-page-nav')!
      .getBoundingClientRect();
    if (nav.top < tiles.bottom + 8)
      failures.push('Categories overlap navigation');
    const list = document
      .querySelector('.github-work-list')
      ?.getBoundingClientRect();
    const footer = document
      .querySelector('.github-work-footer')
      ?.getBoundingClientRect();
    if (list && footer && list.bottom > footer.top)
      failures.push('Rows overlap footer');
    if (
      document.documentElement.scrollWidth > innerWidth ||
      document.documentElement.scrollHeight > innerHeight
    )
      failures.push('Window scrolls');
    return failures;
  });
  expect(violations).toEqual([]);
}

test('disconnected has two pages, authorization adds Work, disconnect returns to connection and restores focus', async ({
  page,
}) => {
  await mockGithub(page, { status: 'disconnected' });
  await page.goto('/');
  await expect(page.getByRole('status', { name: 'Widget page' })).toHaveText(
    'Widgets',
  );
  await nextPage(page).click();
  await expect(nextPage(page)).toBeDisabled();
  await expect(previousPage(page)).toBeFocused();
  await page
    .getByRole('button', { name: 'Connect GitHub', exact: true })
    .click();
  await signal(page, 'approve');
  await expect(page.getByRole('status', { name: 'Widget page' })).toContainText(
    'Activity',
  );
  await nextPage(page).click();
  await expect(page.getByRole('status', { name: 'Widget page' })).toHaveText(
    'Work',
  );
  await expect(previousPage(page)).toBeFocused();
  await page.getByRole('button', { name: 'GitHub account menu' }).click();
  await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Widget page' })).toHaveText(
    'Connect GitHub',
  );
  await expect(previousPage(page)).toBeFocused();
  await expect(nextPage(page)).toBeDisabled();
});

test('all categories show public/private records, full title hover, native IDs, checks and pagination', async ({
  page,
}) => {
  await mockGithub(page);
  await openWork(page);
  const tiles = page.getByRole('region', { name: 'GitHub Work categories' });
  await expect(
    tiles.getByRole('button', { name: 'Reviews 34' }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.github-work-row')).toHaveCount(3);
  await expect(page.locator('.github-work-row').first()).toHaveAttribute(
    'title',
    'A long title '.repeat(24),
  );
  await expect(page.locator('.github-work-row').nth(1)).toContainText(
    'Private',
  );
  await expect(page.locator('.github-work-row').first()).toContainText(
    'Checks unknown',
  );
  for (const [label, category] of [
    ['My PRs', 'myPrs'],
    ['Failing PRs', 'failingPrs'],
    ['Issues', 'issues'],
    ['Reviews', 'reviews'],
  ]) {
    await tiles.getByRole('button', { name: `${label} 34` }).click();
    await page.locator('.github-work-row').first().press('Enter');
    const call = await page.evaluate(() =>
      (
        window as unknown as {
          githubTest: { calls: { cmd: string; args: object }[] };
        }
      ).githubTest.calls
        .filter((c) => c.cmd === 'github_work_open')
        .at(-1),
    );
    expect(call?.args).toEqual({ category, id: `${category}-0` });
  }
  await page.getByRole('button', { name: 'Next Work results' }).click();
  await expect(page.locator('.github-work-pagination')).toContainText(
    '4–6 / 34',
  );
  for (let i = 0; i < 9; i++)
    await page.getByRole('button', { name: 'Next Work results' }).click();
  await expect(page.locator('.github-work-pagination')).toContainText(
    '31–33 / 34',
  );
  await page.getByRole('button', { name: 'Next Work results' }).click();
  await expect(page.locator('.github-work-row')).toHaveCount(1);
  await expect(
    page.getByRole('button', { name: 'Next Work results' }),
  ).toBeDisabled();
  await tiles.getByRole('button', { name: 'Issues 34' }).click();
  await previousPage(page).click();
  await previousPage(page).click();
  await nextPage(page).click();
  await nextPage(page).click();
  await expect(
    tiles.getByRole('button', { name: 'Issues 34' }),
  ).toHaveAttribute('aria-pressed', 'true');
});

test('permission upgrade preserves Activity through cancellation and denial and shares successful grant', async ({
  page,
}) => {
  await mockGithub(page, { workPermission: false });
  await openWork(page);
  await expect(
    page.getByText(/repo grant includes write access/),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Update GitHub permissions' }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Update GitHub permissions' }),
  ).toBeVisible();
  await previousPage(page).click();
  await expect(page.locator('.github-calendar')).toBeVisible();
  await nextPage(page).click();
  await page.getByRole('button', { name: 'Update GitHub permissions' }).click();
  await signal(page, 'deny');
  await expect(page.getByText(/authorization was denied/)).toBeVisible();
  await page.getByRole('button', { name: 'Update GitHub permissions' }).click();
  await signal(page, 'approve');
  await expect(page.locator('.github-work-row')).toHaveCount(3);
  await page.getByRole('button', { name: 'Refresh GitHub Work' }).click();
  await expect(page.getByText('ABCD-EFGH')).toHaveCount(0);
});

test('offline data keeps three pages, stale items and counts; revocation removes Work', async ({
  page,
}) => {
  await mockGithub(page);
  await openWork(page);
  await signal(page, 'workOffline');
  await expect(page.locator('.github-work-row')).toHaveCount(3);
  await expect(
    page.getByRole('button', { name: 'Show Work status' }),
  ).toContainText('Stale');
  await expect(page.getByRole('status', { name: 'Widget page' })).toContainText(
    'Work',
  );
  await page.getByRole('button', { name: 'Refresh GitHub Work' }).click();
  await expect(
    page.getByRole('button', { name: 'Show Work status' }),
  ).not.toContainText('Stale');
  await page.evaluate(() =>
    (
      window as unknown as { githubTest: { fail(s: string, m: string): void } }
    ).githubTest.fail('reconnectRequired', 'Reconnect your account.'),
  );
  await expect(page.getByRole('status', { name: 'Widget page' })).toContainText(
    'Connect GitHub',
  );
  await expect(
    page.getByRole('button', { name: 'Reconnect GitHub', exact: true }),
  ).toBeVisible();
});

for (const mode of ['empty', 'unavailable', 'limited'] as const) {
  test(`Work handles ${mode} results`, async ({ page }) => {
    await mockGithub(page, {
      workEmpty: mode === 'empty',
      workError: mode === 'unavailable',
      workLimited: mode === 'limited',
    });
    await openWork(page);
    if (mode === 'empty') {
      await expect(page.getByText('You’re all caught up.')).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Reviews 0' }),
      ).toBeVisible();
    } else if (mode === 'unavailable') {
      await expect(
        page.getByRole('button', { name: /Reviews.*unavailable/ }),
      ).toBeVisible();
      await expect(
        page.getByText('Work is unavailable. Refresh to retry.'),
      ).toBeVisible();
    } else
      await expect(
        page.getByRole('button', { name: 'Limited · View all on GitHub' }),
      ).toBeVisible();
  });
}
for (const theme of [
  'faulty-terminal',
  'galaxy',
  'letter-glitch',
  'pixel-snow',
]) {
  for (const viewport of [
    { width: 760, height: 264 },
    { width: 608, height: 211 },
  ]) {
    test(`Work keeps complete rows and controls in ${theme} at ${viewport.width}x${viewport.height}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await mockGithub(page, {
        theme,
        stale: true,
        longWorkFields: true,
        workCount: 1234567,
        workLimited: true,
        login: 'an-account-with-a-very-long-github-name',
        workMessage: 'Work could not refresh. Aura will retry automatically.',
      });
      await openWork(page);
      await expectWorkToFit(page);
      await expect(
        page.locator('.github-work-tiles strong').first(),
      ).toHaveText('1.2M');
      await expect(
        page.locator('.github-work-tiles button').first(),
      ).toHaveAttribute('title', /1,234,567/);
      await expect(page.locator('.github-work-number').first()).toHaveText(
        '#123456',
      );
      await expect(
        page.locator('.github-work-repository-name').first(),
      ).toHaveCSS('text-overflow', 'ellipsis');
      for (const label of ['My PRs', 'Failing PRs', 'Issues']) {
        const tile = page
          .getByRole('region', { name: 'GitHub Work categories' })
          .getByRole('button', { name: new RegExp(`^${label} `) });
        await tile.focus();
        await page.keyboard.press('Space');
        await expect(tile).toHaveAttribute('aria-pressed', 'true');
        await expectWorkToFit(page);
      }
      await page.getByRole('button', { name: 'GitHub account menu' }).click();
      await expectWorkToFit(page);
      await page
        .getByRole('button', { name: 'Manage GitHub authorization' })
        .focus();
      await page.keyboard.press('Escape');
      await expect(
        page.getByRole('button', { name: 'GitHub account menu' }),
      ).toBeFocused();
      await page.getByRole('button', { name: 'Show Work status' }).click();
      const dialog = page.getByRole('dialog', { name: 'Work status' });
      await expect(dialog).toContainText(
        'Work could not refresh. Aura will retry automatically.',
      );
      await expect(
        page.getByRole('button', { name: 'Close work status' }),
      ).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(
        page.getByRole('button', { name: 'Show Work status' }),
      ).toBeFocused();
      await page.getByRole('button', { name: /^My PRs / }).click();
      await page.screenshot({
        path: `artifacts/github-work-${theme}-${viewport.width}.png`,
      });
    });
  }
}
for (const viewport of [
  { width: 759, height: 263 },
  { width: 675, height: 234 },
]) {
  test(`Work fits fractional window rounding at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await mockGithub(page, {
      longWorkFields: true,
      stale: true,
      workCount: 1234567,
      workLimited: true,
    });
    await openWork(page);
    await expectWorkToFit(page);
  });
}
for (const state of [
  'permission',
  'authorizing',
  'denied',
  'loading',
  'empty',
  'error',
] as const) {
  test(`Work ${state} state fits the compact window`, async ({ page }) => {
    await page.setViewportSize({ width: 608, height: 211 });
    const auth = ['permission', 'authorizing', 'denied'].includes(state);
    await mockGithub(page, {
      workPermission: !auth,
      workLoading: state === 'loading',
      workEmpty: state === 'empty',
      workError: state === 'error',
    });
    await openWork(page);
    if (state === 'authorizing' || state === 'denied') {
      await page
        .getByRole('button', { name: 'Update GitHub permissions' })
        .click();
      if (state === 'denied') await signal(page, 'deny');
    }
    await expectWorkToFit(page);
    if (state === 'authorizing')
      await expect(page.getByText('ABCD-EFGH')).toBeVisible();
    if (state === 'denied')
      await expect(page.getByText(/authorization was denied/)).toBeVisible();
    await page.screenshot({ path: `artifacts/github-work-state-${state}.png` });
  });
}
