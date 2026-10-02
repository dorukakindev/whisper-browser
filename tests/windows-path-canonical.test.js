'use strict';
// Windows dosya sistemi büyük-küçük harf duyarsızdır: aynı dosyanın farklı
// yazımlı yolları (sürücü harfi, klasör büyük harfi) aynı dosyayı açar.
// Yol eşitliği kullanan noktalar (watch:report, burnin kurtarma eşleşmesi)
// canonicalFsPath üzerinden karşılaştırır. Linux'ta davranış byte-eşitliğidir.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');

function loadCanonical(platform) {
  const slice = main.slice(
    main.indexOf('function canonicalFsPath'),
    main.indexOf('const WATCH_STABLE_TICKS'));
  const sandbox = { path, process: { platform } };
  vm.createContext(sandbox);
  vm.runInContext(slice, sandbox);
  return sandbox.canonicalFsPath;
}

test('canonicalFsPath kaynakta tanımlı ve watch:report + burnin kurtarma onu kullanır', () => {
  const report = main.slice(
    main.indexOf("ipcMain.handle('watch:report'"),
    main.indexOf("ipcMain.handle('watch:report'") + 1600);
  assert.match(report, /watchSeen\.get\(canonicalFsPath\(filePath\)\)/);
  const burnin = main.slice(
    main.indexOf('const previousRecovery = readBurninRecoveryState()'),
    main.indexOf('const previousRecovery = readBurninRecoveryState()') + 900);
  assert.match(burnin, /canonicalFsPath\(previousRecovery\.videoPath\)/);
  assert.match(burnin, /canonicalFsPath\(previousRecovery\.subPath\)/);
});

test('win32: sürücü harfi ve klasör büyük-küçük harf farkı aynı anahtarı üretir', () => {
  const canon = loadCanonical('win32');
  const a = canon('D:\\Whisper Local\\Film.mkv');
  const b = canon('d:\\whisper local\\film.mkv');
  assert.strictEqual(a, b);
});

test('linux: büyük-küçük harf farkı ayrı anahtar kalır (POSIX anlambilimi)', () => {
  const canon = loadCanonical('linux');
  const a = canon('/tmp/Film.mkv');
  const b = canon('/tmp/film.mkv');
  assert.notStrictEqual(a, b);
});

test('göreli yol çözümlenir; dizgi-olmayan girişler patlamaz', () => {
  const canon = loadCanonical('linux');
  assert.strictEqual(canon('x/../y'), path.resolve('y'));
  // null/undefined String() üzerinden güvenli dizgiye düşer — Map lookup'ta
  // kayıp sayılır, çökmez.
  assert.strictEqual(canon(null), path.resolve('null'));
});
