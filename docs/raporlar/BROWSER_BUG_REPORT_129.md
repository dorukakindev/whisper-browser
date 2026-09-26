# BROWSER_BUG_REPORT_129 — R129 derin denetim turu

Tarih: 2026-09-26 · Dal: `codex/r129-deeper-audit-1790437096` · Taban: master `43397cc`

Odak (önceki turların ertelenen modülleri + yeni desen sınıfları): dinleyici/zamanlayıcı
sızıntıları, kopmuş-DOM tutma, sessiz promise reddi. Derin okunan modüller:
`browser-manga.js` (tam), `browser-page-translate.js` (tam), `browser-reader.js` (tam),
`browser-feature-services.js` (tam); ayrıca main.js + renderer.js + tüm enjekte script
modüllerinde dinleyici/zamanlayıcı eşleşme süpürmesi.

## Doğrulanmış buglar (düzeltildi)

### 1. `pageRestoreScript` eylem dinleyicilerini kaldırmıyor — DOM/state sızıntısı + ölü etkileşim

`pageApplyScript` `document`/`globalThis`'e 6 anonim dinleyici kurar
(pointerover, pointermove, pointerout, click, keydown, keyup). `pageRestoreScript`
observers + scroll + visibilitychange'i kaldırıyor ama bu 6 dinleyiciyi kaldırmıyordu
ve `ref.active` bayraklarını da indirmiyordu.

Sonuç: restore sonrası `window.__whisperPageTranslateState` silinse bile anonim
closure'lar `state`'i — dolayısıyla `refs`/`refByRoot`/`originalValues`'daki tüm sayfa
DOM düğümlerini — belge ömrünce canlı tutuyordu (SPA'da uzun süreli bellek sızıntısı).
Ayrıca ölü dinleyiciler her pointerover'da `composedPath()` + WeakMap taraması
yapmaya devam ediyor ve `ref.active` true kaldığı için eski araç çubuğunu
gösterebiliyordu.

Düzeltme: dinleyiciler `listen()` yardımcısıyla `state.pageActionListeners` dizisine
`[target, type, fn]` olarak kaydediliyor; restore hepsini `removeEventListener` ile
söker, `pageActionListeners`/`actionsInstalled` sıfırlanır ve tüm ref'ler
`ref.active = false` yapılır.

Regresyon: `tests/browser-page-translate.test.js` — 6 dinleyicinin kurulduğunu,
restore'da kayıt defterinin boşaldığını ve ref'in pasifleştiğini vm-harness ile
doğrulayan davranışsal test.

### 2. Kopmuş shadow-root MutationObserver'ları `state.observers` Map'inde tutuluyor

`observeRoots()` `state.observers` (güçlü `Map`) üzerine kök başına MutationObserver
kaydeder; SPA'da host elementi DOM'dan koptuğunda kök listeden hiç silinmiyordu.
Map anahtarı kopmuş shadow root'u — ve observer'ın gözlediği tüm alt ağacı —
belge ömrünce canlı tutuyordu (kök başına 128'e kadar, her biri bütün bir
detached subtree).

Düzeltme: `observeRoots()` girişinde budama — `root !== document &&
root.isConnected === false` ise `disconnect()` + `delete`. `document.isConnected`
her zaman true olduğundan belge kökü korunur.

Regresyon: aynı test dosyasında — belge + shadow observer'ı kurulur, shadow
`isConnected=false` olup host keşiften düşünce ikinci tarama observer'ı söker.

## Süpürme sonucu temiz çıkan desen sınıfları

- **Timer/listener eşleşmesi** — `main.js` (watchTimer, browserTrack/Capture/Media
  Timer, element-picker 3 dinleyicisi cleanup'ta, capture seekHandler restore'da),
  `renderer.js` (ambientTimer, browserMangaLookaheadTimer, playerTaskPulseTimer,
  _ytCodeTimer hepsinin clearInterval yolu var), `browser-link-hints.js` (cleanup
  fonksiyonu), `browser-overlay-controller.js` (drag/activity çiftleri),
  `browser-reader.js` (dinleyiciler kaldırılan host DOM'uyla GC'lenir + globalThis
  anahtarı silinir), `browser-manga.js` (tek Resize/IntersectionObserver, clear'da
  disconnect), `browser-media-controller.js` (sessizlik monitörü timer'ı
  stopSilenceMonitor'da).
- **`executeJavaScript` red yönetimi** — main.js'teki 32 çağrının tamamı
  `withTimeout`/`await` içinde ya da `.catch(() => null)` ile kapalı.
- **`JSON.parse` bağlamları** — renderer.js'teki 23 çağrının tamamı try yakınında;
  `queue-lifecycle.js` yalnız yapısal klon.
- **`browser-feature-services.js`** — `authorized` kapısı, `valid()`
  (generation+mediaId) bayatlık kontrolü, AbortController kuyruğu, atomik yazı
  (tmp+rename, wx bayrağı), boyut limitleri (8MB altyazı, 2MB ASS), seri kayıt
  yetimlik kuralı — temiz.
- **`browser-manga.js`** — önceki turun orta bölümü tamamlandı: isTrusted kapıları,
  `isSafeMangaImageUrl`/`isPublicMangaIpAddress` (IPv4 private/loopback/CGNAT +
  IPv6 non-global + ::ffff:/6to4/Teredo/doc-prefix), sınırlı JSON çıkarımı, bölge
  kapları (160/1200/48000), src-id WeakMap LRU (16), dirty-guard editör — temiz.

## Çalıştırılan testler

- `node tests/browser-page-translate.test.js` — geçti (yeni 2 regresyon dahil)
- `node tests/audit-2026-09-22-browser-translate.test.js` — 18/18
- `node tests/browser-manga.test.js` — 93
- `node --check src/browser-page-translate.js` — temiz

Çalıştırılmayanlar: tam `npm test` (kapsam dışı; değişen tek enjekte script),
Electron smoke'ları (nested-spawn bu kutuda zygote FATAL — CI'da koşar).

## Windows etkisi

İyileştirme yalnız; platform mantığı bozmaz. Uzun YouTube SPA oturumlarında
sayfa çevirisi restore sonrası bellek büyümesi azalır. `install.bat`/`start.bat`,
dosya seçici, GPU/CUDA etkilenmedi. Doğrulanmamış sınır: gerçek Windows'ta
uzun SPA oturumu bellek davranışı elle doğrulanmadı (kök neden platformdan bağımsız).
