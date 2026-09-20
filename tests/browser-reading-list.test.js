// B22 — çevrimdışı okuma listesi: depo sözleşmesi + IPC/renderer bağlantıları.
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { BrowserReadingList, INDEX_LIMIT } = require('../src/browser-reading-list');

const renderer = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'renderer.js'), 'utf8');
const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
const preload = fs.readFileSync(path.join(__dirname, '..', 'src', 'preload.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'index.html'), 'utf8');

function withStore(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reading-list-'));
  try { return fn(new BrowserReadingList(dir), dir); }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

// --- Depo sözleşmesi ---

withStore((store, dir) => {
  const plan = store.prepare({ url: 'https://example.com/makale?utm_source=x&a=1#frag', title: 'Deneme <Sayfa>: A/B?' });
  assert.equal(plan.ok, true, 'prepare geçerli sayfa için plan üretmeli');
  assert.equal(plan.entry.url, 'https://example.com/makale?a=1', 'izleme parametreleri ve hash kanonikleştirilmeli');
  assert.ok(plan.filePath.startsWith(dir), 'dosya hedefi depo kökü altında olmalı');
  assert.ok(!/[<>:"|?*]/.test(plan.entry.fileName), 'dosya adı güvenli olmalı');
  fs.writeFileSync(plan.filePath, 'mhtml-icerik');
  const committed = store.commit(plan.entry);
  assert.equal(committed.ok, true);
  assert.equal(committed.entry.sizeBytes, 12, 'dosya boyutu indekse yazılmalı');
});

withStore((store) => {
  for (const bad of ['javascript:alert(1)', 'file:///etc/passwd', 'data:text/html,x', 'ftp://x', '', null]) {
    assert.equal(store.prepare({ url: bad, title: 't' }).ok, false, `reddedilmeli: ${bad}`);
  }
});

withStore((store) => {
  const plan = store.prepare({ url: 'https://a.example/x', title: 'A' });
  fs.writeFileSync(plan.filePath, 'v1');
  store.commit(plan.entry);
  // Aynı URL tekrar eklenirse tek kayıt kalır ve güncellenir.
  const again = store.prepare({ url: 'https://a.example/x', title: 'A2' });
  assert.equal(again.refreshed, true, 'aynı URL mevcut kaydı yenilemeli');
  fs.writeFileSync(again.filePath, 'v2-daha-uzun');
  store.commit(again.entry);
  assert.equal(store.list().length, 1);
  assert.equal(store.list()[0].title, 'A2');
});

withStore((store, dir) => {
  const plan = store.prepare({ url: 'https://b.example/', title: 'B' });
  fs.writeFileSync(plan.filePath, 'x');
  store.commit(plan.entry);
  const id = plan.entry.id;
  assert.ok(store.get(id).filePath.endsWith('.mhtml'));
  assert.equal(store.remove(id).ok, true);
  assert.equal(fs.existsSync(path.join(dir, plan.entry.fileName)), false, 'silme MHTML dosyasını da kaldırmalı');
  assert.equal(store.get(id), null);
  assert.equal(store.remove(id).ok, false, 'olmayan kayıt silinemez');
});

withStore((store) => {
  // Dizin kaçışı engellenmeli.
  assert.equal(store._safeFilePath('../evil.mhtml'), '');
  assert.equal(store._safeFilePath('a/../b.mhtml'), '');
  assert.equal(store._safeFilePath('notmhtml.txt'), '');
  // Kayıt var ama dosya yoksa get() null döner.
  const plan = store.prepare({ url: 'https://c.example/', title: 'C' });
  store.commit(plan.entry);
  assert.equal(store.get(plan.entry.id), null, 'dosyası silinmiş kayıt açılamamalı');
});

withStore((store) => {
  const plan = store.prepare({ url: 'https://d.example/sayfa?b=2&a=1', title: 'D' });
  fs.writeFileSync(plan.filePath, 'v');
  store.commit(plan.entry);
  assert.equal(store.refreshTarget(plan.entry.id, 'https://d.example/sayfa?a=1&b=2&utm_x=9').ok, true,
    'kanonik eşleşme yenilemeye izin vermeli');
  assert.equal(store.refreshTarget(plan.entry.id, 'https://d.example/baska').ok, false,
    'farklı adres yenilemeyi reddetmeli');
});

withStore((store) => {
  // Sınır: INDEX_LIMIT'i aşan kayıt kesilir.
  const entries = [];
  for (let i = 0; i < INDEX_LIMIT + 5; i += 1) {
    const plan = store.prepare({ url: `https://e.example/${i}`, title: `E${i}` });
    fs.writeFileSync(plan.filePath, 'x');
    store.commit(plan.entry);
    entries.push(plan.entry.id);
  }
  assert.equal(store.list().length, INDEX_LIMIT);
});

// --- IPC + preload + renderer bağlantıları ---

for (const channel of ['readingList:add', 'readingList:list', 'readingList:remove', 'readingList:refresh', 'readingList:open']) {
  assert.ok(main.includes(`'browser:${channel}'`), `main.js ${channel} handler içermeli`);
}
for (const name of ['addBrowserReadingList', 'listBrowserReadingList', 'removeBrowserReadingList', 'refreshBrowserReadingList', 'openBrowserReadingList']) {
  assert.ok(preload.includes(name), `preload ${name} içermeli`);
  assert.ok(renderer.includes(name), `renderer ${name} çağırmalı`);
}
assert.ok(main.includes("require('./browser-reading-list')"), 'main.js depoyu require etmeli');
assert.match(main, /savePage\(readingEntry\.filePath, 'MHTML'\)/, 'MHTML kaydı savePage üzerinden');
assert.match(main, /pathToFileURL\(found\.filePath\)\.href/, 'açma file:// URL ile yapılmalı');
assert.ok(!main.includes('showSaveDialog') || !/readingList[\s\S]{0,400}showSaveDialog/.test(main.slice(main.indexOf('browser:readingList:add'), main.indexOf('browser:readingList:add') + 900)),
  'okuma listesi kaydı kullanıcıya dosya sormamalı');
assert.match(indexHtml, /id="browserReadLater"/, 'İçerik menüsünde okuma listesi öğesi olmalı');
assert.match(indexHtml, /data-place-tab="offline"/, 'yerler panelinde Çevrimdışı sekmesi olmalı');
assert.match(indexHtml, /id="browserPlaceTabOffline"/, 'Çevrimdışı sekme kimliği');
assert.match(renderer, /browserOfflineList/, 'renderer durum alanı');
assert.match(renderer, /data\.offlineOpen|dataset\.offlineOpen/, 'aç eylemi');
assert.match(renderer, /dataset\.offlineRemove/, 'sil eylemi');
assert.match(renderer, /dataset\.offlineRefresh/, 'yenile eylemi');
assert.match(renderer, /loadBrowserReadingList\(\)/, 'liste yükleyici bağlı olmalı');

console.log('browser-reading-list.test.js OK');
