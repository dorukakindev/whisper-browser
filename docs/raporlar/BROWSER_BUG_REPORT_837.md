# R837 — Ana iş akışlarında farklı 30 önemli bug ve geliştirme önerisi

1 Kasım2026. İncelenen kaynak HEAD **9b3f9e462abaebfd1e3a321fcb72e9594b8c7533**. **4 yeni doğrulanmış P2 bug +26 ayrı geliştirme önerisi =30 yeni madde.** Bunlar30bug değildir. Önceki R835/R833 kökleri ve R834/R836 görsel kararları tekrar sayılmadı. Bug onarımının kabul koşulu ayrıca öneri diye sayılmadı. Ürün/test/ayar/bağımlılık değiştirilmedi; hiçbir düzeltme uygulanmadı.

Üç GPT6.1Sol medium yardımcı asistan, film/Keşfet/Letterboxd ve dublaj/altyazıyı; ana ajan browser, bağımsız tekrar, dedup ve teslimi inceledi. Asistan/dublajda doğrulanmamış adayları önemli bug diye saymak yerine, mevcut özelliklerin somut eksik sınırları için öneriler yazıldı. Öncelik yanlış dilde arşiv geri alma, doğru film eşleşmesini koruma ve önerinin dayanak sayısını doğru göstermedir.

## F837-01 · P2 — Çok alt etiketli geçerli hedef dil Türkçe arşiviyle çakışıyor

**Tekrar:** Aynı URL/article ve kaynak için tr çeviriyi gerçek main persist fonksiyonundan gerçek diske kaydet. Site profilinin kabul ettiği zh-hans-cn dilini config'e geçirerek Çince çeviriyi kaydet. Profil/main dili doğru korurken archive.savePage iki kayda **aynı kimliği** verir. Sonraki Türkçe findPage **Çince içerik ve targetLanguage=tr** döndürür. zh-hans kontrolü ayrı kimlik oluşturur. Aynı normalizer JSON/HTML export hedef dil metadata'sını da tr yapar; bu varyant ayrı bug sayılmaz.

**Kök:** browser-translation-archive.js:61–64 yalnız sıfır/bir alt etiket kabul eder ve sessizce tr'ye döner; profile Intl.Locale kabulü daha geniş. savePage:265/277/279 ve findPage:317/320 bu anahtarı kullanır. Gerçek profil validator/config/persist/atomik archive save/find yürüdü; doğru dilde sentetik içerik, URL/completion adapterları kontrollüdür. Native dil seçimi veya canlı model kabulü yok.

**Etki/kabul:** Doğru Türkçe kayıt başka dil tarafından aynı namespace'te bastırılır; kullanıcı yanlış dil geri alır. Bütün üretici/tüketiciler ortak BCP47 normalizasyonu kullanmalı, geçersiz hedef açık reddedilmeli. Eski yanlış etiketli veriye içerikten dil tahminiyle otomatik müdahale edilmemeli. R85C3 terim scope regex'i, R833 manga sekme terimi ve R489 bozuk index/payload dili kontrolü farklı köklerdir. [Ayrıntı](evidence837/browser/notes.md), [sonuç](evidence837/browser/result.json), [probe](evidence837/browser/probe.cjs).

## F837-02 · P2 — Siteye özel hedef dil arşiv geri yüklemesinde yok sayılıyor

**Tekrar:** Genel dil tr, site profili en olsun. Gerçek effectiveBrowserProfile ve previewBrowserPage en gönderir. Gerçek arşivde EN kayıt vardır. Aynı tab için gerçek restoreArchivedBrowserPageTranslation daha ilk lookup'ta global tr ile sorgular ve **ok:false/missing:true** döner. EN hasPage=true/TR hasPage=false karşı kontrolü mevcut.

**Kök/etki:** renderer:9104–9120 ve24735–24744 etkin site/path/tab değerini çözer; main:7067–7075 yalnız genel ayarı kullanır. Doğru kayıt olduğu halde geri dönüş başarısızdır; yeniden iş gerekebilir. Yanlış Türkçe metnin bu senaryoda gerçekten ekrana uygulandığı iddia edilmez. F01normalizasyonundan bağımsızdır: yalnız basit geçerli tr/en kullanılır.

