# Rapor651 — PDF seçili pasaj sahipliği ve kitap kabulü

Başlangıç530d0039863d3535a2597ef11fe6a4e77012b070; ürün f501b2e52cf2c92c2f3085fea1b1dd455752a256; dal codex/product-50-651. W31–W40kanıtları[50hedefplanında](PRODUCT_50_2026-10-27/PLAN.md).40/50kapsandı,10açık;10yenibug değildir.

## Düzeltme

PDF selectionchange herhangi bir.pdf-page class'lı öğeyi kaynaksayıyordu. Başkabir belge/okuyucu alanı aynı page numarasıyla aktif asistanpasajını ezebiliyordu. Şimdi öğe hem pdfReaderPages içinde hem exactreader.pages[page].article olmalı; gizliokuyucu seçim alamaz. Crosspage veya okuyucuiçinde collapsedseçim eski pasajı temizler. Asistana focusgeçişi explicitpasajı korur; dışarıdaki seçim yanlışkaynakolarak içerialınmaz.

9000karakterpasaj8000'ekırpılıyorduama flagsizdi. selectedTextTruncated ve pagebound kaydı artık kaynakkanıtında taşınır; yeni kısaseçim/reset açılış/kapanış false olur. Modelin bütünpasajı gördüğünü sanması engellenir. KaynakPDF/sesüretimmetni değiştirilmedi.

Üç yeni test eski kodda kırmızı: foreignarticle overwrite,cross/collapsed eski pasaj,longtruncation bayrağı. Bunlar tekseçimhattı boşluklarıdır;3ayrıkritikbug sayılmaz.

## Kontroller

9Node dosyası23test geçti: yeni pdf-selection-owner651(3),pdf-preparation-ownership,reader-pdf-lifecycle,book-bookmarks,book-regenerate-request,book-text-preparation,book-voice-takes,book-quality-scope636,reader-audio-control. Yeni selection dışındaki kontroller değişenkitapakışının regresyon/kabulüdür, yenidenbulunanbug sayılmaz. İlk komutta yanlış book-passage-bookmarks dosyaadı kullanılmıştı; gerçek book-bookmarks dosyasıyla nihai23tekrar koşuldu, bu dosya çalışmış varsayılmadı.

Mevcut nativeWindows electron-pdf-reader-experience exit0; yeniforeignarticle+collapsedselectionassertion eklendi. GerçekPDFfixture açılış/okumaseçimi/sonrakisayfa context/asistan,2–3range üretim projesi kimliği,seçilmişbölümler,missingtranslation gate,synthetic4sn WAVile groupvurgu/reader Home/closepause,ENlight/TRdark ve dar800px/1024px etkileşimler. Gerçekmodel/GPU/TTS/doğallık yok; fixtureWAV sesi insan konuşması değil. Screenshots `.uiprev/pdf-reader547-1793113791779/`, reading-narrow görseli incelendi. NodeJS syntax ve diffcheck geçti. Tamnpm/CI/launcher/GPU/donanım/gerçekPDFçevirikalitesi sınanmadı; CIbeklenmez/açıktır.

YeniUIstil/dependency/persistentschema/IPC yok; context additivebayrak. windowsTürkçe source/fixture pathleri test harness'inde. start.bat/install değişmedi. Kişisel açık uygulama/ayar/medya korunur. Ayrıürün/belgecommit,pushPRmasterrootFF. Son10hedef sesçeviri açık;50tamamlandı denmez.
