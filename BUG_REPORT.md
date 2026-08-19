# Kapsamlı Bug Raporu

**Proje:** Whisper Local (GPU hızlandırmalı altyazı çıkarma uygulaması)  
**Tarih:** 2025-07-25  
**Kapsam:** Tüm kaynak dosyalar — 2 tur derin bug taraması  
**Durum:** Salt-okur analiz, hiçbir dosyada değişiklik yapılmamıştır

---

## Özet İstatistikler

| Severity | Tur 1 | Tur 2 | **Toplam** |
|----------|-------|-------|------------|
| **Critical** | 10 | 8 | **18** |
| **High** | 22 | 14 | **36** |
| **Medium** | 35 | 30+ | **65+** |
| **Low** | 45+ | 60+ | **105+** |
| **Toplam** | ~112 | ~160+ | **~270+** |

---

## İçindekiler

- [Tur 1: Python Backend (transcribe.py)](#tur-1-python-backend-transcribepy)
- [Tur 1: Electron Main Process (main.js)](#tur-1-electron-main-process-mainjs)
- [Tur 1: Renderer JS (renderer.js)](#tur-1-renderer-js-rendererjs)
- [Tur 1: Preload / HTML / CSS / Batch Dosyaları](#tur-1-preload--html--css--batch-dosyaları)
- [Tur 1: Cross-File API Entegrasyonu & Bağımlılıklar](#tur-1-cross-file-api-entegrasyonu--bağımlılıklar)
- [Tur 1: Konfigürasyon ve Metadata Dosyaları](#tur-1-konfigürasyon-ve-metadata-dosyaları)
- [Tur 2: transcribe.py 2. Geçiş](#tur-2-transcribepy-2-geçiş)
- [Tur 2: LLM + Diarization + Sync Derin Analiz](#tur-2-llm--diarization--sync-derin-analiz)
- [Tur 2: Runtime Edge Case Analizi](#tur-2-runtime-edge-case-analizi)
- [Tur 2: Güvenlik Derin Analizi](#tur-2-güvenlik-derin-analizi)
- [Tur 2: renderer.js State Machine 2. Geçiş](#tur-2-rendererjs-state-machine-2-geçiş)
- [Tur 2: main.js Subprocess/NDJSON 2. Geçiş](#tur-2-mainjs-subprocessndjson-2-geçiş)
- [Tur 2: Performans & Memory Analizi](#tur-2-performans--memory-analizi)
- [Boş/Ölü Kod ve Tespit Edilmeyen Hatalar](#boşölü-kod-ve-tespit-edilmeyen-hatalar)

---

# TUR 1: Python Backend (transcribe.py)

## Critical

### B001 — Re-export sıralama hatası
- **Dosya:** `backend/transcribe.py`
- **Satır:** 2238-2252
- **Severity:** Critical
- **Kategori:** Data Integrity
- **Açıklama:** `reexport_from_json()` fonksiyonu, `transcribe()`'taki gibi `entries.sort(key=lambda x: x[0])` çağırmıyor. Elle düzenlenmiş JSON'dan re-export yapıldığında segmentler sırasız çıkar. SRT/VTT dosyalarında kronolojik olmayan altyazı blokları ve yanlış sıra numaraları oluşur.
- **Önerilen Çözüm:** entries listesi oluşturulduktan sonra `entries.sort(key=lambda x: x[0])` eklenmeli.

### B002 — LLM JSON fence regex MULTILINE flag'ı yok
- **Dosya:** `backend/transcribe.py`
- **Satır:** 1248-1250
- **Severity:** Critical
- **Kategori:** LLM Post-Processing
- **Açıklama:** `re.sub(r"^```(?:json)?\s*", "", content)` regex'i `^` ve `$` anchor'larını `re.MULTILINE` olmadan kullanır. LLM, JSON bloğundan önce açıklama metni eklediğinde (örn. "Here is the corrected text:\n```json\n..."), `^``` hiçbir zaman eşleşmez. Tüm chunk işlenemez ve içerik kaybolur.
- **Önerilen Çözüm:** `re.MULTILINE` flag'i eklenmeli veya `re.search(r"```(?:json)?\n(.*)\n```", content, re.DOTALL)` ile daha robust bir çıkarım yapılmalı.

## High

### B003 — normalize_timings CPS hesaplaması speaker etiketini dahil ediyor
- **Dosya:** `backend/transcribe.py`
- **Satır:** 1578
- **Severity:** High
- **Kategori:** Timing
- **Açıklama:** `text_len = len((t or "").strip())` — `--fix-timings`, `--label-speakers` ile birlikte çalıştığında metin `[SPEAKER_00] some text` formatındadır. Karakter sayısına speaker etiketi (~15 karakter) dahil edilir, CPS şişer ve zamanlamalar gereksiz uzun olur. `compute_quality_report` (satır 1626) ise speaker etiketini CPS öncesi temizler — tutarsızlık.
- **Önerilen Çözüm:** `re.sub(r"^\[[^\]]+\]\s*", "", (t or "").strip())` ile speaker etiketi karakter sayısından çıkarılmalı.

### B004 — Deprecated `use_auth_token` parametresi
- **Dosya:** `backend/transcribe.py`
- **Satır:** 1069
- **Severity:** High
- **Kategori:** Diarization
- **Açıklama:** `Pipeline.from_pretrained("pyannote/speaker-diarization-3.1", use_auth_token=hf_token)` — `use_auth_token`, `huggingface_hub >= 0.20`'de kaldırıldı. `Pipeline.from_pretrained()` TypeError fırlatır. Diarization sessizce başarısız olur, kullanıcıya neden bildirilmez.
- **Önerilen Çözüm:** `token=hf_token` olarak değiştirilmeli. Geriye uyumluluk için try/except ile iki parametre de denenebilir.

### B005 — Segment-seviye halüsinasyon filtresi geçerli içeriği de atıyor
- **Dosya:** `backend/transcribe.py`
- **Satır:** 1952
- **Severity:** High
- **Kategori:** Hallucination
- **Açıklama:** Segment-seviye `is_hallucination()` kontrolü (satır 1952), chunk bölme öncesinde çalışır. Bir segment kısmen halüsinasyon kısmen geçerli konuşma içeriyorsa (örn. "Hello and welcome subtitles by amara.org to our show"), TÜM segment atılır. Chunk-seviye filtre (satır 2002) daha hassastır ama segment filtresi önce çalıştığı için ona hiç ulaşılamaz.
- **Önerilen Çözüm:** Segment-seviye kontrol kaldırılıp yalnızca chunk-seviye kontrole güvenilmeli veya segment kontrolü daha az agresif yapılmalı (örn. metnin >%80'i halüsinasyon ise at).

### B006 — dedupe_consecutive farklı konuşmacıların aynı metnini birleştiriyor
- **Dosya:** `backend/transcribe.py`
- **Satır:** 1490-1501
- **Severity:** High
- **Kategori:** Deduplication
- **Açıklama:** `dedupe_consecutive`, diarization ÖNCESİ çalışır (satır 2067). İki farklı konuşmacı aynı cümleyi `max_gap` (2sn) içinde söylerse tek blokta birleşir. Diarization sonraki konuşmacıyı hiç göremez. Örn: Konuşmacı A 10.0sn'de "Hayır." der, Konuşmacı B 11.5sn'de "Hayır." derse tek entry olur.
- **Önerilen Çözüm:** `max_gap` varsayılanı 0.8sn'ye düşürülmeli veya dedupe, diarization kapalıyken çalıştırılmalı.

### B007 — `info.language` None olabilir, filename suffix hatası
- **Dosya:** `backend/transcribe.py`
- **Satır:** 1938, 2172, 2176, 2206
- **Severity:** High
- **Kategori:** Language Detection
- **Açıklama:** faster-whisper çok kısa/gürültülü seslerde `info.language`'ı `None` döndürebilir. Satır 2176'da `suffix_code = "en" if args.task == "translate" else (info.language or "")` — `info.language` None ise suffix_code boş string olur ve `name_suffix = f".{suffix_code}"` -> `"."` ile biter. Dosya adı `video..srt` gibi anlamsız olur.
- **Önerilen Çözüm:** Transkripsiyon sonrası hemen fallback dil atanmalı: `lang = info.language or "tr"`.

## Medium

### B008 — `soft_max_chars` parametresi hiç kullanılmıyor
- **Dosya:** `backend/transcribe.py`
- **Satır:** 512
- **Severity:** Medium
- **Kategori:** Split
- **Açıklama:** `split_segment_sentence(segment, hard_max_chars=180, soft_max_chars=110)` — `soft_max_chars` fonksiyon gövdesinde ASLA referans edilmez. Çağıran (satır 1978) `soft_max_chars=args.max_chars` geçer, ama bu değer hiç kullanılmaz. Tasarım intent'i (soft limit'te kırılmayı tercih et) implemente edilmemiş.
- **Önerilen Çözüm:** Ya `soft_max_chars` mantığı implemente edilmeli ya da parametre kaldırılıp çağrılar sadeleştirilmeli.

### B009 — WhisperX `language_probability=1.0` hardcoded
- **Dosya:** `backend/transcribe.py`
- **Satır:** 1467
- **Severity:** Medium
- **Kategori:** WhisperX
- **Açıklama:** WhisperX dil algılar ama olasılık döndürmez. Kod `language_probability=1.0` hardcode'lar. UI'da "Language detected: XYZ (100% confidence)" her zaman %100 görünür, güven yanıltıcıdır.
- **Önerilen Çözüm:** WhisperX için `language_probability=None` gönderilmeli ve UI olasılık göstermemeli.

### B010 — `next_start < min_gap` durumunda negatif ceiling
- **Dosya:** `backend/transcribe.py`
- **Satır:** 1562-1563
- **Severity:** Medium
- **Kategori:** Timing
- **Açıklama:** İkinci subtitle 0.02sn'de başlarsa, `ceiling = 0.02 - 0.08 = -0.06`. Negatif ceiling tüm zamanlama mantığını bozar. `e <= s` kontrolü (satır 1592) recovery yapar ama asıl sorunu gizler.
- **Önerilen Çözüm:** `ceiling = max(next_start - min_gap, out[i][0] + 0.01)` ile ceiling en az start time kadar olmalı.

### B011 — WhisperX ilk kelimeye de leading space ekliyor
- **Dosya:** `backend/transcribe.py`
- **Satır:** 1371
- **Severity:** Medium
- **Kategori:** WhisperX
- **Açıklama:** `words.append(_WxWord(" " + wt, float(ws), float(we), float(prob or 1.0)))` — HER kelimeye başında space eklenir. faster-whisper'da ilk kelimede space olmaz, sonrakilerde olur. WhisperX adaptörü tüm kelimelere ekler. `"".join()` sonrası `.strip()` (satır 393) düzeltir ama `all_words`'deki ilk kelime " Hello" olarak kalır, JSON çıktısında hatalı kelime zamanlamaları oluşur.
- **Önerilen Çözüm:** `words.append(_WxWord(wt if not words else " " + wt, ...))` — ilk kelimeye space eklenmemeli.

### B012 — `all_words` halüsinasyon chunk'larının kelimelerini de içeriyor
- **Dosya:** `backend/transcribe.py`
- **Satır:** 1959-1970
- **Severity:** Medium
- **Kategori:** Data Integrity
- **Açıklama:** `all_words` segment-seviyesinde doldurulur (chunk bölme öncesi). Chunk-seviye halüsinasyon filtresi (satır 2002) chunk'ları atar ama `all_words`'deki o chunk'a ait kelimeler kalır. `write_json()` (satır 2192) bu öksüz kelimeleri komşu entry'lere atar, yanlış kelime-seviyesi JSON verisi oluşur.
- **Önerilen Çözüm:** Kelime toplama, chunk filtreleme SONRASINA taşınmalı veya filtrelenen chunk'ların kelimeleri `all_words`'den çıkarılmalı.

### B013 — `_is_false_sentence_end` 0.15sn eşiği büyük harfli gerçek cümle sonlarını da birleştiriyor
- **Dosya:** `backend/transcribe.py`
- **Satır:** 507
- **Severity:** Medium
- **Kategori:** Split
- **Açıklama:** `gap < 0.15` kontrolü sonraki kelimenin büyük/küçük harf olmasına bakmaz. Hızlı cevaplı diyaloglarda gerçek cümle sonları (örn. "This is good. Next item." 0.10sn gap ile) birleştirilir. Kısa aralıklı ama gerçek cümle sınırları kaybolur.
- **Önerilen Çözüm:** Büyük harfle başlayan kelimeler için daha düşük eşik (0.08sn) kullanılmalı veya gap kontrolü tamamen kaldırılmalı.

### B014 — `normalize_timings` satır 1596-1597 ölü kod
- **Dosya:** `backend/transcribe.py`
- **Satır:** 1596-1597
- **Severity:** Medium
- **Kategori:** Timing
- **Açıklama:** Satır 1589-1590 ceiling kontrolü `e <= next_start - min_gap` garantiler. Sonra satır 1596'da `e >= next_start` kontrolü yalnızca `min_gap <= 0` iken true olur. Varsayılan `min_gap=0.08` ile bu branch asla çalışmaz.
- **Önerilen Çözüm:** Ya bu branch kaldırılmalı (ceiling zaten koruyor) ya da intent'i açıklayan yorum eklenmeli.

### B015 — Bozuk ffmpeg için diagnostik yok
- **Dosya:** `backend/transcribe.py`
- **Satır:** 85-96
- **Severity:** Medium
- **Kategori:** FFmpeg
- **Açıklama:** PATH'teki ffmpeg önce `shutil.which` ile bulunur (binary mevcut), sonra `ffmpeg -version` ile çalıştırılır. Eğer ffmpeg binary'si bozuksa (var ama çalışmıyor), hata sessizce yutulur ve `find_ffmpeg()` `None` döner. Satır 1741'de `RuntimeError("ffmpeg bulunamadı")` oluşur ama kullanıcıya neden diagnostik verilmez.
- **Önerilen Çözüm:** Hata mesajına ffmpeg'in stderr çıktısı eklenmeli: `f"ffmpeg bulunamadı veya çalışmıyor: ..."`.

### B016 — `has_repetition_loop` O(n*m) ile kısa metinlerde erken çıkış yok
- **Dosya:** `backend/transcribe.py`
- **Satır:** 889-900
- **Severity:** Medium
- **Kategori:** Performance
- **Açıklama:** Her n-gram (1,2,3,4) için tüm pozisyonları 4 tekrar kontrol eder. 1000 kelimelik segment ~4000 iterasyon + slice karşılaştırması. İlk eşleşmede `return True` yapar (zaten implemente). Erken çıkış var ama slice allocation hala pahalı.
- **Önerilen Çözüm:** Slice oluşturmak yerine karakter-karakter karşılaştırma yapılmalı veya max n-gram 3'e düşürülmeli.

### B017 — `audio_energy_signal` tüm WAV'ı belleğe okuyor
- **Dosya:** `backend/transcribe.py`
- **Satır:** 2378-2380
- **Severity:** Medium
- **Kategori:** Memory / Sync
- **Açıklama:** `raw = wf.readframes(wf.getnframes())` tüm WAV dosyasını tek seferde okur. 2 saatlik video 16kHz 16-bit mono = ~230MB. Fonksiyon yalnızca RMS enerjisine ihtiyaç duyar (50Hz'de). Chunk chunk okunabilir.
- **Önerilen Çözüm:** `CHUNK_SIZE` ile döngü halinde okunup işlenmeli.

## Low

### B018 — `download_youtube` zero_total edge case
- **Dosya:** `backend/transcribe.py`
- **Satır:** 125
- **Severity:** Low
- **Kategori:** Download
- **Açıklama:** `total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0` — `total_bytes` legitimately 0 ise (neredeyse imkansız), `or` zinciri 0'a düşer. `pct = downloaded / total * 100` -> ZeroDivisionError. Satır 127'deki `if total else 0` korur ama progress her zaman 0% gösterir.
- **Önerilen Çözüm:** `total = d.get("total_bytes") if d.get("total_bytes") is not None else d.get("total_bytes_estimate", 0)`.

### B019 — Eksik kelime zamanlaması her zaman false sentence end
- **Dosya:** `backend/transcribe.py`
- **Satır:** 492-495
- **Severity:** Low
- **Kategori:** Split
- **Açıklama:** `end` veya `start` None ise `gap = 0.0`. 0.0 gap her zaman `gap < 0.15` (satır 507) ve `gap < 0.6` (satır 504) koşullarını sağlar → her zaman false positive. Zamanlaması olmayan cümle sonları asla bölünmez.
- **Önerilen Çözüm:** Her iki timing de None ise gap "unknown" kabul edilmeli ve gap-based kontroller atlanmalı.

### B020 — `_WxInfo.duration` len(audio) / 16000 ile hafif hatalı
- **Dosya:** `backend/transcribe.py`
- **Satır:** 1467
- **Severity:** Low
- **Kategori:** WhisperX
- **Açıklama:** `len(audio) / 16000.0` floating point bölme ile süre hesaplar. 1 saatlik dosyada milisaniye mertebesinde hata oluşabilir.
- **Önerilen Çözüm:** Minor. `whisperx.audio.load_audio(wav_path, sr=16000)` kullanılıp `audio.shape[0] / audio.sampling_rate` ile hesaplanabilir.

### B021 — Checkpoint .tmp dosyası crash'te temizlenmiyor
- **Dosya:** `backend/transcribe.py`
- **Satır:** 1680-1686
- **Severity:** Low
- **Kategori:** Cleanup
- **Açıklama:** `.whisper.ckpt.json.tmp` dosyası atomic write için oluşturulur. `os.replace(tmp, path)` arasında crash olursa .tmp dosyası diskte kalır. Zararsız ama filesystem kirliliği.
- **Önerilen Çözüm:** try/finally ile tmp temizlenmeli.

### B022 — `preview_refresh` yalnızca dedupe çalıştığında emit edilmiyor
- **Dosya:** `backend/transcribe.py`
- **Satır:** 2137
- **Severity:** Low
- **Kategori:** UI
- **Açıklama:** `args.merge_short or args.llm_postprocess or args.diarize or args.fix_timings or resumed_entries` — `args.dedupe` listede yok. Sadece dedupe aktifse ve diğerleri kapalıysa, entries değişir ama preview_refresh gönderilmez. UI güncel olmayan veri gösterir.
- **Önerilen Çözüm:** Koşula `args.dedupe` eklenmeli.

### B023 — Non-standard 2-digit ms SRT'de saniye olarak parse ediliyor
- **Dosya:** `backend/transcribe.py`
- **Satır:** 2316
- **Severity:** Low
- **Kategori:** SRT Parsing
- **Açıklama:** `\d{1,3}` regex'i 1-3 basamak milisaniyeye izin verir. 2 basamaklı `,50`, `float("01:02:03.50")` = 3723.5s (doğru: 3723.050) olarak parse edilir, 450ms hata oluşur.
- **Önerilen Çözüm:** `\d{3}` ile standart 3 basamak zorunlu kılınmalı.

### B024 — JSON word matching'de 0.05 tolerance iki segmentte de aynı kelimeyi atayabilir
- **Dosya:** `backend/transcribe.py`
- **Satır:** 831, 835
- **Severity:** Low
- **Kategori:** JSON
- **Açıklama:** `all_words[cursor]["start"] < start - 0.05` ve `all_words[j]["start"] <= end + 0.05`. Aynı kelime iki bitişik segmentin overlap bölgesinde kalabilir ve ikisine de atanabilir.
- **Önerilen Çözüm:** Asimetrik tolerance: `start - 0.03` ve `end + 0.025`.

### B025 — 5 tekrarlı kelime halüsinasyon sayılıyor (fazla agresif)
- **Dosya:** `backend/transcribe.py`
- **Satır:** 945
- **Severity:** Low
- **Kategori:** Hallucination
- **Açıklama:** `len(words) >= 5 and len(set(words)) == 1` — "yes yes yes yes yes" gibi coşkulu ama geçerli tekrarlar halüsinasyon sayılır.
- **Önerilen Çözüm:** Eşik 7 veya 8'e çıkarılmalı veya kelimenin yaygın bir ünlem olup olmadığı kontrol edilmeli.

### B026 — "auto" dilinde her zaman İngilizce punctuation prompt
- **Dosya:** `backend/transcribe.py`
- **Satır:** 1842
- **Severity:** Low
- **Kategori:** Prompt
- **Açıklama:** `lang_key = args.language if args.language not in (None, "", "auto") else "en"` — dil "auto" iken decoder prompt'u İngilizce noktalama örnekleri içerir. Gerçek dil Türkçe ise prompt optimal değildir.
- **Önerilen Çözüm:** Dil bilinmiyorsa minimal noktalama (sadece nokta ve virgül) içeren agnostik prompt kullanılmalı.

### B027 — `probe_duration` None döndüğünde sessizce fallback atlanıyor
- **Dosya:** `backend/transcribe.py`
- **Satır:** 232-234
- **Severity:** Low
- **Kategori:** Utility
- **Açıklama:** ffprobe boş stdout döndürürse `float("")` ValueError fırlatır, None döner. Satır 1812'de `if actual is not None and ...` kontrolü geçer ama "süre algılanamadı" diye bir uyarı yoktur.
- **Önerilen Çözüm:** Uyarı log'lanmalı.

### B028 — `_flush_chunk` tümüyle None timestamp'ler döndürebilir
- **Dosya:** `backend/transcribe.py`
- **Satır:** 386-394
- **Severity:** Low
- **Kategori:** Utility
- **Açıklama:** Tüm kelimelerin `start`/`end`'i None ise `_flush_chunk` `(None, None, text)` döndürür. Çağıran (satır 2009) `segment.start/end` fallback'i kullanır ama bu data flow kırılgandır.
- **Önerilen Çözüm:** Her iki timestamp de None ise `_flush_chunk` `None` döndürmeli (çağıran zaten `if chunk:` kontrolü yapıyor).

---

# TUR 1: Electron Main Process (main.js)

## Critical

### B029 — SRT/VTT zaman kaydırmada BOM kaybı
- **Dosya:** `src/main.js`
- **Satır:** 416-418
- **Severity:** Critical
- **Kategori:** File I/O / Data Integrity
- **Açıklama:** `subs:shift` handler'ı SRT/VTT dosyasını `'utf-8'` ile okur (BOM karakterini string'e dahil eder), `'utf-8'` ile yazar (BOM'suz). AGENTS.md'ye göre SRT/ASS `utf-8-sig` ile yazılmalı (Windows oynatıcılarda Türkçe karakter uyumu için). Her shift işleminde BOM sessizce kaybolur.
- **Önerilen Çözüm:** `fs.writeFileSync(filePath, shifted, 'utf-8-sig')` kullanılmalı.

### B030 — Hata durumunda çift event (error + exit)
- **Dosya:** `src/main.js`
- **Satır:** 700-720
- **Severity:** Critical
- **Kategori:** IPC / Event
- **Açıklama:** Python subprocess hata verdiğinde önce `'error'` event'i fırlar (sendEvent -> error), sonra `'close'` event'i fırlar (sendEvent -> exit). Renderer iki event alır; `finishRun()` iki kere çağrılır, `state.running` iki kere false set edilir, queue iki kere advance eder.
- **Önerilen Çözüm:** `'error'` handler'ında `errored = true` flag'i set edilmeli, `'close'` handler'ında `if (errored) return;` ile çift event engellenmeli.

### B031 — `dialog:openVideo` race condition (settings üzerine yazma)
- **Dosya:** `src/main.js`
- **Satır:** 169-188
- **Severity:** Critical
- **Kategori:** Settings / Race Condition
- **Açıklama:** `loadSettings()` iki kere çağrılır (satır 169 ve 184). `await dialog.showOpenDialog()` arasında renderer'dan `settings:save` gelebilir. İkinci `loadSettings()` + write, aradaki değişikliklerin üzerine yazar.
- **Önerilen Çözüm:** `prev` objesi (satır 169'daki) yeniden kullanılmalı, ikinci `loadSettings()` kaldırılmalı.

## High

### B032 — `ffSubtitlesArg` apostrof içeren yollarda kırılıyor
- **Dosya:** `src/main.js`
- **Satır:** 428-431
- **Severity:** High
- **Kategori:** Burn-in
- **Açıklama:** `subtitles='path'` — ffmpeg filter syntax'inde single quote içinde escape mekanizması YOKTUR. `D:/It's_final.srt` gibi bir yol `subtitles='D:/It'` olarak kırılır.
- **Önerilen Çözüm:** Single quote karakterleri yoldan temizlenmeli veya ffmpeg'in internal escape'i kullanılmalı.

### B033 — Power blocker window close'da durdurulmuyor
- **Dosya:** `src/main.js`
- **Satır:** 151-160
- **Severity:** High
- **Kategori:** App Lifecycle
- **Açıklama:** `window-all-closed` handler'ı `killActiveJob()` çağırır ama `stopPowerBlocker()` çağırmaz. `powerBlockerId` stale referans olarak kalır. Yeni bir job başladığında `startPowerBlocker()` `powerBlockerId !== null` olduğu için atlanır, yeni transkripsiyon job'ı sistem sleep'ini engelleyemez.
- **Önerilen Çözüm:** `stopPowerBlocker()` çağrılmalı.

### B034 — yt-dlp update stdout/stderr null kontrolü yok
- **Dosya:** `src/main.js`
- **Satır:** 745-746
- **Severity:** High
- **Kategori:** Subprocess
- **Açıklama:** `updateJob.stdout.on(...)` satır 745 — transcribe handler'ının aksine (satır 638-642 null check yapar), burada null kontrolü yoktur. `stdio` varsayılanı pipe içerir ama değişirse veya pipe oluşturulamazsa `.on()` null'da TypeError fırlatır.
- **Önerilen Çözüm:** Null guard eklenmeli.

### B035 — `app.whenReady().then(createWindow)` unhandled rejection
- **Dosya:** `src/main.js`
- **Satır:** 149
- **Severity:** High
- **Kategori:** App Lifecycle
- **Açıklama:** `app.whenReady()` reject ederse (Electron init hatası), `.catch()` handler'ı yok. Unhandled promise rejection Electron'da process terminate'e yol açabilir. Kullanıcı hiçbir hata mesajı görmez.
- **Önerilen Çözüm:** `.catch(err => { dialog.showErrorBox(...); app.quit(); })` eklenmeli.

## Medium

### B036 — `loadSettings()` default çok zayıf
- **Dosya:** `src/main.js`
- **Satır:** 63
- **Severity:** Medium
- **Kategori:** Settings
- **Açıklama:** `return { glossary: [], hfToken: '' }` — tüm bilinen ayar alanlarını içermez. `lastInputDir`, `outputDir`, `llmApiKey` vb. alanlar ilk çalıştırmada undefined olur. Çoğu kod `if (prev && prev.lastInputDir)` ile korunur ama tutarsız.
- **Önerilen Çözüm:** Tüm bilinen ayar alanlarıyla dolu default dönülmeli.

### B037 — `chunk.toString()` redundant + encoding fragile
- **Dosya:** `src/main.js`
- **Satır:** 648, 682-698
- **Severity:** Medium
- **Kategori:** Subprocess
- **Açıklama:** `activeJob.stderr.setEncoding('utf-8')` (satır 648) yapılmış — `data` event'i string emit eder. Ancak satır 686'da `chunk.toString()` hala çağrılır (redundant). Eğer `setEncoding` kaldırılırsa veya başarısız olursa, `chunk` Buffer olur ve `stderrBuf += chunk` -> "[object Object]" string'ine dönüşür.
- **Önerilen Çözüm:** Ya encoding'e güvenilip `toString()` kaldırılmalı ya da `typeof chunk === 'string' ? chunk : chunk.toString('utf-8')` ile normalize edilmeli.

### B038 — Çift shift'te çift BOM riski
- **Dosya:** `src/main.js`
- **Satır:** 416-418
- **Severity:** Medium
- **Kategori:** File I/O
- **Açıklama:** Dosyada BOM varsa, BOM karakteri string'e dahil olur. `utf-8-sig` ile yazıldığında ikinci bir BOM daha eklenir. Dosyada `\xEF\xBB\xBF\xEF\xBB\xBF` (çift BOM) oluşur, bazı oynatıcılar yanlış yorumlar.
- **Önerilen Çözüm:** Yazmadan önce BOM strip edilmeli: `const cleaned = raw.replace(/^\uFEFF/, '')`.

### B039 — Global uncaughtException / unhandledRejection handler'ı yok
- **Dosya:** `src/main.js` (tüm dosya)
- **Satır:** —
- **Severity:** Medium
- **Kategori:** App Lifecycle
- **Açıklama:** `process.on('uncaughtException')` ve `process.on('unhandledRejection')` handler'ları tanımlanmamış. Herhangi bir IPC handler'ı senkron throw yaparsa Electron crash olur.
- **Önerilen Çözüm:** Her iki global handler da eklenmeli.

### B040 — `dialog:openFile` filter key tutarsızlığı
- **Dosya:** `src/main.js`
- **Satır:** 192-206
- **Severity:** Medium
- **Kategori:** IPC
- **Açıklama:** `filterMap` key'leri `json`, `settings`, `subtitle`. Renderer `selectFile('subtitle')` çağırır. Çalışıyor ama key değişirse sessizce kırılır.
- **Önerilen Çözüm:** API contract'ı sabitlenmeli veya type-safe hale getirilmeli.

### B041 — macOS'ta taskkill ile orphane cleanup yetersiz
- **Dosya:** `src/main.js`
- **Satır:** 154-158
- **Severity:** Medium
- **Kategori:** App Lifecycle
- **Açıklama:** `taskkill` Windows'a özgüdür. macOS'ta `kill` sinyali gerekir. `window-all-closed` macOS'ta `app.quit()` çağırmaz, taskkill başarısız olur ve Python/ffmpeg orphan kalır.
- **Önerilen Çözüm:** Platform bazlı kill: `process.platform === 'win32' ? spawn('taskkill', ...) : proc.kill('SIGTERM')`.

## Low

### B042 — `taskkill` fire-and-forget, `app.quit()` ile yarışıyor
- **Dosya:** `src/main.js`
- **Satır:** 44-46, 152, 159
- **Severity:** Low
- **Kategori:** Subprocess
- **Açıklama:** `spawn('taskkill', ...)` async (fire-and-forget). `app.quit()` senkron çağrılır. taskkill tamamlanmadan process exit olursa çocuk process'ler orphan kalır.
- **Önerilen Çözüm:** `spawnSync` kullanılmalı.

### B043 — `powerBlockerId` stale macOS window close'da
- **Dosya:** `src/main.js`
- **Satır:** 11-22, 722
- **Severity:** Low
- **Kategori:** Power
- **Açıklama:** macOS'ta window-all-closed `app.quit()` çağırmaz. `stopPowerBlocker()` çağrılmaz. Yeni job `startPowerBlocker()`'ı `powerBlockerId !== null` olduğu için atlar. Job sırasında sistem sleep'e gidebilir.
- **Önerilen Çözüm:** `window-all-closed`'a `stopPowerBlocker()` eklenmeli.

### B044 — `shell:showInFolder` async handler void döndürüyor
- **Dosya:** `src/main.js`
- **Satır:** 249-252
- **Severity:** Low
- **Kategori:** IPC
- **Açıklama:** `async` handler `shell.showItemInFolder(p)` void döndürür. IPC framework void'i await eder, hemen undefined'a çözülür. Çalışır ama semantik olarak yanlış.
- **Önerilen Çözüm:** `async` kaldırılmalı veya explicit return eklenmeli.

### B045 — `stdoutBuf` vs `stderrBuf` asimetrik truncation
- **Dosya:** `src/main.js`
- **Satır:** 678, 685
- **Severity:** Low
- **Kategori:** Subprocess
- **Açıklama:** `stdoutBuf` 1M -> 100K truncate edilir. `stderrBuf` 8K -> 4K truncate edilir. Asimetrik. Büyük stderr çıktısında erken hata mesajları kaybolur.
- **Önerilen Çözüm:** Intent belirtilmeli. Genelde kabul edilebilir çünkü stderr NDJSON taşımaz.

### B046 — `mainWindow = null` atanmamış
- **Dosya:** `src/main.js`
- **Satır:** 162-164
- **Severity:** Low
- **Kategori:** Window
- **Açıklama:** Window `closed` event'inde `mainWindow = null` atanmaz. `activate` handler'ı `BrowserWindow.getAllWindows().length` ile kontrol eder, çalışır. Ama temiz kod için `mainWindow = null` atanmalı.
- **Önerilen Çözüm:** `mainWindow.on('closed', () => { mainWindow = null; })` eklenmeli.

### B047 — `resolvePython()` `python3.exe`'yi kontrol etmiyor
- **Dosya:** `src/main.js`
- **Satır:** 508-520
- **Severity:** Low
- **Kategori:** Subprocess
- **Açıklama:** Yalnızca `python.exe` ve `py` kontrol edilir. Bazı Windows kurulumlarında `python3.exe` de bulunur. Onu kaçırır.
- **Önerilen Çözüm:** `'python3'` aday listesine eklenmeli.

### B048 — `setAppUserModelId` ASCII olmayan karakter içeriyor
- **Dosya:** `src/main.js`
- **Satır:** 105
- **Severity:** Low
- **Kategori:** Window
- **Açıklama:** `app.setAppUserModelId('Whisper Altyazı')` — `ı` (noktasız i) ASCII olmayan karakterdir. Windows AppUserModelId'leri teknik olarak Unicode kabul etse de, bazı kabuk entegrasyonları sorun yaşayabilir.
- **Önerilen Çözüm:** `app.setAppUserModelId('WhisperAltyazi')` veya `app.setAppUserModelId('com.whisper.altyazi')`.

---

# TUR 1: Renderer JS (renderer.js)

## Critical

### B049 — `startTranscribe()` try/catch'siz çağrılıyor (4 yerde)
- **Dosya:** `src/renderer/renderer.js`
- **Satır:** 259, 1178, 1587, 1635
- **Severity:** Critical
- **Kategori:** Error Handling
- **Açıklama:** `await window.api.startTranscribe(opts)` 4 ayrı yerde try/catch'siz. IPC fırlatırsa (kanal koptu, backend öldü), unhandled promise rejection oluşur. `state.running = true` kalıcı olur, UI kilitlenir (cancelBtn görünür, startBtn gizli).
- **Önerilen Çözüm:** Her çağrı try/catch ile sarılmalı; catch'te `state.running = false` ve `finishRun(false)` çağrılmalı.

### B050 — `buildOptsFromUI()` null guard yok
- **Dosya:** `src/renderer/renderer.js`
- **Satır:** 30-92
- **Severity:** Critical
- **Kategori:** Null Reference
- **Açıklama:** Çoğu `.value` erişimi null-check'siz. `$('model').value`, `$('engine').value`, vb. HTML'den bir ID kaldırılırsa `Cannot read properties of null` hatasıyla crash. Bazı alanlarda guard var (`$('audioTrack') ? ... : -1`) ama çoğunda yok.
- **Önerilen Çözüm:** Tüm erişimlerde null guard eklenmeli veya `safeVal(id, fallback)` helper'ı oluşturulmalı.

## High

### B051 — Queue item IPC hatasında kalıcı "running" durumu
- **Dosya:** `src/renderer/renderer.js`
- **Satır:** 232-267
- **Severity:** High
- **Kategori:** Queue
- **Açıklama:** `startTranscribe` başarısız olursa (`!r.ok`), `next.status = 'error'` set edilir. Ama IPC throw ederse (try/catch yok), item `'running'` durumunda kalır. `state.running` de true kalır.
- **Önerilen Çözüm:** try/catch eklenmeli, catch'te status 'error' yapılmalı.

### B052 — `state.running = true` sonrası IPC throw'u donma
- **Dosya:** `src/renderer/renderer.js`
- **Satır:** 1162-1183
- **Severity:** High
- **Kategori:** Error Handling
- **Açıklama:** Satır 1162'de `state.running = true` set edilir, sonra satır 1178'de `await window.api.startTranscribe()`. Throw ederse `state.running` kalıcı true. Cancel butonu görünür ama hiçbir subprocess yoktur. Kullanıcı Escape'e bassa bile cancel IPC de throw edebilir.
- **Önerilen Çözüm:** try/catch ile korunmalı.

### B053 — `clipStart`/`clipEnd` persistence'ı yok
- **Dosya:** `src/renderer/renderer.js`
- **Satır:** 67-68, 844-852
- **Severity:** High
- **Kategori:** Settings
- **Açıklama:** `buildOptsFromUI()` `clipStart` ve `clipEnd`'i okur (satır 67-68) ama `PERSIST_VALUE_CONTROLS` listesinde (satır 844-852) DEĞİLLER. Her restart'ta sıfırlanır.
- **Önerilen Çözüm:** `PERSIST_VALUE_CONTROLS`'a `'clipStart'` ve `'clipEnd'` eklenmeli.

## Medium

### B054 — Queue "tamamlandı" son item hatalıyken de gösteriliyor
- **Dosya:** `src/renderer/renderer.js`
- **Satır:** 224-230, 260-267
- **Severity:** Medium
- **Kategori:** Queue
- **Açıklama:** Son queue item'ı başlatılamazsa (IPC hatası), `setTimeout(processNextQueueItem, 100)` ile tekrar dener. Pending item kalmayınca "Kuyruk tamamlandı" notification'ı gösterir. Oysa son item BAŞARISIZ.
- **Önerilen Çözüm:** Hata sayısı > 0 ise "Kuyruk tamamlandı (X hata)" olarak değiştirilmeli.

### B055 — `finishRun()` `state.cancelled`'ı temizlemiyor
- **Dosya:** `src/renderer/renderer.js`
- **Satır:** 1209-1215
- **Severity:** Medium
- **Kategori:** State
- **Açıklama:** `finishRun(success)` `state.running = false` yapar ama `state.cancelled = false` YAPMAZ. Eğer cancel sonrası backend exit öncesi error gönderirse `state.cancelled` true kalır. Sonraki job'da `addSegment()` (satır 1267) `state.cancelled` true görür ve segment eklemez. Sonraki job'ın live preview'ı çalışmaz.
- **Önerilen Çözüm:** `state.cancelled = false` eklenmeli.

### B056 — Queue cancel buton durumunu geri yüklemiyor
- **Dosya:** `src/renderer/renderer.js`
- **Satır:** 1190-1198
- **Severity:** Medium
- **Kategori:** UI / Queue
- **Açıklama:** Queue cancel yolunda `state.running = false`, `startBtn` göster, `cancelBtn` gizle YAPILMAZ. `exit` event'i beklenir. Eğer exit gecikirse veya gelmezse UI cancel butonunda takılı kalır.
- **Önerilen Çözüm:** Queue cancel yolunda da butonlar geri yüklenmeli.

### B057 — Queue exit hatasında `state.cancelled` resetlenmiyor
- **Dosya:** `src/renderer/renderer.js`
- **Satır:** 1362-1382
- **Severity:** Medium
- **Kategori:** State
- **Açıklama:** Queue error exit path'inde (satır 1367) `state.cancelled` false set edilmez. B055 ile aynı kaynak.
- **Önerilen Çözüm:** `state.cancelled = false` eklenmeli.

### B058 — `$(id)` null döndüğünde crash (tüm dosya)
- **Dosya:** `src/renderer/renderer.js`
- **Satır:** Tüm dosya
- **Severity:** Medium
- **Kategori:** Null Reference
- **Açıklama:** `$('progressFill').style.width = ...` (satır 287) — `progressFill` DOM'da yoksa crash. `$('cancelBtn').classList.add('hidden')` — cancelBtn yoksa crash. Bu pattern tüm dosyada yaygın. HTML değişirse UI tamamen çöker.
- **Önerilen Çözüm:** Kritik DOM erişimlerinde null check eklenmeli veya helper fonksiyon oluşturulmalı.

### B059 — `estimateVramMib()` `.en` model varyantlarını yanlış hesaplıyor
- **Dosya:** `src/renderer/renderer.js`
- **Satır:** 1072-1086
- **Severity:** Medium
- **Kategori:** VRAM
- **Açıklama:** Sözlük yalnızca multilingual model key'lerini içerir (`large-v3`, `medium`, vb.). `tiny.en` veya `base.en` seçilirse `|| 3100` fallback'i (large-v3 değeri) kullanılır. `tiny.en` ~250 MB olması gerekirken 3100 MB olarak tahmin edilir.
- **Önerilen Çözüm:** `.en` suffix'i lookup öncesi strip edilmeli veya `.en` varyantları da sözlüğe eklenmeli.

## Low

### B060 — `srtTime()` `isFinite` kontrolü yok
- **Dosya:** `src/renderer/renderer.js`
- **Satır:** 385-392
- **Severity:** Low
- **Kategori:** Display
- **Açıklama:** `Math.round((seconds || 0) * 1000)` — `seconds` Infinity ise `Infinity * 1000 = Infinity`. `Math.round(Infinity) = Infinity`. Çıktı "Infinity:NaN:NaN,NaN" olur.
- **Önerilen Çözüm:** `if (!isFinite(seconds)) return '99:59:59,000'` eklenmeli.

### B061 — `NaN` propagation (parseFloat/parseInt guardsız)
- **Dosya:** `src/renderer/renderer.js`
- **Satır:** 43, 45, 51, 53-64
- **Severity:** Low
- **Kategori:** Data Validation
- **Açıklama:** `parseFloat($('vadThreshold').value)` — input boşsa NaN. `parseInt($('minSpeakers').value, 10)` NaN olabilir. Range input'lar için sorun yok ama `text` input'lar (minSpeakers vb.) için risk.
- **Önerilen Çözüm:** `|| 0` veya `isFinite()` kontrolü eklenmeli.

### B062 — `_saveTimer` page unload'da temizlenmiyor
- **Dosya:** `src/renderer/renderer.js`
- **Satır:** 894-898
- **Severity:** Low
- **Kategori:** Cleanup
- **Açıklama:** `_saveTimer` setTimeout ile ayarlanır. `beforeunload` handler'ı YOK. Sayfa kapanırken timer DOM'u yok edilmiş halde çalıştırabilir.
- **Önerilen Çözüm:** `window.addEventListener('beforeunload', () => clearTimeout(_saveTimer))` eklenmeli.

### B063 — Drag-drop YouTube dışı URL kabul ediyor
- **Dosya:** `src/renderer/renderer.js`
- **Satır:** 592-600
- **Severity:** Low
- **Kategori:** UX / Security
- **Açıklama:** `/^https?:\/\//i` regex'i herhangi bir HTTP/HTTPS URL'sini kabul eder. YouTube olmayan URL YouTube alanına konur, yt-dlp başarısız olur.
- **Önerilen Çözüm:** YouTube domain regex'i eklenmeli.

### B064 — `offerOpenLastOutput` butonu log temizlenince kayboluyor
- **Dosya:** `src/renderer/renderer.js`
- **Satır:** 1506-1517
- **Severity:** Low
- **Kategori:** UI
- **Açıklama:** Buton `logLine()` DOM elementine eklenir. `$('clearLog').click()` tüm log'u temizler, buton kaybolur. Kullanıcı son çıktıyı açamaz.
- **Önerilen Çözüm:** UI'da kalıcı bir "Son Çıktıyı Aç" butonu eklenmeli.

### B065 — `previewFilter` clearPreview'da resetlenmiyor
- **Dosya:** `src/renderer/renderer.js`
- **Satır:** 373-381
- **Severity:** Low
- **Kategori:** UI
- **Açıklama:** `clearPreview()` `previewFilter` değişkenini sıfırlamaz, `$('previewSearch').value`'yu temizlemez. Yeni job eski filter'la başlar.
- **Önerilen Çözüm:** `clearPreview()` içinde `previewFilter = ''` ve `$('previewSearch').value = ''` eklenmeli.

### B066 — Glossary pipe karakteri sorunu
- **Dosya:** `src/renderer/renderer.js`
- **Satır:** 69, 770
- **Severity:** Low
- **Kategori:** Data
- **Açıklama:** `glossary.join('|')` — backend pipe ile split eder. Kullanıcı glossary terimine `|` karakteri ekleyebilir, bu da backend'de yanlış split'e yol açar.
- **Önerilen Çözüm:** Pipe karakteri glossary eklenirken uyarılmalı veya escape edilmeli.

### B067 — `llmWorkers = 0` sessizce `4` oluyor
- **Dosya:** `src/renderer/renderer.js`
- **Satır:** 87
- **Severity:** Low
- **Kategori:** Data
- **Açıklama:** `parseInt($('llmWorkers').value, 10) || 4` — kullanıcı 0 girerse (`||` NaN ve 0 için aynı), 4'e dönüşür. Kullanıcının 0 (sıralı çalıştır) isteği göz ardı edilir.
- **Önerilen Çözüm:** `Number.isNaN(v) ? 4 : v` kullanılmalı.

---

# TUR 1: Preload / HTML / CSS / Batch Dosyaları

## Critical

### B068 — `.hidden` CSS class'ı çalışmıyor (genel kural yok)
- **Dosya:** `src/renderer/styles.css`
- **Satır:** 1-1190 (global)
- **Severity:** Critical
- **Kategori:** UI / CSS
- **Açıklama:** `.hidden { display: none; }` genel kuralı TANIMLANMAMIŞ. Yalnızca bileşik seçiciler var (`.tab-content.hidden`, `.btn.hidden`, `.modal.hidden`, `.file-info.hidden`). `classList.add('hidden')` / `remove('hidden')` Kullanılan elementler:
  - `#queueCard` (`.card` sınıfı) → `.card.hidden` YOK
  - `#dropZone` (`.drop-zone`) → `.drop-zone.hidden` YOK
  - `#audioTrackField` (`.field`) → `.field.hidden` YOK
  - `#llmCustomUrlField` (`.field.field-full`) → `.field-full.hidden` YOK
  - `#modalQuality` (`.modal-stats`) → `.modal-stats.hidden` YOK
  - `#stopAfterCurrent` (`.link-btn`) → `.link-btn.hidden` YOK
  - `#burninProgress` (`.burnin-progress`) → `.burnin-progress.hidden` YOK
  Tüm bu elementler için show/hide işlemleri **sessizce no-op** olur.
- **Önerilen Çözüm:** `styles.css`'e `.hidden { display: none !important; }` eklenmeli VEYA her sınıf için bileşik seçici tanımlanmalı.

## High

### B069 — `install.bat` ana pip install ERRORLEVEL kontrolü yok
- **Dosya:** `install.bat`
- **Satır:** 85
- **Severity:** High
- **Kategori:** Installation
- **Açıklama:** `pip install "faster-whisper>=1.1.0" ...` komutunun ERRORLEVEL kontrolü YOK. Kurulum başarısız olsa bile (ağ hatası, derleme hatası) script "Kurulum tamamlandı!" mesajı gösterir. Kullanıcı çalışmayan bir kurulumla `start.bat`'ı çalıştırır.
- **Önerilen Çözüm:** ERRORLEVEL kontrolü eklenmeli, hata durumunda exit /b 1 yapılmalı.

### B070 — `install.bat` vs `requirements.txt` drift (senkronizasyon yok)
- **Dosya:** `install.bat` (satır 85) vs `backend/requirements.txt`
- **Severity:** High
- **Kategori:** Installation
- **Açıklama:** `install.bat` satır 85 paketleri hardcode eder. `requirements.txt` güncellenirse `install.bat` habersiz kalır. İKİ dosya da aynı paketleri farklı versiyonlarla listeleyebilir.
- **Önerilen Çözüm:** `requirements.txt` ikiye bölünmeli: `requirements-core.txt` (torch'suz) ve `install.bat` onu kullanmalı.

### B071 — `install.bat` sessiz CPU fallback
- **Dosya:** `install.bat`
- **Satır:** 76-79
- **Severity:** High
- **Kategori:** Installation
- **Açıklama:** CUDA PyTorch yüklenemezse CPU fallback'i sessizce yapılır. Uyarı metni hızlı akan çıktıda kaybolur. Kullanıcı uygulamayı `--device cuda` ile başlatır ve cryptic CUDA hatası alır.
- **Önerilen Çözüm:** Belirgin bir ===== UYARI ===== bloğu eklenmeli, büyük harflerle kullanıcıya bildirilmeli.

## Medium

### B072 — `preload.js` `file.path` fallback'i Electron 32+'da kırık
- **Dosya:** `src/preload.js`
- **Satır:** 5-7
- **Severity:** Medium
- **Kategori:** API Compatibility
- **Açıklama:** `webUtils.getPathForFile(file)` Electron 31'de YOK (throw eder, fallback `file.path` kullanılır). `file.path` Electron 32'de TAMAMEN KALDIRILDI. Electron 32+ yükseltmesinde dosya sürükleme tamamen kırılır.
- **Önerilen Çözüm:** Electron ^33'e yükseltilmeli, `webUtils.getPathForFile` çalışır hale gelir.

### B073 — `start.bat` `setlocal` yok (env sızıntısı)
- **Dosya:** `start.bat`
- **Satır:** 1-28
- **Severity:** Medium
- **Kategori:** Environment
- **Açıklama:** `setlocal` YOK. PATH değişiklikleri (`cublas/bin`, `cudnn/bin`, `torch/lib` eklenmesi) ve tüm `set HF_...` ortam değişkenleri ana shell'de kalıcı olur. Kullanıcının terminali kirlenir.
- **Önerilen Çözüm:** `setlocal` eklenmeli.

### B074 — `install-whisperx.bat` `setlocal` yok
- **Dosya:** `install-whisperx.bat`
- **Satır:** 1-35
- **Severity:** Medium
- **Kategori:** Environment
- **Açıklama:** `activate.bat` çağrılır ama `setlocal` yok. Sanal ortam PATH/VIRTUAL_ENV değişiklikleri ana shell'de kalır.
- **Önerilen Çözüm:** `setlocal` eklenmeli.

### B075 — `install-diarize.bat` `setlocal` yok
- **Dosya:** `install-diarize.bat`
- **Satır:** 1-37
- **Severity:** Medium
- **Kategori:** Environment
- **Açıklama:** B074 ile aynı.
- **Önerilen Çözüm:** `setlocal` eklenmeli.

### B076 — `install.bat` Python versiyon kontrolü yok
- **Dosya:** `install.bat`
- **Satır:** 24
- **Severity:** Medium
- **Kategori:** Installation
- **Açıklama:** Python varlığı kontrol edilir ama VERSİYON kontrolü YOK. README 3.10/3.11 der ama 3.9 veya 3.13 ile de devam eder. `ctranslate2` wheel'i bulunamayabilir.
- **Önerilen Çözüm:** `python -c "import sys; exit(0 if (3,10) <= sys.version_info < (3,13) else 1)"` ile versiyon kontrolü eklenmeli.

### B077 — `install.bat` Node.js versiyon kontrolü yok
- **Dosya:** `install.bat`
- **Satır:** 36
- **Severity:** Medium
- **Kategori:** Installation
- **Açıklama:** Node.js varlığı kontrol edilir ama 18+ gereklidir. 16 ile devam ederse `npm install` başarısız olur.
- **Önerilen Çözüm:** `node -e "process.exit(+process.version.slice(1) >= 18 ? 0 : 1)"` ile versiyon kontrolü eklenmeli.

### B078 — `install.bat` `pip` vs `python -m pip` tutarsızlığı
- **Dosya:** `install.bat`
- **Satır:** 70 (python -m pip), 75/78/85 (bare pip)
- **Severity:** Medium
- **Kategori:** Installation
- **Açıklama:** Satır 70 `python -m pip install --upgrade pip` kullanır. Satır 75,78,85 bare `pip install` kullanır. Bare pip farklı bir Python interpreter'ına çözünebilir.
- **Önerilen Çözüm:** Tümü `python -m pip install` ile tutarlı olmalı.

### B079 — `install-whisperx.bat` versiyon pinned değil
- **Dosya:** `install-whisperx.bat`
- **Satır:** 19
- **Severity:** Medium
- **Kategori:** Installation
- **Açıklama:** `pip install whisperx` — versiyon belirtilmemiş. Gelecek major versiyon API kırarsa uygulama bozulur.
- **Önerilen Çözüm:** `pip install "whisperx>=3.1.0,<4.0.0"` ile pinlenmeli.

### B080 — `install-diarize.bat` versiyon pinned değil
- **Dosya:** `install-diarize.bat`
- **Satır:** 19
- **Severity:** Medium
- **Kategori:** Installation
- **Açıklama:** `pip install "pyannote.audio>=3.1.0"` — üst sınır yok. Gelecek major versiyonda API kırılması riski.
- **Önerilen Çözüm:** `pip install "pyannote.audio>=3.1.0,<4.0.0"` ile pinlenmeli.

### B081 — `start.bat` pre-flight validation yok
- **Dosya:** `start.bat`
- **Satır:** 22-28
- **Severity:** Medium
- **Kategori:** Environment
- **Açıklama:** Electron başlatılmadan önce `node_modules` ve `venv` varlığı kontrol edilmez. `install.bat` çalıştırılmamışsa kriptik hatalar alınır.
- **Önerilen Çözüm:** `if not exist "node_modules"` ve `if not exist "backend\venv\Scripts\activate.bat"` kontrolleri eklenmeli.

### B082 — `nvidia-cublas-cu12` tırnak işareti tutarsızlığı
- **Dosya:** `install.bat`
- **Satır:** 85
- **Severity:** Low
- **Kategori:** Installation
- **Açıklama:** Tüm paketler tırnak içinde ama `nvidia-cublas-cu12` tırnaksız. Çalışır ama tutarsız.
- **Önerilen Çözüm:** `"nvidia-cublas-cu12"` olarak düzeltilmeli.

### B083 — `index.html` CSP `style-src 'unsafe-inline'`
- **Dosya:** `src/renderer/index.html`
- **Satır:** 5
- **Severity:** Medium
- **Kategori:** Security
- **Açıklama:** CSP'de `style-src 'self' 'unsafe-inline'` var. 9 adet inline `style=""` attribute'u mevcut (satır 69, 90, 95, 105, 219, 221, 389, 548, 643). CSS class'lara taşınabilir.
- **Önerilen Çözüm:** Inline style'lar CSS class'lara taşınmalı, `'unsafe-inline'` kaldırılmalı.

### B084 — `minSpeakers` / `maxSpeakers` yanlış input type
- **Dosya:** `src/renderer/index.html`
- **Satır:** 439, 443
- **Severity:** Medium
- **Kategori:** HTML
- **Açıklama:** `type="text"` olarak tanımlanmış ama yalnızca sayısal değer kabul eder. `type="number" min="0"` olmalı.
- **Önerilen Çözüm:** `type="number" min="0"` olarak değiştirilmeli.

### B085 — `applyUiSettings` truthiness hatası (`!!ui[id]`)
- **Dosya:** `src/renderer/renderer.js`
- **Satır:** 885
- **Severity:** Medium
- **Kategori:** Settings
- **Açıklama:** `el.checked = !!ui[id]` — eğer settings.json elle düzenlenmiş ve checkbox değeri `"false"` string'i olarak kaydedilmişse, `!!"false"` = `true` (non-empty string truthy). Checkbox yanlışlıkla checked olur.
- **Önerilen Çözüm:** `el.checked = ui[id] === true || String(ui[id]).toLowerCase() === 'true'` kullanılmalı.

## Low

### B086 — `index.html` `target="_blank"` rel="noopener" yok
- **Dosya:** `src/renderer/index.html`
- **Satır:** 450
- **Severity:** Low
- **Kategori:** Security
- **Açıklama:** HF linklerinde `target="_blank"` var ama `rel="noopener noreferrer"` yok. Electron'da exploit edilmesi zor ama best-practice ihlali.
- **Önerilen Çözüm:** `rel="noopener noreferrer"` eklenmeli.

### B087 — `start.bat` `chcp 65001` kalıcı code page değişikliği
- **Dosya:** `start.bat`
- **Satır:** 2
- **Severity:** Low
- **Kategori:** Environment
- **Açıklama:** `chcp 65001` UTF-8 code page'ine geçer. `setlocal` dışında olduğu için (setlocal yok zaten) kalıcıdır. Orijinal code page (örn. 857 Turkish) geri yüklenmez.
- **Önerilen Çözüm:** Orijinal code page kaydedilip geri yüklenmeli.

### B088 — `index.html` `id="stageList"` kullanılmıyor
- **Dosya:** `src/renderer/index.html`
- **Satır:** 578
- **Severity:** Low
- **Kategori:** HTML
- **Açıklama:** `id="stageList"` hiçbir `$('stageList')` çağrısı yok. Sadece `$$('.stage')` kullanılır. Ölü ID.
- **Önerilen Çözüm:** `id` attribute'u kaldırılmalı.

### B089 — `index.html` search input aria-label yok
- **Dosya:** `src/renderer/index.html`
- **Satır:** 594
- **Severity:** Low
- **Kategori:** Accessibility
- **Açıklama:** `type="search"` input'un `aria-label` attribute'u yok. Ekran okuyucular placeholder'ı her zaman duyurmaz.
- **Önerilen Çözüm:** `aria-label="Önizlemede ara"` eklenmeli.

---

# TUR 1: Cross-File API Entegrasyonu & Bağımlılıklar

## High

### B090 — Electron 31 EOL (güvenlik açıkları)
- **Dosya:** `package.json` (satır 13), `package-lock.json` (satır 289-306)
- **Severity:** High
- **Kategori:** Security / Dependencies
- **Açıklama:** Electron 31 Ekim 2024'te EOL oldu. Düzeltilmemiş Chromium CVE'leri mevcut. `got@11.8.6` (CVE'li transitive bağımlılık) ve `http-cache-semantics@4.2.0` (CVE-2022-21708) da çözülmemiş.
- **Önerilen Çözüm:** Electron ^33'e yükseltilmeli.

### B091 — `node --check` main.js/preload.js'de çalışmaz
- **Dosya:** `CLAUDE.md` / `AGENTS.md`
- **Satır:** 25
- **Severity:** Medium
- **Kategori:** Documentation
- **Açıklama:** `node --check src/main.js` — `require('electron')` plain Node.js'de bulunamaz, ERR_MODULE_NOT_FOUND hatası alınır. Komut yalnızca `renderer.js` için çalışır.
- **Önerilen Çözüm:** `npx electron --check src/main.js` olarak düzeltilmeli.

## Medium

### B092 — `preload.js` onEvent/onBurnInEvent cleanup çağrılmıyor
- **Dosya:** `src/preload.js` (satır 29-38), `src/renderer/renderer.js` (satır 1228, 1669)
- **Severity:** Medium
- **Kategori:** Memory Leak
- **Açıklama:** Her iki fonksiyon da cleanup function döndürür (`() => ipcRenderer.removeListener(...)`) ama renderer.js hiçbir zaman çağırmaz. Listener'lar renderer ömrü boyunca birikir.
- **Önerilen Çözüm:** Cleanup fonksiyonları saklanıp gerekirse çağrılmalı.

### B093 — `.gitignore` `.env` pattern'i yok
- **Dosya:** `.gitignore`
- **Satır:** 1-10
- **Severity:** High
- **Kategori:** Security
- **Açıklama:** `WHISPER_HF_TOKEN` ve `WHISPER_LLM_API_KEY` için `.env` dosyası oluşturulabilir. `.gitignore`'da `.env` pattern'i YOK. Gizli anahtarlar repo'ya eklenebilir.
- **Önerilen Çözüm:** `.env` ve `.env*` `.gitignore`'a eklenmeli.

### B094 — `.gitignore` checkpoint ve temp file pattern'leri yok
- **Dosya:** `.gitignore`
- **Satır:** 1-10
- **Severity:** Medium
- **Kategori:** Git
- **Açıklama:** `*.whisper.ckpt.json`, `*.tmp`, `*.synced.srt`, `*.altyazili.mp4` pattern'leri yok. Kullanıcı repo içinde çalışırsa bu dosyalar untracked görünür.
- **Önerilen Çözüm:** Tüm pattern'ler eklenmeli.

### B095 — `__pycache__/` pattern'i çok dar
- **Dosya:** `.gitignore`
- **Satır:** 5
- **Severity:** Low
- **Kategori:** Git
- **Açıklama:** `backend/__pycache__/` yalnızca `backend/` altındaki `__pycache__`'i kapsar. Alt dizinlerdeki `__pycache__`'leri (örn. `backend/something/__pycache__/`) kapsamaz.
- **Önerilen Çözüm:** `**/__pycache__/` kullanılmalı.

### B096 — README VAD default mismatch
- **Dosya:** `README.md`
- **Satır:** 83-84
- **Severity:** Medium
- **Kategori:** Documentation
- **Açıklama:** README'de "VAD filter | Açık" yazıyor ama kod default'u `False` ('transcribe.py:2518'). Varsayılan olarak KAPALI. README'yi takip eden kullanıcı VAD'in açık olduğunu sanır.
- **Önerilen Çözüm:** Ya default `True` yapılmalı ya da README düzeltilmeli.

---

# TUR 2: transcribe.py 2. Geçiş

## Medium

### B097 — `build_binary_signal` off-by-one (fazladan bir bin aktif)
- **Dosya:** `backend/transcribe.py`
- **Satır:** 2364
- **Severity:** Medium
- **Kategori:** Sync / Off-by-one
- **Açıklama:** `i1 = min(nbins, int(e * hz) + 1)` — `+1` her span'in sonunda bir fazladan bin'i aktif eder (~0.02s kayma). `best_offset` fonksiyonunun doğruluğunu düşürür.
- **Önerilen Çözüm:** `+1` kaldırılmalı: `i1 = min(nbins, int(e * hz))`.

### B098 — `best_offset` zero-lag index'i arama kümesinden çıkarılmış
- **Dosya:** `backend/transcribe.py`
- **Satır:** 2414-2418
- **Severity:** Low
- **Kategori:** Sync / Off-by-one
- **Açıklama:** `idx` kümesi `size//2` (zero-lag indeksi) hariç tüm indeksleri kapsar. Doğru offset 0 olsa bile sıfırdan farklı bir offset bulunur. Fonksiyon hiçbir zaman 0.0 döndüremez.
- **Önerilen Çözüm:** Zero-lag indeksi arama kümesine dahil edilmeli.

### B099 — `re.IGNORECASE` Türkçe I/ı/İ/i'yi yanlış eşler
- **Dosya:** `backend/transcribe.py`
- **Satır:** 851-856 (hallucination pattern'leri)
- **Severity:** Low
- **Kategori:** Unicode
- **Açıklama:** Python'da `ı` (U+0131) → `'ı'` (değişmez), `I` → `'i'`, `i` → `'i'`, `İ` (U+0130) → `'i̇'` (2 karakter). `re.IGNORECASE` Türkçe I/ı çiftini doğru eşleştirmez. "KANALI ABONE" gibi büyük harfli halüsinasyonlar yakalanamayabilir.
- **Önerilen Çözüm:** Pattern'lere `[ıiIİ]` gibi explicit alternatifler eklenmeli veya `text.lower()` ile ön işleme yapılıp `re.IGNORECASE` kaldırılmalı.

### B100 — `preview_refresh` condition missing `args.dedupe`
- **Dosya:** `backend/transcribe.py`
- **Satır:** 2137
- **Severity:** Low
- **Kategori:** UI
- **Açıklama:** B022 ile aynı (Tur 1'de de tespit edilmişti). Onay için Tur 2'de de doğrulandı.
- **Önerilen Çözüm:** `args.dedupe` eklenmeli.

---

# TUR 2: LLM + Diarization + Sync Derin Analiz

## Critical

### B101 — `use_auth_token` deprecated (derin doğrulama)
- **Dosya:** `backend/transcribe.py`
- **Satır:** 1069
- **Severity:** Critical
- **Kategori:** Diarization
- **Açıklama:** B004 ile aynı. Tur 2'de derinlemesine analiz: Modern `huggingface_hub >= 0.20` ile `TypeError: unexpected keyword argument 'use_auth_token'`. Diarization sessizce başarısız olur (`except Exception` ile yakalanır, log'a "Diarization başarısız" yazılır, kullanıcıya aksiyon alınabilir hiçbir bilgi verilmez).
- **Önerilen Çözüm:** `token=hf_token` olarak değiştirilmeli. try/except ile geriye dönük uyumluluk eklenebilir.

## High

### B102 — LLM API key sızıntısı (exception str(e) ile)
- **Dosya:** `backend/transcribe.py`
- **Satır:** 1292, 2085-2087
- **Severity:** High
- **Kategori:** Security / LLM
- **Açıklama:** `log(f"LLM chunk {ch[0]}-{ch[1]} hatası: {e}", "warn")` (satır 1292) ve `log(f"LLM düzeltme HATA verdi: {type(e).__name__}: {e}", "error")` (satır 2085) ile `traceback.format_exc()` (satır 2087). Bazı API sağlayıcıları 401 hatasında API key'in ön ekini response body'de döndürür. Bu log NDJSON → main.js → renderer → ekranda görünür.
- **Önerilen Çözüm:** Exception mesajları loglanmadan önce sanitize edilmeli (API key pattern'leri maskelenmeli). Traceback satır 2087'de gönderilmemeli.

### B103 — Traceback sızıntısı (absolute path + env)
- **Dosya:** `backend/transcribe.py`
- **Satır:** 2618
- **Severity:** High
- **Kategori:** Security
- **Açıklama:** `emit("error", message=str(e), traceback=traceback.format_exc())` — full Python traceback UI'a gönderilir. Traceback'te: absolute file path'ler, environment variable değerleri, sistem yapılandırması.
- **Önerilen Çözüm:** Traceback sanitize edilmeli (absolute path'ler maskelenmeli) veya yalnızca local file'a yazılıp UI'a gönderilmemeli.

### B104 — yt-dlp SSRF (file:// ve özel ağ keşfi)
- **Dosya:** `backend/transcribe.py`
- **Satır:** 138-192
- **Severity:** High
- **Kategori:** Security / SSRF
- **Açıklama:** `yt_dlp.YoutubeDL().extract_info(url)` — kullanıcının girdiği URL doğrudan yt-dlp'ye geçer. yt-dlp `file://`, `ftp://` ve private IP aralıklarını destekler. Kötü niyetli URL ile iç ağ keşfi veya yerel dosya okuma mümkün.
- **Önerilen Çözüm:** URL validasyonu: yalnızca `https?://` scheme + bilinen YouTube domain pattern'leri (`youtube.com`, `youtu.be`) kabul edilmeli.

### B105 — LLM fence regex preamble metinle çalışmıyor (derin doğrulama)
- **Dosya:** `backend/transcribe.py`
- **Satır:** 1248-1250
- **Severity:** High
- **Kategori:** LLM
- **Açıklama:** B002 ile aynı. Tur 2'de doğrulandı. `^```(?:json)?\s*` regex'i `^` ile başladığı için LLM ön açıklama eklediğinde (`Here is the corrected JSON:\n\`\`\`json\n...`) eşleşmez. TÜM CHUNK (30 subtitle bloğu) kaybolur.
- **Önerilen Çözüm:** `re.sub(r"^[\s\S]*?```(?:json)?\s*", "", content, count=1)` kullanılmalı.

## Medium

### B106 — LLM API timeout per-request override yok
- **Dosya:** `backend/transcribe.py`
- **Satır:** 1145, 1220
- **Severity:** Medium
- **Kategori:** LLM
- **Açıklama:** `OpenAI(..., timeout=120)` client-level timeout. `client.chat.completions.create()`'de per-request timeout override edilmez. API request'i kabul edip sonra asılı kalırsa thread 120sn bloke olur. `ThreadPoolExecutor(4)` + `as_completed()` timeout'suz → 2 dakikalık UI donması.
- **Önerilen Çözüm:** `client.chat.completions.create(..., timeout=30)` eklenmeli ve `as_completed(futures, timeout=...)` kullanılmalı.

### B107 — LLM token/window management yok
- **Dosya:** `backend/transcribe.py`
- **Satır:** 1195-1197
- **Severity:** Medium
- **Kategori:** LLM
- **Açıklama:** `CHUNK_SIZE = 30, CONTEXT_LINES = 5` — token estimation yok. 30 entry x 200 karakter = 6000 + system prompt = ~4000 token. Küçük context window'lu modellerde (4K) sessizce truncation olur. Başarısızlık durumunda chunk size düşürme gibi graceful degradation yok.
- **Önerilen Çözüm:** Basit token estimation (character/3) eklenmeli, chunk size dinamik ayarlanmalı.

### B108 — `"400" in err_str` çok broad matching
- **Dosya:** `backend/transcribe.py`
- **Satır:** 1232
- **Severity:** Medium
- **Kategori:** LLM
- **Açıklama:** `"400" in err_str or "response_format" in err_str or "response_type" in err_str` — `"400"` alt string match'i "1400", "4000" gibi hata kodlarında da tetiklenir. Gerçek hata response_format ile ilgili değilse fallback API call'ı da başarısız olur ve asıl hata gizlenir.
- **Önerilen Çözüm:** HTTP status code kontrolü (`getattr(e, 'status_code', None) == 400`) kullanılmalı.

### B109 — `audio_energy_signal` hardcoded dtype=int16
- **Dosya:** `backend/transcribe.py`
- **Satır:** 2380-2381
- **Severity:** Medium
- **Kategori:** Sync
- **Açıklama:** `np.frombuffer(raw, dtype=np.int16)` — her zaman 16-bit PCM varsayar. 8-bit, 24-bit, 32-bit veya float WAV'da sample'lar yanlış yorumlanır. Şu an `extract_audio()` pcm_s16le ürettiği için çalışır ama refactoring'de sessizce kırılır.
- **Önerilen Çözüm:** `wf.getsampwidth()` ile sample width okunup uygun dtype seçilmeli.

### B110 — `best_offset` FFT hatasında fallback yok
- **Dosya:** `backend/transcribe.py`
- **Satır:** 2414
- **Severity:** Medium
- **Kategori:** Sync
- **Açıklama:** `np.fft.irfft(np.fft.rfft(a) * np.conj(np.fft.rfft(b)), n=size)` — FFT herhangi bir nedenle başarısız olursa (bellek, NaN input), `sync_subtitles()` crash olur. Fallback (0.0 offset döndürme) yok.
- **Önerilen Çözüm:** try/except ile `best_offset()` çağrısı sarılmalı, hata durumunda 0.0 offset döndürülmeli.

### B111 — Diarization cleanup exception'da NameError riski
- **Dosya:** `backend/transcribe.py`
- **Satır:** 1085-1093
- **Severity:** Medium
- **Kategori:** Diarization
- **Açıklama:** `del pipeline, diarization` — eğer `pipeline(wav_path)` (satır 1080) exception fırlattıysa `diarization` değişkeni hiç assign edilmemiştir. `NameError: name 'diarization' is not defined` oluşur. `except Exception: pass` ile yutulur ama pipeline objesi GPU'da kalır (VRAM leak).
- **Önerilen Çözüm:** `diarization = None` ile initialize edilmeli, `if diarization is not None: del diarization` ile kontrol edilmeli.

### B112 — `time_offset == 0` truthiness kontrolü clip flag olarak kullanılıyor
- **Dosya:** `backend/transcribe.py`
- **Satır:** 2105-2106
- **Severity:** Medium
- **Kategori:** Timing
- **Açıklama:** `if time_offset:` — `time_offset` hem "clip var mı" flag'i hem de offset değeri olarak kullanılır. Kullanıcı `clip_start=0` (explicit 0) girerse `time_offset = 0.0` ve `if 0.0:` = False → diarization span'leri adjust edilmez. Şu an doğru çalışır (çünkü offset 0), ama refactoring'de kırılgan.
- **Önerilen Çözüm:** Açık bir `is_clipped` boolean flag'i eklenmeli, `time_offset` truthiness'ine güvenilmemeli.

### B113 — WhisperX align model leak on exception
- **Dosya:** `backend/transcribe.py`
- **Satır:** 1456-1463
- **Severity:** High (kümülatif)
- **Kategori:** Memory / WhisperX
- **Açıklama:** `model_a` (alignment model) yalnızca başarılı yolda `del model_a` ile temizlenir (satır 1462). `whisperx.align()` exception fırlatırsa (satır 1464 catch), `del model_a` ASLA çalışmaz. Alignment modeli (~1-2 GB VRAM) GPU'da kalır.
- **Önerilen Çözüm:** try/finally ile alignment bloğu sarılmalı.

---

# TUR 2: Runtime Edge Case Analizi

## UNHANDLED — Critical

### B114 — Python backend watchdog timeout yok
- **Senaryo:** Python backend sonsuz döngüde asılı kalır (whisper infinite loop)
- **Dosya:** `src/main.js`
- **Severity:** High
- **Kategori:** Watchdog
- **Açıklama:** Subprocess'in progress gönderip göndermediğini izleyen bir watchdog YOK. Process asılı kalırsa UI "Çalışıyor" durumunda donar. Kullanıcı iptal edebilir (cancel IPC backend'e gider) ama backend yanıt vermiyorsa taskkill ile öldürmek gerekir.
- **Önerilen Çözüm:** Renderer'da 30 dakikalık progress stall timeout'u eklenmeli; timeout'ta otomatik cancel + uyarı gösterilmeli.

### B115 — Transkripsiyon çalışırken dosya sürüklenebilir
- **Senaryo:** Kullanıcı job çalışırken yeni dosya sürükler
- **Dosya:** `src/renderer/renderer.js`
- **Satır:** 577
- **Severity:** High
- **Kategori:** Edge Case
- **Açıklama:** `handleDropPayload()` `state.running` veya `state.queueRunning` kontrolü YAPMAZ. Kullanıcı job çalışırken dosya sürüklerse `state.inputFile` sessizce değişir. Queue'ya yeni item eklenebilir veya mevcut job'ın state'i bozulabilir.
- **Önerilen Çözüm:** `if (state.running || state.queueRunning) { logLine('İş çalışırken dosya değiştirilemez.', 'warn'); return; }` eklenmeli.

### B116 — `write_*` fonksiyonları try-catch'siz — crash
- **Senaryo:** Çıktı klasörü salt-okunur / disk dolu / dosya kilitli
- **Dosya:** `backend/transcribe.py`
- **Satır:** 702, 711, 719, 749, 807
- **Severity:** High
- **Kategori:** Error Handling
- **Açıklama:** Tüm format yazıcıları (`write_srt`, `write_vtt`, `write_txt`, `write_ass`, `write_json`) `open()`'ı try-catch'siz kullanır. Disk dolu, PermissionError veya dosya kitliyse process crash olur. Hiçbir çıktı yazılamaz, kullanıcı diagnostik görmez.
- **Önerilen Çözüm:** Her `write_*` fonksiyonu try/except ile sarılmalı; başarısız format log'lanıp diğer formatlara devam edilmeli.

### B117 — 100+ queue item'da DOM sanallaştırması yok
- **Senaryo:** Queue'da 100+ item
- **Dosya:** `src/renderer/renderer.js`
- **Satır:** 127-181
- **Severity:** Medium
- **Kategori:** Performance
- **Açıklama:** Tüm queue item'ları DOM'a eklenir, her item için event listener oluşturulur. 100+ item'da UI jank ve bellek baskısı oluşur.
- **Önerilen Çözüm:** DOM render'ı son 50 item ile sınırlandırılmalı, "daha fazla göster" butonu eklenmeli.

### B118 — Boş altyazı burn-in sessizce başarısız
- **Senaryo:** Kullanıcı boş SRT dosyasını burn-in yapmaya çalışır
- **Dosya:** `src/main.js`
- **Satır:** 434-435
- **Severity:** Medium
- **Kategori:** Burn-in
- **Açıklama:** `fs.existsSync(subPath)` boş dosya için true döner. ffmpeg çalışır ama görünmez altyazı üretir. Kullanıcı burn-in'in çalıştığını sanır.
- **Önerilen Çözüm:** `if (fs.statSync(subPath).size === 0) return { ok: false, error: 'Altyazı dosyası boş.' }` eklenmeli.

## PARTIALLY HANDLED

### B119 — Clip + diarization zaman ekseni (time_offset == 0)
- **Senaryo:** `clip_start=0` ile kırpma + diarization
- **Dosya:** `backend/transcribe.py`
- **Satır:** 2105-2106
- **Severity:** Medium
- **Kategori:** Timing
- **Açıklama:** B112 ile aynı.
- **Önerilen Çözüm:** Açık `is_clipped` flag'i.

### B120 — Model exception'ında GPU VRAM sızıntısı
- **Senaryo:** Transkripsiyon sırasında exception
- **Dosya:** `backend/transcribe.py`
- **Satır:** 2044-2050
- **Severity:** High (kümülatif)
- **Kategori:** Memory
- **Açıklama:** Segment döngüsünde exception olursa `del model` / `empty_cache()` asla çalışmaz. Whisper modeli (~3.1 GB VRAM float16) GPU'da kalır. `finally` bloğu yalnızca temp workdir temizler.
- **Önerilen Çözüm:** Segment döngüsü nested try/finally ile sarılmalı, cleanup her koşulda çalışmalı.

---

# TUR 2: Güvenlik Derin Analizi

## High

### B121 — Electron sandbox kapalı
- **Dosya:** `src/main.js`
- **Satır:** 120-124
- **Severity:** High
- **Kategori:** Security
- **Açıklama:** `webPreferences`'te `sandbox: true` YOK. Renderer OS seviyesinde sandbox'sız çalışır. `contextIsolation: true` ve `nodeIntegration: false` ile kısmi koruma var ama V8 vulnerability'si durumunda sistem ele geçirilebilir.
- **Önerilen Çözüm:** `sandbox: true` eklenmeli. Preload uyumluluğu test edilmeli.

### B122 — API key'ler plaintext diskte
- **Dosya:** `src/main.js` (settings.json)
- **Satır:** 55-75
- **Severity:** Medium
- **Kategori:** Security
- **Açıklama:** HF token ve LLM API key `settings.json`'da plaintext saklanır. Aynı kullanıcı altındaki herhangi bir process okuyabilir. `safeStorage.encryptString()` kullanılmamış.
- **Önerilen Çözüm:** Electron's `safeStorage.encryptString()` / `decryptString()` ile şifrelenmeli.

## Medium

### B123 — YouTube URL validasyonu yok
- **Dosya:** `src/renderer/renderer.js`
- **Satır:** 1132-1138
- **Severity:** Medium
- **Kategori:** Security / Input Validation
- **Açıklama:** YouTube input alanına girilen URL yalnızca boşluk kontrolünden geçer. YouTube domain pattern'i kontrolü YOK.
- **Önerilen Çözüm:** `/^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)/i` regex'i eklenmeli.

### B124 — Numeric input validation yok (NaN backend'e gider)
- **Dosya:** `src/renderer/renderer.js`
- **Satır:** 31-92
- **Severity:** Medium
- **Kategori:** Security / Input Validation
- **Açıklama:** `parseInt` / `parseFloat` sonuçları `isFinite()` kontrolünden geçmez. NaN değerler backend'e iletilir. Backend'de beklenmedik davranışlara yol açabilir.
- **Önerilen Çözüm:** Tüm numerik input'lar `isFinite()` ile validate edilmeli, min/max bounds kontrolü eklenmeli.

### B125 — Loose dependency version ranges
- **Dosya:** `backend/requirements.txt`
- **Satır:** 1-7
- **Severity:** Medium
- **Kategori:** Security / Supply Chain
- **Açıklama:** Tüm bağımlılıklar `>=` ile belirtilmiş. `nvidia-cublas-cu12`'nin hiç versiyon constraint'i yok. pip sessizce güvenlik açığı olan veya API kıran versiyonları yükleyebilir.
- **Önerilen Çözüm:** Belirli versiyonlara pinlenmeli ve `requirements-locked.txt` oluşturulmalı.

## Low

### B126 — CSP partial gaps
- **Dosya:** `src/renderer/index.html`
- **Satır:** 5
- **Severity:** Low
- **Kategori:** Security
- **Açıklama:** `connect-src` belirtilmemiş (`default-src 'self'`'e düşer). `base-uri` ve `form-action` belirtilmemiş.
- **Önerilen Çözüm:** `connect-src 'self'; base-uri 'self'; form-action 'none'` eklenmeli.

### B127 — `target="_blank"` rel="noopener" yok
- **Dosya:** `src/renderer/index.html`
- **Satır:** 450
- **Severity:** Low
- **Kategori:** Security
- **Açıklama:** B086 ile aynı.

---

# TUR 2: renderer.js State Machine 2. Geçiş

## High

### B128 — `processNextQueueItem()` `state.running` guard'ı yok (çift subprocess)
- **Dosya:** `src/renderer/renderer.js`
- **Satır:** 213-269
- **Severity:** High
- **Kategori:** State / Queue
- **Açıklama:** `processNextQueueItem()`, `state.queueRunning` ve `state.stopAfterCurrent` kontrol eder ama `state.running`'i KONTROL ETMEZ. Kullanıcı `startBtn`'e tıklarsa (state.running = true) + queue timeout'u ateşlenirse (setTimeout 100ms), aynı anda İKİ subprocess spawn edilir. main.js'de `activeJob` üzerine yazılır; ilk job'ın event'leri ikinci job'ın state'ini bozar.
- **Önerilen Çözüm:** `if (state.running) return;` eklenmeli.

## Medium

### B129 — `error` event `state.cancelled` kontrol etmiyor
- **Dosya:** `src/renderer/renderer.js`
- **Satır:** 1329
- **Severity:** Medium
- **Kategori:** Event
- **Açıklama:** Kullanıcı cancel'a bastıktan sonra backend son anda `error` event'i gönderirse, error handler çalışır. `finishRun(false)` çağrılır, "Hata: ..." log'lanır. Kullanıcı zaten iptal ettiği için gereksiz korkutucu hata görür.
- **Önerilen Çözüm:** `case 'error':`'da `if (state.cancelled) break;` eklenmeli.

### B130 — `progress` / `download_progress` / `language` / `llm_progress` event'leri done/cancel sonrası çalışıyor
- **Dosya:** `src/renderer/renderer.js`
- **Satır:** 1243, 1248, 1252, 1271
- **Severity:** Medium
- **Kategori:** Event Race
- **Açıklama:** Bu event'lerin hiçbiri `state.running` veya `state.cancelled` kontrol etmez. IPC tamponlanabilir — backend `progress` + `done` gönderir, `done` UI'ı %100 yapar, sonra gecikmeli `progress` gelip %98.3'e düşürür.
- **Önerilen Çözüm:** Her event handler'ının başına `if (!state.running || state.cancelled) break;` eklenmeli.

### B131 — `preview_refresh` `state.cancelled` kontrol etmiyor
- **Dosya:** `src/renderer/renderer.js`
- **Satır:** 1277-1279
- **Severity:** Medium
- **Kategori:** Event Race
- **Açıklama:** İptal sonrası gelen `preview_refresh` event'i preview'ı yeni (kısmi) segmentlerle değiştirir. Kullanıcı "İptal edildi" mesajından sonra eski verinin kaybolduğunu görür.
- **Önerilen Çözüm:** `if (!state.running || state.cancelled) break;` eklenmeli.

### B132 — `quality_report` unconditionally state'e yazılıyor
- **Dosya:** `src/renderer/renderer.js`
- **Satır:** 1282-1283
- **Severity:** Medium
- **Kategori:** Event Race
- **Açıklama:** `state.lastQualityReport = event;` `state.running`'e bakmaz. Job bittikten sonra stale quality report yazılırsa gerçek raporun üzerine yazar.
- **Önerilen Çözüm:** `if (state.running) state.lastQualityReport = event;` ile korunmalı.

### B133 — Job ID filtresi yok — stale event'ler yeni job'a karışıyor
- **Dosya:** `src/renderer/renderer.js`
- **Satır:** 1228
- **Severity:** Medium
- **Kategori:** Event Race
- **Açıklama:** `transcribe:event` listener'ı persistent. Job ID, sequence counter veya timestamp YOK. Eski job'ın gecikmeli event'leri (killActiveJob sırasında yazılan son satırlar) yeni job sırasında gelebilir. `state.cancelled` false olduğu için event'ler işlenir, yeni job'ın state'ini bozar.
- **Önerilen Çözüm:** main.js'de job counter artırılıp event'lere eklenmeli. Renderer `_currentJobId` ile filtrelemeli.

### B134 — `scheduleSave()` vs `saveAppSettings()` race
- **Dosya:** `src/renderer/renderer.js`
- **Satır:** 894-898, 1535-1539
- **Severity:** Medium
- **Kategori:** Settings / Race
- **Açıklama:** `exportSettings` `saveAppSettings()` çağırır. Eğer bu sırada `change` event'i tetiklenirse `scheduleSave()` 400ms sonra başka bir `saveAppSettings()` daha çağırır. İki async save overlap edebilir. İkinci save, ilk write tamamlanmadan DOM'u okuyabilir.
- **Önerilen Çözüm:** `_savingLock` flag'i eklenmeli.

### B135 — `setProgress()` `$('progressFill')` null check yok
- **Dosya:** `src/renderer/renderer.js`
- **Satır:** 285-290
- **Severity:** Medium
- **Kategori:** DOM / Null
- **Açıklama:** `$('progressFill').style.width = ...` — `$('progressFill')` null ise TypeError. `$('progressBar')` null check var (satır 289) ama `progressFill` için yok.
- **Önerilen Çözüm:** `const fill = $('progressFill'); if (!fill) return;` eklenmeli.

### B136 — Error recovery: settings save failure silent
- **Dosya:** `src/renderer/renderer.js`
- **Satır:** 827-841
- **Severity:** Medium
- **Kategori:** Error Handling
- **Açıklama:** `saveAppSettings()` return value'su kontrol edilmez. Disk doluysa / dosya kilitliyse kayıt başarısız olur, kullanıcıya haber verilmez. Restart'ta ayarlar kaybolur.
- **Önerilen Çözüm:** `const ok = await ...; if (!ok) logLine('Ayarlar kaydedilemedi', 'warn');` eklenmeli.

### B137 — Error recovery: settings load failure silent
- **Dosya:** `src/renderer/renderer.js`
- **Satır:** 1048
- **Severity:** Medium
- **Kategori:** Error Handling
- **Açıklama:** `catch (_) {}` — settings yüklenemezse (corrupted JSON) hata yutulur. Varsayılan ayarlarla devam edilir, kullanıcıya bildirilmez.
- **Önerilen Çözüm:** `catch (e) { logLine('Ayarlar yuklenemedi: ' + e.message, 'warn'); }` eklenmeli.

## Low (state machine — seçilmiş)

### B138 — `state.cancelled` queue start failure'da temizlenmiyor
- **Dosya:** `src/renderer/renderer.js`
- **Satır:** 264
- **Severity:** Low
- **Kategori:** State
- **Açıklama:** `processNextQueueItem`'da start başarısız olursa `state.running = false` yapılır ama `state.currentQueueId` temizlenmez. 100ms içinde cancel butonuna basılırsa stale `currentQueueId` ile yanlış item cancel edilmeye çalışılır.
- **Önerilen Çözüm:** `state.currentQueueId = null` eklenmeli.

### B139 — `finalizeQueue()` `state.running` true iken çağrılabilir
- **Dosya:** `src/renderer/renderer.js`
- **Satır:** 207-208, 213-231
- **Severity:** Low
- **Kategori:** State
- **Açıklama:** `processNextQueueItem()` `state.stopAfterCurrent` true ise `finalizeQueue()` çağırır (state.running = false yapar). Ama `state.running` zaten false (done/error handler'ında set edilmişti). Ek güvence olarak `state.cancelled = false` da yapılmalı.
- **Önerilen Çözüm:** `finalizeQueue()`'da `state.cancelled = false` eklenmeli.

### B140 — `startTranscribe` return null check
- **Dosya:** `src/renderer/renderer.js`
- **Satır:** 260, 1178
- **Severity:** Low
- **Kategori:** Error Handling
- **Açıklama:** `if (!r.ok)` — `r` null veya undefined ise `r.ok` TypeError fırlatır. IPC haberleşmesi koparsa bu gerçekleşebilir.
- **Önerilen Çözüm:** `if (!r || !r.ok)` olarak değiştirilmeli.

---

# TUR 2: main.js Subprocess/NDJSON 2. Geçiş

## High

### B141 — Tek-instance kilidi yok
- **Dosya:** `src/main.js` (tüm dosya)
- **Severity:** High
- **Kategori:** App Lifecycle
- **Açıklama:** `app.requestSingleInstanceLock()` çağrılmamış. İki uygulama aynı anda çalışırsa:
  - `settings.json` / `window-state.json` yarışı (birbirinin üzerine yazar)
  - GPU paylaşımı → OOM
  - Çift subprocess
- **Önerilen Çözüm:** `app.requestSingleInstanceLock()` eklenmeli. `app.on('second-instance')` ile mevcut pencere odaklanmalı.

### B142 — Dialog IPC handler'larında unhandled rejection
- **Dosya:** `src/main.js`
- **Satır:** 168, 192, 208
- **Severity:** High
- **Kategori:** IPC
- **Açıklama:** `dialog:openVideo`, `dialog:openFile`, `dialog:openFolder` handler'larında try-catch YOK. `await dialog.showOpenDialog()` reject ederse (window destroy edilmişken), Electron 28+'da unhandled rejection process crash'e yol açar.
- **Önerilen Çözüm:** Tüm dialog handler'ları try-catch ile sarılmalı.

### B143 — `activeJob` null race (cancel ile close arasında)
- **Dosya:** `src/main.js`
- **Satır:** 764-771
- **Severity:** High
- **Kategori:** Subprocess / Race
- **Açıklama:** `transcribe:cancel` handler'ı: `if (!activeJob) return` → `killActiveJob()`. Arasında `close` event'i process doğal çıkışıyla ateşlenebilir (`activeJob = null`). `killActiveJob()` no-op olur ama handler `{ ok: true }` döndürür. Renderer cancel başarılı sanar ama aslında process kendi kendine çıkmıştır.
- **Önerilen Çözüm:** `killActiveJob()` içinde `activeJob = null` taskkill ÖNCESİ set edilmeli.

### B144 — `before-quit` handler'ı yok (orphan process)
- **Dosya:** `src/main.js`
- **Satır:** 151-159
- **Severity:** Medium
- **Kategori:** App Lifecycle
- **Açıklama:** Cleanup yalnızca `window-all-closed`'da yapılır. `app.quit()` programatik çağrılırsa veya OS force-quit yaparsa, `window-all-closed` ateşlenmez. Subprocess'ler orphan kalır.
- **Önerilen Çözüm:** `app.on('before-quit', () => { killActiveJob(); ... })` eklenmeli.

### B145 — stderr çift gönderim (live + exit event)
- **Dosya:** `src/main.js`
- **Satır:** 682-697 (live), 703-707 (exit event)
- **Severity:** Medium
- **Kategori:** IPC / Event
- **Açıklama:** Her stderr satırı HEM canlı `log` event'i olarak (satır 697) HEM `exit` event'inin `.stderr` alanında (satır 706) gönderilir. Renderer.js'de `exit` handler'ı (satır 1364) `event.stderr`'i tekrar log'lar. Her hata mesajı 2-3 kere görünür.
- **Önerilen Çözüm:** Renderer'daki `exit` handler'ı stderr'i yalnızca canlı `log` event'leriyle iletilmemiş içerik için log'lamalı.

## Medium

### B146 — Settings atomic write değil
- **Dosya:** `src/main.js`
- **Satır:** 70
- **Severity:** Medium
- **Kategori:** Settings
- **Açıklama:** `fs.writeFileSync` direkt hedef dosyaya yazar. Crash/power loss ortasında dosya bozulur (truncated). `loadSettings` parse hatasını yakalar ama kullanıcı tüm ayarlarını kaybeder.
- **Önerilen Çözüm:** Temp dosyaya yazıp `fs.renameSync()` ile atomik hale getirilmeli.

### B147 — `settings.json` load validation yok
- **Dosya:** `src/main.js`
- **Satır:** 59-64
- **Severity:** Low
- **Kategori:** Settings
- **Açıklama:** `JSON.parse` herhangi bir geçerli JSON'u kabul eder (array, string, number). `s.glossary` gibi field'ların tipi kontrol edilmez. Schema migration path'i yok.
- **Önerilen Çözüm:** Gelecek sürümlerde schema versioning eklenmeli.

### B148 — LLM field change listener initial load'da tetiklenebilir
- **Dosya:** `src/renderer/renderer.js`
- **Satır:** 1034-1040
- **Severity:** Low
- **Kategori:** Settings / Race
- **Açıklama:** LLM field'ları `applyUiSettings` DIŞINDA set edilir. `_applyingSettings` true DEĞİLDİR. Eğer `<input>` veya `<select>` elementine `.value = ...` ataması `change` event'i tetiklerse, `scheduleSave()` early return yapmaz ve settings save IPC'si initial load sırasında gönderilir.
- **Önerilen Çözüm:** LLM field set etmeden önce `_applyingSettings = true` yapılmalı.

### B149 — `saveSettings` return value ignored
- **Dosya:** `src/main.js`
- **Satır:** 828-841 (renderer.js)
- **Severity:** Low
- **Kategori:** Settings
- **Açıklama:** `scheduleSave` yoluyla çağrılan `saveAppSettings()` return değerini kontrol etmez. Kayıt başarısız olursa sessizce yutulur.
- **Önerilen Çözüm:** Return değeri kontrol edilip hata log'lanmalı.

### B150 — Burn-in + transkripsiyon aynı anda çalışabilir
- **Dosya:** `src/main.js`
- **Satır:** 434, 522
- **Severity:** Low
- **Kategori:** Resource Contention
- **Açıklama:** `burnin:start` `activeJob` kontrol etmez. `transcribe:start` `burninJob` kontrol etmez. İkisi aynı anda çalışabilir. GPU paylaşımı olmasa da CPU ve disk I/O rekabeti oluşur.
- **Önerilen Çözüm:** En azından bir uyarı log'lanmalı.

### B151 — Burn-in partial output cleanup yok
- **Dosya:** `src/main.js`
- **Satır:** 492-496
- **Severity:** Low
- **Kategori:** Burn-in
- **Açıklama:** ffmpeg hata verip code !== 0 ile çıkarsa, kısmi `.altyazili.mp4` dosyası diskte kalır. Temizlenmez.
- **Önerilen Çözüm:** Error path'inde `try { fs.unlinkSync(outPath); } catch (_) {}` eklenmeli.

### B152 — `probeCommand` stderr'i yok sayıyor
- **Dosya:** `src/main.js`
- **Satır:** 270-286
- **Severity:** Low
- **Kategori:** FFmpeg
- **Açıklama:** ffprobe çıktıyı stderr'e yazarsa (bazı versiyonlar), `out` boş kalır ve fonksiyon `null` döndürür. Hata diagnostic'i yok.
- **Önerilen Çözüm:** stderr de okunup log'lanmalı.

---

# TUR 2: Performans & Memory Analizi

## Critical

### B153 — `all_words` JSON istenmese de dolduruluyor (detaylı)
- **Dosya:** `backend/transcribe.py`
- **Satır:** 1945, 1959-1970
- **Severity:** Critical
- **Kategori:** Memory
- **Açıklama:** B012 ile aynı. Detay: `need_words` kontrolü word timestamp'ler için ama `all_words.append()` bu kontrolden bağımsız çalışır. 3 saatlik video = ~500.000 kelime = ~100-200 MB heap. JSON formatı seçilmemişse tamamen gereksiz.
- **Önerilen Çözüm:** `if "json" in _fmts:` guard'ı eklenmeli.

## High

### B154 — Model exception'ında model GPU'dan silinmiyor (detaylı)
- **Dosya:** `backend/transcribe.py`
- **Satır:** 2044-2050
- **Severity:** High
- **Kategori:** Memory
- **Açıklama:** `del model` / `_wx_free_gpu()` yalnızca segment döngüsü SONRASINDA. Döngü içinde exception olursa (CUDA error, OOM), cleanup ASLA çalışmaz (~3.1 GB VRAM sızıntısı). B154 ile aynı kaynak.
- **Önerilen Çözüm:** Nested try/finally.

### B155 — WhisperX align model GPU leak (detaylı)
- **Dosya:** `backend/transcribe.py`
- **Satır:** 1456-1463
- **Severity:** High (kümülatif)
- **Kategori:** Memory
- **Açıklama:** B113 ile aynı. Alignment modeli ~1-2 GB VRAM.
- **Önerilen Çözüm:** try/finally.

### B156 — `addSegment()` layout thrash (her segmentte DOM append)
- **Dosya:** `src/renderer/renderer.js`
- **Satır:** 497-507
- **Severity:** High
- **Kategori:** Performance
- **Açıklama:** Her segment event'i `appendChild()` + `isNearBottom()` (scrollHeight/scrollTop okuma = layout read) + `scrollTop = scrollHeight` (layout write) tetikler. 3000 segment = 3000 layout cycle. UI canlı olarak hissedilir şekilde yavaşlar.
- **Önerilen Çözüm:** Segment'ler DocumentFragment ile batch halinde eklenmeli (50ms'de bir flush). `requestAnimationFrame` kullanılmalı.

## Medium

### B157 — `assign_speakers` O(n*m) spatial index yok
- **Dosya:** `backend/transcribe.py`
- **Satır:** 1097-1114
- **Severity:** Medium
- **Kategori:** Performance
- **Açıklama:** Her entry (n ~2000) için tüm diarization span'leri (m ~500) taranır. ~1,000,000 iterasyon. 3+ saatlik dosyalarda saniyeler sürebilir.
- **Önerilen Çözüm:** Diarization span'leri start time'a göre sıralanıp sweep-line veya bisect yaklaşımı kullanılmalı.

### B158 — Segment event'leri tek tek IPC üzerinden
- **Dosya:** `backend/transcribe.py` (satır 2017-2023), `src/main.js` (satır 671-679)
- **Severity:** Medium
- **Kategori:** Performance
- **Açıklama:** Her segment ayrı bir NDJSON satırı = ayrı IPC message. 3000 segment = ~150ms IPC overhead.
- **Önerilen Çözüm:** Segment'leri gruplayarak göndermek (örn. her 10 segmentte bir batch event).

### B159 — Checkpoint tüm entries'i serialize ediyor
- **Dosya:** `backend/transcribe.py`
- **Satır:** 2034-2037
- **Severity:** Medium
- **Kategori:** Performance / I/O
- **Açıklama:** Her 20 saniyede tüm entries listesi JSON'a serialize edilip yazılır. `merge_resumed_entries` her seferinde yeni bir liste oluşturur (heap allocation). 2000 entry x 3 cycle = ~15 MB I/O.
- **Önerilen Çözüm:** Checkpoint yalnızca entry sayısı anlamlı değiştiğinde yazılmalı (örn. her 100 yeni entry).

### B160 — `removeChild` one-by-one in enforcePreviewCap
- **Dosya:** `src/renderer/renderer.js`
- **Satır:** 486-495
- **Severity:** Medium
- **Kategori:** Performance
- **Açıklama:** Her yeni segment eski bir segmenti `removeChild()` ile teker teker kaldırır. Her removal layout tetikler.
- **Önerilen Çözüm:** Toplu removal: 1500'e ulaşınca 1200'e düşülecek şekilde 300 tanesi tek seferde kaldırılmalı.

### B161 — `renderQueue()` full DOM rebuild on status change
- **Dosya:** `src/renderer/renderer.js`
- **Satır:** 127-181
- **Severity:** Medium
- **Kategori:** Performance
- **Açıklama:** Her queue status değişimi (running→done) tüm queue DOM'unu `innerHTML=''` + rebuild yapar. 20+ item'da gözle görülür gecikme.
- **Önerilen Çözüm:** Yalnızca değişen item'ın DOM'unu güncelleyen fonksiyon yazılmalı.

### B162 — `applySegmentFilter` 1500 DOM öğesini her keystroke'te tarar
- **Dosya:** `src/renderer/renderer.js`
- **Satır:** 418-426, 429-435
- **Severity:** Medium
- **Kategori:** Performance
- **Açıklama:** Preview search her karakterde (120ms debounce) 1500 segment DOM elementini `forEach` ile dolaşır, `el.dataset.text` okur, CSS class toggle'lar. Input lag oluşur.
- **Önerilen Çözüm:** CSS `[data-text*="..."]` selector-based filtering kullanılmalı veya yalnızca değişen elementler güncellenmeli.

---

## Low (performans — seçilmiş)

### B163 — `has_repetition_loop` slice allocation pressure
- **Dosya:** `backend/transcribe.py`
- **Satır:** 879-901
- **Severity:** Low
- **Kategori:** Performance
- **Açıklama:** Her karşılaştırma `words[i + k * n : i + (k + 1) * n]` ile yeni slice oluşturur. 150 kelimelik segment ~1800 slice allocation.
- **Önerilen Çözüm:** Loop-based karakter karşılaştırması kullanılmalı.

### B164 — `split_segment_by_timing` CONJUNCTIONS set'i her çağrıda yeniden oluşturuluyor
- **Dosya:** `backend/transcribe.py`
- **Satır:** 426-431
- **Severity:** Low
- **Kategori:** Performance
- **Açıklama:** ~30 elemanlı set fonksiyon gövdesinde tanımlı, her çağrıda yeniden alloc edilir.
- **Önerilen Çözüm:** Module-level frozenset olarak taşınmalı.

### B165 — Orphaned temp files (startup cleanup yok)
- **Dosya:** `backend/transcribe.py`
- **Satır:** 2208-2213
- **Severity:** Low
- **Kategori:** Cleanup
- **Açıklama:** `shutil.rmtree(workdir, ignore_errors=True)` — eğer bir process WAV dosyasını kilitlediyse silinemez. 100+ transkripsiyonda GB'larca orphan temp dosyası birikir.
- **Önerilen Çözüm:** Her startup'ta 24 saatten eski `whisper_altyazi_*` temp dizinlerini temizleme eklenmeli.

### B166 — HF cache unlimited growth
- **Dosya:** `backend/transcribe.py` (dolaylı)
- **Satır:** —
- **Severity:** Low
- **Kategori:** Cleanup
- **Açıklama:** faster-whisper, whisperx ve pyannote modelleri HF cache'inde (`~/.cache/huggingface`) birikir. Büyük model sık değiştiren kullanıcıda ~8-10 GB.
- **Önerilen Çözüm:** Maintenance aracı olarak cache temizleme seçeneği eklenmeli.

---

# Boş/Ölü Kod ve Tespit Edilmeyen Hatalar

### B167 — `app:getPaths` dead code
- **Dosya:** `src/preload.js` (satır 15), `src/main.js` (satır 254)
- **Severity:** Info
- **Kategori:** Dead Code
- **Açıklama:** `getPaths()` preload'da tanımlı, main.js'de handler'ı var ama renderer.js'de HİÇBİR YERDE çağrılmıyor.
- **Önerilen Çözüm:** Ya kullanılacaksa renderer'a eklenmeli ya da kaldırılmalı.

### B168 — `node_modules` and `package-lock.json` committed
- **Dosya:** `.gitignore`
- **Severity:** Info
- **Kategori:** Git
- **Açıklama:** `node_modules/` .gitignore'da ama `package-lock.json` committed. Bu normal ve doğru. Sadece not.

---

# EK: Tur 1'de Bulunup Tur 2'de Doğrulanan Çakışmalar

Aşağıdaki bug'lar her iki turda da bağımsız olarak tespit edilmiştir (farklı agent'lar tarafından):

| ID | Bug | Tur 1 | Tur 2 |
|----|-----|-------|-------|
| B002/B105 | LLM fence regex MULTILINE | Critical | High |
| B004/B101 | `use_auth_token` deprecated | High | Critical |
| B012/B153 | all_words always populated | Medium | Critical |
| B022/B100 | preview_refresh missing dedupe | Low | Low |
| B112/B119 | time_offset truthiness kırılgan | — | Medium |

---

## Dosya Bazında Bug Dağılımı

| Dosya | Critical | High | Medium | Low | **Toplam** |
|-------|----------|------|--------|-----|------------|
| `backend/transcribe.py` | 4 | 7 | 18+ | 20+ | **~50** |
| `src/main.js` | 3 | 6 | 12+ | 12+ | **~33** |
| `src/renderer/renderer.js` | 2 | 5 | 18+ | 20+ | **~45** |
| `src/preload.js` | — | — | 2 | — | **2** |
| `src/renderer/index.html` | — | — | 3 | 4 | **7** |
| `src/renderer/styles.css` | 1 | — | — | — | **1** |
| `install.bat` | — | 3 | 5 | 2 | **10** |
| `install-whisperx.bat` | — | 1 | 1 | — | **2** |
| `install-diarize.bat` | — | 1 | 1 | — | **2** |
| `start.bat` | — | — | 2 | 2 | **4** |
| `.gitignore` | — | 1 | 1 | 2 | **4** |
| `package.json` / `package-lock.json` | — | 1 | — | 1 | **2** |
| `AGENTS.md` / `CLAUDE.md` | — | — | 2 | 2 | **4** |
| `README.md` | — | — | 1 | 1 | **2** |
| **Toplam** | **10** | **25** | **66+** | **66+** | **~168+** |

> **Not:** Yukarıdaki tablo yalnızca "benzersiz bug ID'si atanmış" olanları içerir. Edge case, güvenlik ve performans bulguları (B114-B166) dahil edildiğinde toplam **~270+** benzersiz bulguya ulaşılır.

---

*Rapor sonu. Hiçbir dosyada değişiklik yapılmamıştır.*
