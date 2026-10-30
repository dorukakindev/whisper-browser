# R815 ana ajan bulguları

## R815-B04 (ROOT01) — Büyük harfli video uzantısı gömme işinin kurtarma kaydını geçersiz kılıyor

movie.MP4 veya movie.MKV için burninOutputPaths ile oluşturulan temp/out yollarını aynı recovery doğrulayıcısına ver.

Gözlenen: Küçük harfli movie.mp4 recoveryMatches=true; .MP4 ve .MKV false. Oluşturulan ad movie.MP4.altyazili… olurken recovery regexi movie.altyazili… bekliyor.

Etki: Windows kamera/video dosyalarındaki yaygın büyük harfli uzantıda kesilen uzun gömme işi sonradan tanınmayabilir; yeniden başlatma gerekebilir. Kaynak dosyanın silindiği iddia edilmez.

Sınır: Üretim yol üretici ve doğrulayıcı doğrudan çalıştırıldı; uzun ffmpeg işi kesilmedi.

## R815-B05 (ROOT02) — Kitap projesi yedeği yer imlerini geri yüklemiyor

Yer imi olan geçerli proje için ses dahil exportBooks, ardından boş klasöre importBooks çalıştır.

Gözlenen: Başlangıçtaki bookmarks dizisi geri yüklenen project.json içinde tamamen yok. export/import ikisi de başarılı.

Etki: Yeni bilgisayarda geri yükleme sonrası işaretlenmiş pasaj ve dinleme noktaları kaybolur. Orijinal proje bu denetimde değiştirilmedi.

Sınır: Sentetik bölüm/ses ve metadata; kişisel kitap veya yedek kullanılmadı.

## R815-B06 (ROOT03) — Kitap yedeği 1000 üzerindeki konuşma gruplarını sessiz kesiyor

Üretimin izin verdiği en çok5000 grubun altında kalan1001 gruplu bölüm oluştur; son grubu review yap; ses dahil yedekle ve geri yükle.

Gözlenen: 1001 grup1000 oluyor; sondaki tek review grubu yok oluyor. Tam ses dosyası korunuyor, ancak son bölümün konuşma haritası ve inceleme girdisi kayboluyor. Ayrıca taşınan grupların verification ayrıntıları da dar yedek şemasında yok.

Etki: Sesin sonundaki vurgulama/inceleme ve grup bazlı onarım eksik kalır; sorunlu grubun neden/konumu kaybolur. Verification alanı kaybı aynı yedekleme kapsamı içinde ele alındı, ayrı bug sayılmadı.

Sınır: 1001 saniyelik sentetik sessiz WAV ve metin grupları; model kalitesi denenmedi. Bölümün status=review alanı otomatik ready oldu iddiası yok.

## R815-B07 (ROOT04) — Kaydedilebilen uzun kitap bölümü başarıyla yedekleniyor ama geri yüklenemiyor

Book-save900000 karaktere kadar kabul ederken100001 karakterli geçerli bölümü ses hariç yedekle ve geri yükle.

Gözlenen: Export başarılı; import Invalid chapter. hatası veriyor. Dışa aktarma, kendi geri yükleme sözleşmesinin100000 karakter tavanını uygulamıyor.

Etki: Yedek var sanılarak makine taşındığında veya orijinal kaldırıldığında kullanıcının uzun bölümüne uygulama içinden erişilemiyor.

Sınır: Asıl900000 sınırı gerçek book-save yolundan okundu;100001 örneği gerçek export/import ile çalıştırıldı.

## R815-B08 (ROOT05) — Model yöneticisi güncel HF_HUB_CACHE yolunu görmüyor

Hugging Face standart HF_HUB_CACHE özel dizinini kullan; modelCacheRoots/scanModelCache ile durum al. Aynı dizini eski HUGGINGFACE_HUB_CACHE ile vererek karşılaştır.

Gözlenen: HF_HUB_CACHE ve yalnız HOME verilen durumda kök listesi boş. Kod yalnız eski HUGGINGFACE_HUB_CACHE, HF_HOME, TRANSFORMERS_CACHE, USERPROFILE ve uygulama model klasörünü okuyor.

