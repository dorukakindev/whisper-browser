# Rapor538 — Sayfayı gerçekten çeviren, kaynağa göre düzenlenen asistan

Kapsam: browser sayfa asistanı, mevcut sayfa çevirisiyle komut bağlantısı ve native panel tasarımı. Başlangıç HEAD `16a73382022f5611cbd68dd0351548fcbc3c0410`; bitiş kod `386c3cc97fe4d9e5d46e5ec2cee0d50044466521`. Checkout `D:\Whisper Local\tmp\audit470`, dal `codex/luna-media-home532`, PR482. Ana kullanıcı checkout'u ve master değiştirilmedi.

## Doğrulanan sorunlar ve sonuç

- Açık sayfayı çevirme isteği doğrudan sohbet modeline gidiyordu; gerçek `browser:page:start` aracı kullanılmıyordu. Açık browser bağlamında açık TR/EN sayfa çeviri istekleri artık mevcut sayfa çevirisini çalıştırır. Kısa “çevirebilir misin?” de açık sayfada bu işlemi başlatır. Özellik hakkında sorular, olumsuz istekler, alıntılar ve altyazı/cümle çevirisi bu dar eşleştiriciden geçirilmez. Model cevabı veya sayfa metni komut eşleştiricisine verilmez.
- Mevcut toolbar handler'ını körlemesine yeniden çağırmak çalışan çeviriyi durduruyor veya hazır çeviriyi gizliyordu. Asistan için `ensureVisible` yolu çalışmakta olan işi korur, hazır çeviriyi açar; toolbar'ın mevcut durdur/gizle davranışı korunur. Açıkça istenen dil farklıysa yeni dilde başlatır, eski dildeki metni istenen dil gibi sunmaz.
- Haber sayfasında altyazı kapsamı ve video işlemleri görünüyordu. Gerçek altyazı bulunmadan izlenen/yakın/tüm altyazı seçimi gösterilmez; haber için özet, doğrudan Türkçe sayfa çevirisi ve açıklama seçenekleri vardır. Model/kaynak bilgisi açıkça ayrılır.
- Panelde kaynak, sohbet, yönetim ve arama araçları ayrı ayrı sıralanıp yazışma alanını daraltıyordu. Luna'nın mevcut grafit/turuncu paleti, yerel IBM Plex Sans/Sora fontları, kaynak başlığı, tek araç menüsü, okunaklı konuşma ve bütünleşik yazma alanıyla yeniden düzenlendi. Arama, sabitleme, dışa aktarım, adlandırma, silme, geçmiş/dal, kaynak/öneri kartları ve taslaklar korunur. Ctrl+F araç menüsünü açar; Escape önce menüyü kapatır. İlk sohbet etiketinin locale değişiminde İngilizce kalması da giderildi.
- Çeviri başlamadan yapılan asenkron güvenlik/ayar kontrolleri sırasında iptal veya gezinme isteği boşa düşebiliyordu. Main başlangıç epoch'u ve renderer kaynak/iptal denetimi eklendi. Sayfa bağlamı okunurken generation/URL değişirse eski bağlam reddedilir.
- İşlem kabulü tamamlanana kadar soru taslakta görünüyordu. Yeni kullanıcı mesajı kabul edildiğinde kaynak ve istek kimliğiyle makbuz üretilir; devam eden sayfa işi satır ilerlemesini gösterir. Başarısız gönderimde taslak korunur. Tam/kısmi/hata/durdurma ayrı raporlanır; başarısız iptal “durduruldu” diye gösterilmez.

## Gerçek sağlayıcı ve gerçek sayfa denemesi

Ayrı Windows test profilinde kayıtlı OpenAI sağlayıcısı ve **gpt-5.4-mini** kullanıldı. Anahtar sohbete, komut argümanına veya Git'e yazılmadı; kullanıcının açık profili/sohbetleri değiştirilmedi. Test profili yalnız ihtiyaç duyulan şifreli AI kayıtlarını aldı.

