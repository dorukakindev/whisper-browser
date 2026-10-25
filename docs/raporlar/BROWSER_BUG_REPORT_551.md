# BROWSER_BUG_REPORT_551 — M4B önizleme, boş alan ve doğrulanmış iptal

Tarih: 2026-10-25 06:15 Europe/Istanbul. Repo https://github.com/dorukakindev/whisper-browser; dal `codex/book-reliability549`, mevcut PR487. Başlangıç `3e384fefd81ec26be5af97e02642ebda4bbf4820`; bitiş ürün kodu **`55d92c9d36a6be5499d4624a35f85c26b9da2387`**. Ana dala merge veya kişisel uygulamaya müdahale yok. Gece listesi N11–N14 tamamlandı; önceki7 ile toplam11 maddenin ilk kabul kapsamı tamam. 50 bug bulunduğu veya50 maddenin bittiği iddiası değildir.

## Değişiklik ve kök neden

- **N11 — Çıktı bilgisi:** Kitap üretim ekranında `M4B çıktı bilgisi / Preview M4B export` düğmesi. Seçilen bölümler kaynak sırasına konur, tekrar seçimler tekilleşir. Her WAV süresi FFprobe ile yeniden okunur; bölüm listesi/toplam süre ve 160kb/sn AAC için yaklaşık boyut gösterilir. Bölüm sırası ayrıntıda açılır, yeni özet görünür alana kayar. Tahmin kapsayıcı payı içerir; kesin dosya boyutu sözü verilmez. Metin/sesin güncel ve ready olması önizlemede de zorunlu.
- **N12 — Disk alanı:** Varsayılan çıktı klasörünün kullanılabilir alanı `statfs.bavail*bsize` ile gösterilir. Asıl kayıtta kullanıcının seçtiği hedef dizin tekrar kontrol edilir; tahminden az boş alan varsa kodlama başlamaz ve mevcut dosyaya dokunulmaz. statfs desteklenmiyorsa/başarısızsa boş alan `Ölçülemedi / Unavailable`; bilinmeyen değer sıfır/sonsuz diye sunulmaz, export devam edebilir. Tahmin kontrolü, export sırasında başka programların diski doldurmasını veya gerçek AAC boyutu farkını engelleme garantisi değildir.
- **N13 — Gerçek iptal hatası:** Ortak medya çalıştırıcısı abort/timeout üzerine taskkill/sinyal çağrısını yaptıktan hemen sonra Promise'i reddediyordu. Export finally bloğu Windows'ta hâlâ FFmpeg'in açık tuttuğu geçici dosyayı silebilir, lockı erken bırakabilirdi. M4B için `waitForCloseOnCancel:true` seçeneği eklendi: abort/timeout/pipe hatasında süreç durdurma istenir fakat export bitişi gerçek child `close` olayına bağlıdır. Diğer tüketicilerin mevcut varsayılanı korunur. İptalden sonra stdout/stderr yine tüketilir, yeni veri biriktirilmez. Cleanup başarısız olsa bile controller/listener/lock bırakma finally ile yürür. OS süreci öldürmeyi reddederse uygulama çalışan işi sahte biçimde bitmiş göstermez; close beklenir. Bu tur zorla OS kill reddi testi yapılmadı.
- **N14 — Gerçek ilerleme:** FFmpeg `-progress pipe:2`, `out_time_us` olayları kullanılır. Yüzde ses süresinden hesaplanır, artan değer ve en fazla yaklaşık4olay/sn; dosya başarıyla yerine taşınana kadar en fazla99. Tamamlanma100. Stderr/stdout kanalları tüketilir ve sınırlıdır. ProjectId UI olayını doğru kitaba bağlar. Gerçek HTML progress erişilebilir etikete sahip. Durdur tıklanınca kapanışın beklendiği gösterilir; iptal sonucu ancak çalıştırıcı kapandıktan sonra yerelleştirilmiş biçimde gelir.

Ürün sözleşmesine `book-export-preview` eylemi eklendi; yeni IPC kanalı/izin yok. Aynı ana pencere yetki denetimi kullanılır. Önizleme de proje/controller kilidi ve sender destroyed iptaliyle çalışır. İptal/probe/diyalog hatalarında meta dosyası erken yaratılmaz. Probe/metadata/çıktı üretimi ortak yoldan geçer; önizlemede kodlama yapılmaz.

