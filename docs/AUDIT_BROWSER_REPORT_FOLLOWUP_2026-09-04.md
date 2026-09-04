# Eski atıfların güncel doğrulaması

Başlangıç: `0ac5f9f`. Kaynaklar: kullanıcının `01b906fd-...`, `6209a76b-...` ve `e80242b8-...` ekleri. Bu tur, son raporda önceki tura atıf yapılan maddeleri kontrol eder; yeni bir genel denetim değildir.

| Madde | Güncel sonuç |
| --- | --- |
| 64 — application/mp4 | Altyazı ipucu/manifest eşlemesi olan MP4 yanıtları kabul ediliyor; genel video yanıtı alınmıyor. İki durumun testi geçti. |
| 67 — çift entity çözümü | `decodeEntities` tek geçişli; `&amp;#39;` örneği testte korunuyor. |
| 69 — TTML SMPTE | TTML saat:kare yolu oranı kullanıyor; 24 fps için 01:12 → 1,5 saniye testi geçti. Genel `parseTime` yerine gerçek TTML giriş yolu değerlendirildi. |
| 74 — adres çubuğu | Çıplak `youtube.com` ve normal arama zaten çalışıyor; raporun katı kimlik yardımcısı üzerinden çıkarımı artık geçersiz. Ancak eğik çizgisiz sorgu/fragment ve IPv6 kenar durumları gerçekten aramaya düşüyordu; bu tur düzeltildi. |
| 75 — kalıcı URL | Geçmiş/yer imi temizleyicisi tracking parametrelerini eliyor; kimlik katmanı aynı regex nesnelerini kullanıyor. İmzalı gezinme adresleri temizleyiciden geçirilmiyor. |
| 76 — sertifika küçük harfi | Kod `toLowerCase()` kullanıyor; İngilizce hata kodundaki I bozulmuyor. |
| 77 — yeni sekme öne geçiyor | Bağlam menüsü yeni sekmeyi arka planda açıyor; aktif sekme değişmiyor. |
| 78 — blob/data görsel sessizliği | Desteklenmeyen protokol açık Türkçe hataya dönüşüyor. İndirme desteği eklenmiş sayılmaz. |
| 79 — sekme limiti sessizliği | Limitte başarısız notice var. |
| 80 — kısmi temizlik | `ok:false, partial:true` sözleşmesi ve renderer mesajı mevcut; hata enjeksiyonu testi geçti. |
| 81 — Kes/Yapıştır/Tümünü seç | Düzenlenebilir alanda editFlags'e göre mevcut. |
| 82 — asset SRT boş satır kaybı | Asset yazıcısı da artık boş satır ayıracını temizliyor. İki farklı newline türü ve boşluklu ayıraçla kaydet/parse testinde `bir`, `iki`, `son` korunuyor. |

## Bu turdaki değişiklikler

- `example.com?sig=a%2Bb&token=x#part`, localhost sorguları, `[::1]:3000`, IPv6, uluslararası alan adı ve `//example.com` adresleri doğru çözülüyor.
- Adres çubuğu HTTP/HTTPS dışı açık şemaları arama sağlayıcısına göndermiyor. Sayfa linkini yeni sekmede açma yolu artık arama fallback'i kullanmıyor; yalnız gerçek HTTP/HTTPS URL kabul ediyor.
- Sağ tık menüsüne **Bağlantı adresini kopyala** ve **Seçili metni ara** eklendi. Arama ayrı arka plan sekmesinde açılıyor; metin query olarak kodlanıyor ve 2000 UTF-16 birimiyle sınırlı. Google mevcut adres çubuğu davranışıyla tutarlı olarak kullanılıyor.

## Önerilerin değerlendirmesi

- Geçmiş/yer imi datalist'i, kes/yapıştır, arka plan sekmesi ve ortak URL temizleme kuralları zaten mevcut. Yeni menü eylemleri bu tur eklendi.
- Asset ve parser `normalizeCues` işlevlerini doğrudan birbirine bağlamak doğru değil: parser metin/HTML normalizasyonu yaparken asset kimlik ve metin korur. Kopyayı silme önerisi davranış farkı gözetilmeden uygulanmadı; iki yolun round-trip testleri korunuyor.
- Genel indirme yöneticisi, sayfada bul paneli ve seçilebilir arama motoru bu dar düzeltme paketinde eklenmedi. Bunlar eski rapordaki ayrı özellik önerileridir, kapanmış hata diye sunulmadı.
- Sertifika kontrolünü localhost için gevşetme önerisi uygulanmadı; mevcut katı ret korunuyor.

## Test sınırı

`browser-report-regressions`, `browser-controls-behavior`, `browser-subtitles` gerçek saf fonksiyonları/çıkarılmış main fonksiyonlarını çalıştırır. Tam `npm test`: 50 Node dosyası ve 137 Python testi başarılı. Sözdizimi ve diff kontrolü de geçti. Gerçek Electron sağ tık menüsü, ağ veya DRM oturumu açılmadı.
