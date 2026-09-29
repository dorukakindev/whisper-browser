# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- R241 (tur-4 paketi): `npm run smoke:ui`/`audit:ui` arayüz duman ve denetim araçları (menü öğelerini tıklayıp etki ölçer; CI'a bağlandı). Yeni-sekme/özniteliksiz öğelerde ui-locale açılış taramasının `closest()` maliyeti kaldırıldı (~26–42 ms hızlanma).
- R236 (tur-3 paketi): site bazlı reklam koruması — site çipindeki düğme artık yalnız o siteyi etkiler (kapat: `adblockEnabled:false`, aç: alan silinip genel devralınır; genel kapalıysa/boş sekmede genel anahtar). Yeni sekme sayfası: frecency sıralı favicon/avatar kutucuk ızgarası, × ile gizle + geri getir, izleme kütüphanesinden ilerleme çubuklu "İzlemeye devam et" kartları.
- R184: the YouTube TV banner gains a "Tam ekran / Fullscreen" button wired to the existing `youtube-tv:fullscreen` IPC (the main-process handler and preload export existed but nothing called them — lean-back viewing now has a one-click fullscreen toggle).
- R179: opt-in community extras for the YouTube video open in the player — DeArrow crowdsourced titles (same hash-prefix privacy model as SponsorBlock; the community title replaces the player title while the original is kept) and Return YouTube Dislike vote counts (a `👎 N` badge in the meta row). Both behind persistent checkboxes in the SponsorBlock settings section, fetched only for the opened video (no per-card calls), with the same network posture as the SponsorBlock fetcher (credentials-free, no redirects, 7s timeout, 256KB cap, LRU+TTL cache, in-flight dedupe).

### Changed

- R244: ana pencere açılışında V8 kod önbelleği ilk yüklemeden itibaren etkin
  (v8CacheOptions `bypassHeatCheck`); sekme önizleme kartı krom şeridine
  sığmadığında tek satırlık kompakt görünüme düşer.
- R238: sekme/yer-imi/NTP avatar harfi artık kayıtlı alan adından gelir — `tr.wikipedia.org` "T" yerine "W", `sub.bbc.co.uk` "S" yerine "B", `amazon.com.tr` "A" gösterir; renk tonu da alan bazında sabitlendi (aynı sitenin alt alanları aynı tonda).

### Fixed

