# BROWSER BUG REPORT 83 — Browser alt sistemi tam-kapsam denetimi (salt-okunur)

Tarih: 2026-09-19
Başlangıç ürün commit'i: `f586e28617d7fa23c3af5479e3e84731d3d0273a`
Dal: `master`

## Kapsam ve yöntem

Browser tarafı ~85 modül (`src/browser-*.js`, ~35k satır) + `src/main.js` browser
bölümleri + `src/renderer/renderer.js` browser-UI yüzeyi 8 kümede paralel
salt-okunur denetimle tarandı: yakalama/altyazı, sayfa-çeviri, sekme/oturum,
medya/oynatma, içerik özellikleri (manga/okuyucu/palet/dark-mode), altyapı
servisleri (depo/adblock/preload/dışa-aktarım), renderer browser-UI,
main IPC/webview yaşam döngüsü. Ajan bulguları bu oturumda kaynak üzerinde
**satır satır yeniden doğrulandı**; Electron olay semantiği resmi dokümanla
teyit edildi. Ürün kodu değiştirilmedi.

Tarama sonucu (tur 1): **18 tekil bulgu** (6×P2, 12×P3). `renderer browser-UI` ve
`IPC/webview` kümeleri yeni bulgu üretmedi (küme notları aşağıda).

**BÖLÜM 2 (derin tur) sonucu: +21 tekil bulgu** (1×P1, 8×P2, 12×P3) —
toplam **39 bulgu** (1×P1, 14×P2, 24×P3). BÖLÜM 2 aşağıdadır.

---

## P2 — Yüksek öncelikli

### B83-01 — CEA checkpoint'ten dönen tüm satırlar yayında ve dışa aktarımda çiftleniyor

- **Konum:** `src/browser-cea-checkpoint.js:30-37`, `src/browser-subtitles.js:97-103`,
  `src/main.js:8881-8923`, `src/main.js:8411-8424`.
- **Mekanizma:** `normalizeCue` checkpoint'e yalnız
  `{start,end,text,sequence,discontinuity}` yazar — `captionMode` ve
  `provenance` düşer. Yeniden başlatmada `loadCeaCheckpoint` bu cue'ları aynı
  streamKey ile `storeBrowserTrack`'e geri koyar (`main.js:8881`); fakat
  `job.completed` boş `Set` ile başlatıldığı için segment planı **baştan**
  indirilip çözülür. Yeni çözülen cue'lar `captionMode: track.instreamId` +
  `provenance` taşır (`main.js:8411-8424`). `cuePresentationKey`
  (`browser-subtitles.js:97-103`) `sourceMode||captionMode||mode` +
  `provenance.streamKey` içerdiğinden geri yüklenen ve yeniden çözülen
  birebir aynı satırlar "farklı sunum" sayılır → `mergeBrowserStreamCues`
  tekilleştirme yerine ikiz ekleme yapar.
- **Etki:** Checkpoint'ten dönen her satır yayınlanan altyazıda ve kaydedilen
  SRT'de iki kez görünür. Ajan tarafında ampirik doğrulandı:
  `mergeBrowserStreamCues([restore edilmiş],[çözülmüş ikiz]) → length 2`.
- **Çözüm yönü:** Checkpoint'e `captionMode`/`provenance.streamKey` de yazılmalı,
  ya da `storeBrowserTrack`'e giderken restore cue'ları aynı kimlikle
  etiketlenmeli.

### B83-02 — Sekme çalışma-durumu probu dolu/gizli/select alanları "kirli form" sayıyor

- **Konum:** `src/main.js:13206-13218` (`browserTabRuntimeState` sayfa içi
  probu), `src/browser-tab-resources.js:26` (koruma gerekçeleri).
- **Mekanizma:** `formOrLogin` hesabı:
  `fields.some(item => item.type === 'password' || (!['button','submit','reset','checkbox','radio'].includes(item.type) && String(item.value||'').trim()))`.
  `hidden`, `select`, `number`, `range` ve tarayıcı/sayfa tarafından **önceden
  doldurulmuş** her input `value` taşıdığı için kirli sayılır — giriş yapmamış,
  hiçbir şey yazmamış kullanıcının sıradan sayfası bile `form_or_login` /
  `unknown_state` gerekçesi üretir. Bu gerekçe `unloadBrowserTab`'ı (sekme
  belleğini serbest bırakma) ve ilgili oturum akışlarını bloke eder /
  onay diyaloğu çıkarır.
