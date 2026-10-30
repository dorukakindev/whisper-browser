# Rapor 815 — Genişletilmiş salt raporlama denetimi

> **31 Ekim genişletmesi: 54 doğrulanmış güncel hata (16 P1, 38 P2).** Önceki 3 + bu tur eklenen 50 + geçmişte bilinen 1 yeniden doğrulama. Öneriler ve kanıt boşlukları bug sayısına katılmadı. **Hiçbir hata düzeltilmedi.** [54 bulgunun dizini](#genişletilmiş-bulgu-dizini) · [tam kanıt ve ID eşlemesi](evidence815/deep/findings.json) · [yeniden üretme](evidence815/deep/REPRODUCE.md).

İlk tarama: **30 Ekim 2026**, Windows. İncelenen ürün: **`00a01f92f109f11183b02bc55dd1dfed25ed3e9f`**, başlangıç dalı `master`; rapor dalı `codex/audit-report815`.

Kullanıcının talebi yalnız inceleme ve ayrıntılı rapordur. **Ürün kodu, ayarlar, bağımlılıklar ve mevcut testler değiştirilmedi; aşağıdaki hatalar düzeltilmedi.** Eklenen yürütülebilir kaynaklar yalnız raporun kontrollü yeniden üretme ve denetim problarıdır.

## İlk dar tarama — B01–B03 (30 Ekim)

Bu bölüm ilk turun tarihsel kapsamıdır. Genişletilmiş toplam aşağıda 54 bulgudur. **İlk turda 3 doğrulanmış hata:** bir yüksek öncelikli çeviri bütünlüğü sorunu ve iki orta öncelikli okuma/hazırlık sorunu. Bunlardan ayrı **5 geliştirme alanı** aşağıda gerekçeleri ve kabul ölçütleriyle bulunur. Çökme, dosya silinmesi veya güvenlik açığı keşfedildiği iddia edilmez.

| Kimlik | Öncelik | Hata | Doğrulama |
|---|---|---|---|
| R815-B02 | P1 / yüksek | Devam eden kitap çevirisinde hedef dil değiştirilince tek işlem farklı dillere bölünüyor; son durum yalnız son dili içerirken bütün iş hazır deniyor. | 6 sayfa; ilk paket TR, ikinci paket DE; `completed=6`, son state yalnız 4–6. |
| R815-B03 | P2 / orta | Seslendirme projesi oluşturulurken sayfa/metin seçimi değişse de eski seçim üretimde açılıyor. | Ekranda sayfa 2/çeviri; açılan proje sayfa 1/orijinal. GPU üretimi başlamaz. |
| R815-B01 | P2 / orta | Kayıtlı PDF yazı boyutu okuyucu açılırken kaldırılıyor; seçim kutusu eski değeri göstermeyi sürdürüyor. | Kayıt 28 px, açılıştan önce token 28 px, sonra token yok; CSS varsayılanı 21 px, kutu hâlâ 28. |

Kanıtlar: [çalıştırılabilir prob](evidence815/probe.cjs), [ham olmayan kontrollü sonuçlar](evidence815/observations.json). Sonuçlar sentetik metin/IPC sınırları kullanır; kişisel PDF, hesap, profil veya API anahtarı içermez.

<a id="r815-b02"></a>

## R815-B02 — Kitap çevirisinin hedef dili işlem boyunca sabit değil

**Kod:** `src/renderer/renderer.js:25097–25109`, `25119–25236`; özellikle `25187`, `25192`. Main tarafında `src/main.js:18039–18054` her isteğin hedef diline göre ayrı çeviri kimliği/durumu seçer. Bu yüzden probdaki dil başına state ayrımı mevcut üretim sözleşmesini temsil eder.

**Yeniden üretme:**

1. En az altı sayfalı PDF aç; hedef dili Türkçe seç ve tüm kitabı çevirmeyi başlat.
2. İlk üç sayfalık paket sürerken hedef dili Almanca yap. Hedef seçim alanı işlem sırasında devre dışı bırakılmıyor.
3. İşin kalan pakete geçmesini bekle.

**Beklenen:** Başlatılan iş tek bir hedef dil/model yapılandırması kullanmalı; kullanıcı yeni bir dil seçerse bu sonraki işe uygulanmalı veya açık iptal/yeniden başlatma akışı bulunmalı. Başarı sayacı aynı yapılandırmada tamamlanan sayfaları temsil etmeli.

**Gözlenen:** `translateVisiblePdfPagesNow` her paket için hedefi yeniden DOM'dan okuyor. Probun istekleri `tr:[1,2,3]`, sonra `de:[4,5,6]`. `renderPdfTranslation` her iki paketi de ekrana veriyor; `reader.state` son paketin Almanca durumuyla değiştiriliyor. Son state yalnız `4,5,6` sayfalarını içerirken sayaç **6 tamamlandı**, durum **Çeviri hazır** oluyor.

**Etki:** Kullanıcı tek dilde altı sayfalık çeviri beklerken iki ayrı eksik dil kümesi oluşur. Görünen eski sayfalar ve son state farklı şeyleri temsil edebilir; export seçilen dilin ayrı durumunu okuduğundan kullanıcı bütün kitap yerine o dile ait altkümeyi alabilir. Bu export sonucu ayrıca canlı dosya üretimiyle denenmedi; çıkarım main'deki dil başına state okumasına dayanır. Önceki dil dosyası silinmiş sayılmaz. Ücretli sağlayıcı kullanılıyorsa yanlış hedefe yapılan çağrılar da maliyet yaratır; prob ücretli çağrı yapmadı.

**Kök neden:** İş başında dondurulan hedef yapılandırması yok; yalnız iki başlatma düğmesi kilitleniyor. Genel `completed` sayacı farklı hedef kimliklerini birleştiriyor. Model/endpoint de main tarafından her pakette güncel ayarlardan okunuyor; onların iş ortası değişimi bu tur ayrıca denenmedi.

**Önerilen kabul ölçütü:** Altı sayfalık iş sırasında dil değiştirilse bile o işin bütün istekleri başlangıç dilinde olmalı veya iş açıkça durmalı. Ekran/state/export aynı hedef kimliğine bağlı kalmalı; ikinci dile geçiş önceki dilin sayfalarını hazır saymamalı.

<a id="r815-b03"></a>

## R815-B03 — Hazırlığın ikinci asenkron aşamasında eski sayfa seçimi korunuyor

**Kod:** `src/renderer/pdf-reader-experience.js:401`, `403–503`; özellikle `466`, `477–491`.

**Yeniden üretme:**

1. Seslendirme aralığını sayfa 1–1, metni Orijinal seç; hazırlamayı başlat.
2. Metin çıkarma tamamlandıktan sonra `book-from-reader` yanıtı henüz dönmemişken alanları sayfa 2–2 ve Çeviri olarak değiştir.
3. İlk projenin oluşturulma yanıtının dönmesini bekle.

**Beklenen:** Ekrandaki yeni seçim ile tamamlanan eski iş ayrılmalı; eski iş güncel seçimmiş gibi üretimde açılmamalı. Mevcut proje oluşturulduysa korunabilir ama kullanıcıya eski kapsam olduğu açıkça bildirilmeli.

**Gözlenen:** Alanlar düzenlenebilir. Probda `book-from-reader` sayfa 1'in orijinal metnini aldı. Kullanıcı 2–2/çeviri seçtikten sonra eski yanıt dönünce `voice` eski projeye ayarlandı, **Dinle** etkinleştirildi ve `openProject('old-page-one')` çağrıldı. Durum, ses ayarlarını kontrol edip üretime devam etmeyi söylüyor; kapsam değişti uyarısı yok.

**Etki:** Yanlış sayfa veya yanlış metin türüyle devam etme riski. Hazırlık kendi başına ses üretmediği için otomatik GPU/API tüketimi veya ses dosyası kaybı kanıtlanmadı. Kullanıcı sonraki üretim adımında hatalı kapsamla ilerleyebilir.

**Kök neden:** Range/mode karşılaştırması metin çıkarmadan sonra ve importtan **önce** var. `book-from-reader` beklenirken input olayları `prepareToken` değerini değiştirmiyor; yanıt sonrası kontrol yalnız belge/token/stale koşullarına bakıyor, seçimi tekrar karşılaştırmıyor.

**Önceki kayıtla ilişki:** [R806 P35](BROWSER_BUG_REPORT_806.md) **extraction pending** sırasında aralık değişimini koruyor. Bu rapor o onarımı geri alınmış saymıyor: açık kalan pencere, extraction sonrasındaki **proje oluşturma IPC'si**. Aynı bulgunun önceki testini yeni başarı diye saymadık.

**Önerilen kabul ölçütü:** Proje importu beklerken from/to/mode değişirse eski proje otomatik açılmamalı ve `voice` güncel seçim için hazır olmamalı. Aynı belge ve aynı sayfa aralığında yalnız metin türü değişimi de ayrı sınanmalı.

<a id="r815-b01"></a>

## R815-B01 — Kayıtlı okuma boyutu ile gerçek stil ayrışıyor

**Kod:** `src/renderer/pdf-reader-experience.js:250`, `322–331`; `src/renderer/pdf-reader.css:96`.

**Yeniden üretme:** Okuma ayarlarından 28 px seç; PDF'yi kapatıp yeniden aç veya kayıtlı 28 px tercihi olan profille okuyucu aç.

**Beklenen:** Kaydedilen 28 px stil ve seçim kutusunda aynı kalmalı.

**Gözlenen:** Modül başlangıcı localStorage'daki tercihi uyguluyor, fakat `opened()` `--pdf-reader-font` özelliğini kaldırıyor. CSS'deki `var(--pdf-reader-font, 21px)` varsayılana dönüyor; `pdfReadingfont` hâlâ `28` gösteriyor. Prob tam modülü JSDOM'da çalıştırarak token/selector ayrışmasını doğruladı; gerçek piksel boyutu Windows ekran görüntüsüyle bu tur ayrıca ölçülmedi. 21 px sonucu mevcut CSS'nin varsayılanıdır.

**Etki:** Büyük yazı isteyen kullanıcı her belge açılışında tercihini yeniden uygulatmak zorunda kalabilir. Seçim kutusu doğruymuş gibi göründüğü için sorunun kaynağı anlaşılmıyor. Veri silinmez; localStorage kaydı korunur. Yalnız font tokenı kaldırılır; genişlik/satır aralığının da sıfırlandığı iddia edilmez.

**Önceki kayıtla ilişki:** [R678](BROWSER_BUG_REPORT_678.md) kalıcı okuma tercihlerini; [R786](BROWSER_BUG_REPORT_786.md) kullanıcı boyutunun korunmasını tarif eder. Bu tur özellik varlığı değil, sonraki `opened()` yaşam döngüsü sınandı.

**Önerilen kabul ölçütü:** 18/24/28 px seçimi ilk belge, ikinci belge ve uygulamayı yeniden açmada korunmalı; kutunun gösterdiği değer gerçek hesaplanmış font ile eşleşmeli. W3C'nin [metin boyutlandırma açıklaması](https://www.w3.org/WAI/WCAG21/Understanding/resize-text) bu kontrolün erişilebilirlik açısından önemini destekler; bu tek bulgu kapsamlı WCAG uygunluk/uygunsuzluk kararı değildir.

## Ayrı geliştirme alanları — yeni bug sayısına dahil değil

### G01 — Dublaj inceleme durumu asistan iş kaydına da taşınmalı

`src/assistant-jobs.js:update` tamamlanan işte yalnız altyazı `outputDescriptors` kayıtlarını `result.artifacts` olarak saklıyor. `src/assistant-flow-state.js:describe` kısmi sonucu bu artifact alanlarından çıkarıyor. Dublajdaki `quality.groups`/`qualityUnavailable` özeti aynı iş sonucuna taşınmıyor. Dublaj paneli ise `dub-generator-ui.js` içinde review/failed sayılarını ayrıca gösteriyor.

**Öneri:** İşlem tamamlandı ile kalite incelemesi gerekiyor bilgisini birlikte sun; asistan devam kartında bounded `total/ready/review/failed/qualityUnavailable` özeti ve inceleme bağlantısı olsun. Mevcut `ready` burada devam adımının hazır olmasıdır; tek başına sesin kusursuz olduğu iddia edildiğini kanıtlamaz. Yine de panel ile iş merkezi arasındaki anlam farkını azaltmak yararlı olur.

**Kabul:** Review içeren sentetik `done` olayı sonunda işlem tamamlanmış görünürken inceleme gereği kaybolmamalı. Model sesi dinlemiş gibi gösterilmemeli. Hazır grupların önbelleği korunmalı.

### G02 — Uzun Türkçe çeviri ve dublaj kalitesi için hedefli inceleme paketi

[R814](BROWSER_BUG_REPORT_814.md) önceki canlı uzun koşuda **26/361 çeviri eksik**, ayrı İngilizce motor koşusunda **6/159 review** bildiriyor. Bunlar farklı koşulardır; bir başarı oranına birleştirilmez. Son v14'te tam 20 dakikalık Türkçe tekrar yapılmadığı da aynı raporda açık. **Bu tur canlı sağlayıcı/GPU ile yeniden doğrulanmadı; yeni keşif değildir.**

**Öneri:** Eksik her çeviriyi ret kodu, kaynak parça ve son deneme nedeni ile kısa inceleme listesine dönüştür; yalnız hatalı grupları sınırlı bütçeyle yeniden dene. Ses review grupları için mevcut A/B dinlemeyi kullan; anlam kapılarını gevşeterek yapay başarı üretme.

**Kabul:** Aynı sabit kaynak ve protokolde yeni/önceki sonuçlar ayrıştırılsın; eksik metin, sayı/olumsuzluk ve gerçek dinleme değerlendirmesi ayrı ölçülsün. Müzik analizi veya yeni model/motor kapsamı açılmasın.

### G03 — Dublaj başlatma kartında kapsamın görünürlüğü

`src/assistant-capabilities.js` başlatma kartını genel olarak “seçili altyazı, referans ve mevcut seçenekler” şeklinde tarif ediyor. `assistant-agent-service.js` hazır olmayı okuyor; workflow/translation profile kartlarında yaptığı gibi dublajın tüm etkili yapılandırmasını kartın kimliğine bağlamıyor. Bu mevcut seçeneklerle başlama sözleşmesine aykırılık diye yeni bug sayılmadı.

**Öneri:** Kartta altyazı rolü/kimliği, referans adı, aralık, kısa örnek durumu ve doğrulama seçeneğini özetle. Kart hazırlandıktan sonra etkili ayarlar değişirse güncel özeti göster veya kartı bayat say. Tam dosya yolu/anahtar gönderme, gereksiz ikinci sohbet onayı ekleme.

**Kabul:** Aynı video içinde altyazı veya referans değiştiğinde kullanıcı hangi kapsamı başlatacağını karttan anlayabilsin; değişmeyen ayarlarda mevcut tek tıklamalı uygulama korunmalı.

### G04 — Uzun oturumlarda kaynak/listener bütçesinin gerçek ölçümü

[R813](BROWSER_BUG_REPORT_813.md) ve [R814](BROWSER_BUG_REPORT_814.md) mevcut **11 before-quit listener** uyarısını açık bırakıyor. Uyarı tek başına sızıntı kanıtı değildir; bu tur yeniden native süreç açılmadı. `src/assistant-jobs.js` içindeki in-session `records` Map'i de bitmiş işler için görünür bir saklama sınırı taşımıyor. Günlük kısa kullanımda sorun çıkacağı iddia edilmez.

**Öneri:** Ayrı sentetik profilde tekrarlı PDF aç/kapat, sekme değişimi ve çok sayıda kısa iş sonrası listener/iş kaydı/bellek eğrisini ölç. Sahiplikleri belirleyip bitmiş kayıtlar için makul saklama politikası değerlendir; etkin işler ve onlara bağlı devam kimlikleri kaybolmamalı.

**Kabul:** Sabit aşamalardan sonra listener sayısı ve bellek platosu karşılaştırılsın. `setMaxListeners` veya eşik artırma gerçek ölçümün yerine geçmesin. PDF.js'in [belge yaşam döngüsü API'si](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib-PDFDocumentProxy.html) mevcut kapatma akışıyla karşılaştırılsın; bu tur kütüphane kodu kopyalanmadı.

