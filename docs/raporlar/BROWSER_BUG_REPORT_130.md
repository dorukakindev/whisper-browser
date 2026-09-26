# BROWSER_BUG_REPORT_130 — paket-v2 (7 patch) + KURULUM "Kalan işler" turu

Tarih: 2026-09-26 · Dal: `codex/paket-v2-1790500442476` · Taban: master `24f9135`

## Kapsam

Kullanıcının gönderdiği iki paketten `whisper-browser-paket-v2.zip` (üst küme)
uygulandı: 7 `git am` patch'i (`18e5374`..`abbfb7d`) — çeviri kalite kapısı,
JSON-modu reddi öğrenimi, adres çubuğu eski-URL/çift-altyazı, OSD/"…" düğmesi
ve sağ ray CSS, EN arayüz Türkçe kalıntıları, bağlama göre sağ-tık menüsü,
çift-dilli altyazı varsayılanı. v1 paketi (3 patch) v2'nin 0001–0003'üyle
bayt-bayt aynıydı; ayrıca uygulanmadı.

Paket içindeki `KURULUM.md`'nin "Kalan işler (yapılmadı)" listesi (9 madde)
bu turda tamamlandı:

## Kalan işler — uygulama özeti

1. **"Subtitle layout" ray düğmesi yalnız ayar çekmecesini açıyordu** →
   `sideSubtitleLayout` artık `<details id="sideSubtitleLayoutMenu">` küçük
   popover'ı açar: `data-subtitle-display` modu radyoları (mevcut
   `syncSubtitleModeUi`/`$$` bağlamasına otomatik oturur), `playerSubSelect`
   seçeneklerinden dinamik **iz** radyoları (`sideLayoutTracks`), `subSize`
   −/+ adımlayıcısı ve "Tüm altyazı ayarları…" footer'ı (çekmeceye
   `toggleDrawerAt(null,'#subSize')`).
2. **"İz seç"/düzen düğmesi dev çekmeceyi açıyordu** → `playerLayoutQuick`
   artık `<details id="playerLayoutQuickMenu">` popover'ı: Sinema/Okuma/
   Çalışma görünüm radyoları (`setViewMode`) + tema radyoları
   (`uiTheme` select'in kendi yerelleştirilmiş seçenek metinlerinden okur —
   `Açık` gibi `setLocale` tarafından özel çevrilen anahtarlar güvenli) +
   "Tüm ayarlar…" footer'ı.
   İki popover da `playerDetailsMenuIds`'e kayıtlı (dışarı tık/Esc/karşılıklı
   kapanma davranışı ortak), `wireDetailsMenuNav` ok tuşu gezintisi aktif,
   popover `position: fixed` + `getBoundingClientRect` hizalaması
   (`anchorQuickPop`) — `.side-rail` yatay kırpmasına takılmıyor. ±
   adımlayıcılar menüyü kapatmaz.
3. **browser-chrome.css sabit renkler** → `.browser-tab-close:hover`,
   `.browser-tab-audio:hover`, `.browser-tab.loading` ve grup rengi
   literalleri `:root` token'larına (`--group-amber/cyan/green/gray`)
   taşındı; css-hardcoded-colors tabanı 459 → **447**.
4. **Windows `titleBarOverlay` tema güncellemesi** → `titleBarOverlayForTheme`
   yardımcısı + renderer `applyUiTheme` → `window.api.notifyThemeChanged` →
   `ipcMain.on('app:theme-changed')` → `mainWindow.setTitleBarOverlay`
   (yalnız `win32`, `authorizedBrowserSender` kapılı). `createWindow`daki
   `{ color:'#0a0d11', symbolColor:'#a6adb6', height:38 }` literalleri korundu
   (player-ui sözleşme testi).
5. **`browserMediaSeen` → makale sekmesinde "No subtitle track" şeridi** →
   navigasyonda `navTab.browserTime`/`browserDuration` sıfırlanıyor +
   `scheduleBrowserNoTrackSuggestion` `!player.browserMediaSeen` ile erken
   çıkıyor.