**Kabul:** Otomatik geri yükleme etkin hedefi kullanmalı; source-generation/restore-sequence kontrolleri korunmalı, global ayarı değiştirmek çözüm sayılmamalı. VM'de gerçek fonksiyonların erken lookup yolu, gerçek arşiv/disk ve sentetik kontroller kullanıldı; tam WebContents/gerçek gezinme değil. [Kontrol](evidence837/browser/result.json).

## F837-03 · P2 — Özgün başlıkla doğru içe aktarılan film zevk profilinde eşleşmesini kaybediyor

**Tekrar:** Katalogda Yerel Film/originalTitle Original Film/2020, kişisel9/10, Drama ve yönetmen; CSV'de Original Film/2020/rating1. Gerçek Python parser→preview/apply→shelf/catalog disk→profile zinciri preview matches1/preserved1 ve apply matched1 verir. Katalog puanı9 kalır. Profil ise **average1/5, metadataMatched0, genres[]** döndürür. Yalnız görünen başlık Original Film yapılan kontrol **average4.5/5, metadataMatched1** döndürür.

**Kök/etki:** media-shelf-service.js:24/33/280–306 title/originalTitle ile doğru eşleşir; media-taste.js:5/13–24 yalnız görünen title+year kullanır. Importun doğrulanmış bağı sonraki tüketicide yoktur; korunmuş kişisel puan ve tür/yönetmen kanıtı öneri hesabında kaybolur. R815-B43 ölçek hatası değildir: mevcut9/10→4.5/5 dönüşümü doğru ama alias yüzünden devreye girmez. R835 feedback namespace ayrışması farklıdır.

**Kabul:** Importun doğrulanmış kimliğiyle profil eşleşmesi korunmalı; alias belirsizse iki adaydan rasgele film seçilmemeli. Gerçek dosya/parser/IPC/modüller, sentetik diyalog/HTTP kullanıldı; native katalog/canlı site yok. [Film ayrıntısı](evidence837/film/notes.md), [sonuç](evidence837/film/result.json), [probe](evidence837/film/probe.cjs).

## F837-04 · P2 — Aynı filmin tekrar izlemeleri bağımsız yapım desteği sayılıyor

**Tekrar:** Tek filmi iki farklı izleme tarihinde5/5 olarak gerçek CSV'den içe aktar. Katalog1/diary2 kalır; tür count2/confidence emerging ve titles aynı filmi iki kez içerir. Gerçek Sana özel cevabı profileBecause.count2, quiz supported Drama ve score1.25 üretir. Tek izleme kontrolünde count1/single, quiz supported[] ve score1.

**Kök/etki:** Diary'nin farklı izlemeleri tutması doğrudur; media-taste.js:15/20–24 her event'i bağımsız yapım sayar. media-taste-ui.js:28/48 bunu yapım ve en az iki yapım desteği diye sunar; taste-quiz.js:16–21 ve media-discovery-service.js:120–127 bu sayıyı tüketir. Tek filmin tekrar izlenmesi, profil kanıtını olduğundan geniş gösterir.

**Kabul:** Bağımsız destek için distinct film kimliği, izleme ritmi için ayrı event sayısı kullan; puan agregasyonunun son/güncel politikası açıklansın. Geçerli izleme tarihlerini silme. R835 dayanak görünürlüğü önerisi bu somut sayım hatasını kapsamıyordu. [Kontroller](evidence837/film/result.json).

## 26 ayrı geliştirme önerisi

Aşağıdakiler uygulanmış özellik veya doğrulanmış bug değildir. Her biri mevcut başlangıç noktası, yeni davranış, önceki kapsamdan fark ve kabul ölçütü içerir. Dublaj katman/teslim önerileri video ses üretimi kapsamındadır; tarihsel P081–P090 müzik analizi paketine yeni hedef eklenmez. Önce kaynak/izin ve mevcut işin korunması; ardından kullanıcı denetimli üretim ve teslim uzantıları önerilir. Aynı önerinin farklı varyantları tek madde içinde tutuldu.

### G837-01

