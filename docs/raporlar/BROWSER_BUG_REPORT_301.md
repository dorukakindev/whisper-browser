# BROWSER BUG REPORT 301 — R334: Yerel kalite turu (kapsam haritası + gerçek bug)

**Tarih:** 2026-10-01 · **Dal:** `devin/1790820025-r334-coverage-audit` · **Bağlam:** GitHub hesabı spam-flag'de (404) — PR açma/merge bekliyor, işler yerel kollarda toplandı.

## Özet

GitHub engelini beklemeden yürütülen yerel doğrulama turu. Beş iş kalemi:

1. `npm test` tam tur — R332 commit'lerinin test-tarafı 4 kırılması (R332 dalında `760f7bf` ile düzeltildi, ayrı rapor 300).
2. Electron smoke `--all` — `NODE_V8_COVERAGE` ile birleşik koşu: hem geç/kal hem `main.js` blok kapsamı.
3. Backend `coverage.py` — `transcribe.py` ölü bölge analizi → yeni test dosyası + **1 gerçek bug**.
4. `main.js` V8 fonksiyon-kapsam haritası — 1503 hiç-çağrılmayan named fonksiyon, kümeler sınıflandırıldı.
5. `renderer.js` CDP precise-coverage + maymun-fuzz — 400 adım, **sıfır console hatası**.

## GERÇEK BUG (düzeltildi)

### B-334-01 · `recover_punctuation_collapse` sınır bandı mükerrer altyazı üretir (transcribe.py)

- **Kök neden:** Kabul penceresi `span_start − 0.25 ≤ center ≤ span_end + 0.25`, eski-blok silme penceresi ise kesin `[span_start, span_end]` — kabul bandı ±0.25 s daha geniş. Ayrıca `max(ns, span_start)` kırpması run-up'tan gelen yeni bloku bölge İÇİNE çeker. Bölge kenarına oturan hayatta kalan eski blokla (merkezi banda düşen) yeni blok aynı saniyede üst üste gösterilir.
- **Kanıt (kırmızı):** `test_split_deadzones.py::t_recover_boundary_no_duplicate` — span 50–150, hayatta kalan komşu `[49.4, 50.3]` (merkez 49.85 < 50), yeniden çeviri `[50.0, 50.4]` — eski kodda ikisi de listede (0.3 s çakışma). `git show HEAD~N` sürümüyle doğrulandı.
- **Düzeltme:** Survivor-overlap bekçisi — katı span dışında merkezi olan eski bloklar `survivors` olarak toplanır; kabul bandına düşen yeni bloklardan survivor'la >0.05 s çakışanlar düşürülür. `new_words` için de aynı bekçi (kelime listesinde aynı asimetri vardı).
- **Kilit:** yeni blok düşürüldüğü için `new_entries` boşalıyor → span atlanıyor, eski metin korunuyor (tasarımın "asla kötüleştirmez" sözleşmesiyle uyumlu).

### B-334-02 · `sanitizeProcessDetail` OSC dizgi sızıntısı (main.js)

- **Kök neden:** ANSI regex'i önce Fe-dalı `[@-_][0-?]*[ -\/]*[@-~]` dener; `]` (0x5D) bu aralıkta olduğu için OSC dizgisi `\x1b]8;;h` olarak yenir — `h` "final byte" sanılıp OSC içeriği (`ttps://kotu.example`) düz metin olarak günlüğe sızar ve `https?://` maskesi de tutmaz ('ttps' kaldı).
- **Kanıt (kırmızı):** eski kod `\x1b]8;;https://kotu.example\x07link\x1b]8;;\x07` → `"ttps://kotu.examplelink"` (URL parçası görünür); düzeltmede → `"link"`.
- **Düzeltme:** dizgi-sonlandırıcı escape'ler (`]`, `P`, `X`, `^`, `_` → OSC/DCS/SOS/PM/APC) Fe dalından ÖNCE `[^\x07\x1B]*(?:\x07|\x1B\\)` ile tamamen süzülür; içerik penceresi `\x1b`yi de dışlar (sonlandırılmamış dizgi sonraki escape'i yutmaz).
- **Kilit:** `tests/joblog-deadzone.test.js` — OSC köprüsü, DCS/PM dizgileri, CSI, URL/yol/kontrol/500-kırpma kontrolleri.

### B-334-03 · `download_youtube` video_id traversal son-fallback boşluğu (transcribe.py)

