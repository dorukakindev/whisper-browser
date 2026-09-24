# BROWSER_BUG_REPORT_84 — Önceki ayıklamanın kapsam düzeltmesi

Tarih: 2026-09-19 22:00 Europe/Istanbul. İncelenen dal `master`, başlangıç HEAD `20fd6e0ccde6e0f0cd8107ddae636b36d0f6e3e0`. Bu bir **salt-okunur bug triyajı**; ürün kodu değiştirilmedi. Rapor 81'in “15 doğrulanmış kök neden” listesi **bütün bulguların incelendiği anlamına gelmiyordu**. Özellikle R83'teki 39 maddenin yalnız beşi o listede vardı. Kullanıcının itirazı haklıdır.

## Karar sözlüğü ve sınır

- **D**: güncel kodda mekanizma ve sentetik girdiyle davranış doğrudan görüldü veya salt kaynakla kesin sonuç çıkıyor. Gerçek site/Electron kabulü ayrıca gerekebilir.
- **K**: mekanizma kodda var; kullanıcı etkisi belirli yarış, ağ, site veya zaman koşuluna bağlı. Düzeltmeden önce deterministik repro yazılmalı.
- **A**: çekirdek mekanizma olabilir ama raporun kapsam/sıklık/sonuç cümlesi abartılı ya da kısmen yanlış.
- **B**: bu turda bağımsız doğrulama yeterli değil. Bu, “yanlış” demek değildir.
- **M**: bakım, performans veya test borcu; kullanıcıya ulaşan bug diye otomatik yükseltilmemeli.
- **Ç**: güncel kodda önceki raporun konusu teslim edilmiş; gerçek servis kabulü ayrı.

Bu kararlar raporların kendi “doğrulandı” etiketlerinden bağımsızdır. Doğrudan kullanıcı verisi, API anahtarı, DRM oturumu ve canlı ücretli sağlayıcı kullanılmadı. Tam `npm test` veya Electron site-E2E bu salt triyajda çalıştırılmadı. Raporlar birbirini tekrar edebilir; satır sayısı benzersiz kök neden sayısı değildir.

## R83: 39 maddenin tek tek durumu

