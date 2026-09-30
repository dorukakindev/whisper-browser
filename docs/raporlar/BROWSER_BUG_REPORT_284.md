# BROWSER BUG REPORT 284 — R324-5 kalan listener-çifti süpürme

**Tarih:** 2026-09-30 · **Dal:** `devin/<ts>-r324-5-listener-sweep` · **Tür:** statik süpürme + ratchet (temiz)

## Kapsam

R324-5 (R324 grubu kapanışı): kalıcı emitter'lar üzerindeki listener
kayıtlarının tekilliği. Sızıntı kalıbı = kalıcı nesneye (ipcMain, app,
session.webRequest, mainWindow) per-job kayıt yığmak; geçici emitter'lar
(proc, webContents, worker) sahibiyle GC olur.

## Envanter sonucu

- `ipcMain.on/handle`: 225 kayıt, **0 çift kanal** — her kanal tek işleyici.
- `app.on`: tüm olay adları tekil, init-bölgede.
- `mainWindow.on`: 4 kayıt (close/closed/focus/app-command) init-bölgede.
- `session.webRequest`: `onBeforeSendHeaders`/`onHeadersReceived` yalnız
  `installYoutubeStreamHeaders` içinde, tek init çağrısı (14063).
- `setDisplayMediaRequestHandler`, `protocol.handle('whisper-pdf')`: tekil.
- Transient emitter'lar: proc/webContents/worker dinleyicileri sahibiyle
  yaşar — ayrık `.off` gereksiz.

## Bulgular

**Gerçek bug yok.** Kalıcı-emitter yüzeyinin tamamı tek-seferlik init
kayıtlarından ibaret; çift-kayıt/yığma yok.

## Eklenen ratchet

`tests/listener-pair-sweep.test.js` (5 test): ipc kanal tekilliği, app.on
tekilliği, webRequest hook sınırı, `installYoutubeStreamHeaders` tek çağrı,
`mainWindow.on` init-envanter kilidi (yeni kayıt CI düşürür).

## Doğrulama

- `node tests/listener-pair-sweep.test.js` → 5/5 PASS.

## Windows etkisi

Yok — test-only.
