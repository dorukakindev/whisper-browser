# Rapor 547 — Kodu değiştirmeden 100 hedefli gece testi

Tarih: 2026-10-25 04:44 (yerel). Repo: https://github.com/dorukakindev/whisper-browser. Dal: `master`.
Başlangıç ve bitiş ürün kodu kimliği: `490c2f843d7145b05e010f43e0e5492be67f8bf1` (bu turda `src/`, `backend/`, `tests/`, `install.bat`, `start.bat` ve `package.json` değişmedi).
Kapsam: kullanıcının istediği 10 grup × 10 senaryo = **100 gerçek koşum**; yalnız geçici probe'lar ve bu rapor üretildi.

## Sonuç

| Durum | Sayı |
|---|---:|
| PASS | 98 |
| FAIL_CONFIRMED | 2 |
| R-DUP (bilinen kökün tekrarı) | 0 |
| BLOCKED_ENV | 0 |
| **Toplam** | **100** |

İki başarısızlık **çalışma zamanı ürün hatası değil, test sözleşmesi kaymasıdır**: `tests/ipc-parity.test.js` ve `tests/csp-policy.test.js` yeni özelliklerden sonra güncellenmemiş. Yine de `npm test` bu iki dosya yüzünden kırmızı kalır; test tarafında onarım gerekir.

## Yöntem

- Her senaryo gerçekten koşuldu: Node `node:test` dosyaları, Python `unittest`/script dosyaları, gerçek `registerMediaWorkflows` servisi, gerçek `backend/media_shelf.py` alt süreci, gerçek `transcribe.py` saf fonksiyonları ve jsdom.
- 100 satırın her biri ayrı bir `id` ile `results.jsonl`'ye yazıldı; T100 bu matrisi okuyup 99 önceki satırın benzersiz/tam olduğunu doğruladı.
- Probe'lar yalnız `C:\Users\K\AppData\Local\Temp\opencode\overnight-547\` altında; depoya eklenmedi. Ürün/test dosyalarında `git diff` boştur.
- Zaman aşımı: Node 240 sn, Python 300 sn, probe 120 sn; hiçbir koşum zaman aşımına düşmedi.
- T12–T15, T18, T19, T67 ve T70 kaynak sözleşmesi + gerçek fonksiyon karışımıdır (aşağıda tek tek belirtildi). Diğer tüm satırlar dinamik davranış koşumudur.

## Bulgular

### F547-01 — `ipc-parity` testi çift tırnaklı handler kaydını görmüyor (T62)

- Kanıt: `node tests/ipc-parity.test.js` → `AssertionError: handler'ı olmayan invoke kanalları: media-workflows:request`.
- Kök neden: `tests/ipc-parity.test.js:36` yalnız `ipcMain.handle\(\s*'([^']+)'` (tek tırnak) tarıyor. `src/media-workflows.js:468` kanalı **çift tırnakla** kaydediyor: `ipcMain.handle("media-workflows:request", ...)`. PR485 (`c8f1ec3e`) ile gelen kayıt bu yüzden taranmıyor.
- Etki: ürün çalışır; test yanlış pozitif verir ve `npm test` kırmızı olur.
- Öneri (uygulanmadı): test regex'ini tek/çift tırnağı kapsayacak şekilde genişletmek veya handler taramasını `ipcMain.handle(` + tırnak sınıfı ile yapmak. Ürün kodunda değişiklik gerekmez.

### F547-02 — `csp-policy` testi `whisper-media:` iznini tanımıyor (T64)

- Kanıt: `node tests/csp-policy.test.js` → `connect-src` gerçek değeri `["'self'","https:","whisper-pdf:","whisper-media:"]`, beklenen `["'self'","https:","whisper-pdf:"]`.
- Kök neden: `src/renderer/index.html:5` CSP'sine `whisper-media:` şeması eklenmiş (`6baa49de`, yerel medya özelliği); `tests/csp-policy.test.js:31` beklenen listesi güncellenmemiş.
- Etki: CSP hâlâ katı (`script-src 'self'`, `object-src 'none'`, `base-uri 'none'`, `form-action 'none'`); test yanlış pozitif verir.
- Öneri (uygulanmadı): beklenen `connect-src` listesine `whisper-media:` eklemek ve bunun yalnız yerel medya için olduğunu test yorumunda belirtmek.

