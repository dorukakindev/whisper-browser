# BROWSER_BUG_REPORT_331 — Kuyruk-50 madde 19: Takılma teşhis paneli (yerel oynatıcı)

Tarih: 2026-10-01 · Dal: `devin/<ts>-r419-stutter-probe` · Başlangıç: `bc99b9c`

## Kapsam

Madde 19: "Kare düşüşü, buffer, decode gecikmesi ve altyazı çizim maliyetini
birlikte ölçen tanı akışı. Aynı medyada sorunun ağ, video çözme veya renderer
kaynaklı olduğunu ayırt etme."

## Ön denetim bulgusu (mevcut durum)

- Web/BrowserView modunda tam teşhis hattı zaten var:
  `createPlaybackDiagnosticTracker` (main.js ~3712), `observeMediaSample`
  (~12320), `DIAGNOSTIC_CATALOG` (TR/EN DRM/codec/license/ağ girdileri),
  `renderBrowserPlaybackDiagnostics` (renderer ~8208), ayarlar
  `browser-diagnostics` sayfası, komut paleti girdisi.
- **Yerel oynatıcıda (player modu) karşılık yoktu** — `<video>` elementinin
  `getVideoPlaybackQuality()` (düşen/toplam kare), `video.buffered` (ileride
  süre), `requestVideoFrameCallback` kare-aralığı jitter'ı ve `renderCue` çizim
  maliyeti hiç ölçülmüyordu. Boşluk doğrulanıp kapatıldı.

## Uygulanan akış

- `player.stutterProbe` ölçüm penceresi + `player.renderCostRing` (≤240 ms
  halkası; `renderCue` gövdesi `performance.now()` ile sarıldı).
- `collectLocalStutterSample` 1 sn aralıklarla yalnız oynarken örnekler:
  kare düşüşü deltası (getVideoPlaybackQuality), ileride buffer
  (`localBufferedAhead`), renderCue maliyeti, mevcut rVFC döngüsüne
  enjekte edilen `mediaTime` farkı jitter'ı, `waiting`/`stalled` sayaçları.
- `analyzeLocalStutter` saf karar fonksiyonu: sinyal sırası renderer
  (çizim ort ≥8ms veya p95 ≥16ms) → decode (düşüş ≥%3 veya kare-p95 ≥80ms +
  hafif düşüş) → network (stall + buffer <1.5s, veya buffer <0.5s); çoklu
  sinyalde `mixed`, <5 sn örnekte `insufficient`.
- UI: `playerStutterProbe` düğmesi (toggle, otomatik 60 sn sınırı) +
  `playerStutterHint` canlı/final satırı + sonucun `logLine` özetine yazımı.
  Tüm metinler TR+EN çift.

## Kanıt

- `node tests/local-stutter-probe.test.js` — **25/25 PASS** (verdict matrisi,
  eşik değerleri, güvenli NaN/negatif giriş, bufferedAhead aralık senaryoları).
- `node --check src/renderer/renderer.js` — temiz.

## Windows notu

`getVideoPlaybackQuality` Chromium'da mevcut (Electron 43); `rVFC` zaten
`frameDuration` ölçümü için kullanılıyor — eksikse probe o alanları `—` gösterir.
Gerçek GPU takılmaları yalnız Windows makinede gözlenebilir (liste: elle).
