# R815 browser alt denetimi — 15 güncel bağımsız mekanizma

Ürün ve test dosyaları değiştirilmedi; commit/push yapılmadı. Başlangıç/kanıt HEAD `6b3df86e35db8bc3271440f06c779cfb0acb2c22`. 14 bu taramada yeni doğrulanan mekanizma + 1 önceki bilinen P79-04 entegre tekrar. Bunlar yerel kontrollü orijinalkod kanıtıdır; gerçek Windows/native UI, gerçekdiskdoluluğu, canlısite, sağlayıcı/modelkalitesi kabulü değildir. PDF+MHTML source race ve uzantı kalıpları ayrı yüzey diye şişirilmedi.

AGENTS/YENI-BILGISAYAR/güncel 2026-10-30-2349 notu ve ilgili R83/R85/R162/R549 okundu. COVERAGE-REGISTRY.json parse edildi: 1000 senaryo; F15 N0281–N0300 sayfaçevirisi ve F44 N0861–N0880 güvenlik/bridge kapsamı main.js kullanıyor, bu yeni capture/readinglist/runtime sınırlarının aynı senaryosu diye tekrar sayılmadı. Registryde browser-reading-list/browser-feature-services/browser-media-tools için doğrudan kaynak senaryosu yok. Geçmiş PASS güncel başarı sayılmadı.

## Yeniden üretim

```powershell
node .tmp/deep815-browser/probe.cjs
node .tmp/deep815-browser/features-probe.cjs
node .tmp/deep815-browser/runtime-probe.cjs
node .tmp/deep815-browser/ipc-probe.cjs
```

Dördü de exit0 ile beklenen hatalı davranışları doğruladı. Exit0 ürünün düzeldiği anlamına gelmez. Tüm fixturelar bu geçici alt dizindedir. JSON observations dosyaları sentetik veri içerir. Tam test/CI/start.bat/install.bat/GPU/DRM çalıştırılmadı.

## BR01 · P1 — PDF/MHTML dışa aktarımı kayıt diyaloğu sırasında belge değişimini doğrulamıyor

- Kaynak: `src/main.js:9313`, `src/main.js:17608`.
- Kanıt: `probe.cjs / BR-EXPORT-SOURCE-MHTML + BR-EXPORT-SOURCE-PDF`.
- Tekrar: A sayfasında PDF/MHTML dışa aktar; native kayıt diyaloğu pending iken aynı WebContents otomatik B sayfasına gezinsin; seçimi tamamla.
- Gözlenen: İki orijinal fonksiyon da ok:true döndü; A için açılan dosyaya B içeriği yazıldı.
- Beklenen: İşlem A belgesini sabitlemeli veya generation/URL değişimini reddetmeli.
- Erişilebilirlik: browser:archivePage→saveBrowserPageArchive; browser:exportPagePdf→saveBrowserPagePdf; preload ve renderer düğmeleri mevcut.
- Etki: Yanlış belge dışa aktarımı; otomatik sayfa değişiminde özel B içeriği A adı altında paylaşılabilir.
- Yanlışpozitif/tekrar denetimi: PDF/MHTML aynı sahiplik kökü olduğu için TEK bulgu. Kullanıcı diyaloğu açıkken elle gezinme gerekmiyor; site script/redirect yeterli. Capture PNG zaten diyaloğun öncesinde görüntüyü sabitliyor: bu bulgu ona uygulanmadı.
- Geçmiş statü: No same mechanism found in targeted prior report keyword search; root final dedupe required

## BR02 · P1 — Çevrimdışı kopya yenilemesindeki kısmi yazma son sağlam MHTML kopyasını bozuyor

