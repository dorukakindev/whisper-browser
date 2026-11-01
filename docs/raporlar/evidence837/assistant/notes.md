# R837 asistan alt denetimi — yalnız rapor; 1 dar uyumluluk bugı + 8 öneri

HEAD: 9b3f9e462abaebfd1e3a321fcb72e9594b8c7533. Kaynak/test/ayar değiştirilmedi; yalnız ignored `.tmp/audit837-assistant/` yazıldı. AGENTS, YENI-BILGISAYAR, DEVIR güncel1325/1327, Night1000 README ve F01–F05/F07–F09 registry imzaları; R815 ilgili asistan başlıkları ve R818–836 başlık/içerikleri tekrar açısından incelendi. Bütün1000 senaryo tekrar koşulmadı.

## A837-B01 — Geçerli tek CR satır sonlu SSE cevabı başarısız asistan isteğine dönüşüyor (dar kapsam, P3)

Kaynak: `src/assistant-provider.js:48–56`, `src/assistant-agent-service.js:195–216`; gerçek producer→consumer: Response ReadableStream → gerçek provider.run/completion → gerçek register/assistant:agentRun sonucu. Birincil standart: https://html.spec.whatwg.org/multipage/server-sent-events.html#parsing-an-event-stream (`end-of-line = cr lf / cr / lf`, yorumlama bölümü de lone CR'yi açıkça kabul eder). Yeni protokol veya sağlayıcı davranışı uydurulmadı.

Tekrar: `node .tmp/audit837-assistant/probe.cjs`. Aynı exact JSON event ve `[DONE]` gövdesi yalnız satır ayraçları LF, CRLF veya CR olacak biçimde sunulur. Her gövde tek büyük parça ve birer baytlık parçalarla sınanır. Toplam: LF2/2 ve CRLF2/2 başarılı; CR2/2 başarısız. Altı beklenenassert çıkış0. Sonuç `result.json`.

Beklenen: Üç geçerli satır sonu aynı sentetik yanıtı üretmeli. Gözlenen: CR'de service `ok:false`, `Unexpected non-whitespace character after JSON at position 89 (line 3 column 1)` döndürüyor, diğerlerinde tam yanıt `ok:true`.

Kök: parser yalnız `buffer.indexOf('\n')` ile satır böler. CR gövdesi bitince birden fazla event tek JSON sanılır. Etki: Bu geçerli framing'i kullanan OpenAI uyumlu gateway/asistan bağlantısında yanıt okunamaz. Ana akım DeepInfra/DeepSeek'in bunu gönderdiği, kullanıcıda yaşandığı veya Windows start.bat hatası olduğu iddia edilmez; bu nedenle önem derecesi P3 ve ana rapor önemli-bug toplamına alınması ana ajanın takdiridir. Gerçek ücretli sağlayıcı/site/model kullanılmadı; fetch ve sender/IPC façade sentetiktir, üretim provider/service aynıdır.

Dedup: R815-B78 Content-Type büyük/küçük harf ayrımıydı; burada MIME aynı ve normalleştirilmiş. R815-G32 protokol tanısının genel standart satır sonu kabul önerisiydi, bu somut CR davranışı bug olarak doğrulanmamıştı. SSE aynıisimfragment adayı daha önce çürütüldü, tekrar sayılmadı. F835-01/02 atıf kayıpları ve R830 W regresyonu yeniden keşif sayılmadı.

Geçici çözüm: Uyumluluk gateway'inde LF/CRLF üretmek veya JSON non-stream response kullanmak. Kabul: CR/LF/CRLF; CRLF'nin iki ağ parçasına ayrılması; Unicode çokbayt bölünmesi; çok event; incomplete-stream hatası ve parser boyut/iptal sınırları korunmalı. Düzeltme uygulanmadı.

## Buglardan ayrı 8 geliştirme önerisi

### A837-G01 — Uzun iş tamamlandığında güvenli devam fırsatı
Mevcut `assistant-flows.js:record/resume` ve `assistant-agent-ui.js:apply/flowInfo` continuationı kabul anından600000ms sonra siler. Saatler sürebilen Whisper/dublaj işinde kaynakta kalan kullanıcı yeniden soru kurar. Süreyi körlemesine uzatmak yerine job-owned checkpoint ve tamamlanma sonrası sınırlı yeni inceleme penceresi ekle. Kabul:15dk süren fixture işinde tamamlanmış stage tekrarlanmaz; job/source/thread değiştirilmişse devam red; restart sonrası eski mutation otomatik uygulanmaz. R826 başarısız stage retry ve G835 dayanıklı soru taslağı farklıdır. Mevcut expiry politikası yeni bug sayılmadı.

### A837-G02 — İstek başına ölçülmüş sağlayıcı bütçesi
Mevcut provider6round,2400max_tokens,2MB stream ve timeout sınırları var; token harcaması/usage toplanmıyor. Kullanıcıya isteğe bağlı toplam giriş/çıkış token bütçesi ve güvenli kesme eşiği sun; fiyat bilinmiyorsa para uydurma. Kabul: Kontrollü iki provider roundundaki usage birlikte sayılır; raporlanmayan usage tahmin diye ayrılır; budget sonrası yeni paid round başlamaz; mevcut metin korunur. Bu mevcut cevap makbuzuna model adını yazma G835-01 veya R815 otomatik altyazı karakter bütçesi değildir.

