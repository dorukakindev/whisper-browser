# Rapor 643 — Uzun kitap bölümü ve sınırlı inceleme arayüzü

Başlangıç `008b4eed7c56d6a0d34a6774d00a597d23f375e7`; ürün `aef0b2b92e82c8471da10cdad9bc8f68aa6a05d0`. Bu paket tek uçtan uca uzun-bölüm iyileştirmesidir; alt sınırlar ayrı bug sayısını doldurmak için kullanılmaz.

## Doğrulanan uyumsuzluk

Kitap içe alma/düzenleme 900.000 karaktere kadar metin kabul ederken `chapterSrt` 1.000 parçadan sonra reddediyordu. 898.960 karakterlik yapay Türkçe bölüm içe alındı, fakat gerçek `book-plan-source` eski kodda `Chapter is empty or too large` verdi. Yalnız bu sınırı yükseltmek yeterli değil: mevcut ses denemesi sidecar'ı 1.000 grup/1MB ile sınırlıydı; büyük yeniden üretim listesi Windows argv sınırını aşabiliyordu.

## Tamamlanan değişiklikler

- Kitap SRT planı mevcut ortak 5.000 grup sınırıyla uyumlu. Kısa bölümün160karakterlik cümle biriktirme davranışı korunur;700.000karakter üzerindeki bölümlerde220karakter hedeflenerek daha dolu cümleler oluşturulur, kelime başına280karakter eşiği korunur. Hiçbir sözcük sırf sınır için atılmaz.
- Kaynak SRT byte sınırı Node ve Python'da birlikte4MB; aşan girdi gruplama öncesi reddedilmeye devam eder. Kitap projesinin6MB toplam sınırı ve diğer medya/süre sınırları kaldırılmadı;900.000karakter her içerik için sınırsız üretim vaadi değildir.
- Ses denemesi metadata'sı5.000grup/6MB ile aynı sınırlı kitap kapsamını destekler. Mevcut eski denemeler okunur; şema version1 korunur.
- Tüm bölüm yenilemesi narration-only `forceAll` / `--force-all` ile backend'in güncel seçilmiş planında çözülür. Yeni acoustical seed korunur; aralık dışı grup zorlanmaz. Tek grup onarımı değişmedi.
- Büyük kısmi yeniden üretim seçimleri, yalnız narration'da5.000grup/100.000karakter sınırıyla özel inputJSON dosyasına yazılır; argv'de liste yerine dosya yolu taşınır. Python150KB okumayla, tür/regex/grup sayısı/toplam boyut ve güncel plan kimlikleriyle doğrular. Inline/file/all çakışmaları reddedilir. Video için tek-grup kuralı korunur.
- İnceleme listesi sayfa başına25satır çizer. Önceki/sonraki, doğrudan sayfa numarası, toplam aralık ve devre dışı düğme görünümü vardır. Konum aynı bölüm/ses kimliğinde korunur; sayfa değişimi eski dinleme isteğini durdurur. EN/TR ve mevcut tema token'ları kullanılır.

## Gerçek kanıtlar

- `book-large-chapter643.test.js`: gerçek servis + gerçek model-free Python planı;898.960karakter,1.183.431byte SRT,3.526grup,16.522karakter inline force listesi. Bütün plan metni özgün metne eşit; kontrollü WAV/quality ile tam capture ve deneme kaydı okunuyor. Bu sentetik ready raporu işitsel kalite kanıtı değildir.
- `test_dub_regeneration643.py`2/2:4.000exact key dosyası, bozuk/büyük/çakışan seçimler ve actual CLI/main plan fonksiyonunda aralık sonrası force-all seçimi/yeni seed. Haricî motor bootstrap'ı AST ile dışarıda bırakılır; üretim fonksiyonunun gerçek plan yolu çalışır.
-19hedefli Node girdisi geçti: büyük bölüm, kitap yenileme, dub-service, takes, media-workflows, production-plan, eski iş sahibi ve package-integrity. Paket manifesti tüm siblingPython dosyalarını taradığından yeni `dub_regeneration.py` dahil edilir.
- Python plan12/12, source-boundary3/3, generation-quality20/20 geçti. Eski2MB test sabiti önce kırmızıydı; assertion silinmedi, yeni kanonik limit+1 girdisine taşındı. Diğer erken test engeli, gerçek motor bootstrap gerektiren test import'uydu; model-free actual fonksiyon harness'ına çevrildi.
- Native Windows exit0 `.uiprev/book-quality636/1793090487733-10472`:101review grubu,25mounted satır,101.satır erişilebilir; ENdark1280×900/TRlight800×760 görüntüleri incelendi. İlk native denemeler eski DOM'u render tamamlanmadan sayıyordu; yeni DOM'un tamamlanmasını bekleyen kabul koşuluyla düzeltildi, ürün bugı sayılmadı.
- Son değişikliklerden sonra büyük/service/regenerate4girdi + native tekrar geçti. JSsyntax/Pythoncompile/diff temiz.

Gerçek uzun WAV/GPU/model üretimi, işitsel tercih, canlı YouTube veya normal start.bat açılışı yapılmadı. Yeni bağımlılık yok. Kişisel açık uygulama kapatılmadı; ana kopya güncellemesi sonraki normal açılışta yüklenir. Uzun CI beklenmez.1000planındaki büyük-bölüm maddeleri bu kanıta rağmen çok-bölümlü gerçek kaynak ölçümü tamamlanmadığı için kısmi tutulur.
