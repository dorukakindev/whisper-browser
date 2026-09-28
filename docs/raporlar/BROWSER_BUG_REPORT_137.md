# BROWSER_BUG_REPORT_137 — IPC fuzz / parity denetimi (R138 + R151)

Tarih: 2026-09-27 · Dal: `codex/r137-parser-fuzz-1790500498` (R137 üstüne birikimli)

## Kapsam

`ipcMain.handle` ×213, `ipcMain.on` ×11, main→renderer `send` ×22,
preload `invoke` ×212, `send` ×3, `on` ×9 — üç preload köprüsü
(`preload.js`, `browser-preload.js`, `browser-mini-preload.js`) ve handler'ları
dağıtık servis modülleri (`browser-feature-services.js`, `media-catalog-service.js`,
`browser-mini-player.js`) dahil.

## Bulgular

**Gerçek bug yok — ama 3 sözleşme sınıfı kalıcı teste bağlandı.**

1. **Parity tam:** renderer'ın çağırdığı her kanalın handler'ı var. İlk bakışta
   "eksik" görünen `media-catalog:request` ve `browser:extras` aslında
   servis modüllerinde kayıtlı — statik tarama artık tüm `src/*.js`'i kapsıyor.
2. **Çifte kayıt yok:** aynı kanala iki `handle` kaydı Electron'da throw eder;
   şu an sıfır ve test bunu yasaklıyor.
3. **Guard analizi:** 16 handler parametreyi guard'dan önce dereference ediyor.
   `ipcMain.handle` içindeki throw render'a reject olarak döner (crash değil),
   ayrıca guard'dan ÖNCE yan etki (spawn/dosya yazımı/send) yapan handler
   **yok** — yani kısmen uygulanmış iş riski sıfır. Ratchet ≤16 ile yeni
   handler'larda doğrulama zorunlu hale geliyor.

## Yön notu

`browser:trusted-bridge`, `browser:open-link`, `browser:discovery-signal`,
`browser:page-mutated`, `browser:resource-snapshot-response` gibi kanallar
`browser-preload.js` → `ipcRenderer.send` → `ipcMain.on` yönünde — test
`send`'i dosya tipine göre ayırmazsa yanlış-pozitif üretir; düzeltildi.

## Katkı

`tests/ipc-parity.test.js` — altı assertion: invoke↔handle, send↔on,
send↔dinleyici, çifte kayıt, guard ratchet, guard-öncesi-yan-etki.

## Sınır

Gerçek Electron IPC sürecinde çalışan payload bombardımanı bu kutuda
koşmuyor (iç içe Electron spawn zygote FATAL — R113'ten beri belgeli ortam
sınırı). Statik sözleşme testi CI'da her koşuda çalışır.
