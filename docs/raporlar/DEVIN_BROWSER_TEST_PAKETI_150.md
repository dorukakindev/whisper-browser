# Devin için 150 görev — Browser, YouTube, altyazı ve dublaj kabul testi

Bu bir **uygulanmamış test planıdır**, hata bulgusu veya başarı raporu değildir. Amaç sayı doldurmak değil; hatayı, ortam engelini ve doğrulanmamış davranışı ayırmaktır.

## Devin'a verilecek talimat

Whisper Browser uygulamasını aşağıdaki 150 görevle denetle. **Ürün kodunu ve mevcut testleri değiştirme, düzeltme yapma, commit/push/PR açma.** Sonuçları kullanıcıya teslim et; düzeltmeleri daha sonra Codex yapacak. Önce 001–050 görevlerini, sonra reklamlar ve ses akışını tamamla. Süre veya ortam yetmezse kalanları açıkça işaretle; testleri geçmiş sayma.

Repo: https://github.com/dorukakindev/whisper-browser

Test edilecek sabit sürüm: **8e3d9a7628eaa288d4627e461bccc81d250a85e0**, dal `codex/browser-whisper-progress-20261014`. Sadece master'ı açma; son browser/dublaj düzeltmeleri bu dalda bulunuyor. Kendi izole kopyanda bu commit'e geç; başlangıç/bitiş `git status --short`, `git diff --exit-code` ve HEAD'i raporla. Çalıştırma araçlarını ve sonuçları repo dışındaki ayrı bir QA klasörüne yaz. Otomatik mevcut testlerin ürettiği ignore edilmiş fixture/profiller olabilir; bunları kaynak değişikliği sayma, raporla. Bu paketin belge commit'ini indirmek test hedefinin ürün kodunu değiştirmez.

AGENTS.md, YENI-BILGISAYAR.md ve docs/devir/2026-10-15-0619.md dosyalarını oku. AGENTS'in ürün düzeltmesine ait commit/push döngüsü bu görev için uygulanmaz: kullanıcı bu denetimde yalnız test ve rapor istiyor. Repo veya bağımlılık kilitlerini güncelleme; gerekirse mevcut kilitli bağımlılıkları kur, kurulum komutlarını yaz. Kullanıcının gerçek profiline, çerezlerine, anahtarlarına ve özel ses kayıtlarına erişme. Ücretli API çağrısı, hesap açma, model eğitimi veya büyük yeni model indirmesi yapma. Mevcut kullanıcı süreçlerini kapatma. Yalnız test için başlattığın süreçleri kapat.

## Chrome ve gerçek uygulama arasındaki sınır

Bu ürün bir web sitesi değil, Electron + Python uygulamasıdır. **Normal Chrome'da YouTube açmak bizim reklam engelleyicimizi test etmez.** Aynı şekilde index.html'yi HTTP üzerinden açıp window.api taklidi eklemek gerçek Whisper, dosya erişimi veya dublaj üretimini doğrulamaz.

Tercih edilen yol, ayrı profil kullanan gerçek Electron uygulamasına Playwright ile bağlanmaktır. Playwright'ın [_electron.launch](https://playwright.dev/docs/api/class-electron) API'si deneysel bir seçenektir; Castlabs sürümüyle çalışacağını varsayma. Alternatif olarak test sürecinin **yalnız loopback'e** açılan CDP uç noktasına [chromium.connectOverCDP](https://playwright.dev/docs/api/class-browsertype#browser-type-connect-over-cdp) ile bağlanabilirsin. CDP'nin Playwright protokolünden daha sınırlı olduğunu göz önünde bulundur. Kaynak geliştirme sürümünde kullanılabilen debugging bayrakları paketli sürümde kaldırılır; bunu aşmak için ürün kodunu değiştirme.

Windows'ta normal açılışı **start.bat** ile ayrıca doğrula. Playwright için doğrudan Electron açarsan start.bat içindeki GPU/FFmpeg ortamını test sürecine taşı; bunu start.bat doğrulaması diye yazma. Linux testleri Windows açılışını, dosya seçiciyi veya CUDA DLL yollarını doğrulamaz. `WHISPER_RESOURCE_SOAK_USER_DATA` mevcut test desteğidir; uygulama/test süreci başlamadan ayrı test profiline ayarla. Gerçek uygulama veri yolunu doğrula. Mevcut smoke dosyaları bu kullanımın örneklerini içerir.

Electron bağlı değilse Chrome ile sınırlı UI/DOM kontrollerine devam et. Bu durumda IPC/backend/native/yakalama/reklam engelleme/GPU görevlerini **BLOCKED** yap. Test sürücüsü, localhost fixture sunucusu ve kontrollü window.api yalnız repo dışındaki QA klasöründe hazırlanabilir; neyi taklit ettiğini her sonuca yaz. Sırf bütün ekranları açabilmek için gerçek uygulamayı taklit eden başarı cevapları üretip bütünleşik başarı iddia etme.

Ana renderer ile gömülü YouTube sayfası ayrı hedeflerdir. Hedefi URL/başlıkla doğrula; sıralamadaki ilk sayfayı seçme. Menü, iş durumu ve altyazı panelini ana renderer'da; gerçek video/DOM reklamını gömülü sayfada kontrol et. Ana pencere görüntüsü native video yüzeyini göstermiyorsa video hedefinden de kanıt al. UI işlemlerini tercihen locator/rol/etiket ve gerçek tıklama/klavye ile yürüt. Sadece butonun onclick fonksiyonunu çağırmak butonun tıklanabildiğini kanıtlamaz. [Playwright auto-retry assertions](https://playwright.dev/docs/test-assertions) kullan; gerekçesiz uzun sabit beklemeler ekleme.

## Ortam, fixture ve yürütme kuralları

