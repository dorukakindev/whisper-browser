# Rapor 604 — files (5).zip entegrasyon adayları

İstek: Paketten neleri almalıyız? Bu tur değerlendirmedir; özellik uygulaması değildir.
Güncel master/başlangıç: f21edf4cb387b29a047ef886e1c8758950b3c72b.
Dal: codex/package-review604. Ürün kodu değişmedi.
Arşiv SHA256: bb21d785d3b892bd83f5e08c7282cec52460934e599da0fbff4abcc4daea72a8

Paket iki öğe içerir:153141baytlık whisper-browser-entegrasyon-rehberi.md ve52449baytlık whisper-browser-entegrasyon-kodlari.zip. İç ZIP wb/altında bağımsız modüller/testler içerir. Arşiv korunmuş, kurulum/çalıştırma betikleri işletilmemiş ve kaynak dosyalarının üstüne çıkarılmamıştır. Yalnız iki saf yardımcı izole değerlendirilmiştir.

## Ana bulgu

Rehber açıkça gerçek src/backend dosyalarını okuyamadığını, CLAUDE.md/ARCHITECTURE.md üzerinden arayüz varsaydığını bildiriyor.65test veLinuxElectron iddiaları paketin kendi beyanıdır; bu projede entegrasyon veya Windows başarısı değildir. Güncel yerel kaynakta eksik diye sunulan birkaç özellik zaten var. Bu yüzden toptan birleştirme önerilmiyor.

## Alınacaklar ve alınmayacaklar

|Modül|Karar|Güncel kod dayanağı ve uygulama şartı|
|---|---|---|
|M4 subtitle-qc|İlk alınacak:ek kurallar ve profil seçimi|src/renderer/timeline-issue-scan.js zaten boş/kısa/çakışan/hızlı/uzun/bozuk cue tarıyor;src/subtitle-pair-quality.js çeviri/akıcılık kanıtı sağlar. Ayrı ikinci panel yerine mevcut tarayıcıya profilli kare aralığı,CPS,satır uzunluğu,kesime yakınlık ve açıklama eklenmeli. Kaynak altyazıyı kendiliğinden değiştirmeyen inceleme; Netflix diye sunulmadan önce güncel resmi değerler ayrıca doğrulanmalı.|
|M5 media_analysis|Yüksek fayda:dalga formu ve sahne kesim bilgisi|Odaklı kaynak aramasında paketle eşdeğer ortak waveform/shot API görünmedi. Bu veri mevcut timeline/senkron incelemesine bağlanabilir. Seçili aralık,ses izi,iptal,süre sınırı,ffmpeg stderr/exitcode ve dosya kimliğine göre cache gerekir. Hazır kod nonzero ffmpeg durumunu sonradan hata olarak kontrol etmiyor; çıktısız başarısız dosya boş başarı listesi döndürebilir(kod üzerinden). Blocking read sırasında iptal de gecikebilir; doğrudan alınmamalı.|
|M6 library-search|Değerli ürün özelliği:önce metin araması|Medya araması src/renderer/media-search-model.js başlık/kitap/müzik/kayıt kaynaklarını arıyor;src/browser-transcript-search.js bir transkript içinde,src/book-text-search.js kitap içinde arıyor. Kayıtlı altyazıların tümünde arayıp videonun saniyesine götüren ortak indeks faydalı. Mevcut indeks/veri yaşamına bağlanmalı. better-sqlite3/sqlite-vec Electron/Castlabs WindowsABI ve büyük kütüphane maliyeti doğrulanmadı; yeni yerel embedding modeli zorunlu yapılmamalı. Asenkron embed sonrası yeniden indeks/silme yarışları için nesil kimliği gerekir(kod incelemesi).|
|M3 translate_guard|Yalnız biçim koruma fikri ve hedefli karşı örnekler|backend/sentence_translation.py zaten sahne bağlamı;src/browser-translation-scheduler.js cümle/cue kimlikleri ve parts doğrulaması taşıyor. Bunları basit20satırlık yeni hatla değiştirmek geri adım olur. İç içe HTML/ASS stillerinin sırası ve dengesi için mevcut çeviri hattına token doğrulaması eklemek araştırılmalı. Paketteki restore_tags ters kapanış/açılışı kabul ediyor(aşağıdaki probe). Gerçek model/doğallık sonucu çıkarılmaz.|
|M1 webrequest-mux|Fikir doğru;paket uygulaması doğrudan alınmaz|src/main.js3917/3923YouTube header handlerları;src/browser-adblock.js Ghostery engine.enableBlockingInSession kullanır. Electron aynıolay/oturumda son listener'ı kullanır;ortak sahiplik değerli. Fakat Ghostery'nin kayıtlarını da aynı katmana taşımadan yalnız bizim listener'ı mux'a koymak yeterli değildir. Callback-once,exception/timeout,unsubscribe veheaders birleştirme sözleşmesi yeniden kurulmalı. Paket probe'unda soncallback2kez çağrıldı. Şu an kesin mevcut browser reklam arızasının nedeni budur iddiası yok.|
|M2 sync_split|Yeni motor olarak alma;test girdileri/karşılaştırma adayı|backend/transcribe.py9916find_piecewise_offsets,9983apply_piecewise;sync_piecewise varsayılan açık. backend/browser_align.py ffsubsync/alass parçalı referans yolu var. Mevcut motoru değiştirmeden farklı kesim/recap vakalarında ölçüm fixture'ları değerlendirilebilir. Paket yalnız sentetik kıyas sunduğunu söylüyor.|
|M8 condensed-playback|Yeniden ekleme|src/playback-policy.js8–9ve77–80altyazısız boşluk atla/hızlandır modları,renderer15982sonrası kullanıcı politikası zaten var. Yeni controller dublajın hız/senkron oturumuyla ikinci sahip oluşturabilir. Gerekli uç durum testleri mevcut politikaya uyarlanabilir.|
|M9 JASSUB|Yeniden ekleme|src/browser-ass-renderer.js8–11ve129–132JASSUB+WASM,yerel vendor ve lisans dosyaları var. Yeni CSP gevşetmesi veya ikinci dağıtım hattı açma. Tam ekran/font doğrulaması gerekiyorsa mevcut uygulama üzerinde yapılır.|
|M7 Anki|Bu projeye alma|Kullanıcı talimatı:ürün İngilizce öğrenme uygulaması değil;kelime ezberi/Anki odağı eklenmeyecek.|
|M10 güvenlik/paketleme|Yalnız uyarlanmış bağımlılık denetimi;diğerlerini ertele|Mevcut tools/install-orchestrator.js hash/lock durumunu kullanır. Paket güvenlikworkflow'u kökte requirements.lock varsayar;bizde backend kilitleri var. Node22sabitlenmiş,yeni güvenlik aracı npxile sabitlenmeden indirilir. Yapılandırılmadan alınmamalı. GömülüPython büyük/ayrı kurulum işi;mevcutCUDA/torch/start.bat akışını değiştirme. archive-reports.mjs docs/audits hedefler;bizim docs/raporlar ve indeks sözleşmesine aykırı,alınmayacak.|

