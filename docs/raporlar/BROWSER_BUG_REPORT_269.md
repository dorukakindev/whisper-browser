# BROWSER_BUG_REPORT_269 — R320: transcribe.py ana hat + halüsinasyon savunması derin okuma

- **Tarih:** 2026-09-30 (UTC)
- **Dal:** `devin/1790760531-r320-mainpipe` → `master`
- **Kapsam:** `backend/transcribe.py` — `transcribe()` ana boru hattı (6265→7245) uçtan uca + halüsinasyon savunma katmanı (`HALLUCINATION_PATTERNS`, `has_repetition_loop`, `collapse_repetition`, `is_hallucination`, `should_skip_hallucination`, `drop_trailing_hallucination`, `find_repeated_hallucinations`/`drop_repeated_hallucinations`) + checkpoint/devam yardımcıları (`_checkpoint_path`, `job_signature`, `read/write_checkpoint`, `checkpoint_resume_from`, `merge_resumed_entries`, `merge_resumed_words`) + metrik realign (`realign_segment_metrics`) + temizlik (`clean_text`, `strip_html`, `is_abbreviation`, `text_ends_sentence`, `has_enough_punctuation`) + `segment_to_chunks` dispatch + `preflight_*`, `resolve_*`, `resolve_device_and_compute`.

## Düzeltilen bulgular

### BUG_0001 — `media_dur` kırpılmış süreyi ikinci kez kısaltıyordu (perf istatistiği)

`transcribe()` sonundaki perf bloğunda:

```python
media_dur = float(getattr(info, "duration", 0.0) or 0.0)
elif clip_start is not None:
    media_dur = max(0.0, media_dur - clip_start)
```

`info.duration` her yolda **zaten kırpılmış** `audio.wav`'ın süresidir:
- yerel dosya: `extract_audio(..., clip_start=ex_start, clip_end=ex_end)` WAV'ı kırpar;
- YouTube aralıklı indirme (`youtube_ranged`): indirilen dosya aralıklıdır;
- devam modu: ses `resume_from` noktasından çıkarılır.

`clip_start`'ı yeniden düşmek işlenen süreyi iki kez azaltıyordu: 60 sn kaynak +
`clip_start=10` için WAV 50 sn → raporlanan `mediaSeconds` 40 sn ve `rtf` ~%20
düşük. Ayrıca `clip_end` dalı kaynağın sonunu aşan pencereyi (ör. `[10→90]` 60 sn
dosyada 80 sn) kelepçelemiyordu → `rtf` şişiyordu.

**Düzeltme:** hesaplama saf `compute_media_duration(info_duration, clip_start,
clip_end)` yardımcısına taşındı — `clip_start` asla ikinci kez düşülmez; `clip_end`
penceresi `min(duration, window)` ile kelepçelenir; duration bilinmiyorsa pencere
tek tahmin olarak kalır.

**Etki:** kullanıcıya görünen tek yüzey iş geçmişindeki `mediaSeconds`/`rtf` ve
konsol performans satırı — üretilen altyazı metni/zamanlaması etkilenmiyordu.

### BUG_0002 — aynı-kelime halüsinasyon kontrolü büyük/küçük harf duyarlıydı

`is_hallucination` ve `should_skip_hallucination`'ın "sert işaret" kontrolü
`len(set(words)) == 1` ile birebir karşılaştırma yapıyordu. Whisper tekrar
döngüsü büyük/küçük harfi karıştırabildiğinden `"No no NO no no"` filtreden
kaçıyordu. İki kontrol de `casefold` üzerinden yapılıyor artık.

## Doğrulanan ve temiz çıkan bölümler

- `transcribe()` olay akışı: iptal kontrol noktaları (`cancellation_checkpoint`
  before/start/during/after/handoff) tüm aşamalarda; `job_temp_directory` her
  koşulda `finally` ile temizlenir; model/batched VRAM'i diarization öncesi
  `del`+`empty_cache` ile boşaltılır.
- Segment döngüsü: `None`/NaN/negatif damgalar iki katmanda elenir; kelime
  damgaları `_prev_end` zinciriyle sınıra kelepçelenir; `cue_confidence` zaman
  örtüşmesiyle parça-bazlı çalışır (offset tutarlılığı doğrulandı).
- Checkpoint: `job_signature` girdi kimliği + ayarlar imzasını bağlar; periyodik
  snapshot birleştirilmiş yazılır (`merge_resumed_*` sınır kelepçesi tutarlı);
  başarılı işte eski+yeni checkpoint dosyası silinir.
- Dedupe/birleştirme zinciri: `apply_dedupe_policy` (örtüşen tekrar zorunlu +
  `dedupe` bayrağıyla yakın tekrar) → `fix_common_errors` → `drop_repeated_`
  `hallucinations` (metrik realign'lı) → `merge_incomplete` → `merge_short` →
  `drop_trailing` (kelime güveni + ses düzeyi kanıtı ister) → `merge_continuation`
  → son `apply_dedupe_policy(False)` — sıralama bağımsız inceleme tutarlı.
- Çıktı yazımı: `OutputTransaction` tüm formatları önce yan dosyaya yazıp tek
  seferde `commit` eder; yarım işlem `recover_output_transactions` ile geri alınır;
  `tr_path == out_path` çakışması ayırt edici ek ile ayrılır; yalnız-JSON seçiminde
  kaynak koruma zorlanır.
- Halüsinasyon kapısı: `should_skip_hallucination` bilinen kalıpları güven
  sinyali olmadan elemiyor (gerçekten söylenen "Thanks for watching" korunur);
  sert işaretler (boş/SDH/sadece-nokta/♪/aynı kelime) her zaman elenir.
- `is_abbreviation`/`text_ends_sentence`/`has_enough_punctuation`: sıra sayısı
  `ordinal` bayrağı dil-konvansiyonuna bağlı ve metin sonunda `ordinal=False`
  doğru kullanılıyor.
- Preflight: çıktı+girdi klasörleri gerçek yazma probuyla doğrulanıyor
  (`fsync`'li geçici dosya) — salt `mkdir` yetmezliği yakalanır.

## Testler

- `backend/venv/bin/python test_transcribe.py` → **208/208 PASS** (yeni:
  `test_compute_media_duration_does_not_double_subtract_clip_start`,
  `test_same_word_hallucination_is_case_insensitive`).
- `python -m py_compile backend/transcribe.py` → temiz.
- Sistem `python`'da 10 başarısızlık numpy/faster-whisper eksikliğinden
  (master'da da aynı — ortam sınırı, regresyon değil).

## Windows etkisi / doğrulanmayan sınırlar

- Değişiklik yalnız backend hesaplamasında; Windows yolları/bat akışı dokunulmadı.
- Gerçek GPU'da RTF sayısal değeri Windows doğrulaması bekler — hesap formülü
  birim testle kilitli.
