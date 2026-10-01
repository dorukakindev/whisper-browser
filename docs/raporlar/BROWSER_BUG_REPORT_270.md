# BROWSER_BUG_REPORT_270 — R320-2: split/wrap/zamanlama normalizasyonu derin okuma (temiz)

- **Tarih:** 2026-09-30 (UTC)
- **Dal:** `devin/1790760950-r320b-timing` → `master`
- **Kapsam:** `backend/transcribe.py` — `split_segment_by_timing`/`split_segment_sentence`/`split_segment_by_punctuation`/`segment_to_chunks`, `_is_false_sentence_end`, `_best_subtitle_cut`, `_split_long_sentence`, `_flush_chunk`, `balanced_two_line_break`, `wrap_text` (3 kip), `is_abbreviation`/`text_ends_sentence`/`has_enough_punctuation`, `merge_short_entries`, `merge_incomplete_sentences`, `merge_continuation_lines`, `fix_common_errors` + `reconcile_rolling_hypotheses`/`strip_repeated_prefix`/`drop_micro_blocks`/`capitalize_after_sentence`/`fix_text_artifacts`, `normalize_timings`, `apply_dedupe_policy`, `snap_entries_to_speech`/`snap_entries_to_regions`, `realign_segment_metrics`, `drop_trailing_hallucination`, `compute_quality_report`, `canonicalize_subtitle_entries`.

## Sonuç: temiz — doğrulanmış bug yok

Dilimin tamamı okundu; hata davranışları kasıtlı ve belgelenmiş:

- `normalize_timings` **30k tohumlu fuzz** ile invariant'ları doğrulandı: metin
  kaybı yok (kısa cue'lar komşuya katlanır, kelime-multiset korunur), süre
  pozitif, başlangıç ≥ 0, ardışık boşluk ≥ 0.07 sn. Sıfır ihlal.
- Kısa-cue katlaması metni kaybetmiyor; sondaki kısa cue'nun bitişi önceki
  cue'nun bitişine uzatılarak konuşma zamanı korunuyor (R243 artığı).
- `sorted` başlangıç-bazlı yeniden sıralıyor — unsorted girdi metin sırasını
  değiştirebilir ama kelime kaybettirmez (ilk fuzz "textloss" alarmı aslında
  sıralamadan ibaretti, multiset kontrolüyle temiz).
- `is_abbreviation`/`_is_false_sentence_end`: TR ordinal bayrağı yazılan metnin
  dilinden alınıyor; EN'de "1935." gerçek cümle sonu sayılıyor.
- `merge_incomplete_sentences`/`merge_continuation_lines`: diyalog tiresi +
  SDH (`[`, `(`, `♪`) başlangıçları iki tarafta da korunuyor; konuşmacı
  haritası `assign_speakers` normalize sonrası indekslendiği için etiket
  kayması yok (pipeline sırası doğru).
- `split_segment_*`: kelime damgasız segment `(s, e, text)` tek-parça düşer;
  `_flush_chunk` ilk-geçerli-start/son-geçerli-end kullanır.
- `serialize_srt_strict`: blok sayısı/kimlik/zaman satırı bozuk gövdeli
  payload'ı yazmadan reddeder (sessiz bozulma yerine sesli hata).
- `snap_entries_to_regions`: yalnız sessizlik-içi başlangıçları ve
  `0.05 < shift ≤ max_shift` ve `min_dur` kalıyorsa kaydırır.
- `realign_segment_metrics`: eşleşemeyen blok `None` (yanlış metrik
  bağlanmasından iyidir); NaN damgalı metrikler havuzdan elenir.

## Yeni kalıcı kilit

`test_normalize_timings_property_fuzz` — 30k deterministik denemede metin
multiset korunumu + pozitif süre + negatif-olmayan başlangıç + ardışık
boşluk invariant'ları.

## Testler

- `backend/venv/bin/python test_transcribe.py` → **207/207 PASS**
- `python -m py_compile backend/transcribe.py` → temiz

## Windows etkisi / doğrulanmayan sınırlar

- Yalnız test eklendi; ürün davranışı değişmedi.
