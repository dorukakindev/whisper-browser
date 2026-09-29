# BROWSER_BUG_REPORT_192 — R235: details menülerindeki form kontrolleri ok tuşlarını kaybediyordu

Başlangıç: master `983ac21`
Teslim dalı: `fix/menu-formcontrol-arrows` → `master`

## Bulgu — sistemik menü ok-tuşu çakışması (DÜZELTİLDİ)

**Belirti:** `wireDetailsMenuNav` bağlı her details menüsünde (browserTranslateMenu, browserPageQuickMenu, browserMoreMenu, browserSplitMenu, browserSiteChipDetails, browserSignalMenu, appModeMenu, appMenu) odak bir form kontrolündeyken herhangi bir ok/Home/End tuşu odağı menü öğesine kaydırıyordu.

- **select'ler** (`playerUiLocale`, `browserSplitSecondary`, sinyal menüsündeki ~15 select): ↑/↓ seçeneği değiştirirken odak aynı anda sonraki/önceki öğeye sıçrıyordu — select klavye kullanımı fiilen kırıktı.
- **input/textarea'lar** (`browserSplitRatio` ve ~10 range, sayı girişleri, `browserPageLockedTerms`/`browserPageExcludedSelectors` textarea'ları, daha önceki `moreSearch`): `detailsMenuFocusable` listesinde olmadıkları için `idx = -1` → ArrowDown odağı ilk öğeye, ArrowUp sondan ikinciye taşıyordu — metin yazarken veya kaydırıcı ayarlarken tek ok basımı odağı söküyordu.
- Home/End aynı şekilde ilk/son öğeye sıçratıyordu.

**Kök neden:** `wireDetailsMenuNav` (renderer-helpers.js) details seviyesinde keydown dinler; kabarcıklanan olayın hedefinin form kontrolü olup olmadığına bakmazdı. Menüler komut öğeleriyle gerçek ayar denetimlerini karıştırdığından aynı tuşlar iki anlam taşıyordu. R234'teki `moreSearch` düzeltmesi (stopPropagation) bu sınıfın tek yüzeyini kapatmıştı; bu tur sınıfın tamamını kapattı.

**Düzeltme:** Yeni saf yüklemi `detailsNavSkipsControl(target)` (`input, select, textarea` içindeyse true) + `wireDetailsMenuNav` başına kapı satırı — kontrol odaklıyken menü gezintisi atlanır, tuşlar yerleşik davranışına kalır. Düğme/summary/menuitem odağında ok gezintisi değişmez.

**Kapsam:** `browserSignalMenu` tek başına ~50 denetim taşıyor (select/range/number/checkbox/textarea) — düzeltme tüm araç çubuğu menülerini ve açılır kalan her details'ı kapsıyor.

**Kanıt:**
- `tests/browser-menu-proxy.test.js` §4 — `detailsNavSkipsControl` gerçek koddan dilimlenip jsdom'da 6 durum kilitlendi; fixture dinleyicisine de kapı eşdeğeri eklendi.
- Yeni `tests/electron-browser-menu-formcontrols.smoke.js` — gerçek düzen (jsdom `offsetParent` veremediği için `detailsMenuFocusable` jsdom'da hep boş döner; tam yol ancak Electron'da doğrulanabilir): range'de →/← değer ayarlar + odak kalır, select'te ↓/Home odak kalır, düğmede ↓ gezinti sarar.

**Sınır:** Electron smoke'u bu başsız kutuda koşamaz (`exit 9` bilinen kısıt); Windows makinede `node tests/run-electron-smokes.js electron-browser-menu-formcontrols` ile el koşusu önerilir.

## Doğrulama

- `node --check` renderer-helpers.js + yeni smoke — temiz
- `node tests/browser-menu-proxy.test.js` — PASS

## Windows etkisi

- Tüm menülerin klavye kullanımı Windows'ta da aynı DOM olay akışını izler; düzeltme platformdan bağımsız. Özellikle sinyal/ayar menüsü (uzun denetim listesi) el kontrolü önerilir.

## Çalıştırılmayan kontroller

- Yeni Electron smoke (başsız kutu).
- `npm test` tam tur (hedefli jsdom testi yeterli görüldü).
