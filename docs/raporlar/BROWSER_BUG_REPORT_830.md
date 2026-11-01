# R830 — Yeni buglar, yeniden açılan atıf hatası ve geliştirme önerileri

1 Kasım 2026. İncelenen kaynak **`6d4c2d661257263f0f9414b2bdf8ba53f84513c9`**; başlangıç `master`, rapor dalı `codex/functional-audit830`. Kullanıcının isteği yalnız denetim/raporlamadır. **Ürün kodu, testler, kişisel ayarlar ve bağımlılıklar değiştirilmedi; hiçbir düzeltme uygulanmadı.**

Önceki raporların artık açık olduğu varsayılmadı: R818–R823'ün `733afa90` düzeltmesi, R826 ve R829'un güncel uygulaması incelendi. Üç **GPT-6.1 Sol / medium** ajan asistan, dublaj ve film alanlarına ayrıldı; ana ajan telaffuz sözlüğünün birleşik sınırını inceledi ve bütün kanıtları son yayımlama yollarından bağımsız yeniden çalıştırdı. Güncel yeni kayıtların ve eski regresyonun sayıları ayrıdır.

| Tür | ID | Öncelik | Sonuç |
|---|---|---|---|
| Yeni bug | F830-01 | P2 | Review filtresindeyken timeline'dan seçilen Ready grubun komşu dinlemesi başka gruba geçiyor. |
| Yeni bug | F830-02 | P3 | Genel telaffuz sözlüğünün başarılı kaydı, kaynak sözlüğüyle birleşince kaynak sözlüğünün okunmasını ve o kaynağın üretimini engelleyebiliyor. |
| Yeniden açılmış bug | R830-01 → R815-B98 | P2 | Araştırma kaynak bütçesi dolunca yeni W1 pasajı eski W1 kaynak listesiyle sunuluyor. Mevcut regresyon testi FAIL. |
| Ayrı öneriler | G830-01–06 | Bug değil | Altı dar geliştirme/ekleme önerisi; mevcut özelliklerin uzantısı olanlar açıkça belirtiliyor. |

**2 yeni bug + 1 doğrulanmış regresyon; 6 ayrı öneri.** Regresyon üçüncü yeni keşif diye sayılmadı. Film alanında **0 yeni doğrulanmış bug**; elenen şüphe aşağıda kaydedildi. P3 telaffuz sınırının yüksek önkoşulunu belirtir; normal birkaç kurallı sözlüklerin bozulduğu iddia edilmiyor.

## F830-01 — Komşularıyla dinle, filtre dışındaki seçili grubu değiştiriyor

**Tekrar:** Tam çıktı 12 saniye; Ready A grubu 2–4, Review B grubu 8–10 saniyede olsun. Kalite kartı filtresini **Review** yap, timeline filtresini **Tümü** bırak. Timeline'dan A'yı seç; A metni ve seçili durumu görünürken **Komşularıyla dinle** düğmesine bas.

**Beklenen:** A seçili kalmalı; aynı tam WAV'dan en fazla ±1,25 saniyelik bağlamla yaklaşık 0,75 saniyeden dinlenmeli.

**Görülen:** Tıklamadan önce timeline A, filtrelenmiş kalite select'i B'dir. Tıklama timeline seçimini B'ye çevirir ve oynatma konumunu **6,75** saniye yapar. Kullanıcı A'yı dinlemek isterken B'ye yönlendirilir. **All kalite filtresi kontrolünde A korunur ve 0,75 saniye doğrudur.** Aynı WAV, aynı kaynak/generation ve açık dialog kullanılır; eski kaynak veya değiştirilmiş medya fixture'ı değildir.

