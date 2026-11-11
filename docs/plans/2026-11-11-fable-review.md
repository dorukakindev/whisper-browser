# Fable incelemesi — doğrulama ve uygulama kaydı

Kullanıcının 2026-11-11 tarihinde sohbete verdiği statik inceleme raporunun takip kaydıdır. İncelenen rapor tabanı ve bu tur başlangıç HEAD'i: `a03e62451906698848982428b46946cdaa855d8a`, dal `master`. Harici inceleyici test/Electron/mpv/görsel çalıştırmadığını, dublaj/asistan kapsamının yüzeysel kaldığını açıkça bildirmiştir. Rapordaki K işareti çalışma zamanı doğrulaması değildir. Aşağıdaki liste yeni bir bug envanteri değil, harici bulguların izlenmesidir. R853/R854 sahipliği ve eski düzeltmeler korunur; benzer başlıklar güncel kodla karşılaştırılır.

## Maddeler

| Kimlik | Harici iddia / öneri | Yerel durum |
|---|---|---|
| OYN-01 | Pro/Stremio düğmeleri eski gizli kontrol satırında | **Yerel uygulama ve kontrollü doğrulama tamam**: modern araç menüsü ve yerel Sahne paneli eski Pro/Stremio düğmelerine bağlanır; geç/gizli/başka kaynak eylemi reddedilir. Gerçek native kabulü ayrı |
| OYN-02 | Native önünde panel/sıradaki/giriş atla katmanları | **Yerel teknik düzeltme/kontrollü doğrulama**: mevcut kontroller native görüntü dışında ayrılan alanda; geniş/dar layout hidden:false, snapshot yok. Gerçek mpv/Windows/tam ekran kabulü açık; büyük Raf yapılmadı |
| OYN-03 | Native örtme yerine sahneyi daraltan Raf | **Kullanıcı isteğiyle kapsam dışında**; büyük yeniden tasarım yapılmayacak |
| OYN-04 | mpv yokken uzak akış otomatik başlamıyor | **Düzeltildi ve kontrollü testle doğrulandı**: motor varlığı sorgulanır, yoksa başlatma çağrısı yapılmaz; HTML play denenir; eski sahip yanıtı reddedilir |
| OYN-05 | 300 ms altyazı yansıtma/çift altyazı riski | **Düzeltildi / kontrollü doğrulandı**: DOM/render değişimi metni hemen iter; 300 ms darbe yalnız keep-alive kalır, stale owner reddedilir. Native başlangıcında sid=no; elle iz seçimi korunur. Gerçek gecikme/80 ms kabulü ölçülmedi |
| OYN-06 | Yapıt kimliği/kaynak parmak izi ayrımı | **Yerel uygulama/kontrollü doğrulama**: token katalog bağlamından work key; ortak Pro görüntü tercihleri, kaynakta kalan ses gecikmesi ve salt okunur eski altyazı referansı. Bilinmeyen yerel/dizi kimliği tahmin edilmez; zamanlı metin otomatik taşınmaz |
| OYN-07 | Shift+N iki eylem çalıştırıyor | **Düzeltildi ve kontrollü testle doğrulandı**: ana N eylemi Shift'i tüketmez; Stremio Shift+N sahibi korunur |
| OYN-08 | Etkileşimli öğe odağında oynatma kısayolları | **Düzeltildi**: düğme/bağlantı/summary odağında J/L/M/F ve oklar çalışır; metin/menü/tab/slider/Space/Enter ve tüketilmiş olaylar korunur |
| OYN-09 | Birden çok hız/uyku sahibi | **Düzeltildi**: Pro/Stremio ana oynatıcının hız tercihi ve uyku alanlarını kullanır; bağımsız timer/otomatik profil hızı kaldırıldı. Eski Stremio hızı silinmez, açık seçimle uygulanabilir. DUB-03 efektif hız incelemesi ayrı |
| OYN-10 | Açılış başarısızken yeni Stremio oturumu benimseniyor | **Düzeltildi ve kontrollü testle doğrulandı**: başarı ve eşleşen kaynak sonrası benimseme; iptal/geç yanıt/başarısızlık eski oturumu korur |
| OYN-11 | Kontrol satırını izleme odaklı düzenleme | **Kullanıcı isteğiyle kapsam dışında**; büyük kontrol satırı tasarımı yapılmayacak |
| OYN-12 | İki modern araç girişi aynı hedefi açıyor | **Düzeltildi**: medya merkezi ve altyazı/ileri araçlar artık ayrı sahipleri açar; bir tık iki pencere açmaz, eski kaynak/Browser eylemi reddedilir |
| OYN-13 | Devam kayıtları ve kapasite hatasının görünürlüğü | **Kayıt hatası düzeltildi**: kapasite/okuma/yazma başarısızlığı kalıcı EN/TR satırı ve kaynak bağlı retry ile görünür. Tek devam çözücü önerisi ayrı; depolar tekleştirilmedi |
| OYN-14 | URL sınırı belgesi ve kalıcı kaynak gizliliği | **Düzeltildi**: yeni izleme yazımında akış referansı hash kimliktir. Yeniden açma URL’si main’de mevcut OS güvenli depo yöntemiyle saklanır; renderer aktif oynatma URI’sini alır. Eski kayıt/yedekler topluca temizlenmedi |
| ALT-01 | Altyazı oluşturma görünür koşulu ile localPath kapısı farklı | **Düzeltildi**: uygunluk ve yerel başlatma aynı aktif kaynağı kullanır; tamamlanmamış akış engeli EN/TR görünür. Eski video yolu metni yeni akışa taşınamaz; Browser/YouTube ve altyazı çevirisi korunur |
| ALT-02 | Film düzeyinde karakter/hitap/terim belleği | **Yerel uygulama/kontrollü doğrulama**: bütün partiler/refine için kaynak sürümü bağlı sabit kaynak çerçevesi, dağıtılmış alıntı/ad adayları, cache/TM ayrımı; ek model çağrısı yok. Gerçek hitap/terim kalite kazanımı ölçülmedi; yapay ilişki çıkarımı yok |
| ALT-03 | Tek iş yuvasının açıklama/çeviri etkileşimi | **Doğrulandı/eksik düzeltildi**: yeni iş için ortak backend kilidi gerekli; hazır açıklama üretim sırasında okunabilir, mevcut iş ezilmez |
| ALT-04 | Altyazı arama dilini arayüzden ayırma | **Düzeltildi**: mevcut çeviri hedefi varsayılan, açık dil/Any seçimi kalıcı ve UI dilinden bağımsız; geç arama/indirme kaynak koruması test edildi |
| DUB-01 | Kırpılan gruplara tekil inceleme/yeniden üretim | **Mevcut parça doğrulandı, eksik tamamlandı**: engine zaten clipped/tempoFallback→review ve tekil retry üretiyor. Nedenler, Zamanlama filtresi, kayıtta flag korunumu ve yalnız doğrulanmış kaynak konumuna atlama eklendi |
| DUB-02 | Dublaj ilerleme protokolünün yapısal hale gelmesi | **Düzeltildi**: progress/timing sürüm 1 NDJSON; doğrulanmış IPC/kalıcı özet, eski motor uyumu ve tip bazında çift saymayı engelleme. Diğer DUB_* yolları korunur |
| DUB-03 | Dublaj efektif hızı/native örnekleme etkileşimi | **Düzeltildi/kontrollü doğrulandı**: kişisel temel hız ile etkin dublaj hızı ayrımı, ortak tercih olayı, native 0.0625× alt sınır. Sentetik 200 ms saat kontrolü geçti; gerçek native/dinleme kabulü ayrı |
| DUB-04 | Stüdyoya DOM tıklama/polling yerine açık giriş | **Düzeltildi**: mevcut stüdyo sahibi `prepareWithPreset` ile beklenir; DOM tıklama/polling yok. Busy/kapalı/değişmiş kaynak/başarısız config durumunda preset uygulanmaz; üretim başlamaz |
| AST-01 | Sohbet bağlamında ilerideki satır/spoiler sınırı | **Düzeltildi**: yerel watched sohbet/arama kanıtı ve çeviriler kendi ofsetleriyle tamamlanmış satırlardan oluşur. Açık nearby/full kapsamı ve seçili pasaj sahipliği korunur |
| AST-02 | Kalıcı makbuz defteri | **Mevcut uygulama doğrulandı**: sohbet dosyasında durum/jobId yeni servisle korunur; tarihsel kayıt yürütme yetkisi vermez. Yeni defter eklenmedi |

