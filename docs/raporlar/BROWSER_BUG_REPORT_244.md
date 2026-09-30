# BROWSER BUG REPORT 244 — CI determinizm denetimi + ratchet

**Tarih:** 2026-09-30 · **Kapsam:** Plan-2 madde 10 — test ağacında duvar-saat/rastgele bağımlılık süpürmesi
**Sonuç:** 2 küçük determinizm düzeltmesi + kalıcı ratchet (`ci-determinism-ratchet`).

## Denetim bulguları
| Kategori | Bulgu | Sonuç |
|---|---|---|
| `Math.random` | 1 kullanım — `series-memory-race` geçici dosya adı | Deterministik `process.pid`+sayaç yapıldı; ağaçta **0** (yasaklı) |
| Duvar-saati assert'leri | 8 envanter — 6 perf bütçesi (≥10× marj) + 2 alt-sınır | En ince marj (retryAfter 80ms → ≥70) → `≥50` genişletildi; kalanı sağlıklı |
| Uyku-beklemeler | 21 `setTimeout(r, N)` — tümü ≤120 ms, kasıtlı zamanlama simülasyonları | Büyüme baseline ile yasaklandı |
| Backend fixture `time.sleep` | Yalnız kilit-tutma `hold` modunda | Kasıtlı — deterministik davranış gerektirir |
| `process.env.CI` koşullu atlama | Yok | Temiz |
| `random.` (Python fixture) | Tohumsuz kullanım yok | Temiz |

## Ratchet tasarımı
`tests/ci-determinism-ratchet.test.js` üç sayacı `fixtures/ci-determinism-baseline.txt`'e karşı denetler (css-hardcoded-color-baseline sözleşmesi):
- `math_random=0` — test + fixture ağacında `Math.random(` yasak (ratchet dosyası kendini dışlar)
- `sleep_waits=21` — `setTimeout(r|res|resolve` kalıbı ancak azalabilir
- `wallclock_asserts=8` — `Date.now()`/`performance.now()` üzerine assert ancak azalabilir

Yeni determinizm-kırıcı eklenince CI kırmızı olur.

## Kanıt
- `node tests/ci-determinism-ratchet.test.js` → `random=0/0, sleep=21/21, wallclock=8/8`
- `series-memory-race` 6/6 + `browser-translation-reliability` PASS.

## Sınırlar
- Mevcut 8 duvar-saati assert'i marj analiziyle korundu; kaldırılmadı — yenileri engellenir.