### G05 — Kontrol varlığı yerine sınır zamanlamasını kapsayan Windows kabulü

Mevcut PDF/asistan testleri arama, iptal, sahiplik, yeniden giriş ve ses konumu gibi yararlı davranışları koruyor. Bu tur seçilen dört dosyada **20/20** kontrol geçti; buna rağmen B01–B03 üretilebildi. Bu, mevcut testlerin değersiz olduğu anlamına gelmez; farklı zamanlama sınırlarını kapsıyorlar.

**Öneri:** Yukarıdaki üç hatanın kabul ölçütlerine odaklanan kısa kontroller ekle; tüm paketi gereksiz tekrar etme. Sonraki uygulama tesliminde gerçek Windows `start.bat`, hesaplanmış font, 125/150/200% ölçek, dar ekran ve iki dil kontrolü yap. GPU/DRM kabulünü bu UI kontrollerinden ayrı tut.

**Kabul:** Font için gerçek computed style; çeviri için istek hedefi ve son state/export eşleşmesi; hazırlık için hem extraction hem import beklemesinde seçim değişimi ölçülsün. Test sonucunu görmeden başarılı denmesin.

## Yöntem, kapsam ve tekrar kontrolü

- AGENTS, YENI-BILGISAYAR, güncel devirler/R813–R814 ve ilgili R678/R786/R806 okundu. Kapsam kayıt dosyasındaki 1.000 satır ve aile/mekanizma imzaları kontrol edildi. Bu sayı 1.000 yeni test veya bug olarak kullanılmadı.
- İlgili tarihsel aileler: **F30** sayfa aralığı, **F35** PDF yaşam döngüsü, **F47** tema/dil. Özellikle `N0589/N0591/N0595/N0599`, `N0689/N0691/N0695/N0699`, `N0929/N0931/N0935/N0939` geç sonuç/eşzamanlılık/yeniden giriş/geri bildirim kapsamıyla karşılaştırıldı. Bu geniş aile kayıtlarının PASS olması bu üç belirli uygulama sınırını geçtiğini kanıtlamaz. Eski 1.000 prob yeniden koşulmadı; tarihsel dosyalar değiştirilmedi.
- Doğrulama Windows/Node **v24.22.0** üzerinde: B01/B03 için gerçek `index.html` DOM'u ve değiştirilmemiş tam `pdf-reader-experience.js` JSDOM'da; B02 için gerçek renderer çeviri fonksiyonları VM'de çalıştırıldı. Kontrollü IPC yanıtı ve gecikmesi kullanıldı. Bu **native Electron görsel kabulü, gerçek PDF çizimi veya canlı çeviri kalitesi değildir**.
- `node --test` ilk denemesi sandbox'ın alt süreç başlatmasına verdiği **spawn EPERM** nedeniyle dört dosyayı çalıştıramadı. Bu ürün bugı sayılmadı. `--test-isolation=none` ile aynı dört dosya süreç başlatmadan çalıştı: **20 geçti, 0 başarısız, 0 atlama**. Test kaynağı/başarı eşiği değiştirilmedi.
- Tam `npm test`, Electron bridge, canlı site, TTS/GPU, fiziksel dinleme, DRM, install.bat/start.bat açılışı ve yeni Windows screenshot/DPI matrisi yapılmadı. CI bu rapor için beklenmez; sonuç görülmeden yeşil iddiası yok.

Yeniden üretme:

```powershell
node docs/raporlar/evidence815/probe.cjs 00a01f92f109f11183b02bc55dd1dfed25ed3e9f
node --test --test-isolation=none tests/reader-audio-control.test.js tests/pdf-reader-search-ui.test.js tests/assistant-flow-state.test.js tests/assistant-flows.test.js
```

Prob, bug davranışını doğrulayan gözlemleri kaydeder; exit 0 **ürün hataları düzeldi** anlamına gelmez. Sonraki ürün revizyonunda hash argümanı o revizyona göre verilmelidir; bu JSON mevcut incelemenin kanıtıdır.

## Teslim ve korunmuş yerel durum

Başlangıçta `docs/OFFLINE-MANIFEST.md`, `docs/raporlar/INDEX.md` değişmiş, `start.sh` yerelde silinmişti; ayrıca kapsam dışı untracked kişisel dosyalar vardı. Bunlara dokunulmadı ve rapor commit'ine alınmadı. Yerel `start.sh` silinmesi uzak ürün sürümünde yeni Linux launcher bugı diye sayılmadı. Rapor indeksi zaten kullanıcı değişikliği taşıdığı için değiştirilmedi; kalıcı erişim bu dosya ve DEVIR-NOTU indeksindedir.

Yeni bağımlılık, kurulum, veri şeması, lisanslı dış kod aktarımı veya ürün düzeltmesi yok. Dış kaynak incelemesi yalnız W3C/PDF.js birincil dokümantasyonuyla sınırlıdır. Öneriler uygulanmadı; kullanıcı isterse sonraki ayrı işin kapsamı olabilir.

<!-- DEEP-AUDIT-815 -->

## Genişletilmiş bulgu dizini

31 Ekim 2026; inceleme HEAD **`6b3df86e35db8bc3271440f06c779cfb0acb2c22`**, dal `codex/deep-report815`. Ürün kaynakları önceki raporla aynı; yalnız rapor/kanıtlar eklendi. Kullanıcının onayıyla üç **GPT‑6.1 Sol / medium effort** ajanı browser, backend ve asistan/kütüphane alanlarını ayırdı. Ana ajan kanıtları okuyup 7 ajan probunu ve 2 kendi probunu yeniden çalıştırdı: 9/9 exit0, yani hatalar yeniden üretildi; düzeltme/test paketi başarısı değildir.

Toplam **54 güncel hata: önceki 3 + bu genişletmede doğrulanan 50 + R85 P79-04 ile ilişkili 1 mevcut açık**. Aynı kökün PDF/MHTML çeşitleri, birden fazla form kontrolü ve aynı sorunun dil/ekran tekrarları ayrı sayılmadı. A09 yalnız kanıt boşluğu, dependency audit yalnız risk eki; ikisi 54 sayısında yok. Hedeflenen 50 aşıldı; bütün uygulamanın veya bütün sitelerin tarandığı iddia edilmez.

