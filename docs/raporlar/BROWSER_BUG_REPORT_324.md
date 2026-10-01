# BROWSER_BUG_REPORT_324 — Noktalama kurtarma değerlendirmesi (kuyruk-50/12)

Kapsam: `recover_punctuation_collapse` — Whisper'ın noktalamayı bıraktığı uzun
bölgeleri "önceki bağlam kapalı" olarak yeniden çevirip yerine koyma.
Değerlendirme 6 senaryoda iki motor stili (faster-whisper nesneleri ve
`_WxSegment`/`_WxWord` uyarlaması) ve ayar sözleşmesiyle ölçüldü.

## Ölçümler (yeni harness: `test_punct_recovery_eval.py`)

| Senaryo | Noktalama | Kelime örtüşmesi | Karar |
|---|---|---|---|
| Aynı kelimeler + noktalama | %0 → %25 | 1.00 | KABUL |
| Ağır kelime kayması + noktalama | %0 → %16 | 0.00 | RED (düzeltmeden önce KABUL'dü — kusur) |
| Küçük düzeltme (~%92 aynı kelime) | %0 → %25 | 0.92 | KABUL |
| WhisperX `_WxSegment` | %0 → %25 | 1.00 | KABUL (aynı yol) |
| Alakasız kelime damgaları | — | 0.00 | eski kelimeler korunur |
| Ayarlar | — | — | `condition_on_previous_text=False` zorlanır, kullanıcı prompt'u korunur, primer sona eklenir |

## B-324-01 — Kurtarma kelime doğruluğunu düşürebiliyordu

Kabul kapısı yalnız `punctuation_ratio` kazanımına bakıyordu: tamamen farklı
içerik üreten yeniden-transkripsiyon noktalı olduğu sürece eski (aynı sesle
hizalı) blokların üzerine yazıyordu. Görevin açık gereği: kurtarma "kelime
doğruluğunu düşürmeden" noktalama iyileştirmeli.

**Düzeltme:** `_word_multiset_overlap(a, b)` — normalize kelime çok-kümesi
örtüşmesi (0..1, max'a oranla). Yeni bloklar eski bölge metniyle <%50
örtüşürse kabul edilmez. Aynı bekçi `all_words` kelime damgası değişimine de
uygulanır (metin kabul edilip damgalar alakasızsa eski damgalar korunur).

## Sınırlar

- Eşik 0.5 muhafazakâr: gerçek aynı-ses yeniden çözümleri tipik ≥0.7 örtüşür;
  küçük meşru düzeltmeler (%92 örneği) serbest kalır. Bölgenin yalnız bir
  kısmını kapsayan yeni metin oranı düşürür — kapsama ayrıca değerlendirilir.
- `test_split_deadzones.t_recover_replaces_span` aynı-kelime senaryosuna
  güncellendi (eski sürüm alakasız kelime kabulünü varsayıyordu).

## Test kanıtı

`test_punct_recovery_eval.py` 11/11 · `test_split_deadzones.py` 24 senaryo ·
`test_transcribe.py` 215/215.
