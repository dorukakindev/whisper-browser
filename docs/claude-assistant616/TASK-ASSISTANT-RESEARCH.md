# Claude görevi — Bütün programa hâkim asistan için derin araştırma ve uygulanabilir teknik döküm

## Yetki ve tek amaç

Bu görev **ARAŞTIRMA + KOD OKUMA + KONTROLLÜ DENETİM** görevidir. Ürün kodunu düzeltme, özellik uygulama, PR/commit/push/merge yapma. Depodaki genel AGENTS teslim akışı bu görevin açık read-only sınırını genişletmez. Yalnız ayrı `assistant-research-output/` altında rapor, kısa bağımsız probe ve kanıt oluşturabilirsin. Araştırmada hayalî model kimliği veya çalıştırılmamış test başarısı iddia etme.

Benim istediğim bir öneri listesi değil: bu ZIP'teki gerçek koda ve güncel birincil kaynaklara dayanan, başka bir yapay zekânın ek soru sormadan uygulayabileceği **çok ayrıntılı geliştirme şartnamesi**. Şu anda sen uygulamayacaksın; sonuçlarını daha sonra Codex inceleyip uygulayacak. Cevabını Türkçe ver. Benim kişisel API anahtarımı, hesabımı, mevcut oturumumu veya ücretli servisi kullanma. Yerel LLM kurmak hedef değil; mevcut harici OpenAI uyumlu sağlayıcıları kullanacak mimari hedefleniyor.

## Ürün hedefi

Asistan yalnız sohbet eden bir panel değil, uygulamanın güvenilir doğal dil kumandası olmalı. Kullanıcı açık sayfayı/medyayı gösterip normal Türkçe veya İngilizce komutlarla programdaki mevcut işlevleri çalıştırabilmeli; program neyi yapabilir, ne çalışıyor, ne başarısız oldu bilmelidir. Görevin mevcut butonları taklit etmek veya her komutu regex listesine eklemek değil; ortak, tipli, durum farkında ve test edilebilir araç sözleşmesinin nasıl kurulacağını tasarlamak.

Özellikle üç farklı yol karışmamalı:
1. **Hazır YouTube altyazısını çevir:** uygun mevcut track'i bul/seç, mevcut çeviri hattını kullan, Whisper başlatma.
2. **Yalnız Whisper ile transcribe et:** ASR kullan; çeviri veya dublaj kendiliğinden başlamasın.
3. **Whisper + çeviri:** mevcut ASR ardından mevcut çeviri; hedef dil, zaman aralığı ve çıktı/track bağlama doğru taşınsın.

“Bunu çevir” YouTube'da altyazı mı web sayfası mı, kitapta seçili pasaj mı bölüm mü? Kanıtlanan bağlam yeterliyse akıllıca yönlendir; gerçek belirsizlikte kısa netleştirme iste. Kullanıcıya her rutin adımda onay sordurma. Buna rağmen sıradan web sayfası/metin/altyazı içeriği asla kullanıcı komutu yerine geçmesin.

## Çalışma yöntemi — her bölümde geçerli global prompt

- Başlangıç SNAPSHOT ve MANIFEST'i doğrula. Önce ilgili kaynakları oku; dosya adlarından var/yok sonucu çıkarma. Aynı kaynağı gerekçesiz tekrar okuma.
- O anda gerekli ilgili okumaları, aramaları ve bağımsız kontrolleri bir çağrıda veya küçük scriptte grupla. Her küçük işlem için ayrı araç çağrısı açma. Önceki sonuç bir kararı belirliyorsa sonucu görmeden bağımlı işe geçme. Sabit çağrı/token/senaryo sayısı uğruna gerekli işi atlama.
- Çıktı hacmini sınırlı tut; dev renderer'ı komple dump etme, hedefli fonksiyon araması kullan. Karmaşık iç içe shell tırnakları yerine script dosyası kullan. Her alt işlemin gerçek çıkış kodunu/hatasını ayrı kaydet. Son komutun başarısı grubun tümünü başarılı yapmaz.
- Araştırmayı somut sorulara bağla. Bilgi yettiğinde net karar/şartname yaz; sonsuz link listesi yapma. Sayı doldurmak için repo veya bug uydurma.
- Paket AGENTS içindeki Windows, mevcut özellikleri koruma, kaynak güveni, hedefli test, native yüzey ve kişisel veri sınırlarını uygula. Bu görevde ürün değişikliği/push yasak.
- Test varsa kısa faydalı mevcut test düzenini tercih et. Ürün/test dosyalarına dokunmadan bağımsız geçici probe kullanabilirsin. Paket/sistem eksikse sınırı yaz; yoğun mock hazırlayarak sahte E2E başarısı üretme. Ortam uygunsa gerçek UI görüntüsü al; derleme/syntax başarısını tasarım veya fonksiyon kabulü sayma. Bulut tarayıcı localhost önizlemesi zorunlu değil; terminal testleriyle ilerlenebilir. Başlamayan test, atlanan senaryo ve fixture sonucu açık ayrılır.
- İnternet araçların varsa güncel resmî kaynak/GitHub kodu kullan. Yoksa bunu hemen rapora yaz, mevcut paketteki denetime devam et; erişemediğin repoyu okudum deme. Gerekli yeni kaynak isteklerini ayrı listele. Araştırmayı kullanıcıya geri yıkma.
- Bu görev çıktı sınırına sığmıyorsa önce dosyalara yaz, checkpoint üret. Son yanıttan önce raporların gerçekten mevcut, JSON/CSV'nin okunabilir olduğunu ve ZIP'in açıldığını kontrol et. Yapılmamış işi tamamlandı gösterme.

