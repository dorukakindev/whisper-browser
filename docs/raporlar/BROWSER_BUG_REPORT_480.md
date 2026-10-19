# BROWSER_BUG_REPORT_480 — Not kurtarma, PDF ve manga

2026-10-19. Dal: `codex/browser-audit477`, PR454.
Başlangıç HEAD: `4a3a5730100969073257d96170f3ea129375f4c6`.
Başlangıç ürün kodu: `e21de8ac7bb16210ca4eddbf18c6e2754e7f0b30`.
Bitiş ürün kodu: `5e09ac362d2fee394a21968b804b410faa41ed6a`.

Önceki bulgular tekrar sayılmadı. Yeni davranış testi ürün kodu değişmeden
10 FAIL, düzeltmeden sonra 10 PASS verdi. Kontrollü ve kişisel olmayan
örnekler kullanıldı; gerçek profil üzerinde hata yaşandığı varsayılmıyor.

| No | Önem | Kök neden, kanıt ve düzeltme |
|---|---|---|
| 480-01 | Orta | Not dosyası annotations dizisinde null varsa normalizeStoredAnnotation mediaId okurken çöküyor, sağlam notlar da açılamıyordu. Nesne olmayan satırlar eleniyor; importMissing de aynı korumayı kullanıyor. |
| 480-02 | Orta | Not deposunun list/get/upsert/search/filter ve snapshot sonuçları nested tags/links/anchor verilerini canlı nesnelerle paylaşıyordu; tüketicinin değişikliği flush olmadan iç durumu değiştiriyordu. Dışarı dönen notlar derin kopya. Önceki kapalı-sekme snapshot sorunu değil, ayrı not deposu API'si. |
| 480-03 | Orta | object-position:top veya left tek belirteci eksik eksende center yerine tekrar kullanılıyor; top right ters eksene uygulanıyordu. Tek/iki anahtar sözcükte CSS eksenleri ve eksik center doğru çözülüyor. Üç/dört belirteçli offset sözdizimi bu turun kapsamı değil. |
| 480-04 | Orta | matrix3d içindeki perspektif katsayıları görmezden gelinip axis-aligned supported sayılıyordu. v3/v7/v11 perspektifi veya v15 homojen katsayı sapması varsa arbitrary dönülerek yanlış manga katmanı gizleniyor. |
| 480-05 | Orta | PDF satırı tireyle bitince columnChanged/kindChanged/tableBoundary koşulları bile geçersiz kalıyor, başka sütun veya tablo hücresiyle birleşiyordu. Yapısal sınırlar her zaman ayırıyor; aynı gövdedeki dehyphenation korunuyor. |
| 480-06 | Orta | textAnchorRestoreScript template'inin bazı regex'lerinde tek ters eğik çizgi string üretiminde kaybolup /s+/ oluyordu. Birden çok boşluklu konumsal alıntı, aynı metnin başka kopyasıyla ambiguous sayılabiliyordu. Üretilen script whitespace regex'leri doğru escape ediliyor. JSDOM gerçek script'i çalıştırarak ilk paragrafı doğruluyor. |
| 480-07 | Orta | Aynı PDF block id'si farklı kaynak metinle geldiğinde eski userText yeni metne de taşınıyordu. Kullanıcı düzeltmesi yalnız id ve normalize kaynak metni birlikte eşleşirse korunuyor. Aynı kaynak yeniden çevrilince düzeltme korunmaya devam ediyor. |
| 480-08 | Orta | PDF recordPage geçerli blok + null sonucunda null'u sessizce düşürüp sayfayı tamamlanmış sayabiliyordu. Bozuk blok kısmi kayıt yerine açık hata veriyor. Meşru boş metinli ayraç nesneleri mevcut sözleşme gereği hâlâ atlanabilir; tamamı boş/geçersiz sonuç reddedilir. |
| 480-09 | Orta | Manga kutusunda null/false/boş dizge Number ile sıfır sayılıyor, eksik model koordinatı sayfanın üstüne yapay kutu üretiyordu. Yalnız sayı veya boş olmayan sayısal dizge kabul ediliyor; gerçek 0 korunuyor. Seyrek dizilerin boş elemanları da eleniyor. |
| 480-10 | Orta | PDF hash fonksiyonu açıkça verilen kısa kuyruk örneğini kabul edip eksik veriyle kalıcı kimlik üretiyordu. Verilmiş tail uzunluğu/türü doğrulanıyor. Eski iki argümanlı başlık-only çağrı geriye uyum için korunuyor; uygulamanın tail gönderen yolu eksik okumayı reddediyor. |

## Doğrulama

`node tests/report480-regressions.test.js`: önce 0/10, sonra 10/10.
Ayrıca browser-note-store (11), manga-geometry (105), pdf-partial-retry (8),
pdf-translate, pdf-manga-36-40 (18), manga-ocr-hardening (65),
pdf-reading-order ve export-closure-deadzone geçti.

İlk pdf-translate koşusu boş ayraç sözleşmesi nedeniyle kırmızıydı. Ürün
kontrolü boş ayraç nesnesini bozuk null sonuçtan ayıracak şekilde düzeltildi;
test silinmedi/gevşetilmedi ve aynı komut yeşil geçti. Yeni script testi
JSDOM ile terminalden çalıştı; gerçek Electron görsel doğrulaması değildir.
Değişen JS dosyalarında node --check ve git diff --check geçti.

Tam npm test, start.bat/GUI/DPI, canlı site/model/GPU/OCR ve gerçek PDF/manga
üretimi yapılmadı. Yeni bağımlılık/kurulum/şema/CSS değişikliği yok. Mevcut
jsdom kullanıldı. Kişisel dosyalar, ana checkout ve açık uygulama korunuyor.
Windows CI yeni kullanıcı talimatı gereği teslimde ayrıca kontrol edilir;
sonuç görülmeden CI geçti iddiası yok. PR otomatik merge edilmez.
