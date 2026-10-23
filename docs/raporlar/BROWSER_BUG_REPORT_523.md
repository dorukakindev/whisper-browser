# BROWSER_BUG_REPORT_523 — Ses hazırlama süreçlerinin kapanış sahipliği

Tarih: 2026-10-23. İnceleme dalı: `codex/dub-lifecycle523`.
Başlangıç master: `512b16fe5a55ae28d2e1e5205b2fff8543257ce2`.
Bitiş kodu: `4767fd1be9d810bbf9618ecbbb175306ef123ec2`.

## Kapsam ve sonuç

Kullanıcı bir tur daha inceleme istedi. Ses üretimi öncesindeki referans hazırlama, özgün anlatım analizi, arka plan ayırma, iptal ve yeniden başlatma yolları incelendi. İki ürün kökü doğrulandı; ikinci kök üç yardımcıda aynı biçimde vardı. Sayı tamamlamak için ayrı bug sayılmadı. Ayrıca artık tamamlanmış önceki CI'daki tek başarısız test dosyası onarıldı.

### 523-01 — Referans zaman aşımında ebeveynin süreç ağacından önce öldürülmesi

`src/voice-reference.js` içindeki on dakikalık zaman aşımı, süreç ağacını durdurma çağrısını Promise mikroişine bırakırken aynı anda `child.kill(SIGKILL)` çalıştırıyordu. Windows'ta ebeveyn taskkill /T çağrısından önce ölebilir; ffmpeg/yt-dlp torunlarının takibi kaybolabilir. Ayrıca exitCode/signalCode görünmesine göre işlem kapanmadan done/reject ve sahipliği bırakma mümkün oluyordu.

Regresyon: timer kontrollü çalıştırıldı; eski kod doğrudan ebeveyn kill çağrısı yaptı (1, beklenen0). Yeni kod yalnız verilen süreç-ağacı durdurucusunu çağırır; promise ve onProcess sahipliği close'a kadar korunur. Stop başarısızsa arayüz mevcut TR/EN mesajıyla izlemeyi sürdürür ve Durdur yeniden denenebilir. Süre aşılmış iş sonradan exit0 verse bile başarılı sayılmaz. Zaman aşımı ardından eski ilerleme mesajlarının durdurma durumunu ezmesi engellendi.

Bu tur gerçek YouTube ffmpeg torunu üzerinde yetim süreç üretimi denenmedi. Çalıştırılan kontrol kesin olarak yanlış kill sıralamasını ve erken sahiplik bırakmayı kanıtlar; gerçek medya donması sıklığını ölçmez.

### 523-02 — Çocuk süreç error olayının kapanış sayılması

`src/voice-reference.js`, `src/dub-prosody.js` ve `src/dub-background.js` her error olayında promise'i bitirip onProcess(null) çağırıyordu. Error yalnız başlatma hatası değildir; kill/send de başarısız olabilir ve çocuk hâlâ çalışabilir. Üst servis erken temizleyebilir veya sonraki aşamayı başlatabilirdi. Tek seferlik error dinleyicisi, sonraki Stop denemesindeki ikinci error için de koruma bırakmıyordu.

Artık hata kaydedilir ve sürekli error dinleyicisi tutulur; bitiş/temizlik close sınırındadır. Hata olmuş bir iş sonradan exit0 ve geçerli dosya verse de başarılı sayılmaz. Başlatılamayan gerçek Windows çocuk süreçlerinde Node'un error ardından close sözleşmesi de doğrulandı; işlem kilidi serbest bırakıldı. Var olan süreç-ağacı sonlandırıcısı ve iptal politikası değiştirilmedi.

## Önceki CI sonucu ve test bakımı

Master512b16fe için [Windows](https://github.com/dorukakindev/whisper-browser/actions/runs/39911896755/job/120276726745) ve [Ubuntu](https://github.com/dorukakindev/whisper-browser/actions/runs/39911896755/job/120276726989) tamamlanmış ve başarısızdır. İkisinde de tek kırmızı dosya `tests/report454-regressions.test.js`: captured-process cancellation testi eski sahte terminate sonucunda exitCode0 ile birlikte false döndürüyordu. Önceki Rapor522 ürün değişikliği false sonucunu haklı olarak onaysız iptal saydığı için eski fixture artık tutarsızdı. Bu, önceki yerel hedefli seçimde gözden kaçmış bir test sözleşmesi uyumsuzluğudur.

Test silinmedi ve beklenen başarı gevşetilmedi: durdurucu, yakalanan doğru süreci aldığını assertion ile kontrol eder; gerçek terminateProcessTreeAndWait yardımcısına kontrollü close olayı gönderir ve onun onayını döndürür. Rapor522'nin onaylanmayan kapanışı reddetme testleri ayrıca geçti. Yeni dalın CI sonucu henüz görülmedi; eski CI yeşile döndü iddiası yoktur. Günlükler ignored tmp/audit523-ci altındadır, commit edilmedi.

## Kanıt ve doğrulama

- Yeni `tests/report523-worker-ownership.test.js`: düzeltme öncesi dört davranış kontrolü4/4 kırmızı; sonrasında yedi kontrol7/7 geçti. Dördü zaman aşımı/çalışırken hata ve tekrarlanan error; üçü Windows'ta gerçekten başlatılamayan executable için close ve kilit bırakma. Mock başarısı gerçek GPU üretimi değildir.
- İlk hedefli koşum: `node --test tests/report523-worker-ownership.test.js tests/voice-reference.test.js tests/voice-reference-process.test.js tests/voice-reference-ui.test.js tests/dub-background.test.js tests/dub-prosody.test.js tests/report521-regressions.test.js tests/ui-locale.test.js` geçti (8 dosya). Rapor521 içinde6 davranış kontrolü, locale içinde14 assertion bulunur; bunlar ayrı ürün bugı değildir.
- Son hedefli koşum: `node --test tests/report454-regressions.test.js tests/report523-worker-ownership.test.js tests/voice-reference.test.js tests/voice-reference-ui.test.js tests/report522-lifecycle.test.js tests/dub-service.test.js` geçti (Node çıktısı10 test; dosya düzeyindeki bağımsız kontroller ayrıca kendi çıktısında).
- `node --check` değişen dört ürün JS dosyasında; `git diff --check` geçti.
- jsdom arayüz kontrolü: stopping/stop_failed metinleri, Stop düğmesinin yeniden kullanılabilirliği ve mevcut referans/iptal akışı geçti. Görünüm geometrisi/CSS değişmedi; gerçek pencere ekran görüntüsü alınmadı. Yeni metin yerine mevcut iki dilli sözlük girdileri kullanıldı.

## Sınırlar

Normal start.bat ve GPU/CUDA ses üretimi, gerçek YouTube hesabı/DRM, müzik ayırma modeli ve dinleme karşılaştırması yapılmadı. Uzun timer denetimde kontrollü tetiklendi; on dakika beklenmedi. Tam npm test tekrar edilmedi. Yeni CI açık kalır, teslim sonucunu beklemez. Kapanışı onaylanamayan işlem bitmiş gösterilmez; kullanıcı yeniden Stop deneyebilir. Bu tur Windows ana kopyası ve açık oturum değiştirilmedi; ayrı PR teslimidir. Yeni bağımlılık/model/ayar şeması yoktur.
