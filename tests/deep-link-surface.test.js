'use strict';
/**
 * R310: OS düzeyinde derin-link (whisper://) yüzeyi olmadığını kilitleyen
 * negatif ratchet. Uygulama hiçbir zaman setAsDefaultProtocolClient çağırmaz,
 * open-url dinlemez ve second-instance'ta argv URL'si açmaz; bir gün derin-link
 * eklenirse bu test kırmızıya döner ve güvenlik incelemesi zorunlu olur.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'src', 'main.js'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

// 1) Hiçbir yerde OS protokol kaydı yok (Windows anahtarı / Linux desktop).
assert(!/setAsDefaultProtocolClient|setAsDefaultProtocol/.test(main),
  'main.js içinde protokol kaydı çağrısı var — derin-link yüzeyi');
assert(!pkg.build?.protocols && !pkg.protocols,
  'package.json protocols alanı eklenmiş — derin-link yüzeyi');

// 2) macOS open-url handler'ı yok.
assert(!/app\.on\(['"]open-url['"]/.test(main),
  'open-url handler incelemesiz eklendi — dış uygulamadan URL alır');

// 3) second-instance handler'ı argv URL'si açmaz (Windows derin-link kanalı).
{
  const start = main.indexOf("app.on('second-instance'");
  const end = main.indexOf('mainWindow.focus()', start);
  const body = main.slice(start, end);
  assert(!/argv|loadURL|openExternal/.test(body),
    'second-instance argv/URL işliyor — tek-örnek derin-link yüzeyi');
}

// 4) process.argv yalnız dev/smoke bayraklarına dokunur — URL/girdi okuyan
//    yeni bir argv bayrağı güvenlik incelemesi olmadan eklenemez.
{
  const flags = [...main.matchAll(/process\.argv\.includes\((['"`])([^'"`]+)\1\)/g)].map(m => m[2]);
  assert(flags.every(f => f === '--dev' || f.startsWith('--electron-')),
    `beklenmeyen process.argv bayrağı: ${JSON.stringify(flags)}`);
}

// 5) İç ayrıcalıklı şemalar yalnızca izinli ikisiyle sınırlı kalır —
//    registerSchemesAsPrivileged bloğuna üçüncü şema eklenemez.
{
  const start = main.indexOf('registerSchemesAsPrivileged');
  const end = main.indexOf(']);', start);
  const schemes = [...main.slice(start, end).matchAll(/scheme:\s*['"]([\w-]+)['"]/g)].map(m => m[1]);
  assert.deepStrictEqual(schemes.sort(), ['whisper-assets', 'whisper-pdf'],
    'ayrıcalıklı şema listesi değişti — yeni iç protokol inceleme ister');
  // corsEnabled/fetch yetkileri genişlemesin: her ikisinde de zaten var;
  // yeni ayrıcalık anahtarları (örn. allowServiceWorkers) kilit altında.
  const privileges = main.slice(start, end);
  assert(!/allowServiceWorkers|nodeIntegration|webSecurity:\s*false/.test(privileges),
    'şema ayrıcalıkları genişledi');
}

console.log('deep-link-surface: OK — OS derin-link yüzeyi yok, iç şemalar kilitli');
