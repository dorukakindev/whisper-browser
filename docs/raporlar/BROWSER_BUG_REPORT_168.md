# BROWSER_BUG_REPORT_168 — R188: Electron smoke seti uçtan uca triage (7/7 yeşil)

Tarih: 2026-09-28 · Dal: `codex/r188-deferred-findings-1790543822` · Başlangıç: `c38176c` (master)

## Kapsam

R166 raporunda ertelenen bulgu ("Electron smoke seti master'da tam koşulmuyor") bu turda
kapatıldı: `node tests/run-electron-smokes.js --all` master `c38176c`'de koşturuldu, **8
başarısızlık** çıktı; biri kaynak çekişmesi flake'i (subtitle-output, tek başına yeşil),
kalan 7'sinin her biri kök nedenine inilip düzeltildi. Bugünkü doğrulamada 7/7 yeşil.

## Doğrulanmış ürün bug'ları (smoke'lar yakaladı — ürün düzeltildi)

### P1 — `setSideTab` ikon rayında içerik açmıyor

Kod yoluyla bir yan sekme istenince (`setSideTab('tools')` vb.) `playerSide` hâlâ
`side-rail` (48px ikon rayı) ise sekme içeriği gizli kalıyordu — tıklama yolu
zaten `setBrowserSideRailPref('panel')` çağırıyordu ama programatik yol bunu
atlıyordu. `setSideTab` başına aynı genişletme eklendi (renderer.js ~16018).

### P2 — Ayarlar çekmecesi ray modunda açılmıyor

`.player-side.side-rail > *:not(.side-top) { display:none }` kuralı, settings
çekmecesi açıkken (`side-rail-mode.settings-open`) çekmeceyi de gizliyordu.
Çekmece artık daraltılmış/sinema düzeniyle aynı bağımsız katmanı devralıyor:
seçici `.player-layer:not(.settings-open) .player-side.side-rail > *:not(.side-top)`
+ `.player-layer.side-rail-mode.settings-open .player-side`/`.settings-drawer`
overlay kuralları (styles.css ~2913, ~6960).

### P3 — side-rail + settings'te WebContentsView ayarların üstüne biniyor

