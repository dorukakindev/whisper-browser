# BROWSER_BUG_REPORT_228 — Oynatıcı zamanlama fuzz'ı (seek/hız/loop-cue)

Tarih: 2026-09-30 · Tur: R278 · Tür: derinlemesine doğrulama (fuzz + invariant denetimi)

## Özet

Oynatıcının iki zamanlama yüzeyi deterministik PRNG (mulberry32, tohum sabit) ile
tarandı — **bug bulunamadı**, sözleşme farkları belgelenip kalıcı ratchet'e dönüştü.

## Kapsam

### `src/browser-overlay-controller.js` — `nextCueBoundaryAt`

İndeksli hızlı yol (önek-maks + son-ek-min, kare başına O(log n)) satır-satır
brute-force oracle ile 4000 senaryoda karşılaştırıldı: sıralı/bozuk/sırasız
listeler, NaN/end<start/negatif değerler, tam sınır ±1e-12 sorguları, kuyruk
uzatması (live çeviri append deseni).

**Bulunan sözleşme ayrımı (bug değil):** `end<start`'lı bozuk cue'nun `end` değeri
sıralı listede sınır sayılmaz (suffixMin `end>=start` şartı — bilinçli; o cue asla
aktifleşemez). Sırasız listede kod kendi bruteForce'una düşer ve orası tüm sonlu
sınırları sayar. Oracle iki modu da taklit ederek eşleşti.

**Bilinen sınır:** indeks geçersiz kılma 3 sabit prob noktasıyla (0, n>>1, n-1)
çalışır; listenin ortasında in-place mutasyon yakalanmaz. Üretimde cue listeleri
değiştirilmez (bütün liste değiştirilir → WeakMap yeni kimlik); tek in-place desen
kuyruk-sonu append'tir ve extendable yol onu doğru işler.

### `src/playback-policy.js` — `playbackLearningAction`

4000 senaryo: 5 politika × rastgele cue listeleri × seek/tick çiftleri.
Kilitlenen invariant'lar:
- `seek` aksiyonu asla geriye gitmez (`time >= now`)
- `set-rate` oranı her zaman [0.25, 4]
- `loop-cue` tekrar sayacı sonludur (`completedRepeats < repeatCount`, sonra
  `loop-cue-finished`)
- `pause-at-cue-end`/`pause-for-shadowing`/`loop-cue` yalnız doğal ilerlemede
  (Δ<1.5 sn) doğar; büyük seek bunları üretmez
- `pause-for-shadowing` süresi [1000, 8000] ms
- Tam girdi determinizmi (aynı girdi → aynı çıktı)

## Kanıt

`tests/playback-timing-fuzz.test.js` — 6 kontrol, tümü PASS.
İlk çalıştırmada yakalanan iki düşüş test-tarafı kusuruydu (oracle sözleşme
eksikliği + politika anahtarı/id karışıklığı), kodda bug yok.

## Windows etkisi

Yok — saf JS zamanlama mantığı; Electron/WebContents bağımsız.
