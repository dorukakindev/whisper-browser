#!/usr/bin/env node
'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const packageRoot = path.join(root, 'artifacts', 'Whisper Browser-win32-x64');
const executable = path.join(packageRoot, 'Whisper Browser.exe');

async function main() {
  if (process.platform !== 'win32') throw new Error('Packaged smoke test must run on Windows.');
  if (!fs.existsSync(executable)) throw new Error('Windows package is missing; run npm run package:win first.');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-package-smoke-'));
  const child = spawn(executable, [`--user-data-dir=${profile}`, '--disable-gpu'], {
    cwd: packageRoot,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-4000); });
  const result = await new Promise((resolve) => {
    let settled = false;
    const finish = (value) => { if (!settled) { settled = true; resolve(value); } };
    child.once('error', (error) => finish({ ok: false, error }));
    child.once('exit', (code, signal) => finish({ ok: false, code, signal }));
    setTimeout(() => finish({ ok: true }), 6000).unref?.();
  });
  try {
    if (!result.ok) {
      throw new Error(`Packaged app exited before the smoke window (${result.error?.message || result.code || result.signal || 'unknown'}). ${stderr}`);
    }
    // Süreç 6 saniye yaşasa da main içinde fırlayan bir hata diyaloğu donuk
    // bir pencere bırakır; Electron'un bilinen ölümcül stderr kalıplarını
    // başarısızlık say.
    const fatal = stderr.match(/FATAL|Uncaught (?:Exception|Error)|Cannot find module|A JavaScript error occurred|error getting talents/i);
    if (fatal) {
      throw new Error(`Packaged app stayed alive but printed a fatal marker (${fatal[0]}). ${stderr}`);
    }
  } finally {
    // Başarısızlık yolları da temizlenir: yaşayan çocuk ve geçici profil
    // throw'un ötesine sızmasın. Ölü çocuğa exit beklemek sonsuza dek
    // asılırdı — exitCode/signalCode kontrolü yarışı kapatır.
    if (child.exitCode === null && child.signalCode === null) {
      child.kill();
      await new Promise((resolve) => {
        child.once('exit', resolve);
        setTimeout(resolve, 5000).unref?.();
      });
    }
    fs.rmSync(profile, { recursive: true, force: true });
  }
  console.log('Packaged Windows app remained healthy for the 6 second smoke window.');
}

main().catch((error) => {
  console.error(`Windows package smoke failed: ${error.message}`);
  process.exitCode = 1;
});
