# BROWSER_BUG_REPORT_131 — paket-v2 E2E bulgu düzeltmeleri (PR #60 sonrası)

**Tarih:** 2026-09-26 · **Dal:** `codex/quickpop-fix-1790517000` · **Kaynak:** testing agent'ın PR #60 üzerindeki gerçek-Electron E2E raporu (`/tmp/wb-pr60-report.md`, kayıt `/home/ubuntu/screencasts/wb-pr60-popovers/`).

PR #60 master'a merge edildikten sonra E2E raporunda "release-blocking" olarak işaretlenen bir kusur ve üç küçük sorun geldi; bu PR onların düzeltmesidir.

## Bulgular ve düzeltmeler

| # | Şiddet | Bulgu | Kök neden | Düzeltme |
|---|--------|-------|-----------|----------|
| F1 | Yüksek (bloklayıcı) | `playerLayoutQuickMenu` ve `sideSubtitleLayoutMenu` popover'ları ekran dışında kırpılıyor (~%72 sağdan taşma) — açılır açılmaz TypeError, `pop.style.left` hiç atanmıyor | `addEventListener('toggle', (event) => { … requestAnimationFrame(() => anchorQuickPop(event.currentTarget)) })` — DOM spec gereği `event.currentTarget` dinleyici dönüşünde `null`'a döner; rAF callback'inde null → `anchorQuickPop(null)` | `const details = event.currentTarget;` rAF öncesinde yakalanıyor, callback `anchorQuickPop(details)` kullanıyor (`renderer.js` ~20380/20388) |
| F4 | Orta | `.browser-tab.pinned` 36px ikon-only sekme beklenirken 88px'de kalıyor | `.player-layer.workspace-browser .browser-tab { min-width: 88px }` (browser-chrome.css:734) pinned kuralını ezip genişletiyor | Aynı özgüllükte `.player-layer.workspace-browser .browser-tab.pinned { min-width:36px; max-width:36px }` eklendi |
| F2 | Orta | Omnibox kütüphane birleştirmesi açık bir sekmeyi "Kayıtlı içerik" satırı olarak ikinci kez listeliyordu | `add()` tekilleştirmesi `action+id` çiftine bakıyordu; unified sonuçlar `action:'unified'` ile geldiği için sekme/URL satırıyla hiç çakışmıyordu | `refreshBrowserAddressResults` içinde URL-anahtarlı `seenUrls` tekilleştirmesi (scheme/trailing-slash normalizasyonu); unified satır eklendikçe set'e yazılıyor |
| F3 | Düşük | `libraryResultKindLabel` etiketleri ("Kayıtlı içerik", "Sayfa içeriği", "Not" vb.) EN locale'de Türkçe kalıyordu | Fonksiyon Türkçe literal döndürüyordu; `uiText` sarması yoktu | Tüm dönüşler `uiText()`'e sarıldı + 5 yeni `UiLocale` girdisi: Not→Note, Sayfa içeriği→Page content, Çeviri altyazısı→Translation subtitles, Kayıtlı içerik→Saved content, Kütüphane sonucu→Library result |

## Regresyon koruması

`tests/player-ui.test.js` +1 test: `quick-pop hizalaması rAF içinde currentTarget null düşmez` — iki quick-pop toggle'ının `const details = event.currentTarget;` → `requestAnimationFrame(() => anchorQuickPop(details))` kalıbını koruduğunu sözleşme olarak denetler. Böylece bu tuzak tekrarlanırsa CI düşer.

## Test durumu

| Test | Sonuç |
|------|-------|
| `tests/player-ui.test.js` | 151/151 (+1 yeni) |
| `tests/ui-locale.test.js` | 14/14 |
| `tests/browser-address-model.test.js` | 9/9 |
| `tests/css-hardcoded-colors.test.js` | 447/447 |
| `tests/browser-report120-regressions.test.js` | 6/6 |
| `tests/browser-report123-regressions.test.js` | 6/6 |
| `tests/browser-subtitle-health.test.js` | geçti |
| `node --check` renderer.js | temiz |

## Windows etkisi

- F1 düzeltmesi tüm platformlarda geçerli (popover artık açılır) — Windows'ta iki menü düğmesini (`▦` ray + başlık çubuğu) açıp popover'ın düğmenin altında sağa yaslı göründüğünü doğrulayın.
- F4 sabit sekme genişliği yalnız browser workspace'inde; Windows'ta bir sekmeyi sabitleyip 36px ikon-only göründüğünü kontrol edin.
- `install.bat`/`start.bat`, bağımlılık, dosya yolu etkilenmez.

## Doğrulanmamış sınırlar

- Gerçek Windows'ta popover konumlandırması ve sabit sekme görünümü (Linux Electron'da sözleşme+birim düzeyinde doğrulandı; pixel-konum E2E'si testing agent'ın F1 fix kanıtında mevcut).
- Omnibox URL tekilleştirmesi gerçek geçmiş/kitaplık verisiyle; normalize etme kuralları (şema + sondaki `/`) temel varyantları kapsar, query/fark varyantlarını kapsamaz.
