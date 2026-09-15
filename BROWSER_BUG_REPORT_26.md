# Browser Bug Raporu 26 — derin denetim (izin modeli, kalıcılık, arşiv, yaşam döngüsü)

**Tarih:** 2026-09-15 · **Dal:** `master` · **Taban HEAD:** `ac5dda1`
**Kapsam:** `browser-site-permissions.js`, `browser-note-store.js`, `browser-translation-archive.js`, `browser-session-store.js`, `browser-downloads.js`, `browser-capture-recovery.js`, `browser-script-execution.js`, `browser-lifecycle-policy.js`, `hls-recovery.js` tam okundu; `main.js`'te izin handler'ı, `browser:navigate`, `unloadBrowserTab`, `browserTabCapturePending`, pending-response kesimi, sayfa-eylemi (`handleBrowserPageAction`) ve `browser:page:exclusions` yolları incelendi; renderer olay kapısı ve `browser-features.js` busy koruması yeniden doğrulandı.

> **Not:** Denetim sırasında çalışma ağacında kullanıcının commit'lenmemiş başka bir çalışması vardı (~420 satır: capture-provenance, dash-capture, subtitles, translation-integrity, main.js, preload, renderer + testleri). Bulgular mevcut ağaç durumuna göre verildi; satır numaraları bu durumu yansıtır. Bu rapor için **ürün koduna dokunulmadı**.

**Önceki rapor:** `BROWSER_BUG_REPORT_25.md` (B1–B6). Bu turdaki yeniden doğrulamalar en sonda.

---

## Yeni bulgular

### B7 · P2 — "Sor" izin tercihi fullscreen/clipboard-write'ta sessiz "İzin ver"e dönüşüyor [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]

- `src/browser-site-permissions.js:46` — kayıt yoksa `fullscreen` ve `clipboard-sanitized-write` varsayılanı **`allow`**.
- `src/browser-site-permissions.js:58` — `withBrowserPermission` `ask` seçiminde kaydı **siliyor** (`delete permissions[name]`); izin haritası boşalırsa origin kaydı da silinir.
- `src/main.js:9557-9558` — `setPermissionRequestHandler` `decision === 'allow'` ise sessizce `callback(true)`.
- `src/main.js:11277` — UI `stored[permission] || 'ask'` gösteriyor; kayıt silinince panel "Sor" derken motor "izin ver" uygular.

**Senaryo:** Kullanıcı bir site için fullscreen'i "Her seferinde sor"a çeker (veya paneldeki varsayılan "Sor" görünümüne güvenir) → kayıt silinir → sonraki `requestFullscreen()` `decision='allow'` ile **sormadan** kabul edilir. Aynısı `clipboard-sanitized-write` için geçerli: panoya sessiz yazma. Kullanıcı niyeti ("bana sor") tersine çevrilmiş oluyor. Diğer izinlerde varsayılan `ask` olduğu için silme davranışı doğru sonuç verir; hata yalnız `allow`-varsayılanlı iki izinde.

**Öneri:** Ya `withBrowserPermission` `ask` için kaydı silmek yerine `permissions[name] = 'ask'` yazsın (karar fonksiyonu `stored` döndüğü için 'ask' kaydı zaten çalışır), ya `browserPermissionDecision`'daki iki `allow` varsayılanı 'ask'a çekilsin. UI ile motor varsayılanı aynı kaynaktan beslenmeli.

**Test:** `withBrowserPermission(perms, url, 'fullscreen', 'ask')` → `browserPermissionDecision(...) === 'ask'`; aynısı `clipboard-sanitized-write`; 'block' → 'ask' geçişinde origin kaydının korunması; `setPermissionRequestHandler` entegrasyonunda istek olayının düştüğü doğrulanmalı.

---

### B8 · P3 — `BrowserNoteStore` kurtarma yazımı konstruktörü patlatabilir; not IPC'leri kalıcı ölür [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]

- `src/browser-note-store.js:79` — `load()` sonunda `if (this.recoveredFromBackup) this.flush({ preserveBackup: true })` — **try/catch yok**.
- `src/main.js:1539-1542` — `browserNoteStore()` konstruksiyonu sarmıyor; örnek yalnız başarıyla dönerse `browserNoteStoreInstance`'a yazılıyor.

