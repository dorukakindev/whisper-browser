# R815 ek browser/player denetimi — 7 yeni kök bulgu, 7 geliştirme önerisi

HEAD `55bfcca53a995e1217edb547655a50720ff59320`. Salt raporlama; ürün/test/git değiştirilmedi. AGENTS, YENI-BILGISAYAR, 2026-10-31-0020 devir notu, önceki54bulgu JSONu ve gece1000 registry okundu/parse edildi. F44 main bridge ve F11 cue pairing imzaları karşılaştırıldı; eski1000 yeniden koşturulmuş/yeni keşif sayılmadı.

Altı bulgu gerçek Windows Electron43.5.0 içinde iki izole localhost origininde orijinal üretim scriptleriyle ölçüldü. Bir bulgu gerçek tercih deposu modülüyle doğrulandı. Bunlar tam uygulama/gerçeksite/DRM kabulü değildir. Kullanıcı profili/sekmesi/ayarlarına erişilmedi. Native süreçler yalnız kendi profil ve pencerelerini kapatıp app.exit yaptı; son PID 14504.

## EX-BR01 · P2 — Var olan hosta sonradan eklenen açık shadow root içindeki video keşfedilmiyor

- Kaynak: `src/browser-media-controller.js:264`, `src/browser-media-controller.js:284`, `src/browser-media-controller.js:407`.
- Tekrar: Boş, bağlı div host bulunan yerel sayfada buildBrowserMediaProbeScript çalıştır; host.attachShadow({mode:open}) ile video ekle; ikinci probe çalıştır.
- Gözlenen: Shadow DOM içinde 1 video olmasına rağmen önceki ve sonraki probe null döndü.
- Beklenen: Yeni açık shadow root içindeki oynatıcı keşfedilmeli; kontrol/altyazı araçları sayfayı yeniden yükleme gerektirmemeli.
- Etki: Geç kurulan web component oynatıcılarında oynat/duraklat, seek ve medya karesi işlemleri erişilemez kalır.
- Kök neden: Document MutationObserver shadow root yaratılmasını görmüyor; rootun kendi observerı kurulamadığı için içerideki video eklenmesi de görülmüyor. select yalnız observer kotası aşılırsa yeniden scan yapıyor.
- Gerçek consumer: main browser:command satır16218 tüm karelere bu probe scriptini gönderir; hiç aday yoksa komut Sayfada kontrol edilebilen video bulunamadı ile biter. browser:capturePage video modu da aynı probu kullanır.
- Sınır/karşı kontrol: Gerçek Windows Chromium DOM ve orijinal script. Açık root test edildi; kapalı root destek iddiası yok. Üst belgeye host yeniden eklenmesi gibi başka mutationlar tesadüfen kurtarabilir.
- Önceki ilişki: Önceki54te yok. R648 bridge shadow smoke başlangıçta var olan/açılışta eklenen rootları kapsıyor; bu geç attach sınırı ayrı.

## EX-BR02 · P2 — CSS visibility:hidden büyük video görünür oynatıcıdan önce seçiliyor

- Kaynak: `src/browser-media-selection.js:3`, `src/browser-media-controller.js:407`, `src/browser-media-controller.js:631`.
- Tekrar: Aynı sayfada görünür küçük video ve visibility:hidden büyük video oluştur; ikisine aynı sentetik medya kaynağını yükle; probe ve loop komutu gönder.
- Gözlenen: Hidden video area320000 ile seçildi; visible.loop=false, hidden.loop=true oldu.
- Beklenen: Görünür kullanılabilir medya, CSS ile saklanan medyadan önce seçilmeli.
- Etki: Önizleme/sayfa arkaplanı gibi gizli büyük medya bulunduğunda genel oynatma komutları görünür filmi kontrol etmez; capture/OCR yanlış alanı hedefleyebilir.
- Kök neden: Rank yalnız clientWidth×clientHeight, paused, muted ve readyState okuyor. visibility:hidden, opacity ve viewport görünürlüğü sıralama girdisine alınmıyor.
- Gerçek consumer: browser:command probe→rankBrowserMediaCandidates→buildBrowserMediaCommandScript; sayfa içi controller.select aynı compareMedia kullanır. Sağtık menüsüne özel değildir.
- Sınır/karşı kontrol: Gerçek DOM ve metadata yüklü sentetik medya; fiziksel video görüntüsü/ses dinlemesi yapılmadı. display:none durumuna genellenmedi.
- Önceki ilişki: R815-B28 sağtık hedefinin kaybolmasıydı. Burada genel araç komutu ve farklı kök olan görünürlük sıralaması söz konusu. R46daki ASS seçicisinin farklı opacity sorunu bu controller değildir.

