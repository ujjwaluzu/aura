import { capture, executable } from './common.mjs';

const audit = JSON.parse(
  capture('cargo.exe', [
    'audit',
    '--file',
    'src-tauri/Cargo.lock',
    '--target-os',
    'windows',
    '--format',
    'json',
    '--no-fetch',
  ]),
);
if (audit.vulnerabilities?.found)
  throw new Error(
    'RustSec found a vulnerability in the locked Rust dependency graph.',
  );
const findings = [
  ...(audit.warnings?.unmaintained ?? []),
  ...(audit.warnings?.unsound ?? []),
].map((item) => `${item.advisory?.id}:${item.package?.name}`);
const expected = [
  'RUSTSEC-2024-0370:proc-macro-error',
  'RUSTSEC-2024-0429:glib',
  // Single-instance's Linux D-Bus backend still uses zbus 5. These crates
  // merged into zbus 6 and are unmaintained, but absent from Windows builds.
  'RUSTSEC-2026-0371:zbus_names',
  'RUSTSEC-2026-0370:zvariant',
  'RUSTSEC-2026-0372:zvariant_derive',
];
if (
  findings.length !== expected.length ||
  expected.some((item) => !findings.includes(item))
) {
  throw new Error(
    `Unexpected RustSec warnings: ${findings.join(', ') || 'none'}`,
  );
}
for (const crate of expected.map((finding) => finding.split(':')[1])) {
  const graph = capture(executable('cargo'), [
    'tree',
    '--manifest-path',
    'src-tauri/Cargo.toml',
    '--locked',
    '--target',
    'x86_64-pc-windows-msvc',
    '-i',
    crate,
  ]);
  if (graph.trim())
    throw new Error(
      `RustSec exception ${crate} is present in the Windows dependency graph.`,
    );
}
capture('cargo.exe', [
  'audit',
  '--file',
  'src-tauri/Cargo.lock',
  '--target-os',
  'windows',
  ...expected.flatMap((finding) => ['--ignore', finding.split(':')[0]]),
  '--deny',
  'warnings',
  '--no-fetch',
]);
console.log(
  'RustSec passed: no Windows release vulnerabilities; reviewed non-Windows crate warnings are absent from the Windows target graph.',
);
