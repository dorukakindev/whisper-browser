# R831 — Okuma listesi, abonelikler ve metinden ses geçmişi denetimi

1 Kasım 2026. İncelenen HEAD **`34b5747b5181db819443cf708185b5eebce754f9`**, başlangıç `master`; rapor dalı `codex/functional-audit831`. Son ürün commit'i `ba04414f9289e6e61a51070bcf15e8e693e64b6c`. **Yalnız denetim ve rapor: hiçbir ürün kodu, mevcut test, ayar veya bağımlılık değiştirilmedi; hiçbir düzeltme uygulanmadı.**

Üç **GPT-6.1 Sol / medium** ajan, son turdaki asistan/dublaj/film alanları yerine okuma listesinin dosya yaşam döngüsünü, abonelik paneli ve aktarımını, metinden ses geçmişinin sahiplik/geri açma zincirini inceledi. Bunlar daha önce hiç kod okunmamış modüller diye sunulmuyor: yeni inceleme noktaları eski ailelerin kanıtlanmamış üretici–tüketici birleşimleridir. Ana ajan dört final probu ayrı sentetik dizinlerde tekrar çalıştırdı; ilk kayıt için gerçek Windows Electron `savePage` de kullanıldı.

| Tür | ID | Öncelik | Sonuç |
|---|---|---|---|
| Yeni bug | F831-01 | P2 | Okuma listesi klasörü henüz yokken ilk MHTML kaydı başarısız; klasör oluşumu kayıt sonrasına bırakılmış. |
| Yeni bug | F831-02 | P2 | Son grup üyesini silme/son grubu temizleme, kalan abonelikleri çıkışı olmayan eski filtrede gizliyor. |
| Yeni bug | F831-03 | P3 | Kanal adındaki başka UCID, CSV geri aktarımında doğru URL kimliğinin önüne geçiyor. |
| Yeni bug | F831-04 | P3 | İndeks yayımı başarısız olunca silme başarısız görünüyor ama MHTML silinmiş, eski satır kalmış oluyor. |
| Ayrı öneri | G831-01–06 | Bug değil | Altı geliştirme/ekleme önerisi; mevcut özellik uzantıları açıkça ayrılıyor. |

**4 yeni doğrulanmış kök, 6 ayrı öneri.** Silme ve grup temizleme varyantları ayrı bug sayılmadı. Metinden ses geçmişinde **0 yeni doğrulanmış bug**. R830'un 2 yeni bugı ve R815-B98 regresyonu bu toplama katılmadı; bu tur yeniden düzeltilmiş veya yeniden sınanmış sayılmıyor.

## F831-01 — İlk çevrimdışı kayıt, hedef klasör oluşturulmadığı için başarısız

**Önkoşul/tekrar:** İzole yeni uygulama profilinde `OkumaListesi` klasörü henüz bulunmasın. Geçerli bir HTTP(S) sekmesini okuma listesine ekle. Geçersiz dosya adı, bozuk indeks veya kişisel profil müdahalesi gerekmiyor.

**Beklenen:** Uygulama yönettiği klasörü kayıt öncesinde hazırlar; ilk kaydı sonraki kayıtlar gibi oluşturur.

**Görülen:** Gerçek `browser:readingList:add` → `saveBrowserPageToReadingList` → gerçek `webContents.savePage(..., 'MHTML')` zinciri **`Sayfa arşivlenemedi: Failed to save the page.`**, `ok:false` döndürüyor. Klasör yok ve liste **0** kayıt. Aynı store üzerinde yalnız `ensure()` çağrılıp aynı handler tekrar kullanıldığında **ok:true**, **951 bayt MHTML**, **1 kayıt**, gerçek dosyada sentetik belgenin `Control` içeriği doğrulandı. Dosya boyutu bu fixture'a aittir; sabit ürün eşiği değildir.

