# Tur 3 raporu — doğrulama durumu

Bu belge tüm raporun kapatıldığı anlamına gelmez. Raporun “gerçek bug” etiketleri bağımsız kanıt sayılmamıştır.

## Düzeltilen ve davranış testi eklenen

- BUG-126: DASH `startNumber="0"` hem manifest okumasında hem offset hesabında 1'e dönüşüyordu. Sıfır korunuyor; eksik/geçersiz değer 1 oluyor. Manifest → URL eşleme → offset test edildi.
- BUG-128: Boş satır ayracı olmayan zaman bloklarında yalnız ilk cue okunuyordu. Her zaman satırı artık ayrı cue başlatıyor. Numaralı/numarasız örnekler ve mevcut parser testleri çalıştırıldı.

Test: `tests/browser-report-regressions.test.js`. Gerçek Electron/DRM oturumu çalıştırılmadı.

## İkinci düzeltme grubu

- BUG-127 düzeltildi: Güncel köprü anahtarı state'ten, yazı yönü bölgeden okunuyor. Aynı sayfada yatay ve dikey iki katman gerçek enjeksiyon betiğiyle test edildi.
- BUG-142 düzeltildi: Metin değişince genişleme ve sığdırma durumu sıfırlanıyor. Uzun metin → genişleme → kısa metin → özgün boyut akışı test edildi.
- BUG-155 düzeltildi: Sonlu olmayan sayısal medya komutları script üretilirken reddediliyor; Infinity'nin null üzerinden seek=0 olması engellendi.

Yeni test: `tests/manga-layout-state.test.js`. Bu minimal DOM davranış testidir, piksel/gerçek Electron doğrulaması değildir. Tam `npm test` paketi geçti; Python alt grubu 126/126.

## Henüz bağımsız doğrulanmayan

BUG-125 ve BUG-129–178 içinden yukarıda açıkça düzeltilenler dışındaki maddeler. Bunlar kapalı veya yanlış pozitif ilan edilmemiştir. Önceki turlardan tekrar edilen maddeler de yeni rapor bağlamında topluca kapanmış sayılmamıştır.

`BUG_REPORT.md` ve `b-search.txt` bu çalışma başlamadan önce izlenmeyen dosyalardı; değiştirilmedi.