## A — Mevcut gerçek mimari ve kapsama envanteri

İlk olarak `SOURCE-MAP.md` içindeki başlangıç dosyalarını oku. Bunlar keşif ipucudur; çağrı zincirlerini kendin doğrula. `src/renderer/renderer.js` içindeki asistan gönderiminden provider/backend, eylem ayrıştırma, bağlam, IPC ve UI sonucuna kadar izle.

Şunları somut cevapla:
- Şu anda gerçek model tool calling var mı? Hangi yerde model metni, hangi yerde deterministik yerel intent/komut kullanılıyor? Provider-native web_search ile uygulama araçları aynı şey değil; ayır.
- AssistantPageCommands / AssistantMediaCommands / BookAssistantUI hangi durumlarda devreye giriyor? Bekleyen iş, başka pencere/sekme, izleme konumu, thread veya kaynak değişiminde ne oluyor?
- Hangi araçlar yalnız panel açıyor, hangileri gerçekten operasyon çalıştırıyor? “Açtım” ile “işledim” ayrımı konuşmada dürüst mü?
- Aynı işlem buton, kısayol ve asistan üzerinden tek ortak uygulama servisine gidiyor mu? Nerede kopya/DOM click/renderer closure bağımlılığı var?
- Ortak command registry, settings schema, job registry ve capability metadata zaten var mı; varsa neresi yeniden kullanılmalı?
- İlerleme, iptal, yeniden deneme, kısmi çıktı, durdurma ile duraklatma hangi işlerde var? Asistan bunları gerçekten gözleyebiliyor mu?
- Seçili kaynak, tam altyazı, yalnız izlenen kısım, zaman aralığı ve dil arasındaki fark doğru mu? Altyazı olmayan videoda içerik uydurma nasıl önleniyor?

`CAPABILITY-MATRIX.csv`: kullanıcı görünür **tüm ana yetenekleri** DOM/menü/IPC ve servislerden çıkar. Her satırda id, alan, gerçek özellik, örnekTR/ENkomut, mevcutUIeylemi, preloadmetodu, IPCkanalı, handler/servis, asistanmevcutmu, eksikbağlantı, girdişeması, bağlamgereksinimi, gözlemlenebilirçıktı, iptal, yanetki, güven/izin sınıfı, önerilenaraçadı, kabultesti olsun. Araç adına göre sayıyı şişirme; getter ile ayar setter'ını gerekirse aile halinde göster. Birçok IPC olması her IPC'nin modele açılması gerektiği anlamına gelmez.

En az şu alanları gerçekten tara: browser gezinme/sekme/profil/yerimleri/indirmeler; YouTube track yakalama; Whisper/çeviri; canlı ASR; altyazı düzenleme/senkron/görünüm; dublaj/referans/zamanlama/arka plan; TXTses; medya oynatıcı/hız/ses/dış ses/altyazı; kütüphane/keşfet/yapım bilgisi/yorum analizi/zevkprofili/koleksiyon; kitap/PDF/EPUB okuma/çeviri/yer imi/sesli üretim; işlem kuyruğu/çalışan işler; ayarlar/provider/model/tema/dil. Kaynakta olmayan özellikleri mevcut diye yazma.

