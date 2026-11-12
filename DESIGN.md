---
version: alpha
name: Whisper Browser
description: Türkçe video, altyazı ve çeviri çalışma istasyonu.
colors:
  background: '#111215'
  surface: '#191b1f'
  raised: '#24272d'
  border: '#383c43'
  text: '#f1f0ed'
  muted: '#b0b4bd'
  primary: '#e2ab5b'
  danger: '#d06b63'
typography:
  sans:
    fontFamily: "IBM Plex Sans, Segoe UI, sans-serif"
  display:
    fontFamily: "Sora, Segoe UI, sans-serif"
  mono:
    fontFamily: "JetBrains Mono, Consolas, monospace"
rounded:
  DEFAULT: 8px
  sm: 6px
  md: 8px
spacing:
  control-gap: 8px
  section-gap: 12px
components:
  button: {}
  input: {}
  disclosure: {}
  status: {}
---

# Whisper Browser tasarım kaydı

## Onaylı V6 birleşmesi — 2026-11-13

Kullanıcının V6 inceleme/birleştirme talimatı bu paketin film alt transport ve altyazı görünüm düzenini kapsar; aşağıdaki V3 aşamasındaki transport kapsam sınırı tarihsel kalır. Üst medya gezinmesi, sıcak amber/grafit ve ileri araçlar korunur. Filmde araçlar transport’ta, Podcast/Çift dilli görünümünde Aa menüsü üst araçlardadır. Asistan baloncuğu amber ve görünür kalır. Transkript çekmecesi transport’un üzerinde biter; iki HTML Stremio eylemi içerik yüksekliğine göre birlikte dizilir. Native mpv üzerinde etkisiz CSS görünüm ayarları sunulmaz; mevcut native ayar sahibi açılır. İzole 1920×1080 Chromium kompozisyonları gözle kontrol edildi; gerçek Windows native pencere/gösterge ve mpv görsel kabulü ayrıca doğrulanmış sayılmaz. [Devir](docs/devir/2026-11-13-0216.md).

## Kümülatif V3 üst yapı / Podcast / Stremio — 2026-11-11

Onaylı paket sıcak amber/grafit kimliğiyle uygulanır: tek uygulama/Sahne/altyazı üst yüzeyi, ortada mod anahtarı; Transkript/İşlemler önde, Uyku/Klasik/Tam ekran erişilebilir simgeler. İşlemler bağlam satırı kategori/içerik ızgarasından ayrılır ve transport'un üstünde kalır. Podcast yayın/sekme/filtre ve Stremio eklenti/kaynak yüzeyleri mevcut bileşenleriyle biçimlenir; alt transport/büyük Sahne-Raf yeniden tasarımı yapılmaz. Üstteki asistan baloncuğu amber38px yuvarlak kalır, kapalı eklenti yazıları tüm satır opacity'siyle soldurulmaz. Yeni CSS dosyaları scoped; mevcut araçlar/kuyruk/saat/kaynak sahipliği korunur.

## Ortak yapım ayrıntısı ve görünür eylemler — 2026-11-11

Stremio film kartları ayrı film tasarımı üretmez; Keşfet'in mevcut MediaDiscoveryUI/CinemaUI ayrıntı sayfasını açar. Kaynak seçimi ortak hero'nun birincil eylemi, kütüphane eylemi ikincildir; eklenti kaynak/bölüm/listem/değerlendirme araçları ortak kaynak alanındadır. Benzer film önerisi yalnız film ayrıntısındaki bir seçenek olarak sunulur, Keşfet kartlarının altında veya sağ tık menüsünde tekrarlanmaz. Ana sayfa açık oturum kartı görünür erişilebilir X ile kapatılabilir. Üç oynatıcı modunda Transkript ile İşlemler arasındaki amber asistan baloncuğu mevcut asistan sahibini açar. Üst medya gezinmesi, sıcak amber/grafit, hareket tercihi ve ileri araçlar korunur.

## R854 uygulama tamamlaması — 2026-11-11 03:11

Sıcak amber/grafit ve üst medya gezinmesi korunur. Podcast liste kontrolleri devam kartından önce, ikinci bilgiler mevcut bölüm araçlarında; yayın adı klavye odağında tam görünür. Asistan kaynak ayrıntısı yanıtın scroll'unu değiştirmeyen katmandır; Yanıta dön ve açık işlem ayrıntısı vardır. Bağlam seçimi kaynak ayrıntısında kalır. Yorum önizlemesinin yapım/yıl/sayı ve dönüş başlığı üst medya gezinmesinin altında görünür tutulur. Seçili video kopyasının adı/türü/konumu genel kişisel kayıttan ayrı, oynatma eyleminin yanında taşınır ve CinemaUI yeniden kurulumunda korunur. Yeni renk literali veya baskın alternatif palet eklenmedi. Kontrollü Windows Chromium görselleri gerçek Electron/monitör kabulünün yerine geçmez. [Kapsam ve sınırlar](docs/devir/2026-11-11-0311.md).

## Güncel tasarım yönü — 2026-11-11 02:33 · sıcak amber geri döndü

Kullanıcı nötr/siyah-beyaz yönü açıkça geri çekti: **canlı, sıcak ve sinematik bir arayüz** isteniyor. Grafit zemin, bal/amber ana vurgu, renkli kapak ve dengeli ortam ışığı korunur. Vurgu yalnız etkileşim anlarıyla sınırlı değildir; içerik ve tipografi hiyerarşisiyle birlikte kullanılabilir. Soluk, ruhsuz bir gri görünüm hedeflenmez. Tek palet sahipliği ve erişilebilirlik sürer: koyu aksan `#e2ab5b`, hover `#f2c681`, üst yazı `#21170c`; açık tema amberi `#865019`. Sahne'nin üretilmiş kapağı ve ortam ışığı yeniden sıcak renklidir; asistan/Browser aynı aksanı kullanır, ayrı baskın buz mavisi palet açmaz. Aşağıdaki nötr karar önceki tarihsel karardır ve **artık yürürlükte değildir**.

Orijinal oyuncu başlığı Sahne'nin üstünde kalır; ayarlar, kendi modern oyuncu İleri araçlar dialog sahibini açar. Zamanlı Whisper sonucu, zaman kontrolü kaldırılarak değil, aynı bölüme/hash'e ait doğrulanmış ses kopyası açılarak kullanılır. Bunlar görünüm uğruna kaynak/izin kapılarını gevşetmez.

## Önceki tasarım yönü — 2026-11-11 02:17 · yürürlükten kalktı

Kullanıcının güncel kararı önceki amber ve projeksiyon mavisi yönünü geçersiz kılar: **nötr, sinematik zemin; vurgu yalnız etkileşim anlarında (odak, seçili öğe, ilerleme) ve düşük doygunlukta. Amber de buz mavisi de baskın değildir.** Tipografi, genişlik, kapak/afiş, kaynak kimliği, ileri araçlar ve hareket tercihleri korunur. Semantik hata/başarı renkleri ile gerçek kapak/video renkleri dekoratif aksanla karıştırılmaz.

Tek aksan sahibi `src/renderer/theme-palette.css` içindeki `--theme-accent` rolüdür: koyu temada `#b8b6b0`, açık temada `#595c5e`. Hover ve üst yazı karşılıkları aynı palette tanımlanır. Player/Browser/asistan ve küçük oynatıcı ayrı amber/mavi palet açmaz. Üretilen sayfa araçları `src/theme-palette.js` ile aynı CSS kaynağını okur; kullanıcı/site CSS'i bu köprüye alınmaz. Yeni CSS `var(--…)` ve `color-mix(...)` kullanır. R854'ün 571 sabit renk bütçesi aşılmaz; birleştirmede 574'e çıkan sayı token aktarımıyla 566'ya düştü, sayıyı 571'e tamamlamak için renk eklenmedi. Eski 419 eşikli test gevşetilmedi.

Aşağıdaki tarihli kompozisyon kayıtlarında geçen sıcak/amber/mavi tercihleri tarihsel bağlamdır; güncel renk uygulamasında bu bölüm geçerlidir. R854'ün kompozisyonları korunarak 1920×1080 Film/Podcast/Browser ve asistan paneli izole Windows Chromium'da görüldü. Bu, start.bat/Electron/WebContentsView/GPU veya canlı kişisel profil kabulü değildir.

## Browser kaynak ve durum incelemesi — 2026-11-10 22:09

Altyazı araçları içinde “Sekmeler ve altyazı durumu” tek açılır yüzeydir. Üstte kaynak/iş/onay/hata taşıyan sekme satırları, altta yalnız etkin kaynağın saat kanıtı, eksik aktarım aralıkları ve iki kanalın restore/köken özeti vardır. Saat yazısı güncellenirken odaktaki kontroller korunur; aralık listesi sınırlı ve kendi içinde kaydırılır. Grafit/amber tokenları, üst medya menüsü ve mevcut altyazı/ileri kontroller korunur. Kanal retry ve kaynak bağlı eksik aktarım birbirinden ayrıdır; okunamayan dosya için otomatik seçici veya yeni çeviri açılmaz. Gerçek Windows/ASUS görsel kabulü bu tur yapılmadı; DOM kontrolü estetik kabul değildir.

## Kapaklı arşiv, takvim ve gerekçeli öneriler — 2026-11-10

Kişisel arşiv Kayıtlarım / Takvim / Zevkime göre çalışma alanlarına ayrılır; tek alan görünürdür. Tür havuzu seçimi korunur. Kapak yüklenirken tür kimliği kalır, gerçek görsel geldikten sonra kapak görünür; harici resim hatası boş siyah kutuya dönüşmez. İş ilerlemesi gerçek done/total oranıdır ve durdurulabilir. Takvim aylık 7 sütun ve gün ajandasıdır; darda ajanda alta geçer. Ay atlama ve son tarihli kayda doğrudan erişim vardır. Kaynak bitiş tarihi ile uygulama işaretleme tarihi ayrıdır. Öneri kartında kaynak kapak, destek/karşıt puan, gizlenebilir dayanak/sınır ayrıntıları ve yerel sıraya ekleme bulunur; yüzdeyle beğeni iddiası yoktur. Genişte iki, darda tek sütun; mevcut grafit/amber ve tipografi tokenları kullanılır. Ayrıntı: [araştırma/uyarlama](docs/research/2026-11-10-recommendation-repositories.md).

