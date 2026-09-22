# BROWSER BUG REPORT 29 — Paralel derin denetim: kuyruk iptal kilidi, transcribe girdi kapısı regresyonu, watch-folder grant açığı

Tarih: 2026-09-15
Denetim tabanı: `d3ad6d5` (rapor 28'in düzeltmeleri dahil)
Yöntem: üç paralel salt-okunur alt ajan (renderer.js bakiye, main.js bakiye, backend) + üst ajan satır-seviyesi doğrulama + git tarihçesi ile regresyon kanıtı. Alt ajan bulguları rapora ancak üst ajan doğrulamasından geçtikten sonra alındı.

## Sonuç

Bu tur **üç P1** çıktı — ikisi canlı özellik kırılması, biri deterministik oturum kilidi:

| # | Önem | Bulgu | Durum |
|---|------|-------|-------|
| B17 | P1 | Kuyruk işi iptalinde `exit` olayı `queueItemId` filtresine takılıyor → `activeJobId` kalıcı takılı, tüm yeni işler bloklanıyor | DOĞRULANDI (satır zinciri) |
| B18 | P1 | `transcribe:start` girdi kapısı medya-uzantısı dışını koşulsuz reddediyor → JSON re-export, AI açıkla, yalnız-çeviri **ölü** (8b9a526 regresyonu) | DOĞRULANDI (satır + git bisect) |
| B19 | P1 | İzleme klasörü dosyaları medya grant'i almıyor → her yeni dosya auth hatası + 5 dk'da bir yinelenen kuyruk satırı | DOĞRULANDI (satır zinciri) |
| B20 | P2 | `importSettings` `watchDir`'i geri yüklemiyor; üç dinleyici `_applyingSettings` korumasını atlayıp yarım anlık görüntü yazıyor | DOĞRULANDI |
| B21 | P3 | `mainWindow.on('close')` async IIFE'sinde dış catch yok → tek throw = pencere kalıcı kapanamaz | DOĞRULANDI (yapısal) |
| B22 | P3 | `mergeCont` açıkken SRT cue düzenlemesi `cuesRaw`'ı bayat bırakıyor → kaydedilmiş düzenleme görünümde geri dönüyor; bul-değiştir eski metni yazıyor | DOĞRULANDI |
| B23 | P3 | `mergeCont` açıkken birleşmiş VTT cue'sunu düzenlemek dosyada içerik tekrarı yaratıyor; ASS'te yanıltıcı hata | DOĞRULANDI |
| B24 | P4 | `loadSelectedEmbeddedSubtitle` await sonrası medya/kuşak kontrolü yapmıyor → A'nın altyazısı B'ye bağlanabilir | DOĞRULANDI |
| B25 | P4 | Alt-önizleme `hoveredRef` null'lanınca takılıyor → blok çeviri yerine kaynak metin göstermeye devam ediyor | DOĞRULANDI |
| B26 | P4 | Spawn-hatası erken dönüşleri `job-*` temp dizini + job-log akışını sızdırıyor; başlangıç süpürmesi yok | DOĞRULANDI |
| B16 | P2 | (önceki tur, şimdi yazıldı) secret-store kısmi çözümü sonraki save'de çözülemeyen alanları kalıcı siliyor | DENEYSEL DOĞRULANDI |

---

## P1 — DOĞRULANMIŞ

### B17 — Kuyruk iptali `activeJobId`'yi kalıcı kilitliyor (oturum boyu) [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]

**Dosyalar:** `src/renderer/renderer.js:3728, 3733, 2952, 410-411` + `src/main.js:15075-15095, 15210-15219` + `src/renderer/queue-lifecycle.js:67-70`

**Zincir (her halkası satırda doğrulandı):**

1. `transcribe:cancel` (main.js:15214) `killActiveJob()`'u çağırıp süreç kapanmadan `{ok:true}` döndürür — `close` olayı her zaman sonraki tick'te.
2. Renderer iptal işleyicisi (renderer.js:2946-2957) başarılı iptalde `state.queueRunning=false`, öğe `pending`'e döner, **`state.currentQueueId = null`** (2952). `r.ok` dalında `finishRun` çağrılmaz; `state.running` ve `state.activeJobId` yerinde kalır.
3. Süreç sonra kapanır → main `exit` olayını `queueItemId: N` + `jobId: J` ile gönderir (main.js:15075-15095; `sendJobEvent` 14968 her olaya `jobId` ekler).
4. Renderer `onEvent` kapısının EN BAŞI (3728): `event.queueItemId != null && event.queueItemId !== state.currentQueueId` → `N !== null` → **return**. 3733'teki `activeJobId` temizliği ve 3936'daki `exit` case'i (running/currentQueueId/cancelled toparlaması) hiç çalışmaz.
5. `state.activeJobId = J` sonsuza kalır → `startTranscribeSafe` (410-411) sonraki HER başlatmada `{ok:false, 'Başka bir transkripsiyon işi hâlâ kapanıyor.'}` döndürür → tekil iş de kuyruk da başlatılamaz.

**Ek darbe:** `state.running=true` kalır → Başlat gizli/İptal görünür. İkinci İptal tıklaması `cancelTranscribe`'dan `{ok:false,'Çalışan iş yok.'}` alır → `finishRun(false)` düğmeleri iyileştirir ama `activeJobId` yine temizlenmez (2961 yalnız AI işleri için). Kuyruk yeniden başlatılırsa `processNextQueueItem` her öğeyi aynı hatayla `error` işaretleyip tüketir. Tek kurtuluş renderer yeniden yüklemesi (152).

**Sınır:** yalnız kuyruk işi iptali — tekil işte `queueItemId: null` filtreyi geçer, akış sağlıklı.

**Önerilen düzeltme:** 3728'deki filtreyi `exit` olayları için muaf tut (`event.type !== 'exit'` koşulu) VEYA iptal yolunda `activeJobId`'yi `currentQueueId` ile birlikte temizle. İlki daha güvenli: exit olayı jobId ile ikinci kapıdan da geçer.

**Regresyon testi:** kuyruk işi koşarken cancel → sahte `{type:'exit', queueItemId:N, jobId:J}` olayı enjekte et → `activeJobId===null` ve sonraki `startTranscribeSafe` başarılı olmalı.

---

### B18 — `transcribe:start` medya kapısı `.json`/`.srt` girdilerini reddediyor → üç özellik ölü (REGRESYON) [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]

**Dosyalar:** `src/main.js:14661-14665` + `src/local-file-access.js:64-70, 84-88` + `src/main.js:13079-13082` + `src/renderer/renderer.js:4265, 14516, 18814`

**Zincir:**

1. `transcribe:start` handler'ında `options.input` KOŞULSUZ `authorizeLocalMediaPath`'e giriyor (14661-14665) — `reexport`/`explain`/`translateOnly` dallanması yok.
2. `MediaFileAccess.inspect` (local-file-access.js:68) uzantı `MEDIA_EXTS` (mp4/mkv/.../wma — 13079) dışındaysa grant kontrolünden ÖNCE fırlatıyor.
3. Üç renderer iş akışı medya-dışı yolu `opts.input` olarak gönderiyor:
   - **JSON re-export** (4265): `selectFile('json')` → `opts.input = jsonPath` → `.json` reddedilir. Üstelik `dialog:openFile` (13075) yalnız `subtitleFileAccess.grant` veriyor.
   - **AI açıkla** (14516): `opts.input = player.subPath` (`.srt`/`.vtt`) → reddedilir.
   - **Yalnız-çeviri** (18814): `opts.input = sourcePath` (altyazı) → reddedilir.
4. Hepsi aynı yanıltıcı hatayı alır: `'Girdi dosyası bulunamadı veya okunamıyor.'` (dosya var, uzantı reddedildi).

**Regresyon kanıtı:** `git show 8b9a526` (2026-09-12, "harden browser subtitle capture and diagnostics") bu koşulsuz kontrolü ekledi; öncesinde `options.input` doğrudan kullanılıyordu. `reexport` ilk commit'ten (3880fbb), `explain` 2026-08-30'dan (5a9e4aa) beri var — yani sertleştirme var olan üç özelliği kırdı.

**Tutarsızlık bonusu:** aynı handler'da `options.syncSrt` (14760), `options.translateExisting` (14836), `options.explainTranslation` (14863) argv'ye **hiç yetkilendirilmeden** basılıyor — sınır `input`'ta sert, kardeş yol seçeneklerinde yok.

**Önerilen düzeltme:** `reexport`/`explain`/`translateOnly` bayraklıyken `options.input`'u `authorizeSubtitleFile`'a (veya `.json` için ayrı bir grant yoluna) yönlendir; `dialog:openFile`'a json için uygun grant ekle; `syncSrt`/`translateExisting`/`explainTranslation`'ı da subtitle-yetkilendirmesinden geçir.

**Regresyon testi:** `transcribe:start`'a `{input:'x.srt', translateOnly:true}` ve `{input:'x.json', reexport:true}` ile yetkili-grant sonrası `ok` beklenmeli; medya-olmayan yetkisiz yol hâlâ reddedilmeli.

---

### B19 — İzleme klasörü dosyaları grant'siz → sonsuz hata + yinelenen kuyruk satırı döngüsü [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]

**Dosyalar:** `src/main.js:986-1025 (scanWatchFolder), 1029+ (watch:start), 13180-13191 (dialog:openFolder)` + `src/renderer/renderer.js:1597-1609, 441-442` + `src/local-file-access.js:84-88`

**Zincir:**

1. `scanWatchFolder` medya dosyalarını bulup `watch:newFiles` ile gönderiyor (1024-1025) — watch yolunda **hiçbir yerde `mediaFileAccess.grant` yok**. `watch:start` ve `dialog:openFolder` da grant vermiyor (klasör yolunu döndürür, içeriğini yetkilendirmez).
2. Renderer `addToQueue('file', file, {watchSource:true})` + otomatik `startQueueBtn` (1606-1608).
3. Kuyruk işlenirken `transcribe:start` → `authorizeLocalMediaPath` → `inspect` geçer (medya uzantısı) ama `authorize` grants Map'te bulamaz → `'Bu medya dosyası kullanıcı tarafından seçilmedi.'` → yanıltıcı `'Girdi dosyası bulunamadı veya okunamıyor.'`.
4. Öğe `error` → `reportWatchQueueResult` → `retryAfter = +5 dk` → dosya yeniden hazır sayılır → **`addToQueue` dedupe'u (441) yalnız `pending`/`running` eşleştiriyor; `error` öğe eşleşmiyor → her 5 dakikada bir yeni yinelenen kuyruk satırı**, 500-öğe sınırına dek.

**Caveat:** daha önce `scanMediaFromPaths` (13128) veya `grantKnownMediaRecords` (13093) ile grant'lenmiş dosyalar çalışır — hata gerçekten yeni dosyalarda, yani izleme özelliğinin ana kullanımında.

**Önerilen düzeltme:** `scanWatchFolder`'da `ready` listesine girmeden önce her dosyaya `mediaFileAccess.grant(file)` (izleme klasörü seçimi kullanıcı rızasıdır) + `addToQueue` dedupe'una `error` durumunu da kat (veya `watch:report` hata sonrası öğeyi yeniden `pending`'e al).

**Regresyon testi:** sahte watch klasörü + yeni .mp4 → `watch:newFiles` → kuyruk işlemi `ok` dönmeli; hata durumunda aynı inputKey ikinci satır eklememeli.

---

## P2

### B20 — Ayar içe aktarma `watchDir`'i yutmuyor + korumasız `saveAppSettings` çağrıları yarım anlık görüntü yazıyor [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]

**Dosyalar:** `src/renderer/renderer.js:4204-4257 (import; state.watchDir ataması YOK), 1576-1584, 1589-1595, 2229-2261, 2142`

**(a)** `importSettings` `s.watchDir`'i `state.watchDir`'e hiç yazmıyor. Yedekte `watchEnabled:true` + oturumda `watchDir:null` ise `applyUiSettings`'in dispatch ettiği `change` 1577'deki korumaya takılır → checkbox geri alınır + klasör hem durumdan hem (sonraki kayıtlarda `watchDir:''` ile, 2142) dosyadan kalıcı kaybolur.

**(b)** `formats`/`langSuffix`/`watchEnabled` dinleyicileri `scheduleSave()` yerine doğrudan `saveAppSettings()` çağırıyor (1582, 1593) → `_applyingSettings` koruması (2259) atlanır → her apply/import sırasında 1-3 kez **yarım uygulanmış DOM anlık görüntüsü** `settings.json`'a yazılır (listenin sonundaki kontroller eski değerle). Normal kapanışta `beforeunload`'taki `saveSettingsSync` iyileştirir; renderer çökerse bozuk dosya kalır.

**Önerilen düzeltme:** import'ta `if (s.watchDir !== undefined) state.watchDir = s.watchDir || null`; üç dinleyicide `scheduleSave()` kullan (applyWatchState ayrı kalsın).

**Regresyon testi:** watchDir+watchEnabled'lı yedek → watchDir'siz oturumda import → klasör ve bayrak korunmalı; applyUiSettings sırasında `saveSettings` IPC'si 0 çağrı.

### B16 — (önceki turdandır, rapora burada giriliyor) secret-store kısmi çözümü kalıcı veri kaybı [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]

**Dosya:** `src/secret-store.js` (`saveFromSettings` → `load()` partial → `save()`)

Mock `safeStorage` deneyi (önceki tur): kasada `hfToken` + `llm.apiKey`; bir alan çözülemez hale gelince `load()` partial dönüyor; `saveFromSettings` yalnız çözülebilen alanlarla `next` kurup `save()` ile kasayı atomik yeniden yazıyor → çözülemeyen alanın şifreli blob'u **kalıcı siliniyor**. Geçici DPAPI kilitlenmesi bile anahtarı geri dönüşsüz yok eder; save kalan alanlar için başarı raporlar.

**Önerilen düzeltme:** `save()` yazmadan önce mevcut dosyadaki çözülemeyen (yeni sette olmayan) şifreli girdileri koru — veya `load()` partial'ken yazımı reddet.

**Regresyon testi:** mock safeStorage + bir alanı decrypt hatasına sok → save → kasada çözülemeyen girdi hâlâ durmalı.

---

## P3

### B21 — `mainWindow.on('close')` async IIFE'sinde dış catch yok → kalıcı kapanamaz durum [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]

**Dosya:** `src/main.js:10728-10786`

`event.preventDefault()` + `mainWindowClosing = true` + `void (async()=>{...})()` — gövdede korumasız adımlar: `backgroundBrowserCapturePending` await'i (10757, try dışında), `confirmBrowserCaptureDiscard` dialogu (10760 — indirme dialogu `.catch`'li iken bu sarılı değil; tutarsız sertleştirme), `flushBrowserSession()` (10771), `flushWatchLibraryBeforeClose()` (10773), `browserDownloads.cancelAll()` (10775), `destroyBrowserView()` (10776). Herhangi biri fırlatırsa `mainWindowClosing` true kalır → sonraki her `close` 10729'da engellenir → **pencere asla kapanmaz, `app.quit()` de iptal edilir**; tek çıkış task-kill.

**Önerilen düzeltme:** IIFE gövdesini try/catch'e (veya `.catch()`'e) sar; beklenmedik hatada `mainWindowClosing = false` yap veya `mainWindow.destroy()` ile zorla kapat.

