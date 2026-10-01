# BROWSER_BUG_REPORT_339 — Kuyruk-50 madde 27: checkpoint sürümleme

Tarih: 2026-10-01 · Başlangıç: `ff6a94a`

## Kusur

`loadCeaCheckpoint` kaydı `version !== 1` olursa toptan reddediyordu:
sürüm alanı olmayan eski kayıtlar yüklenemezdi (güvenli dönüşüm yok) ve
uygulama/kayıt kimliği bilgisi tutulmuyordu.

## Düzeltme

- `saveCeaCheckpoint` artık `build` (uygulama sürümü, ≤40ch) alanını
  saklar; kaynak özeti zaten `checkpointId` (sha256 kaynak+medya+kanallar).
- `checkpointVersion`: sürüm alanı yok → v0 sayılıp `migratedFrom: 0`
  ile güvenli dönüştürülür (alanlar normalize edilir, bilinmeyenler düşer);
  tam sayı olmayan → null; `version > VERSION` → reddedilir ama dosya
  silinmez (gelecek sürümün sağlam kaydı kaybolmaz).
- Geri yükleme mesajı dönüştürülen kaydı bildirir: "(vN kaydı dönüştürüldü)".

## Kanıt

`tests/browser-cea-checkpoint.test.js` PASS — build saklanır; v0 migrasyonu;
gelecek sürüm reddi + dosya korunur; tam sayı olmayan sürüm reddi; bozuk
JSON → null (taze başlangıç, iş kaybı yok).
