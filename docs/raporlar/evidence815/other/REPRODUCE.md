# R815 — diğer alanların tekrar üretimi

Repo kökünden çalıştır. Denetlenen ürün tabanı 6a789329d96c4f97cdc17bd9518df0b540b13444. Windows Node24.22.0, mevcut bağımlılıklar; yeni kurulum yok. Problar yalnız izole .tmp çıktıları üretir; yayımlanmış sonuçların üstüne yazmaz.

```powershell
$env:R815_ROOT_OUT = '.tmp/recheck815-root'
node docs/raporlar/evidence815/other/root/probe.cjs
$env:R815_AUDIT_HEAD = git rev-parse HEAD
$env:R815_DOWNLOADS_OUT = '.tmp/recheck815-downloads'
node docs/raporlar/evidence815/other/downloads/probe.cjs
$env:R815_LIVEASR_OUT = '.tmp/recheck815-liveasr'
node docs/raporlar/evidence815/other/liveasr/probe.cjs
$env:R815_WORKFLOWS_OUT = '.tmp/recheck815-workflows'
node docs/raporlar/evidence815/other/workflows/probe.cjs
```

Root ve downloads mkdtemp ile run-* altı üretir; diğerleri seçilen çıktı klasörüne results.json/result.json yazar. Probları çalıştırmadan oku. Düzeltme sonrası tarihsel bug assertion’ının FAIL olması yeni hata sayılmaz; yeni revizyonu ve sonucu ayrı tut. Env değişkenleri yalnız komut oturumuna aittir.

Root gerçek üretici/preview/export+atomic disk ve gerçek SPA callback/IPC; native dialog, hata metni ve places store sınırı kontrollü. Sırlar ve cue’lar yalnız FAKE marker’dır. Downloads gerçek manager/IPC/renderer click, facade DownloadItem/DOM; dosyalar decode edilecek medya değildir. ASR main/store/merge ve renderer capture gerçek, process/segment/AudioContext/MediaStreamTrack kontrollü; mikrofon, GPU ve model yok. Workflow gerçek normalizeCues/main publisher/renderer gate; asset/index/writer/translation facade kontrollü. MCP gerçek localhost bridge/HTTP, yalnız fixture token ve read-only getJobs/getTabs; auth/Origin retleri de kontrol edilir. Server finally kapatılır. Dış istemci/stdio gerçek çalıştırılmadı.

Beklenen hatalar ve karşı kontroller [parent-verification.json](parent-verification.json), [parent sonuçları](parent/root-results.json), [kaynak hashleri](findings.json) ve [kapsam matrisi](COVERAGE.md) içinde. Root3 ayrıca başka ajan tarafından varsayım/tekrar bakımından incelendi.

Mevcut node tests/browser-diagnostics-export.test.js ve node tests/browser-site-profiles.test.js (15/15) geçti. Tam npm/bridge/CI, start.bat/temiz install.bat, gerçek Electron/DRM/GPU/mikrofon/sistem sesi/codec/fiziksel dinleme/ekran okuyucu ve kişisel hesaplar denenmedi. Bu, bu alanların her koşulda hatalı veya sağlıklı olduğu kararı değildir.
