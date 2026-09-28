# BROWSER_BUG_REPORT_154 — R172: renderer.js ikinci doğrulanmış dilim + sinyal taraması kapsam düzeltmesi

- Tarih: 2026-09-27
- Dal: `codex/r172-renderer-slice2-*`
- Kapsam: `src/renderer/renderer.js` modülerleştirmesinin ikinci dilimi (R153 devamı) ve bu sırada bulunan bir test-kapsamı boşluğu.

## Yapılanlar

### 1) İkinci dilim: 9 sekme-şeridi işlevi → `renderer-helpers.js`

`renderer.js`'ten **9 işlev / 91 satır** `src/renderer/renderer-helpers.js` sonundaki yeni "Tarayıcı sekme şeridi yardımcıları" bölümüne taşındı:

`browserTabLabel`, `syncBrowserTabAudioButton`, `browserTabActivity`, `closeBrowserTabMenu`, `browserTabMenuOutside`, `duplicateBrowserTab`, `closeOtherBrowserTabs`, `closeRightBrowserTabs`, `showBrowserTabPreview`.

R153'teki dört dışlama sınıfıyla doğrulandı:

- **İsim-anchor:** dokuz adın hiçbiri `tests/` içinde geçmiyor (programatik tarama).
- **Gövde-metni:** taşınan gövdelerdeki ayırt edici literal/sınıf adları (`browser-tab-preview`, `Sekmeyi sessize al`, `interfaceChoice('Yeni sekme', 'New tab')` vb.) hiçbir testte aranmıyor.
- **Bölge-aralığı:** tüm `slice(indexOf(A), indexOf(B))` çiftleri çıkarılıp konumlandırıldı; adayların girdiği iki gerçek bölge (`renderBrowserTabs→updateBrowserPinMenu`, `buildBrowserTabItem→updateBrowserPinMenu`) yalnız kalıp-assert'leri içeriyor ve o kalıplar (`browser-tab-pin` yokluğu, `focusedTabId`, `browser-tab-favicon`, `referrerPolicy`) taşınmayan işlevlerin gövdelerinde kalıyor.
- **Çağıran-zinciri:** çağıranlar (`renderBrowserTabs`, `syncBrowserTabItem`, `openBrowserTabMenu`, `scheduleBrowserTabPreview` vb.) renderer.js'te kalıyor ama yalnızca metin-regex'iyle denetleniyor — hiçbir test taşınan işlevleri eval bağlamında çağırmıyor; çağrılar gerçek uygulamada global alan üzerinden çalışma anında çözülür.

Davranış değişikliği yok; `npm test` tam paket yeşil (tüm dosyalar, 0 başarısız).

### 2) Test-kapsamı düzeltmesi: `setBrowserSignal` sinyal ratchet'i yardımcı dosyaları taramıyordu

`tests/i18n-coverage.test.js` `signalMissing()` yalnız `renderer.js`'i tarıyordu. R153 sonrası `renderer-helpers.js` zaten 15 `setBrowserSignal('Türkçe…')` literal'i taşıyordu — bu metinler ratchet'in dışına çıkmıştı (EN karşılığı eksik olsa yakalanmazdı). Tarama artık `src/renderer/*.js` altındaki tüm script'leri kapsıyor; mevcut 15 literal'in hepsinin EN girdisi zaten var (boşluk 0/0, baseline korunur). Bu bir ratchet **genişletmesi** — gevşetme değil.

## Doğrulama

- `node --check` renderer.js + renderer-helpers.js temiz.
- `node tests/i18n-coverage.test.js`: `index.html tam; sabit sinyal eksikleri 0/0`.
- Hedefli: player-ui, browser-settings-tab, browser-reading-design, browser-parti6, ui-locale, browser-report123-regressions — hepsi geçti.
- `npm test` tam paket: 0 başarısız.

## Windows etkisi

Yok — yalnızca renderer JS dosya bölümlemesi; `index.html` script listesi dokunulmadı (dosya R153'te zaten bağlı), CSP `script-src 'self'` yerel yüklemeyi kapsıyor.
