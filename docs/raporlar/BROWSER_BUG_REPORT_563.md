# 563 — PDF vurgusunda sayısal anlam

Doğrudan mevcut kodla repro: kaynak `Süre 1.5 saat.` / konuşma `Süre 15 saat.`, `Sıcaklık -20 derece.` / `Sıcaklık 20 derece.`, `Oran 1/10 olarak açıklandı.` / `Oran 110 olarak açıklandı.` çiftlerinin tamamı `[[0]]` eşleşiyordu. Genel noktalama temizliği sayıların anlamını da siliyor ve düzenlenmiş metni özgün PDF'yle aynıymış gibi vurguluyordu. Bunlar aynı kökün örnekleridir; ayrı buglar olarak sayılmaz.

Yeni eşleştirme, bütün PDF metin parçalarını konum haritasıyla değerlendirir; ondalık, işaret, kesir ve saat ayırıcıları korunur. Sayının ortasından başlayan/kopan eşleşme reddedilir. Nokta tek başına başka PDF text item'ında olsa da kaybolmaz. Unicode eksi ve tire eşdeğerleştirilir; Türkçe `ı/i` birleştirilmez. NFKC ligatür/birleşik işaret ve tekrar sırası korunur.

Vurgu geometrisi sonlu boyutlarla doğrulanır ve viewport sınırına kırpılır; dışarıda kalan veya desteklenmeyen döndürülmüş glifler için kutu üretilmez. Önce `matched` metin eşleşmesini sayıyor, döndürülmüş glifler çizilmese bile tam başarı bildiriyordu. Artık gerçekten çizilen gruplar sayılır. Yeni dönük glif desteği iddia edilmez; viewport sayfa rotasyonu geometri testinde kapsanır.

Hedefli11 sonuç geçti; ek sayı-başlangıcı kontrolleriyle PDF testleri4/4 geçti. Gerçek Windows Electron ayrı profil `.uiprev/book-reliability549-1792903313789` exit0: PDF kutu sınırı/aktif vurgu, bölüm bağlamı, Review ve raf M4B decode. `reader-tr-dark.png` incelendi. Döndürülmüş/kırpılmış geometri saf testtir; geniş gerçek PDF koleksiyonu veya gerçek model/GPU/kişisel start.bat/liveAPI/CI doğrulaması yapılmadı. Yeni bağımlılık/kalıcı şema yok.