Uzun iş tamamlandığında güvenli devam fırsatı
Mevcut `assistant-flows.js:record/resume` ve `assistant-agent-ui.js:apply/flowInfo` continuationı kabul anından600000ms sonra siler. Saatler sürebilen Whisper/dublaj işinde kaynakta kalan kullanıcı yeniden soru kurar. Süreyi körlemesine uzatmak yerine job-owned checkpoint ve tamamlanma sonrası sınırlı yeni inceleme penceresi ekle. Kabul:15dk süren fixture işinde tamamlanmış stage tekrarlanmaz; job/source/thread değiştirilmişse devam red; restart sonrası eski mutation otomatik uygulanmaz. R826 başarısız stage retry ve G835 dayanıklı soru taslağı farklıdır. Mevcut expiry politikası yeni bug sayılmadı.

### G837-02

İstek başına ölçülmüş sağlayıcı bütçesi
Mevcut provider6round,2400max_tokens,2MB stream ve timeout sınırları var; token harcaması/usage toplanmıyor. Kullanıcıya isteğe bağlı toplam giriş/çıkış token bütçesi ve güvenli kesme eşiği sun; fiyat bilinmiyorsa para uydurma. Kabul: Kontrollü iki provider roundundaki usage birlikte sayılır; raporlanmayan usage tahmin diye ayrılır; budget sonrası yeni paid round başlamaz; mevcut metin korunur. Bu mevcut cevap makbuzuna model adını yazma G835-01 veya R815 otomatik altyazı karakter bütçesi değildir.

### G837-03

Uzun kitap araştırması için insanın yönettiği kapsam planı
Mevcut search_book40sayfalık batch, next ve truncatedPages döndürüyor; her soruda provider6round limiti var. Kullanıcının seçtiği bölüm/sayfa aralığının hangi parçalarının arandığını; başarısız/atlanmış batchleri ve kalan işi salt okunur araştırma checkpointinde birleştir. Kabul:200sayfanın3batchi aranınca120sayfa kapsandı,80kaldı; yeniden devam yalnız eksik batchler; kitap revizyonu değişirse eski kapsam ayrı; tümkitap okundu iddiası yok. Bu G835-01 tek yanıt makbuzu veya G835-02 sohbet metin araması değil, birden çok turu kapsayan sorgu planıdır.

### G837-04

Uygulanmamış kartı açıkça reddet ve yetkisini geri al
Mevcut service proposals Map TTL/başarılı adım invalidationı ve UI Apply/Refresh/Continue var; insanın belirli kartı açıkça reddettiğini main'e kaydeden endpoint görünmüyor. 'Bu öneriyi reddet' eylemi kartı main tarafında iptal etsin, konuşmada inert reddedildi kaydı bıraksın. Kabul:Native/managed diğer yüzeydeki aynı proposalId ile Apply artık red; başka kart/medya işi iptal edilmez; reddedilen kart otomatik tekrar sunulmaz, yeni açık istek yeni kimlik yaratabilir. Bu stop request veya job cancel özelliği değildir.

### G837-05

Bu soru için salt okuma ve araç alanı seçimi
Mevcut registry source-kind'e göre tool sunar, mutationlar zaten insan kart onaylıdır. Kullanıcı yalnız açıklama isterken soruya özel 'yalnız oku' veya 'yalnız kitap/altyazı' capability scope seçebilsin. Kabul:Policy main/provider seviyesinde tool tanımlarını ve dispatchi birlikte daraltır; model alan dışı mutation kartı üretemez; sonraki soruda açıkça değiştirilir; hiçbir yeni otomatik yetki verilmez. Kaynak bağlı mevcut onay kartları yeniden önerilmiyor, insanın öneri oluşum alanını daraltması ekleniyor.

### G837-06

Kaynak önizlemesinden alan bazlı gönderim seçimi
Mevcut sourceText allowlist/bütçe, kaynak scope ve kaynak önizlemesi var; note/synopsis/selectedText gibi alanlar bulunduğunda otomatik safe bağlama alınır. Bir soruya özel, kullanıcıya görünen 'kişisel notu dahil et', 'konuyu dahil et', 'yalnız seçili pasaj' seçimiyle etkin payloadı daralt. Kabul:Kapalı alanlar provider body'de gerçekten yok; coverage seçilmiş kapsamı açıklar; sonraki soruya sessizce farklı field taşınmaz; sır alanı zaten gönderilmez. G835-04 pinleri soruya ekleme farklıdır; bu zaten otomatik eklenen alanları çıkartabilmedir.

