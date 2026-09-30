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
// Kapsam: index.html'in yüklediği TÜM betikler (yerel + `../` ile src/ altındaki)
// + renderer/ üst-düzey betik olmayan .js dosyaları (worklet, mini pencere).
// `../` betikleri taramadan kaçmak envanteri gerçeğin gerisinde bırakırdı.
const INDEX_HTML = path.join(RENDERER_DIR, 'index.html');
const scriptFiles = new Set(
  // Tek çift-tırnak ve src'nin başka özniteliklerden sonra gelmesi de sayılır —
  // envanter gerçek yüklü betiklerin gerisinde kalmamalı.
  [...fs.readFileSync(INDEX_HTML, 'utf8').matchAll(/<script\b[^>]*\ssrc\s*=\s*(['"])([^'"]+)\1/g)]
    .filter((m) => m[2].endsWith('.js'))
    .map((m) => path.normalize(path.join(RENDERER_DIR, m[2])))
    .filter((abs) => !abs.includes(`${path.sep}vendor${path.sep}`))
    .map((abs) => path.relative(path.join(__dirname, '..'), abs)));
const topLevel = fs.readdirSync(RENDERER_DIR)
  .filter((f) => f.endsWith('.js') && !f.startsWith('vendor'))
  .map((f) => path.join('src', 'renderer', f));
const FILES = [...new Set([...scriptFiles, ...topLevel])].sort();
const fileSrc = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

// --- Yasak sink kalıpları: hiçbir dosyada görünmemeli -----------------
const FORBIDDEN = [
  { name: 'on* öznitelik yazımı', re: /setAttribute\s*\(\s*['"]on[a-z]+['"]/i },
  { name: 'location.href ataması', re: /\blocation\.href\s*=/ },
  { name: 'location.assign çağrısı', re: /\blocation\.assign\s*\(/ },
  { name: 'document.write', re: /\bdocument\.write(ln)?\s*\(/ },
  { name: 'eval çağrısı', re: /(^|[^.\w])eval\s*\(/ },
];
for (const file of FILES) {
  const src = fileSrc(file);
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
  const src = fileSrc(file);
  const re = /([\w$]+)\.href\s*=\s*([^;\n]+)/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    foundHrefs.push({ file, line: src.slice(0, m.index).split('\n').length,
      obj: m[1], rhs: m[2].trim() });
  }
}
ok('href atamaları envanter sınırında', foundHrefs.length === HREF_INVENTORY.length);
for (const item of HREF_INVENTORY) {
  const [objName, rhsName] = item.mark.split('=').map((s) => s.trim());
  const obj = objName.replace(/\.href$/, '');
  ok(`${item.file}: "${item.mark}" envanteri korunuyor`,
    foundHrefs.some((h) => h.file.endsWith(item.file) && h.obj === obj && h.rhs === rhsName));
}

// --- window.open envanteri: sıfır beklenir ----------------------------
const openCalls = [];
for (const file of FILES) {
  const src = fileSrc(file);
  if (/window\.open\s*\(/.test(src)) openCalls.push(file);
}
ok('window.open çağrısı yok', openCalls.length === 0);

console.log(`attr-sink-ratchet: ${checks} kontrol geçti (${FILES.length} dosya, ${foundHrefs.length} href sink'i)`);
