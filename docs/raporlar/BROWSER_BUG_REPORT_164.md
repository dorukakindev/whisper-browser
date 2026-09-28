# BROWSER_BUG_REPORT_164 — R184: preload↔renderer API yüzeyi + dormant kanal bağlantısı

Tarih: 2026-09-28 · Dal: `codex/r184-tv-fullscreen-1790553000` · Temel: master `00bebea`

Kapsam: preload export ↔ renderer çağrı ↔ `ipcMain.handle` üçlü eşleşme
denetimi (231 preload export'u, 220 renderer kullanımı, tüm handle'lar).

## Doğrulanmış bulgu / iyileştirme

### F1 — `youtube-tv:fullscreen` dormant kanal → UI bağlandı [Küçük özellik]
Ana süreç işleyici (`main.js:1866`) ve preload export'u
(`youtubeTvFullscreen`) hazırdı ama hiçbir renderer çağrısı yoktu — TV
modunun lean-back amacı düşünülünce tam-ekran geçişi eksikti. TV banner'a
"Tam ekran" düğmesi eklendi ve kanala bağlandı; mevcut locale girdisi
`['Tam ekran', 'Fullscreen']` kullanıldı (yeni dizgi gerekmedi).

## Denetim kanıtları (temiz çıktı)

- **preload↔renderer:** 231 export'tan 13'ü doğrudan `window.api.X`
  görünmüyordu — incelemede 8'i gerçek dormant kanal (aşağıda), 5'i canlı
  (akıllı `?.` çağrıları tek ref'te, `smarttube-tv.js` yükleniyor).
- **renderer→preload eksik:** `browserLimits`/`resourceSoakMode` veri
  alanları (metod değil) — canlı.
- **preload→main eksik:** `media-catalog:request` ve `browser:extras`
  handler'ları ayrı modüllerde (`media-catalog-service.js`,
  `browser-feature-services.js`) — canlı.
- **main→preload yetim handle:** 0.

## Bilinen dormant ama canlı kanallar (kasıtlı rezervasyon — belgelendi)

`library:search`, `library:collections:list`, `invidious:cancel`,
`browser:getState`, `pdf:state`, `models:benchmark:history`,
`youtube:event` aboneliği — hepsinde çalışan `ipcMain.handle` var; renderer
henüz çağırmıyor. Bug değil, gelecek özellik yüzeyi; silme değil belgeleme
seçildi (handler+preload birlikte test ediliyor).

## Testler

`smarttube-*` + `youtube-tv-mode` + `report67-smarttube-wiring` (84/84) ✓
`node --check` değişen dosyalar ✓

## Windows etkisi

TV modu Windows'ta `start.bat` akışıyla açılıyor; yeni düğme yalnız
`BrowserWindow.setFullScreen` toggle'ı çağırıyor — platformdan bağımsız.
Doğrulanmamış: Windows'ta TV penceresinde tam ekran geçişi el kontrolü.