## Kişisel arşiv ve Zevkim — 2026-11-10

İzlediklerim üst medya menüsünde görünürdür. Tür havuzları ve durum filtreleri iki farklı satırdır; arama filtrelerin yanında, devam edilenler baştadır. Genişte iki sütunlu yatay kayıt kartları, darda tek sütun; gerçek ilerleme amber çubuktur. Kapak bulunmayan MAL kaydı sahte görselle temsil edilmez, kısa tür kimliği kullanır. Düzenleyici ayrı odaklı dialogda puan/durum/ilerleme ve tarihlerin anlamını ayırır. Manga/manhwa/manhua açık sınıflandırmadır. Zevkim tür seçimi ile hesaplanan profil ve kaynak ağına tek giriş sağlar; kanıt ve sahipler birleşmez. Grafit/amber, Sora/IBM Plex Sans ve mevcut CSS tokenları korunur; yeni bağımsız tema yok. [Kapsam ve veri sözleşmesi](docs/design/2026-11-10-personal-library.md).

## Yedi kullanıcı görüntüsünün düzenlenmesi — 2026-11-10 10:43

Yorum editörü örnek/analiz, kaynaklardan alma ve metin/ileri seçenek çalışma alanlarına ayrılır. Çalışan analizde ikinci başlatma düğmesi görünmez; işlem ışığı yalnız belirsiz ilerlemeyi gösterir, yüzde üretmez. Kanıt sunumunda özgün alıntı ve model yorumu konu başlıklı tek blokta ayrı kalır. Film alt bölümünün stil sahibi `film-page-lower.css`, ortak analiz stilleri `film-review-cinema.css` ile aynı iki sütun sözleşmesini uygular; eski tek sütun yeni wrapper’ları daraltamaz.

Dolu RSS’te sınırlı başlık/72ch okuma ölçüsü, kendi genişliğinde açılır alanlar ve görünür eylem etiketleri kullanılır; yatay taşma saklanmaz, kaynağı giderilir. Gömülü asistanın sahibi `browser-panel.css`/`browser-panel.js` olarak ayrı asistan overlay’inden ayrıdır; ikisi aynı palet ve hiyerarşi dilini paylaşır. İleri araçlar modalında tek başlık/kapatma, korunmuş yardımcı işlemler ve kompakt altyazısız durum vardır. Ayrıntılı tespit, plan, uygulama ve kanıt sınırları [yedi ekran kaydındadır](docs/design/2026-11-10-seven-screen-review.md).

## Podcast kütüphanesi — 2026-11-10 10:21

Önceki tek bölüm üzerinden yapılan inceleme kullanıcı için yeterli değildi. Podcast sayfasının üst ve alt kompozisyonu artık ayrı ele alınır: üstte okunabilir yayın kartları, altında Bölümler / Transkript araması / Radyo ve araçlar çalışma alanları vardır. Tek ana alan görünür; arama sorgusu, kaynak kapsamı ve not kimlikleri korunur. Transkript araması genel bölüm başlığı aramasından ayrılır. Radyo/ileri araçlar sekmeden açılır; aynı giriş üst başlıkta tekrarlanmaz.

Bölümler alanında seçili bölüm, referans kapak/plak, gerçek süre/yüzde/amber dinleme ilerlemesi ve kuyruk bir dinleme sahnesidir. Kaynak transkriptin bulunup bulunmadığı görünür. Bölüm başlığına basmak oynatma başlatmadan bölümü incelemeye alır. Alt liste genişte bilgi solda/eylem sağda, dar alanda alt alta; notlar, transkript ve ileri dosya araçları adlandırılmış Bölüm araçları ve notlar açılır alanındadır. Özellikler silinmez. Filtreler, sıralama ve kayıtlı metin araması mevcut sahiplerini kullanır; çift altyazı zorunluluğu yoktur. Hareket/kapak hover ve sıcak yüzeyler korunur; sadeleştirme görsel etkiyi azaltmak anlamına gelmez.

Bu yerleşim `podcast-library-ui.js` / `podcast-library.css` sahibindedir. LG 1920×1080 gerçek Electron renderer’ında dört yayın/yirmi kontrollü bölüm, kuyruk ekleme, başlıktan inceleme, sekme/draft koruma ve bağlantı diyaloğu kontrol edildi. Tek 740×920 tanısında yatay taşma yok. Canlı ağ veya medya dinleme kabulü değildir.

## Asistan ve film alt araçları — 2026-11-10

Asistanda konuşma alanı baskındır: kaynak özeti, yanıt yüzeyi ve yazma alanı ayrı görsel katmanlardır. Bir ana öneri görünür, kalan bütün öneriler mevcut Diğer öneriler açılır alanındadır. Bağlam kapsamının adı ve açıklaması görünür kalır; kapsam/ kaynak belirteci/ onay işlemleri değişmez. Katmanlar ortak surface/raised/accent/line değişkenlerini izler; ayrı tema sistemi yoktur.

Film sayfasının altındaki mevcut kişisel araçların başında İzleme durumu, Film günlüğü, Altyazı ve dublaj, Kaynak kayıtları gezinme şeridi vardır. Bunlar sayfa içi yönlendirmedir; sekme gibi içerik gizlemez. Mevcut alanlara kaydırır ve odaklar, üretim/kayıt başlatmaz. Şerit ilk grid satırında, izleme ile günlük ikinci satırda; dar görünümde tek sütundur. Türkçe izleme hazırlığı ayrı ışıklı yüzeyle ayrılır; kanonik kaynak/altyazı/dublaj kontrolleri ve onayları korunur.

RSS boş durumundaki Besleme ekle düğmesi açık metin/koyu yüzey kontrastına sahiptir. Ana sayfa/Keşfet/Podcast ve üç oynatıcı bu tur kontrollü içerikle incelendi; yeni kompozisyon değişikliği gerekmedi. Bu değerlendirme bütün canlı içerik ve yoğun durumların kusursuz olduğu iddiası değildir.

## Üç oynatıcıda sinematik görünüm ve kategori menüsü — 2026-11-10

Kullanıcı görünümün temel/gösterişsiz olmasını istemiyor: modern, sinematik, estetik, efektli ve belirgin ilerleme animasyonları olan bir ürün hedeflenir. Kolay kullanım, görsel etkiyi azaltmakla değil; içerik/işlem/ileri ayar hiyerarşisi ve anlaşılır kategorilerle sağlanır. Temel kullanıcı ana eylemi bulur, ileri kullanıcı seçeneklerini aynı menüde ilgili kategoriden açar. Bu tercih mevcut düşük hareket/OS seçeneklerini kaldırmaz.

Normal, Podcast ve Çift dilli oynatıcının ortak İşlemler menüsü geniş ekranda kategori listesi ve tek görünür içerik alanından oluşur. Dar pencerede kategori listesi yatay kayar. Kontroller, onaylar ve kaynak sahipliği aynı kalır. Kategori/alan odağı yenilemede korunur; altyazı seçme yönlendirmesi ilgili kategoriyi açar. Bu yerel kategori gezinmesidir, uygulamaya sol genel gezinme eklemez.

Podcast ve ses kaynağıyla kullanılan Çift dilli görünümde kapak ve bölüm kimliği yatay sinematik kümedir; sıcak ışık, kapak perspektifi/hover ve katmanlı transport/aktif cümle yüzeyleri kullanılır. İkinci altyazı zorunlu değildir. Video yüzeyinin ölçeği veya medya sahibi değiştirilmez. Üç modun iş şeridi gerçek yüzdeyi büyük gösterir, bilinmeyen ilerlemeyi belirsiz animasyonla ayırır. Parıltı/durum nabzı hareket tercihleri ve pencere etkinliğine uyar; sahte iş aşaması veya ses dalgası üretilmez.

Sahipler mevcut `sahne.js`/`sahne.css`, ortak browser-style görünüm `browser-study-view.css`; renkler ortak runtime tema değişkenlerinden gelir. Ana görsel kabul LG 1920×1080 gerçek Electron penceresinde kontrollü kaynakla, dar tanı 740×920’de yapıldı. Canlı medya/sağlayıcı kabulüyle eşit değildir.

## Doğal dublaj çalışma alanı — 2026-11-10

Doğal dublaj tek uzun açılır form yerine beş yatay sekme kullanır: Hazırlık, Ayarlar, Metin, Sonuç ve Geçmiş. İlk açılış Hazırlık’tır. Altyazı, referans ses ve kapsam üç yan yana seçim kartıdır; seçilen kartın içeriği ortak alanda açılır. Aynı anda yalnız bir ana bölüm görünür. Üretim durumu ve başlat/durdur/sonuç eylemleri sabit alt çubukta kalır; teknik ayrıntılar açılır alandadır.

Ayarlar’da hazır profiller ve zamanlama önde; motor/gruplama, gelişmiş kalite/AI, anlatım, arka plan ve ses/motor kategorileri iki sütunlu açılır menüdedir. Aynı anda bir kategori açılır. Metin’de özgün ve önerilen metin yan yanadır. Sonuç ve kayıt geçmişi hazırlık ekranına yığılmaz. Dar alanda ayarlar ve metin tek sütuna iner. Mevcut kontroller taşınır; seçenek, kimlik, onay veya üretim davranışı silinmez. Klavye okları/Home/End ve EN/TR sekme adları korunur.

`dub-natural.css` ortak kontrol stillerini, `dub-studio-layout.css` yalnız bu kompozisyonu yönetir; aynı tema değişkenleri kullanılır. `dub-studio-layout.js` mevcut düğümleri kimlikleriyle taşır ve ilgili metin/sonuç/geçmiş eylemini doğru sekmede görünür kılar. Yeni bağımsız renk/yazı sistemi yoktur. LG 1920×1080 gerçek tam ekran Electron görüntüsü ve bir dar pencere tanısı alındı; yeni GPU üretimi veya ses doğallığı kabulü bu görsel değişikliğin kanıtı değildir.

