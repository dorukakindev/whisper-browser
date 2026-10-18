# BROWSER_BUG_REPORT_451 — Çok derin bug taraması (yalnız denetim, kod değişikliği YOK)

**Tarih:** 2026-10-17
**Depo:** https://github.com/dorukakindev/whisper-browser
**Dalış dalı:** `codex/browser-whisper-progress-20261014`
**Başlangıç commit:** `6029a68479b4c079ea89c9f53c2549abac4e6bbc`
**Bitiş ürün-kodu commit:** aynı (`6029a684`) — **bu raporun üretimi hiçbir kaynak dosyayı değiştirmedi**; yalnız `docs/raporlar/`, `docs/devir/` ve kök `DEVIR-NOTU.md` güncellendi.

## Yöntem ve 50 görev kapsamı

| Görev grubu | Kapsam | Sonuç |
|---|---|---|
| G1-G6 Test koşumu | `npm test` tam paket (2×), `node --check` (main/preload/renderer/helpers/ui-locale), `py_compile transcribe.py`, backend saf-fonksiyon smoke (21 deneme) | ❌ 11 test dosyası başarısız; sözdizimi kontrolleri temiz |
| G7-G18 Backend | transcribe.py: time_offset, halüsinasyon, split/wrap/merge, çeviri önbelleği v5/v6, NDJSON,SECRET env, VRAM bırakma, reexport, write_* BOM, exception yolları, yt-dlp, argparse↔main.js, WhisperX aday sınıfları, normalize_timings, diarization | 2 doğrulandı, 12+ şüphe/uyum notu; 8 alan temiz |
| G19-G32 Electron main | 245 `ipcMain.handle` envanteri, transcribe arg eşleşmesi, spawn/env/iptal, burn-in kaçışlı yollar, atomik JSON, subs:shift, yt-dlp güncelleme, VRAM tespiti, pencere yönetimi, event/exit/pipe, export/import, webPreferences | 3 doğrulanmış bulgu, 4 şüphe; 12 alan temiz |
| G33-G42 Preload+Renderer | 266 preload API ↔ handler eşleşmesi, onEvent switch (17 tip), buildOptsFromUI, 157 persist kontrol, queue dondurma+çift-tetik koruması, scheduleSave yarışı, EN/TR 2.876 girdi, id eşleşme (1.300+), 44 range, XSS, listener sızıntısı | 3 doğrulanmış bulgu, 2 mimari not; 11 alan temiz |
| G43-G50 Güvenlik+Uyum | SECRET sızıntısı yüzeyleri, path traversal, CORS/CSP, 6 .bat akışı, package.json, test envanteri (470 node+66 py), INDEX.md, CI (ci.yml), son 40 commit churn, runner yardımcıları, `.gitignore`/untracked, eski upstream referansı | CSP gevşekliği + test boşluğu doğrulandı; secrets zinciri temiz |
| Ekstra katman | browser-* modülleri (subtitles, çeviri zinciri, overlay/media, page-translate, pdf, asset/session/manifest, sponsorblock, sentence/pair kalite, burnin/dub, queue-persistence, watch-library) | 50 bulgu (1 yüksek-kıyı, 6 orta, kalan düşük) |

Tarama araçları: 5 paralel salt-okunur derin analiz ajanı + ana oturumda kendi koşum/kanıt komutları. Her bulguya kanıt-seviyesi etiketi verildi: **[TEYİT]** = ana oturumda komut/dosya kanıtıyla doğrulandı, **[DOKUNULMAMIŞ/ŞÜPHE]** = statik analizle bakıldı, metalangs zaman yoluyla doğrulanmamış.

---

## A. Test paketi koşumu — 11 başarısız dosya (KESİN)

`node tests/run-all.js` iki kez ayrı koşuldu; **11 test dosyası** exit≠0 ile sonuçlandı. Not: YENI-BILGISAYAR.md'deki önceden kabul edilmiş 5 ortam engeli (browser-stream-fixtures, test_export_anki, test_ffmpeg_integration, test_transcribe, test_ytdlp_update) bu koşumda **hepsi geçti** — yani 11 başarısızın tamamı eski engel listesinin dışında:

