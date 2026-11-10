# Kullanıcının yedi ekranı: sorunlar, plan ve uygulama

10 Kasım 2026. Kapsam, kullanıcının gönderdiği yedi görüntüdür. Sıra: görüntü üzerinden ayrıntılı tespit → kaynak/yerleşim planı → yerel uygulama → hedefli davranış ve gerçek Electron görünüm kontrolü. Bu kayıt canlı modelin veya kişisel verinin doğruluğunu değerlendirmez.

## 1. Yorum örneği ve analiz editörü

Görünen sorunlar:

- Çalışan analiz, yüklenen örnek, örnek seçimi, kaynak toplama ve ham metin aynı dikey formdadır. Mevcut aşama ve sıradaki eylem birbirinden ayrılmaz.
- Küçük spinner ve tek durum satırı geniş çalışma alanında zayıf kalır. Analiz başlatma düğmesinin aynı anda görünmesi, işlem sürerken yapılabilecekleri belirsizleştirir.
- Küçük sayı/havuz alanlarının yanında büyük boşluk vardır; bu alan işlev grubu olarak okunmaz.
- Kaynak URL’si, Browser’dan alma, dosyadan alma, sayfa ekleme ve ham JSON aynı ağırlıkta sunulur. Sıradan kaynak yükleme ile teknik düzenleme karışır.
- Ham veri editörü ekranın devamı gibi açılır. Kullanıcı o anda analiz izlerken teknik metinle karşılaşır.

Plan ve uygulama: Örnek ve analiz / Kaynaklardan getir / Metin ve ileri seçenekler olmak üzere üç çalışma alanı oluşturuldu. Bunlar mevcut kontrolleri kaldırmadan görünürlüğü değiştirir; gezinmek kaynak çağrısı veya AI isteği başlatmaz. İşlem alanı yüzey, kenarlık, okunur başlık ve belirsiz ilerleme ışığıyla belirginleşti; gerçek yüzde olmayan işe yüzde eklenmedi. Analiz/okuma/durdurma sırasında ikinci başlatma düğmesi gizlenir. Yüklenen örnek, kaynak doğrulaması ve örnek değiştirme ayrı görsel gruplardır. Ham metin kaynak alma araçlarından ayrıdır; girilmiş değer aynı düğümde korunur.

## 2. Analiz özeti ve kişisel karşılaştırma

Görünen sorunlar:

- Kaydedilmiş analiz, örnek kapsamı ve profil güncelliği birbirini izleyen benzer küçük metinlerdir. Ana sonuç zayıflar.
- Sağdaki kişisel karşılaştırma, içeriği bittiği halde alt seviyeye kadar uzayıp boş kutu oluşturur.
- Soldaki açıklama ve sağdaki kişisel yorumun bilgi türleri yeterince ayrışmaz. Koşullu kişisel karşılaştırma kolayca kesin öneri gibi okunabilir.
- Çok az kaynak sayısını gösteren uzun çubuklar, bir izleyici anketi ağırlığı taşır. Gerçekte gözlem sayısı oldukları korunmalıdır.

Plan ve uygulama: Ana özet, kapsam satırı, alıntı dağılımı ve kişisel karşılaştırma ayrı hiyerarşiyle sunulur. Kapsam görünür bir açıklama şerididir. Kişisel alan üstten hizalanır, kendi içeriği kadar yüksektir. Çubuklar sınırlı genişlikte ayrı bir yüzeyde kalır. “İzleyici oranı değildir”, “seçili örnek” ve kişisel karşılaştırmanın koşullu olduğu bilgileri kaldırılmadı. Sayılar ve analiz metni değiştirilmedi.

## 3. Kaynak sözü ve model değerlendirmesi

Görünen sorunlar:

- Kanıtlar taranabilir bir konu başlığı olmadan aynı iki etiketi tekrarlar.
- Kaynak alıntısı, model açıklaması ve kaynak eylemleri tek bir birim gibi görünmez.
- Kaynak açma eylemleri ve destek sayısı birbirinden uzak durur. Kısa içerik bile gereksiz yükseklik kazanır.
- Kaynak metni ile model anlatımının ayrımı büyük ölçüde ince kesikli çizgiye dayanır.
- Farklı dilde alıntılar bozulmadan kalmalı; model açıklaması alıntı çevirisi gibi gösterilmemelidir.

