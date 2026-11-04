# Bekleyen işler

Son durum kontrolü: **2026-11-04**. Bu dosya açık işlerin giriş noktasıdır. Eski raporların tamamı açık bug değildir; kodda doğrulanmadan yeniden açılmaz.

## Durum kuralı

Her kayıt: **durum + kapsam + dal/PR + kanıt + kalan kabul koşulu + kesin sonraki adım** içerir. Durumlar: planlandı, sürüyor, kullanıcı onayı bekliyor, engelli. Tamamlanan işi burada açık tutma; doğrulama/devir bağlantısıyla CHANGELOG.md'ye geçir. Bir görev kapanmadan veya sohbet değişmeden yarım işi güncelle. Tarihsel test başarısını güncel kabul diye kullanma.

## P001 — Sinematik hareket performansı

- **Durum:** ölçülen performans açıkları kayıtlı; kullanıcı 2026-11-04 kararıyla yeni ekranlar için bloklayıcı değil. PR805 ana sürüme alınmadı. Home/Keşfet/film tasarımı kullanıcı tarafından kabul edildi.
- **Dal/PR:** codex/cinema-performance-round5 · [draft PR805](https://github.com/dorukakindev/whisper-browser/pull/805).
- **Son ürün:** d53ffb5a65e724afce52696bafa08657ab97a5dd; teslim commit'i 5aa8e5637786093f3864ca31ec88b49b856b5630. Başlangıç ürün/master:922f5474c517e15d9fb060633605dd0267d62f86. Bu belgenin merge'i ürün kodunu değiştirmez.
- **Kanıt:** [ölçümler ve trace dosyaları](https://github.com/dorukakindev/whisper-browser/blob/codex/cinema-performance-round5/docs/implementation/cinematic-performance-round5-2026-11-03/PERFORMANCE.md), [ayrıntılı devir](https://github.com/dorukakindev/whisper-browser/blob/codex/cinema-performance-round5/docs/devir/2026-11-03-1519.md).
- **Gerçek kalan sorun:** son kaynak-güvenli sürümde1440 detay69,5ms, scroll55,5ms;1920 detay20,8ms maksimum. Önceki27,8ms farklı denemeydi; son sürümün başarısı değildir.41 hedefli kontrol ve son9 hareket kontrolü, performans kabulü yerine geçmez.
- **Önceki sayısal hedef (artık bloklayıcı değil):** onaylı hareket/görünüm korunarak her etkileşim maksimum<20ms, p95<16,7ms;1440/1920'de son revizyon için60s görünür/odaklı aktif hero CPU<%3 ve GPU kaydı. Son CPU ölçümleri son görsel katman değişiminden önce; yeniden doğrulanmalı. Son revizyona ait native1440/1920 karşılaştırması ve0/100/200/400/900ms kareler gerekli.
- **Sonraki adım:** bu dalı tekrar aç; işaretli1440 detail/scroll rAF aralıklarını renderer/compositor/raster thread'leriyle aynı zaman ekseninde eşleştir. Sabit blur yüzeyinin ilk raster'ını, rota microtask'ini ve ilk style/layout/commit fazlarını tek değişkenle incele. Renderer fetch'i geri ekleme; büyük JPEG'i renk örneklemek için ana thread'de kopyalama. Sayısal hedef tutmadığında gerçek ölçümü bildir; sonraki ekranı durdurma. PR805 için son revizyonun görünüm/akış incelemesi ayrı kalır; bu tur merge edilmedi.

## P003 — Kütüphane film detayının canlı kabul sınırları

- **Durum:** onaylı tasarım PR808 içinde uygulandı; kullanıcı 2026-11-04 tarihinde master birleştirmesini istedi. Canlı kabulün kalan kısmı açık.
- **Dal/PR:** codex/library-film-motion-preview · [PR808](https://github.com/dorukakindev/whisper-browser/pull/808); ürün HEAD `942bd7b5cc17141d3100691aacd40b79167108f3`.
- **Kanıt:** önceki izole Windows 1440/1920/940 incelemesi; bu teslimde temiz worktree üzerinde katalog/film/panel hedefli kontrolleri 18/18. [Birleştirme teslimi](docs/devir/2026-11-04-0936.md).
- **Kalan kabul:** canlı TMDB, büyük kişisel kütüphane ve tüm yönetim yolları; kaydedilmiş film açılış/kaydırma performans açıkları kapanmış sayılmaz. P001 ayrı kalır.
- **Kesin sonraki adım:** kullanıcı gerçek kullanım doğrulaması istediğinde ilgili kişisel katalog akışını açık seçimlerle doğrula; yeni tasarım veya performans turunu kendiliğinden başlatma.

## P004 — Browser panelinin canlı kabul sınırları

- **Durum:** onaylı panel ve üç iç tasarım uygulandı; kullanıcı 2026-11-04 tarihinde PR808'in master'a birleştirilmesini istedi. Canlı kabulün kalan kısmı açık.
- **Dal/PR:** codex/library-film-motion-preview · [PR808](https://github.com/dorukakindev/whisper-browser/pull/808); ürün HEAD `942bd7b5cc17141d3100691aacd40b79167108f3`.
- **Kanıt:** [uygulama, native kontroller ve sınırlar](docs/implementation/browser-panel-2026-11-04/README.md); bu teslimde temiz worktree üzerinde hedefli testler ve değişen JS sözdizimleri geçti.
- **Kalan kabul:** gerçek sağlayıcı indirmesi/açma, yüklü canlı izde nonzero senkron, gerçek uzun iş iptali, site profili yeniden açma, fullscreen/Shadow DOM yalıtımı ve etkileşim trace ayrımı. Fixture sonucu bunları kapatmaz.
- **Kesin sonraki adım:** kullanıcı gerçek kullanımda istediğinde bu akışları ayrı kısa turda doğrula; mevcut uygulama/ileri ayarları koru. CI bekleme işi başlatma.

## D001 — Mevcut rapor indeksinin eksikleri

- **Durum:** planlandı; bu belge düzenlemesinden önce de var olan doğrulama eksiği.
- **Kanıt:** değişmemiş master indeksinde node tests/docs-index-integrity.test.js başarısız: R835,837,838,839,840,841,842,845,847,849,851,852 dosyaları mevcut, [INDEX.md](docs/raporlar/INDEX.md) içinde karşılıkları yok. Bu, bu raporların bütün bulgularının açık olduğu anlamına gelmez.
- **Kabul:** mevcut raporları silmeden doğru indeks bağlantılarını eklemek; genel belge indeks kontrolünün geçmesi. D:\Whisper Local içindeki kişisel INDEX.md değişikliği korunmalı.
- **Sonraki adım:** ana kopyanın kişisel indeks farkını ve depodaki indeksi karşılaştır; yalnız eksik kayıtları onaylı durumlarıyla birleştir. Bu tur kişisel indekse dokunulmadı.

## Başka bir oturumdan iş devralırken

DEVIR-NOTU.md'nin ilgili son kaydını ve aktif dalı kontrol et. Yeni yarım işler buraya ayrı ID ile eklenir; eski rapor arşivi veya plan dosyası otomatik olarak yüzlerce açık işe dönüştürülmez. Kullanıcı kararıyla ertelenen/kapsam dışı işin durumunu açık yaz. Ana programda hangi kodun bulunduğunu git HEAD ile yeniden doğrula.

## P005 — Oynatıcı/V3 kabul ve teslim

- **Durum:** oynatıcı, katalog/podcast, asistan bağlamı ve beş V3 yüzeyi bağlı. Rota ve arşiv bağlantıları geri alınabiliyor. Katalog karşılaştırması kalıcı ve revizyonlu. Kaynak işaretli tamamlanmış yanıttan dossier/timeline, küçük sohbet referansı ve ayrı kullanıcı düzeltme katmanı bağlı. İki gerçek YouTube RSS kanalı ve kısa canlı DeepInfra yanıt/kanıt/artifact kabulü geçti.
- **Dal:** `codex/player-v3-integration-20261104` ve [taslak PR #809](https://github.com/dorukakindev/whisper-browser/pull/809). PR808 içeren taban `459bf2e0bbbf0bfb19566ed16080806bb6e76126`. Son ürün `51638fbe090fdf1a26825d75e8feec1ee6f94735`.
- **Kanıt:** [11:27 dolu not defteri ve iptal notu](docs/devir/2026-11-04-1127.md). 70 notla Windows taşıma/tam undo, ikinci bağlama ve eşzamanlı not koruması geçti. Yeni regresyon ve eski 8 kontrol geçti. Canlı asistan stream iptali ve kısa gerçek FFmpeg iptali doğrulandı. [11:16 RSS ve canlı sağlayıcı notu](docs/devir/2026-11-04-1116.md). İki kanal 15’er doğru kimlikli kayıt verdi, TED filtresi 1440/940 geçti. Canlı DeepInfra Flex yanıtı iki kaynaklı paragrafla dossier olarak kaydedildi. Hedefli 6 test sonucu ve parserın 35 kontrolü geçti. [11:05 kaynaklı çıktı notu](docs/devir/2026-11-04-1105.md). 11 hedefli test, Windows asistan menüsü/1440/940, yeni süreçte yeniden açma ve native JSON export geçti. Fixture kullanıldı, canlı LLM kabulü sayılmadı. Geniş koşudaki iki eski test hatası aynı başlangıç kodunda doğrulandı ve notta açık. [10:53 kalıcı karşılaştırma notu](docs/devir/2026-11-04-1053.md). Revizyon çatışması, yedek roundtrip ve gerçek Windows 1440/940 kaydetme/yenileme/geri yükleme geçti. [10:42 devir notu](docs/devir/2026-11-04-1042.md). Podcasting 2.0 gerçek RSS keşfi ve MP3/SRT oynatma, TED mevcut kanal listeleme ve iki geri alma akışı Windows’ta sınandı. 16 hedefli test geçti. Önceki mpv, oynatıcı, asistan kapsamı ve geniş/dar ekran kanıtı önceki devirlerde.
- **Kalan kabul:** önceki 404 bu turda tekrarlanmadı; 404 kurtarması kontrollü testte, resmi iki RSS yolu canlı doğrulandı. Uzun analiz iptali, canlı dublaj, DRM, start.bat/CUDA, fiziksel HDR/çok kanallı çıkış ve fullscreen/Shadow DOM yalıtımı açık. Arşiv geri almada izleme geçmişi izole Windows profilindeki gerçek kayıtla sınandı. Dolu not defteriyle taşıma/geri alma artık doğrulandı. Asistan stream ve kısa FFmpeg iptali geçti, uzun gerçek analiz/yorum iptali açık.
- **Tamamlanan özellik kapsamı:** [12:03 uygulama ve kabul kaydı](docs/devir/2026-11-04-1203.md), ürün `51638fbe090fdf1a26825d75e8feec1ee6f94735`. Önceki denetimdeki matrix hücre düzenleme, dossier/timeline CSV, kalıcı kapalı spoiler ve dört formatta sızıntısız export; ayrı özgün dil/ISO yapım ülkesi/kimlikli yönetmen koşulları; RSS onaylı film ilişkisi ve alıntıya bağlı kullanıcı tür/görüş sınıflandırması tamamlandı. Yayıncının süre/dil verileri ve yerel dosyanın gerçek FFprobe ölçümleri filtreye bağlı. Bilinmeyen veri tahmin edilmiyor; zamansız podcast yazısı altyazı sayılmıyor. RSS görüşü otomatik AI çıkarımı değil, kaynak alıntılı kullanıcı işaretidir. Ayrı Spotify/RSS eşleme paketi bu işte uygulanmış sayılmaz.
- **Yeni kanıt:** toplam 58 kısa hedefli test sonucu, değişen JS sözdizimleri ve staged diff kontrolü geçti. Gerçek Windows 1440/940 matrix, dossier/timeline, koşullu katalog ve RSS akışları geçti. Yerel dosyada gerçek FFprobe süre/TR ses okuması ve filtre; yerel takip kapat/aç ile kayıt koruması doğrulandı. 600 dosya/ilk 20 hata/yeniden deneme regresyonunda probe mock; gerçek 600 medya çözümü sayılmıyor. Native mpv d3d11va ve giriş PQ/6 kanal ile hedef SDR/2 kanal ayrımı tekrar ölçüldü.
- **Kesin sonraki adım:** kullanıcının yeni görsel reddi/onay koşulu önceliklidir: önce P006 maket onayı ve onay sonrası native aktarım. Bu tamamlanmadan eski görsel testler tasarım kabulü sayılmaz. Uzun analiz/yorum iptali, canlı dublaj/start.bat/CUDA, DRM/fullscreen/Shadow DOM ve fiziksel HDR/çok kanal kabulleri ayrıca açık kalır. PR taslak, master/kişisel ana kopya bekler. GitHub Actions başlatma.

## P006 — Onaylı maketle native eşleme — kabul adayı

Önceki Windows durdurma ve ilk port sınırları [15:39 devirde](docs/devir/2026-11-04-1539.md) korunur. Aşağıdaki17:00 kaydı güncel durumdur.

### 2026-11-04 17:00

- **Durum:** son kullanıcı promptu önceki redesign talebinin yerine geçti; onaylı maketin kararları korunarak native sapmalar düzeltildi. **Native kabul yok; staging/commit/push/merge yok.** [17:00 devir](docs/devir/2026-11-04-1700.md).
- **Dal/HEAD:** `codex/player-v3-integration-20261104`, PR809 taslak; yerel ve origin takip HEAD `88e8c9ba0bd7dff46100de7b6a0e144f7450ac89`. Ana uygulama kopyası güncellenmedi; iki korunmuş envelope dosyasına dokunulmadı.
- **Kanıt:** artifacts/Whisper-20-ekran-maket-native-2026-11-04-son.zip tam10maket+10native1440×900/SHAmanifest. round2-20261104 altında180son native hücre/10temas/10çift/ayrı etkileşim kareleri/8.48s renderer hareket videosu/75kontrol haritası. Son Windows DPR1 gerçek; eski DPR1.5 kanıtları korunuyor. Gerçek inner scroller/root/viewport/dış kontrol taşması0, küçük metin/hedef0; dekoratif ham scrollWidth uyarıları raporda.
- **Test/ölçüm:** 11hedefli test dosyası, kaynak atfından7sn seek/vurgu ve gerçek kaynak değişiminde ret; spoiler/export/yıl/alan koruma testleri, JS/preload kontrolleri geçti. Native p95 7–7.1ms; max hedefi3ekranda,5sn ham bir-çekirdek idleCPU hedefi8ekranda kaçtı; trace'ler var.
- **Açık:** yeni mpv/OSD WGC görseli helper timeout/geometri hatasıyla alınamadı. Hide/focus/minimize gerçek kabulü CDPfocus emülasyonu nedeniyle açık; gereksiz IPC denemesi tamamen geri alındı, main/preload temiz. PNG hareket hissi/OS tooltip/fiziksel GPU başarısı sayılmaz. Sağlayıcı/CUDA/HDR/DRM/uzun analiz kabulleri önceki gibi açık.
- **Tam sonraki adım:** kullanıcı doğrudan20PNG ZIP'ini ve güncel raporu inceleyip native kabul verecek; öncesinde commit/push yok. Kabul sonrası açık WGC/lifecycle ve trace sapmalarını hedefli kapat; sonra dosya listesini gösterip ürün/belge commitlerini ayırarak `[skip ci]` ile ilerle. Onaylı maketi yeniden tasarlama; maket onayını tekrar isteme.

## P007 — Podcast ve kalan düzeltmeler — 2026-11-04

- Kullanıcı P006 native tasarımını kabul etti; PR809 master'a `0024560322df4ee537acacead1ab493af3be0530` ile alındı ve ana yerel kopya güncellendi. Eski matris/CPU/WGC kabul kapıları kullanıcının yeni kısa test tercihiyle kaldırıldı; tekrar çalıştırılmayacak.
- Podcast, browser menüsü ve seçilen eski tasarım düzeltmeleri ürün `65d95f2bb4691583a80f0bdd540a8faaace66810`; dublaj düzeltmesi ayrı `3f68edeb`. Kısa hedefli testler geçti. [Devir](docs/devir/2026-11-04-1730.md).
- Canlı Spotify/RSS sağlayıcı, model/GPU/CUDA kabulü bu turda yapılmadı; Spotify ses/timeline hakkı varsayılmaz. Bunlar uygulanmış kodun mock/yerel kontrolleriyle karıştırılmayacak.
- Son adım: yeni PR'ı `[skip ci]` ile birleştirip ana kopyayı kişisel değişiklikleri koruyarak güncelle; kullanıcı sürekli merge yetkisini açıkça verdi, yeniden sorma. Eski tasarım ve research dosyaları tarihsel öneri olarak kalır; güncel uygulama sahibi bu devirdeki koddur.

### P007 sonuç

Tamamlandı: PR810 master'a `486e25e6a4192dbfd3ed5276bda12a28fe9add4b` ile birleştirildi; uzak master, çalışma dalı ve `D:/Whisper Local` ana kopyası aynı kimlikle doğrulandı. Kişisel üç tracked değişiklik aynen korundu. Ürün açık işi kalmadı; canlı sağlayıcı/GPU ve kaynak byte fingerprint sınırları devirde açıkça belirtiliyor. Tekrar ağır kabul testi/izin penceresi/Computer Use yapılmayacak. PR809 da öncesinde birleştirilmiştir.

## Sıralı hedefler — uygulama tamamlandı, 18:33

Kullanıcının önceki görev bitmeden yenisine geçmeme kararıyla G1–G5 sıralı kapandı. [Plan](docs/implementation/podcast-completion-ordered-goals.md), [son devir](docs/devir/2026-11-04-1833.md). Bu kayıtta yeni açık ürün görevi yok; eski raporlar topluca yeniden açılmadı.

| Hedef | Birleşen teslim |
|---|---|
| G1 Podcast P1–P6 | PR812 · 3d0e80b4 |
| G2 Güncel denetim açıkları | PR813 · fd91f015 |
| G3 Eski paketlerin uyumlu parçaları | PR814 · e85359bd |
| G4 Kısa genel bug turu | PR815 · a9b7842e |
| G5 Bütünlük/kayıt | Ürün master/çalışma/ana kopya `a9b7842e24f8a697f9c210f3ae360ac9d3f83e6d`; son kayıt yalnız belge |

Doğrulanmayan canlı sınırlar: gerçek Spotify/RSS sağlayıcılarının uçtan uca model/GPU/CUDA sonucu, gerçek 60/61 takılması ve referans ses kalitesi, Windows UNC/reparse/OS safeStorage, kişisel start.bat ve tam native mpv/site davranışı. Bunlar yeni teyitli bug sayılmadı. Kesin sonraki adım yalnız gerçek kullanımda belirtilen bir arıza için ilgili log/kaynak sahibi üzerinden kısa yeniden üretimdir; ağır matris/CPU/Computer Use/erişim penceresi testleri başlatılmaz.

Mevcut ayrı test sınırlaması: assistant-resilience Pipeline eski selector sayımı değişmemiş tabanda da2/1; güncel hedefli iptal testleri geçti. Yeni ürün regresyonu gibi sunulmadı, eşik/assertion gevşetilmedi. Kişisel indeks/offline manifest/start.sh farkları ve korunan envelope dosyaları bu teslimin dışında kaldı.

## P008 — Kısa canlı podcast kabulü — 2026-11-04

Kod ve canlı örnek kabulü tamam: 4c248d2fb5a6d0d3c157560b2c6b4866b4590060; dal `codex/podcast-live-acceptance-20261104`. [Devir](docs/devir/2026-11-04-2302.md). Gerçek Spotify metadata/onay→NPR RSS→30–42sn CUDA Whisper small→ayrı DeepInfra çeviri→tam4+4 cue kaydı ve yeniden okuma geçti; izin penceresi çağrısı0. Eski genel canlı doğrulanmadı kaydının yalnız bu örnek kapsamı kapanmıştır; tüm bölümler/uzun işler/DRM/genel kalite açık iddia değildir. Sonraki adım PR/master/ana kopya kimliği doğrulaması; yeni geniş test turu yok.

## P009 — Asistan ve zevk profilinin geliştirilmesi — 2026-11-04

Uygulama ve kısa kabul tamam: `f3d5d41069a81cba0e56ccc999ed4cf23ee4038d`, dal `codex/assistant-taste-depth-20261104`. [Devir](docs/devir/2026-11-04-2341.md), [plan](docs/implementation/assistant-taste-depth-2026-11-04.md). Kanıt/güncellik/kapsam, gerçek kütüphane önerileri, onaylı genel tercih aracı ve taslak koruyan profil UI bağlandı. Sonraki adım PR/master/ana kopya eşitliğinin son teslimde okunması; yeni ağır test turu yok. Canlı model kontrolü izole test profiliyle geçti; kişisel profile canlı yazı/tüm model yanıt kalitesi/hover-hareket kabulü iddia edilmez. Ayrı iki eski yorum fixture hatası devirde açık; yeniden ürün bug’ı sayılmadı.

## P010 — Web videolarında çift dilli çalışma — 2026-11-05

Uygulama ve kısa kabul tamam: `e66b489b6009e98e9fff5a230631f58721b7df91`, dal `codex/browser-bilingual-entry-20261105`. [Devir](docs/devir/2026-11-05-0155.md). Browser doğrudan görünür; web videosu korunarak çift dilli panel ve gerçek mevcut işlemlere erişim sağlandı. İzole web testi2+2 cue/gerçek seek/tek video/izin0 ve geniş-dar görünüm geçti. Bu tur gerçek YouTube/LLM/ASR/Canlı Whisper çağrısı iddia edilmez. Sonraki adım PR/master/ana kopya eşitliğinin son teslimde doğrulanması; yeni ağır test turu yok.

## P011 — Podcast kabul açıkları — 2026-11-05

Kod ve kısa kabul tamam: `9491f99a9fce839b29f23374a09158f5c3f43a65`, dal `codex/podcast-acceptance-gaps-20261105`. [Devir](docs/devir/2026-11-05-0221.md), [10 koşul ve kanıt](docs/implementation/podcast-acceptance-gaps-2026-11-05.md). Web/YouTube podcast geçişi, kaynak/çeviri/konum/hızla RSS yeniden açma, readonly kaynak çevirisi, publisher önceliği ve gizli asistan sahipliği kapandı.20 hedefli test+3 mevcut runtime kontrolü ve iki izole native akış geçti; canlı YouTube gözlendi, yeni model/GPU yok, önceki NPR zinciri ayrı kanıt. Yeni bilinen uygulanmamış ürün açığı yok; her site/uzun iş/kişisel start.bat genellemesi yapılmaz. Sonraki adım yalnız PR/master/ana kopya kimlik doğrulaması; ağır test tekrarına gerek yok.

## P012 — Tarayıcı yan panel düğmesi — 2026-11-05

Düzeltme ve kısa kabul tamam: `becde623c62b7cc01f7e2bc7e4e6a8739f1caad5`, dal `codex/browser-sidebar-toggle-20261105`. [Devir](docs/devir/2026-11-05-0225.md). Görünür düğmenin yerel toggle vekilliği ve rail/açık ayrımı giderildi; gerçek geniş/dar ilk tık açma-kapama-geri açma geçti, izin0. Sonraki adım PR/master/ana kopya kimlik eşitliği; ağır test gerekmez.
