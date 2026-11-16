import { expect, test } from '@playwright/test';
import { mockGithub } from '../../tests/fixtures/github';
import { themes } from '../../src/features/themes/catalog';

// Render the actual React UI with synthetic IPC data. No production profile,
// account, token, network artwork or Google validation features are used.
for (const theme of themes) {
  test(`capture ${theme.id}`, async ({ page }) => {
    await page.clock.install({ time: new Date('2026-11-15T10:24:00+05:30') });
    await mockGithub(page, {
      theme: theme.id,
      login: 'demo-developer',
      end: '2026-11-15',
    });
    await page.addInitScript((themeId) => {
      const api = (
        window as unknown as {
          __TAURI_INTERNALS__: {
            invoke: (
              command: string,
              args?: Record<string, unknown>,
            ) => Promise<unknown>;
          };
        }
      ).__TAURI_INTERNALS__;
      const original = api.invoke;
      api.invoke = async (command, args) => {
        if (command === 'get_system_snapshot')
          return {
            cpuPercent: 20,
            memoryPercent: 40,
            usedMemoryBytes: 6871947674,
            totalMemoryBytes: 17179869184,
            sampledAtUnixMs: Date.now(),
          };
        if (command === 'get_preferences')
          return {
            themeId,
            layoutId: 'clock-left-stats-music',
            revision: 0,
            warning: null,
          };
        if (command === 'music_account_status')
          return {
            status: 'unavailable',
            validationBuild: false,
            name: null,
            channelId: null,
            message:
              'YouTube account features are not available in this public beta.',
          };
        if (command === 'music_playback_status')
          return {
            selectedId: 'demo-browser',
            message: null,
            sessions: [
              {
                id: 'demo-browser',
                source: 'msedge.exe',
                title: 'Morning Light',
                artist: 'Demo Artist',
                playing: true,
                positionSeconds: 84,
                updatedAtUnixMs: Date.now(),
                durationSeconds: 245,
                artwork: null,
                canPlay: true,
                canPause: true,
                canPrevious: true,
                canNext: true,
                canSeek: true,
              },
            ],
          };
        if (command === 'music_media_volume')
          return { available: true, level: 0.5, message: null };
        const result = await original(command, args);
        if (command === 'github_status' || command === 'github_refresh') {
          const state = result as {
            calendar: {
              login: string;
              totalContributions: number;
              weeks: {
                contributionDays: {
                  contributionCount: number;
                  contributionLevel: string;
                }[];
              }[];
            };
          };
          state.calendar.login = 'demo-developer';
          let total = 0;
          state.calendar.weeks.forEach((week, index) =>
            week.contributionDays.forEach((day, weekday) => {
              const level = (index * 7 + weekday * 3) % 5;
              day.contributionCount = level * 2;
              day.contributionLevel = [
                'NONE',
                'FIRST_QUARTILE',
                'SECOND_QUARTILE',
                'THIRD_QUARTILE',
                'FOURTH_QUARTILE',
              ][level]!;
              total += day.contributionCount;
            }),
          );
          state.calendar.totalContributions = total;
        }
        return result;
      };
    }, theme.id);
    await page.goto('/');
    await expect(page.getByLabel('Aura widget host')).toHaveAttribute(
      'data-theme',
      theme.id,
    );
    await expect(
      page.getByText('Morning Light', { exact: true }),
    ).toBeVisible();
    if (process.env.AURA_CAPTURE_THEME_BACKGROUNDS === '1') {
      await page.setViewportSize({ width: 640, height: 400 });
      await page.addStyleTag({
        content: `
          .host-surface > :not(.theme-background) { visibility: hidden !important; }
          .widget-frame { padding: 0 !important; }
          .host-surface {
            border: 0 !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            background: #070a0c !important;
            animation: none !important;
          }
          .theme-background { opacity: 1 !important; }
        `,
      });
      await expect(page.locator('.theme-background canvas')).toBeVisible();
      await page.screenshot({
        path: `website/public/images/theme-${theme.id}.png`,
      });
      return;
    }
    await page.screenshot({
      path: `website/public/images/widget-${theme.id}.png`,
      omitBackground: true,
    });
    if (theme.id === 'faulty-terminal') {
      await page.getByRole('button', { name: 'Next widget page' }).click();
      await expect(page.getByText('demo-developer').first()).toBeVisible();
      await page.screenshot({
        path: 'website/public/images/github-activity.png',
        omitBackground: true,
      });
      await page.setViewportSize({ width: 960, height: 720 });
      await page.goto('/?window=settings');
      await expect(page.getByRole('button', { name: / theme$/ })).toHaveCount(
        4,
      );
      await page.screenshot({ path: 'website/public/images/settings.png' });
    }
  });
}
