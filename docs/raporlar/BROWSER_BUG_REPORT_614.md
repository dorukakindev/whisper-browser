# Rapor 614 — Ana arayüzler, alt paneller ve üç doğrulanmış tasarım onarımı

26 Ekim 2026. Repo https://github.com/dorukakindev/whisper-browser. Dal `codex/ui-complete614`.
Başlangıç HEAD `93dcf5ef7416592b4cb839dd68ab00881af4ba61`; bitiş ürün commit'i `87b07765ab24bc136435d741890c39c216708563`.

## Sonuç

Yalnız önceki HTML raporunun ilk üç görüntüsüyle kalınmadı: 45 adlandırılmış ekran/menü hazırlığı × TR/koyu/1280, EN/koyu/1280, TR/açık/1280, TR/koyu/940 için **180 temel görüntü** alındı. Bu dört serinin bütün kontakt sayfaları görsel olarak incelendi. Her hazırlığın genel scope'u görünse bile bunu 45 bağımsız panelin veya tüm etkileşimlerin başarılı açıldığı şeklinde yorumlamadım; aşağıdaki istisnalar geçerlidir.

Ek koşumlar: ayarların manga/metadata/metin düzeltme/genel sayfaları; dolu kitap, müzik, radyo; boş/hatalı keşfet; tercihler; boş ana sayfa; dolu zevk profili; geniş ekran (1920 CSSpx) ve 940 DIP %125 yakınlaştırma modeli (752 CSSpx). Uzun başlık, afişsiz kart, modal altı ve kaydırma sonu örnekleri kullanıldı. Ek serilerin tüm kareleri tam çözünürlükte tek tek incelenmiş değildir; kontakt örnekler ve şüpheli hedef görüntüleri incelendi. Sayı, bug veya E2E başarı sayısı değildir.

Ayrıca Windows Electron üzerinde ayrı gerçek uygulama profiliyle mevcut PDF/okuyucu deneyimi smoke'u **geçti**: PDF açma, okuma/yan yana görünüm, sayfa aralığı, kontrollü WAV ile vurgu/konum, asistan kaynak bağlamı, dar ekran, EN/açık tema, çeviri araçları, TXT okuyucu ve ses üretim alanı. Gerçek model/GPU ses üretimi yapılmadı.

## Düzeltilenler

1. **Kart afişleri hizalanmıyordu.** `.mh-card` doğal button yerleşiminde, açıklama/öneri satırı eklenen kartın içeriğini komşularından farklı merkezliyordu. `media-home.css`: sütun flex ve başlangıç hizası. Gerçek Windows Electron/CSS fixture'ında önce 12,5px fark, sonra 1280/940 × açık/koyu dört durumda tüm afiş üstleri 99,333px. Gerçek keşfet DOM'u ve yüklenmiş PNG fixture afişleriyle son görüntü ayrıca incelendi. Tasarım, kart boyutu veya kaydırma sistemi değiştirilmedi.
2. **Sekme avatar harfleri düşük kontrastlıydı.** HSL arka planına temaya bağlı `--accent-contrast` kullanımı bazı renklerde AA altında kalıyordu. `browser-chrome.css`: beyaz harf token'ı + aynı hue ailesinde %28 lightness. 360 hue için teorik en düşük beyaz kontrastı yaklaşık **6,057:1**. Windows görüntülerinde dört hue ve iki tema kontrol edildi. Boş avatarın kendi nötr kuralı korunur.
3. **Metin düğmelerinin tıklama alanı dardı.** Genel `.link-btn` yaklaşık 18,67px yüksekti. `styles.css`: en az28px ve 4×6px iç boşluk. Koleksiyon/oynatıcı link renkleri de `var(--accent)` kullanır. Windows ölçümü28px; küçük metin görünümü korunur. Bu düzenleme bütün uygulamanın her hedefinin36/44px olduğu iddiası değildir.

## Testler ve gözlem ayrımı

