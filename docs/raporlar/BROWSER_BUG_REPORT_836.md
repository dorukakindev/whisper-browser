# R836 — Asistan, Keşfet/Letterboxd, browser, dublaj ve altyazı denetimi

1 Kasım 2026. Taban `ad4f17932c284b665dbfd567cb932888f7c5c125`, master. **Toplam 30 madde: 7 doğrulanmış işlevsel bug ve 23 ayrı geliştirme önerisi.** Öneriler bug sayısına dahil değildir. Ürün/test/ayar/bağımlılık değiştirilmedi; hiçbir düzeltme uygulanmadı. Aynı bugın düzeltme talebi ayrıca öneri olarak sayılmadı.

Üç GPT‑6.1 Sol medium yardımcı asistan, film ve dublajı; ana ajan browser, sayısal kontroller, kanıt tekrarı ve teslimi inceledi. Önceki R815, ilgili R818–R834 ve Night1000 aile/imzaları karşılaştırıldı. R833'ün queue/manga/rollback/waveform/playlist bulguları ve R834 tasarım önerileri tekrar sayılmadı. Aşağıdaki konular daha önceki yeteneklerin somut eksik sınırlarıdır; uygulamada zaten bulunan özelliği yeniymiş gibi ekleme önerisi değildir. Eski genel aileyle temas eden maddelerde fark belirtilir.

## En önemli sonuç

Öncelik kaynak doğruluğu ve yanlış güven hissini engellemek olmalı. Asistanın atfı doğru kanıta açılmalı; dublaj karşılaştırması bütünüyle düşmüş pasajları göstermeli; üretimde uygulanamayan metin düzenlemesi kayıt açılınca unutulmamalı. Film tarafında spoiler onayı bütün sonuç görüntüleme yollarında geçerli olmalı, aynı film için son kişisel değerlendirme iki yüzeyde çelişmemeli. Bunlar görsel ciladan daha önce ele alınacak işlevsel sorunlardır.

## Doğrulanmış buglar

### F836-01 · P2 — Web paragrafı atfı yönetilen asistan yanıtında kayboluyor

**Tekrar:** Browser sayfa bağlamında `S1` paragrafı bulunan bir soru ve `Supported by [S1]` cevabı oluştur. Gerçek renderer metin işleyicisi, AssistantWorkspace.begin/finish ve global-assistant snapshot zincirini çalıştır. Eski DOM balonunda bir kaynak bağlantısı var; kullanıcıya yayımlanan yönetilen yanıtta **0 bağlantı**, kaydedilen mesajda **0 paragraf kanıtı** var. Aynı akışa geçerli `U1` altyazı kanıtı verilince native snapshot'ta bir bağlantı oluşuyor.

**Etki/kök:** Kullanıcı cevabın iddiasını kullanılan web paragrafıyla doğrulayamıyor; yalnız görünmeyen eski balondaki bağlantı yeterli değil. Mesajın yönetilen yola girmesi, eski node-link fallback'ini atlıyor; sayfa kanıtı kayıt modeline taşınmıyor. Bu sadece soğuk başlangıçta oluşan bir reload hatası değil: ilk yayımlanan yanıtta da eksik.

**Kabul:** Sayfa atıflarını türü/kimliği/kaynak revizyonuyla kalıcı mesaj kanıtına taşı; görünür ilk yanıt ve yeniden açılan kayıt aynı paragrafı göstermeli. Altyazı kanıtı ve kaynak-sahipliği kontrolleri korunmalı. Gerçek site veya model kalitesi iddiası yok; DOM/taşıma kontrollü, gerçek çalışma alanı modülleri kullanıldı. [Ayrıntı ve kaynak satırları](evidence836/assistant/notes.md), [probe](evidence836/assistant/probe.cjs), [sonuç](evidence836/assistant/result.json).

### F836-02 · P2 — Kitapta iki farklı arama sonucu aynı atıf kimliğiyle birleşiyor

**Tekrar:** Aynı sayfada birbirinden uzak RED_TOKEN ve BLUE_TOKEN aramaları yap. Gerçek kitap araması farklı offset/metin döndürürken ikisine de `B1-0` kimliği veriyor. Gerçek agent servisi üç kontrollü sağlayıcı turunda iki search_book çağrısını işliyor, **2 kanıtı** cevap paketine ekliyor. Gerçek UI sonlandırıcısındaki kimlik tabanlı Map bunları **1 kanıta** indiriyor; ilk kırmızı pasajın atfı son mavi pasaja bağlanıyor.

**Etki/kök:** İlk bulgunun görünen kanıt alıntısı ikinci pasajla değişiyor. Gezinme aynı kitap/sayfaya aittir; yanlış kitap veya sayfa açıldığı kanıtlanmadı. Sayfa ve chunk başlangıcı, sorguya bağlı farklı alıntıları tekilleştirmeye yetmiyor. R815/R830 B98 kaynak havuzuna yanlış kaynak kabulü farklı köktür; burada izinli aynı kitap ve aynı sayfanın iki farklı alıntısı çakışır.

