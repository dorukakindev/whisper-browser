# BROWSER_BUG_REPORT_449 — Rapor447'nin51 maddesinin bağımsız değerlendirmesi

Tarih: 2026-10-17. Başlangıç HEAD:43b3b82f1169e57283dec7b01bc99ed06fe4d981. Ürün kodu değiştirilmedi.

Kullanıcı447 dosyasını yeniden verdi ve devam istedi. Bu tur kapsam51 maddenin tamamını kodla karşılaştırmak, mümkün olanları sentetik terminal deneyleriyle doğrulamaktır. Kaynak rapor önerileri talimat kabul edilmedi; henüz hiçbir ürün düzeltmesi uygulanmadı. Önceki6 kritik maddeye ilişkin448 bulguları korunuyor.

## Karar anahtarı ve sayılar

- D: temel davranış gerçek ürün fonksiyonunu çalıştıran doğrudan testle doğrulandı (29). Bazı maddelerde işlev doğru ama risk/şiddet yorumu hâlâ koşulludur.
- K: koşullu veya kısmi kanıt; kod yolu/double davranışı doğrulandı, iddianın tam üretim etkisi ya da önkoşulları doğrulanmadı (14).
- R: tasarım sınırı/iyileştirme veya kanıtlanmamış risk; şu haliyle doğrulanmış ürün bug'ı sayılmıyor (8).

D sayısı kesin üretim bug sayısı veya HIGH sayısı değildir. Örneğin payload-only olmayan API'nin mevcut çağıranı doğru kullanması, sayısal eşlemenin semantik belirsizliği ve normal downmix'in ters faz iptali farklı değerlendirilmelidir.

## Tüm51 karar

