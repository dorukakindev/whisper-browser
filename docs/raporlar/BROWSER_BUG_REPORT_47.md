# BROWSER BUG REPORT 47 — Tarayıcı üst katmanlarının video arkasında kalması

Tarih: 2026-09-16

## Sonuç

Kullanıcının ekran görüntülerinde gösterdiği iki belirti de doğrulandı ve düzeltildi:

1. `Sayfa çevirisi seçenekleri` açılır menüsü video oynarken native tarayıcı/video yüzeyinin arkasında kalıyordu.
2. `Aktif işler` paneli açılıyor fakat aynı yüzeyin arkasında kaldığı için yalnız başka bir üst katman native görünümü gizlediğinde görülebiliyordu.

## Ayrıntılı bulgu

- Electron tarayıcı içeriği DOM içinde değil, ayrı bir `WebContentsView` yüzeyinde gösteriliyor. Bu yüzey normal CSS `z-index` katmanlarının üstünde kaldığından sorunun CSS değerini yükselterek çözülmesi mümkün değildi.
- Renderer'daki ortak `syncBrowserOcclusion()` işlevi modal, ayar çekmecesi ve üç araç menüsünü açıldıklarında ana sürece `browser:setOccluded` göndererek native yüzeyi geçici gizliyordu.
- `browserPageQuickMenu` ve `playerTaskCenter` bu ortak hesaba dahil edilmemişti.
- `browserPageQuickMenu` ayrıca ortak araç menüsü yaşam döngüsünde bulunmadığı için dış tıklama ve Escape davranışları da diğer menülerle aynı değildi.

## Düzeltme

- `browserPageQuickMenu.open`, ortak oklüzyon hesabına eklendi.
- Görünür `playerTaskCenter`, ortak oklüzyon hesabına eklendi.
- `setPlayerTaskCenter()` her açma/kapatma sonrasında native yüzey görünürlüğünü yeniden eşitliyor.
- Sayfa çevirisi seçenekleri ortak araç menüsü listesine alındı; diğer menülerle karşılıklı kapanıyor, dış tıklama ve Escape ile kapanıyor, kapanınca native yüzey geri geliyor.
- Statik regresyon ve gerçek Electron `WebContentsView` görünürlük kabulü eklendi.
- Electron smoke testine `WHISPER_SMOKE_LAYOUT_ONLY=1` hedefli modu eklendi; böylece uzun smoke içindeki alakasız tam-ekran adımından bağımsız olarak responsive katman matrisi çalıştırılabiliyor.

## Ret ve sınır gerekçesi

- Yalnız CSS `z-index` değişikliği reddedildi: `WebContentsView` ayrı native yüzey olduğundan DOM katman sırasını aşar.
- Tam `electron-browser-experience-smoke` iki kez yeni kabul matrisinden sonra bulunan eski tam-ekran `browserCommand('fullscreen')` adımında zaman aşımına uğradı. Bu başarısızlık yeni katmanlama kabulünden kaynaklanmadı. Aynı smoke'un hedefli layout modu kullanılarak yeni davranış gerçek Electron penceresinde ayrıca çalıştırıldı ve geçti.
- Bilgisayar-kullanımı yardımcı süreci pencere seçimi öncesinde iki kez çöktüğü için kullanıcı oturumundaki açık pencereye doğrudan tıklama yapılamadı; bunun yerine geçici Electron profili ve gerçek `WebContentsView` ile otomatik kabul yapıldı.

## Doğrulama dökümü

- `node --check src/renderer/renderer.js` → geçti.
- `node tests/player-ui.test.js` → 144/144 geçti.
- `node tests/audit-followup.test.js` → 9/9 geçti.
- `$env:WHISPER_SMOKE_LAYOUT_ONLY='1'; electron tests/electron-browser-experience-smoke.js --disable-gpu` → geçti.
  - 1366×768: `page-translation-menu=false`, `active-jobs=false` native görünürlük.
  - 1920×1080: `page-translation-menu=false`, `active-jobs=false` native görünürlük.
  - 940×680: `page-translation-menu=false`, `active-jobs=false` native görünürlük.
  - Normal `sidebar-closed` durumunda native görünürlük üç boyutta da yeniden `true`.
- `npm test` → çıkış 0, son satır `Tüm testler geçti`; Python backend 180/180 dahil.
- `npm run test:electron-bridge` → geçti.
- `node --check src/main.js`, `src/preload.js`, `src/renderer/renderer.js` → geçti.
- `backend/venv/Scripts/python.exe -m py_compile backend/transcribe.py` → geçti.
- `git diff --check` → yalnız satır sonu dönüşüm uyarıları, hata yok.