**Kabul:** Alıntı kimliği kaynak revizyonu+sayfa+offset/aralıkla tekil olsun veya aynı kimlikteki farklı aralıklar açıkça birleştirilsin. Eski cevaptaki kanıt sonraki arama tarafından sessizce değişmemeli. HTTP yanıtları ve kitap metni kontrollü; gerçek provider/tool/servis/UI zinciri yürütüldü; kitap metni okuyucusu ve IPC sender/owner sınırı kontrollü adaptördür, gerçek PDF gezinmesi değildir. [Kanıt](evidence836/assistant/result.json).

### F836-03 · P2 — Spoiler onayı kayıtlı analiz geçmişinde atlanıyor

**Tekrar:** Spoiler yorum içeren kayıtlı analizi filmde aç. Ana sayfada spoiler metni doğru biçimde saklanır. Reveal spoiler analysis'e basmadan gerçek Manage reviews düğmesine, ardından Saved analyses ayrıntısına tıkla. Include spoiler reviews false kalırken ilk iç tarihçe otomatik açık ve olay örgüsü özeti görünür olur.

**Kök:** `review-decision-ui.js:55` ana okuma kapısı var; `:226–229` tarihçe aynı kapıyı uygulamadan resultView üretir. **Yalnız editörü açmak ifşa değildir:** dış tarihçe kapalı başlar; açık spoiler uyarısı olmayan Saved analyses açıldığında ifşa olur. Bu ayrım probda gerçek düğme/summary zinciriyle doğrulandı.

**Kabul:** Her kayıtlı sonuç yolu aynı açık spoiler onayını kullanmalı. Kaynak yorumu seçme checkbox'ı geçmiş analizi gösterme onayı sayılmamalı. R832 tam yorum/More sorunu ve R829 parser spoiler dedup'u farklıdır. [Film ayrıntısı](evidence836/film/notes.md), [sonuç](evidence836/film/results.json).

### F836-04 · P2 — Aynı filmin en yeni kişisel değerlendirmesi iki yüzeyde ayrışıyor

**Tekrar:** IMDb/TMDB kimliği doğrulanmış kütüphane filmine like/eski not kaydet; aynı filmi Keşfet'te dislike/yeni not olarak düzelt; ikisini yeniden decision-get ile oku. Gerçek servis kütüphanede eski like, Keşfet'te daha yeni dislike döndürüyor. Yeniden okuma sonrası sürer; yalnız async eski yanıt problemi değildir.

**Kök:** `media-tools-service.js:182–183` en yeni sharedFeedback'i bulur, fakat `ownFeedback || linked.feedback` ile varsa eski namespace kaydını üstün tutar. İki yüzeyde de önceden kayıt bulunduğunda yeni ortak kayıt bastırılır. Kimliksiz eski notları rasgele bütün filmlere yaymamak gerekir.

**Kabul:** Kimliği doğrulanmış aynı filmde güncel tepki/not için açık en-yeni-kayıt politikası; farklı namespace'lerdeki taslaklar ve kaynağı belirsiz eski kayıtlar korunmalı. R826 ortak geçmiş zaten var; onu yeniden önerme değil, çift kayıt çatışmasının somut hatası. [Probe](evidence836/film/probe.cjs).

### F836-05 · P2 — Reddedilen yazar kaydı sonraki geçerli yorumu duplicate diye bastırıyor

**Tekrar:** İlk sayfada A yazarının metin1 ve farklı rewatch permalink'inde metin2 yorumları olsun. İlki kabul, ikincisi aynı yazar kuralıyla ret alır. Sonraki sayfada B'nin metin2 yorumu gelsin. İstenen iki yazar yerine yalnız A kalır; excluded.author=1, excluded.duplicate=1. Reddedilecek A/metin2 kaydını kaldırınca aynı kabul edilebilir kaynaklardan A ve B alınır.

**Kök:** `letterboxd-auto.js:65–74` metin/permalink seen setlerini yazar kapısından önce değiştirir. Örneğe hiç girmeyen kayıt gelecekteki kabulü etkiler. R829 parser içi spoiler metni tekilleştirmesi değildir; global fetchReviews yazar-ret yan etkisi ve sonraki sayfa söz konusudur.

**Kabul:** Bütün kabul kapıları geçmeden kabul edilmiş örneğin dedup setlerini değiştirme; mevcut yazar/metin/permalink tekilleştirmesi korunsun. Kontrollü HTML reader kullanıldı; bu kart sırasının canlı sitedeki sıklığı ölçülmedi. [Sonuç](evidence836/film/results.json).

### F836-06 · P2 — Ses metninden tamamen düşmüş ara pasaj karşılaştırmada görünmüyor

