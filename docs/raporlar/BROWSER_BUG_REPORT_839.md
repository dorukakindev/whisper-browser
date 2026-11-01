# R839 — AI browser ve medya uygulamalarından asistan, Keşfet ve Letterboxd için ne alabiliriz?

1 Kasım 2026. Yerel ürün tabanı: `b74b0e1200f9d6e3c3af14d82fc4fe86ccb983b5`. **Araştırma ve öneri raporudur; uygulama yapılmadı.** Önceki [R838 araştırması](BROWSER_BUG_REPORT_838.md) kullanıcı isteğiyle aynen korunur. Bu raporda Subtitle Edit ve altyazı format araçları öncelik değildir.

**Benim seçimim:** İlk kod araştırma adayları **Nanobrowser + SuggestArr + Taste Matcher + Seerr + Vane**. Birlikte asistanın daha iyi iş yürütmesini, istenen filmi konuşarak bulmayı, Letterboxd verisinden açıklanabilir sıralama üretmeyi ve bunları okunaklı bir arayüzde göstermeyi destekliyorlar. BrowserOS, Opal ve Reiverr güçlü ürün/tasarım referansları; mevcut MIT ürüne bu depolardan doğrudan kod kopyalamayı önermiyorum. Reelix ve Open Filmly'de lisans belirsizliği var; fikir ve mimari inceleme ile sınırlı tutuyorum.

**14 depo hedeflendi: 13'ünün HEAD/kaynakları alındı; Luna hedefi 404 döndü. 11 resmi arayüz görüntüsü incelendi. 30 geliştirme önerisi aşağıda.** Bunlar 30 yeni bug veya önceki raporlardan tamamen bağımsız 30 keşif iddiası değildir. Mevcut fikirlerin dış repo karşılığı bulunduğunda açıkça geliştirme yolu olarak anlatılır. Önceki hatalar tekrar sayılmaz.

## 1. Bizde zaten olanlar ve asıl eksik kalan gelişim yönü

Güncel kodda asistan araç çağırıyor, kaynak bağlamı okuyor, iş durumunu izliyor, kaynak bağlı onay kartları çıkarıyor; sohbet kalıcılığı ve dallar var. Film araması/ayrıntısı, izlenecekler, Keşfet, kişisel puanlar, Letterboxd yorum alma/analizi ve zevk profili de var. Bunları başka üründe görmek “bizde hiç yok” anlamına gelmiyor.

Geliştirme fırsatı daha çok şu birleşimde: **kullanıcının niyetini düzenlenebilir bir arama planına çevirmek → gerçek katalog adaylarını bulmak → kişisel kanıtla sıralamak → nedenini göstermek → geri bildirimle bir sonraki turu iyileştirmek.** Asistan tarafında ise konuşma, kaynaklar, plan, uygulanan eylemler ve sonucun ayrı ama bağlantılı olması gerekiyor. Uzun teknik logu sohbet içine dökmek veya her işlemi yalnız metin olarak anlatmak bu deneyimi karşılamaz.

Yerel kaynaklar [baseline kaydında](research839/local-baseline.json). Özellikle `assistant-retrieval.js` bağımsız sözcüksel arama; bu incelemede bunu derin semantik arama gibi adlandırmadım. `media-taste.js` kanıtlı yorum çıkarımı ve örnek sayısına göre güven etiketi içeriyor; öneriler bunları genişletir.

## 2. Hangi uygulamada ne var, bize ne yarar?