- Kaynak: `src/main.js:17540`, `src/main.js:17575`.
- Kanıt: `probe.cjs / BR-READING-REFRESH-LOSS`.
- Tekrar: Var olan KNOWN-GOOD-ARCHIVE kaydını yenile; native savePage hedefe PARTIAL yazdıktan sonra ENOSPC fırlatsın.
- Gözlenen: API ok:false döndü ama tek arşiv PARTIAL oldu; indeks eski 18 byte metadata ile kaldı.
- Beklenen: Başarısız yenilemede son sağlam çevrimdışı kopya korunmalı; yeni çıktı staging dosyasında doğrulanmalı.
- Erişilebilirlik: readingList:refresh→refreshTarget aynı filePath→saveBrowserPageToReadingList→wc.savePage doğrudan mevcut hedef.
- Etki: İnternet yokken erişilebilen tek sayfa kopyasının geri alınamaz kaybı.
- Yanlışpozitif/tekrar denetimi: Gerçek diski doldurmadık; kontrollü savePage IO kenarı kısmiwrite+reject üretiyor. İndeks _writeIndex atomikliği mevcut ve bu içerik kaybını engellemiyor.
- Geçmiş statü: No same mechanism found in targeted prior report keyword search; root final dedupe required

## BR03 · P2 — Kilitli çevrimdışı kopyanın silinmesi başarı gösterip özel MHTML dosyasını diskte bırakıyor

- Kaynak: `src/browser-reading-list.js:127`, `src/renderer/renderer.js:13781`.
- Kanıt: `probe.cjs / BR-READING-LOCKED-DELETE`.
- Tekrar: Mevcut MHTML unlinkSync işlemini Windows EPERM ile engelle; remove(id) çağır.
- Gözlenen: ok:true, liste 0; MHTML dosyası hâlâ var. _writeIndex tekrar temizliği cleanupWarnings üretiyor ama remove bunu dönüşe taşımıyor.
- Beklenen: Silinmeyen kopya kayıt ve görünür uyarıyla korunmalı; başarı iddiası çıkmamalı.
- Erişilebilirlik: browser:readingList:remove→BrowserReadingList.remove; renderer ok:true üzerine listeyi yenileyip kaydı gizliyor.
- Etki: Kullanıcı sildiğini düşünürken çevrimdışı özel sayfa içeriği kalır; liste kaybolduğu için yeniden silme yolu da kaybolur.
- Yanlışpozitif/tekrar denetimi: Tüm IO hata varsayımı değil: yalnız hedef MHTML unlink EPERM, indeks yazımı normal. Dosyayı sonra silme denemesi de kilit nedeniyle başarısız.
- Geçmiş statü: No same mechanism found in targeted prior report keyword search; root final dedupe required

## BR04 · P2 — Bekleyen çevrimdışı yenileme, kullanıcı tarafından kaldırılan kaydı yeniden diriltiyor

- Kaynak: `src/main.js:17540`, `src/browser-reading-list.js:106`, `src/renderer/renderer.js:13774`.
- Kanıt: `probe.cjs / BR-READING-REMOVAL-RESURRECTION`.
- Tekrar: Yenileme savePage promiseini beklet; aynı listede Sil eylemini tamamla; pending savePage tamamlanıp commit etsin.
- Gözlenen: Silme başarılı olduktan sonra aynı id ve MHTML yeniden ortaya çıktı; liste tekrar 1 kayıt.
- Beklenen: Son kullanıcı silme kararı pending yenileme tarafından geri alınmamalı.
- Erişilebilirlik: Ayrı refresh/remove IPC handlerları kilit/sürüm/tombstone paylaşmıyor; renderer refresh beklerken remove düğmesini disable etmiyor.
- Etki: İstenmeyen veri geri gelişi; silme eyleminin anlamını ve mahremiyeti bozuyor.
- Yanlışpozitif/tekrar denetimi: BR03 dosya silinememe değil: burada remove ve fiziksel silme başarılı; sonraki asenkron commit kaydı yeniden yaratıyor.
- Geçmiş statü: No same mechanism found in targeted prior report keyword search; root final dedupe required

## BR05 · P2 — Tam sayfa yakalama uzun sayfaları sessizce 30.000 CSS piksele kesiyor