## Görsel öncelik — güncel kullanıcı kararı, 2026-11-05

Kullanıcı için görünüm ve tasarım kalitesi en önemli önceliktir. Hedef güçlü, özgün, etkileyici ve özenli bir medya deneyimidir. Kompozisyon, tipografi, atmosfer, ışık, hover ve geçişlerin yoğunluğu ekranın tasarımına göre belirlenir. Belirgin efektler, zengin katmanlar ve sürekli atmosfer/dekoratif animasyon kullanılabilir; bunlar için genel bir yasak veya zorunlu sakinlik/minimalizm kuralı yoktur. Tasarımcının yaratıcılığı gereksiz stil kısıtlarıyla daraltılmaz.

Okunabilirlik, erişilebilirlik, kullanıcının hareket tercihi ve mevcut işlev/veri/güvenlik sınırları korunur. Onaylı tasarımın görsel etkisi entegrasyonda korunur. Aşağıdaki tarihli uygulama notları mevcut/geçmiş sürümleri anlatır; yeni tasarımlara düşük hareket veya sadelik zorunluluğu getirmez. Eski belgelerdeki aksi yöndeki estetik kısıtlar bu güncel kararla geçersizdir.

## Podcast / Çift dilli — ortak browser temeli, 2026-11-05 08:20

Kullanıcı browser tarafındaki deneyimi tercih etti. Ana sayfa/RSS/shelf/yerel girişler için ayrı bir Podcast veya Çift dilli tasarımı geliştirme; tek `browser-study-view` kompozisyonu ve ortak mevcut runtime kullanılır. Kaynağa özgü video/kapak ve yetenekler değişebilir, aynı işlevlerin konumu/dili/etkileşimi değişmez. Sunum paylaşılır; browser/player/shelf medya, zaman, kaynak ve iş sahipleri zorla birleştirilmez. Normal yerel sinema kapsam dışıdır. Yeni Claude tasarımında da bu karar korunur; önceki Sahne deck'i bu iki mod için görsel referans değildir. [Teslim](docs/devir/2026-11-05-0820.md).

## Güncel yeniden tasarım kapsamı — P019

Kullanıcı podcast kütüphanesi, Ana sayfa, Keşfet, film detayı ve Akışlar/RSS’in önceki yerleşimlerden bağımsız, modern ve güçlü biçimde yeniden tasarlanmasını istedi. Önceki beş alanlı Claude prototipi de tamamlanacak. Önceki Ana sayfa/Keşfet/film üstü yerleşimini aynen koruma şartı bu çalışma için kaldırılmıştır; mevcut işlevler/veri sahipleri ve ürün kimliği korunur. Tam v2 paketinin ilk beş alanı ve yeni beş sayfası mevcut işlemlere entegre edildi. Kullanıcı eksik aktif ekran maketini beklememeyi seçti; Podcast/Çift dilli ve asistanın mevcut ortak bileşenleri korunur. Ayrıntı [tasarım devam kaydında](docs/design/claude-redesign-handoff-2026-11-05.md).

## Güncel UI çalışma yöntemi — 2026-11-05

**2026-11-08 güncellemesi:** Her görsel kontrolde yalnız aktif görev/düğme değil ekranın bütün kompozisyonu incelenir; görülen bağlantılı tasarım kusurları mevcut iş sürerken düzeltilir. Ana Windows görsel kabulü LG'de **1920×1080 tam ekran** yapılır. Küçük pencere, yalnız özel bir davranışı araştırmak gerektiğinde kullanılır; ana masaüstü tasarım kabulünün yerine geçmez. Gereksiz genişlik matrisi veya çok sayıda kare üretme tercihi değişmedi.

Her UI işinde önce [Sahne referansından çalışma rehberini](docs/design/sahne-design-guidance-2026-11-05.md) ve ilgili onaylı ekran kararını oku. Önce bütün kompozisyon: baskın medya/okuma alanı, tipografi oranları, ortak hizalar ve kontrollü boşluk; sonra araçlar, en son ince cila. Özellikleri form olarak dizip koyu tema/amber/animasyon eklemek tasarım sayılmaz.

Beğenilmiş tasarımın medya ölçeği, hiyerarşisi ve atmosferi gerçek entegrasyonda korunur; teknik kısıt gerekçesiyle sessizce sıradanlaştırılmaz. Mevcut font/palet/hareket sahipleri kullanılır; referans paketin bağımsız tokenları veya maketleri bütün ürüne otomatik aktarılmaz. P019 kapsamındaki sayfaların kompozisyonu yeniden tasarlanabilir; kapsam dışındaki onaylı tasarımlar korunur. Büyük kompozisyon sorunlarını küçük ikon/kenarlık ayrıntılarından önce çöz.

Kısa gerçek görsel öz-eleştiri ve gerekli geniş/dar kontrol yeterlidir; test başarısı estetik kabul değildir. Tekrar onay döngüsü, geniş matris, yüzlerce çekim, CPU benchmark, Computer Use ve dosya erişim penceresi tetikleyen test yok. Ürün sahipleri, ileri ayarlar, kaynak/zaman/güvenlik sınırları korunur. Rehberin kaynağı `files (5).zip` Sahne v2 paketidir; bu belge güncellemesi paketin kodunu uygulamaz veya Windows/mpv başarısını doğrulamaz.

## Overview

Ses çalışma istasyonu: video merkezde, yoğun ama ikincil ayarlar kenarda. Ürün yönü ve Türkçe metin gereksinimi AGENTS.md tarafından tanımlanır. Kullanım Windows masaüstü; İngilizce öğrenme, pazarlama sayfası veya yeni bir marka tasarımı değildir. Hedef pazar hakkında dil dışında ayrı kanıt yoktur.

Bu dosya mevcut tasarımı kaydeder; token üretmez. Kanonik sayfa paleti `src/renderer/theme-palette.css` içindedir. Ana pencere ve ayrı asistan renderer'ı bu dosyayı önce yükler; `styles.css` ve `assistant-overlay.css` mevcut bileşen adlarını bu ortak rollere bağlar. Ön yüz bu değerleri `var(--bg-0)`, `var(--bg-1)`, `var(--bg-2)`, `var(--text)`, `var(--border)` ve `var(--accent)` ile tüketir. Ürün davranışının sahibi AGENTS.md ve aşağıdaki iş akışı sözleşmesidir.

## Colors

Mürekkep/grafit katmanlar, sıcak amber etkileşim vurgusu. Hata, seçim ve pasif metin ayrı semantik token kullanır. Yeni panel açık temada da çalışma zamanı değişkenlerini izler. Işık, parıltı ve renk atmosferi görsel kompozisyonu güçlendirecek şekilde tasarlanabilir; uygulama mevcut tema tokenları üzerinden bütünlüğünü korur.

## Typography

Mevcut sans serif yığını Türkçe metinleri taşır. Kod, süre ve teknik değerler için mevcut mono yığın kullanılabilir. Yeni bağımlı font veya CDN yüklenmez. Açıklamalar kısa, eylemler fiille başlayan Türkçedir.

Medya kabuğu ve asistanın mevcut self-hosted ailesi başlıklarda Sora, gövdede IBM Plex Sans'tır. Yukarıdaki font kaydı bu sahipliği belgeler; stüdyo/teknik alanların mevcut fontunu topluca değiştirmez. Kitap prose serifini korur. Runtime renklerin sahibi CSS değişkenleridir; bu belge yeni bağımsız tema değerleri üretmez.

## Layout

### Podcast kütüphanesi ve yerel sinema Sahnesi — 2026-11-05

P017 ile pakette maket kalan iki yüzey mevcut işlemlere bağlandı. Radyo ve podcast: abonelik şeridi, gerçek devam kaydı veya ilk bölüm hero'su, bölüm listesi ve mevcut dinleme kuyruğu. Yerel Sahne: aynı video/stage, gerçek bölüm işaretleri, sıradaki dosya, okunur çift dil kartı ve mevcut sözcük koleksiyonuna bağlı bağlam kartı. Sözlük tanımı üretilmez; mevcut tercih edilen dış sözlüğe yalnız kullanıcı eylemiyle gidilir. Kaynak/revizyon değişince kart kapanır.

Başka oynatma motoru, uydurma ilerleme veya ikinci kuyruk eklenmedi. Eski radyo ve ileri araçlar erişilebilir; RSS yazısında HTML etiketleri gösterilmez, tarih arayüz dilinde biçimlenir. Dar kütüphane şeridi açılır; yerel altyazı transport'un üzerinde kalır. Native yüzeyde kontroller için ayrıca alan ayrılır; bu turdaki gerçek yerel görüntü doğrulaması HTML video yoludur. [Kısa kabul ve sınırlar](docs/devir/2026-11-05-0628.md).

### Podcast ve çift dilli Sahne — 2026-11-05

`files (5).zip` kompozisyonu `sahne.css/js` ve mevcut sahipleri kullanan `cinema-sahne.js` ile bütünleştirildi. Yerel/RSS görünümü mevcut PlayerWorkspaceIntegration, browser görünümü kimlik kontrollü mevcut browser komutları üzerinden çalışır; aynı video/stage korunur, kapanışta klasik yuvasına döner. Podcast kapak/kimlik/transport + büyük okunur transkript; çift dilli video/okuma kartı/dock + transkript kompozisyonudur. Dar çift dilli transkript erişilebilir düğmeyle overlay açılır. Kaynak/iz revizyonları, bağımsız kaymalar, çoklu/belirsiz eşleşme, zamansız salt okunur metin ve mevcut ileri araçlar korunur.

Tema/font mevcut sahiplerden gelir; ayrı mavi marka, uydurma şehir kapağı ve ikinci medya motoru alınmadı. Eksik kapak sıcak baş harfli yüzeydir. Home/Keşfet/film/browser ve podcast kütüphanesinde uyumlu afiş/metin/düğme cilası `cinema-package-refinements.css` ile sınırlı; yeni alternatif Home/film yerleşimi, sahte kütüphane kuyruğu veya sözlük özelliği eklenmedi. [Teslim ve doğrulama sınırları](docs/devir/2026-11-05-0600.md).

