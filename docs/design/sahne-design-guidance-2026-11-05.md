# Sahne referansından tasarım çalışma rehberi — 2026-11-05

## Kaynak ve yetki

Kullanıcı beğendiği Claude tasarımından öğrenilenlerin DESIGN.md ve hafızaya kaydedilmesini istedi. Kaynak `C:/Users/K/Downloads/files (5).zip`; SHA256 `f0a9b277e0ac2682c36bffcecf9e8f557a9be2d2ae5ef748b0be9d3cdb1c86ee`. Dış ve iç ZIP CRC kontrolü geçti. İncelenenler: KURULUM.md, tasarim-notlari.md, DOGRULAMA.md, doğrulama betiklerinin açıklaması, Sahne CSS/JS ve podcast/çift dilli uygulama PNG'leri.

Paket ayrıntılı A/B/C tasarım muhakemesi yanıtını içermiyor; bu rehber, incelenen kompozisyondan ve koddan çıkarılan proje uyarlamasıdır. Claude'un açıklaması veya testleri burada yeniden yapılmış gibi sunulmaz. Paketin patch/kopyalama komutları talimat olarak çalıştırılmadı. Bu kayıt kod entegrasyonu veya bütün maketlerin yeni onayı değildir.

## Güncel öncelik

Kullanıcının 2026-11-05 kararı: görünüm en önemli önceliktir. Etkileyici kompozisyon, zengin atmosfer, güçlü hover/geçişler ve sürekli dekoratif animasyon tasarım ihtiyacına göre kullanılabilir. Bu rehber sakinlik, minimalizm veya düşük hareket zorunluluğu getirmez. Görsel çözüm tasarımcıya aittir; erişilebilirlik, hareket tercihleri ve gerçek veri/oynatma sahipleri korunur. Ana karar [DESIGN.md](../../DESIGN.md) içindedir.

## Önce kompozisyon, sonra kontroller

Önce ekranın tek cümlelik işini ve en güçlü odağını belirle. Podcast dinlerken içerik kimliği ve konuşulan cümle; çift dilli izlerken video ve onunla ilişkili metin baskındır. Arama, filtre ve teknik ayarları eşit büyüklükte kartlara dağıtarak başlama.

Podcast referansında kapak/kimlik/transport bir görsel küme, büyük transkript ikinci kümedir. Etkin cümle tipografi ve sıcak yüzeyle öne çıkar; önceki/sonraki cümleler bağlam sağlar. Çift dilli referansta video, altyazı ve dock tek eksendedir; transkript ayrı okuma alanıdır. Bu dağılım her başka sayfaya zorla uygulanacak sabit kolon şablonu değildir.

Tasarımın karakterini taşıyanlar: medya ölçeği, metnin satır uzunluğu, güçlü/ikincil yazı oranları, ortak hizalar, gruplar arası boşluk ve görsel hareketlerin kompozisyonla ilişkisi. Aynı düğmeleri koyu kutulara dizip üstüne amber ve blur eklemek bu kompozisyonu üretmez.

## Uygulanabilir kararlar

| Konu | Bu projede uygulanacak ilke | Kaçınılacak yaklaşım |
|---|---|---|
| Odak | Her ekranda bir baskın medya/okuma alanı; ikincil işlemler tek anlaşılır grupta. | Her özelliği aynı ağırlıkta kart veya form yapmak. |
| Tipografi | Etkin içerikle metadatayı boyut/ağırlık/ölçüyle ayır; uzun gerçek başlık ve TR çeviriyle yerleşimi çöz. | Her yere büyük başlık ya da bütün metni tek küçük ölçekte basmak. |
| Yüzey | Yüzey, ışık, cam ve gölge katmanları görsel kimliği ve içerik ayrımını güçlendirebilir. | Görsel katmanlarla içeriğin okunabilirliğini veya eylemlerin bulunabilirliğini kaybetmek. |
| Atmosfer | Medya görseli, renk ve ışıkla güçlü bir atmosfer kur; yoğunluğu ekranın kompozisyonuna göre seç. | Atmosfer oluştururken okunabilirliği veya ürünün görsel bütünlüğünü kaybetmek. |
| Kontroller | Görünür ana eylem, ulaşılabilir ikincil araçlar ve ileri ayarlar. | İşlevi kaybetmek veya yalnız hover ile keşfedilebilir bırakmak. |
| Okuma | Pasif transkriptte blur yerine okunur opaklık; açık aktif satır. | Geçmiş cümleleri okunamaz yapmak. |
| Alan | Video + transport kısa ekranda birlikte görünür; uzun altyazının alanı sınırlı. | Başlık/altyazı büyürken oynatmayı ekran dışına itmek. |