- **Kök neden:** R332'nin `_inside` kapsam bekçisi uzantı taramasındaki adayları kontrol ediyordu fakat tarama başarısız olunca yapılan SON fallback (`Path(output_dir)/f"{video_id}.wav"`) ve ardındaki `wav_path.is_file()` kapısı bekçiden geçmiyordu. `video_id='../evil'` gibi traversal'lı bir extractor kimliği + kapsam dışında gerçekten var olan dosya → kapsam dışı dosya "indirilen ses" olarak kabul ediliyordu.
- **Kanıt (kırmızı):** `id='../evil'`, üst dizinde `evil.wav` mevcut → eski kod `wav_path` olarak kapsam dışı dosyayı döndürüyordu (test `traversal red` düşüşüyle kanıtlı); düzeltmede `RuntimeError('bulunamadı')`.
- **Düzeltme:** son fallback de `_inside`'dan geçer, kapsam dışıysa `wav_path=None`; ardındaki varlık kapısı `not wav_path or not wav_path.is_file()` olarak güncellendi.
- **Kilit:** `backend/test_ytdlp_deadzones.py` — traversal senaryosu dahil 22 kontrol (sahte `yt_dlp` modülü, ağ yok).

## Kapsam haritaları

### Backend (`coverage.py`, 47 test dosyası subprocess)

`transcribe.py` 5217 stmt, %79 kapsam, 1077 eksik satır, **sıfır tamamen-ölü fonksiyon**. En derin ölü gövdeler (hepsi test kilitlendi veya env-gated sınıflandırıldı):

| Fonksiyon | Eksik | Durum |
|---|---|---|
| `recover_punctuation_collapse` | ~90% | **bug bulundu+düzeltildi**; FakeModel ile 4 senaryo kilitli |
| `split_segment_by_timing` / `split_segment_by_punctuation` | ~85% | 10 senaryo kilitli (passthrough sözleşmesi dahil) |
| `find_unpunctuated_spans` | çoğu | 4 senaryo kilitli (comma/cap/short-dur kapıları) |
| `sync_subtitles` (--sync-subs) | ~98% | env-gated (ffmpeg+numpy+gerçek medya) — test edilemedi |
| `resolve_device_and_compute` | ~90% | env-gated (GPU/CUDA yok) |
| `download_youtube` / `llm_translate` / `main` | kısmi | ağ/model-gated |

### main.js (V8, 39 smoke süreci birleşik)

4579 fonksiyon bloğunda 1503 named fonksiyon hiç çağrılmadı (%58 blok). Kümeler:

- **Smoke-dışı özellikler:** manga hattı (`startBrowserManga`, `translateMangaCandidate`, `requestMangaTranslationAtEndpoint`, `fetchMangaImageSource`…), canlı ASR (`startBrowserLiveAsr`), sayfa çevirisi blok hattı (`runBrowserPageTranslationBlocks`, `acceptDynamicBrowserPageBlocks`, `flushBrowserPageApply`).
- **Ağ/canlı-gated:** `fetchSponsorBlockSegments`, `fetchDeArrowBranding`, `fetchYouTubeDislikes` (deterministik set ağı dışarıda bırakır).
- **İç araçlar:** `resourceSoakCycle`, `runResourceSoakSession`, `collectResourceSoakSnapshot`, `resourceSoakHibernationSession` (CLI-flag araçları).
- **Kenar-yaşamdöngüsü:** `unloadBrowserTab`, `openYoutubeTvWindow`, `restorePersistedBrowserTracks`, `runAnkiExport`, `reportBrowserDrmSupport`.
- **Bakım/sweep yolları:** `pruneOldLogs`, `sweepStaleChatFiles`, `sweepOrphanOutputTransactions` (zamanlama-gated).

Şüpheli **ölü kod bulunamadı** — hepsi tetiklenmemiş-yol sınıfında; kapsam haritası gelecek test yazarlığı için kullanılabilir.

### renderer.js (CDP precise-coverage + 400 adım maymun-fuzz)

Derleyiciye ulaşan 801 blokta 295'i çalışmadı; named-fonksiyon olarak **yalnız 19 hiç-çağrılmayan** — çoğu maymunun ulaşamayacağı özellik yüzeyleri (`toggleQueue`, `openMenu`, `goChannel`, `showError` hata görünümü). **Sıfır console hatası.**

## Smoke sonucu