## Tasarım yönü

Harici “Sahne ve Raf” önerisi: üst medya menüsü ve sıcak amber/grafit korunarak videoyu örtmeyen sağ araç alanı; Döküm/Kaynak/Altyazı/Ses/Görüntü/Asistan; dar pencerede video altında alan. Normal video ana satırında ±10 saniye/oynatma/zaman/altyazı/ses/hız/tam ekran, cümle ve A-B çalışması döküm başlığında; podcastte cümle araçları görünür. Çeviri hata satırları ve dublaj sorunlu grup/A-B önizlemesi bağlı araçlar olarak öneriliyor. Bu tur uygulanmadı; mevcut Sahne düzenini kopyalayan ikinci panel sahibi yaratılmayacak. Rapordaki 400 px/1100 px/%56/220 ms değerleri doğrulanmış tasarım sözleşmesi değil, değerlendirme başlangıcıdır.

## Bu tur doğrulama

- İlk yeni kontrollerde OYN-04/OYN-07/OYN-10 üçü de mevcut kod üzerinde başarısız oldu; düzeltmelerden sonra geçti.
- `node --test --test-isolation=none tests/report815-media-regressions.test.js`: **8/8**.
- `node tests/stremio-ui.test.js`: exit 0; mevcut kaynak geçişi, devam, altyazı ve puan akışları korundu.
- `node tests/native-player-lifecycle.test.js`: **7/7**.
- Üç ürün JS + değişen test dosyasında `node --check`, `git diff --check`: temiz.
- İlk düzenleme betiğinde Windows varsayılan encoding'i metni yanlış okudu; işlem UTF-8 olarak düzeltildi, geçici test metni bozulması giderildi ve tam ilgili test dosyası tekrar geçti. Bu geçici hata eski ürün hatası diye sınıflandırılmadı.
- Bu sonuçlar gerçek medya/mpv/GPU/Windows görsel kabulü değildir. Kişisel profil/açık uygulama değiştirilmedi. Tema/CSS değiştirilmedi. Yeni Git teslimi yapılmadı; önceki teslim yetkisi bu yeni kod için tekrar kullanılmadı.

