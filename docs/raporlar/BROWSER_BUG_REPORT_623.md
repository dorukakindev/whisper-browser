# Rapor 623 — Asistan P06: kaynak bağlı kitap/PDF üretimi

Başlangıç `767f50df8003e6bc40c969cef95528551904bd20`; bitiş ürün `b566e0bb17469c23f95b7e96cb98329e866ddf5c`.
Dal `codex/assistant-books623`; repo https://github.com/dorukakindev/whisper-browser.

## Kapsam ve kullanım

Yedi kitap aracı eklendi; ortak katalog 36, yalnız ilgili kaynakta görünür:
- `get_book_context`: açık sayfa/bölüm, seçili pasaj ve üretim durumu; metin 6000, seçim 2000 karakterle sınırlı ve kesilme açık belirtilir. Üretim listesi 24 bölüm, seçili liste 80 ile sınırlı; toplamlar ayrıca verilir. Diğer kitap sayfaları okunmuş sayılmaz.
- `prepare_book_narration`: PDF için 1–100 sayfalık özgün/çeviri aralığını mevcut üretime hazırlar. Eksik çeviri reddedilir. Raf okuyucusunda doğrulanmış güncel özgün bölüm aktarılır; diğer bölümler üretimde seçilir. Sayfa numarası ile üretim bölüm indeksi birbirinin yerine kullanılmaz.
- `select_book_chapters`: açık projede 1 tabanlı bölüm aralığını mevcut kalıcılık servisiyle seçer.
- `start_book_narration`: ilk gerçek `startDub` kabulünü bekler; hazırlanmayı başlamış/tamamlanmış ses diye sunmaz.
- `book_chapter`: mevcut bölüm editörü/review alanını açar, dinle-takip et görünümünü açar veya yalnız istenen bölümü mevcut önbellek hattıyla yeniden üretir.
- `preview_book_export`: mevcut M4B denetimlerini çalıştırır; yalnız süre/boyut ve sınırlı bölüm özeti döner, dosya yollarını aktarmaz.
- `export_book_audio`: mevcut review ve dosya kimliği kontrolleriyle native hedef seçiciyi açar; model yol veremez. İptal sonucu açık raporlanır.

Örnek: “Açık sayfayı oku”, “2–5. PDF sayfalarının çevirisini seslendirmeye hazırla”, yeni üretim bağlamı alındıktan sonra “Seçili bölümleri seslendir”, “1. üretim bölümünün incelemesini aç”, “M4B hazırlığını kontrol et”. Değiştirici komutlar kart oluşturur, kullanıcı uygulamasından önce çalışmaz. Hazırlama ses üretmez; üretim kabulü kalite başarısı değildir. Dinleme onayını asistan veremez; mevcut manuel onay düğmeleri korunur.

## Kaynak ve süreç doğruluğu

Mevcut BookAssistantUI mount kaydı aktif kaynak ID/bölümle eşleştirilir. Raf bölüm aktarımı mevcut spine/source-size/mtime doğrulamasını kullanır. PDF hazırlığı her async sınırda okuyucu ve son komut sahibi/deadline kontrolünü yapar. Sayfa değişmiş eski owner'ın komutu reddedilir. Hazırlamanın bilinçli üretim ekranına geçişi başarılı hazırlık olarak raporlanır; sonraki komut yeni bağlamı almak zorundadır.

Main, kitap mutasyon kartını oluşturmadan aktif reader veya boşta üretim durumunu readonly RPC ile kontrol eder. Uzun hazırlık/başlatma/bölüm/export RPC'leri 120 saniyelik sınıra dahil; sonsuz bekleme eklenmedi. Başlangıç reddi, ilk kabulden önce hata veya iptal olumlu kabul makbuzu oluşturmaz. Sonraki üretim hataları mevcut workflow durumunda görünür. Dışa aktarma callback'i aynı mevcut düğmeyle paylaşılır; proje/selected snapshot alınır ve save sonrası kaynak değişmişse işlem başlamaz. Gerçek iş hâlâ mevcut Stop kontrollerinden durdurulur.

## Dosyalar

