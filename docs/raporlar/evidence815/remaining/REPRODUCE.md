# R815 — kalan alanların tekrar üretimi

Repo kökünden, denetlenen df94b3d60b7123a682cd0062371bbb2850a5fb60 ürün tabanında. Mevcut Node24.22.0/Windows ve kurulu bağımlılıklar kullanılır; yeni kurulum yok. CEA mux.js6.3.0 paketindeki test/segments TS/fMP4 fixture’larını okur; hashleri sonuçlarda bulunur, medya kopyası yayımlanmaz. Storage case-alias kanıtı gerçek case-insensitive Windows dosya sistemi gerektirir.

```powershell
$env:R815_REMAIN_HEAD = git rev-parse HEAD
$env:R815_REMAIN_ROOT_OUT = '.tmp/recheck815-rem-root'
node docs/raporlar/evidence815/remaining/root/probe.cjs
$env:R815_MANGA_HEAD = git rev-parse HEAD
$env:R815_MANGA_OUT = '.tmp/recheck815-rem-manga'
node docs/raporlar/evidence815/remaining/manga/probe.cjs
$env:R815_CEA_OUT = '.tmp/recheck815-rem-cea'
node docs/raporlar/evidence815/remaining/cea/probe.cjs
$env:R815_STORAGE_HEAD = 'df94b3d60b7123a682cd0062371bbb2850a5fb60'
$env:R815_STORAGE_OUT = Join-Path (Get-Location) '.tmp/rem815-storage/recheck'
node docs/raporlar/evidence815/remaining/storage/probe.cjs
```

Storage probe HEAD ve çıktı sınırını özellikle doğrular; başka ürün revizyonunda eski başarıyı yeni başarı sayma, yeni denetim için revizyon kontrolünü bilinçli uyarlayıp ayrı sonuç kaydet. Storage output yalnız .tmp/rem815-storage altına izinlidir, recursive silme yapmaz. Diğer sonuçlar seçilen .tmp köküne yazılır; root mkdtemp run-* kullanır. Yayımlanmış sonuçların üstüne yazılmaz.

Hatalı davranış assertion’ları düzeltme sonrası FAIL olabilir; bu otomatik yeni ürün bugı değildir. Kişisel profiller/defterler/medyalar yerine sadece sentetik fixture kullanılır. Manga fetch sahte yanıt; CEA fetch paket fixture Buffer; native/provider/site/ağ çağrısı yoktur. Root ve storage gerçek dosya, storage gerçek SQLite, CEA gerçek decoder/checkpoint/SRT kullanır; diğer sınırlar alan raporlarında açıklanır. Ana CEA -2sn örneği referansları6sn içinde tutar; +10 örneği ayrı stres olarak okunmalıdır.

[134 eşleme/hashler](findings.json), [ana süreç komutları](parent-verification.json), [parent sonuçları](parent/root-results.json), [kapsam](COVERAGE.md). Mevcut browser-note-store11/11 ve capture-recovery kontrolleri geçti. Tam npm/CI/BAT/Electron/native OCR/model/GPU/ses/DRM/codec/gerçek site ve hesap kabulü yapılmadı. Hiçbir ürün düzeltmesi yok.
