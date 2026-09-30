# R323-2 — Zamanlama kaydırma/kalibrasyon oracle fuzz'ı

**Tarih:** 2026-09-30
**Dal:** `devin/1790763713-r323-2-timeline-fuzz`
**Kapsam:** `calibrateCueTimeline` + `shiftCueTimeline` (src/browser-cue-timeline-calibration.js) + `offset_diarization_spans` + `compute_media_duration` (backend).

## Sonuç: temiz — bug yok

Mevcut kapsam: `subs-shift-accuracy.test.js` (R302) metin düzeyi `shiftTimecodes`'u ±ms ve 1000 tohumla kilitliyor. Bu tur cue nesnesi düzeyindeki iki yardımcıyı ve backend zaman-ekseni yardımcılarını oracle-fuzz'a soktu; tüm invariant'lar geçti.

## Denetlenen yüzey

### `calibrateCueTimeline` — medyan-ofset kestiricisi
- Normalize metin → adayda tekil eşleşme → ofset örnekleri → medyan → tolerans içi inlier sayımı (≥2 veya tek+uzun ≥24 kar) → kabul.
- **Oracle doğrulamaları:**
  - Uniform kayma ±20 ms jitter ile geri kazanılıyor (400 tohum, |tahmin−gerçek| ≤ 0,051).
  - `|ofset| > maxOffset (120 s)` → red (40 tohum).
  - Yinelenen aday metinleri eşleşmeden düşer; kalan tekillerle doğru ofset (150 tohum).
  - %33 aykırı ofset medyanı saptırmıyor (150 tohum) — medyan dayanıklılığı beklenen sınırda.
  - Tek uzun metin güçlü-tekil kabulü, tek kısa metin reddi, boş/NaN/Infinity girdiler reddediliyor.
  - İ/ı katlaması, `<i>` tag'i ve noktalama normalize'da eşleşmeyi kurtarıyor.
- **Not (bug değil):** tek-uzun-metin eşiği `textLength >= 24` — normalize edilmiş uzunluk; Türkçe "İ" katlaması sonrası uzunluk korunur, doğru.

### `shiftCueTimeline` — cue kaydırma
- Düşüm kuralı fuzz'la kilitlendi: yalnız `end+offset ≤ 0` düşer (300 tohum); `start` [0,∞) kelepçelenir, `end ≥ start+0.001` tutturulur.
- Roundtrip: dokunulmayan cue ±O sonrası kimliğe döner; kelepçelenen (`start+O<0<end+O`) geri dönüşte `start=-O`'ya sürüklenir — kayıplı davranış sözleşme olarak belgelendi (kaynak metnin öncesi yok; tek olası değer).
- `|offset|<0.001` veya sonlu olmayan ofset → sığ kopya, girdi mutasyonsuz.
- `timelineCalibrated: true` işaretinin yazıldığı doğrulandı.

### Backend — `offset_diarization_spans` + `compute_media_duration`
- Span ±O roundtrip kimliği (300 tohum), sıfır/None ofsette liste kopyası (alias değil), int→float dönüşümü, speaker korunumu — hepsi OK.
- `compute_media_duration` 1000 tohum: asla negatif değil; `clip_end=None` → bilinen süre; `duration>0` → `min(duration, window)` (klip penceresi süreyi şişirmez); süre bilinmiyorsa pencere tek tahmin; `clip_end<clip_start` → 0.

## Kalan riskler / doğrulanmayan sınırlar

- `calibrateCueTimeline` %50+ aykırı ofsette medyan sapar (medyan'ın teorik sınırı) — istatistiksel tasarım, bug değil.
- Gerçek CEA/YouTube çift-iz kalibrasyonunun canlı doğrulaması Windows'ta değil (T9 oturumlarında site-fixture ile yapıldı; R278).
- `time_offset`'in `NaN` gelmesi senaryosu: `float("nan")` span'leri NaN yapar — üretimde `parse_timecode` sonlu değer üretir, ulaşılamaz yol (not edildi, düzeltme gerekmez).

## Testler

- `node tests/timeline-oracle-fuzz.test.js` → 9/9 (~1000 fuzz denemesi)
- `python3 backend/test_timeline_oracle_fuzz.py` → 5/5 (1300 deneme)

## Windows etkisi

Yok — saf fonksiyon kilidi.