- `C`: Chrome UI / kontrollü sunum testi yapılabilir. Gerçek Electron'da da yapılması tercih edilir; Chrome sonucunu `surface=chrome-controlled` diye ayır.
- `E`: gerçek Electron + gerçek köprü/yerel süreç gerekir. Sadece ilgili mevcut test koşulduysa `evidenceType=integration` yaz; elle uçtan uca yapıldı deme.
- `Y`: uygulamanın gömülü tarayıcısında gerçek YouTube gerekir. Anonim test profili; reklam, bot doğrulaması ve ağ bölgesi koşullarını kaydet.
- `G`: gerçek kurulu Whisper/Vox/ayırıcı ve gerekli donanım gerekir. Motor yoksa UI kontrolünü ayrı kaydet, gerçek üretimi BLOCKED yap. Yeni ses modeli kurma. Konuşma ayrıştırıcının CPU olması tek başına hata değildir.
- P0: veri kaybı, yanlış videoya ses/altyazı, durdurulamayan iş, çöken/kitlenen temel akış. P1: temel özellik hatası. P2: kullanılabilirlik ve görsel sorun. Bu öncelikler test sırasıdır; bulunan hatanın gerçek önemini ayrıca değerlendir.
- Test videolarını 20–60 sn tut; gerçek motor denemelerinde 5–15 sn aralık yeterli. Aynı fixture ve önbelleği tekrar kullan. İki uzun işi sırf hız karşılaştırmak için üretme; tam 20 dakikalık video veya bütün test paketini her görevde tekrar çalıştırma.
- Fixture F1: 60 sn'lik yerel, zaman sayacı ve belirgin ses işaretleri içeren video; ikinci sürüm farklı görsel/başlıkla F2. FFmpeg veya mevcut açık lisanslı fixture kullan, üretim komutunu kaydet. Sessiz flower.mp4 ile konuşma doğruluğu ölçme.
- S1: UTF-8/BOM'lu Türkçe SRT; 1–3, 6–9, 12–13 ve 20–24 saniye aralıklarında dört farklı cümle. S2 aynı zamanlarda farklı metinli. Ayrıca boş, sözdizimi bozuk, çok satırlı ve etiketi olan SRT varyantları hazırla. Dosya adlarında `Çığ öşü ıİ` ve boşluk kullan.
- A1: ilk ses işareti bilinen WAV; A2 belirgin başka sesli WAV; A3 tek kanallı ses ve basit müzik içeren kısa ayırma fixture'ı. Senkron kabulünde işaretleri ölç; yalnız video/ses süresinin eşitliği yetmez. Native medya için olağan seek toleransını ~250 ms, ölçüm yöntemini açıkça belirt. Otomasyon/DSP ile ses benzerliğine karar verme; dinleme yapılamadıysa kaliteyi doğrulanmamış yaz.
- Konuşmalı Whisper/dublaj fixture'ı yalnız açık lisanslı veya test için izinli olmalı. Kullanıcının ses kaydı bulutta yoksa istemeden kopyalama; kendi sesine benzerlik görevlerini BLOCKED yap.
- Kontrollü sağlayıcı ile gerçek ücretli model kalitesini ayır. Çeviri sonucunu veya uygulama state'ini hedeflenen başarıya ulaşmak için doğrudan değiştirme. Ağ cevap fixture'ı kullanıldıysa kaydet. Canlı YouTube reklam testi sırasında yanıtları mock etme.
- Her FAIL için mümkünse yeni profilde bir tekrar yap; bütün 150 görevi tekrar etme. Tek seferlik, henüz tekrar edilmeyen hatayı da açık etiketle. Reklam gelmemesi `NOT_OBSERVED` olabilir; engellemenin başarısı diye uydurma.
- UI için olağan bekleme 10 sn, sayfa yükleme/ağ için 30 sn; gerçek model başlangıcında aşama/log ilerliyorsa daha uzun bütçe ve gerekçe yaz. Tek timeout'u ürün kilitlenmesi diye kesinleştirme.
- Tarayıcı/medya izinlerini kullanıcı jesti ve uygulamanın normal akışıyla kullan. Güvenlik duvarını kapatma, CSP/webSecurity/sandbox korumalarını gevşetme. Test profili dışında dosya temizleme yapma.

## 001–010 · Açılış ve uygulama bütünlüğü

| ID | Öncelik / ortam | İşlem | Beklenen gözlem |
|---|---|---|---|
| T001 | P0 E | Sabit HEAD'i ve temiz tracked durumu doğrula; ayrı profilde uygulamayı aç. | Doğru sürüm açılır; başka profil kullanımı veya tracked değişiklik yok. |
| T002 | P0 E | Windows varsa start.bat ile normal açılışı bir kez gerçekleştir. | Ana pencere açılır; bekleyen terminal sorusu/başlatma hatası başarı diye geçilmez. |
| T003 | P0 E | Gerçek ana renderer ve gömülü sayfa hedeflerini envantere al. | Node yetkileri yalnız yetkili preload'da; web sayfasında window.api yok. |
| T004 | P0 E | Açılışta console/pageerror/unhandled rejection kayıtlarını topla. | Kullanıcı akışını bozan hata yok; üçüncü taraf hata ayrı kaynakla raporlanır. |
| T005 | P1 C | İlk açılışta boş browser/oynatıcı ekranına gir. | Boş durum metni ve yapılabilir sonraki işlem var; sahte ilerleme yok. |
| T006 | P0 E | Pencereyi kapatıp aynı test profiliyle tekrar aç. | Çökme ve profil bozulması yok; normal kayıtlar geri gelir. |
| T007 | P1 C | Browser/yerel oynatıcı/ana ekran arasında üç kez geç. | Yanlış görünüm üstte kalmaz; kontroller erişilebilir kalır. |
| T008 | P1 C | Ağ yokken uygulamayı aç, sonra yalnız test bağlantısını geri getir. | Uygulama açılır; hata anlaşılır, bağlantı sonrası tekrar deneme mümkün. |
| T009 | P1 E | Test profiliyle ikinci uygulama sürecini başlat. | Tek-yazar davranışı işler; profil dosyaları eşzamanlı bozulmaz. |
| T010 | P1 C | Açılıştan sonra kısa bir UI etkileşimi boyunca hata kaydını sürdür. | Giderek artan aynı hata/uyarı fırtınası oluşmaz. |