## EX-BR03 · P2 — Aynı belgede oynatıcı değişince eski docToken yeni medya üzerinde komuta izin veriyor

- Kaynak: `src/browser-media-controller.js:609`, `src/browser-media-controller.js:628`, `src/browser-media-controller.js:631`, `src/main.js:16218`.
- Tekrar: Orijinal video için probe docToken al; aynı document içinde videoyu başka elementle değiştir; MutationObserver turundan sonra eski token ile loop komutu çalıştır.
- Gözlenen: Komut handled:true döndü ve replacement video loop=true oldu.
- Beklenen: Probe ile mutasyon arasındaki hedef medya değişimi reddedilmeli veya kullanıcı eylemi yeni medyaya taşınmadan önce yeniden doğrulanmalı.
- Etki: SPA bölüm/reklam geçişinde eski oynatıcı için başlatılmış seek/pause/loop komutu yeni oynatıcıya uygulanabilir.
- Kök neden: docToken controller/window ömrüne bağlı. Token eşleşmesinden sonra controller.select yeniden en iyi öğeyi seçiyor; probun seçtiği HTMLMediaElement kimliği veya src revizyonu taşınmıyor.
- Gerçek consumer: main browser:command satır16218–16242 her kareden probe bekledikten sonra candidate.media.docTokenı komut scriptine verir. Bekleme sırasında aynı-belge medya değişebilir; main tab generation/URL guardı henüz değişmemiş olabilir.
- Sınır/karşı kontrol: Ürün command/probe scriptleri native Chromiumda çalıştı; tam uygulamada değişimin main pollingden önceki dar zamanlaması ayrıca yürütülmedi. Her SPA geçişi için garanti iddiası yok.
- Önceki ilişki: Önceki54te yok. R815-B18 export dialog belge değişimiyle farklı; burada belge aynı ve eski docToken doğru görünmesine rağmen medya nesnesi değişiyor.

## EX-BR04 · P2 — Dublaj hız geçersiz kılma kaydı aynı video elementinin yeni kaynağına taşınıyor

- Kaynak: `src/browser-media-controller.js:199`, `src/browser-media-controller.js:475`, `src/browser-media-controller.js:483`, `src/main.js:18255`.
- Tekrar: Orijinal dub-rate scriptiyle video playbackRate .5/baseRate1 yap; aynı elementin srcsini yeni medyaya değiştir; loadstart/loadedmetadata sonrası hızı ölç.
- Gözlenen: Yeni currentSrc yüklendiği halde playbackRate .5 kaldı.
- Beklenen: Kaynağa ait geçici dublaj hız düzeltmesi başka srcye geçince serbest bırakılmalı; yeni kaynak temel hızdan başlamalı.
- Etki: Aynı video elementini yeniden kullanan sayfalarda yeni bölüm, reklam veya fragman önceki dublaj hızını 3 saniyeye kadar devralır; sonraki yenilemeler pencereyi uzatabilir.
- Kök neden: setDubRate state.source alanını kaydediyor ama applyPlaybackPreference dub kaydını kaynakla karşılaştırmadan tekrar uygular. loadstart/loadedmetadata reapply bunu sürdürüyor.
- Gerçek consumer: Gerçek dub:rate servisi main18255te buildBrowserMediaCommandScript(dub-rate) kullanır. dubRateTargets cached frame/docTokenı da aynı belge içinde korur.
- Sınır/karşı kontrol: Ölçüm yeni kaynak yüklenmesinden100ms sonra yapıldı; kalıcı hız bozukluğu iddia edilmiyor, yerel3sn TTL var. Gerçek GPU dublaj üretimi kullanılmadı.
- Önceki ilişki: Önceki54te yok. EX-BR03 element replacement anındaki komut hedeflemesi; bu farklı kök aynı element üzerinde zaten tutulmuş geçici rate state/source ömrüdür.

