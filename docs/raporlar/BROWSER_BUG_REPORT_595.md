# Rapor 595 — Diğer okuma ve ayar ekranlarında gereksiz yerleşim yükü

Başlangıç master `40c9184f6437f470d358b9be9afb5b1bc00836ec`; ürün/test commit'i `34185f96bcc5ca8c13b79be88678c3e852d36a5e`; dal `codex/interface595`. Kullanıcı önceki arayüz düzenlemesinden sonra diğer yerlerdeki benzer sorunların da düzeltilmesini istedi. frontend-design/luna-ui-design ilkeleri ve mevcut media-surface token'larıyla sınırlı iyileştirme yapıldı; yeni tema veya bağımlılık yok.

## Bulunan ve düzeltilen üç alan

1. **Dar ekran ayarları:** 720×680 pencerede kategoriler, arama kutusuyla beraber uzun yatay rayda kalıyor; sonraki kategoriler görünmüyordu. Dar görünümde aynı kategori eylemlerine bağlı yerel select ve arama bir satırda sunuluyor. Görünüm/araçlar dahil tüm kategoriler seçilebilir. Değişim sonrasında odak görünür select'te kalır; desktop yan menüsü korunur. Arama, eşleşmeyen seçenekleri devre dışı bırakır, Enter ilk eşleşen bölümü açmaya devam eder. Header'ın dar ekrandaki tekrar eden tanıtım satırı kaldırıldı, sağlayıcı özeti aralığı azaltıldı. Gerçek kontrol düğümleri taşınır; anahtar/model kayıt formu kopyalanmadı.
2. **EPUB/TXT okuyucu:** PDF'den sonra burada da sürekli görünen kaynak etiketi + üç asistan düğmesi + açıklama satırı okuma alanını daraltıyordu. Üst çubukta Asistan menüsüne taşındı. Seçili pasajı açıkla, bölüm özeti ve asistanı aç eylemleri/kaynak denetimi korunur. Okuma araçları ve asistan menüsü aynı anda açık kalmaz; dışarı tıklama ve Esc menüyü kapatır, kitabı kapatmaz. Uzun menü içeriği kendi içinde kaydırılır.
3. **Sesli kitap dinleme:** Üretim çalışma alanı başlığı, sezon araçları, sürekli asistan ve yer imi blokları dinleme sırasında tekrar yer kaplıyordu. Dinlemede başlık kitap adı olur; diğer iş kategorileri ve tanıtım yazısı gizlenir, Editöre dön görünür kalır. Yazı boyutu ve yer imleri Okuma araçları menüsünde, kaynak açıklaması/özeti Asistan menüsündedir. Gerçek ses oynatma ve PDF/metin vurgusu aynı akışı kullanır. Editöre dönünce üretim başlığı ve kategori menüleri geri gelir; farklı üretim araçları silinmez. Editördeki asistan satırı da isteğe bağlı kompakt menü oldu.

Ortak BookAssistantUI.mount `compact` seçeneği kazandı; PDF okuyucu kendi menüsünü kullandığından varsayılan false korunur. Yeni document pointerdown dinleyicisi dispose sırasında kaldırılır. Özet isteği hazırlanıp mevcut kaynak doğrulandıktan sonra menü kapanır; bağlam/soru güvenliği değiştirilmedi.

## Değişiklik yapılmayan kontrol alanı

Bağımsız asistan penceresi `electron-assistant-conversation.smoke.js` ile ayrıca çalıştırılıp geniş/küçük açık tema görüntüleri incelendi. Kaynak bilgisi kapalıyken uzun yanıt, gönderme kutusu, konuşma araçları ve hata makbuzu kullanılabilir bulundu. Eşdeğer belirgin taşma/gereksiz kalıcı satır doğrulanmadığı için onun kodu değiştirilmedi. Bu bütün asistan durumları, bütün site bağlamları veya gerçek model yanıt kalitesi kusursuz demek değildir.

## Görüntüler ve gerçek çalışma

- [Dar ayarlar](r595-evidence/settings-compact.png): aynı form, arama + kategori seçimi; fixture anahtarı maskeli. Test sentetik localhost servisi kullanır.
- [EPUB Asistan menüsü](r595-evidence/epub-assistant.png): 800×800 mantıksal pencerede menü sınırları ölçüldü; sentetik EPUB.
- [Sesli kitap okuma araçları](r595-evidence/audiobook-tools.png): sentetik PDF ve WAV; yer imi ve yazı boyutu menüsü, kitap başlığı ve sade dinleme.

Tüm native kontroller ayrı Windows profiliyle yapıldı. Kişisel uygulama kapatılmadı, gerçek kitap/geçmiş/API anahtarları kullanılmadı. Görüntüler tek ortamın ölçeğidir; çoklu DPI/GPU/DRM matrisi değildir. İlk inceleme görüntüleri yerelde: `.uiprev/app-settings/1792967797025-12696`, `book-assistant-1792967843537`, `pdf-reader546-1792967867481`. Son kabul: `app-settings/1792968223169-22404`, `book-assistant-1792968429628`, `pdf-reader546-1792968422726`. Bağımsız asistan gözlemi: `assistant-conversation/1792967893280-21228`.

## Kontroller

- Windows Electron `electron-app-settings.smoke.js`: exit0. Gerçek ayar/IPC/anahtar saklama, model listesi/probe için yalnız yerel HTTP fixture; yeni select ile genel kategoriye gidip geri dönme, odak ve yatay taşma kontrolü. Dış sağlayıcı çağrısı0.
- `electron-book-assistant.smoke.js`: exit0. Editörün kaydedilmemiş tam bölümü, sesli bölüm, PDF sayfası ve EPUB bölümü doğru bağlamla5 kontrollü soru gönderdi. Kompakt menü gerçek summary tıklamasıyla açıldı; Esc kitabı açık tuttu, 800px menü ekran içinde kaldı. Gerçek LLM çağrısı yok.
- `electron-media-workflows.smoke.js`: exit0. Gerçek PDF çizimi ve kontrollü WAV, metin/PDF highlight, dinleme araçları/yer imleri, Esc, editöre dönüşte başlık/nav'ın geri gelmesi, mevcut M4B fixture akışı. Bu TTS üretim testi değildir.
- Bağımsız asistan native konuşma senaryosu exit0; kaynak değişimi/eski token, taslak ve hata teslimi, küçük görünüm ölçümleri geçti. Ürün değişikliği yapılmadı.
- Node `book-assistant-actions`:1; `book-bookmarks`:2; `media-workflows`:2; `media-shelf-service`:3 alt test geçti. Son iki dosya ilk sandbox koşusunda Python keşfedemedi; mevcut venv'e WHISPER_TEST_PYTHON verilerek izinli koşumda geçti. Ürün testleri/ eşikler değiştirilmedi.
- i18n-coverage, ui-locale-userdata, değişen JS sözdizimi ve git diff kontrolleri geçti. Belgeler için docs-index-integrity ayrıca çalıştırılır.
- Tam npm test/uzunCI, gerçek TTS/GPU/ücretli servis/YouTube/DRM ve temiz install.bat/start.bat kabulü bu tur koşulmadı. Başlatma, kurulum, model ve bağımlılık dosyaları değişmedi. Rapor593'ün açık ürün bulguları bu UI işinde çözülmüş sayılmaz.
