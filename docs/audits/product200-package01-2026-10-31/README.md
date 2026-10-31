# Ürün200 — ilk teslim paketi

Temel: master `206fac90`. Liste kullanıcı tarafından 31 Ekim 2026’da özerk uygulama hedefi olarak onaylandı. Bu paket tüm 200 görevin bitirildiği anlamına gelmez.

## Sonuç

- Asistanın kaynak/dil/altyazı kapsamı görünür. Soru kapsamı, yeni Whisper/çeviri işleminin zaman aralığından açıkça ayrılır. Model adı aynı alanda iki kez yazılmaz.
- Kaynak metni bütçelenirken sağlanan ve gerçekten iletilen karakter/birim sayıları korunur. İlk kırpılmanın büyüklüğü bilinmiyorsa açıkça belirtilir. Tam eser okunmuş gibi raporlanmaz.
- Dinamik altyazı araması ilk örnekleme havuzuna takılmaz. Yüklü uygun satırların tamamı yalnız seçili izlenen/yakın/tam kapsamda aranır. Sonuçlar sınırlı alıntı, özgün U kimliği ve doğru UTF-16 ofsetleriyle döner. Önceki havuzda olmayan sonuçla zamanına gitme/düzenleyici açma tamamlanır. Kaynak/iz değişimi ve başarısız okuma eski havuza sessiz dönüş yapmaz.
- Sohbet başına gecikmeli kayıt ve yanıt sahipliği, kaynak değişimi sırasında tamamlanan metni korur. Silme, temizleme, bitmiş yanıt ve başka işin devam ettirdiği yanıta gelen eski olaylar reddedilir. Yalnız adım/alinti değişimi de saklanır.
- Letterboxd yorumlarının kendi güvenli özgün bağlantısı, tarihi ve yıldız puanı parser → önizleme → analiz → kayıt → geçmiş zincirinde korunur. Eksik alan uydurulmaz; gövde/komşu kartın bağlantısı sahiplenilmez.
- Yorum seçimi görsel kartlarla yapılır; seçim değişince metin bütçesi, kısaltma ve dahil/dışarı sayıları yeniden hesaplanır. Ham örnek korunur. Yalnız güncel seçilen/kapsama sığan metin modele ve kayda gider. Spoiler seçimi kapalıyken gizli metin açılmaz. Gönder/kapat arasında boşluk ve 40 px seçim hedefi vardır.
- Türkçe konuşma hazırlığında açık sıra ekleri (`3’üncü`), birim ekleri (`5 kg’dan`, `2 cm’ye`) ve açık `saat` etiketli saatler iyileştirildi. Ek uyumu doğrulanır. Tarih, yalın skor/saat, sürüm, başında sıfır olan kimlik ve daha uzun birim benzeri sözcükler korunur. Eski ses önbelleği sürümü yenilenir.

## Kanıt

- Yeni hedefli testler gerçek main/renderer sözleşmesi üzerinde 6000+ altyazıda ilk örnekte bulunmayan `U3997`, Türkçe/Unicode uzun metin sonu, önek boşlukları, izlenen/yakın kapsamı, değişen iz ve gezinme/düzenleyici bağını sınar.
- Sohbet testleri ilk dört sahiplik/kayıt hatasını yeniden üretip düzeltmeyi doğrular.
- Sayısal konuşma ve mevcut bitirme/kalite/prosodi/kontrollü üretim testleri: 77 geçti. Bu GPU veya insan dinleme kanıtı değildir.
- `source-preview-native.json`: gerçek Windows overlay, üç boyut/tema, kaynak kapsamı ve composer sınırı. Veri sentetiktir; sağlayıcı kullanılmadı.
- `review-selection-native.json`: gerçek üretim main/preload/parser/önizleme/kayıt/geçmiş akışı, TR 1440 koyu ve EN 760 açık. Checkbox çıkar → geri al → çıkar → gönder → gerçek kayıt adımları. HTML ve model yanıtı kontrollü fikstürdür; gerçek Letterboxd/ücretli API değildir.
- `assistant-actions-native.json`: kontrollü yerel HTTP/SSE üzerinden gerçek asistan önerisi → onay → uygulama → görünür işlem sonucu, etkinlik göstergesi ve iptal. Beş yerel istek; canlı model değildir.
- Görüntüler gerçek Windows test penceresinden alındı ve gözle incelendi. Kişisel uygulama kapatılmadı.
- İlk tam koşu üç eski test düzeneği uyumsuzluğunu gösterdi. Yeni kaynak bağımlılığı test harness’ine eklendi; incelenmiş HTTPS Letterboxd href alanı envantere alındı; gerçek saatli test girdisi deterministik yapıldı. Eşikler gevşetilmedi. Eski native smoke, gizlenen göstergenin iç metninin boş olmasını bekliyordu; gerçek görünmezlik sözleşmesi denetleniyor.
- Nihai tam paket sonucu `validation.json` içindedir. Uzun CI beklenmez.

## Kalan sınırlar / devam

Canlı DeepSeek, gerçek web erişimi ve GPU sentezi bu pakette çalıştırılmadı. İnsan dinlemesi yapılmadığı için daha doğal ses sonucu iddia edilmez. Tarih/teknik adların tüm telaffuzları, bütün üretim sekme geçişleri ve genel karar hafızası tamamlanmış sayılmadı.

Güncel 200 maddelik durum listesi: [TASKS.json](../../plans/2026-10-31-200-onemli-urun-hedefi/TASKS.json). Sonraki somut paket: P021–P026 durum bağlı ayar kartları ve geçerlilik; örnek ses işine özel seçeneklerin kalıcı kontrollere sızmasını önleme. Bulgular `NEXT.md` içinde.
