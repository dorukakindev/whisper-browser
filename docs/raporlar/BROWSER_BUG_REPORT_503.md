# Rapor503 — Akıcı ses için kalite odaklı varsayılanlar

Kullanıcı başlangıç ayarlarının kaliteli ve bütünlüklü okumaya ayarlanmasını istedi.
Bu çalışma yeni bir model kalitesi iddiası veya 20 hata teslimi değildir.

Browser servisinde, renderer fallback ve HTML ilk seçiminde doğrulama detailed yapıldı.
Böylece yeni/eksik ayarlı profilde tüm konuşma grupları metin denetimine girer.
Mevcut kayıtlı balanced/fast tercihleri korunur. Ayrıntılı kontrol profili ile aynı
ayar kümesi açılır; kullanıcı isterse Dengeli/Hızlı seçebilir. Denetleyici kurulu
olmadığında mevcut uyarı davranışı geçerlidir; kalite garantisi verilmez.

Korunan öneriler: quality15, concurrency4, akici gruplama, video yavaşlatma,
naturalSpeech/autoFit açık. Metin stüdyosu 600 karakter, 15 adım, CFG1.65,
temperature0.8, durak1, normalize/polish açık kalır. 900 karakter her metinde
üstün olduğu kanıtlanmadığından zorunlu varsayılan yapılmadı. Görsel satırlar
konuşma parçası değildir; paragraf/süre/konuşmacı sınırları korunur.

Doğrulama: node tests/dub-generator-ui.test.js geçti (yeni ilk seçim
assertleri ve eski preset/range testleri); backend/test_text_studio.py 1 test,
backend/test_dub_flowing_groups.py 3 test geçti. İki JS node --check ve diff
kontrolü geçti. audit-ui --strict --surface voice-studio --widths1200 dört
TR/EN açık/koyu görünüm: 0 kontrast, 0 script hatası; koyu TR görseli incelendi.
İlk sandbox audit koşusu çıktı vermedi; yükseltilmiş ayrı test koşusu tamamlandı.
GPU/TTS dinleme, gerçek YouTube, start.bat ve tam npm paketi çalıştırılmadı.
Yeni CI beklenmedi. Önceki PR Ubuntu CI başarısızlığı bu turda incelenmedi.
