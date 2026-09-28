# BROWSER_BUG_REPORT_150 — R169 flaky test determinizmi

Tarih: 2026-09-27 · Dal: `codex/r169-flaky-determinism-1790520810` · Commit: `6c652b9`

## Yöntem

1. Tam takım iki kez koştu — ikisi de temiz (flake gözlenmedi; yük altında
   ortaya çıkabilecek pencereler statik taramayla arandı).
2. Statik tarama: gerçek-zaman `setTimeout` beklemeleri, `Date.now()`
   eşikleri, Math.random, hardcoded port, sanal saat kullanımı.

## Bulgular ve düzeltmeler

| Yer | Sorun | Düzeltme |
|---|---|---|
| `tests/audit-2026-09-22-browser-translate.test.js` ×2 | `setTimeout(250)`/`(200)` sonra `providerFailure` assert — CI yükünde devre kesici açılışı keyfi pencereyi aşabilir | `waitFor(() => scheduler.providerFailure)` koşul yoklaması (5ms adım, 5s tavan) |
| `tests/browser-downloads.test.js` | debounce `delay:5` için `setTimeout(15)` — 3× marj yükte daralır | `waitFor(() => events.length === 2)` |

## Temiz çıkan desenler

- `browser-cea-full-capture` — `setTimeout` fixture içi kasıtlı gecikme
  (sıralama testi), koşul bekleme değil → dokunulmadı.
- `browser-overlay-timing`, `browser-favicon-cache`, `browser-media-controller`
  — sanal saat/sayaçlı timer stub'ları; deterministik.
- watchdog `setTimeout(5000)`'lar — fail-safe guard'lar; doğru desen.
- `Date.now()` kullanımları — sanal sandbox içinde ya da gelecek
  `expiresAt` fixture'ı; eşik değil.
- Hardcoded port / Math.random kullanan test yok.

## Kalan sınır

Electron smoke'lar (`run-electron-smokes.js`) bu koşuya dahil değil —
ayrı envanter; oradaki ekran-görüntüsü/zamanlama yarışları için ayrı tur.

## Testler

- Değiştirilen 2 dosya + cea-full-capture regresyonu geçti.
- Tam takım 2 tur temiz.
