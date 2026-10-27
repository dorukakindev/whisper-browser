# Rapor 629 — Asistan, keşfet, Letterboxd ve katalog denetiminin doğrulanması

2026-10-27. Başlangıç master: `fc28b86715d7bc91d3253094f71bd0680dbc2a20`. Ürün düzeltmesi: `e2a568e926864824930e1c104d0d6c594024e6ab`. Dal: `codex/catalog-audit629`.

Kullanıcının paylaştığı 19 maddeli denetim mevcut kaynak ve hedefli davranış kontrolleriyle incelendi. Özgün kişisel rapor değiştirilmedi veya teslim kapsamına alınmadı. Örtüşen bulgular bağımsız hata sayılmadı.

## Bulgu kararları

| Kimlik | Karar ve yapılan düzeltme | Kanıt |
|---|---|---|
| BL-01 | Gerçek. CSV eşleşmesi yerelleştirilmiş ad yanında originalTitle kullanır; aynı yıl/ad için birden çok aday varsa tahmin yapılmaz. | csvPlan ve gerçek tekrarlı import |
| BL-02 | Gerçek. Asistan otomatik yorum istemine geçerli count=12 gönderir; modele verilen örnek en fazla beş yorum kalır. | Gerçek renderer adapter testi |
| BL-03 | Gerçek. Başka filme ait veya doğrulanmamış yeni kaynak dolu örneği/önceki analizi silemez. Birleştirme ayrıca iki kaynağın da aynı film olmasını ister. | DOM regresyonu ve native Windows |
| BL-04 | Kısmen gerçek. watched.csv izlenmişliği kaybediyordu. Kaynak dosya türünden watched bilgisi tutulur. Date ayrıca addedDate olarak korunur; ratings.csv Date değerini gerçek izleme tarihi saymak doğru değildir. Gerçek Watched Date ayrı kalır. | Python üç fixture ve gerçek import |
| BL-05 | Fixture ile doğrulandı; canlı sitenin tüm DOM varyantları kanıtlanmadı. 16 KB geriye bakma kaldırıldı. Açık li/article/div ataları izlenerek spoiler işareti alınır; komşu kart işareti taşınmaz. Browser klonu dış ata işaretini korur. | İç içe li, div kökü, ara div, uzun kart ve komşu kart |
| A-01 | Gerçek; L-05 ile aynı katlama kökü. İngilizce I ve Türkçe İ/ı araması ortak fold ile eşleşir. | Gerçek library adapter ve saf fold |
| A-02 | Gerçek. Komut katlaması İngilizce I harfini dotless ı yapmaz; Türkçe aksanlar korunur. Olumsuz/alıntılı komut kontrolleri korunur. | Sayfa/video/medya intent testleri |
| A-03 | Gerçek. discover_titles skip alır, servis on sonuç tüketir ve gerçek nextSkip/hasMore döner. | Adapter ve service pagination |
| A-04 | Raporun normal akışta veri kaybı iddiası doğrulanmadı: renderer zaten 196 mesaj civarında yeni göndermeyi durduruyor. Doğrudan/import edilmiş 200 üzeri veriye genel invalid yerine açıklayıcı limit mesajı eklendi; mesaj kesilmez/silinmez. | cleanThread input değişmezliği ve mevcut thread testleri |
| D-01 | Gerçek. Yerel debounce çizimi çevrimiçi isteği bayat sayıyordu. Yerel çizim ile online istek sürümü ayrıldı; düğme sonuçta tekrar açılır, yeni sorguya eski cevap basılmaz. | Hızlı tıklama ve geç cevap DOM testleri |
| D-02 | Gerçek. Ana sayfa aramasında katalogla aynı id taşıyan history satırı tek gösterilir. Kimliksiz/ayrı web kayıtları korunur; Set ile doğrusal eşleştirme yapılır. | Kod yolu incelemesi; bu koşul için ayrı native arama senaryosu koşulmadı |
| D-03 | Gerçek. Okunamayan alt klasör/dosya atlanıp uyarı döner, erişilebilir medya kaybolmaz. Kök klasör erişim hatası başarısız kalır. | EACCES kontrollü dosya sistemi testi |
| D-04 | Gerçek. nextSkip alınan tüm ham satırlara değil tüketilen sınıra göre ilerler, 2000 üzeri yeni sayfa sunulmaz. limit 1–100 doğrulanır. | 140 ham satır/10 tüketim ve son sayfa testi |
| L-01 | Gerçek. Başlık/yıl bazında günlük birleştirmesi tekrar izlemeleri siliyordu. Katalog için tek film, günlük için tarih ve aynı gün tekrar indeksi tutulur. Aynı import iki kez uygulanınca olaylar çoğalmaz. | ZIP sıra bağımsızlığı, aynı gün tekrar, gerçek iki import |
| L-02 | Gerçek. Bölüm sezon/numara değişse de sabit episode id ile mevcut kaynak korunur. | Gerçek service IPC testi |
| L-03 | Gerçek. Unicode katlanmış yol uzunluğu özgün yola indis olamaz. Sonek özgün normalize kök uzunluğuyla kesilir. | İ içeren Windows kök testi |
| L-04 | Gerçek. Düzenleme taslağı genres/directors dizilerini kopyalar; alanlar dolu açılır, düzenlenebilir ve kayıtta korunur. | Native gerçek form aç/kaydet ve IPC oku |
| L-05 | Gerçek, A-01 ile aynı kök. Katalog araması da ortak fold kullanır. | Kaynak incelemesi ve ortak fold kontrolleri |
| L-06 | Sessiz başarı gerçek; UNC desteğinin bulunmaması mevcut yol politikasının bilinçli sınırı. Kaynak seçimi artık desteklenmeyen yolu mutasyondan önce anlaşılır hata ile reddeder ve eski kaynağı korur. UNC/SMB desteği açılmadı. | Service IPC eski kaynak koruma testi |

