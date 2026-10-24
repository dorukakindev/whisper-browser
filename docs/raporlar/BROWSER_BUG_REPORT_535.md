# BROWSER_BUG_REPORT_535 — Sade üst çubuk ve görünür TMDB/afiş ayarları

2026-10-24. Repo https://github.com/dorukakindev/whisper-browser, PR #482, dal `codex/luna-media-home532`. Başlangıç HEAD `2e3ac9d622750312b53da9bfb7b4c851f1cafa38`, bitiş ürün `733ba3493125cd411d2362b63713dcb3b82520bc`.

Kullanıcı ekran görüntüsünde geniş üst çubuğun bile yatay kaydırıldığını, Settings ve EN düğmelerinin gereksiz yer kapladığını ve TMDB/afiş bağlantısının görünmediğini belirtti. Mevcut TMDB kodu vardı: katalog ayrıntısı→Bilgileri eşleştir, sadece oturumluk token; merkezi Ayarlar'a bağlı değildi. Kullanıcının gerçek arşivini veya özel TMDB hesabını bu tur incelemedik; her boş afişin ayrı kök nedenini doğruladığımız iddiası yok.

## Arayüz

- Ana sayfanın sağında yalnız Browser, Medya aç, Araçlar ve erişilebilir **SVG ayar simgesi**. Ayrı EN/TR kaldırıldı; dil yalnız Ayarlar→Görünüm ve araçlar içindeki mevcut kontrolle değiştirilir.
- Stüdyo, Altyazı→ses, Bu akşam, Arşiv bakımı ve İşlemler işlevleri kaldırılmadı; Araçlar açılır menüsünde. Menü dışarı tıklama/Escape ile kapanır. Native details/summary klavyeyle kullanılabilir.
- Gezinmede yatay scroll yerine okunabilir flex düzeni. 1920px'de tek satır; dar pencerede gezinme ayrı satıra gelir. Sabit/çakışan ek buton şeridi yok. Var olan tema token/fontları korunur.

## TMDB

Ayarlar→**Film bilgileri ve afişler**: TMDB Read Access Token veya v3 API Key, bilgi dili ve resmi API edinme bağlantısı. AI anahtarından ayrı **tmdb.apiKey** mevcut safeStorage kasasında saklanır. `settings.json` içinde düz metin olmaz; genel yedek/içe aktarma anahtar taşımaz. Gizli alan takibi, temizleme listesi, export redaksiyonu ve yükleme/kayıt sözleşmesi genişletildi; yeni ayrı anahtar dosyası yok.

