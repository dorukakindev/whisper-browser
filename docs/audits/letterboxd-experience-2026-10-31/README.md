# Letterboxd: Keşfet ve yerel film deneyimi

Başlangıç `735b5febd4e225eb9a9d6c1fea99c431ec8221e1`; ürün commit'i `3c32c9ddb2664344be7703a36c73d2fa56a48523`. Dal `codex/letterboxd-experience`. Önceki [Letterboxd teslimindeki](../letterboxd-workflow-2026-10-31/README.md) dengeli örnekleme, Browser dönüşü, kaynak kanıtı ve gelişmiş seçenekler korunur; bu tur yeniden yapılmış gibi sayılmaz.

## Kullanıcıya yansıyan geliştirmeler

- **Aynı filmin analizi iki yerde:** Keşfet'te kaydedilen analiz aynı IMDb/TMDB kimliğiyle kütüphaneye eklenen filmde; kütüphanede kaydedilen analiz Keşfet'te görünür. Başlık/yıl benzerliği tek başına taşıma yapmaz. Çelişen bilinen kimlik veya yıl reddedilir. Kaynak yeri gösterilir; son sekiz benzersiz analiz okunur. Dosya göçü veya arka plan kopyalama yoktur. Kendi geri bildirimin başka kayda aktarılmaz.
- **Kayıtlı sonucu doğrudan okuma:** Boş taslakla açılan filmde kayıtlı analizler önce gelir. Yeni AI isteği veya yorum indirmesi gerekmez. Kaydedilmiş örneği kullanırken yalnız saklanan sınırlı kanıt geri yüklenir; klavye odağı görünür analiz düğmesine gider. İleri kaynak/yorum araçları ve kendi değerlendirme formu açılır ayrıntılarda korunur; formun açılma durumu aynı taslakta tutulur.
- **Yorumları önce oku:** Yüklenen örneğin uygun yorum ve tanımlanabilen yazar sayısı görünür. “Yüklenen yorumları oku” alanında metinler, tarihler, puanlar ve özgün yorum bağlantıları AI olmadan incelenir. Kapalı spoiler seçeneği bu okuyucuda da spoiler metnini gizler. Analize gidecek kesin metin/seçimler sonraki önizlemede gösterilmeye devam eder.
- **Daha sağlam kaynak okuma:** Yalnız tekrar, aynı yazar, kısa/okunamayan veya dışlanmış spoiler içeren ara sayfa artık sonraki uygun yorumları engellemez. Dört sayfalık sınır korunur. Satır içi HTML etiketleri sözcük ve noktalama arasına sahte boşluk eklemez. Film düzeyindeki işaretli, güvenilir IMDb bağlantısı aynı filmin farklı dildeki adını eşleştirmeye yardımcı olur; yorum içindeki bağlantılar ve çelişen kimlikler kabul edilmez.
- **Doğru hatadan yeniden deneme:** Yorum kaynağı yüklenemediğinde “Yorumları yeniden getir” aynı kaynak işlemini tekrarlar. Önceki davranış boş örneği analiz etmeye yöneltebiliyordu. Analiz kesilmesi/yanlış yanıt için ayrı örnek inceleme ve tekrar yolu korunur.
- **Analizde kaynak sayıları:** Gönderilen kesin örnekten hesaplanan farklı yorum, yazar, bilinmeyen yazar ve tekrar sayıları modele verilir. Eksik görüntü adı, geçerli yazar hesabını bilinmeyen kaynak yapmaz. Native kayıt kontrolü değiştirilmiş sayıları veya farklı film kimliğine ait kanıtı reddeder. Eski kayıtlar okunur; kimlik bağlamı olmayan eski analizlerin güncelliği bilinmiyor olarak gösterilir.

## Kontroller

**94 hedefli Node testi geçti**, sözdizimi ve diff kontrolü geçti. Yeni testler yalnız gerçek değişikliklerin önemli sınırlarını kapsar: kaynak alıntısı, atlanan ara sayfalar, IMDb sınırı, iki yönlü kayıtlı geçmiş, farklı film/kişisel geri bildirim ayrımı, yazar sayıları, kanıt boyutu ve sahte kanıt reddi, spoiler okuyucusu, kaynak hatası tekrarı ve yerel örnek kullanımı.

```powershell
node --test --test-isolation=none tests/review-workflow.test.js tests/review-analysis-contract.test.js tests/review-discovery-handoff.test.js tests/media-tools.test.js tests/letterboxd-reviews.test.js tests/letterboxd-auto.test.js tests/letterboxd-sampling-critical.test.js tests/ci-determinism-ratchet.test.js
node tests/run-electron-smokes.js letterboxd-evidence letterboxd-experience
```

