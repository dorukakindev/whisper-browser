# R810 — Ürün100 P71–P80: keşfet çevirisi ve yorumlar

Başlangıç `e758bcb80a0da02d00ad0d84740a51a5487de48d`; ürün bitiş `9b7f0aec7c30acfd6733b71194431f832fa0283d`;dal codex/product100-library810.10aday:2düzeltme,8mevcut/sınırları belirtilen inceleme. Toplam80/100:37iyileştirme,43mevcut;20sürüyor.

## Doğrulanan sorunlar

P73: çeviri cache mevcut ama detail/UI yeniden açılışta onu döndürmüyordu. `src/media-discovery-service.js` mevcutcatalog veya bounded previewcache yalnız synopsis ve SHA256aynıysa TR döndürür. `src/renderer/media-discovery-ui.js` eskiTRyi başlangıçta gösterir/özgünüyle toggle eder. Kütüphaneye eklenmeyen preview cache oturuma/24kayıt sınırına bağlıdır; restart kalıcılığı iddia edilmez. Katalogdaki synopsis çevirisi zaten kalıcıdır.

P74: aynı UI yorum düğmesinde api(add) zorunluydu. Şimdi discovery:kind:IMDb kimliğiyle `MediaToolsUI` açılır. `src/renderer/media-tools-ui.js`, `review-decision-ui.js` yalnız doğrulanmış discovery alanını ilgili IPC'lere taşır. `src/media-tools-service.js` karar okuma/yazma,kişisel not,publicpage ve mevcut auto/browser yolu için metadataresolverı kullanır; istemci title/yol yerine server resmi provider metadata doğrulanır. Kararlar media-enrichment.json'da ayrı namespace; katalogya item eklenmez. Burası otomatik toplu AI gönderme değildir; örnek/alıntı onayı korunur. Server türetilmiş id kullanır ve farklı istemciid reddedilir.

Diğer8hedefin mevcut thumbnail fallback/center/placeholder,hero connected/generation,canonical resume,anaayar sidebar,historykoruma,relink/Unicode,sourcegeneration/sidecar,dialogocclusion akışları incelendi. R802öncekiGPU/gerçekseek kanıtı yeni koşu sayılmadı. P80tüm fullscreen/DPI kombinasyonları yeni test edilmedi.

## Kontroller ve dürüst hata kaydı

-6dosya başlangıç Node koşusu40sonuçtan38geçti: geliştirmede geniş string değişimi itemIdentity alanını yanlışlıkla selected.identity yapmıştı. Yeni discovery ve mevcut rematch testi bunu yakaladı; input.itemIdentity koruması geri kondu. Son20ilgili service sonucu geçti. Önceden geçen değişmeyen synopsis4/home10/letterboxd6 sonucu korunur.
- Ek source/relink/occlusion/playback:11sonuç geçti;12sonuçluikinci koşuda yalnız yeni kaynakdeğişimi beklentisi kırmızıydı. Metadata10dkcachemeşru; now injection ile600001msilerletildi,6discoverytekrar geçti. Cache süresi/eşiği gevşetilmedi.
- Değişen5ürünJSsyntax,smokefile syntax ve diff geçti. `tests/discovery-review810.test.js`: gerçek servis yazımı/namespace/mismatch/rematch/feedback/metadata doğrulama,katalogyok.
- Windows `electron-media-discovery.smoke.js --library810`: gerçekIPC/servicekatalog,çeviributon/reopen,reviewpanel10örnek,1000px125%,940/680layout,detachedasistan/tabscroll ve native browserhomegeri akışı geçti. Model/Letterboxd transport kontrollü; gerçekfilm siteden10yorum çekildi iddiası yok. Hash/cache gerçekunitservisinde doğrulandı; nativecontrolledwrapper restore görselini sınar.
- İlk native smoke eski pill tasarımı için backgroundhover bekliyordu. Güncelunderline tasarım transparent; actualpointer textcolor değişimi assert edildi. Gerçek hover ve keyboardfocus korunur; ürün CSSyi eskiye çevirmedik.
- Windows `electron-home-thumbnails673.smoke.js`:14başarısız/2sağlamrefill,tinyplaceholder,carousel,800px,18history ve1gerçek kamuya açıkYouTube thumbnail geçti. Ses/video/account değil yalnız görsel erişimi kanıtı.
-11before-quit listener uyarısı sürüyor. Full npm/CI/GPU/ücretliAPI/kişiselprofilkoşulmadı. start/install değişmedi; kullanıcıappkapatılmadı. Yeni bağımlılık yok; media-enrichment mevcut şema/namespaced key,eski kayıt korunur.

## Kaynaklar ve teslim

[Stremio SDK](https://github.com/Stremio/stremio-addon-sdk) MIT kaynak ve [Luna](https://github.com/Nothingman333/Luna-Player) GPL3 ürün yaklaşımı incelendi. Yeni dış kod/bağımlılık alınmadı; mevcut kimlikdoğrulayıcı/incelemepaneli yeterli. Son release güncellemesi veya tümLuna özelliklerinin alındığı iddiası yok.

[evidence810](evidence810/) sentetik UI. Devir1857,ayrıcode/docscommit,normalpushPRmaster. Kişisel430untracked/manifest/INDEX516/deletedstart.sh korunur. KalanP81–100; müzikanalizi/yerelLLM yok.