**Regresyon testi:** `confirmBrowserCaptureDiscard`'ı reject edecek şekilde stub'la → close → ikinci close denemesi pencereyi kapatabilmeli.

### B22 — `mergeCont` + SRT düzenleme `cuesRaw`'ı bayat bırakıyor [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]

**Dosyalar:** `src/renderer/renderer.js:20770-20776, 20795, 13899-13929, 13938-13943, 16277`

`mergeCueContinuation` hiçbir bloğu birleştirmese bile `{...c}` klonları döndürüyor → mergeCont açıkken `cues[i] !== cuesRaw[i]` her zaman. 20770'teki koruma yalnız `cuesRaw.length !== cues.length` iken tetikleniyor; uzunluklar eşitse dosya doğru yazılır ama `cue.text = text` (20795) klonu günceller, `cuesRaw` eski kalır. Birleştirme kapatılınca (13942: `cues = cuesRaw`) kaydedilmiş düzenleme görünürde geri döner; bul-değiştir listesi eski metni gösterir; aynı cue değiştirme hedefiyse `change.after` eski metinden türetilip **dosyaya da yazılır** (16277 `cuesRaw || cues` kullanıyor).

**Önerilen düzeltme:** korumayı nesne-kimliğine genişlet (`cues[i] !== cuesRaw[i]`) VEYA yazma başarılıysa karşılık gelen `cuesRaw` girdisini de güncelle.