### Onaylı Akışlar okuma alanı (2026-11-04)

Üst uygulama kabuğu/logo korunur.1352px içerik ızgarasında kaynak akordeonu, kayan tür segmenti ve iki özel menü vardır. Masaüstünde liste ve okuyucu ayrı kayar; okuyucu görseli/metni/eylemleri aynı680px sütundadır. Dar ekranda liste ile okuyucu açık geri dönüşle yer değiştirir. Meta/enclosure etiketi en az12px; sıcak görsel yedeği/baş harf ve kaynak favicon’u kullanılır. Seçim modunun toplu işlemleri ve ileri tercihler korunur. Geçişler transform/opacity; tam/azalt/kapalı ve OS tercihi gözetilir. [Native karşılaştırma ve işlev haritası](docs/implementation/cinematic-feeds-2026-11-04/README.md).

### Onaylı sinematik medya kompozisyonu (2026-11-03)

Home, Keşfet ve film sayfasının onaylı görsel ailesi `cinema-ui.css/js` içindedir. `--cn-*` renkleri kanonik `--mv-*` / tema rollerine alias'tır;1352px içerik ızgarası,44px geniş ekran kenarı,23px bölüm başlığı, tek yerel IBM Plex Sans ailesi,180ms kesilebilir hareket kullanılır. Tam genişlikte hero görseli tek yumuşak gradyanla zemine karışır; metin kutu içine alınmaz. Afişler2:3, gerçek video geçmişi16:9; puan yalnız veri varsa üst sağ rozet, eksik görselde temiz baş harfli sıcak gradyan. Dar görünüm açık grid satırlarına kırılır; negatif boşlukla afiş/düğme bindirilmez.

Film üstünün butonu mevcut gerçek kaynak durumunu ve özgün eylemini yansıtır. Hero'daki yıl/süre/puan/özgün başlık künyede tekrar edilmez. Gerçek kredilerin boş alanları gizlenir, ek yapım bilgileri isteğe bağlı açılır. Analiz kısa kaynaklı özet + alıntı kartlarıdır; bütün açıklama ve kaynaklar erişilir. Dağılım çubuğu uydurma sabit oran veya tüm izleyici kanaati değildir. Benzer afişler ve fragmanlar varsayılan görünür; teknik tercihler aşağıda açılır. [Onay / gerçek Windows karşılaştırması ve sınırlar](docs/implementation/approved-cinematic-ui-2026-11-03/README.md).

Video alanı ile yan panel ayrı kaydırma sahipleridir. Video araçları açılabilir panelde gruplanır; kapalı panel izlemeyi daraltmaz. Formlar dar genişlikte kırılır, sonuç listeleri sınırlı yükseklikte kayar. Native video WebContentsView, küçük oynatıcıya aynı örnek olarak taşınır. Pencere yakalaması çocuk video yüzeyini içermediğinden ayrıca video yakalanarak doğrulanır.

## Elevation & Depth

Hiyerarşi ince sınırlar ve yüzey tonlarıyla kurulur. Mini oynatıcı işletim sisteminin üstte tutulan ayrı penceresidir. Altyazı canvas'ı video üstündedir; ana uygulamanın eylem alanını kaplamaz.

## Shapes

Kontroller ve gruplarda mevcut 6–8 px köşe ailesi korunur. Eylemi açıklamayan ikon veya emoji eklenmez.

## Components

### Günlük görev ve isteğe bağlı ayrıntı

Temel sağlayıcı/model/maskeli anahtar ayarları önce; ayrı asistan yapılandırması yalnız seçildiğinde görünür. Kısa asistan panelinde kaynak tek özet satırıdır; tam bağlam açılır, ilk öneri görünür ve diğer komutlar menüdedir. Meşgulken kullanılamayan öneriler yanıt alanını daraltmaz; İptal ve taslak görünür kalır.

Hazır film yorum örneği ayar formundan önce gelir; sayı/havuz/yenileme isteğe bağlı ayrıntıdır. Dublajda etkin ses ile değiştirilmek üzere seçilmiş ses ayrı durumlardır; boş kitaplık formu yerine yerel ekleme sunulur. PDF ses hazırlığı okuma alanını sürekli işgal etmez; hazır oynatma ve aralık bilgisi açık kalır. Bu sadeleştirmeler gelişmiş seçenekleri silme gerekçesi değildir. [R825 uygulaması](docs/raporlar/plugin-design-audit825/implementation/README.md) native örnekleri ve sınırları kaydeder.

Native select ve Electron dosya seçicisi bu mevcut Windows uygulamasının kabul edilen sahipleridir; popup geometrisi işletim sistemine aittir. Metin alanları görünür etiket, düğmeler klavye odağı taşır. İşlem beklerken aynı eylem tekrar başlatılmaz; durum alanı hata ve boş sonucu bildirir. Sonuç metni HTML olarak çalıştırılmaz.

### Medya iş akışlarında görsel hiyerarşi

Aktif görev alanında bir dolu amber ana eylem kullanılır; ikincil eylemler görünür ve rollerine uygun biçimde ayrışır. Mod/seçili durum ana eylem değildir; medya modları nötr yüzey, aynı düzeydeki sayfa gezinmesi ince alt çizgi kullanır. Klavye odağı seçimden ayrıdır ve korunur. Yoğun küçük kabukta kütüphane araması ikonla açılır; Escape sorguyu silmeden kapatır, açık temizleme eylemi sorguyu temizler. Geniş pencerede doğrudan arama kalır.

Alan bütçesinde medya, okuma ve konuşma içeriği önceliklidir. İkincil araçlar mevcut açılır alanlarda kalır; gelişmiş kontroller kaldırılmaz veya kullanıcının özel ayarları sıfırlanmaz. Normal panel aralığı16px, ilişkili kontroller8–12px başlangıç ritmidir; yoğun toolbar ve metin okuma kendi belgeli varyantını kullanır. Görev kontrollerini gizlemek veya okunamayacak küçültmek alan kazanımı sayılmaz.

Native browser araç çubuğu kullanılabilir içerik genişliğine göre ses eylemlerini mevcut menüye taşır; adres metni okunur kalır. Menü proxy'leri ve mevcut klavye komutları tek işlev sahibini korur. PDF/kitapta ana sayfa, gezinme, okuma ve ses araçları aynı kısa kontrol ailesini paylaşır; uzun açıklama kendi kaydırıcısında, karar düğmeleri görünür satırdadır.

### İş akışı sözleşmesi

- Home'a dönüş aynı kaynağın dublajını silmez: video/ses duraklar, owned mute/hız bırakılır; WAV, mix/offset ve zaman haritası korunur. Geri dönüş kendiliğinden Play değildir; yeni kaynak/generation eski bağlantıyı kaldırır. Arka planda çeviri ilerler, odağı çalmaz.
- Asistanın başarısız aşamayı yeniden denemesi aynı işin ledger kanıtına bağlıdır; eski başarılı adımlar yeniden oynatılmaz. Devam yalnız yeni onay kartı hazırlar. Stopped iş devam izni değildir; kısmi ses tamamlanmış çıktı sayılmaz.
- Filmde kayıtlı analiz okunurken profil/evidence güncelliği current/stale/unknown olarak ayrılır. Kayıtlı örneği yeniden kullanmak kendiliğinden ağ/model isteği göndermez; örnek değişince eski kaydedilmemiş sonucun kontrolleri temizlenir. Ses metin denetimi verilen altyazıyı karşılaştırır, kaynak ASR doğruluğu veya insan doğallığı garantisi değildir.

- Medya araçları etkin sekme, gezinme nesli ve medya kimliğine bağlıdır. Gecikmiş sonuçlar farklı videoya uygulanmaz.
- Sessizlikte hızlanma, ses profili ve otomatik jenerik/özet atlama varsayılan kapalıdır. Kaydedilen açık tercih kullanıcı kararıdır.
- Altyazı aday puanı sürüm metadatası eşleşmesidir; zaman senkronunun garantisi veya yüzde güven değildir.
- OCR seçilen video karesindeki bölgeyi okur. Sahne şeridi kullanıcının seçtiği yerel video dosyasından çıkarılır. Anlamsal arama yüklü altyazıda yerel çokdilli model kullanır.
- OpenSubtitles alanları maskeli, oturumluk girişlerdir. API anahtarı argv, log, devir notu veya normal ayar dosyasına yazılmaz.
- Jenerik/özet aralıkları video veya açıkça seçilen dizi kapsamında saklanır. Video değişimi atlama durumunu sıfırlar; geriye sarma tekrarlı otomatik atlamayı bastırır.
- Senkron ve video önizlemesi açılır grubunda kullanıcı aynı sürümdeki yerel referans videoyu seçer. Dalga biçimi mevcut zamanlama editörünü kullanır; kare önizlemesi zaman çubuğunun hover/klavye etkileşimindedir.
- Parçalı senkron doğru zamanlı referans altyazıyla hesaplanır. Önce değişiklikler gösterilir; düşük kanıtlı sonuç uygulanamaz. Uygulama geri alınabilir taslağı değiştirir, dosyayı kendiliğinden yazmaz.
- Aralık OCR'ı en fazla 60 saniyeden düzenlenebilir zaman ve metin blokları çıkarır. SRT kaydı ayrı kullanıcı eylemidir. Jenerik analizi iki bölümün ilk 120 saniyesindeki ses benzerliğini önerir; kayıt otomatik atlamayı açmaz.
- Dizi çeviri profili site ve açık dizi adına bağlıdır. Yeni bölümde “Bölümü diziye bağla ve tercihleri yükle” mevcut profili korur; “kaydet” düzenlenen profili günceller. Değişiklik sonraki çeviriye uygulanır. Terim kontrolü kaynak/çeviri rollerini ve ayrı zaman dönüşümlerini izler, metni kendiliğinden düzeltmez.
- Film ve dizi arşivi ana başlıktan ve oynatıcıdaki Arşiv eyleminden açılan native dialog'dur. Filmler, Diziler ve İzlenecekler aynı katalog üzerinde filtrelenir; mevcut izleme geçmişi ayrı kalır. Eser dosyasız var olabilir; oynatma için yerel dosya veya browser bağlantısı gerekir.
- Afişli kartlar sabit 2:3 görüntü alanı taşır; afişler görünür oldukça küçültülmüş olarak yüklenir. Eksik afiş bir boş durumdur. Katalog grafit/amber ve açık tema token'larını kullanır; kendi modal kaydırma alanı vardır. Modal açıldığında native browser yüzeyi mevcut occlusion sözleşmesiyle gizlenir.
- Eser ve bölüm düzenleme açık kaydetme kullanır. Silme iki adımlıdır; yalnız katalog kaydı silinir, medya dosyası ve izleme geçmişi kalır. İzlenecekler bölümünden yeni kayıt başlangıçta İzlenecek durumundadır. Bölüm sırası sezon/numaraya göre, sıradaki öneri kaynaklı ve tamamlanmamış ilk bölümdür.
- nMDB içe aktarımı salt okunur önizleme → seçim → uygula akışıdır. Kimlik çakışmaları ve atlamalar gösterilir; tekrar içe aktarım mevcut izleme durumu, favori, kaynak ve puanları ezmez. İthal puanlar kaynak değerleridir; canlı sağlayıcı doğrulaması veya otomatik film önerisi değildir.

