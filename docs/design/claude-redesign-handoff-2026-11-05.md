# Claude tasarım çalışması — güncel devam kaydı

## Durum

Kullanıcı ilk prototipin incelenmesini ve ardından daha kapsamlı bir tasarım turu için brief hazırlanmasını istedi. İlk paket incelendi; tam kabul veya üretim entegrasyonu yapılmadı. Genişletilmiş brief ve gerçek referans ZIP’i hazırlandı. Güncellenmiş Claude teslimi henüz bu projede incelenmedi veya uygulanmadı.

İlk prototip: `whisper-tasarim-prototipi (1).zip` (yerel Downloads); başlangıç kodu `77a7104427988b931483479108ae2647d1043f96`. Güncel ürüne dosyaları körlemesine kopyalama.

Yerel inceleme: `artifacts/claude-prototype-review-2026-11-05/INCELEME.md` ve `runtime-check.json`. Gönderilecek paket: `artifacts/claude-design-next-2026-11-05/claude-tasarim-genisletme-paketi.zip`; içinde ayrıntılı `CLAUDE-BRIFI.txt`, önceki özgün prototip ZIP’i ve beş mevcut ekran PNG’si var. Bu varlıklar Git dışındadır; yalnız GitHub reposuna erişen asistanın onları gördüğü varsayılmaz. Bu belge tek başına kapsamı açıklar; görsel paket gerekiyorsa gerçekten kullanıcıya ZIP olarak verilir.

## İlk prototipte yapılanlar ve açık noktalar

Beş alan var: film yorumlarını okuma, yorum analizi/kişisel karşılaştırma, zevk profili, web video geçmişi ve İçerik Ağı. İlk dört alanın temel akışları kapsamlı; boş/kısmi/yükleniyor/hata durumları mevcut. Chromium motorunda beş ana alan açıldı; alıntı kaynak diyaloğunda mark vurgusuyla gösterildi, hareket kapatılınca animasyonlar durdu. Bu, gerçek uygulama/sağlayıcı veya hareket akıcılığı kabulü değildir.

Kalan hedefler:
1. İçerik Ağı’nda seçim → asistan/analiz → incelenebilir simüle sonuç; öneriyi gerçekten demo ağına ekleme; kayıtlı görünümün sorgu/filtre/kapsam/kamerasını geri yükleme; somut dışa aktarma çıktısı. Yalnız toast yeterli değil; canlı API gerekmiyor.
2. Ağ etiketlerinin özellikle dar pencerede okunması ve ilişki anlamının görünür olması.
3. Analiz ve Zevk Profili’nin uzun, benzer ağırlıklı rapor blokları ile analiz özetinin altındaki büyük boşluğun görsel olarak yeniden ele alınması. Kanıtlar/ayrıntılar kaybolmaz; çözüm tasarımcıya aittir.
4. Web kartlarında site adı/süre çakışması; tekrarlanan soyut görseller yerine medya çeşitliliğini değerlendirebileceğimiz uygun yerel görseller ve güzel eksik görsel yedekleri.

## Kullanıcının yeni eklediği kapsam

- **Podcast kütüphanesi:** abonelik/bölüm arama ve seçim, gerçek devam, RSS/Spotify kaynak ekleme, aynı oynatıcıda Sahne/Çift dilli girişleri, kuyruk, yerel dosya, radyo ve ileri araçlar. Program ve bölüm sayısı ayrı; Spotify browser oynatımı tam ses indirme garantisi değildir. Canlı Whisper sistem sesi onayı ve farklı sürümlerin zaman ekseni korunur.
- **Ana sayfa:** medya dünyasına güçlü giriş; devam kayıtları, kütüphane, film/dizi/web/podcast/müzik/kitap, Browser/Podcast/Çift dilli/asistan ve dosya/klasör yolları. Yerleşim/hero/raf düzeni yeniden tasarlanabilir; sahte kişiselleştirme veya oynatma kaynağı yok.
- **Keşfet:** yeni/popüler, kişisel öneri/tercihler; arama, filtreler, izleme/favori ve toplu işlemler, gerekçeler, boş/yükleniyor/hata durumları. Dil/ülke/yönetmen ayrımı ve TMDB atfı korunur.
- **Film detayı:** afiş/sahne/kimlik/eylemler ve tam alt sayfa birlikte; yeni yorum/analiz deneyimiyle bütünleşme, konu/çeviri, oyuncular, künye, izleme/puan/not/kaynak ve ileri işlemler.
- **Akışlar/RSS:** kaynak yönetimi/OPML, arama/filtre/sıralama, seçim/toplu işlemler, kayıtlı görünümler, okuma/özgün kaynak/çeviri/asistan ve film ilişkilendirme. Özet/tam yazı ayrımı, özgün metin, çeviri iptal/hata ve okundu ile beğeni/izleme ayrımı korunur.

## Geçerli kararlar

Görünüm en önemli önceliktir. Güçlü ve modern tasarım, belirgin hover/ışık/efekt ve sürekli dekoratif animasyon kullanılabilir. Zorunlu sakinlik/minimalizm veya düşük hareket kuralı yok. Tasarımcının görsel çözümüne karışılmaz; sabit kolon/ölçü/koreografi dayatılmaz. Grafit/amber medya kimliği, okunabilirlik, hareket tercihi, erişilebilirlik ve mevcut işlev/veri/güvenlik sahipleri korunur.

Önceki brief’in Ana sayfa/Keşfet/film üstünü aynen koruma şartı bu tur için kaldırılmıştır. Bu sayfalar yeniden tasarım kapsamındadır; kapsam dışındaki sayfalar kendiliğinden yeniden yazılmaz. Bu yetki, henüz görülmeyen yeni prototipi onaylanmış/uygulanmış saymak değildir.

## Teslim ve sonraki adım

Mevcut prototipi tamamlayan ve yeni sayfaları ekleyen tek girişli HTML/CSS/JS paketi; gerçek demo durum değişimleri, ilgili boş/kısmi/hata/işlem/düzenleme durumları; doğrudan PNG’ler, kısa hareket videosu, kısa tasarım notu ve işlev → yeni konum/dosya eşlemesi. Bir geniş/dar hedefli kontrol yeterli; matris/CPU/uzun test kampanyası yok. Prototipte demo ve gerçek veri/sağlayıcı ayrımı açık olur. Ürün dosyaları, kişisel profil, commit/push bu tasarım paketinin işi değildir.

Sonraki somut adım: güncellenmiş paket geldiğinde önce bu kapsamla karşılaştır; eksikleri ve güncel master farkını belirle. Kullanıcı uygulamaya alma istediğinde mevcut sahipler üzerinden entegre et, kısa hedefli doğrula ve sürekli merge yetkisiyle teslim et. Dosyaları eski master’dan üzerine yazma.