### G837-07

Tamamlanan asistan işinde kaynağa bağlı geri dönüş
Mevcut Jobs ve flowInfo canlı durum gösterir; panel kapalıyken tamamlanmış exact işi sonraki adıma bağlayan kullanıcı bildirimi/geri dönüş fırsatı ayrı bir ürün akışıdır. İsteğe bağlı, sessizliğe saygılı tek completion/failure bildirimi; 'ilgili konuşmaya dön' ve 'sonucu incele' eylemleri ekle. Kabul:A/B iki farklı iş tamamlanınca doğru source/thread/message açılır; eksik kaynak açık bildirilir; hiçbir ses/çeviri otomatik başlatılmaz; tekrarlı progress bildirimi yok. G01 token ömrü bu bildirimin yerine geçmez; bu kullanıcıya dönüş/odak yönetimidir.

### G837-08

Başarısız salt okuma adımını seçerek yeniden dene
Mevcut UI retry tüm başarısız soruyu tekrar send eder; provider tool trace ve final failed-check sayacı var. Kullanıcı kaynak aynı kalmışken yalnız başarısız read-only tool'u yeni turda seçip tekrar deneyebilsin; önceki başarılı aramalar gereksiz yeniden çalışmasın. Kabul:İki başarılı bir başarısız fixture'da yalnız seçilen read tool yeni çağrı alır; arguments/source snapshot görünür; eski mutation/proposal replay edilmez; yeniden elde edilen kanıtın tarihi/scope'u ayrı; secret/ham path saklanmaz. Bu R826 başarısız media job stageine yeni onay kartıyla retry veya G835-06 branch karşılaştırması değildir.

### G837-09

**Kişisel yorum analizi örneğini dönem/puanla seçtir.** `media-taste-ui.js:63–69` personal review örneği data.reviews prefix'i, en çok20 ve7400 karakter; yalnız salt pre gösterir. Kullanıcı son dönem/önceki dönem veya düşük/yüksek puanlardan açık seçim yapabilsin; gönderilen ID/karakter/atlanmış sayısı gösterilsin, maliyet artışı otomatik olmasın. Kabul seçilmeyen kişisel yorum gönderilmez; sentetik farklı iki dönem gerçekten farklı kanıt seçer. R835-G07/08 halka açık Letterboxd havuzu/tam metin değil; kullanıcının kendi yazılarının örnek seçimidir.

### G837-10

**Onaylanmış kişisel AI çıkarımını ayrı geri çek.** `media-taste-ui.js:38` accepted analysis gösterir, :76 yeni kaydetme; `media-shelf-service.js:309` yalnız validate/save var. Yanlış/eskimiş bir çıkarımı veri dosyasını düzenlemeden kaldırabilmek gerekir. Açık kaldır eylemi analysis'i temizlesin; puan, kişisel yorum, açık ağırlık/not ve quiz korunmalı. Sonraki film analizinde acceptedAnalysis olmayacağı önceden belirtilsin; otomatik yeniden AI yok. Mevcut quiz silme farklı nesnedir; R835 analiz aktarımı/freshness önerisi değildir.

### G837-11

**Letterboxd importunda belirsiz eşleşmeyi satır bazında çöz.** `media-shelf-service.js:32–35,286,294` ambiguous title listesi ve skipped var; UI preview sayı özeti `media-shelf-ui.js:385–388`. Kullanıcı aynı ad/yıldaki iki yerel katalog kaydını IMDb/TMDB/originalTitle/poster yardımıyla karşılaştırıp açık tek hedef seçebilsin veya atlayabilsin; apply öncesi hedef kimliği/revizyonu yeniden doğrulansın. Mevcut otomatik eşleşmeyi ekleme önerisi değil, güvenli ret sonrası kontrollü çözüm; F837-03 alias düzeltmesi bunun yerine geçmez.

### G837-12

