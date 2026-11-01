# R838 — Mevcut özellikleri geliştirmek için açık kaynak araştırması

1 Kasım 2026. Başlangıç: `master`, `b74b0e1200f9d6e3c3af14d82fc4fe86ccb983b5`. **14 depo incelendi; 18 somut geliştirme yolu öneriliyor. Bu bir yeni bug sayımı veya uygulama teslimi değildir. Ürün kodu, ayarlar ve bağımlılıklar değiştirilmedi.**

En yüksek getiriyi bütün uygulamayı başka bir framework'e taşımakta görmüyorum. Önce asistanın akış ayrıştırıcısını ve veri sözleşmelerini sağlamlaştırmak; sonra mevcut altyazı denetimine seçilebilir düzeltmeler, dublaj teslimine ölçülebilir kalite kontrolü eklemek daha mantıklı. Film tarafında yeni bir öneri motorundan önce kimlik ve izleme olayı modelini düzeltmek gerekiyor. Aşağıda hazır kütüphane, seçilmiş kod uyarlaması ve yalnız mimari örnek olarak kullanılacak kaynaklar ayrıdır.

## Önce mevcut olanı ayıralım

| Mevcut bileşen | Bu araştırmada önerilen gerçek fark |
|---|---|
| `ffsubsync==0.5.1`, ses VAD ve referans altyazı hizalaması | Yeni motor kurmak yerine kontrollü ileri seçenekler, teşhis ve aday karşılaştırması |
| Vendored Defuddle 0.19.5 | Kaynak sadakati testleri; incelenen 0.19.6 kaynak farkının koşullu değerlendirilmesi |
| assistant-ui'den alınmış parçalar, kalıcı/dallanan sohbet; Remend 1.4.0 | Aynı özellikleri yeniden önermek yerine veri sözleşmesi ve uzun iş sürekliliği |
| İş/akış kayıtları, devam ve onay kartları | Sıfırdan iş sistemi değil; yeniden başlatma ve yan etki tekrarını açık sözleşmeye bağlamak |
| WhisperX, faster-whisper; mevcut zamanlama/sessizlik araçları | Yeni ASR varsayılanı değil; düzenleme ve zaman koordinatlarını geliştirmek |
| FFmpeg; seslendirme WAV'ına loudnorm | Son videonun gerçek birleşik sesini ölçmek, çıktı izlerini doğrulamak |
| mpv ve rqbit isteğe bağlı entegrasyonları | Bunları yeni keşif diye yeniden saymamak |

24 Ekim tarihli [asistan araştırması](ASSISTANT_REPO_RESEARCH_2026-10-24.md) tarihsel bir plandır. Oradaki “henüz yok” ifadeleri bugünkü durumun kanıtı olarak kullanılmadı. R835/R837'deki önerilerin bazılarına burada uygulanabilir dış kaynak eşleştiriliyor; bunlar ikinci kez yeni bug veya tümüyle yeni ürün fikri diye sayılmıyor.

## Depo karar tablosu

“Güncel” burada 1 Kasım araştırmasında alınan varsayılan dal HEAD'idir; yayımlanmış kararlı paket sürümü anlamına gelmez. Kesin commit, tarih ve kaynak SHA256 değerleri [depo kaydında](research838/repositories.json) ve [dosya kaydında](research838/source-review.json) tutulur.

