# R825 kanıt paketi

[Ana rapor](../BROWSER_BUG_REPORT_825.md). Bu paket ürün düzeltmesi veya yeni kalıcı test paketi değildir. Kaynak başı `fe0e3fe0d040ccd4b6b18d6a32c96cfc686d65d8`; mevcut test sürücülerinin yalnız denetim için türetilen kopyaları `probes/` altında saklandı. Ham test profilleri, geçici sesler ve kişisel veriler yayımlanmadı.

## Tekrar üretme

Doğru repoda `npm ci` ile mevcut kilitli bağımlılıklar hazırlanmış olmalı. Axe zaten dev bağımlılığıdır; bu tur yeni kurulum yapılmadı. Betikleri çalıştırmadan oku. Bunlar ayrı fixture profilleri açar; gerçek sağlayıcı bağlantıları kapalıdır. Normal uygulamanın `start.bat` açılışı yerine geçmez.

1. `probes/` içindeki `.cjs` dosyalarını repodaki `tmp/audit825/` içine kopyala.
2. Repo kökünden `node tmp/audit825/make-probes.cjs`, sonra `node tmp/audit825/extend-probes.cjs` ve `node tmp/audit825/make-reader.cjs` çalıştır. Sürücüler repo kökünü `process.cwd()` üzerinden bulur; kaynak `tests/` dosyalarını değiştirmez.
3. Mevcut Electron çalıştırıcısıyla `settings.cjs`, `assistant-keyboard.cjs`, `film.cjs`, `dub.cjs`, `reader.cjs`, `keyboard-proof.cjs`, `modal-geometry.cjs` çalıştır. Örneğin PowerShell: `& (node -p "require('electron')") tmp/audit825/settings.cjs`. Windows sandbox Mojo/cache hatasında ağ/güvenlik ayarlarını kapatma; yetkili normal native test ortamı kullan.
4. Sadece komutun erken dönüşüne güvenme: ilgili `.uiprev/` veya film `tmp/design824-fixes-film/` dizinindeki sonuç/ölçüm dosyalarını ve olası `error.txt` dosyasını kontrol et. Kaydedilen görüntüyü açıp doğru durumu gösterdiğini doğrula.

`publish.py` bu koşunun dizin adlarını içerir; yeni koşunun raporunu yazmak için yollarını güncelle. Eski raporun üstüne yeni kanıt yazma. Önceki geçiş anı PDF örneği bu paketin kararlı sonuçlarına karıştırılmadı. İlk sandbox denemesi başarısızdı; güncel `SNAPSHOT.json` yalnız son kabul edilen koşuların dizinlerini gösterir.

## Kontrol ölçütleri

Redesign ve Designly ölçütleriyle hiyerarşi/boş alan/yoğunluk/kimlik; Product Design'ın audit kontrol listesiyle görev sırası ve kanıt sınırları; mevcut Premium tasarım sahipliği ve azaltılmış hareket sözleşmesi korundu. Başka servise gönderilmiş proje veya oluşturulmuş canvas yok. `MANIFEST.json` metinleri LF normalize ederek, PNG'leri birebir SHA256 ile bağlar.
