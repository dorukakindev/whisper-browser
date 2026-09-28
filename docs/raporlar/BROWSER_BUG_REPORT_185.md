# BROWSER_BUG_REPORT_185 — R226: #155 Devin Review triage (tamamen bozuk PDF sayfaları)

Tarih: 2026-09-29 · Dal: `codex/r226-review-round-1790629400` · Taban: `origin/master` (c6711ad)

## Kapsam

Merged PR #155'in Devin Review turu (`pr-review-job-15deb427d8b640e482b2195490c2dd40`,
commit `cf746a0`): 1 bug + 1 flag. Bug doğrulanıp düzeltildi; flag devir
notuyla kapandı.

## Doğrulanmış bug → düzeltildi

| # | Bulgu | Kök neden | Düzeltme |
|---|-------|-----------|----------|
| BUG_0001 | Tamamen bozuk sayfa kayıtları sağlam yedeği gizliyor | `isPdfTranslationStateCompatible` `pages`'ın nesne olduğunu yeterli sayıyordu; `pages:{abc:'x'}` gibi tüm kayıtları geçersiz dosya uyumlu sayılıp `normalize`'da boş durum döndürüyordu → `.bak`/legacy hiç denenmiyordu. | `loadPdfTranslationState`: `raw.pages` kayıt taşıyıp normalize sonucu boşsa aday atlanır (`Object.keys(raw.pages).length > 0 && !normalizedState.pages` → `continue`). Regresyon: pdf-translate.test senaryo 3. |

## Flag kapanışı

- **FLAG_0001** (devir bitiş kimliği): yeni not `docs/devir/2026-09-29-0243.md`.

## Doğrulama

- `tests/pdf-translate.test.js`: 5 dosya senaryosu geçti
- `node --check` pdf-translate.js / main.js ✓

## Windows etkisi

- Yalnız okuma-yolu semantiği; `pages:{2:[]}` meşru boş-sayfa dosyaları da
  yedeğe düşer — taşınacak kayıt olmadığından veri kaybı üretmez.