## İzole doğrulanan paket kusurları

###604-P1: Mux final callback iki kez

Paketin gerçek createWebRequestMux fonksiyonu Node VM'de sahte webRequest kayıt sınırıyla çalıştırıldı. Tek handler `cb({});throw Error('after callback')` çalıştırır. Beklenen finalCallbackCount=1;gözlenen2. Sebep callback zincirinin bitişi global olarak bir kez kapatılmıyor;catch içinde donezaten true olsa da next()yeniden çağrılıyor. Bu paket kusurudur;paket uygulamamızda kurulu değildir.

###604-P2: Ters etiket sırası başarılı sayılıyor

Paketin protect_tags/restore_tags işlevleri kendi kaynaklarından ASTile,LLM/orkestrasyon çalıştırılmadan alındı. Kaynak `<i>Hello</i>` ve model yanıtı `[[T2]]Merhaba[[T1]]`. Çıktı `</i>Merhaba<i>`,başarı bayrağıTrue. Sebep yalnız placeholder çoklu kümesi karşılaştırılır;sıra/dengeli iç içelik doğrulanmaz. Etiket koruma fikri faydalı;bu uygulama yeterli değildir.

## Önerilen ürün sırası

1. Mevcut kalite görünümüne açıklamalı/profilli QC kuralları.
2. Seçili aralık için ortak dalga formu ve sahne kesim verisi;önizleme/isteğe bağlı zaman önerileri.
3. Kayıtlı altyazılarda kütüphane genelinde arama ve zaman koduna gitme;önce metin araması.
4. Mevcut cümle tabanlı çeviride etiket bütünlüğü;hat değişimi yapmadan.
5. Browser isteği sahipliğini inceleyip gerekirse ortakdispatcher;Ghostery ile birlikte,Windows regresyonuyla.

İlk dört kullanıcıya doğrudan değer sağlar. Muxaltyapısı yalnız somut çakışma ve entegrasyon sözleşmesi üzerinden yapılmalı. Mevcut VoxCPM2motoru/çeviri akışı bu paketle değiştirilmez.

## Kaynaklar ve sınırlar

- Kullanıcı arşivi ve yukarıda konumları belirtilen güncel yerel kaynaklar.
- Resmi Electron WebRequest dokümanı:https://www.electronjs.org/docs/latest/api/web-request (aynı olayda son listener kullanımı).
- JASSUB ana depo:https://github.com/ThaUnknown/jassub (ASS renderer niteliği;bizdeki kurulum ayrıca yerel koddan görüldü).
- Genel lisans tablosu bu turda hukuki değerlendirme olarak onaylanmadı. Kod alınmadan önce kullanılan somut sürüm/dağıtım bileşenlerinin lisansları ayrıca kontrol edilmeli.

Kurulum,model indirme,canlı sağlayıcı,gerçekfilm,WindowsUI/GPUtesti veya mevcut ürün regresyon paketi çalıştırılmadı;ürün kodu değişmediği için bu incelemede gerekli görülmedi. İki probe yalnız paket yardımcılarının davranışını gösterir. Kullanıcı dosyaları ve kişisel uygulama korunmuştur. Bu öneriler henüz uygulanmış özellikler değildir.
