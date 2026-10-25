# Gece çalışma listesi — 2026-10-25

Kullanıcı talebi: mevcut paket tamamlandıktan sonra sabaha kadar50 somut geliştirme belirle ve çalış. Bu bir **iş havuzu**, tamamlanmış50 bulgu veya sabaha teslim garantisi değildir. Başlangıç: codex/book-reliability549. Mevcut paket Rapor549 ile teslim edilir; aşağıdakiler yeni gece kapsamıdır. Kalıcı sınırlar: kısa faydalı hedefli test, mevcut tema, veri/ses korunması, ana dala otomatik merge yok. Ücretli API/kişisel profil kullanılmaz. Doğrulanmayan başarı yazılmaz.09:00 Europe/Istanbul sonrası yeni işe başlanmaz; sonuç/kalan raporu yazılır.

Heartbeat: Gece kitap ve dublaj geliştirmeleri, bu sohbete bağlı saatlik ve4koşumla sınırlı; uygulama kapalı/cihaz çevrimdışı olduğunda kesintisiz çalışma garantisi yoktur. Görev prompt'u sabah09:00 sınırını taşır. Otomasyon kimliği: gece-kitap-ve-dublaj-geli-tirmeleri.

Her madde için durum: Bekliyor / İnceleniyor / Tamamlandı / Ertelendi / Kanıtlanmadı. Gerçek katkı yoksa sırf sayıyı doldurmak için değişiklik yapılmaz. İlgisiz, spekülatif veya pahalı iş ertelenip nedeni yazılır. Her teslimde commit/test/kanıt bağlantısı eklenir.

