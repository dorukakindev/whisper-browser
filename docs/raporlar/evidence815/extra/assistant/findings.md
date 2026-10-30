# R815 ek asistan/kütüphane incelemesi

İncelenen HEAD: `55bfcca53a995e1217edb547655a50720ff59320`, Windows/Node `v24.22.0`. Ürün dosyaları bu çalışma sırasında değiştirilmedi. Güncel devir `docs/devir/2026-10-31-0020.md`, mevcut 54 bulgu ve Night1000 README/registry karşılaştırıldı. Aşağıdaki sekiz bulgu mevcut 54'ün başka varyantları olarak sayılmadı; ilgili önceki yollar her kayıtta ayrıldı. Eski 1000 test yeniden koşulmadı. Yeni bağımlılık, model, kişisel ayar veya ücretli çağrı yok.

Tekrar: `node .tmp/extra815-assistant/probe.cjs`. Son koşu exit0: sekiz hatalı davranışın assertion'ları geçti. Bu bir düzeltme başarısı değildir. Gerçek üretim modülleri JSDOM/kontrollü IPC ile çalıştırıldı; yalnız E05'te büyük renderer dosyasından değiştirilmemiş `aiChatSend` fonksiyonu çıkarılıp aynı dispatcher çalıştırıldı. Her koşu benzersiz sentetik veri dizini kullanır. Gerçek Electron/native ekran, mpv süreci, ağ sağlayıcısı, start.bat, GPU, gerçek kullanıcı dosyaları ve fiziksel ekran okuyucu sınanmadı.

## E01 — P2 — Yorum isteği kimlik çözümlemesindeyken verilen durdurma kayboluyor

**Konum:** `src/media-tools-service.js:71–79,134,136–147`; `src/renderer/review-decision-ui.js:32,45,69–74`.

**Tekrar:** Keşfet yapımından açık yorum sayfası getirmeyi başlat; discovery kimliğinin uzak metaveri çözümü beklesin. Bu sırada Okumayı durdur veya pencereyi kapat. Kimlik yanıtı sonradan gelsin. UI durdururken geçerli fetchRequest kimliğiyle reviews-stop gönderir.

**Beklenen:** Durdurulmuş istek kimlik çözümü sonrasında indirme başlatmamalı; sonraki görevleri meşgul etmemeli.

**Gözlenen:** reviews-stop `jobs.get(id)?.abort()` çağırıp başarı döner; jobs kaydı ancak await reviewItem sonrasında kurulmaktadır. Probda durdurma onayından sonra bir ağ isteği başladı ve eski iş `ok:true` tamamlandı. Renderer geç yanıtı atsa da ana süreçteki iş durmamıştır.

**Etki:** Kapatılmış isteğin kaynak tüketimi sürer; jobs.size kontrolü nedeniyle yeni yorum isteklerini de bloke edebilir. Son sonuç UI'a uygulandı iddiası yoktur.

**Kanıt/sınır:** Gerçek registerMediaTools handler'ı; geciktirilmiş resolveDiscovery ve kontrollü HTML Response. Canlı Letterboxd veya model kullanılmadı. Önceki R815-B44/B46/B54 geç UI açılışıyla ilgilidir; burada ayrı ana süreç iptal/kayıt sırası vardır.

## E02 — P2 — IMDb eşleşmesi değişmiş eski yorum analizi yeni kimliğe kaydedilip güncel gösteriliyor

**Konum:** `src/media-tools-service.js:153–157`; `src/renderer/review-decision-ui.js:54,116–118`.

**Tekrar:** IMDb ile tanımlı, TMDB eşleşmesi olmayan bir yapım için analiz al. Başlık/yıl aynı kalırken yanlış IMDb kimliği düzeltilsin. Önceki analizi eski itemIdentity ile kaydet ve kayıtlı analiz bölümünü aç.

**Beklenen:** Kimlik değişimi reddedilmeli veya önceki eşleşme olarak açıkça ayrılmalı.

**Gözlenen:** decision-save yalnız kind/title/year/tmdbId kontrol ediyor; eski `tt1234567` ile güncel `tt7654321` farkını kabul ediyor. Diskteki history.identity IMDb alanını da saklamıyor. Gerçek renderer tarihçe tüketicisi eski analizi `Earlier match` uyarısı olmadan güncel kayıt olarak çizdi.

**Etki:** Kullanıcının doğrulanmış analiz kaydı başka filme bağlanıyor; sonraki oturumda kaydın yanlış eşleşmeye ait olduğunu ayıran kimlik kanıtı yok.

