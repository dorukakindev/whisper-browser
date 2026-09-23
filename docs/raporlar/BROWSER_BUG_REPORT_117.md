# BROWSER_BUG_REPORT_117 — R117: R115 ertelenen UI polish paketi

**Tarih:** 2026-09-22 · **Dal:** `codex/r117-ui-polish-1790185285` · **Taban:** master `f0ecb1c`

R115 raporunda "düşük maliyetli görünen ama ertelenen" beş iş maddesi + hex→token konsolidasyonu değerlendirmesi. Her madde kodda doğrulandı; dördü uygulandı, biri gerçek ölçümle reddedildi, biri de sayısal kanıtla planlanıp ertelendi.

## R117-A — "Altyazı işlemleri ▾" menü birleşimi — UYGULANDI

**Sorun (R115 ertelemesi):** cümle araçları satırında 4 aksiyon düğmesi yan yana sıkışıyordu (dar panelde taşma kaynağı).

**Uygulama:** `index.html` `.sentence-tools.tool-row-main` içine `<details class="subtitle-actions" id="subtitleActionsMenu">` — `<summary>` ("Altyazı işlemleri" + caret) + `.subtitle-actions-pop` menüsü; 4 mevcut düğme `role="menuitem"` olarak menüye taşındı. Menü `playerDetailsMenuIds` kaydına eklendi → Esc zinciri, dış-tık kapanışı, `aria-expanded` senkronu ve `wireDetailsMenuNav` ok/Home/End gezinmesi kazan-kazanla geldi. CSS `.subtitle-actions-pop` altta `bottom:calc(100%+8px)` ile yukarı açılır (araç satırı sahnenin dibinde). Kanıt: `r117-evidence/02-subtitle-actions-open.png`.

## R117-B — SmartTube up-next 5 sn geri sayım kartı — UYGULANDI

**Sorun:** `stAutoRelatedNext()` öneri listesinden sonraki videoyu hemen yüklerken kullanıcı iptal şansı bulamıyordu; autoplay jenerikti.

