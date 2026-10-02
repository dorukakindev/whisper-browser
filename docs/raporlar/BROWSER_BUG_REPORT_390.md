# BROWSER BUG REPORT 390 — Kuyruk-50 batch 7 (maddeler 31–35): Kaynak/performans yönetimi

Tarih: 2026-10-02 · Dal: `devin/1790920998-b7-resources` · Kod commit'i: `906e064` · Master tabanı: `09747f2`

Kapsam: aşama bazlı ETA, donanım rehberi, ağ kullanım bütçesi, önbellek yönetim ekranı, uzun-iş kaynak zaman çizelgesi. Beş maddenin tümü gerçek uygulamada (Electron + gerçek tiny/CPU transkripsiyonu) uçtan uca doğrulandı.

## Düzeltilen doğrulanmış kusurlar (gerçek-uygulama doğrulamasında yakalandı)

### B-390-01 · `job-timing-helpers.js` top-level `const api` — modül sessizce ölüyordu (KRİTİK)
- **Belirti:** `globalThis.JobTimingHelpers` gerçek pencerede `undefined`; üç yeni panel (donanım rehberi/önbellek/ağ bütçesi) hiç çalışmıyordu.
- **Kök neden:** `preload.js`'in `contextBridge.exposeInMainWorld('api', …)` çağrısı `api`'yi ana dünyada gölge verilemez bir bağlama çevirir; sayfa betiklerinin top-level `const api` bildirimi bu bağlamayla çakışıp dosyanın **tamamının** `SyntaxError: Identifier 'api' has already been declared` ile reddedilmesine yol açıyordu. Bare-window (preloadsuz) ortamda `window.api` zaten tanımsız olduğundan betik orada çalışıyordu — kusur yalnız gerçek pencerede görünüyordu.
- **Kanıt:** Gerçek uygulamada `Runtime.evaluate` — `s.onload` sonrası `H=undefined`, `window.error` olayı: `Uncaught SyntaxError: Identifier 'api' has already been declared @job-timing-helpers.js:1`. `api`→`apiJT` yeniden adlandırmalı kopya temiz yüklendi (`H=object`).
- **Düzeltme:** `const api` → `const jobTimingHelpersApi` (kardeş `browserFlowHelpersApi` kalıbı); `module.exports`/`globalThis` satırları güncellendi.
- **Ratchet:** `tests/job-helpers-31-35.test.js` — top-level `api` bildirimi yasaklandı (statik kilit).

### B-390-02 · `applyHardwareGuide` — `batchSize` `<input type="range">`'da `el.options` hatası
- **Belirti:** "Önerilen ayarları uygula" → `TypeError: el.options is not iterable` — uygulama yarıda kesiliyordu.
- **Düzeltme:** `setIf` artık `el.options` varsa seçenek-uyumlu atama, yoksa doğrudan `el.value` atar; change olayı her iki yolda da ateşlenir.
- **Kanıt (düzeltme sonrası):** `applyHardwareGuide()` → `{model:'small', device:'cpu', computeType:'int8', engine:'faster', batchSize:'1'}` gerçek kontrollere yazıldı, `scheduleSave()` çağrıldı.

### B-390-03 · `cacheStatRows` şema uyumsuzluğu — satırlar `—`, tüm Temizle düğmeleri kilitli
- **Belirti:** Gerçek `cache:stats` yüküyle 6 satır üretildi ama boyut sütunu `—` ve düğmeler `disabled` kaldı.
- **Kök neden:** Yardımcı düz alanlar (`modelsBytes`, `translationCache.bytes`) beklerken `cacheStatsPayload()` iç içe şema (`models.bytes`, `translation.bytes/count`, `models.freeBytes/installed`) döndürüyordu.
- **Düzeltme:** Yardımcı gerçek IPC sözleşmesini okuyacak biçimde güncellendi (model detayı artık `installed` sayısı + boş alan gösterir); test gerçek şemayla güncellendi.
- **Kanıt:** `renderCacheStats()` → 6 satır, tümü tıklanabilir (`models/translation/manga/tmp/assets/logs`), örnek: `Whisper models · 0 B · 0 installed · 54.1 GB free`.

