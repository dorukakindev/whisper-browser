# R822 — Tasarım dışı tarama: 3 yeni bug ve önceki öneriden doğrulanan 1 bug

31 Ekim 2026. Kaynak revizyonu **`b821da96edd7b10c6a5d2dcc03b353192394f5eb`**; başlangıç `master`, rapor dalı `codex/functional-audit822`. **Hiçbir düzeltme yapılmadı.** Ürün/test/ayar/bağımlılık kodu değişmedi.

Üç **GPT-6.1 Sol / medium** ajan paket taşıma, indirme ve yerel altyazı/kelime zamanlama sınırlarını inceledi. Ana ajan birleşik aramanın gerçek SQLite indeksini inceledi; bütün kanıtları son yayımlama yollarından, yeni sentetik dizinlerde yeniden çalıştırdı. Önceki buglar yeniden sayılmadı. F822-04, R815-G10'daki fikrin yeni keşfi değildir: önceki önerinin gerçek tüketici etkisi bu tur ilk kez çalıştırılarak doğrulanmıştır.

| Kayıt | Öncelik | Doğrulanan sorun | Önceki kayda ilişki |
|---|---|---|---|
| F822-01 | P2 | Kayıtlı sayfa araması `IŞIK` ve `ışık` biçimlerini aynı sözcük olarak bulmuyor. | Yeni özgül SQLite→birleşik arama invariantı. |
| F822-02 | P2 | Bitişik veya çok yakın altyazı bloklarında doğru yan JSON'a rağmen kelime vurgusu kapanıyor. | Yeni renderer kelime-sahipliği kökü. |
| F822-03 | P2 | Mevcut dosyaya yeni A–B klibi aktarılırken eski video değişmeden başarı bildiriliyor. | Yeni klip tamamlanma/çıktı kimliği kökü. |
| F822-04 | P2 | Paketle taşınan videonun izleme kaydı yeni yolun kimliğine bağlanmıyor; kayıtlı konum bulunamıyor. | **R815-G10 önerisinden doğrulanan**, daha önce bug sayılmamış kayıt. |

Bu raporda **4 doğrulanmış bug kaydı** vardır; bunların **3'ü yeni keşif, 1'i önceki önerinin doğrulanmasıdır**. P2, kullanıcıya sunulan işlevin geçerli girdide yanlış/eksik çalışmasıdır; geçici çözümler aşağıdadır. Dokunan/40 ms aralıklı altyazılar, videolu/manual paket taşıma ve farklı işaretlenen klip aralıkları ayrı ayrı bug sayılmadı.

## F822-01 — Türkçe I/ı büyük-küçük harf ilişkisi kayıtlı sayfa aramasında kopuyor

**Tetikleyici:** Sayfa içeriğini indeksleme açıkken başlığı `IŞIK` olan sayfa kaydedilir; sonradan oynatıcıdaki birleşik kütüphane aramasında `ışık` aranır. Ters yön de etkilenir: başlığı `ışık` olan sayfa `IŞIK` sorgusuyla bulunmaz. Türkçe küçük harfe çeviride `IŞIK→ışık` aynı sözcüktür; farklı özel ad veya yalnız aksan tercihi karşılaştırması değildir.

**Beklenen:** Projenin diğer birleşik arama kaynaklarında kullandığı I/ı/İ/i katlaması sayfa sonuçlarında da tutarlı olmalı. İki biçimi içeren iki kayıt, her iki sorguda da bulunmalı.

**Görülen:** Gerçek indeks dört ayrı sayfayı başarıyla saklar. `IŞIK` sorgusu yalnız büyük harfli sayfayı; `ışık` yalnız küçük harfli sayfayı döndürür: beklenen iki yerine **1/2** sonuç. Aynı zincirde `LIGHT` ve `light` her iki sorguda da **2/2** döner. `scope=all` da eksik sayfa sonucunu geri getirmez. Veri diskte vardır; kullanıcı arama yolundan ona ulaşamaz.

