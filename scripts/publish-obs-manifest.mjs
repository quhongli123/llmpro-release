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
if (!/^\d+\.\d+\.\d+$/.test(version)) {
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

for (const [platform, target] of Object.entries(manifest.platforms ?? {})) {
  if (!target?.url || !target?.signature) {
    throw new Error(`Manifest entry is incomplete: ${platform}`);
  }
  const fileName = basename(new URL(target.url).pathname);
  if (!assetNames.has(fileName)) {
    throw new Error(`Manifest asset is missing from release: ${fileName}`);
  }
  target.url = `${versionBaseUrl}/${fileName}`;
}

mkdirSync(uploadDir, { recursive: true });
for (const fileName of assetNames) {
  copyFileSync(join(releaseDir, fileName), join(uploadDir, fileName));
}
writeFileSync(join(uploadDir, 'latest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

let shouldPublishStableManifest = true;
if (existsSync(stableManifestPath)) {
  const current = JSON.parse(readFileSync(stableManifestPath, 'utf8'));
  if (!/^\d+\.\d+\.\d+$/.test(current.version ?? '')) {
    throw new Error(`Invalid stable manifest version: ${current.version}`);
  }
  shouldPublishStableManifest = compareVersions(version, current.version) >= 0;
}

if (shouldPublishStableManifest) {
  mkdirSync(join(stableManifestPath, '..'), { recursive: true });
  writeFileSync(stableManifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Stable manifest updated to ${version}.`);
} else {
  console.log(`Stable manifest kept; ${version} is older than the current version.`);
}

console.log(`Prepared OBS upload directory: ${uploadDir}`);
