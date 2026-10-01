'use strict';

// Madde 49 — tekrarlanabilir Windows paketi: inputSha256 determinizmi +
// BUILD-MANIFEST runtime bağımlılık manifesti bağlantısı.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { packageInputSha256, requiredPackageFiles } = require('../tools/package-manifest');

// 1) Determinizm — aynı ağaç aynı hash'i verir, iki çağrı özdeş.
{
  const root = path.join(__dirname, '..');
  const a = packageInputSha256(root, 'v43.5.0');
  const b = packageInputSha256(root, 'v43.5.0');
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/);
}

// 2) Electron sürüm farkı hash'i değiştirir; liste sıralaması kararlıdır.
{
  const root = path.join(__dirname, '..');
  assert.notEqual(packageInputSha256(root, 'v43.5.0'), packageInputSha256(root, 'v99.0.0'));
  const files = requiredPackageFiles(root);
  const sorted = [...files].sort();
  assert.deepEqual(files, sorted, 'kanonik liste sıralı değil → nondeterminizm riski');
}

// 3) Sahte ağaçta içerik değişimi hash'i değiştirir (reproduksiyon yakalanır).
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wbpkg-'));
  fs.mkdirSync(path.join(tmp, 'src'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'package.json'), '{}');
  fs.writeFileSync(path.join(tmp, 'x.bat'), 'rem test');
  fs.writeFileSync(path.join(tmp, 'src', 'a.js'), 'const x = 1;');
  const files1 = requiredPackageFiles(tmp); // minimal ağaç — BOOT_CRITICAL vb. yok
  const h1 = packageInputSha256(tmp, 'v1');
  fs.writeFileSync(path.join(tmp, 'src', 'a.js'), 'const x = 2;');
  const h2 = packageInputSha256(tmp, 'v1');
  if (files1.some((f) => f.endsWith('a.js'))) assert.notEqual(h1, h2, "içerik değişimi hash'e yansımadı");
  else { // a.js listede değilse en azından package.json değişimi denenir
    fs.writeFileSync(path.join(tmp, 'package.json'), '{"a":1}');
    assert.notEqual(packageInputSha256(tmp, 'v1'), h1);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
}

// 4) BUILD-MANIFEST bağlantısı — package-windows inputSha256 + runtimeRequirements yazar.
{
  const src = fs.readFileSync(path.join(__dirname, '..', 'tools', 'package-windows.js'), 'utf8');
  assert(src.includes('packageInputSha256'), 'inputSha256 bağlanmadı');
  assert(src.includes('runtimeRequirements'), 'runtime bağımlılık manifesti yok');
  assert(src.includes('inputSha256:'), 'manifest alanı yazılmıyor');
}

// 5) Internetsiz açılış ratchet'i — whenReady bloğu ağ çağrılarını
// ateş-unut bırakır (createWindow'dan önce ağ beklemek yasak).
{
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  const ready = src.slice(src.indexOf("app.whenReady().then"), src.indexOf('createWindow();') + 200);
  // Ağ gerektiren hazırlıklar void/awaitsiz olmalı; createWindow ağdan bağımsız.
  assert(ready.includes('void prepareWidevineComponents'), 'widevine bloke edici bekleniyor');
  assert(!/await\s+(?:startBrowserAdblock|prepareWidevine|restoreYoutube|restoreInvidious)/.test(ready),
    'başlangıç ağ çağrısı createWindow öncesinde blokluyor');
}

console.log('package-reproducible: 5 bölüm geçti');