### Elenen yanlış pozitifler (ürün hatası değil)

Koşum sırasında beş probe varsayımı ürün davranışıyla uyuşmadı; her biri ürün lehine doğrulandı ve düzeltildi:

1. Sanal ızgarada `End/Home` tuşları olay hedefi olarak ızgara kabına gönderildiğinde çalışmıyor; gerçek kullanımda olay odaklı karttan kabarcıklanır (`media-virtual-grid.js` `event.target.closest`). Karttan gönderildiğinde `End→4999`, `Home→0`, `ArrowRight→1` doğrulandı.
2. `wrap_text(..., "balanced")` 20 kelimeyi 2 satırda `max_line_width` altında tutamaz; `max_lines=2` sınırı gereği ikinci satır taşar. Metin kaybı yok.
3. ASS yazıcısı `{`/`}` karakterlerini override etiketi saymamak için tam genişlikli `｛｝` biçimine çeviriyor; bu kasıtlı kaçış.
4. `shift_srt_entries(..., -2.0)` tamamen negatife düşen ilk cue'yu doğru şekilde atıyor; kalan cue kaymıyor.
5. `sanitize_glossary_terms` 200 karakterlik terimi atmıyor, 120 karaktere kırpıyor; tasarım sınırı bu.

## 100 testin satır satır sonucu

Aşağıdaki tabloda `node` mevcut test dosyası, `python` mevcut Python testi, `probe`/`pyp` bu turda yazılan geçici gerçek davranış probe'u, `batch` birden çok regresyon dosyasıdır.

### Grup 1 (T01–T10)

| Test | Durum | Yöntem / kanıt |
|---|---|---|
| T01 | PASS | probe · gerçek 2 sayfalık PDF içe aktarıldı; pageNumber 1..2 korundu; [1] seçimi kalıcı; aralık dışı reddedildi |
| T02 | PASS | probe · yeni projede `selectedChapters` yok; UI `|| [0]` ile yalnız ilk bölümü seçiyor; açık [0] kalıcı |
| T03 | PASS | probe · düzenlenen metin `pending` kalıyor; eski ses yakalanmıyor; kaynak dosya byte düzeyinde aynı |
| T04 | PASS | node · tests/dub-reference-pairing.test.js |
| T05 | PASS | python · tests/test_book_narration.py (2 test) |
| T06 | PASS | probe · narration isteği `naturalSpeech=false/autoFit=false/detailed`; SRT'de her kelime ve noktalama korunuyor |
| T07 | PASS | probe · karışık ready/review grupları `review`; M4B dışa aktarma reddedildi; ses dinlenebilir kaldı |
| T08 | PASS | probe · üretilen grup zamanları `{start,end,key,status}` olarak eşlendi |
| T09 | PASS | probe · 12.5 sn konum kalıcı; -1/Infinity/200000/'3' ve geçersiz bölüm reddedildi |
| T10 | PASS | probe · aynı metin aynı SRT kimliği, farklı iş kimliği; yalnız review grupları yeniden kuyruğa alındı |

### Grup 2 (T11–T20)

