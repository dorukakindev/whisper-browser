# BROWSER_BUG_REPORT_377 — Yeni-100 batch 4: browser yaşam döngüsü derinleştirme

**Tarih:** 2026-10-02 · **Dal:** `devin/1790905999-lifecycle-deep` · **Kod commit:** `41fa3b9`

## Kapsam

Gerçek Electron çökme yaşam döngüsünü `forcefullyCrashRenderer()` ile
uçtan uca prob'ladık: render-process-gone → `crashRecoveryPolicy` →
temizlik → tek-seferlik yeniden kurma → `restoredUrl` geri yükleme.
Yeni smoke `tests/electron-lifecycle-deep.smoke.js` 6 senaryoyu yerel
HTTP armatürü (`/page-a`, `/page-b`, `/slow` 3.5s gecikme) üzerinde
doğruluyor.

## Bulgular

| # | Madde | Sonuç |
|---|-------|-------|
| 31 | Çökme → renderer olayı | KANITLA KAPATILDI — `tab-crashed` renderer'a ulaşıyor, `errorKind='crash'` + 'Sekme çöktü' yüzeyi |
| 32 | recreate-once bütçesi | KANITLA KAPATILDI — sağlıklı did-stop-loading `crashRecoveryAttempt`'i sıfırlıyor (tasarım: sağlıklı yükleme yeni bütçe kazanır); döngü bekçisi yalnız yeniden kurulan görünüm yükleme TAMAMLANMADAN tekrar çökerse devreye giriyor |
| 33 | Yükleme-ortası ikinci çökme | **DÜZELTİLDİ** — B-377-02 (crash-kind ezilmesi) |
| 34 | Kapalı sekme dirilmesi | KANITLA KAPATILDI — kurtarma zamanlayıcısından önce kapatılan sekme dirilmedi; kayıt da silindi |
| 35 | Arka plan sekme çökmesi | KANITLA KAPATILDI — arka plan `tab-crashed` aktif sekmeyi etkilemiyor (URL + aktif kimlik korundu); arka plan kolu `tab.error`/`errorKind` set ediyor |
| 36 | WebContents sızıntısı | KANITLA KAPATILDI — tüm sekmeler kapatılınca wc sayısı tabana döndü (2→2) |
| 37 | Çökme yolunda stderr gürültüsü | **DÜZELTİLDİ** — B-377-01/03 (çökmüş wc'ye script/send çağrıları) |
| 38 | unhandledrejection | KANITLA KAPATILDI — tüm senaryolar sonrası sayaç 0 |
| 39 | Arka plan navigasyonu | KANITLA KAPATILDI — `browser:navigate` yalnız aktif sekmeyi yükler (`activeRequestedBrowserTab`); arka plan sekmesi yükleme yolu yalnız aktivasyon/kurtarma |
| 40 | Yaşam döngüsü smoke'u | UYGULANDI — `electron-lifecycle-deep.smoke.js` 6 senaryo, tümü GEÇTİ |

## Doğrulanmış kusur detayları

### B-377-01: çökmüş wc'ye `executeJavaScript*` çağrıları (stderr gürültüsü)
- **Belirti:** sekme çöktükten sonra stderr'de
  `Error sending from webFrameMain: ... Render frame was disposed` satırları.
- **Kök neden:** `browserScriptExecutionReady(wc)` `isDestroyed`/`isLoading`/
  URL kapılarını kontrol ediyor ama `isCrashed()` kapısı yoktu —
  render-process-gone sonrası destroy'edilmemiş wc tüm kapılardan geçip
  `executeJavaScriptInIsolatedWorld`/`frame.executeJavaScript` çağrısı
  alıyordu (çökme sonrası probe/cosmetic/page-action yolları).
- **Düzeltme:** `src/browser-script-execution.js` — merkezi kapıya
  `!wc.isCrashed()` koşulu eklendi; `browserFrames`,
  `executeBrowserViewFrames`, `executeBrowserTrustedMain`,
  cosmetic-executor ve discovery probe'ları tek noktadan korunuyor.
- **Kanıt:** lifecycle-deep koşusunda çökme sonrası webFrameMain satırı
  kalmadı; `tests/browser-script-execution.test.js` birim kilidi.

### B-377-02: yükleme-ortası çökmede `errorKind='crash'` `'connection'`a eziliyordu
- **Belirti:** yeniden kurulan görünüm `/slow` yüklerken ikinci
  `forcefullyCrashRenderer()` → `tab-crashed` renderer'a ULAŞIYOR ama
  hemen ardından `load-error` olayı gelip `errorKind`'ı `'connection'`a
  çeviriyordu — kullanıcı "Sekme çöktü / Sekmeyi yeniden yükle" yerine
  yanıltıcı "Sayfa açılamadı" yüzeyi görüyordu.
- **Kök neden:** `resumeRestoredBrowserPage`'in `loadURL` çağrısı çökmeyle
  reddediliyor (abort değil → `isAbortedBrowserNavigation` false) →
  catch kolu genel `load-error` gönderiyor; çökme işleyicisinin az önce
  yazdığı `tab.loadError.kind='crash'` kaydı eziliyordu.
- **Düzeltme:** `src/main.js` — catch kolunda `tab.loadError?.kind ===
  'crash'` kaydı varsa load-error gönderilmiyor; `requestIsCurrent()`
  false olduğundan `lifecycle='restore_failed'` da atanmıyor (çökme
  işleyicisi durumun sahibi).
- **Kanıt:** S2 senaryosu — yükleme-ortası ikinci çökmede üçüncü kurma
  YOK (bütçe doğru) + `kind==='crash'` korunuyor.

### B-377-03: pageFind çökme temizliği stderr gürültüsü
- **Kök neden:** `browser-page-find.js` `stop()` → `wc.stopFindInPage` ve
  `setObserverEnabled` → `wc.send('browser:find-state')` çökmüş wc'ye
  gidiyordu.
- **Düzeltme:** `frameGone()` yardımcısı (`!wc || isDestroyed() ||
  isCrashed()`) her iki çağrıyı da kapılıyor.

## Test kanıtı

- `xvfb-run -a node tests/run-electron-smokes.js lifecycle-deep` —
  6/6 GEÇTİ (S1 crash olayı+restore, S2 mid-load ikinci çökme bütçesi +
  crash-kind korunumu, S3 kapalı-sekme dirilmez, S4 arka plan izolasyonu,
  S5 wc sızıntısı yok 2→2, S6 unhandledrejection 0).
- `node tests/browser-script-execution.test.js` — geçti (isCrashed kilidi).
- `node tests/browser-page-find.test.js` — geçti.
- `node --check` değişen 4 dosya — temiz.

## Windows etkisi

Çökmüş-wc kapıları Electron API'si (`isCrashed`) — platformdan bağımsız,
Windows'ta da aynı davranış. `resumeRestoredBrowserPage` düzeltmesi
kullanıcı-yüzü: Windows'ta sekme çökmesinde doğru "Sekme çöktü" yüzeyi
artık korunuyor. Windows'ta elle doğrulanmadı (Linux xvfb).

## Kalan / sınır

- Ana navigasyon yolunda (`browser:navigate` catch) loadURL reddi
  errorKind'ı ezmiyor — yalnız sinyal metni basıyor; kozmetik, kabul
  edilebilir.
- "load-error" olayının `'crash'` koruması yalnız loadError kaydına
  bakıyor; ileride crash nedenleri genişlerse aynı kapı korur.
