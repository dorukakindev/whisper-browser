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
  if (!result.ok) {
    throw new Error(`Packaged app exited before the smoke window (${result.error?.message || result.code || result.signal || 'unknown'}). ${stderr}`);
  }
  child.kill();
  await new Promise((resolve) => child.once('exit', resolve));
  fs.rmSync(profile, { recursive: true, force: true });
  console.log('Packaged Windows app remained healthy for the 6 second smoke window.');
}

main().catch((error) => {
  console.error(`Windows package smoke failed: ${error.message}`);
  process.exitCode = 1;
});