| Depo | İncelenen lisans | Karar / edinme biçimi | Başlıca maliyet veya sınır |
|---|---|---|---|
| [eventsource-parser](https://github.com/rexxars/eventsource-parser) | MIT | Küçük bağımlılık adayı; önce main tarafında pilot | İncelenen 4.1.3 ESM; CommonJS'e doğrudan require edilmemeli |
| [Ajv](https://github.com/ajv-validator/ajv) | MIT | Build sırasında bağımsız doğrulayıcı üretmek | Renderer'da çalışma anında kod üretimi katı CSP ile çakışabilir |
| [XState](https://github.com/statelyai/xstate) | MIT | Tek akışta pilot veya geçiş tablosu örneği | İncelenen core 5.33.3; mevcut akışları topluca taşımak gereksiz |
| [LangGraph](https://github.com/langchain-ai/langgraph) | MIT, incelenen çekirdek | Checkpoint ve insan onayı mimari örneği | Python grafiğini Node asistanına taşımak ek işletim yükü |
| [Subtitle Edit](https://github.com/SubtitleEdit/subtitleedit) | Güncel incelenen LICENSE: MIT | Seçilmiş kuralları uyarlamak; CLI sonraki seçenek | seconv .NET 10, ek native bağımlılıklar; tüm uygulama gömülmemeli |
| [pysubs2](https://github.com/tkarabela/pysubs2) | MIT | İsteğe bağlı format adaptörü / karşılaştırma aracı | HEAD Python >=3.12; mevcut 3.10/3.11 kurulumuyla doğrudan uyumlu değil |
| [ffsubsync](https://github.com/smacke/ffsubsync) | MIT | Mevcut entegrasyonu geliştirmek | Yeni bağımlılık değil; Silero yolu ek model/torch yükü doğurabilir |
| [wavesurfer.js](https://github.com/katspaugh/wavesurfer.js) | BSD-3-Clause | İsteğe bağlı bölge düzenleyici pilotu | Uzun videoyu ikinci kez tümüyle decode etme ve native video katmanı riski |
| [OpenTimelineIO](https://github.com/AcademySoftwareFoundation/OpenTimelineIO) | Apache-2.0 | Zaman sözleşmesi örneği; sonradan isteğe bağlı dışa aktarım | C++/Python paketleme, editörler arası gerçek kabul gerekli |
| [FFmpeg](https://github.com/FFmpeg/FFmpeg) | Temel LGPL-2.1+; seçeneklerle GPL/nonfree koşulları değişir | Zaten kullanılan aracı daha iyi değerlendirmek | Dağıtılan binary'nin build seçenekleri ayrıca belirlenmeli |
| [Jellyfin](https://github.com/jellyfin/jellyfin) | GPL-2.0; incelenen kök lisans GPLv2 | Yalnız mimari örnek; bağımsız uygulama | MIT ürüne doğrudan GPL kod kopyası önerilmiyor |
| [Defuddle](https://github.com/kepano/defuddle) | MIT | Mevcut vendored bileşene kontrollü iyileştirme | Otomatik sürüm yükseltme değil, uygulama fixture'ları belirleyici |
| [Mozilla Readability](https://github.com/mozilla/readability) | Apache-2.0 | Karşılaştırma aracı; kanıtlanırsa seçici fallback | İkinci varsayılan okuyucu eklemek maliyetli; sanitizer değildir |
| [stable-ts](https://github.com/jianfch/stable-ts) | MIT | Yeni varsayılan bağımlılık olarak beklet | Araştırma anında arşivlenmiş; yalnız algoritma/karşılaştırma kaynağı |

## Asistan: güvenilir akış ve sürdürülebilir iş yönetimi

### Ö01 — SSE ayrıştırıcısını küçük, olgun bir parçayla değiştirme adayı

**Alınacak parça:** eventsource-parser'ın CR, LF, CRLF ve chunk sınırı durumlarını ayıran parser'ı. [Kaynak](https://github.com/rexxars/eventsource-parser/blob/f46b5575f72682527ed936763983bdda0e1283f5/src/parse.ts) ve [paket sözleşmesi](https://github.com/rexxars/eventsource-parser/blob/f46b5575f72682527ed936763983bdda0e1283f5/package.json) incelendi. Mevcut `src/assistant-provider.js` içinde satır arama ve event birleştirme elle yapılıyor. R837 ekindeki CR-only davranışı tarihsel bir ihtiyaçtır; bu raporda yeniden bug sayılmıyor.

**Entegrasyon:** Yalnız SSE çerçeveleme katmanını değiştiren main tarafı adaptörü. Tool-call birleştirme, iptal, yanıt boyutu, `[DONE]`, eksik yanıt ve sağlayıcı yetenek kararları bizde kalmalı. İncelenen paket Node >=22.12 ister; projenin >=22.13 sınırı motor açısından yeterli. Ancak paket ESM'dir: async import veya mevcut esbuild ile kontrollü bundle gerekir. Bütün AI SDK'sını taşımaya gerek yok.

**Kabul:** Aynı mantıksal yanıtın LF/CRLF/CR ve her byte sınırında parçalanmış hali aynı metin/araç çıktısını üretmeli; aşırı uzun frame ve toplam akış mevcut sınırları aşmamalı; iptal edilmiş akış yeni karta dönüşmemeli. **Öncelik yüksek, kapsam küçük.**

### Ö02 — Paylaşılan, sürümlü veri sözleşmeleri için Ajv standalone

**Alınacak parça:** [Ajv standalone üreticisi](https://github.com/ajv-validator/ajv/blob/f177fe323420ccb23e1a79445fd470cbf80aee7c/lib/standalone/index.ts). Sohbet mesajı, devam kaydı, iş sonucu ve içe aktarma zarfı için uygulamaya ait JSON Schema'lardan build sırasında doğrulayıcı üretilebilir. Mevcut elle kontroller tamamen yok sayılmamalı; ortak kuralların farklı katmanlarda ayrışmasını azaltmak amaçlanıyor.

**Entegrasyon:** `assistant-thread-store.js`, `assistant-jobs.js`, kaynak bağlamı ve main/renderer sınırlarında aynı üretilmiş sözleşme. `schemaVersion`, kaynak kimliği, dil etiketi, iş durumu ve artifact ilişkileri açık olmalı. BCP47 gibi uygulama kuralları bilinçli format/ek doğrulayıcı ister; Ajv kendiliğinden dil politikası belirlemez. Hatalı kayıt sessizce “onarılmamalı”; anlaşılır hata ve güvenli eski sürüm göçü gerekir.

**Windows/CSP:** Çalışma anında renderer'da `new Function` kullanan derleme yerine önceden üretilmiş yerel JS yüklenmeli; inline/eval/CSP gevşetme gerekmemeli. Kabul fixture'ı eski sürüm, bozuk ilişki, bilinmeyen alan, uzun içerik ve script-region dil etiketi içermeli. **Öncelik yüksek, kapsam orta.**

### Ö03 — Bir karmaşık akışta XState geçiş tablosu pilotu

**Alınacak parça:** Actor yaşam döngüsü, snapshot ve restore ayrımı; [createActor](https://github.com/statelyai/xstate/blob/060cd63378b46b32e7559d569ed3ad112ee60084/packages/core/src/createActor.ts), [core paket](https://github.com/statelyai/xstate/blob/060cd63378b46b32e7559d569ed3ad112ee60084/packages/core/package.json). İlk aday asistanın öneri → insan onayı → iş bekleme → sonuç → devam akışıdır. Bütün renderer'ı XState'e taşımak önerilmiyor.

**Entegrasyon:** `assistant-flow-state.js`, `assistant-agent-service.js`, onay kartları ve iş olaylarının mevcut sahiplik kontrolleri korunarak tek akışın durumları belgelenir. Önce kütüphanesiz geçiş tablosu bile faydalı olabilir; olay sayısı ve geçersiz kombinasyonlar bunu haklı çıkarırsa küçük pilot bağımlılık olur. İncelenen v5.33.3 için CJS çıkışı mevcut; v6 alpha belgeleri v5 davranışı diye kullanılmamalı.

**Kabul:** Aynı tamamlanma olayının iki kez gelişi, kaynak değişimi, beklerken pencere kapanması, onayın reddi ve iptal sonrası geç sonuç kartı doğru sonuca ulaşmalı. Snapshot içine API anahtarı, native handle veya büyük medya konmaz. **Öncelik orta; karar önce model, sonra kütüphane.**

### Ö04 — LangGraph'tan kaynak ve yan etki bağlı checkpoint deseni

**Alınacak parça:** [Checkpoint arayüzleri](https://github.com/langchain-ai/langgraph/blob/e5c961d7fbe7ca6fdd4c94c84d90511372514d55/libs/checkpoint/langgraph/checkpoint/base/__init__.py) ve [interrupt/resume türleri](https://github.com/langchain-ai/langgraph/blob/e5c961d7fbe7ca6fdd4c94c84d90511372514d55/libs/langgraph/langgraph/types.py). `thread_id`, checkpoint kimliği ve tamamlanmış yazıları ayırma fikri mevcut Node iş kayıtlarına uyarlanabilir. Python LangGraph servisi veya bulut ürünü kurmak gerekmiyor.

**Ek değer:** Uygulama yeniden açıldığında “uzun iş vardı” bilgisinden öte; hangi kaynak revizyonu, hangi bağımlılık, hangi onay, hangi başarılı çıktı ve hangi ücretli çağrı tamamlandı sorularını cevaplayan bir devam kaydı. Bu, R837'deki uzun iş sürekliliği önerisine uygulanabilir bir mimari dayanak sağlar.

**Kritik sınır:** Resmî [interrupt açıklaması](https://github.com/langchain-ai/docs/blob/main/src/oss/langgraph/interrupts.mdx) devamda node başlangıcının tekrar çalışabildiğini açıklar. Kalıcı grafik tek başına “tam bir kez çalıştırma” sağlamaz. Bizde adım anahtarı, idempotent sonuç kaydı, onay kapsamı ve kaynak eşitliği ayrıca tasarlanmalı. Kabul: ödemeli çağrıdan sonra kapanış, tamamlanan artifact'tan önce kapanış, eski kaynak ve yinelenen resume. **Öncelik yüksek ihtiyaç, uygulama kapsamı orta/büyük.**

## Altyazı: kalite denetimi ve düzenleme

### Ö05 — Subtitle Edit'ten seçilebilir kalite kuralları ve değişiklik önizlemesi

**Alınacak parça:** Tek bir “her şeyi düzelt” düğmesi yerine kural bazlı tarama, önce/sonra, seçerek kabul ve atlama modeli. İncelenen [CLI kural yürütücüsü](https://github.com/SubtitleEdit/subtitleedit/blob/0590b6e95d08c21e83b3881893b00012974d7af7/src/seconv/Core/FixCommonErrorsRunner.cs) ve [SubRip format kodu](https://github.com/SubtitleEdit/subtitleedit/blob/0590b6e95d08c21e83b3881893b00012974d7af7/src/libse/SubtitleFormats/SubRip.cs) somut başlangıç kaynaklarıdır. Mevcut `browser-subtitle-review.js` ve `subtitle-export-validation.js` geliştirilir; kalite kontrol varmış gibi değil, zaten var olduğu kabul edilerek kapsam genişletilir.

**Önerilen ürün davranışı:** Süre/okuma hızı, tekrar eden noktalama, satır yapısı ve biçim sorunları aynı raporda görünür; anlam veya zaman değiştiren her işlem önizlemeli olur. Kurallar dil, biçim ve kullanıcı kilitlerini bilmelidir. Kaynakta bulunan her kuralı körlemesine taşımak yerine küçük bir uygulanabilir küme seçilir.

**Edinme biçimi:** Güncel incelenen [LICENSE MIT](https://github.com/SubtitleEdit/subtitleedit/blob/0590b6e95d08c21e83b3881893b00012974d7af7/LICENSE); seçilmiş kural uyarlaması ve kaynak bildirimi en hafif yol. CLI [net10.0 hedefli](https://github.com/SubtitleEdit/subtitleedit/blob/0590b6e95d08c21e83b3881893b00012974d7af7/src/seconv/SeConv.csproj) ve native paketler taşıyor; opsiyonel Windows aracı sonraki seçenek. Kabul: seçili satırlar dışı değişmemeli, tek undo ile geri dönmeli, değişen kaynakta eski öneri uygulanmamalı. **Öncelik yüksek, sınırlı kurallarla orta kapsam.**

### Ö06 — Türkçe bozuk karakterleri dil bağlı ve geri alınabilir onarma

**Alınacak parça:** [FixTurkishAnsiToUnicode](https://github.com/SubtitleEdit/subtitleedit/blob/0590b6e95d08c21e83b3881893b00012974d7af7/src/libse/Forms/FixCommonErrors/FixTurkishAnsiToUnicode.cs) içindeki `Ý/Ð/Þ` ve küçük harf karşılıklarının Türkçe eşlemeleri ile düzeltmeyi tek tek kabul ettiren callback yaklaşımı. Mevcut `subtitle-encoding-preview.js` akışına “olası Türkçe kodlama hasarı” önerisi olarak bağlanabilir.

**Neden ayrı öneri:** Dosya kodlamasını doğru seçmek ile zaten Unicode olarak içe alınmış bozuk harfleri onarmak farklı işlerdir. Bu harfler başka dillerde gerçek karakter olabilir; tüm altyazılarda global otomatik replace yanlış olur. Dil kanıtı, örnek satır ve önce/sonra gösterimi şarttır.

**Kabul:** Türkçe hasarlı örnekte doğru öneri; İzlandaca gerçek harflerde otomatik değişiklik olmaması; dosya yolundaki Türkçe harfler ve SRT/ASS UTF-8 BOM sözleşmesinin korunması. **Öncelik orta, kapsam küçük; kullanıcı onayıyla yüksek pratik yarar.**

### Ö07 — pysubs2 ile isteğe bağlı stil/format dönüşüm adaptörü

**Alınacak parça:** [SSAFile modeli](https://github.com/tkarabela/pysubs2/blob/6371ae8bc2f9fed19aeb51a8e09d920e8bb86ce5/pysubs2/ssafile.py) ve [ASS/SSA okuyucu-yazıcı](https://github.com/tkarabela/pysubs2/blob/6371ae8bc2f9fed19aeb51a8e09d920e8bb86ce5/pysubs2/formats/substation.py). SRT'ye indirgerken stil kaybını bildiren dönüşüm, ASS düzenleme örnekleri ve kendi yazıcılarımız için bağımsız round-trip karşılaştırması mümkün. Mevcut transkripsiyon çekirdeği ve çıktı yazıcıları ilk adımda değiştirilmez.

**Uyumluluk kapısı:** İncelenen HEAD'in [pyproject](https://github.com/tkarabela/pysubs2/blob/6371ae8bc2f9fed19aeb51a8e09d920e8bb86ce5/pyproject.toml) dosyası Python >=3.12 ister. Projenin 3.10/3.11 kurulumunu sadece bu paket için yükseltmek uygun değil. Resmî [PyPI 1.8.0 metadatası](https://pypi.org/project/pysubs2/1.8.0/) Python >=3.9 bildirir; wheel/sdist hashleri [kayıtta](research838/pysubs2-1.8.0-metadata.json). Bu sürümün kaynağı bu tur incelenmedi, paket kurulmadı: yalnız uyumlu sürüm adayıdır.

**Kabul:** Desteklenen biçimler için stilli fixture, italik/tag/konum, Türkçe, satır sonu ve zaman kayması karşılaştırması; kayıplı dönüşüm açık uyarı vermeli. “Tüm formatları kayıpsız dönüştürür” iddiası yok. **Öncelik orta; sürüm kaynak incelemesine bağlı.**

### Ö08 — Var olan ffsubsync'e teşhisli gelişmiş hizalama modu

**Alınacak parça:** [Framerate/offset seçenekleri](https://github.com/smacke/ffsubsync/blob/de310ac6944b8260431a48ee741e7063cec49b0f/ffsubsync/ffsubsync.py) ve [VAD kaynakları](https://github.com/smacke/ffsubsync/blob/de310ac6944b8260431a48ee741e7063cec49b0f/ffsubsync/speech_transformers.py). `backend/browser_align.py` zaten ses ve referans altyazı hizalıyor. Öneri, gerekçeli aday karşılaştırması: sabit offset mi, FPS/drift farkı mı, yeterli konuşma yok mu?

**Ürün davranışı:** Önce/sonra örnekleri ve düşük güven gerekçesi; gelişmiş sınırları bilinçli seçme; orijinal altyazıyı ve undo'yu koruma. Mevcut `autoApply:false` korunmalı. Skor zamansal örtüşmedir, cümlenin anlam bakımından doğru olduğu kanıtı değildir.

**Maliyet:** Mevcut 0.5.1 sabiti kendiliğinden yükseltilmez. Silero seçeneği model indirme/torch ve çevrimdışı yük doğurabilir; doğrulanmadan varsayılan olmaz. Kabul: sabit offset, 23.976/25 benzeri drift, sessiz klip, müzik ağırlıklı bölüm, yanlış bölüm altyazısı ve Windows Türkçe yol fixture'ları. **Öncelik yüksek, mevcut entegrasyona orta kapsamlı ek.**

### Ö09 — Dalga biçiminde hassas cue sınırı düzenleme

**Alınacak parça:** wavesurfer.js [regions eklentisinin](https://github.com/katspaugh/wavesurfer.js/blob/09d2c875983e421303b239cd918da34e76aa853e/src/plugins/regions.ts) sınır sürükleme/yeniden boyutlandırma ve düzenleme bitti olayları. Dalga biçimi ve zamanlama önerileri uygulamada zaten var; burada önerilen kontrollü, seçili cue üzerinde daha tutarlı sınır etkileşimidir.

**Entegrasyon:** Önceden üretilmiş FFmpeg peak verisini kullan; iki saatlik videoyu tarayıcıda yeniden tümüyle decode etme. Sürükleme boyunca görsel önizleme, bırakıldığında tek transaction/undo; timingLocked ve kaynak revizyonu kontrolü. Amplitüd zarfı otomatik konuşma tanıma değildir.

**Kabul:** Kaynak video, kırpılmış ses ve dublaj saatleri karıştırılmadan aynı cue'yu göstermeli; komşuya taşma politikası, klavye ince ayarı, zoom ve native video üstü tıklama gerçek Windows'ta doğrulanmalı. Tema kendi grafit/amber token'larından gelmeli. **Öncelik orta; küçük bir ekran pilotu gerekli.**

## Dublaj ve zaman çizgisi: güvenilir teslim

### Ö10 — OpenTimelineIO'dan açık zaman tabanı sözleşmesi

**Alınacak parça:** [RationalTime](https://github.com/AcademySoftwareFoundation/OpenTimelineIO/blob/80c5ff30938e4adffe9c94f419b1055856cee9f5/src/opentime/rationalTime.h) içinde zaman ile hızın birlikte taşınması ve başka rate'e açık dönüşüm fikri. `dub-sync-map.js`, `dub_export.py` ve kırpılmış transkripsiyon akışında `source/video/audio/clip` koordinatlarının sınırlarını isimlendirmek yararlı.

**Önemli doğruluk:** İncelenen sınıf değer ve rate'i `double` olarak tutuyor; adı “RationalTime” diye keyfi kesin kesir aritmetiği sağladığını iddia etmiyorum. Alınacak şey açık koordinat/rate sözleşmesi ve dönüşüm sorumluluğudur; küçük bağımsız veri tipimizle uygulanabilir, tüm C++ kütüphanesi gerekmez.

**Kabul:** 23.976/29.97, uzun süre, clip-start, değişen video hızı ve parçalı dublaj haritasında aynı olayın tüm çıktılarda beklenen frame toleransında kalması. **Öncelik yüksek altyapı; mevcut sözleşmeler üzerine orta kapsam.**

### Ö11 — Dublaj projesini editöre taşımak için OTIO dışa aktarımı

**Alınacak parça:** OpenTimelineIO track/clip/gap modeline dayalı isteğe bağlı `.otio` proje adaptörü. Orijinal ses, üretilmiş konuşma ve video klipleri harici düzenleyicide yeniden düzenlenebilir bir teslim paketine dönüşebilir. Ö10 ile ilişkili ama farklı bir ürün çıktısıdır.

**Sınır:** OTIO video render, medya mux veya tüm medyayı kendiliğinden paketleme motoru değildir. Parçalı/lineer olmayan hız haritası klip bölme ya da desteklenmeyen dönüşüm bildirimi gerektirebilir. Yol taşınabilirliği, eksik asset listesi, relative medya dizini ve karşı editör desteği ayrıca doğrulanmalı. C++/Python binding ve Windows wheel maliyeti nedeniyle ilk teslim kapsamına koymam.

**Kabul:** Temiz bir Windows makinesinde taşınan sentetik proje, hedef editörde aynı toplam süre ve parça başlangıçlarıyla açılmalı; desteklenmeyen efekt açıkça listelenmeli. **Öncelik sonraki aşama, kapsam büyük; profesyonel kullanım ihtiyacıyla koşullu.**

### Ö12 — Son birleşik sese ölçüm ve iki geçişli loudness kontrolü

**Alınacak parça:** FFmpeg [loudnorm ölçüm/linear seçenekleri](https://github.com/FFmpeg/FFmpeg/blob/e2740a3e0daab338b0ec60de407e444f68f9d119/libavfilter/af_loudnorm.c). `dub_normalize.py` zaten konuşma WAV'ını -20 LUFS / -2 dBTP hedefiyle işliyor. Yeni fark konuşma, kaynak ses, ducking ve fade sonrasında **teslim edilen birleşik sesin** ölçülmesidir; aynı normalize özelliği yeniden önerilmiyor.

**Ürün davranışı:** Son miksin integrated loudness, true peak ve LRA ölçümü; seçilen teslim profiline göre gerekirse ölçüm girdili ikinci geçiş; öncesi/sonrası fişi. Hedef ses seviyesi kullanıcı profiliyle seçilir, tek evrensel rakam dayatılmaz. Ek işlem kullanıcıyı habersiz iki kat render bekletmemeli; süre ve iptal görünür olmalı.

**Kabul:** Yalnız konuşma, yüksek arka plan, sessizlik, clipping ve çok kanallı örnekte gerçek dosyanın ölçümü; doğal ses ve denge için A/B dinleme. Bu tur ses üretilmedi/dinlenmedi. **Öncelik yüksek; mevcut FFmpeg hattına orta kapsam.**

### Ö13 — Ayrı ses katmanları, son zamanlı altyazı ve teslim fişi

**Kaynak ve yaklaşım:** Mevcut FFmpeg/ffprobe altyapısı ile R837'deki stem ve son altyazı önerilerini tek teslim sözleşmesine bağlamak. Burada hazır bir upstream “dublaj export modülü” bulunmuş gibi davranılmıyor: stream seçimi/mux uygulamaya ait, FFmpeg mevcut motor.

**Çıktılar:** İsteğe bağlı temiz konuşma WAV'ı, kaynak/arka plan katmanı, birleşik ses ve **son video zamanına** dönüştürülmüş altyazı; manifestte kaynak özeti, sync-map revizyonu, kanal/sample-rate, codec, dil, süre ve parça hashleri. `backend/dub_export.py` mevcut export'u genişletir. “İş tamamlandı” yerine gerçekten var olan ve ffprobe ile doğrulanan çıktı listesi sunulur.

**Kabul:** Eksik ses izi, yanlış varsayılan dil/track, farklı süre ve kısmi disk yazımı başarısız/eksik teslim olarak görünmeli. Dosya adları Windows ayrılmış adları, boşluk/Türkçe ve taşınabilir klasör durumuyla test edilmeli. **Öncelik yüksek, kapsam orta; yeni büyük bağımlılık gerektirmiyor.**

### Ö14 — HDR kaynağı için açık koruma veya SDR dönüşüm seçimi

**Alınacak parça:** FFmpeg [tonemap filtresinin](https://github.com/FFmpeg/FFmpeg/blob/e2740a3e0daab338b0ec60de407e444f68f9d119/libavfilter/vf_tonemap.c) işlemleri ve build yetenekleri. Mevcut export'un libx264/yuv420p seçimiyle birlikte HDR renk bilgisinin ne olacağı kullanıcıya anlaşılır biçimde kararlaştırılmalı. Bu, R837'deki HDR teslim önerisine teknik adaydır; yeni doğrulanmış bug sayımı değil.

**Entegrasyon:** ffprobe ile transfer/primaries/matrix/bit-depth bilgisi; HDR koruma veya bilinçli tone-map profili. Tek bir tonemap filtresi eklemek yeterli değil; gerekli lineerleştirme, renk uzayı dönüşümü, çıkış etiketleri, codec ve desteklenen filtreler birlikte ele alınmalı. Mevcut binary'de gerekli filtre bulunduğu bu araştırmada çalıştırılarak doğrulanmadı.

**Kabul:** Gerçek HDR örnekte siyah/beyaz, ten rengi, altyazı okunurluğu ve metadata kontrolü; Windows oynatıcı/GPU üzerinde karşılaştırma. Gerekli yetenek yoksa sessiz bozuk çıktı yerine açıklamalı seçim engeli. **Öncelik koşullu yüksek, kapsam orta/büyük.**

## Keşfet / Letterboxd: kimliği ve kişiselleştirme kanıtını güçlendirme

### Ö15 — Jellyfin'deki sağlayıcı kimliği ayrımından bağımsız film kimlik modeli

**Örnek:** [IHasProviderIds](https://github.com/jellyfin/jellyfin/blob/5b385862fb97201d954a6ac7c9c745d791a738fa/MediaBrowser.Model/Entities/IHasProviderIds.cs) sağlayıcı adından kimliğe sözlük taşır; [BaseItem](https://github.com/jellyfin/jellyfin/blob/5b385862fb97201d954a6ac7c9c745d791a738fa/MediaBrowser.Controller/Entities/BaseItem.cs) kullanımını gösterir. Film adı görünen metin, TMDB/IMDb/Letterboxd kimlikleri ise açık ad alanlarında referans olmalı. Aynı ad veya çevrilmiş başlık eşit kimlik anlamına gelmez.

**Bizdeki ek değer:** `media-catalog-store.js`, import eşleştirme, kişisel raf ve `media-taste.js` arasında orijinal başlık/yerel başlık/alias korunur; belirsiz eşleşme kullanıcıya doğrulatılır. R837 F03'ün profil üretimindeki alias kaybı bu ihtiyacın mevcut kanıtıdır; burada yeniden sayılmaz.

**Edinme biçimi:** GPLv2 kaynak doğrudan kopyalanmaz; genel mimari fikir bağımsız uygulanır ve kendi testleri yazılır. Jellyfin sunucusu kurmak, hesap taşımak veya tüm metadata motorunu almak gerekmiyor. Kabul: aynı adlı farklı yıl, aynı filmin iki dilde adı, eksik sağlayıcı ID ve çelişen kimlikler. **Öncelik yüksek, kapsam orta.**

### Ö16 — Film varlığı ile yeniden izleme olayını ayıran tercih kanıtı

**Kaynak sınırı:** Jellyfin'in provider-ID yaklaşımı kimlik temelini örnekler; aşağıdaki tercih ağırlığı algoritması Jellyfin'den hazır bulunan bir özellik olarak sunulmuyor. Bu, uygulamanın kendi diary ve keşif modelinde geliştirilmelidir.

**Öneri:** Tek film varlığı altında birden fazla izleme olayı; tercihte hem benzersiz film çeşitliliği hem tekrar izleme ayrı ölçü olsun. “Bu yönetmeni seviyorsun” desteği üç farklı film mi, tek filmin üç tekrarı mı açık görülebilsin. Kullanıcı yeniden izlemenin etkisini ayarlayabilsin; her olayı bağımsız film gibi sayma eğilimi önlensin. R837 F04 ve ilgili öneriler için somut veri-modeli yönüdür.

**Kabul:** Tek filmin 1/5 izlenmesi benzersiz film sayısını değiştirmemeli; farklı film katkısı ayrı artmalı; import tekrarında aynı olay çoğalmamalı. Kişisel yorum metni bulut analizine varsayılan olarak açılmaz; mevcut yetki/örnek seçimi korunur. **Öncelik yüksek, kapsam orta; yeni öneri motorundan önce yapılmalı.**

## Browser / okuyucu: kaynak sadakati

### Ö17 — Defuddle güncellemesini kaynak sadakati fixture'larıyla değerlendirme

**Alınacak parça:** [Defuddle extraction akışı](https://github.com/kepano/defuddle/blob/3e8bde9f5f855bc968e95837a750c5968a9fe639/src/defuddle.ts), extractor ve schema.org fallback düzeni. Bizde 0.19.5 vendored, incelenen upstream paket 0.19.6. Sürüm numarası yükseldi diye başarı varsayılmaz. `browser-reader.js` ve asistan kaynak bağlamının kullandığı gerçek çıktı üzerinde değerlendirme yapılır.

**Yeni yarar:** Kullanıcıya “okuyucu metni nereden geldi?” sorusunun cevabı: URL, alınma zamanı, başlık, seçili alıntının kaynak parçası ve metin revizyonu. Sayfa değiştiğinde kayıtlı not/çeviri farkı anlaşılabilir. Extractor yükseltmesinden bağımsız provenance zarfı uygulamaya aittir; Defuddle tek başına güvenilir citation sistemi sağlamaz.

**Kabul:** Uzun makale, tablo, kod bloğu, çok sayfalı içerik, aşırı kısa sayfa, Türkçe ve şablon kalabalığı fixture'larında metin kaybı/eklenmiş navigasyon ölçülmeli. Gizli hesap sayfaları, çerezler ve profil kopyaları test deposuna konmamalı. **Öncelik yüksek, kapsam orta; otomatik sürüm yükseltme yok.**

### Ö18 — Readability'yi önce test karşılaştırıcısı, sonra gerekirse seçici fallback yapma

**Alınacak parça:** Mozilla [Readability.parse ve article seçimi](https://github.com/mozilla/readability/blob/ab4027a8b37669745016869a37a504727992b2ba/Readability.js). Defuddle'ın gerçekten zorlandığı fixture'larda iki çıktıyı karşılaştırmak yararlı; her sayfada iki ağır extractor çalıştırmak önerilmiyor. İkinci motor ancak belirli içerik sınıfında ölçülebilir iyileşme gösterirse kullanıcıya kaynakla birlikte seçilebilir alternatif olur.

**Güvenlik ve sınır:** Readability bir HTML sanitizer değildir. İzole klon DOM, mevcut güvenli render ve ağ/URL kontrolleri korunmalı. “Başarılı parse” metnin tamamı veya kaynakta olmayan içeriğin yokluğu anlamına gelmez; asistan cevapları çıkarılan kapsamı bilmelidir.

**Kabul:** Aynı fixture kümesinde başlık/ana metin/yan menü oranı ve kayıp kritik parça kıyaslaması; fallback'in neden seçildiği izlenebilir olmalı. CSP'yi gevşetmeden yerel bundle; Windows sayfa restore ve kullanıcı sekmeleri üzerinde yan etki olmamalı. **Öncelik orta; önce test aracı olarak küçük kapsam.**

## Şimdilik almayacağım şeyler

- **stable-ts'yi yeni varsayılan ASR/zamanlama motoru yapmam.** Depo araştırma anında arşivlenmiş. [Alignment](https://github.com/jianfch/stable-ts/blob/e312072cc024ae9fceb25b057d7d18524873a02b/stable_whisper/non_whisper/alignment.py) ve [regroup/silence sonuç kodu](https://github.com/jianfch/stable-ts/blob/e312072cc024ae9fceb25b057d7d18524873a02b/stable_whisper/result.py) algoritma karşılaştırmasına yarayabilir; mevcut WhisperX/faster hattına torch/model yükü eklemek ancak kendi corpus'unda belirgin kazanç gösterilirse düşünülür. Kodun MIT olması model ağırlıklarının lisansını çözmez.
- **Yeni bir React sohbet uygulamasını komple gömmem.** assistant-ui parçaları ve Remend zaten mevcut. Yeni SDK geçişinin maliyetini önce küçük parser/sözleşme iyileştirmeleriyle kıyaslarım.
- **Subtitle Edit'in tüm .NET arayüzünü veya Jellyfin sunucusunu taşımam.** Birincide birkaç kural, ikincide kimlik modeli mevcut ürüne daha iyi uyuyor.
- **OTIO ve wave editor'ı ilk faza koymam.** Faydalılar, fakat kaynak doğruluğu ve son dosya kalitesi daha acil. Doğru ölçülmeyen bir çıktıya yeni düzenleme ekranı eklemek kaliteyi kanıtlamaz.

## Uygulama sırası önerim

| Faz | İşler | Beklenen yarar | Geçiş ölçütü |
|---|---|---|---|
| 1 — Güvenilir veri ve çıktı | Ö01, Ö02, Ö12, Ö13, Ö15–16 | Akış/kayıt ayrışmasını azaltmak, doğru film kanıtı, doğrulanmış dublaj teslimi | Hedefli fixture'lar ve gerçek Windows çıktı kontrolleri; kişisel veri kullanılmadan |
| 2 — Mevcut araçları derinleştirme | Ö04–08, Ö10, Ö17–18 | Devam edebilen işler, seçilebilir altyazı düzeltmesi, daha sağlam kaynak okuma | Geri alma, kaynak revizyonu, sürüm/dağıtım uyumu ve önce/sonra örnekleri |
| 3 — İhtiyaca bağlı genişleme | Ö03, Ö09, Ö11, Ö14 | Karmaşık akış modeli, hassas timeline, editör teslimi, HDR | Pilotun gerçek kullanım yararı ve Windows/native/GPU kabulü |

Öncelikler süre taahhüdü değildir. Büyük işlerin kapsamı ürünün güncel açık bugları ve kullanıcının hangi özelliği önce istediğiyle yeniden sıralanmalıdır. Hiçbiri bu raporla uygulanmış sayılmaz. P081–P090 müzik analizi hedeflerine yeni iş eklenmedi; ses katmanları yalnız video/dublaj teslimi kapsamındadır.

## Lisans ve tedarik kararı

İncelenen dosyalarda MIT/BSD bildirimleri korunarak seçilmiş kod veya paket kullanımı değerlendirilebilir; Apache-2.0 için lisans/varsa NOTICE ve değişiklik bildirimi ele alınmalı. GPL örneği için doğrudan kod alma yolu önerilmedi. Bunlar seçilen dosyaların teknik lisans tespitidir; bütün transitive bağımlılıkların ve dağıtılacak binary'lerin incelemesi yapılmış değildir.

Özellikle [FFmpeg lisansı](https://github.com/FFmpeg/FFmpeg/blob/e2740a3e0daab338b0ec60de407e444f68f9d119/LICENSE.md) ve [configure seçenekleri](https://github.com/FFmpeg/FFmpeg/blob/e2740a3e0daab338b0ec60de407e444f68f9d119/configure) dağıtım kararının build'e bağlı olduğunu gösteriyor. Kurulu binary'nin `-buildconf`/`-filters` çıktısı, beraber dağıtılan kütüphaneler ve codec tercihleri uygulama aşamasında kontrol edilmelidir. `libx264` veya GPL/nonfree seçenekleri yok sayılarak her FFmpeg paketine aynı lisans etiketi verilemez. API hizmet şartları, model ağırlıkları, fontlar ve filtre listeleri kaynak kod lisansından ayrıdır.

Bir bağımlılık seçilirse resmi yayımlanmış sürüm ve hash sabitlenmeli; geliştirme HEAD'i doğrudan üretim sürümü yapılmamalı. CJS/ESM, Python, .NET, native binary ve lockfile değişikliği ayrı inceleme ister. Harici kod bu tur ürüne kopyalanmadığı için yeni dependency/NOTICE değişikliği yapılmadı.

## Kanıt ve doğrulama sınırları

14 deponun resmi GitHub metadata/HEAD bilgisi ve seçilmiş kaynak/lisans dosyaları salt okunur alındı. 50 dosya isteğinin 49'i başarılıdır; yanlış tahmin edilen Subtitle Edit `LICENSE.txt` 404'ü saklandı, gerçek `LICENSE` ayrıca alınarak MIT teyit edildi. Bu sayı tüm depoların kapsamlı denetlendiği anlamına gelmez. Upstream kaynakları çalıştırılmadı, paket kurulmadı, üçüncü taraf kodu ürün deposuna taşınmadı. Tam kaynaklar yerine yalnız URL/hash/metadata yayımlanıyor.

[Yerel kaynak tabanı](research838/local-baseline.json) mevcut entegrasyonları sabitler. [PyPI kaydı](research838/pysubs2-1.8.0-metadata.json) yalnız metadata kanıtıdır; 1.8.0 paket kaynak/çalışma kabulü değildir. Resmi belgeler ve kaynaklar teknik iddiaları desteklemek için kullanıldı; README vaatleri ölçülmüş kalite kabul edilmedi.

Bu yalnız belge/research çalışmasıdır: `npm test`, tam CI, `start.bat` ile normal açılış, temiz `install.bat`, GPU/CUDA/DRM, canlı asistan/hesap/site, ses doğallığı, native UI/DPI ve iki saatlik medya performansı bu tur test edilmedi. Belge JSON/hash/bağlantı ve diff kontrolleri yapılır. Geçmiş test başarıları bu adayların bugünkü uygulama garantisi değildir; yeni doğrulanmış bug sayısı **0**, araştırma önerisi **18**.
