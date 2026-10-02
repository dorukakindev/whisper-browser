# BROWSER_BUG_REPORT_392 — Kuyruk-50 batch 9+10 (maddeler 41–50)

**Tarih:** 2026-10-02 · **Dal:** devin/1790925653-b9-dataprotect
**Kapsam:** veri koruma (yedekleme, dış-değişiklik, disk, çevrimdışı, kurtarma merkezi) + kurulum/sürüm hazırlığı (yükseltme yedeği, çevrimdışı manifest, güncelleme ön kontrolü, Windows rehberi, RC teslimi).

## Madde sonuçları

| # | Konu | Sonuç |
|---|------|-------|
| 41 | Yedekleme/geri yükleme | ✅ Tamam — kapsamlı dışa aktarma, içe aktarma öncesi bölüm diff'i, secrets sınırı |
| 42 | Dışarıdan dosya değişikliği | ✅ Tamam — dizin izleme + kendi yazımı bastırma + düzenleme çakışma uyarısı |
| 43 | Disk alanı ön kontrolü | ✅ Tamam — burnin/transcribe ön kontrol + iş-içi lowDisk uyarısı |
| 44 | Çevrimdışı kullanılabilirlik | ✅ Tamam — netBadge + yerelleşen sinyaller + online kapıları |
| 45 | Kurtarma merkezi | ✅ Tamam — tek ekran (kuyruk + burnin + timeline + browser işleri) |
| 46 | Yükseltme veri yedeği | ✅ Yeni — sürüm değişiminde userData JSON anlık görüntüsü |
| 47 | Çevrimdışı kurulum manifesti | ✅ Yeni — tools/offline-manifest.js + docs/OFFLINE-MANIFEST.md |
| 48 | Güncelleme ön kontrolü | ✅ Yeni — IPC + UI akışı + yedek eylemi |
| 49 | Windows sorun giderme rehberi | ✅ Yeni — docs/WINDOWS-SORUN-GIDERME.md |
| 50 | Sürüm adayı teslimi | ✅ Yeni — docs/SURUM-NOTU-RC.md (etiket kullanıcıda) |

## Bulunan ve düzeltilen kusurlar

1. **Şema eşitlemesi (önceden var olan)**: renderer `PERSIST_VALUE_CONTROLS` listesi
   4 anahtar (`abModel`, `translatePriceIn`, `translatePriceOut`, `networkBudget`)
   settings-security.js şemasında eksikti → listelere eklendi, `networkBudget` enum
   ve fiyat alanlarına sayısal aralık doğrulaması kondu.
2. **rawSpawnSync ratchet**: `nvidia-smi` tanı çağrısı sarmalanmamış rawSpawnSync
   kullanıyordu (sayım 2≠1) → `spawnSync` sarmalına geçirildi; secret-env temizliği
   bu çağrı için de geçerli.
3. **Madde 42 kendi-yazımı yankısı**: `writeSubtitleAtomic` uygulamanın kendi
   yazımları dizin izleyicide "dış değişiklik" alarmı üretiyordu →
   `ownSubtitleWrites` haritasıyla 2 sn'lik bastırma penceresi.
4. **Büyük dosya güvenliği**: izleyici olayı 4 MB üzeri altyazılarda içerik yerine
   yalnız uyarı gönderir — ekranı boş içerikle silmez.

## Test kanıtı

- `tests/data-protection-batch9.test.js` — 10/10 PASS (yeni dosya)
- `tests/release-readiness-batch10.test.js` — 10/10 PASS (yeni dosya)
- `tests/settings-security.test.js` — 23/23 PASS (2 önceden-bozuk test onarıldı)
- `tests/ipc-parity.test.js` — parity tam (234 handle, updatePrecheck dahil)
- `node --check` main/preload/renderer temiz

## Windows'a özgü notlar

- `preupgrade-backup` dizini `%APPDATA%` altında oluşur; büyük blob dizinleri
  kopyalanmaz, yalnız kök JSON durum dosyaları.
- Rehber (M49) gerçek bulgulara dayanır: cuDNN PATH (start.bat), CUDA OOM
  CPU geri dönüşü (B-329-02), longPathAware (B-48-01), Defender kilidi (B-372).
- Ubuntu'da doğrulanamayan: gerçek Defender kilit davranışı, GPU kurulum
  yolu (VM GPU'suz).