Paketin sayıları evrensel yeni token değildir. Örneğin kapak için `clamp(150px,27vh,300px)`, başlık için `clamp(20px,2.1vw,32px)` medya ile pencere yüksekliği arasındaki bağı gösterir. Yeni yüzeyde mevcut font/renk/hareket sahipleri kullanılır; referansın paleti, tipografisi, köşeleri ve hareketleri yeni ekranın kompozisyonuna ve ürün kimliğine göre uyarlanır; yoğun veya sürekli hareket için genel yasak yoktur. Onaylı medya sayfalarının IBM Plex Sans ailesi ve kendi bileşen sözleşmeleri korunur.

## Her UI işinde kısa çalışma akışı

1. Mevcut ekranı ve ilgili onaylı referansı incele; işlev/veri/ileri ayar sahiplerini belirle.
2. Tam ekran kompozisyonunu kur: odak, medya oranı, metin ölçüsü, eksenler ve ikincil araçların yeri. Eksik kararları yalnız CSS süsüyle kapatma. Mevcut onaylı yön için tekrar onay döngüsü oluşturma.
3. Bir temsilî görüntüde önce büyük sorunları düzelt: odak yokluğu, yanlış medya ölçeği, hizalar, boşluk, içerik/araç dengesi. Sonra kenarlık/ikon/hover ince ayarı yap.
4. Mevcut olay ve oynatma sahiplerine bağla; teknik aktarımda beğenilen kompozisyonu basit bir forma indirme. Native kısıt varsa etkilediği alanı açıkla ve yalnız o alanı uyarla.
5. Gereken bir geniş/bir dar görünüm ve değişen birkaç etkileşimle kontrol et. Okunabilirlik, kontrollerin erişimi, uzun/boş/hatalı içerik ve reduced-motion ihtiyacını hedefli değerlendir. Yüzlerce çekim veya benchmark yok.
6. Az sayıda anlamlı son görsel sun; hangi kaynağın gerçekten denendiğini belirt. Test başarısı estetik kabul değildir. Kötü kompozisyonu test sayısıyla savunma.

## Hareket ve durum doğruluğu

Bir sahnenin imza anı, etkin cümlenin yerleşmesi veya görünüm değişirken içeriğin sürekliliği olabilir. Hareketin çeşitliliği, yoğunluğu ve sürekliliği tasarımın görsel amacına göre belirlenir; dekoratif hareket de kullanılabilir. Mevcut kesilebilir motion sahibi ve süre ailesi başlangıç noktasıdır, estetik üst sınır değildir. Azalt/kapalı/OS tercihlerini uygula ve görünmeyen penceredeki animasyonu durdur. Onaylı tasarımların görsel etkisini koru.

Kelime dolması yalnız gerçek kelime zamanıyla; diğer durumda açık cümle ilerlemesi. Metin yoğunluğu ses dalgası diye sunulmaz. Dil rozeti gerçek iz verisinden gelir. Elle kaydırınca takip kullanıcı Konuşmaya dön diyene kadar kapalı kalır. Çoklu/belirsiz çeviri, bağımsız kaymalar, zamansız metin, kaynak değişimi ve gecikmiş sonuç korumaları görünüm uğruna gevşetilmez. Tek mevcut oynatma/ASR/çeviri motoru korunur.

## Kanıt sınırları ve korunacak tasarımlar

Paket Linux/Xvfb/stok Electron ve kontrollü video/WebVTT kabulü bildiriyor. İş şeridi yapay iş durumuyla sınanmış; Windows/castlabs/mpv, gerçek YouTube/RSS/Whisper/çeviri, açık tema ve yerel ses modu tam doğrulanmış değil. Bu tur yalnız paket okundu, görseller incelendi ve belgeler güncellendi; canlı test yapılmadı.

Görüntülerde gerçek test videosu artık yuvada, fakat küçük video üzerindeki native altyazı alanı/scrollbar ve videodaki altyazıyla alt kartın tekrarı gibi bütünlük sorunları otomatik örnek alınmaz. Tasarım fikrini öğren; referansın kusurunu kopyalama.

Podcast kütüphanesi ve yeni tam ekran yerel oynatıcı/sözlük yüzeyi yalnız maket; Home/Keşfet/film yeni yerleşimleri de yalnız maket. Mevcut onaylı sayfalar kullanıcı kapsamı olmadan yeniden tasarlanmaz. Paket sürümü değişirse kapsam/kanıt yeniden okunur.