- R246 (Windows doğrulama): gizli WebContentsView sınırı yerel yuvanın üstünde kalınca Windows'ta HWND bölgedeki işaretçi olaylarını yutuyordu — yeni-sekme sayfasında (#browserEmpty) ve hata/ayarlar yüzeyinde tıklama ile imleç ölüyor, klavye çalışıyordu; gizlenen görünümün sınırı artık ekran dışına taşınır, gösterilende yeniden uygulanır. `whisper-pdf:` koruma kapısı GET fetch'te gönderilmeyen Origin başlığını ve özel şemada boş gelen referrer'ı dış bağlam sayıp 403 dönüyordu — Windows'ta PDF okuyucu açılmıyordu; yokluk artık 'null'/boş kabul edilir, http kökeni ve dosya-dışı referrer yine reddedilir.
- R245 (#181+#184 review triage): kaynak parçanın cümle-sonu sayısı hedef dilin sıra-sayısı kuralıyla ölçülüp doğru çeviriler reddediliyordu — artık kaynak dilin kuralıyla sayılır; VTT `NOTE` bloğu içindeki zaman kodu benzeri satır sahte cue üretip not metnini çıktıya sızdırıyordu — meta paragraflar sınır adaylığından çıkarıldı; altyazı indirmede boyut-sınırı/iptal gibi ilke hataları proxy yedeğini boşuna tetikliyordu ve yedek istekte DNS yeniden-doğrulaması eksikti (TOCTOU) — yedek artık yalnız gerçek ağ hatasında ve yeniden doğrulama sonrası koşar.
- R242 (tur-4 açık maddeleri): bitişik komşular arasına sıkışan ~10 ms'lik cue ekranda okunamaz flaş olarak yazılıyordu — metin artık sonraki cue'nun başına katlanıp cue düşürülür (sonda kalırsa öncekine).
- R243 (#182 review): sondaki flaş cue öncekine katlanırken konuşma zamanı korunur — öncekinin bitişi kısa cue'nun bitişine uzatılır.
- R241 (tur-4 paketi): boş satırlı veya sıfır-süreli altyazı cue'ları tüm işi çökertmiyordu; VTT `NOTE` blokları çevrilip `}`/`-->` dizgileri bozuluyordu; `{\an8}` konum etiketleri birleşen cümlelere sızıyordu; "2. Dünya Savaşı" gibi sıra sayılarından sonra satır kırılıyordu; başarısız işin çıktı işlemi kurtarması aynı adlı kullanıcı dosyasını silebiliyor ve .tmp/journal bırakıyordu; ffmpeg/ffprobe çocuklarına gizli env değişkenleri sızıyordu.
- R240: Devin Review triage — aynı ilk harfli iki site arasında gezen sekmenin avatar tonu bayat kalıyordu (örn. news.google.com→music.github.com); adres önerisi işaretleri sekme avatarından farklı harf üretiyordu (tr.wikipedia.org önerisi T, sekmesi W); farklı IP adresleri aynı avatar tonunu paylaşıyordu; krom alanına sığmayan sekme önizleme kartı yine native yüzeyin altında kırpılıyordu (artık kart kendi içinde kırpılır).
- R239: sekme üzerine gelince çıkan önizleme kartı sayfa yüzeyi (native WebContentsView) altına kayıp kırpılıyordu — kartın alt kenarı artık `#browserViewSlot` üst çizgisini aşamaz; sığmadığında sekme şeridinin içine çekilir.
- R237: tur-3 kalıntıları — kütüphanede iki hızlı tıklamanın ilki geç dönen yetkiyle son seçimi eziyordu (aynı dalda `openIntent` artırılmıyordu); PDF çevirisi sürerken yeni PDF açılırsa çeviri düğmeleri kilitli kalıyordu; eski belgenin çeviri durum/sonuç satırı yerini alan belgenin satırını eziyordu.
- R236 (tur-3 paketi): oynatıcı/PDF/kuyruk/ayarlar 19 düzeltme — basılı-tutma 2× ve boşluk-hızlandırma geçici hızı kullanıcı hızı diye kaydediyordu; diyalog açıkken Backspace oynatıcıyı kapatıyordu; K'ye hızlı çift basış aynı cümleyi iki kez kaydediyordu; tam-ekran/PiP'te kapanınca pencere siyah tam ekranda kalıyordu; sıradaki-video geri sayımı mod değişiminde sürüyordu; kapanışta düzenleyici/A-B kalıntısı; bul/değiştir Esc'i oynatıcı zincirine geçiyordu; yavaş kütüphane tıklaması yeniyi eziyordu. PDF: tarayıcı modunda boş alan, Space/ok/Esc çakışması, çift çeviri, sırasız sayfa ekleme + zoom sonrası kaydırma, ikinci PDF bellek/durum sızıntısı, zoom etiketi. Kuyruk/ayarlar: iş sürerken yalnız iş seçenekleri kilitlenir, özel hız (1.3×) kalıcı, "Sırada dur" düğmesi yaşam döngüsü, ayar araması doğru çekmeceyi açar, EN'de kalan TR dizgiler.
- R235: araç çubuğu details menülerindeki form kontrolleri (select'ler, kaydırıcılar, metin alanları) ok/Home/End tuşlarını kaybediyordu — `wireDetailsMenuNav` aynı tuşu menü gezintisi için de işleyip odağı söküyordu; kontrol odaklıyken gezinti artık atlanır. Sinyal menüsünün ~50 denetimi dahil.
- R234: #167 review — ⋯ menü arama kutusunda ↓/↑ çift işleniyordu (arama işleyicisi ilk öğeyi odaklarken üstteki `wireDetailsMenuNav` aynı tuşu tekrar işleyip ikinciye/sona kaydırıyordu); olay artık kabarcıklanmıyor. İkincil bölünmüş-sayfa kısayol yolunu kilitleyen `electron-browser-split-shortcut` smoke'u eklendi.
- R233: tur-2 paketi kalan düzeltmeler + #165 review — sayfa odaklıyken Ctrl+F iki köprüden de olay gönderiyordu (tek yola indirildi), ⋯ menü araması ilk ↓'da atlanıyordu (odak açılışta arama kutusunda; ↓/↑ komutlara, Enter ilk eyleme gider), yer-imleri listesi yenilenirken odak kayıt kimliğiyle geri verilir (yeni kayıt öne eklenince yanlış satıra düşmüyor), bölünmüş görünümün ikincil sayfasında kısayol basmak odağı çalıp hiçbir şey yapmıyordu (sayfa önce aktifleştirilir, sonra kısayol çalışır).
- R232: tarayıcı UI tur-2 düzeltme paketi — komut paleti hiç çalışmıyordu (eşleştiriciye ham sekme nesnesi veriliyordu), diyalog/ayarlar açıkken Ctrl+W/T/Tab/1-9 arkadaki sekmeyi etkiliyordu, Esc başka panelleri de kapatıyordu, omnibox Home/End öneri seçiyordu (Alt+Home/End), QR paneli Esc'siz kalıyordu, paneller üst üste açılıyordu, sağ-tık menüsü native sayfanın arkasında kalıyordu, kapat düğmesine çift tık grup diyaloğu açıyordu, "Sağdakileri kapat" gruplu düzende yanlış tarafı kapıyordu, yer-imleri listesi klavye odağını düşürüyordu, sayfa odaklı kısayollar adres çubuğunu gösterip tuşu sayfaya bırakıyordu, SPA gezisinde bul çubuğu kapanıyordu.
- R231b (#164 review): vekil menü öğelerinin durumu menü dışındaki hedef düğmede yaşar — menü açıkken hedef devre dışı kalırsa (örn. sekme değişimi) arama sonucu da tazelenir; bayat eşleşme gri kalmaz.
- R231 (#162 review): ⋯ menüsü açıkken bir öğenin durumu değişirse (örn. sayfa YouTube'dan çıkınca "Oynatıcıda izle" devre dışı kalır) arama sonuçları kendiliğinden tazelenir — bayat gri eşleşme kalmaz.
- R230 (#160 review): menü araması hızlı eylemleri (Yeni sekme, sekmeyi geri aç, sayfada bul, zoom) de bulur ve Enter'la çalıştırır; devre dışı öğeler eşleşme sayılmaz — ölü gri sonuç yerine "eşleşen komut yok" satırı.
- R229: tarayıcı ⋯ menüsü ve vurgu cilası — yenile/durdur ikonları aynı anda gösterilmez, açık temada koyu çerçeve düzeltildi, "Aktif işler" ve `https://` şeması kontrast eşiğine çıkarıldı, vekil menü öğeleri devre dışı hedeflerde neden belirtir, menü araması kapanışta sıfırlanıp boş durum gösterir ve Enter ilk sonucu çalıştırır, "Bu anı kaydet" ve "Sayfada öğe gizle" sinyal verir, "Videoyu indir" açık YouTube adresini oynatıcı alanına öndoldurur, QR ikonu ve çeviri menüsü checkbox boşluğu düzeltildi.

- **Kısmen bozuk PDF durum dosyası sağlam sayfaları kurtarır** —
  geçersiz sayfa kayıtları tek tek atılır; tümüyle bozuk dosya yine
  `.bak`/legacy yedeğine düşer.

- **Temizlenmiş PDF sayfasının eski çevirileri dirilmez** — meşru boş
  sayfa kaydı (`{n: []}`) bozuk sayılmaz; yalnız yapısal olarak bozuk
  dosyalar `.bak`/legacy yedeğine düşer.

- **Tamamen bozuk PDF sayfa kayıtları da yedeği gizleyemez** — `pages`
  nesnesi taşıyıp içeriği normalize'da düşen dosya artık adaydan
  atlanır; `.bak`/legacy çevirileri yüklenir.

- **Bozuk PDF çeviri durumu sağlam yedeği gizliyordu** — kimliği uyumlu
  ama sürümü/sayfaları geçersiz dosya taze duruma düşüp `.bak`/legacy
  adaylarını atlıyordu; okuma döngüsü artık uyumsuz adayı atlar.
- **Yazım-farklı hafıza satırı yankıyı çeviri diye döndürebiliyordu** —
  TM eko bekçi artık depodaki kaynağa karşı da çalışır.

- **Eski hafıza kayıtları yankı "çevirisi" diye dönebiliyordu** — önceki
  sürümlerden kalan noktalama-benzek TM satırları `lookup` isabetiyle
  kaynağı çeviri gibi uyguluyordu; kullanım anında da elenir.
- **Bayat journal mezar taşı yeni çeviriyi silebiliyordu** — silme
  satırı artık temel dosyadaki `updatedAt`'ten eskiyse atlanır; `v`
  alanı taşımayan bozuk satır da mezar taşı sayılmaz.
- **PDF çevirisinde uyumlu eski dosya bulunamıyordu** — durum okuma
  döngüsü kimliği uyuşmayan adayları atlayıp aynı pdfHash'in uyumlu
  legacy/yedek dosyasına ulaşır.

- **Bulanık çeviri hafızasına tembel yankı satırı sızıyordu** —
  "değişmeden kabul" edilen satırlar ve noktalama-benzek ekolar
  (`'Wait!'→'Wait.'`) TM sqlite'a yazılıyordu; `store()` yalnız birebir
  eşitliği reddettiği için bu satırlar sonraki dosyalarda fuzzy
  eşleşmeyle kaynağı "çeviri" diye döndürüyordu (tüm kalite kapılarını
  atlatır). TM artık yankı-kabul yolunda hiç yazılmıyor ve normal
  yolda da eko-benzeri satırlar eleniyor.
- **Önbellek kapasite kesimi yeniden açılışta diriliyordu** — sınırı
  aşan kayıt bellekten silinse de journal satırları kalıyordu; replay
  kesilen çeviriyi en yeni konuma oturtup yaşayan bir girdiyi dışarı
  atıyordu. Kesimler artık journal'a mezar taşı (silme işareti) yazar.
- **Süresi dolmuş journal satırları yüklemede elenmiyordu** — TTL
  kontrolü yalnız temel dosyada vardı; eski satırlar replay ile
  geri dönüp bir sonraki sıkıştırmada kalıcılaşıyordu.
- **`.bak` yedeği sıkıştırma öncesi içeriği tutuyordu** — birincil
  dosya bozulunca geri dönüş journal'dan katlanan son çevirileri
  kaybediyordu; yedek artık rename sonrası (sıkıştırılmış tam
  içerik) alınır.
- **PDF çeviri durumu sağlayıcı değişiminde siliniyordu** — durum
  dosyası yalnız `pdfHash` ile adlandırıldığı için endpoint'e göre
  taze başlayan iş aynı dosyaya yazıp önceki sayfa çevirilerini
  eziyordu. Dosya adı artık sağlayıcı kimliğini de kapsar; eski
  dosyalar geriye dönük okunur.

- **"Değişmeden kabul" hiç devreye girmiyordu** — iki turda da kaynağı
  yankılayan satırın kabul kontrolü, ikinci kurtarma denemesi de hata
  fırlatınca `except`'in erken dönüşüyle atlanıyordu; 'Rock and roll!',
  'Ha ha ha.' gibi doğal olarak değişmez satırlar yine `.partial` dosyaya
  ve başarısız sayıma düşüyordu. Kabul artık kurtarmanın her çıkış
  noktasında çalışır ve üçüncü istek ödenmez.
- **Değişmeden kalan satırlar işi `.partial` yapıyordu** — kalite
  raporu kaynakla aynı görünen metni "çevrilmedi" sayıyordu; bilinçli
  korunan satırlar (zaten hedef dilde / yankı-kabul / önceden çevrilmiş)
  artık `status_out.unchanged`/`precompleted` üzerinden muaf tutulur.
- **Türkçe sıra sayıları cümle sonu sanılıyordu** — `'21. yüzyıldayız.'`
  içindeki `21.` ikinci cümle sonu sayılıp parça kapısı doğru çeviriyi
  reddediyordu; ifade başındaki ve küçük harfle devam eden `rakam+nokta`
  artık cümle sonu sayılmaz.
- **Sayfa çevirisinde paragraf içi bağlantılar metni çiftliyordu** —
  `<p>` içindeki `<a>/<button>/<label>` ayrı blok taranıyordu; üst blok ve
  iç blok çevirileri üst üste yazılarak "Dosyayı buradaindirmek için…"
  gibi bozuk çıktı üretiyordu. Taranan bloklar artık üst metin bloğuna
  katılır; bağlantı öğesi korunur, nav içi gibi üst blok yoksa kendi
  bloğu kalır.
- **Sayfa çevirisinde tek hatalı blok komşu doğru çevirileri de
  düşürüyordu** — korumalı-işaret/bağlam-sızıntısı kapısı artık blok
  bazlı: hatalı blok kaynak metniyle bırakılıp `failedIds` ile
  raporlanır; kaynak-echo'su içeren sonuçlar önbelleğe yazılmaz.
- **Kısa tarayıcı çevirileri kalıcı hataya düşüyordu** — iki cue'luk
  "I don't / know." → "Bilmiyorum." gibi tek-kelime çıktılar parça
  zorunluluğuna takılıyordu; dağıtım artık birleşik balona düşer ve
  `coveredCueIds` ile kapsanan cue'lar bütünlükte tamam sayılır.
- **Kesin çeviri hataları istek fırtınası üretiyordu** — içerik
  filtresi, yarıda kesilen yanıt, bozuk JSON ve düşünme-bloğu
  kırılmaları HTTP kodu taşımadığı için tüm rotalar + scheduler
  tekrarlarıyla cümle başına 6–12 istek yakıyordu. Bu hatalar artık
  kesin sayılır (tekrarlanmaz) ve ardışık kesin hatalar kuyruğu
  sağlayıcı-kesici gibi durdurur.
- **Aynı zaman aralığındaki cue'lar aynı çeviriyle eşleşiyordu** —
  `translationsForCues` eş örtüşmede hep ilk çeviri satırını
  seçiyordu; artık kullanılmamış eş-değer satır tercih edilir,
  birleşik (merged) satırın yeniden kullanımı korunur.
- **Çeviri önbelleği ana süreci kısa aralıklarla donduruyordu** —
  50k kayıtlı ~13MB dosya her yazımda baştan serileştirilip `.bak`
  kopyalanıyordu (~60ms). Artımlı yazımlar `.journal` sonuna ekler;
  bayt/tur/yaş eşiğinde tek tam sıkıştırma yapılır.
- **PDF çeviri önbelleği sağlayıcı değişiminde karışıyordu** — önbellek
  kimliğine `endpoint` eklendi; aynı model adıyla farklı sağlayıcıya
  geçişte eski sonuçlar kullanılmaz.
- **R221 (çeviri hattı — backend):** model bir satırı aynen
  döndürdüğünde işin ölmesine yol açan yankı reddi düzeltildi —
  "değişmeden kalmalı" satırlar (vokalizasyon, kod/özel-ad dizgileri,
  zaten hedef dilde olan satırlar) artık API'ye hiç gönderilmez;
  yankılayan grup iki kurtarma turundan sonra "değişmeden kabul" diye
  işaretlenip önbelleğe yazılır. DeepSeek-R1/Qwen3 gibi düşünen
  modellerin `<think>` bloğu artık JSON seçiminden önce silinir
  (eski kod düşünme bloğu içindeki ilk `{…}` nesnesini gerçek yanıt
  sanıyordu). `translate_existing_subtitle` aynı-dil kapısı eklendi —
  `.tr.srt`'yi Türkçeye çevirmek ~3000 boş isteğe mal oluyordu; dosya
  gövdesi çoğunlukla hedef dildeyse iş sıfır istekte biter. Çeviri
  istemcisine `max_retries=0` eklendi — SDK varsayılanı + üstteki
  kendi denemelerimiz birleşip paket başına 6 HTTP isteği üretiyordu.
  GPT-5/o-serisi modellere `temperature` göndermek 400 hataya
  düşüyordu — `llm_generation_kwargs` artık reasoning ailelerine
  `max_completion_tokens` verir ve rol `developer` olur.
  `finish_reason="length"` kesik yanıtı artık paketi ikiye böler
  (kurtarma döngüsü yerine). Kesin sonuçlu hatalar (content_filter,
  moderasyon, 400) rotaları fatal-fast bitirir ve `invalid_batches≥6`
  yapısal devre kesicisi son-deneme turlarını keser. Çeviri önbelleği
  ve TM artık her kabul edilen pakette (ve birkaç saniyede bir) diske
  yazılır + paket aralarına iptal kontrol noktaları eklendi —
  iptal/çökmede ödenen çeviriler kaybolmuyordu. "Eksikleri tamamla"
  artık dosyanın tamamını bağlamla birlikte verip yalnız eksikleri
  ister (önceden eksikler ayrı liste sanılarak yanlış cümleler
  birleştiriliyordu). `series_memory.merge_many` paket başına fsync'i
  iş sonu tek yazıma indirir ve final metinlere karşı yeniden süzer.
  Refine geçişinde doğrulanamayan grup 1. geçiş çevirisi artık
  önbelleğe yazılır. Almanca kaynaklarda otomatik terim çıkarımı
  büyük-harf gürültüsünü artık atlar. `test_golden_corpus` sözleşmesi
  devre-kesicili üst sınıra taşındı; `test_translate_pipeline_r220`
  (23 test) yeni yardımcıları kilitler.

- **"Sırada dur" sonrası kuyruk başlat düğmesi kilitli kalıyordu** —
  `persistQueueNow` beklerken durdurulan kuyrukta `renderQueue` bayraklar
  hâlâ yüksekken çiziliyor ve `finalizeQueue` düğmeleri yeniden
  senkronlamıyordu; kuyruk bir daha başlatılamaz durumda kalıyordu.
  Artık `finalizeQueue` `syncJobsCenter` çağırır (davranışsal regresyon
  testi R219-01 düzeltmesiz kırmızı doğrulandı).
- **Kuyruk durumu diske bayat `queueRunning:true` yazabiliyordu** —
  80ms debounce'lu persist, bayraklar düşmeden önceki anlık görüntüyü
  yazıyordu; `queueSnapshotForDisk` artık bayrağı normalize öğelerden
  türetir (terminal olmayan öğe yoksa `false`).
- **Video analiz köprüsü 1MB üstü stdin'i kesik JSON hatasıyla
  reddediyordu** — artık açık boyut-sınırı mesajı döner.

- **live-asr CUDA→CPU geri dönüşünde ses kaybı** — GPU yüklemesi çökünce
  kuyruğa alınmış ses parçaları diskten siliniyordu; artık yeni sürece
  yeniden beslenir (`pendingChunks`).
- **live-asr CPU geri dönüşü başlatım hatasında parça sızıntısı** —
  CUDA'dan CPU'ya düşerken yeni süreç senkron hata fırlatırsa
  saklanan ses parçaları temp klasöründe kalıyordu; yakalama
  aşaması da 'running' kalıyordu. Artık parçalar siliniyor ve
  aşama hata olarak kapatılıyor.

- **DeArrow topluluk başlıkları hiç yüklenmiyordu** — SponsorBlock yanıtı
  tam sha256 anahtarlıysa 8 karakter kelepçeli önek lookup'u tutmuyordu;
  tam karma doğrudan hesaplanır.
- **yt-dlp bakım sürüm eşleşmesi** — yamalı `DD.MM.YY.N` sürümleri
  `YYYY.M.M` beklentisiyle güncellenebiliyordu; karşılaştırma normalize
  edildi.

- R190 (Devin Review batch triage, PRs 84–117 — all 31 confirmed bug/security findings fixed): subtitle find/replace now respects grapheme-cluster boundaries (ZWJ emoji, regional-indicator pairs like flags, combining marks — whole-word and literal searches no longer split or skip them); favicons no longer get saved to the wrong site after a fast navigation, survive a transient write failure (5s one-shot retry), and flush on quit; the UI-locale change now reaches the main process immediately (`app:ui-locale` IPC) so a dialog opened right after switching shows the new language instead of the 400ms-debounced stale one; tab-group collapse state no longer resets on locale switch (locale-independent `toLowerCase` group key); Ctrl+W can't close a tab while a confirm dialog is open; a temporary GPU detection failure no longer erases the user's CUDA preference and the badge reports 'CUDA · algılanmadı/not detected' instead of advertising float16; community extras (DeArrow/RYD) re-fetch when their checkbox toggles, no longer apply stale responses to a video you navigated away from, and the community title survives HLS recovery; live-ASR chunk gates widened to the worklet's [0.0625,16] range so >4× playback no longer stalls the live transcript; the yt-dlp updater's URL gate now also covers shorthand IPv4 spellings (127.1/hex/octal/decimal) and every redirect hop; `.wbp` extraction no longer deletes a pre-existing file when the exclusive create fails; duplicate catalog ids on import get rekeyed instead of silently erasing an existing record; BOM-prefixed TMDB metadata loads; subtitle-language variant filters distinguish pt-BR from pt-PT; dialog error messages and the command palette follow the UI locale; the Windows smoke checks stderr for fatal markers instead of passing a live-but-crashed process; `writeSourceEdits` reports quota failure instead of pretending the save landed. Full per-finding table: `docs/raporlar/BROWSER_BUG_REPORT_170.md`.
- R189: the browser translate-menu popover no longer overflows the window's right edge at 1.5x scale/narrow layouts — it is now anchored to its button via CSS anchor positioning with a flip fallback, and the Electron smoke suite was hardened end-to-end (CDP promise anchoring for "Promise was collected" flakes, POSIX-safe process cleanup, nested-Electron spawn flags, subtitle-output exit hang).

- R188 (Electron smoke-suite triage — full set is green again): three product fixes surfaced by the failures — `setSideTab` now expands the side rail to panel mode when a tab is requested programmatically (previously the tab content stayed hidden inside the 48px icon rail); the settings drawer is no longer hidden by the icon rail's child-hiding rule when `side-rail-mode` and `settings-open` coincide; and `syncBrowserOcclusion` now treats `side-rail-mode` like sidebar-collapsed/cinema so the WebContentsView doesn't draw over the settings drawer. Browser `find-in-page` and history strings left in Turkish under the EN UI (`Arama yapılamadı`, `Eşleşme yok`, `bugün/dün/N gün önce`, `N sa M dk`) now go through `UiLocale` (new entry + two duration patterns). `WebContentsView` gets `backgroundThrottling: false` as hardening so split-view/background pages keep fresh media and capture timers. Six smoke updates encode deliberate product contracts instead of bypassing them: tab-leak seeds the renderer cue model (the renderer's debounced resync is the single source of truth — raw IPC injection was being wiped), extras waits out the 220ms rail-expansion grid transition, the TR-contract smokes seed `uiLocale:'tr'` profiles (UI default is EN), youtube-oauth cancels via the real `ytDeviceCancel` button (closing the modal intentionally does not cancel the loopback flow), and menu-visual seeds `browserMediaSeen` (the unified Whisper button is intentionally hidden until media is seen).
- R186 (Windows validation findings): in EN mode the screenshot/manga-export save dialogs showed hardcoded Turkish titles — the two `saveBrowserPageCapture` call sites bypassed the `dt()` fallback by passing literal TR strings. The "Sekme korumalı" (protected tab) dialog, watch-list status strings (`Klasör seçilmedi`/`Seçilmedi`/`Dosya bulunamadı`), command palette titles/categories/disabled reasons, settings categories + search results + all 28 registry label/description pairs, and the site-permissions surface (14 labels, options, load/error messages) now localize via `interfaceChoice`/`uiText` or new dictionary entries (~80 pairs). `#playerVideoPath`'s "Seçilmedi" empty state is handled by an explicit `setLocale` case since the node sits in the ignored (user-data) selector list.
- R185 (renderer hardening sweep): `writeSourceEdits` was the only `localStorage.setItem` site without a try/catch — a `QuotaExceededError` when the browser source-edit records fill up would have aborted the save flow mid-flight; it now matches the other 38 guarded sites. A sweep of all 32 dynamic `innerHTML` sinks (every interpolation `escapeHtml`-wrapped or numeric), all 20 `JSON.parse(localStorage)` sites (all try-guarded), `parseInt` radix usage, and TODO/FIXME debt found the codebase clean.
- R183 (dead-code sweep): removed never-called functions left behind by earlier refactors — `waitForBrowserAdblockReady` in main.js (the adblock ratchet already pins that first navigation must NOT block on it), `showTabError` in renderer.js, `sameId` in media-catalog-store.js (superseded by the R170 indexed import matching), and the unused `pageMemoryKey` helper inside the injected page-translate payload.
- R182 (backend second pass): `browser-dialogue` now reports a Turkish "Konuşma aracından geçersiz yanıt alındı." instead of a raw JSON `SyntaxError` when the separator/transcribe helper prints a malformed reply; the previously-untested module's validation gates (≤60s range, model allowlist, 2-letter language), output-containment check, and temp-folder cleanup on every failure path are now pinned by `tests/browser-dialogue.test.js` (8 scenarios).
- R181 (tools/test-infra audit): the Windows package was shipping ~22MB of internal dev surfaces — `docs/raporlar/`, `benchmarks/`, `quality/`, `design-system/`, `.agents/`, `premium-ui.json`, and root internal docs (AGENTS, CLAUDE, DEVIR-NOTU, YENI-BILGISAYAR, DESIGN, UI-DESIGN-SYSTEM, UX-CONTRACT, CODE_OF_CONDUCT, CONTRIBUTING, DRM-KURULUM) are now excluded by `package-windows.js` (`tools/` is kept on purpose — the in-package `install.bat` calls `tools/install-orchestrator.js`); a new static ratchet test (`tests/windows-package-ignore.test.js`) pins 23 excluded + 19 shipped paths. `smoke-windows-package.js` no longer waits forever for an `exit` event on an already-dead child (exitCode/signalCode gate + 5s cap); `browser-stream-fixture-server.js` delayed writes skip destroyed sockets; `audit-subtitle-golden.js` no longer vacuously passes an empty golden set; `install-orchestrator.js` reports a clear NPM_MISSING instead of `bulunamadi: undefined`.
- R180: remote response bodies are now read with streaming byte caps instead of buffering the whole body — five sites (YouTube RSS subscription feeds 256KB, subtitle downloads, TMDB metadata 4MB + poster 8MB, image save-as 50MB, favicon fetch 256KB) applied the size limit *after* `res.text()`/`arrayBuffer()` had already buffered everything, and `content-length` is sender-controlled so it can't be trusted as the cap.
- R178: file names derived from page titles/labels (auto-saved web subtitles via `browserConfiguredSubtitlePath`, export defaultPaths, image/screenshot names, job-log names) now pass a shared `windowsSafeFileName` sanitizer that also handles Windows reserved device stems (`CON`/`PRN`/`AUX`/`NUL`/`COM1-9`/`LPT1-9` — invalid regardless of extension) and trailing dot/space trimming; previously a page literally titled e.g. `CON` made the silent subtitle write fail on Windows.

- R175 (T9 Windows acceptance findings): browser window-level shortcuts (Ctrl+T/W/L/F, Alt+←, F5) were dead whenever an input/button/link held focus — the tag guard ran before the shortcut bridge; the bridge now runs first (`browserShortcutForInput` only maps window chords, so typing/editing keys are untouched). EN-mode Turkish leftovers fixed end-to-end: ~28 native dialogs (file pickers, Save buttons, quit/close warnings, consent prompts, filter names) now follow the UI locale via a `dt(tr, en)` helper wired through `dialogText` into the download/feature-services/mini-player/catalog modules; tab-strip labels and badges re-render on locale change (`uiIslands` + `renderBrowserTabs` on `ui-locale-change`); ~15 missing dictionary entries added (OPERATIONS DESK, hint-paragraph fragments, main-process diagnostics/notices).
- T2 timing audit: live DASH `$Time$` template matching now subtracts `presentationTimeOffset` — live-stream cues were being placed hours ahead (the pattern matcher didn't even carry the field). Observed `playbackRate` clamps widened from the 4× control limit to [0.0625, 16] in three places — the main-process media probe, the live-ASR worklet clock, and HLS stability tracking — so sites playing faster than 4× no longer poison seek detection, ASR chunk timestamps, or recovery-right resets (the apply-side speed clamp stays at 4×).
- Live subtitle-provider fixes verified against real endpoints: the Stremio (keyless) fallback queried series as `series/<imdb>/<s>/<e>` — the addon's video-id form is `<imdb>:<s>:<e>`, so every keyless TV search 404'd; and the language filter silently did nothing because the UI sends ISO 639-1 (`tr`, `ru`) while Stremio returns 639-2/-3 (`tur`, `rus`, `pob`) — an alias table now normalizes both sides (also fixes the +10 language match bonus). Verified live: `ru` returns the `rus` row, `pt` catches `pob`, real cp1251 Cyrillic file decodes correctly.
- Windows install hardening (from the R114-C Windows validation session): `requirements.txt` pins `ctranslate2==4.4.0` (pip resolving 4.8.2 crashed WhisperModel init with 0xC0000005 on a fresh Windows install); core install now runs an `import ctranslate2, faster_whisper` smoke (`IMPORT_SMOKE`) so a broken resolution/missing-DLL fails at install time, and `install-browser-tools.bat` verifies `import onnxruntime` with a vc_redist.x64 pointer when VC++ Redistributable is absent.
- GPU-less machines no longer show a misleading "CUDA · float16" badge: when `env.gpu` is empty the device select switches to Auto (backend falls back to CPU) with a warning — the saved preference is not overwritten.
- Media catalog import perf: `planImport` rescanned the whole catalog per incoming record (O(n×m); 5k catalog + 2k import blocked the main process ~14.6s) — it now builds importRef/IMDb/TMDB/title-key indexes once per plan with identical match semantics (~56ms, ~260×); catalog search no longer re-folds every record per keystroke (WeakMap fold cache + 120ms debounce).
- Electron hardening: every webContents now denies webview attachment app-wide (defense-in-depth over webviewTag:false), and the mini-player window's lock flags are explicit. New static ratchet test scans all window/view creation sites for required webPreferences locks.
- yt-dlp updater: wheel filenames with path separators are rejected before download (prevents writing outside the staging dir); https artifact/metadata URLs are restricted to globally-routable IPs (SSRF hardening).
- Manga image URL gate: trailing-dot FQDNs (`localhost.`, `*.local.`) no longer bypass the loopback/private-host checks (SSRF hardening).
- Kuyruk seçeneklerinde NaN/±Infinity değerler artık diske `null` olarak sızmaz; `queue-persistence.js` `sanitizePublicValue` sonlu-sayı kapısı ekler.
- R156: settings hardening — a corrupt `settings.json` (unparseable, wrong root type, or type-corrupt top-level fields) no longer silently wipes all preferences: bad fields are dropped, good ones kept, the original file preserved as `settings.json.corrupt-<ts>`, and the user warned via the existing load-warning channel.
- R155: installer UX — `start.bat` now runs `setlocal` so its PATH/env prefixes stop leaking into (and re-prepending in) the calling console; helper installers (`install-browser-align/tools/extras.bat`) pause on every failure path so double-clicked installs show the error instead of closing instantly.

### Security

- R241 (tur-4 paketi): Invidious altyazı dil kodu `..\..` yol traversal'ına kapandı; içe aktarılan çalışma paketindeki geçmiş kayıtları koşulsuz altyazı erişimi veriyordu (SMB/NTLM sızıntısı dahil); sayfa çevirisi blok hacmi 20k ile sınırlı; mailto döngüsü 1/3 sn'ye tıklandı; favicon getirme yalnız herkese açık host + yönlendirmesiz; `-` ile başlayan argüman değerleri `--opt=val` ile geçiyor.
- R242 (tur-4 açık maddeleri): altyazı indirmesi DNS rebinding'e kapandı — DNS doğrulaması dönen {address, family} artık isteği Node tarafında aynı IP'ye sabitler (`lookup` pinning; SNI/Host korunur, proxy'li veya oturumun kendi https interceptor'ü olan ortamlarda Chromium yoluna geri düşülür). `whisper-assets://` host'u oturum başına rastgele nonce — sabit `ass` host'u artık 404 döndüğü için sayfalar uygulamayı parmak iziyle tespit edemez.
- R243 (#182 review): `DIRECT; PROXY` zincirinde doğrudan bacak düşünce proxy yedeği denenir; `resolveProxy` belirsizliğinde Chromium yolu korunur; http isteğe Secure çerezler taşınmaz.

### Internal

- R187: capture/download durability audit — browser-downloads, network/DASH capture, acquisition state machine, manifest transactions, CEA machinery, burn-in recovery, ASS renderer and all single-commit modules reviewed clean; extended soak (600 capture + 80 hibernation cycles) passed with 0 unhandled rejections. Evidence in `docs/raporlar/BROWSER_BUG_REPORT_167.md`.
- R175 ratchets: new `tests/dialog-locale.test.js` fails on raw TR literals in native-dialog fields (`title/message/detail/buttonLabel/name`, `buttons[]`) across the six main-process files — `dt()/dl()/dialogText()` args and dictionary-covered renderer-bound fields exempt; `ui-locale.test.js` now decodes HTML entities and requires every non-dictionary static string to sit in the `NEUTRAL` allowlist (previously only TR-character strings were audited).
- R173 (renderer.js slice 3): 7 more internal helpers (queue persistence/meta, live-ASR blob encode, details-menu focus, YouTube account switch/remove) moved to `renderer-helpers.js`; extraction safety rule hardened — module-body callers and in-slice literal assertions now count as blockers.
- R172: renderer.js slice 2 — 9 tab-strip helpers (`browserTabLabel`, `syncBrowserTabAudioButton`, `browserTabActivity`, tab-menu/preview lifecycle) moved to `renderer-helpers.js`; same four exclusion classes verified, `npm test` green. Fixed a coverage gap: the i18n `setBrowserSignal` ratchet now scans all `src/renderer/*.js` files, not just `renderer.js` (helpers' literals had escaped it since slice 1).
- R153: renderer.js modularization, first verified slice — 63 leaf functions (753 lines) moved to a new `src/renderer/renderer-helpers.js`, loaded between `status-copy.js` and `renderer.js`. Safe set computed against the suite's source-slicing conventions (name anchors, body-text asserts, region slices, eval-time callers); behavior unchanged, full `npm test` green.
- Added opt-in real end-to-end transcription test (WHISPER_E2E=1): synthesizes speech, runs transcribe.py on tiny/CPU, verifies NDJSON contract + SRT/VTT/JSON output.
- R166: `.wbp` video extraction now bounds the actual decompressed bytes to the declared zip `file_size` and deletes partial targets on failure — tampered archives can no longer leave truncated files behind.
- R165: persistent favicon cache — favicons now survive restarts via a separate `browser-favicons.json` store (LRU 120 origins, ≤96KB each, `data:image/*` only), loaded once into the renderer via a new guarded `browser:favicons:list` IPC; history/bookmark/omnibox rows keep their icons without re-visiting sites.
- R164: subtitle find/replace perf — `literalRanges` no longer re-folds a growing window per start point (O(L²) per cue, ~21s for a 4k-cue search); a single-fold + `indexOf` fast path (with a fold-length-changing codepoint regex fallback to the slow path) brings it to ~34ms, proven equivalent by a 2000-round fuzz against the old algorithm.
- R163: resource-leak inventory — `tests/resource-leak-inventory.test.js` ratchets timer/child-process/observer set/clear pairs, `fs.watch` absence (interval model), `modelProcesses` add→close-delete balance, and `jobLog` stream close.
- R162: rejection+atomicity sweep — `tests/rejection-atomicity.test.js` ratchets the `unhandledRejection` sweeper, `.then` chain catch coverage, `atomic-json` tmp+rename discipline for state files (direct `fs.writeFileSync` confined to user-output/temp paths), and `jobLog` write try/catch. No bugs found.
- R161: NaN sweep — `tests/number-normalization.test.js` ratchets non-finite-number dropping across `clonePublicOptions`/snapshot/disk-JSON, src-wide `parseInt` radix completeness (depth-aware scan, vendor excluded), and the truthy-gated numeric opts→argv path in `main.js`.
- R160: unicode path ratchets — `tests/unicode-paths.test.js` verifies `ffSubtitlesArg` escaping on Turkish/space/quote Windows paths, ASCII staging names for burn-in, queue label derivation from Turkish paths, argv (no-shell) `--input` passing, and BOM'd `write_srt` to a Turkish-named file (real Python call).
- R159: NDJSON protocol durability — `tests/ndjson-durability.test.js` adds boundary ratchets (1024-char minimum cap, flush-while-dropping, lone-CR, per-line overflow reporting) plus a 2000-round random chunking fuzz verifying lossless ordered event reconstruction; `main.js` `handleLine` corrupt-line→log and terminal-latch paths reviewed, no bugs.
- R158: retry/backoff stress — `backend/test_retry_backoff.py` ratchets `call_api_with_retry` boundaries (attempts coercion, 120s total-wait cap incl. exact-boundary, 30s exponential cap, 429 backoff, Retry-After past-date clamp, status-less "429" non-retryable guard, `api_error_status` edges).
- R157: queue-state corruption simulation — `tests/queue-state-corruption.test.js` runs ~25k adversarial/fuzz assertions on `queue-persistence.js` (id/type/input rejection, dedupe, running→pending recovery, terminal-state protection, circular/prototype-pollution safety, 5k random snapshots); no bugs found, invariants now ratcheted.
- R152: timecode edge-case ratchet — `tests/subtitle-timecode.test.js` locks `parseTime`/`parseTimedBlocks`/`formatSrtTime`/`cuesToVtt` contracts (unit-suffixed times, comma/dot fractions, BOM+CRLF, separator-less SRT numbering, 3-digit hours, X-TIMESTAMP-MAP offset, NOTE-block separation, negative clamp); `formatSrtTime` exported for test visibility.
- R148: local subscriptions RSS feed — new `subs:rssFeed` main-process handler fetches public `feeds/videos.xml` per subscribed channel (≤30 channels, 4-way concurrency, 8s/256KB caps, per-channel error tally) and `renderStSubsFeed` renders a "New videos from subscriptions" card row under the local subs panel via a dependency-free Atom parser (`src/subscription-feed.js`); no YouTube sign-in or Invidious session required.
- R145: resource-soak measurement hardening — phase-tagged per-cycle heap trace with per-kind regression (mixed-phase least-squares no longer produces fake slopes); `listener-delta` now covers main-process emitters only at zero tolerance, while a new same-state `toggleProbes` instrument (player↔browser before/after listener counts, first render moved to warmup) feeds `renderer-listener-drift`; disk writes split into per-writer categories (`writeOpsPerCycle`) so one writer's flood fails alone; soak probe labels id-less buttons via aria-label/text; stray `|||||||` merge marker removed from this file and `tests/conflict-markers.test.js` ratchets markers out of tracked text files.
- R144: dead-code sweep — removed never-called `normalizeAnchorText` (its inline `normalize` lives inside the page-serialized `approximateAnchorMatch`) and `resetCueRaw` (superseded by direct `player.cuesRaw` assignment).
- R143: accessibility — `#playerLayer` gained `role="region"` + `aria-label`, zeroing the axe `region` landmark debt (33→0); `REGION_BASELINE` ratcheted to 0 so no unlandmarked content node can land again.
- R140–R142: dependency audit clean (0 vulnerabilities; two <7-day-old updates deferred per supply-chain rule); startup require-chain profiled at 12ms (no lazy-load win); CSS token baseline ratcheted 447→445 via root-scoped `var(--group-cyan)` substitutions.
- R139: unit-test coverage — new `tests/browser-mini-player.test.js` covers the mini-player factory with fake BrowserWindow/ipcMain (8 scenarios: open guards, layout bounds, owns lifecycle, command routing); the only remaining untested pure module is subprocess-bound (`browser-dialogue.js`).
- R138/R151: IPC contract test — new `tests/ipc-parity.test.js` locks preload↔main channel parity (213 handlers, 11 events, 3 preload bridges), forbids double handler registration, ratchets pre-guard param derefs at 16, and asserts no handler performs side-effects before input validation.
- R137: subtitle parser fuzz ratchet — new `tests/subtitle-parser-fuzz.test.js` runs 50k deterministic adversarial mutations across all SRT/VTT/ASS/LRC/SAMI/TTML/JSON3/HLS/DASH/MP4 parsers every `npm test`; ~160k total cases audited with zero crashes, hangs, or NaN cues.
- R136: i18n closure — 348 new TR→EN dictionary entries (74 renderer sink literals + 274 main.js IPC messages) plus 3 concat-prefix patterns; i18n-coverage test now ratchets renderer sinks and main.js error/message/stage/label returns so no Turkish UI string can land untranslated.
- R135 — docs cleanup: AGENTS.md report counter corrected (122 → 134); two stray root reports moved into `docs/raporlar/` under non-colliding names; new `docs/raporlar/INDEX.md` covers the numbered series; README feature tour gained media-library and subtitle-provider rows; HISTORICAL_RECORDS path references updated.

- R134 — deep-audit continuation: `decodeSubtitleBuffer` now runs the legacy-encoding guess in a single pass (was computed twice per non-UTF-8 buffer — ~20 TextDecoder constructions each); the "sparse broken UTF-8 beats a language hint" ordering is documented as intentional and locked by a regression test plus a TextDecoder-construction-count test. ~25 more modules re-read clean (watch/catalog stores, hls-recovery, burnin-output, subscriptions-io, queue-persistence, backend helpers).

- R133 — subtitle provider downloads decoded legacy encodings (cp1251/1250/GB18030/Big5/Shift-JIS/EUC-KR and friends) via a dependency-free `pickLegacyEncoding` in `browser-textutil.js` (language hint + fatal multibyte gate + script-coherence scoring); previously non-UTF-8 provider files threw a raw TypeError. Downloads now also reject content with no subtitle structure (`INVALID_SUBTITLE`), and the manual encoding picker lists all 20 legacy encodings.

- R132 — deepest audit round: ~200 surfaces re-read (browser capture/subtitle parsers, page-translate, translation scheduler, session/watch stores, media controller, settings-security, transcribe.py translation pipeline, and all backend Python helpers) plus tree-wide pattern sweeps (dynamic RegExp, Math.random, eval/Function, execSync/spawnSync, fs deletion sites, bare `.sort()`, Promise.all, renderer DOM access). **No confirmed new bugs** — every audited surface is hardened with bounds, whitelists, atomicity, staleness/generation guards, abort discipline, and inline fix-round notes (R83/R85/R86/R127/R128/R129/BUG-117-05/P79/RFC 8216/Electron 43). Coverage map and Windows manual-check list recorded in `docs/raporlar/BROWSER_BUG_REPORT_132.md`.

### Changed

- Paket-v2 uygulama turu — 7 patch (`18e5374`..`abbfb7d`: çeviri kalite kapısı doğal Türkçeyi reddetmesin, JSON-modu reddi tek seferde öğrenilir, adres çubuğu eski-URL/çift-altyazı, OSD/"…" düğmesi ve sağ ray CSS, EN arayüz Türkçe kalıntıları, bağlama göre sağ-tık menüsü, çift-dilli altyazı varsayılanı) + `KURULUM.md` "Kalan işler" listesinin tamamı:
  - `sideSubtitleLayout` ve `playerLayoutQuick` artık dev ayar çekmecesi yerine küçük popover menüler açar (mod/iz/boyut veya görünüm/tema radyoları + "tüm ayarlar" footer'ı); `playerDetailsMenuIds` ortak yaşam döngüsü + ok tuşu gezintisi.
  - browser-chrome.css sabit renkleri ve sekme grubu renkleri `:root` token'larına (`--group-*`) taşındı (sabit-hex sınırı 447).
  - Windows `titleBarOverlay` tema değişince `app:theme-changed` → `setTitleBarOverlay` ile canlı güncellenir.
  - `browser:snapshotActive` encode öncesi 768px'e küçültür + `toJPEG(72)` — popover açılışındaki JPEG donması azaldı.
  - Omnibox: host-harf avatarları, `claimedUrls` URL tekilleştirmesi (sekme satırı kazanır), aktif sekme hariç, ilk satır "adres olarak açılır / aranır" açıklaması.
  - Fare yan tuşları (X1/X2 `app-command`) tarayıcı geri/ileri köprüsüne bağlı.
  - Sekme şeridi anahtarlı düğüm yeniden kullanımı (`replaceChildren` yerine), ♪ sesli-sekme SVG'si, sabit sekmeler ikon-only, grup düzenlemede renk çipleri (`appDialog` `{choices}`).
  - Navigasyonda `browserTime`/`browserDuration` sıfırlanıyor + medya görülmedikçe makale sekmesinde "No subtitle track" şeridi çıkmıyor.

### Fixed

- PR65 — player and browser side-panel icon buttons now keep their intended size and center SVGs, including details summaries; the collapse and subtitle-file icons are clearer.
- R147 — canlı web-altyazı izi artık atomik yazılıyor: `publishBrowserTrackNow` yerinde `writeFileSync` yerine tmp→rename (`writeSubtitleAtomic`) kullanır — oynatıcının sürekli okuduğu `web-*.srt` çökme/yazım anında yarım görünmez.
- PR60 E2E bulgu düzeltmeleri — `playerLayoutQuickMenu`/`sideSubtitleLayoutMenu` toggle'ında `event.currentTarget` rAF öncesi yakalanıyor (popover'lar ekran dışında kırpılıyordu); sabit sekme 36px genişlik `workspace-browser` min-width'iyle ezilmiyor; omnibox kütüphane birleştirmesi URL-anahtarlı tekilleştiriyor (açık sekme "Kayıtlı içerik" olarak yankılanmıyor); `libraryResultKindLabel` etiketleri EN locale'de çevriliyor.

- R129 — page-translation listener/DOM-retention leaks: `pageRestoreScript` now detaches the 6 document/window action listeners that `pageApplyScript` installs (anonymous closures previously kept the whole translate state — every translated text node — alive for the life of an SPA document, and kept firing on dead refs); restored refs are also marked `active = false`. `observeRoots` now prunes `MutationObserver`s whose shadow root detached from the document — a strong Map entry used to retain the entire removed subtree.
- R128 — remote-data path audit: Stremio subtitle downloads now follow redirects hop-by-hop through the host allowlist (`redirect:'manual'` + re-validation per hop) — an approved `*.strem.io`/`opensubtitles.com` URL can no longer chain to arbitrary/internal hosts (SSRF into subtitle text). `invidious._convert_timedtext_to_srt` tolerates non-numeric/NaN timing attributes in remote XML (skips the line instead of raising a raw `ValueError` that killed the whole download). `sentence_reply_issue`/`accept_sentence_reply` reject an empty `ids` list with a reason instead of an `IndexError`.
- R127 — deep module audit fixes: `lastWatched: 0` ("never watched") was rewritten to `Date.now()` in both `watch-index.upsertMedia` and `watch-library-store.upsert`, pushing never-opened items to the top of the recents list; `series_memory._file_lock` POSIX branch now honours `timeout` (a wedged lock holder could hang a transcribe job forever); `download_clip` rejects a missing `--output-file` with a clear error; `download()` validates `audio_lang` before embedding it in the yt-dlp format selector; diagnostic export no longer leaks `pass=` values. `listMedia` ordering is now deterministic (`last_watched DESC, id ASC`).

### Added

- R146 — learning-mode polish: `O` cycles the playback policy (normal → gap-accelerate → gap-skip → shadowing → cue-repeat) from the keyboard in both player and browser mode, with the select's change handler staying the single source of truth; a persistent top-right stage badge now shows the armed policy plus live progress (`↻ N/M` during cue loops, "Tekrar et" during shadowing pauses); selecting a learning policy with no subtitles loaded now tells the user it applies once subtitles load instead of silently doing nothing. Shortcut help documents `O`.
- R126 — GitHub bug-report verification + suggestion implementations: 10 confirmed bugs fixed (YouTube multi-account: `_ytDevice` null-race ghost accounts, stable channel-ID account ids merging duplicate/unnamed rows, `accountRemove` now kills the in-flight poll before revoking so the Google grant is actually released, `upsertAccount` dead param/`expiresIn` semantics; session store 7-day media-time cap (long streams preserved, ms-unit bug fixed); empty-subtitle validation rejection; `splitBrowserBounds({})`→null; secret-store no longer overwrites an array mid-path; `invidious._vtt_to_srt` no longer drops cues in blank-line-less VTT). Network capture now records `maxPostDataSize` + request `method`/`postData` (protobuf-POST manifest sites). Subtitle search gains the keyless Stremio OpenSubtitles-v3 ladder + `imdb_id` targeting and a direct-URL download path; ffsubsync gains an audio-reference mode ("Videonun sesiyle senkron bul") aligning subtitles to the reference video's VAD rhythm.
- Browser smoke coverage (R124 step 5): five deterministic Electron smokes — find-in-page bar (Ctrl+F, counter, next/previous, Esc), error surfaces (empty 502 → full error page, bodied 404 renders untouched, DNS/connection-refused surfaces), page background (background-less pages capture pure-white pixels), tab icon persistence across title updates, and the frozen-frame bitmap under open menus.
- Browser chrome Faz C: the side panel now collapses to a 48px icon rail on pages without media (per-site preference kept in localStorage, session fallback for the new-tab page; a rail tab click expands, the collapse button shrinks back), and opens automatically once media is seen unless the user closed it. The new-tab page is now a real NTP — centered search box that navigates the omnibox, up-to-8 quick-access tiles, and a "Continue watching" row fed by media-flagged visits (rememberBrowserVisit now carries a media flag). Slogan/cards only show on first launch.
- Browser CSS consolidation: ~610 browser-chrome rules moved from styles.css into a dedicated browser-chrome.css (brace-depth verified multiset split); :root chrome tokens (--chrome-radius-*, --chrome-h-*, --elev-1/2/3, --motion-*) defined and repeated literals bound; the hardcoded-color ratchet now counts all src/renderer/*.css and the cap dropped 470→459 (--ink-bright token binds the #fff repeats). Light-theme parity: the WCAG contrast scan now also pins 8 browser-chrome + side-panel token pairs (resolved through the var() chain) at ≥4.5:1.
- Fixed: switching to a tab without a URL (new tab) left the stale previous address in the omnibox — it now syncs on tab switch (focused or not), keeping the focus guard for in-place navigation.
- Browser chrome Faz B: browser mode now runs a single 38px title row — the W app menu (player/browser/media-library switching), the tab strip inside the title bar, and one app menu (language, settings, task center, PDF); the unified Whisper button merges subtitle count, translation and caret into one contextual control (hidden without media, "Subtitles · N" with tracks, progress ring while translating, single popover); the signal strip became a 32px floating pill with health/track lists in its popover (`setBrowserSignal` API unchanged); the "More" menu is grouped with in-menu search, a quick row (new tab, reopen closed tab, find, zoom) and Page/Video/Site/Appearance submenus — disabled items collapse away. Acceptance: page content starts at y=88px at 1440x900.
- Browser chrome Faz A polish: toolbar buttons are borderless 32px ghosts (frame only on active/focus/hover); a site chip (lock + host) now sits at the left of the address pill and opens a popover with site security info, the ad-shield toggle moved off the top bar into it, and a shortcut to site permissions; the active tab merges with the toolbar surface (10px top corners, shared background); error pages gain an icon and collapsible technical details.
- Browser error surfaces now localize in English: main-process load errors, empty-HTTP pages, certificate errors, tab crashes and load-retry signals carry a `messageKey` (+`params`) with English renderer templates; the playback diagnostic catalog is bilingual (`labelEn`/`messageEn`), the toolbar "Subtitles · N" chip follows the UI locale, and the 401/403 diagnostic text no longer claims the request was a playback request.
- SmartTube YouTube sign-in now supports multiple Google accounts like SmartTube: the signed-in dialog lists every stored account, lets you switch the active one, remove an account, or add another via device code — personal feeds (home, subscriptions, history) follow the active account.
- Player sentence-tools row consolidates its four subtitle actions into a single "Subtitle actions" popup menu; SmartTube autoplay now shows a 5-second "Up next" countdown card with Play now/Cancel; the browser address bar dims the scheme and path and bolds the domain when unfocused; the playback-speed control renders as a themed popup menu while the hidden select stays the single source of truth.
- Browser ⋯ menu gains "Watch in player" on open YouTube pages: hands the video off to the app player, carries over the current playback position (or the watch-history resume point), and pauses the browser tab.
- YouTube TV mode: YouTube's own TV web app (`youtube.com/tv`) in an isolated, sandboxed window with a TV user agent; sign-in uses YouTube's own on-screen code (yt.be/activate) — no OAuth client is embedded. Ctrl+Shift+S hands the playing video to the subtitle/translation tools.
- SmartTube TV layout (default on): dark 10-foot palette, icon rail that expands on focus, scaled focus ring, remote/arrow navigation between rail and grid, F for full screen; larger device code/QR with expiry countdown.

- Address bar: frecency ranking (history keeps visit counts), inline autocomplete ("git" → "github.com"), section headings and site icons; pure logic moved to `src/browser-address-model.js`.
- Translation model scorecard: the backend emits `translation_quality`; settings show each model's invalid-batch rate over its last 10 jobs (TR/EN).
- "Untranslated lines" cue filter with a one-click "Translate missing" banner; retranslate-all now opens an old/new diff where selected lines can be restored (.srt).
- ASS alignment (`\anN`), position (`\pos`) and whole-line italics survive translation into SRT/ASS/VTT output.
- "Open with http" on https connection failures (explicit warning; never for certificate errors); plain `#anchors` kept in the local session; "Save as PNG" converts WebP/AVIF/ICO/BMP in an isolated, network-less window.
- `npm run audit:ui` (headless Chromium contrast audit across theme × locale × width; runs `--strict` in CI) plus ratchet tests for hard-coded CSS colors and EN locale coverage.
- Translation quality corpus (`backend/golden-corpus-tr.json`, 60 cues) with per-category defect metrics and deterministic mock-provider pipeline tests.
- Provider cost counters (`providerRequests`/`cacheHits`/`cacheMisses`) in browser translation telemetry, `browser:translation:snapshot`, diagnostics, and the live-translation signal line.
- Crash-integrity gauntlet: deterministic fs fault injection across every critical store write path (asset store, session store, translation cache/archive, notes, reading list, element rules, series context, CEA checkpoint, secret store) plus a real-Electron damaged-profile restart smoke and a 10k-cue / multi-tab / concurrent-translation performance measurement smoke.
- Linux development install/launch scripts (`install.sh`/`start.sh`) wrapping the same lock-verified orchestrator; honest platform notes in README and INSTALLATION.
- CI now explicitly installs the pinned Castlabs Electron binary and runs the real Electron bridge smoke on Ubuntu (xvfb) and Windows.
- Desktop YouTube sign-in via Google's recommended installed-app flow: "Authorize in browser" opens system browser with PKCE + loopback redirect; device code remains only for "TVs and Limited Input" clients.
- SmartTube section: QR-assisted device-code sign-in using a user-configured OAuth client; account setup and real personalized feeds require live acceptance (#9).
- SmartTube queue rail on the home grid with local continue/most-played rails (#9).
- InnerTube `lockupViewModel` card parsing for signed-in personalized feeds (#11).
- Real-UI screenshot gallery and a short English-captioned product tour.
- Public support routing, a project code of conduct, and private security-report links.
- English, screenshot-led usage guide covering local files, YouTube source mode, browser caption capture, contextual subtitle translation, page/manga/PDF workflows, and review boundaries.
- Current-documentation index and isolated-profile screenshot of separate subtitle and manga provider settings.

### Changed

- Audit/report markdown files moved from the repository root to `docs/raporlar/`.
- `qrcode` is now a devDependency; its CLI dependencies (`yargs@15`, `yargs-parser@18`) no longer ship in the packaged app.
- 57 browser status messages and several split sentences gained English translations; 73 near-token hard-coded colors now use design tokens; 28 further light-theme contrast failures fixed.

- Reorganized public documentation in English.
- Anonymized machine-specific path examples in tracked audit documentation.

### Fixed

- Find-in-page was permanently stuck on "Searching…" — root cause found: on Electron 43, starting a *fresh* find session with an explicit `findNext: false` makes Chromium silently drop the result (`found-in-page` never fires). New sessions now omit `findNext`; only continuing next/previous calls send `findNext: true`. `refresh()` likewise. The long-standing R123 "verify find-in-page on Windows" boundary is root-caused and fixed, pending real-Windows confirmation.
- Browser R120/R123 fixes (design plan in `docs/raporlar/BROWSER_DESIGN_PLAN_R120.md`, audit in `docs/raporlar/BROWSER_PLAN_R123.md`):
  - Pages that don't paint their own background (plain text, documents, old sites, minimal HTML) were unreadable — black text on the browser's dark base color. The webview background is now white, matching Chrome/Edge/Firefox.
  - Any menu, omnibox suggestion, or panel opening turned the web page fully black (HTML sits under the native view); the active tab's frame is now snapshotted and painted into the page slot while hidden.
  - The two-line subtitle strip no longer steals ~95 px on pages without media; it stays silent until a media/track/cue exists or a ≥warning-priority message arrives.
  - The "More" menu no longer overflows past the bottom of a 900 px window (max-height + in-menu scrolling).
  - Empty-bodies ≥400 responses (e.g. 502) now show a proper "This page isn't working" error screen with Retry instead of a black void; 404 pages with real content still render as the site's own page.
  - Main-document 5xx no longer reports a playback/DRM fault; DNS/offline/timeout network errors get clear page-context messages (-105/-106/-118) instead of raw Chromium text.
  - Tab title updates no longer wipe the favicon — only the label element is rewritten; failed favicons are marked to avoid retry loops. Favicon-less tabs show a host-colored letter avatar, long titles fade instead of cutting hard, the × button shows only on active/hover/focus, and the address bar is pill-shaped.
  - The subtitle panel's empty state now distinguishes "track found on page · N" / "no video on this page" / "video without track", and command-palette + several English-UI strings are translated.
  - Defensive find-in-page changes: the DOM-observer message is sent only after the first real result and redundant `stopFindInPage` calls are removed (root cause of the intermittent "Searching…" hang remains unconfirmed under Xvfb — Windows manual verification queued).
- YouTube device-code sign-in could be silently abandoned: closing the login dialog (Esc/backdrop/X) killed the background poll, so approving at google.com/device never completed the sign-in — the dialog now closes passively while the poll keeps running, and reopening it resyncs the live flow; grants without a refresh token are accepted as temporary sessions instead of erroring, and auth commands run on their own job slot so a long poll no longer starves feed browsing.

- SmartTube sidebar: the bottom sign-in button is now "YouTube giriş" (Google/TV device-code flow) instead of the generic Invidious login; Invidious giriş moved into the nav list. When signed in, the History section now also shows the real YouTube account watch history (`FEhistory`) with local-library fallback — joining Home (`FEwhat_to_watch`) and Subscriptions (`FEsubscriptions`) as personalized feeds.
- Browser/player deep-audit fixes (local patch series landed as R119): the research-notebook export button called an undefined `writeTextAtomic`; the model-cache clear flow called an undefined `addLog` and the glossary add button relied on an undeclared `$()`; the omnibox calculator ranked unary minus above exponentiation (-2^2 evaluated as 4); light-theme player controls and dark-theme metadata lost contrast; several Turkish strings leaked into the English UI and the search empty-state; the new-tab button sat away from the last tab; translation distribution in scripts without spaces now uses `Intl.Segmenter` grapheme segmentation. Player gains frame stepping via `requestVideoFrameCallback` and 0–9 keys seeking to 0–90% of the timeline.
- A persistent provider error surfacing mid-translation (quota, authentication, or model unavailable) now stops the remaining chunks and rescue bundles from opening new API calls; previously every queued chunk cycled all routes and burned requests before failing.
- Translate-only jobs now honor the "Merge continuation sentences" option: spilled-over sentences are merged before translation instead of being silently ignored despite the setting's tooltip (the batch transcribe path already applied it).
- Translation rescue is no longer serialized per chunk: small retry bundles now run on a shared worker-bounded pool, so a chunk with several rejected groups no longer waits minutes for sequential API round-trips (observed: a single chunk's rescue took 233 s).
- Browser/translation/cosmetic audit (2026-09-22, see `docs/raporlar/BROWSER-CEVIRI-KOZMETIK-DENETIM-2026-09-22.md`):
  - Subtitle translation rejects a whole batch when the model returns block ids outside `0..n-1` (1-based replies silently shifted every cue by one line and were cached).
  - Fuzzy translation memory no longer reuses a translation across a negating affix (possible → impossible, legal → illegal).
  - Translate-only output names strip only real language codes and keep qualifiers (`Dune.Part.Two.srt → Dune.Part.Two.tr.srt`, `film.en.forced.srt → film.tr.forced.srt`); two parts no longer overwrite each other. The language chip ignores non-language suffixes.
  - ASS input converts `\h` to a no-break space instead of leaking it into the text.
  - Page translation keeps the original text and the block's active state after its own restore+apply writes; RTL target overlays get `dir`.
  - Browser translation "Retry failed" after a provider circuit trip re-plans the playback window instead of translating the entire track, and resets the consecutive-failure counter.
  - PDF text extraction orders right-to-left lines correctly.
  - Address bar: the typed input is always the default row (Enter no longer opens an old history match or copies a calculator result), stale results are ignored when Enter arrives within the debounce, `word: text` queries search instead of erroring, and LAN/intranet addresses open over http.
  - Search filters (places, omnibox, downloads, cue list, history, diagnostics) fold I/İ/ı consistently.
  - Ctrl+Tab / Ctrl+1..9 follow the on-screen tab order with groups; saved images take their extension from Content-Type (webp/avif/ico); Markdown links escape parentheses; `-2^2` evaluates to -4; per-page settings report the 200-entry limit instead of being silently dropped.
  - Cosmetics: 10 undefined CSS tokens aliased to canonical ones (transparent tab preview/SmartTube surfaces), light-theme omnibox dropdown, player/SmartTube/bilingual list and panel controls fixed for contrast, outline action buttons get their border, find-in-page input styled, reduced-motion loading tab no longer mimics the active tab, missing EN strings in the browser chrome.
- Browser overlay cue scheduling: after seek or playback-rate changes the pending cue-boundary timer is now re-planned on the current timeline, so the overlay can no longer display a stale caption for seconds.
- Browser overlay recovers when `requestVideoFrameCallback` never fires (pages that produce no compositor frames): a 400 ms fallback timer renders the boundary cue directly.
- Browser overlay no longer skips an entire cue interval when a boundary render lands a few milliseconds early — the boundary epsilon and the −12 ms early-fire margin were removed; a render landing before a boundary re-arms it immediately instead of jumping to the next cue.
- Turkish compound-number bypass in the hard translation quality gate: a wrong-value phrase like "kırk beş" no longer satisfies a source "40" (Python gate and its JS mirror).
- Concurrent YouTube feed loads (e.g. the post-sign-in home refresh racing a section click) no longer fail the second request with "already running"; `youtube:browse` calls are serialized with a bounded wait for the in-flight job.
- Reading-list and element-rules index writes no longer leave orphaned `.tmp` files on write/rename failure (F-102-1).
- Restored browser tab loading no longer throws an unhandled rejection when its webContents is destroyed mid-flight (F-102-2).
- `install.bat`/`install.sh` installs no longer leave broken console scripts (`pip`, `yt-dlp`, `evs-vmp`, ct2-*): entry points are regenerated after the venv swap (F-103-1).
- SmartTube search no longer shows a misleading "no results" empty state on network/5xx failures — errors surface as visible status with a retry action (F-104-1).
- SmartTube channels/live sections no longer collapse transient errors into a fake empty/sign-in state, and search "Load more" no longer dies silently after one failed page (F-104-2/3).
- `<dialog>` elements opened from the player layer now close on Escape: the global keydown handler no longer preempts the dialog's native cancel (F-104-4).
- `requirements-ci.txt` resolves on stock Ubuntu 22.04 Python 3.10 via version markers; CI pins on 3.11 unchanged.
- Browser subtitle capture no longer merges separate text tracks into one published stream when players materialize tracks via `data:` `<track>` elements (hls.js); each track now keeps its own stream identity, ending cross-track cue contamination and silent cue loss.
- Browser media tools (intro detection, OCR, semantic search, scene strips) no longer report "not found" on Linux when ffmpeg/python resolve via PATH.
- Startup environment check no longer shows a false "Python venv not found" warning on Linux; backend/bin ffmpeg detection is platform-aware.
- SmartTube subscription empty-state, hint, and device-code error strings now translate to English.
- HLS playback runs the hls.js demuxer in a worker again (CSP worker-src), restoring streaming throughput.
- YouTube client ID is repopulated when returning to the client form after a bounced sign-in (secret never echoed).
- Restored read-only YouTube OAuth scope, removed an unrelated application's embedded OAuth client, and cleared old tokens when changing clients.
- Corrected SmartTube compact view counts and channel identity extraction for lockup cards.
- SmartTube home no longer renders blank on feed errors; a local-rails fallback with sign-in and retry actions is shown instead (#11).
- Queue auto-advance and the Next button now resume a partially watched video from its saved position instead of restarting it (#8).
- HLS CEA full-capture ledger now keys segments by media sequence, so a mid-playlist `EXT-X-DISCONTINUITY` inserted on manifest refresh no longer orphans completed segments — the capture used to refetch and re-decode them, report stale missing counts, and could stay `partial` forever.
- Browser CEA capture progress events keep the `complete` flag in the renderer state (it was dropped by the state normalizer), so UI/diagnostics can distinguish verified-complete captures from honest partials.
- SmartTube overlay re-opens after a failed card probe instead of leaving a black stage (#7).
- Refined translation revisions now reach the preview for blocks sharing the same timestamp (#5).
- The player Next button refreshes correctly on queue toggles and media transitions (#2).
- Repository, privacy, CI runtime, licensing, and security metadata corrections.

## [0.9.0-beta.1] - 2026-09-15

Initial public beta baseline. The older v1.1-browser-hardening tag is a historical checkpoint, not a stable semantic-version release.
