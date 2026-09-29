# BROWSER_BUG_REPORT_187 — R228: #157 Devin Review triage (sayfa-bazlı kurtarma)

Tarih: 2026-09-29 · Dal: `codex/r228-review-round-1790630400` · Taban: `origin/master` (8872287)

## Kapsam

Merged PR #157'nin Devin Review turu (`pr-review-job-7751b11bbf2747d78938253a0ffd059e`,
commit `500db60`): 1 bug + 1 flag. Bug doğrulanıp düzeltildi — R227'nin
tüm-dosya reddinin üstüne gelen daralma.

## Doğrulanmış bug → düzeltildi

| # | Bulgu | Kök neden | Düzeltme |
|---|-------|-----------|----------|
| BUG_0001 | Bozuk sayfa, temizlenmiş sayfanın çevirilerini diriltiyor | `corrupt` testi tüm dosyayı reddediyordu: `{2: [], 5: [null]}` gibi bir dosya `.bak`a düşüyor, `.bak`taki eski sayfa-2 çevirileri dirilirdi. | Sayfa-bazlı kurtarma: geçersiz kayıtlar (kötü anahtar, dizi olmayan değer, `null` blok) filtreden atılır; sağlam kayıtlar kurtarılır. Yalnız tümüyle bozuk dosya (0 sağlam kayıt) adaydan atlanıp yedeğe düşer. Regresyon: senaryo 3d. |

## Flag kapanışı

- **FLAG_0001** (devir bitiş kimliği): #157 notu yerinde düzenlenemez (AGENTS.md) — kesin kimlik yeni tarihli notta `docs/devir/2026-09-29-0302.md` (PR #158).

## Doğrulama

- `tests/pdf-translate.test.js`: 8 dosya senaryosu (3d kurtarma; 3b/3c korundu)
- `node --check` pdf-translate.js ✓

## Windows etkisi

- Okuma-yolu semantiği; yazıcı ve normalize davranışı değişmedi.