[Ancient Origins haberi](https://www.ancient-origins.net/news-history-archaeology/liangzhu-cemetery-ritual-platform-00103297): 51 bağlam bloğu / 4840 karakter. Üç gerçek sohbet denemesi: Türkçe özet; mezarlık/ritüel yapı hakkında takip sorusu; sayfada bulunmayan bilgi. Model ilk ikisinde gerçek S kaynaklarını kullandı, ritüel işlevin henüz öneri olduğunu korudu; üçüncüsünde metinde bilgi olmadığını söyledi. Bu örnek bütün siteler veya her model yanıtı için kalite garantisi değildir.

Asistandan gönderilen sayfa çevirisi gerçek DOM'a **47 Türkçe blok** yerleştirdi; 0 başarısız blok. Türkçe paragraflar `[data-whisper-tr]` üzerinden ve native sayfa görüntüsünde ayrıca görüldü. İkinci çeviri komutu mevcut çeviriyi kapatmadı. Test makalesi Cloudflare doğrulaması çıkarmadı; CAPTCHA veya giriş oturumu doğrulanmadı.

Yerel özel kanıtlar (Git'e alınmadı): `.uiprev/assistant-page-live-1792871426490/results.json` üç gerçek yanıt; `.uiprev/assistant-page-live-1792871552697/results.json` gerçek Türkçe DOM; aynı klasörlerde native panel/sayfa PNG'leri. İlk canlı harness ikinci soruyu backend süreç kapanmadan gönderdiği için zaman aşımına uğradı; ürün hatası gibi sayılmadı. Harness kuyruk/exit ve buton hazır durumunu bekleyecek şekilde düzeltildi ve üç soru tamamlandı. İlk DOM sayımında yanlış attribute kullanılmıştı; gerçek `data-whisper-tr` seçicisiyle yeniden ölçüldü. Bu ilk sayım başarı kanıtı olarak kullanılmadı.

## Hedefli doğrulama

- `node --test --experimental-test-isolation=none tests/assistant-page-command.test.js tests/assistant-conversation.test.js tests/assistant-overlay.test.js`: **11 geçti**. Intent/olumsuzluk, gerçek toolbar helper'ı, tekrar çağrı, farklı dil, gecikmiş ayar/kaynak, main güvenlik/bağlam yarışı, doğru iptal sonucu, taslak/makbuz, menü/klavye ve native IPC yetkisi.
- `node tests/browser-page-translation-main.test.js`: bölüm yenileme, API bütçesi ve dışlamalar geçti.
- Gerçek Windows Electron: `electron tests/electron-assistant-conversation.smoke.js`, `electron tests/electron-assistant-stream.smoke.js`, `electron tests/electron-assistant-page.smoke.js` geçti. İlk ikisi mevcut sohbet/akış regresyonu; sonuncusu üretim komut bağlantısıyla kontrollü sayfa aracı, ilerleme, erken taslak makbuzu, kısmi sonuç ve koyu/açık 1440/720 pencere düzenidir. Bu kontrollü sonuçlar gerçek provider testiyle karıştırılmadı.
- Son görsel kanıt `.uiprev/assistant-page-fixture/1792871712989-28748/`: boş, sonuç, açık araç menüsü ve dar açık tema ekranları. Görsel incelemede yakalanan menü yatay taşması ve boş durumun flex çökmesi sorumlu CSS'te giderildi; düzeltilmiş PNG'ler okunarak doğrulandı.
- Değişen JS syntax ve `git diff --check` geçti. Varsayılan Node test alt süreç spawn'ı sandbox'ta EPERM verdi; aynı testler desteklenen izolasyonsuz modla çalıştırıldı.

Yeni bağımlılık, model indirme, profil/şema göçü, install/start değişikliği yok. Normal `start.bat` yeniden açılışı, GPU/CUDA, DRM, gerçek ses/dublaj kalitesi, bütün siteler ve tam test paketi bu tur çalıştırılmadı. CI açık kalır; sonucu beklenmez ve görülmeyen sonuç başarılı sayılmaz. Mevcut WebView2 araştırması entegrasyon yapılmış gibi sunulmaz.
