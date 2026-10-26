# Rapor 612 — TASK-03 kitap/PDF/EPUB denetimi ve onarımlar

26 Ekim 2026. Repo: https://github.com/dorukakindev/whisper-browser. Dal: `codex/book-audit612`.
Başlangıç: `363e6c98db8555fbf361b4f32e46abbdfa65f240`.
Bitiş ürün: `c88abc5a0b894c0091b1adf50beaf6211792dbbc`.

## Paket güveni ve doğrulama

Kullanıcının `TASK-03-96b204f1-AUDIT.zip` paketi: SHA256 `b8391b228f48672c2eb99ce19a11fdde1a9e4ca43e243407c2f42a80455308d7`, 170 dosya, açılmış toplam 2.317.261 bayt. Göreli yollar ve boyut sınırları kontrol edilerek Git dışına açıldı. Paket kaynak tabanı `96b204f12dbf300edcc65756a6207ce5eca9d703`; bu teslim güncel master üzerinden yapıldı. Paket önerileri talimat olarak körlemesine uygulanmadı.

Eski rapor Linux/Chromium ve PDF.js 5.6.205 ile çalışmış. Burada Windows, kurulu kilitli PDF.js **6.3.289**, gerçek ürün işleyicileri ve gerçek ffmpeg/ffprobe kullanıldı. `p01`, `p03`, `p04`, `p04b`, `p06` probe'ları önce/sonra çalıştı. Yalnız probe harness'inin `/usr/bin` araç yolları Windows araç yollarına uyarlandı. Eksik PDF fixture üretim yardımcıları (pdf-lib/sharp) mevcut resmî Codex runtime paketlerinden NODE_PATH ile alındı; ürün bağımlılığı/kilit dosyası değiştirilmedi. Testlerde yalnız sentetik kitap/ses ve ayrı profil kullanıldı.

## 13 kök için karar ve değişiklik