**Importtan önce puan/izlendi alan farkını göster.** Aynı üretici :293–297 mevcut puanı korur, unspecified watchStatus'u completed yapar; preview yalnız preserved sayısı verir. Seçili filmde incoming2/5→katalog4/10 veya mevcut9/10 korunacak ve watchStatus önce/sonra görünmeli. Kabul salt preview sıfır yazım; korunmuş9/10 hiçbir seçim olmadan değişmez; yeni ekleme/koruma/atlama ayırt edilir. Bu ölçek hatası düzeltmesi değil çalışan importun incelenebilirliğidir; tek toplam sayacın yeniden eklenmesi değil.

### G837-13

**Sana özelde tür çeşitliliğini kullanıcı denetimine aç.** `media-discovery-service.js:122–132` ilk3 genre sonucunu sırayla ekler, son ilk60 satırı döndürür; ilk tür60+ sonuca sahipse diğer seçili türler görünmez. Başarılı sonuç sözleşmesi garanti çeşitlilik vaat etmediği için bug sayılmadı. İsteğe bağlı tür başına dengeli kota/round robin ve kullanılan tür seçimi; varsayılanın değişimi açıklansın, aynı IMDb tek kart kalsın, hidden/watched/owned filtreleri sürsün. Kabul her3 havuzda60+ uygun benzersiz satır varsa dengeli kipte ilk60 içinde üç havuzdan da katkı göster; eşit kota seçildiyse her birinden20 satır beklenir; ağ isteği sayısı mevcut3 sınırında kalsın. R835-G07 halka açık yorum kaynak havuzları farklı nesne/amaçtır; G835-12 gerekçeyi açmak değil çıktı çeşitliliğidir.

### G837-14

**Kişisel yorumun özgün kaynağına ve izleme tarihine açıl.** Python `media_shelf.py:226–227` watchedDate/uri tutar, `media-taste.js:31` profile review DTO date verir ama uri taşımaz; `media-taste-ui.js:44` kart yalnız title/year/rating/text. Kendi yorumunda izleme tarihi, güvenli Letterboxd URI ve “özgün kaydı aç” sunulsun; accepted personal-insight alıntısı aynı yerel yoruma kaydırsın. Kişisel URI/paylaşım varsayılan public export'a eklenmesin. Kabul iki tarihteki iki yorum doğru kaynağa gider, kaynak yoksa yerel kanıt korunur; ağ çağrısı sadece açık link eyleminde. R836 halka açık film yorum okuyucusu/kaynak linkleriyle farklı personal review koleksiyonudur.

### G837-15

**Film ilişkilerinde kütüphane izleme durumuyla daralt.** `film-context-features.js:32–36,52–54` related list own kontrolü yalnız Open in library ve In my library grubu; source önerileri ve kütüphane varlığı zaten mevcut. “Kütüphanemde ama tamamlanmadı / tamamlandı / kütüphanemde yok” filtresi ve satırda mevcut watchStatus göster; metadata ilişkisini zevk tahmini diye sunma. Kabul tamamlanmış film filtrede gizlenir ama katalogdan silinmez; diğer gruplar yanlış farklı filme bağlanmaz; izleme tercihi otomatik yazılmaz. G835-11 kişi filmografisi role filtresinden farklıdır; yeni recommendation motoru önerilmez.

### G837-16

Aynı zaman çizelgesine yerleşmiş bağımsız katmanları dışa aktar

Mevcut: `src/renderer/index.html:3923` audio/video/dual; `backend/dub_export.py:152–173` voice/background/music/ambience önce ayrı filtre düğümlerinde hazırlanır, sonra amix ile birleştirilir. `prepare_background.py` bir instrumental kaynak üretir; bu teslim edilebilir ayrı hizalı stem export özelliği değildir. Yeni davranış: kullanıcı açıkça seçerse voice/background/music/ambience ayrı WAV dosyaları ve aynı örnek hızı/süre/başlangıç makbuzu. Ham kaynak stem ile duck/warp uygulanmış teslim stem'i farklı adla seçilmeli. Kullanım: başka editörde karışım düzeltmek için tekrar TTS gerekmez. Kabul: +2sn sync örneğinde bütün seçili stem'ler aynı final süreye ve doğru yerleşime sahip, dosya olmayan katman 'üretildi' sayılmaz; İptal mevcut dosyayı değiştirmez. R815-G25 mix preflight, R835-G15 bundle hash veya G18 stream fişi yeniden önerilmiyor.

