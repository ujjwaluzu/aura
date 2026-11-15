import { copyFileSync, mkdirSync, mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  archiveDirectory,
  authenticodeStatus,
  powerShell,
  root,
} from './common.mjs';

if (process.platform !== 'win32')
  throw new Error('Windows packaging preflight requires Windows.');
const signature = authenticodeStatus(process.execPath);
if (!signature) throw new Error('Authenticode inspection returned no status.');
const temporary = mkdtempSync(join(tmpdir(), 'aura-package-preflight-'));
const source = join(temporary, 'sample');
mkdirSync(source);
copyFileSync(join(root, 'LICENSE'), join(source, 'LICENSE.txt'));
const archive = join(temporary, 'sample.zip');
archiveDirectory(source, archive);
if (!statSync(archive).size)
  throw new Error('Archive preflight produced an empty file.');
console.log(
  `Windows packaging preflight passed with ${powerShell}: signature inspection (${signature}) and archive creation.`,
);
