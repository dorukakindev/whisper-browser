# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Genel bakış

Yerel, GPU hızlandırmalı altyazı çıkarma uygulaması. **Electron arayüzü** (Node + renderer) + **Python backend** (faster-whisper / WhisperX). Windows hedefli, RTX 4070 Ti için optimize. Arayüz ve tüm kullanıcı metinleri Türkçe.

## Komutlar

```bat
install.bat              :: venv + PyTorch(CUDA 12.1) + faster-whisper + yt-dlp + npm install
start.bat                :: cuDNN/cuBLAS DLL'lerini PATH'e ekler, sonra `npm start` ile Electron'u açar
install-whisperx.bat     :: opsiyonel WhisperX motoru (wav2vec2 hizalama)
install-diarize.bat      :: opsiyonel pyannote.audio (konuşmacı tanıma)
```

**Geliştirme döngüsü:**
- Uygulamayı çalıştırma: her zaman `start.bat` üzerinden — `npm start` tek başına çalışmaz çünkü faster-whisper'ın cuDNN/cuBLAS DLL'leri `start.bat` tarafından PATH'e eklenir. Doğrudan `npm start` çalıştırırsan model GPU'da yüklenirken `cublas`/`cudnn` hatası alırsın.
- DevTools'lu mod: `npm run dev` (renderer'da `--dev` ile detached DevTools açar). Yine cuDNN PATH'i lazımsa start.bat env'ini taklit et.
- Backend'i tek başına test etme: `backend\venv\Scripts\python.exe backend\transcribe.py --input <dosya> --model tiny --device cpu` — NDJSON olaylarını stdout'a basar.

**Test/doğrulama:** Otomatik test yok. Değişiklikten sonra sözdizimi kontrolü:
```powershell
& "backend\venv\Scripts\python.exe" -m py_compile backend\transcribe.py
node --check src\main.js; node --check src\preload.js; node --check src\renderer\renderer.js
```
Backend saf-fonksiyonlarını (`parse_timecode`, `split_segment_*`, `write_srt` vb.) doğrularken `sys.path.insert(0, 'backend'); import transcribe` ile içe aktarıp doğrudan çağırmak en hızlı yol — modül seviyesinde ağır import yok.

## Mimari

