# Rapor758 — Gerçek PDF/asistan model zinciri ve hazırlık bağlam geçişi

## Doğrulanmış hata

Gerçek Windows renderer + iki sayfalı sentetik PDF + DeepSeek V4.1 standard ile asistan üzerinden onaylanan `prepare_book_narration` doğru tek sayfalık projeyi açıyordu. Ancak openProject içinde yeni bölüm bağlamı yayınlandığında assistant-agent-ui kendi başlattığı geçişi dış kaynak değişimi sanıp devam eden apply işlemini iptal ediyordu. Sonuç mevcutken panelde “Asistan işlemi iptal edildi” yazıyordu. [Önce](evidence758/before-false-cancellation.png). Bu R690 doğrudan araç testinin yakalayamadığı gerçek onay/olay entegrasyonudur; yeni bağımsız bug olarak tek kök sayılır.

## Onarım ve dosyalar

- src/renderer/assistant-agent-ui.js: yalnız uygulanan işin aynı başlangıç sahibinden, açıkça hazırlanan projeID:bölüm hedefine tek seferlik geçiş. Hedef farklıysa, eski sahip geçersizse veya kullanıcı iptal ettiyse koruma kalkmaz; geçiş izni finally temizlenir.
- src/renderer/assistant-book-actions.js ve book-assistant-ui.js: işlem sahibini hazırlık callback'ine taşır.
- src/renderer/pdf-reader-experience.js: yalnız asistan hazırlığında son openProject çağrısını bu sınırlı geçişle açar; normal kullanıcı hazırlığı aynı kalır.
- tests/assistant-book-handoff758.test.js: doğru hedef, başka kaynak, açık iptal, tek kullanımdan sonraki kaynak değişimi için dört davranış kontrolü.
- tools/assistant-book-live.cjs: açık --live-deepseek izni isteyen ayrı Windows profilli gerçek PDF/model/onay test aracı; --prepare-only yalnız hazırlık vakasını koşturur. Güvenli anahtar broker'ı bellekte kullanılır, tek izinli API hedefi, standard katman, 16istek tavanı, istek60sn/toplam240sn. Sentetik PDF/ayarlar; kişisel profil salt okunur anahtar kaynağıdır. Ses üretimi handler'ları test korumasıyla sayılır/reddedilir; finalde0istek.

## Gerçek kanıt

[Canlı tam koşu](evidence758/live-full.json):6HTTP; sayfa1 ORION-412/mavi, sayfa2 LYRA-709/amber; eski sayfa kodu ikinci yanıtta yok. Onay sonrası yalnız sayfa2 metni/1bölüm/selected[1], motor busy=false, yanlış iptal yok. Son küçük sahiplik guard sertleştirmesinden sonra [final hazırlık](evidence758/live-final-preparation.json):3HTTP,0ses üretim isteği, doğru tek sayfa ve terminal sonrası hata alanı boş. [Son panel](evidence758/after-preparation-assistant.png), [gerçek üretim alanı](evidence758/prepared-page2.png) görüntüleri incelendi. Bölüm bağlamı değişince sohbetin yeni kaynağa geçmesi tasarımla uyumludur; eski kaynağa ait otomatik devam açılmaz.

Node assistant-book-handoff758 + assistant-book-actions + assistant-resilience-ui:11PASS. Mevcut electron-assistant-books smoke gerçek PDF/renderer ve kontrollü motor kabulü exit0, kaynak sayfa2/1bölüm; bu koşudaki2start kontrollüdür, gerçek ses değildir. BeşJS syntax ve git diff --check PASS. GPU ve ses kalitesi/start.bat kişisel açılışı/tüm PDFler/tüm asistan eylemleri doğrulanmadı. Mevcut11 before-quit listener uyarısı sürüyor; test ağı diğer hedeflere kapalı. Tam test/uzun CI beklenmedi.

İlk araç koşusu panel snapshot'ı oturmadan gönderdiği için yanıt göremedi; hazır panel beklemesi eklendi, ürün bugı sayılmadı. Sonraki koşu geçişten sonra eski kartın DOM'da kalmasını yanlış bekledi; kaydedilmiş gerçek proje ve terminal sonrası hata alanı doğrulamasına taşındı. Bir canlı koşu sağlayıcı fetch failed ile kesildi; başarı sayılmadı. Önceki gevşek hazırlık gözlemi terminalden önce boş hata alanı görmüştü; final test terminali bekler. Hatalı denemeler başarıya gizlenmedi.

## Kaynak ve kapsam

[DeepInfra resmî tool-calling belgesi](https://docs.deepinfra.com/chat/tool-calling) ve [kaynak örneği](https://github.com/deepinfra/docs/blob/main/chat/tool-calling.mdx) incelendi: araç seçimi ile uygulamanın gerçek yürütme/sonuç turunu ayrı doğrulamak gerekir. Dış kod kopyalanmadı, bağımlılık eklenmedi. Mevcut üretim yolları korundu. P063/P067/P071/P079/P080 kapsamı bu sentetik gerçek entegrasyonla ilerler;90aktif hedefin tümü tamamlanmadı, müzik işi eklenmedi.

Başlangıç master7de8b98946246b671e22accaca0c79af3d30c8be; ürün/test bitişi db59d7fdd5dfd14f38f2c40bdf6ee448e442f2e5. Anahtar/kişisel kitap/log yok. Kod ve belgeler ayrı commit; ana kopya kullanıcı dosyaları korunarak normal PR/master teslimi yapılır.
