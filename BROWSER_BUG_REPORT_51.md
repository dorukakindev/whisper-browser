# BROWSER BUG REPORT 51 — 35 ajanlık derin tarayıcı/renderer denetimi (tur 3)

Tarih: 2026-09-16 15:57 (güncelleme: 16:30 — doğrulama koşuları)
Denetim HEAD'i: `bf6780424cc779efd60cedf4c8f5c19014218c90` (`master`)
Yöntem: 20 + 15 paralel salt-okunur ajan; tüm kritik bulgular bu rapora alınmadan önce üst ajan tarafından güncel kaynakta `dosya:satır` düzeyinde yeniden doğrulandı.
Durum: **Ürün kodu bu turda değiştirilmedi.** Raporlar 42/46/47/48/49 ile tekilleştirildi; B48-1/B49-1 (CEA saat eşlemesi) gibi kapanmış konular tekrar yazılmadı. (Not: `d9f395d` dokümantasyon commit'i paralel oturumun cue-sahipliği düzeltmesini ve onların `BROWSER_BUG_REPORT_50.md` dosyasını da taşıdı — bu rapor bu nedenle 51 numaralıdır.)

## Doğrulama koşuları (2026-09-16 — ÇALIŞTIRILDI)

Statik bulguların koşulabilen alt kümesi gerçek harness'lerle test edildi (`.uiprev/ni-test/validate-report51.cjs` + `validate-r51-38.py` + Electron `ni-check.cjs`; fonksiyonlar kaynaktan kesilerek veya modül require ile koşuldu — ürün koduna dokunulmadı):

| Bulgu | Sonuç | Kanıt |
| --- | --- | --- |
| R51-06 | ✅ **DOĞRULANDI** | Electron 43.2.0+wvcus'ta `createFromBuffer`: png 64×64 ✓, webp/gif/avif `isEmpty()=true` |
| R51-34/35 | ✅ **DOĞRULANDI** | `parseSubtitles` 4 gerçek cue → 5 cue çıktı; STYLE bloğu cue-1 metninde, NOTE metni cue-2'de, NOTE içi `-->` sahte cue üretti; SRT'te `<i>`, `&amp;`, `&nbsp;`, `<v Ali>` literal kaldı |
| R51-30 | ✅ **DOĞRULANDI** | Renderer regex'i `hâlâ kapanıyor\|zaten çalışıyor` 4 gerçek meşgul hatasının **hiçbirini** yakalamıyor → kuyruk öğeleri pending yerine kalıcı `error` |
| R51-02 | ✅ **DOĞRULANDI** | `parseImportText` ile koşuldu: endpoint `https://saldiri-sunucu.example/v1` kabul + `apiKey:"GERCEK_ANAHTAR_123"` miras alındı |
| R51-08 | ⚠️ **KISMEN/NETLEŞTİ** | İşaret onaysız kabul ediliyor; AMA sır-mirası mevcut alanların işaretini kayıtta etkisizleştiriyor (kasa korunuyor). Gerçek etki: `withSecrets` mevcut anahtarı uygulamadan **anında gizliyor** → çeviri/LLM/manga yeniden girilene dek fiilen kırık; kasada olmayan alanların işaretleri silahlı kalıyor |
| R51-38 | ✅ **DOĞRULANDI** | `drop_repeated_hallucinations`: hizalıyken grup işaretlenip uyarılıyor; resume/1-blok-düşüş desync'inde `flagged=0, warnings=0` → tekrarlı halüsinasyon sessizce geçiyor |
| R51-54 | ✅ **DOĞRULANDI** | `normalizeQueueSnapshot` 600 öğe → 500 öğe + `invalidCount=100` (UI sınırı yok) |
| R51-55 | ✅ **DOĞRULANDI** | `readQueueStateRaw`: >8 MB `queue-state.json` + büyük `.bak` → `items:0` sessiz boş dönüş |

Koşulamayan bulgular (Electron yaşam döngüsü/gerçek-site gerektiren) aşağıdaki "Runtime doğrulama gerektirenler" bölümünde duruyor.

## Özet

| Önem | Adet | Öne çıkanlar |
| --- | --- | --- |
| P1 | 6 | Paket→oturum dosya grant zinciri, ayar-import endpoint+sır sızıntısı, görünüm gizlenirken yakalama kuyruğu kaybı, canlı-ASR stdin çökmesi, cue editörü yanlış hedefe yazım, manga WebP/AVIF sistematik başarısızlığı |
| P2 | ~30 | sitePermissions sessiz grant, browser:command timeout/bağlam/aday kusurları, explain modu ölü, CEA SERVICE/cc708 + byterange + SKIP + sıralama, renderer çökmesinde gri ekran, kuyruk iptal/yeniden-yükleme yetimleri, editör disk-tazeliği yok, yerel parser NOTE/STYLE sızıntısı |
| P3 | ~45 | Sekme kapatma/boşaltma asimetrisi, manga yaşam döngüsü kusurları, kuyruk kalıcılık boşlukları, altyazı görüntüleme tutarsızlıkları, OSD ölü, reklamda atlama, terminoloji prompt yüzeyi |
| P4 | ~25 | Sertleştirme, ölü kod, kozmetik ve dar-yarış maddeleri (tablo) |

---

## P1 — kritik bulgular

### R51-01 — Çalışma paketi `browser-session.json`'u ezer → kalıcı altyazı yolları **koşulsuz dosya grant'ine** dönüşür (okuma + yazma)

**Kanıt zinciri (hepsi doğrulandı):**
- `src/workspace-package.js:6` — pakete dahil edilebilir kök dosyalar arasında `browser-session.json` var.
- `src/catalog-extensions.js:111` — içe aktarımda `restorePackage(userData(), data, …)` dosyaları doğrudan userData'ya yazar → `browser-session.json` ezilir.
- `src/browser-session-store.js:231-235` — `subtitleSelection.primaryFile`/`secondaryFile` yalnız `cleanString(…, 4096)` ile temizlenir; yol doğrulaması yok.
- `src/main.js:2421-2424` — `restoreBrowserSessionState` açılışta bu yollara `subtitleFileAccess.grant(file)` uygular; kullanıcı onayı veya `authorizeSubtitleFile` diyaloğu (11330-11346) devreye girmez.
- `src/local-file-access.js:5,33-57` — `SUBTITLE_EXTENSIONS` `.json`'u da içerir; grant sonrası `media:readSubtitle`/yazma yolu (1737-1738, 11331+) dosyayı okur/yazar.

**Etki:** Kullanıcı bir kez zararlı `.wspak` içe aktarırsa, bir sonraki açılışta saldırganın seçtiği keyfi `*.json`/`*.srt`/`*.vtt`/`*.ass`/`*.ssa` dosyaları (ör. başka uygulamaların `settings.json`'u) renderer'a okunur ve üzerine yazılabilir hale gelir — yetkilendirme modelinin ("kullanıcı seçmediği dosyaya erişim yok") sessiz ihlali.

**Tetik:** Kullanıcının hazırlanmış çalışma paketini içe aktarması + yeniden başlatma.

**Düzeltme planı:**
1. `restoreBrowserSessionState`'te kalıcı yollara grant verme; `primaryFile`/`secondaryFile`'ı restore'da "bilinen ama yetkisiz" işaretle ve ilk erişimde `authorizeSubtitleFile` diyaloğuna düşür.
2. Alternatif olarak `browser-session.json`'u paket `ROOTS` listesinden çıkar ya da restore'da `subtitleSelection.*File` alanlarını sil (`browser-session-package.js:27-33`'teki `portableSessionTab` zaten bunu dışa aktarımda yapıyor — aynı kural içe aktarımda da uygulanmalı).
3. `.json`'un altyazı uzantısı olarak kapsamını gözden geçir (yalnızca uygulamanın kendi çıktı JSON'u mu?).

**Regresyon testi:** crafted `browser-session.json` içeren paket → restart → grant listesinde yol olmadığını ve ilk okumada diyalog düştüğünü doğrula.

### R51-02 — Ayar içe aktarması endpoint'i değiştirirken mevcut sırrı korur → API anahtarı saldırgan endpoint'ine gider

**Kanıt:**
- `src/settings-security.js:361-390` — `allowSecrets=false` (import yolu) iken `translate/llm/manga` grupları için mevcut `apiKey`/`apiKeyProfiles` `existingSettings`'ten **sessizce miras alınır** (367-372, 376-377, 385-389); aynı sanitizasyon `customBaseUrl`/preset değişimini ise kabul eder.
- `src/main.js:3970-3977, 4001` — `browserTranslationConfig` endpoint'i `translate.customBaseUrl`'den, anahtarı `translate.apiKey`'den kurar; manga yapılandırması da `inherited.apiKey`'i devralır.
- `src/main.js:14378-14401` — import onay diyaloğu yalnız değişen **klasör yollarını** listeler (`changedPaths`); endpoint değişimi uyarısı yok.
- `safeTranslationEndpoint` (4015-4026) `https:` şartı koşar ama sahibi doğrulamaz — saldırganın HTTPS alanı geçerlidir.

**Etki:** Yedek gibi görünen zararlı ayar dosyası `customBaseUrl`'i `https://attacker.example/v1`'e çevirir; kasada korunan gerçek anahtar bir sonraki çeviri/manga isteğinde o endpoint'e `Authorization` olarak POST edilir.

**Runtime doğrulaması (YAPILDI — kesin):** `parseImportText` gerçek import metniyle koşuldu → çıktı `{"customBaseUrl":"https://saldiri-sunucu.example/v1","apiKey":"GERCEK_ANAHTAR_123"}` — endpoint değişti, sır korundu. Harness: `.uiprev/ni-test/validate-report51.cjs`.

**Düzeltme planı:** Endpoint kimliği (origin) değiştiğinde ilgili sırları içe aktarmada taşıma; diyaloğa endpoint farkını ekle ve "mevcut anahtarları koru" için ayrı onay kutusu iste; import sonrası ilk istekte endpoint+anahtar eşleşmesini bir kez göster.

**Regresyon testi:** import fixture'ı endpoint değiştirirken → kasa anahtarı yeni endpoint'e gitmemeli.

### R51-03 — `hideBrowserView` kuyruğu flush'tan ÖNCE sıfırlar → işlenmemiş altyazı yanıtları sessizce kaybolur; mini-player'da yakalama ölür

**Kanıt:** `src/main.js:10562-10566` — `hideBrowserView` önce `executeBrowserFrames(browserCaptureToggleScript(false))` çağırır; o betik `3866-3877`'de `__whisperCaptureQueue.length = 0` yapar. Ardından `10566`'daki `flushBrowserCaptureQueue({allowHidden:true, force:true})` artık **boş** kuyruğu boşaltır. Doğru alternatif `browserCapturePauseScript` (3879-3884) kuyruğu silmeden duraklatır ama kullanılmaz.

**Etki:** Tarayıcı görünümü gizlenirken (oynatıcıya geçiş vb.) ağdan gelmiş ama henüz işlenmemiş altyazı/CEA yanıtları kalıcı olarak düşer — yakalama "tamamlandı" görünürken cue'lar eksik kalır. Görünüm tekrar açıldığında kanca/durum sıfırlanmış olur.

**Düzeltme planı:** `hideBrowserView`'da toggle yerine pause betiğini kullan (kuyruk korunur) veya flush'ı toggle'dan önce çalıştır; flush sonrası kancaları sıfırla.

**Regresyon testi:** gizleme öncesi sayfa-kuyruğuna sentetik kayıt → `hideBrowserView` → kayıt renderer'a ulaşmalı.

### R51-04 — Canlı-ASR `stdin`'de 'error' dinleyicisi yok → `EPIPE` ana süreci çökertir

**Kanıt:** `src/main.js:6567` (`stop` yazımı try/catch'te) ve `13189` (`chunk` yazımı) `job.proc.stdin`'e yazar; stdin için `error` handler kurulmaz (6655-6677 bölgesinde stdout/stderr/error/close var, stdin yok). Doğru kalıp aynı dosyada `13990`'da (`proc.stdin.on('error', () => {})`) ve `src/browser-alignment.js:83`'te uygulanmış.

**Tetik:** `live_asr.py` çöker/çıkarken renderer hâlâ chunk gönderiyor → sonraki `write` asenkron `EPIPE`/`ERR_STREAM_DESTROYED` 'error' olayı → dinleyicisiz 'error' = `uncaughtException` → Electron ana süreci çöker, tüm sekmeler/işler ölür.

**Düzeltme planı:** iş kurulurken `job.proc.stdin.on('error', …)` ekle (log + iptal); yazımdan önce `stdin.writable` denetimi.

**Regresyon testi:** sahte child'ı chunk kuyruğu doluyken öldür → ana süreç ayakta kalmalı.

### R51-05 — Tekil cue editörü hedefini açılışta sabitlemiyor → taslak yanlış bloğa/dosyaya yazılır

**Kanıt:** `src/renderer/renderer.js:21025-21075` `openCueEditor` metni `player.activeIdx`'teki cue'dan doldurur ama yerel yol için hedef kimliği saklamaz (yalnız browser-çeviri kolu `browserCueEditContext` saklıyor, 21047-21055). `saveCueEdit` 21206'da `player.activeIdx`'i **kayıt anında** yeniden okur; 21251'de `player.cues[i]`, 21268'de `player.subPath` de kayıt-anı değerleridir. `seekToCue` (12638) ve liste tıklamaları `activeIdx`'i değiştirir.

**Tetik:** Editör açıkken başka bir karta tıklamak / arama sonucuna gitmek / başka altyazı yüklemek → kayıt farklı cue'ya hatta farklı dosyaya gider (yanlış-satır onarımı veya sessiz bozulma).

**Düzeltme planı:** `openCueEditor`'da `{cueIndex, cueSignature, subPath, mediaKey, generation}` paketi sakla; `saveCueEdit` başlangıcında imza+yol+kuşak eşleşmesi doğrula, uyuşmazsa taslağı koruyup uyarı ver.

**Regresyon testi:** editörü aç → başka cue'ya tıkla → kaydet → hedef bloğun değişmediğini doğrula.

### R51-06 — Manga WebP/AVIF/GIF kabul ediliyor ama `nativeImage` asla çözemiyor → modern CDN'lerde tüm sayfalar kalıcı başarısız

**Kanıt:** `src/main.js:5438` `Accept: 'image/avif,image/webp,image/png,image/jpeg,…'` (webp/avif **önce** isteniyor); MIME whitelist ve `detectMangaImageMime` (browser-manga.js:327-338) webp/gif/avif'i kabul eder; `main.js:5559-5560` `nativeImage.createFromBuffer` → `isEmpty()` → `'Görsel çözülemedi.'`. Electron `nativeImage` sözleşmesi PNG/JPEG çözer. `mangaRetryableDownloadError` bu hatayı yeniden-denenebilir saymaz.

**Etki:** WebP/AVIF sunan her manga CDN'inde her aday `request_failed` — "yeniden dene" de kurtaramaz; özellik o sitede tamamen ölü.

**Düzeltme planı:** (a) `Accept`'i PNG/JPEG ağırlıklı yap; (b) decode başarısızlığında sayfa-içi canvas fallback'i (`inlineBlobImage` kalıbı, browser-manga.js:423-439) http görsellere genişlet; (c) desteklenmeyen MIME'de alternatif URL zincirine düş.

**Runtime doğrulaması (2026-09-16, YAPILDI — bulgu kesin):** Electron `43.2.0+wvcus` build'inde 64×64 gerçek dosyalarla `nativeImage.createFromBuffer` koşuldu — `png: 64x64 (ok)`, `webp/gif/avif: isEmpty()=true, 0x0`. Bu build yalnız PNG/JPEG çözüyor; manga yolu WebP/AVIF/GIF'te **kesin olarak** sistematik başarısız. Test: `.uiprev/ni-test/` (ffmpeg ile üretilmiş gerçek dosyalar).

---

## P2 — yüksek bulgular

### Güvenlik / yetki

| Kimlik | Bulgu | Kanıt |
| --- | --- | --- |
| R51-07 | İçe aktarılan `sitePermissions.allow` aktif-sekme kontrolünden **önce** `callback(true)` verir → arka plan sekmesinde bile sessiz izin | `main.js:9935-9939` |
| R51-08 | `clearedSecretFields` import'ta onaysız kabul edilir → `withSecrets` mevcut kasa anahtarlarını uygulamadan anında gizler (çeviri/LLM/manga kırılır); fiziksel silme çoğu senaryoda sır-mirasıyla etkisizleşir ama kasa-dışı alanların işaretleri silahlı kalır | `settings-security.js:351-357`, `secret-store.js:23-25,87-89,190-223` |
| R51-09 | Katalog "Oynat" `grantMedia` yapar, `authorizeMediaFile` diyaloğunu atlar → NMDB import'uyla eklenen keyfi yol klasör-yetkisi doğurur | `media-catalog-service.js:140` |
| R51-10 | SponsorBlock segmenti tüm videoyu kapsayabilir → `[0,duration]` auto-skip videoyu sona sarar; kapsama oranı denetimi yok | `browser-sponsorblock.js:61-67` |
| R51-11 | Anki export `screenshotRef`/`audioRef` ile keyfi yerel medya dosyasını `.apkg`'ye gömer → paylaşılan deste sızıntı taşır | `browser-learning.js:27-28`, `backend/export_anki.py:93-118` |

### Medya komut yolu (`browser:command`)

| Kimlik | Bulgu | Kanıt |
| --- | --- | --- |
| R51-12 | Probe ve komut `executeJavaScript`'lerinde `withTimeout` yok → asılı `video.play()`/DRM/iframe IPC'yi sonsuza açık bırakır | `main.js:11971-11974, 11978-11982` |
| R51-13 | Komut girişte yakalanan sekme yerine **güncel** `browserView` karelerinde çalışır; `isCurrentBrowserContext` yalnız sonucu reddeder — yapılan seek/pause geri alınmaz | `main.js:11911-11915, 11970, 11989` |
| R51-14 | Bir aday `handled:false` dönerse komut sıradaki (farklı video/frame) adayda tekrar dener → yanlış oynatıcı mutasyona uğrar | `main.js:11977-11987` |
| R51-15 | `media-preference`/`seek` gibi komutlar payload'da `generation`/`mediaId` taşımaz; renderer tarafı da gönderim öncesi bağlam doğrulamaz | `preload.js:89`, `browser-features.js:65-68,275` |

### CEA / HLS yakalama (B48/B49'un kapatmadığı kalan boşluklar)

| Kimlik | Bulgu | Kanıt |
| --- | --- | --- |
| R51-16 | CEA-708 akış adları uyuşmuyor: mux.js `cc708_<n>` üretir, manifest `SERVICE<n>` bildirir → eşleşme `instreamId` üzerinden yapıldığı için **tüm 708 cue'ları elenir** | `main.js:7290-7291` |
| R51-17 | `EXT-X-BYTERANGE` istekleri aynı URL'i paylaşır → `matchHlsCeaSegmentUrl` son eşleşmeye çöker; tüm aralıklar yanlış segmentle eşleşip dedupe'lanır | `browser-cea-captions.js:111-123` |
| R51-18 | `#EXT-X-SKIP`/`SKIPPED-SEGMENTS`/`EXT-X-GAP` hiç ayrıştırılmıyor → delta oynatma listelerinde sıra kayar, örtük AES-IV ve defter kimliği bozulur | `src/` geneli grep: eşleşme yok (yalnız vendor hls.min.js) |
| R51-19 | Pasif CDP yakalama segmentleri **ağ tamamlanma sırasıyla** decode eder; sıra dışı gelen parçalar `latestDts_` ilerlediği için mux.js'te kalıcı düşer | `main.js:10333-10359` + mux.js `caption-stream` DTS mandalı |
| R51-20 | Sıfır-cue'lu segment "fetch edildi/tamam" işaretlenir → decode hatası ile gerçekten boş parça ayırt edilemez, hatalı parça yeniden denenmez | `main.js:7284-7291` bölgesi (fetchKey kaydı sonuçtan bağımsız) |

### Renderer / yaşam döngüsü

| Kimlik | Bulgu | Kanıt |
| --- | --- | --- |
| R51-21 | Ana pencerede `render-process-gone`/`unresponsive`/`responsive` handler yok → renderer çökerse gri ekran, backend işleri sürer, kurtarma yok (handler'lar yalnız tarayıcı `wc`'lerinde: 10021-10022, 10227) | `main.js:11070-11188` bölgesi; grep doğrulandı |
| R51-22 | `ensureBrowserView` mutasyon korumasını canlı-view hızlı yolundan önce uygular → oturum içe aktarması `activateBrowserTab`'a null verir; **boş tarayıcı alanı + `browserView` desync** ve kapanışta yakalama kuyruğu uyarısız kaybolur | `main.js:9907-9911`, `12354-12378`, `10494` |
| R51-23 | Sekme `lifecycle`/`unloadedAt`/`keepAwake` renderer kopyasına hiç taşınmaz → "Etkin olmayan sekmeyi bellekten boşalt" düğmesi ve palet girdisi **kalıcı olarak ölü** | `main.js:2313` üretir; `renderer.js:5462, 10981` okur ama `newBrowserTabState`/`syncBrowserTabs` kopyalamaz |
| R51-24 | Anlamsal arama sonucu `hit.start` (altyazı zamanı) doğrudan `seek()`'e gider; `subtitleVideoTime` dönüşümü atlanır → ofsetli/ölçekli senkronda yanlış konuma atlar | `browser-features.js:119-131` |
| R51-25 | `sceneStrip` `pts_time` satırlarını stderr'in son 100 KB'ından okur → uzun videoda erken sahneler pencereden düşer; tamamen kaybolursa sahte `0:00` sahnesi üretilir | `browser-media-tools.js:24-25, 62-64` |
| R51-26 | Explain modu uçtan uca bozuk: `.srt` girdisi `reexport/translateOnly` dışında kaldığı için `authorizeMediaFile`'a düşer → medya uzantısı değil → iş başlamadan düşer; `explainTranslation` (sub2Path) yetki kontrolünden tamamen muaf | `main.js:15193-15195, 15402` |
| R51-27 | `media:listFolder` üretimde ölü: `maxDepth:0` ile listeleme hiç dosya döndürmez / katalog oynatma akışı bunu yetki kaynağı yapamaz | `main.js` media:listFolder bölgesi + `media-catalog-service.js:140` |

### Kuyruk yaşam döngüsü (renderer + kalıcılık)

| Kimlik | Bulgu | Kanıt |
| --- | --- | --- |
| R51-28 | Spawn penceresinde iptal: `persistQueueNow`/`startTranscribeSafe` await'leri sonrası `queueRunning`/`cancelled`/`status` yeniden denetlenmez → yetim Python işi sonuna kadar çalışır; `state.running` sonsuza takılabilir | `renderer.js:650-711` |
| R51-29 | Renderer reload'u kuyruk-dışı işi yetim bırakır: `loadQueueState` `activeJobId`'yi yalnız kuyruklu iş için döndürür → iş görünmez, iptal edilemez; yeni iş "Zaten bir iş çalışıyor" duvarına çarpar | `main.js:1224`, `renderer.js:3822, 2977` |
| R51-30 ✅ | Geçici "meşgul" ret'leri kalıcı `error`'a sınıflanır — **doğrulandı**: `/hâlâ kapanıyor\|zaten çalışıyor/i` hiçbir gerçek meşgul hatasını yakalamıyor (`'Zaten bir iş çalışıyor.'`, `'Gömme işi çalışırken…'`, `'Başka bir model işi…kapanıyor'`, `'…hâlâ çalışıyor'` hepsi kaçıyor) → kuyruk öğeleri tek tek yanar | `renderer.js:715-723` vs `main.js:15207-15214` |
| R51-31 | Aynı kök-adlı çıktılar sessizce birbirini ezer: `D:\a\film.mp4` ve `D:\b\film.mp4` ayrı kuyruk öğesi → ikisi de `film.en.srt` yazar; son commit kazanır, öncekinin `files` listesi yanlış içeriği gösterir | `renderer.js:434-446`, `transcribe.py:5263-5266, 5919` |
| R51-32 | Restore edilen kuyrukta her yerel dosya ayrı yetki diyaloğu açar (grant'lar bellekte); reddedilen öğe kalıcı `error` olur → "katılımsız kuyruk" imkânsız | `local-file-access.js` (Map bellek), `main.js:13514-13526, 15195`, `renderer.js:681-728` |
| R51-33 | `queueSnapshotPayload` `watchSource`'u serialize etmeden atar → reload sonrası izleme öğeleri `watch:report`'a ulaşamaz; `watchSeen` `queued:true` mandalında kalır → dosya bir daha taranmaz | `renderer.js:83-94, 485-489`, `queue-persistence.js:141` |

### Altyazı ayrıştırma/görüntüleme

| Kimlik | Bulgu | Kanıt |
| --- | --- | --- |
| R51-34 ✅ | Yerel `parseSubtitles` VTT `NOTE`/`STYLE`/`REGION` bloklarını cue gövdesine katar — **doğrulandı**: 4 gerçek cue'dan 5 cue çıktı, STYLE metni cue-1'e, NOTE metni cue-2'ye sızdı, NOTE içi `-->` sahte cue üretti (browser ayrıştırıcı bu blokları kesiyor, yerel kesmiyor) | `renderer.js:12090-12106` |
| R51-35 ✅ | Yerel SRT/VTT metni etiket/entity temizliğinden geçmez — **doğrulandı**: `<i>`, `&amp;`, `&nbsp;`, `<v Ali>` literal çıktı; kelime vurgusu ve düzenleme-geri-yazımı kirli metinle çalışır | `renderer.js:12104-12106` (browser yolu `cleanCueText` kullanır) |
| R51-36 | OSD browser modunda tamamen görünmez (`#playerOsd` `display:none` sahnede) → otomatik duraklatma/tekrar/hız geri bildirimi kaybolur | `renderer.js:15077-15084`, `index.html:1827`, `styles.css:5051` |
| R51-37 | G/H ve `subOffset` kaydırıcısı browser modunda ölü ama `player.offset`'e ve medya-state'e **yazar** → aynı medya yerelde açıldığında bayat ofset sessizce uygulanır | `renderer.js:20323-20324, 20349-20358, 9050-9060` |
| R51-38 ✅ | `transcribe.py` `segment_metrics` indeks kayması — **doğrulandı**: metrikler entries ile kilitli eklenir (5639-5640) ama `recover_punctuation_collapse`/`merge_resumed_entries`/`dedupe`/`fix_common_errors` entries'i mutasyona uğratırken metriklere dokunmaz; `find_repeated_hallucinations` metriği entries indeksiyle okur (4362). Resume'da grup `flagged=0` → tekrarlı halüsinasyon sessizce geçer | `backend/transcribe.py:5639-5640, 5688, 5714, 5728, 5736, 5744; 4310-4412` |
| R51-39 | `media:readSubtitle` mtime/hash döndürmez, `media:writeSubtitle` körlemesine yazar → harici düzenleme sessizce ezilir (lost update) | `main.js:1737-1738`, yazma yolu `backupOnce`+atomic |

### Manga / sağlayıcı / yardımcı süreç

| Kimlik | Bulgu | Kanıt |
| --- | --- | --- |
| R51-40 | `extractJsonPayload` her `{`/`[` için sona kadar tarar → 8 MB kapatıcısız açılışta O(n²); kullanıcı-endpoint yanıtı **ana süreci** dakikalarca kilitler | `browser-manga.js:23-49`, `main.js:5702` (8 MB sınır) |
| R51-41 | `<img src>` değişiminde aday kimliği öğeye bağlı → eski çeviri katmanı yeni sayfanın üstünde kalır, yeni görsel `mangaAttempted` yüzünden çevrilmez | `browser-manga.js:483-488, 975`, `main.js:6031` |
| R51-42 | Sağlayıcı SDK `max_retries` ayarlanmamış → SDK yeniden denemeleri × uygulama denemesi × rota failover çarpışır; tek timeout/5xx çok sayıda ücretli isteğe dönüşür | çeviri/manga OpenAI-istemci kurulum noktaları (`main.js` sağlayıcı bölgesi) |
| R51-43 | Yardımcı alt süreçlerde sır-ortamı temizliği tutarsız: `browser-reference-media.js:7` ve `browser-video-analysis.js:11` hiç env vermez (tam `process.env` mirası); `browser-alignment.js:29-31`, `browser-media-tools.js:10-11`, `nmdb-catalog-import.js:66-68` yalnız HF+LLM siler → `WHISPER_TRANSLATE_API_KEY` sızar | beş dosyada doğrulandı; `main.js:270-278` wrapper'ını atlıyorlar |

---

## P3 — orta bulgular (özet tablo)

| # | Bulgu | Yer |
| --- | --- | --- |
| R51-44 | Sekme kapatma, boşaltmanın sahip olduğu form/giriş/taslak/medya korumasını hiç çağırmaz; `waitForBeforeUnload:false` sayfa onayını da atlar → onaysız veri kaybı | `main.js:11461-11497` vs `11835-11848` |
| R51-45 | Aktif-olmayan sekme kapanışı komşuya koşulsuz `ensureBrowserView(next)` → hibernasyondaki sekmenin görünümü gizlice yeniden yaratılır; sonraki unload `already_unloaded` reddeder | `main.js:11501-11505` |
| R51-46 | `render-process-gone` yeniden-deneme zamanlayıcısı `tab`'a yazılmaz → unload yarışında boşaltılmış sekme dirilir; `manual-reload` politikasında `loadError` `'unloaded'` sekmede takılır | `main.js:10269-10277, 10401` |
| R51-47 | `browser:show` boş map'te yetim sekme kaydı üretir; view kurulamazsa kayıt diske yazılıp sonraki açılışta hayalet sekme olur | `main.js:11514-11518` |
| R51-48 | Kullanıcı atlama kayıtları reklam oynatımında da ateşlenir — `decideSkip` bağlamına `adPlaying` konmaz; `browserAutoSkipAds` kapalıyken bile reklam atlanır | `browser-features.js:269-272` vs `renderer.js:9791-9797` |
| R51-49 | Canlı-ASR `stop` kuyruktaki son ses parçalarını düşürür → son ~9 sn transkripte girmez (`stop` anında stdin'e yazılır, Python kuyruğu boşaltmadan çıkar) | `main.js:6562`, `backend/live_asr.py:31-35, 84-90`, `renderer.js:8813-8827` |
| R51-50 | `series-context:check` örtüşme taraması bozuk `end` ile O(cue×çeviri)'ye düşer → ana süreçte saniyelerce donma | `browser-series-context.js:127-155` |
| R51-51 | SPA hash-route çakışması: `url.hash=''` + `contentId` çıkarılamazsa aynı host'taki tüm videolar tek `mediaId`'ye çöker → altyazı yanlış videoya bağlanır (Stremio/Plex kalıbı) | `browser-media-identity.js:18` |
| R51-52 | `queue:saveSync` terminal-guard'ı salmaz → retry diske `done` maskelenir; guard'lar oturum boyu birikir | `main.js:14302-14310` vs `14321-14329` |
| R51-53 | İşler-arası/spawn boşluğunda renderer reload → `queueRunning` diske `activePresent` üzerinden yazıldığı için kuyruk sessizce durur, ipucu yok | `queue-persistence.js:167-173`, `main.js:1213-1225` |
| R51-54 ✅ | Kuyruk UI'sında boyut sınırı yok — **doğrulandı**: 600 öğe normalize'da 500'e kırpıldı (`invalidCount=100`); kullanıcıya kayıp bildirimi yok | `renderer.js:440-483`, `queue-persistence.js:4,152-153` |
| R51-55 ✅ | `queue-state.json` 8 MB okuma üst-sınırı — **doğrulandı**: >8 MB dosyada `readQueueStateRaw` `items:0` döner; `.bak` da büyükse kuyruk sessizce sıfırlanır | `main.js:1189-1199` |
| R51-56 | `history.json` `.bak`'sız; parse hatası sonrası ilk kayıt tüm geçmişi siler | `main.js:1505-1529` |
| R51-57 | Kapanışta child `close`'u beklenmez → transaction artıkları (`.whisper-output-transaction-*`) kalıcı kalabilir; mevcut flush kalıbı burada uygulanmıyor | `main.js:11262, 11303-11315, 15624-15638` |
| R51-58 | `playerJobEvent` olayı `jobId`/`queueItemId` bağı olmadan tüketir → bayat `player.job` kuyruk terminalini yiyebilir, kuyruk kilitlenir | `renderer.js:3344-3346, 3813-3824` |
| R51-59 | ETA: `startTime` indirme+ffmpeg'i de sayar → erken tahmin şişer; resume'de yüzde kalan bölüm ekseninde gösterilir; `download_progress` ETA saatini güncellemez | `renderer.js:676, 3885-3897`, `transcribe.py:5229-5244` |
| R51-60 | Test edilen kuyruk durum makinesi (`queue-lifecycle.js`) üretim akışına bağlı değil → 25k-interleaving güvencesi gerçek yolu kapsamaz | `renderer.js:6-10` importları, `tests/queue-lifecycle.test.js:351-362` |
| R51-61 | Manga `mangaFailures` gezinmede temizlenmez → IPC doğrudan çağrılırsa eski doküman adayları modele gönderilir (kota yanar) | `main.js:5357-5373, 6124-6128` |
| R51-62 | Manga düzenleme reddi sessiz (köprü ACK yok) → kullanıcı "kaydedildi" sanır, yeniden yüklemede kaybolur | `main.js:5872-5893`, `browser-manga.js:604-614` |
| R51-63 | Manga editörü dış-tıkta kaydedilmemiş metni atar | `browser-manga.js:853-856` |
| R51-64 | Manga overlay DOM'u sayfayla paylaşılır; sayfa düğümü silerse kopma algılanmaz, `mangaTranslated` sayacı yanıltıcı kalır | `browser-manga.js:656-670, 906-909` |
| R51-65 | Çevrilmiş balona tıklama sayfa etkileşimini yutar (görsele-tıkla-sayfa-çevir okuyucular) | `browser-manga.js:949` |
| R51-66 | JPEG LQIP placeholder `data:image/jpeg` regex'te yok → minik placeholder modele gider, gerçek görsel denenmez | `browser-manga.js:477`, `main.js:5505-5509` |
| R51-67 | Manga aday taraması yalnız `document.images` → `<canvas>`/shadow-DOM/CSS-background/iframe okuyucuları `no_regions` | `browser-manga.js:440`, `main.js:8980-8994` |
| R51-68 | Manga konum geri yüklemesi ordinal'e yaslanır; aday kümesi kayarsa yanlış görsele gider | `browser-library-tools.js:391-404`, `browser-manga.js:463,486` |
| R51-69 | OCR-cache isabeti bölge başına sıralı HTTP + "hepsi ya hiç" → tek bölge hatası tümünü görsel modele geri gönderir | `main.js:5810-5828` |
| R51-70 | Bozuk sync-transform'da renderer kimliğe düşerken overlay `legacyOffset`'e düşer → vurgu/altyazı kalıcı kopar | `renderer.js:9050-9060`, `main.js:12603-12605` |
| R51-71 | `findCueAt` boşluk karelerinde her kare O(N) tara; `updateCueMeta` her karede O(N) imza+Set kurar → uzun transkriptte kare-içi en pahalı iş | `renderer.js:12257-12261, 12345, 11690-11738` |
| R51-72 | Örtüşen cue semantiği yerel↔browser farklı (kapalı-aralık+ilk vs yarı-açık+tümü) → karaoke/çift-konuşmacı dosyalarında tutarsız görüntü | `renderer.js:12259-12260` vs `browser-subtitles.js:1067-1073` |
| R51-73 | VTT cue ayarları (`line/position/vertical/region`) parse edilir ama görselde uygulanmaz → dikey-CJK ve konumlu VTT yanlış konumda | `browser-subtitles.js:421-440`, overlay sabit konum |
| R51-74 | Yerel overlay'de taşma koruması yok (`max-height`/`overflow-wrap` yok) → boşluksuz uzun satır/URL videoyu kaplar | `styles.css:1060-1085` |
| R51-75 | Bidi kontrolleri (RLO/PDF, RLI/PDI) ve sıfır-genişlik karakterler uçtan uca korunur → görsel spoofing, dedup/vurgu kayması | `browser-subtitles.js:11-15`, yerel parser hiç süzmez |
| R51-76 | JASSUB tek-font fallback (Liberation Sans) → CJK/Arapça/emoji ASS'te tofu; HTML overlay aynı metni doğru basar | `browser-ass-renderer.js:111-114` |
| R51-77 | JASSUB canvas ile HTML overlay koordinasyonsuz → `ass-load` overlay'i kapatmaz, çift altyazı; MutationObserver tüm dokümanı izler | `browser-ass-renderer.js:104-116` |
| R51-78 | Öğrenilen sayfa terminolojisi sistem prompt'una güvenilmez-işareti olmadan girer → prompt-enjeksiyonu yüzeyi | `browser-terminology.js`/`browser-site-terminology.js` → prompt kurulumu |
| R51-79 | Sözlük/terminoloji boyut bütçesi merkezi değil → argv/prompt sınırına dayanabilir | `settings-security.js:3984` (`slice(0,200)` tek sınır) |
| R51-80 | Favicon hattı uçtan uca ölü: CSP `data:` izinli/`https:` değil, sanitizer `data:` reddeder → sekme/yerlerde simge hiç görünmez | renderer CSP + favicon sanitize zinciri |
| R51-81 | Karışık sürükle-bırak tek desteklenmeyen dosyada tüm grubu reddeder → geçerli video da düşer | `paths:scanMedia` ham-string + renderer FileList aktarımı |
| R51-82 | Sayfa odağındayken uygulama medya kısayolları (space/oklar/J/L/M/F) siteye gider; yalnız Ctrl/meta köprülenir | `before-input-event` köprüsü |
| R51-83 | Medya tercihi yalnız ilk `handled` kareye uygulanır → diğer frame/öğelerde varsayılan kalır | `main.js:11977-11988` (`break`) |
| R51-84 | Ayar `sanitizeUiSettings` tek bozuk sayıda tüm kalıcılığı durdurur; yükleme yolu yeniden doğrulamaz; hata `catch{}`'te yutulur | renderer ayar yükleme/kaydetme hattı |
| R51-85 | Çalışma alanı açılışı kayıtlı oynatma hızını `1x`'e sıfırlayabilir; `playerPositions`/`browserSponsorExemptions` import'ta belleğe uygulanmaz → sonraki kayıt ezer | ayar-import + workspace-open hattı |
| R51-86 | Noktalama-çöküşü kurtarma yolunda finite/sınır kontrolü yok → NaN damga `all_words`'e iner, `allow_nan=False` yazımı tüm çıktıyı geri alır | `backend/transcribe.py:1031-1040` vs `5471-5478` |
| R51-87 | Canlı-ASR `chunk_done` yankısı `job.chunkFiles` üyeliğini denetlemeden `fs.unlinkSync` yapar → stdout kirliliği keyfi-yol silme ilkeli | `main.js:6638-6641` |
| R51-88 | `cancelTooLate` yolu ölü: renderer okur ama ana süreç hiç üretmez; iptal-edilmiş işin çıktıları diskte kalıp UI `cancelled` gösterir (O-12'nin devamı, hâlâ açık) | `renderer.js:3840-3850` |

## P4 — düşük / sertleştirme (özet tablo)

| # | Bulgu |
| --- | --- |
| R51-89 | PDF kimliği ilk 1 MB + boyut hash'i → aynı öneki paylaşan iki PDF çakışır, `whisper-pdf://` URL'si oturumlar arası deterministik (`main.js:5150-5153`, `pdf-translate.js:447-464`) |
| R51-90 | `watch:start` kanonik `target`'a onay verir ama numaralandırmayı ham `dir` ile yapar — kozmetik tutarsızlık (`main.js:1055-1102`) |
| R51-91 | Mini-player `'close'` handler'ında `addChildView` korumasız (`browser-mini-player.js:45`) |
| R51-92 | Dizi yeniden-bağlaması eski series-scope atlama kayıtlarını yetim bırakır; `skip-delete` sahiplik kontrolünü geçemez (`browser-feature-services.js:52-63, 323-328`) |
| R51-93 | `media:command` sonrası hata metni 180 karaktere kesilir ama `handled:false` adayın hatası diğer aday başarılıysa sessizce yutulur — teşhis kaybı |
| R51-94 | `queueInputKey` yolu kanonikleştirmez (`..`/symlink/sürücü-harf farkı) → aynı fiziksel dosya iki kez kuyruğa girer (`renderer.js:434-437`) |
| R51-95 | `addHistory` aynı girdinin önceki **başarı** kaydını başarısız yeniden denemeyle siler (`main.js:1525-1529`) |
| R51-96 | `queueSecretsFromCurrentUi` dondurulmuş sırları koşulsuz güncel UI ile ezer — "eklendiği andaki ayarlar" sözleşmesi bozulur (`renderer.js:114-127, 681`) |
| R51-97 | İzleme doğrulama-hataları "zaten kuyrukta" diye raporlanır — yanıltıcı sayım (`main.js:1634-1636` bölgesi) |
| R51-98 | `queueTerminalGuards` öğe silinince Set'te ömür boyu kalır (trivial sızıntı) |
| R51-99 | `done` öğe + sıfır-olmayan exit → parazit "Hata" durumu (`renderer.js:4044-4052`) |
| R51-100 | Manga `no_regions` negatif sonucu cache'lenmez → metinsiz sayfa her oturumda 2 görsel çağrısı (`main.js:5835`) |
| R51-101 | Manga editör `maxLength=3000` vs saklama 4000 / yeniden-yükleme 1200 — üç farklı sınır (`main.js:5885`, `browser-manga.js:110`) |
| R51-102 | `manga-edit` `sendBrowserEvent`'i renderer'da tüketilmez — ölü olay (`main.js:5888`) |
| R51-103 | Manga scroll listener passive değil + ilk-layout'ta bölge başına reflow patlaması (`browser-manga.js:757, 712-718`) |
| R51-104 | `compatibilityMode` "enjeksiyonlar kapalı" sözüne rağmen manga betiği yine çalışır |
| R51-105 | `documentElement` transform'u fixed-overlay konumunu kaydırır; sayfa `!important` inline stilleri ezebilir (`browser-manga.js:908`) |
| R51-106 | `main.js:6017` `frameResults` yanıltıcı ad — tek ana-frame sonucu; çalışıyor ama "çerçeve" izlenimi yanlış |
| R51-107 | Açık `http:` manga görsel isteği çerezleri düz metin taşır + sayfa CSP'sini aşar (`browser-manga.js:302`, `main.js:5431-5438`) |
| R51-108 | Yerel overlay/kartlarda `dir`/`lang` yok; RTL'de taban yön farkı; `.cue-card-*`'de `overflow-wrap` yok (`index.html:1823-1825`) |
| R51-109 | `renderCue` else-kolu `activeIdx`'i sıfırlamaz → boş cues'ta `copyCue` stale indeks TypeError'ı (try/catch yutar) (`renderer.js:12354-12357, 12673-12680`) |
| R51-110 | `Math.min(...boundaries)` spread'i ~80k elemana yaklaşır → V8 sınırında overlay render'ı fırlatabilir (`browser-overlay-controller.js:335`) |
| R51-111 | ASS/SRT zaman regex'leri anchor'suz → gömülü bozuk zaman metni sessiz yanlış cue üretir (`renderer.js:12028-12031, 12090`) |
| R51-112 | Medya-sessions/global media-key entegrasyonu yok (`navigator.mediaSession`/`globalShortcut` bulunamadı) |
| R51-113 | Test koşucu `tests/run-all.js` `spawnSync` süre-timeout'suz → tek asılı test CI'yi sonsuz kilitler |
| R51-114 | Python yokluğunda `run-all.js` başarısız sayar ama bazı dokümanlar "atlanır" der — uyuşmazlık |
| R51-115 | `npm test` yalnız `*.test.js`; `*.smoke.js` ve birçok browser modül testi paket dışı — kapsam yanılsaması |

---

## Doğrulanan sağlam alanlar (bulgu değil)

Denetim sırasında aşağıdaki savunmalar güncel kodda doğrulandı — burada **tekrar iş listesi YOK**:

- **Tarayıcı IPC yetkisi:** tüm `browser:*` handler'ları `event.sender === mainWindow.webContents && senderFrame === mainFrame` (`main.js:11324-11328`); köprü tür-whitelist + sekme-sender eşleşmesi + aktif-sekme şartı + `bridgeToken` rotasyonu (`11348-11759`).
- **Yerel dosya erişimi:** kanonikleştirme (`\\?\`/ADS/mutlak-olmayan ret), symlink çözümü, uzantı+boyut+içerik imzası (`%PDF-`) ve diyalog-onaylı grant — `local-file-access.js` (R51-01'in bypass ettiği yol hariç).
- **Gezinme politikası:** deny-by-default; http/https iç, `mailto:` dış; kontrol-karakter/oversize/kimlikli-URL ret; `will-frame-navigate`/`will-navigate`/`will-redirect` korumaları (`browser-navigation-policy.js`).
- **Alt süreç hijyeni (ana yol):** `spawn` wrapper'ı varsayılan `withoutSecretEnv` (`main.js:270-278`); list-form spawn, shell yok, bounded stdout/stderr, timeout, abort — beş yardımcı modül dışında (R51-43) tutarlı.
- **Kalıcılık:** `settings.json`/`queue-state.json`/`watch-library` atomik tmp→rename + `.bak`; terminal-guard merge koruması; `running`→`pending` onarımı.
- **Çıktı işlemleri:** staging+journal+commit/rollback, `_pid_is_alive` sahiplik süzgeci.
- **Manga indirme:** per-hop URL doğrulama + DNS-pin + redirect yeniden-doğrulama + 14 MB/30 sn sınır + magic-byte sniffing.
- **Oturum paketi (dışa/içe aktarım):** `portableSessionTab` dosya yollarını siler, checksum + traversal/symlink/boyut korumaları (`browser-session-package.js`) — sorun paket içeriği değil, açılış-restore'unun koşulsuz grant'i (R51-01).
- **Skip-segment kayıtları:** normalize + sahiplik kontrolü + tek-ateş bastırma + kuşak sıfırlama (`browser-skip-segments.js`, `browser-features.js:255-265`).
- **`browser:extras` kapısı:** aktif-sekme + `generation` + `mediaId` katı eşitliği, AbortController, navigasyonda `cancel(tab)`.
- **JASSUB yaşam döngüsü:** `emptied`/`pagehide`/video-disconnect'te `detach`, iptal-korumalı kurulum, 2 MB metin sınırı.
- **XSS:** tüm metin yolları `textContent`/textNode; 39 `innerHTML` noktasının tamamı `escapeHtml`/statik; `eval`/`srcdoc`/`insertAdjacentHTML` yok.

## Düzeltme planı (önerilen kademeler)

**Kademe 1 — veri kaybı / güvenlik sınırı (önce bunlar):**
R51-01 (paket→grant), R51-02 (endpoint+sır), R51-03 (kuyruk flush sırası), R51-04 (stdin crash), R51-05 (editör hedefi), R51-39 (disk tazeliği), R51-07/08/09/11 (izin ve dosya-gömme yüzeyleri).

**Kademe 2 — sistematik özellik ölümü:**
R51-06 (WebP/AVIF), R51-16..20 (CEA boru hattı boşlukları), R51-23 (lifecycle kopyası → unload UI), R51-26 (explain modu), R51-27 (media:listFolder), R51-34/35 (yerel parser), R51-36/37 (OSD/ofset).

**Kademe 3 — yaşam döngüsü kilitleri:**
R51-21 (renderer crash handler), R51-22 (ensureBrowserView null), R51-28..33 (kuyruk yarışları + kalıcılık), R51-44..47 (sekme kapatma/crash yarışları), R51-57 (kapanış bekleme).

**Kademe 4 — doğruluk/performans:**
R51-12..15 (komut yolu), R51-24/25 (seek/sahne), R51-38 (metrik hizası), R51-40 (O(n²)), R51-50 (dizi-donma), R51-70..77 (görüntüleme tutarlılığı).

**Kademe 5 — sertleştirme / kozmetik:**
R51-42/43 (SDK retry + env scrubbing), R51-48/49/51, R51-61..69 (manga yaşam döngüsü), R51-78/79 (prompt yüzeyi), R51-80..88, P4 tablosu.

## Runtime doğrulama gerektirenler (kalan)

Aşağıdakiler yukarıdaki koşularda **doğrulandı**: R51-02, R51-06, R51-08 (netleşti), R51-30, R51-34/35, R51-38, R51-54, R51-55.

Hâlâ açık olanlar (canlı uygulama/gerçek site/zamanlama gerekir):
- R51-13/28/46/57: yarış pencereleri gerçek zamanlamada repro edilmeli.
- R51-16..20: gerçek HLS (byterange + delta-playlist + çok-varyant) akışında CEA fixture e2e.
- R51-21: renderer'ı `process.crash()` ile öldürüp pencere davranışı.
- R51-24: ofsetli senkronlu videoda anlamsal arama tıklaması.
- R51-01: paket→oturum grant zincirinin uçtan uca repro'u (crafted `.wspak` + restart — statik zincir tam kanıtlı, e2e onayı kaldı).

## Sınırlar

- Denetim statik + hedefli doğrulama koşuları; ürün kodu değişmedi. Doğrulama harness'leri `.uiprev/ni-test/` altında (repo-dışı araç dizini).
- `BROWSER_BUG_REPORT_42/46/47` diskte `.gitignore` kapsamında olmadığı için tekilleştirme devir-özeti + seri devamlılığıyla yapıldı; olası kesişimler işaretlendi (R51-88 gibi).
- `AGENTS.md`'deki "son: 28" ibaresi güncel değil — gerçek seri 51'e ulaştı; bu rapor 51'dir.
- Rate-limit ile ölen ajan oturumları yeniden başlatıldı; tüm 35 kapsam tamamlandı.
