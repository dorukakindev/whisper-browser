# R842 Browser: web içeriğini medya kütüphanesine bağlayan 18 mekanizma

Sabit yerel ürün tabanı `df972383ab5a9b736b832ba64401b206beb6dedc`. **9 NEW + 9 OLD-DEEPENING; uygulama/kurulum/UI kabulü yok.** Yedi repo: Omnivore/Steel/WXT karşılaştırılan raporlarda yeni ayrıntılı kaynak incelemeleri; wallabag/ArchiveBox R76 satır 442’de adı geçmiş, bu tur ilk adlandırma değil yeni ayrıntılı kaynak okuması; Stagehand/browser-use R839 derinleşmesidir. 18 kart 18 bağımsız büyük özellik değildir; 05–06 import ailesi ve 11–15 sınırlı browser görevi ailesi olarak birlikte değerlendirilir.

Öncelikli küçük rota: mevcut Browser’dan prepared-document + typed draft + kullanıcı önizlemesi + kütüphane kaydı. Sonra tamamlanan indirme devri ve eski okuma arşivi ithali. Haricî extension, browser replay ve oturum taşıma ayrı büyük pilotlardır. RSS/podcast transport hattı bu alt çalışmanın kapsamı dışında; mevcut YouTubeAtom/OPML ve podcast servisleri yok sayılmadı.

Kaynak dosyaları ignored cache’te; bu dizinde üçüncü taraf kod gövdesi yayımlanmaz. Tüm linkler tam HEAD’ye sabitlenmiştir. NEW ayrımı R75/R76/R838/R839/R841 önceki araştırmayla karşılaştırmadır; bütün tarihsel raporlara göre ilk keşif garantisi değildir. Kabul maddeleri gelecekteki pilot içindir; başarılı test sonucu değildir.

## Depo ve edinim sınırları

