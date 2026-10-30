# Manga lifecycle audit — report only

HEAD `df94b3d60b7123a682cd0062371bbb2850a5fb60`. No product/test/docs/Git edits. 2 new P2 roots, 7 controlled scenarios; existing126 reviewed.

## MANGA-01 — OCR kaynağından yeniden çeviri boş metin gönderip [object Object] sonucunu başarıyla saklıyor

**severity**: P2

**sources**: src/main.js:8707, src/main.js:8805, src/main.js:6552, src/main.js:6644, src/main.js:6755, src/browser-manga.js:1010, src/main.js:15370

**reproduce**: PowerShell: $env:R815_MANGA_HEAD = git rev-parse HEAD; node .tmp/rem815-manga/probe.cjs. Scenarios MANGA-01-direct and MANGA-01-retrySelected use original callers, request wrapper, actual endpoint request/parser, actual subtitle-sentence-layout decoder, actual manga normalizer and generated overlay scripts. Only fetch/body reader/DOM execution/config/terminology/cache are controlled facades.

**expected**: Düzeltilen OCR kaynağı sentence.text olarak sağlayıcıya iletilir; dönen result.text bölge/cache/overlay metni olur.

**observed**: İki normal kullanıcı yolu {ok:true} döndü. Her ikisinde user JSON metin alanı boştu. Kontrollü yanıt fixture translated text olmasına rağmen [object Object] bölgeye, cache JSONuna ve overlay scriptine yazıldı. Doğru {text:corrected fixture} kontrolü kaynağı ve çeviriyi eksiksiz korudu.

**cause**: İki manga caller requestBrowserSentenceTranslation fonksiyonunu string→string varsayıyor; gerçek sözleşme {text,...}→{text,parts}. String giriş spread edilince sentence.text yok; sonuç nesnesi String(...) ile çevriliyor.

**impact**: Kullanıcının OCR kaynak düzeltmesinden yeniden çeviri akışı işlevsizleşir; doğru mevcut çeviri anlamsız metinle değiştirilip kalıcı cachee başarıyla kaydolur.

**prior**: R391 bu iki kullanıcı yolunu ekledi; kanıtı kaynak kilidi/normalizer idi, gerçek request-consumer sözleşmesini çalıştırmıyordu. R51-101 eski uzunluk farkı, R51-62/R56 eski edit rollback ve R597 credential izolasyonu farklı kökler. R815 önceki126 eşleme içinde manga kaydı yok. Night1000 manga dosyalarıyla doğrudan kaynak eşleşmesi0; F11/F15/F44/F49 komşu aileleri coverage.json içinde imzalarıyla korunur.

**limits**: Kontrollü fetch yanıtı; ağ/ücretli sağlayıcı, gerçek OCR modeli, doğal dil kalitesi veya Windows native UI doğrulanmadı. DOM çalıştırma sınırı facade; gerçek scriptin üretilen metni denetlendi. Bellek cache adapterı, gerçek kişisel disk/profil yok.

**acceptance**: Her iki UI caller için gerçek sentence request+parser zincirinde nonempty düzeltilmiş kaynak payloadı ve result.text uygulaması doğrulanmalı; nesne stringificationı başarı sayılmamalı; cache, bölge ve overlay aynı çeviriyi taşımalı.

## MANGA-02 — Manga kaynaktan yeniden çeviri işi temizlik/gezinme ve daha yeni düzenlemeden sonra eski sonucunu yazıyor

**severity**: P2

**sources**: src/main.js:8695, src/main.js:8707, src/main.js:8709, src/main.js:8719, src/main.js:8731, src/main.js:8007, src/main.js:15370, src/browser-manga.js:1010

**reproduce**: Aynı probe: MANGA-02-stop-navigation ve MANGA-02-newer-edit. Gerçek retranslateMangaRegionFromSource çağrısı kontrollü fetchte bekletilir. İlkinde gerçek stopBrowserManga(t,true) ardından generation/token değiştirilir, sonra yanıt açılır. İkincide gerçek applyMangaEditFromPage daha yeni kaynak/çeviriyi kabul ederken eski retranslate bekler; yanıt ardından açılır.