| # | Test dosyası | Mesaj (ilk hata) | Sınıf |
|---|---|---|---|
| 1 | `tests/audit-tur4.test.js` | `ReferenceError: dubService is not defined` (vm-slice stub'ı kapsam dışı) | Test kırılganlığı |
| 2 | `tests/browser-create-translate-default.test.js` | `ReferenceError: translationEndpointReady is not defined` | Test kırılganlığı |
| 3 | `tests/browser-youtube-whisper.test.js` | aynı (translationEndpointReady) | Test kırılganlığı |
| 4 | `tests/validation.test.js` | `FAIL anahtarsiz ceviri/LLM/diarization yakalanir — translationEndpointReady is not defined` | Test kırılganlığı |
| 5 | `tests/browser-store-deadzone.test.js` | `evalmachine.<anonymous>:202: ipcMain.on('browser:youtube-guard:policy'...` ReferenceError — slice sınırına ipcMain stub verilmemiş | Test kırılganlığı |
| 6 | `tests/misc-exports-deadzone.test.js` | `Error: spawn true ENOENT` — `spawn('true')`/`sleep` **POSIX-only komut**; Windows'ta her koşumda patlar (ci windows-bacağı da risk altında) | Windows taşınabilirlik |
| 7 | `tests/ci-determinism-ratchet.test.js` | `AssertionError: uyku-bekleme sayısı 22 > baseline 21` | Ratchet baseline bayat |
| 8 | `tests/coverage-map.test.js` | `AssertionError: yeni kapsamsız modül(ler): backend/translation_auth.py` (test referansı ekle) | Kapsam boşluğu |
| 9 | `tests/unicode-paths.test.js` | `AssertionError: Missing expected exception: \\?\ reddi` — `local-file-access` `\\?\` red davranışı **değişmiş**; regresyon olasılığı | Davranış regresyonu |
| 10 | `tests/report73-player-ab-search.test.js` | `FAIL R73-06: zoom-set NaN fallback'i artık zoom hesaplamıyor` (geçersiz değerde erken dönüş) | Davranış regresyonu/tutarlık |
| 11 | `tests/ipc-parity.test.js` | `AssertionError: dinleyicisiz send kanalları: ['browser:youtube-guard:policy-changed']` | **Gerçek ürün bug'ı (A-1)** |

renderer.js'te `translationEndpointReady` gerçekten tanımlı (satır 32678) ve üretimde sorun yok; slice-tabanlı testler jenerik-iscilik (renderer-refactor sonrası kayma) — düzenlemek ürün riskini değil test-yolunu ilgilendiriyor. `\\?\` ve zoom-set R73-06 satırlarının **gerçek** davranış değişikliği olma olasılığı ayrıca A-9/A-10 kotasıyla raporlandı.

Not: `gh` CLI kurulu değil; bu durumun origin CI'ında (ci.yml ubuntu-latest + windows-latest her ikisinde de `npm test`) ne kırmızı gösterdiğini buradan saptadık. Lakin `misc-exports-deadzone` bulunması windows-bacağında kesin patlayacaktır.

---

## B. Doğrulanan gerçek ürün bulguları [TEYİT]

### B-1 [ORTA-YÜKSEK] `browser:youtube-guard:policy-changed` olayı UI'ya hiç ulaşmıyor
- src/main.js:3978 — `wc.send('browser:youtube-guard:policy-changed', ...)` (main-side tek nokta).
- preload.js / renderer/*.js / tests/için **hiçbir dinleyici yok** (grep 0 eşleşme).
- Etki: YouTube koruma politikası değişikliği canlı olarak UI'ya yayılmaz; sekme/UI eski politikayla çalışmaya devam eder.
- Kanıt: `ipc-parity.test.js` de aynı gerçeği yakalayıp fail ediyor (#11).
- Tekrar: main'i başlat; youtube-guard politikası değiştiren olay → DOM'da görünmez.

### B-2 [ORTA] Boş sayısal gösterge alanları `--temperature NaN` argparse patlabına döndürüyor (11 alan)
- src/renderer/renderer.js:290, 292-301 — `parseFloat($('...').value)` boş alan = NaN (Truthiness falsy ama JSON'a `NaN` string yazılır).
- src/main.js:20953-20967 — `temperature`, `lengthPenalty`, `repetitionPenalty`, `noRepeatNgramSize`, `compressionRatioThreshold`, `logProbThreshold`, `noSpeechThreshold`, `vadMinSpeechMs`, `vadMinSilenceMs`, `vadMaxSpeechS` için `!== undefined` kalan güzel/karmaşık guard — `NaN`'ı geçirir.
- Etki: iş Python'a ulaşmadan `argparse error: invalid float value: 'NaN'` (sys.exit(2)); NDJSON emissiz; renderer ham argparse metni gösterir ve "iş başlamadan kırıldı" izlenimi.
- Tekrar: Ayarlar → boş "temperature" kutusu + çalıştır.

### B-3 [ORTA] `write_vtt` katı doğrulamasız geçersiz cue yazıyor (SRT sanıtıyla tutarsız)
- backend/transcribe.py — `write_srt`→`serialize_srt_strict` RuntimeError fırlatır; `write_vtt` aynı girdiyle **sessizce ters cue yazıyor**.
- Kanıt el testi: `write_vtt([(10.0, 2.0, "t")])` → `_v3.vtt` içerik: `00:00:10.000 --> 00:00:02.000` — **ters sayaç** ve SRT'de aynı girdi `RuntimeError('Katı SRT doğrulaması başarısız: cue zamanı geçersiz.')`.
- Etki: altyazı dosyası oynatıcıda siraltan geri güler; kullanıcı hata görmez.

### B-4 [ORTA] Negatif zamanlı cue SRT ve VTT'de `00:00:00,000 --> 00:00:00,000` olarak panoramlanıyor (0-süreli boş cue)
- backend/transcribe.py formatlama: `(-5.0, -1.0)` → `00:00:00,000 --> 00:00:00,000` (SRT ve VTT aynı davranış).
- Etki: video başında kaydırılmış/shift edilmiş içerik bütünüyle 0'a yanıtlama yapılır; içerik kaybı + bazı doğrulayıcılarda geçersiz 0-süreli cue.
- Kanıt: `_t2.srt`, `_v2.vtt` el testi dosyaları aynı sonucu veriryor.

### B-5 [DÜŞÜK/şüphe] ≥24 saatte saat alanı 3 haneye taşıyor (`25:00:00,000`)
- backend/transcribe.py SRT ve VTT de: `_t1.srt` / `_v1.vtt` el testi üçten alakali `25:00:00,000` — SRT/VTT specs bir çok oynatıcıda (eski TV/WMP) 2 hane saat bekliyor. 4+ saatli kırpılmış çözümlerde geçici.

### B-6 [ORTA] KPS=0 (CPS kapatma) UI'dan ulaşılmaz
- src/main.js:20912 — `if (options.maxCps)` — 0 falsy → arg gönderilmazor.
- backend/transcribe.py:9993 — `--max-cps default=20.0` → endpoint fallback 20 devreye girer.
- Etki: kullanıcı "0 = CPS kapalı" içi; arka planda 20 CPS uygular; ayrıca backend'de "0 = kapat" semantiği var (3496-3497, 6533) — UI'daki gösterme belirsiz.
- Tekrar: AA panelde KPS sliderını 0'a çek → spawn line'da `--max-cps` yok.

### B-7 [ORTA] `npm test` 11 dosya; CI toplum-açakan özet üstte §A.

### B-8 [DÜŞÜK-ORTA] YouTube cihaz-kodu OAuth progress logları renderer'da hiç görünmüyor
- src/main.js:2370, 2451 — `mainWindow.webContents.send('youtube:event', ev)` (yalnız `type==='log'`).
- src/preload.js:129-133 — `onYoutubeEvent` API **tanımlı ama renderer'da hiç abonelik yok** (renderer.js / helpers içinde 0 referans).
- Etki: YouTube cihaz-kodu yetkilendirme akışındaki ilerleme logları renderer penceresinde görünmez; kullanıcı "neden hiçbir şey olmuyor" bilinmezliğinde kalır. (Fonksiyonel akış `youtube:poll` resolve'una bağlı; sadece log kaybı.)

### B-9 [DÜŞÜK-ORTA] Altyazı slider etiketleri güncellenmiyor (`subBgOpacityVal`, `subOutlineVal`)
- src/renderer/index.html — `<span class="value" id="subBgOpacityVal">45</span>%`, `id="subOutlineVal">70</span>%`.
- src/renderer/renderer.js:20484-20486 — `bind('subBgOpacity', 'bg', …)` değeri stil keser ama etikete hiç yazmaz; `ranges[]` dizisinde (renderer.js:2166-2195) de yok.
- Tekrar: Ayarlar → Altyazı görünümü → "Arka plan saydamlığı" veya "Kontur/gölge" sliderı cek → değer değişir, etiket (45%/70%) donuk.

---

## C. Yüksek/orta şiddetteki diğer bulgular [statik analizle; kendi koşumumda teyit bekliyor]

### C-1 [ORTA-YÜKSEK/şüphe] Kuyruk snapshot seçici yalın `token`/`jwt`/`auth` anahtarlarını yakalamıyor
- src/queue-persistence.js:18-22 — `SECRET_OPTION_KEYS` sabit listesi + regex listesi: `api[_-]?key|access[_-]?token|secret|password|authorization|credential|cookie`... — **yalın `token`, `jwt`, `bearer`, `auth`, `key` yumuşak farklar** (regex'ler CamelCase variaıların yakalamıyor).
- Kanıt zinciri: kuyruk öğesine `{ opts: { token: 'sk-…' } }` girildiğinde clean kuykutus `clonePublicOptions`'ın çıktısında aynen kalan ham metin diske yazılır (`userData/queue`). (Ana oturumda koşumla teyit MANUEL beklemeden yazıldı; kendi objemizde bir koşula gömecek bir fonksiyon bulunması gerekiyor.)
- Şiddet gerekçe: kuyruk snapshot'ı diske (userData/queue) düz metin olarak yazılıyor; sır sızıntı zincirinin en hızlı kapanması gereken halka.

### C-2 [ORTA] Canlı altyazı zincirinde in-place mutasyon + WeakMap önek-önbelleği staleness çifti
- src/browser-subtitles.js:153-157 — dedupe, girdi dizisinden gelen cue nesnesini **yerinde** mut eder (`previous.end = Math.max(...)`, kopya değil).
- src/browser-subtitles.js:1126-1138 — `browserActiveCuesAt` WeakMap önbellek, güç işareti `canExtend` koşulu **yalnız kuyruk cue'suna** bakıyor: aynı string referansla orta-cüille `end` büyütülürse — index uzunluğu aynı olsun — bat dokulku önedeki dizide bayat önek kullanılır → aktif cuerr altyanmış göründü.
- (Ana oturumda denetlendi: main.js:9977 `storeBrowserTrack` her `set`'e yeni dizi refismony — cache pratikte çoğu yolda yeniden kurulur; fakat bulgu 3 üzerinden gelen aynı-referans mutasyonu patlar. Şüpheli kalan çift-zincir rettabl.)
- Kanıt: `normalizeCues(X)`/`mergeBrowserStreamCues(prev, inc)` x-ray sıramasından sonra X[...] objede `end` değişimi.

### C-3 [ORTA] `browser-asset-store` ile `browser-subtitles` normalize davranışı çelişiyor
- src/browser-asset-store.js:normalizeCues — `end < start` cue'ları **düşürür**; browser-subtitles aynı durumu `end=start` **onarır**.
- Etki: end<start tek-cuerek canlı akışlarında asset boşalır; oynatıcıda taşma.

### C-4 [ORTA] `browser-media-controller` — 128 shadow-DOM kökü sınırından sonra **sessiz beyaz-liste**
- src/browser-media-controller.js:225-256 — `observeRoot` 128 stub sınırında yeni kökleri not etmeden reddeder; eviction yok; 129. köktedeki video hiç göremez.
- Etki: uzun oturumda yeni açılan video kökünde altyazı/medya denetimi çalışmaz; kullanıcıya hata mesajı ya da başka bir sinyal yok.

### C-5 [ORTA] `watch-library-store` tombstone sınır işlenmiş şişmesi
- src/watch-library-store.js:594 — tombstone silinmey tam item'ı gömüyor; 2000 tombstone × item byte sayma sınırı yok → dosya yüz MB'a kadar şişebilir.

### C-6 [ORTA] `uncaughtException` handler yok
- src/main.js:986-993 — yalnız `unhandledRejection`; src/ ağacında uncaughtException listener 0.
- Etki: Electron main'nde yakalanmayan senkron istisna süreci çökertir; koşanova trans/burnin Python spawn esli frekans çöküşe düşer; recovery `externalRunning` PID eşlemsiyle toparlayıcı ama renderer'un loop sıçraması çöker.

### C-7 [ORTA-şüphe] `--reexport` + `--translate` seçilince çeviri **sessizce atlanır**
- src/main.js:21003 — `--translate` flag'si her durumda gönderilir; backend/transcribe.py:10213-10216 — `elif args.reexport: reexport_from_json(args)` (reexport bütünü transcribe()'ı BUYURUZ); `reexport_from_json` hiç `llm_translate` çağırmaz.
- Etki: UI'da "Yeniden dışa aktar + Çeviri" seçilirse kaynak JSON'dan dosyalar yeniden yazılır ama çeviri dosyaları hiç oluşmaz, kullanıcı "çevirmen bekleniyor" hissi alır.

### C-8 [ORTA-şüphe] Bir segmentte yakalanmayan hata **tüm işi düşürüyor**
- backend/transcribe.py:7351-7462 — segment döngüsünde segment-düzeyi `try/except` yok; `clean_text`/cue_confidence/bölme içinde raise → transcribe() exception → main(): 10230-10238 `emit("error")` + ` sys.exit(1)`.
- Etki: 4 saatlik işin sonunda dahil olan tek bozuk segment bütün çıktıyı kaybediyor; kısmi preview/help yazılmışsa kaydediliyor.

### C-9 [ORTA] index.html CSP `connect-src 'self' https:` çok geniş
- src/renderer/index.html:5 — UI penceresinin kendi başına AGENTS.md'de “Renderer'da dış kaynağa erişim yok” hedefyle sayfas dörder; nazakat `connect-src https:` duruma-BRI matında her `https` sunucusuna fetch+connect izni verir.
- (Dizinin içinde "ui çalışırken bu trafiği kullanan yer görmedim; gelecekte kullanıma açık kapı" değerlendirmesi yapıldı. Kod incelemesinde günlük kullanım akışı dış bağlantı kurmuyor.)

### C-10 [ORTA] `tests/test_dub_timing.py` ve `tests/test_browser_align_validation444.py` **`npm test` dışında**
- tests/run-all.js:39-41 — Python keşfi yalnız `backend/test_*.py`; tests/ kökündeki bu 2 Python testi hiç koşmuyor.
- Etki: dub timing ve browser-align validation444 senaryoları regression-darbesi olmuyor.

### C-11 [DÜŞÜK] raporlama-notu: C-9'un testteki aynası
- `tests/report89-audit-regressions.test.js` ve UI-audit araçları CSP'yi yalnız `script-src` düzeyinde soyutlar; `connect-src https:` genişliği herhangi bir denetim testinde yakalanmıyor — idari kural (AGENTS) ile kod-guard arasındaki bağ yalnız insan incelemesine kalıyor.
### C-12 [DÜŞÜK-ORTA] `queue-lifecycle.js` formal sözleşme fonksiyonları (`beginQueueRun`/`applyQueueRunEvent`/`assertQueueInvariants`) renderer'da kablolı değil
- src/renderer/queue-lifecycle.js:57-150; src/renderer/renderer.js:6-11 — yalnız 4 fonksiyon import ediliyor; kalan iş-yaşam döngüsü onEvent switch'te el yazımı.
- Etki: bug değil; inşaat riski — zamanla iki mimari katın ayrışması ve inceleme zorlaşması mümkün. Devir notunda taşınacak.

### C-13 [DÜŞÜK] Repo hijyeni — ignore-edilmemiş kök dosyaları
- Untracked kök riskli dosyalar: `_repro/` (içinde `hf_`/`sk-` placeholder sırlar), `files.zip`, `files (1).zip`, `files (9).zip`, `PROGRAM_BUG_REPORT_83/84/85.md`, `hazir-imaj-yayin.py`, `Whisper Browser.exe`, `_commit_msg.txt`, `tests/r92-deep/`, `.freebuff/`, `.playwright-mcp/`, `Browser ve çevirmen uygulaması tasarım ve hata düzeltmeleri.md` — tamamı `.gitignore` kapsam DIŞI; `git add .` sırasında yanlışlıkla commit edilebilir. AGENTS kuralı: raporlar `docs/raporlar/` altında olmalı.
- Ayrıca kökte 32 adet `BROWSER_BUG_REPORT*` öksüz dosya + `docs/BROWSER_BUG_REPORT_{29,70}.md` yanlış klasörde duruyor.

### C-14 [DÜŞÜK] INDEX.md çift satırları
- docs/raporlar/INDEX.md — 13 duplikat satır: 106, 107, 108, 241, 385-393 (her biri 2×). Görsel/cosmetic.

### C-15 [DÜŞÜK] `.github/workflows/ci.yml` `node node_modules/electron/install.js --no` şüpheli bayrak
- ~(satır 54 civarı) — castlabs install.js'in `--no` argı kabul mu? Belgesiz param yolu; postinstall bağımlılık ihtiyacı da ayrı برنامج.

---

## D. Şüpheli / bilgi niteliğinde finderlar (ayrı makeda)

Backend — from statik tarama boluwkalık belki:
- D-1 \[şüphe\] normalize_timings sıfır-gap çiftinde çakışma tekrar üretilebilir (transcribe.py:6550-6551). Ana oturumda 3 farklı girdi ile **üretilmemiş** (merge path kapatıyor) → kayıt düzeyi.
- D-2 \[şüphe\] `translate_cache_key` `"v": 6` (transcribe.py:3527) vs AGENTS.md “v5” doc drift; ayrı alanlar: `translate_lenient` anahtarda yok (B12), `base_url+model` aynı ama farklı token/alternate endpointler ayırt sözleşmesi yok (B14).
- D-3 \[şüphe\] job log argv toplanmasını disk'e yazar (main.js:21089) — argv'de sır yok ama gelecekte `--hf-token` İruz kue ekSIDEgirse sızar; wrap the (strip secrets) up.ای kayıt.
- D-4 \[şüphe\] `ffprobe.exe` sabiti sadece Windows (transcribe.py:416) — Ubuntu'da köşe boyut kontroi sessizce atla.
- D-5 \[şüphe\] yt-dlp progress hook `downloaded_bytes=None` kaçışı (transcribe.py:356-362).
- D-6 \[şüphe\] WhisperX `language_probability=1.0` hard-code (transcribe.py:5557) → zayıf-dil uyarısı hiç tetiklenmez (7337 threshold'u).
- D-7 \[şüphe\] `split_segment_sentence` tüm-word `None` time durumunda `_flush_chunk` None döner → chunk düşer, metin kaybı sinyalsiz (transcribe.py:831-832 + 1613-1623).
- D-8 \[doğru yapı\] time_offset kelime/diarization/resume/snap-to-speech dahil güncel tüm zeminlerde uygulanıyor (7411/855/2670/7151/1144) — **temiz**.
- D-9 \[temiz\] SECRET env sözleşmesi: WHISPER_HF_TOKEN/WHISPER_LLM_API_KEY env adları main.js 20977-20989 + settings-security.js:912-914 ↔ transcribe.py:10190-10202 birebir; `os.environ.pop` ile alt sürece miri kesiliyor.
- D-10 \[temiz\] NDJSON zinciri: `sys.stdout.reconfigure(utf-8, errors="replace")` + `json_dumps_finite` (allow_nan=False, ensure_ascii=False) + `flush=True` — Windows cp1254/GBK encode dayanıklı; only `print` kullanımı 1 nokta.
- D-11 \[temiz\] modeldel + empty_cache diarization öncesi garanti (7489-7495, WhisperX finally 5531-5555; diarization 2587-2594).
- D-12 \[temiz\] write_srt/ass utf-8-sig BOM, VTT BOM'suz, JSON bilinçli BOM'suz — AGENTS uyumlu.
- D-13 \[temiz\] pyannote yok/token yok iş devam eder (2520-2536 + 7639-7658 ← fail-open).
- D-14 \[temiz\] transcribe argparse set ↔ main.js gönderme seti (spot-check): `--engine`, `--compute-type`, `--translate-*`, `--sync-*`, `--dedupe-cues`, `--explain-*` birebir; deprecated `--smart-split` gönderilmiyor. Main'in gönderdiği ama argparse'ta olmayan arg **saptanmadı**; tersi — backend'de var, main hiç göndermeyen 9 arg: `--snap-max-shift`, `--min-duration`, `--max-duration`, `--min-gap`, `--dual-translation-first`, `--confidence-threshold`, `--drop-trailing-hallucination`, `--collapse-min-words`, `--smart-split` (yalnız backend varsayılanı çalışır; UI karşılığı yoksa zararsız, "üç yerde senkron" sözleşmesiyle çelişen kırık köprü kaydı).

Electron main/statik bulgular:
- D-15 \[şüphe\] reading-list `file://` sekme yüklemesi — arşiv import şema doğrulaması kanıt bekliyor (main.js:17416-17418, 16501).
- D-16 \[şüphe\] `subs:shift` silinmelerin sonrası SRT blok indeksleri yeniden numaralanmıyor (main.js:20175-20187).
- D-17 \[şüphe\] çok-GPU'da VRAM parse ilk satır (main.js:19074-19077).
- D-18 \[şüphe\] venv yoksa sistem Python'a düşüş — CUDA DLL eksik → hata çöküşe döner (main.js:20705-20727).
- D-19 \[temiz\] burnin yol kaçışı: `ffSubtitlesArg` + ASCII tmp altyazı stage yolu — Türkçe/emoji/tırnak riskidir kapalı; kısmi çıktı kurtarma sistemi var.
- D-20 \[temiz\] settings/window-state atomiklik: `writeJsonAtomic` + `.corrupt-*` arşivleme + secrets safeStorage düşmez.
- D-21 \[temiz\] spawn/cancel: flag dosyası once + `terminateProcessTree` (taskkill /T /F + 5 sn fallback) + ownership releaseandid; sentinel `jobStarting`/`jobCancelSeq` yarış koruması; tek terminal latch.
- D-22 \[temiz\] settings:export/import secrets:excluded: true; import şema doğrulaması + transaction.
- D-23 \[temiz\] `TODO/FIXME/XXX` grep: 0 eşleşme.
- D-24 \[temiz\] window-state pozisyon kasıtlı saklanmıyor (window-state.js:38-46) — AGENTS uyumlu.
- D-25 \[temiz\] start.bat/drm-kur/install-* .bat hareketleri: errorlevel kontrolleri tam, chcp 65001, tırnaklama doğru.
- D-26 \[temiz\] CI matrix ubuntu+windows var ve `npm test` koşuyor (ci.yml:22,28,59).

Renderer/preload statik bulgular:
- D-27 \[şüphe\] `llmModel: … || 'deepseek-v4-flash'` builtin informal; stale olabilir (renderer.js:347).
- D-28 \[temiz\] preload 266 API'de hatadatan handler eksik YOK, sunulan buton kırık yok (dub:* / media-catalog / extras modül-handlerları eklidirde).
- D-29 \[temiz\] onEvent switch tüm backend olay tiplerini işliyor; `chat/explain` playerJobEvent() öncesiçe tüketiliyor; burnin ayrı kanal + ayrı abonelik; `subtitle:fileChanged` benzer.
- D-30 \[temiz\] buildOptsFromUI ↔ transcribe handler arg senkron (istisna 3 SECRET alan env-pl sağlık).
- D-31 \[temiz\] state.queue dondurma + startBtn(iliştirme 4133-4195 await-öncesi state.running=true) + queueRunning guard — çift spawn yok.
- D-32 \[temiz\] scheduleSave 400ms debounce; `_applyingSettings` senkron apply + beforeunload senkron yazım; debounced change dispatch yarışları kapandı.
- D-33 \[temiz\] EN/TR: varsayılan EN korunmuş (ui-locale.js `let locale='en'`), ignored seçiciler altyazı/medya verisini çeviri dışı bırakıyor.
- D-34 \[temiz\] XSS: escapeHtml 5 karakter kaçırıyor; 81 dinamik innerHTML sitesinin hepsinde escapeHtml; srcdoc/eval/new Function yok.
- D-35 \[temiz\] listener sızıntısı yok: tüm `on*` abonelikleri init yazımında bir kez; MutationObserver tek kuruluş.

browser-* statik (özet, KAYNAK: ekstra katman taraması; hepsi [statik]):
- D-36 \[YÜKSEK-şüphe\] scheduler cache-hit kalite-kapı hatası transient sınıflamaya düşer → yeniden deneme döngüsü **ücretli istek** açabilir (browser-translation-scheduler.js ~623).
- D-37 \[düşükler\] mergeBrowserStreamCues mutasyon paket riski (browser-subtitles.js:230-244), cueFingerprint `\u2060` varyanti, parseAss null-end, attr regex yeniden derleme, O(n²) includes, NaN revisionKey, aynı-start farklı-metin merge, DASH SegmentList mediaRange boşluk, manifest 304 "missing body", tek-satır canlı manifest, LRU eviction edge, site-profiles legacy zoom merge, Intl.Segmenter fallback, NUMBER_TOKEN 10:30, cueRef NaN, burnin temp regex `[^.\/]+`, dub plans Map temizliği, image telemetry vb. — ayrıntıları bağlarıt dosyada tamam (ask kaydında).
- D-38 \[temiz\] queue-persistence `.bak` zinciri/journal replay, translation-cache journal/compact, find-replace apply sırası, dub cancel/guard, watch-library tombstone merge otorite sıralaması (bası büyümanlar dışı).

Güvenlik/uyum statik:
- D-39 \[temiz\] SECRET sızıntı yüzeyleri: buildSecretEnv `withoutSecretEnv` + hedefe-doğru; export/import redaksiyon + diagnostics redaksiyon testi (browser-diagnostics-export.test.js:57-60).
- D-40 \[temiz\] ayar dışa aktarım shares izolasyonu doğrulandı; canonicalLocalPath / process listing path traversal denetimleri temiz (workspace-package whitelist+symlink reddi; NTLM listesi) ; `renderer-external` policy (main.js:5431-5469) + `openExternalByPolicy`; `will-navigate` preventDefault (15030); `setWindowOpenHandler` her pencere; MAX_BROWSER_POPUPS; rate-limited.
- D-41 \[temiz\] `androiandot/whisper-altyazi` eski upstream: kaynak ağaçta yok; yalnız AGENTS.md bilinçli uyarı satırı; package.json doğru repo.
- D-42 \[temiz\] CHANGELOG (0.9.0-beta.1) ↔ package.json tutarlı.
- D-43 \[temiz\] engines Node ≥22.13 — kodda uyumsuz API gördüler yok (Node 25.6.1 ile koşuldu).
- D-44 \[temiz\] UNY 40 commit churn: dub/voice-reference ve live-asr audio-switch /translation scheduler yoğun; secret-store/local-file-access az dokunuldon.

---

## E. Temiz gözlenen alanlar (olumlu doğrulama özeti)

1. Backend boru hattı ana yolları (time_offset, halüsinasyon çift filtre, split/wrap semantikleri cümle-kırma kuralı, merge, NDJSON/UTF-8/BOM diyeti, SECRET env, VRAM bırakma, reexport robustness, pyannote fail-open).
2. Electron main: 245 IPC handler auth, burnin kaçış sistemleri, atomik JSON + corrupt recovery, subs:shift, yt-dlp checksum+lock sistemi, pencere/mini-pencere, sır/env export akışları.
3. Preload/renderer: API-handler birebir, onEvent switch tam, queue dondurma + çift-spawn koruması, debounce işlemleri, i18n kapsamı, XSS kapsamı, listener lifecycle temiz.
4. Browser zinciri: session/asset store katmanı, çeviri cache journal/compact, merge/dedupe adımları temiz.
5. .bat/CI: hata yolları + UTF-8 tırnakları; CI iki våben matrix.gitignore genel kapsamı; dependencies çoğunluk kilitli; package.json engines🍁uyumlu; CHANGELOG sync.

## F. Sınırlar ve yapılmayanlar

- YENI-BILGISAYAR.md uyarısı: kod tabanının asıl hedef ortamı Windows (`D:\Whisper Local`); bu koşum Ubuntu değil Windows üzerinde yapıldı, fakat gerçek UI/GPU/DRM doğrulamaları **koşulmadı**.
- Gh CLI kurulu olmadığından origin CI'nin mevcut kırmızıda/yeşilde durum rezilokan dörto oIPAddress sağlanamaz; test görüntüleri local koşumdan.
- Ajan bulguları kanıt etiketi taşıyor: metalang (komut/dosya) doğrulanmayanlar "şüphe" etiketiyle işaretlendi; C bölümindeki statik analiz keşifleri ikinci koşum kanıtı bekliyor.
- Şifreli ayar/sınıf ismi bilinen kontrol: `misc-exports-deadzone` POSIX spawn windows-dışına delisi; **ci windows-bacakını mutlaka kesin red; Ubuntu beslenir**.
- Kod yalnız okuma; `_repro/`, `files*.zip` gibi untracked kök öğeleri **dokunulmadı**; bu raporun üretimi sırasında hiçbir kaynak dosya değiştirilmedi — yalnızca bu rapor dosyası, devir notu ve kök/rapor indeksleri (`.md`) güncellendi.

## G. Önerilen sıralama (geliştirici içindir; bu rapor sadece okuma denetimi)

1. B-1 youtube-guard olayı — tek yöntem: preload API + renderer aboneliği ekleyerek `youtube:event` kanalını UI bağlamak (var olan `onYoutubeEvent` API'sini etkinleştirmek).
2. B-2 NaN argv — main.js'te `Number.isFinite` geçirin; renderer'da boş alan → null.
3. B-3/B-4/B-5 format zaman yazımına ortak katı doğrulama yazıcısı katmanı.
4. B-6 maxCps 0 semantik utandırması — UI'da "0 = CPS kapalı" etiketi eklemek veya main.js'te `typeof options.maxCps === 'number'` kontrolü gönderme koşulu.
5. §A 11 test dosyası: `translationEndpointReady`/`dubService`/`ipcMain` vm-slice stub'lar؛ misc-exports-deadzone'a POSIX gate; `ci-determinism-ratchet` baseline yeniden okuma; `coverage-map` `backend/translation_auth.py` test referansı.
6. C-1 queue secret regex kapsamı; C-2 in-place mutasyon; C-4 observer eviction; C-6 uncaughtException handler; C-10 tests/ Python keşfi; §C-13 repo hijyeni PR'ı.

— Rapor sonu.
