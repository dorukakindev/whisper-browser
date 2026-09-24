# Tarayıcı Entegrasyonu Hata Raporu 25 (Sözleşme ve Kalan-Açık Turu)

Rapor 24'ün "okunmamış alanlar" listesi ve son commit'lerde değişen modüller üzerinden yeni denetim turu.

- **Tarih:** 2026-09-15
- **Yöntem:** IPC/preload/renderer sözleşme eşleşmesi (166 invoke ↔ handler, `window.api.*` yüzeyi, index.html script etiketleri ↔ `window.*` bağımlılıkları, element ID doğrulaması, olay tipi çapraz kontrolü) + satır satır okuma: `browser-preload.js`, `browser-translation-scheduler.js`, `browser-dash-capture.js`, `browser-cea-full-capture.js`, `browser-adblock.js`, `browser-session-privacy.js`, `browser-media-controller.js`, `browser-mini-player.js`, `browser-page-find.js`, `browser-skip-segments.js`, `renderer/queue-lifecycle.js`, `renderer/browser-features.js`, `main.js` 9270-10190 ve 12450-12740.
- **Tekrar kontrolü:** Rapor 24'ün "ölü `cancelled` dalı" gözlemi artık geçersiz — `text-stability-evaluator.js` gerçek `cancelled` üretiyor. Aşağıdaki bulgular 1-24 kayıtlarıyla çapraz kontrol edildi.

## Sonuç özeti

Bu turda **1 orta + 3 küçük-orta/küçük yeni bulgu** ve sözleşme-riski gözlemleri çıktı. En önemli bulgu (B1) ağ geri geldiğinde çeviri kapsamının kullanıcı istemeden "tüm iz"e genişlemesi; API kotası harcaması açısından elle tetiklenmesi kolay bir hata.

## B1 — Ağ geri geldiğinde çeviri kapsamı sessizce "tüm iz"e genişliyor (P2) [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]

**Konum:**
- `src/browser-translation-scheduler.js` — `retryFailed()` (satır ~298-307)
- `src/main.js` — `ipcMain.handle('browser:network:setOnline')` (satır ~12711-12727)
- `src/renderer/renderer.js` — `syncBrowserNetworkState` (satır ~6783-6801)

**Mekanizma:**
1. `retryFailed()` koşulsuz `this.completeTrack = true` yapıyor — hatalı cümleler pencere dışında kalabileceği için eklenmiş bir kolaylık, ama kuyruğu pencere dışı TÜM cümlelerle dolduruyor.
2. `browser:network:setOnline`, renderer'daki `navigator.onLine` 'online' olayında (Wi-Fi kopup gelme, VPN aç/kapa) **her sekmenin** `translationScheduler` ve `pageTranslateJob.scheduler`ı için `retryFailed()` çağırıyor.
3. Senaryo: kullanıcı pencere-modu altyazı çevirisinde (yalnız oynatma konumu civarı) + tek bir kalıcı hata var + ağ kopup gelir → `completeTrack=true` → bütün film/bölüm kuyruğa girer → istenmeyen büyük API harcaması. Arka plan sekmeleri de dahil; üstelik `setPaused(false)` onları da yeniden başlatıyor.
4. Kullanıcının elle "hatalıları yeniden dene" eylemi de aynı genişlemeyi yapıyor: N hatalı cümle istenirken tüm iz kuyruğa giriyor.

**Önerilen düzeltme:**
- `retryFailed`'in `completeTrack = true` atamasını kaldır; bunun yerine hatalı cümle kimliklerini doğrudan kuyruğa ekleyen bir `retryIds` yolu ekle (pencere bağımsız ama kapsamı koruyan).
- `browser:network:setOnline` tarafında yalnız hatalı kimlikleri yeniden kuyruğa al; `completeTrack` yalnız kullanıcının açık "tümünü çevir" eylemine kalsın.

## B2 — bfcache geri dönüşünde preload gözlemcileri ölü kalıyor (P3, Electron'da doğrulanmalı) [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]

**Konum:** `src/browser-preload.js` (satır 131-137 ve 206-210), `src/browser-ass-renderer.js` (satır ~100)

