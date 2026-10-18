# Rapor466 — Rapor463 doğrulaması ve düzeltmeler

2026-10-18. Başlangıç HEAD `7eb6a5b7c482fe06e80591ae70de44a843065fe6`.
Çalışma sürerken başka oturum yalnız rapor/devir belgelerini commit etti;
kod commit'inin doğrudan ebeveyni `027522c66551b54ea5b2d364d4743e12031a7173`.
Bitiş kod commit'i `d1359b4edb2b7867630b24e2e33f09561748ecc7`.
464 ve 465 raporları korunarak bu teslim 466 olarak numaralandırıldı.

## Bulguların sonucu

| Rapor463 | Sonuç |
|---|---|
| 01 sıfır süreli cue | Kısmi düzeltme: kaybolan cue'nun iki yanındaki parçaların yanlış birleşmesi ve kırmızı test düzeltildi. Geçersiz zamanlı cue hâlâ çevrilmez/yazılmaz; metni uydurma zamana oturtma veya kullanıcı uyarısı eklenmedi. |
| 02 endpoint/kasa | Doğrulandı, düzeltildi: endpoint kimliği değişen translate/LLM/manga alanları için yalnız yerel kodun ürettiği temizleme işaretleri diske taşınır. |
| 03 tireli replik | Doğrulandı, düzeltildi: konuşmacı tiresi ilk gerçek sözcüğü özel ad yapmaz. Gerçek isim kaybı kontrolü korunur. |
| 04 saat dönüşümü | Doğrulandı, Python ve browser JS anlam kapıları düzeltildi. AM/PM 24 saate çevrilir; yanlış dakika veya 12 saat farkı reddedilir. |
| 05 kısa diyalog birleştirme | Doğrulandı, düzeltildi: tire/SDH/konuşmacı sınırları flash cue birleştirmesine engeldir. |
| 06 aynı dilde partial | Doğrulandı, düzeltildi: bilinçli değişmeden kalan indeksler belirtilir; aynı-dil akışında kaynak-yankısı kalite hatası sayılmaz. |
| 07 kısa Türkçe dosya | Doğrulandı, muhafazakâr düzeltme: 1–2 anlamlı satırın tamamı mevcut Türkçe sezgisini geçerse dosya Türkçe kabul edilir. Dosya adına güvenilmez; karma gövde otomatik atlanmaz. |
| 08 TV açık tema | Doğrulandı, düzeltildi: TV paleti bg-1/accent-soft token'larını da kapsar. |
| 09 dış altyazı kodlaması | Doğrulandı, düzeltildi: watcher ilk açılışla aynı decodeSubtitleBuffer yolunu kullanır. |
| 10 burn-in yarışı | Doğrulandı, düzeltildi: kilit ilk dosya yetkilendirme await'inden önce alınır, tüm çıkışlarda finally ile bırakılır; jobStarting de kontrol edilir. |
| 11 eş anlamlı kısa tekrar | Örnek davranış gerçek; otomatik gevşetme uygulanmadı. Genel eş anlamlılık kanıtı yok; Yes/No → aynı çeviri gibi gerçek hataları kaçırmamak gerekir. Açık. |
| 12 bozuk primary/yedek | Doğrulandı, düzeltildi: kuyruk/geçmiş primary JSON'u ve kök türü doğrulanmadan sağlam .bak ezilmez. |
| 13 CJK sarma | Rapordaki çağrı varsayılan sentence modunda: bu mod açıkça cümle ortasında kırmaz. Balanced kipte boşluksuz yazıların genel sarma politikası bu tur değiştirilmedi. |
| 14 Celsius sırası | Doğrulandı, düzeltildi: derece santigrat nicelik birimi olarak tanınır; nicelik bağlamındaki Celsius özel ad sayılmaz. Yanlış Fahrenheit karşılığı hâlâ reddedilir. |
| 15 journal dayanıklılığı | Statik açık kapatıldı: temp dosyalar, journal, commit işareti fsync edilir; rename öncesi/sonrası dizin flush edilir. Bozuk journal silinmez, karantinaya taşınır. Gerçek güç kaybı simüle edilmedi. |
| 16 invtmp temizliği | Doğrulandı, düzeltildi: her indirme UUID'li temp dosyalarını sahiplenir; başka indirmelerin invtmp dosyaları süpürülmez. Ortak nihai çıktı adına eşzamanlı yazım sorunu bu kapsamda çözülmüş sayılmaz. |

## Kritik ayrıntılar ve kanıt

### API anahtarının yanlış endpoint'e yeniden bağlanması