| Test | Durum | Yöntem / kanıt |
|---|---|---|
| T11 | PASS | probe · CRLF SRT 2 cue (1.5–3.25 sn), Türkçe metin bozulmadı, dosya byte aynı |
| T12 | PASS | probe · hizalama sonucu `result.cues` olarak tüketiliyor (eski `.times` değil); before/after örnekleri cue'lardan |
| T13 | PASS | probe · hizalama ve intro taraması kaynak size/mtime'ı yeniden ölçüp değişikliği reddediyor |
| T14 | PASS | probe · `referenceIndex` her referansın ofsetini seçiyor; `fromEnd` ofseti süre − maxScan |
| T15 | PASS | probe · önbellek imzası ad+size+mtime içeriyor; cache hit `cached:true`; sonuç `suggestOnly` |
| T16 | PASS | node · tests/media-context-grid.test.js (pencereleme + form dışlama) |
| T17 | PASS | probe · 5000 satırda End→4999, Home→0, ArrowRight→1 odak; düğüm sayısı sınırlı |
| T18 | PASS | probe · seek sprite önbelleği LRU; 8 kayıt veya 24 MiB üstünde tahliye |
| T19 | PASS | probe · bellek sayfası `workingSetBytes` topluyor, baseline tutuyor; sekme askıya alma çağrısı yok |
| T20 | PASS | node · tests/media-shelf-service.test.js |

### Grup 3 (T21–T30)

| Test | Durum | Yöntem / kanıt |
|---|---|---|
| T21 | PASS | python · tests/test_dub_timing.py (14 test) |
| T22 | PASS | python · backend/test_dub_recovery.py (5 test) |
| T23 | PASS | python · backend/test_retry_cancel.py |
| T24 | PASS | node · tests/player-dub-ui.test.js |
| T25 | PASS | node · tests/browser-dub-audio.test.js |
| T26 | PASS | probe · olumsuzluk/sayı/para kanıtı korunuyor; boş/null reddedildi; natural mod sınırlı |
| T27 | PASS | python · backend/test_scene_context.py |
| T28 | PASS | node · tests/browser-bulk-edit-locks.test.js |
| T29 | PASS | probe · `ffSubtitlesArg` sürücü iki noktası, eğik çizgi ve tek tırnağı kaçırıyor; Türkçe yol diskte çalışıyor |
| T30 | PASS | node · tests/dub-service.test.js |

### Grup 4 (T31–T40)

| Test | Durum | Yöntem / kanıt |
|---|---|---|
| T31 | PASS | node · tests/assistant-source-context.test.js |
| T32 | PASS | node · tests/assistant-page-command.test.js |
| T33 | PASS | node · tests/assistant-media-command.test.js |
| T34 | PASS | node · tests/assistant-threads.test.js |
| T35 | PASS | node · tests/apinex-provider.test.js |
| T36 | PASS | node · tests/browser-page-translate.test.js |
| T37 | PASS | node · tests/media-taste.test.js |
| T38 | PASS | node · tests/catalog-metadata-sync.test.js |
| T39 | PASS | node · tests/media-home-model.test.js |
| T40 | PASS | node · tests/assistant-overlay.test.js |

### Grup 5 (T41–T50)

| Test | Durum | Yöntem / kanıt |
|---|---|---|
| T41 | PASS | pyp · boş→None; 90/1:30/01:02:03/1:30.5 doğru; -5/abc/4 parça/nan/inf reddedildi |
| T42 | PASS | pyp · kırpma penceresi hesabı doğru; segment/kelime ve diarization span'leri `time_offset` ile kaydı |
| T43 | PASS | pyp · normal Türkçe/İngilizce cümleler korunuyor; abone/kapanış/URL kalıpları filtreleniyor |
| T44 | PASS | pyp · 3+ tekrar yakalanıyor; doğal 2'li vurgu korunuyor; döngü iki tokena indiriliyor |
| T45 | PASS | pyp · 1.5 sn boşlukta bölme 3.5/5.0 sınırlarını koruyor; noktalama bölmesi sınırlı liste döndürüyor |
| T46 | PASS | pyp · cümle modu cümleyi ortadan kırmıyor; iki cümle 2 satır; balanced tüm kelimeleri koruyor |
| T47 | PASS | pyp · çakışan cue'lar çakışmasız hale geliyor; kısa tamamlanmamış cue komşuyla birleşiyor |
| T48 | PASS | pyp · WhisperX sözlük adaptörleri faster-whisper alanlarını sunuyor; NaN/inf zamanlar fallback'e düşüyor |
| T49 | PASS | pyp · aynı girdide önbellek anahtarı sabit; önce/sonra bağlamı veya model değişince farklı |
| T50 | PASS | python · backend/test_output_reexport_all_formats.py |

