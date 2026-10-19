# BROWSER_BUG_REPORT_478 — Çeviri, senkron, AI kapsamı ve kütüphane

Tarih: 2026-10-19. Dal: `codex/browser-audit477`; mevcut PR454'e devam.
Başlangıç HEAD: `b6fff3edbfee77355fb1c1f9cdd60017145a6a92`.
Güncel master tabanı: `68775abbfdacff72ee48095e9ee8cb74009bff49` (fetch ile doğrulandı).
Bitiş ürün kodu: `cb7a4c05255860c4f68bd8ed08d28a7925726644`.

Önceki 477 turundan farklı 10 davranış hatası kontrollü girdilerle yeniden
üretildi. Ürün kodu değişmeden yeni test dosyası 0/10, düzeltmeden sonra 10/10.
Gerçek kullanıcı profilinin bu durumları yaşadığı varsayılmadı.

| No | Önem | Kanıt, kök neden ve düzeltme |
|---|---|---|
| 478-01 | Orta | Aynı zaman aralığındaki A/B repliklerinde B değişince fark ekranı eski A metnini gösteriyor ve B'yi eksik sayıyordu. Zaman örtüşmesi tek başına kimlik değildi. Her iki diff yolunda benzersiz ve örtüşen cueId/id eşleşmesi önce deneniyor; kimlik yoksa önceki zaman eşlemesi korunuyor. |
| 478-02 | Orta | Choose {A} → Choose {B} değişikliği görünmüyordu: her süslü parantez grubu stil sanılıyordu. Yalnız ters eğik çizgiyle başlayan ASS override grupları temizleniyor; gerçek metin korunuyor. |
| 478-03 | Orta | en → tr → bilinmeyen → tr akışı ardışık iki dil gözlemi olmadığı hâlde stream değiştirebiliyordu. Bilinmeyen parça pending dil kanıtını artık sıfırlıyor; mevcut dil/stream kimliği korunuyor. |
| 478-04 | Orta | Referansta 2.0 ve 2.1 saniyedeki iki Yes satırı, adayın tek Yes satırıyla eşleşip iki bağımsız kanıt sanılıyor ve -7.95 s kalibrasyon kabul ediliyordu. Metin artık hem adayda hem referansta tekil olmak zorunda. Belirsiz kısa tekrarlar zaman çizelgesini otomatik kaydırmıyor. |
| 478-05 | Orta | Aynı video/zaman/metin ama farklı trackId'li iki alıntı aynı otomatik ID'yi alıyor; matchingLearningAnnotation ilk notu geri döndürebiliyordu. Yeni kimlik iz/cue bilgisini içeriyor ve açıkça çelişen iz/cue eşleşmeleri eleniyor. Kimliksiz eski notların hash biçimi korunuyor; açık mevcut ID yeniden yazılmıyor. |
| 478-06 | Düşük | Bir saniyelik font/i etiketli Hi satırı 2 yerine etiketlerin uzunluğuyla CPS ve satır genişliği ölçülerek hatalı hızlı/uzun uyarısı alıyordu. CPS şeridi ve sorun taraması aynı görünür metin temizliğini kullanıyor; HTML alt kümesi ve ASS override kaldırılıyor. |
| 478-07 | Orta | Varsayılan İngilizce UI'da Summarize the entire video sorusu genel kapsam niyeti sayılmıyordu; TR sözlüğü nedeniyle lexical kapsam seçiliyordu. İngilizce genel özet ve tüm-video/transkript ifadeleri eklendi, Türkçe davranış korundu. |
| 478-08 | Orta | 100 satır, limit 6, genel özet sorusunda kanıtlar yalnız 0–50 s'den seçiliyordu; 990 s'deki son satır dışarıda kalıyordu. Dağıtılmış örnekler sonradan skor kesimiyle siliniyordu. Kanıt bütçesinin en fazla yarısı başlangıç/son dahil eşit dağıtılmış örneklere ayrılıyor; kalan yerler yüksek skorlu isabetlerle doluyor. watched/nearby kapsam sınırları aşılmıyor. |
| 478-09 | Orta | notyoutube.com/watch?v=geçerliID gerçek YouTube medyasıyla aynı kütüphane anahtarını alıyordu; uzun bozuk youtu.be ID'si de 11 karaktere kesilerek meşru videoya dönüşüyordu. Gerçek domain/subdomain sınırı, HTTP(S) ve tam ID biçimi doğrulanıyor. Bu düzeltme gezinme yetkisi/DRM/adblock iddiası değildir. |
| 478-10 | Orta | Browser kütüphane anahtarı URL kullanıcı/parolasını ve api_key/refresh_token gibi parametreleri saklayabiliyordu. Bunlar canonical URL'den çıkarılıyor; normalizasyonun raw.key'i legacyKeys'e geri ekleyerek sırrı koruması da engelleniyor. Ana kayıt ve tombstone eski anahtarları temizleniyor. Kişisel profil veya mevcut yedek dosyalar bu turda okunup temizlenmedi. |

## Kısa kontroller

- `node tests/report478-regressions.test.js`: önce 10 FAIL, sonra 10 PASS.
- `node tests/translation-review-tools.test.js`: 8 geçti.
- `node tests/live-asr-audio-switch.test.js`: 15 geçti.
- `node tests/browser-cue-timeline-calibration.test.js`: 3 geçti.
- `node tests/security-media-learning.test.js`: 18 geçti.
- `node tests/timeline-issue-scan.test.js`: 9 geçti.
- `node tests/browser-ai-context.test.js`: geçti.
- `node tests/browser-nine-features.test.js`: geçti.
- `node tests/browser-report86-regressions.test.js`: 44 geçti. İlk sandbox
  koşusunda Python probe başlatılamadığı için 5 paket testi kırmızıydı;
  normal Windows alt süreç yetkisiyle aynı komut 44/44 geçti.
- `node tests/watch-library-migration.test.js`: son değişikliklerden sonra
  161 geçti; idempotans, kişisel olmayan sentetik migration/fault örnekleri.
- Değişen 7 ürün JS dosyası + test için `node --check`; `git diff --check` geçti.

Tam test paketi/uzun CI bekleme, start.bat, gerçek Electron görünümü,
YouTube/model/provider, GPU/CUDA ve ses donanımı denenmedi. Yeni bağımlılık,
şema veya kurulum değişikliği yok. Görünüm/CSS değişmedi; hesaplanan CPS/fark/
bağlam mantığı test edildi. Kullanıcının profili ve açık uygulaması korunuyor.