- `node --test tests/media-home-model.test.js tests/player-chrome-css.test.js tests/css-hardcoded-colors.test.js`: **8/8 geçti**. İlk sandbox çalıştırmasında spawn EPERM vardı; yetkili çalıştırmada giderildi.
- Renk ratchet'i önce HEAD'de de426/424 başarısızdı; eşik yükseltilmedi. Aynı link renklerinin tokenlaştırılması ve avatar token'ıyla son sonuç **423/424**.
- `node tools/ui-smoke.mjs --strict --out tmp/ui614/interaction`: **83 tıklama,0 bulgu**. Bu koşum CSS editinden önceydi; sonraki CSS için native ölçüm ve hedefli kontroller kullanıldı. 83 tıklamayı tüm ürünün E2E kabulü saymıyorum.
- `node tools/audit-ui.mjs --surface player-mode --widths 1400 --strict --out tmp/ui614/player-audit`: TR/EN × açık/koyu, **0 kontrast bulgusu**. Gradienli/görselli arka planlarda otomatik kontrastın sınırları vardır.
- `electron.exe tests/electron-pdf-reader-experience.smoke.js`: sonuç dosyası `ok:true`. Gerçek yerel PDF ve sentetik WAV; GPU/sağlayıcı değil.
- Asistan overlay: 420/700px × TR/EN × açık/koyu; uzun konuşma, araçlar, hata/yeniden deneme için24 görüntü; sekiz konfigürasyonda Enter `send` eylemine ulaştı. Ağ/ücretli API yok. İlk açık tema karesindeki koyu düğme, tema geçişi bitince düzeldi; kalıcı bug diye sayılmadı.
- Stüdyo kaydırma şüphesi: 752/940/1280px'te gerçek DOM üzerinde `exportSettings.scrollIntoView()` sonrası düğme görünür ve `elementFromPoint` doğru hedef. Dar görünüm body üzerinden, geniş görünüm panel üzerinden kayıyor. Sadece ilk ekran altında kalması erişilemezlik değildir.
- `git diff --check` geçti. CSS dışında ürün davranışı/IPC/Python değişmedi; yeni bağımlılık kurulmadı.

## Kapsam matrisi — temel seri