## EX-BR05 · P1 — Normalizasyon kurulmuş medya CORS izinsiz kaynağa geçince normal oynarken sessiz kalıyor

- Kaynak: `src/browser-media-controller.js:100`, `src/browser-media-controller.js:114`, `src/browser-media-controller.js:120`, `src/browser-media-controller.js:133`.
- Tekrar: Bir localhost origininde aynı-origin PCM WAV audio yükle; orijinal media-preference normalizeAudio:true uygula; aynı elementi ikinci localhost portundaki Access-Control-Allow-Origin içermeyen WAVa geçir; source nodea ölçüm analyserını yeniden bağlayıp dalga tepe değerini ölç.
- Gözlenen: Aynı-origin peak .36622065; kaynak değişiminden sonra peak0. Yeni medya readyState4, pausedfalse ve zaman .35sn ilerliyor; graph1.
- Beklenen: Normalizasyon özelliği normal HTML medya oynatımını sessizliğe çevirmemeli; desteklenmeyen kaynak geçişinde güvenli yeniden kurulum veya görünür durum/geri dönüş olmalı.
- Etki: CDN/kaynak değiştiren gerçek oynatıcılarda video/ses zamanı ilerlerken kullanıcı ses alamaz. Kontrol panelinde sessizlik/bozuk durum nedeni görünmez.
- Kök neden: İlk aynı-origin kaynak için MediaElementAudioSourceNode kuruluyor. Sonraki CORSsuz kaynağı audioGraphAllowed reddetse de graph.source doğrudan destinationa bağlanıyor. Bu node artık spesifikasyona göre sıfır çıkarıyor; direct-connect onu doğal HTML çıkışına geri döndürmüyor.
- Gerçek consumer: Play/seek/loadstart/loadedmetadata eventleri applyPlaybackPreference→applyAudioPreference çağırır. Browser genel/site normalizeAudio tercihi orijinal buildBrowserMediaPreferenceScript üzerinden kurulur.
- Sınır/karşı kontrol: Fiziksel hoparlör dinlemesi yerine native AudioContext dalga ölçümü. İlk ölçüm bağlantısının fallbackte kopabileceği karşı denetimde fark edilip son koşuda CORS geçişinden sonra source→analyser yeniden bağlandı; sonuç yine0. CORS politikası aşılmadı.
- Önceki ilişki: R87 R78-08b başlangıçtan cross-origin medyada graph kurmama kararını tasarlanmış saymıştı. Bu yeni geçişte graph zaten var; guard yeterli olmuyor. Önceki54te yok.
- Birincil kaynak: [W3C Web Audio API: MediaElementAudioSourceNode security](https://www.w3.org/TR/webaudio/#MediaElementAudioSourceOptions-security).
- Birincil kaynak: [Chromium MediaElementAudioSourceHandler](https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/modules/webaudio/media_element_audio_source_handler.h).

## EX-BR06 · P2 — Çapraz-origin karelerin bağlantı etiketleri aynı kısayolu kullanıyor ve seçimden sonra diğer katman kalıyor

- Kaynak: `src/browser-link-hints.js:26`, `src/browser-link-hints.js:72`, `src/browser-link-hints.js:121`, `src/main.js:16194`.
- Tekrar: İki localhost portuyla top sayfaya bir button ve çapraz-origin iframe içine ikinci button koy; mainin yaptığı gibi her frame üzerinde orijinal link-hints scriptini çalıştır; top documentta A tuşu gönder.
- Gözlenen: Top ve child aynı A etiketini gösterdi. A top buttonı tıkladı (1), child tıklaması0; child etiket katmanı kaldı.
- Beklenen: Sayfa genelindeki görünen etiketler tekil/eylem hedefi açık olmalı; seçim bittiğinde bütün frame katmanları birlikte kapanmalı.
- Etki: Kullanıcı iframe içinde gördüğü A etiketini yazsa da topframe A eylemi tetiklenebilir. Seçimden kalan etiketler sonraki yazmayı yakalayabilir ve etiket modu bitmiş görünümünü bozabilir.
- Kök neden: Cross-origin frame kendi bağımsız instance/kod alanını başlatır. Ana süreç tüm framelere aynı başlangıç algoritmasını gönderir. Activate yalnız yerel cleanup yapar; Escape için eklenen broadcastCleanup seçim yolunda kullanılmaz.
- Gerçek consumer: browser:command link-hints main16194 tüm browserFrames üzerinde buildBrowserLinkHintsScript çalıştırıyor. Probe iki gerçek Chromium frameinde aynı scripti çalıştırdı.
- Sınır/karşı kontrol: Tuş native Chromium document KeyboardEventiyle topa yöneltildi; fiziksel klavye odağının bütün varyantları test edilmedi. Same-origin frame delegation bu sorundan farklı ve gizli same-origin iframe negativecheck düzgünce tek etiket verdi.
- Önceki ilişki: R83 B83-11/R85 ESC frame cleanup şüphesiydi, güncel kod ESC broadcast içeriyor. Bu yeni test Escape değil, görünür kod çakışması ve başarılı activate sonrası diğer katmanın kalması. Önceki54te yok.

## EX-BR07 · P2 — Genel web akışlarının altyazı tercihi stream kimliğini kaybedip aynı sayfanın başka videosuyla birleşiyor

- Kaynak: `src/browser-subtitle-preferences.js:47`, `src/browser-subtitle-preferences.js:49`, `src/browser-session-store.js:197`, `src/main.js:6387`, `src/main.js:16559`.
- Tekrar: canonicalMediaIdentity ile generic watch sayfasının web:url kimliğini üret; deriveStreamMediaIdentity ile A/B manifestleri için iki streamId oluştur; BrowserSubtitlePreferences.put ile herbirine farklı iz seç; get(streamId) ve yeniden yükleme yap.
- Gözlenen: İki farklı streamId tek base web:url anahtarına indirildi. Diskte yalnız Bnin tercihi kaldı; get(A)=null,get(B)=null; yeniden yüklemede de A yok.
- Beklenen: Tercih yazım ve lookupı aynı canonical stream kimliğini kullanmalı; aynı sayfanın farklı videosu kendi altyazı/senkron seçimini korumalı.
- Etki: Genel sayfalarda bölüm değiştirip dönünce seçilen kaynak/çeviri izleri ve senkron kayıtları hatırlanmaz; aynı watch URL altındaki başka video önceki tercihin üstüne yazar.
- Kök neden: Preferences.put normalizeSessionTabı çağırır. normalizeSessionTab mediaId içinde :url: varsa persistedParts türetmez ve URLden yalnız base kimliği yeniden üretir. Main ise put/get için streamMediaId kullanıyor.
- Gerçek consumer: main16559 browser:session:updateTab put({mediaId:tab.streamMediaId||tab.mediaId}) yapıyor; main6387 restore get(tab.streamMediaId||tab.mediaId) arıyor.
- Sınır/karşı kontrol: Orijinal Node modülü; canlı site/profil değiştirilmedi. YouTube service:id stream kimliği counterchecki korunuyor; bulgu generic web:url tabanı ve benzeri URL kimliklerine özgü.
- Önceki ilişki: Önceki54te yok; R815-B49 pinned notların generic sayfa kimliği karışması başka depo/çağrı yoludur.

## Geliştirme önerileri — bug sayısına eklenmedi

### EX-G01 — Denetlenen medya hedefini görünür kıl

Fayda: Çok videolu sayfada hangi element/framein komut, OCR ve dublaj hedefi olduğunu kullanıcı doğrulayabilir.

Kabul: Medya araçları seçili hedefin sayfa/kare, görünürlük ve oynatma durumunu gösterir; kullanıcı başka görünür medyayı seçebilir; gizli/iframe aday değişiminde seçim sessizce kaymaz.

### EX-G02 — Ses işleme sağlık durumu ve güvenli kaynak değişimi

Fayda: Normalizasyon açıldıktan sonraki sessizlik nedenini ses ayarı/Windows sorunu sanmadan anlaşılır kılar.

Kabul: Kaynak origin/CORS değişimi tanıda görünür; güvenli olmayan graph geçişi belirgin uyarı verir; kaynak yeniden kurulduğunda zaman/mute/volume tercihi korunur; CORS atlatma yok.

### EX-G03 — Sayfa genelinde tek bağlantı etiketi oturumu

Fayda: Cross-origin iframe bulunan video/ödeme/giriş sayfalarında klavye gezintisi tahmin edilebilir olur.

Kabul: Aynı görünür anda tüm frame kodları benzersizdir; activate,Escape,scroll,navigation tüm alt frame katmanlarını temizler; odağın top/child olduğu iki native senaryo doğrulanır.

### EX-G04 — Akış tercihi deposu için veri kaybı olmadan kimlik geçişi

Fayda: Mevcut generic tercihleri çöpe atmadan stream bazlı seçim ve senkron devamlılığı sağlar.

Kabul: Aynı watch URLdeki iki manifest ayrı kayıtla round-trip olur; eski base kayıt tekvideoya tahminle bağlanmaz; belirsiz eski seçim kullanıcıya geri kazanma seçeneğiyle sunulur.

### EX-G05 — Düşük maliyetli, olay destekli shadow medya yeniden keşfi

Fayda: Geç yüklenen web component oynatıcıları çalışırken büyük SPA sayfalarının sürekli tam taranmasını önler.

Kabul: Başlangıç rootu, sonradan attachShadow, host çıkarıp yeniden takma ve observer128sınırı ayrı native fixturelarla çalışır; kapalı root için açık destek sınırı gösterilir; timer/observer bütçesi ölçülür.

### EX-G06 — Mini oynatıcıda ortak dil ve erişilebilirlik sözleşmesi

Fayda: İngilizce ana arayüz kullanan kişi ayrı pencerede Türkçe düğmelerle karşılaşmaz; küçük penceredeki kontrol amaçları açık olur.

Kabul: Mini player title,document.lang,nav aria-label,dört düğme ve hata metni EN/TR seçimini izler; dil değişimi/reopen aynı sonucu verir. Bug sayısına eklenmedi; mevcut browser-mini.html/js metin borcudur.

### EX-G07 — Kaynak değişimi için kısa native kabul matrisi

Fayda: Salt birim testlerin kaçırdığı belge/element/src yaşam döngüsü sınırlarını az sayıda hedefli kontrolle kapsar.

Kabul: Aynı-belge element replacement, aynı-element src replacement, cross-origin ses geçişi ve dub-rate release ayrı beklenen durumlar verir; testler kendi PID/profil/localhost sunucularını kapatır; kişisel oturum kullanılmaz.

## Kanıt ve tekrar

`native.cjs`, `native-result.json`, `prefs.cjs`, `prefs-result.json`, ortak `findings.json`. `refine-probe.cjs` yalnız test ölçüm dalını iyileştiren tek seferlik düzenleme kaydıdır; yeniden üretimde çalıştırılması gerekmez.

```powershell
node .tmp/extra815-browser/prefs.cjs
Start-Process -FilePath "D:\Whisper Local\node_modules\electron\dist\electron.exe" -ArgumentList '"D:\Whisper Local\.tmp\extra815-browser\native.cjs"' -WorkingDirectory "D:\Whisper Local" -WindowStyle Hidden -PassThru
```

Native çıktı dosyasının güncellenmesini ve bu PIDnin kapanmasını denetle. Native harness toplam7gözlem içerir:6hatalıdavranış+1başarılı gizliiframe karşıkontrolü; sonuncusu bug sayılmaz. Bir Node tercih bulgusu eklenince toplam7bug. Üç saniyelik440Hz PCM WAV test belleğinde üretilir; kullanıcı medyası yok. Yeni bağımlılık kurulmadı; mevcut Electron/Node modülleri kullanıldı.

İlk CORS analiz dalının fallback sırasında disconnect olabileceği fark edilip final harnesste geçişten sonra source→analyser yeniden bağlandı. Sonuç hâlâ peak0; W3Cnin MediaElementAudioSourceNode CORS-cross-origin sessizlik kuralı kök nedene uyuyor. Bu ölçüm iyileştirmesi ürün bugı sayılmadı. Gizliiframe bağlantı etiketi adayı native countercheckte yalnız görünür1etiket verdi; reddedildi. Mini oynatıcı activeTab komut adayı da mainin sekme değişiminde miniyi kasıtlı kapattığı görüldüğü için bug sayılmadı.

Tam npm/CI/start.bat/install.bat açılışı, canlısite/giriş/DRM, ücretli sağlayıcı/GPU ve fiziksel ses dinleme yapılmadı. Rootun ayrı200döngülü soak çalışması bu dosyanın kanıtı değildir.
