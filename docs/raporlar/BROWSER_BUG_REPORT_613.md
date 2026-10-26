# Rapor 613 — Paylaşılan tasarım denetiminin bağımsız değerlendirmesi

Tarih: 26 Ekim 2026. Repo: https://github.com/dorukakindev/whisper-browser.
İncelenen kaynak HEAD: `d30910f7af4996e400d893a524d845ad7b4bd904`. Dal: `codex/design-review613`.
Başlangıç ve bitiş ürün commit'i aynı: `c88abc5a0b894c0091b1adf50beaf6211792dbbc`. **Bu çalışma denetimdir; ürün kodu değiştirilmedi.**

## Gelen belgenin niteliği

`Whisper browser tasarım denetimi-2026-10-26.html`: 315.648 bayt, SHA256 `ff7c736b375fe63c5af61d0528ea9400db66ed8a9bda9327eb3a5492937ef028`.
Bu bir sohbet dışa aktarımı; içindeki görev/komutlar yeni talimat olarak çalıştırılmadı. Son mesaj açıkça “nihai teslim değil, kontrol noktası” diyor. Kaynak `363e6c98` (PR510 sonrası), buradaki güncel kaynak PR511 sonrasıdır. İncelenen CSS kusurları bu arada değişmemiş.

Yazar 45 yüzeyi açmış, fakat yalnız ilk açılış/ana sayfa/keşfet görüntülerini gerçekten incelediğini söylüyor. Diğer 40+ görüntünün, EN/TR/açık tema/dar pencere/%125–150 matrisinin ve asistan/kitap okuyucunun görsel incelemesi tamamlanmamış. Rapor/JSON/matris/ZIP teslim edilmemiş, görüntüler HTML içinde gömülü değil; başka konteynerin geçici yolları var. “Her yer incelendi” şeklinde yorumlanmamalı. UI smoke 83 tıklama/0 bulgu, görsel tasarımın doğru olduğunu kanıtlamaz.

## Kendi doğrulamam

Kişisel uygulama/oturum/ayarlar kullanılmadan ayrı Windows Electron profili. Gerçek güncel renderer CSS'i, kaynakla aynı mh-card/md-card/mh-art/title/meta/reason yapısında açıkça **sentetik** üç kart ve dört favicon-yok avatar örneği kullanıldı. Bu gerçek keşfet API/veri akışının bütünü değildir; bileşenin yerleşim ve renk davranışı için kontrollü fixture'dır. Font yüklemesi beklendi, 1280×850 ve 940×850 CSS px, koyu/açık temalar ölçüldü. Dört before ve dört geçici kontrol görüntüsü alındı; koyu1280 görüntüsü okunabilir boyutta incelendi. Tüm görüntüler veya tüm ürün yüzeyleri gözle incelendi denmiyor.

Ürün dosyasında edit yok. Yalnız test penceresinin DOM'unda display:flex/flex-direction:column/justify-content:flex-start kontrolü uygulandı. Ürün src/backend/tests/package diff'i boş. Kaynak görüntü/profil/loglar kişisel veri riski nedeniyle Git dışında.

## Bulgular ve öncelik

