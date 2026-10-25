# Rapor 584 — Okuyucu, yorum örneği, bekleyen dublaj grubu ve asistan eylemleri

25 Ekim 2026. Kullanıcı beş alanı birlikte geliştirmeyi onayladı. Dal `codex/reader-dub-flow584`, güncel master başlangıcı `8ca8df4706e9dfa0f4f4228ab6145bccba562b74`; ürün bitişi `4035bf575fc26b977681a40e6a460f46b47bbb7f`. Bu bir tüm uygulama/gerçek model kalitesi garantisi değildir.

## 1. Kitap/PDF ve dinleme

**Kök:** `stopVoice()` token'ı artırıp sesi duraklatıyordu; eski `onpause` callback'i token eşleşmediğinden konum yazmıyordu. Sayfa değiştirme/kapatma, normal duraklatmadan farklı olarak son dinleme konumunu kaybedebiliyordu. Artık ses kaynağı kaldırılmadan önce oynatma anına ait proje/bölüm/outputId/textHash ile konum kaydı gönderilir. Geç callback yeni bölümün konumunu değiştirmez. Yanlış çıktı/sürüm mevcut backend kontrolünce reddedilir. Aynı konum tekrarı sınırlandırılır; başarısız yanıt tekrar kayda engel olmaz.

PDF ses paneline varsayılan açık “Konuşulan metni takip et” eklendi. Kapatıldığında vurgu sürer, metin kullanıcıyı zorla kaydırmaz. Sayfa aralığı ve mevcut PDF glif eşleme/okuma/yan yana özellikleri korunur. Asistana “Bu sayfayı seslendir” denince güncel sayfa başlangıç ve bitiş olarak seçilir; ayar paneli açılır, otomatik GPU üretimi başlamaz.

TXT/EPUB bölüm seslendirme girişinde kaynak bölüm, konum kaydı await'inden önce yakalanır; await sırasında bölüm değiştirilirse başka bölüm açılmaz. API sonrasında da aynı bölüm/açık okuyucu kontrol edilir. Oluşmuş proje korunabilir; güncel olmayan kaynakla pencere açılmaz.

## 2. Letterboxd çoklu sayfa

**Kök:** örneğe ekleme checkbox'ı yalnız DOM'da tutuluyordu. Browser'a geçip ikinci sayfayla dönünce panel yeniden kurulduğunda seçim kayboluyor, otomatik okuma önceki örneğin yerini alıyordu. Seçim artık yapım taslağında saklanır. Browser dönüş barında “Mevcut örneğe ekle” seçeneği var; yalnız önceki doğrulanmış örnek varsa varsayılan açılır. Kullanıcı kapatıp yeni örnekle değiştirebilir.

Birleştirme önceki ve yeni sayfanın aynı film olduğunu denetler, tekrarları ayıklar, kimlikleri yeniler, 100 yorum/120000 karakter sınırını korur. Kaynak URL listesi taslakta tutulur ve kaynak sayısı görünür. Eski taslağın kimliği güncel yapımla tekrar karşılaştırılır; yalnız eski `matched` etiketine güvenilmez. Bu, tüm yorumları temsil eden bir istatistik/ortak kanaat değildir.

**Canlı kontrol:** The Matrix, TMDB603 için tek süre sınırlı kamu isteği yapıldı. Sonuç yine `Letterboxd HTTP403`; Browser/paste/import fallback mesajı doğru. Bu tur canlı giriş/Cloudflare geçişi kanıtlanmadı. Native Windows testinde Browser okuma sınırı kontrollü; iki ayrı örnek kullanıcı dönüş eylemiyle 1→2 birleşti. Gerçek sayfa DOM süzme, challenge/yanlış URL/nesil reddi ayrıca hedefli testte çalıştı.

## 3. Son grup beklemesi

Yeni `dub_activity.observe` yalnız gerçekten çalışan sentez coroutine'i boyunca başlangıçta ve her10sn'de grup, sentez denemesi, geçen süre, mevcut istek sınırı yayımlar. Başarı/hata/iptalde heartbeat kapatılır. `bounded_call` timeout ve motor yeniden başlatma davranışı değiştirilmedi. Hız/kalite ayarları ve kurtarılmış WAV politikası değişmedi.

Ana süreç yalnız doğrulanan sayısal alanları geçirir. Dublaj ekranında örneğin `60/61 · Grup61 · deneme2 ·30/180s` görünür. En fazla sekiz aktif grup tutulur; biten grup, motor yeniden başlatma ve iş bitişinde temizlenir. Son işlemler mevcut doğrulama/yerleştirme/yazma/normalizasyon aşamalarıyla görünür kalır. “Takılmaların tamamı giderildi” veya süre sınırının her donanımda yeterli olduğu iddia edilmez. Gerçek GPU'lu uzun üretim bu turda yok.

## 4. Asistanın gerçek eylemleri

- “Bu sayfayı/bölümü seslendir”, “Read this chapter aloud”: yalnız açık ve bağlamla kimliği/bölümü eşleşen okuyucunun mevcut seslendirme ayarını açar. Soru/olumsuz/alıntı komut çalıştırmaz. Dosya üretimi başlamadığı açıkça söylenir; ücretli model çağrısı yapılmaz.
- “Bu filmi yorumlarımla karşılaştır”: mevcut kütüphane seçimini yeniden okuyup o filmin Yorumlar ve karar panelini açar. Örnek indirilmiş veya analiz bitmiş gibi cevap vermez; kullanıcı örneği inceleyip mevcut analiz eylemini başlatır.
- Mevcut “Bu sayfayı Türkçeye çevir” yönlendirmesi korundu ve native asistan panelinden tekrar kontrol edildi. Yeni kitap komutu yalnız kitap bağlamında devreye girer.

