# BROWSER_BUG_REPORT_201 — R244: performans/UX katalog kalıntıları (v8CacheOptions + is-compact)

**Dal:** `fix/r244-perf-preview` · **Taban:** `b36d453` · **Kod commit'i:** `842d23f`

## Kapsam

Önceki turlardan kataloglanan iki ertelenmiş maddenin değerlendirmesi:
`v8CacheOptions: 'code'` analizi ve sekme önizleme kartı için `is-compact`
tasarım seçeneği.

## 1. `v8CacheOptions` değerlendirmesi → `bypassHeatCheck` uygulandı (yalnız ana pencere)

- Electron'un varsayılan politikası zaten `code` (buluşsal/heat-check): betik,
  birkaç kez yüklendikten sonra V8 kod önbelleğine girer; ilk açılışlarda önbellek
  devreye girmez.
- Ana pencere `loadFile` ile her açılışta aynı büyük renderer paketini (`index.html`
  + `renderer.js` + `renderer-helpers.js`, ~2MB) yükler → `bypassHeatCheck` ilk
  yüklemeden itibaren deterministik önbellekleme sağlar; soğuk açılışta derleme
  süresi düşer. VS Code'un kullandığı politika; Electron önerisi de "bypassHeatCheck
  tüm uygulamalar için makul varsayılan".
- `bypassHeatCheckAndEagerCompile` özellikle reddedildi: erken derleme bellek/GC
  baskısı ve ters açılış maliyeti riski taşır — `electron-security.test.js`'e
  ratchet eklendi (yalnız 1 kullanım, yalnız `bypassHeatCheck`, eager yasak).
- Sekmeler (WebContentsView), YouTube TV penceresi ve popup'lar bilinçle
  varsayılan `code` politikasında bırakıldı: rastgele üçüncü-taraf betiklerini
  agresifçe önbelleğe almak kazanç getirmez.

**Değişen dosya:** `src/main.js` — ana pencere `webPreferences`'a
`v8CacheOptions: 'bypassHeatCheck'` + gerekçe yorumu.

## 2. `is-compact` önizleme kartı → uygulandı

- R239 kartı native yüzeyin üst çizgisine kelepçeliyor; kart krom şeridinden
  uzunsa içerik `overflow:hidden` ile sırıtıyordu (en alt satırlar yarım görünür).
- Yeni davranış: doğal kart yüksekliği kullanılabilir şeridi (`topLimit-8`) aşarsa
  `is-compact` sınıfı eklenir — url ve rozet satırları CSS ile gizlenir, kart tek
  satırlık başlığa küçülür ve yeniden ölçülerek kelepçelenir.
- **Değişen dosyalar:** `src/renderer/renderer-helpers.js` (karar + yeniden ölçüm),
  `src/renderer/browser-chrome.css` (`.browser-tab-preview.is-compact` kuralları).

## Test kanıtı

| Kontrol | Sonuç |
|---|---|
| `node --check` main.js + renderer-helpers.js | geçti |
| `tests/browser-tab-preview.test.js` (2 yeni senaryo) | 6/6 |
| `tests/electron-security.test.js` (+v8Cache ratchet) | 1297 kontrol |
| `electron-browser-tab-preview.smoke.js` (kompakt + urlHidden eklendi) | PASS |

## Sınırlar

- Önbellek kazanımı ölçülmedi (kutu başsız; startup A/B Windows'ta anlamlı).
- Kompakt kartın görsel görünümü Electron smoke'unda mantıksal doğrulandı
  (sınıf + display:none); göz kontrolü Windows'ta önerilir.
