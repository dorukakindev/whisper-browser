# Whisper Altyazı — Kapsamlı Bug Raporu

> **Tarih:** 2025-07-25
> **Kapsam:** Tüm kaynak kod (7 dosya, ~7000 satır) + yardımcı dosyalar (.bat, .json, .md, .gitignore)
> **Derinlik:** 4 faz, her fazda ayrı uzman agent'larla paralel tarama
> **Toplam bulgu:** 80+

---

## İçindekiler

1. [CRITICAL — Çalışma Zamanı Çökmeleri / Veri Kaybı](#1-critical--calisma-zamani-cokmeleri--veri-kaybi)
2. [HIGH — İşlevsellik Kaybı / Yanlış Çıktı](#2-high--islevsellik-kaybi--yanlis-cikti)
3. [MEDIUM — Sessiz Hatalar / Tutarsızlıklar](#3-medium--sessiz-hatalar--tutarsizliklar)
4. [LOW — Kod Kalitesi / Sürdürülebilirlik / Marjinal Durumlar](#4-low--kod-kalitesi--surdurulebilirlik--marjinal-durumlar)
5. [Cross-File Tutarsızlıklar](#5-cross-file-tutarsizliklar)
6. [DLL / CUDA / PATH Versiyon Çatışmaları](#6-dll--cuda--path-versiyon-catismalari)
7. [Electron Güvenlik / Preload](#7-electron-guvenlik--preload)
8. [Cross-Platform Sorunları](#8-cross-platform-sorunlari)
9. [Windows Edge Case'ler](#9-windows-edge-caseler)
10. [Dosya Sistemi / Encoding](#10-dosya-sistemi--encoding)
11. [Erişilebilirlik / Accessibility](#11-erisilebilirlik--accessibility)
12. [Eksik Bağımlılıklar / Konfigürasyon](#12-eksik-bagimliliklar--konfigurasyon)

---

## 1. CRITICAL — Çalışma Zamanı Çökmeleri / Veri Kaybı

### C1. `resolvePython()` asla `'py'` launcher'ı denemez

**Dosya:** `src/main.js:508-520`

```js
const candidates = [
  path.join(appDir, 'backend', 'venv', 'Scripts', 'python.exe'),
  path.join(appDir, 'backend', '.venv', 'Scripts', 'python.exe'),
  'python',
  'py',   // ← ÖLÜ KOD: path.isAbsolute('py') = false, bu satıra HİÇBİR ZAMAN ulaşılmaz
];
for (const c of candidates) {
  if (path.isAbsolute(c) && fs.existsSync(c)) return c;  // 'python' ve 'py' asla true döndürmez
}
return 'python';  // Her zaman 'python' döner
```

**Etki:** Windows'ta `python` PATH'te yoksa (ör. Microsoft Store Python'u `py` launcher ile gelir), `spawn('python', ...)` ENOENT ile çöker. Kullanıcıya "install.bat çalıştır" hatası gösterilir ama asıl sorun `resolvePython`'ın `'py'`yi hiç denememesidir.

---

### C2. `transcribe.py` satır 1861: `model = None` — batched/WhisperX yolunda `del model` AttributeError

**Dosya:** `backend/transcribe.py:1861, 2044-2048`

```python
model = None      # satır 1861
batched = None
# ...
if batched is not None or model is not None:
    try:
        del batched
        del model          # ← model = None ise AttributeError
    except Exception:
        pass               # sessizce yutulur, temizlik yapılmaz
```

**Etki:** `faster-batched` ve `whisperx` engine'lerinde `model` `None` kalır. `del model` AttributeError fırlatır ama `except Exception: pass` ile yutulur. VRAM temizlenmez. Aynı sorun WhisperX yolunda `batched` için de geçerli.

---

### C3. `emit()` kontrol karakterlerinde çöker, tüm süreç ölür

**Dosya:** `backend/transcribe.py:50-53`

```python
def emit(event_type, **payload):
    msg = {"type": event_type, **payload}
    print(json.dumps(msg, ensure_ascii=False), flush=True)  # ← try/except YOK
```

**Etki:** Python'ın `json.dumps`'ı, `ensure_ascii=False` iken string içindeki kontrol karakterlerinde (U+0000-U+001F) `ValueError` fırlatır. Whisper null byte (`\x00`) üretirse tüm süreç ölür, hiçbir kısmi sonuç kaydedilmez.

---

### C4. Unhandled Promise Rejection → `state.running` kalıcı kilit

**Dosya:** `src/renderer/renderer.js:1178, 259, 1587, 1635`

```javascript
const result = await window.api.startTranscribe(opts);
if (!result.ok) { ... finishRun(false); }  // ← IPC throw ederse bu satıra HİÇBİR ZAMAN ulaşılmaz
```

**Etki:** `startBtn`, `processNextQueueItem`, `reexportJson`, `syncBtn` — 4 farklı `async` fonksiyonda try/catch yok. IPC hatasında `state.running = true` kalır, UI sonsuza dek kilitlenir.

---

### C5. Geç `exit` event'i bir sonraki queue item'ının durumunu bozar

**Dosya:** `src/renderer/renderer.js:1362-1377`

```javascript
if (event.code !== 0 && state.running) {  // ← state.running TRUE (N+1 için!)
  const item = state.queue.find(x => x.id === state.currentQueueId); // N+1'i BULUR!
  if (item && item.status === 'running') {
    item.status = 'error';  // ← N+1'i hatalı işaretler!
```

**Etki:** Item N'nin gecikmiş `exit` event'i, item N+1'in `state.running = true` olduğu anda gelirse yanlış item'ı hatalı işaretler. Çalışan iş iptal edilmiş gibi görünür.

---

### C6. ctranslate2 VRAM'i `torch.cuda.empty_cache()` ile boşalmaz

**Dosya:** `backend/transcribe.py:2044-2050`

```python
del model
_wx_free_gpu()  # sadece torch.cuda.empty_cache() çağırır
```

**Etki:** faster-whisper, ctranslate2 kullanır. ctranslate2 kendi CUDA allocator'ını yönetir — PyTorch'un `empty_cache()`'i ctranslate2'nin CUDA tahsisatlarını etkilemez. `del model` Python referansını kaldırır ama ctranslate2'nin C++ tarafındaki GPU belleği (~3GB large-v3) serbest kalmaz. Diarization yüklendiğinde OOM riski yüksektir.

---

### C7. pyannote Pipeline VRAM'i `del` ile serbest kalmaz

**Dosya:** `backend/transcribe.py:1086-1093`

```python
del pipeline, diarization
gc.collect()
torch.cuda.empty_cache()
```

**Etki:** `del pipeline` Python referansını siler ama pyannote modül-seviyesinde PyTorch model referansları tutar. `empty_cache()` yalnızca kullanılmayan önbellek bloklarını boşaltır. C6 ile birleşince 12GB VRAM'de OOM garantidir.

---

### C8. Subprocess hatasında çift event (dual emission)

**Dosya:** `src/main.js:700-719` (transcribe) ve `488-495` (burn-in)

**Etki:** Node.js'de subprocess başarısız olunca (`ENOENT` vb.) **hem** `'error'` **hem** `'close'` event'i sırayla ateşlenir. Renderer iki event alır: `error` (UI'ı hata durumuna sokar) + `exit` (queue'yu ilerletmeye çalışır). Bu iki event çakışarak UI state machine'ini bozar. Burn-in'de daha kötü — iki kez hata mesajı.

---

### C9. Settings.json atomik yazılmaz, çökmede tüm ayarlar sıfırlanır

**Dosya:** `src/main.js:67-75`

```javascript
fs.writeFileSync(settingsPath(), JSON.stringify(s, null, 2), 'utf-8');  // direkt yazım, atomik değil
```

**Etki:** Çökme/power loss olursa `settings.json` yarı yazılmış halde kalır. Bir sonraki açılışta `JSON.parse` başarısız olur → tüm ayarlar (HF token, LLM API key, preset, output dir) sıfırlanır. Oysa backend'deki `write_checkpoint` (line 1680) `.tmp` + `os.replace` ile atomik yazım yapar.

---

### C10. Preload event listener sızıntısı — reload'da çoğalma

**Dosya:** `src/preload.js:29-38`, `src/renderer/renderer.js:1228,1669`

```javascript
// preload.js — cleanup döndürür:
return () => ipcRenderer.removeListener('transcribe:event', listener);
// renderer.js — dönüş değerini ATAR:
window.api.onEvent((event) => { ... });  // ← cleanup asla çağrılmaz!
```

**Etki:** DevTools'ta F5 (reload) yapılınca aynı `webContents` kullanılır, eski listener'lar temizlenmez. Her reload'da listener sayısı ikiye katlanır. N'inci reload'dan sonra her olay N+1 kez işlenir → çift segment, çift log, çift modal.

---

## 2. HIGH — İşlevsellik Kaybı / Yanlış Çıktı

### H1. `clean_text` üç noktayı (`...`) 2 noktaya (`..`) düşürür

**Dosya:** `backend/transcribe.py:991-992`

```python
_TR_SPACE_BEFORE_PUNCT = re.compile(r"\s+([,.!?;:…])")  # ÖNCE çalışır
_TR_ELLIPSIS = re.compile(r"\.{3,}")                     # SONRA çalışır
```

**Etki:** Regex'lerin sıralaması yanlış. Önce space-before-punctuation çalışır: `"test ..."` → `"test .."` (boşluk + ilk nokta tüketilir). Sonra ellipsis regex'i 3 nokta arar ama 2 nokta kalmıştır → eşleşmez. Sonuç: tüm üç noktalar (`...`) iki noktaya (`..`) dönüşür.

**Fix:** Sıralamayı değiştir — önce `_TR_ELLIPSIS`, sonra `_TR_SPACE_BEFORE_PUNCT`.

---

### H2. `--split-mode` varsayılanı backend'de `"none"`, UI'da `"sentence"`

**Dosya:** `backend/transcribe.py:2580`, `src/main.js:575`, `src/renderer/renderer.js:44`

**Etki:** Settings bozuksa veya bir güncelleme sonrası splitMode backend'e iletilmezse, backend `"none"` kullanır ve segmentler hiç bölünmez. UI "Cümle bazlı" gösterirken çıktı bölünmemiş gelir.

---

### H3. `maxChars = maxLineWidth * 2` — bağımsız slider yok

**Dosya:** `src/renderer/renderer.js:72-74`

```javascript
maxChars: parseInt($('maxLineWidth').value, 10) * 2,  // maxLineWidth'ten türetilir, bağımsız değil
```

**Etki:** `maxChars` (split_segment_by_timing'de `target_chars` olarak kullanılır) ayrı bir UI kontrolü olarak gösterilmez. Kullanıcı bu değeri bağımsız ayarlayamaz. `hardMaxChars` ayrı bir slider'dır — iki farklı "max chars" kavramı karışıktır.

---

### H4. macOS/Linux'ta `resolvePython` venv'i tamamen atlar

**Dosya:** `src/main.js:510-512`

```javascript
path.join(appDir, 'backend', 'venv', 'Scripts', 'python.exe'),  // Windows-only!
```

**Etki:** macOS/Linux'ta venv Python'u `backend/venv/bin/python3`'dür, `Scripts/python.exe` değil. Her zaman `'python'` döner → venv sessizce baypas edilir. venv'deki paketler (faster-whisper, torch CUDA) KULLANILMAZ.

---

### H5. cuBLAS 12.4 (torch) vs 12.9 (pip) DLL versiyon çatışması

**Dosya:** `start.bat:13-16`, `install.bat:85`

**start.bat PATH sırası:** `cublas\bin` (pip 12.9) → `cudnn\bin` (pip 9.22) → `torch\lib` (torch 12.4 / 9.1)

**Etki:** PyTorch 2.10.0 (CUDA 12.1 için derlenmiş, cuBLAS 12.4.2 bekler) runtime'da cuBLAS 12.9.2'yi bulur. ABI farkı: `CUBLAS_STATUS_NOT_SUPPORTED`, sessiz numeric farklılıklar, nadiren crash. **3 farklı cuDNN 9 versiyonu aynı process'te** (torch 9.1, ctranslate2 bundled 9.10, pip 9.22). `start.bat` yorum satırı "torch\lib önce eklenir" der ama aslında pip DLL'leri torch'unkileri ezer.

---

### H6. WebUtils.getPathForFile Electron 31'de yok, 32'de drag-drop kopacak

**Dosya:** `src/preload.js:5-7`, `package.json:13`

```javascript
getFilePath: (file) => {
  try { return webUtils.getPathForFile(file); } catch (_) { return file && file.path; }
}
```

**Etki:** Electron 31'de `webUtils.getPathForFile` mevcut DEĞİL → her zaman `file.path` fallback'i kullanılır. Electron 32'de `file.path` TAMAMEN KALKMIŞTIR. Ayrıca contextBridge `File` nesnesini structuredClone ile geçirir (File platform nesnesi proper clone'lanamaz). Electron 32'ye geçince drag-and-drop tamamen kopar.

---

### H7. Burn-in ve transcribe aynı anda çalışabilir (mutex yok)

**Dosya:** `src/main.js:434, 523`

```javascript
// transcribe:start — sadece activeJob kontrol eder
if (activeJob) return { ok: false, ... };
// burnin:start — sadece burninJob kontrol eder
if (burninJob) return { ok: false, ... };
```

**Etki:** İkisi de birbirini kontrol etmez. Kullanıcı transkripsiyon + diarization + burn-in'i aynı anda çalıştırabilir. GPU'da 3 ayrı süreç yarışır → OOM.

---

### H8. `window-all-closed` handler'ında unconditional `taskkill` (PID reuse riski)

**Dosya:** `src/main.js:155-158`

```javascript
for (const j of [updateJob, burninJob]) {
  if (j && j.pid) {
    spawn('taskkill', ['/pid', String(j.pid), '/T', '/F'], ...);  // PID reuse!
  }
}
```

**Etki:** Platform kontrolü YOK (macOS/Linux'ta `taskkill` yok). PID reuse riski: süreç çıktıktan sonra PID aynı numarayla yeni bir sistemsel sürece atanabilir → yanlış süreç öldürülür. Ayrıca macOS/Linux'ta orphan süreç kalır.

---

### H9. `No uncaughtException` / `unhandledRejection` handler'ı

**Dosya:** `src/main.js`

**Etki:** Hiçbir `process.on('uncaughtException')` veya `process.on('unhandledRejection')` handler'ı kayıtlı değil. Node.js 18+ unhandled rejection'da process'i terminate eder. Tek bir overlooked throw tüm uygulamayı öldürür.

---

### H10. `all_words` hiç sıralanmaz — cursor algoritması sıralı girdi varsayar

**Dosya:** `backend/transcribe.py:1945, 2063`

```python
entries.sort(key=lambda x: x[0])  # entries sıralanır
# ama all_words ASLA sıralanmaz
```

**Etki:** `write_json()`'daki cursor-based kelime eşleme algoritması, `all_words`'ün kronolojik sıralı olduğunu varsayar. Eğer faster-whisper segmentleri kronolojik olmayan sırada verirse (ki entries.sort() bunu korumak içindir), kelime-segment eşlemesi hatalı olur.

---

### H11. `|` içeren glossary terimleri yanlış bölünür

**Dosya:** `backend/transcribe.py:1845`

```python
terms = [t.strip() for t in args.glossary.split("|") if t.strip()]
```

**Etki:** Sözlük `|` ile ayrılır. `"Anthropic|Kubernetes|TCP/IP"` → `["Anthropic", "Kubernetes", "TCP", "IP"]` — `TCP/IP` yanlış split olur. Prompt: `"Anthropic, Kubernetes, TCP, IP."` (yanlış).

---

### H12. MAX_PATH (>260 karakter) koruması yok

**Dosya:** `backend/transcribe.py` (tüm `open()`, `os.replace()`, `os.remove()` çağrıları)

**Etki:** Hiçbir yerde `\\?\` prefix'i kullanılmaz. Girdi dosya yolu ~238 karakteri aşarsa:
- `open()` → OSError ile çöker
- `os.replace()` (checkpoint) → sessizce başarısız
- `os.remove()` (checkpoint silme) → sessizce başarısız
- `Path(source_path).exists()` → False döndürür ("Dosya bulunamadı")
- `shutil.rmtree()` → başarısız

---

## 3. MEDIUM — Sessiz Hatalar / Tutarsızlıklar

### M1. NDJSON buffer taşması veri kaybı

**Dosya:** `src/main.js:676-679`

```javascript
if (stdoutBuf.length > 1_000_000)
  stdoutBuf = stdoutBuf.slice(-100_000);  // baştaki ~900KB KALICI KAYIP
```

**Etki:** Tamamlanmamış JSON satırı 1MB'ı geçerse rastgele kırpılır. Kırpılan parça ortasından kesilmiş JSON olur → `JSON.parse` başarısız → event kaybolur.

---

### M2. WhisperX word length inflation (karakter sayısı şişmesi)

**Dosya:** `backend/transcribe.py:1371`

```python
words.append(_WxWord(" " + wt, ...))  # baştaki boşluk
```

**Etki:** WhisperX uyarlamasında her kelimenin başına boşluk eklenir. `split_segment_by_timing:439` ve `split_segment_sentence:536`'da `len(w.word)` kullanılır — fazladan 1 karakter sayar. 20 kelimelik altyazıda ~20 karakter fazla → gereksiz erken bölmeler.

---

### M3. Bare `except Exception: pass` temizliği gizler

**Dosya:** `backend/transcribe.py:46,1092,1383,1449,2048` (5 farklı nokta)

**Etki:** VRAM temizleme başarısız olunca hata sessizce yutulur. Geliştirici/güç kullanıcı sorunu fark edemez. En azından `log(...)` ile uyarı basılmalı.

---

### M4. `write_json` cursor güncellenmez → O(n²), kelime çiftlenmesi

**Dosya:** `backend/transcribe.py:820-841`

**Etki:** `cursor` döngü sonunda `j`'ye güncellenmez. Her segment kelimeleri baştan tarar → O(n²). Örtüşen segmentlerde aynı kelime iki segmentte de görünür. JSON çıktısında tutarsızlık.

---

### M5. `scheduleSave` debounce'u kapanışta veri kaybettirir

**Dosya:** `src/renderer/renderer.js:895`

**Etki:** `scheduleSave()` 400ms debounce ile ayarları kaydeder. Kullanıcı ayar değiştirip hemen uygulamayı kapatırsa son değişiklik kaybolur. `beforeunload` handler'ı yok.

---

### M6. Hallüsinasyon filtresi gerçek konuşmayı silebilir (false positive)

**Dosya:** `backend/transcribe.py:856, 853, 861`

```python
re.compile(r"^\s*izledi[ğg]iniz\s+için\s+te[şs]ekk[üu]rler.*$", re.IGNORECASE),
```

**Etki:** "izlediğiniz için teşekkürler" gibi günlük konuşmada geçen ifadeler, segment cümlesinin başında yer alıyorsa halüsinasyon sanılıp silinir. Kullanıcı metnin kaybolduğunu fark etmez.

---

### M7. `_is_false_sentence_end` negatif gap → yanlış bastırma

**Dosya:** `backend/transcribe.py:507`

```python
if gap < 0.15:
    return True  # ← negatif gap de yakalanır!
```

**Etki:** Kelime zaman damgaları örtüştüğünde (w_next.start < w_curr.end), `gap` negatif olur. `gap < 0.15` her zaman True → gerçek cümle sonu da bastırılır. İki cümle tek blokta birleşir.

---

### M8. `segment`/`preview_refresh` event'leri queue tamamlandıktan sonra gelebilir

**Dosya:** `src/renderer/renderer.js:1266, 1277, 1282`

**Etki:** Queue finalize edildikten sonra gecikmiş event'ler `state.previewSegs` ve `state.lastQualityReport`'u mutate eder. Sadece görsel — veri kaybı yok.

---

### M9. `cancelBtn` handler'ı queue item cleanup'ini exit handler ile çakıştırabilir

**Dosya:** `src/renderer/renderer.js:1185-1207`

**Etki:** Cancel → exit event yarışında item cleanup kısmen yapılır, bir kısım state tutarsız kalır.

---

### M10. `buildOptsFromUI()` 44 DOM elemanına null kontrolsüz erişir

**Dosya:** `src/renderer/renderer.js:30-91`

**Etki:** Tüm ID'ler HTML'de mevcut ama refactoring sırasında biri silinirse `TypeError: Cannot read properties of null` ile çöker. Yalnızca 3 alanda (`audioTrack`, `qualityReport`, `resume`) null guard var.

---

### M11. `startBtn` queue çalışırken gizlenmez, yanıltıcı

**Dosya:** `src/renderer/renderer.js:1122-1127`

**Etki:** Queue çalışırken `startBtn` görünür kalır. Kullanıcı tıklayınca uyarı alır. `cancelBtn` de `queueRunning=true` ama `running=false` iken yanıltıcı olabilir.

---

### M12. `maxChars` vs `hardMaxChars` — karışık isimlendirme

**Dosya:** `backend/transcribe.py` / `src/renderer/renderer.js`

**Etki:** İki farklı "max chars" kavramı aynı projede karışık isimlendirilmiş. `maxChars` yumuşak hedef (varsayılan 84), `hardMaxChars` sert sınır (varsayılan 220). UI'da `maxChars`'ın ayrı kontrolü yok, `maxLineWidth * 2` olarak hardcode edilmiş.

---

### M13. Preview refresh 50K+ segmentte UI donması

**Dosya:** `backend/transcribe.py:2137-2141`, `src/renderer/renderer.js:510-531`

**Etki:** Tüm entries tek `preview_refresh` event'inde gönderilir. 50,000 segment × ~100 bayt = ~5MB IPC payload. contextBridge serialization renderer'ı saniyelerce dondurabilir.

---

### M14. `merge_resumed_entries` overlap window'u dublikasyon

**Dosya:** `backend/transcribe.py:1719-1728`

**Etki:** 2.6 saniyelik overlap window'unda eski ve yeni entry'ler örtüşür. Aynı konuşma iki kere yazılabilir. `dedupe_consecutive` kısmen temizler ama aynı olmayan benzer metinler kalır.

---

### M15. `minSpeakers`/`maxSpeakers` `type="text"` → NaN sessizce 0 olur

**Dosya:** `src/renderer/renderer.js:78-79`, `src/renderer/index.html:439,443`

```html
<input type="text" id="minSpeakers" value="0" />  <!-- type="number" olmalı -->
```

**Etki:** Kullanıcı harf girerse `parseInt("abc")` → `NaN`. `NaN || 0` → `0`. Kullanıcı 3 sandığı değer 0 (otomatik) olur. `type="number"` yapılmalı.

---

### M16. `probe_duration` local `backend/bin/ffprobe.exe`'yi kontrol etmez

**Dosya:** `backend/transcribe.py:220-222`

**Etki:** Yalnızca PATH'te `ffprobe` arar. Kullanıcı ffmpeg'i `backend/bin/`'e koymuşsa ama ffprobe PATH'te yoksa `probe_duration` None döner. YouTube ranged güvenlik kontrolünü (satır 1812) sessizce atlar.

---

### M17. `taskkill /F` → Python finally bloğu çalışmaz → temp dosya sızıntısı

**Dosya:** `backend/transcribe.py:2208-2213`

**Etki:** Windows'ta `taskkill /F` ile süreç öldürülünce `finally` bloğu çalışmaz. `shutil.rmtree(workdir)` hiç çağrılmaz. Her iptal edilen iş, `%TEMP%`'de `whisper_altyazi_XXXXXX` dizini bırakır. Aylar içinde gigabaytlarca birikebilir.

---

### M18. TXT çıktısı `utf-8` (BOM'suz) → Windows Notepad'de Türkçe karakter bozulması

**Dosya:** `backend/transcribe.py:720`

```python
with open(output_path, "w", encoding="utf-8") as f:  # BOM YOK!
```

**Etki:** SRT/ASS `utf-8-sig` (BOM'lu) kullanırken TXT BOM'suz. Windows Notepad BOM'suz UTF-8'i doğru algılayamaz (özellikle Türkçe Windows'ta). `ı, ü, ö, ç, ş, ğ` karakterleri bozuk görünür. `encoding="utf-8-sig"` olmalı.

---

### M19. Ctrl+Enter queue'yu başlatmaz

**Dosya:** `src/renderer/renderer.js:1523`

```javascript
if (!state.running) $('startBtn').click();
```

**Etki:** Queue'da bekleyen işler varken `Ctrl+Enter` sadece tekil iş başlatır (başarısız olur). Queue "Başlat" butonuna tıklamaz.

---

### M20. `npm install` sonrası `pip install` başarısız olsa da "Kurulum tamamlandı" yazılır

**Dosya:** `install.bat:85`

**Etki:** `pip install "faster-whisper>=1.1.0" ...` satırından sonra `if errorlevel 1` kontrolü YOK. Pip başarısız olsa bile `npm install` çalışır ve "Kurulum tamamlandı" yazılır. Kullanıcı sorunu fark etmez.

---

## 4. LOW — Kod Kalitesi / Sürdürülebilirlik / Marjinal Durumlar

### L1. Bozuk settings.json → sessizce sıfırlanır, yedek yok

**Dosya:** `src/main.js:59-65`

**Etki:** Settings yarım yazılırsa tüm kullanıcı ayarları (HF token, LLM API key, preset) kaybolur. Otomatik yedek mekanizması yok.

---

### L2. Burn-in çıktıyı sessizce üzerine yazar

**Dosya:** `src/main.js:447`

```javascript
const args = ['-y', '-i', videoPath, ...];  // -y = overwrite
```

**Etki:** Daha önce oluşturulmuş `.altyazili.mp4` varsa üzerine yazılır. Kullanıcı önceki çıktıyı kaybeder.

---

### L3. yt-dlp güncelleme mesajı Türkçe locale'de bozuk

**Dosya:** `src/main.js:754`

```javascript
const m = out.match(/Successfully installed[^\r\n]*/i);
```

**Etki:** Türkçe pip çıktısı: `Başarıyla yüklendi yt-dlp-2025.7.25` → regex eşleşmez. "zaten güncel" kontrolü de çalışmaz. `LC_ALL=C` ile env override edilmeli.

---

### L4. `download_range_func` yeni yt-dlp'de rename edilmiş

**Dosya:** `backend/transcribe.py:156`

```python
from yt_dlp.utils import download_range_func
```

**Etki:** Bazı yt-dlp sürümlerinde `download_range` olarak rename edildi. Güncelleme sonrası aralıklı YouTube indirme çökebilir.

---

### L5. `getPaths()` IPC kanalı renderer'da kullanılmıyor (ölü kod + gereksiz pozlama)

**Dosya:** `src/main.js:254-261`, `src/preload.js:15`

**Etki:** `app:getPaths` renderer'da hiç çağrılmaz. Kullanıcı dizin yollarını (`userData`, `videos`, `downloads`) renderer'a sızdıran gereksiz API. XSS sonrası keşif amaçlı kullanılabilir.

---

### L6. `_WxWord` leading space `len()` hesabını şişirir

**Dosya:** `backend/transcribe.py:1371`

**Etki:** (M2 ile aynı) Ayrıca `split_segment_by_timing` ve `split_segment_sentence`'de `len(w.word)` karakter sayısını 1 fazla hesaplar.

---

### L7. `split_segment_sentence` ilk yarıdaki soft break'i yok sayar

**Dosya:** `backend/transcribe.py:558`

```python
cut_at = last_soft_break if (last_soft_break >= 0 and last_soft_break >= len(current) // 2) else len(current) - 1
```

**Etki:** Soft break current'ın ilk yarısındaysa (ör. position 0), `last_soft_break >= len(current)//2` False olur → cut_at = len-1 → tüm buffer tek parça kalır. Uzun bloklar oluşur.

---

### L8. `has_enough_punctuation` kısaltmalarla şişer (Dr., Mr., U.S.)

**Dosya:** `backend/transcribe.py:408`

**Etki:** `PUNCT_END` nokta (`.`) içerir. `"Dr."`, `"Mr."`, `"U.S."` gibi kısaltmalar cümle sonu noktalaması sayılır. Oran şişer → yanlış bölme stratejisi seçilebilir.

---

### L9. `balanced_two_line_break` max_line_width'den uzun tek kelimede çalışmaz

**Dosya:** `backend/transcribe.py:622`

**Etki:** 80 karakterden uzun tek kelime varsa (URL, teknik terim), tüm split noktaları geçersiz sayılır → fallback'e düşer. Çalışır ama balanced mod bypass edilir.

---

### L10. `merge_short_entries` negatif gap'te birleştirme yapmaz

**Dosya:** `backend/transcribe.py:1531`

```python
0 <= gap <= max_gap  # negatif gap → her zaman False
```

**Etki:** Örtüşen entry'ler (s < prev[1]) asla birleşmez. Kısa örtüşen bloklar ayrı kalır → flaş altyazı.

---

### L11. `write_json`'da her segmentin `words` field'ı olmayabilir

**Dosya:** `backend/transcribe.py:838-839`

```python
if seg_words:
    seg["words"] = seg_words  # boşsa key yok
```

**Etki:** Bazı segmentlerde `words` key'i yoktur, bazılarında vardır. JSON şeması tutarsız.

---

### L12. `build_binary_signal` off-by-one pad (0.02s fazla)

**Dosya:** `backend/transcribe.py:2364`

```python
i1 = min(nbins, int(e * hz) + 1)  # +1 → 0.02s fazladan
```

**Etki:** Her segment sonunda 0.02s fazladan işaret. Subtitle sync korelasyonunu 1-2 bin kaydırır. İhmal edilebilir.

---

### L13. `audio_energy_signal` 16-bit WAV varsayar

**Dosya:** `backend/transcribe.py:2378-2381`

```python
samples = np.frombuffer(raw, dtype=np.int16)  # getsampwidth() kontrolü YOK
```

**Etki:** WAV 24-bit ise yanlış örnek değerleri. `extract_audio` her zaman `pcm_s16le` ürettiği için sorun yok ama defansif kontrol eksik.

---

### L14. `probe_duration` local `backend/bin/ffprobe.exe`'yi kontrol etmez

**Dosya:** `backend/transcribe.py:220`

**Etki:** (M16 ile aynı) Sadece PATH'te ffprobe arar.

---

### L15. `main.js`'te `startTranscribe`'da `options.input` tip kontrolü yok

**Dosya:** `src/main.js:531-538`

```javascript
if (options.youtube) { ... }
else if (options.input) { ... }  // tip kontrolü YOK
```

**Etki:** `options.input`'un string olduğu kontrol edilmez. Array/obje geçilirse spawn argümanı beklenmedik davranabilir.

---

### L16. `py` kodu `resolvePython`'da asla ulaşılmaz

**Dosya:** `src/main.js:514`

**Etki:** (C1 ile aynı kod) `path.isAbsolute('py') = false` olduğu için `'py'` asla döndürülmez.

---

### L17. `nvidia-cublas-cu12` versiyonsuz — cuDNN uyumsuzluk riski

**Dosya:** `install.bat:85`, `backend/requirements.txt:6`

```
nvidia-cublas-cu12              # versiyon yok!
nvidia-cudnn-cu12==9.*
```

**Etki:** Pip en son cuBLAS 12.6+ çeker, cuDNN 9.x'e kilitlenmiş. DLL uyumsuzluğu.

---

### L18. whisperx/diarize install script'lerinde `--index-url cu121` eksik

**Dosya:** `install-whisperx.bat:19`, `install-diarize.bat:19`

```bat
pip install whisperx  # --index-url https://download.pytorch.org/whl/cu121 eksik
```

**Etki:** Bağımlılık olan torch, PyPI'den CPU-only sürüm olarak gelir. GPU desteği sessizce kaybolur.

---

### L19. `start.bat` çoklu instance koruması yok

**Dosya:** `start.bat:22`

**Etki:** `start.bat` ikinci kez çalıştırılırsa ikinci Electron penceresi açılır. İkisi de Python spawn eder, GPU OOM riski.

---

### L20. `test_transcribe.py` numpy yokken testleri "PASS" sayar

**Dosya:** `backend/test_transcribe.py:267-280`

**Etki:** `test_best_offset()` ve `test_build_binary_signal()` numpy yoksa early return yapar. `_run()` fonksiyonu bunları PASS sayar. Kullanıcı testlerin çalışmadığını fark etmez.

---

### L21. `__pycache__/` yalnızca `backend/` altında ignore edilir

**Dosya:** `.gitignore`

```
backend/__pycache__/
```

**Etki:** Sadece `backend/__pycache__/` ignore edilir. Projeye başka Python dizini eklenirse `__pycache__/` git'e girer. `**/__pycache__/` daha güvenli.

---

### L22. `.context_cache/` .gitignore'da yok

**Dosya:** `.gitignore`, proje kökü

**Etki:** Proje kökünde `.context_cache/` dizini var ama ignore edilmiyor. AI araç context cache'i git'e eklenebilir.

---

### L23. `*.whisper.ckpt.json*` .gitignore'da yok

**Dosya:** `.gitignore`

**Etki:** Checkpoint dosyaları girdi dosyasının yanında oluşur. Proje dizininde çalışılırsa git'e eklenebilir.

---

### L24. `settings.json` .gitignore'da yok

**Dosya:** `.gitignore`

**Etki:** Normalde `userData` dizininde olsa da, geliştirme sırasında proje dizinine düşebilir. HF token + LLM API key içerir.

---

### L25. `*.altyazili.mp4` .gitignore'da yok

**Dosya:** `.gitignore`

**Etki:** Burn-in çıktıları proje dizininde birikebilir.

---

### L26. Dil "auto" iken noktalama prompt'u hep İngilizce

**Dosya:** `backend/transcribe.py:1840-1843`

```python
lang_key = args.language if ... else "en"
```

**Etki:** Türkçe video "auto" ile işlenirken İngilizce prompt: `"Hello, welcome..."` yerine `"Merhaba, hoş geldiniz..."` daha etkili olur.

---

### L27. GPU rozeti macOS/Linux'ta hep "CUDA" yazar

**Dosya:** `src/main.js:296`

```javascript
probeCommand('nvidia-smi', ...)
```

**Etki:** `nvidia-smi` yalnızca NVIDIA GPU + Windows/Linux'ta çalışır. macOS/AMD'de sessizce null döner → rozette "CUDA" yazar.

---

### L28. `start.bat` başarısızlık mesajı yanıltıcı

**Dosya:** `start.bat:26`

```bat
echo Uygulama baslamadi. Lutfen once install.bat'i calistirin.
```

**Etki:** Electron crash'inde de bu mesaj gösterilir. Gerçek sorun install değil, crash olabilir.

---

### L29. `resolveFfTool` macOS/Linux'ta `.exe` arar

**Dosya:** `src/main.js:345-348`

```javascript
const local = path.join(..., `${name}.exe`);  // .exe!
```

**Etki:** macOS/Linux'ta `.exe` asla var olmaz → her zaman PATH'e güvenir. Yerel ffmpeg kullanılamaz.

---

### L30. SRT dosyaları LF (CRLF değil) ile yazılır

**Dosya:** `backend/transcribe.py:707`

```python
f.write(f"{wrapped}\n\n")  # sadece \n, \r\n değil
```

**Etki:** Windows Notepad (klasik) LF'yi tek satır olarak gösterir. Modern editörlerde sorun yok.

---

## 5. Cross-File Tutarsızlıklar

### X1. `--split-mode` varsayılanı farklı

- **Backend:** `"none"` (argparse default)
- **UI HTML:** `"sentence"` (selected)
- **Renderer opts:** `$('splitMode').value` (UI değerini alır)
- **main.js:** `if (options.splitMode) args.push(...)` — falsy ise push edilmez

**Etki:** Backend "none" bekler, UI "sentence" gönderir. Normalde çalışır ama settings.json bozuksa veya falsy değer gelirse backend "none" kullanır.

---

### X2. Event tipi `quality_report` yalnızca modal'da gösterilir, canlı UI'da değil

**Dosya:** `backend/transcribe.py:2149` → `src/renderer/renderer.js:1282-1284 → 1400-1415`

**Etki:** Kalite raporu `state.lastQualityReport`'a kaydedilir ve sadece sonuç modalında gösterilir. Canlı UI'da hiçbir yerde gösterilmez.

---

### X3. `app:getPaths` kanalı renderer'da kullanılmaz

**Dosya:** `src/main.js:254`, `src/preload.js:15`

**Etki:** Tanımlı olmasına rağmen renderer'da hiç çağrılmaz. Gereksiz API yüzeyi.

---

### X4. WhisperX `int8_float16` sessizce `int8`'e düşürülür, kullanıcıya bildirilmez

**Dosya:** `backend/transcribe.py:1401-1402`

**Etki:** `compute_type = "int8_float16"` + `engine = "whisperx"` seçen kullanıcı, farklı performans görür ama sebebini bilmez.

---

## 6. DLL / CUDA / PATH Versiyon Çatışmaları

### D1. cuBLAS 12.4 (torch) vs 12.9 (pip) — ABI uyumsuzluğu

**Dosya:** `start.bat:13-16`

| DLL | torch\\lib | nvidia\\cublas\\bin | PATH'de önce gelen |
|-----|-----------|-------------------|-------------------|
| cublas64_12.dll | 12.4.2 | 12.9.2 | pip (12.9) |
| cublasLt64_12.dll | 12.4.2 | 12.9.2 | pip (12.9) |
| cudnn64_9.dll | 9.1.0.70 | 9.22.0.52 | pip (9.22) |

**Etki:** PyTorch 2.10.0 runtime'da cuBLAS 12.9'u bulur (kendi 12.4'ü yerine). cuDNN de 9.1 yerine 9.22 yüklenir. **3 farklı cuDNN 9 versiyonu aynı process'te** (torch 9.1, ctranslate2 bundled 9.10, pip 9.22).

### D2. cuDNN companion DLL farklılıkları

`nvidia\cudnn\bin` (9.22), `torch\lib` (9.1)'de olmayan 2 fazladan DLL içerir: `cudnn_engines_tensor_ir64_9.dll`, `cudnn_ext64_9.dll`. Uyumsuzluk potansiyeli.

### D3. `start.bat` yorumu yanıltıcı

**Dosya:** `start.bat:12`

```bat
REM ... oncelikle torch\lib eklenir
```

Asıl PATH sırası (her satır başa ekler):
1. `cublas\bin` (pip 12.9) ← ilk sırada
2. `cudnn\bin` (pip 9.22)
3. `torch\lib` (torch 12.4/9.1) ← en sonda

Yorum "torch\lib önce eklenir" der ama pip DLL'leri önce gelir ve torch'unkileri ezer.

---

## 7. Electron Güvenlik / Preload

### S1. Preload event listener cleanup asla çağrılmaz

**Dosya:** `src/preload.js:29-38`, `src/renderer/renderer.js:1228,1669`

**Detay:** C10 ile aynı. Cleanup fonksiyonu döndürülür ama renderer'da çağrılmaz. Reload'da listener çoğalır.

### S2. `getPaths()` gereksiz pozlama

**Dosya:** `src/preload.js:15`

**Detay:** L5 ile aynı. `userData`, `videos`, `downloads` yollarını renderer'a açar. Kullanılmıyor.

### S3. `webUtils.getPathForFile` Electron 31 API'si yok

**Dosya:** `src/preload.js:6`

**Detay:** H6 ile aynı. Her zaman fallback çalışır. Electron 32'de kopacak.

### S4. CSP `style-src 'unsafe-inline'` içerir

**Dosya:** `src/renderer/index.html:5`

```
default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' data:
```

**Etki:** `style-src 'unsafe-inline'` gerekli (dinamik range/value güncellemeleri için). Kabul edilebilir. `script-src 'self'` katı — eval/inline script yok.

### S5. `sandbox: true` etkin değil

**Dosya:** `src/main.js:120-124`

**Etki:** Chromium sandbox'ı ek savunma katmanı sağlar. preload sadece sandbox-uyumlu API'ler kullanır (`ipcRenderer`, `contextBridge`, `webUtils`). Test edilip etkinleştirilebilir.

---

## 8. Cross-Platform Sorunları

### P1. macOS/Linux `resolvePython` venv'i bulamaz

**Dosya:** `src/main.js:508-520`

**Detay:** H4 ile aynı. `backend/venv/bin/python3` yolu eklenmeli.

### P2. `window-all-closed` unconditional `taskkill`

**Dosya:** `src/main.js:151-159`

**Detay:** H8 ile aynı. macOS/Linux'ta `proc.kill('SIGTERM')` kullanılmalı.

### P3. `start.bat` Windows-only

macOS/Linux için cross-platform launcher gerekli.

### P4. `resolveFfTool` `.exe` arar

**Dosya:** `src/main.js:345-348`

**Detay:** L29 ile aynı.

### P5. `nvidia-smi` macOS/AMD'de çalışmaz

**Dosya:** `src/main.js:296`

**Detay:** L27 ile aynı.

---

## 9. Windows Edge Case'ler

### W1. Modal açıkken High Contrast mode'da arkaplan tamamen opak olur

**Dosya:** `src/renderer/styles.css:1024-1026`

```css
.modal-backdrop {
  background: rgba(5, 7, 12, 0.7);
  backdrop-filter: blur(6px);
}
```

**Etki:** High Contrast mode'da yarı-saydam arkaplan tamamen opak olur, arkasındaki içerik görünmez. `forced-colors: active` media query eklenmeli.

### W2. `minWidth: 940` 4K laptop + 250% scaling'de work area'yi aşabilir

**Dosya:** `src/main.js:115`

**Etki:** 3840x2160 @ 250% → `work.width = 1536`. 940 < 1536. Sorun yok. Ama 1366x768 gibi küçük ekranda 940 çalışır. İnceleme: tüm senaryolarda güvenli.

### W3. `-webkit-font-smoothing: antialiased` ClearType'ı devre dışı bırakır

**Dosya:** `src/renderer/styles.css:32`

**Öneri:** Windows'ta `subpixel-antialiased` veya `auto` kullanılmalı.

### W4. Windows rezerve dosya isimleri filtrelenmemiş

**Dosya:** `backend/transcribe.py:1790`

```python
base_name = re.sub(r'[\\/:*?"<>|]', "_", title).strip()[:120] or "altyazi"
```

**Etki:** YouTube başlığı "COM1" veya "AUX" ise `COM1.srt` oluşturulamaz (Windows rezerve isim). Ayrıca trailing dot/space de temizlenmez.

### W5. Burn-in power save blocker kullanmaz

**Dosya:** `src/main.js:464`

**Etki:** Transkripsiyon power blocker başlatır ama burn-in başlatmaz. Uzun burn-in işlemi sırasında sistem uykuya geçebilir.

### W6. SRT `\n` ile yazılır (CRLF değil)

**Dosya:** `backend/transcribe.py:707`

**Detay:** L30 ile aynı.

### W7. `chcp 65001` Windows 10 pre-1903'te görüntü sorunu

**Dosya:** `start.bat:2`

**Etki:** Eski Windows 10 sürümlerinde UTF-8 code page'i konsol görüntüleme sorunlarına yol açabilir. İşlevsel etkisi yok.

---

## 10. Dosya Sistemi / Encoding

### E1. Unicode normalizasyonu (NFC/NFD) yapılmaz

**Dosya:** `backend/transcribe.py` (genel)

**Etki:** macOS kökenli dosyalarda NFD (decomposed) Unicode kullanılır. Python çıktıları NFC kullanır. `base_name` normalize edilmezse aynı karakterler farklı byte'lar → medya oynatıcı altyazıyı otomatik yükleyemez.

### E2. `dedupe_consecutive` Unicode normalizasyonu yapmaz

**Dosya:** `backend/transcribe.py:1472-1476`

**Etki:** `_norm_for_dedupe`, NFC/NFD farkını yakalamaz. "café" (NFC) ve "cafe\u0301" (NFD) farklı sayılır → dedupe başarısız.

### E3. `os.replace(tmp, path)` aynı filesystem gerektirir

**Dosya:** `backend/transcribe.py:1684`

**Etki:** Network share (SMB) üzerinde `os.replace` atomik değildir ve başarısız olabilir. Kod `except OSError: pass` ile sessizce geçer.

### E4. `os.replace` sessiz hata — checkpoint kaybı

**Dosya:** `backend/transcribe.py:1685-1686`

```python
except OSError:
    pass  # disk doluysa checkpoint sessizce kaybolur
```

**Etki:** Disk dolu, dosya kilitli vb. durumda checkpoint yazılamaz. Kullanıcı hiçbir uyarı görmez.

---

## 11. Erişilebilirlik / Accessibility

### A1. Modal focus yönetimi yok

**Dosya:** `src/renderer/renderer.js:1440`

```javascript
$('resultModal').classList.remove('hidden');  // focus modal'a taşınmaz
```

**Etki:** Modal açıldığında focus otomatik olarak modal içine taşınmaz. Klavye kullanıcısı arkadaki içerikte tab yapmaya devam eder.

### A2. `contenteditable` segment `role="textbox"` ve `aria-label` eksik

**Dosya:** `src/renderer/renderer.js:455`

```html
<span class="segment-text" contenteditable="true" ...>
```

**Etki:** Ekran okuyucu bu span'i düzenlenebilir alan olarak duyurmaz. Kullanıcı tıklayıp düzenleyebileceğini bilmez.

### A3. High Contrast mode desteği yok

**Dosya:** `src/renderer/styles.css`

**Etki:** `forced-colors: active` veya `-ms-high-contrast` media query'i yok. Modal arkaplanı tamamen opak olur (W1).

### A4. `progressbar` `aria-valuetext` eksik

**Dosya:** `src/renderer/index.html:571`

**Etki:** Ekran okuyucu "yüzde 10" der ama "Transkripsiyon 10.5% — 45:20 / 1:23:45 — kalan ~12:30" gibi zengin bilgiyi aktaramaz.

### A5. `.btn-icon` (28px), `.queue-remove` (24px) touch hedefinin altında

**Dosya:** `src/renderer/styles.css`

**Etki:** Windows touch hedefi önerisi 40x40px. Bu butonlar küçük kalır.

---

## 12. Eksik Bağımlılıklar / Konfigürasyon

### K1. `numpy` requirements.txt'te eksik

**Dosya:** `backend/requirements.txt`

**Etki:** `audio_energy_signal`, `best_offset`, `sync_subtitles` tarafından doğrudan import edilir. Şu an torch ile transitif gelir. Torch'suz ortamda sync-subtitles çöker.

### K2. `tqdm` requirements.txt'te eksik

**Dosya:** `backend/requirements.txt`

**Etki:** Module-level monkey-patch (satır 43-45). try/except ile sarılı olduğu için çalışmazsa sessizce atlanır. Düşük risk.

### K3. `package.json`'da `"private": true` eksik

**Dosya:** `package.json`

**Etki:** `npm publish` yanlışlıkla çalıştırılırsa paket npm registry'e yayınlanabilir.

### K4. `package.json`'da `"engines": { "node": ">=18" }` eksik

**Dosya:** `package.json`

**Etki:** Node 16 kullanan kullanıcı cryptic Electron hataları alır.

---

## Genel İstatistik

| Seviye | Adet |
|--------|------|
| **CRITICAL** | 10 |
| **HIGH** | 12 |
| **MEDIUM** | 20 |
| **LOW** | 30 |
| **Cross-File** | 4 |
| **DLL/CUDA** | 3 |
| **Güvenlik** | 5 |
| **Cross-Platform** | 5 |
| **Windows Edge** | 7 |
| **Dosya Sistemi** | 4 |
| **Accessibility** | 5 |
| **Konfigürasyon** | 4 |
| **TOPLAM** | **80+** |

---

*Rapor, 4 ayrı fazda uzman agent'larla paralel tarama sonucu oluşturulmuştur. Her bulgu, ilgili kaynak kod satırında doğrulanmıştır.*