Katalog metadata arama/detay/sezon çağrıları, kullanıcı oturumluk farklı anahtar vermediyse main süreçteki kayıtlı TMDB anahtarını kullanır. Bilgi dili seçilir. Bearer Read Access Token ve 32hex v3 api_key desteklenir; hedef yalnız resmi api.themoviedb.org, afiş indirmesi image.tmdb.org. Kaynaklar: [TMDB application auth](https://developer.themoviedb.org/docs/authentication-application), [image basics](https://developer.themoviedb.org/docs/image-basics). Resmi dokümanlar bu tur okundu; üçüncü taraf kod/API anahtarı kopyalanmadı.

Afişi olmayan katalog yapımları ayar içinde filtrelenip doğrudan eşleştirme ekranına açılır. Doğru aday ve değişecek alanlar mevcut önizlemede seçilir; dolu değerler varsayılan seçilmez. İçe aktarılan TMDB veya IMDb kimliği varsa **Kimliği olanların eksik bilgilerini tamamla** en çok30kaydı işler. Bilinen TMDB ID ya da TMDB'nin IMDb find sonucunda tek aday şart; başlığa göre otomatik tahmin yok. Yalnız eksik synopsis/genres/cast/runtime/originalTitle/year/poster eklenir; mevcut başlık, puan/favori/izleme kaynağı/ilerleme korunur. Değişim kontrolü her remote await ve mevcut preview/apply kontrolüyle korunur. Modal kapanınca yeni kayda geçilmez; o anda yetkilendirilmiş mevcut kayıt tamamlanabilir. Çok büyük arşiv tek turda taranmaz;30'luk turlar kullanılabilir. Kimliksiz/çoklu aday elle eşleştirilir.

Katalog kapanışı afiş cache'ini temizleyip ana sayfayı yeniler. İndirilen afiş mevcut yerel poster deposuna yazılır, home kartında/hero'da gösterilir. Gerçek kullanıcı verilerinde eşleştirme/indirme bu tur yapılmadı, herhangi bir gerçek afişin kaydı izinsiz üzerine yazılmadı.

## Ek yaşam döngüsü onarımı

`media-catalog.js` close event içindeki eski açık-dialog dalı, handler kapsamında olmayan `options` değişkenine bakıyordu. Eski close eventi yeni açılmış dialogdan sonra gelirse ReferenceError üretebilirdi. Açık yeni dialog varsa eski close temizliğini atlama yeterli; undefined seçenek referansı kaldırıldı. Ayrıntı→metadata geçişi için `openMetadata(id)` mevcut open/reload/session kontrollerine bağlandı.

## Kanıtlar

- `node --test tests/tmdb-settings.test.js`: 3 geçti: kasa split/public export/import, locale+Bearer/v3 auth hedefi, bilinen/tekil kimlik çözümü ve tahmin reddi.
- `node tests/settings-security.test.js`:23mevcut kontrol geçti; secret input maskesi, schema/persist, backup ve transaction kontratları.
- `tests/catalog-roadmap.test.js`, `tests/media-catalog-service.test.js`, `tests/package-integrity.test.js`: geçti. `preload-usage-ratchet`:286export/7dormant/0kullanılmayan. Syntax ve diff geçti.
- `electron-app-settings.smoke.js`: önceki model/key/save/restore davranışları geçti (3loopback fixture çağrısı; dış sağlayıcı0).
- Yeni **electron-metadata-settings.smoke.js** gerçek Windows native Electron/main/IPC/disk: anahtarın settings.json'a düz yazılmaması, ayardan metadata geçişi, kayıtlı anahtarla search→detail→poster apply, ana sayfada afişin çıkması, ikinci bilinen TMDB-ID kaydını eksik alanlarla doldurma ve title/rating/favorite koruma. 5TMDB fixture yanıtı, **gerçek TMDB çağrısı0**.
- Son bu smoke kanıtı `.uiprev/metadata-settings/1792863662855-13872/`:1920×1080 TR koyu tek satır header +metadata pane;940×760 EN açık header. Görseller incelendi; test afişi sentetik tek-renkli pikseldir, gerçek film posteri gibi sunulmaz. Ana nav'da scrollWidth<=clientWidth, sayfa/gear sınırları kontrol edildi. Eski EN dropdown ve metin Settings yok; SVGgear var.
- İlk fixture film türü yanlışlıkla `movie` verilmişti; ürün `film` sözleşmesine düzeltildi. Bir arka-plan smoke'da IntersectionObserver posteri geciktirdi; önceki home smoke'daki disable-backgrounding/disable-renderer-backgrounding switches testte uygulandı ve son koşum geçti. Bu, kullanıcının tüm afişlerinin ürün hatası nedeniyle boş kaldığına dair kanıt sayılmadı. API poster verisinin varlığı ve native disk/okuma yolu ayrıca doğrulandı.

## Sınırlar / teslim

Gerçek TMDB credential verilmedi; ücretli/gerçek dış API, normal start.bat/CUDA/torrent/DRM bu tur denenmedi. Kullanıcı kendi TMDB anahtarını yeni bölüme girip eşleştirmelidir. Tam npm test/CI beklenmedi ve kapatılmadı. Mevcut API/TTS/Whisper modeli varsayılanları değişmedi. Ana kullanıcı checkout/master'a merge ve açık uygulamaya hot reload yapılmadı. Yeni dependency yok; settings şeması/secret alan listesine tmdb.apiKey+language eklendi, eski dosyalar yeni alan olmadan okunur. Ürün+docs ayrı commit ve normal push PR dalına.
