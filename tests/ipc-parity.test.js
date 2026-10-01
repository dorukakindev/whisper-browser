'use strict';
/**
 * IPC sözleşme testi (R138/R151).
 *
 * 1) Parity: preload dosyalarının `invoke/send/on` ettiği her kanalın bir
 *    main-process handler'ı (ipcMain.handle / ipcMain.on) olmalı — handler
 *    kayıtları main.js'in yanında servis modüllerinde de olabilir, bu yüzden
 *    tüm src/*.js taranır.
 * 2) Yön: main'in `webContents.send` ettiği kanalların renderer tarafında
 *    bir dinleyicisi (preload `ipcRenderer.on` veya renderer `onXxx` köprüsü)
 *    olmalı.
 * 3) Çifte kayıt: aynı kanala iki `ipcMain.handle` kaydı yapılamaz
 *    (Electron'da ikinci kayıt throw eder) — statik olarak yasaklanır.
 * 4) Guard ratchet: handler parametresine guard'dan (typeof/?.//default)
 *    önce doğrudan özellik erişimi yapan handler sayısı artmamalı.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');
const files = fs.readdirSync(SRC).filter((f) => f.endsWith('.js'));

const grab = (re, src) => [...src.matchAll(re)].map((m) => m[1]);

let handled = [];
let mainOn = [];
let sent = [];
const sources = {};
for (const f of files) {
  const src = fs.readFileSync(path.join(SRC, f), 'utf8');
  const h = grab(/ipcMain\.handle\(\s*'([^']+)'/g, src);
  const o = grab(/ipcMain\.on\(\s*'([^']+)'/g, src);
  // wc.send / webContents.send = main→renderer; ipcRenderer.send renderer→main.
  // Preload dosyalarındaki `ipcRenderer.send` burada sayılmaz (aşağıda ayrı).
  const s = f.includes('preload') ? [] : grab(/\.send\(\s*'([^']+)'/g, src);
  for (const c of h) sources[`handle:${c}`] = f;
  for (const c of o) sources[`on:${c}`] = f;
  handled.push(...h);
  mainOn.push(...o);
  sent.push(...s);
}
const handledSet = new Set(handled);
const mainOnSet = new Set(mainOn);

const preloadFiles = ['preload.js', 'browser-preload.js', 'browser-mini-preload.js'];
let invoked = [], pSend = [], pOn = [];
for (const f of preloadFiles) {
  const src = fs.readFileSync(path.join(SRC, f), 'utf8');
  invoked.push(...grab(/ipcRenderer\.invoke\(\s*'([^']+)'/g, src));
  // sendSync de ipcMain.on'a düşer — yalnız `send` aramak senkron kanalları
  // (queue:saveSync, settings:saveSync, library:upsert-before-close) kör eder.
  pSend.push(...grab(/ipcRenderer\.send(?:Sync)?\(\s*'([^']+)'/g, src));
  pOn.push(...grab(/ipcRenderer\.on\(\s*'([^']+)'/g, src));
}
const pOnSet = new Set(pOn);

// 1) invoke → handler
const missing = [...new Set(invoked)].filter((c) => !handledSet.has(c));
assert.deepStrictEqual(missing, [], `handler'ı olmayan invoke kanalları: ${missing}`);

// 2) send → ipcMain.on
const missingOn = [...new Set(pSend)].filter((c) => !mainOnSet.has(c));
assert.deepStrictEqual(missingOn, [], `ipcMain.on'u olmayan send kanalları: ${missingOn}`);

// 3) main → renderer yönü: her send kanalı bir dinleyiciyle eşleşmeli.
//    Dinleyici preload'larda `ipcRenderer.on` olabilir; renderer.js'teki
//    api.onXxx sarmalayıcıları preload'daki on()'a indirgenir.
const unheard = [...new Set(sent)].filter(
  (c) => !pOnSet.has(c) && !c.includes('resource-snapshot-request'),
);
assert.deepStrictEqual(unheard, [], `dinleyicisiz send kanalları: ${unheard}`);

// 4) Çifte handle kaydı yasak.
const dup = handled.filter((c, i) => handled.indexOf(c) !== i);
assert.deepStrictEqual([...new Set(dup)], [], `çifte kayıtlı handle kanalları: ${dup}`);

// 5) Guard ratchet — guard'dan önce parametre özellik erişimi sayısı artmasın.
const mainSrc = fs.readFileSync(path.join(SRC, 'main.js'), 'utf8');
const pat = /ipcMain\.handle\(\s*'([^']+)'\s*,\s*async?\s*\(([^)]*)\)\s*=>\s*\{/g;
let unguarded = 0;
for (const m of mainSrc.matchAll(pat)) {
  const params = m[2].split(',').map((x) => x.trim()).filter(Boolean);
  const ps = params.filter((x) => !['event', '_event', 'e', '_e'].includes(x));
  if (!ps.length) continue;
  const obj = ps[0].split('=')[0].trim();
  if (!obj || obj.startsWith('{') || obj.startsWith('[')) continue;
  const head = mainSrc.slice(m.index + m[0].length, m.index + m[0].length + 400);
  const hasGuard = head.includes(`typeof ${obj}`) || head.includes(`${obj}?.`)
    || head.includes('Array.isArray') || head.includes(`${obj} &&`)
    || head.includes(`if (!${obj}`);
  // `= {}` varsayılanı undefined/eksik parametreyi nesneye çevirir; yalnız
  // null/ilkel TypeError'a düşer ve o da yan etkiden ÖNCE atılır (aşağıdaki
  // GUARDLESS_SIDE_EFFECT bölümü bunu zaten kilitler).
  const hasDefault = /=\s*\{/.test(ps[0]);
  if (!hasGuard && !hasDefault && new RegExp(`\\b${obj.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.`).test(head)) unguarded += 1;
}
// R176: 16 unguarded handler'ın hepsi `= {}` varsayılanı taşıyor — undefined
// güvenli, null erken atılıyor (throw→reject), ilkeller bozulmadan düşüyor.
// Yeni handler'da parametre ya guard'lanmalı ya da `= {}` varsayılanı taşımalı.
assert.equal(unguarded, 0, `guard'suz ve varsayılan'sız parametre kullanan handler: ${unguarded}`);

// 6) throw→reject güvenliği: guard'dan ÖNCE yan etki (spawn/dosya yazımı/send)
//    olmamalı — aksi halde kısmen uygulanmış iş kalır.
const GUARDLESS_SIDE_EFFECT = [];
for (const m of mainSrc.matchAll(pat)) {
  const params = m[2].split(',').map((x) => x.trim()).filter(Boolean);
  const ps = params.filter((x) => !['event', '_event', 'e', '_e'].includes(x));
  if (!ps.length) continue;
  const obj = ps[0].split('=')[0].trim();
  if (!obj || obj.startsWith('{')) continue;
  const body = mainSrc.slice(m.index + m[0].length, m.index + m[0].length + 1200);
  let guardPos = -1;
  for (const g of [`typeof ${obj}`, `${obj}?.`, 'Array.isArray', `${obj} &&`, `if (!${obj}`, 'return { ok: false']) {
    const gi = body.indexOf(g);
    if (gi !== -1 && (guardPos === -1 || gi < guardPos)) guardPos = gi;
  }
  const head = body.slice(0, guardPos === -1 ? 300 : guardPos);
  if (/spawn\(|writeFile|unlink|rmdir|\.send\(|appendFile|mkdir/.test(head)) {
    GUARDLESS_SIDE_EFFECT.push(m[1]);
  }
}
assert.deepStrictEqual(GUARDLESS_SIDE_EFFECT, [],
  `guard öncesi yan etki yapan handler'lar: ${GUARDLESS_SIDE_EFFECT}`);

// 7) ipcMain.on gönderici doğrulaması (R176/R190): her `.on` dinleyicisinin ilk
//    bölümü göndericiyi doğrulamalı. Eski ratchet 'sender'/'pending' kelimesinin
//    geçmesini yeterli sayıyordu — bir yorum satırındaki "sender" bile bunu
//    atlatabilirdi. Şimdi gerçek doğrulama biçimleri aranır:
//    sender/senderFrame karşılaştırması (!== / ===), bilinen doğrulayıcı
//    yardımcılar (authorizedBrowserSender, browserDiscoveryFrameAllowed), veya
//    el sıkışmada bekleyen kayda karşı denetim (pending.<alan> / .get(...)).
const ON_UNVERIFIED = [];
const onPat = /ipcMain\.on\(\s*'([^']+)'/g;
const ON_VERIFY = /\bsenderFrame\b|\bsender\b\s*(?:!==|===)|\bauthorized\w*\(|\bbrowserDiscoveryFrameAllowed\b|\bpending\w*\s*(?:\.|=\s*[\w.]+\.get\(|!==|===)/;
for (const f of files) {
  const src = fs.readFileSync(path.join(SRC, f), 'utf8');
  for (const m of src.matchAll(onPat)) {
    const head = src.slice(m.index + m[0].length, m.index + m[0].length + 500);
    if (!ON_VERIFY.test(head)) ON_UNVERIFIED.push(`${f}:${m[1]}`);
  }
}
assert.deepStrictEqual(ON_UNVERIFIED, [],
  `gönderici doğrulaması olmayan ipcMain.on kanalları: ${ON_UNVERIFIED}`);

console.log(
  `ipc-parity: ${handledSet.size} handle · ${mainOnSet.size} on · ${sent.length} send — `
  + `parity tam, ${unguarded} unguarded handler, guard-öncesi yan etki yok, `
  + `on kanalları gönderici-doğrulamalı`,
);
