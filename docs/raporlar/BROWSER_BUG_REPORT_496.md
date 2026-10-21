# Rapor 496 — Kütüphane, not, kuyruk ve çeviri hafızasında 20 hata

Tarih: 2026-10-21. Dal: codex/broad-bugs496.
Başlangıç HEAD: 9ca12b0542fe84856b93717a7d33f33ec7029ef6.
İlk ürün commit'i: 66cb8875c003f6b212f0af9823bf754982fd7a6d.
Son ürün commit'i: 79775a872e578059bd7957b746f3563308a56352.
[PR468](https://github.com/dorukakindev/whisper-browser/pull/468).

20 ayrı davranış hatası, 17 Node + 4 Python regresyonuyla doğrulandı.
İki Node senaryosu aynı 496-06 hatasının modül ve gerçek IPC yolunu sınar;
21 test, 21 ayrı bug diye sayılmadı. Eski kodda hepsi assertion ile başarısız,
düzeltmede başarılıdır. Kontroller gerçek dosya/SQLite ve kontrollü IPC verisi
kullanır; canlı sağlayıcı veya model kalite ölçümü değildir.

| No | Önem | Tetikleyici ve kök neden | Onarım |
|---|---|---|---|
| 496-01 | Orta | Kütüphane birleştirmede daha büyük eski dosyanın boyutu, seçilen küçük hedef dosyanın boyutunu eziyordu. | Boyutu seçilmiş hedefe ait tut; bilinmeyen hedef boyutunu eski dosyayla uydurma. |
| 496-02 | Orta | Altyazı arama indeksi `cueId` yerine geçici `id`/sıra sayısını kaydediyordu. | Kanonik cue kimliğini öncele. |
| 496-03 | Yüksek | SQLite yeniden bağlamasında hedef zaten varsa ON CONFLICT onun başlık/konum/tercihlerini kaynakla eziyordu. | Yeniden adlandırmayı çakışmada atomik reddet; açık birleştirme yolu ayrı kalır. |
| 496-04 | Yüksek | Aynı web alıntısı sayfanın iki ayrı yerinde alınca ikisi de sıfır zamanlı aynı ID'yi üretiyordu. | Not kimliğine normalize metin çapasını kat; açık eski ID'leri değiştirme. |
| 496-05 | Yüksek | Sıfır zamanlı yeni alıntıyı kaldırmak, eşleşmeyen tek eski alıntıyı zaman yakınlığıyla silebiliyordu. | Çapalı alıntıyı çapayla tekil eşleştir; zaman fallback'ini çapalı kayıtlara uygulama. |
| 496-06 | Yüksek | Kaynak/çeviri bağlamı güncellenirken eksik etiket, link, çapa ve kullanıcı alanları boş varsayılana dönüyordu; main normalizasyonu da eksik alanları açık boşluk yapıyordu. | Ham güncellemede atlanan alanları mevcut kayıttan koru; seçim/toggle/research IPC'lerini bu sözleşmeye bağla. |
| 496-07 | Yüksek | Geçerli JSON içindeki `annotations:[null]` sağlam belge sayılıyor; geçerli yedek yerine boş depo kullanılıyordu. | Kalıcı satır kimliklerini belge kabulünden önce doğrula; sağlam yedeğe dön. |
| 496-08 | Orta | Türkçe çeviri izleme işinde kaynak veya İngilizce altyazı bulununca video tamamlanmış sayılıyordu. | İstenen hedef dilin dosyasını gerektir; dil eki taraması başka dili kabul etmez. |
| 496-09 | Orta | Sıfır bayt dosya veya aynı isimli klasör, yalnız exists kontrolüyle tamamlanmış çıktı sayılıyordu. | Gerçek tarayıcıda normal ve sıfırdan büyük dosya gerektir; önbellekli dizin adını da predicate ile doğrula. |
| 496-10 | Yüksek | 501 öğeli kuyruk kaydı kabul ediliyor, normalleştirme son işi sessizce kesiyordu. | Kapasite aşımını yazmadan önce reddet. |
| 496-11 | Yüksek | Başka/gecikmiş renderer listesindeki eksik aktif iş diskten düşebiliyordu. | Ana süreçteki aktif kaydı koru; bayat pending durumunu running'e getir; terminal kaydı yeniden running yapma. |
| 496-12 | Yüksek | Gelecek sürümlü kuyruk belgesi v1 olarak yeniden yazılabiliyordu. | Girdi sürümünü reddet; birincil veya yedekte desteklenmeyen sürüm varsa iki dosyayı da koruyup yazmayı durdur. |
| 496-13 | Yüksek | Defter Markdown çıktısı kaynak/link URL'lerindeki parola, token ve matris parametrelerini dışa taşıyordu. | URL hedefini ve varsayılan URL etiketini ortak redaksiyonla üret. Kullanıcının serbest not metni otomatik değiştirilmez. |
| 496-14 | Orta | `C:/Movies/../Film.mp4` ve `C:/Film.mp4` aynı dosya için iki kütüphane kimliğiydi. | Yol bileşenlerini normalleştir; not mediaId'sini ve SQLite iz/not sahipliğini eski alias'larla uyumlu taşı. |
| 496-15 | Orta | Waiting/stalled olayı gelmeyen HLS duruşunda 9 saniye önceki ilerleme, 2 saniye duruştan sonraki ilerlemeyle birleşip kurtarma hakkını erken sıfırlıyordu. | Biriken ilerlemesiz süreyi izle; uzun duruşta kararlılık penceresini sıfırla. |
| 496-16 | Yüksek | Kuyruk seçeneklerindeki provider URL yalnız sorgu alanında temizleniyor; matris/fragment token'ı JSON'da kalıyordu. | Ortak URL redaksiyonunu uygula; güvenli rota parametresi korunur. |
| 496-17 | Yüksek | Çeviri hafızası `50%` ve `50` kaynaklarını eşdeğer sayıp eski çeviriyi yeniden kullanabiliyordu. | Sayı imzasında yüzde niteliğini koru. |
| 496-18 | Yüksek | Tırnakla biten soru/ifade çiftinde son karakter `?` olmadığı için soru farkı kaçıyordu. | Kapanış tırnak/parantezini ayırdıktan sonra soru niteliğini karşılaştır. |
| 496-19 | Yüksek | Cümle başındaki `US` özel kısaltması, küçük `us` zamiriyle ilk-token kuralından geçiyordu. | Büyük harfli kısaltmayı ilk özel-ad çapası olarak koru. |
| 496-20 | Yüksek | Türkçe `er` ve Almanca `um` gerçek sözcükleri İngilizce dolgu sesi sanılıp siliniyor, farklı kaynak aynı cache adayı oluyordu. | Belirsiz dolgu sözcüklerini ancak açık söylem virgülleriyle düşür; normal içerik sözcüğünü koru. |

## Kanıt / kısa doğrulama

- Yeni Node: `node --test tests/report496-regressions.test.js` — 17/17.
- Yeni Python: `D:/Whisper Local/backend/venv/Scripts/python.exe tests/test_report496_memory.py` — 4/4.
- Başlangıç kopyası `tmp/report496/before`; eski kod çıktıları
  `tmp/report496/node-before.txt` ve `python-before.txt`. 17 Node ve 4 Python
  assertion başarısızlığı; ortam/import hatası yok. Kopyalar ignored ve yereldir.
- İlgili 16 dosyalı Node grubu 32/32; ek IPC/alias grupları 20/20 ve 21/21
  başarılı (gruplardaki örtüşmeler toplam test sayısı diye toplanmaz).
  Toplam 18 ayrı Node dosyası koşuldu; dahili senaryo sayıları ayrıca stdout'tadır.
- Mevcut `backend/test_translation_memory.py` 6/6; yeniyle toplam 10 Python testi.
- Değişen JS, main/preload/renderer syntax, Python py_compile ve diff kontrolü geçti.
- Windows Electron trusted-bridge smoke geçti; gerçek kullanıcı profili kullanılmadı.
- Kuyruk bozulma fixture'ındaki eski "aktif işi error ile ezmek serbest" beklentisi,
  ana süreç aktif kimliğini koruyan açık running/currentQueueId kanıtıyla güncellendi.
  İzleme dizin fixture'ı ad listesine ek olarak gerçek dosya predicate'ini sağlar.

## Sınırlar / uyumluluk

Tam npm test, start.bat, gerçek YouTube/DRM, canlı sağlayıcı, GPU veya model
üretimi yapılmadı. CI değiştirilmedi, beklenmedi ve sonucu başarılı diye sunulmadı.
Arayüz yerleşimi/stili değişmedi; tam uygulama görsel testi bu turun kapsamı değil.

Bağımlılık, kurulum, SQLite/JSON şema sürümü değişmedi. Eski açık not ID'leri
korunur; önceki çapalı alıntılar eşleştirilir. Dosya alias normalizasyonu eski
notları bellekte kanonik kimlikle okur; SQLite sahipliği kütüphane uzlaşmasında
aktarılır. Yedekteki eski ham yollar bir sonraki olağan kayıtta güncellenebilir.
Kayıp eski notlar veya önceden ezilmiş metadata geriye dönük uydurulmaz.
Çeviri hafızası daha konservatif davranıp bazı cache eşleşmelerini reddedebilir.
Sıfırdan büyük altyazı dosyası bu taramada içerik kalitesi garantisi değildir.
Ana checkout güncellenmedi, master'a merge edilmedi; PR önceki teslimleri de taşır.
