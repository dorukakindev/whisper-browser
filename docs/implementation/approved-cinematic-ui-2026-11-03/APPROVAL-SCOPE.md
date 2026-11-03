# Kullanıcı değerlendirmesi ve onay sınırı

2026-11-03: Kullanıcı Home / Keşfet, film alt v2 ve son mesajında hero / oyuncu / künye üst varyantını onayladı. Maket aşaması tamamlandı; gerçek uygulamaya aktarım yetkilendirildi. Bu dosya güncel teslim kaydıdır; artifacts içindeki eski onay sınırı tarihsel haliyle korunur.

Uygulamada korunacak talep:
- Analiz kartı tam grid genişliğini kullansın; sağda ölü alan kalmasın.
- Gerçek yorumcu adı, Letterboxd kaynağı ve alt etiketler en az 12px ve daha yüksek kontrastta olsun.
- Fragman rafının ilk resmî fragmanı diğer iki öğeden daha büyük olsun.
- Örnek kullanıcı/yorum/oran/metin ve Maket verisi etiketi üretime taşınmasın. Gerçek çekilmiş veri; veri yoksa tasarlanmış boş durum.
- Home/Discover/Film top-middle-bottom uygulama görüntüleri 1440/1920'de onaylanan kompozisyonla yan yana karşılaştırılsın. Açıklanmayan tasarım değişikliği yapılmasın.

Son üst bölüm onayının ek koşulları: ana eylem gerçek kaynağa göre İzle / dosya seç / izleneceklere ekle / kütüphanede aç olmalı; özgün işleyiciler korunmalı. Künye hero alanlarını tekrarlamamalı, gerçek yapım kredileri gösterilmeli, boş alanlar gizlenmeli. Hikâye dengelenmeli; çeviri / özgün metin görünür bir ghost düğme olmalı. Oyuncular gerçek TMDB profil görselleriyle cover / center 20% kırpılmalı; yoksa sıcak baş harf yedeği. Roller en az12px; ikonlarda tooltip ve erişilebilir etiket bulunmalı.

Kaynak verisine bağlı metin, düğme, puan ve pencere başlığı farkları README'de açıklanır. Kontrollü analiz yalnız ayrı test profilindedir; gerçek Letterboxd/TMDB/AI çağrısı veya piksel eşitliği iddiası yoktur.
