# Rapor 600 — Referans medya, ses metni ve kalite raporu bütünlüğü

## Başlangıç ve kapsam

Başlangıç master 9b5065c331b404633ba38203b1e85384128a1aab; dal codex/product-focus600. Ürün commit de7aa3a5847965b7c9b7f04836fb6667f767e42a. 30 görev, kabul/sonuç tablosuyla [PRODUCT_30_2026-10-26.md](PRODUCT_30_2026-10-26.md) içinde. 25 değişen kabul maddesi ve 5 mevcut/entegrasyon kontrolü; 30 bağımsız bug değildir.

## Gerçek kökler ve uygulama

- `browser-reference-media.js`: abort/timeout/boyut/tüketici hatasında kill sinyali ardından Promise hemen bitiyordu. Başlangıç modülüyle sentetik çocuk kapatılmadan `exitCode:null` iken iptal sonucu alındı. Ortak `terminateProcessTreeAndWait` kullanılır; kapanış beklenir, doğrulanamayan kapanış açık raporlanır. İş durdurulurken yeni PCM tüketilmez. stderr StringDecoder çok baytlı UTF-8 karakteri parçalı okumada korur. Süreç gerçekten kapanmazsa işletim sistemi engelini sihirli biçimde giderme garantisi verilmez.
- `dub_finish.py`: `$-5` → `$eksi beş`, `%-12,5` → `%eksi ...`, `a5$x` → `a5 dolarx` çıktı veriyordu. İşaretli para/yüzde okunur; kimlik içinde sembollü metin korunur. `SPOKEN_TEXT_VERSION=tr-spoken-v7-signed-symbols` ile eski telaffuz önbelleği yeniden kullanılmaz. Bu metin dönüşümü testidir; gerçek TTS telaffuz kalitesi bu turda ölçülmedi.
- Aynı ses modülünde NaN/geçersiz hız, stereo/NaN aktivite, negatif/NaN ofset açık reddedilir. Önceden NaN aktivite `[]`, negatif ofset `[-1,-0.9]` üretebiliyordu. Sonlu float32 büyük örneklerde RMS float64 hesaplanır; overflow=raise testleri geçti. Tam sessizlik hâlâ aktivite üretmez; normal nefes/dinamik korunur. Bu korumalar normal model çıktısının klinik/semantik kalite ölçümü değildir.
- `book-text-preparation.js`: yumuşak tire + LF/CRLF atlanıyordu; artık önizlenebilir. Tek küçük harfli parçalar da seçilerek birleştirilebilir. Özel ad/kısaltma/paragraf sınırı otomatik değiştirilmez; hiçbir öneri varsayılan seçili değildir. Kaynak dosya değişmez; mevcut taslak kaydetme/geri alma devam eder.
- `subtitle-pair-quality.js`: iki boş dizi `pass:true` veriyordu; artık en az bir geçerli kaynak/hedef cue gerekir. Ters/NaN/eksik cue yapısı açık invalidSource/invalidTarget listesi ve engelleyici sayaca girer; sessiz başarıya dönüşmez. Büyük birleşmiş grupta Math.min/max spread başlangıçta 140.000 satırla RangeError verdi; reduce ile düzeltildi. Aynı zaman damgalı kovalar Array.shift yerine imleç kullanır; kaynak sırası/artan hedefler 20.000 satırla korundu. Yapısal metriklerin geçerli cue sayıları üzerinden hesaplandığı ve geçersizlerin ayrı listede olduğu API tanısıdır.
- `assistant-thread-store.js`: false/boş dizge/boş dizi Number ile zaman 0 oluyor; ters zaman sıfır süreye kırpılıyordu. Bunlar artık kanıt/seek eylemine girmez. Eski sayısal dizgeler ve baslangic/bitis adları korunur. Şema sürümü/bağımlılık değişmedi.

## Doğrulama

- `node --test tests/product-focus600.test.js tests/browser-reference-media.test.js tests/process-lifecycle.test.js tests/assistant-threads.test.js tests/book-text-preparation.test.js tests/subtitle-pair-quality.test.js tests/focus598-contracts.test.js` geçti (runner 30 sonuç; görev sayısıyla aynı olması tesadüf, bağımsız bug sayısı değildir). Gerçek FFmpeg üç saniyelik sentetik klip:100 dalga noktası, iki ton ve sessizlik,583baytJPEG; gerçek host parent/grandchild iptali de mevcut süreç testinde geçti.
- `tests/test_dub_finish.py`:23; `test_dub_generation_quality.py`:19; `test_dub_plan_regressions.py`:12 geçti. Üretim hatası/stall logları beklenen test fixture çıktısıdır.
- `node tests/package-integrity.test.js`:9 kontrol; docs-index-integrity geçti. Değişen dört kaynak JS node --check, Python py_compile ve git diff --check geçti.
- `electron.cmd tests/electron-product600.smoke.js --disable-gpu`:gerçek Windows Electron geçti. Kanıt `.uiprev/product600-1793010024198/`:Türkçe koyu1200×900 ve İngilizce açık760×900 görüntüleri açılıp incelendi;2öneri, varsayılan değişiklik yok, seçili birleştirme, geri alma ve yatay taşmama doğrulandı. Ekranlar Git'e konulmadı; yalnız sentetik içerik ve ayrı test profili.
- Başlangıç karşılaştırması `tmp/baseline600.cjs` / `tmp/baseline600.json` yerel kanıtı:boş rapor başarılı; büyük grup RangeError; soft-newline0öneri; bozuk kanıt0/1zamanına çevriliyor; kapanış öncesi iptal bitiyordu. İlk sandbox çağrısı git alt sürecinde EPERM verdi; yetkili tekrar geçti. EPERM ürün hatası sayılmadı.

Tam npm test, uzun CI, gerçek GPU/model/sağlayıcı, canlı siteler ve temiz start.bat/kurulum koşulmadı. Yeni bağımlılık yok. Windows yol/Türkçe/CRLF ve gerçek Electron/ffmpeg sınandı; temiz kurulum/GPU doğrulaması yerine geçmez. Ana kişisel manifest/INDEX satırı/untracked dosyaları teslim dışında korunur.
