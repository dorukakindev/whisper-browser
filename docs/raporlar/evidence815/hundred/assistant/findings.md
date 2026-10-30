# R815 yüz bulgu hedefi — ek asistan/araştırma/kütüphane kanıtı

Başlangıç HEAD: `da773134a3e744885592bafa008f81f03bcdf878`. Son tekrar HEAD: `ae0a61a7b42c58d78bb7317680cf8f8133d5e027`. Arada başka çalışma ürün dosyalarını ilerletti; bu ajan hiçbir ürün, test, docs veya Git dosyasını değiştirmedi. Güncel head'de yedi davranış yeniden üretildi. İlgili dosya SHA256'ları findings.json içinde kaydedilir. Devir `2026-10-31-0041`, mevcut 78'lik mapping, AGENTS/YENI-BILGISAYAR ve Night1000 kayıtları esas alındı. Tarihsel PASS güncel garanti sayılmadı, 1000 senaryo yeniden çalıştırıldı denmedi.

**Komutlar:**

```
node .tmp/hundred815-assistant/probe.cjs ae0a61a7b42c58d78bb7317680cf8f8133d5e027
node_modules/electron/dist/electron.exe .tmp/hundred815-assistant/native-redirect.cjs
```

Ana prob exit0: yedi assertion grubu hatalı davranışı doğrular, düzeltme başarısı değildir. Windows Node v24.22.0. Native yönlendirme ayrıca Electron43.5.0/Chromium150.0.7871.250 ile gizli pencerede ve ayrı sentetik profilde doğrulandı. İlk sandbox koşusu Mojo/cache erişim engeline takıldı ve kanıt JSON'u üretmedi; yetkili aynı komutun tekrarında gerçek HTTP sayaçları ve hata assertion'ları tamamlandı. Yalnız süreç içi `public-fixture.invalid→127.0.0.1` çözümleme kuralı kullanıldı; dış DNS, LAN, hesap veya kişisel profil kullanılmadı. Test sunucusu/pencere/süreç kapatıldı.

## H01 — P1 — Araştırma güvenlik kontrolü özel adrese yönlendirme yüklendikten sonra çalışıyor

**Kaynak:** `src/main.js:20232–20242`; `src/assistant-web-research.js:2` safeSource; genel gezinme kontrolü `src/main.js:13585–13592`.

**Tekrar:** Araştırmanın izin verdiği genel bir HTTP(S) kaynak URL'si 302 ile localhost/özel ağ hedefine yönlendirsin. Araştırma helper'ının gerçek load fonksiyonu kullanılmalı.

**Beklenen:** Genel kaynaklardan okuma sözleşmesi ve safeSource'un açık özel-adres yasağı yönlendirme isteğinden önce uygulanmalı; yasak hedef yüklenmemeli.

**Gözlenen:** load önce `await wc.loadURL(url)` yapıyor, yalnız tamamlandıktan sonra son URL'ye safeSource uyguluyor. Native fixture'da ilk istek `public-fixture.invalid:55799/start`, ikinci istek `127.0.0.1:55799/private-fixture` oldu. Özel hedef sayacı1'e çıktıktan sonra `Unsafe research redirect.` hatası geldi. Hata, yapılmış isteği geri almıyor.

**Etki:** Arama kaynağının yönlendirmesi araştırma isteğini kullanıcının açıkça istemediği özel hizmete ulaştırabilir. İçerik okumaya devam edilmesi veya gerçek ağ kimlik bilgisi sızıntısı kanıtlanmadı; kesin kanıt, uygulamanın reddettiği adrese isteğin redden önce ulaşmasıdır.