### B-390-04 · Örnekleyici `diskFreeMb` oluşmamış çıktı dizininde `0` kalıyordu
- **Belirti:** İş çıktı klasörü henüz yaratılmadığında `fs.statfsSync(outputDir)` atıyor → `diskFreeMb=null` → rapor "0 B free".
- **Düzeltme:** `statfsSync` başarısız olunca var olan ilk ebeveyn dizine (en çok 8 seviye) çık, o da yoksa `appResourceRoot()`'a düş.
- **Kanıt:** Yeni seride `diskFreeMb: 54000` (52.5 GB) gerçek ölçüm.

### B-390-05 · `formatResourceReport` pencereyi ham epoch ms gösteriyordu
- **Belirti:** `Window: 1790923409156s – 1790923409156s`.
- **Düzeltme:** `Duration: 12s (3 samples)` + aşama aralıkları göreli `+0s → +5s → +12s`.

## Madde kapanış kanıtları

| # | Madde | Kanıt |
|---|---|---|
| 31 | Aşama bazlı ETA | Gerçek işte `whisper.stageStats` → `{"extract":[0.038],"load_model":[0.47],"transcribe":[0.555],"write":[0.012]}` — ölçüm gerçek işten öğrenildi; geçmişsiz aşamada ETA `null` (uydurma yok). |
| 32 | Donanım rehberi | Panel: `No NVIDIA GPU · INTEL(R) XEON(R) PLATINUM 8559C (8 cores) · 31.3 GB RAM` + 7 model satırı + öneri `small · cpu · int8 · faster · batch 1`; Apply gerçek kontrollere yazdı. |
| 33 | Ağ bütçesi | `networkBudget` select 3 seçenek, kalıcı (PERSIST listesinde); `saver` seçimi → `network:budget` IPC → günlük `Network budget: Saver — lowest network use`; `--rate-limit` argparse + transcribe.py `ydl_opts["ratelimit"]` (`--help` doğrulandı). |
| 34 | Önbellek ekranı | 6 satır gerçek boyutlarla; koruma çift katman (`cacheClearGuard` istemci + `cacheBusyGuardError` main); asset yalnız `sweepOrphans` referanssız süpürme; güncel `jobLog` dosyası silinmez. |
| 35 | Kaynak zaman çizelgesi | Gerçek işte `job_resource` örnekleri alındı, sparkline 2 polyline çizdi (RAM%/GPU), `job_resource_final` seri kapandı; "Özeti kopyala" → kişisel içeriksiz md (yalnız aşama aralıkları + tepe sayıları). |

## Test kanıtı

- `tests/job-helpers-31-35.test.js` — **23/23** (yeni ratchet dahil)
- `tests/adversarial-ipc.test.js` — 18/18 (iki VM bağlamına `startJobResourceSampler` stub'ı eklendi)
- `node --check`: main.js, preload.js, renderer.js, renderer-helpers.js, ui-locale.js, job-timing-helpers.js — temiz; `py_compile` transcribe.py — temiz
- ipc-parity, ui-locale (×4), settings, queue-persistence (14), browser-flows-26-30 (22), electron-runtime-maintenance smoke — yeşil
- **Gerçek uygulama:** `DISPLAY=:0` + ayrı profil `/tmp/wb-b7-profile` + CDP :9333 → tamamlanan gerçek transkripsiyon (`speech-en.wav` → `speech-en.srt`, tiny/cpu); medya-erişim diyaloğu onaylandıktan sonra uçtan uca.

## Çalıştırılmayanlar / sınırlar

- **Windows:** yalnız Linux'ta doğrulandı; `windowsHide:true` zaten spawn'da var; `--rate-limit` yt-dlp davranışı Windows'ta aynı olmalı ama denenmedi.
- GPU'lu makine (nvidia-smi gerçek değeri) bu makinede yok — `gpuMemMb` bu kutuda 0 döndü; RTX 4070 Ti'da gerçek MB beklenir.
- Ağ bütçesi `--rate-limit` yalnız yeni işlerde yt-dlp'ye geçer; sürmekte olan indirmeye etki etmez (scheduler cap canlı, indirme limiti değil).
- Uzun iş (40 dk+) örnekleyici kapsamı bu koşuda ~1sn'lik işle sınandı; kap sınırı (480 örnek) birim testte kilitli.