**Mekanizma:**
1. `pagehide` once-listener'ları `discoveryObserver.disconnect()`, `stopPageFindObserver()` ve timer temizliği yapıyor. `pageshow`'da (özellikle `persisted=true`) yeniden kurulum yok.
2. Chromium'un bfcache'ine giren sayfa geri düğmesiyle döndüğünde JS bağlamı korunur ama preload YENİDEN çalışmaz; bağlanmış observer'lar kopmuş kalır: dinamik video keşfi (yeni eklenen `<video>` artık gözlemlenmez), sayfa-içi arama mutasyon bildirimi ve manga okuma-konumu sinyali o belge ömrü boyunca ölü kalır.
3. Aynı desen `browser-ass-renderer.js`'te `state.detach`'in tek seferlik `pagehide`'a bağlanmasıyla mevcut — overlay geri gelmez.

**Not:** ipcRenderer dinleyicileri ve MutationObserver'lar bfcache uygunluğunu engellemez; sayfa aday oldukça gerçek kullanımda tetiklenir. Doğrulama için gerçek Electron'da ileri-geri gezinme probe'u gerekli.

**Önerilen düzeltme:**
- `pagehide` yerine `pageshow` (`event.persisted`) handler'ında observer'ları yeniden kur; ya da `pagehide` temizliğini yalnız `persisted === false` iken yap.
- `browser-ass-renderer.js` için de aynı `pageshow` yeniden-bağlanma yolu.

## B3 — İkincil/split sekmede site tam ekranı tutarsız (P3) [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]

**Konum:** `src/main.js` — `enter-html-full-screen`/`leave-html-full-screen` işleyicileri (satır ~9600-9615) ve `applyBrowserViewBounds`/`applyBrowserViewsLayout` (satır ~3326-3355)

**Mekanizma:**
1. `enter-html-full-screen` bounds'u yalnız `tab.id === browserActiveTabId` ise uyguluyor. Split-secondary sekmenin `tab.htmlFullscreen`'i `true` kalır ama bounds uygulanmaz → site "tam ekrana geçtim" sanırken video küçük bölgede kalır.
2. Sonraki herhangi bir `applyBrowserViewsLayout` (pencere boyutlandırma, sekme değişimi, split değişikliği) `applyBrowserViewBounds(secondary)` → `tab.htmlFullscreen` nedeniyle `browserFullscreenBounds()` döner → ikincil view **aniden tüm pencereyi kaplar**. Beklenmedik iki aşamalı davranış.

**Önerilen düzeltme:**
- İkincil sekmede tam ekran girişi ya enter anında `applyBrowserViewsLayout` ile uygulanmalı (kullanıcı niyetine sadık) ya da split-secondary için html-fullscreen desteği açıkça reddedilip siteye tam ekran izni verilmemeli. İki yarı-durumdan biri seçilmeli.

## B4 — İki ölü olay: `load-retry` ve `html-full-screen` (P3) [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]

**Konum:**
- `src/main.js` satır ~9822 (`load-retry`), ~9604/9614 (`html-full-screen`)
- `src/renderer/renderer.js` — `onBrowserEvent` zinciri (~10769+): işleyici yok.

**Mekanizma:**
- `load-retry`: main "Geçici ağ hatası yeniden deneniyor (N/3)" mesajını hazırlayıp gönderiyor; renderer hiç işlemiyor → kullanıcıya hiç görünmüyor. Yeniden yükleme kendiliğinden çalıştığı için işlevsel kayıp yok; ama mesaj hazırlanıp boşa gidiyor.
- `html-full-screen`: main bounds'u kendisi uyguluyor; olay renderer'a bilgi amaçlı gidiyor ama işlenmiyor. Ya kaldırılmalı ya renderer'da durum göstergesine bağlanmalı.

**Önerilen düzeltme:**
- `load-retry` → `setBrowserSignal`'e bağla (veya olayı kaldır).
- `html-full-screen` → ya kaldır ya "tam ekran aktif" göstergesi/İpucu'na bağla.

## B5 — Altyazı varlık deposunda JSON+SRT çifti atomik değil (P3) [SONUÇ: REDDEDİLDİ · ÜRÜN HATASI DEĞİL]

**Konum:** `src/browser-asset-store.js` — kayıt yolu (satır ~127-130) ve `getTrack` (satır ~150-156)

