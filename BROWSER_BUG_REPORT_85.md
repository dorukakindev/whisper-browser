# BROWSER_BUG_REPORT_85 — Güncel raporların bulgu-bazlı bağımsız denetimi

Durum: **tamamlandı; ürün kodu değiştirilmedi.** Başlangıç ve bitiş ürün HEAD'i `ea13be5cd25a49da46ba84aa1915e053497aadcc`, dal `master`. Kapsam R76–80, R83 ve PROGRAM R79–82. Kişisel profil, gerçek anahtar, ücretli sağlayıcı ve DRM oturumu kullanılmadı.

Kararlar: **G** = güncel kod/sentetik davranış doğrulandı; **K** = kaynak mekanizması var, kullanıcı etkisi için kontrollü koşul/çevre testi eksik; **Y** = rapordaki örnek bugün yanlış veya kapanmış; **B** = bağımsız kanıt henüz yetersiz; **M** = bakım/test/perf konusu, doğrudan ürün bug'ı diye yükseltilmez. `G` gerçek site/Electron kabulü değildir. Her satır `kaynak; tetik; kanıt veya eksik test; etki; mevcut test; karar` düzenindedir. Kaynak satırları güncel HEAD'e göredir; eski raporlardaki satır numaraları değişmiş olabilir.

## Yönetici özeti ve kapsam kanıtı

Özgün raporlardaki **125 numaralı madde** tek tek incelendi. `R78-08` içinde iki bağımsız alt iddia bulunduğundan aşağıda **126 karar satırı** vardır. Otomatik ID envanteri eksik satır bırakmadı. Birincil karar dağılımı: **58 G · 29 K · 14 Y · 12 B · 12 M · 1 A**. `G` satırlarının içinde tekrarlar ve bakım/perf alt nitelikleri bulunur; bu sayı 58 benzersiz kullanıcı bug'ı anlamına gelmez. Benzer kökler ayrıca işaretlendi ama hiçbir numaralı madde tablodan çıkarılmadı.

| Kaynak rapor | Numaralı madde | Karar satırı |
|---|---:|---:|
| BROWSER 76 | 32 | 32 |
| BROWSER 77 | 14 | 14 |
| BROWSER 78 | 8 | 9 (`R78-08a/b`) |
| BROWSER 79 | 4 | 4 |
| BROWSER 80 | 5 | 5 |
| PROGRAM 79 | 6 | 6 |
| PROGRAM 80 | 2 | 2 |
| PROGRAM 81 | 14 | 14 |
| PROGRAM 82 | 1 | 1 |
| BROWSER 83 | 39 | 39 |
| **Toplam** | **125** | **126** |

Doğrulama koşuları:

- `npm test`: sandbox içinde 10 dosya süreç açma/Python erişimi nedeniyle düştü; aynı çalışma ağacı normal Windows süreç izinleriyle tekrarlandığında **exit 0, “Tüm testler geçti”**. Bu ayrım ürün hatası diye sayılmadı.
- `node tests/run-electron-smokes.js --all`: **üç ardışık tur, her tur 20/20 geçti**. R76 V1–V3/T3 güncel HEAD'de yeniden üretilemedi.
- `npm run test:electron-bridge`: **exit 0**; trusted bridge, TextTrack/EME, gerçek medya/shadow/iframe yaşam döngüsü, link hints ve isolated-world Dark Reader smoke'u geçti.
- Sentetik prob seti URL redaksiyonu/userinfo, Unicode arama ve zaman normalizasyonu, cue merge/shift, chapter sırası, site zoom, izin kararı, SDH/TM çağrı sayısı, translation layout ve child stderr backpressure yollarını çalıştırdı. Her satırda prob veya neden koşulamadığı ayrıca yazıldı.
- 2026-09-19'da resmî Invidious listesi canlı kontrol edildi; `backend/invidious.py` içindeki beş clearnet host o günkü listeyle eşleşti. Bu dış liste değişebilir.

## BROWSER_BUG_REPORT_76.md

