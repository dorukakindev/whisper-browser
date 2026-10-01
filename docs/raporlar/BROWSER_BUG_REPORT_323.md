# BROWSER_BUG_REPORT_323 — Uzun medya parça-birleştirme (kuyruk-50/11)

Kapsam: saatler süren medyada Whisper pencere sınırlarındaki eksik/tekrar/yarım
replikler; `backend/transcribe.py` `apply_dedupe_policy` (pipeline'ın zorunlu
son-dergi filtresi, extended=False her iki geçişte çalışır).

## Mevcut davranış

- Birebir-normalize-eşit metin + zamansal örtüşme + başlangıç sürüklenmesi
  ≤1.0 sn → birleştirme (rolling-cue artefaktı).
- `dedupe_consecutive` yalnız kullanıcı `dedupe` seçeneği açıkken.
- `merge_short_entries` yarım/kısa blokları komşuya katar.

## B-323-01 — Sınır yankısı farklı metinle gelince kaçıyordu

Uzun medyada Whisper bir sonraki analiz penceresinde önceki kuyruğu yeniden
yazar: "the cat sat on the mat" [27–30] ardından "the mat again" [29.4–32].
Zamansal örtüşme var ama metinler birebir değil → eski kural birleştirmiyordu;
ortak kelime iki kez ekranda kalıyordu.

**Düzeltme:** `_boundary_overlap_merge` — zamansal örtüşme + farklı metin
olduğunda üç güvenli yol:

1. Sonraki metin öncekinin kelime-önek uzantısıysa uzun (eksiksiz) metin tutulur.
2. Önceki metin sonrakini kelime-önek kapsıyorsa önceki kalır.
3. Öncekinin kelime-soneki = sonrakinin öneki (≥2 kelime ve kısa tarafın
   yarısı) → örtüşen bölüm bir kez yazılarak ekleme (stitch).

**Gerçek-tekrar güvenliği:** birleştirme yalnız zamansal örtüşmede; gerçek
tekrarlar örtüşmediği için bu yola girmez. Birebir-eşit metinlerde 1.0 sn
sürüklenme sınırı olduğu gibi korundu (delayed_overlap sözleşmesi). Baştaki
saf-noktalama tokenları ("--", "—") normalize kelime üretmediğinden orijinal
metin token'larına indirgerken ayrıca atlanır.

## Kanıt

`backend/test_transcribe.py` — 215/215:

- stitch: "the cat sat on the mat" + "the mat again" → "…mat again" tek blok
- içerme: kısa yankı hem ileri hem geri yönde uzun metne katlanır
- "-- " öneki hizayı kaydırmaz
- gerçek tekrarlar ("Yes." → "Yes, I do." örtüşmez) korunur
- kelime-örtüşmesiz örtüşme ("I don't think so" / "completely agree") korunur
- tek kelimelik ve zayıf örtüşme (kısa tarafın yarısından az) birleşmez

`test_golden_corpus`/`test_golden_matrix`/`test_golden_writers` OK,
`test_sentence_distribution` 43/43, `test_ass_override_roundtrip` 9/9.

## Sınırlar

- Sınır yankısı üç-bloğa yayılırsa zincirleme birleştirme `cleaned` üzerinden
  adım adım yürür; her adım aynı kural setine tabidir.
- Stitch orijinal `next_text` token'larından kuyruk ekler; örtüşen kelime
  farklı yazılmışsa (ör. yazım düzeltmesiyle) önceki sürümün yazımı korunur.