| Depo | Kodda veya resmi görüntüde incelenen özellik | Bize alınabilecek en değerli şey | Edinme kararı |
|---|---|---|---|
| **[Nanobrowser](https://github.com/nanobrowser/nanobrowser)** | Tarayıcı eylem sonucu, tekrarlama koruması, bağlam sıkıştırma, aktivite ve onay kartları | Sonucu doğrulanmış eylemler, boşa döngüyü kesme, uzun konuşmada eylem defteri | Apache-2.0; seçilmiş TS mantığını uyarlama adayı. Chrome extension altyapısı komple alınmaz |
| **[BrowserOS](https://github.com/browseros-ai/BrowserOS)** | Ekli sekmeler/seçili metin bileşenleri, compaction, görev/replay arayüzü | Asistanın hangi kaynaklara baktığını görünür kılma; görevden çıktıya giden geçmiş | AGPL-3.0; bu MIT ürün için bağımsız tasarım/mimari uygulama |
| **[Stagehand](https://github.com/browserbase/stagehand)** | `observe`, şemalı `extract`, cache ve scope ayrımı | Sayfayı bulma, veri çıkarma ve eylemi ayıran görev araçları | MIT; küçük adaptör veya algoritma incelemesi. Büyük SDK'yı doğrudan kurmak ilk tercih değil |
| **[Browser Use](https://github.com/browser-use/browser-use)** | Mesaj yönetimi, geçmiş/screenshot ile sonuç değerlendirme, yapılandırılmış agent durumu | Uzun işin sonucunu kanıtlarla değerlendirme ve başarısızlığı doğru özetleme | MIT; Python/CDP hattı nedeniyle önce örnek, sınırlı yardımcı servis ancak ihtiyaç çıkarsa |
| **[Vane / eski Perplexica](https://github.com/ItzCrazyKns/Vane)** | Kaynaklı araştırma, speed/balanced/quality, araştırma adımları; kaynak/yanıt ayrımı | Medya araştırmasını kaynaklı dosyaya çeviren asistan; daha anlaşılır ilerleme | MIT; seçilmiş TS sözleşmeleri uyarlanabilir. Next.js arayüzünü gömmek gerekmez |
| **[Opal](https://github.com/debpalash/Opal)** | AI tool registry, oynatıcı kontrolü, aday/confirmation durumu, film arama, geçmiş; home/browse/player görselleri | Konuşma içinde gerçek medya kartı ve oynatma hazırlığı; arama/izleme sürekliliği | GPL-3.0 ve Zig/native stack; fikir/tasarım bağımsız uygulanmalı |
| **[SuggestArr](https://github.com/giuseppe99barchetta/SuggestArr)** | Doğal dil sorgusu → önerilen başlıkları TMDB'de çözümleme → filtre/dedup → gerekçe | Konuşarak film arama; geçmiş/izlenmiş filtresini açık yönetme | MIT; Python servis mantığını Node/Electron servisimize port etmek gerçek aday |
| **[Taste Matcher](https://github.com/thatmanspr/letterboxd-taste-matcher)** | Node `server.js`: puan profili, ağırlıklar, komşu benzerliği, watchlist ve rewatch sırası | Letterboxd izleneceklerini açıklanabilir ve ayarlanabilir biçimde sıralama | MIT; saf hesapları ayırarak alma adayı. README'deki Electron paketinin tam kurulum ağacı doğrulanmadı |
| **[Letterboxd Movie Recommendations](https://github.com/victorverma3/Letterboxd-Movie-Recommendations)** | Kişisel özellik hazırlığı, RandomForest modeli, watchlist aday puanlama | Kural tabanlı sıralamayı ölçülebilir kişisel modelle karşılaştırma | MIT; çevrimdışı deney adayı. Model, toplu veri ve scraper'ı doğrudan ürün bağımlılığı yapmam |
| **[Seerr](https://github.com/seerr-team/seerr)** | Düzenlenebilir discover slider modeli, filtre paneli, başlık kartları | Kaydedilebilir özel Keşfet rafları ve tutarlı kart durumları | MIT; seçilmiş veri modeli/sorgu düzeni aday. İncelenen dal `develop`, kararlı release değil |
| **[Reelix](https://github.com/jj-tsao/rag-movie-recommender-app)** | Düzenlenebilir hard/soft filtreler, oturum niyeti, hibrit sıralama, koleksiyon çeşitliliği, açıklama | “Biraz daha az karanlık olsun” gibi devamlı keşif ve neden-sonuç görünümü | Kök yeniden kullanım lisansı doğrulanamadı; doğrudan kod/model kopyası listesine girmiyor |
| **[Reiverr](https://github.com/aleksilassila/reiverr)** | Discovery sorguları; büyük medya hero'su, sade eylemler ve poster rafları | Film ayrıntısı hiyerarşisi ve daha sinematik ama kontrollü Keşfet | AGPL-3.0; tasarım örneği. Pushed tarihi yeni olsa da incelenen default HEAD tarihi 2025-02-22 |
| **[Open Filmly](https://github.com/doctoroyy/open-filmly)** | Zamanlı arama sonuçları, transcript kesme sınırı, yerel izleme olayları, offline planner; home/detail görselleri | Sahne sonucu kartı, spoiler sınırı ve yerel izleme belleği | Kök lisans doğrulanamadı; bağımsız fikir. README vizyonu ile çalışan kalite ayrılmalı |
| **Luna Player** | Güncel hedef `Nothingman333/Luna-Player` API çağrısı 404 | Önceki karşılaştırmalar tarihsel bağlam olabilir | Bu tur güncel kaynak/özellik doğrulanamadı; eski kod/görüntü güncelmiş gibi sayılmadı |

Her başarılı repo için tam HEAD, tarih, lisans API değeri ve kaynak hashleri [depo kaydında](research839/repositories.json), [dosya kaydında](research839/source-review.json). Lisans tespiti seçilmiş kök kaynaklar içindir; transitive bağımlılık, model ağırlığı veya dış veri kullanım şartlarını otomatik kapsamaz.

## 3. Asistan için on somut geliştirme

### A01 — Konuşmaya açıkça seçilen çoklu kaynaklar

**Örnek:** BrowserOS [ekli sekmeler](https://github.com/browseros-ai/BrowserOS/blob/b04405ad9826bde42cd55d2aeab17096a5fb12e3/packages/browseros-agent/apps/app/screens/sidepanel/index/ChatAttachedTabs.tsx) ve [seçili metin](https://github.com/browseros-ai/BrowserOS/blob/b04405ad9826bde42cd55d2aeab17096a5fb12e3/packages/browseros-agent/apps/app/screens/sidepanel/index/ChatSelectedText.tsx). Bizde kaynak bağlamı zaten var; geliştirme, bir film sayfası + seçilmiş yorumlar + açık video altyazısını kullanıcı seçimiyle aynı soruda karşılaştırmak.

**Davranış/tasarım:** Yazı alanının üstünde kaldırılabilir kaynak kartları: film, sekme, seçili aralık, yorum örneği. “Yalnız bunları kullan” kapsamı görünür. Tüm açık sekmeler otomatik taranmaz. Kimlik ve revizyon `assistant-context-manifest.js` üzerinden sabitlenir. **Kabul:** sekme değişse de yanıtın kaynakları aynı kalır; çıkarılan kaynak sonraki turda gönderilmez. **Öncelik P1 / orta kapsam; kod kopyası yerine bağımsız uygulama.**

### A02 — “Bul → öner → uygula → sonucu doğrula” browser eylemleri

**Kaynak:** Nanobrowser [eylem katmanı](https://github.com/nanobrowser/nanobrowser/blob/19dc8e8a9be6ed06c0ef9ec7de8d84bf6a88c458/src/browser-control/core/tools/act.ts) ile Stagehand [observe](https://github.com/browserbase/stagehand/blob/b7a4b899079f198a0ee78a6dcb62ad02f545cf49/packages/extension/services/observeService.ts)/[extract](https://github.com/browserbase/stagehand/blob/b7a4b899079f198a0ee78a6dcb62ad02f545cf49/packages/extension/services/extractService.ts) ayrımı. Bizde uygulama içi araçlar var; yeni yarar belirli web görevlerini aynı disipline bağlamak.

**Örnek:** Kullanıcının seçtiği film sayfasında yorum bölümünü bul, görünür örneği çıkar, kimliği kontrol et; değişiklik gerekiyorsa mevcut kartla öner. `chrome.debugger` kodu Electron'da doğrudan çalışmaz; main/WebContents adaptörü gerekir. Genel keyfi JS/shell köprüsü açılmamalı. **Kabul:** navigasyonla eskimiş hedefte yanlış düğmeye basılmaz; başarı ancak gerçek son koşuldan sonra gösterilir. **P1 / büyük, küçük read-only pilotla başlamalı.**

### A03 — Aynı işi tekrarlayan asistana etki temelli döngü koruması

**Alınabilir kod:** Nanobrowser [guards.ts](https://github.com/nanobrowser/nanobrowser/blob/19dc8e8a9be6ed06c0ef9ec7de8d84bf6a88c458/src/agent/guards.ts) araç + argüman + sonuç imzasını ve etkisiz denemeleri izliyor. Bizim provider tur sınırımız var; ek değer aynı başarısız okumayı veya etkisiz kartı tur sınırına kadar tekrar etmek yerine erken ve gerekçeli çıkmak.

**Uyarlama:** Kaynak ID ve hata sınıfıyla tekrar sayacı; “aynı sayfa üç kez eksik döndü” gibi teknik ayrıntıyı kullanıcıya sade öneriyle anlatma. Upstream sabitleri körlemesine alınmaz. **Kabul:** aynı sonuçlu döngü durur; gerçekten değişen kaynak veya daha dar sorgu yanlışlıkla engellenmez. **P1 / küçük; Apache bildirimiyle seçilmiş mantık aday.**

### A04 — Uzun konuşmada özetten ayrı, kodla tutulan eylem defteri

**Alınabilir desen:** Nanobrowser [compaction](https://github.com/nanobrowser/nanobrowser/blob/19dc8e8a9be6ed06c0ef9ec7de8d84bf6a88c458/src/agent/compaction.ts) kullanıcı mesajları, tool-call/result grupları, eylem defteri ve model özetini ayırıyor. Bizde kalıcı sohbet bulunması, model bağlamının doğru küçültüldüğü anlamına gelmez.

**Ek değer:** Hangi öneri kabul edildi, hangi iş gerçekten tamamlandı, hangi kaynak kullanıldı gibi gerçekler modelin serbest özetine bırakılmaz. Eski ayrıntılar gerektiğinde ID ile geri okunabilir. **Kabul:** sıkıştırma sonrası reddedilmiş dublaj başlatılmaz, tamamlanmış iş tekrar ücretlendirilmez, kullanıcı düzeltmesi özete üstün gelir. **P1 / orta.** Bütün upstream storage katmanı değil, saf gruplama/ledger mantığı alınmalı.

### A05 — Araştırmayı sohbet metninden kalıcı bir medya dosyasına dönüştürme

**Kaynak:** Vane [araştırmacı](https://github.com/ItzCrazyKns/Vane/blob/348feca3e378fb4157b217724ed508dc707f853f/src/lib/agents/search/researcher/index.ts) ve [plan eylemi](https://github.com/ItzCrazyKns/Vane/blob/348feca3e378fb4157b217724ed508dc707f853f/src/lib/agents/search/researcher/actions/plan.ts); BrowserOS'un [araştırma çıktısı görüntüsü](https://github.com/browseros-ai/BrowserOS/blob/b04405ad9826bde42cd55d2aeab17096a5fb12e3/docs/browseros/features/cowork/cowork-research-example.png). Bizde web araştırması var; geliştirme sonucu film/konu kaydına bağlayan inceleme dosyası.

**Örnek:** “Bu filmin yorumlarında en çok tartışılan üç şeyi kaynaklarıyla çıkar.” Sonuç; kısa özet, görüş kümeleri, kaynaklar, örnek kapsamı ve son güncelleme içersin. Kaydedilen çıktı kendi güvenli render sözleşmemizden gelsin; modelin keyfi HTML'i çalıştırılmasın. **Kabul:** kaynak sonradan değişse de alıntı revizyonu belli; çıktı yeniden açılır. **P1 / orta; MIT mantık uyarlaması.**

### A06 — Hızlı yanıt / normal inceleme / derin araştırma seçimi

**Kaynak:** Vane [arama türleri ve mod sözleşmesi](https://github.com/ItzCrazyKns/Vane/blob/348feca3e378fb4157b217724ed508dc707f853f/src/lib/agents/search/types.ts). Asistanın her soruda aynı maliyetli yaklaşımı kullanması yerine kullanıcı görevin derinliğini seçebilsin.

**Bizdeki karşılık:** Hızlı mod seçili bağlamda, inceleme modu sınırlı ek kaynakla, derin mod görünür adım/süre/çağrı bütçesiyle çalışır. Bu seçenek model adı değiştirmekten ibaret olmamalı; kaynak sayısı ve sınırları gerçek kodda uygulanmalı. **Kabul:** bütçe bittiğinde kısmi kapsam dürüstçe raporlanır; durmuş iş “tam araştırıldı” demez. **P1 / orta; otomatik ücretli çağrı artırma yok.**

### A07 — Başarılı bir okuma görevini yeniden kullanılabilir iş akışına kaydetme

**Dayanak:** Stagehand'ın [scope duyarlı cache düzeni](https://github.com/browserbase/stagehand/blob/b7a4b899079f198a0ee78a6dcb62ad02f545cf49/packages/extension/services/cacheService.ts) ve BrowserOS görev geçmişi. Önerilen özellik bizde özgün bir kapsamlı iş akışı olmalı: “filmin yorumlarını getir → örneği kontrol et → analize hazırla”. Bu repoların tümü için aynı kayıt/yeniden oynatma garantisi iddia edilmiyor.

**Sınır:** Kaydedilen şey kullanıcıdan gelen hedef ve araç planı; süresi geçmiş DOM ID'si veya daha önce verilmiş yazma izni değil. Her çalışmada kimlik/son koşul tekrar doğrulanır. **Kabul:** başka film üzerinde eski yorumlar karışmaz; izleme listesine yazma gibi adım yeni açık onay kapsamına uyar. **P2 / orta-büyük.**

### A08 — Repliği hatırlamadan sahneyi tarif ederek arama

**Kaynak:** Open Filmly [zamanlı sonuç servisi](https://github.com/doctoroyy/open-filmly/blob/9d3c95487b242c07df8ed725afb09434d2d52c02/lib/services/intelligence/semantic_search_service.dart). Bizim sözcüksel altyazı aramasına ek olarak “adam geçmişte verdiği sözü açıklıyordu” gibi ifadelerde benzer pasajları bulabilmek değerli.

**Önemli bulgu:** İncelenen [local_embedding_service](https://github.com/doctoroyy/open-filmly/blob/9d3c95487b242c07df8ed725afb09434d2d52c02/lib/services/intelligence/local_embedding_service.dart) gerçek sinir ağı embedding modeli değil, hash edilmiş token vektörü kullanıyor. Bunu ileri semantik model diye almayız. Sonuç/veri sözleşmesini örnek alıp Türkçe/İngilizce corpus'ta gerçek embedding ile mevcut lexical aramayı ölçerek kıyaslarız. **Kabul:** gerçek cue ID + zaman + alıntı; bulunamayan sahne uydurulmaz. **P2 / büyük, önce offline deney.**

### A09 — İzlenen noktaya kadar gerçekten sınırlandırılan spoiler güvenli yardım

**Kaynak:** Open Filmly [spoiler_guard_service](https://github.com/doctoroyy/open-filmly/blob/9d3c95487b242c07df8ed725afb09434d2d52c02/lib/services/intelligence/spoiler_guard_service.dart) segment bitişini oynatma pozisyonuyla filtreliyor. Bu küçük kural yararlı ama tek başına spoiler garantisi değil.

**Bizde öneri:** “Şu ana kadar anlat” seçimi; yalnız önceki altyazı/özet/yorum kesitlerinin gönderilmesi, gelecek bölüm metadata ve alıntılarının da dışlanması. Modelin ön bilgisini tümüyle silemeyiz; yanıtın sağlanan kanıta bağlı olması ve belirsizlik belirtmesi gerekir. **Kabul:** sonraki cue'ya yerleştirilmiş canary hiçbir tool/prompt/çıktı kanıtına geçmez; kullanıcı izin vermeden dış web özeti eklenmez. **P1 / orta-büyük; lisans belirsizliği nedeniyle özgün uygulama.**

### A10 — İsteğe bağlı görüntü bağlamı ve sonuç denetimi

**Kaynak:** Opal [araç kayıtları](https://github.com/debpalash/Opal/blob/d56c55e323a83b40ae210bfaca3d5e2da2688ae3/src/services/ai_tools.zig) ekran/oynatıcı araçları içeriyor; Browser Use [judge](https://github.com/browser-use/browser-use/blob/b49a68e4060acb226da8f784194fef301c53a6d7/browser_use/agent/judge.py) geçmiş ve sınırlı screenshot ile sonuç değerlendiriyor. Geliştirme, kullanıcının seçtiği kareyi “bu kişi kim?” gibi soruya eklemek ve asistan işinin sonucunu açık kanıtla değerlendirmek.

**Sınır:** Frame yakalama, OCR, yüz tanıma ve modelin kişiyi doğru bilmesi ayrı yeteneklerdir. Model desteklemiyorsa görüntü gönderilmez. Kişisel ekran otomatik yüklenmez; native video yüzeyi ayrı yakalama isteyebilir. Judge yeni bir model görüşüdür, otoriter başarı ölçütü değil; gerçek dosya/ID/son koşul önceliklidir. **Kabul:** açık ek ve kaldırma, bütçe, DRM/native sınır bildirimi. **P2 / büyük.**

## 4. Keşfet ve Letterboxd için on iki geliştirme

### F01 — Doğal dilde aramayı düzenlenebilir filtrelere çevirme

**Alınabilir parça:** SuggestArr [AI Search servisi](https://github.com/giuseppe99barchetta/SuggestArr/blob/f0a9fd7cd5bf6b1e2ca7bf207eadd584ffd93b30/api_service/services/ai_search/ai_search_service.py) ve [TMDB discover adaptörü](https://github.com/giuseppe99barchetta/SuggestArr/blob/f0a9fd7cd5bf6b1e2ca7bf207eadd584ffd93b30/api_service/services/tmdb/tmdb_discover.py). “90'lardan, karanlık ama korku olmayan, iki saati geçmeyen film” sorgusunu yorumlayıp gerçek katalog başlıklarına çözümleyebiliriz.

**Doğru uyarlama:** Yıl/süre/dil gibi kesin filtre ile “karanlık” gibi yumuşak tercih ayrı görünür. Mevcut keşif Cinemeta/provider altyapısıdır; TMDB servisi yokmuş gibi rastgele aynı endpoint sözleşmesi kullanılmaz. Ek metadata sağlayıcısı gerekiyorsa mevcut güvenli ayar yolu ve şartlarıyla ayrı adaptör olur. **Kabul:** her sonuç gerçek ID; imkânsız filtre sessizce gevşetilmez. **P1 / orta.**

### F02 — “Bunlara benzesin ama daha az ağır olsun” devamlı keşfi

**Örnek:** Reelix [active spec](https://github.com/jj-tsao/rag-movie-recommender-app/blob/e47b0c9ce7e96dd099cf1fbfae16d988e42e50b6/packages/python/reelix_agent/orchestrator/active_spec.py) ve [session memory](https://github.com/jj-tsao/rag-movie-recommender-app/blob/e47b0c9ce7e96dd099cf1fbfae16d988e42e50b6/packages/python/reelix_agent/orchestrator/session_memory.py) sorgu niyetini yapılandırılmış saklıyor. Kod lisansı doğrulanmadığından kopya değil, kendi modelimiz önerilir.

**Davranış:** Kullanıcının sabit istediği dönem/dil korunur; yalnız tempo/ton değişir. Önceki sonuçlar ve elenenler tekrarlanmaz; “arama koşulları” satırında fark görünür ve geri alınır. **Kabul:** “daha kısa” türü/yılı sıfırlamaz; eski sonuçtan seçilen film ID'si yeni aramada yanlış karta bağlanmaz. **P1 / orta.**

### F03 — Letterboxd izlenecekler listesini kişisel zevke göre sıralama

**Alınabilir hesap:** Taste Matcher [server.js](https://github.com/thatmanspr/letterboxd-taste-matcher/blob/19a9860a47130bf0c93972bb34ce07a5be29a171/server.js) içindeki profil, komşu benzerliği ve ortak `scoreItem`. Bizde zevk profili ve watchlist var; yeni yarar yalnız kişinin kendi bekleyen listesinden “bugün hangisini açayım?” sırası.

**Uyarlama:** Saf hesapları ağ/Express/global state'ten ayır; mevcut kişisel puan ve katalog ID'leriyle besle. Metadata eksikliği görünür; Letterboxd 0.5–5 puanı ile bizim 0–10 ölçek açık çevrilir. Tekrar izleme ayrı raf olur. **Kabul:** aynı veride deterministik sıra; kullanıcının puanı değişince ilgili önbellek yenilenir. **P1 / orta; MIT port adayı.**

### F04 — Sıralama önceliklerini kullanıcı seçsin

**Dayanak:** Taste Matcher'ın aynı kaynakta kullanıcı ağırlıkları ve bileşen skorları var. Bizde hikâye/karakter/tempo gibi tercihler bulunuyor; geliştirme bunları metadata tabanlı tür, yönetmen, dönem, tema ve yenilik isteğiyle açık ve dengeli birleştirmek.

**Tasarım:** Dokuz slider'ı ana sayfaya dizmek yerine birkaç profil: “zevkime yakın”, “yeni bir şey”, “yönetmen odaklı”; ayrıntıda sıralanabilir tercihler. Tümünü kullanıcı anlamadan gizli AI ağırlığına çevirmem. **Kabul:** ağırlık değişikliği sıralamayı izlenebilir etkiler; normalize edilmemiş eksik veri sıfır puan cezası gibi davranmaz. **P1 / orta; F03 ile ortak modül, ayrı davranış.**

### F05 — “Neden bana önerildi?” açıklamasını gerçek destekleyen filmlerle verme

**Kaynak:** Taste Matcher bileşenleri, Reelix [açıklama katmanı](https://github.com/jj-tsao/rag-movie-recommender-app/blob/e47b0c9ce7e96dd099cf1fbfae16d988e42e50b6/packages/python/reelix_agent/explanation/explanation_agent.py) mimari örneği. LLM'nin sonradan inandırıcı bir hikâye uydurması yerine sıralama sisteminin hesapladığı katkılar açıklamaya girdi olmalı.

**Kart:** “Şu iki filmde sevdiğin anlatım / bu yönetmene verdiğin puan / dönem tercihin”; destek azsa “sınırlı veri”. Eşleşme puanı kalibre edilmeden “%94 seversin” olasılığı diye etiketlenmemeli. **Kabul:** verilen gerekçe gerçek kişisel kayıtlara açılır ve skor bileşeniyle çelişmez. **P1 / orta.**

### F06 — Aynı seri ve aynı popüler filmlerle dolmayan sonuç çeşitliliği

**Örnek:** Reelix [recommend pipeline](https://github.com/jj-tsao/rag-movie-recommender-app/blob/e47b0c9ce7e96dd099cf1fbfae16d988e42e50b6/packages/python/reelix_recommendation/recommend.py) aday birleştirme, metadata rerank ve collection çeşitlendirmesi içeriyor. Bizdeki Keşfet havuzları korunarak kendi deterministik son sıralama katmanı kurulabilir.

**Davranış:** İlk sayfada seri/yönetmen/ülke tekrarını sınırla; alaka ile çeşitlilik arasında seçilebilir denge. Bu, “rastgele karıştır” değildir; neden elendiği ölçülebilir olmalı. **Kabul:** aynı franchise'a ait on aday ilk on sırayı kaplamaz; sıkı kullanıcı filtresini çeşitlilik uğruna ihlal etmez. **P1 / orta; lisans nedeniyle bağımsız algoritma.**

### F07 — İki kişinin ortak film seçimi

**Dayanak:** [Letterboxd Movie Recommendations](https://github.com/victorverma3/Letterboxd-Movie-Recommendations/blob/13ab7f17c97142facc3acfa993df9a860b78f726/backend/model/recommender.py) watchlist adaylarına kişisel puan üretiyor; projenin çok kullanıcılı seçimi ürün referansı. İncelenen üç dosyayla bütün grup algoritması test edildi denmiyor.

**Bizde öneri:** İki ayrı ve açıkça seçilmiş yerel import/profil; ortak watchlist veya birleşim seçimi; her ikisinin kabul edebileceği adaylar. Sadece ortalama değil, bir kişinin çok düşük değerlendirdiği filmi eleyen “en düşük uyum” kuralı gösterilebilir. **Kabul:** profiller karışmaz, ikinci kişinin verisi kendiliğinden buluta gitmez, ortak aday yoksa dürüst sonuç. **P2 / orta-büyük.**

### F08 — Yorum analizinde görüş kümesi → alıntı → orijinal yorum zinciri

**Kaynak:** Vane'in [yanıt görünümü](https://github.com/ItzCrazyKns/Vane/blob/348feca3e378fb4157b217724ed508dc707f853f/src/components/ChatWindow.tsx) ve kaynak kartları; bizdeki `letterboxd-reviews.js`, `media-tools-model.js` zaten alıntı doğruluyor. Yeni öneri “yorum analizi ekle” değil, doğrulanmış kanıtı daha kullanılabilir sunmak.

**Tasarım:** “Tempo tartışması” kümesinde lehte/aleyhte alıntılar, örnek büyüklüğü ve orijinale açma; model özetiyle yorum metni görsel olarak farklı. Örnek yorum oranı tüm Letterboxd topluluğunun görüşü gibi sunulmaz. **Kabul:** her iddia bir örnek ID'sine bağlı; silinen/yenilenen örnek eski analizi işaretler. **P1 / orta; mevcut sözleşmeye UI geliştirmesi.**

### F09 — Keşfet raflarını filtreleriyle kaydetme ve yeniden sıralama

**Alınabilir model:** Seerr [DiscoverSlider](https://github.com/seerr-team/seerr/blob/dca1af6af26312ec13ffb4920e5dd948049962ad/server/entity/DiscoverSlider.ts) `order/enabled/title/data` alanlarını; [CreateSlider](https://github.com/seerr-team/seerr/blob/dca1af6af26312ec13ffb4920e5dd948049962ad/src/components/Discover/CreateSlider/index.tsx) oluşturma akışını gösteriyor. Bizdeki Keşfet'e “90 dakika altı izleneceklerim”, “yeni yönetmenler” gibi kaydedilebilir raflar eklenebilir.

**Uyarlama:** TypeORM/entity katmanı aynen taşınmaz; mevcut yerel ayar/katalog deposunda sürümlü ve doğrulanmış küçük şema. Filtre kaydı ile anlık sonuç snapshot'ı ayrıdır. **Kabul:** yeniden açılışta sıra/kapalı raf korunur; sağlayıcının desteklemediği filtre açıkça belirtilir. **P1 / orta; MIT model uyarlama adayı.**

### F10 — “Bunu istemiyorum” geri bildirimini nedenine göre kullanma

**Dayanak:** SuggestArr'ın izlenmiş/gösterilmiş/owned ayrımı ve Reelix'in niyet rafinesi. Bizde gizleme/feedback zaten var; ek değer “izledim”, “şu an istemiyorum”, “bu tema bana göre değil”, “yanlış eşleşme” nedenlerini ayırmak.

**Davranış:** O an istememek kalıcı zevk nefreti olmaz; yanlış metadata geri bildirimi kişilik modelini bozmaz; her karar geri alınabilir. **Kabul:** geçici erteleme süresi bitince aday döner, kalıcı gizleme korunur, filtre değişikliği eski geri bildirimin kapsamını yanlış genişletmez. **P1 / orta; veri/ürün kararı bize ait.**

### F11 — Az puanlı yeni profilde aşırı kesinleşmeyen öneri

**Kaynak:** Taste Matcher küçük grupları genel ortalamaya çeken profil hesabı; Letterboxd projesi [kişisel model](https://github.com/victorverma3/Letterboxd-Movie-Recommendations/blob/13ab7f17c97142facc3acfa993df9a860b78f726/backend/model/personalized_model.py) ayrı eğitim/ölçüm içeriyor. Bunlar kural sırasıyla öğrenilmiş modelin karşılaştırılabileceği iki yol.

**Öneri:** İlk birkaç filmden “sen kesin bunu seviyorsun” çıkarma; mevcut quiz ve güven etiketlerini gerçek örnek sayısı/metadata kapsamıyla birleştir. Öğrenilmiş modeli yalnız yeterli veri ve uygun holdout değerlendirmesi varsa etkinleştir. **Kabul:** tek izlenen film beş kez tekrar edilince güven beş farklı film gibi artmaz; kötü model basit sıralamanın yerine otomatik geçmez. **P1 / orta; R837 tekrar-izleme kökünü yeniden bug saymıyor.**

### F12 — Kişisel yorumdan çıkarılan tercihi kullanıcı tarafından yönetilen belleğe dönüştürme

**Örnek:** Open Filmly [yerel personal memory servisi](https://github.com/doctoroyy/open-filmly/blob/9d3c95487b242c07df8ed725afb09434d2d52c02/lib/services/intelligence/personal_memory_service.dart) izleme olaylarını varlık ID'siyle tutuyor; bizim yorum analizi/tercih kaydı zaten mevcut. Buradan alınacak fikir ham olay, model yorumu ve kullanıcının kabul ettiği tercihi ayrı saklamak.

**Ürün davranışı:** “Yavaş tempoyu bazen seviyor” çıkarımı → hangi yorumdan geldi → kabul et/düzelt/sil. Çıkarımın silinmesi ham kullanıcı yorumunu silmez. Yeni öneri için etkin kabul edilmiş tercihler gösterilir; tüm geçmiş yorumlar her istekte gönderilmez. **Kabul:** reddedilen çıkarım öneri gerekçesine geri dönmez, kaynak değişimi versiyonlanır. **P1 / orta; özgün uygulama.**

## 5. Tasarım ve medya deneyimi için sekiz geliştirme

Bu bölüm, yukarıdaki motorların kullanıcıya nasıl sunulacağını anlatır. **Üçüncü taraf ekranları resmi depo görüntülerinden incelendi; uygulamalar burada kurularak canlı test edilmedi.** Görüntüler görsel hiyerarşiyi gösterir, etkileşim başarısını kanıtlamaz. [11 görüntünün kaynak/hash kaydı](research839/visual-review.json).

### D01 — Yazı alanı, kaynak tepsisi ve eylem alanını tek düzen içinde toplama

BrowserOS'un kaynak kartları ve Nanobrowser [Composer](https://github.com/nanobrowser/nanobrowser/blob/19dc8e8a9be6ed06c0ef9ec7de8d84bf6a88c458/src/side-panel/Composer.tsx) / [Cards](https://github.com/nanobrowser/nanobrowser/blob/19dc8e8a9be6ed06c0ef9ec7de8d84bf6a88c458/src/side-panel/Cards.tsx) bileşenleri referans. Bizde altta tek yazı alanı, üstünde ekler/kapsam, onun üzerinde konuşma; onay bekleyen kart belirgin ama odağı zorla çalmayan bir yapı öneririm. Sabit/hover/gönder/iptal durumları aynı token'larla çizilir. **Kabul:** dar pencerede kaynak kaldırma, gönderme ve Stop ulaşılır; kullanıcı yazarken gelen kart klavye odağını çalmaz. **P1 / orta.**

### D02 — “Yanıt / kaynaklar / yapılanlar / çıktı” arasında net ayrım

[Vane ekranında](https://github.com/ItzCrazyKns/Vane/blob/348feca3e378fb4157b217724ed508dc707f853f/.assets/vane-screenshot.png) kaynak kartları üstte, katlanabilir araştırma süreci ortada, yanıt ayrı. [BrowserOS görev detayında](https://github.com/browseros-ai/BrowserOS/blob/b04405ad9826bde42cd55d2aeab17096a5fb12e3/docs/images/browserclaw--task-detail.png) süre, son URL ve zaman çizgisi ayrı. Bizde varsayılan kısa sonuç, isteyene açılan kanıt ve adım geçmişi; uzun tool JSON'ları ana sohbete taşmaz. **Kabul:** başarısız adım kaybolmaz; “tamamlandı” ile “onay bekliyor” metin/ikonla da ayrılır. **P1 / orta.**

### D03 — Konuşmanın içinde gerçek film kartları

Opal [ai_chat](https://github.com/debpalash/Opal/blob/d56c55e323a83b40ae210bfaca3d5e2da2688ae3/src/services/ai_chat.zig) sonuç/confirmation state içeriyor. Bizde asistan beş filmi düz madde olarak yazmak yerine doğrulanmış katalog ID'li küçük kart gösterebilir: afiş, yıl/süre, kısa kişisel gerekçe, ayrıntı ve izleneceklere ekleme. Oynat eylemi gerçekten hazır bir kaynak ister; asistan başlık verdi diye video bulunmuş sayılmaz. **Kabul:** metinle kart farklı film göstermemeli; silinen/eski ID tekrar aranır. **P1 / orta; Opal kodu kopyalanmaz.**

### D04 — İki veya üç film için karar odaklı karşılaştırma

Reelix'in hard/soft tercih ayrımı ve Seerr'in [TitleCard](https://github.com/seerr-team/seerr/blob/dca1af6af26312ec13ffb4920e5dd948049962ad/src/components/TitleCard/index.tsx) bilgileri tasarım dayanağı. Bu karşılaştırma paneli incelenen ürünlerde aynen bulundu iddiası değil, bizim mevcut film detayları için sentez önerisidir. Süre, tempo kanıtı, kişisel benzerlik, izleme durumu ve spoiler içermeyen gerekçe yan yana; veri olmayan hücre “bilinmiyor”. **Kabul:** kıyas puanı model olasılığı gibi sunulmaz; tek tuşla birini seçme ve aramaya dönme mümkün. **P2 / orta.**

### D05 — Film ayrıntısında bir ana eylem ve sakin ikincil eylemler

[Reiverr detay görüntüsü](https://github.com/aleksilassila/reiverr/blob/dbdd50dfa8366a0c311b21ba513aabbbc0f28c87/images/screenshot-1.png) başlık/özet/oynatma hiyerarşisini iyi kuruyor. Bizde en üstte film kimliği, kısa karar bilgisi ve mevcut duruma uygun ana eylem; yorum analizi, kişi detayları, kaynaklar ve teknik işlemler ikinci katmanda. Devasa hero ekranı boşuna kaplamamalı; daha kısa uyarlama gerekir. **Kabul:** 100%/150% Windows DPI ve dar pencerede başlık ile ana eylem ilk görünümde kalır. **P1 / orta; görsel fikir bağımsız uygulanır.**

### D06 — Ana sayfayı “devam et → sana uygun → keşfet” akışına göre düzenleme

[Opal home](https://github.com/debpalash/Opal/blob/d56c55e323a83b40ae210bfaca3d5e2da2688ae3/assets/readme/ai.webp) arama ve resume'u, [Open Filmly home](https://github.com/doctoroyy/open-filmly/blob/9d3c95487b242c07df8ed725afb09434d2d52c02/docs/screenshots/home.png) zaman/progress bilgili devam kartlarını öne koyuyor. Bizde mevcut resume ve Keşfet yeniden bağlanabilir: son izlenenler, sonra kişisel raf, sonra genel katalog. İzleme ilerlemesi ile AI iş ilerlemesi aynı yüzde çubuğunu paylaşmamalı. **Kabul:** kaynak erişilemezse dürüst durum; kart kullanıcıyı farklı medyaya atmaz. **P1 / orta.**

### D07 — Filtreler ve sonuç kartlarında iki ayrı yoğunluk seviyesi

[Seerr görüntüsü](https://github.com/seerr-team/seerr/blob/dca1af6af26312ec13ffb4920e5dd948049962ad/public/preview.jpg) okunaklı raf/kart düzeni; [Opal browse](https://github.com/debpalash/Opal/blob/d56c55e323a83b40ae210bfaca3d5e2da2688ae3/assets/readme/browse.webp) daha yoğun katalog; [Reiverr rafları](https://github.com/aleksilassila/reiverr/blob/dbdd50dfa8366a0c311b21ba513aabbbc0f28c87/images/screenshot-2.png) daha büyük posterler gösteriyor. Bizde “göz at” görünümünde ferah kart ve kısa gerekçe, “kütüphane” görünümünde yoğun grid öneririm. Her karta bütün rozetleri yığmak yerine ayrıntı açılır. **Kabul:** afiş oranları sabit, uzun Türkçe başlıklar düzeni bozmaz, seçili filtreler görünür. **P1 / orta.**

### D08 — Oynatıcıda bağlamsal yardım, tam ekran form yığını yerine küçük panel

[Opal player görüntüsü](https://github.com/debpalash/Opal/blob/d56c55e323a83b40ae210bfaca3d5e2da2688ae3/assets/readme/player.webp) alt kontrol şeridinde track/altyazı seçeneklerini topluyor; [Open Filmly detail](https://github.com/doctoroyy/open-filmly/blob/9d3c95487b242c07df8ed725afb09434d2d52c02/docs/screenshots/tv-detail.png) sezon/episode ayrımını okunur tutuyor. Bizde “bu replik”, “öncesini hatırlat”, “bu aralıkta ara” gibi küçük bağlam eylemleri; uzun araştırma sonucu ayrı genişletilir. **Kabul:** panel altyazıyı veya native video kontrolünü örtmez, Escape/odak/geri davranışı tutarlı, oynatma konumu korunur. **P1 / orta-büyük; gerçek Windows composition testi şart.**

## 6. Tasarımlar hakkında açık değerlendirmem

| Referans | Güçlü tarafı | Bizde nasıl uyarlanmalı? | Aynen taşımayacağım taraf |
|---|---|---|---|
| BrowserOS | Kaynak bağlamı ve yapılan iş görünür; görev detayında replay/zaman çizgisi | Küçük bağlam tepsisi + açılabilir iş geçmişi | Ham araç isimleri/argümanları sıradan kullanıcının önüne koymak; browser'ı sürekli daraltan paneli varsayılan yapmak |
| Vane | Kaynak, araştırma ve yanıtı ayıran sade okuma düzeni | Letterboxd analizinde kanıtlı görüş kartları ve kısa sonuç | Her yanıtta büyük medya sütunu veya çok sayıda dış kaynak kartı |
| Opal | Home'da “ne izleyelim?” girişi ve devam etme; player merkezli yapı | Asistanı film seçimi/oynatma akışına gerçek ID'lerle bağlamak | Küçük ekranlarda aşırı sıkışan üst navigasyon ve çok sayıda minik kontrol |
| Reiverr | Güçlü afiş/arka plan hiyerarşisi, az ve anlaşılır eylem | Film ayrıntısında sakin tipografi ve bir ana eylem | Neredeyse tam ekran kaplayan hero; tüm içeriği aşağı itmek |
| Seerr | Tutarlı poster rafları ve görünür durum etiketleri | Keşfet raflarının kaydı/sırası ve katalog kartlarının ortak dili | Sunucu yönetimi/request admin karmaşıklığını bireysel medya uygulamasına taşımak |
| Open Filmly | Devam etme kartlarında zaman; dizi detayında sezon ve 16:9 bölüm görselleri | Son izleme ve bölüm bağlamını kaybetmeden devam | Açık tema/Flutter görünümünü grafit/amber ürüne varsayılan kontrol olarak taşımak |

Bizim tasarım yönümüz değişmiyor: grafit arka plan, tek amber vurgu, tutarlı tipografi, EN/TR etiketler. Başka ürünün ekranını boyamak yeterli değil; mevcut uygulamanın kartları/menüleri/odak davranışı ile ortak bileşenler kullanılmalı. Tasarım önerileri için yeni ekran veya mockup bu tur üretilmedi; kaynak görselleri incelenerek uygulama yönü raporlandı.

## 7. Kod almak istesek hangi dosyadan başlayalım?

| Sıra | Dosya/küme | Somut çıkarım | Mevcut yerel temas noktası | Entegrasyon maliyeti |
|---|---|---|---|---|
| 1 | Nanobrowser `guards.ts` | Sonuç imzası, etkisiz tekrar, erken durdurma | `assistant-provider.js`, `assistant-run-steps.js` | Küçük; storage/browser ayrımı yapılmalı |
| 2 | Nanobrowser `compaction.ts` | Tool gruplarını bozmadan bağlam sıkıştırma + ledger | `assistant-thread-store.js`, kaynak manifesti | Orta; token ölçümü/geri çağırma sözleşmesi |
| 3 | SuggestArr `ai_search_service.py` | Sorgu, başlık çözümleme, geçmiş filtresi, gerekçe hattı | `media-discovery-service.js`, assistant araçları | Orta; Python'dan Node'a port, sağlayıcı uyarlaması |
| 4 | Taste Matcher `buildTasteModel/filmSim/neighborComponent/scoreItem` | Açıklanabilir yerel watchlist sıralaması | `media-taste.js`, katalog/watchlist | Orta; saf fonksiyonlara ayırma, doğru kimlik/ölçek |
| 5 | Seerr `DiscoverSlider`, `CreateSlider`, filter panel | Kaydedilebilir Keşfet rafı modeli | `media-discovery-ui.js`, yerel ayarlar | Orta; React/TypeORM katmanı alınmaz |
| 6 | Vane `search/types`, researcher events | Araştırma modu/ilerleme/kaynak/çıktı sözleşmesi | `assistant-web-research.js`, workspace | Orta; SearxNG/Next bütününü kurmak gereksiz |
| 7 | Stagehand observe/extract/cache services | Şemalı sayfa verisi ve geçerlilik ayrımı | `assistant-browser-research.js`, main WebContents | Büyük; önce salt okunur sınırlı pilot |
| 8 | Letterboxd personal model/recommender | Basit modelle ölçümlü offline karşılaştırma | Mevcut profil verisinin sentetik/offline kopyası | Orta/büyük; Python veri/ML bağımlılığı ve veri kapsamı |

“Alınabilir” seçilen parçanın lisans yönünden aday olduğu anlamına gelir; yapıştırıp çalışacağı veya kaliteyi artırdığı kanıtlanmadı. Önce kaynak diff'i, alt dosya lisansı, kullanılan yardımcı fonksiyonlar ve bağımlılık yüzeyi incelenmeli; sonra küçük adaptörle hedefli kabul yapılmalı. Ortak tercih: uygulama süreç sınırları ve CSP korunur; profil/anahtar tarayıcı içeriğine açılmaz.

## 8. Önceliklendirme: önce hangi beş paket?

1. **Asistanın çalışma kalitesi:** A03 + A04 + D02. Tekrarı kesen guard, güvenilir eylem defteri ve anlaşılır durum alanı. Kullanıcı farkını hızlı görür; uygulamadaki tüm araçlara yarar.
2. **Konuşarak film seçme:** F01 + F02 + D03. Doğal dil → görünür filtreler → gerçek film kartları. Aynı sorunun düz metin cevabından somut keşif akışına geçiş.
3. **Letterboxd watchlist motoru:** F03 + F04 + F05 + F11. Yerel ve açıklanabilir sıralama, kullanıcı öncelikleri ve küçük örnekte kontrollü güven. LLM her sıralamada şart değil.
4. **Yorum analizi ve kaynak deneyimi:** A01 + A05 + F08 + D01. Birkaç seçili kaynaktan görüş haritası; her iddianın orijinal yoruma dönmesi.
5. **Keşfet'in kalıcı kişisel hali:** F06 + F09 + F10 + D06–07. Çeşitli, tekrarı azaltan, nedenini bilen ve kaydedilebilen raflar.

Sahne semantiği, ekran anlama ve genel browser otomasyonu sonraki kontrollü pilotlardır. Bilgisayarın güçlü olması, yeni ML/model veya browser katmanının veri doğruluğu ve native uyum maliyetini ortadan kaldırmıyor. Önce sentetik/izinli corpus'ta alaka, kullanıcı adımı, gecikme ve model maliyeti ölçülmeli; sayı artırmak için test yazılmamalı.

## 9. Dikkat çeken gerçek sınırlamalar

- **Luna:** Hedef URL bu tur 404 verdi; deponun silindiği/özel olduğu/taşındığı kesinleştirilmedi. [R581](BROWSER_BUG_REPORT_581.md) gibi tarihsel inceleme bugünün güncel kaynak kanıtı değildir.
- **Reelix:** Repo ağacında kök yeniden kullanım lisansı doğrulanamadı; README rozeti veya kamusal erişim lisans izni sayılmadı. Kod/model doğrudan alınacak listeden çıkarıldı.
- **Open Filmly:** Kök lisans doğrulanamadı; alt paketlerin LICENSE dosyaları üst projeye izin vermez. Geniş AI medya anlayışı roadmap'i çalışan kalite kabulü değildir. Gerçekte okunan spoiler filtresi basit zaman kesimi; “semantic” yerel vektör hashed lexical yöntemdir. Görsel sahne anlama varmış gibi sunulmadı.
- **Reiverr:** `pushed_at` yeni, ama incelenen default HEAD commit tarihi 2025. Bakım değerlendirmesinde yalnız son push veya yıldız sayısı kullanılmadı.
- **README ile kod farkları:** Letterboxd Movie Recommendations kişisel modelinde RandomForest görüldü; genel ürün açıklamasındaki başka model ifadeleri bu dosyaya mal edilmedi. Taste Matcher README'si Electron v3 paketini tarif etse de incelenen 16 dosyalık ağaçta `package.json` ve Electron giriş dizini yok; tam çalışır masaüstü paketi diye önerilmiyor. Alınabilir aday, bağımsızlaştırılacak hesap kodudur.
- **Browser Use:** Judge bir model değerlendirmesidir, garantili doğrulayıcı değil. İncelenen Python sözleşmesi >=3.11; uygulamanın desteklediği Python 3.10 ortamına tüm paketi doğrudan eklemek uyumlu sayılmaz.
- **Paketleme:** Chrome extension, Chromium fork, Zig/mpv, Flutter/VLC ve Python/CDP projelerinin hepsi Electron'a paket olarak takılamaz. En pratik ilk kod adayları TS/Node saf mantığı ve mevcut servislerimize taşınan küçük hesaplar.
- **Veri:** Public repo lisansı Letterboxd yorumlarını, TMDB verilerini veya bir modelin eğitim dataset'ini yeniden dağıtma izninin yerine geçmez. Kullanıcının kendi importları, mevcut izinli sayfa akışı ve doğru sağlayıcı koşulları tercih edilmeli. README'lerde görülebilen örnek kimlik bilgileri kullanılmadı, rapora taşınmadı.

## 10. Doğrulama ve teslim sınırı

Resmi GitHub metadata/commit/tree, seçilmiş lisans/kaynaklar ve resmi görüntüler salt okunur incelendi. Vane'in Perplexica adresinden taşındığı API `full_name/url` ile kaydedildi. Görseller yalnız inceleme önbelleğinde; ürün/Git içine kopyalanmadı. Kaynak dosyalarının tamamı değil URL/hash/metadata yayımlanıyor. 30 kimlik: A01–A10, F01–F12, D01–D08; öneriler uygulanmadı, yeni bug sayısı 0.

Hiçbir upstream uygulama kurulmadı/çalıştırılmadı, yeni kod/dependency/lockfile/ayar değişikliği yapılmadı. Canlı model kalitesi, Letterboxd hesabı, öneri doğruluğu, native Windows görüntüsü, GPU/DRM ve etkileşim akışlarının uçtan uca kabulü bu araştırma ile kanıtlanmış değildir. `start.bat`/`install.bat`/tam test/CI çalıştırılmadı; yalnız belge, JSON, hash, bağlantı ve diff kontrolü yapılır. Önceki raporlar ve kişisel çalışma dosyaları korunur.