### Grup 6 (T51–T60)

| Test | Durum | Yöntem / kanıt |
|---|---|---|
| T51 | PASS | pyp · SRT/ASS UTF-8 BOM ile başlıyor; JSON BOM'suz ve Türkçe korunuyor |
| T52 | PASS | pyp · ASS `{`/`}` tam genişlikli forma çeviriyor, ters bölü word-joiner ile kaçıyor; % korunuyor |
| T53 | PASS | pyp · boş cue atılıyor; paralel format listesi indeks hizalı kalıyor |
| T54 | PASS | pyp · negatif kaydırma 0'da sınırlanıyor, tamamen negatif cue atılıyor, sıfır süre engelleniyor |
| T55 | PASS | pyp · cue içindeki CRLF normalize ediliyor; yazılan SRT'de kaçak `\r` yok |
| T56 | PASS | pyp · çift dilli SRT varsayılan çeviri üstte, istenirse kaynak üstte |
| T57 | PASS | pyp · en çok örtüşen konuşmacı ataması doğru; span yoksa boş; ASS konuşmacı stili üretiyor |
| T58 | PASS | node · tests/burnin-output.test.js |
| T59 | PASS | node · tests/burnin-recovery-schema.test.js |
| T60 | PASS | pyp · sözlük büyük/küçük harf duyarsız tekilleşiyor, 120 karaktere kırpılıyor, önbellek anahtarına giriyor |

### Grup 7 (T61–T70)

| Test | Durum | Yöntem / kanıt |
|---|---|---|
| T61 | PASS | node · tests/preload-sandbox.test.js |
| T62 | **FAIL_CONFIRMED** | node · tests/ipc-parity.test.js — çift tırnaklı `media-workflows:request` kaydı taranmıyor (F547-01) |
| T63 | PASS | probe · ebeveyn sırları temizleniyor; anahtarlar yalnız spawn env ile; argv'de `--hf-token`/`--llm-api-key` yok |
| T64 | **FAIL_CONFIRMED** | node · tests/csp-policy.test.js — `whisper-media:` beklenen listede yok (F547-02) |
| T65 | PASS | node · tests/settings-security.test.js |
| T66 | PASS | node · tests/settings-load-corruption.test.js |
| T67 | PASS | probe · `_applyingSettings` yükleme sırasında geri kaydı engelliyor |
| T68 | PASS | node · tests/queue-opts-roundtrip.test.js |
| T69 | PASS | node · tests/queue-lifecycle.test.js |
| T70 | PASS | probe · VRAM model tablosu, int8/float32 çarpanları, 1.35 batch tavanı ve %85 eşiği mevcut |

### Grup 8 (T71–T80)

| Test | Durum | Yöntem / kanıt |
|---|---|---|
| T71 | PASS | node · tests/browser-background-workspace.test.js |
| T72 | PASS | node · tests/browser-capture-queue.test.js |
| T73 | PASS | node · tests/browser-address-model.test.js |
| T74 | PASS | node · tests/browser-youtube-style.test.js |
| T75 | PASS | node · tests/browser-preload-ratchet.test.js |
| T76 | PASS | node · tests/player-time-transform.test.js |
| T77 | PASS | node · tests/report-25-28-regressions.test.js |
| T78 | PASS | node · tests/report480-regressions.test.js |
| T79 | PASS | node · tests/ui-locale-dedupe.test.js |
| T80 | PASS | probe · amber `--accent:#d5a35c` + açık tema geçersiz kılmaları; eski mavi yok; 355 `var(--accent)` |

### Grup 9 (T81–T90)