**Regresyon testi:** birleşme oluşmayan SRT + mergeCont açık → düzenle → merge kapat → yeni metin görünmeli.

### B23 — `mergeCont` + VTT düzenleme dosyada içerik tekrarı; ASS'te yanıltıcı hata [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]

**Dosyalar:** `src/renderer/renderer.js:20763-20768, 15492-15559, 13923-13924, 20750-20759`

VTT yolunda mergeCont koruması YOK. Birleşik cue ilk cue'nun `sourceStart`/`sourceEnd`/`subtitleSourceIndex`'ini taşır (13923-13924 yalnız `end`/`text` günceller) → `replaceTimedCueTexts` (15514-15525) birleşik metni yalnız ilk cue gövdesine yazar; 2..n. özgün cue'lar dosyada kalır → **altyazıda tekrarlanan içerik**. ASS'te `sourceEnd` tanımsız → birleşik `cue.end` ≠ ilk satır sonu → "ASS satırı bulunamadı" (güvenli ama yanıltıcı).

**Önerilen düzeltme:** VTT/ASS yollarına da SRT'deki mergeCont korumasının eşdeğerini ekle.

**Regresyon testi:** birleşen iki cue'lu VTT + mergeCont → birleşik satırı düzenle → dosyada tek cue gövdesi değişmeli; koruma mesajı görünmeli.