| Madde | Karar | Güncel kanıt ve diğer AI için sınır |
|---|---|---|
| B83-01 CEA checkpoint çiftlenmesi | D | `browser-cea-checkpoint.js` sunum/provenance alanını düşürüyor; `browser-subtitles.js` bunları dedupe anahtarında kullanıyor. Sentetik restore+yeniden segment merge iki cue verdi. |
| B83-02 kirli form yanlış pozitifi | D | `main.js` form probu dolu hidden/select alanlarını da işaretliyor. “Her form” genellemesi değil; önceden dolu ve kullanıcıca değişmiş ayrımını test et. |
| B83-03 userinfo open-link | D | `main.js` `browser:open-link` HTTP(S) URL'de userinfo'yu ayıklamadan `loadURL` ve `restoredUrl` yoluna veriyor. `loadURL` için will-navigate korumasına güvenilemez. Gerçek Basic-auth isteği ayrıca sınanmadı. |
| B83-04 oynatma politikaları hiç tetiklenmiyor | A | `playback-policy.js` `naturalAdvance < 1` kapısı, ana polling 1000 ms. Ancak medya olayları ayrı render çağrıları yapıyor, poll jitter/0.8× hız da <1 olabilir. “Asla” yanlış; gerçek tetiklenme oranı ölçülmeli. |
| B83-05 AudioContext sızıntısı | K | `browser-media-controller.js` AudioContext'i media-source bağlamadan önce açıyor; o adım throw ederse graph olmadığı için catch kapatmıyor. “Her yeniden deneme” değil, istisna koşulu. |
| B83-06 dinamik blok apply kaybı | K | `main.js` kuşak kontrollerinde bekleyen apply atılabilir; iş devri yarışının zamanlaması için controllable Promise testi gerekli. |
| B83-07 negatif shift hayalet cue | D | `shiftCueTimeline([{start:3,end:5,text:'x'}],-8)` → `[0,0.001]`. Sıfır öncesi tamamen kalan cue düşmeli. |
| B83-08 subtitle fileId/fileName ayrışması | D | `browser-subtitle-search.js` `fileId` için ilk geçerli `files[]`, `fileName` için daima `[0]` kullanıyor. Çoklu dosyalı sentetik cevapla regresyon yaz. |
| B83-09 unloaded tab onayı | K | `browserTabProtectionReasons` `already_unloaded` üretmez, close yolu bunu kullanır; `browserTabUnloadDecision` ise ayrı olarak üretir. Raporun “kodda hiç üretilmiyor” alt anlamı yanlış. |
| B83-10 workflow null bağlam | D | `normalizeContext(null)` TypeError fırlatıyor; `play` ilk `getContext()` sonucu null olursa kontrollü stale hatası yerine bu hata gelir. |
| B83-11 cross-origin iframe Escape | B | Frame başına link-hint örneği var, fakat odak hangi frame'deyken Escape'in nereye gittiği Electron/DOM repro'su olmadan kesin değil. |
| B83-12 oynatma tanısı yinelenmesi | K | `browser-playback-diagnostics.js` 5 s dedupe, 8/12 s tekrar kapıları içeriyor. Gerçek fingerprint/evidence değişip değişmediğini fake-clock testiyle doğrula. |
| B83-13 session.blocks yetim ID | K | `main.js` `session.blocks` ekliyor; dinamik `index:hash` kimliği değişebilir. Eski ID'nin partial durumunu kilitlediği mutasyon repro'su gerekli. |
| B83-14 ref.originals bayatlığı | K | `browser-page-translate.js` metin mutasyonunda state güncelliyor; referans kopyası eski kalıyor. Restore'un site metnini ezdiği DOM testi gerekli. |
| B83-15 yinelenen cue ID | D | Sentetik iki farklı zamanlı aynı `cue.id` için `assembleCueSentences` aynı sentence ID üretti; Map sonuç anahtarı çarpışıyor. Cue ID girişinde uniqueness savunması gerek. |
| B83-16 exclusions rescan çift iş | K | Observer ve bridge event ayrı yollar; eşzamanlı dönüş sırası için bariyerli test şart. |
| B83-17 manga kopan frame | K | `browser-manga.js` null bölge üstünden `dataset` okuyabilir; frame'in kaldırıldığı DOM repro'su gerekli. |
| B83-18 annotation unsave no-op | K | Belirsiz eşleşmede helper null dönebilir; fallback ID silme başarısız olabilir. Aynı alıntılı iki not fixture'ı ile davranış doğrulanmalı. |
| B83-19 arşiv URL sırrı | D | `canonicalPageUrl('https://example.test/?hdnts=SYNTHETIC_SECRET&x=1')` sırrı korudu. R81'deki P1 de budur. |
| B83-20 medya URL userinfo | D | `persistentBrowserMediaUrl('https://user:pass@example.test/watch?x=1')` userinfo'yu korudu. |
| B83-21 exclusions await bayatlığı | K | `main.js` üç await sonrası oturum/kuşak kontrolü olmadan devam ediyor. Gezinme sırasında kontrollü gecikme testi gerekli. |
| B83-22 translation scan bayat işi | K | Başlangıç scan await'i sonrası iş yaratma koşulu yeniden denetlenmiyor. Promise yarışıyla repro gerekli. |
| B83-23 loadRetryTimer sonraki gezinme | K | Timer callback id/view kontrol ediyor, navigasyon kuşağını değil; bazı did-stop yolları timer temizler. Tam zamanlama belirleyici. |
| B83-24 locale site/kullanıcı başlığı | K | `ui-locale.js` selector muafiyetleri eksik görünüyor. Gerçek DOM başlığının sözlükteki ifadeyle çakıştığı fixture ve EN/TR round-trip gerekli. |
| B83-25 Türkçe timeline normalizasyonu | D | `normalizeTimelineText('GİDİYORUM')` → `gi di yorum`; token iskeleti kırılıyor. Kalibrasyonun tamamının başarısız olduğu iddiası ayrıca ölçülmeli. |
| B83-26 bayat Sponsor Skip | K | Segment bitiş/seek'te `pendingAction` temizliği açık değil. Süre dolmadan seek senaryosunu deterministik test et. |
| B83-27 GC referans eksikliği | D | `main.js` sweep'e yalnız SQLite track yollarını veriyor; session/workspace refs dahil değil, `asset-store` >30 günlük yetim görünenleri siliyor. R81'deki bulgu. |
| B83-28 tab.loading ölü guard | D | Main tab nesnesinde `loading` set eden yol bulunmadı; `browserTabProtectionReasons` buna bakıyor. “Hedef URL mutlaka kaybolur” sonucu ayrıca unload senaryosunda sınanmalı. |
| B83-29 abort unload capture kapalı | K | `unloadBrowserTab` capture'ı kapatıp finalCheck başarısızsa re-enable olmadan dönebilir. Fake tab/state testi gerekli. |
| B83-30 restoring stuck | K | `restore_failed` okuyan kod var; yazan yol bulunmadı. Hata/timeout üzerinden yaşam-döngüsü repro'su gerekli. |
| B83-31 onResult exception | D | Scheduler sonuç Map'ine yazıp callback'i aynı Promise `.then` içinde çağırıyor; callback throw'u `.catch` provider failure yoluna düşer ve callback yeniden çağrılır. Throwing-callback testi gerek. |
| B83-32 whenIdle .catch yok | D | Dinamik blok devamında `void scheduler.whenIdle().then(...)` rejection handler yok; kardeş yolda var. Hatanın hangi kullanıcı akışında oluştuğu ayrı. |
| B83-33 workspace mutlak yol | D | `workspace-package.js` bundle içine ham `sourceRoot` ve mappings koyuyor. R81'deki bulgu. |
| B83-34 .bak silinen veri | K | Yazmadan önce `.bak` eski veriyi tutabiliyor. Bunun gizlilik bug'ı sayılması “sil” sözleşmesine bağlı; recovery ile silme semantiği birlikte test edilmeli. |
| B83-35 HTTP auth cache | B | `clearSite` akışında `clearAuthCache` yok; Electron `clearData`/oturum davranışı ve site-kapsamı canlı test edilmeden “kimlik kesin sağ çıkar” denemez. |
| B83-36 CP1254 gerçek metni bozuyor | D | `decodeSubtitleBuffer(Buffer.from('það er þýtt orð þýðing þörf','utf8'))` → `şağ er şıtt orğ şığing şörf`. Çok dilli altyazı kaybı gerçek. |
| B83-37 mojibake marker eksik | A | Marker kümesi farkı var; `ÅŞimdi eve git.` gibi geçerli metni “onarılması gereken bozuk dosya” saymak kanıt değil. Ham bozuk-byte fixture olmadan kullanıcı bug'ı diye verilmeyecek. |
| B83-38 EN UI'da TR sayı/tarih | D | Renderer'da sabit `toLocaleString('tr-TR')`/`toLocaleDateString('tr-TR')` kullanıcı-görünür yollar var. Yerel ayar bağlamına göre format bekleniyor. |
| B83-39 hidden preview CSS | D | `.browser-page-preview-panel {display:grid}` yazar kuralı `[hidden]` görünürlüğünü bastırıyor; rapordaki Chromium repro'su da var. Explicit `[hidden]{display:none}` regresyonu gerekli. |

