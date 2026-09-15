# BROWSER BUG REPORT 31 — Genişletilmiş denetim turu (10 ajan)

Tarih: 2026-09-15 · Dal: `master` · Tür: statik denetim + Electron smoke koşuları + deneysel doğrulama
Kapsam: önceki turların kalan kör noktaları — renderer player çekirdeği, kuyruk/transkripsiyon yaşam döngüsü, main.js settings/session/IPC yüzeyi, browser chrome (download/permission/find/popup), `transcribe.py` boru hattı derinliği, kalan Node yardımcıları, IPC sözleşme envanteri, renderer reconcile/edit sınırı, capture ardışık düzeni derinliği.
Önceki rapor: `BROWSER_BUG_REPORT_30.md` (B27–B75). Bu tur B76'dan başlıyor.

## Test koşuları (bu tur)

| Test | Sonuç |
|---|---|
| `electron-browser-cea-full-ui.smoke.js` | ✅ geçti (84/312 segment UI, dar görünüm) |
| `electron-feature-lifecycle.smoke.js` | ✅ geçti (stale reload/playback, episode filter, intro context) |
| `electron-browser-chrome-design.smoke.js` | ✅ geçti (chrome ölçümleri, hata/dar görünüm) |
| `electron-browser-tools-design.smoke.js` | ✅ geçti (9 grup, overflow yok) |
| `electron-browser-video-e2e.smoke.js` | ✅ geçti — `report.json`: video, 2 iz, dual overlay, seek, playback, independentSync, tabs, navigationReset, manualLoad, manualSync, srt/vtt/ass export +0.5, manualVtt |
| `electron-browser-audio.smoke.js` | ✅ geçti (playback rates, contexts, CORS) |
| `electron-catalog-roadmap.smoke.js` | ✅ geçti (metadata, sezon/takvim, export/restore, klavye, 520px) |
| `electron-page-translation-live.smoke.js` | ❌ **asıldı — test-altyapı bug'ı (B76)** |
| `electron-browser-extras.smoke.js` | ❌ bilinen kırık (B51, sekme refaktörü) |
| `electron-browser-public-sites.smoke.js` | ⏭ koşulmadı (ağ bağımlı) |
| `electron-provider-live.smoke.js` | ⏭ koşulmadı (API anahtarı bağımlı) |

## Doğrulanmış bulgular

### B76 · P3 — `electron-page-translation-live` CDP istemcisi timeoutsuz → test sonsuza asılıyor [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]
- **Kanıt (deneysel):** Test gerçek koşuda 17+ dk asılı kaldı. Testin spawn ettiği uygulama süreci (`--user-data-dir=whisper-page-live-*`) çoktan ölmüştü; runner hâlâ çalışıyordu. Elle öldürüldü.
- **Kök neden:** `tests/electron-page-translation-live.smoke.js:40-47` `client().call()` yanıtı `pending` haritasında bekliyor ama **timeout yok**; `waitFor` (17-25) deadline'ı yalnızca predicate *çağrıları arasında* kontrol ediyor — uçuşta olan bir `evaluate`/`isolatedState` çağrısı deadline'ı baypas ediyor. `finally` (211-223) `run()` dönmeden çalışmıyor → child kill + profile temizliği de asılı.
- **Etki:** Alt-test süreci ölünce runner süresiz asılı kalıyor; CI'da job timeout'una kadar slot işgali, teşhis çıktısı yok. Aynı `client()` kalıbı başka live smoke'larda da olabilir.
- **Düzeltme yönü:** `call()`'a per-request timeout + `waitFor` predicate'ine `Promise.race` koruması; child `exit` olayında pending çağrıları topluca reject.
- **Not:** Çocuğun neden öldüğü teşhis edilemedi (crash/OOM); test-altyapı açığı bundan bağımsız olarak doğrulandı.

## Güvenlik — dosya-erişim consent modeli (IPC envanteri + reconcile ajanı, satır-doğrulandı)

Tehdit modeli: renderer'ın ele geçirilmesi / zararlı `.wbp` paketi içe aktarımı. Onay modeli ("kullanıcı seçmediyse dosya okunamaz") `*Access.grant`/`authorize*` çiftine dayanıyor — aşağıdaki bulgular bu modeli baypas ediyor.