**Kanıt/sınır:** Gerçek servis, gerçek sentetik disk JSON'u ve tam review-decision-ui tüketicisi. IMDb düzenlemesi geçerli katalog davranışıdır; bozuk kimlik girdisi kullanılmadı. Kimlik değişiminin gerçek native modal etkileşimi bu tur sınanmadı. R542/R540'ın film eşleşmesi korumalarında bulunmayan IMDb alanı sınırıdır; R815-B48 JSON ayrıştırma hatasından farklıdır.

## E03 — P1 — Yapım yüklenirken dil değişimi eski başlığı gösterip yeni kaydı değiştiriyor

**Konum:** `src/renderer/media-title.js:6,36–39,59,80–87`.

**Tekrar:** A ayrıntısını aç; ardından B ayrıntısını açarken katalog liste yanıtını geciktir. Yanıt beklerken EN/TR dilini değiştir. Sonra B yanıtını döndür ve Favorilere ekle düğmesine bas.

**Beklenen:** B yüklenene kadar yükleniyor durumu korunmalı; A'nın görünür düğmeleri B üzerinde çalışmamalı.

**Gözlenen:** open(B) selected=B yaparken küresel item hâlâ A'dır. Locale olayı `draw(++generation)` ile A'yı yeni dialog'a çizer ve bekleyen B yanıtını generation kontrolüyle geçersiz kılar. Yanıt geldikten sonra başlık A kalır; görünür A favori düğmesi `{id:'B',favorite:...}` gönderir.

**Etki:** Kullanıcı gördüğü yapımdan farklı bir kaydı değiştirebilir. Bekleyen B yanıtının gelmesi görünümü kendiliğinden düzeltmez.

**Kanıt/sınır:** Değiştirilmemiş tam media-title.js; gerçek locale olayı, gecikmeli IPC ve gerçek düğme callback'i. Native görsel kabul yapılmadı. R815-B54 kitap açılış sırasından farklı bileşen/kök; burada eski item, yeni selected ve locale generation birleşimidir.

## E04 — P2 — Sürekli gelen asistan metni ara kayda yazılmıyor, kapanışta bütünüyle kaybolabiliyor

**Konum:** `src/renderer/assistant-workspace.js:32–36,72,107`; kapanış tüketicisi `src/main.js:15066–15128`.

**Tekrar:** Yeni bir asistan cevabı akarken her bir saniyeden kısa aralıkta delta almaya devam et; cevap tamamlanmadan pencereyi kapat.

**Beklenen:** Uzun yanıtın alınan kısmı belirli aralıklarla kalıcı olmalı veya kapanışta son metin flush edilmeli.

**Gözlenen:** partial her deltada aynı bir saniyelik zamanlayıcıyı sıfırlar. Sürekli akışta ara kayıt hiç çalışmaz; pagehide zamanlayıcıyı temizleyip kaydetmez. Prob 200 partial çağrısı sonrası bellekte `Received continuous response 200` varken gerçek assistant-conversations.json cevabının hâlâ boş/streaming olduğunu doğruladı. Ana pencere kapanışı browser/session/watch yazımlarını beklerken asistan arşivi için flush istemiyor.

**Etki:** Uzun cevabın tüm alınmış kısmı, yalnız son saniyesi değil, kaybolabilir; tekrar sağlayıcı çağrısı gerekebilir. Sonraki yüklemede streaming→stopped dönüşümü metni geri getirmez.

**Kanıt/sınır:** Tam workspace modülü ve gerçek assistant-thread-store/disk. Deterministik timer sınırı kullanıldı; normal Windows kapanışı canlı asistanla uçtan uca yeniden oynatılmadı. R531'in yarım kaydı stopped gösterme davranışını geri alınmış saymıyoruz; eksik olan metnin periyodik/kapanış kalıcılığıdır. R815-B47 silme onayıyla ilgisizdir.

## E05 — P1 — Açık olumsuz watchlist isteği doğrudan ekleme işlemi yapıyor

**Konum:** `src/assistant-media-command.js:6–7`; `src/renderer/assistant-media-commands.js:9–23`; `src/renderer/renderer.js:20010–20032`.

**Tekrar:** Geçerli bir kütüphane yapımı seçiliyken asistana `Never add this to my watchlist.` gönder.

**Beklenen:** Açık olumsuz cümle hiçbir katalog mutasyonu başlatmamalı; gerekirse normal sohbet yolunda yanıtlanmalı.

**Gözlenen:** Matcher don't/do not biçimlerini dışlarken never biçimini dışlamıyor. Gerçek aiChatSend dispatcher'ı bu cümleyi doğrudan AssistantMediaCommands'a yönlendiriyor; handler mevcut unspecified kaydını planned olarak kaydediyor. Typed agent çağrısı sıfır: modelin yanlış yorumu veya yalnız regex birim denemesi değildir.

**Etki:** Kullanıcının açıkça istemediği kütüphane durum değişikliği gerçekleştirilir; işlem kartı değerlendirme yolu da çalışmaz.