---

## P4

### B24 — `loadSelectedEmbeddedSubtitle` await sonrası kuşak kontrolü yapmıyor [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]

**Dosya:** `src/renderer/renderer.js:13793-13809`

`await extractSubtitleTrack` (13799) sonrası `addSubtitleOption` + `playerSubSelect.value` + `loadSubtitle` — hiçbir `staleGeneration`/`mediaKey`/`localPath` yeniden kontrolü yok. Çıkarma sürerken B videosu açılırsa A'nın altyazısı B'ye bağlanır (sonraki `saveCueEdit` yanlış dosyaya yazar). CLAUDE.md'deki belgelenmiş tehlike kalıbının eksik kaldığı tek yol.

**Önerilen düzeltme:** await öncesi `generation`/`mediaKey`/`localPath` yakala, sonrasında karşılaştır; bayatsa çıkarılan dosyayı at.

### B25 — Alt-önizleme `hoveredRef` null'lanınca takılıyor [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]

**Dosya:** `src/browser-page-translate.js:1034-1043, 1053-1056, 1094-1105, 1142-1149`

`showOriginal(ref)` `previewOriginal=true` + `restoreRef` yapıyor; `restoreView(ref)` yalnız `ref?.previewOriginal` ise geri yüklüyor. Alt keydown `showOriginal(state.hoveredRef)` — çalışır. Ama Alt basılıyken pointer elementten çıkarsa `pointermove`/`pointerout` → `hideTools()` → `state.hoveredRef = null` (1056) → keyup'ta `restoreView(null)` erken dönüyor → **`previewOriginal` sonsuza takılı**, blok sayfa çeviri görünümündeyken kaynak metin gösteriyor. Araç çubuğundaki 'original' düğmesi 2500 ms `previewTimer` ile kendini iyileştiriyor (1116-1117); Alt yolunda zamanlayıcı yok.