## 011–020 · Adres, gezinme ve sayfa hataları

| ID | Öncelik / ortam | İşlem | Beklenen gözlem |
|---|---|---|---|
| T011 | P0 E | Browser adresine yerel fixture HTTP adresini yazıp Enter bas. | Gerçek sayfa açılır; adres/başlık/yükleme durumu aynı sayfaya ait. |
| T012 | P0 E | F1→F2 gez, geri ve ileri düğmelerini kullan. | Doğru içerik ve geçmiş sırası; eski sayfa durumu taşınmaz. |
| T013 | P1 E | Sayfa açıkken Yenile'ye bas. | Yükleme sonlanır; yinelenen view/boş native katman oluşmaz. |
| T014 | P0 E | Yavaş F1 yüklenirken hemen F2'ye git. | Son istek F2 kazanır; eski cevap adresi/altyazıyı geri değiştirmez. |
| T015 | P1 E | Yükleme sırasında Durdur kontrolü varsa kullan. | Kontrol ilan ettiği işi durdurur; navigasyon tekrar yapılabilir. Yoksa N/A. |
| T016 | P1 E | Ulaşılamayan hostname veya kapalı localhost portunu aç. | Açıklayıcı hata ve yeniden deneme yolu; sonsuz yükleme yok. |
| T017 | P1 E | Kontrollü boş gövdeli 502 sayfasını aç. | Uygulama hata yüzeyi gösterir; boş başarı ekranı sayılmaz. |
| T018 | P1 E | Gövdeli 404 fixture sayfasını aç. | Sitenin içerikli hata sayfası sebepsiz örtülmez. |
| T019 | P1 C | Adres önerilerini klavye ile aç, seç, Esc ile kapat. | Odak/seçim tutarlı; öneri paneli videonun altında kalmaz. |
| T020 | P1 E | F1 üzerinde normal bağlantı, Ctrl+tıklama ve orta tuşu ayrı dene. | Normal gezinme ve yeni sekme davranışları ayrıdır; iki kez açılmaz. |

## 021–030 · Sekme ve iş yalıtımı

| ID | Öncelik / ortam | İşlem | Beklenen gözlem |
|---|---|---|---|
| T021 | P0 E | F1 ve F2'yi iki sekmede aç; aralarında geç. | Başlık/adres/video/altyazı doğru sekmeye bağlı. |
| T022 | P0 E | Bir sekmede altyazı seç, diğerine geçip geri dön. | Metin, seçili iz ve saat başka sekmeye karışmaz. |
| T023 | P0 E | A sekmesinde geciken iş başlat, B'ye geç; A'yı tamamlat. | A'nın sonucu B'ye uygulanmaz; işin sahibi görünür. |
| T024 | P0 E | İş devam ederken sahibi sekmeyi kapat. | İptal/arka plan politikası anlaşılır; kapanan view'a mutasyon yok. |
| T025 | P0 E | Aktif sekmeyi ve ardından son sekmeyi kapat. | Mantıklı komşu/boş görünüm; ölü pencere veya engellenen tıklama yok. |
| T026 | P1 E | Aynı video adresini iki sekmede açıp farklı konumlara sar. | Bir sekmenin komutu diğerinin saatini değiştirmez. |
| T027 | P1 C | Çok sayıda sekme aç; yatay taşma ve kapatma düğmelerini dene. | Aktif sekme anlaşılır ve kapatma erişilebilir. |
| T028 | P1 E | Destekleniyorsa kapatılan sekmeyi geri aç. | Doğru URL; eski async iş yanlışlıkla tekrar bağlanmaz. Yoksa N/A. |
| T029 | P1 E | Destekleniyorsa sekmeleri yeniden sırala. | Sekme kimliği ve medya sahipliği sıra ile karışmaz. Yoksa N/A. |
| T030 | P1 E | İki test sekmesi açıkken uygulamayı yeniden aç. | Kaydedilen sekme listesi tutarlı; ses kullanıcı isteği olmadan başlamaz. |

## 031–040 · Video ve medya kontrolleri

| ID | Öncelik / ortam | İşlem | Beklenen gözlem |
|---|---|---|---|
| T031 | P0 E | F1'i gerçek oynat/duraklat kontrolleriyle yönet. | Video ve uygulama düğmesinin durumu aynı; çift tıklama yarışı yok. |
| T032 | P0 E | Videoyu 5→30→10 sn konumlarına sar. | Gerçek saat ve altyazı yeni konuma geçer; sürekli geri sıçrama yok. |
| T033 | P0 E | F1 oynarken F2 dosyasını/sayfasını aç. | Eski ses/video durur; kontroller yeni medyaya bağlıdır. |
| T034 | P1 E | Hızı 0.75, 1, 1.5 ve 2 yap. | Gerçek playbackRate ve UI uyuşur; altyazı video saatini izler. |
| T035 | P0 E | Sesi kıs, mute aç/kapat, yüzdeyi değiştir. | Mute ve volume ayrıdır; beklenmedik tam ses dönüşü yok. |
| T036 | P1 E | Tam ekrana gir, altyazı açıkken Esc ile çık. | Altyazı görünür ve ölçekli; çıkışta native view bounds doğru. |
| T037 | P1 E | PiP destekleniyorsa gir/çık. | Görünür video ve uygulama durumu tutarlı; destek yoksa açıkça belirtilir. |
| T038 | P1 E | Kontrollü ağ gecikmesiyle buffering oluştur, sonra kaldır. | Bekleme durumu geçicidir; video ve saat kendiliğinden toparlanır. |
| T039 | P1 E | İki medya öğesi/iframe içeren fixture aç. | Komutlar görünür ana medyaya gider; arka plandaki küçük medya seçimi çalmaz. |
| T040 | P1 E | F1'i sona kadar oynat, başa sarıp tekrar başlat. | Bitiş durumu sıfırlanır; durmuş altyazı/dublaj eski sona takılmaz. |

