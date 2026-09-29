'use strict';

// R210 — preload köprü yüzeyi minimallik ratchet'i.
// Her `api.<name>` export'unun en az bir gerçek çağrı sitesi olmalı.
// Bilinçli olarak rezerve edilmiş export (UI'si sonradan gelecek) aşağıdaki
// listeye adı + gerekçeyle eklenir — sessiz ölü yüzey birikimini engeller.

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PRELOAD = path.join(ROOT, 'src', 'preload.js');

// Bilinçli dormant export'lar — her girdi { name, reason } biçiminde olmalı.
// R184 kararı: canlı main handler'lı UI-siz kanallar kasıtlı rezervasyon.
const DORMANT = [
  { name: 'searchWatchLibrary', reason: 'library:search handler canlı; renderer unified aramayı kullanıyor (R184 rezervasyonu)' },
  { name: 'listLibraryCollections', reason: 'collections:list handler canlı; UI mutasyon + item.collections üzerinden okuyor' },
  { name: 'cancelInvidious', reason: 'invidious:cancel handler canlı; jobTag-killi yedek iptal yolu' },
  { name: 'onYoutubeEvent', reason: 'youtube:event yayınlayıcı canlı; dinleyici tarafı gelecekteki yüzeye rezerve' },
  { name: 'getBrowserState', reason: 'browser:getState handler canlı; teşhis/dışa aktarma rezervi' },
  { name: 'getPdfState', reason: 'pdf:state handler canlı; PDF resume UI rezervi' },
  { name: 'modelBenchmarkHistory', reason: 'models:benchmark:history handler canlı; geçmiş UI rezervi' },
];

function collectSourceFiles() {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'vendor' || entry.name === 'node_modules') continue;
        walk(full);
      } else if (/\.(js|html)$/.test(entry.name)) {
        files.push(full);
      }
    }
  };
  walk(path.join(ROOT, 'src'));
  for (const extra of ['index.html']) {
    const p = path.join(ROOT, extra);
    if (fs.existsSync(p)) files.push(p);
  }
  return files.filter((f) => f !== PRELOAD);
}

function preloadExports() {
  const src = fs.readFileSync(PRELOAD, 'utf8');
  const names = new Set();
  // api nesnesi içindeki `name:` property'leri (arrow, method shorthand dahil)
  for (const m of src.matchAll(/^\s{2}([A-Za-z_$][\w$]*)\s*:/gm)) {
    names.add(m[1]);
  }
  return names;
}

const srcFiles = collectSourceFiles();
const dormantNames = new Set(DORMANT.map((d) => d.name));
const exports_ = preloadExports();
assert(exports_.size > 200, `preload export sayısı beklenmedik düşük: ${exports_.size}`);

// Yorum/dizgi içinde geçen `api.ad` sözlerini kullanım sanmamak için
// tek geçişli sözcük tarayıcı: yorumlar ve dizgi sabitleri sırayla
// tanınır (bir `//` dizginin içindeyse yorum sayılmaz). Nokta erişimi
// yorum+dizgi soyulmuş metinde; `api['ad']` köşeli erişimi ad dizgi
// sabitinin içinde olduğundan yalnız yorum soyulmuş metinde aranır.
// Bilinen sınır: `//` içeren regex sabitleri (ör. /\/\//) satır
// sonuna dek yorum sayılır — satır içi api çağrısını yiyebilir;
// böyle bir satır varsa açık DORMANT gerekçesiyle işaretlenir.
const TOKEN = /\/\*[\s\S]*?\*\/|\/\/[^\n]*|'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`/g;
function stripTokens(src, stripStrings) {
  return src.replace(TOKEN, (m) => {
    if (m[0] === '/') return ' ';
    return stripStrings ? m[0] + m[0] : m;
  });
}
const rawSrc = srcFiles.map((f) => fs.readFileSync(f, 'utf8'));
const noComments = rawSrc.map((s) => stripTokens(s, false));
const noStrings = noComments.map((s) => stripTokens(s, true));

// `api['ad']` köşeli erişimi dizgi SABİTİNİN içinde geçiyorsa kullanım
// sayılmaz: ham kaynaktaki yorum+dizgi aralıkları maskelenir, köşeli
// eşleşmenin başlangıcı maske dışında olmalı. (Soyulmuş metinde
// `api['ad']` adı silindiği için arama ham metinde yapılır.)
const maskSpans = rawSrc.map((s) => {
  const spans = [];
  for (const m of s.matchAll(new RegExp(TOKEN.source, 'g'))) {
    spans.push([m.index, m.index + m[0].length]);
  }
  return spans;
});
const inSpan = (spans, i) => spans.some(([a, b]) => i >= a && i < b);

const unused = [];
for (const name of exports_) {
  if (dormantNames.has(name)) continue;
  const dot = new RegExp(`api\\??\\.${name}\\b`);
  const bracket = new RegExp(`api\\??\\[\\s*['"\`]${name}['"\`]\\s*\\]`, 'g');
  const used = noStrings.some((s) => dot.test(s))
    || rawSrc.some((s, fi) => [...s.matchAll(bracket)]
      .some((m) => !inSpan(maskSpans[fi], m.index)));
  if (!used) unused.push(name);
}

assert.deepEqual(unused.sort(), [],
  `çağrısız preload export'ları (kaldır veya DORMANT listesine gerekçeyle ekle): ${unused.join(', ')}`);

// Dormant listesi gerçekten var olan export'ları işaret etmeli (sadeleşme kapanmamış).
const staleDormant = [...dormantNames].filter((n) => !exports_.has(n));
assert.deepEqual(staleDormant, [], `dormant listede olmayan export: ${staleDormant.join(', ')}`);

console.log(`preload-usage-ratchet: ${exports_.size} export, ${dormantNames.size} dormant, 0 kullanılmayan`);