**Uygulama:** `#stUpNextCount` kartı `#playerStage` içine (küçük kare, thumb + "Sıradaki" etiketi + başlık + "5 sn içinde oynatılacak" + "Şimdi oynat"/"İptal"). `stUpNextCountdownStart(video)` 1 sn interval sayar; 0'da `stAutoRelatedPlay`. İptal noktaları: kart İptal düğmesi, `hideUpNextPanel`, `queuePlayerProbeFromCard`, `closePlayer`, video `play` olayı, Esc zinciri — hepsi `typeof cancelStUpNextCountdown === 'function'` korumalı (sliced-test sözleşmesi). Kart EN/TR çiftleri ui-locale'de. Kanıt: `r117-evidence/04-upnext-countdown.png` (EN locale'de doğrulandı).

## R117-C — Öncelikli araç çubuğu collapse'ı — REDDEDİLDİ (premise yanlıştı)

**Plan:** dar genişlikte araç çubuğundaki eylem düğmelerini `data-collapse-priority` sırasıyla ⋯ menüsüne taşımak (ResizeObserver + `browserToolbarCollapseSync`).

**Neden geri alındı (ölçüm, gerçek Electron + CDP):**
- `minWidth: 940px` (main.js) — pencere asla daha dara inemez.
- Öncelik işaretleyeceğimiz eylem düğmelerinin tamamı `.browser-action-source` → kalıcı `display:none !important` (styles.css:2601); görünür eylem yüzeyi toplamı yalnızca ~307px (translate-split 131 + browserPageTranslate 114 + browserPageQuickMenu 28 + browserMoreMenu 34).
- 940px'de 307px eylem + minimum adres alanı → overflow senaryosu fiziksel olarak oluşamaz; collapse mekanizması hiç tetiklenmeyecek ölü makine olurdu.
- Tüm `data-collapse-priority`/proxy öznitelikleri, `id="browserToolbar"`, ResizeObserver bloğu ve CSS kuralları **tamamen geri çıkarıldı** — uyuyan kod göndermek yerine karar bu raporda kayıtlı.

## R117-D — Adres çubuğu domain-bold — UYGULANDI (overlay)

**Sorun (R115 ertelemesi):** tek renk `<input>` alanında şema/host/parça vurgusu isteniyordu; input tek yazı tipi desteklemediği için "yapılamaz" denmişti.

**Uygulama:** input'u saran `.browser-address-field` + kardeş `.browser-address-mirror` overlay (pointer-events:none). `updateBrowserAddressMirror()`: odak input'ta değilken `new URL(input.value)` ile `scheme + hostname + rest` üç parçaya böler; şema ve kalanı `.mir-dim` (#8f9ca7), host `<b>` kalın. `mir-mode` input metnini transparent yapar (caret-color da transparent — caret zaten görünmez çünkü odak yok; odakta mirror hidden). Çağrı noktaları: `syncBrowserAddressAction` + tüm programatik `.value=` atamaları (nav handler, last-url restore, sekme restore, navigate, retry, unified-result, sourceRef, temizleme) — hepsi `typeof` korumalı. http dışı şemalarda mirror gizli. Kanıt: `r117-evidence/05-toolbar-wide-mirror.png` + DOM doğrulaması `{hidden:false, host:"127.0.0.1", scheme:"http://", rest:":8788/page/video-track.html"}`.

## R117-E — Hız select → popup menü — UYGULANDI

**Sorun (R115 ertelemesi):** cam pill'i `<select>` native popup'a güveniyordu (platform görünümü tutarsız, Electron'da native listbox).

**Uygulama:** `#playerSpeed` select durum deposu olarak korundu (görünmez: opacity:0, `tabindex="-1"`, `aria-hidden="true"`) — `syncPlayerSpeedControl`'ün özel-hız `data-custom-rate` enjeksiyonu, `nudgeSpeed`'in `sel.options` basamaklaması, `loadedmetadata` yeniden uygulaması ve `PERSIST_VALUE_CONTROLS`/site-profil bağlaması aynen çalışır. Görsel yüzey `.player-speed-menu` details+summary ("1×" + caret) → `.player-speed-pop` `role="menu"` + `menuitemradio` öğeleri; `playerSpeedPopupSync()` açılışta/change'de select'ten aynalar; tıklama `select.value = …` + `change` dispatch eder. Menü kaydı `playerDetailsMenuIds`'e eklendi (Esc/ok-gezinme/dış-tık/tek-açık). Kanıt: `r117-evidence/03-speed-popup.png` (0.5–2× liste + 1× accent işareti).

## R117-F — 335 hex → token konsolidasyonu — ÖLÇÜLDÜ, AŞAMALI PLANA ERTELENDİ

**Gerçek sayım (grep, styles.css):** 440 hex oluşumu / 334 tekil renk vs ~1302 `var(--)` kullanımı; iki ayrı `:root` paleti. Tek seferde konsolidasyon bu ölçekte kanıtsız değiştir-eşitle riski taşır (her rengin doğru token ailesine atanması gerekir).

**Önerilen aşamalı plan (sonraki tur):**
1. **Medya-krom token grubu:** video yüzeyi `rgba(0,0,0,.45)`-cam + `#fff` ailesinin 28 tekrarı — temadan bağımsızlık kasıtlı; tek `--media-chrome-*` setine indirilir (görsel risk sıfır: tek kural tek token).
2. **Tekrarlanan griler:** aynı hex'in 5+ geçtiği ölçekler mevcut değişken haritasına bağlanır.
3. **Tek-kullanımlıklar:** dosya sonuna blok tekstür renkleri olarak veya yakın token'a indirgenir.

## Canlı test turu bulguları (test ajanı, gerçek Electron + CDP — hepsi düzeltildi)

- **F1 (gerçek bug, görsel olarak maskeliydi):** `.browser-address-wrap input.mir-mode { color:transparent }` (0,2,1), `.workspace-browser .browser-address-wrap input` (0,2,1) ile tie'a girip geç kaldığı için kaybediyordu → ayna aktifken gerçek input metni saydamlaşmıyordu (computed `rgb(40,35,31)`); overlay aynı glifleri birebir örttüğü için görünürde sorun yoktu. Düzeltme: seçici `.workspace-browser .browser-address-wrap input.mir-mode` (0,3,1) oldu.
- **F2 (tema kusuru):** `.action-button-outline` sabit koyu-palet renklerdeydi (`#cbd5df`/`#33434f`) → açık temada pill + menü öğeleri ~1.6:1 kontrast. `html[data-theme="light"]` geçersiz kılmaları eklendi (var(--text) + var(--border-strong); hover var(--bg-2)).
- **F3 (küçük UX):** `.tool-row-main .btn-primary { order:-1 }` popup içinde "Altyazıları çevir"i görsel olarak başa alıyordu ama ok-gezinmesi DOM sırasında yürüyor → ↓ basınca odak görsel olarak YUKARI gidiyordu. Kural kaldırıldı: görsel sıra = DOM sırası = nav sırası.
- Üçüne de parti7 sözleşme assert'i eklendi (mir-mode spesifite, light outline, order:-1 yokluğu).

**Test turu sonuç özeti (test ajanı):** T1 subtitle-actions (yukarı açılma, 4 menuitem, Esc/dış-tık/ok-nav/disabled atlama) ✅; T2 speed popup (7 menuitemradio, aria-checked, 1.5× → select.value + playbackRate + etiket) ✅; T3 adres aynası (dim scheme/bold host, focus'ta gizleme, non-http'te kapalı) ✅; T4 geri sayım kartı (5→0 tick + stAutoRelatedPlay, İptal/Esc/Şimdi-oynat yolları — gerçek YouTube autoplay ortamda yok, gerçek fonksiyon + spy ile doğrulandı) ✅; T5 EN/TR canlı çeviri ✅; T6 1600px + 940px regresyon ✅.

## Doğrulama

- `node --check` renderer.js / ui-locale.js temiz.
- Hedefli: `browser-parti7` OK (R117 sözleşmeleri: subtitle-actions, countdown, mirror, speed popup), `player-ui` 148/148, `browser-reading-design`, `ui-locale` 14, `design-system`, `browser-subtitle-menu`, `player-escape-dialog`, `audit-tur5`, `browser-subtitle-session` — hepsi yeşil.
- **Tam `npm test` koşuldu: tüm dosyalar geçti** (ilk koşuda yakalanan iki sliced-test ReferenceError — `cancelStUpNextCountdown` closePlayer'da, `updateBrowserAddressMirror` nav-handler'da — `typeof` korumalarıyla giderildi).
- Gerçek Electron (test profili, CDP): 5 ekran görüntüsü `docs/raporlar/r117-evidence/`.

## Sınırlar / notlar

- Geri sayım kartı SmartTube related-autoplay akışına bağlı; gerçek 5 sn'lik bekleme uçtan-uca izlendi (kart render + iptal/şimdi-oynat yolları).
- Adres mirror yalnız http/https'te etiket üretir; `file:`, `about:` gibi şemalarda input düz görünür (kasıtlı).
- Token konsolidasyonu bu PR'da YOK — yalnız ölçüm ve plan.