- Kaynak: `src/main.js:9207`, `src/main.js:9222`.
- Kanıt: `probe.cjs / BR-CAPTURE-FULL-TRUNCATION`.
- Tekrar: LayoutMetrics için width1000/height45000 dönen belge üzerinde Tam sayfa ekran görüntüsü iste.
- Gözlenen: Page.captureScreenshot clip.height30000 oldu; alt15000CSSpx yok, işlem hatasız devam etti.
- Beklenen: Tam belge veya açık eksik-yakalama/hata bildirimi gerekli.
- Erişilebilirlik: Komut paleti capture-full-page→captureBrowserPageMode→browser:capturePage→captureBrowserFullPage.
- Etki: Uzun makale/transkript/arşivin üçte biri dışa aktarımda sessiz kayboluyor.
- Yanlışpozitif/tekrar denetimi: 45milyon piksel örneği120milyon güvenli bütçenin altında. Sorun sınır olması değil, clampın başarı diye sunulması.
- Geçmiş statü: No same mechanism found in targeted prior report keyword search; root final dedupe required

## BR06 · P2 — Eşzamanlı video yakalamaları kontrol çubuğunu kalıcı gizli bırakıyor

- Kaynak: `src/main.js:9238`, `src/main.js:9268`, `src/renderer/renderer.js:20598`.
- Kanıt: `probe.cjs / BR-CAPTURE-OVERLAP-HIDDEN`.
- Tekrar: İki video/video-captions capture isteğini ilkinin wc.capturePage promisei bitmeden başlat; sırayla tamamla.
- Gözlenen: Başlangıç visibility boştu; iki finally sonrasında ytp-chrome-bottom visibility:hidden kaldı.
- Beklenen: Her operasyon kendi önceki görünürlük listesini restore etmeli veya aynı belge yakalaması seri yürümeli.
- Erişilebilirlik: Komut paleti ve OCR captureFrame aynı fonksiyona ulaşır; screenshot helperı/IPC girişinde busy veya mutex yok.
- Etki: Video oynatma, seek, tam ekran kontrolleri sayfa yenilenene kadar görünmez olabilir.
- Yanlışpozitif/tekrar denetimi: Orijinal hideScript/restoreScript gerçek JSDOM DOM üzerinde çalıştı; ortak __whisperCaptureHidden ikinci operasyon tarafından eziliyor.
- Geçmiş statü: No same mechanism found in targeted prior report keyword search; root final dedupe required

## BR07 · P2 — Kısmen ekran dışında kalan videonun temiz karesine komşu sayfa içeriği ekleniyor

- Kaynak: `src/main.js:9254`, `src/main.js:9258`.
- Kanıt: `probe.cjs / BR-CAPTURE-NEGATIVE-BOUNDS`.
- Tekrar: Videoyu sola100/yukarı80CSSpx taşmış durumda yakala; bounds(-100,-80,640,360), zoom1.
- Gözlenen: Kırpma(0,0,640,360); doğru görünür kesişim(0,0,540,280) olmalı. Sağdan100/alttan80 komşu içerik dahil.
- Beklenen: Rectangle viewport ile video sınırlarının gerçek kesişimi olmalı.
- Erişilebilirlik: Video karesi kaydet/panoya kopyala ve OCR kare al→captureBrowserVideoFrame.
- Etki: Temiz video dışa aktarımı/OCR yanlış görsel alan ve site metni içerir.
- Yanlışpozitif/tekrar denetimi: Pozitif koordinatta zaten sınır clampı var; burada eksik olan negatif sol/üst kısmın genişlik/yükseklikten düşülmesi. Native piksel doğrulaması yapılmadı; orijinal wc.capturePage argümanı kanıtlandı.
- Geçmiş statü: No same mechanism found in targeted prior report keyword search; root final dedupe required

## BR08 · P2 — Başarısız atlama aralığı yazımı bellekte uygulanıyor ve sonraki kayıtta diske sızıyor

