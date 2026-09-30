'use strict';
// R317: release-package bütünlüğü — kanonik kaynak listesi, ignore kayması,
// paket çıktısı doğrulaması ve açılış erken uyarısı dilimi.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const manifest = require('../tools/package-manifest');

test('requiredPackageFiles: her dosya depoda mevcut ve ignore kalıbına takılmıyor', () => {
  const required = manifest.requiredPackageFiles(ROOT);
  assert.ok(required.length > 50, `liste şüpheli kısa: ${required.length}`);
  const missing = required.filter((rel) => !fs.existsSync(path.join(ROOT, rel)));
  assert.deepEqual(missing, []);
  const ignored = required.filter((rel) => manifest.isIgnored(rel));
  assert.deepEqual(ignored, [], `paket ignore kalıbı gerekli dosya yutuyor: ${ignored.join(', ')}`);
});

test('BOOT_CRITICAL listede ve depoda; paketleme betiği kalıpları tek kaynaktan okur', () => {
  const required = new Set(manifest.requiredPackageFiles(ROOT));
  for (const rel of manifest.BOOT_CRITICAL) {
    assert.ok(required.has(rel), `${rel} gerekli listede yok`);
    assert.ok(fs.existsSync(path.join(ROOT, rel)), `${rel} depoda yok`);
  }
  const src = fs.readFileSync(path.join(ROOT, 'tools/package-windows.js'), 'utf8');
  assert.ok(src.includes('ignore: PACKAGER_IGNORE'), 'packager ignore dizisi manifest modülünden okunmalı');
  assert.ok(src.includes('missingInTarget'), 'packager çıktı doğrulaması çağrılmalı');
  // Kalıp dizisinin paket betiğinde ikinci kopyası kalmamalı.
  assert.equal(src.match(/\^\\\/\(\?:/g), null, 'ignore regex kopyası tools/package-windows.js içinde kaldı');
});

test('missingInTarget: eksik dosyayı paket çıktısında yakalar', () => {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-pkg-'));
  try {
    const appRoot = path.join(target, 'resources', 'app');
    for (const rel of manifest.requiredPackageFiles(ROOT)) {
      const dest = path.join(appRoot, ...rel.split('/'));
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(path.join(ROOT, rel), dest);
    }
    assert.deepEqual(manifest.missingInTarget(target, ROOT), []);
    fs.unlinkSync(path.join(appRoot, 'src', 'renderer', 'index.html'));
    fs.unlinkSync(path.join(appRoot, 'backend', 'transcribe.py'));
    const missing = manifest.missingInTarget(target, ROOT);
    assert.ok(missing.includes('src/renderer/index.html'));
    assert.ok(missing.includes('backend/transcribe.py'));
    assert.equal(missing.length, 2);
  } finally {
    fs.rmSync(target, { recursive: true, force: true });
  }
});

function sliceFn(file, marker, endMarker) {
  const src = fs.readFileSync(file, 'utf8');
  const start = src.indexOf(marker);
  assert.notEqual(start, -1, `${marker} bulunamadı`);
  const end = src.indexOf(endMarker, start);
  assert.notEqual(end, -1, `${endMarker} bulunamadı`);
  return src.slice(start, end);
}

function runVerify(appDir, { requireImpl } = {}) {
  const calls = [];
  const ctx = {
    app: { getAppPath: () => appDir, exit: (code) => calls.push(['exit', code]) },
    dialog: { showErrorBox: (title, body) => calls.push(['errorBox', title, body]) },
    fs, path, console: { warn: (...a) => calls.push(['warn', a.join(' ')]) },
    require: requireImpl || ((id) => require(path.resolve(ROOT, 'src', id))),
  };
  vm.createContext(ctx);
  const code = `${sliceFn(path.join(ROOT, 'src/main.js'), 'function verifyAppResources()', 'function createWindow()')}; verifyAppResources;`;
  const fn = vm.runInContext(code, ctx);
  return { result: fn(), calls };
}

test('verifyAppResources: kritik dosya eksikse diyalog + exit(1), tamamsa sessiz geçiş', () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-empty-'));
  try {
    const broken = runVerify(empty);
    assert.equal(broken.result, false);
    assert.deepEqual(broken.calls.find((c) => c[0] === 'exit'), ['exit', 1]);
    const box = broken.calls.find((c) => c[0] === 'errorBox');
    assert.ok(box && box[2].includes('src/renderer/index.html'));
  } finally {
    fs.rmSync(empty, { recursive: true, force: true });
  }
  const ok = runVerify(ROOT);
  assert.equal(ok.result, true);
  assert.equal(ok.calls.filter((c) => c[0] === 'errorBox').length, 0);
  assert.equal(ok.calls.filter((c) => c[0] === 'exit').length, 0);
});

test('verifyAppResources: manifest require edilemezse yedek kısa listeyle yine kapı tutar', () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-empty2-'));
  try {
    const r = runVerify(empty, { requireImpl: () => { throw new Error('manifest yok'); } });
    assert.equal(r.result, false);
    const box = r.calls.find((c) => c[0] === 'errorBox');
    assert.ok(box && box[2].includes('src/renderer/index.html'));
  } finally {
    fs.rmSync(empty, { recursive: true, force: true });
  }
});

test('transcribe:start — backend/transcribe.py eksikse spawn öncesi dostu hata', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/main.js'), 'utf8');
  const idx = src.indexOf("'backend', 'transcribe.py'");
  assert.notEqual(idx, -1);
  const window = src.slice(idx, idx + 1200);
  assert.ok(window.includes('fs.existsSync(scriptPath)'), 'spawn öncesi transcribe.py varlık kontrolü yok');
  assert.ok(window.includes('install.bat'), 'eksik dosya mesajı onarım yönlendirmesi içermeli');
});