**Kök/kaynak:** [watch-index.js:182](../../src/watch-index.js#L182) sayfa FTS tablosu `unicode61 remove_diacritics 2` kullanır. [ftsQuery:26](../../src/watch-index.js#L26) yalnız NFKC/token düzenlemesi yapar; [searchPages:443](../../src/watch-index.js#L443) sorguyu bu indekse doğrudan verir. Türkçe dotless-ı eşdeğerleri bu yolda karşılanmıyor. [browser-library-tools.js:5](../../src/browser-library-tools.js#L5) diğer arama kaynaklarında ortak Türkçe katlama kullanırken, sayfa sonuçları önceden elenmiş `pageHits` üzerinden gelir. [main.js:3898](../../src/main.js#L3898) ve [18993](../../src/main.js#L18993) bu sonuçları gerçek birleşik arama handler'ına taşır; [preload.js:90](../../src/preload.js#L90) API'si ve [renderer.js:26472](../../src/renderer/renderer.js#L26472) kullanıcı araması bu yola bağlıdır. Bu, SQLite'ın yanlış çalıştığı iddiası değil; uygulamanın arama kaynakları arasındaki sözleşme farkıdır.

**Kanıt/kontroller:** [probe.cjs](evidence822/search/probe.cjs), [result.json](evidence822/search/result.json). Gerçek `runBrowserPageIndexCapture→WatchIndex.upsertPage`, diskte gerçek SQLite/FTS5, gerçek birleşik reducer ve değiştirilmemiş main search/IPC ile preload metodu kullanıldı. Sayfadan gelen capture sonucu, tab/view ve oturum kaynakları kontrollüdür. Dört kaydın diskte varlığı, Türkçe iki yön, ASCII iki yön, `all` kapsamı ve yetkisiz IPC reddi doğrulandı. Doğal site/DOM capture veya native pencere testi değildir.

**Dedup:** R302'nin `tr_fold`/5000 satır yedeği anlatımı `searchAnnotations` yoludur; bu sayfa FTS yolu o katlamayı kullanmaz. R493-14 sayfa URL query/hash çakışması; R606 kayıtlı **altyazı** indeksindeki I/ı varyantları; R629 A-01/L-05 asistan/katalog metin katlaması farklı tüketicilerdir. R815-B100 Korece kitap ofseti ve B13 seek gecikmesi farklıdır. R820/R821'de aynı sayfa indeksi kökü yok. [F42/F48 kapsam kaydı](evidence822/search/registry-reviewed.json) eski imzaları korur; F42-N0840 eski native smoke belirsizliği bu turun SQLite kanıtıyla geriye dönük PASS yapılmadı.

**Geçici çözüm/kabul:** Sayfanın kaydedildiği harf biçimiyle arama veya doğrudan URL kullanılabilir. Olası düzeltmede iki Türkçe sorgu iki sayfayı da bulmalı; ASCII, çok sözcüklü/limitli FTS ve yetki kontrolleri korunmalı. Uygulanmadı.

## F822-02 — Komşu cue kelimeleri yeniden karışınca aktif kelime vurgusu kayboluyor

**Tetikleyici:** Gerçek uygulama yazıcılarının oluşturduğu aynı köklü SRT+JSON açılır. İlk cue `0–1 Merhaba.`, ikinci `1–2 Dünya.`; kelimeler `.1–1 Merhaba.` ve `1–1.8 Dünya.`. Zamanlar sonlu, sıralı ve kendi JSON segmentlerinin içindedir. Kelime vurgusu açıktır. 40 ms cue boşluğunda da aynı sorun olur.

**Beklenen:** Her cue kendi metnine ait kelimelerle eşleşmeli; `.5` ve `1.3` zamanlarında iki cue da aktif kelime aralığı üretebilmelidir.

**Görülen:** JSON üreticisi iki kelimeyi doğru ayrı segmentlere koyar; gerçek yan dosya okuyucu bunu korur. Renderer her iki cue'ya **iki kelimeyi birden** yeniden toplar. Cue metninde bulunmayan komşu sözcük nedeniyle `alignCueWords` null döner: `timed:2, matched:0, unmatched:2`, iki `wordRanges:null`. Gerçek `renderActiveCueWord` iki kez `reset` yoluna gider; aktif vurgu isteği yoktur. Cue metni, ses veya temel altyazı gösterimi bozulduğu iddia edilmiyor. Bu, renk/estetik görüşü değil, etkin kelime izleme işlevinin devre dışı kalmasıdır.

**Kök/kaynak:** [renderer.js:15897](../../src/renderer/renderer.js#L15897) `attachTimedWordsToCues` ±50 ms dahil örtüşmeyle her cue için yeni bir `seen` kümesi kurar; zaman sınırındaki kelimenin komşu cue'ya ait olması gözetilmez. [alignCueWords:15862](../../src/renderer/renderer.js#L15862) cue içinde olmayan ek kelimeyi eşleyemeyince tüm aralıkları reddeder. [aktif tüketici:15598](../../src/renderer/renderer.js#L15598) bu durumda vurguyu sıfırlar. [yerel yükleme:22361](../../src/renderer/renderer.js#L22361), [media:readSubtitle:2551](../../src/main.js#L2551) ve [yan dosya okuyucu:50](../../src/subtitle-word-sidecar.js#L50) gerçek erişim yoludur. [transcribe.py:2141](../../backend/transcribe.py#L2141) yazıcısının tek-segment sahipliği doğru çalışıyor; JSON yazıcı hatası diye sayılmadı.

**Kanıt/kontroller:** [producer.py](evidence822/sidecars/producer.py) gerçek `write_srt/write_json` kullanır; [probe.cjs](evidence822/sidecars/probe.cjs) gerçek readSubtitle handler'ı ve değiştirilmemiş parse/attach/render kesitlerini çalıştırır. [results.json](evidence822/sidecars/results.json): dokunan ve 40 ms boşluklu iki senaryoda `matched=0` ve iki reset; aynı metin/üretici/okuyucu ile **200 ms kontrolünde matched=2 ve iki active** çağrısı. Yetki/history adaptörleri ve son highlight efekti kontrollüdür. Tüm `loadPlayerSubtitle`/preload/Electron pencere zinciri çalıştırılmadı; callsite kaynakla izlendi. CSS Highlight'ın ekrandaki görünümü ölçülmedi.

**Dedup:** R46-94 yanlış dil suffix/fallback yan dosyası değil; dosya adı birebir doğrudur. R481-09 segment dışına taşan kelime değil; kelimeler kendi segmentinin içindedir. R611-F18 sıfır süreli JSON kelimesi değil; iki kelime de pozitif sürelidir ve JSON'da korunur. R51-35 HTML/entity, R815-B33–40/B66, F820-01 ve R821 tanı/metrik kayıpları farklıdır. [F11/F16/F18/F48 imzaları](evidence822/sidecars/registry-reviewed.json) bu renderer yeniden atama ilişkisine kanıt sayılmadı.

**Geçici çözüm/kabul:** Daha ayrık cue'lar bu fixture'da çalışır; kullanıcıdan altyazı zamanlarını bozması beklenmemeli. Olası düzeltme dokunan/40 ms aralıklı cue'ları doğru eşlemeli; farklı JSON/SRT segmentleme, noktalama ve küçük yuvarlama toleransı korunmalı. Uygulanmadı.

## F822-03 — A–B klip aktarımı eski hedefi yeni çıktı sanıp başarı bildiriyor

**Tetikleyici:** Tarayıcıda 30–40 saniye aralığı seçilir, dışa aktarımda diskte zaten bulunan `existing.mp4` hedefi seçilir ve üzerine yazma kabul edilir. Önceki dosya örneğin farklı, iki saniyelik bir videodur. Başlığa bağlı varsayılan adla yeniden klip çıkarmada aynı hedefe dönmek olağan bir akıştır.

**Beklenen:** Seçilen hedef yeni aralığın içeriğiyle yenilenmeli veya açık hata/iptal dönmelidir. Önceki dosyanın bulunması yeni klibin üretildiğini ispatlamaz.

**Görülen:** FFmpeg ile oluşturulmuş gerçek geçerli MP4'ün önce/sonra SHA256'sı aynı ve ffprobe süresi **2 saniye** kalır. Buna rağmen backend `type=clip, start=30, end=40`, main `ok:true` ve gerçek renderer **“A-B klibi dışa aktarıldı.”** döndürür. Talep edilen süre 10 saniyedir; indirme aşamasına girilmemiştir. Yeni çalışmanın gerçekleşmemesi/yanlış başarılı çıktı söz konusudur; önceki dosyanın silinmesi iddia edilmiyor.

**Kök/kaynak:** [media.py:310](../../backend/media.py#L310) hedefin aynı stem'ini yt-dlp şablonuna koyar; aralık parametresi vardır ama açık yeniden üretim/overwrite veya önceki çıktının kaynak-aralık kimliği doğrulaması yoktur. Kurulu yt-dlp mevcut finali tekrar kullanır. [media.py:324](../../backend/media.py#L324) hook/info yolunun yalnız dosya varlığına bakar ve istenen yeni zamanlarla `clip` yayımlar. [main.js:18011](../../src/main.js#L18011) hedefi backend'e aktarır; [runMediaCommand:1096](../../src/main.js#L1096) ve [1131](../../src/main.js#L1131) başarıyı taşır. [preload.js:314](../../src/preload.js#L314), [renderer.js:11629](../../src/renderer/renderer.js#L11629) ve [gerçek düğme bağı:14281](../../src/renderer/renderer.js#L14281) kullanıcı yoludur.

**Kanıt/kontroller:** [probe.cjs](evidence822/downloads/probe.cjs), [clip-helper.py](evidence822/downloads/clip-helper.py), [result.json](evidence822/downloads/result.json). Değişmemiş renderer→preload→IPC→runMediaCommand kaynakları, gerçek Python child ve `media.main/download_clip`, kurulu gerçek yt-dlp `2026.08.27.231323` işleme/tamamlama kodu kullanıldı. Extractor metadata'sı, yetki/diyalog/URL politikası ve IPC adaptörleri kontrollüdür; downloader HTTP/FFmpeg ağ girişleri engellenir. Eski dosya FFmpeg üretimi ve ffprobe doğrulamasıdır; fixture uzak kaynağın gerçekten indirildiği/decode edildiği anlamına gelmez.

Yeni hedef kontrolü downloader aşamasına ulaşır ve orada bilerek engellenir: main/renderer hata verir, dosya oluşmaz. Bu, yeni bir klibin başarıyla indirildiği kontrolü değildir. Save iptali, geçersiz A–B ve yetkisiz istek ek child başlatmaz. Gerçek `browser-downloads` modülünün kontrollü DownloadItem/session ile pause→resume→completed/aktif sayaç/listener cleanup/open-player kontrolleri geçti; modül için ek bug üretilmedi. Fixture engelinin genel 403 metnine dönmesi gerçek site HTTP403 veya yeni sınıflandırma bugı diye sunulmadı.

**Dedup:** R127-05 eksik output-file; R158 güvenli dosya adı; R67-02 wrapper sonuç tipi; R815-B94 adaptive retry hedef silmesi, B95 transcribe ses dili cache kimliği, B122 M4B manager regexi ve R765 dublaj hazır-ses lookup'u farklıdır. R46/R64/R476/R479 indirme yuva/izin/getter/kurulum kökleri tekrar sayılmadı. [F43/F44/F48 kapsamı](evidence822/downloads/registry-reviewed.json) bu klip mevcut-hedef + yeni-aralık + başarı tüketicisi birleşimini doğrulamıyordu.

**Geçici çözüm/kabul:** Her klip için yeni dosya adı kullanılabilir. Olası düzeltmede farklı aralıkla mevcut hedef, eski dosyayı başarı kanıtı saymamalı; iptal/hata eski sağlam dosyayı korumalı, açık overwrite tercihi tutarlı uygulanmalıdır. Native Windows overwrite diyaloğunun sunumu test edilmedi; dialog kontrollü olarak seçilmiş hedefi döndürür. Uygulanmadı.

## F822-04 — R815-G10 önerisinden doğrulama: paket taşıma izleme kimliğini koparıyor

**Geçmişi açık ayrım:** [R815-G10](BROWSER_BUG_REPORT_815.md#r815-g10) taşınabilir kimliği dosya konumundan ayırmayı zaten öneriyordu. Bu fikir tekrar yeni keşif sayılmadı. Bu tur mevcut export→preview→apply→yeni katalog list/play zincirinde gerçek konum/tercih kaybı ilk kez çalıştırılarak kanıtlandı; önceki bir bug kaydı tekrar sayılmadı.

**Tetikleyici:** Normal yerel filmde izleme konumu `123`, süre `600`, hız tercihi `1.25` kaydedilir. Video dahil `.wbp` farklı klasöre içe alınır veya videosuz paket eksik kaynak kökü sihirbazıyla yeni klasöre eşlenir. Kurcalanmış paket gerekmez. İçe aktarılan dosyanın ilk doğrulama seçimi aynı taşınmış kaynağı gösterir.

**Beklenen:** Yeni kaynağa bağlanan katalog kartı/oynat eylemi taşınan geçmişteki 123. saniyeyi ve tercihleri bulmalıdır.

**Görülen:** Gerçek Python ZIP write/read/extract, JS `package-preview/package-apply` ve yeni servis örneğindeki gerçek `list/play` çalışır. Video bytes eşittir; katalog `source.value`, geçmiş `localPath/sourceRef` yeni yola doğru bağlanır. Ancak geçmişteki `key=file:<eski-yol>` değişmez. Diskte konum123 ve tercihler dururken katalog `progress:null`, oynatma `position:0` ve önceki `prefs` olmadan döner. Eski satır silinmez; yeni yoldan bulunamaz. Video paketi ve eksik-kök eşleme **tek kökün iki varyantıdır**.

**Kök/kaynak:** [workspace-package.js:79](../../src/workspace-package.js#L79) export ve [44](../../src/workspace-package.js#L44) restore, ham mutlak yol/string-prefix dönüşümü yapar; `file:` önekli kanonik kimlik bu eşlemeye girmez. [restore:189](../../src/workspace-package.js#L189), [workspace-video-package.js:42](../../src/workspace-video-package.js#L42) ve [84](../../src/workspace-video-package.js#L84) fiziksel kaynak eşlemesini doğru yapar. [catalog-extensions.js:147](../../src/catalog-extensions.js#L147) çıkarma→eşleme→restore sırası R815-B55'te düzeltilmiştir; bu tur o kök yeniden açılmadı. [watch-library-store.js:48](../../src/watch-library-store.js#L48) kimliği korur. [media-catalog-service.js:19](../../src/media-catalog-service.js#L19) kaynak yolundan yeni key üretip [108](../../src/media-catalog-service.js#L108) progress arar; [168](../../src/media-catalog-service.js#L168) play de yeni kimliğe göre arayıp bulunamayınca sıfır konum döndürür.

**Kanıt/kontroller:** [probe.cjs](evidence822/packages/probe.cjs), [result.json](evidence822/packages/result.json). Gerçek katalog/watch-store, export, Python ZIP, preview/apply, yeni servis list/play kullanıldı. Taşınmayan videosuz kaynak kontrolünde liste ve oynatma **123**; videolu taşımada **0**, manuel kök eşlemede **0**. Manuel varyantta yalnız sentetik eski kaynak kaldırılarak preview'nun gerçekten eksik kökü raporladığı da doğrulandı. Son kanıt yeni ayrı dizinde tek başlangıç kaydıyla çalıştı; geliştirme sırasında tekrar kullanılan scratch sonuçları yayımlanmadı.

**Dedup/sınır:** R815-B55–58 mapping sırası/POSIX/bozuk kayıt/UNC kökleri; R86-01 path gizliliği; R30-B43 substring bozulması; R457 session import/sekme kimliği farklıdır. R345/R388 kapsam özetleri bu yeni yoldan list/play resume sonucunu kanıtlamaz. R531 asistan sohbet kimliklerinin taşınması eklenmedi. Hashlenmiş düzeltme scope'ları, notlar ve senkron için ayrı tüketici kanıtı yok; ilave bug sayılmadı. [F38/F39/F48 kapsamı](evidence822/packages/registry-reviewed.json) tarihsel kanıttır.

Owner localStorage VM'de; yetki, native dialog, inspect/grant ve restart kontrollüdür. Video küçük sentetik bayt taşıma fixture'ıdır; paket gerçekten açılır ama codec/oynatma kalitesi sınanmaz. **Kabul:** Yeni medyanın kanonik kimliğiyle geçmiş/referans bağları tutarlı olmalı; konum/tercihler korunmalı, farklı dosya/kimlik çakışması yanlış birleştirilmemeli. Uygulanmadı.

## Geliştirme önerileri — bug sayısından ayrı

Bu tur yeni ve bağımsız, kanıtlı ek öneri çıkarılmadı. R815-G10 yukarıda doğrulanan bug kaydına bağlandı; aynı öneri yeniden sayılmadı. Diğer bulguların kabul ölçütleri çözüm kapsamını açıklamak içindir; uygulanmış geliştirme veya ayrı bug değildir.

## Kanıtı yeniden çalıştırma

Repo kökünde aşağıdaki komutlar kullanılır. Her alan için ayrı, yeni `AUDIT822_OUT` dizini seçilmesi önerilir. Varsayılanlar yalnız `.uiprev/audit822-*` altında sentetik çıktı oluşturur. Sidecar producer ve probe aynı çıktı dizinini kullanmalıdır. MP4, ZIP, SQLite, cache/ham alt süreç çıktıları depoya alınmadı; sonuç JSON'ları ve üretici betikleri yayımlandı.

```powershell
node docs/raporlar/evidence822/search/probe.cjs
& backend/venv/Scripts/python.exe docs/raporlar/evidence822/sidecars/producer.py
node docs/raporlar/evidence822/sidecars/probe.cjs
node docs/raporlar/evidence822/packages/probe.cjs
node docs/raporlar/evidence822/downloads/probe.cjs
```

Download probu `ffmpeg`/`ffprobe` PATH'ini kullanır; gerekirse `AUDIT822_FFMPEG` ve `AUDIT822_FFPROBE` ile yürütücüler seçilir. Kurulum yapılmadı. Windows Python/FFmpeg child-process sandbox içinde EPERM verebilir; bu çalışmada yalnız yetkili sentetik entegrasyon probları gerekli yetkiyle tekrar çalıştırıldı, otomatik onay reddi olmadı.

Ana tekrarlar: **4/4 Node probu + 1 Python producer exit0**, dört CJS syntax kontrolü geçti. Gerçek hatalı davranışı bekleyen assertion'ların geçmesi onarım değildir. Mevcut kısa kontroller: library-tools/page-index-integration/page-index-race runner3/3 (dosyaların raporladığı17/15/4 iç kontrol); subtitle-word-highlight exit0; browser-downloads exit0; workspace-restore-regressions exit0; watch-index-assets20; workspace-video-bounds16. Sonuncu ilk sandbox koşusunda Python keşfi engellendiği için atlandı; kurulu venv ve yetkili yeniden koşuyla **16 gerçek kontrol** geçti. Birlikte isolation-none koşusunun erken çıkışı bütün dosyalar geçti diye sayılmadı; restore/index ayrıca ayrı çalıştırıldı.

Çalışma zamanı: Node24.22.0, Python3.11.9, kurulu yt-dlp2026.08.27.231323. Yeni bağımlılık veya şema yok. Kaynak/kanıt canonicalLF SHA256 ve180 benzersiz eski senaryo imzası [manifestte](evidence822/manifest.json); ana koşu/sınır kaydı [burada](evidence822/parent-verification.json). İmza sayıları yeni bug/test sayısı değildir. AGENTS/YENI-BILGISAYAR/DEVIR0511, Night1000 kapsamı, R815 mapping/remediation, R820/R821 ve ilgili önceki raporlar karşılaştırıldı.

**Doğrulanmayanlar:** Tam npmtest/CI sonucu beklenmedi; CI kapatılmadı. Normal Windows açılışı `start.bat` ve `install.bat` kaynakları incelendi ama çalıştırılmadı. Native Electron pencere, gerçek dosya/overwrite seçicisi, canlı site/hesap/sağlayıcı, doğal ASR, GPU/CUDA/DRM/native video ve tüm ürün entegrasyonu iddiası yoktur. Kişisel dosya/profil/anahtar/ayar kullanılmadı veya değiştirilmedi. İncelenen ailelerin hiç okunmamış olduğu söylenmez; yeni olan yukarıdaki somut çapraz-modül ilişkileridir.
