# Tarayıcı ve İzleme Modülleri — Hata İnceleme Raporu (01.09.2026)

> **Kapsam:** Gömülü tarayıcı (`src/main.js` tarayıcı bölümü, `src/browser-subtitles.js`, `src/browser-adapters.js`, `src/browser-drm.js`, `src/browser-media.js`, `src/preload.js`, `src/renderer/renderer.js` tarayıcı bölümleri) ve izleme katmanı (klasör izleme: `src/watch-folder.js` + `watch:*` IPC'leri; izleme kütüphanesi: `library:*` IPC'leri + renderer izleme/oynatıcı bölümleri).
> **Kural:** Kaynak kodlarda hiçbir değişiklik yapılmadı; yalnızca bu rapor dosyası oluşturuldu.
> **Yöntem:** İlgili tüm dosyalar satır satır okundu; her bulgu 2 aşamalı çapraz kontrolle doğrulandı (satır referansları güncel çalışma ağacına aittir, HEAD = 6f6361 "Add stoppable browser subtitle capture"). `node tests/run-all.js` çalıştırıldı: **84/84 test geçiyor** — yani aşağıdaki bulguların hiçbiri mevcut test kapsamında yakalanmıyor (test boşlukları Bölüm 4'te işaretlendi).

---

## 1. Önceki Raporun (docs/KOD_DENETIM_VE_BUG_RAPORU_2026.md) Browser/İzleme Bulgularının Güncel Durumu

31.08.2026 tarihli denetimden sonra bazı bulgular giderilmiş. Güncel kodda doğrulanan durum:

| Eski Bulgu | Durum | Kanıt (güncel kod) |
|---|---|---|
| P-8: Tarayıcı modunda klavye kısayolları yerel videoyu tetikliyordu | **Düzeltildi** | `renderer.js:7626-7640` — `workspaceMode === 'browser'` dalı artık `play-pause`/`seek-relative`/`mute`/`volume-relative` komutlarını `browserCommand` ile yolluyor |
| A-B döngüsü tarayıcı modunda çalışmıyordu | **Düzeltildi** | `renderer.js:3065-3070` — `renderBrowserCueAt` içinde B noktasında A'ya `browserCommand('seek')` ile dönüş var |
| B-4: srv3 `t` özniteliğinde 2 basamaklı ms kaybı | **Düzeltildi** | `browser-subtitles.js` (parseXml): `Math.round(t * 10 ** (3 - digitCount))` |
| B-3: `browserActiveCuesAt` tek cue döndürüyordu | **Düzeltildi** | `browser-subtitles.js:344+` — dizi döndürüyor, ikili arama + 64 geriye bakış |
| B-5: DRM host listesi eksikti | **Kısmen düzeltildi** | `browser-drm.js:12` — artık `disneyplus.com`, `primevideo.com`, `amazon.com`, `discoveryplus.com` de var |

---

## 2. Yeni ve Hâlâ Geçerli Bulgular

### 🔴 Yüksek Öncelik

#### Y-1: Klasör izleme — çıktısı silinen veya kuyruğu yarıda kalmış dosya ASLA yeniden işlenmez
* **Dosya:** `src/main.js:425-436` (tarama), `src/main.js:454-477` (`watch:start` başlangıç taraması)
* **Kök neden:** `scanWatchFolder`, çıktısı var olan dosya için `watchSeen.set(file, { queued: true })` yazıyor ve `queued` bayrağı görüldüğünde dosyayı sonsuza kadar atlıyor. `watch:stop`/`watch:start` döngüsü de çözüm değil: başlangıç taraması, `hasConfiguredWatchOutput` sonucuna bakmaksızın klasördeki **tüm** mevcut dosyaları `{ queued: true }` ile işaretliyor.
* **Etki:** (a) Kullanıcı bir `.srt` çıktısını silip yeniden transkripsiyon isterse klasör izleme o dosyayı bir daha hiç sıraya koymaz. (b) Uygulama, izleme açıkken yeniden başlatılırsa kuyrukta bekleyen (çıktısı henüz yazılmamış) dosyalar kaybolur ve başlangıç taraması onları da "işlendi" saydığı için **hiçbir zaman** işlenmezler. `watchSeen` yalnızca bellekte yaşadığı için yeniden başlatma mevcut yarım işleri geri getirmez.
* **Çözüm önerisi:** `queued` kararını her taramada çıktı varlığından türet (bkz. `hasConfiguredWatchOutput`); başlangıç taramasında "çıkışı olmayan dosyaları kuyruğa at / kullanıcıya sor" politikası ekle; izleme durumunu `userData/watch-state.json`'a kalıcılaştır.

#### Y-2: Yakalama döngüsü kilitlenme riski — `browserCaptureBusy` için zaman aşımı yok
* **Dosya:** `src/main.js:1618-1642`; sıfırlama yalnızca `src/main.js:2166-2169` ve `1653-1661`
* **Kök neden:** 900 ms'lik sayfa-yakalama zamanlayıcısı `browserCaptureBusy = true` yapıp `executeBrowserFrames(...)` sonucunu bekliyor; `executeJavaScript` hiç çözülmezse (ağır/askıda sayfa) `finally` bloğuna hiç ulaşılamaz ve busy sonsuza kadar true kalır. `did-navigate`'te çağrılan `resetBrowserCaptureState` (1087-1097) busy'yi sıfırlamıyor; tek kurtuluş kullanıcı Yakalama düğmesini kapat/aç yapması.
* **Ek:** `browserTrackTimer`'da (1603-1617) busy koruması hiç yok; ağır sayfada 2,6 sn'lik periyot aşılırsa üst üste binen probe'lar `textTrack.mode` geçişlerini (hidden → disabled geri yükleme) araya girebilir.
* **Çözüm önerisi:** `executeBrowserFrames`'ü `Promise.race([..., timeout(5s)])` ile sarmala; `resetBrowserCaptureState` içine `browserCaptureBusy = false` ekle; trackTimer'a da hafif bir busy bayrağı koy.

#### Y-3: Canlı HLS altyazı akışında her playlist güncellemesi TÜM segmentleri yeniden indiriyor
* **Dosya:** `src/main.js:1211+` (`captureHlsSubtitlePlaylist`), `src/main.js:1919-1921` (CDP yolu)
* **Kök neden:** Canlı yayında playlist gövdesi saniyeler içinde değişir; gövde parmak izi her değiştiğinde listedeki segmentlerin tamamı (1600'e kadar, 6'lı gruplar) yeniden `fetch` edilir — daha önce indirilen segment URL'leri hatırlanmaz. Ayrıca CDP yolu (`Network.loadingFinished` → `processBrowserCapturedPayload`) `browserCaptureBusy` korumasına tabi olmadığı için page-drain taramasıyla aynı anda birden fazla tam playlist taraması üst üste binebilir.
* **Etki:** VOD'da sorun yok (parmak izi aynı → tek işlem); canlı akışta ağ/CPU kullanımı kontrolsüz büyür, servis tarafında aşırı istek görünür.
* **Çözüm önerisi:** streamKey başına indirilen segment URL'lerini bir `Set`'te tut, yalnızca yeni segmentleri indir; playlist işlemesini tek uçuşla sınırla (in-flight guard).

### 🟠 Orta Öncelik

#### O-1: Media olayları ile komutların hedeflediği video farklı olabilir
* **Dosya:** `src/main.js:1646-1647` (media zamanlayıcısı) karşısında `src/main.js:2144` (komut yolu) ve `src/browser-media.js:6-19`
* **Kök neden:** Media durumu her 500 ms'de alan (`area`) sıralamasıyla **yalnızca** seçiliyor; kullanıcı komutları (Boşluk/J/L/seek) ise `rankBrowserMediaCandidates` ile (alan → oynayan → süre) seçiliyor. İki farklı sıralama politikası aynı sayfada birlikte kullanılıyor.
* **Etki:** Reklam/önizleme frame'i içeren sayfalarda göstergenin (konum, süre, altyazı senkronu) bağlı olduğu video ile komutların gittiği video ayrışabilir; altyazı yanlış videoya göre akar.
* **Çözüm önerisi:** `browserMediaProbeScript` alan + paused + süre döndürsün; seçim her iki yolda da `rankBrowserMediaCandidates` ile tek noktadan yapılsın (modül zaten bu amaçla yazılmış).

#### O-2: Overlay rAF döngüsü her karede tüm DOM'u tarıyor ve hiç durmuyor
* **Dosya:** `src/main.js:1689-1715`
* **Kök neden:** Döngü `window.__whisperBrowserSubLoop` bayrağıyla tek sefer kuruluyor (doğru) ama **her karede** `roots[i].querySelectorAll('*')` ile yeni shadow root avı yapıyor (1693-1696). `state.mode === 'off'` olduğunda bile kutu gizlenip döngü sürüyor (1700); tarayıcı çalışma alanından çıkılınca da sayfada çalışmaya devam ediyor.
* **Etki:** YouTube/Netflix gibi binlerce düğümlü sayfalarda kare başına O(n) tarama → sürekli CPU tüketimi; pil/ısı etkisi.
* **Çözüm önerisi:** Shadow root taramasını `MutationObserver`'a taşı; `mode: 'off'` ve `visibilitychange`/`document.hidden` durumlarında döngüyü duraklat.

#### O-3: textTrack probe her 2,6 sn'de tüm cue listesini köprüden taşıyor
* **Dosya:** `src/main.js:1387-1423` (probe) + `1603-1617` (poll), işleyiş `1131+` (`storeBrowserTrack`)
* **Kök neden:** Tam yüklenmiş uzun bir izde (20.000 cue'ya kadar) her periyotta cue dizisinin tamamı `executeJavaScript` dönüşü olarak serileştiriliyor. `storeBrowserTrack` parmak iziyle tekilleştirse de transfer maliyeti her tıkta ödeniyor.
* **Çözüm önerisi:** İz başına `cueCount + son cue hash` gönder; değişmemişse tam listeyi transfer etme (delta yaklaşımı).

#### O-4: `normalizeBrowserUrl` göreli/bozuk URL'yi sessizce Google aramasına çeviriyor
* **Dosya:** `src/main.js:1001-1023`; kullanım `src/main.js:1175-1177` (`fetchBrowserBuffer`)
* **Kök neden:** Şemasız ve alan-adı görünümünde olmayan her değer `https://www.google.com/search?q=...` oluyor; yakalama yolu bu işlevi fetch öncesi "güvenli URL" için kullanıyor. Sayfa-stratejisi yakalamasında göreli bir altyazı yolu bulunursa istek yanlış kaynağa gider.
* **Çözüm önerisi:** Yakalama yolunda göreli adresleri `new URL(url, pageUrl)` ile çöz; `normalizeBrowserUrl` yalnızca adres çubuğu girişinde kalsın.

#### O-5: `browserTrackStreamKey` segment normalizasyonu yetersiz
* **Dosya:** `src/main.js:1110-1129`
* **Kök neden:** Segment numarası yalnızca **dosya adındaki** sayıda değiştiriliyor (`(?=\.[^/]+$)`); `/1/en.vtt` gibi dizin segmentli şemalarda farklı segment URL'leri aynı akış anahtarına düşer ve farklı segment içerikleri tek buffer'da karışabilir (dedup yalnızca başlangıç+metin eşitliğine baktığından hatalı birleşme olası).
* **Çözüm önerisi:** Yol içindeki tüm bağımsız sayı segmentlerini normalleştir veya streamKey'e sorgu/sıra bilgisini ekle.

#### O-6: İzleme kütüphanesi yazımlarında yarış koşulu (last-write-wins)
* **Dosya:** `src/renderer/renderer.js:4706-4718` (`flushWatchState`)
* **Kök neden:** `flushWatchState` beklenmeden birden çok yerden çağrılıyor (`setMediaKey:6126`, kapanış:6611, periyodik:3397-3400/7413-7416, duraklatma:3378). İki çağrı üst üste binerse `library:upsert` yine de sırayla işlense de patch'ler **eski konumla** hesaplanmış olabilir; ayrıca `watchSession` paylaşımı yanlış süre toplamına yol açabilir.
* **Çözüm önerisi:** Flush çağrılarını tek bir sıralı kuyruğa (promise zinciri) bağla; patch'i flush anında değil, kuyruğa girme anında hesapla.

### 🟡 Düşük Öncelik / İyileştirme

#### D-1: Popup pencereleri yakalama ve tanılama kapsamı dışında
* `src/main.js:1025-1041` (`browserPopupWindowOptions`) — giriş pencereleri için bilinçli bir karar; ancak popup'ta açılan bir videonun altyazısı yakalanmaz ve diagnostics'a da düşmez. Kullanıcıya "bu pencerede yakalama yok" sinyali verilmeli.

#### D-2: `restoreWatchProfile` hız değerini seçenek listesiyle doğrulamadan yazıyor
* `src/renderer/renderer.js:4751` — tarayıcı hızları keyfi olabildiğinden `playerSpeed` seçeneği listede yoksa select boş görünür; buna karşılık media olayı yalnızca tam eşleşmede güncelliyor (`renderer.js:3358-3363`). İki davranış tutarsız.

#### D-3: İzlenme süresi ölçümü olay aralığına duyarlı
* `src/renderer/renderer.js:3366-3374` — `elapsed < 10 sn` şartı; ana süreç meşgulken (ağır transkripsiyon/polling) media olayları gecikirse izlenme süresi eksik sayılır. Eksiği duvar saatiyle (session başlangıcı vs. şu an) telafi etmek daha sağlam.

#### D-4: `watch:start` bir dosya yolunu da kabul ediyor
* `src/main.js:455` — yalnızca `fs.existsSync(dir)` denetleniyor; `statSync().isDirectory()` kontrolü yok. Dosya yolu geçirilirse izleme sessizce hiçbir şey yapmaz.

#### D-5: `storeBrowserTrack` ana thread'de `writeFileSync`
* `src/main.js:1131+` — her parmak izi değişiminde (canlı akışta sık) senkron dosya yazımı ana süreç olay döngüsünü bloklayabilir; `fs.promises` + değişim gecikmesi (debounce) önerilir.

#### D-6: `rememberBrowserVisit` başlık her güncellendiğinde senkron yazım
* `src/main.js:947+` — `page-title-updated` sık tetiklenen bir olaydır; `browser-places.json` her seferinde senkron yazılıyor. Debounce/kısa gecikme yeterli.

#### D-7: `showBrowserWorkspace` bounds hesaplanamazsa sessizce vazgeçiyor
* `src/renderer/renderer.js:3091-3093` — `browserSlotBounds()` null dönerse hiçbir geri bildirim yok; "Tarayıcı alanı açılamadı" mesajı yalnızca API hatasında gösteriliyor.

#### D-8: `hasConfiguredWatchOutput` langSuffix modunda her taramada `readdirSync`
* `src/watch-folder.js:55-59` — her 5 saniyede, her dosya için format sayısı kadar dizin listesi; klasörde binlerce dosya varsa gereksiz IO. Dizin listesi tarama başına bir kez önbelleğe alınabilir.

#### D-9: Media olayı, durum değişmese de her 500 ms'de tam durum yolluyor
* `src/main.js:1601+` — renderer tarafında fark hesabı yapılsa da IPC trafiği sürekli; durum imzası (zaman+paused) değişmedikçe göndermeyerek trafik azaltılabilir.

---

## 3. Geliştirme Önerileri

### Klasör izleme (izleme katmanı)
1. **Kalıcı izleme durumu:** `watchSeen`'i `userData/watch-state.json`'a yaz; uygulama açılışında yarım kalan işleri kurtar.
2. **Çıktı temelli karar:** "işlendi" bayrağını bellek yerine her taramada `hasConfiguredWatchOutput` sonucundan türet; çıktı silinince dosya otomatik yeniden aday olur.
3. **"Klasörü yeniden tara" düğmesi:** kullanıcı, çıkışları silip tüm klasörü zorla yeniden kuyruğa alabilmeli.
4. **Derinlik ayarı:** tek seviye tarama (2. seviye alt klasörler görünmüyor) isteğe bağlı derinliğe açılmalı.
5. **Hibrit izleme:** ağ/USB'de `fs.watch` güvenilmez olduğundan polling korunarak, tetikleme için `fs.watch` eklenip yeni dosyada ilk taramayı beklemeden ölçüm başlatılabilir.

### Gömülü tarayıcı (yakalama + overlay)
6. **Yakalama sağlamlığı:** `executeBrowserFrames`'e zaman aşımı; `resetBrowserCaptureState`'te busy sıfırlama; trackTimer için busy bayrağı (Y-2).
7. **HLS segment önbelleği:** streamKey başına indirilen segment URL seti; yalnızca yeni segmentler; playlist işleme tek uçuş (Y-3).
8. **Tek sıralama politikası:** media probe sonuçları `rankBrowserMediaCandidates` üzerinden değerlendirilsin (O-1).
9. **Overlay performansı:** shadow-DOM taraması MutationObserver'a; gizli/off durumunda döngü duraklatma (O-2).
10. **Delta textTrack aktarımı:** iz başına cueCount+hash ile değişim tespiti (O-3).
11. **URL çözümleme:** yakalama yolunda göreli adresler `pageUrl` tabanına çözülsün (O-4).
12. **Popup farkındalığı:** popup açılınca "bu pencerede yakalama yok" sinyali (D-1).

### Test boşlukları (yeni bulguların yakalanması için)
13. `tests/watch-folder.test.js`: queued bayrağının çıktı silinmesine tepkisi, başlangıç taraması politikası.
14. `tests/browser-media.test.js`: media zamanlayıcısının da `rankBrowserMediaCandidates` kullanmasına yönelik kaynak-düzey iddiası.
15. Yakalama döngüsü için zaman aşımı/in-flight davranışı testleri (saf yardımcıya çıkarılarak test edilebilir).

---

## 4. Sonuç

Tarayıcı ve izleme katmanındaki son dönem düzeltmeleri (klavye yönlendirme, tarayıcıda A-B döngüsü, srv3 ms ayrıştırması, aktif-cue dizisi) doğrulandı ve iyi durumda. Kalan riskler üç kümede toplanıyor: **(1) klasör izlemenin kalıcılıksız ve telafisiz "işlendi" modeli, (2) yakalama döngüsünde zaman aşımı/tek uçuş eksikliği, (3) overlay/probe döngülerinin sabit maliyetleri.** Rapor yalnızca gözlem içerir; hiçbir kaynak dosya değiştirilmemiştir.

*Rapor sonu — tüm bulgular güncel çalışma ağacında satır bazında doğrulanmıştır.*