Gerçek Windows Electron uygulamasında iki kabul testi geçti. Son kaynak-hatası düğmesi ve okuyucu görüntüsü değişikliğinden sonra yeni `letterboxd-experience` kabulü ayrıca tekrar geçti: **16 ekran**, 1280 TR/koyu ve720 EN/açık; boş/yüklenme/hata, iki yönde kayıtlı sonuç ve örneği kullanma, doğrudan yorum okuma. Gerçek parser, servis, IPC ve kayıt yolu; HTML ve AI tamamlaması kontrollü örnek. Kişisel profil, açık uygulama, gerçek yerel film oynatma veya kişisel yorumlar kullanılmadı. Başlangıçta testin pasif penceresine gönderilen Enter hedefe ulaşmadı; test penceresi odağı ve char olayı düzeltilince geçti. Önizleme düğmesinin dar ekranda görünüm dışında kalması ise gerçek UI sorunu olarak düzeltildi ve dört odak/hit-test kontrolüyle doğrulandı. İlk test beklentisi yüklenen12 yorumun tamamını değil, metin bütçesinin gerçekten sakladığı10/11 yorumu karşılaştıracak şekilde düzeltildi; ürün sınırları gevşetilmedi.

### DeepSeek canlı analiz denemesi

Standart katmanda `deepseek-ai/DeepSeek-V4.1-Flash-1017`, sentetik beş yorum, gerçek üretim istemi ve kanıt oluşturucu/alıntı doğrulayıcı kullanıldı. İlk iki istekte görüntü adları boş olan ayrı yazar hesapları model açıklamasında belirsiz yorumlandı. Deterministik örnek sayıları ve açık yazar hesabı yönergesi eklendikten sonraki iki istek **HTTP200**, süreç çıkış0; dönen **10 özgün alıntının tamamı** verilen metinlerle eşleşti. Sonuçlar beş ayrı hesabı beş kaynak, aynı hesaptaki beş metni bir kaynak olarak ele aldı; kişisel tercih yokken kişisel uyum iddiası yerine koşullu yorum üretti. Bu iki vaka modelin her filmde doğru zevk tahmini yaptığı veya kusursuz Türkçe ürettiği anlamına gelmez. Bu doğrudan model isteğidir; tam native sağlayıcı akışı değildir. Anahtar yalnız bellekte kullanıldı; profil/anahtar veya kişisel yorumlar kanıta yazılmadı.

## Erişim ve kaynak sınırları

Gerçek uygulama okuyucusuyla Inception için tek sınırlı erişim denemesi **HTTP403** aldı (`evidence/public-check.json`). Bu sorun çözülmüş gibi sunulmaz. Normal uygulama Browser'ında yüklenen açık yorum sayfasını kullanma, yapıştırma ve TXT/JSON içe aktarma korunur. Doğrulama aşma veya oturum bilgisi toplama eklenmedi. Sadece IMDb kimliği olan çevrilmiş başlıklarda yorum sayfası film kimliği taşımıyorsa otomatik eşleştirme hâlâ Browser/elle kaynak gerektirebilir; iniş sayfası takma-ad aktarımı bu tur eklenmedi.

[Letterboxd'un güncel yorum sayfasındaki](https://letterboxd.com/film/inception/reviews/) sıralama yolları ve [screeny05/letterboxd-list-radarr](https://github.com/screeny05/letterboxd-list-radarr) (MIT) erişim/film bağlantısı yaklaşımı incelendi; dış kod veya yeni bağımlılık alınmadı. Web aracının sayfayı okuyabilmesi Node/uygulama isteğinin403 almamasını kanıtlamaz.

Üç yardımcı ajan GPT-6.1 Sol / medium; kaynak, servis/analiz ve native kabul alanlarında ayrıldı. Ana ajan UI, entegrasyon, canlı model ve görsel kontrolü yaptı. Frontend Design ve Impeccable ile mevcut grafit/amber tema korundu. Detector çıkış2:15 kayıt (7 radius,2 font,2 renk eski DESIGN.md ile mevcut CSS uyuşmazlığı;4 mevcut alıntı/uyarı çizgisi). Yeşil detector iddiası veya15 yeni bug sayımı yoktur. Tam npm test ve uzun CI beklenmedi. Güncel Luna kod/render karşılaştırması bu tur yapılmadı.

## Kanıtlar

- [Native kabul](evidence/native-acceptance.json), [önceki handoff kabulü](evidence/handoff-acceptance.json), [hedefli test çıktısı](evidence/targeted.log).
- [Son canlı model sonucu](evidence/deepseek-results.json), [önceki deneme](evidence/deepseek-before-statistics.json), [üretim istemi](evidence/production-prompt.txt), [süreç çıkışı](evidence/deepseek-exit.json).
- [Yorum okuyucusu](evidence/loaded-reader.jpg), [kayıtlı analiz](evidence/saved-analysis.jpg), [dar örnek kullanımı](evidence/narrow-reuse.jpg), [kaynak hatası](evidence/source-error.jpg).

Görüntüler kontrollü veridir ve inceleme için küçültülmüştür. JSON ölçüleri gerçek test penceresini kaydeder. Bu belge kişisel arşive veya tüm Letterboxd sayfalarına ilişkin başarı iddiası değildir.
