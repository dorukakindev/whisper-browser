# R411 — src/ derin-okuma kapanışı: kalan 29 dosya (temiz)

**Tarih:** 2026-10-01 · **Dal:** devin/1790854313-r411-src-tail · **Kod değişikliği:** yok

## Kapsam

Derin-okuma kampanyasının src/ envanterindeki son okunmamış birinci-taraf dosyalar (~2.700 satır). Okunanlar:

- `src/browser-library-tools.js` (533) — birleşik kütüphane araması, koleksiyon yönetimi, metin/manga anchor capture+restore betikleri, ReopenGuard
- `src/pipeline-job.js` (186) — süreç-ağacı sonlandırma, çıktı işlem günlüğü kurtarma
- `src/gpu-diagnostics.js` (160), `src/browser-terminology.js` (155)
- `src/local-file-access.js` (135), `src/browser-capture-provenance.js` (123)
- `src/browser-research-notebook.js` (114), `src/subtitle-output-contract.js` (106)
- `src/browser-automation-rules.js` (90), `src/watch-folder.js` (87)
- `src/browser-cloudflare-compat.js` (83), `src/youtube-tv-mode.js` (82)
- `src/translation-model-score.js` (81), `src/browser-diagnostics-export.js` (81)
- `src/subtitle-word-sidecar.js` (75), `src/text-stability-evaluator.js` (67)
- `src/youtube-player-response-pruner.js` (60), `src/browser-site-terminology.js` (58)
- `src/browser-site-zoom.js` (55), `src/subtitle-export-validation.js` (46)
- `src/async-timeout.js` (45), `src/process-io.js` (44), `src/browser-drm.js` (44)
- `src/process-lifecycle.js` (42), `src/browser-chapters.js` (41)
- `src/browser-dark-mode.js` (33), `src/browser-capture-recovery.js` (32)
- `src/browser-media-selection.js` (30), `src/subtitle-corpus-discovery.js` (24)

`src/renderer/vendor/browser-ass/worker.js` minifiye upstream (JASSUB) — kapsam dışı.

## Bulgular

**Doğrulanmış kusur yok.** Tüm dosyalar savunma ilkelerine uyuyor:

- Sınırlandırma: her normalleştirici `slice()`/`slice(0,N)`/`Math.max`/`clamp` ile uzunluk ve sayı sınırlarını zorluyor.
- Canonicalization: `local-file-access.js` realpath + uzantı çift-kapısı (orijinal ve çözümlenmiş yol) + alt-dizin kaçışı kontrolü; symlink/ADS takası uzantı değiştiremiyor.
- Journal kurtarma: `recoverOutputTransactions` tüm entry'lerin `path.dirname === root` olmasını doğrulayıp traversal reddediyor; `existed:false` + `state:prepared` kolunda kullanıcı dosyası silinmiyor (Python tarafıyla paralel).
- Anchor eşleşmesi: kesin eşleşme + bağlamsal filtreli fuzzy yedek (bütçeli DP, `similarity>=0.78`), belirsizlik `ambiguous` döndürüyor — sessiz yanlış hedef seçimi yok.
- Redaksiyon: diagnostics export'ta URL yolu, yerel yollar, token/anahtar desenleri ve yakalanan cue metinleri maskeli.
- Navigasyon: TV modu host allowlist'i (username/password ve https-dışı ret), Cloudflare prob marker'ları metin-eşleşmesinden önce DOM kanıtı istiyor (sahte-pozitif sınırlı).
- İdempotentlik: `createIdempotentCancel`, `ReopenGuard` dizisi, `TextStabilityEvaluator` yayımlanma işareti — çift-çalıştırma güvenliği yerinde.

## Kampanya durumu

src/ envanteri %100 okundu (değişken envanterde yeni dosyalar hariç). Kalan okunmamış yüzey yalnız küçük test dosyaları (~120 adet, mekanik kusur-taramasından temiz).

## Doğrulama

Kod değişmedi; test koşusu gerekmiyor (salt okuma + rapor).