**Kök:** [main.js:3607](../../src/main.js#L3607) factory yalnız store oluşturur. [prepare:96](../../src/browser-reading-list.js#L96) klasörü yaratmaz. [main.js:17672](../../src/main.js#L17672) `savePage` çağrısı, [commit:116](../../src/browser-reading-list.js#L116) ve sonrasında [_writeIndex:58](../../src/browser-reading-list.js#L58) içindeki `ensure()` öncesindedir. Başarısız ilk kayıt commit'e ulaşamadığı için kendini de düzeltemez. Aynı denemeyi tekrar etmek klasörü oluşturmaz.

**Kanıt:** [native-probe.cjs](evidence831/offline/native-probe.cjs), [native-result.json](evidence831/offline/native-result.json); ek taşıma sınırı [probe.cjs](evidence831/offline/probe.cjs), [result.json](evidence831/offline/result.json). Ana ajan Windows Electron **43.5.0** ile final native probu çalıştırdı, exit0. Gizli ayrı pencere, ayrı profil ve sentetik `data:` belgesi kullanıldı; gerçek main handler/save wrapper/store ve native Chromium MHTML yazımı yürütüldü. HTTP(S) tab metadata'sı, aktif sekme çözümleme ve sender yetkisi kontrollüdür. Bu, canlı site gezinmesi veya `start.bat` normal açılış kabulü değildir. İlk fs-adaptörlü şüphe tek başına kesin bug sayılmadı; native kontrol sonrası sayıldı.

**Dedup/etki:** R815-B09 bozuk indeks, B18 dışa aktarım kayıt diyaloğu sırasında kaynak değişimi, B19 mevcut kopyanın yarım ezilmesi, B20 kilitli MHTML silme ve B21 bekleyen save'in silinen kaydı diriltmesi farklı köklerdir. R815-B19'un UUID hedef koruması halen kullanılır; kaldırılması önerilmiyor. Bu hata yeni profilin ilk çevrimdışı kopyayı oluşturmasını engeller; bütün mevcut arşivlerin bozulduğu iddia edilmez. İleride klasör kayıt öncesi hazırlanmalı; ilk kayıt, mevcut kayıt yenileme, indeks bozukluğu ve kaynak/revision korumaları birlikte korunmalıdır. Uygulanmadı.

## F831-02 — Son grup kaldırılınca kalan aboneliklere filtre içinden dönülemiyor

**Tekrar:** Bir **Science** gruplu ve bir grupsuz kanal ekle. Abonelik panelinde Science filtresine tıkla; tek grubun tek üyesinin aboneliğini kaldır. Aynı kökün ikinci yolu, o üyedeki Grup diyaloğuyla grup adını boşaltmaktır.

**Beklenen:** Seçili grup artık yoksa görünüm geçerli bir filtreye dönmeli veya Tümü kontrolü erişilebilir kalmalıdır; grupsuz kayıtlar görünmelidir.

**Görülen:** Silme sonrası localStorage'da **1 grupsuz kanal** var; panelde **0 satır ve 0 grup düğmesi**, `Bu grupta kanal yok.` metni var. `grid.dataset.stSubGroup` hâlâ **Science**. Tümü düğmesi de kaldırıldığı için filtreden çıkış yok. Son grubun adını boşaltma ise **2 kayıt / 0 görünen satır / 0 düğme** bırakır; aynı kök olduğu için ayrıca sayılmaz.

**Kök:** [renderer.js:31158](../../src/renderer/renderer.js#L31158) eski dataset seçimini güncel grup kümesine karşı doğrulamaz; [31159](../../src/renderer/renderer.js#L31159) grup sayısı sıfırsa Tümü dahil bütün chip'leri kaldırır; [31179](../../src/renderer/renderer.js#L31179) eski gruba göre kalanları süzer. [31218](../../src/renderer/renderer.js#L31218) silme ve [31210](../../src/renderer/renderer.js#L31210) grup düzenleme bu durumu gerçek kullanıcı eylemiyle üretir.

**Kanıt/kontroller:** [probe.cjs](evidence831/subscriptions/probe.cjs), [result.json](evidence831/subscriptions/result.json). Gerçek JSON exporter → gerçek main import handler'ın disk okuması → gerçek renderer callback'i → grup/silme tıklamaları. Aynı silme Tümü seçiliyken **1 satır** bırakır. JSON dışa aktarımı gizli kalan **1** kaydı korur; veri silinmesi değildir. Gerçek `setSmartTubeVisible(false/true)` ve `renderSmartTubeSection('subscriptions', {force:true})` aynı grid ile **0 satır** bırakır. Yeni grid kontrolünde aynı kayıt **1 satır** görünür. Native uygulama yeniden başlatma denenmedi; kaynakta grid'in statik olduğu ayrıca görüldü. Bölümler arası canlı RSS zinciri çalıştırılmadı.

**Dedup/kabul:** R815-B110 kapasite kaybı, B112 handle case tekilleştirmesi, B113 Yenile/TTL, B114 RSS hata görünürlüğü ve R481-06 sanal kütüphane kaydırması farklıdır. Bu prob RSS kullanmaz. İleride artık olmayan grup seçiminden çıkılmalı; son üyeyi silme ve grubu temizleme kalan kayıtlara erişimi korumalıdır. Native DOM/fare/görsel kabulü iddia edilmiyor; JSDOM gerçek script mantığını yürütür. Düzeltme yok.

## F831-03 — CSV kanal adı, gerçek kanal URL'sinin kimliğini değiştirebiliyor

**Önkoşul:** A kanalının görünen adı, B kanalının geçerli UCID biçimli kimliğini içerir: örneğin `Guide to UC0000000000000000000002`. A kimliği `UC0000000000000000000001`, B kimliği `UC0000000000000000000002` olsun. Bunlar üretim normalizer'ının kabul ettiği sentetik biçimlerdir; gerçek hesapların varlığı veya canlı YouTube adı sınanmadı. Bu dar önkoşul nedeniyle **P3**.

**Tekrar:** İki kanalı gerçek JSON import zinciriyle ekle. Gerçek UI'dan CSV dışa aktar; dosyayı yeni boş panelde içe aktar.

**Beklenen:** Kendi exporter'ının yazdığı A URL'si A kimliğini, B URL'si B kimliğini korumalı; adın içeriği kimliği değiştirmemelidir.

**Görülen:** Export A satırında doğru A URL'sini içeriyor. Importer ad hücresindeki B UCID'sini seçiyor; B ile tekilleştirince **2 kanal → 1 kanal**, A kimliği yok ve kalan ad boş. Bildirim **`1 kanal içe aktarıldı (csv).`**. Eski kaynak panel korunur; hata yeni içe aktarılan koleksiyondadır, kaynak dosyanın veya canlı hesabın silinmesi değildir.

**Kök:** [subscriptions-io.js:169](../../src/subscriptions-io.js#L169) exporter ad/URL sütunlarını yazar. [137](../../src/subscriptions-io.js#L137) sonrası importer satırdaki ilk UCID içeren hücreyi bulur; [140](../../src/subscriptions-io.js#L140) ad hücresindeki eşleşmeyi URL'deki kimliğin önüne geçirir. [145](../../src/subscriptions-io.js#L145) sonuç yanlış kimlikle tekilleşir. Genel CSV quote ayrıştırması farklı, çalışan bir adımdır.

**Kanıt/kontroller:** Aynı [abonelik probu](evidence831/subscriptions/probe.cjs) gerçek exporter, main export/import disk işlemleri ve iki ayrı renderer koleksiyonunu kullanır. Normal isimli CSV **2→2**, aynı UCID içeren isimli JSON **2→2**, virgül/çift tırnak/satır sonu içeren isimli CSV **2→2 ve tam ad korunur**. Native picker ve atomik yazma adaptörü kontrollüdür; fsync garantisi test edilmedi.

**Dedup/kabul:** R481-01'in virgül/tırnak/satır sonu tokenizasyon sorunu tekrarlanmıyor; onun karşı kontrolü geçti. R815-B110 kapasite sınırıyla ilgisiz, yalnız iki kayıt var; B112 harf büyüklüğü mekanizması da değil. İleride alanların semantik önceliği A/B kimliklerini ve adı korumalı, farklı kanallar yanlış tekilleşmemelidir. Uygulanmadı.

## F831-04 — İndeks yayın hatası, tamamlanan dosya silmesini başarısız ve eski satırlı bırakıyor

**Önkoşul/tekrar:** Gerçek prepare/commit ile tek sentetik MHTML kaydı oluştur. Kullanıcı silme isterken yalnız `index.json.tmp → index.json` rename işlemine Windows tipi **EPERM** enjekte et; MHTML unlink ve diğer disk işlemleri normal olsun.

**Görülen:** Dosya silinir; indeksin **10** rename denemesi başarısız olur ve gerçek remove handler reject eder. Eski indeks byte aynı, listede **1 satır**, MHTML yok; gerçek open handler **`Kayıt veya arşiv dosyası bulunamadı.`** döndürür. [Renderer:13854](../../src/renderer/renderer.js#L13854) reject'i null'a çevirip silme başarısız sinyali verir; listeyi yenilemez. **Kullanıcı silmeyi istemiştir:** izinsiz silme veya beklenmedik özel veri kaybı iddiası yoktur. Sorun, kısmi tamamlanmanın yanlış sonuç ve açılamayan satırla bırakılmasıdır; bu nedenle **P3**.

**Kök:** [browser-reading-list.js:146](../../src/browser-reading-list.js#L146) önce MHTML'yi unlink eder; [148](../../src/browser-reading-list.js#L148) sonra indeksi yayımlar. İkinci adımın hatasında ilk adımı veya kısmi sonucu yöneten sözleşme yoktur. [main remove:17700](../../src/main.js#L17700) istisnayı doğrudan taşır.

**Kanıt/kontroller:** [offline/probe.cjs](evidence831/offline/probe.cjs), [result.json](evidence831/offline/result.json), `REMOVE_INDEX_FAILURE`. Gerçek store/main kaynakları ve fs unlink/write/fsync çalışır; yalnız son rename hatası enjekte edilir. Gerçek AV veya Windows dosya kilidi kurulmadı. Normal remove **ok:true / 0 satır / dosya yok**. Eski R815-B20 sınırında MHTML unlink EPERM olursa **ok:false / indeks ve dosya korunur**. İndeks hatası sonrası temp temizliği de doğru. Kilit koşulu kaldırılıp **aynı remove tekrarlandığında ok:true / 0 satır** olur; bu mevcut kaçış yolu ayrıca doğrulandı.

**Dedup/kabul:** R102 temp artığı ve R815-B20 arşiv unlink hatası aynı kök değil; B20'nin mevcut onarımı karşı kontrolde çalışır. Burada başarılı ilk silme ile başarısız indeks commit birleşimi yenidir. İleride işlem ya tutarlı tamamlanmalı ya da kısmi sonuç açıkça bildirilmeli; indeks hatasında erişilebilir kopyayı koruma politikası ayrıca değerlendirilebilir. Normal silme ve unlink hatası korumaları sürmelidir. Hiçbir politika uygulanmadı.

## Buglardan ayrı geliştirme ve ekleme önerileri

Mevcut özellikler yeniden keşif sayılmaz. Aşağıdakiler öneridir; bug sayısına katılmadı, kodlanmadı.

| ID | Öneri | Dayanak, fayda ve kabul ölçütü |
|---|---|---|
| G831-01 | **Okuma listesinden orijinal kaynağı ayrı sekmede aç.** | Mevcut open/refresh/remove ve kayıtlı canonical URL korunur. Offline kopyayı açmış kullanıcı, refresh'in canlı kaynak önkoşuluna tek açık eylemle ulaşır. A kaydı A'nın kayıtlı URL'sini açmalı; aktif B sekmesini kullanmamalı, offline dosya değiştirilmemeli. Genel gezinmenin listeye uzantısıdır; R815-B18/B19 düzeltmesi değildir. |
| G831-02 | **200 kayıt sınırında düşecek kaydı işlemden önce göster.** | Otomatik limit/temizlik zaten var: [INDEX_LIMIT](../../src/browser-reading-list.js#L13), R548→R549/N49 geçmişi. Yeni cleanup sistemi önerilmiyor. 201'inci kayıttan önce toplam ve düşecek kayıt gösterilmeli; sonrasında korunan kayıtlar ve cleanupWarnings ayrı doğru raporlanmalı. Mevcut boyut/cleanup görünürlüğünün önizleme uzantısıdır. |
| G831-03 | **Yerel aboneliklerde ad/handle/UCID araması ve sonuç sayısı.** | Uzak SmartTube araması mevcut yerel listeyi aramaz. Seçili grup içinde anlık arama ve görünen/grup/tüm liste sayıları, büyük listede kanal bulmayı kolaylaştırır. Temizleme aynı geçerli gruba dönmeli; F831-02'nin düzeltmesi ayrı kalmalıdır. R815-G34 RSS yenileme bütçesi tekrar önerilmiyor. |
| G831-04 | **Abonelik importundan önce ekleme ve metadata çakışma özeti.** | [renderer:31130](../../src/renderer/renderer.js#L31130) mevcut append-only politikası aynı kimliği atlar; bu bug sayılmadı. Yeni/zaten mevcut/geçersiz/sınır dışı sayıları ve aynı ID'deki ad/grup farkı gösterilebilir. Varsayılan mevcut metadata'yı korumalı; değişiklik açık kullanıcı seçimi gerektirmeli. Yeni yedek sistemi veya R815-G34 yenilemesi değildir. |
| G831-05 | **Tamamlanmış ses sonucunun üretim tarifini incele ve açık eylemle yeni taslağa kopyala.** | R724'ün mevcut audio-only açması metin/döküm ve adım ayarını doğru biçimde korur. [Kaydedilmiş request/source](../../src/text-voice-studio.js#L91) üzerinden eski metin/döküm/ayarlar karşılaştırmalı gösterilebilir; [history DTO](../../src/text-voice-history.js#L21) bugün bunları vermez. İnceleme mevcut taslağı değiştirmemeli, açık kopyalama yeni iş kimliğiyle taslak oluşturmalı, otomatik üretim olmamalı. Dış referans WAV kopyası tutulduğu varsayılmamalı; kayıp/değişmiş referans yeniden seçilmeli. Path/sahiplik kontrolleri korunmalı. Yarım iş/GPU kurtarma veya yeni backup önerisi değildir. |
| G831-06 | **Ses geçmişinde gerçek ses süresi ve formatını üretim süresinden ayrı göster.** | [Bugünkü etiket](../../src/renderer/text-voice-studio.js#L64) doğru biçimde Production time der; yanlış etiket bugı yok. [inspectVoiceOutput](../../src/voice-output.js#L6) zaten seconds/channels/sampleRate çıkarır. Örneğin 8 sn ses/2 sn üretim iki ayrı alan olmalı; bozuk dosya hazır görünmemeli, dışarıda değişen WAV bir sonraki okumada yeniden doğrulanmalı. Liste seçimi sesi kendiliğinden başlatmamalı. R724 açma ve R551 M4B export süresinden farklı olarak text-voice history'nin dosya özeti uzantısıdır. |

## Bug çıkmayan alan ve elenen iddialar

Metinden ses: gerçek `registerDubService → registerTextVoiceStudio → request/source/job dosyaları → sentetik geçerli WAV → history.record/list → yeni history servisi → tam renderer scripti → history-open click` zinciri geçti. [Prob](evidence831/textvoice/probe.cjs) ve [sonuç](evidence831/textvoice/result.json): iki sentetik üretim, başka history işlemlerinde **0 yeni spawn**, son kayıt sırası/yeniden açma/yanlış ID reddi/metin-döküm-adım ayarı koruma/yalnız seçimle sesi değiştirmeme/kayıp farklı sonuçta eski sesi koruma/kayıp gösterilen sonucu temizleme/dosya geri gelince açma kontrolleri geçti. R724/R738/R740'ın mevcut doğru davranışı yeni özellik veya yeni bug sayılmadı. GPU/TTS işlemi gerçekleşmedi; worker ve media DOM metotları kontrollüdür.

F831-01 ilk fs-adaptörü kanıtı yetersiz görülerek native ile daraltıldı. F831-04'ün kullanıcı talebiyle silinen dosyası izinsiz veri kaybı diye sunulmadı. Abonelikte ilk30 RSS bütçesi/partial hata başlıkları eski R815-G34 olduğundan yeni bug sayılmadı. CSV quote, kilitli MHTML unlink ve text-voice history korumaları geçen karşı kontrollerdir; kusur üretmek için beklenti değiştirilmedi.

## Kapsam, yeniden çalıştırma ve sınırlar

AGENTS/YENI-BILGISAYAR/DEVIR1228, Night1000 README ve ilgili imzalar, R815 mapping/remediation, R818–R823 onarımı `733afa90` ve ilgili eski raporlar karşılaştırıldı. [Offline 60](evidence831/offline/registry-reviewed.json), [abonelik 80](evidence831/subscriptions/registry-reviewed.json), [textvoice 80](evidence831/textvoice/registry-reviewed.json) referansı **220 alan referansı / 140 benzersiz tarihsel satırdır**; yeni test veya güncel PASS toplamı değildir. Tarihsel 1000 satır, 1000 E2E veya bug diye sunulmadı. Dublaj telaffuz/komşu dinleme, asistan, film ve müzik analizi kapsamı açılmadı.

Repo kökünden her final prob ayrı yeni `.uiprev/audit831-*` dizinine yazar; özel fresh `AUDIT831_OUT` da verilebilir. Native komut ayrı Electron test profilidir, normal uygulama açılışı değildir:

```powershell
node docs/raporlar/evidence831/offline/probe.cjs
node docs/raporlar/evidence831/subscriptions/probe.cjs
node docs/raporlar/evidence831/textvoice/probe.cjs
& .\node_modules\.bin\electron.cmd docs/raporlar/evidence831/offline/native-probe.cjs
node --test --test-isolation=none tests/browser-reading-list.test.js tests/subscriptions-io.test.js tests/text-voice-studio.test.js
```

Ana ajan final yayın yollarından üç Node probu ve bir native Electron probunu **4/4 exit0**, dört CJS syntax kontrolünü **4/4 exit0** gördü. Hatalı davranış assertion'larının geçmesi onarım anlamına gelmez. Mevcut üç test dosyası birlikte **4 test / 4 PASS / 0 FAIL** bildirdi; bu bütün yeni sınırların mevcut testlerle kapsandığı anlamına gelmez. [Ana doğrulama kaydı](evidence831/parent-verification.json) ve [canonical LF SHA256 manifesti](evidence831/manifest.json) sonuçları revizyona bağlar.

Windows gerçek dosya işlemleri, Türkçe sentetik metinler ve ayrı Electron MHTML yazımı çalıştırıldı. Native süreçte **Update check error** uyarısı görüldü; kayıt assertion'ları ve sonuç JSON'u tamamlandı, exit0. Uyarı bu tur yeni ürün bugı diye sayılmadı. Sandbox içi ilk native deneme IPC bootstrap erişim engelinde kaldı; izinli ayrı süreçte final kontrol çalıştı. Kullanıcının uygulaması kapatılmadı veya profili değiştirilmedi.

`start.bat`/`install.bat` değişmedi; normal açılış, temiz kurulum, native dosya diyaloğu, gerçek HTTP(S) site, kullanıcı hesabı, DPI/görsel kabul, gerçek ses decode/duyulan ses, GPU/CUDA/TTS/ASR/doğallık, ücretli API/LLM/DRM ve uzun soak doğrulanmadı. Yeni bağımlılık veya dış repo kodu alınmadı. Tam npm/CI koşulmadı ve CI kapatılmadı; görülmeyen sonuç başarılı sayılmadı. R830'daki bilinen B98 FAIL bu tur tekrar koşulmadı, giderildiği iddia edilmiyor. Ham profiller/WAV/MHTML/loglar ve kişisel veriler yayımlanmadı; yalnız seçilmiş sentetik kanıt kodu/JSON tutuldu.

Teslim yalnız bu rapor, seçilmiş kanıtlar, yeni [devir notu](../devir/2026-11-01-1235.md) ve DEVIR indeksidir. Önceden kirli dosyalar ve ilgisiz untracked kayıtlar dışarıda kalır. **Bug düzeltmeleri ve önerilerin uygulanması yapılmadı.**
