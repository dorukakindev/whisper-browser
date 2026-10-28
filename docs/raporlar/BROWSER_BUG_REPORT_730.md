# Rapor 730 — Asistanda gerçek iş aşaması ve son grup etkinliği

## Doğrulanmış boşluklar

- Dublaj servisi sentez heartbeat'ini yayımlıyordu; asistan iş defteri `activity` türünü tamamen atlıyordu. Böylece son grup/deneme/süre bilgisi asistan panelinde görünmüyordu. Yeni regresyon önce `model_load != synthesis` verdi.
- Altyazı çevirisi gözlemcisi scheduler'ın `failed` sayısını iletmiyordu; 3 başarılı/1 başarısız iş kaydı `failed:0` gösteriyordu. Gerçek gözlemci fonksiyonunu kullanan regresyon önce kırmızıydı. Sayfa çevirisi gözlemcisi de aynı alanı iletir.
- Arka plan ayırma ve anlatım analizi durumları sadece metin taşıyordu; asistanın kodlu aşaması bunları ayıramıyordu. Servis artık aşama kodlarını da yayımlar.

## Uygulama/dosya amaçları

- `src/assistant-jobs.js`: mevcut dub-activity doğrulayıcısıyla bounded group/attempt/elapsed/limit; saniye altı tekrarları tekilleştirme; aşama değişimi veya terminalde heartbeat temizliği. Terminal/cancel/exact-ID kuralları korunur.
- `src/assistant-job-diagnostics.js`: overlay'e giden kanıtta yalnız dört sayısal heartbeat alanı; ham metin, anahtar, yol veya provider yanıtı yok.
- `src/dub-service.js`: ayırma/anlatım aşamalarının kodu. Mevcut motor stdout protokolü değiştirilmez.
- `src/main.js`: caption ve page translation gözlemcilerinde gerçek başarısız satır sayısı.
- `src/renderer/assistant-overlay.js`: yerelleştirilmiş sentez/ayırma/anlatım/denge/yerleştirme/yeniden başlatma etiketleri, grup-deneme-geçen süre/süre aşımı sınırı. Bu süre tamamlanma tahmini değildir. Satırlar tam iş ID'sini taşır.
- `src/renderer/assistant-overlay.css`: sayı hizası, okunur satır ve en az 40px Durdur hedefi; mevcut grafit/amber ve açık tema korunur. Dekoratif animasyon veya yeni CSS sistemi yok.
- `tests/assistant-jobs.test.js`, `tests/assistant-caption-jobs.test.js`: önce-kırmızı heartbeat/hata sayacı ve güvenli kanıt projeksiyonu.
- `tests/dub-service.test.js`: kodlu GPU ayırma aşaması; R722'den kalmış pythonw/Tk açılışı beklentisi gerçek Electron `text_studio_open` sözleşmesiyle yenilendi. Yeni stüdyo açarken süreç üretmemesi ve motoru gereksiz kilitlememesi denetlenir. Test silinmedi, eşik gevşetilmedi.
- `tests/electron-assistant-jobs.smoke.js`: native TR/EN heartbeat, aşama bitiminde temizlenme, 40px hedef, exact-ID iptal ve çoklu iş.

## Doğrulama

13 hedefli Node testi ve ayrı `node tests/dub-service.test.js` geçti; syntax/diff kontrolü geçti. Eski dub-service testi ilk çalışmada R722 öncesi Tk sözleşmesi nedeniyle hata verdi; Node runner async script hatasını özet satırında geçer gibi gösterebildiği için bağımsız komutla da kontrol edildi. Hata gizlenmedi.

Gerçek Windows Electron/main/preload/native overlay, ayrı sentetik profil ve yerel HTTP/SSE sağlayıcıyla geçti: 5 kontrollü istek, sohbet iptali medya işini durdurmaz, explicit retry, tek doğru medya iptali, bayat ID yeni işe erişmez. Grup61/deneme2/30sn/180sn bilgisi TR koyu ve 480CSSpx EN açık panelde görünür; aşama değişince kaldırılır; 40px hedef ve taşmasız panel ölçüldü. Görüntüler incelendi. İlk native denemede test yeni eklenen ikinci işin düğmesine UI güncellenmeden bastı; tam ID ve terminal DOM durumu beklenerek düzeltildi. Mevcut 11 before-quit listener uyarısı sürer.

- [TR koyu görünüm](evidence730/assistant-tr-dark.png)
- [Dar EN açık görünüm](evidence730/assistant-en-light.png)

```powershell
node --test --test-isolation=none tests/assistant-jobs.test.js tests/assistant-caption-jobs.test.js
node tests/dub-service.test.js
& 'D:\Whisper Local\node_modules\electron\dist\electron.exe' tests/electron-assistant-jobs.smoke.js
```

## Kaynaklar ve sınırlar

Mevcut ana süreç iş defteri ve dub-activity doğrulayıcısı yeniden kullanıldı. Vercel AI SDK'nın [geçici veri/durum bildirimleri yaklaşımı](https://ai-sdk.dev/docs/ai-sdk-ui/streaming-data) incelendi; çalışan süreç ilerlemesi modelin sohbet yanıtına karıştırılmadan sunulur. GitHub kaynak URL'si açma girişimi cache miss verdi, çalışan kaynak doğrulaması diye sunulmadı. SDK/React veya dış kod/dependency eklenmedi.

Bu kabulde motor/scheduler olayları kontrollüdür; gerçek GPU/Whisper/DeepSeek/YouTube ağı veya model kalitesi kanıtı değildir. Yeni fiyatlı API isteği yok. start.bat/kurulum/kalıcı şema değişmedi; BAT başlangıcı, tüm DPI/ekran okuyucu, tam paket ve CI sonucu doğrulanmadı. CI açık ve beklenmiyor. R728 GPU kitap kabulü hâlâ açık. P007/P077/P092/P094/P097 bu yüzeyde ilerledi; 90 hedef tamamlanmadı, müzik analizi kapsam dışı.