## 041–050 · Altyazı yakalama ve dosya bütünlüğü

| ID | Öncelik / ortam | İşlem | Beklenen gözlem |
|---|---|---|---|
| T041 | P0 E | F1 için S1'i gerçek dosya seçimiyle yükle. | Dört blok doğru metin ve zamanla gelir; Türkçe karakterler korunur. |
| T042 | P0 E | 1, 4, 7, 11, 12.5 sn noktalarına sar. | İlgili cue veya boşluk doğru; önceki cue boşlukta asılı kalmaz. |
| T043 | P0 E | Aynı videoda S1'i S2 ile değiştir. | Eski cue/çeviri temizlenir; karışık iki altyazı oluşmaz. |
| T044 | P1 E | Native TextTrack içeren sayfada altyazı yakalamayı aç. | Gerçek iz keşfedilir; seçilince video üstünde doğru metin görünür. |
| T045 | P0 E | Altyazı indirilirken başka videoya git. | Eski videonun geciken altyazısı yeni videoya uygulanmaz. |
| T046 | P1 E | İki dilde iz içeren sayfada dil değiştir. | Etiket, metin ve cue zamanları seçilen izle uyuşur. |
| T047 | P1 E | Boş ve bozuk SRT'yi ayrı ayrı seç. | Uygulama çökmez; hata/boş içerik anlaşılır, eski veriyi sahte yeni sonuç diye sunmaz. |
| T048 | P1 E | BOM, CRLF, çok satır, italik etiket ve Türkçe karakter varyantlarını aç. | Metin bozulmaz; biçim etiketleri güvensiz HTML olarak çalışmaz. |
| T049 | P1 E | Desteklenen VTT/TTML fixture'larını aynı akışla aç/yakala. | Zaman ofseti ve metin korunur; format desteği yoksa sınır açık. |
| T050 | P1 C | Yakalanmış kısmi iz ve tamamlanmış iz durumlarını karşılaştır. | Kısmi sonuç tam diye etiketlenmez; seçili kaynak/tamlık anlaşılır. |

## 051–060 · Çeviri ve durdurma

| ID | Öncelik / ortam | İşlem | Beklenen gözlem |
|---|---|---|---|
| T051 | P0 E | S1 çevirisini kontrollü sağlayıcıyla başlat. | Doğru altyazı kaynağı çevrilir; normal UI'dan iş başlar. |
| T052 | P0 E | Çeviri sürerken browser görünümünde ilerlemeyi izle. | Aşama/sayı/iş görünür; yalnız arka ekranda saklanmaz. |
| T053 | P0 E | Çeviri sırasında Durdur'a bas. | İş sonlanır; geç gelen cevap iptal edilen sonucu geri yazmaz. |
| T054 | P0 E | İptalden sonra yeni çeviri başlat. | UI kilitli kalmaz; yeni iş eski sayaçları devralmaz. |
| T055 | P0 E | A videosunu çevirirken B'ye geç. | Sonuç doğru kaynak/sekmede kalır; B'nin altyazısına karışmaz. |
| T056 | P1 E | Sağlayıcı 429/503/bozuk JSON yanıtları versin. | Anlaşılır hata ve sınırlı tekrar; sonsuz istek/başarılı boş çeviri yok. |
| T057 | P1 E | Boş veya reddedilmiş sağlayıcı yanıtını dene. | Sahte tamamlandı veya boş çeviriyle kaynak kaybı yok. |
| T058 | P1 E | Cümle birleştirme açık/kapalı aynı kısa parçaları çevir; kontrollü istek metnini kaydet. | Birleştirme davranışı gerçek istekte doğrulanır; yalnız görünüm değişti diye model girdisi değişti varsayılmaz. |
| T059 | P1 E | Aynı kısa repliği iki farklı bağlamda çevir. | Farklı bağlam yanlış ortak önbellek sonucu paylaşmaz; veri olmadan anlam kalitesi iddiası yok. |
| T060 | P1 E | Kısmi sonuçtan tamamlanmaya geç; kaynak ve çeviriyi karşılaştır. | Cue kimliği/zaman eşleşmesi korunur; kaynak dosya sessizce üzerine yazılmaz. |

## 061–070 · Whisper ve aktif işler

| ID | Öncelik / ortam | İşlem | Beklenen gözlem |
|---|---|---|---|
| T061 | P0 G | İzinli 5–15 sn konuşma fixture'ında gerçek Whisper başlat. | Backend başlar; gerçek motor/cihaz ve ilerleme kayıtla doğrulanır. |
| T062 | P0 E | Kontrollü iş olaylarıyla indirme→model→transkripsiyon→çeviri geçişlerini izle. | UI her aşamayı doğru gösterir; kontrollü olaylar gerçek üretim diye etiketlenmez. |
| T063 | P0 G | Gerçek Whisper işini kısa süre sonra durdur. | Backend süreç ağacı sonlanır; iş kendiliğinden yeniden başlamaz. |
| T064 | P0 E | Aktif işler panelinden işi ve iptal düğmesini kullan. | Doğru iş iptal olur; kapatma düğmesi yalnız paneli kapatıyorsa iş iptali diye sunulmaz. |
| T065 | P0 E | Bir iş bitince kuyruktaki ikinci işe geçişi dene. | Aynı anda yanlış iki iş başlamaz; iş sahipliği/sayaçlar yenilenir. |
| T066 | P1 E | Kuyruğa iki farklı ayarla iş ekle, sonra UI ayarını değiştir. | Her iş eklendiği ayarları kullanır; son UI değeri önceki işi değiştirmez. |
| T067 | P1 G | Eksik model/FFmpeg veya geçersiz dosyayı test profiliyle dene. | Hata görünür; yalnız test ortamını boz, kurulu araçları silme. |
| T068 | P1 G | Motor CPU seçili kısa görev çalıştır; GPU seçiliyse ayrı kısa görev. | Gerçek cihaz doğru bildirilir; UI'daki GPU etiketi tek başına kanıt sayılmaz. |
| T069 | P1 G | Klip başlangıcı 10 sn olan kısa transkripsiyon üret. | Çıktı zamanları özgün video zamanına geri hizalanır. |
| T070 | P1 E | Pencere/iş görünümünü kapatıp aç; işi tamamlat. | İş durumu geri görünür; tamamlanma bildirimi yanlış sekmeye gitmez. |