**Kanıt:** `native-redirect-result.json` gerçek Chromium HTTP isteklerini; `results.json:H01` aynı kaynak helper'ını kontrollü wc sınırıyla tekrarlar. Yerel fixture yalnız sentetik HTML içerir. Native BrowserWindow tüm kullanıcı uygulaması/main polling testi değildir; değişmemiş ana süreç load fonksiyonu aynen çıkarılıp gerçek webContents ile çağrıldı. Ana browser will-redirect denetimi HTTP/HTTPS adreslerini izinli tutuyor ve araştırmaya özel private-adres kapısı içermiyor. Mevcut78'de karşılığı yoktur; sıradan browser'ın kullanıcı tarafından açılmış LAN sayfası hata sayılmadı.

## H02 — P2 — Araştırma kaynak bütçesi dolunca yeni W1 metni eski W1 kaynak listesine bağlanıyor

**Kaynak:** `src/assistant-agent-service.js:72–78,156`.

**Tekrar:** Aynı asistan turunda beş farklı research_web çağrısı yapılsın; her biri üç farklı geçerli kaynak ve pasaj döndürsün. Bu, mevcut altı provider raundu sınırı içinde mümkündür.

**Beklenen:** Kaynak bütçesi dolarsa yeni sonuç açıkça kısıtlanmalı veya kaynak kimlikleri tutarlı biçimde korunmalı; metin ile sources aynı W numaralarını temsil etmeli.

**Gözlenen:** session.webSources ilk10 URL'de kesiliyor. Beşinci aramanın üç yeni pasajı bu listede bulunmadığından passages boş kalıyor; fallback `result.text` yerel `[W1] source5-1` metnini döndürüyor. Aynı tool sonucunun sources[0] değeri hâlâ `source1-1` ve yeni beşinci aramanın kaynaklarından hiçbiri kaynak listesinde yok. Son yanıtın ana süreç kaynak eki de eski listeyi kullanıyor.

**Etki:** Asistanın kullandığı W kaynak kimlikleri yanlış makaleyi işaretleyebilir; başarılı araştırma sonucu kaynak kimliğiyle doğrulanamaz hâle geliyor. Canlı modelin yanlış iddia ürettiği söylenmedi; modele verilen doğrulanmış kaynak sözleşmesinin çeliştiği kanıtlandı.

**Kanıt:** Gerçek register/agentRun/provider döngüsü; beş gerçek tool dispatch ve kontrollü araştırma sonuçları. URLs example alanlarıdır, ağ çağrısı yoktur. R815-B48/B78 JSON/MIME sorunlarından farklıdır; yanıt formatı geçerlidir, kaynak kimlikleri karışmaktadır.

## H03 — P2 — Sonuçla devam et önceki atıfları ve işlem günlüğünü kalıcı kayıttan kaldırıyor

**Kaynak:** `src/renderer/assistant-workspace.js:69–71`; `src/renderer/assistant-agent-ui.js:19–23,36–38`; kaynak kartı tüketimi `src/renderer/global-assistant.js:53–57`.

**Tekrar:** Son asistan yanıtında kitap alıntısı ve tamamlanmış işlem günlüğü bulunsun; aynı yanıttaki uygulanmış karttan Sonuçla devam et çalışsın. Yeni tur ek kitap araması/araç adımı üretmesin.

**Beklenen:** Önceki metin korunuyorsa bu metnin kaynak kartı ve geçmiş işlem kanıtı da korunmalı; yalnız yeni kanıtlar eklenmeli veya ayrı tur olarak saklanmalı.

**Gözlenen:** resume önceki text/actions/evidence alanlarını taşıyor ama citations/steps taşımıyor. Yeni task.trace boş olduğundan finish eski steps'i [] yapıyor; `result.bookCitations||[]` eski citations'ı [] ile değiştiriyor. Probun sonuç metninde `[B1-0]` hâlâ bulunurken citations0 ve steps0; gerçek assistant-conversations.json dosyasında da son yanıt citations0 olarak kaydedildi.

**Etki:** Önceki metindeki alıntının tıklanabilir kaynak kartı ve uygulamanın önceki işlem kanıtı kaybolur; yeniden açılış bunları getiremez. Bu, görsel daralma veya sınırlı liste değildir; aynı yanıtın kalıcı metadata'sı sıfırlanır.