### Browser araçlarının gezinmesi

- Yan panelin sekme çubuğu browser modunda en üstte kalır. **Araçlar** yalnız browser modunda görünür; Altyazılar, AI ve Kütüphane ile aynı `setSideTab` ve klavye gezinmesi sahibini kullanır.
- Araçlar sekmesinde mini oynatıcı/ASS hızlı işlemleri ve dokuz native açılır grup vardır. Senkron, altyazı bulma, anlam arama, kare OCR, sahne şeridi, atlama aralıkları, dizi bağlamı, aralık analizi ve konuşma ayırma ayrı açılır. Gizleme DOM'u yeniden kurmaz; alan değerleri ve devam eden iş durumu korunur.
- Araçların tek ana kaydırma sahibi `.bf-workspace` alanıdır; sonuç listeleri mevcut sınırlı kaydırmasını korur. Altyazılar sekmesinde araç formları yer kaplamaz. Dar pencerede mevcut panel devralma ve Sayfaya dön eylemi kullanılır.
- Yerel oynatıcıya geçerken açık Araçlar sekmesi Altyazılar'a döner. Yeni tercih/ayar şeması yoktur; otomatik hızlanma/atlama varsayılanları değişmez.
- Gruplar, düğmeler ve formlar mevcut renk/font token'larını kullanır; yeni font, CDN veya uygulama bağımlılığı eklenmez. Superdesign önizlemesi uygulamadan ayrı, statik inceleme materyalidir; uygulama IPC eylemlerini çalıştırmaz.

### Browser üst durum alanı

Altyazı sinyali normal genişlikte iki kompakt satır kullanır: yakalama/sayfa durumu üstte, hazır blok veya hata durumu ve dosya ayrıntısı altta. Dosya ayrıntısı açılırsa tüm genişliği kullanır; hata metni kısaltılmaz ve eylemi gizlenmez. 650 px altındaki browser konteynerinde sıralı düzene geçilir. Önceki sinyal metni yalnız Ayrıntılar açıkken görünür. Durum metni açık/koyu tema için `--text-dim`, hata `--danger`, bağlantı bekleme `--warning` kullanır.

## Verification

### Katalog otomasyonu ve çalışma paketi

Klasör tarama mevcut içe aktarma önizlemesi/seçim sahibini kullanır; dosyaları yeniden adlandırmaz ve arka planda kendiliğinden çalışmaz. TMDB eşleştirme ekranı katalog ayrıntısından açılır. Yerel dolu alanlar başlangıçta seçilmez; değiştirmek açık seçim gerektirir. Kişisel puan/favori/izleme durumu metadata kapsamına girmez. Maskeli TMDB okuma belirteci katalog kapanınca temizlenir. TMDB sağlayıcı atfı ekranın altındadır.

Takvim katalog gezinmesinin dördüncü bölümüdür. Yaklaşan, yayınlanmış/izlenmemiş, kaynağı eksik ve tarihi açıklanmamış bölümler ayrı gruplardır. Tarih alanı ürünün Türkçe YYYY-AA-GG metin sözleşmesini kullanır; OS tarih popup'ı yoktur. Metadata, kodlama ve model seçimleri mevcut native select sözleşmesini izler.

Çalışma paketi ekranı dışa aktarma ve önizlemeli geri yükleme sunar. Video dahil etme başlangıçta kapalıdır. Son eylem kayıt değiştirme ve yeniden başlatmayı açıkça söyler; Vazgeç önce gelir. Katalog, kayıtlı altyazı dosyaları/düzeltmeleri, browser sekme senkronu, izleme geçmişi ve posterler taşınır. Anahtarlar/cookie oturumları, aktif kuyruk ve genel uygulama ayarları bu paketin kapsamında değildir. Genel ayar yedeği mevcut Ayarlar dışa aktarımıdır.

Araçlar alanında dokuz açılır grup vardır. Yeni konuşma ayırma grubu aynı `.bf-workspace` kaydırıcısındadır; yalnız tıklamayla başlar, 60 saniye sınırı ve model/dil seçimi sunar. CPU üzerinde ayrı ortamda çalışır, sonuç SRT metnidir ve özgün videoya offset uygulanır; mevcut altyazıyı otomatik değiştirmez. ASS hızlı eylemleri ayrı font ve MKV font seçenekleri içerir. Kodlama kurtarma önizlemesi özgün dosyayı koruyarak yeni kopyayı mevcut altyazı seçim sahibine bağlar.

Değişen akışlar ayrı Electron test profillerinde sınanır. ASS, küçük oynatıcı ve ürün entegrasyonu için `tests/electron-browser-*.smoke.js` dosyaları; ses, tercih ve kayıt kararları için ilgili hedefli testler kullanılır. Canlı OpenSubtitles hesabı, tüm siteler ve DRM başarısı kontrollü testlerden çıkarılmaz.


### Ortak tema sahipliği — R827

Grafit basamaklar `#111215 → #191b1f → #24272d → #2d3037`; ana metin `#f1f0ed`, ikincil `#c1c4cb`, pasif `#b0b4bd`. Güncel sıcak amber aksan üstteki 2026-11-11 02:33 kararından gelir. Renk kopyaları medya/browser kapsayıcılarında yeniden tanımlanmaz. Asistan bağımsız WebContentsView olduğu için aynı paleti kendi HTML girişinde yükler; ana sayfadan CSS mirası aldığı varsayılmaz. Açık tema bağımsız kontrastlı sıcak değerleri kullanır. Video üstü kontrol ve TV kontrast varyantları ayrı, belgeli istisnadır. `design-system/whisper-local-theme.css` eski taşınabilir v1.1 örneğidir, çalışma zamanı kaynağı değildir.

Günlük ikincil düğmeler8px, arama10px, panel16px ailesini izler; mod seçicisi ve sohbet balonu bağlama özgü şekillerini korur. Genel ikincil hover nötrdür; tüm butonları amberle çerçevelemez. Kapalı asistan balonu nötr yüzeydir; Send/işin ana eylemi vurguyu taşır. Hero'nun okunabilirlik örtüsü sabit eski siyah yerine güncel sayfa zeminiyle karışır. Klavye odağı silinmez; native testin odak halkası seçim stili sanılıp kaldırılmaz.

Hareket sahibi `ui-motion.css` ve `ui-motion.js`: panel160ms/seyahat yok; bölüm180ms/4px; kontrol renk150ms, basış100ms/.985; ince pointer'da kapak2px yükselir. WAAPI bu CSS rollerini doğrulayarak okur; eksik/geçersiz değerler güvenli varsayılana döner. Tekrarlı giriş eski hareketi iptal edip mevcut görünümden devam eder. Reduced-motion ve pagehide etkin animasyonu iptal eder; gezinme animasyonu beklemez. Bunlar mevcut sürümün uygulama değerleridir; yeni tasarımların hareket yoğunluğu veya süresi için üst sınır değildir ve FPS/performans ölçümü iddiası taşımaz.

Hesapsız tema yöntemi ve gerçek önce/sonra kanıtı [R827](docs/raporlar/BROWSER_BUG_REPORT_827.md) altında saklanır. Statik üretilmiş tasarım panosu çalışan uygulama kanıtı değildir; native görüntüler ayrı tutulur. Yeni dış hesap, CDN, font, paket veya ayar şeması eklenmez.


### Yüzey yerleşimi — R828

Filmde kayıtlı analiz aynı okuma düzlemindedir; dış review kartı kullanılmaz. Güncel bağlam kısa metin, stale/unknown açıklaması belirgin durum alanıdır. Yönetim ikincildir; boş yorumda yükleme ana eylem olarak kalır. Sağdaki kişisel durum/puan formu ile kaynak düzenleme metin eylemleri ayrıdır; dar ekranda aside alta geçer. Tüm ayrıntı ve kaynak kanıtı mevcut disclosures üzerinden erişilir.

Asistan markdown paragraf boşluğu tek ritimdir; doğrudan blank-line br fazladan satır oluşturmaz. Uzun tool/kaynak metni sınırlı kayar, başlık ve karar düğmeleri o kaydırıcıya girmez. Composer komut satırı taslaktan görsel olarak ayrıdır; İptal ve kullanıcı taslağı korunur.

Browser'da ray dışı sidebar dört etiketli hedef ve ayrı yardımcı eylem satırı taşır. Araçlar modu ana ayarları saklamaz; tek bf-workspace kaydırma sahibi korunur. Uzun metin form alanları tam kolonu, kısa alanlar eşit kolonları kullanır.

