# BROWSER_BUG_REPORT_329 — Kuyruk görevi 17: kaynak/hedef ortak arama dizini

- Tarih: 2026-10-01 (UTC)
- Dal: `devin/1790883058-item17-cue-search-index` (taban `054a0d7`)
- Kapsam: `src/renderer/renderer.js` cue arama + `src/browser-address-model.js` katlama

## Görev metni (kuyruk 17/50)

"Kaynak/hedef ortak arama indeksi: İki altyazı dilinde zaman bağlantılı arama
geliştir. Türkçe harfler, birleşik Unicode ve noktalama varyantlarında doğru
eşleşmeyi bul; büyük dosyada her tuşta tüm listeyi tarama."

## Bulgular ve çözümler

| Gereksinim | Önceki durum | Şimdi |
|---|---|---|
| Her tuşta tüm listeyi tarama | 10k cue'da ~1.6–3.8ms/tuş — fold cache'li ama O(toplam metin) | **Düzeltildi:** n-gram posting dizini — seçici sorgu 0.003–0.03ms/tuş (~100–1000×); en kötü durum (hepsini eşleşen) da eşit/hızlı |
| Zaman bağlantılı ortak arama | Karşıt metin ayrı includes ile taranıyordu | Her cue'nun kaynak+zaman-eşleşen karşı metni tek yoğun forma iner — hedef dilindeki eşleşme aynı cue indeksine düşer |
| Türkçe harfler | Var — I/İ/ı→i, aksan temel harfe (ç→c, ş→s) | Korunur, kilitli |
| Birleşik Unicode | Var — NFD ayrışımı + Hangul jamo NFC | Korunur, kilitli |
| Noktalama varyantları | EKSIK — ' … — ？ ASCII ile eşleşmiyordu | **Düzeltildi:** PUNCT_FOLD — kesme/tırnak/tire/ellipsis/genişlik varyantları ASCII'ye iner (metin+sorgu aynı katlamada) |

## Uygulama

`cueTextSearchIndex(cues, cues2)` — WeakMap önbelleği, head/tail/length +
`_cueIndexVersion` damgası (iki dizi için de). Posting listeleri artan sırayla;
küçük liste önce, diğerleri ikili aramayla süzülür; `includes(q)` doğrulaması
sonuçları eski taramayla birebir kılar. Dizin kurma ~250ms tek sefer (10k, 2 dil)
— yalnız ilk arama tuşunda, sürüm değişene kadar önbellekli.

## Test kanıtı

`tests/cue-search-index.test.js` 7/7: oracle parity, hedef→kaynak zaman
bağlantısı, TR harf/aksan, NFD/NFC, noktalama varyantları, 400 seçici sorgu
<250ms sınırı, mutasyon geçersizleme. `cue-list-perf` 8/8, `browser-omnibox` 77,
`browser-address-model` 9, `browser-address-perf` 0 fail.

## Windows etkisi

Yalnız renderer/arama tarafı; risk yok.
