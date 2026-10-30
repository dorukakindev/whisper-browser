# CEA kalan kapsam denetimi — yalnız rapor

HEAD `df94b3d60b7123a682cd0062371bbb2850a5fb60`; Windows Node v24.22.0. Ürün düzeltmesi yok. İki bağımsız P2.

`node .tmp/rem815-cea/probe.cjs` (repo kökü); isteğe bağlı `R815_CEA_OUT` çıktı klasörü. Sonuç `output/results.json`. Probe ASSERTleri hatalı davranış ve karşı kontrolleri sabitler; exit0 düzeltme başarısı değildir. `.tmp` dışına yazmaz (R815_CEA_OUT verilirse seçilen çıktı köküne yazar). Ağ/DRM/hesap/anahtar yok. Kaynak ve fixture SHA sonuçta. İlk deneme Git child-process EPERM nedeniyle durdu; probe artık `.git/HEAD`/ref salt okunur çözerek kesin HEAD kaydeder. İki geliştirme denemesi alias eksikliği giderilerek tamamlandı; ürün hataları bu harness sorunları değildi.

## REM-CEA-01 · P2 — Kayan HLS penceresi tam CEA yakalamanın zaman kökenini geriye kaydırıyor ve yanlış SRT complete oluyor

**sources:** `src/browser-subtitles.js:572–578,687–689` Her playlist parse çağrısı elapsed=0 ile pencereye göre start üretir.; `src/browser-cea-full-capture.js:15–20,40–44` Aynı sequence yenilenmiş bütün segment nesnesiyle değiştirilir; örtüşen global başlangıçlar korunmaz ve yeni pencere ötelenmez.; `src/browser-cea-captions.js:82–92` fMP4 cue zamanını doğrudan options.start ile eşler.; `src/main.js:10863,10991,11610–11628,10482–10638,10941–11079` Gerçek manifest/yeniden deneme tüketicileri merge kullanır; main capture→store→full capture kayıt/complete yoludur.

**reproduce:** Repo kökünden node .tmp/rem815-cea/probe.cjs. 120sn üç parçalı açık HLS seq0..2 başlat; ikinci kapalı pencere seq1..3 ve aynı URI/discontinuity kimlikleriyle birleştir. Gerçek mux.js fMP4 fixture decode ve main capture/store/run final çağrılarını çalıştır. İlk tur tüm0..2 tamamlandıktan sonra resume da ayrıca doğrulanır.

**expected:** İlk görülmüş kaynağın zaman kökeninde seq0..3 başlangıçları0,120,240,360 olmalı; aynı seq1/2 sırf pencere kaydı diye yeniden zamanlanmamalı, yeni seq3 önceki sonun ardından gelmeli.

**observed:** Yeni birleşik plan başlangıçları0,0,120,240; yeni iş gerçek decode/store sonucu aynı. Önceki0..2 tamamlanmış bellek-içi devamda0,120,240,240 ve seq3=240; tüm4 sequence completed, planDuration480, complete=true ve gerçek final.srt yazımı. Kümülatif seq0..3 kapalı liste karşı kontrolü0,120,240,360 ve complete.

**cause:** Defter kimliği doğru kalırken pencereye göre yerel zamanlar global/ilk-pencere zamanları gibi kullanılıyor. merge yenilenmiş URLyi alırken start dahil nesneyi kopyalıyor; kesişen sequence üzerinden zaman ofseti türetilmiyor.

**impact:** Kayan/sona eren HLS kaynağında tam SRT ve downstream çeviri yanlış sahne zamanına yerleşir; eksiksizlik sayacı/süre toplamı bunu fark etmeden başarılı bildirir.

**prior:** R58-05/R59 matcher yenilenmesi, F-99-1 sequence kimliği, R99 büyüyen ancak başı kaymayan pencere testleri ayrı köklerdir ve korunur. B48-1/B49-1 nonzero decode epoch/site kalibrasyonundan farklıdır. R815-B85/B86 DASH, B87–89 TTML, B39/B40/B66 WebVTT; aynı kök yok. Night1000 doğrudan3 CEA modülü kaynak eşleşmesi0; main40 tarihsel imza F15/F44 genel kapsamdır.