- [browser-use/browser-use](https://github.com/browser-use/browser-use/tree/b49a68e4060acb226da8f784194fef301c53a6d7): `b49a68e4060acb226da8f784194fef301c53a6d7`, MIT, HEAD 2026-10-30T04:28:48Z, archived=False. Previously studied R839; Python/CDP agent stack, selected runtime extraction/download path only.
- [browserbase/stagehand](https://github.com/browserbase/stagehand/tree/b7a4b899079f198a0ee78a6dcb62ad02f545cf49): `b7a4b899079f198a0ee78a6dcb62ad02f545cf49`, MIT, HEAD 2026-10-30T01:04:01Z, archived=False. Same pinned HEAD already read in R839; new repository discovery count zero.
- [ArchiveBox/ArchiveBox](https://github.com/ArchiveBox/ArchiveBox/tree/09041760bc0fe25eb584e62cc9c7756e85ff855e): `09041760bc0fe25eb584e62cc9c7756e85ff855e`, MIT, HEAD 2026-11-01T10:53:41Z, archived=False. Default dev; pyproject 0.9.78rc48 and Python >=3.13; not compatible as-is with Whisper Python3.10/3.11 venv.
- [wallabag/wallabag](https://github.com/wallabag/wallabag/tree/42033e0253e74281c9f7588146324ab7222c3592): `42033e0253e74281c9f7588146324ab7222c3592`, MIT, HEAD 2026-10-30T17:16:16Z, archived=False. PHP/Symfony service; adapt selected model/parser concepts rather than add PHP server.
- [omnivore-app/omnivore](https://github.com/omnivore-app/omnivore/tree/29de91e8e43d8f546af398b6b0138dc6aba052bc): `29de91e8e43d8f546af398b6b0138dc6aba052bc`, AGPL-3.0, HEAD 2026-10-26T20:05:40Z, archived=False. README: cloud deprecated November2024; completely self-hosted, community bugfix aim; recent HEAD does not verify hosted service or maintenance quality.
- [steel-dev/steel-browser](https://github.com/steel-dev/steel-browser/tree/9fb9b9239325794b3e2d2a56c7e54c400a7d30bd): `9fb9b9239325794b3e2d2a56c7e54c400a7d30bd`, Apache-2.0, HEAD 2026-10-31T22:53:08Z, archived=False. API0.5.4 private ESM package; scripts contain POSIX mkdir/cp; Windows direct install not verified.
- [wxt-dev/wxt](https://github.com/wxt-dev/wxt/tree/66897f0d189ae9236d40a08ecea329c2455444a6): `66897f0d189ae9236d40a08ecea329c2455444a6`, MIT, HEAD 2026-11-01T10:47:52Z, archived=False. Extension framework, not complete capture product or Native Messaging bridge.

Kök lisanslar incelendi; transitif bağımlılık/model/haricî veri lisanslarının tamamı incelenmedi. MIT/Apache notice yükümlülükleri korunur; AGPL peşinen elenmez fakat doğrudan kod alma ile bağımsız tasarım ayrılır. Omnivore EPUB dosyası PSPDFKit ve epubjs import ediyor; AGPL kök lisansı bu üçüncü taraf SDK kullanım hakkını otomatik vermez. Steel PDF MuPDF yolu da ayrı lisans incelemesi ister. Asıl kullanım hedefi Windows; bu tur native UI/DPI/GPU/DRM, install.bat/start.bat veya upstream uygulama çalıştırılmadı.

## Kartlar

### B842-01 — Açık sayfadan tekrar giriş istemeden gerçek okuma kaydı

**OLD-DEEPENING** · Önceki: R76-6.4, B841-11, R839-A01 · Orta: 3–5 gün pilot

**Sabit kaynak:** [omnivore-app/omnivore — packages/api/src/services/save_page.ts:77](https://github.com/omnivore-app/omnivore/blob/29de91e8e43d8f546af398b6b0138dc6aba052bc/packages/api/src/services/save_page.ts#L77), `export const savePage`.

**Kodda gözlenen:** savePage istemcinin originalContent alanını PreparedDocumentInput olarak parsePreparedContent yoluna veriyor; FORCE_PUPPETEER_URLS bazı kaynakları yeniden backend okumaya yönlendiriyor. Her URL için istemci HTML’i yeterlidir iddiası yok.

**Ürün sentezi:** Film röportajını açık sekmenin görülen revizyonundan alıp okunabilir makale varlığı olarak kütüphaneye ekleme; kaynak sayfa ve makale kimliği ayrı, kullanıcı hangi metni aldığını önizler.

**Bizde farkı:** BrowserReadingList.prepare/commit MHTML kaydediyor; runBrowserPageIndexCapture okunabilir arama metni yakalıyor. R76§6.4 MHTML+page-index birleşimini, B841-11 kaynak paketini zaten önermişti. Ayrı makale lifecycle’ının üründe bulunmadığı kanıtlanmadığından NEW sayılmıyor; prepared-document edinim sözleşmesi bu fikrin derinleşmesidir.

**Edinim rotası:** AGPL-3.0 kaynak; doğrudan uyarlama için dağıtım şartları değerlendirilir. Önce bağımsız prepared-document sözleşmesi, mevcut reader/parser hattı; tüm Omnivore servisi eklenmez.

**Medya deneyimi:** Grafit panelde başlık, kaynak, metin önizlemesi ve filmle ilişkilendir eylemi; EN/TR etiket. Kaydetmeden model gerekmez.

**Gelecek kabulü:** Girişli örnek sayfa yeniden ağ isteği gerektirmeden seçilmiş metni kaydeder; SPA sayfa değişirse önceki revizyon yanlış filmle bağlanmaz; iptalde kayıt oluşmaz.

**Sınırlar:** Windows WebContents yakalama ve büyük HTML sınırı gerekir; CSP temizlenmiş içerik ister. Paywall/DRM aşma veya bütün site uyumu doğrulanmadı.

### B842-02 — Haricî Edge/Chrome’dan medya kütüphanesine tek seferlik gönderim

**NEW** · Önceki: Yakın raporlarda eş mekanizma bulunmadı · Büyük: 1–2 hafta pilot

**Sabit kaynak:** [wxt-dev/wxt — packages/wxt/src/utils/content-script-ui/shadow-root.ts:20](https://github.com/wxt-dev/wxt/blob/66897f0d189ae9236d40a08ecea329c2455444a6/packages/wxt/src/utils/content-script-ui/shadow-root.ts#L20), `export async function createShadowRootUi`.

**Kodda gözlenen:** createShadowRootUi izole stil, mount/remove ve context invalidation temizliği içeriyor. ContentScriptContext eski betikleri durduruyor; demo locationchange dinliyor. WXT hazır Whisper köprüsü veya sayfa kaydetme ürünü değil.

**Ürün sentezi:** Kullanıcının normal tarayıcısında seçtiği röportajı, altyazı bağlantısını veya festival programını Whisper gelen kutusuna gönderen küçük companion extension. Tam tarayıcıyı değiştirmek gerekmez.

**Bizde farkı:** preload/main yalnız uygulama içi IPC sağlar; browser-session-package uygulama oturumu taşır. Haricî tarayıcıdan kullanıcı seçimiyle gelen payload için ayrı giriş adaptörü gerekecek.

**Edinim rotası:** MIT WXT ile ayrı paket prototipi; Native Messaging veya açık paket dosyası yolunu önce karşılaştır. Masaüstü protokol kaydı bu araştırmada yapılmadı.

**Medya deneyimi:** Sayfa üstü küçük grafit/amber önizleme; kaynak adı, seçili metin ve hedef film görünür. Kaydet kullanıcı eylemidir; bütün sekmeler otomatik okunmaz.

**Gelecek kabulü:** Edge SPA gezinmesinde iki kopya buton oluşmaz; gönderilen URL/metin tek öğeye bağlanır; Whisper kapalıysa kullanıcıya tekrar açılabilir bekleyen paket kalır.

**Sınırlar:** Windows Native Messaging kayıt/kurulum ve CSP ayrıca doğrulanır; extension store dağıtımı, mobile ve Firefox uyumu kabul edilmedi. Sağlayıcı anahtarı extension’a taşınmaz.

### B842-03 — Web PDF’sini sayfa metni sanmadan dosya ve okunabilir belge olarak alma

**NEW** · Önceki: Yakın raporlarda eş mekanizma bulunmadı · Orta: 4–6 gün

**Sabit kaynak:** [steel-dev/steel-browser — api/src/modules/actions/actions.controller.ts:75](https://github.com/steel-dev/steel-browser/blob/9fb9b9239325794b3e2d2a56c7e54c400a7d30bd/api/src/modules/actions/actions.controller.ts#L75), `export const handleScrape`.

**Kodda gözlenen:** handleScrape safeGoto sonucunu ve content-type’ı kullanarak PDF/JSON/HTML yollarını ayırıyor; PDF fetchPdf ile alınarak MuPDF dönüşümü ve metadata/links üretiliyor. pdfAcquisition kaynak yöntemi kaydediliyor.

**Ürün sentezi:** Film basın dosyası veya senaryo PDF’si Browser’dan kaydedilirken belge öğesi, özgün dosya ve okunabilir metin ilişkili oluşur; asistan boş PDF-viewer DOM’unu özetlemez.

**Bizde farkı:** main whisper-pdf protokolü ve mevcut PDF reader/çeviri hattı, media shelf PDF/EPUB içeriyor. Eksik olduğu iddia edilen PDF desteği değil; web yakalama ile bu dosya kimliğine tür temelli devir.

**Edinim rotası:** Apache-2.0 Steel algoritma referansı; fetch ve mevcut PDF araçlarına küçük adaptör. MuPDF ticari/AGPL koşulları ayrıca incelenmeden paket alınmaz.

**Medya deneyimi:** Kütüphanede belge rozeti, sayfa sayısı ve özgün kaynak; PDF oku ve metinle sor aynı kartta.

**Gelecek kabulü:** application/pdf dönen uzantısız URL PDF olarak ele alınır; özgün URL, indirilen byte ve okuyucu kimliği eşleşir; bozuk belge boş başarı dönmez.

**Sınırlar:** Windows dosya izinleri ve Türkçe adlar, kaynak oturumuyla fetch ayrı kabul gerekir. DRM/erişim hakkı engeli aşılmaz; PDF düzeni doğruluğu ölçülmedi.

### B842-04 — Tamamlanan indirmeyi kaynağıyla kütüphane taslağına devretme

**NEW** · Önceki: Yakın raporlarda eş mekanizma bulunmadı · Orta: 3–5 gün

**Sabit kaynak:** [browser-use/browser-use — browser_use/browser/watchdogs/downloads_watchdog.py:937](https://github.com/browser-use/browser-use/blob/b49a68e4060acb226da8f784194fef301c53a6d7/browser_use/browser/watchdogs/downloads_watchdog.py#L937), `async def _handle_cdp_download`.

**Kodda gözlenen:** DownloadsWatchdog CDP indirme yaşam döngüsü ve son dosya yolunu takip ediyor; tools.service içindeki done yalnız gerçek session downloads listesini ek olarak iliştiriyor. İndirme başlatıldı ile çıktı var ayrımı kodda var.

**Ürün sentezi:** Asistanın bulduğu yasal fragman, söyleşi sesi, EPUB veya altyazı indirildiğinde bir import taslağı: kaynak URL, yerel dosya ve bağlanacak film; dosya seçiciyi tekrar gezmeden kütüphaneye ekle.

**Bizde farkı:** createBrowserDownloads zaten progress/pause/resume/reveal/open-player ve terminal kalıcılığı sunuyor; URL/cookie bilerek tutmuyor. Yenilik indirme yönetimi değil, kısa ömürlü provenance→kütüphane devri.

**Edinim rotası:** MIT mekanizma Node/Electron will-download sonlandırıcısına uyarlanır; Python watchdog veya bütün browser-use bağımlılığı alınmaz.

**Medya deneyimi:** Bitti kartında oynat yanında kütüphaneye ekle; kitap PDF/EPUB, video oynatıcı, altyazı ilgili medya rotasına gider.

**Gelecek kabulü:** Kesilen indirme öğe üretmez; taşınan dosya yeniden bulunabilir; aynı indirme iki kez eklenmez; mevcut native overwrite diyaloğu sürer.

**Sınırlar:** Windows uzun/Türkçe dosya yolları ve dosya türü doğrulanır. İndirme yetkisi otomatik transkripsiyon/model ücretine izin sayılmaz; provider çağrısı ayrı eylem.

### B842-05 — Bir sayfa listesini eklemeden önce gerçek örnekleri gösterme

**NEW** · Önceki: Yakın raporlarda eş mekanizma bulunmadı · Orta: 4–6 gün; B842-06 ile aynı aile

**Sabit kaynak:** [ArchiveBox/ArchiveBox — archivebox/importers/service.py:32](https://github.com/ArchiveBox/ArchiveBox/blob/09041760bc0fe25eb584e62cc9c7756e85ff855e/archivebox/importers/service.py#L32), `def enqueue(`.

**Kodda gözlenen:** enqueue PREVIEW için limiti min(source.limit,20) yapıyor; feed/settings/checkpoint request snapshot’ı oluşturuyor. Uygun başarılı preview sayısı gerçek import isteğine eklenebiliyor.

**Ürün sentezi:** Bir yönetmen röportajları listesinde önce en çok 20 aday başlık, tür ve URL; kullanıcı film ilişkilerini ve hariç bırakacaklarını seçtikten sonra gerçek toplu kütüphane alma. Gizli crawl yerine reviewable aday listesi.

**Bizde farkı:** assistant-browser-research ilk4 arama URL’sinden3 sayfa okuyor; koleksiyon üyeliği hazır. Bu pilot kaynak keşif grafiği değil, seçilmiş importer çıktısının önizleme/commit ayrımı.

**Edinim rotası:** MIT iş modeli bağımsız Node sözleşmesine port edilir. ArchiveBox dev Python>=3.13/Django servisi mevcut Whisper venv’ine kurulmaz.

**Medya deneyimi:** Önizleme tablosu film, kaynak türü, tahmini boyut, alınacak/atlanacak; asistan yalnız taslağı üretir.

**Gelecek kabulü:** Önizleme dosya indirme veya kütüphane yazımı yapmaz; seçim değişince commit yalnız son listeyi alır;20 üstü örnek tamlık iddiası olmaz.

**Sınırlar:** Kaynak importer bağımlılıkları ve site koşulları ayrıca incelenir. Windows subprocess yolu yeni servis alınırsa risk; bu öneride ağ/main adaptörü ve provider bütçesi sınırlı.

### B842-06 — Büyük kütüphane ithalini kaldığı öğeden devam ettirme

**NEW** · Önceki: Yakın raporlarda eş mekanizma bulunmadı · Orta/büyük: 1 hafta; B842-05 bağımlılığı

**Sabit kaynak:** [ArchiveBox/ArchiveBox — archivebox/importers/service.py:166](https://github.com/ArchiveBox/ArchiveBox/blob/09041760bc0fe25eb584e62cc9c7756e85ff855e/archivebox/importers/service.py#L166), `def _finish(`.

**Kodda gözlenen:** _finish başarılı importer sonucunu, hesabı, checkpoint’i ve crawl enqueue işlemini kısa transaction içinde bağlıyor; cancelled iş checkpoint ilerletmiyor. has_more varsa güncel checkpoint ile sonraki run üretiliyor; recover_interrupted da mevcut.

**Ürün sentezi:** Yüzlerce eski röportaj/bookmark içe alımında kapanma sonrası kalan öğeler devam eder; bitmiş/atlanmış/hatalı öğeler tek import oturumunda görünür. Genel web crawl önceliklendirmesinden farklı kalıcı aktarım durumu.

**Bizde farkı:** BrowserReadingList revizyon korur; medya kuyrukları mevcut. Seçilmiş dış kütüphane importunun cursor ve sonuç günlüğü bunlara bağlanacak yeni sözleşme.

**Edinim rotası:** MIT transaction/checkpoint deseni Node SQLite portu; ArchiveBox çalışan servisi gerekmiyor. Başlangıçta tek dosya importer ve mevcut scheduler kullanılır.

**Medya deneyimi:** Gelen kutusunda120/300alındı,18atlandı,2yeniden dene; kullanıcı filtreleyip kalanlardan devam eder.

**Gelecek kabulü:** İşlem ortasında kapanıp açılınca önceki öğeler çoğalmaz; iptal edilen batch cursor ilerletmez; hatalı öğe tüm ithali durdurmaz.

**Sınırlar:** Windows atomik kayıt ve uygulama kapanışı kabul edilmeli. Sağlayıcı kapalıyken import sürmeli; model önerisi başarısı veri taşıma başarısı değildir.

### B842-07 — Omnivore ve Pocket arşivlerini tarih/etiket/okundu bilgisiyle alma

**NEW** · Önceki: Yakın raporlarda eş mekanizma bulunmadı · Orta: 3–5 gün

**Sabit kaynak:** [wallabag/wallabag — src/Import/OmnivoreImport.php:80](https://github.com/wallabag/wallabag/blob/42033e0253e74281c9f7588146324ab7222c3592/src/Import/OmnivoreImport.php#L80), `public function parseEntry`.

**Kodda gözlenen:** OmnivoreImport URL+user ile mevcut kaydı atlıyor; title,Archived state,savedAt,labels,author,publishedAt,thumbnail alanlarını Entry’ye taşıyor. PocketCsvImport ayrıca CSV title/url/time/tags/archive alanlarını parse ediyor; annotation tamlığı bu kodda yok.

**Ürün sentezi:** Kullanıcının yıllardır topladığı sinema yazılarını boş URL listesine indirmeden medya araştırma kütüphanesine göç ettirme; film eşleştirmesi önce öneri kalır.

**Bizde farkı:** browser-session-package Whisper’ın kendi version1 paketini taşır; subscriptions-io OPML YouTube kanalı ve CSV araçları başka kapsam. Bunlar Omnivore/Pocket alan eşleme adaptörü kabulü değildir.

**Edinim rotası:** MIT PHP eşleme mantığı Node importer’a port edilebilir; export biçimi fixture ile sabitlenir. Wallabag sunucusu kurulmaz.

**Medya deneyimi:** İçe alma özeti yeni/aynı URL/bozuk tarih/eksik içerik sayıları; eski okundu durumu yeni izleme geçmişine dönüştürülmez.

**Gelecek kabulü:** Aynı dosya ikinci kez alınınca çoğalmaz; Türkçe başlık ve tarih korunur; görünmeyen notların taşındığı iddia edilmez; mevcut kullanıcı notu ezilmez.

**Sınırlar:** Windows UTF-8/BOM ve CSV alıntıları kabul gerekir. Ağ yeniden fetch başarısızlığı eski metadata’yı kaybettirmemeli; kapatılan Omnivore cloud servisine bağımlılık kurulmaz.

### B842-08 — Film araştırma dosyasını bölüm bölüm EPUB antolojisi yapma

**NEW** · Önceki: Yakın raporlarda eş mekanizma bulunmadı · Orta/büyük: 1 hafta

**Sabit kaynak:** [wallabag/wallabag — src/Helper/EntriesExport.php:148](https://github.com/wallabag/wallabag/blob/42033e0253e74281c9f7588146324ab7222c3592/src/Helper/EntriesExport.php#L148), `private function produceEpub`.

**Kodda gözlenen:** produceEpub birden çok Entry için yazar/tarih/URL/etiket metadata kapağı ve ayrı içerik chapter oluşturuyor; BCP47 dil dönüşümü ve setIdentifier var. Tek kayıt için preview cover seçilebiliyor.

**Ürün sentezi:** Bir filmin röportaj, eleştiri ve yapım notlarını kaynakları korunmuş taşınabilir okuma dosyasına dönüştürme; filmden önce/sonra okunacak bölümler kullanıcı sırasıyla bir araya gelir.

**Bizde farkı:** Mevcut media shelf EPUB okur; browser-research-notebook Markdown dışa aktarır, session package oturum taşır. Fark kitap okuma değil, seçilmiş web kaynaklarını kaynaklı EPUB üretimi.

**Edinim rotası:** MIT bölümleme modeli port edilir; PHPePub ve her asset lisansı ayrıca incelenmeden kopyalanmaz. Mevcut EPUB araçlarını önce araştır; genel PHP runtime ekleme.

**Medya deneyimi:** Dışa aktar önizlemesinde bölüm sırası, dahil metin/notlar ve eksik offline görseller; kütüphaneye geri ekleme isteğe bağlı.

**Gelecek kabulü:** Üç yazı üç kaynak URL’li bölüm olur; Türkçe karakter ve EN/TR başlıklar Windows EPUB okuyucusunda doğrulanır; eksik görsel kitabı bozmaz.

**Sınırlar:** Yeniden dağıtım hakkı kaynak içeriğe bağlı; export özel kullanım seçimiyle sınırlandırılır. DRM kitap üretme/aşma yok. Hiçbir EPUB bu araştırmada render edilmedi.

### B842-09 — Okumaya kalan süreyi medya seçimine katma

**NEW** · Önceki: Yakın raporlarda eş mekanizma bulunmadı · Küçük/orta: 2–3 gün

**Sabit kaynak:** [wallabag/wallabag — src/Form/Type/EntryFilterType.php:33](https://github.com/wallabag/wallabag/blob/42033e0253e74281c9f7588146324ab7222c3592/src/Form/Type/EntryFilterType.php#L33), `public function buildForm`.

**Kodda gözlenen:** EntryFilterType readingTime aralığını kullanıcının readingSpeed değeriyle ölçekleyip alt/üst/between koşullarına çeviriyor. Entry süre alanını, EntriesExport aynı kullanıcıya göre gösterimi içeriyor.

**Ürün sentezi:** Asistana20dakikam var dendiğinde10dakikalık röportaj okuması ile8dakikalık video arasında açıklanabilir seçenek; kalan süre, toplam süre ve tahmin niteliği ayrı gösterilir.

**Bizde farkı:** watch-index duration/position ve media shelf okuma konumu var. R76§5.3 TTS, §6.4 offline listeyi içerir; readingSpeed ile ölçeklenen okuma süresi aralık sorgusu bulunmadı. NEW burada genel okuma/süre rozeti değil, kelime sayısı ve açık hızla hesaplanan aralık filtresidir.

**Edinim rotası:** MIT filtre hesabı port adayı; kullanıcı okuma hızını istemezse varsayılan ve tahmin etiketi. Ölçüm olmadan kişisel hız öğrenildi iddiası yok.

**Medya deneyimi:** Süre filtresi5/15/30dakika; asistan önerisinde9dk okuma, yaklaşık etiketi ve kaynak türü.

**Gelecek kabulü:** Alt/üst/açık uçlu filtreler aynı ölçeği kullanır; okunmuş kısım kalan süreden düşer; bilinmeyen süre sıfır gösterilmez.

**Sınırlar:** Windows dar panel/DPI ve iki dil etiketleri kabul edilir; öğrenme/kelime ezberi ürünü değildir. Provider gerekmez; gerçek okuma hızının doğruluğu bu kaynakla kanıtlanmaz.

### B842-10 — Kaynak yenilenirken kullanıcının düzelttiği medya bilgisini koruma

**OLD-DEEPENING** · Önceki: B841-22 · Orta: 3–5 gün

**Sabit kaynak:** [wallabag/wallabag — src/Helper/ContentProxy.php:43](https://github.com/wallabag/wallabag/blob/42033e0253e74281c9f7588146324ab7222c3592/src/Helper/ContentProxy.php#L43), `public function updateEntry`.

**Kodda gözlenen:** updateEntry prefetched HTML’i cleanup yoluna verir; fetching error durumunda ithal metadata’yı korur, başarılı fetch’te içerik alanlarını birleştirir. Başlık sanitizasyonu, URL ve givenUrl ayrıca saklanır.

**Ürün sentezi:** Yanlış röportaj başlığını/yazarını kullanıcı düzelttiğinde yenileme bunları sessizce değiştirmesin; yeni gelen değer ile kullanıcı değeri alan bazında karşılaştırılsın. Bu son alan provenance UI’sı ürün sentezidir.

**Bizde farkı:** BrowserReadingList.refreshTarget aynı canonical URL koşulunu ve revizyonu kontrol eder. R841 güncellik önerisine ek değer kaynak durumundan alan sahipliğine inen merge sözleşmesi.

**Edinim rotası:** MIT merge modeli uyarlama adayı; ayrı extractor sonucu ve curated alanlar şeması. Bütün ContentProxy/Graby bağımlılığı alınmaz.

**Medya deneyimi:** Başlık yanında kullanıcı düzeltmesi; yenilemede3metadata değişikliği önizleme ve kabul; notlar ayrı.

**Gelecek kabulü:** Yenileme hatasında eski başlık/not kaybolmaz; otomatik veri kullanıcı düzeltmesini ezmez; canonical değişim aynı film varsayılmaz.

**Sınırlar:** Windows dosya revizyonu/UTF-8 ve CSP temizliği ayrıca gerekir. Kaynak parser doğruluğu veya tüm yönlendirmeler bu okumayla kabul edilmedi; model metadata’yı doğrulanmış gerçek yapmaz.

### B842-11 — Tekrarlanan sayfa görevini DOM uygunsa model çağırmadan yürütme

**OLD-DEEPENING** · Önceki: R839-A02, R839-A07 · Büyük: 1–2 hafta pilot

**Sabit kaynak:** [browserbase/stagehand — packages/extension/services/cacheService.ts:202](https://github.com/browserbase/stagehand/blob/b7a4b899079f198a0ee78a6dcb62ad02f545cf49/packages/extension/services/cacheService.ts#L202), `export async function withCache`.

**Kodda gözlenen:** withCache CDP accessibility tree toplayıp API cache sorgular; observe/extract hit’i doğrudan döner, act hit’i replay eder. onHit dahil başarısızlık execute yoluna düşer; replay_failed metadata ayrılır.

**Ürün sentezi:** Aynı festival programından her seferinde aynı alanları alma gibi kullanıcı başlattığı görevlerde doğrulanmış akış yeniden kullanılır; sayfa değişince yeni keşif. Genel otomasyon değil küçük, gözlenebilir tarif.

**Bizde farkı:** browserAutomationOperationKey altyazı çevirisini tekrar başlatmayı engeller; assistant-browser-research sayfaları yeniden okur. Fark iş dedup değil, DOM koşullu extractor/eylem replay.

**Edinim rotası:** MIT küçük local cache adaptörü; Stagehand uzaktaki cache API sözleşmesi Electron’da hazır servis değildir. Cache key/provenance uygulamaya özgü kurulmalı.

**Medya deneyimi:** Görev kartında hazır tarif kullanıldı veya sayfa değişti, yeniden okundu; kullanıcı tarif içeriğini görebilir.

**Gelecek kabulü:** Aynı sayfada ikinci okuma model çağrısını azaltır; DOM değişince yanlış alan doldurulmaz; replay başarısı gerçek son koşulla doğrulanır.

**Sınırlar:** Windows CDP/Electron sürüm uyumu ve CSP API sınırı gerekir; cloud/provider maliyeti ayrı. Cache’e girişli sayfa sırları veya key yazılmaz; öneri çalışma zamanı kabulü değildir.

### B842-12 — Sayfadan serbest özet yerine denetlenebilir medya kayıt şeması

**OLD-DEEPENING** · Önceki: R839-A02, B841-20 · Orta: 4–6 gün

**Sabit kaynak:** [browser-use/browser-use — browser_use/tools/extraction/schema_utils.py:145](https://github.com/browser-use/browser-use/blob/b49a68e4060acb226da8f784194fef301c53a6d7/browser_use/tools/extraction/schema_utils.py#L145), `def schema_dict_to_pydantic_model`.

**Kodda gözlenen:** schema_dict_to_pydantic_model JSON Schema’dan runtime Pydantic modeli kuruyor; _StrictBase extra=forbid. $ref/anyOf/oneOf gibi unsupported desenler açık reddediliyor; tam JSON Schema uygulaması değil.

**Ürün sentezi:** Röportaj sayfasından başlık,yazar,yayın tarihi,video URL,kaynak pasajı gibi küçük şema; boş alan null/unknown kalır. Film eşleştirme asistan önerisi, kullanıcı kabulüyle mevcut ID’ye bağlanır.

**Bizde farkı:** assistant-browser-research title/url/text kesitleri döndürüyor; kaynak bağlam manifesti hazır. Yeni pilot bu kesiti typed library-draft sonucuna dönüştürür; doğrudan katalog yazmaz.

**Edinim rotası:** MIT şema yaklaşımı mevcut Node doğrulayıcıyla bağımsız uygulanır; Python Pydantic çevrimini uygulamaya eklemek gerekmez.

**Medya deneyimi:** Kaydetmeden alanlar düzenlenir; her alanın sayfadaki kanıtı açılır; çıkarılamayan tarih hayal edilmez.

**Gelecek kabulü:** Yanlış tip/extra alan reddedilir; belirlenemeyen film kimliği otomatik birleşmez;20kısmi örnekte başarı ve eksik alan oranı ayrı raporlanır.

**Sınırlar:** Sağlayıcı structured-output yeteneği ve JSON sınırları doğrulanmalı; Windows provider adapter/CSP main katmanından geçer. Kaynak model başarısı veya gerçek extraction kalitesi bu tur ölçülmedi.

### B842-13 — Sonsuz kaydırmada yalnız istenen bölümü sınırlı açma

**OLD-DEEPENING** · Önceki: R839-A02, B841-17 · Orta/büyük: 1 hafta

**Sabit kaynak:** [browser-use/browser-use — browser_use/tools/service.py:1383](https://github.com/browser-use/browser-use/blob/b49a68e4060acb226da8f784194fef301c53a6d7/browser_use/tools/service.py#L1383), `async def scroll(`.

**Kodda gözlenen:** scroll index ile scrollable element hedefleyebiliyor; kök index0 özel. Viewport tabanlı sayfa miktarıyla ScrollEvent dispatch ediyor; find_text ayrı ScrollToTextEvent ve bulunamadı sonucu veriyor.

**Ürün sentezi:** Asistan kullanıcı isterse eleştiri listesinde sonraki görünür20öğeyi bulsun veya yorum bölümüne gitsin; bütün siteyi sınırsız taramasın. Her adımda yeni öğe/durma nedeni görünür.

**Bizde farkı:** Letterboxd özel More/yorum akışı zaten var; browser-research statik sayfa metni okuyor. Yenilik her site için doğru otomasyon iddiası değil, küçük generic scroll/read pilotu.

**Edinim rotası:** MIT event yaklaşımı mevcut WebContents/frame adaptöründe bağımsız port; keyfi evaluate aracını modele açma.

**Medya deneyimi:** Görev kartında sonraki bölüm, bulunan ek öğe sayısı ve durdur; açık videonun oynatma konumu korunur.

**Gelecek kabulü:** İç scroll paneli hedeflenir; yeni öğe gelmeyince durur; navigasyon veya iptalde eski tab’da eylem sürmez;20üst sınırı aşılmaz.

**Sınırlar:** Windows native medya/iframe ve DPI ayrıca gerçek kabul gerekir. Sayfa10adımda tam tarandı denmez; site erişim/pagination/hesap koşulları ve provider tur bütçesi sınırdır.

### B842-14 — Açık oturumu kullanırken taşınabilir araştırma paketini ayrı tutma

**OLD-DEEPENING** · Önceki: B841-03, R839-A02 · Büyük: 1 hafta pilot

**Sabit kaynak:** [steel-dev/steel-browser — api/src/services/context/chrome-context.service.ts:29](https://github.com/steel-dev/steel-browser/blob/9fb9b9239325794b3e2d2a56c7e54c400a7d30bd/api/src/services/context/chrome-context.service.ts#L29), `public async getSessionData`.

**Kodda gözlenen:** getSessionData cache ve inFlight ile aynı profil okumasını paylaşır. Gerçek extractSessionData yalnız localStorage+sessionStorage okur; docstring ve SessionData tipindeki cookies/indexedDB desteği burada tam uygulama değildir.

**Ürün sentezi:** Girişli makaleyi yeniden giriş döngüsüne sokmadan seçilen Electron browser partition’da kullanıcı başlatmış okuma; paylaşılan medya araştırma paketi ise yalnız URL/metin/not taşır. Kimlikli oturum taşımak ayrı, isteğe bağlı deneydir.

**Bizde farkı:** browser-session-package zaten safePlaceUrl,portableSession ve variant sanitizasyonu içeriyor; bunu genel cookie yedeği diye yeniden icat etmiyoruz. Mevcut partition üzerinden okuma daha uygun ilk rota.

**Edinim rotası:** Apache-2.0 Steel storage yaklaşımı kaynak referansı; LevelDB profil kopyalama yerine Electron session API pilotu. Kişisel profil dosyası okunmadı.

**Medya deneyimi:** Kaynak kartında açık oturumdan okundu ve pakete giriş bilgisi dahil değil; login gerektiğinde kullanıcı sayfada tamamlar.

**Gelecek kabulü:** Seçilen partition okunur, başka hesaba geçmez; taşınabilir pakette auth verisi yoktur; kapalı oturum açıkmış gibi raporlanmaz.

**Sınırlar:** Windows DPAPI/Chrome profil kilitleri ve DRM oturumları taşınabilirlik garantisi vermez. Cloud CDP uç noktası açılmadı; provider’a yalnız seçilmiş içerik gider.

### B842-15 — Uzun browser adımına yeniden bağlanıp aynı işi ikinci kez başlatmama

**OLD-DEEPENING** · Önceki: R839-A02, R839-A03 · Orta/büyük: 1 hafta

**Sabit kaynak:** [steel-dev/steel-browser — api/src/services/commands/engine.ts:253](https://github.com/steel-dev/steel-browser/blob/9fb9b9239325794b3e2d2a56c7e54c400a7d30bd/api/src/services/commands/engine.ts#L253), `private async submit(`.

**Kodda gözlenen:** CommandEngine.submit session-scoped idempotency key+command hash ile önceki execution’ı bulur; farklı komutta key_conflict, süresi geçen operation’da kontrol et uyarısı. status/cancel ve bounded queue ayrı.

**Ürün sentezi:** Büyük sayfayı al veya seçilmiş dosyayı indir görevi UI timeout olduğunda aynı browser eylemini yeniden başlatmak yerine mevcut task sonucuna bağlanır; kullanıcı neyin bittiğini görebilir.

**Bizde farkı:** browserAutomationGate altyazı işlem anahtarları ve asistan job kayıtları hazır. R839 sonuç doğrulama/döngü korumasının yeni kaynakla derinleşmesi; generic exactly-once garantisi değil.

**Edinim rotası:** Apache-2.0 command record deseni mevcut assistant-jobs kimliğine uyarlanır; Steel REST server/Chromium daemon kurma ön şartı yok.

**Medya deneyimi:** Çalışıyor/sonucu al/iptal kartı; sayfa yenilense konuşmadaki aynı görev ID’si açılır, tekrar ücretli çağrı önerilmez.

**Gelecek kabulü:** Yanıt deadline sonrası status aynı execution’ı döndürür; aynı key farklı komutta reddedilir; belirsiz yarım eylem tamamlandı sayılmaz.

**Sınırlar:** Windows kapanış/yeniden açılış için kalıcılık ayrıca tasarlanmalı; upstream kayıtları kendiliğinden disk kalıcı değildir. CSP/main adaptörü ve provider retry bütçesi ayrıca kabul edilir.

### B842-16 — Son kaldığı yer ile en ileri okunan noktayı ayırma

**OLD-DEEPENING** · Önceki: B841-03, R839-D06 · Orta: 3–4 gün

**Sabit kaynak:** [omnivore-app/omnivore — packages/api/src/services/cached_reading_position.ts:124](https://github.com/omnivore-app/omnivore/blob/29de91e8e43d8f546af398b6b0138dc6aba052bc/packages/api/src/services/cached_reading_position.ts#L124), `export const reduceCachedReadingPositionMembers`.

**Kodda gözlenen:** ReadingProgressCacheItem yüzde,topPercent,anchorIndex ve updatedAt taşır; reducer bunları bağımsız max alır. Bu davranış latest cursor değildir ve birbirine ait tek örnek üretmez.

**Ürün sentezi:** Uzun sinema yazısında geri dönüp not okuma, okundu yüzdesini geriye çekmesin; devam et son cursor’a, ilerleme en ileri doğrulanmış anchor’a baksın. Max kopyalanmaz, aynı revizyonlu atomik snapshot kullanılır.

**Bizde farkı:** browser-library-tools text anchor çözümü ve media-shelf chapter/scroll mevcut. Öneri konum saklamayı yeniden eklemek değil; son konum ve consumed progress anlamlarını ayırmak.

**Edinim rotası:** AGPL-3.0 kaynak, bağımsız davranış modeli tercih edilir. Redis servisi Electron’a eklenmez; mevcut yerel mağaza kullanılır.

**Medya deneyimi:** Kartta%72okundu; yeniden açmak son incelenen%40’a dönebilir. Kullanıcı baştan başla ile progress’i açıkça sıfırlar.

**Gelecek kabulü:** Geri kaydırma en ileri okunmayı azaltmaz; yeni belge revizyonu eski yüzdeyi yanlış yere taşımaz; eski gecikmiş event yeni cursor’ı ezmez.

**Sınırlar:** Windows kapanışta debounce flush ve iki pencere sırası kabul edilir. Öğrenme takibi değildir; model gerekmez. Omnivore reducer’ının doğru concurrency çözdüğü bu okumayla iddia edilmez.

### B842-17 — JSON dönen kaynakları boş web sayfası yerine yapılı kaynak öğesi alma

**NEW** · Önceki: Yakın raporlarda eş mekanizma bulunmadı · Orta: 3–5 gün

**Sabit kaynak:** [steel-dev/steel-browser — api/src/modules/actions/actions.controller.ts:142](https://github.com/steel-dev/steel-browser/blob/9fb9b9239325794b3e2d2a56c7e54c400a7d30bd/api/src/modules/actions/actions.controller.ts#L142), `const isJson = isJsonContentType`.

**Kodda gözlenen:** handleScrape isJsonContentType ile response.text alıyor; originalContentType/status/timestamp metadata tutuyor ve jsonToMarkdown yoluna ayırıyor. HTML DOM okunabilirliği JSON yanıtına zorlanmıyor.

**Ürün sentezi:** Kamuya açık festival programı veya bölüm metadata bağlantısı JSON döndüğünde kaynak yapısını koruyan önizleme; kullanıcı seçilmiş kayıtları medya araştırma taslağına çevirir. Tüm API’lere genel erişim iddiası yok.

**Bizde farkı:** assistant-browser-research page.read(article) metnine dayanıyor; browser page index makale yolu hazır. JSON kaynak için tür tanıma ve sınırlı key/value provenance yenilik.

**Edinim rotası:** Apache-2.0 dönüşüm yaklaşımı küçük Node adaptörü; arbitrary API shell değil, mevcut network politikası ve byte sınırları içinde kaynak okuma.

**Medya deneyimi:** Kaynak kartında JSON ve şema özeti; alan seçimi, ham/kullanılan değer ve bağlı film önizlemesi.

**Gelecek kabulü:** JSON içerik HTML diye parse edilmez; büyük veya hatalı JSON sınırlı hata verir; tarih/sayı/string tipleri korunur; kişi/film ID’si onaysız birleşmez.

**Sınırlar:** Windows ağ timeout/UTF-8 ve CSP fetch main sınırı gerekir. API kota/veri lisansı her endpoint için ayrıca incelenir; sağlayıcıya bütün ham veri gönderilmez.

### B842-18 — Tek film kaydındaki web çıktılarında tutarlı dosya ve önizleme sırası

**OLD-DEEPENING** · Önceki: B841-13, B841-12 · Orta: 4–6 gün

**Sabit kaynak:** [ArchiveBox/ArchiveBox — archivebox/plugins/output_groups.py:129](https://github.com/ArchiveBox/ArchiveBox/blob/09041760bc0fe25eb584e62cc9c7756e85ff855e/archivebox/plugins/output_groups.py#L129), `def order_snapshot_outputs`.

**Kodda gözlenen:** order_snapshot_outputs HTML,raster,article_text,embedded_media,metadata,other gruplarını manifest tercihleriyle sıralıyor. plugin_output_sizes paylaşılan dosyayı bir kez sayıyor; snapshot_thumbnail_result ilk mevcut uygun çıktıyı seçiyor.

**Ürün sentezi:** Film dosyasında röportajın makalesi, görselleri, PDF’si ve metadata’sı ayrı bozuk kart yığını olmasın; kaynak öğesi altında tür grupları ve gerçek boyut, eksik çıktı durumu görünür.

**Bizde farkı:** BrowserReadingList tek MHTML boyutu saklıyor; varlık/variant ve kütüphane indeksleri hazır. R841 çok format durumunun somut output manifest/sunum sırası ile derinleşmesi.

**Edinim rotası:** MIT taxonomy/sıralama saf mantığı port adayı; ArchiveBox plugin runtime ve Python3.13 venv alınmaz.

**Medya deneyimi:** Önce oku/izle eylemi, altında özgün dosyalar; thumbnail eksikse metadata temelli kapak. Dekoratif arşiv rozeti her dosyayı başarı saymaz.

**Gelecek kabulü:** Aynı asset iki biçimde referanslanınca byte toplamı ikiye katlanmaz; bilinmeyen format Other’da kaybolmaz; olmayan screenshot boş thumbnail seçmez.

**Sınırlar:** Windows dosya adı/uzun yol ve thumbnail gerçek native görünüm kabul gerekir. Çıktı grupları DRM medyanın indirilebildiğini göstermez; extractor build ve dosya kalitesi denenmedi.

## Kanıt düzeyi ve yeniden doğrulama

`source-manifest.json` her alınmış dosyanın raw byte ve canonical-LF SHA256, tam HEAD, raw URL ve permalink kaydını içerir. canonical UTF-8 BOM çıkarma ve CRLF/CR→LF dönüşümüdür. `local-baseline.json` güncel15 yerel dosyayı aynı yöntemle sabitler. `verification.json` byte hash/symbol/link eşleşmesi ve sayaç kontrollerini taşır; gerçek model, tarayıcı ve ürün davranışı test edilmedi. Önceki R838/R839/R841 metinleri değişmedi.
