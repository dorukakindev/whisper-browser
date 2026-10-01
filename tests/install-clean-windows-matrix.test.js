'use strict';

// Madde 46 — temiz Windows kurulum matrisi: sürüm kapıları, eksik araç
// hataları, boşluklu yol (.bat tırnakları) ve sınırlı yazma izni
// sınıflandırması. Gerçek Windows kurulumu bu ortamda koşamaz; doğrulanan
// sözleşmeler birim/matris düzeyindedir.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  classifyInstallError, supportedNode, supportedPython, RealDriver, InstallError,
} = require('../tools/install-orchestrator');

// 1) Sürüm matrisi — desteklenen/beklenmeyen kombinasyonlar.
for (const v of [{ major: 3, minor: 10 }, { major: 3, minor: 11 }])
  assert.equal(supportedPython(v), true, `Python ${v.minor} destekli olmalı`);
for (const v of [{ major: 3, minor: 9 }, { major: 3, minor: 12 }, { major: 3, minor: 13 }, { major: 2, minor: 7 }, null, {}])
  assert.equal(supportedPython(v), false, `Python ${JSON.stringify(v)} reddedilmeli`);
for (const text of ['v22.13.0', '22.14.0', 'v24.0.0'])
  assert.equal(supportedNode(text), true, `Node ${text} destekli olmalı`);
for (const text of ['v20.0.0', 'v22.12.9', 'v18.19.0'])
  assert.equal(supportedNode(text), false, `Node ${text} reddedilmeli`);

// 2) Yazma izni sınıflandırması — EACCES/EPERM/EROFS eylemlenebilir PERMISSION.
for (const code of ['EACCES', 'EPERM', 'EROFS']) {
  const error = Object.assign(new Error('operation not permitted'), { code, path: 'C:\\Program Files\\Whisper' });
  const classified = classifyInstallError(error, 'Dosya yazma');
  assert(classified instanceof InstallError, `${code} sınıflandırılmadı`);
  assert.equal(classified.code, 'PERMISSION');
  assert(classified.message.includes('Program Files'), 'hedef yol mesajda yok');
  assert(classified.message.includes('yazma izni'), 'eylemlenebilir ipucu yok');
}
assert.equal(classifyInstallError(new Error('diğer'), 'x'), null);
assert.equal(classifyInstallError(Object.assign(new Error('yok'), { code: 'ENOENT' }), 'x'), null);
assert.equal(classifyInstallError(null), null);

// 3) run() — gerçek spawn EACCES: çalıştırılamayan dosya → PERMISSION (PROCESS_START değil).
{
  const driver = new RealDriver(path.join(__dirname, '..'));
  const fixture = path.join(__dirname, 'install-clean-windows-matrix.test.js'); // çalıştırılabilir değil
  let thrown = null;
  try { driver.run(fixture, [], { capture: true }); } catch (e) { thrown = e; }
  // Linux'ta EACCES; platform bağımsız olarak en azından InstallError olmalı.
  assert(thrown instanceof InstallError, 'run() ham hata sızdı');
  if (thrown.code === 'PERMISSION') assert(thrown.message.includes('yazma izni'));
  else assert.equal(thrown.code, 'PROCESS_START');
}

// 4) .bat tırnak matrisi — %~dp0/ortam genişlemeleri tırnaksız kalmamalı
// (D:\Whisper Local boşluklu yolu). set "X=..." / cd /d "..." kalıpları geçer.
{
  const root = path.join(__dirname, '..');
  const bats = fs.readdirSync(root).filter((f) => f.endsWith('.bat'));
  assert(bats.length >= 6, '.bat dosyaları bulunamadı');
  for (const file of bats) {
    const lines = fs.readFileSync(path.join(root, file), 'utf8').split(/\r?\n/);
    for (const [i, raw] of lines.entries()) {
      const line = raw.trim();
      if (!line || line.startsWith('::') || line.startsWith('rem ')) continue;
      // Tırnaksız %~ genişlemesi: değişkene/rampa bağlı her yerde çift tırnak içinde olmalı.
      const unquoted = line.replace(/"[^"]*"/g, '');
      if (/%~/.test(unquoted))
        assert.fail(`${file}:${i + 1} tırnaksız %~ genişlemesi: ${line}`);
      // set X=... biçimi (tırnaklı olmayan) yalnız değer boşluk taşıyorsa
      // kırılır — boşluksuz sabitler güvenlidir.
      const setMatch = line.match(/^set\s+([A-Za-z_][A-Za-z0-9_]*=)(.*)$/i);
      if (setMatch && !line.startsWith('set "') && /\s/.test(setMatch[2].replace(/"[^"]*"/g, '')))
        assert.fail(`${file}:${i + 1} tırnaksız set ataması boşluklu değer taşıyor: ${line}`);
    }
  }
}

// 5) main() sınıflandırma ratchet'i — raw fs hataları PERMISSION'a çevrilir.
{
  const src = fs.readFileSync(path.join(__dirname, '..', 'tools', 'install-orchestrator.js'), 'utf8');
  assert(src.includes('classifyInstallError(result.error'), 'run() EACCES sınıflandırmıyor');
  assert(/classifyInstallError\(error, 'Kurulum adimi'\)/.test(src), 'main() catch sınıflandırmıyor');
  assert(src.includes("'PERMISSION'"), 'PERMISSION kodu yok');
}

console.log('install-clean-windows-matrix: 5 bölüm geçti');