| ID | Kaynak ve erişilebilir tetik | Bu HEAD'deki kanıt / eksik test; kullanıcı etkisi; mevcut test | Karar |
|---|---|---|---|
| V1 | `tests/electron-browser-video-e2e.smoke.js` sabit 700 ms sonra overlay okur; toplu smoke yükü | Güncel HEAD'de `node tests/run-electron-smokes.js --all` **3 ardışık turda** geçti (her tur 20/20); video E2E üçünde de yeşil. Tarihsel düşüş yeniden üretilemedi; bu, gelecekte flake olamayacağını kanıtlamaz. | Y/güncel repro yok |
| V2 | `tests/run-electron-smokes.js` GPU kapalı toplu ASS smoke | Aynı üç toplu turda ASS smoke geçti; `UnknownVizError` çıkmadı. Tarihsel ortam/test flake'i bugün kapalı. | Y/güncel repro yok |
| V3 | `tests/electron-browser-analysis.smoke.js` sessiz düşüş | Aynı üç toplu turda analysis smoke geçti. Hata-enjeksiyonuyla child stderr görünürlüğü ayrıca sınanmadı; ürün arızası bugün yok, test-tanı nit'i kalabilir. | Y ürün repro yok / M tanı |
| K1 | `browser-place-url.js` 4000 karakter tavanı → `browser-tab-history.js` null kapalı sekme | Sentetik `normalizeClosedBrowserTab` 4001+ query ile `null` döndü. Uzun URL'li sekme geri-açma geçmişinden düşüyor; `report63-secret-redaction` bu sınırı sınamıyor. Kasıtlı güvenlik tavanı, fakat sessiz kayıp gerçek. | G |
| K2 | `browser-session-store.js` ilk 24 dışındaki aktif sekmeyi 24.'nün yerine koyuyor | `tests/audit-followup.test.js` uzunluk ve aktif ID'yi sınar, düşen `t23`'ü sınamaz; eski 25-sekme probu kaybı göstermişti. Kayıtlı sekme kaybı. | G |
| F1 | `browser-transcript-search.js:fold`: NFKD sonra TR lowercase | Sentetik `İstanbul→ıstanbul`; `istanbul` sorgusu ayrılıyor. `browser-nine-features.test.js` mutlu yol içerir ama İ/i matrisi yok. Türkçe arama kaybı. | G |
| F2 | Aynı `fold` İngilizce büyük I | Sentetik `In fact→ın fact`; ASCII `in` eşleşmez. Mevcut testte İngilizce I/i çifti yok. | G |
| F3 | Aynı `fold` ASCII ağırlıklı regex | Sentetik `日本語→''`; CJK arama tokenı yok. Mevcut testte CJK fixture yok. | G |
| F4 | `browser-subtitle-search.js:normalized` birleşik nokta kırılması | Önceki bağımsız probda ASCII `iyi kotu ve cirkin` başlığı 0; aynı Unicode sorgusu +50 alır. Mevcut test bu çapraz yazım çiftini kapsamıyor. | G; rapordaki aynı-Unicode alt iddiası Y |
| F5 | `browser-subtitle-search.js:scoreCandidate`; normalize release boş | Bu tur sentetik `release='###'` ile puan 62, taban 50 (+12). Bütün adayların göreli sırası değişmeyebilir; yanıltıcı mutlak skor/başka kurallar. Mevcut testte boş-normalize release yok. | G (etki dar) |
| F6 | `browser-transcript-search.js:wholeTranscriptIntent` kelime sınırında `ozet` | Sentetik `Videoyu özetle` → `lexical`, `Tüm videoyu özetle` → `distributed`. Mevcut test yalnız ikinciyi sınar. Niyet tespiti eksik. | G |
| F7 | `browser-transcript-search.js` önce zamana sırala, sonra `slice(limit)` | 200 satır + 10 geç `hedef` sentetik girdide limit 36: 8 isabet; limit 48: 10 isabet. Varsayılan limitte yüksek puanlı geç kanıt düşebilir. `browser-ai-context` testi bu sıralama çatışmasını kapsamıyor. | G |
| F8 | `browser-subtitle-search.js:downloadSubtitle` yönlendirmede boş Location'ı aynı URL'ye çözer | Kaynak yolu hâlâ `new URL(location || '', url)`; 302+Location yoksa kendi URL'sine döner. Bu tur mock-fetch koşulmadı; eski rapor 4 GET ölçmüş. Gereksiz tekrar/açıklamasız hata. | K |
| T1 | `electron-smarttube-boot` mock IPC yüzeyi | Üç toplu tur da 20/20 geçti fakat SmartTube mock'u ilgisiz kanallarda “No handler registered” günlükleri üretiyor; test gereken davranışları özel mock'larla kanıtlıyor, tüm ürün IPC yüzeyini taklit etmiyor. Kullanıcı bug'ı değil. | G/M test sınırı |
| T2 | `electron-browser-analysis.smoke.js` çıkış tanısı | Güncel üç tur başarıyla çıktı; başarısız-child hata enjeksiyonu yapılmadığı için eski “sessiz hata” iddiası doğrulanmadı. | B/M |
| T3 | `run-electron-smokes --all` deterministik etiketi | Güncel HEAD'de üç ardışık toplu tur **20/20** geçti; rapordaki oynaklık bugün yeniden üretilemedi. Üç tur uzun-vadeli flake yokluğunu ispatlamaz. | Y/güncel repro yok |
| SL1 | `browser-link-intent.js` ile preload kopyası | Kaynak tekrarının varlığı tek başına kullanıcıya ulaşan bug değil; farklı karar veren fixture bulunmadı. | M |
| SL2 | `browser-preload.js` kaynak ölçümünde 4 sabit sıfır, `measured:true` | Kaynakta `resizeObservers/mediaListeners/overlayNodes/pendingFrames:0` gerçekten var; `browser-tab-resources.js` bunları ölçüm sayıyor. Kaynak paneli yanıltabilir; test gerçek sayfa nesnesiyle kıyaslamıyor. | G |
| SL3 | `wholeTranscriptIntent` listesindeki aksanlı girişler `fold` sonrası | Kodda ölü girişler mevcut; F6 ile ilgili bakım borcu, ayrı kullanıcı arızası kanıtı yok. | M |
| SL4 | İki `normalizeCues/cuesToSrt/srtTime` uygulaması | Kopya yüzeyi; çıktılar arasında farklılık fixture'ı yok. | M |
| SL5 | Depo kökünde artefakt dosyalar | Ürün davranışı değil; mevcut izlenmeyen kullanıcı dosyalarına dokunulmadı. | M |
| N1 | IPC sözleşmesi 187/187 temiz iddiası | Eski raporun regex taraması güncel handler sayısını kanıtlamaz. Negatif bulgu; bug olarak düzeltmeye verilmez. Tam dinamik servis kaydı taraması bu tur yapılmadı. | B |
| N2 | Renderer `innerHTML` XSS temiz iddiası | Eski 61 atamalı regex taraması sınırlı; güncel tüm render akışı baştan denetlenmedi. Negatif bulgu, kesin güvenlik sertifikası değil. | B |
| S1 | `browser-subtitles.js:mergeBrowserStreamCues` eski tek-cue revizyonu | **Önceki rapor bugün yanlış:** `[a:'Bir',b:'Iki']` + `a:'Bir duzeltilmis'` → iki satır (`Bir duzeltilmis`,`Iki`); güncel genel yol aynı `cueId`'yi güncelliyor. `tests/browser-stream-revisions.test.js` toplu revizyonu sınar. | Y |
| S2 | Aynı merge, cueId aynı fakat start +0.4 s | Sentetik 10–12 eski + 10.4–12.4 yeni → iki çakışan cue hâlâ var. Bunun yanlış dedupe olduğu gerçek sağlayıcıda ID tekilliği sözleşmesine bağlı; testte zaman kaymalı aynı ID revizyonu yok. | K |
| N3 | Çeviri cache ilk 60/144 satır temiz | Kısmi tarihsel negatif denetim; bugün tam cache yaşam döngüsü doğrulanmadı. `.corrupt-*` birikimi ayrı bakım adayı. | B/M |
| PF1 | `main.js:storeBrowserTrack` tam geçmiş merge/fingerprint | O(n)–O(n log n) tekrar kaynakta mevcut; eski 20k-cue 57 ms sayısı bu HEAD'de yeniden benchmark edilmedi. Uzun canlı yakalamada ana döngü gecikmesi adayı; işlev hatası değil. | K/M |
| PF1b | Süreklilik/GC platosu | Eski 300/600-batch ölçümü güncel makinede tekrarlanmadı; “kaçak yok” da güncel kanıt değildir. | B/M |
| PF1c | Yayın sırasında tam SRT+asset yazımı | Birden çok tam veri işleme/yazım kaynakta var; eski 101.6 ms ve 3.6 MB rakamları güncel ölçülmedi. Disk/IPC bütçesi adayı. | K/M |
| PF2 | `writeBrowserSessionAtomic` büyük oturum pretty JSON + yedek | Kaynak mekanizması var; eski 24×2000 edit, 195 ms / 40 MB ölçümü tekrarlanmadı. Tipik oturumda kullanıcı etkisi kanıtı yok. | K/M |
| PF2b | Kimliksiz editlerin throw/catch normalizasyonu | Kaynak ağır-şema yolu ve tarihsel 306 ms ölçümü; güncel tekrar/kullanıcı oturumu görülmedi. | K/M |
| PF3 | Çeşitli performans şüphelileri temiz | Eski negatif benchmark; yeni kod/ortamda genel “temiz” sertifikası sayılamaz, bug değil. | B/M |

## BROWSER_BUG_REPORT_77.md

