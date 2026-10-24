# Browser ana sayfa dönüşü

2026-10-24. Başlangıç HEAD `e57612a3f90ff2a5108be0def92db48accb28f4e`; bitiş ürün kodu `731b849fb114add4aa2e670779c063ccb31e30aa`.

## Gerçek kök neden

`browser-chrome.css`, `.workspace-browser .player-back-button` ve oyuncu başlık kontrollerini sade Browser tasarımında gizliyordu. Yeni medya ana sayfasının `mediaHomeBack` düğmesi ise stüdyo başlığındaydı; Browser katmanı açıkken görünmüyordu. Sayfa geçmişindeki Geri düğmesi uygulamanın medya ana sayfasına dönüş sağlayamaz.

## Değişiklik

- Adres çubuğunun solundaki gezinme grubuna ev ikonlu **Ana sayfa / Home** düğmesi eklendi. Geniş ekranda yazılı, 900px altında ikonu ve erişilebilir adı kalır; sayfa geçmişi düğmesinden ayrıdır.
- W uygulama menüsünde aynı komuta giden **Ana sayfa / Home** kısayolu bulunur.
- Ortak `returnHome` mevcut oynatmayı duraklatır, mevcut watch-state yazımını çağırır, native Browser görünümünü gizler ve medya ana sayfasını erişilebilir yapar. Açılan sekmeleri kapatmaz, sayfayı yeniden yüklemez, kaynak/altyazı metnini veya üretim işini sıfırlamaz. Geciken dönüşün yeni açılan bir kaynağı gizlememesi için `openIntent` kontrol edilir.
- Browser içindeki Oynatıcı geçişi kaldırılmadı: yeni medya merkezi ve native seçeneğinin de kullandığı mevcut ortak oynatma/altyazı/dublaj çalışma alanıdır. Bağımsız ikinci bir oynatıcı uygulanmadı.

## Kanıt

`tests/electron-media-discovery.smoke.js` Windows gerçek Electron/main/preload ve izole sentetik HTTPS Browser görünümünde geçti. 1440/TR ve 680/EN boyutlarında düğme görünürlük/boyut, tıklayarak ana sayfa, native Browser'ın gizlenmesi ve ana sayfanın inert olmaması doğrulandı. Aynı Browser yeniden açılınca önceki JavaScript sentinel'i **42** kaldı: sekme kapanmadı veya yeniden yüklenmedi. Seçili sekme, altyazı cue durumu ve iş state'i değişmedi. Önceki Keşfet/asistan/Defuddle kontrolleri aynı koşuda geçti.

Yerel kanıt: `.uiprev/media-discovery/1792845485052-11012-fixture/`; `browser-home-1440-tr.png`, `browser-home-680-en.png` doğrudan incelendi. Bunlar ana renderer/header görüntüleridir; native sayfa piksellerinin tam birleşik OS yakalaması olarak sunulmaz.

`node --check` değişen JS/test için, `git diff --check` geçti. Tam paket, canlı YouTube, DRM/CUDA, fullscreen/PiP OS geçişleri ve aktif gerçek model işi bu turda çalıştırılmadı. Sekme devamı kontrollü sayfa ile doğrulandı. Yeni bağımlılık veya şema değişikliği yok.
