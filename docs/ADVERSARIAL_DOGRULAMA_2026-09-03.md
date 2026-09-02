# Adversarial rapor — kaynak doğrulaması ve düzeltme sonucu

Tarih: 3 Eylül 2026.

İncelenen belge: `docs/ADVERSARIAL_REPORT_2026.md`. Belge `838d333` sürümüne dayanıyor; bu çalışmanın başlangıcı `d355d94` idi. İddialar mevcut kaynak ve çalıştırılabilir hata senaryolarıyla yeniden değerlendirildi. Orijinal rapor ve `GELISTIRME_ONERILERI_2026.md` değiştirilmedi.

## Bulguların sonucu

| Kimlik | Doğrulama | Uygulanan işlem / gerekçe |
|---|---|---|
| A-01 | Gerçek: `media:readSubtitle` gönderici ve dosya yetkisi eksikti. | Ana pencere + ana frame doğrulaması; gerçek yol, uzantı, dosya türü ve boyut kontrolü; seçilmiş/üretilmiş dosyaya özel izin. Bilinmeyen altyazı için yerel onay penceresi. |
| A-02 | Kısmen gerçek. Dosya yazma ve kabuk çağrılarında gönderici/yol koruması eksikti; `subs:shift` zaten SRT/VTT ile sınırlıydı. | Ortak yetki kontrolü; yazma ve kaydırmada aynı dosya izni; `shell:openPath` yalnız desteklenen belge/medya/klasörleri açar. EXE, betik ve kısayol açma reddedilir. Zaten yerel kaydetme diyaloğu kullanan dışa aktarımlara keyfî sessiz yazma denmedi. |
| A-03 | Gerçek: 512 KiB'ı aşan seçenekler sessizce `{}` oluyordu. | Boyut aşımı geçersiz sonuç üretir; gelen kuyruk kaydı yazılmadan reddedilir, mevcut disk kaydı korunur. UI hatayı bildirir; kaydı başarısız kuyruk başlatılmaz. Varsayılan ayarlarla sessiz devam kaldırıldı. |
| A-04 | Gerçek. Transkripsiyon, canlı Whisper ve benchmark arasında eksik karşılıklı dışlama vardı. | Üç girişte kontrol; gerçekten kapanmamış model süreçleri ayrı kümede tutulur. Benchmark dosya diyaloğundan sonra ikinci kontrol yapılır. Durdurulmakta olan canlı Whisper da yeni modeli engeller. |
| A-05 | Önerilen düzeltme yanlış: iptal isteğinde `activeJob = null` yapmak çalışan süreci sahipsiz bırakabilir. | Kilit gerçek `close` olayına kadar korunur. Bununla bağlantılı gerçek hata düzeltildi: `error` işleyicisi de artık kilidi erkenden açmaz. |
| A-06 | Gerçek: taskkill'in asenkron hata olayı ele alınmıyordu. | Ortak süreç ağacı durdurucu; asenkron hata, başarısız çıkış ve eksik PID için yedek sonlandırma; aynı yedek işlem iki kez çalışmaz. İptal isteği süreç kapanmış sayılmaz. İndirme, transkripsiyon, benchmark, burn-in ve kapanış yolları bu yardımcıyı kullanır. |
| C-06 | Rapordaki olağan kuyruk senaryosu eksik: sonraki iş zaten `close` sonrasında başlar. Fakat olaylarda iş kimliği yoktu ve `error → close` aralığı gerçek bir risk oluşturuyordu. | Yapılandırılmış backend olaylarına ve `exit/error` olaylarına ana sürecin yakaladığı kuyruk kimliği eklenir. Backend bu kimliği değiştiremez; renderer başka kuyruk işine ait olayı durum değişikliğinden önce reddeder. |
| D-04 | Yerel günlükte ayrıntı gösterilmesi doğrulandı; bu tek başına uzaktaki siteye veri sızması değildir. | Yapılandırılmış `traceback` alanı renderer'a gönderilmez/gösterilmez; tanı için yerel iş günlüğünde korunur. Bu, tüm hata metinlerindeki dosya yollarını anonimleştirme iddiası değildir. |
| D-06 | Gerçek: WAV'in tamamı ham veri ve dönüştürülmüş kopyalarla belleğe alınıyordu. | PCM parça parça, önceden ayrılmış tek nihai float32 dizisine çözümlenir. 8/16/24/32 bit ve çok kanal desteklenir. Boyut kontrolü model yüklemeden önce yapılır; başarısız model çağrısı da temizlik bloğundan geçer. Bellek sınırının etkisi aşağıdadır. |
| D-03 | Gerçek: belirtilen FFmpeg hazırlık çağrıları süresiz bekleyebiliyordu. | Ses çıkarma 3600 sn, parça kesme 600 sn, ses düzeyi ölçme 120 sn, benchmark örnek hazırlama 180 sn ile sınırlı. Süre aşımı Türkçe hata verir. Bunlar videonun uzunluğu değil, işlemin duvar saati sınırlarıdır. |
| D-01 | Gerçek: Python çeviri önbelleği doğrudan hedefe yazılıyordu. | Mevcut atomik yazıcıya taşındı: geçici dosya, flush/fsync, replace. Başarısız replace eski dosyayı korur. |
| D-02 | Doğru dayanıklılık eksikliği: checkpoint'te fsync yoktu. | Replace öncesi flush/fsync eklendi. Hatalı yazım eski checkpoint'i korur, geçici dosyayı temizler. |
| Y-01 | Hata değil; başarılı teslimat kimliği savunması. | Mevcut yakalama kuyruğu testleri tekrar geçti. |
| Y-02 | Hata değil; başarılı önbellek eşzamanlılık savunması. | Mevcut önbellek testleri tekrar geçti. |
| Y-03 | Hata değil; eski renderer kaydına karşı terminal durum savunması. | Mevcut kuyruk birleştirme testleri tekrar geçti. |

