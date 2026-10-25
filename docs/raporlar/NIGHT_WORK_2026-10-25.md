# Gece çalışma listesi — 2026-10-25

Kullanıcı talebi: mevcut paket tamamlandıktan sonra sabaha kadar50 somut geliştirme belirle ve çalış. Bu bir **iş havuzu**, tamamlanmış50 bulgu veya sabaha teslim garantisi değildir. Başlangıç: codex/book-reliability549. Mevcut paket Rapor549 ile teslim edilir; aşağıdakiler yeni gece kapsamıdır. Kalıcı sınırlar: kısa faydalı hedefli test, mevcut tema, veri/ses korunması, ana dala otomatik merge yok. Ücretli API/kişisel profil kullanılmaz. Doğrulanmayan başarı yazılmaz.Son kullanıcı talebi eski 09:00 sınırını kaldırdı: 08:17 sonrası yararlı iş ve bütçe oldukça kapsamlı devam edilir; aşağıdaki güncel protokol önceliklidir.

Heartbeat: 25 Ekim 2026 Europe/Istanbul **08:17 ilk devam, 08:20 yedek deneme**. Aynı sohbette iki tarihli uyanış; ikinci uyanış çalışan işi yeniden başlatmaz. Eski saatlik dört koşum değiştirildi. Otomasyon kimliği `gece-kitap-ve-dublaj-geli-tirmeleri`. Cihaz/uygulama kapalıysa veya hesap limiti hâlâ doluysa başlama garantisi yoktur.08:20 de başarısız olursa başarı iddiası üretilmez.

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
| N11 | Tamamlandı | M4B export öncesi seçili bölüm/toplam süre/tahmini çıktı boyutu göster. | FFprobe gerçek süre; AAC tahmini olduğu belirtilir. |
| N12 | Tamamlandı | M4B hedef sürücü boş alanını güvenilir statfs ile önizle. | Belirsiz disk bilgisinde dürüst durum, önceki dosyaya zarar yok. |
| N13 | Tamamlandı | Gerçek uzun FFmpeg M4B işi iptalini Windows süreç testiyle doğrula. | Alt süreç kapanır, geçici dosyalar silinir, önceki hedef korunur. |
| N14 | Tamamlandı | M4B encoding için gerçek ilerleme olaylarını ekle. | stderr/progress ayrımı, çıktı tüketimi ve bounded event hızı. |
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

06:15 — [Rapor551](BROWSER_BUG_REPORT_551.md), kod55d92c9d36a6be5499d4624a35f85c26b9da2387. N11–N14 tamamlandı; toplam11 maddenin ilk kabul kapsamı tamam. Süre/tahminiAAC/boşalan/bölüm sırası özetlenir, gerçek hedef alanı kontrol edilir, FFmpeg ilerlemesi gösterilir. Gerçek Windows FFmpeg iptalinde child close, eski hedef ve temp/metadata/lock doğrulandı.45 hedefli test PASS; native Windows PDF/Review/2chapterM4B ve EN/TR açık/koyu önizleme exit0. N15 gerçek100bölüm fan-in ölçümü, N10 ve sonraki kitap yedek/reader işleri açık. Tam paket/CI beklenmedi; fixed-sleep26>21 bilinen açık devam ediyor.

## Güncel uzun çalışma protokolü — 06:42

Kullanıcı üç-beş maddeyle bırakılmamasını, yenilenen bütçenin kapsamlı işe ayrılmasını ve hedef olarak sürdürülmesini açıkça istedi. Bu talep önceki09:00 kesimini geçersiz kılar. İşe08:17'den önce yeniden başlanmayacak; şimdi yapılan yalnız bu plan/otomasyon kaydıdır.08:20 yedek deneme,1saat45dakikalık yenilenme payına karşılık gelir.

11 madde ilk kabul kapsamıyla tamamlandı. **39 kalan/inceleme maddesi** vardır; bunların hepsi yeni hata değildir. N01/N02/N10 gibi doğrulama işleri ürün bugı uydurularak sayılmaz. Mevcut sağlam kod, test veya kullanıcı verisi sırf çıktı sayısını artırmak için değiştirilmez.

| Paket | Maddeler | Somut teslim odağı |
|---|---|---|
| A | N15, N16, N17, N18, N23 | Büyük M4B fan-in ölçümü; yedekte boyut/dosya/kapsam önizlemesi ve seçili proje; bozuk paket geri alma ve üretimle tutarlı snapshot. Ölçülmeyen hız kazancı iddiası yok. |
| B | N19, N20, N21, N22, N24, N25 | Eksik PDF/ref durumları; kimliği doğrulayarak kaynak yeniden bağlama; yarım iş kurtarma önerileri ve bayat/çoklu günlükler; ses kaydetme hatasını görünür kılma; proje sesinin kapsamını açıklama. |
| C | N26, N27, N28, N29, N30, N40 | Kitap rafından M4B; güvenli proje kopyası/klasör açma/arşiv yönetimi; önceki ses sürümü ve EPUB başlık/kapak/bölüm kimliğini koruma. Büyük dosya kopyası örtük olmaz. |
| D | N31, N32, N33, N34, N35, N36, N37, N38, N39 | PDF kutu/rotation/Unicode eşlemesi; güvenli tire hazırlama; dar ekran ve klavye; gerçek kutudan seek; doğru dil/ses kimliği; yer imi, arama ve raf konumu eşlemesi. Çevrilmiş metne sahte birebir vurgu yok. |
| E | N41, N42, N43, N44, N45, N46 | Yalnız değişen grubu üretme; metadata gelmeden aralık dinleme; kalite-plan kimliği; başarısız/sessiz sesi ready kabul etmeme; EN/TR durumlar ve tekrarlı reader aç/kapat temizliği. |
| F | N47, N48, N49, N50, N01, N02, N10 | Gerçek Letterboxd rotaları/kaynak izi; MHTML disk/cleanup; sezon no-clobber fault injection; CI ve süreç/listener sahipliği; gerçek koşul/event beklemeleri. CI beklemek durma gerekçesi değil. |