| ID | Kaynak ve erişilebilir tetik | Bu HEAD'deki kanıt / eksik test; kullanıcı etkisi; mevcut test | Karar |
|---|---|---|---|
| A1 | `browser-site-permissions.js` destek listesi, `main.js` Electron check/request handler | Yerel `node_modules/electron/electron.d.ts` `mediaKeySystem`'i iki handler sözleşmesinde listeler; `browserPermissionDecision(...,'mediaKeySystem')→block`; main `callback(false)` yoluna gider. Widevine lisansı canlı oynatılmadı, ama izin kodu kesin reddeder. Testlerde EME izin olayı yok. | G (EME uçtan uca K) |
| A2 | Aynı izin listesi kamera/mikrofonu ayrı saklar ama Electron `media` + `details.mediaTypes` verir | Sentetik kayıtlı `camera:block` ardından `media` kararı `ask`; main details.mediaTypes okumuyor. Kamera engeli uygulanmaz; testlerde medya türü matrisi yok. | G |
| A3 | `main.js:browserPermissionAllowed` yalnız `allow` için true; `ask` false | Sentetik varsayılan geolocation kararı `ask`, check handler false döner. Sayfadaki `Permissions.query`/Notification sonucu gerçek Electron smoke ile ölçülmedi; rapordaki tüm siteler reddeder sonucu aşırı. Test yalnız saf `ask` kararını sınar. | K |
| B1 | `browser-sensitive-keys.js` genel parametreleri `safePlaceUrl` siler | R81'de sentetik `?code=7&page=2` → yalnız page; URL geri-açma farklı olabilir. Gizlilik korumasını toptan kaldırmak doğru değil. Test güvenli ve gizli parametreleri birlikte sınamalı. | G |
| B2 | `browser-chapters.js` eşit-start comparator | Sentetik üç native `B,C,D` → `D,C,B`; testte eşit yerel bölüm sıra-fixture'ı yok. UI bölüm sırası ters. | G |
| B3 | `main.js` ana belge gezinmesinde yalnız `source/translation/both` korur | Güncel `prior.mode='off'` → `translation`; `browser-subtitle-session` testi yalnız disk geri yüklemeyi sınar, gezinme dalını değil. Kullanıcının kapatma tercihi gezinmede bozulur; görünür Electron akışı ayrıca denenmeli. | G (UI kabulü K) |
| C1 | `browser-site-zoom.js:withBrowserSiteZoom` dönüş öncesi host normalize | Sentetik IPv6 `[::1]`: `ok:true` ve `siteZooms:{}`. `browser-experience` testi yalnız normal hostları sınar. Kaydedildi iddiası yalan; host nadir. | G |
| C2 | `browser-preload.js` kaynak snapshot sabit sıfırlar | R76 SL2 ile aynı kök, ayrı hata sayma. | G/tekrar |
| C3 | `browser-site-profiles.js` Intl.Locale vs `browser-site-terminology.js` iki-alt-etiket regex | Sentetik `siteTerminologyScope('https://example.test','zh-hans-cn')→''`; profil bunu kabul ediyor. Testte çok alt etiket yok. Terminoloji sessiz düşer. | G |
| C4 | `browser-downloads.js:action` geçersiz komut/durum `else` mesajı | Kod `resume` yapılamadığında “artık kullanılamıyor” döndürür. Bu yanıltıcı metin, ancak gerçek indirme arızası değil; terminal kayıtta bu mesaj doğru olabilir. Mock download fixture ile UX kabulü yapılmadı. | K (düşük) |
| D1 | `browser-lifecycle-policy.js` negatif hata kodunu `net-${code}` biçimler | Sentetik `code:-105→net--105`; mevcut `browser-lifecycle-policy.test.js` bunu **aynen bekliyor**. Kozmetik/teşhis biçimi; test yeni istenen sözleşmeye güncellenmeli. | G (düşük) |
| D2 | `browser-fonts.js:readFonts` stat çağrısı try dışında | Sentetik olmayan yol `ENOENT` ve ham yol içeren mesaj attı; üst UI hata redaksiyonu incelenmedi. `catalog-roadmap` yalnız throw bekliyor. Etki kullanıcıya çıkarsa yerel yol sızıntısı. | K |
| D3 | `browser-mini-player.js` factory her çağrıda `ipcMain.handle` kurar | Kod idempotent değil ama üretimde factory `browser-feature-services.js` içinde tek kuruluyor. İkinci çağrının erişilebilir ürün yolu gösterilmedi; hipotetik kullanım kusuru. | B/M |
| D4 | 24 sekme aktif-yerine-yazma | R76 K2 ile **aynı kök**; tekrar sayma. | G/tekrar |

## BROWSER_BUG_REPORT_78.md

| ID | Kaynak ve erişilebilir tetik | Bu HEAD'deki kanıt / eksik test; kullanıcı etkisi; mevcut test | Karar |
|---|---|---|---|
| R78-01 | `browser-sensitive-keys.js` → `browser-place-url.js` → oturum/geçmiş/paket | Sentetik `?auth_token=SYNTHETIC_SECRET&page=2` `safePlaceUrl`'dan değişmeden geçti. CamelCase varyantları `report63-secret-redaction` testinde var, snake-case `auth_token` yok. Sır kalıcılığı. R81 #2 ile aynı. | G |
| R78-02 | `browser-place-url.js` query/hash gezer, pathname parametresini gezmez | Sentetik `/x;jsessionid=SYNTHETIC_SECRET/y` değişmeden çıktı. Kalıcı adres/oturum paketinde sır kalabilir. Test yalnız query/fragment örnekleri içeriyor. | G |
| R78-03 | `browser-subtitles.js:cleanCueText` elle yazılmış named-entity alt kümesi | Sentetik `El ni&ntilde;o comi&oacute; &eacute;` → `El ni&ntilde;o comi&oacute; é`. SRT'de yarı-çözülmüş dil metni; `browser-report-regressions` sayısal/temel entity'leri sınar, bu çok dilli named kümesini değil. | G |
| R78-04 | `browser-sensitive-keys.js` akış anahtarlarını koşulsuz hassas sayar | Sentetik `?code=7&page=2` → yalnız `page=2`. R77 B1 ile aynı kök; ayrı hata sayma. Gerçek OAuth sırrını serbest bırakmayan çift yönlü korpus gerekli. | G/tekrar |
| R78-05 | `browser-reader.js:chooseReaderCandidate` yalnız testlerde; üretim scripti ikinci seçim hesabı yapar | Güncel `rg` tek üretim çağrısı bulmadı; `browser-nine-features` saf helper'ı sınar, gerçek script seçimini değil. İki algoritma sapabilir, fakat gösterilen native-yedek örneğinde görünür yanlış sayfa seçimi bu turda üretilmedi. Test tasarımı/ bakım borcu. | M |
| R78-06 | `browser-sensitive-keys.js`, `browser-dialogue.js`, `browser-mini-preload.js` test adı matrisi | Doğrudan modül adı referansı boş; bu gerçek açık test kapsamı. Ancak `browser-session-privacy` örneğinde görüldüğü gibi salt isim araması davranış kapsamını ispatlamaz; kullanıcı bug'ı değil. Redaksiyon için R78-01/04 ürün kanıtı ayrı. | M |
| R78-07 | `browser-session-privacy.js:SITE_DATA_TYPES` ve Electron `ClearDataOptions` | Yerel Electron d.ts `backgroundFetch`'i izinli sayar, çağrı listesinde yok. Mock temizleme çağrısıyla eksiklik görülebilir; gerçek Background Fetch kaydının temizleme sonrası kaldığı Electron E2E yapılmadı. Site-verisi temizliği kapsam adayı. | K |
| R78-08a | `browser-dialogue.js` finally içindeki geçici klasör güvenlik assertion'ı | Kod `mkdtempSync(os.tmpdir()/whisper-dialogue-)` ile yolu kendisi üretir; invariant'ın normal akışta bozulması gösterilmedi. Asıl hatayı maskeleme yalnız beklenmedik tmpdir/path mutasyonunda; kullanıcı bug'ı diye yollanmaz. | B |
| R78-08b | `browser-media-controller.js:audioGraphAllowed` cross-origin kuralı | Grafik CORS'suz çapraz kaynakta kasıtlı kapatılıyor, bu ses sessizleşmesini önler. Profil açık görünürken neden pasif olduğunu belirten OSD/teşhis kanıtı yok; UX adayını gerçek video/teşhis akışında sınamak gerek. | K/M |

