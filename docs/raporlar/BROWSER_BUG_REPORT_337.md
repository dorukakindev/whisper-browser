# BROWSER_BUG_REPORT_337 — Kuyruk-50 madde 25: uzun capture kurtarma tutarlılığı

Tarih: 2026-10-01 · Başlangıç: `7aa8ef2`

## Kapsam

Madde 25: "Saatler süren erişilebilir yayının capture durumunu checkpoint'le
sakla. Kapanma sonrası devam ederken zaman dönüşümleri, parça kimliği ve
dedupe durumunu tutarlı geri yükle."

Mevcut durum denetimi: `browser-cea-checkpoint.js` cue'ları + segment sayısını
atomik yazıyor, imzalı URL sorguları kimliğe girmiyor; restore'da cue'lar
aynı tampondan devam ettiği için merge-dedupe durumu korunuyordu.

## Bulgu (B-337-01)

Checkpoint **parça kimliğini** (dil/ad/standard) ve uygulanmış **zaman
dönüşümünü** (kabul edilmiş kalibrasyon) saklamıyordu:

- Restore'da iz kimliği tamamen yeni manifest planından geliyordu; plan
  değişmişse (kanal dili güncellenmiş manifest gibi) kurtarılan cue'lar
  farklı streamKey/kimlik altında ayrı ize düşebiliyordu.
- `calibrateCueTimeline` ile uygulanan offset finalize'da buffer'a yazılıyor
  ama kayda geçmiyordu — kapanış sonrası yayınlanan kurtarılan iz
  timeTransform'suzdu ve zayıf referans kümesiyle yeniden-kalibrasyon
  farklı offset üretebilirdi.

## Düzeltme

- `browser-cea-checkpoint.js`: `normalizeTracks` artık `language`, `name`,
  `standard` ve `timeTransform` (normalizeTimeTransform: sonlu offset ≤24s,
  int matches, ≤20ch confidence) taşıyor. Geriye uyumlu — eski kayıtlar
  boş kimlik alanlarıyla yüklenir.
- `main.js`: finalize'da kabul edilmiş kalibrasyon `job.timeTransforms`
  haritasına yazılır; persist bu kimlik + dönüşümü kaydeder. Restore'da
  kayıtlı dil/ad/standard taze plana tercih edilir (aynı streamKey'de kalma)
  ve kayıtlı dönüşüm `calibration` meta'sıyla izi birlikte yayınlanıp
  `job.timeTransforms`'a geri konur.
- Dedupe durumu: kurtarılan cue'lar aynı `browserTrackBuffers` tamponuna
  girdiği için tekrar indirilen segmentlerden gelen aynı cue'lar merge
  katmanında tekilleşir — ek durum taşımaya gerek kalmadı (doğrulandı).

## Kanıt

- `tests/browser-cea-checkpoint.test.js` — PASS (yeni kilitler: kimlik +
  timeTransform roundtrip, eski biçim geri uyumu, bozulmuş/aşırı dönüşüm
  düşümü; mevcut redaction + atomiklik kilitleri sürüyor).
- `node --check src/main.js src/browser-cea-checkpoint.js` temiz.
- Windows etkisi: yalnız checkpoint şeması — dosya yolu/işlemi değişmedi.
