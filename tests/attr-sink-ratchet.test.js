// Dış-sink envanteri ratchet'i: textContent dışı sink'lerdeki
// güvensiz-veri yüzeyini bilinçli envantere kilitler.
// Kapsam (R290 denetimi): öznitelik atamaları (title/aria) HTML
// ayrıştırmadığından güvenli; img-src CSP 'self' data: https: altında;
// href/src atamaları yalnız envanterdeki noktalarda ve her biri
// upstream kelepçeyle (şema indirgeme, politika kapısı, data:image
// sınırı) savunmalı. Yeni sink eklenirse envanter büyür ve bu test
// düşer — yeni site bilinçli kaydedilmeli.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

let checks = 0;
const ok = (name, cond) => { checks += 1; assert.ok(cond, name); };

const RENDERER_DIR = path.join(__dirname, '..', 'src', 'renderer');
const FILES = fs.readdirSync(RENDERER_DIR)
  .filter((f) => f.endsWith('.js') && !f.startsWith('vendor'))
  .sort();

// --- Yasak sink kalıpları: hiçbir dosyada görünmemeli -----------------
const FORBIDDEN = [
  { name: 'on* öznitelik yazımı', re: /setAttribute\s*\(\s*['"]on[a-z]+['"]/i },
  { name: 'location.href ataması', re: /\blocation\.href\s*=/ },
  { name: 'location.assign çağrısı', re: /\blocation\.assign\s*\(/ },
  { name: 'document.write', re: /\bdocument\.write(ln)?\s*\(/ },
  { name: 'eval çağrısı', re: /(^|[^.\w])eval\s*\(/ },
];
for (const file of FILES) {
  const src = fs.readFileSync(path.join(RENDERER_DIR, file), 'utf8');
  for (const { name, re } of FORBIDDEN) {
    ok(`${file}: ${name} yok`, !re.test(src));
  }
}

// --- href atama envanteri: yalnız bilinen güvenli noktalar ------------
// Her kayıt: dosya adı + atama hattındaki ayırt edici dizgi.
const HREF_INVENTORY = [
  { file: 'renderer.js', mark: 'link.href = vurl' }, // verification_url main'de https'e indirgenir
];
const foundHrefs = [];
for (const file of FILES) {
  const src = fs.readFileSync(path.join(RENDERER_DIR, file), 'utf8');
  const re = /\.href\s*=\s*([^;\n]+)/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    foundHrefs.push({ file, line: src.slice(0, m.index).split('\n').length, rhs: m[1].trim() });
  }
}
ok('href atamaları envanter sınırında', foundHrefs.length === HREF_INVENTORY.length);
for (const item of HREF_INVENTORY) {
  const rhsPrefix = item.mark.split('=')[1].trim().slice(0, 8);
  ok(`${item.file}: "${item.mark}" envanteri korunuyor`,
    foundHrefs.some((h) => h.file === item.file && h.rhs.startsWith(rhsPrefix)));
}

// --- window.open envanteri: sıfır beklenir ----------------------------
const openCalls = [];
for (const file of FILES) {
  const src = fs.readFileSync(path.join(RENDERER_DIR, file), 'utf8');
  if (/window\.open\s*\(/.test(src)) openCalls.push(file);
}
ok('window.open çağrısı yok', openCalls.length === 0);

console.log(`attr-sink-ratchet: ${checks} kontrol geçti (${FILES.length} dosya, ${foundHrefs.length} href sink'i)`);
