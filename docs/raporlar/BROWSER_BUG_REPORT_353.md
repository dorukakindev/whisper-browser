# Rapor 353 — Kuyruk-50 madde 41: IPC yetki sınırları

**Kapsam:** Dosya yazma, ağ isteği ve süreç başlatma yetkilerinin çağıran pencere/sekme bağlamına bağlılığı; yetkisiz çağrıların reddinin gerçek Electron fixture'ıyla doğrulanması.

## Denetim sonucu — boşluk bulunamadı (kanıtla kapatıldı)

- **Statik envanter:** `ipcMain.handle` altında **219 kanalın tamamı** `authorizedBrowserSender` ile kapılı — gönderen `mainWindow.webContents` + `mainFrame` olmalı; fonksiyon girişinin ilk ~400 karakteri içinde kontrol çağrısı var. Ayrıcalıklı alt kümeyi (spawn/dosya/ağ/sistem) tek tek inceledim: `transcribe:start`, `burnin:start`, `media:writeSubtitle`, `media:download`, `media:saveImage`, `invidious:downloadStream`, `settings:import`, `subscriptions:import`, `paths:scanMedia`, `maintenance:updateYtdlp`, `shell:openExternal`, `shell:openPath`, `dialog:openFile`, `browser:session:import`, `library:upsert`, `integrity:scan` — hepsinde guard yan etkiden önce.
- **`ipcMain.on` kanalları:** `browser:trusted-bridge` (yalnız kayıtlı sekme webContents + mesaj-türü allowlist), `browser:discovery-signal` (frame-subtree + aktif sekme + plan gözlemcisi), `library:flush-before-close-complete` (bekleyen handshake token + pending.sender eşleşmesi) — hepsi bağlam-bağlı.
- Sekme/sayfa webContents'i preload üzerinden ham `ipcRenderer.invoke` erişimi olmadığı için ayrıcalıklı kanala ulaşamıyor; `browser-preload` yalnız allowlist'li güvenli metotlar dışa açıyor.

## Yeni kanıt: `tests/electron-ipc-authority.smoke.js`

Gerçek Electron'da tam uygulama boot edilip main.js'in gerçek handler'ları kayıtlıyken:

1. `contextBridge` + sandbox'lı **düşman ikinci pencere** (`mainWindow.webContents` ≠ sender) açılır.
2. 16 ayrıcalıklı kanal tek tek `invoke` edilir → **hepsi `{ ok: false, error: 'Yetkisiz istek.' }`** döndü.
3. Yan etki yok: `hostile.srt`/`hostile.png`/`hostile-settings.json` yazılmadı; diyalog açılmadı.
4. `ipcMain.send('library:flush-before-close-complete', 'forged-token')` düşman pencereden → sessizce düşürüldü.
5. Pozitif kontrol: meşru renderer'dan `getEnvInfo` hâlâ geçiyor; düşman pencere kapanışı ana IPC yüzeyini bozmuyor.

Koşu: `xvfb-run electron tests/electron-ipc-authority.smoke.js --disable-gpu` → `ipc-authority-smoke: 16 yetkisiz kanal reddedildi, yan etki yok.` (`run-electron-smokes.js --all` envanterine `electron-*` deseniyle otomatik girer.)

## Windows etkisi

Yalnız test dosyası — ürün kodu değişmedi.