## 071–080 · YouTube reklam koruması

| ID | Öncelik / ortam | İşlem | Beklenen gözlem |
|---|---|---|---|
| T071 | P0 Y | Gerçek uygulamada reklam koruması açık anonim YouTube videosu aç. | Video gerçekten ilerler; yalnız iskelet/boş oynatıcı başarı değildir. |
| T072 | P0 Y | Ana sayfa, arama sonucu ve video yan sütunundaki sponsorlu kartları gözle. | Görünür reklamlar kanıtlanır; hiç reklam sunulmadıysa NOT_OBSERVED, otomatik PASS değil. |
| T073 | P0 Y | Enforcement/adblock uyarısını ve player error metnini kontrol et. | Görünür uyarı ve oynatma etkisi kayıtlı; gizli DOM metni gerçek uyarı sayılmaz. |
| T074 | P1 E | Mevcut electron-adblock smoke'unu koş. | Yükleme bitmeden CSS/betik çalışır; aynı isimli yardımcılar çakışmaz. |
| T075 | P1 E | Site korumasını duraklat/aç; başka site/sekmedeki korumayı kontrol et. | Site tercihi diğer sekmelere/global anahtara yanlış yayılmaz. |
| T076 | P1 E | Genel reklam korumasını kapat/aç; durum ve hata göstergesini izle. | Gerçek motor ve anahtar tutarlı; kapalı koruma otomatik yenilemeyle açılmaz. |
| T077 | P1 E | Ayrı test profilinde filtre cache yokken yavaş ağla ilk sayfayı aç. | İlk sayfa indirmeye kilitlenmez; filtre gelince mevcut sayfa temel kuralları alır. |
| T078 | P1 E | Geçerli cache ile filtre sunucusunu kontrollü erişilemez yap. | Çevrimdışı eski motor korunur; filtre hatası kullanıcı sayfasını tamamen kilitlemez. |
| T079 | P1 E | HTTP hata/gövde timeout/yenileme rollback için mevcut adblock testini koş. | Hata gövdesi cache'e geçerli filtre diye yazılmaz; çalışan koruma kaybolmaz. Altı saat boşuna bekleme. |
| T080 | P1 E/Y | Gizli ilk ve görünür ikinci Atla düğmesi fixture'ı; mümkünse gerçek reklam geçişi. | Görünür düğme kullanılır, reklam bitince önceki ses döner; fixture ile canlı kanıt ayrı. |

## 081–090 · Dublaj oluşturma arayüzü ve kayıtlar

| ID | Öncelik / ortam | İşlem | Beklenen gözlem |
|---|---|---|---|
| T081 | P0 C | Browser'dan Altyazıdan ses üret penceresini aç/kapat/tekrar aç. | Modal tıklanabilir; native YouTube katmanı düğmeleri örtmez. |
| T082 | P0 E | S1 seç; seçim iptalini ve dosya adı görünümünü dene. | Seçilen gerçek dosya doğru; iptal mevcut işi/veriyi bozmaz. |
| T083 | P0 G | Hazır Vox motoruyla kısa S1/range üretimi başlat. | Gerçek WAV oluşur; ses üretildi mesajı yalnız backend başarıdan gelir. |
| T084 | P0 G | Üretim sürerken Durdur'a bas, sonra tekrar başlat. | Süreç durur, UI açılır; önbellekli devam sonucu tutarlı. |
| T085 | P1 C | Motor/referans yolu eksik olduğunda üretmeyi dene. | Eksik önkoşul açıkça bildirilir; sahte başarı yok. |
| T086 | P1 G | Kısa örnek üret seçeneğini dene. | Üretim örnekle sınırlıdır; bütün dosya istemeden seslendirilmez. |
| T087 | P1 E/G | Kalite 10/15 adım ve paralellik 4/8 seçimini kayıtla doğrula. | Seçilen parametre backend'e gider; yalnız dropdown yazısı kanıt değildir. |
| T088 | P1 E/G | Üretim kaydını aç; süre/sayı/ayar/hata durumunu çıktı ile karşılaştır. | Tamamlanma ve hata logları tutarlı; anahtar/özel ses içeriği rapora sızmaz. |
| T089 | P1 E | Ses dosyasını aç ve üretim kaydını aç düğmelerini dene. | Gerçek dosyalar açılır; çıktı yolu bulunabilir ve doğru işe ait. |
| T090 | P1 E/G | Aynı girdiyi tekrar üret; cache hit ve toplam süreyi kaydet. | Uyumlu ham ses tekrar kullanılır; sıcak/soğuk süreler karıştırılmaz. |

## 091–100 · Seçilen zaman aralığı

