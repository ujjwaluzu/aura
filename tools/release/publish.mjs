import { execFileSync, spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileHash, root, sourceState } from './common.mjs';

const mode = process.argv[2];
if (!['stage', 'publish', 'verify-public'].includes(mode))
  throw new Error('Use stage, publish or verify-public.');
const version = JSON.parse(
  readFileSync(join(root, 'package.json'), 'utf8'),
).version;
if (version !== '0.1.3-beta.1')
  throw new Error('This workflow is scoped to the approved beta.');
const tag = `v${version}`;
const repo = 'ujjwaluzu/aura';
const output = join(root, 'artifacts/public-release');
mkdirSync(output, { recursive: true });
const gh = (args) =>
  execFileSync('gh', args, {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
  }).trim();
// The REST release-by-tag endpoint omits drafts. The CLI resolves both drafts
// and published releases, then its API URL gives us the complete asset record.
const release = () => {
  const { apiUrl } = JSON.parse(
    gh(['release', 'view', tag, '--repo', repo, '--json', 'apiUrl']),
  );
  return JSON.parse(gh(['api', apiUrl]));
};
const assertRelease = (record) => {
  if (record.tag_name !== tag || !record.prerelease)
    throw new Error('Expected the versioned beta prerelease.');
};

if (mode === 'stage') {
  if (!process.env.AURA_GITHUB_CLIENT_ID?.match(/^[a-zA-Z0-9]+$/))
    throw new Error(
      'Configure the Aura-owned AURA_GITHUB_CLIENT_ID repository variable.',
    );
  const state = sourceState();
  if (state.dirty) throw new Error('Publish from a clean committed checkout.');
  const candidates = readdirSync(join(root, 'artifacts/release-candidate'), {
    withFileTypes: true,
  })
    .filter(
      (item) => item.isDirectory() && item.name.startsWith(`Aura-${version}-`),
    )
    .map((item) => join(root, 'artifacts/release-candidate', item.name));
  const candidate = candidates.findLast(
    (directory) =>
      JSON.parse(
        readFileSync(join(directory, 'candidate-manifest.json'), 'utf8'),
      ).source.fingerprint === state.fingerprint,
  );
  if (!candidate)
    throw new Error('No candidate verified for the current source.');
  const manifest = JSON.parse(
    readFileSync(join(candidate, 'candidate-manifest.json'), 'utf8'),
  );
  if (
    manifest.source.commit !== state.commit ||
    manifest.source.dirty ||
    manifest.verifiedExecutableSha256 !== manifest.executable.sha256 ||
    manifest.installer.authenticodeStatus !== 'NotSigned' ||
    manifest.releaseGates.publicDistributionApproved !== false ||
    manifest.releaseGates.youtubeDataApiValidated !== false
  )
    throw new Error(
      'Candidate source, signatures or release gates do not match this beta.',
    );
  for (const [name, expected] of Object.entries(manifest.files))
    if (fileHash(join(candidate, name)) !== expected)
      throw new Error(`Candidate checksum mismatch: ${name}`);
  for (const name of ['verification.json', 'native-smoke.json'])
    if (!JSON.parse(readFileSync(join(candidate, name), 'utf8')).passed)
      throw new Error(`Failed evidence: ${name}`);
  copyFileSync(
    join(candidate, manifest.installer.name),
    join(output, manifest.installer.name),
  );
  copyFileSync(
    join(candidate, 'candidate-manifest.json'),
    join(output, 'release-manifest.json'),
  );
  const archive = `Aura-${version}-evidence.zip`;
  copyFileSync(`${candidate}.zip`, join(output, archive));
  const names = [manifest.installer.name, 'release-manifest.json', archive];
  writeFileSync(
    join(output, 'SHA256SUMS.txt'),
    `${names.map((name) => `${fileHash(join(output, name))}  ${name}`).join('\n')}\n`,
  );
  const check = spawnSync('gh', ['release', 'view', tag, '--repo', repo], {
    windowsHide: true,
    stdio: 'ignore',
  });
  if (check.status === 0) {
    const current = release();
    assertRelease(current);
    if (!current.draft)
      throw new Error(
        'This beta is already published. Use the Pages-only retry; published bytes are never replaced.',
      );
    if (current.assets.length)
      throw new Error(
        'A beta draft already has assets. Inspect it before resuming; uploads never overwrite assets.',
      );
  } else {
    gh([
      'release',
      'create',
      tag,
      '--repo',
      repo,
      '--target',
      state.commit,
      '--draft',
      '--prerelease',
      '--title',
      `Aura ${version} — unsigned public beta`,
      '--notes-file',
      'docs/beta-release-notes.md',
    ]);
  }
  gh([
    'release',
    'upload',
    tag,
    ...[...names, 'SHA256SUMS.txt'].map((name) => join(output, name)),
    '--repo',
    repo,
  ]);
  // Download draft assets again to validate the uploaded bytes before publishing.
  const staged = join(output, 'draft-check');
  mkdirSync(staged, { recursive: true });
  gh([
    'release',
    'download',
    tag,
    '--repo',
    repo,
    '--dir',
    staged,
    '--clobber',
  ]);
  for (const name of [...names, 'SHA256SUMS.txt'])
    if (fileHash(join(output, name)) !== fileHash(join(staged, name)))
      throw new Error(`Draft upload mismatch: ${name}`);
  console.log(
    `Draft ${tag} uploaded and verified. The old release draft was untouched.`,
  );
} else if (mode === 'publish') {
  const current = release();
  assertRelease(current);
  if (!current.draft) throw new Error('Already published; use verify-public.');
  if (!existsSync(join(output, 'release-manifest.json')))
    throw new Error(
      'Stage and verify the draft in this run before publication.',
    );
  const stagedManifest = JSON.parse(
    readFileSync(join(output, 'release-manifest.json'), 'utf8'),
  );
  if (current.target_commitish !== stagedManifest.source.commit)
    throw new Error('Draft target changed after staging.');
  gh([
    'release',
    'edit',
    tag,
    '--repo',
    repo,
    '--draft=false',
    '--prerelease',
    '--latest=false',
  ]);
  console.log(
    `Published unsigned prerelease: https://github.com/${repo}/releases/tag/${tag}`,
  );
} else {
  const current = release();
  assertRelease(current);
  if (current.draft)
    throw new Error('Publish the release before deploying its download page.');
  const manifestAsset = current.assets.find(
    (asset) => asset.name === 'release-manifest.json',
  );
  if (!manifestAsset) throw new Error('Release manifest missing.');
  // Deliberately unauthenticated: verify what anonymous visitors receive.
  async function download(name) {
    const url = `https://github.com/${repo}/releases/download/${tag}/${name}`;
    let response;
    for (let attempt = 0; attempt < 6; attempt++) {
      response = await fetch(url);
      if (response.ok) break;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    if (!response?.ok)
      throw new Error(`Public download failed: ${name} (${response?.status}).`);
    writeFileSync(
      join(output, name),
      Buffer.from(await response.arrayBuffer()),
    );
  }
  await download('release-manifest.json');
  const manifest = JSON.parse(
    readFileSync(join(output, 'release-manifest.json'), 'utf8'),
  );
  if (
    manifest.version !== version ||
    manifest.installer.name !== `Aura_${version}_x64-setup.exe`
  )
    throw new Error('Wrong public release manifest.');
  await download(manifest.installer.name);
  await download('SHA256SUMS.txt');
  if (
    fileHash(join(output, manifest.installer.name)) !==
    manifest.installer.sha256
  )
    throw new Error('Public installer SHA-256 mismatch.');
  const checksums = readFileSync(join(output, 'SHA256SUMS.txt'), 'utf8');
  if (
    !checksums.includes(
      `${manifest.installer.sha256}  ${manifest.installer.name}`,
    ) ||
    !checksums.includes(
      `${fileHash(join(output, 'release-manifest.json'))}  release-manifest.json`,
    )
  )
    throw new Error('Public checksums disagree with release metadata.');
  console.log(
    `Anonymous public installer download verified: ${manifest.installer.sha256}`,
  );
}
