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

## Testler — `tests/burnin-recovery-schema.test.js` (11 kontrol)

v1 kanonik alanlar, sürüm sözlüğü (16 değer; `1e309`/`Infinity`/`'Infinity'`
reddi dahil), idempotans, bilinmeyen anahtar toleransı, tip-bozuk kelepçe,
zorunlu-yol kapısı, primitive reddi, uzunluk budaması, **dosya yolu**
(birincil bozuk → `.bak` yedeği; sürüm-reddi → `.bak` dirilmez — iki yönde de).
`burnin-output.test.js` jest suiti yeşil. `persistent-schema-inventory`
ratchet'ine `burnin-recovery` kaydı eklendi.

## Devin Review bulguları (#234, `0f3f658` üstü 2 tur)

- **Bug — taşan sürüm Infinity:** `1e309`/`Infinity` sürümü `Number.isFinite`
  kontrolünün dışında kalıp v1 gibi kabul ediliyordu. Kapı artık `Number(v) > 1`
  düz kıyası; Infinity'yi de yakalar.
- **Bug — `.bak` dirilmesi:** birincil dosya sürüm-reddi aldığında `.bak`
  v1'e düşülüp kullanıcının terk ettiği eski iş kurtarılabiliyordu. Okuma
  döngüsü `readBurninRecoveryFile`/`burninRecoveryVersionTooNew` ile
  `burnin-output.js`'e taşındı — sürüm-reddi her iki adayda da dosyayı
  tamamen reddeder; yalnızca "okunamaz" sınıfı `.bak`'a düşürür.
  (Bu değişiklik aynı zamanda "yalnız normalizasyon ölçülüyor" flag'ini
  kapatır: dosya-yolu davranışı doğrudan test edilir.)

## Sınırlar / Windows
- Eski (sürümsüz) dosyalar aynen kabul edilir — geriye uyumlu.
- Windows: dosya okuma yolu değişmedi.