**Önerilen düzeltme:** `showOriginal` sırasında ref'i ayrı bir `state.altPreviewRef`'e yaz; keyup onu kullanıp temizlesin (veya keyup'ta `previewOriginal` taşıyan tüm ref'leri tara).

### B26 — Spawn-hatası erken dönüşleri `job-*` temp dizini + job-log akışını sızdırıyor [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]

**Dosya:** `src/main.js:14878-14931`

`activeJobTempDir` (14878) + `startJobLog` (14888) sonrası iki erken dönüş (spawn throw 14911-14921; eksik stdio 14924-14932) `fs.rmSync`'i ve `endJobLog()`'u atlıyor → dizin diskte, akış açık kalıyor; `activeJobTempDir` bir sonraki işte ezilince dizin yetim. Ayrıca `job-*` için başlangıç süpürmesi yok → çökme/force-kill ortasında kalan dizin (yüzlerce MB çıkarılmış WAV dahil) kalıcı.

**Önerilen düzeltme:** iki erken dönüşte `activeJobTempDir` sil + `endJobLog()`; `sweepStaleChatFiles` yanına `job-*` süpürmesi ekle.

---

## Alt ajanların ek düşük bulguları (satır-doğrulaması üst ajan bekliyor — "bildirildi" statüsünde)