**Kök:** [dub-workspace-ui.js:38](../../src/renderer/dub-workspace-ui.js#L38) seçilen key kalite select seçeneklerinde yoksa timeline/quality seçimini eşitlemez. [dub-generator-ui.js:40](../../src/renderer/dub-generator-ui.js#L40) sonrasındaki Review filtresi Ready seçeneği kaldırır. Komşu dinleme [workspace:88](../../src/renderer/dub-workspace-ui.js#L88) aynı-value `change` gönderir; [82](../../src/renderer/dub-workspace-ui.js#L82) dinleyicisi eski B select değerini tekrar timeline'a seçer. [89](../../src/renderer/dub-workspace-ui.js#L89) artık bu B'den komşu aralığını kurar ve [105](../../src/renderer/dub-workspace-ui.js#L105) sonrasındaki seek/play bunu tüketir.

**Kanıt:** [probe.cjs](evidence830/dubbing/probe.cjs), [result.json](evidence830/dubbing/result.json). Gerçek index.html ve iki üretim UI scripti jsdom'da değiştirilmeden çalışır; gerçek filtre düğmesi→timeline click→context click zinciri kullanılır. Audio duration/currentTime/play/pause ve kaynak adaptörü kontrollüdür. Native WAV decode, kulağa gelen ses veya Windows fare testi iddia edilmiyor; yanlış grup/key ve istenen oynatma konumu deterministik ölçülür.

**Dedup/kabul:** R803 filtreleri ve generator `selectQuality` yolunun filtre dışı key için All'a geçmesi zaten vardır; workspace bu yolu kullanmıyor. R829 Q07 eski pause-event yarışı/source/metadata iptali farklıdır; yeni birleşim iki selector + Review filtresi + komşu dinlemedir. R826 Home ve R815-B36 parser kimlik kökleri değil. [100 tarihsel imza](evidence830/dubbing/registry-reviewed.json) yeni test sayılmadı. Geçici çözüm kalite filtresini All yapmak veya mevcut exact-row dinlemeyi kullanmaktır. İleride A key/konum korunmalı; gerçek pause/source/busy ve filtre kontrolleri sürmelidir. Uygulanmadı.

## F830-02 — Genel sözlük kaydı mevcut kaynak sözlüğünü kullanılamaz duruma getiriyor

**Önkoşul/tekrar:** Kaynağa özel 1 geçerli telaffuz kuralı kaydet. Genel sözlüğe o kuralla çakışmayan 99 kural kaydet; birleşik100 kural okunur. Sonra genel sözlüğe bir yeni kural daha ekleyerek **100 genel kuralı** kaydet. Bu iki kayıt, arayüzün mevcut kaynak/genel kapsamları ve geçerli normal girişleriyle yapılabilir; elle bozuk JSON gerekmez.

**Beklenen:** Genel kayıt mevcut kaynakları birleşik100 kural sınırının dışına çıkaracaksa açık ve tutarlı biçimde reddedilmeli veya miras politikası bunu güvenle desteklemelidir. Başarılı kayıt sonrası önceden çalışabilen kaynağın neden kullanılamadığı ancak tekrar açma/üretimde ortaya çıkmamalı.

**Görülen:** Genel100 kayıt `ok:true` döner. Önceden kaydedilmiş kaynak sözlüğü değiştirilmez, fakat kaynak `get` ve gerçek `dub:start` artık **`Use at most 100 pronunciation entries.`** ile başarısızdır; **0 süreç başlatılır**. Aynı genel100 ile özel kuralı olmayan başka kaynak okunur. Genel sözlük tekrar99'a düşürülünce etkilenen kaynak birleşik100 ile tekrar okunur. Bu kaynak dosyasının silinmesi veya tüm dublajın bozulması değildir; özel+genel kural toplamının sınırı aşması gerekir.

**Kök/kaynak:** [dub-pronunciation.js:4](../../src/dub-pronunciation.js#L4) normalizer100 sınırı uygular. [dub-pronunciation-store.js:15](../../src/dub-pronunciation-store.js#L15) resolve miras+özel kuralları birleştirip yeniden normalize eder; [save:21](../../src/dub-pronunciation-store.js#L21) kaynak kaydında birleşimi yazmadan doğrular. Buna karşılık [dub-service.js:401](../../src/dub-service.js#L401) handler'ının [412](../../src/dub-service.js#L412) sonrasındaki **genel** kayıt kolu yalnız genel diziyi doğrular/yazar, mevcut kaynaklarla birleşik kapasiteyi denetlemez. [512](../../src/dub-service.js#L512) start tüketicisi aynı resolve'da durur. [renderer global Save:369](../../src/renderer/dub-generator-ui.js#L369) ve [preload:30](../../src/preload.js#L30) bu gerçek kullanıcı yoludur.

**Kanıt:** [probe.cjs](evidence830/pronunciation/probe.cjs), [result.json](evidence830/pronunciation/result.json). Gerçek `registerDubService`, guards, config, iki sözlük dosyası, kaynak get/save ve start handler çalıştırıldı.99+1 olumlu sınır,100+1 hata, özel kuralı olmayan kaynak100,99'a dönüşle iyileşme, yetkisiz kayıt reddi ve kaynak dosyasının byte aynı kalması ölçüldü. Engine dosyaları yalnız varlık fixture'ıdır; spawn çağrısı0. Gerçek GPU/TTS/model çalıştırılmadı; yetki/subtitle grant/sender adaptörleri kontrollüdür.

**Dedup:** [1 Kasım telaffuz kaydı](DUB_PRONUNCIATION_SYNC_2026-11-01.md) ve `dub-pronunciation-store.test.js` birleşik100 sınırını **kaynak kaydı** sırasında doğrular. Bu hata ters sıradaki **sonraki genel kayıt** kolundadır; mevcut test o kolu çalıştırmaz. R821-33sağlayıcı kapasitesi ve eski R815 parser/cache sorunları ayrı modüllerdir. [F22/F26/F50 imzaları](evidence830/pronunciation/registry-reviewed.json) bu yeni global-update→source-resolve sözleşmesini kanıtlamaz. Geçici çözüm genel/özel kuralları birleşik100 içinde tutmaktır. Olası düzeltmede global save sonucu bütün mevcut kaynaklar için açık/tutarlı olmalı; eşleşen özel kural önceliği ve atomik kayıt korunmalı. Uygulanmadı.

## R830-01 — R815-B98 regresyonu: yeni pasaj eski W atfına bağlanıyor

**Durum ayrımı:** Bu yeni kök değildir. R815-B98 daha önce raporlanıp düzeltilmişti; R829'da eklenen metin fallback'i aynı kaynak bütçesi invariantını yeniden açıyor. **Mevcut, değişmemiş B98 testi ana ajan tarafından tekrar çalıştırıldı ve 1 FAIL / exit1 verdi.** Test kapatılmadı, beklenen sonuç gevşetilmedi ve ürün düzeltilmedi.

**Tekrar:** Aynı asistan turunda beş farklı `research_web` çağrısı, her aramada üç ayrı kamuya açık makale. Gerçek browser research producer her aramaya yerel W1/W2/W3 verir. Agent oturumu ilk10 URL'yi tutar. İlk arama üç kanonik pasaj; dördüncü arama kalan bir yeri W10 olarak doğru kullanır. Beşincinin üç URL'si bütçe dışında kalır.

**Görülen:** Beşinci sonuç `status:completed`, `passages:[]`, `sourceKind:provider_synthesis` olur. Metinde **`[W1] ... https://source5-1.example/article`** vardır; aynı mesajın `sources[0]` URL'si ise **`https://source1-1.example/article`** ve source5 URL'lerinin hiçbiri sources listesinde yoktur. Provider tool tüketicisi birbiriyle uyuşmayan yeni metin/eski kaynak haritasını alır. Son cevaba eklenen global kaynak listesi de eski W eşleşmesini korur. Gerçek modelin kullanıcıya kesin yanlış cevap verdiği ölçülmedi; bozuk kanıt paketi modele gerçekten iletilmiştir.

**Kök/kaynak:** [assistant-browser-research.js:21](../../src/assistant-browser-research.js#L21) ve [26](../../src/assistant-browser-research.js#L26) yerel atıflı pasaj metni üretir. [assistant-agent-service.js:119](../../src/assistant-agent-service.js#L119) global10 URL sınırı, [120](../../src/assistant-agent-service.js#L120) kanonik passages üretimi, [121](../../src/assistant-agent-service.js#L121) passages boşsa `providerText` fallback'i uygular. Browser'ın yerel W kimlikleri bu fallback'te yeniden eşlenmez. [assistant-provider.js:137](../../src/assistant-provider.js#L137) gerçek tool sonucunu modele iletir; [service:209](../../src/assistant-agent-service.js#L209) global kaynak listesini son yanıta ekler. [main.js:20393](../../src/main.js#L20393) sonrasındaki gerçek browser-research bağlantısı aynı producer'ı kullanır.

**Kanıt/kontroller:** [probe.cjs](evidence830/assistant/probe.cjs), [result.json](evidence830/assistant/result.json). Gerçek createResearch→agentRun→provider tool mesajı; openPage load/read/close ve provider HTTP yanıtı kontrollüdür. Tek arama doğru3 pasaj; dördüncü doğru1/W10; beşinci mismatch; her araştırma sayfası kapanır ve mutasyon/kart üretilmez. Audit probunun exit0 olması hatalı sonucun doğrulandığı anlamındadır. Ayrı mevcut test komutu:

```powershell
node --test --test-isolation=none --test-name-pattern='B98:' tests/report815-assistant-regressions.test.js
```

Gerçek sonuç **FAIL**; actual yerel W1/W2/W3 metni, expected boş metindir. [Ana kontrol kaydı](evidence830/parent-verification.json) bu başarısızlığı saklar. R815 remediation durumundaki `verified_fixed` tarihsel kayıt geriye dönük değiştirilmedi. R829 Q23 provider synthesis'i koruma hedefiyle eklenen fallback, meşru sağlayıcı sentezi ile bütçe dışında kalmış browser pasajını ayıramıyor. Olası düzeltme kanonik haritada yer almayan metni eski W kimlikleriyle sunmamalı; meşru sourced synthesis ve mevcut güvenli-source kontrolleri korunmalı. Uygulanmadı.

## Buglardan ayrı geliştirme/ekleme önerileri

Bu bölüm ürünün çalışmayan davranışlarını saymaz. Mevcut R829/R826 özellikleri yeniden icat edilmez; aşağıdaki maddeler onların dar uzantılarıdır. Sıra, kullanıcıya sağlayacağı somut fayda ve mevcut veriyle uygulanabilirliğe göredir.

| ID | Öneri ve dayanak | Fayda ve kabul ölçütü |
|---|---|---|
| G830-01 | **Telaffuz adayından geçtiği gruba git.** R829 mevcut aday×sayı ve düzenlenebilir taslak korunur. `dub-experience-model.pronunciationCandidates` yanında adayın geçtiği 2–3 grup/zaman ve özgün kısa metin gösterilebilir. | Kullanıcı ortak sözcük/özel ad ayrımını bağlamla yapar. Tıklama yalnız doğru gruba gider; okunuş uydurmaz, kaydetmez/üretmez. Kaynak değişince kanıt geçersizleşir. |
| G830-02 | **Belirsiz “bunu çevir” isteğinde mevcut kaynak seçeneklerini kullanıcıya seçtir.** R829 Q18 güvenli ret ve `translationChoices` bilgisi zaten var; yeni yetki veya otomatik araç seçimi önerilmiyor. | Sayfa, yakalanmış altyazı ve Whisper seçenekleri uygunluk/gerekçeyle görünür. Seçim kaynak/generation'a bağlı kalır; sonrasında mevcut ayrı onay kartı gerekir. R618'in üç video yolu ve R829 Q18 source-choice bilgisinin asistan içi seçim uzantısıdır. |
| G830-03 | **Film dayanağında kaydedilmiş anket seçimlerini göster.** R829 Q26 “anket dahil edildi” der; snapshot'taki en çok6 soru/seçim/meaning zaten kayıttadır. [Film kontrolünde](evidence830/films/result.json) iki kayıtlı meaning basis DOM'unda görünmüyor. | Kullanıcı eski analizin hangi seçimlerle yapıldığını okuyabilir. Güncel quiz geçmişe yazılmaz; eski snapshot yoksa alan gizlenir. Yeni analiz/ağ isteği/kayıt başlatılmaz. Bu bir bozuk kayıt bugı değildir. |
| G830-04 | **Film analizinin neden bayatladığını girdi sınıfıyla açıkla.** Mevcut current/stale/unknown çalışıyor; `decisionFreshness` genel stale verir. | Profil/anket, film bilgisi/konu ve yorum örneği sınıflarından değişenleri kısa göster. Eski kişisel notu otomatik açma; unknown korunur, analiz otomatik başlamaz. R815-G27 ile R826/R829 freshness'in uzantısı; var olan eski/yeni analiz karşılaştırması tekrar önerilmez. |
| G830-05 | **Araştırma kapsamını okunan/sunulan/bütçe dışı kaynak olarak göster.** R830-01 atıf eşleşmesini düzeltmek ayrı bug işidir; burada kullanıcıya kapsamı görünür kılma önerilir. | “Kaynak bulunamadı” ile “kaynak bütçesine alınmadı” ayrılır. En çok10 kaynak sınırı açık görünür; sonraki kaynaklara geçiş eski W haritasını değiştirmeden yeni kontrollü kapsamla yapılır. R798 araştırma/`read_tool_result` ve R829 Q23 kapsam açıklamasının uzantısıdır; mevcut `read_tool_result` normalizasyonda elenen kaynakları geri getirmez. Tam web tarandı iddiası yok. |
| G830-06 | **Komşu dinlemede gerçek aralığı göster; isteğe bağlı bilinen sahne sınırında daralt.** Sabit±1,25 saniye mevcut geçerli sözleşmedir ve hata sayılmaz. | Varsayılan korunur; kullanıcı isterse yalnız mevcut konuşmacı/sahne metadata'sıyla sınırlandırılır. Tahmini ses/sahne sınıflandırması uydurulmaz, ham WAV değişmez, pause/seek/source guards korunur. R829 Q03 seviye devamlılığı veya mevcut A/B özelliği tekrar önerilmez. |

Film tarafında gerçek renderer preview→kontrollü answer→Save→gerçek servis/diske yazma→Get→kayıtlı örneği kullan zinciri hem library hem discovery kimliğiyle geçti. Yanlış IMDb reddi, current/stale ve kaydedilmiş profil korunması da geçti. Başta “discovery kaydı kimlik taşımıyor” şüphesi vardı; [review-decision-ui.js:81](../../src/renderer/review-decision-ui.js#L81) yerel wrapper discovery ekliyor ve gerçek zincir bunu doğruluyor. **Bug sayılmadı.** Öneri G830-03/04 bu çalışan akışın açıklama derinliğidir; filmde yapay bug üretilmedi.

## Kontroller ve tekrar çalıştırma

Repo kökünden aşağıdaki betikler yeni `.uiprev/audit830-*` sentetik dizinlerine yazar. Her alana ayrı `AUDIT830_OUT` verilebilir. Kaynak revizyonunu `AUDIT830_HEAD` ile etiketlemek başka revizyonda aynı sonucun geçtiği anlamına gelmez; [manifest](evidence830/manifest.json) gerçek kaynak hashlerini bağlar.

```powershell
$env:AUDIT830_HEAD = '6d4c2d661257263f0f9414b2bdf8ba53f84513c9'
node docs/raporlar/evidence830/dubbing/probe.cjs
node docs/raporlar/evidence830/pronunciation/probe.cjs
node docs/raporlar/evidence830/assistant/probe.cjs
node docs/raporlar/evidence830/films/probe.cjs
```

Ana ajan yayımlanacak dört probu yeni ayrı dizinlerde tekrar çalıştırdı: **4/4 exit0**, dört CJS syntax geçti. Yanlış davranışı bekleyen audit assertion PASS'i onarım değildir. Mevcut kontroller: pronunciation/store runner3/3; workspace UI exit0, workspace5/5; assistant-flow-state/assistant-quality829/review-analysis-context/letterboxd-sampling-critical birlikte **30/30**. Ayrı B98 hedefi **1 FAIL / exit1**. Yeşil ve kırmızı sonuçlar birbirine karıştırılmadı. Test silinmedi/eşik gevşetilmedi; kullanıcı rapor istediği için regresyon düzeltilmedi.

Night1000 README/registry ve ilgili **260 benzersiz tarihsel imza** (alan dosyalarında300 referans), R815 mapping/remediation, R818–R823 düzeltme commit'i, R826/R829 rapor/plan/ilgili devir notları incelendi. İmzalar yeniden koşulmuş260 test veya bug değildir. [Ana doğrulama kaydı](evidence830/parent-verification.json) komut ve sınırları tutar. Dış kod/paket/model alınmadı; mevcut modüller ve kurulu Node24.22.0/jsdom30.0.1 kullanıldı.

**Windows ve kapsam:** Yerel JSON/dosya/UTF-8/Türkçe SRT işlendi. `start.bat`/`install.bat` kaynakları incelendi; normal açılış/temiz kurulum çalıştırılmadı. Native Electron pencere, gerçek ses/WAV decode, GPU/CUDA/TTS/doğallık, canlı site/hesap/LLM, DRM, uzun soak ve tüm DPI/ekran okuyucu bu turun kanıtı değildir. Önceki R829 canlı başarıları bu tur tekrar yapılmış sayılmadı. Tam npmtest/CI sonucu beklenmedi, CI kapatılmadı. Kişisel profil/anahtar/medya/ayar ve açık kullanıcı uygulaması kullanılmadı veya değiştirilmedi. Yalnız rapor, seçilmiş sentetik kanıt ve devir teslim edilir.