| ID | Durum | Somut iş | Kabul koşulu |
|---|---|---|---|
| N01 | İnceleniyor | CI sonuçlarını güncel kaynak ve mevcut full549.log ile sınıflandır; tarihsel hata ile yeni regresyonu ayır. | Somut her kırmızı için kök neden/komut ve kapsam kaydı. |
| N02 | Kanıtlanmadı | Uzun veya takılan yerel sağlayıcı E2E testinin süreç/port kapanışını sınırla. | Gerçek süreç ağacı temizlenir; ürün testi silinmez. |
| N03 | Tamamlandı | DOM sink ratchet satırlarına taşınmadan bağımsız kararlı tanımlama ekle. | Kaçışsız yeni sink hâlâ kırmızı; sırf satır taşınması izin boşluğu yaratmaz. |
| N04 | Tamamlandı | CSP testindeki whisper-media sözleşmesini gerçek protokol izinleriyle karşılaştır. | Gerekli protokol izinli, keyfi protokol/ağ izinleri reddedilir. |
| N05 | Tamamlandı | Privileged scheme envanterinin mevcut protokollerini güvenlik kontrolüyle güncelle. | İnceleme kanıtı ve negatif yetki testleri; kör allowlist genişletme yok. |
| N06 | Tamamlandı | Mevcut sabit renk ihlallerini en sık kullanılan yüzeylerden tema tokenlarına taşı. | Açık/koyu görüntü ve kontrast kontrolü; eşik gevşetilmez. |
| N07 | Tamamlandı | assistant-overlay-preload için gerçek frame/mesaj sözleşmesi testi ekle. | Yetkisiz gönderici, eksik payload ve listener kapanışı. |
| N08 | Tamamlandı | native-player için açma/kapatma/yanlış yol sınır testlerini tamamla. | Native oynatma yapılmadıysa açık sınır; sahte GPU iddiası yok. |
| N09 | Tamamlandı | assistant_stream.py için iptal ve bağlantı kesilmesi testini tamamla. | Anahtar/redaksiyon korunur; gerçek ücretli istek gerekmez. |
| N10 | Bekliyor | Interval ratchet eski toplamını gerçek sahiplik/temizlik yaşam döngüsüyle incele. | Sayı tek başına sızıntı sayılmaz; tekrarlı aç/kapat ölçümü. |
| N11 | Bekliyor | M4B export öncesi seçili bölüm/toplam süre/tahmini çıktı boyutu göster. | FFprobe gerçek süre; AAC tahmini olduğu belirtilir. |
| N12 | Bekliyor | M4B hedef sürücü boş alanını güvenilir statfs ile önizle. | Belirsiz disk bilgisinde dürüst durum, önceki dosyaya zarar yok. |
| N13 | Bekliyor | Gerçek uzun FFmpeg M4B işi iptalini Windows süreç testiyle doğrula. | Alt süreç kapanır, geçici dosyalar silinir, önceki hedef korunur. |
| N14 | Bekliyor | M4B encoding için gerçek ilerleme olaylarını ekle. | stderr/progress ayrımı, çıktı tüketimi ve bounded event hızı. |
| N15 | Bekliyor | 100 bölümlü M4B fan-in dosya tanıtıcısı/bellek etkisini ölç. | Ölçülürse bounded concat planı; spekülatif hız iddiası yok. |
| N16 | Bekliyor | Kitap yedeği için dosya sayısı/boyut/kapsam önizlemesi ekle. | Paket öncesi neyin dahil olmadığı görünür. |
| N17 | Bekliyor | Bütün projeler yerine seçili proje yedeği destekle. | Büyük seslerde256MiB sınırını güvenle yönet; bütün RAM okuma artmasın. |
| N18 | Bekliyor | Kitap yedeğinde checksum/bozuk JSON/yarım kopya rollback testlerini genişlet. | Hatalı paket hiçbir mevcut projeyi değiştirmez. |
| N19 | Bekliyor | Geri yüklenen kitapta eksik özgün PDF ve referans durumunu açık göster. | Restore başarılı ifadesi eksik kaynak varlığını gizlemez. |
| N20 | Bekliyor | Geri yüklenen projeye kullanıcı seçimiyle özgün kitap yeniden bağla. | Metin/sayfa kimliği eşleşmeden yanlış PDF bağlanmaz. |
| N21 | Bekliyor | Kurtarmada birden fazla iş günlüğü ve bayat metin durumunu görünürleştir. | Yanlış tamamlanma kaydı otomatik seçilmez. |
| N22 | Bekliyor | capture kaydetme hatasını uygulama genel günlüğü ve proje durumunda göster. | Sessiz catch yerine kurtarılabilir çıktı konumu, özel veri redaksiyonu. |
| N23 | Bekliyor | Yedek alma/restore ile eşzamanlı üretimin tutarlı snapshotını sağla. | Üretilen WAV/manifest aynı kimlikte; yarım dosya onaylanmaz. |
| N24 | Bekliyor | Proje açıldığında yarım iş varsa kurtarma önerisi göster. | Kendiliğinden GPU başlatmaz; kullanıcı denetimi ve açıklama. |
| N25 | Bekliyor | Kitap bazlı referans seçiminin genel dublaj sesiyle etkisini açık göster. | Yanlış referans/döküm sessizce kullanılmaz. |
| N26 | Bekliyor | Hazır M4B çıktısını bağlı kitap rafı kartından aç. | Çıktı kaydı/source yetkisi ve eksik dosyada anlaşılır eylem. |
| N27 | Bekliyor | Proje kopyalamayı metin/ayar kopyası olarak ekle. | Kaynak proje korunur; büyük sesleri kopyalama açık seçenek olur. |
| N28 | Bekliyor | Proje klasörünü güvenli Aç eylemiyle erişilebilir yap. | Yalnız uygulamanın doğrulanmış proje kökü açılır. |
| N29 | Bekliyor | Arşivlenmiş proje yönetimini dar ekran ve klavyeyle doğrula. | Dosya silinmez, geri alma görünür ve isimler okunur. |
| N30 | Bekliyor | Bölüm önceki ses sürümünü seçme ihtiyacını proje geçmişiyle ele al. | Eski WAV korunur; aktif metin hash eşleşmeden hazır sayılmaz. |
| N31 | Bekliyor | Uzun/dolu PDF sayfasında özgün vurgu koordinatlarını sınır/rotation testleriyle doğrula. | Kutular canvas içinde; dönük metin desteklenmiyorsa açıkça atlanır. |
| N32 | Bekliyor | PDF satır sonu tirelerini güvenli ve geri alınabilir hazırlama seçeneğiyle ele al. | Özel ad/kısaltma/sayısal aralık bozulmaz; özgün metin korunur. |
| N33 | Bekliyor | Reader minimum genişliğinin900px altındaki düğme erişimine etkisini incele. | Gerekirse sadece okuyucu düzeni; genel pencere davranışı izinsiz bozma. |
| N34 | Bekliyor | Türkçe I/İ/ı ve birleşen Unicode işaretlerinde vurgu eşlemesini sınayarak düzelt. | Yanlış sözcük vurgusu yerine açık eşleşmeme durumu. |
| N35 | Bekliyor | Özgün PDF vurgusuna tıklayarak seek işini native E2E ile sınama. | Doğru grubun gerçek başlangıç zamanı, klavye erişimi. |
| N36 | Bekliyor | Çeviri/orijinal metin değişince ses kaynağı ve vurgu kimliğini koru. | Farklı diller arasında sahte birebir hizalama yapılmaz. |
| N37 | Bekliyor | PDF okuma görünümünde sayfa/alıntı yer imi ekle veya mevcut raf yer imlerine bağla. | Kalıcı kaynak kimliği; orijinal belge değişmez. |
| N38 | Bekliyor | Kitap içinde sınırlı tam metin arama ve sayfa/bölüme gitme ekle. | Büyük kitapta UI bloklanmaz; asistan bağlamı doğru sayfaya geçer. |
| N39 | Bekliyor | Raf okuma konumuyla üretim bölümüne açık eşleme eylemi ekle. | Sessiz otomatik yanlış konum taşıma yok. |
| N40 | Bekliyor | EPUB başlık/kapak/bölüm kimliğinin üretim projesine aktarımını tamamla. | Güvenli HTML/metin ayrımı; kitap biçimi kaybolmaz. |
| N41 | Bekliyor | Review metni düzenlendikten sonra yalnız değişen grubun yenilenmesini sınama. | Metin/plan key değişimi eski başka grubu zorla üretmez. |
| N42 | Bekliyor | Dublaj Bu grubu dinle için metadata yüklenmeden tıklama ve aralık sonunu doğrula. | Çift oynatma/NaN seek yok; kaynak değişince ses durur. |
| N43 | Bekliyor | Kalite listesinden metin planına eşlemeyi kaynak key/sıra değişiminde sağlamlaştır. | Eksik key yanlış satıra atlamaz. |
| N44 | Bekliyor | Failed/sessiz grupların manuel ready kabulüne karşı negatif test ekle. | Yalnız oynatılabilir review ve açık kullanıcı onayı. |
| N45 | Bekliyor | Yeni kalite/durum metinlerinde EN/TR dinamik dil geçişini tamamla. | Kullanıcı metni çevrilmez; ham durum kodu yerine anlaşılır etiket. |
| N46 | Bekliyor | Kitap reader/source değişirken eski ses ve bütün listenerların kapanışını ölç. | Tekrarlı aç/kapat sonrası dinleyici/iş sayısı artmaz. |
| N47 | Bekliyor | Letterboxd gerçek public pagination/sıralama rotalarını resmî sayfalardan doğrula. | Test sentetik URL kabulünü gerçek site desteği diye sunma. |
| N48 | Bekliyor | Birleşik yorum örneğinde her sayfanın provenance URL/örnek sayısını koru. | Aynı-film kapısı ve spoiler örneklemi korunur; consensus iddiası yok. |
| N49 | Bekliyor | Çevrimdışı okuma listesinde toplam MHTML disk kullanımı ve cleanup uyarısı göster. | Sahip olunmayan dosya silinmez; başarısız silme görünür. |
| N50 | Bekliyor | Sezon SRT no-clobber fallbackini ENOTSUP/EPERM fault injection ile sınama. | Mevcut hedef ve özgün dosya korunur; yarım hedef temizlenir. |

## Çalışma günlüğü

05:10 — Liste oluşturuldu;50madde henüz tamamlanmadı. Mevcut full549.log arka planda devam ediyor; bilinen envanter/CSP/renk hataları Rapor549 içinde açık. İlk gece adımı son koşumun bitip bitmediğini denetlemek; aynı uzun testi gereksiz yeniden başlatma.

05:24 — [Rapor550](BROWSER_BUG_REPORT_550.md), kod2c217ab974797f609132aeebe653d75f7d9eb54e. N03–N09 ilk kapsamı tamamlandı (7madde); N09 mevcut8testin doğrulanması ve kapsam tarayıcısı düzeltmesi, yeni model özelliği değildir. N01 yerel21kırmızı sınıflandı,20dosya hedefli yeşil; uzakCI sonucu beklenmediği için İnceleniyor. Açık fixed-sleep26>21 eşiği değiştirilmedi. N02 E2E46kontrolPASS, takılma kanıtlanmadı; varsayımsal ürün kodu eklenmedi. Windows native book/PDF+bridge exit0; açık/koyu görüntüler incelendi. N10 ve N11–N50 sıradaki havuz;50tamamlandı denmez.