**Kanıt:** Tam workspace+agent-ui modülleri, gerçek thread-store/disk; geçerli son yanıt/kart üzerinden gerçek resume/send yolu. Provider/IPC kontrollüdür; native overlay yeniden açılışı denenmedi. R798/R800'ün kalıcı işlem/alıntı sözleşmesindeki devam sınırıdır. R815-B74 sürekli akış kapanış kaybından farklıdır: burada tur başarıyla tamamlanır ve metadata silinerek kaydedilir.

## H04 — P2 — Korece kitap araması normalleştirilmiş ofsetle özgün metni kesip boş kanıt döndürüyor

**Kaynak:** `src/assistant-retrieval.js:4,7–11`; `src/renderer/assistant-book-search.js:10–15`; gerçek tüketici `src/renderer/book-assistant-ui.js:227`.

**Tekrar:** Korece bir paragrafın ardından Latin harfli özel ad bulunan sayfa/bölüm aç; o özel adı kitapta ara. Sentetik örnekte 423 karakterlik geçerli Korece metin içinde SENTINELNAME birebir bulunur.

**Beklenen:** Arama eşleşmesinin alıntısı gerçek metindeki özel adı ve yakın bağlamını içermeli; dönen özgün ofset metin uzunluğunun dışında olmamalı.

**Gözlenen:** NFKD Korece heceleri birden fazla jamo harfine açıyor. `hay.indexOf` normalleştirilmiş dizginin konumunu verirken `text.slice` bu konumu özgün diziye uyguluyor. Probda returnedOffset693, özgün uzunluk423, returnedMatchText boş oldu. Tam BookAssistantUI.assistant.search tüketicisi bu boş eşleşmeyi aynen asistan sonucuna taşıdı.

**Etki:** Kaynakta doğrudan bulunan isim için arama başarılı eşleşme bildirir ama asistanın açıklayabileceği/alın­tılayabileceği metni vermez. Model cevabı veya Korece transkripsiyon kalitesi sınanmadı.

**Önceki ilişki:** R246/R247/R300 browser adres aramasında Hangul/yoğun dizin ve özgün ofset haritasını ele alır; o düzeltmelerin geri alındığı iddia edilmez. Buradaki bağımsız assistant-retrieval modülü aynı haritayı kullanmıyor. Önceki78 kitap aramasının bu Unicode konum sınırını içermiyor.

## H05 — P2 — Başarısız ayar değişimi geri alınsa da önceki geçerli Geri al kaydı siliniyor

**Kaynak:** `src/renderer/assistant-workflow-actions.js:4–7,21–23`.

**Tekrar:** Asistanla arayüz temasını başarıyla değiştir; get_workflow_settings canUndo=true olsun. Ardından aynı appearance alanında dil değişimi başlat; kaydetme başarısız, geri alma kaydı başarılı olsun.

**Beklenen:** Başarısız yeni değişiklik önceki değerleri tamamen koruduğundan önceki başarılı temanın Geri al işlemi kullanılabilir kalmalı.

**Gözlenen:** Yeni deneme başında `last=null` yapılıyor. Hata sonrası değerler geri yükleniyor ancak önceki last kaydı geri getirilmiyor. Prob before/after bütün appearance değerlerini eşit doğrularken canUndo true→false oldu.

**Etki:** Kullanıcı hâlâ geçerli olan önceki asistan ayar değişikliğini normal Geri al aracıyla geri alamaz; elle eski değerleri bilmek gerekir. Son ayar değerleri bozuldu iddiası yoktur.

**Kanıt/sınır:** Gerçek index.html kontrolleri ve tam workflow-actions; kontrollü false/true kayıt yanıtları. Fiziksel disk arızası oluşturulmadı. R707'deki mevcut snapshot/rollback kontrollerinin kapsamadığı geçmiş kayıt sınırıdır; R815-B51 tercih formu taslağının silinmesi değildir.