- Kaynak: `src/browser-feature-services.js:381`, `src/browser-feature-services.js:391`, `src/browser-feature-services.js:40`.
- Kanıt: `features-probe.cjs / BR-SKIP-FAILED-SAVE-APPLIES`.
- Tekrar: skip-save(idfailed-save,autoskiptrue) için writeFileSync EACCES ver; skip-list yap; IO normale dönünce bağımsız good-save ekle.
- Gözlenen: İlk API ok:false; skip-list failed-save içerdi; sonraki başarılı kayıtta diskte failed-save+good-save var.
- Beklenen: Başarısız yazma belleği geri almalı; kullanıcıya başarısız denen mutasyon sonradan uygulanmamalı.
- Erişilebilirlik: browser:extras skip-save/skip-delete önce data().records mutasyonu sonra save(); catch yalnız hata dönüşü.
- Etki: Kullanıcının kaydedilmediğini düşündüğü aralık videoyu otomatik atlatabilir; yeniden açılışta beklenmedik kayıt kalır.
- Yanlışpozitif/tekrar denetimi: Sadece fixture IO enjeksiyonu; gerçek izin değiştirilmedi. BrowserSeriesContext ayrı copy-on-write kullanıyor; bulgu ona genellenmedi.
- Geçmiş statü: No same mechanism found in targeted prior report keyword search; root final dedupe required

## BR09 · P1 — Ana belgedeki değişmiş checkbox ve geçerli contenteditable taslakları kapatma/boşaltmada korunmuyor

- Kaynak: `src/main.js:16058`, `src/main.js:16064`, `src/main.js:16069`.
- Kanıt: `runtime-probe.cjs / BR-UNLOAD-CHECKBOX-FILE-EDITABLE`.
- Tekrar: Başlangıç unchecked checkboxı checked yap ve <div contenteditable> içinde kaydedilmemiş yazı bırak; runtime ölç ve unload kararı al.
- Gözlenen: stateKnown:true,formOrLogin:false,dirtyDraft:false; allowed:true.
- Beklenen: Değişmiş onay/seçim ve gerçek düzenlenebilir taslak kullanıcı onayı olmadan kaybolmamalı.
- Erişilebilirlik: browserTabRuntimeState hem browser:tab:close hem unloadBrowserTab tarafından kullanılır; close wc.close(waitForBeforeUnload:false).
- Etki: Form seçimleri ve yazılı taslak onaysız kaybolabilir.
- Yanlışpozitif/tekrar denetimi: Top textarea positivecountercheck korumayı tetikliyor. checkbox/radio/file tamamen atlanıyor; [contenteditable="true"] yalnız exactattribute yakalıyor, boşattr/plaintext-only desteklenmiyor. Bu tür seçimi açıkları TEK bulguya toplandı. R83 B83-02 ters yöndeki falsepositiveydi.
- Geçmiş statü: No same mechanism found in targeted prior report keyword search; root final dedupe required

## BR10 · P1 — Iframe ve shadow DOM içindeki kaydedilmemiş form/taslaklar güvenli boşaltma taramasına girmiyor

- Kaynak: `src/main.js:16052`, `src/main.js:16056`, `src/main.js:16103`.
- Kanıt: `runtime-probe.cjs / BR-UNLOAD-CHILD-DOM`.
- Tekrar: Sameorigin iframe textarea içine kullanıcı metni yaz; open shadowroot içine contenteditabletrue taslağı ekle; runtime ölç.
- Gözlenen: Topdocument querySelectorAll ikisini de görmedi; stateKnown:true ve unload allowed:true.
- Beklenen: Alt belge/komponent kapsamı ölçülmeli; ölçülemeyen düzenleme alanı güvenli diye kabul edilmemeli.
- Erişilebilirlik: Aynı çalışma durumu probu unload ve tabclose korumasının yetkili kaynağı.
- Etki: Gömülü formlar/modern webcomponent editörleri kapama veya bellekten boşaltmada onaysız veri kaybeder.
- Yanlışpozitif/tekrar denetimi: BR09 başka kök: burada desteklenen textarea/contenteditabletrue türleri kullanıldı; yalnız belge/ağaç sınırı görünmez. Sameorigin fixture, çaprazorigin erişim varsayılmadı.
- Geçmiş statü: No same mechanism found in targeted prior report keyword search; root final dedupe required

## BR11 · P2 — Videonun sağtık menüsündeki Döngü/Oynat eylemi sağtıklanan medya yerine en büyük medyaya gidiyor

