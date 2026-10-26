# Görev04 — Gerçek arayüz, browser/asistan, güvenlik ve uzun kullanım

Bu görev için 00-START-HERE.md ve KNOWN-STATE.md geçerlidir. Önce kaynak bütünlüğü ve ortamı doğrula. Baseline'ı değiştirme; yeni araçlar yalnız audit-output/ altında. Arayüzü gerçekten render edemiyorsan bunu başta söyle; statik CSS taramasını görsel kabul diye sunma.

## Sonuç hedefi

Kullanıcının şikâyeti “özellik var ama erişilemiyor; menüler kötü ve sıkışık; asistan açık sayfayı anlamıyor”. Tasarımın güzel görünmesiyle gerçek işlevin çalışmasını birlikte değerlendireceksin. Uygulama Electron/Windows ürünüdür; ayrı test profilinde çalış. Kullanıcının açık penceresini kapatma veya gerçek hesabıyla giriş yapma. Mevcut sıcak amber/grafit temasını koru; yeni marka veya genel dashboard tasarlama.

İlgili alanlar: renderer/{index,styles,media-home,media-discovery-ui,media-title,title-gallery,app-settings,assistant-overlay,global-assistant,assistant-workspace,pdf-reader-experience,media-workflows-ui,dub-generator-ui}; src/{assistant-overlay,assistant-thread-store,assistant-page-command,assistant-media-command,local-file-access,settings-security,provider-api-keys,process-io,process-lifecycle,letterboxd-reviews,media-catalog-store} ve main/preload/browser-preload sınırları. Dosya uzantı/yolunu gerçek envanterden bul.

## A — Görsel ve etkileşim matrisi

| ID | Zor iş | Somut kabul |
| --- | --- | --- |
| U01 | Ana sayfa,Keşfet,film ayrıntısı,ayarlar,browser/asistan,dublaj,PDF/EPUB ve sesli kitap ekranlarını envanterle. | Her ekranın erişim yolu ve gerçekten açılmış durumu; sadece index.html screenshot'u değil. |
| U02 | 1280×800,940×780,680×900 ve kısa yükseklikte EN/TR,açık/koyu,1/1.25/1.5zoom için risk odaklı örnek seç. | Gereksiz tüm çapraz çarpım yerine neden seçildiğini yaz; tema/zoom aynı ekran üzerinde karşılaştırılabilir olsun. |
| U03 | Uzun Türkçe başlık,boş veri,1000kart,poster yüklenmeme,aktif iş ve hata durumlarını aç. | İşlevsiz boş büyük panel,arka arkaya araç satırı,kırpılan düğme ve sahte loading kalmasın. |
| U04 | Menüler/ayar footer'ı için gerçek koordinat ve screenshot birlikte ölç. | scrollWidth=clientWidth tek başına tasarım kabulü değil; metin boyanma alanını ve ekrandan taşmayı incele. |
| U05 | Klavyeyle gezinme,Escape,odak geri dönüşü,modal üstüne modal ve async yeniden çizim dene. | Eski DOM düğmesine odaklanma,arkadaki menüye tıklama veya kapanmayan odak tuzağı olmasın. |
| U06 | Native video yüzeyi üzerinde floating asistanı aç/kapat/büyüt. | Sayfa gereksiz daralmasın,siyah footer oluşmasın; parent capture gerçek native kompozisyonu göstermiyorsa sınırlı olduğunu belirt. |

## B — Browser ve asistanın gerçek eylemleri

- U07: Açık haber sayfasına “bunu Türkçeye çevir”,“özetle”,“seçtiğimi açıkla” de. Sayfa çevirme mevcut aracı tetiklemeli; özeti sohbet içine çevirmekle görev tamamlandı denmemeli. Kontrollü sayfa/sağlayıcı kullan.
- U08: Aynı URL'de SPA navigasyonu,başlık değişimi,iframe ve makale gövdesi güncellemesini ayrı dene. Asistanın kaynak kimliği ve metni hangi anda yenileniyor? Eski metne yeni başlıkla yanıt verilmesin.
- U09: SekmeAisteği sürerken B'ye geç,A'yı kapat,yanıtı en son döndür. Mesaj/draft/kaynak/araç sonucu yanlış konuşmaya yazılmasın; durdur butonu gerçekten ilgili işi durdursun.
- U10: Uzun sohbet,stream sırasında kaydırma,kod bloğu,kaynak kartı,hata ve retry durumlarında composer/send/stop erişimini incele. Kullanıcı eski mesajı okurken zorla alta atılmasın.
- U11: Kullanıcı niyetleriyle film önerisi/benzer yapım/watchlist/Letterboxd analiz ve zevk profili eylemini yürüt. Model bilgi üreterek başarılı görünmesin; gerçek seçili kayıt ve API çağrısı kanıtı olsun.
- U12: Yalnız bir ülke/film adı değişsin; farklı dil/büyük harf/I/İ varyantlarını dene. USA/UK backspace ve English I hatası artık kapalı; yeni ayrım göster veya regresyon PASS olarak yaz.

## C — Kütüphane, görseller ve geri dönüş

