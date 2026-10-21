# Rapor 495 — Konuşma anlamı, proje kurtarma ve altyazıda 20 doğrulanmış hata

Tarih: 2026-10-20. Başlangıç: 3575d0cd6823d18198f12d926163441097d00428.
Ürün/test commit'i: 50444fabdfe8b90695704f9a9158d448b2ce7632.
Dal: codex/broad-bugs495. [PR467](https://github.com/dorukakindev/whisper-browser/pull/467).

Her satır yeni bir davranış örneğiyle önceki kodda yeniden üretildi. 15 Node
ve 5 Python senaryosu eski kodda assertion ile başarısız, düzeltmede başarılı.
Bulgular gerçek modelin ses kalitesi ölçümü değildir; kontrollü veriyle ürün
mantığı ve üretim orkestrasyonunun kanıtıdır. Önem sınıfları ürün etkisine göredir.

| Kimlik | Önem | Yeniden üretim / kök neden | Düzeltme |
|---|---|---|---|
| 495-01 | Yüksek | `%50` → `50` yeniden yazımı sayılar aynı olduğu için kabul ediliyordu. | Yüzde niteleyicisini koru; `%50`/`yüzde 50` eşdeğerliğine izin ver. |
| 495-02 | Yüksek | `12 kg` → `12 km` sayıları koruduğu için kabul ediliyordu. | Sayı/birim çiftlerini koru; kg/kilogram gibi açık eşdeğerleri tanı. |
| 495-03 | Yüksek | `gelmeyecek` → `gelecek` Türkçe fiil olumsuzluğunu kaybediyordu; koruma yalnız ayrı olumsuzluk sözcüklerini tarıyordu. | Tanınan olumsuz fiil biçimleri için konservatif koruma. |
| 495-04 | Orta | Kalite raporu bulunmayan taşınabilir proje yeniden açılınca `qualityUnavailable` kayboluyordu. | Bayrağı manifestte koru; boş satırlı eski projede de uyar; açılış durum metninde göster. |
| 495-05 | Orta | İz seçmeden altyazıyı kapatma tercihi boş seçim sayılıp depodan siliniyordu. | Açık `off` tercihini sakla ve yeniden yükle. |
| 495-06 | Yüksek | İki kaynak cue tek hedef cue'ya birleşince sayı kaybı denetimden kaçıyordu; anlamsal kontroller yalnız birebir zaman eşlerine uygulanıyordu. | Örtüşen zaman bileşenlerini tam metin olarak birlikte denetle. |
| 495-07 | Orta | Cue zamanları yer değiştirince sabit kimliğe rağmen başka satırın eski çevirisi fark penceresine geliyordu. | Tekil sabit kimliği zamandan önce kullan; farklı açık kimliğe düşme. |
| 495-08 | Orta | Aynı zamanda iki konuşmacı cue'su varsa kimliksiz düzeltme, taban metni tekil olmasına rağmen uygulanamıyordu. | Zaman eşlerini tam taban metniyle güvenli biçimde daralt. |
| 495-09 | Yüksek | `1e6` → `1e3` bilimsel nicelik değişimi sayı regex'ine girmeyip kabul ediliyordu. | Sonlu bilimsel sayı gösterimini ortak nicelik denetimine kat. |
| 495-10 | Orta | Stremio yedeğinde sezon verilmiş, bölüm null iken `Number(null)` nedeniyle bölüm 0 sorgulanıyordu. | Eksik sezon/bölümde 1 varsayılanını kullan; açık bölüm 0 korunur. |
| 495-11 | Orta | Yalnız `WEBVTT`/NOTE başlığı taşıyan boş indirme başarılı altyazı sayılıyordu. | Ortak parser ile en az bir geçerli cue gerektir. |
| 495-12 | Yüksek | Elle eklenen tam dublajda browser medya bilgisi bayatlayınca dublaj duruyor fakat özgün video sesi kapalı kalıyordu. | Bayat/bekleyen/reklam örneğinde özgün mute tercihini bütün oturum tiplerinde geri getir. |
| 495-13 | Orta | Proje manifestindeki üretim ayarları açılışta okunmuyor; done/latest çıktısı da ayarları çalışma alanına taşımıyordu. | Ayar özetini done/latest, proje kaydı ve açılışında koru. Bu, otomatik yeniden üretim yetkisi değildir. |
| 495-14 | Orta | `audioStart == audioEnd` olan bir satır `ready` olarak geçerli kalite kaydı sayılabiliyordu. | Sıfır oynatılabilir süreyi yalnız açık `failed` satırında kabul et. |
| 495-15 | Orta | Dosya/ekran cue kimliği listelerindeki yabancı izler sayaçta sayılıyor; tek kaynak için 2 yazıldı gösteriliyordu. | Gözlenen kimlikleri kaynak kimliği kümesine sınırla. |
| 495-16 | Yüksek | Uzun bir cümleye eklenen `not`, yüksek genel benzerlik nedeniyle ASR denetiminden geçiyordu. | Eklenen olumsuzluk kanıtını incelemeye yönlendir; can't/can not eşdeğerini yanlış ekleme sayma. |
| 495-17 | Yüksek | Uzun cümlede kilometre yerine kilogram okunması benzerliği fazla düşürmediği için geçiyordu. | Tanınan söylenmiş birimleri ayrıca karşılaştır. |
| 495-18 | Orta | Uzun cümlede bir kez yinelenen üç sözcüklük ifade, tek sözcük sayaçları ve benzerlik eşiğinden kaçıyordu. | Kaynakta olmayan ardışık 3–6 sözcük tekrarını incelemeye yönlendir. |
| 495-19 | Yüksek | Son zamanlama aşamasında konuşma kesildiği halde üretimden gelen `ready` statüsü kalıyordu. | `cut_frames > 0` olan final grubu `review` yap; dosyayı üretmeye devam et. |
| 495-20 | Yüksek | İstenen ASR doğrulaması kullanılamadığında akustik skor 0 ise grup `ready` sayılıyordu. | Kullanılamayan/bilinmeyen doğrulamayı `review` yap; eski cache metadata'sını da güvenli yorumla. Bilinçli `not_checked` modu korunur. |

## Kanıt ve kontroller

- `tests/report495-regressions.test.js`: 15 Node davranışı; gerçek modüller,
  geçici proje dosyaları, kontrollü fetch ve dublaj denetleyicisi.
- `tests/test_report495_audio.py`: 5 Python davranışı; gerçek speech_check
  ve üretim fonksiyonlarının AST ile ayrılmış gerçek gövdeleri.
- Önceki sürüm kopyası ve stdout kayıtları ignored `tmp/report495/before`
  ve `tmp/report495/*-before.txt` içinde yerelde. Kişisel veri yok.
- İlk Node denemesi sandbox EPERM verdi; izinli koşumla giderildi. İlk
  baseline kopyasında eksik JSON destek dosyası tamamlandıktan sonra 15/15
  hata assertion olarak yeniden doğrulandı. Ortam hataları bug sayılmadı.
- İlgili ana Node grubu 55/55 geçti; ek diff/surface/service grubu 18/18
  geçti (örtüşen senaryolar toplanmaz). Toplam 17 ayrı Node dosyası koşuldu.
- Yedi Python dosyasında 44 test geçti. Üretim AST fixture'ının yeni
  yardımcısı açıkça bağlandı; bu eksiklik ürün hatası diye sayılmadı.
- Değişen JS syntax, main/preload/renderer syntax, iki üretim Python
  modülünün py_compile ve git diff --check başarılı.
- Windows Electron trusted-bridge smoke başarılı. Ayrı test profiliyle
  açılan proje kalite uyarısı gerçek Electron'da görüldü; ekran görüntüsü
  `tmp/report495/project-warning.png` incelendi. Normal kullanıcı profiline dokunulmadı.

## Sınırlar

Tam npm test, start.bat, gerçek GPU/VoxCPM2 üretimi, canlı sağlayıcı,
YouTube/DRM ve gerçek kullanıcı hesabı çalıştırılmadı. CI kapatılmadı;
sonucu beklenmedi ve başarılı diye sunulmadı.

Yeni bağımlılık ve veritabanı şeması yok. Proje manifestine opsiyonel kalite
bayrağı eklendi; eski sürüm projeleri okunur. Ses cache protokolü v7 oldu:
eski kalite kanıtıyla yeni denetimler atlanmasın diye ilk üretim yeniden
yapılabilir. Önceki cache silinmez. Konservatif dil/ASR kontrolleri yanlış
pozitif üretebilir; otomatik metin silme veya sessiz kalite garantisi yoktur.
Ana checkout güncellenmedi, master'a merge edilmedi. PR önceki teslimleri de taşır.
