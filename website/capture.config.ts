import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  testDir: './tests',
  testMatch: 'capture.spec.ts',
  workers: 1,
  outputDir: '../artifacts/website-capture',
  use: {
    baseURL: 'http://127.0.0.1:1420',
    viewport: { width: 760, height: 264 },
    locale: 'en-GB',
    timezoneId: 'Asia/Kolkata',
    reducedMotion: 'reduce',
  },
  webServer: {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    command: 'pnpm.cmd dev',
    url: 'http://127.0.0.1:1420',
    reuseExistingServer: !process.env.CI,
  },
});