| Hazırlık | Kapsam | Sınır / ek doğrulama |
|---|---|---|
| `home` | 4 yapılandırma | Yerleşim görüntüsü; fixture, canlı servis kabulü değil. |
| `home-tools-menu` | 4 yapılandırma | Menü yerleşimi açık state ile hazırlandı; kullanıcı tıklamaları ayrı mevcut smoke içinde. |
| `page-discover` | 4 yapılandırma | Yerleşim görüntüsü; fixture, canlı servis kabulü değil. |
| `page-discover-detail` | 4 yapılandırma | Yerleşim görüntüsü; fixture, canlı servis kabulü değil. |
| `page-films` | 4 yapılandırma | Yerleşim görüntüsü; fixture, canlı servis kabulü değil. |
| `page-series` | 4 yapılandırma | Yerleşim görüntüsü; fixture, canlı servis kabulü değil. |
| `page-recent` | 4 yapılandırma | Yerleşim görüntüsü; fixture, canlı servis kabulü değil. |
| `page-web` | 4 yapılandırma | Yerleşim görüntüsü; fixture, canlı servis kabulü değil. |
| `page-radio` | 4 yapılandırma | İlk fixture eksik; dolu müzik/kitap/radyo/zevk profili ek koşumla incelendi. |
| `page-taste` | 4 yapılandırma | İlk fixture eksik; dolu müzik/kitap/radyo/zevk profili ek koşumla incelendi. |
| `mode-music` | 4 yapılandırma | İlk fixture eksik; dolu müzik/kitap/radyo/zevk profili ek koşumla incelendi. |
| `mode-books` | 4 yapılandırma | İlk fixture eksik; dolu müzik/kitap/radyo/zevk profili ek koşumla incelendi. |
| `search-all` | 4 yapılandırma | Yerleşim görüntüsü; fixture, canlı servis kabulü değil. |
| `title-film` | 4 yapılandırma | Yerleşim görüntüsü; fixture, canlı servis kabulü değil. |
| `title-long` | 4 yapılandırma | Yerleşim görüntüsü; fixture, canlı servis kabulü değil. |
| `title-noposter` | 4 yapılandırma | Yerleşim görüntüsü; fixture, canlı servis kabulü değil. |
| `title-series` | 4 yapılandırma | Yerleşim görüntüsü; fixture, canlı servis kabulü değil. |
| `settings` | 4 yapılandırma | Yerleşim görüntüsü; fixture, canlı servis kabulü değil. |
| `catalog` | 4 yapılandırma | Yerleşim görüntüsü; fixture, canlı servis kabulü değil. |
| `media-hub` | 4 yapılandırma | Yerleşim görüntüsü; fixture, canlı servis kabulü değil. |
| `workflows` | 4 yapılandırma | İlk fixture servis yanıtı eksik; tam içerik başarısı sayılmadı. Üretim alanı ayrıca native PDF akışında incelendi. |
| `tools-tonight` | 4 yapılandırma | Yerleşim görüntüsü; fixture, canlı servis kabulü değil. |
| `tools-health` | 4 yapılandırma | Yerleşim görüntüsü; fixture, canlı servis kabulü değil. |
| `tools-decision` | 4 yapılandırma | İlk fixture servis yanıtı eksik; tam içerik başarısı sayılmadı. Üretim alanı ayrıca native PDF akışında incelendi. |
| `studio` | 4 yapılandırma | Yerleşim görüntüsü; fixture, canlı servis kabulü değil. |
| `dub-generator` | 4 yapılandırma | Yerleşim görüntüsü; fixture, canlı servis kabulü değil. |
| `browser-workspace` | 4 yapılandırma | Yerleşim görüntüsü; fixture, canlı servis kabulü değil. |
| `browser-address-results` | 4 yapılandırma | Yerleşim görüntüsü; fixture, canlı servis kabulü değil. |
| `browser-find` | 4 yapılandırma | Yerleşim görüntüsü; fixture, canlı servis kabulü değil. |
| `browser-places` | 4 yapılandırma | Yerleşim görüntüsü; fixture, canlı servis kabulü değil. |
| `browser-downloads` | 4 yapılandırma | Yerleşim görüntüsü; fixture, canlı servis kabulü değil. |
| `browser-qr` | 4 yapılandırma | Yerleşim görüntüsü; fixture, canlı servis kabulü değil. |
| `browser-command-palette` | 4 yapılandırma | Yerleşim görüntüsü; fixture, canlı servis kabulü değil. |
| `browser-more-menu` | 4 yapılandırma | Menü yerleşimi açık state ile hazırlandı; kullanıcı tıklamaları ayrı mevcut smoke içinde. |
| `browser-translate-menu` | 4 yapılandırma | Genel scope görünmesi panel açılışı kanıtı değil. Kısayol oyuncu modunda, çekmece ayrı açıldı; medya sinyali aktif kaynak olmadan doğrulanmadı. |
| `browser-page-quick` | 4 yapılandırma | Menü yerleşimi açık state ile hazırlandı; kullanıcı tıklamaları ayrı mevcut smoke içinde. |
| `browser-site-chip` | 4 yapılandırma | Menü yerleşimi açık state ile hazırlandı; kullanıcı tıklamaları ayrı mevcut smoke içinde. |
| `browser-sidebar` | 4 yapılandırma | Genel scope görünmesi panel açılışı kanıtı değil. Kısayol oyuncu modunda, çekmece ayrı açıldı; medya sinyali aktif kaynak olmadan doğrulanmadı. |
| `browser-signal` | 4 yapılandırma | Genel scope görünmesi panel açılışı kanıtı değil. Kısayol oyuncu modunda, çekmece ayrı açıldı; medya sinyali aktif kaynak olmadan doğrulanmadı. |
| `browser-settings` | 4 yapılandırma | Yerleşim görüntüsü; fixture, canlı servis kabulü değil. |
| `browser-view-settings` | 4 yapılandırma | Yerleşim görüntüsü; fixture, canlı servis kabulü değil. |
| `shortcut-help` | 4 yapılandırma | Genel scope görünmesi panel açılışı kanıtı değil. Kısayol oyuncu modunda, çekmece ayrı açıldı; medya sinyali aktif kaynak olmadan doğrulanmadı. |
| `player-task-center` | 4 yapılandırma | Yerleşim görüntüsü; fixture, canlı servis kabulü değil. |
| `player-mode` | 4 yapılandırma | Yerleşim görüntüsü; fixture, canlı servis kabulü değil. |
| `app-dialog-confirm` | 4 yapılandırma | Yerleşim görüntüsü; fixture, canlı servis kabulü değil. |