**limits:** Windows Node modül/gerçek main fonksiyon çıkarımı; ağ, Electron, CDP dispatcher, native TextTrack, gerçek site, hesap, DRM, GPU, model ve fiziksel video oynatma çalıştırılmadı. Fetch yalnız paket içindeki sentetik fixture Buffer döndürüyor. Ürün, test, belge veya Git değişikliği yapılmadı. Fixtureda her segmentin timestamp epochu sıfırdır ve açık DISCONTINUITY ile izinlidir; aynı içerikli119sn mux fixture120sn EXTINF ile kullanılır. Aynı playlist/aynı URI/aynı sequence tutulur; varyant değişimi veya DRM iddiası yok. Manifest yenilenme dispatcheri baştan sona çalıştırılmadı; gerçek merge çağrıları kaynakta incelendi ve gerçek full-capture tüketicisi çalıştırıldı.

**acceptance:** Üç parçalı kayan pencerede örtüşen sequence startları korunmalı, yeni segmentler aynı global çizgiye eklenmeli. İlk segmentleri tamamlanmış retry ve henüz başlamamış merged active-plan yollarında final SRT0,120,240,360 olmalı; yenilenen imzalı URL, F99 kimliği ve açık liste tamlık engeli korunmalı.

**Birincil standart dayanağı:** [Kayan listede baştan kaldırılan segmentler MEDIA-SEQUENCE artırılarak bildirilir.](https://www.rfc-editor.org/rfc/rfc8216#section-6.2.2); [Timestamp sequence değişimi açık DISCONTINUITY ile bildirilir; fixture bunu yapar.](https://www.rfc-editor.org/rfc/rfc8216#section-4.3.2.3)

## REM-CEA-02 · P2 — Kalibre CEA checkpoint geri yüklenince ham replay ile karışıp aynı konuşma çift zamanlı final SRT oluyor

**sources:** `src/main.js:10916–10922,11029–11041,11127–11161` Kısmi işte kaydırılmış buffer+transform kaydedilir; startup ikisini yükler, decoder replay ham çizgiyi üretir.; `src/main.js:10594–10629,10081–10099` Yeni decoded cues job.timeTransforms uygulanmadan aynı stream bufferında merge edilir.; `src/browser-cea-checkpoint.js:31–80,83–110,128–146` Kimlik metadata ve timeTransform kaydı korunur; gerçek dosya kaydet/yükle kullanıldı.; `src/browser-cue-timeline-calibration.js:21–56` Aynı metnin candidate sayısı2 olduğunda benzersiz eşleşmeler kaybolur; final yeniden kalibrasyon reddedilir.

**reproduce:** Aynı probun checkpoint bölümü. Paket içindeki gerçek MPEG-TS CC1 fixture2 cue; yerel referans fixture -2sn (tüm cue0..6sn içinde); ek geniş-ofset varyantı+10sn. Gerçek runBrowserHlsCeaFullCapture açık playlist sonunda calibrate ve persist çağırır. Yeni VM/decoder/buffer ile gerçek startBrowserHlsCeaFullCapture checkpoint dosyasını yükleyip kapalı6sn planı baştan replay eder; gerçek store ve final SRT yazımı çalışır.

**expected:** Kabul edilmiş sıfır-dışı dönüşüm yeniden çözülen cue dahil tutarlı uygulanmalı veya replay ham çizgisi ayrı tutulup son kez dönüşüm uygulanmalı; aynı iki konuşma yalnız kalibre zamanlarda bulunmalı.

**observed:** Ana geçerli6sn kontrolünde -2sn dönüşüm kabul edilir; iki referans cue da0..6sn içindedir. Replay sonrası2 yerine3 cue, ilk satırın bitişi2.903 yerine4.903sn, ikinci satırın hem2.903 hem4.903sn kopyaları, final kalibrasyon insufficient-evidence ve complete vardır. Ek sentetik geniş-ofset kontrolünde ilk kısmi capture2 cue +10sn kalibre edip gerçek checkpointte offsetSeconds10 saklar. Restart startup transform10 yükler ama raw2.167/4.903sn ile restored12.167/14.903sn aynı streamde birleşir:4 cue. Final calibrateCueTimeline reason=no-unique-match, state=complete, final.srt4 cue. Aynı replay identity ve offset0 checkpoint karşı kontrolü2 cue; ilk cue metadata alanları da korunuyor.

**cause:** Kalibre snapshot ile ham decoder replay farklı zaman uzaylarıdır. job.timeTransforms yalnız persist/restore metadata yolunda kullanılır, captureBrowserHlsCeaSegment yeni cue zamanlarına uygulamaz. Replay eski snapshotı aynı streamden önce silmez/yerine koymaz. Duplicate metinler sonraki otomatik kalibrasyonu da engeller.

**impact:** Kesinti/yeniden başlatma sonrası çift altyazı, yanlış erken replikler ve iki kopyaya ayrı downstream çeviri oluşabilir; uygulama tam/başarılı sayarken final dosya bozulur.

**prior:** B83-01 eski captionMode/provenance alan kaybı düzeltildi; bu prob o alanları koruyup offset0 dedupe geçtiğini gösterir. R339/kuyruk50 madde25–27 yalnız transformun roundtrip metadata kontrolleri; R49 kalibrasyon ilk turlarda doğru çalışır. R815-B42 backend diarization/speaker devamı ayrı ürün hattı; B83-S2 cueId revizyonu değil, CEA cue kimliksiz time-space bileşimidir. 126 R815 mapping incelendi, aynı kök yok.

**limits:** Windows Node modül/gerçek main fonksiyon çıkarımı; ağ, Electron, CDP dispatcher, native TextTrack, gerçek site, hesap, DRM, GPU, model ve fiziksel video oynatma çalıştırılmadı. Fetch yalnız paket içindeki sentetik fixture Buffer döndürüyor. Ürün, test, belge veya Git değişikliği yapılmadı. Native referans snapshot sınırı sentetik kaydırılmış gerçek decoded fixture ile beslenir; gerçek TextTrack veya process kill yapılmadı. Yeni VM/decode maps restart sınırı simülasyonudur. Store merge/kalibrasyon/checkpoint/startup/full-capture fonksiyonları gerçektir; yayım downstream dosya deposu ve scheduler kontrollüdür. -2sn temel fixture ve+10sn ek varyant gerçek siteye sabit ofset önerisi değildir; +10 varyantındaki referanslar6sn dışındadır ve geçerli süre içindeki -2sn kanıtına ek strestir.

**acceptance:** Kabul edilmiş sıfır-dışı offsetli kısmi checkpoint→yeni decoder replay→final SRT, yalnız iki özgün cueyu kalibre zamanlarda içermeli. Sıfır-offset ve captionMode/provenance metadata roundtrip karşı kontrolleri korunmalı; tekrar edilen replay ikinci kez ofset eklememeli.

## Kapsam ve dışlananlar

126 önceki mapping `coverage.json` içinde aynen korunur; Night1000 üç CEA modülü exact-source eşleşmesi 0, main kaynağı 40 tarihsel imza (F15/F44), bunlar yeniden koşulmadı. Tam ID/family/mechanism/signature matrisi `coverage.json`.

| Yeni kök | Önceki kapsam | Yeni invariant | Kalan sınır |
|---|---|---|---|
| REM-CEA-01 | R58-05, R59, F-99-1, R99, B48-1, B49-1 | Örtüşen sequence aynı global sunum zamanını korur; yeni pencere için yerel0 başlangıcı global0 değildir. | fixture/VM; gerçek Electron/site yok |
| REM-CEA-02 | B83-01, B83-S2, R49, R339, R815-B42 | Kalibre snapshot/ham replay aynı streamde aynı zaman uzayında merge edilir; metadata saklamak transformu uygulamak değildir. | fixture/VM; gerçek Electron/site yok |

Dışlananlar: R58 HTTP status/matcher/GAP ve R51 SERVICE/BYTERANGE/SKIP/sıralama: Önceki düzeltilmiş mekanizmalar; yeni bug sayılmadı. R815 DASH/TTML/WebVTT/asset bulguları: 126 kayıt tüm mapping ve ana raporla karşılaştırıldı; hedef dışı parser kökleri tekrar edilmedi. 708 uzun decoder state, eksik track, byterange/AES özel biçimleri, limits: Somut bağımsız hata bu tur doğrulanmadı; kalan kapsam; test edilmemiş site/standard davranışı bug sayılmadı.

## Ayrı öneri

CEA zaman çizgisi kökenini yakalama kanıtında göster: Pencere başlangıcı, global ankraj, checkpoint transformu ve uygulanan/ham durum görünür olursa bozuk tamlık teşhisi kolaylaşır. Bug toplamına katılmaz.
