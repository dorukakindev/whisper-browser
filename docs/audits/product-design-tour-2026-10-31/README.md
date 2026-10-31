# Ürün tasarım turu — 31 Ekim 2026

Başlangıç ürün kodu: `b589e87198a7d1f8459d4b8c8e01db674fddf592`. Dal: `codex/product-design-tour`. Üç GPT-6.1 Sol / medium ajan ayarlar, asistan ve Keşfet alanlarında çalıştı; ana ajan PDF düzenini, ortak ekranları ve teslimi kontrol etti. Bu kayıt yeni bug kotası veya bütün uygulamanın kusursuzluğu iddiası değildir.

## Uygulanan değişiklikler

- **Ayarlar:** Dar ekranda arama eşleşmeleri artık görünür ve seçilebilir. Önceden “tmdb” yazıldığında eşleşen masaüstü kategorisi gizli kalırken kompakt seçim eski kategoriyi gösteriyordu. Sonuç sayısı ve boş sonuç açıklaması eklendi. Ayrı asistan sağlayıcısının ince ayarları ve model/bağlantı/anahtar araçları adlandırılmış, açılma durumu korunan ayrıntılara taşındı. Sağlayıcı seçimi günlük görünümde; ayrı sağlayıcı seçmek ilgili ayrıntıyı açar. Mevcut kontroller taşındı, kimlikleri ve kayıt yolu korunur; ayrıntı açmak sağlayıcı isteği göndermez.
- **Asistan:** Kaynak/model alanı, ayar kısayolu ve kaynak açıklaması görsel olarak ayrıldı. Kaynak açıklaması kendi sınırlı alanında kayar. Boş sohbetin selamı ve başlangıç önerileri artık dar bir iç kaydırma alanına sıkışmaz; dış çalışma alanında akar. Mesaj yazma alanına erişim korunur. Boş sohbette hatalı “Son yanıta git” göstergesi kaldırıldı; uzun kod ve akış sırasında kullanıcının kaydırma konumu kontrol edildi.
- **Keşfet:** Tür/liste değiştirirken henüz gönderilmemiş arama metninin kaybolması düzeltildi. Detayda izleme listesi ve Letterboxd eylemleri uzun özetten önce gelir. İzledim/ilgilenmiyorum/geri al, oyuncular ve IMDb kaynağı adlandırılmış ikincil ayrıntıda korunur. Dar ekranda afiş başlıkla birlikte daha az yer kaplar.
- **PDF:** Çeviri dili ve dışa aktarma biçimi açık etiketli iki gruba ayrıldı; mevcut düğme ve olaylar korunur. Menü giriş hareketi işaretçiyle açılan menüye sınırlandı; klavyeyle açılış bekletilmez, azaltılmış hareket tercihi korunur. Yeni genel animasyon sistemi veya yeni ürün bağımlılığı eklenmedi.

## Gerçek Windows doğrulaması

Kullanıcının açık uygulaması kapatılmadı; testler ayrı Electron profillerinde çalıştı. Görsellerdeki kitap/afişler kontrollü örneklerdir. Fiziksel TV'nin yüksek DPI değeri, pencere/CSS boyutu ve zoom ayrı değişkenlerdir; 1080p fiziksel monitör doğrulaması iddia edilmez.

| Kontrol | Sonuç / kanıt |
|---|---|
| Ayarlar tasarım turu | 30 durum; 1440/720/520 genişlik, TR/EN, açık/koyu, ayrıntı, arama, yüklenme ve hata. `evidence/settings.json` |
| Asistan tasarım turu | 24 durum; 480×720 ve 360×600, TR/koyu ve EN/açık, boş/dolu, kaynak, uzun kod, akış, menü, Escape, ayar kısayolu ve azaltılmış hareket. `evidence/assistant.json` |
| Ana sayfa / Keşfet | 20 durum; 1440 TR/koyu ve 800 EN/açık %125 zoom. Arama korunması, ayrıntıda Enter, tercih yazmayan açılış, gerçek tercih kimliği ve hata/yeniden deneme. `evidence/discovery.json` |
| Genel çalışma alanları | 21 görüntü; ana sayfa, film/kitap, Keşfet, ayarlar, Whisper, dublaj ve metin sesi. `evidence/workspaces.json`. Değişmeyen ekranlar incelendi; hepsine kod değişikliği yapılmadı. |
| PDF deneyimi | Yerel PDF görüntüleme/okuma, çeviri menüsü, arama, zoom, asistan bağlamı, ses aralığı ve kontrollü dinleme. `evidence/pdf.json`. Gerçek model ses kalitesi testi değildir. |
| Browser menü + chrome | İki native smoke geçti: yön tuşları, range 50→51, select odağı, dar/normal ve tam ekran gidiş-dönüş. `evidence/browser.log` |
| Hedefli Node kontrolleri | 29 test geçti; buna ek olarak aynı komut içindeki eski güvenlik dosyası kendi 23 kontrolünü geçti. Bunları 52 bağımsız Node testi diye toplamayın. `evidence/targeted.log` |

Hedefli komut:

```powershell
node --test --test-isolation=none tests/app-settings-progressive.test.js tests/settings-security.test.js tests/assistant-conversation.test.js tests/media-discovery-service.test.js tests/pdf-reader-search-ui.test.js tests/ui-motion.test.js tests/ci-determinism-ratchet.test.js
```

