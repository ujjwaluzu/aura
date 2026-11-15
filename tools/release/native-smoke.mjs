import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { fileHash, root, runPnpmAsync } from './common.mjs';

if (process.platform !== 'win32')
  throw new Error('The packaged WebView smoke test runs on Windows.');
const directory = join(root, 'artifacts/release-checks');
const profile = join(directory, 'isolated-profile');
const report = join(directory, 'native-smoke.json');
const binary = join(root, 'src-tauri/target/release/aura.exe');
if (!existsSync(binary))
  throw new Error(
    'Build the Windows release executable before running the native smoke test.',
  );
mkdirSync(join(profile, 'app-data'), { recursive: true });
mkdirSync(join(profile, 'webview'), { recursive: true });
const probe = await import('node:net').then(
  ({ createServer }) =>
    new Promise((resolve, reject) => {
      const server = createServer();
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        server.close((error) =>
          error ? reject(error) : resolve(address.port),
        );
      });
    }),
);
const endpoint = `http://127.0.0.1:${probe}`;
const startedAt = new Date().toISOString();
const child = spawn(binary, ['--isolated-test-profile'], {
  cwd: root,
  windowsHide: true,
  stdio: 'ignore',
  env: {
    ...process.env,
    AURA_TEST_PROFILE: join(profile, 'app-data'),
    WEBVIEW2_USER_DATA_FOLDER: join(profile, 'webview'),
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${probe} --remote-debugging-address=127.0.0.1`,
  },
});
let passed = false;
let failure;
try {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null)
      throw new Error(
        `Aura exited before its WebView became available (${child.exitCode}).`,
      );
    try {
      const response = await fetch(`${endpoint}/json/version`, {
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok) break;
    } catch {
      // The WebView endpoint refuses connections until Aura starts.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const version = await fetch(`${endpoint}/json/version`, {
    signal: AbortSignal.timeout(2000),
  });
  if (!version.ok)
    throw new Error(
      'The packaged Aura WebView did not expose its process-local smoke-test endpoint.',
    );
  await runPnpmAsync(
    [
      'exec',
      'playwright',
      'test',
      'tests/native.spec.ts',
      '--workers=1',
      '--reporter=list',
    ],
    {
      AURA_NATIVE_CDP: endpoint,
      AURA_TEST_OUTPUT: join(directory, 'native-browser'),
    },
  );
  passed = true;
} catch (error) {
  failure = error instanceof Error ? error.message : String(error);
} finally {
  let browser;
  try {
    browser = await chromium.connectOverCDP(endpoint, { timeout: 2000 });
    const host = browser
      .contexts()[0]
      ?.pages()
      .find((page) => /tauri\.localhost|127\.0\.0\.1:1420/.test(page.url()));
    await host
      ?.evaluate(
        "window.__TAURI_INTERNALS__.invoke('plugin:window|close', {label:'widget-host'})",
      )
      .catch(() => {});
  } catch {
    // Aura may have already closed during native test cleanup.
  }
  if (browser) await browser.close().catch(() => {});
  if (child.exitCode === null) {
    await Promise.race([
      new Promise((resolve) => child.once('exit', resolve)),
      new Promise((resolve) => setTimeout(resolve, 8000)),
    ]);
    if (child.exitCode === null) child.kill();
  }
  const state = {
    passed,
    binarySha256: fileHash(binary),
    startedAt,
    completedAt: new Date().toISOString(),
    profileIsolation:
      'explicit process-local Aura profile and separate WebView2 data directory',
    ...(failure ? { failure } : {}),
  };
  writeFileSync(report, `${JSON.stringify(state, null, 2)}\n`);
}
if (!passed)
  throw new Error(failure ?? 'The packaged native smoke test failed.');
console.log(`Packaged native WebView smoke test passed; report: ${report}`);