### Üç süreç, tek yön veri akışı
1. **`src/main.js`** (Electron main, Node erişimi): pencere yönetimi, IPC handler'ları, Python subprocess'i `spawn` eder, ayar/pencere-durumu dosyalarını yazar.
2. **`src/preload.js`** (contextBridge): `window.api.*` köprüsü. `contextIsolation: true`, `nodeIntegration: false` — renderer'ın Node'a doğrudan erişimi YOK. Renderer'a yeni bir yetenek eklemek = burada bir `api` metodu + main'de bir `ipcMain.handle`.
3. **`src/renderer/`** (sandbox'lı UI): `index.html` + `renderer.js` + `styles.css`. Tüm DOM/durum mantığı `renderer.js`'te tek dosyada.

### Backend iletişim protokolü (kritik)
`backend/transcribe.py` argparse ile çağrılır ve **stdout'a NDJSON olayları** basar (`emit()` fonksiyonu). main.js bunları satır satır parse edip `transcribe:event` IPC kanalıyla renderer'a iletir; renderer.js'teki `window.api.onEvent` switch'i her olay tipini işler. Olay tipleri: `log`, `status` (stage), `download_progress`, `language`, `progress`, `segment`, `llm_progress`, `preview_refresh`, `done`, `error`, ayrıca main.js'in eklediği `exit`.

**Yeni bir backend özelliği eklerken sözleşmeyi üç yerde senkron tut:**
- `backend/transcribe.py` → `main()` içinde `argparse` argümanı + iş mantığı
- `src/main.js` → `transcribe:start` handler'ında `options.X` → `args.push('--x', ...)`
- `src/renderer/renderer.js` → `buildOptsFromUI()` içinde UI değerini opts'a koy; kalıcı olacaksa `PERSIST_VALUE_CONTROLS`/`PERSIST_CHECKBOX_CONTROLS` listesine ekle
- `src/renderer/index.html` → kontrolü ekle (range ise `renderer.js`'teki `ranges` dizisine de ekle)

### Transkripsiyon boru hattı (`transcribe.py` > `transcribe()`)
Sıra: girdi (yerel dosya / yt-dlp ile YouTube) → ffmpeg ile 16kHz mono WAV çıkar (isteğe bağlı `--clip-start/--clip-end` zaman aralığı) → motor seçimi (`faster` / `faster-batched` / `whisperx`) → segment akışı → her segment için halüsinasyon filtresi + bölme stratejisi (`segment_to_chunks`, `--split-mode`) + metin temizleme → `recover_punctuation_collapse` (model hâlâ VRAM'deyken) → `dedupe_consecutive` → `merge_incomplete_sentences` → `merge_short_entries` → opsiyonel `llm_postprocess` → opsiyonel diarization (pyannote) → `normalize_timings` → formatlara yazma.

**Önemli noktalar:**
- **Noktalama çöküşü:** Whisper uzun videolarda bir noktadan sonra noktalamayı tamamen bırakabiliyor; `condition_on_previous_text` açıkken bozuk metin bağlam olarak geri beslendiği için sona kadar sürüyor. Film preset'inde bu yüzden `conditionOnPrevious` KAPALI. Yedek olarak `find_unpunctuated_spans` bozuk aralıkları bulur, `recover_punctuation_collapse` o aralığın WAV'ını kesip conditioning kapalı yeniden çevirir ve **yalnızca noktalama oranı arttıysa** yerine koyar (asla kötüleştirmez). Model bu adımda hâlâ yüklü olmalı — VRAM boşaltmadan önce çalışır.
- **Çeviri (`llm_translate`):** Transkripsiyon bittikten SONRA, yazma aşamasının başında çalışır. Blok sayısı ve zamanlar DEĞİŞMEZ — yalnızca metinler çevrilir; çeviri ayrı dosyaya (`<ad>.<hedef>.srt`) yazılır, kaynak asla üzerine yazılmaz. Parça başına 20 blok + 4 satır önceki/sonraki bağlam, blok süresine göre `max` karakter bütçesi gönderilir. `resolve_translate_routes` shuaiapi'nin dört rotasını tanır ve bağlantı/5xx hatasında sıradakine geçer (kota/anahtar hatasında geçmez — hepsinde aynı sonuç). Çevrilemeyen bloklarda ORİJİNAL metin kalır ve `warn_list`e uyarı düşer. API anahtarı `WHISPER_TRANSLATE_API_KEY` ortam değişkeniyle gelir. Altyazı metni prompt'ta GÜVENİLMEZ veri olarak işaretlenir (metin içindeki talimatlar uygulanmaz).
- **Senkron (`--sync-subs`):** ffsubsync ile aynı çekirdek (ses enerjisi VAD sinyali ↔ altyazı gösterim sinyali, FFT çapraz-korelasyon). Ek olarak `find_sync_transform` bilinen framerate oranlarını (`FRAMERATE_RATIOS`: 25/24 PAL, 24/23.976, 30/29.97 ve tersleri) tek tek deneyip **normalize korelasyon skoru** en yüksek olanı seçer; oran 1.0 dışına ancak skor %8+ iyileşirse çıkar (rastlantısal eşleşmeye kanmasın). `best_offset_scored` skoru da döndürür — adayları kıyaslamak için şart; yeni bir hizalama adayı eklersen aynı normalize skoru kullan.
- **Yaygın hata düzeltme (fix_common_errors):** dedupe sonrası, birleştirmelerden ÖNCE çalışır. Alt adımlar: strip_repeated_prefix (karaoke artefaktı), drop_micro_blocks (<80 ms), fix_text_artifacts (noktalama boşluğu/tekrarlı işaret/çift tire), capitalize_after_sentence. Sıra önemli — büyük harf kararı düzeltilmiş noktalamaya göre verilir. Türkçe büyük harf i → İ (str.upper() yanlış sonuç verir). Sayı/ondalık, kısaltma ve diyalog tiresi korunur.
- **İstatistiksel halüsinasyon (`find_repeated_hallucinations`):** dört koşul BİRDEN aranır — dosya boyunca 4+ tekrar, 8 kelimeden kısa, kelime güveni 0.55 altı, tekrarlar toplam sürenin %25'inden geniş bir alana yayılmış. Dördü birden olmadan silinmez; gerçek kısa replikler ("Evet.") yüksek güven, kekeleme tekrarları yayılım koşuluyla elenir. Güven 0.40 altındaysa silinir, arasındaysa yalnızca uyarı. Kelime damgası yoksa (need_words kapalı) hiç çalışmaz.
- **Dış altyazı okuma:** `read_subtitle_text` (backend) ve `decodeSubtitleBuffer` (main.js) AYNI mantığı uygular — kodlama sırası utf-8-sig → cp1254 → latin-1, ardından iki onarım: çift kodlanmış UTF-8 ve latin-1 okunmuş cp1254. Onarım yanlış tetiklenmesin diye Türkçede hiç bulunmayan harfler (á é í ó ú æ ø å) varsa metne DOKUNULMAZ — İzlandaca/İspanyolca `þ ð ý` gerçek harftir. Birini değiştirirsen diğerini de değiştir.
- **Zaman çubuğu işaretleri tek katman:** `renderSeekMarkers()` hem bölümleri hem altyazı arama eşleşmelerini çizer. Arama boşaldığında `defaultMarkers()` (bölümler) geri yüklenir — birini eklerken diğerini silme. İşaretler süre gerektirdiği için `loadedmetadata`'ta yeniden çizilir (bölümler probe'dan, süre bilinmeden önce gelir).
- **Oynatıcı yerleşimi (önemli):** kontrol çubuğu (`#playerControls`) video sahnesinin (`#playerStage`) İÇİNDE olmak zorundadır — tam ekran sahneye uygulandığı için dışarıda kalan her şey tam ekranda kaybolur. Eskiden çubuk kardeş elemandı ve tam ekranda hiç kontrol görünmüyordu. Altyazı katmanı da aynı sebeple sahnenin içindedir. Boşta gizleme `.idle` sınıfıyla yapılır (`showControls()`); duraklatılmışken ve düzeltme kutusu açıkken gizlenmez.
- **Kaldığın yer (`savePlayerPosition`):** konum `settings.json` içinde `playerPositions` altında, anahtar = dosya yolu veya YouTube linki (HLS manifest URL'si DEĞİL — zaman aşımına uğrar). 30 sn altındaki konumda kayıt GÜNCELLENMEZ ama SİLİNMEZ: video yüklenirken currentTime 0'dır ve timeupdate/pause olayları buraya düşer; silseydik kullanıcı "Devam et"e basamadan kayıt yok olurdu.
- **Uyarı mekanizması:** `warn_list` → `done` olayının `warnings` alanı → renderer günlüğe basar. Otomatik silmenin riskli olduğu bulgular (alfabe karışması `find_script_contamination`, şüpheli boşluk `find_suspicious_gaps`) buradan bildirilir; metne dokunulmaz.
- **Kısaltma koruması:** `is_abbreviation` (`Mrs.`, `L.A.`, `2.`, `vb.`) + `text_ends_sentence` — nokta ile biten her kelime cümle sonu değildir. Bölme, sarma, `has_enough_punctuation` ve birleştirme hep bu iki yardımcıyı kullanır; yeni bir "cümle bitti mi" kontrolü eklerken doğrudan `endswith(PUNCT_END)` yazma.
- **YouTube aralık indirme KULLANILMIYOR (bilerek):** yt-dlp'ye `download_ranges` verilince indirici FFmpegFD'ye düşer ve ffmpeg googlevideo URL'sini tek uzun akış olarak okur; YouTube bunu ~12 KB/sn'ye boğazlıyor. Ölçüm (8 saatlik video): 1s55dk'lık aralık aralıklı indirmeyle ~3 SAAT, tam ses indirip yerelde kesmekle **102 saniye** (63 sn indirme + 40 sn kesme). Ayrıca FFmpegFD ilerleme kancalarını beslemediği için arayüz donmuş görünüyordu. Geri açma.
- **yt-dlp WAV postprocessor'ı da kaldırıldı:** indirilen ses olduğu gibi bırakılır; kırpma + 16 kHz mono dönüşümü `extract_audio`'da tek geçişte olur. Eskiden tam boy dönüşüm iki kez yapılıyordu (8 saatlik videoda ~5,5 GB ara WAV).
- **Zaman ekseni:** Kırpma (`--clip-start`) kullanılırsa tüm zaman damgaları `time_offset` ile orijinal videoya geri hizalanır — segment, kelime ve diarization span'leri dahil. Yeni zaman üreten kod eklersen offset'i unutma.
- **WhisperX uyarlaması:** WhisperX dict döndürür; `_WxWord`/`_WxSegment`/`_WxInfo` hafif sınıfları onu faster-whisper'ın segment/word arayüzüne uydurur, böylece bölme/yazma boru hattı motordan bağımsız kalır.
- **Sözlük = `hotwords`, `initial_prompt` DEĞİL (`build_prompt_and_hotwords`):** faster-whisper `condition_on_previous_text=False` iken her pencere sonunda `prompt_reset_since = len(all_tokens)` yapar; bu yüzden `initial_prompt` YALNIZCA ilk 30 sn'lik pencerede etkilidir. Film preset'inde conditioning kapalı olduğundan sözlük 90 dakikalık bir filmde pratikte çalışmıyordu. `hotwords` ise `get_prompt`'a her pencerede yeniden verilir. Sözlüğü prompt'a geri taşıma. WhisperX hotwords desteklemez — oraya sözlük prompt içinde gider (fonksiyonun 3. dönüş değeri).
- **`need_words`:** Kelime zaman damgaları yalnızca `split_mode != none` veya JSON çıktısı istendiğinde hesaplanır (hız için).
- **Bölme & sarma ayrı kavramlar:** `split_*` fonksiyonları bir segmenti birden çok altyazı bloğuna böler (zaman); `wrap_text` tek bloğu satırlara sarar (görsel). `wrap_mode="sentence"` cümleyi asla ortadan kırmaz.
- **Halüsinasyon savunması:** `HALLUCINATION_PATTERNS` (regex) + `has_repetition_loop`/`collapse_repetition` (tekrar döngüleri). Filtre segment metnine hem bölmeden önce hem temizlikten sonra uygulanır.

### Ek modlar ve kanallar
- **Re-export (`--reexport true`):** `--input` bir `.json` çıktısıdır; `reexport_from_json()` transkripsiyonu atlayıp JSON segmentlerinden formatları yeniden yazar (aynı `write_*` yazıcıları, mevcut `--formats/--wrap-mode/--max-line-width`). main()'de `transcribe()` yerine bu çağrılır.
- **Burn-in:** main.js'te `burnin:start`/`burnin:cancel` IPC + ayrı `burnin:event` kanalı (transcribe:event'ten bağımsız). ffmpeg `subtitles=` filtresi; Windows yolu `ffSubtitlesArg` ile tek tırnağa alınır. Yalnızca yerel video girdisinde.
- **Oynatıcı (`backend/media.py` + `media:*` IPC):** `probe` YouTube formatlarını (çözünürlükler, ses dilleri, varsa birleşik format) NDJSON olarak döndürür; `download` yt-dlp+ffmpeg ile birleştirip yerel mp4 üretir. **YouTube gerçeği:** video+ses birleşik format (360p) çoğu videoda artık sunulmuyor — ölçtük, Big Buck Bunny'de hiç yok — bu yüzden asıl yol indirmektir; `probe.stream` null gelirse arayüz "indirmeden izle" düğmesini gizler. Altyazı `<track>` ile DEĞİL, `subtitle-overlay` div'ine çizilir (file:// track'leri engellenebiliyor; ayrıca stil ve tam ekran kontrolü gerekiyor). CSP'de yalnızca `media-src` genişletildi (`file:`, `blob:`, `https://*.googlevideo.com`); `script-src 'self'` dokunulmadı.
- **Arayüz:** Nötr grafit palet + tek vurgu rengi (`--accent: #4a7ba7`); mor gradyanlar, parıltılar ve dekoratif emojiler kaldırıldı. Renk yalnızca DURUM bildirir (başarı/uyarı/hata). Yeni bir bileşen eklerken gradyan/gölge ekleme, `--accent` ve nötr yüzeyleri kullan. Gizleme için genel `.hidden` yardımcı sınıfı vardır (eskiden yalnızca elemana özel varyantlar vardı ve `.field.hidden` gibi durumlar gizlenmiyordu).
- **YouTube akışı (HLS):** YouTube 1080p+ formatlarını HLS manifesti olarak da sunuyor (`manifest_url`, `protocol=m3u8_native`); manifest tüm çözünürlükleri ve `EXT-X-MEDIA` ile ayrı ses parçalarını içerir — ölçüldü: 8 çözünürlük, 144p–2160p. Renderer `vendor/hls.min.js` ile oynatır (CSP `script-src 'self'` korunsun diye kütüphane uygulamanın içine kopyalandı; `npm install hls.js` ile güncellenir, dosya elle kopyalanır). **Kritik:** googlevideo CORS başlığı GÖNDERMEZ (ölçüldü — düz tarayıcıda `manifestLoadError` alınır); `installYoutubeStreamHeaders` Electron'da yanıt başlığına `Access-Control-Allow-Origin` ekler ve Origin/Referer'i youtube.com yapar. Kapsam yalnızca googlevideo host'ları — genişletme.
- **Klasör izleme (`watch:start`/`watch:stop`):** main.js'te 5 sn'lik `setInterval` ile tarama (fs.watch değil — ağ/USB sürücülerde güvenilmez). Yeni dosya ancak boyutu iki ölçüm boyunca DEĞİŞMEZSE kuyruğa verilir (kopyalama sürerken yarım dosya işlenmesin). İzleme başlarken mevcut dosyalar "görülmüş" işaretlenir, yanında `.srt` olan atlanır. Renderer `watch:newFiles` olayında kuyruğa ekler ve kuyruk boştaysa başlatır.
- **Kalıcı günlük:** main.js her `transcribe:start`'ta `userData/logs/<tarih>_<dosya>.log` açar; `handleLine` her olayı hem renderer'a yollar hem `writeJobLog` ile dosyaya yazar (`segment`/`progress` gibi gürültülü tipler `LOG_SKIP` ile atlanır). İş kapanınca `endJobLog`, en yeni 100 dosya `pruneOldLogs` ile korunur. Argümanlar günlüğe yazılır — gizli anahtarlar argv'de değil ortam değişkeninde olduğu için güvenli; yeni gizli alan eklersen bu kalıbı bozma.
- **Oynatıcı medya süreçleri türe göre ayrı (`mediaJobs`):** probe / download / subs ayrı tutulur. Hepsi tek değişkeni paylaşırken indirme sürerken yapılan bir probe onun tutamacını eziyordu; iptal yanlış süreci öldürüyor ya da "İndirme yok" diyordu. İptal YALNIZCA download işini hedefler; kapanışta üçü de öldürülür.
- **Diğer bakım/araç IPC'leri:** `subs:shift` (SRT/VTT zaman kaydırma, saf Node), `settings:export`/`settings:import`, `maintenance:updateYtdlp`, `dialog:openFile` (uzantı filtreli tek-dosya), `app:getEnvInfo` (venv/ffmpeg/GPU adı + `vramMib`).
- **VRAM:** start.bat ile yüklenen büyük model + pyannote 12GB'da OOM verebilir; `transcribe()` segment döngüsünden sonra modeli `del`+`empty_cache` ile boşaltır (diarization öncesi). Renderer `estimateVramMib()` ile rozette önceden uyarır.

### Gizli anahtarlar
HF token ve LLM API key **argv'den değil ortam değişkeninden** geçer (`WHISPER_HF_TOKEN`, `WHISPER_LLM_API_KEY`) — süreç listesinde görünmesin diye. main.js bunları `spawn` env'ine koyar; transcribe.py `main()` sonunda argv boşsa env'den okur. Yeni gizli alan eklersen aynı kalıbı izle.

### Kalıcılık
İki ayrı dosya, `app.getPath('userData')` altında: `settings.json` (sözlük, HF token, LLM ayarları, çıktı klasörü, preset, tüm UI kontrolleri) ve `window-state.json` (pencere boyutu/maximized — pozisyon kasıtlı saklanmaz). Renderer'da ayar yazımı `scheduleSave()` ile debounce edilir; `_applyingSettings` bayrağı yükleme sırasında geri-kaydetmeyi önler.

### Kuyruk
`renderer.js`'te `state.queue`. Her item EKLENME anında `buildOptsFromUI()` ile ayarlarını **dondurur** (`item.opts`) — kuyruk işlenirken UI değişse bile her iş kendi ayarıyla çalışır. Kuyruk ilerleyişi tek-iş UI'ını yeniden kullanır; `done`/`error`/`exit` olaylarında `processNextQueueItem()` tetiklenir.

## Konvansiyonlar

- Kullanıcıya görünen tüm metinler **Türkçe**. Log mesajları, hata metinleri, UI etiketleri Türkçe yazılır.
- SRT ve ASS çıktıları **UTF-8 BOM** (`utf-8-sig`) ile yazılır (Windows oynatıcılarında Türkçe karakter sorunu için); JSON bilinçli olarak BOM'suz.
- CSP `index.html`'de katı (`script-src 'self'`); inline script ekleme, harici CDN kullanma.
- Renderer'dan dış kaynağa erişim yok — dosya yolu (`webUtils.getPathForFile`), pano, harici link, ortam bilgisi hepsi preload `api` + main IPC üzerinden gider.
