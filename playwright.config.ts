import { defineConfig, devices } from '@playwright/test';

const native = Boolean(process.env.AURA_NATIVE_CDP);

export default defineConfig({
  testDir: './tests',
  testMatch: native
    ? 'native.spec.ts'
    : [
        'browser.spec.ts',
        'music.spec.ts',
        'viewport.spec.ts',
        'github.spec.ts',
        'github-work.spec.ts',
        'production.spec.ts',
      ],
  fullyParallel: !native,
  forbidOnly: Boolean(process.env.CI),
  workers: native || process.env.CI ? 1 : 2,
  outputDir: process.env.AURA_TEST_OUTPUT ?? 'test-results',
  timeout: 60_000,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:1420',
    viewport: { width: 760, height: 264 },
    trace: 'retain-on-failure',
  },
  ...(!native
    ? {
        webServer: {
          command: 'pnpm.cmd dev',
          url: 'http://127.0.0.1:1420',
          reuseExistingServer: !process.env.CI,
          timeout: 30_000,
        },
      }
    : {}),
});