- U13: Hero önceki/sonraki düğmeleri hızlıca değiştirirken poster ve metadata cevaplarını ters sırayla döndür. Başlık,arka görsel,ilerleme ve play hedefi tek kayda ait olmalı.
- U14: TMDB key yok→ekle→değiştir→sil akışında afişler ve hata durumu yenilensin. Özel provider çağrısını gerçek anahtarla yapma; stale request ve invalidation'ı localhost ile ölç.
- U15: Keşfet'ten filme gir,özeti çevir,watchlist'e ekle,geri dön; filtre/sorgu/scroll ve seçili kart korunsun. İkinci onay artık hangi eylemde var/yok koddan doğrula, eski test kuralı uydurma.
- U16: Letterboxd yorumları ikinci sayfa,sıralama,spoiler,tekrarlı yorum ve kısmi hata durumlarında analizde neyi kanıtlıyor? Yanlış film eşleşmesinde durmalı; sayfa erişim engeli parser bugı değildir.
- U17: Kütüphane araması film/kitap/geçmiş içinde ve yalnız açık kullanıcı isteğiyle çevrimiçinde çalışmalı. Aynı başlıkta iki farklı kaynak ve sonradan silinen kayıtla dene.

## D — Güvenlik sınırlarını kontrollü adversarial girdilerle dene

- U18: Her yeni işlem için authorized sender,preload ve main handler sınırını çıkar. Yanlış webContents/frame/URL'den çağrıda key/dosya/iş çalıştırma yetkisi kazanılmasın. Gerçek hesabı kullanma.
- U19: Yerel picker grant'i,restore opaque ID ve import edilen proje yollarını symlink/UNC/relative/path traversal ile sınayabilirsin; yalnız geçici sandbox dizinleri kullan. Önce yetki verilmemiş gerçek kullanıcı dosyasına erişme.
- U20: Endpoint import/provider geçişi,explicit inherit,aynı host farklı path ve boş/silinmiş anahtarda sahte Authorization sınırını ölç. Request sayısı/key fingerprint kanıtı; boş .every sonucunu başarı sayma.
- U21: Sayfa/altyazı/yorum metnine HTML/script/Markdown URL/sahte kaynak ve prompt injection koy. İçerik DOM koduna veya tool emrine dönüşmesin. CSP ve textContent kaçışlarını gerçek rendered sonuçla kontrol et.
- U22: Sentetik sır işaretlerini argv/env/export/log/hata/konuşma arşivinden izle. Hangi yüzey gerçekten reddediliyor/redakte ediliyor? Sır görünmez olsun diye bütün iş ayarlarını silen fix önerme.
- U23: Alt süreç stdout/stderr flooding,partial UTF-8,spawn failure,abort ve close ayrımını dene. Deadlock/bellek büyümesi/zombie adayında process tree ve stream backpressure kanıtı göster.

## E — Performans ve uzun kullanım

- U24: 100/1000/5000medya kaydında ilk render,scroll,arama,detay aç/kapat ve geri dönüş için walltime/DOMcount/RSS ölç. Tek1CPUcihazdan mutlak Windows SLA çıkarma; büyüme trendini göster.
- U25: Browser/asistan/reader'ı anlamlı20–50aç-kapat döngüsünde timer/listener/native view sayısıyla izle. Tek garbage collection snapshot'ından leak ilan etme; kararlı durumda kalanı tespit et.
- U26: Boş sekme,aktif video,gizli sekme,aktif dublaj ve durmuş işin kaynaklarını ayır. Arka planda gereksiz tekrar eden işin gerçek tetikleyicisini bul; sadece bütün timerları kapatma önerme.
- U27: Ağ timeout/boş resim/metadata hata/yarım çeviri durumlarında kullanıcı nasıl ilerliyor? “Başarısız” mesajı gerçek neden ve mevcut sonuca erişim yolu vermeli; teknik stack trace tek kullanıcı mesajı olmasın.
- U28: En büyük5UXsorunu için mevcut tasarıma uyumlu uygulanabilir taslak ver. Her birinde önce/sonra önerisi,etkilenen ortakCSS,klavye/scroll etkisi ve kabul ölçümü olsun. Baseline'ı değiştirmeden HTML/CSS prototipi yaparsan ISOLATED_PROTOTYPE etiketiyle teslim et.

## Ölçüm yöntemi ve özel teslim

Gerçek ekranlarda fontlar ve sonlu animasyonlar hazır olmalı. nativeWebView yüzeyi ayrıysa kompozisyon sınırını belirt. Her kritik bulgu için önce/sonra aynı viewport/tema/dil/zoom ve veriyle screenshot; düzeltme yalnız fix-copy veya ayrı prototipte. Overflow:hidden ile sorunu gizlemek, düğmeyi kaldırmak veya test eşiğini gevşetmek çözüm sayılmaz.

Ortak çıktılara ek: UI-COVERAGE.csv, DESIGN-REVIEW.md, SECURITY-BOUNDARIES.md, RESOURCE-SAMPLES.csv, seçilmiş screenshots/ ve en önemli3iş akışı için adım adım JOURNEYS.md. Ekran görüntüsü yoksa bu kısmı gerçek tasarım kabulü olarak işaretleme. Ağ/DRM/GPU/hesap blokajlarının her birini ilgili maddeye bağla; hepsini genel “ortam yok” satırına gömme.