**Tekrar:** Normal çeviri 0–2, 8–10, 12–14 saniyelerde üç cue; speech metni yalnız ilk/son cue olsun. Kaybolan orta cue `İkinci ödeme 500 lira.`. Gerçek comparisonRows **2 satır [0,12]**, **0 eksik sayı uyarısı** döndürür. Speech dosyası verilmediğinde aynı normal metin üç satırdır. Her iki dosyanın toplam kapsamı aynı; yalnız sonu kırpılmış dosya örneği değil.

**Kök:** `dub-experience-model.js:48–52` speech varsa yalnız onu satır temeli alır; `dub-experience-ui.js:54–62` filtreleri bu daraltılmış satırlara uygular. Ödeme cümlesi ve500, kullanıcı kontrol etmeye çalıştığı araçta görünmez. Bu, ses modelinin gerçekten500'ü atladığı kanıtı değildir; karşılaştırmanın görünürlük açığıdır.

**Kabul:** Kaynak/normal/speech aralık birleşimini karşılaştır; eşleşmeyen normal pasajı açık durumla göster. Her dosyanın kapsamı ve eşleşmeyen pasaj sayısı açıklanmalı; sessizlik otomatik konuşma kaybı sayılmamalı. Bu kapsam açıklaması aynı bugın kabul koşuludur, ayrı 31'inci madde sayılmadı. R815 ASR sayı denetimi farklı consumer'dır. [Dublaj ayrıntısı](evidence836/dub/notes.md), [sonuç](evidence836/dub/result.json).

### F836-07 · P2 — Kaydedilen dublajda metin düzenleme başarısızlığı bilgisi kayboluyor

**Tekrar:** Geçerli quality group içinde `speechEditing.natural=editor_failed` olsun. Gerçek RunInfo önce bazı konuşma düzenlemelerinin uygulanamadığını bildirir. Gerçek workspace register→projectSave→projectOpen zinciri ok:true döner; kayıtlı ve tekrar açılan grupta speechEditing yoktur; aynı açıklama artık boş döner. Metin ve verification durumu korunur.

**Üretici/kök:** `altyazi_oku.py:510,913–915,988` alanı kalite grubuna ekler; `dub-service.js:834` ilk tamamlanmada korur. `dub-workspace-model.js:17–44` whitelist alanı düşürür; latest restore ve proje roundtrip aynı projeksiyonu kullanır. `dub-run-info.js:15–22,53–54` bu alanı tüketir. Aynı alanın latest/proje varyantları tek bugtır.

**Kabul:** Bilinen speechEditing durumlarını sınırlandırarak normalize et ve kayıt/restore'da koru. Eski kayıtta eksikse unknown olsun; kaynak anlamının denetlendiği uydurulmasın. Gerçek proje dosya kopyalama/JSON/IPC yürüdü; fixture WAV sentetik bayt, ses decode/GPU/akustik kalite denenmedi. R829'da eklenmiş alanın kaybıdır; R591 telaffuz korunumu veya R833 waveform değil.

## 23 ayrı geliştirme önerisi

Her öneri bir ürün ihtiyacı, mevcut başlangıç noktası ve dar kabul koşulu içerir. Önceki genel fikrin bütünü yeni keşif sayılmaz; aşağıdaki davranış farkı hedeflenir. Geliştirme önceliği A en önce, B sonraki önemli pakettir. Bugların hepsi yukarıda ayrı P2 olarak değerlendirilmiştir.

### G836-01

**Yanıt bazında değişmez kaynak teslim makbuzu.** `assistant-context-manifest.js:25–49` sourceCoverage ile sağlanan/gönderilen/atlanan karakterleri zaten hesaplar; `assistant-thread-store.js:51` mesaj şeması bunları tutmaz. Her cevapta gönderilen kaynak türü, seçili caption scope ve kapsam adetlerini sınırlı metadata olarak koru; model/sağlayıcı kimliği, gerçekleşen tools desteği o yanıta ait olsun.

**Kabul:** Model ayarı sonradan değişse de eski cevap makbuzu değişmesin; tam eser okundu iddiası olmasın; sır/path/history ham içeriği eklenmesin.

**Önceki kapsamdan fark:** R829 kapsam şeffaflığı ve R815-G28 diske yazılma durumu mevcut. Bu öneri güncel kaynak önizlemesini tekrar yapmak yerine eski mesajın kendi gerçek teslim metadata'sını kalıcılaştırır.

### G836-02

**Kaynaklar arasında yerel sohbet araması.** `assistant-overlay.js:39` find yalnız etkin DOM mesajlarını filtreler; thread-store listesi kaynak başına20/total200sohbet zaten destekler. Kaynak başlığı+tarih+konuşma filtresiyle bütün kayıtlı sohbetlerin yerel salt araması.

**Kabul:** Farklı iki film/kitap ve web sayfasında aynı sözcük için kaynak ayrımı görünür; sonuç doğru sourceKey/thread/message açar; kayıp kaynak yalnız geçmişi gösterir; sağlayıcı çağrısı veya otomatik kaynak dosyası okuma yok.

