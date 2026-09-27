# BROWSER_BUG_REPORT_132 — R132 derin denetim turu: temiz sonuç + kapsam haritası

**Tarih:** 2026-09-26 · **Dal:** `codex/r132-deep-audit-1790517600` · **Temel:** master `2b56ae9` (PR #61)

## Özet

Bu tur, "çok daha iyi yapabilir misin, bugları da düzelt" talimatına karşılık gelen,
erişilebilir tüm yüzeyleri kapsayan bir derin denetimdir. **Kod değişikliği
bulunmamaktadır** — 11. denetim turunun birikimli sonucu olarak incelenen her
yüzey önceki turlarda (R120–R131) zaten sertleştirilmişti ve bu turda doğrulanmış
yeni bir kusur çıkmadı. Bu belge, "hiç bakılmadı" yerine "bakıldı, temiz çıktı"
kanıtını taşır: aşağıdaki kapsam haritası neyin okunduğunu ve hangi güvencelerin
yerinde görüldüğünü kaydeder.

## Sonuç

- **Doğrulanmış yeni bug:** 0
- **Düzeltilen dosya:** yok (temiz tur)
- **Değişen ürün kodu:** yok
- **Amaç:** denetim kanıtı + kapsam kaydı; "temiz" iddiası kanıtlanabilir olsun

## Kapsam haritası (bu tur + önceki turlardan taşınan)

Aşağıdaki her satır bu turda yeniden okunan veya desen-süpürmesiyle doğrulanan
yüzeyi ve orada yerinde görülen başlıca güvenceyi gösterir. "Taşınan" etiketi,
önceki turda tam okunan ve bu turda yeniden bozulma bulgusu aranmayan bölümleri
işaretler.

### Ana süreç / IPC güvenliği
- `src/main.js` (18 882 satır): 210 `ipcMain.handle` + 215 `authorizedBrowserSender`/
  `authorizedRendererSender` çağrısı — gönderen yetkilendirmesi tek biçimde uygulanıyor;
  ~33 `JSON.parse` tamamı try/catch içinde; 59 `setTimeout` tümü sınırlı; 3
  `while(true)` tümü sınırlı döngü (manga rate-limit, kuyruk trim, satır taraması);
  `spawn` sarmalayıcı `withoutSecretEnv(process.env)`'i her çocuk sürece uyguluyor
  (main.js:285); `process.on('unhandledRejection')` yakalayıcısı mevcut (main.js:786).
  `browser:liveAsr:*` handler'ları: gönderen yetkisi + oturum/biçim/sekme staleness
  denetimi + ≤8 chunk + offset/rate doğrulaması + base64 sınırı + tempfile kaydı +
  stdin sıralaması + hata temizliği — tümü yerinde.
- `src/settings-security.js` (860 satır): `SETTINGS_VERSION 3`,
  `MAX_IMPORT_BYTES 16 MB`, `MAX_JSON_DEPTH 12`, `MAX_JSON_NODES 500 000`,
  `DANGEROUS_KEYS`/`SECRET_KEYS` kara listeleri, `PERSIST_VALUE_CONTROLS`/
  `CHECKBOX_CONTROLS` beyaz listeleri, `UI_ENUMS` (uiLocale en/tr),
  `UI_NUMERIC_RANGES`, `ENDPOINT_PRESETS`, `SECRET_FIELD_PATHS`,
  `withoutSecretEnv` + `buildSecretEnv` (yalnız ilgili bayrak açıksa ilgili
  anahtarı miras bırakır), `sanitizeSettings` içe/dışa aktarma ayrımı
  (`allowSecrets` katı vs. yerel hoşgörülü), `clearedSecretFields` içe-aktarmada
  `SECRET_FIELD_PATHS` beyaz listesi (crafted yedeğin mevcut anahtarları
  devre dışı bırakmasını engeller) — tümü yerinde.
- `src/secret-store.js` (taşınan): dizide düğüm üzerine yazmama, kısmi-çözülmüş
  kasa korunması — yerinde.

### Tarayıcı yakalama / altyazı çekirdeği
- `src/browser-subtitles.js` (2 009 satır, TAM): MPEG-TS rollover sayacı;
  `parseTimedBlocks` (X-TIMESTAMP-MAP LOCAL/MPEGTS ofseti, sıralı sayısal id +
  ayrık cue-id dışlama, NOTE/STYLE/REGION atlatma); `stripAssOverrideBlocks`
  doğrusal tarama (kapalı olmayan `{` üzerinde katastrofik regex geri-izlemesi
  yok); `parseHlsSegments` (RFC 8216 örtük BYTERANGE + init-range taşıma düzeltmesi,
  EXT-X-KEY, DISCONTINUITY/SKIP/GAP, canlı tekrar-kullanım için bilinçli URI
  tekilleştirmesi yok, eksik EXTINF → targetDuration); `isHlsSubtitlePlaylist`
  %60 eşiği; `dashOuterBase` (yalnız MPD kökü + geçerli Period BaseURL zinciri —
  kardeş periyotlar dışlanır); `parseIsoDurationSeconds`/`dashPeriodBounds`/
  `dashSegmentTemplate`/`dashTemplateTimeline` (10 000 segment sınırı, safe-integer
  t/d/r denetimleri); SegmentList/template eşleştiriciler regex-escape'li URL ile;
  `browserActiveCuesAt` ikili arama + WeakMap prefix-max önbelleği (sabit geriye
  bakma sınırı yok); `findSubtitleUrls` (JSON ziyaretçisi derinlik≤8,
  string≤2000, dizi≤500, nesne≤1000 girdi, url≤64, kesik uyarısı); `attr()`
  literal ad regex'i; `parseXmlTime` tick/frameRate/ms; TTML style/region `seen`
  döngü koruması + zamanlı-span mutlak-vs-göreli sezgisi; `isLikelySubtitleResponse`;
  `subtitleLanguage` Content-Language/lang-param; `cueFingerprint` streaming
  sha256 (`needsClean` ön filtresi, `\x00` ayraçları); `manifestFingerprint`
  tam-gövde; `cuesToSrt`/`cuesToVtt` CRLF; `decodeSubtitleBuffer` →
  browser-textutil — tümü yerinde.
- `src/browser-acquisition.js` (234 satır, TAM): `CaptionAcquisitionPlan` kazanan
  kilitlemesi (geç gelen sonuç sonucu değiştiremez); tüm-otomatik-terminal →
  `capture_failed` gözlemi; `capabilityMatrixEntry` tarih doğrulaması —
  yerinde.
- `src/browser-media-controller.js` (643 satır): enjekte edilen medya denetleyici —
  reklam seçiciler + görünürlük kapıları (`isConnected`/`getClientRects`/
  `getComputedStyle`); `muteForAd`/`restoreAdAudioIfEnded` anlık görüntüsü
  `unchangedSinceAutoMute` denetimiyle; `select()` `cleanupDetachedRoots`;
  `probe()` tüm-sonlu alanlar + try/catch'li `getVideoPlaybackQuality`;
  `configurePlayback` sınırlı (rate .25-4, brightness/contrast .4-2,
  silenceSpeedRate 2-8, thresholdDb -70..-20, audioProfile beyaz listesi);
  `buildBrowserMediaPreferenceScript` docToken staleness reddiyle — yerinde.
- `src/browser-cosmetic-executor.js` (36 satır, TAM): `createCosmeticExecutor`
  WebContents başına tek yüklenme dinleyicisi; `destroyed`'ta kuyruk temizliği;
  `browserScriptExecutionReady` kapısı; ≤128 öğe sınırı — yerinde.
- `src/browser-live-audio.js` (14 satır, TAM): `pcm16Wav` — PCM16 doğrulaması
  (çift bayt, ≤`16000*2*9`, 16 kHz sabit) + 44-bayt WAV başlığı — yerinde.
- `src/browser-media.js` (26 satır, TAM): `rankBrowserMediaCandidates` çapraz-kare
  sıralama — saf fonksiyon, `clientWidth/Height` normalize, kararlı sıralama —
  yerinde.
- `src/browser-overlay-controller.js` (680 satır): enjekte edilen overlay
  denetleyici — tek seviyeli katman (teşhis için bile `querySelectorAll('*')`
  yok), `cancelFrame`/`startObserving`/`stopObserving` disiplini, `update()`
  önceki sınır zamanlayıcısını geçersiz kılar, `mode==='off'`ta observer +
  medya + dinleyici tam temizliği, `queueFrame`/`finishRender` çifti —
  yerinde.

### Sayfa çevirisi / çeviri zamanlayıcısı
- `src/browser-page-translate.js` (1 429 satır, TAM): `latestIdByRoot` staleness;
  ≤12 000 karakter çevirileri; önceki-overlay kapatma+geri-yükleme sıralaması;
  `originalRect` düzen-büyümesi uyarıları; `pageActionResultScript` bekleyen-düğme
  kimlik eşleşmesi; `pageVisibilityScript` özgün düğüm uzunluğuna göre ağırlıklı
  karakter dağılımı; `pageExcludeScript` (id≤100, `ownWrites`/`originalValues`
  önce `nodeValue` geri yüklemesi); **`pageRestoreScript` R129 düzeltmesi
  doğrulandı** — 6 dinleyici (`visibilitychange`, `scroll`, `pageActionListeners`)
  sökülüyor, observer'lar kesiliyor, `.whisper-page-tr` ve `__whisper_page_tr`
  temizleniyor, state siliniyor; `pageViewScript` scroll-koruma — yerinde.
- `src/browser-translation-scheduler.js` (726 satır): `retryFailed` devre sayacını
  sıfırlar + ertelenenleri dışlar; `translateShared` uçuş-içi cacheKey
  tekilleştirmesi + harcamadan-önce-abort kapısı + tüketici refcount abort +
  yerleşmiş Map temizliği; `start()` önbellek → decode → `translationBlockingIssues`
  kalite kapısı → `distributeTranslation` → commit-öncesi abort/jenerasyon
  yeniden-denetimi; 429/5xx/transportError devre kesici `providerFailureThreshold`;
  üstel geri-alma `retryBaseMs * 2^(n-1)` kap `retryMaxMs` + `retryAfterMs` taban +
  kendini-yeniden-kurma retry zamanlayıcı (Windows erken-uyanma düzeltme notu);
  `cancelAll` abort-all + jenerasyon artışı; `whenIdle` retryTimer sayımı —
  yerinde.

### Oturum / kütüphane / izleme durumu
- `src/browser-session-store.js` (375 satır): `normalizeBrowserSession` aktif-sekme
  koruyan `MAX_SESSION_TABS` trim'i (R85-K2 düzeltme notu);
  `readBrowserSessionWithStatus` birincil→`.bak` + hasarlı bayrak + düşürülen-sekme
  uyarısı; `writeBrowserSessionAtomic` yansı-önce-yeniden-adlandır sıralaması
  (R86-03) + koşullu `mirrorBackup` (R83-34 silinmiş-veri dirilişi koruması) —
  yerinde.
- `src/watch-library-store.js` (646 satır): `lastWatched` artık `undefined/null →
  now()` yoksa `max(0, N)` (R127 düzeltmesi yerinde doğrulandı); upsert birleştirme
  + `maxItemBytes` bayt denetimi; tombstone yaşam döngüsü; remove/restore/isRemoved —
  yerinde.
- `src/watch-library-view.js` (137 satır, TAM): `virtualRange` overscan +
  pinnedIndex katılımı; `anchorSnapshot`/`anchoredScrollTop` anahtar-temelli kaydırma
  geri yükleme; `rowHeightForSearch` — yerinde.
- `src/browser-session-store.js` + `src/browser-downloads.js` (148 satır, TAM):
  indirme kaydı — `new URL` ile şema doğrulaması, özel/ağ alan adı reddi,
  http/https dışı reddi, üst-sınır sınırı — yerinde.
- `src/browser-context-menu.js` (179 satır, TAM): tam menü modeli (link/image/
  media/editable/selection dalları, yalnız-düz-sayfa gezinme, `collapseSeparators`)
  — yerinde.
- `src/browser-adapters.js` (98 satır, TAM) — yerinde.

### Renderer / UI
- `src/renderer/renderer.js` (28 638 satır): 86 `localStorage` kullanımının
  tamamı try/catch'li; 154 `innerHTML` sitesi — dinamik interpolasyonların
  tamamı `escapeHtml`'li, uzaktan türetilen dizgiler bilinçli `textContent`
  (CSP notu ~24808); **6 `setInterval` sitesi tamamı temiz** (manga lookahead
  eşli start/stop, ambient paint 250 ms `stopAmbient` temizler, playerTaskPulse
  clear-before-set açık-kapılı, sleep timer 15 s kasıtlı küresel,
  `stUpNextCountdown` kendini-iptal, `_ytCodeTimer` süre-sonu + jenerasyon
  uyuşmazlığında clear); 83 `setTimeout` tümü sınırlı; `_ytFlowGen`/`_ytPolling`/
  `_ytBrowserFlow` jenerasyon disiplini doğrulandı; `stripCont` `for(;;)`
  döngüsü `else return s` ile sonlanır — yerinde.
- `src/renderer/smarttube-tv.js` (249 satır, TAM): `localStorage` get/set
  try/catch'li; TV modu dinleyicileri tek-kurulum (init içinde) — yerinde.
- `src/renderer/ui-locale.js` (2 066 satır): TR haritası + EN haritası ayrı
  sözlükler; `t()` bilinmeyen anahtarı orijinal döndürür (R124 davranışı);
  `UiLocale.t('Açık')` kasıtlı çevrilmez (cümle-sonu eşleşme güvenliği için);
  cueList boş-tür düzeltmesi (BUG-117-05) yerinde — yerinde.
- `src/browser-context-menu.js` + `src/renderer/browser-*` yardımcıları
  (analysis-tools, dialogue, video-analysis, features, series-context,
  media-catalog, queue-lifecycle, resource-soak-probe, status-copy,
  live-asr-worklet, browser-mini): hepsi önceki turlarda okundu; bu turda
  yeniden-bozulma bulgusu yok — yerinde.

### Backend (Python)
- `backend/transcribe.py` (8 532 satır, 250 def): `eval`/`exec`/`shell=True`/
  yalın `except:`/`pickle`/`yaml.load` yok; `subprocess` çağrıları sınırlı +
  `timeout` + `DEVNULL`; `sync_subtitles` (sınırlı, finally rmtree workdir,
  parçalı `apply_piecewise` None→güvenli sabit-kaydırma geri dönüşü + uyarılar,
  ofset/oran uyarıları, kaynak-hash'li emit done); `transcribe()` kuyruk
  (diarization öncesi GPU boşaltma `del`+`empty_cache`,
  `merge_resumed_entries`/`words`, sıralama, tekilleştirme, fix_common_errors,
  drop_repeated_hallucinations, merge_incomplete, merge_short,
  drop_trailing_hallucination, script-contamination + şüpheli-boşluk uyarıları,
  llm_postprocess iptal noktaları + traceback günlüğü, unpunctuated-run uyarısı,
  merge_continuation_lines, son tekilleştirme, diarization noktaları);
  `_WxWord/_WxSegment/_WxInfo` adaptörleri (eksik kelime zamanı → prev_end);
  `run_whisperx` (int8_float16→int8 düşürme + kullanıcı uyarısı, try/finally GPU
  boşaltma); `merge_short_entries` flaş kuralı `-0.15 <= gap <= max_gap`;
  `fix_text_artifacts` harf-sınırlı regex'ler; `llm_translate` — cümle-grup
  paketleme, senkron prob + kalıcı-sağlayıcı hata kapısı (`FATAL_TRANSLATION_ERRORS`),
  ayrı kurtarma havuzu (iç-içe gönderim deadlock'u önlenir), kurtarma
  paketlerinde paket→tekil grup ayrışması, "SON DENEME" dağıtım-kuralı son eki,
  ret nedenleri metriği, `translation_quality` olayı, önbellek + SQLite bulanık
  hafıza (fuzzy eşleşme sınırlandırılmış: yalnız tek-hemişe yazım varyantı, sayı/
  olumsuzluk/modal/zamir/özel-ad/noktalama imzaları eşit, soru-sonu eşit) —
  yerinde.
- `backend/invidious.py`: altyazı indirme `_vtt_to_srt`/`_convert_timedtext_to_srt`
  (R128 timedtext tolerans düzeltmesi yerinde); dosya adı `re.sub(r'[<>:"/\\|?*]',
  "_", …)` + `utf-8-sig` yazımı; `_session_url_ok` (SID cookie yalnız kendi
  instance host'una — failover sızıntı koruması); `_popular_payload`/
  `_trending_payload`/search/suggest yt-dlp geri dönüşleri `degraded` işaretli;
  `query[:100]`; ana try/except → `emit("error")` — yerinde.
- `backend/sentence_translation.py`: `sentence_parts_match` (kayıpsız birleştirme,
  boşluksuz-script toleransı); `_numeric_separator` (Türkçe "3.000" binlik koruma);
  `ABBREVIATIONS` sözlüğü; ad/Levenshtein eşikleri; `part_anchor_issue` sınırda
  bölünmüş sayı koruyucusu (yarımlar ancak diğer yarıda rakam varsa atlanır) —
  yerinde.
- `backend/update_ytdlp.py`: `download_artifact` (`MAX_WHEEL_BYTES` ilan+gerçek,
  `xb` exclusive create, fsync, ilan-vs-gerçek uzunluk, sha256 özeti eşleşmesi,
  hatada unlink); `_atomic_write_json` (tmp+fsync+replace); `update_runtime`
  `update_lock` altında; committed bayrağı ölümcül-olmayan `prune_packages` öncesinde
  (antivirüs-kilit notu); commit edilmemiş `final_dir` geri alma — yerinde.
- `backend/pipeline_control.py` (313 satır, TAM): `CancellationController`
  (marker dosyası + aşama/nokta beyaz listesi); `_write_json_atomic` tmp+fsync+replace;
  `_entry_paths_are_local` output_dir containment; `recover_output_transactions`
  (owner_pid canlıysa atla, Windows'ta `OpenProcess`/`GetExitCodeProcess` sondası —
  erişim-reddi = canlı kabul, bilinmeyen/bozuk dosya asla otomatik silinmez);
  `OutputTransaction` (journal'lı commit + rollback; isteğe bağlı çıktı hatası
  yalnız kendi girdisini düşürür; commit öncesi yedekleme → rename → `committed`
  işareti → temizlik sıralaması; son-iptal sınırı committed journal'dan ÖNCE) —
  yerinde.
- `backend/translation_memory.py` (241 satır, TAM): şema sürümü kapısı + sütun
  seti eşleşmesi; WAL; `MAX_ROWS` + budama; `context_key` sha256; `lookup`
  uzunluk-bandı + `quick_ratio` üst sınır + tam `ratio` + `fuzzy_semantically_compatible`
  (tek-hemişe yazım varyantı, sayı/olumsuzluk/modal/zamir/özel-ad/noktalama
  imzaları, soru-sonu); `store` UPSERT + budama — yerinde.
- `backend/io_errors.py` (71 satır, TAM): `classify_ffmpeg_error`/`classify_ytdlp_error` —
  ayrıntı sızdırmayan sınıflandırma (disk dolu, izin, bozuk medya, akış, filtre,
  YouTube 403/429/bot/cookie/format/DNS) — yerinde.
- `backend/ndjson_utils.py` (24 satır, TAM): `finite_json_value`/`json_dumps_finite` —
  NaN/Infinity → null, `allow_nan=False` — yerinde.
- `backend/separate_dialogue.py` (39 satır, TAM): stdin JSON → vocals/transcribe;
  hata kısaltması; `contextlib.redirect_stdout` stderr'e — yerinde.
- `backend/live_asr.py` (124 satır, TAM): stop/EOF sonrası kuyruk drenajı;
  `segment_bounds` sonlu + sıralı zaman doğrulaması; chunk hatası yalnız kendi
  `chunk_done`'ına düşer — yerinde.
- `backend/model_benchmark.py` (273 satır): `nvidia-smi` sondası (timeout 3 s);
  `VramSampler` işlem + küresel-delta geri dönüşü + son-eşzamanlı örnek;
  `align_segment_starts` toleranslı bire-bir eşleştirme — yerinde.
- `backend/catalog_scan.py` (59 satır, TAM): `os.walk` followlinks=False +
  reparsed-point atlatma; symlink + uzantı beyaz listesi; 5000-satır sınırı;
  guessit sezon/bölüm ayrıştırma; `onerror` uyarı toplama — yerinde.
- `backend/workspace_video_package.py` (49 satır, TAM): `xb` exclusive yazım;
  symlink video reddi; `workspace.wbp` ≤256 MB; video toplamı ≤100 GB;
  arşivde-olmayan kayıt `missing` bildirimi (sessiz yanlış-bağlama yok) —
  yerinde.
- `backend/subtitle_sdh.py` (176 satır): `_SDH_NORMALIZED` önceden-normalize
  küme (P79-01); alt-dize eşleşme koruması (modifier beyaz listesi) — yerinde.
- `backend/export_anki.py` (210 satır): `MAX_INPUT_BYTES 32 MB`, `MAX_NOTES 5000`,
  medya sınırları, genanki şema sabitleri — yerinde.
- `backend/nmdb_catalog_import.py` (72 satır, TAM): salt-okunur URI
  (`mode=ro`) + `query_only=ON`; gerekli tablo denetimi; sütun-yoksa-NULL
  toleransı — yerinde.
- `backend/browser_align.py` (132 satır, TAM): `valid_cues` sınırlı (3-10 000,
  sonlu, sıralı, ≤24 saat); ffsubsync parçalı eşleme + güvenilirlik kapısı +
  satır-sayısı koruması + sonuç-zamanı doğrulaması; ses-referans kipi —
  yerinde.
- `backend/browser_media_tools.py` (142 satır, TAM): OCR base64 ≤8 MB,
  çözünürlük ≤16 MP, crop doğrulaması; semantik arama tek-yüklenen model +
  ≤10 000 cue; serve modu satır-≤24 MB — yerinde.
- `backend/browser_video_analysis.py` (132 satır): ≤120 kare, `0 ≤ start < end
  ≤ start+60`, interval 0.5-5 — yerinde.
- `backend/media.py` (539 satır): `COOKIE_BROWSERS` beyaz listesi; yt-dlp
  `noplaylist`/`js_runtimes`; progressive/HLS/stream/download yol notu —
  yerinde.
- `backend/youtube.py` (599 satır): env-kanallı gizli değerler (asla argv yok);
  `_endpoint` yalnız loopback test-kancası; OAuth device-code akışı +
  `_post_form`/`_post_json` timeout'ları; TV istemcisi + INNERTUBE_FALLBACK_KEY —
  yerinde.
- `backend/series_memory.py` (318 satır): `_file_lock` timeout'lu kilit (R127
  POSIX-timeout düzeltmesi yerinde doğrulandı); `_safe_text`/`_safe_style` sınırı;
  `merge`/`_prune`/`build_hint` — yerinde.

### Desen-süpürmeleri (regex üzerinden tüm-ağaç kanıtı)

- `new RegExp` dinamik kurulum — 17 vendor-olmayan site; tamamı statik parça
  veya önceden escape'li.
- `Math.random` — yalnız güvenlik-dışı ID'lerde.
- `eval`/`new Function`/`vm.` çağrısı — main.js'te yok.
- `execSync`/`execFileSync`/`spawnSync` — hepsi sınırlı argüman + timeout'lu
  araç sondaları (nvidia-smi, tasklist, ps, ffmpeg `--version`).
- `fs.unlink`/`rm`/`rmdir`/`shutil.rmtree`/`Path.unlink` — 91 site; tümü
  sahip-olunan geçici dosya/kilit/journal'lar veya `basename`+`parent` containment
  doğrulamalı; kullanıcı-yoluyla giden silme yok.
- `.sort()` argümansız — `main.js`'te 1 site (localeCompare'lu olmayan basit
  liste); `renderer.js`'te 0. Tüm diğer `.sort(...)` çağrıları karşılaştırıcılı.
- `Promise.all`/`Promise.allSettled` — hata-yutulmayan paralel beklemeler.
- Renderer `getElementById`/`querySelector` — 24 site, hepsi DOM'da; uzaktan
  HTML enjeksiyonu yok (CSP `script-src 'self'`).

## Doğrulanmamış sınırlar (Windows'a taşınacak el kontrolleri)

Bu turda kod değişmedi; doğrulanmamış sınırlar önceki raporlardaki maddelerin
devamıdır ve Windows makinede el ile doğrulanmalıdır:

- Gerçek Google hesabıyla "Hesap ekle" → ikinci hesap onayı → hesaplar arası
  geçiş ve "Çıkar" (revoke) uçtan-uca (PR #48/R121).
- Sayfada bul (Ctrl+F) sayaç ilerlemesi + Enter/Esc akışı — Electron 43
  `findNext:false` sessizliği R123'te kök-nedenlendi (Linux'ta platformdan
  bağımsız üretildi) ama gerçek Windows el kontrolü hâlâ açık (R124/R125).
- Sabit sekme 36 px ikon-only görünüm; iki yeni popover'ın düğme-altı
  konumlandırması (R131).
- "Son izlenenler" sıralaması: `lastWatched: 0` düzeltmesinin Windows'taki
  görünür etkisi (R127).
- Stremio sağlayıcısından gerçek altyazı indirme: redirect'li CDN'de `UNSAFE_URL`
  yerine normal indirme (R128).
- Gerçek `start.bat` açılışı + cuDNN PATH akışı (`npm start` tek başına
  doğrulamaz) ve Whisper model yüklemesi (GPU/CUDA) — Ubuntu CI yerine geçmez.

## Testler

Kod değişmediği için hedefli regresyon koşusu yeni bilgi üretmez; doğrulama
`node --check`/`py_compile` ile mevcut dosyaların bütünlüğü üzerinden yapıldı.
Tam `npm test` koşulmadı. CI bu PR'da yalnızca belge commit'ini doğrular.