**Kanıt/sınır:** Gerçek dispatcher fonksiyonu, tam intent/handler modülleri ve kontrollü katalog API tüketicisi. Yalnız bu kesin İngilizce olumsuz örnek sayıldı; diğer diller/komutlar için genelleme yapılmadı. Önceki 54 arasında karşılığı yoktur; backend çeviri olumsuzluk bulguları farklı alandır.

## E06 — P2 — Geçerli Türkçe TMDB türü Sana özel önerilerde yok sayılıyor

**Konum:** `src/catalog-discovery.js:134–141`; `src/media-discovery-service.js:115–122`.

**Tekrar:** Bilgi dili tr-TR iken TMDB'nin Suç türünü taşıyan yapımını favorile; Sana özel bölümünü aç. Başka favori/tür kanıtı bulunmasın.

**Beklenen:** TMDB Suç türü Cinemeta Crime türüne eşlenerek öneri oluşturmalı; mevcut favori tanınmalı.

**Gözlenen:** MetadataClient gerçek detail yolu `genres:['Suç']` üretir. For-you aliases tablosunda Suç yoktur; GENRES yalnız Crime içerir. selected boş kalır, ağ öneri isteği hiç yapılmadan `needsRatings:true` döner. Kullanıcıya zaten yaptığı favori/tür ekleme işi yeniden önerilir.

**Etki:** Varsayılan Türkçe metaveri akışındaki geçerli favoriler bazı türlerde kişiselleştirmeyi tamamen sonuçsuz bırakır.

**Kanıt/sınır:** Gerçek metadata detail→discovery handler zinciri ve kontrollü resmi şemaya uygun TMDB yanıtı. Canlı TMDB hesabı kullanılmadı. Tek Suç örneği doğrulandı; aynı tablodaki diğer eksik çeviriler ayrı bug sayılmadı. R815-B43 puan ölçeğinden farklıdır: bu örnekte hiç puan gerekmiyor, favorite=true yeterlidir.

## E07 — P2 — Native duraklatma başarısızken asistan tamamlandı ve durakladı bildiriyor

**Konum:** `src/renderer/native-player-ui.js:6–13`; `src/renderer/assistant-library-actions.js:21` playback_control.

**Tekrar:** Native oynatıcı etkin ve oynuyor olsun. Asistanın duraklatma işlemi sırasında native komut IPC'si `{ok:false}` dönsün; örneğin mpv iletişim hattı kullanılamaz hâle gelsin.

**Beklenen:** Asistan duraklatmayı doğrulanmış tamamlanma saymamalı; başarısızlık ve gerçek oynatma durumu ayrılmalı.

**Gözlenen:** Native köprü video.pause() içinde sample.paused=true yapıyor, komut sonucunu void bırakıyor ve pause olayı gönderiyor. AssistantLibraryActions bu void çağrıdan sonra completed döndürüyor. Prob `Synthetic pipe unavailable` reddine rağmen asistan completed ve kamuya açık video.paused=true sonucunu doğruladı.

**Etki:** Gerçek oynatıcı durmamış olabileceği hâlde kullanıcı ve takip eden asistan adımları durdu sanabilir. Aynı köprünün seek/volume/speed setter'ları da sonuçları beklemiyor; bu varyantlar ayrı sayılmadı.

**Kanıt/sınır:** Tam native-player-ui + AssistantLibraryActions tüketicisi; kontrollü native IPC. Gerçek mpv/hardware hatası oluşturulmadı, sesin fiziksel olarak sürdüğü iddia edilmez. Yerel başarı bilgisinin başarısız komutla çelişmesi kanıtlandı. R815-B31 native başlatma hatası başka işlem/kod yoludur.

## E08 — P2 — Geçerli SSE Content-Type harf değişimi sağlayıcı yanıtını bozuyor

**Konum:** `src/assistant-provider.js:17–19,98`.

**Tekrar:** OpenAI uyumlu sağlayıcı geçerli SSE gövdesini `Content-Type: Text/Event-Stream` ile döndürsün; aynı gövdeyi küçük harfli text/event-stream ile karşılaştır.