## Doğrulama

- 19 hedefli Node dosyasının birlikte koşusu: 73 test geçti. Son ek spoiler varyantından sonra ilgili üç dosya: 22 test geçti (önceki koşuyla örtüşür; toplam diye toplanmaz).
- Yeni report629 dosyası son koşuda 10 regresyon içerir. Python `tests/test_report629_letterboxd.py`: 3/3 geçti.
- Değişen JS dosyaları node --check, Python py_compile ve git diff --check geçti. Son ek home/native dosyaları ayrıca syntax kontrol edildi.
- `tests/electron-review-workflow.smoke.js`: gerçek Windows Electron, izole profil, gerçek renderer/main/IPC/Browser/yerel katalog; native exit 0. Yorum örneği, önizleme/analiz, yanlış filmden koruma, mevcut asistan komutları ve tür/yönetmen form kaydı doğrulandı. Görüntüler alınarak incelendi, kişisel veri içermez; ham görüntüler Git'e alınmadı.
- Native kanıt: `.uiprev/review-workflow/1793066990536-21312/`. Yorum ve katalog ekranlarında taşma görülmedi. Bu bir yeniden tasarım iddiası değildir.
- İlk native denemede eski test ilk düğmeyle auto yolunu seçiyordu. Butonlar daha önce elle kaynak paneline taşındığından selector bozulmuştu. Test şimdi Browser yorum alma düğmesini açık adıyla seçer; mismatch kabulü yeni koruma davranışını doğrular. 90 saniye üst sınırı eklendi. İlk hata gizlenmedi; ürün eşiği gevşetilmedi.
- Gerçek Windows CLI import testi ek yol ayırıcı sorunu buldu: posix basename Windows yolunu tanımıyordu. Kaynak adı hem slash hem backslash için normalize edildi; aynı gün tekrar kimliği artık CLI yolunda da korunur.

## Sınırlar ve kurulum

Tam npm test, uzun CI, canlı Letterboxd/TMDB/AI, GPU/CUDA/ses kalitesi ve start.bat ile kişisel açılış koşulmadı. Kontrollü yanıtlar gerçek model/site kalitesi kanıtı değildir. start.bat/install.bat değişmedi. Yeni bağımlılık/IPC kanalı yok. Diary satırlarında watched/addedDate/rewatchIndex isteğe bağlı alanları eklendi; eski günlük verisi otomatik silinmez, tarihsel olarak kaybolmuş izlemeler yeniden export/import olmadan geri üretilemez. Kişisel profil/anahtar/dosyalar kullanılmadı veya yayımlanmadı. Uzun CI sonucu beklenmeden PR ve sürekli yetkiyle master teslimi yapılır; merge/push kimliği ayrıca doğrulanır.
