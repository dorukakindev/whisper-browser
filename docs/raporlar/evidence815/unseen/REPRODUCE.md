# R815 — yeni alanların güvenli tekrarı

Repo kökünden çalıştır. Denetlenen ürün tabanı **db65f2e7f6e7b50649c440cb183cb88863ebf241**, Windows Node24.22.0, kurulu packager20.3.0 ve mevcut backend/venv Python. Yeni bağımlılık kurulmadı. Kaynak hashleri [findings.json](findings.json), kapsam [COVERAGE.md](COVERAGE.md), ana süreç sonuçları [parent/](parent/packaging-results.json) ve [komut kaydı](parent-verification.json) içinde.

## Komutlar

```powershell
node docs/raporlar/evidence815/unseen/packaging/probe.cjs
$env:R815_ENGINE_OUT = Join-Path (Get-Location) '.tmp/recheck815-engines'
node docs/raporlar/evidence815/unseen/engines/torrent-probe.cjs
node docs/raporlar/evidence815/unseen/engines/snapshot-probe.cjs
$env:R815_SUBSCRIPTIONS_OUT = Join-Path (Get-Location) '.tmp/recheck815-subscriptions'
$env:AUDIT_HEAD = git rev-parse HEAD
node docs/raporlar/evidence815/unseen/subscriptions/probe.cjs
$env:R815_LIBRARY_OUT = Join-Path (Get-Location) '.tmp/recheck815-library'
node docs/raporlar/evidence815/unseen/library/probe.cjs
```

Packager probu varsayılan .tmp/unseen815-packaging altında results.json üretir (R815_PACKAGING_OUT ile ayrılabilir); kendi benzersiz fixture ağacını doğrulanmış yol sınırında temizler. Diğerleri yalnız belirtilen .tmp çıktılarını üretir; yayımlanmış sonuçları değiştirmez. Tekrar sonrası env değişkenleri oturumdan kaldırılabilir. `fixtures.py` yalnız sentetik EPUB oluşturur ve library/probe.cjs onu kendisi çağırır. Python alt süreç sandbox içinde engellenirse aynı izole komut yetkili ortamda çalıştırılmalıdır; bu ürün başarısızlığı değildir.

Her prob exit0 yanında hatalı davranış assertion'ları taşır. Beklenen bug düzeltildiğinde tarihsel prob FAIL olabilir; bunu otomatik yeni ürün hatası sayma. Kaynak değişmişse yeni revizyon ve sonuç dosyasını ayrı tut. Ürün kodu bu tur düzeltilmedi.

## Yöntem ve sınırlar

- Paketleme: gerçek kurulu @electron/packager varsayılanları+copy-filter+fs.cp, üretim manifest/checker/preflight; dış araç sürüm/varlık kontrolleri kontrollü. Kaynakta gerçek .gitignore, public installer girdileri ve sahte kişisel marker'lar var. Tam EXE/dağıtım veya kurulum/download yapılmaz.
- Torrent: gerçek service/API handler ve sentetik JSON; net/fetch/spawn/engine hash facade kontrollü. Engine dosyası çalıştırılamayan stub; gerçek peer/swarm veya childprocess yok.
- Native kare: orijinal capturePlayerFrame gövdesi, kontrollü Image.decode/canvas/API; gerçek PNG pikseli/mpv/Electron kabulü yok.
- Abonelik: orijinal callback/bloklar ve main RSS handler, gerçek JSDOM/parse; HTTP503 yalnız 127.0.0.1 ephemeral sunucudan, finally kapanır.
- Kütüphane: gerçek Python feed/EPUB parser, gerçek IPC/disk/JSDOM; ağ yanıtları ve playback çözümünün AbortSignal sınırı kontrollü. GPU/model/kişisel medya/hesap kullanılmaz.

Mevcut `node tests/windows-package-ignore.test.js` ve `node tests/package-integrity.test.js` geçti (23+19 yol;9/9). Bu kontrollerin PASS olması gerçek paket kurulum zincirinin bu hatayı kapsadığı anlamına gelmez. Tam npm/CI/start.bat/install.bat/DRM/GPU/fiziksel ses veya kişisel E2E çalıştırılmadı. GPUInfo native denemesi ortam engeline takıldı ve bug sayılmadı.