## H06 — P2 — Tümünü tekrarla döngüsü biten parçayı eski devam konumundan başlatıyor

**Kaynak:** `src/renderer/media-shelf-ui.js:63,129–150,156`; `src/renderer/music-queue.js:8`.

**Tekrar:** Kayıtlı dinleme konumu30sn olan tek parçalı kuyruğu aç; Tümünü tekrarla'yı etkinleştir; parça100sn sonunda bitsin.

**Beklenen:** İlk açılış kayıtlı30sn'den devam edebilir; tamamlanan parçanın sonraki tekrar turu0sn'den başlamalı.

**Gözlenen:** repeat=all advance yolu aynı satırı yeniden playQueue'ya verir; her loadedmetadata aynı değişmemiş row.position=30 değerini tekrar uygular. Prob ilk devam30, bitiş100 ve sonraki tur başlangıcını30 ölçtü. repeat=one için özel0 sıfırlaması varken all yolu bunu yapmıyor.

**Etki:** Her döngü parçanın başını sürekli atlar. Dinleme konumu service'e yazılsa da kuyruktaki row.position güncellenmez veya döngüde sıfırlanmaz.

**Kanıt/sınır:** Tam mevcut MusicQueue+MediaShelfUI ve gerçek ended/loadedmetadata tüketici akışı; kontrollü HTMLMediaElement yükleme sınırı, fiziksel ses/codec yok. Müzik analizi veya P081–P090 hedefi açılmadı. Önceki kuyruk transkripsiyon kurtarma raporları farklı kuyruktur; R815'te karşılığı yoktur.

## H07 — P2 — Eski ses oynatıcısını kapatma yanıtı sonradan başlayan yeni parçayı siliyor

**Kaynak:** `src/renderer/media-shelf-ui.js:45,123–150`.

**Tekrar:** A çalarken ses oynatıcıyı kapat; listen-progress IPC'sini geciktir. Kapatma beklerken listeden/kuyruktan B'yi başlat; ardından A'nın konum kaydetme yanıtını tamamlat.

**Beklenen:** Eski kapatma yalnız sahibi olduğu A oynatmasını sonlandırmalı; sonradan başlatılmış B'yi etkilememeli.

**Gözlenen:** Kapatma callback'i await öncesinde playGeneration artırıyor ama sonrasında sahiplik kontrolü yapmıyor. B kendi yeni generation'ıyla başladıktan sonra eski callback audio.pause/removeAttribute/load, current=null ve dock.hidden işlemlerini yapıyor. Prob yeni B current.id değerini doğruladı; eski yanıt sonrasında current=null oldu.

**Etki:** Kullanıcının yeni seçtiği ses durur ve oynatıcı kapanır; geç yanıt yeni oynatmayı geçersiz kılar. Ses dosyası silinmez.

**Kanıt/sınır:** Tam shelf/queue modülleri, gerçek Close düğmesi ve public executeMusic queue_next tüketicisi; gecikmeli geçerli IPC. Native ses çıkışı yoktur. R815-B44/B46 kapatılmış ayrıntı/modalın geç yanıtla açılmasından, B54 kitap açılış sırasından farklı ses oynatma lifecycle köküdür.

## Kapsamdan çıkarılan aday ve sınırlar

- SSE function.name eşit ardışık fragment adayı gerçek provider probunda çürüdü: üretim kodu set_app_preferences adını doğru birleştirdi. Yeni bug sayılmadı.
- Önceki negatif komut, MIME harf duyarlılığı, puan ölçeği, IMDb analiz kimliği ve locale A/B yarışı tekrar sayılmadı.
- Yeni ürün testleri, düzeltme, kurulum, canlı sağlayıcı, GPU/TTS, gerçek müzik analizi veya kişisel veri işlemi yoktur. Kullanıcının açık sekmeleri/uygulaması kapatılmadı. Native fixture yalnız kendisinin yarattığı pencere/profil ve localhost sunucusunu kullandı.
