import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { capture, fileHash, root, runPnpm, sourceState } from './common.mjs';

if (process.platform !== 'win32')
  throw new Error('Windows release candidates can only be built on Windows.');
const args = new Set(process.argv.slice(2));
if ([...args].some((arg) => arg !== '--reuse-verification'))
  throw new Error('Supported option: --reuse-verification.');
const checksPath = join(root, 'artifacts/release-checks/verification.json');
if (args.has('--reuse-verification')) {
  if (!existsSync(checksPath))
    throw new Error('No successful verification record is available to reuse.');
  const record = JSON.parse(readFileSync(checksPath, 'utf8'));
  if (!record.passed || record.source.fingerprint !== sourceState().fingerprint)
    throw new Error('Verification did not pass for the current source.');
  const age = Date.now() - Date.parse(record.completedAt);
  if (age < 0 || age > 12 * 60 * 60 * 1000)
    throw new Error(
      'Verification is older than 12 hours; run pnpm verify again.',
    );
} else runPnpm(['verify']);

const before = sourceState();
runPnpm(['audit', '--audit-level', 'moderate']);
runPnpm(['audit:native']);
runPnpm(['licenses:generate']);
runPnpm(['desktop:build']);
runPnpm(['test:native:isolated']);
const after = sourceState();
if (before.fingerprint !== after.fingerprint)
  throw new Error('Source files changed while building the candidate.');

const config = JSON.parse(
  readFileSync(join(root, 'src-tauri/tauri.conf.json'), 'utf8'),
);
const executable = join(root, 'src-tauri/target/release/aura.exe');
const installer = join(
  root,
  `src-tauri/target/release/bundle/nsis/${config.productName}_${config.version}_x64-setup.exe`,
);
const notice = join(root, 'dist/THIRD-PARTY-NOTICES.txt');
const components = join(root, 'dist/third-party-components.json');
for (const path of [executable, installer, notice, components])
  if (!existsSync(path))
    throw new Error(`Expected release output was not built: ${path}`);
const signature = execFileSync(
  'powershell.exe',
  [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    `(Get-AuthenticodeSignature -LiteralPath '${executable.replaceAll("'", "''")}').Status`,
  ],
  { cwd: root, encoding: 'utf8', windowsHide: true },
).trim();
const timestamp = new Date()
  .toISOString()
  .replaceAll(':', '')
  .replaceAll('-', '')
  .replaceAll('.', '');
const out = join(
  root,
  `artifacts/release-candidate/Aura-${config.version}-windows-x64-${timestamp}`,
);
mkdirSync(dirname(out), { recursive: true });
mkdirSync(out, { recursive: false });
for (const path of [
  installer,
  executable,
  notice,
  components,
  join(root, 'pnpm-lock.yaml'),
  join(root, 'src-tauri/Cargo.lock'),
  checksPath,
  join(root, 'artifacts/release-checks/native-smoke.json'),
  join(root, 'artifacts/release-checks/native-stdout.log'),
  join(root, 'artifacts/release-checks/native-stderr.log'),
]) {
  if (!existsSync(path))
    throw new Error(`Candidate evidence is missing: ${path}`);
  copyFileSync(path, join(out, basename(path)));
}
const native = JSON.parse(readFileSync(join(out, 'native-smoke.json'), 'utf8'));
if (!native.passed || native.binarySha256 !== fileHash(executable))
  throw new Error('Native smoke test did not validate this exact executable.');
const files = [
  'Aura.exe',
  basename(installer),
  'THIRD-PARTY-NOTICES.txt',
  'third-party-components.json',
  'pnpm-lock.yaml',
  'Cargo.lock',
  'verification.json',
  'native-smoke.json',
  'native-stdout.log',
  'native-stderr.log',
];
const manifest = {
  channel: 'unsigned public beta',
  product: config.productName,
  version: config.version,
  architecture: 'x86_64-pc-windows-msvc',
  builtAt: new Date().toISOString(),
  source: {
    commit: after.commit,
    dirty: after.dirty,
    fingerprint: after.fingerprint,
  },
  toolchain: {
    node: process.version,
    pnpm: capture(process.execPath, [process.env.npm_execpath, '--version']),
    rust: capture('rustc.exe', ['--version']),
    cargo: capture('cargo.exe', ['--version']),
  },
  executable: {
    name: 'Aura.exe',
    sha256: fileHash(executable),
    authenticodeStatus: signature,
  },
  installer: {
    name: basename(installer),
    sizeBytes: statSync(installer).size,
    sha256: fileHash(installer),
    authenticodeStatus: execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `(Get-AuthenticodeSignature -LiteralPath '${installer.replaceAll("'", "''")}').Status`,
      ],
      { cwd: root, encoding: 'utf8', windowsHide: true },
    ).trim(),
  },
  releaseGates: JSON.parse(
    readFileSync(join(root, 'src-tauri/music-release-gate.json'), 'utf8'),
  ),
  verifiedExecutableSha256: native.binarySha256,
  knownLimitations: [
    'Unsigned installer',
    'Clean-Windows testing pending',
    'Google account and library access gated',
    'Windows 11 is the primary locally tested environment',
  ],
  files: Object.fromEntries(
    files.map((name) => [name, fileHash(join(out, name))]),
  ),
};
writeFileSync(
  join(out, 'candidate-manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
const sumFiles = [...files, 'candidate-manifest.json']
  .map((name) => `${fileHash(join(out, name))}  ${name}`)
  .join('\n');
writeFileSync(join(out, 'SHA256SUMS.txt'), `${sumFiles}\n`);
const zip = `${out}.zip`;
execFileSync(
  'powershell.exe',
  [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    `Compress-Archive -LiteralPath '${out.replaceAll("'", "''")}' -DestinationPath '${zip.replaceAll("'", "''")}' -CompressionLevel Optimal`,
  ],
  { cwd: root, stdio: 'inherit', windowsHide: true },
);
console.log(`Windows release candidate is ready: ${out}`);
console.log(`Archive: ${zip}`);