- **Etki:** Yaygın sitelerde (arama kutusu dolu gelen arama motorları, gizli
  CSRF input'u taşıyan hemen her form) sekmeyi boşaltma/kapama yanlış "veri
  kaybolacak" uyarısıyla kesintiye uğrar; bellek geri kazanımı fiilen devre
  dışı kalır.
- **Çözüm yönü:** Prob, kullanıcı etkileşimini (input/change event'leri) veya
  `defaultValue !== value` farkını izlemeli; `hidden`/`select`/`range` tipleri
  kirli sayılmamalı.

### B83-03 — `browser:open-link` userinfo URL'sini policy'siz yüklüyor; kimlik bilgisi diske yazılıyor

- **Konum:** `src/main.js:4412-4445` (`openBrowserLinkInNewTab`), çağrıcılar
  `main.js:4586` (bağlam menüsü "yeni sekmede aç") ve `main.js:13062`
  (`browser:open-link` IPC).
- **Mekanizma (iki ajan bulgusunun birleşimi):**
  1. Fonksiyon yalnız `['http:','https:'].includes(parsed.protocol)` denetler;
     `decideUrlPolicy`/`parsePolicyUrl` çağrılmaz — `parsePolicyUrl`
     (`browser-navigation-policy.js:31`) `parsed.username || parsed.password`
     için `credentials-not-allowed` döndürür (adres çubuğunda gerçek hostu
     gizleyen userinfo reddi; aynı kontrol `normalizeBrowserUrl:4161` ve
     `browserWindowOpenHandler:4192`'de uygulanır).
  2. `attachNavigationGuard` (`browser-navigation-policy.js:112-114`)
     `will-frame-navigate`/`will-navigate`/`will-redirect`'e bağlanır; fakat
     **Electron dokümanına göre `will-navigate` ve `will-frame-navigate`
     `webContents.loadURL` gibi programatik gezinmede tetiklenmez**,
     `will-redirect` yalnız sunucu yönlendirmesinde ateşlenir. Üstelik
     `frameGuard` yalnız `!isMainFrame` çerçeveleri korur (`:110`).
     `openBrowserLinkInNewTab` içindeki `view.webContents.loadURL(url)`
     (`main.js:4440`) programatiktir → `https://kullanici:sifre@saldırgan/`
     **gerçekten yüklenir** (Chromium userinfo'dan Basic Authorization üretir).
  3. Ham URL `tab.restoredUrl = url` ile saklanıp `tabs-changed` snapshot'ına
     ve `browser-session.json`'a düz metin girer; sekme ipucunda (tooltip)
     credential'lı adres görünür.
- **Etki:** Sayfa içi bağlantıyla açılan sekmede kullanıcı-bilgili URL
  engellenmeden yüklenir (kimlik avı yüzeyi + sessiz Basic-auth sızıntısı) ve
  kimlik bilgisi oturum dosyasına kalıcılanır.
- **Düzeltme notu (önceki raporla ilişki):**
  `BROWSER-GUVENLIK-DERIN-DENETIM-20260912-0015` M-04 yüklemenin policy'ce
  engellendiğini yazmıştı — programatik `loadURL` üzerinde guard olmadığı için
  bu sonuç yanlıştı; bu bulgu M-04'ü düzeltir ve saklama yolunu ekler.
- **Çözüm yönü:** `openBrowserLinkInNewTab` girişinde `decideUrlPolicy(url,
  'browser-navigation', ...)` uygulanmalı (diğer yüzeylerle aynı).

### B83-04 — Browser modunda oynatma politikaları hiç tetiklenmiyor (`naturalAdvance < 1` kapısı)

- **Konum:** `src/playback-policy.js:33-64`, `src/main.js:575`
  (`BROWSER_POLL_INTERVALS.media = 1000`), `src/main.js:10884` (probe→event),
  `src/renderer/renderer.js:11634`.
- **Mekanizma:** `loopCue`, `autoPause`, `shadowing` ve benzeri kararlar
  `naturalAdvance = Number.isFinite(previous) && currentTime >= previous
  && currentTime - previous < 1` koşuluna bağlı. Browser modunda medya
  saati yalnız 1000 ms'lik `probeActiveBrowserMedia` döngüsüyle gelir
  (yerel oynatıcıdaki `timeupdate` akışı yerine) → `currentTime - previous ≈
  hız × 1.0 + ölçüm kayması`. 1× hızda delta neredeyse her zaman ≥ 1 sn
  olduğundan `naturalAdvance` kalıcı `false` kalır ve bağlı politikalar
  (cue döngüsü, otomatik duraklatma, shadowing) browser sekmesinde asla
  ateşlenmez. `skipGaps`/`accelerateGaps` kapısız olduğu için çalışmaya devam
  eder.
- **Etki:** Altyazı tekrar/duraklatma çalışma modları yerel videoda işlerken
  tarayıcı sekmesinde sessizce hiç çalışmaz — kullanıcıya hata dönmez.
- **Çözüm yönü:** Eşik poll aralığına göre ölçeklenmeli (örn. `max(1,
  interval*1.5/1000)` penceresi) veya browser sürücüsü `timeupdate`-eşdeğeri
  olayla beslenmeli.

### B83-05 — `applyAudioPreference` her yeniden denemede AudioContext sızdırıyor

- **Konum:** `src/browser-media-controller.js:105-154`.
- **Mekanizma:** Elemana ikinci bir tercih uygulanırken
  `context.createMediaElementSource(item)` "already has a source node"
  hatası fırlatır; `catch` kolu `stopSilenceMonitor(item, graph)` çağırır ama
  `audioGraphs.set(...)` daha koşulmadığı için `graph === undefined` — yeni
  yaratılan `AudioContext` hiçbir zaman `close()` edilmez ve haritaya
  girmediğinden bir sonraki oynat/konum/tercih olayı aynı yolu tekrar
  dener → her denemede bir AudioContext daha sızar.
- **Etki:** Tekrarlanan ses-tercihi uygulamalarında tarayıcı AudioContext
  sınırına (tipik ~6) yaklaşılır; sonrasında o sekmede ses grafikleri kurulamaz,
  kaynak tüketimi büyür.
- **Çözüm yönü:** `catch`'te yaratılan context'i `context.close()` ile
  kapat; zaten grafiği olan elemana erken-return veya mevcut grafiği yeniden
  kullan.

### B83-06 — Dinamik blok devamı işi değiştirirken bekleyen uygulama batch'leri sessizce düşüyor

- **Konum:** `src/main.js:5340-5344`, `src/main.js:5660-5680`,
  `src/main.js:5961-5970`.
- **Mekanizma:** `acceptDynamicBrowserPageBlocks` iş varken gelen blokları
  `job.dynamicBlocks`'a koyar ve `job.scheduler.whenIdle().then(() =>
  runBrowserPageTranslationBlocks(tab, pending, session, {incremental:true}))`
  zincirler. `runBrowserPageTranslationBlocks` yeni bir iş yaratıp
  `tab.pageTranslateJob = job` atamasını **senkron** yapar (`:5676-5678`) ve
  eski işin scheduler'ını iptal eder. Eski işin `whenIdle` sonrası
  `flushBrowserPageApply` ile `applyChain`'e sıralanmış son ≤20'lik batch'ler
  çalıştığında `pageTranslationJobIsCurrent(tab, job)` artık `false` →
  `:5344` `return null` — çeviriler DOM'a hiç uygulanmaz. Söz konusu
  bloklar `session.translations`'ta bulunduğu için yeni işin `candidates`
  filtresi (`:5609` `!session.translations.has(block.id)`) onları dışlar;
  `memoryApplied` yalnız `restoredTranslations` + cache'den beslenir →
  kendini iyileştirme yok.
- **Etki:** Yoğun dinamik sayfalarda (sonsuz kaydırma) son çevrilen bloklar
  sayılmış ama ekrana yazılmamış kalır; sayfa kısmen kaynak dilde görünür.
- **Çözüm yönü:** Yeni iş kurulmadan önce eski `job.applyChain`'in boşalması
  beklenmeli (devam zincirini `applyChain` sonrasına bağla) veya yeni işe
  `session.translations`'ta olup uygulanmamış bloklar `memoryApplied`'a
  eklenmeli.

---

## P3 — Düşük-orta öncelikli

### B83-07 — `shiftCueTimeline` sıfır öncesi cue'lardan hayalet `[0, 0.001]` cue üretiyor

- **Konum:** `src/browser-cue-timeline-calibration.js:55-62`; uygulama
  `main.js:8815`.
- **Mekanizma:** Negatif kalibrasyon ofsetinde (belgelenen senaryo -8 s)
  `start = Math.max(0, cue.start + offset)`, `end = Math.max(start + 0.001,
  cue.end + offset)` → gerçek hedefi tamamen 0 öncesinde kalan cue
  `[0, 0.001]` hayalet cue'ya dönüşür; `normalizeCues`
  (`browser-subtitles.js:120-121`) sonu `start+0.08`'e şişirir → SRT'ye
  `00:00:00,000 --> 00:00:00,080` satırı yazılır, video başında görünür.
  `transformCuesForExport` (`browser-subtitle-sync.js:154-157`) `end<=0`
  cue'ları doğru biçimde düşürüyor; kalibrasyon yolunda bu düşürme yok.
- **Çözüm yönü:** `cue.end + offset <= 0` ise cue'yu düşür (üretme).

### B83-08 — Altyazı-arama sonucu `fileId` ile `fileName`'i farklı `files[]` girdilerinden okuyor

- **Konum:** `src/browser-subtitle-search.js:141-147`.
- **Mekanizma:** `fileId` `a.files?.find(file => Number.isSafeInteger(Number(
  file.file_id)))?.file_id` (geçerli id'li **ilk** girdi), `fileName` ise
  `a.files?.[0]?.file_name` (koşulsuz **ilk** girdi). İlk girdi `file_id`
  taşımıyorsa (örn. hatalı kayıt) ad ve kimlik farklı dosyalara ait olur →
  sonuç listesinde yanlış dosya adı/dosya eşleşmesi.

### B83-09 — Sekme kapatma onayındaki `already_unloaded` filtresi ölü; viewsiz sekme onay ister

- **Konum:** `src/main.js:12821`, `src/browser-tab-resources.js:26`.
- **Mekanizma:** Kapatma filtresi `['active','already_unloaded','navigation']`
  dışındaki gerekçeleri onaya taşıyor; fakat `browserTabProtectionReasons`
  `already_unloaded` gerekçesini **hiç üretmez**. WebContents'i olmayan
  (dondurulmuş/henüz yaratılmamış) sekmede `stateKnown === false` →
  `unknown_state` filtreden geçer → aslında kaybedilecek veri bulunmayan
  sekme için gereksiz "kapatma onayı" sorulur.

### B83-10 — Workflow recorder: `normalizeContext(null)` TypeError; play() staleness koruması çöküyor

- **Konum:** `src/browser-workflow-recorder.js:15` (`normalizeContext(raw =
  {})` — `null` varsayılanı kapsamaz), `renderer.js:5530-5533`
  (`currentBrowserWorkflowContext` browser sekmesi yoksa `null` döndürür),
  `:174/:181/:123`.
- **Mekanizma:** Browser sekmesi yokken `play()` bayatlık kontrolleri
  `context &&` koruma kolunu geçince `raw.tabId` okumasında TypeError
  fırlatır — beklenen `EWORKFLOW_STALE` yerine çökme. `record()` aynı kontrolü
  `context &&` ile sessizce atlar → hata bile vermeden işlem yapmaz.

### B83-11 — Cross-origin iframe'de link-hints ikinci örneği Escape ile kapatılamıyor

- **Konum:** `src/browser-link-hints.js:22-32`; çağrı `main.js:13334`
  (`framesInSubtree` ile tüm çerçevelere enjekte).
- **Mekanizma:** Her çerçeve kendi `__whisperLinkHints` örneğini kurar;
  cross-origin alt çerçevede `parent.document` erişimi atar. Ana çerçevenin
  Escape keydown'u alt çerçeveye ulaşamaz → o çerçevedeki etiket katmanı ve
  keydown yutucu açık kalır: kullanıcı Escape'e bassa bile ipuçları ve
  klavye yutma o çerçevede sürer.

### B83-12 — Oynatma tanıları 8 s/12 s yeniden-emisyonları dedupe'i aşıp `recent`'i dolduruyor

- **Konum:** `src/browser-playback-diagnostics.js:347-348` (`limit=24`,
  `dedupeMs=5000`), `:410-421`.
- **Mekanizma:** Sürekli takılma (`frameStagnant ≥ 8000 ms`, `stalled ≥
  12000 ms`) koşulları aynı `code:evidence` parmak iziyle yeniden emit eder;
  yeniden-emisyon aralıkları 5 sn'lik dedupe penceresinden uzun olduğu için
  her seferinde geçer → `recent` dizisi aynı parmak izli kayıtlarla dolup
  eski, ayırt edici kanıtları kovar (~3 dakika içinde ~24 özdeş kayıt).

### B83-13 — `session.blocks` yalnız büyüyor: eski `index:hash` kimlikleri yetim kalıp 'partial'ı kilitliyor

- **Konum:** `src/main.js:5600` (yalnız `session.blocks.set`, hiçbir yerde
  `delete` yok), `src/browser-page-translate.js:642` (`id = blockIndex +
  ':' + hashText(text)`).
- **Mekanizma:** Blok metni yerinde değişince (SPA `characterData`) yeniden
  tarama aynı köke **yeni** id üretir; eski id `session.blocks`/`translations`/
  `failures` içinde kalır. Eski id çevrilmemiş+başarısız+dışlanmamışsa
  `pageTranslationCompletion` `pending`'e sonsuza dek sayar → ilerleme
  `partial`'da takılır, arşiv `complete:false` kalır, dışa aktarma ölü
  blokları da taşır.

### B83-14 — Yerinde metin mutasyonunda `ref.originals` bayat kalıyor; geri yükleme sitenin yeni metnini eziyor

- **Konum:** `src/browser-page-translate.js:562-568` (mutasyonda
  `state.originalValues` güncellenir, `ref.originals` güncellenmez),
  `:863-867` (`restoreRef` → `node.nodeValue = ref.originals[index]`),
  `:1299+` (`pageExcludeScript`), `:1320+` (`pageRestoreScript`).
- **Mekanizma:** Site bir metin düğümünü yerinde değiştirdiğinde (canlı
  sayaç, akış güncellemesi) kayıtlı "orijinal" bayat kalır. Sonradan blok
  dışlanması, "orijinali göster" veya tam geri yükleme bayat metni canlı
  düğümün üstüne yazar → sitenin güncel içeriği eski değerle kaybolur.

### B83-15 — Yinelenen kaynak `cue.id`'leri `sentenceIdFor`'u çökertiyor; tamamlanma hiç gelmiyor

- **Konum:** `src/browser-translation-scheduler.js:22-26`
  (`sentence:${first.id}:${last.id}:${hash}`), `:502`
  (`this.results.set(sentence.id, …)`), `:350-351` (`completed: results.size`,
  `total: sentences.length`).
- **Mekanizma:** Kaynak altyazı feed'i aynı `cue.id`'yi iki kez verirse
  (JSON altyazıları bu değerleri verbatim taşır) ve metinler de aynıysa iki
  cümle aynı `sentence.id`'yi alır → `results` Map'i birini yutar →
  `completed < total` kalıcı. `whenIdle` çözülse bile ilerleme `N-1/N`'de
  kalır, kalıcılaştırma/arsiv kapısı (`main.js:7526` çevresi) tetiklenmez.

### B83-16 — Dışlama-rescan köprü emit'iyle handler'ın pending koşusu çift-iş yarışı yapıyor

- **Konum:** `src/main.js:14320-14367` (`browser:page:exclusions`),
  `src/main.js:5947-5970` (`acceptDynamicBrowserPageBlocks`),
  `src/main.js:12704` (köprü yönlendirme).
- **Mekanizma:** Handler `pageBlockScanScript({observe:true})` çalıştırır —
  sayfa içi observer `page-blocks` emit'ini köprüden geri gönderir. Emit
  handler'ın `pending` hesabından **önce** varırsa `acceptDynamic` iş yok
  görüp `runBrowserPageTranslationBlocks`'u kendisi başlatır (iş A);
  hemen ardından handler'ın `pending.length` kolu iş B'yi kurup A'yı abort
  eder. Emit geç gelirse bu kez `dynamicBlocks`'a düşüp `whenIdle` sonrası
  ikinci koşuyu planlar. Aynı bloklar iki işte çevrilir → yinelenen sağlayıcı
  istekleri (maliyet + rate-limit), iptal edilen iş A'nın sonuçları atılır.
- **Çözüm yönü:** Handler rescan'i `observe:false` ile çalıştırıp emit'i
  kendisi tek yerden besleyebilir.

### B83-17 — Manga overlay `layout()` sayfa tarafından soyulan frame'de TypeError → tüm takip donuyor

- **Konum:** `src/browser-manga.js:720` (`region.dataset.fittedText`,
  `region` null olabilir — yalnız `text` denetlenir), `:819`
  (`openEditor` içinde `frame.style.outline` aynı korumasızlıkta).
- **Mekanizma:** Sayfanın anti-tamper/DOM-temizleyicisi grup elemanını
  bırakıp iç `[data-whisper-manga-frame]` çocuğunu silerse `region === null`
  → `dataset` okuması TypeError → layout geçişi tamamen iptal; sonraki her
  `onLayout` aynı noktada tekrar atar → o andan sonraki tüm overlay'ler
  scroll/zoom/resize takibini kalıcı bırakır. Overlay'in kendisinin kopması
  için savunma var (`!overlay.isConnected` re-append), iç elemanlar için yok.

### B83-18 — `library:annotations:toggle` unsave yolu id kaçırınca sessiz no-op; not geri geliyor

- **Konum:** `src/main.js:15300-15312`, `src/browser-learning.js:44-54`.
- **Mekanizma:** `request.saved===false` kolunda kayıtlı satır
  `matchingLearningAnnotation` ile bulunur (kesin id → trackId+cueId →
  ±50 ms'lik tek-zamanlı eşleşme). Aynı `mediaId`+`type` altında farklı id'li
  bir not varsa (research-upsert özel id / eski içe-aktarım id'si) ve timed
  filtre 2+ satır bulursa (veya yeniden zamanlanmış cue'da >50 ms kayma
  olursa) `null` döner → `store.remove(existing?.id || annotation.id)`
  yeni hesaplanmış parmak-izi id'yi siler: hiçbir şey silinmez, `|| annotation`
  geri döner → handler `ok:true, saved:false` bildirirken not
  `browser-notes.json` ve watch index'te kalır; yeniden yüklemede ve
  aramada tekrar belirir.

---

## Elenen / tekrar bildirilmeyen adaylar

- **Aynı kök-eneden ikiz bulgu birleştirildi:** `openBrowserLinkInNewTab`
  userinfo açığı hem sekme/oturum (yükleme gerçekleşiyor) hem altyapı kümesi
  (credential saklama) tarafından raporlandı → B83-03'te tek bulgu.
- **Önceki raporlarda zaten var (yeniden sayılmadı):** komut paletinin asla
  çalışamaması R64-02 (`browserCommandContextMatches` `tabId`/`id` uyumsuzu,
  `renderer.js:5856` — hâlâ canlı), `writeTextAtomic` tanımsızlığı R66-04
  (`main.js:15367` — hâlâ canlı), dark-mode `cssOrigin:'user'` kaskad
  kaybı R64-05, downloads open-player medya-grant eksikliği R64-25,
  reader dead-heuristic R64-28, DarkReader 80 ms yarışı R64-31, ölü
  `input.type==='keyDown'` kapısı R66-01.
- **Doğrulanıp temiz çıkan yüzeyler:** adblock enable/disable yarışı
  (post-await recheck + `siteBypassInstalled` tek-seferlik kurulum),
  cosmetic executor (WebContents başına WeakMap, destroyed temizliği),
  tüm ~196 IPC kaydında `authorizedBrowserSender`/tab-webContents ana-çerçeve
  denetimi, trusted-bridge `bridgeToken` rotasyonu, certificate-error
  strict-deny, permission handler'lar default-deny, event-envelope
  kuşak sıralaması.
- **Test altyapısı baseline'i (ürün bug'ı değil):** bu Linux VM'de `npm test`
  13 dosyada düşer; hepsi ortam eksikliği — `backend/bin/ffmpeg.exe`,
  `backend/venv`, `genanki`, `yt_dlp`, `faster-whisper` yokluğu,
  `node:sqlite` fts5'siz derlenmiş, Windows-yol testleri
  (`path.basename('C:\\…')`, `'..\\outside'` kaçışı) POSIX ayracıyla
  değerlendiriliyor. Hedef Windows; ürün regresyonu kanıtı yok.

## Doğrulama kanıtları

- Her bulgu bu oturumda kaynakta satır numarasıyla yeniden okundu; CEA
  çiftlenmesi ve phantom-cue için ajan tarafında Node repro'su çalıştırıldı
  (`mergeBrowserStreamCues → 2`, `shiftCueTimeline([{3,5}],-8) → [0,0.001]`).
- B83-03 için Electron resmi dokümanı: `will-navigate`/`will-frame-navigate`
  "will not emit when the navigation is started programmatically with APIs
  like `webContents.loadURL`" (electron/electron `docs/api/web-contents.md`).
- Rapor ürün kodunda değişiklik yapmaz; düzeltme yönleri öneridir.

---

# BÖLÜM 2 — Derin tur: yarış / yaşam döngüsü / i18n / kalıcılık / kozmetik (salt-okunur + ampirik)

Aynı gün ikinci tur: 6 çapraz-kesim kümesi (yarış durumları, yaşam döngüsü ve
sızıntılar, i18n/unicode, kalıcılık/dışa-aktarım bütünlüğü, girdi-doğrulama ve
hata yolları, kozmetik/UI-sözleşmesi). Her bulgu bu oturumda kaynakta yeniden
doğrulandı; ayrıca **gerçek Chromium 137 üzerinde CDP ile sayfa-içi repro'lar**
ve Node repro'ları çalıştırıldı (kanıtlar ilgili maddelerde). Ajanların
`/tmp` repro'ları repo'ya yazılmadı.

## P1 — Kritik

### B83-19 — Çeviri arşivi kendi SENSITIVE_QUERY listesini kullanıyor; session/OAuth/imza token'ları arşive ve paylaşılabilir dışa-aktarımlara yazılıyor

- **Konum:** `src/browser-translation-archive.js:11` (`canonicalPageUrl`'deki
  özel `SENSITIVE_QUERY` regex'i), `src/browser-sensitive-keys.js:22-54`
  (ortak sözlük), yazım çağrıcıları `main.js:5430`, `:7602`, `:7865`.
- **Mekanizma:** Arşivin URL temizleyicisi ortak `isSensitiveKey` sözlüğünü
  değil kendi regex'ini kullanır ve sözlükteki şu adları **kaçırır**:
  `session_id`, `sid`, `id_token`, `refresh_token`, `oauth_token`, `nonce`,
  `client_id`, `client_secret`, `hdnts`, `hdnea`, `verifier`, `token_type`,
  `authToken`, `sigv4`, `apikey`, `x-api-key`, `csrf`, `xsrf`, `assertion`,
  `bearer`, `appSecret`, `x-goog-*`/`aws-*` önekleri. Cloudflare Stream imzalı
  URL (`?hdnts=~hmac=…`) veya OAuth yönlendirme adresi üzerinde çevrilen
  sayfa, canlı kimlik bilgisini `Çeviri Arşivi/index.json`, `Sayfalar/*.json`,
  `Sayfalar/*.md` ("Kaynak:" satırı) ve `buildPageTranslationExport` çıktısının
  `url` alanına (`.json`/`.md`/`.html` — paylaşılmak için üretilen dosyalar)
  düz metin taşır.
- **Etki:** Kullanıcı arşiv/dışa-aktarım dosyasını paylaştığında hesap veya
  imzalı-içerik token'ları sızar. B80-01'in (yedekteki URL sırrı) aynı sınıf
  kardeşi; farkı, hedef dosyanın *paylaşılabilir* olması.
- **Çözüm yönü:** `canonicalPageUrl` ortak `isSensitiveKey` +
  `startsWithSensitivePrefix`'i kullanmalı.

## P2 — Yüksek öncelikli

### B83-20 — Kimlik bilgili URL'ler (user:pass@) watch-index.sqlite'a ve dışa-aktarımlara kalıcılanıyor

- **Konum:** `src/main.js:7803` (`index.upsertMedia({url: tab.restoredUrl})`),
  `src/main.js:2725` (arama fallback'i `hit.url` → `watch-library.json`
  `sourceRef`), `src/browser-adapters.js:67-78`
  (`persistentBrowserMediaUrl` sorgu anahtarlarını ve hash'i temizler ama
  **`url.username`/`url.password`'e dokunmaz**; yan komşusu
  `redactCaptureUrl` :39-40 ikisini de siler).
- **Mekanizma:** B83-03'ün guard'sız `loadURL` yoluyla açılan
  `https://user:pass@host/` sekmesi `tab.restoredUrl`'i ham saklar →
  watch-index `media.url`'a (hiç budanmayan tablo) ve kütüphane
  `sourceRef`'ine yazılır; `settings:export` yolu da aynı koruma boşluğunu
  taşır.
- **Etki:** Düz metin kimlik bilgisi kalıcı mağazalarda ve yedeklerde kalır —
  B83-03'ün kalıcılık yarısı (savunma derinliği açığı).
- **Çözüm yönü:** `persistentBrowserMediaUrl` ve `upsertMedia` yolu
  userinfo'yu her durumda silsin.

### B83-21 — `browser:page:exclusions` üç sayfa-await'inden sonra bayatlık denetimi yapmadan eski oturumun çevirilerini yeni sayfaya basıyor

- **Konum:** `src/main.js:14320-14368`.
- **Mekanizma:** Handler `session.excludedSections`'ı senkron değiştirip
  `await pageBlockScanScript` (`observe:true`, :14334), `pageExcludeScript`
  (:14349), `pageApplyScript` (:14354) ve `runBrowserPageTranslationBlocks`
  (:14368) çağırır — aralarda hiç `tab.pageTranslateSession === session` /
  `tab.generation` yeniden kontrolü yok. Navigasyon veya `browser:page:clear`
  arada olursa eski oturumun pozisyonel `S<n>` çevirileri **yeni belgeye**
  uygulanır ve `persistBrowserPageTranslationArchive` eski oturumu yeni
  URL altında yazar → o URL'nin arşiv kaydı bozulur. Kardeş handler'lar
  (`:14199`, `:14263`, `:10317`) bu kontrolü yapıyor — burası unutulmuş.
- **Çözüm yönü:** Her await'ten sonra oturum/kuşak yeniden doğrulanmalı.

### B83-22 — `startBrowserPageTranslation` ~5 sn'lik tarama penceresinde bayatlık denetimsiz; iş ölü oturumda doğuyor

- **Konum:** `src/main.js:5913-5945`, `browser:page:start` busy kapısı
  `:14163` (`if (tab.pageTranslateJob)` — tarama sürerken job henüz yok).
- **Mekanizma:** `tab.pageTranslateSession = session` (:5913) → `await
  pageBlockScanScript` (:5914, saniyeler) → doğrudan
  `runBrowserPageTranslationBlocks` (:5945) — kuşak/oturum yeniden kontrolü
  yok. Kullanıcı tarama sırasında navigasyon yapar veya temizlerse
  `stopBrowserPageTranslation` oturumu null'lar + `tab.generation` artar;
  devam eden koşu yine de işi kurar ve iş **yeni** kuşakla damgalandığı için
  `pageTranslationJobIsCurrent` ömür boyu `true` → ölü sayfanın blokları için
  sağlayıcı harcaması + bayat ilerleme/done olayları + yeni URL altında
  arşiv. Busy-kapısı da baypass edilebilir (job daha atanmadı) → aynı
  sekmede iki start mümkün.
- **Çözüm yönü:** await sonrası `tab.pageTranslateSession === session &&
  tab.generation === session.generation` denetimi.

### B83-23 — Bayat `loadRetryTimer` kullanıcının bir sonraki gezinmesini `wc.reload()` ile eziyor

- **Konum:** `src/main.js:11433-11444` (timer kurulumu), temizleme yalnız
  `did-stop-loading` `:11320-11323` (`!tab.loadError` koşuluyla), `:11804`,
  `:13258`. `did-start-navigation` (`:11282`) `tab.loadError`'u sıfırlar ama
  timer'a dokunmaz.
- **Mekanizma:** Sayfa A geçici ağ hatasıyla düşer → 10/30/60 sn'lik retry
  timer'ı kurulur. Kullanıcı aynı sekmede yeni adrese gider →
  `did-start-navigation` `loadError=null` yapar, timer durur. Timer ateşi
  yalnız `closing/view-identity/isDestroyed` denetler → yeni sayfa hâlâ
  yükleniyorken `wc.reload()` **son commit edilmiş (eski/hatalı) URL'yi**
  yeniden yükler, kullanıcının uçuştaki gezinmesi iptal olur.
  `loadRetryAttempt` da sıfırlanmadığı için yeni sayfanın ilk gerçek hatası
  yükseltilmiş deneme indeksiyle 30/60 sn bekler.
- **Çözüm yönü:** `did-start-navigation`'da timer + attempt sıfırlanmalı.

### B83-24 — ui-locale MutationObserver'ı web-sayfası başlıklarını ve kullanıcı verisini "çeviriyor" (sekme/yer imi/indirme şeritleri korumasız)

- **Konum:** `src/renderer/ui-locale.js:1268` (`ignored` listesinde
  `#browserTabStrip`, `#browserPlacesList`, `#browserDownloadsList` yok);
  yazım `renderer.js:6056` (`label.textContent = browserTabLabel(tab)`),
  `:6818` (yer imi başlığı). `[data-ui-untranslated]` kaçış kapısı ölü —
  attribute hiçbir elemana konmuyor (repo geneli grep: yalnız selector'da).
- **Mekanizma:** Observer, sözlükte bulunan her metin düğümünü çevirir.
  Türkçe site başlığı `Giriş` EN modda sekmede "Intro" diye görünür
  (`ui-locale.js:403` çifti — üstelik yanlış kelime); `Ayarlar`→"Settings",
  `Geçmiş`→"History"; TR modda İngilizce `History` başlıklı sayfa "Geçmiş"
  olur. AGENTS kuralı ("kullanıcı/ortam verisi arayüz çeviricisine girmez")
  ihlal ediliyor.
- **Çözüm yönü:** `ignored`'a browser veri konteynerleri eklenmeli.

### B83-25 — `normalizeTimelineText` en-US katlaması `İ`'yi `i\u0307`'ye böler → CEA↔site kalibrasyonu Türkçe içerikte sessizce hiç eşleşmiyor

- **Konum:** `src/browser-cue-timeline-calibration.js:4`
  (`toLocaleLowerCase('en-US')` + `[^\p{L}\p{N}]+` temizliği),
  çağrı `main.js:8814`.
- **Mekanizma + AMPİRİK KANIT (Node repro):**
  `'İSTANBUL'.toLocaleLowerCase('en-US')` → `'i\u0307stanbul'`; U+0307
  (Mn işaret) harf-olmayan sınıfın içinde kalıp boşluğa dönüşür →
  `"i stanbul"` — kelime iki token'a ayrılır. Repro:
  `normalizeTimelineText('GİDİYORUM') → "gi di yorum"`;
  `calibrateCueTimeline(site:'istanbul…', cea:'İSTANBUL…')` →
  `{accepted:false, reason:'insufficient-evidence', matches:1}` iken ASCII
  `ISTANBUL` varyantı aynı veride `{accepted:true, offsetSeconds:-8,
  confidence:'high'}`. Yani CEA yayın altyazısı Türkçe büyük-harf kullanırken
  site ASR'ı farklı kasa kullanıyorsa ölçülen ofset asla uygulanmıyor —
  gömülü altyazılar ekranda kayık kalıyor.
- **Çözüm yönü:** Katlamada tr dostu normalize (örn. combining-mark silme +
  İ/I/ı ayrı token haritası).

### B83-26 — Sponsor "Atla" düğmesi bölüm bitince silinmiyor; tıklayan kullanıcı bitmiş segmente geri sarıyor

- **Konum:** `src/renderer/renderer.js:10213-10225` (sor-modu pendingAction),
  tıklama `:11254`, seek `:10131/:10138`.
- **Mekanik:** `browserSponsorPendingAction` segmente girince yazılır;
  `segment.end` geçildiğinde `find` boş döner ve `return false` alanı
  pendingAction'ı **temizlemez**, aksiyon düğmesi de gizlenmez → "Atla"
  sinyal şeridinde belirsiz kalır. Sonradan tıklanırsa
  `browserCommand('seek', segment.end)` koşulsuz geriye sarar.
  `sponsor-undo` ("Geri al") varyantı aynı bayatlığı taşır.

### B83-27 — Açılış GC'si referans kümesine yalnız sqlite track satırlarını alıyor; oturum/çalışma-alanı `trackRefs`'leri sayılmadan altyazı varlıkları siliniyor

- **Konum:** `src/main.js:2516-2519` (`pruneTracks` + `sweepOrphans`),
  `src/browser-asset-store.js:201`; referanslar `main.js:3248`/`3504`/`7817`.
- **Mekanizma:** `sweepOrphans(new Set(candidate.listTrackAssetPaths()))`
  — kümede `browser-session.json` `tab.trackRefs[].assetId` ve
  `browser-places.json` `workspaces[].tabs[].trackRefs[]` yok. Tetikleyiciler:
  kütüphaneden `library:remove` medyayı silince track satırları düşer ama
  kayıtlı workspace hâlâ varlıkları işaretler → 30 gün sonra süpürülür;
  sqlite silinir/karantinaya alınırsa boş indeksle **tüm** >30 günlük varlık
  çiftleri silinir; 180 gün görülmeyen workspace'in track'leri `pruneTracks`
  ile gider.
- **Etki:** Kaydedilmiş çalışma alanı/oturumun bağlı altyazı dosyaları
  sessizce yok olur; geri dönüşte eksik altyazı.

## P3 — Düşük-orta öncelikli

### B83-28 — `tab.loading` hiçbir yerde atanmıyor → 'navigation' unload koruması ölü; uçuşta yükleme olan sekme boşaltılınca hedef URL kayboluyor

- **Konum:** `src/browser-tab-resources.js:21` (`tab.loading ||
  tab.restoringPage`), atama yok (repo grep: `tab.loading =` 0 sonuç);
  snapshot `main.js:13245` son COMMIT URL'yi alır.
- **Etki:** Yönlendirme zinciri/yavaş site yüklenirken arka plan sekmesi
  boşaltılabilir → geri dönüşte eski sayfaya açılır.

### B83-29 — Yarıda kalan `unloadBrowserTab`, canlı sekmede `__whisperCaptureEnabled=false` bırakıyor → gelen altyazı yanıtları sessizce düşüyor

- **Konum:** `src/main.js:13235-13252`.
- **Mekanizma:** Boşaltma önce yakalamayı duraklatır
  (`browserTabCapturePending(tab, true)`). `capture_pending` kolu hook'u geri
  açar (:13236-13240) ama sonraki `finalCheck` başarısız olursa (ör. arada
  `audible`/`formOrLogin` değişti) fonksiyon `lifecycle='background'` ile
  döner ve hook'u **geri açmaz** — sayfa bir sonraki aktivasyona dek
  altyazı yanıtlarını push-kapısında düşürür.

### B83-30 — Sekme `lifecycle='restoring'` takılı kalabiliyor; renderer'ın beklediği `'restore_failed'` hiç atanmıyor

- **Konum:** `src/main.js:11773` + `:12787` (yazım), `resumeRestoredBrowserPage`
  erken-dönüşleri `:11682` (loadError / restoringPage / getURL dolu /
  requestIsCurrent) — bu yollarda lifecycle 'restoring' kalır. `'restore_failed'`
  yalnız **okunur** (`:11773`, `renderer.js:5073/:5493` whitelist), hiç
  yazılmaz → takılı sekme kullanıcıya 'active' görünür, paletin unload
  eylemi hedefleyemez.

### B83-31 — Scheduler'da atan `onResult` başarılı cümleyi de failure'a yazıp aynı callback'i tekrar çağırıyor → unhandled rejection + sonlandırılamayan durum

- **Konum:** `src/browser-translation-scheduler.js:502-504` + catch `:505+`
  (`failures.set` :545, ikinci `onResult` çağrısı), retry döngüsü `:559-568`.
- **Mekanizma:** `results.set` sonrası `onResult` fırlatırsa (uygulama
  kapanırken `sendBrowserEvent` → `webContents.send` "Object has been
  destroyed") aynı `.catch`'e düşer → cümle hem results hem failures'ta;
  retry kuyruğu `results.has` yüzünden onu asla bitiremez → `completed` ve
  `retrying` aynı anda raporlanır; ikinci `onResult` da atarsa unhandled
  rejection.

### B83-32 — Dinamik-blok whenIdle devamında `.catch` yok → sessiz unhandledRejection

- **Konum:** `src/main.js:5969` (`void job.scheduler.whenIdle().then(() =>
  runBrowserPageTranslationBlocks(...))`). Kardeş çağrı `:5979` `.catch`'li.
- **Mekanizma:** Ertelenmiş koşu reject ederse (örn. kapanışta webContents.send
  atması — B83-31'le aynı vektör) hata yalnız global sayaçta (`main.js:773`)
  görünür; Node unhandled-rejection davranışına göre ana süreçte çökme riski.

### B83-33 — `.wbp` çalışma-paketi dışa aktarımı mutlak yerel yolları ve OS kullanıcı adını içeriyor

- **Konum:** `src/workspace-package.js:81` (`bundle.sourceRoot` = userData
  mutlak yolu — Windows'ta `C:\Users\<kullanıcı>\AppData\Roaming\…`;
  `mappings` girdileri ham mutlak yollar).
- **Etki:** Paylaşım için üretilen dosya makinenin dizin düzenini ve hesap
  adını açığa çıkarır (önceki .wbp raporları hep içe-aktarım tarafındaydı).

### B83-34 — `.bak` gölgeleri kullanıcının sildiği veriyi tutuyor: temizleme flush'ı silme-öncesi dosyayı yedeğe kopyalıyor

- **Konum:** `src/main.js:3578-3585` (`writeBrowserPlacesAtomic`),
  `src/browser-session-store.js:311-318`, `src/browser-note-store.js:103-106`,
  `watch-library-store` atomicCommit.
- **Mekanizma:** Her atomik yazım önce mevcut dosyayı `.bak`'a kopyalar.
  "Geçmişi temizle"/"oturumu sıfırla" flush'ı önce **dolu** dosyayı yedeğe
  alır → silinen geçmiş/sekmeler `.bak` içinde okunabilir kalır (kullanıcı
  hemen çıkarsa süresiz). Özel-gözatma temizliğiyle çelişen saklama.

### B83-35 — `browser:cookies:clearSite` HTTP auth önbelleğini temizlemiyor → basic/digest kimlikleri "site verilerini temizle"den sağ çıkıyor

- **Konum:** `src/browser-session-privacy.js:30-67` (`clearBrowserSiteData` —
  `clearAuthCache` çağrılmıyor; yalnız `resetBrowserSessionData` :107-108
  çağırıyor), handler `main.js:13938`.
- **Mekanizma:** Electron auth-cache `clearData`/`clearStorageData` kapsamında
  değil. Kullanıcı site verisini sildikten sonra site tekrar açılınca
  userinfo/401 kaynaklı basic-auth otomatik devam eder — en beklenen
  silinme gerçekleşmez.

### B83-36 — CP1254 fixup'ı gerçek `þ/ð/ý` metnini bozuyor — foreign-guard aksanlı ünlüleri arıyor, yalnızca þðý'li kısa metinler kayıp (Python ikizi aynı)

- **Konum:** `src/browser-textutil.js:93-98` (guard
  `/[áéíóúÁÉÍÓÚæÆøåÅ]/`), ikiz `backend/transcribe.py:7376-7391`.
- **Mekanizma + AMPİRİK KANIT (Node repro):**
  `decodeSubtitleBuffer('það er þýtt orð þýðing þörf')` →
  `"şağ er şıtt orğ şığing şörf"` + `note:'Türkçe karakterler onarıldı'`.
  Yalnız-þðý metinlerde guard letters yoksa suspicious≥3 ile fixup ateşlenir.
  (Karışık İzlandaca — içinde á/é/æ olan dosyalar guard'a takılıp kurtulur.)
- **Not:** Repo kuralı "birini değiştirirsen diğerini de değiştir" — iki
  kopya da aynı boşluğu taşıyor.

### B83-37 — JS `MOJIBAKE_MARKERS` Python'dan eksik: `Å` ve `Ã¢` yok → yalnız ş/Ş/â/Â hasarlı dosyalar JS'te onarılmıyor

- **Konum:** `src/browser-textutil.js:4` (9 marker) vs
  `backend/transcribe.py:7356` (11 marker, `Å`, `Ã¢` dahil).
- **Mekanizma + AMPİRİK KANIT (Node repro):**
  `decodeSubtitleBuffer('ÅŞimdi eve git.')` → değişmez + `note:''` —
  latin1→utf8 onarımı tetiklenmez; aynı dosyayı backend onarır.
  Oynatıcı/kütüphane-arama/geri-yazım bozuk metni taşır.

### B83-38 — ~14 kullanıcı-görünür yerde sabit `toLocaleString('tr-TR')`/`toLocaleDateString('tr-TR')` → EN arayüzde de tarih/sayı Türkçe formatlanıyor

- **Konum:** `src/renderer/renderer.js:7139` (boyutlar), `:7359/:7370/:18877`
  (durum zamanları), `:8074/:13907` (track updatedAt), `:9486` (offset sn),
  `:11940/:18917/:19203` (token/karakter sayıları), `:7809` (MB).
- **Etki:** İngilizce arayüzde "19.09.2025", "1,5 MB", "1.234 token" gibi
  Türkçe formatlar görünür; `UiLocale.get()` mevcut ama kullanılmıyor.

### B83-39 — Önizleme paneli `hidden`'ı yazar-kural `display:grid` ezdiği için asla gizlenemiyor

- **Konum:** `src/renderer/index.html:1205` (`#browserPagePreviewPanel[hidden]`),
  `src/renderer/styles.css:4867-4870` (`.browser-page-preview-panel{display:
  grid; … border-left:2px solid var(--accent)}`), toggle `renderer.js:18903`.
- **Mekanizma + AMPİRİK KANIT (Chromium 137 CDP):** yazar kuralı UA
  `[hidden]{display:none}`'ı ezer — `getComputedStyle(panel).display ===
  'grid'` doğrulandı. Popover açıldığında boş, vurgu-kenarlıklı kutu her
  zaman görünür; "Önizlemeyi gizle" yalnız içeriği temizler. Kardeş
  `browserGo` aynı desende `[hidden]` guard'ı taşıyor (`styles.css:6192`) —
  bu elemana eklenmemiş.

## BÖLÜM 2 — Elenen / kapsam-dışı notlar

- **Çift-sayım elendi:** `main.js:5969` `.catch`'siz whenIdle devamı iki
  kümede de raporlandı → tek bulgu (B83-32).
- **Önceki raporlarla çakışanlar (yeniden sayılmadı):** settings.json .bak
  yokluğu B164; browser-downloads.json .bak yokluğu R66-25; atomik-olmayan
  export yazımları R66-22; arşiv yetim dosyaları B9/Y6; bozuk watch-index
  kurtarmasızlığı B177; safePageIndexUrl çakışması B172/R46-49; .wbp
  içe-aktarım path-rewrite B43/R51-01/B109; komut paleti ölü yürütme R64-02;
  exclusions busy-policy tutarsızlığı R26; unload retention B104.
- **Doğrulanıp temiz çıkanlar:** scheduler kuşak/abort koruması
  (:485/:494/:506 + `:572` current===job finally) sağlam; translateShared
  paylaşılan-istek refcount doğru; browser-preload observer/timer'ları
  document/pagehide ile birlikte ölüyor; `.field-hint/.muted/.small-muted`
  gibi tanımsız utility sınıflar yalnız görsel solma farkı (metin okunur).
- **Ampirik harness notları:** 89/91 `src/browser-*.js` modülü Node'da
  temiz yüklendi (2 preload modülü DOM/contextBridge gerektirir — beklenen).
  `npx node --test tests/browser-*.test.js` → **140/143 PASS**; düşenler
  hep ortam (`backend/venv/Scripts/python.exe`, `backend/bin/ffmpeg.exe`
  eksik — Windows hedefi). Chromium 137 CDP'de sayfa-içi kanıtlar: CSS
  `[hidden]`/`display:grid` çatışması (B83-39) ve SPA mutasyonu sonrası
  restore'un bayat orijinali yazması (B83-14 eşdeğeri: apply → mutasyon →
  restore = canlı site metni eski değerle ezildi).