R83 sonucu: **39/39 için ayrı karar verildi**. Üstteki tekil satırlar kanoniktir; D, gerçek-site kabulü demek değildir. Diğer AI'ya yalnız D satırlarını “hemen düzelt” demek de doğru olmaz: özellikle güvenlik/gizlilikte kalıcılık kapsamı ve eski davranış fixture'ları korunmalı.

## Önceki raporlardaki maddelerin envanteri (R81'de öne çıkarılmayanlar dahil)

| Rapor | Tekil madde kümeleri | Bu turdaki durum |
|---|---|---|
| R76 | V1–V3 smoke, T1–T3 hijyen | **B/M.** Flaky altyapı iddiası tarihsel koşulara dayalı; güncel Electron smoke yeniden koşulmadı. T maddeleri test kalitesi. |
| R76 | K1, K2 | K1 **A/K**: 4000+ URL'nin atılması güvenlik sınırı olabilir; ürün sözleşmesi gerekir. K2 **D**: 25 sekme sentetik repro'da 24. sekme kaybı önceki turda görüldü. |
| R76 | F1–F8 | F1/F2 tek kök **D**, F3 **D**, F4 **D** (aynı Unicode sorgusu başarısız iddiası yanlış); F5/F6 **K**, F7/F8 **B/K**. R81 ayrıntılı ilk dört kanıtı içeriyor. |
| R76 | SL1–SL5 | **M**, SL2 sahte telemetri gerçek ama doğrudan veri kaybı değil. SL5 depo artığı; kullanıcıya ulaşan bug diye yollama. |
| R76 | S1/S2 cue merge | **K**: kod mantığı aday; bugünkü CEA checkpoint ve farklı metinli aynı ID akışlarıyla çakışma matrisi testi olmadan bağımsız kök neden sayma. |
| R76 | PF1/PF1b/PF1c/PF2/PF2b/PF3 | **M/K**: raporda ampirik 20k-cue sentetik benchmark var; bugünkü makinede tekrar ölçülmedi. PF3 negatif sonuçtur. Performans değişikliği öncesi/sonrası aynı fixture şart. |
| R77 | A1–A3 izin/EME | **B**: kaynak uyumsuzluğu işaretleri var ama Electron sürümü üzerinde izin/DRM davranışı koşulmadı. P0 diye devretme. |
| R77 | B1–B3 | B1 **D** ve R78-04'le aynı aşırı URL redaksiyonu; B2 **D** sentetik eşit-bölüm sıra tersliği; B3 **B** off-mode navigasyon testi gerek. |
| R77 | C1–C4, D1–D4 | C2 **M/D** sahte telemetri; C1/C3/C4 ve düşük D maddeleri bu turda **B**. Kopya/kozmetik maddeleri güvenlik bug'ıyla eşitleme. |
| R78 | R78-01–04 | **D**; URL sır eksikleri, path-session, named entity, aşırı redaksiyon. R81'de kanıt/fixture var. |
| R78 | R78-05–08 | 05/06 **M**, 07 **B** (`backgroundFetch` Electron kabulü), 08 **M** nits. `sanitizePlaces` zoom siliniyor eski alt iddiası güncel kodda yanlış. |
| R79/R80 | SmartTube toplam dokuz bulgu | **Ç**: `59174a7`, `801e75f`, `856c0c2` teslim edilmiş. Gerçek YouTube hesabı/servis uçtan uca testi ayrı açık. |
| PROGRAM R79 | P79-01–04 | **M/K**: normalize/benzerlik/DP/model yükleme pahalı yollar mevcut; rapordaki süreler bu HEAD'de bağımsız ölçülmedi. Kalite kapısını performans için gevşetme. |
| PROGRAM R80 | B80-01, B80-02 | 01 **D** settings yedeğinde URL-sırrı; 02 **K** stderr pipe/stdout sınırı, normal ffmpeg çağrısında kilit kanıtlanmadı. R81 ayrıntılı. |
| PROGRAM R81 | D81-01–05, SL1–SL5 | D81-01 **K** i18n boşluğu, kesin “262 kullanıcı metni” sayı iddiası yeniden sayılmalı; D81-02/04 negatif/kapsam sonucu, D81-03 performans tekrarı, D81-05 localStorage **B**; SL bakım kümesi. |
| PROGRAM R82 | B82-01 | **D** Invidious parola `argv` içinde; R81 kanıtı. |

## Diğer AI'ya net devir

R81'deki 15 öncelikli madde **geçerli bir ilk parti**, ama tam liste değildir. Ona ek olarak doğrudan kanıtı olan ve önceki listede atlananlar: **R76 K2, R77 B2, B83-02/03/07/08/10/15/25/28/31/32/36/38/39**. Bunların her biri için kırmızı regresyon testi yaz; sonra minimal düzelt, ilgili kullanıcı akışı ve kalıcılık kapsamını kontrol et. Koşullu R83 maddelerini tek seferde “düzeltildi” diye kapatma; önce raporda belirtilen kontrollü yarış/DOM/Electron yeniden üretimini ekle. R83-04/37 ifadelerini aynen kabul etme. R77 A1–A3 ve B83-11/35 için gerçek Electron olay kanıtı gerekir. Yeni rapor veya eşzamanlı commit geldiyse tekrar HEAD karşılaştırması yap.

Bu belge **kod düzeltmesi değildir**; gerçek site, sağlayıcı, hesap, GPU/DRM ve Electron E2E sonucu iddia etmez.