| Kimlik | Doğrulama ve onarım |
|---|---|
| T3-01 Dar sütunlar karışıyor | Gerçek PDF.js ile 12/18/24/36pt aralıklarda yeniden üretildi. Satırların çoğundaki ortak dikey boşluklardan dar sınır öğrenilir; adaylar sıralı kümelenir, her aday için tüm adayları tarayan karesel algoritma kullanılmaz. 12–72pt × row/column akışı: **12/12 doğru**. Tek sütun negatif kontrolü ve mevcut tablo/başlık sırası testleri geçti. Karmaşık her dergi düzeni için evrensel doğru sıra garantisi değildir. |
| T3-02 Okuyucu üst/alt bilgiyi okuyor | Eski okuyucu tek sayfa yolluyordu, kütüphane tüm sayfaları. Okuyucu artık geçerli sayfaya en fazla iki komşu sayfayı ekler, yalnız istenen sayfanın bloklarını saklar. Gerçek renderer fonksiyonu + gerçek main hazırlama fonksiyonu + gerçek PDF modülleriyle test: Running header/Confidential draft çıkarıldı, Body page 2 korundu. Tek sayfada komşu yoktur; okunamayan komşuda mevcut görünür layout uyarısı korunur. |
| T3-03 Tireler kayboluyor | 19902000, COVID19 ve NorthSouth yeniden üretildi. Sayı/büyük harfli parçalar ve well-/self-/e- örneklerinde tire korunur; soft hyphen ve inter-/national, co-/operate birleşimleri korunur. Gerçek dosya zincirindeki kontrol örnekleri geçti. Tüm sözlükteki tireli birleşik sözcükleri otomatik ayırt eden dil modeli değildir. |
| T3-04 EPUB head/title sesleniyor | Başlık/body farkı ve boş bölüm yeniden üretildi. Prose ayrıştırıcı head/title/script/style/noscript ve navigation içeriğini dışarıda tutar; boş gövde bölüm oluşturmaz. Başlık dahil EPUB ve title'sız kontrol aynı gövdeyi üretir. |
| T3-05 EPUB bloklar yapışıyor | Cell ACell B ve harbour.1 yeniden üretildi. td/th/tr, blockquote, h4–h6, dt/dd/figcaption/aside blokları ayrılır; noteref işaretinin 1 rakamı anlatıma yapışmaz. Navigation içeriği okunmaz. **Dipnot gövdesi bilinçli olarak korunur** ve ayrı paragraftır; isteğe bağlı dipnot atlama yeni bir ürün özelliği önerisidir, burada içerik sessizce silinmedi. |
| T3-06 İçe alınan uzun bölüm düzenlenemiyor | 150.601 karakterli E07 import/plan/save/prepare yolu doğrulandı; editör, metin hazırlama ve plan/save sınırları mevcut toplam metin limiti olan 900.000 ile uyumlu. Gerçek 160k metinde save+plan geçti. **Asistanın 100k tam bölüm özeti sınırı değiştirilmedi:** seçili pasajı öneren açık bütçe sınırıdır. SRT'nin mevcut 1000 parça ve proje 6MB sınırları da korunur. |
| T3-07 Bozuk/çok büyük proje bütün içe aktarmayı engelliyor | Yeniden üretildi. reuseBook her bozuk projeyi ayrı atlar. Merkezi save, JSON UTF-8 bayt boyutunu atomik yazımdan önce 6MB ile sınırlar; böylece sonradan load edilemeyecek dosya yazılmaz. Oversize save reddinde önceki dosya baytları aynı ve book-open başarılı. Eski bozuk projeleri otomatik silme/onarma yok. |
| T3-08 Kitap araması eksik | İngilizce It/Inside ve 100.000 sonrası eksiklik yeniden üretildi. I/İ/ı/i eşleşmesi ortak katlanır; tüm bölüm taranır, özgün UTF-16 seçim ofsetleri korunur. 1000 bölüm üst sınırı truncation olarak bildirilir. Uzun bölüm kuyruğundaki needle ve İngilizce/Türkçe I örnekleri bulundu. |
| T3-09 Arşiv kitap kapasitesini tüketiyor | Yeniden üretildi. 100 sınırı yalnız yüklenebilir aktif projeler içindir; arşivlenmişler kapasiteyi tüketmez. book-list'teki 100 sınırı arşiv filtresinden sonraya taşındı. Bozuk kayıt + 100 arşiv projesi varken yeni kitap oluşturuldu. Kalıcı silme eklenmedi; kullanıcı dosyası silinmedi. |
| T3-10 Taşınmış kaynakta ham ENOENT | Yeniden üretildi. book-source kayıp/erişilemeyen kaynak yolunda mevcut iki dilli “Source book is unavailable / Kaynak kitap kullanılamıyor” hatasını döndürür; E06 geçti. |
| T3-11 Bayat activeJob kalıyor | Yeniden üretildi. Metin değiştiği için capture/recover çıktıyı reddettiğinde yalnız kendi activeJob işareti temizlenir; yeni bir işin işareti silinmez. İkinci recover aynı uyarıyı yinelemiyor. Bayat ses yeni metne bağlanmıyor. |
| T3-12 Onaylanan WAV değiştirilince export kabul ediyor | Gerçek yeniden üretim. Export, manuel onayın textHash/audioHash değerlerini yeniden doğrular; digest içeren yönetilen dosya adının ses hash'i de kontrol edilir. Değiştirilmiş WAV encode başlamadan reddedilir. Doğru üç bölümlük gerçek M4B: 3.833sn, sıralı chapter metadata ve Türkçe başlık korunur. |
| T3-13 quality=null inceleme çıkmazı | Yeniden üretildi. RIFF/WAV chunk başlıklarını sınırlı okuyarak gerçek süre bulunur; otomatik başarı verilmez. Tüm bölüm için bir oynatılabilir **review** grubu sunulur. Kullanıcı dinleyip açıkça onaylayabilir veya yeniden üretebilir. UI'da doğrulamanın eksik olduğu belirtilir. Ses denemeleri arasında geçişte bu işaret kendi take'iyle saklanır. |

## Değişen dosyalar