## BROWSER_BUG_REPORT_79.md — SmartTube dört madde

Bu raporun bulguları kod commit'i `59174a7` ile ele alınmış. Bu HEAD üzerinde `node tests/run-electron-smokes.js smarttube-boot` izole Electron koşusu **exit 0**; ilk sandbox denemesi Chromium IPC `0x5` ile engellendi, yetkili tekrar geçti. Mock IPC “No handler registered” günlükleri testin eksik taklit ettiği ilgisiz kanallar; aynı test bunlarla exit 0 döndü. Gerçek Google hesabı denenmedi.

| ID | Kaynak ve erişilebilir tetik | Bu HEAD'deki kanıt / eksik test; kullanıcı etkisi; mevcut test | Karar |
|---|---|---|---|
| R79-1 kayıtlı OAuth istemcisi ilk-kurulum formu | `renderer.js:openYoutubeLogin` kayıtlı istemciyi `ytDeviceView`'a götürüyor | Güncel Electron smoke `deviceVisible:true, clientHidden:true`, kod ve mock davranış uyumlu. Gerçek cihaz yetkilendirme yok. | Y/çözüldü (mock) |
| R79-2 bayat device-code yeni oturumu iptal | `renderer.js:startYoutubeDeviceFlow` generation ve `_ytPolling` | Smoke gecikmiş-code/jenerasyon senaryosunu içeriyor; test geçti. Gerçek Google polling sırası canlı denenmedi. | Y/çözüldü (mock) |
| R79-3 signed-in Home kamu feed'i | `renderer.js` `FEwhat_to_watch` dener, sonra açık fallback | Smoke `ytHomeRendered:true, ytHomeLabel:true`; kod kişisel feed dener. Gerçek hesap personalizasyonu kanıtlanmadı, fallback bilinçli. | Y/çözüldü (mock) |
| R79-4 TV hiyerarşisi sıkışık | `styles.css` ve SmartTube layout | Smoke `minCardWidth≈345`, odak/browse görünümü kontrolü geçti. Estetik kalite yorumsal; ekran-görüntüsü gerçek cihazda ayrıca kabul edilmeli. | Y/çözüldü (izole UI) |

## BROWSER_BUG_REPORT_80.md — SmartTube beş madde

| ID | Kaynak ve erişilebilir tetik | Bu HEAD'deki kanıt / eksik test; kullanıcı etkisi; mevcut test | Karar |
|---|---|---|---|
| B80-01 katalog üstünde oynatıcı kontrolleri | `playerStage.browsing` CSS hali | İzole Electron smoke `browseControlsHidden`, `playbackControlsRestored`, `closeHiddenWithoutVideo` true. Ekran görüntüsündeki eski örtüşme mevcut mock durumda yok. | Y/çözüldü |
| B80-02 Home uzun süre yalnız Loading | `backend/invidious.py:feed_home` `feed_partial` → `main/preload` → renderer | Mock smoke partial-feed ve request generation yolundan geçti; rapordaki canlı anonim 1.6s/7.3s tarihsel ölçüm, bu HEAD'de canlı ağ tekrarı yapılmadı. Bugünkü sunucu gecikmesi garanti edilemez. | Y/çözüldü (kontrollü) |
| B80-03 kayıtlı public instance listesi bayat | `backend/invidious.py:DEFAULT_INSTANCES` | 2026-09-19'da [resmî Invidious instance listesi](https://docs.invidious.io/instances/) ile karşılaştırıldı: beş clearnet hostun beşi de kodda aynı sırada. Liste dışsal ve değişken olduğundan kalıcı garanti değildir. | Y/bugün çözüldü |
| B80-04 feed hatasında Retry yok | `renderer.js` hata/uzun-bekleme gösterimi | SmartTube smoke retry/partial davranışı geçti. Gerçek ağ arızası ayrıca koşulmadı; mock hatada kullanıcı kurtarma yolu var. | Y/çözüldü (mock) |
| B80-05 YouTube giriş düğmesi fold altında | `index.html/styles.css` YouTube gezinme grubu | İzole Electron smoke görünür modal/düğme ve gezinmeyi doğruladı. Raporun orijinal ekran yüksekliğinde gerçek kullanıcı penceresi tekrar çekilmedi. | Y/çözüldü (izole UI) |

## PROGRAM_BUG_REPORT_79.md

| ID | Kaynak ve erişilebilir tetik | Bu HEAD'deki kanıt / eksik test; kullanıcı etkisi; mevcut test | Karar |
|---|---|---|---|
| P79-01 | `backend/subtitle_sdh.py:is_sdh_descriptor` her çağrıda `_SDH` kümesini normalize eder | Bu HEAD'de fonksiyonu sentetik `[Music]` ile sarıp `_key` çağrılarını saydım: **66**. Tekrar çağrıda da aynı. SDH yoğun altyazıda CPU maliyeti; doğruluk kusuru değil. Mevcut testler sınıflandırmayı sınar, çağrı bütçesini değil. Eski 103→10 µs hız iddiası yeniden benchmark edilmedi. | G/M |
| P79-02 | `backend/translation_memory.py:lookup` 240 adayın hepsinde `SequenceMatcher.ratio` | İzole geçici SQLite'da 240 sentetik aday, eşleşmeyen sorgu: **240** ratio çağrısı, MATCH yok. Eski raporun “241” sayısı fixture/ikinci semantic karşılaştırmaya bağlı, genel invariant değil. Uzun çeviri işinde CPU; doğru eşleşme kapısını gevşetme. TM testleri yanlış reuse'u sınar, per-lookup maliyeti değil. | G/M; sabit 241 iddiası A |
| P79-03 | `src/subtitle-sentence-layout.js:fitTranslationParts` 400 kelime/12 parçalık DP | Sentetik en büyük girdide bu HEAD'de 12 çıktı, **75 ms** tek ölçüm. Eski 50–90 ms aralığıyla uyumlu ama istatistiksel benchmark değil; sadece plain-text fallback etkilenir. Parça/sayı/anlam kabul kapıları korunmalı. | G/M |
| P79-04 | `src/browser-media-tools.js:python('semantic')` her sorguda child; `backend/browser_media_tools.py:semantic_search` her süreçte SentenceTransformer yaratır | Kod çağrı yolu doğrudan görülüyor. Model kurulu/canlı istekle süre/MB ölçülmedi; gecikme mekanizması gerçek, büyüklük belirsiz. OCR yoluna genelleme yanlış. | G/M |
| C79-01 | 8 backend modülünün test adında olmaması | Raporun adları `browser_align`, `browser_media_tools`, `browser_video_analysis`, `catalog_scan`, `ndjson_utils`, `nmdb_catalog_import`, `separate_dialogue`, `workspace_video_package`. Bu HEAD'de doğrudan test adı aranıp bulunmadı; statik isim yokluğu dolaylı subprocess kapsamını dışlamaz. Test kapsam borcu, kullanıcı bug'ı değil. | M |
| D79-01 | R78-01 etki/atıf düzeltmesi | `BrowserClosedTabHistory` ana süreçte bellek nesnesi; kapalı sekme listesi disk şemasında yok. **Diske yazan** yollar oturum ve session-package, geçmiş ifadesi bu açıdan düzeltilmeli. Ayrı bug değil, rapor doğruluğu. | G/rapor düzeltmesi |