**Önceki kapsamdan fark:** R833-G05 kayıtlı web sayfa FTS arama filtresi; R815-B128 araştırma defteri metin araması farklı depolar. Mevcut panel içi find yeniymiş gibi sunulmaz.

### G836-03

**Yapısal sohbet taşınabilir arşivi ve önizlemeli geri yükleme.** `assistant-overlay.js:42` mevcut export yalnız role+text Markdown üretir; `assistant-thread-store.js:59` version1 validateEnvelope zaten var. Kaynak bağı, dallar, kanıt ve işlem durumuyla export/import ekle.

**Kabul:** Yeni kurulum sentetik import'unda cevap ve kaynak alıntıları korunur; secret/path içeriği taranır; proposal/continuation IDs inert kalır ve eski mutasyon çalıştırılamaz; duplicate/limit/missing-source önizleme raporu var.

**Önceki kapsamdan fark:** Yeni export düğmesi önerilmiyor; mevcut metin export'unun kayıpsız yapılandırılmış alternatifi. R815-G08 genel yedek envanteri ve kitap proje yedek hataları ayrı veri sözleşmeleri.

### G836-04

**Sabitlenen kanıtı açık seçimle sonraki soruya ekleme.** `assistant-overlay.js:34–38` pinler zaten localStorage'da salt okuma notları; gönderim bağlamına otomatik eklenmez. Kaynak kimliği ve alıntı snapshot'ıyla en çokbirkaç pin için 'Bu soruya ekle' chips ve toplam metin bütçesi sun.

**Kabul:** Varsayılan pinler modele gitmez; açık seçimde yalnız gösterilen metin gider; silinmiş/değişmiş kaynak snapshot etiketiyle ayrılır; kullanıcının notu talimat veya doğrulanmış kaynak sayılmaz; yanlış source pin'i sessiz taşınmaz.

**Önceki kapsamdan fark:** R815-B49 pin scope karışma bugı ve R564 selected passage mevcut. Burada scope düzeltmesi değil, kullanıcının kontrol ettiği araştırma bağlamı seçimi uzantısı önerilir.

### G836-05

**Kaynağa ve sohbete bağlı dayanıklı taslak kurtarma.** `assistant-overlay.js:6,23,100–102`20öğelik memory drafts Map ile gezinmede taslağı korur; kapanıp açılışta bellek kaybolur. Mesaj göndermeden draft'ı sınırlı ayrı kayıtla kurtar.

**Kabul:** Ayrı sentetik profil crash/restart sonrası iki thread taslağı kendi kaynağında geri gelir; göndermeden API isteği olmaz; 'taslağı sil' kalıcı siler; sınır aşımı anlaşılır; gerçek credential alanı değil kullanıcı question draft'ı korunur.

**Önceki kapsamdan fark:** R826 retry başarısız gönderim ve R815-B74 gelen SSE cevabı kaybı farklıdır; mevcut session draft preservation başarısızmış gibi gösterilmez. Ürün henüz kalıcı taslak vaadi vermediğinden bug diye sayılmadı.

### G836-06

**Dal kökeni ve karşılaştırmalı cevap gezgini.** `assistant-workspace.js:88` branch mesaj prefix'ini kopyalar, thread-store `parentThreadId` tutar; overlay yalnız düz thread select sunar. Dalın hangi sorudan ayrıldığını kaynakla birlikte açıkla, iki yanıtı salt okunur karşılaştır ve kök sohbete dön.

**Kabul:** Dal açma orijinali değiştirmez; parent silinmişse kırık/inert köken açık; aynı kaynakta karışık iki branch doğru ayrılır; geçmiş action kartı karşılaştırmadan uygulanamaz; quote/kanıt kapsamı korunur.

**Önceki kapsamdan fark:** R834-T13 mesaj yönetimini sadeleştirme görsel önerisi; bu işlevsel soy/karşılaştırma uzantısıdır. Yeni branch özelliği iddia edilmiyor, var olan parentThreadId bağının kullanıcıya açılması öneriliyor.

### G836-07

**Kaynak havuzlarının analize kalan katkısını göster.** Mevcut `letterboxd-auto.js:112–116` coverage/sources/sampling hesaplar; `review-decision-ui.js:107` yalnız havuz adı/toplam/yazar sayısı, `:188–201` satır seçimidir. Eksik davranış: dengeli dört liste seçilse bile son gönderimde her listeden kaç yorum kaldığı görünmüyor. Önizleme seçimleri sonrası popüler/yeni/yüksek/düşük için gönderilen yorum+yazar sayısını yeniden hesapla; hiç kalmayan havuzu belirt. Kabul: bir havuzun tüm yorumları çıkarılınca katkı0 görünür, örnek otomatik değişmez ve temsil garantisi verilmez. Mevcut balanced özelliği veya R815-G27 freshness yeniden önerilmez.