### G837-17

Final videoya uygun zamanlı isteğe bağlı altyazı teslimi

Mevcut: proje save `dub-workspace.js:68–79` kaynak zamanlı SRT'leri korur; `dub_export.py:174–196` final video/ses map eder, altyazı izi map etmez. Yeni davranış: kullanıcı görüntülenen çeviri veya okunan metni seçerek final MP4'e seçilebilir altyazı izi veya final zamanlı SRT/VTT yan dosyası ekleyebilsin. Kaynak SRT'yi aynen eklemek yeterli değildir; aralık başlangıcı çıkarılmalı, sync at() ile sınırlar dönüştürülmeli. Kabul: 60sn'de başlayan klipte kaynak 61–63 cue'su lokal1–3 olur, +2sn genişlemede haritanın doğru final sınırlarına gider; kaynak dosya değişmez; eklenen altyazı dili kullanıcı onayına dayanır. Mevcut burn-in ve proje subtitle kopyası yeni özellik diye sunulmuyor.

### G837-18

Konuşma normalizasyonundan ayrı final karışım yüksekliği kontrolü

Mevcut: `tools/voxcpm2/dub_normalize.py:14–36` konuşmayı -20 LUFS/-2TP/LRA11 hedefiyle iki geçişte normalize eder. `backend/dub_export.py:173` final amix'e limiter uygular; bu final karışımın entegre LUFS ölçümü değildir. Yeni davranış: final mix'in ölçülen LUFS/dBTP'sini ve kullanıcı seçerse ayrı teslim hedefini sun; konuşma üretimini yeniden başlatma, ölçüm başarısızlığında sayı uydurma. Kabul: aynı konuşma + sessiz/yüksek BGM iki farklı final ölçüm üretir; seçilen hedefe yapılan exportta süre/sync korunur ve ölçüm final dosyadan tekrar alınır. R701 konuşma normalizasyonu veya R835-G18 stream metadata fişi tekrar değil; müzik içeriği analizi yapılmaz.

### G837-19

Ayrıştırılmış arka plandaki kalıntı konuşmayı yerinde işaretle

Mevcut: `prepare_background.py` instrumental katman üretir, workspace background volume+mix preview sunar. `measure_background.py:1–4,14–30` yalnız bilinen ayrı konuşma/müzik stem'leriyle kontrollü projeksiyon ölçer; gerçek filmde temiz stem'ler genellikle yoktur. Yeni davranış: kullanıcı seçili zaman aralığını yalnız ayrılmış arka plandan dinleyip 'eski konuşma kalmış / müzik zarar görmüş' notu ekleyebilsin; not exact output/background hash+aralığa bağlı olsun. İnceleme otomatik ayrıştırma başarısı veya TTS yanlışlığı diye puanlanmasın. Kabul: bir işaret yeniden açılan aynı projede aynı aralığa gider; farklı background hash'inde bayat olur; sessizce katman silme veya yeniden model çağrısı yapmaz. Genel insan grup onayı R548/R587'den farklı: konuşma take'i değil arka plan ayrıştırma kalıntısı kontrolü.

### G837-20

Eklenen müzik/ortam katmanına açık başlangıç, bitiş ve fade ayarı

Mevcut: `dub-workspace-model.js:4–11` sabit kazanç+duck; `dub_export.py:161–165` her ek katmanı sıfırdan keser, gerekirse pad eder. Yeni davranış: yalnız kullanıcının eklediği music/ambience için kaynak başlangıcı, sahneye giriş/çıkış ve kısa fade süresi seçimi. Otomatik kaynak background'u ayrı kalmalı. Kabul: 3sn giriş/7sn çıkış/0.2sn fade sentetik kontrolünde hem preview hem export aynı eğriyi uygular; uzun/negatif/sahne dışı değer ret; sync dönüşümü tek koordinat sözleşmesine bağlı. Yeni otomatik müzik seçimi/analizi veya mevcut duck özelliğinin tekrar sunumu değil.

### G837-21