### B77 · P1 — `mediaFileAccess` grant modeli üç bağımsız yolla kendi kendini aşındırıyor [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]
- **(a) Doğrudan yol — doğrulandı:** `paths:scanMedia` (main.js:13178-13181) renderer'ın **ham string yollarını** doğrulamasız kabul edip `scanMediaFromPaths`'e veriyor → her medya dosyası `mediaFileAccess.grant` (13142), derinlik 5 / 20.000 sonuç. Provenans kapısı yalnız preload sarmalayıcısında (`scanDroppedFiles` `webUtils.getPathForFile` — File nesnesi dışındaki girdileri eliyor, preload.js:17-22) — **B80'in sızdırdığı ham `invoke` bunu baypas ediyor** → `ipc.invoke('paths:scanMedia', ['C:\\'])` tüm diskteki medyayı grant'liyor.
- **(b) Kalıcı yol — doğrulandı:** `grantKnownMediaRecords` (13093-13100) `record.input`/`localPath`/`sourceRef`'i koşulsuz grant'liyor; `library:list` tüm kayıtlara uyguluyor. `library:upsert`/`upsert-before-close` renderer patch'ini verbatim saklıyor (`normalizeItem` `{...raw}`); `loadQueueState` persist kuyruk input'unu açılışta grant'liyor; `settings:import` watchLibrary yolları aynı boruda.
- **(c) Amplifikasyon — doğrulandı:** `media:listFolder` (13184-13191) önce `authorizeLocalMediaPath` istiyor ama (a)/(b) ile grant edilmiş tek dosya → `scanMediaFromPaths(dirname)` dizindeki **tüm** medyayı grant'liyor.
- **Repro (b):** `await api.updateWatchItem({key:'file:x', localPath:'C:\\herhangi\\film.mkv'})` → `api.listWatchLibrary()` → `api.probeTracks(...)` hiç seçilmemiş dosyayı açıyor. **Repro (a):** `api.onMediaEvent(()=>{}).invoke('paths:scanMedia',['C:\\'])`.
- **Düzeltme yönü:** `paths:scanMedia`'yı File-provenans'lı girdiye kilitle (veya dialog/known-record ile sınırla); yerel-yol alanlarını renderer patch'lerinden soy; `grantKnownMediaRecords` yalnız ana-süreç provenans'lı yolları grant'lesin; `media:listFolder` mevcut grant davranışını koruyabilir çünkü ön-kapı (a) kapanınca güvenli.

### B83 · P2 — `subtitlePaths` → keyfi yerel dosya içeriği ifşası (kütüphane araması) [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]
- **Kanıt:** `subtitleTextForSearch` (main.js:1698-1723) herhangi bir mevcut ≤8 MB dosyayı okuyor — **uzantı denetimi yok, `subtitleFileAccess` grant yok, yol doğrulaması yok** — ve `searchWatchLibrary` eşleşen blok başına ~220 karakter snippet + ham yol döndürüyor. `subtitlePaths` `.wbp` `watch-library.json`'undan (normalizeItem `uniqueStrings`'e indiriyor) veya `library:upsert`'ten doğrulanmadan giriyor.
- **Repro:** içe aktarılmış `.wbp`'ye `subtitlePaths:['C:\\Users\\K\\AppData\\...\\settings.json']` → kütüphane aramasında sorgu → 220'şer karakterlik pencerelerle içerik sızıyor.
- **Düzeltme yönü:** `subtitleTextForSearch`'te `subtitleFileAccess.has` veya kanonik-yol + uzantı whitelist; `subtitlePaths`'i normalizeItem'da ve paket import'unda doğrula.

### B84 · P2 — Subtitle-tercihi restore'u sessiz `subtitleFileAccess.grant` veriyor (consent baypası) [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]
- **Kanıt:** `restoreBrowserMediaSubtitlePreference` (main.js:3861-3863) saklanmış `primaryFile`/`secondaryFile`'ı `subtitleFileAccess.grant(file)` ile **kullanıcı onayı olmadan** grant'liyor. Tercih dosyası `.wbp` ile restore edilebilir; satırlar yalnız `normalizeSessionTab` (geçerli http url + bilinen `mediaId`) ve `cleanString(...,4096)` geçiyor — `.json` uzantısı `SUBTITLE_EXTENSIONS`'te olduğundan `settings.json` bile geçerli.
- **Etki:** kurcalanmış paket → bilinen bir video açılınca grant + `loadSubtitle` sessizce çalışıyor; sonrasında `media:readSubtitle`/`media:writeSubtitle` o yolda diyalogsuz.
- **Düzeltme yönü:** restore'da saklı yol grant'leme — mevcut oturum grant'ı iste veya ilk okuma/yazmada standart consent diyaloğunu göster.

### B78 · P2 — `burnin:start` dosya yetkilendirmesi yapmıyor [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]
- **Kanıt:** `main.js:14353-14407` yalnız `fs.existsSync` + `subPath` uzantısı ({.srt,.ass}) — `authorizeLocalMediaPath`/`authorizeSubtitleFile`/`canonicalLocalPath` yok. Çıktı `burninOutputPaths` ile girdi yanına yazılıyor; mevcut `<base>.altyazili.*` atomik eziliyor. `burnin:recovery:recover` aynı yolları tekrarlıyor.
- **Etki:** keyfi-yol ffmpeg okuması + bitişik-dizin yazması + dosya-varlık kahini; consent diyaloğu yok.
- **Düzeltme yönü:** `authorizeLocalMediaPath(videoPath)` + `authorizeSubtitleFile(subPath)`; `burninOutputPaths`'i kanonik yoldan türet.

