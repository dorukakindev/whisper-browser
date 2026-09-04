# Tur 3 raporu — doğrulama durumu

Bu belge tüm raporun kapatıldığı anlamına gelmez. Raporun “gerçek bug” etiketleri bağımsız kanıt sayılmamıştır.

## Düzeltilen ve davranış testi eklenen

- BUG-126: DASH `startNumber="0"` hem manifest okumasında hem offset hesabında 1'e dönüşüyordu. Sıfır korunuyor; eksik/geçersiz değer 1 oluyor. Manifest → URL eşleme → offset test edildi.
- BUG-128: Boş satır ayracı olmayan zaman bloklarında yalnız ilk cue okunuyordu. Her zaman satırı artık ayrı cue başlatıyor. Numaralı/numarasız örnekler ve mevcut parser testleri çalıştırıldı.

Test: `tests/browser-report-regressions.test.js`. Gerçek Electron/DRM oturumu çalıştırılmadı.

## Kaynakta gözlenen, henüz düzeltilmeyen

- BUG-127: İlk `mangaOverlayScript` çağrısında yaratılan `state.layout` ve `state.emitEdit` kapanımları ilk payload'a başvuruyor. Sonraki sayfa/ayar çağrıları için davranış testi ve bölgeye özel ayar çözümü gerekiyor; tek bir global payload atamak eski sayfaların farklı stillerini bozabilir.

## Henüz bağımsız doğrulanmayan

BUG-125 ve BUG-129–178 (BUG-127 yukarıda). Bu maddeler kapalı veya yanlış pozitif ilan edilmemiştir. Önceki turlardan tekrar edilen maddeler de yeni rapor bağlamında topluca kapanmış sayılmamıştır.

`BUG_REPORT.md` ve `b-search.txt` bu çalışma başlamadan önce izlenmeyen dosyalardı; değiştirilmedi.