Aynı konuşma kaydı için adlandırılmış karışım karşılaştırmaları

Mevcut: `dub-workspace-ui.js:5,59–63` tek aktif mix/layers durumu; proje save bunun bir snapshot'ını korur. Grup take A/B ve önceki konuşmayı dinleme zaten var. Yeni davranış: 'konuşma önde' ve 'kaynak ortam önde' gibi kullanıcı adlandırdığı iki mix snapshot'ını aynı konuşma WAV'ında aynı zaman noktasında A/B karşılaştır; seçim açıkça exporta uygulansın. Kabul: snapshot değişimi TTS/cache/ref ayarı değiştirmez, dinleme zamanı zıplamaz; katman dosyası değişirse snapshot bayat gösterilir; başka projeye taşmaz. Bu yeni voice-take A/B değildir ve otomatik mix kalitesi yargısı üretmez.

### G837-22

Kaynak videonun HDR/renk dönüşümü için görünür export kararı

Mevcut: `dub_export.py:176–177` sabit libx264/yuv420p transcode; probe yalnız duration+codec_type ister (`:118`). HDR/bit derinliği korunmuş diye ürün iddiası bulunmadığından bug sayılmadı. Yeni davranış: export preflight video color_primaries/transfer/space/pixel formatını okuyup kullanıcıya 'uygun SDR dönüşümü' veya destekleniyorsa 'renk bilgisini koru' seçimi sun; desteklenmeyen durumda açık sınır. Kabul: sentetik HDR metadata girişinde gerçek tonemap/koruma yolu seçimi doğrulanır, final ffprobe beklenen renk alanlarını gösterir; SDR kaynak gereksiz değişmez. Genel codec planı R815-G09'dan dar ama farklı içerik koruma işi: ses codec uyumluluğu değil görüntünün transfer fonksiyonu.

### G837-23

Konuşmalı aralık ile sessiz sahneler için ayrı, kullanıcı belirlediği duck zarfı

Mevcut: `dub-workspace-model.js:44–53` ve `dub_export.py:94–99` attack0.08/release0.35 sabittir; `speechRanges` gerçek ses etkinliğini zaten kullanır. Yeni davranış: sabit kazanç ve mevcut duck korunarak saldırı/bırakma sürelerini sınırlı aralıkta düzenleme, envelope'u grup civarında görme/dinleme. Çok kısa duraklarda BGM'nin pompalamasını kullanıcı isteğine göre azaltır; yeni VAD veya model gerekmez. Kabul: aynı speechRanges için preview ve render aynı envelope'u üretir; 80ms varsayılan mevcut sonucu korur, kullanıcı seçimi sınırlandırılır, failed gruplar duck tetiklemez. D-G05 katman giriş/çıkış fadesinden farklıdır: bütün katmanın sahne sınırı değil mevcut konuşmaya bağlı dinamik envelope'un kontrolü.

### G837-24

Manuel sayfa düzeltmelerinin kökenini arşivde koru
Mevcut main:12592 manualEditIds ekler,17506 exporta verir; archive.savePage/normalizePageRows yalnız kaynak/çeviri/tag/role/section/order taşır; restore:7133 manualEditIds boş başlar. Öneri: kullanıcı/model ayrımı, önceki çeviri özeti, değişiklik tarihi ve kaynak revizyonu sınırlı metadata ile korunsun; her geçmiş metni veya kişisel profili sınırsız saklama. Kabul: tek manuel satır yeniden açılınca kullanıcı düzeltmesi etiketi korunur, eski kayıtta köken unknown; açık geri al mevcut source snapshot uyumsuzsa ret; otomatik model çağrısı yok. Mevcut canlı edit özelliği veya R835 asistan cevap makbuzu değil, browser sayfa düzeltmesinin kalıcı provenansı. Yeni işlevsel bug sayılmadı.

### G837-25

