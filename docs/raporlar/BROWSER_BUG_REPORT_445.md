# BROWSER_BUG_REPORT_445 — Dış delivery-2026-10-17 paketinin bağımsız incelemesi

Tarih: 2026-10-17. İncelenen ürün başlangıcı: d38fa5bb828ac44c2bfa5870828c1c7dd46624bc.
Ürün kodu değiştirilmedi. Dış paketin kendi WB445 numaraları ile bu repo inceleme raporunu karıştırmayın: dış rapor/yama buraya uygulanmadı.

## Sonuç

Üç bulgu gerçek, düzeltme yönü yararlı; paket bütün halinde kabul edilmemeli. Yeni temizleme mantığında önceden üretilmiş sağlam WAV ve sync dosyasını silen yüksek öncelikli regresyon doğrulandı. TASK-MATRIX.csv yapısal olarak bozuk ve istenen ayrıntılı kapsamı karşılamıyor. Bu, bütün denetimin sahte olduğu anlamına gelmez; hedefli düzeltmelerin yararı ile teslimin eksikleri ayrı değerlendirilmelidir.

## Bağımsız kanıt

Başlangıç remote/dal/HEAD ve temiz tracked çalışma ağacı doğrulandı. Kullanıcının önceki untracked dosyaları korundu. Dış ZIP arşivi kod çalıştırılmadan listelendi; ayrı verilen fixes.patch, AUDIT-REPORT.md, FINDINGS.json ve TASK-MATRIX.csv ZIP içindekilerle byte olarak aynı. Tam patch için git apply --check başarılı; uygulanabilirlik mantıksal doğruluk değildir.

Kendi HEAD arşivinden tmp/review445/patched altında izole kaynak/test/backend/tools kopyası kuruldu; yalnız src/tests patch bölümleri bu kopyaya uygulandı. Testler incelendikten sonra terminalden çalıştırıldı; kullanıcı ses/profil verisi kullanılmadı. browser-dub-audio, dub-service ve voice-reference testlerinin üçü de Windows Node ortamında geçti. İlk dub-service denemesinde test kopyasına tools alınmadığı için config.ready assertion'ı düştü; kendi arşivimizdeki tools eklenince aynı test değişiklik yapılmadan geçti. Bu ürün hatası değildir.

## P1 — Reddedilen aynı kimlikli iş önceki başarılı sesi siliyor

Dış yama src/dub-service.js patched satır294'te s.outputPath = output atamasını, satır295'teki existsSync/“Bu işin ses çıktısı zaten var” denetiminden ÖNCE yapıyor. Denetim hata fırlatınca catch -> finish(error) -> cleanupFailedArtifacts, bu işe ait yeni üretim sanarak önceki başarılı işin WAV'ını siliyor. Aynı türetilmiş .sync.json ve .partial.wav da koşulsuz kaldırılıyor. Önceki oturumun kaydı/latest erişimi bozulabilir.

Yeniden üretim: mevcut dub-service.test.js içindeki başarılı ranged işinin close(0) aşamasından sonra, aynı id:'ranged', aynı srt ve20–30sn aralıkla dub:start yeniden çağrıldı. Sonuç ok:false; önceki output yolunun varlığı ve byte eşitliği kontrol edildi. Sentetik ses dosyası dışında veri kullanılmadı.

- Orijinal d38fa5bb src/dub-service.js ile: existing output survived rejected duplicate: true; duplicate protection PASS, exit0.
- Yamalı src/dub-service.js ile: existing output survived rejected duplicate: false; AssertionError: REGRESSION: rejected duplicate job deleted completed audio, exit1.

Doğru düzeltme yalnız işi gerçekten oluşturan dosyalara sahiplik tanımlamalı; var olan başarılı çıktılar reddedilen isteğin cleanup listesine girmemeli. Sadece existsSync sonrasına taşıma en temel çakışmayı engeller; sağlam çözüm yeni oluşturulan artefaktların açık sahiplik kaydı, mümkünse atomik oluşturma ve hata/iptal sonunda gerçek süreç kapanışından sonra temizliktir. Aynı ID tekrarında WAV+sync+önceki başarı kaydı korunması ayrı regresyonla doğrulanmalı. Hata halinde üretilmiş dosyanın kurtarılabilir olup olmadığı da genel koşulsuz silmeden ayrı tasarlanmalı.

