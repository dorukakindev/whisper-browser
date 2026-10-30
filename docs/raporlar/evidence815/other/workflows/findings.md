# Workflow/automation/MCP — doğrulanmış rapor

HEAD `6a789329d96c4f97cdc17bd9518df0b540b13444`; iki bağımsız P2kök. Düzeltme yok. Kanıt `probe.cjs`, `run/results.json`; bütün ayrıntı ve geçmiş118başlık eşlemesi `findings.json`.

## WF-AUTO-01 · P2 — Otomasyon kaynak ve oturum karakter bütçesini gerçek altyazı metninden ölçmüyor

**sources:** src/main.js:9834–9886 persistBrowserTrack; src/main.js:9984–10050 publishBrowserTrackNow; src/renderer/renderer.js:10408–10444 browserSubtitleAutomationInput/handleBrowserSubtitleAutomation; src/browser-automation-rules.js:44–57

**reproduce:** node .tmp/next815-workflows/probe.cjs. Gerçek normalizeCues ve publisher/persist ile 401 cue/200001 karakter kaynak yayınla; gerçek renderer input/decision uygula. Ardından iki ayrı medya için380 cue/190000 karakter kaynak yayınlayıp gerçek automation handler çalıştır.

**expected:** 200000 üzeri gerçek kaynak karakteri kullanıcı onayına geçer. Başlatılabilir iki190000karakter işin ikincisi300000 oturum karakter bütçesinde engellenir.

**observed:** 200001gerçek karakter32080olarak sayılır ve eligible. İki190000karakter kaynak için iki useBrowserTrack başlatması, toplam380000karakter; browserAutomationLiveCharacters0kalır. Doğru gerçek karakter değerleri verilen aynı karar modülü sırasıyla blocked_by_limit döner.

**cause:** Publisher/persist track üzerinde characterCount ve appendedCharacters üretmiyor. Renderer sourceCharacters için cueCount*80 tahmini, newCharacters için0kullanıyor; bütçe handlerı yalnız bu0değerini topluyor. Bu alanların başka üreticisi repo src taramasında yok. Kaynak ve kümülatif bütçe aynı eksik karakter muhasebesinin iki yüzüdür; tek kök sayıldı.

**impact:** Otomatik altyazı çevirisi açık sitelerde açık harcama/onay sınırları aşılabilir; uzun kaynaklar kullanıcı onayı gerektirmeden işbaşlatma yoluna ulaşır.

**prior:** R815 önceki118eşleme içinde aynı kök yok. Night1000F11/F19kaynak/scheduler/kuyruk aileleri yakın; gerçek publisher→renderer bütçe metadata zinciri yok. R46claim/Tur4Y-NEW-1claim başarısızlığı, R46-74/Tur4O-NEW-9iptal kapısı kökleri yeniden sayılmadı.

**limits:** Gerçek kaynak fonksiyonlarıVM içinde aynen çalıştırıldı; kalıcı varlık store, dosya yazıcı, indeks, IPC ve useBrowserTrack bağımlılıkları kontrollü facade. Gerçek normalizeCues kullanıldı ve karakter sayıları normalize edilmiş cueIdentities üzerinden toplandı. Gerçek sağlayıcı çağrısı, harcanan para veya tüm altyazı siteleri kanıtı değildir. Onay kapısının otomatik başlatma sınırı kanıtlandı. Başlatmanın ayrık mediaId kullanmasıyla gate normal dedup davranışı korunur.

**acceptance:** Gerçek kaynak uzunluğu ve ilk/yeni karakter artışı metadata/renderer boyunca tutarlı sayılmalı;200001kaynak bloke, iki190000işin ikincisi bloke; aynı kaynağın tekrarı/önbellek durumu çift sayılmamalı.

## WF-MCP-02 · P2 — MCP köprüsü HTTP parçası sınırında Unicode JSON-RPC istek kimliğini bozuyor

**sources:** src/assistant-mcp-bridge.js:24 HTTP gövdesi data+=chunk; tools/whisper-mcp.cjs:9 yanıt kimliğini değiştirmeden stdout aktarımı

**reproduce:** Aynı probe gerçek createBridge sunucusunu127.0.0.1ephemeralportunda başlatır. tools/call get_jobs isteğinin fixture-ş-id string kimliğindeki ş UTF-8 baytlarını iki HTTP Buffer arasında40msayırır.

**expected:** Geçerli UTF-8 JSON isteği HTTP parçalanmasından bağımsız aynı string id ile eşleşir; sonuç id fixture-ş-id kalır.

**observed:** HTTP200başarılı result var; response.id fixture-��-id. Aynı gövde tek Bufferda fixture-ş-id, ASCIIiki Bufferda ascii-id korunur; yanlış token ve Origin403reddedilir.

**cause:** Bufferların her biri data+=chunk ile bağımsız UTF-8 stringe dönüşür. İki parçaya bölünmüş karakter için streaming decoder veya Buffer.concat yok; her eksik parça replacement karakterine dönüşür. Adapter fetch yanıtını JSON.stringifyile aynen geçirir; kimlik eşleşmesi düzeltilmez.

**impact:** Unicode string id kullanan MCP istemcisi yanıtı bekleyen isteğe bağlayamaz; geçerli saltokuma araç isteği cevabı kayıp/timeout gibi görünür. Rehber sorgusunun Unicode karakterleri de aynı gövde okumasından geçer.

**prior:** R815 önceki118eşleme içinde MCP taşıma kökü yok. R798MCP kimlik/auth/Origin/read-only ve Node stdio kabulü ASCIIid/single-body yolunu kanıtlıyordu; bölünmüş UTF-8 değil. Night1000F48/F49en yakın payload/NDJSON aileleridir; yeniMCPbridge o kaynak senaryolarında kayıtlı değil.

**limits:** Gerçek HTTPserver/bridge ve localhostkullanıldı; getJobs/getTabs kontrollü boş fixture. Gerçek dışMCPistemcisi veya stdioadapter çalıştırılmadı; adapter tüketici ilişkisi koddan incelendi. Ağın doğal olarak bu parçalamayı ne sıklıkta oluşturduğu ölçülmedi. Tüm istemciler Unicode id üretir iddiası yok.

**acceptance:** UTF-8kod noktası her olasıbaytsınırında bölündüğünde JSONRPCidve sorgu aynen korunmalı; mevcut65536bayt,Originveauthretleri korunmalı.

## Kapsam ve hariçler

Night1000F11/F19/F48/F49toplam80tarihsel satırın ID/aile/mekanizma/kaynak/imzaları JSONregistryComparison içinde karşılaştırıldı; geçmişPASSgüncel başarı diye sunulmadı. Yeniinvariantve doğrulanmayanlar coverage içinde ayrı.

- R46-39 workflow timeout/abort signal: mevcut kök; yeni sayılmadı.
- R46-40 stale recorder active temizliği: mevcut kök; yeni sayılmadı.
- R46-41 boş mediaIdentity: mevcut kök; yeni sayılmadı.
- R46-73 operationKey newline veR46-74iptal/gate entegrasyonu: mevcut kök; yeni sayılmadı.
- Workflow completeTranslation gerçek selecti kullanır; yanlış iz yönlendirme adayı doğrulanmadı.
- MCP tüm hataların-32602olması/notification doğrulama ayrımı düşük etkili protokol ayrıntısı; bug sayılmadı.

## Ayrı öneri

Workflowkayıtlarını adlandırma/seçme ve adımları çalıştırmadan önce gösteren düzenleyici: Mevcut son-workflowoynatma yüzeyini anlaşılır kılabilir; mevcut sözleşme ihlali kanıtlanmadığından öneri.
