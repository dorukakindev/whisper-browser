# BROWSER_BUG_REPORT_368 — 100-kuyruk batch 5: güvenlik/IPC tur-2

## Kapsam

10 maddelik güvenlik/IPC denetim turu: browser-preload köprüsü, web içeriğinden
gelen IPC sinyalleri, dış-açma politikası, popup/pencere açma, IPC kanal kimlik
doğrulaması. Amaç: önceki turda denetlenip temiz çıkan yüzeylerin kilitsiz kalan
invariant'larını otomatik ratchet'e bağlamak.

| # | Yüzey | Sonuç |
|---|-------|-------|
| 41 | `__whisperTrustedBridgeSend` descriptor (non-configurable/non-enumerable/non-writable) + 6-tiplik beyaz liste | Temiz — davranışsal kilit eklendi (gerçek preload vm bağlamında descriptor + kabul/red tablosu) |
| 42 | Keşif sinyalleri (`browser:discovery-signal`) yalnız tip + kelepçeli sayısal sayaç (içerik/URL/HTML yok) | Temiz — alan-kümesi + kelepçe + tüm çağrı sitesi denetimi kilidi |
| 43 | `browser:open-link` yalnız isTrusted yeni-sekme jesti (orta tık / Ctrl/Meta+tık), http(s), download değil | Temiz — jest/protokol/download/preventDefault kilidi |
| 44 | `browser:page-mutated` find-state opt-in, ~350ms debounce, yük taşımaz | Temiz — kilit |
| 45 | `browser:trusted-bridge` ana kabulü: ana-frame + göndericinin gerçek sekme görünümü olması + aktif-olmayan sekme yalnız page-blocks/page-action + subtitle-control eylem beyaz listesi | Temiz — kilit |
| 46 | `openExternalFromWebContent` webContents-anahtarlı WeakMap ile 3 sn hız sınırı + her zaman politika kararı | Temiz — kilit |
| 47 | `browserWindowOpenHandler`: external→red+oranlı açılış, allow→`browserPopupWindows.canAdd()` tavanı (MAX_BROWSER_POPUPS=10), outlivesOpener:false, overrideBrowserWindowOptions | Temiz — kilit |
| 48 | Kapanış el sıkışması (`library:flush-before-close-complete` → `pending.sender`) + `upsert-before-close` (mainWindow.webContents+mainFrame) + `queue/settings:saveSync` (authorizedBrowserSender) | Temiz — kilit |
| 49 | 12 `ipcMain.on` kanalının tek tek gönderici-doğrulaması + ~233 `ipcMain.handle` R147-T8 envanter ratchet'i | Temiz — envanter ratchet'i zaten var; tek tek doğrulama bu raporda belgelendi |
| 50 | `browserPageResourceTelemetry` ölçemediğini `null` ile bildirir (yanıltıcı 0 yok) + `pagehide`da gözlemci/zamanlayıcı temizliği | Temiz — kilit |

## Doğrulanan güvenlik özellikleri (kaynak kanıtı)

- `browser-preload.js` köprüsü `Object.defineProperty` ile mühürlü; yalnız
  whitelist'teki 6 `type` geçer, reddedilen tip IPC'ye bile ulaşmaz.
- Discovery sinyalleri `{type, mediaCount≤1000, trackCount≤1000, cueCount≤20000}`
  — DOM içeriği, metin veya URL hiçbir yolda yük olmaz.
- Tüm `ipcMain.on` kanalları gönderici kimliği doğrular (authorizedBrowserSender /
  senderFrame+candidate.view / pending.sender). Ayrıntılı tablo devir notunda.
- `openExternal` web tetikli açılışlar webContents başına 3 sn ile kısıtlı;
  karar `decideUrlPolicy`'den geçer; `mailto:` döngüsü zehirlemesi kapalı.
- Popup açılımları registry tavanı (10), `outlivesOpener:false` ve kontrollü
  `overrideBrowserWindowOptions` ile sınırlı.

## Teslim

- Yeni ratchet: `tests/browser-preload-ratchet.test.js` — 9 kontrol, tümü geçti.
  `npm test` runner'ına otomatik dahil (`tests/*.test.js` deseni).
- Doğrulanmış ürün kusuru yok: bu batch'in çıktısı kilitler + denetim kanıtı.
- Tam süit: master `a56a861` üzerinde yeşil (`Tüm testler geçti`).

## Windows etkisi

Değişiklik yalnız test dosyası; Windows'ta davranış farkı yok, koşulmayan
doğrulama yok.
