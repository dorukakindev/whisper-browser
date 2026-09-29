# BROWSER_BUG_REPORT_215 — R263: 10k-cue overlay sınır taraması O(2n) → O(log n + aktif)

## Özet
Tarayıcı altyazı katmanı (`browser-overlay-controller.js` `queueFrame`) her kare planlamasında
sonraki cue sınırını bulmak için **tüm cue listesini tarıyordu** (`collectBoundaries` → her cue'nun
`start` ve `end`'i). 10 bin cue'lu bir izde kare başına ~20 bin işlem; `requestVideoFrameCallback`
frekansında bu, uzun filmlerde/sürüklemede renderer'ı gereksiz yorar.

Bu turda sınır arama `nextCueBoundaryAt(cues, sourceTime)` ile indeksli hale getirildi:
bir kez O(n) indeks (WeakMap, sona-ekleme uzantısı destekli), kare başına O(log n + aktif cue sayısı).

## Kanıt
- `tests/browser-overlay-boundary.test.js` (yeni):
  - fuzz: 60 tur × ~160 sorgu ≈ 10k+ rastgele (liste, t) çifti — sonuçlar naif tam-taramayla **birebir**
  - kenarlar: boş/NaN girdi, tek cue, overlap, sıfır-süre, uzun cue, bozuk `start`/`end`
  - uzatma: sıralı push indeksi tazeler; sıra-bozan push ve yerinde `end` mutasyonu bekçileri
    (`tailCue`/`tailEnd`) yakalayıp tam taramaya düşürür
  - **perf:** 10k cue × 20k sorgu → indeksli ~15.5 ms vs tam-tarama ~2724 ms (**~176×**, bütçe <400 ms)
- Mevcut overlay testleri: `browser-overlay-timing`, `browser-overlay-controller`,
  `browser-overlay-readiness`, `browser-overlay-position` — hepsi PASS
- Gerçek Electron smoke `tests/electron-overlay-timing.smoke.js` (xvfb): PASS — 23 örnekte
  0 yanlış cue, seek/2×/0.5×/pause/hidden/reshow genişlemeleri temiz, 9 boundary callback doğru arm'landı

## Doğruluk gerekçesi
`sourceToVideo`/`videoToSource` dönüşümü doğrusal (scale>0, offsetSeconds) → monoton → sınır araması
kaynak zamanında yapılıp sonuç video zamanına çevrilir. t'den sonraki min sınır şunlardan biridir:
ilk gelecek cue'nun `start`'ı, ilk gelecek cue'nun `end`'i (bozuk `end<start` verisi için), daha sonraki
cue'ların min `end`'i (suffixMin), aktif cue'ların `end`'leri (prefixMax geriye-yürüme). Hepsi kapsanır.

Bozuk/sıralanmamış iz (NaN/azalan `start`) bir `sorted` bayrağıyla tespit edilip eski tam-tarama
davranışına düşer — ürün izleri ingest'te zaten start-sıralı (3 ayrı sıralama noktası).

## Windows etkisi
Yok — saf JS, üstelik sayfa içi (enjekte) kod; davranış değişmez, yalnız CPU kullanımı düşer.

## Değişen dosyalar
- `src/browser-overlay-controller.js` — `nextCueBoundaryAt` + `collectBoundaries` yeniden yazımı, export
- `tests/browser-overlay-boundary.test.js` — yeni (fuzz + perf)
- `tests/browser-overlay-controller.test.js` — betik-içi regex güncellemesi (eski `sourceToVideo(raw, ...)` ifadesi artık yok)

## Çalıştırılmayanlar
Tam `npm test` koşulmadı (overlay etki alanı dar); CI ubuntu+windows koşar.