## B — GitHub ve resmî kaynak araştırması

Araştırma sorusu: “Electron + Python olan bu mevcut uygulamaya, harici API modelleriyle çalışan, platform araçlarını güvenilir kullanabilen asistanı en az kırılmayla nasıl ekleriz?”

Başlangıç adayları (tavsiye veya doğrulanmış sonuç değildir; güncel varlık/isim/lisans/sürümünü SEN doğrula):
- `vercel/ai`: sağlayıcı/tool loop/streaming ve structured output yaklaşımı.
- `openai/openai-agents-js`: araç yürütme, guardrail, tracing, iptal/streaming; tamSDK yerine parça alma olanağı.
- `anthropics/claude-agent-sdk-typescript`: agent yaklaşımının masaüstü ürününe uygunluğu; runtime/hesap/bağımlılık koşulları. İsim veya erişim değişmişse düzelt.
- `langchain-ai/langgraphjs`: uzun iş ve durum makinesi; bu projede gereksiz ağırlık getirir mi?
- `modelcontextprotocol/typescript-sdk`: araç şemaları, capability discovery, local transport. MCP, tool calling ve agent loop farkını açıkla.
- `assistant-ui/assistant-ui`, `CopilotKit/CopilotKit`, `ag-ui-protocol/ag-ui`: araç kartları, human-in-loop, UI durum akışı; React bağımlılığı olanı düzJS'ye “direkt takılır” diye sunma.
- `browser-use/browser-use`, `microsoft/playwright`: mevcut uygulama servisi varken browser otomasyonu nerede son çare olmalı? Kişisel oturum/native view/maliyet/Windows kısıtları.
- `clash-verge-rev/clash-verge-rev` gibi alakasız projeleri sırf popüler diye ekleme. Asistanı olan masaüstü uygulamalardan gerçekten uygun örnekleri sen keşfet: örn `CherryHQ/cherry-studio`, `lobehub/lobe-chat`, `danny-avila/LibreChat`, `ChatGPTNextWeb/NextChat`. Repo isimlerini ve güncel kodunu doğrula.
- `colinhacks/zod`, JSON Schema/Ajv gibi araç girdi doğrulaması seçenekleri; mevcut bağımlılıkları kontrol etmeden yenisini dayatma.

Listeyle sınırlı kalma. Yakın alternatifleri karşılaştır; gerçekten okuduğun kaynakların URL, path/fonksiyon, HEAD/tag/sürüm, erişim tarihi, lisans ve alınabilecek somut mekanizmasını `REPO-COMPARISON.csv` içine koy. Yıldız sayısı kanıt değildir. README/pazarlama ile gerçek kaynak kodu bulgusunu ayır. Fork/commit kaynağı ve lisans yükümlülüğünü belirt. Kaynak kopyalamak için lisansı atlama. 100 link doldurmak yerine yeterli derinlikte adayları incele; kaç repoyu yalnız taradığını, kaçında kaynak/test okuduğunu söyle.

Her aday için karar: AL / ADAPTE ET / FİKİR OLARAK AL / ZATEN VAR / ALMA / ERİŞİLEMEDİ. Bu uygulamaya hangi dosyalardan bağlanacağı, hangi kopya kodu önleyeceği ve ek runtime/Node/React/native bağımlılığı/maliyet/telemetri/offline etkisi. En sonunda 2–3 mimari alternatif ve tek gerekçeli öneri sun. Bütün framework'leri aynı anda kurma önerisi istemiyorum.

## C — Önerilen uygulama mimarisi (tasarım, UYGULAMA YOK)