| ID | Karar | Kanıt, önkoşul ve düzeltme sınırı |
|---|---|---|
| BUG-CAT1-01 | D | R448: iki eşzamanlı attach2 interval; remove sonrası1 kalıyor. |
| BUG-CAT1-02 | K | Aynı oturumda stale tick pause sonrası geç play resolve sesi tekrar aktif yapıyor (audio double). Native HTMLMediaElement pause/load pending play iptal edebildiğinden gerçek cihaz etkisi ayrıca sınanmalı. |
| BUG-CAT1-03 | R | Listener dispose metodu yok; ancak gerçek UI bu controllerı bir kez kuruyor (browser-dub-ui.js). Birden çok instance ile üretim regresyonu gösterilmedi; zorunlu HIGH değil. |
| BUG-CAT1-04 | D | Gerçek sınıfta senkron mute throw -> attach reject, session hâlâ var ve1timer. Player mute fonksiyonu senkron çalışabildiğinden yalnız varsayım değil; gerçek native setter exception denenmedi. |
| BUG-CAT1-05 | K | -dub-text.json claim listesinde değil ve normal writeFileSync kullanıyor. Fakat olağan aynı-ID retry önce COPYFILE_EXCL ile EEXIST verir; testte eski metin değişmedi. Üzerine yazma ancak input engelinin aşılması/kaldırılması gibi ek koşulla mümkün; sıradan akışta doğrulanmadı. |
| BUG-CAT1-06 | R | Dosya sistemi atomik rezervasyonu yok; iş sahipliği tek servis/tek process içinde. Başka program aynı rastgele IDli dosyaya eşzamanlı yazarsa TOCTOU olabilir; bilinen sınır, kanıtlanmış saldırı/veri kaybı değil. |
| BUG-CAT1-07 | D | Hata sonrası aynı ID ve SRT ile retry EEXIST: Girdi/reviewed/...srt. Cache ve girdilerin tutulması bilinçli; uygulama yeni UUID üretirken normal UI yeniden denemesi bundan etkilenmeyebilir. |
| BUG-CAT1-08 | R | Silme tek deneme; cleanupErrors kayda alınıyor. Kilit sürdükçe dosya/ID kalabilir; gerçek Windows kilidi bu tur denenmedi. Önceki446 bunu zaten açık sınırlama olarak belgelemişti. |
| BUG-CAT1-09 | K | Referans metadata/transcript writeFileSync atomik değil; rename/use başarısızlığında bozulma riski var. Fakat preparation error/iptalde WAV/transcript/metadata temizliği446 ile mevcut. Boş klasör ve tanı logları kasıtlı tutuluyor; tümü bug sayılamaz. |
| BUG-CAT1-10 | K | VM fake timer + terminate false ve close yok -> timeout sonrası Promise settled:false. Gerçek çocuk kapanırsa reddediliyor; yalnız öldürme/kapanış başarısızlığında sonsuz busy riski. |
| BUG-CAT1-11 | K | before-quit ()=>void cancel() rejection yakalamıyor, tamamlanmayı beklemiyor. Main diğer işler için kapanış yönetiyor ama dub için özel await yok. Gerçek Windows kapanışında yetim süreç ölçülmedi. |
| BUG-CAT1-12 | D | Gerçek geçici legacy kaydını migrate et, hedefi sil, prepareVoiceStorage tekrar çağır -> silinen dosya yeniden var. Mevcut dosya force:false ile korunuyor; migration marker eksik. |
| BUG-CAT2-01 | K | R448: ham event aktarımı gerçek; TV tüketicisi zaten (_event,state) bekliyor. İşlev bozulduğu iddiası yanlış, event sınırı hardening ihtiyacı gerçek. |
| BUG-CAT2-02 | D | Win32 path modülü/FS fixture ile sürücüsüz \fixtures\test.srt -> D:\fixtures\test.srt kabul edildi. Windows çalışılan sürücüye bağlı belirsizlik; tek başına yetki atlama değil. |
| BUG-CAT2-03 | K | Win32 FS fixture: UNC realpath/exists grant denetiminden önce çağrılıyor. Ağ bloklaması/SMB trafiği olası; gerçek UNC ağına erişilmedi ve dış saldırganın IPC erişimi kanıtlanmadı. |
| BUG-CAT2-04 | D | Gerçek temp dosyalar, injected rename EIO: tmp install başarısız + backup restore başarısız -> orijinal hedef yok, tek .bak da yok. Veri kaybı doğrulandı; öncelik yüksek. |
| BUG-CAT2-05 | D | Gerçek journal/marker fixture; journal unlink EIO -> marker siliniyor, journal kalıyor. İkinci recovery committed:false görüp önceden olmayan ama başarıyla commit edilmiş hedefi siliyor. Veri kaybı doğrulandı. |
| BUG-CAT2-06 | D | settings-security.endpointIdentity /V1 ve /v1 için aynı kimliği üretir. provider-api-keys.providerCredentialScope ise custom path case koruyor. Hata gerçek ama rapordaki dosya ve tüm endpointlerin lower edildiği ifadesi yanlış. |
| BUG-CAT2-07 | D | publicSettings: apiKeyProfiles JSON alanı çıkarılıyor ama içindeki fixture-secret-449 glossary içinde aynen kalıyor. Gerçek secret kullanılmadı. Önkoşul secretın serbest metinde ayrıca bulunması; rutin yedekte tüm profile map sızıntısı değil. |
| BUG-CAT2-08 | K | Bilinen HOST_SCOPES için http://api.openai.com:8080 ve https://api.openai.com aynı provider:openai. Bilinmeyen custom hostta scheme/port korunuyor; bütün sağlayıcılara genelleme yanlış. Gerçek request güvenlik kapıları ayrıca sınanmalı. |
| BUG-CAT2-09 | D | providerKeyForScope({},toString) -> function. Bloklanan __proto__/constructor yanında kalan inherited adlar var. Prototype mutation veya kod çalıştırma gösterilmedi; tip/sözleşme hatası. |
| BUG-CAT2-10 | D | R448: gerçek1MiB stderr child timeout1000ms -> null; stderr.resume control -> READY. Varsayılan8sn timeout mevcut; sonsuz deadlock değil. |
| BUG-CAT2-11 | K | probeCommand timeout child.kill çağırıp close beklemeden null döner, tree kill yok. process-lifecycle diye işaretlenen konum hatalı. Torunlu gerçek probe süreci/yetim bırakma denenmedi; tüm probe komutları torun üretmez. |
| BUG-CAT2-12 | K | Gerçek terminateProcessTree + fake taskkill exit0: watchdog temizlendi, çocuk kapanmadı ve fallback0. Kod async close sahipliğini tamamen bırakmıyor; ancak watchdog erken kalkıyor. OS taskkill exit0 ama yaşayan child senaryosu gerçek Windowsda denenmedi. |
| BUG-CAT3-01 | D | R448: budget10/learned80 ->3*6=18 maliyetli paket. token_budget0 ve bölünemez grup sözleşmesi düzeltmede korunmalı. |
| BUG-CAT3-02 | R | Tek grup100 maliyetle budget10 üstünde gönderiliyor; pos1 olarak İLERLİYOR. Grup bölmeme açık docstring sözleşmesi. Üst katmanda reddetme/özetleme geliştirilebilir ama ilerleme garantisi yok iddiası yanlış. |
| BUG-CAT3-03 | D | fuzzy_semantically_compatible(The patients are ready.,The patents are ready.) -> True. Farklı anlam cache tekrar kullanımına açık. Model anlambilimi değil gerçek saf fonksiyon davranışı. |
| BUG-CAT3-04 | D | Gerçek SQLite, max_rows1 ve DELETE trigger RAISE(FAIL): store hata sonrası connection.in_transaction True. Rollback eksikliği doğrulandı; sonsuza kadar Windows kilidi demek doğru değil, close/rollback/sonraki commit sonlandırabilir. |
| BUG-CAT3-05 | D | Probe declared content-length999999 ile invalid_response dönerken body.cancel çağrılmadı. Gerçek HTTP bağlantı sızıntısı ölçülmedi; tüketilmeyen body yolu kanıtlandı. |
| BUG-CAT3-06 | D | Response.arrayBuffer AbortError fırlatınca invalid_response dönüyor; timeout olarak sınıflanmıyor. Bu sentetik body error, gerçek ağ saati ölçümü değil. |
| BUG-CAT3-07 | D | probe.isSafeProbeEndpoint(http://[::1]:8000/...) False. Hata translation-provider-probe.js içinde; translation-endpoints.js değil. Main/renderer diğer IPv6 yolları önceden düzeltildi. |
| BUG-CAT3-08 | R | Request bodyde token limit yok; nonempty not OK at all yanıtı ok:true. Bağlantı/protokol probe için semantik OK doğrulamak zorunlu olmayabilir; iyileştirme. İstemci64KiB body ve30sn timeout ile sınırlı, model tarafı token bütçesi eksik. |
| BUG-CAT3-09 | K | 1000 planner.record çağrısı chunk_history uzunluğunu1000 yapıyor; büyüme gerçek ama iş ömrüyle sınırlı. TM MAX_ROWS50000 ve sorgu LIMIT240 var; kayıt metin byte sınırı yok. Sınırsız kayıt sayısı anlatımı yanlış, metin boyutu/retention riski ayrı. |
| BUG-CAT4-01 | K | Sadece son chunk dedup ediliyor; a/en,b/tr,c/en,geç b/tr -> pendingCount1 yeniden yazılıyor. Ancak canlı Python tek kuyrukta sıralı segment üretiyor; gerçek out-of-order/duplicate yol kanıtı yok. Yardımcı toleransı eksik. |
| BUG-CAT4-02 | D | 44.1kHz tek input sample sonra explicit flush: weight1/sum.5 aynı kalıyor. Kırpma sonrası eski kesir yeni sese karışabilir. Konum worklet; live-asr-realtime.js değil. |
| BUG-CAT4-03 | K | VM worklet1blok46örnek, boş input ve2sn sonra ikinci blok ->92örnek aynı offset. Arada sync yok fixture; gerçek ana süreç clock sync farkı flush tetikleyebilir, donanım kesintisi sonucu ayrıca test edilmeli. |
| BUG-CAT4-04 | R | R448: MessagePort ack yok; fakat128000 Int16 tampon, renderer pending8 ve main chunks8 sınırları var. Bloke renderer port kuyruğu ayrı risk; heap/gerçek bellek sızıntısı ölçülmedi. |
| BUG-CAT4-05 | R | Weighted box resampling bir anti-alias filtredir fakat yüksek kalite low-pass değildir. Tamamen filtre yok iddiası teknik olarak yanlış; bant dışı sönüm/ASR kalitesi ölçülmeden bug denemez. |
| BUG-CAT4-06 | D | Gerçek worklet kodu VM: +.1 ve-.1 stereo ->peak0. Aritmetik ortalama ters fazı iptal eder. Gerçek kullanıcı ses kaydında bu durumun sıklığı/duyulurluğu ölçülmedi. |
| BUG-CAT4-07 | R | Peak.003 input silent mesajı verdi; davranış kasıtlı .004 eşik. Anlaşılır fısıltının kaybı doğrulanmadı. Modül worklet, realtime değil; kullanıcı eşiği/normalize seçeneği tasarım geliştirmesi. |
| BUG-CAT4-08 | D | RTF1.2,.9,1.2,.9,1.2 -> üç ardışık yavaş olmadığı hâlde uyarı. Sonraki.7 yetişti mesajı verir; backlog bilgisi yok. Hysteresis tasarımı mümkün ama ardışık3 açıklamasıyla uyuşmuyor; kuyruk boşaldı anlamı yanlış. |
| BUG-CAT5-01 | D | R448 gerçek x+acute araması TypeError. |
| BUG-CAT5-02 | K | Uzun sorguda fallback substring normalize iç içe tarama maliyeti ağır. Kendi bounded150/300 testimiz yaklaşık25/112ms; O(N^3) üst sınır uzun sorguyla gerekçeli ama gerçek UI DoS/aşırı uzun input test edilmedi. |
| BUG-CAT5-03 | D | fitTranslationParts(ก้, iki eşit cue) -> [ก,้]; tek grapheme parçalandı. Türkçe normal spaced yoluna genellenmemeli. |
| BUG-CAT5-04 | D | scan [0–10,1–2,3–4] yalnız index1 overlap raporluyor, uzun ilk cue ile çakışan index2yi kaçırıyor. |
| BUG-CAT5-05 | D | scan [{start:NaN,end:Infinity,text:x}] ->[] hiçbir sorun yok. Helper geçerli cue bekliyor olsa bile invalid input tanısı yok; NaN/Infinity normalleştirme güvenilir değil. |
| BUG-CAT5-06 | D | cueSignature tek cat ve dog aynı zaman/satır boyuyla eşit. Kurtarma imzası içerik hashlemiyor. Hata timeline-issue-scan.js; output-contract.js değil. Gerçek recovery yazımı denenmedi. |
| BUG-CAT5-07 | D | outputs invalid role + files translated.srt -> explicit:false/source complete legacy. Bozuk explicit metadata eski kaynak gibi kabul ediliyor. |
| BUG-CAT5-08 | D | Aynı sourceId ama farklı sourceHash aaa/bbb kaynak ve çeviri beraber seçiliyor. Farklı sourceId doluysa zaten filtre var; rapor genel ifade ediyor. |
| BUG-CAT5-09 | D | translationMeaningIssues(-5000000 people,5 milyon insan,tr) ->[] sayı işaret kaybı kaçıyor. Kod subtitle-sentence-layout.js, output-contract değil. |
| BUG-CAT5-10 | D | 5 cats and5 dogs ->5 kedi ve köpek vardı için qualityIssues[]; sayı çokluğu denetlenmiyor. Bazı dilsel birleştirmeler meşru olabilir, bu fixturede sayısal kapsam belirsizleşiyor. |

## Öncelik

Önce CAT2-04 ve05 ayar transaction kurtarma veri kaybı giderilmeli. CAT2-07 yedek redaction, CAT1-01 timer yarışı ve CAT5-01 arama exception'ı da açık önceliklidir. Sonraki grup CAT3-03 yanlış fuzzy tekrar kullanım, CAT3-04 DB rollback, CAT3-01 bütçe, CAT1-10 timeout ve probe IPv6/hata sınıflandırma. Bütün HIGH etiketlerine aynı anda büyük yama uygulamak uygun değil; hata başına önce karşı örnek sonra ilgili regresyonla ilerlenmeli.

Rapor447'de dağılım hatası vardır (448 ayrıntısı): matris kategori1=12HIGH, kategori2=9HIGH3MEDIUM, kategori3=4HIGH5MEDIUM; yönetici özetiyle uyuşmaz. “1 olumlu doğrulama” matrisin dışında duplicate-ID koruması hakkındadır,51 hata istatistiğine karıştırılmıştır.

## Çalıştırılan kanıtlar

ignored tmp/audit449/check.js: gerçek settings/provider/probe/layout/timeline/output modülleri. İşlem testleri uygulamaya ait olmayan kendi temp dizininde gerçek dosyalar ve injected fs.rename/unlink EIO kullanır. Rollback ve marker kaybı testleri gerçek kişisel ayar dosyalarına dokunmaz. Çıktı results-js.json.

check-more.js: VM içinde gerçek worklet, fake AudioWorkletProcessor, kontrollü saat/PCM; gerçek ASR switch/monitor ve BrowserDubAudio senkron throw. Çıktı results-more.json.

check-process.js: gerçek terminateProcessTree üstünde fake taskkill ve timer; prepareVoiceReference VM timeout/terminate false; local-file-access Win32 path ve FS fixture (gerçek UNC ağına erişilmedi). results-process.json.

check-migration.js: gerçek prepareVoiceStorage, sentetik legacy dosya silme/migrate tekrar. check-play.js: aynı oturum stale sample/late resolve audio double.

Python terminal: gerçek TranslationMemory.fuzzy_semantically_compatible; gerçek temporary SQLite DB ve prune error trigger, transaction state; gerçek AdaptivePlanner oversized group ve1000record history. Büyük model/sağlayıcı yok.

Kendi tests/dub-service.test.js fixture'ının ignored tmp/check-service449.js kopyası reviewed plan işini hata ile kapatıp aynı ID tekrarlar; EEXIST doğrulandı, eski dub-text byte'ları değişmedi. İlk kopya import yolu yanlış olduğundan MODULE_NOT_FOUND verdi; import kopyanın konumuna göre düzeltildikten sonra aynı davranış deneyi geçti. Ürün/test kaynağı değiştirilmedi.

Arama performans testi ayrı Node process'te150 ve300karakterle sınırlı çalıştırıldı; renderer penceresi açılmadı. Önceki448 arama crash, attach timer, planner cap ve gerçek child stderr bounded1sn deneyleri yeniden kullanılabilir. Hiçbir rapor snippet'i körlemesine çalıştırılmadı.

Bu tur tam test paketi/Electron gerçek UI/start.bat/YouTube/CUDA/model/gerçek Windows kilidi/DRM/loopback/heap profiler yok. Canlı üretim/API kalitesi veya bütün51 üretim etkisi doğrulanmış denmiyor. Yeni bağımlılık/IPC/şema/kurulum yok. Belgeler indeks/diff kontrolüyle teslim edilir. Kanıt kodları ignored tmp altında; ürün deposuna kişisel dosya/ham profil/log eklenmedi.

Push yapılmaz: önceki448 teslimindeki yerel inceleme durumu korunur. Önceden bilinen uzak HEAD c26e5e0e6018d21f4d0554ddc02350f09abba82d; bu tur uzak dal yeniden okunmadı. Yerel belge commit'i son yanıtta bildirilir.