## 5. Görünüm

TXT/EPUB okuyucuda kitap/bölüm, belirgin “Bölümü seslendir”, Okuma araçları ve kapat ana sırada. Font, yer imleri, kopyalama ve bağımsız ses stüdyosu aynı eylemlerle açılan menüye taşındı. Mevcut koyu/açık tema token'ları korunur. PDF takip seçeneği panelin düzenine katıldı. Dublaj etkin grup satırı taşmayı kırar. 800px okuyucuda dış diyalog ve **metin alanının kendisi** ölçüldü: client763/scroll763, paragraf713px; yatay taşma yok. 125% ölçekli açık tema dublaj kontrolü de geçti. Bu tur her eski uygulama penceresinin tamamı denetlendi iddiası yok.

## Dosya amaçları

- `src/renderer/pdf-reader-experience.js`, `index.html`, `pdf-reader.css`: kaynak bağlı konum kaydı, takip seçimi, sayfa komutu.
- `src/renderer/media-shelf-ui.js`, `media-shelf.css`: bölüm snapshot guard'ları, eylem callback'i, okuma araçları/uyumlu genişlik. `media-tools-ui.js`, `review-decision-ui.js`: örneğe ekleme ve kaynak sayfaları.
- `src/renderer/book-assistant-ui.js`, `renderer.js`: kayıtlı okuyucu eylemi, sınırlandırılmış kullanıcı komutu, tek iş durumu. `src/assistant-media-command.js`, `renderer/assistant-media-commands.js`: seçili yapım yorum paneli.
- `tools/voxcpm2/dub_activity.py`, `altyazi_oku.py`: sentez coroutine heartbeat'i. `src/dub-activity.js`, `dub-service.js`: dar olay sözleşmesi. `renderer/dub-generator-ui.js`, `media-experience.css`: etkin gruplar ve temizleme.
- `backend/test_dub_activity.py`, `tests/book-command-flow.test.js`: yeni sınır/iptal/kaynak testleri. Güncellenen `assistant-media-command`, `dub-generator-ui`, `dub-service`, `review-workflow` testleri yeni gerçek davranışı sınar. Native `electron-pdf-reader-experience`, `electron-dub-runtime`, `electron-taste-review-books` testleri gerçek Windows görüntüsü ve ana süreç/preload yollarını kullanır.

## Test ve görüntü kanıtı

- Son hedefli Node paketi: `tests/book-command-flow.test.js`, `assistant-media-command.test.js`, `assistant-page-command.test.js`, `book-assistant-actions.test.js`, `review-workflow.test.js`, `dub-generator-ui.test.js`, `dub-service.test.js`, `csp-policy.test.js`: **28 PASS**.
- Python `-m unittest backend/test_dub_activity.py backend/test_dub_lifecycle.py`: **6 PASS**. Timeout/cancel heartbeat'i kapatır; iptali yutan coroutine sınırı korunur. GPU/model gerekmedi.
- Değişen JS `node --check`, Python `py_compile`, `git diff --check`: temiz.
- Gerçek Windows PDF/TXT native exit0 `.uiprev/pdf-reader547-1792945256321`: gerçek3sayfaPDF, gerçek4snWAV çözme/oynatma/vurgu, sayfa değiştirirken konum1,25sn korunması, asistanın sayfa2 aralığı, TXT bölümünü doğru üretimde açma, 800px menü ve metin ölçümü. Görüntüler incelendi; sentetik WAV model kalitesi değildir.
- Yorum native exit0 `.uiprev/taste-review-books-1792945096352`: seçili film asistan komutu, iki Browser sayfasını örneğe ekleme, önceki arama/galeri/kitap/quiz regresyonu. Sağlayıcı ve Browser-read callback'i kontrollü.
- Dublaj native exit0 `.uiprev/dub-runtime/1792945170763-7896`: 60/61 bekleyen grup ve bitince temizleme, aşamalar, koyuTR/açıkEN125% ölçek. Olaylar kontrollü; GPU yok.
- Sayfa asistanı native exit0 `.uiprev/assistant-page-fixture/1792945370517-18524`: gerçek native panelden mevcut çeviri aracına yönlendirme; araç sonucu kontrollü, ücretli AI yok.
- İlk yorum testinde yeni gerçek `matchFilm` bağımlılığı fixture'a yüklenmemişti; ürün eşiği değiştirilmeden fixture düzeltildi. Bir native PDF koşusunda sabit350ms bekleme yetmedi; gerçek sayfa hazır olma koşuluna geçildi. Son koşular yukarıda; ilk başarısızlıklar gizlenmez.

## Sınırlar ve teslim

Yeni runtime bağımlılığı/kurulum/kalıcı şema yok. İstek sınırları/kalite eşiği gevşetilmedi. `start.bat`/`install.bat`/package/lock aynı; Windows yolları ve UTF-8 korunur. Ana kişisel kopyanın üç belge değişikliğine, 114 untracked dosyasına veya açık uygulamaya dokunulmadı. Bu tur ayrı dal/PR teslimidir; master'a otomatik merge yok. CI açık kalır; uzun sonucu beklenmez ve görülmeyen sonuç yeşil sayılmaz. Tam suite, kişisel start.bat yeniden açılışı, gerçek uzun GPU dublajı, canlı AI kalite/DRM/Letterboxd oturumu doğrulanmadı.
