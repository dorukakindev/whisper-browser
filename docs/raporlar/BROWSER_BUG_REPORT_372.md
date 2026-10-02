# BROWSER_BUG_REPORT_372 — 100-kuyruk batch 9: Windows hazırlık matrisi (81–90)

**Tarih:** 2026-10-02 · **Kapsam:** Windows'a özgü 10 dosya-sistemi/ortam sınıfı — file locking, büyük-küçük harf duyarsızlığı, MAX_PATH, UNC, .bat doğruluğu, argüman kaçışı, ayrılmış adlar, ADS/zone, spawn argv, askıya alma. Gerçek kullanım ortamı `D:\Whisper Local`, RTX 4070 Ti.

## Yöntem

Her maddede mevcut davranış kod okuma + kaynak-dilimli VM testleriyle doğrulandı; doğrulanmış kusur düzeltildi, geri kalanlar kanıtıyla kapandı. Sonuç: **2 gerçek kusur düzeltildi, 8 madde temiz kapandı.**

## Düzeltilen kusurlar

| # | Kusur | Kök neden | Düzeltme |
|---|-------|-----------|----------|
| B-372-01 | Windows'ta antivirüs / Search indexer az önce yazılan dosyayı kısa süre açık tutarken `renameSync` EPERM/EACCES/EBUSY ile düşer → kullanıcı "kaydetme başarısız" görür | Tüm kalıcı depolar atomik `tmp→rename` kullanır ama tek denemeliydi; 40 rename çağrısı / 20 dosya | `src/fsync-utils.js` `renameSyncResilient(io, tmp, target, {attempts=10, delayMs=25})`: yalnız EPERM/EACCES/EBUSY sınıfında sınırlı yeniden deneme (`Atomics.wait` senkron uykusu), diğer hatalar ilk denemede aynen fırlar; sahte-fs testler davranış aynı (retry sınıfı dışı kodlarda tek geçiş). 40 çağrı noktası devralındı |
| B-372-02 | `watch:report` ve burnin kurtarma eşleşmesi yol karşılaştırmasını byte-eşitliğiyle yapıyordu — Windows'ta `D:\Film.mkv` ≠ `d:\film.mkv` aynı dosyadır | `watchSeen.get(filePath)` Map anahtarı fs-enumeration'dan kanonik gelir ama rapor dışarıdan gelen biçimle soruyordu; burnin resume `previousRecovery.videoPath === videoPath` | `canonicalFsPath(p)` = `path.resolve` + win32'de küçük harf; iki nokta da onu kullanıyor. `tests/windows-path-canonical.test.js` (4 kontrol) |

## Temiz kapanan maddeler (kanıt)

| Madde | Bulgular |
|-------|----------|
| 82 — MAX_PATH | `tools/windows-manifest.js` exe manifest'e `longPathAware` yazar; `windows-manifest-longpath.test.js` 9 bölüm kilitli |
| 84 — UNC | `canonicalLocalPath` `\\?\`/`\\.\` device öneklerini güvenlik gereği reddeder, `\\server\share` UNC'yi kabul eder (win32 `path.isAbsolute`); ADS `C:\x:y` reddi kilitli |
| 85 — .bat doğruluğu | install/start/drm-kur `setlocal` + hata yolunda `pause`; R155 turunda kilitlendi, drift yok |
| 86 — ffmpeg yol kaçışı | `ffSubtitlesArg` Windows kaçışı testlerle kilitli (R287 `=`biçimi matrisi) |
| 87 — ayrılmış adlar | `windowsSafeFileName` 9 kullanıcı-türetili dosya adı noktasında + 17 test kilidi; queue nokta ayıklıyor |
| 88 — suspend/uyku | Kuyruk işleri ayrı süreçler; OS askıya alma tümünü birlikte durdurur, resume'da devam — ek bekçi gerekmiyor |
| 89 — ADS/MotW | İndirilen dosyalara zone işareti uygulanmıyor (yerel üretim); `canonicalLocalPath` ADS'i zaten reddediyor |
| 90 — spawn argv | Tüm subprocess çağrıları argv dizisi (shell:false) — yol/Türkçe güvenli |

## Etki değerlendirmesi (Windows)

- B-372-01: yüksek — kayıt hatalarının Windows'taki en sık nedeni (Defender/indexer). Her kaydetme noktası korundu.
- B-372-02: orta — kullanıcı dosyayı farklı büyük-küçük harfle rapor ettiğinde izleme çubuğu/kurtarma sessizce boş dönerdi.

## Test kanıtı

- Yeni: `tests/fsync-rename-resilient.test.js` (6 kontrol: EPERM kurtarma, EACCES/EBUSY, deneme sınırı, sınıf dışı ilk deneme, atomicWriteFileSync toleransı, sahte-io tek geçiş)
- Yeni: `tests/windows-path-canonical.test.js` (4 kontrol)
- Dokunan slice-test'ler: adversarial-ipc, browser-report117-regressions, history, queue-opts-roundtrip, validation, disk-full — `renameSyncResilient` VM bağlamına enjekte edildi
- `npm test` tam suit: **0 başarısız** (final koşu bu commit ile)
- Windows'ta elle doğrulanamayan: gerçek Defender lock davranışı — senaryo kodlanmış, CI'da Windows işi yok (Actions kapalı)