### G836-08

**Tam kaynak ile gönderilen kesitin yerini birlikte incelet.** R832 tam metni korur; `review-decision-ui.js:201` included satırında yalnız sent.text, `:28` saved kaynakta yalnız analize kullanılan metin var. Eksik davranış: önizlemede kısaltılan tam metnin gönderilmeyen devamını aynı yorum kartından okumak için loaded-reader'a geri dönülüyor. Included-shortened kartında salt okunur 'tam kaynak / gönderilecek bölüm' disclosure'u ve karakter sınırı göster. Kabul: uzun kaynağın son marker'ı yalnız tam kaynakta bulunur, model payload'ı değişmez, varsayılan spoiler politikası korunur. More/fetch düzeltmesi veya kısaltma sayacı tekrar önerilmez.

### G836-09

**Kayıtlı analizi ve dayanaklarını okunabilir taşınabilir dosyaya aktar.** `review-decision-ui.js:15–29,226–229` kaynak linki/profil snapshot'ı/alıntı vardır; yorum alanında insan okunur aktarım eylemi yok. Genel workspace yedeği zaten vardır, yeniden önerilmez. Eksik davranış: kullanıcı sentezi, kaynağı ve seçili örnek sınırlarını uygulama dışında birlikte inceleyemiyor. Açık export eylemiyle Markdown/HTML üret; film kimliği, analiz zamanı, sample/pool sınırlılığı ve özgün alıntı linkleri dahil; kişisel zevk notu varsayılan dışarıda ve ayrı açık dahil etme seçimi olsun. Kabul: sentetik export yeniden açılınca her quote kaynak ID/linkine bağlı; yeni AI/ağ çağrısı yok. R815-G08 yedek envanteri ve G27 sürüm karşılaştırmasından farklı bir paylaşım/inceleme çıktısıdır.

### G836-10

**Keşfet konu çevirisinde karşılıklı okuma sun.** `media-discovery-ui.js:48–56` zaten original/Turkish toggle sağlar; bunu tekrar ekleme önerisi değildir. Eksik davranış: uzun açıklamada çeviri doğruluğunu karşılaştırmak için sürekli tek metin arasında gidip geliniyor. İsteğe bağlı karşılıklı/alt alta özgün+Türkçe okuma ve bağımsız etiket sun. Kabul: EN/TR720px ekranda iki metin okunur, dar ekranda alt alta; mevcut çeviri kullanılır ve ikinci ücretli istek çıkmaz. Yeni otomatik çeviri veya R834 hero düzeni değildir.

### G836-11

**Kişi filmografisinde rol odaklı inceleme ekle.** `film-context-features.js:24–26` mevcut filtreler film/dizi, tarih, yalnız kütüphane; `:32` role alanını her satırda zaten gösterir. Eksik davranış: aynı kişinin oyuncu/yönetmen/senaryo katkılarını ayırıp karar vermek için bütün liste taranıyor. Normalize edilmiş kredi rolüne göre opt-in filtre, bilinmeyen/çoklu rol ayrı korunarak gösterilsin. Kabul: bilinen oyuncu/yönetmen kayıtları seçime uyar; aynı yapımda çoklu kredi kaybolmaz; eksik rol uydurulmaz. Mevcut 'Same director' yapım önerisi ile aynı özellik değildir.

### G836-12

**Kişisel öneri gerekçesini dayanak filmlere aç.** `media-discovery-service.js:116–132` diary genre profili üzerinden count/average; `media-discovery-ui.js:121–122` 'tür · Npuan · ortalama' veya 'X beğeninden dolayı' kısa gerekçesini gösterir. Eksik davranış: N puanı hangi filmlerin oluşturduğu ve eski düşük ilginin neden devam ettiği karttan incelenemiyor. Ayrıntıda salt okunur dayanak başlık/kişisel puan/tür listesi ve mevcut profili aç eylemi sun; tür ilişkisini film için kesin kalite/atmosfer gibi anlatma. Kabul: sentetik2 puan girdisi iki doğru kaynağa bağlı gösterilir, tıklama puan veya watchlist'i değiştirmez. Mevcut because etiketi, öneri üretimi veya R830-G03 anket açıklaması tekrar değildir.

### G836-13

