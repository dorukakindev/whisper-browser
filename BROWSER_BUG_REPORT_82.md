# BROWSER BUG REPORT 82 — Browser alt sistemi tam-kapsam denetimi (salt-okunur)

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

Tarama sonucu: **18 tekil bulgu** (6×P2, 12×P3). `renderer browser-UI` ve
`IPC/webview` kümeleri yeni bulgu üretmedi (küme notları aşağıda).

---

## P2 — Yüksek öncelikli

### B82-01 — CEA checkpoint'ten dönen tüm satırlar yayında ve dışa aktarımda çiftleniyor

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

### B82-02 — Sekme çalışma-durumu probu dolu/gizli/select alanları "kirli form" sayıyor

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

### B82-03 — `browser:open-link` userinfo URL'sini policy'siz yüklüyor; kimlik bilgisi diske yazılıyor

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

### B82-04 — Browser modunda oynatma politikaları hiç tetiklenmiyor (`naturalAdvance < 1` kapısı)

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

### B82-05 — `applyAudioPreference` her yeniden denemede AudioContext sızdırıyor

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

### B82-06 — Dinamik blok devamı işi değiştirirken bekleyen uygulama batch'leri sessizce düşüyor

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

### B82-07 — `shiftCueTimeline` sıfır öncesi cue'lardan hayalet `[0, 0.001]` cue üretiyor

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

### B82-08 — Altyazı-arama sonucu `fileId` ile `fileName`'i farklı `files[]` girdilerinden okuyor

