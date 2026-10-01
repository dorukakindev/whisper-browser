# BROWSER_BUG_REPORT_335 — Kuyruk-50 madde 23: Capture tekrar oynatma düzeneği

Tarih: 2026-10-01 · Dal: `devin/<ts>-r423-capture-replay` · Başlangıç: `077a2e8`

## Kapsam

Madde 23: "HLS/DASH/TTML/CEA olaylarını kişisel veri içermeyen kayıtlarla
yeniden oynatabilen test aracı; sıra bozulması, eksik segment ve tekrar
teslimlerde sonucu deterministik karşılaştır."

## Uygulanan — `tools/capture-replay.mjs`

- JSONL kayıt biçimi: `playlist` / `segment` / `payload` olayları
  (streamKey+url+mimeType+body).
- **Mahremiyet kapısı:** url yalnız `capture-fixture.local` (veya --allow-host);
  userinfo, query ve fragment reddedilir — süzülmemiş gerçek trafik kaydı
  araçta açılamaz.
- Gerçek modüller: `parseHlsSegments` (playlist genişlemesi),
  `parseSubtitlePayload` (vtt/srt/ttml/timedtext/json3/ass/sami/lrc),
  `mergeBrowserStreamCues` (akış-bazlı birleştirme — storeBrowserTrack
  davranışının aynası), `normalizeCues`; kanonik sha256 digest.
- Modlar: `inorder`, `shuffle` (tohumlu mulberry32 — aynı tohum aynı
  permütasyon), `dup` (her olay çift teslim), `drop:<i,j>` (seçili olay
  düşürme), `suite` (hepsi birden + playlistCoverage).
- `compareReplayRuns`: digest eşitliği + eksik/fazla cue çok-küme farkı.

## Fixture'lar

- `tests/fixtures/capture/hls-session.jsonl`: playlist + 3 VTT segmenti.
- `tests/fixtures/capture/dash-ttml-session.jsonl`: 2 TTML payload + 2 CEA-vtt
  akışı (çok-akışlı merge).

## Kanıt — `tests/capture-replay.test.js` → 26/26 PASS

- Kapı: fixture-dışı alan/userinfo/query/bozuk-satır/bilinmeyen-type reddi.
- Sıra bozulması: 4 tohumda shuffle → aynı cue çok-kümesi (deterministik).
- Eksik segment: drop:2 → tam 2 cue delta, başka değişiklik yok.
- Tekrar teslim: dup → base ile birebir aynı digest/çok-küme.
- CLI: `node tools/capture-replay.mjs <kayıt> [suite|inorder|shuffle|dup|drop:i]`.