Plan ve uygulama: Kanıtlar konu başlıklı, tam genişlikte bloklardır. Solda özgün alıntı, sağda ayrı yüzeyde model yorumu; aşağıda kaynak yorumu, bağlamda okuma ve destek açıklaması vardır. Dar alanda kaynak ve açıklama okunur sırayla tek sütuna iner. Özgün alıntı, kaynak kimliği, yorumun içinde okuma ve spoiler izinleri korunur. Yeni metin, modelden üretilmiş yeni analiz değildir; yalnız sabit UI başlığıdır.

Native kontrolde eski film alt bölümünün tek sütun kuralının yeni iki sütunla çakışması yakalandı. Düzeltme `film-page-lower.css` sahibinde yapıldı. Son geniş görüntüde iki içerik sütunu 636’şar piksel; sıfır genişlikte sıkışan kaynak sütunu kalmadı.

## 4. Dolu RSS okuma alanı

Görünen sorunlar:

- Uzun yazı başlığı okuma alanına göre büyük; üstten çok yer tüketir.
- Büyük sayfa başlığı, kaynak şeridi, filtreler ve yazı başlığı birlikte asıl metni aşağı iter.
- Okuyucunun altında yatay kaydırma çubuğu vardır. Bu gerçek taşmadır; yalnız çubuğu saklamak yeterli değildir.
- Okuma metni ile tercihler/ilişkilendirme araçları aynı akışta yeterince ayrılmaz.
- Kaydet, okundu ve sonra oku simgeleri anlamlarını ancak hover ile anlatır.

Plan ve uygulama: Sayfa/yazı başlıklarının ölçeği düşürüldü; kaynak ve filtre aralıkları sıkılaştırıldı. İçerik kolonları, uzun URL’ler, açılır alanlar ve form elemanları kendi genişliğine sığar. Okuma metni 72 karakter ölçüsünde sınırlandı. Ana kaynak açma eylemi ve ikincil eylemler bir araç şeridindedir; Asistan, Kaydet, Okundu yap ve Sonra oku görünür etiket taşır. Mevcut ikonların erişilebilir etiketleri ve eylemleri korunur. Tercih/ilişkilendirme araçları ayrı yüzeydir.

Son kontrolde uzun başlık ve uzun kesintisiz bağlantı içeren dolu okuyucuda yatay taşma 0; okuyucu sınırını aşan öğe listesi boştur. Bu sonuç yatay scrollbar’ı gizleyerek elde edilmedi.

## 5. İleri araçlar / altyazı alanı

Görünen sorunlar:

- Dış pencere başlığının içinde ikinci başlık, iki kapatma ve ayrı çıkış eylemleri farklı kapatma anlamları yaratır.
- Altyazı yokken cümle kontrolleri, hız seçimi, büyük boş durum ve ileri kontroller aynı formda birikir.
- Hız seçici bütün satırı kaplar; transport, oynatma kontrolü gibi gruplanmaz.
- Boş durum, eylem ve yardım kartı tekrarları gereksiz kaydırma üretir.

Plan ve uygulama: İleri araçlar içinde tek pencere başlığı ve dış Kapat eylemi kaldı. İç panelin ek işlemler menüsü korundu ve adı görünür oldu; paneli ikon rayına daraltan ikinci kapatma bu bağlamda gösterilmez. Altyazısız durum tek okunur yüzeyde toparlandı. Podcast transport kontrolleri sarılabilir satır, hız ise kendi ölçüsünde kontroldür. İşlevsiz alanı büyüten min-height değerleri yalnız bu modal bağlamında kaldırıldı. Dosya seçimi, altyazı oluşturma ve ileri ayarlar yerindedir.

## 6. İleri araçlar / asistan

Görünen sorunlar:

- Ayrı asistan ile gömülü eski asistan farklı tasarım kullanır; önceki ayrı asistan düzeltmesi burada etkili değildir.
- Öneriler, soru kutusu, kapsam, kullanılan bağlam ve sohbeti temizleme aynı çalışma kümesine dönüşmez.
- Kapsam seçici çıplak native görünümle kalan arayüzden kopar.
- Aktif asistan sekmesinin altında tekrar Asistana sor düğmesi vardır.
- Altyazı yokken açıklama, altyazı ve zamanın gönderileceğini söylüyor gibi görünür.

Plan ve uygulama: Öneriler boş sohbet yüzeyinde, yazma alanı hemen altında, kapsam/bağlam bilgisi ayrı bölümdedir. Seçici tema ile uyumludur. Aktif asistan sekmesindeki yinelenen Asistana sor kaldırıldı; diğer sekmelerde asistan girişi korunur. Altyazı bulunmadığında açıklama bunu açıkça söyler; genel soru ve altyazı ekleme yolu anlatılır. Asistan isteğinin hangi bağlamı kullandığı veya izinleri değiştirilmedi.

## 7. Dar Browser asistan paneli

Görünen sorunlar:

- Boş sohbetin ortalanması ile yazma kutusunun alta itilmesi arasında büyük işlevsiz boşluk oluşur.
- İki sütun öneri düğmeleri ve çok küçük açıklama, dar panelde ayrı bir boş ekran hissi verir.
- Alt eylemler kopuk konumlarda durur; bağlam açıklaması çok küçük ve sıkışıktır.

Plan ve uygulama: Aynı gömülü asistan bileşeni, dar dock ve geniş modal için ortak görsel sistem kullanır. Boş sohbette öneri ile yazma alanı birbirine yaklaşır; gerçek mesajlar olduğunda mevcut log kaydırması sürer. Bağlam alanı satıra sarılabilir; temizleme eylemi ikincildir. Araç menüsü ve form kontrolleri dar pencerede taşmaz. 740×920 pencerenin ölçülen içerik genişliği 724 piksel; modalın yatay taşması 0 ve menü genişliği 140 pikseldir.

## Korunanlar ve doğrulama

Görünüm için kaynak/analiz metni yeniden yazılmadı; alıntı doğrulaması, kaynak kimlikleri, spoiler kapıları, örnek seçimi ve AI öncesi onay korunur. İleri kaynaklar, ham düzenleme, dosyadan içe aktarma, Browser okuma ve panel yardımcı menüsü silinmedi. EN/TR ve düşük/kapalı hareket tercihleri korunur. Yeni sağlayıcı/API/IPC yetkisi eklenmedi.

Hedefli sonuçlar: yorum iş akışı 56/56; film inline analiz 13/13; inline editör sahipliği 3/3; RSS UI 12/12; RSS gezinme yarışları 2/2; mevcut Browser Podcast kontrol programı geçti. Sözdizimi ve diff kontrolü geçti. Bir yeni test, eski kodun analiz düğmesinin görünürlüğünü tekrar değiştirdiğini ortaya çıkardı; mantık tek yerde birleştirildi ve aynı test geçti.

Görsel kanıt: `artifacts/dub-next-20261109/requested-screens-1794296566457/`. `analysis-overview.png`, `analysis-evidence.png`, `review-sample.png`, `review-sources.png`, `review-raw.png`, `rss-reader.png`, `assistant-docked.png`, `assistant-advanced.png`, `subtitles-advanced.png`, `assistant-advanced-narrow.png`, `acceptance.json`.

Bu ekranlar gerçek Electron renderer’ında LG 1920×1080 tam ekran ve tek dar pencerede, izole profil ve kontrollü içerikle açıldı. Canlı Letterboxd/RSS/model isteği, kişisel profil, yeni GPU üretimi veya native medya yüzeyi kabulü değildir. İleri araçlar test kabuğu gerçek `playerSide` düğümünü aynı modal sınıfına taşır; üretimdeki kaynak geri yükleme/native occlusion yaşam döngüsü bu görsel koşuda ayrıca denenmedi. Browser Podcast transportunun gerçek medya ile görünürlüğü mevcut kontrollü sahiplik testinin ötesinde canlı kabul ister. Bunlar “tamamı canlı doğrulandı” diye sunulmaz.
