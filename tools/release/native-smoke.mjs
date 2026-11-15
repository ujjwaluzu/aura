import { execFileSync, spawn, spawnSync } from 'node:child_process';
import {
  mkdirSync,
  writeFileSync,
  existsSync,
  readFileSync,
  createWriteStream,
} from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { fileHash, root, runPnpmAsync } from './common.mjs';

if (process.platform !== 'win32')
  throw new Error('The packaged WebView smoke test runs on Windows.');
const integrity = execFileSync('whoami.exe', ['/groups', '/fo', 'csv', '/nh'], {
  encoding: 'utf8',
  windowsHide: true,
}).match(/S-1-16-\d+/)?.[0];
if (process.env.AURA_NATIVE_MEDIUM_LAUNCH && integrity !== 'S-1-16-8192')
  throw new Error(
    `Native test did not receive a normal-user token (${integrity}).`,
  );
if (process.env.GITHUB_ACTIONS === 'true' && integrity !== 'S-1-16-8192') {
  if (
    !process.env.AURA_NATIVE_GSUDO ||
    !existsSync(process.env.AURA_NATIVE_GSUDO)
  )
    throw new Error(
      'Prepare the pinned normal-user CI launcher before native testing.',
    );
  const launchedAt = Date.now();
  const result = spawnSync(
    process.env.AURA_NATIVE_GSUDO,
    [
      '--integrity',
      'Medium',
      '--direct',
      process.execPath,
      ...process.argv.slice(1),
    ],
    {
      cwd: root,
      windowsHide: true,
      stdio: 'inherit',
      env: { ...process.env, AURA_NATIVE_MEDIUM_LAUNCH: '1' },
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`Normal-user native test failed (${result.status}).`);
  const record = JSON.parse(
    readFileSync(
      join(
        process.env.AURA_NATIVE_OUTPUT ??
          join(root, 'artifacts/release-checks'),
        'native-smoke.json',
      ),
      'utf8',
    ),
  );
  if (
    !record.passed ||
    record.diagnostics.integrity !== 'S-1-16-8192' ||
    Date.parse(record.startedAt) < launchedAt ||
    record.binarySha256 !==
      fileHash(
        process.env.AURA_NATIVE_BINARY ??
          join(root, 'src-tauri/target/release/aura.exe'),
      )
  )
    throw new Error(
      'Normal-user launch did not produce a fresh passing native report for this executable.',
    );
  process.exit(0);
}
const startupState = () =>
  execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `
  $run = (Get-ItemProperty -LiteralPath 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' -ErrorAction SilentlyContinue).Aura
  $approved = (Get-ItemProperty -LiteralPath 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run' -ErrorAction SilentlyContinue).Aura
  [ordered]@{run=$run; approved=$approved} | ConvertTo-Json -Compress
`,
    ],
    { encoding: 'utf8', windowsHide: true },
  ).trim();
const startupBefore = startupState();
const directory =
  process.env.AURA_NATIVE_OUTPUT ?? join(root, 'artifacts/release-checks');
const profile = join(directory, 'isolated-profile');
const report = join(directory, 'native-smoke.json');
const binary =
  process.env.AURA_NATIVE_BINARY ??
  join(root, 'src-tauri/target/release/aura.exe');
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
const stdout = createWriteStream(join(directory, 'native-stdout.log'));
const stderr = createWriteStream(join(directory, 'native-stderr.log'));
const diagnostics = {
  endpoint,
  attempts: 0,
  lastEndpointError: null,
  spawnError: null,
};
const child = spawn(binary, ['--isolated-test-profile'], {
  cwd: root,
  windowsHide: true,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: {
    ...process.env,
    AURA_TEST_PROFILE: join(profile, 'app-data'),
    WEBVIEW2_USER_DATA_FOLDER: join(profile, 'webview'),
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${probe} --remote-debugging-address=127.0.0.1`,
  },
});
child.stdout.pipe(stdout);
child.stderr.pipe(stderr);
child.once('error', (error) => {
  diagnostics.spawnError = error.message;
});
let passed = false;
let failure;
try {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (diagnostics.spawnError) throw new Error(diagnostics.spawnError);
    if (child.exitCode !== null)
      throw new Error(
        `Aura exited before its WebView became available (${child.exitCode}).`,
      );
    try {
      diagnostics.attempts++;
      const response = await fetch(`${endpoint}/json/version`, {
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok) break;
    } catch (error) {
      diagnostics.lastEndpointError = String(error.cause ?? error);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const version = await fetch(`${endpoint}/json/version`, {
    signal: AbortSignal.timeout(2000),
  }).catch((error) => {
    throw new Error(
      `WebView2 CDP unavailable after ${diagnostics.attempts} attempts: ${error.cause ?? error}. Check WebView2 runtime and native-stderr.log.`,
    );
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
      AURA_EXPECT_ISOLATED: '1',
      AURA_TEST_OUTPUT: join(directory, 'native-browser'),
    },
  );
  if (existsSync(join(profile, 'app-data/startup-initialized-v1')))
    throw new Error('Isolated smoke test unexpectedly initialized startup.');
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
  if (startupState() !== startupBefore) {
    passed = false;
    failure = 'The isolated smoke test changed the real Windows startup state.';
  }
  const state = {
    passed,
    binarySha256: fileHash(binary),
    startedAt,
    completedAt: new Date().toISOString(),
    profileIsolation:
      'explicit process-local Aura profile and separate WebView2 data directory',
    startupUntouched: startupState() === startupBefore,
    diagnostics: {
      ...diagnostics,
      integrity,
      pid: child.pid,
      exitCode: child.exitCode,
    },
    ...(failure ? { failure } : {}),
  };
  writeFileSync(report, `${JSON.stringify(state, null, 2)}\n`);
}
if (!passed)
  throw new Error(failure ?? 'The packaged native smoke test failed.');
console.log(`Packaged native WebView smoke test passed; report: ${report}`);
