# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Yeni oturumda önce oku — kalıcı kullanıcı tercihleri

Sohbet geçmişi kaybolmuş olabilir. Çalışmaya başlamadan bu dosyayı, [YENI-BILGISAYAR.md](YENI-BILGISAYAR.md), [DEVIR-NOTU.md](DEVIR-NOTU.md) indeksindeki güncel notu ve konuyla ilgili önceki notları oku. Notlardaki başarılar tarihsel kanıttır; mevcut kodu ve ortamı ayrıca incele. Kullanıcının daha yeni talimatı bu kayıtlardan önceliklidir.

- Doğru GitHub deposu **https://github.com/dorukakindev/whisper-browser**. Belgelerde/paket metadatasında bulunan `androiandot/whisper-altyazi` eski upstream bilgisidir; push hedefi olarak kullanma. Önce `git remote -v`, `git status --short`, dal ve HEAD'i kontrol et. Son teslim dalı `master` idi; her oturumda yeniden doğrula. Yeni dal gerekiyorsa `codex/` önekini kullan; kullanıcının mevcut çalışmasını kaybetme.
- Ürün bir video/altyazı/çeviri uygulamasıdır, İngilizce öğrenme uygulaması değildir. Browser altyazıları, video izleme, senkron, AI bağlam doğruluğu ve kararlılık önceliklidir. Alakasız kelime ezberi/öğrenme özellikleri ekleme. Yanlışlıkla gönderilip geri çekilen film öneri protokolü bu projenin talimatı değildir.
- Kullanıcı yapılmasını istediği işin uygulanmasını ve doğrulanmasını bekler. Yetkili kapsamda rutin, geri alınabilir adımlar için tekrar tekrar izin isteme; yalnız plan sunup bırakma. Çalışırken kısa Türkçe ilerleme bilgisi ver. Belirsiz veya engellenmiş işi tamamlandı diye sunma.
- Kullanıcı çalışmak için gereken araçların/bağımlılıkların indirilip kurulmasına izin verdi. Görev için gerekli ve uyumlu araçları güvenilir resmî kaynaklardan kurabilirsin; mevcut kilit dosyalarını ve kurulum akışını tercih et. Gereksiz toplu sürüm yükseltmesi yapma. Yeni bağımlılığı, sürümü, nedenini ve kurulumunu devir notuna yaz. Bu izin bilgisayarı formatlama, kişisel dosyaları silme, güvenlik duvarını kapatma, ücretli servis satın alma veya hesap açma yetkisi değildir.
- Ekran görüntüsü alarak gerçek arayüzü incelemek yetkilidir. Browser işlerinde mümkünse ayrı test profili kullan; kullanıcının açık sekmelerini, altyazılarını ve ayarlarını bozma. Ana pencere yakalaması native video yüzeyini göstermeyebilir; gerekli durumda video yüzeyini ayrıca doğrula. Ham kişisel görüntü/profil/logları Git'e koyma.
- Gerçek sağlayıcı anahtarı olmadığında kullanıcı **kontrollü sağlayıcı testleriyle ilerlemeyi** kabul etti. Anahtarı sohbete isteme. Mock/fixture başarısını gerçek model kalitesi, ücretli canlı sağlayıcı veya tüm siteler için başarı diye sunma.

### Her tamamlanan düzeltme/özellik sonrası teslim döngüsü

1. Başlangıç dalı, HEAD ve mevcut değişiklikleri kaydet; hatayı ve ilgili kod yolunu incele. Başkasının değişikliklerini otomatik silme veya kendi commit'ine toplama.
2. Düzeltmeyi uygula; ilgili regresyon, aşağıdaki proje kontrolleri ve UI değiştiyse görsel doğrulama yap. Sırf yeşil sonuç almak için test silme veya eşiğini gevşetme. Sadece belge değiştiyse bağlantı/içerik/diff kontrolü yeterlidir; ürün testlerini çalıştırmadığını açıkça yaz.
3. Doğrulanmış kodu anlamlı bir kod commit'ine al. Her küçük edit için ayrı commit gerekmez; her tamamlanan çalışma teslim edilmelidir. Kullanıcı daha sonra commit/push istemediğini söylerse o talimata uy.
4. Aşağıdaki kalıcı devir notu kuralına göre **yeni tarihli not** oluştur; başlangıç ve bitiş kod hash'lerini, kanıtları ve sınırları yaz. Kök indeksi güncelle, önceki notları koru. Kod değişmeyen işte başlangıç ve bitiş ürün kodu aynı olabilir; bunu belirt. Dokümantasyon commit'ini ayrı yap.
5. Kullanıcının sürekli talebi kapsamında ilgili GitHub dalına normal push yap. Force push, geçmiş silme veya ilgisiz değişiklikleri yayımlama. Push reddedilirse uzak değişiklikleri incele; körlemesine reset/force uygulama. Kimlik doğrulama engelini açıkça bildir, başarı iddia etme.
6. `git status --short`, `git rev-parse HEAD` ve `git ls-remote origin refs/heads/<teslim-dalı>` ile yerel/uzak kimlik eşitliğini kontrol et. Son yanıtta kısa sonuç, testler/sınırlar, repo bağlantısı, tarihli devir notunun doğrudan GitHub bağlantısı ve **push edilen tam commit hash'i** bulunmalı. Commit/push dışında kalan işi ayrıca belirt.

