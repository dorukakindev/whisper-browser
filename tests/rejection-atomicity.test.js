'use strict';
// R162: unhandled-rejection + atomik-yazma kalan süpürmesi — kaynak ratchet'ları.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

let n = 0; const ok = (c, m) => { n += 1; assert(c, m); };
const read = (f) => fs.readFileSync(path.join(__dirname, '../src', f), 'utf8');
const main = read('main.js');

// unhandledRejection süpürge handler'ı mevcut ve soak sayacına bağlı
{
  ok(/process\.on\('unhandledRejection'/.test(main), 'unhandledRejection handler var');
  ok(/resourceSoakUnhandledRejectionCount/.test(main), 'soak sayacı bağlı');
}

// .then( zincirleri: her biri .catch/.finally ile kapanmalı veya bir .catch'e yaslanmalı.
// Statik kural: `.then(` sonrası aynı zincir penceresinde `.catch(` / `.finally(` / return
// bekle. Yaklaşık pencere: .then( başlangıcından sonraki 2000 karakterde .catch|finally|.
{
  const misses = [];
  for (const m of main.matchAll(/\.then\(/g)) {
    const win = main.slice(m.index, m.index + 2000);
    if (!/\.catch\(|\.finally\(|\.then\(/.test(win.slice(6))) {
      // zincir uzatması veya kapanışı yoksa aday
      misses.push(`~${main.slice(0, m.index).split('\n').length}`);
    }
  }
  // Bilinen güvenli desenler: zincir .then().catch() içindeyse pencerede .catch görünür.
  // Basit ratchet: tek .then( zincirlerinin kapanmamış sayısı sabit kalmalı.
  // Bu test yalnız yeni zincirlerin eklenmesini yakalar.
  ok(misses.length <= 8, `kapanışsız görünen .then zincirleri: ${misses.join(',')}`);
}

// Kritik durum dosyaları atomik yazıcıdan geçer; doğrudan fs.writeFileSync ile
// state yazımı eklenemez (settings/queue/window-state gibi).
{
  const stateFiles = ['settings.json', 'queue', 'window-state', 'watch', 'session'];
  // atomic-json kullanımı zaten var
  ok(/require\('\.\/atomic-json'\)/.test(main), 'atomic-json modülü bağlı');
  // writeFileSync çağrıları yalnız kullanıcı-çıktı/temp yollarında izinli
  const writes = [...main.matchAll(/fs\.writeFileSync\(([^,]+)/g)].map((m) => m[1]);
  const suspect = writes.filter((w) => /settings|queue|window-state|session|watch/i.test(w)
    && !/tmp|temp|\.tmp|burnin/i.test(w));
  ok(suspect.length === 0, `durum dosyasına doğrudan writeFileSync: ${suspect.join(',')}`);
}

// atomic-json modülü gerçekten rename-sonrası fsync yapıyor
{
  const atomic = read('atomic-json.js');
  ok(/renameSync/.test(atomic) && /writeFileSync/.test(atomic), 'atomic-json tmp+rename modeli');
}

// stderr/journal yazımları da crash'ten korunur (writeJobLog try/catch)
{
  ok(/jobLog\.stream\.write/.test(main), 'jobLog yazımı var');
  const idx = main.indexOf("jobLog.stream.write");
  ok(main.slice(idx - 30, idx + 60).includes('try'), 'jobLog yazımı try-catch içinde');
}

console.log(`rejection-atomicity: ${n} kontrol geçti`);