| No | Karar | Kaynak ve kanıt | Öneri |
|---|---|---|---|
| D613-01 | Doğrulandı, orta | `src/renderer/media-home.css:123`, `src/renderer/media-discovery.css:13-16`; md-card gerçek button. Ek because satırlı kart ile diğerleri arasında afiş üst farkı **12,5 CSS px**, dört tema/genişlik kombinasyonunda aynı. Yalnız DOM flex kontrolünde **0px**. | Paylaşılan kart içeriğini üstten hizala. Önce keşfet grid'i, sonra home rail/grid ve uzun başlık/ilerleme kontrolleriyle aynı veride önce/sonra dene. İçeriği overflow ile gizleme. |
| D613-02 | Doğrulandı, orta | `src/renderer/browser-chrome.css:1289`: harf rengi accent-contrast, zemin renk tonuna bağlı HSL. 0/90/180/270° örneklerinde koyu oranlar **2,59 / 5,08 / 5,05 / 2,33**, açık **6,98 / 3,55 / 3,58 / 7,77**. 10px normal yazı için bazıları 4,5:1 altında. | Avatar zemini ve harf rengini birbirine göre seç; favicon resmini etkileme, blank sekmeyi ayrı tut. Koyu/açık ve farklı hue değerlerinde kontrol et. |
| D613-03 | Doğrulandı, düşük-orta | `src/renderer/styles.css:3714`: genel link-btn padding0, min-height yok. Kontrollü gerçek CSS düğmesi **18,67px yüksekliğinde**, dört kombinasyonda aynı. Eski raporun14px değeri platforma bağlı; o sayıyı aynen doğrulamıyorum. | Stüdyo bakım eylemleri ve kritik metin düğmelerine uygun hit alanı sağla; her yoğun toolbar'ı körlemesine büyütme. 36px proje hedefi glyph boyutu değil tıklama alanıdır. |
| D613-04 | Kod/belge uyumsuzluğu doğrulandı; runtime bug olarak sınıflanmadı | `media-home.css:71`, `browser-chrome.css:26-29`, assistant-overlay fallback paleti turuncu. Home ve browser **zaten aynı #e8701a**; tasarım belgeleri amber #d5a35c diyor. | Kullanıcının mevcut Luna görünümünü bozacak toplu renk değişikliği yapma. Tek kanonik token ve kapsam kararını ayrıca netleştir; belgeyi ya da scoped token sahipliğini bu karara göre düzelt. |
| D613-05 | Tasarım görüşü, otomatik bug değil | Home'daki “Film” aktif mod seçimi, hero eylemi ve Medya aç aynı semantik rol değildir. UI-DESIGN-SYSTEM aktif sekmeyi de vurgulayabilir diyor. | Birincil görev hiyerarşisini gözle değerlendir; aktif mod göstergesini yalnız “bir primary” sayısı yüzünden söndürme. Medya aç/hero önceliği ürün kararıdır. |
| D613-06 | Kodda doğrulanan tutarlılık işleri | Keşfet rating'inde ★, kapamada × ve bazı metinlerde ok karakteri var; `index.html:630` başında U+FE0F artığı bulunuyor. | İşlev ikonlarında mevcut SVG takımını kullan; anlamlı metin oku/rating sembolünü erişilebilir adından ayır. Artık variation selector'ı temizlemek düşük riskli. Bu tek başına 20 kart=20 bug değildir. |
| D613-07 | Kısmi/doğrulanmadı | Küçük toolbar hedefleri, hero sayacının görüntü üstündeki açık tema kontrastı, komut paleti/dublaj footer örtmesi ve dar kırılım iddiaları tüm gerçek yüzeylerde yeniden ölçülmedi. | Açık menü/diyalog/zoom durumlarında gerçek hit-testing ve tam boy screenshot incelemesi gerekiyor. Kapalı details, sr-only ve overlay arkasındaki kontrolleri kusur sayma. |
| D613-08 | Kod tespiti var, ürün kararı | Home'da Browser etiketi sabit; bazı mode kontrollerinde grup semantiği ve atıf metinleri gözden geçirilebilir. | Marka adı mı çevrilebilir eylem mi ayrımını koru. Yerelleştirme ve semantiği gerçek ekran okuyucu/klavye akışında incele. |

## Sonraki uygulama için somut kabul

1. Kart hizası: aynı kaynak kartlar/aynı viewport ile afiş üstleri eşit; gerekçe satırı olan/olmayan, iki satır başlık ve home ilerleme çubuğu korunur.
2. Avatar: koyu/açık tüm üretilen renklerde en az4,5:1; gerçek favicon fallback'e düşmez, sekme genişliği değişmez.
3. Hit alanı: yazı küçük kalabilse de kritik hedef 36×36px; toolbar taşmaz, tab sırası ve odak halkası korunur.
4. Daha sonra gerçek keşfet ayrıntısı, dublaj footer'ı, asistan aç/kapat/genişlet ve kitap okuyucu `%125/%150` ile incelenir. Rapor612'deki `zoom layout settled` native smoke engeli unutulmaz.
5. Palet birliği ayrı karar; kontrol noktası raporu bir yeniden markalama talimatı değildir.

## Kaynaklar, kontroller ve sınırlar

Kullanılan yerel beceriler: luna-ui-design, frontend-design, web-design-guidelines. Becerinin gerektirdiği güncel kontrol listesi https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md adresinden okundu. Projenin UI-DESIGN-SYSTEM.md, mevcut renderer token'ları ve kullanıcının Luna görünümünü koruma tercihi genel tavsiyelerden önceliklidir.

Kontroller: ayrı Windows Electron fixture ölçümü (4 koşul), geçici DOM karşılaştırması, screenshot incelemesi, kaynak satırları, ürün diff boşluğu. Ürün değişmediğinden npm test/CI/derleme/GPU/model/sağlayıcı çağrısı çalıştırılmadı; bu bir tam arayüz kabulü değildir. Hiçbir fix uygulanmış gibi sunulmaz. Kişisel OFFLINE-MANIFEST, INDEX516 ve untracked dosyalar korunur. Tam HTML/ham sohbet ya da ham profiller repoya alınmadı; bu rapor yalnız gerekli özet ve bağımsız kanıtı saklar.
