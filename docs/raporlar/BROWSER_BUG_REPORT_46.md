# BROWSER BUG REPORT 46 — İkinci 10-ajan derin denetim turu

Tarih: 2026-09-16

Kapsam: Rapor 42'den sonra kalan bölgeler — preload köprüleri, olay zarfı/betik çalıştırma, indirme/gezinme/site izinleri, otomasyon/kaydedici/palet, çeviri iç yapıları, not/kütüphane/arama, AI bağlam/kimlik, görüntü/okuma/PDF, yerel yardımcılar, edinim kümesi. 10 salt-okunur ajan + satır seviyesinde elle doğrulama. **Ürün kodu değiştirilmedi.**

Önem sırası: P1 veri kaybı/kritik işlev · P2 gerçek hata · P3 koşullu kusur · P4 sertleştirme/not.

---

## P1 — kritik

### R46-01 — PDF yeniden çevirisi kayıtlı çevirileri `failed` ile eziyor (veri kaybı)

- **Yer:** `src/main.js:13347-13376` (`pdf:translatePages`), `src/pdf-translate.js:417-445` (`pendingPdfPages`/`translatedPdfPages` ölü), `src/main.js:5231-5302` (`translatePdfPage` + `recordPdfPageTranslation` koşulsuz üzerine yazıyor).
- **Mekanizma:** Handler istenen sayfaları `pendingPdfPages` ile süzmeden hepsini yeniden çevirir; API hatası alınırsa bloklar `status:'failed'` ile `state.pages[page]`'nin ÜZERİNE yazılır ve `pdf-translations/<hash>.json`'a persist edilir → daha önce başarıyla çevrilmiş sayfalar diskte de geriye gider. Ayrıca `failed` sayımı (13366) istenen paketle sınırlı değil, tüm state üzerinden → önceki oturumun hataları yeni işi `ok:false` gösterir.
- **Tetikleyen:** "Tüm kitabı çevir"e ikinci kez basmak (yeni sayfalar eklemek için) + aynı anda kota/bağlantı hatası.
- **Plan:** `pages`'ı `pendingPdfPages(istenen, state)` ile süz; `recordPdfPageTranslation`'da mevcut `translated` bloğu yeni `failed` sonuçla ezme (merge semantiği); `failed` sayımını yalnız istenen sayfalarla sınırla. Regresyon testi: tamam-çevrilmiş sayfa + fail eden yeniden-istek → eski çeviri korunmalı.

### R46-02 — ASS canvas tam ekranda görünmez

- **Yer:** `src/browser-ass-renderer.js:78-116` (canvas video ebeveynine `position:absolute`, `zIndex 2147483646`), `src/browser-overlay-controller.js:358-376` (fullscreen sarmalaması yalnız videoyu taşır).
- **Mekanizma:** JASSUB canvas'ı fullscreen elementin alt-ağacında değil → top-layer dışında kalır → z-index ne olursa olsun çizilmez. Hem native `<video>` fullscreen'de hem uygulamanın `__whisper_fullscreen_player` sarmalamasında geçerli.
- **Tetikleyen:** ASS yüklüyken video tam ekran.
- **Plan:** `fullscreenchange`'te canvas'ı `document.fullscreenElement` (veya `__whisper_fullscreen_player`) içine taşı/geri al; ya da sarmalayıcıya canvas'ı da dahil et. Electron smoke'a "ASS + html fullscreen" adımı ekle.

---

## P2 — doğrulanmış gerçek hatalar

### R46-03 — Sayfa-dünyası yakalama kuyruğu tamamen taklit edilebilir (B66/B76 güçlendirme + yeni mekanizmalar)

