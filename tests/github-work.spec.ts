import { expect, test, type Page } from '@playwright/test';
import { mockGithub } from './fixtures/github';
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
  await expect(page.locator('.github-update')).toContainText('Stale');
  await expect(page.getByRole('status', { name: 'Widget page' })).toContainText(
    'Work',
  );
  await page.getByRole('button', { name: 'Refresh GitHub Work' }).click();
  await expect(page.locator('.github-update')).not.toContainText('Stale');
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
for (const theme of ['violet', 'ocean', 'jade', 'amber', 'rose']) {
  test(`Work fits ${theme} at fractional sizing and supports keyboard controls`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 608, height: 211 }); // 125% display scaling.
    await mockGithub(page, { theme, stale: true });
    await openWork(page);
    await page.getByRole('button', { name: 'My PRs 34' }).focus();
    await page.keyboard.press('Space');
    await expect(
      page.getByRole('button', { name: 'My PRs 34' }),
    ).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'GitHub account menu' }).click();
    await page
      .getByRole('button', { name: 'Manage GitHub authorization' })
      .focus();
    await page.keyboard.press('Escape');
    await expect(
      page.getByRole('button', { name: 'GitHub account menu' }),
    ).toBeFocused();
    const clipped = await page.evaluate(() => {
      const card = document
        .querySelector('.host-surface')!
        .getBoundingClientRect();
      return Array.from(
        document.querySelectorAll<HTMLElement>(
          '.github-work-row, .github-work-tiles button, .github-update, .github-work-footer, .clock-page-nav',
        ),
      )
        .filter((el) => {
          const b = el.getBoundingClientRect();
          return (
            b.left < card.left ||
            b.right > card.right ||
            b.top < card.top ||
            b.bottom > card.bottom ||
            el.scrollHeight > el.clientHeight + 1
          );
        })
        .map((el) => el.className);
    });
    expect(clipped).toEqual([]);
    await page.screenshot({ path: `artifacts/github-work-${theme}.png` });
  });
}