**İsteğe bağlı, açık kullanıcı eşlemesiyle konuşmacı→kayıtlı referans sesi ata.** `src/dub-service.js:451–456` bir iş için tek referenceId çözüyor, `:575` bütün SRT için aynı c.reference ve transcript'i Python'a veriyor. `src/dub-source-context.js:27` speaker bilgisini kaynak metin bağlamı olarak taşır; bu bilgi bugün farklı ses seçimi değildir. Yeni uzantı yalnız güvenilir mevcut speaker metadata'sı veya kullanıcı tarafından açık atanmış grup sınırlarında çalışsın; konuşmacı tahmini üretmesin. A→ref1/B→ref2 eşlemesi üretim tarifine ve tam cache recipe kimliğine katılsın, değişen referans yalnız bağlı grupları yeniden üretsin. Kimliği belirsiz/aynı grupta birden çok konuşmacı varsa varsayılan tek ses veya açık inceleme gerekli olsun; kaynak emotion/prosody ses kimliğiyle karıştırılmasın. Kayıtlı proje eşlemeyi ve referans fingerprint'ini korusun, fiziksel referans kaybolduğunda sessiz başka sese geçmesin. Fayda: diyalog sahnesindeki farklı kişilerin tek anlatıcıya dönüşmesi yerine bilinçli çok sesli teslim. Bu büyük, ayrı kapsamlı ürün önerisidir; mevcut A/B referans dinlemesi veya kaynak anlatımını izleme yeniden eksik sayılmaz. `konuşmacı.*referans|speaker.*reference|per.speaker` tarihsel araması R433 tek konuşmacılı referans tavsiyesi/R829 devamlılık sınırı/P024 bilinmeyende reference-only korumasını buldu; per-speaker ses eşleme özelliği veya aynı öneri bulunmadı.

### G836-14

**Karşılaştırmada kullanıcı seçimiyle rakam–Türkçe yazıyla sayı eşdeğerliği ipucu göster.** `dub-experience-model.js:30–35` difference yalnız digit dizilerini topluyor; `12`→`on iki` uyarlaması bugün doğru olarak yalnız şüphe sayılabilir. Varsayılan exact diff korunsun; ayrı `biçim dönüşümü olabilir` ipucu normalizasyonu gösterilsin, miktar/sahiplik/olumsuzluk eşdeğerliğine otomatik onay verilmesin. 12/on iki ve12/on üç kontrolleri; dosyaya yazım/model/ağ yok. Mevcut sayı filtresi veya ASR sayısal kapısı yeniden eklenmez.

### G836-15

**Dublaj proje varlıkları için taşınabilir boyut+SHA256 bütünlük envanteri ekle.** `dub-workspace.js:62–89` dosya kopyalama+göreli isimler zaten var; `:106–115` açılış dosya/yol/uzantı güvenliği var. Eksik/değişmiş ses/video/subtitle sonradan ayrı gösterilsin; yalnız hash değişimi varsa otomatik eski kaliteyi güvenilir sayma. Eski v1 projede checksum yoksa `doğrulanmamış` olarak açılabilsin, kişisel tam yol taşınmasın. Yeni backup/taşıma/kriptografik imza önerilmiyor; mevcut bundle'ın iç bütünlüğü uzantısı.

### G836-16

**Senkron dışa aktarımında kaynak süre→çıktı süre ve en çok yavaşlayan üç aralığı açıkla.** `dub-sync-map` videoDuration/audioDuration/segments zaten var; `dub-workspace-ui.js:116–124` inverse timing kullanır. Mevcut grup stretch bilgisi korunsun; toplam uzama ve tepe faktör/range özeti render öncesi gösterilsin. Smooth modda ortalama stretch ile tepe türev farklı etiketlensin; video ayarı otomatik değiştirilmesin. R815G25 disk/mix preflight veya yeni hız algoritması değildir.

### G836-17

**Grup kayıt listesinde tarama sınırı ve daha eski kayıt aramasını açıklaştır.** `dub-group-takes.js:35,44` en son200receipt ve20choice sınırı bugün sessiz. Mevcut immutable SHA/recipe/sender/source kontrolleri korunarak `son200üretim tarandı / daha eski kayıt olabilir` bilgisi ve açık sayfa/arama isteği eklensin; her kayıt güvenli doğrulansın. Limitten dolayı kayıt yok mesajını arşivde hiç kayıt yok sanmayı önler. Mevcut A/B, seek eşitleme, force-regeneration tekrar önerilmiyor.

### G836-18

**MP4 çift iz tesliminde salt okunur teslim fişi göster.** `backend/dub_export.py:182–193` dub-default/original-secondary başlıkları ve dil metadata'sı zaten üretilir; export dönüşü `dub-workspace.js:180` bugün yalnız path/url döndürür. Oluşan çıktıyı ffprobe ile okuyup gerçek ses/video stream sayısı, codec, varsayılan iz/dil ve süre özetini çıktı kartında sun; beklenen iki iz bulunmazsa tamamlandı yerine doğrulama uyarısı ver. Orijinal dili bilinmiyorsa tahmin etme. Yeni kanal seçici veya genel üretim tarifi değil, kullanıcının başka oynatıcıya göndereceği final dosya kontrolü.

### G836-19

