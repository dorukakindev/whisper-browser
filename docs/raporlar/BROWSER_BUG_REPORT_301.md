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

- `backend/test_zero_ref_module_locks.py` — 23 test: backend modüllerinde adı
  hiçbir testte geçmeyen fonksiyonlar sözleşme düzeyinde kilitlendi:
  parse_ffmpeg_version/ffmpeg_version_supported, is_sdh_descriptor (konuşmacı
  ve gerçek-cümle reddi), finite_json_value/json_dumps_finite (NaN→null +
  allow_nan=False kanıtı), job_temp_directory (env kökü), TM.context_key
  (24-hex deterministik), live_asr.read_commands (bozuk JSON/non-dict error
  olayı + stop), catalog_scan.scan (uzantı/symlink/5000 sınırı), valid_cues
  matrisi + overlap_score aralıkları, uses_spaceless_script +
  sentence_parts_match (CJK boşluk toleransı) + _turkish_clock_match
  (beşte/çeyrek geçe/kala), update_ytdlp read_active/cleanup_stale_staging/
  extract_wheel (traversal + dosya-sayısı sınırı)/download_artifact
  (sha256 doğrulama + FileExistsError)/validate_runtime (sürüm eşleşmesi),
  invidious feed_subscriptions oturum kapısı + find_working_instance RuntimeError,
  ocr_frame/semantic_search boyut ve biçim kapıları, query_gpu_vram_used_mib
  (csv parse/N/A/IOError), wav_duration (gerçek wav), detect_intro dosya-sayısı
  kapısı. Nested yardımcılar kapsayan fonksiyonlar üzerinden doğrulandı.

- `backend/test_transcribe_helpers_locks.py` — 14 test: transcribe.py'nin
  doğrudan çağrılabilen üst-seviye yardımcıları kilitlendi: subtitle_source_id
  (youtube/file ayrımı + hash duyarlılığı), is_subtitle_language_tag +
  split_subtitle_language_suffix (qualifier/dil-eki matrisi — niteleyici yalnız
  dil eki varken ayrışır), translation_artifact_path ad kompozisyonu,
  cleanup_owned_partial_translation_artifacts (meta hash/sourceId doğrulamalı
  sahiplik), strip_continuation (baş/son yönü), vtt_escape_cue_text (izinli
  etiket koruma + '-->'/boş-satır kaçışı), balanced_two_line_break (sığma + None
  sinyali), translation_context (pencere kenarları), build_chat_prompt (dil +
  güvenlik bölümü), clamp_nonpositive_durations (1ms taban / 1s tavan / sonraki
  cue sınırı), requires_word_timestamps, preflight_output_dir (probe temizliği +
  yazılamaz-kök reddi), best_offset_scored (işaretli lag + normalize skor).
  llm_translate içindeki ~25 nested closure kamu yollar üzerinden kilitli sayılıyor.

- `tests/export-closure-deadzone.test.js` — 7 senaryo: src/ altında export
  edilmiş son kilitsiz fonksiyonlar kapatıldı — browser-adblock (safeBlockedUrl
  userinfo/query/hash sıyırması + non-http reddi, blockedRequestEntry
  subtitleLike + meta güvenliği, safeErrorMessage, fetchWithTimeout abort
  sinyali + hızlı-yanıt geçişi, read/writeEngineCache MAX_CACHE_BYTES kapısı),
  browser-adapters.hostnameOf, browser-note-store.normalizeStoredAnnotation
  (snake→camel + alan kelepçeleri), browser-session-privacy
  .closeBrowserSessionConnections, browser-translation-archive
  .normalizePageRows (order sırası + Map/eleme), model-manager
  hasModelFiles/repositoryHasUsableSnapshot/findModelRepository (snapshot
  dizini + turbo≠v3 ayrımı), subtitle-sentence-layout.hasSpeakerLabel
  (NON_SPEAKER_LABEL yapısal etiketler). Kalan export'lar yalnız sabitler —
  davranış üzerinden dolaylı kilitli.

## R337 — renderer.js derin-okuma kampanyası (temiz)

Hiç doğrudan kilitlenmemiş bölgelerin satır-satır okuması. Yöntem: önceki
kampanyalarda ~30 gerçek bug üreten aynı derin-okuma. Bu turda yüzeylerin
optimistik-eşzamanlılık bekçileri (revision/signature/generation/mediaKey),
iptal tokenları, geri-alma yolları ve throttle bekçileri eksiksiz bulundu —
doğrulanmış bug yok. Okunan yüzeyler:

- **Cue düzenleme/geri-alma** (9200–9350, 18980–19120, 23630–23830,
  24050–24600): edit-context kaydı (identical-time cue'lar `|index` ile
  ayrışır — bilinçli tasarım), base-cue-map zinciri, üç kollu
  applyCueEditHistoryCore (state-match → yaz → yeniden-doğrula → rollback),
  writeSubtitleBulkFiles tersine-yazma, browserBulkStateStillMatches
  (side + checkBase parametreleri: undo'da temel-kayması bilinçli atlanır),
  applySubtitleBulkMemory migrate-kaydedilmiş-çağrışımı, sourceEditSnapshot
  (1000-kayıt sınırı + remap eşleşme-kontrolü), reviewSourceCues çakışma
  toplayıcısı. Aday bulgu `row` undefined TypeError'ı doğrulanmadı:
  plan'lar editor.rows'tan türetildiği için erişilemez (savunma notu).
- **Oynatıcı öğrenme modları** (13860–13930, 14283–14360, 14960–15030,
  16951–17060): browserLearningSeekUntil throttle + rateSequence nesil
  bekçisi tam; toggleAbLoop 0,2s minimum; stepCue kenar gezintisi doğru;
  seekToCue/loop temizliği tutarlı; timeline pointerdown hit-test scale-aware.
- **Kuyruk yaşam döngüsü** (90–160, 680–760): persist-before-spawn iki
  katmanlı kayıt, persist-sırasında-durma yarışı bekçisi, recoveredCount,
  queueSecretsFromCurrentUi (endpoint'ler diskten çıkarılmış → yeniden
  eklenir), çarpışma soneki üyeliğe göre yeniden üretilir.
- **Omnibox/navigasyon** (11288–11420): navigateSeq + tabId bekçisi,
  abort'lu eski istek yeni belgeyi bozmuyor, bang-çözümleme main'e dek.
- **media-catalog.js (471 satır tam okuma)**: api() sessionId+token iptal
  zinciri, import/preview token temizliği, WeakMap arama-katlama önbelleği,
  liste scroll geri-yükleme, odak-INDEX geri-verme — tümü doğru.
- **smarttube-tv.js (250 satır tam okuma)**: isLeftmostCard geometri
  temelli (bölüm başlıkları ızgarayı böler), TV state birikimi + handoff
  dedupe, agent rotasyonu — doğru.
- **preload.js (236 satır tam okuma)**: ince invoke geçişi; doğrulama main
  handler'larında (R275 fuzz ile kilitli), ipc-parity ratchet'i var.

Kalan tek potansiyel savunma eksiği: `sourceEditSnapshot`'ta
`row.browserOverride` tanımsız-satırda TypeError atar — bugünkü tek
çağıran `editor.rows`'tan plan ürettiği için erişilemez; davranış
kilitlendi, ileride plan kaynağı değişirse test yakalar.

- `tests/browser-bulk-edit-locks.test.js` — 16 senaryo vm-kesit kilidi:
  browserBulkStateStillMatches doğruluk tablosu (side=before/after,
  checkBase, tek-bozuk-edit → every false), attachBrowserCueIdentities
  (role passthrough, 2ms tolerans sınırı .0019/.0021, sıra-kayması
  eşleşmesi), appendTranslationAlternatives (json-çiti, dedupe, ≤3,
  12000-kesim), sourceEditSnapshot (base-koruma, browserOverride atlanır,
  remap-kayıp hatası, 1000 sınırı).

## R338 — main.js çeviri hattı derin okuması (temiz)

R337'nin devamı: renderer'ın çağırdığı IPC tarafı. Okunan yüzeylerin tamamında
doğrulanmış bekçiler bulundu — doğrulanmış bug yok.

- **IPC handler'ları** (main.js 16759–16845): `browser:translation:start/
  displayed/snapshot/stop/completeAll/retryFailed` + `network:setOnline` —
  hepsi `authorizedBrowserSender` + `activeRequestedBrowserTab` (bayat-sekme
  reddi) kapılı; displayed handler'ı trackId eşleşmesi ister.
- **startBrowserTranslation** (8642–8804): 20000-cue sınırı, refresh yolunda
  scheduler+trackId doğrulaması, sourceHash bağlam sabitlemesi, `isCurrent`
  kapanışı (closing/scheduler/generation/mediaId), completeAll kuşak
  bekçisi.
- **persistCompletedBrowserTranslation** (8806–8873): deterministik trackId
  (sourceTrackId+sourceHash+hedef+sağlayıcı+model+üslup+sözlük kimliği),
  persistedSignature ile tekrarsız yazım, arşiv + ÇIKTI klasörü iki hedef,
  hata yolu lastError teşhisi.
- **BrowserTranslationScheduler modülü** (794 satır, tam okuma): nesil
  bekçisi, paylaşılan in-flight önbellek tüketici sayımı (son tüketici
  gidince abort), seek abort'unda pending'in senkron silinmesi, çift
  devre kesici (sağlayıcı 5xx/429/transport + ardışık kesin hata),
  deferred-vs-denenmiş hata ayrımı (retryFailed yalnız denenmişi
  yeniden kuyruklar — kapalı kesicide 200 cümleyi itmez), retryAt
  erken-uyanma re-arm, whenIdle timer'ı kaybetmez.
- **İstek yolu** (6048–6285): endpoint HTTPS/yerel-HTTP kapısı,
  failover statü süzgeci + kesin-hata kısa devresi, Retry-After
  üst-sınırı (120s), 2MB yanıt sınırı, think-bloğu soyma + bilinen
  çeviri-alanı JSON zarfı toleransı, PARTS_* çözümde gevşek-parça +
  merged geri dönüşü, hata detayında kaynak metin redaksiyonu.
- **Sayfa çevirisi** (6395–7130): oturum/iş nesil bekçisi her aşamada,
  apply zinciri kuyruğu 20'şer paket + 45ms toplama, enstrümantasyon
  güvenlik kapıları (uyumluluk/Cloudflare/stale/unknown), tarama
  await'i sonrası kuşak doğrulaması (R83-22), dinamik blok kabulü
  20k/3k üst sınırları + köprü tokenı, bellek/önbellek uygulaması
  excludedIds'e saygılı.
- **PDF çevirisi** (7334–7405): scheduler yaşam döngüsü job.schedulers
  kümesinde izlenir, abort dinleyicisi finally'de sökülür, sayfa
  blokları status+error alanıyla kayıt edilir.
- `src/subtitle-sentence-layout.js` (416 satır) bu turda satır okumasına
  girilmedi — 9 ayrı test dosyasıyla (özel dahil) zaten kilitli.

## R339 — browser-page-translate.js tam okuma (1 bug)

- **insertAfterRoot uncaught-throw:** `pageApplyScript`'in yerleştirme
  yardımcısında yapısal zincir `<html>`'e kadar tırmandığında
  `anchor.parentNode` `Document` oluyordu; `document.insertBefore`
  `HierarchyRequestError` fırlatır ve try'siz çağrı **tek blok yüzünden
  tüm apply batch'ini** öldürürdü (aynı risk flex/grid `layoutRoot`
  yolunda ve `ref.root.appendChild`'de). Yerleştirme çağrıları artık
  try/catch'li; başarısız yol `document.body.appendChild` yedeğine
  düşer. Çalışan yollarda davranış aynı. Kilit: document-ebeveynli
  TABLE + flex kök senaryosu (eski kodda script istisna fırlatıyordu).
- Modülün kalanı (1456 satır tam okuma) temiz: normalize/batchleme/
  cache-key sınırları yerinde; scan tarafında observer kopmuş-kök
  temizliği, ownWrites eşleşmesi, replacedIds bildirimi, visibleOnly/
  bütçe bekçileri doğru; apply tarafında staleness (latestIdByRoot),
  edit/undo araçları isimli dinleyicilerde (restore'da sökülüyor —
  R129 sızıntısı kapalı); decode tarafında atomik kont + token-set
  eşitliği + bağlam-sızıntısı kapıları blok-bazlı fail'e bağlı.

## R340 — modül kapsam turu 2: az-kilitli araç modülleri (temiz, 0 bug)

Zayıf test referanslı araç modüllerinin tam okuması (~3.230 satır):

- **browser-library-tools.js** (533): foldLibraryText NFKC+tr-TR katlaması,
  approximateAnchorMatch hücre/ε bütçeleri, stableId, unifiedLibrarySearch
  dedupe+skor, koleksiyon rename/reorder üyelik haritaları, text-anchor
  v1/v2 şema kapıları, seçim/manga konum yakalama+geri yükleme betikleri,
  resolveTextAnchor puanlama (kesin 10+blok 100+yol 20+konum 80 / fuzzy
  .78 eşiği + bütçe), ReopenGuard nesil bekçisi — hepsi doğru. Not:
  Node tarafı resolveTextAnchor ürün kodundan çağrılmıyor (tek canlı yol
  enjekte textAnchorRestoreScript); Uint16 DP taşması DP üst sınırı
  2×desen uzunluğu (≤640) ile matematiksel erişilemez.
- **browser-adblock.js** (326): enable/disable yarışı `!requested`
  yeniden-kontrolüyle kapalı (check→enable arasında await yok),
  env-bayrak geri yükleme try/finally'de, 24s TTL + 64MB önbellek,
  stale-fallback zinciri, site-duraklatma proxy'si hem istek hem
  başlık hem kozmetik yolda, engel/izin günlükleri sınırlı +
  hassas-anahtar maskeli.
- **watch-library-state.js** (473): CRDT revision/tombstone/alan-damgası
  modeli tutarlı — yeniden-oluşturma bekçisi (_createdRevision),
  tombstone silinmiş-kayıt çatışması, progress alan damgası
  (manual-status > bayat progress, yazar+sequence tie-break),
  oturum birleştirme (max watch/ended, min started), tahliye
  mezar taşları, import tam sıfırlama.
- **browser-subtitle-search.js** (410): ISO 639-2→1 dil eşleşmesi +
  varyant kuralları, hash-file eşleşmesi + başlık geri düşümü,
  Stremio anahtarsız yedek, her yönlendirme hop'unda host/protokol
  yeniden-doğrulama, akış-sınırlı gövde, altyazı-yapı geçerlilik
  kapısı, dil-ipuçlu kodlama çözümü.
- **browser-translation-cache.js** (312): artımlı journal + sıkıştırma
  doğru — replay dedup (temel updatedAt ≥ satır), mezar taşı kapısı
  (`typeof v === 'string'` zorunluluğu yarım-satır silmeyi engeller),
  TTL her iki yolda da uygulanır, LRU dokunuşları journal'a biner,
  compact sırasında gelen set'ler kaybolmaz (pendingCount splice),
  .bak zinciri kopya-sırası doğru, bozuk arşivler son-5'e sınırlı.
- **browser-note-store.js** (260): atomik rename + fsyncFile +
  fsyncDirectory, mirrorBackup silme yazımında eski nesli yedekten
  siler (rename'den ÖNCE — sahte başarı yok), `error.committed`
  bayrağıyla rollback bellek/disk ayrışması yapmaz, yük-hatası tüm
  yazımları kilitler, sınır taşmasında bellek geri alınır.
- **browser-overlay-controller.js** (828): sınır zamanlayıcısı
  tam-arm deseni (seek/ratechange'te yeniden kurulum, ~1ms EPS
  float asimetrisi, 400ms kare-ölümü yedeği, 60s kap), medya aday
  dinleyici temizliği (kopmuş eleman tahliyesi), gözlemci 128 sınırı
  LRU tahliyesi (document muaf), tam ekran kapsayıcı taşıması
  (moveBefore — Electron 43'te mevcut; site-özellik değerini korur),
  native-caption gizleme yalnız katman açıkken.

Sıfır doğrulanmış kusur; tek açık not yukarıdaki kullanılmayan-export
satırı. Windows etkisi yok.

## R341 — Modül kapsam turu 3 (orta-satır yardımcılar): 2 gerçek düzeltme

Kapsam sıralamasının devamı (test dosyası referansı ≤7, ~2.718 satır tam
okuma): media-catalog-store (283), browser-settings-registry (290),
browser-translation-archive (348), browser-address-model (361),
browser-feature-services (407), watch-index (483),
browser-playback-diagnostics (538). İki doğrulanmış kusur kapandı:

- **B-341-01 (media-catalog-store.read) — birincil silinirse .bak
  atlanıyordu:** `read()` yalnız bozuk-şema dalında yedeği deniyordu;
  ENOENT doğrudan boş katalog döndürüyordu. Silinmiş `catalog.json` +
  sağlam `catalog.json.bak` durumunda kullanıcı kataloğu kaybolmuş
  görünürdü (yedekte veri dururken). Artık birincil her kayboluşta yedek
  deneniyor; ikisi de yoksa boş katalog (taze kurulum), ana yok + yedek
  bozuksa koruma hatası. Kilit:
  `tests/media-catalog-store.test.js` yeni blok — master'da FAIL
  (`createMediaCatalogStore` boş liste döndürürdü), düzeltmede PASS.
- **B-341-02 (browser-address-model.inlineCompletion) — görünmez
  sorguda hayalet tamamlama:** 2 görünmez karakter (ZWSP/WJ/birleştirme
  işareti) yazılınca yoğun sorgu boşa katlanıyor, `bareDense.startsWith('')`
  her places kaydını aday yapıyor ve `origEnd=0` ile host tamamlaması
  üretiliyordu — hiçbir şey yazmadan hayalet öneri. `buildAddressResults`
  aynı sınıfı `!folded` ile zaten kapatıyordu; bu yol kaçmış. `!needle`
  kapısı eklendi. Kilit: `tests/browser-address-model.test.js`
  (ZWSP/WJ/işaretçi sorguları → null; master'da FAIL).

Temiz çıkan yüzeyler: registry arama/scope-durum modeli (statik, TR
panel metinleri panelin kurulu konvansiyonuna uygun), arşiv katmanı
(canonical URL sorgu-süzgeci, traversal-güvenli `_saveIndex` artık-temizliği,
findPage eşikleri), adres modeli kalanı (jamo/sentinel haritası,
frecency, tekilleştirme, http-fallback kodları, NTP), feature-services
(generation+mediaId+AbortController üçlüsü, stat TOCTOU, crop/dosya
sınırları, ASS yetim-kare temizliği), watch-index (FTS tetikleyici
şeması, sürüm kapısı, keep-set budama, cue kimliği tekilleştirme),
playback-diagnostics (redaksiyon sıralaması, requestLike lisans kapısı,
dedupe/üstel-emisyon sayaçları).

Windows etkisi: B-341-01 yalnız dayanıklılık — Windows'ta da aynı
.bak kurtarma semantiği; B-341-02 renderer-yan.

## R342 — Modül kapsam turu 4: 1 kopya-düzeltme (omnibox jamo haritası)

Sıralama devamı (5 dosya, ~2.660 satır tam okuma): browser-skip-segments
(74), browser-omnibox (291→311), browser-textutil (309),
browser-media-controller (643), pdf-translate (568), browser-manga (1066).

- **B-342-01 (browser-omnibox.foldSearchIndex) — jamo-dizisi harita
  kaymasının bayat kopyası:** `browser-address-model.js`'teki `foldSearchIndex`
  jamo bloğu daha önce düzeltilmişti (NFC çıktısı birden çok UTF-16 birimi
  üretebilir — L+V+V dizisi hece+jamo verir; yoğun dizinin her birimi için
  ayrı harita kaydı gerekir, yoksa `map.length < dense.length` ve sonraki
  eşleşme ofsetleri kayar). `browser-omnibox.js`'teki aynı-sözleşme kopyası
  bayattı ve hâlâ `map.push([i, j-i])` tek-kayıt sürümündeydi. Renderer
  `BrowserAddressModel` yüklüyken onu tercih ettiği için üretimde etki
  sınırlı, fakat kopya Node'da `require` edilebilir ve testlerde
  kullanılıyor — birebir pariteye çekildi ve kilitlendi.
  Kilit: `tests/browser-omnibox.test.js` parite döngüsü — master'da FAIL
  (`map kapsar` + `map parite` düşüyordu), düzeltmede 72 vaka birebir
  hizalı.

Temiz çıkan yüzeyler: skip-segments (geri-seek bastırması, reklam-zamanı
kapısı, autoSkip önceliği), omnibox kalanı (bang güvenli-URL'leri,
eval'siz aritmetik, Markdown-kaçışları), textutil (eski-kodlama
yarışmasının dal sırası — %99-geçerli-UTF-8 kapısı ipucundan önce,
çift-kodlama onarımı FFFD-korumalı, İzlandaca carveout'u),
media-controller (docToken gezinme bekçisi, SPA yeniden-takma
context-kapatmama, ratechange applyingRate mikro-görev
yeniden-doğrulaması, cross-origin audioGraph kapısı, 128 gözlemci tavanı),
pdf-translate (RTL aynalama, gutter-küme sütun sırası, marj-tekrarı
süzgeci, durum dosyası 4-aday kurtarma + tam-bozuk-aday yedeği
gizleyemez, hash baş+son parça), manga (::ffff hex/noktalı IPv6 haritası,
sınırlı JSON aday taraması, köprü-token'lı düzenleme akışı, eksiksiz
teardown).

Windows etkisi: B-342-01 yalnız metin-katlama — platform bağımsız.

## R343 — Modül kapsam turu 5: 15 dosya ~7.980 satır, doğrulanmış bug yok

Depo/kalıcılık ve servis katmanı tam okuma (boyut sırasıyla):
watch-library-store (628), browser-library-tools
(533), watch-library-state (473 — yalnız test/model modülü; main.js
`createWatchLibraryStore` kullanır, üretimde erişilemez fark yok),
browser-session-store (399), browser-note-store (260),
browser-translation-archive (348), browser-adblock (326),
browser-translation-cache (312), browser-settings-registry (290),
browser-subtitle-search (410), subtitle-sentence-layout (416),
browser-feature-services (407), watch-index (483), settings-security (903),
browser-translation-scheduler (794).

Doğrulanan riskli bölgeler (hepsi temiz):

- **Kalıcılık törenleri:** atomik tmp+fsync+rename+fsyncDirectory zinciri,
  mirrorBackup önce-rename (R86-03), `.bak` yalnız geçerli önceki belgeden,
  `error.committed` bayrağıyla rollback yasağı, bozuk-arşiv en-yeni-5
  saklaması, journal mezar-taşı/TTL/bayat-diriliş kuralları
  (translation-cache), SQLite şema-sürüm kapısı + FTS5 tetiği + keep-set
  budama (watch-index), transaction-journal tam-kaydı ve marker semantiği
  (settings-security).
- **Ağ güvenliği:** OpenSubtitles/Stremio elle-redirect zincirinde her hop
  yeniden allowlist'ten geçer (SSRF), boundedBody bayt kapısı + reader
  releaseLock, altyazı-şekli kapısı, moviehash/imdbId input doğrulaması,
  ISO-639-2→1 indirgeme + varyant eşleşmesi; adblock `isSitePaused`
  hatasında engelleme sürer (fail-safe yön); `whisper`-özel URL'lerde
  creds/hash soyma.
- **Endpoint-sır mirası (settings-security):** içe aktarımda endpoint kimliği
  değiştiyse mevcut apiKey yeni uca taşınmaz; `clearedSecretFields` yalnız
  allowSecrets yolunda; backup'ta sır DEĞERLERİ gömülü dizgilerde bile
  `[GİZLİ]`; symlink bileşen-yürüyüşü.
- **Scheduler:** çekirdek-kararlılık reconcile (bağlam değişimi yeniden
  ücretlendirmez), farSeek pencere-dışı iptali, in-flight dedupe tüketici
  sayaçlı, definitive vs sağlayıcı kesicileri ayrı sayaçlar, retry timer'ı
  erken-uyanma yeniden-kurulumu (Windows), generation+bort kapıları her
  await sonrası.
- **Cümle yerleşimi:** NFC/casefold/spaceless eşleşme, sayı-simgesi ve
  Türkçe yazıyla-sayı karşılaştırması (saat/geçe-kala/buçuk/ölçek
  sözcükleri), inkâr-kaybı denetimi, korumalı cue'lar, DP yerleştirme
  (400 kelime/12 parça sınırı, geri-izleme tahsissiz).

Küçük gözlemler (bug değil): `browser-translation-archive._writeText` ve
`browser-translation-cache.compact` tmp+rename yapar ama fsyncFile/
fsyncDirectory çağırmaz — türetilmiş/yeniden-üretilebilir veri katmanı,
.bak+journal zaten çökme kurtarması veriyor; `unifiedLibrarySearch`
push-dedupe O(n²) — girişler yukarıda sınırlı.

Windows etkisi: kod değişikliği yok; not edilen fsync farkı Windows'ta
aynıdır (NTFS rename atomik, fsyncDirectory no-op'a yakın).

## R344 — Modül kapsam turu 6: orta/büyük modüller + WJ kaçış sözleşmesi

Bu segmentte tam okunan dosyalar: browser-overlay-controller (828),
browser-subtitles (2018), browser-session-package (178),
renderer-ui-model (173), model-manager (173), browser-session-privacy
(171), browser-adapter-registry (163), gpu-diagnostics (160).
Turun ilk segmentinde ayrıca ~15 orta-boy modül (~3.800 satır) okundu;
o segmentin dosya bazlı listesi bağlam özetlenmesinde kayboldu, kapsam
haritası devam notunda güncellenecek. Toplam tur ~23 dosya.

Doğrulanan riskli bölgeler (hepsi temiz):

- **browser-overlay-controller:** `nextCueBoundaryAt` WeakMap indeksi,
  3-nokta problar (0, n>>1, n-1), sıralı-kontrol→ikili-arama else
  kaba-kuvvet, suffixMin yalnız geçerli cue'lara; enjekte script:
  boundaryTimer her render'da yeniden kurulur (seek/ratechange),
  BOUNDARY_EPS=0.001 float toleransı, rVFC→rAF→400ms frameFallbackTimer
  zinciri, delayMs ≤60000 kelepçe, MutationObserver 128 LRU (document
  korunur), sürükleme isTrusted+pointerId+pointercancel/blur temizliği +
  iptalde startOffset geri yüklemesi + bridgeToken, native tam-ekranda
  popover manual, ensureRoot tekilleme, mode-off tam söküm.
- **browser-subtitles (2018 satır tam okuma):** entity çözücü
  (codepoint ≤0x10FFFF, çözülen entity'de kontrol/bidi-süzüm, adlı-entity
  whitelist, çift-çözüm yok — `&` yeniden-üretim kapısı), cleanCueText
  (bilinen-etiket whitelist + karaoke zaman damgaları, rt/rp ruby silme,
  BIDI_SPOOF_RE, `{\\` eksik-kapanış doğrusal tarama), parseTime (birim
  sonekleri + h:m:s), normalizeCues (8s/3s uç onarımı, min 0.08s süre,
  aynı-saniye yuvarlanan çift birleştirme), mergeBrowserStreamCues
  (tek-cue hızlı yol + `${ms}|${presentationKey}|${id}` revizyon grupları,
  büyüyen-bayat reddi, id+metin dedupe, ≤20000), unwrapMpegTs (33-bit
  rollover ±eşik), parseTimedBlocks (X-TIMESTAMP-MAP LOCAL/MPEGTS, sıra
  numarası ve cue-id satır dışlama, NOTE/STYLE/REGION), stripAssOverride
  +AssDrawing (doğrusal, p>0 çizim modu), parseSami (çok-sınıf→ilk-sınıf),
  parseLrc (çok-etiket, son satır +5s), HLS ayrıştırıcılar (forced bayrak,
  CEA608 instream, variant, byterange devam + MAP init + KEY + SKIP/GAP +
  discontinuity-seq, EXTINF-yoksa targetDuration geri düşümü,
  isHlsSubtitlePlaylist %60 uzantı bulgusu), DASH (dashOuterBase kardeş-
  Period BaseURL dışlaması, dashPeriodBounds, SegmentTimeline safe-int
  kapıları + r=-1 canlı + 10k tavan, $Number$/$SubNumber$/$Time$/$B$/$$
  şablonlama, PTO çıkarma), parseXml (kapanmamış-eleman kesim, style/
  region resolveStyle döngü kümesi, yığın-ebeveyn ofsetleri, mutlak-vs-
  göreli zaman bulgusu ±0.001s/>süre+3s, srv3 ms t/d), parseJson (json3
  aAppend devam, Ms-sonek /1000, ≤20000), parseYoutubeCaptionMetadata,
  MP4 ayrıştırıcı (size=0 yalnız kök, tfhd/tfdt/trun bayrak yürüyüşü
  sınırlı, ≤20000 örnek, payl/vttc derinlik-4, timescale merdiveni,
  baseDataOffset/data_offset/implicitCursor adresleme), findSubtitleUrls
  (JSON derinlik-8, 500 dizi/1000 anahtar, 64 URL tavanı + console.warn),
  cuesToSrt/cuesToVtt (BOM'suz CRLF), cueFingerprint (akışlı sha256).
- **browser-session-package:** sha256 checksum öncesi migrasyon; v0→v1
  (browserSession/browserPlaces/tracks anahtarları); `portableSessionTab`
  yerel dosya yollarını soyar (makine-yerel); `safePortableValue`→
  `safePlaceUrl`; workspace activeTabId/splitSecondaryTabId var olan
  sekme kimliklerine işaret etmeli; tavanlar (288 varyant, 100 places,
  20 workspace, 24 sekme/workspace).
- **renderer-ui-model:** createJobModel FSM — nesil-bazlı bayat olay
  reddi, başlangıçta-iptal → resolve'da 'retry-cancel', validateJobState
  invariant'ları, cycleFocusIndex, isElementVisibleForFocus,
  effectiveViewport kesme noktaları.
- **model-manager:** `repositoryMatchesModel` endsWith (large-v3-turbo'nun
  large-v3'le eşleşmesini önler); `deleteCachedModel` KNOWN_MODELS
  whitelist + realpathSync kapsama (`repoResolved.startsWith(rootResolved)`)
  öncesi rmSync; `freeBytesFor` var olan ata-dizine yürür.
- **browser-session-privacy:** SITE_DATA_TYPES donmuş — 'downloads'/
  'cache'/'backgroundFetch' bilinçli dışarıda (origin filtresi
  desteklenmiyor/tehlikeli); clearBrowserSiteData önce bağlantıları
  kapatır (uçuşta Set-Cookie dirilmesi engeli), origins-kapsamlı
  clearData, Cache Storage eski clearStorageData ile, auth önbelleği
  yalnız resetBrowserSessionData'da; shutdownBrowserSession
  activeReset/activeMutation bekler.
- **browser-adapter-registry:** `pattern()` host dizilerini son-eki
  regex'e kaçışlar; kullanıcı JSON adaptörleri (≤50 dosya, ≤64KB,
  yalnız sürüm 1) `responseHint: undefined` + `source:'user'` +
  `verificationStatus:'unverified'` alır — kod/regex enjekte edemez;
  kullanıcı yerleşiği yalnız `allowOverride` ile geçersiz kılar; 16
  yerleşik adaptör donmuş.
- **gpu-diagnostics:** saf normalizasyon — REMOTE_OR_SOFTWARE_RE,
  pending/recovering/fallback/healthy durumları, CRITICAL_FEATURES
  (videoDecode/webgl/gpuCompositing), gpuInfoText derinlik-5 sınırı.

Düzeltme (semantik değişiklik değil, okunabilirlik + kilit): `parseAss`'in
WJ (U+2060 WORD JOINER) kaçış-çözüm regex'leri görünmez karakter içeriyordu
(`/\\([{}])\u2060/` ve `/\\\u2060/` bayt olarak yazılmıştı). Regex'ler
ölü kod değildi: `escapeAssText` yazıcısı kendi `\`→`\WJ` ve `{`→`\{WJ`
kaçışlarını üçüncü-taraf bozuk ASS'teki `\\{` dizilerinden ayırmak için
bu görünmez işareti kullanır ve okuyucu onu birebir geri çözer
(yazıcıdaki yorum bunu belgeliyor). Regex'ler artık açık `\u2060` kaçışıyla
yazılmış — aynı semantik, görünmez karakterin yanlış okunmasını önler.
Yeni test kilidi (browser-subtitle-output.test.js): literal `\N`/`\h`
metni, `\\` çifti + `{grup}` yuvarlak turu, işaretsiz üçüncü-taraf
`\\{literal\\}`/`\\yolu` korunması. Sözleşme önceden kilitsizdi — test
master'da da geçer (davranış zaten doğruydu; artık sessiz gerileme
imkânsız).

Windows etkisi: ASS metin çözümü davranışı değişmedi; dosya içeriği aynı
bayt dizisini işler (kaynak okunabilirliği düzeltmesi).

## R345 — main.js bakiye derin okuması 1: yüksek-risk yüzeyleri (temiz)

main.js'te bu kampanyada hiç tam okunmamış en riskli bloklar satır
satır tarandı (~3.100 satır, 8 bölge). Doğrulanmış bug yok — önceki
turların bekçileri yerinde.

- **`transcribe:start` + `transcribe:cancel` + `maintenance:updateYtdlp`**
  (19292–19936): opsiyon nesnesi/gönderici kapısı, inputDir/outputDir
  `sanitizeAbsolutePath`, YouTube URL'i `decideUrlPolicy` + protokol
  beyaz listesi, girdi dosyası yetkilendirmesi (reexport/translateOnly/
  explain → `authorizeSubtitleFile`, diğer → `authorizeMediaFile`),
  yardımcı altyazı dosyaları ayrı yetki, kuyruk opts ≤512KB
  (`clonePublicOptions` — `SECRET_OPTION_KEYS` + regex'ler hfToken/
  apiKey'leri ayıklıyor → kalıcı kuyruğa sır sızmaz), iş-başlatma
  yarışı `jobStarting` + iptal `jobCancelSeq` deferred işaretiyle
  spawn öncesi yakalanır, `pushBoundOption` `-`li değerleri `=`biçimine
  bağlar, API anahtarları argv'de değil `buildSecretEnv` ortamında
  (özellik kapalıysa miras bırakılmaz), sohbet bağlamı 8MB sınırlı
  0o600 tmp JSON dosyasında, argv birim sınırı 30k (Windows
  CreateProcess), stdio-null kontrolü, terminal mandalı (tek done/error),
  NDJSON satır tamponu 32MB + taşma olayı, stderr 8k→4k kuyruk,
  close handler'ında kuyruk-terminal persist + sentetik terminal +
  iptal geç-kaldı (`cancelTooLate`) + temp dizini sahiplik-kontrollü
  temizlik + yarim çıktı geri alımı (ownerPid), updateYtdlp venv-kapısı
  + 10 dk zaman aşımı + tek-iş slotu.
- **CEA tam-yakalama hattı** (9926–10434): en düşük bant varyantı,
  beklenen süre retain + staleness kapılı prob, otomatik yeniden
  deneme ≤2 tur (manifest yenileme + `mergeCeaCaptureSegments` —
  kayan listenin penceresi korunur), checkpoint batch (20 segment)
  + partial/error'da zorlamalı, segment sıralama `shouldPause` ile
  decoder'a asla ters besleme yok, refresh-manifest `retryAction`
  → plan yeniden çözümü + segment remap, native-track referansıyla
  ≥0.05s kalibrasyon, kayıtlı checkpoint cue'ları geri yüklenir ama
  decoder durumu SERİLEŞTİRİLEMEZ → parçalar baştan doğrulanır
  (yorum belgeli), resume yalnız partial/error/cancelled + aynı
  kaynak, EXT-X-GAP indirilmez, komşu-segment kurtarma ±1/+2.
- **CDP payload işleme** (10683–11102): bağlam bayatlığı giriş +
  her await sonrası (`requireActiveTransaction`), gövde sınırı,
  payload dedupe + in-flight paylaşımı, manifest transaction
  begin/commit (duplicate/not-modified/backoff/cooldown),
  DASH init-segment dedupe + timescale/trex çözümü + başarısızlık
  işareti, `browserDashSubtitleMatchers` 10k sınırı, iz listesi
  24 sınırı, refresh-manifest tek-geç yeniden-getirme (fingerprint
  değişmeli), JSON-manifest'ten çıkan altyazı URL'leri
  `fetchAndStoreBrowserSubtitle` → `fetchBrowserBuffer` → SSRF
  kapısından geçer, manifest retry timer'ları key'li tek seferlik.
- **getBrowserCapturedResponseBody** (11073–11102): CDP
  Network.getResponseBody 3 denemeli (yalnız retryable adayda),
  üstel geri-sağlama 150ms·2^n, bağlam bayatlığı her turda.
- **İndirme fetch yığını** (9382–9675): protokol/userinfo/uzunluk
  kapıları, `assertPublicBrowserSubtitleUrl` DNS + genel-IP +
  `{address,family}` pin; DIRECT zincirde Node-pinning (rebinding
  kapalı), proxy/belirsiz/interceptor'da Chromium yolu (DNS
  kontrolü sürer), DIRECT-bacak düşerse proxy yedeği (ilke hatası
  ESUBTITLE_LIMIT/iptal yedeklenmez), redirect ≤5 + her hop
  yeniden-doğrulama + yeniden-pin, same-origin çerez + Secure
  kapısı http'de, byteRange 206/Content-Range/bayt-sayısı sıkı
  doğrulama, retry kararları ilke/taşıma ayrımı.
- **CEA segment çözücü** (9677–9924): tam-yakalama işi manifest
  sırasını sahiplenirken CDP kopyası atlanır (decoder geriye
  sarmaz), varış-bekleme decode zinciri DIŞINDA (kilitlenme
  belgeli), ≤350ms sınırlı erken-seq beklemesi, playlist+
  discontinuity anahtarlı decoder kuyruğu (playlist başına
  serileşmiş), AES-128 anahtarı pinli fetch + 1KB + önbellek
  + hata tahliyesi, init-segment dedupe (encryption/iv dahil
  key), tracks↔instream eşleşmesi + yerel-zaman çizelgesi
  tespiti + offset düzeltme, tüm koleksiyonlar sınırlı
  (arrivals/decoders/inits 64, fetched 20k, matchers 20k),
  `saveBrowserTrackToConfiguredFolder` sanitize+windowsSafe
  +sha1 soneki + yedek + atomik-yazma + oku-doğrula + grant.
- **YouTube auth akışı** (1999–2380): PKCE S256 + state +
  127.0.0.1 geçici-port loopback, 10 dk timeout, her yolda
  cleanup, kod/verifier/redirect_uri env'de (argv'de değil),
  refresh-token'siz grant → ephemeral hesap, client değişimi
  TÜM hesapları geçersizler (grant istemciye aittir), device_code
  main'de kalır + verification_url https kapısı, poll'da token
  taşıyan emit'ler renderer'a gitmez, uçuşta iptal `_ytDevice`
  null → hayalet-hesap upsert'i engellenir, revoke O HESABIN
  token'ıyla (aktif değil), browse whitelist + serileştirme +
  generation supersede yalnız aynı-bid, logout önce uçuştaki
  poll'u öldürür, cancel kapanışı 3s bekler (yarışsız).
- **Medya IPC** (18478–18761): ffprobe 4MB bayt-sayacı + 30s,
  gömülü-iz çıkarma sha256 anahtarlı deterministik çıktı adı
  (traversal imkânsız), waveform 50Hz mono ≤12MB + 60s + tek-iş
  + tek-kayıt önbellek, seekPreview süre ≤8s kapısı + stat-anahtar
  + 8MB sprite + 90s + data-URL (CSP img-src file: izinsiz).
- **İş günlüğü + süpürme** (657–894): `sweepStaleChatFiles`
  yalnız kendi regex kalıplarına dokunur, `sweepOrphanOutputTransactions`
  sahibi ölü journalları ownerPid'le geri alır (canlı sahibin
  dosyasına dokunmaz), `pidAlive` ≤0/EPERM muhafazakâr-canlı,
  `redactJobLogArgs` gizli-değer bayrakları + `=`biçimi,
  `sanitizeProcessDetail` OSC/DCS önce süzülür (sıra belgeli),
  `windowsSafeFileName` NFKC katlamalı ayrılmış-kök (COM¹/CONIN$),
  aynı-saniye çakışmada sonekli ad + bayt sayacı mevcut boyuttan,
  stream hatası yalnız kendi akışını siler, 4MB kesim işareti,
  unhandledRejection loglanır.
- **media/invidious handler'ları** (1396–1625): tümü
  `authorizedBrowserSender` + `decideUrlPolicy` + `sanitizeAbsolutePath`,
  `subtitleLangArg` traversal savunması (belgeli), cookieBrowser/
  feed/tab/searchType/features hep beyaz liste, job-slot ayrımı
  + `jobTag==='invidious-stream'` kontrollü iptal.

Not: `createWindow`, `ensureBrowserView`, sayfa-içi enjekte betikler,
manga hattı, OCR/geçmiş/kütüphane/ekran-birleştirme bölgeleri önceki
kampanya turlarında (R321-A–D, R338, R339 ve öncesi) tam veya kısmi
okundu; bu tur yalnız bakiye yüksek-risk bölgeleri kapattı.

Windows etkisi: kod değişmedi (salt okuma); doğrulanan savunmalar
Windows yolları/CreateProcess/win32 davranışlarını da kapsıyor.

## R346 — main.js bakiye derin okuması 2: yaşam döngüsü + dış servisler (temiz)

İkinci turda ~2.000 satır daha okundu — kalıcılık/dış-çağrı/enjeksiyon
yüzeyleri. Doğrulanmış bug yok.

- **Ayarlar/abonelik dışa-içe aktarma + RSS** (18180–18479): export'ta
  2MB sınır + dosya-adı beyaz listesi + diyalog seçimi + atomik yazma;
  import'ta main parse ETMEZ (renderer'a ham metin, main sınır okur);
  `settings:import` parseImportText sonrası yol değişimi → kullanıcı
  onayı, endpoint değişimi → mevcut anahtarlar YENİ endpoint'e
  TAŞINMAZ (kullanıcıya bildirilir), bütün bölümler doğrulanıp
  writeJsonTransaction ile atomik, watch kütüphanesi sürümlü depo
  (düz JSON bypass yok), notlar normalize+http kapısı;
  `subs:rssFeed` UC-id regex'i, URL yalnız doğrulanmış id'den kurulur
  (SSRF kapalı), 30 kanal/8sn/4-eşzamanlı/256KB sınırlı akış okuma.
- **subs:shift + burn-in hattı + kurtarma** (18764–19292):
  `shiftTimecodes` sıfır-altı cue bloğunu boş-satır/WEBVTT sınırına
  kadar tümüyle kaldırır (YARI yok), `subs:shift` dosyayı kodlama-
  tespitiyle okur (düz utf-8 yazımı eski cp1254 dosyaları bozuyordu —
  belgeli) + backupOnce + atomik yazma; `ffSubtitlesArg` tek-tırnak +
  sürücü iki-nokta kaçışı; `stageBurninSubtitle` UUID'li ASCII adla
  kopya (orijinal el değmez); `burninRecovery` normalize + yol-eşleşme
  kapısı + .bak + id-eşleşmeli clear; `processNameForPid` tasklist/ps
  ad-doğrulaması (sadece pid-alive yetmez — yeniden kullanılmış pid'i
  süzüyor); `burnin:start` latch + model-işi çakışması + önceki
  kurtarma id+yol eşleşmesi yoksa reddeder + `-progress` pipe +
  yuvarlanan errTail'de eksik-glif taraması (parça-bölünmesi belgeli)
  + kurtarma kaydı job-object altında + hata yolunda geçici temizlik
  + iptal-sonrası-başarı da done; `recovery:recover` await-sonrası
  latch yeniden kontrolü + externalRunning/canFinalize/alreadyDone
  ayrımı + yeniden-başlatmadan önce eski çıktıyı yedekten geri koy;
  `discard` aynı yaşayan-süreç kapısı.
- **Enjekte yakalama betikleri** (11393–11652): idempotent kurulum,
  epoch-etiketli kuyruk (seek tüm eski girişleri düşürür), url+
  fingerprint dedupe + 120-set/128-kuyruk sınırları + in-flight
  evict, fetch `clone().text()` (gerçek yanıtı tüketmez), XHR
  open/send şeffaf wrapper + responseType'a göre body (arraybuffer/
  blob chunked btoa — fromCharCode arg sınırı), seek once-listener,
  drain lease-ack 15s + deliveryId doğrulaması + 32-batch,
  release 4-deneme backoff (900·2^n ≤15s), JSON.stringify + U+2028/
  U+2029 kaçışı (sayfa içinde eval kırılmasın).
- **İzleme klasörü + atomik yazıcılar + kuyruk okuma** (2416–2695):
  `scanWatchFolder` nokta-atlama + bir-seviye + MEDIA_EXTS +
  çıktı-varlığı önbelleği + kararlılık sayacı + kalıcı-hatada 5dk
  yeniden-deneme + watchSeen GC; `watch:start` canonical + isDirectory
  + diyalog onayı + **TOCTOU** (onay sonrası path yeniden
  doğrulanır) + ilk tarama çıktı-temelli (queued damgası yalnız
  gerçek çıktıya); `watch:report` resolve-temelli entry + durum
  beyaz listesi + error→5dk; `backupOnce` tek-.bak;
  `writeSubtitleAtomic` BOM yalnız srt/ass/ssa + validate-then-rename
  + tmp temizliği; `writeTextAtomic`/`writeJsonAtomic`/`writeBufferAtomic`
  tmp→rename (buffer'ta pid+uuid tmp — eşzamanlı yazıcılar);
  `readQueueStateRaw` primary+.bak + 8MB kapı + `_oversized` işareti
  (sessiz sıfırlama yok); `writeQueueState` .bak-rotasyon;
  `loadQueueState` running→pending onarımı yalnız invalidCount=0'da
  persist (bozuk dosya forensik korunur).
- **Altyazı dizini süpürme/iz-geçersizleştirme/reset/tercihler/stream-key**
  (5688–5917): `sweepBrowserSubtitleFiles` web-*.srt iğnesi + yaş-
  ve-sayı üst sınırı; `trackBrowserSubtitleFile` aktif yayınlar
  LRU'dan korunur; `invalidateBrowserTabSubtitles` scheduler slot
  ÖNCE bırakılır sonra cancelAll (senkron onState yarışı belgeli);
  `resetBrowserCaptureState` tam durum temizliği + üretim artışı +
  acquisition plan renderer'a yeni kimlikle ÖNCE yayımlanır (bayat
  persisted-track reddi belgeli); `browserTrackStreamKey` segment/
  volatile-param katlaması + sabit sıralama; tercih deposu
  writeMirroredJsonAtomic (yedek yalnız doğrulanmış durumdan).
- **SponsorBlock/DeArrow/RYD + unloadBrowserTab + browser:command**
  (14955–15393): üç fetch'er da sabit-https-host + hash-prefix
  (videoId Gitmez — SponsorBlock/DeArrow) + credentials:omit +
  sessionCookies:false + redirect:error + 7s zaman aşımı gövde
  boyu canlı (belgeli) + boyut kapısı + negatif-önbellek + in-flight
  dedupe; `browserTabRuntimeState` 1.8s timeout + bilinmezde
  stateKnown:false; `unloadBrowserTab` split-ikincil koruma +
  capture-pending kapısı + await'lar arası üç karar yeniden-kontrolü
  (resourceActionSeq) + tüm timer'lar temizlenir + retry/crash
  bütçesi dirilen sekmeye SIZMAZ + mini-pencere kapatılır +
  debugger detach + izin iptalleri + loadError sıfırlanır;
  `browser:command` sender=mainWindow.webContents katı kontrol +
  medya komutlarında probe→rank→context-yeniden-doğrulama→mutate
  (yan etki geri alınamaz; bayat komut yeni belgenin video'sunu
  seek'lemesin).

Windows etkisi: kod değişmedi (salt okuma).

## R347 — main.js bakiye derin okuması 3: IPC dayanıklılık yüzeyi (temiz)

Üçüncü turda ~1.980 satır daha okundu — diyalog yetkilendirme, geçmiş/
kütüphane/araştırma, kabuk yolları, model/benchmark, oturum paketi,
yer-imi/places, overlay, manga + sayfa-çevirisi IPC bloku. Doğrulanmış
bug yok.

- **Diyaloglar + medya tarama** (17139–17515): `dialog:openVideo/
  openFile/openFolder/openFolders/openInputFolder` yalnız kullanıcının
  seçtiği path'i grant eder; `authorizeMediaFile` diyalog + onay-sonrası
  `inspect` tekrar karşılaştırması (junction swap TOCTOU belgeli);
  `scanMediaFromPaths` canonical+visited+derinlik/sayı sınırı + sayısal
  doğal sıralama; `authorizeMediaScanRoots` onay öncesi/sonrası kök
  listesi bayt-eşit olmalı; `media:listFolder` authorize→aynı klasör
  maxDepth 1 + 5000 sınır.
- **Geçmiş/kütüphane/notlar** (17401–17865): `history:authorizeFiles`
  kayıt-bazlı (listeleme yetkisiz), `imported` kayıtta UNC/NTLM
  reddedilir ve yalnız kayıtlı girdi/çıktı köklerinin içindeki
  gerçek-yol altyazılara grant; `library:remove` not varken medya
  satırını korur (CASCADE'yi belgeli engeller), işlem transaction +
  başarısızlıkta restore; `library:search` kuşak-sayacı iptali;
  `annotations:toggle` saved=false iken eşleşme yoksa `missing` gerçeği
  (B83-18), `mediaUrl` http-kapısı + kalıcı-kayıt normalizasyonu;
  `research:export` writeTextAtomic; `review` beyaz liste dereceleri;
  `exportAnki` yalnız quote, diyalog yolu `.apkg` normalleşir, stdin
  ≤32MB, tek-iş + 2dk timeout + terminateProcessTree + son satır JSON
  + çıktı varlığı.
- **Kabuk/bildirim/pano** (17773–17904): `openPath`/`showInFolder`
  uzantı beyaz listesi + erişim kümesi + diyalog + `canonicalLocalPath`
  TOCTOU tekrar-kontrolü; `openExternal` → `openExternalByPolicy`
  (R326-4); `notify` WeakMap başına 3s throttle + başlık/gövde
  kesilmesi; `clipboard:write` ≤4MB; `probeCommand` stderr resume +
  UTF-8 akış-dekoder + 256KB sınır + 30s timeout (hepsi belgeli
  savunmalar).
- **Model/env/ayar/kuyruk** (17908–18179): `models:delete` KNOWN_MODELS
  + iş-kapısı + uyarı diyaloğu; `models:benchmark` GPU-dışlayıcı kapı
  diyalog ÖNCESİ ve SONRASI (belgeli TOCTOU), tüm argümanlar whitelist
  veya kelepçeli + `pushBoundOption`, 20dk timeout, stdout/stderr
  kesilmiş, clipHash'li tarih 20/40 sınırı; `translation:probe`
  safeTranslationEndpoint + NFC/uzunluk/kontrol-char kapısı;
  `settings:save` kısmi birleştirme (main'in tuttuğu alanlar silinmez);
  `releaseQueueTerminalGuards` terminal-durum el-sıkışması + GC.
- **Oturum paketi / places / overlay / manga / sayfa-çevirisi IPC**
  (15580–16516): `session:export` persist→snapshot→paket→diyalog→
  writeBufferAtomic+checksum; `session:import` kuyruk+mutation
  serialize, 64MB kapı, inspectPackage, variant id remap, yerel
  sitePermissions/siteTerminology pakette taşınmaz (dışa aktarımda
  düşürülür — belgeli), active/split id yeniden doğrulaması, clamped
  ratio; `updateTab` canlı URL renderer iddiasını ezemez + yeni
  subtitleSelection yalnız önceden grant'lenmiş dosyaya; `setOverlay`
  whitelist+kelepçe+boundedIpcRows + transform fallback eşleşmesi
  (renderer ile aynı olmalı — belgeli); manga IPC'lerinde
  active-tab+staleness, `manga:clear` retryable:0 explicit (belgeli),
  `manga:toggle` DOM'da katman kaldıysa durum sıfırlanır;
  sayfa-çevirisi handler'larında session+generation eşleşmesi her
  await'te, exclusions akışı rescan→exclude→apply→pending→archive
  sırası, `retrySection`/`retryFailed` çalışan işte kapılı,
  export'ta uzantı normalizasyonu; harici oynatıcı (mpv/vlc) sabit
  yol listesi.

Windows etkisi: kod değişmedi (salt okuma).

## R348 — main.js bakiye derin okuması 4: yoklama/live-ASR/capture yüzeyi (temiz)

Dördüncü turda ~1.460 satır okundu — sayfa-içi eylem köprüsü, cloudflare
prob durum makinesi, yakalama flush/onay akışı, manifest kurtarma,
medya yoklamaları, canlı Whisper işi, harici oynatıcı + okuma listesi
+ arşiv IPC'leri. Doğrulanmış bug yok.

- **Sayfa-eylemi köprüsü + cloudflare probu** (11695–11970):
  `handleBrowserPageAction` bridgeToken kapısı + her DOM çağrısından
  sonra session/generation eşleşmesi; edit'te `pre` mevcut çeviriyle
  eşleşmeden yazılmaz (optimistic concurrency), bellek yazımı exact
  varsayılan / site yalnız opt-in, retry tek-uçuş + result ack;
  `settleRejectedRetry` eski kuşağa result göndermez.
  `performBrowserPageInstrumentation` 'unknown' fail-closed (kanca
  kurulmaz, 1,5 sn unref yeniden ölçüm ≤240), 'active'te kancalar sökülüp
  debugger ayrılır, 'clear'da kanca+debugger geri kurulur ve bekleyen
  overlay/manifest kurtarma tetiklenir; `suspendBrowserInstrumentation
  ForNavigation` tüm probe/manifest/debugger alanlarını sıfırlar.
  `setBrowserTabCompatibilityMode` actionSeq + await-sonrası
  kimlik/mod yeniden doğrulaması (belgeli).
- **Capture flush/drain** (11976–12302): flush↔reset promise tek-uçuşu
  (her biri yalnız kendi kaydını siler), drain sonucu bağlam kontrolü
  olmadan ACK/RELEASE eski belgeye gönderilmez; retry sonucu RELEASE'a
  düşer, işlenen ACK; kare başına dropped-delta tek-seferlik raporu;
  `probeActiveBrowserTracks`/`probeActiveBrowserMedia` busy-latch +
  generation + compat/cloudflare/pending kapıları; media örneği
  güvenilmeyen getter'lar finitize edilir (belgeli: oran 4x'e
  kelepçelenmez — gözlenen gerçektir), signature-change'te event +
  1,5 sn debounce persist; manifest kurtarma busy+seq, URL başına
  done/2-deneme/60s/5s dedupe ≤96 kayıt, sniffing (MPD/EXTM3U) öncelikli.
- **Live-ASR + görüntü yakalama** (8338–8642, 8875–9088, 16514–16759):
  `startBrowserLiveAsr` tek-iş + model-süreç kapısı + KNOWN_MODELS/
  device/computeType/dil whitelist'leri; NDJSON 8MB + overflow uyarısı;
  stdin 'error' dinleyicisi (EPIPE çöküşü belgeli); chunk silme yalnız
  iş-sahibi kayıtlı path'ler; CUDA'dan CPU'ya tek geçişte bekleyen
  chunk'lar yeniden beslenir, senkron launch hatası sahneyi kapatır;
  `stopBrowserLiveAsr` job'ı erken null'lamaz (son cue'lar düşmesin —
  belgeli), 15s unref terminate. displayMedia handler üst-doküman +
  userGesture + audioRequested + aktif-iş kapısı, yalnız loopback.
  `captureBrowserFullPage` bekleyen attach'i bekler, kendi attach'ini
  yalnız başka sahip/in-flight yoksa bırakır (belgeli), 30kx30k +
  120Mpx sınırı; `captureBrowserVideoFrame` probe→rank komut
  sıralamasıyla aynı, nested-frame güvenli kırpma konumu
  doğrulanamadığı için reddeder (belgeli), hide→shot→restore.
  `player:external` mpv/vlc whitelist + dosya adı stem'i doğrulaması +
  URL için decideUrlPolicy external+http(s); element picker tek-iş +
  CSS.escape + Esc iptal + capture-dinleyici temizliği; readingList
  store-atomic, open kendi deposundaki file://'u yükler; pageIndex
  generation kapısı açıkken eski extract'i yeniden-dolduramaz.

Windows etkisi: kod değişmedi (salt okuma).

## R349 — main.js bakiye derin okuması 5: popup/nav + medya yardımcı süreçleri (temiz)

Beşinci turda ~1.130 satır okundu — window.open/popup yaşa­m döngüsü,
görünüm yerleşimi ve hata eşlemesi, bağlam menüsü eylemleri, görsel
kaydetme/dönüştürme, media/YouTube/Invidious alt-süreç sarmalayıcıları
ve OAuth/oturum deposu. Doğrulanmış bug yok.

- **Popup + görünüm düzeni** (5066–5260): `browserWindowOpenHandler`
  decideUrlPolicy + external→openExternal+deny + popup bütçesi;
  `configureBrowserPopup` secure prefs + sanitize UA + recursion +
  navigation guard detach-on-close; `safeBrowserBounds` ana-pencere
  kelepçesi; `secondaryBrowserTab` sayfa koşulunu görünürlük kapısıyla
  aynı tutar (belgeli) ve boşaltılmış sekme restoredUrl üzerinden
  ikincil olabilir; gizli görünüm sınırı ekran dışına taşınır (Windows
  HWND pointer-yutma belgeli); `browserTabShouldBeVisible` + fullscreen
  tüm sekmeleri kapsar.
- **Navigasyon + hata + bağlam menüsü** (5266–5688):
  `openBrowserLinkInNewTab` decideUrlPolicy (userinfo reddi B83-03) +
  MAX_SESSION_TABS + navigationRequestSeq + compat önce + await-sonrası
  staleness + ERR_ABORTED reddedilmez; `loadedDirectBrowserMedia` yalnız
  ERR_FAILED + medya uzantısı + aynı-URL + readyState/videoWidth
  doğrulaması (belgeli — gerçek ağ hatası gizlenmez);
  `browserLoadError` errno→messageKey matrisi (VPN/QUIC dahil);
  `browserHistoryTargetUrl` navigationHistory API + normalize;
  `navigateBrowserHistory`/`reloadBrowserTab` kimlik+seq+aktif-sekme
  yeniden doğrulaması + compat; bağlam menüsü `actions` tablosu:
  link/image URL'leri decideUrlPolicy'den geçer, medya eylemleri
  renderer'ın browser:command yoluna devir eder (belgeli),
  copy/cut/paste/select-all wc çağrısı, spell-add/replace wc üzerinde,
  `saveBrowserContextImage` http(s)+image/*+50MB kapısı + PNG
  dönüştürme sandbox'lı offscreen pencerede (webRequest yalnız
  about:blank/data: izinli + 80Mpx + PNG magic doğrulaması).
- **Medya yardımcı süreçleri + oturum** (901–1396): üç wrapper
  (media.py/youtube.py/invidious.py) aynı sağlam iskelette — slot tekliği,
  NDJSON 8MB, whitelist result-type, stderr tail sanitize+log, timeout
  kind-başına, 'subs' yolu subtitleFileAccess.grant, close'da flush+
  own-slot temizleme. `ensureYoutubeAccessToken` tv/custom kapısı +
  60s marj + ephemeral null + tek-uçuş + account-identity yeniden
  doğrulaması (bayat yenileme yenisiyle çakışmaz — belgeli) +
  invalid_grant hesabı düşürür. `isLocalInvidiousInstance` https veya
  yalnız yerel/özel host (localhost/127./10./192.168./172.16-31/.local/
  ::1/fc/fd) + sayısal-önekli DNS sahtesi kapısı (B-323-02 belgeli);
  `invidiousAuthEnv` SID yalnız kendi instance'ına + yalnız yerelde.
  YouTube/Invidious oturumları SafeSecretStore'da; persistableAccounts
  ephemeral hesapları ve kısa ömürlü token'ları diskten dışlar.

Windows etkisi: kod değişmedi (salt okuma).

## R350 — main.js bakiye derin okuması 6: depo katmanı + oturum geri-yükleme + pdfProtocol (temiz)

Altıncı turda ~995 satır okundu — geçmiş/kütüphane/not/favicon depoları,
sekme-oturumu geri yükleme, kaynak anlık görüntüsü, indirme kayıtları,
whisper-pdf protokolü + PDF kayıt/indeks/istek normalizasyonu, çeviri
endpoint çözümü + sınırlı yanıt okuma. Doğrulanmış bug yok.

- **Depo katmanı** (3048–3496): `loadHistory` ana→.bak sıralı geri
  düşüm (belgeli — öncesi tüm geçmişi siliyordu); `saveHistory`
  mirrorBackup'ta önce .bak'a yazıp ana dosyayı korur (R86-03);
  `addHistory` aynı-girdi dedupe. Watch kütüphanesi Store + tombstone
  depoları lazy-singleton; `watchIndex` unavailable-latch + tek sefer
  legacy göç + `pruneAndSweepTracks`'e CANLI referans kümesi (açık
  sekmeler + kalıcı oturum + workspace trackRefs, R83-27/R86-02).
  `ensureBrowserNotesReady` needsLegacyImport göçünde store hatasını
  boş JSON'a yutmaz (belgeli) — `migrationError` kalıcı; JSON notları
  birincil kaynak, SQLite arama gölgesi. `subtitleTextForSearch`
  inspect+has+isFile+8MB+mtime-LRU≤32, oynatıcıyla aynı kodlama
  yolu (belgeli cp1254 paritesi); `subtitleSeconds` toleranslı VTT
  (tek haneli dakika) + ASS centiseconds; `searchWatchLibrary`
  event-loop'a bırakır (belgeli 1711 ms blok düzeltmesi) + `isCancelled`
  + `loadWatchLibraryAll` taşma kayıtlarını da tarar + 5-eşleşme
  sınırı + index/annotation hit dedupe + sentetik öğe.
- **Oturum + kaynak snapshot** (4049–4268): `scheduleBrowserSessionSave`
  trailing debounce + ≤10s yaş-sınırıyla zorunlu yazım (belgeli —
  konum churn'ü timer'ı açlıktan öldüremez), finalize-sonrası yazmaz;
  `restoreBrowserSessionState` cleanExit=false→kurtarma uyarısı,
  restoreEnabled kapısı, sekme-kayıt + subtitleSelection grant,
  active/split id doğrulaması + ratio kelepçesi + kapanış işaretçisi
  anında persist; `browserEventContext` tam kimlik demeti;
  `isCurrentBrowserContext` bütün tuple'ı yeniden doğrular;
  `requestBrowserPageResourceMetrics` requestId+timeout+tekil resolve;
  `browserResourceSnapshot` app-metrics + sekme sayfa/overlay
  birleşimi + debugger-attach sayısı + bütçe özetçesi.
- **pdfProtocol + çeviri köprüsü** (5917–6051, 7141–7340): media
  kimliği değişince altyazı+iz+tercih sıfırlanır (belgeli stream
  ayrımı); `browserTranslationConfig`/`Manga` dil regex + kelepçe +
  glossary ≤200 + manga inherit zinciri; `safeTranslationEndpoint`
  https veya localhost-http + /chat/completions normalize + query/hash
  atılımı; `readResponseBufferLimited` content-length ön-kapı +
  akışta sayım + overflow'da reader.cancel+releaseLock;
  `whisper-pdf` handler Origin null/file kapısı + referrer kapısı
  (absent-kabul belgeli) + host 'document' + GET/HEAD + 64-hex
  resourceId (nonce-karışık sha256 — R191) + pdfFileAccess has+inspect
  kimliği + RFC range (suffix/416/206) + akış gövde;
  `inspectPdfDocument` canonical+stat+head/tail hash planı + ≤100 LRU;
  `preparePdfPageRequests` ≤3 sayfa, güvenli-int pageNumber, 8000/2000
  item/block, 16k/400k toplam sınırı, transform 6-sayı kesimi,
  viewport eşleme.

Windows etkisi: kod değişmedi (salt okuma).

## R351 — main.js bakiye derin okuması 7: spawn/tek-örnek + CDP attach + ad-prune/capture IPC (temiz)

Yedinci turda ~770 satır okundu — spawn güvenlik sarmalayıcıları +
uygulama bayrakları + tek-örnek kilidi, CDP gövde yakalama + Fetch
duraklatma/prune + debugger attach, adblock/prune/capture/compat
IPC geçişleri. Doğrulanmış bug yok.

- **Süreç + açılış** (311–590): `spawn`/`spawnSync` env'i
  `withoutSecretEnv(process.env)`'e indirger (secret sızmaz);
  `disable-quic` VPN/tünel workaround'u belgeli; pakette
  remote-debugging switch'leri kaldırılır; whisper-pdf/assets
  privileged-scheme kaydı; hızlandırma yalnız kayıtlı false'ta kapanır;
  tek-örnek kilidi → ikinci örnek pencereyi öne getirir; resource-soak
  kendi userData'sıyla izole (belgeli); manifest registry 3-deneme/128
  giriş/30s cooldown.
- **CDP yanıt + prune** (11101–11295): `captureBrowserResponse` —
  pending'den al, context/expired/12MB/compat kapıları; CEA-segment
  2xx-dışı gövdeyi "yakalandı" saymaz (belgeli), 304 boş gövde,
  gövde-sonrası context yeniden doğrulama + base64 ayrıca sınır;
  `handleYoutubePlayerResponsePaused` tek-continue latch + tüm kapılar
  (etkinlik/aktif-sekme/compat/sessionId/URL/status) + prune
  değiştirmediyse continue + fulfill öncesi kimlik/generation yeniden
  doğrulaması + entity-encoding başlıkları ayıklanır + hata fail-open
  snapshot; `attachBrowserDebugger` WeakMap ownAttempt mandalı (belgeli
  — bayat deneme yeni bağlantıyı koparamaz), her komut arası `current()`
  kontrolü, 1.5s timeout, `ready` yalnız current'te; `ensureBrowserDebugger`
  promise dedupe; `browserTrackProbeScript` shadow-root'ta en-büyük
  video + disabled→hidden cue doldurup geri yükleme + FNV-1a
  fingerprint (orta-liste değişikliği yakalar, belgeli) + prefix-hash
  ile yalnız-yeni-cue emisyonu + data: src ağ kimliği sayılmaz
  (belgeli — iz birleşmesi önlenir).
- **IPC geçişleri** (15388–15582): `adblock:setEnabled` reloadRequired;
  `playerAdPrune:setEnabled` — enable Fetch.enable veya attach, disable
  Fetch.disable + yalnız capture da kapalıysa detach; başarısızlıkta
  geri dönüm + failOpen snapshot + dostu hata; `sponsorBlock:get`/`videoExtras`
  videoId zorunluluğu + allSettled bağımsız hata yüzeyi;
  `capture:setEnabled` stateGeneration+registry/timers/pending/ranges
  temizliği + sayfa reset + enable→hooks+toggle+attach, disable→toggle
  + Network.disable + auto-attach off + yalnız prune kapalıysa detach;
  `compatibility:setEnabled` host-scope tüm sekme uygulaması + per-tab
  olay + anında save + reload.

Windows etkisi: kod değişmedi (salt okuma).

## R352 — main.js bakiye derin okuması 8: manga çeviri hattı (temiz — kapsam tamam)

Sekizinci ve son tur ~930 satır okundu — manga aday tarama, SSRF-korumalı
görsel indirme, görsel-model çağrısı, önbellek/OCR katmanı, bölge
düzenleme ve retry işçi havuzu. Doğrulanmış bug yok; bu tur ile
`src/main.js`'in 19.959 satırının tamamı kampanya içinde satır satır
okunmuş oldu.

- **Konum + yaşam döngüsü** (7407–7479): `mangaJobIsCurrent` tam kimlik
  (job + signal + generation + view); `captureBrowserMangaPosition`
  busy-latch + aktif-sekme + documentId eşleşmesi + await-sonrası
  yeniden doğrulama; `restoreBrowserMangaPosition` generation-başına
  tek deneme + yanlış-doküman kapısı + isCanceled dörtlüsü
  (aktif/generation/el-kaydırma/destroyed); `stopBrowserManga` abort +
  sayfa/deneme/hata listesi temizliği (belgeli — bayat aday kota yakar
  ve yanlış katman basar).
- **SSRF-korumalı görsel indirme** (7481–7760): data-URL boyutu
  Buffer'dan ÖNCE sınırlanır (belgeli); `assertPublicMangaImageHost`
  literal-IP veya DNS tüm yanıtları public olmalı; `mangaRequestReferrer`
  https→http Referer göndermez (strict-origin paritesi, belgeli);
  `requestPinnedMangaImage` DNS-pinned lookup (doğrulanan IP bağlanır —
  rebinding güvenli), çerez yalnız https, 14MB gövde, 30s, abort
  yönlendirmesi; redirect zinciri ≤4 ve her adım `isSafeMangaImageUrl`;
  MIME whitelist + magic-byte yedeği; `nativeImage` çözemezse sayfa
  OffscreenCanvas decode yedeği ≤12MB (belgeli AVIF); piksel ≤14M
  resize + gövde ≤7.5MB→JPEG90→≤9.5MB→0.82× (belgeli %33 şişme);
  `fetchMangaImage` kaynak başına 2 deneme + yalnız retryable.
- **Model çağrısı + işçi havuzu** (7762–8335): `requestMangaTranslation`
  AtEndpoint — endpoint/apiKey kapısı, strict schema yalnız tek-uçta
  (belgeli Shuaiapi uyumu), 90s abort, 8MB sınırlı yanıt + 64KB hata
  detayı ≤300 karakter, schema'sız düşüm 401/403/413/429 dışında;
  uçlar arası failover `shouldFailoverTranslationStatus` kapısıyla,
  429 bütçesi 2 + server-hint gecikme, tek-uçta ek geçici deneme;
  `fatalMangaBatchError` görsel-indirme hatası asla ölümcül değil,
  401/403/404 ölümcül, 400 yalnız görsel-özel olmayan mesajda
  (belgeli); `translateMangaCandidate` job-current öncesi/sonrası,
  negatif-önbellek 24s TTL (belgeli balonsuz sayfa), OCR-katman
  yeniden kullanımı worker eşzamanlılığıyla + abort, `imageRequests`
  dedupe; `applyMangaEditFromPage` bridgeToken + `pre`/preHidden
  optimistic-concurrency → ret'te izole-dünya-farkındalı revert
  (belgeli — ana-dünya revert !s ile sessiz çıkıyordu) + cache;
  `startBrowserManga` tüm kapılar + clear-await sonrası yeniden
  busy-check (belgeli çift-tık yarışı), aday taraması trusted
  main-frame'de (belgeli — çerçeve-dışı şişkinlik), kararlı-tarama
  döngüsü ≤6 + 650ms + job-current, işçi havuzu min(workers,
  seçili), aday başına 3 deneme + retryable backoff, fatal hata
  batch'i keser, incremental hatalar ≤120 tutulur.

Windows etkisi: kod değişmedi (salt okuma).

## R353 — renderer.js orta bölge derin okuması: medya yaşam döngüsü + find&replace + görev merkezi (temiz)

~2.070 satır okundu (17228–19254 + 19868–21241). Doğrulanmış bug yok.

- **Konum + sürükleme + görsel işaretler** (17228–17506): subtitle drag
  pointer-capture + 4px eşik + iptal yolu + yığın/split ayrımı (belgeli);
  idle-hide pause/edit'te askıda; seek-buffered aralık bulma; marker
  sınırı 400 + süre-dışı süzgeci; `youtubeVideoId` çok-biçim;
  `mediaKeyFor` Windows yol normalizasyonu; `savePlayerPosition` —
  canlıda atla, tamamlanma eşiği watch-completion'la aynı (belgeli
  60s→eşik fix), <30s güncellemeyi atla (belgeli — silme kayıt
  kaybediyordu), ≤60 kayıt; `resetMediaBoundState` eksiksiz temizlik +
  offset sıfırlama (belgeli — gecikme sonraki videolara taşınıyordu).
- **Altyazı kanal/mode yönetimi + media geçişi** (17507–17837):
  `applySubtitleTrackSelection` birincil-çeviri doğru katman eşleşmesi;
  `setSubtitlesVisible` son-mod geri açılımı (Y11); `setMediaKey` —
  eski medya flush, YouTube↔YouTube ytInfo düşürülmesi (belgeli),
  file: olmayanda playlist tasfiyesi (belgeli hortlak), extras/base
  videoId eşleşmesi (`'\0'` sentinel), pendingSubs yalnız anahtar +
  generation eşleşirse (belgeli — yanlış altyazı yapışması önlenir),
  generation++ tek nokta.
- **In-place yazıcılar** (17847–17991): `cuesToVtt` ms-yuvarlama
  WEBVTT; `replaceTimedCueTexts` VTT/SRT — timing-index doğrulaması
  ±2ms, occupied seti, aşağıdan-yukarı satır değişimi, cue-id/boş-satır
  sınırıyla NOTE/STYLE/REGION korunur (belgeli); `replaceAssDialogueText`
  Format-uyumlu alan indeksleri + son-alan zorunluluğu + beklenen-zaman
  eşleşmesi ±2ms + süslü-parantez→tam-genişlik dönüşümü (enjeksiyon
  koruması, belgeli).
- **Find&replace toplu protokol** (18708–19156): find paneli generation
  + mediaGeneration çift damgalı; prepare doğrulama (cue.text===before,
  timing ≥80ms, browserOverride'da base/revision re-verify, aynı-dosya
  tek-state kapısı, aynı-cue çelişki reddi, browserEdits ≤2000);
  `writeSubtitleBulkFiles` sıralı write + hata→ters-sırada rollback +
  rollbackFailed raporu; `subtitleBulkFileStateStillMatches`/`browser`
  varyantı post-write re-verify → mismatch'te dosyaları before'a
  geri yazar; undo kaydı ≤100; ASS inner-tag uyarısı.
- **Görev merkezi + sayfa-çeviri UI + PDF okuyucu** (19868–21241):
  `runBrowserTaskAction` busySet `${job.id}:${command}`; satır render
  tamamen createElement/textContent; `scheduleBrowserUnifiedJobsRefresh`
  250ms tek-uçuş latch; menü vekili `data-browser-proxy` — devre dışı
  hedefler aria-disabled + neden sinyali (belgeli); syncBrowserMenuProxies
  değişmeden yazmaz (mutation döngüsü, belgeli); sayfa-çevirisi UI
  event'leri aktif-sekme/generation/seq korumalı, tüm innerHTML
  escapeHtml'li, terim/seçici regex+uzunluk kapıları; PDF reader —
  lazy import, renderGeneration + `player.pdfReader===reader` kimliği +
  rendering-set dedupe + sayfa-sırası korunarak insert + print-intent
  render (belgeli Windows rAF donması) + `translating` latch ve
  yeni-okuyucu finally bekçisi (belgeli).

Windows etkisi: kod değişmedi (salt okuma).

## R354 — renderer.js alt-orta bölge derin okuması: düzenleme protokolleri + geçmiş + sayfa/senkron (temiz)

~2.100 satır okundu (21924–22223, 23517–24659). Doğrulanmış bug yok.

- **Oto-senkron + çeviri başlatma** (21924–22135): autoSync yalnız
  localPath+subPath varsa, sync fix-framerate/piecewise bayrakları, job
  mediaKey bağlı; `makeTransBtn` — state.running/queueRunning kapısı,
  forceRetranslate değilse retranslateSnapshot sıfırlanır (belgeli —
  başarısız yeniden çevirinin anlık görüntüsü devralınmasın), kaynak
  rolü birincil ya da ikincil kanaldan, `translateExisting` yalnız açık
  çeviri-rolü izi (belgeli — kaynak çeviri sanılmasın), browserTrack
  dili UI seçiminden güvenilir (belgeli), outputFiles korunur
  (belgeli — API hatasında kaynak iz kopmasın), hata yolunda
  outputs geri yüklenir; `retranslateAll` onay diyaloğu + eski çeviri
  snapshot'ı; `quickSubsBtn` forceTranslate yalnız bu iş + iş
  başlamazsa bayrak geri alınır (belgeli).
- **Geçmiş + kütüphane + uyku + görünüm** (22137–23527, 23544–23596):
  history silme/temizleme openAppDialog onaylı; search debounce 120ms +
  isComposing; uyku zamanlayıcısı 15s tick + pause browser'da
  browserCommand; ses slider clamp 0–1; görünüm modları token clamp +
  snapGridColumns reflow (belgeli Chrome interpolate takılması) +
  dar-görünüm takeover inert uygular (playerStage/browserWorkspace/
  pdfReader) + odak-içindeyse takeover başlatmaz; sideWidth clamp
  320–520 + ≥480px video payı.
- **Hızlı editör yaşam döngüsü** (23627–24659): `quickDrafts` şema-
  doğrulamalı okuma (imza/uzunluk/yaş/kanal whitelist) + ≤30 kayıt;
  `quickEditorStillCurrent` tam kimlik (editor örneği + mediaKey +
  tabId + generation + her satırın path/trackId/raw/cue/record
  eşleşmesi); `saveBrowserQuickEditor` → prepare→write→re-verify→
  rollback zinciri + reviewSources snapshot ve storage-hatası geri
  yazımı + undo girişi ≤100; tekil `saveCueEdit` — browserContext'te
  track/mediaKey/editRecordMatches + revision çakışma algısı (belgeli
  metin ekranda), dosya tarafında cueEditTarget signature+path+mediaKey
  kilidi, mergedView değişirse reddetme (belirsizlik), diske yazım
  başarılı olana dek bellek dokunulmaz (belgeli), ASS/VTT in-place
  yazarlar + null'da iptal, imza invalidate + savedCues göçü +
  sözcük aralıkları tazeleme; `applyCueEditHistory` üç varyant
  (bulk/browser-override/single) hepsinde medya+eşleşme+yeniden-
  doğrulama + hata'da rollback.

Windows etkisi: kod değişmedi (salt okuma).

## R355 — renderer.js kapanış turu: bağlamalar + PDF çeviri işçisi + progresif transkripsiyon (temiz)

~1.570 satır okundu (19431–19868 + 21241–21924). Bu turla birlikte
renderer.js'in tamamı (28.830 satır) derin okunmuş oldu; doğrulanmış
bug yok.

- **Bağlama yüzeyi + ayar çekmecesi** (19431–19868): sideResizer tek-
  işaretçi kilitli (pointerId; belgeli çoklu-dokunuş), grid geçişi
  sürüklemede kapanır; ayar paneli snapshot'ı scroll/arama/AI-taslağı
  mediaKey koşullu; initializeSettingsPages yüzey dağılımı persistent/
  diagnostic/live + boşalan kabuğu kaldırır; setSettingsPage scroll
  geri yükler (rAF); setSettingsDrawer odak iadesi çift yollu
  (rAF+120ms), çekmece açılması dar ekranda takeover'ı kurar (belgeli —
  eskiden panel zorla açılıyordu).
- **PDF çeviri işçisi** (21247–21342): `PDF_TRANSLATE_ALL_CONFIRM_PAGES
  =40` maliyet onayı (belgeli); tüm-kitapta metin çıkarma paket başına
  (bellek, belgeli); 3 sayfalık paketler + paket arasında iptal;
  `player.pdfReader !== reader` kimlik kırılımı her await'ten sonra
  (pdfHash çakışmasında eski döngünün yeni okuyucuyu ezmesi engellenir,
  belgeli); partial sayaç kelepçeli; çizilmemiş sayfa metni tahliye;
  durum satırı yalnız okuyucu hâlâ aynıysa yazılır.
- **PDF açılış/kapanış/zoom** (21344–21487): openPdfReader boyut
  doğrulaması (content-length ve buffer), pdf.js worker'a tek kopya
  transferi, ikinci açılışta eski okuyucu close-a tıklatılır (belgeli),
  renderGeneration + Map/Set yaşam döngüsü; close gözlemci+generation+
  iptal+bellek tasfiyesi + browserWorkspace geri açımı (belgeli);
  zoom değişiminde generation++ + yeniden çizim.
- **Progressive transkripsiyon + iş iptali** (21734–21922):
  startProgressivePlayerTranscription üç kaynak ayrımı (browser
  YouTube / youtube: / yerel), formatlar 'srt' zorunlu (belgeli —
  bölümler atomik birleşir), outputNameSuffix `-whisper-<ts>` eşsiz
  (belgeli — ara bölüm hazır .srt'yi ezemez), optsProblem kapısı;
  playerJobCancel: iptal ana süreçte doğrulanmazsa durum geri
  yüklenir (belgeli), aksi halde kapat; syncSubtitlePrimaryAction
  tek-birincil vurgu.

Windows etkisi: kod değişmedi (salt okuma).

## R356 — browser-subtitles.js tam derin okuma: altyazı ayrıştırma çekirdeği (temiz)

2.018 satırın tamamı okundu — browserSubtitleSync'in format ayrıştırma
ve akış-birleştirme çekirdeği. Doğrulanmış bug yok.

- **Entity/metin temizliği** (1–94): `decodeEntities` sayısal entity'de
  sınır/NULL/C0-C1 kontrolü + entity-kodlu bidi enjeksiyonu savunması
  (&#8238;=RLO ayrıştırılırken sıyrılır); geniş ISO-8859-1/Extended-A
  tablosu (belgeli R78-03); üretilen & tekrar çözülmez; `cleanCueText`
  eksik-kapanış O(n²) koruması, ruby rt/rp metni atma, yalnız bilinen
  etiketler (genel `<>` deseni gerçek diyaloğu siliyordu, belgeli),
  BIDI spoofing regex'i, boşluk/satır normalizasyonu.
- **Zaman + cue normalizasyonu** (96–163): `parseTime` birim/ms/saat-
  dakika-saniye/kısa alan formları; `normalizeCues` start≥0+metin
  süzgeci + kırık bitişleri komşuya kadar 8s yama + ≥0.08s kelepçe;
  canlı-caption yuvarlanan-ikiz dedupe (≤1s içindeki birebir metin,
  farklı metadata'lı kayıtları korur).
- **Akış birleştirme** (165–250): `mergeBrowserStreamCues` — tekil-
  parti hızlı yol (stale-growing-regression: gecikmiş kısa hipotez
  tamamlanmış uzun metni geri alamaz, belgeli), batch yolunda revizyon
  anahtarı + tekil-kimlik eşleşmesi (eşzamanlı bağımsız replikler
  hipotez sanılmaz) + kimlik+metin kaymış-revizyon kazanması
  (belgeli B83-S2) + ≤20k sınır.
- **HLS/MPD ayrıştırma** (252–685, 860–998): X-TIMESTAMP-MAP
  LOCAL↔MPEGTS ofseti + 2^33 rollover unwrap; ayraçsız SRT sıra
  numarası ayıklaması + NOTE/STYLE/REGION sınırı; HLS segmentleri —
  BYTERANGE örtük devamı (RFC 8216, belgeli), EXT-X-MAP örtük
  aralık, KEY/METHOD-IV, SKIP zaman defteri, GAP, kayan-listedeki
  aynı URI tekilleştirilmez (belgeli), düşen EXTINF'te targetDuration
  yedeği; DASH — dashOuterBase Period-tabanı (belgeli kardeş-taban
  bug'ı), SegmentList/Template/Timeline, r=-1 açık-tekrar canlı
  kapısı, $Number$/$Time$/SubNumber token'ları, 10k parça üst-sınır,
  dashSegmentOffset'te timescale yokluğunda tahmin yerine init'e
  düşüm (belgeli).
- **MP4/box + TTML** (1000–1853): mp4Boxes safe-integer kapıları +
  size-0 yalnız üst düzey; tfhd/trun/tfdt/trex/mdhd bayrak sürüşü +
  20k örnek sınırı; payl metni; parseXml — TTML ebeveyn-ofset yığını +
  eksik-kapanış ilk-zamanlı-öğeden kesme (belgeli), style/region
  referans çözümü döngü-korumalı, srv3 t/d ms + aAppend devamı,
  p-içi zamanlı span mutlak/göreli heuristiği (belgeli).
- **Yardımcılar** (1859–2017): `browserActiveCuesAt` ikili arama +
  prefix-max WeakMap indeks (belgeli — uzun cue sabit geri-bakışta
  kayboluyordu, şimdi O(log n + aktif)); cueFingerprint akışlı hash +
  \x00-ayraç; findSubtitleUrls derinlik/kardinalite/URL-sayısı
  kapıları + kesinti uyarısı; parseSubtitlePayload sıralı format
  denemeleri (json→xml→vtt/srt→ass→sami→lrc) + 12MB sınır.

Windows etkisi: kod değişmedi (salt okuma).

## R388 — EN/TR geçişinde kullanıcı verisi korunması (2 kusur düzeltildi + ratchet)

20'lik kullanım kuyruğunun 1. görevi: dil değiştirirken altyazı, not,
medya başlığı ve düzenlenen metnin korunması. ui-locale.js mekanizması
yeniden doğrulandı (originalText/originalAttributes WeakMap'leriyle
TR↔EN gidiş-dönüşü kayıpsız; çeviri yalnız birebir anahtar veya tam
eşleşen kalıpla çalışır) ve DOM'a kullanıcı verisi yazan tüm renderer
noktaları `ignored` seçicisine karşı tek tek denetlendi.

**B-388-01 — kullanıcı metni sözlük anahtarıyla çakışınca eziliyordu:**
`ignored` kapsayıcı dışında saf kullanıcı verisi taşıyan düğümler,
metinleri bütün olarak bir sözlük anahtarına eşitse çevrilip bozuluyordu
(ör. "Kaydet" adlı medya dosyası EN'de "Save", "Tamamlandı" adlı video
başlığı "Completed", "Ayarlar" adlı koleksiyon "Settings" görünüyordu).
İşaretlenen yüzeyler (`data-ui-untranslated` — seçici zaten listede):

- `#queueList` → `.queue-title` (iş etiketi/dosya adı)
- `#browserDownloadsList` → `.browser-download-name` (dosya adı)
- `renderUnifiedLibraryResults` → başlık `<strong>` + snippet
- `renderResearchLibrary` → kart başlığı, alıntı `blockquote`,
  `.research-card-translation`, `.research-tag` çipleri
- `renderPlayerLibrary` → izleme satırı başlığı `<strong>`
- `updateCollectionOptions` → koleksiyon `<option>` adları

Bilinçli olarak işaretlenmeyenler (çevrilmesi doğru olanlar):
`.queue-error`/`.browser-download-error` (ana süreç TR dizgileri),
`.queue-status` ve eylem düğmeleri, `.jobs-empty`/`.player-library-empty`,
`.queue-name[title]` (yol/URL — bütün eşleşme imkânsız), `.watch-hit`
(`Not · saat · parça` bileşik — eşleşmez). `<option>`/aria-label
bileşikleri de aynı nedenle bırakıldı.

**B-388-02 — aynı yüzeylerde EN'de TR kalan arayüz kromu:** işaretli
düğümlerin çevirisi dışarıda kalınca yazarlı TR fallback'ler ("İsimsiz
video/içerik/sonuç", "Eşleşen kayıt", "İlk tekrar", "Kaydetme konumu
henüz seçilmedi.", durum etiketleri) `uiText()` üzerinden kuruluyor;
sözlüğe 50 yeni çift eklendi (Alıntı/Kelime/derece düğmeleri, indirme
durumları ve eylemleri, kitaplık boş-durumları, Bitti/Sırada/Kuyrukta,
Yukarı/Aşağı taşı, Aç, İptal et vb.) ve 3 kalıp (`N sonuç`,
`N indirme sürüyor.`, `N içerik · M metin/not eşleşmesi`). Birleşik
durum metinleri (`Son tekrar … · aralık … gün`, indirme etiketi +
byte satırı, kart metası) parça bazında `uiText()`'e sarıldı.

**Kanıtlar:** `tests/ui-locale-userdata.test.js` (yeni) — opt-out
özniteliğinin `ignored`'da bulunması, 10 işaret noktası, sözlük çiftleri,
3 kalıp, uiText sarmaları, veriye uiText sarılmaması, anahtar tekili.
Kırmızı kanıtı: master'da ilk kontrolden düşüyor. `dom-innerhtml-ratchet`
satır-pinleri güncellendi (`toolsMarkup` pini #314'ten beri bayattı);
`browser-downloads.test.js` Node stub'ına `dataset`+`uiText` eklendi
(sahada var olan DOM özellikleri — harness sadakati, davranış değişmez).

Windows etkisi: yok — renderer dizgi/DOM özniteliği işi, platform
bağımsız. Windows'ta elle doğrulanmadı.

## R389 — İş sürerken dil değiştirme: dinamik mesaj çeviri kapsamı (3 boşluk düzeltildi)

20'lik kuyruğun 2. görevi: iş sürerken dil değiştir; ilerleme, hata ve
bildirimlerde eksik çevirileri tamamla. translate() prob'uyla iş başı
dizgilerinin tamamı tarandı.

**B-389-01 — backend aşama metinleri ve ilerleme birleşimleri çevirisizdi:**
transcribe.py'nin `emit("status", text=…)` gönderdiği ~19 TR dizgi
(`Ses çıkarılıyor...`, `Transkripsiyon başladı...`, `Ceviriliyor: X`,
`Model yükleniyor: X (Y)`, `Noktalama onarımı N/M` vb.) ve renderer'ın
kurduğu ilerleme metinleri (`İndiriliyor %N`, `İndiriliyor/Transkripsiyon/
Çevriliyor/LLM düzeltiyor · %N|N/M`, `N blokta hata`, `· kalan ~T`,
`tamamlandı · T`, görev merkezi aşamaları: `Kaydediliyor`, `Oynatıcıya
yükleniyor`, `Hazırlanıyor`, `Çeviri sürüyor`, kart etiketleri) EN
modda TR kalıyordu. Sözlüğe 35+ yeni çift ve 16 yeni kalıp eklendi.

**B-389-02 — OS bildirimi her zaman TR kalıyordu:** `notifyDone` başlık/
gövdeyi (`Altyazı hazır`, `Kuyruk tamamlandı`, `Altyazı çıkarma
başarısız`, `N iş bitti · M hata · K uyarı`, `N segment · M dosya`)
`window.api.notify`'ye çevirmeden veriyordu; OS bildirimi DOM dışıdır,
MutationObserver erişemez. Artık `uiText()` üzerinden geçiyor.

**B-389-03 — görev merkezi yazma-anında EN üretiyordu:** `playerTaskText`
EN dizgiyi doğrudan düğüme yazıyordu; TR'ye dönüşte `toTurkish` kalıp
çıktılarını (ör. `3/12 completed`, `Downloading · 45%`) geri
çeviremiyordu — dil geçişinde sürüklenme. Bloktaki tüm çağrılar ham TR
yazımına çevrildi (observer çevirir + orijinali saklar → gidiş-dönüş
kusursuz); kullanılmayan `playerTaskText` kaldırıldı, 4 yeni birleşim
kalıbı (`N çalışıyor/bekliyor/hata`, `geçen süre T`) eklendi.

**Kanıtlar:** `ui-locale-dynamic.test.js` — 73 örnek, 71 kalıp; yeni
backend-taraması ratchet'i transcribe.py'deki HER `emit("status",
text="TR literal")`'in çeviri kapsamını doğrular (taramada 3 ek eksik
yakalandı ve eklendi); statik kilit: `api.notify(uiText(...))` ve
`playerTaskText` yokluğu.

Windows etkisi: yok — renderer dizgi işi. Windows'ta elle doğrulanmadı.

## R390 — Dar pencerede TR/büyük yazı taşması (2 kusur düzeltildi)

20'lik kuyruğun 3. görevi: dar pencerede (640px = uygulama minWidth
tabanı), TR locale ve zoom ×1.0/×1.5 altında kesilen düğmeleri/taşan
panelleri bul. Yeni Electron smoke'u
`tests/electron-ui-narrow-tr.smoke.js` görünür tüm krom öğelerini
(düğme, menü öğesi, etiket, başlık; kullanıcı-verisi bölgeleri hariç)
üç denetimle tarar: belge yatay taşması, panel sağ-kenar aşımı,
nowrap/hidden altında scrollWidth>clientWidth kırpılması.

**B-390-01 — SmartTube yan rayı ≤720px'de etiketleri kırpıyordu:**
60px rayda `.st-side-label` 9px'e düşse de tek kelimelik etiketler
("Abonelikler" 148px, "Invidious giriş" 168px, "YouTube giriş" 164px)
50px kutuya sığmıyor ve overflow visible olduğu için komşu sütuna
taşıyordu. ≤720px'de etiketler artık gizli (ikon-only ray; anlam
`title`/`aria-label`'da kalır) — 15 `st-side-item` düğmesine görünen
etiketle birebir `aria-label` eklendi.

**B-390-02 — st-topbar arama kutusu sağdaki görünüm düğmesini itiyordu:**
`.st-search-wrap`/`#stSearchInput` `min-width:auto` (input'un doğal
~20ch genişliği) yüzünden ~427px etkili genişlikte `#stDisplayToggle`
görüntü alanı dışına çıkıyordu. `min-width:0` ile arama daralır,
düğme görünür kalır.

**Kanıtlar:** smoke kırmızıdaydı (14+1 kırpılmış öğe), düzeltmelerle
yeşil; menüler/ayar çekmecesi/görev merkezi/indirme+AI+tanı+bul
panelleri/kuyruk-araçları açıkken 640px'de sıfır taşma.
`smarttube-*` ve `electron-smarttube-boot` testleri PASS.

Windows etkisi: medya sorgusu + flex davranışı platformdan bağımsız;
aynı düzeltme Windows'ta da geçerli. Elle doğrulanmadı.

## Yeni araçlar

- `tools/ui-fuzz-coverage.js` — Electron sürücüsü: `webContents.debugger` + `Profiler.startPreciseCoverage`, deterministik yüzey turu + seeded mulberry32 maymun-fuzz (400 adım: %70 tıklama, %20 tuş, %10 metin), console-hata hasadı (`ERROR_ALLOW=/Autofill/i`), kapsam JSON'a yazılır.
- Çıktı: `/home/ubuntu/fuzzcov/renderer-coverage.json` (repo dışı artefakt).

## Sınırlar

- `desktopCapturer` sınıfı smoke'lar gerçek Windows/compositor bekler.
- GPU/CUDA/network-gated fonksiyonlar (`resolve_device_and_compute`, `download_youtube`, `sync_subtitles`, `llm_translate` canlı yolu) bu turda da doğrulanamadı — aynı sınıf daha önceki raporlarda tanımlı.
- V8/CDP kapsamı yalnız derlenmiş fonksiyonları sayar; tembel-parse'lı iç fonksiyonlar sayılmaz — "hiç çalışmadı" listesi üst sınır tahminidir.

## R391 — Kuyruk g4: açık temada seçili/devre dışı/odak/hata kontrastı

20'lik kuyruğun 4. görevi: açık/koyu temada metin kontrastını WCAG
eşiğiyle ölç. Yeni Electron smoke'u
`tests/electron-ui-theme-contrast.smoke.js` her iki temada görünür tüm
krom metnini tarar: normal metin ≥4.5, muted/küçük metin ≥3.0,
devre-dışı ≥2.0, odak halkası ≥3.0 — alfa kompozitli gerçek arka plan
geçişi (effBg) ile. Prob tema değiştirmeden önce geçişleri kapatır;
yoksa `transition: color .2s` ölçümü eski renkte yakalıyordu (ilk
koşudaki ~20 "hata" bu artefakttı — hata değil, ölçüm kusuruydu).

**B-391-01 — açık temada 16 doğrulanmış kontrast ihlali (4 kural):**
oyuncu panel başlıkları sabit `#a1a1a5`/`#96969a` (2.02:1), ayar
çekmecesi `field-label`/`.hint`/`code` sabit `#929297` (2.43–3.05:1),
aktif iş sekmesindeki `#jobsQueueBadge` koyu `#17130c` metin/amber
zemin (2.60:1) — koyu tema amber'ı üstünde doğruydu ama açık temada
`--accent` koyu kehribara (#7f4c15) dönünce okunamaz oldu.
`html[data-theme="light"]` altında üç grup da token'a bağlandı:
`--text-muted`/`--text-dim`/`--accent-contrast`.

**Kanıtlar:** smoke kırmızı (light 16 FAIL, dark 0) → düzeltmelerle
iki tema 0 FAIL; `css-hardcoded-colors` 436/436 (yeni sabit renk yok),
`electron-ui-narrow-tr` hâlâ yeşil. Kırmızı kanıtı master
`styles.css`'iyle tekrar üretildi (16 FAIL).

Windows etkisi: tema token'ları platformdan bağımsız; aynı düzeltme
geçerli. Elle doğrulanmadı.

## R392 — Kuyruk g5: klavye (Tab/Enter/Esc + odak geri dönüşü)

20'lik kuyruğun 5. görevi: menü, ayar ve panel yüzeylerinde gerçek
trusted tuş olaylarıyla (sendInputEvent) klavye davranışını doğrula.
Yeni smoke `tests/electron-ui-keyboard.smoke.js` uygulamanın kendi
penceresinde (gerçek preload+renderer) çalışır: details menülerinde
ArrowDown→öğe, Esc→kapanış+summary'ye odak iadesi, ayar çekmecesi Esc,
alt yazı mod menüsü Esc, komut paleti Ctrl+K/Esc, menü içi form
kontrolü muafiyeti — 12 kontrol.

**B-392-01 — görev merkezi paneli Esc'te kapanmıyordu:** oynatıcı Esc
zincirinde (ytModal→downloads→qr→places→subMenu→…) `#playerTaskCenter`
hiç kontrol edilmiyordu; panel açıkken Esc hiçbir şey yapmıyordu —
İndirme/Yer imi panelleriyle tutarsız. Zincire eklendi; kapanırken
odak `playerTaskCenterToggle`'a döner. Kırmızı kanıtı: master
`renderer.js`'iyle smoke'ta FAIL (playerTaskCenter: Esc açık paneli
kapatmadı), düzeltmeyle 0 FAIL.

**Temiz çıkan yüzeyler:** playerHeadMore/playerLayoutQuickMenu (player
modu) ve appMenu/appModeMenu/browserMoreMenu (browser modu) Esc
zinciri + odak iadesi; details menü ok gezintisi; subtitleModeMenu
tık→Esc; settingsDrawer Esc.

**Ortam sınırları (Windows'ta elle doğrulanmalı):**
- Xvfb'de `sendInputEvent` Enter→native button click üretmiyor; menü
  öğesi aktivasyonu `.click()` ile sınandı — Enter/Space'in native
  aktivasyonu gerçek Windows'ta kontrol edilmeli.
- `browserDownloadsToggle` sekme olmayan browser modunda gizli —
  indirme panelinin Esc/odak-iade yolu bu koşudaki yerleşimde
  sınanamadı (mevcut electron-browser-downloads smoke'u ayrıca
  kapsıyor).
- `hasFocus`/`document.hasFocus()`=true iken `element.focus()` gizli
  chrome'daki summary'de sessizce yutuluyor — görünür yüzeylerde
  odak/odak-iadesi doğrulandı.

**Kanıtlar:** `xvfb-run -a node_modules/.bin/electron
tests/electron-ui-keyboard.smoke.js` GEÇTİ; kırmızı kanıt master'da 1
FAIL üretti; `player-escape-dialog` + `player-ui` (153) yeşil;
`node --check` temiz.

---

## R393 — kuyruk g6: çift altyazı örtüşmesi (uzun metin / büyük font / sürükleme / tam ekran)

**Doğrulanan kusurlar (tümü düzeltildi, kırmızı kanıtlı):**

- **B-393-01 (ortaya çıkan veri kaybı):** Yığın düzende uzun metin + büyük
  fontta (44px, ~300 karakter) her altyazının ~%80'i sessizce kesiliyordu —
  `.subtitle-stack` `max-height:60%; overflow:hidden` ve her
  `.subtitle-overlay`'in kendi `max-height:45%` kapağı. Ölçü: inner 1195px →
  224px görünür (clip 978). Düzeltme: `fitSubtitleOverlays()` — aktif
  altyazılar taşarsa/çakışırsa metin ölçeği kutu sığana dek küçültülür
  (oyuncuların auto-fit'i; en çok 14 adım, rAF birleştirme, yalnız metin
  değişince tetiklenir, kısa metne dokunmaz — 6px süpürme toleransı).
- **B-393-02:** Kontroller görünürken yığın kontrol bandına 5px biniyordu —
  `bottom:13%` küçük sahnelerde ~104px'lik kontrol bandından az.
  `bottom:max(13%,120px)` (3 kural: yığın, sub-moved yığın, ayrı-overlay).
- **B-393-03:** Ayrı düzende uzun ikinci altyazı kutusu (top:6% +
  max-height:45%) ana banda 68px biniyordu. Ölçek-küçültme artık eleman
  bazında clip algılıyor (üst yığın çocuğun içsel kesimini göremez).
- **B-393-04:** `%85`'e sürüklenen ikinci altyazı kontrol çubuğuna
  oturuyordu ve kayıtlı değer geri yüklenirken de banda iniyordu. Sürükleme
  `pointermove` ve `applySubtitlePos` içinde dinamik kelepçe: üst konum,
  ana bandın (veya kontrollerin) üst kenarını geçemez.

**Kanıtlar:** `tests/electron-subtitle-overlap.smoke.js` — master'da 8
kontrol FAIL (yığın clip 973+973, yığın→kontrol 750>745, ayrı çakışma
ov=411-750/ov2=140-479, sürüklenen ov2.alt=750>ctl.üst=745, tam-ekran clip
57+57); dalda tümü PASS. İlgili birim: subtitle-*, player-*,
browser-overlay-*, renderer-* paketleri yeşil; css ratchet yeşil; vm-realm
testi için fullscreenchange dinleyicisi `typeof document` kapılı.

**Ortam sınırları (Windows'ta elle doğrulanmalı):** pointer-sürükleme
davranışı testlerde `applySubtitlePos`/sınıf enjeksiyonuyla sınandı — gerçek
dokunmatik/fare sürükleme Windows'ta elle doğrulanmalı.

---

## R394 — kuyruk g7: büyük transkript performansı (4.000–10.000 satır)

**Ölçülen darboğazlar (Electron, 8.000 cue, 1280×860):**

| İşlem | Önce | Sonra |
|---|---|---|
| `renderCue` (oynatma karesi) | 36.2 ms | 0.8 ms |
| `renderCueList('')` | 70.5 ms | 6.4 ms |
| `renderCueList('metin')` (tuş başına) | 88.5 ms | 19.5 ms |
| `highlightCueRow` | 33.5 ms | 1.1 ms |

**Kök nedenler:**

- `updateCueMeta` kare başına 4 tam-cue taraması yapıyordu (`savedCount`,
  `lowCount`, `missing` + `translationsForCues`); `missing` hesabı her cue'da
  `cueLooksUntranslated` → 2× `foldIndex` → 8k satırda ~31 ms.
- `cueSearch` input handler'ı her tuşta 2×8k `foldIndex` + ayrıca
  `translationsForCues` çağırıyordu (~88 ms/tuş).
- Liste filtresi de arama açıkken her cue için yeniden `foldIndex`.

**Çözüm:** `foldIndexCached` — içerik-adresli `Map` önbelleği (24k sınır;
aynı metin hep aynı sonucu döndürür, metin değişince yeni anahtar üretilir,
invalidasyon gerekmez). `cueMetaStats` — stats yalnız `cues/cues2/savedCues`
kimliği veya uzunluğu değişince yeniden hesaplanır (oynatma karelerinde O(1)).

**Kanıtlar:** yeni `tests/cue-list-perf.test.js` (5 kontrol: önbellek
özdeşliği, memoizasyon, invalidasyon, 8k doğruluk, O(1) tekrar). İlgili
paketler: subtitle-* (find/perf/format/parser-fuzz), player-ui 153,
browser-bulk-edit-locks 16, cue-seek, dual-layout — hepsi yeşil.
electron-subtitle-overlap smoke tekrar geçti. Windows'ta doğrulanmadı
(platformdan bağımsız JS).
