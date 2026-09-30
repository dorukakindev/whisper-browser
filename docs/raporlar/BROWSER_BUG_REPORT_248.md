# BROWSER_BUG_REPORT_248 — R299: settings export↔import tam-tur ratchet'i

Tarih: 2026-09-30 · Dal: `test/r299-settings-roundtrip` · Bitiş kod: `2defb2e`

## Özet

settings:export ↔ import hattının alan-düzeyi sadakati kilitlendi.
Bulgu yok — temiz tur.

## Doğrulanan davranış (kilitli)

- Tüm izinli alanlar export→import tam-turda deepStrictEqual (glossary,
  4 yol alanı, preset çifti, tüm ui kalıcı kontrolleri, playerPositions,
  üç endpoint grubu).
- İdempotans: ardışık iki içe aktarma aynı sonucu verir.
- Güvenlik sözleşmesi: endpoint kimliği değişiminde mevcut apiKey yeni
  endpoint'e taşınmaz; aynı kimlikte korunur.
- Bilinmeyen/gelecek-sürüm alanları düşürülür (downgrade davranışı).
- `__proto__` içeren kök dosya bütün olarak reddedilir (düşürülmez).
- Zarf bölümleri passthrough; backupVersion 2 mirası + BOM tolere edilir.
- 150 tohumlu fuzz: geçerli alt-kümeler kayıpsız; bozuklar
  SettingsValidationError.

## Kanıt

`tests/settings-roundtrip.test.js` 10/10 + etkilenen 5 dosya yeşil.