| ID | Öncelik / ortam | İşlem | Beklenen gözlem |
|---|---|---|---|
| T091 | P0 E/G | Yalnız seçilen zaman aralığını aç, S1 için 6–10 sn üret. | Sadece örtüşen cue'lar işlenir; tamamı üretime gitmez. |
| T092 | P0 E/G | Bu çıktıyı 0–15 sn videoda kullan. | 6–10 sn penceresinde doğru ses; aralık dışında özgün ses geri gelir. |
| T093 | P0 C | Başlangıç=bitiş, bitiş<başlangıç ve boş alanı dene. | Üretim başlamadan anlaşılır doğrulama; NaN/negatif iş açılmaz. |
| T094 | P1 C | 6, 0:06 ve 00:00:06 biçimlerini ayrı gir. | Desteklenen biçimler aynı zamana çözülür; kabul edilmeyen biçimde açık hata. |
| T095 | P1 E | Video 17.8 sn'deyken Başlangıcı videodan al'a bas. | Başlangıç seçili videonun güncel saatinden alınır; başka sekme saati kullanılmaz. |
| T096 | P1 E/G | Hiç cue olmayan boşluk aralığını seç. | Gereksiz tam üretim yok; boş aralık anlaşılır sonuç verir. |
| T097 | P1 E/G | Bir cue'nun ortasında başlayıp ortasında biten aralık seç. | Sınır cue davranışı/logu tutarlı; videoda yanlış sıfır ofseti oluşmaz. |
| T098 | P1 C | Aralık kapalıyken başlangıç/bitiş alanlarını değiştir. | Kapalı seçeneğin eski değerleri bütün üretimi gizlice kısıtlamaz. |
| T099 | P1 E/G | Aralık değiştirip planı/üretimi tekrar hazırla. | Eski cue grubu ve plan geçersizleşir; yeni aralık işlenir. |
| T100 | P1 E/G | Üretimdeyken aralık ayarlarını değiştirmeyi dene. | Çalışan işin sabit girdileri bozulmaz; UI izinleri anlaşılır. |

## 101–110 · Üretilmiş sesi videoda kullanma

| ID | Öncelik / ortam | İşlem | Beklenen gözlem |
|---|---|---|---|
| T101 | P0 E/G | Üretim bittiğinde Sesi kullan'a bas. | Dosyayı elle seçmeden çıktı doğru açık videoya bağlanır. |
| T102 | P0 E | A1 bağlıyken duraklat/devam et ve farklı konumlara sar. | Ses de durur/konumlanır; çift ses veya eski sesin sürmesi yok. |
| T103 | P0 E | A1 bağlıyken başka sekme/videoya geç. | Eski dublaj yanlış videonun üstüne çalmaz. |
| T104 | P1 E | Dublaj seviyesini ve ses kaymasını değiştir. | Ses seviyesi çalışır; pozitif kayma dublajı geciktirir, özgün videoyu sarmaz. |
| T105 | P1 E | Dublaj bağlıyken genel oynatma hızını değiştir. | Ses/video uyumu korunur; UI ve gerçek hız çelişmez. |
| T106 | P0 E | Sesi kaldır'a bas; öncesinde özgün mute tercihini kaydet. | Dublaj durur, normal hız ve önceki mute tercihi geri gelir. |
| T107 | P1 E | A1 yerine A2 bağla. | Eski ses tamamen bırakılır; iki audio öğesi birlikte çalmaz. |
| T108 | P1 E | Dublaj dosyasını yalnız test kopyasında taşı/sil, tekrar kullan. | Anlaşılır bulunamadı hatası; özgün video kalıcı sessiz kalmaz. |
| T109 | P1 E | Kısa WAV'ın sonuna ve videonun sonuna ayrı ulaş. | Bitiş temizliği tutarlı; boş ses döngüsü veya yanlış mute yok. |
| T110 | P1 E | Son çıktıyı aynı test profilinde yeniden aç. | Son dosya doğru metadata ile gelir; başka işe ait sync/background eklenmez. |

## 111–120 · Konuşmayı tam tutma ve uyarlamalı video hızı

| ID | Öncelik / ortam | İşlem | Beklenen gözlem |
|---|---|---|---|
| T111 | P0 E/G | 1 sn cue penceresine daha uzun cümle koy; videoyu yavaşlat modunda üret. | Konuşma korunur; WAV ve geçerli sync haritası oluşur, kırpma sıfır. |
| T112 | P0 E | Ölçülebilir sync fixture'ını oynat; genişletilen ve normal pencereleri izle. | Video gereken yerde yavaşlar; anlatıcı doğal hızda ve ilgili sahnede kalır. |
| T113 | P0 E | Genişletilmiş bölümün ortasına/başına/sonrasına sar. | Video→ses haritası doğru; kayma her seek ile birikmez. |
| T114 | P1 E | Bu moddayken kullanıcı hızını 1.5 yap. | Kullanıcının normal hızı korunur; uyarlama bunun üzerinden uygulanır. |
| T115 | P1 E | Uzatılmış pencere bitince normal bölüme geç. | Video normal kullanıcı hızına döner; kalıcı yavaşlama yok. |
| T116 | P0 E | Dublajı kaldır veya test controller bağlantısını kes. | Hız override'ı bırakılır; lease sona erince kendi son hızını geri alır. |
| T117 | P1 E | Çok dar pencereyle oynatıcı hız sınırını aşan harita dene. | Konuşma dosyası kaybolmaz; oynatma sınırı açıkça bildirilir. |
| T118 | P1 E/G | Sabit video/kırp modunu aynı kısa girdide dene. | Seçilen modun hız/kırpma sayıları doğru; adaptif mod sonucu diye sunulmaz. |
| T119 | P1 E | Bozuk/ters/sıfır uzunluklu sync metadata fixture'ını dene. | Geçersiz harita reddedilir; NaN playbackRate veya kontrolsüz seek yok. |
| T120 | P1 E/Y | Dublaj sırasında reklam/medya değişimi oluştur. | Dublaj reklamda durur; içerik dönünce doğru saate/hıza geri bağlanır. |

## 121–130 · Müzik ve ortam katmanı

