# Rapor467 — Rapor465 bağımsız doğrulaması ve düzeltmeler

2026-10-18. Başlangıç HEAD `26ec4809837a2ee2557891ced1ebd276f6482856`.
Bitiş kod commit'i `3179dafeb6e00b8c2ec390c087b8dd84e8a67422`.
Rapor465'in sekiz maddesi mevcut kaynak üzerinden incelendi.

## 465-01 — Dublajda cp1254 / UTF-16

**Doğrulandı ve düzeltildi.** `dub_plan.parse_srt` UTF-8 replacement ile
cp1254 Türkçe karakterleri bozuyor, UTF-16 zamanlarını bulamıyordu.
Transcribe'ın mevcut BOM/UTF-8/cp1254/latin-1 ve muhafazakâr mojibake
onarımı `backend/subtitle_text.py` ortak hafif modülüne taşındı.
Transcribe aynı API isimlerini dışarı sunar. Dublaj parser'ı doğrudan bu
byte decoder'ını kullanır; modeli veya transcribe modülünü import etmez.

UTF-8 BOM, cp1254, UTF-16 LE/BE fixture'larında metin ve zamanlar aynı;
planın sourceHash'i hâlâ özgün dosya baytlarına aittir. Kaynak dosya
yeniden kodlanıp üzerine yazılmaz. TTS chunk cache kimliği metni içerdiği
için düzelmiş metin eski bozuk telaffuzun cache'ine bağlanmaz. Gerçek TTS
modeli bu tur çalıştırılmadı.

## 465-02 — Hash-route arşiv çakışması

**Doğrulandı ve düzeltildi.** canonicalPageUrl artık ortak safePlaceUrl ile
kimlik bilgilerini ve hassas sorguları temizler; `#/` ve `#!/` rotalarını
korur, sıradan çapaları düşürür. `#/watch/1` ve `#/watch/2` ayrı içerik
kimlikleri olur. Diskte iki kayıt ve yeni archive nesnesiyle tekrar okunan
iki ayrı çeviri doğrulandı. Route sorgusundaki token temizliği de testlidir.
Önceden üzerine yazılmış eski çeviriler geri getirilemez; eski rotasız
kayıt yeni bir route için yanlış eşleştirilmez.

## 465-03 — Cache hit kalite serisini sıfırlamıyor

**Doğrulandı ve düzeltildi.** Kalite kapısından geçen temiz cache sonucu,
güncel kuşak/iptal edilmemiş iş için consecutiveQualityFailures değerini
sıfırlar. Sağlayıcı sağlık sayacı değiştirilmez: cache sonucu sağlayıcının
sağlıklı olduğunu kanıtlamaz. Bozuk cache zaten elenip sağlayıcıya gider.

Tek eşzamanlı işli A(kalite hatası), B(temiz cache), C(kalite hatası)
regresyonunda eşik 2 iken qualityAutoLenient artık false kalır; yalnız B
başarılıdır. Sıfırlama çıkarılmış eski kod davranışı ayrıca bellekte
çalıştırılarak qualityAutoLenient=true yeniden üretildi. Test düzeneğinin
ilk taslağındaki cache API ve snapshot alanı hataları düzeltilmiştir;
bu düzenek hataları ürün hatası olarak sayılmaz.

## 465-04 — Aynı cueId ile sahte tamamlanma

**Doğrulandı ve düzeltildi.** Kaynakta yinelenen kimlikler dahili olarak
tekil sıralı kimliklere ayrılır; açık kimliklerle çakışma önlenir. Tekil
cueId'nin eski eşleşme davranışı korunur. Yinelenen id'nin çevirisi yalnız
ilgili zaman aralığını tamamlar. Birleşik cue, açık coveredCueIds ve
kapsadığı zaman aralığıyla birden fazla kaydı kapsayabilir. Yalnız id
listesi, aynı id'li iki zamanın dosyada bulunduğunu kanıtlamaz; rapor
bu durumda tam göstermez. Kaynak veriler değiştirilmez.

İki kaynak x / bir sonuç x: partial, 1 çevrilmiş + 1 eksik. İki ayrı zamanlı
sonuç: complete. Dosya ve ekran aşamalarında da eksik gösterimi testlidir.
Kimlik grupları Map ile indekslenir; tekil id'lerde her sonuç için tüm
kaynağı tarayan yeni karesel yol eklenmedi.

## 465-05 — Üç nokta karakterinin tamamlama ofseti