### A837-G03 — Uzun kitap araştırması için insanın yönettiği kapsam planı
Mevcut search_book40sayfalık batch, next ve truncatedPages döndürüyor; her soruda provider6round limiti var. Kullanıcının seçtiği bölüm/sayfa aralığının hangi parçalarının arandığını; başarısız/atlanmış batchleri ve kalan işi salt okunur araştırma checkpointinde birleştir. Kabul:200sayfanın3batchi aranınca120sayfa kapsandı,80kaldı; yeniden devam yalnız eksik batchler; kitap revizyonu değişirse eski kapsam ayrı; tümkitap okundu iddiası yok. Bu G835-01 tek yanıt makbuzu veya G835-02 sohbet metin araması değil, birden çok turu kapsayan sorgu planıdır.

### A837-G04 — Uygulanmamış kartı açıkça reddet ve yetkisini geri al
Mevcut service proposals Map TTL/başarılı adım invalidationı ve UI Apply/Refresh/Continue var; insanın belirli kartı açıkça reddettiğini main'e kaydeden endpoint görünmüyor. 'Bu öneriyi reddet' eylemi kartı main tarafında iptal etsin, konuşmada inert reddedildi kaydı bıraksın. Kabul:Native/managed diğer yüzeydeki aynı proposalId ile Apply artık red; başka kart/medya işi iptal edilmez; reddedilen kart otomatik tekrar sunulmaz, yeni açık istek yeni kimlik yaratabilir. Bu stop request veya job cancel özelliği değildir.

### A837-G05 — Bu soru için salt okuma ve araç alanı seçimi
Mevcut registry source-kind'e göre tool sunar, mutationlar zaten insan kart onaylıdır. Kullanıcı yalnız açıklama isterken soruya özel 'yalnız oku' veya 'yalnız kitap/altyazı' capability scope seçebilsin. Kabul:Policy main/provider seviyesinde tool tanımlarını ve dispatchi birlikte daraltır; model alan dışı mutation kartı üretemez; sonraki soruda açıkça değiştirilir; hiçbir yeni otomatik yetki verilmez. Kaynak bağlı mevcut onay kartları yeniden önerilmiyor, insanın öneri oluşum alanını daraltması ekleniyor.

### A837-G06 — Kaynak önizlemesinden alan bazlı gönderim seçimi
Mevcut sourceText allowlist/bütçe, kaynak scope ve kaynak önizlemesi var; note/synopsis/selectedText gibi alanlar bulunduğunda otomatik safe bağlama alınır. Bir soruya özel, kullanıcıya görünen 'kişisel notu dahil et', 'konuyu dahil et', 'yalnız seçili pasaj' seçimiyle etkin payloadı daralt. Kabul:Kapalı alanlar provider body'de gerçekten yok; coverage seçilmiş kapsamı açıklar; sonraki soruya sessizce farklı field taşınmaz; sır alanı zaten gönderilmez. G835-04 pinleri soruya ekleme farklıdır; bu zaten otomatik eklenen alanları çıkartabilmedir.

### A837-G07 — Tamamlanan asistan işinde kaynağa bağlı geri dönüş
Mevcut Jobs ve flowInfo canlı durum gösterir; panel kapalıyken tamamlanmış exact işi sonraki adıma bağlayan kullanıcı bildirimi/geri dönüş fırsatı ayrı bir ürün akışıdır. İsteğe bağlı, sessizliğe saygılı tek completion/failure bildirimi; 'ilgili konuşmaya dön' ve 'sonucu incele' eylemleri ekle. Kabul:A/B iki farklı iş tamamlanınca doğru source/thread/message açılır; eksik kaynak açık bildirilir; hiçbir ses/çeviri otomatik başlatılmaz; tekrarlı progress bildirimi yok. G01 token ömrü bu bildirimin yerine geçmez; bu kullanıcıya dönüş/odak yönetimidir.

### A837-G08 — Başarısız salt okuma adımını seçerek yeniden dene
Mevcut UI retry tüm başarısız soruyu tekrar send eder; provider tool trace ve final failed-check sayacı var. Kullanıcı kaynak aynı kalmışken yalnız başarısız read-only tool'u yeni turda seçip tekrar deneyebilsin; önceki başarılı aramalar gereksiz yeniden çalışmasın. Kabul:İki başarılı bir başarısız fixture'da yalnız seçilen read tool yeni çağrı alır; arguments/source snapshot görünür; eski mutation/proposal replay edilmez; yeniden elde edilen kanıtın tarihi/scope'u ayrı; secret/ham path saklanmaz. Bu R826 başarısız media job stageine yeni onay kartıyla retry veya G835-06 branch karşılaştırması değildir.

## Sınırlar ve elenenler

2–4 önemli yeni bug hedefi doldurulamadı: yalnız bir dar protokol uyumluluğu bugı kesinleştirildi. Kaynakta mevcut güvenlik/onay/try-again davranışlarını eksikmiş gibi yeniden önermedim. sourceText bütçesi, teklif ayar stale guard, job source binding, kitap search unicode/ofset, web kaynak budget, thread metadata/citation ve SSE namefragment eski kökleri tekrar sayılmadı. Sekiz öneri uygulanmadı; önerilerin işlev gereksinimi olması bug kanıtı değildir. Gerçek WindowsUI, normal start.bat, ücretli sağlayıcı, site, GPU ve uzun soak yapılmadı; kaynak/test commit yok.
