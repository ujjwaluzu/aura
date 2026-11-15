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
];
if (
  findings.length !== expected.length ||
  expected.some((item) => !findings.includes(item))
) {
  throw new Error(
    `Unexpected RustSec warnings: ${findings.join(', ') || 'none'}`,
  );
}
for (const crate of ['glib', 'proc-macro-error']) {
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
  '--ignore',
  'RUSTSEC-2024-0370',
  '--ignore',
  'RUSTSEC-2024-0429',
  '--deny',
  'warnings',
  '--no-fetch',
]);
console.log(
  'RustSec passed: no Windows release vulnerabilities; reviewed glib and unused proc-macro warnings are absent from the Windows target graph.',
);
