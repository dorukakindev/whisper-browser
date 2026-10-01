# BROWSER_BUG_REPORT_356 — Kuyruk-50 madde 44: Mahremiyetli tanı paketi

Tarih: 2026-10-01 · Dal: `devin/1790892683-diagnostics-preview` · Başlangıç HEAD: `a968577`

## Madde metni

> Mahremiyetli tanı paketi: Hata raporuna sistem/iş bilgisi ekleyen, token, cookie, kişisel yol ve içerikleri temizleyen paketleme akışı geliştir. Kullanıcı gönderilecek veriyi önceden inceleyebilsin; redaksiyonu fixture'larla doğrula.

## Mevcut uygulama (doğrulanan)

- `src/browser-diagnostics-export.js`: eksiksiz redaksiyon kitaplığı — `redactBrowserDiagnosticsText` (URL, `file:` yol, `C:\`/`\\unc`/`/home`/`/Users` yol, `api_key|token|sig|signature|secret|authorization|cookie|password`, `Bearer|Basic`), `sanitizeDiagnosticsSecrets` özyinelemeli gezgin (dizgiler 2048 sınırı), `capturedCueTexts`/`redactCapturedCueText`/`sanitizeDiagnosticsAgainstCueText` cue-metni süzgeci.
- `browserDiagnosticsExportSnapshot()` (main.js): iş bağlamı — operationId, pageUrl, adapter, counts, activity, responsiveness, translation, acquisition, manifest, coverage, adblock, recent — uçta iki katmanlı sansürden geçer.
- `browser:diagnostics:export` IPC: `dialog.showSaveDialog` + `writeBufferAtomic`.
- Fixture doğrulaması mevcut: `tests/browser-diagnostics-export.test.js` + Electron smoke'ta hassas-değer enjeksiyonu (`--electron-diagnostics-sensitive-smoke`).

## Bulunan boşluklar

1. **Sistem bilgisi yoktu.** Paket yalnız iş/tanı verisi taşıyordu; platform, sürümler, GPU özeti hata ayıklamada gerekli bağlam.
2. **Ön-inceleme yoktu.** "Dışa aktar" düğmesi paketi doğrudan kaydetme diyaloğuna götürüyordu; kullanıcı içeriği göndermeden/kaydetmeden önce inceleyemiyordu.

## Düzeltme

- `browserDiagnosticsExportSnapshot()` — `system` bloğu eklendi: `platform`, `arch`, `appVersion`, `versions.{electron,chrome,node}`, `locale`, `gpu` (GPU tanı özeti). Kişisel veri içermez; uç sansür katmanı yine uygulanır.
- `browser:diagnostics:preview` (yeni IPC) — anlık paketin JSON'u döner; `authorizedBrowserSender` korumalı.
- `browser:diagnostics:export` — isteğe bağlı `{json}` payload'u kabul eder: kullanıcının incelediği içerik aynen yazılır (JSON doğrulaması + 4MB sınırı). Payload yoksa eski davranış.
- `preload.js` — `previewBrowserDiagnostics` köprüsü; `exportBrowserDiagnostics(json)` parametrize.
- `renderer.js` — "Dışa aktar" düğmesi artık önce ön-inceleme diyaloğu açar (`showDiagnosticsReviewDialog`): paketin tamamı kaydırılabilir `<pre>` içinde görünür; "Dışa aktar…" incelenen JSON'u yazar, "İptal" hiçbir şey yazmaz. Diyalog `retranslate-review` kalıbı + `syncBrowserOcclusion()` tutarlılığıyla.
- `styles.css` — `.diagnostics-review-json` kaydırılabilir kod bloğu.

## Kanıt

- `node tests/browser-diagnostics-export.test.js` — geçti (fixture redaksiyon + yeni akış ratchet'leri).
- `node tests/preload-usage-ratchet.test.js` — 241 export, 0 kullanılmayan.
- `node tests/browser-foundation.test.js` — 24 test; `node tests/browser-translation-integrity.test.js` — 10 test.
- `xvfb-run electron tests/electron-subtitle-output.smoke.js` — gerçek Electron: preview IPC doğrulandı (system/platform alanları, hassas değer yok), export yazımı + mevcut sansür iddiaları yeşil.

## Windows etkisi / doğrulanmayanlar

- Diyalog native `<dialog>` + mevcut token'larla; Windows'a özgü davranış farkı beklenmez. Gerçek Windows'ta görsel inceleme doğrulanmadı (Ubuntu'da Electron smoke ile doğrulandı).
