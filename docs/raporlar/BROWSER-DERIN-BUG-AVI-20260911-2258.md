# BROWSER-DERIN-BUG-AVI — Derin Hata Avı Raporu

## A. Çalışma Kimliği

- **HEAD (başlangıç ve bitiş aynı):** `5b000caa35b992a0edc9a3b55ccf1b3212c4ac7e` — dal `master`
- **Git durumu:** başlangıç ve bitişte aynı; yalnızca takipsiz (untracked) dosyalar: önceki rapor .md dosyaları ve `scratch/`. Kaynak/test/üretim dosyasına dokunulmadı; commit/reset/stash yapılmadı.
- **Runtime:** Node v25.6.1 (Windows), Electron paketli testler proje sürümüyle.
- **Sentetik ortam:** tüm kanıtlar `scratch/bug-hunt-20260911-2251/` altında; geçici dosyalar `os.tmpdir()` altında oluşturulup silindi; gerçek userData/çerez/anahtar/medya okunmadı; ücretli API çağrısı yapılmadı.
- **Çalıştırılan testler ve exit code'ları:**
  - `node tests/run-all.js` → exit 0, "Tüm testler geçti"
  - `npm run test:electron-bridge` → geçti (aynı gün, Rapor 23 turunda)
  - `node tests/electron-browser-experience-smoke.js`, `electron-browser-subtitle-smoke.js`, `electron-subtitle-output-smoke.js` → geçti (aynı gün)
  - `node tests/electron-renderer-smoke.js 9333` (uygulama `--remote-debugging-port=9333` ile) → geçti (aynı gün)
  - `scratch/bug-hunt-20260911-2251/evidence.js` → exit 1 (2 doğrulanmış bulgu; içindeki t05-b/t06-c test-kurulum hataları evidence2.js'de düzeltildi)
  - `scratch/bug-hunt-20260911-2251/evidence2.js` → exit 1 (1 doğrulanmış bulgu: t05-c)

## B. 20 Görev Kapsam Matrisi

"İ" = kaynak incelendi, "Ç" = yeni testle çalıştırıldı. Aynı gün önceki turların (Rapor 22/23/24) bulguları 349-355 olarak kapatılmıştır; burada tekrar sayılmaz.

| # | Görev | Durum | İncelenen/denenen | Test | Sonuç |
|---|---|---|---|---|---|
| 1 | Çapraz sekme / geç gelen sonuç izolasyonu | İ | generation kapıları, `isCurrentBrowserContext`, `BrowserTabEventGate`, `browserEventMatches`, her await sonrası bağlam denetimi (captureHls, pageTranslate, manga yolları) | mevcut: browser-navigation-abort, browser-library-anchor-race | Yeni hata gözlenmedi |
| 2 | NDJSON + kuyruk durum makinesi | İ+Ç | done/error/exit sıraları, newlinesız son satır, parçalanan satır, cancel→pending, late-done | `evidence.js` t02 a-f | Ürün kusuru yok; t02-b savunmacı (bkz. E) |
| 3 | Yakalama kuyruğu ACK/RELEASE yarışları | İ | ack/release/reset betikleri, `pruneBrowserCaptureCandidates` LRU+TTL, pending yanıtların süresi/adet budaması | mevcut: browser-capture-queue | Yeni hata gözlenmedi; tam durum-uzayı taraması yapılmadı (sınır) |
| 4 | Çok aşamalı çeviri cache tutarlılığı | İ | `translationCacheKey` bağlam materyali, `reconcileSentences` JSON karşılaştırması, `translateShared` tüketici sayacı, page-cache bağlam anahtarları | mevcut: browser-translation-*, audit-tur5 | Yeni hata gözlenmedi |
| 5 | Altyazı kodlama matrisi | Ç | UTF-8 BOM ±, UTF-16 LE/BE, cp1254 az/çok Türkçe, lead+noktalama çifti, hazır U+FFFD | `evidence2.js` t05 a-e | **BULGU B-1** |
| 6 | Medya kimliği kesme/sınır | Ç | 2000/16382/16384/16409 birim, emoji tam sınırdan, aynı önek | `evidence2.js` t06 a-c | **BULGU B-2** |
| 7 | fMP4 zamanlaması | İ | mp4Boxes/tfhd/tfdt/trex/trun ayrıştırıcıları, çok traf/moof, boş sample, kesik kutu dalları | mevcut: browser-track-kind, mp4 testleri (npm test) | Yeni hata gözlenmedi; sentetik kutu matrisi üretilmedi (sınır) |
| 8 | HLS canlı pencere/byte-range | İ | `parseHlsSegments` tüm dallar, `captureHlsSubtitlePlaylist` zaman çizelgesi hizalama, MPEGTS sarması, EXT-X-MAP devamlılığı | mevcut: browser-subtitles.test (63) | Yeni sınır kusuru yok; bilinen açık Y-1 (discontinuity+byte-range, Rapor-2026-09-11'den) aynen duruyor — yeni sayılmadı |
| 9 | DASH hiyerarşisi | İ | `dashOuterBase` Period/AdaptationSet kapsamı, çok Representation, SegmentTemplate mirası, URL tekilleştirme | mevcut: manifest-processing, browser-subtitles.test | Yeni hata gözlenmedi |
| 10 | İçe aktar→düzenle→dışa aktar kayıpsızlık | İ+Ç | SRT/VTT/ASS/TTML/srv3/json3 ayrıştırıcıları; cue kimliği, speaker, NOTE/STYLE blokları, ASS override/drawing | mevcut: subtitle-format, subtitle-parser-fuzz (52.000 vaka), export testleri | Yeni hata gözlenmedi; yeni roundtrip senaryosu üretilmedi (sınır) |
| 11 | Kelime/cümle yerleştirme | İ | `distributeTranslation` CJK grapheme yolu, az kelime birleştirme, `fitTranslationParts`, yan-dosya fallback'i | mevcut: subtitle-sentence-layout, subtitle-word-highlight | Yeni hata gözlenmedi |
| 12 | Atomik çıktı/burn-in | Ç | rename zinciri, mevcut hedef, hata enjeksiyonu (temp→out rename patlat), yedek geri yükleme | `evidence.js` t12 a-b | Hata yok: eski çıktı korunuyor |
| 13 | Ayar transaction kurtarma | İ | `writeJsonTransaction`/`recoverJsonTransaction`, output journal kurtarma, kuyruk kaydı, gizli ayar filtreleri | mevcut: settings-security.test (17), settings-persistence, queue testleri | Yeni hata gözlenmedi; sentetik profilde çökme matrisi üretilmedi (sınır) |
| 14 | IPC/frame yetkisi | İ+Ç | preload whitelist, `authorizedBrowserSender`, gezinme koruması, trusted-bridge token, izin kararları | mevcut: adversarial-ipc (11), popup-auth-protocol-security, preload-sandbox | Yeni hata gözlenmedi |
| 15 | Sayfa çevirisi DOM değişimi | İ | restore/distribute/insertAfterRoot, önizleme geri alma, latestIdByRoot bayat damgası, sessionStorage belleği | mevcut: browser-page-translate.test, page-translation-main | Yeni hata gözlenmedi (355 dışında — Rapor 23'te kayıtlı); canlı DOM mutasyon testi yapılmadı (sınır) |
| 16 | Manga bölge kimliği/birleştirme | İ+Ç | yuvarlama-ikiz birleştirme, regionId tuz, edit geçmişi | `verify_fixes_22.js` (önceki tur) + browser-manga.test (91) | Yeni hata gözlenmedi |
| 17 | Medya seçimi/reklam/senkron | İ | aday sıralaması, reklam sessize alma/atlama, SponsorBlock doğrulama/kırpma, iki nokta senkron | mevcut: browser-media*, sponsorblock (10), subtitle-sync | Yeni hata gözlenmedi |
| 18 | PDF okuyucu | İ | `textItemsToLines` satır/sütun, `mergePdfLines` paragraf, marjinal tekrar filtresi, durum kimliği | mevcut: pdf-translate.test, pdf-file-access | Yeni hata gözlenmedi; sentetik çok sayfalı PDF üretilmedi (sınır); F-1 notu |
| 19 | Oturum/site tercih limitleri | İ+Ç | sekme/zoom/profil/izin sınırları, limitte ekleme-güncelleme, tahliye stratejisi | `verify_fixes_22.js` (önceki tur) + settings/permissions testleri | Yeni hata gözlenmedi |
| 20 | Kaynak büyümesi/kapanış | İ | Map/Set budama (trimInsertionCollection), timer unref, kapanışta flush sırası, tek-yazar kilidi | mevcut: resource-soak testi (npm test kapsamında) | Yeni hata gözlenmedi; yeni 10k döngü ölçümü yapılmadı (sınır) |

## C. Doğrulanmış Bulgular

### B-1 — 349 düzeltmesi az-Türkçe'li gerçek cp1254 dosyaları sessizçe bozuyor (P2)

- **Kaynak konumu:** `src/browser-textutil.js` `decodeSubtitleBuffer`, 349 düzeltmesinin multibyte/FFFD eşiği (mevcut kaynakta `hasUtf8Multibyte` + `replacementCount <= Math.max(2, …)` dalı).
- **Erişilebilir zincir:** yerel altyazı dosyası açma (`src/main.js` loadSubtitle yolları, `decodeSubtitleBuffer(fs.readFileSync(...))`) ve ağdan yakalanan altyazı (`fetchBrowserText`, main.js:6207 vd.) — üretimdeki her altyazı yükleme yolu.
- **En küçük yeniden üretim:** cp1254 kodlu `"Ç…ok güzel"` satırı. Baytlar: `C7 85 6F 6B 20 67 FC 7A 65 6C` (`Ç`=0xC7, `…`=0x85, `ü`=0xFC).
- **Beklenen:** `"Ç…ok güzel"` (cp1254 çözümü; 349 öncesi ve 349 düzeltmesi de 3+ geçersiz baytlı dosyalarda bunu veriyor).
- **Gerçekleşen:** `"ǅok gzel"`, not=`utf-8 bozuk bayt atlandı`. `C7 85` çifti geçerli UTF-8 iki baytlı dizilim (`ǅ`, U+01C5) gibi göründüğünden `hasUtf8Multibyte=true` oluyor; tek `FFFD` (ü) eşiğin altında kalıyor; sonuç cp1254'e hiç düşmeden "bozuk bayt atlandı" yoluyla **ü sessizce siliniyor** ve `Ç…` yanlış harfe dönüşüyor.
- **Kanıt:** `node scratch/bug-hunt-20260911-2251/evidence2.js` → `BULGU t05-c` satırı; betik exit 1.
- **Negatif kontroller:** t05-a (geçerli UTF-8 + tek bozuk bayt korunuyor — düzeltmenin amaçlanan davranışı sağlam), t05-b (çok Türkçe'li cp1254 doğru çözülüyor), t05-e (3+ geçersiz bayt cp1254 yoluna düşüyor).
- **Kullanıcı etkisi:** az sayıda Türkçe karakter içeren (≈ ≤2 geçersiz bayt) gerçek cp1254 altyazı dosyalarında kekeme vurgusu (`Ç…ok`), tire/noktalama bitişikliği (`Ö–`, `Ü—`, tırnak) gibi yaygın yazımlarda harfler sessizce kaybolur, büyük harf+noktalama yanlış glife döner; kullanıcıya "onarıldı" bilgisi verilmez.
- **Testlerin kaçırdığı neden:** 349 için eklenen testler tek bozuk baytlı UTF-8 ve çok geçersiz baytlı cp1254 uçlarını kapsıyor; "cp1254 + tesadüfen geçerli UTF-8 çifti + az FFFD" ara bölgesi kapsanmıyor. `browser-textutil` için doğrudan test dosyası hâlâ yok.
- **Önceki raporla ilişkisi:** 349 düzeltmesinin (Rapor 22, commit 5b000ca) **regresyon penceresi** — "tek örneği düzeltmek başka kodlamaları kanıtlamaz" uyarısının somut hâli.

### B-2 — Medya kimliği 16384 kesmesi sürüyor: 16 KB üstü aynı-önek URL'ler aynı kimliğe çarpışıyor (P3)

- **Kaynak konumu:** `src/browser-media-identity.js` `normalizeBrowserUrl` — `url.href.slice(0, 16384)` (351 düzeltmesi sınırı 2048'den 16384'e taşınmıştı).
- **Erişilebilir zincir:** herhangi bir uzun URL'li web videosu açıldığında `canonicalMediaIdentity` → mediaId → izleme geçmişi, öğrenme kartları, çeviri cache'i ve oturum sekme kimliği.
- **En küçük yeniden üretim:** `https://ornek.test/izle?kimlik=` + 16400 `a` + farklı sonek (`AAAA`/`BBBB`).
- **Beklenen:** farklı URL'ler farklı `web:url:<hash>` kimliği.
- **Gerçekleşen:** iki farklı URL aynı `web:url:88e0524b0eeee3e024321b46` kimliğini alıyor; sonek kesmeden sonra kayboluyor.
- **Kanıt:** `node scratch/bug-hunt-20260911-2251/evidence2.js` → `OK t06-a` satırı (kasıtlı çarpışma doğrulaması; başlıkta "kesme sürüyor").
- **Negatif kontroller:** t06-b (emoji tam 16383–16384 sınırında: kimlikler AYRIŞIYOR — kesim tam sınırda bozulmuyor, yalnız üstü çarpışıyor), t06-c (kısa URL'ler ayrışıyor).
- **Kullanıcı etkisi:** 16 KB üstü URL'ler pratikte nadir olsa da, takip parametreli/uzun imzalı yayın URL'lerinde iki farklı video aynı izleme kaydına/öğrenme verisine birleşir; çeviri önbelleği yanlış içerikle paylaşılır.
- **Testlerin kaçırdığı neden:** 351 için eklenen test 2100 karakterlik URL ile sınırın altını sınıyor; üst sınır (16385+) sınanmıyor.
- **Önceki raporla ilişkisi:** 351'in kalan riski — "sınırı taşımak tüm uzun girdiler için kanıt değildir" uyarısının doğrulanması.

## D. Uygulama Planı (kod yazılmadan)

### B-1 için
- **Değişecek işlev:** `src/browser-textutil.js` `decodeSubtitleBuffer` — cp1254 karar dalı.
- **Korunacak invariant:** geçerli UTF-8 metin bütünüyle korunmalı (t05-a), gerçek cp1254 her karakter sayısında doğru çözülmeli (t05-b/c/e).
- **Önerilen en küçük çözüm:** "geçerli UTF-8 çok baytlu dizilim" kanıtını, FFFD olmayan **tek bir çiftin** varlığından daha güçlü hale getir: cp1254 yoluna geçişi, `replacementCount` yerine **karşılaştırmalı çözüm** ile karar ver — tamponu her iki kodlamayla çöz, FFFD sayısı **ve** geçerli çok baytlı dizilimlerin oranını karşılaştır; ayrıca kesin bölgede (≤2 FFFD ama çok baytlu dizilim sayısı az, örn. ≤2 çift) cp1254 çözümünde Türkçe karakter (`ğşıİĞŞçöü`) çıkışı varsa cp1254'ü seç. Mevcut eşiği eşitlik yerine kesin FFFD üstünlüğüne bağla.
- **Alternatif (tercih edilmedi):** eşiği 0'a çekmek — geçerli UTF-8 + gerçekten tek bozuk bayt senaryosunu (349'nun asıl bulgusu) tekrar bozar.
- **Sözleşme etkisi:** yok (yalnız iç karar, imza değişmiyor).
- **Uyumluluk:** `note` alan değerleri aynen kalırsa UI etkisi yok.
- **Kalıcı regresyon testleri:** (a) t05-c senaryosu — `C7 85 6F 6B 20 67 FC 7A 65 6C` → `"Ç…ok güzel"`; (b) t05-a; (c) t05-b; (d) `Ö–`/`Ü—`/`İ'` çift varyantları; hepsi `tests/browser-textutil.test.js` adlı yeni dosyaya.
- **Kabul ölçütleri:** `node scratch/bug-hunt-20260911-2251/evidence2.js` exit 0 (t05-c düzelmiş) + `npm test` yeşil.
- **Regresyon riski:** 349'nun asıl senaryosunun (tek bozuk baytlı UTF-8) bozulması — t05-a bunu kaplar.

### B-2 için
- **Değişecek işlev:** `src/browser-media-identity.js` `normalizeBrowserUrl`.
- **Korunacak invariant:** farklı URL → farklı kimlik (kimlik çarpışması olmamalı).
- **Önerilen en küçük çözüm:** kimlik hash'ini (`stableUrlHash`) **tam href** üzerinden hesapla; 16384 kesmesini yalnızca **depolama alanına** (oturumda tutulan `canonicalUrl` gibi) uygula. Bu, tüm uzunluklarda çarpışmayı kaldırır.
- **Alternatif (tercih edilmedi):** sınırı yine yükseltmek — aynı hatanın ertelenmesi; URL uzunluğu reddi — uzun URL'li gerçek videolar açılamaz.
- **Sözleşme etkisi:** `canonicalMediaIdentity().key` değerleri aynı URL için değişebilir (hash materyali değişiyor) → izleme geçmişi/önbellek anahtar göçü. Göç: eski anahtarı (kesilmiş href hash'i) okuma sırasında ikincil anahtar olarak dene.
- **Kalıcı test:** 16409 karakterlik aynı-önek iki URL → farklı `key`.
- **Kabul:** `evidence2.js` t06-a kontrolü tersine döner + `npm test` yeşil.
- **Regresyon riski:** mevcut kullanıcıların izleme geçmişi kimlik göçü — yukarıdaki ikincil anahtar göçüyle sınırlanır.

## E. Doğrulanmayan İddialar / Reddedilenler

1. **done→exit(0) kuyruk hatası kirliliği** (`queue-persistence.js` `updateQueueSnapshotTerminal`): done sonrası exit olayı `item.error="Bilinmeyen hata"` yazıyor (evidence.js t02-b, kasıtlı). **Reddedildi — üretimde erişilemez:** main.js'te `acceptTerminalEvent`/`lifecycle.acceptTerminal` yaşam döngüsü kapısı iş başına terminal olayı yalnızca bir kez kabul ediyor; close'taki sentetik terminal yalnız terminal görülmediğinde üretiliyor. Savunmacı sağlamlaştırma önerisi: fonksiyon `event.type==='exit'` dalında `item.status==='done'` iken `item.error` yazmamalı.
2. **"Ã/Ð/Ý" doğal karakterli UTF-8 dosyaların yanlış çözümü:** cp1254 ile çift kodlama ayrımı bilgi-teorik olarak belirsiz; mevcut marker-azalması kriteri makul. Kusur kanıtı yok.
3. **16384 tam sınırında emoji bölünmesi (t06-b):** kanıtlanan tek şey aynı-önek çarpışması (B-2); tam sınırda kimlikler ayrışıyor, ayrı bir kusur yok.
4. **error→geç done sırası (t02-c):** sonucun nihai durumu ezmesi tasarım gereği makul (sonuç yetkilisi son terminal). Kusur sayılmadı.

## F. Opsiyonel Geliştirmeler (kusur değil)

1. `pdf-translate.js` `isStandalonePageNumber` roman-rakam deseni `[ivxlcdm]{1,12}` "milli", "cildim" gibi Türkçe sözcükleri marj bölgesinde sayfa numarası sanıp atabilir; marj filtresi yalnız üst/alt %7'de çalıştığından etki dar. Desene kelime-sınırı + en az bir rakal aralığı koşulu eklenebilir.
2. `publishBrowserTrackNow` 128 yayın tahliyesinde en eski `.srt` dosyası siliniyor; kalıcı veri asset store'da güvende ama uzun oturumda sekme içi iz seçiminde dosya-bulunamadı görülebilir (Rapor 24 gözlemi, aynen geçerli).
3. `flushBrowserTrackPublication`'daki `decision.state === "cancelled"` ölü dal (değerlendirici bu durumu üretmiyor).

## G. Uygulayıcıya İş Sırası

1. **Grup 1 (tek commit):** B-1 — `browser-textutil.js` karar dalı + yeni `tests/browser-textutil.test.js` (t05-a/b/c/d senaryoları). Kapı: `node scratch/bug-hunt-20260911-2251/evidence2.js` exit 0 + `npm test`.
2. **Grup 2 (ayrı commit, göç içerir):** B-2 — `browser-media-identity.js` hash kaynağı + ikincil anahtar göçü + uzun-URL testi. Kapı: `npm test` + oturum geri yükleme testleri (`settings-persistence`, `browser-session` yolları).
3. **Grup 3 (opsiyonel):** E-1 savunmacı sağlamlaştırma + F maddeleri; her biri ayrı küçük commit.
4. Bilinen açık Y-1 (HLS discontinuity+byte-range, Rapor-2026-09-11) bu raporun kapsamı dışında; uygulayıcı isteyerse B-1/B-2 sonrasında ayrıca ele almalı.

Kanıt betikleri: `scratch/bug-hunt-20260911-2251/evidence.js` (t02/t12 grupları + ilk t05/t06 koşusu), `scratch/bug-hunt-20260911-2251/evidence2.js` (düzeltilmiş t05/t06 matrisi). Üretim kodu, mevcut testler ve önceki raporlar değiştirilmedi.