Değişen web sayfasıyla arşivin farkını incelet
Mevcut archive.matchArchivedPage:149–190 kaynak/tag/role/section ile eşler, findPage:330 min ratio uygular; main:7184 kısmi geri yüklemeyi açık bildirir. Öneri: eşleşen/değişen/yeni/silinmiş kaynak bloklarını salt okunur karşılaştır; kullanıcı isterse yalnız değişen seçili blokları yeniden çevirsin. Kabul: tek değişen paragraf eski çeviriymiş gibi gösterilmez; aynı kalan paragraf yeniden ücretli isteğe gitmez; source generation değişirse inceleme bayat olur. Var olan eşleşme/partial uyarısı yeniymiş gibi sunulmaz. R835 package import semantic diff ve R833 dosya bulk replace farkı farklı veri/iş akışlarıdır.

### G837-26

Kalıcı çeviri arşivi için site bazlı saklama tercihi
Mevcut main persist otomatik savePage yapar; archive INDEX_LIMIT5000 ve _saveIndex eski dosyaları kapasiteye göre toplar, kullanıcı site seçimi/yaş süresi bu API'de yok. Öneri: site için hiç kalıcı saklama / sınırlı yaş / sakla tercihi; mevcut kayıtlar için URL/tokenları açığa çıkarmayan adet+disk boyutu önizlemeli açık temizleme. Kabul: optout açık site çevrilebilir fakat yeni kalıcı page JSON/Markdown oluşmaz; diğer site/altyazı/dublaj/sistem cache dosyaları silinmez; İptal0silme, hata kısmi sonuçla gösterilir. Cookie/site-data clear veya genel cache silme yeniymiş gibi sunulmaz; bu uygulamanın ayrı çevrilmiş içerik arşivinin kullanıcı denetimidir.

## Yeni30maddeye katılmayan ek doğrulama

Asistan ajanı gerçek service/provider zincirinde **yalnız CR satır sonlu SSE** yanıtının reddedildiğini doğruladı; aynı gövde LF veCRLF ile başarılı. Tek büyük parça ve birer bayt parçalamada altı kontrol var. Ancak bu darP3 uyumluluk konusu R815-G32 standart framing önerisiyle ilişkili; kullanıcının önceki konuları saymama talebi nedeniyle yeni30içine alınmadı. Ana akım sağlayıcının bu biçimi gerçekten gönderdiği iddiası yok. [WHATWG parsing standardı](https://html.spec.whatwg.org/multipage/server-sent-events.html#parsing-an-event-stream) loneCR/LF/CRLF'ye izin verir. [Asistan kanıtı](evidence837/assistant/result.json) ve [kapsam notu](evidence837/assistant/notes.md). Eski önerinin testle doğrulanması yeni önemli bug kotasına dönüşmedi.

## Doğrulama ve sınırlar

Yayımlanan problar ana ajan tarafından bağımsız tekrarlandı: asistan uyumluluk kontrolü, film iki bugı, browser iki bugı ve dublaj mevcut export grafiği ayrı sınıflandırılır. AssertionPASS hatalı davranışı doğrular, onarım değildir. Dublaj probu gerçek mix helper ve Python export fonksiyonunu kullanır; ffprobe/FFmpeg çalıştırması adapterdır, gerçek medya renderi/akustik kalite yok. Film gerçek Windows Python parser ve atomik catalog/shelf disk yazımı yapar; provider/diyalog kontrollüdür. Browser main/renderer fonksiyonları aynen VM'e alınır; tüm uygulama bootstrap'ı çalışmaz.

İlk sandbox çocuk süreç/Map-realm fixture engelleri ürün bugı sayılmadı. Sonuçlar/komutlar [devir notunda](../devir/2026-11-01-1345.md), kaynak ve kanıt hashleri [manifestte](evidence837/manifest.json). Night1000 imzaları dedup içindir; tarihselPASS sayıları bugünün testi veya yeni bug sayısı yapılmadı. Asistan/dublajda doğrulanmamış adaylar elendi. SonarQube taraması, Wolfram hesabı, ücretli LLM, gerçek site/kişisel hesap, GPU/CUDA, native WindowsUI/DPI/ekran okuyucu, normalstart.bat/temizinstall.bat ve uzunsoak kabulü yok. Yeni bağımlılık/dış kod/şema yok. CI açık kalır, sonucu beklenmez; görülmemiş başarı iddia edilmez. Kişisel dosyalar/anahtarlar/loglar yayımlanmaz; bütün yeni fixture çıktıları .tmp altında kalır.