**renderer.js:**
- Geç gelen SponsorBlock/bölüm güncellemesi `renderResolvedChapters`'ın koşulsuz `renderSeekMarkers` çağrısıyla aktif arama işaretlerini siliyor (15042-15068 vs `loadedmetadata`'daki `if (!q)` koruması ~19547).
- Tekil düzenleme undo'su `subtitleBulkFileStateStillMatches` doğrulaması olmadan tam dosya anlık görüntüsü yazıyor (20665-20689) — dış değişikliği uyarısız ezer.
- `loadSubtitlePos` kelepçesiz (14893-14901): localStorage'daki 999 gibi değer overlay'i ekran dışına taşıyor, UI'dan geri dönüş yok.
- Burn-in 'done' her durumda Explorer açıyor + ilerleme çubuğu gizlenmiyor; iptal "hata" gibi loglanıyor (4368-4385).
- `renderSeekMarkers` `Infinity` sürede işaretleri %0'a yığar (15024-15030).

**main.js:**
- `burnin:start` yalnız `existsSync` + uzantı denetliyor — diğer tüm yol-alan handler'lar grant zorunluluğu uygularken bu atlıyor; `stageBurninSubtitle`'ta boyut sınırı yok (14359-14374, 14214-14227).
- `media:waveform` ffmpeg'i timeoutsuz ve shutdown kill-set'inde yok (14083-14133) — kardeşlerinin hepsi timeout'lu.
- `burnin:cancel` preflight penceresinde (`burninStartPending`) düşüyor (14510-14518).
- `browser-alignment` subprocess'i timeoutsuz (browser-alignment.js:33-79).
- Feature-service wrapper'ları `terminateProcessTree` yerine `child.kill()` kullanıyor → torun süreçler yetim kalabilir (browser-video-analysis.js:18-19 vb.).
- `app:getEnvInfo` POSIX yol probelamıyor + `resolveFfTool` `.exe` sabit (13658, 13960).
- `pdf:export` atomik yazmıyor (13027).
- `app:getEnvInfo` `getGPUInfo('complete')` hiç çözülmezse sonsuza asılıyor.
- `second-instance` kapanış anında ölmekte olan pencereyi flaşlatıyor (~422-427).

## Sağlam doğrulanan alanlar (bu tur)

- `queue-lifecycle.js` terminal mandalı + `sendJobEvent` jobId zarflama; B17'deki TEK delik hariç olay kapıları tutarlı.
- `transcribe` NDJSON hattı: 32 MB satır sınırı, `stdoutLines.flush()`, sentetik terminal, stale-close korumaları, env-only secret'lar, 0o600 chat dosyası.
- Kapanış: `before-quit` akışı + `window-all-closed` kill-set'i kapsamlı (B21'deki throw-açığı hariç).
- `settings:export/import` transaction + journal; `subs:shift` authorize+encoding+atomic; `shell:openPath` uzantı beyaz listesi; `maintenance:updateYtdlp` timeout+tree-kill.
- Renderer medya kuşağı (`mediaKey`/`generation`/`staleGeneration`) hemen her asenkron yolda tutarlı — tek istisna B24.
- Burn-in: `ffSubtitlesArg` argv-quoting, recovery journal, atomic output swap, `settled` mandalı.

## Test ve kanıt durumu

- `npm test` tam paket bu tur başında **yeşil** geçti (231 JS test dosyası + backend; son satır "Tüm testler geçti").
- B17/B18/B19/B20/B22/B23: satır-seviyesi zincir doğrulaması; B18 ek olarak `git show 8b9a526` ile regresyon kanıtlı.
- B16: önceki turda mock-safeStorage deneyiyle doğrulandı.
- Backend alt ajanı bu rapor yazılırken hâlâ koşuyordu — bulguları gelirse rapor 30'a girer.

## Önerilen düzeltme sırası

1. **B18** — üç özellik ölü (re-export/explain/translate-only); koşullu grant yönlendirmesi küçük bir yama.
2. **B17** — tek tıkla oturum kilidi; iki satırlık filtre muafiyeti.
3. **B19** — izleme özelliği ana kullanımında kırık + kuyruk şişmesi.
4. **B20** — içe aktarma veri kaybı.
5. B21, B22, B23, B16 ardından; B24-B26 temizlik.

## Ayrıntılı bulgu, düzeltme, ret gerekçesi ve doğrulama dökümü — 2026-09-15