**Beklenen:** MIME türünün büyük/küçük harf farkı ayrıştırma biçimini değiştirmemeli. Tür/alt tür eşleşmesinin harfe duyarsız olması [RFC 2045 §5.1](https://www.rfc-editor.org/rfc/rfc2045#section-5.1) sözleşmesidir.

**Gözlenen:** Büyük/küçük harfe duyarlı includes('text/event-stream') testi karışık harfli türü JSON yanıtı sanıyor. Aynı SSE küçük harfle Fixture answer döndürürken karışık harfle JSON.parse Unexpected token 'd' hatası veriyor. Gerçek provider.run yolu çalıştırıldı.

**Etki:** Protokol açısından eşdeğer bir header kullanan sağlayıcıdan hiçbir yanıt alınamıyor. Bu sağlayıcı uyumluluğu hatasıdır; varsayılan DeepInfra'nın bu header'ı kullandığı iddia edilmez.

**Kanıt/sınır:** Geçerli Response/SSE fixture'ı, gerçek provider.run ve küçük harfli başarılı karşı örnek. Ücretli ağ çağrısı yapılmadı. R815-B48 ana sürecin JSON cevabına düz metin eklemesinden farklıdır: burada SSE yanlış protokolle ayrıştırılmaktadır.

## Geliştirme önerileri — hata sayısına dahil değil

### G-E01 — Yorum kanıtını sürüm ve kaynak kimliğiyle birlikte karşılaştır

**Fayda:** Önceki ve yeni analizlerin hangi IMDb/TMDB kimliğine, hangi yorum örneğine ve hangi tarihe ait olduğu tek bakışta anlaşılır; aynı film adı eski analizi güncelmiş gibi göstermez.

**Kabul ölçütü:** Analiz kaydında tam yapım kimliği, yorum örneği hash'i, kaynak URL listesi, sağlayıcı/model adı ve tarih bulunur; anahtar/tam kişisel yol saklanmaz. Aynı filmde yeni örnek karşılaştırması özetlenir; farklı kimlikteki eski analiz ayrı tutulur. Eski şema kayıtları eksik kanıt etiketiyle korunur.

### G-E02 — Sohbette gerçekten diske yazılan son yanıt durumunu göster

**Fayda:** Kullanıcı uzun cevap sırasında hangi metnin kurtarılabilir olduğunu bilir; kaydetme hatası sıradan sohbet cevabına karışmaz.

**Kabul ölçütü:** Periyodik checkpoint'in tamamlandığı revision/tarih gösterilebilir; debounce veya sadece bellek güncellemesi kaydedildi sayılmaz. Kapanışta bounded flush, disk hatasında açık durum ve tekrar deneme bulunur. Kontrollü sürekli akış/kapanış/disk reddi senaryolarında gösterilen durum diskle eşleşir.

### G-E03 — Yorum okuma aşamalarını durdurma sahibiyle görünür kıl

**Fayda:** Film kimliği çözümü, sayfa indirme, metin ayıklama ve model analizi birbirinden ayrılır; kullanıcı hangi işi durdurduğunu anlayabilir.

**Kabul ölçütü:** İstek kimliği ilk asenkron aşamadan önce kaydedilir; iptal yalnız aynı kimliği etkiler. Durduruldu terminalinden sonra yeni ağ çağrısı olmaz. Yeni deneme eski görevin geç sonucu veya iptal onayıyla etkilenmez; örnek metni korunur.

### G-E04 — Tür bilgisini görünen dilden bağımsız kanonik kimlikle taşı

**Fayda:** Türkçe/İngilizce etiket veya kaynak değişikliği öneri sonuçlarını sessizce ortadan kaldırmaz; kullanıcının tür metni kendi dilinde kalabilir.

**Kabul ölçütü:** TMDB sayısal tür kimlikleri/Cinemeta eşlemeleri üzerinden kararlı bir iç tür saklanır; görünen etiket ayrı tutulur. Suç/Crime ve kaynakların farklı Science Fiction/Sci-Fi adları aynı kategoriye gider. Eşlenemeyen tür için gerekçe görünür; yanlış needsRatings mesajı verilmez.

### G-E05 — Native oynatma işlemlerine doğrulanmış sonuç makbuzu ekle

**Fayda:** Kullanıcı ve asistan bir komutun gönderilmesini, kabulünü ve gerçek oynatıcı durumunu ayırabilir; başarısız komut sonraki adımı yanlış bilgiyle başlatmaz.

**Kabul ölçütü:** pause/seek/rate/volume için komut kimliği ve bounded timeout vardır; completed ancak eşleşen başarı/durum geri okumasıyla üretilir. Hata sonradan gelen başka komutun durumunu geri sarmaz. Gerçek native süreç kabulü ve kontrollü IPC reddi ayrı raporlanır; UI iyimser gösterim varsa geçici olduğu belirtilir.

### G-E06 — Sağlayıcı bağlantı tanısında protokol aşamalarını ayır

**Fayda:** Kullanıcı kimlik doğrulama, HTTP, MIME/SSE ayrıştırması ve model formatı hatalarını birbirinden ayırarak doğru sağlayıcı ayarını düzeltebilir.

**Kabul ölçütü:** Tanı çıktısı anahtar, ham özel kaynak veya Authorization header içermez. MIME harf farkı, standart SSE satır sonları, yarım akış ve JSON fallback kontrollü yanıtlarla sınanır. Kontrol sonucu canlı model kalitesi veya bütün sağlayıcıların desteği diye sunulmaz.