Dublaj DOM ve görsel görev sırası altyazı→referans ses→üretimdir; kaynak/ses genişte yan yana, dar ekranda aynı sırada alt alta. Üretim ileri ayarlarını önce göstererek referans seçimini aşağı itmez. PDF okuma ölçüsü/serif korunur; gereksiz dikey padding içerik aleyhine birikmez. Bu kararların native önce/sonrası [R828](docs/raporlar/BROWSER_BUG_REPORT_828.md) içindedir.


### Dublaj ön denetimi ve karar kanıtı — R829

İnceleme ve onarım seçili SRT ile üretimden önce erişilir; isteğe bağlı disclosure olarak günlük akışı genişletmez. Metin uyarıları otomatik düzeltme/kalite puanı değildir. Telaffuz adayları mevcut sözlükte düzenlenebilir taslak oluşturur; scope/önceki taslak ve açık Save yetkisi korunur. Film karşılaştırmasında mevcut ve seçili2:3afiş+kimlik yan yana, dar ekranda sıralıdır; yapım kimliği kurgu sürümü doğrulaması sayılmaz. Kayıtlı zevk açıklaması mevcut profil değil, analiz anının snapshot dayanağıdır. Asistan çok adımlı planı kaynak/başlık/aralıkla sunar; plan ve gerçek iş/karar kartı karıştırılmaz. Yeni tema/animasyon sahibi oluşturulmadı. [R829 görüntüleri](docs/raporlar/BROWSER_BUG_REPORT_829.md).


### Yorum okuma masası — R836

Kaynakta tek seçili yorum ve native yazar seçicisi/Önceki/Sonraki;65–70ch metin ölçüsü, metin içinde ikinci360px kaydırıcı yok. İlk kaynak hemen görünür; uzun metnin Tamamını oku eylemi sadece görsel daraltmayı kaldırır. KaynakJSON ve AI örnek bütçesi birbirinden ayrıdır. Önizleme ayrı iş adımı, formun en altına eklenen bir kutu değil; Geri taslağı korur. Aktif adımın doğrulama hatası aynı yerde role=alert ile görünür. Özet ve kişisel uygunluk okuma önceliğidir; ayrıntılı örnek denetimi ve kaynaklar isteğe bağlı açılır. Güncel profil bilgisi ile stale/unknown uyarıları anlaşılır biçimde ayrışır. Başlık18–22, gövde15/1.85, metadata12–13; tek ana eylem ve ortak grafit/amber/font/hareket ailesi korunur. Kayıtlı film analizi, inline yönetim ve bağımsız yorum görünümü aynı render sahibini kullanır. [Önce/sonra](docs/raporlar/BROWSER_BUG_REPORT_836.md).


## 2026-11-01 — sinematik medya omurgası

Kullanıcının kesin yönü: üst medya menüsü, grafit/amber palet ve masaüstü medya oynatıcı/browser ruhu korunur. Luna kalite karşılaştırmasıdır; birebir yerleşim, ikon veya marka kopyası değildir. Soldan genel gezinme, açık kâğıt düzlemi ve web pazarlama sayfası dili reddedilmiştir. Her yeni yüzeyde önce açık bir hiyerarşi, sonra içerikle ilişkili sinematik kompozisyon gelir. Görsel etki, atmosfer ve hareket tasarımın temel parçalarıdır; efektlerin biçimi ve yoğunluğu kompozisyonun ihtiyacına göre seçilir.

- Üst gezinme tek yatay baz çizgisidir. Soldaki uygulama simgesi ikincil hedef/araçları hover ile açar; tıklama ve klavye de çalışır. Menüye geçiş güvenli aralığı vardır. Daraldıkça yazıları kesmek veya ikinci rastgele satır açmak yerine bütün kontroller aynı menüye taşınır. Mod ve sayfa seçimi birbirinden ayrıdır. Arama ikonla açılan mevcut sorguyu koruyan bir yüzeydir.
- Görsel kimlik: geniş gerçek backdrop, okunur koyu soldan/alt gradyan, tutarlı afiş oranı, başlık → kısa olgular → ana eylem. Kapağı yatay büyütmek yerine uygun geniş görsel tercih edilir; yükleme/bozuk görselde mevcut kapak korunur.
- Yorum analizi: yorum örneğine ait yorumlama ile kaynak alıntısı açıkça ayrılır. Özet ana okuma alanı, kişisel uygunluk ikinci odaktır. Görüşler kart istifi yerine başlık–gerekçe–gerçek alıntı ilişkisiyle okunur. Yorum sayısı, puan veya fikir birliği uydurulmaz. Kaynağın tamamı ve ileri örnek ayarları erişilebilir kalır.
- Hareket: mevcut self-hosted WAAPI sahibi kullanılır. Sayfa360ms, medya kimliği geçişi420ms; sıradan kontrol180ms. Yeni sayfaya geçen afiş dekoratif tek uçuş görselidir; hedef çift görüntü üretmez. Kesilme, hedefin ayrılması ve reduced-motion temizlenir. Gerçek iş durumu ile üretilmiş içerik ayrılır; sahte düşünce metni gösterilmez.
- Asistan, tarayıcı ve oynatıcı aynı eylem hiyerarşisini taşır: içerik/yanıt birinci, ana eylem ikinci, kaynak ve ileri araçlar açılır. Kaydırma sahipleri, gerçek video yüzeyi, yetki/üretim durumu ve erişilebilir gelişmiş seçenekler korunur.

Bu bölüm yöndür; her ekranın uygulanmış ve gerçek model/siteyle doğrulanmış olduğunu tek başına kanıtlamaz. Teslim notu hangi ekranların gerçek Windows görüntüsüyle sınandığını belirtir. Kaynak tasarım incelemeleri ve uygulama farkları docs/design altındaki teslim belgesinde sabit commit bağlantılarıyla tutulur.


### Asistan işlem izi — 2026-11-03
Ortak sahip assistant-run-card.js/assistant-overlay.css; mevcut paletteki raised/line/accent/text/muted tokenları kullanılır. Kompakt gerçek etkin adım başlığı ve segmentler varsayılan; ayrıntılar isteğe bağlı dikey işlem izidir. Bu sürümde running halkası döner, accepted/proposed/completed farklı durumlarla gösterilir; yeni tasarımlarda durum hareketleri görsel kompozisyona göre geliştirilebilir. Yeni mesaj parçası animasyonu baştan başlatmaz; DOM/odak/açık ayrıntı korunur. prefers-reduced-motion hareketi kaldırır. Bu alan yeni bir genel gezinme veya yan stüdyo değildir. Görsel ve hareket kanıtı docs/implementation/assistant-end-to-end-2026-11-03/ içindedir.


### Film dossier — 2026-11-03
Alt sayfa tek ortak hiyerarşidir: konu+künye → oyuncular → kaynaklı yorum analizi → ek keşif → isteğe bağlı izleme/kaynak araçları. Yerel ve Keşfet aynı alan/typography sahibini kullanır; hero ve üst menü ayrı, korunmuş sahiplerdir. Anlatım alanı yaklaşık 64ch; künye gerçek alanlar ve aynı baz çizgisinde dt/dd çiftleri. Özet ile kişisel uygunluk ayrıdır; özgün alıntı ve AI açıklaması karıştırılmaz. Mevcut form DOM'u taşınır, taslak/olay/izin sahibi yeniden yazılmaz. Kişiler gerçek metadata akışından gelir, görsel yoksa harf; uydurma yüz/istatistik yok. 200 ms bağlamsal giriş ve global reduced-motion kuralı. Görsel kompozisyon ve gerçek Windows önce/sonra kanıtı docs/implementation/film-page-lower-2026-11-03/ altındadır.


## Ana sayfa / Keşfet ortak görsel temeli — 2026-11-03

Kullanıcının ekran brief'i önceliklidir: ilk paket ortak bileşenler + Ana sayfa + Keşfet; sonraki sayfaların içeriği bu turda yeniden tasarlanmaz. Görsel yön ve native önce/sonra kanıtı: [uygulama kaydı](docs/implementation/home-discover-design-2026-11-03/README.md).

`media-visual.css` palet değerlerini çoğaltmadan runtime renklerine bağlı sıcak yüzey, 4/8 boşluk, köşe, tek sans yazı ölçeği ve 160ms hareket rollerini tanımlar. `media-visual.js` mevcut düğmeleri/handler'ları koruyan kart, bölüm başlığı, boş durum, dört düğme varyantı, açılır işlem/filtre ve raf gezinmesini sağlar. Ekran özelindeki yerleşim `media-scenes.css` içindedir. Bu iki ekranda IBM Plex Sans tek aile; kapak/hero gerçek kaynak fotoğrafıdır. Eksik kapak sıcak başlık gradyanı ve baş harflerdir, ham dosya adı veya sahte görsel değildir.

Üst medya menüsü yatay kalır; bir ana eylem Medya aç; arama açılır ve ikincil komutlar tam düğmeleriyle menüye taşınır. Aktif ana sekme alt çizgi kullanır. Metadata sonucu küçük kapatılabilir toast'tır; kapatmak iş iptali değildir. Asistanın native paneli korunur, Home/Keşfet'te kapalı baloncuk yerine üst simge vardır. Bir ekranın taşmaması estetik başarı sayılmaz; native görüntü kompozisyonla karşılaştırılır ve zayıflık düzeltilir. Film/RSS/reader/browser içerik tasarımları bu kapsamın dışındadır.

## 2026-11-03 — Onaylı sinematik hareket sözleşmesi

Home, Keşfet ve film üst/alt yüzeyleri için onaylı motion v3 kompozisyonu uygulanır. Grafit/amber marka korunur; ambient görsel rengi ikincil atmosferdir. Ortak süreler 120/200/320/600/900ms, stagger 50ms. Hareket tercihi Otomatik/Tam/Azalt/Kapalı; görünmeyen/odaksız hero durur. Teknik araçlar orijinal olay/form/onay sahiplerini korur. Yeni RSS/browser/kitap yüzeyi bu teslimin otomatik onayı değildir; önce standalone görsel gerekir. Ölçüm ve tasarım farkları docs/implementation/cinematic-motion-round3-2026-11-03/README.md içinde; maksimum20ms hedefi karşılanmış sayılmaz.