Rapordaki “15 kesin bulgu” ifadesi “15 ayrı hata” anlamına gelmiyor: üçü olumlu savunma kanıtı, A-05'in önerisi ise yarışı kötüleştiriyor. Ayrıca bazı kaynak alıntıları gerçek kodla birebir eşleşmiyor. Örneğin üç argümanlı `ipcMain.handle(channel, authorizedBrowserSender, handler)` kalıbı projedeki gerçek kayıt değil; uygulanmadı.

## Olasılık olarak listelenen maddeler

| Kimlik | Sonuç |
|---|---|
| M-1 | “Şifreli kasada .bak yok” yanlış; yedek zaten üretiliyordu. Gerçek eksik, bozuk/eksik ana dosyada yedeğin okunmamasıydı. Kurtarma eklendi; bozuk ana dosya sağlam yedeği ezmez. Geçerli boş kayıt önceliklidir, bilerek silinmiş anahtar geri getirilmez. |
| M-2 | `writeJsonAtomic` ve şifreli kasa geçici dosya yazımına `flush: true` eklendi. Fiziksel güç kaybına karşı koşulsuz garanti verilmez. |
| M-3 | JSON/SRT çifti tek bir işlem değil; ancak var olan `getTrack` yeniden üretme/onarma yolu ve testleri var. Rapordaki veri kaybı sonucu kanıtlanmadı; bu mekanizma değiştirilmedi. |
| M-4 | `mangaApiKey` zaten son ek filtresiyle siliniyor. Yeni regresyon testiyle doğrulandı; gereksiz anahtar/sağlayıcı değişikliği yapılmadı. |
| M-5 | D-01'in tekrarı; atomik önbellek yazımıyla ele alındı. |
| M-6 | Eksik PID için yedek yol zaten vardı; yeni süreç yardımcısında bunun ve geç hata olayının davranış testleri eklendi. |
| M-7 | Oturum sonlandırma koruması mevcut. Tekrar kapanış/boş oturumla ezme korumasına ilişkin mevcut testler geçti; yeni bir hata kanıtlanmadı. |
| M-8 | D-03'ün tekrarı. Sonsuz FFmpeg hazırlık bekleyişi sınırlandı; gerçek donanımda zorla takılma yaratılmadı. |

## Bilinmesi gereken davranış değişiklikleri

