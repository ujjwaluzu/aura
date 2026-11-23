import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { build } from 'vite';
import { fileHash, root } from '../release/common.mjs';

const preview = process.argv.includes('--preview');
const directory = join(root, 'website/public');
mkdirSync(directory, { recursive: true });
let metadata;
if (!preview) {
  const manifestPath = resolve(
    process.env.AURA_RELEASE_MANIFEST ??
      'artifacts/public-release/release-manifest.json',
  );
  const installer = resolve(
    process.env.AURA_RELEASE_INSTALLER ??
      `artifacts/public-release/Aura_${JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version}_x64-setup.exe`,
  );
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const version = JSON.parse(
    readFileSync(join(root, 'package.json'), 'utf8'),
  ).version;
  if (
    manifest.version !== version ||
    manifest.installer.name !== `Aura_${version}_x64-setup.exe` ||
    manifest.installer.sha256 !== fileHash(installer) ||
    manifest.installer.sizeBytes !== statSync(installer).size ||
    manifest.installer.authenticodeStatus !== 'NotSigned' ||
    manifest.releaseGates.publicDistributionApproved !== false ||
    manifest.verifiedExecutableSha256 !== manifest.executable.sha256
  )
    throw new Error(
      'Release manifest does not match the unsigned beta installer and gates.',
    );
  metadata = {
    version,
    filename: manifest.installer.name,
    sizeBytes: manifest.installer.sizeBytes,
    sha256: manifest.installer.sha256,
    unsigned: true,
    architecture: 'Windows x64',
    releaseUrl: `https://github.com/ujjwaluzu/aura/releases/tag/v${version}`,
    downloadUrl: `https://github.com/ujjwaluzu/aura/releases/download/v${version}/${manifest.installer.name}`,
  };
  writeFileSync(
    join(directory, 'release.json'),
    `${JSON.stringify(metadata, null, 2)}\n`,
  );
  copyFileSync(manifestPath, join(directory, 'release-manifest.json'));
  writeFileSync(
    join(directory, 'SHA256SUMS.txt'),
    `${metadata.sha256}  ${metadata.filename}\n`,
  );
}
await build({ configFile: join(root, 'website/vite.config.mjs') });
if (metadata) {
  const indexPath = join(root, 'website/dist/index.html');
  let html = readFileSync(indexPath, 'utf8');
  let downloadButtons = 0;
  html = html.replace(
    /<a\b[^>]*class="button download-link"[^>]*>/g,
    (anchor) => {
      downloadButtons++;
      return anchor.replace(/href="[^"]*"/, `href="${metadata.downloadUrl}"`);
    },
  );
  if (downloadButtons !== 2)
    throw new Error(
      'Expected both versioned download buttons in the static page.',
    );
  html = html
    .replaceAll(
      'Size available with verified release',
      `${(metadata.sizeBytes / 1048576).toFixed(2)} MiB`,
    )
    .replaceAll(
      'Awaiting verified release metadata',
      `${(metadata.sizeBytes / 1048576).toFixed(2)} MiB`,
    )
    .replaceAll(
      'SHA-256 appears after the release is verified.',
      `SHA-256: ${metadata.sha256}`,
    );
  writeFileSync(indexPath, html);
}