- **Yer:** `src/main.js:9292-9304` (hook ana dünyada), `8699-8746` (durum `window.__whisperCapture*`), `8843-8864` (drain yalnız `captureId` truthy ister), `9351-9352` (**`Buffer.from(entry.bodyBase64)` boyut denetiminden ÖNCE**), `9353` (`normalizeBrowserNetworkRecord(entry)` — `navigationId`/`mediaIdentity` raw'dan), `8048-8084` (12MB kontrolü), `8131-8133`→`3933-3957` (media-identity devralma), `8160-8307` (manifest→fetch fan-out).
- **Mekanizma (yeni kanıtlar):** (a) Sahte entry'de sınırsız base64 → `Buffer.from` 12MB kontrolünden önce çalışır → drain başına ≤32 entry × frame ile bellek şişmesi/OOM. (b) Geçerli görünümlü manifest gövdesi → DASH matcher başına init fetch (matcher sayısı sınırsız) + SegmentList başına 10k parça + ≤24 iz × 12MB → public host'lara istek rölesi/amplifikasyon. (c) Sahte VTT gövdesi → `storeBrowserTrack` → `browserAssetStore` + watch index'e kalıcı yazım + overlay. (d) Sahte manifest → `adoptBrowserStreamMediaIdentity` → `invalidateBrowserTabSubtitles` + reset → tekrarında sürekli altyazı silme. (e) `navigationId`/`mediaIdentity` entry'den alınıyor → dedupe bypass (`browserCapturePayloadSeen` 512 FIFO ezilir).
- **Azaltıcılar (doğrulandı):** `ceaSegment`/`dashTrack` normalize'da düşer → CEA yolu kapalı; SSRF koruması (private IP reddi) var; cross-origin cookie yok.
- **Plan:** (a) `Buffer.from`'dan önce string-uzunluk denetimi + toplam flush byte bütçesi; (b) `navigationId`/`mediaIdentity`'yi page-entry'lerde `context`'ten al (raw fallback kaldır); (c) manifest fan-out'una toplam matcher/byte/sekme-oran sınırları; (d) uzun vadede gövde taşımayı CDP `Network.getResponseBody`'ye taşıyıp page-world kuyruğunu kaldır.

### R46-04 — `capture_failed` fazı hiç ateşlenmiyor (B115 doğrulandı, hâlâ açık)

- **Yer:** `src/browser-acquisition.js:177-185` + tüm `plan.finish()` çağrıları `main.js:3083,6828` hep `success:true`; otomatik basamaklar için `success:false` çağrısı ve timeout yok.
- **Sonuç:** Altyazısız sayfada basamaklar `waiting`/`running`'de sonsuza kalır → `capture_failed` ölü kod → kullanıcıya "dosya seçin veya canlı Whisper kullanın" yönlendirmesi hiç gösterilmez.
- **Plan:** Probe "iz yok" sonucunda `finish('native-text-track',{success:false})`; manifest işlenip iş bulunamadığında `finish('manifest',{success:false})`; `persisted-track` 0 restore'da başarısız finish; `network-capture` için sınırlı settle süresi.

### R46-05 — Ertelenmiş altyazı yayını eski sayfanın cue'larını yeni kimlikle yayınlar + kalıcı indekse yazar

- **Yer:** `src/main.js:6959-6985` (pending+650ms timer), `6894-6920` (`flushBrowserTrackPublication` → `publishBrowserTrackNow` context'i **yeniden doğrulamaz**), `6863` (`pageUrl` canlı URL), `6876` (`persistBrowserTrack` canlı `browserWatchMediaId`), `6890` (`subtitle-found` güncel damgayla → kapı geçer).
- **Tetikleyen:** streamKey'li iz (CEA/HLS/live-ASR) yakalanırken kullanıcı başka videoya/sayfaya geçer → eski cue'lar yeni `mediaId` altında yayınlanır ve `browserAssetStore`/watch-index'e kalıcı yazılır; sonraki ziyarette yanlış iz restore edilir.
- **Plan:** `publishBrowserTrackNow`'da `entry.meta?.context` için `isCurrentBrowserContext` yeniden kontrolü; persist/publish'ta store-anında dondurulmuş `capturedMediaId` kullan.

### R46-06 — `page-translate-done` son await'ten sonra kontrolsüz → arşiv zehirlenmesi

- **Yer:** `src/main.js:4838` (kontrol son await'ten önce), `4870-4874` (son `executeBrowserTrustedMain` await), `4897` (`persistBrowserPageTranslationArchive` canlı URL), `4900` (`page-translate-done` güncel damga).
- **Tetikleyen:** Çeviri apply zinciri bittikten sonra failure-işaretleme await'i sırasında gezinme → eski sayfanın çevirileri yeni URL altında arşivlenir; yeni sayfa "hazır" gösterir.
- **Plan:** 4874 sonrası + 4900 öncesi `pageTranslationJobIsCurrent(tab, job)` yeniden kontrolü; archive persist'e `session.generation === tab.generation` koşulu. (Aynı desen: `flushBrowserPageApply`'ın `page-translate-layout` olayı 4423'te kontrolsüz — birlikte düzelt.)

### R46-07 — Otomasyon geçidi claim'i sessiz başarısızlıklarda sızıyor

- **Yer:** `src/renderer/renderer.js:7793-7799` (`claim` → `queueMicrotask(useBrowserTrack)`; `finish` yalnız `.catch`'te), `7925+` (`useBrowserTrack`'in sessiz return yolları: track yok, defer, CEA-pending, prepareSeq, stale), `8036` (`startBrowserLiveTranslation` `{ok:false}` döndürür, throw etmez).
- **Sonuç:** Claim edilen anahtar `started`'da kalır → aynı iz oturum boyunca bir daha claim edilemez + 10 işlik oturum kotası hiç başlamayan işlerce tükenir; dedupe yeniden duyuruyu da engeller.
- **Plan:** `useBrowserTrack` sonuç döndürsün; `{ok:false}`/sessiz return'lerde `finish(opKey)` çağır; defer/CEA yollarında claim'i ertele ya da nihai sonuçta mutlaka `finish`/`complete`.

### R46-08 — Yanlış `operationKey` `completed` işaretleniyor (çapraz iz kirliliği)

- **Yer:** `src/renderer/renderer.js:11496` (`complete(translationTab.browserAutomationOperationKey)` — alan her karar çağrısında 7792'de üzerine yazılır), `src/browser-automation-rules.js:76` (`complete` koşulsuz `remember(completed)`).
- **Tetikleyen:** A izi auto-claim → kullanıcı B'yi seçer → `operationKey=keyB` → A'nın çevirisi biter → `complete(keyB)` → B hiç claim edilmeden `completed` → B'nin otomasyonu oturum boyunca reddedilir; A'nın anahtarı `started`'da kalır. Ayrıca `browserAutomationOperationKey` media-identity reset'te temizlenmiyor → eski medyanın anahtarı yeni medyada complete edilebilir.
- **Plan:** Claim anında anahtarı işe/trackId'ye bağla; complete'i başlatılan işin kendi anahtarıyla çağır; `gate.complete`'i `started.has` korumalı yap.

### R46-09 — `writeTextAtomic` tanımsız → araştırma defteri Markdown dışa aktarımı her seferinde çöküyor

- **Yer:** `src/main.js:13895` — tanımlı olanlar `writeSubtitleAtomic`(1139)/`writeJsonAtomic`(1155)/`writeBufferAtomic`(1167); `writeTextAtomic` hiç yok → ReferenceError → `{ok:false,'writeTextAtomic is not defined'}`.
- **Plan:** `writeSubtitleAtomic` kullan ya da genel `writeTextAtomic` yardımcısı ekle; smoke'a export adımı ekle.

### R46-10 — Kesintili/duraklatılmış indirmeler `live` yuvasını sonsuza işgal ediyor

- **Yer:** `src/browser-downloads.js:10,50,74,81` — `live`'dan tek çıkış `done`; resumable `interrupted`/`paused` item `live`'da kalır; `accept` `live.size >= maxActive` ile reddeder.
- **Tetikleyen:** Ağ kesintisiyle 8 indirme `interrupted` → 9. kalıcı reddedilir; kapanış diyaloğu ölü indirmeleri sayar.
- **Plan:** `interrupted`/`paused` item'ları `live`'dan `resumable` Map'e taşı (ya da aktif sayımından hariç tut); uzun-süreli interrupted'a otomatik `item.cancel()`.

### R46-11 — iframe içinde orta/Ctrl+tık yutuluyor

- **Yer:** `src/browser-preload.js:35-49` (tüm frame'lerde `preventDefault`+`stopImmediatePropagation`+IPC) → `src/main.js:11656-11659` (`senderFrame !== mainFrame` → sessiz return).
- **Plan:** `browserDiscoveryFrameAllowed` (11686-11692) gibi `main.framesInSubtree.includes(senderFrame)` kabulüne genişlet — IPC zaten `isTrusted` jest gerektiriyor; ya da preload'da `window !== window.top` iken intercept etme.

### R46-12 — `mediaKeySystem` izin listesinde yok → EME/DRM isteği reddedilir (cihaz doğrulaması gerekli)

- **Yer:** `src/browser-site-permissions.js:1-5` (liste `mediaKeySystem` içermiyor) → `main.js:9893-9908` (`normalizePermissionName` → `''` → `callback(false)`).
- **Tetikleyen:** Castlabs build'de `requestMediaKeySystemAccess` handler'a düşerse Netflix/Disney+ kilitlenir; kendi DRM probe'umuz (`main.js:9761`) da `NotSupportedError` alabilir.
- **Plan:** Listeye `'mediaKeySystem'` ekle + kararını açıkça ver (allow veya ask); cihazda Netflix/EME probe ile doğrula.

### R46-13 — Yerel modda `sonraki` replikler kapsamdan bağımsız sağlayıcıya gidiyor

- **Yer:** `src/renderer/renderer.js:14439-14440` — `ctx.sonraki = cues.slice(i+1, ...)` scope'a bakmadan HER ZAMAN eklenir; browser dalı `BrowserAiContext.context` 'watched' kapsamını uygularken yerel dal uygulamaz (`aiTranscriptEvidence` uygular — asimetri).
- **Sonuç:** "Şu ana kadar izlenen" seçiliyken gelecekteki replikler (spoiler) modele gider.
- **Plan:** Yerel dalda `ctx.sonraki = scope==='watched' ? [] : cues.slice(...)`.

### R46-14 — Tanı paketi secret regex'i dar → `access_token=`/`session=` sızıyor

- **Yer:** `src/browser-diagnostics-export.js:14` — `\b(api[_-]?key|token|sig|signature|secret|authorization|cookie|password)` — `\btoken` `access_token`'da sınır bulamaz (`_` word-char) → `access_token=`, `id_token=`, `refresh_token=`, `session=`, `sid=`, `jwt=`, `x-amz-*` bare metinlerde aktarılır. `sanitizeManifestPreview`/`SENSITIVE_MEDIA_URL_PARAM` bu adları kapsıyor — asimetrik sansür.
- **Plan:** Anahtar listesini `browser-adapters.js`'teki geniş listeyle eşitle veya ortak modülden paylaş; teste `access_token=` fixture'ı ekle.

### R46-15 — `browserTrackStreamKey` ile `normalizeStreamIdentityUrl` aynı akışı farklı normalize ediyor + provenance sırrı diske

- **Yer:** `src/main.js:3880-3898` (elle kara liste — `session|sid|jwt|api_key|access_token|utm_*|hdnts|x-amz-*` TUTULUYOR) vs `src/browser-media-identity.js:124-150` (SENSITIVE+TRACKING+VOLATILE üç liste).
- **Sonuç:** (a) `session=`/`jwt=` rotasyonlu URL'lerde aynı akış her yenilemede yeni streamKey → `browserTrackBuffers`/`PendingPublications`/HLS haritaları/coverage parçalanır → mükerrer iz yayını + eşzamanlı mükerrer segment indirme. (b) `provenance.streamKey`/`epoch` ham sorgu değerini taşır → `browser-asset-store` normalizeCues ile **diske** yazar → jeton değerleri userData'da kalıcı.
- **Plan:** `browserTrackStreamKey`'de aynı üç regex'i uygula; asset-store'da streamKey'i sansürle ya da yalnız hash sakla.

### R46-16 — `adoptBrowserStreamMediaIdentity` çok-manifestli sayfalarda kimlik çalkantısı (B77'nin uzantısı)

- **Yer:** `src/main.js:8131-8132` — DASH'ta her `.mpd` yeniden benimser; HLS'te `!streamMediaId` iken altyazı-çocuk playlisti (STREAM-INF'siz) kimliği benimser → master gelince farklı kimlik → `invalidateBrowserTabSubtitles` + renderer reset → oturum ortasında altyazı silinmesi. SSAI/reklam podlarında her pod'da churn. (Doğrulamadan önce benimseme — B77 — ayrıca duruyor.)
- **Plan:** Yalnız `manifestDeclaresSubtitleWork`/master adaylarından benimse; `streamMediaId` varken çocuk playlistlerini atla; DASH'ta aynı-origin/yol-öneki kararlılığı.

### R46-17 — Sayfa-çeviri `visible()` gizli metni kaçırıyor → prompt-injection kanalı

- **Yer:** `src/browser-page-translate.js:736` — `getClientRects().length!==0 && rect>=1px` yeterli; `opacity:0`, `visibility:hidden`, `color:transparent`, `left:-9999px`, `clip-path` geçer → görünmeyen metin `blocks[]`'e ve `chatContext.page`'e girer → sağlayıcıya "kanıt" diye gider.
- **Plan:** `element.checkVisibility?.({checkVisibilityCSS:true})` veya `getComputedStyle` ile `visibility/opacity/font-size` + viewport-içi rect denetimi.

### R46-18 — Statik/finalize izlerde `captureComplete=false` → son cümle grubu kalıcı çevrilmez

- **Yer:** `src/main.js:6869` (`captureComplete: meta.captureComplete === true` — `finalize`'dan türetmiyor), `7652/8209/8233` (`finalize:true` çağrıları `captureComplete` göndermiyor), `renderer.js:8067/8850` (`sourceComplete: track.captureComplete !== false`), `src/browser-translation-scheduler.js:66-69` + `main.js:6338` (`assembleCueSentences` canlı mod son grubu tutar).
- **Sonuç:** CEA tam-yakalama dışındaki TÜM yollar (tek-dosya VTT, HLS playlist, DASH, discovered, DOM texttrack, live-ASR, CEA incremental) `captureComplete:false` üretir → noktalamasız son cümle grubu sonsuza dek `pending` kalır → son satır(lar) hiç çevrilmez ve kalıcı/export edilen çeviride eksik. Asimetri: restore edilen izde alan yok → `undefined !== false` → `sourceComplete:true` — aynı dosya yeniden açılınca "tamam" davranır.
- **Plan:** `storeBrowserTrack`/`publishBrowserTrackNow`'da `captureComplete: meta.captureComplete === true || meta.finalize === true`; akış gerçekten bittiğinde (akış sonu/navigasyon) son yayını `captureComplete:true` ile yap.

### R46-19 — Finalize yayınının ardından bayat pending yayın dosyayı geri alıyor

- **Yer:** `src/main.js:6959-6966` (pending yalnız fingerprint EŞİTSE temizlenir), `6967-6976` (finalize farklı fingerprint'te pending+timer silahlanmış kalır), `6894-6920` (`flushBrowserTrackPublication` monotonic guard yok).
- **Tetikleyen:** Canlı izde silahlı timer + `finalize:true` farklı fingerprint'le gelir → ~650ms içinde eski pending 'stable' sayılıp aynı `filePath`'e ESKİ cue kümesini yazar + `subtitle-found`'u geriye giden `cueCount` ile yeniden yayar.
- **Plan:** Finalize yolunda pending'i fingerprint'ten bağımsız sil + `clearTimeout`; `publishBrowserTrackNow`'a aynı `publicationKey` için monotonic cueCount/fingerprint kontrolü.

### R46-20 — Renderer `parseAss` kendi export'umuzun `\{⁠`/`\⁠` marker'ını tanımıyor (B109/B135 kalıntısı)

- **Yer:** Yazar `src/browser-subtitle-output.js:15-22` (`\`→`\⁠`, `{`→`\{⁠`, `}`→`\}⁠`); kanonik okuyucu `src/browser-subtitles.js:271-339` tanır; **renderer `parseAss` (`renderer.js:12038-12043`) tanımaz** → `\{⁠x\}⁠` bloğunu override sanıp siler; `\⁠N` literal `\N` olarak görünür.
- **Tetikleyen:** `{`/`}`/literal `\N` içeren cue → `browser:subtitle:export` ile `.ass` yaz (doğrulama geçer) → aynı dosyayı oynatıcıda aç → ekranda bozuk metin.
- **Plan:** Canonical sıyırmayı renderer'a taşı (paylaşılan yardımcı export et) — `\{`-duyarlı override sıyırma + `\\N`→`\n`, `\\h`→` `, `\\([{}])⁠`→`$1`, `\\⁠`→`\`.

### R46-21 — yt-dlp güncellemesi ana transkripsiyon yoluna ulaşmıyor

- **Yer:** `src/main.js:15375` (`transcribe:start` env = `buildSecretEnv` — PYTHONPATH yok) vs `754`/`15666` (`pythonRuntimeEnv` kullananlar: media.py ve updateYtdlp). `backend/transcribe.py:299` `import yt_dlp` venv'den yüklenir.
- **Sonuç:** "yt-dlp güncelle" + YouTube transkripsiyonu → güncellenen sürüm kullanılmaz; güncelleme yalnız oynatıcı indirme yollarını etkiler.
- **Plan:** `transcribe:start`'ta env'i `pythonEnvWithRuntime(buildSecretEnv(...), ytdlpRuntimeRoot(userData))` ile sarmala.

### R46-22 — Altyazı tercih deposu yazma/okuma anahtar asimetrisi (akış sayfalarında tercih geri gelmez)

- **Yer:** `src/main.js:12222-12224` (`put` `mediaId: streamMediaId || mediaId` gönderir ama `normalizeSessionTab` `mediaId`'yi URL'den **yeniden** türetir → `...:stream:<hash>` soneki düşer → satır taban mediaId altında) vs `src/main.js:3919` (`get(tab.streamMediaId || tab.mediaId)` — akış sayfasında stream anahtarıyla bakar → ıskalar) + `12157` (`remove(streamKey)` hiçbir şey silmez).
- **Sonuç:** HLS/DASH sayfasında seçilen altyazı tercihi oturumda restore edilmez; "Tercihi unut" `updateTab` zinciri gelmezse (çökme/edge) satır kalıcı kalır.
- **Plan:** `get`/`remove`/`restore`'da taban `tab.mediaId` kullan (stream URL'leri oturumlar arası değiştiği için taban doğru anahtar) ya da `put`'a stream-kimliğini koruyan hafif normalize yolu ekle.

### R46-23 — `watch:newFiles` olayı düşerse dosya kalıcı kilitlenir + korumasız send

- **Yer:** `src/main.js:1026` (`queued=true` send'den ÖNCE, `watch-folder.js:77`), `1033-1046` (mainWindow yoksa/destroyed ise liste sessizce atılır; `webContents.send` try/catch'siz → destroyed'a send fırlatırsa interval'de uncaught).
- **Tetikleyen:** Renderer reload/crash sırasında stabilite tamamlanması → dosya `queued:true, hadOutput:false, retryAfter:yok` → bir daha teklif edilmez; watchdog yok.
- **Plan:** Entry'e `sentAt` ekle; `watch:report` gelmezse N dk sonra `queued=false`; ya da `did-finish-load`'da `queued && !hadOutput` entry'leri yeniden gönder; `send`'i try/catch'e al + hatada `queued=false`+`retryAfter`.

### R46-24 — İzleme uygulama yeniden başlatmada sessizce durur

- **Yer:** `src/renderer/renderer.js:1575-1622` — `applyWatchState` yalnız klasör-seç/change/format-değiş handler'larında; init bloğunda (2674+) `watchEnabled` checkbox'ı restore edilir ama `applyWatchState()` çağrılmaz → main'de `watchTimer` null → UI "izleniyor" gösterir, tarama yok.
- **Plan:** Init'te `if ($('watchEnabled')?.checked && state.watchDir) applyWatchState()` — ya da kasıtlıysa checkbox'ı persist'ten çıkar/açılışta "izleme durdu" bildirimi.

### R46-25 — `watch-library-store` `lastWatched`/session regresyonu + tombstone şişmesi

- **Yer:** `src/watch-library-store.js:565` (`lastWatched: patch.lastWatched || now()` — `Math.max` yok; `watch-library-state.js:273`'te var ama o modül ÖLÜ — yalnız testler kullanıyor), `546` (`{...prev, ...patch.session}` — watchSeconds/endedAt max'ı taşınmamış), `604` (tombstone'a tam item gömme), `390-424` (`atomicCommit` her upsert'te tam belge + fsync).
- **Tetikleyen:** `library:upsert-before-close` (sendSync) async kuyruğu atlayınca eski progress patch'i sonradan uygulanıp `lastWatched`/watchSeconds'i geriye götürebilir; 2000 tombstone × tam item → dosya şişmesi; progress flush'ları her seferinde tamamını yazar.
- **Plan:** `lastWatched = Math.max(prev||0, patch||now())`; session merge'e max-birleştirme; tombstone item'ını boyut-sınırlı tut; progress yazımlarını batch'le.

### R46-26 — Burn-in çift-başlatma yarışı (rapor 42 F-01'in teyidi — hâlâ açık)

- **Yer:** `src/main.js:14845` guard (`burninJob || burninStartPending`) vs `14881` (`burninStartPending = true` — iki `authorize*` await'inden SONRA). 14880'deki yorum "İlk await öncesi kilidi al" diyor ama kod öyle yapmıyor.
- **Plan:** `burninStartPending = true`'yu guard'ın hemen ardında, ilk await'ten önce set et; tüm preflight'ı try/finally ile koru. Ayrıca `burnin:cancel` preflight penceresinde yutuluyor (15003-15011 — pending'i de iptal kilidine kat).

### R46-27 — Burn-in tamamlanma toleransı ve replace-hatası kayıpları

- **Yer:** `src/burnin-output.js:81` (`actual >= max(expected*0.99, expected-1)` — VFR/stream-uzunluk farkı >1sn'de tamamlanmış çıktı "incomplete" → recovery her açılışta prompt, "baştan başlat" saatlerce yeniden encode), `src/main.js:14971-14982` (replace fırlatırsa `removeFileQuietly(tempPath)` + recovery temizlenir → saatlik işçilik kaybolur).
- **Plan:** Eşiği %97/`expected-5s`'ye gevşet ya da stream-duration probe'u; replace hatasında `tempPath`'i silme + recovery'yi koru.

### R46-28 — Reader modu "readability" aday seçimi ölü; her zaman `body` kopyalanıyor

- **Yer:** `src/browser-reader.js:50-65` — `querySelectorAll('article,[role="main"],main,body')` belge sırasında → `roots[0]` hep `<body>`; seçim koşulu `best.textLength >= native.textLength` body⊇article yüzünden hiç sağlanamaz → `candidate=body`; `ignored` kümesinde `nav/aside/footer/header/form` yok → okuma görünümü menü+footer'la dolar.
- **Plan:** `native`'i body-dışı ilk eşleşme yap; `copy()`'de NAV/ASIDE/FOOTER/HEADER/FORM budaması; `readerComparison.selected`'ı gerçek köke bağla.

### R46-29 — Medya seçimi: gizli çalan `<audio>`, çalan **görünür** videoyu geçiyor (B122 derinleşmesi)

- **Yer:** `src/browser-media-selection.js:13-16` — katman 6 (`playing&&audio&&audible`) katman 4'ü (`playing&&area>16`) geçer → ayrık-AV sitelerinde (`video.muted` + gizli audio) audio kazanır → pause/seek komutları ses öğesine gider, video oynamaya devam eder; overlay cue zamanı da audio saatinden okunur.
- **Plan:** Çalan görünür video (tier≥4) varken komut/overlay hedefinde videoya öncelik; ya da aynı kapsayıcı+yakın duration'lı AV çiftini "muxed pair" say.

### R46-30 — ASS video seçimi alan-bazlı; paylaşılan sıralamayla tutarsız

- **Yer:** `src/browser-ass-renderer.js:78-84` — doğru frame `rankCandidates` ile seçilir ama frame içindeki öğe yalnız `rect≥100×60 && visibility!=='hidden'` + en-büyük-alan → `opacity:0`/ekran-dışı/üstü-kapalı dekoratif video kazanabilir → JASSUB dekorun `currentTime`'ıyla sürer.
- **Plan:** `compareBrowserMediaCandidates`'ı kurulum scriptine serialize et (overlay'in 44-45'teki deseni).

### R46-31 — PDF tireli birleştirme sütun/paragraf sınırını bastırıyor

- **Yer:** `src/pdf-translate.js:257-263` — `startsNewParagraph = !hyphenated && (columnChanged || splitRow || ...)` → önceki satır `-`/U+00AD ile bitince TÜM kırılma koşulları atlanır → sütun-A sonu + sütun-B başı kaynaşır; gerçek bileşik tireler (`well-known`) satır sonundaysa tire silinip `wellknown` olur.
- **Plan:** `columnChanged`/`splitRow`'u hyphenated baskısından muaf tut; yalnız aynı-sütun devamında boşluksuz birleştir.

---

## P3 — koşullu kusurlar (seçme)

| # | Yer | Özet |
|---|---|---|
| R46-32 | `main.js:9910-9923` | `browserPermissionRequests` üst sınırsız → 'ask' sitede izin-spam DoS (Map+timer+renderer yağmuru). Aynı (origin,perm) pending'i reddet + sekme başına ≤8 sınırı. |
| R46-33 | `main.js:9721-9733` + `browser-drm.js:11-20` | `waitForProtectedPlayback` tüm amazon.* kapsıyor → Widevine readiness beklerken amazon.com ana sayfası bile 30 sn kilitlenir. Video yollarıyla sınırla. |
| R46-34 | `browser-navigation-policy.js:8` | `window.open('blob:…')` sessiz deny → sayfanın ürettiği PDF/görüntü popup'ları ölür. `blob:` için same-origin opener şartıyla izin; en azından notice. |
| R46-35 | `main.js:11921-11923` | Link-hints `executeJavaScript` ile MAIN dünyada (diğerleri izole dünya 999) → `__whisperLinkHints` sayfa tarafından bozulabilir. |
| R46-36 | `main.js:11905-11907` | `zoom-set` + geçersiz değer → else kolu → sessiz zoom-OUT (hata yerine). |
| R46-37 | `browser-page-find.js:24-28` | Find, `isSameDocument`/in-place gezinmelerde de oturumu öldürür → SPA pushState'i find barı kapatır. `isMainDocumentNavigation` eşdeğerini kullan. |
| R46-38 | `browser-page-find.js:29-35` + `main.js:9948-9953` | Ctrl+F çift işleniyor (kendi `before-input-event` + kısayol köprüsü) → `openBrowserFind` iki kez → iki find IPC. Tek yol seç. |
| R46-39 | `browser-workflow-recorder.js:177` + `renderer.js:5379` | Workflow adım timeout'u yok + abort signal execute'a bağlı değil → asla resolve etmeyen adım `playing`'i sonsuz kilitler. `Promise.race(execute, abort)` + adım timeout'u. |
| R46-40 | `browser-workflow-recorder.js:121-125` | Stale kayıt `EWORKFLOW_STALE` fırlatır ama `active` temizlenmez → `recording===true` kalır + her komutta sinyal. Stale'de otomatik iptal. |
| R46-41 | `browser-workflow-recorder.js:165` | Boş `mediaIdentity`'li workflow her medyada oynar → alakasız videoda yanlış ize fuzzy-match eylem. Kayıtta mediaId boşsa kısıtla. |
| R46-42 | `browser-command-palette.js:35` vs `renderer.js:20183` | Shift-izin listesi diverge: sayfa odaklı Ctrl+Shift+W/L/R/- ölü, UI odaklı çalışır; `'_'` non-shift listesinde ama Shift gerektirir → ölü girdi. Tek kaynak yap. |
| R46-43 | `browser-tab-history.js:10-43` | Kapatılan sekme yeniden açılınca `recoveryJobs/group/mangaPosition/readerPreferences/favicon/compatibilityMode/translationTrackId` düşer → "kaldığı yerden devam" kaybolur. `normalizeClosedBrowserTab`'a ekle. |
| R46-44 | `renderer.js:5136-5193` | Her `syncBrowserTabs`'te `gate.open` pin'leri eziyor: `browserTabSnapshot` `acquisitionId` içermiyor → `''` → acquisition kapısı fiilen kapalı; `operationId` bayat değere dönebilir; `mediaId` 5157'de snapshot ezebilir. `open`'ı merge semantiğine çevir + snapshot'a acquisitionId ekle. |
| R46-45 | `main.js:10592-10606` | Sekme yüklenirken `browserFrames` boş → capture kuyruğu `{pending:0, unverified:false}` → "temiz" sayılıp kapanış uyarısı atlanır. `unverified:true` döndür. |
| R46-46 | `browser-note-store.js:113-114` | rename sonrası `.bak` kopyası fırlatırsa bellek rollback yapar ama diskte yeni veri kalır → ayrışma. Backup yazımını ayrı try'de yut (yedek opsiyonel). |
| R46-47 | `main.js:13878` | `browser:research:review` `ensureIndexMediaForAnnotation`'ı atlıyor → media satırı yoksa not index-JOIN sorgularında görünmez. |
| R46-48 | `main.js:13857-13864` | `browser:research:upsert` `mediaUrl`'i `persistentBrowserMediaUrl`'den geçirmiyor → token'lı URL not kaydına/index'e sızar (toggle'da var, upsert'te yok). |
| R46-49 | `watch-index.js:24-33` | `safePageIndexUrl` query/hash'i siliyor → `?id=1` ile `?id=2` UNIQUE çakışması → içerik birbirini ezer; arama sonucu query'siz sayfaya gider. Places politikasıyla eşitle (sensitive/tracking temizle, gerisini koru). |
| R46-50 | `browser-translation-scheduler.js:433-455` | `onResult` istisnası başarılı çeviriyi hataya çevirip yeniden-istek + ikinci throw unhandled rejection. `onResult`'u try/catch'le izole et. |
| R46-51 | `subtitle-sentence-layout.js:101-105` | JSON-dizisi sezgisi meşru `[` başlangıçlı çevirileri reddediyor (`[3 gün sonra]` → 'JSON yanıtı okunamadı' → terminal). Parse başarısızsa metin kabul et. |
| R46-52 | `browser-terminology.js:75-82` + `main.js:4119` | Öğrenilen terim hedefi sanitasyonsuz system prompt'a giriyor (B107 kalıntısı) — saldırgan altyazı ≥2 tekrarla sözlük satırı üretir → sonraki tüm cümlelerin prompt'una sızar. Hedefi güvenilmez çerçevele + talimat kalıbı reddet. |
| R46-53 | `main.js:3068/3102/3092` | Canlı `capture-status` olayı ham `detail`/`activity.message`/`coverage[].streamKey` gönderir (export yolu sansürlü) → R46-15'teki sırlar tanı paneline/paylaşıma sızar. Ekleme anında redakte et. |
| R46-54 | `browser-feature-services.js:20-24` | Seri bağlamı `origin|mediaId` anahtarlı; `streamMediaId` hiç kullanılmıyor → sabit-URL oynatıcılarda farklı videolar aynı seri profilini paylaşır → yanlış synopsis/terimler prompt'a girer. |
| R46-55 | `browser-page-translate.js:739` + `main.js:12790` | `S<n>` id'leri taramaya değil konuma bağlı → eski cevaptaki `[S3]` yeni taramada başka elementi aydınlatır. Epoch bağla (`S3@e7`) veya reveal'da metin-hash doğrula. |
| R46-56 | `browser-series-context.js:159-164` | Terim eşleşmesi substring tabanlı → `'a'`/`'I'` gibi kısa terimler her cue'da tetiklenir → 100-sorun sınırı gerçek sorunları gömer. Kelime-sınırı eşleşmesi. |
| R46-57 | `browser-series-context.js:104-119` | `bindAndSave` paylaşılan profili koşulsuz ezer → boş form + mevcut ad → tüm bölümlerin profili silinir. Bağlıyken `save()`'a yönlendir/onayla. |
| R46-58 | `manifest-transactions.js:131-142` | Manifest başarısızlık bütçesi cooldown sonrası sıfırlanıyor → canlı playlist'te ~30sn aralıklarla sonsuz 3-deneme döngüsü (her döngü parse+fetch). Artan cooldown veya fingerprint-kalıcı damga. |
| R46-59 | `main.js:3928-3931,6700,6751` | Kalıcı iz/watch anahtarı `streamMediaId`'ye bağlı → CDN host/path rotasyonu yeni kimlik → önceki izler bulunamaz + watch-index'te mükerrer satır. Kalıcı izleri taban mediaId'ye bağla. |
| R46-60 | `main.js:1121-1127` + `renderer.js:449-456` | Watch hata döngüsü sınırsız — deneme sayacı/dead-letter yok → bozuk dosya her ~5dk'da tam transkripsiyon dener. `attempts` sayacı + N sonrası dead-letter. |
| R46-61 | `burnin-output.js:18-28` | mp4-uyumsuz ses codec'leri (wmv/ts/avi/3gp) `-c:a copy` ile muxer hatası; audio-only dosya `-map 0:v:0` "no streams" → deterministik hata döngüsü. Preflight'ta `ffprobe -select_streams v:0` + codec probe'u. |
| R46-62 | `model-manager.js:8-15` | `HF_HUB_CACHE` taranmıyor (yalnız deprecated `HUGGINGFACE_HUB_CACHE`/`HF_HOME`/TRANSFORMERS_CACHE) → o ortamda indirilen model "kurulu değil" görünür; disk-boyut ön kontrolü de yok. |
| R46-63 | `media-subtitle-tracks.js:28` | `streamIndex` fallback `subtitleIndex`'e düşer → `-map 0:<göreli>` global stream'i yanlış mapler → yanlış iz çıkarımı. `index` yoksa `extractable:false`. |
| R46-64 | `burnin-output.js:101-109` | `tasklist`/`ps` başarısızsa PID-reuse kabul → ffmpeg-olmayan süreç "çalışan gömme" → kurtarma 48s kilitli. İsim sorgusu başarısızken pencereyi kısalt. |
| R46-65 | `burnin-output.js:143-150` | Recovery yol eşleşmesi Windows'ta case-sensitive `path.resolve` → `C:`/`c:`/8.3 farkı → recovery görünmez, temp yetim. `sameLocalPath` kalıbı. |
| R46-66 | `main.js:8701-8706` | `__whisperCaptureInstalled` ön-tohumlamayla hook evasion'ı (sessiz): sayfa inline script'i flag'i set eder → hook hiç kurulmaz ama "kuruldu" sayılır → response-body yakalama ölür, teşhis düşmez. Canary/epoch doğrulaması ya da `Page.addScriptToEvaluateOnNewDocument`. |
| R46-67 | `pdf-translate.js:303-352` | Tekrarlı kenar-çizgisi süzgeci yalnız ≤3 sayfalık topluda görür → alternanslı üstbilgiler tutarsız sızar. İmzayı pdfHash başına biriktir. |
| R46-68 | `renderer.js:18629-18641` | "Tüm kitap" çıkarım döngüsü iptal/kapanış duyarsız → 800 sayfada kapatılsa bile `getTextContent` dakikalarca sürer. Döngüde `player.pdfReader===reader && !cancelled`. |
| R46-69 | `browser-dark-mode.js:15-18` + `main.js:6156` | Sabit 80ms export → eksik CSS; her gezinmede dark→light→dark flaşı + ~1.4MB darkreader.js yeniden derlenir. Kararlılık koşulu + origin-hash önbelleği. |
| R46-70 | `main.js:6148-6151` | Yükleme penceresinde eski sitenin koyu CSS'i yeni sayfada kalır (insertCSS kalıcı). `did-start-navigation`'da `darkModeCssKey`'i hemen kaldır. |

---

## P4 — sertleştirme / notlar (seçme)

- **R46-71** — `browser:discovery-signal` subframe'lere açık + preload DOM olaylarında `isTrusted` yok → iframe'den sentetik `cuechange` spam'i ~25/sn probe fırtınası (bounded). `isTrusted` + sekme-bazlı oran sınırlayıcı.
- **R46-72** — `saveBrowserContextImage` (`main.js:3574-3596`) `session.fetch`'te SSRF korumasız (private IP'ye gider) — kullanıcı jestli, marjinal. Aynı public-only denetimini uygula.
- **R46-73** — `browser-automation-rules.js:19-25` `operationKey` `\n`-birleştirme belirsizliği → `clean()` `\n` temizlemez → hash çakışmasıyla otomasyon bastırma. `JSON.stringify` dizisi.
- **R46-74** — `browser-automation-rules.js` `canceled`/`declined`/`gate.cancel`/`allowAgain` renderer'da hiç kullanılmıyor (ölü kontrat) + `started` kümesi sınırsız. Manuel "Durdur" `gate.cancel` çağırmıyor — doğru davranış `started` kalıntısıyla tesadüfi.
- **R46-75** — `browser-page-find.js:57-63` `refresh()` her mutasyonda `findNext:false` ile oturumu başa sarar → sürekli-mutasyon sayfalarında aktif eşleşme atlar; `hideBrowserView` find'i durdurmaz.
- **R46-76** — `renderer.js:20183+` modifier+harf düşüşü: browser workspace'te Ctrl+B/S/E/C yanlışlıkla yerel-oynatıcı kısayollarını tetikler (loop/kare/cue-edit/copy). `workspaceMode==='browser'` + modifier → mektup kısayollarına düşme.
- **R46-77** — `browser-event-envelope.js:11` (Math.trunc) vs `browser-tabs.js:24,43` (trunc yok) normalizasyon tutarsızlığı — `4.5`/`Infinity` uçlarında kapı dengesiz. Ortak normalize.
- **R46-78** — `main.js:8968-8969` iç timeout `ETIMEDOUT` kodu taşımıyor → çağıranların tanı notu düşer.
- **R46-79** — `main.js:4427` sayfa-çeviri apply zinciri `.catch(()=>null)` → gerçek script hatası `failures`'a düşmez, `completion.pending` şişer.
- **R46-80** — `renderer.js:12884,12895` `toggleWordSaved` fire-and-forget → `store.loadError`/`maxNotes` hatasında UI "çıkarıldı" der ama not durur (toggleCueSaved await'li — tutarsız).
- **R46-81** — Ölü ikizler: `browser-link-intent.js` (preload kendi kopyasını tutuyor — drift riski), `browser-site-zoom.js:5,22,28` üç fonksiyon (test-only), `URL_POLICY['browser-address']` (hiç çağrılmıyor), `browserDrmFailureMessage`/`redactConsoleUrls` (export ediliyor, kullanılmıyor), `watch-library-state.js`+`watch-library-view.js` (canlı yol `watch-library-store`'da ve merge'i daha zayıf), `pipeline-job.js terminateProcessTree` (main `process-lifecycle`'ı kullanıyor — drift).
- **R46-82** — `browser-cloudflare-compat.js:52-59` `compatibilityHosts` 100. kayıtta sessiz tahliye (site-profiles `reason:'limit'` dönerken burada bilgilendirme yok).
- **R46-83** — `browser-downloads.js:33+84` persist hata mesajı bir sonraki `done()`'da koşulsuz `message=''` ile silinir → tek olay ömrü görmez.
- **R46-84** — `browser-downloads.js:66-75` `item.*` getter'ları korumasız → kapanış yarışında uncaught riski.
- **R46-85** — `browser-session-package.js:62-70` `sanitizePlaces` `sitePermissions`/`siteTerminology` taşımıyor → paket içe aktarımında sessiz kayıp (kasıtlıysa belgele).
- **R46-86** — `media-controller.js`: tek-slot `adAudioSnapshot` → ikinci reklam-sessizleme ilk öğenin restore'unu kaybeder + geri yükleme yalnız seçili öğede; `skipAd` skip-düğmesi yoksa `currentTime=duration` (yanlış-pozitifte ana video sona sarar); `applyingRate` microtask-reset'le asenkron `ratechange`'ten önce ölür (ölü bayrak); `__whisperMediaController` MAIN-dünya globali (B70 sınıfı).
- **R46-87** — `browser-acquisition.js` `manual-track` basamağı hiç start/finish edilmiyor (ölü basamak); `42-F8` eş-sıralı olay iddiası: kayıp yok, sayaç amaçlı kabul — tür başına ~12.5/sn `capture-status` IPC maliyeti.
- **R46-88** — `browser-youtube-style.js:3` `youtube-nocookie.com` kapsam dışı (media-identity'de tanınıyor — tutarsız).
- **R46-89** — PDF küçük kusurlar: `paragraphsByPage.get(n)||page.blocks` ölü fallback (`[]` truthy); pdfHash yalnız ilk 1MiB+boyut (çakışma); `[]` sayfa `isPdfPageComplete=true`; `source` 12000'e sessiz kırpma; `pdf:translatePages` `request.model`'i yok sayar.
- **R46-90** — `browser-cosmetic-executor.js:16-31` URL bağlama yönlendirme zincirinde kozmetikleri toplu düşürür + 128 sınırında sessiz drop; `:33` kuyruğa alınan insertCSS anahtar döndürmez → remove istenirse sayfa ömrünce kalır.
- **R46-91** — `browser-overlay-controller.js:363-373` `fullscreenTransition` senkron throw'da geri alınmaz → toolbar sayfa ömrünce ölür (finally'ye al). `:255` 128 observer + derinlik-24 → >127 shadow root'ta video kaçar.
- **R46-92** — `browser-ass-renderer.js:104-107` `video.isConnected` için tüm-belge MutationObserver (mutasyon-yoğun sayfada sürekli çırpınma); `:90-92` `pagehide` yalnız `persisted=false`'da detach → bfcache'te bayat worker.
- **R46-93** — `browser-fonts.js` fontlar base64'le script gövdesine gömülü → 24MB font ≈ 32MB executeJavaScript string'i. `whisper-assets://` üzerinden servis et.
- **R46-94** — Yerel küçükler: `process-lifecycle.js:10` `_terminating` hiç temizlenmez; `pipeline-job.js:11` sinyalle ölen child'da tam timeout beklenir; `queue-persistence.js:16-21` `apisecret` gibi birleşik anahtarları kaçırır; `resource-soak.js` ölçüm tutarsızlıkları; `subtitle-word-sidecar.js:53-54` `film.en.srt`→`film.json` fallback'i başka videonun sidecar'ını bağlayabilir; `model-manager.js:53` `*-tiny` zayıf pozitif; `ytdlp-runtime.js:32-37` küçük-harf `pythonpath` çift-anahtar belirsizliği; `watch-folder.js:51-52` readdir hatası exact-kontrolleri atlar; `main.js:14122` probeCommand sınırsız stdout; `persistent-schema-inventory.js` envanter eksikleri.
- **R46-95** — `watch-index.js` transaction rollback semantiği `library:remove` için doğrulanmadı (tek yönlü atomiklik riski — spekülatif).
- **R46-96** — `preload.js` sendSync kapanış kanalları (`library:upsert-before-close`, `saveSettingsSync`, `saveQueueStateSync`) main yavaşlarsa renderer'ı bloklar (bilgi notu; flush timeout'u var).

## Düzeltme öncelik planı (öneri)

1. **Veri kaybı / kalıcı zehirlenme:** R46-01 (PDF ezme) → R46-18 (son cümle çevrilmez) → R46-19 (bayat yayın geri yazma) → R46-05 (yanlış mediaId persist) → R46-06 (arşiv zehirlenmesi) → R46-22 (tercih anahtarı) → R46-25 (kütüphane regresyonu).
2. **Güvenlik sınırı:** R46-03 (forgeable capture queue — boyut öncesi tahsis + fan-out sınırları + provenance) → R46-14 (tanı secret regex) → R46-15 (streamKey sansürü + disk sızıntısı) → R46-17 (gizli metin prompt) → R46-52 (terminology→prompt) → R46-66 (hook evasion canary).
3. **Yaşam döngüsü kilitleri:** R46-04 (capture_failed) → R46-07/08 (otomasyon geçidi) → R46-10 (indirme slotu) → R46-23/24 (watch kilitleri) → R46-26 (burnin yarışı) → R46-39/40 (workflow kilitleri).
4. **Kullanıcı-görünür işlev:** R46-02 (ASS fullscreen) → R46-09 (export çökmesi) → R46-11 (iframe tık) → R46-12 (DRM izni) → R46-20 (ASS okuma) → R46-21 (yt-dlp PYTHONPATH) → R46-28 (reader body) → R46-29/30 (yanlış medya hedefi).
5. **Sessiz DoS/kalite:** R46-32/33/34/36/37/38 → R46-58 (manifest retry) → R46-59 → R46-60.

## Doğrulanan sağlam alanlar (bu tur)

- `preload.js` köprüsü sabit kanal listesi; genel invoke/send geçişi yok; B80 unsubscribe kalıbı tüm wrapper'larda doğru.
- `authorizedBrowserSender` + `browserTabForWebContents` + `bridgeToken` rotasyonu tüm `browser:*` ve trusted-bridge kanallarında tutarlı.
- `fetchBrowserBuffer`: http/https + userinfo reddi + DNS-private reddi + ≤5 redirect'te yeniden doğrulama + boyut sınırları + cross-origin `credentials:'omit'`.
- `browser-network-capture` normalize alan whitelist'i (ceaSegment/dashTrack düşer).
- `browser-translation-cache.js`: corrupt→arşiv + .bak fallback + TTL/LRU + atomik flush.
- `subtitle-word-sidecar.js`: symlink/containment/boyut sınırları.
- Live-ASR IPC: sessionId/tabId/format/384k-char/288k-byte/8-chunk sınırları + sekme-kapanışı durdurması.
- `update_ytdlp.py`: HTTPS + sha256 pin + boyut sınırı + kilit + staging/rollback.
- `local-file-access.js`, `provider-api-keys.js`, `media:probeTracks/extractSubtitleTrack`, `pdf:open` grant akışları sağlam.
- `queue-persistence.js` terminal-latch ve secret sanitizasyonu.
- İzin deposu origin-keyed LRU + origin-eşleşme şartı; popup prefs sertleştirilmiş; `certificate-error` fail-closed.

## Test kapsam notları

- Tur bulguları statik doğrulamadır; çalıştırılmayanlar: R46-12 (cihazda EME probe), R46-02 (Electron fullscreen smoke), R46-95 (watch-index transaction).
- Önerilen regresyon testleri: `pdf-translate` (yeniden-çeviri ezmeme), `browser-subtitle-output`↔renderer parseAss marker simetrisi, `browser-subtitle-preferences` akış anahtarı, `browser-acquisition` capture_failed tetikleme, downloads interrupted-slot, watch queued-recovery, burnin lock/iptal.

---

## Ek: Bu turda kapatıldığı doğrulanan eski bulgular

- **B80** preload emitter sızıntısı — KAPALI (tüm wrapper'lar unsubscribe döndürüyor).
- **B101** izin iptali — BÜYÜK ÖLÇÜDE KAPALI (check handler her çağrıda güncel politikayı okur; çalışan Chromium oturumu semantiği kalıntı notu).
- **B110/B113/B124/B126** — not/arama kapanışları KAPALI (B126'nın ambiguous-timestamp edge'i P4 notu).
- **B108** stability 'waiting' askısı — KAPALI (maxWaitMs + retry re-arm).
- **B116** findNext tersliği — KAPALI.
- **B118** tr-TR lowercase — KAPALI.
- **B119** fitTranslationParts — KAPALI.
- **B125** workflow mediaIdentity — KAPALI (F41'in boş-kimlik edge'i kalıntı).
- **B114** NaN bypass — BÜYÜK ÖLÇÜDE KAPALI.
- **Scheduler erken-uyanan retry timer** — KAPALI.