**Senkron için ekstrapolasyon belirsizliği göster. Öncelik A.** Mevcut çok-noktalı fit ve residual/outlier göstergesi korunmalı (`browser-subtitle-sync.js:117–183`; renderer:12155–12181). İki noktayı tam uydurmak filmin sonunun doğruluğunu ölçmez. İki saniye aralıklı eşleşmede karşıt ±0.01sn tıklama hatası geçerli scale0.99/offset0.02 üretir; 7200sn sonundaki fark −71.98sn olur, mevcut büyük düzeltme predikatı false. Bu doğru matematik olduğu için bug sayılmadı. **Yeni davranış:** eşleşme spanı/medya süresi oranı ve seçilebilir tıklama hassasiyetiyle varsayımsal son-bölüm hata bandı göster; varsayımı açıkça etiketle, farklı fps veya gerçek hata teşhisi uydurma. **Kabul:** aynı span için daha uzak zamanlarda bant büyür; uzak iki eşleşmede daralır; kullanıcı onayı olmadan transform değişmez. R489 sayısal cancellation onarımı ve mevcut 1sn minimum-span kontrolünün yeniden önerisi değil. [Sayısal kontrol](evidence836/browser/results.json).

### G836-20

**Çeviri kapsamasını zaman örtüşmesi ve metin uygunluğunu ayırarak göster. Öncelik A.** `browser-subtitle-review.js:58–65` bugün herhangi bir pozitif zaman örtüşmesini Çeviri eksik uyarısı için yeterli sayar. Sentetik10sn kaynak+1ms çeviri için eksik uyarısı yok; sıfır örtüşmede var. Bu politika karşılıklı cue bölünmelerinde bilinçli olabilir; bug diye sayılmadı. **Yeni davranış:** kaynak cue başına çeviri zaman birleşiminin oranını isteğe bağlı tanı olarak göster, ör.0.01%; bunu semantik anlam tamamlandı yüzdesi diye sunma. **Kabul:** parçalanmış iki çeviri aralığı çift sayılmaz; boş metin kapsama katılmaz; onaysız çeviri/yeniden üretim başlatılmaz. R833 waveform zamanlama ve R834 tasarım hiyerarşisiyle ilgisiz. [Kontrol](evidence836/browser/results.json).

### G836-21

**Altyazı kalite uyarılarını öncelik ve konuma göre gezilebilir yap. Öncelik A.** `renderer.js:27997–28010` tüm uyarıların sayısını verir fakat ilk200ünü listeler; `index.html:2733–2748` Yeniden kontrol et ve liste taşır. Uzun filmde sonraki önemli eksik çeviri/çakışma sırf erken hızlı-okuma uyarıları yüzünden ilk200de olmayabilir. **Yeni davranış:** tür/süre aralığı filtresi, sayfalama ve sonraki/önceki uyarı; seçili kategori toplamı ve görünen aralık açık. **Kabul:** sentetik250uyarıda250nci satıra doğru media-generation korumasıyla gidilir; filtre dosyayı veya cue zamanını değiştirmez. Bu yeni kalite tarayıcısı talebi değil, mevcut gerçek taramanın tamamına erişim uzantısı. Sınırlı UI listesini tek başına veri kaybı bugı saymadım.

### G836-22

**Browser oturum paketi içe aktarımına anlamsal değişiklik önizlemesi ekle. Öncelik A.** `browser-session-package.js:149–176` checksum/schema/normalize ve geçersiz kayıt uyarıları zaten var. **Yeni davranış:** uygulamadan önce mevcut profil ile paketteki aynı medya/track revizyonlarını karşılaştır; seçilecek çeviri/senkron/sekme/site profili için eklenecek, korunacak, çatışacak adedini göster. Ham URL tokenı ve yerel kişisel yolu önizleme kanıtına dökme. **Kabul:** aynı medyada farklı user edit/sync snapshot çatışması açık seçim gerektirir; İptal0yazım; eski şema dönüşümü ve checksum doğrulaması çalışır. R815G08 genel yedek envanteri ve mevcut inspectPackage uyarısını yeniden ekleme değil, mevcut profile göre merge etkisini gösteren salt önizleme uzantısı.

### G836-23

**Kesilen browser indirmeleri için güvenli kurtarma açıklaması ve metadata günlüğü ekle. Öncelik B.** `browser-downloads.js:16–38` yalnız terminal kayıtları saklar; etkin DownloadItem nesnesi kalıcılaştırılmaz. Bu güvenli sınır korunmalı. **Yeni davranış:** aktif indirme için küçük filename/boyut/zaman/durum kaydı tut, sonraki açılışta kesildi bilgisini göster; Yeniden başlat eylemi ancak kullanıcının yeni açık isteğiyle ve native kaydet/overwrite akışıyla çalışsın. URL/çerez/Authorization değerini geçmişte saklama, resume garantisi verme. **Kabul:** sentetik crash sonrası dosya mevcutken üzerine otomatik yazılmaz; HTTP Range yoksa devam yerine yeniden başlat açıkça ayrılır; dosya silinmez. R26 tab unload sırasında session indirmesinin sürmesi farklıdır; burada uygulama yeniden açılışında kullanıcıya işin akıbeti açıklanır.

