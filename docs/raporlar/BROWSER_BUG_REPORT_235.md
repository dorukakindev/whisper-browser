# BROWSER_BUG_REPORT_235 — R286: burnin-recovery şema migrasyon sözlüğü

**Dal:** `test/r286-burnin-schema` · **Tür:** küçük sertleştirme + test

## Bulgu

`normalizeBurninRecovery` (`src/burnin-output.js`) `raw.version` alanını hiç
okumuyordu — dönen nesneye her zaman `version: 1` yazılıyordu. `burnin-recovery.json`
gelecekte v2+ ile yazılırsa alan anlamları değişmiş olabilir; sessizce v1
gibi okumak yanlış yollarla kurtarma yapabilir (`clearBurninRecoveryState`'in
`removeTemp` temizliği dahil). Üstelik `.bak` yedeği de v2 içerikli olur,
tüm dosyalar atlanırdı.

## Düzeltme

- `BURNIN_RECOVERY_SCHEMA_VERSION = 1` sabiti eklendi; hem kapıda hem
  normalize çıkışında kullanılıyor.
- Sözlük: eksik/bozuk sürüm → v1; `version ≤ 1` → v1 parse;
  `version > 1` → `null` (kurtarma yok sayılır, yanlış silme yok).

## Testler — `tests/burnin-recovery-schema.test.js` (9 kontrol)

v1 kanonik alanlar, sürüm sözlüğü (13 değer), idempotans, bilinmeyen
anahtar toleransı, tip-bozuk kelepçe, zorunlu-yol kapısı, primitive
reddi, uzunluk budaması. `burnin-output.test.js` jest suiti yeşil.

## Sınırlar / Windows
- Eski (sürümsüz) dosyalar aynen kabul edilir — geriye uyumlu.
- Windows: dosya okuma yolu değişmedi.