## PROGRAM_BUG_REPORT_80.md

| ID | Kaynak ve erişilebilir tetik | Bu HEAD'deki kanıt / eksik test; kullanıcı etkisi; mevcut test | Karar |
|---|---|---|---|
| B80-01 (PROGRAM) | `settings-security.js:endpointSetting` URL query sırrını kabul eder; `createBackupPayload` anahtar adını değil değeri toplar | `translateBaseUrl=https://example.test/v1?api_key=SYNTHETIC_SECRET_84` ile sentetik `createBackupPayload`: `secretsExcluded:true` ve marker çıktı içinde **var**. Paylaşılabilir ayar yedeği gizlilik sözleşmesi bozulur. `settings-security.test.js` query-gömülü anahtar fixture'ı yok. R81 #1 ile aynı. | G |
| B80-02 (PROGRAM) | `main.js:probeCommand` stderr okumaz, stdout sınırsız; `process-io.js` test kopyası da stderr okumaz | Yetkili sentetik child: önce `1.2.3` stdout, sonra 8 MB stderr → helper 1203 ms'de `null`; aynı child `stderr.resume()` kontrolünde 52 ms ve `1.2.3`. Üretim helper'ı da aynı boşluğu taşır fakat normal ffprobe/nvidia-smi'nin bu kadar stderr ürettiği görülmedi. `process-io.test.js` timeout/stdout sınırını sınar, stderr tıkanmasını değil. | G mekanizma / K üretim etkisi |

## PROGRAM_BUG_REPORT_81.md

| ID | Kaynak ve erişilebilir tetik | Bu HEAD'deki kanıt / eksik test; kullanıcı etkisi; mevcut test | Karar |
|---|---|---|---|
| D81-01 | `renderer.js` Türkçe durum dizgeleri; `ui-locale.js` tablo temelli EN modu | Somut `'Çalışıyor'`, `'Tamamlandı'`, `'İptal edildi'` renderer'da var, sözlükte yok; EN arayüzde bu durumlar TR kalabilir. Eski “262” mekanik sayı tüm görünür UI dizgesi sayısı değildir; DOM locale smoke ile kesin kullanıcı kümesi ölçülmedi. | G örnekler / K toplam sayı |
| D81-02 | 185 IPC handler'ın hepsi ilk satırlarda guard iddiası | Negatif güvenlik taraması; dinamik yardımcı modül/ayrı handler akışlarını kapsayan bug ispatı değil. Bu tur 185 handler tek tek yeniden denetlenmedi; “tam temiz” sertifikası olarak devredilmez. | B |
| D81-03 | Backend'de P79-01 dışında aynı set-derleme deseni yok | Sınırlı kaynak taramasının negatif sonucu, yeni bug değil. Bu HEAD'de tüm backend sıcak yolları profil edilmedi. | B/M |
| D81-04 | Test adında 3 browser modülü yok | `browser-dialogue`, `browser-mini-preload`, `browser-sensitive-keys` doğrudan test adı yok; `R78-06` ile aynı test-borcu. Başka modüllerin dolaylı kapsamını isim sayısından çıkarma. | M/tekrar |
| D81-05 | `settings.json` transaction yolu; renderer localStorage 27 korumasız iddiası | `settings-security` transaction kontratı ayrı. `renderer.js` içinde 63 localStorage erişimi bulundu; eski “27 korumasız” satır-içi sayım outer try/catch'i ayırmıyor. Gerçek Quota/SecurityError repro yapılmadı. Hijyen adayı; sayı doğrulanmış kullanıcı bug'ı değil. | B/M |
| N1 (feed_partial) | `renderer.js` full Home resolve işaretlemeden partial event kapısını açık bırakıyor | Güncel kod `previewRequestId`'yi yalnız partial event'te atıyor; full render'dan sonra geç partial aynı requestId ise overwrite olasılığı var. IPC/event sırası normalde partial→resolve; ters sıralama deterministik test edilmedi. | K |
| N2 (SmartTube close) | `setSmartTubeVisible` / `stCloseBrowser` görünürlüğü yalnız görünürlük değişiminde medya anahtarından hesaplar | Browse açıkken medyanın sonlanmasıyla düğmenin bayat kalıp kalmadığı event zincirinde sınanmadı. Kozmetik koşullu nit; SmartTube smoke videosuz ilk durumu sınar, sonradan medya bitişini değil. | K/M |
| N3 (login flash) | `openYoutubeLogin` istemci durumu çözülmeden önce device/client görünümünü değiştirir | İstemcisiz ilk kullanıcıda kısa device→client flaşı kaynak sırasından mümkün; gerçek pencere zamanlaması ölçülmedi. İşlev kaybı değil, görsel nit. | K/M |
| N4 (cancel yarışı) | `youtubeCancel` fire-and-forget; yeni poll eskisinin ana süreç iptali tamamlanmadan başlayabilir | Main poll/cancel seri sözleşmesinin bu sırada çakıştığı kontrollü IPC testi yok; generation UI'da bayat sonucu engeller. Kullanıcı etkisi kanıtlanmadı. | B/M |
| SL1 | Üretim `browser-preload.js` link intent kopyası, test saf `browser-link-intent.js` | `R76 SL1` ile aynı bakım/test temsil kusuru. Ayrışmış davranış fixture'ı yok. | M/tekrar |
| SL2 | 4 sabit-sıfır telemetri | `R76 SL2` ve `R77 C2` ile aynı kök. | G/tekrar |
| SL3 | Transcript niyet listesinde diakritik girdiler | `R76 SL3` ile aynı; F6 ayrı görünür etki. | M/tekrar |
| SL4 | Üçer normalizeCues/cuesToSrt kopyası | `R76 SL4` ile aynı; ayrı davranış sapması kanıtı yok. | M/tekrar |
| SL5 | Kök artıkları | `R76 SL5` ile aynı; kullanıcı verisi korunuyor. | M/tekrar |

## PROGRAM_BUG_REPORT_82.md

