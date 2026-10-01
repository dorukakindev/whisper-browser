# BROWSER_BUG_REPORT_359 — Kuyruk-50 Madde 47: DPI ve çoklu monitör

Tarih: 2026-10-01 · Dal: `devin/1790893142-kuyruk-47` · Başlangıç kod: `38fe016` · Bitiş kod: `e5580b8`

## Kapsam ve yöntem

Madde 47: *"DPI ve çoklu monitör (gerçek Windows'ta ölçek/monitör taşıma/tam ekran/menü/dosya seçici)."* Gerçek Windows DPI/monitör taşıması bu ortamda denenemez; çoklu monitör güvenliğini sağlayan tüm statik yüzeyler denetlendi ve invariant'lar ratchet testiyle kilitlendi. Kusur bulunamadı — kanıtla kapanış.

## Denetim sonucu (temiz)

| Yüzey | Bulgu |
|---|---|
| Pencere durumu (`src/window-state.js`, `createWindow`) | Pozisyon kasıtlı olarak saklanmaz/geri yüklenmez → monitör kopması veya DPI değişimi ekran-dışı pencere üretemez. Kayıtlı boyut birincil `workAreaSize`'a kelepçelenir (`clampedWindowSize`); MIN 940×680 altı ve devasa/bozuk değerler güvenli varsayılana düşer. |
| Yerel diyaloglar (dosya seçici, kaydet, onay) | `src/main.js`'teki tüm `dialog.showOpenDialog`/`showSaveDialog`/`showMessageBox` çağrıları (30+) ilk argüman olarak `mainWindow` alır — sahipsiz diyalog yok; diyaloglar çoklu monitörde pencereyi takip eder. |
| Mini oynatıcı | `browser-mini-player.js` ayrı pencere değil — ana pencere içinde BrowserView (`setBounds`); monitör bağımsız. |
| Tam ekran (`htmlFullscreen`) | `browserFullscreenBounds()` `mainWindow.getContentBounds()` tabanlı — pencere-içerik-bağı; hangi monitörde/DPI'da olursa olsun doğru hesaplanır. TV penceresi F11/IPC `setFullScreen` toggle. |
| Başlık şeridi / menü | `titleBarOverlay.height: 38` DIP biriminde — Windows ölçeklemesinde otomatik doğru boyutlanır; tema rengi `app:theme-changed` ile senkron. Native menü `autoHideMenuBar` ile gizli; uygulama menüleri renderer `details`/popover — DPI'dan bağımsız CSS. |
| `display-*` olayları | `display-removed`/`display-metrics-changed` handler'ı yok ama gerek yok: pozisyon kalıcı değil, `browserBounds` pencere-içerik-bağı ve renderer resize'ıyla güncellenir. |

## Test kanıtı

`tests/dpi-multimonitor-ratchet.test.js` (yeni, 5 bölüm): windowStateForDisk çıktısı asla x/y/ekstra anahtar taşımaz; kelepçe matrisi (devasa/null/bozuk/minimum-altı/dar-ekran); diyalog sahipliği ratchet'i (tüm çağrılar pencere-sahipli); `browserFullscreenBounds` `getContentBounds`-tabanlı + `screen.*` yok; `createWindow` x/y restore etmez — **PASS**.

## Windows'ta doğrulanamayan sınırlar

- Gerçek DPI ölçeklemesi (125%/150%/200%) altında görsel doğrulama yapılmadı; DIP birimi ve CSS tekniği doğru, fakat gözle kontrol el listesinde.
- Monitör hot-plug sırasında açık pencere/diyalog davranışı gerçek donanımda denenmedi.
- İkincil monitörde tam ekran + sekme sürükleme arası etkileşim Windows el-kontrol listesinde.