- Kaynak: `src/main.js:6112`, `src/main.js:6141`, `src/renderer/renderer.js:14503`.
- Kanıt: `runtime-probe.cjs / BR-CONTEXT-MENU-WRONG-MEDIA`.
- Tekrar: İki duraklatılmış görünür video aç (küçük200px/büyük800px); küçük video üzerinde nativecontextmenu Loop seç.
- Gözlenen: Menu bridge yalnız key:media-loop gönderdi, srcURL/koordinat/hedef yok. Orijinal controller scriptinde küçük.loopfalse,büyük.looptrue oldu.
- Beklenen: Bağlam menüsü eylemi kullanıcının sağtıklayıp açtığı öğeye uygulanmalı.
- Erişilebilirlik: installBrowserContextMenu→browser-shortcut→renderer browserCommand→bestmedia seçimi.
- Etki: Kullanıcı yanlış videoyu oynatır/döngüye alır/PiP açar; çok videolu sitelerde kontrol belirsizleşir.
- Yanlışpozitif/tekrar denetimi: Global player toolbarı için enbüyük video seçimi geçerli olabilir; bu bulgu yalnız öğeye özel contextmenu. Gerçek menuitem model ve controller scripti dinamik çalıştırıldı.
- Geçmiş statü: No same mechanism found in targeted prior report keyword search; root final dedupe required

## BR12 · P1 — Dışa aktarma uzantı ekleyince kullanıcı tarafından seçilmemiş mevcut hedefin üzerine yazabiliyor

- Kaynak: `src/main.js:17620`, `src/main.js:9328`, `src/main.js:9306`, `src/main.js:17854`.
- Kanıt: `ipc-probe.cjs / BR-EXPORT-SUFFIX-OVERWRITE`.
- Tekrar: SaveDialog filePath olarak chosen-name.txt dönsün; chosen-name.txt.pdf önceden sentinel içersin; PDF kaydını tamamla.
- Gözlenen: Seçilen hedefchosen-name.txt iken actualchosen-name.txt.pdf üzerine NEW PDF yazıldı; API ok:true.
- Beklenen: Nihai hedef diyalog/overwrite izninin gösterdiği hedef olmalı veya değişince ayrıca varlık/üzerineyazma onayı alınmalı.
- Erişilebilirlik: saveBrowserPagePdf,saveBrowserPageArchive,saveBrowserPageCapture,subtitleexport uzantı ekleme kalıbı; tek ortak rootpattern.
- Etki: Ayrı mevcut PDF/PNG/MHTML/altyazı dosyasının kullanıcı seçmeden üzerine yazılması.
- Yanlışpozitif/tekrar denetimi: Finaltarget için ayrıca fs.exists/overwriteconfirm kapısı yok. Native Windows diyalogunun özel dosyaadını döndürmesi bu tur UI ile denenmedi; APIresult kontratı kontrollü döndürüldü. Gerçek disk sentinel overwrite doğrulandı.
- Geçmiş statü: No same mechanism found in targeted prior report keyword search; root final dedupe required

## BR13 · P1 — Sekme kapanışında ilk form kontrolünden sonra capture drain beklerken yazılan taslak son kontrolden geçmiyor

- Kaynak: `src/main.js:15492`, `src/main.js:15507`, `src/main.js:15529`.
- Kanıt: `ipc-probe.cjs / BR-CLOSE-LATE-DRAFT-LOSS`.
- Tekrar: Boş aktifsekme close başlat; ilk runtime kontrolü false dönsün; drainBrowserCaptureBeforeClose beklerken kullanıcı taslak yazsın; drain tamamla.
- Gözlenen: runtime ölçümü1kez; typedAfterInitialChecktrue, destroyBrowserTab çalıştı, APIok:true.
- Beklenen: Asenkron kapanış hazırlığı biterken form/draft/job koruması yeniden doğrulanmalı.
- Erişilebilirlik: browser:tab:close queuedtransition; runtime kontrolü drain öncesi; destroy sonrası check yok.
- Etki: Kapanış düğmesinden sonra sayfada devam eden kullanıcı girdisi onaysız silinir.
- Yanlışpozitif/tekrar denetimi: unloadBrowserTab aynı sınırda ikinci runtime/finalCheck yapıyor; bugclosea özgü. Queue sekme geçişini seri kılar, sayfaDOM kullanıcı/script olaylarını kilitlemez.
- Geçmiş statü: No same mechanism found in targeted prior report keyword search; root final dedupe required

