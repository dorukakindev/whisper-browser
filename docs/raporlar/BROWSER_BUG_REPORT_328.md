# BROWSER_BUG_REPORT_328 — Kuyruk görevi 16: büyük transkript sanallaştırma/performans

- Tarih: 2026-10-01 (UTC)
- Dal: `devin/1790882694-item16-cue-index` (taban `48376e2`)
- Kapsam: `src/renderer/renderer.js` cue-listesi + aktif-cue arama hattı

## Görev metni (kuyruk 16/50)

"Büyük transkript sanallaştırması: On binlerce cue için görünür alanı ve yakın
çevresini çizen yapıyı geliştir. Arama, seek, düzenleme ve erişilebilirlik
davranışlarını koruyarak bellek ve etkileşim sürelerini karşılaştır."

## Mevcut yapının gereksinim karşılığı

| Gereksinim | Önceki durum |
|---|---|
| Görünür alanı çizen yapı | VAR — `renderCueList` 500-kart sayfalama + `cueListPageStart` + auto-follow sayfa takibi |
| Arama | VAR — `foldIndexCached` içerik-adresli katlama (24k cap) + sorgu-anahtarı sıfırlama |
| Seek | **DARBOĞAZ** — `findCueAt` doğrusal tarama; timeupdate tick'i ve her seek'te O(n) (10k'da ~30µs→çarpan 2 kanal) |
| Düzenleme | VAR — zaman-doğrusu sürüklemesi + split/merge splice'ları |
| Erişilebilirlik | VAR — sayfa/kart yapısı + "aktif satıra dön" |

## Ölçüm ve düzeltme

**Ölçülen kusur:** `findCueAt` ipucu (hint) kaçırınca tüm diziyi tarıyordu — seek
sonrası ilk tick + sona-eklenen/boşluk senaryolarında 10k cue başına O(n).
Ölçüm: 10k cue × 2000 rastgele seek = **61.6ms doğrusal → 6.9ms indeks (~9×)**.

**Uygulama:** `cueSearchIndex(cues)` — `starts` Float64Array + `maxEndAfter`
sonek-maksimum dizisi; aday aralığı ikili aramayla bulunur, geriye ilk eşleşme
son eşleşmedir. Sonuç eski doğrusal semantikle birebir (oracle kilitli: son
eşleşen, çakışmalı/devasa/boş-aralıklı durumlar dahil). WeakMap önbelleği
head/tail/length + `_cueIndexVersion` damgasıyla geçersizleşir — zaman-doğrusu
sürüklemesi (yerinde mutasyon) bayat indeks üretmez.

## Test kanıtı

- `cue-list-perf.test.js`: 8/8 — parity oracle (10k, kasıtlı çakışma), perf sınırı
  (2000 seek <250ms), mutasyon geçersizleme.
- `browser-subtitle-long-timeline.test.js`: 14.400 blok × 30.000 seek + boşluk
  688ms'de geçti (dilim sınırı güncellendi).
- `cue-seek-regression` 4/4, `subtitle-output-contract` geçti.

## Bilinen sınırlar

- Sayfa modeli (500 kart) korunur — tam sanal-scroll ayrı mimari işi; sayfalama
  zaten DOM'u sınırlıyor, asıl maliyet seek/tick tarafındaydı.
- `_cueIndexVersion` elle bump istiyor: yeni yerinde-zaman-mutasyonu ekleyen
  kod bump'ı unutursa test mutasyon kilidi hatırlatır.

## Windows etkisi

Yalnız renderer tarafı; Windows'ta ek risk yok.