- `src/assistant-capabilities.js`: yedi tipli araç, yalnız kitap kaynağında görünürlük, integer/sıralı aralık kontrolleri, EN/TR insan tarafından okunabilir kartlar.
- `src/assistant-agent-service.js`: aktif reader/production kart kanıtı ve uzun işlem deadline listesi.
- `src/renderer/assistant-app-actions.js`, `assistant-book-actions.js`, `index.html`: CSP-self kayıt ve kaynak sahibi denetimli mevcut fonksiyon adaptörü.
- `src/renderer/book-assistant-ui.js`: güncel mount'a erişim, sınırlı metin/seçim ve prepare callback'i.
- `src/renderer/pdf-reader-experience.js`: mevcut hazırlama düğmesinin ortak await edilebilir fonksiyonu; aralık/metin seçimi ve geç sonuç koruması.
- `src/renderer/media-shelf-ui.js`: mevcut bölüm aktarımına assistant callback, bölüm numarası ve kaynak/deadline koruması.
- `src/renderer/media-workflows-ui.js`: üretim snapshot, bölüm seçme, editör/dinleme/yeniden üretim, kabul makbuzu, ortak M4B callback ve bounded preview.
- `tests/assistant-book-actions.test.js`: gerçek BookAssistantUI modülüyle sınırlı kanıt, kaynak değişimi, hazırlama/başlatma ayrımı.
- `tests/assistant-capabilities.test.js`, `assistant-agent-service.test.js`: yanlış/fractional aralıklar, araç görünürlüğü ve karttan önce durum kanıtı; model isteği iş başlatmaz.
- `tests/electron-assistant-books.smoke.js`: gerçek Windows/PDF extraction/üretim; motor API sınırında kontrollü kabul/red, kişisel profil kullanılmaz.

## Kanıtlar

PASS: `node tests/assistant-book-actions.test.js` (2), `assistant-capabilities` (4), `assistant-agent-service` (8); ayrıca assistant-app-actions, book-assistant-actions, ipc-parity, coverage-map, book-command-flow, book-chapter-link, book-regenerate-request, review-workflow, preload-usage-ratchet, book-production-plan, book-passage-context, assistant-provider.

`book-export` ilk sandbox koşusunda alt süreç/FFmpeg bulunamadığı için 3 kırmızı verdi. Gerçek `D:/Whisper Local/backend/bin/ffmpeg.exe` ve ffprobe yolları `WHISPER_TEST_*` ile verilerek izinli Windows alt süreç koşumunda **5/5 geçti**: farklı örnekleme hızları, decoded süre, metadata ve iptal. Test atlanmadı/eşiği gevşetilmedi.

Native `electron tests/electron-assistant-books.smoke.js` Start-Process gerçek exit **0**. Üç sayfalık sentetik PDF'nin yalnız 2. sayfası bir üretim bölümüne geçti; 3. sayfa eklenmedi. Sayfa değişince eski owner reddedildi, olmayan üretim bölümü ve sessiz M4B preview reddedildi. Kontrollü engine red sonucu olumlu kabul dönmedi; ardından kontrollü kabulde `accepted` döndü. TR koyu 1440×1000 ve yeniden açılmış EN açık 800×760 görüntüleri incelendi; dialog ekran sınırları içinde. Son kanıt `.uiprev/assistant-books/1793054327645-23240/`; ham profil/görüntü/log Git dışıdır.

Değişen JS + yeni testler ve main/preload/renderer `node --check`, `git diff --check` geçti. Tam npm test, uzun CI, gerçek model/GPU, ses donanımı/kalitesi, canlı sağlayıcı ve gerçek M4B dosyasının yeni UI aracından uçtan uca tamamlanması doğrulanmadı. M4B gerçek codec kanıtı hedefli mevcut export testindendir. Yeni native testte yalnız engine kabulü sentetiktir, ses üretmez. `start.bat`/install/GPU bağımlılıkları değişmedi; normal start.bat yeniden açılışı denenmedi. Yeni bağımlılık veya kalıcı şema yok. Kişisel uygulama kapatılmadı.

## Sınırlar ve devam

P06 bağlantıları tamam; bölüm review açma/onay mevcut UI'dadır, asistan otomatik dinleme onayı veya işitsel kalite iddiası yapmaz. Raf okuyucusundan yalnız açık doğrulanmış bölüm hazırlanır; çoklu bölüm seçimi üretim ekranında yapılır. Büyük proje listeleri sınırlı; tüm metin/model kalitesi tarandı iddiası yok. P07 kütüphane/keşfet/ayarlar, P08 çok adımlı zincirler ve toplu kabul sıradadır.