**expected**: İş stopBrowserManga kapsamına girer; belge/token/page veya bölge revizyonu değişmişse geç sonuç cache/overlay/state veya sonraki düzenlemeyi değiştiremez.

**observed**: Stop sonrası request signal.aborted=false. mangaPages boşken ve generation2 olmuşken eski yanıt ok:true verdi, eski page cache anahtarına yazdı, yeni sayfaya1 overlay-update scripti gönderdi, generation2de manga-edit ve ready olayları üretti. Ayrı senaryoda başarıyla kabul edilmiş newer manual source/translation sessizce eski corrected fixture/[object Object] ile ezildi. Normal mangaJob kontrolünde stop sinyali abort etti ve mangaJobIsCurrent=false oldu. Yanlış bridge token ağ öncesi reddedildi.

**cause**: Bu yeni köprü rotası mangaJoba kaydedilmeyen yerel AbortController yaratır. Awaitten sonra generation/bridgeToken/page kimliği ve bölgenin kaynak/revizyon kontrolü yoktur; yakalanmış page nesnesine yazar ve güncel tab/viewa script/olay gönderir. Edit yolundaki CAS bu completion yolunda uygulanmaz.

**impact**: Kullanıcının yeni kaynak/çeviri düzenlemesi kaybolur. Katman temizlenip sayfa değiştiğinde eski sayfa işlemi cachee geri yazar ve güncel belgeye başarı bildirir. Ağ işi durdurma akışına katılmadığından gereksiz sağlayıcı çalışması sürebilir.

**prior**: R283 yalnız yönetilen mangaJob predicate/abort modelini temiz buldu; R391 sonradan ayrı kaynaktan yeniden çeviri rotası ekledi. R476-08 konum geri yükleme await iptali, R51-61 eski failure listesi ve R56 stale edit rollback farklı mekanizmalardır. R815 genel async ownership örnekleri aynı kaynak/rota değildir; önceki126ya ek yeni entegrasyon sınırı. MANGA-01 protokol düzeltmesi request/source veya generation sahipliğini eklemez; kaynak overwrite kanıtı çeviri formatından bağımsızdır.

**limits**: Kontrollü geciktirilmiş fetch; gerçek site gezinmesi veya Windows UI değil. Yeni DOMun gerçekten değiştiği iddia edilmez: gerçek koddan üretilen late script gönderimi ve state/cache etkisi ölçüldü. Geç kaynak overwrite gerçek main fonksiyonu ve bölgede ölçüldü.

**acceptance**: Yeniden çevirinin abortu açık iş kimliğiyle stop/clear/navigate kapsamına girmeli; awaitten sonra belge, page, bölge revizyonu değişiminde sonuç uygulanmamalı. Geç yanıtla eski cache/event/script yazımı olmamalı; daha yeni manual edit korunmalı.

## Coverage/excluded

- OCR-source retranslation request/response contract: R391, R597, R51-101; Both source-edit callers must obey actual sentence object/result object protocol; MANGA-01
- OCR-source retranslation result ownership: R283, R391, R56, R476-08, R51-61; Stop/navigation and newer manual edit invalidate pending source retranslation completion; MANGA-02

- Historical geometry object-fit/transform R351; no new geometric root claimed.
- Old R51 image-src identity, no-region cache, WebP decoder, dirty editor close, source length and rollback roots are not counted.
- R597 provider-key isolation and R69 SSRF protections are not new findings.
- No live site, paid provider, personal profile/media/key, GPU/OCR download or music analysis used.
- All 80 adjacent Night1000 rows remain historical; this probe does not rerun them or convert their outcomes.

Exact adjacent80 historical scenario IDs/signatures: coverage.json. Source hashes: results.json/findings.json. Proposals: none.
