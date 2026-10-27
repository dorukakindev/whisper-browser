# Rapor646 — DeepSeek yeni gece çıktısının güncel kodda doğrulanması

Başlangıç `7aaaf2083cb5f4d8d239bdbd088ba97ea542256e`; ürün `fe2be80d01ec53cca08db591ac2e26194cddf39c`; dal codex/product-1000-646. Dış denetimin 843 PASS/151 NOT_APPLICABLE/5 SUSPECTED/1 INCONCLUSIVE sayıları bizim ürün kabulümüz değildir. Denetim farklı HEAD'lerde koşmuştur. Ham kişisel paket/loglar Git'e alınmadı.

## Önceki altı görev

14 kayıt/12 kökün kararları Rapor632'de zaten var: asistan makbuzu631, endpoint/son-owner, PDF I/i, Letterboxd ZIP önceliği ve kopya review, WAV süre doğrulaması, üç test harness ve eski native seçiciler giderilmişti. Yeni bug diye tekrar sayılmadı. Scheduler watchdog ve ANSI şüpheleri açık kanıt sınırlarıyla632'de kayıtlıdır.

## Yeni gece raporu: dört doğrulanmış düzeltme

- **F39-01:** DictReader kısa son satırdaki eksik Year alanını None verir. `.isdigit()` AttributeError gerçek; yıl isteğe bağlı boş normalize edilir, geçerli diğer satırlar korunur.
- **B05-01:** recover_completed bütün parçaları okunabilir bulsa bile incomplete_audio uyarısı basıyordu. Artık yalnız failed grup varsa basılır. Zorunlu yenileme başarısızken eski sesin review/regenerationFailed kanıtı korunur; uyarıyı kaldırmak kaliteyi ready yapmaz.
- **F38-01:** Dotted capital İ küçültüldüğünde i+combining dot ürettiği için aday/mükerrer bulunmuyordu. Yalnız ad karşılaştırması NFC + dotted-i katlar; gerçek dosya yolu kimliği ve dotless ı/i farkı korunur. Tüm metni Türkçe locale ile küçültmek İngilizce FILM/film davranışını bozacağından öneri aynen uygulanmadı. NFD/NFC ve boyut farklıysa ambiguous korunur.
- **F33-01:** Silinen bölüm WAV'ında lstat ENOENT ham yol gösteriyordu. ENOENT/ENOTDIR anlaşılır EN/TR yeniden üretme mesajına çevrilir; diğer dosya ve symlink güvenlik kapıları korunur. Preview/export encode etmez ve mevcut M4B'ye dokunmaz. Bu kişisel uygulamada yerel yol görünmesinin uzaktan veri sızması kanıtı değildir; hata UX'i düzeltildi.

**F09-01:** keşfet/arama ham İngilizce hata iddiası kaynakta mevcut; kapsamlı kodlu hata sözleşmesi bu pakette uygulanmadı, sonraki iş. **F09-02:** bozuk kasanın üzerine yazmama veri koruma davranışıdır. Otomatik sıfırlama/karantina önerisi uygulanmadı; .bak recovery mevcut, tüm aynalar bozuksa eylemli bildirim ayrıca değerlendirilecek. Bunlar düzeltildi diye sayılmaz.

## Kanıt

İlk yeni testler eski kodda CSV AttributeError, yanlış kurtarma uyarısı, Unicode aday ve ham ENOENT ile kırmızıydı. Book fixture ilk denemesi output zaten absolute olduğu halde join yaptığı için test kurulumu hatası verdi; basename düzeltildikten sonra gerçek ürün hatası görüldü. Düzeltmeden sonraki ilk book assertion iki dili birden bekliyordu; gerçek locale sözleşmesine göre EN ve TR ayrı çağrılıp sınandı; eşik gevşetilmedi.

- tests/test_audit646.py:3/3 (gerçek geçici WAV, model yok).
- backend/test_media_shelf.py:7/7.
- tests/test_dub_generation_quality.py:20/20; controlled motor, gerçek GPU değildir.
- media-relink-unicode646.test.js ve media-relink-matcher.test.js: yeni1 + mevcut9 davranış geçti (Node runner2 test entry).
- book-export.test.js hedefli missing-chapter ve preview2/2: EN/TR,0encode,eskiM4B korunur.
- Değişen JS node --check, Python py_compile ve git diff --check geçti.

UI düzeni değişmedi; hata dönüşleri servis testinde iki dilde doğrulandı, native görüntü bu pakette alınmadı. Tam npm/CI/gerçek model/site/GPU/start.bat çalıştırılmadı. CI açık ve beklenmez. Windows venv ile Türkçe/NFD/NFC yollar kontrol edildi; install/start değişmedi. Bağımlılık veya kalıcı şema yok.

1000 ürün hedefi devam eder; bu paket dört gerçek köktür,1000 yeni bug değildir. ASR geç başlatma/durdurma hipotezleri henüz doğrulanmamış, sonraki inceleme.
