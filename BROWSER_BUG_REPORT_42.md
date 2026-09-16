# Browser Bug Raporu 42 — 10-ajan derin denetim turu

Tarih: 2026-09-16
Başlangıç ürün kodu: `35be4e0` (çalışma ağacında commit'siz kullanıcı CEA-kalıcılık çalışması vardı — dokunulmadı)
Kapsam: daha önce denetlenmemiş 10 bölge — `backend/transcribe.py` derinliği, backend yardımcı betikler, CEA-608/708 çözücü iç mekanizması, altyazı parser'ları + ağ yakalama, son düzeltme commit'leri (taze göz), Node yardımcı modülleri, ayarlar/oturum/kalıcılık, yerel player çekirdeği, sekme/view yaşam döngüsü kenarları, sayfaya enjekte kod.
Yöntem: 10 paralel salt-okunur ajan; tüm kritik bulgular bu raporda satır seviyesinde yeniden doğrulandı. Ana ürün kodu değiştirilmedi (test dosyasında tek onarım var — aşağıda).

## Bu turda kapanan / doğrulanan eski bulgular

| Bulgu | Durum |
|---|---|
| B38 (align subprocess timeout) | Düzeltilmiş — `browser-alignment.js:47-48` kill+clamp |
| B52 (ANSI↔UTF-8) | Ana senaryo düzeltilmiş — tüm betiklerde `sys.stdout.reconfigure('utf-8')` + `PYTHONIOENCODING`; kalıntılar B139-B140'da |
| B53 (catalog_scan çöküş/junction) | Düzeltilmiş — `onerror`, `islink`+reparse filtresi |
| B54 (O(n×m) align) | Düzeltilmiş — iki-işaretçi sweep |
| B57 (CEA retry-wait iptal kilidi) | Düzeltilmiş — `cancelled` bayrağı + `clearTimeout` |
| B67 (open-link mainFrame) | Düzeltilmiş — `senderFrame` kapısı |
| B73 (mini-player hide) | Düzeltilmiş — `mini.owns` muafiyetleri |
| B101 (izin kapanış sıralaması) | Düzeltilmiş — `closing=true` önce, 4 yolda iptal |
| B43 (.wbp rewrite yolu) | Düzeltilmiş — root-containment |
| B49/B50/B46 | Kısmen/çoğunlukla düzeltilmiş (kalıntılar aşağıda) |
| B30/B31 | `.bak` ve budama eklendi; artık senaryolar ayrıca raporlandı |
| B51 (extras smoke kırık) | **Bu turda onarıldı** — test tek satır; rapor tamamen yeşil |
| transcribe.py tarihsel (B-6..M-9 serisi) | Ajan doğruladı: resume-merge sıralaması, VTT zaman, lang-suffix, LLM fence, wrap_text, re-export, watch re-queue, BOM, atomic save — hepsi kapalı |

## Test onarımı (ana kod değil)

`tests/electron-browser-extras.smoke.js:64` — `browserFeatures.open=true` panele dokunuyordu ama panel ancak `sideTab==='tools'` iken görünür; width assert'i `0` dönüyordu (B51'in güncel biçimi). `setSideTab("tools")` eklendi → smoke gerçek Electron'da **tamamen yeşil**: skips CRUD, UI kayıt/silme, semantic search, OCR kare+okuma, ASS yükleme, sahne listesi, mini-player. Bu dosya commit'e ayrı alınabilir.

---

## Doğrulanmış bulgular (B106+)

### P2 — yüksek etki

**B106 | P2 | main.js:7001-7004, 8816, 9309-9316 — Sahte `__whisperCaptureQueue` girdisi aynı-origin'e KİMLİKLİ kör GET**
Sayfa JS'i kuyruğa doğrudan nesne basabilir (bypass `push` sınırları); drain yalnız `captureId` ister, girdi üreten karenin origin'i kaydedilmez. `fetchBrowserBuffer` `credentials:'include'` kararını **üst-frame origin'i ile hedef origin eşitliğine** göre verir → cross-origin düşmanca iframe, kurban origin'indeki keyfi URL'leri (ör. GET-CSRF uçları) kullanıcının oturum çerezleriyle çağırır; `$Number$` şablonu ile amplifikasyon. Yanıt sayfaya dönmez ama sunucu-taraflı yan etki çalışır. *B66'nın kalan çekirdek vektörü — rapor 30'da "yalnız public/kör" diye küçümsenmişti; aynı-origin credentialed yol açık.*
Plan: (1) drain her girdiye `location.origin` eklesin; (2) `credentials:'include'` yalnız girdi-karesi-origin = hedef = üst-frame iken; (3) varsayılanı `credentials:'omit'` yap, kimlikli fetch'i CDP `requestId` doğrulamalı URL'lere kısıtla.
Regresyon: sahte iframe girdisi + same-origin hedef → `session.fetch` `credentials:'omit'` ile gitmeli.

**B107 | P2 | main.js:8091-8107 — `adoptBrowserStreamMediaIdentity` gövde doğrulamadan ÖNCE çalışıyor**
`isHls=false` (sahte `.mpd`/mime) veya `#EXT-X-MEDIA:` içeren sahte m3u8 kapıyı geçer → `deriveStreamMediaIdentity` yeni kimlik → mevcut sekmenin altyazı durumu silinir (`resetSubtitles`, 3933-3957). Geçerlilik kontrolü 8102'de SONRA çalışır — geçersiz gövde de zehirler. Her drain turu aktif altyazıyı silebilir.
Plan: adoption'ı `hasExpectedManifestRoot && isCompleteManifestBody` sonrasına taşı.
Regresyon: sahte MPD enjekte et → `streamMediaId` ve `subtitleSelection` değişmemeli.

**B108 | P2 | main.js:9315-9316 — kuyruk `body` boyutu Buffer tahsisinden ÖNCE kontrolsüz**
`Buffer.from(entry.body,'utf-8')`/`bodyBase64` sınırsız — kancadaki `MAX_TEXT=2MB` sınırı yalnız `push()` içinde; doğrudan `queue.push()` onu atlar. `browserCapturePayloadAllowed` kontrolü Buffer'dan SONRA (8014). Tur başına 32 girdi × keyfi boyut → çok-GB bellek churn.
Plan: drain betiğinde `body.length` sınırı + main'de 9315 öncesi aynı kontrol.
Regresyon: büyük sahte girdi → `ack` + atlanmalı, Buffer tahsis edilmemeli.