**Senaryo:** `notes.json` bozuk + `notes.json.bak` sağlam (kurtarılabilir durum) → bellek içi veri başarıyla yüklenir → recovery `flush` diske yazarken hata verir (Windows'ta `rename` EPERM/EACCES — antivirüs/dizinleyici kilidi, disk dolu, OneDrive çakışması) → istisna konstruktörden dışarı çıkar → `browserNoteStoreInstance` boş kalır → **her** not IPC çağrısı (`ensureBrowserNotesReady` üzerinden) aynı döngüyü tekrarlayıp tekrar fırlatır. Geçerli yedek verisi bellekte hazır olmasına rağmen tüm not özelliği dosya sistemi iyileşene kadar kullanılamaz; kullanıcı ham `EPERM` metni görür.

**Öneri:** `load()`'daki recovery flush'i try/catch'e al; başarısızsa `loadError`/`migrationError` yerine ayrı bir `recoveryWriteError` alanına yazıp bellek içi deposu çalışır bırak (okuma/listeleme çalışır, yazma denemeleri ayrıca raporlanır). `browserNoteStore()` çağrısı konstruksiyon hatasını yakalayıp boş-degrade bir depo döndürebilir.

**Test:** bozuk ana + sağlam yedek + `renameSync` fırlatan sahte `fs` → konstruktör fırlatmamalı, `get()` veri döndürmeli, `upsert` anlaşılır hata vermeli; mevcut testler (`browser-note-store.test.js:107-128`) kurtarma ve çift-bozuk yolları kapsıyor ama bu yol kapsanmıyor.

---

### B9 · P3 — Çeviri arşivi her revizyonda yetim dosya çifti biriktiriyor [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]

- `src/browser-translation-archive.js:247-255` (`savePage`) ve `:311-325` (`saveSubtitle`) — dosya kökü `stem` içinde `contentDigest` (içerik hash'i) taşıyor; aynı mantıksal `id` için içerik değiştikçe **yeni** `.json`+`.md` / `.json`+`.srt` çifti oluşur.
- `_saveIndex` (`:222-229`) index girdisini `id` ile değiştirir ama **önceki stem dosyalarını silmez**. Hiçbir yerde eski stem temizliği/GC yok.
- `src/main.js:8827` — her sayfa eylemi (düzenleme, dışlama) `persistBrowserPageTranslationArchive` çağırıyor; her manuel düzeltme = +2 yetim dosya. Altyazı tarafında terminoloji öğrenimi/revizyon aynı `id` altında yeni digest üretir.
- Çökme senaryosu: `_writeText` sırası (srt → json → index) arasında ölüm → index eski tutarlı çifti gösterir ama yeni yazılan dosya yetim kalır (index dışı, asla temizlenmez).

**Etki:** `userData/.../Sayfalar|Altyazılar` sınırsız büyür; aktif düzenleme yapan kullanıcıda yüzlerce yetim dosya. Veri kaybı yok (index hep tutarlı kalır), saf disk sızıntısı.

**Öneri:** `_saveIndex`'te aynı `id`'nin önceki `jsonPath`/`displayPath` kayıtlarını silme (best-effort `unlink`), veya `ensure()` sırasında index'te referansı olmayan `Sayfalar/*` `Altyazılar/*` dosyalarını süpüren bir GC (dikkat: başka girdiye ait dosyaları silme — yalnız aynı id önekli veya hiçbir index yolunda geçmeyen dosyalar).

**Test:** aynı `id` ile iki farklı içerik kaydet → index en yeniyi gösterir + eski stem dosyaları yok; crash-injection (srt yazıldı, json fırlattı) → index tutarlı + yetim sayısı sınırlı; `browser-translation-archive.test.js`'te bu yol kapsanmıyor.

---

### B10 · P4 — `tab.downloadActive` ölü koruma bayrağı: indirme bellek-boşaltmayı engellemiyor [SONUÇ: DOĞRULANDI · ÖLÜ KOD KALDIRILDI]

- `src/browser-tab-resources.js:23` — `browserTabProtectionReasons` `tab.downloadActive` okuyup `active_job` nedeni üretiyor.
- Tüm `src/` içinde `downloadActive` **hiçbir yerde atanmıyor** (tek okuma yukarıdaki satır).

**Senaryo:** Sekmeden indirme başlar → kullanıcı/otomatik bellek yönetimi sekmeyi boşaltır (`unloadBrowserTab`) → indirme session-kapsamlı olduğu için devam eder (`browser-downloads.js` global kayıt tutar). Tasarım buysa bayrak ölü kod; değilse eksik yaşam-döngüsü bağı — sekme "indirme sürüyor" diye korunmuyor.

**Öneri:** Karar ver: (a) indirmeler sekmeden bağımsızsa `downloadActive` koşulunu ve `active_job` metnindeki "indirme"yi kaldır + `browser-downloads.js`'e "indirme sekmeyi boşaltmayı engellemez" notu; (b) koruması gerekiyorsa `will-download`/`done` olaylarında sekme eşleşmesi kurup bayrağı set/clear et. `DownloadItem`'ın hangi `WebContents`'ten geldiği `item.getURL()`+webContents eşleşmesiyle bulunabilir.

**Test:** sekmeden indirme başlat → `browserTabProtectionReasons`/`browserTabUnloadDecision` beklentisi (karar a veya b'ye göre); sekme boşaltılırken indirme kaydının geçerli kalması; `browser-tab-resources.test.js`'e eklenebilir.

---

### B11 · P4 — Sayfa-içi `exclude` eylemi iş-koşan korumasını atlıyor (politika tutarsızlığı + kota israfı) [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]

- `src/main.js:8793-8802` — `handleBrowserPageAction` `exclude` dalı `tab.pageTranslateJob` denetimi **yapmıyor**; `retry` dalı (:8804) denetliyor.
- `src/main.js:12506` — panel yolu `browser:page:exclusions` iş varken `{ ok:false, busy:true }` döndürüyor.
- Doğruluk korunuyor: `acceptsResult` (`:4633`) sonuçları `browserPageExcludedIds(session)` ile anlık süzüyor; hata listelemesi (:4762, :8836) dışlananları filtreliyor. Yani yanlış bloğa çeviri uygulanmıyor.

**Kalan gerçek etki:** iş koşarken sayfa içinden bölüm dışlanırsa o bölüme ait **zaten kuyrukta/uçuşta** bloklar için API çağrıları boşa harcanır (kota/maliyet); ve iki giriş noktası zıt davranır — panel "çeviri çalışırken dışlanamaz" derken sayfa üstündeki düğme sessizce kabul eder. Ayrıca sayfa yolu rescan yapmaz (paneldeki `pageBlockScanScript` yok) — davranış farkı bilinçliyse belgelenmeli.

**Öneri:** Ya sayfa-içi exclude'a da aynı `busy` reddi (kullanıcıya `pageActionResultScript` ile bildirim), ya —daha iyi— exclude'u kabul edip scheduler kuyruğundan o bölüm kimliklerini **çıkar** (bekleyen işi iptal edemiyorsa sonuç süzümü zaten var; ama kuyruğa hiç gitmemiş cümleleri iptal etmek kota tasarrufu sağlar). İki yol aynı politikayı paylaşmalı.

**Test:** aktif sayfa işi + sayfa-içi exclude → dışlanan blok için yeni API çağrısı yapılmadığını doğrula; panel/sayfa davranış eşitliği; exclude sonrası `page-translate-done` sayaçları.

---

## Rapor 25 bulgularının yeniden doğrulaması

| Bulgu | Durum | Kanıt |
|---|---|---|
| B1 retry kapsam genişlemesi | **Açık** | `browser-translation-scheduler.js:298-307` `retryFailed` hâlâ `completeTrack=true`; `main.js` `browser:network:setOnline` tüm sekmelere uyguluyor |
| B2 bfcache ölü gözlemciler | **Açık** | `browser-preload.js` `pagehide` tek-seferlik temizlik, `pageshow` re-init yok |
| B3 ikincil sekme tam ekran | **Açık** | `enter-html-full-screen` bounds yalnız aktif sekmeye |
| B4 ölü olaylar | **Açık (güçlendi)** | `load-retry`/`html-full-screen` renderer kapısından geçip **hiçbir** case'e düşmüyor (renderer.js:10779+ dispatch'te işleyici yok) |
| B5 varlık çifti atomik değil | **Açık** | `browser-asset-store.js` json→srt rename arası çökme bayat SRT bırakır |
| B6 Enter busy atlama | **Açık (kesinleşti)** | `browser-features.js:310-314` keydown busy denetimsiz; `call()` (:40-62) kendi içinde busy kontrolü **yok** → gerçek çift istek (semantic-search dakikalar sürebilir) |

## Gözlemler (bug değil, not edilmeli)

- **`unifiedLibrarySearch` (`browser-library-tools.js`):** sekme sonuçları `Date.now()` damgalı → 'all' kapsamında hep en üstte, diğer kaynakları limitten iter. Sıralama önceliği bilinçli mi?
- **`ceaUrlKey` (`browser-cea-captions.js`):** sorguyu tamamen atıyor → aynı pathname'i paylaşan rolling live playlist segmentlerinde yanlış matcher eşleşmesi riski.
- **`browser-session-store.js:252`:** `splitSecondaryTabId` ham `activeTabId` ile karşılaştırılıyor (normalize edilmişle değil) → bozuk `activeTabId` durumunda ikincil=aktif aynı sekme üretebilir; aşağı akış (`main.js:2379-2380, 11967-11969`) yeniden doğruladığı için kozmetik.
- **OpenSubtitles:** token istek başına yeniden login alıyor; oran sınırı dostu değil ama hata değil.
- **`hls-recovery.js`:** kaynak değişiminden sonra gelen bayat `playing` olayı `playbackStarted` ile uçuştaki kurtarma token'ını temizleyebilir → sınırlı ekstra deneme; `attempts` sayacıyla korumalı.

## Sağlam çıkan denetimler

- `normalizeBrowserUrl` (`main.js:3207-3237`): kimlik bilgisi, şema ve arama-sızıntısı koruması tam.
- `browser:navigate` (`:11193-11237`): her await sınırında `requestIsCurrent` kuşak kontrolü.
- `unloadBrowserTab` (`:11456-11503`): çift durum denetimi + capture-pending + seq koruması.
- `browserTabCapturePending` (`:10248-10263`): sekme-kapsamlı kuyruk ölçümü; pending yanıtlar TTL+adet sınırlı (`:9981-9987`).
- `browser-downloads.js`: trim/canPause/canResume muhasebesi, terminal kayıt ayrımı temiz.
- `hls-recovery.js` epoch/token/isCurrent modeli tutarlı; stability penceresi doğru.
- `browser-script-execution.js`, `browser-capture-recovery.js`, `browser-lifecycle-policy.js` (retry-after kelepçesi çağıran tarafta doğrulandı).

## Ayrıntılı bulgu, düzeltme, ret gerekçesi ve doğrulama dökümü

- B7: kayıt bulunmayan bütün izinler artık ask döndürüyor; açık Ask seçimi silinmek yerine kalıcı olarak ask yazılıyor. Fullscreen ve clipboard-sanitized-write için karar motoru/UI eşitliği test edildi.
- B8: sağlam yedek belleğe yüklendikten sonraki recovery flush hatası konstruktörden dışarı çıkmıyor. recoveryWriteError tanısı tutuluyor; sonraki başarılı yazım uyarıyı temizliyor.
- B9: index yeni revizyona atomik geçtiğinde aynı mantıksal kaydın eski JSON ve görünüm dosyaları yalnız doğrulanmış arşiv alt dizininde best-effort siliniyor. Üç revizyonda dosya sayısı iki olarak doğrulandı.
- B10: indirmelerin session kapsamlı olduğu kaynak ve indirme yöneticisiyle doğrulandı. Sekme boşaltmayı engellediği izlenimi veren hiç yazılmayan downloadActive dalı kaldırıldı.
- B11: page exclusions handler çalışan sayfa çevirisi sırasında aynı busy politikasını uyguluyor; bekleyen işler varken sessiz politika değişimi yapılmıyor.
- Ret: Bu rapordaki beş numaralı bulgunun hiçbiri bütünüyle reddedilmedi; B10 davranış hatası yerine doğrulanmış ölü-kod/sözleşme tutarsızlığı olarak kapatıldı.
- Doğrulama: report-25-28-regressions, browser-note-store, browser-translation-archive ve izin testleri geçti.
- `acceptsResult` dinamik dışlama süzümü — sayfa-içi exclude'un doğruluğunu koruyan mekanizma.

## Eksik regresyon testleri (öncelikli)

1. `withBrowserPermission` 'ask' → karar eşlemesi (B7) — `browser-nine-features.test.js`'e.
2. `BrowserNoteStore` recovery-flush hatası (B8) — `browser-note-store.test.js`'e sahte-fs ile.
3. Arşiv yetim temizliği (B9) — `browser-translation-archive.test.js`'e revizyon + crash-injection.
4. `downloadActive`/unload koruma kararı (B10) — `browser-tab-resources.test.js`'e.
5. Sayfa-içi exclude iş-sırası davranışı (B11) — `browser-page-translation-main.test.js`'e.
6. `retryFailed` kapsamı (B1) — `browser-subtitle-retry.test.js`'e "yalnız hatalı kimlikler" beklentisi.
7. `browser-features` Enter/busy (B6) — renderer smoke'una çağrı sayısı doğrulaması.

## Önerilen sıra

B7 (izin modeli — sessiz grant) → B1 (kota israfı, bilinen kök) → B8 (özellik ölümü) → B9 (disk sızıntısı) → B2 (bfcache) → B4+B6 (küçük UX) → B3 (split tam ekran) → B5 → B10/B11 (temizlik/politika).
