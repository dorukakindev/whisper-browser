# BROWSER_BUG_REPORT_214 — R262: settings.json geriye-uyumluluk matrisi + iş-ortasında-kapanış E2E

- Tarih: 2026-09-29 (UTC)
- Dal: `fix/r262-close-midjob-e2e` (temel: master `44314cf`)
- Kapsam: 20'lik plan madde 11 (settings geriye-uyumluluk matrisi) + madde 12 (ana pencereyi iş ortasında kapatma davranışı).
- Sonuç: **ürün bug'ı bulunamadı** — iki davranış da tasarlandığı gibi; kapsam iki kilitli regresyon testiyle kapatıldı.

## 1) settings.json geriye-uyumluluk matrisi (22 kontrol)

`tests/settings-backcompat.test.js` — `settings-load-corruption.test.js`'teki
vm-harness kalıbıyla `loadSettings` + `migrateSubtitleModelDefault` dilimi
(`var settingsFileCorrupt`→`let settingsLoadWarning`) izole koşturulur.

- v2 `ui.*`-alanlı dosya: preset/model/to korunur; `ui.translateModel=3.7`
  shuaiapi özelinde 3.8'e taşınır.
- Çift-migrasyon bekçisi: `subtitleModelDefault38Applied` işaretine saygı;
  kullanıcının elle 3.7 seçimi ezilmez.
- custom + shuai `customBaseUrl` ve `ui.translateBaseUrl` geri-dönüş okuması.
- Shuai OLMAYAN sağlayıcıda 3.7 olduğu gibi kalır, işaret yine yazılır.
- Minimal dosya: `translate` uydurulmaz, işaret yazılır.
- Yanlış tipli eski alanlar düşer + bozuk bayrağı; `settingsVersion`sız dosya korunur.

**Bulunan test-harness kusuru (ürün dışı):** `vm.createContext` sandbox'ına `URL`
geçirilmezse `migrateSubtitleModelDefault` içindeki `new URL` patlar → `shuai=false`
olur, migrasyon sessizce hiç çalışmaz. Sandbox'a `URL` eklendi.

Komut: `node tests/settings-backcompat.test.js` → `PASS: settings-backcompat matrisi (22 kontrol)`

## 2) İş ortasında ana pencere kapanışı (iki fazlı gerçek Electron E2E)

`tests/electron-burnin-close-midjob.smoke.js` (sürücü) +
`tests/electron-burnin-close-midjob.child.js` (iç süreç — glob dışı ad).

Kapanış/çökme gerçek uygulama çıkışıdır; tek süreçte taklit edilemeyeceği için
çocuk Electron temiz-env + kendi `xvfb-run` X sunucusuyla spawn edilir
(ebeveynin `CHROME_*`/`ELECTRON_*` env'leri iç-içe zygote/GPU'yu kırar).

Gözlenen ve kilitlenen iki semantik:

- **A) Düzenli kapanış (`win.close`)** = temiz iptal:
  `window-all-closed` → `terminateProcessTree(burninJob)` → ffmpeg `close`
  olayı `finish()`'i çıkıştan önce yakalar → `.tmp` + `burnin-recovery.json`
  silinir. Doğrulandı: çıktı yok, tmp artığı yok, kurtarma dosyası yok;
  yeniden açılış `getBurnInRecovery().available === false`.
- **B) Sert çökme (SIGKILL süreç grubuna)** = kurtarma kalır:
  `burnin-recovery.json` diskte durur; yeniden açılışta renderer gerçek
  kullanıcı akışıyla `openAppDialog` "Yarım kalan gömmeyi sürdür / Baştan
  başlat" modalını açar. Test modalı DOM'dan onaylar → `recoverBurnIn(id)` →
  `result.restart` → `burnInStart(video, sub, recoveryId)` → `done` →
  60 sn'lik çıktı yazılır, kurtarma kaydı temizlenir.

Yol boyunca bulunan test-harness kusurları (hepsi çözüldü):
- Electron-içinden-Electron spawn `zygote_host_impl_linux.cc:221` FATAL ve
  `GPU process isn't usable` FATAL üretir → çocuk `xvfb-run` + env süzgeciyle.
- `xvfb-run`'ı SIGKILL'lemek yalnız sarmalı öldürür → `detached` süreç grubu
  + `kill(-pid)`.
- `initialSettingsReady` `await offerBurnInRecovery()` içerir → kurtarma
  modalı yanıt bekleyince promise çözülmez (bilinen başsız-takılma deseni);
  recover fazı settings beklemesini atlayıp modalı gerçek kullanıcı gibi
  tıklar (daha doğru E2E).

Komut: `xvfb-run -a npx electron tests/electron-burnin-close-midjob.smoke.js --disable-gpu`
→ `PASS: kapanış-iş-ortasında E2E — temiz iptal + çökme kurtarması`
(çıktı süresi 60.0s, ffprobe doğrulandı).

## Windows etkisi

- Çocuk spawn yolu `process.platform === 'win32'` kolunda xvfb-run'suz doğrudan
  `process.execPath` çağırır; SIGKILL `child.kill()`'e düşer. `--all` glob'u
  smoke'u Windows CI'a taşır (`.child.js` glob'a girmez).
- Ürün davranışı (finish() temizliği, kurtarma akışı) platformdan bağımsız.

## Doğrulanmayan

- Gerçek Windows GUI'de modal görünümü (kod yolu aynı; headless'te DOM'dan tıklanır).
- SIGKILL yerine elektrik kesintisi/BSOD — aynı "kaynak ölür, dosya kalır" semantiği.
