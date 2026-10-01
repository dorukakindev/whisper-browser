# BROWSER_BUG_REPORT_304 — R388–R389 derin okuma: browser-subtitles.js + renderer-helpers.js

Tarih: 2026-10-01 · Kapsam: `src/browser-subtitles.js` (2018 satır) + `src/renderer/renderer-helpers.js` (1114 satır) tam derin okuma + master test-sağlığı tamiri.

## Bulunan kusurlar

### B-303-02 — Kendinden-kapanan `<Tag/>` sonraki kardeşin kapanışını yutuyor (düzeltildi)

**Sınıf:** `TAG\b([^>]*)>...</TAG>` biçimindeki eşli-etiket regex'lerinde `[^>]*` nitelik grubu `/` karakterini de kabul ettiği için `<Tag/>` kendinden-kapanan etiketler "açılış" sanılıyor; `[\s\S]*?` ifadesi sonraki kardeşin `</Tag>`'ına kadar uzanıyordu. Sonuç: bir öğe tamamen kayboluyordu.

**Etki (doğrulanmış):**
- **timedtext/TTML** (`parseXml`): `<p t="3" d="2"/>` boş cue + `<p t="1" d="2">Merhaba</p>` → ikinci cue yutulur, yalnız boş cue kalırdı.
- **DASH MPD** (`dashRepresentations`, `dashTextAdaptations`): `<Representation ... />` self-closing rep sonraki rep'i/adaptasyonu yutardı.
- **SegmentTemplate/SegmentTimeline/SegmentList**: self-closing şablon/timeline elemanları bitişik kardeşleri yutardı.
- **SAMI** (`parseSami`): `<p .../>` blok sonlandırıcı mantığı aynı sınıfa giriyordu.

**Çözüm:** 16 regex sitesinde `([^>]*)` → `([^>]*[^/>])?` — nitelik grubu artık `/` ile bitemez; `<Tag/>` self-closing artık eşleşmez. Tırnak içi `id="a/b"` gibi orta-`/ `'lı değerler korunur (yalnız sondaki `/` dışlanır).

**Kanıt:** `tests/browser-subtitle-selfclosing.test.js` — 8 senaryo; master'da 5/8 FAIL, düzeltmede 8/8 PASS.

### B-389-01 — `formatClipDur` yuvarlama taşması: "1 dk 60 sn" (düzeltildi)

`Math.round(sec % 60)` = 60 döndüğünde saniye basamağı 60 basılıyordu: `formatClipDur(119.9)` → `"1 dk 60 sn"`. Elde artık dakikaya taşınıyor → `"2 dk 0 sn"`. Kesim ipucu (`updateClipHint`) kullanıcıya yanlış süre gösteriyordu.

**Kanıt:** `tests/clip-duration-format.test.js` — 3 test (normal/taşma/taşmasız ondalık).

## Master test-sağlığı tamiri (R388 sürecinde ortaya çıktı)

`npm test` tam koşusunda 4 düşüş vardı; hepsi `git stash` ile master `1114f0b`'da doğrulanmış **önceden var olan** bozukluklardı (R388 diff'iyle ilgisiz — son merge'lerde hedefli testler koşup tam paket koşmamıştı):

| Test | Kök neden | Çözüm |
|---|---|---|
| `css-hardcoded-colors` | `0da1635`'te eklenen `.queue-item.recovered` kuralı `rgba(245,158,11,0.15)` hardcoded renk → 437 > 436 | `color-mix(in srgb, var(--warning) 15%, transparent)` → 436 |
| `i18n-coverage` | 3 TR dizginin EN karşılığı eksik: `İş iptal edildi.`, `Yalnızca yerel medya kayıtları yeniden bağlanabilir.`, `Seçilen dosya zaten başka bir kütüphane kaydına bağlı.` | `ui-locale.js`'e 3 çift eklendi |
| `translation-review-tools` | `cueLooksUntranslated` artık `foldIndexCached` çağırıyor ama `new Function(...)` yalnız `player`,`foldIndex` veriyordu → `foldIndexCached is not defined` | Parametreye `foldIndexCached` eklendi (aynı stub — sözleşme `{dense,map}` döndürür) |
| `dom-innerhtml-ratchet` | Whitelist `dosya:satır::ifade` pinleri renderer.js kaymasıyla bayattı (599→603, 1235→1245, 1463→1473, 14077→14230, 20805→21025, 20866→21086) | Her ifade birebir doğrulanıp pinler güncellendi |

