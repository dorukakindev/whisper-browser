# R815 managed storage — yalnız raporlama

HEAD `df94b3d60b7123a682cd0062371bbb2850a5fb60`; 2 yeni bağımsız kök (1 P1 / 1 P2). Ürün/test/Git/kişisel veri değişmedi.

## STORAGE01 — P2 — Varlık önbelleğini temizleme SQLite tarafından kullanılan kapalı medya altyazılarını silip geri yüklemeyi bozuyor

**sources:** src/main.js:19389; src/main.js:19432; src/main.js:19446; src/main.js:9888; src/browser-asset-gc.js:18; src/watch-index.js:366; src/job-timing-helpers.js:255; src/renderer/renderer.js:2984; src/renderer/renderer.js:2995; src/preload.js:332

**reproduce:** Gerçek persistBrowserTrack ile sentetik medya altyazısı kaydet; üretici sekmesini kapalı kabul et (açık/session/workspace listesinde yok).; Aynı SQLite indeksindeki satırla gerçek restorePersistedBrowserTracks çağrısı 1 döner. Startup pruneAndSweepTracks aynı dosyayı korur.; Gerçek cache:clear handlerını yetkili event ve kind:assets ile çağır.; Aynı gerçek restorePersistedBrowserTracks 0 döner; SQLite tracks/cues satırları yerinde.

**expected:** UI yalnız referanssız dosyaların temizleneceğini bildirir; tıklama doğrudan IPCye gider, kapalı medyanın kayıtlı altyazılarını silme için ek onay/uyarı yoktur. SQLite tarafından hâlâ kullanılan ve restorasyonun tek dosya girdisi olan asset korunmalı veya yönetilen yeniden kurma sağlanmalı.

**observed:** clear ok:true, removed:4 (SQLite tek canlı çift + gerçek yetim çift); indexRowsAfter:1 ve sqliteCueCount:1; restoreBefore:1, restoreAfter:0. Workspace referansı korunur, gerçek yetim silinir, yetkisiz istek ret.

**cause:** Açılış GC koruma kümesine index.listTrackAssetPaths eklerken bakım handlerı yalnız tab/session/workspace trackRefs topluyor. maxAgeMs:0 ile SQLite canlı dosyası da anında siliniyor. restorePersistedBrowserTracks sadece getTrack(row.asset_path) okur, SQLite cues üzerinden onarmaz.

**impact:** Kapatılmış videoya ait yakalanmış altyazı/çeviri uygulamada tekrar açılamaz. SQLite cue metni kalır; bütün metnin geri dönülmez silindiği iddia edilmez. Yeniden yakalama veya dış onarım gerekebilir.

**prior:** R83-B27/R86-02 ters yöndeki workspace/session referanslarını açılış GCye ekledi; bu kök farklı bakım IPC tüketicisinde SQLite referansının eksikliği. R390 önbellek ekranı ve yalnız referanssız temizleme iddiası tarihsel; bu bileşim doğrulanmamış. R815-B83/B90 sunum metadata/içerik bütünlüğü, B55 video paket eşlemesi, B94 indirme hedefi silme ayrı kökler.

**limits:** Node24 Windows; gerçek SQLite/asset disk ve değişmemiş üretici/IPC/restore fonksiyonları. Electron sender yetkilendirmesi, app.getPath, oturum/workspace sınırı sentetik facade; native UI/start.bat/kişisel medya/gerçek site yok.

**acceptance:** SQLite canlı asset yalnız bu tab kapalı diye silinmesin; başlangıç/manuel GC aynı sahiplik invariantını kullansın veya restore varlığı SQLite kanıtından güvenle kurabilsin. Workspace/session/açık sekme koruması, yetkisiz ret ve gerçek yetim temizliği sürsün.

## STORAGE02 — P1 — Windows’ta arşiv başlığının yalnız harf büyüklüğü değişince yeni JSON ve gösterim dosyaları başarı yanıtından önce siliniyor

**sources:** src/browser-translation-archive.js:238; src/browser-translation-archive.js:247; src/browser-translation-archive.js:253; src/browser-translation-archive.js:257; src/browser-translation-archive.js:285; src/browser-translation-archive.js:352; src/main.js:7031; src/main.js:7054

**reproduce:** Case-insensitive gerçek Windows diskte aynı URL, dil, kaynak ve çeviriyle title:Fixture Article kaydet. Gerçek main restore 1 blok uygular.; Aynı veriyi title:fixture article ile yeniden gerçek main persistBrowserPageTranslationArchive üzerinden kaydet.; İkinci savePage ok:true döner fakat indexte gösterilen JSON+MD yok; gerçek main restore ok:false, missing:true.; Aynı mediaId/sourceHash/trackId ve cue ile saveSubtitle başlığını Fixture Video→fixture video değiştir; ikinci yanıt ok:true fakat JSON+SRT yok.