## Kanıt, araçlar ve sınırlar

Ana ajan dört probu bağımsız süreçlerde tekrar çalıştırdı; dört çıkış da0. Üç alan probu yedi hatalı davranış assertion'ını; browser probu önerilere ilişkin mevcut politikayı/sayısal kontrolü doğrular. **Probe PASS, düzeltme yapıldı demek değildir.** Kaynak/test diff'i boş. Kaynak satırları, kontroller, tarihsel farklar ve tekrar komutları üç ek notta korunur. Ek notta bug onarımına yakın kalan karşılaştırma kapsam önerisi ana raporda F836-06 kabulüne birleştirildi; ayrı sayılmadı.

SonarQube `sonar-analyze`/`sonar-list-issues` skill'leri okundu, araçlar ve CLI keşfi yapıldı. Bu oturumda SonarQube MCP analiz aracı yok, PATH'te sonar yok, kökte sonar-project.properties bulunamadı. **SonarQube taraması yapılmadı; sıfır issue veya başarılı quality gate iddia edilmez.** Kullanıcı bunları “işine yararsa” yetkilendirdiği için kurulum/hesap/hook değişikliği başlatılmadı. İleride entegrasyon için sonarqube:sonar-integrate skill ayrı uygulanabilir; mevcut denetimin tamamlanması buna bağlanmadı.

Wolfram context ve Language evaluator kullanıldı. Yalnız sentetik matematik gönderildi, proje kodu/profil/anahtar gönderilmedi. Tam rasyonel kontrol:24/(24000/1001)=1001/1000; bir saat sonunda3.6sn, iki saatte7.2sn fark. Ayrı tıklama-hatası örneğinde2sn aralıklı±0.1sn hata iki saat sonunda−719.8sn ekstrapolasyon hatası verir; yerel prob bunun±0.01sn varyantında−71.98sn buldu. Bu matematik G19 için gerekçedir; uygulamanın FPS dönüşümünü yanlış yaptığı iddiası değildir. [Wolfram rasyonel sayılar referansı](https://reference.wolfram.com/language/ref/Rational.html), [girdi ve alınan sonuç](evidence836/wolfram.json).

JSDOM/kontrollü adapter kanıtı gerçek native görsel/klavye/ekran okuyucu kabulü değildir. Filmde gerçek siteye, asistan/dublajda gerçek ücretli modele istek atılmadı. Dosya yazımları yalnız sentetik denetim profiline yapıldı. Kişisel ayar, açık browser sekmesi ve anahtarlar kullanılmadı. Windows Node/fs/proje IPC ve gerçek üretim JS modülleri doğrulandı; normal start.bat/temiz install.bat, GPU/CUDA, DRM/hesap, ses doğallığı, gerçek film kitaplığı ve uzun oturum/tam npm/CI kabulü yapılmadı. CI açık kalır, görülmeyen sonuç başarılı sayılmaz. R830B98 bilinen regresyonu bu tur giderildi denmez.

Seçilmiş probe/not/JSON ve kaynak hashleri yayımlanır; ham profil/ses/log dosyaları yayımlanmaz. [Manifest](evidence836/manifest.json) revizyonu ve dosya hashlerini bağlar. [Devir notu](../devir/2026-11-01-1325.md).

Son doğrulama: mevcut dört hedefli test dosyası ayrı süreçlerde çıkış0 (assistant-threads4, dub-experience8017, dub-workspace5, letterboxd-auto14 test). Bu30test30rapor maddesinin tamamını kapsıyor demek değildir. Dört yayımlanan probe tekrar çıkış0; her probe syntax kontrolü yapıldı. Üç yardımcı final ifadeleri salt inceledi; kitap atfı iddiası görünen alıntı kaybına daraltıldı.

Eşzamanlı teslim notu: başlangıç ad4f179 üzerinde tarama başladı; ayrı yorum okuma teslimi R835 numarasını kullandı ve master2cc48e6d49fcc8552bd62fda51fb4bf67cc77b0e oldu. Onun AGENTS/devir1321/raporu/diffi incelendi, korunarak bu denetim R836 olarak adlandırıldı. Güncel review-decision-ui değişikliği sonrası dört prob tekrarlandı; yedi bug sürüyor. Ek notların ilk revizyon/satırları tarihsel başlangıcı anlatır; final kaynak hashleri manifesttedir. Kişisel INDEX516 düzeltmesi yedeklenip satır sonları eşitlenmiş temiz üç yönlü birleşimle korundu, bizim commitimize alınmaz. İlk Node gitspawn EPERM ve CRLF birleşim denemesi başarı sayılmadı.

Eşzamanlı film değişikliği için ek mevcut review-workflow35testi ve letterboxd-auto14testi çıkış0. Önceki dört testin değişmemiş üç dosyası gereksiz tekrar edilmedi.
