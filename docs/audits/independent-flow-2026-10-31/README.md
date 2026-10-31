# Bağımsız akış denetimi — 31 Ekim 2026

Başlangıç: `c13bee605703d1c0a9a395960962d99f955e510c`. Bu tur, önceki raporların maddelerini yeniden saymak yerine güncel üretici–tüketici akışlarını, kaynak değişimini, geciken yanıtları, iptal ve yeniden denemeyi inceledi. **17 kök hata doğrulanıp düzeltildi.** Bu sayı bir hedef değildi; olumsuz sonuç veren geçerli kontroller de saklandı.

Önceki “kapsamlı” ifadesi, denenmemiş bileşen birleşimlerini de kapsıyormuş gibi anlaşılabiliyordu. Burada sınır açık: aşağıdaki davranışlar ve `matrix.json` kapsamı doğrulandı; uygulamanın hatasız olduğu ileri sürülmüyor.

## Düzeltilen davranışlar

| Kimlik | Önceki hata | Düzeltme |
|---|---|---|
| IF-B01 | Aynı süre/konum ölçümlerine sahip yeni video, kaynak değişimi olayını bastırıyordu. | Olay tekilleştirmesine belge/medya kimliği eklendi. |
| IF-B02 | Ayrılan video temizlenirken sitenin daha yeni filtre/hız ayarı eziliyordu. | Yalnız hâlâ uygulamanın sahip olduğu değer geri alınır; tekrar bağlanmada yeni taban alınır. |
| IF-B03 | Reklam videosuna ait sessize alma durumu yeni video öğesine uygulanıyordu. | Geri alma aynı öğeyle sınırlı. |
| IF-B04 | Bayat/zaman aşımına uğramış komut başka iframe oynatıcısına düşüyordu. | Belirsiz mutasyon sonucu yeni hedefte yinelenmez; browser ve dublaj bağlantıları birlikte düzeltildi. |
| IF-B05 | Eşzamanlı tam sayfa görüntüleri ortak CDP bağlantısını birbirinden koparıyordu. | Paylaşılan bağlantı için sayılan sahiplik ve son kullanıcıda bırakma. |
| IF-B06 | Eski sekmenin geciken tercih yanıtı yeni sekmenin hızını değiştiriyordu. | Sekme, nesil ve URL yanıt sonrası tekrar kontrol edilir. |
| BACKEND-AUDIT-01 | Yeni WAV kurulduktan sonraki yan dosya hatası, eski raporlarla yeni sesi eşliyordu. | WAV ve yan dosyalar birlikte hazırlanıp mevcut işlem günlüğüyle yayımlanır. |
| BACKEND-AUDIT-02 | Aynı dosyada sabit zamanlamaya geçilince eski `.sync.json` kalıyordu. | Eski senkron dosyası aynı çıktı işlemi içinde kaldırılır; başarısızlıkta geri gelir. |
| BACKEND-AUDIT-03 | Son çıktı yazımı iptal/hata alınca ASR devam noktası önceden silinmiş oluyordu. | Devam noktası, çıktı işlemi başarıyla tamamlandıktan sonra silinir. |
| BACKEND-AUDIT-04 | Gerçek `0.0` kelime güveni performans sayacında `1.0` sayılıyordu. | Yalnız eksik/None değer için varsayılan kullanılır. |
| BACKEND-INTEGRATION-05 | Sahibi olmayan dublaj hızını bırakma işlemi ilgisiz videoyu bulup hızını sıfırlıyordu. | Bırakma hedef edinmez; geciken eski bırakma yeni sahipliği silemez. |
| BOOK-FLOW-01 | Aynı sayfa aralığındaki düzenlenmiş çeviri, hazırlanan/dinletilen eski kitap sesiyle güncel sayılıyordu. | Sayfa metni özeti asenkron sınırlar ve sonraki dinleme boyunca doğrulanır. |
| BOOK-FLOW-02 | M4B kaydından sonra proje kaydı hata verince eski sesli kitap kayboluyordu. | Eski hedef proje kaydı tamamlanana kadar tutulur; işlenen hatalarda dosya ve kayıt geri alınır. |
| BOOK-FLOW-03 | Metin düzenlendikten sonra eski sesli kitap paketi başarıyla dışa aktarılıp kendi içe aktarıcısında reddediliyordu. | Eski sese bağlı paket yayımdan önce reddedilir; metin-only aktarım korunur. |
| BOOK-FLOW-04 | Kodlama sırasında kaynak WAV değişince eski bölüm kimliğiyle yeni ses yayımlanabiliyordu. | Kaynak türü ve içerik özeti prob/seçim/kodlama sonrasında doğrulanır. |
| IF-A01 | Asistan ayarı/geri alma kaydı başarısız olduğunda ekran ve disk ayrışıyor, insanın eşzamanlı değişikliği kaybolabiliyordu. | Alan bazlı sahipli geri alma, yeniden denenebilir undo ve eşzamanlı işlem koruması. |
| IF-A02 | Native oynatıcı hız/konum/ses komutu beklerken veya reddedilirken asistan “tamamlandı” diyordu. | Mevcut native komut makbuzu beklenir; hata ve bayat kaynak reddedilir. |