| ID | Kaynak ve erişilebilir tetik | Bu HEAD'deki kanıt / eksik test; kullanıcı etkisi; mevcut test | Karar |
|---|---|---|---|
| B82-01 | `main.js:invidious:login` şifreyi `--password` argv'ye koyar; `backend/invidious.py` argümanı kabul eder | Güncel kaynakta doğrudan görüldü. Yerel süreç listesinde login süresince görünür; gerçek şifre/proses listesi okunmadı. Testler secret-in-argv yasağı koymuyor. Uzak sömürü iddiası değil; yerel sır hijyeni. R81 #5 ile aynı. | G |

## BROWSER_BUG_REPORT_83.md — birinci tur

| ID | Kaynak/tetik; bu HEAD'deki kanıt ve sınır | Kullanıcı etkisi; mevcut test kapsamı | Karar |
|---|---|---|---|
| B83-01 | `browser-cea-checkpoint.js:normalizeCue` captionMode/provenance'ı atar; `browser-subtitles.js:cuePresentationKey` bunları karşılaştırır. Aynı metin/zamanın restore ve çözülmüş biçimi sentetik merge'de iki cue olur. Yeniden başlatılmış gerçek akış çalıştırılmadı. | SRT ve yayında ikiz cue. `browser-cea-checkpoint.test.js` alanların düşmesini bizzat bekler; restore+decode bütünleşimi yok. | G mekanizma; K uçtan uca |
| B83-02 | `main.js:browserTabRuntimeState` dolu `hidden`/`select`/ön-dolu input'u formOrLogin sayar; `browser-tab-resources.js` bunu koruma gerekçesi yapar. Örnek DOM durumu kod koşuluna doğrudan uyar. | Gereksiz kapatma uyarısı/sekme unload reddi. Testler `formOrLogin:true` gerekçesini sınar, formun gerçekten değiştiğini değil. | G |
| B83-03 | `main.js:openBrowserLinkInNewTab` sadece http(s) denetler ve `loadURL` çağırır; userinfo reddeden `decideUrlPolicy` burada yok, `restoredUrl` ham saklanır. Yerel Electron tipleri programatik gezinmeyi engelleyen bir garantiyi kanıtlamaz; gerçek ağ isteği çalıştırılmadı. | Kimlik bilgili URL'nin sekme/oturumda saklanması doğrudan; Basic auth gönderimi ayrıca ağ E2E ister. `browser-controls-behavior.test.js` userinfo içermiyor. | G saklama/policy boşluğu; K ağ etkisi |
| B83-04 | `playback-policy.js` naturalAdvance `delta<1` ister; `main.js` browser medya poll varsayılanı 1000 ms. 1× hız ve tam 1 sn delta sınırda reddedilir; fakat medya-event tetiklemeleri ve <1× hız da var, "asla" sonucu çıkmaz. | Browser auto-pause/loop'un kaçırma riski; tarayıcıda gerçek sınır sayacı E2E yok. Mevcut politika testleri saf senaryo, 1 s poll jitter entegrasyonu değil. | K; mutlak iddia A |
| B83-05 | `browser-media-controller.js:applyAudioPreference` AudioContext'i createMediaElementSource'dan önce kurar; ikincisi atarsa catch yeni context'i kapatmaz. Aynı video elemana gerçekten ikinci source kurulup kurulmadığı site/öğe ömrüne bağlı. | Koşullu context kaybı/ses etkisi. `browser-audio-policy.test.js` throw-enjeksiyonu yapmıyor. | G hata kolu; K frekans |
| B83-06 | `main.js:runBrowserPageTranslationBlocks` yeni job atarken eski job applyChain'in bekleyen batch'leri `pageTranslationJobIsCurrent` kapısından düşebilir; session translations set'i yeni adayları eleyebilir. Promise sırası deterministik harness'le henüz işletilmedi. | Dinamik sayfada çevrilmiş ama uygulanmamış blok. Mevcut scheduler testleri bu old-job/new-job/DOM yarışını kapsamıyor. | K |
| B83-07 | `browser-cue-timeline-calibration.js:shiftCueTimeline` -8 ofsetle [3,5] cue'yu [0,.001] yapar; sonraki normalize bunu en az 80 ms'ye uzatabilir. | Video başlangıcında hayalet satır. Mevcut kalibrasyon testi kısmen kayan ikinci cue'yu sınar; tamamen negatif cue'yu değil. | G |
| B83-08 | `browser-subtitle-search.js` fileId'yi ilk geçerli `files[]` kaydından, fileName'i körlemesine `files[0]`dan alır. İlk kayıt ID'siz, ikinci geçerliyse ikisi ayrılır. | Yanlış dosya adıyla yanlış seçim. Testler tek-dosyalı fixture kullanır. | G |
| B83-09 | `browserTabProtectionReasons` `already_unloaded` üretmez; `main.js` kapatma filtresi bu nedeni muaf tutar. Ancak `browserTabUnloadDecision` aynı etiketi ayrı üretir; "hiç yok" iddiası yanlış. | Viewsiz tab `unknown_state` ise gereksiz onay olabilir; gerçek close E2E yok. Kaynak-string sözleşme testleri bu akışı sınamaz. | G ölü filtre; K kullanıcı etkisi |
| B83-10 | `browser-workflow-recorder.js:normalizeContext(raw={})` null verilince `raw.tabId` TypeError; renderer sekmesiz durumda null döndürebilir. | Playback hata yerine exception verebilir. Testler null context'i değil geçerli context'i kullanır. | G fonksiyon; K UI erişim |
| B83-11 | `browser-link-hints.js` her frame'de ayrı instance; cross-origin parent erişimi ve ESC köprülemesi yok. Odak hangi frame'deyse ESC o frame'e gider; "ikinci örnek kapanmaz" için çapraz-origin frame odak E2E gerekir. | Sıkışmış hint katmanı olasılığı. `browser-link-hints.test.js` script birim, smoke ana-frame; bu senaryo yok. | K |
| B83-12 | `browser-playback-diagnostics.js` 5 s dedupe ile 8/12 s yeniden emisyon eşikleri kullanır; sabit koşul sürerse aynı fingerprint pencereyi aşar. | Tanı geçmişinde ayırt edici olaylar düşebilir. Mevcut testte uzun fake-clock döngüsü yok; etki hacmi rapordaki kadar sabit değil. | G mekanizma; K nicelik |
| B83-13 | `main.js` session.blocks'a yeni `index:hash` ekler; eski ID silen yol bulunmadı. SPA aynı blok metnini değiştirince eski bekleyen blok completion sayımında kalabilir. | "partial" takılması/ölü blok ihracı. Mutasyon→rescan→completion bütünleşik testi yok. | K, güçlü kaynak yolu |
| B83-14 | `browser-page-translate.js` mutasyonda state.originalValues'ı değiştirir, restoreRef `ref.originals` okur. Gerçek text-node mutasyon sırası DOM harness'le yürütülmedi. | Geri yükleme güncel site metnini ezebilir. Sayfa çeviri testleri bu inplace mutasyonu kapsamıyor. | K |
| B83-15 | `browser-translation-scheduler.js:sentenceIdFor` ilk/son cue.id+metin hash'i kullanır; iki özdeş kaynak ID/metin aynı id alır, results Map tek kayıt tutar; sentetik fixture'da çakışma yeniden üretildi. | `completed<total` ve eksik kalıcı çıktı. Testler benzersiz cue ID varsayar. | G |
| B83-16 | `main.js:browser:page:exclusions` observe:true rescan ile bridge emit ve handler pending yolu aynı blok için yarışabilir; zamanlama controlled-Promise repro yapılmadı. | Yinelenen API isteği/maliyet veya düşen iş olasılığı. Mevcut testler eşzamanlı bridge emit'i kapsamıyor. | K |
| B83-17 | `browser-manga.js:layout` iç frame `region` null iken `region.dataset` okur; site DOM'dan sadece iç frame'i silerse doğrudan TypeError. | Overlay yerleşimi donabilir. Manga testlerinde child removal fixture'ı yok. | G koşullu |
| B83-18 | `main.js:library:annotations:toggle` unsave, `matchingLearningAnnotation` null ise yeni fingerprint ID silmeye çalışır. Farklı kayıt ID'si/çoklu zaman adayı fixture'ı işletilmedi. | "silindi" görünüp not yeniden belirir. `security-media-learning.test.js` yalnız tek eşleşen notun mutlu yolunu sınar. | K |