## İkinci grup — 2026-11-11-1022

OYN-01 → ALT-01 → OYN-08 yerelde uygulandı. [Devir, testler ve sınırlar](../devir/2026-11-11-1022.md). İki izole Windows Chromium görünümünde araç menüsü/Whisper engel mesajı kontrol edildi; JS ve seçili axe kurallarında ihlal yok. Stremio görünümü sentetik etkin oturumdur; gerçek addon/native oynatma kabulü değildir. Mevcut stil/tema korunur.

Yeni/etkilenen kontroller: Sahne entegrasyonu 73/73, medya regresyonu 9/9; workspace runtime, Browser Whisper, tek-tık çeviri varsayılanı ve Stremio UI exit 0. `player-ui` 147 geçti/6 başarısız; aynı altı hata başlangıç HEAD'inde de var. `browser-reading-design` aynı eski önizleme/bağlam assertion'ında başarısız; başlangıç HEAD'inde karşılaştırıldı. Test dosyalarını kaynak kesitiyle çalıştıran fixture'lara yeni gerçek helper dahil edildi; eşikler gevşetilmedi. Ürün JS syntax/diff kontrolleri temiz. Gerçek native/GPU/Electron/monitör kabulü yapılmadı; kişisel profil ve açık uygulama korunur.

## Üçüncü grup — 2026-11-11-1036

OYN-12 → OYN-13 → DUB-04 için onaylanan düzeltme kapsamı yerelde tamamlandı. [Devir](../devir/2026-11-11-1036.md). Medya/ileri araç hedefleri ayrıldı; başarısız ilerleme kaydı oynatmayı kesmeden, kaynak ve kuşak bağlı yeniden denemeyle görünür; dublaj girişi mevcut stüdyo sahibinin açık API'sini bekler. OYN-13'teki tüm devam depolarını tekleştirme fikri uygulanmadı ve hata düzeltmesinin kabul koşulu değildir; mevcut depolar ve kişisel kayıtlar korunur.

Medya regresyonu 11/11; workspace runtime, Stremio UI, gerçek stüdyo UI fixture'ı ve Stremio servis protokol/kapasite testleri exit 0. Tasarım sözleşmesi geçti; 7 JS syntax ve diff temiz. İlk üç hedefli regresyon mevcut kusurlarda başarısızdı, sonra geçti. Stüdyo fixture'ındaki eksik prova→tam üretim onayı mock'u açık red/sonra onay senaryosuyla tamamlandı; ürün onay kapısı kaldırılmadı.

Bir izole Windows Chromium görünümünde hata satırı video dikdörtgeninin dışında (satır altı 132 px, sahne üstü 323.25 px); JS 0 ve seçili axe kurallarında ihlal 0. Bu sentetik oturum/medya kontrolüdür; gerçek native/Electron/GPU kabulü değildir. Önceki geniş testlerin açık hataları çözülmüş sayılmaz ve bu grupta gereksiz tekrar koşulmadı.

## İlk beşli — 2026-11-11-1105

