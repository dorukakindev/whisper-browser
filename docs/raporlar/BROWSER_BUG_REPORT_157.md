# BROWSER_BUG_REPORT_157 — R176: IPC ratchet denetimi (16 "unguarded" kapatıldı)

**Tarih:** 2026-09-27 · **Dal:** `codex/r176-ipc-guard-audit` · **Tür:** denetim kapanışı + ratchet sertleştirme

## Soru

`tests/ipc-parity.test.js` §5'in izin verdiği "16 unguarded handler"
gerçekten güvenli mi? Bu dalda 16'sı da tek tek denetlendi.

## Sonuç: güvenli — `= {}` varsayılanı koruyor

16 handler'ın tamamı `async (event, request = {})` biçiminde:

| Parametre | Davranış |
|---|---|
| `undefined`/eksik | `{}`'a düşer → özellik okumaları `undefined` döner, guard'lar yönetir |
| `null` | İlk özellik erişiminde TypeError → `ipcMain.handle` reddi (throw→reject güvenli) |
| ilkel (`5`, `"x"`) | JS boxing — `5..prop` `undefined` döner → benign |
| zararlı obje | İçerik doğrulaması guard'larda (ör. `preparePdfPageRequests`, whitelist'ler) |

Yan-etki sorusu da temiz: §6 `GUARDLESS_SIDE_EFFECT` taraması guard'dan
önce spawn/yazım/send olmadığını zaten kilitliyor — `null`'un atıldığı
nokta herhangi bir yan etkiden önce gelir.

Denetlenen 16: `browser:reader`, `browser:adblock:setEnabled`,
`browser:playerAdPrune:setEnabled`, `browser:sponsorBlock:get`,
`browser:elementRules`, `pdf:open/state/translatePages/cancel/export`,
`browser:research:list/review/export/exportAnki`, `models:delete`,
`media:seekPreview`.

## Ratchet sertleştirmesi

Eski kural `unguarded <= 16` — sayıyı dondurur ama "neden güvenli"yi
kaydetmez. Yeni kural: bir handler **unguarded sayılmak için hem guard
hem `= {}` varsayılanından yoksun** olmalı; `unguarded === 0` sabitlendi.
Yeni handler'lar parametreyi ya guard'layacak ya varsayılan taşıyacak.

## Bonus tarama: `ipcMain.on` kanalları

11 `.on` kanalının tamamı elle denetlendi — hepsi gönderici doğrular
(`authorizedBrowserSender`, `event.sender !== window.webContents`,
`senderFrame !== sender.mainFrame`, `browserTabForWebContents`,
`browserDiscoveryFrameAllowed`, veya handshake `pending` kaydı).
Sessiz regresyonu önlemek için yeni §7: her `ipcMain.on` kaydının ilk
500 karakteri `sender|authorized|pending` sinyali içermeli.

## Modül kayıtlı handler'lar

`ipcMain.handle` çağrısı main.js dışında 3 modülde: `browser-extras`
(`authorized`), `browser:mini:command` (pencere webContents'i + frame
karşılaştırması), `media-catalog:request` (`authorized`). Tümü yetkili.

## Testler

`node tests/ipc-parity.test.js` — 215 handle · 11 on · 22 send, 0
unguarded; `adversarial-ipc` 17/17. Ürün kodu değişmedi.
