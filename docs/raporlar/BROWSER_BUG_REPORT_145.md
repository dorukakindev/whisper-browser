# BROWSER_BUG_REPORT_145 — Electron güvenlik sertleştirme (R154)

Tarih: 2026-09-27 · Dal: codex/r154-electron-sec

## Kapsam (doğrulanan savunmalar)

- **Her kurulum noktası** (ana pencere, tarayıcı WebContentsView, YouTube TV,
  görsel dönüştürme işçisi, mini oynatıcı, popup yardımcısı): sandbox,
  contextIsolation, nodeIntegration:false, webviewTag:false.
- **Navigasyon:** `decideUrlPolicy` + `attachNavigationGuard` (will-navigate,
  will-redirect, will-frame-navigate); ana pencere tüm gezinmeyi kapatır.
- **Pencereler:** setWindowOpenHandler → harici protokoller tek kapıdan
  (`openExternalByPolicy`); popup'lar securePopupWebPreferences + zincirleme
  did-create-window yapılandırması.
- **İzinler:** browserSession permission check/request handler'ları sekme +
  origin bağlı; display-media yalnız ana pencere + kullanıcı hareketi + ses.
- **Sertifika:** global certificate-error kesin reddeder, kullanıcıya
  açıklanabilir hata yüzeyi gösterir.
- **Protokoller:** whisper-pdf (origin/referrer + sha256 kimlik + Range) ve
  whisper-assets (sabit varlık listesi) dar kapılı.
- **IPC:** tüm handle/on uçları authorizedBrowserSender/senderFrame kapılı;
  trusted-bridge hem preload hem handler'da tür beyaz listeli + bridgeToken.
- **Kabuk:** openPath/openExternal/showInFolder onay diyaloğu + uzantı
  beyaz listesi + erişim seti; shell.openExternal tek noktada.
- **Renderer CSP** katı (`default-src 'self'`, script-src 'self').

## Bulgular (düzeltildi)

1. **Uygulama geneli `will-attach-webview` reddi yoktu** — her yüzey
   `webviewTag:false` taşısa da gelecekteki bir pencere ya da üçüncü-taraf
   `BrowserWindow` kilit unutursa `<webview>` bağlanabilirdi. Artık
   `web-contents-created` ile her webContents'e ek preventDefault kurulur.
2. **Mini oynatıcı penceresi** kilitlerini varsayılanlara bırakıyordu
   (`webSecurity`, `webviewTag`, `allowRunningInsecureContent`,
   `navigateOnDragDrop`, `spellcheck` artık açık).

## Ratchet
`tests/electron-security.test.js` — tüm `new BrowserWindow/WebContentsView`
noktaları statik taranır: zorunlu kilitler (contextIsolation/nodeIntegration/
sandbox), yasak değerler (webSecurity:false vb.), yardımcı fonksiyon
kilitleri, global webview reddi, certificate-error callback(false),
shell.openExternal tek-nokta kuralı. 1294 kontrol.

## Windows etkisi
Yok — yalnız Electron güvenlik bayrakları; platformdan bağımsız.
