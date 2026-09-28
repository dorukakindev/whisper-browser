# BROWSER_BUG_REPORT_186 — R227: #156 Devin Review triage (meşru boş sayfa dirilmesi)

Tarih: 2026-09-29 · Dal: `codex/r227-review-round-1790630000` · Taban: `origin/master` (f2ac573)

## Kapsam

Merged PR #156'nın Devin Review turu (`pr-review-job-d9283d7848904f79a4a18df90d8245c1`,
commit `b6fcc90`): 1 bug + 1 flag. Bug doğrulanıp düzeltildi — R226'nın
kendi düzeltmesinin regresyonuydu.

## Doğrulanmış bug → düzeltildi

| # | Bulgu | Kök neden | Düzeltme |
|---|-------|-----------|----------|
| BUG_0001 | Meşru boş sayfa kaydı eski çevirileri diriltiyor | R226'nın `raw.pages` kayıtlı + normalize boş → atla kuralı, `{2: []}` (main.js:7119 `recordPdfPageTranslation(state, n, [])` ile yazılan temizlenmiş-sayfa durumu) gibi meşru dosyayı bozuk sayıp `.bak`a düşüyordu; `.bak`taki eski çeviriler dirilirdi. | Bozukluk testi yapısal hale getirildi: geçersiz sayfa anahtarı, dizi olmayan değer veya `normalizePdfBlock`'un `null` döndüğü blok → atla. Boş dizi meşru kalır. Regresyon: senaryo 3b/3c. |

## Flag kapanışı

- **FLAG_0001** (devir bitiş kimliği): yeni not `docs/devir/2026-09-29-0253.md`.

## Doğrulama

- `tests/pdf-translate.test.js`: 7 dosya senaryosu geçti (3b dirilme, 3c kısmi bozukluk)
- `node --check` pdf-translate.js / main.js ✓

## Windows etkisi

- Okuma-yolu semantiği; `normalize` davranışı değişmedi (`{'2': []}` korunur).