Etki: Kurulu model yok/eksik görünebilir; disk bilgisi ve silme yönetimi yanlış önbelleği hedefler. Linux HOME/XDG varsayılanları da aynı kök çözümleme sorununun parçasıdır, ayrı sayılmadı.

Sınır: Gerçek model indirilmedi. Standart değişken Hugging Face birincil belgesinden doğrulandı; kişisel ortam değiştirilmedi.

## R815-B09 (ROOT06) — Bozuk okuma listesi indeksi sonraki kayıtta sessizce üzerine yazılıyor

Mevcut MHTML dosyası varken index.json bozuk JSON olsun; başka sayfa için prepare/commit çalıştır.

Gözlenen: Okuma hatası boş liste sayılıyor; yeni indeks yalnız yeni sayfayı içeriyor. Eski arşiv dosyası diskte kalıyor ama uygulama artık onu listelemiyor; kayıt işlemi başarı dönüyor.

Etki: Kayıtlı çevrimdışı sayfaların dizini ve metadata kurtarılabilir son haliyle korunmuyor. Bu, BR02 içerik dosyasının yarım yazılması ve BR03 silme hatasından farklıdır.

Sınır: Sentetik bozuk indeks ve iki sahte MHTML kullanıldı; kişisel arşiv yok.

## R815-B10 (ROOT07) — Yeni bölüm sesi seçilince eski M4B hâlâ güncel sayılıyor

Bölüm metni aynı kalırken sesli kitap dışa aktar; sonra bölüm için farklı ses kaydı/take seç veya yeniden üret. audiobookInfo sonucunu oku.

Gözlenen: take-A→take-B değişiminden önce/sonra current=true. Metin değişikliği negatif kontrolünde false. M4B kaydı yalnız textHash saklıyor; ses çıktı kimliği yok.

Etki: Kullanıcı düzeltilmiş sesin paketlenmiş olduğunu sanıp eski sesli kitabı dinler veya paylaşır.

Sınır: Gerçek nested audiobookInfo fonksiyonu ve dosya statı çalıştırıldı; M4B yeniden kodlanmadı. Mevcut açıkça önceki çıktıyı oynatma hakkı kaldırılması önerilmez.

## R815-B11 (ROOT08) — Browser tablist içinde tab olmayan etkileşimli düğmeler bulunuyor

Ayrı Windows profiliyle Browser ekranını ve araç menüsünü aç; gerçek render üzerinde axe WCAG taraması yap.

Gözlenen: browserTabStrip role=tablist için aria-required-children critical: sıradan button/aria-busy çocukları. Sekme şeridi, tab rolü sözleşmesine uymuyor.

Etki: Ekran okuyucuda sekme sayısı/seçimi ve düğmelerin ilişkisi yanlış sunulabilir; klavye/yardımcı teknoloji gezinmesi tutarsızlaşır.

Sınır: Gerçek Windows Electron+axe ve screenshot doğrulandı. NVDA/JAWS ile fiziksel kullanım yapılmadı. Aynı öğelerin çok dil/ekrandaki tekrarları ayrı sayılmadı.

## R815-B12 (ROOT09) — Browser araç menüsünün ARIA menu rolü içindeki kontrollerle uyuşmuyor

Browser üç nokta menüsünü açıp gerçek render üzerinde axe çalıştır.

Gözlenen: browser-more-popover role=menu altında input,button,summary var; aria-required-children critical. Menü öğesi rolleriyle uyumlu ağaç yok.

Etki: Yardımcı teknoloji bu alanı menü diye ele alırken içteki arama/zoom/alt menülere beklenen biçimde erişemeyebilir.

Sınır: ROOT08 farklı role sahip başka DOM köküdür; ikisi ayrı semantik yapılandırma gerektirir. Axe sınıflandırması ekran okuyucu uçtan uca kabulü diye sunulmadı.

## R815-B13 (ROOT10) — Oynatma merkezindeki altyazı araması senkron gecikmesini yok sayarak seek yapıyor

