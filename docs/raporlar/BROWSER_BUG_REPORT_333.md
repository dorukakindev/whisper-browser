# BROWSER_BUG_REPORT_333 — Kuyruk-50 madde 21: Adapter uyumluluk paketi

Tarih: 2026-10-01 · Dal: `devin/<ts>-r421-adapter-contract` · Başlangıç: `62d04f6`

## Kapsam

Madde 21: "Browser adapter'ları için ortak davranış sözleşmesi ve yerel site
fixture'ları; gezinme, parça seçimi, hata ve temizleme davranışı aynı
senaryolarla sınansın, sapmalar giderilsin."

## Bulunan kusur

**B-333-01 (şema kapısı):** `BrowserAdapterRegistry.forPage` ve `forResponse`
URL'den şemasız hostname çıkarıyordu — `ftp://netflix.com/x` netflix
adaptörüne eşleniyordu. Sayfa adresleri her zaman http/https'dir; ftp/data/
javascript gibi şemalar servis iddiası görmemelidir. `forPage` artık
http/https dışında `null` döner; `forResponse` http/https olmayan yanıtta
host'u boş bırakır (sayfa adaptörünün `responseHint` bağlam iddiası korunur).

## Sözleşme paketi (tests/browser-adapter-contract.test.js — 309 kontrol)

- 16 yerleşik adaptör için **site fixture tablosu**: gerçek sayfa/yanıt URL
  çiftleri (netflix→nflxvideo, youtube→googlevideo, prime→media-amazon,
  disney→bamgrid, hulu, vimeo→vimeocdn...), yabancı-sayfa sızma kontrolü.
- Aynı senaryolar hepsine: sayfa eşleşmesi, yanıt bağlamı, altyazı/manifest
  yolu kabulü, junk (jpg/json/js) reddi, frozen/etiket/yetenek/sürüm
  invariantları, çift-kayıt reddi, geçersiz-id reddi, JSON dizini yükleme
  (geçerli/bozuk/64KB-üstü/yok-dizin), bilinmeyen sayfa→generic.
- Ağ erişimi yok; deterministik.

## Kanıt

- `node tests/browser-adapter-contract.test.js` → **309 PASS 0 FAIL**
  (ilk koşuda 1 FAIL → B-333-01 giderildi)
- `node tests/browser-adapter-registry.test.js` + `browser-adapters.test.js`
  → tamamı yeşil (regresyon yok).