**Mekanizma:**
1. `writeFileSync(tempJson)` → `writeFileSync(tempSrt)` → `renameSync(tempJson, jsonPath)` → `renameSync(tempSrt, srtPath)`. İki rename arasında çökme/ERR durumunda **yeni JSON + eski SRT** kalır.
2. `getTrack` yalnız **eksik** SRT'yi geri kurar; bayat ama mevcut SRT sessizce eski cue'ları dışa aktarır — JSON/SRT çifti uyumsuz kalır ve kullanıcı eski metni alır.

**Önerilen düzeltme:**
- Yazma sırasını ters çevir: önce SRT rename, sonra JSON rename (bozuklukta yeni SRT+eski JSON → `getTrack` yeni JSON görür ve SRT'yi ona göre geri kurabilir — yine de uyumsuzluk penceresi kalır). Daha sağlamı: her dosyaya sürüm/içerik-hash gömüp `getTrack`'te eşleşme doğrulaması yapmak; uyumsuzsa SRT'yi JSON'dan yeniden üretmek.

## B6 — browser-features Enter tuşu busy korumasını atlıyor (P4) [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]

**Konum:** `src/renderer/browser-features.js` — `keydown` işleyicisi (satır ~310-314)

**Mekanizma:**
- `keydown` `busy` denetlemeden `void semanticSearch()`/`void searchSubtitles()` çağırıyor; click yolunda `if (busy) return` koruması var. Enter ile yinelenen paralel istekler başlayabiliyor (arama ×2 API/istek, durum titreşimi).

**Önerilen düzeltme:**
- `keydown` dalında da `if (busy) return;` ekle.

## Gözlemler (sözleşme riski, doğrudan bug değil)

1. **`summarizeTranslationIntegrity` 'complete' dalı** (`browser-translation-integrity.js` satır ~30): `totalSentences` falsy ise tam çevrilmiş iz "ready/waiting" görünür. Çağıran her zaman `state.total` veriyorsa sorun yok; sözleşmeyi dokümante et veya `missingCueIds.length===0 && !failures` durumunda complete say.
2. **`shutdownBrowserSession` erken dönüş** (`browser-session-privacy.js` satır ~120-124): `activeReset` çözülürse `viewClosed: true` raporlanıyor ama `destroyView` hiç çağrılmıyor — sözleşme "activeReset view'i kapatır" varsayımına dayanıyor; ya doğrula ya raporu düzelt.
3. **`browserPageResourceTelemetry` sıfırları** (`browser-preload.js` satır ~185-198): `mediaListeners`/`overlayNodes`/`pendingFrames`/`resizeObservers` hep 0 dönüyor — gerçek ölçüm ekle ya UI'dan kaldır.
4. **Sessizlik monitörü interval'i** (`browser-media-controller.js`): video duraklıyken de 100 ms'de bir uyanıp early-return yapıyor; `monitoring` açık ve öğe bağlıyken süresiz tik atıyor — pil/CPU maliyeti, duraklatmada durdurulabilir.
5. **`browser-features.js` `tick` interval'i** (`setInterval(tick, 1000)`): browser modu dışındayken de her saniye çalışıyor; ucuz ama gereksiz — moda göre başlat/durdur.
6. **MutationObserver `removedNodes` taraması** (`browser-media-controller.js`): her mutasyonda tüm `media` seti taranıyor — çok mutasyonlu SPA'larda O(mutation × media) maliyet.
7. **Ctrl+click ele geçirme** (`browser-preload.js` satır ~35-45): her `<a href>` üzerinde Ctrl+click'i yeni sekme açılışına çeviriyor; anchor-tabanlı çoklu-seçim kullanan web uygulamalarında site işlevini bozabilir — site-profiline bağlı opt-out düşünülebilir.
8. **`whenIdle` pause semantiği** (`browser-translation-scheduler.js`): paused kuyrukta bekleyen `whenIdle()` çözülmez — sözleşme olarak doğru olabilir ama teardown bekleyen çağıranlar için asılı kalma riski; dokümante edilmeli.

## Sağlam çıkan denetimler (tekrar doğrulandı)

- **IPC sözleşmesi:** 166 preload invoke ↔ main handler eşleşmesi tam; `browser:extras` → `browser-feature-services.js`, `media-catalog:request` → `media-catalog-service.js`.
- **`window.api.*` yüzeyi:** renderer'da kullanılan tüm metotlar preload'da tanımlı (ilk taramadaki "eksik" 9 isim `window.BrowserSiteProfiles`/`window.WhisperProviderApiKeys`/`window.BrowserAutomationRules` gibi yardımcı modüllere işaret eden yerel `api` değişkenleriydi).
- **Script/ID sözleşmesi:** index.html'deki script etiketleri ↔ renderer'ın kullandığı `window.*` modülleri tam; `browser-features.js`'in dokunduğu 28 element ID'sinin tamamı mevcut.
- **Zamanlayıcı yaşam döngüsü:** üç polling `setInterval`'i (track/capture/media) `stopBrowserPolling`'de temizleniyor; mini-oynatıcı sekme-kapatma sırası doğru (`closing` bayrağı önce set ediliyor, view main'e geri taşınmıyor).
- **`decideSkip` baskılama:** seek döngüsü yok; geri-sarma durumunda kullanıcı niyeti korunuyor.
- **Zamanlayıcı/observer sızıntısı:** `runOrderedCeaCapture` pause edildiğinde uçuştaki segmentler `allSettled` ile beklenip `remaining`'e düşüyor; retry timer'ları `cancelAll`'de temizleniyor.

## Öncelik sırası

| # | Bulgu | Seviye | Öneri |
|---|---|---|---|
| B1 | `retryFailed` → `completeTrack` genişlemesi (ağ-geri-gelme + elle) | P2 | `retryIds` yolu; `completeTrack` yalnız açık eyleme |
| B2 | bfcache observer ölümü | P3 | `pageshow` re-init |
| B3 | Split-secondary tam ekran tutarsızlığı | P3 | Politikayı netleştir (uygula veya reddet) |
| B4 | `load-retry`/`html-full-screen` ölü olaylar | P3 | Bağla ya da kaldır |
| B5 | asset-store JSON/SRT atomikliği | P3 | Sürüm/hash doğrulaması + SRT'yi JSON'dan üret |
| B6 | Enter busy baypası | P4 | `if (busy) return` |

## Kalan okunmamış bölgeler (sonraki tur)

- `src/renderer/renderer.js` — ~17k satırın büyük kısmı (oynatıcı/çeviri/düzenleme yolları).
- `src/main.js` 4112-4453 — `runBrowserPageTranslationBlocks` + sayfa çeviri oturumu.
- `backend/` Python tarafı.

## Testler

Bu turda ürün kodu değiştirilmedi; yalnız rapor yazıldı. `npm test` / `node --check` çalıştırılmadı — doğrulama statik okuma ve sözleşme eşleşmesiyle sınırlıdır. B1 ve B3 için ürün kodu düzeltmesi yapılırken ilgili birim/smoke testleri çalıştırılmalıdır.

## Ayrıntılı bulgu, düzeltme, ret gerekçesi ve doğrulama dökümü

- B1: retryFailed terminal hata kimliklerini doğrudan kuyruğa alıyor; completeTrack artık değişmiyor. Uzak ve hiç denenmemiş cümlenin ağ dönüşünde başlamadığı davranışsal regresyonla doğrulandı.
- B2: persisted pagehide artık discovery, find ve okuma gözlemcilerini kapatmıyor. ASS katmanı da bfcache geçişinde korunuyor, gerçek belge yok oluşunda temizleniyor.
- B3: etkin veya split-secondary görünüm tam ekrana girdiğinde yerleşim tek tam ekran görünümüne atomik geçiyor; çıkışta split düzen geri kuruluyor.
- B4: load-retry kullanıcı sinyali ve günlüğe, html-full-screen ise sekme durumu ve görünür kullanıcı sinyaline bağlandı.
- B5 ret gerekçesi: varlık kimliği içerik-adresli. Aynı assetId farklı JSON/SRT içeriğine işaret edemiyor; eksik SRT de JSON'dan onarılıyor. Rapor 27'deki kaynak yeniden okuması bu iddiayı yanlış pozitif olarak geri çekti.
- B6: Enter yolu busy kapısını click yoluyla aynı şekilde uyguluyor.
- Doğrulama: report-25-28-regressions, browser-nine-features ve ilgili zamanlayıcı/sekme testleri geçti. Tam paket ve Electron/soak sonuçları son teslim notunda kayıtlıdır.