### Devam ve durma koşulları

1.08:17'de etkin hedef yoksa, kullanıcının açık isteği kapsamında kalan doğrulanmış işlerin tamamlanması için hedef başlat. Sayısal token bütçesi uydurma. Etkin hedef varsa ikinci hedef oluşturma.08:20 uyanışı aynı hedefe devam eder; eşzamanlı ikinci iş/checkout/üretim başlatmaz.
2. Bir paket sonu yalnız kontrol ve teslim noktasıdır. İlgili kısa kontrolleri yap; ürün ve belge commitlerini ayır, normal push ve uzak hash doğrulaması yap; ardından **sonraki yararlı işe devam et**. Üç-beş değişiklik veya tek PR güncellemesi tüm hedefin tamamı sayılmaz. Kullanıcıdan rutin yeniden izin istenmez.
3. Başkasının değişikliklerini katma; mevcut PR487/dal uygunsa kullan. Master'a otomatik merge yok. Kişisel uygulamayı kapatma; gerçek hesap/ücretli API kullanma. UI değişince ayrı profilde gerçek görüntü gör; test eşiklerini düşürme.
4. Bütçe, somut inceleme/uygulama/anlamlı kanıta ayrılır. Yapay araştırma sayısı, aynı testi gereksiz tekrar, dolgu belge/bug üretimi yok. Gerekli araştırma varsa birincil kaynak ve lisans uyumluluğu korunur.
5. Gerçek engel oluşursa bağımsız yararlı işe geç. Bütün kalan işler tamamlanmış/kanıtla gereksiz/engelli olduğunda veya hesap/çalışma sınırı ilerlemeyi durdurduğunda kesin devam noktası, commit ve çalıştırılmayan kontroller kaydedilir. Görülmeyen sonuç yeşil denmez; kota tamamen tüketilmiş gibi gösterilmez.
6. Tamamlanmış görevin kabul kapsamı, kullanım ve sınırları listede tutulur. Bir yerin çalışmadığı gösterilmemişse varsayımsal onarım yapılmaz. Limitten sonra otomatik çalışmanın garanti edilemediği açık tutulur; uygulama ve bilgisayar açık olmalıdır.

## Son kapsam düzeltmesi — 2026-10-25 06:53

Kullanıcı şimdi başlamaya izin verdi; eski08:17/08:20 bekleme iptal. Mevcut hedef aktif;11:55Europe/Istanbul için tek devam uyanışı ayarlı. Kullanıcı daha sonra açıkça **yedekleme ve kurtarma paketini bırak, bu tür işleri kısa tut; programı geliştir, gerçek kullanım buglarını düzelt** dedi. Bu son talep yukarıdaki A/B bakım ağırlığını geçersiz kılar. N16–N24/N27/N28 gibi yedek/kurtarma bakım işleri şu an ertelendi; otomatik yeniden uygulanmaz. Yerel tamamlanmamış ekler `tmp/backup-scope-deferred552.patch` ve `tmp/book-backup-scope-deferred552.test.js` içinde commit/push dışı saklandı; ürün kaynakları o denemeden önceki hâline döndürüldü. Önceki teslim edilmiş yedek özellikleri silinmedi.

Yeni yürütme sırası: dublaj gerçek takılma/son parça/timeout; grup dinleme metadata/aralık/oturum değişimi; kalite listesinden doğru metne geçiş ve yalnız sorunlu grubun üretimi; ses-video senkronu; ses için çevirinin anlam/akıcılığı; PDF okuma/arama/vurgu; asistanın açık sayfa ve metin bağlamı; dar ekran/tema kullanılabilirliği. Önce koddan ve reprodan doğrula. Spekülatif bug veya büyük bakım paketi yapma.

Rapor552: N42'nin dublaj stüdyosu kısmı düzeltildi ve hedefli doğrulandı; diğer kitap reader dalı/gerçek native ses sürücüsü doğrulanmadığından N42 bütün olarak tamamlandı denmez. Ses metadata gelmeden seek/play bekler; panel/grup/source değişimi pending isteği kapatır; geçersiz aralık reddedilir. Kod4a30bab097be37a544ee358db532b4bdada37a4f. Devam için ilk dosyalar `src/renderer/browser-dub-audio.js`, `src/renderer/dub-generator-ui.js`, `src/renderer/media-workflows-ui.js`, `src/dub-service.js`; ilgili kısa testlerle gerçek hata ayrımı. Limit yaklaşma zamanı garantiyle görünmediği için checkpoint her pakette yazılır.11:55 aynı aktif hedefi çoğaltmadan son kontrol noktasından devam eder.

06:56 — Rapor553/kod18630529c54c793ad2dae3b7bfeb41c6b4aae122. N36/N42/N44/N46 ilgili kitap okuyucu yollarına somut onarım/negatif kanıt eklendi; tam kapsamı bitti sayılmaz. Hızlı gezinmede son istek, save yanıtında proje/bölüm/draft, Review metadata ve onay kimliği korundu.19hedefliPASS, nativeWindowsPDF/Review/M4B exit0. Sporadik approval timeout kesin kök açık. Sonraki: browser-dub-audio session yarışları/kalite-plan kimliği/çeviri anlamı; yedek bakımı yok.
