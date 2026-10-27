# Rapor649 — Yeni50hedef ikinci10: keşfet/arama hata deneyimi

Başlangıç78dd12e94f53af9c88082bfd66c646c56b8f787d; ürün 8a534820d1203964a457c27b4df2ef36f5748847; dal codex/product-50-649. [50hedefplanı](PRODUCT_50_2026-10-27/PLAN.md) W11–W20kapsandı; toplam20/50,30açık. Bunlar10yeni bug değildir. Gece denetimindekiF09-01 açıkUXkökü giderildi; eski kayıtların tarihselsonuçları değiştirilmedi.

## Ürün

- Yeni safpaylaşılan media-discovery-errors.js hata kodu→EN/TR eylemli mesaj eşlemesi. Yetki,429sınır,busy,timeout,network,503/redirect,geçersizfiltre,bozukyanıt/tercih,iptal ve sesbulunamadı ayrılır. Bilinmeyenhata güvenlimajörolmayan mesajla gösterilir, hamURL/metinUI'ya taşınmaz. Bu tekbaşına uzaktanverisızıntısı güvenlikaçığı iddiası değildir.
- Main media-discovery yanıtı opsiyonelerrorCode ekler; eskierror tanısı ve yetki/host/rate/cache kapıları korunur. Renderer helper self script olarak search/discovery'den önce yüklenir; CDN/inlineJS yok.
- Ayrıntı/ekleme/yorum/çeviri hataları kullanıcıdilinde sunulur. Liste ekranı önceden zaten genelTürkçe hata veriyordu; bunu yeni rawEnglishbug diye saymadık. Artık gerçekneden koduna bağlı öneri+kütüphanedeğişmedibilgisi gösterir.
- Çevrimiçi tümkaynakların başarısızlığı, kısmi aramadan ayrılır. Kısmi sonuçsayısı ve alınamayanfilm/dizi kaynağı açık, erişilenbaşlıklar korunur. Başarılıboşyanıt hâlâ gerçek sıfıreşleşmedir. Retrybutonu erişilebilir kalır; geçeskiyanıtın querygate'i korunur.
- Gece auditregistry F09-01 güncelkapanışı veSHA listesi güncellendi; tarihsel CSV/FINDINGS/ZIP aynen kaldı. F09-02 otomatik kasa silme önerisi uygulanmadı/açık.

## Kanıt

Yeni media-error-experience649.test.js6kontrol + mevcut media-discovery-service6 + media-search-gallery3 =15geçti. İlk4yeniassertion eskikodda kırmızı: hamauthorization,ikikaynakbaşarısızgenelmesaj,kısmi sayım/kaynak detayı ve eksikkod sözleşmesi. Bunlar tekUXhattının farklıkabul koşullarıdır. Ana-service429/503/TimeoutError/network/bozukJSON/skip-year-genre ve heriki dilin eylemli mesajı sınandı. Unknowncode/proto/hamURL ve geçreject yeniquery'yi ezmeme kontrolü var.

NativeWindows main/service/preload/renderer electron-media-errors649 exit0: TRdark940px ve ENlight1280px; liste ve ayrıntı503mesajı,ikikaynakfail,filmbaşarılı/dizifail1kısmi sonuç,başarılıtekrar veenabledretry doğrulandı. Kontrollüfetch/Cinemeta fixture; canlısitehesabı/anahtarı yok. Görseller `.uiprev/media-errors649/1793111522887-23540/`; TRkısmi ve ENliste hata screenshotları incelendi.

İlk native bekleyiş listede önceden var olan genelTürkçemesajı gördü; bu mevcutdavranış ayrıldı. İkinci fixture ENsorgusunda öncekiTRbaşarılıCinemeta cache'ini kullandı; diller için benzersizquery ile düzeltildi, üründe cache kapatılmadı. İlk captureDOMsonucu doğru olsa bile compositor araanimasyonkaresiydi; font+2frame+180ms sonrası gerçekgörseller alındı. Hatalar gizlenmedi/testeşiği gevşetilmedi. Liste timeoutfallback'i işlenirken yerelleştirilmişmesajda regex kullanmak yanlışolacağından rawerror/structuredcode korunur.

DörtJSsyntax,gitdiffcheck,docsindex ve yayınSHA/manifest kontrolleri. UIstil/tasarım değişmedi; mevcuttheme/status kullanıldı. Yeni runtime dependency,kalıcıschema veyaIPCkanalı yok; yalnız additiveerrorCode. start/install değişmedi; launcher,tam npm,gerçekAPI/GPU/YouTube/CI koşulmadı. CIaçıkbeklenmez. F09-01 için bundan sonra düzeltilmiş eski hammesajı yeni keşif sayma; regresyon gerekiyorsa çalıştır.

Normal ayrıürün/belgecommit,push/PR/master/rootFF; kişiselmanifest/INDEX516/untracked ve açık uygulama korunur. SıradakiW21–W30asistan,sonrakitap/ses20hedef.50tamamlandı denmez.
