# BROWSER_BUG_REPORT_160 — R180: 54 hiç-raporlanmamış dosya derin denetimi + sınırsız gövde okuma sınıfı

Tarih: 2026-09-27 · Dal: `codex/r180-deep-audit-1790535899` · Başlangıç: `8cb4bb7`

## Kapsam

`comm -23` kapsam farkı: `src/*.js` + `src/renderer/*.js` + `backend/*.py` (224 dosya) eksi
`docs/raporlar/*.md` içinde adı geçen dosyalar (170) → **54 dosya hiçbir raporda adı geçmemişti**.
Bu turda 54'ün tamamı derin okundu (güvenlik-kritik önce: script-execution, provider-api-keys,
subscription-feed/XML ayrıştırma, secrets, pruner, DRM, gerisi sırayla).

## Doğrulanmış bug: sınırsız gövde okuma (remote body read without cap)

**Desen:** `await res.text()` / `await res.arrayBuffer()` gövdenin **tamamını** belleğe alır;
ardından yapılan `length > sınır` kontrolü yalnızca "sonradan budama"dır — devasa bir yanıt
kontrolden ÖNCE belleği şişirir. `content-length` beyanı sunucu kontrolündedir (yalan
olabilir veya hiç gönderilmeyebilir → `|| 0` → kapıyı geçer). Sınırın okuma **sırasında**
uygulanması gerekir (SponsorBlock/DeArrow/RYD fetcher'larının duruşu — R179).

**Düzeltilen 5 yüzey:**

| Yer | Eski | Yeni |
|---|---|---|
| `main.js` `subs:rssFeed` (RSS akışı) | `res.text()` → `.slice(256K)` | `readResponseBufferLimited` (akışta 256K) |
| `main.js` altyazı indirme (~9131) | `arrayBuffer()` → post-check `> maxBytes` | `readResponseBufferLimited` + `EBROWSER_UNSAFE_RESPONSE` eşlemesi (abort korunur) |
| `main.js` görseli kaydet (~5259) | `arrayBuffer()` → post-check `> 50 MB` | `readResponseBufferLimited` (50 MB, akışta) |
| `main.js` favicon indirme (~12593) | `arrayBuffer()` → post-check `> 256K` | `readResponseBufferLimited` (256K, akışta) |
| `catalog-discovery.js` TMDB `request` | `response.text()` → post-check `> 4e6` | `readTextLimited` → `readLimitedBytes` (akışta) |
| `catalog-extensions.js` TMDB afiş | `arrayBuffer()` → post-check `> 8e6` | `readLimitedBytes` (8 MB, akışta) |

- `readResponseBufferLimited` (main.js:5798) zaten vardı: content-length beyan kontrolü +
  `body.getReader()` akışta byte sayımı + `reader.cancel()` + `releaseLock`.
- `catalog-discovery.js` için modül-içi `readLimitedBytes` eklendi ve `catalog-extensions`
  ile paylaşıldı; `readTextLimited` üstüne sarıldı. `getReader` yoksa `arrayBuffer`/`text`
  yedeği (test mock'ları ve eski ortamlar) — Electron'un `session.fetch`/undici yanıtlarında
  her zaman `getReader` var.
- Altyazı indirmede sınır hatası `EBROWSER_UNSAFE_RESPONSE` olarak korunur; abort ve gerçek
  ağ okuma hataları sınıf değiştirmeden iletilir (`/sınırını aşıyor/` ayrımı).

**Temiz bırakılan `arrayBuffer`/`blob` okumaları:** `main.js:5308/7372` (canvas→PNG dönüşümü,
zaten `width*height` kapısı var), `main.js:11047` (XHR capture shim — sayfa-dünyası
enstrümantasyonu), `renderer.js:20529` (file:// PDF — kullanıcının seçtiği yerel dosya,
boyut-eşitliği doğrulaması var), `browser-subtitle-search.js:46`/`translation-provider-probe.js:69`
(zaten kendi sınırlı okuyucularının yedek kolu).

## Temiz çıkan denetim yüzeyleri (54 dosya — hepsi okundu, kanıtlı notlar)

- **script-execution / provider-api-keys:** context-loss + navigation sınıflandırıcı;
  proto-kirliliği kapısı, sınırlı profiller, sıralı serileştirme.
- **subscription-feed:** regex Atom/RSS; `FEED_ENTRY_MAX=200`, `FIELD_MAX=4000`,
  `videoId [\w-]{6,20}` — `Date.parse` NaN akışı `||0` ile nötralize (zararsız).
- **subscriptions-io:** OPML/CSV/JSON/NewPipe; UCID regex; MAX_SUBS=1000.
- **pruner / drm / event-envelope:** `.youtube.com` sonek kontrolü; UA Electron-strip + URL
  redaksiyonu; sürüm pin'i + çok-alan eşleşme.
- **model-manager:** `deleteCachedModel` realpath containment (`repoResolved.startsWith`).
- **browser-omnibox:** bang kısayolları, elle-yazılmış hesaplayıcı (öncelik doğru).
- **media-folders / gpu-diagnostics / ai-context / asset-gc / fonts:** sınır+caps doğru.
- **subtitle-find-replace:** NFKC uzunluk-değiştiren kod noktaları `FOLD_LENGTH_CHANGING`
  tablosuyla kapsanmış; yavaş-yol kod-noktası sınır taraması doğru.
- **subtitle-export-validation:** BOM beklentisi + cue-sayısı + 2ms zaman toleransı.
- **translation-provider-probe:** https-ya-loopback kapısı + credential reddi + 64KB akış sınırı.
- **player-task-center / status-copy / series-context / dialogue / mini-preload / soak-probe:**
  UI model yardımcıları; dinleyici/zamanlayıcı eşleşmeleri tam; Sequence/signature bayrakları
  bayat-yanıt koruması sağlıyor.
- Kalan ~30 dosya da aynı titizlikte okundu; sınır/beyaz-liste/atomiklik disiplini her yerde.

## Testler

- `tests/subscription-feed.test.js`: +2 ratchet (sınırlı okuyucu kullanımı + sınırsız
  `res.text()` yokluğu) + `readResponseBufferLimited` kaynak ratchet'i — **28 kontrol yeşil**.
- `catalog-roadmap.test.js`: yeşil (mock fetch yalnız `text()` sağlıyor — fallback yolu kapsandı).
- `media-catalog-service`, `media-catalog-store`, `nmdb-catalog-import`, `browser-favicon-cache`,
  `browser-subtitle-search`, `browser-subtitle-standards`, `browser-subtitle-retry`,
  `browser-subtitle-health`, `adversarial-ipc`: hepsi yeşil.
- `node --check` main/catalog-discovery/catalog-extensions/subscription-feed: temiz.

## Windows etkisi

Yok — tüm düzeltmeler Node/undici fetch katmanında; Electron `session.fetch` web-stream
gövdeleri `getReader` destekler. Davranış değişikliği: yalnızca aşırı büyük yanıtlar artık
belleği şişirmeden kesilir. `start.bat`/kurulum etkilenmez.

## Doğrulanmamış sınırlar

- Canlı YouTube RSS/TMDB uçları stub-testli; gerçek devasa-yanıt davranışı Windows'ta el
  kontrolü önerilir (abonelik akışı + TMDB afiş indirme).
- `session.fetch` gövde stream'inin `getReader` varlığı Electron 28+'da varsayılıyor;
  yedek yol kapsanmış olsa da Windows'ta abonelik akışının yenilenmesi doğrulanmalı.