## 2026-11-03 — Round 4 film araçları

Onaylı iki kapsamlı tercih paneli: film görüşleri ayrı, genel öncelikler ayrı; okunaklı metinli radio adımları ve kayan altın seçim. Aynı API değerleri korunur, film görüşü sayısal önceliğe dönüştürülmez. Atmosfer normal kart; kalan alan seçim özeti. İzleme/günlük eşit kartlar, üç adımlı hazırlık, tek kaynak popover'ı, ortak alt akordeonlar. Home göstergesi en fazla yedi öğe; sayaç tek satır, başlık üç satır. Cam çubukta arkadaki metin okunamaz. Kapalı ayrıntılar ilk geçişte kurulmaz; renk örneklemesi idle kuyruğunda. Ölçülen maksimum20ms sınırı açık kaldı; estetik veya tam performans başarısı test sayısından çıkarılmaz.

## Claude tam v2 ürün kompozisyonu — 2026-11-05

`files (6).zip` tam v2 referansı mevcut controller/IPC sahipleri üzerinden uygulanmıştır. Ana sayfa türüne göre görsel sahne ve medya kapıları; podcast yatay abonelik şeridi, kapak/plak ve gerçek kuyruk; yorumlarda kaynak okuma masası; zevk profilinde açık tercihler/puan eğilimi/model çıkarımı ayrı bölümler; web geçmişinde devam hero’su; İçerik Ağı’nda harita/okuyucu ve incelenebilir kapsam. Demo fotoğrafı, örnek veri veya simülasyon ürün davranışı değildir. Aktif Podcast/Çift dilli görünüm mevcut ortak browser temelli bileşendir; bu paket ayrı bir oynatıcı gerekçesi oluşturmaz. [Uygulama kaydı](docs/design/claude-redesign-handoff-2026-11-05.md).

## Kısa kalite/performance cilası — 2026-11-05

Podcast aramasında değişmeyen abonelik ve kapak/araç düğümleri korunur; filtreleme yazı yazarken kapağı yeniden yüklemez. Ana medya kaydırıcıları ortak tema rollerini kullanır. RSS sesi, mevcut yerel/native oynatma sahibinde çalışsa da Podcast/RSS diye etiketlenir; mevcut yayıncı ve bilinen kapak kaynak kimliği/generation doğrulanarak taşınır, sonraki yerel videoya sızmaz. Etkin zamanlı satırı bulunmayan seste boş altyazı kutusu gösterilmez; transkript sağda okunur. Kaynak/zaman doğrulaması eksik kayıt, gerçekten zamansız yayıncı metninden açıklamasıyla ayrılır; seek izni artırılmaz. [Teslim](docs/devir/2026-11-05-0950.md).


### Podcast metni ve araştırma notu — 5 Kasım 2026

Ortak Sahne kompozisyonu korunur. Zamansız kaynak/çeviri tam metin olarak sunulur; paragraf sayısı eşleşme kanıtı değildir. Takip kontrolü bu durumda “Salt okunur” gösterir. Satırdaki mevcut kaydet simgesi, kaynak metin seçiliyse yalnız seçimi alır; küçük mevcut bağlam kartında isteğe bağlı not ve görünür kaydet bulunur. Kaynak/sürüm değişince açık seçim geçersizleşir. Zamansız kartta cümleye dönme yoktur; zamanlı kart gerçek satır konumunu kullanır. Uzun metin sessizce kırpılmaz; daha kısa kaynak seçimi istenir. Yeni motor, ayrı podcast sayfası veya tasarım dünyası kurulmaz.

### Sahne iş durumu — 2026-11-08

İş şeridinde yeniden deneme beklerken mevcut düğme Bekleyin/Please wait ve aria-busy gösterir; disabled eylem genel solukluğa düşmez, recovery eylemiyle aynı okunur amber bekleme stilini kullanır. Bu bir üretim ilerlemesi veya başarı durumu değildir; kayıtlı iş etiketi gerçek durumunu korur.

Mevcut Sahne iş şeridi durum etiketi → açıklama → mevcut güvenli eylem sırasını kullanır. Etiket amber/ink ve mevcut ayırıcı tokenlarından gelir; yeni durum sahibi veya toast oluşturulmaz. İptal edilmiş işte servis yeniden deneme sunuyorsa aynı şeritte erişilebilir kalır. Kayıtlı sonuç okuma veya inceleme, üretim/oynatma başarısı gibi gösterilmez.

### Açık kaynak kartı — 2026-11-08

Asistanın kapalı alıntı kartı tek satırda taranabilir kalır; açılınca tam kaynak başlığı satır sarar, zaman/kaynak satırı ve durum etiketleri ayrılır. Kaynak kartı genişletmek oynatma veya kayıt işlemi değildir.

### Oynatma toparlanması beklerken — 2026-11-08

Geniş ekranda (en az1100px) İşlemler paneli açıkken geçici Sahne bildirimi panelin alt düğmelerini örtmez: üst Sahne araç satırının altında, ana içerik alanının solunda görünür. Panel kapalıyken mevcut transkript-altı bildirim yerleşimi korunur. Bu mesaj gerçek eylem sonucudur; bekleyen işlem aynı kaynakta Podcast/Çift dilli geçişinde ikinci kez başlatılmaz.

Mevcut Sahne toparlanma şeridi açıklama ve sağda eylem sırasını korur. İşlem sürerken eylem okunur amber Bekleyin etiketi/aria-busy ile görünür ve ikinci kez çalışmaz; bittiğinde gerçek kaynak hâlâ aynıysa özgün eylem geri gelir. Mesajsız ret başarı gibi sunulmaz.

Sahne İşlemler panelindeki bekleyen eylem de aynı görsel dili kullanır: adı okunur, ikincil Bekleyin/Please wait satırı amberdir; genel Browser disabled solukluğu uygulanmaz. Panel yeniden çizilse de eylem kilidi sürer. Bu vurgu üretim başarısı veya ilerleme yüzdesi değildir.

Transkripsiyon ve çeviri açılır başlığı mevcut metin durumunu ikincil bir satır/etiketle gösterir: zamanlı metin, salt okuma metni, erişilebilir iz, metin yok veya hazırlanıyor. “Hazır” yalnız açık sahibin mevcut metnini ifade eder; yeni üretim veya sağlayıcı başarısı değildir. İleri seçenekler aynı açılır alanda kalır.

Ortak Podcast/Çift dilli kontrol şeridinde zaman atlamaları ve cümle gezinmesi iki mevcut grup olarak korunur; küçük Oynatma/Playback ve Cümle/Sentence üst etiketleri bu ayrımı görünür kılar. Ana oynat düğmesi amber kalır, ses/hız/döngü yerinden taşınmaz; yeni kontrol satırı veya menü eklenmez.

### Bütün ekranın okunabilirliği — 2026-11-08

Uzun Podcast başlığı tam okunur kalır; masaüstünde daha geniş metin ölçüsü ve dengeli boyut kullanır, kısa başlık ölçeği korunur. Zamansız yayıncı metni sürekli okuma yüzeyidir: kopyala/kaydet paragrafın ilk satırı yanında erişilebilir kalır, ayrı boş araç satırı oluşturmaz. Açık temada kapağın atmosfer/gölge yoğunluğu başlık çevresini karartmayacak şekilde azalır; koyu temanın mevcut atmosferi korunur.

Kapak indirilemezse boş/kırık görsel yerine mevcut baş harfli kapak kullanılır. Sonuçsuz aramadan temizleyerek dönmek aynı izdeki manuel okuma konumunu korur. Not hata açıklaması taslakla kalır; uzun metin kendi içinde kayar, Kaydet/Kapat ve transkriptin alt eylemleri birbirine binmez.

Aynı kaynakta görünüm değiştirme arama öncesi okuma konumunu korur. Başarısız notun ana eylemi Kaydetmeyi yeniden dene/Retry saving olarak aynı kayıt yolunu kullanır; yeniden deneme beklerken kilitlidir. Kısa başarı bildirimi transkriptin alt eylem çubuğunun üzerinde görünür, düğmeleri örtmez.

Medya kimliği/kapak ve transkript ayrı görsel güncelleme alanlarıdır: çeviri satırlarının gelişmesi kapağı yeniden oluşturmaz; başlığın/kapak bilgisinin yenilenmesi seçilmiş metni ve satır DOM'unu değiştirmez. Bölüm işaretleri kendi verisiyle yenilenir; bu ayrım kaynak/iz revizyonu doğrulamasını gevşetmez.

Hız isteği beklerken mevcut seçici amber bekleme kenarlığı ve kısa Hız değişiyor/Changing speed durumuyla görünür kalır; odak başka yere taşınmaz, doğrulanmış hız korunur. Uyku sonucu bildirimi yalnız aynı kaynağın başarılı duraklatmasına dayanır; menü veya ikinci oynatma sahibi oluşturmaz.

Transkriptte kaynak/çeviri pasajını fareyle seçmek manuel okumadır: takip durur, konuşulan satır vurgusu ve medya saati ilerler. Yerel metin seçimi/context menu engellenmez; Konuşmaya dön açıkça takibi geri açar. Kaynak ve çeviri seçiminde mevcut amber/on-accent renkleri kullanılır; cümle zaman düğmeleri ve kelime işlemleri korunur.

Bölüm başlıkları metadata ile yenilendiğinde arama ve liste konumu korunur; klavye odağı aynı zaman/başlık kimliğine taşınır. Başlık kaldırılırsa görünür komşu, başlık kalmazsa transkript araması kullanılır. Listeyi gezinmek veya yenilemek seek yapmaz; yalnız zamanlı başlığın açık eylemi mevcut oynatıcıya gider.

İşlem aralığında geçersiz alan mevcut amber çerçeve ve aria-invalid ile belirgindir; Aralığı uygula odağı hatalı alana götürür. Genel hata açıklaması ve “bölümün tamamı başlatılmayacak” güvencesi korunur. Aynı kapsam özeti tick nedeniyle tekrar tekrar canlı bölgeye yazılmaz; bu ekran okuyucu çıktısının gerçekten değişen durumu izlemesini sağlar.

