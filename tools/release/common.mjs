import { createHash } from 'node:crypto';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../../', import.meta.url));
export const windows = process.platform === 'win32';
export const executable = (name) => (windows ? `${name}.exe` : name);
export const hash = (value) => createHash('sha256').update(value).digest('hex');
export const fileHash = (path) => hash(readFileSync(path));

export function capture(command, args = []) {
  return execFileSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
  }).trim();
}

function pnpmArgs(args) {
  const cli = process.env.npm_execpath;
  if (!cli || !existsSync(cli))
    throw new Error('Run this command through pnpm.');
  return [cli, ...args];
}

export const capturePnpm = (args) => capture(process.execPath, pnpmArgs(args));

export function runPnpm(args, env = {}) {
  const result = spawnSync(process.execPath, pnpmArgs(args), {
    cwd: root,
    stdio: 'inherit',
    windowsHide: true,
    env: { ...process.env, ...env },
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`pnpm ${args.join(' ')} failed (${result.status}).`);
}

export function runPnpmAsync(args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, pnpmArgs(args), {
      cwd: root,
      stdio: 'inherit',
      windowsHide: true,
      env: { ...process.env, ...env },
    });
    child.once('error', reject);
    child.once('exit', (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`pnpm ${args.join(' ')} failed (${code}).`)),
    );
  });
}

export function sourceState() {
  const files = capture(executable('git'), [
    'ls-files',
    '-z',
    '--cached',
    '--others',
    '--exclude-standard',
  ])
    .split('\0')
    .filter(Boolean)
    .filter((file) => !file.startsWith('docs/') && file !== 'README.md')
    .sort()
    .map((file) => ({
      file,
      sha256: existsSync(join(root, file)) ? fileHash(join(root, file)) : null,
    }));
  return {
    commit: capture(executable('git'), ['rev-parse', 'HEAD']),
    dirty: Boolean(capture(executable('git'), ['status', '--porcelain'])),
    fingerprint: hash(JSON.stringify(files)),
    files,
  };
}