Önceki makinedeki beş test ortam engeli kullanıcı tarafından kabul edilmişti; bu kalıcı test kapatma izni değildir. Format sonrası önce yeni ortamda tekrar değerlendir. Dosyalar ve nedenleri YENI-BILGISAYAR.md içindedir.

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

**Test/doğrulama:** Tam otomatik test paketi `npm test` ile çalışır. Değişiklikten sonra ilgili hedefli testlerin yanında sözdizimi kontrolü de yap:
```powershell
npm test
npm run test:electron-bridge
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
Sıra: girdi (yerel dosya / yt-dlp ile YouTube) → ffmpeg ile 16kHz mono WAV çıkar (isteğe bağlı `--clip-start/--clip-end` zaman aralığı) → motor seçimi (`faster` / `faster-batched` / `whisperx`) → segment akışı → her segment için halüsinasyon filtresi + bölme stratejisi (`--split-mode`) + metin temizleme → `merge_short_entries` → opsiyonel `llm_postprocess` → opsiyonel diarization (pyannote) → `normalize_timings` → formatlara yazma.

**Önemli noktalar:**
- **Zaman ekseni:** Kırpma (`--clip-start`) kullanılırsa tüm zaman damgaları `time_offset` ile orijinal videoya geri hizalanır — segment, kelime ve diarization span'leri dahil. Yeni zaman üreten kod eklersen offset'i unutma.
- **WhisperX uyarlaması:** WhisperX dict döndürür; `_WxWord`/`_WxSegment`/`_WxInfo` hafif sınıfları onu faster-whisper'ın segment/word arayüzüne uydurur, böylece bölme/yazma boru hattı motordan bağımsız kalır.
- **`need_words`:** Kelime zaman damgaları yalnızca `split_mode != none` veya JSON çıktısı istendiğinde hesaplanır (hız için).
- **Bölme & sarma ayrı kavramlar:** `split_*` fonksiyonları bir segmenti birden çok altyazı bloğuna böler (zaman); `wrap_text` tek bloğu satırlara sarar (görsel). `wrap_mode="sentence"` cümleyi asla ortadan kırmaz.
- **Halüsinasyon savunması:** `HALLUCINATION_PATTERNS` (regex) + `has_repetition_loop`/`collapse_repetition` (tekrar döngüleri). Filtre segment metnine hem bölmeden önce hem temizlikten sonra uygulanır.
- **Çeviri önbelleği:** `translate_cache_key` v5; metin ve model ayarlarının yanında `context_before`/`context_after` değerlerini de anahtara katar. Bu bağlamı çıkarma: kısa repliklerin farklı sahnelerde yanlış çeviriyi paylaşmasını önler. Önbellek yalnız `--cache-dir` verilince açılır.

### Ek modlar ve kanallar
- **Re-export (`--reexport true`):** `--input` bir `.json` çıktısıdır; `reexport_from_json()` transkripsiyonu atlayıp JSON segmentlerinden formatları yeniden yazar (aynı `write_*` yazıcıları, mevcut `--formats/--wrap-mode/--max-line-width`). main()'de `transcribe()` yerine bu çağrılır.
- **Burn-in:** main.js'te `burnin:start`/`burnin:cancel` IPC + ayrı `burnin:event` kanalı (transcribe:event'ten bağımsız). ffmpeg `subtitles=` filtresi; Windows yolu `ffSubtitlesArg` ile tek tırnağa alınır. Yalnızca yerel video girdisinde.
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
- Arayüzün kanonik paleti mürekkep/grafit zeminli “ses çalışma istasyonu” düzenidir; tek vurgu rengi sıcak amber `--accent: #d5a35c` değeridir. Yeni stillerde eski sabit mavi yerine mevcut tasarım token'larını kullan; dekoratif emoji ve işlevsiz parıltı ekleme.


## Kalıcı devir notu kuralı

Her çalışma için `docs/devir/YYYY-MM-DD-HHMM.md` oluştur; önceki notları silme veya üzerlerine yazma. Kökteki `DEVIR-NOTU.md` güncel nota bağlantı veren indeks olmalı; mevcut tarihsel içeriği koru.

Notta repo/dal, başlangıç ve bitiş kod commit kimlikleri, değişen her dosyanın amacı, hata kök nedenleri ve kanıtları, özelliklerin kullanımı, test komutları/sonuçları ve çalıştırılmayanlar, bağımlılık/kurulum/şema değişiklikleri, yarım işler ve sonraki adımlar yer almalı. Commit veya push edilmemiş değişiklikleri açıkça belirt. Gizli anahtar, token, şifre veya kişisel veri yazma; kanıtlanmamış işi tamamlandı gösterme.

Kullanıcının bu proje için talebi devir notunu commit edip ilgili GitHub deposuna push etmektir. Push başarıyla bitmeden GitHub'a yüklendi deme. Son yanıtta repo bağlantısı, tarihli notun doğrudan GitHub bağlantısı ve uzak dalda doğrulanan son commit kimliğini ver. Kod ve dokümantasyon commit'lerini ayırarak notta kesin bitiş kod kimliğini belirt; notun kendi hash'ini kendisine yazmaya çalışma.