Şunları dosya/fonksiyon/şema düzeyinde tanımla:
1. Ortak capability registry: id, açıklama, input/output JSON Schema, gerekli context, availability nedeni, yanetki, idempotency, progress/cancel, permission metadata. Runtime durumuna göre yalnız ilgili araçların modele sunulması ve get_capabilities/get_state yaklaşımı.
2. Sağlayıcı adaptörü: OpenAI Chat Completions tools, Responses API, üçüncü taraf OpenAI-uyumlu sunucularda eksik tool desteği, streamed toolcall chunk birleştirme, JSON bozukluğu, support probe, structured intent fallback. Sessizce başka endpoint'e anahtar göndermek yok. Modelin “yaptım” cevabı execution receipt yerine geçmez.
3. Sınırları olan tool loop: plan/execute/observe, azami tur ve bütçe, timeout, cancellation, aynı toolcall tekrarına karşı koruma, döngü tespiti, çoklu araç sıralaması, paralel yalnız bağımsız read-only araçlar. Araç çıktısını kısaltma ama hata kanıtını koruma.
4. Mevcut UI işlevlerini shared service'e çıkarma. DOM tıklama/renderer global fonksiyonlarını modelin doğrudan kullanması varsayılan olmasın. Main handler'larda sender validation, schema validation, operation owner ve cancellation. Keyfi JS/shell/dosya erişimi gibi genel kaçış araçları önerme.
5. Bağlam manifesti: workspace, tabId+generation/navigationId, mediaId, title/url, currentTime/duration, availableTracks+sourceLanguage, selectedTrack, visible/selected subtitle range, localpath için opak yetki token'ı, PDF sayfa/spine ve selectedtext, currentjob, settings redacted snapshot. Bekleyen araç tam önceki bağlama bağlı mı; yeniden doğrulama kuralları.
6. Ayarlar araçları: read-only redacted liste; tipli patch/validate/apply; kısa onay özeti yalnız gerçek riskte; gizli API anahtarı okumama, mevcut endpoint değişiminde anahtar taşımama; secret alanını ayar penceresinde kullanıcı doldurur. “Kaliteyi artır” niyetinin somut değişikliklere dönüşümü ve geri alma.
7. İş yönetimi: accepted→queued→running/stage→partial→complete/failed/cancelled. Request kabulü, frontend görünmesi ve gerçek tamamlanma ayrı. Aynı GPU/ASR/dub kaynağı paylaşım kilidi; kaynak/sekme değişince eski sonuç yenisine yazılmasın. İptal tüm konuşmayı değil hedef işi kapsasın.
8. Yetki/risk yaklaşımı: rutin yetkili geri alınabilir eylemler doğrudan; dosya ezme/silme, dışa veri gönderme, pahalı analiz veya toplu değişiklikte gerekli somut önizleme. Sayfa/altyazı/kitap/araç yanıtı untrusted; prompt injection'a karşı kullanıcı komutundan ayrılmalı. Tehditleri gerçek kullanıcı akışını gereksiz onaylara boğmadan çöz.
9. Asistan UI: mevcut kaliteli tema/balon/expand korunur; araç planı, canlı iş kartı, kaynak+zaman aralığı, ilerleme, durdur/sürdür/yeniden dene/çıktıyı aç, açıklanabilir hata. API anahtarı ve teknik JSON'u kullanıcı akışına yığma. Klavye, dar ekran, EN/TR ve reduced-motion. Sahte yüzde yok.
10. Program bilgisi: “bu programda neler yapabiliyorsun”, yardım, aktif sayfaya uygun öneriler ve sınırlamalar gerçek registry'den gelsin; dev sistem promptuna her fonksiyonu dökmek tek çözüm olmasın. Kaynak indeksleme/RAG gerekip gerekmediğini kodla gerekçelendir.

En az şunların JSON/tool sözleşmesi örneğini yaz: get_active_context, list_caption_tracks, translate_existing_track, transcribe_media (translate=false/true ayrımı), get_job_status, cancel_job, generate_dub, use_generated_audio, get_settings_schema, update_settings, get_reader_context. İsimler öneridir; kodda varmış gibi gösterme. Bir gerçek mevcut fonksiyona her önerilen aracın nasıl bağlanacağını belirt. HTTP/JSON örneklerinde yalnız dummy anahtar/fixture verisi.

## D — Kabul senaryoları ve kritik hatalar

Aşağıdaki senaryolar için bağlam, TR/ENkomut, beklenen tool dizisi, parametreler, yanetkiler, istenmeyen davranış, gözlemlenebilirkanıt ve otomasyon yöntemi yaz. Kaynakta mevcut testi varsa path ver; yoksa önerilen test.