Bu bölüm özgün denetim metnini değiştirmeden güncel `master` kaynak ağacında yapılan yeniden doğrulamayı kaydeder. Bu rapordaki 11 numaralı bulgunun tamamı erişilebilir ürün yolu olarak doğrulandı ve düzeltildi.

| Bulgu | Nihai karar | Düzeltme ve doğrulama |
|---|---|---|
| B16 | Düzeltildi | Kısmi kasa yükünde yeni kayıt reddediliyor; mevcut kasa baytları korunuyor. Secret-store regresyonu tam pakette geçti. |
| B17 | Düzeltildi | İptal edilen etkin işin `exit` olayı kuyruk kimliği değişse de etkin `jobId` ile kabul edilip kilidi açıyor. |
| B18 | Düzeltildi | Re-export/yalnız çeviri girdileri altyazı, normal transkripsiyon girdileri medya consent kapısından geçiyor; explain alt iddiası yol değil metin olduğundan kapsam dışı bırakıldı. |
| B19 | Düzeltildi | İzleme klasöründen çıkan her medya exact-path grant alıyor; doğrulamada reddedilen watch girdisi `error` olarak raporlanıyor ve aynı satır yeniden kullanılabiliyor. |
| B20 | Düzeltildi | Ayar içe aktarma `watchDir`'i geri yüklüyor; watch ayar yazımları debounce/lineer akış kullanıyor. |
| B21 | Düzeltildi | Kapanış IIFE dış hata yakalayıcıyla `mainWindowClosing` durumunu geri açıyor; kalıcı kapanamama önlendi. |
| B22 | Düzeltildi | Birleşik SRT düzenlemesi ham cue kaynağını da güncelliyor; yeniden yüklemede eski metin dirilmiyor. |
| B23 | Düzeltildi | VTT birleşik düzenlemede içerik tekrarı önlendi; ASS için desteklenmeyen düzenleme açık hata veriyor. |
| B24 | Düzeltildi | Gömülü altyazı await sonrasında istek sıra, medya ve kuşak kimliği yeniden doğrulanıyor. |
| B25 | Düzeltildi | Hover önizleme referansı kaybolduğunda önceki görünüm geri yükleniyor. |
| B26 | Düzeltildi | Erken spawn hataları iş günlüğünü kapatıp yalnız sahip olunan iş geçici dizinini temizliyor; eski sahipsiz iş dizinleri sınırlı biçimde süpürülüyor. |

### Numarasız ek bulgular

- Bölüm güncellemesinin arama işaretlerini silmesi ve `Infinity` süre işaretleri düzeltildi; aktif `cueSearch` varken bölüm işaretleri çizilmiyor ve yalnız sonlu süre kabul ediliyor.
- Tekil/bulk undo dış dosya durumunu `subtitleBulkFileStateStillMatches` ile tekrar doğruluyor; rapordaki eski alt iddia güncel kodda zaten kapanmıştı.
- Altyazı konumu sonlu sayı ve yüzde aralığına kelepçelendi.
- Burn-in dosya erişimi B78 consent kapısıyla, altyazı boyutu `SubtitleFileAccess` sınırıyla korunuyor. Otomatik Explorer açılması ürün davranışı olduğundan güvenlik/veri hatası sayılmadı.
- Waveform işi tekilleştirildi, 60 saniye zaman aşımı ve process-tree kapatma eklendi; GPU bilgi sorgusu 10 saniyede kontrollü biçimde sonlanıyor.
- Browser alignment zaman aşımı, UTF-8 köprüsü ve process-tree kapatma ile düzeltildi.
- POSIX `ffmpeg` çözümleme iddiası Windows-hedefli ürünün erişilebilir hata yolu olmadığı için reddedildi. PDF atomik yazım ve ikinci-instance görsel flaş maddeleri bu raporda deterministik veri kaybı/çökme yolu göstermeyen iyileştirme önerileri olarak sınıflandırıldı.

### Çalıştırılan kanıt

- `npm test`: geçti; test koşucusunun son durumu `Tüm testler geçti`.
- Hedefli: `report-29-31-regressions`, `adversarial-ipc`, `player-ui`, `browser-subtitle-review`, `browser-video-analysis`, `browser-background-navigation` geçti.
- Python: `browser_align.py`, `browser_video_analysis.py`, `catalog_scan.py` ve `transcribe.py` sözdizimi geçti.