| ID | Önem | Hata | Alt kanıt ID |
|---|---|---|---|
| [R815-B01](#r815-b01) | P2 | Kayıtlı PDF yazı boyutu açılışta sıfırlanıyor | B01 |
| [R815-B02](#r815-b02) | P1 | PDF çevirisinin hedef dili paketler arasında değişiyor | B02 |
| [R815-B03](#r815-b03) | P2 | PDF proje importu beklenirken değişen seçim eski projeyi açıyor | B03 |
| [R815-B04](#r815-b04) | P2 | Büyük harfli video uzantısı gömme işinin kurtarma kaydını geçersiz kılıyor | ROOT01 |
| [R815-B05](#r815-b05) | P1 | Kitap projesi yedeği yer imlerini geri yüklemiyor | ROOT02 |
| [R815-B06](#r815-b06) | P1 | Kitap yedeği 1000 üzerindeki konuşma gruplarını sessiz kesiyor | ROOT03 |
| [R815-B07](#r815-b07) | P1 | Kaydedilebilen uzun kitap bölümü başarıyla yedekleniyor ama geri yüklenemiyor | ROOT04 |
| [R815-B08](#r815-b08) | P2 | Model yöneticisi güncel HF_HUB_CACHE yolunu görmüyor | ROOT05 |
| [R815-B09](#r815-b09) | P1 | Bozuk okuma listesi indeksi sonraki kayıtta sessizce üzerine yazılıyor | ROOT06 |
| [R815-B10](#r815-b10) | P2 | Yeni bölüm sesi seçilince eski M4B hâlâ güncel sayılıyor | ROOT07 |
| [R815-B11](#r815-b11) | P2 | Browser tablist içinde tab olmayan etkileşimli düğmeler bulunuyor | ROOT08 |
| [R815-B12](#r815-b12) | P2 | Browser araç menüsünün ARIA menu rolü içindeki kontrollerle uyuşmuyor | ROOT09 |
| [R815-B13](#r815-b13) | P2 | Oynatma merkezindeki altyazı araması senkron gecikmesini yok sayarak seek yapıyor | ROOT10 |
| [R815-B14](#r815-b14) | P2 | MKV içindeki TTC font koleksiyonları font çıkarımında atlanıyor | ROOT11 |
| [R815-B15](#r815-b15) | P2 | HTTPS ağ medyası HTTP/RTSP yolundaki native oynatıcı geçişini atlıyor | ROOT12 |
| [R815-B16](#r815-b16) | P2 | WMV/WMA kaynakta altyazı gömme MP4e uyumsuz ses kopyalıyor | ROOT13 |
| [R815-B17](#r815-b17) | P1 | Arşivlenmiş projelerle geçerli kitap yedeği 100 proje sınırında geri yüklenemiyor | ROOT14 |
| [R815-B18](#r815-b18) | P1 | PDF/MHTML dışa aktarımı kayıt diyaloğu sırasında belge değişimini doğrulamıyor | BR01 |
| [R815-B19](#r815-b19) | P1 | Çevrimdışı kopya yenilemesindeki kısmi yazma son sağlam MHTML kopyasını bozuyor | BR02 |
| [R815-B20](#r815-b20) | P2 | Kilitli çevrimdışı kopyanın silinmesi başarı gösterip özel MHTML dosyasını diskte bırakıyor | BR03 |
| [R815-B21](#r815-b21) | P2 | Bekleyen çevrimdışı yenileme, kullanıcı tarafından kaldırılan kaydı yeniden diriltiyor | BR04 |
| [R815-B22](#r815-b22) | P2 | Tam sayfa yakalama uzun sayfaları sessizce 30.000 CSS piksele kesiyor | BR05 |
| [R815-B23](#r815-b23) | P2 | Eşzamanlı video yakalamaları kontrol çubuğunu kalıcı gizli bırakıyor | BR06 |
| [R815-B24](#r815-b24) | P2 | Kısmen ekran dışında kalan videonun temiz karesine komşu sayfa içeriği ekleniyor | BR07 |
| [R815-B25](#r815-b25) | P2 | Başarısız atlama aralığı yazımı bellekte uygulanıyor ve sonraki kayıtta diske sızıyor | BR08 |
| [R815-B26](#r815-b26) | P1 | Ana belgedeki değişmiş checkbox ve geçerli contenteditable taslakları kapatma/boşaltmada korunmuyor | BR09 |
| [R815-B27](#r815-b27) | P1 | Iframe ve shadow DOM içindeki kaydedilmemiş form/taslaklar güvenli boşaltma taramasına girmiyor | BR10 |
| [R815-B28](#r815-b28) | P2 | Videonun sağtık menüsündeki Döngü/Oynat eylemi sağtıklanan medya yerine en büyük medyaya gidiyor | BR11 |
| [R815-B29](#r815-b29) | P1 | Dışa aktarma uzantı ekleyince kullanıcı tarafından seçilmemiş mevcut hedefin üzerine yazabiliyor | BR12 |
| [R815-B30](#r815-b30) | P1 | Sekme kapanışında ilk form kontrolünden sonra capture drain beklerken yazılan taslak son kontrolden geçmiyor | BR13 |
| [R815-B31](#r815-b31) | P2 | Harici oynatıcı native başlatma hatası yutulurken API başarı döndürüyor | BR14 |
| [R815-B32](#r815-b32) | P2 | Kalıcı anlamsal worker düzeltmesi caller her istekte yeni factory kurduğu için tekrar model süreci yaratıyor | BR15 · önceki açık |
| [R815-B33](#r815-b33) | P1 | Başka hedef dilde çeviri önceki çift dilli dosyayı eziyor | BE01 |
| [R815-B34](#r815-b34) | P1 | Auto kaynakta Türkçe açılış, kalan İngilizce konuşmayı çevrilmiş gibi tamamlıyor | BE02 |
| [R815-B35](#r815-b35) | P2 | ASS vektör çizim koordinatları gerçek çeviri girdisi oluyor | BE03 |
| [R815-B36](#r815-b36) | P2 | SRT gövdesindeki zaman aralığı dublajda hayalet cue ve kimlik kayması üretiyor | BE04 |
| [R815-B37](#r815-b37) | P2 | ASR'de yalın özel ad değişimi passed/ready kalıyor | BE05 |
| [R815-B38](#r815-b38) | P2 | Aynı sayıların kişiler arasında takası ASR miktar kapısından geçiyor | BE06 |
| [R815-B39](#r815-b39) | P2 | Literal WebVTT etiketi yeniden dışa aktarımda gerçek stile dönüşüyor | BE07 |
| [R815-B40](#r815-b40) | P2 | WebVTT inline zaman etiketi çeviriye konuşma, çıktıya görünen metin olarak taşınıyor | BE08 |
| [R815-B41](#r815-b41) | P1 | Kullanıcı sahne notu değişince eski çeviri fuzzy hafızadan geri geliyor | BE09 |
| [R815-B42](#r815-b42) | P2 | Checkpoint'ten devamda korunmuş eski cue'lar konuşmacı kimliğini kaybediyor | BE10 |
| [R815-B43](#r815-b43) | P2 | Kişisel puan 10'luk ve 5'lik ölçeklerde farklı yorumlanıyor | A01 |
| [R815-B44](#r815-b44) | P2 | Kapatılan Keşfet ayrıntısı, geç gelen ekleme yanıtıyla kütüphaneyi açıyor | A02 |
| [R815-B45](#r815-b45) | P2 | Keşfet Tercihlerindeki yapım türü filtresi çalışmıyor | A03 |
| [R815-B46](#r815-b46) | P2 | Bu akşam bölümünün geç oynatma yanıtı yeni açılan başka pencereyi kapatıyor | A04 |
| [R815-B47](#r815-b47) | P1 | Sohbet silme onayı başka sohbete yönleniyor | A05 |
| [R815-B48](#r815-b48) | P2 | Ana süreç doğrulama eki uygulamanın JSON yorum analizi akışını bozuyor | A06 |
| [R815-B49](#r815-b49) | P2 | Sabitlenen notlar ilgisiz normal web sayfaları arasında karışıyor | A07 |
| [R815-B50](#r815-b50) | P2 | Onaylanan altyazı işlemi yeni izin aynı konumsal U kimliğine kayıyor | A08 |
| [R815-B51](#r815-b51) | P2 | Zevk tercihlerini kaydetme yanıtı daha yeni taslağı siliyor | A10 |
| [R815-B52](#r815-b52) | P2 | Keşfet tercih hatası etkin ayrıntı penceresinin dışında gösteriliyor | A11 |
| [R815-B53](#r815-b53) | P2 | Yerel kayıtlı Keşfet tercihi çevrimdışıyken geri alınamıyor | A12 |
| [R815-B54](#r815-b54) | P2 | Önceki kitabın geciken açılışı son kitap seçiminin üzerine geliyor | A13 |

## Windows, kapsam ve kanıt sınırları

Ayrı gerçek Windows Electron profillerinde browser menüsü ve uygulama ayarları/arama/araçlar render edildi; axe çalıştı, ilgili görüntüler açılıp incelendi. Browser semantiğindeki iki ihlal gerçek render kanıtıdır; 12 ek yüzeyde axe ihlali görülmemesi tasarımın veya ekran okuyucu deneyiminin kusursuz olduğu anlamına gelmez. [Browser menüsü](evidence815/deep/browser-more-menu.png), [uygulama ayarları](evidence815/deep/settings-general.png), [iki native taramanın ilk kaydı](evidence815/deep/native-axe-browser.json), [ikinci kayıt](evidence815/deep/native-axe-settings.json).

Diğer bugların büyük kısmı değiştirilmemiş gerçek modül/fonksiyonların VM/JSDOM veya kontrollü IPC, dosya, sağlayıcı, ASR ve süreç sınırlarında çalıştırılmasıyla doğrulandı. Kontrollü ASR, gerçek motorun doğrulama kararını sınar; modelin böyle ses ürettiğini/Whisperın canlı aynı dökümü yaptığını ispatlamaz. Başka dosya üzerine yazma ve disk hatası probları yalnız sentetik hedef kullanır; native Windows dosya seçicinin bütün davranışları bu tur doğrulanmadı. Belirsiz otomatik picker dönüşü görsel kabul sayılmadı. Native kod/GUI ile kontrol edilen dar alanlar, diğer kontrollü akışlar için genel E2E başarısı değildir.

Yeni ücretli çağrı, gerçek TTS/ASR modeli/GPU, kişisel hesap/profil, fiziksel dinleme, DRM, install.bat/start.bat yeniden açılışı, tam npm suite ve CI bekleme yapılmadı. Önceki 20 hedefli test sonucu tarihsel ilk tur kanıtıdır; yeni 9 probun yerine veya 54 benzersiz test sayısı gibi toplanmadı. [Ana ajan tekrar kaydı](evidence815/deep/parent-verification.json). Ürün/test/bağımlılık/ayar değişmedi.

## Eklenen dosya, kitap ve Windows bulguları

<a id="r815-b04"></a>

### R815-B04 · P2 — Büyük harfli video uzantısı gömme işinin kurtarma kaydını geçersiz kılıyor

- **Konum:** `src/burnin-output.js:12`, `src/burnin-output.js:162`, `src/main.js:20746`.
- **Tekrar:** movie.MP4 veya movie.MKV için burninOutputPaths ile oluşturulan temp/out yollarını aynı recovery doğrulayıcısına ver.
- **Gözlenen:** Küçük harfli movie.mp4 recoveryMatches=true; .MP4 ve .MKV false. Oluşturulan ad movie.MP4.altyazili… olurken recovery regexi movie.altyazili… bekliyor.
- **Beklenen:** Uygulamanın kendisinin ürettiği yollar kurtarma doğrulamasından geçmeli; uzantının harf büyüklüğü etkisiz olmalı.
- **Etki:** Windows kamera/video dosyalarındaki yaygın büyük harfli uzantıda kesilen uzun gömme işi sonradan tanınmayabilir; yeniden başlatma gerekebilir. Kaynak dosyanın silindiği iddia edilmez.
- **Kanıt:** root/candidates.cjs / burnin-case.
- **Sınır:** Üretim yol üretici ve doğrulayıcı doğrudan çalıştırıldı; uzun ffmpeg işi kesilmedi.

<a id="r815-b05"></a>

### R815-B05 · P1 — Kitap projesi yedeği yer imlerini geri yüklemiyor

- **Konum:** `src/book-project-backup.js:9`, `src/book-bookmarks.js:66`.
- **Tekrar:** Yer imi olan geçerli proje için ses dahil exportBooks, ardından boş klasöre importBooks çalıştır.
- **Gözlenen:** Başlangıçtaki bookmarks dizisi geri yüklenen project.json içinde tamamen yok. export/import ikisi de başarılı.
- **Beklenen:** Kullanıcıya proje yedeği olarak sunulan dosya yer imlerini korumalı veya kapsam dışı olduğunu dışa aktarmadan önce açıkça bildirmeli.
- **Etki:** Yeni bilgisayarda geri yükleme sonrası işaretlenmiş pasaj ve dinleme noktaları kaybolur. Orijinal proje bu denetimde değiştirilmedi.
- **Kanıt:** root/candidates.cjs / backup-bookmarks.
- **Sınır:** Sentetik bölüm/ses ve metadata; kişisel kitap veya yedek kullanılmadı.

<a id="r815-b06"></a>

### R815-B06 · P1 — Kitap yedeği 1000 üzerindeki konuşma gruplarını sessiz kesiyor

- **Konum:** `src/book-project-backup.js:36`, `src/media-workflows.js:38`.
- **Tekrar:** Üretimin izin verdiği en çok5000 grubun altında kalan1001 gruplu bölüm oluştur; son grubu review yap; ses dahil yedekle ve geri yükle.
- **Gözlenen:** 1001 grup1000 oluyor; sondaki tek review grubu yok oluyor. Tam ses dosyası korunuyor, ancak son bölümün konuşma haritası ve inceleme girdisi kayboluyor. Ayrıca taşınan grupların verification ayrıntıları da dar yedek şemasında yok.
- **Beklenen:** Geçerli grup listesi kayıpsız taşınmalı veya yedek oluşturma açık boyut hatasıyla reddedilmeli; başarıyla sessiz kırpılmamalı.
- **Etki:** Sesin sonundaki vurgulama/inceleme ve grup bazlı onarım eksik kalır; sorunlu grubun neden/konumu kaybolur. Verification alanı kaybı aynı yedekleme kapsamı içinde ele alındı, ayrı bug sayılmadı.
- **Kanıt:** root/candidates.cjs / backup-quality-group-limit, backup-verification.
- **Sınır:** 1001 saniyelik sentetik sessiz WAV ve metin grupları; model kalitesi denenmedi. Bölümün status=review alanı otomatik ready oldu iddiası yok.

<a id="r815-b07"></a>

### R815-B07 · P1 — Kaydedilebilen uzun kitap bölümü başarıyla yedekleniyor ama geri yüklenemiyor

- **Konum:** `src/media-workflows.js:1062`, `src/book-project-backup.js:174`.
- **Tekrar:** Book-save900000 karaktere kadar kabul ederken100001 karakterli geçerli bölümü ses hariç yedekle ve geri yükle.
- **Gözlenen:** Export başarılı; import Invalid chapter. hatası veriyor. Dışa aktarma, kendi geri yükleme sözleşmesinin100000 karakter tavanını uygulamıyor.
- **Beklenen:** Uygulamada geçerli ve başarıyla yedeklenmiş bölüm tekrar içe alınabilmeli; aksi durumda yedek daha oluşturulmadan açık ret verilmeli.
- **Etki:** Yedek var sanılarak makine taşındığında veya orijinal kaldırıldığında kullanıcının uzun bölümüne uygulama içinden erişilemiyor.
- **Kanıt:** root/candidates.cjs / backup-long-chapter.
- **Sınır:** Asıl900000 sınırı gerçek book-save yolundan okundu;100001 örneği gerçek export/import ile çalıştırıldı.

<a id="r815-b08"></a>

### R815-B08 · P2 — Model yöneticisi güncel HF_HUB_CACHE yolunu görmüyor

- **Konum:** `src/model-manager.js:21`, `src/main.js:19350`.
- **Tekrar:** Hugging Face standart HF_HUB_CACHE özel dizinini kullan; modelCacheRoots/scanModelCache ile durum al. Aynı dizini eski HUGGINGFACE_HUB_CACHE ile vererek karşılaştır.
- **Gözlenen:** HF_HUB_CACHE ve yalnız HOME verilen durumda kök listesi boş. Kod yalnız eski HUGGINGFACE_HUB_CACHE, HF_HOME, TRANSFORMERS_CACHE, USERPROFILE ve uygulama model klasörünü okuyor.
- **Beklenen:** Backend indirme/yükleme ile model yöneticisi aynı standart önbellek köklerini izlemeli.
- **Etki:** Kurulu model yok/eksik görünebilir; disk bilgisi ve silme yönetimi yanlış önbelleği hedefler. Linux HOME/XDG varsayılanları da aynı kök çözümleme sorununun parçasıdır, ayrı sayılmadı.
- **Kanıt:** root/candidates.cjs / model-cache-env.
- **Sınır:** Gerçek model indirilmedi. Standart değişken Hugging Face birincil belgesinden doğrulandı; kişisel ortam değiştirilmedi.

<a id="r815-b09"></a>

### R815-B09 · P1 — Bozuk okuma listesi indeksi sonraki kayıtta sessizce üzerine yazılıyor

- **Konum:** `src/browser-reading-list.js:43`, `src/browser-reading-list.js:107`.
- **Tekrar:** Mevcut MHTML dosyası varken index.json bozuk JSON olsun; başka sayfa için prepare/commit çalıştır.
- **Gözlenen:** Okuma hatası boş liste sayılıyor; yeni indeks yalnız yeni sayfayı içeriyor. Eski arşiv dosyası diskte kalıyor ama uygulama artık onu listelemiyor; kayıt işlemi başarı dönüyor.
- **Beklenen:** Bozuk indeks korunmalı, kullanıcı uyarılmalı ve kurtarma/yeniden oluşturma açık tercih olmalı.
- **Etki:** Kayıtlı çevrimdışı sayfaların dizini ve metadata kurtarılabilir son haliyle korunmuyor. Bu, BR02 içerik dosyasının yarım yazılması ve BR03 silme hatasından farklıdır.
- **Kanıt:** root/candidates.cjs / reading-corrupt-index.
- **Sınır:** Sentetik bozuk indeks ve iki sahte MHTML kullanıldı; kişisel arşiv yok.

<a id="r815-b10"></a>

### R815-B10 · P2 — Yeni bölüm sesi seçilince eski M4B hâlâ güncel sayılıyor

- **Konum:** `src/media-workflows.js:184`, `src/media-workflows.js:214`, `src/media-workflows.js:1633`.
- **Tekrar:** Bölüm metni aynı kalırken sesli kitap dışa aktar; sonra bölüm için farklı ses kaydı/take seç veya yeniden üret. audiobookInfo sonucunu oku.
- **Gözlenen:** take-A→take-B değişiminden önce/sonra current=true. Metin değişikliği negatif kontrolünde false. M4B kaydı yalnız textHash saklıyor; ses çıktı kimliği yok.
- **Beklenen:** Dışa aktarımın güncelliği kullanılan bölüm sesi kimliğini de izlemeli; eski kayıt önceki sürüm olarak oynatılabilir ama güncel denmemeli.
- **Etki:** Kullanıcı düzeltilmiş sesin paketlenmiş olduğunu sanıp eski sesli kitabı dinler veya paylaşır.
- **Kanıt:** root/candidates.cjs / audiobook-current-voice.
- **Sınır:** Gerçek nested audiobookInfo fonksiyonu ve dosya statı çalıştırıldı; M4B yeniden kodlanmadı. Mevcut açıkça önceki çıktıyı oynatma hakkı kaldırılması önerilmez.

<a id="r815-b11"></a>

### R815-B11 · P2 — Browser tablist içinde tab olmayan etkileşimli düğmeler bulunuyor

- **Konum:** `src/renderer/index.html:1236`.
- **Tekrar:** Ayrı Windows profiliyle Browser ekranını ve araç menüsünü aç; gerçek render üzerinde axe WCAG taraması yap.
- **Gözlenen:** browserTabStrip role=tablist için aria-required-children critical: sıradan button/aria-busy çocukları. Sekme şeridi, tab rolü sözleşmesine uymuyor.
- **Beklenen:** Sekmeler ve kapatma/yeni sekme eylemleri doğru erişilebilir rol/ağaç düzenini korumalı.
- **Etki:** Ekran okuyucuda sekme sayısı/seçimi ve düğmelerin ilişkisi yanlış sunulabilir; klavye/yardımcı teknoloji gezinmesi tutarsızlaşır.
- **Kanıt:** native-axe-browser.json / more-menu, translate-menu; browser-more-menu.png.
- **Sınır:** Gerçek Windows Electron+axe ve screenshot doğrulandı. NVDA/JAWS ile fiziksel kullanım yapılmadı. Aynı öğelerin çok dil/ekrandaki tekrarları ayrı sayılmadı.

<a id="r815-b12"></a>

### R815-B12 · P2 — Browser araç menüsünün ARIA menu rolü içindeki kontrollerle uyuşmuyor

- **Konum:** `src/renderer/index.html:1542`.
- **Tekrar:** Browser üç nokta menüsünü açıp gerçek render üzerinde axe çalıştır.
- **Gözlenen:** browser-more-popover role=menu altında input,button,summary var; aria-required-children critical. Menü öğesi rolleriyle uyumlu ağaç yok.
- **Beklenen:** Karışık form/araç içeriği uygun popover semantiği taşımalı veya menu/menuitem klavye ve rol düzeni tamamlanmalı.
- **Etki:** Yardımcı teknoloji bu alanı menü diye ele alırken içteki arama/zoom/alt menülere beklenen biçimde erişemeyebilir.
- **Kanıt:** native-axe-browser.json / more-menu; browser-more-menu.png.
- **Sınır:** ROOT08 farklı role sahip başka DOM köküdür; ikisi ayrı semantik yapılandırma gerektirir. Axe sınıflandırması ekran okuyucu uçtan uca kabulü diye sunulmadı.

<a id="r815-b13"></a>

### R815-B13 · P2 — Oynatma merkezindeki altyazı araması senkron gecikmesini yok sayarak seek yapıyor

- **Konum:** `src/renderer/media-hub-ui.js:72`.
- **Tekrar:** Altyazı20sn, etkin gecikme+10sn olsun; Oynatma ve sahneler içindeki altyazı aramasından o satıra tıkla.
- **Gözlenen:** Video20sn konumuna gidiyor; aynı altyazının video zamanı subtitleVideoTime ile30sn olmalı. Gerçek tam modülün arama düğmesi çalıştırıldı.
- **Beklenen:** Arama sonucu, ana oynatıcıdaki diğer altyazı eylemleri gibi kaynak-altyazı→video zaman dönüşümünü kullanmalı.
- **Etki:** Senkronu ayarlanmış filmde aranan replik yerine yanlış sahne açılır.
- **Kanıt:** root/integrations.cjs / subtitle-search-offset.
- **Sınır:** Kontrollü HTML video ve10sn dönüşüm; fiziksel video dinlenmedi.

<a id="r815-b14"></a>

### R815-B14 · P2 — MKV içindeki TTC font koleksiyonları font çıkarımında atlanıyor

- **Konum:** `src/browser-fonts.js:28`.
- **Tekrar:** Gerçek Windows cambria.ttc fontunu0,4sn sentetik MKVye attachment olarak ekle; extractFonts çağır.
- **Gözlenen:** ffprobe TTC attachmentı gördüğü halde sonuç 0 font. readFonts TTC imzasını destekliyor, fakat attachment filtresi yalnız ttf/otf/woff/woff2 uzantısını alıyor.
- **Beklenen:** Desteklenen TTC koleksiyonu da keşfedilip seçilebilir/uygulanabilir olmalı veya destek eksikliği kullanıcıya açıklanmalı.
- **Etki:** Gömülü font koleksiyonu kullanan özellikle CJK ASS altyazıları beklenen fontu alamaz; fallback/eksik glif riski oluşur.
- **Kanıt:** root/integrations.cjs / ttc-font-attachment; native-media.json / actualTtcExtraction.
- **Sınır:** Gerçek ffmpeg/ffprobe/modül doğrulaması yapıldı; font ve medya Git’e alınmadı. Farklı CJK gliflerinin görsel çıktısı ölçülmedi.

<a id="r815-b15"></a>

### R815-B15 · P2 — HTTPS ağ medyası HTTP/RTSP yolundaki native oynatıcı geçişini atlıyor

- **Konum:** `src/renderer/media-hub-ui.js:55`, `src/renderer/media-hub-ui.js:63`.
- **Tekrar:** Medya merkezindeki aynı ağ akışını sırasıyla http,https,rtsp protokolüyle playStream üzerinden aç.
- **Gözlenen:** Gerçek playStream fonksiyonunda HTTP ve RTSP NativePlayerUI.start çağırıyor; HTTPS çağırmıyor. Regex https harfini içermiyor. HTTPS m3u8 için ayrı HLS kolu var; bu bulgu m3u8 dışındaki ağ medyasına aittir.
- **Beklenen:** Güvenli HTTPS normal akışları da amaçlanan motor seçiminden geçmeli; protokol yazım farkı codec yeteneğini değiştirmemeli.
- **Etki:** Chromiumun çözemediği ama native motorun desteklediği HTTPS medya, HTTP eşdeğeri çalışırken açılamayabilir; kullanıcı motoru ayrıca değiştirmek zorunda kalır.
- **Kanıt:** root/integrations.cjs / stream-protocol-native.
- **Sınır:** Native dispatch farkı doğrudan doğrulandı; uzak HEVC/DTS sunucusu veya DRM kabulü yapılmadı. HTTPSte desteklenen Chromium videolarının hepsi bozuk denmiyor.

<a id="r815-b16"></a>

### R815-B16 · P2 — WMV/WMA kaynakta altyazı gömme MP4e uyumsuz ses kopyalıyor

- **Konum:** `src/burnin-output.js:19`, `src/main.js:20776`.
- **Tekrar:** 0,4sn sentetik WMV video+wmav2 ses oluştur; burninAudioArgs sonucundaki -c:a copy ile MP4 mux et.
- **Gözlenen:** wmv için helper copy seçiyor; gerçek FFmpeg codec wmav2 in stream1 not supported in container, exit-22. Aynı iş AAC yeniden kodlandığında mux desteklenir.
- **Beklenen:** Hedef kapsayıcıyla uyumsuz ses codec/kapsayıcı geçişinde AAC gibi uyumlu ses üretimi seçilmeli veya baştan açık destek uyarısı olmalı.
- **Etki:** Windows WMV videolarında gömme işlemi gereksiz biçimde başarısız olur. Kaynak/video silinmez.
- **Kanıt:** native-media.json / wmvAudioCopy; REPRODUCE.md.
- **Sınır:** Üretim audio argüman seçimi ve gerçek FFmpeg mux aşaması doğrulandı; tam libass yakma yapılmadı. AVI/PCM örneği mevcut FFmpegde çalıştı ve bug sayılmadı.

<a id="r815-b17"></a>

### R815-B17 · P1 — Arşivlenmiş projelerle geçerli kitap yedeği 100 proje sınırında geri yüklenemiyor

- **Konum:** `src/media-workflows.js:146`, `src/media-workflows.js:857`, `src/book-project-backup.js:139`.
- **Tekrar:** 100projeyi arşivleyip1yeni aktif proje oluştur (aktif sınır1/100); bütün projeleri ses hariç yedekle ve boş hedefe geri yükle.
- **Gözlenen:** exportBooks count101 ile başarı verir; importBooks books.length>100 nedeniyle Invalid book backup. döndürür.
- **Beklenen:** Geçerli proje kütüphanesinin yedeği geri yüklenebilmeli veya dışa aktarmada toplam sınır açıkça yönetilmeli.
- **Etki:** Arşivlemenin izin verdiği kütüphane boyutunda uygulamanın ürettiği bütün yedek kullanılamaz hale gelir. ROOT04 tek bölüm boyutuna, bu bulgu aktif/arşivlenmiş proje sayısı sözleşmesine aittir.
- **Kanıt:** root/candidates.cjs / backup-archived-count.
- **Sınır:** 101küçük sentetik proje kullanıldı; kişisel arşiv yok. Tek aktif proje, normal ürün aktif limitini aşmaz.

## Eklenen browser bulguları

<a id="r815-b18"></a>

### R815-B18 · P1 — PDF/MHTML dışa aktarımı kayıt diyaloğu sırasında belge değişimini doğrulamıyor (BR01)

- **Konum:** `src/main.js:9313`, `src/main.js:17608`.
- **Tekrar:** A sayfasında PDF/MHTML dışa aktar; native kayıt diyaloğu pending iken aynı WebContents otomatik B sayfasına gezinsin; seçimi tamamla.
- **Gözlenen:** İki orijinal fonksiyon da ok:true döndü; A için açılan dosyaya B içeriği yazıldı.
- **Beklenen:** İşlem A belgesini sabitlemeli veya generation/URL değişimini reddetmeli.
- **Çağrı zinciri:** browser:archivePage→saveBrowserPageArchive; browser:exportPagePdf→saveBrowserPagePdf; preload ve renderer düğmeleri mevcut.
- **Etki:** Yanlış belge dışa aktarımı; otomatik sayfa değişiminde özel B içeriği A adı altında paylaşılabilir.
- **Karşı kontrol/sınır:** PDF/MHTML aynı sahiplik kökü olduğu için TEK bulgu. Kullanıcı diyaloğu açıkken elle gezinme gerekmiyor; site script/redirect yeterli. Capture PNG zaten diyaloğun öncesinde görüntüyü sabitliyor: bu bulgu ona uygulanmadı.
- **Kanıt:** probe.cjs / BR-EXPORT-SOURCE-MHTML + BR-EXPORT-SOURCE-PDF. Önceki kapsamla hedefli karşılaştırma yapıldı; geçmiş1000yeniden koşulmadı.

<a id="r815-b19"></a>

### R815-B19 · P1 — Çevrimdışı kopya yenilemesindeki kısmi yazma son sağlam MHTML kopyasını bozuyor (BR02)

- **Konum:** `src/main.js:17540`, `src/main.js:17575`.
- **Tekrar:** Var olan KNOWN-GOOD-ARCHIVE kaydını yenile; native savePage hedefe PARTIAL yazdıktan sonra ENOSPC fırlatsın.
- **Gözlenen:** API ok:false döndü ama tek arşiv PARTIAL oldu; indeks eski 18 byte metadata ile kaldı.
- **Beklenen:** Başarısız yenilemede son sağlam çevrimdışı kopya korunmalı; yeni çıktı staging dosyasında doğrulanmalı.
- **Çağrı zinciri:** readingList:refresh→refreshTarget aynı filePath→saveBrowserPageToReadingList→wc.savePage doğrudan mevcut hedef.
- **Etki:** İnternet yokken erişilebilen tek sayfa kopyasının geri alınamaz kaybı.
- **Karşı kontrol/sınır:** Gerçek diski doldurmadık; kontrollü savePage IO kenarı kısmiwrite+reject üretiyor. İndeks _writeIndex atomikliği mevcut ve bu içerik kaybını engellemiyor.
- **Kanıt:** probe.cjs / BR-READING-REFRESH-LOSS. Önceki kapsamla hedefli karşılaştırma yapıldı; geçmiş1000yeniden koşulmadı.

<a id="r815-b20"></a>

### R815-B20 · P2 — Kilitli çevrimdışı kopyanın silinmesi başarı gösterip özel MHTML dosyasını diskte bırakıyor (BR03)

- **Konum:** `src/browser-reading-list.js:127`, `src/renderer/renderer.js:13781`.
- **Tekrar:** Mevcut MHTML unlinkSync işlemini Windows EPERM ile engelle; remove(id) çağır.
- **Gözlenen:** ok:true, liste 0; MHTML dosyası hâlâ var. _writeIndex tekrar temizliği cleanupWarnings üretiyor ama remove bunu dönüşe taşımıyor.
- **Beklenen:** Silinmeyen kopya kayıt ve görünür uyarıyla korunmalı; başarı iddiası çıkmamalı.
- **Çağrı zinciri:** browser:readingList:remove→BrowserReadingList.remove; renderer ok:true üzerine listeyi yenileyip kaydı gizliyor.
- **Etki:** Kullanıcı sildiğini düşünürken çevrimdışı özel sayfa içeriği kalır; liste kaybolduğu için yeniden silme yolu da kaybolur.
- **Karşı kontrol/sınır:** Tüm IO hata varsayımı değil: yalnız hedef MHTML unlink EPERM, indeks yazımı normal. Dosyayı sonra silme denemesi de kilit nedeniyle başarısız.
- **Kanıt:** probe.cjs / BR-READING-LOCKED-DELETE. Önceki kapsamla hedefli karşılaştırma yapıldı; geçmiş1000yeniden koşulmadı.

<a id="r815-b21"></a>

### R815-B21 · P2 — Bekleyen çevrimdışı yenileme, kullanıcı tarafından kaldırılan kaydı yeniden diriltiyor (BR04)

- **Konum:** `src/main.js:17540`, `src/browser-reading-list.js:106`, `src/renderer/renderer.js:13774`.
- **Tekrar:** Yenileme savePage promiseini beklet; aynı listede Sil eylemini tamamla; pending savePage tamamlanıp commit etsin.
- **Gözlenen:** Silme başarılı olduktan sonra aynı id ve MHTML yeniden ortaya çıktı; liste tekrar 1 kayıt.
- **Beklenen:** Son kullanıcı silme kararı pending yenileme tarafından geri alınmamalı.
- **Çağrı zinciri:** Ayrı refresh/remove IPC handlerları kilit/sürüm/tombstone paylaşmıyor; renderer refresh beklerken remove düğmesini disable etmiyor.
- **Etki:** İstenmeyen veri geri gelişi; silme eyleminin anlamını ve mahremiyeti bozuyor.
- **Karşı kontrol/sınır:** BR03 dosya silinememe değil: burada remove ve fiziksel silme başarılı; sonraki asenkron commit kaydı yeniden yaratıyor.
- **Kanıt:** probe.cjs / BR-READING-REMOVAL-RESURRECTION. Önceki kapsamla hedefli karşılaştırma yapıldı; geçmiş1000yeniden koşulmadı.

<a id="r815-b22"></a>

### R815-B22 · P2 — Tam sayfa yakalama uzun sayfaları sessizce 30.000 CSS piksele kesiyor (BR05)

- **Konum:** `src/main.js:9207`, `src/main.js:9222`.
- **Tekrar:** LayoutMetrics için width1000/height45000 dönen belge üzerinde Tam sayfa ekran görüntüsü iste.
- **Gözlenen:** Page.captureScreenshot clip.height30000 oldu; alt15000CSSpx yok, işlem hatasız devam etti.
- **Beklenen:** Tam belge veya açık eksik-yakalama/hata bildirimi gerekli.
- **Çağrı zinciri:** Komut paleti capture-full-page→captureBrowserPageMode→browser:capturePage→captureBrowserFullPage.
- **Etki:** Uzun makale/transkript/arşivin üçte biri dışa aktarımda sessiz kayboluyor.
- **Karşı kontrol/sınır:** 45milyon piksel örneği120milyon güvenli bütçenin altında. Sorun sınır olması değil, clampın başarı diye sunulması.
- **Kanıt:** probe.cjs / BR-CAPTURE-FULL-TRUNCATION. Önceki kapsamla hedefli karşılaştırma yapıldı; geçmiş1000yeniden koşulmadı.

<a id="r815-b23"></a>

### R815-B23 · P2 — Eşzamanlı video yakalamaları kontrol çubuğunu kalıcı gizli bırakıyor (BR06)

- **Konum:** `src/main.js:9238`, `src/main.js:9268`, `src/renderer/renderer.js:20598`.
- **Tekrar:** İki video/video-captions capture isteğini ilkinin wc.capturePage promisei bitmeden başlat; sırayla tamamla.
- **Gözlenen:** Başlangıç visibility boştu; iki finally sonrasında ytp-chrome-bottom visibility:hidden kaldı.
- **Beklenen:** Her operasyon kendi önceki görünürlük listesini restore etmeli veya aynı belge yakalaması seri yürümeli.
- **Çağrı zinciri:** Komut paleti ve OCR captureFrame aynı fonksiyona ulaşır; screenshot helperı/IPC girişinde busy veya mutex yok.
- **Etki:** Video oynatma, seek, tam ekran kontrolleri sayfa yenilenene kadar görünmez olabilir.
- **Karşı kontrol/sınır:** Orijinal hideScript/restoreScript gerçek JSDOM DOM üzerinde çalıştı; ortak __whisperCaptureHidden ikinci operasyon tarafından eziliyor.
- **Kanıt:** probe.cjs / BR-CAPTURE-OVERLAP-HIDDEN. Önceki kapsamla hedefli karşılaştırma yapıldı; geçmiş1000yeniden koşulmadı.

<a id="r815-b24"></a>

### R815-B24 · P2 — Kısmen ekran dışında kalan videonun temiz karesine komşu sayfa içeriği ekleniyor (BR07)

- **Konum:** `src/main.js:9254`, `src/main.js:9258`.
- **Tekrar:** Videoyu sola100/yukarı80CSSpx taşmış durumda yakala; bounds(-100,-80,640,360), zoom1.
- **Gözlenen:** Kırpma(0,0,640,360); doğru görünür kesişim(0,0,540,280) olmalı. Sağdan100/alttan80 komşu içerik dahil.
- **Beklenen:** Rectangle viewport ile video sınırlarının gerçek kesişimi olmalı.
- **Çağrı zinciri:** Video karesi kaydet/panoya kopyala ve OCR kare al→captureBrowserVideoFrame.
- **Etki:** Temiz video dışa aktarımı/OCR yanlış görsel alan ve site metni içerir.
- **Karşı kontrol/sınır:** Pozitif koordinatta zaten sınır clampı var; burada eksik olan negatif sol/üst kısmın genişlik/yükseklikten düşülmesi. Native piksel doğrulaması yapılmadı; orijinal wc.capturePage argümanı kanıtlandı.
- **Kanıt:** probe.cjs / BR-CAPTURE-NEGATIVE-BOUNDS. Önceki kapsamla hedefli karşılaştırma yapıldı; geçmiş1000yeniden koşulmadı.

<a id="r815-b25"></a>

### R815-B25 · P2 — Başarısız atlama aralığı yazımı bellekte uygulanıyor ve sonraki kayıtta diske sızıyor (BR08)

- **Konum:** `src/browser-feature-services.js:381`, `src/browser-feature-services.js:391`, `src/browser-feature-services.js:40`.
- **Tekrar:** skip-save(idfailed-save,autoskiptrue) için writeFileSync EACCES ver; skip-list yap; IO normale dönünce bağımsız good-save ekle.
- **Gözlenen:** İlk API ok:false; skip-list failed-save içerdi; sonraki başarılı kayıtta diskte failed-save+good-save var.
- **Beklenen:** Başarısız yazma belleği geri almalı; kullanıcıya başarısız denen mutasyon sonradan uygulanmamalı.
- **Çağrı zinciri:** browser:extras skip-save/skip-delete önce data().records mutasyonu sonra save(); catch yalnız hata dönüşü.
- **Etki:** Kullanıcının kaydedilmediğini düşündüğü aralık videoyu otomatik atlatabilir; yeniden açılışta beklenmedik kayıt kalır.
- **Karşı kontrol/sınır:** Sadece fixture IO enjeksiyonu; gerçek izin değiştirilmedi. BrowserSeriesContext ayrı copy-on-write kullanıyor; bulgu ona genellenmedi.
- **Kanıt:** features-probe.cjs / BR-SKIP-FAILED-SAVE-APPLIES. Önceki kapsamla hedefli karşılaştırma yapıldı; geçmiş1000yeniden koşulmadı.

<a id="r815-b26"></a>

### R815-B26 · P1 — Ana belgedeki değişmiş checkbox ve geçerli contenteditable taslakları kapatma/boşaltmada korunmuyor (BR09)

- **Konum:** `src/main.js:16058`, `src/main.js:16064`, `src/main.js:16069`.
- **Tekrar:** Başlangıç unchecked checkboxı checked yap ve <div contenteditable> içinde kaydedilmemiş yazı bırak; runtime ölç ve unload kararı al.
- **Gözlenen:** stateKnown:true,formOrLogin:false,dirtyDraft:false; allowed:true.
- **Beklenen:** Değişmiş onay/seçim ve gerçek düzenlenebilir taslak kullanıcı onayı olmadan kaybolmamalı.
- **Çağrı zinciri:** browserTabRuntimeState hem browser:tab:close hem unloadBrowserTab tarafından kullanılır; close wc.close(waitForBeforeUnload:false).
- **Etki:** Form seçimleri ve yazılı taslak onaysız kaybolabilir.
- **Karşı kontrol/sınır:** Top textarea positivecountercheck korumayı tetikliyor. checkbox/radio/file tamamen atlanıyor; [contenteditable="true"] yalnız exactattribute yakalıyor, boşattr/plaintext-only desteklenmiyor. Bu tür seçimi açıkları TEK bulguya toplandı. R83 B83-02 ters yöndeki falsepositiveydi.
- **Kanıt:** runtime-probe.cjs / BR-UNLOAD-CHECKBOX-FILE-EDITABLE. Önceki kapsamla hedefli karşılaştırma yapıldı; geçmiş1000yeniden koşulmadı.

<a id="r815-b27"></a>

### R815-B27 · P1 — Iframe ve shadow DOM içindeki kaydedilmemiş form/taslaklar güvenli boşaltma taramasına girmiyor (BR10)

- **Konum:** `src/main.js:16052`, `src/main.js:16056`, `src/main.js:16103`.
- **Tekrar:** Sameorigin iframe textarea içine kullanıcı metni yaz; open shadowroot içine contenteditabletrue taslağı ekle; runtime ölç.
- **Gözlenen:** Topdocument querySelectorAll ikisini de görmedi; stateKnown:true ve unload allowed:true.
- **Beklenen:** Alt belge/komponent kapsamı ölçülmeli; ölçülemeyen düzenleme alanı güvenli diye kabul edilmemeli.
- **Çağrı zinciri:** Aynı çalışma durumu probu unload ve tabclose korumasının yetkili kaynağı.
- **Etki:** Gömülü formlar/modern webcomponent editörleri kapama veya bellekten boşaltmada onaysız veri kaybeder.
- **Karşı kontrol/sınır:** BR09 başka kök: burada desteklenen textarea/contenteditabletrue türleri kullanıldı; yalnız belge/ağaç sınırı görünmez. Sameorigin fixture, çaprazorigin erişim varsayılmadı.
- **Kanıt:** runtime-probe.cjs / BR-UNLOAD-CHILD-DOM. Önceki kapsamla hedefli karşılaştırma yapıldı; geçmiş1000yeniden koşulmadı.

<a id="r815-b28"></a>

### R815-B28 · P2 — Videonun sağtık menüsündeki Döngü/Oynat eylemi sağtıklanan medya yerine en büyük medyaya gidiyor (BR11)

- **Konum:** `src/main.js:6112`, `src/main.js:6141`, `src/renderer/renderer.js:14503`.
- **Tekrar:** İki duraklatılmış görünür video aç (küçük200px/büyük800px); küçük video üzerinde nativecontextmenu Loop seç.
- **Gözlenen:** Menu bridge yalnız key:media-loop gönderdi, srcURL/koordinat/hedef yok. Orijinal controller scriptinde küçük.loopfalse,büyük.looptrue oldu.
- **Beklenen:** Bağlam menüsü eylemi kullanıcının sağtıklayıp açtığı öğeye uygulanmalı.
- **Çağrı zinciri:** installBrowserContextMenu→browser-shortcut→renderer browserCommand→bestmedia seçimi.
- **Etki:** Kullanıcı yanlış videoyu oynatır/döngüye alır/PiP açar; çok videolu sitelerde kontrol belirsizleşir.
- **Karşı kontrol/sınır:** Global player toolbarı için enbüyük video seçimi geçerli olabilir; bu bulgu yalnız öğeye özel contextmenu. Gerçek menuitem model ve controller scripti dinamik çalıştırıldı.
- **Kanıt:** runtime-probe.cjs / BR-CONTEXT-MENU-WRONG-MEDIA. Önceki kapsamla hedefli karşılaştırma yapıldı; geçmiş1000yeniden koşulmadı.

<a id="r815-b29"></a>

### R815-B29 · P1 — Dışa aktarma uzantı ekleyince kullanıcı tarafından seçilmemiş mevcut hedefin üzerine yazabiliyor (BR12)

- **Konum:** `src/main.js:17620`, `src/main.js:9328`, `src/main.js:9306`, `src/main.js:17854`.
- **Tekrar:** SaveDialog filePath olarak chosen-name.txt dönsün; chosen-name.txt.pdf önceden sentinel içersin; PDF kaydını tamamla.
- **Gözlenen:** Seçilen hedefchosen-name.txt iken actualchosen-name.txt.pdf üzerine NEW PDF yazıldı; API ok:true.
- **Beklenen:** Nihai hedef diyalog/overwrite izninin gösterdiği hedef olmalı veya değişince ayrıca varlık/üzerineyazma onayı alınmalı.
- **Çağrı zinciri:** saveBrowserPagePdf,saveBrowserPageArchive,saveBrowserPageCapture,subtitleexport uzantı ekleme kalıbı; tek ortak rootpattern.
- **Etki:** Ayrı mevcut PDF/PNG/MHTML/altyazı dosyasının kullanıcı seçmeden üzerine yazılması.
- **Karşı kontrol/sınır:** Finaltarget için ayrıca fs.exists/overwriteconfirm kapısı yok. Native Windows diyalogunun özel dosyaadını döndürmesi bu tur UI ile denenmedi; APIresult kontratı kontrollü döndürüldü. Gerçek disk sentinel overwrite doğrulandı.
- **Kanıt:** ipc-probe.cjs / BR-EXPORT-SUFFIX-OVERWRITE. Önceki kapsamla hedefli karşılaştırma yapıldı; geçmiş1000yeniden koşulmadı.

<a id="r815-b30"></a>

### R815-B30 · P1 — Sekme kapanışında ilk form kontrolünden sonra capture drain beklerken yazılan taslak son kontrolden geçmiyor (BR13)

- **Konum:** `src/main.js:15492`, `src/main.js:15507`, `src/main.js:15529`.
- **Tekrar:** Boş aktifsekme close başlat; ilk runtime kontrolü false dönsün; drainBrowserCaptureBeforeClose beklerken kullanıcı taslak yazsın; drain tamamla.
- **Gözlenen:** runtime ölçümü1kez; typedAfterInitialChecktrue, destroyBrowserTab çalıştı, APIok:true.
- **Beklenen:** Asenkron kapanış hazırlığı biterken form/draft/job koruması yeniden doğrulanmalı.
- **Çağrı zinciri:** browser:tab:close queuedtransition; runtime kontrolü drain öncesi; destroy sonrası check yok.
- **Etki:** Kapanış düğmesinden sonra sayfada devam eden kullanıcı girdisi onaysız silinir.
- **Karşı kontrol/sınır:** unloadBrowserTab aynı sınırda ikinci runtime/finalCheck yapıyor; bugclosea özgü. Queue sekme geçişini seri kılar, sayfaDOM kullanıcı/script olaylarını kilitlemez.
- **Kanıt:** ipc-probe.cjs / BR-CLOSE-LATE-DRAFT-LOSS. Önceki kapsamla hedefli karşılaştırma yapıldı; geçmiş1000yeniden koşulmadı.

<a id="r815-b31"></a>

### R815-B31 · P2 — Harici oynatıcı native başlatma hatası yutulurken API başarı döndürüyor (BR14)

- **Konum:** `src/main.js:17474`, `src/main.js:17476`, `src/main.js:17478`.
- **Tekrar:** Çözülen mpv/VLC yolunu spawn et; child asenkron error(EACCES/ENOENT/ENOEXEC) yayımlasın.
- **Gözlenen:** Handler önce ok:true döndü; child error listener boş; kullanıcıya başarısızlık bildirimi yok.
- **Beklenen:** Başarı child spawn olayından sonra, hata error olayından sonram oluşmalı.
- **Çağrı zinciri:** player:external IPC→resolveExternalPlayerPath→spawn; renderer dışoynatıcı eylemi.
- **Etki:** Kurulu ama çalışmayan/izin engelli/çözümdensonrasilinmiş oynatıcıda işlem açıldı sanılır; tanı ve kurtarma kaybolur.
- **Karşı kontrol/sınır:** Eksik executable için erken exists kontrolü var; bulgu native spawnın daha sonra bildirdiği hataya özgü. Gerçek kişisel oynatıcı çalıştırılmadı/bozulmadı.
- **Kanıt:** ipc-probe.cjs / BR-EXTERNAL-PLAYER-FALSE-SUCCESS. Önceki kapsamla hedefli karşılaştırma yapıldı; geçmiş1000yeniden koşulmadı.

<a id="r815-b32"></a>

### R815-B32 · P2 — Kalıcı anlamsal worker düzeltmesi caller her istekte yeni factory kurduğu için tekrar model süreci yaratıyor (BR15)

- **Konum:** `src/browser-feature-services.js:172`, `src/browser-feature-services.js:345`, `src/browser-media-tools.js:113`, `src/browser-media-tools.js:206`, `backend/browser_media_tools.py:88`.
- **Tekrar:** Aynı tab/serviste iki ardışık semantic-search çağır; orijinal media-tools factory içinde spawnları say.
- **Gözlenen:** İki başarılı arama2ayrıworker spawnladı; herfactory kendi worker/10dakikaidletimerına sahip.
- **Beklenen:** Sonraki arama aynı servisin hazır semantik işçisini kullanmalı.
- **Çağrı zinciri:** browser:extras semantic-search→tools()→createBrowserMediaTools→pythonServe→ensureWorker.
- **Etki:** Her arama yeni Python/SentenceTransformer yüklemesi ve10dakika gereksiz eşzamanlı süreç tutma maliyeti yaratır.
- **Karşı kontrol/sınır:** ÖNCEKİ BİLİNEN: R85 P79-04; R162 modüldeki kalıcıworkerı temiz saymış fakat callerı doğrulamamış. Yeni keşif diye sayılmamalı; yeni dinamik entegrekanıtla güncel açıktekrar. Gerçek modelMB/süre ölçülmedi; büyüklük iddiası yok.
- **Kanıt:** features-probe.cjs / BR-SEMANTIC-WORKER-NO-REUSE. **Önceki bilinen açık:** R85 P79-04; yeni keşif diye sayılmadı.

## Eklenen backend, çeviri ve ses bulguları

<a id="r815-b33"></a>

### R815-B33 · P1 — Başka hedef dilde çeviri önceki çift dilli dosyayı eziyor (BE01)

Konum: `backend/transcribe.py:166` (translation_output_labels; variant yoksa dual stem hedef dili içermez), `:9353` (translate_existing_subtitle dual_path), normal transkripsiyonda aynı yol `:8355`.

Tekrar: aynı `dual-source.en.srt` için dual_subtitle açık önce TR, sonra DE çevirisi üret. İki işlem gerçek translate_existing_subtitle/yazıcı/OutputTransaction yolunu kullanır; yalnız sağlayıcı cevabı kontrollüdür. Gözlem: `dual-source.tr.srt` ve `.de.srt` ayrı korunurken her iki çift dilli çıktı `dual-source.dual.srt`; ilk `Rapor hazır.` ikinci çalışmadan sonra `Der Bericht ist fertig.` olur. Beklenen: her hedef dil/qualifier için ayrı çift dilli çıktı veya açık üzerine-yazma kararı. Etki: önceden oluşturulmuş hedef-dil dual çıktısı sessiz kaybolur. Kök: dual dosya kimliğinden hedef dilin düşmesi; genel yazıcı veya API hatası değil.

<a id="r815-b34"></a>

### R815-B34 · P1 — Auto kaynakta Türkçe açılış, kalan İngilizce konuşmayı çevrilmiş gibi tamamlıyor (BE02)

Konum: `backend/transcribe.py:3911–3925` (ilk40satır çoğunluk sezgisi), `:9090–9096`, `:9135` civarı same_language kolu; speech ön işleminde rolling tekilleştirme kapalı `:8942`.

Tekrar:100cue; ilk40 `Bu iş için şimdi hazırız.`, kalan60 `We need to finish this important report.`; translate_for_speech=True, language=auto, target=tr. Gerçek dosya çeviri akışı. Gözlem:0sağlayıcı çağrısı, çıktı60İngilizce cue içeriyor; output status=complete, failed=0. Aynı girdiye açık language=en negatif kontrolü1sağlayıcı çağrısı yapar. Beklenen: Türkçe satırlar korunurken İngilizce satırlar çevrilir veya karma dil işi tam çeviri kabul edilmez. Etki: dublaj hazırlığı İngilizce kalan çoğunluğu tamamlanmış Türkçe sayabilir. Kök: dosyanın ilk40satırına ait çoğunluk sinyalinin tüm dosya için kesin aynı-dil atlaması olması.

<a id="r815-b35"></a>

### R815-B35 · P2 — ASS vektör çizim koordinatları gerçek çeviri girdisi oluyor (BE03)

Konum: `backend/transcribe.py:9730–9762`, özellikle `:9761` tüm override etiketlerini siler ama `\p1` çizim durumunu izlemez; `:8916` parse_subtitle_entries → translate_existing_subtitle.

Tekrar: geçerli [Events] Dialogue `{\p1}m 0 0 l 100 0 100 100{\p0}` ve sonraki `Hello there.`. Gözlem: gerçek translate_existing_subtitle sağlayıcı sınırı iki giriş görür; ilki `m 0 0 l 100 0 100 100`. Beklenen: çizim komutları çeviri/konuşma metni sayılmaz; metin moduna dönüş sonrası gerçek yazı varsa yalnız o korunur. Etki: çizim koordinatlarına ücretli çeviri, saçma metin/konuşma ve yanlış cue sayısı. Kök: ASS çizim durumunun backend ayrıştırıcıda yokluğu. Browser ASS desteği bunu savunmaz.

<a id="r815-b36"></a>

### R815-B36 · P2 — SRT gövdesindeki zaman aralığı dublajda hayalet cue ve kimlik kayması üretiyor (BE04)

Konum: `tools/voxcpm2/dub_plan.py:15`, `:76–106`; çağıran gerçek plan `:194` ve `src/dub-service.js:261`.

Tekrar:1.cue gövdesi `Use this interval:\n00:00:02,000 --> 00:00:03,000\nfor the title.`, 2.cue normal. Gözlem: backend parse_subtitle_entries doğru2cue ve literal zaman metnini korur; gerçek D.plan(grouping=satir)3grup döndürür. İlk metin `Use this interval:`, hayalet grup2 `for the title.`(2–3sn), gerçek cue2 artık source_id3. Beklenen: gövde zaman metni yeni başlık sayılmaz; kaynak2cue ve kimlik korunur. Etki: zaman metni okunmaz, devamı yanlış aralığa yerleşir, sonraki düzeltme/prosody source_ids kayar. Kök: dublaj parser'ı her TIME_RE eşleşmesini cue sayıyor; backend separator/identifier kontrolü burada yok.

<a id="r815-b37"></a>

### R815-B37 · P2 — ASR'de yalın özel ad değişimi passed/ready kalıyor (BE05)

Konum: `tools/voxcpm2/dub_quality.py:204–214` yalnız hemen apostrof izlenen adları seçer; `:224` generation_status. Gerçek `tools/voxcpm2/altyazi_oku.py:93–139` SpeechVerifier.check ve `:445` durum çağrısı.

Tekrar: uzun, aynı Türkçe bağlam ardından beklenen `Mehmet toplantıya katıldı.`, kontrollü ASR `Ahmet toplantıya katıldı.`. Gerçek SpeechVerifier.check sınıfı AST ile engine yüklemeden çalıştırıldı; stdin/stdout kontrollü subprocess cevabı. Gözlem: similarity=.9444, missing_names=[], review=False, verifier.status=passed, generation_status(0,...)=ready. Aynı metin kontrolü passed; olumsuzluk ters çevirme kontrolü review. Beklenen: açıkça değişen yalın kişi adı review; adın Türkçe ek/apostrof almaması korumayı düşürmemeli. Etki: yanlış kişiyi söyleyen kayıt güvenilir hazır diye gösterilir ve cache'de saklanabilir. Kök: ad çıkarma regex'inin yalnız apostroflu isimlere uygulanması. Bu canlı TTS'nin isim değiştirdiği iddiası değil; gerçek doğrulayıcının kontrollü yanlış-ASR'yi kabul kanıtıdır.

<a id="r815-b38"></a>

### R815-B38 · P2 — Aynı sayıların kişiler arasında takası ASR miktar kapısından geçiyor (BE06)

Konum: `tools/voxcpm2/dub_quality.py:79–87` (Counter miktarları sıra/özne bağından koparır), `:175–186` (sayı-birim eşlemesi yalnız bilinen fiziksel birimlerde), `:214–224`; aynı SpeechVerifier.check→generation_status üretim zinciri.

Tekrar: aynı uzun Türkçe bağlam ardından beklenen `Ali beş, Ayşe on kitap aldı.`, ASR `Ali on, Ayşe beş kitap aldı.`. Gözlem: similarity=.9048; spoken_number_mismatch=False, semantic_mismatch=False, review=False; gerçek verifier passed ve generation ready. `Ayşe on`dan `on` tamamen çıkarılan negatif kontrolü review=True. Beklenen: miktarların sahipliği değiştiğinde review. Etki: aynı miktarlar anılsa da yanlış kişiye/adrese bağlanan konuşma hazır sayılır. Kök: sayıları ve birimleri çoklu küme olarak kontrol edip ilişkisel sıralamayı göz ardı etme; BE05 özel-ad regex'inden bağımsızdır. Model/akustik başarı iddiası yok.

<a id="r815-b39"></a>

### R815-B39 · P2 — Literal WebVTT etiketi yeniden dışa aktarımda gerçek stile dönüşüyor (BE07)

Konum: `backend/transcribe.py:9715` civarı _VTT_CHARREF çözümü; `:1964–1986` izinli HTML/VTT etiketlerini koruyan vtt_escape_cue_text.

Tekrar: `literal-tags.vtt` gövdesi `Type &lt;b&gt;hello&lt;/b&gt; to enter the tag.`; gerçek translate_existing_subtitle language=en,target=en,formats=vtt. Gözlem:0sağlayıcı çağrısıyla çıktı `Type <b>hello</b> to enter the tag.`. Beklenen: ekranda görünen `<b>`/`</b>` literal metni korunur; parse→write işlemi bunu kalın stil koduna çevirmemeli. Etki: kod/işaret anlatan altyazıdaki gerçek içerik kaybolur. Kök: karakter referansları çözülünce literal '<' ile gerçek başlangıç etiketinin kökeninin kaybolması. BE08'in timestamp tanımama kökünden farklı.

<a id="r815-b40"></a>

### R815-B40 · P2 — WebVTT inline zaman etiketi çeviriye konuşma, çıktıya görünen metin olarak taşınıyor (BE08)

Konum: `backend/transcribe.py:9641–9727` parse_srt(vtt=True), `:1964–1986` kaçış, `:8916` gerçek hazır-altyazı yolu.

Tekrar: geçerli VTT cue `Hello <00:00:02.000>world.` (1–4sn). Gözlem: gerçek TR çeviri sağlayıcı girişinde `Hello <00:00:02.000>world.`; aynı-dil VTT yazımında `Hello &lt;00:00:02.000>world.`. Beklenen: inline zaman kontrolü konuşma düz metni değildir; metin `Hello world.` korunmalı, destekleniyorsa timing metadata olarak kalmalı. Etki: karaoke/YouTube VTT'deki kontrol zamanları kullanıcıya görünür, modele/dublaj girdisine sızar. Kök: VTT timestamp token'ının parse edilmemesi; literal entity etiketiyle ilgili BE07'den farklı giriş ve düzeltme gerekir.

<a id="r815-b41"></a>

### R815-B41 · P1 — Kullanıcı sahne notu değişince eski çeviri fuzzy hafızadan geri geliyor (BE09)

Konum: `backend/transcribe.py:4231–4250` tm_scope_identity, `:4300–4305` tm_context, `:4420` TM fallback; exact cache ise sahne notunu doğru içerir `:3719–3720`.

Tekrar: gerçek llm_translate kontrollü OpenAI ile `The bank is very close.` ve aynı cache/input. İlk scene_context={'location':'financial district'}→1istek ve `Banka çok yakın.`. Sonra scene_context={'location':'river bank'} ve sağlayıcı yeni cevap `Nehir kıyısı çok yakın.` verecek. Gözlem: exact cache key farklı olduğu halde ikinci iş0istek yapıp `Banka çok yakın.` getirir. Cache kapalı negatif kontrolü1istek yapıp `Nehir kıyısı çok yakın.` alır. Beklenen: açık kullanıcı bağlamı değiştiğinde önceki bağlamın çevirisi otomatik yeniden kullanılmaz. Etki: kullanıcı sahne bağlamını düzelttiği halde aynı yanlış anlam geri gelir; kullanıcı değişikliğinin etkisiz görünmesi. Kök: exact cache ayrıştırılmışken ikinci katman TM scope/context'in scene_context'i içermemesi. BE02'nin dil atlama yolundan bağımsızdır.

<a id="r815-b42"></a>

### R815-B42 · P2 — Checkpoint'ten devamda korunmuş eski cue'lar konuşmacı kimliğini kaybediyor (BE10)

Konum: `backend/transcribe.py:7582–7584` resume sesini son sınırdan kırpar; `:7933` eski cue'ları birleştirir; `:8075–8084` diarization yalnız kırpılmış WAV üzerinde çalışır; `:8125` civarı assign_speakers bütün cue'lara yalnız bu suffix span'lerini uygular. Checkpoint `:7291` konuşmacı span'lerini saklamaz.

Tekrar:12sn kontrollü yerel WAV için geçerli checkpoint cue'ları0–2,3–5,8–10sn, last_time10. Diarize=True ve resume=True ile gerçek T.transcribe çağrısı; Whisper/diarization sağlayıcıları kontrollü, tüm ön/son işleme ve gerçek JSON yazıcı çalışır. Gözlem: extract_audio clip_start8; sonuç eski0–2 ve3–5cue speaker=null, yeni8–10 ve10–12cue SPEAKER_00, done.warnings=[]; diarization başarılı mesajı vardır. Resume kapalı kontrolünde üretilen tüm cue'lara SPEAKER_00 atanır. Beklenen: devam edilen işin önceki bölümleri de konuşmacı analizi kapsamına alınır veya atlanan kapsam açıkça uyarılır; tam dosyanın konuşmacı ayrımı tamamlanmış gibi sessiz bırakılmaz. Etki: uzun dosyada kesinti sonrası çoğu konuşmacı ayrımı kaybolur, sonraki konuşma kimlikleri farklı ses bölümünde sıfırdan oluştuğu için yeniden adlandırma bağlamı da tutarlı değildir. Kök: ham checkpoint cue'larını geri birleştirirken downstream diarization'a tam ses bağlamını geri getirmeme.

Ek tekrar: `& backend/venv/Scripts/python.exe .tmp/deep815-backend/resume-probe.py`; kanıt `resume-observations.json`. Kontrollü CPU/model sağlayıcıları kullanıldı; gerçek GPU/pyannote başarısı iddia edilmez. Toplam bu ekle **10 bağımsız kök**; üstteki9sayısı bu ek öncesi alt turdur.

## Eklenen asistan ve kütüphane bulguları

<a id="r815-b43"></a>

### R815-B43 · P2 — Kişisel puan 10'luk ve 5'lik ölçeklerde farklı yorumlanıyor (A01)

Kaynak: `src/renderer/media-title.js:70–71`, `src/media-taste.js:14–16`, `src/media-discovery-service.js:25–27`; kalıcılık `src/media-catalog-store.js:23–31`.

Adımlar: Gerçek yapım panelinde açıkça 0–10 etiketli kişisel puana 4 girip kaydet; aynı yapımla eşleşen içe aktarılmış izleme günlüğünün zevk profilini ve Sana özel öneri tohumunu incele. Beklenen: 4/10, 2/5 olarak değerlendirilerek düşük puan niteliğini korumalı. Gözlenen: Kayıtlı 4 değeri 4/5 kabul ediliyor ve 3,5 eşiğini aşan olumlu öneri tohumu oluyor. 8/10 kaydedildiğinde effective() 5 üzerini reddedip eski günlük puanı 1/5'e sessizce dönüyor. Etki: Kullanıcının açık puanı zevk ve öneri sonuçlarında anlam değiştiriyor veya kayboluyor. Bunlar tek ölçek sözleşmesi hatasıdır. Prob gerçek başlık kaydetme callback'ini ve itemOf/profile/recommendationSeeds kodunu çalıştırdı; bozuk girdi kullanılmadı.

<a id="r815-b44"></a>

### R815-B44 · P2 — Kapatılan Keşfet ayrıntısı, geç gelen ekleme yanıtıyla kütüphaneyi açıyor (A02)

Kaynak: `src/renderer/media-discovery-ui.js:65–72`.

Adımlar: İzleneceklere ekle'ye bas; IPC beklerken ayrıntıyı kapatıp başka yere geç; ekleme yanıtını tamamlat. Beklenen: Başlatılmış kayıt tamamlanabilir fakat kapatılmış ayrıntı yeniden gezinme başlatmamalı. Gözlenen: Eski dialog kaldırıldıktan sonra koşulsuz MediaTitleUI.open('catalogA') çağrılıyor. Etki: Kullanıcının sonraki ekranı ve bağlamı kesiliyor. Gerçek ayrıntı düğmesi callback'i sınandı. A04/A13'ten bağımsız Keşfet bileşenidir; ortak bir sahiplik koruma helper'ı yoktur.

<a id="r815-b45"></a>

### R815-B45 · P2 — Keşfet Tercihlerindeki yapım türü filtresi çalışmıyor (A03)

Kaynak: `src/renderer/media-discovery-ui.js:120,148`; `src/media-discovery-service.js:98` feedback-list.

Adımlar: Bir film ve bir dizi tercihi kaydet; Tercihler → Filmler seç. Beklenen: Yalnız film tercihleri gösterilmeli. Gözlenen: Üretim handler'ı kind:'film' isteğine rağmen hem dizi hem film döndürüyor; UI ek tür filtresi uygulamıyor. Etki: Özellikle büyük tercih listelerinde seçilen filtreyle uyuşmayan sonuçlar gösteriliyor. Geçerli kayıtlar ve gerçek IPC handler'ı kullanıldı; ağ gerekmedi.

<a id="r815-b46"></a>

### R815-B46 · P2 — Bu akşam bölümünün geç oynatma yanıtı yeni açılan başka pencereyi kapatıyor (A04)

Kaynak: `src/renderer/media-tools-ui.js:13,37–44`.

Adımlar: Bu akşam → Aç ve oynat; oynatma IPC'si beklerken pencereyi kapat; Dinleme'yi aç; eski yanıtı döndür. Beklenen: Kapatılmış Bu akşam isteği yeni pencereyi kapatmamalı veya eski kaynağı oynatmamalı. Gözlenen: close() küresel güncel modalı hedefleyip Dinleme'yi kapatıyor; ardından openMediaCatalogPlayback eski dosyayı açıyor. Tam üretim modülü sınandı. Başlangıç listesindeki epoch koruması oynatma yanıtına uygulanmıyor.

<a id="r815-b47"></a>

### R815-B47 · P1 — Sohbet silme onayı başka sohbete yönleniyor (A05)

Kaynak: `src/renderer/assistant-overlay.js:22,45,84–90,179`; `src/renderer/global-assistant.js:111`; `src/renderer/assistant-workspace.js:75–82,95`.

Adımlar: A sohbetinde Sohbeti sil onayını aç; onaylamadan mevcut B sohbetine geç; Devam et'e bas. Beklenen: Onay geçersizleşmeli veya A kimliğine bağlı kalmalı. Gözlenen: Onay alanı açık kalıyor; onay paketi güncel sourceToken='source|thread:B' ile delete-thread gönderiyor; workspace komutu current() olan B'yi siliyor. Aynı kök neden Temizle'yi de etkiliyor; ayrı sayılmadı. Etki: İlgisiz sohbetin kalıcı kaybı. Gerçek overlay HTML+JS tekrarı gönderilen paketi doğruladı; güncel sohbeti silen kod yolu ayrıca incelendi. İş çalışmadığından sohbet seçimi etkin; aynı kaynağın sohbetleri arasında öneriler değişmediği için öneri yenilemesi bu onayı temizlemiyor.

<a id="r815-b48"></a>

### R815-B48 · P2 — Ana süreç doğrulama eki uygulamanın JSON yorum analizi akışını bozuyor (A06)

Kaynak: `src/assistant-agent-service.js:159` son doğrulama regex'i/eki; `src/renderer/media-taste-ui.js:63–76`.

Adımlar: Zevk profili → Örneği incele ve AI ile analiz et → Gönder. Geçerli sağlayıcı JSON'unun özeti 'A completed story with moving characters.' içerir. Beklenen: Yapılandırılmış JSON, inceleme ve alıntı doğrulaması için ayrıştırılabilir kalmalı. Gözlenen: Ana süreç özette /completed/ eşleştiğinden JSON sonuna düz metin ekliyor; gerçek tüketicide JSON.parse başarısız oluyor, yanıtın geçerli JSON olmadığı mesajı gösteriliyor ve kaydetme sunulmuyor. Prob gerçek agentRun'ı kontrollü geçerli sağlayıcı yanıtıyla çalıştırdı; ardından gerçek zevk profili reviewSample/gönderme/assistant-answer tüketicisindeki reddi doğruladı. Bu yalnız kullanıcının rastgele JSON istemesi değildir: Uygulamanın yerleşik akışı JSON'u açıkça istiyor ve ayrıştırıcıya bağlı. Araç veya işlem istenmedi, uygulanmadı.

<a id="r815-b49"></a>

### R815-B49 · P2 — Sabitlenen notlar ilgisiz normal web sayfaları arasında karışıyor (A07)

Kaynak: `src/renderer/global-assistant.js:26`; `src/renderer/assistant-overlay.js:34–38,141`.

Adımlar: Medya içermeyen A makalesinde metin sabitle; aynı boş mediaKey'e sahip ilgisiz B makalesine geç; Sabitlenen'i aç. Beklenen: Sohbetlerde olduğu gibi sayfaya özel notlar ayrılmalı. Gözlenen: pinScope pageKey'i kullanmıyor; [browser,mediaKey] iki sayfada da '["browser",""]' oluyor. Overlay filter/isPinned/unpin aynı anahtarı kullandığından A'nın arşiv notları B'de görünüyor ve aynı metinli sabitlemeler çakışıyor. Prob iki normal sayfada üretimdeki ifadenin aynısını çalıştırdı. R542 sohbet anahtarını ve geç sonuçların sayfa kimliğini düzeltmişti; açık kalan pinScope yolu ayrı bulgudur. Eski sohbet hatasının tekrar keşfi sayılmadı.

<a id="r815-b50"></a>

### R815-B50 · P2 — Onaylanan altyazı işlemi yeni izin aynı konumsal U kimliğine kayıyor (A08)

Kaynak: `src/renderer/assistant-workspace.js:99–107`; `src/renderer/assistant-app-actions.js:18–21,74–95`; `src/assistant-context-manifest.js:12` same(); `src/renderer/renderer.js:22376–22402` loadSubtitle.

Adımlar: Eski izin U0 satırından 10. saniyeye gitme/düzenleyici kartı iste; aynı videoda başka altyazı dosyası yükle ve yeni U0'ın zamanı 120 olsun; eski kartı uygula. Beklenen: Bayat kart reddedilmeli veya özgün kesin satıra bağlı kalmalı. Gözlenen: same/kaynak kapsamı iz ve satır kimliğini içermediğinden sahip hâlâ güncel kabul ediliyor; execute source_id'yi yeni toolContext içinde çözüp 120'ye gidiyor. Tam AppActions+Capabilities modülü sınandı. loadSubtitle satırları/yolu değiştirirken generation artırmıyor; generation video açılışında artırılıyor. Aynı kök neden open_subtitle_editor'ı da yanlış satıra götürebilir; ayrı sayılmadı. Geçerli altyazı değişimi kullanıldı.

<a id="r815-b51"></a>

### R815-B51 · P2 — Zevk tercihlerini kaydetme yanıtı daha yeni taslağı siliyor (A10)

Kaynak: `src/renderer/media-taste-ui.js:30–34`.

Adımlar: A notunu yazıp Tercihleri kaydet'e bas; kayıt beklerken etkin kalan alana yeni B notunu yaz; A kaydının yanıtını döndür. Beklenen: B taslağı korunmalı veya bekleyen işlem sırasında düzenleme kapatılmalı. Gözlenen: data.preferences=A atamasından sonra draw() formu değiştiriyor; not A'ya dönüyor ve B kayboluyor. Gerçek modül ve geciktirilmiş geçerli IPC yanıtı sınandı. Etki: Kullanıcının yeni tercih metni ve aralık değişiklikleri atılabiliyor. Sağlayıcı veya kaynak değişimi gerekmiyor.

<a id="r815-b52"></a>

### R815-B52 · P2 — Keşfet tercih hatası etkin ayrıntı penceresinin dışında gösteriliyor (A11)

Kaynak: `src/renderer/media-discovery-ui.js:7–9,15–18,58–63`.

Adımlar: Ayrıntıyı aç; tercih dosyasının yazılamadığı koşulda İlgilenmiyorum'a bas. Beklenen: Hata etkin ayrıntı durum alanında görünmeli ve yeniden deneme anlaşılır olmalı. Gözlenen: Ortak btn hata yakalayıcısı state.root içindeki arka plan .md-status alanına yazıyor; ayrıntının durumu boş kalıyor. Tam modülde ok:false yanıtıyla, etkin dialog'un hata içermediği ve arka planın içerdiği doğrulandı. Etki: Kullanıcı işlem sessizce sonuçsuz kalmış gibi görüyor; arka plan modal açıkken örtülü/inert ve erişilemiyor. A12'nin bağımlılık kapısından farklı hata yönlendirme nedenidir.

<a id="r815-b53"></a>

### R815-B53 · P2 — Yerel kayıtlı Keşfet tercihi çevrimdışıyken geri alınamıyor (A12)

Kaynak: `src/renderer/media-discovery-ui.js:30–40,58–63,108`; `src/media-discovery-service.js:98–109`.

Adımlar: Çevrimdışıyken Tercihler'i aç; yerel feedback-list başarılıdır; gizlenmiş kaydın tercihini geri almak için karta bas. Beklenen: Yerel tercihi geri alma katalog ağına bağlı olmamalı. Gözlenen: Geri alma düğmeleri ancak uzak ayrıntı isteği başarılı olduktan sonra oluşturuluyor; ağ hatasında yalnız Kapat kalıyor. Yerel feedback güncelleme hizmeti ağ gerektirmediğinden bu, yerel geri alınabilir veriye gereksiz ağ bağımlılığıdır. Gerçek liste/kart/ayrıntı UI'ı sınandı; hata sonrası geri alma düğmesi yok. Etki: Kullanıcı gizlenmiş/izlenmiş tercihlerini uzak servis dönene kadar geri alamıyor.

<a id="r815-b54"></a>

### R815-B54 · P2 — Önceki kitabın geciken açılışı son kitap seçiminin üzerine geliyor (A13)

Kaynak: `src/renderer/media-shelf-ui.js:255–265,315,326,402`.

Adımlar: A kitabının book-open IPC'si beklerken B'yi seç; B önce, A sonra dönsün. Beklenen: Son seçim B etkin kalmalı veya eski istek iptal edilmeli. Gözlenen: A yanıtı B'nin üzerinde ikinci modal oluşturuyor; prob pencere sırasını [Newly chosen book,Older delayed book] olarak ölçtü. Tam üretim shelf+queue modülleri ve geçerli TXT fixture'ı kullanıldı; gerçek dosya/profil yok. Etki: Yanlış kitap/kaynak etkinleşiyor ve asistan bağlamı onu izliyor. Okuyucunun mevcut seslendirme korumaları ilk openBook await'ini kapsamıyor.

## Sayıya alınmayanlar ve bağımlılık riski

- Asistan A09: varsayılan zevk ağırlıklarının köken işareti eksik; tüketicide somut yanlış karar gösterilemedi. Kanıt boşluğu olarak kaldı.
- Logo üzerindeki tek ARIA uyarısı düşük etkili olduğundan sayı doldurmak için eklenmedi.
- Model önbelleğinin symlink boyutu probu Windows EPERM ile engellendi; doğrulanmış bug denmedi. RF64 adayında gerçek üretici/çağrı kapsamı ispatlanmadı. AVI/PCM→MP4 karşı kontrolü mevcut FFmpegde geçti; bug listesine girmedi.
- `npm audit --omit=dev --json` **exit 1, 2 high paket kaydı** verdi: Electron 43.5.0+wvcus ve kurulum zincirindeki undici 7.30.0. Toplam 15 GHSA eşleşmesi 54 buga eklenmedi: sürüm eşleşmesi uygulamada 15 sömürülebilir yol kanıtlamaz; undici burada @electron/get zincirindedir. [Ham olmayan npm sonucu](evidence815/deep/dependency-audit.json). Özellikle [Electron eMudhra sertifika mitigasyonu](https://github.com/advisories/GHSA-jr5w-w6x2-84p9), [undici content-encoding hatası](https://github.com/advisories/GHSA-xjj6-f33q-929c) ve [Electron HID/USB origin duyurusu](https://github.com/advisories/GHSA-fw47-9c62-h3vw) birincil duyurularla karşılaştırıldı. Castlabs fork backportları ve bütün uygulama erişilebilirliği bu tur doğrulanmadı; güvenlik açığı düzeltildi/yükseltildi denmez.

Model önbelleği standardı [Hugging Face HF_HUB_CACHE belgesine](https://huggingface.co/docs/huggingface_hub/package_reference/environment_variables#hfhubcache), UI kontrol yaklaşımı [Web Interface Guidelines kaynak kurallarına](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md) dayandırıldı. Harici uygulama kodu/dependency kopyalanmadı.

## Son teslim sınırı

Bu rapor bugları **açık bırakır**. 50 hedefi ürün düzeltme yetkisi değildir. Kaynak dosyaları aynı ürün revizyonunda kalır. Önceden var olan OFFLINE-MANIFEST/raporINDEX değişiklikleri, yerel start.sh silinmesi ve kişisel untracked dosyalar commit dışında korunur. Bu genişletme rapor+kanıt+devir olarak ayrı PR ile master'a teslim edilir; CI sonucu beklenmez veya görülmeden yeşil denmez.
