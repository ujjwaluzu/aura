import { expect, test } from '@playwright/test';
import { mockGithub } from './fixtures/github';
test.use({ timezoneId: 'America/Los_Angeles', reducedMotion: 'reduce' });

const open = async (page: import('@playwright/test').Page) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Next widget page' }).click();
};
test('native events update today from zero to three while the other slide is open', async ({
  page,
}) => {
  await mockGithub(page);
  await open(page);
  await expect(page.locator('.github-total')).toContainText('0 contributions');
  await page.getByRole('button', { name: 'Previous widget page' }).click();
  await page.evaluate(() =>
    (
      window as unknown as { githubTest: { updateToday(): void } }
    ).githubTest.updateToday(),
  );
  await page.getByRole('button', { name: 'Next widget page' }).click();
  await expect(page.locator('.github-total')).toContainText('3 contributions');
  await expect(
    page.getByRole('region', { name: 'Clock', exact: true }),
  ).toHaveCount(0);
  const overview = page.getByRole('region', {
    name: 'GitHub activity overview',
  });
  await expect(overview.locator('.github-recent-activity dd')).toHaveText('3');
  await expect(overview.locator('.github-overview-stats dd')).toHaveText([
    '1',
    '3',
  ]);
  await expect(page.locator('.github-day').last()).toHaveAttribute(
    'data-level',
    'THIRD_QUARTILE',
  );
});
test('manual refresh updates zero to three and day navigation preserves UTC dates', async ({
  page,
}) => {
  await mockGithub(page, { end: '2024-02-29' });
  await open(page);
  await page
    .getByRole('button', { name: 'Refresh GitHub contributions' })
    .click();
  await expect(page.locator('.github-total')).toContainText('3 contributions');
  const last = page.locator('.github-day').last();
  await last.focus();
  await expect(page.locator('.github-day-detail')).toContainText(
    'February 29, 2024',
  );
  await last.press('ArrowLeft');
  await expect(page.locator('.github-day-detail')).toContainText(
    'February 22, 2024',
  );
  await page.keyboard.press('Home');
  await expect(page.locator('.github-day').first()).toBeFocused();
  await page.keyboard.press('End');
  await expect(last).toBeFocused();
});
test('device authorization supports copy, browser, cancel, denial and retry', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await mockGithub(page, { status: 'disconnected' });
  await open(page);
  await page
    .getByRole('button', { name: 'Connect GitHub', exact: true })
    .click();
  await expect(page.getByText('ABCD-EFGH')).toBeVisible();
  await page.getByRole('button', { name: 'Copy', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    'ABCD-EFGH',
  );
  await page.getByRole('button', { name: 'Open GitHub', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByText('ABCD-EFGH')).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Connect GitHub', exact: true })
    .click();
  await page.evaluate(() =>
    (window as unknown as { githubTest: { deny(): void } }).githubTest.deny(),
  );
  await expect(page.getByText(/authorization was denied/)).toBeVisible();
  await page
    .getByRole('button', { name: 'Connect GitHub', exact: true })
    .click();
  await expect(page.getByText('ABCD-EFGH')).toBeVisible();
});
test('offline and reconnect states retain cached counts, disconnect ignores old events', async ({
  page,
}) => {
  await mockGithub(page);
  await open(page);
  await page
    .getByRole('button', { name: 'Refresh GitHub contributions' })
    .click();
  await page.evaluate(() =>
    (
      window as unknown as {
        githubTest: { fail(status: string, message: string): void };
      }
    ).githubTest.fail('connected', 'Offline. Aura will retry automatically.'),
  );
  await expect(page.locator('.github-total')).toContainText('3 contributions');
  await expect(page.locator('.github-update')).toContainText('Stale');
  await page.evaluate(() =>
    (
      window as unknown as {
        githubTest: { fail(status: string, message: string): void };
      }
    ).githubTest.fail('reconnectRequired', 'Reconnect your account.'),
  );
  await expect(
    page.getByRole('button', { name: 'Reconnect GitHub', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'GitHub account menu' }).click();
  await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
  await page.evaluate(() =>
    (
      window as unknown as { githubTest: { oldEvent(): void } }
    ).githubTest.oldEvent(),
  );
  await expect(page.locator('.github-calendar')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Connect GitHub', exact: true }),
  ).toBeVisible();
});
for (const theme of ['faulty-terminal']) {
  test(`54 calendar columns and account controls fit ${theme} without clipping`, async ({
    page,
  }) => {
    await mockGithub(page, {
      theme,
      end: '2029-01-01',
      stale: true,
      error:
        'GitHub is unreachable or limiting requests. Aura will retry automatically.',
    });
    await open(page);
    await expect(page.locator('.github-week')).toHaveCount(54);
    await expect(page.locator('.github-day')).toHaveCount(367);
    const cell = await page.locator('.github-day').first().boundingBox();
    expect(cell!.width).toBeGreaterThan(7);
    expect(cell!.height).toBeGreaterThanOrEqual(8);
    const invalid = await page.evaluate(() => {
      const card = document
        .querySelector('.github-card')!
        .getBoundingClientRect();
      const tools = document
        .querySelector('.host-tools')!
        .getBoundingClientRect();
      return (
        card.top < tools.bottom + 4 ||
        Array.from(
          document.querySelectorAll<HTMLElement>(
            '.github-card button, .github-month, .github-footnote, .github-message, .github-update',
          ),
        ).some((el) => {
          const b = el.getBoundingClientRect();
          return (
            b.width > 0 &&
            (b.left < card.left ||
              b.right > card.right + 1 ||
              b.top < card.top ||
              b.bottom > card.bottom)
          );
        }) ||
        document.documentElement.scrollWidth > innerWidth ||
        document.documentElement.scrollHeight > innerHeight
      );
    });
    expect(invalid).toBe(false);
    await page.getByRole('button', { name: 'GitHub account menu' }).click();
    await expect(
      page.getByRole('button', { name: 'Manage GitHub authorization' }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Manage GitHub authorization' })
      .focus();
    await page.keyboard.press('Escape');
    await expect(
      page.getByRole('button', { name: 'GitHub account menu' }),
    ).toBeFocused();
    await page.screenshot({ path: `artifacts/github-${theme}.png` });
  });
}