- `src/pdf-translate.js`: dar sütun boşluk kümeleri ve korumacı satır-sonu tire işleme.
- `src/renderer/renderer-helpers.js`: okuyucuya en çok 3 sayfalık kenar metni bağlamı, yalnız istenen sayfa sonucunu saklama.
- `backend/media_shelf.py`: yapılandırılmış EPUB gövde ayrıştırma, başlık/nav/noteref temizliği, geniş blok sınırları.
- `src/book-text-search.js`: ortak I katlama ve tam bölüm araması.
- `src/book-text-preparation.js`, `src/renderer/media-workflows-ui.js`: 900k metin düzenleme/hazırlama ve eksik doğrulama açıklaması.
- `src/media-workflows.js`: bozuk proje izolasyonu, save boyut sınırı, aktif kapasite, bayat iş temizliği, kaynak hata metni, export digest ve inceleme grubu.
- `src/wav-duration.js`: dosyanın tümünü belleğe almadan en fazla 128 RIFF chunk başlığından PCM/float WAV süresi. Eksik/bozuk dosya onaylı sayılmaz.
- `src/book-voice-takes.js`: qualityMissing işareti take ile taşınır; başka ses seçilince eski uyarı kalmaz.
- `tests/book-audit612.test.js`, `tests/pdf-audit612.test.js`, `backend/test_epub_audit612.py`, `tests/fixtures/pdf-column612.json`: gerçek ürün yollarına odaklı kalıcı regresyonlar; geometri fixture'ı sentetik PDF'nin gerçek PDF.js çıktısıdır.
- `tests/reader-pdf-lifecycle.test.js`: sahte dialog'a gerçek DOM querySelector sözleşmesi eklenir.
- `tests/pdf-ocr-capability.test.js`: araya eklenmiş layoutWarning alanı ocr kaydını yok saymaz.
- `tests/electron-book-reliability.smoke.js`: HTML search input'a newline doğrudan atanınca tarayıcı newline'ı boşluksuz sildiğinden eski fixture sorgusu oluşmuyordu. Sorgu boşlukları normalize edildi, seçimin özgün metin ofsetleri korunarak karşılaştırıldı. Test silinmedi, eşik gevşetilmedi.

## Kontroller ve açık sınırlar

- 12 mevcut hedefli test dosyası geçti: pdf-reading-order, media-workflows, book-reliability, book-export, book-export-inputs, book-production-plan, book-text-preparation, book-import-metadata, book-voice-takes, book-text-search, reader-pdf-lifecycle, pdf-ocr-capability.
- Yeni book-audit612 (3), pdf-audit612 (2), EPUB audit (2); mevcut Python shelf (7) ve voice-takes-unit geçti. Değişen JS node --check ve Python py_compile geçti. book-export ayrıca gerçek Windows ffmpeg iptali, örnekleme hızı değişimi, chapter ve metadata kontrollerini geçti.
- Eski paketin E03 kimlik iddiası kendi ekinde TEST_ARTIFACT olarak düzeltilmişti; burada p04b'nin spine tabanlı negatif kontrolü esas alındı ve geçti. E02'nin dipnot gövdesi okunuyor diye FINDING etiketi hâlâ çıkabilir; nav artık yok, dipnot ayrı tutulur ve varsayılan korunması bilinçlidir. Eski p02 tek-sayfa çağrısı güncel renderer'ın yeni komşu sayfa çağrısını temsil etmez; gerçek renderer/main zinciri kalıcı testle doğrulandı.
- **Geniş Windows smoke tamamen yeşil değil.** İlk koşu newline sorgu fixture'ında durdu; bu düzeltildi. İkinci koşu kitap araması, review/onay, M4B ve PDF ses vurgusu adımlarını geçti; sonra `auditNarrow` içinde `Timed out zoom layout settled` ile durdu. Bu ekranın tüm zoom/scroll/EPUB uçtan uca kabulü yapılmış sayılmıyor. Bu bekleme/yerleşim ayrımı sonraki bağımsız inceleme olarak açık; eşik gevşetilmedi.
- Yeni davranış için ayrı kısa gerçek Windows Electron denemesi geçti: quality=null çıktı, 1 review grubu, Türkçe açıklama, “Grubu dinle” ile **audio.duration=1**, dinledim/onayla düğmesi, editör maxLength900000 ve yatay taşma false. Render görüntüsü incelendi; Git dışında.
- Uzun CI/tam npm test beklenmedi; testler kapatılmadı. Gerçek VoxCPM/Whisper/GPU/CUDA/DRM ve ücretli API denenmedi. Normal kişisel start.bat oturumu kapatılmadı ve yeniden başlatılmadı. start/install/bağımlılık kilidi değişmedi; çalışma zamanı kurulumu eklenmedi.
- Tasarım incelemesindeki %150 dar pencere araç çubuğu iyileştirmesi, dipnot/başlık atlama ayarı, bozuk projeleri yönetim satırında gösterme ve başka kitaptaki üretim sürerken düzenleme izinlerini daraltma **öneridir**; bu onarım paketinde yeni özellik olarak uygulanmadı. Kullanıcının önceki “yedek/kurtarma paketini genişletme” tercihi korundu.

Kişisel OFFLINE-MANIFEST, INDEX516 ve izlenmeyen kullanıcı dosyaları commit/push dışında korunur. Önceki çeviri/asistan ve YouTube onarımları başlangıç master'ında; tekrar uygulanmadı. Kaynak kitaplar ve kişisel sesler değiştirilmedi. PR ve kesin ana kopya teyidi devir notunda tamamlanır.
