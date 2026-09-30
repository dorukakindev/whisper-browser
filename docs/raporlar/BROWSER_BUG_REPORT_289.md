# BROWSER BUG REPORT 289 — R328-1: Electron smokes `--all` yerel doğrulaması

Tarih: 2026-09-30 · Dal: devin/1790769553-r328-1-verify-apprpath

## Kapsam

`xvfb-run -a node tests/run-electron-smokes.js --all` tam deterministic seti.

## Bulgular

### B-328-01 — verifyAppResources launch-time appPath'e bağlıydı (gerçek bug)

`src/main.js` açılış kontrolü `app.getAppPath()` kökünü kullanıyordu.
Süreç-içi smoke/harness çalıştırmalarında (`electron tests/x.smoke.js`)
Electron appPath'i betik dizinine/harness köküne çözer; `src/main.js`,
`src/preload.js` vb. manifest dosyaları "eksik" sayılıp uygulama
"eksik kurulum / incomplete installation" diyaloğuyla çıkıyordu.
Etkilenen smoke'lar: `electron-browser-tab-leak`, `electron-overlay-timing`
(ve aynı kalıbı kullanan tüm gelecek harness'lar).

Aynı latent kusur `app.getAppPath()`'e dayanan **tüm kaynak-kökü
kullanımlarında** vardı: `backend/media.py`, `youtube.py`, `invidious.py`,
`export_anki.py`, `live_asr.py` betik yolları; model-önbellek taraması
(`scanModelCache`/`deleteCachedModel`); `backend/bin/ffmpeg`; ilgili
spawn `cwd` değerleri — hepsi harness bağlamında yanlış dizin gösterirdi.

**Düzeltme:** tek `appResourceRoot()` = `path.dirname(__dirname)`.
Paketli kurulumda `__dirname` = `app.asar/src` → üst dizin app.asar kökü =
eski `app.getAppPath()` değeriyle birebir aynı; harness'ta ise kodun
gerçekten yüklendiği kök — manifestin denetlediği dosyalar `__dirname`
göreli require'larla yüklendiği için doğru sabit nokta budur.
`app.getAppPath()` yalnız `appPath:` tanı alanında (dürüst launch bilgisi)
kaldı; `package-integrity.test.js`'e kaynak-kökü ratchet'i eklendi
(getAppPath'ın `appPath:` dışı kullanımı kırmızı).

Kanıt: düzeltme öncesi 2 smoke "eksik kurulum" diyaloğuyla düşüyordu;
sonrası `electron-browser-tab-leak` PASS, `electron-overlay-timing` PASS
(23 örnek 0 uyumsuz + genişleme matrisi temiz).

### B-328-02 — subtitle-shift smoke log-yarışı (test kusuru)

`tests/electron-subtitle-shift.smoke.js` mutlu-yol adımı dosya içeriğini
`until` ile bekleyip başarı log satırını hemen assert ediyordu. Log satırı
`await window.api.shiftSubs` dönüşünden SONRA yazılır → dosya-until'i
log'un varışını garanti etmez; Xvfb altında ~1ms'lik pencerede düştü.
Reddedilme yolu zaten `until`-ile log bekliyordu; mutlu yol da aynı
kalıba alındı. Tek koşuda PASS.

### Env-limit (değişiklik yok)

`electron-browser-menu-visual.smoke.js`: desktopCapturer pencere
kaynağını göremiyor. Xvfb sanal ekranında compositor pencere yakalaması
yok; testin varoluş amacı gerçek piksel yakalaması olduğundan graceful
indirgeme yapılmadı — Windows CI/gerçek masaüstünde koşulur.
Ubuntu tarafı env limiti olarak raporlanır.

## Sonuç

`--all` koşusu: öncesi 3 düşüş → sonrası yalnız env-limitli menu-visual
kalıyor (+0 kod kaynaklı). E2E'de main.js açılış kapısı doğrulandı.

## Doğrulanmayan

- Paketli Windows kurulumunda appResourceRoot: mantıksal denklik
  (`app.asar/src` → `app.asar`) argümanına dayanıyor; gerçek paket
  üzerinde doğrulanmadı — Windows CI + paketleme testi karşılar.
- menu-visual gerçek masaüstü koşusu.