## Üç dış bulgunun değerlendirmesi

- WB445-01 stale play: gerçek. Eski callback'in yeni ortak audio öğesinde pause yapmasını session eşitliğiyle engelleme doğru yönde. Eklenen test gerçek sınıfı çalıştırır ve yamalı kopyada geçti. Ancak background karşılığına aynı yarış testi eklenmemiş. Oturumlar arası paylaşılan playPending/backgroundPlayPending bayraklarının geç finally ile değişmesi ayrıca denetlenmeli; bu incelemede yeni bağımsız hata olarak kanıtlanmadı.
- WB445-02 iptal çıktısı: gerçek. Yeni fixture iptal sırasında oluşturulan background WAV'ın silinmesini kanıtlar; WAV, partial, sync ve bütün hata yollarının tamamını tek assertion kanıtlamaz. P1 regresyonu nedeniyle temizlik yaması şu haliyle uygun değil. Windows dosya kilidi/silme başarısızlığı sessizce yutuluyor; gerçek donanım temizliği doğrulanmış sayılamaz.
- WB445-03 referans artığı: gerçek. Yeni başarısız hazırlama fixture'ında WAV temizliği geçti. catch temizleme yönü makul; bütün partial adlarının ve transcript/metadata temizliğinin ayrı ayrı kanıtlandığı iddia edilmemeli. Geçici/boş klasör ve tanı kayıtlarının korunması ayrıca beklenen davranış olarak belgelenebilir.

## P2 — Test matrisi bozuk ve kapsamı eksik

csv.reader ile başlık11 sütun, veri29 satır. Yalnız6 satır11 sütunlu;23 satır10 sütunlu. Örneğin A04'te test_dosyası eksik; sonraki değerler sola kayıyor, durum alanında WB445-01 okunuyor. Bu CSV otomatik kanıt/durum takibinde güvenilir değil. csv.writer/DictWriter ile yeniden üretilip her satırın başlıkla aynı sütun sayısında olduğu doğrulanmalı.

Verilen görev çok daha geniş ve tekil senaryolar istiyordu;29 satırlık grup matrisi panel kapanışı/yeni işe eski event/sonuç yazımında iptal/sınır cue'ları ve çeşitli hata yollarını ayrı izlemiyor. Bunlar test edilmedi diye kesin hüküm verilmez; teslim bunların nerede/nasıl doğrulandığını kanıtlamıyor. Test özeti büyük ölçüde mevcut testleri tekrar çalıştırma; gerçek eklemeler üç dosyadaki dar regresyonlardan oluşuyor. “Derin kapsam tamamlandı” ifadesi fazla geniş.

## Raporlama ve sınırlar

Tam npm test'in bitmediği ve gerçek Windows/CUDA/YouTube/donanım doğrulamasının yapılmadığı dürüstçe yazılmış. Fakat1dk çıktı olmamasını kök neden incelemeden ortam engeli saymak yeterli değil; asılı alt süreç/timer/fixture araştırılmalı. soundfile eksikliği görev yetkisi kapsamında güvenilir bağımlılık kurulumu veya bağımlılıksız saf test ayrımıyla giderilebilir; bu nedenle kaçınılmaz engel sayılmamalı. Electron indirmesi “remote yasak” diye bırakılmış; verilen görev bulut tarayıcısı/localhost önizlemesini yasaklıyordu, genel bağımlılık indirmesini değil. Bunlar yetersiz gerekçeler, ürün hatası kanıtı değildir.

Git apply --check burada başarılı; dış temiz checkout testi iddiasının bütün günlüğü pakette yok. Kendi hedefli kopya testlerimiz geçti, ancak P1 karşı örneğimiz kırmızı. Bu tur tam paket, gerçek Electron/YouTube/CUDA/model/loopback/start.bat veya görüntü testi çalıştırılmadı; değerlendirme kod ve terminal testleriyle sınırlı. Ürün koduna dış patch uygulanmadı. Yalnız bu inceleme raporu ve tarihli devir/indeks teslim edilir.
