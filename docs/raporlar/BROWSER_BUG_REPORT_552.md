# BROWSER_BUG_REPORT_552 — Dublaj grup dinlemede metadata ve bayat istek

2026-10-25 06:53 Europe/Istanbul. Repo https://github.com/dorukakindev/whisper-browser; dal codex/book-reliability549, PR487. Başlangıç f4aa1c96bd4d64536379478296dd09845e271025; bitiş ürün kodu **4a30bab097be37a544ee358db532b4bdada37a4f**. Kullanıcının son isteğiyle yedek/kurtarma ekleri ertelendi; bu teslim yalnız doğrudan dublaj oynatma davranışıdır.

## Gerçek hata

`src/renderer/dub-generator-ui.js` Bu grubu dinle, readyState/metadata kontrolü yapmadan currentTime atıyor, play çağırıyordu. Geç yüklenen ses yanlış konumda başlayabilir veya seek hata verebilirdi. Bekleyen metadata/oynatma isteği için panel kapanışı veya grup/source değişimi kimliği yoktu. Ayrıca path zorunluluğu, oynatılabilir URL'si bulunan sonuçları gereksiz reddediyordu.

## Düzeltme

Metadata beklenir; hata/10sn sınırı ve listener cleanup var. Her dinleme generation kimliği alır; panel/grup/source değişince eski bekleme iptal, ses pause olur. Sayısal pozitif start/end ve gerçek duration kontrol edilir; bitiş dosya sonuna sınırlandırılır. Kaynak hazırsa hemen seek/play; range sonuna erişince pause. Preview reset önce eski grup isteğini kapatır. Yeni hata EN/TR sözlüğünde. Üç dosya: dub-generator-ui.js davranış, ui-locale.js hata çevirisi, dub-generator-ui.test.js gecikmiş metadata ve panel kapanınca geç autoplay reddi.

## Kanıt/sınırlar

`node tests/dub-generator-ui.test.js` geçti: mevcut üretim/iptal/yeniden üretim/attach/kurtarılan dosya akışları, yeni metadata gelmeden oynatmama, gelince2sn seek ve panel kapandığında geç play olmaması. JSDOM kontrollü medya API; gerçek ses sürücüsü veya browser decoder kalite kanıtı değildir. İlişkili locale-dedupe/dynamic ve renderer-realm kontrolleri9PASS/0FAIL. node --check ve git diff --check geçti. Görünüm değiştirilmedi; yeni düzen/screenshot gerektiren UI tasarım eklenmedi. Yeni bağımlılık/kurulum/şema yok; kişiselstart.bat/GPU/liveYouTube/CI sonucu test edilmedi. Önceki fixed-sleep26>21 açık sürüyor.

Yedek denemesi sırasında mevcut native smoke approval stored timeout tekrar görüldü; bu yeni dublaj düzeltmesinin başarısı diye sunulmadı. Ertelenen patch/test tmp altına ayrıldı ve ürün kaynaklarından geri alındı, commit/push edilmedi. Sonraki odak bu gerçek Review etkileşim gecikmesini ve dublaj kaynak değişimini bağımsız doğrulamak. Ana master/kişisel uygulama değiştirilmedi.