## BROWSER_BUG_REPORT_83.md — ikinci tur

| ID | Kaynak/tetik; bu HEAD'deki kanıt ve sınır | Kullanıcı etkisi; mevcut test kapsamı | Karar |
|---|---|---|---|
| B83-19 | `browser-translation-archive.js:canonicalPageUrl` kendi dar query filtresini kullanır; ortak `browser-sensitive-keys.js` sözlüğüyle eşit değil. Sentetik `hdnts=SYNTHETIC_SECRET` kanonik URL'de kaldı; archive/export çağrıcıları URL'yi taşır. | Paylaşılabilir çeviri arşivinde imzalı oturum parametresi sızıntısı. Testlerde ortak hassas-anahtar kümesini arşiv yoluna yayan fixture yok. | G |
| B83-20 | `browser-adapters.js:persistentBrowserMediaUrl` userinfo'yu silmez; sentetik `https://user:pass@...` çıktı URL'sinde kaldı. `main.js` restoredUrl→watch index/sourceRef yollarını kullanır; gerçek DB dosyası incelenmedi. | Düz metin kullanıcı/şifre kalıcılığı. Adaptör testleri userinfo'yu kapsamıyor. B83-03'ün savunma-derinliği kardeşi. | G kaynak yolu; K gerçek export |
| B83-21 | `main.js:browser:page:exclusions` ardışık `await` sonrası session/generation yeniden denetimi yapmaz; kardeş handler'lar yapar. Navigasyonun tam await arasına denk geldiği Promise kontrollü test yok. | Yeni sayfaya eski çeviri veya arşiv yazımı olasılığı. Mevcut testler bu kuşak yarışını kapsamıyor. | K |
| B83-22 | `main.js:startBrowserPageTranslation` tarama await'inden sonra session hâlâ güncel mi denetlemeden job kurar; start busy kapısı job kurulmadan boştur. İki-start/navigasyon harness'i çalıştırılmadı. | Bayat sayfaya ücretli istek/yanlış ilerleme olasılığı. Testler scan bekleme aralığını kapsamıyor. | K |
| B83-23 | `main.js` loadRetryTimer'ı did-start-navigation'da temizlemez; timer callback'i tab yaşamı dışında URL/generation kontrolü yapmaz. did-stop-loading uygun anda temizleyebilir, bu yüzden kesin çakışma yalnız yeni sayfa yüklenirken. | Kullanıcı gezinmesinin reload ile kesilmesi. Fake-clock + delayed navigation testi yok. | K |
| B83-24 | `ui-locale.js` ignore listesi sekme/yer imi/indirme başlığı kapsayıcılarını dışlamaz; data-ui-untranslated kullanımına erişen işaret yok. Sözlükteki site başlığıyla DOM mutasyonu çalıştırılmadı. | Kullanıcı/site başlığı çevrilip bozulabilir. Locale testleri sabit UI etiketlerini kapsar, dinamik site verisini değil. | K, güçlü kaynak yolu |
| B83-25 | `browser-cue-timeline-calibration.js:normalizeTimelineText('GİDİYORUM')` bu HEAD'de `gi di yorum` verir; Unicode combining dot kelimeyi böler. Eşleşme kalitesinin bütün video üzerindeki etkisi fixture'a bağlı. | TR büyük harfli CEA/site kalibrasyonunda ofset kaçabilir. Testler Türkçe İ/ı varyantlarını içermez. | G normalization; K uçtan uca |
| B83-26 | `renderer.js` sponsor pendingAction'ı bölüm bittiğinde temizleyen kol göstermiyor; click segment.end'e seek eder. Bitişten sonra gerçek UI düğmesinin kalışı DOM E2E ile işletilmedi. | Bayat Atla düğmesi geriye sarabilir. SponsorBlock testleri segment seçimini sınar, bayat buton yaşamını değil. | K |
| B83-27 | `main.js:sweepOrphans` yalnız index.listTrackAssetPaths referanslarıyla çalışır; session/workspace trackRefs bu kümeye katılmıyor. Yaş >30 gün + index'ten düşmüş ama workspace'te bağlı synthetic asset testi yapılmadı. | Kayıtlı çalışma alanının altyazı varlığı silinebilir. Asset-store testleri çift dosya ve orphan temizliği sınar, çapraz depolama referansını değil. | K; veri kaybı potansiyeli yüksek |
| B83-28 | `browser-tab-resources.js` tab.loading'i unload korumasında okur; repo kaynak taramasında tab.loading ataması yok. `main.js` snapshot committed URL'yi alır. | Yavaş navigasyondaki arka sekme eski URL ile geri açılabilir. Unload testleri loading bayrağı elle vererek denetler, gerçek event bağlantısı yok. | G ölü bağlantı; K URL kaybı |
| B83-29 | `main.js:unloadBrowserTab` capturePending'i önce true yapar; finalCheck sonradan başarısız dönerse hook'u yeniden açan kol yok. Eşzamanlı durum değişikliği gerektirir. | Aktif sayfada altyazı yakalama susabilir. Controlled finalCheck değişimi testi yok. | K |
| B83-30 | `main.js` lifecycle='restoring' yazar; restore_failed okur ama atama bulunmadı. Resume erken dönüşlerinde restoring kalma yolu var; doğal event sonunda farklı yaşam döngüsüne geçip geçmediği E2E değil. | Sekme durumunda takılma/unload erişimsizliği. Lifecycle testleri erken dönüş + sonraki event dizisini kapsamıyor. | G ölü hata durumu; K kalıcı takılma |
| B83-31 | `browser-translation-scheduler.js` results.set sonrası onResult atarsa aynı try/catch failure ve ikinci onResult çağrısına gider; ikinci throw için yerel catch yok. Throw-enjeksiyon harness'i henüz çalıştırılmadı. | Tamamlanan işin hata sayılması/unhandled rejection olasılığı. Scheduler testleri atan callback kullanmıyor. | G hata kolu; K sık görülme |
| B83-32 | `main.js:whenIdle().then(runBrowserPageTranslationBlocks)` zincirinde catch yok; dönen Promise reject ederse unhandled olur. Kardeş zincir catch'li. | Hata tanısının eksilmesi/Node ayarına göre ana süreç etkisi. Reject fixture'ı yok. | G hata kolu |
| B83-33 | `workspace-package.js` bundle.sourceRoot ve mappings'e mutlak yerel yollar koyar. Paket gerçek userData kullanılarak dışa aktarılmadı; yapılandırıcı kaynak akışı açık. | Paylaşılan `.wbp` içinde kullanıcı adı/klasör düzeni ifşası. Testler portabiliteyi kontrol eder, yol gizliliğini değil. | G kaynak; K gerçek paket |
| B83-34 | places/session/note atomik yazımı önce eski dosyayı `.bak` yapar. Silme flush'ı sonrası yedekte eski veri kalabilir; tam temizlik sözleşmesi ve özel mod ayrımı ürün davranışı olarak ayrıca görülmeli. | Silinen geçmiş/notun diskte kalması gizlilik riski. `.bak` kurtarma testleri var; temizleme sonrası eski içerik yokluğu testi yok. | G mekanizma; K ürün vaadi |
| B83-35 | `browser-session-privacy.js:clearBrowserSiteData` clearAuthCache çağırmaz, full reset çağırır. Electron auth cache'in site clearData kapsamında olmaması yerel koddan ispatlanamaz; Basic/Digest sunuculu E2E yok. | Site verisi silinse oturumun sürmesi olası. Testler clearAuthCache'in full reset çağrısını sınar, site sonrası 401 akışını değil. | K |
| B83-36 | `browser-textutil.js:decodeSubtitleBuffer` gerçek İzlandaca `það er þýtt orð þýðing þörf` girdisini sentetik probda bozuk Türkçe benzeri metne çevirdi. Python ikiz fixup yolu aynı guard yapısını taşır, Python gerçek probe bu tur yok. | İzlandaca/benzeri dillerde veri bozulması. Textutil testleri yalnız Türkçe mojibake tamirini sınar. | G JS; K Python eşdeğer etki |
| B83-37 | JS ve Python mojibake marker listeleri farklı; ama rapordaki `ÅŞimdi eve git.` geçerli metindir, tamir edilmesi gerektiğinin kanıtı değildir. Gerçek UTF-8→Latin1/1252 bozuk bayt fixture'ı bu tur bulunmadı. | Liste farkı bakım riski; altyazı bozuk kaldı iddiası kanıtsız. Mevcut testler gerçek yalnız-Ş/â fixture'ı kullanmıyor. | A verilen repro / K gerçek kusur |
| B83-38 | `renderer.js` EN modda da sabit `toLocaleString('tr-TR')` / `toLocaleDateString('tr-TR')` çağrılarını kullanır. Liste rapordaki ~14 örnekle sınırlı, tam sayım yapılmadı. | İngilizce UI'de Türkçe sayı/tarih biçimi. Locale testleri sadece etiket çevirisini sınar. | G |
| B83-39 | `styles.css:.browser-page-preview-panel{display:grid}` `[hidden]` UA kuralını override eder; mevcut Chromium repro raporda var ama bu tur Electron paneli açılıp ölçülmedi. CSS kaynak önceliği doğrudan doğrular. | Gizle eylemi panel kutusunu bırakır. Preview DOM testi bu computed-style durumunu ölçmez. | G CSS; K gerçek Electron görünümü |