Ortak Sahne kelime bağlamı not kartıyla aynı alt güvenli boşluğu kullanır. Uzun metin klavyeyle odaklanabilen iç alanda kayar; başlık/kapatma ve alt eylemler ekran içinde kalır. Bekleyen kelime işleminde odaklı düğüm yeniden kurulmaz, aria-disabled/aria-busy ile kısa İşleniyor/Working durumu gösterilir. Okuma alanının Boşluk tuşu Sahne oynatmasına sızmaz.

Oynatma grubundaki saniye geri/ileri atlaması, mevcut ok ikonunun yanında görünür 10 işareti taşır; cümle gezinmesi ve tekrarı ayrı ikon grubunda kalır. Bu süre işareti aria-hidden'dır, çünkü mevcut EN/TR erişilebilir etiket zaten on saniyeyi söyler. Sayı için eski simge içi absolute small yerleşimi kullanılmaz; ikon ve sayı yatay hizalanır.

Arayüz dili yenilenirken Sahne'nin odaklı transkript/başlık araması aynı kaynakta imleç/seçim aralığıyla geri gelir. Dışarıdaki ayar kontrolünden odak çekilmez; gizli arama alanı odaklanmaz. Bu iki aramanın metin seçimi transkriptteki mevcut amber/on-accent renkleriyle tutarlıdır.

İşlem kapsamının önizleme zamanları kabul edilen milisaniye hassasiyetini gösterir; tam saniyede gereksiz ondalık yoktur. Yüksek (en az 900px) ekranda aralık alanı açıkken mevcut işlem gövdesi en fazla 400px/40vh olabilir: aralık ve üretim eylemleri aynı anda okunur, transkript altta görünür kalır. Aralık kapalıyken mevcut daha kısa panel sınırı sürer.

## Ortak öneri merkezi · 2026-11-10

Üst medya menüsünde Öneriler; grafit/amber kaynak alanı ve kapaklı sonuç kartları. Film/Anime ve kaynak seçimi açık etiketlidir; kesin başlık seçilmeden benzerlik başlamaz. Sonuç gelince kaynak formu daralır, yeniden açılabilir. Halka açık örnek kapsamı görünür; kişisel puan ve seçili yapım dayanağı birbirine karıştırılmaz. LG tam ekran ve tek dar tanıda taşma 0.

## Seri haritası ve devam takibi · 2026-11-10

İzlediklerim/Anime/Manga içinde mevcut çalışma alanlarına Seri haritası eklenir; kayıt kartı aynı alana seçili kimlikle gider. Grafit/amber tokenları, Sora başlık ve mevcut alan/düğme yardımcıları korunur. Seçili yapım kapağı/kimliği üstte; amber bağlantı çizgili ilişkiler altta. İlişkiler / Yayın sırası / Hikâye sırası / Devamlar birbirini yığmadan ayrı gösterilir. Dar alanda ilişki eylemi kartın altına geçer, çalışma alanları sarılır. Tam tarihler, kısmi tarihler ve bilinmeyenler ayrı bölümlerdir; eksik tarihle kesin sıra iddiası yoktur. Her ilişki kaynak kimliği ve kontrol tarihi taşır. Takip kişisel puan/ilerlemeden bağımsız, açık düğmeyle değişir; hata önceki önbelleği korur. Gerçek Windows görsel kabulü bu dilimde yapılmadı.

## Yayın takvimi ve tür/tema portresi · 2026-11-10

Mevcut arşive Yayın takvimi ve Tür / tema portresi çalışma alanları eklenir. Tüketim geçmişindeki Takvim aynı kalır. Yayın alanı: seçili yapımı kaynaktan kontrol etme, zaman damgalı kaynak takvimleri, ay/saat dilimi, seçili yayınların dışa aktarımı ve amber tarih sütunlu ajanda. Saatli yayın UTC kaynak anını ve seçili yerel saati birlikte gösterir; yalnız gün verilen tarihe saat/saat dilimi eklenmez. ICS önce önizlenir, dosya indirmesi açık düğmeyledir. Tekil yayın seçiminde DOM odağı korunur. Portre: toplam puanlı/tür bilgili/tema bilgili sayıları, genişte iki sütunlu tür ve tema listeleri; amber çubuk tüm puanlı havuzdaki payı gösterir, yüksek/düşük puan örnekleri ayrı açılır. Etiketlerin toplamı yüzde yüz olmak zorunda değildir. Dar alanda ajanda eylemleri alta, portre tek sütuna geçer; mevcut grafit/amber tokenları ve yazı aileleri kullanılır. Gerçek Windows görsel kabulü bu grupta yapılmadı.

## İçerik ağı koleksiyon eşitlemesi · 2026-11-10

Mevcut İçerik Ağı üst eylemlerine Koleksiyonu eşitle eklenir. Mevcut durum yazısı stilindeki ayrı özet, referans/eklenen/gizli/etkin olmayan/kapasite/depolama/çözümlenemeyen/yinelenen kaynak sayılarını gösterir. Haritadaki görünür düğüm sınırı ile kalıcı kaynak sayısı ayrı tutulur. Eşitleme kişisel puan veya kullanıcı tarafından gizlenen görünürlüğü değiştirmez. Mevcut grafit/amber düğmeleri ve EN/TR metin düzeni kullanılır. Native görsel kabul bu tur yapılmadı.


## Kişisel arşiv inceleme araçları — 2026-11-10

Kayıt kartında kimlik düzeltme, üst eylemlerde dışa aktarım; XML aktarımı mevcut girişinde kalır. Tek grafit/amber inceleme penceresi, baskın başlık ve kapsam açıklaması; her kaydın alan farkları açılır bölümde, mevcut/kaynak değerleri yan yana, dar alanda alt alta. Adayda kaynak kimlikleri ve ayrı son onay görünür. Dışa aktarım önce kapsam/biçim ve kayıt sayısı, sonra sınırlı önizleme ve açık indirme eylemidir. Sora/IBM Plex ve ortak tema değişkenleri korunur. EN/TR kontrollü DOM davranışı doğrulandı; gerçek Windows görünümü bu tur denenmedi.


## Kaynak sürümleri ve geri alma — 2026-11-10

Arşiv içe/dışa aktarım, kaynak okuma ve geçmiş eylemleri üstte tek Arşiv araçları açılır menüsündedir. Kayıt kartında Kaynak sürümleri salt okunur incelemesi vardır: iki sürüm seçici, alan/sol/sağ değer ızgarası, farklı satırlarda amber vurgu; dar alanda alan başlığı iki değerin üstündedir. Geri alma geçmişi kayıt bazlı korunacak/dönecek/kaldırılacak özet ve ayrı son onay sunar. AniList açık liste veya MAL XML okuması mevcut alan farkı yüzeyini kullanır; otomatik kayıt yoktur. Mevcut grafit/amber ve yazı ailesi korunur. EN/TR kontrollü DOM akışları geçti; gerçek Windows görünümü bu grupta denenmedi.


## Kaynak kimlikleri ve alan incelemesi — 2026-11-10

Mevcut arşiv çalışma alanlarına Kaynak kimlikleri eklenir; kayıt başlığı altında dört ayrı MAL/AniList/IMDb/TMDB hücresi ve kanıt durumu vardır. Kaynak/uyarlama kimlikleri görsel olarak tek bir etikette eritilmez. Karttaki Kaynaklar / yenile tek inceleme penceresinde kimlik özeti, alan değeri/köken/zaman/koruma ve ayrı yenileme önizlemesi sunar. Yalnız değişen/eksik alanlar iki değerli seçim satırıdır; korunan alan açıkça etiketlenir. Kişisel düzeltme ikincil açılır alanda kalır. Genişte dört kimlik hücresi, darda iki; yenileme değerleri dar alanda alt alta. Grafit/amber, Sora/IBM Plex ve mevcut odak stilleri korunur. EN/TR kontrollü DOM doğrulandı; gerçek Windows görünümü bu tur denenmedi.


## Kapak yönetimi, ilerleme ve akıllı raflar — 2026-11-10

Çevrimdışı kapak yönetimi Arşiv araçları menüsünde kalır; kullanılan/azami MB belirgin, saklama ve silme seçimleri ayrıdır. Silme özeti ve ikinci onay kişisel kayıtların korunacağını açıklar. Seri ilerleme alanı büyük gerçek sayı/amber çubuk, bilinmeyen toplam ve kaynak etiketiyle iki sütunlu kartlar; sezon/bölüm ayrıntısı açılır alandadır. Akıllı raflar adlandırılmış koşullar ve eşleşme nedeni sunar; temel koşullar önde, ülke/yıl/tür/puan aralığı ikincil açılır alanda. Bu alanda havuzun tek sahibi raf filtresidir. Dar görünümde alanlar tek sütuna iner. Mevcut grafit/amber ve Sora/IBM Plex, üst medya gezinmesi korunur. EN/TR kontrollü DOM davranışı geçti; gerçek Windows görünümü bu tur denenmedi.


## Toplu seçim, koleksiyon ve gerekçe — 2026-11-10

Kartın köşesinde erişilebilir seçim kutusu, listede sayı/inceleme/temizleme şeridi; fark önizlemesi ve ayrı son onay. Kartın puan/düzenle/devam eylemi önde, kaynak/harita/not araçları özellik kaybı olmadan Diğer işlemler menüsündedir; Escape menüyü kapatıp özetine odak verir. Koleksiyon alanı kapak+açıklama baskın iki sütunlu kart, gerçek tamamlandı işaret sayısı ve numaralı üye listesi; dar alanda tek sütun. Sıra ikincil açılır düzenleyicide, görsel mevcut üye kaydından seçilir. Ara verme gerekçesi ayrı bağlam ve metin, durum/puanı değiştirmediği açıklamasıyla tek inceleme penceresindedir. Mevcut grafit/amber, Sora/IBM Plex ve üst gezinme korunur. EN/TR kontrollü DOM geçti; gerçek Windows görünümü bu tur denenmedi.