IF-A02, eski R815-G31 önerisinin somut çalışan tüketicide doğrulanıp uygulanmasıdır; yeni fikir olarak sunulmaz. IF-B04'ün iki bağlantıdaki aynı düşme mekanizması iki kez sayılmaz. Üç eski test/envanter uyuşmazlığı ürün hatası sayısına eklenmedi.

## Kanıt ve kontroller

- Yeni odaklı testler: 36 Node davranış vakası, 12 Python vakası; bunlara ek mevcut uyumluluk testleri. Test üretimindeki döngüler nedeniyle kaynakta görülen `test()` satırı sayısı vaka sayısıyla aynı değildir.
- **Gerçek Electron 43.5.0:** ayrı test profiliyle 7 akış. Gerçek Chromium DOM/frame, WebContentsView, örtü/modal/klavye ve paralel ekran yakalama sınırları denendi. Ana süreç işleyicileri kontrollü yetkilendirme bağlamında çalıştırıldı; tam uygulama kullanıcı oturumu değil.
- **Gerçek GPU/VoxCPM2:** RTX 4070 SUPER 12 GB üzerinde iki Türkçe grup, 30 saniye/48 kHz çıktı. Grup ve bütün dosya ASR/metin denetimi geçti, dalga sonlu, kırpılan örnek oranı 0. Model/referans/ayarlar değiştirilmedi, model indirilmedi. İnsan dinlemesi yapılmadı; ASR benzerliği doğal tonun kanıtı değildir.
- Tam yerel paketin ilk koşusu kaynak sabitken tamamlandı ve üç başarısız dosyayı görünür kıldı. İki testin aynı hataları başlangıç HEAD'inde de vardı: geniş VM dilimi ilgisiz başlangıç dinleyicisini çalıştırıyordu; PDF iptal regex'i yeni işlem kimliğini tanımıyordu. Testler sınırları daraltılıp **davranış doğrulaması artırılarak** onarıldı.
- Şema envanteri önceki v4 değerinde kalmıştı; gerçek v5 sabiti ve mevcut v4→v5 SQLite geçiş testiyle eşlendi. Kaynak şema sürümü geri düşürülmedi, test atlanmadı veya başarı eşiği gevşetilmedi.
- Son tam koşu **710 Node + 166 Python dosyası, exit 0** ile bitti; 1587 kaynak/test dosyasının özeti koşu boyunca aynı kaldı. Ayrıntılar `validation.json` içindedir. CI teslimden sonra arka planda yürür; CI sonucu beklenerek yerel çalışma durdurulmaz.

`findings.json`: kök neden, eski kodda başarısızlık ve yeni regresyon bağlantıları.
`matrix.json`: 48 denetim satırı; yeni problar, mevcut regresyonlar ve koşulmayan sınırlar ayrıdır. Bu, 48 yeni bug veya 48 bağımsız E2E iddiası değildir.
`native-matrix.json`, `gpu-summary.json`: yerel kabul sonuçları.
`evidence/`: yalnız kontrollü fixture öncesi/sonrası günlükler; özetleri `evidence-manifest.json` ile bağlıdır. Özel referans ses, kişisel ayarlar, GPU özel günlüğü ve tarayıcı profilleri yayımlanmadı.

## Açık sınırlar

- R815-B63 çapraz kaynak ses kurtarma sınırı açık. Gerçek YouTube/reklam engelleyici, giriş, Cloudflare ve DRM uçtan uca doğrulanmış sayılmaz.
- Canlı sağlayıcı/model araç seçimi, çeviri kalitesi, fiziksel MPV/ses donanımı ve uzun süreli kullanım bu pakette sınanmadı.
- M4B için işlenen hata geri almaları kanıtlandı; güç kesintisi/process-kill karşısında iki dosyalı atomiklik eklenmedi ve iddia edilmiyor.
- Dublaj yayını sırasında süreç ölümü günlüğü sınandı. Yayın öncesi ani ölüm geçici dizin bırakabilir; bağımsız eşzamanlı CLI yazarları kapsam dışı.
- PDF ses hazırlama testleri gerçek üretim fonksiyonlarını JSDOM ve kontrollü sentez yanıtıyla çalıştırır; bunlar bütün okuyucunun görsel kabulü değildir.

Kişisel uygulama kapatılmadı. Kişisel çalışma ağacı değişiklikleri teslim commitlerine alınmaz. Yardımcı ajanlar kullanıcının istediği GPT-6.1 Sol / medium ayarıyla çalıştı; tercih `.cursor/rules/agent-model-preference.mdc` içinde kalıcılaştırıldı.