| ID | Öncelik / ortam | İşlem | Beklenen gözlem |
|---|---|---|---|
| T121 | P0 E/G | A3 ile müzik/ortam koru seçeneğini açıp kısa üretim yap. | Ayrı background WAV ve anlatıcı WAV oluşur; sonuç doğru işe bağlanır. |
| T122 | P0 E/G | Sesi kullan'a basıp iki katmanı birlikte oynat. | Anlatıcı+arka plan duyulur; tam özgün konuşma ayrıca yanlışlıkla çalmaz. |
| T123 | P1 E | Arka plan düzeyini 0→0.75→1 değiştir. | Yalnız background değişir; anlatıcı seviyesi bağımsız kalır. |
| T124 | P1 E | İki katmanla pause/seek uygula. | İkisi aynı video olayını izler; background arkada çalmaya devam etmez. |
| T125 | P1 E | Uyarlamalı pencerede iki katmanı izle. | Background video saatini, anlatıcı sync haritasını izler; aynı yanlış saate zorlanmazlar. |
| T126 | P1 E/G | Separator yok/başarısız koşulunu kontrollü senaryoyla dene. | Uyarıyla anlatıcı üretimi sürer; bütün iş sebepsiz kaybolmaz. |
| T127 | P0 E/G | Background hazırlığı/indirmesi sırasında Durdur'a bas. | Hazırlık süreçleri de durur; yalnız Vox aşamasını iptal ediyor değildir. |
| T128 | P1 E | Yerel video/ses kaynağını seç, ardından açık YouTube kaynağına dön. | Etiket ve gerçek kaynak değişir; eski yerel yol gizlice kullanılmaz. |
| T129 | P1 E/G | Aralık seçili kısa background üret. | Katman doğru başlangıç ofsetine bağlı; kaynak indirmesinin tam olması ayrı kaydedilir. |
| T130 | P1 E | WAV'ı uygulama dışında aç ve uygulamadaki iki katmanla karşılaştır. | Tek anlatıcı WAV'ında background yok; UI/kayıt bunu tek dosya miks diye tanıtmaz. |

## 131–140 · Cümle planı, metin ve bağımsız stüdyo

| ID | Öncelik / ortam | İşlem | Beklenen gözlem |
|---|---|---|---|
| T131 | P0 E | S1 için cümle planını hazırla; grupları ve cue kimliklerini incele. | Plan ile üretilen gruplar eşleşir; farklı cümleler kontrolsüz birleşmez. |
| T132 | P0 E | Bir grubun metnini düzenle, Bu metni uygula'ya bas. | Yalnız o grubun dublaj metni değişir; kaynak SRT korunur. |
| T133 | P0 E | Metni yazıp uygulamadan başka gruba geç/üret. | Uygulanmamış taslak sessizce onaylı düzenleme sayılmaz. |
| T134 | P1 E | Kontrollü sağlayıcıyla AI kısaltma önerisi al. | Öneri kullanıcı onayı bekler; otomatik kaynak/diğer grup mutasyonu yok. |
| T135 | P1 E | Kısaltma yanıtı gecikirken SRT/range değiştir. | Eski öneri yeni plana uygulanmaz; kaynak hash kontrolü işler. |
| T136 | P1 E | Düzenlemeyi uygula, ardından Orijinale dön'e bas. | Doğru grubun özgün metni geri gelir; dosyanın başka sürümü açılmaz. |
| T137 | P1 E | Kısaltma sağlayıcısı ayarlı değilken elle düzenleme yap. | Elle düzenleme kullanılabilir; anahtar istemeden anlaşılır AI sınırı görünür. |
| T138 | P1 E | Metin/TXT stüdyosunu aç düğmesini dene. | Kurulu bağımsız arayüz açılır; yol eksikse açıklayıcı hata. Linux erişimi yoksa BLOCKED. |
| T139 | P1 G | Stüdyoda kısa Türkçe metin/TXT üret, kaydet ve dinle. | SRT/YouTube gerektirmeden çıktı oluşur; gerçek ses kalite dinlemesi ayrı etiketlenir. |
| T140 | P1 E | Stüdyo/kitap referans ayarlarını önce/sonra karşılaştır. | Browser denemesi bağımsız stüdyonun özel referans ve kullanıcı ayarlarını değiştirmez. |

## 141–150 · Tasarım, erişilebilirlik, kalıcılık ve teslim

| ID | Öncelik / ortam | İşlem | Beklenen gözlem |
|---|---|---|---|
| T141 | P1 C | Ana browser/çeviri/dublaj akışını 1280×720 ve 1920×1080'de görüntüle. | Temel düğmeler kesilmez, modallar kaydırılabilir, native katman kontrolü örtmez. |
| T142 | P1 E | Windows'ta 125%/150% DPI varsa üst menü, dosya seçici ve dublajı dene. | Tıklanan ve görünen konum aynı; CSS viewport taklidi gerçek DPI testi sayılmaz. |
| T143 | P1 C | EN/TR değiştir; yeni dublaj/reklam durumlarını ve dosya adını kontrol et. | UI çevrilir; altyazı, dosya adı ve kullanıcı metni UI çevirisine sokulmaz. |
| T144 | P1 C | Modalı Tab/Shift+Tab/Enter/Esc ile kullan. | Odak görünür ve mantıklı; kapatınca geldiği kontrole döner, kapalı modal odak almaz. |
| T145 | P2 C | Hata/başarı/ilerleme alanlarının rol ve okunabilirliğini incele. | Kritik durum yalnız renk/tooltip'e bağlı değil; aria-live ekranı sürekli doldurmaz. |
| T146 | P1 E | Hız/altyazı/kalıcı dub motor ayarlarını değiştirip test profilini yeniden aç. | Kalıcı olması tasarlananlar geri gelir; geçici range/background tercihini keyfen zorunlu kalıcı sayma. |
| T147 | P1 E | 10 kez sekme gezinme + altyazı değişimi + modal aç/kapat uygula. | Tekrarlanan audio/observer/listener artışı veya belirgin yeni yavaşlama yok. Ölçüm yöntemini yaz. |
| T148 | P1 E | Geçersiz dosya/uzak sayfa içeriğiyle normal uygulama API'sine erişimi dene. | Web sayfası Node/anahtar/rasgele yerel dosya erişimi kazanmaz; saldırı testini yalnız kontrollü fixture'da tut. |
| T149 | P0 E | Bütün testleri bitir; test süreçlerini durdur, tracked diff ve profili kontrol et. | Ürün/test kodu değişmemiş; kullanıcı verisi/anahtar rapor paketine alınmamış. |
| T150 | P0 C/E | 150 satırlık sonuç matrisini bulgular ve kanıt dosyalarıyla karşılaştır. | Her ID tam bir kez var; PASS/FAIL/BLOCKED/NOT_RUN/N/A/NOT_OBSERVED toplamı150; iddiasız ve açılabilir teslim. |

