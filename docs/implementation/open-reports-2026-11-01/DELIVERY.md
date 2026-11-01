# Açık rapor paketi — uygulama teslimi

Başlangıç: `af41ed6e3c6d38895e0cf4d0da77e622c21f5dcd` master. Ürün kodu: `9cb52c6c5dc2f304b2179c848637049989edc8e1` (ana uygulama + RSS/kitaplık), önceki renk rolleri `3d874a19`.

## Düzeltilen açık kayıtlar

34 rapor kaydı, kökler tekrar yeni keşif sayılmadan güncel kodda ele alındı:

- R830 F01/F02 ve R830-01/B98: doğru dublaj grubu, kaynak sözlüğü bütünlüğü, kaynak bütçesinde eski atfa yeni metin bağlanmaması.
- R831 F01–04: ilk offline kayıt, son grup filtresi, CSV kanal kimliği, indeks hatasında silinen arşivin korunması.
- R833 F01–11: kuyruk taşıma/silme ayrımı, başarısız eklemede kaynak korunması, hayalet iş, dil kapsamı, not bağlantısı, dış değişikliği ezmeyen undo/yeniden deneme, bayat waveform, uzun playlist bildirimi, güncel sıra ve filtreli sayfalama.
- R835 F01–07: kalıcı web/kitap atıfları, bağımsız geçmiş spoiler onayı, en yeni kişisel değerlendirme, geçerli yorumun bastırılmaması, eksik ara pasaj görünürlüğü, ses metni düzenleme hatasının kayıtta korunması.
- R837 F01–04: çok alt etiketli dil kimliği, site/path/tab dili, özgün başlık eşleşmesi ve tekrar izlemenin ayrı film sayılmaması.
- R840 F01–05: tam yorum403 fallback, geç kalan yanlış film kimliği, yorumcu bağlantısı ayrımı, gerçek sahne kapsamı ve okuyucunun iç kontrollerinin durum iletimi.

ID başına kök/kanıt/sınır ilgili assistant-bugs.md, library-bugs.md, continuity.md ve library-features.md içindedir. R815'in tüm134kaydı yeniden açılmadı; B63 geçmiş azaltılmış/açık sınırı korunur. Tarihsel BUG probunun başarılı olması düzelme kabulü değildir.

## Kullanılabilir ürün ekleri

- Sol üst uygulama menüsünden **Akışlar / Feeds**: URL/site keşfi ve abone olmadan önizleme; RSS/Atom/JSON Feed; kalıcı girdiler, tür/arama/okundu/kaydet/daha sonra; abonelik yönetimi, OPML önizleme/seçili içe alma ve export.
- Koşullu yenileme, son başarı/hata/çevrimdışı eski içerik, duraklatma ve yalnız uygulama açıkken bounded catch-up. Kaynak özetinin tam makale olmadığı görünür; asıl kaynak mevcut Browser'a gider.
- Yapımla ilişki **önizleme + açık onay**; film sayfasında doğrulanmış ilişkili kaynaklar; kaynak kimliği değişirse eski bağ geçerli sayılmaz. Okumak veya fragman oynatmak filmi izlendi yapmaz.
- Bir–üç seçili kaynağı asistana bağlama, kapsam/özet bilgisi, kaynakla sınırlı arama ve kalıcı F atıfları. Kendiliğinden model isteği yok.
- Katalog takma adları ve bounded çoklu arama/rank birleşimi; kitap sonuçlarında bölüm bağlamı ve kaynak/revizyon gruplaması.
- Kütüphanede sürüm/kesim, sıralı parça ve bonus dosyaları; ayrı fiziksel kaynakta ayrı devam konumu; metadata alan kilitleri; seçili NFO salt okunur önizleme; klasör farkları için kalıcı manuel karşılaştırma. Kaynak dosya taşınmaz/silinmez.

## Kısa kabul ve gerçek sınırlar

Root son entegrasyon kontrolü33/33, syntax/compile68/68 geçti; CSS sabit renk kontrolü402/419. Renk token dönüşümü gerçek Electron'da iki tema/iki genişlikte1368computed-değer eşitliğiyle doğrulandı. Ajanların hedefli kontrolleri ilgili notlarda; test sayıları yeni bug sayısı değildir. Paralel test dosyası adı çakışması teslimden önce ayrıldı: library-bugs8/8 ve library-features ayrı dosyalarda korunur.

Akışlar gerçek main/preload/parser/store ile izole Windows1440/680genişliklerinde TRkoyu/ENaçık; okuyucu açma ve RSS→asistan kaynak bağlama geçti. Kütüphane NFO/sürüm/fark kontrolleri native geniş/dar görüntülerde doğrulandı. Görseller kontrollü kaynak içeriğidir, canlı AI cevabı değildir. Criterion resmi beslemesi gerçek200ile20girdi verdi; kişisel profil/API kullanılmadı.

- Uzun playlist için ilk50açık EN/TR onayı uygulanır; tüm liste kesintisiz devamı değil.
- Çok parçalı film açık parça kontrolleri kullanır; birleşik global zaman çizelgesi/otomatik ardışık oynatma yok.
- Klasör farkları manuel snapshot; sürekli yeni watcher değil.
- RSSHub özel route kataloğu, otomatik film eşleştirme, haftalık AI özeti, kurallar, kaynaklardan film öneri rafı ve paylaşılabilir RSSexport tamamlanmış sayılmaz. RSS okuma durumları OPMLexport'a dahil değildir.
- Podcast enclosure mevcut stream geçmişiyle devam eder; gerçek ses donanımı/format/MPV/DRM kabulü yapılmadı.
- Ücretli canlı model kalitesi, tam npmtest ve yeni CI sonucu iddiası yok. Önceki PR777 CI kırmızı;12ilgili dosya başlangıç sürümüyle karşılaştırıldı. Renkteki ek sabitler giderildi; eski kırmızılar topluca kapatılmış sayılmaz.
- Kullanıcının son talimatı: GitHub Actions çalıştırma; bu teslim `[skip ci]` ile gönderilir, CIbeklenmez. Kişisel açık uygulama kapatılmadı.

## Araştırma kapsamı ve kalanlar

[207kartın tamamının envanteri](research-cards.json) ve [kısa indeks](README.md) kayıpsız tutuldu; her kartta kaynak/lisans, kod kanıtı, birleştiği mekanizma ve durum var. **207kartın hepsi uygulanmış değildir.** Bu teslim yalnız yukarıdaki çalışan mekanizmaları ve açık hata paketini kapatır. Kalanlar `remaining/partial` olarak durur; örtülü tamamlandı iddiası yok. Mevcut veriler ve ileri ayarlar korunur.

Yeni runtime bağımlılığı `saxes6.0.0` (ISC); önceden dev zincirinde sabitlenmiş aynı sürüm/integrity üretim bağımlılığına yükseltildi, xmlchars bağımlılığı korundu. Ağdaki npmcache isteği başarısız olduğundan lock içindeki mevcut sabit kayıt kullanıldı; rastgele paket/sürüm yüklenmedi. Yerel çalışma ortamında aynı paket zaten kurulu. Üst menü/grafit–amber/sinematik medya yönü korunur.
