// Build-time configuration only. Never put credentials in VITE_* variables.
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const file = new URL('../../.env.music.local', import.meta.url);
const env = { ...process.env };
if (existsSync(file)) {
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(
      /^(AURA_MUSIC_CLIENT_ID|AURA_MUSIC_CLIENT_SECRET)=(.*)$/,
    );
    if (match) env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
}
if (!env.AURA_MUSIC_CLIENT_ID || !env.AURA_MUSIC_CLIENT_SECRET) {
  throw new Error(
    'Set AURA_MUSIC_CLIENT_ID and AURA_MUSIC_CLIENT_SECRET in .env.music.local. See docs/youtube-music.md.',
  );
}
// Use the Node entry point to avoid a shell interpreting client configuration.
const result = spawnSync(
  process.execPath,
  [
    fileURLToPath(
      new URL('../../node_modules/@tauri-apps/cli/tauri.js', import.meta.url),
    ),
    'dev',
    '--features',
    'music-validation',
  ],
  { cwd: root, env, stdio: 'inherit', windowsHide: true },
);
process.exitCode = result.status ?? 1;
