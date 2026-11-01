# R833 — Geniş işlevsel denetim: 11 yeni bug, 15 ayrı öneri

1 Kasım 2026. **Hiçbir düzeltme yapılmadı.** Üç **GPT-6.1 Sol / medium** ajan tarayıcı, transkripsiyon kuyruğu ve medya/altyazı araçlarını; ana ajan SmartTube oynatma listelerini inceledi. Son birkaç rapordaki dublaj/film/okuma listesi/abonelik/text-voice kökleri tekrar sayılmadı. Aynı kökün farklı düğme, dosya veya dil örnekleri birleştirildi.

Başlangıç `master@08bccd48fb830046662397f764f06949886308d4`. Çalışma sırasında bağımsız Letterboxd teslimi R832 numarasıyla `1b211e4ed37f622dcc3e2144517590ae7aff9cee` master'ına alındı. O teslim korundu; bu denetim **R833**, dal `codex/functional-audit833` oldu. **Yedi final probun tamamı güncel `1b211e4ed37f622dcc3e2144517590ae7aff9cee` üzerinde ana ajan tarafından tekrar çalıştırıldı.** Başka çalışmanın ürün düzeltmeleri bu denetimin işi değildir. Bu işin ürün/test/ayar/bağımlılık diff'i yoktur.

| ID | Öncelik | Yeni doğrulanmış davranış |
|---|---|---|
| F833-01 | P2 | Kuyrukta yukarı/aşağı taşıma düğmesi işi taşıyacağına siliyor. |
| F833-02 | P2 | Reddedilen kuyruk ekleme kaynak seçimini temizleyip başarı bildiriyor. |
| F833-03 | P2 | Başlayamayan kuyruk işi eski çıktı sahipliği bırakarak önbellek temizliğini kilitliyor. |
| F833-04 | P2 | Manga hedef dili değişince önceki dilin terimleri yeni dil isteğine ve kayıt payload’ına taşınıyor. |
| F833-05 | P2 | Araştırma kartında yalnız notu kaydetmek geçerli bağlantıyı silebiliyor. |
| F833-06 | P1 | Toplu altyazı geri alması, arada gelen dış düzenlemeyi korumasız eziyor. |
| F833-07 | P2 | Başarılı toplu geri alma sonrası eski disk kimliği normal yeniden denemeyi engelliyor. |
| F833-08 | P2 | Ses izi analizi kısmi başarısız olunca eski dalga biçimi yeni zaman önerisinde kullanılabiliyor. |
| F833-09 | P2 | Kaydedilmiş 51 öğeli listeyi Oynat, bildirmeden yalnız ilk 50 öğeyi oynatma sırasına alıyor. |
| F833-10 | P3 | Liste ekleme/karıştırma, ana sayfadaki oynatma sırası görünümünü eski içerik ve sırada bırakıyor. |
| F833-11 | P2 | Tamamen filtrelenen ara playlist sayfası, sonraki geçerli sayfalara erişimi bitiriyor. |

**1 P1 + 9 P2 + 1 P3 = 11 bağımsız yeni kök.** Ayrı 15 öneri aşağıdadır. On ikinci aday olan link-hint input aktivasyonu ölçüldü ama açık ürün sözleşmesi olmadığı için **bug toplamına katılmadı**; G833-15'e taşındı. Önceki buglar/regresyonlar ve mevcut doğru davranışlar sayıyı büyütmek için kullanılmadı.

## F833-01 — Kuyruk taşıma düğmesi işi siliyor

**Tekrar:** Üç normal yerel dosyayı gerçek `addToQueue` ile ekle; ikinci satırın **Yukarı taşı** düğmesine tıkla. Beklenen kimlik sırası `[2,1,3]`, görülen **`[1,3]`**. Aynı eksik liste gerçek persist üreticisinin gönderdiği snapshot'a da giriyor. Bu, medya dosyasının silinmesi değil, ayarlarıyla birlikte kuyruk işinin kaybıdır.