## BR14 · P2 — Harici oynatıcı native başlatma hatası yutulurken API başarı döndürüyor

- Kaynak: `src/main.js:17474`, `src/main.js:17476`, `src/main.js:17478`.
- Kanıt: `ipc-probe.cjs / BR-EXTERNAL-PLAYER-FALSE-SUCCESS`.
- Tekrar: Çözülen mpv/VLC yolunu spawn et; child asenkron error(EACCES/ENOENT/ENOEXEC) yayımlasın.
- Gözlenen: Handler önce ok:true döndü; child error listener boş; kullanıcıya başarısızlık bildirimi yok.
- Beklenen: Başarı child spawn olayından sonra, hata error olayından sonram oluşmalı.
- Erişilebilirlik: player:external IPC→resolveExternalPlayerPath→spawn; renderer dışoynatıcı eylemi.
- Etki: Kurulu ama çalışmayan/izin engelli/çözümdensonrasilinmiş oynatıcıda işlem açıldı sanılır; tanı ve kurtarma kaybolur.
- Yanlışpozitif/tekrar denetimi: Eksik executable için erken exists kontrolü var; bulgu native spawnın daha sonra bildirdiği hataya özgü. Gerçek kişisel oynatıcı çalıştırılmadı/bozulmadı.
- Geçmiş statü: No same mechanism found in targeted prior report keyword search; root final dedupe required

## BR15 · P2 — Kalıcı anlamsal worker düzeltmesi caller her istekte yeni factory kurduğu için tekrar model süreci yaratıyor

- Kaynak: `src/browser-feature-services.js:172`, `src/browser-feature-services.js:345`, `src/browser-media-tools.js:113`, `src/browser-media-tools.js:206`, `backend/browser_media_tools.py:88`.
- Kanıt: `features-probe.cjs / BR-SEMANTIC-WORKER-NO-REUSE`.
- Tekrar: Aynı tab/serviste iki ardışık semantic-search çağır; orijinal media-tools factory içinde spawnları say.
- Gözlenen: İki başarılı arama2ayrıworker spawnladı; herfactory kendi worker/10dakikaidletimerına sahip.
- Beklenen: Sonraki arama aynı servisin hazır semantik işçisini kullanmalı.
- Erişilebilirlik: browser:extras semantic-search→tools()→createBrowserMediaTools→pythonServe→ensureWorker.
- Etki: Her arama yeni Python/SentenceTransformer yüklemesi ve10dakika gereksiz eşzamanlı süreç tutma maliyeti yaratır.
- Yanlışpozitif/tekrar denetimi: ÖNCEKİ BİLİNEN: R85 P79-04; R162 modüldeki kalıcıworkerı temiz saymış fakat callerı doğrulamamış. Yeni keşif diye sayılmamalı; yeni dinamik entegrekanıtla güncel açıktekrar. Gerçek modelMB/süre ölçülmedi; büyüklük iddiası yok.
- Geçmiş statü: existing-reverified-R85-P79-04

## Kanıt dosyaları ve sınırlar

`observations.json`, `features-observations.json`, `runtime-observations.json`, `ipc-observations.json`, ortak `findings.json`. Sourcehashler ortakJSON metadata alanında. İlk featuresprob tekrarında önceki fixture idleri vardı; URLglobalini ekledikten sonra eski yanlışoriginfixture ile çakışma testdüzeneği assertionı üretti. Fixture klasörleri her koşuda mkdtemp olarak ayrıldı, güncel koşu doğru https origin ile exit0. Bu testdüzeneği hatası ürünbugı sayılmadı.
