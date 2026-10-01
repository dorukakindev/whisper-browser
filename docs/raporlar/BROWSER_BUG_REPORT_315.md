# BROWSER_BUG_REPORT_315 — Anlam kaybı değerlendirme korpusu (kuyruk-50, madde 3)

Tarih: 2026-10-01 · Dal: `devin/<ts>-meaning-loss-corpus` · Kod bitiş: `<code-hash>` (PR #<n>)

## Görev

Olumsuzluk, ihtimal, zorunluluk, sayı, hitap ve argo içeren zor repliklerden lisanslı bir değerlendirme seti oluştur; mevcut kalite kapılarının yanlış kabul ve yanlış retlerini ayrı ölçüp iyileştir.

## Üretilen varlıklar

- `backend/eval_data/meaning_loss_corpus.json` — 120 vaka, tamamı bu çalışma için sıfırdan yazıldı (meta.license: CC0-1.0, dış kaynak yok). Dağılım: olumsuzluk 13A+14R, ihtimal 10+10, zorunluluk 10+10, sayı 10+10, hitap 5+8, argo 10+10. `reject` satırlarında `gatable:false` işareti yapısal olarak regex-kanıtlanamayan kör noktaları işaretler (hitap/argo'nun tamamı).
- `backend/eval_meaning_loss.py` — `evaluate()` + `report()`: kategori bazında accept/reject sayıları, `false_accept_blocking`, `false_accept_blocking_gatable`, `false_accept_meaning`, `false_reject`, `accept_flagged_meaning` metrikleri.
- `backend/test_meaning_loss_eval.py` — metrikleri kilitleyen 4 test.

## Baseline → düzeltme → son ölçüm

**Baseline (korpuş ilk koşu):** blocking kapısı yalnız `number_mismatch` + `truncated_fragment` içeriyordu; `negation_missing`, `modal_missing` gibi anlam kusurları yalnız bilgi `translation_meaning_issues`'da kalıyor, kabul yolunu etkilemiyordu → gatable false-accept oranı yüksek.

**Uygulanan düzeltmeler:**

1. `sentence_translation.py`:
   - `translation_blocking_issues` artık `number_mismatch, truncated_fragment, negation_missing, modal_missing, modal_certainty_flip, modal_weakened` döndürür.
   - `translation_meaning_issues` artık `modal_certainty_flip` (kaynakta belirsizlik kanıtı varken hedefte hiçbiri yoksa) ve `modal_weakened` (kaynakta zorunluluk kanıtı varken hedefte hiçbiri yoksa) üretir; ikisi de tr-hedef kapılı.
   - Kanıt regex'leri genişletildi: `_SOURCE_NEGATION` += needn't/daren't/shan't/ain't; `_SOURCE_MODAL` += ought to/have to/need to/required to/supposed to/perhaps/maybe/possibly/probably; `_SOURCE_UNCERTAINTY`/`_SOURCE_NECESSITY` sınıflandırıcıları eklendi.
   - `_TARGET_NEGATION` += değil\w* fleksiyonları, -mAm, -mayabilir, -mayan, -sIz (hal eki), çıplak -mA olumsuz emir (kıpırdama/yapma/konuşma — mastar homografisi bilinçli kabul), + FR/DE/ES/IT/PT olumsuzluk sözcükleri.
   - `_TARGET_MODAL` += belki/galiba/muhtemelen/herhalde/mecbur/şart/lüzum/icap, -amam/-emem, geniş zaman (aorist) — son formda -r ile biten isimler (yağmur, haber, kader…) lookahead ile, geçmiş 3.çoğul -dIlar/-dIler lookbehind ile dışlanır.
   - `_TARGET_UNCERTAINTY` = belki/olabilir/galiba/muhtemelen/herhalde/ihtimal/sanırım/sanki/mümkün/olası + -abilir/-ebilir.
   - `_TARGET_NECESSITY` = zorunda/gerek/lazım/mecbur/şart/lüzum/icap/mecburi/elzem + -malı/-meli.
2. `transcribe.py` — `compute_translation_quality_report`: `blocking_issue_indices` toplamı eklendi; `translation_meaning_hard_rejected` artık gerçek blocking sayısını (eski: yalnız number+truncated) raporlar — çift sayım da giderildi.
3. `golden-corpus-tr.json` — 9 satırın `detection` beyanı 'blocking'e taşındı (neg-01..06, mod-01, mod-02, adr-01) — yeni kapının gerçek davranışına uygun spek güncellemesi.
4. `test_transcribe.py` — merge fixture'ındaki rastlantısal olumsuzluk ('isn't') nötr metne çevrildi; shadow-metrik beklentileri yeni spec'e uyarlandı (hard_rejected 1→2); blocking assertion üyelik kontrolüne geçti.

## Son ölçüm (120 vaka)

| Kategori | acc | rej | gatable | FA-block | FA-gatable | FA-meaning | FR | acc-flag |
|---|---|---|---|---|---|---|---|---|
| argo | 10 | 10 | 0 | 10 | 0 | 10 | 0 | 0 |
| hitap | 5 | 8 | 0 | 8 | 0 | 8 | 0 | 0 |
| ihtimal | 10 | 10 | 10 | 0 | 0 | 0 | 0 | 0 |
| olumsuzluk | 13 | 14 | 14 | 0 | 0 | 0 | 0 | 0 |
| sayi | 10 | 10 | 10 | 3 | 3 | 0 | 0 | 0 |
| zorunluluk | 10 | 10 | 10 | 0 | 0 | 0 | 0 | 0 |
| **ALL** | 58 | 62 | 44 | 21 | 3 | 18 | **0** | 0 |

Okuma: yanlış-ret 0/58 — doğru çeviri hiç engellenmiyor. Gatable 44 kusurun 41'i blocking'de yakalanıyor; kalan 3, para birimi/birim dönüşümsüz takasıdır (ör. "$5"→"5 dolar" dönüşümü meşru olduğu için currency_mismatch/unit_mismatch bilinçli olarak sadece tanıda kalır — yanlış kabul olarak düzeltilmesi otomatik kapıyla imkansız). 18 kalan anlam-sızdırma argo/hitap satırıdır: yapısal kanıtı olmayan, `gatable:false` belgelenmiş kör nokta — ölçülüyor ama bloklanamaz.

## Test kanıtı

- `backend/test_meaning_loss_eval.py` — 4/4 OK
- `backend/test_translation_quality_corpus.py` — 5/5 OK
- `backend/test_golden_corpus.py` — 6/6 OK
- `backend/test_transcribe.py` — 213/213
- `backend/test_sentence_distribution.py`, `test_core_regressions_r4.py`, `test_pack_sentence_fuzz.py`, `test_translate_pipeline_r220.py`, `test_translation_audit_2026_09_22.py`, `test_translation_number_gate.py`, `test_zero_ref_module_locks.py`, `test_scene_context.py` — tümü OK

## Windows etkisi

Yok — yalnızca backend Python (regex + sayaç) ve test/dosya değişikliği; platform davranışı etkilenmez. Windows'ta denenmedi; gerekmez.
