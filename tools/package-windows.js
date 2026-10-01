#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PACKAGER_IGNORE, missingInTarget } = require('./package-manifest');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const electronPkg = JSON.parse(fs.readFileSync(path.join(root, 'node_modules', 'electron', 'package.json'), 'utf8'));
const electronVersion = electronPkg.version;
const zipName = `electron-v${electronVersion}-win32-x64.zip`;

function findElectronZip() {
  const roots = [
    path.join(process.env.LOCALAPPDATA || '', 'electron', 'Cache'),
    path.join(os.homedir(), '.cache', 'electron'),
  ].filter(Boolean);
  for (const cacheRoot of roots) {
    if (!fs.existsSync(cacheRoot)) continue;
    const dirs = [cacheRoot, ...fs.readdirSync(cacheRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory()).map((entry) => path.join(cacheRoot, entry.name))];
    for (const dir of dirs) {
      const candidate = path.join(dir, zipName);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  throw new Error(`Castlabs Electron ZIP cache is missing: ${zipName}. Run npm ci once with network access.`);
}

async function main() {
  if (process.platform !== 'win32') throw new Error('Windows packaging must run on Windows.');
  const electronZip = findElectronZip();
  const out = path.join(root, 'artifacts');
  const { packager } = await import('@electron/packager');
  const paths = await packager({
    dir: root,
    name: 'Whisper Browser',
    productName: 'Whisper Browser',
    appVersion: pkg.version,
    platform: 'win32',
    arch: 'x64',
    out,
    overwrite: true,
    prune: true,
    asar: false,
    electronVersion,
    electronZipDir: path.dirname(electronZip),
    ignore: PACKAGER_IGNORE,
  });
  const target = paths[0];
  const exePath = path.join(target, 'Whisper Browser.exe');
  if (!target || !fs.existsSync(exePath)) {
    throw new Error('Packager did not produce the expected Windows executable.');
  }
  // MAX_PATH (>260 karakter) desteği: Electron'un gömülü manifesti
  // longPathAware bildirmez; registry LongPathsEnabled tek başına yetmez.
  const { patchExeManifest } = require('./windows-manifest');
  const manifestPatch = await patchExeManifest(exePath);
  if (!manifestPatch.patched && manifestPatch.reason !== 'longPathAware zaten tanımlı.') {
    throw new Error(`Exe manifesti yamalanamadı: ${manifestPatch.reason}`);
  }
  if (manifestPatch.patched) console.log('Exe manifesti: longPathAware eklendi.');
  // Kaynak bütünlüğü: kanonik listede olup pakete düşmeyen dosya varsa
  // burada derhal başarısız ol (ör. ignore kalıbı yeni bir modülü yuttu).
  const missing = missingInTarget(target, root);
  if (missing.length) {
    throw new Error(`Packaged app is missing required files:\n  ${missing.join('\n  ')}`);
  }
  const manifest = {
    app: pkg.name,
    version: pkg.version,
    electron: electronVersion,
    platform: 'win32',
    arch: 'x64',
    createdAt: new Date().toISOString(),
    runtimeSetup: 'Run resources/app/install.bat before transcription on a new machine.',
  };
  fs.writeFileSync(path.join(target, 'BUILD-MANIFEST.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`Windows package: ${target}`);
}

main().catch((error) => {
  console.error(`Windows packaging failed: ${error.message}`);
  process.exitCode = 1;
});