Eski sanitizer anahtarı çıktıdan çıkarsa bile kasa sonraki yüklemede onu
geri ekliyordu. Ek olarak export redaktörü `clearedSecretFields` alanını
da temizlediğinden yalnız sanitizer'a işaret eklemek yeterli değildi.
Import kaydı, normal export redaksiyonunu koruyarak yalnız sanitizer'ın
yerelde ürettiği işaretleri geri ekler. Aynı endpoint anahtarı korunur;
ithal dosyanın keyfi temizleme listesi hâlâ güvenilir değildir. Mevcut
yerel temizleme niyeti de import sonrasında korunur. HF token endpoint
değişiminden etkilenmez. Kasa dosyası/gerçek anahtarlar okunmadı.

Yeni testler sanitize → public settings → vault merge zincirini translate,
UI fallback, inherited manga ve LLM için doğrular. Eski kodda kasa değeri
geri geliyordu. R51-08 testi endpoint değişimini keyfi silme işaretinden
ayırmak için aynı endpoint'li fixture'a düzeltildi; güvenlik beklentisi
gevşetilmedi. 23 ayar güvenlik testi ve 44 süreç çökmesi senaryosu geçti.

### Sıfır süreli cue sözleşmesi

Zamansal olmayan ham layout ve kalıcı/çeviri scheduler aynı sözleşme
değildir. Layout eski kaynak gruplarını tanıyabilir; scheduler pozitif
milisaniye aralığı olmayan cue'yu işleyemez. Ortak fixture iki katmanın
beklentisini ayrı belirtir. Ek olarak scheduler geçersiz cue'dan önceki
ve sonraki cue'ları protected yapar: a / sıfır-süreli b / c artık a c diye
tek istek olmaz. Rapor456'nın strict SRT/asset testleri korunmuştur.
Kullanıcının kaynak SRT dosyası veya ham cue nesneleri değiştirilmez.

### Çeviri kalite kontrolleri

Tire ön eki SDH/konuşmacı işaretleriyle birlikte sıyrılır. Saat için
Python'un iki kapısı ve JS kapısı aynı meridiem mantığını kullanır:
5:30 p.m. → 17.30; 12:15 a.m. → 00.15; 12:15 p.m. → 12.15. Değişen
dakika/yanlış AM-PM regresyonları ret bekler. Türkçe sözcükle saat
ifadesini kabul eden eski kontroller korunur.

Gerçek translate_existing_subtitle çağrısı fixture ortamında İngilizce
aynı-dil ve auto Türkçe tek satır için sağlayıcı çağrısını yasaklar;
çıktı status=complete ve partial dosya yokluğu doğrulandı. Bu sonuç gerçek
model kalitesi veya canlı sağlayıcı başarısı değildir.

### Disk ve süreç yaşam döngüsü

İki eşzamanlı burn-in çağrısında birincisi yetkilendirmede bekletildi;
ikincisi kilit yüzünden reddedildi. Yetkilendirme hatası sonrası kilit
bırakıldı. Bu test gerçek iki FFmpeg GPU süreci çalıştırmaz.

Kuyruk/geçmiş için bozuk primary + sağlam backup + sonraki yazım hatası
fixture'ı eski kodda backup'ı bozuyordu; artık sağlam kalır. Transaction
testi journal fsync olayının ilk rename'den önce geldiğini kontrol eder.
Windows'ta dizin fsync desteği mevcut ortak yardımcıdaki best-effort
sınırları taşır; donanım seviyesinde güç kesintisi garantisi verilmez.

İndirme testinde başka işin invtmp dosyası bırakıldı; mock HTTP akışı ve
mux sonrasında bu dosya değişmeden kaldı, yalnız bu işin temp'leri silindi.

## Doğrulama

24 hedefli Node test dosyası geçti (devir notunda liste). Yeni Node dosyası
9 test içerir. Python test_report466_regressions 7, test_transcribe 224,
test_sentence_distribution 48 test geçti. backend-sentence-translation
Node sürücüsü ayrıca 125 Python kontrolü geçirdi.

Electron trusted bridge smoke geçti. `audit-ui --strict` 52 yüzeyde 0
kontrast hatası verdi; önceki rapordaki light/TR ve light/EN player-mode
yüzeyleri de 0. Light/TR 1400 px ekran görüntüsü ayrıca görüntülenerek
başlık/eylem metinlerinin görünürlüğü incelendi. Görseller ve ham test
çıktıları ignore edilen tmp altında; Git'e eklenmedi.

Değişen JS/main/preload/renderer syntax, Python py_compile ve diff
kontrolleri geçti. Tam npm test bu tur tekrar koşulmadı; önceki tam koşumun
kırmızı dosyası hedefli olarak geçti. Gerçek kullanıcı profili, YouTube,
GPU/CUDA model, ücretli sağlayıcı, normal start.bat açılışı ve uzak Windows
CI doğrulanmadı. Yeni bağımlılık/şema yok. Açık sınırlar yukarıdaki 01, 11,
13 ve 16 açıklamalarında belirtilmiştir. Rapor464/465 ürün iddiaları bu
çalışmanın otomatik tamamlanan kapsamı değildir.