| Test | Durum | Yöntem / kanıt |
|---|---|---|
| T81 | PASS | probe · 0 byte/kesik/DTD-entity/eksik kitap tanılamalı stderr ile düşüyor, traceback yok |
| T82 | PASS | probe · 10.000 cue SRT 50 ms'de parse edildi; ilk/son cue sağlam |
| T83 | PASS | python · backend/test_pack_sentence_fuzz.py (5 test) |
| T84 | PASS | node · tests/async-timeout.test.js |
| T85 | PASS | probe · ENOSPC/EACCES rename öncesi duruyor, geçici dosya temizleniyor, asıl dosya byte aynı |
| T86 | PASS | node · tests/ndjson-stream-fuzz.test.js |
| T87 | PASS | python · backend/test_ytdlp_update.py (24 test) |
| T88 | PASS | python · backend/test_translation_memory.py (6 test) |
| T89 | PASS | node · tests/attr-sink-ratchet.test.js |
| T90 | PASS | probe · 261 karakterlik yol ve boşluklu Türkçe klasör diskte çalışıyor |

### Grup 10 (T91–T100)

| Test | Durum | Yöntem / kanıt |
|---|---|---|
| T91 | PASS | node · tests/media-workflows.test.js |
| T92 | PASS | python · backend/test_media_shelf.py (7 test) |
| T93 | PASS | node · tests/dub-generator-ui.test.js |
| T94 | PASS | node · tests/assistant-conversation.test.js |
| T95 | PASS | python · backend/test_dub_flowing_groups.py (6 test) |
| T96 | PASS | batch · report521/522/523/524/527 (5 dosya) |
| T97 | PASS | batch · report480/481/488/489/490 (5 dosya) |
| T98 | PASS | batch · report491/492/493/494/495 (5 dosya) |
| T99 | PASS | probe · 12 JS `node --check` + 2 Python `py_compile` |
| T100 | PASS | probe · 99 önceki satır benzersiz/tam; matris tutarlı |

Not: Kullanıcının istediği T97/T98 aralıkları (rapor 528–535 ve 536–544) için ayrı `report528…report544` test dosyaları repoda yok. Bu yüzden aynı dönemin mevcut en yakın regresyon dosyaları (480–495) koşuldu; sonuçlar 528–544 aralığının doğrudan kanıtı sayılmamalıdır.

## Sınırlar

- Electron GUI, `start.bat`, gerçek GPU/CUDA, canlı YouTube/DRM/Cloudflare, gerçek hesap ve ücretli sağlayıcı testi **yapılmadı**. Windows DPI/GPU/hesap davranışı doğrulanmadı.
- `npm test` tam paketi koşulmadı; yalnız bu 100 senaryo ve hedefli dosyalar koşuldu. CI beklenmedi ve yeşil iddia edilmiyor.
- T12–T15, T18, T19, T67, T70 kaynak sözleşmesi ağırlıklıdır; dinamik alt süreç/gerçek medya gerektiren yollar (ffsubsync, pyannote, gerçek PDF glif vurgusu, M4B FFmpeg üretimi) bu turda koşulmadı.
- Probe'lar geçici klasörde tutuldu; ham çıktılar (`results.jsonl`, `run.log`, probe'lar) Git'e alınmadı. Yalnız bu rapor ve devir notu eklenir.
- F547-01/F547-02 test tarafı onarımları bilinçli olarak uygulanmadı (kullanıcı talimatı: kodu değiştirme).

## Tekrar üretme

```powershell
# Geçici probe klasörü: C:\Users\K\AppData\Local\Temp\opencode\overnight-547
$env:REPO_ROOT = "D:\Whisper Local"
node runner.js            # 100 satırı sırayla koşar, results.jsonl yazar
node runner.js T01 T62    # yalnız seçili kimlikler
```

Ürün/test kodu değişmediği için bu raporun bitiş kod kimliği başlangıçla aynıdır: `490c2f843d7145b05e010f43e0e5492be67f8bf1`.