6. **Popover JPEG anlık görüntü donması** → `browser:snapshotActive` artık
   encode öncesi `MAX_W=768`'e küçültüyor + `toJPEG(72)` — R120'nin
   "siyah sayfa" geri dönüşünü koruyarak boyutu/CPU'yu düşürür.
7. **Omnibox** → `browserAddressResultMark` host-harfli avatar
   (`is-host`, `--avatar-hue`), `buildAddressResults` `claimedUrls` kümesiyle
   URL düzeyinde tekilleştirme (sekme satırı kazanır), `activeTabId`
   hariç tutulur, ilk satır `inputKind` → "Adres olarak açılır."/
   "Opens as an address." açıklaması.
8. **Fare yan tuşları** → `mainWindow.on('app-command')`
   browser-backward/forward → `sendBrowserEvent(tab,{type:'browser-shortcut',
   key:'back'|'forward'})` (renderer tarafı zaten hazırdı).
9. **Sekme şeridi** → `renderBrowserTabs` anahtarlı `reusable` Map +
   `strip.replaceChildren(...ordered)` (tam yeniden çizim yerine düğüm
   yeniden kullanımı); ♪/× glifleri `browserTabAudioIcon` SVG'siyle;
   grup düzenleme `editBrowserTabGroup` → `appDialog` `{choices}` desteği
   (renk çipleri `app-dialog-choice`); sabit sekmeler ikon-only
   (`.browser-tab.pinned` 36px).

## Test sonuçları

| Test | Sonuç |
|---|---|
| `tests/player-ui.test.js` | 150/150 (+3 yeni popover sözleşme testi) |
| `tests/ui-locale.test.js` | 14/14 |
| `tests/css-hardcoded-colors.test.js` | 447/447 (taban 459→447) |
| `tests/browser-address-model.test.js` | 9/9 (+3 yeni: tekilleştirme/aktif sekme/açıklama) |
| `tests/browser-report123-regressions.test.js` | 6/6 |
| `tests/browser-tabs.test.js` | 12/12 |
| `tests/browser-tab-resources.test.js` | 9/9 |
| `tests/browser-quick-edit.test.js` | geçti |
| `tests/subtitle-model-default.test.js` | geçti |
| `node --check` main/preload/renderer | temiz |

Tam `npm test` koşulmadı (kapsam dışı); CI'da ubuntu+windows koşar.

## Karşılaşılan ve düzeltilen gerilemeler

- Contract testler yeniden adlandırılan değişkenleri (`avatar`, `labelEl`,
  `favicon.replaceWith`) doğruluyordu → sözleşme adları `syncBrowserTabItem`
  içinde korundu; `player-ui` dilim başlangıçları `buildBrowserTabItem`'a
  taşındı.
- Yeni renk çipleri sabit-hex sayacını aştı → renkler `:root` token'larına
  taşındı (aynı zamanda Kalan-3 maddesini çözdü).
- `Açık` tema anahtarı ui-locale sözleşmesinde "özel çevrilen" listede —
  popover radyoları select'in `option.textContent`'inden okuyor.

## Windows etkisi

- `titleBarOverlay` senkronu yalnız Windows'ta çalışır (`process.platform !==
  'win32'` kapısı Linux'ta no-op) — **Windows'ta tema değişince başlık çubuğu
  simge rengi artık güncellenmelidir** (bu oturumda Linux'ta doğrulanamaz;
  Windows'ta tema değiştirerek kontrol edin).
- Fare yan tuşları `app-command` olayı yalnız Windows'ta gelir — Windows'ta
  tarayıcı sekmesinde X1/X2 geri/ileri denemesi önerilir.
- `install.bat`/`start.bat` akışı etkilenmez; yeni bağımlılık yok; UTF-8
  dizgileri token tabanlı.

## Doğrulanmamış sınırlar

- Gerçek Windows'ta: titleBarOverlay canlı tema değişimi, X1/X2 tuşları,
  popoverların gerçek ekran görünümü (Linux Electron'da test edilmedi —
  mantık birim/sözleşme testleriyle doğrulandı).
- Omnibox davranışı gerçek yazmayla; JPEG küçültme gerçek menü açılışındaki
  akıcılık etkisi.
