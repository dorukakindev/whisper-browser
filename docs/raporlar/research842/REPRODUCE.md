# R842 kaynak ve belge kanıtını yeniden kontrol etme

Ürün test paketi değildir. Yerel taban `df972383ab5a9b736b832ba64401b206beb6dedc`; ürün değişmedi. Araştırma kartları [card-index.json](card-index.json), indirilen259 dosyanın kayıtları [source-index.json](source-index.json), son kontrol [verification.json](verification.json).37yeni/23derinleştirme ve RSS için26ayrı tasarım kararı aynı sayaca eklenmez.

1. Alanların repositories.json içinden tam40 SHA'yı al. Bugünkü varsayılan dalı tarihsel kanıtın yerine koyma. Eski repo adları/yeni kod mekanizmaları ayrı sınıflandırıldı.
2. source-manifest.json içindeki rawURL/permalink dosyasını resmî GitHub'dan al; raw byte SHA256 eşleştir. Kamu kaynak gövdeleri public pakete kopyalanmadı. Ignoredcache `.tmp/research842` altında kaldı.
3. Canonical metin: UTF-8 BOM çöz, CRLF ve tekCR'yi LF yap, BOM'suz UTF-8 encode edip SHA256 al. Source-index raw ve canonical değerleri taşır. Yerel dosyayı hem çalışma kopyası hem `git show <taban>:<path>` ile aynı yöntemle doğrula.
4. Karttaki repo+tamSHA+path, kaynak manifestinde bulunmalı. Sembol/satır referansı gerçek kod parçasına gider; çoğu kart proposed synthesis içerir. README ve context-only dosyaları çalışır özellik sayma. Asistan65dosyasının37tanesi context-only indirmedir; gerçek okuma rolü manifestte ayrıdır.
5.6JPEG'i visual/manifest.json ile raw hash karşılaştır. Hosted build commit unknown; publicdemo/onboarding içeriği, kullanıcı özel verisi değil. Folo timeline boştu; AI/subscribe denenmedi. Karakeepread-only modda form açıldı/kapandı. FreshRSSpublic list/reader görüldü.
6. İkiCriterion feed'inin HTTP/content-type/bytehash/item-count gözlemleri rss/live-feed-observations.json içinde. Gövde yayımlanmadı. İleride feed değişeceğinden eski hash'in yeniden indirmede tutmaması doğal; kayıt anı ile yeni kontrol tarihi ayrılmalı. Her snapshot20item içeriyordu; bu sürekli erişim garantisi değil.
7. RSS blueprint'teki3 JavaScript bloğu ignored cjs dosyalarına çıkarılıp `node --check` ile sözdizimi denetlendi. Bunlar ürüne eklenmiş kod değil; IO sözleşmesi/app-specific adapter gerektiren örneklerdir. Parser/DB/network/DOM runtime kabulü yapılmadı.

Parent doğrulama259 byte hash, yerel canonical/gittaban,60 tekil ID/37–23,26 RSS kararı, JSON, yerel belge/görsel bağlantıları, UTF-8 Türkçe içerik ve3JSsyntax kontrolünü yapar. Yerel .tmp yardımcı script public pakete eklenmedi; algoritma yukarıda ve manifestler herkese açıktır. Checkout sonrası canonical kontroller tekrar yapılır.

Raporun önerileri için npm/bridge/backend, start.bat/install.bat, native Windows/DPI/GPU/DRM, upstreambuild, liveLLM/embedding/graph, özelRSS/Letterboxd,playback/soak kabulü yok. CI değişmedi, sonucu beklenmedi. Eski raporlar ve ilgisiz mevcut çalışma korundu.