**expected:** Başlığın harf biçimi değişimi aynı fiziksel dosyayı yeni retained dosya olarak korumalı; save ok:true sonrasında indexin işaret ettiği çift okunabilmeli.

**observed:** Sayfa ve altyazı çiftleri ikinci başarılı kayıtta silindi; indeks 1 girdi ve son başlıkla kaldı. page findPage null ve gerçek main consumer missing:true. Aynı başlık tekrarında ve başka fiziksel ada dönüşümde bütün dosyalar ve restore sağlam.

**cause:** Dosya steminde title vardır. Yeni aynı içerik/id steminin yalnız case farkı Windows’ta aynı dosyaları adresler. _saveIndex retained Set path.resolve dizelerini case-sensitive karşılaştırır; eski yol retained görülmez, unlinkSync eski yazım yolundan yeni dosyayı da siler.

**impact:** Başlık recase sonrası kalıcı sayfa çevirisi ve altyazı çeviri arşivi kaydı dosyaları kaybolur; index başarıyla yazıldığından hata bildirilmez ve sonraki sayfa geri yüklemesi yapılamaz. Altyazı asset store ayrıca sağlam kalmışsa ileride restore arşivi yeniden üretebilir; her medya kopyasının kalıcı kaybolduğu iddia edilmez.

**prior:** R26-B9/R73-Y6/R515-B02/R517 revizyon/eviction orphan temizliği bilinen düzeltmelerdir; yeniden bug sayılmaz. Yeni kök retained path karşılaştırmasının gerçek Windows case aliasını ayıramaması ve kendi yeni dosyasını silmesi. R465 hash-route ve R475 boş eşleşme, R497 bağımsız seçim ayrı invariantlar; R815 126 başlık ve metadata/içerik-hash kayıtlarıyla çakışmaz.

**limits:** Gerçek Windows dosya davranışı; ASCII başlık yalnız case değişimi. NTFS tüm ayarlar/8.3/symlink/junction/NFC alias garantisi veya gerçek web başlık sıklığı ölçülmedi. Main page scan/apply/instrumentation sınırı sentetik; gerçek persist/restore fonksiyonları ve archive/findPage/disk kullanıldı.

**acceptance:** Windows dosya kimliği aliası retained karşılaştırmasında korunsun veya title olmayan sabit adlandırma kullanılsın. Aynı başlık, case-only değişim ve farklı ad değişiminden sonra indeks çiftleri bulunmalı ve page restore çalışmalı; gerçekten superseded dosyalar temizlenmeye devam etmeli.

## Kapsam ve dışlananlar

Night1000 doğrudan modül eşleşmesi0; main kaynaklı F15/F44 40 tarihsel satırın ID/aile/mekanizma/imzaları coverage.json içinde korunur, yeniden keşif sayılmaz. Önceki126 R815 eşleme findings.json içinde okunmuş kayıt olarak tutulur.

- R26-B9/R73-Y6/R515-B02/R517: Known archive revision/orphan lifecycle; not recounted. New case alias distinguished in STORAGE02.
- R83-B27/R86-02/R87: Known startup GC workspace/session protection preserved by current helper; positive countercheck.
- R815-B55/B83/B84/B90/B94/B119/B120: Package mapping, subtitle metadata, content hash, download deletion, diagnostic privacy already counted; excluded.
- CAPTURE-RECOVERY: Read module and actual getBrowserCapturedResponseBody caller; existing browser-capture-recovery.test.js exit0 (fingerprint middle correction, timedtext retry classes, XHR seek epoch rejection, enable/reset). No new concrete failure confirmed; no live CDP/site claim.
- ARCHIVE-CRASH-ORPHANS: Failure between archive pair/index writes overlaps historical R26/R108 coverage; not counted anew.
- PERSIST-OLD-ASSET-DELETE: persistBrowserTrack unconditional previous asset removal may leave saved workspace refs stale; actual workspace consumer impact not independently established. Candidate withheld, not a finding.

## Tekrar

Repo kökünden `$env:R815_STORAGE_HEAD=git rev-parse HEAD; node .tmp/rem815-storage/probe.cjs`. İsteğe bağlı R815_STORAGE_OUT yalnız .tmp/rem815-storage altına yönlenebilir; varsayılan yeni run-zaman klasörü. Mevcut sonuç verified-final/results.json. Kaynak SHA256 JSON içinde. Gerçek fonksiyonlar kaynak slice→VM; dosyalar ve SQLite gerçek Windows fixture, IPC/app/scan/apply sınırı kontrollü. Tam paket/native UI/start.bat/sağlayıcı/site/GPU yok.

STORAGE-G01 ortak varlık sahiplik envanteri + bozuk index-dosya onarım önizlemesi ayrı öneri, bug sayılmaz. Ürün düzeltmesi yapılmadı.
