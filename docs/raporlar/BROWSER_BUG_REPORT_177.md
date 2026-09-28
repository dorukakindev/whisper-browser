# BROWSER_BUG_REPORT_177 — R197: kalan denetlenmemiş yüzey kapanışı (5 dosya + kalıntı desen süpürmesi)

Tarih: 2026-09-28 · Dal: `codex/r197-final-sweep` · Başlangıç: `d1e38d4` (master)

## Kapsam

Önceki turlarda hiçbir raporda adı geçmeyen son `src/` dosyaları tam okundu:

| Dosya | Boyut | Bulgu |
|---|---|---|
| `browser-omnibox.js` | 205 | Temiz — bang çözümleyici + güvenli aritmetik (charset/tokenize/shunting-yard; uzunluk kapağı, `Number.isFinite` filtresi, unary-minus önceliği belgeli). `markdownLink` iki çağrıcısı da yalnız pano yazıyor (`clipboard.writeText`, `window.api.copyText`) — DOM'a render edilmiyor, `javascript:` vekili yok. |
| `browser-settings-registry.js` | 290 | Temiz — salt veri + `includes` arama; `browserSettingScopeStatus` sadece `site-profile` kapsamında çağrılıyor ve `textContent` yazıcısına gidiyor. |
| `browser-translation-provider-error.js` | 15 | Temiz — 503 "no available channel" sınıflandırması doğru; `Number()` güvenli. |
| `subscription-feed.js` | 74 | **1 düzeltme** (aşağıda). |
| `subtitle-find-replace.js` | 207 | Temiz — grapheme-kümesi sınır disiplini, NFKC katlama denetimleri, yavaş yol erken-kırılma sınırı (`needle.length + 2`) yerinde. |

Vendor varlıkları (`jassub` WASM, `qcms`, `jbig2`, `openjpeg`, `pdf.js`,
`hls.js`, `qrcode`): ikili içerik denetlenemez; repo-içi sabit + lisans
dosyaları + `whisper-assets://` protokolünün 5-dosya allowlist'i (GET/HEAD,
search/hash reddi) yeterli sınır sağlıyor.

## Doğrulanmış bulgu

**`subscription-feed.js` — bozuk `<published>` → `NaN` zehirlemesi (düşük).**
Bozuk tarih dizesi `Date.parse` → `NaN` olarak saklanıyordu; sıralama
`||0` ile korunuyor ama IPC `JSON.stringify` yolunda `null`'a düşüp renderer'a
kirli veri gidiyordu. Artık `Number.isFinite` kapısıyla `0` saklanıyor.
Regresyon testi `tests/subscription-feed.test.js`'te.

## Kalıntı desen süpürmesi (bu tur)

- `decodeURIComponent` try'siz: tek site `whisper-pdf` protokol işleyicisinde
  — tüm gövde zaten `try { … catch → Response 500 }` içinde. Temiz.
- `new URL(...)` try'siz 14 site tarandı: `browser-media-identity`
  (normalizeBrowserUrl çıktısı zaten geçerli), omnibox `isLikelyDomain`
  (try içinde), `media-catalog-service` × 2 (`ERR_INVALID_URL` → Türkçe mesaj
  eşlemesi mevcut catch sınırında), statik `URL` sabitleri — hepsi güvenli.
- `RegExp.exec/match` null dönüşleri ve `Object.entries` null'a karşı
  önceki turlarda tarandı; yeni site bulunmadı.

## Testler

- `node tests/subscription-feed.test.js` → 32/32 (4 yeni kontrol)
- `node --check src/subscription-feed.js` → temiz
- Koşulmadı: tam `npm test` turu bu dalda (tek dosya düzeltmesi + hedefli test
  yeterli; CI'da tam paket koşacak).

## Sınırlar

- Vendor WASM ikilileri binary blob — Git bütünlüğü + paket imzası korur;
  yükseltme gerektiğinde kaynaktan yeniden üretilmeli (README'de rebuild
  tarifi qrcode için var; jassub/pdf.js için de yeniden-üretim notu
  eklenebilir, düşük öncelik).
- Windows'a el kontrolü gerekmez (yalnız veri temizliği; etki: bozuk besleme
  tarihinde `null` yerine `0`).
