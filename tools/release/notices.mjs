import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { capture, capturePnpm, executable, hash, root } from './common.mjs';

const groups = new Map();
const components = [];
function addNotice(label, filename, content) {
  const key = hash(content);
  const entry = groups.get(key) ?? { labels: [], content };
  entry.labels.push(`${label} — ${filename}`);
  groups.set(key, entry);
}
function collect(
  kind,
  name,
  version,
  license,
  directory,
  repository,
  licenseFile,
) {
  const filenames = new Set(
    readdirSync(directory).filter((file) =>
      /^(licen[sc]e|copying|notice)([._-].*)?$/i.test(file),
    ),
  );
  if (licenseFile) {
    const path = resolve(directory, licenseFile);
    if (!relative(directory, path).startsWith('..') && existsSync(path))
      filenames.add(relative(directory, path));
  }
  let notices = 0;
  for (const filename of [...filenames].sort()) {
    const path = join(directory, filename);
    const info = statSync(path);
    if (!info.isFile() || info.size > 512 * 1024) continue;
    addNotice(
      `${kind}: ${name}@${version}`,
      filename,
      readFileSync(path, 'utf8').trim(),
    );
    notices++;
  }
  components.push({
    kind,
    name,
    version,
    license: license ?? 'Not specified',
    repository: repository ?? null,
    notices,
  });
}

const javascript = JSON.parse(
  capturePnpm(['licenses', 'list', '--prod', '--json']),
);
for (const packages of Object.values(javascript)) {
  for (const pkg of packages) {
    for (const directory of pkg.paths) {
      const manifest = JSON.parse(
        readFileSync(join(directory, 'package.json'), 'utf8'),
      );
      collect(
        'JavaScript',
        pkg.name,
        manifest.version,
        pkg.license,
        directory,
        pkg.homepage,
      );
    }
  }
}
const cargo = JSON.parse(
  capture(executable('cargo'), [
    'metadata',
    '--manifest-path',
    'src-tauri/Cargo.toml',
    '--locked',
    '--format-version',
    '1',
    '--filter-platform',
    'x86_64-pc-windows-msvc',
  ]),
);
const resolved = new Set(cargo.resolve.nodes.map((node) => node.id));
for (const pkg of cargo.packages) {
  if (!resolved.has(pkg.id) || cargo.workspace_members.includes(pkg.id))
    continue;
  collect(
    'Rust',
    pkg.name,
    pkg.version,
    pkg.license,
    dirname(pkg.manifest_path),
    pkg.repository,
    pkg.license_file,
  );
}
for (const [label, file] of [
  ['React Bits by David Haz', 'src/components/themes/react-bits-LICENSE.md'],
  ['GitHub mark', 'public/icons/github-LICENSE.txt'],
])
  addNotice(
    label,
    basename(file),
    readFileSync(join(root, file), 'utf8').trim(),
  );

components.sort((a, b) =>
  `${a.kind}:${a.name}:${a.version}`.localeCompare(
    `${b.kind}:${b.name}:${b.version}`,
  ),
);
const notices = [
  'Aura — third-party software notices',
  'Generated from the committed JavaScript and Rust dependency graphs. This inventory also includes native build dependencies.',
  'License identifiers and available bundled notices are recorded below; application release approval is separate.',
  '',
  'COMPONENT INVENTORY',
  ...components.map(
    (pkg) =>
      `${pkg.kind}: ${pkg.name}@${pkg.version} — ${pkg.license}${pkg.notices ? '' : ' (license identifier only; no root notice file supplied)'}`,
  ),
  '',
  'LICENSE TEXTS AND NOTICES',
  ...[...groups.values()].map(
    (group) =>
      `${'='.repeat(72)}\n${group.labels.join('\n')}\n\n${group.content}`,
  ),
].join('\n');
writeFileSync(join(root, 'public/THIRD-PARTY-NOTICES.txt'), `${notices}\n`);
writeFileSync(
  join(root, 'public/third-party-components.json'),
  `${JSON.stringify({ components }, null, 2)}\n`,
);
console.log(
  `Generated notices for ${components.length} dependency entries and the bundled visual assets.`,
);