`xvfb-run -a node tests/run-electron-smokes.js --all` (NODE_V8_COVERAGE): tek düşüş `electron-browser-menu-visual` — `desktopCapturer` pencere listelemesi başsız Xvfb'de çalışmaz (compositor yok). **Ortam sınırlaması**, ürün regresyonu değil; R328-1'de aynı sınıf belgelenmişti.

## Yeni test dosyaları

- `backend/test_split_deadzones.py` — 17 senaryo / 24 kontrol, hepsi yeşil: timing big-pause/bağlaç/hard_max/max_words/None-zamanlı kelime/words=None; punctuation cümle-sonu/soft-70%/passthrough; find_unpunctuated_spans 4 kapı; recover_punctuation_collapse replace/keep/sınır-bandı 4 senaryo.
- `backend/test_ytdlp_deadzones.py` — 6 senaryo / 22 kontrol: audio_lang kapısı, cookie whitelist, hata eşlemesi, progress_hook, dosya çözümleme (B-334-03 traversal dahil), ffmpeg_location+ffprobe uyarısı, clip notu+opts.
- `tests/anki-export-runner.test.js` — 6 senaryo: tek-uçuş, betik yok, 32MB sınırı, başarı+izleme, 4 hata yolu, settled idempotency.
- `tests/joblog-deadzone.test.js` — 4 senaryo: `sanitizeProcessDetail` (OSC/DCS sızıntısı B-334-02 dahil 11 kontrol), `redactJobLogArgs` (gizli-değer bayrakları + `--ad=değer` + slice(1) sözleşmesi), `pruneOldLogs` (en-yeni-K korunur + dizin keep-yuvası davranışı + eksik dir toleransı).
- `tests/track-probe-deadzone.test.js` — 5 senaryo: 10-kapı matrisi, store+streamKey+not zinciri, bayat context, ETIMEDOUT hata notu, busy nesil bekçisi.
- `tests/permission-settle-deadzone.test.js` — 4 senaryo: bilinmeyen kimlik, persist'siz izin, 'media'→camera+microphone persist + denied olayı, callback-hatası toleransı.
- `tests/tv-window-deadzone.test.js` — 4 senaryo: sandbox/contextIsolation/nodeIntegration/webviewTag invariants, will-navigate/will-redirect/windowOpen red zinciri, alt-kare şema bekçisi, did-fail-load süzgeci, closed+UA-değişimi.
- `backend/test_device_deadzones.py` — 14 kontrol: auto/cuda/cpu matrisi + CPU compute_type düşüşü + warn_list sözleşmesi (sahte torch enjeksiyonu).
- `tests/capture-drain-deadzone.test.js` — 6 senaryo: erken-dönüş kapıları, ≤4-pass boşaltma döngüsü, warning koşulu, sekme pending/unverified, arka-plan toplamı+dışlama, kapatma diyaloğu, flushSession mutation beklemesi.
- `tests/capture-export-deadzone.test.js` — 6 senaryo: responsiveness no-op/durum, exportSnapshot redaksiyonu+kaplar, captureFullPage debugger sahiplenmesi+120Mpx reddi, videoFrame zoom-rect+iç-çerçeve reddi, savePageCapture dalları+uzantı normalizasyonu, savePageArchive .mht/.mhtml.
- `tests/pdf-state-deadzone.test.js` — 5 senaryo: statePath stem, .bak rotasyonu (gerçek fs), okuma, hazırlama validasyon matrisi (sayfa/item/blok/karakter kapları), inspectPdfDocument resourceId formülü+LRU 100.
- `tests/state-helpers-deadzone.test.js` — 7 senaryo: uniqueStrings, subtitleSeconds (SRT/VTT/ASS+padEnd), nextBrowserTabId tekliği, safeBrowserBounds kelepçe/null, zoom oku/yaz/sil, window-state bozuk→null+maximized normal-boyut, titleBarOverlay, processIsAlive.
- `tests/misc-pipeline-deadzone.test.js` — 8 senaryo: foldWatchSearchText (tr-TR İ→i+NFKC), unified arama kapsamları+bozuk-depo index yedeği, IPC frekans penceresi, data-URL kapısı, fatal-batch matrisi, nearestRegion centroid, receipts süzgeci, terminal-bekçi budama.
- `tests/persist-paths-deadzone.test.js` — 8 senaryo: saveHistory .bak-önce rotasyonu+HISTORY_LIMIT 300+mirrorBackup, indirme kaydı oku/yaz (korrupt/boyut kapısı, slice(-100)), annotationFromIndexRow anchor JSON, ensureIndexMediaForAnnotation legacy doldurma, siteTerminology seed/persist, readingList savePage MHTML, exportPagePdf uzantı normalizasyonu, collectBrowserSessionVariants per-tab sıra+dedupe.
- `tests/browser-jobs-deadzone.test.js` — 10 senaryo: browserUnifiedJobsSnapshot (manga/alt-yazı/sayfa/yakalama/recovery durum dizgileri+slice 200), split snapshot aktif-kapısı, subtitlePreferences singleton, createBrowserAcquisitionPlan 6 yetenek, queueBrowserPageApply 20'lik tetik+45ms timer+bayat çeviri süzgeci, sectionProgress blok.id sözleşmesi, pageTranslationCompletion+budgetReached, pruneReplacedBrowserPageBlocks 7 koleksiyon, playerResponsePrune aktif formülü, audio poll tab-audio olayı, compat-mode host yazımı.
- `tests/browser-store-deadzone.test.js` — 11 senaryo: userData yol birleştirmeleri (6 getter), SafeSecretStore singleton'ları (invidious/youtube/settings), invidiousSessionInstance+resolveInvidiousInstance öncelik zinciri, watchLibraryForRenderer hasNotes+bozuk-depo index yedeği, adblock publish bekçisi+isSitePaused siteOverride>siteProfiles önceliği, writeBrowserPlacesAtomic bozuk-ana-dosyayı yedeğe kopyalamama+mirrorBackup, writeBrowserPlaces dirty+flush, browserTabHasPage about:blank/restoredUrl, browserPermissionAllowed media→mediaType dağıtımı, hlsCeaTracksForVariant NONE/grup filtre, clearBrowserHlsCeaFullCaptureState decoder+fetch+streamKey temizliği, inspectMediaScanRoots 0/>1000 throw+dir/file süzgeci.
- `tests/browser-style-deadzone.test.js` — 9 senaryo: darkReaderBundle önbellek+okuma, applyBrowserDarkMode exec-kapıları+user-origin insert+seq/generation bayat reddi, applyBrowserYoutubeStyle '1:1' signature+unchanged+yarış-temizliği, removeBrowserElementPickCss anahtar bekçisi, waitForGpuInfo/settleGpuReadyWaiters çözüm matrisi, refresh/collectGpuDiagnostics tetik+summarize, browserResourceSnapshot sayfa+overlay birleşimi+budget sayaçları, decorateMangaRegionColors boş-resim fallback+crop örnekleme, configureBrowserPlaybackWebRequest session dedupe+aktif-webContents kabulü.

