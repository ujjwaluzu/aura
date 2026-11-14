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
      ],
  fullyParallel: !native,
  workers: native ? 1 : 2,
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