### B79 · P2 — `pdf:open` renderer-yolunu kendi kendine grant'liyor → keyfi PDF ifşası [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]
- **Kanıt:** `main.js:12918-12928` `request.filePath` → `pdfFileAccess.grant(filePath)` koşulsuz (yalnız `!filePath` dalı diyalog kullanıyor). `whisper-pdf://` handler'ı sonra Range-destekli ham byte'ları renderer'a akıtıyor; `pdf:state`/`pdf:translatePages` metni de veriyor.
- **Etki:** ele geçmiş renderer `api.openPdf('C:\\...\\statement.pdf')` + `fetch(fileUrl)` ile kullanıcının hiç seçmediği PDF'yi exfiltrate edebiliyor — altyazı tarafının açıkça diyaloga bağladığı eylem.
- **Düzeltme yönü:** auto-grant yalnız diyalog dalında; renderer-yolu için consent denetimi veya parametreyi kaldır.

### B80 · P3 — İki preload wrapper `ipcRenderer` emitter'ını contextBridge üzerinden sızdırıyor [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]
- **Kanıt:** `preload.js:73` `onMediaEvent: (cb) => ipcRenderer.on('media:event', ...)` ve :36 `onWatchFlushBeforeClose` — `ipcRenderer.on` `this` döndürüyor; contextBridge proxy'si `invoke`/`send`/`on`/`removeListener` dahil **tüm IPC yüzeyini** ana dünyaya veriyor (diğer 4 wrapper unsubscribe dönüyor — kazara). Unsubscribe da yok → her çağrı kalıcı listener (leak).
- **Repro:** `const ipc = api.onMediaEvent(()=>{}); ipc.invoke('paths:scanMedia', ['C:\\'])` — `webUtils` korumalı sarmalayıcıyı baypas ederek ham string'le mass-grant'a ulaşıyor (B77'yi kolaylaştırıyor).
- **Düzeltme yönü:** diğerleriyle aynı kalıp: listener değişkende tut, unsubscribe dön.

### B85 · P2 — `BrowserSubtitleReview.reconcile` doğrulanmamış `edited` alanlarını canlı cue'ya ekliyor [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]
- **Kanıt:** `browser-subtitle-review.js:39` `output[index]={...cue,...record.edited,...}` — `valid()` yalnız `text`/`start`/`end` denetliyor; **diğer tüm anahtarlar verbatim**. Kayıtlar `browser-source-edits-v1` localStorage veya `.wbp` `rendererValues`'tan (yalnız JSON+8MB) geliyor.
- **Ulaşılabilir alanlar:** `edited.assLead` → `saveCueEdit` → `replaceAssDialogueText` kullanıcının `.ass` dosyasına **verbatim** yazıyor (kalıcı override-tag enjeksiyonu); `assFieldCount`/`assTextIndex` → Dialogue satırını keyfi alan sayısına kırpıyor (dosya bozulması); `edited.text` → `aiVideoRows` → uzak LLM prompt'una prompt-injection; `edited.start:0,end:1e9` → kalıcı overlay; `edited.cueId` → gelecekteki kayıt/not anahtarlarını zehirliyor.
- **Repro:** localStorage'a crafted kayıt → izi yükle → kullanıcı hızlı-düzenleyip kaydet → `.ass` dosyası enjeksiyonlu lead + kırpılmış satır kazanıyor.
- **Düzeltme yönü:** reconcile'da alan whitelist'i (`{text,start,end}`; `line`/`ass*`/indeks metadata'sını yazım anında `player.subRaw`'den yeniden kur) + `edited.text` üst sınırı + `readSourceEdits`'te kayıt şeması.

### B81 · P3 — `transcribe:start` `syncSrt`/`translateExisting` yollarını yetkilendirmiyor [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]
- **Kanıt:** `main.js:14758-14763` (`--sync-srt`) ve `14836` (`--translate-existing`) — backend `read_subtitle_text` ile okuyor; `subtitleFileAccess`/`authorizeSubtitleFile` yok. Türev dosyalar `sendEvent` `files` listesiyle `subtitleFileAccess.grant` alıyor (:580) → consent baypası.
- **Düzeltme yönü:** iki opsiyon da `authorizeSubtitleFile`'dan geçsin (yalnız ilgili modlarda).

### B86 · P3 — Not/altyazı taslakları: sınırsız birikim + bayat taslak kaydedilmiş notu gölgeliyor + plantable draft [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]
- **Kanıt:** `browser-note-draft:*` (12427-12452) ve `browser-note-edit-draft:*` (19038-19059) — her `mediaKey:trackId:cueId` için ayrı anahtar, keystroke başına tam-string yazım, yalnız başarılı kayıtta silme (12452) → terk/iptal/site-side cueId değişiminde **sonsuz yetim** (GC yok); yeniden açılışta `draft || existing.note` bayat taslağı kaydedilmiş metnin önüne koyuyor. `openAppDialog`'da `maxLength` yok.
- **Ek:** `browser-subtitle-drafts-v1` `quickDrafts()` yalnız object/non-array denetliyor; `.wbp` altyazı + eşleşen `signature` hesaplayıp self-applying taslak ekiyor → hızlı editör saldırgan metinle açılıyor → kayıt diske yazıyor (`row.text.value` programmatic atama `maxLength=12000`'i baypas ediyor).
- **Düzeltme yönü:** taslak uzunluk sınırı + orphan GC + `updatedAt`'e göre bayatlık; restore edilmiş taslaklar için açık kabul.

### B82 · P4 — Küçük IPC/hijyen açıkları [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]
- `library:upsert-before-close` (10324) `sender` denetliyor ama `senderFrame` yok (latent — renderer'da iframe yok).
- `watch:start` (1029-1034) keyfi renderer dizinini canonicalize/consent olmadan kabul ediyor → dosya-adı numaralandırma + `watch:report` `path.resolve` desync riski.
- `shell:openPath`/`shell:showInFolder` (13552-13600) uzantı whitelist'i var ama grant yok → keyfi whitelisted dosyayı OS handler'ıyla açıyor / Explorer'da gösteriyor.
- `loadSubtitleStyle` (14808) `Object.assign(player.subStyle, JSON.parse)` — `__proto__` dahil keyfi anahtar → kozmetik CSS bozulması (`.wbp`-restorable).
- `reconcile` sonrası `edited.text` içine gömülü `\n\n<idx>\n-->` → `cuesToSrt`/`cuesToVtt` export'ta phantom cue (format bozulması, yol değil).

## Player çekirdeği (ajan + satır-doğrulandı)

### B88 · P2 — Browser→player geçişi medya kimliğini kaybediyor: yazımlar `browser:*` anahtarına gidiyor [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]
- **Kanıt:** `saveLocalSubtitleWorkspace` (4739-4749) yalnız cue/altyazı/yol alanlarını snapshot'lıyor — **`mediaKey`, `localPath`, `ytInfo`, `originalUrl` yok**. `setMediaKey` (15450) `player.mediaKey`'in tek yazarı; browser navigasyonu `updateBrowserNavigation` → `setMediaKey('browser:*')` → `localPath=''` + ytInfo sıfırlanıyor (15440-15449). `restoreLocalSubtitleWorkspace` (4752+) yalnız altyazı alanlarını geri yüklüyor; `setWorkspaceMode('player')` başlığı `player.localPath`='' → `'Oynatıcı'`'ya düşüyor.
- **Etki:** Yerel video çalmaya devam ederken tüm `mediaKey`-bağlı yazımlar yanlış kayda gidiyor: `savePlayerPosition` `player.positions['browser:*']`'e yazıyor — **`watchCompletionReached` yerel dosya bitince browser sayfasının kayıtlı konumunu siliyor**; `currentWatchPatch` bozuk patch'i (`key:'browser:*', localPath:''`) sayfanın watch kaydına her flush'ta birleştiriyor; gömülü-altyazı çıkarma `!player.localPath` kapısında ölü; öğrenme notları/audio-lock/kaydedilmiş-cue'lar `browser:*` altında yazılıyor.
- **Repro:** yerel video+altyazı aç → Browser'a geç → herhangi bir sayfaya git (medya olmasa da `browser:<placeKey>` üretiliyor) → "Oynatıcı"ya dön → video çalıyor ama `mediaKey='browser:*'`, `localPath=''` → duraklat → yerel dosyanın konumu sayfanın kaydına yazıldı; dosyayı bitir → sayfanın resume chip'i silindi.
- **Düzeltme yönü:** snapshot'a `mediaKey`/`localPath`/`ytInfo`/`originalUrl` ekle ve `setWorkspaceMode('player')`'te geri yükle (veya `video.src`'den yeniden türet); `setMediaKey` koşmadan önce kaydet.

### B89 · P3 — HLS kurtarma/manifest yeniden-ayrışması kalite ve ses-seçimini sessizce sıfırlıyor [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]
- **Kanıt:** `MANIFEST_PARSED` handler'ı (15789-15821) her ayrışmada ≤1080 seviyesini zorla seçiyor (`sel.value=…; hls.currentLevel=pick`); `syncAudioTracks` (15736-15768) kilit yoksa `hls.audioTrack>=0 ? … : 0` varsayılanına dönüyor. `NETWORK_ERROR` kurtarması yeni `Hls` örneğiyle aynı handler'ları yeniden bağlıyor → iki sıfırlama da tekrarlıyor. `playbackAudioLang` yazılıyor ama yeniden-seçimde hiç okunmuyor (grep).
- **Etki:** kullanıcının kalite (`auto`/non-1080) ve ses-track (dublaj) seçimi manifest yenilemesi/ağ hatası kurtarmasında sessizce varsayılana dönüyor — belirti yok.
- **Düzeltme yönü:** `MANIFEST_PARSED`/`syncAudioTracks` önceki seçimi (`playbackAudioLang`/son kalite/`auto`) yeniden uygulasın.

### B72'ye ek kanıt (player-core ajanı)
- `hideBrowserView` (main.js:10174-10204) sayfayı yalnız gizliyor — **JS çalışmaya devam ediyor** ve `did-navigate`/`did-navigate-in-page` view görünürlüğüne bağlı değil → sayfa gizliyken redirect/meta-refresh/SPA `pushState` ile kendi kendine navigate olabiliyor. Bu durumda `saveLocalSubtitleWorkspace` hiç çalışmadı (kullanıcı geçiş yapmadı) → `resetMediaBoundState()` yerel altyazıları **oynatma ortasında** siliyor, kayıpsız değil snapshot'suz.

### B90 · P4 — Player-scope'ta yakalanmamış promise yüzeyi [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]
- `video.play()` catch'siz: 12311 (replayCue), 19608 (playPause), 19701 (medya kontrolleri), 19866 (Space) — "play() interrupted" reddi olağan.
- `stage.requestFullscreen()` (19747) / `document.exitFullscreen()` (19748, 19878) — un-awaited, catch'siz.
- `await window.api.findSiblingSubs` (16282, `attachSiblingSubtitles` içinde, un-awaited çağrılıyor ~13772/16757) — dosyanın kendi `.catch(()=>({ok:false}))` konvansiyonundan sapıyor; ret durumunda sibling taraması sessizce ölüyor.
- `await window.api.selectFile('subtitle')` catch'siz: 4314, 19992; `cancelYoutubeDownload`: 21403.

### B91 · P4 — Altyazı overlay'inde `pointercancel` tıklama sayılıyor → oynat/duraklat [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]
- **Kanıt:** 14998-14999 `end` hem `pointerup` hem `pointercancel`'a bağlı; `!moved` dalı (14991-14995) videoya click iletiyor. `pointercancel` tıklama değildir (touch-scroll devralma, palm rejection, kalem ayrılışı) → 4 px eşiğini geçmemiş iptal edilmiş pointer oynatmayı toggluyor.
- **Düzeltme:** `pointercancel`'a ayrı handler — drag state sıfırla, click-forward yok.

### B92 · P4 — `loadSubtitlePos` NaN/sınırsız yüzdeyi kabul ediyor [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]
- **Kanıt:** 14917-14926 `typeof p.bottom === 'number'` — `NaN` ve `1e9` da `number`; `applySubtitlePos` `--sub-user-bottom`'a verbatim yazıp `.sub-moved` ekliyor (13% clamp'ini kapatıyor). Sürükleme yolu 1-88'e kırpıyor ama saklı değer güveniliyor.
- **Etki:** bozuk/elle-yazılmış `subtitlePos` → altyazı ekran dışı, belirti yok.

### B93 · P4 — `#browserTrackSelect` dosya-tabanlı yüklemede bayat iz gösteriyor [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]
- **Kanıt:** 16204-16208 `browserLoadedTrackId` doğru temizleniyor ama select'e yalnız `browserTrack` varsa değer yazılıyor → `openSubtitleCopy` ile düz dosya yüklenince önceki iz adı ekranda kalıyor (kozmetik).

## Kuyruk + transkripsiyon yaşam döngüsü (ajan + satır-doğrulandı)

### B94 · P3 — Ana `cancelBtn` progressive player işini kilitliyor [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]
- **Kanıt:** `cancelBtn` handler'ı (2926-2964) progressive iş için yalnız `state.cancelled=true` yapıyor — `job.cancelled`/`job.awaitingExit` yalnız `playerJobCancel`'de (18668+) set ediliyor. Öldürülen sürecin `exit`'i `playerJobEvent` → `handleProgressiveTerminal`'e gidiyor; `job.awaitingExit` şartı (3204) sağlanmadığı için `false` dönüyor ama olay tüketiliyor (3294) → global `exit` case'i (3936-3945) hiç çalışmıyor → `state.running=true`, `state.cancelled=true`, `player.job` "çalışıyor"da, playerJobBar + task-center satırı donuk.
- **Repro:** yerel video → "Altyazı oluştur" (progressive) → ana "İptal" (job-bar'daki değil) → süreç ölüyor, UI çalışıyor gösteriyor.
- **Düzeltme:** cancelBtn'u player.job türleri için `playerJobCancel`'in temizliğine yönlendir, ya da `handleProgressiveTerminal` `awaitingExit`siz+`event.cancelled`'lı exit'i teardown saysın.

### B95 · P3 — İptal sırasında reload → hayalet `running` öğe + kuyruk kilitlenmesi [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]
- **Kanıt:** `state.cancelled || event.cancelled` exit dalı (3936-3945) `currentQueueId`/`running`'i temizliyor ama `state.queueRunning` ve `item.status`'ü değil. İptal→exit'ten önce reload → `restorePersistedQueue` yeniden bağlıyor (queueRunning=true, item running, activeJobId restore 141) → geç gelen cancelled-exit erken dala giriyor → item `running` takılı (silinemez 479, yeniden-denemez 535), `queueRunning` kalıcı true → `startQueue` no-op (577), `startQueueBtn` disabled (990). Disk doğru (`updateQueueSnapshotTerminal` pending yazmış) → renderer/disk ayrışıyor.
- **Repro:** kuyruk başlat → İptal → süreç kapanmadan hemen pencereyi yenile.
- **Düzeltme:** o dalda mevcut item'ı `pending`'e çek + `finalizeQueue()` çağır.

### B96 · P3 — Runtime doğrulama hatası tüm kuyruğu durduruyor ve yeniden denemede sonsuz döngü [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]
- **Kanıt:** 679-689 — frozen item `optsProblemInfo`'da başarısız olursa `pending` + `queueRunning=false` + halt; kalan pending'ler denenmiyor. "Kuyruğu başlat" aynı item'ı seçiyor → aynı hata → tekrar. Karşılaştırma: spawn-hatası dalı (708+) `error` işaretleyip devam ediyor.
- **Repro:** çeviri+anahtarlı item kuyruğa ekle → anahtarı ayarlardan sil → kuyruğu başlat → durur; tekrar başlat → aynı durma.
- **Düzeltme:** item'ı `error` işaretle (`item.error=problemInfo.message`) + `processNextQueueItem()` zamanla.

### B97 · P3 — Kuyruk snapshot'ı öğeler arası `queueRunning:false` yazıyor → reload desync [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]
- **Kanıt:** `updateQueueSnapshotTerminal` (queue-persistence.js:217) `currentQueueId:null,queueRunning:false` zorluyor; N. öğenin terminal persist'i ile N+1'in `persistQueueRunning`'i (main.js:15009/15071 vs 14910) arasında disk "kuyruk boşta" diyor. O pencerede reload → `normalizeQueueSnapshot` çalışan öğeyi `pending` görüyor → `active` kontrolü (renderer 135-136) başarısız → `state.activeJobId=null` → canlı işin tüm olayları 3732'de düşüyor; iş görünmez tamamlanıyor, öğe UI'da pending kalıyor.
- **Düzeltme:** `updateQueueSnapshotTerminal` kuyruk devam ediyorsa `queueRunning`/`currentQueueId`'yi doğru tutsun veya `queue:load` "pending ama activeQueueItemId" öğesini running saysın.

### B98 · P3 — `startTranscribeSafe` reddi item'ı `error` yapıp kuyruğu gerçek iş sürerken boşaltıyor [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]
- **Kanıt:** 707-708+ `!r.ok` dalı item'ı `error` yapıp 100 ms sonra `processNextQueueItem` kuyrukluyor — `state.currentQueueId=null` eksik. `state.activeJobId` süren iş yüzünden doluysa (ör. `cancelTranscribe` `!ok` dönerken süreç hâlâ ölüyor, 2958-2963 yalnız UI bayrakları) her pending item aynı reddi yiyor → ~100 ms×N'de kuyruk toplu `error`'a düşüyor; asıl iş hâlâ çıktı/history yazıyor → disk/UI çelişkisi.
- **Düzeltme:** "meşgul" reddini gerçek spawn hatasından ayır — item'ı `pending`'e al, `currentQueueId=null`, kuyruğu durdur.

### B99 · P3 — `playerJobCancel` hata yolu `player.job`'u silip `state.activeJobId`'yi bırakıyor [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]
- **Kanıt:** 18683-18691 — `cancelTranscribe` "Çalışan iş yok" dışı `!ok` dönerse (geçici invoke/terminate hatası, süreç canlı) `player.job=null`+`state.running=false` ama `state.activeJobId` canlı jobId'yi tutuyor → sonraki tüm `startTranscribeSafe` "hâlâ kapanıyor" diyor; yetim süreç takılırsa kalıcı. Yetimin olayları `running=false` kapısına takılıp işlenmiyor.
- **Düzeltme:** `!ok`'da işi izlemeye devam et (`awaitingExit`) veya main "iş yok" doğruladığında `activeJobId`'yi temizle; iptali yeniden dene.

### B100 · P4 — Kuyruk/olay hijyeni küçükleri [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]
- `translation_chunk`/`translation_refresh`/`chat`/`explain` `shouldAcceptRunEvent` `live` kümesinde yok (renderer-ui-model.js:129-136) → `awaitingExit`/`!running`'de geç gelen çeviri olayları `state.previewSegs`'i final preview'dan sonra değiştiriyor (kozmetik sapma).
- `updatePlayerTaskCenter` her transkribe olayında (progress/segment dahil) `browser:jobs:list` invoke ediyor (3735→17386+) — throttle'suz, interleave'li.
- `enforcePreviewCap` (1353-1361) >1500 blokta `firstElementChild`'ı kaldırıyor — kullanıcının yazdığı focused `contenteditable` düşüp blur'suz gidiyor → commit'siz metin kaybı.
- `playerPreviewUnmatchedEdits` `clearPreview`'de sıfırlanmıyor → N. işin eşleşmeyen düzenlemeleri N+1'de "yedek" olarak duruyor.
- `queueInputKey` YouTube varyantlarını ayrı input sayıyor (433-435) → `youtu.be/ID` vs `watch?v=ID` iki kez indiriliyor; `mediaKeyFor` normalize'u burada kullanılmıyor.
- İzleme-klasörü dosyası `addToQueue` doğrulamasında reddedilirse `watch:report` hiç gitmiyor → `queued=true` kalıyor, dosya sessizce atlanıyor (restart'a kadar).
- `finishProgressiveJob` birleşik `writeSubtitle` sonuçlarını kontrol etmiyor (3128-3131) → disk/auth hatasında merged dosya eksik ama akış başarılı diyor.
- **Spec:** tek-iş (kuyruksuz) transkripsiyon reload'da yeniden bağlanamıyor (`loadQueueState` yalnız `activeQueueItemId` varken `activeJobId` dönüyor) → olaylar düşüyor, iş görünmez tamamlanıyor; iyileştirme önerisi.

## Browser chrome (ajan + satır-doğrulandı)

### B101 · P3 — İzin istemi arka-plan sekmesi için açılıyor + tek prompt slot'unu kaçırıyor; kapanış yollarında bayat kalıyor [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]
- **Kanıt:** `main.js:9564-9589` `setPermissionRequestHandler` herhangi bir canlı sekme için `sendBrowserEvent(permissionTab, 'permission-request')` gönderiyor — aktif-sekme kontrolü yok; renderer `10795`'te de yok (`browser-shortcut`'un aksine 10813). `showBrowserPermissionPrompt` mevcut prompt'u `block-once` ile geçip tek `player.browserPermissionRequest` slot'unu devralıyor → arka-plan sekmesi ön-planın istemini eziyor + kendi sitesi adına prompt gösteriyor; "Her zaman izin ver" görünmeyen siteye kalıcı grant yazıyor.
- **Kapanış kusurları:** `destroyBrowserTab` `tab.closing=true`'yu (10151) `cancelBrowserPermissionRequestsForTab`'dan (10156) önce set ediyor → `permission-denied` `!tab.closing` ile yutuluyor → renderer'ın tek etkileşimsiz kapatma yolu (11240-11244) hiç ateşlenmiyor, prompt ekranda kalıyor. `unloadBrowserTab` (11465+) ve `render-process-gone` (9853+) cancel'i hiç çağırmıyor → istek 30 sn'ye kadar yaşıyor ve geç cevap ölü sekmenin origin'ine kalıcı karar yazıyor.
- **Repro:** sekme-2'de `getUserMedia` → sekme-1'e geç → site-b adına prompt site-a üstünde; veya istem sonrası sekmeyi kapat → prompt kalıyor.
- **Düzeltme:** handler'da `permissionTab.id === browserActiveTabId` şartı (gizli sekmeler için auto-deny/defer — Chrome davranışı); renderer'da `event.tabId !== player.browserActiveTabId` savunması; `!tab.closing` yutmasını kaldır (veya ayrı `permission-dismissed`); `unload`/`render-process-gone`'da cancel çağır.

### B102 · P4 — `browser:session:import` `browserSessionMutationPromise`'i tutmuyor + senkron 64 MB okuma [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]
- **Kanıt:** `main.js:11956-11989` import gövdesi (diyalog → `fs.statSync`/`readFileSync`/`JSON.parse` 11965-11968 → `destroyBrowserView` → rebuild → `activateBrowserTab`) `queueBrowserTabTransition` içinde ama `trackBrowserSessionMutation` yok — `resetPersistentBrowserSession`'ın aksine (2731+). İki sonuç: (a) `cookies:clear*` yalnız `browserSessionMutationPromise`'e bakıyor → import sırasında mutasyon alıyorlar → import'un `activateBrowserTab`'ı `ensureBrowserView`'in `browserSessionMutationPromise` kontrolüne takılıyor → aktif sekme **view'siz** kalıyor; (b) ≤64 MB senkron okuma+parse transition kuyruğunda tüm IPC'yi bloke ediyor.
- **Düzeltme:** `trackBrowserSessionMutation` ile sar + `fs.promises` kullan.

### B103 · P4 — Subframe `did-navigate-in-page` `navigation` olayı → `loading:true` bekleyen izin istemini sessizce reddediyor [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]
- **Kanıt:** `main.js:9773-9815` `did-navigate-in-page` tüm frameler için `sendBrowserEvent` (9814, `isMainFrame` dışında); `browserNavigationStateForTab` `loading: wc.isLoading()` taşıyor → renderer `loading:true` + aynı `tabId` görünce pending prompt'u auto-deny ediyor. SPA `pushState` bile kaynaklar yüklenirken aynı etkiyi yapıyor (güvenli yön ama görünmez neden).
- **Düzeltme:** olayı yalnız main-frame nav'da yayınla veya `inPage:true` işaretle ve auto-deny'i doküman-olmayan nav'da atla.

### B104 · P4 — `unloadBrowserTab` view'i yok ediyor ama ağır korpusu tutuyor [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]
- **Kanıt:** `unloadBrowserTab` (11465-11512) `destroyBrowserTab`'in teardown'unu (stopBrowserManga → mangaPages.clear, stopBrowserPageTranslation, translationScheduler cancelAll, 10167-10170) yapmıyor → `mangaPages`/`translationResults`/`translationSourceCues`/`pageTranslateSession` (≤400k char)/`translationScheduler` ana süreçte kalıyor. Resume sonrası zaten erişilemez (yeni `bridgeToken` + yeni DOM) — saf retansiyon, warm-resume faydası yok.
- **Düzeltme:** unload'da destroy'un teardown'unu yansıt.

---

## Ayrıntılı bulgu, düzeltme, ret gerekçesi ve doğrulama dökümü — 2026-09-15

Bu rapordaki 28 numaralı bulgunun tamamı güncel üründe erişilebilir olarak doğrulandı ve düzeltildi. B100 içindeki tek-iş reload maddesi kanıtlanmış mevcut veri kaybından çok yeni bir kurtarma özelliği isteğiydi; diğer yedi somut alt kusur kapatıldı.

| Bulgu | Nihai karar | Düzeltme ve doğrulama |
|---|---|---|
| B76 | Düzeltildi | Canlı Electron CDP çağrısı 15 saniye timeout ile sonlanıyor. |
| B77 | Düzeltildi | Kuyruk/geçmiş/kütüphane otomatik medya grant'leri kaldırıldı; dosya açma açık consent kullanıyor. |
| B78 | Düzeltildi | Burn-in video ve altyazıyı ayrı yetki kapılarından geçiriyor. |
| B79 | Düzeltildi | PDF yalnız picker seçimi veya açık kullanıcı consent'iyle okunuyor. |
| B80 | Düzeltildi | Preload event wrapper'ları emitter yerine unsubscribe fonksiyonu döndürüyor. |
| B81 | Düzeltildi | `syncSrt` ve `translateExisting` altyazı yetkisi zorunlu. |
| B82 | Düzeltildi | before-close main-frame kapısı, watch/shell consent, stil whitelist+clamp ve phantom cue reddi eklendi. |
| B83 | Düzeltildi | Kütüphane altyazı araması yalnız exact-path grant'li dosyaları okuyor. |
| B84 | Düzeltildi | Tercih restore sessiz subtitle grant vermiyor. |
| B85 | Düzeltildi | Reconcile yalnız izinli metin/zaman alanlarını, boyut ve yapı doğrulamasıyla uygular. |
| B86 | Düzeltildi | Not taslakları 12K/50 kayıt/30 gün sınırında, base-version bağlı; hızlı taslak şeması doğrulanıyor ve `.wbp` taslak taşıyamıyor. |
| B88 | Düzeltildi | Yerel workspace medya anahtarı, yerel yol, URL ve YouTube bilgisini snapshot/restore ediyor. |
| B89 | Düzeltildi | HLS yeniden ayrışmasında kullanıcının kalite ve ses seçimi yeniden uygulanıyor. |
| B90 | Düzeltildi | Play/fullscreen/file picker/sibling scan/download cancel promise reddi yakalanıp görünür veya zararsız akışa çevrildi. |
| B91 | Düzeltildi | `pointercancel` ayrı teardown; click-forward yok. |
| B92 | Düzeltildi | Altyazı konumu yalnız sonlu ve 1–88 aralığında. |
| B93 | Düzeltildi | Dosya altyazısı yüklenirken browser track select temizleniyor. |
| B94 | Düzeltildi | Ana iptal progressive işi aynı player cancel yaşam döngüsüne yönlendiriyor. |
| B95 | Düzeltildi | Cancelled exit hayalet running öğeyi pending'e çekip kuyruğu finalize ediyor. |
| B96 | Düzeltildi | Runtime validation hatalı öğeyi error yapıp kalan kuyruğa devam ediyor. |
| B97 | Düzeltildi | Terminal snapshot sırada pending iş varsa `queueRunning` durumunu koruyor; restore otomatik devam ediyor. |
| B98 | Düzeltildi | Busy/closing reddi öğeyi pending bırakıp kuyruğu duraklatıyor; spawn hatasıyla karıştırılmıyor. |
| B99 | Düzeltildi | Başarısız cancel yaşayan job/süreç kimliğini bırakmıyor; izlemeye devam ediyor. |
| B100 | Düzeltildi; spec alt maddesi ret | Geç olay tipleri, task-center throttle, odaklı edit commit'i, unmatched reset, YouTube tekilleştirme, watch hata raporu ve write sonucu kontrolü kapandı. Kuyruksuz işin reload sonrası bağlanması yeni özellik olarak ayrıldı. |
| B101 | Düzeltildi | İzin istemi yalnız aktif sekmede; kapanış/unload/crash tüm pending istemleri iptal ediyor. |
| B102 | Düzeltildi | Session import mutation tracker ile seri, async stat/read ve yetki kapısı kuyruğun dışında. |
| B103 | Düzeltildi | Subframe in-page navigation ana browser navigation olayı üretmiyor. |
| B104 | Düzeltildi | Unload scheduler, sayfa çevirisi, manga ve ağır koleksiyonları iptal/temizliyor. |

### Doğrulama

- `npm test`, `report-29-31-regressions`, `adversarial-ipc`, `renderer-state-a11y-responsive`, `workspace-restore-regressions`, `player-ui` ve altyazı review testleri geçti.
- Güvenlik kararları yalnız statik grep'e değil, yetkisiz sender/main-frame, bayat medya kimliği, paket ekimi ve Unicode gerçek süreç testlerine bağlandı.
