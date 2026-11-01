# R841 asistan alt araştırması — koddan çıkan somut fırsatlar

1 Kasım 2026. Yerel taban `e66228403b6d0ce11c26a3e7c3d61c77c650d375`. **25 ayrı uygulama fırsatı: 17 yeni mekanizma adayı, 8 eski önerinin kodla derinleştirilmesi.** Bunlar yeni bug sayısı veya teslim edilmiş özellik değildir. Çoklu kaynak, observe/act, döngü guardı, eylem defteri, araştırma dosyası, derinlik modu, genel workflow, sahne semantiği, spoiler ve vision fikirleri yeniden keşif sayılmadı.

AGENTS, YENI-BILGISAYAR, güncel devir1447, R838/R839/R840 ve 24Ekim asistan araştırması okundu. Kaynak eski “bizde yok” iddiası bugüne taşınmadı: kalıcı/dallanan sohbet, gerçek stream/fallback, kaynak kimliği, tool-result sayfalama, proposal ve job ledger zaten mevcut.

## Kaynak edinimi ve lisans kararı

| Resmî kaynak | Sabit HEAD | Lisans ve gerçek edinme yolu |
|---|---|---|
| [LibreChat-AI/LibreChat](https://github.com/LibreChat-AI/LibreChat) | `f4154b649efa37e1345ccc517a4d8d1ed2178c82` | MIT; küçük model/UI davranışı portu |
| [Mintplex-Labs/anything-llm](https://github.com/Mintplex-Labs/anything-llm) | `9caf2b4c29d9782f1cba4142be2525ebfa0ecd43` | MIT; küçük Node model ve reranker deseni |
| [lobehub/lobehub](https://github.com/lobehub/lobehub) | `4441d89c9ea0aebecdcb0a0d3d2327cc422ddf98` | LobeHub Community License; Apache tabanı ek ticari türev dağıtım koşulu içerir. Bağımsız davranış uygulaması veya uygun lisanslı kullanım; genel Apache sanılmadı |
| [khoj-ai/khoj](https://github.com/khoj-ai/khoj) | `ae229ca894c0b80ad84664afcfdde523b5e87057` | AGPL-3.0; arayüz referansı veya koşullarına uygun kod portu |
| [CherryHQ/cherry-studio](https://github.com/CherryHQ/cherry-studio) | `db125b265ecb6658d3bc99f2a65004605c237cab` | AGPL-3.0; kod portu koşullarıyla planlanabilir, fikir dışlanmadı |
| [iOfficeAI/AionUi](https://github.com/iOfficeAI/AionUi) | `11cd2a9a20d1e033157636efc570b41384c66d85` | Apache-2.0; seçilmiş IPC/preview/capability desenleri |
| [mastra-ai/mastra](https://github.com/mastra-ai/mastra) | `e219e6d94d3ec7ddb1d8b4d5af311ee6f6075e58` | Kök karma; bu rapordaki non-ee core Apache-2.0, ee dışarıda |
| [letta-ai/letta](https://github.com/letta-ai/letta) | `8816d3a8516893bfdc0fa14bfb1235226012e295` | Apache-2.0; güncel geliştirme deposu değil, resmî yönlendirme kaydı |
| [letta-ai/letta-code](https://github.com/letta-ai/letta-code) | `ebd590b11bef049884b923da5ed3f5d087af81e0` | Apache-2.0; güncel gerçek harness/yerel model kodu |

LibreChat ve LobeHub eski adresleri resmî metadata ile canonical adlara çözüldü. Letta eski ağaç15dosya: README güncel kaynağı letta-code olarak gösterdi; tarihsel arşiv uygulama diye sunulmadı. Varsayılan HEAD kararlı release değildir. API NOASSERTION tek başına lisans yok anlamına gelmez: LobeHub ve Mastra kök LICENSE metni okundu. Lisans kaydı seçilmiş dosyalardır; bütün transitive bağımlılıklar, modeller veya dış veriler denetlenmiş değildir.

Kaynak kaydı: [repositories.json](repositories.json), **73 indirilen dosya** için [source-manifest.json](source-manifest.json). Manifest metadata/README/LICENSE dosyalarını da içerir; hepsi uygulama kodu değildir. Ham upstream kodu ignored araştırma önbelleğinde; yayımlananlar yalnız not, URL, SHA ve metadata. Canonical hash UTF-8 BOM kaldırma + CRLF/CR→LF; raw hash gerçek indirilen byte dizisidir. [Başarısız çağrılar](retrieval-failures.json) ve [yerel taban](local-baseline.json) ayrı kayıtlıdır.

## Uygulama kartları

### A841-01 — Sürümlü görev talimatları: taslak ile etkin profili ayır

**Durum:** NEW. **Efor:** M. **Opsiyonel pilot:** hayır. **Mevcut yol:** `src/assistant-provider.js:run; src/assistant-settings.js:resolve`. Sistem talimatı run içinde sabit metindir; ayarlar sağlayıcı/model çözer. Kullanıcıya ait revizyonlu görev talimatı deposu bu yollarda yok.

**Gerçek kaynak ve akış:** LibreChat etkin productionId ile en yeni sürümü ayrı işaretliyor; AnythingLLM kayıtlı slash adı, açıklama ve prompt tutuyor. Film yorumu, teknik video özeti ve dublaj kontrolü için kullanıcı kendi kısa görev profilini kaydedebilsin. Yeni düzenleme önce taslak olsun; eski sohbetin hangi revizyonu kullandığı görünür kalsın.

- [LibreChat-AI/LibreChat · client/src/components/Prompts/display/PromptVersions.tsx](https://github.com/LibreChat-AI/LibreChat/blob/f4154b649efa37e1345ccc517a4d8d1ed2178c82/client/src/components/Prompts/display/PromptVersions.tsx) — `f4154b649efa37e1345ccc517a4d8d1ed2178c82`, `PromptVersions / VersionCard / group.productionId`.
- [Mintplex-Labs/anything-llm · server/models/slashCommandsPresets.js](https://github.com/Mintplex-Labs/anything-llm/blob/9caf2b4c29d9782f1cba4142be2525ebfa0ecd43/server/models/slashCommandsPresets.js) — `9caf2b4c29d9782f1cba4142be2525ebfa0ecd43`, `SlashCommandPresets.formatCommand/create/getUserPresets`.

**Entegrasyon:** MIT seçilmiş veri modeli/DOM uyarlaması; tüm React/Mongo/Prisma uygulaması alınmaz. Kullanıcı promptu uygulama yetkisini veya sabit tool politikasını değiştirmez. **Kullanıcı deneyimi:** Profil menüsünde Etkin v2, taslak v3 ve önceki sürüme dön eylemi.

**Windows/Electron/CSP:** EN/TR etiketleri, profil metninde UTF-8; şablondan inline script üretilmez. **Gelecek kabul örneği:** Aynı sohbeti v2 ile açınca sonradan yazılan v3 sessizce kullanılmaz; seçilen sürüm kaydı görünür.

**Kaynakta gözlenen kesin parça:** PromptVersions productionId ile latest/production ayrımını çiziyor; slash modeli prompt kaydı tutuyor. Backend prompt publish/rollback işlemi bu kartta doğrulanmadı. **Ürün sentezi ayrımı:** UX, Windows/Electron entegrasyonu ve kabul örneği bu ürün için önerilen sentezdir; upstreamde aynen var veya çalıştırılmış sayılmaz.

**Olgunluk sınırı:** Kaynak kodu incelendi; upstream çalışma zamanı ve ürüne entegrasyon denenmedi.

### A841-02 — Kullanıcının düzenlediği hızlı komut kitaplığı

**Durum:** NEW. **Efor:** S. **Opsiyonel pilot:** hayır. **Mevcut yol:** `src/renderer/assistant-workspace.js; src/assistant-provider.js:run`. Asistan UI ve sabit uygulama araçları var; kullanıcıya ait ad/açıklama/prompt CRUD modeli incelenen sağlayıcı yolunun parçası değil.

**Gerçek kaynak ve akış:** SlashCommandPresets komut adını normalize ediyor, kullanıcı ile adı birlikte tekilleştiriyor ve prompt/açıklama döndürüyor. Bu desen en sık tekrar edilen “bu videoda gerekçeleri zamanlarıyla çıkar” sorusunu yeniden yazmayı azaltır. Bu, çok adımlı iş akışını otomatik çalıştırmak değil, gönderilmeden önce düzenlenebilen istem taslağıdır.

- [Mintplex-Labs/anything-llm · server/models/slashCommandsPresets.js](https://github.com/Mintplex-Labs/anything-llm/blob/9caf2b4c29d9782f1cba4142be2525ebfa0ecd43/server/models/slashCommandsPresets.js) — `9caf2b4c29d9782f1cba4142be2525ebfa0ecd43`, `SlashCommandPresets.formatCommand/create/getUserPresets`.

**Entegrasyon:** MIT küçük model referansı/port; mevcut thread deposundan ayrı yerel preset JSON kaydı. Türkçe komut adlarında upstream ASCII sınırlaması aynen taşınmamalı. **Kullanıcı deneyimi:** Yazı alanında / ile aranan kayıtlar; seçince nihai metin ve kaynak kapsamı önizlenir.

**Windows/Electron/CSP:** Windows klavyesi, Türkçe ı/ş, IME ve dar pencere kontrolü gerekir. **Gelecek kabul örneği:** Komut seçimi tek başına model çağrısı veya dublaj başlatmaz; düzenlenen metin gönderilince tek soru oluşur.

**Kaynakta gözlenen kesin parça:** SlashCommandPresets formatCommand, create, getUserPresets, update, delete fonksiyonları ad/prompt/açıklama CRUDunu içeriyor. **Ürün sentezi ayrımı:** UX, Windows/Electron entegrasyonu ve kabul örneği bu ürün için önerilen sentezdir; upstreamde aynen var veya çalıştırılmış sayılmaz.

**Olgunluk sınırı:** Kaynak kodu incelendi; upstream çalışma zamanı ve ürüne entegrasyon denenmedi.

### A841-03 — Sohbete bağlı çalışma klasörü ve çıktı hedefi

**Durum:** NEW. **Efor:** M. **Opsiyonel pilot:** hayır. **Mevcut yol:** `src/assistant-thread-store.js:cleanThread; src/assistant-context-manifest.js`. Konuşma sourceKey ve dallarla saklanır; cleanThread içinde kullanıcı seçilmiş çalışma klasörü alanı bulunmaz.

**Gerçek kaynak ve akış:** AionUi native dizin seçiciden dönen yolu konuşmanın extra.workspace alanına bağlayıp konuşma ve geçmişi tazeliyor. Medya projesi için asistan raporları ve dışa aktarımları tek kullanıcı klasöründe tutmak anlamlıdır. Kaynak medya dosyasının klasörünü otomatik yazılabilir yetki olarak kabul etmek yerine ayrı ve görünür çıktı hedefi sunulur.

- [iOfficeAI/AionUi · packages/desktop/src/renderer/hooks/file/useWorkspaceSelector.ts](https://github.com/iOfficeAI/AionUi/blob/11cd2a9a20d1e033157636efc570b41384c66d85/packages/desktop/src/renderer/hooks/file/useWorkspaceSelector.ts) — `11cd2a9a20d1e033157636efc570b41384c66d85`, `useWorkspaceSelector`.

**Entegrasyon:** Apache-2.0 yaşam döngüsü portu; genel shell veya dosya ağacı ajanı gerekmez. Yazma yalnız tanımlı export araçlarından ve main IPC üzerinden. **Kullanıcı deneyimi:** Sohbet başlığında çalışma klasörü ve Değiştir; göreli çıktı adlarıyla dosya listesi.

**Windows/Electron/CSP:** UNC, sürücü harfi, uzun yol, Türkçe klasör, reparse-point ve native picker kabulü gerekir. **Gelecek kabul örneği:** Klasör seçimi iptal edilince hedef değişmez; klasör başka diske taşındıysa kaydetme hatası sahte başarı olmaz.

**Kaynakta gözlenen kesin parça:** useWorkspaceSelector native directory sonucunu conversation.extra.workspace alanına yazıyor ve cache/event yeniliyor; yazma yetkisi politikası bu hookta yok. **Ürün sentezi ayrımı:** UX, Windows/Electron entegrasyonu ve kabul örneği bu ürün için önerilen sentezdir; upstreamde aynen var veya çalıştırılmış sayılmaz.

**Olgunluk sınırı:** Kaynak kodu incelendi; upstream çalışma zamanı ve ürüne entegrasyon denenmedi.

### A841-04 — Açıkça kaydedilen ve düzenlenebilen asistan belleği

**Durum:** OLD-DEEPENING:R839-F12. **Efor:** M. **Opsiyonel pilot:** hayır. **Mevcut yol:** `src/assistant-thread-store.js; src/assistant-settings.js`. Sohbet geçmişi kalıcı; model ayarları ve ayrı film zevk verisi var. Bu iki şey genel asistan için kullanıcı tarafından yönetilen olgu belleği değildir.

**Gerçek kaynak ve akış:** R839-F12deki kabul/düzelt/sil fikrinin genel asistana taşınmasıdır; yepyeni fikir sayılmadı. AnythingLLM Memory.create/update/delete ile gerçek kayıt işlemlerini, Khoj UserMemory satır üstü düzenleme/silmeyi gösteriyor. “Yanıtta önce kısa sonuç istiyorum” gibi kullanıcının açık kaydını sohbetten bağımsız tutmak mümkün. Upstream UI callback sonrası başarı toastı gösteriyor; bizim entegrasyon başarıyı main yazma sonucundan sonra göstermeli. Bellek çıkarımı varsayılan sessiz arka plan işi yapılmamalı.

- [Mintplex-Labs/anything-llm · server/models/memory.js](https://github.com/Mintplex-Labs/anything-llm/blob/9caf2b4c29d9782f1cba4142be2525ebfa0ecd43/server/models/memory.js) — `9caf2b4c29d9782f1cba4142be2525ebfa0ecd43`, `Memory.create/update/delete/promoteToGlobal/demoteToWorkspace`.
- [khoj-ai/khoj · src/interface/web/app/components/userMemory/userMemory.tsx](https://github.com/khoj-ai/khoj/blob/ae229ca894c0b80ad84664afcfdde523b5e87057/src/interface/web/app/components/userMemory/userMemory.tsx) — `ae229ca894c0b80ad84664afcfdde523b5e87057`, `UserMemory / handleUpdate / handleDelete`.

**Entegrasyon:** MIT model uyarlaması ve AGPL Khoj tasarım referansı; Khoj kodu alınırsa ilgili AGPL dağıtım yükümlülükleri planlanır. **Kullanıcı deneyimi:** Belleğim panelinde metin, kapsam, oluşma tarihi; kaydet/düzenle/sil.

**Windows/Electron/CSP:** Yerel userData, atomik yazma, kişisel belleğin Git/log dışında kalması, EN/TR arayüzü. **Gelecek kabul örneği:** Kaydı silen kullanıcı sonraki isteğin bağlamında aynı olgunun gönderilmediğini görebilir.

**Kaynakta gözlenen kesin parça:** Memory modeli create/update/delete sunuyor; Khoj UserMemory edit/delete callbacklerini çağırıyor. Genel asistan bellek onayı bizim önerdiğimiz ürün politikasıdır. **Ürün sentezi ayrımı:** UX, Windows/Electron entegrasyonu ve kabul örneği bu ürün için önerilen sentezdir; upstreamde aynen var veya çalıştırılmış sayılmaz.

**Olgunluk sınırı:** Kaynak kodu incelendi; upstream çalışma zamanı ve ürüne entegrasyon denenmedi.

### A841-05 — Belleğin kaynak/proje ve genel kapsamını açık ayır

**Durum:** NEW. **Efor:** M. **Opsiyonel pilot:** hayır. **Mevcut yol:** `src/assistant-context-manifest.js; src/assistant-thread-store.js:sourceKey`. Kaynak kimliği ve sohbet kapsamı mevcut; genel asistan olgularının kaynaktan genele terfi modeli bu dosyalarda yok.

**Gerçek kaynak ve akış:** AnythingLLM workspace/global kapsamları, ayrı limitler, promoteToGlobal ve demoteToWorkspace işlemleri kullanıyor. Bir karakterin adını o film için hatırlamak ile kullanıcının cevap tercihini bütün uygulama için hatırlamak aynı şey değildir. Kapsam değişikliği görünür işlem olmalı; yalnız film sohbetinde yazılan tahmin tüm videolara taşınmamalı. Upstream limit5/20 ürün ihtiyacına göre ölçülmeli, aynen standart ilan edilmemeli.

- [Mintplex-Labs/anything-llm · server/models/memory.js](https://github.com/Mintplex-Labs/anything-llm/blob/9caf2b4c29d9782f1cba4142be2525ebfa0ecd43/server/models/memory.js) — `9caf2b4c29d9782f1cba4142be2525ebfa0ecd43`, `Memory.create/update/delete/promoteToGlobal/demoteToWorkspace`.

**Entegrasyon:** MIT saf kapsam modeli portu; mevcut sourceKey/revision kimliğiyle bağlama. **Kullanıcı deneyimi:** Bellek kartında Yalnız bu kaynak / Tüm sohbetler seçimi ve kapsam taşıma önizlemesi.

**Windows/Electron/CSP:** Dosya yolu yerine opaque kaynak ID; Windows büyük/küçük harf eşlemesi kaynağı birleştirmemeli. **Gelecek kabul örneği:** Kaynak A karakter notu kaynak B isteğine eklenmez; kullanıcı açıkça genele taşırsa uygulanır.

**Kaynakta gözlenen kesin parça:** Memory modeli workspace/global, promoteToGlobal/demoteToWorkspace ve kapsam limitlerini içeriyor. **Ürün sentezi ayrımı:** UX, Windows/Electron entegrasyonu ve kabul örneği bu ürün için önerilen sentezdir; upstreamde aynen var veya çalıştırılmış sayılmaz.

**Olgunluk sınırı:** Kaynak kodu incelendi; upstream çalışma zamanı ve ürüne entegrasyon denenmedi.

### A841-06 — Belleği kullanmayı durdurma ve değişiklik makbuzu

**Durum:** NEW. **Efor:** M. **Opsiyonel pilot:** hayır. **Mevcut yol:** `src/assistant-settings.js; src/assistant-provider.js:run`. Sağlayıcı/akış gözlemleri var; incelenen run bağlamında kaydedilmiş genel bellek kullanım anahtarı ve bellek mutasyon makbuzu yok.

**Gerçek kaynak ve akış:** LibreChat MemoryToggle tercih yazımı sürerken anahtarı kilitliyor ve hata halinde UI değerini geri alıyor. MemoryInfo update/delete/error olaylarını, bütçe aşımını ayrı gösteriyor. Yeni bellek eklenirse kullanıcı tek tur için belleği kapatabilmeli; asistanın hangi kaydı güncellediğini sonradan bulabilmeli. Kaydı saklamak ile o istekte modele göndermek ayrı tercihlerdir.

- [LibreChat-AI/LibreChat · client/src/components/Nav/Settings/MemoryToggle.tsx](https://github.com/LibreChat-AI/LibreChat/blob/f4154b649efa37e1345ccc517a4d8d1ed2178c82/client/src/components/Nav/Settings/MemoryToggle.tsx) — `f4154b649efa37e1345ccc517a4d8d1ed2178c82`, `MemoryToggle / onToggle`.
- [LibreChat-AI/LibreChat · client/src/components/Chat/Messages/Content/MemoryInfo.tsx](https://github.com/LibreChat-AI/LibreChat/blob/f4154b649efa37e1345ccc517a4d8d1ed2178c82/client/src/components/Chat/Messages/Content/MemoryInfo.tsx) — `f4154b649efa37e1345ccc517a4d8d1ed2178c82`, `MemoryInfo`.

**Entegrasyon:** MIT iki küçük davranışın tek bellek denetim akışı olarak DOM uyarlaması. **Kullanıcı deneyimi:** Bu sohbette belleği kullan anahtarı; cevabın altında iki kayıt kullanıldı, bir kayıt güncellendi ayrıntısı.

**Windows/Electron/CSP:** Kişisel içerik istemsiz telemetryye yazılmaz; dar panel ve klavye odağı korunur. **Gelecek kabul örneği:** Kapalı turda kayıtlar durur fakat isteme eklenmez; kaydetme reddedilince anahtar ve makbuz doğru kalır.

**Kaynakta gözlenen kesin parça:** MemoryToggle tercih mutationı ve hata halinde UI rollback içeriyor; MemoryInfo update/delete/error artifactlerini gösteriyor. Tek tur için kapatma bizim sentezimizdir. **Ürün sentezi ayrımı:** UX, Windows/Electron entegrasyonu ve kabul örneği bu ürün için önerilen sentezdir; upstreamde aynen var veya çalıştırılmış sayılmaz.

**Olgunluk sınırı:** Kaynak kodu incelendi; upstream çalışma zamanı ve ürüne entegrasyon denenmedi.

### A841-07 — Araç şemalarını ihtiyaç halinde keşfetme

**Durum:** NEW. **Efor:** L. **Opsiyonel pilot:** hayır. **Mevcut yol:** `src/assistant-capabilities.js:definitions/help; src/assistant-provider.js:run`. Aktif kaynağa göre araçlar filtreleniyor; run kalan araçların bütün şemalarını tools dizisine koyuyor. Namespace bazlı şema keşfi ayrı protokol değil.

**Gerçek kaynak ve akış:** Cherry deferred-tools promptu namespace envanteri, tool_search, tool_inspect ve tool_invoke sırası tanımlıyor. Çok sayıda film, video, kitap ve ayar aracını her turda taşımak yerine çekirdek araçlar ile konu dizini sunulabilir. Keşif sonuçları yürütme yetkisi vermez; nihai invoke halen mevcut validate ve source-bound proposal yolundan geçmelidir. Bu dosya prompt sözleşmesini kanıtlar, bütün meta-tool uygulamasının runtime kabulünü değil.

- [CherryHQ/cherry-studio · src/main/ai/runtime/aiSdk/prompts/deferredTools.ts](https://github.com/CherryHQ/cherry-studio/blob/db125b265ecb6658d3bc99f2a65004605c237cab/src/main/ai/runtime/aiSdk/prompts/deferredTools.ts) — `db125b265ecb6658d3bc99f2a65004605c237cab`, `getDeferredToolsSystemPrompt`.

**Entegrasyon:** AGPL koşullarıyla seçilmiş port veya bağımsız davranış uygulaması; bütün Cherry Electron uygulaması alınmaz. **Kullanıcı deneyimi:** Gerekirse Araçlar: video3, kitap4 gibi sade durum; kullanıcıya teknik JSON akıtılmaz.

**Windows/Electron/CSP:** Main registry tek otorite; CSP eval veya renderer Node erişimi eklenmez. **Gelecek kabul örneği:** Film sorusunda ilgisiz onlarca şema gönderilmez; keşfedilen dublaj aracı onay politikasını atlayamaz.

**Kaynakta gözlenen kesin parça:** getDeferredToolsSystemPrompt namespace sayımı ve tool_search/inspect/invoke kullanım sözleşmesini oluşturuyor. Bu dosya meta-tool handler implementasyonunu kanıtlamaz. **Ürün sentezi ayrımı:** UX, Windows/Electron entegrasyonu ve kabul örneği bu ürün için önerilen sentezdir; upstreamde aynen var veya çalıştırılmış sayılmaz.

**Olgunluk sınırı:** Kaynak kodu incelendi; upstream çalışma zamanı ve ürüne entegrasyon denenmedi.

### A841-08 — Araç seçiminde ölçülen yerel reranker pilotu

**Durum:** NEW. **Efor:** L. **Opsiyonel pilot:** evet. **Mevcut yol:** `src/assistant-capabilities.js:list/definitions`. Alan erişilebilirlik filtresi var; kullanıcı sorusuna göre araç açıklamaları üzerinde alaka sıralaması yok.

**Gerçek kaynak ve akış:** AnythingLLM ToolReranker açıklama, parametre adları ve örnekleri belgeye çevirip NativeEmbeddingReranker ile topN seçiyor; hata halinde özgün seti geri döndürüyor. Keşif protokolünden farklı olarak bu mekanizma modelin önüne hangi araçların geldiğini sıralar. Bizde önce sözcüksel düşük maliyetli aday seçimiyle kıyaslanmalı; sessiz araç kaybı ve yanlış alaka ölçülmeden yerel model zorunlu yapılmamalı.

- [Mintplex-Labs/anything-llm · server/utils/agents/aibitat/utils/toolReranker.js](https://github.com/Mintplex-Labs/anything-llm/blob/9caf2b4c29d9782f1cba4142be2525ebfa0ecd43/server/utils/agents/aibitat/utils/toolReranker.js) — `9caf2b4c29d9782f1cba4142be2525ebfa0ecd43`, `ToolReranker.rerank / #toolToDocument`.

**Entegrasyon:** MIT saf dönüşüm/fallback portu; yerel reranker bağımlılığı yalnız ölçüm sonrası opsiyonel. **Kullanıcı deneyimi:** Deneysel hızlı araç seçimi ayarı; yanlışsa tüm uygun araçlara geri dön seçeneği.

**Windows/Electron/CSP:** Native model indirme/bellek/VRAM bütçesi; Whisper/dublaj GPU işine öncelik verilir. **Gelecek kabul örneği:** “Altyazıyı Türkçeye çevir” sorgusunda çeviri aracı kalır; reranker yokken normal çalışma sürer.

**Kaynakta gözlenen kesin parça:** ToolReranker.rerank araç açıklamalarını NativeEmbeddingRerankera verir, topN seçer; exceptionda özgün araç setine döner. **Ürün sentezi ayrımı:** UX, Windows/Electron entegrasyonu ve kabul örneği bu ürün için önerilen sentezdir; upstreamde aynen var veya çalıştırılmış sayılmaz.

**Olgunluk sınırı:** Kaynak kodu incelendi; upstream çalışma zamanı ve ürüne entegrasyon denenmedi.

### A841-09 — Büyük araç çıktısına konuşma boyunca dayanıklı erişim

**Durum:** OLD-DEEPENING:24Ekim kaynak kartları; R839-A05. **Efor:** M. **Opsiyonel pilot:** hayır. **Mevcut yol:** `src/assistant-tool-results.js:ToolResults.encode/read`. 12000 karakter üzeri sonuç turn içi Mapte tutuluyor; read_tool_result6000 karakter sayfalar; tek tur kapsamı açıkça belirtiliyor.

**Gerçek kaynak ve akış:** Cherry toolOutputStore içerik hashli internal blob, mesaj referansı ve delete_when_unreferenced yaşamı tanımlıyor; text/MCP-text dışındaki şekli kayıpsız korunamıyorsa dönüştürmüyor. Bizde yeni değer tool result saklamayı yeniden icat etmek değil, uzun araştırmanın sonraki turunda aynı izinli sonucu ID ile yeniden okuyabilmek ve kopya büyük metni azaltmaktır. Byte/karakter bütçesi ve silme politikası açık olmalı.

- [CherryHQ/cherry-studio · src/main/ai/contextBuild/toolOutputStore.ts](https://github.com/CherryHQ/cherry-studio/blob/db125b265ecb6658d3bc99f2a65004605c237cab/src/main/ai/contextBuild/toolOutputStore.ts) — `db125b265ecb6658d3bc99f2a65004605c237cab`, `persistToolOutputText/extractPersistableText/reconstructOutput`.

**Entegrasyon:** AGPL seçilmiş port veya bağımsız içerik adresli store; mevcut Map kısa işler için kalabilir. **Kullanıcı deneyimi:** Kaynak kartında tam sonucu aç/dışa aktar ve saklama süresi.

**Windows/Electron/CSP:** userData atomik dosya, maksimum disk alanı; modelin uydurduğu blob ID dosya okuma yetkisi sayılmaz. **Gelecek kabul örneği:** Uygulama yeniden açıldıktan sonra izinli aynı sonuç bulunur; sohbet silinince referanssız blob temizlenir.

**Kaynakta gözlenen kesin parça:** toolOutputStore içerik adresli blob, internal cleanup niteliği, text/MCP şekil projeksiyonu ve yeniden kurma fonksiyonları içeriyor. **Ürün sentezi ayrımı:** UX, Windows/Electron entegrasyonu ve kabul örneği bu ürün için önerilen sentezdir; upstreamde aynen var veya çalıştırılmış sayılmaz.

**Olgunluk sınırı:** Kaynak kodu incelendi; upstream çalışma zamanı ve ürüne entegrasyon denenmedi.

### A841-10 — Gönderilmeden önce görünür bağlam bütçesi

**Durum:** OLD-DEEPENING:R839-A04;24Ekim attachmentBudget. **Efor:** M. **Opsiyonel pilot:** hayır. **Mevcut yol:** `src/assistant-provider.js:run`. Geçmiş son12mesaj ve her biri5000karakterle kesilir; max_tokens2400 sabittir. Sistem/araç/kaynak paylarını gösteren gerçek istek bütçesi yok.

**Gerçek kaynak ve akış:** Cherry geçerli contextWindow, istekte gerçekten ayrılan output reservation ve kalan input room hesaplarını ayırıyor; bilinmeyen pencereyi NaN yerine null döndürüyor. Kullanıcıya “geçmişin dört eski turu gönderilmedi” açıklaması verilmesi sessiz kırpmayı görünür yapar. Bu bir başka compaction algoritması önerisi değil; gönderim öncesi saydamlık ve bütçenin doğru paylaştırılmasıdır. Token tahmini ölçülen tokenizerla ya da açık tahmin etiketiyle sunulur.

- [CherryHQ/cherry-studio · src/main/ai/contextBuild/resolveInputRoom.ts](https://github.com/CherryHQ/cherry-studio/blob/db125b265ecb6658d3bc99f2a65004605c237cab/src/main/ai/contextBuild/resolveInputRoom.ts) — `db125b265ecb6658d3bc99f2a65004605c237cab`, `resolveInputRoom`.
- [CherryHQ/cherry-studio · src/main/ai/contextBuild/resolveOutputReservation.ts](https://github.com/CherryHQ/cherry-studio/blob/db125b265ecb6658d3bc99f2a65004605c237cab/src/main/ai/contextBuild/resolveOutputReservation.ts) — `db125b265ecb6658d3bc99f2a65004605c237cab`, `resolveRequestedMaxOutputTokens`.
- [CherryHQ/cherry-studio · src/main/ai/contextBuild/resolveContextWindow.ts](https://github.com/CherryHQ/cherry-studio/blob/db125b265ecb6658d3bc99f2a65004605c237cab/src/main/ai/contextBuild/resolveContextWindow.ts) — `db125b265ecb6658d3bc99f2a65004605c237cab`, `resolveContextWindow/resolveMinContextWindow`.

**Entegrasyon:** AGPL saf budget yardımcıları veya bağımsız uygulama. **Kullanıcı deneyimi:** Yazı alanı altında kaynak/geçmiş/araç/yanıt rezervi; çıkarılan parçalar açılabilir.

**Windows/Electron/CSP:** Renderer hesapları güvence yerine geçmez; main nihai bütçeyi kurar, EN/TR sayılar okunur. **Gelecek kabul örneği:** Küçük pencereli modelde araç şemaları bütçeye dahil edilir; bilinmeyen pencerede sahte yüzde gösterilmez.

**Kaynakta gözlenen kesin parça:** resolveContextWindow geçersiz değerde null döndürür; resolveRequestedMaxOutputTokens öncelik sırası ve resolveInputRoom rezerv sonrası girdi alanını hesaplar. Görünür bütçe UIı kaynakta incelenmedi. **Ürün sentezi ayrımı:** UX, Windows/Electron entegrasyonu ve kabul örneği bu ürün için önerilen sentezdir; upstreamde aynen var veya çalıştırılmış sayılmaz.

**Olgunluk sınırı:** Kaynak kodu incelendi; upstream çalışma zamanı ve ürüne entegrasyon denenmedi.

### A841-11 — Sağlayıcı yetenek ve taşıma modu profili

**Durum:** NEW. **Efor:** L. **Opsiyonel pilot:** hayır. **Mevcut yol:** `src/assistant-settings.js:resolve; src/assistant-provider.js:run`. DeepInfra ya da inherit yapılandırması ve tools/stream için gözlenen supported/unsupported durumu var; model/endpoint/API modu ayrımı genellenmiş değil.

**Gerçek kaynak ve akış:** AionUi model ayarlarında auto ile açık image_input/openai_api_mode değerlerini ayırıyor; Cherry resolveCapabilities model+provider+assistant ve gerçek runtime providerID ile istek özelliklerini çözüyor. Bu sayede Chat Completions uyumlu endpoint ile Responses yeteneği aynı sanılmaz. Regex eşleşmesi güçlü garanti değildir; açık kullanıcı ayarı ve kontrollü probe sonucu tahmine üstün gelmeli.

- [iOfficeAI/AionUi · packages/desktop/src/common/utils/modelCapabilities.ts](https://github.com/iOfficeAI/AionUi/blob/11cd2a9a20d1e033157636efc570b41384c66d85/packages/desktop/src/common/utils/modelCapabilities.ts) — `11cd2a9a20d1e033157636efc570b41384c66d85`, `supportsOpenAiApiMode/updateModelSettings/hasSpecificModelCapability`.
- [CherryHQ/cherry-studio · src/main/ai/runtime/aiSdk/params/capabilities.ts](https://github.com/CherryHQ/cherry-studio/blob/db125b265ecb6658d3bc99f2a65004605c237cab/src/main/ai/runtime/aiSdk/params/capabilities.ts) — `db125b265ecb6658d3bc99f2a65004605c237cab`, `resolveCapabilities`.

**Entegrasyon:** Apache AionUi ayar modeli portu; AGPL Cherry çözümleyici referansı veya şartlı port. **Kullanıcı deneyimi:** Model kartında Araçlar: gözlendi, görüntü: bilinmiyor, taşıma: Chat Completions gibi anlaşılır durum.

**Windows/Electron/CSP:** Anahtar endpointler arasında taşınmaz; yeni originler main allowlist ve mevcut kasa ile çözülür. **Gelecek kabul örneği:** Tool desteklemeyen modelde eylem uygulanmış gibi görünmez; API modu değişince önceki gözlem yeniden değerlendirilir.

**Kaynakta gözlenen kesin parça:** AionUi auto/açık image_input ve openai_api_mode ayarlarını ayırır; Cherry gerçek runtime providerID ile capabilities/web plugin config üretir. Uçtan uca probe kartın önerisidir. **Ürün sentezi ayrımı:** UX, Windows/Electron entegrasyonu ve kabul örneği bu ürün için önerilen sentezdir; upstreamde aynen var veya çalıştırılmış sayılmaz.

**Olgunluk sınırı:** Kaynak kodu incelendi; upstream çalışma zamanı ve ürüne entegrasyon denenmedi.

### A841-12 — Model değişince desteklenmeyen ekleri açıkça dönüştür

**Durum:** NEW. **Efor:** M. **Opsiyonel pilot:** evet. **Mevcut yol:** `src/assistant-provider.js:run; src/assistant-source-context.js`. Bugünkü asistan kaynakları metin tabanlı ve seçili vision önerisi R839da var; model değişiminde geçmiş medya parçası dönüştürücüsü bu run yolunda bulunmaz.

**Gerçek kaynak ve akış:** Cherry stripUnsupportedMedia geçmişteki audio/video file parçalarını sessiz silmek yerine açık omitted note ile değiştiriyor. routeToolResultMedia görüntüyü model yeteneği ile wire şekline göre, tool-call/result komşuluğunu koruyarak user mesajına taşıyor. Bu, yeni ekran anlama fikri değildir; gelecekte eklenecek medyanın sağlayıcı değişiminde doğru serileştirilmesidir. Base64 metni modele anlamsız JSON olarak göndermekten kaçınır.

- [CherryHQ/cherry-studio · src/main/ai/messages/messageCapabilities.ts](https://github.com/CherryHQ/cherry-studio/blob/db125b265ecb6658d3bc99f2a65004605c237cab/src/main/ai/messages/messageCapabilities.ts) — `db125b265ecb6658d3bc99f2a65004605c237cab`, `stripUnsupportedMedia/resolveToolResultMediaCapabilities/routeToolResultMedia`.

**Entegrasyon:** AGPL seçilmiş dönüşüm veya bağımsız adapter; medya ekleri uygulanınca önkoşul. **Kullanıcı deneyimi:** Gönderim önizlemesinde video bu modelde kullanılamadı; metin dökümü kullanıldı açıklaması.

**Windows/Electron/CSP:** Dosya okuma/main MIME kontrolü, boyut limiti, CSP altında yerel güvenli önizleme. **Gelecek kabul örneği:** Vision modelden text modele geçince eski görüntü gizlice görülmüş sayılmaz ve tool eşleri bozulmaz.

**Kaynakta gözlenen kesin parça:** messageCapabilities geçmişte desteklenmeyen audio/video file parçalarını note ile değiştirir; tool-result imagesı wirea göre synthetic user mesaja taşır. **Ürün sentezi ayrımı:** UX, Windows/Electron entegrasyonu ve kabul örneği bu ürün için önerilen sentezdir; upstreamde aynen var veya çalıştırılmış sayılmaz.

**Olgunluk sınırı:** Kaynak kodu incelendi; upstream çalışma zamanı ve ürüne entegrasyon denenmedi.

### A841-13 — İsteğe bağlı yerel asistan model keşfi

**Durum:** NEW. **Efor:** L. **Opsiyonel pilot:** evet. **Mevcut yol:** `src/assistant-settings.js:resolve; src/assistant-translation-profiles.js`. Kayıtlı çeviri profilleri var; asistan resolve kendi endpointini DeepInfra ile sınırlar veya shared ayarı devralır. Yerel asistan model envanteri ayrı değil.

**Gerçek kaynak ve akış:** Letta local-model-config yapılandırılmış provider kayıtları, provider-published model discovery ve supported thinking levels bilgisini aynı runtime üzerinden çözüyor. Ürün için yerel kısa özet/etiketleme asistanı isteğe bağlı sunulabilir; kişisel metnin cihazda kalmasını isteyen kullanıcıya yarar. Yerel modeli otomatik kalite eşdeğeri ilan etmek veya canlı sağlayıcıdan gizli fallback yapmak uygun değil. Donanım gücü tek başına Türkçe doğruluğunu kanıtlamaz.

- [letta-ai/letta-code · src/backend/local/local-model-config.ts](https://github.com/letta-ai/letta-code/blob/ebd590b11bef049884b923da5ed3f5d087af81e0/src/backend/local/local-model-config.ts) — `ebd590b11bef049884b923da5ed3f5d087af81e0`, `resolveLocalProvider/listLocalModels/localModelSettingsForHandle`.

**Entegrasyon:** Apache adapter/veri modeli portu; Letta bütün terminal ajanı veya otomatik model kurulumu gerekmez. **Kullanıcı deneyimi:** Yerel sağlayıcı ekle, modelleri tara, araç destek durumu ve test isteği.

**Windows/Electron/CSP:** Loopback/origin güvenliği, Windows port/servis, CUDA VRAM çakışması ve start.bat env kabulü. **Gelecek kabul örneği:** Yerel servis kapalıyken anlaşılır bağlantı hatası; açık seçim olmadan buluta gönderim yapılmaz.

**Kaynakta gözlenen kesin parça:** Letta listLocalModels runtime.refreshAll üzerinden modelleri toplar, handle dedup ve reasoning/context bilgilerini döndürür. Otomatik yerel/bulut kalite routerı değildir. **Ürün sentezi ayrımı:** UX, Windows/Electron entegrasyonu ve kabul örneği bu ürün için önerilen sentezdir; upstreamde aynen var veya çalıştırılmış sayılmaz.

**Olgunluk sınırı:** Kaynak kodu incelendi; upstream çalışma zamanı ve ürüne entegrasyon denenmedi.

### A841-14 — Sohbet dalına model ayarı anlık görüntüsü

**Durum:** NEW. **Efor:** M. **Opsiyonel pilot:** hayır. **Mevcut yol:** `src/assistant-thread-store.js:cleanThread; src/assistant-settings.js`. Thread title/source/revision/messages tutulur; thread schema içinde modelHandle, context limit ve reasoning/serviceTier anlık görüntüsü yok.

**Gerçek kaynak ve akış:** Letta buildConversationModelCarryoverUpdate model handle normalizasyonu, destekli reasoning ve geçerli context window değerlerini yeni konuşmaya taşırken backendin sahip olduğu limitleri ayırıyor. Bizde eski cevabın hangi modelle üretildiği ve yeni dalın hangi ayarla devam ettiği görünür olmalı. Kayıt anahtar içermez; model değiştirme yetkisi ile credential taşıma birbirinden ayrı kalır. Upstream legacy128k iyileştirmesi bize kör taşınmaz.

- [letta-ai/letta-code · src/agent/conversation-model-carryover.ts](https://github.com/letta-ai/letta-code/blob/ebd590b11bef049884b923da5ed3f5d087af81e0/src/agent/conversation-model-carryover.ts) — `ebd590b11bef049884b923da5ed3f5d087af81e0`, `buildConversationModelCarryoverUpdate`.

**Entegrasyon:** Apache küçük snapshot/normalizasyon modeli portu. **Kullanıcı deneyimi:** Cevap altında model/taşıma etiketi; Dal aç menüsünde mevcut ayarı koru veya güncel varsayılan.

**Windows/Electron/CSP:** Şema göçü ve eski arşiv importu geriye uyumlu; endpoint anahtarı thread JSONa girmez. **Gelecek kabul örneği:** Global model değiştikten sonra eski dal sessiz farklı modelle sürmez; seçim görünür yapılır.

**Kaynakta gözlenen kesin parça:** buildConversationModelCarryoverUpdate handle/reasoning/context güncelleme alanlarını korur. Her yanıta kalıcı model provenance etiketi eklemek bizim ürün sentezimizdir. **Ürün sentezi ayrımı:** UX, Windows/Electron entegrasyonu ve kabul örneği bu ürün için önerilen sentezdir; upstreamde aynen var veya çalıştırılmış sayılmaz.

**Olgunluk sınırı:** Kaynak kodu incelendi; upstream çalışma zamanı ve ürüne entegrasyon denenmedi.

### A841-15 — Arka plan işinde değişmez çağrı sahipliği

**Durum:** OLD-DEEPENING:R838 uzun iş sürekliliği;R839-A07. **Efor:** M. **Opsiyonel pilot:** hayır. **Mevcut yol:** `src/assistant-agent-service.js:jobBindings; src/assistant-jobs.js:createJobs`. Main-owned job ledger, exact jobID ve source binding mevcut; jobBindings ve akış kayıtları süreç içi Mapler.

**Gerçek kaynak ve akış:** Mastra createBackgroundTask dispatch hooklarını her handle içinde tutuyor; checkIfExisting toolCallID/runID/agentID/threadID/resourceID/toolName ile tek kaydı arıyor, birden fazla eşleşmeyi hata sayıyor. Bizde ek değer daha çok iş türünü aynı kimlik sözleşmesine bağlamak ve renderer yeniden bağlandığında başka konuşmanın işini sahiplenmemektir. Yeni iş sistemi kurmak yerine mevcut IDs üzerine genişletilir.

- [mastra-ai/mastra · packages/core/src/background-tasks/create.ts](https://github.com/mastra-ai/mastra/blob/e219e6d94d3ec7ddb1d8b4d5af311ee6f6075e58/packages/core/src/background-tasks/create.ts) — `e219e6d94d3ec7ddb1d8b4d5af311ee6f6075e58`, `createBackgroundTask/checkIfExisting/resume/restart`.

**Entegrasyon:** Apache non-ee core davranış portu; Mastra frameworkünün tümünü kurmak ilk adım değil. **Kullanıcı deneyimi:** İş kartında hangi sorudan ve hangi kaynaktan doğduğu, aynı karta geri dönme.

**Windows/Electron/CSP:** Main process otoritesi, pencere kapanışında listener temizliği, process restart ayrı kabul gerektirir. **Gelecek kabul örneği:** İki konuşma aynı çeviri aracını çağırınca sonuçlar tool adına göre çapraz bağlanmaz.

**Kaynakta gözlenen kesin parça:** createBackgroundTask handleı dispatch contextini kapatır; checkIfExisting çoklu kimlik alanlarıyla kayıt arar ve birden fazla kaydı reddeder. **Ürün sentezi ayrımı:** UX, Windows/Electron entegrasyonu ve kabul örneği bu ürün için önerilen sentezdir; upstreamde aynen var veya çalıştırılmış sayılmaz.

**Olgunluk sınırı:** Kaynak kodu incelendi; upstream çalışma zamanı ve ürüne entegrasyon denenmedi.

### A841-16 — Başlamış medya operasyonunu asistan işine devralma

**Durum:** NEW. **Efor:** M. **Opsiyonel pilot:** hayır. **Mevcut yol:** `src/assistant-agent-service.js:requestRenderer; src/assistant-jobs.js:start/cancel`. Renderer eylem isteği ve main job kayıtları var; çağrının zaten başlamış asenkron operation/completion/cancel nesnesini tek kez adopt eden soyut sözleşme yok.

**Gerçek kaynak ve akış:** Mastra executeAdoptedBackgroundOperation aracın dönmesinden önce yalnız bir operation devralır; completionı izler, abortu cancel fonksiyonuna bağlar, arıza halinde tekrar iptali birleştirir. Bir dublaj sürecini hem araç promiseı hem job ledger ayrı sahiplenince belirsiz kapanış yaratmak yerine tek gerçek operationa iki görünüm bağlanabilir. Bu, kullanıcı onayı sonrası başlamış işe ilişkindir; otomatik yeni iş yetkisi değildir.

- [mastra-ai/mastra · packages/core/src/background-tasks/adoption.ts](https://github.com/mastra-ai/mastra/blob/e219e6d94d3ec7ddb1d8b4d5af311ee6f6075e58/packages/core/src/background-tasks/adoption.ts) — `e219e6d94d3ec7ddb1d8b4d5af311ee6f6075e58`, `executeAdoptedBackgroundOperation`.

**Entegrasyon:** Apache küçük yaşam döngüsü helperı port adayı. **Kullanıcı deneyimi:** Araç kartı Hazırlanıyor yerine gerçek iş aşamasına bağlanır; Durdur tek işlem.

**Windows/Electron/CSP:** Windows child process yaşamı, listener sızıntısı ve kapalı pencere callbackleri hedefli doğrulanır. **Gelecek kabul örneği:** İptal iki farklı UI yüzeyinden istenince alttaki işlem bir kez iptal edilir ve tamamlandı taklidi oluşmaz.

**Kaynakta gözlenen kesin parça:** executeAdoptedBackgroundOperation yalnız bir operationı dönüş öncesi adopt eder; completion ve cancel promiseını izler, abort listenerını temizler. **Ürün sentezi ayrımı:** UX, Windows/Electron entegrasyonu ve kabul örneği bu ürün için önerilen sentezdir; upstreamde aynen var veya çalıştırılmış sayılmaz.

**Olgunluk sınırı:** Kaynak kodu incelendi; upstream çalışma zamanı ve ürüne entegrasyon denenmedi.

### A841-17 — İş bitti ile sonuç asistana teslim edildi durumunu ayır

**Durum:** NEW. **Efor:** M. **Opsiyonel pilot:** hayır. **Mevcut yol:** `src/assistant-jobs.js:update; src/renderer/assistant-jobs-ui.js`. Ledger running/cancelling/completed/failed/stopped ve partial bilgisi tutar; model continuationa teslim pending/failed durumu ayrı veri değil.

**Gerçek kaynak ve akış:** LibreChat rows.ts terminal taskın delivery pending veya failed olmasını ayrı sıralıyor; findToolCallArgs yalnız belirsiz olmayan message/toolCall/step kimliğini kabul ediyor. Üretim başarıyla bittiği halde ağ kesildiği için asistanın sonucu öğrenememesi yeni üretim gerekçesi değildir. Kullanıcı yeniden bildir eylemiyle tamamlanmış sonucu taşıyabilmeli. İşin kendisini yeniden başlatmakla teslimi tekrarlamak ayrılır.

- [LibreChat-AI/LibreChat · client/src/components/Chat/BackgroundTasks/rows.ts](https://github.com/LibreChat-AI/LibreChat/blob/f4154b649efa37e1345ccc517a4d8d1ed2178c82/client/src/components/Chat/BackgroundTasks/rows.ts) — `f4154b649efa37e1345ccc517a4d8d1ed2178c82`, `findToolCallArgs/buildTaskRows/undelivered`.

**Entegrasyon:** MIT projection ve durum modeli portu. **Kullanıcı deneyimi:** Tamamlandı • asistan bildirimi bekliyor ve Sonucu tekrar bildir eylemi.

**Windows/Electron/CSP:** Kalıcı makbuz kimliği, yeniden açma ve offline/online dönüşü; kişisel dosya yolu modele dökülmez. **Gelecek kabul örneği:** SSE kopması sonrası sadece teslim tekrarlanır; ikinci ücretli dublaj veya çeviri başlatılmaz.

**Kaynakta gözlenen kesin parça:** rows.ts task status ile delivery pending/failed alanlarını ayırır ve belirsiz tool-call arg eşleşmelerini siler. Sunucu tarafı yeniden teslim APIı bu UI dosyasında kanıtlanmadı. **Ürün sentezi ayrımı:** UX, Windows/Electron entegrasyonu ve kabul örneği bu ürün için önerilen sentezdir; upstreamde aynen var veya çalıştırılmış sayılmaz.

**Olgunluk sınırı:** Kaynak kodu incelendi; upstream çalışma zamanı ve ürüne entegrasyon denenmedi.

### A841-18 — Yalnız başarısız aşamadan devam; restart ayrı eylem

**Durum:** OLD-DEEPENING:R838 checkpoint;R839-A07. **Efor:** L. **Opsiyonel pilot:** hayır. **Mevcut yol:** `src/assistant-flows.js; src/assistant-flow-state.js`. Devam kartları ve exact job sonucu ile önceki adımların korunması var; kalıcı görev/checkpoint yürütme kapsamı sınırlı.

**Gerçek kaynak ve akış:** Mastra resume ile restartı açık APIler olarak ayırıyor; manager task lease ownerını fenced terminal yazımlarda kontrol ediyor, kaynak bazlı task olaylarını filtreliyor. Bizim fark hedefi asistanın bütün görevi tekrar sorması yerine hangi aşamanın yeniden çalışacağını görünür seçtirmek. Checkpoint yalnız çıktı dosyası varlığı değildir; kaynak revizyonu ve önceki stage sonucu da doğrulanmalıdır. Upstreamin bütün dağıtık işçi altyapısı masaüstüne şart değildir.

- [mastra-ai/mastra · packages/core/src/background-tasks/create.ts](https://github.com/mastra-ai/mastra/blob/e219e6d94d3ec7ddb1d8b4d5af311ee6f6075e58/packages/core/src/background-tasks/create.ts) — `e219e6d94d3ec7ddb1d8b4d5af311ee6f6075e58`, `createBackgroundTask/checkIfExisting/resume/restart`.
- [mastra-ai/mastra · packages/core/src/background-tasks/manager.ts](https://github.com/mastra-ai/mastra/blob/e219e6d94d3ec7ddb1d8b4d5af311ee6f6075e58/packages/core/src/background-tasks/manager.ts) — `e219e6d94d3ec7ddb1d8b4d5af311ee6f6075e58`, `BackgroundTaskManager.resume/restart / ownedLeases`.

**Entegrasyon:** Apache seçilmiş state/identity desenini mevcut flows üstüne port. **Kullanıcı deneyimi:** Whisper tamamlandı, çeviri başarısız, dublaj başlamadı aşama kartında yalnız Çeviriyi yeniden dene.

**Windows/Electron/CSP:** Windows çökme/yeniden açma, GPU subprocess, atomik checkpoint ve kullanıcı dosyası kabulü gerekir. **Gelecek kabul örneği:** Başarısız çeviri tekrarında Whisper çalışmaz; kaynak değiştiyse önceki checkpoint reddedilir.

**Kaynakta gözlenen kesin parça:** BackgroundTaskManager.resume yalnız suspended durumu, restart pending/running durumunu kabul eder; queue/slot ve lease ownership ayrımı kaynakta var. Whisper stage checkpoint adaptörü bizim sentezimizdir. **Ürün sentezi ayrımı:** UX, Windows/Electron entegrasyonu ve kabul örneği bu ürün için önerilen sentezdir; upstreamde aynen var veya çalıştırılmış sayılmaz.

**Olgunluk sınırı:** Kaynak kodu incelendi; upstream çalışma zamanı ve ürüne entegrasyon denenmedi.

### A841-19 — Gecikmiş sonuç için ilk çağrının denetimlerini yeniden kur

**Durum:** OLD-DEEPENING:R840-Ö02;R839-A02. **Efor:** M. **Opsiyonel pilot:** hayır. **Mevcut yol:** `src/assistant-agent-service.js:requireOwner/jobResult; src/assistant-context-manifest.js`. Kaynak revizyonu ve owner denetimi mevcut; bunları sıfırdan varmış gibi önermiyoruz.

**Gerçek kaynak ve akış:** Lobe controlDeferredToolResult duraklatılmış çağrının persisted tool metadata ve ilk operation hooklarını geri okuyor; özgün çağrı kurulamazsa onaysız backfill yapmıyor. Arka plan sonucu farklı anda gelirse ilk onay ve güncel ortam denetimini ikisini de koruma örneği. Bizde bu, film sekmesi değiştikten sonra gelen uzun yorum analizi veya dublaj sonucunun yanlış yere uygulanmasını engelleyen denetimlerin daha tekil bir yaşam döngüsüne alınmasıdır.

- [lobehub/lobehub · apps/server/src/services/agentRuntime/hooks/deferredToolResultControl.ts](https://github.com/lobehub/lobehub/blob/4441d89c9ea0aebecdcb0a0d3d2327cc422ddf98/apps/server/src/services/agentRuntime/hooks/deferredToolResultControl.ts) — `4441d89c9ea0aebecdcb0a0d3d2327cc422ddf98`, `controlDeferredToolResult/loadDurableToolResultHooks`.

**Entegrasyon:** Community lisanslı kod için özel ticari türev dağıtım şartını kaydet; bağımsız tasarım uygulaması veya uygun lisanslı kullanım. Kaynak fikir dışlanmadı. **Kullanıcı deneyimi:** Kaynak değiştiyse Sonuç hazır, ilgili konuşmayı aç; yanlış açık ekrana otomatik uygulama yok.

**Windows/Electron/CSP:** Mainde yetki yeniden değerlendirmesi; serialized hook içeriği renderer veya modele verilmez. **Gelecek kabul örneği:** Eski kaynak sonucu yeni kaynağın cevap/eylem kartına bağlanmaz; özgün kimlik yoksa açık kurtarma durumu görünür.

**Kaynakta gözlenen kesin parça:** controlDeferredToolResult persisted call metadata/operation hooklarını kurar, özgün bağlam yoksa hata verir ve after-tool kontrolünü uygular. **Ürün sentezi ayrımı:** UX, Windows/Electron entegrasyonu ve kabul örneği bu ürün için önerilen sentezdir; upstreamde aynen var veya çalıştırılmış sayılmaz.

**Olgunluk sınırı:** Kaynak kodu incelendi; upstream çalışma zamanı ve ürüne entegrasyon denenmedi.

### A841-20 — Yanıt çıktısının sohbetten ayrı sürüm geçmişi

**Durum:** OLD-DEEPENING:R839-A05 araştırma dosyası. **Efor:** M. **Opsiyonel pilot:** hayır. **Mevcut yol:** `src/assistant-thread-store.js:cleanThread; src/assistant-collections.js`. Mesaj dalları ve analiz kayıtları var; aynı çıktı belgesinin revizyon seçicisi ve sohbetten bağımsız artifact kimliği ayrı schema değil.

**Gerçek kaynak ve akış:** LibreChat ArtifactVersion sürüm sayısı birden fazlaysa erişilebilir seçici sunuyor; AionUi artifact providerı id ile upsert edip konuşma değişiminde eski eventleri dışlıyor. Araştırma özeti veya karşılaştırma tablosunu “daha kısa yap” ile revize etmek yeni sohbet dalından ayrı belge v2 üretir. Önceki belge korunur; seçilen sürümün hangi kaynak revizyonlarından geldiği saklanır. UI tek başına kalıcı sürüm backendini kanıtlamaz.

- [LibreChat-AI/LibreChat · client/src/components/Artifacts/ArtifactVersion.tsx](https://github.com/LibreChat-AI/LibreChat/blob/f4154b649efa37e1345ccc517a4d8d1ed2178c82/client/src/components/Artifacts/ArtifactVersion.tsx) — `f4154b649efa37e1345ccc517a4d8d1ed2178c82`, `ArtifactVersion/onVersionChange`.
- [iOfficeAI/AionUi · packages/desktop/src/renderer/pages/conversation/Messages/artifacts.tsx](https://github.com/iOfficeAI/AionUi/blob/11cd2a9a20d1e033157636efc570b41384c66d85/packages/desktop/src/renderer/pages/conversation/Messages/artifacts.tsx) — `11cd2a9a20d1e033157636efc570b41384c66d85`, `ConversationArtifactProvider/upsertArtifacts`.

**Entegrasyon:** MIT/Apache veri ve UI deseni portu; yeni artifact deposu ayrıca tasarlanır. **Kullanıcı deneyimi:** Sohbetin yanında belge, v1/v2 seçici, dışa aktar ve kaynağa dön.

**Windows/Electron/CSP:** CSP altında model HTML çalıştırılmaz; ilk kapsam metin/Markdown/tablo, yerel dosya kaydı main üzerinden. **Gelecek kabul örneği:** v2 düzenlemesi v1i değiştirmez; eski sürüm exportu eski metni verir.

**Kaynakta gözlenen kesin parça:** ArtifactVersion indeks seçimi UIı; ConversationArtifactProvider ID bazlı upsert ve conversation event filtresi içerir. Kalıcı artifact revizyon backendini bu iki dosya kanıtlamaz. **Ürün sentezi ayrımı:** UX, Windows/Electron entegrasyonu ve kabul örneği bu ürün için önerilen sentezdir; upstreamde aynen var veya çalıştırılmış sayılmaz.

**Olgunluk sınırı:** Kaynak kodu incelendi; upstream çalışma zamanı ve ürüne entegrasyon denenmedi.

### A841-21 — Asistan düzeltmesinde dosya ve diff önizlemesi

**Durum:** NEW. **Efor:** M. **Opsiyonel pilot:** hayır. **Mevcut yol:** `src/assistant-source-preview.js; src/renderer/assistant-caption-actions.js`. Kaynak ve çeviri önerisi önizlemeleri var; genel asistan artifact metni için file/diff çift görünümü yok.

**Gerçek kaynak ve akış:** AionUi useDiffPreviewHandlers aynı değişiklik kartından gerçek dosyayı ve salt okunur diffi açıyor; fallback metni ve dosya türüne göre editable bilgisini ayırıyor. Bizde örneğin hazırlanan inceleme raporunun yalnız ikinci paragrafını değiştirirken kullanıcının tamamını tekrar okuması gerekmez. Bu, altyazı düzeltmesini otomatik diske yazma önerisi değil; onay öncesi değişiklik alanını açık gösterme mekanizmasıdır.

- [iOfficeAI/AionUi · packages/desktop/src/renderer/hooks/file/useDiffPreviewHandlers.ts](https://github.com/iOfficeAI/AionUi/blob/11cd2a9a20d1e033157636efc570b41384c66d85/packages/desktop/src/renderer/hooks/file/useDiffPreviewHandlers.ts) — `11cd2a9a20d1e033157636efc570b41384c66d85`, `useDiffPreviewHandlers/handleFileClick/handleDiffClick`.

**Entegrasyon:** Apache küçük launch sözleşmesi portu; editör framework göçü gerekmez. **Kullanıcı deneyimi:** Önce/Sonra, yalnız değişen satırlar, uygula veya vazgeç.

**Windows/Electron/CSP:** UTF-8/BOM, CRLF ve Windows yolu korunur; diff html textContent/izinli DOM ile çizilir. **Gelecek kabul örneği:** Asistan bir paragrafı değiştirince diğer paragraflar ve orijinal dosya kullanıcı uygulayana kadar aynı kalır.

**Kaynakta gözlenen kesin parça:** useDiffPreviewHandlers dosya görünümü ile salt okunur diff görünümünü farklı launchPreview argümanlarıyla açar; ürünün gerçek diske apply/write işlemi bu hookta yok. **Ürün sentezi ayrımı:** UX, Windows/Electron entegrasyonu ve kabul örneği bu ürün için önerilen sentezdir; upstreamde aynen var veya çalıştırılmış sayılmaz.

**Olgunluk sınırı:** Kaynak kodu incelendi; upstream çalışma zamanı ve ürüne entegrasyon denenmedi.

### A841-22 — Artifact yaşam döngüsü: taslak, hazır, kayıp ve temizleme

**Durum:** NEW. **Efor:** M. **Opsiyonel pilot:** hayır. **Mevcut yol:** `src/assistant-jobs.js:result.artifacts; src/assistant-thread-store.js`. İşlerde role/count/partial çıktıları var; genel konuşma artifacti için id/status/updatedAt olay projeksiyonu yok.

**Gerçek kaynak ve akış:** AionUi ConversationArtifactProvider başlangıç listesini IPCden alır, gelen olayları conversation_id ile filtreler, id bazlı birleştirir ve state değişimlerini tutar. Cherry referanssız içeriği temizleme deseni saklama ömrünü tamamlar. Kısmi oluşturulan belgeyi tam dosya diye sunmamak ve silinen dosyayı hâlâ indirilebilir göstermemek somut kullanıcı yararıdır. Bu kart sürüm geçmişinden farklı olarak dosyanın kullanılabilirlik durumunu yönetir.

- [iOfficeAI/AionUi · packages/desktop/src/renderer/pages/conversation/Messages/artifacts.tsx](https://github.com/iOfficeAI/AionUi/blob/11cd2a9a20d1e033157636efc570b41384c66d85/packages/desktop/src/renderer/pages/conversation/Messages/artifacts.tsx) — `11cd2a9a20d1e033157636efc570b41384c66d85`, `ConversationArtifactProvider/upsertArtifacts`.
- [CherryHQ/cherry-studio · src/main/ai/contextBuild/toolOutputStore.ts](https://github.com/CherryHQ/cherry-studio/blob/db125b265ecb6658d3bc99f2a65004605c237cab/src/main/ai/contextBuild/toolOutputStore.ts) — `db125b265ecb6658d3bc99f2a65004605c237cab`, `persistToolOutputText/extractPersistableText/reconstructOutput`.

**Entegrasyon:** Apache provider yaşam döngüsü + AGPL store ref koşullarıyla port/bağımsız uygulama. **Kullanıcı deneyimi:** Dosyalar alanında hazırlanıyor/hazır/eksik; yeniden oluştur yerine dosyayı bul veya export et.

**Windows/Electron/CSP:** Opaque IDden main dosya çözümleme; modelin verdiği keyfi yerel yoldan indirme yok. **Gelecek kabul örneği:** Sohbet değişirken önceki artifact event yeni listeye düşmez; dosya silinince Hazır etiketi korunmaz.

**Kaynakta gözlenen kesin parça:** ConversationArtifactProvider IPC listesini/eventini conversation_id ile filtreler ve status günceller; toolOutputStore referanssız blob temizleme politikasını belirtir. Kayıp dosya tespiti ve durum seti bizim sentezimizdir. **Ürün sentezi ayrımı:** UX, Windows/Electron entegrasyonu ve kabul örneği bu ürün için önerilen sentezdir; upstreamde aynen var veya çalıştırılmış sayılmaz.

**Olgunluk sınırı:** Kaynak kodu incelendi; upstream çalışma zamanı ve ürüne entegrasyon denenmedi.

### A841-23 — Kullanıcı geri bildirimini tekrar oynatılabilir görev değerlendirmesine bağla

**Durum:** NEW. **Efor:** M. **Opsiyonel pilot:** hayır. **Mevcut yol:** `src/assistant-run-steps.js; src/assistant-job-diagnostics.js; tests/assistant-provider.test.js`. Araç adımları, hata sınıfları ve hedefli testler var; kullanıcı geri bildirimiyle seçilen örneği sürümlü ölçüm girdisine bağlayan deney kaydı yok.

**Gerçek kaynak ve akış:** Mastra runScorersForItem içerik çıktısı ile trajectoryyi ayırıyor, her scorer hatasını izole ediyor ve aynı experiment/item/attempt/scorer için kararlı skorID kullanıyor. Bizde “yanlış kaynağı kullandı” bildirimi anonimleştirilmiş kaynak/araç iziyle yerel inceleme örneğine dönüşebilir. Önce deterministik yanlış kaynak, tamamlanma iddiası ve araç sırası ölçülmeli; LLM hakemi tek başına doğru kabul edilmemeli. Gerçek kullanıcı konuşmasını otomatik yayına göndermek gerekmez.

- [mastra-ai/mastra · packages/core/src/datasets/experiment/scorer.ts](https://github.com/mastra-ai/mastra/blob/e219e6d94d3ec7ddb1d8b4d5af311ee6f6075e58/packages/core/src/datasets/experiment/scorer.ts) — `e219e6d94d3ec7ddb1d8b4d5af311ee6f6075e58`, `runScorersForItem/experimentScoreId`.

**Entegrasyon:** Apache non-ee seçilmiş skor kontratı portu; tam Mastra eval altyapısı opsiyonel. **Kullanıcı deneyimi:** Cevap altında Sorunu bildir: yanlış kaynak/eksik cevap/eylem; paylaşılacak içeriğin önizlemesi.

**Windows/Electron/CSP:** Kişisel veri redaksiyonu ve yerelde saklama; gerçek anahtar/log eklenmez, CI dışarı veri göndermez. **Gelecek kabul örneği:** Aynı örneğin retryı çift skor üretmez; değerlendirici hatası0puan diye kalite regresyonu sayılmaz.

**Kaynakta gözlenen kesin parça:** runScorersForItem trajectory/normal output ayrımı, scorer hata izolasyonu ve kararlı skorID kullanır. Kullanıcı feedback yakalama/redaksiyon UIı bu dosyada yok. **Ürün sentezi ayrımı:** UX, Windows/Electron entegrasyonu ve kabul örneği bu ürün için önerilen sentezdir; upstreamde aynen var veya çalıştırılmış sayılmaz.

**Olgunluk sınırı:** Kaynak kodu incelendi; upstream çalışma zamanı ve ürüne entegrasyon denenmedi.

### A841-24 — Kapsam kontrolünü sıralamadan önce yapan retrieval

**Durum:** OLD-DEEPENING:24EkimAnythingLLM;R839-A08. **Efor:** L. **Opsiyonel pilot:** evet. **Mevcut yol:** `src/assistant-retrieval.js:search; src/assistant-context-manifest.js`. Bağımsız sözcüksel arama ve kaynak manifesti var; embedding fikri önceki araştırmada zaten var.

**Gerçek kaynak ve akış:** Mastra KnowledgeSemanticIndex vektörde yalnız ID tutar; her adayı storage üzerinden güncel scope ile yeniden okur, reddedilenler slot tüketmesin diye sınırlı overfetch/refill yapar. Bize yeni ayrıntı embedding modeli seçimi değil, silinmiş/başka kaynağa ait eski indeks sonucunun cevaba sızmamasıdır. Embedding yazımı store committen sonra yapılır; başarısız indeks yalnız recall kaybıdır, eski içeriğe yetki değildir.

- [mastra-ai/mastra · packages/core/src/knowledge/semantic.ts](https://github.com/mastra-ai/mastra/blob/e219e6d94d3ec7ddb1d8b4d5af311ee6f6075e58/packages/core/src/knowledge/semantic.ts) — `e219e6d94d3ec7ddb1d8b4d5af311ee6f6075e58`, `KnowledgeSemanticIndex.search/indexPage/reindex`.

**Entegrasyon:** Apache saf arama/persistence kontratı portu; vektör sağlayıcı kurmak ilk adım değil. **Kullanıcı deneyimi:** Arama sonucu yalnız seçili kaynaklar içinden; eksik indeks için yeniden dizinle durumu.

**Windows/Electron/CSP:** Yerel model depolaması ve GPU isteğe bağlı; opaque ID/revision doğrulaması main tarafında. **Gelecek kabul örneği:** A kaynağının silinen chunkIDsi indeksde kalsa bile B sohbetinde metni döndürülmez.

**Kaynakta gözlenen kesin parça:** KnowledgeSemanticIndex.search ID adaylarını accept callbackinden geçirir ve reddedilenlerden sonra sınırlı overfetch/refill yapar; index yazısı storage sonrası tasarlanmıştır. **Ürün sentezi ayrımı:** UX, Windows/Electron entegrasyonu ve kabul örneği bu ürün için önerilen sentezdir; upstreamde aynen var veya çalıştırılmış sayılmaz.

**Olgunluk sınırı:** Kaynak kodu incelendi; upstream çalışma zamanı ve ürüne entegrasyon denenmedi.

### A841-25 — Bellek düzeltmesinde tek sahipli ve sınırlandırılmış onarım

**Durum:** NEW. **Efor:** M. **Opsiyonel pilot:** evet. **Mevcut yol:** `src/assistant-thread-store.js:revision save guard; src/fsync-utils.js`. Thread yazımı revision çakışmasını reddediyor; genel asistan belleği henüz yok. Yeni bellek eklenirse çakışma çözümünün ayrı tasarımı gerekir.

**Gerçek kaynak ve akış:** Letta claimMemoryConflictRepair conflict signature ve tokenla CAS geçişi yapıyor; canlı süreçteki işi yaşına bakarak ele geçirmiyor, aynı çözülemeyen çatışmaya her tur yeniden ajan başlatmıyor. Bu deseni kullanıcı belleği veya eşzamanlı artifact düzeltmelerine uygulamak, iki pencerenin son yazanı kazanır yaklaşımından daha güvenilir. Letta Git-memory altyapısını kullanıcı profilimize doğrudan kurmak gerekmez; sınırlı sahiplik ve açık çakışma görünümü alınır.

- [letta-ai/letta-code · src/agent/memory-conflict-repair.ts](https://github.com/letta-ai/letta-code/blob/ebd590b11bef049884b923da5ed3f5d087af81e0/src/agent/memory-conflict-repair.ts) — `ebd590b11bef049884b923da5ed3f5d087af81e0`, `claimMemoryConflictRepair/completeMemoryConflictRepair/clearMemoryConflictRepair`.

**Entegrasyon:** Apache algoritma referansı/port; bellek özelliğinden sonra opsiyonel sertleştirme. **Kullanıcı deneyimi:** Kayıt başka pencerede değişti; iki metni karşılaştır, benimkini koru veya yeniyi al.

**Windows/Electron/CSP:** Windows PID yeniden kullanımı, dosya kilidi ve ani kapanış; mevcut atomik yazma sözleşmesi korunur. **Gelecek kabul örneği:** İki pencere aynı belleği değiştirince biri kaybolmaz; aynı çözülemeyen çatışma her mesajda yeni iş başlatmaz.

**Kaynakta gözlenen kesin parça:** claimMemoryConflictRepair signature/token/PID-start ile kilitli claim; complete/clear yalnız eş token üzerinde çalışır. Genel JSON bellek editörü entegrasyonu bizim sentezimizdir. **Ürün sentezi ayrımı:** UX, Windows/Electron entegrasyonu ve kabul örneği bu ürün için önerilen sentezdir; upstreamde aynen var veya çalıştırılmış sayılmaz.

**Olgunluk sınırı:** Kaynak kodu incelendi; upstream çalışma zamanı ve ürüne entegrasyon denenmedi.

## Önce seçeceğim sekiz

1. A841-07: ihtiyaç halinde araç şeması; mevcut kalabalık registry üzerinde doğrudan maliyet/karar yararı.
2. A841-10: gerçek bütçeyi ve kırpmayı görünür kılmak; kullanıcı hangi kaynağın gönderildiğini anlar.
3. A841-01: sürümlü görev profili; sık medya işlerinde tekrar yazmayı azaltır.
4. A841-14: dal/model anlık görüntüsü; sağlayıcı doğruluğu ve tekrar üretilebilirlik.
5. A841-17: tamamlanma ile teslimi ayırmak; kopma sonrası pahalı işi tekrarlamamak.
6. A841-20: çıktı revizyonları; araştırma belgesini sohbet içinde kaybetmemek.
7. A841-21: dosya/diff önizlemesi; asistan düzeltmesini incelenebilir hale getirmek.
8. A841-23: hata geri bildirimini deterministik görev değerlendirmesine bağlamak.

Bellek A841-04/05/06 bir paket; ayrı altyapılar kurulması önerilmiyor. A841-07 keşif ve A841-08 reranking alternatif/katmanlı araç seçim yaklaşımları; ikisi de ilk anda zorunlu değil. A841-15/16/17/18/19 mevcut job/flow sisteminin birbirini tamamlayan kimlik, operasyon sahipliği, teslim, devam ve denetim boyutları; sıfırdan beş ajan frameworkü kurulmaz. A841-20/21/22 artifactin revizyon, düzenleme ve kullanılabilirlik boyutlarıdır.

## Kanıt sınırı

Seçilen dosyaların ilgili fonksiyonları statik okundu. Büyük manager, eval, local model ve memory kaynaklarında kartta adı geçen işlev/durum blokları incelendi; bütün repo denetimi iddiası yok. Hiçbir upstream kaynak çalıştırılmadı veya ürün bağımlılığı kurulmadı. Ürün kodu/ayar/test değişikliği yok; yeni işlev için runtime kabulü, performans/maliyet karşılaştırması, Türkçe model kalitesi, güvenlik sertifikası veya gerçek Windows UI başarısı iddia edilmiyor. Kartlardaki kabul örnekleri çalıştırılmış test değildir. `start.bat`, `install.bat`, model/GPU/native UI ve tam test/CI bu araştırmada çalıştırılmadı. Ekran görüntüsü bu alt alanda alınmadı; UI iddiaları kaynak bileşenlerinin statik davranışıyla sınırlı.
