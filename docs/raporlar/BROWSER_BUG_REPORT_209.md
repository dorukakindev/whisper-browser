# BROWSER_BUG_REPORT_209 — Sekme şeridi churn soak (R257)

**Tarih:** 2026-09-29 · **Dal:** `fix/r257-tab-churn` · **Kapsam:** plan maddesi 6 — 200 sekme aç/kapat döngüsü + toplu faz, bellek ve iç yapı sızıntısı arayışı

## Senaryo

`tests/electron-browser-tab-churn.smoke.js`: gerçek uygulama içinde (self-app kalıbı, `WHISPER_RESOURCE_SOAK_USER_DATA` izole profili) tarayıcı yüzeyine geçilir; `setWorkspaceMode('browser')` + `showBrowserWebSurface()` sonrası:

1. **Warm-up (10 döngü):** tek-seferlik önbellekler taban ölçümüne karışmasın.
2. **Churn (200 döngü):** `createBrowserTab()` → `closeBrowserTab(id)` seri; her 25'te `player.browserTabs` ↔ şerit DOM ↔ `browserClosingTabs` ↔ `BrowserTabEventGate.contexts` tutarlılık kontrolü.
3. **Toplu faz:** ardarda 8 sekme açılıp hepsi kapatılır.

Ölçülen sızıntı sinyalleri:

| Sinyal | Kaynak | Sınır |
|---|---|---|
| `webContents.getAllWebContents().length` | ana süreç | taban + ≤1 |
| Renderer heap (`--expose-gc`, `performance.memory`) | renderer | + <160 MB |
| `player.browserTabs.length` ↔ `[role="tab"]` DOM | renderer | birebir |
| `player.browserClosingTabs.size` | renderer | 0 |
| `browserTabEventGate.contexts.size` | renderer | ≤ canlı sekme |
| `unhandledrejection` sayısı | renderer | 0 |
| `render-process-gone` | ana süreç | 0 |

## Bulgular

**Ürün bug'ı yok.** Tüm sinyaller taban değerlerine döndü:

```
taban: wc=2 heap=9.5MB {tabs:1, dom:1, closing:0, gates:1}
200/200 sonrası: wc=2 heap 9.5→9.5MB unhandled=0 gone=0
```

Her kontrol noktasında `tabs=dom=1`, `closing=0`, `gates=1`. `browserClosedTabs` geçmişi zaten `BrowserClosedTabHistory(20)` ile kapalı; `BrowserTabEventGate.close()` kapanan bağlamı siliyor — 200 döngüde tek kayıt bile kalmadı.

## Harness bulgusu (test-tarafı)

İlk sürümde smoke ~10 dk hiç çıktı üretmeden asılı kaldı. Kök neden: `closeBrowserTab` → `browser:tab:close` `requiresConfirmation` döndürünce renderer `openAppDialog` modali açıyor ve headless ortamda kullanıcı yanıtı bekleyen promise hiç çözülmüyor (`executeJavaScript` sonsuza askıda). İki savunma eklendi:

- `openAppDialog = async () => true` — onay otomatik geçiliyor; sekme kapatmanın **tam** ürün yolu (korumalar dahil) koşulmaya devam ediyor.
- `stepTimeout()` — tek `executeJavaScript` 15 sn'yi aşarsa adım adıyla hata; sessiz askı imkânsız.

## Windows etkisi

Ürün kodu değişmedi. Smoke POSIX + Windows'ta çalışır (kendi süreci içinde, platformdan bağımsız API'ler). Windows'ta her sekme gerçek renderer süreci açtığı için 200 döngü CPU'ya göre ~2–4 dk sürer; `--expose-gc` heap ölçümü V8'de platformdan bağımsız.

## Sınırlar / doğrulanamayanlar

- Native `WebContentsView` boyası GPU'ya çıkmaz (Xvfb); piksel düzeyinde kalıntı bu harness kapsamı dışında.
- `--js-flags --expose-gc` komut-satırı anahtarı Electron'un `app.commandLine.appendSwitch` ile ana sürece verilir — V8 flag'i renderer'lara da geçer; `window.gc` yoksa heap kontrolü `performance.memory` sınırını yine uygular (gc çağrısı koşullu).
- `menu-visual` gibi piksel-doğrulamalı senaryolar başsız ortam sınırında kalır.

## Koşulan komutlar

```
node --check tests/electron-browser-tab-churn.smoke.js
xvfb-run -a npx electron tests/electron-browser-tab-churn.smoke.js --disable-gpu
# → PASS: sekme şeridi churn soak (200 aç/kapat + toplu 8)
```
