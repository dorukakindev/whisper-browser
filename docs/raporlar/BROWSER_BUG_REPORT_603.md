# Rapor 603 — PDF narasyonu ve anlam kanıtı, 30 maddelik ürün paketi

Başlangıç: f077d1889ef5eab445c4f7303afe35ca061a94c8. Dal: codex/product-focus603.
Ürün/test bitişi: 27afe3a488deeabe918f65294b1140357a8a112e (ana ürün ec371e9af7a3c9808a38bfae37e611f28551fe4b).

[30 maddenin sonuçları](PRODUCT_30_603_2026-10-26.md):22 uygulama/entegrasyon kabulü ve8mevcut uyum kontrolü;30ayrıbug iddiası yok.

## Doğrulanmış değişiklik grupları

1. PDF dosya içe aktarımı ham text-item sırasını okuyordu. Aynı satırda üç nesir sütunu ayrıca tablo sanılabiliyordu. Geometrik paragraf hattı narasyona bağlandı; uzun cümleli hizalı nesir için tablo sezgisi daraltıldı. İki gerçek sentetik PDF'de row-major ve column-major akış aynı sütun sırasına geldi. Gerçek kısa/numerik tablo satır sırası korundu.
2. Yinelenen kısa kenar etiketleri ve kenardaki sayfa numaraları kitap narasyonuna taşınıyordu. Var olan kenar filtresi dosya narasyonuna bağlandı; özgün PDF değişmedi. Çıkarılan satır sayısı proje bölümünde ek metadata ve EN/TR açıklamayla görünür. Gövde içindeki42 gibi sayılar korunur.
3. Okuyucu metni ham sıradaydı; model gerektirmeyen yetkili pdf:prepareText kanalı aynı paragraf hazırlayıcısını kullanır.8000item/sayfa,3sayfa/paket,16000item/400000karakter sınırları mevcut hazırlayıcıdan gelir. Hata veya boş hatalı sonuçta eski metin korunur, görünür uyarı verilir. Yalnız açık/yetkili PDF kimliği kabul edilir.
4. Reader'ın bildirdiği numPages gerçek dosyayla doğrulanmıyordu. Ana süreç PDF.js ile gerçek sayfa sayısını okur; uydurulmuş toplam/sayfa reddedilir. Unit fixture'lar ana süreçteki onaylı belge sınırını açık numPages ile taklit eder; gerçek dosyalı regresyon ayrıca çalışır.
5. Çeviri sayı korumasında bir hedef sayı birden fazla kaynak geçişini karşılayabiliyordu. Eşleşme tüketilir. Türkçeye çeviride İngilizce yazıyla kesin sayılar ve3million gibi birleşik nicelikler karşılaştırılır. Bare one zamiri dışarıda; diğer hedef dillerin mevcut yazıyla sayı sözleşmesi değiştirilmedi. Saat ve açık birim dönüşümü istisnaları korundu.
6. ASR doğrulamasında yazıyla nicelik kaybı/eklenmesi uzun metinde benzerlik eşiğini geçebiliyordu. Normalize sayı öbeklerinin tekrar sayısı karşılaştırılır; review ve iki dilli 'Söylenen sayı farklı' nedeni üretir. Bu otomatik metin/ses silme değildir.
7. Türkçe harf içeren sözcüklerde I/ı katlaması ve TBMM'de benzeri büyük kısaltma ekleri ASR eşdeğerliğini bozabiliyordu. Yerel Türkçe katlama ve mevcut özel ad eki normalleştirmesi kısaltmalara genişletildi; English I genel olarak değiştirilmedi.
8. Dublaj metin düzenlemesinde sadece/hariç/dahil, en az/en fazla, henüz/artık, yazıyla sayı sırası, rakam sırası ve özel adın kesmeyle yazılmış durum eki yeterince korunmuyordu. Muhafazakâr anlam kanıtına eklendi. Sadece/yalnızca ve düz/kıvrık kesme eşdeğerleri kabul edilir.

## Kanıtlar ve kontroller

- tests/product603.test.js:4davranış grubu (editör kanıtı,3sütun/tablo,kenar/gövde sayısı,gerçek PDF sayfa sınırı).
- tests/test_product603.py:3test grubu, tekrar/bileşik/yazıyla sayılar, zamir ve diğer diller, ASR eşdeğerlik/kayıp/ekleme.
- backend-sentence-translation:125kontrol geçti. backend/test_golden_corpus.py:6test ve60kontrollü altyazı örneği geçti; gerçek model kalitesi değildir.
-17kitap/M4B/hedefli davranış testi geçti (media-workflows,book-export,reliability,bookmarks,production-plan,voice-takes,checkpoint601).
- PDF reading-order/translate/state-deadzone geçti; paket bütünlüğü9test, kitap pasaj/asistan kontrolleri geçti.
- test_dub_quality9,test_dub_finish23,test_dub_generation_quality20geçti.
- npm run test:electron-bridge geçti.
- Windows native electron-pdf-reader-experience ve electron-media-workflows geçti: PDF/asistan bağlamı,seçili2–3sayfa,çeviri yok kapısı,ses stüdyosu,okuma vurgusu,kontrollü layout hatasında kaynak metni koruma,TR/EN ve dar ekran.
- Değişen JS node --check,Python py_compile ve git diff --check geçti.
- Görsel kanıtlar Git dışı .uiprev/pdf-reader546-1793016699507 ve .uiprev/pdf-reader547-1793016914491. TR PDF hazırlama ve EN1024px ekranları araçla açılıp incelendi; sonraki smoke normal/kontrollü hata görüntülerini ayrı kaydeder.

## Sınırlar

PDF sırası sezgiseldir: tamamen uzun nesir içeren gerçek tablolar ile sütunlar kesin ayrılamaz. Tek okuyucu sayfasında yinelenen üstbilgi kanıtı yoktur; tam kitap içe aktarımı daha geniş bağlama sahiptir. Kaynak sayfa/PDF değişmedi; kullanıcı taslağı inceleyebilir. Yazıyla sayı/ek/negatif kontrolleri tam Türkçe anlambilim değildir; ASR uyarısı yanlış pozitif olabilir, dinleyerek inceleme gerekir. Tam npm test/uzunCI,gerçekGPU/TTS,kişisel ses,canlı YouTube/DRM/API çalışmadı. CI açık, teslim sonucunu beklemeye bağlamıyoruz. start.bat değişmedi; izole native Electron kabulü temiz makine start.bat/CUDA doğrulaması değildir. Yeni bağımlılık kurulmadı; mevcut pdfjs-dist kullanıldı.
