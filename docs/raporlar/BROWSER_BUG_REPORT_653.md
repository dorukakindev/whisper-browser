# Rapor 653 — Keşfet yorumları, seçilebilir Flex ve asistan etkinliği

## Doğrulanan sorun ve sonuç

Asistan `discovery:film:tt14173636` kimliğini doğru çözmesine rağmen yorum işlemi `catalogId` zorunluluğunda duruyordu. Ana süreçte Keşfet kimliğini doğrulayan mevcut detay servisi yeniden kullanıldı. Modelin verdiği başlık veya serbest URL yetki sayılmıyor: yalnız film/dizi türü ve IMDb kimliği kabul edilir. Letterboxd film eşleşmesi, HTTPS/yönlendirme sınırları ve kaynak değişimi kontrolleri korunur.

Keşfet yorumları artık kütüphaneye eklemeden yüklenir. En fazla 10 yorum asistan sonucuna aktarılır; uzun yorumlar 900 karakterle sınırlandırılır ve `truncated` bilgisi taşır. Gelen örnek 10'dan az olabilir; örneklem genel kanaat sayılmaz. Keşfet sonucu kütüphaneye veya kalıcı analiz taslağına kendiliğinden yazılmaz. Analiz kaydetme/açma akışı hâlâ açık kütüphane kimliği ister.

## Flex seçimi

Ayarlar → Asistan ve çeviri → Asistan sağlayıcısı altında Flex kutusu eklendi. Mevcut kurulumlar önceki davranışını korur: varsayılan açık. Kapalıyken yalnız asistanın DeepInfra isteklerinden `service_tier` çıkarılır ve sağlayıcının standart katmanı kullanılır; açıkken `flex` gönderilir. Araç turları, uyumluluk tekrarları, web araştırması ve eski Python asistan yolu aynı seçimi izler. Altyazı sağlayıcısı ve anahtar kasası ayrımı korunur.

`assistant.flex` isteğe bağlı boolean ayarıdır; şema sürümü değişmedi. Eski Python yolu için iş kapsamlı `WHISPER_ASSISTANT_SERVICE_TIER` kullanılır; diğer alt süreçlere miras bırakılmaz. Yeni bağımlılık yok.

## Asistan görünümü

Gerçek bağlantı/bekleme, sağlayıcı değerlendirme sinyali, araç çalıştırma, uygulama sonucu ve yanıt yazma aşamaları ayrılır. Amber halka, düşük hareketli nabız, taşmayan aşama etiketleri ve sabit genişlikli süre sayacı eklendi. Durdur erişilebilir kalır. İş bitince gösterge/timer temizlenir. Azaltılmış hareket tercihinde animasyon durur. Ham sağlayıcı reasoning metni gösterilmez; yalnız sinyal kullanılır.

Native testte etkinlik metninin geldiği ancak yeni `phase` alanının overlay sınırında atıldığı görüldü; enum doğrulamalı köprü eklendi. Kaynak eskidikten sonra geç yazma fazı gönderilmemesi de mevcut regresyonla korundu.

## Luna incelemesi ve kaynaklar

- Güncel kaynak: [Luna Player](https://github.com/Nothingman333/Luna-Player), `859b0925ad51d878293377353476e7957eb8bc91`, 27 Ekim 2026, 2.7.5CC beta. `TasteUI.tsx` içindeki bekleme/araç/düşünme ayrımı ve güncel CHANGELOG incelendi. Son sürümde bazı dock değişikliklerinin geri alındığı görüldü; bunlar körlemesine taşınmadı. Doğrudan Luna kaynak kodu veya yeni bağımlılık eklenmedi; mevcut Electron sınırlarımız üzerinde özgün bileşen yazıldı.
- [DeepInfra model ve katman açıklaması](https://deepinfra.com/blog/deepseek-v4-1-flash-model-overview-integration): standart için alanın boş bırakılması; Flex'in kapasite beklemesi. Canlı fiyat veya model kalitesi testi yapılmadı.
- `frontend-design` ve `make-interfaces-feel-better` yerel becerileri kullanıldı. Palet ve mevcut stil sistemi korundu.

## Kanıtlar ve başarısız denemeler

- İlk hedefli Node grubu 55/56 geçti; yeni `writing` aşaması kaynak değişimi sonrasında da gönderiliyordu. Kaynak/signal denetimi eklendi; tekrar 56/56 geçti.
- Son boundary/settings/library grubu 10/10 geçti. Ayar güvenlik paketi sandbox alt süreç sınırında üç yerde başarısız oldu; native izinli tekrarda 23/23 ve 44 process-crash senaryosu geçti. Test silinmedi veya eşik gevşetilmedi.
- Python `test_assistant_stream.py`: 11 geçti. Ek kontrollü standart/Flex ortam seçimi kontrolü geçti.
- Native Windows `tests/electron-assistant653.smoke.js` exit 0: gerçek main/preload/renderer, ayrı profil, kontrollü Cinemeta/Letterboxd/DeepInfra yanıtları. Standart isteğinde Flex alanı yok, açık isteğinde Flex var; ayar kaydı anahtarı açık dosyaya yazmıyor. Asistanın gerçek onay kartı uygulandı; 10 yorum döndü, kütüphane 0 kaldı. TR koyu, EN açık 760 px ve azaltılmış hareket kontrol edildi.
- Test düzeneğinde ilk çalıştırıcı yolu yanlıştı; SSE satır sonu, async hata işleyici, yanıt bitişini bekleme ve `automatic` enum fixture'ı düzeltildi. Bunlar ürün bugı sayılmadı.
- Native kanıt: `.uiprev/assistant653/1793115372470-5324/`; düşünme/yazma, iki ayar görünümü ve tamamlanan yorum kartı görüntüleri incelendi. Kişisel görüntü/profil Git'e eklenmedi.
- Değişen JS sözdizimi, Python compile ve diff kontrolü geçti. Gerçek model/ücretli API/Letterboxd canlı erişimi/GPU/start.bat/tam test paketi çalıştırılmadı; CI açık ve beklenmedi. Testte filtre indirmesinin ağ izolasyonuna takılması beklenen fixture sınırıdır; reklam engelleme doğrulaması değildir.