**Kök:** [renderer.js:636](../../src/renderer/renderer.js#L636) taşıma düğmelerine `.queue-remove.queue-move` sınıflarını verir. [650](../../src/renderer/renderer.js#L650) silme dinleyicisi bütün `.queue-remove[data-id]` düğmelerini yakalar; önce `removeFromQueue(2)` çalışır. Ardından aynı eski düğmenin move dinleyicisi işi bulamaz. [Gerçek yardımcılar](../../src/renderer/renderer-helpers.js#L1360) üretimden çalıştırıldı. İki yön tek bugdır.

**Kanıt/kontrol:** [pipeline/probe.cjs](evidence833/pipeline/probe.cjs), [result.json](evidence833/pipeline/result.json), `PIPE-01`. Gerçek index DOM'u/renderer builder/render/click/persist payload zinciri. Doğrudan `moveQueueItem(2,-1)` kontrolü `[2,1,3]`; gerçek Sil düğmesi yalnız seçileni siler. Persist taşıması kayıt payload'ını yakalar; native diskten kuyruk silinmesi ayrıca sınanmadı.

**Dedup/kabul:** R301/R401 yeniden sıralama ve R250 sıra invariantları bu iki dinleyicinin gerçek click birleşimi değildir; mevcut Electron reorder testi fonksiyonu doğrudan çağırır. İleride iki ok mevcut kimlik/ayarları koruyarak bir sıra değiştirmeli; açık Sil ve running/terminal korumaları sürmelidir. Uygulanmadı.

## F833-02 — Başarısız Kuyruğa ekle, kaynağı temizleyip başarı yazıyor

**Tekrar:** Başlangıç10/bitiş5 gir; YouTube URL'si veya seçilmiş yerel dosya ile **Kuyruğa** düğmesine bas. Gerçek validation doğru biçimde reddeder ve bitiş alanını işaretler. Buna rağmen kuyruk **0**, URL boş veya `inputFile=null`; ardından **`+ Kuyruğa eklendi`** yazılır. Bitişi15'e düzeltip tekrar basınca kaynak kalmadığından hâlâ 0 iş vardır. Dosya diskte silinmez, UI seçimi kaybolur.

**Kök:** [renderer.js:5869](../../src/renderer/renderer.js#L5869) sonrasındaki callback `addToQueue` dönüşünü denetlemeden kaynağı temizler ve başarı yazar. [508](../../src/renderer/renderer.js#L508) producer/validation doğru `false` döndürmektedir.

**Kanıt/kontrol:** Aynı [pipeline probu](evidence833/pipeline/probe.cjs), `PIPE-02-youtube/file`. Gerçek index, opts builder, validation, add callback ve payload. Geçerli aralık/URL kontrolü **1 iş / 1 kayıt payload'ı**, kaynağın doğru temizlenmesi. İki kaynak türü ve olası duplicate/limit varyantları ayrı bug sayılmadı.

**Dedup/kabul:** R31-B96 geri yüklenmiş geçersiz iş, R51 kapasite/watch ve R66 başarılı ekleme özeti farklıdır. İleride kaynak yalnız başarılı eklemede temizlenmeli; ret bilgisi ve kaynak yeniden denemeye hazır kalmalı. Uygulanmadı.

## F833-03 — Başlatılamayan iş, önbellek temizliğini hayalet iş yüzünden engelliyor

**Tekrar:** YouTube alanına `file:///D:/fixtures/Video.mp4` gir; gerçek Kuyruğa ve Başlat'a bas. Main'in gerçek URL politikası **`Yalnızca http/https medya URL'leri kullanılabilir.`** diyerek süreç başlamadan reddeder. Kuyruk tamamlanınca `running=false`, `queueRunning=false`, `activeJobId=null`, öğe `error`; buna rağmen **`activeOutputJob` dolu** kalır.

**Etki/kök:** Gerçek önbellek ekranında model/tmp temizleme düğmeleri iş çalışıyormuş gibi devre dışıdır; gerçek `runCacheClear('tmp')` **0 backend çağrısı** yapar. [renderer:800](../../src/renderer/renderer.js#L800) output owner yaratır; [819](../../src/renderer/renderer.js#L819) hata kolları ve [finalizeQueue:671](../../src/renderer/renderer.js#L671) onu bırakmaz. [3013](../../src/renderer/renderer.js#L3013)/[3030](../../src/renderer/renderer.js#L3030) cache guard'ı bu nesneyi çalışan iş sayar. URL reddinin kendisi bug değildir.

**Kanıt/kontrol:** [Pipeline sonuç](evidence833/pipeline/result.json), `PIPE-03`: gerçek queue start wrapper → gerçek tam main handler'ın erken ret yolu → timer/finalize → gerçek cache DOM/guard. Mevcut normal tek-iş `finishRun(false)` kontrolü nesneyi temizleyince aynı istek **1 çağrı** yapar. Cache consumer sayıcı adaptördür; kişisel cache silinmedi. Native işlem/GPU başlamaz.

**Dedup/kabul:** R51-28/29/30 ve R31-B98 yaşayan süreç/restore/busy sınıflandırmasıdır. R379-01/02 bozuk kayıt snapshot kapısı, R379-03 terminal/running disk-yazım hata görünürlüğüdür. Burada hiçbir child yok ve süreç bayrakları doğru idle; yalnız ayrı renderer çıktı bağlama sahibi cache tüketicisine sızar. R390 cache guard ve R815-B80/B133 başka invariantlardır. İleride sahipsiz başarısız başlangıç output owner'ı bırakmamalı; gerçek iş/çıktı yükleme korumaları korunmalıdır. Uygulanmadı.

## F833-04 — Manga hedef dili değişince eski dil terimleri yeni kapsama yazılıyor

**Tekrar:** Aynı sekmede iki sentetik sayfayı TR çevir; `Iron Dragon → Demir Ejderha` iki kez öğrenilsin. Gerçek `updateBrowserProfileField('mangaTargetLanguage','en')` ile EN seç. Gerçek Shift-click manga eylemi → clear IPC → stop → ayar kaydı → start IPC → gerçek config/full iş zincirini çalıştır.

**Görülen:** UI dilin sonraki işte kullanılacağını bildirir. EN işinin OCR metin çeviri isteğindeki `terminologyText` hâlâ **`Iron Dragon=Demir Ejderha`** içerir. İşten sonra **`https://manga-a.invalid|en`** kapsamı için `setBrowserPlaces` kayıt payload’ındaki target da **Demir Ejderha** olur. Gerçek clear haritayı korur. Kontrollü sağlayıcının nihai çeviri kalitesi iddia edilmiyor; yanlış dil kılavuzu gerçek istek config'ine ve site kaydetme payload’ına taşınıyor.

**Kök/kanıt:** [main.js:8513](../../src/main.js#L8513) tek `tab.mangaTerminologyMap` tutar; yeni origin/dil yalnız seed kümesine eklenir. [8537](../../src/main.js#L8537) bütün haritayı yeni scope'a yazar. [8027](../../src/main.js#L8027) stop haritayı temizlemez. [manga-probe.cjs](evidence833/browser/manga-probe.cjs), [manga-result.json](evidence833/browser/manga-result.json) gerçek renderer profili/clear/start/config/request/learn/persist zinciridir; görsel tarama/overlay/HTTP yanıtı, ayar save ve site-store disk sınırları kontrollüdür. Manga için diskten tekrar açma yapılmadı; gerçek persist fonksiyonunun verdiği payload ölçüldü.

**Kontrol/dedup/kabul:** Yeni sekme EN kontrolünde TR sızıntısı yok; aynı scope/bölüm devamlılığı ve cache doğru. Origin değişimi aynı kökün sınırlı ek varyantıdır; gerçek native navigasyon sınanmadı, ayrıca bug sayılmadı. R352 kasıtlı bölüm terim devamlılığı, R391/R815-B129 OCR parser ve BCP47 scope regex kökü değil. İleride origin+hedef dilin haritası ayrılmalı, TR→EN→TR kendi terimlerini korumalıdır. Uygulanmadı.

## F833-05 — Yalnız notu kaydetmek geçerli araştırma bağlantısını siliyor

**Tekrar:** Gerçek upsert ile `https://evidence.invalid/chapter?select=a|b` bağlantısını Source etiketiyle kaydet. Gerçek store/list/renderer kartında yalnız notu değiştirip Kaydet'e bas. Başlangıç **1 geçerli link**, başarılı kayıt ve diskten yeni store ile okumadan sonra **0 link**.

**Kök:** [renderer:19261](../../src/renderer/renderer.js#L19261) raw `label | URL` yazar; [19200](../../src/renderer/renderer.js#L19200) bütün `|` karakterlerinde bölüp son parçayı URL sayar; [19328](../../src/renderer/renderer.js#L19328) bütün alanları bu dönüşümle kaydeder. Gerçek normalizer başlangıç URL'sini kabul eder, bozulmuş `b` parçasını reddeder. Aynı kayıplı editör serileştirmesinde kabul edilmiş `['one,two']` tag'i `['one','two']` olur; bu ikinci bug sayılmadı.

**Kanıt/kontrol:** [research-probe.cjs](evidence833/browser/research-probe.cjs), [research-result.json](evidence833/browser/research-result.json): gerçek upsert/list handler, BrowserNoteStore, disk ve yeniden açma, tam research renderer fonksiyonları. `%7C` URL, label içinde `|` ve sıradan URL **1→1**; yetkisiz upsert reddedilir. Native UI/kişisel not/ağ yok.

**Dedup/kabul:** R823 başka kartın kaydedilmemiş taslağının yeniden render kaybıdır; burada aynı kartın önceden diskten gelen geçerli verisi başarılı kayıtla silinir. R815-B127/B128 export/search ve R831 CSV kimliği farklıdır. İleride yalnız not kaydı kabul edilmiş link/tag'leri aynı bırakmalı; geçersiz alan sessiz silinmemelidir. Uygulanmadı.

## F833-06 — Toplu geri alma, aradaki dış düzenlemeyi eziyor

**Tekrar:** İki altyazıda BEFORE→AFTER için gerçek toplu Bul/Değiştir uygula. İlk dosyanın main yazımı başarıyla tamamlandıktan sonra, ikinci dosyanın kontrollü hatası dönmeden önce ilk dosyaya başka editörün kaydı gibi **`EXTERNAL NEWER WORK THAT MUST SURVIVE`** yaz. İkinci hata rollback'i tetikler.

**Görülen/etki:** İlk dosya eski SOURCE BEFORE'a döner; dış düzenleme kaybolur. `rollbackFailed:false`, UI yalnız ikinci kayıt hatasını bildirir. `.bak` da ilk SOURCE BEFORE'dur, aradaki dış çalışma bu backup'ta yoktur. Başka editörün kendi undo/yedeğinin de silindiği iddia edilmez. **P1**, kullanıcı çalışmasının uygulama tarafından ezilmesidir; hata penceresi ve kontrollü disk arızası önkoşulu açıktır.

**Kök:** [renderer:22911](../../src/renderer/renderer.js#L22911) rollback `writeSubtitle` çağrısına dördüncü **expect** argümanını vermez. Normal forward [22901](../../src/renderer/renderer.js#L22901) bunu verir. [Main:3038](../../src/main.js#L3038) mtime/size bekçisi veri verilince doğru çalışır.

**Kanıt/kontrol:** [media/probe.cjs](evidence833/media/probe.cjs), [result.json](evidence833/media/result.json), `rollbackExternalOverwrite`: gerçek find/plan/prepare → tam apply → bulk writer → gerçek main/backup/atomik dosya işlemleri. İkinci dosya hatası ve araya dış yazım enjekte edilir; gerçek disk arızası veya Electron IPC taşıması değildir. Gerçek main'e stale expect verilen kontrol dış metni koruyarak reddedilir; normal expect'li yazım geçer.

**Dedup/kabul:** R322 tekil edit/merge bekçisi ve R301 rollback envanteri ters yazımdaki eksik expect'i kanıtlamaz; R320/R321 farklı taslak/biçim kökleridir. İleride rollback yalnız kendi son yazdığı sürümü geri almalı; aradaki dış çalışma korunup çatışma açıklanmalıdır. Uygulanmadı.

## F833-07 — Başarılı geri alma sonrası normal yeniden deneme yanlış çatışmaya takılıyor

**Tekrar:** Aynı iki dosya işlemini **hiç dış düzenleme olmadan** çalıştır. İkinci dosya kontrollü hata verir; ilk dosya başarıyla geri alınır. Aynı açık UI'da tekrar Tümünü değiştir'e bas.

**Görülen/kök:** Disk ve ham UI metni SOURCE BEFORE, ama `player.subStat` önceki SOURCE AFTER sürümünün stat'ıdır. Gerçek tekrar ilk dosyada **`Altyazı dosyası dışarıdan değiştirildi; düzenleme uygulanmadı. Dosyayı yeniden açın.`** der; ikinciye ulaşmaz. [renderer:22911](../../src/renderer/renderer.js#L22911) başarılı rollback sonucunu `noteSubtitleStat` ile not etmez; forward [22919](../../src/renderer/renderer.js#L22919) eder. Main guard doğru ret vermektedir; producer'ın stat'ı eskidir.

**Kanıt:** Aynı [medya probu](evidence833/media/probe.cjs), `rollbackStaleStat`: ayrı sentetik klasör, gerçek tam apply retry, UI logları ve disk stat'ı. `applying=false`; bu disabled düğme iddiası değildir. Üretim kendi yazımlarını izleyicide bastırır; prob dosya izleyicisini çalıştırmadı. Uzun bekleme/izleyici toparlanması ayrıca sınanmadı. Dosyayı yeniden açmak geçici yoldur.

**Neden ayrı kök:** F833-06 dış edit+eksik expect; bu hata dış edit olmadan eksik **başarılı sonuç stat güncellemesi**dir. Yalnız expect eklemek eski stat'ı güncellemez; yalnız stat güncellemek dış editin ezilmesini engellemez. R322 tekil merge akışı bu toplu retry değildir. İleride başarılı geri alma sonrası tekrar doğru geçmeli, gerçek dış değişim reddi korunmalıdır. Uygulanmadı.

## F833-08 — Kısmi analiz sonrasında eski ses dalgası yeni öneri üretiyor

**Tekrar:** Gerçek FFmpeg ile üretilmiş tek PCM ses izli 3 sn MKV'yi 0–3 sn/iz0 için incele. Sonra UI'nın izin verdiği ses izi **1** ile tekrar incele. Bu indeksin dosyada bulunmaması analizin kısmi hata üretmesi için kullanılır; yanlış indeksin kendisi bug sayılmaz. [HTML:3506](../../src/renderer/index.html#L3506) ham number 0–31 kabul eder.

**Görülen:** İlk analiz **60 waveform noktası**; ikinci `{ok:true, track:1, waveform:null, warnings:[...0:a:1...]}`. `analysis.track=1` olur fakat waveform/start/duration eski iz0 verisidir. Gerçek **sessizliğe hizalamayı önizle → Uygula**, cue'yu **0.900–1.100 → 0.800–1.200** yapar. Bu geri alınabilir bellek zamanlamasıdır; otomatik dosya kaydı veya konuşmanın kırpılması iddia edilmez. Uyarı vardır ama sonraki önerinin eski izden geldiği açıklanmaz.

**Kök/kanıt:** [renderer:33239](../../src/renderer/renderer.js#L33239) yeni analysis'i saklar; [33240](../../src/renderer/renderer.js#L33240) yalnız truthy waveform'u günceller. [33266](../../src/renderer/renderer.js#L33266) sonraki tüketici bu eski alanları okur. [waveform-probe.cjs](evidence833/media/waveform-probe.cjs), [waveform-result.json](evidence833/media/waveform-result.json): gerçek FFmpeg/analyze ve değişmemiş DOM listener/sceneInterval/subtitleSourceTime/preview/apply; JSDOM dialog/media sınırı.

**Kontrol/dedup/kabul:** Waveform temizlenmiş kontrolde öneri yok. Offset+.1 kontrolünde doğru kaynak dönüşümü **0.700–1.100**; önizlemeden sonra offset değişince mevcut transform guard Uygula'yı engeller. R606/R609 offset ve R800 kilit koruması, R815-B63 WebAudio farklı köklerdir. İleride ses verisi yeni analiz/iz/aralığa bağlı olmalı; eski veri kullanılacaksa açık kapsamla sunulmalı, yeni sessizlik önerisinde sessizce kullanılmamalıdır. Uygulanmadı.

## F833-09 — 51 öğeli listeyi Oynat, sessizce 50'de bitiriyor

**Tekrar:** Gerçek playlist seçici Oluştur/Ekle tıklamalarıyla 51 ayrı video kaydet. Panel başlığı **Sentetik liste (51)**. Gerçek panel Oynat düğmesine bas; ilk50 başarılı-açılış dequeue ve next çağrısıyla tüketilsin.

**Görülen/kök:** Liste disk verisinde 51 olarak korunur; oynatma sırası **50**, son kimlik50. Elli açılış isteğinden sonra sıra0/nextfalse; **51'inci hiç istenmez**. [renderer:29974](../../src/renderer/renderer.js#L29974) `list.items.slice(0, ST_QUEUE_MAX)` yapar; [29672](../../src/renderer/renderer.js#L29672) queue max50, [29879](../../src/renderer/renderer.js#L29879) kayıtlı liste max200. Devam cursor'ı veya oynatma öncesi kısmi sınır uyarısı yoktur. Kaynak sınırının varlığı değil, desteklenen büyük listeyi tam Oynat eyleminin sessiz kısmi çalışması raporlanıyor.

**Kanıt/kontrol:** [smarttube/probe.cjs](evidence833/smarttube/probe.cjs), [result.json](evidence833/smarttube/result.json), `playlistTruncation`. Gerçek picker, render, play click, save/load payload ve başarılı-açılış dequeue/next fonksiyonları; video transportu kontrollüdür, gerçek videolar oynatılmadı. **50 öğeli liste kontrolü 50/50.** Medya veya liste kaydı silinmedi.

**Dedup/kabul:** R163 liste API/test envanteri bu kapasite birleşimini, R815-B110 abonelik import kapasitesi farklı koleksiyonu kapsar. İleride tam liste kademeli sürmeli veya kullanıcıya açık kısmi seçim/sınır eylemden önce sunulmalıdır. Sınırları kör yükseltme önerilmiyor. Uygulanmadı.

## F833-10 — Sıraya ekleme/karıştırma görünürde eski sırayı bırakıyor

**Tekrar:** Ana sayfa kuyruğuna gerçek kart-toggle ile A/B ekle; ray A/B. Display panelinden C listesini **Sıraya ekle**: localStorage **A/B/C**, ray **A/B**. Gerçek Karıştır callback'inde kontrollü random0 ile kalıcı sıra **B/C/A** olur; ray hâlâ A/B'dir. Aynı mevcut `stRefreshQueueRail()` kontrolü görünümü B/C/A'ya getirir.

**Kök/kanıt:** [stPlaylistEnqueue:29957](../../src/renderer/renderer.js#L29957) ve [stQueueShuffle:30189](../../src/renderer/renderer.js#L30189) kaydeder/butonları günceller ama rayı yenilemez; normal toggle [29726](../../src/renderer/renderer.js#L29726) yeniler. Aynı [SmartTube sonuç](evidence833/smarttube/result.json), `staleRail`. Ekleme ve karıştırma aynı eksik görünüm yenileme kökü, ayrı sayılmadı. Random kontrolü deterministik sıra ölçmek içindir; karıştırıcı dağılımı bugı değildir.

**Etki/dedup/kabul:** Gerçek yürütülecek sıra ile görünen sıra ayrışır, yeni öğe raydan yönetilemez; kayıt kaybolmaz. Yeniden render toparlanır; bu nedenle **P3**. R831 abonelik group filter değil, R163 API envanteri yeni UI mutasyon tüketicisini kanıtlamaz. İleride bütün public queue mutasyonları doğru kimlik/adet/sıralı rayı güncellemelidir. Uygulanmadı.

## F833-11 — Filtrelenmiş ara sayfa sonraki playlist sayfalarını kapatıyor

**Tekrar:** Gerçek `openInvidiousPlaylistPage`: sayfa1'de20 normal video, sayfa2'de20 farklı canlı video, sayfa3'te20 normal video. **Canlıları gizle** açıkken gerçek Daha fazla'ya bas.

**Görülen/kök:** Sayfa2 başarılı ve20 yeni ID içerir; filtre yüzünden 0 kart eklenir. [renderer:30972](../../src/renderer/renderer.js#L30972) `!added` değerini sayfa sonu/tekrar gibi yorumlayıp Daha fazla'yı kaldırır. İstekler **[1,2]**; sayfa3'e erişim yoktur. Aynı yanıtlarda filtre kapalı kontrol40 kart ve Daha fazla verir; sonraki click **[1,2,3]** olur.

**Kanıt/kontrol/dedup:** [SmartTube probu](evidence833/smarttube/probe.cjs), `filteredPage/unfilteredPageControl`; gerçek açma/render/click/filter, kontrollü sayfa yanıtları, canlı Invidious yok. Fixture20 eşiği üretim kodunun kendi devam eşiğidir. R260-04 geçici fetch hata/retry kökünden farklı: burada cevap başarılıdır; tekrar ID yoktur. Kanal/arama benzerleri ayrı bug diye çoğaltılmadı. İleride görünür0 ile yeni kaynak0 ayrılmalı; filtrelenen dolu ara sayfa sonraki sayfalara erişimi bitirmemeli, tekrar/kaynak tavanı korunmalıdır. Uygulanmadı.

## Buglardan ayrı 15 geliştirme/ekleme önerisi

Mevcut özelliklerin uzantısı olanlar açıkça belirtiliyor. Hiçbiri uygulanmadı; bug toplamına eklenmedi.

| ID | Öneri | Dayanak ve kabul ölçütü |
|---|---|---|
| G833-01 | Bekleyen/hatalı kuyruk işinin dondurulmuş tarifini incele ve yeni taslağa kopyala. | Mevcut `queueItemMeta` beş özet alan, R697 çalışan iş özeti zaten var. İşe özel aralık/çıktı klasörü/önemli ayarlar salt okunur görülsün; kopyalama yeni ID ve açık kullanıcı seçimi gerektirsin. Form değişimi eski işi değiştirmesin, anahtar gösterilmesin. G831-05 text-voice geçmişinden farklı koleksiyon. |
| G833-02 | Kuyrukta hata/uyarı/kurtarılan filtresi, doğru toplam ve açık retry seçimi. | Mevcut jobs tab/recovery korunur. Filtre sıra/status değiştirmesin; saklı işler toplamda kalsın; retry seçili mi tüm hatalı mı açık olsun. Başarılar tekrar işlenmesin. Yeni scheduler önerilmez. |
| G833-03 | Otomatik kuyruğun neden durduğunu kalıcı görünür gerekçeyle açıkla. | Sırada dur, kullanıcı iptali, busy ret, kayıt hatası ve doğal tamamlanma ayrılmalı. Gerekçe owning run'a bağlı, bekleyen sayı/sonraki eylem görünür olmalı; restart sessiz başlatmamalı. Mevcut retry mantığının yerine geçmez. |
| G833-04 | Altyazı otomasyonunun neden başlamadığını mevcut karar verisiyle göster. | `browserAutomationDecision` zaten var. Effective site/path/tab scope, kaynak bekleme, iptal, uygun çeviri, iş/karakter bütçesi farklı nedenler olmalı. Salt gösterim yeni iş/ağ başlatmamalı. R815-B125 bütçe onarımı veya G35 workflow seçimi tekrar değil. |
| G833-05 | Birleşik kayıtlı sayfa aramasında site ve ziyaret tarihi daraltması. | WatchIndex URL/visited_at verisi zaten var. İki site/iki tarih kontrolünde filtreler doğru birleşmeli; görünür/toplam/limit ayrılmalı. Yeni crawler veya R822 FTS düzeltmesi değil. |
| G833-06 | Komut paletinde gerçekten tanımlı Windows kısayolunu göster. | Mevcut başlık/kategori ve dispatch korunur. Ortak shortcut kaydından Ctrl/Alt etiketi; olmayan komuta kısayol uydurulmasın. Badge arama verisine karışmasın, EN/TR ve klavye seçimi korunsun. |
| G833-07 | Tek araştırma kartından kaynaklı alıntıyı kopyala. | Mevcut kaynak aç/anchor/Markdown export var. Seçilen alıntı+başlık+güvenli URL+varsa gerçek timestamp panoya gitsin; sır içeren query mevcut redactor'dan geçsin. Kaynak/çeviri/ağ değişmesin; sayfaya sahte süre eklenmesin. |
| G833-08 | Arşiv sağlığı listesinde sorun türü filtresi ve adetleri. | Mevcut sağlık taraması ve metin filtresi korunur. Kayıp/kopya/altyazısız/doğrulanmamış sayıları mevcut snapshot'tan gelsin; filtre ikinci tarama veya silme başlatmasın. R815-G12 relink önerisinin mevcut listede daraltma uzantısıdır. |
| G833-09 | Kodlama önizlemesinde cue özeti ve ilk/orta/son örnekleri. | Mevcut karakter önizlemesine parsed cue sayısı ve replacement-character sayısı eklensin. Heuristic kesin doğru diye sunulmasın; kaynak baytları değişmesin, açma/kopya kararı kullanıcıda kalsın. Yeni decoder önerilmiyor. |
| G833-10 | Sahne notlarının kaynak/aralık/saklama sınırı listesi. | Mevcut kaynak+aralık+cue signature anahtarı ve100 not sınırı korunur. Eski not yeni zaman/metne ancak kullanıcı inceleyip açıkça kopyalarsa taşınmalı; otomatik eşleme yapılmamalı. R609 korumasını gevşetmez. |
| G833-11 | Toplu metin değişikliğinde dosya bazında önce/sonra inceleme. | Mevcut eşleşme seçimine ek olarak değişecek dosya/cue/occurrence sayıları ve fark görülsün. İptal0yazım, snapshot değişirse yeniden inceleme. F833-06/07 korumalarının yerine geçmez. |
| G833-12 | Yerel SmartTube listesinin bütün içeriğini detay görünümünde yönet. | Mevcut ilk10 önizleme/listesilme/API yeniden özellik sayılmaz. 200 kimlik sırası, arama ve açık öğe kaldırma seçili listeyi doğru güncellesin; başka liste etkilenmesin. F833-09 tam oynatma düzeltmesi ayrı. |
| G833-13 | Açılmayan sıradaki videoda açık Atla/Sırada tut kararı. | Mevcut başarısız probe'da sırayı koruma doğru. Yeni açık eylem exact video+intent ile çalışsın; sessiz silme/atlama ve otomatik varsayılan değişimi olmasın. Yeni ağ/model veya autoplay politikası önerilmiyor. |
| G833-14 | Yerel SmartTube video listelerine dar JSON paylaşım/aktarım önizlemesi. | Abonelik/RSS veya müzik listesi değil; mevcut video ID/ad/sıra koleksiyonu. Geçersiz ID/adet/sınır/merge politikası görünür, varsayılan mevcut veriyi koruyan aktarım olsun; stream URL/sır taşınmasın. Genel workspace backup'ın yerine geçmez. |
| G833-15 | Link-hint odak/aktivasyon politikasını kontrol türüne göre açıklaştır. | [Ölçülen kanıt](evidence833/browser/result.json): checkbox/radio/submit hint'i0click, yalnız focus; BUTTON1click, text INPUT doğru focus. Sonradan Space/Enter hâlâ mümkün; ürünün tüm INPUT odak politikası açık olduğundan **bug sayılmadı**. Politika değişecekse yazı alanı focus, seçim/submit bir normal aktivasyon; ikinci tuşla çift işlem ve iframe/Escape sızıntısı olmamalı. |

## Tekrar elemesi, genişlik ve elenen adaylar

AGENTS/YENI-BILGISAYAR/DEVIR1235, ardından eşzamanlı R832/devir1232, Night1000 README/ilgili tam mekanizma-imzalar, R815 134 mapping/remediation ve ilgili eski raporlar incelendi. Dört [registry kaydı](evidence833/manifest.json): browser160, medya120, pipeline120, SmartTube60 = **460 alan referansı / 340 benzersiz tarihsel satır**. Bunlar yeni test,340 yeni senaryo veya güncel PASS sayısı değildir. Eski1000 satır körlemesine yeniden koşulmadı; F09-02 açık tasarım kaydı bu turun konusu değil.

Tarayıcı recorder/player/palette, page-find/FTS, site izinleri/zoom, otomasyon bütçeleri; queue freeze/start/retry/cancel/recovery/terminal/scheduler/process ownership; medya encoding/export/corpus/burn-in, toplu düzenleme, scene timing ve playlist paging/rail yolları incelendi. Bunların bütünü native E2E geçti denmiyor. Araştırma URL/tag, iki taşıma yönü, URL/dosya ret, manga origin/dil ve iki ray mutasyonu kendi kökleri içinde birleştirildi.

R821-G01 reexport ASR metrics sadakati mevcut önerisi bulundu; yeni bug/öneri yapılmadı. R815-B122 M4B uzantı onarımı, B125 otomasyon bütçesi, B127/128 notebook export/search, R822 Türkçe FTS, R823 taslak kaybı ve R818–823 onarımları yeniden sayılmadı. Harici KeyboardInterrupt için güçlü normal Windows üreticisi kanıtlanmadı. Gezinme sonrası izin adayı eski origin'e açık bağlı, yeni origin sızıntısı yok; bug sayılmadı. Geçersiz WebVTT NOTE örneği, corpus case ve sidecar sağlık şüpheleri de bug toplamında yok. Son R830/R831 köklerinin bu tur düzeldiği veya yeniden sınandığı iddia edilmiyor.

## Doğrulama, yeniden çalıştırma ve sınırlar

Her komut varsayılan olarak yeni `.uiprev/audit833-*` dizinine yazar; özel **yeni** `AUDIT833_OUT` verilebilir. FFmpeg probu mevcut Windows `C:/ffmpeg/bin/ffmpeg.exe` yolunu kullanır; başka ortamda bu yürütücü uyarlanmalıdır. Head etiketi değiştirmek başka revizyonun geçtiğini kanıtlamaz; [manifest](evidence833/manifest.json) gerçek kaynak SHA256'larını bağlar.

```powershell
node docs/raporlar/evidence833/pipeline/probe.cjs
node docs/raporlar/evidence833/browser/probe.cjs
node docs/raporlar/evidence833/browser/manga-probe.cjs
node docs/raporlar/evidence833/browser/research-probe.cjs
node docs/raporlar/evidence833/media/probe.cjs
node docs/raporlar/evidence833/media/waveform-probe.cjs
node docs/raporlar/evidence833/smarttube/probe.cjs
```

Ana ajan final yayın yollarından **7/7 prob exit0**, **7 CJS syntax exit0** gördü. Problar hatalı davranışı assertion ile doğrular; bu PASS onarım değildir. Mevcut altı dosya ayrı süreçlerde exit0: queue-ordering **18 kontrol**, queue-lifecycle **21**, job-resource **14**, channel-depth **4**, subtitle-find-replace-integration **13**; playlists-parti5b **OK**. Queue-ordering erken özet5 yazsa da ardından13 kontrol tamamlanır; süreç çıkışı beklenmiştir. Sayılar yeni bug sayısına katılmadı. [Ana doğrulama kaydı](evidence833/parent-verification.json) sınırlamaları saklar.

Gerçek Windows Node24.22.0/JSDOM30.0.1, Türkçe sentetik dosya yolları/gerçek fs/atomik yazım ve gerçek FFmpeg generation/analysis çalıştı. İki dosya hatası ve dış edit zamanlaması kontrollü enjeksiyon, queue persist yakalanan payload, native/HTTP/worker sınırları adaptördür. Native görünür Electron/fare/klavye/DPI, gerçek video/ses duyumu, gerçek site/hesap/DRM, GPU/CUDA/ASR/TTS/LLM/ücretli API ve uzun soak doğrulanmadı. `start.bat`/`install.bat` değişmedi; normal açılış/temiz kurulum koşulmadı. Gerçek FFmpeg çalışması bunların yerine geçmez.

Tam npm/uzun CI koşulmadı; CI kapatılmadı, görülmeyen sonuç başarılı sayılmadı. R830'daki bilinen B98 FAIL tekrar koşulmadı veya giderildi denmedi. Yeni bağımlılık/dış repo kodu alınmadı. Kullanıcının açık uygulaması, kişisel profil/ayar/anahtar/medya kullanılmadı veya değiştirilmedi. Ham profil, MKV/WAV ve günlükler yayımlanmadı; yalnız seçilmiş sentetik prob/JSON var. Önceden kirli dosyalar ve ilgisiz untracked hariçtir. Teslim: bu rapor, kanıtlar, [devir notu](../devir/2026-11-01-1246.md) ve DEVIR indeksi. **11 bug düzeltmesi ve 15 öneri uygulanmadı.**
