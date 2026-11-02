# Keşfet: yedi kişisel kullanım akışı

Başlangıç `f93ea9b68b6c5f38abb7764be1f8890b8a76f574`; ürün `5c59598deae4997e1f92f2f638ce0ebbb140d148`.

Önce [temsilî taslak](concept.png) ([HTML](concept.html)) render edildi. Üst medya menüsü/film hero korunur. Agent veya yeni bağımlılık kullanılmadı.

1. **Geri al:** Ana süreçte 10 dakika süreli, sender/source/thread ve işlem sonrası tam revision'a bağlı, tek kullanımlık undo. Sonraki manuel değişikliği ezmez. Toplu işlemde tamamlanan kayıtlar ters sırayla geri alınabilir. Yeni oluşturulmuş nötr metadata kaydı silinmez; işlem öncesi izlenme/tepki/konum geri gelir. İlk bildirim 15 saniyede, odak/hover yoksa gizlenir.
2. **Durum rozetleri:** Kart görselinde İzlendi/İzleme listemde/İzleniyor; sağ tık menüsünde aria-checked. Beğenilmemiş ve izlenmemiş kayıtlar gereksiz Belirtilmedi satırıyla doldurulmaz. Kayıtlı yerel afiş mevcutsa güvenli poster IPC'sinden okunur.
3. **Sağ tık:** Sık izlenme komutları önde. Diğer işlemler alt menüsünde Beğendim/Bana göre değil/Koleksiyon/Asistan/Öneri gerekçesi. Asistan önce tam seçili film sayfasını açar; sonra mevcut sohbeti açar. Görüşleri kendiliğinden yazmaz. Klavye/dış tıklama/scroll/leave davranışları korunur.
4. **Toplu seçim:** Kart seçimi yalnız seçim modunda, en fazla20yapım; izleme listesine sırayla güvenli kayıt veya önizlemeli koleksiyon. Kısmi hata olursa gerçek tamamlanan sayı gösterilir, kalan seçimler korunur. Koleksiyon ilk incelemede yalnız gerçek metadata okur; yeni nötr kütüphane kayıtları ve mevcut atomik üyelik planı ancak açık onaydan sonra uygulanır. Hata sonrası oluşturulmuş metadata kayıtları saklandıysa açıklanır.
5. **Dizi devamı:** Sağ tıkta sezon/bölüm/dk:sn formu. Tam bölüm izleniyor kaydı ve manuel konum; önceki bölümler veya bütün dizi tamamlandı sayılmaz. Ortak kişisel kayıt altyapısına bağlıdır; geri alınabilir.
6. **Filtreler:** İzlemediklerim/Tümü/İzlediklerim/İzleme listem. Son ikisi eksik katalog sayfalarında aramak yerine kayıtlı kütüphanenin gerçek durumlarını sorgular, sorgu/tür/kind/yıl filtresi korunur. Tümü izlenmiş katalog sonuçlarını içerir; özellikle gizlenmiş içerik yine gizlidir. İzleme filtreleri Yeni ve popüler sekmesindedir; Sana özel mevcut beğeni tabanlı keşif olarak kalır.
7. **Neden öneri:** Gerçek like seed ID/ad/tür veya en az iki kayıtlı puanın tür ortalaması. Dayanak yoksa açıkça söyler. Tür benzerliği tempo veya beğeni garantisi değildir. Bana göre değil ayrı kişisel tepki; Bu öneriyi gizle ayrı geri alınabilir Keşfet tercihi.

## Doğrulama

36/36 hedefli test: discovery-personal-workflows, discovery-card-watch-menu, personal-media-state, media-discovery-service, assistant-collections, assistant-personal-media, personal-media-ui. [Çıktı](targeted-tests.log). Değişen JS syntax ve diff kontrolü geçti.

Gerçek izole Windows Electron: toplu seçim → iki planned disk kaydı → undo disk doğrulaması; koleksiyonun ilk incelemede yazmaması ve onayda atomik üyelik; S2E4 12:30 ve yalnız tek bölüm; izlediklerim filtresi ve1440/480menü sınırları; mevcut gerçek fixture beğenisinin kayıtlı adıyla öneri açıklaması. İlk koşularda testin mikro görev/scroll/store okuma zamanlaması sorunları ayrıştırıldı; en önemlisi ürünün library-changed sırasında Keşfet'i yeniden kurup seçimi kaybettirmesi düzeltildi. O olayda ana kütüphane modeli yenilenirken Keşfet root'u korunur; kişisel kontrol kendi sonuçlarını yerinde tekrar yükler. Testler veya beklenti eşikleri gevşetilmedi; metadata liste kısa adı yerine gerçek kayıtlı title esas alındı.

[Geniş toplu seçim](bulk-selected.png), [koleksiyon inceleme](collection-review.png), [dizi formu](series-resume.png), [geniş menü](status-menu-1440.png), [dar menü](status-menu-480.png), [gerçek seed açıklaması](recommendation-evidence.png). Bunlar controlled film/review metadata fixture'ı; gerçek filmler ve canlı öneri kalitesi kanıtı değildir. Ekranlarda ağ kapalı olduğu için bazı afişler yoktur. Son görüntüden sonra açıklama aralıkları ve gereksiz Belirtilmedi satırları kodda ayrıca sadeleştirildi; aynı36test tekrar geçti, bu iki küçük görsel fark için yeni ekran alınmadı.

Canlı DeepSeek/dış ağ, gerçek sağlayıcı hesapları, GPU, tam suite ve start.bat akışı koşulmadı. Actions başlatılmadı. Kullanıcının açık uygulaması kapatılmadı, kişisel profil/anahtar/kullanıcı dosyaları kullanılmadı. OFFLINE-MANIFEST, rapor indeksi, start.sh ve önceden bulunan untracked dosyalar teslim dışında korunur. Kod/belge commitleri ayrı; normal PR/merge ve güvenli primary fast-forward teslimi.