## Mevcut hedefli komutlar

Komutları ilgili grup için bir kez çalıştır; her görevde tekrar koşma. Mevcut testlerin tamamının yeşil olacağını varsayma; önceden var olan hataları da değiştirmeden ayrı kaydet. UI görevlerini sadece bu komutlara indirgeme.

```text
node tests/browser-adblock.test.js
node tests/youtube-ad-guard.test.js
node tests/browser-media-controller.test.js
node tests/browser-cosmetic-executor.test.js
node tests/browser-script-execution.test.js
node tests/youtube-player-response-pruner.test.js
node tests/youtube-player-response-integration.test.js
node tests/browser-dub-audio.test.js
node tests/dub-sync-map.test.js
node tests/dub-service.test.js
node tests/ui-locale.test.js
node tests/run-electron-smokes.js electron-adblock
node tests/run-electron-smokes.js electron-youtube-guard
npm run test:electron-bridge
```

`tests/electron-browser-video-e2e.smoke.js` ve `tests/electron-browser-public-sites.smoke.js` gerçek app/profile/medya hedeflerine örnektir. İlkini okumadan AI/QUICK/DURABLE/ISOLATION ortam değişkenlerini karıştırma. Canlı public-sites başarısı bütün siteleri kapsamaz. GPU yoksa kısa CPU Whisper yapılabilir; GPU görevini geçmiş sayma. Vox motoru olmayan ortamda dublaj UI testleri ve saf sync testleri yapılabilir, gerçek ses üretimi BLOCKED kalır.

## Sonuçların teslim biçimi

Repo dışındaki QA klasöründen şu dosyaları teslim et; ürün deposuna commit etme:

1. **REPORT.md**: test edilen tam hash, OS/Node/Electron/Chrome/Playwright/Python sürümleri, ekran boyutu/DPI, gerçek uygulama veya Chrome-controlled ayrımı, profil yolu (kişisel kısmı gizli), motor/cihazlar, başlatma komutları, süre, durum sayıları; en önemli5–10 bulgu ve doğrulanmamış sınırlar.
2. **TASK-MATRIX.csv**: tam150 satır; sütunlar `id,priority,status,surface,evidence_type,fixture,steps_executed,expected,actual,duration_ms,evidence_paths,finding_ids,blocked_reason`. CSV alanlarını doğru quote et. Başlangıçta hepsi NOT_RUN; yürüttükçe değiştir.
3. **FINDINGS.json**: aşağıdaki biçimde yalnız gözlenen bulgular. Kaynak dosyası/satırını gerçekten doğrulamadıysan null bırak. Koddan sezilen şüpheyi yeniden üretilmiş bug diye sunma.
4. **evidence/**: başarısızlık ve kritik geçişler için ekran görüntüsü, gerekli kısa kayıt ve redakte log/trace. Başarılı her atomik tıklamanın videosu gerekmez. HAR/trace çerez ve yetkilendirme başlığı taşıyabilir; paylaşmadan temizle. Özel referans sesini veya profil veritabanını pakete koyma. Kanıt yoksa yok yaz.
5. QA sürücüsü/fixture üretim betikleri: repo dışında yazdığın testler ve nasıl koşturulacağı; ürün dosyalarını kopyalayıp düzeltmiş sürümünü kullanma.

Durumlar:

- **PASS**: ilgili yüzeyde beklenen davranış kanıtlandı; hangi seviyede olduğu evidence_type alanında açık.
- **FAIL**: beklenen davranıştan gerçek sapma gözlendi; actual ve mümkünse tekrar sayısı var.
- **BLOCKED**: eksik Electron/GPU/model/izin/hesap/ağ/araç nedeniyle ilgili katman test edilemedi; neden yazılır.
- **NOT_RUN**: sıraya gelmedi/süre bitti. BLOCKED veya PASS ile karıştırma.
- **N/A**: özellik bu sabit sürümde gerçekten yok veya koşul uygulanamaz; kaynak/UI incelemesiyle gerekçe ver.
- **NOT_OBSERVED**: örneğin canlı reklamın sunulması veya aralıklı olay gerçekleşmedi; reklam engellendiği ispatlanmadı.

```json
{
  "tested_commit": "8e3d9a7628eaa288d4627e461bccc81d250a85e0",
  "findings": [
    {
      "id": "F001",
      "task_ids": ["T000"],
      "severity": "P1",
      "title": "ŞABLON: Gerçek gözlemle değiştir; örnek bulgu değildir",
      "surface": "electron-local",
      "evidence_type": "ui",
      "preconditions": [],
      "steps": [],
      "expected": "",
      "actual": "",
      "reproduction": { "attempts": 0, "failures": 0 },
      "evidence": [],
      "suspected_source": null,
      "regression_status": "unknown",
      "confidence": "unconfirmed"
    }
  ]
}
```

Bu JSON yalnız biçim örneğidir; teslimde şablon F001/T000 satırını kaldır. Bulgu yoksa `findings: []` kullan. Aynı kök hatayı20 farklı bug diye çoğaltma; etkilenen task_ids listesinde birleştir. Altyazı doğruluğu, gerçek klon ses kalitesi veya anti-adblock başarısı için yalnız DOM/kontrollü sağlayıcı kanıtını yeterli sayma. Son yanıtta kaç görevin gerçekten çalıştığını, kaçının engelli/koşul gözlenmedi durumunda kaldığını ve kaynak kodun değişmediğini açıkça söyle.
