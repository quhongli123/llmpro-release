#!/usr/bin/env node
/**
 * Rewrites a Tauri updater manifest to public OBS URLs and prepares the
 * versioned upload directory used by the release workflow.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, join } from 'node:path';

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function compareVersions(left, right) {
  const a = left.split('.').map(Number);
  const b = right.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

const releaseTag = required('RELEASE_TAG');
const version = releaseTag.replace(/^v/, '');
if (!/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(releaseTag)) {
  throw new Error(`Invalid release tag: ${releaseTag}`);
}

const releaseDir = required('RELEASE_ASSET_DIR');
const uploadDir = required('OBS_UPLOAD_DIR');
const manifestPath = join(releaseDir, 'latest.json');
const stableManifestPath = process.env.STABLE_MANIFEST_PATH ?? 'updater/latest.json';
const publicBaseUrl = required('OBS_PUBLIC_BASE_URL').replace(/\/+$/, '');

if (!existsSync(manifestPath)) {
  throw new Error(`Release manifest not found: ${manifestPath}`);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (manifest.version !== version) {
  throw new Error(`Manifest version ${manifest.version} does not match ${version}`);
}

const assetNames = new Set(
  readdirSync(releaseDir).filter((name) => statSync(join(releaseDir, name)).isFile()),
);
const versionBaseUrl = `${publicBaseUrl}/llmpro/${version}`;

const installers = [
  `llmpro_${version}_aarch64.dmg`,
  `llmpro_${version}_x64-setup.exe`,
  `llmpro_${version}_x64_en-US.msi`,
];
for (const installer of installers) {
  if (!assetNames.has(installer) || statSync(join(releaseDir, installer)).size === 0) {
    throw new Error(`Missing or empty installer: ${installer}`);
  }
}

const macUpdater = 'llmpro_aarch64.app.tar.gz';
const [, nsis, msi] = installers;
const expectedUpdaters = {
  'darwin-aarch64': [macUpdater],
  'darwin-aarch64-app': [macUpdater],
  'windows-x86_64': [nsis, msi],
  'windows-x86_64-nsis': [nsis],
  'windows-x86_64-msi': [msi],
};
for (const platform of ['darwin-aarch64', 'windows-x86_64', 'windows-x86_64-nsis', 'windows-x86_64-msi']) {
  if (!manifest.platforms?.[platform]) {
    throw new Error(`Missing signed updater for ${platform}`);
  }
}

for (const [platform, target] of Object.entries(manifest.platforms ?? {})) {
  if (!target?.url || !target?.signature) {
    throw new Error(`Manifest entry is incomplete: ${platform}`);
  }
  const fileName = basename(new URL(target.url).pathname);
  if (!Object.hasOwn(expectedUpdaters, platform) || !expectedUpdaters[platform].includes(fileName)) {
    throw new Error(`Unexpected updater asset for ${platform}: ${fileName}`);
  }
  if (!assetNames.has(fileName) || statSync(join(releaseDir, fileName)).size === 0) {
    throw new Error(`Manifest asset is missing or empty: ${fileName}`);
  }
  const signatureFile = `${fileName}.sig`;
  if (!assetNames.has(signatureFile) ||
      readFileSync(join(releaseDir, signatureFile), 'utf8').trim() !== target.signature.trim()) {
    throw new Error(`Updater signature does not match ${fileName}`);
  }
  target.url = `${versionBaseUrl}/${fileName}`;
}

mkdirSync(uploadDir, { recursive: true });
const versionedAssets = [...installers, macUpdater, ...[macUpdater, nsis, msi].map((file) => `${file}.sig`)];
for (const fileName of versionedAssets) {
  copyFileSync(join(releaseDir, fileName), join(uploadDir, fileName));
}
writeFileSync(join(uploadDir, 'latest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

if (existsSync(stableManifestPath)) {
  const current = JSON.parse(readFileSync(stableManifestPath, 'utf8'));
  if (!/^\d+\.\d+\.\d+$/.test(current.version ?? '')) {
    throw new Error(`Invalid stable manifest version: ${current.version}`);
  }
  if (compareVersions(version, current.version) < 0) {
    throw new Error(`The GitHub bridge already serves ${current.version}`);
  }
}
mkdirSync(join(stableManifestPath, '..'), { recursive: true });
writeFileSync(stableManifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Prepared signed OBS artifacts and bridge for ${version}.`);
