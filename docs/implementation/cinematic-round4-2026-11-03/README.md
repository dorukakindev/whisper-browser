# Round4 — onaylı kompozisyonun uygulaması

Ürün commit: b08f58c68ac1602fe20c5c980ea8f3826c47895d. [Görsel karşılaştırma](comparison.html) · [performans ve ham ölçümler](PERFORMANCE.md).

Home en fazla7 hareketli gösterge ve tek satır sayaç; başlık3 satırdan önce kesilmez. İki kapsamlı tercih paneli; Anlatı/Biçim kartları ve alt kaydet/sıfırla alanı. Atmosfer normal kart, kalan alan seçim özeti. İzleme/günlük eşit yükseklikte; footer eylemleri, tek kaynak popover'ı,3 hazırlık adımı, durum rozetleri, erişilebilir alt akordeonlar. Üst çubuk arkasında metin okunmaz.

**Korunan anlam:** film görüşleri boş/like/neutral/dislike. Az/Orta/Çok etiketi bunların anlamını değiştireceği için Değiştirme/Beğendim/Kararsızım/Beğenmedim kullanıldı. Genel öncelikler boş veya0–5 kalır. Bu, mevcut davranışı korumak için bilerek yapılan ve kullanıcıya bildirilen bir farktır. Film görüşleri ile genel öncelikler birleşik veri değildir. Genel kaydet hâlâ özgün önizleme/token/onay sahibine gider.

Yeni modül CinemaFilmRound4 görünür DOM'u orijinal select/button/form sahipleriyle kurar; API işlemleri yeniden yazılmadı. Canonical select'ler görünmez ama gerçek değer, pending, change ve onay davranışı onların üzerinden geçer. Özel kaynak seçici klavye/listbox ve disabled durumunu aynı select'e bağlar. Kapalı alanlar ilk açılışta kurulmaz. Başarı hareketi yalnız gerçek API başarısı sonrasında tetiklenir.

47 hedefli Node kontrolü geçti; son eksik kaynak sütun düzeltmesi sonrası3 ilgili kontrol ayrıca geçti. Native Windows1440/1920 Home, Keşfet, film üstü, iki açık akordeon, TMDB var/yok, video kaynağı yok ve480px taşma kontrolü geçti. 78 kayıt testi özel izole profil kullanır. Kaynak yokken yerel bağlama eyleminin kullanılabilirliği gerçek main/preload üzerinden kontrol edildi. Canlı sağlayıcı/TMDB/Letterboxd veya kişisel profil kullanılmadı.

Bir görsel kontrolde kaynak yok mesajının flex-wrap yüzünden ikinci sütuna taştığı bulundu. nowrap ve sabit başlık flex'iyle düzeltildi; son no-tmdb görüntüsü takip ürün commit'indendir. Diğer tokenlı görüntüler aynı çalışma paketinin bu eksik kaynak stilinden önceki revizyonudur; tek-byte revizyon iddiası yoktur.

Alt ipuçları/chevron/h3 dili ortak. Aynı test penceresi webContents.capturePage ve Windows desktopCapturer pencere kaynağıyla ayrı alındı. Dikey kesik çizgiler yeniden görülmedi; yakalama hatası olduğu kesinleştirilmedi. Alternatif çekim yalnız izole test penceresidir. Zamanlı kareler yaklaşık0/200/600/900ms; capture/IPC gecikmesi nedeniyle profiler yerine geçmez.

**Sınır:** p95~7ms olsa da maksimum20ms hedefi karşılanmadı. Son aktif hero CPU ortalamaları%1,316/%1,254. GPU yöntemi ve odaksız bırakılan1920 akordeon tekrar kaydı PERFORMANCE.md'de. Böylece tüm performans hedefleri geçti iddiası yoktur.

Yeni hesap/ücretli servis/bağımlılık yok. Maket barı, sahte yorum veya kişisel durum üretim koduna taşınmadı. Gerçek Hareket ayarı korunur. RSS, library posterless ve browser yeni yüzeylerine başlanmadı. Açık kişisel uygulama kapatılmadı; EXE bu turda yeniden paketlenmedi. Kaynak sürümü start.bat ile yeniden açılır.
