# BROWSER_BUG_REPORT_376 — Yeni-100 batch 3: backend gerçek-model derinleştirme

**Tarih:** 2026-10-02 · **Dal:** `devin/1790905047-b3-realmodel` · **Kod commit:** `bebddb0`

## Kapsam

`backend/transcribe.py`'yi gerçek tiny/CPU modeliyle deterministik ffmpeg
lavfi armatürleri (sessizlik, beyaz gürültü, <1s flite konuşması, bozuk
medya, iki-parçalı konuşma) üzerinden kenar durumlarda prob'ladık.
Model tarafı bilerek gerçek bırakıldı — amaç, motorun gerçek halüsinasyon
davranışına karşı boru hattının savunma katmanlarının çalışıp çalışmadığı.

## Bulgular

| # | Madde | Sonuç |
|---|-------|-------|
| 21 | Halüsinasyon filtresi gerçek sessizlikte | **DÜZELTİLDİ** — saf sessizlikte "Thank you for watching." cue'su üretildi; kalıp `thanks?\s+for` arasına giren "you"yu atlayamıyordu. `thank you for watching/listening` varyantları + TR "dinlediğiniz için teşekkürler" eklendi. Gerçek ölçüm: avgLogprob -1.138 → düzeltme sonrası atlandı |
| 22 | YouTube-outro kalıp ailesi | **DÜZELTİLDİ** — clip koşusunda "We'll see you in the next video." (avgLogprob -1.19) elenemedi; `see\s+you` "we'll" önekini atlayamıyordu |
| 23 | `normalize_timings` son cue | **DÜZELTİLDİ** — okunabilirlik uzatması (min_dur/CPS) son cue'da tavansızdı: 2.4s dosyada 3.1s'ye uzanan cue yazıldı. `media_end` kelepçesi eklendi (`time_offset + info.duration`); clip sonunda 2.0/2.4'e kilitlendi |
| 24 | Beyaz gürültü | KANITLA KAPATILDI — segment üretilmedi, temiz `error` olayı ("Hiç altyazı segmenti üretilemedi"), çökme yok |
| 25 | Bozuk medya (4KB rastgele) | KANITLA KAPATILDI — temiz `error` "Ses çıkarma başarısız... kontrol edin", traceback log'da, done yok |
| 26 | Kısa ses (<1s) | KANITLA KAPATILDI — 0.8s flite → 1 segment "Hello, world.", güven 0.75, done |
| 27 | `--clip-start` zaman ekseni | KANITLA KAPATILDI — damgalar orijinal eksende (`start ≥ clip-start`), offset doğru |
| 28 | Süre ötesi clip | KANITLA KAPATILDI — `--clip-start 60` → temiz `error` "Ses çıkarılamadı: çıktı boş" (mesaj iyileştirilebilir: clip aralığı boşken "ses akışı olmayabilir" yanıltıcı — düşük öncelik) |
| 29 | CPU compute-type | KANITLA KAPATILDI — `--compute-type float16` CPU'da warn + int8'e düşer; srt/vtt/json aynı sourceHash ile tutarlı |
| 30 | Kenar matrisi testi | UYGULANDI — `tests/e2e-transcribe-edgecases.test.js` opt-in (`WHISPER_E2E=1`): 6 senaryo, 18 kontrol, deterministik lavfi armatürleri |

## Doğrulanmış kusur detayları

### B-376-01: "thank you for watching" kalıp boşluğu
- **Belirti:** 4s saf dijital sessizlik (`anullsrc`) → SRT'de
  `00:00:02,580 → 00:00:03,980 "Thank you for watching."` cue'su.
- **Kök neden:** `^\s*thanks?\s+for\s+watching.*$` yalnız "thank(s) for"
  bitişiğini yakalıyor; "thank **you** for watching" — Whisper'ın en yaygın
  halüsinasyonu — atlanıyordu. Segment metrikleri (avgLogprob -1.138,
  no_speech 0.51) güven kapısını karşılıyordu; tek engel kalıptı.
- **Düzeltme:** `thanks?\s*(?:you\s*)?for\s+(?:watching|listening)\b` +
  TR `dinlediğiniz` alternatifi. Güven kapısı değişmedi (gerçek repliği
  korur: -0.2 logprob'da atılmaz).

### B-376-02: "we'll see you" kalıp boşluğu
- **Belirti:** clip koşusunda "We'll see you in the next video."
  (avgLogprob -1.19) cue olarak yazıldı.
- **Kök neden:** `^\s*see\s+you` kalıbı "we'll" önekini atlayamıyor.
- **Düzeltme:** `(?:we'?ll\s+)?see\s+you` — "see you next time" /
  "we'll see you in the next one" varyantlarını da kapsar.

### B-376-03: son cue medya sonunu aşabiliyor
- **Belirti:** 2.4s dosyada SRT cue bitişi 03.100 — okunabilirlik uzatması
  (CPS≤20 → 32 karakter ≈ 1.6s) son cue'da `ceiling=None` ile sınırsızdı.
- **Kök neden:** `normalize_timings` yalnız bitişik cue tavanı biliyordu;
  medya sonunu bilmiyordu.
- **Düzeltme:** `media_end` parametresi; son cue için `ceiling = media_end`.
  Çağrı `time_offset + info.duration` ile bağlandı (clip/resume'da kesit
  sonu = orijinal eksende offset + kodlanan uzunluk). Model'in kendi bitişi
  sınırı aştıysa da kelepçelenir; `media_end` verilmezse davranış eskisi.

## Test kanıtı

- `backend/venv/bin/python backend/test_transcribe.py` → **221/221 PASS**
  (kalıp varyantları + media_end kelepçesi kilitleri eklendi)
- `WHISPER_E2E=1 node tests/e2e-transcribe-edgecases.test.js` → **18/18 PASS**
  (gerçek tiny/CPU: sessizlik, gürültü, bozuk, kısa, clip-offset+kelepçe,
  süre ötesi clip)
- Düzeltme sonrası gerçek koşu: sessizlik → "Halüsinasyon atlandı: Thank
  you for watching." + temiz hata; clip 1.5 → SRT son cue bitişi tam 2.4
  (önceden 3.1); clip 1.0-2.0 → bitiş 2.0.

## Sınırlar / koşulmayanlar

- WhisperX ve faster-batched motorları prob'lanmadı (faster yolu).
- GPU/CUDA yolu bu ortamda yok; CPU int8 ölçüldü. Windows'ta CUDA/GPU
  davranışı doğrulanmadı.
- `--resume` checkpoint yolu küçük armatürlerde tetiklenmez (<20s);
  mevcut `test_pipeline_control.py` kilitleri yeterli sayıldı.
- flite TTS çıktısı bozuk telaffuz ürettiğinden model gerçek YouTube-outro
  halüsinasyonları üretti — sentetik ama savunma katmanını gerçekçi yordu.