## Ek görülen yüzeyler

Ayarlar: AI, manga, TMDB/afiş, metin düzeltme, görünüm/araçlar; üst ve alt içerik. Keşfet: boş sonuç, kontrollü ağ hatası, tercihler ve uzun açıklamalı ayrıntı. Kitap/müzik/radyo: geçerli sentetik kayıtlarla kart ve eylemler. Zevk profili: dağılım, türler, tercihler, yorum bölümü ve sayfa sonu (fixture'ın decades/months alanları tamamlandıktan sonra). Dublaj: bütün details açık, ilk/son içerik ve sabit footer. Okuyucu: yukarıdaki native akış.

Ek sekiz pencere: Whisper gelişmiş ayarları, sonuç modalı, Whisper+çeviri aralığı, kaynak/oynatma çekmecesi, oyuncu kısayolları, YouTube ve Invidious giriş formu yerleşimleri, altyazı menüsü tıklama denemesi. Sonuç/giriş pencerelerinde yalnız görünüm için state açıldı; gerçek iş tamamlanması veya OAuth kabulü değildir. Browser altyazı menüsü, bu fixture başlatma durumunda bağımsız bir popover olarak güvenle doğrulanamadı; genel browser scope başarısı bunu örtmez.

## Kalanlar / başarı sayılmayanlar

- Gerçek YouTube oturumu/reklam/Cloudflare/DRM, canlı Letterboxd/TMDB ve sağlayıcı çeviri/arama; GPU/CUDA, model ses kalitesi, işletim sistemi dosya seçici bu turun kabulü değil. Testlerde kişisel profil/anahtar kullanılmadı.
- Her olası medya, loading/streaming/iptal durumu ve bütün kombinasyonlar tüketilmedi. Bu rapor **her şey kusursuz** iddiası değildir.
- Metin/TXT stüdyosu ayrı süreçtir; bu turdaki dublaj penceresi ve kitap üretim alanı görüntüleri o ayrı uygulamanın bütün kontrollerinin test edildiği anlamına gelmez.
- Tarihsel geniş `book-reliability` smoke'undaki zoom-layout timeout'u bu turda tekrar koşulmadı/çözüldü sayılmadı. Daha dar PDF deneyim smoke'u geçti.
- Kaynakta tekil Unicode/variation-selector artıkları, bazı9–11px yardımcı yazılar ve stüdyo ile medya alanlarının farklı görsel dili hâlâ ayrı tasarım çalışmasıdır; sayı doldurmak için yeni kritik bug sayılmadı.
- `tools/audit-ui.mjs` varsayılanının çoğu yüzeyi1400px'e daralttığı görüldü; bu tur özel matrisle aşıldı, araç kaynak kodu değiştirilmedi.

## Kanıtların yeri ve tekrar

Ham sentetik görüntüler, test profilleri ve geçici denetim kodu Git dışı: `D:/Whisper Local/tmp/audit470/tmp/ui614/`; native PDF `.uiprev/pdf-reader547-1793031609675/`; native CSS `.uiprev/design614-1793031913641/`. `results`, `extra-results`, `post-results`, `auxiliary-results`, `followup-results`, `final-results`, `assistant-results` ayrı turlardır. İlk harness'ta çağrılmamış hazırlık fonksiyonları ve hatalı SVG/PNG MIME fixture'ı düzeltilerek yeniden koşuldu; o başarısız denemeler ürün kanıtı değildir. Dosya kodlaması her Python JSON okumasındaUTF-8 olarak açıklandı; Windows AUX ayrılmış dosya adı denemesi çalışma betiğinde giderildi.

Uygulama kişisel penceresi kapatılmadı. `start.bat` değişmedi; native smoke ayrı Electron başlatıcısıdır, normal start.bat/GPU açılış testi değildir. Ana kopyaya kod PR/master teslimiyle alınır; açık uygulama eski renderer'ı tutabileceğinden yeni görünüm için normal yeniden açılış gerekir. CI açık kalır, sonucu beklenmez veya görülmeden geçti denmez.
