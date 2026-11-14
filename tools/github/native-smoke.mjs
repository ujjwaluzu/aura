// Real WebView2/Rust smoke check. No tokens or raw provider errors are printed.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';

const browser = await chromium.connectOverCDP(
  process.env.AURA_NATIVE_CDP ?? 'http://127.0.0.1:9228',
);
try {
  const host = browser
    .contexts()[0]
    ?.pages()
    .find(
      (page) =>
        /tauri.localhost|127.0.0.1:1420/.test(page.url()) &&
        !page.url().includes('window=settings'),
    );
  assert(host, 'No task-owned Aura widget host found.');
  const invoke = (command, args = {}) =>
    host.evaluate(
      ({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args),
      { command, args },
    );
  const mode = process.argv[2] ?? 'status';
  let state = await invoke('github_status');
  assert.equal(
    state.configured,
    true,
    'The OAuth client ID is not configured.',
  );
  if (mode === 'start') {
    if (
      await host.getByRole('button', { name: 'Next widget page' }).isEnabled()
    )
      await host.getByRole('button', { name: 'Next widget page' }).click();
    if (state.status !== 'connected') {
      await invoke('github_start_authorization');
      const deadline = Date.now() + 35_000;
      while (Date.now() < deadline) {
        state = await invoke('github_status');
        if (state.authorization || state.status === 'failed') break;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      assert(
        state.authorization,
        'GitHub did not issue a verification code. Check device flow and connectivity.',
      );
      console.log(
        JSON.stringify({
          status: state.status,
          userCode: state.authorization.userCode,
          expiresAt: state.authorization.expiresAt,
        }),
      );
      await invoke('github_open_destination', { destination: 'verification' });
    } else
      console.log(
        JSON.stringify({ status: state.status, hasCalendar: !!state.calendar }),
      );
  } else if (mode === 'quit') {
    await host.getByRole('button', { name: 'Quit Aura', exact: true }).click();
  } else if (mode === 'verify') {
    assert.equal(
      state.status,
      'connected',
      'Complete browser authorization first.',
    );
    const revision = state.revision;
    await invoke('github_refresh', { onlyIfStale: false });
    const deadline = Date.now() + 35_000;
    while (Date.now() < deadline) {
      state = await invoke('github_status');
      if (state.revision > revision && !state.refreshing && state.calendar)
        break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    assert.equal(
      state.stale,
      false,
      'The API request failed or was rate limited.',
    );
    assert(
      state.calendar,
      'No authenticated contribution calendar was returned.',
    );
    assert.equal(state.revision > revision, true);
    const days = state.calendar.weeks.flatMap((week) => week.contributionDays);
    assert(days.length >= 365 && days.length <= 378);
    assert(
      !/access_token|refresh_token|device_code|fixture-access/.test(
        JSON.stringify(state),
      ),
    );
    await host
      .locator('.github-calendar')
      .waitFor({ state: 'visible', timeout: 5000 });
    await host
      .getByRole('region', { name: 'GitHub activity overview' })
      .waitFor({ state: 'visible' });
    assert.equal(
      await host.getByRole('region', { name: 'Clock', exact: true }).count(),
      0,
    );
    assert(
      (await host.locator('.github-total').innerText()).includes(
        state.calendar.totalContributions.toLocaleString(),
      ),
    );
    console.log(
      JSON.stringify({
        status: state.status,
        weeks: state.calendar.weeks.length,
        days: days.length,
        totalContributions: state.calendar.totalContributions,
        updatedAt: state.calendar.updatedAt,
      }),
    );
    await host.screenshot({ path: 'artifacts/github-native.png' });
  } else {
    console.log(
      JSON.stringify({
        status: state.status,
        hasCalendar: !!state.calendar,
        stale: state.stale,
        configured: state.configured,
        retryAt: state.retryAt,
        message: state.message,
      }),
    );
  }
} catch (error) {
  if (error instanceof assert.AssertionError) console.error(error.message);
  else if (typeof error?.code === 'string')
    console.error(`Native command failed: ${error.code}`);
  console.error(
    'Native GitHub smoke check could not complete. Check Aura’s GitHub slide for recovery.',
  );
  process.exitCode = 1;
} finally {
  await browser.close();
}