- `tests/browser-config-deadzone.test.js` — 12 senaryo: persistPaths/windowsStatePaths
  tek-yazım, safeStore fallback+fallback-store singleton, watchIndex dizinler/özyinelemeli,
  browserTranslationConfig (param+öncelik matrisi), browserMangaTranslationConfig,
  browserUiLocale/normalizeBrowserLocaleMatrix (tr/en/unknown), browserSearchEngineMatrix,
  browserExportTitle Uzun-Başlık+ suffix, browserEventContext/TabsSnapshot/PlaybackSnapshot,
  browserNavigationStateForTab + browserTabRuntimeState (async 5 kol), trimInsertionCollection/
  boundedIpcRows (20000satır+4MB bütçe)/boundedBrowserOverlayCues, subtitleLangArg/
  subtitleTextForSearch (SUBTITLE_SEARCH_CACHE_LIMIT=32 LRU), browserPermissionLabel/
  browserTrackStreamKey/hlsCeaSegmentFetchKey, pdfProtocolHeaders.
- `tests/auth-io-deadzone.test.js` — 18 senaryo: stopPowerBlocker/setTaskbarProgress/
  endJobLog/pidAlive/backupOnce, persistQueueTerminal+persistQueueRunning+writeQueueState,
  appendSubtitleEditLog (dosya-adı kapısı, 1000 dosya/4MB/64MB limitleri, uyarı metni),
  openExternalByPolicy karar matrisi + openExternalFromWebContent WeakMap 3sn hız sınırı,
  readJsonResponseLimited (BOM+JSON.parse+etiket), validateLocalMediaPath/authorize
  (gerçek MediaFileAccess/SubtitleFileAccess + dialog stub'ı), scanMediaFromPaths
  (doğal-sıralama, gizli-klasör atlama, maxDepth sayımı dosya-derinliği, 'kök ziyarete
  dedupe), inspectMediaScanRoots (1000 kapısı/dizin/medya-olmayan süzüm),
  authorizeMediaScanRoots önizleme diyaloğu, stageBurninSubtitle (userData kopya +
  48s süpürme), burninRecoveryStatePath + read/write/clear (id süzümü, .bak),
  inspectBurninRecovery (stat/ffprobe/alreadyDone/canFinalize), processIsAlive/
  processNameForPid + burninRecoveryProcessIsRunning (pid-eşleşme + ad-zamanı kapısı),
  resolveFfTool/resolvePython/resolveExternalPlayerPath (env-öncelik + which),
  ytActiveAccount/youtubeAuthEnv (override merge + _ytDevice.deviceCode),
  validateInvidiousInstance/invidiousSessionInstance/invidiousAuthEnv (uzak http SID
  gitmez), _ytAbortAuthFlow temizliği, ensureYoutubeAccessToken (taze token, refresh,
  in-flight dedupe, invalid_grant → hesap silme), runYoutubeCommand/runInvidiousCommand
  (slot-kilit, ENOENT metinleri, result/ev ayrıştırma, subs grant + instance sonuç),
  sendYoutubeTvState/configureYoutubeTvSession (UA + fullscreen-only izin + download
  bekçisi), closeYoutubeTvWindow, installYoutubeStreamHeaders (googlevideo filteri,
  Origin/Referer + CORS başlıkları), prepareWidevineComponents (yokluk/hazır/üretim-
  hatası 240-kesimi + drm rapor zamanlama), browserWindowOpenHandler (4 dal) +
  browserPopupWindowOptions + configureBrowserPopup (eklenemeyen pencere destroy),
  ytBrowseSerialized (seri zincir + supersedable nesil).

- `tests/pure-modules-deadzone.test.js` — 4 senaryo: gpu-diagnostics (durum matrisi
  pending/recovering/fallback/healthy + recovered bayrağı + KiB→MiB + uzak/yazılım
  bağdaştırıcı regex'i + özellik normalizasyonu), secret-store (split/merge,
  proto-pollution kapısı, dizi-ezme bekçisi, save→load roundtrip, .bak kurtarma,
  partial-decrypt'te yazımın reddi, forExport süzgeci), media-catalog-store
  (itemOf doğrulama matrisi, tmdb/imdb/poster/rating kapıları, sourceOf URL
  güvenliği, upsert/get/remove + .bak kurtarma + import planı: importRef dedupe,
  tür çakışması, skipped/conflict), translation-provider-probe (endpoint güvenlik
  kapıları, classifyProbeFailure metin→kod önceliği, completionText varyantları,
  fetch-stub matrisi ok/429/invalid/timeout/network, content-length sınırı).
- `tests/exported-deadzone.test.js` — 6 senaryo: canonicalBrowserUrl (gizli
  query+hash atılımı), parseDocument (exact/bozuk-parça karantinası/dizi-dışı
  rethrow), migrateWatchDocument (tanınmayan kök, paket zarfı, kanonik dedupe,
  mezar taşı silme+yeni-ezer, itemLimit→overflow, şema zemini, karantina
  reddedilen, lastWatched sıralaması), endpointIdentity (preset/custom/inherit/
  uiKeys fallback + grup önceliği), pdf-translate kapıları (isPdfPageComplete
  status matrisi + isStandalonePageNumber sayı/Roma/'of'/s. kalıpları),
  scoreCandidate (moviehash 100 + tam/kısmi başlık + sezon/bölüm + dil varyantı
  + sürüm puanları).

||||||| 5e0d75e
- `tests/soak-deadzone.test.js` — 11 senaryo: yieldToEventLoop + resourceEmitterListenerCount
  kapıları/gerçek-emitter sayımı, resourceCdpHeap (destroyed→0, attach→collectGarbage→
  getHeapUsage→detach zinciri, zaten-takılıda attach/detach yok, debugger-hatası→
  performance.memory geri dönüşü, çift-hata→0), resourceDirectoryUsage (dosya+bayt+
  uzantı süzgeci + yok-dizin→0), collectResourceSoakSnapshot (tam şema: renderer/browser
  heap, getAppMetrics KiB→byte, gpu süzgeci, dinleyici toplamı, tracker-olmadan
  varsayılan, disk sayacı), resourceSoakSleep, collectResourceSoakHeapPoint (faz etiketi
  + heap alanları), resourceSoakCycle (sayfa URL'i, polling tetikleme, watch kaydı,
  görünüm-yok→throw, yayın-sayısı → true), resourceSoakWaitForTab (hazır→true,
  about:blank→min-500ms→false, view-yok→false), runResourceSoakSession (fixture
  127.0.0.1 kapısı UI'a dokunmadan throw), startBrowserHlsCeaFullCapture (sekme/iş/
  plan kapıları, job kurulumu, running eventi, resume devam mesajı),
  prepareBrowserHlsCeaCapture (varyant süzgeç+bant-sıralaması, matcher kayıt sayımı,
  playhead çevresi parça geri-alma, EXT-X-GAP atlama, isActive erken-çıkış).
  Sıfır-referans envanteri bu batch ile kapandı: kalan 32 ad nested iç kapanış
  (section çıkarmaya uygun değil) — üst fonksiyonları kilitli; dosyada belgeli.

- `tests/misc-exports-deadzone.test.js` — 17 senaryo: ~30 modülün kilitlenmemiş
  export fonksiyonu tek dosyada: subtitle-pair-quality (timestamp bucket +
  overlap-eşik hizalaması), subtractCoverageRanges (aralık eksiltme + tolerans
  birleşimi), youtube-accounts (hesap sanitize + accountIdFor fallback zinciri),
  browserZoomHost (IPv6 dahil), serviceIdentity (youtu.be/watch/shorts/clip +
  hint override), stableUrlHash (24-hex deterministik), publicWatchItem
  (gizli alan süzgeci) + replaceWatchLibraryItems (dedupe/revision/sort/
  tombstone sıfırlama), collectionNames/normalizeCollectionName/
  normalizeSearchScope + mangaPositionCaptureScript (JSON kaçışı), fsyncFile /
  fsyncFileBestEffort (gerçek + EPERM yutma), srtTime/assTime (yuvarlama+negatif+
  NaN kapıları), burninRecoveryVersionTooNew + replace-backup desen temizliği,
  expectedFormat (vtt/ass/srt), storageValues (8MB + JSON kapısı + string-dışı
  eleme), directorySizeBytes (nested + yok-dizin), watchOutputNames (tüm sonek
  matrisi + translateTo), trimTerminologyMap (sayı sırası + bütçe),
  normalizeReviewState (ease/dueAt kelepçeleri), normalizeAdapter (id regex +
  capability default'ları), normalizeCapabilities, normalizeSiteTermRows
  (dedupe/count kelepçesi), urlOriginRelation (no-opener/same/cross/opaque),
  sanitizeVariant (role/source beyaz liste + sourceHash hex süzgeci),
  legacyMangaCacheKey (deterministik + dil duyarlı), mangaVisibilityScript,
  pageIndexCaptureIsCurrent (nesil/görünüm/enable bekçisi), profileOf (terms
  dedupe), runtimeRoot, headerValue (Headers/düz-nesne), waitForChildClose
  (çıkmış/timeout/kapanan + dinleyici geri-alımı), readLimitedBytes
  (content-length/arrayBuffer/stream-cancel), createResourceTracker (io sayaçları
  + close-sonrası donma).

## Yeni araçlar

- `tools/ui-fuzz-coverage.js` — Electron sürücüsü: `webContents.debugger` + `Profiler.startPreciseCoverage`, deterministik yüzey turu + seeded mulberry32 maymun-fuzz (400 adım: %70 tıklama, %20 tuş, %10 metin), console-hata hasadı (`ERROR_ALLOW=/Autofill/i`), kapsam JSON'a yazılır.
- Çıktı: `/home/ubuntu/fuzzcov/renderer-coverage.json` (repo dışı artefakt).

## Sınırlar

- `desktopCapturer` sınıfı smoke'lar gerçek Windows/compositor bekler.
- GPU/CUDA/network-gated fonksiyonlar (`resolve_device_and_compute`, `download_youtube`, `sync_subtitles`, `llm_translate` canlı yolu) bu turda da doğrulanamadı — aynı sınıf daha önceki raporlarda tanımlı.
- V8/CDP kapsamı yalnız derlenmiş fonksiyonları sayar; tembel-parse'lı iç fonksiyonlar sayılmaz — "hiç çalışmadı" listesi üst sınır tahminidir.
