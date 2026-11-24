#!/usr/bin/env node
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function readSignature(directory, fileName) {
  const signaturePath = join(directory, `${fileName}.sig`);
  if (!existsSync(signaturePath) || statSync(signaturePath).size === 0) {
    throw new Error(`Updater signature is missing or empty: ${signaturePath}`);
  }
  const signature = readFileSync(signaturePath, 'utf8').trim();
  if (!signature) throw new Error(`Updater signature is empty: ${signaturePath}`);
  return signature;
}

const releaseTag = required('RELEASE_TAG');
const version = releaseTag.replace(/^v/, '');
if (!/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(releaseTag)) {
  throw new Error(`Invalid release tag: ${releaseTag}`);
}

const releaseDir = required('RELEASE_ASSET_DIR');
const notesPath = required('RELEASE_NOTES_FILE');
const macUpdater = 'llmpro_aarch64.app.tar.gz';
const nsis = `llmpro_${version}_x64-setup.exe`;
const msi = `llmpro_${version}_x64_en-US.msi`;

for (const fileName of [macUpdater, nsis, msi]) {
  const filePath = join(releaseDir, fileName);
  if (!existsSync(filePath) || statSync(filePath).size === 0) {
    throw new Error(`Release asset is missing or empty: ${filePath}`);
  }
}

const signature = (fileName) => readSignature(releaseDir, fileName);
const url = (fileName) => `https://example.invalid/${encodeURIComponent(fileName)}`;
const manifest = {
  version,
  notes: readFileSync(notesPath, 'utf8').trim(),
  pub_date: new Date().toISOString(),
  platforms: {
    'darwin-aarch64': { signature: signature(macUpdater), url: url(macUpdater) },
    'darwin-aarch64-app': { signature: signature(macUpdater), url: url(macUpdater) },
    'windows-x86_64': { signature: signature(nsis), url: url(nsis) },
    'windows-x86_64-nsis': { signature: signature(nsis), url: url(nsis) },
    'windows-x86_64-msi': { signature: signature(msi), url: url(msi) },
  },
};

const outputPath = join(releaseDir, 'latest.json');
writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Created updater manifest: ${outputPath}`);