## Dosyalar

- `src/browser-media-tools.js`: isteğe bağlı gerçek close bekleme; cancel/timeout/pipe hata yolu ve arabellek sınırı.
- `src/media-workflows.js`: ortak önizleme/export doğrulaması, gerçek süre, disk bilgisi, ilerleme ve cleanup/lock sahipliği.
- `src/renderer/media-workflows-ui.js`: tema uyumlu özet, bölüm ayrıntısı, ilerleme ve durduruluyor metni; bayat projeye önizleme yazmama.
- `src/renderer/media-workflows.css`: mevcut tokenlarla iki sütunlu ölçüler ve dar ekran tek sütun; sabit renk/CDN/inline script yok.
- `tests/book-export.test.js`: sıralama/tahmin/düşük ve bilinmeyen disk/progress throttle; gerçek FFmpeg işi sırasında cancel, dosya korunması, close ve cleanup/lock kontrolü.
- `tests/electron-book-reliability.smoke.js`: gerçek preload/main/FFprobe üzerinden özet düğmesi, EN/TR açık/koyu görüntü; mevcut PDF/M4B/Review akışı korunur. Locale değişiminden sonra asenkron render koşulu beklenir; ilk test denemesinde render beklenmeden düğmeye tıklanması fixture hatasıydı, ürün toleransı/eşik değiştirilmedi.

## Kanıt

`node --test tests/book-export.test.js tests/book-reliability.test.js tests/media-workflows.test.js tests/report479-regressions.test.js tests/report472-regressions.test.js tests/report471-regressions.test.js tests/report498-regressions.test.js tests/css-hardcoded-colors.test.js tests/i18n-coverage.test.js tests/ipc-parity.test.js`

Sonuç `tmp/final551c.log`: **45 PASS,0FAIL**. Yeni iki test yaklaşık1sn sürer. Gerçek Windows FFmpeg testi30sn kaynak sesini `-re` ile devam eden işe dönüştürür, ilk gerçek progress alındığında iptal eder. Encoder childın gerçek close'u, eski hedefin aynı baytlarla korunması, `.audiobook-*`/export metadata temizliği, sender listenerlarının kaldırılması ve proje lockının bırakılması doğrulandı. Bekleyerek30sn'nin tamamını kodlamak gerekmez. Gerçek süreç testi GPU/model/insan sesi kalite testi değildir.

Native Windows Electron smoke son koşu **exit0**: `.uiprev/book-reliability549-1792898108193`; önceki görsel inceleme `.uiprev/book-reliability549-1792898010256/m4b-preview-tr-dark.png` ve `m4b-preview-en-light.png`. Gerçek FFprobe8sn toplamı/2bölüm ve M4B2chapter çıktısı; PDF vurgu/Review akışı da geçti. Görüntüler kişisel veri içermeyen ayrı profil/fixture; Git'e konmadı. Yeni son koşum aynı arayüzü ve son iptal metni kodunu doğrular.

Değişen JSlerin `node --check`, `git diff --check` geçti. Yeni runtime bağımlılığı/model/kurulum/manifest şeması yok. Formatter cached Prettier3.6.2. Kişisel `start.bat` oturumu, GPU/CUDA/DRM, canlı sağlayıcı, ağ sürücüsü, dolu gerçek disk/OS kill reddi test edilmedi; statfs hata/düşük alan fault injectiondır.100bölümlü gerçek fan-in ölçümü N15 açık. Önceki fixed-sleep26>21 ratchet hâlâ açık; CI kapatılmadı ve sonucu beklenmedi; fullsuite yeniden koşulmadı.

Kullanım: Sesli kitap üretim alanı > bölümleri seç > M4B çıktı bilgisi; sonra Seçilileri M4B olarak kaydet. Kaydederken Durdur, gerçek aracın kapanmasını bekler. Ana master/kullanıcının kirli belgeleri değişmedi. Normal dal push'u ve PR487 teslimi; tam uzak hash son yanıtta doğrulanır.