Kullanıcının son sıralama ve beşli çalışma kararıyla **OYN-14 → AST-01 → OYN-05 → OYN-09 → DUB-01** ele alındı. [Devir ve sınırlar](../devir/2026-11-11-1105.md). Yeni geçmiş URL yazımı opaklaştırıldı; yeniden açma mevcut güvenli depo ile korunur. Yerel watched bağlamı/çevirisi geleceği içermez. Native metin değişimde itilir; hız/uyku aynı sahibin alanlarını kullanır. Zamanlama incelemesi mevcut tekil retry üstüne tamamlandı; proje yüklemek tek başına kaynak eşleşme kanıtı sayılmaz.

Odaklı Node üç dosya 28/28; native lifecycle 7/7. Pro, Stremio, stüdyo UI, workspace runtime/UI, dublaj servis, player-context-evidence ve IPC parity kontrolleri geçti. Player UI aynı 147 geçer/6 eski başarısız sonucu verdi; yeni hata yok, tüm takım yeşil sayılmadı. 17 ürün/test JS syntax ve diff temiz. Tek izole Sonuç görünümünde JS/odak axe ihlali 0. Gerçek mpv gecikmesi, Windows DPAPI, GPU/dinleme veya canlı sağlayıcı kabulü yok.

## Kalan sıra — eforu karıştırmadan

24 harici maddenin 14'ünde onaylanan yerel kapsam ele alındı. **OYN-03/OYN-11 büyük tasarımları kullanıcı isteğiyle dışarıda**; kalan 8 aktif madde:

**Önce medium (4 madde):** ALT-04 → ALT-03 → DUB-02 → AST-02. ALT-04 arayüzden bağımsız altyazı dili; diğer üçü önce doğrulanacak: gereksiz iş kilidi var mı, dublaj ilerlemesinde kırılgan legacy ayrıştırma var mı, mevcut kalıcı iş kayıtlarına rağmen makbuz boşluğu var mı? Hazır/yinelenen parça tekrar yapılmaz. Aynı eforda beşinci kalan madde yok; sayı doldurulmaz.

**Sonra high (4 madde):** OYN-02 → DUB-03 → OYN-06 → ALT-02. Mevcut tasarımda native katman sorunu, dublajın efektif hız/senkronu, yapıt/kaynak kimliği ayrımı ve film çeviri belleği. OYN-02 teknik görünürlük düzeltmesidir; Raf yeniden tasarımı değildir.

OYN-13'ün daha geniş tek devam çözücü fikri onaylanan hata düzeltmesinden ayrı ek öneridir; bu sıraya beşinci iş diye eklenmedi. Yeni Git teslimi yok; açık komut beklenir.

## İkinci beşli — 2026-11-11-1133

ALT-04 → ALT-03 → DUB-02 → AST-02 → OYN-02 ele alındı. [Devir/test/sınırlar](../devir/2026-11-11-1133.md). 19 onaylı yerel kapsam; AST-02 yeni kod değil mevcut özellik doğrulaması. OYN-03/OYN-11 büyük tasarımları dışarıda; kalan **3 aktif high: DUB-03 → OYN-06 → ALT-02**. Yukarıdaki eski sıra bölümleri tarihsel; güncel sıra bu bölümdedir. Yeni Git teslimi yok.

## Son üçlü — 2026-11-11-1147

DUB-03 → OYN-06 → ALT-02 tamamlandı; [devir/kanıt/sınırlar](../devir/2026-11-11-1147.md). **22 onaylı yerel kapsam ele alındı, OYN-03/OYN-11 kullanıcı isteğiyle dışarıda; aktif Fable uygulama işi kalmadı.** Kaynak çerçevesi modelin ürettiği karakter ilişkisi tablosu değildir. Önceki kaynak metni salt okunur referanstır, yeni zaman eksenine bağlanmaz. Gerçek native/GPU/dinleme ve canlı çeviri kalite kabulü açık. Önceki kalan listeleri tarihsel; Git teslimi yok.

## Gerçek motor ve sağlayıcı doğrulaması — 2026-11-11-1206

[Sonuç/devir](../devir/2026-11-11-1206.md): taşınabilir gerçek mpv gizli smoke0.125×/geri dönüş/kapanış geçti; görünür native/dinleme açık. DeepInfra V4.1 Flash18 gerçek HTTP200 yanıtı doğrulandı; küçük örneğin hitap/terim sonucu karma, genel kalite kabulü değildir. Certainly ve sessiz yanlış retleri mevcut güvenlik kapıları korunarak düzeltildi; kayıtlı yanıtların gate replay’i ağsızdır. Aktif Fable kod maddesi sayısı yeniden artırılmadı; C855 ayrı onarıldı.