Yeni native turlar `tests/run-electron-smokes.js` üzerinden `settings-design-tour`, `assistant-design-tour`, `home-discovery-design` adlarıyla çalıştırılabilir; gerçek dosya adları bu adlarla eşleşir. Diğer kullanılan adlar: `app-settings`, `pdf-reader-experience`, `browser-menu-formcontrols`, `browser-chrome-design`, `design786`.

İlk browser/PDF birlikte koşumunda browser tam ekrandan çıkış `Document not active` hatası verdi; diğer test pencereleri bittikten sonra aynı browser testi tek başına geçti. İlk sandbox Node koşumunda güvenlik testinin üç alt süreç kontrolü çalışamadı; değişmemiş komut yetkili ortamda tamamen geçti. Hatalar gizlenmedi, eşikler gevşetilmedi. Eski ayar smoke'u kompakt navigasyonu sınamadan önce önceki aramayı temizler; yeni test dar arama davranışını ayrıca sınar. Sözdizimi ve `git diff --check` geçti. Tam `npm test`, ücretli sağlayıcı, gerçek YouTube/DRM ve model/GPU kalitesi bu turun kanıtı değildir. Uzun CI sonucu beklenmez.

## Araştırma ve kullanılan beceriler

Mevcut `frontend-design`, `make-interfaces-feel-better` ve `web-design-guidelines` yönergeleriyle çalışıldı. Kullanıcının talebiyle resmi kaynaklardan şu yerel beceriler kuruldu ve ilgili belgeleri bu turda okundu:

| Kaynak | Sabit kaynak revizyonu | Lisans | Uygulamadaki katkısı |
|---|---|---|---|
| [Impeccable](https://github.com/pbakaus/impeccable) | `4f956490f0056ae1ff5ea80372cf56e83c001d3c`, beceri 4.8.0 | Apache-2.0 + NOTICE | Var olan ürün bağlamında görsel inceleme ve son detector; tema değiştirilmedi. |
| [Emil / review-animations](https://github.com/emilkowalski/skills) | `a81dbca07f2217b7103e510c0f13f8d5b017afc9` | MIT | Giriş yöntemi, kısa geri bildirim ve azaltılmış hareket incelemesi. |
| [Emil / animation-vocabulary](https://github.com/emilkowalski/skills) | Aynı revizyon | MIT | Hareketin amacını ve süre/easing seçimini açık değerlendirme. |

Kurulumlar kullanıcı beceri dizinindedir; kaynak/lisans ve SKILL SHA256 kayıtları `evidence/skill-sources.json` içinde. Yeni global hook, canlı izleme veya harici tasarım servisine kaynak yükleme açılmadı. İlgili beceriler mevcut turda dosyadan okunarak kullanıldı; sonraki turlarda otomatik beceri envanterinde görünür. Figma/Canva gibi eklentiler araştırıldı fakat mevcut Electron akışı için gerekli görülmedi; kurulmuş gibi raporlanmaz.

Okunan birincil yazılar: [Agents with Taste](https://emilkowal.ski/ui/agents-with-taste), [Great Animations](https://emilkowal.ski/ui/great-animations), [You Don't Need Animations](https://emilkowal.ski/ui/you-dont-need-animations), [Details That Make Interfaces Feel Better](https://jakub.kr/writing/details-that-make-interfaces-feel-better), [Impeccable / Improve Design](https://impeccable.style/docs/improve-design/), [NN/g / Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/). Esas alınan yaklaşım: önce ana eylem ve okunabilir hiyerarşi; ince ayarda da aynı özen; hareketi yalnız anlamlı geri bildirimde kullanmak. “En iyi beceri” için nesnel sıralama veya yüzlerce yazı okunduğu iddiası yok. Bu tur yeni Luna kaynak/render karşılaştırması yapmadı; Luna benzeri günlük kullanım dengesi kullanıcı tasarım brief'idir, birebir benzerlik/parite kanıtı değildir.

### Detector sonucu yeşil değildir

Impeccable `context` komutu mevcut kapsamı `SCOPED_EXISTING_ALLOWED` olarak kabul etti. Değişen dokuz UI dosyasındaki `detect --json` çıkışı **2**, toplam **76 bulgu**: 15 font, 9 renk, 50 radius, 1 nested-cards, 1 side-tab. Ham çıktı `evidence/impeccable-detect.json` içinde.

İlk 74 kayıt mevcut kodun Sora/IBM Plex Sans, ortak renk ve radius tokenları ile eski `DESIGN.md` arasındaki uyumsuzluklardır; 74 yeni ürün bugı sayılmadı. İki yapısal kayıt asistanın semantik form yüzeyi ve mevcut alıntı kaynak çizgisine işaret eder. Ekranlar elle incelendi; sırf detector yeşil olsun diye ürün teması, baseline veya eşik değiştirilmedi. Detector kullanılmasının kendisi kusursuz görünüm kanıtı değildir.

## Seçili görüntüler

[Önceki ayarlar](evidence/settings-before.jpg), [yeni ayarlar](evidence/settings-after.jpg), [dar arama](evidence/settings-narrow.jpg), [asistan kaynağı](evidence/assistant-after.jpg), [Keşfet detayı](evidence/discovery-after.jpg), [ince tercihler](evidence/discovery-options.jpg), [PDF menüsü](evidence/pdf-tools.jpg), [incelenen dublaj ekranı](evidence/dubbing-reviewed.jpg). Görseller inceleme için küçültülmüştür; kanıt JSON kayıtları gerçek CSS ölçülerini korur.