- **Konum:** `src/browser-subtitle-search.js:141-147`.
- **Mekanizma:** `fileId` `a.files?.find(file => Number.isSafeInteger(Number(
  file.file_id)))?.file_id` (geçerli id'li **ilk** girdi), `fileName` ise
  `a.files?.[0]?.file_name` (koşulsuz **ilk** girdi). İlk girdi `file_id`
  taşımıyorsa (örn. hatalı kayıt) ad ve kimlik farklı dosyalara ait olur →
  sonuç listesinde yanlış dosya adı/dosya eşleşmesi.

### B82-09 — Sekme kapatma onayındaki `already_unloaded` filtresi ölü; viewsiz sekme onay ister

- **Konum:** `src/main.js:12821`, `src/browser-tab-resources.js:26`.
- **Mekanizma:** Kapatma filtresi `['active','already_unloaded','navigation']`
  dışındaki gerekçeleri onaya taşıyor; fakat `browserTabProtectionReasons`
  `already_unloaded` gerekçesini **hiç üretmez**. WebContents'i olmayan
  (dondurulmuş/henüz yaratılmamış) sekmede `stateKnown === false` →
  `unknown_state` filtreden geçer → aslında kaybedilecek veri bulunmayan
  sekme için gereksiz "kapatma onayı" sorulur.

### B82-10 — Workflow recorder: `normalizeContext(null)` TypeError; play() staleness koruması çöküyor

- **Konum:** `src/browser-workflow-recorder.js:15` (`normalizeContext(raw =
  {})` — `null` varsayılanı kapsamaz), `renderer.js:5530-5533`
  (`currentBrowserWorkflowContext` browser sekmesi yoksa `null` döndürür),
  `:174/:181/:123`.
- **Mekanizma:** Browser sekmesi yokken `play()` bayatlık kontrolleri
  `context &&` koruma kolunu geçince `raw.tabId` okumasında TypeError
  fırlatır — beklenen `EWORKFLOW_STALE` yerine çökme. `record()` aynı kontrolü
  `context &&` ile sessizce atlar → hata bile vermeden işlem yapmaz.

### B82-11 — Cross-origin iframe'de link-hints ikinci örneği Escape ile kapatılamıyor

- **Konum:** `src/browser-link-hints.js:22-32`; çağrı `main.js:13334`
  (`framesInSubtree` ile tüm çerçevelere enjekte).
- **Mekanizma:** Her çerçeve kendi `__whisperLinkHints` örneğini kurar;
  cross-origin alt çerçevede `parent.document` erişimi atar. Ana çerçevenin
  Escape keydown'u alt çerçeveye ulaşamaz → o çerçevedeki etiket katmanı ve
  keydown yutucu açık kalır: kullanıcı Escape'e bassa bile ipuçları ve
  klavye yutma o çerçevede sürer.

### B82-12 — Oynatma tanıları 8 s/12 s yeniden-emisyonları dedupe'i aşıp `recent`'i dolduruyor

- **Konum:** `src/browser-playback-diagnostics.js:347-348` (`limit=24`,
  `dedupeMs=5000`), `:410-421`.
- **Mekanizma:** Sürekli takılma (`frameStagnant ≥ 8000 ms`, `stalled ≥
  12000 ms`) koşulları aynı `code:evidence` parmak iziyle yeniden emit eder;
  yeniden-emisyon aralıkları 5 sn'lik dedupe penceresinden uzun olduğu için
  her seferinde geçer → `recent` dizisi aynı parmak izli kayıtlarla dolup
  eski, ayırt edici kanıtları kovar (~3 dakika içinde ~24 özdeş kayıt).

### B82-13 — `session.blocks` yalnız büyüyor: eski `index:hash` kimlikleri yetim kalıp 'partial'ı kilitliyor

- **Konum:** `src/main.js:5600` (yalnız `session.blocks.set`, hiçbir yerde
  `delete` yok), `src/browser-page-translate.js:642` (`id = blockIndex +
  ':' + hashText(text)`).
- **Mekanizma:** Blok metni yerinde değişince (SPA `characterData`) yeniden
  tarama aynı köke **yeni** id üretir; eski id `session.blocks`/`translations`/
  `failures` içinde kalır. Eski id çevrilmemiş+başarısız+dışlanmamışsa
  `pageTranslationCompletion` `pending`'e sonsuza dek sayar → ilerleme
  `partial`'da takılır, arşiv `complete:false` kalır, dışa aktarma ölü
  blokları da taşır.

### B82-14 — Yerinde metin mutasyonunda `ref.originals` bayat kalıyor; geri yükleme sitenin yeni metnini eziyor

- **Konum:** `src/browser-page-translate.js:562-568` (mutasyonda
  `state.originalValues` güncellenir, `ref.originals` güncellenmez),
  `:863-867` (`restoreRef` → `node.nodeValue = ref.originals[index]`),
  `:1299+` (`pageExcludeScript`), `:1320+` (`pageRestoreScript`).
- **Mekanizma:** Site bir metin düğümünü yerinde değiştirdiğinde (canlı
  sayaç, akış güncellemesi) kayıtlı "orijinal" bayat kalır. Sonradan blok
  dışlanması, "orijinali göster" veya tam geri yükleme bayat metni canlı
  düğümün üstüne yazar → sitenin güncel içeriği eski değerle kaybolur.

### B82-15 — Yinelenen kaynak `cue.id`'leri `sentenceIdFor`'u çökertiyor; tamamlanma hiç gelmiyor

- **Konum:** `src/browser-translation-scheduler.js:22-26`
  (`sentence:${first.id}:${last.id}:${hash}`), `:502`
  (`this.results.set(sentence.id, …)`), `:350-351` (`completed: results.size`,
  `total: sentences.length`).
- **Mekanizma:** Kaynak altyazı feed'i aynı `cue.id`'yi iki kez verirse
  (JSON altyazıları bu değerleri verbatim taşır) ve metinler de aynıysa iki
  cümle aynı `sentence.id`'yi alır → `results` Map'i birini yutar →
  `completed < total` kalıcı. `whenIdle` çözülse bile ilerleme `N-1/N`'de
  kalır, kalıcılaştırma/arsiv kapısı (`main.js:7526` çevresi) tetiklenmez.

### B82-16 — Dışlama-rescan köprü emit'iyle handler'ın pending koşusu çift-iş yarışı yapıyor

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

### B82-17 — Manga overlay `layout()` sayfa tarafından soyulan frame'de TypeError → tüm takip donuyor

- **Konum:** `src/browser-manga.js:720` (`region.dataset.fittedText`,
  `region` null olabilir — yalnız `text` denetlenir), `:819`
  (`openEditor` içinde `frame.style.outline` aynı korumasızlıkta).
- **Mekanizma:** Sayfanın anti-tamper/DOM-temizleyicisi grup elemanını
  bırakıp iç `[data-whisper-manga-frame]` çocuğunu silerse `region === null`
  → `dataset` okuması TypeError → layout geçişi tamamen iptal; sonraki her
  `onLayout` aynı noktada tekrar atar → o andan sonraki tüm overlay'ler
  scroll/zoom/resize takibini kalıcı bırakır. Overlay'in kendisinin kopması
  için savunma var (`!overlay.isConnected` re-append), iç elemanlar için yok.

### B82-18 — `library:annotations:toggle` unsave yolu id kaçırınca sessiz no-op; not geri geliyor

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
  (credential saklama) tarafından raporlandı → B82-03'te tek bulgu.
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
- B82-03 için Electron resmi dokümanı: `will-navigate`/`will-frame-navigate`
  "will not emit when the navigation is started programmatically with APIs
  like `webContents.loadURL`" (electron/electron `docs/api/web-contents.md`).
- Rapor ürün kodunda değişiklik yapmaz; düzeltme yönleri öneridir.
