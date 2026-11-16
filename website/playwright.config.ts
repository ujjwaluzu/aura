import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  testDir: './tests',
  testMatch: ['website.spec.ts', 'motion.spec.ts'],
  workers: 1,
  outputDir: '../artifacts/website-tests',
  use: { baseURL: 'http://127.0.0.1:1430/aura/', trace: 'retain-on-failure' },
  projects: [
    {
      name: 'phone',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: 'tablet',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 768, height: 1024 },
      },
    },
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 1000 },
      },
    },
  ],
  webServer: {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    command:
      'pnpm.cmd exec vite preview --config website/vite.config.mjs --host 127.0.0.1 --port 1430',
    url: 'http://127.0.0.1:1430/aura/',
    reuseExistingServer: !process.env.CI,
  },
});
