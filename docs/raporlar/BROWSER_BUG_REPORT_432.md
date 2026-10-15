# Rapor432 — Browser tema ve kontrol düzeni

2026-10-15. Başlangıç:6a678d3c3c2a97389df924d4813f058a1d65539e. Bitiş kodu:475b887a7d6ae0800d88981c6566403ebf62a347.

Kullanıcı browser temasını geliştirmeyi ve görünüm sorunlarını düzeltmeyi istedi. Mevcut grafit/kâğıt ve amber palet korundu; yeni özellik, bağımlılık veya ayar eklenmedi.

## Bulgular ve uygulama

- Dar pencere kuralı ses düğmelerinin span etiketlerini gizliyordu; `browserDubGenerate` yazısı doğrudan button metni olduğundan kurala girmiyordu. SVG ses simgesi ve span eklendi. Dar durumda36px simge düğmesi kalır; erişilebilir ad/title korunur. Yerel oynatıcı girişleri değişmez.
- Sayfa çevirisi etiketi dar görünümde gizlenmesine rağmen108px minimum genişlik kalıyordu. <=920px görünümde düğme34px; adres kutusuna yer açılır. Son720px testinde ses üretimi scrollWidth34/clientWidth34, araç çubuğu eylemlerinde sağa taşma yok.
- Etkin olmayan sekmelerin × düğmesi opacity0 idi; dosyanın R123 tasarımı böyle istiyordu fakat güncel tasarım sözleşmesi kapatmayı hover'a bağımlı bırakmıyor. Dinlenme opaklığı.65; hover/odakta tam görünür. Eski test yeni kasıtlı davranışa güncellendi; diğer R123 regresyonları korundu.
- Etkin sekmede ince amber üst sınır; toolbar padding8/12 ve tutarlı34px eylemler; adres alanı ayrı girdi hiyerarşisini korur.
- Menü araması28→36px; kategori başlıkları36px, daha sakin ağırlık; açık bölümün zemini/başlığı belirgin, klavye odak halkası açık. Menü grup yazısı11px, daha az harf aralığı; mevcut arama ve katlama mantığı değişmez.
- Açık tema için elevation gölgeleri ayrıca tanımlandı; menü/yer imi/komut paleti ortak elevation tokenı kullanır. Koyu gölgeler açık temaya aynen taşınmaz.
- Yeni sekme araması48px, en fazla640px; metin14px. Kart iç boşluğu20px, açıklamalar12px. Yer imi/izlemeye devam et ve ilk açılış mantığı korunur. Azaltılmış hareket tercihinde kart geçişi kapalı.

## Doğrulama

Windows tam Electron, ayrı test profili, gerçek renderer/CSS, kontrollü yer imi verisi.720/980/1440px; koyu yeni sekme, açık Sayfa menüsü, koyu/açık altyazı menüsü, koyu yer imi paneli, açık komut paleti görüntüleri incelendi. Altı senaryoda toolbar sağ taşması0. Özel kanıt: `tmp/browser-polish-final-1792050071180/`; Git'e eklenmedi.720px için yalnız test penceresinin minimum boyutu düşürüldü; ürün minimum pencere boyutu değiştirilmedi. İlk baseline penceresi minimum boyuta takıldığından720 etiketi gerçek720 viewport kanıtı değildi; son raporda `viewport:720` ayrıca doğrulandı.

`node tests/run-electron-smokes.js electron-ui-theme-contrast`: iki temada metin ve odak hatası0. Bu smoke statik renderer kontrast kapsamıdır; bütün web sayfalarına genellenmez. `browser-report123-regressions`7, `browser-reading-design`, `settings-ui-persist-roundtrip`5, `design-system`, `player-chrome-css`, `ui-locale`14 ve DOM ratchet2 geçti. JS main/preload/renderer syntax ve diff temiz. Yeni regresyon, dar ses düğmesinde SVG+span+erişilebilir ad ve kompakt sayfa düğmesi sözleşmesini doğrular.

Canlı YouTube/reklam/Google hesabı, native video yüzeyi, her DPI/zoom, bütün menü durumları, start.bat/install.bat yeni açılışı, tam test paketi ve CI denenmedi/beklenmedi. İşlevsel medya yolları, IPC ve backend değişmedi. Önceki rapor431'deki ana sayfa glossaryImport kontrast kaydı bu browser teması çalışmasının dışında; çözüldüğü iddia edilmez.