**Doğrulandı ve düzeltildi.** …/‥ gibi birden fazla katlanmış birim üreten
karakterlerde foldSearchIndex haritası özgün karakter aralıklarına geri
eşlenir. Sorgu tek glifin yalnız bir bölümünü kapsıyorsa inline tamamlama
önerilmez; kullanıcının yazdığı nokta değiştirilmez. Tam üç nokta ve
sonraki harf için özgün prefix doğru döner. Mevcut Unicode, Hangul/emoji
ve adres performans testleri geçti.

## 465-06 — Sert kapanıştan kalan indirme dosyaları

**Yeni yönetilen dosyalar için düzeltildi; eski dosyalar için sınır var.**
Yeni invtmp adı PID + UUID taşır. Sonraki download_stream başlangıcında
yalnız bu tam kalıba uyan, normal dosya olan, hedef klasör içinde kalan,
24 saatten eski ve sahibi kapanmış dosyalar temizlenir. Süreç durumu
mevcut pipeline_control._pid_is_alive üzerinden sorgulanır; Windows'ta
salt-okunur süreç durumu sorgusu kullanılır. PID yeniden kullanılıyorsa
dosya ihtiyatlı biçimde korunur. Symlink/dizin/ilişkisiz dosya silinmez.

Fixture: eski ölü PID dosyası silindi; eski canlı PID, yeni dosya, sahibi
bilinmeyen eski UUID dosyası ve notes.txt korundu. Gerçek güç kesintisi
üretilmedi. **Eski PID'siz UUID/legacy dosyalar otomatik silinmez**; devam
eden eski sürüm işiyle ayrıştırılamadıkları için güvenli manuel temizlik
gerektirirler. Bütün eski kalıntılar temizlendi iddiası yoktur.

## 465-07 — Kısa örnek dışında kalan düzenlemeler

**Uyarı eksikliği düzeltildi.** Limit ilk 11 kaynak cue'ya uygulanır;
11 grup garantisi değildir. Tam planın sample'da bulunmayan anahtarları
varsa apply_edits kontrollü DUB_WARNING sample_edits_unused olayı çıkarır.
Servis bunu warning'e çevirir; UI ayrıntısında TR/EN karşılığı gösterilir.
Örnek dışındaki düzenlemeler silinmez; tam üretimde kullanılabilir.
Sınırdaki cümle grubu anahtarı değiştiği için uygulanamayan düzenleme de
aynı uyarıyla görünür. Örnek sırasında bütün planı üretmeye başlanmaz.

Python uyarı/metin koruma testi, gerçek servis stdout->event testi ve
JSDOM ayrıntı alanı testi geçti. Yeni görünüm/CSS yok.

## 465-08 — PDF aralığının sınırsız genişlemesi

**Doğrulandı ve düzeltildi.** Ana süreç ve renderer kopyası, aralığı
genişletmeden önce sonlu ve pozitif sayfa sayısı ister. Güvenli üst sınır
100.000 sayfadır; bunun üstünde aralık seçimi reddedilir. Boş girişin
"tümü" anlamı korunur ve boş dizi üretir. Geçerli normal aralıklar aynıdır.
Sıfır/NaN/Infinity/negatif sayfa sayısı testleri ve renderer sözleşme
eşitliği geçti; regresyonda milyonluk dizi tahsis edilmedi.

## Doğrulama ve sınırlar

23 hedefli Node dosyası ve beş Python dosyası geçti (liste devir notunda).
Yeni Node dosyası 5, yeni Python dosyası 3 test içerir. Electron trusted
bridge smoke geçti; JS syntax, Python py_compile ve diff kontrolleri geçti.

Windows terminali kullanıldı. Türkçe dosya adları/karakterler ve dört
kodlama fixture'ı doğrulandı. Yeni üçüncü taraf bağımlılığı, kurulum veya
kalıcı şema değişikliği yok. Yeni ortak backend modülü normal paketleme
kuralları içindedir; paket envanter testleri geçti, yeni exe üretilmedi.
Uyarının metni DOM testinde doğrulandı; piksel/düzen değişikliği yok.

Tam npm test, gerçek YouTube/GPU/TTS/model, normal start.bat açılışı ve
uzak Windows CI çalıştırılmadı. Kullanıcının açık uygulaması/sekmeleri
kapatılmadı. Rapor464'ün diğer iddiaları bu teslimde çözülmüş sayılmaz.