**B109 | P2 | main.js:2413-2418 + workspace-package.js:6 — `.wbp` ile yerleştirilen oturum dosyası sessiz altyazı grant'i üretiyor**
`restoreBrowserSessionState` her `subtitleSelection.primaryFile/secondaryFile`'a `subtitleFileAccess.grant` veriyor — onaysız. `browser-session.json` `.wbp` ROOTS'unda; `validate()` yalnız `media-catalog.json`'u derin doğruluyor; `package-apply` → `restorePackage` → `app.relaunch()` → grant kalıcı. Grant `media:readSubtitle` (tam metin) VE `media:writeSubtitle`'i kapsıyor. `.wbs` paketleri bu alanları bilinçle ayıklıyor — `.wbp` yolu modelin kendi sınırını aşıyor.
Plan: restore'da `grant` çağırma; ilk kullanımda `authorizeSubtitleFile` diyaloğu (tercih-yolu davranışıyla aynı) veya yalnız uygulama-üretti `browser-subtitles/` yollarını otomatik bağla. `workspace-package.validate`'e `browser-session.json` alan temizliği.
Regresyon: crafted `.wbp` içe aktarımı → restart → `media:readSubtitle` hedef dosyada izin diyaloğu çıkmalı.

**B110 | P2 | backend/transcribe.py:5523-5628 — `segment_metrics` paralel dizisi mutasyonlarda senkronu kaybediyor**
`entries`/`segment_metrics` append'te 1:1; sonra `recover_punctuation_collapse` (5569), `merge_resumed_entries` (5596 — K kayıt öne eklenir → TÜM indeksler kayar), `sort` (5606), `dedupe` (5612), `fix_common_errors` (5619) metrik dizisini güncellemeden `entries`'i mutasyona uğratıyor. `find_repeated_hallucinations` (4244-4265) post-mutasyon indeksle borçlu satır okur → `metric_risk` yanlış → tekrar-halüsinasyon delete↔warn kararı yanlış satırla verilir; `write_json` (5942) `len` eşitliği yeşilken metrikler yanlış segmente yazılır. Tüm yollar varsayılan-açık.
Plan (ajan önerisi): metriği entry içine taşı (en sağlam) veya her metric'e orijinal `seg_start/seg_end` yazıp midpoint-join; minimal: pre-mutasyon koştuysa `segment_metrics=None`.
Regresyon: `merge_resumed_entries` + sahte metriklerle `find_repeated_hallucinations` çağır → metrik-risk borçlanmamalı.

**B111 | P2 | backend/pipeline_control.py:263-294 — kısmen yazılmış backup, sağlam final'in üstüne restore ediliyor**
`commit()` içinde `shutil.copy2(final, backup)` disk-dolu/IO hatasında **kısmi .bak** bırakır → `rollback()` `backup.exists()` → `_replace(backup, final)` → sağlam final kesilmiş/korrupt yedekle ezilir. `recover_output_transactions` aynı desen (163-167). Veri kaybı.
Plan: backup'ı `tmp + os.replace` ile atomik yaz; veya entry'ye `backup_ok` bayrağı — rollback yalnız onu restore eder.
Regresyon: `copy2` mock'u ENOSPC ile yarım yazsın → `commit()` sonrası final değişmemeli.

**B112 | P2 | browser-subtitles.js:1274 — kendi-kendine kapanan `<p/>` sonraki cue'yu yutuyor**
`([^>]*)` self-closing `/`'yi de yer → `<p begin="5s" end="8s"/>` açık-tag sanılır, `[\s\S]*?` sonraki `</p>`'ye koşar → kardeş cue'nun open-tag'i inner'a karışır, kendisi tamamen kaybolur. Yayın TTML/DFXP'te boş/region-clearing `<p/>` yaygın. `cleanCueText` `<p>`'yi bilinen-etiket listesinde taşımıyor → ham markup cue metninde kalır.
Plan: eşleştirmeden önce self-closing `text|p` etiketlerini düşür.
Regresyon: `<p begin="5s" end="8s"/><p begin="9s" end="10s">x</p>` → 2 cue.

