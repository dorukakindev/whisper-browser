# Rapor 626 — Bağımsız DeepInfra Flex asistan sağlayıcısı

27 Ekim 2026. Başlangıç `21a31b205ddbd27dab53fffd70359415c43036c6`; bitiş ürün `c35ec36da37f6745cc420d62836ce791fd4bca81`. Dal `codex/assistant-deepinfra626`.

## İstenen davranış ve kullanım

Kullanıcının bu bilgisayardaki asistan varsayılanı `https://api.deepinfra.com/v1/openai`, model `deepseek-ai/DeepSeek-V4.1-Flash-1017` olarak yapılandırıldı. Anahtar mevcut Windows güvenli kasasında `assistant.apiKey` alanına şifreli kaydedildi; açık settings.json/Git/komut argümanına yazılmadı. Güvenli kayıt yardımcısı model/şifreleme/çeviri korumasını doğruladı; çıkarım isteği göndermedi. Gerçek anahtar uygulama kurulumu dışında test fixture'larında kullanılmadı. Kullanıcı uygulaması kapatılmadı.

**Ayarlar → Asistan ve çeviri → Asistan sağlayıcısı** ayrı seçim, model ve maskeli anahtar alanını sunar. DeepInfra seçiminde asistanın Node sohbet/araç turları, uyumluluk denemeleri ve DeepInfra kullanan eski Python scoped-chat yolu `service_tier: "flex"` gönderir. Standart/priority katmana istemci tarafında otomatik dönüş yoktur. Asistanın bekleme sınırı DeepInfra için 12 dakikadır; normal sağlayıcılar iki dakikada kalır. İptal mekanizması korunur. Sunucunun gerçekten uyguladığı katmanı istemci talebinden çıkarsamayız; canlı faturalama/yanıt katmanı doğrulanmadı.

Altyazı çevirisinin önceki sağlayıcı/model/anahtarı korunur. Yeni grup yoksa eski kullanıcı ayarları altyazı sağlayıcısını paylaşmayı sürdürür. Açık `inherit` seçimi paylaşımı korur. Kasa anahtarı var ama eski açık uygulamanın kaydetmesi nedeniyle yeni açık grup alanları eksikse, bu dedicated anahtar DeepInfra varsayılanına bağlanır; altyazı anahtarı başka sağlayıcıya ödünç verilmez. Kişisel anahtar depoda bulunmaz ve başka kurulumlara taşınmaz.

## Resmî kaynakların kontrolü