`syncBrowserOcclusion` ayar katmanını yalnız `sidebar-collapsed`/`mode-cinema`'da
işaretliyordu; `side-rail-mode` eklenmediği için WebContentsView (DOM'un üstünde)
ayar çekmecesini örtüyordu. Koşula `side-rail-mode` eklendi (renderer.js ~868).

### P4 — Sayfada-bul ve geçmiş metinleri EN'de Türkçe kalıyordu

`browserFindCount` hata/sonuç metinleri (`Arama yapılamadı`, `Eşleşme yok`) ve
geçmiş satırı formatlayıcıları (`historyWhen`/`historyDur` — "bugün 12:30",
"3 sa 45 dk") UiLocale'dan geçmiyordu. `UiLocale.t` sarmalları + `Eşleşme yok`
sözlük girişi + `N sa M dk`/`N dk` kalıp eşleşmeleri eklendi.

## Smoke düzeltmeleri (test sözleşmesi güncellendi — ürün kasıtlı davranışı)

### T1 — tab-leak: cue'lar ilk resync'te siliniyordu (kök neden bulundu)

Smoke overlay cue'larını ham `window.api.setBrowserOverlay` ile enjekte ediyordu;
oysa renderer'ın `scheduleBrowserOverlaySync`'i (120ms debounce) her sekme/split
olayında `player.cues`/`cues2` modelini tek doğruluk kaynağı olarak yeniden iter.
Model tohumlanmadan itilen cue'lar, `split:set` sonrası ilk resync'te boş
`{src:0, mode:'both'}` payload ile eziliyordu → B'nin overlay denetçisi
`qfNoBoundary`'de sonsuz bekliyordu. **Enstrümantasyonla kanıtlandı**
(`[OLAY]` log'ları: resync `src=0` itişi `split:set`'ten hemen sonra).
Düzeltme: üç enjeksiyon noktası da önce renderer modelini tohumlayıp sonra
doğrudan itiyor; ürün sözleşmesi yoruma yazıldı. **Ürün bug'ı değil** — model
tek kaynak olmalı; test sözleşmeyi atlıyordu.

### T2 — extras: araçlar paneli genişlik yarışı (220ms grid geçişi)

`setSideTab` ray genişletmesi doğru çalışıyor ama `.player-body`'nin
`grid-template-columns` geçişi 220ms sürüyor; ölçüm animasyon ortasında 48px
döndürüyordu. Genişlik assert'i `until()` koşul yoklamasına çevrildi.

### T3 — cea-full-ui / analysis-ui / extras: TR metin sözleşmesi, EN profil

Arayüz varsayılanı EN (R186 sonrası `localStorage 'whisper.uiLocale'` default EN).
TR dizgi doğrulayan smoke'lar profili `settings.json` `ui.uiLocale:'tr'` ile
tohumlanacak şekilde güncellendi (profil dizini oluşturulduktan hemen sonra,
`require('../src/main.js')` öncesi).

### T4 — youtube-oauth: "iptal" modal kapatmayı çağırıyordu (R122 tasarımı)

R122/PR #48'in kasıtlı sözleşmesi: `closeYoutubeLogin()` modalı gizler ama
loopback akışını İPTAL ETMEZ (arka planda bekler). Gerçek kullanıcı iptali
`ytDeviceCancel.click()` → `_ytFlowGen++` + `youtubeCancel()`. Smoke artık
doğru iptal yolunu kullanıyor.

### T5 — menu-visual: birleşik Whisper düğmesi medya görülmeden gizli (R124)

`updateBrowserSubtitleSummary` → `shouldHide = !count && !busy &&
!player.browserMediaSeen`; fixture yalnız poster bildiği için düğme hiç
görünmedi → menü tıklaması `details.open` açamadı. `browserMediaSeen=true`
tohumu + `updateBrowserSubtitleSummary()` eklendi.

### T6 — a3-acceptance: ardışık koşuda CDP `Promise was collected` flake'i

Sıralı runner altında (7 Electron örneği üst üste) WebSocket await'i GC
çöpüyle çöktü (`createCdpClient`, satır ~54). Tek başına koşuda (`DISPLAY=:0
npx electron tests/electron-a3-acceptance.smoke.js`) ve profil TR tohumuyla
yeşil. Ürün hatası değil — test ortamı zamanlaması; runner envanterinde
not edildi.

### T7 — subtitle-output: kaynak çekişmesi flake'i

`--all` koşusunda ölü zaman aşımı; aynı binary tek başına yeşil. Değişiklik yok.

## Bilinçli olarak tutulan sertleştirme

- **`backgroundThrottling:false`** (main.js `ensureBrowserView`
  webPreferences): ilk teşhis hipotezi (zamanlayıcı boğması) tab-leak'te
  çürütüldü, ama bölünmüş/arka-plan WebContentsView'da Chromium'nun
  zamanlayıcı boğması overlay/media tazeliği için meşru risk. Ürün
  düzeltmesi olarak değil **hardening** olarak tutuldu; yorum satırıyla
  belgelendi. Elektrik tüketimi yok sayılacak kadar küçük (uygulama
  kullanıcı kontrolünde video oynatıyor).

## Temiz çıkan geniş inceleme

Triage boyunca overlay yığını derin okundu: `browser:setOverlay` handler'ı
(aktif-sekme kapısı + 20000 cue sınırı + sadece aktif view'a itme),
`invalidateBrowserTabSubtitles`/`did-start-navigation` sıfırlama yolları
(mode/offset korunuyor), `applyBrowserOverlay` tek-yazıcı disiplini —
hepsi kasıtlı ve sınırlı. İkincil split view'in stale state tutması da
`browser:split:set`'in `queueBrowserTabTransition` kuyruğuna alınmamış
olmasıyla açıklanıyor (belgeli davranış, kullanıcı senaryosunda zararsız).

## Doğrulama

- `node tests/run-electron-smokes.js cea-full-ui analysis-ui a3-acceptance
  youtube-oauth menu-visual tab-leak extras` → **7/7 PASS**
- `npm test` (`tests/run-all.js`) → yeşil; tek düşüş dal içindeydi
  (`ui-locale` yinelenen TR anahtarı — aynı giriş R186'da eklenmişti,
  dedupe edildi; ui-locale 14/14, ui-locale-dynamic, report117 15/15 yeşil)
- `node --check` tüm değişen dosyalarda temiz.

## Windows etkisi

Yok — ürün değişiklikleri davranışı iyileştirir (ray/settings görünürlüğü,
overlay gizleme koşulu, i18n sarmalları, throttling sertleştirmesi),
platform mantığını bozmaz. Smoke düzeltmeleri test içi. Windows'ta el
kontrolü önerilir: (a) ikon rayındayken Araçlar/Yapay Zekâ sekmesine kod
yoluyla geçişte içerik görünür mü; (b) EN arayüzde sayfada-bul "No matches"
ve geçmiş "h/min" etiketleri.

## Windows doğrulama oturumu notu (c822415ff532496fa775639c291f5204)

Paralel Windows child'ın R188 el-kontrol turu 6/6 PASS döndü: appMenu
taşması ÇÜRÜTÜLDÜ (overflow menüsü doğru çalışıyor), sabit-sekme 36px,
Ctrl+F sayaç, son-izlenenler sırası, R186 EN yüzeyleri, start.bat akışı.
Önerileri (blueprint Windows bloğu + windows-ui-validation skill) bu
devir/report notuna taşındı.
