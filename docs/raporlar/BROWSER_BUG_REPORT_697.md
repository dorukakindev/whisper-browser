# Rapor 697 — Whisper/çeviri başlangıç ve çalışan iş özeti

Başlangıç master `f6861c46fe23ebb0c6a40b8d339b46dd539198f3`. Ürün `f275c548887c5bf4e85f25cd58638810cda1473f`. Dal `codex/job-summary697`.

## Gerçek sorun
Signal Desk, iş çalışırken dahi kaynak/model/çeviriyi güncel formdan okuyordu. Oysa kuyruk veya başlatılmış backend isteği önceki ayarlarla çalışır. Formda bitişi veya modeli değiştirmek, çalışan işin değişmiş olduğu izlenimini veriyordu. Başlatma özetinde zaman aralığı ve seslendirmeye uygun çeviri biçimi de yoktu.

## Değişiklik
- `job-summary.js` yalnız görüntülenecek alanları açık listeyle alıp dondurur. API anahtarları, prompt ve sohbet metni snapshot'a kopyalanmaz.
- Bütün transkripsiyon/çeviri başlatma yollarının kullandığı `startTranscribeSafe` aynı jobId ile gerçek opts özetini saklar. Başka aktif iş nedeniyle reddedilen istek özeti değiştirmez. IPC başarısızlığı kimliği bırakır; eski exit yeni özeti silemez. Eşleşen exit sonrası özet formun sonraki değerlerine döner.
- Kaynak/motor/çıktı/dil yanında **zaman aralığı**, **işlem biçimi** ve çeviri modeli görünür. Sayısal saniye girişleri dk:sn biçiminde; açık uçlu aralıklar açıkça gösterilir. Normal çeviri, seslendirmeye uygun çeviri, yalnız transkripsiyon, Whisper→English, yeniden dışa aktarma ve senkron ayrılır. Sohbet/açıklama transkripsiyon özeti olarak dondurulmaz.
- VRAM tahmini çalışan isteğin model/batch/compute/diarize değerleriyle hesaplanır; canlı form değişikliğiyle kaymaz. Bu hâlâ tahmindir, gerçek ölçüm değildir.
- Çalışan özet başlığı ve görünür sonraki-iş notu EN/TR. Kaynak adı ve özet verileri genel arayüz çeviricisinden ayrılır; dosya adı çevrilmez. Uzun çeviri/mode/aralık metinleri mevcut grafit/amber token'larıyla sarılır.

## Kanıt
- Yeni job-summary testi gerçek üretim start wrapper'ını VM'de çalıştırır: sabit snapshot, sıradaki istek sahipliği, başarısız IPC, gizli alan dışlama, açık/tam/sayısal aralıklar ve işlem modları PASS.
- signal-desk, i18n-coverage, ui-locale, ui-locale-dynamic, ui-locale-userdata PASS; eksik metin eşiği artırılmadı. Queue lifecycle 21 kontrol, queue ordering ve browser YouTube Whisper hedefli testleri PASS. Syntax ve diff kontrolü PASS.
- `electron-job-summary.smoke.js` gerçek Windows renderer/preload ile kontrollü IPC kullanır: 5:00→10:00 / small / ses için çeviri isteği gönderilir. Form daha sonra20:00/tiny/normal çeviri yapılır; çalışan özet10:00/small/ses için çeviri kalır. Bayat exit reddedilir. Gerçek eşleşen exit sonrası sonraki form gösterilir. TR koyu1400x950100%, EN açık900x800125% geçildi; ekranlar incelendi. Model/sağlayıcı çağrısı yapılmaz.
- İlk yerel native denemede yeni özet tam `buildOptsFromUI` yolunu bootstrap sırasında çağırdığı için player TDZ oluştu. Teslim öncesinde bağımlılığı kaldırılıp yalnız gerekli UI alanları okunarak düzeltildi; son native denemesi geçti. Mevcut kullanıcı hatası gibi sayılmadı.

## Açık kaynak ve kapsam
Buzz [transcriber.py](https://github.com/chidiwilliams/buzz/blob/main/buzz/transcriber/transcriber.py) güncel kaynağındaki `FileTranscriptionTask.__post_init__` / seçeneklerin deepcopy ile UI'dan ayrılması incelendi. [MIT lisansı](https://github.com/chidiwilliams/buzz/blob/main/LICENSE) doğrulandı. Projemizde zaten frozen queue sözleşmesi bulunduğundan yeni bağımlılık veya kod kopyası yerine aynı ilke özet görüntüsüne uygulandı. İlk eski `transcription_task.py` URL'si bulunamadı; gerçek kaynak yolu sonradan doğrulandı.

P004 artık dublaj ve Whisper/çeviri için uygulandı ve kontrollü native kanıtlı. Gerçek bütün video→LLM→dublaj tek koşu, insan dinleme tercihi ve diğer100 hedefler tamamlanmış sayılmaz. 11 before-quit uyarısı açık; tam CI beklenmedi. start.bat/install.bat/venv/CUDA/IPC şeması değişmedi; temiz start.bat açılışı bu tur koşulmadı. Kişisel medya/anahtar/profil kullanılmadı. Yeni script CSP self ile yüklenir, script sırası testi kapsar. Yeni bağımlılık yok.