- [DeepInfra model sayfası](https://deepinfra.com/deepseek-ai/DeepSeek-V4.1-Flash-1017/api): doğru model ID, OpenAI uyumlu yol, streaming/function ve Flex desteği.
- [Chat Completions / Flex](https://docs.deepinfra.com/chat/overview#flex): JSON `service_tier`, yoğunlukta on dakikaya kadar kuyruk/429, sunucunun desteklenmeyen katmanı standarda düşürebilmesi. Bu nedenle istek parametresi ve uzun bekleme ayrı ele alındı.
- [Tool calling](https://docs.deepinfra.com/chat/tool-calling), [reasoning](https://docs.deepinfra.com/chat/reasoning): mevcut OpenAI araç döngüsü/metadata korunur. Yeni SDK gerekmedi. `anthropic` kökü bu uygulamada kullanılmaz.

DeepInfra'ya geçmek uygulamaya kendiliğinden canlı web arama hizmeti kazandırmaz. Mevcut kaynaklı araştırma `Responses web_search` desteği gerektirir; bu model/endpoint için o özellik canlı doğrulanmadı. Desteklenmezse mevcut açık hata döner, kaynak uydurulmaz. Araçların uygulama işlevlerini çağırabilmesi ile sağlayıcının barındırdığı web araması aynı özellik değildir.

## Değişen dosyalar

- `src/assistant-settings.js`: ortak Node/renderer sabitleri, tam HTTPS host/path eşleşmesi, bağımsız çözümleme, Flex istek alanı ve süre bütçesi.
- `src/assistant-provider.js`, `assistant-agent-service.js`: her araç/uyumluluk turunda Flex; sağlayıcıya uygun genel süre. Mevcut sonuçla devam/iptal ve kaynak guard'ları değişmedi.
- `src/assistant-web-research.js`, `main.js`: asistanın ayrı yapılandırmasının Node yollarına bağlanması; DeepInfra araştırma isteği yapılırsa Flex parametresi korunur. Altyazı config'i ayrı kalır.
- `src/settings-security.js`, `secret-store.js`: dedicated assistant grubu/sır alanı, maskeleme, import endpoint değişiminde eski anahtarı taşımama ve kasa koruması. Settings sürümü değişmedi; optional grup eklendi.
- `src/renderer/index.html`, `renderer.js`: ayrı alanlar, güvenli payload/load, asistanın başka sağlayıcının anahtarını zorunlu sanmaması, scoped-chat endpoint/model bağlama ve süre. DeepInfra mevcut sağlayıcı seçeneklerinde de listelenir; seçili altyazı sağlayıcısı değiştirilmez.
- `src/renderer/app-settings-ui.js`, `global-assistant.js`: EN/TR alanlar, ayrı sağlayıcı açıklaması, asistan baloncuğunda gerçekten seçili asistan modelini gösterme. Üst durum kartı altyazı sağlayıcısı olarak etiketlenir.
- `backend/assistant_stream.py`, `transcribe.py`: yalnız sohbet yolunda tam DeepInfra adresi için `extra_body.service_tier=flex` ve uzun HTTP beklemesi; normal transkripsiyon/çeviri çıkarımı değiştirilmez.
- `tests/assistant-settings.test.js`, `assistant-provider.test.js`, `test_assistant_stream.py`: tam host/yanlış host, paylaşım, sır ayrımı/import ve çok turlu Flex kontrolleri.
- `tests/electron-assistant-deepinfra.smoke.js`: gerçek Windows ayar/kasa/renderer/main/araç döngüsü; dış API yerine kontrollü fetch.
- `tests/settings-ui-persist-roundtrip.test.js`: üç yeni kontrol gerçek `assistant` group/kasa kalıcılığına sınıflandırıldı; mevcut kırmızı envanter eşiği gevşetilmedi.

## Doğrulama ve açık sınırlar

14 hedefli Node dosyası geçti: `assistant-settings`, `assistant-provider`, `assistant-agent-service`, `settings-security` (23), `settings-roundtrip`, `settings-persistence`, `secret-store-recovery`, `coverage-map`, `preload-usage-ratchet`, `assistant-web-research`, `settings-hostile-fuzz`, `assistant-app-actions`, `provider-api-keys`, `ipc-parity`. Python `tests/test_assistant_stream.py` 11 test geçti. 14 JS syntax + üç Python py_compile ve diff kontrolü geçti. İlk sandbox denemesinde settings-security child-process spawn engeline takıldı; gerekli süreç izniyle tekrar 23/23 geçti.

**Bilinen kırmızı:** `settings-ui-persist-roundtrip` genel kontrol envanteri, başlangıç master HTML'iyle de güncel HTML ile de aynı on eski alanı sınıflandırılmamış buluyor: `pdfAssistantTools`, `pdfTranslateTools`, `timelineQcProfile`, `timelineQcFps`, `timelineAnalysisFrom/To/Track`, `sceneSummary/Terms/Characters`. Salt okuma baseline karşılaştırması bunu ayırdı; üç yeni alan doğru sınıfa eklendi. Mevcut on alan bu sağlayıcı işi kapsamında değiştirilmedi; test başarılı gösterilmedi.

İki native Windows kabulü geçti: yeni `electron-assistant-deepinfra.smoke.js` ve mevcut `electron-app-settings.smoke.js`. Yeni kabul ayrı profilde gerçek güvenli kaydetme, boş altyazı anahtarına rağmen independent asistan, iki araç turunun Flex/model doğrulaması, açık dosyada anahtar bulunmaması ve korunmuş çeviri ayarını sınadı. TR koyu ve EN açık/dar pencere görüntüleri incelendi; masked anahtar, kaydırılan içerik ve sabit kaydetme alanı görünür. İlk native deneme ayar kapanışındaki kaynak snapshot güncellenmeden gönderim yaptığı için kaynak guard'ında durdu; fixture gerçek UI sırasıyla güncellendi, koruma gevşetilmedi.

Tam `npm test`, uzun CI, gerçek DeepInfra çıkarımı/araç seçme kalitesi/faturalama, GPU/ses ve normal `start.bat` açılışı koşulmadı. Yeni bağımlılık/kurulum değişimi yok; launcher/CUDA yolları aynı. Özel anahtarın güvenli kurulumu Git dışıdır; ham profil/log/görüntüler de Git dışıdır. Native yardımcı süreçlerin yalnız bu göreve ait olanları kullanıldı; kişisel uygulama kapatılmadı. Arka plan pipe/subprocess girişleri ortam engeline takıldığında anahtar düz metne düşürülmedi; yerel parola alanıyla doğru uygulama şifreleme bağlamında kayıt tamamlandı.