- YouTube'da birden fazla manuel/otomatik track; hazır altyazıyı Türkçeye çevir, ASR çalışmasın.
- YouTube altyazısız: “yalnız transcribe”; çeviri/dublaj kendiliğinden başlamasın.
- “5–10 dakika Whisper + Türkçe çeviri”; tüm segment/kelime/track zamanları orijinal videoya hizalı.
- “Bunu seslendirmeye uygun çevir sonra benim kayıtlı sesimle oku”; hazır çeviri ile yeniden çeviri farkı, reference token, iş sırası.
- “Orijinal müziği koru”; seçili aralıkta separation ve GPU uygunluğu; CPU fallback dürüstlüğü.
- İptal isteği, az önce biten iş, iki pencere, aynı komut tekrarı, ardışık tıklama, kuyrukta bekleme.
- Araç planlandıktan sonra YouTube başka videoya/sekme başka siteye geçer; eski işlem/çıktı yeni hedefe bağlanmasın.
- Haber sayfasını çevir; ekran üzerinde mevcut sayfa çeviri özelliği çalışsın; sohbet metni çevirmekle karışmasın.
- “Bu kişi kim, internetten araştır”; yalnız sayfa kanıtı ile web araması ayrımı, unsupported provider, kaynaklı cevap.
- Kitapta yalnız12–24sayfa/bölüm/selectedtext, bölüm seslendirme, mevcut sesle takip; tam kitabı yanlışlıkla üretme.
- Film keşfet, yorum örneği/analiz, koleksiyon/gruplama, favoriler: mevcut varlık ve doğru kullanıcı niyeti.
- “Sesi biraz yükselt/altyazıyı büyüt/temayı değiştir”; settings ve runtime playback ayrımı.
- Anahtar göstermeyi isteyen komut, kötü niyetli sayfa metni, sahte tool çıktısı, path traversal ve uygunsuz IPC sender.
- Provider tool desteği yok, eksikargument, birleştirilemeyen streamed JSON, rate limit, internet yok, uzun çıktı, araç exception, model tekrarı, token/bütçe sınırı.
- “Yapabilir misin?” doğrudan eylem niyeti; soru biçimi diye hiçbir şey yapmama bug'ı.
- “Nasıl yapılır?” yardım niyeti; yardım sorusu diye iş başlatma bug'ı.

Bulgu sınıfları: DOĞRULANDI / KODDAN_GÜÇLÜ_ŞÜPHE / TASARIM_BOŞLUĞU / ÖNERİ / ÇÜRÜTÜLDÜ / ORTAM_ENGELİ. Yeniden üretim olmadan güvenlik/çökme iddiasını kesin diye sunma. Özellik eksikliği ile mevcut bug'ı ayır.

## E — Uygulayıcıya teslim (dosyalar zorunlu)

`assistant-research-output/` altında:
- `READ-ME-FIRST.md`: ana karar, mevcut/eksik ayrımı, nasıl uygulanır, okunacak sıra.
- `CURRENT-ARCHITECTURE.md`: dosya/fonksiyon/kanal haritası ve Mermaid veri akışı.
- `CAPABILITY-MATRIX.csv`: gerçek ürünün kapsam envanteri.
- `RESEARCH-REPORT.md` + `REPO-COMPARISON.csv` + `SOURCES.md`: güncel repo araştırması, kod kanıtları, lisans ve seçilmeyenler.
- `IMPLEMENTATION-SPEC.md`: önerilen dizinler, değişecek dosyalar, arayüzler/JSON şemaları, durum makineleri ve entegrasyon noktaları. Uygulanabilir pseudocode olabilir; ürün patch'i yok.
- `IMPLEMENTATION-TASKS.md`: bağımsız kabul koşullu görevler; her biri amaç, dosyalar, bağımlılık, mevcut davranışı koruma, ayrıntılı iş, test ve done şartı. Büyük tek paragraf yerine başka AI'ın gerçekten uygulayacağı net görevler.
- `ACCEPTANCE-TESTS.csv`: pozitif/negatif/race/izin/UI/provider senaryoları; her biri ayrı kanıt.
- `FINDINGS.json`: id, sınıf, önem, kaynak path:line, kök neden, kanıt, repro, öneri ve durum; sayıyı doldurma.
- `RUN-LOG.md`: gerçekten koşulan komut/exit ve sınırlar. Ürün diff'i boş doğrulaması, kaynak HEAD, araştırma tarihi, erişilemeyenler.
- Hepsini içeren `ASSISTANT-RESEARCH-DELIVERY.zip`.

Son yanıtta dosyaları indirilebilir ver, ürün koduna dokunmadığını ve gerçekte hangi test/araştırmanın yapıldığını belirt. Rapor yerine yalnız “bunları yapabiliriz” cevabıyla bitirme. Görevdeki her ana bölüm için tamamlandı/kısmi/engelli durumunu ver. Sabit token veya araç limiti bütçesini bilmediğin halde bildiğini iddia etme.