Sonuç: `npm test` tamamı yeşil ("Tüm testler geçti").

## Okunan yüzeyler — temiz çıkanlar (kusur bulunamadı)

### browser-subtitles.js (2018 satır, tamamı)
BIDI/zero-width süzgeç (`BIDI_SPOOF_RE`), `decodeEntities` (isimli tablo + kodnokta bekçileri, tek-geçiş), `cleanCueText` (ASS blok sökümü, ruby rt/rp, bilinen-etiket whitelist — `<p>` kasıtlı whitelist dışı), `normalizeCues` (bitiş onarımı ≤8sn/sonraki.başlangıç, min 80ms, yuvarlanan-duplicate dedupe), `mergeBrowserStreamCues` (tek-cue hızlı yol + staleGrowingRegression + revizyon-anahtarlı toplu birleştirme), `unwrapMpegTs` (33-bit rollover), `parseTimedBlocks` (X-TIMESTAMP-MAP), `parseAss` (Format-sürücülü), `parseSami` (çoklu-dil sınıf, lookahead-sonlu `<p>`), `parseLrc`, HLS zinciri, DASH zinciri (outerBase/periodBounds/segmentTemplate/templateTimeline 10k tavan/matchers/matchDashSubtitleUrl/segmentOffset/representations), `browserActiveCuesAt` (ikili-arama + WeakMap prefix-max önbelleği), `parseXml` (TTML/timedtext/srv3: kapanmamış-etiket kırpımı, stil/bölge döngü bekçisi, ebeveyn ofset birikimi, timed-span mutlak-göreli sezgisi), `parseJson`, mp4 kutu gezginleri (tfhd/tfdt/trun/trex/mdhd, `!duration`→bail, traf başına örtülü mdat imleci), `parseMp4TimedSamples`, `parseSubtitlePayload` (json/xml/srt-vtt/ass/sami/lrc zinciri ≤12MB), `cueFingerprint`, `cuesToSrt/Vtt`.

### renderer-helpers.js (1114 satır, tamamı)
Kuyruk yaşam döngüsü (`startQueue`/`syncJobsCenter`/`removeFromQueue`/`moveQueueItem` — pending-yalnız yeniden sıralama, odak restorasyonu, boş-kalan dizide `?.` güvenliği), aşama zamanlama (`recordStageTiming`/`srtTime`), klip ipucu (`updateClipHint` — innerHTML yalnız sabit), sekme/çalışma akışı (workflow recorder adımları, komut paleti bağlam doğrulaması), sekme şeridi yardımcıları (ses simgesi SVG, ekran-sırası grup yayılımı, sağdakileri-kapat), `showBrowserTabPreview` (native yüzey kırpma sınırı + is-compact varyant), PDF okuyucu sayfa çıkarımı + çeviri renderı, koleksiyon/hesap diyalogları, `sourceSnapshotMatches` (snapshot şekli `{before,after}` her zaman nesne — güvenli), `pickDroppedLink` (uri-list spec + http(s)-yalnız).

## Doğrulanmayanlar

- Windows'ta el ile klip ipucu gösterimi (`1 dk 60 sn` → `2 dk 0 sn` görsel doğrulama) — metin mantığı birim testte kilitli; Windows-özgü değil.
- Electron smoke'lar bu turda koşulmadı (UI davranışı değişmedi; parser/formatlama düzeltmeleri birim kilidinde).

## Sınır/etki

- Değişen dosyalar: `src/browser-subtitles.js`, `src/renderer/renderer-helpers.js`, `src/renderer/styles.css`, `src/renderer/ui-locale.js`, `tests/dom-innerhtml-ratchet.test.js`, `tests/translation-review-tools.test.js` + yeni `tests/browser-subtitle-selfclosing.test.js`, `tests/clip-duration-format.test.js`.
- Testler: `npm test` tamamı yeşil; yeni dosyalar 8+3 senaryo.
- Windows riski: yok — regex/formatlama düzeltmeleri platformdan bağımsız.