- Yerel altyazı dosyası erişimi 32 MiB ile sınırlı. Geçerli türler SRT, VTT, ASS, SSA ve JSON. Dosya seçiciden seçilen veya bu oturumda uygulamanın ürettiği altyazılar doğrudan kullanılabilir. Eski geçmişten veya elle verilen bilinmeyen dosya için bir kez izin istenir; izin uygulama oturumu boyunca tam dosya yoluna aittir. Dış klasörler yasaklanmadı.
- Windows aygıt yolları ve alternatif veri akışları (ADS) reddedilir; gerçek yol çözümlenir. Bu, ana renderer'ın tamamen ele geçirilmesine karşı bütün uygulama yeteneklerini ortadan kaldıran bir sandbox değildir.
- Pyannote giriş waveform'u 512 MiB ile sınırlı. Bu, 16 kHz mono float32 için yaklaşık 2 saat 20 dakikadır. Daha uzun girdide konuşmacı etiketleme uyarıyla atlanır; normal altyazı üretimi devam eder. Kullanıcı zaman aralığı seçerek konuşmacı tanımayı çalıştırabilir. Sınır tüm Python/model RAM kullanımının üst sınırı değildir.
- Taskkill başarısızsa yedek doğrudan çocuk sürece sinyal gönderir. Bu hata yolunda bütün torun süreçlerin sonlandığı garanti edilmez; çalışan süreç varmış gibi kilit tutulur ve başarısız iptal “boşta” sayılmaz.
- Model, API anahtarı, çeviri sağlayıcısı, kullanıcı dosyası, tarayıcı oturumu ve DRM yapılandırması değiştirilmedi.

## Doğrulama

`npm test` ile aynı `tests/run-all.js` çalıştırıcısının tamamı başarılı: **37 JavaScript test dosyası + 108 Python testi**. JavaScript dosyalarının içindeki vaka sayıları tek bir toplam sayıya yuvarlanmadı.

Bu çalışmada eklenen davranış testleri:

- `tests/adversarial-ipc.test.js`: 8 test. Gerçek main handler gövdeleri izole ortamda çalıştırıldı; 98 kanal × 3 yetkisiz gönderici denemesi yan etkisiz reddedildi. İzinli altyazı okuma/yazma/kaydırma, cp1254 Türkçe metin ve ilk yedek koruması; izinsiz yazma, EXE/betik açma reddi; eski kuyruk olayının yalıtılması; büyük kuyruk kaydının reddi; spawn hata/kapanış ve benchmark diyaloğu yarışı.
- `tests/process-lifecycle.test.js`: 4 test; asenkron taskkill hatası, hatalı çıkış, eksik PID, senkron hata, kapanmış çocuğa geç gelen hata ve tek yedek sinyal.
- `tests/security-media-learning.test.js`: 2 yeni test; kasanın .bak kurtarması, geçerli boş kaydın önceliği, başarısız rename sonrası eski kayıt ve temp temizliği.
- `tests/queue-persistence.test.js`: 2 yeni test; çok baytlı büyük seçeneklerin reddi ve manga anahtarının temizlenmesi.
- `backend/test_transcribe.py`: 6 yeni test; cache/checkpoint replace ve fsync hata enjeksiyonu; dört PCM derinliği, iki kanal ve sınırlı okuma; bellek sınırının tahsisten önce uygulanması; eksik PCM; sahte pyannote hata temizliği; dört FFmpeg çağrısının süre sınırı.
- `tests/validation.test.js` sabit 900 karakterlik kesit yerine gerçek handler sınırını kullanacak şekilde; `tests/browser-tabs.test.js` ortak ana pencere/frame doğrulayıcısını bekleyecek şekilde güncellendi. Güvenlik kontrolü kaldırılmadı.

JavaScript sözdizimi, Python derleme ve `git diff --check` kontrolleri de yapıldı.

## Elle doğrulanmamış alanlar

Electron başlatılmadı; gerçek native onay penceresi, açık Discovery+/DRM oturumu, canlı GPU eşzamanlılığı, Windows süreç ağacının zorla sonlandırılması ve fiziksel güç kesintisi bu turun kanıtı değildir. API çağrısı veya model indirmesi yapılmadı. Testler bu sınırlamaların yerine geçti diye sunulmadı.