Altyazı20sn, etkin gecikme+10sn olsun; Oynatma ve sahneler içindeki altyazı aramasından o satıra tıkla.

Gözlenen: Video20sn konumuna gidiyor; aynı altyazının video zamanı subtitleVideoTime ile30sn olmalı. Gerçek tam modülün arama düğmesi çalıştırıldı.

Etki: Senkronu ayarlanmış filmde aranan replik yerine yanlış sahne açılır.

Sınır: Kontrollü HTML video ve10sn dönüşüm; fiziksel video dinlenmedi.

## R815-B14 (ROOT11) — MKV içindeki TTC font koleksiyonları font çıkarımında atlanıyor

Gerçek Windows cambria.ttc fontunu0,4sn sentetik MKVye attachment olarak ekle; extractFonts çağır.

Gözlenen: ffprobe TTC attachmentı gördüğü halde sonuç0font. readFonts TTC imzasını destekliyor, fakat attachment filtresi yalnız ttf/otf/woff/woff2 uzantısını alıyor.

Etki: Gömülü font koleksiyonu kullanan özellikle CJK ASS altyazıları beklenen fontu alamaz; fallback/eksik glif riski oluşur.

Sınır: Gerçek ffmpeg/ffprobe/modül doğrulaması yapıldı; font ve medya Git’e alınmadı. Farklı CJK gliflerinin görsel çıktısı ölçülmedi.

## R815-B15 (ROOT12) — HTTPS ağ medyası HTTP/RTSP yolundaki native oynatıcı geçişini atlıyor

Medya merkezindeki aynı ağ akışını sırasıyla http,https,rtsp protokolüyle playStream üzerinden aç.

Gözlenen: Gerçek playStream fonksiyonunda HTTP ve RTSP NativePlayerUI.start çağırıyor; HTTPS çağırmıyor. Regex https harfini içermiyor. HTTPS m3u8 için ayrı HLS kolu var; bu bulgu m3u8 dışındaki ağ medyasına aittir.

Etki: Chromiumun çözemediği ama native motorun desteklediği HTTPS medya, HTTP eşdeğeri çalışırken açılamayabilir; kullanıcı motoru ayrıca değiştirmek zorunda kalır.

Sınır: Native dispatch farkı doğrudan doğrulandı; uzak HEVC/DTS sunucusu veya DRM kabulü yapılmadı. HTTPSte desteklenen Chromium videolarının hepsi bozuk denmiyor.

## R815-B16 (ROOT13) — WMV/WMA kaynakta altyazı gömme MP4e uyumsuz ses kopyalıyor

0,4sn sentetik WMV video+wmav2 ses oluştur; burninAudioArgs sonucundaki -c:a copy ile MP4 mux et.

Gözlenen: wmv için helper copy seçiyor; gerçek FFmpeg codec wmav2 in stream1 not supported in container, exit-22. Aynı iş AAC yeniden kodlandığında mux desteklenir.

Etki: Windows WMV videolarında gömme işlemi gereksiz biçimde başarısız olur. Kaynak/video silinmez.

Sınır: Üretim audio argüman seçimi ve gerçek FFmpeg mux aşaması doğrulandı; tam libass yakma yapılmadı. AVI/PCM örneği mevcut FFmpegde çalıştı ve bug sayılmadı.

## R815-B17 (ROOT14) — Arşivlenmiş projelerle geçerli kitap yedeği 100 proje sınırında geri yüklenemiyor

100projeyi arşivleyip1yeni aktif proje oluştur (aktif sınır1/100); bütün projeleri ses hariç yedekle ve boş hedefe geri yükle.

Gözlenen: exportBooks count101 ile başarı verir; importBooks books.length>100 nedeniyle Invalid book backup. döndürür.

Etki: Arşivlemenin izin verdiği kütüphane boyutunda uygulamanın ürettiği bütün yedek kullanılamaz hale gelir. ROOT04 tek bölüm boyutuna, bu bulgu aktif/arşivlenmiş proje sayısı sözleşmesine aittir.

Sınır: 101küçük sentetik proje kullanıldı; kişisel arşiv yok. Tek aktif proje, normal ürün aktif limitini aşmaz.
