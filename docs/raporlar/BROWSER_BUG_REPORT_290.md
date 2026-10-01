# BROWSER BUG REPORT 290 — R328-2: jsdom/VM-realism ratchet'i

- Tarih: 2026-09-30
- Kapsam: `src/renderer/` sandbox realm sözleşmesi + vm-stub test gerçekçiliği
- Sonuç: **temiz** — üretim renderer'ında Node-globe referansı yok; ratchet eklendi.

## Arka plan

87 test dosyası kodu `vm.createContext` içinde elle kurulmuş bağlamlarda
koşturur. Bir testin bağlamına yanlışlıkla `require`/`process`/`Buffer`
gibi Node globe'leri sızarsa, sandboxed renderer'da (contextIsolation)
`ReferenceError` ile çökecek kod testlerde yeşil görünür — sessiz
gerçekçilik açığı.

## Denetim bulguları

- `src/renderer/*.js` (vendor hariç, taraf-1 kaynak) — `require(`,
  `__dirname`, `Buffer`, `global.x`, `exports.x`, `process.<node-üyesi>`
  taraması: **0 ihlal**.
- `src/renderer/renderer.js:8020` — `const process = gpuProcesses[0]`
  yerel gölgeleme; Node globali değil. Ratchet bu yüzden yalnız Node'a
  özgü üyelikleri (`env|argv|cwd|platform|exit|...`) yasaklar.
- `queue-lifecycle.js`, `status-copy.js`, `ui-locale.js` — `typeof
  module` korumalı UMD dual-export kalıbı; testlerin `require`
  edebilmesi için bilinçli. Ratchet korumasız `module.exports`'u yasaklar.
- `src/renderer/vendor/` (jassub, hls, qrcode) — üçüncü taraf UMD
  shim'leri Node-globe serbestliği içerir; taraf-1 sözleşmesi dışında
  bırakıldı (interval-inventory'nin aynı dışlamasıyla tutarlı).

## Eklenen ratchet — `tests/renderer-realm-faithfulness.test.js` (3/3)

1. `src/renderer/*.js` (vendor hariç) Node-globe kalıplarını içeremez +
   korumasız `module.exports` yasak.
2. Canlı realm probu: `window` dışında globe'siz `vm` bağlamında
   `status-copy.js`/`ui-locale.js`/`queue-lifecycle.js` yüklenir ve
   `window.StatusCopy.clock` çalışır — sandbox gerçekliğinde yükleme.
3. `index.html`'in `<script src>` referansları yerel ve mevcut (harici
   script yok, CSP `script-src 'self'` ile tutarlı).

## Sınırlar

- Statik regex tabanlı; yorum/satır-içi dizgilerde teorik false-positive
  mümkün (şu an sıfır). Windows: taramada `path.sep` duyarlı eşleme yok.
- Realm probu `window` stub'lı minimal realm kullanır; tam DOM sadakati
  değil — gerçek DOM davranışı Electron smoke'larının konusu.