## Rapor 81 ve 84 için kanonik düzeltmeler

Bu rapor, önceki iki ayıklama belgesini aşağıdaki noktalarda geçersiz kılar veya daraltır:

1. **Rapor 84 tüm kapsamı tek tek taşımıyordu.** R83'ü 39 satırla ele alsa da R76–80 ve PROGRAM 79–82'yi kümelere indirmişti; PROGRAM 81 N2–N4 dahil her numaralı bulgu için ayrı kaynak/tetik/test/etki/kapsam kararı yoktu. Buradaki 126 satır kanoniktir.
2. **R76 S1 kapanmış durumda.** R84 bunu `K` bırakmıştı; güncel merge sentetik revizyonu doğru biçimde iki toplam cue olarak tutuyor ve mevcut toplu revizyon testi bunu koruyor. S2 ayrı, koşullu bir kimlik-zaman sözleşmesi sorunudur.
3. **R77 A1 ve A2 yalnız belirsiz işaret değildir.** Yerel Electron tipleri `mediaKeySystem` olayını doğruluyor ve güncel saf karar bunu blokluyor; `mediaTypes` ise ana süreçte kullanılmıyor. A1'in gerçek Widevine kabulü ve A3'ün sayfa-semantik etkisi yine E2E bekler.
4. **PROGRAM 81'in “8/8 doğru” toplu hükmü fazla güçlüdür.** P79-02 sentetik 240 adayda 240 ratio çağrısı verdi; “her zaman 241” invariant değildir. D81-01'de bazı TR dizgelerin EN tablosunda olmadığı gerçek, fakat “262 kullanıcı-görünür metin” sayısı mekanik taramadır ve DOM görünürlüğü kanıtı değildir.
5. **B83-27 veri-kaybı etkisi doğrudan repro edilmedi.** Referans kümesi eksikliği kaynakta güçlüdür; R84'ün `D` kararı yerine bu rapor strict ölçütte `K` tutar. 30 günlük synthetic asset + workspace/session referansı ile silme testi yazılmadan düzeltildi denmemeli.
6. **B83-37'nin verilen repro'su geçersizdir.** Marker listeleri farklıdır, ancak `ÅŞimdi eve git.` kendi başına bozuk byte kanıtı değildir. Gerçek mojibake bayt fixture'ı gerekir.
7. **R76 smoke belirsizliği güncellendi.** Üç ardışık 20/20 Electron turu V1–V3/T3'ü bugün yeniden üretmedi; eski flake tarihsel kanıt olarak kalır, güncel ürün bug'ı diye aktarılmaz.

## Diğer AI'ya düzeltme için önceliklendirilmiş devir

İlk düzeltme paketi, deterministik `G` satırlarından ve veri/gizlilik etkisi yüksek olanlardan seçilmeli: `R78-01/02/03`, `PROGRAM B80-01`, `B82-01`, `B83-01/02/03/07/08/10/15/19/20/25/31/32/36/38/39`, ayrıca `R76 K1/K2/F1–F7` ve `R77 A1/A2/B2/B3/C1/C3/D1`. Tekrarlı kökler bir kez düzeltilip bütün ilgili satırların testleri eklenmeli.

`K` kararları körlemesine düzeltilmemeli. Önce ilgili satırda belirtilen controlled-Promise, DOM, fake-clock, gerçek Electron ya da zaman-yaşlandırmalı store repro'su kırmızı hale getirilmeli. Özellikle `B83-06/11/13/14/16/18/21–24/26/27/29/30/34/35` için kaynak mantığı makul olsa da kullanıcı etkisi henüz deterministik kanıt değildir.

Ürün koduna bu denetimde dokunulmadı; bu rapor düzeltme commit'i değildir.
