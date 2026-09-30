# BROWSER_BUG_REPORT_262 — R313: disk-dolu senaryosu geniş matrisi

Tarih: 2026-09-30 · Dal: `devin/1790749916-disk-full` · Kod commit: `be57d12`

## Kapsam

Tüm disk yazıcılarının ENOSPC / yarım-yazım davranışının uçtan uca envanteri:
ayarlar, pencere durumu, kuyruk (`queue-state.json` + `.bak` + 8MB bekçi),
geçmiş/yer imleri, favicon, indirme kayıtları, altyazı tercihleri, PDF çeviri
durumu, iş günlükleri, kullanıcı-seçimli dışa aktarımlar, backend
(transcribe/media) yazıcıları.

## Sağlam bulunan yüzeyler

- `writeJsonAtomic` / `writeMirroredJsonAtomic` / `writeBufferAtomic`:
  tmp + rename + hata-yolu unlink töreni; `.bak` önce yazılır.
- `queue-state.json`: oversize → `_oversized` işaretçisi (sessiz sıfırlama yok),
  `.bak` yedeği, `writeQueueState` `ok:false` döndürür.
- `flushBrowserPlaces`: hata → dirty bayrağı korunur + tek seferlik
  `places-save-error` kullanıcı bildirimi.
- `browser-downloads.js`: `saveRecords` try/catch + kullanıcı mesajı.
- `BrowserSubtitlePreferences`: yazım hatası öğeyi bellekte de tutmaz
  (bellek↔disk tutarlı).
- `saveSettings`/`settings:export` gibi IPC yolları hatayı `{ok:false,error}`
  olarak döndürür.
- Backend: `io_errors.py` ENOSPC → "diskte yeterli boş alan yok" (ffmpeg +
  yt-dlp); `media.py` ENOSPC yakalar; `transcribe.py` yazıcıları hatayı
  olay olarak yayar (mevcut testlerle kilitli).

## Bulunan ve düzeltilen boşluklar

1. **İş günlüğü WriteStream'i 'error' dinleyicisizdi (çökme).**
   `startJobLog` içindeki `fs.createWriteStream(..., flags:'a')` akışında
   hata dinleyicisi yoktu. Disk dolu veya yazım izni kaybolunca WriteStream
   'error' olayını eşzamansız yayar; dinleyicisiz `error` olayı Node'da
   atılmamış istisna olarak fırlar → **Electron ana süreci düşer** (uygulama
   ölür). `stream.write()` etrafındaki try/catch bunu kurtarmaz çünkü hata
   senkron değil olayla gelir. Artık akış kurulurken `stream.on('error')`
   bağlanıyor: hata durumunda `jobLog` sıfırlanıyor ve akış kapatılıyor —
   günlük bırakılır, uygulama çalışmaya devam eder. (`src/main.js` ~771)

2. **Kullanıcı-seçimli dışa aktarımlar atomik değildi (veri yok olması).**
   Ham `fs.writeFileSync` hedefi önce sıfırlar; disk dolu anında kullanıcının
   var olan sağlam dosyası yok olur ve kırpılmış dosya artık kalır. Kullanıcı
   hedefi seçtiği tüm yazımlar artık `writeBufferAtomic` (tmp+rename, hata
   yolunda tmp temizliği): ekran görüntüsü PNG, tarayıcı oturum paketi,
   sayfa PDF'i, tanı paketi, PDF çevirisi dışa aktarımı (txt/md/html),
   abonelik dışa aktarımı, resource-soak raporları ×2. (`src/main.js`)

## Kalan ham `fs.writeFileSync` (kasıtlı, dokunulmadı)

- `whisper-live-asr` WAV parçaları: her seferinde benzersiz yeni dosya —
  ezilecek sağlam hedef yok; hata IPC hatasına dönüşüyor.
- `chatPayload` (0o600): gizli-izin modu gerekli, atomik yardımcı mod taşımıyor.
- İptal işaret dosyası: varlığı yeterli, içerik önemsiz; çağıran zaten yutuyor.

## Testler

- Yeni `tests/disk-full.test.js` (3 senaryo): whitelist dışı ham
  `fs.writeFileSync` ratchet'i; iş günlüğü akışında `stream.on('error')` +
  `jobLog=null` ratchet'i; `writeBufferAtomic`'in ENOSPC altında hedefi ve
  tmp'yi temiz bıraktığının davranış kilidi (sahte io ile).
- Kırmızı kanıtı: aynı testler `origin/master` src/main.js'te 2/3 FAIL.
- Yan yüzeyler: `rejection-atomicity`, `subtitle-export-validation`,
  `anki-export-contract` — hepsi geçti.
- `node --check src/main.js` temiz.

## Windows etkisi

- `writeBufferAtomic` tmp+rename; Windows'ta hedef kilitliyken rename
  EPERM/EBUSY dönebilir — hata çağırana `{ok:false}` olarak yükselir (önceki
  davranışla aynı sözleşme; artık sağlam dosya korunur).
- İş günlüğü çöküşü her platformda aynıydı; düzeltme platform bağımsız.
- Doğrulanmadı: gerçek dolu diskle Windows'ta elle dışa aktarım denemesi.

## Sınırlar / açık işler

- `.tmp` dosya takma adı pid+uuid içerir; çakışma yok.
- "Disk neredeyse dolu" erken uyarısı (boş alan probu) bu turun dışında —
  olası sonraki tur maddesi.
