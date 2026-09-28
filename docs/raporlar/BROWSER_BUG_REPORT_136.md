# BROWSER_BUG_REPORT_136 — altyazı parser fuzz turu (R137)

Tarih: 2026-09-27 · Dal: `codex/r137-parser-fuzz-1790500498` · Temel: `e7ba4da` (R136 merge sonrası)

## Özet

SRT/VTT/ASS/LRC/SAMI/TTML/JSON3/HLS/DASH/MP4 parser'larına deterministik
(seed'li) mutasyon fuzz'ı uygulandı — hem Python (`backend/transcribe.py`
`parse_srt`, `parse_ass`, `parse_ass_cue_formats`, `srt_time_to_seconds`) hem JS
(`src/browser-subtitles.js` 14 hedef fonksiyon + 4 ikili MP4 parser'ı).

**Sonuç: 0 çöküş, 0 takılma, 0 NaN cue** — ~160k toplam vaka.

## Taranan yüzeyler

| Parser | Vaka | Sonuç |
|---|---|---|
| `parseTimedBlocks` (SRT/VTT) | 43k mutasyon | temiz |
| `parseAss` / `parse_ass` (py) | 43k + 90k | temiz |
| `parseLrc` | 3k | temiz |
| `parseSami` | 3k | temiz |
| `parseHlsSubtitleTracks/VariantStreams/Segments` | 9k | temiz |
| `parseDashSubtitleTracks/Matchers` | 6k | temiz |
| `parseSubtitlePayload` (json/ttml/vtt/ass mime) | 12k | temiz |
| `parseYoutubeCaptionMetadata` | 3k | temiz |
| `parseMp4WebVtt/Stpp/Timescale/SampleDefaults` | 8k rastgele bayt | temiz |
| `srt_time_to_seconds` | 30k | 0 çöküş; aşırı değerler çağıran katmanda eleniyor |
| `decodeSubtitleBuffer`, `cleanCueText`, `cueFingerprint`, `cuesToSrt/Vtt`, `browserActiveCuesAt`, `isLikelySubtitleResponse`, `subtitleLanguage` | 60k | temiz |

## Davranış notları (bug değil, belgeli)

- `srt_time_to_seconds` negatif/büyük zamanları ayrıştırır (`-1:00:00,000` →
  `-3600`) — bu fonksiyonu çağıran `parse_srt`/`parse_ass` zaten `_SRT_TIMING`
  regex'i ve `Number.isFinite` kapılarıyla girdiyi sınırlıyor; çıplak çağrı
  yalnızca testlerde.
- `parse_srt`, bozuk zamanlı satırları atlar (`try/except ValueError`); fuzz
  mutasyonları yalnızca düşük kaliteli satır sayısı üretti, çökme yok.
- JS `normalizeCues` `end <= start` cue'larını onarır (sonraki cue'ya ya da
  +3 s varsayılanına kilitler) — ayrı testle mühürlendi.

## Katkı: CI fuzz ratchet'i

`tests/subtitle-parser-fuzz.test.js` — 50k deterministik vakayı her `npm test`
koşusunda tekrarlar. Yeni bir parser eklenirse `FUZZ_TARGETS`'a eklenmelidir.
Bozuk girdi bulunursa düzeltme ile birlikte sabit vaka olarak dosyaya yazılır.

## Testler

- `node tests/subtitle-parser-fuzz.test.js` → 50000 vaka, 0 hata
- `node tests/browser-subtitles.test.js` → 80/80 (mevcut davranış bozulmadı)
- `node tests/browser-subtitle-files.test.js` → 22/22
- `node tests/browser-subtitle-search.test.js` → (koşuldu — aşağıda)

## Windows etkisi

Yok — yalnız test dosyası; ürün kodu değişmedi.