**B113 | P2 | browser-subtitles.js — tembel `[\s\S]*?</tag>` kalıbı kapanmamış etikette O(n·m) main-process DoS**
`cleanCueText` rt/rp (46), `\{\\[^}]*\}` (42 — başta `}` + N tane `{\` karesel), `<span>` (1293/1297 kapaksız), ve DASH MPD regex'leri (BaseURL/Period/AdaptationSet/SegmentTimeline/Representation/SegmentList ~14 nokta) belge-sonu taraması yapar. Kapanmamış etiketli ~1MB crafted MPD → onbinlerce açık-tag × belge boyu → saniyeler-dakikalar main-process donması; manifest retry döngüsüyle tekrarlanır. Ağdan VE B106 sahte-girdi yolundan ulaşılabilir.
Plan: `parseXml`'deki "ilk kapanmamışta kes" ön-taramasını tüm scope regex'lerine genişlet veya tag-balance sayımı; `cleanCueText` için doğrusal tarama.
Regresyon: 50k kapanmamış `<AdaptationSet>` MPD → parse <1sn dönmeli.

**B114 | P2 | browser-subtitles.js:903-914 + 978-995 — sınırsız `$Time$` matcher'ı `presentationTimeOffset` taşımıyor**
Matcher nesnesinde `presentationTimeOffset`/`segmentTime` alanı yok; `dashSegmentOffset` `variable==='time'` kolunda `periodStart + value/timescale` — PTO çıkarılmıyor (sınırlı yolda 985 doğru yapıyor). Canlı/dinamik MPD'de PTO devasa olabilir → cue'lar uzak geleceğe kayar, asla gösterilmez.
Plan: matcher'a `presentationTimeOffset` ekle; 'time' kolunda `(value - PTO)/timescale`.
Regresyon: PTO=3600, timescale=1, `$Time$`=3601 → cue ≈1s olmalı, 3601s değil.

**B115 | P2 | main.js:10196-10205 — split-ikincil sekme crash'inde yeni view hiç görünmez**
`render-process-gone` → `recreate-once` → `ensureBrowserView` yaratır ama layout yalnız `tab.id === browserActiveTabId` iken çağrılır (10201). İkincil sekme çökünce yeni view gizli kalır; 10179'daki `removeChildView` sırasında birincil view'in split bounds'u da yarım kalır → sağ panel kalıcı boş.
Plan: koşulu `tab.id === browserActiveTabId || tab.id === browserSplitSecondaryTabId` yap.
Regresyon: split B'yi çökert → 1sn sonra sağ yarıda canlı view.

**B116 | P2 | main.js:10179 — mini-player'a taşınmış sekme çökerse yanlış pencerede belirir**
`mainWindow.contentView.removeChildView(view)` — mini-owned view aslında **mini pencerenin** contentView'unda → throw yutulur → çökmüş view mini'de kalır. Recreate `ensureBrowserView` yeni view'i **ana** pencereye ekler; `mini.owns` hâlâ true → `mini.layout()` ana pencerede 0,0 köşesinde yüzen view.
Plan: crash'ta `mini.owns(tab)` ise önce `mini.close()`; view'in gerçek ebeveynini `mainWindow` varsayma.
Regresyon: mini'deki sekme çökert → mini'de yeniden doğmalı.

**B117 | P2 | main.js:11482 + 10482-10512 — `browser:hide` kuyruksuz; uçan hide yeni view'i pause'lar**
`hideBrowserView` await'leri global `browserView`'i her satırda yeniden okur. browser→player→browser hızlı geçişte hide'un devamı yeni aktif view'de `captureToggle(false)` + `detachBrowserDebugger` + medya pause çalıştırır → görünür browser'da video durmuş, debugger kopuk.
Plan: `browser:hide`'ı `queueBrowserTabTransition`'a al veya `browserVisibilityEpoch` sayacı + her await sonrası `browserVisible===false` kontrolü.

**B118 | P3 | main.js:14845-14881 — `burninStartPending` kilidi onay diyaloğundan SONRA kuruluyor**
Yorum "İlk await öncesi kilidi al" diyor ama gerçek ilk await'ler 14850-14851'deki `authorize*` çağrıları — native onay saniyelerce açık. Bu pencerede ikinci `burnin:start` 14845 kapısını geçer → iki ffmpeg aynı deterministik `tempPath`'e yazar → `burninJob` ezilir, ilk iş öldürülemez, kurtarma kaydı üzerine yazılır.
Plan: kilidi 14845'in hemen ardına taşı + try/finally; renderer'da düğme invoke süresince disable.
Regresyon: grant'siz girdide diyalog açıkken ikinci tık → "zaten çalışıyor".

**B119 | P1 | browser-cea-captions.js:52 + main.js:7251-7258 — sıfır-olmayan PTS/tfdt kökeni tüm cue'ları şaşırtıyor**
`keepOriginalTimestamps:true` mux.js'te ham PTS zamanı verir (upstream PR #228). `cuesUseLocalSegmentTimeline` yalnız iki durumu ayırt eder; üçüncü durum — keyfi köken O (canlı PCR başlangıcı, 33-bit wrap, fMP4 tfdt epoch) — cue'lar `O+position`'a düşer, local testinden geçemez ama absolute dalda **değiştirilmeden** saklanır → SRT `01:01:00`'den başlar, oynatmada hiç görünmez. Canlı HLS/broadcast/fMP4'te yaygın.
Plan: decoderKey başına köken takibi — cue'lar `[start, start+2·dur]` penceresinin dışındaysa `ptsOrigin = firstCue.start - segment.start` tahmin et, çıkar; discontinuity'de sıfırla.
Regresyon: PTS≈3600s'lik TS parçası + segment.start=60 → cue ~60-66s bandına inmeli.

**B120 | P2 | main.js:10297-10299 + 7174-7295 — CDP yolu segmentleri ağ-tamamlanma sırasıyla çözüyor**
Kuyruk `decoderKey` serileştirir ama ekleme sırası `captureBrowserHlsCeaSegment` çağrı anı — `getBrowserCapturedResponseBody` CDP round-trip'i sıralamayı bozar; oyuncular 2-3 parça önden indirir. `segment.sequence` hiç okunmuyor → roll-up/pop-on durum makinesi sıra dışı beslenir.
Plan: decoderKey başına `(discontinuity,sequence)` sıralı tampon + bounded head-of-line bekleme (2-4sn), sonra gap'li decode.
Regresyon: seq2'yi seq1'den önce kuyruğa sok → çıkış sırası 1,2.

**B121 | P2 | browser-cea-captions.js:106-112 + main.js:7130 — `EXT-X-BYTERANGE` parçaları son matcher'a çöküyor**
`ceaUrlKey` yalnız origin+pathname; tek-dosya VOD playlist'inde tüm parçalar aynı URL → `matchHlsCeaSegmentUrl` sondan ilkini (son matcher) döndürür → her range yanıtı son parçanın zamanıyla çözülür + `hlsCeaSegmentFetchKey` aynı seq'i üretir → `fetchedSegments` ilk geldikten sonra hepsini düşürür → **tek bayt aralığı çözülür, geri kalanı sessizce kaybolur**. Sorgu-adresli parçalar (`?sq=N`) da çöker.
Plan: birden çok matcher aynı urlKey'deyse `Content-Range` başlığıyla disambigüe et; sorgu-adresinde seq-param eşleşmesi.
Regresyon: tek URL + iki `BYTERANGE` → iki parça da doğru seq ile çözülmeli.

**B122 | P2 | browser-subtitles.js:494-608 — `#EXT-X-SKIP` ayrıştırılmıyor → AES-128 implicit IV kayıyor**
LL-HLS delta playlist'inde `SKIPPED-SEGMENTS=N` ilk listelenen parçanın seq'ini `mediaSequence+N` yapar; parser bilmiyor → `decryptHlsAes128` her parçaya YANLIŞ IV → CBC çöp → sıfır altyazı (sessiz).
Plan: `EXT-X-SKIP` + `EXT-X-GAP` ayrıştır; seq'e N ekle; gap parçalarını plandan çıkar.
Regresyon: MS=100 + SKIP=3 + KEY(IV'siz) → ilk parça seq=103 IV'siyle çözülmeli.

**B123 | P2 | main.js:7238-7245 — sıfır-cue'lu parça "tamamlandı" sayılıyor → görünmez altyazı boşlukları**
Decode'dan `[]` dönmesi (bozuk TS, 200-OK HTML hata gövdesi, senc/cbcs, EXT-X-MAP'siz m4s, altyazısız aralık) `completed`'a yazılır → `complete` raporlanabilir. Bütünlük yalnız toplam cueCount>0 ister.
Plan: decode öncesi kap formu doğrula (TS `0x47` sync / fMP4 box imzası) → hata = fail/retry; arka arkaya K sıfır-cue parçası `planReason='no-captions'` uyarısı.
Regresyon: HTML gövdeli parça → `failed` sayılmalı.

### P3 — orta etki

**B124 | P3 | browser-tab-resources.js:21 — `tab.loading` hiç atanmıyor**
`browserTabProtectionReasons` `tab.loading` okur; main.js'te yazan yer yok (snapshot `wc.isLoading()` kullanır, kayıt değil). Yüklenen arka-plan sekmesi boşaltılabilir → uçan yükleme öldürülür, `restoredUrl` bayat kalır.
Plan: `browserTabRuntimeState`'e `loading` ekle veya `wc.isLoading()` kontrolü.

**B125 | P3 | main.js:10419 — `restore_failed` değeri hiçbir yerde yazılmıyor**
Okuma var (10419, renderer 10855), yazma yok → `loadURL` hatasında `lifecycle='restoring'` sonsuz kalır → sekme kartı takılır, unload adayı göremez.
Plan: `resumeRestoredBrowserPage` catch'inde `restore_failed` + `tabs-changed`.

**B126 | P3 | renderer.js:11064-11076 — izin istemi sekme değişiminde kapanmıyor**
`tabs-changed` `browserPermissionRequest`'i temizlemiyor → A'nın prompt'u B üstünde görünür; "İzin ver" A'ya izin verir. `settleBrowserPermissionRequest` aktif-sekme denetimi yapmıyor.
Plan: prompt'u sekme değişiminde kapat; settle'a `pending.tab.id === browserActiveTabId` kapısı.

**B127 | P3 | main.js:9879 — izin timeout olayı `requestId` taşımıyor**
Timeout `permission-denied`'i requestId'siz gönderir → renderer tabId-eşleşmesiyle kapatır → aynı sekmenin ikinci istemi de yanlışlıkla kapanır.
Plan: timeout event'ine `requestId` ekle.

**B128 | P3 | main.js:11355-11360 — split kapatıldığında ikincil ses durmuyor**
Disable kolu yalnız id/layout; `hideBrowserView`'daki ikincil-pause ve aktivasyondaki `previous` pause burada koşmaz → gizlenen sekme ses çalmaya devam eder.
Plan: disable kolunda eski secondary'ye pause script'i.

**B129 | P3 | main.js:3394-3400 — fullscreen layout kolu `mini.owns` muafiyetsiz**
Normal dalda `mini.owns(active) ||` var (3408), fullscreen dalında yok → mini'li sekmede sayfa fullscreen olunca view gizlenir → mini boş.
Plan: aynı muafiyeti fullscreen dalına ekle.

**B130 | P3 | main.js:11505-11530 — `browser:navigate` görünürlüğü koşulsuz açıyor**
Kuyruksuz handler `browserVisible=true` + `view.setVisible(!occluded)` — hide yarışında player UI üstünde chrome'suz web view kalabilir.
Plan: transition kuyruğuna al veya `browserVisible` adımını koşullandır.

**B131 | P3 | main.js — unload→restore sonrası `tabMuted`/`readerActive` uygulanmıyor**
`setAudioMuted` yeni wc'ye hiç uygulanmıyor; `readerActive` unload'da sıfırlanmıyor → UI susturulmuş/reader gösterir, sayfa değil.
Plan: `ensureBrowserView`/restore'da yeniden uygula.

**B132 | P3 | main.js:10154-10206 — crash bayrakları temizlenmiyor**
`mediaPlaying`/`audible`/`fullscreen`/`pictureInPicture`/`formOrLogin`/`dirtyDraft` crash'te sıfırlanmıyor → ölü sekme "ses oynuyor" diye unload'dan korunmuş görünür.
Plan: crash handler'da altı bayrağı sıfırla.

**B133 | P3 | browser-cea-full-capture.js + main.js:7671 — tam CEA yakalamasında parça sayısı sınırsız**
Normal playlist yakalama 1600'e keser; tam-yakalama planı kesmiyor → 50k sahte parçalı manifest + kullanıcı onayı = sınırsız indirme (eşzamanlılık 4, ≤12MB).
Plan: sert üst sınır (ör. ≤4000) + aşımda `partial`.

**B134 | P3 | main.js:6946-6963 — DNS doğrulama ↔ `session.fetch` arasında TOCTOU**
`assertPublicBrowserSubtitleUrl` `dns.lookup` ile doğrular; fetch kendi çözümlemesini yapar → rebind DNS private'a döner → doğrulanmış host intranete kör GET. B106/F4 sayfa-kontrollü URL kaynağıyla birleşir.
Plan: yanıtın uzak adresini doğrulanan public-IP kümesiyle yeniden denetle.

**B135 | P3 | main.js:13517-13523 — tarama onayı ilk 3 kökü gösteriyor**
`roots.slice(0,3)` + "… ve N öğe daha" — kullanıcı gizlenen kökleri görmeden onaylar; hepsi grant'lenir ve yol listesi renderer'a döner.
Plan: >3 kökte tam liste veya native seçiciye yönlendir.

**B136 | P4 | main.js:13461-13490 — onaylı kökteki junction kapsam dışına çıkıyor**
`walk` her girdiyi `realpath` ile çözer; kök içindeki dışa-işaret junction izlenir → onaylanmamış dizindeki medya grant'lenir. (Önceden yerleştirme gerekir.)
Plan: çözülen çocuğun onaylı kökte kaldığını doğrula (`isPathInside`).

**B137 | P2 | backend/catalog_scan.py — surrogate'li dosya adı tüm taramayı çökertiyor**
NTFS eşleşmemiş UTF-16 izin verir; `print(json.dumps(..., ensure_ascii=False))` strict-utf8 stdout'a basarken `UnicodeEncodeError` → tek dosya tüm klasörü öldürür.
Plan: `reconfigure(errors="replace")` + `os.fsdecode`.

**B138 | P3 | backend/io_errors.py:48-54 — `403`/`429` çıplak substring eşleşiyor**
`(?:http error\s*)?429` → metin içindeki herhangi bir "403"/"429" (video id, port) yanlış sınıflandırma.
Plan: `http error\s*(403|429)` bağlamını zorunlu kıl.

**B139 | P3 | backend/media.py:191 — `audio_lang` yt-dlp DSL'sine sanitize'siz giriyor**
`bestaudio[language={audio_lang}]` — renderer-değeri format selektörünü değiştirebilir (kod çalıştırma değil, seçim manipülasyonu).
Plan: BCP-47 whitelist regex'i.

**B140 | P3 | backend/live_asr.py:14 + main.js:6584 — stdin ANSI kod çözüyor, env'siz spawn**
Yalnız stdout reconfigure; stdin satırları ANSI ile okunuyor → UTF-8 JSON'daki non-ASCII temp yolu mojibake → her chunk "dosya yok" → canlı ASR ölü. Spawn'a env de yok → secret'lar + PYTHONPATH mirası.
Plan: `stdin.reconfigure('utf-8')` + `pythonRuntimeEnv`/`withoutSecretEnv` kalıbı.

**B141 | P3 | browser-alignment.js:31, browser-media-tools.js:11, nmdb-catalog-import.js:67, browser-video-analysis.js:8-12, main.js:13875/14153 — yardımcı spawn'larda env scrub tutarsız**
`WHISPER_TRANSLATE_API_KEY` 3 yerde silinmiyor; `browser-video-analysis`/`export_anki`/`model_benchmark`/`live_asr` env'siz — parent env aynen miras. Kanonik `withoutSecretEnv` (settings-security.js:719-728) hepsini kapatır.
Plan: tüm yardımcı spawn'ları `withoutSecretEnv`+`PYTHONIOENCODING` kalıbına çek.

**B142 | P3 (dormant) | backend/export_anki.py:93-118 — `_stage_media` keyfi yerel yolu .apkg'ye gömüyor**
Uzantı/boyut var ama yol allowlist'i yok → not store'a yazabilen yol `C:\Users\...\x.png` referansı paylaşılabilir arşive kopyalar; grant modelini bypass. Şu an bu alanları dolduran kod yok.
Plan: `source`'un app-owned dizinde olmasını şart koş.

**B143 | P3 | browser-textutil.js:84-91 — mojibake onarımı >U+00FF karakterleri sessizce bozuyor**
`Buffer.from(text,'latin1')` yüksek kod noktalarını düşük bayta kırpar (`♪`→`*`, `ğ`→0x1F); kabul kriteri yalnız işaret sayısını kıyaslıyor → `subs:shift` bozuk metni diske geri yazıyor. Python `errors="strict"` ile toptan reddeder — ayrışma (CLAUDE.md aynı mantığı şart koşuyor).
Plan: metinde `codePoint>0xFF` varsa onarımı atla (Python parity'si).

**B144 | P3 | media-catalog-store.js:11-15 — UNC `//srv` ve `\\?\UNC` formları geçiyor**
Regex yalnız düz `\\` reddeder; `//evil/share` ve `\\?\UNC\` kabul → nMDB/`.wbp`-kökenli afiş yolu IntersectionObserver ile OTOMATİK yüklenir → outbound SMB/NTLM, jestisiz.
Plan: `^[\\/]{2}` ve `^[\\/]{2}[?.]` formlarını reddet; `imageFor`'a kanonik denetim.

**B145 | P3 | main.js:11711-11757 — SponsorBlock gövde-stall'unda asılı kalma**
7sn timer `response` başlığında temizleniyor; gövde deadline'ı ve `error`/`aborted` dinleyicisi yok → promise çözülmez; `sponsorBlockInFlight` aynı anahtarın sonraki çağrılarına aynı asılı promise'i döndürür.
Plan: `response.on('error'/'aborted')` + toplam deadline.

**B146 | P3 | browser-cea-captions.js:52 — CEA-708 multibyte karakter seti çözülmüyor**
mux.js'e `encoding`/`captionServices` geçirilmiyor → Korece/Japonca 708 servisleri mojibake.
Plan: mux.js 6.3.0'ın desteklediği seçenekleri dil-bilinçli geçir (node_modules kurulunca doğrula).

**B147 | P3 | main.js:7177-7186 — 'retry-wait' penceresi CDP varışlarını işin decoder'ına sızdırıyor**
Koruma yalnız 'running'/'refreshing'i kapsıyor; retry-wait'te gelen parça shared decoder'da çözülür ama `job.completed`'a yazılmaz → resume'da erken parçalar geç gelenden SONRA çözülür — pause tasarımının önlediği tam da bu.
Plan: koruma listesine 'retry-wait' ekle.

**B148 | P3 | main.js:10245-10258 — geniş-yol her `.ts`'i master decoder'ına besliyor**
Matcher'sız `.ts` yanıtı `sequence:null,start:0` ile 'master|0' decoder'ına → yabancı TS (reklam/önizleme/ikinci video) cue'ları ana izi kirletir; `clearBrowserHlsCeaFullCaptureState` master-prefix'li decoder'ı temizlemez.
Plan: geniş yolu playlist-origin ön-ekine kısıtla veya matcher'lar varken kapat; master-prefix decoder'ı da temizle.

**B149 | P3 | main.js:7210-7219 — şifreli EXT-X-MAP implicit-IV önbellek zehirlenmesi**
`initKey` seq'siz; uyumsuz playlist'te (şifreli init, IV'siz) ilk parçanın seq'iyle yanlış decrypt → `browserHlsCeaInitializations`'a kalıcı çöp → tüm fMP4 parçaları sıfır cue.
Plan: decrypt sonrası init'i probe et (`ftyp`/`moov`); başarısızsa çözülmemiş dene.

**B150 | P3 | browser-network-capture.js:4 — 12MB gövde sınırı gerçek video parçalarının altında**
10sn @ >9.6Mbps parça limiti aşar → `EBROWSER_UNSAFE_RESPONSE` terminal → yüksek-bitrate HLS'de tam yakalama asla `complete` olamaz (tam da CEA'nın yaygın olduğu içerik).
Plan: CEA medya-parçası sınırını ~64MB'a çıkar (eşzamanlılık 4 sınırlı).

**B151 | P3 | browser-cea-full-capture.js:151-161 — tek kalıcı-bozuk parça sonrası TÜM parçaları blokluyor**
`shouldPause:()=>true` her hata sonrası bekletir; 3 pas sonrası hâlâ kötüyse kalan ~900 parça hiç denenmez → 'partial'. Resync yolu yok.
Plan: 3. pas hatasında decoder reset + gap işareti + devam; completeness'a gap bildir.

**B152 | P3 (özellik boşluğu) | main.js:8113-8119 — master-olmayan HLS'de CEA hiç aranmıyor**
`detectHlsCea608` yalnız master'daki `CLOSED-CAPTIONS` bildirimine bakar; tek-media-playlist akışında `browserHlsCeaActive` hiç kurulmaz.
Plan: master yoksa birkaç `.ts` parçasında GA94/cc_data magic tara; pozitifse sentetik CC1 izi.

**B153 | P3 | browser-cea-captions.js:114-119 — fMP4'te geniş-yol yok**
`.ts` için broad fallback var, `.m4s` için yok → CDN host-değişimi (`ceaUrlKey` origin dahil) fMP4 akışında sıfır yakalama.
Plan: geniş yola `video/mp4`+styp/moof imzası ekle veya host'tan-bağımsız pathname+origin-allowlist eşleşmesi.

**B154 | P3 (spekülatif) | browser-cea-captions.js:49-60 — bozuk parça kalıcı durum makinesini kirletiyor**
mux.js parity'siz cc baytları roll-up/pop-on belleğini bozar; decoder discontinuity'ye dek kalır. node_modules yok — upstream doğrulaması gerek.
Plan: anlamsız çıktı oranı yüksekse decoder'ı karantina/reset.

**B155 | P3 | browser-subtitles.js:573 — `#EXT-X-GAP` parçaları normal medya gibi indiriliyor**
Tag yoksayılıyor → plan onu fetch'ler → 404 → `failed`/`missing` → 'partial'da kalır + boşa denemeler.
Plan: `gap:true` ayrıştır; plandan çıkar, completeness'ta tamam say.

**B156 | P3 | browser-subtitles.js:402,453 — tırnaklı `TYPE="SUBTITLES"`/`"CLOSED-CAPTIONS"` kaçıyor**
Regex `"` toleransız; `manifest-transactions.js:62` toleranslı → manifest "var" der, iz listesi boş → boşa retry + "iz bulunamadı".
Plan: `TYPE\s*=\s*"?(?:SUBTITLES|CLOSED-CAPTIONS)"?`.

**B157 | P3 | main.js:3893-3897 — `browserTrackStreamKey` imza-param listesi eksik**
`policy|key-pair-id|hdnts|hdnea|exp|hmac|acl|x-amz-*` düşürülmüyor → her manifest yenilemede dönen imza yeni streamKey → aynı mantıksal iz N ayrı iz/`.srt` yayını. `VOLATILE_STREAM_PARAM_RE` (browser-media-identity.js:5) hepsini kapsıyor.
Plan: o regex'i yeniden kullan.

**B158 | P3 | browser-subtitles.js:957-971 + main.js:8152,7140 — yanıt başına lineer matcher + regex derleme**
Her `responseReceived`'de 10-20k matcher × `new RegExp` + `findIndex`/`JSON.stringify` dedupe → yoğun sayfada O(n²).
Plan: literal matcher'ları `Map<url,…>`'e; şablonları tek derlenmiş RegExp'te sakla.

**B159 | P3 | browser-subtitles.js:1292-1297 — zamanSIZ kardeş span metni siliniyor**
`outsideText` TÜM `<span>` çiftlerini siler; yalnız zamanlı olanlar cue olur → zamansız span metni kaybolur.
Plan: yalnız zamanlı span'leri sil.

**B160 | P3 | browser-subtitles.js:335 — görünmez U+2060 ASS unescape regex'lerini öldürüyor**
`/\\([{}])\u2060/g` ve `/\\\u2060/g` — desen `\{`+U+2060 gerektirir → hiç eşleşmez → `\{`,`\}`,`\\` cue metninde kalır (dosyada literal word-joiner var, doğrulandı).
Plan: `/\\([{}])/g` ve `/\\\\/g`; dosyada başka U+2060/U+200B tara.

**B161 | P3 | main.js:6917-6934 — parça başına tam-birleştirme + fingerprint + join O(n²)**
Uzun canlı akışta her store: `mergeBrowserStreamCues` O(n) + her cue'da `cleanCueText`+`JSON.stringify` + tam-metin `join` → on milyonlarca işlem.
Plan: artımlı fingerprint (kuyruk farkı), hash akışı.

**B162 | P3 | browser-subtitles.js:1612 — moof→mdat `top.slice(i+1).find()` O(top²)**
mdat'sız crafted mp4 (~1.5M kutu @12MB) → ~10¹² karşılaştırma.
Plan: monoton ileri imleç.

**B163 | P3 | browser-subtitles.js:822,918,922-930,953 — tek bozuk alt-eleman tüm MPD'yi çökertiyor**
10k-aşımı/byterange/timeline throw'ları tüm matcher setini reddeder → transaction hatası → retry yanması.
Plan: rep/adaptation başına try/catch; manifest throw yalnız tamamen-işlenemezde.

**B164 | P3 | main.js:1404-1487 — `settings.json` `.bak`'sız; bozulma tüm ayarları sessizce siliyor**
Parse hatası → `{glossary:[]}` + uyarı yok; `writeJsonAtomic` yedek üretmez. Benzer her depoda `.bak` var — settings tek dışarıda.
Plan: yazmadan önce parseable primary'yi `.bak`'a kopyala; fallback'te `settingsLoadWarning`.

**B165 | P3 | settings-security.js:351-358 + secret-store.js:190-223 — `clearedSecretFields` yedek içe aktarımından sağ çıkıyor → saklı API anahtarlarını siliyor**
İçe aktarımda alan ayıklanmıyor → sonraki save'de `for (const f of cleared) delete next[f]` → anahtarlar kalıcı silinir, promptsuz.
Plan: `!allowSecrets` iken `clearedSecretFields`'ı düşür.

**B166 | P3 | media-catalog-service.js:140 — katalog `play` sessiz medya grant'i veriyor**
`inspectMedia`+`grantMedia`, diyalogsuz; `.wbp`-kökenli `media-catalog.json` `local` kaynağı herhangi bir mutlak yol olabilir. Geçmiş/kütüphane akışları `authorizeMediaFile` prompt'u isterken bu istisna.
Plan: `play`'i `authorizeMediaFile`'a yönlendir.

### P4 — düşük etki / hijyen / spekülatif

- **B167 | P4** `catalog_scan.py:36` — tek `guessit` istisnası toplanan tüm satırları kaybettirir; dosya-döngüsüne try ekle.
- **B168 | P4** `catalog_scan.py:25` — `os.walk` özyinelemeli ~990+ derinlikte `RecursionError`; derinlik sınırı.
- **B169 | P4** `catalog_scan.py:37-43` — `episodes`/`season` tip varsayımı; int'e zorla/reddet.
- **B170 | P4** `main.js:11796` — nMDB subprocess'e `signal` bağlanmıyor (abort ölü kod); iptal kanalını bağla.
- **B171 | P4** `process-io.js` — üretimde ölü; main.js ayrışmış satır-içi kopya (out sınırsız, stderr tüketimsiz); birleştir.
- **B172 | P4** `watch-index.js:24-34` — `safePageIndexUrl` query'yi siliyor → `?v=A` ile `?v=B` aynı anahtar → indeks ezilmesi.
- **B173 | P4** `browser-adblock.js:72-75` — motor önbelleği atomik değil (tmp+rename).
- **B174 | P4** `main.js:12273` — `browser:session:export` atomik değil.
- **B175 | P4** `workspace-package.js:124` — `before-restore-<ts>.wbp` budanmıyor (yalnız `before-restore-complete-*` 3'e iniyor).
- **B176 | P4** `media-catalog-store.js` — birincil bozuk + `.bak` yoksa katalog ölü; `.corrupt-<ts>` karantinası.
- **B177 | P4** `main.js:1631-1652` — bozuk `watch-index.sqlite` oturum boyunca öldürüyor; karantina+yeniden-deneme.
- **B178 | P4** `browser-sponsorblock.js:66` — >2h videoda segment-süresi üst sınırı devre dışı; mutlak sınır.
- **B179 | P4** `main.js:15707` — `app.exit(0)` restart tüm shutdown flush'larını atlıyor + sahte "çöktü" uyarısı (`cleanExit:false`).
- **B180 | P4** `renderer.js:4194-4206` — `beforeunload` flush'ı normal kapanışta ulaşılmaz (`destroy()` unload üretmez); son ~400ms ayar/kuyruk kaybı.
- **B181 | P4** üç depo bozuk-primary'yi sağlam `.bak` üzerine kopyalıyor (`writeQueueState` 1199, `browser-translation-cache.js:116`, `browser-note-store.js:105`); `.bak`'tan önce doğrula.
- **B182 | P4** `history.json` parse hatasında sessizce `[]`; `.bak` yok.
- **B183 | P4** `browser-translation-archive.js:201` — indeks bozuksa tüm arşiv yetim; `.bak`.
- **B184 | P4** `main.js:1441` — `loadSettings` `settings.json`'u sanitize etmeden alıyor (elle-düzenlenmiş endpoint → sonraki kullanımda anahtar oraya gider); yüklemde de endpoint/enum doğrula.
- **B185 | P4** `main.js:7467-7503` — 'retry-wait' CDP sızıntısı (B147 ile aynı kök); ayrıca `manifestResourceRecovery` ~60sn'de süresiz yeniden deniyor (deneme üst sınırı).
- **B186 | P4** `main.js:8091` — discovery-signal aynı-faz tekrarları dedupe'siz → `capture-status` spam (~12.5/sn/kare).
- **B187 | P4** `media.py:365` — `traceback` renderer'a iletiliyor (yerel yol sızıntısı); `media:event`'te soyutla.
- **B188 | P4** `browser_video_analysis.py:29-41` — kare-başına `Image.open` try'siz; bozuk kare aralığı öldürür.
- **B189 | P4** `browser_video_analysis.py:118` — stdin 1MB'da sessizce kesiliyor; `limit+1` okuma kalıbı.
- **B190 | P4** `browser-cea-full-capture.js:3-8` — `sequence:null`→`'0:0'` kimlik çöküşü (latent).
- **B191 | P4** `browser-cea-captions.js:8-10` — `normalizeCaptionText` PAC girintisini siliyor (konum bilgisi kaybı).
- **B192 | P4** `main.js:8115` — `browserHlsCeaActive` son-master-kazanır; çok-master sayfada yanlış plana bağlanabilir.
- **B193 | P4** CEA kaynak kenarları — 64-decoder eviction çalışan decoder'ı silebilir; 20k fetchKey eviction çift-besleme; init önbelleği ≤256MB; `decodeFragmentedMp4` her parçada init'i yeniden probe ediyor.
- **B194 | P4** `main.js:12017` — `capture:setEnabled` kapalıyken pending yayın timer'ları temizlenmiyor → ~650ms sonra kapalıyken `subtitle-found` gidebilir.
- **B195 | P4** `main.js:10245` — geniş CEA matcher `.ts` uzantılı TypeScript/asset dosyalarını yakalıyor → boşa parse; `params.type` süzgeci veya `0x47` sync-byte kontrolü.
- **B196 | P4** `browser-network-capture.js:5` — 30sn TTL yavaş 12MB yanıtları düşürüyor (bilinçli trade-off; manifest sınıfı için uzatılabilir).
- **B197 | P4** `main.js:1052` — `watch:start` ilk taramada raw `dir` kullanıyor, periyodikte canonical `target`; anahtar uyumsuzluğu tek-tur gereksiz yeniden-stat.
- **B198 | P4** `renderer.js:14956` — gömme iptali "hata" olarak raporlanıyor (`type:'error'`); `cancelled` ayrımı.
- **B199 | P4** `renderer.js:17172` — `playPlaylistDelta` bayat intent'te bile `video.play()`; `openLocalMedia` boolean döndürmeli.
- **B200 | P4** `renderer.js:15419` — `mediaKeyFor('local')` kanonikleştirmiyor (junction/8.3/`..` ayrı anahtar → konum/playlist bölünmesi).
- **B201 | P4** `renderer.js:21767` — `applyOffsetToFile` yazma mandalısız (batch-yazım uçuşuyla yarış).
- **B202 | P4** `renderer.js:17098` — `closePlayer` video kaynağını bırakmıyor (handle/bellek).
- **B203 | P4** `main.js:10419`+ — kuyruklu handler'lar `mainWindowClosing` denetimsiz (`tab:create`/`tab:close`/`tab:activate`); kapanış drain'iyle yarış.
- **B204 | P4** `main.js:10307` — `persistActiveBrowserTabState` view'suzlukta atlıyor → `captureEnabled`/`overlay` kaybı.
- **B205 | P4** `main.js:3323` — popup'ların `render-process-gone`'u işlenmiyor.
- **B206 | P4** `main.js:10482` — `hideBrowserView` canlı ASR'ı durdurmuyor.
- **B207 | P4** `main.js:11431` — `browser:tab:close` arka-plan sekmesi için boşa view yaratıyor.
- **B208 | P4** `browser-subtitles.js:1612`'ye ek: `transcribe.py:4226` `mean_conf` O(i×kelime) taraması — bisect/forward-cursor.
- **B209 | P4** `transcribe.py:3831` — WhisperX metrik satırları hep-None (ölü veri); atla.
- **B210 | P4** `transcribe.py:3522` — `series_memory.merge` istisnası başarılı chunk'ı `failed` sayıyor (sayaç/UI tutarsızlığı).

### Test-altyapı bulgusu (önceki turdan, hâlâ açık)

- **B76 (rapor 31)** — CDP `client().call` timeoutsuz; çocuk ölünce runner sonsuz asılı. Bu turda yeniden görüldü: extras smoke sessiz `exit 1` üretiyor çünkü Windows GUI-subsistem Electron'da uncaught-exception çıktısı konsola düşmüyor; test `error.txt`'ye yazıyor. Smoke koşucularına hata çıktısını dosyaya yazma + `client().call`'a deadline ekleme planı korunuyor.

### mux.js kalıtsal sınırları (belgelenmiş; yerel düzeltme değil, node_modules kurulunca doğrula)

- cc baytlarında parity maskeleniyor (`& 0x7f`) → bozuk çiftler yanlış glif olur (B154 kökü).
- 608 implementasyonu doubled-control-code varsayıyor; tekli kod gönderen uyumsuz encoder'lar yanlış ayrışabilir.
- 708: pencere/kalem/renk/italik render edilmiyor (düz metin); B-frame zamanlama kayması bilinen upstream sorun.
- `senc`/`cenc`/`cbcs` desteklenmiyor → sıfır altyazı (yüksek sesle hata — iyi).
- `mp4.CaptionParser` yalnız video-sample SEI `cc_data`; ayrı `stpp` altyazı parçaları çıkarılmıyor.

## Reddedilen / abartılmış ajan iddiaları

- "savedCues doğrulanmıyor" → **ret**: array+filtre+500 sınırı mevcut (önceki turdan beri).
- "B64 token testleri eksik" → b03ae5e ile kapatılmış (sender/tür/TTL/tek-kullanım matrisi).
- "nMDB db temiz" iddiası kısmen yanlış yönde iyimserdi — F2/B144 ile düzeltildi.

## Uygulama / düzeltme planı (önerilen sıra)

1. **Güvenlik paketi** — B106, B107, B108, B109, B134, B144: sayfa-kontrollü girdi → kimlikli fetch / grant / bellek; tek seferde kapatılabilir.
2. **Bozulma durdurucular** — B110 (transcribe metrik senkronu), B111 (pipeline rollback), B112-B114 (parser doğruluk).
3. **CEA canlı-yakalama doğruluğu** — B119, B120, B121, B122, B123, B147, B148, B150, B151, B155, B156, B157: Great Courses sonrası kalan gerçek-site boşlukları; B119+B121 canlı/byte-range akışlarda doğrudan yanlış altyazı üretir.
4. **Sekme görünürlük yarışları** — B115, B116, B117, B124-B132: tek "lifecycle kenarları" paketi.
5. **P3 bakiye** — B133-B166 kalanı.
6. **P4 hijyen paketi** — B167-B210: env scrub birleştirme, `.bak` tutarlılığı, küçük kilitler.
7. **mux.js doğrulama turu** — `npm install` sonrası: B154 parity, B146 encoding seçenekleri, B-frame timing.

## Bilinçli olarak değiştirilmeyenler

- Çalışma ağacındaki kullanıcı CEA-kalıcılık diff'i (`browserCeaCapture` snapshot/persist) — ayrı incelemede `complete` alan düşüşü zararsız bulundu (`state==='complete'` kullanılıyor); commit kullanıcıya ait.
- `paths:scanMedia` ham-string kabulü — B80 kapanınca exploit yolu yok; derinlemesine savunma adayı olarak kalıyor.
- B60/B64/B100 — önceki tur kapanışları geçerli.
