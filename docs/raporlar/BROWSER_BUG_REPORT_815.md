# Rapor 815 — 126 doğrulanmış bug kaydı, yalnız raporlama

> **Güncel toplam: 126 doğrulanmış bug kaydı (33 P1, 93 P2).** Bu tur farklı alanlarda **8 yeni bağımsız bulgu (2 P1, 6 P2)** eklendi; önceki 118 yeniden sayılmadı. G01–G36 önerileri ayrı. **Hiçbir bug düzeltilmedi.** Önceki kayıtların tarihsel doğrulama revizyonları korunur; hepsi bu tur yeniden sınandı demek değildir.
>
> [Yeni 8 bulgu](#diğer-alanlar-8-yeni-bulgu) · [126 ID/kaynak eşlemesi](evidence815/other/findings.json) · [Kapsam matrisi](evidence815/other/COVERAGE.md) · [Tekrar üretme](evidence815/other/REPRODUCE.md)

> **Önceki tur: 118 doğrulanmış bug (31 P1, 87 P2).** Az kapsanan alanlarda **15 yeni bağımsız bulgu** eklendi (2 P1, 13 P2); önceki 103 yeniden sayılmadı. G01–G34 önerileri ayrı. **Hiçbir bug düzeltilmedi.**
>
> [Yeni alanlar ve 15 bulgu](#az-kapsanan-alanlar-15-yeni-bulgu) · [118 ID/kaynak eşlemesi](evidence815/unseen/findings.json) · [Kapsam matrisi](evidence815/unseen/COVERAGE.md) · [Tekrar üretme](evidence815/unseen/REPRODUCE.md)

> **Önceki tur: 103 doğrulanmış bug (29 P1, 74 P2).** O tur **25 yeni ve bağımsız bulgu** eklendi; önceki 78 tekrar yeni bulgu sayılmadı. Geliştirme önerileri G01–G32 ayrı kalır. **Hiçbir ürün bugı düzeltilmedi.**
>
> [Yeni 25 bulgu](#yüz-hedefi-25-yeni-bulgu) · [103 ID eşlemesi ve kaynak hashleri](evidence815/hundred/findings.json) · [Tekrar üretme](evidence815/hundred/REPRODUCE.md) · [Önceki geliştirme önerileri](#ek-geliştirme-önerileri)

> **Önceki güncelleme — 31 Ekim 2026: 24 bug eklenerek toplam 78 olmuştu (23 P1, 55 P2).** Bu tur ayrıca **27 geliştirme önerisi / ayrıntılandırma** eklenmiştir; öneriler bug sayısına katılmaz. Önceki 54 kayıt korunur. **Ürün kodu ve ayarlar değiştirilmedi, hiçbir bug düzeltilmedi.**
>
> [Yeni 24 bulgu](#ek-tarama-24-yeni-bulgu) · [Yeni öneriler](#ek-geliştirme-önerileri) · [78 kimliğin eşlemesi ve yeni kaynak hashleri](evidence815/extra/findings.json) · [Tekrar üretme ve sınırlar](evidence815/extra/REPRODUCE.md)

> **Önceki genişletme: 54 doğrulanmış güncel hata (16 P1, 38 P2).** Önceki 3 + o tur eklenen 50 + geçmişte bilinen 1 yeniden doğrulama. Öneriler ve kanıt boşlukları bug sayısına katılmadı. **Hiçbir hata düzeltilmedi.** [54 bulgunun dizini](#genişletilmiş-bulgu-dizini) · [tam kanıt ve ID eşlemesi](evidence815/deep/findings.json) · [yeniden üretme](evidence815/deep/REPRODUCE.md).

İlk tarama: **30 Ekim 2026**, Windows. İncelenen ürün: **`00a01f92f109f11183b02bc55dd1dfed25ed3e9f`**, başlangıç dalı `master`; rapor dalı `codex/audit-report815`.

Kullanıcının talebi yalnız inceleme ve ayrıntılı rapordur. **Ürün kodu, ayarlar, bağımlılıklar ve mevcut testler değiştirilmedi; aşağıdaki hatalar düzeltilmedi.** Eklenen yürütülebilir kaynaklar yalnız raporun kontrollü yeniden üretme ve denetim problarıdır.

## İlk dar tarama — B01–B03 (30 Ekim)

Bu bölüm ilk turun tarihsel kapsamıdır. Bu bölümün ilk genişletme toplamı 54 bulgudur; son güncel toplam raporun en üstünde verilmiştir. **İlk turda 3 doğrulanmış hata:** bir yüksek öncelikli çeviri bütünlüğü sorunu ve iki orta öncelikli okuma/hazırlık sorunu. Bunlardan ayrı **5 geliştirme alanı** aşağıda gerekçeleri ve kabul ölçütleriyle bulunur. Çökme, dosya silinmesi veya güvenlik açığı keşfedildiği iddia edilmez.

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

<a id="genişletilmiş-bulgu-dizini"></a>

## Genişletilmiş bulgu dizini — önceki 54 bulgu

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


<!-- EXTRA-AUDIT-815 -->

## Ek tarama: 24 yeni bulgu

İnceleme başlangıcı **55bfcca53a995e1217edb547655a50720ff59320**, dal **codex/audit815-extra**. Önceki 54 ile aynı ürün dosyaları incelendi. Üç ajan kullanıcının tercihiyle **GPT‑6.1 Sol / medium effort** kullandı. Yeni kayıtlar eski bugların dil/ekran varyantlarını sayı artırmak için ayırmaz. Önceki rapor/registry ilişkileri her kayıtta yazılıdır.

| ID | Önem | Hata | Kanıt alanı / eski ID |
|---|---|---|---|
| [R815-B55](#r815-b55) | P1 | Video paketinin geri yüklenmesi çıkarılan videoyu kataloğa bağlamıyor | root / XROOT01 |
| [R815-B56](#r815-b56) | P2 | POSIX kaynak kökü taşıma sihirbazında baştaki ayıracını kaybediyor ve seçilen eşleme uygulanmıyor | root / XROOT02 |
| [R815-B57](#r815-b57) | P1 | Bozuk kaynak katalog otomatik yedeklemede başarı sayılıyor ve son sağlam yedek budanıyor | root / XROOT03 |
| [R815-B58](#r815-b58) | P1 | Çalışma paketi yalnız önizlenirken paket içindeki doğrulanmamış UNC yoluna dosya varlık sorgusu gönderiliyor | root / XROOT04 |
| [R815-B59](#r815-b59) | P2 | Var olan hosta sonradan eklenen açık shadow root içindeki video keşfedilmiyor | browser / EX-BR01 |
| [R815-B60](#r815-b60) | P2 | CSS visibility:hidden büyük video görünür oynatıcıdan önce seçiliyor | browser / EX-BR02 |
| [R815-B61](#r815-b61) | P2 | Aynı belgede oynatıcı değişince eski docToken yeni medya üzerinde komuta izin veriyor | browser / EX-BR03 |
| [R815-B62](#r815-b62) | P2 | Dublaj hız geçersiz kılma kaydı aynı video elementinin yeni kaynağına taşınıyor | browser / EX-BR04 |
| [R815-B63](#r815-b63) | P1 | Normalizasyon kurulmuş medya CORS izinsiz kaynağa geçince normal oynarken sessiz kalıyor | browser / EX-BR05 |
| [R815-B64](#r815-b64) | P2 | Çapraz-origin karelerin bağlantı etiketleri aynı kısayolu kullanıyor ve seçimden sonra diğer katman kalıyor | browser / EX-BR06 |
| [R815-B65](#r815-b65) | P2 | Genel web akışlarının altyazı tercihi stream kimliğini kaybedip aynı sayfanın başka videosuyla birleşiyor | browser / EX-BR07 |
| [R815-B66](#r815-b66) | P2 | Geçerli WebVTT cue gövdesindeki NOTE/STYLE/REGION konuşması siliniyor | backend / XB01 |
| [R815-B67](#r815-b67) | P2 | Altyazı referans hizalamasında örtüşen cue katmanları güven puanını şişiriyor | backend / XB04 |
| [R815-B68](#r815-b68) | P2 | Doğru milyar değerleri ASR doğrulamasında sayı kaybı/ekleme diye reddediliyor | backend / XB05 |
| [R815-B69](#r815-b69) | P2 | Senkron işi ortak iptal/geçici dosya yaşam döngüsüne katılmadığı için ses kalıntısı bırakıyor | backend / XB06 |
| [R815-B70](#r815-b70) | P1 | Dizi kanon hafızası sonradan oluşunca exact çeviri cache eski terminolojiyi geri getiriyor | backend / XB07 |
| [R815-B71](#r815-b71) | P2 | Yorum isteği kimlik çözümlemesindeyken verilen durdurma kayboluyor | assistant / E01 |
| [R815-B72](#r815-b72) | P2 | IMDb eşleşmesi değişmiş eski yorum analizi yeni kimliğe kaydedilip güncel gösteriliyor | assistant / E02 |
| [R815-B73](#r815-b73) | P1 | Yapım yüklenirken dil değişimi eski başlığı gösterip yeni kaydı değiştiriyor | assistant / E03 |
| [R815-B74](#r815-b74) | P2 | Sürekli gelen asistan metni ara kayda yazılmıyor, kapanışta bütünüyle kaybolabiliyor | assistant / E04 |
| [R815-B75](#r815-b75) | P1 | Açık olumsuz watchlist isteği doğrudan ekleme işlemi yapıyor | assistant / E05 |
| [R815-B76](#r815-b76) | P2 | Geçerli Türkçe TMDB türü Sana özel önerilerde yok sayılıyor | assistant / E06 |
| [R815-B77](#r815-b77) | P2 | Native duraklatma başarısızken asistan tamamlandı ve durakladı bildiriyor | assistant / E07 |
| [R815-B78](#r815-b78) | P2 | Geçerli SSE Content-Type harf değişimi sağlayıcı yanıtını bozuyor | assistant / E08 |

### Bu turun gerçek yükü ve sınırları

Donanımda **RTX 4070 SUPER, 12282 MiB VRAM** doğrulandı; eski notlardaki 4070 Ti varsayılmadı. Mevcut Windows kaynak testi **start.bat hattıyla**, ayrı sentetik profilde çalıştırıldı: **200/200 yakalama**, ardından 50 planlı bellekten boşaltma döngüsünün **3. adımında pending-response koruması nedeniyle exit 1**. Son JSON oluşmadı. İlk iki boşaltma tamamlanmış olması veya 200 yakalama, tam kaynak bütçesinin geçtiği anlamına gelmez. Koruma/fixture zamanlaması ayrıştırılmadan bu sonuç yeni ürün bugı sayılmadı. Bilinen 11 before-quit dinleyici uyarısı tekrar gözlendi, yeni bug sayılmadı.

Ana süreç **8 hata yeniden üretme iş akışını**, bunlardan ayrı **1 performans probunu** çalıştırdı. Native browser probunda altı davranış orijinal üretim scriptleriyle gerçek Windows Chromium üzerinde ve iki localhost origininde tekrarlandı; ana süreç ölçümleri ayrıca assertion ile kontrol etti. Ürün main/renderer'ın tüm UI zinciri için E2E kabulü iddia edilmez. Diğer kayıtlar gerçek modül/tüketici + kontrollü IPC, sağlayıcı, ASR, saat ve IO sınırlarına dayanır. [Tekrar kaydı](evidence815/extra/parent-verification.json), [ana süreç sonuçları](evidence815/extra/parent/browser-native-result.json).

96 MiB sentetik paket yükünde **export 2448 ms**, export sonrasında Node RSS artışı **333479936 bayt (yaklaşık 318 MiB)** ölçüldü. Timer gecikmesi **3446 ms** olup export sonrasındaki doğrulama okumasını da içerir; yalnız export süresi veya gerçek Electron UI donması diye sunulmaz. Arşiv geri okunabildi. Bu ölçüm **performans önerisidir, bug/OOM/çökme sayılmadı**. [Ölçüm](evidence815/extra/root/backup-load-observations.json).

Bu tur gerçek GPU modeli/sentezi veya ücretli API kullanılmadı; işlevsel kararlar için kontrollü sağlayıcı yeterliydi. Fiziksel dinleme, kişisel hesap/DRM, dış ağ paylaşımı ve tam npm/CI sonucu doğrulanmadı. Gerçek FFmpeg, Python ZIP çıkarımı ve yalnız sahip olunan test çocuğunun Windows terminate kontrolü yapıldı; kullanıcının uygulaması kapatılmadı.

<a id="r815-b55"></a>

### R815-B55 · P1 — Video paketinin geri yüklenmesi çıkarılan videoyu kataloğa bağlamıyor

**Alt kanıt:** root / XROOT01; [yapılandırılmış kayıt](evidence815/extra/root/findings.json).

**Kod:** `src/catalog-extensions.js:145`, `src/catalog-extensions.js:148`, `src/catalog-extensions.js:166`, `src/workspace-video-package.js:88`, `src/media-catalog-store.js:45`

**Tekrar:** Gerçek kısa MP4 içeren geçerli kataloğu includeVideos ile dışa aktar. Boş ayrı profilde gerçek package-preview → package-apply zincirini çalıştır; yeniden açılış tüketicisi itemOf ile kaydı oku.

**Beklenen:** Çıkarılan dosyanın yeni yerel yolu katalog kaynağına ve ilgili kayıt kimliklerine uygulanmalı; hazır video ilk açılışta erişilebilir olmalı.

**Gözlenen:** Python ZIP çıkarımı 1 MP4 üretiyor; apply ok:true ve restart callback'i çalışıyor. Katalog source.value '{{VIDEO}}/videos/<hash>.mp4' olarak kalıyor; gerçek itemOf bu yolu yerel mutlak yol saymadığı için source:null döndürüyor.

**Kök neden:** videoMappings dizisi extract() çağrısından önce kopyalanıyor. extract() sonradan data.videoMappings alanına güvenilir yolları yazıyor fakat restorePackage eski boş diziyi kullanıyor.

**Etki:** Başarıyla taşındığı bildirilen videonun katalog bağlantısı kaybolur; çıkarılan medya diskte dururken kullanıcı yeniden dosya seçmek zorunda kalır. Film ve bölüm çeşitleri tek köktür.

**Önceki kapsam:** R86-01 paket kaynaklarını takma kimliğe çevirdi; bu kayıt o gizlilik onarımını geri alınmış saymaz. Yeni sınır, extract tamamlanınca üretilen eşlemenin gerçek apply caller'ına geçmemesidir. Önceki R815-B01–B54'te yok.

**Sınır:** Gerçek FFmpeg MP4, Python ZIP ve üretim apply/tüketici çalıştırıldı. Electron restart yerine kontrollü callback ve localStorage sınırı kullanıldı; kişisel medya/profil yok. Video baytları silinmedi.

**Kabul ölçütü:** Film ve dizi bölümü içeren gerçek ZIP export→preview→apply→yeni store açılışında bütün çıkarılan source.value değerleri mevcut dosyalara gitmeli; takma kimlikler normal katalog tüketicisine kalmamalı. Eksik video açıkça ayrı gösterilmeli.

**Kanıt dosyaları:** [workspace-probe.cjs](evidence815/extra/root/workspace-probe.cjs), [workspace-observations.json](evidence815/extra/root/workspace-observations.json).

<a id="r815-b56"></a>

### R815-B56 · P2 — POSIX kaynak kökü taşıma sihirbazında baştaki ayıracını kaybediyor ve seçilen eşleme uygulanmıyor

**Alt kanıt:** root / XROOT02; [yapılandırılmış kayıt](evidence815/extra/root/findings.json).

**Kod:** `src/workspace-package.js:298`, `src/workspace-package.js:312`, `src/workspace-package.js:314`, `src/catalog-extensions.js:135`, `src/renderer/media-catalog.js:513`

**Tekrar:** Linux kaynağından gelen geçerli katalogda /mnt/previous/film/movie.mp4 bulunsun. Windows'ta önizlemenin sunduğu eksik kök için yeni yerel klasör seçip geri yükle.

**Beklenen:** Sihirbazın sunduğu kök özgün yolun gerçek öneki olmalı ve seçilen klasör kaynak yoluna uygulanmalı.

**Gözlenen:** missingLocalMedia kökü 'mnt/previous/film' döndürüyor; baştaki '/' yok. Bu köke bağlanan geçerli hedefle restorePackage çalışınca source.value hâlâ '/mnt/previous/film/movie.mp4'. Gerçek itemOf kaynak kaydını kabul ediyor. Aynı kök bölme işlemi UNC ayıraçlarını da düşürüyor; UNC örneği ayrı bug sayılmadı.

**Kök neden:** split(/[\/]+/).filter(Boolean) kök bilgisini kaybediyor; yeniden join hacim/kök ayıracını geri koymuyor. rewrite ise doğru olarak tam önek aradığı için yanlış kökü eşleştirmiyor.

**Etki:** Linux'tan Windows'a geçişte kullanıcı klasör eşlemesini seçmesine rağmen medya yolları eksik kalır. Her dosyayı yeniden bağlamak gerekir.

**Önceki kapsam:** R388 madde25 proje taşıma özelliğinin açık kalan kök biçimi; mevcut drive-letter testi yeni keşif sayılmadı. Registry F38 ağırlıkla media-relink-matcher/store yollarıdır; bu sihirbazın POSIX kök üretimi farklı entegrasyon sınırıdır.

**Sınır:** Geçerli POSIX katalog kaydı, üretim itemOf/missingLocalMedia/restorePackage ve Windows dosya sistemi kullanıldı. Gerçek Linux GUI oturumu açılmadı. UNC ağına bağlanılmadı; modern kataloğun UNC reddi nedeniyle o varyant ana kanıt yapılmadı.

**Kabul ölçütü:** Drive-letter, POSIX ve açık desteklenen ağ yolu biçimlerinde üretilen kök özgün kaynağın sınır duyarlı öneki olmalı; Windows hedef seçimiyle doğru dosya yoluna dönüşmeli.

**Kanıt dosyaları:** [workspace-probe.cjs](evidence815/extra/root/workspace-probe.cjs), [workspace-observations.json](evidence815/extra/root/workspace-observations.json).

<a id="r815-b57"></a>

### R815-B57 · P1 — Bozuk kaynak katalog otomatik yedeklemede başarı sayılıyor ve son sağlam yedek budanıyor

**Alt kanıt:** root / XROOT03; [yapılandırılmış kayıt](evidence815/extra/root/findings.json).

**Kod:** `src/workspace-package.js:104`, `src/workspace-package.js:105`, `src/media-tools-service.js:61`, `src/media-tools-service.js:63`, `src/media-tools-service.js:64`

**Tekrar:** Önce geri okunabilen bir otomatik yedek oluştur. Sentetik katalog JSON'unu boz; gerçek kayıtlı günlük yedekleyiciyi kontrollü saatle 7 gün ilerleterek çalıştır. Kalan yedekleri readPackage ile geri oku.

**Beklenen:** Geçersiz kaynak dosya yüzünden geri yüklenemeyecek arşiv sağlam yedek yerine geçmemeli; hata görünmeli ve son doğrulanmış yedek korunmalı.

**Gözlenen:** exportPackage bozuk JSON parse hatasını yutup ham baytları paketliyor. Yedi günlük işlem de schedule.error='' ve güncellenmiş last ile başarı gösteriyor. Sonuçta 7 arşivin hiçbiri readPackage'ten geçmiyor; başlangıçtaki tek sağlam arşiv retention ile silinmiş.

**Kök neden:** Export catch yalnız WP_DEPTH hatasını yeniden fırlatıyor. Normal SyntaxError yutuluyor; otomatik döngü paketi geri doğrulamadan 7 dosyalık retention uyguluyor ve başarı zamanını yazıyor.

**Etki:** Disk/uygulama arızasından sonra otomatik yedekleme kurtarma sağlamak yerine son sağlam geri dönüş noktasını da tüketebilir. Elle export başarısı aynı kökün başka yüzeyidir, ayrı sayılmadı.

**Önceki kapsam:** R357 derin JSON/WP_DEPTH onarımını koruyor; bu yeni doğrulama sıradan sözdizimi bozukluğu ve otomatik retention birleşimini sınar. R815-B09 okuma listesi indeksinin doğrudan ezilmesidir; burada arşiv geçerliliği ve sağlam yedek rotasyonu farklı köktür.

**Sınır:** Üretim modülü VM içinde, yalnız saat ve timer kontrollü; export/read/retention gerçek sentetik dosyalarla çalıştı. Yedi gerçek gün beklenmedi, elektrik kesintisi veya kişisel dosya bozulması oluşturulmadı.

**Kabul ölçütü:** Bozuk katalog/sohbet/not girdilerinde export açık hata veya bölümsel uyarı vermeli; geri okunamayan arşiv başarı sayılmamalı ve son doğrulanmış yedek retention dışında korunmalı.

**Kanıt dosyaları:** [workspace-probe.cjs](evidence815/extra/root/workspace-probe.cjs), [workspace-observations.json](evidence815/extra/root/workspace-observations.json), [auto-backup-probe.cjs](evidence815/extra/root/auto-backup-probe.cjs), [auto-backup-observations.json](evidence815/extra/root/auto-backup-observations.json).

<a id="r815-b58"></a>

### R815-B58 · P1 — Çalışma paketi yalnız önizlenirken paket içindeki doğrulanmamış UNC yoluna dosya varlık sorgusu gönderiliyor

**Alt kanıt:** root / XROOT04; [yapılandırılmış kayıt](evidence815/extra/root/findings.json).

**Kod:** `src/catalog-extensions.js:120`, `src/catalog-extensions.js:127`, `src/workspace-package.js:174`, `src/workspace-package.js:307`, `src/workspace-package.js:324`

**Tekrar:** Sentetik .wbp katalog kaydının local kaynağına UNC yolu koy. Gerçek package-preview zincirini, UNC fs.existsSync çağrılarını ağdan önce kaydeden/bloklayan kontrollü sınırla çalıştır; apply çağırma.

**Beklenen:** Önizleme paket içindeki doğrulanmamış uzak dosya yollarına otomatik erişmemeli. Katalog normalizasyonunun reddettiği yol, eksik medya taramasına ham biçimde geçmemeli.

**Gözlenen:** Paket doğrulaması ve preview ok:true; apply yapılmadan fs.existsSync('\\audit.invalid\private-share\movie.mp4') çağrısı kaydedildi. Aynı sourceOf gerçek katalog tüketicisinde null olarak reddediliyor. validate, itemOf sonucunu atıp ham kaydı kullanmayı sürdürüyor.

**Kök neden:** Paket önizlemesi ham files içindeki source.value üzerinde missingLocalMedia çağırıyor. looksLikeLocalMediaPath UNC'yi yerel medya gibi kabul ediyor ve kullanıcı eşlemesi/restore onayından önce existsFn(value) çalıştırıyor.

**Etki:** Windows dosya API'si ağ paylaşımına erişmeye çalışabilir; beklenmeyen giden SMB ve bekleme riski vardır. Kimlik doğrulama politikası izin veriyorsa NTLM isteği riski de doğar. Bu tur kimlik sızıntısı veya başarılı bağlantı gösterilmedi.

**Önceki kapsam:** R30 B45 katalog/nMDB tüketicisi UNC reddini, R198 history:authorizeFiles imported korumasını kapatmıştı. Onlar kaldırılmış sayılmaz: yeni kaçak sink R388'de eklenen package-preview/missingLocalMedia ön taramasıdır. Registry F48/F50 eski IPC/depo kontrolleriyle aynı test diye sayılmadı.

**Sınır:** Bütün UNC dosya sorguları intercept edilerek false döndürüldü; DNS/SMB/NTLM işlemi veya gerçek ağ hedefi kullanılmadı. Kanıt, üretim preview yolunun yasaklanması gereken çağrıyı yapmasıdır; işletim sistemi politikası sonucu çıkarım olarak ayrı tutulur.

**Kabul ölçütü:** Paket önizleme/metadata/kapsam taramasında UNC, device-UNC ve ağ yolu varyantları hiçbir dosya varlık/stat/açma API'sine ulaşmamalı; yalnız kullanıcı tarafından doğrulanmış yerel eşleme veya açık yetkili açma akışı erişim vermeli.

**Kanıt dosyaları:** [package-preview-network-probe.cjs](evidence815/extra/root/package-preview-network-probe.cjs), [package-preview-network-observations.json](evidence815/extra/root/package-preview-network-observations.json).

<a id="r815-b59"></a>

### R815-B59 · P2 — Var olan hosta sonradan eklenen açık shadow root içindeki video keşfedilmiyor

**Alt kanıt:** browser / EX-BR01; [yapılandırılmış kayıt](evidence815/extra/browser/findings.json).

**Kod:** `src/browser-media-controller.js:264`, `src/browser-media-controller.js:284`, `src/browser-media-controller.js:407`

**Tekrar:** Boş, bağlı div host bulunan yerel sayfada buildBrowserMediaProbeScript çalıştır; host.attachShadow({mode:open}) ile video ekle; ikinci probe çalıştır.

**Beklenen:** Yeni açık shadow root içindeki oynatıcı keşfedilmeli; kontrol/altyazı araçları sayfayı yeniden yükleme gerektirmemeli.

**Gözlenen:** Shadow DOM içinde 1 video olmasına rağmen önceki ve sonraki probe null döndü.

**Kök neden:** Document MutationObserver shadow root yaratılmasını görmüyor; rootun kendi observerı kurulamadığı için içerideki video eklenmesi de görülmüyor. select yalnız observer kotası aşılırsa yeniden scan yapıyor.

**Etki:** Geç kurulan web component oynatıcılarında oynat/duraklat, seek ve medya karesi işlemleri erişilemez kalır.

**Gerçek tüketici:** main browser:command satır16218 tüm karelere bu probe scriptini gönderir; hiç aday yoksa komut Sayfada kontrol edilebilen video bulunamadı ile biter. browser:capturePage video modu da aynı probu kullanır.

**Önceki kapsam:** Önceki54te yok. R648 bridge shadow smoke başlangıçta var olan/açılışta eklenen rootları kapsıyor; bu geç attach sınırı ayrı.

**Sınır:** Gerçek Windows Chromium DOM ve orijinal script. Açık root test edildi; kapalı root destek iddiası yok. Üst belgeye host yeniden eklenmesi gibi başka mutationlar tesadüfen kurtarabilir.

**Native/modül sonucu:** [native-result.json](evidence815/extra/browser/native-result.json).

<a id="r815-b60"></a>

### R815-B60 · P2 — CSS visibility:hidden büyük video görünür oynatıcıdan önce seçiliyor

**Alt kanıt:** browser / EX-BR02; [yapılandırılmış kayıt](evidence815/extra/browser/findings.json).

**Kod:** `src/browser-media-selection.js:3`, `src/browser-media-controller.js:407`, `src/browser-media-controller.js:631`

**Tekrar:** Aynı sayfada görünür küçük video ve visibility:hidden büyük video oluştur; ikisine aynı sentetik medya kaynağını yükle; probe ve loop komutu gönder.

**Beklenen:** Görünür kullanılabilir medya, CSS ile saklanan medyadan önce seçilmeli.

**Gözlenen:** Hidden video area320000 ile seçildi; visible.loop=false, hidden.loop=true oldu.

**Kök neden:** Rank yalnız clientWidth×clientHeight, paused, muted ve readyState okuyor. visibility:hidden, opacity ve viewport görünürlüğü sıralama girdisine alınmıyor.

**Etki:** Önizleme/sayfa arkaplanı gibi gizli büyük medya bulunduğunda genel oynatma komutları görünür filmi kontrol etmez; capture/OCR yanlış alanı hedefleyebilir.

**Gerçek tüketici:** browser:command probe→rankBrowserMediaCandidates→buildBrowserMediaCommandScript; sayfa içi controller.select aynı compareMedia kullanır. Sağtık menüsüne özel değildir.

**Önceki kapsam:** R815-B28 sağtık hedefinin kaybolmasıydı. Burada genel araç komutu ve farklı kök olan görünürlük sıralaması söz konusu. R46daki ASS seçicisinin farklı opacity sorunu bu controller değildir.

**Sınır:** Gerçek DOM ve metadata yüklü sentetik medya; fiziksel video görüntüsü/ses dinlemesi yapılmadı. display:none durumuna genellenmedi.

**Native/modül sonucu:** [native-result.json](evidence815/extra/browser/native-result.json).

<a id="r815-b61"></a>

### R815-B61 · P2 — Aynı belgede oynatıcı değişince eski docToken yeni medya üzerinde komuta izin veriyor

**Alt kanıt:** browser / EX-BR03; [yapılandırılmış kayıt](evidence815/extra/browser/findings.json).

**Kod:** `src/browser-media-controller.js:609`, `src/browser-media-controller.js:628`, `src/browser-media-controller.js:631`, `src/main.js:16218`

**Tekrar:** Orijinal video için probe docToken al; aynı document içinde videoyu başka elementle değiştir; MutationObserver turundan sonra eski token ile loop komutu çalıştır.

**Beklenen:** Probe ile mutasyon arasındaki hedef medya değişimi reddedilmeli veya kullanıcı eylemi yeni medyaya taşınmadan önce yeniden doğrulanmalı.

**Gözlenen:** Komut handled:true döndü ve replacement video loop=true oldu.

**Kök neden:** docToken controller/window ömrüne bağlı. Token eşleşmesinden sonra controller.select yeniden en iyi öğeyi seçiyor; probun seçtiği HTMLMediaElement kimliği veya src revizyonu taşınmıyor.

**Etki:** SPA bölüm/reklam geçişinde eski oynatıcı için başlatılmış seek/pause/loop komutu yeni oynatıcıya uygulanabilir.

**Gerçek tüketici:** main browser:command satır16218–16242 her kareden probe bekledikten sonra candidate.media.docTokenı komut scriptine verir. Bekleme sırasında aynı-belge medya değişebilir; main tab generation/URL guardı henüz değişmemiş olabilir.

**Önceki kapsam:** Önceki54te yok. R815-B18 export dialog belge değişimiyle farklı; burada belge aynı ve eski docToken doğru görünmesine rağmen medya nesnesi değişiyor.

**Sınır:** Ürün command/probe scriptleri native Chromiumda çalıştı; tam uygulamada değişimin main pollingden önceki dar zamanlaması ayrıca yürütülmedi. Her SPA geçişi için garanti iddiası yok.

**Native/modül sonucu:** [native-result.json](evidence815/extra/browser/native-result.json).

<a id="r815-b62"></a>

### R815-B62 · P2 — Dublaj hız geçersiz kılma kaydı aynı video elementinin yeni kaynağına taşınıyor

**Alt kanıt:** browser / EX-BR04; [yapılandırılmış kayıt](evidence815/extra/browser/findings.json).

**Kod:** `src/browser-media-controller.js:199`, `src/browser-media-controller.js:475`, `src/browser-media-controller.js:483`, `src/main.js:18255`

**Tekrar:** Orijinal dub-rate scriptiyle video playbackRate .5/baseRate1 yap; aynı elementin srcsini yeni medyaya değiştir; loadstart/loadedmetadata sonrası hızı ölç.

**Beklenen:** Kaynağa ait geçici dublaj hız düzeltmesi başka srcye geçince serbest bırakılmalı; yeni kaynak temel hızdan başlamalı.

**Gözlenen:** Yeni currentSrc yüklendiği halde playbackRate .5 kaldı.

**Kök neden:** setDubRate state.source alanını kaydediyor ama applyPlaybackPreference dub kaydını kaynakla karşılaştırmadan tekrar uygular. loadstart/loadedmetadata reapply bunu sürdürüyor.

**Etki:** Aynı video elementini yeniden kullanan sayfalarda yeni bölüm, reklam veya fragman önceki dublaj hızını 3 saniyeye kadar devralır; sonraki yenilemeler pencereyi uzatabilir.

**Gerçek tüketici:** Gerçek dub:rate servisi main18255te buildBrowserMediaCommandScript(dub-rate) kullanır. dubRateTargets cached frame/docTokenı da aynı belge içinde korur.

**Önceki kapsam:** Önceki54te yok. EX-BR03 element replacement anındaki komut hedeflemesi; bu farklı kök aynı element üzerinde zaten tutulmuş geçici rate state/source ömrüdür.

**Sınır:** Ölçüm yeni kaynak yüklenmesinden100ms sonra yapıldı; kalıcı hız bozukluğu iddia edilmiyor, yerel3sn TTL var. Gerçek GPU dublaj üretimi kullanılmadı.

**Native/modül sonucu:** [native-result.json](evidence815/extra/browser/native-result.json).

<a id="r815-b63"></a>

### R815-B63 · P1 — Normalizasyon kurulmuş medya CORS izinsiz kaynağa geçince normal oynarken sessiz kalıyor

**Alt kanıt:** browser / EX-BR05; [yapılandırılmış kayıt](evidence815/extra/browser/findings.json).

**Kod:** `src/browser-media-controller.js:100`, `src/browser-media-controller.js:114`, `src/browser-media-controller.js:120`, `src/browser-media-controller.js:133`

**Tekrar:** Bir localhost origininde aynı-origin PCM WAV audio yükle; orijinal media-preference normalizeAudio:true uygula; aynı elementi ikinci localhost portundaki Access-Control-Allow-Origin içermeyen WAVa geçir; source nodea ölçüm analyserını yeniden bağlayıp dalga tepe değerini ölç.

**Beklenen:** Normalizasyon özelliği normal HTML medya oynatımını sessizliğe çevirmemeli; desteklenmeyen kaynak geçişinde güvenli yeniden kurulum veya görünür durum/geri dönüş olmalı.

**Gözlenen:** Aynı-origin peak .36622065; kaynak değişiminden sonra peak0. Yeni medya readyState4, pausedfalse ve zaman .35sn ilerliyor; graph1.

**Kök neden:** İlk aynı-origin kaynak için MediaElementAudioSourceNode kuruluyor. Sonraki CORSsuz kaynağı audioGraphAllowed reddetse de graph.source doğrudan destinationa bağlanıyor. Bu node artık spesifikasyona göre sıfır çıkarıyor; direct-connect onu doğal HTML çıkışına geri döndürmüyor.

**Etki:** CDN/kaynak değiştiren gerçek oynatıcılarda video/ses zamanı ilerlerken kullanıcı ses alamaz. Kontrol panelinde sessizlik/bozuk durum nedeni görünmez.

**Gerçek tüketici:** Play/seek/loadstart/loadedmetadata eventleri applyPlaybackPreference→applyAudioPreference çağırır. Browser genel/site normalizeAudio tercihi orijinal buildBrowserMediaPreferenceScript üzerinden kurulur.

**Önceki kapsam:** R87 R78-08b başlangıçtan cross-origin medyada graph kurmama kararını tasarlanmış saymıştı. Bu yeni geçişte graph zaten var; guard yeterli olmuyor. Önceki54te yok.

**Sınır:** Fiziksel hoparlör dinlemesi yerine native AudioContext dalga ölçümü. İlk ölçüm bağlantısının fallbackte kopabileceği karşı denetimde fark edilip son koşuda CORS geçişinden sonra source→analyser yeniden bağlandı; sonuç yine0. CORS politikası aşılmadı.

**Native/modül sonucu:** [native-result.json](evidence815/extra/browser/native-result.json).

<a id="r815-b64"></a>

### R815-B64 · P2 — Çapraz-origin karelerin bağlantı etiketleri aynı kısayolu kullanıyor ve seçimden sonra diğer katman kalıyor

**Alt kanıt:** browser / EX-BR06; [yapılandırılmış kayıt](evidence815/extra/browser/findings.json).

**Kod:** `src/browser-link-hints.js:26`, `src/browser-link-hints.js:72`, `src/browser-link-hints.js:121`, `src/main.js:16194`

**Tekrar:** İki localhost portuyla top sayfaya bir button ve çapraz-origin iframe içine ikinci button koy; mainin yaptığı gibi her frame üzerinde orijinal link-hints scriptini çalıştır; top documentta A tuşu gönder.

**Beklenen:** Sayfa genelindeki görünen etiketler tekil/eylem hedefi açık olmalı; seçim bittiğinde bütün frame katmanları birlikte kapanmalı.

**Gözlenen:** Top ve child aynı A etiketini gösterdi. A top buttonı tıkladı (1), child tıklaması0; child etiket katmanı kaldı.

**Kök neden:** Cross-origin frame kendi bağımsız instance/kod alanını başlatır. Ana süreç tüm framelere aynı başlangıç algoritmasını gönderir. Activate yalnız yerel cleanup yapar; Escape için eklenen broadcastCleanup seçim yolunda kullanılmaz.

**Etki:** Kullanıcı iframe içinde gördüğü A etiketini yazsa da topframe A eylemi tetiklenebilir. Seçimden kalan etiketler sonraki yazmayı yakalayabilir ve etiket modu bitmiş görünümünü bozabilir.

**Gerçek tüketici:** browser:command link-hints main16194 tüm browserFrames üzerinde buildBrowserLinkHintsScript çalıştırıyor. Probe iki gerçek Chromium frameinde aynı scripti çalıştırdı.

**Önceki kapsam:** R83 B83-11/R85 ESC frame cleanup şüphesiydi, güncel kod ESC broadcast içeriyor. Bu yeni test Escape değil, görünür kod çakışması ve başarılı activate sonrası diğer katmanın kalması. Önceki54te yok.

**Sınır:** Tuş native Chromium document KeyboardEventiyle topa yöneltildi; fiziksel klavye odağının bütün varyantları test edilmedi. Same-origin frame delegation bu sorundan farklı ve gizli same-origin iframe negativecheck düzgünce tek etiket verdi.

**Native/modül sonucu:** [native-result.json](evidence815/extra/browser/native-result.json).

<a id="r815-b65"></a>

### R815-B65 · P2 — Genel web akışlarının altyazı tercihi stream kimliğini kaybedip aynı sayfanın başka videosuyla birleşiyor

**Alt kanıt:** browser / EX-BR07; [yapılandırılmış kayıt](evidence815/extra/browser/findings.json).

**Kod:** `src/browser-subtitle-preferences.js:47`, `src/browser-subtitle-preferences.js:49`, `src/browser-session-store.js:197`, `src/main.js:6387`, `src/main.js:16559`

**Tekrar:** canonicalMediaIdentity ile generic watch sayfasının web:url kimliğini üret; deriveStreamMediaIdentity ile A/B manifestleri için iki streamId oluştur; BrowserSubtitlePreferences.put ile herbirine farklı iz seç; get(streamId) ve yeniden yükleme yap.

**Beklenen:** Tercih yazım ve lookupı aynı canonical stream kimliğini kullanmalı; aynı sayfanın farklı videosu kendi altyazı/senkron seçimini korumalı.

**Gözlenen:** İki farklı streamId tek base web:url anahtarına indirildi. Diskte yalnız Bnin tercihi kaldı; get(A)=null,get(B)=null; yeniden yüklemede de A yok.

**Kök neden:** Preferences.put normalizeSessionTabı çağırır. normalizeSessionTab mediaId içinde :url: varsa persistedParts türetmez ve URLden yalnız base kimliği yeniden üretir. Main ise put/get için streamMediaId kullanıyor.

**Etki:** Genel sayfalarda bölüm değiştirip dönünce seçilen kaynak/çeviri izleri ve senkron kayıtları hatırlanmaz; aynı watch URL altındaki başka video önceki tercihin üstüne yazar.

**Gerçek tüketici:** main16559 browser:session:updateTab put({mediaId:tab.streamMediaId||tab.mediaId}) yapıyor; main6387 restore get(tab.streamMediaId||tab.mediaId) arıyor.

**Önceki kapsam:** Önceki54te yok; R815-B49 pinned notların generic sayfa kimliği karışması başka depo/çağrı yoludur.

**Sınır:** Orijinal Node modülü; canlı site/profil değiştirilmedi. YouTube service:id stream kimliği counterchecki korunuyor; bulgu generic web:url tabanı ve benzeri URL kimliklerine özgü.

**Native/modül sonucu:** [prefs-result.json](evidence815/extra/browser/prefs-result.json).

<a id="r815-b66"></a>

### R815-B66 · P2 — Geçerli WebVTT cue gövdesindeki NOTE/STYLE/REGION konuşması siliniyor

**Alt kanıt:** backend / XB01; [yapılandırılmış kayıt](evidence815/extra/backend/findings.json).

**Kod:** backend/transcribe.py:9699

**Yöntem:** Gerçek translate_existing_subtitle ve VTT parser; sağlayıcı çağrısı gerekmez.

**Tekrar:** Geçerli VTT zaman satırının altına NOTE this is spoken dialogue. yaz; aynı dil EN→EN çevirisini başlat. STYLE/REGION ayrı negatif çeşitlerdir.

**Beklenen:** Metaveri yalnız yeni NOTE/STYLE/REGION blok başlığında tanınmalı; zaman satırından sonraki cue gövdesi metindir.

**Gözlenen:** parse_subtitle_entries=[]; gerçek dosya işi Altyazi okunamadi veya bos hatası verir. A spoken note. kontrolü bir cue olarak kalır.

**Etki ve kök:** Altyazı satırları sessiz kaybolur; tek cue dosyası bütünüyle kullanılamaz. Kök: paragraf filtresini mevcut cue gövdesine de uygulama.

**Önceki kapsam:** R815-B35/B39/B40 farklı ASS çizimi, entity provenance ve inline timestamp mekanizmalarıdır; bu yeni metadata/body sınırıdır. F18 N0341–0360 ile aile örtüşür.

**Sınır:** Native UI/model kalitesi değil; geçerli dosyadan gerçek backend hata yolu.

**Sonuç:** [observations.json](evidence815/extra/backend/observations.json).

<a id="r815-b67"></a>

### R815-B67 · P2 — Altyazı referans hizalamasında örtüşen cue katmanları güven puanını şişiriyor

**Alt kanıt:** backend / XB04; [yapılandırılmış kayıt](evidence815/extra/backend/findings.json).

**Kod:** backend/browser_align.py:53

**Yöntem:** Gerçek browser_align.align, gerçek srt/ffsubsync parser; ffsubsync çıktısı kontrollü.

**Tekrar:** Dört zaman bölgesinde aynı ilk3sn boyunca iki geçerli eşzamanlı referans cue; her bölgede10sn hedef cue. Kontrollü hizalama hedefi bu10sn pencerelere getirir.

**Beklenen:** Aynı referans saniyesi bir hedef cue için bir kez sayılmalı; .3 örtüşme .45 medium eşiğini geçmemeli.

**Gözlenen:** overlapBefore=0, overlapAfter=.6, confidence=medium. Gerçek referans zaman birleşimi yalnız .3 hedef kapsamına sahiptir.

**Etki ve kök:** Kullanıcı zayıf eşlemeyi orta güvenli sanabilir. Kök: referans aralıklarının birleşimi yerine her örtüşmenin ayrı toplanması.

**Önceki kapsam:** R815-B42 checkpoint diarization kaybından farklıdır. F18/F41 benzeri senkron ailelerinin genel dönüşüm kayıtları mevcut; bu çift katmanlı güven metriği yeni tetikleyicidir.

**Sınır:** autoApply=False korunur; yanlış hizalamanın otomatik uygulandığı veya gerçek ffsubsync modelinin bu sonucu ürettiği iddia edilmez.

**Sonuç:** [observations.json](evidence815/extra/backend/observations.json).

<a id="r815-b68"></a>

### R815-B68 · P2 — Doğru milyar değerleri ASR doğrulamasında sayı kaybı/ekleme diye reddediliyor

**Alt kanıt:** backend / XB05; [yapılandırılmış kayıt](evidence815/extra/backend/findings.json).

**Kod:** tools/voxcpm2/dub_quality.py:74

**Yöntem:** Gerçek SpeechVerifier.check sınıfı ve generation_status; kontrollü ASR yanıtı.

**Tekrar:** Beklenen Dünya nüfusu sekiz milyar insanı geçti.; tanınan Dünya nüfusu 8 milyar insanı geçti.; numericReference doğru8milyar.

**Beklenen:** Sekiz milyar ile8milyar aynı miktar olarak karşılaştırılmalı; yanlış9milyar ayrı kalmalı.

**Gözlenen:** Review; similarity=.7273, missing_numbers=[8], added_numbers=[8000000000]. Doğru50bin kontrolü review=False; yanlış9milyar review=True.

**Etki ve kök:** Doğru uzun belgesel/ekonomi cümlesi gereksiz sentez/ASR tekrarına ve manuel incelemeye düşer. Kök: mixed_number milyarı rakama açıyor, spoken_text/integer_words üst sınırı1milyarın altı; iki normalizasyon yönü tutarsız.

**Önceki kapsam:** R815-B37/B38 yanlış isim/miktar sahipliği için yanlış kabul mekanizmalarıdır; bu doğru büyük miktarın yanlış ret mekanizması. test_dub_grouped_numbers yalnız50bin/1milyon kapsar; F25 aile örtüşmesi.

**Sınır:** Kontrollü ASR transportu; canlı motorun nasıl ses ürettiği veya milyarı nasıl döktüğü iddia edilmez.

**Sonuç:** [observations.json](evidence815/extra/backend/observations.json).

<a id="r815-b69"></a>

### R815-B69 · P2 — Senkron işi ortak iptal/geçici dosya yaşam döngüsüne katılmadığı için ses kalıntısı bırakıyor

**Alt kanıt:** backend / XB06; [yapılandırılmış kayıt](evidence815/extra/backend/findings.json).

**Kod:** backend/transcribe.py:10253

**Yöntem:** Gerçek FFmpeg PCM çıkarımı; native Windows child process terminate; sentetik4sn WAV. Ek kooperatif iptal kontrolü gerçek pipeline controller ile.

**Tekrar:** WHISPER_JOB_TEMP_DIR ve WHISPER_CANCEL_FILE vererek sync_subtitles çalıştır; gerçek ses çıkarımı sonrasında iptal et/çocuğu sonlandır.

**Beklenen:** Scratch main-owned iş kökü içinde olmalı ve extract sonrasındaki hesaplama/yazım iptal checkpointlerine katılmalı.

**Gözlenen:** 128078bayt audio.wav, main-owned klasörü dışında system-temp/whisper_sync_* altında kalır. Normal tamamlanışta scratch temizlenir. Çıkarımdan hemen sonra gerçek controller markerı oluşturulan ayrı koşu yine done ve synced.srt yazar.

**Etki ve kök:** Büyük/tekrarlı iptallerde tam medya PCM sesi disk tüketir ve iş temizliği bu sesi kaldıramaz; iptal sonrası final de yazılabilir. Kök: sync alt modunun ham tempfile.mkdtemp ve eksik stage checkpointleriyle ortak job protokolünden ayrılması.

**Önceki kapsam:** Önceki54 içinde yok. R815-B42 resume diarization başka downstream ses kapsamı sorunudur. F16/F41 senkron/iptal aileleriyle ilişkili; pipeline_control.job_temp_directory doğru kontrol örneğidir.

**Sınır:** Yalnız sentetik128KB ses; kişisel medya yok. Tüm gerçek kullanıcı uygulamasının iptal edildiği iddia edilmez; sahip olunan test child öldürüldü. İki gözlem tek yaşam döngüsü kökü sayıldı.

**Sonuç:** [observations.json](evidence815/extra/backend/observations.json) · [sync-observations.json](evidence815/extra/backend/sync-observations.json).

<a id="r815-b70"></a>

### R815-B70 · P1 — Dizi kanon hafızası sonradan oluşunca exact çeviri cache eski terminolojiyi geri getiriyor

**Alt kanıt:** backend / XB07; [yapılandırılmış kayıt](evidence815/extra/backend/findings.json).

**Kod:** backend/transcribe.py:4125

**Yöntem:** Gerçek llm_translate, SeriesMemory dosya kilidi/atomik kayıt ve exact cache; kontrollü OpenAI sağlayıcı.

**Tekrar:** Önce Synthetic_Show.S01E02 içinde The captain is nearby.→Kaptan yakınlarda. çevirisini cachele. Sonra öncekiS01E01 kanon kararını captain=Reis olarak gerçek SeriesMemory.merge ile kaydet. S01E02yi yeniden çevir.

**Beklenen:** Modele verilen kanon bağlamı değişince exact cache ve fuzzy scope bu yeni kanon kimliğini ayırmalı.

**Gözlenen:** Yeni prompt hint captain=Reis içerir; ikinci iş0sağlayıcı çağrısıyla Kaptan yakınlarda. getirir. Cache kapalı1çağrı kontrolü Reis yakınlarda. döndürür.

**Etki ve kök:** Bölümler sıra dışı çevrildiğinde sonradan edinilen seri tutarlılığı önceki cache tarafından etkisizleştirilir. Kök: system_prompta series_hint ekleniyor ama translate_cache_key çağrısına veya tm_scopea kimliği taşınmıyor.

**Önceki kapsam:** R815-B41de exact key kullanıcı sahne notunu doğru ayırırken TM fallback yanlış kullanıyordu; burada yeni tetikleyici sonradan oluşan önceki bölüm kanonu ve ilk exact cache katmanı, notlar hiç değişmiyor. F12 N0221–0240 cache ailesiyle ilişkili.

**Sınır:** Ücretli API kullanılmadı. Kanonun dil kalitesi değil, gerçek dosya/cache invalidation davranışı kanıtlandı.

**Sonuç:** [observations.json](evidence815/extra/backend/observations.json).

<a id="r815-b71"></a>

### R815-B71 · P2 — Yorum isteği kimlik çözümlemesindeyken verilen durdurma kayboluyor

**Alt kanıt:** assistant / E01; [yapılandırılmış kayıt](evidence815/extra/assistant/findings.json).

**Konum:** `src/media-tools-service.js:71–79,134,136–147`; `src/renderer/review-decision-ui.js:32,45,69–74`.

**Tekrar:** Keşfet yapımından açık yorum sayfası getirmeyi başlat; discovery kimliğinin uzak metaveri çözümü beklesin. Bu sırada Okumayı durdur veya pencereyi kapat. Kimlik yanıtı sonradan gelsin. UI durdururken geçerli fetchRequest kimliğiyle reviews-stop gönderir.

**Beklenen:** Durdurulmuş istek kimlik çözümü sonrasında indirme başlatmamalı; sonraki görevleri meşgul etmemeli.

**Gözlenen:** reviews-stop `jobs.get(id)?.abort()` çağırıp başarı döner; jobs kaydı ancak await reviewItem sonrasında kurulmaktadır. Probda durdurma onayından sonra bir ağ isteği başladı ve eski iş `ok:true` tamamlandı. Renderer geç yanıtı atsa da ana süreçteki iş durmamıştır.

**Etki:** Kapatılmış isteğin kaynak tüketimi sürer; jobs.size kontrolü nedeniyle yeni yorum isteklerini de bloke edebilir. Son sonuç UI'a uygulandı iddiası yoktur.

**Kanıt/sınır:** Gerçek registerMediaTools handler'ı; geciktirilmiş resolveDiscovery ve kontrollü HTML Response. Canlı Letterboxd veya model kullanılmadı. Önceki R815-B44/B46/B54 geç UI açılışıyla ilgilidir; burada ayrı ana süreç iptal/kayıt sırası vardır.

<a id="r815-b72"></a>

### R815-B72 · P2 — IMDb eşleşmesi değişmiş eski yorum analizi yeni kimliğe kaydedilip güncel gösteriliyor

**Alt kanıt:** assistant / E02; [yapılandırılmış kayıt](evidence815/extra/assistant/findings.json).

**Konum:** `src/media-tools-service.js:153–157`; `src/renderer/review-decision-ui.js:54,116–118`.

**Tekrar:** IMDb ile tanımlı, TMDB eşleşmesi olmayan bir yapım için analiz al. Başlık/yıl aynı kalırken yanlış IMDb kimliği düzeltilsin. Önceki analizi eski itemIdentity ile kaydet ve kayıtlı analiz bölümünü aç.

**Beklenen:** Kimlik değişimi reddedilmeli veya önceki eşleşme olarak açıkça ayrılmalı.

**Gözlenen:** decision-save yalnız kind/title/year/tmdbId kontrol ediyor; eski `tt1234567` ile güncel `tt7654321` farkını kabul ediyor. Diskteki history.identity IMDb alanını da saklamıyor. Gerçek renderer tarihçe tüketicisi eski analizi `Earlier match` uyarısı olmadan güncel kayıt olarak çizdi.

**Etki:** Kullanıcının doğrulanmış analiz kaydı başka filme bağlanıyor; sonraki oturumda kaydın yanlış eşleşmeye ait olduğunu ayıran kimlik kanıtı yok.

**Kanıt/sınır:** Gerçek servis, gerçek sentetik disk JSON'u ve tam review-decision-ui tüketicisi. IMDb düzenlemesi geçerli katalog davranışıdır; bozuk kimlik girdisi kullanılmadı. Kimlik değişiminin gerçek native modal etkileşimi bu tur sınanmadı. R542/R540'ın film eşleşmesi korumalarında bulunmayan IMDb alanı sınırıdır; R815-B48 JSON ayrıştırma hatasından farklıdır.

<a id="r815-b73"></a>

### R815-B73 · P1 — Yapım yüklenirken dil değişimi eski başlığı gösterip yeni kaydı değiştiriyor

**Alt kanıt:** assistant / E03; [yapılandırılmış kayıt](evidence815/extra/assistant/findings.json).

**Konum:** `src/renderer/media-title.js:6,36–39,59,80–87`.

**Tekrar:** A ayrıntısını aç; ardından B ayrıntısını açarken katalog liste yanıtını geciktir. Yanıt beklerken EN/TR dilini değiştir. Sonra B yanıtını döndür ve Favorilere ekle düğmesine bas.

**Beklenen:** B yüklenene kadar yükleniyor durumu korunmalı; A'nın görünür düğmeleri B üzerinde çalışmamalı.

**Gözlenen:** open(B) selected=B yaparken küresel item hâlâ A'dır. Locale olayı `draw(++generation)` ile A'yı yeni dialog'a çizer ve bekleyen B yanıtını generation kontrolüyle geçersiz kılar. Yanıt geldikten sonra başlık A kalır; görünür A favori düğmesi `{id:'B',favorite:...}` gönderir.

**Etki:** Kullanıcı gördüğü yapımdan farklı bir kaydı değiştirebilir. Bekleyen B yanıtının gelmesi görünümü kendiliğinden düzeltmez.

**Kanıt/sınır:** Değiştirilmemiş tam media-title.js; gerçek locale olayı, gecikmeli IPC ve gerçek düğme callback'i. Native görsel kabul yapılmadı. R815-B54 kitap açılış sırasından farklı bileşen/kök; burada eski item, yeni selected ve locale generation birleşimidir.

<a id="r815-b74"></a>

### R815-B74 · P2 — Sürekli gelen asistan metni ara kayda yazılmıyor, kapanışta bütünüyle kaybolabiliyor

**Alt kanıt:** assistant / E04; [yapılandırılmış kayıt](evidence815/extra/assistant/findings.json).

**Konum:** `src/renderer/assistant-workspace.js:32–36,72,107`; kapanış tüketicisi `src/main.js:15066–15128`.

**Tekrar:** Yeni bir asistan cevabı akarken her bir saniyeden kısa aralıkta delta almaya devam et; cevap tamamlanmadan pencereyi kapat.

**Beklenen:** Uzun yanıtın alınan kısmı belirli aralıklarla kalıcı olmalı veya kapanışta son metin flush edilmeli.

**Gözlenen:** partial her deltada aynı bir saniyelik zamanlayıcıyı sıfırlar. Sürekli akışta ara kayıt hiç çalışmaz; pagehide zamanlayıcıyı temizleyip kaydetmez. Prob 200 partial çağrısı sonrası bellekte `Received continuous response 200` varken gerçek assistant-conversations.json cevabının hâlâ boş/streaming olduğunu doğruladı. Ana pencere kapanışı browser/session/watch yazımlarını beklerken asistan arşivi için flush istemiyor.

**Etki:** Uzun cevabın tüm alınmış kısmı, yalnız son saniyesi değil, kaybolabilir; tekrar sağlayıcı çağrısı gerekebilir. Sonraki yüklemede streaming→stopped dönüşümü metni geri getirmez.

**Kanıt/sınır:** Tam workspace modülü ve gerçek assistant-thread-store/disk. Deterministik timer sınırı kullanıldı; normal Windows kapanışı canlı asistanla uçtan uca yeniden oynatılmadı. R531'in yarım kaydı stopped gösterme davranışını geri alınmış saymıyoruz; eksik olan metnin periyodik/kapanış kalıcılığıdır. R815-B47 silme onayıyla ilgisizdir.

<a id="r815-b75"></a>

### R815-B75 · P1 — Açık olumsuz watchlist isteği doğrudan ekleme işlemi yapıyor

**Alt kanıt:** assistant / E05; [yapılandırılmış kayıt](evidence815/extra/assistant/findings.json).

**Konum:** `src/assistant-media-command.js:6–7`; `src/renderer/assistant-media-commands.js:9–23`; `src/renderer/renderer.js:20010–20032`.

**Tekrar:** Geçerli bir kütüphane yapımı seçiliyken asistana `Never add this to my watchlist.` gönder.

**Beklenen:** Açık olumsuz cümle hiçbir katalog mutasyonu başlatmamalı; gerekirse normal sohbet yolunda yanıtlanmalı.

**Gözlenen:** Matcher don't/do not biçimlerini dışlarken never biçimini dışlamıyor. Gerçek aiChatSend dispatcher'ı bu cümleyi doğrudan AssistantMediaCommands'a yönlendiriyor; handler mevcut unspecified kaydını planned olarak kaydediyor. Typed agent çağrısı sıfır: modelin yanlış yorumu veya yalnız regex birim denemesi değildir.

**Etki:** Kullanıcının açıkça istemediği kütüphane durum değişikliği gerçekleştirilir; işlem kartı değerlendirme yolu da çalışmaz.

**Kanıt/sınır:** Gerçek dispatcher fonksiyonu, tam intent/handler modülleri ve kontrollü katalog API tüketicisi. Yalnız bu kesin İngilizce olumsuz örnek sayıldı; diğer diller/komutlar için genelleme yapılmadı. Önceki 54 arasında karşılığı yoktur; backend çeviri olumsuzluk bulguları farklı alandır.

<a id="r815-b76"></a>

### R815-B76 · P2 — Geçerli Türkçe TMDB türü Sana özel önerilerde yok sayılıyor

**Alt kanıt:** assistant / E06; [yapılandırılmış kayıt](evidence815/extra/assistant/findings.json).

**Konum:** `src/catalog-discovery.js:134–141`; `src/media-discovery-service.js:115–122`.

**Tekrar:** Bilgi dili tr-TR iken TMDB'nin Suç türünü taşıyan yapımını favorile; Sana özel bölümünü aç. Başka favori/tür kanıtı bulunmasın.

**Beklenen:** TMDB Suç türü Cinemeta Crime türüne eşlenerek öneri oluşturmalı; mevcut favori tanınmalı.

**Gözlenen:** MetadataClient gerçek detail yolu `genres:['Suç']` üretir. For-you aliases tablosunda Suç yoktur; GENRES yalnız Crime içerir. selected boş kalır, ağ öneri isteği hiç yapılmadan `needsRatings:true` döner. Kullanıcıya zaten yaptığı favori/tür ekleme işi yeniden önerilir.

**Etki:** Varsayılan Türkçe metaveri akışındaki geçerli favoriler bazı türlerde kişiselleştirmeyi tamamen sonuçsuz bırakır.

**Kanıt/sınır:** Gerçek metadata detail→discovery handler zinciri ve kontrollü resmi şemaya uygun TMDB yanıtı. Canlı TMDB hesabı kullanılmadı. Tek Suç örneği doğrulandı; aynı tablodaki diğer eksik çeviriler ayrı bug sayılmadı. R815-B43 puan ölçeğinden farklıdır: bu örnekte hiç puan gerekmiyor, favorite=true yeterlidir.

<a id="r815-b77"></a>

### R815-B77 · P2 — Native duraklatma başarısızken asistan tamamlandı ve durakladı bildiriyor

**Alt kanıt:** assistant / E07; [yapılandırılmış kayıt](evidence815/extra/assistant/findings.json).

**Konum:** `src/renderer/native-player-ui.js:6–13`; `src/renderer/assistant-library-actions.js:21` playback_control.

**Tekrar:** Native oynatıcı etkin ve oynuyor olsun. Asistanın duraklatma işlemi sırasında native komut IPC'si `{ok:false}` dönsün; örneğin mpv iletişim hattı kullanılamaz hâle gelsin.

**Beklenen:** Asistan duraklatmayı doğrulanmış tamamlanma saymamalı; başarısızlık ve gerçek oynatma durumu ayrılmalı.

**Gözlenen:** Native köprü video.pause() içinde sample.paused=true yapıyor, komut sonucunu void bırakıyor ve pause olayı gönderiyor. AssistantLibraryActions bu void çağrıdan sonra completed döndürüyor. Prob `Synthetic pipe unavailable` reddine rağmen asistan completed ve kamuya açık video.paused=true sonucunu doğruladı.

**Etki:** Gerçek oynatıcı durmamış olabileceği hâlde kullanıcı ve takip eden asistan adımları durdu sanabilir. Aynı köprünün seek/volume/speed setter'ları da sonuçları beklemiyor; bu varyantlar ayrı sayılmadı.

**Kanıt/sınır:** Tam native-player-ui + AssistantLibraryActions tüketicisi; kontrollü native IPC. Gerçek mpv/hardware hatası oluşturulmadı, sesin fiziksel olarak sürdüğü iddia edilmez. Yerel başarı bilgisinin başarısız komutla çelişmesi kanıtlandı. R815-B31 native başlatma hatası başka işlem/kod yoludur.

<a id="r815-b78"></a>

### R815-B78 · P2 — Geçerli SSE Content-Type harf değişimi sağlayıcı yanıtını bozuyor

**Alt kanıt:** assistant / E08; [yapılandırılmış kayıt](evidence815/extra/assistant/findings.json).

**Konum:** `src/assistant-provider.js:17–19,98`.

**Tekrar:** OpenAI uyumlu sağlayıcı geçerli SSE gövdesini `Content-Type: Text/Event-Stream` ile döndürsün; aynı gövdeyi küçük harfli text/event-stream ile karşılaştır.

**Beklenen:** MIME türünün büyük/küçük harf farkı ayrıştırma biçimini değiştirmemeli. Tür/alt tür eşleşmesinin harfe duyarsız olması [RFC 2045 §5.1](https://www.rfc-editor.org/rfc/rfc2045#section-5.1) sözleşmesidir.

**Gözlenen:** Büyük/küçük harfe duyarlı includes('text/event-stream') testi karışık harfli türü JSON yanıtı sanıyor. Aynı SSE küçük harfle Fixture answer döndürürken karışık harfle JSON.parse Unexpected token 'd' hatası veriyor. Gerçek provider.run yolu çalıştırıldı.

**Etki:** Protokol açısından eşdeğer bir header kullanan sağlayıcıdan hiçbir yanıt alınamıyor. Bu sağlayıcı uyumluluğu hatasıdır; varsayılan DeepInfra'nın bu header'ı kullandığı iddia edilmez.

**Kanıt/sınır:** Geçerli Response/SSE fixture'ı, gerçek provider.run ve küçük harfli başarılı karşı örnek. Ücretli ağ çağrısı yapılmadı. R815-B48 ana sürecin JSON cevabına düz metin eklemesinden farklıdır: burada SSE yanlış protokolle ayrıştırılmaktadır.

## Ek geliştirme önerileri

Aşağıdaki **27 öneri / ayrıntılandırma bug değildir**. Bazıları yukarıdaki buglar için daha geniş ürün kabulünü, bazıları önceki G01–G05 hedeflerinin somutlaştırılmasını içerir. Örneğin çıktı preflightı ve yerel karışım önizlemesi birbirini tamamlar; tek bir uygulama planında birleştirilebilir. Ham aday sayısı bağımsız özellik sayısı olarak yorumlanmamalı. Ürün koduna uygulanmadılar.

| Öncelik sırası | Paket | Neden önce |
|---|---|---|
| 1 | Yedek geçerliliği, son sağlam yedek, restore bağlantıları | Geri alınamaz veri/iş kaybını önler. |
| 2 | Ses kaynağı ve medya hedefi, native komut makbuzu | İzlenen filmin sesi/kontrolü ve asistan durumunun doğruluğu. |
| 3 | Akış metni checkpointi, yorum iptal/sahiplik | Uzun işin sonucunu ve kullanıcı niyetini korur. |
| 4 | Ölçülen kapasite, worker, preflight/örnek | Güçlü donanımın verimini tepki ve maliyet sınırlarıyla artırır. |
| 5 | Kaynak kimlikleri, dil/tür metadata, tanı | Taşıma ve sonraki oturumlarda tutarlılığı artırır. |

<a id="r815-g06"></a>

### R815-G06 — Büyük yedekleri ana süreç dışında, ilerleme ve iptalle hazırla

**Kaynak öneri:** root / XGROOT01.

**Dayanak:** backup-load-observations.json: 96 MiB sentetik dosyada export 2448 ms; export sonrası RSS +333479936 bayt. Sıfır gecikmeli timer 3446 ms bekledi; bu değer sonraki doğrulama okumasını da içerir, yalnız export süresi diye sunulmaz.

**Fayda:** Güçlü bilgisayarda dahi paket sıkıştırması sırasında IPC, oynatma ve kapatma tepkisini korur.

**Kabul ölçütü:** Ayrı worker/utility process, sınırlı bellek akışı, kullanıcıya bayt/dosya ilerlemesi ve iptal; 100 MiB ve sınıra yakın arşivlerde native UI eylem gecikmesi ayrıca ölçülmeli; yarım paket başarı diye yayımlanmamalı.

<a id="r815-g07"></a>

### R815-G07 — Uzun testler başarısız olsa da kısmi ölçümleri ve son aşamayı kaydet

**Kaynak öneri:** root / XGROOT02.

**Dayanak:** Gerçek start.bat soak: 200/200 capture; hibernasyon3/50 pending-response korumasında durdu; final JSON oluşmadı.

**Fayda:** Saatler süren testin işe yarayan kanıtı kaybolmaz; koruma, fixture yarışı ve kaynak sızıntısı birbirinden ayrılır.

**Kabul ölçütü:** Her50döngü ve aşama sonunda atomik checkpoint; failure JSON'unda tamamlanan döngüler, son guard, kaynak snapshot, stderr sınıflaması; mevcut eşikler yükseltilmemeli ve eksik koşu geçti sayılmamalı.

<a id="r815-g08"></a>

### R815-G08 — Yedeğin kapsadığı ve dışarıda bıraktığı veriyi işlem öncesinde tek envanterde göster

**Kaynak öneri:** root / XGROOT03.

**Dayanak:** Çalışma paketi ile ayrı kitap projesi yedeği farklı kapsamlar taşıyor; STOR­AGE_KEYS yalnız belirli renderer değerlerini alıyor.

**Fayda:** Kullanıcı kitap projesi, ses, model, hesap ve sohbet metninin hangi yedekte olduğunu anlamak için farklı ekranları karşılaştırmaz.

**Kabul ölçütü:** Dosya/kayıt kategorileri, dahil/harici/anahtar içermez bilgisi; son doğrulanmış tarih ve açık geri yükleme denemesi; kişisel mesaj metni gibi içerikler sürpriz olmamalı.

<a id="r815-g09"></a>

### R815-G09 — Windows medya çıktısında kapsayıcı ve codec planını başlamadan doğrula

**Kaynak öneri:** root / XGROOT04.

**Dayanak:** Önceki R815-B16 gerçek WMV/WMA→MP4 audio-copy hatası ve mevcut export araçlarının farklı whitelistleri.

**Fayda:** Uzun video gömme/çeviri işi sonunda önceden bilinebilecek mux hatasını azaltır.

**Kabul ölçütü:** Kapsayıcı, seçilen ses akışı ve encoder uyumluluğu için kısa ffprobe tabanlı plan; kopya mümkün değilse açık yeniden kodlama seçimi; kaynak korunmalı, tespit sonucu tüm videolar için garanti diye sunulmamalı.

<a id="r815-g10"></a>

### R815-G10 — Taşınabilir kayıt kimliğini dosya konumundan ayır

**Kaynak öneri:** root / XGROOT05.

**Dayanak:** Video paketi, eksik kök eşleme ve altyazı/not/watchKey referansları birden çok yol temsili kullanıyor.

**Fayda:** Sürücü harfi veya makine değişince izleme geçmişi, not ve senkronların ayrı ayrı yeniden bağlanma ihtiyacını azaltır.

**Kabul ölçütü:** Kararlı varlık kimliği + yerel locator; dosya taşındığında bütün ilişkiler tek transaction ile güncellenmeli; eski profil migrasyonu geri alınabilir ve çakışma kullanıcıya açık olmalı.

<a id="r815-g11"></a>

### R815-G11 — Donanıma göre ölçülen iş bütçesi ve gerçek zamanlı kaynak görünürlüğü ekle

**Kaynak öneri:** root / XGROOT06.

**Dayanak:** Gerçek GPU RTX4070SUPER12GB; donanım adı kapasite garantisi değil. Üretimde ASR/TTS, video decode ve Electron birlikte kaynak kullanıyor.

**Fayda:** Güçlü PC daha fazla işi taşıyabilirken VRAM baskısında video ve altyazı deneyimi korunur.

**Kabul ölçütü:** Opt-in sentetik kalibrasyon; aktif iş/model başına VRAM/RSS/duvar süresi ve kuyruk; sabit eşik gevşetmek yerine eşzamanlılık ölçüme dayansın; müzik analizi kapsamı açılmasın.

<a id="r815-g12"></a>

### R815-G12 — Geri yükleme sonrası bağlantı doğrulaması ve toplu yeniden bağlama özeti sun

**Kaynak öneri:** root / XGROOT07.

**Dayanak:** XROOT01/02 bağlantıların dosyalar mevcutken bile çözümlenemediğini gösteriyor.

**Fayda:** Restore ok:true ile gerçek kullanılabilirlik arasındaki fark kullanıcıya görünür olur.

**Kabul ölçütü:** Yerel izinli dosyalarda bulunan/eksik/belirsiz kaynaklar, etkilenen not/altyazı/proje sayısı; ağ yoluna kendiliğinden dokunmadan tek klasör seçimiyle kontrollü plan; kullanıcı onayı öncesi mevcut ilişkiler değişmemeli.

<a id="r815-g13"></a>

### R815-G13 — Denetlenen medya hedefini görünür kıl

**Kaynak öneri:** browser / EX-G01.

**Fayda:** Çok videolu sayfada hangi element/framein komut, OCR ve dublaj hedefi olduğunu kullanıcı doğrulayabilir.

**Kabul ölçütü:** Medya araçları seçili hedefin sayfa/kare, görünürlük ve oynatma durumunu gösterir; kullanıcı başka görünür medyayı seçebilir; gizli/iframe aday değişiminde seçim sessizce kaymaz.

<a id="r815-g14"></a>

### R815-G14 — Ses işleme sağlık durumu ve güvenli kaynak değişimi

**Kaynak öneri:** browser / EX-G02.

**Fayda:** Normalizasyon açıldıktan sonraki sessizlik nedenini ses ayarı/Windows sorunu sanmadan anlaşılır kılar.

**Kabul ölçütü:** Kaynak origin/CORS değişimi tanıda görünür; güvenli olmayan graph geçişi belirgin uyarı verir; kaynak yeniden kurulduğunda zaman/mute/volume tercihi korunur; CORS atlatma yok.

<a id="r815-g15"></a>

### R815-G15 — Sayfa genelinde tek bağlantı etiketi oturumu

**Kaynak öneri:** browser / EX-G03.

**Fayda:** Cross-origin iframe bulunan video/ödeme/giriş sayfalarında klavye gezintisi tahmin edilebilir olur.

**Kabul ölçütü:** Aynı görünür anda tüm frame kodları benzersizdir; activate,Escape,scroll,navigation tüm alt frame katmanlarını temizler; odağın top/child olduğu iki native senaryo doğrulanır.

<a id="r815-g16"></a>

### R815-G16 — Akış tercihi deposu için veri kaybı olmadan kimlik geçişi

**Kaynak öneri:** browser / EX-G04.

**Fayda:** Mevcut generic tercihleri çöpe atmadan stream bazlı seçim ve senkron devamlılığı sağlar.

**Kabul ölçütü:** Aynı watch URLdeki iki manifest ayrı kayıtla round-trip olur; eski base kayıt tekvideoya tahminle bağlanmaz; belirsiz eski seçim kullanıcıya geri kazanma seçeneğiyle sunulur.

<a id="r815-g17"></a>

### R815-G17 — Düşük maliyetli, olay destekli shadow medya yeniden keşfi

**Kaynak öneri:** browser / EX-G05.

**Fayda:** Geç yüklenen web component oynatıcıları çalışırken büyük SPA sayfalarının sürekli tam taranmasını önler.

**Kabul ölçütü:** Başlangıç rootu, sonradan attachShadow, host çıkarıp yeniden takma ve observer128sınırı ayrı native fixturelarla çalışır; kapalı root için açık destek sınırı gösterilir; timer/observer bütçesi ölçülür.

<a id="r815-g18"></a>

### R815-G18 — Mini oynatıcıda ortak dil ve erişilebilirlik sözleşmesi

**Kaynak öneri:** browser / EX-G06.

**Fayda:** İngilizce ana arayüz kullanan kişi ayrı pencerede Türkçe düğmelerle karşılaşmaz; küçük penceredeki kontrol amaçları açık olur.

**Kabul ölçütü:** Mini player title,document.lang,nav aria-label,dört düğme ve hata metni EN/TR seçimini izler; dil değişimi/reopen aynı sonucu verir. Bug sayısına eklenmedi; mevcut browser-mini.html/js metin borcudur.

<a id="r815-g19"></a>

### R815-G19 — Kaynak değişimi için kısa native kabul matrisi

**Kaynak öneri:** browser / EX-G07.

**Fayda:** Salt birim testlerin kaçırdığı belge/element/src yaşam döngüsü sınırlarını az sayıda hedefli kontrolle kapsar.

**Kabul ölçütü:** Aynı-belge element replacement, aynı-element src replacement, cross-origin ses geçişi ve dub-rate release ayrı beklenen durumlar verir; testler kendi PID/profil/localhost sunucularını kapatır; kişisel oturum kullanılmaz.

<a id="r815-g20"></a>

### R815-G20 — Sıcak motor kapasitesinin yeniden boyutlandırılmasını açık politika yap

**Kaynak öneri:** backend / XI01.

**Fayda:** 4paralel yüklü motorun8isteğini sessizce4te tutması yerine kullanıcı GPU bütçesi/yeniden yükleme kararını anlar.

**Kabul ölçütü:** Kontrollü4→8 senaryosunda yeterli kapasite varsa güvenli motor yenilenir veya8in sonraki soğuk başlangıçta uygulanacağı açık gösterilir;4→4 gereksiz yüklemez.

**Sınıflandırma:** Tasarım/geliştirme; mevcut GPUya göre kapasite düşürme politikası nedeniyle bug sayılmadı.

<a id="r815-g21"></a>

### R815-G21 — Üretim öncesi kaynak ses parçası kimliğini tek tarifte dondur

**Kaynak öneri:** backend / XI02.

**Fayda:** Referans hazırlama, prosody, arka plan ayırma ve Whisper farklı çok dilli kanalları sessizce seçmez.

**Kabul ölçütü:** Çok sesli sentetik MKVde seçili kanal kimliği bütün alt işlere taşınır; belirsiz YouTube çok dilinde seçim veya sınırlı uyarı olur. Kişisel sağlayıcı ayarı değişmez.

<a id="r815-g22"></a>

### R815-G22 — Kısa örnek için gerçek tahmini süre ve bütçe göster

**Kaynak öneri:** backend / XI03.

**Fayda:** Tek büyük cue veya yavaş konuşma örneğinin beklenenden uzun sürmesi önceden görülür.

**Kabul ölçütü:** Örnek planı kaynak aralığı, seçili grup, tahmini ses/sentez süresini gösterir;55sn hedefi aşılınca açık neden ve kapsam seçimi vardır; metin otomatik kesilmez.

<a id="r815-g23"></a>

### R815-G23 — Kalite kartında akustik, ASR ve insan dinlemesini ayrı kanıtlar olarak tut

**Kaynak öneri:** backend / XI04.

**Fayda:** Ready/Review tek rozeti doğrulayıcı yokluğu veya yalnız kelime benzerliğiyle insan doğallığı onayını karıştırmaz.

**Kabul ölçütü:** Saved project→reopen sonrasında acoustic checked, ASR passed/review/unavailable/not_checked ve listening unchecked/checked ayrı korunur; hiçbir kontrollü ASR testi insan dinlemesi diye işaretlenmez.

<a id="r815-g24"></a>

### R815-G24 — Senkron önizlemesinde ölçülebilir güven özeti sun

**Kaynak öneri:** backend / XI05.

**Fayda:** Sessiz/ritimsiz kaynakta0korelasyon veya az destek yanlış bir başarı hissi oluşturmaz.

**Kabul ölçütü:** Aktif ses oranı, aday offset/ratio skoru ve zayıf/bağlı sonuç görünür; sessiz4sn fixture kesin hizalanmış diye sunulmaz. Kaynak/önceki çıktı kullanıcı kararı olmadan değişmez.

<a id="r815-g25"></a>

### R815-G25 — Dublajı dışa aktarmadan önce kısa lokal karışım önizlemesi ve hedef preflightı

**Kaynak öneri:** backend / XI06.

**Fayda:** Uzun render öncesi ses katmanı seviyesi, hedef disk alanı ve dosya sistemi sınırları anlaşılır.

**Kabul ölçütü:** Aynı mix/sync motoruyla seçili5–10sn önizleme; sessiz/tepe sınırı görünür. Yetersiz boş alan veya exclusive-install desteği eksik hedef render başlamadan açıklanır; kullanıcının kişisel ses/ayarları değiştirilmez.

<a id="r815-g26"></a>

### R815-G26 — Canlı ASR dil geçişinde düşük güvenli ara gözlemlerin politikasını açıklaştır

**Kaynak öneri:** backend / XI07.

**Fayda:** Bir önceki dilde fallback ile çözülen kararsız parçanın dil değiştirme aday sayacını kesip kesmediği belirli olur.

**Kabul ölçütü:** ENyüksek→TRyüksek→DEdüşük/ENfallback→TRyüksek senaryosunun beklenen durumu ürün kararı olarak belgelenir; ardından gerçek sesli dil değişimi/kararsızlık kabulü yapılır. Araya yüksek güvenliEN girince mevcut reset korunur.

**Sınıflandırma:** XB03 deterministik davranışı ölçüldü; mevcut kodun düşük güvenli gözlemleri yok sayma politikası olabileceğinden kesin bug sayılmadı.

<a id="r815-g27"></a>

### R815-G27 — Yorum kanıtını sürüm ve kaynak kimliğiyle birlikte karşılaştır

**Kaynak öneri:** assistant / G-E01.

**Fayda:** Önceki ve yeni analizlerin hangi IMDb/TMDB kimliğine, hangi yorum örneğine ve hangi tarihe ait olduğu tek bakışta anlaşılır; aynı film adı eski analizi güncelmiş gibi göstermez.

**Kabul ölçütü:** Analiz kaydında tam yapım kimliği, yorum örneği hash'i, kaynak URL listesi, sağlayıcı/model adı ve tarih bulunur; anahtar/tam kişisel yol saklanmaz. Aynı filmde yeni örnek karşılaştırması özetlenir; farklı kimlikteki eski analiz ayrı tutulur. Eski şema kayıtları eksik kanıt etiketiyle korunur.

<a id="r815-g28"></a>

### R815-G28 — Sohbette gerçekten diske yazılan son yanıt durumunu göster

**Kaynak öneri:** assistant / G-E02.

**Fayda:** Kullanıcı uzun cevap sırasında hangi metnin kurtarılabilir olduğunu bilir; kaydetme hatası sıradan sohbet cevabına karışmaz.

**Kabul ölçütü:** Periyodik checkpoint'in tamamlandığı revision/tarih gösterilebilir; debounce veya sadece bellek güncellemesi kaydedildi sayılmaz. Kapanışta bounded flush, disk hatasında açık durum ve tekrar deneme bulunur. Kontrollü sürekli akış/kapanış/disk reddi senaryolarında gösterilen durum diskle eşleşir.

<a id="r815-g29"></a>

### R815-G29 — Yorum okuma aşamalarını durdurma sahibiyle görünür kıl

**Kaynak öneri:** assistant / G-E03.

**Fayda:** Film kimliği çözümü, sayfa indirme, metin ayıklama ve model analizi birbirinden ayrılır; kullanıcı hangi işi durdurduğunu anlayabilir.

**Kabul ölçütü:** İstek kimliği ilk asenkron aşamadan önce kaydedilir; iptal yalnız aynı kimliği etkiler. Durduruldu terminalinden sonra yeni ağ çağrısı olmaz. Yeni deneme eski görevin geç sonucu veya iptal onayıyla etkilenmez; örnek metni korunur.

<a id="r815-g30"></a>

### R815-G30 — Tür bilgisini görünen dilden bağımsız kanonik kimlikle taşı

**Kaynak öneri:** assistant / G-E04.

**Fayda:** Türkçe/İngilizce etiket veya kaynak değişikliği öneri sonuçlarını sessizce ortadan kaldırmaz; kullanıcının tür metni kendi dilinde kalabilir.

**Kabul ölçütü:** TMDB sayısal tür kimlikleri/Cinemeta eşlemeleri üzerinden kararlı bir iç tür saklanır; görünen etiket ayrı tutulur. Suç/Crime ve kaynakların farklı Science Fiction/Sci-Fi adları aynı kategoriye gider. Eşlenemeyen tür için gerekçe görünür; yanlış needsRatings mesajı verilmez.

<a id="r815-g31"></a>

### R815-G31 — Native oynatma işlemlerine doğrulanmış sonuç makbuzu ekle

**Kaynak öneri:** assistant / G-E05.

**Fayda:** Kullanıcı ve asistan bir komutun gönderilmesini, kabulünü ve gerçek oynatıcı durumunu ayırabilir; başarısız komut sonraki adımı yanlış bilgiyle başlatmaz.

**Kabul ölçütü:** pause/seek/rate/volume için komut kimliği ve bounded timeout vardır; completed ancak eşleşen başarı/durum geri okumasıyla üretilir. Hata sonradan gelen başka komutun durumunu geri sarmaz. Gerçek native süreç kabulü ve kontrollü IPC reddi ayrı raporlanır; UI iyimser gösterim varsa geçici olduğu belirtilir.

<a id="r815-g32"></a>

### R815-G32 — Sağlayıcı bağlantı tanısında protokol aşamalarını ayır

**Kaynak öneri:** assistant / G-E06.

**Fayda:** Kullanıcı kimlik doğrulama, HTTP, MIME/SSE ayrıştırması ve model formatı hatalarını birbirinden ayırarak doğru sağlayıcı ayarını düzeltebilir.

**Kabul ölçütü:** Tanı çıktısı anahtar, ham özel kaynak veya Authorization header içermez. MIME harf farkı, standart SSE satır sonları, yarım akış ve JSON fallback kontrollü yanıtlarla sınanır. Kontrol sonucu canlı model kalitesi veya bütün sağlayıcıların desteği diye sunulmaz.


## Ek turda dışarıda bırakılanlar ve birincil kaynaklar

Sıcak motorun 4→8 isteği, düşük güvenli dil ara gözlemlerinin politika yorumu ve [man] etiketinin gerçek sentez etkisi strict bug sayısına girmedi. Gizli iframe etiket karşı kontrolü geçti. Bu olumsuz sonuçlar/kararsızlıklar kanıt JSON'larında saklandı; sayıyı doldurmak için bug yapılmadı. Önceki dependency advisories bu 24 ek içinde de sayılmadı.

Kaynaklar uygulamaya kod olarak alınmadı. Ses graph güvenliği [W3C 2021 Recommendation](https://www.w3.org/TR/2021/REC-webaudio-20210617/#MediaElementAudioSourceOptions-security), MIME türü eşdeğerliği [RFC9110§8.3.1](https://www.rfc-editor.org/rfc/rfc9110.html#section-8.3.1) ve [RFC2045§5.1](https://www.rfc-editor.org/rfc/rfc2045#section-5.1), Windows ağ yolu ayrımı [Microsoft dosya yolları](https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file) ile karşılaştırıldı. UNC sorgusunun NTLM sonucu işletim sistemi politikasına bağlıdır; [Microsoft SMB NTLM açıklaması](https://learn.microsoft.com/en-us/windows-server/storage/file-server/smb-ntlm-blocking) riskin koşullu olduğunu destekler. Testte hiçbir UNC bağlantısı yapılmadı. Performans önerisi [Electron süreç metrikleri](https://www.electronjs.org/docs/latest/api/app#appgetappmetrics) ve mevcut synchronous paket yoluna dayanır.

**Teslim:** Yalnız rapor, seçilmiş sentetik kanıt ve tarihli devir. Ürün/test/bağımlılık/ayar değişikliği yok; bu 78 bug açık bırakıldı. Önceden değişmiş OFFLINE-MANIFEST/raporINDEX, silinmiş start.sh ve kişisel untracked dosyalar commit dışında korunur.


<!-- HUNDRED-AUDIT-815 -->

<a id="yüz-hedefi-25-yeni-bulgu"></a>

## Yüz hedefi: 25 yeni bulgu

**Sonuç: önceki 78 + bu tur 25 = 103 doğrulanmış bug. Yeni 6 P1 / 19 P2; genel toplam 29 P1 / 74 P2.** Aynı hata farklı dil/format/ekran örneğiyle tekrar sayılmadı. Her yeni kaydın önceki rapor ve mekanizma ilişkisi aşağıda belirtilir. Eski 1000 senaryonun PASS kayıtları yeni çalışma veya yeni bug sayılmadı.

| ID | Önem | Hata | Alt kanıt |
|---|---|---|---|
| [R815-B79](#r815-b79) | P2 | Model durumu ve silme onayı başka depoyu gösterirken ilk yarım depo siliniyor | root / HR01 |
| [R815-B80](#r815-b80) | P2 | Model silme onayı beklenirken başlayan işten sonra busy koruması yeniden denetlenmiyor | root / HR02 |
| [R815-B81](#r815-b81) | P1 | Tek mükerrer kayıt onarımı seçilse de seçilmeyen başka kimliklerin kayıtları da siliniyor | root / HR03 |
| [R815-B82](#r815-b82) | P2 | Şeması geçersiz JSON yedeği sağlam sayılıp geri yükleniyor ve katalog hâlâ açılmazken sağlık temiz görünüyor | root / HR04 |
| [R815-B83](#r815-b83) | P2 | Altyazı varlık kaydı dikey yazım/sunum bilgisini kaybediyor | browser / HB01 |
| [R815-B84](#r815-b84) | P2 | Tarayıcı oturum paketi seslendirme çevirisinin forSpeech ve protokol bilgisini siliyor | browser / HB02 |
| [R815-B85](#r815-b85) | P2 | DASH Representation SegmentTemplate üst şablon niteliklerini devralmıyor | browser / HB03 |
| [R815-B86](#r815-b86) | P2 | Geçerli XML namespace önekli DASH MPD altyazısı keşfedilmiyor | browser / HB04 |
| [R815-B87](#r815-b87) | P2 | TTML çocuk altyazısı üst zaman kapsayıcısının bitişinde kesilmiyor | browser / HB05 |
| [R815-B88](#r815-b88) | P2 | TTML statik metinle karışık zamanlı span tüm paragraf boyunca erken gösteriliyor | browser / HB06 |
| [R815-B89](#r815-b89) | P2 | Geçerli TTML sequential ve örtük başlangıçlı paragraflar tamamen düşüyor | browser / HB07 |
| [R815-B90](#r815-b90) | P2 | İçerik adresli altyazı varlığı geçerli JSON içeriği bozulunca hashini doğrulamadan kabul ediyor | browser / HB08 |
| [R815-B91](#r815-b91) | P1 | Yalnız noktalama düzeltmesi kaynak olumsuzluğunu tersine çeviren yanıtı başarılı sayıyor | backend / HB01 |
| [R815-B92](#r815-b92) | P2 | Bir veya iki kelimelik kaynakta LLM büyüklük koruması devre dışı kalıyor | backend / HB02 |
| [R815-B93](#r815-b93) | P2 | LLM temizlemede kalıcı401 hatasından sonra kuyruktaki her paket sağlayıcıya gönderiliyor | backend / HB03 |
| [R815-B94](#r815-b94) | P1 | Adaptive indirme başarısız yeniden denemede önceki sağlam video dosyasını siliyor | backend / HB04 |
| [R815-B95](#r815-b95) | P1 | YouTube ses dilini değiştirmek aynı videoID dosyasından eski dildeki sesi geri kullanıyor | backend / HB05 |
| [R815-B96](#r815-b96) | P1 | LLM temizleme açık length bitişini yok sayıp kesik metni final SRTye yazıyor | backend / HB06 |
| [R815-B97](#r815-b97) | P1 | Araştırma güvenlik kontrolü özel adrese yönlendirme yüklendikten sonra çalışıyor | assistant / H01 |
| [R815-B98](#r815-b98) | P2 | Araştırma kaynak bütçesi dolunca yeni W1 metni eski W1 kaynak listesine bağlanıyor | assistant / H02 |
| [R815-B99](#r815-b99) | P2 | Sonuçla devam et önceki atıfları ve işlem günlüğünü kalıcı kayıttan kaldırıyor | assistant / H03 |
| [R815-B100](#r815-b100) | P2 | Korece kitap araması normalleştirilmiş ofsetle özgün metni kesip boş kanıt döndürüyor | assistant / H04 |
| [R815-B101](#r815-b101) | P2 | Başarısız ayar değişimi geri alınsa da önceki geçerli Geri al kaydı siliniyor | assistant / H05 |
| [R815-B102](#r815-b102) | P2 | Tümünü tekrarla döngüsü biten parçayı eski devam konumundan başlatıyor | assistant / H06 |
| [R815-B103](#r815-b103) | P2 | Eski ses oynatıcısını kapatma yanıtı sonradan başlayan yeni parçayı siliyor | assistant / H07 |

### Revizyon, doğrulama ve kapsam

Bu tur başlangıcı **da773134a3e744885592bafa008f81f03bcdf878** idi. İnceleme sürerken başka yetkili çalışma R816'yı birleştirip ana kopyayı **ae0a61a7b42c58d78bb7317680cf8f8133d5e027** revizyonuna ilerletti. Bu denetim o ürün düzeltmelerini yapmadı. Yeni bulgular güncel dosyalarda yeniden çalıştırıldı; kaynak SHA256 değerleri tek tek bağlandı. Üç ajan yine **GPT‑6.1 Sol / medium effort** kullandı. [Revizyon/önceki bulgu tekrar kaydı](evidence815/hundred/prior-revalidation.json).

R816'nın değiştirdiği backend yollarından etkilenebilecek önceki bulgular için üç eski kontrollü iş akışı yeniden çalıştırıldı: olumsuz örnekler, cache, VTT/ASS ve resume speaker kaybı ilgili çıktılarda sürdü. Bunlar yeni 25 sayısına katılmadı. Eski G02'deki uzun çeviri boşlukları R816'daki 361/361 tamamlama kanıtıyla artık aynı tarihsel durumda değildir; oradaki eski paragraf tarihsel bağlamdır. Önceki dinleyici uyarısı için cleanup değişikliği de başka çalışmaya aittir ve baştan beri bug sayısında değildi.

Ana süreç **6 yeni yeniden üretme iş akışı** çalıştırdı; hepsi exit0 ve beklenen hatalı davranış assertion'larını geçti. Bu, bugların düzeldiği veya tam paketin geçtiği anlamına gelmez. Browser native kontrolü gerçek Electron 43.5.0/Windows üzerinde HTTP200 XML, DOMParser namespace/well-formedness, orijinal parser/capture ve dikey overlay tüketicisini sınadı; düz DASH karşı kontrolü 2 cue/complete:true verdi. Araştırma yönlendirmesinde sadece test sürecine ait genel-ad→localhost eşlemesi kullanıldı; yasak hedefe 1 sentetik HTTP isteği geldikten sonra güvenlik reddi gözlendi. Dış özel ağ/hesap/kimlik bilgisi yoktur. [Ana süreç kanıtı](evidence815/hundred/parent-verification.json).

Backend, kontrollü Whisper/OpenAI sonucunu **gerçek transcribe→FFmpeg→LLM cleanup→final SRT** yolundan geçirdi; yanlış ve doğru karşı örneklerin dosya hashleri kaydedildi. İndirme hatası ve ses dili cache'inde gerçek FFmpeg, kurulu yt-dlp selector/downloader ve yalnız localhost HTTP kullanıldı; YouTube metadata çıkarımı kontrollüydü. UI/asistan işlemlerinin çoğu tam gerçek modüller+JSDOM/geciktirilmiş IPC/disk ile sınandı. Bunlar ücretli model kalitesi veya tam kişisel uygulama E2E kabulü değildir.

Bu tur yeni tam npm suite, install.bat/start.bat açılışı, DRM/hesap, gerçek GPU/TTS/ASR modeli, fiziksel dinleme/ekran okuyucu veya CI sonucu doğrulanmadı. Önceki 200 döngülü tamamlanmamış soak yeniden geçti diye sunulmadı. Sentetik SAPI referans üretimi kullanılabilir ses/güvenlik ayarı engeline takılınca GPU adayı durduruldu; sıfır bayt deneme dosyası kanıt sayılmadı veya yayımlanmadı. Kullanıcının kişisel ayarları, profili, dosyaları ve açık uygulaması korunur.

<a id="r815-b79"></a>

### R815-B79 · P2 — Model durumu ve silme onayı başka depoyu gösterirken ilk yarım depo siliniyor

**Alt kanıt:** root / HR01; [ayrıntılı JSON](evidence815/hundred/root/findings.json).

**Kod:** `src/model-manager.js:109`, `src/model-manager.js:136`, `src/model-manager.js:161`, `src/main.js:19510`, `src/main.js:19524`

**Tekrar:** Aynı large-v3-turbo kimliği için alfabetik önce gelen mobiuslabsgmbh deposunda yarım indirme, sonraki Systran deposunda tam dosya kümesi bulunsun. Model durumunu al, ardından seçili kimliği sil.

**Beklenen:** Onayda gösterilen kullanılabilir depo/boyut ile silinen hedef aynı olmalı veya birden çok kopya açıkça listelenmeli.

**Gözlenen:** scanModelCache Systran deposunu installed:true ile gösteriyor; deleteCachedModel mobiuslabsgmbh yarım deposunu silip ok:true döndürüyor. Systran dosyaları duruyor ve son durum hâlâ installed:true.

**Kök neden:** Tarama ilk usable eşleşmeyi tercih ediyor; silme ise requireUsable=false ile ilk eşleşmeyi alıyor. IPC onayı model kimliğini taşıyor, gösterilen depo kimliğini dondurmuyor.

**Etki:** Kullanıcının kaldırdığını düşündüğü hazır model diskten kalkmaz; onaylanan boyut ile boşalan alan ve silinen depo farklı olur. Bu, modelin bütün kopyalarını silme önerisi değildir.

**Önceki kapsam:** R815-B08 standart cache kökünün bulunmamasıydı; burada kök doğru ve aynı ID'nin iki geçerli repo durumu arasında tarama/silme seçimi ayrışıyor. R119 genel onay/silme happy-path'i bu iki-kopya sınırını kapsamıyor.

**Sınır:** Gerçek sentetik dizin silmesi ve ürün metadata kontrolleri çalıştı. Dosyalar sahte ağırlık içerir; model yüklenebilirliği veya Hugging Face indirme kalitesi sınanmadı. Kişisel cache okunmadı/silinmedi.

**Kabul ölçütü:** Karma tam/yarım iki depo ve iki cache kökünde önizlenen hedef ile silinen hedef aynı kimlik olmalı; hedef değişmişse yeniden onay istenmeli.

**Tekrar sonucu:** [observations.json](evidence815/hundred/root/observations.json).

<a id="r815-b80"></a>

### R815-B80 · P2 — Model silme onayı beklenirken başlayan işten sonra busy koruması yeniden denetlenmiyor

**Alt kanıt:** root / HR02; [ayrıntılı JSON](evidence815/hundred/root/findings.json).

**Kod:** `src/main.js:19500`, `src/main.js:19505`, `src/main.js:19514`, `src/main.js:19524`

**Tekrar:** Başta aktif iş yokken models:delete başlat; native onay Promise'i beklesin. Bu sırada önceden sıraya alınmış bir iş activeJob durumuna geçsin; onayı tamamlat.

**Beklenen:** Silme anında da çalışan model/iş koruması geçerli olmalı; onay açılmadan önceki boş durum kalıcı kilit kabul edilmemeli.

**Gözlenen:** Üretim IPC handler'ında activeJob doluyken silme ok:true döndü ve kendi sentetik model depo dizini gerçekten kaldırıldı.

**Kök neden:** Busy denetimi showMessageBox await'inden önce bir kez var; yanıt sonrası doğrudan deleteCachedModel çağrılıyor. Aynı dosyadaki benchmark handler'ı dosya diyaloğu sonrasında doğru karşı denetimi yapıyor.

**Etki:** Otomatik/önceden sıraya alınmış iş başladığında uygulamanın model işi sırasında silmeme sözleşmesi bozulur; dosya kilidi hatası, yeniden yükleme/indirme veya sonraki adımın dosya bulamaması riski oluşur.

**Önceki kapsam:** R815-B30 form/capture drain kapatma koruması, R815-B18 belge export kimliği farklı sahiplik sınırlarıdır. Bu yeni kayıt models:delete'in kendi busy/onay yaşam döngüsüdür; genel aynı-await örüntüsü ayrı kök gibi tekrar sayılmadı.

**Sınır:** Orijinal handler değiştirilmeden VM'de çalıştı; native onay ve çalışan iş kontrollü durumdur. Gerçek modal açıkken fiziksel tıklama/GPU modeli veya aktif ağırlık dosyası kilidi yaratılmadı. Parent modal inputu engelleyebilir; aday tetikleyici önceden zamanlanmış/background iş başlangıcıdır.

**Kabul ölçütü:** Onay beklerken activeJob/burnin/liveASR/benchmark gibi korunmuş durum oluşursa hiçbir cache dosyası silinmeden açık busy sonucu dönmeli.

**Tekrar sonucu:** [observations.json](evidence815/hundred/root/observations.json).

<a id="r815-b81"></a>

### R815-B81 · P1 — Tek mükerrer kayıt onarımı seçilse de seçilmeyen başka kimliklerin kayıtları da siliniyor

**Alt kanıt:** root / HR03; [ayrıntılı JSON](evidence815/hundred/root/findings.json).

**Kod:** `src/data-integrity.js:250`, `src/data-integrity.js:274`, `src/data-integrity.js:304`, `src/data-integrity.js:352`

**Tekrar:** Katalogda A ve B için ikişer farklı kayıt oluştur; veri bütünlüğü taraması iki duplicate bulsun. Yalnız dup-catalog:A onarımını seçip uygula.

**Beklenen:** Seçilen A grubu onarılmalı; seçilmeyen B'nin iki kaydı ve elle birleştirme imkânı korunmalı.

**Gözlenen:** Sonuç applied yalnız A bildirirken B sayısı da 2→1 düştü; eski B kaydı ve içeriği ana belgeden kaldırıldı. .integrity.bak ilk dosyayı içeriyor.

**Kök neden:** applyRepair dedupeGeneric'i hedef key filtresi olmadan çağırıyor; yardımcı bütün belgeyi kimliğe göre tekilleştiriyor. dedupeWatchLibrary de aldığı key'i hiç kullanmıyor. Katalog/sekme/watch/tombstone çeşitleri aynı kapsam hatası olarak tek sayıldı.

**Etki:** Kullanıcı seçmediği kişisel kaydı kaybeder; yalnız seçilen bulguların uygulanacağı onay sözleşmesi ihlal edilir. Ham yedek bulunması izinsiz kapsam genişlemesini doğru yapmaz.

**Önceki kapsam:** R815-B47 yanlış sohbet silme onayı başka UI/store köküdür; burada bakım aracının seçilen ID→onarım planı daraltması yoktur. Mevcut data-integrity testi farklı dosyadaki seçilmeyen bozuk kaydı koruyor; aynı dosyanın başka duplicate kimliğini sınamıyor.

**Sınır:** Gerçek auditUserData/applyRepairs ve sentetik JSON disk durumu kullanıldı. Profil veya gerçek kayıt onarılmadı. Yedekten elle kurtarma mümkündür; fiziksel geri alınamaz silinme iddiası yoktur.

**Kabul ölçütü:** Her repair.key yalnız seçili grubu değiştirmeli; seçilmeyen tüm kimlikler byte/alan düzeyinde korunmalı ve uygulanan kapsam sonuçta açıkça görünmeli.

**Tekrar sonucu:** [observations.json](evidence815/hundred/root/observations.json).

<a id="r815-b82"></a>

### R815-B82 · P2 — Şeması geçersiz JSON yedeği sağlam sayılıp geri yükleniyor ve katalog hâlâ açılmazken sağlık temiz görünüyor

**Alt kanıt:** root / HR04; [ayrıntılı JSON](evidence815/hundred/root/findings.json).

**Kod:** `src/data-integrity.js:21`, `src/data-integrity.js:63`, `src/data-integrity.js:296`, `src/media-catalog-store.js:213`

**Tekrar:** Katalog ana dosyası bozuk JSON; .bak ise parse edilebilir ama items dizisi olmayan {version:1,wrongProperty:[]} olsun. Sağlam .bak bulundu diyen onarımı uygula; yeniden sağlık taraması ve gerçek katalog list() tüketicisini aç.

**Beklenen:** Yedek ilgili deponun şemasından geçmeden sağlam/onarılabilir sayılmamalı. Başarısız geri yükleme sonrasında sağlık temiz ve onarıldı denmemeli.

**Gözlenen:** Onarım applied döndürüyor, ana dosyaya geçersiz zarfı yazıyor ve sonraki audit issues=[] veriyor. Gerçek createMediaCatalogStore.list() 'Katalog dosyası ve güvenli yedeği okunamadı' ile hâlâ başarısız.

**Kök neden:** Sağlık/restore yalnız JSON.parse başarısını ölçüyor; katalog şeması ve normal yükleyici sözleşmesi doğrulanmıyor. Dosya JSON olarak bozuk değil ama ürün verisi olarak kullanılamaz.

**Etki:** Kullanıcı başarılı kurtarma ve temiz sağlık sonucu alırken medya kütüphanesi kapalı kalır; sonraki sorun giderme yanlış yönlendirilir.

**Önceki kapsam:** R815-B57 export/otomatik retention geçersiz arşivi başarı sayıyordu; bu farklı bağımsız bakım tüketicisi/backup şema doğrulamasıdır. R357 katalog ana okuyucusunun şema koruması burada çalışarak problemin sürdüğünü kanıtlıyor; o koruma kaldırılmış sayılmaz.

**Sınır:** Orijinal bozuk dosya .integrity.bak içinde korunuyor; gerçek katalog/denetim modülleri sentetik diskle sınandı. Kişisel yedeğe dokunulmadı. Tek katalog zarfı kanıtlandı; bütün depo şemalarına sonuç genellenmedi.

**Kabul ölçütü:** Desteklenen her depo yedeği kendi şema/versiyon normalizer'ından geçmeli; geçersiz örnek için repair sunulmamalı ve read-only hata orijinal dosyayı korumalı.

**Tekrar sonucu:** [observations.json](evidence815/hundred/root/observations.json).

<a id="r815-b83"></a>

### R815-B83 · P2 — Altyazı varlık kaydı dikey yazım/sunum bilgisini kaybediyor

**Alt kanıt:** browser / HB01; [ayrıntılı JSON](evidence815/hundred/browser/findings.json).

**Kod:** `src/browser-asset-store.js:14`, `src/browser-asset-store.js:113`, `src/main.js:9834`, `src/main.js:9888`, `src/browser-overlay-controller.js:728`

**Tekrar:** Orijinal BrowserAssetStore.putTrack/getTrack round-trip içinde writingMode:rl,speaker,region,line,position taşıyan cue kaydet. Kaynak ve dönen cueyu gerçek Windows overlay scriptine sırayla ver.

**Beklenen:** Depo, ürünün desteklediği dikey yazım gibi cue metadata bilgisini round-tripte korumalı.

**Gözlenen:** Kaynakta writingMode rl, depoda alan yok. Native overlay önce vertical-rl, sonra boş writingMode döndürdü.

**Kök neden:** Asset normalizer yalnız id/start/end/text ve sınırlı identity/quality/provenance alanlarını projekte ediyor; presentation alanları kaybediliyor.

**Etki:** Doğu Asya dikey altyazısı kayıttan açılınca yataya döner; konuşmacı ve sunum bilgisi JSONda da geri getirilemez.

**Gerçek tüketici:** persistBrowserTrack→BrowserAssetStore.putTrack; restorePersistedBrowserTracks→getTrack→SRT path ve cueIdentities. Orijinal overlay writingMode alanını kullanıyor.

**Önceki kapsam:** R815-B42 backend checkpoint speaker kaybından ayrı varlık depo kökü. R444 kalite warning düzeltmesi bu alanları kapsamıyor. Önceki 78de aynı kök yok.

**Sınır:** Native ölçüm tam renderer-main yeniden açılışı değildir: gerçek kaydedilmiş cue nesnesinin gerçek overlay tüketicisindeki sonucu. line/position/region overlayde kasıtlı uygulanmıyor; bug kanıtı özellikle desteklenen writingMode ile kuruldu.

**Tekrar sonucu:** [results.json](evidence815/hundred/browser/results.json) · [native HTTP/overlay kontrolü](evidence815/hundred/browser/native-network-result.json).

<a id="r815-b84"></a>

### R815-B84 · P2 — Tarayıcı oturum paketi seslendirme çevirisinin forSpeech ve protokol bilgisini siliyor

**Alt kanıt:** browser / HB02; [ayrıntılı JSON](evidence815/hundred/browser/findings.json).

**Kod:** `src/browser-session-package.js:76`, `src/main.js:16599`, `src/renderer/renderer.js:11535`

**Tekrar:** forSpeech:true ve güncel speech-v15-idiom-anchor-feedback taşıyan gerçek asset documentı createBrowserSessionPackage→inspectBrowserSessionPackage→putTrack zincirinden geçir.

**Beklenen:** Taşınabilir oturum, çeviri varyantının kullanım/protokol kimliğini korumalı.

**Gözlenen:** Dışa aktarım öncesi true/v15; içe aktarılan asset false/boş protokol oldu.

**Kök neden:** sanitizeVariantın izinli projeksiyonu forSpeech/speechProtocol alanlarını içermiyor; asset.safeMeta eksik değerleri false/boş varsayıyor.

**Etki:** Hazır seslendirme çevirisi importtan sonra sıradan çeviri sayılır; reuse eşleşmesi bozulup kullanıcı gereksiz ücretli çeviri veya yeniden hazırlamaya yönelir.

**Gerçek tüketici:** collectBrowserSessionVariants saved.document toplar; package sanitizer düşürür; importBrowserSessionVariants putTrack yapar; renderer11535 forSpeech/protocol eşleşmesini zorunlu kılar.

**Önceki kapsam:** Önceki 78de yok. EX-BR07 generic streamId deposu kimlik kaybı farklı alan/normalizerdır.

**Sınır:** Güncel v15 ile ae0a61a HEADte tekrarlandı; gerçek sağlayıcı/GPU kullanılmadı. Metin kaybı değil, varyant niteliği/reuse kaybı.

**Tekrar sonucu:** [results.json](evidence815/hundred/browser/results.json) · [native HTTP/overlay kontrolü](evidence815/hundred/browser/native-network-result.json).

<a id="r815-b85"></a>

### R815-B85 · P2 — DASH Representation SegmentTemplate üst şablon niteliklerini devralmıyor

**Alt kanıt:** browser / HB03; [ayrıntılı JSON](evidence815/hundred/browser/findings.json).

**Kod:** `src/browser-subtitles.js:876`, `src/browser-subtitles.js:892`, `src/main.js:11634`

**Tekrar:** AdaptationSet düzeyinde media=sub-$Number$.vtt,duration5,timescale1 ve Representation düzeyinde yalnız initialization içeren geçerli MPD sun. Orijinal parseDashSubtitleMatchers çalıştır.

**Beklenen:** Representation şablonu belirtilmeyen media/duration/timescale alanlarını üst SegmentTemplate üzerinden devralmalı.

**Gözlenen:** Kalıtımlı MPD0matcher; yalnız initialization childını kaldıran parent-only karşıörnek2matcher. Gerçek nativeHTTP ve flat capture2cue/complete:true.

**Kök neden:** Rep template varsa adaptationTemplate tümüyle yok sayılıyor; alan bazlı inheritance yapılmıyor.

**Etki:** Yaygın katmanlı DASH manifestinde sayfa oynarken altyazı keşfi tamamen boş kalır.

**Gerçek tüketici:** captureBrowserResponse manifest dalı main11634 parseDashSubtitleMatchers→captureDashSegments. Native kontrollü HTTPde aynı orijinal fonksiyonlar kullanıldı.

**Önceki kapsam:** R304 geniş DASH zinciri temiz taraması bu inheritance varyantını dinamik doğrulamamış. Önceki 78de yok.

**Sınır:** DASH schema validator çalıştırılmadı. Semantik Google Shaka gerçek inheritAttribute uygulaması ve resmi MPEG/DASH kaynaklarıyla karşılaştırıldı; dış kod alınmadı.

**Tekrar sonucu:** [results.json](evidence815/hundred/browser/results.json) · [native HTTP/overlay kontrolü](evidence815/hundred/browser/native-network-result.json).

<a id="r815-b86"></a>

### R815-B86 · P2 — Geçerli XML namespace önekli DASH MPD altyazısı keşfedilmiyor

**Alt kanıt:** browser / HB04; [ayrıntılı JSON](evidence815/hundred/browser/findings.json).

**Kod:** `src/browser-subtitles.js:878`, `src/browser-subtitles.js:1177`, `src/main.js:11634`

**Tekrar:** Aynı namespace/localName içeriğini önce default namespace <MPD>, sonra xmlns:dash bağlı <dash:MPD> şeklinde sun. Orijinal direct track parserı çağır.

**Beklenen:** XML prefix seçimi aynı expanded namesi taşıyan manifestin işlenmesini değiştirmemeli.

**Gözlenen:** Default biçim1iz; prefixed biçim0iz. Windows DOMParser localNameMPD, doğru MPEG namespace ve parserErrors0 doğruladı.

**Kök neden:** MPD,Period,AdaptationSet,Representation gibi XML öğeleri namespace-aware ayrıştırma yerine çıplak isim regexleriyle taranıyor; ilk MPD guardı bile prefixed rootu reddediyor.

**Etki:** Namespace öneki kullanan geçerli sağlayıcı manifestlerinde altyazı yokmuş gibi davranılır.

**Gerçek tüketici:** main manifest parserı parseDashSubtitleTracks ve parseDashSubtitleMatchers kullanıyor; her iki giriş çıplak MPD bekliyor.

**Önceki kapsam:** HB03 nitelik mirası; bu XML ad çözümlemesi kökü. TTML namespace temizliği R492de farklı parserdaydı. Önceki 78de yok.

**Sınır:** Canlı sağlayıcı denenmedi; gerçek Chromium XML parse ve native HTTP sentetik manifest. XML well-formedness/namespace sonucu DASH tam schema conformance iddiası değildir.

**Tekrar sonucu:** [results.json](evidence815/hundred/browser/results.json) · [native HTTP/overlay kontrolü](evidence815/hundred/browser/native-network-result.json).

<a id="r815-b87"></a>

### R815-B87 · P2 — TTML çocuk altyazısı üst zaman kapsayıcısının bitişinde kesilmiyor

**Alt kanıt:** browser / HB05; [ayrıntılı JSON](evidence815/hundred/browser/findings.json).

**Kod:** `src/browser-subtitles.js:1365`, `src/browser-subtitles.js:1382`, `src/browser-subtitles.js:1463`, `src/main.js:11796`

**Tekrar:** div begin10s dur2s altında p begin0s dur20s Hello içeren TTMLyi orijinal parseSubtitlePayload ile işle.

**Beklenen:** Çocuk görünür aktif aralığı ebeveyn kapsayıcı aktif aralığının dışına çıkmamalı.

**Gözlenen:** Cue10–30 oldu; kapsayıcı10–12 olduğundan beklenen son12. Native HTTPde aynı sonuç.

**Kök neden:** Parent context yalnız başlangıç offseti ve sunum taşır; ebeveyn end/dur aktif sınırı hesaplanıp childa uygulanmıyor.

**Etki:** Altyazı kapandığı sahneden18saniye sonra bile görünür; senkron ve çeviri sahne bağlamı bozulur.

**Gerçek tüketici:** Ağ body parseSubtitlePayload→parseXml→storeBrowserTrack→overlay/saved subtitle. Native response200/validXML→aynı parser zinciri koştu.

**Önceki kapsam:** R304 ebeveyn offset birikimini inceledi; bu end/dur clipping farklı invariant. Önceki 78de yok.

**Sınır:** Özel TTML profillerinin tamamı test edilmedi; W3C zaman-kapsama semantiğinin küçük fixtureı.

**Tekrar sonucu:** [results.json](evidence815/hundred/browser/results.json) · [native HTTP/overlay kontrolü](evidence815/hundred/browser/native-network-result.json).

<a id="r815-b88"></a>

### R815-B88 · P2 — TTML statik metinle karışık zamanlı span tüm paragraf boyunca erken gösteriliyor

**Alt kanıt:** browser / HB06; [ayrıntılı JSON](evidence815/hundred/browser/findings.json).

**Kod:** `src/browser-subtitles.js:1407`, `src/browser-subtitles.js:1411`, `src/browser-subtitles.js:1422`, `src/main.js:11796`

**Tekrar:** p begin0/end10 içinde Static metni ve span begin5/end10 Late metni ver. Orijinal TTML parserını çalıştır.

**Beklenen:** 0–5 Static;5–10 Static Late görünmeli veya eşdeğer zaman katmanları korunmalı.

**Gözlenen:** 0–10 tek cue Static Late çıktı; Late 0–5 arasında5saniye erken.

**Kök neden:** outsideText varsa fastpath inner metnin tamamını tek paragraph intervalinde çıkarıp timedSpans döngüsünü atlıyor.

**Etki:** Paragraf içi paint-on/karaoke konuşması zamansız açığa çıkar; sahne sırası ve zaman eşlemesi bozulur.

**Gerçek tüketici:** Browser ağ TTML ve kullanıcı dosyası parseSubtitlePayload→parseXml; native HTTP aynı üretim parserını doğruladı.

**Önceki kapsam:** R492 namespace span/br temizliği farklı; R815-B40 VTT inline timestamp başka parser ve sözdizimi. Önceki 78de yok.

**Sınır:** W3C statik anonim span+zamanlı child semantiğiyle karşılaştırıldı; fiziksel video yanında çizim değil, üretilen cue zamanları doğrulandı.

**Tekrar sonucu:** [results.json](evidence815/hundred/browser/results.json) · [native HTTP/overlay kontrolü](evidence815/hundred/browser/native-network-result.json).

<a id="r815-b89"></a>

### R815-B89 · P2 — Geçerli TTML sequential ve örtük başlangıçlı paragraflar tamamen düşüyor

**Alt kanıt:** browser / HB07; [ayrıntılı JSON](evidence815/hundred/browser/findings.json).

**Kod:** `src/browser-subtitles.js:1383`, `src/browser-subtitles.js:1397`, `src/browser-subtitles.js:1464`, `src/main.js:11796`

**Tekrar:** div timeContainer=seq içinde p dur2 First ve p dur3 Second (begin alanları olmadan) olan TTMLyi işle.

**Beklenen:** TTML seq kapsayıcıda begin yazılmayan çocukların başlangıcı önceki kardeş bitişinden türetilmeli.

**Gözlenen:** cues[] ve format boş; beklenen First0–2,Second2–5. Native XML parserErrors0 ve HTTP200.

**Kök neden:** parseXml açık start/begin/t olmadan startnull bırakıyor; yalnız startnonnull satırı push ediyor. timeContainer seq/kardeş cursoru da hiç hesaplanmıyor.

**Etki:** Tamamen geçerli bir timed-text dosyası altyazı yok gibi kaybolur.

**Gerçek tüketici:** Browser response parseSubtitlePayload→parseXml. W3C TTML1 timeContainer seq ve Pop-On Captions örneği aynı yapı/mekanizmayı tanımlar.

**Önceki kapsam:** HB05 açık başlangıçlı cue ebeveyn end clipping; HB06 mixed span flattening. Bu seq/implicit temporal cursor kökü. Önceki 78de yok.

**Sınır:** Tek bug sayıldı: örtük begin düşmesi ve seq scheduling ayrı bug diye şişirilmedi. Profile/fps/SMPTE kapsamı denenmedi.

**Tekrar sonucu:** [results.json](evidence815/hundred/browser/results.json) · [native HTTP/overlay kontrolü](evidence815/hundred/browser/native-network-result.json).

<a id="r815-b90"></a>

### R815-B90 · P2 — İçerik adresli altyazı varlığı geçerli JSON içeriği bozulunca hashini doğrulamadan kabul ediyor

**Alt kanıt:** browser / HB08; [ayrıntılı JSON](evidence815/hundred/browser/findings.json).

**Kod:** `src/browser-asset-store.js:121`, `src/browser-asset-store.js:151`, `src/browser-asset-store.js:156`, `src/browser-asset-store.js:165`

**Tekrar:** putTrack ile Hello cue kaydet; dosyanın yalnız cues[0].text alanını Jello yapıp geçerli JSON/assetIdyi koru; getTrack(originalAssetId) çağır.

**Beklenen:** İçerik adresi ile kanonik meta/cues hashinin uyuşmazlığı saptanmalı; bozulmuş kanonik JSON sağlam diye kabul edilmemeli.

**Gözlenen:** ok:true/Jello döndü; eski sağlam SRT de otomatik Jello içeriğiyle yeniden yazıldı. AssetId değişmedi.

**Kök neden:** getTrack yalnız version ve payload.assetId stringinin parametreye eşitliğini kontrol eder; putTrackte hesaplanan contentHash yeniden hesaplanmaz. Sonra JSON kanonik sayılıp mevcut SRT üzerine yazılır.

**Etki:** Yedek/kopyalama/disk bozulması geçerli JSON olarak kaldığında altyazı ve türetilmiş SRT sessizce değişir; içerik kimliği yanlış metni işaret eder.

**Gerçek tüketici:** restorePersistedBrowserTracks main9898 ve session export collector getTrack kullanır; mevcut iyi SRTyi content-address id doğrulaması yapmadan onarır.

**Önceki kapsam:** R25-B5 eski JSON/SRT atomik mismatch köküydü ve SRTyi kanonik JSONdan onarma giderildi. Bu ayrı içerik hash doğrulaması eksikliği; önceki 78de yok.

**Sınır:** Disk bozulması sentetik tek alan değişimiyle canlandırıldı; gerçek disk bozulma sıklığı veya kötü amaçlı dosya sistemine karşı güvenlik garantisi iddia edilmez.

**Tekrar sonucu:** [results.json](evidence815/hundred/browser/results.json) · [native HTTP/overlay kontrolü](evidence815/hundred/browser/native-network-result.json).

<a id="r815-b91"></a>

### R815-B91 · P1 — Yalnız noktalama düzeltmesi kaynak olumsuzluğunu tersine çeviren yanıtı başarılı sayıyor

**Alt kanıt:** backend / HB01; [ayrıntılı JSON](evidence815/hundred/backend/findings.json).

**Kod:** backend/transcribe.py:3147

**Yöntem:** Gerçek transcribe→FFmpeg→llm_postprocess→SRT yazıcı/OutputTransaction; Whisper ve OpenAI yanıtları kontrollü.

**Tekrar:** ASR kaynak Please do not open the red door.; yalnız llm_fix_punctuation açık. Sağlayıcı finish_reason=stop ile Please open the red door now. verir.

**Beklenen:** Yalnız noktalama seçildiğinde sözcük/olumsuzluk/komut anlamı değişmemeli; sözleşme dışı çıktı korunmuş kaynak ve açık uyarıyla reddedilmeli.

**Gözlenen:** Gerçek final SRTde Please open the red door now.; llm_progress done1 failed0, done.warnings=[]. Noktalama kontrolü hello world→Hello, world. kabul edilir.

**Etki ve kök:** Kaynağa ters düşen komut son altyazıya sessiz yazılır. Kök: kabul kapısı yalnız yaklaşık kelime/karakter büyüklüğüyle çalışıyor; seçili punctuation-only işleminde anlam taşıyan sözcük değişimini korumuyor.

**Önceki kapsam:** R815-B37/B38 ASR sonrası ses doğrulayıcısının yanlış kabulleriydi; bu ses modeline gitmeden kaynak transkripsiyonunu değiştirip son SRTye yazan ayrı LLM temizleme yolu. F14/F17 aileleriyle genel örtüşme; önceki 78 içinde yok.

**Sınır:** Gerçek ücretli LLMnin bu yanıtı verdiği iddia edilmez. Kontrollü sağlayıcının belirgin anlam değişimini gerçek tüketicinin kabulü kanıtıdır.

**Tekrar sonucu:** [observations.json](evidence815/hundred/backend/observations.json).

<a id="r815-b92"></a>

### R815-B92 · P2 — Bir veya iki kelimelik kaynakta LLM büyüklük koruması devre dışı kalıyor

**Alt kanıt:** backend / HB02; [ayrıntılı JSON](evidence815/hundred/backend/findings.json).

**Kod:** backend/transcribe.py:3158

**Yöntem:** Gerçek llm_postprocess ve tam transcribe/FFmpeg/final SRT tüketicisi; kontrollü ASR/editor.

**Tekrar:** Tek kelime Hello. kaynağına800kelime/6800karakter geçerli JSON edit cevabı ver. Aynı cevabı4kelimelik This is original text. kaynağına da ver.

**Beklenen:** Kısa kaynakta da mutlak/göreli metin bütçesi aşımı reddedilmeli; birleşik kelime ayırma gibi küçük büyümeler desteklenebilir.

**Gözlenen:** Tek kelimede6800karakter kabul, SRT6834karakter; cleanup done1 failed0 ve cleanupwarnlist boş. Tam tüketici ayrıca genel800kelimelik noktalama uyarısı üretir; bu boyut/uydurma ret uyarısı değildir ve dosya korunmuş kaynak yerine yeni metni içerir.4kelimelik kontrol gerçek finalSRTde kaynak metni korur, cleanupfailed1ve1/1reddi uyarısı vardır.

**Etki ve kök:** Tek kısa cueya yüzlerce uydurma kelime yazılır; okunamaz dosya ve gereksiz downstream kaynak tüketimi. Kök: words_off yalnız ow>=3 veya spaceless script durumunda true olabilir; chars_off tek başına hiçbir üst sınır sağlamaz.

**Önceki kapsam:** HB01 yaklaşık aynı uzunlukta anlam ters çevrilmesini; bu farklı short-input koşulunun boyut savunmasını kaldırmasını gösterir. Boyut eşiğini düzeltmek HB01i çözmez; anlam demirleriHB02nin mutlak kaynak bütçesi yerine geçmez. Önceki 78de yok.

**Sınır:** 800kelime sentetik, ücretli sağlayıcı ve OOM/çökme iddiası yok; büyüklük kabulü ve gerçek dosya sonucu ölçüldü.

**Tekrar sonucu:** [observations.json](evidence815/hundred/backend/observations.json).

<a id="r815-b93"></a>

### R815-B93 · P2 — LLM temizlemede kalıcı401 hatasından sonra kuyruktaki her paket sağlayıcıya gönderiliyor

**Alt kanıt:** backend / HB03; [ayrıntılı JSON](evidence815/hundred/backend/findings.json).

**Kod:** backend/transcribe.py:3169

**Yöntem:** Gerçek ThreadPoolExecutor/llm_postprocess istek ve route_error_is_fatal yolu; kontrollü OpenAI401.

**Tekrar:** 90cue, llm_workers=1, ilk ve bütün sağlayıcı çağrıları status_code401 invalid_api_key. Aynı corpus için mevcut llm_translate fatal kontrolünü çalıştır.

**Beklenen:** Bilinen kalıcı kimlik/yetki hatası sonrası henüz başlamamış paketler aynı iş için tekrar gönderilmemeli; kaynak korunup terminal hata raporu kalmalı.

**Gözlenen:** Temizleme3APIisteği yapar; ilk401 sonrası iki queued paket daha gönderilir. Çeviri negatif kontrolü1istekte durur. Kaynak metin korunur,90/90uyarı vardır.

**Etki ve kök:** Uzun dosyada her30cue için boşa istek ve gecikme; geçersiz hesapta sağlayıcı baskısı artar. Kök: request() fatal hatayı yalnız o pakette fırlatır, havuzun queued işlerine ortak stop işareti ulaşmaz.

**Önceki kapsam:** llm_translate fatal_stop koruması zaten var; farklı cleanup yolu. Gece F13/F14 hata/timeout kayıtları genel aile kanıtıdır; önceki 78de bu kuyruk mekanizması yok.

**Sınır:** Gerçek401servisine veya ücretli sağlayıcıya çıkılmadı; kontrollü hata sınıfı gerçek istek/havuz yolunu çalıştırır. Metin kaybı iddia edilmez.

**Tekrar sonucu:** [observations.json](evidence815/hundred/backend/observations.json).

<a id="r815-b94"></a>

### R815-B94 · P1 — Adaptive indirme başarısız yeniden denemede önceki sağlam video dosyasını siliyor

**Alt kanıt:** backend / HB04; [ayrıntılı JSON](evidence815/hundred/backend/findings.json).

**Kod:** backend/media.py:482

**Yöntem:** Gerçek FFmpeg MP4, gerçek loopbackHTTP ve download_stream tüketicisi; ağ hatası gerçekHTTP404.

**Tekrar:** Önce aynı Synthetic media/fixture kimliğiyle1sn yerelHTTP videosunu başarılı indir. Aynı çıktı klasörü/başlık/ID ile ikinci isteği404vererek tekrar başlat.

**Beklenen:** Yalnız mevcut çağrının oluşturduğu partial/staged dosyalar temizlenmeli; önceki tamamlanmış final korunmalı.

**Gözlenen:** İlk6584bayt sağlam MP4ün SHA256sı alındı; ikinci HTTPError sonrası önceki final dosya yok.404FFmpeg başlamadan gelir.

**Etki ve kök:** Tek ağ hatası önceki başarılı indirmeyi kalıcı kaybettirir. Kök: except BaseException her out_path varlığını bu çağrıya ait sayıp unlink ediyor.

**Önceki kapsam:** R302 indirme güvenlik kontrolünü ve yarım çıktı temizliğini kaydeder; o ifade önceki tamamlanmış dosya sahipliği sınırını doğrulamaz. R815-B19 MHTML partial overwrite ayrı modül/protokol; backend adaptive video cleanup yeni mekanizma.

**Sınır:** Yalnız test klasöründeki sentetik MP4 silindi. Loopback dışında ağ yok; kişisel medya veya dosya silinmedi.

**Tekrar sonucu:** [observations.json](evidence815/hundred/backend/observations.json).

<a id="r815-b95"></a>

### R815-B95 · P1 — YouTube ses dilini değiştirmek aynı videoID dosyasından eski dildeki sesi geri kullanıyor

**Alt kanıt:** backend / HB05; [ayrıntılı JSON](evidence815/hundred/backend/findings.json).

**Kod:** backend/transcribe.py:359

**Yöntem:** Gerçek yt-dlp selector+HTTP downloader, gerçek FFmpeg Opus fixtureları ve T.download_youtube. Yalnız YouTube extractor metadata kontrollü.

**Tekrar:** Aynı video için EN440Hz ve TR880Hz iki mevcutwebm ses formatı sun. Önce audio_lang=en indir; aynı klasörde audio_lang=tr iste. Ayrı yeni klasörde TR kontrolünü indir.

**Beklenen:** Gerçek format/dil değişince eski ses yeniden kullanılmamalı; disk kimliği seçili dil/formatı ayırmalı veya mevcut dosyanın tarifi doğrulanmalı.

**Gözlenen:** İkinciTR isteğinde /tr HTTPisteği hiç yok; aynıID.webm ve ENhash döner. Yeni klasördeTR /tr isteği oluşur ve farklıhash gelir.

**Etki ve kök:** Oynatıcıda TR seçen kullanıcı Whispere ENses gönderebilir; yanlış dil/kaynak bağlamı ve boşa transkripsiyon. Kök: outtmpl yalnız%(id)s.%(ext)s; yt-dlp aynı uzantı dosyasını already-downloaded sayıyor, audio_lang kimliğe katılmıyor.

**Önceki kapsam:** R815-B41/B70 LLM çeviri hafızasının prompt bağlamıydı; burada medya baytları indirilmeden önceki ses parçası/dil kimliği eksik. Önceki 78de yok; F16 kırpılmışmedya kaynak ailesiyle ilişkili.

**Sınır:** Gerçek YouTube bağlantısı/hesap gerekmedi. Kontrollü extractor metadata dışında gerçek kurulmuş yt-dlp indirme/yeniden kullanım davranışıdır; frekanslar dil semantiği değil kesin farklı stream baytlarıdır.

**Tekrar sonucu:** [observations.json](evidence815/hundred/backend/observations.json).

<a id="r815-b96"></a>

### R815-B96 · P1 — LLM temizleme açık length bitişini yok sayıp kesik metni final SRTye yazıyor

**Alt kanıt:** backend / HB06; [ayrıntılı JSON](evidence815/hundred/backend/findings.json).

**Kod:** backend/transcribe.py:3136

**Yöntem:** Gerçek transcribe/FFmpeg/cleanup/final writer; kontrollü OpenAI finish_reason=length.

**Tekrar:** İki cümleli geçerli kaynak; sağlayıcı ilk cümleyi içeren geçerliJSON ama finish_reason=length döndürsün. Kaynağın son uyarı cümlesi yoktur.

**Beklenen:** Sağlayıcı length bitişi, içerik JSON olsa da eksik kabul edilmeli; kaynak korunup paket yeniden denenmeli veya açık başarısız sayılmalı.

**Gözlenen:** Kesik ilk cümle sonSRTye yazılır; llm_progress done1 failed0, done.warnings=[]. Açık token truncation sinyali hiç okunmaz.

**Etki ve kök:** Kaynak cümle/uyarı kaybı tam temizleme gibi yayımlanır. Kök: cleanup cevap protokolünde choices[0].finish_reason incelenmeden content parse edilip kabul edilir.

**Önceki kapsam:** HB01 stop ile dönen tam görünümlü anlam terslemesi, HB02 kısa kaynak boyut kapısıdır. length kontrolünü eklemek onları çözmez; bu ayrı provider terminal sözleşmesi. Çeviri yolunda truncation mekanizması mevcut. Önceki 78de yok.

**Sınır:** Gerçek model token limitine sokulmadı; sağlayıcının açık terminal bayrağına üretim tüketicisinin verdiği yanıt kanıtlandı.

**Tekrar sonucu:** [observations.json](evidence815/hundred/backend/observations.json).

<a id="r815-b97"></a>

### R815-B97 · P1 — Araştırma güvenlik kontrolü özel adrese yönlendirme yüklendikten sonra çalışıyor

**Alt kanıt:** assistant / H01; [ayrıntılı JSON](evidence815/hundred/assistant/findings.json).

**Kaynak:** `src/main.js:20232–20242`; `src/assistant-web-research.js:2` safeSource; genel gezinme kontrolü `src/main.js:13585–13592`.

**Tekrar:** Araştırmanın izin verdiği genel bir HTTP(S) kaynak URL'si 302 ile localhost/özel ağ hedefine yönlendirsin. Araştırma helper'ının gerçek load fonksiyonu kullanılmalı.

**Beklenen:** Genel kaynaklardan okuma sözleşmesi ve safeSource'un açık özel-adres yasağı yönlendirme isteğinden önce uygulanmalı; yasak hedef yüklenmemeli.

**Gözlenen:** load önce `await wc.loadURL(url)` yapıyor, yalnız tamamlandıktan sonra son URL'ye safeSource uyguluyor. Native fixture'da ilk istek `public-fixture.invalid:55799/start`, ikinci istek `127.0.0.1:55799/private-fixture` oldu. Özel hedef sayacı1'e çıktıktan sonra `Unsafe research redirect.` hatası geldi. Hata, yapılmış isteği geri almıyor.

**Etki:** Arama kaynağının yönlendirmesi araştırma isteğini kullanıcının açıkça istemediği özel hizmete ulaştırabilir. İçerik okumaya devam edilmesi veya gerçek ağ kimlik bilgisi sızıntısı kanıtlanmadı; kesin kanıt, uygulamanın reddettiği adrese isteğin redden önce ulaşmasıdır.

**Kanıt:** `native-redirect-result.json` gerçek Chromium HTTP isteklerini; `results.json:H01` aynı kaynak helper'ını kontrollü wc sınırıyla tekrarlar. Yerel fixture yalnız sentetik HTML içerir. Native BrowserWindow tüm kullanıcı uygulaması/main polling testi değildir; değişmemiş ana süreç load fonksiyonu aynen çıkarılıp gerçek webContents ile çağrıldı. Ana browser will-redirect denetimi HTTP/HTTPS adreslerini izinli tutuyor ve araştırmaya özel private-adres kapısı içermiyor. Mevcut78'de karşılığı yoktur; sıradan browser'ın kullanıcı tarafından açılmış LAN sayfası hata sayılmadı.

<a id="r815-b98"></a>

### R815-B98 · P2 — Araştırma kaynak bütçesi dolunca yeni W1 metni eski W1 kaynak listesine bağlanıyor

**Alt kanıt:** assistant / H02; [ayrıntılı JSON](evidence815/hundred/assistant/findings.json).

**Kaynak:** `src/assistant-agent-service.js:72–78,156`.

**Tekrar:** Aynı asistan turunda beş farklı research_web çağrısı yapılsın; her biri üç farklı geçerli kaynak ve pasaj döndürsün. Bu, mevcut altı provider raundu sınırı içinde mümkündür.

**Beklenen:** Kaynak bütçesi dolarsa yeni sonuç açıkça kısıtlanmalı veya kaynak kimlikleri tutarlı biçimde korunmalı; metin ile sources aynı W numaralarını temsil etmeli.

**Gözlenen:** session.webSources ilk10 URL'de kesiliyor. Beşinci aramanın üç yeni pasajı bu listede bulunmadığından passages boş kalıyor; fallback `result.text` yerel `[W1] source5-1` metnini döndürüyor. Aynı tool sonucunun sources[0] değeri hâlâ `source1-1` ve yeni beşinci aramanın kaynaklarından hiçbiri kaynak listesinde yok. Son yanıtın ana süreç kaynak eki de eski listeyi kullanıyor.

**Etki:** Asistanın kullandığı W kaynak kimlikleri yanlış makaleyi işaretleyebilir; başarılı araştırma sonucu kaynak kimliğiyle doğrulanamaz hâle geliyor. Canlı modelin yanlış iddia ürettiği söylenmedi; modele verilen doğrulanmış kaynak sözleşmesinin çeliştiği kanıtlandı.

**Kanıt:** Gerçek register/agentRun/provider döngüsü; beş gerçek tool dispatch ve kontrollü araştırma sonuçları. URLs example alanlarıdır, ağ çağrısı yoktur. R815-B48/B78 JSON/MIME sorunlarından farklıdır; yanıt formatı geçerlidir, kaynak kimlikleri karışmaktadır.

<a id="r815-b99"></a>

### R815-B99 · P2 — Sonuçla devam et önceki atıfları ve işlem günlüğünü kalıcı kayıttan kaldırıyor

**Alt kanıt:** assistant / H03; [ayrıntılı JSON](evidence815/hundred/assistant/findings.json).

**Kaynak:** `src/renderer/assistant-workspace.js:69–71`; `src/renderer/assistant-agent-ui.js:19–23,36–38`; kaynak kartı tüketimi `src/renderer/global-assistant.js:53–57`.

**Tekrar:** Son asistan yanıtında kitap alıntısı ve tamamlanmış işlem günlüğü bulunsun; aynı yanıttaki uygulanmış karttan Sonuçla devam et çalışsın. Yeni tur ek kitap araması/araç adımı üretmesin.

**Beklenen:** Önceki metin korunuyorsa bu metnin kaynak kartı ve geçmiş işlem kanıtı da korunmalı; yalnız yeni kanıtlar eklenmeli veya ayrı tur olarak saklanmalı.

**Gözlenen:** resume önceki text/actions/evidence alanlarını taşıyor ama citations/steps taşımıyor. Yeni task.trace boş olduğundan finish eski steps'i [] yapıyor; `result.bookCitations||[]` eski citations'ı [] ile değiştiriyor. Probun sonuç metninde `[B1-0]` hâlâ bulunurken citations0 ve steps0; gerçek assistant-conversations.json dosyasında da son yanıt citations0 olarak kaydedildi.

**Etki:** Önceki metindeki alıntının tıklanabilir kaynak kartı ve uygulamanın önceki işlem kanıtı kaybolur; yeniden açılış bunları getiremez. Bu, görsel daralma veya sınırlı liste değildir; aynı yanıtın kalıcı metadata'sı sıfırlanır.

**Kanıt:** Tam workspace+agent-ui modülleri, gerçek thread-store/disk; geçerli son yanıt/kart üzerinden gerçek resume/send yolu. Provider/IPC kontrollüdür; native overlay yeniden açılışı denenmedi. R798/R800'ün kalıcı işlem/alıntı sözleşmesindeki devam sınırıdır. R815-B74 sürekli akış kapanış kaybından farklıdır: burada tur başarıyla tamamlanır ve metadata silinerek kaydedilir.

<a id="r815-b100"></a>

### R815-B100 · P2 — Korece kitap araması normalleştirilmiş ofsetle özgün metni kesip boş kanıt döndürüyor

**Alt kanıt:** assistant / H04; [ayrıntılı JSON](evidence815/hundred/assistant/findings.json).

**Kaynak:** `src/assistant-retrieval.js:4,7–11`; `src/renderer/assistant-book-search.js:10–15`; gerçek tüketici `src/renderer/book-assistant-ui.js:227`.

**Tekrar:** Korece bir paragrafın ardından Latin harfli özel ad bulunan sayfa/bölüm aç; o özel adı kitapta ara. Sentetik örnekte 423 karakterlik geçerli Korece metin içinde SENTINELNAME birebir bulunur.

**Beklenen:** Arama eşleşmesinin alıntısı gerçek metindeki özel adı ve yakın bağlamını içermeli; dönen özgün ofset metin uzunluğunun dışında olmamalı.

**Gözlenen:** NFKD Korece heceleri birden fazla jamo harfine açıyor. `hay.indexOf` normalleştirilmiş dizginin konumunu verirken `text.slice` bu konumu özgün diziye uyguluyor. Probda returnedOffset693, özgün uzunluk423, returnedMatchText boş oldu. Tam BookAssistantUI.assistant.search tüketicisi bu boş eşleşmeyi aynen asistan sonucuna taşıdı.

**Etki:** Kaynakta doğrudan bulunan isim için arama başarılı eşleşme bildirir ama asistanın açıklayabileceği/alın­tılayabileceği metni vermez. Model cevabı veya Korece transkripsiyon kalitesi sınanmadı.

**Önceki ilişki:** R246/R247/R300 browser adres aramasında Hangul/yoğun dizin ve özgün ofset haritasını ele alır; o düzeltmelerin geri alındığı iddia edilmez. Buradaki bağımsız assistant-retrieval modülü aynı haritayı kullanmıyor. Önceki 78 kitap aramasının bu Unicode konum sınırını içermiyor.

<a id="r815-b101"></a>

### R815-B101 · P2 — Başarısız ayar değişimi geri alınsa da önceki geçerli Geri al kaydı siliniyor

**Alt kanıt:** assistant / H05; [ayrıntılı JSON](evidence815/hundred/assistant/findings.json).

**Kaynak:** `src/renderer/assistant-workflow-actions.js:4–7,21–23`.

**Tekrar:** Asistanla arayüz temasını başarıyla değiştir; get_workflow_settings canUndo=true olsun. Ardından aynı appearance alanında dil değişimi başlat; kaydetme başarısız, geri alma kaydı başarılı olsun.

**Beklenen:** Başarısız yeni değişiklik önceki değerleri tamamen koruduğundan önceki başarılı temanın Geri al işlemi kullanılabilir kalmalı.

**Gözlenen:** Yeni deneme başında `last=null` yapılıyor. Hata sonrası değerler geri yükleniyor ancak önceki last kaydı geri getirilmiyor. Prob before/after bütün appearance değerlerini eşit doğrularken canUndo true→false oldu.

**Etki:** Kullanıcı hâlâ geçerli olan önceki asistan ayar değişikliğini normal Geri al aracıyla geri alamaz; elle eski değerleri bilmek gerekir. Son ayar değerleri bozuldu iddiası yoktur.

**Kanıt/sınır:** Gerçek index.html kontrolleri ve tam workflow-actions; kontrollü false/true kayıt yanıtları. Fiziksel disk arızası oluşturulmadı. R707'deki mevcut snapshot/rollback kontrollerinin kapsamadığı geçmiş kayıt sınırıdır; R815-B51 tercih formu taslağının silinmesi değildir.

<a id="r815-b102"></a>

### R815-B102 · P2 — Tümünü tekrarla döngüsü biten parçayı eski devam konumundan başlatıyor

**Alt kanıt:** assistant / H06; [ayrıntılı JSON](evidence815/hundred/assistant/findings.json).

**Kaynak:** `src/renderer/media-shelf-ui.js:63,129–150,156`; `src/renderer/music-queue.js:8`.

**Tekrar:** Kayıtlı dinleme konumu30sn olan tek parçalı kuyruğu aç; Tümünü tekrarla'yı etkinleştir; parça100sn sonunda bitsin.

**Beklenen:** İlk açılış kayıtlı30sn'den devam edebilir; tamamlanan parçanın sonraki tekrar turu0sn'den başlamalı.

**Gözlenen:** repeat=all advance yolu aynı satırı yeniden playQueue'ya verir; her loadedmetadata aynı değişmemiş row.position=30 değerini tekrar uygular. Prob ilk devam30, bitiş100 ve sonraki tur başlangıcını30 ölçtü. repeat=one için özel0 sıfırlaması varken all yolu bunu yapmıyor.

**Etki:** Her döngü parçanın başını sürekli atlar. Dinleme konumu service'e yazılsa da kuyruktaki row.position güncellenmez veya döngüde sıfırlanmaz.

**Kanıt/sınır:** Tam mevcut MusicQueue+MediaShelfUI ve gerçek ended/loadedmetadata tüketici akışı; kontrollü HTMLMediaElement yükleme sınırı, fiziksel ses/codec yok. Müzik analizi veya P081–P090 hedefi açılmadı. Önceki kuyruk transkripsiyon kurtarma raporları farklı kuyruktur; R815'te karşılığı yoktur.

<a id="r815-b103"></a>

### R815-B103 · P2 — Eski ses oynatıcısını kapatma yanıtı sonradan başlayan yeni parçayı siliyor

**Alt kanıt:** assistant / H07; [ayrıntılı JSON](evidence815/hundred/assistant/findings.json).

**Kaynak:** `src/renderer/media-shelf-ui.js:45,123–150`.

**Tekrar:** A çalarken ses oynatıcıyı kapat; listen-progress IPC'sini geciktir. Kapatma beklerken listeden/kuyruktan B'yi başlat; ardından A'nın konum kaydetme yanıtını tamamlat.

**Beklenen:** Eski kapatma yalnız sahibi olduğu A oynatmasını sonlandırmalı; sonradan başlatılmış B'yi etkilememeli.

**Gözlenen:** Kapatma callback'i await öncesinde playGeneration artırıyor ama sonrasında sahiplik kontrolü yapmıyor. B kendi yeni generation'ıyla başladıktan sonra eski callback audio.pause/removeAttribute/load, current=null ve dock.hidden işlemlerini yapıyor. Prob yeni B current.id değerini doğruladı; eski yanıt sonrasında current=null oldu.

**Etki:** Kullanıcının yeni seçtiği ses durur ve oynatıcı kapanır; geç yanıt yeni oynatmayı geçersiz kılar. Ses dosyası silinmez.

**Kanıt/sınır:** Tam shelf/queue modülleri, gerçek Close düğmesi ve public executeMusic queue_next tüketicisi; gecikmeli geçerli IPC. Native ses çıkışı yoktur. R815-B44/B46 kapatılmış ayrıntı/modalın geç yanıtla açılmasından, B54 kitap açılış sırasından farklı ses oynatma lifecycle köküdür.

## Yüz hedefinde sayılmayanlar ve ayrı öneriler

Geliştirme önerileri yukarıdaki **G01–G32** bölümlerindedir; bu 25 yeni bulgunun veya 103 toplamının içine alınmadı. Bu tur sayı doldurmak için yeni öneri bug yapılmadı. SSE aynı isim fragmenti adayı gerçek tüketicide çürüdü; MP4+Vorbis gerçek FFmpeg karşı kontrolü çalıştı. Boş anahtar politikası, HLS delta anchoring, cleanup uyarı yorumu ve gerçek sentezlenemeyen speakerlabel adayı dışarıda tutuldu. Ayrıntılar alan JSON'larında korunur.

XML/TTML semantiği [W3C TTML1](https://www.w3.org/TR/ttml1/#timing-attribute-timeContainer) ve [XML namespace](https://www.w3.org/TR/xml-names/#ns-qualnames), DASH kalıtım uygulaması [Google Shaka MpdUtils kaynağı](https://shaka-project.github.io/shaka-player/docs/api/lib_dash_mpd_utils.js.html) ile karşılaştırıldı. Shaka Apache 2.0 lisansı kaynakta doğrulandı; uygulamaya dış kod/dependency alınmadı. Referanslardaki genel açıklamalar gerçek ürünün çalıştığı kanıtı sayılmadı; kanıt özgün modüllerin çıktı/IO/consumer sonuçlarıdır.

**Teslim sınırı:** Bu çalışma yalnız rapor, seçilmiş sentetik kanıt ve devir notudur. Ürün/test/bağımlılık/ayar değiştirilmedi; 103 bug açık bırakıldı. R816 ürün değişiklikleri başka çalışmanındır, rapor commit'ine eklenmez. Kişisel OFFLINE-MANIFEST/INDEX değişiklikleri, yerel start.sh silinmesi ve untracked dosyalar korunur.


<!-- UNSEEN-AUDIT-815 -->

## Az kapsanan alanlar: 15 yeni bulgu

**31 Ekim 2026: önceki 103 + yeni 15 = 118 doğrulanmış bug; 31 P1 / 87 P2.** Bu tur için kullanıcı yeni sayı hedefi koymadı; amaç önceki denetimde az incelenen sınırları açmaktı. Üç mevcut ajan yine **GPT‑6.1 Sol / medium effort** kullandı. Başlangıç ve bitiş ürün tabanı **db65f2e7f6e7b50649c440cb183cb88863ebf241**; bu tur ürün kodu değişmedi. Önceki 103 bulgunun kaynak kodu da bu başlangıçtan beri değişmedi; bunlar bu tur yeniden keşif/yeniden tam E2E başarı sayılmaz.

“Yeni alan” bütün proje tarihinde hiç okunmamış dosya demek değildir: R266/R317 paketleme, R134/R160/R177/R301/R354/R481 abonelik, R66/R73 klasör izleme ve diğer tarihsel çalışmalar aşağıda ayrılır. Night1000 kaynak/aile/mekanizma imzaları karşılaştırıldı; renderer F19 kuyruğunun PASS kaydı native kare decode sahipliğine kanıt sayılmadı. [Ayrıntılı kapsam ve açık sınırlar](evidence815/unseen/COVERAGE.md).

| Kimlik | Önem | Hata | Alt kanıt |
|---|---|---|---|
| [R815-B104](#r815-b104) | P1 | Windows dağıtım filtresi yerel sır, profil, günlük ve medyayı pakete alıyor | packaging/PK01 |
| [R815-B105](#r815-b105) | P1 | Paketleyici kilit dosyasını atlıyor; paket içindeki install.bat ön kontrolü çalışamıyor | packaging/PK02 |
| [R815-B106](#r815-b106) | P2 | Başarısız torrent dosya seçimi mevcut job nesnesine ve sonra diske sızıyor | engines/UE01 |
| [R815-B107](#r815-b107) | P2 | Aynı torrentte eşzamanlı iki dosya seçimi bir seçimi kaybediyor | engines/UE02 |
| [R815-B108](#r815-b108) | P2 | Bekleyen torrent motor başlangıcı close/quit sonrasında yeni süreç başlatabiliyor | engines/UE03 |
| [R815-B109](#r815-b109) | P2 | Native kare çözülürken video değişirse eski kare yeni videonun altyazısı ve adıyla kaydediliyor | engines/UE04 |
| [R815-B110](#r815-b110) | P2 | 501 kanallı içe aktarma başarılı görünürken son kanal kalıcı kayıttan düşüyor | subscriptions/UN-SUB01 |
| [R815-B111](#r815-b111) | P2 | Kanal ekle kutusu geçerli Türkçe handle’ı çıplak biçimde reddediyor | subscriptions/UN-SUB02 |
| [R815-B112](#r815-b112) | P2 | YouTube handle kimliği harf büyüklüğüne göre iki ayrı abonelik sayılıyor | subscriptions/UN-SUB03 |
| [R815-B113](#r815-b113) | P2 | Yerel aboneliklerde Yenile komutu beş dakikalık önbelleği aşamıyor | subscriptions/UN-SUB04 |
| [R815-B114](#r815-b114) | P2 | RSS kaynağındaki tüm istekler başarısızken kullanıcıya boş akış gösterilip başarı önbelleği yazılıyor | subscriptions/UN-SUB05 |
| [R815-B115](#r815-b115) | P2 | Atom xml:base ile tanımlanan göreli medya bağlantıları içe alınamıyor | library/UL01 |
| [R815-B116](#r815-b116) | P2 | Podcast yenilemesi aynı GUID için değişen medya adresinde dinleme konumunu siliyor | library/UL02 |
| [R815-B117](#r815-b117) | P2 | EPUB içindeki normal hidden öğeler okuyucuda görünür metne dönüştürülüyor | library/UL03 |
| [R815-B118](#r815-b118) | P2 | Boştaki Spotify içe aktarma penceresini kapatmak kayıtlı parçanın hazırlanmasını iptal ediyor | library/UL04 |

### Doğrulamanın kapsamı

Ana süreç **5 bağımsız yeniden üretme iş akışını** çalıştırdı; hatalı davranış assertion'ları ve karşı kontrolleri geçti. Bu sonuçlar hata düzeltmesi değildir. Ayrıca mevcut Windows ignore kontrolü ve paket bütünlüğünün 9 testi geçti; kurulu packager varsayılan filtresi ve gerçek kurulum tüketicisi arasındaki açık buna rağmen yeniden üretildi. [Komut ve sonuç kaydı](evidence815/unseen/parent-verification.json).

Windows paketleme gerçek kurulu packager 20.3.0 kopyalama filtresi, gerçek fs.cp, manifest/checker ve kurulum preflight'ını sentetik kaynak ağaçta çalıştırdı. Beş sahte sır/profil/log/medya marker'ı taşındı; gerçek kişisel dosya paketlenmedi. Torrent handler/disk gerçek, engine/net/fetch/spawn kontrollüdür; gerçek peer/swarm veya torrent motoru başlatılmadı. Native kare testi gerçek capturePlayerFrame tüketicisidir; Image.decode/canvas/API kontrollü olduğundan gerçek PNG piksel veya fiziksel ekran kabulü değildir.

Abonelik gerçek renderer callback'leri, parser ve main RSS handler kullanır; tek gerçek HTTP trafiği localhost503 fixture'ıdır. Podcast/EPUB gerçek Python parser ve raf IPC/disk/JSDOM okuyucudan geçer; Spotify kaydı yalnız sıradan import/oynatma iptal sahipliğidir, müzik analizi hedefi açılmaz. Python alt süreç sandbox başlatma engeli ardından aynı izole komut yetkili olarak exit0 verdi; engel ürün bugı sayılmadı. GPUInfo için ayrı Electron denemesi Mojo AccessDenied ile başlayamadı; donanım teşhis hatası sayılmadı.

Yeni tam EXE üretimi, temiz Windows VM install.bat, normal start.bat açılışı, gerçek mpv/GPU decode/DRM, canlı hesap/ücretli sağlayıcı, fiziksel ses/ekran okuyucu, tam npm suite ve CI sonucu bu turun doğrulaması değildir. [Seçilmiş sentetik kanıtlar ve güvenli tekrar](evidence815/unseen/REPRODUCE.md).

<a id="r815-b104"></a>

### R815-B104 · P1 — Windows dağıtım filtresi yerel sır, profil, günlük ve medyayı pakete alıyor

**Alt kanıt:** packaging/PK01; [ayrıntılı JSON](evidence815/unseen/packaging/findings.json).

**Kod:** `tools/package-manifest.js:18–31`, `tools/package-windows.js:36–50`

**Tekrar:** Depo kökünde .env, tmp/synthetic-profile/settings.json, .tmp/synthetic-profile/settings.json, logs/synthetic-session.log ve synthetic-media.wav dosyaları olan sentetik paket ağacı hazırla. Üretimdeki PACKAGER_IGNORE değerini kurulu @electron/packager populateIgnoredPaths → userPathFilter zincirinden geçir ve gerçek fs.cp ile resources/app içine kopyala. tests/should-be-excluded.txt negatif kontrolünü de ekle.

**Beklenen:** Dağıtıma yalnız uygulama girdileri alınmalı; .gitignore içinde açıkça kişisel/sır/runtime verisi sayılan bu dosyalar yayın paketine kopyalanmamalı.

**Gözlenen:** Beş sahte kişisel/sır işaretinin tamamı resources/app içinde bulundu. Negatif kontrol tests/ dosyası dışarıda kaldı; dolayısıyla filtre gerçekten uygulanıyor. .gitignore bu paketleme yolunda okunmuyor.

**Kök neden:** Paketleyici tüm kaynak kökünü kopyalıyor; denylist yalnız birkaç kök dosya/dizinini dışlıyor. .env/.env.*, tmp/.tmp, logs ve kullanıcı medya uzantıları için kural yok. Git tarafından ignored olmak bu kopyalama işlemine koruma sağlamıyor.

**Etki:** İçinde gerçek sır/profil/medya bulunan bir çalışma ağacından paket üretilip paylaşılırsa bu içerik dağıtıma taşınabilir. Kanıt yalnız sahte marker kullanır; mevcut bir yayımlanmış paketin kişisel veri sızdırdığı veya gerçek API anahtarı içerdiği iddia edilmez.

**Önceki kapsam:** Önceki R815 B01–B103 içinde bu Windows dağıtım mekanizması yok. Night1000 registry üç paket/kurulum dosyasını kaynak olarak listelemiyor. R266 gerekli-dosya kapanışını; R317 ortak manifesti ele alır. R345 mahremiyet ratchet’i .wbp çalışma paketi içindir, Electron dağıtım filtresi değildir. tests/windows-package-ignore.test.js iç yüzeylerin seçili 23 yolunu sınar; kişisel marker yollarını sınamaz.

**Sınır:** Gerçek Windows, Node v24.22.0, kurulu packager 20.3.0 ve gerçek kopyalama filtresi; tüm EXE paketi üretilmedi/yayımlanmadı. Kişisel kaynak ağacı paketlenmedi, ağ/hesap kullanılmadı. Beş dosya varyantı tek bağımsız kök sayılır.

**Kabul ölçütü:** Sentetik sır/profil/log/medya kopyaya girmemeli; gerekli uygulama girdileri kalmalı. Kontrol yalnız özel regex dizisini değil gerçek packager varsayılanlarıyla birleşmiş kopyalama sonucunu doğrulamalı.

**Sonuç:** [results.json](evidence815/unseen/packaging/results.json).

<a id="r815-b105"></a>

### R815-B105 · P1 — Paketleyici kilit dosyasını atlıyor; paket içindeki install.bat ön kontrolü çalışamıyor

**Alt kanıt:** packaging/PK02; [ayrıntılı JSON](evidence815/unseen/packaging/findings.json).

**Kod:** `tools/package-windows.js:36–50`, `tools/package-windows.js:67–82`, `tools/package-manifest.js:170–175`, `tools/install-orchestrator.js:311–314`, `node_modules/@electron/packager/dist/copy-filter.js:6–29`

**Tekrar:** Aynı sentetik kaynak ağacında gerçek package.json, package-lock.json, install.bat ve kurulum betiği/requirements kilitlerini kullan. Üretim ayarlarıyla gerçek copy-filter kopyasını çalıştır. Üretim missingInTarget kontrolünü ve kaynak/paket ağaçlarında InstallOrchestrator.preflight çağrısını çalıştır; dış araç algılaması desteklenen değerleri döndüren kontrollü sürücüdür.

**Beklenen:** BUILD-MANIFEST içindeki “Run resources/app/install.bat” yönlendirmesi çalışabilir bir kurulum ağacına gitmeli. Zorunlu npm kilidi paket içinde bulunmalı veya paket üretimi eksik dosyada durmalı.

**Gözlenen:** Kaynak ağaç preflight PASS. Gerçek filtre package-lock.json dosyasını kopyalamadı. missingInTarget boş liste döndürdü. Paket ağacı preflight ENOENT/open/package-lock.json ile durdu. Yalnız eksik kilidi yerine koyunca aynı ön kontrol PASS oldu.

**Kök neden:** PACKAGER_IGNORE bir RegExp dizisi olduğunda @electron/packager kendi /package-lock\.json$ varsayılanını ekler. Proje testi yalnız özel regexleri kontrol edip kilidi “shipped” sayar; requiredPackageFiles de package-lock.json eklemediğinden final bütünlük kapısı bu eksikliği göremez. Kurulum validatePolicy ve desiredFingerprint kilidi zorunlu okur.

**Etki:** Bu paketleme akışıyla hazırlanan dağıtımda yeni makine için belgelenen kurulum, pip/npm kurulumu başlamadan kesilir. Transkripsiyon backend’i kurulamaz. Önceden hazırlanmış uygun ortamı olan her makinenin uygulamayı açamadığı iddia edilmez.

**Önceki kapsam:** B01–B103 içinde yok; Night1000 registry bu üç tools kaynağını kapsamıyor. R266/R317 gerekli-dosya doğrulaması/ortak manifest çalışmalarını bu kez kurulu packager varsayılanları ve gerçek kurulum tüketicisi arasında sınadık. Mevcut windows-package-ignore testi 23 iç +19 dış yol ve package-integrity 9/9 PASS verdi; bu yeni hata o kontrollerin dışındaki zincirde doğrulandı.

**Sınır:** Gerçek filtre/fs kopyası ve üretim preflight kullanıldı; Node/Python/FFmpeg araç kontrolleri kontrollü. Tam temiz Windows VM install.bat, paket EXE üretimi ve indirme yapılmadı. Dosyayı geri koymak yalnız sentetik fixture karşı kontrolüdür; ürün düzeltilmedi.

**Kabul ölçütü:** Gerçek packager çıktısında kilit korunmalı; silinirse missingInTarget başarısız olmalı. Aynı çıktı ağacının gerçek kurulum ön kontrolü kilit dosyası kaynaklı hata vermemeli.

**Sonuç:** [results.json](evidence815/unseen/packaging/results.json).

<a id="r815-b106"></a>

### R815-B106 · P2 — Başarısız torrent dosya seçimi mevcut job nesnesine ve sonra diske sızıyor

**Alt kanıt:** engines/UE01; [ayrıntılı JSON](evidence815/unseen/engines/findings.json).

**Kod:** `src/media-torrents.js:88`, `src/media-torrents.js:89`, `src/media-torrents.js:97`

**Tekrar:** node .tmp/unseen815-engines/torrent-probe.cjs — ilk dosyayı başarıyla play; ikinci play update_only_files yanıtı503; status; başarılı pause; ikinci dosyaya reopen.

**Beklenen:** Başarısız seçim önceki onaylı seçimleri değiştirmemeli; başka pause işlemi başarısız seçimi kalıcılaştırmamalı.

**Gözlenen:** İlk disk [0];503 dönen ikinci seçimden sonra status.selections [0,1] iken disk hâlâ [0]. İlgisiz başarılı pause diske [0,1] yazıyor; başarısız dosya için reopen ok:true.

**Kök neden:** jobs.get(hash).selections doğrudan yeniden kullanılıp await öncesi push ediliyor; sağlayıcı reddinde rollback/kopya yok.

**Etki:** UI hata gösterdiği hâlde dosya önceden seçilmiş sayılıyor; sonraki işlem başarısız değişikliği kalıcılaştırıyor ve reopen yetkilendiriyor.

**Karşı kontrol:** İlk başarılı play diskte yalnız [0]; hatadan hemen sonra disk [0]. Kalıcı sızıntı sonraki pause ile somut.

**Önceki kapsam:** B25 skip-range başarısız dosya yazımında bellek değişimiyle aynı genel transaction ilkesi; farklı ürün durumu/API ve kök: burada sağlayıcı HTTP reddi öncesi mevcut torrent selections dizisine alias. UE02 ile aynı değildir: tek akışta hata rollback eksikliği.

**Sınır:** Gerçek registerMediaTorrents handler ve gerçek sentetik JSON dosyası kullanıldı. HTTP/spawn/net kontrollü. Gerçek rqbit’in503 öncesi yan etkisinin olmadığı veya gerçek torrent indirildiği iddia edilmez.

**Sonuç:** [torrent-results.json](evidence815/unseen/engines/torrent-results.json).

<a id="r815-b107"></a>

### R815-B107 · P2 — Aynı torrentte eşzamanlı iki dosya seçimi bir seçimi kaybediyor

**Alt kanıt:** engines/UE02; [ayrıntılı JSON](evidence815/unseen/engines/findings.json).

**Kod:** `src/media-torrents.js:87`, `src/media-torrents.js:88`, `src/media-torrents.js:91`, `src/renderer/media-hub-ui.js:54`

**Tekrar:** Aynı preview token için index0 ve index1 play çağrılarını paralel başlat; iki update_only_files isteğini aynı bariyerde bekletip birlikte tamamlat. Aynısını ardışık kontrol olarak çalıştır.

**Beklenen:** İki başarılı farklı seçim kümülatif [0,1] olmalı veya çakışan istek açıkça reddedilmeli.

**Gözlenen:** İki play ok:true ve ayrı stream URL döndürüyor; iki API update gövdesi [0] ile [1], kalıcı job yalnız bir seçim içeriyor. Ardışık kontrol [0,1].

**Kök neden:** Hash başına kilit/birleştirme yok; iki akış boş job durumunu ayrı okuyup kendi selections dizisini oluşturuyor, son jobs.set öncekinin başarılı seçimini eziyor.

**Etki:** Kullanıcının başarılı sandığı dosya seçimi kütüphaneden ve motorun istenen only_files kümesinden düşüyor; tekrar açma/yerel dosya doğrulama geçmişi eksiliyor.

**Karşı kontrol:** Ardışık iki play [0,1] yazar. UI yalnız tıklanan düğmeyi devre dışı bırakır (media-hub-ui.js8); farklı dosyaların düğmeleri ortak kilit taşımaz (54).

**Önceki kapsam:** Önceki103 içinde torrent seçim concurrency kaydı yok. UE01 ile farklı: bütün HTTP yanıtları başarılı; sorun failure rollback değil lost-update.

**Sınır:** Gerçek handler ve disk; scheduler kontrollü API bariyeriyle deterministik. Gerçek rqbit/peer/scheduler performansı veya indirme davranışı ölçülmedi.

**Sonuç:** [torrent-results.json](evidence815/unseen/engines/torrent-results.json).

<a id="r815-b108"></a>

### R815-B108 · P2 — Bekleyen torrent motor başlangıcı close/quit sonrasında yeni süreç başlatabiliyor

**Alt kanıt:** engines/UE03; [ayrıntılı JSON](evidence815/unseen/engines/findings.json).

**Kod:** `src/media-torrents.js:33`, `src/media-torrents.js:38`, `src/media-torrents.js:105`, `src/media-torrents.js:106`, `src/native-player.js:83`

**Tekrar:** Preview motoru başlatırken yerel port tahsisini beklet. proc henüznull iken service.close veya before-quit çalıştır. Portu serbest bırak; spawn ve preview sonucunu gözle. Karşı kontrolde önce başlayan motoru close et.

**Beklenen:** Kapanış başladıktan sonra bekleyen startup iptal edilmeli veya kapanış yeni oluşan motoru sahiplenip durdurmalı.

**Gözlenen:** Her iki kapanış yolunda kapanış anı spawned0/killed0; bariyer sonrası spawned1/killed0 ve preview ok:true. Önceden başlamış motoru kapatma karşı kontrolü spawned1/killed1.

**Kök neden:** close/before-quit yalnız o andaki proc?.kill çağrısını yapıyor; starting promise için closed/epoch/cancel durumu yok, port await sonrası spawn devam ediyor.

**Etki:** Kapanış sırasında yeni torrent motoru başlatılabilir ve o kapanış çağrısı tarafından durdurulmaz. Uygulama başka asenkron kapanışı bekliyorsa kaynak/transfer ömrü kapanış isteğini aşar.

**Karşı kontrol:** Başlangıç tamamlandıktan sonraki close fake child kill1 verir; hata sadece proc oluşmadan önceki startup penceresinde. before-quit senaryosu başka listener’ın preventDefault ile kapanışı tuttuğu durumu kapsar; native-player.js83–87 üretimde bu davranışı içerir.

**Önceki kapsam:** R762 native-player teardown ve B103 ses oynatıcısı close sahipliği tarihsel benzer yaşam döngüleridir; burada farklı servis ve faz: bekleyen rqbit port/start promise, henüz proc yok. B31 spawn error veya B77 komut sonucu değildir.

**Sınır:** Child process yalnız EventEmitter stub; gerçek süreç, swarm veya gerçek uygulama quit çalıştırılmadı. İşletim sistemi uygulama kapandıktan sonra kesin yetim süreç bırakır iddiası yok; kanıt kapanış talebinden sonra spawn ve kill eksikliğidir.

**Sonuç:** [torrent-results.json](evidence815/unseen/engines/torrent-results.json).

<a id="r815-b109"></a>

### R815-B109 · P2 — Native kare çözülürken video değişirse eski kare yeni videonun altyazısı ve adıyla kaydediliyor

**Alt kanıt:** engines/UE04; [ayrıntılı JSON](evidence815/unseen/engines/findings.json).

**Kod:** `src/renderer/renderer.js:20619`, `src/renderer/renderer.js:20620`, `src/renderer/renderer.js:20635`, `src/renderer/renderer.js:20667`

**Tekrar:** Original capturePlayerFrame fonksiyonunu çalıştır; snapshot A sonucunu döndür; Image.decode promise beklerken mediaKey/generation/cues/currentTime değerleriniB’ye geçir; decode tamamlat.

**Beklenen:** Kaynak değişirse capture iptal edilmeli veya A karesi A altyazısı/kimliğiyle bütünlüklü kaydedilmeli.

**Gözlenen:** drawImage SOURCE_A kullanıyor; fillText Subtitle B; saveImage.suggestedName synthetic_B_45s.png. API yanıtından önce değişen kaynak kontrolünde hiç save yok; sabit kaynak A/A/12s tutarlı.

**Kök neden:** key/generation yalnız snapshot API await sonrası denetleniyor; sonraki await Image.decode tamamlandığında sahiplik yeniden denetlenmeden canlı player altyazısı/kimliği okunuyor.

**Etki:** Dışa aktarılan görsel eski videonun karesini başka videonun altyazısı ve dosya kimliğiyle birleştiriyor; yanlış sahne kanıtı oluşuyor.

**Karşı kontrol:** Sabit kaynak kaydı A/A; API yanıtından önce değişim save0. Yalnız decode sırasında değişim save1 ve A/B karışımı.

**Önceki kapsam:** B18 PDF/MHTML save-dialog sırasında belge snapshotı ve B24 browser kırpılmış video geometrisinden farklı tüketici/faz: native snapshot PNG decode await. B77 native komut hatası değildir.

**Sınır:** Gerçek capturePlayerFrame metni değişmeden VM’de çalıştı. Image.decode bariyeri, canvas ve API kontrollü; gerçek mpv screenshot PNG pikseli, FFmpeg, fiziksel ekran veya Electron E2E çalıştırıldığı iddia edilmez.

**Sonuç:** [snapshot-results.json](evidence815/unseen/engines/snapshot-results.json).

<a id="r815-b110"></a>

### R815-B110 · P2 — 501 kanallı içe aktarma başarılı görünürken son kanal kalıcı kayıttan düşüyor

**Alt kanıt:** subscriptions/UN-SUB01; [ayrıntılı JSON](evidence815/unseen/subscriptions/findings.json).

**Kod:** `src/renderer/renderer.js:30972`, `src/renderer/renderer.js:31020`, `src/subscriptions-io.js:11`

**Tekrar:** 501 ayrı sentetik UCID JSON dizisini gerçek İçe aktar düğmesinin callback’iyle yükle; canlı stSubs ile localStorage ve yeniden yüklenen listeyi karşılaştır.

**Beklenen:** Ya tüm kabul edilen kanallar kalıcı saklanmalı ya kapasite aşanlar eklenmeden açık sayıyla reddedilmeli.

**Gözlenen:** UI “501 kanal içe aktarıldı (json).”; canlı liste 501, localStorage 500, tekrar yüklemede 500. UC0000000000000000000500 kayboluyor.

**Kök neden:** Parser 1000 giriş kabul ediyor; import döngüsü ST_SUBS_MAX kontrol etmiyor; saveStSubs yalnız ilk500 girdiyi sessizce yazar.

**Etki:** Başarı bildirimi alan kullanıcı uygulamayı kapattığında aboneliğini kaybediyor; yeniden export canlı fazlalığı içerirken yeniden açılış içermiyor.

**Önceki kapsam:** R815 B01–B103 hundred/findings.json içinde abonelik/SmartTube kökü yok. Night1000 kayıtlarının serileştirilmiş senaryo alanlarında subscription/abonelik/smarttube eşleşmesi yok. Tarihsel R134/R160/R177/R301/R354/R481 modül incelemeleri bu UI-kalıcılık/kimlik/yenileme/hata zincirini kanıtlamıyor; önceki PASS yeni başarı sayılmadı.

**Sınır:** Gerçek Windows Node üzerinde değişmeden alınan renderer kaynak bloğu JSDOM/VM içinde çalıştırıldı. Tam Electron/native pencere görseli ve gerçek YouTube hesabı/site başarısı iddiası yok; kişisel profil kullanılmadı.

**Kabul ölçütü:** 499 mevcut+2 yeni ve boş+501 girişte kabul/ret/persist/reload sayıları tutarlı; kayıp veya sessiz kırpma yok.

**Sonuç:** [results.json](evidence815/unseen/subscriptions/results.json).

<a id="r815-b111"></a>

### R815-B111 · P2 — Kanal ekle kutusu geçerli Türkçe handle’ı çıplak biçimde reddediyor

**Alt kanıt:** subscriptions/UN-SUB02; [ayrıntılı JSON](evidence815/unseen/subscriptions/findings.json).

**Kod:** `src/renderer/renderer.js:31007`, `src/subscriptions-io.js:12`, `src/subscriptions-io.js:30`

**Tekrar:** Kanal ekle callback’ine önce @çağrı, temiz fixture’da https://www.youtube.com/@çağrı ver.

**Beklenen:** Kutunun vaat ettiği @handle girdisi, aynı handle URL’siyle aynı kanal kaydını oluşturmalı.

**Gözlenen:** @çağrı: sıfır kayıt ve “Kanal tanınamadı.”; URL biçimi: bir kayıt ve hata yok.

**Kök neden:** UI çıplak handle için ASCII \w düzenli ifadesi kullanıyor; normSub Unicode harfleri kabul ediyor fakat url alanındaki çıplak handle URL olarak çözülemiyor.

**Etki:** Türkçe/uluslararası kanal adlarını yönergede belirtilen kısa biçimde ekleme engelleniyor.

**Önceki kapsam:** R815 B01–B103 hundred/findings.json içinde abonelik/SmartTube kökü yok. Night1000 kayıtlarının serileştirilmiş senaryo alanlarında subscription/abonelik/smarttube eşleşmesi yok. Tarihsel R134/R160/R177/R301/R354/R481 modül incelemeleri bu UI-kalıcılık/kimlik/yenileme/hata zincirini kanıtlamıyor; önceki PASS yeni başarı sayılmadı.

**Sınır:** Gerçek Windows Node üzerinde değişmeden alınan renderer kaynak bloğu JSDOM/VM içinde çalıştırıldı. Tam Electron/native pencere görseli ve gerçek YouTube hesabı/site başarısı iddiası yok; kişisel profil kullanılmadı.

**Kabul ölçütü:** Türkçe karakterli çıplak ve yüzde kodlu/tam URL handle girdileri aynı normalize kayda dönüşmeli.

**Sonuç:** [results.json](evidence815/unseen/subscriptions/results.json).

**Semantik kaynak:** [resmî kaynak 1](https://support.google.com/youtube/answer/11585688?hl=en) · [resmî kaynak 2](https://blog.youtube/inside-youtube/international-handles/).

<a id="r815-b112"></a>

### R815-B112 · P2 — YouTube handle kimliği harf büyüklüğüne göre iki ayrı abonelik sayılıyor

**Alt kanıt:** subscriptions/UN-SUB03; [ayrıntılı JSON](evidence815/unseen/subscriptions/findings.json).

**Kod:** `src/subscriptions-io.js:60`, `src/renderer/renderer.js:30974`, `src/renderer/renderer.js:30979`

**Tekrar:** Gerçek stSubToggle ile @NewsFeed ve @newsfeed ekle; aynı ikiliyi gerçek parseSubscriptions ile JSON’dan geçir. Karşı kontrol olarak @newsfeed’i iki kez parse et.

**Beklenen:** YouTube case-insensitive handle kimliğine göre bir abonelik; görüntü biçimi korunabilir.

**Gözlenen:** Toggle ve import parser ikisi de iki ayrı kayıt tutuyor; birebir aynı handle iki kez verilince bir kayıt oluyor.

**Kök neden:** Kimlik anahtarında handle için case normalization yok; UCID ve handle aynı case-sensitive string yolu kullanıyor.

**Etki:** Aynı kanal iki kez listelenir, kota tüketir; başka harf biçiminden abonelik denetimi/çıkışı tutarsızlaşır.

**Önceki kapsam:** R815 B01–B103 hundred/findings.json içinde abonelik/SmartTube kökü yok. Night1000 kayıtlarının serileştirilmiş senaryo alanlarında subscription/abonelik/smarttube eşleşmesi yok. Tarihsel R134/R160/R177/R301/R354/R481 modül incelemeleri bu UI-kalıcılık/kimlik/yenileme/hata zincirini kanıtlamıyor; önceki PASS yeni başarı sayılmadı.

**Sınır:** Gerçek Windows Node üzerinde değişmeden alınan renderer kaynak bloğu JSDOM/VM içinde çalıştırıldı. Tam Electron/native pencere görseli ve gerçek YouTube hesabı/site başarısı iddiası yok; kişisel profil kullanılmadı.

**Kabul ölçütü:** ASCII case varyantları tek abonelikte birleşmeli; UCID harf büyüklüğünün anlamı korunmalı.

**Sonuç:** [results.json](evidence815/unseen/subscriptions/results.json).

**Semantik kaynak:** [resmî kaynak 1](https://support.google.com/youtube/answer/11585688?hl=en).

<a id="r815-b113"></a>

### R815-B113 · P2 — Yerel aboneliklerde Yenile komutu beş dakikalık önbelleği aşamıyor

**Alt kanıt:** subscriptions/UN-SUB04; [ayrıntılı JSON](evidence815/unseen/subscriptions/findings.json).

**Kod:** `src/renderer/renderer.js:32043`, `src/renderer/renderer.js:29143`, `src/renderer/renderer.js:29180`, `src/renderer/renderer.js:31144`

**Tekrar:** Hesapsız subscriptions bölümünü gerçek renderSmartTubeSection ile aç, ardından gerçek Yenile callback’inin çağırdığı {force:true} ile tekrar aç. Cache zamanını sıfırlayıp üçüncü kez çağır.

**Beklenen:** Açık Yenile eylemi aynı liste için yeni akış isteği yapmalı.

**Gözlenen:** İlk açılış+force:true toplam1 API çağrısı; cache süresi geçmiş karşı kontrolde toplam2. Testte errors=0; ağ hatası gerekmiyor.

**Kök neden:** Üst işlev opts.force okur fakat yerel abonelik dalı renderStSubsPanel/renderStSubsFeed’e force iletmiyor; alt işlev yalnız TTL/anahtar kontrol ediyor.

**Etki:** Kullanıcı yeni yüklenen videoları istemesine rağmen eski akışta kalır; TTL dolmadan düğme etkisizdir.

**Önceki kapsam:** R815 B01–B103 hundred/findings.json içinde abonelik/SmartTube kökü yok. Night1000 kayıtlarının serileştirilmiş senaryo alanlarında subscription/abonelik/smarttube eşleşmesi yok. Tarihsel R134/R160/R177/R301/R354/R481 modül incelemeleri bu UI-kalıcılık/kimlik/yenileme/hata zincirini kanıtlamıyor; önceki PASS yeni başarı sayılmadı.

**Sınır:** Gerçek Windows Node üzerinde değişmeden alınan renderer kaynak bloğu JSDOM/VM içinde çalıştırıldı. Tam Electron/native pencere görseli ve gerçek YouTube hesabı/site başarısı iddiası yok; kişisel profil kullanılmadı.

**Kabul ölçütü:** Taze cache ile normal yeniden açış çağrısız; açık Yenile her seferinde tek yeni istek üretmeli.

**Sonuç:** [results.json](evidence815/unseen/subscriptions/results.json).

<a id="r815-b114"></a>

### R815-B114 · P2 — RSS kaynağındaki tüm istekler başarısızken kullanıcıya boş akış gösterilip başarı önbelleği yazılıyor

**Alt kanıt:** subscriptions/UN-SUB05; [ayrıntılı JSON](evidence815/unseen/subscriptions/findings.json).

**Kod:** `src/main.js:19883`, `src/main.js:19900`, `src/renderer/renderer.js:31148`, `src/renderer/renderer.js:31152`, `src/renderer/renderer.js:31158`

**Tekrar:** Orijinal subs:rssFeed IPC handler’ını tek sentetik UCID ile çağır; yalnız fetch hedefini loopback HTTP503 sunucusuna yönlendir. Orijinal yanıtı gerçek renderer abonelik paneline ver.

**Beklenen:** Hiçbir kanal alınamadığında hata/yeniden dene durumu; geçerli boş kanal sonucu ile kaynak arızası ayrılmalı.

**Gözlenen:** Gerçek handler: ok:true,videos:[],errors:1. Renderer “Akışta video yok.” yazar ve errors:1 yanıtını taze beş dakikalık akış cache’ine koyar.

**Kök neden:** Main tümü başarısız sonucu da ok:true döndürür; renderer errors alanını cache’e taşır fakat hiç yorumlamaz.

**Etki:** Sunucu kesintisi veya HTTP hatası yeni video olmadığı bilgisine dönüşür; kullanıcı doğru teşhisi ve hemen tekrar deneme fırsatını kaybeder.

**Önceki kapsam:** R815 B01–B103 hundred/findings.json içinde abonelik/SmartTube kökü yok. Night1000 kayıtlarının serileştirilmiş senaryo alanlarında subscription/abonelik/smarttube eşleşmesi yok. Tarihsel R134/R160/R177/R301/R354/R481 modül incelemeleri bu UI-kalıcılık/kimlik/yenileme/hata zincirini kanıtlamıyor; önceki PASS yeni başarı sayılmadı.

**Sınır:** Gerçek Windows Node üzerinde değişmeden alınan renderer kaynak bloğu JSDOM/VM içinde çalıştırıldı. Tam Electron/native pencere görseli ve gerçek YouTube hesabı/site başarısı iddiası yok; kişisel profil kullanılmadı. Main sender/online guard’ı yetkili/online fixture; fetch gerçek Node HTTP isteğini yalnız 127.0.0.1’e yaptı. HTTP503 gövde okunmadan reddedildiğinden bounded-reader stub çağrılmadı. UN-SUB04’ten bağımsız olarak ilk cache-miss istekte hata oluşur; force aktarımı düzeltilse bile yanlış boş mesaj devam eder.

**Kabul ölçütü:** HTTP503/tüm timeout ve geçerli boş Atom feed ayrı durumlar; kısmi hatada alınan videolar gösterilirken eksiklik görünür.

**Sonuç:** [results.json](evidence815/unseen/subscriptions/results.json).

<a id="r815-b115"></a>

### R815-B115 · P2 — Atom xml:base ile tanımlanan göreli medya bağlantıları içe alınamıyor

**Alt kanıt:** library/UL01; [ayrıntılı JSON](evidence815/unseen/library/findings.json).

**Kod:** `backend/media_shelf.py:155`, `backend/media_shelf.py:164`, `backend/media_shelf.py:168`, `src/media-shelf-service.js:253`, `src/renderer/media-shelf-ui.js:368`

**Tekrar:** probe.cjs UL01: xml:base=https://media.example/episodes/ içeren Atom beslemesini gerçek podcast-add tüketicisine ver. Enclosure href=ep-a.mp3 ile ekle; aynı XML içinde href değerini mutlak URL yaparak yeniden ekle.

**Beklenen:** Atom taban URI kurallarına göre enclosure adresi çözümlenir ve bölüm kaydedilir.

**Gözlenen:** Göreli bağlantıda ok:false ve No audio/video enclosures found in RSS/Atom feed.; yalnız href mutlak yapıldığında ok:true.

**Kök neden:** Parser xml:base zincirini çözümlemeden ham href üzerinde http/https şeması arıyor.

**Etki:** Arayüzün desteklediğini belirttiği geçerli Atom beslemelerinin bir bölümü tamamen reddediliyor.

**Önceki kapsam:** Önceki 103 R815 bulgusunda bu kök yok. Night1000 F39 CSV/ZIP alan birleştirme ailesi; bu Atom taban-URI senaryosu yeni.

**Sınır:** Kontrollü fetch yanıtı ve gerçek Python parser/IPC handler kullanıldı; harici besleme veya medya indirilmedi. Atom base kalıtımının tüm varyantları test edilmedi.

**Kabul ölçütü:** Aynı göreli fixture mutlak fixture ile aynı bölüm URL’sini üretmeli; yalnız güvenli http/https nihai URL kabul edilmeli.

**Sonuç:** [results.json](evidence815/unseen/library/results.json).

**Semantik kaynak:** [resmî kaynak 1](https://www.rfc-editor.org/rfc/rfc4287#section-2).

<a id="r815-b116"></a>

### R815-B116 · P2 — Podcast yenilemesi aynı GUID için değişen medya adresinde dinleme konumunu siliyor

**Alt kanıt:** library/UL02; [ayrıntılı JSON](evidence815/unseen/library/findings.json).

**Kod:** `backend/media_shelf.py:170`, `src/media-shelf-service.js:263`, `src/renderer/media-shelf-ui.js:373`, `src/renderer/media-shelf-ui.js:379`

**Tekrar:** probe.cjs UL02: sabit GUID ve episode-v1.mp3 enclosure ile beslemeyi ekle. listen-progress ile 45 saniyeyi kaydet; ok:true ve gerçek media-shelf.json konumunun 45 olduğunu doğrula. Aynı URL ile yenile; diskte 45 korunur. Aynı GUID/title ile enclosure adresini episode-v2.mp3 yapıp yenile.

**Beklenen:** Aynı bölümün kalıcı kimliği korunarak medya adresi güncellenir; kayıtlı 45 saniye kaybolmaz.

**Gözlenen:** Aynı abonelik ID’si korunmasına rağmen gerçek disk konumu 0 oluyor. Aynı URL karşı kontrolünde 45 korunuyor.

**Kök neden:** Parser GUID alanını atıyor; yenileme önceki bölümü yalnız enclosure URL eşitliğiyle buluyor.

**Etki:** Yayıncı CDN veya dosya yolunu değiştirdiğinde kaydedilmiş dinleme konumu sessizce kayboluyor.

**Önceki kapsam:** Önceki 103 içinde bu yenileme/kalıcı bölüm kimliği kökü yok. B102/B103 oynatıcı kuyruk yaşam döngüsüyle ilgilidir; burada kayıp podcast-add disk birleştirmesinde oluşur.

**Sınır:** Aynı GUID tek bölümün kimliği olarak kullanıldı; RSS standardının GUID için zorunlu bir eşleştirme algoritması getirdiği iddia edilmiyor. Gerçek ses çalınmadı.

**Kabul ölçütü:** Aynı GUID ile değişen enclosure güncellenirken konum 45 kalmalı; aynı URL karşı kontrolü de geçmeli.

**Sonuç:** [results.json](evidence815/unseen/library/results.json).

**Semantik kaynak:** [resmî kaynak 1](https://www.rssboard.org/rss-specification#ltguidgtSubelementOfLtitemgt).

<a id="r815-b117"></a>

### R815-B117 · P2 — EPUB içindeki normal hidden öğeler okuyucuda görünür metne dönüştürülüyor

**Alt kanıt:** library/UL03; [ayrıntılı JSON](evidence815/unseen/library/findings.json).

**Kod:** `backend/media_shelf.py:40`, `backend/media_shelf.py:44`, `backend/media_shelf.py:81`, `src/media-shelf-service.js:211`, `src/renderer/media-shelf-ui.js:268`

**Tekrar:** fixtures.py ile normal hidden="hidden" paragrafı içeren sentetik EPUB üret. Gerçek book-import ve book-open yollarını çalıştır; gerçek MediaShelfUI.openBook tüketicisini JSDOM içinde aç. Orijinal HTML paragrafının display:none olduğunu, raf okuyucusunda EDITOR ONLY HIDDEN SENTENCE metninin bulunduğunu doğrula.

**Beklenen:** Normal hidden durumundaki içerik güvenli metin dönüşümünde görünür bölüm metnine dahil edilmez.

**Gözlenen:** Orijinal paragraf display:none iken parser çıktısı ve .ms-prose okuyucu metni gizli cümleyi içeriyor.

**Kök neden:** Prose bastırma kararı etiket ve epub:type=noteref alanına bakıyor; standart hidden niteliğini dikkate almıyor.

**Etki:** Kitabın görünmemesi gereken yardımcı veya editoryal içeriği okuma metnine karışıyor; alıntı ve metin işlemlerinin girdisi de bozuluyor.

**Önceki kapsam:** R612 metadata/nav/noteref bastırması ve açık dipnot koruması ilişkili önceki kapsamdır; bu sıradan hidden niteliği, dipnot semantiğinden farklıdır. R815 önceki 103 içinde bu kök yok.

**Sınır:** CSS ile hidden görünürlüğünü geçersiz kılan kural yok; hidden-until-found veya özel dipnot semantiği kullanılmadı. Gerçek TTS üretimi ya da gizlilik sızıntısı iddia edilmiyor. JSDOM tüketici doğrulaması gerçek Windows görsel testi değildir.

**Kabul ölçütü:** Bu EPUB görünür başlangıç/son metnini korurken gizli paragrafı bölüm ve okuyucu metninden çıkarmalı; açık dipnot davranışı ayrıca korunmalı.

**Sonuç:** [results.json](evidence815/unseen/library/results.json).

**Semantik kaynak:** [resmî kaynak 1](https://html.spec.whatwg.org/multipage/interaction.html#the-hidden-attribute).

<a id="r815-b118"></a>

### R815-B118 · P2 — Boştaki Spotify içe aktarma penceresini kapatmak kayıtlı parçanın hazırlanmasını iptal ediyor

**Alt kanıt:** library/UL04; [ayrıntılı JSON](evidence815/unseen/library/findings.json).

**Kod:** `src/renderer/spotify-import-ui.js:15`, `src/media-shelf-service.js:133`, `src/media-shelf-service.js:143`, `src/spotify-import.js:34`, `src/spotify-import.js:64`, `src/spotify-import.js:69`

**Tekrar:** probe.cjs UL04: geçerli biçimli kayıtlı eşleşme için gerçek spotify-play handler yolunu başlat; kontrollü musicRun çözümlemesini AbortSignal beklemesinde tut. Hiç okuma/eşleştirme başlatmadan gerçek SpotifyImportUI penceresini aç ve kapatma düğmesine bas.

**Beklenen:** İşi olmayan içe aktarma penceresini kapatmak başka tüketicinin kayıtlı oynatma çözümlemesini etkilemez.

**Gözlenen:** Kayıtlı parçanın çözümleme AbortSignal’i tetikleniyor; spotify-play ok:false ile dönüyor. İçe aktarma penceresi tamamen boştaydı.

**Kök neden:** Modal close koşulsuz spotify-cancel gönderiyor; servis içe aktarma/eşleştirme/kayıtlı stream için tek ortak controller kullanıyor ve iptali sahiplikle sınırlandırmıyor.

**Etki:** Kullanıcı parçanın hazırlanması sırasında içe aktarma penceresini açıp kapatırsa seçtiği parça başlayamıyor.

**Önceki kapsam:** R699 kayıtlı yeniden eşleştirme kimlik korumaları ilişkili kapsamdır. R815 B103 oynatıcı Close sonrası eski callback yarışıdır; bu farklı bileşenin ortak abort sahipliği köküdür.

**Sınır:** Yalnız bekleyen stream çözümlemesinin iptali doğrulandı; başlamış sesin kesildiği iddia edilmiyor. Sentetik kayıt, gerçek servis/controller ve JSDOM modalı kullanıldı; Spotify hesabı, ağ, yt-dlp süreci veya müzik analizi yok.

**Kabul ölçütü:** Boştaki modal kapatıldığında kayıtlı stream sinyali iptal edilmemeli; modalın kendi etkin işi için iptal davranışı korunmalı.

**Sonuç:** [results.json](evidence815/unseen/library/results.json).

## Bu turdaki ayrı geliştirme önerileri

Önceki **G01–G32** korunur. Aşağıdaki iki öneri **G33–G34** olarak ayrı tutulur; 15 yeni bug veya 118 toplamına katılmaz. Alan raporlarındaki ilgili düzeltme seçenekleri de fazladan bug/öneri adedi sayılmaz. Hiçbir öneri uygulanmadı.

### R815-G33 — Dağıtımın gerçek dosya envanterini ve hashlerini üret

Mevcut inputSha256 gerekli-dosya kapanışını özetliyor; gerçek kopyalanan bütün ağacın listesi değildir. Yayın incelemesi için göreli yol/boyut/SHA256 içeren, kişisel içerik taşımayan final envanteri ve bir önceki paketle fark özeti yararlı olur. Böylece hangi uygulama varlığının eklendiği ve büyük/beklenmeyen dosyaların nereden geldiği görülebilir. Bu öneri mevcut fingerprint'in açıklanmış sınırını genişletir; ayrıca yeni bug sayılmadı.

**Kabul:** Aynı paket içeriği aynı sıralı envanter hash'ini üretmeli; eklenen/değişen uygulama varlığı farkta görünmeli. Envanter kaynak içeriklerini/anahtarları barındırmamalı ve kişisel dosyaları ayıklamanın yerine geçmemeli.

### R815-G34 — Abonelikleri kanal başına son başarı ve dönen yenileme bütçesiyle yönet

Mevcut ilk 30 kanal bütçesi ve toplu akış cache'i yanında, her kanalın son başarılı yenilemesi, hata/atlandı durumu ve sonraki deneme zamanı izlenebilir. Büyük listede aynı ilk altkümenin sürekli öncelik almasını önlemek için dönen sıra ve yalnız başarısız kanalları sınırlı tekrar deneme seçeneği sunulabilir. OPML handle-only çıktısının üçüncü taraf RSS tüketicisiyle kabulü de ayrı doğrulanmalıdır; bu gözlem canlı tüketiciyle doğrulanmadığı için bug toplamına alınmadı.

**Kabul:** 31/100 kanallı sentetik listede sınırlı istek bütçesi korunurken her kanalın sırası gelmeli; kullanıcı son başarı/hata/atlandı sayısını görebilmeli. Başarılı kanalların videoları ve eski sağlam cache, tek kanal hatası yüzünden kaybolmamalı. Ortak EN/TR ve grafit/amber yüzey korunmalı.

### Sayılmayan adaylar ve teslim sınırı

Handle-only OPML üçüncü taraf tüketicisi, GPUInfo gerçek adapter doğrulaması, native audio-track sözleşmesi ve kısmi venv oluşturma temizliği bu tur doğrulanmış bug sayılmadı. Klasör izleme tarandı; R66/R73 kökleri yeniden yazılmadı. Kaynak kimliği/profil/kapsam boşlukları [matriste](evidence815/unseen/COVERAGE.md) görünür.

Ürün, mevcut testler, ayarlar ve bağımlılıklar değiştirilmedi; hiçbir bug düzeltilmedi. Yalnız rapor, seçilmiş sentetik tekrar kaynakları/sonuçları ve tarihli devir notu yayımlanır. Kişisel dirty dosyalar ve test fixture/profilleri commit dışında kalır.


<!-- OTHER-AREAS-AUDIT-815 -->

## Diğer alanlar: 8 yeni bulgu

**31 Ekim 2026: önceki 118 tarihsel doğrulanmış kayıt + bu tur 8 yeni = 126 kayıt (33 P1 / 93 P2).** Bu tur yalnız 8 yeni kök mevcut ürün tabanında doğrulandı. Sayı hedefi konmadı; eski bulgu, geliştirme önerisi ve belirsiz aday eklenmedi. Üç ajan yine **GPT‑6.1 Sol / medium effort** kullandı. Başlangıç/bitiş ürün tabanı **6a789329d96c4f97cdc17bd9518df0b540b13444**; ürün kodu, mevcut testler, kişisel ayarlar ve bağımlılıklar değiştirilmedi.

Önceki rapor tesliminden sonra ayrı seslendirme/stüdyo çalışması ana dala birleşmişti. Değişen speech-v16 prompt/protokol ve gruplama yolları incelendi; bu tur önceki 118 için yeni tam E2E veya canlı kalite garantisi verilmez. Önceki ID eşlemesi aynen korunur ve eski kanıtlar kendi tarih/revizyonlarıyla kalır. [Revizyon incelemesi](evidence815/other/prior-revision-review.json).

| ID | Önem | Hata | Alt kanıt |
|---|---|---|---|
| [R815-B119](#r815-b119) | P1 | Tanı paketi serbest hata metnindeki kanonik sır alanlarını gizlemeden diske yazıyor | root/NR01 |
| [R815-B120](#r815-b120) | P1 | Tanı üreticisindeki kırpma uzun altyazının gizlilik filtresini atlatıyor | root/NR02 |
| [R815-B121](#r815-b121) | P2 | Aynı medya kimlikli SPA geçişinde eski sayfa profili isteği yeni yola kaydediliyor | root/NR03 |
| [R815-B122](#r815-b122) | P2 | İndirilen M4B için gösterilen Oynatıcıda aç işlemi backend beyaz listesinde reddediliyor | downloads/DL01 |
| [R815-B123](#r815-b123) | P2 | Canlı ASR yeniden başlatıldığında cue kimlik çakışması önceki farklı zamanlı konuşmayı siliyor | liveasr/LA01 |
| [R815-B124](#r815-b124) | P2 | Worklet modülü yüklenirken biten sistem sesi izi sonrasında etkin oturum olarak kalıyor | liveasr/LA02 |
| [R815-B125](#r815-b125) | P2 | Otomasyon kaynak ve oturum karakter bütçesini gerçek altyazı metninden ölçmüyor | workflows/WF-AUTO-01 |
| [R815-B126](#r815-b126) | P2 | MCP köprüsü HTTP parçası sınırında Unicode JSON-RPC istek kimliğini bozuyor | workflows/WF-MCP-02 |

### Doğrulama ve sınırlar

Ana süreç dört özgün probu ayrı çıktı klasörlerinde yeniden çalıştırdı: kök tanı/path3, downloads1, canlı ASR2, workflow/MCP2. Hatalı davranış assertion’ları ve pozitif/negatif karşı kontrolleri exit0 verdi. Kök3 ayrıca başka ajan tarafından varsayım/tekrar açısından okundu. Bu, hataların düzeldiği veya tüm uygulamanın kabul edildiği anlamına gelmez. Mevcut tanı sansür testi ve site profili 15/15 testi geçti; yeni üretici/tüketici bileşimi sınırlarını kapsamaları iddia edilmez. [Ana süreç kaydı](evidence815/other/parent-verification.json).

Tanı probları gerçek noteBrowserCapture→preview→export ve gerçek atomik dosya yazımıdır; yalnız sentetik anahtar/cue marker’ları ve kontrollü kayıt diyaloğu kullanıldı. Gerçek sır sızıntısı veya sağlayıcının bu hatayı üretme sıklığı kanıtlanmadı. Path profili gerçek SPA callback/adapter/IPC’den geçer; gerçek YouTube’un örnek iki rota arasında bu gezinmeyi yaptığı veya native IPC yarış sıklığı iddia edilmez.

M4B sahte DownloadItem/DOM sınırlarıyla gerçek manager/IPC/renderer tıklamasını; ASR gerçek main başlangıç/stop/iz birleştirme ve renderer capture fonksiyonunu kontrollü process/AudioContext/track ile sınar. MCP gerçek localhost HTTP sunucusunda çok baytlı karakterin iki parça arasına gelmesini sağlar; dış istemci veya doğal ağ parçalanma sıklığı ölçülmez. Otomasyon gerçek publisher/persist metadata ve renderer karar/başlatma yoludur; gerçek sağlayıcı/maliyet yoktur.

Yeni tam npm suite/CI, normal start.bat/temiz install.bat, gerçek Electron UI/DPI/ekran okuyucu, mikrofon/sistem sesi/GPU/model/DRM/codec ve kişisel hesap E2E doğrulanmadı. Eski R46/R64/R167/R648/R798 ve Night1000 mekanizmaları [matriste](evidence815/other/COVERAGE.md) ayrılır.

<a id="r815-b119"></a>

### R815-B119 · P1 — Tanı paketi serbest hata metnindeki kanonik sır alanlarını gizlemeden diske yazıyor

**Alt kanıt:** root/NR01; [ayrıntılı JSON](evidence815/other/root/findings.json).

**Kod:** `src/main.js:5258–5292`, `src/main.js:5355–5450`, `src/main.js:17871–17919`, `src/browser-diagnostics-export.js:9–18`, `src/browser-sensitive-keys.js:19–76`

**Tekrar:** Gerçek noteBrowserCapture üreticisine clientSecret/accessToken/private_key alanlarında yalnız FAKE marker içeren hata ver. Gerçek preview JSON’unu gerçek export handler’ına ilet; izole dosyada gerçek atomicWriteFileSync çıktısını oku. api_key alanını karşı kontrol olarak kullan.

**Beklenen:** Ortak hassas anahtar sözlüğünde sır sayılan clientSecret/accessToken/private_key değerleri önizleme ve kaydedilen tanı dosyasından kaldırılmalı.

**Gözlenen:** Üç FAKE marker preview ve disk JSON’unda aynı kaldı. Aynı üretici/preview/export zincirinde api_key=FAKE_CLASSIC_MARKER gizlendi. Önizlenen JSON ile disk byte içeriği eşit.

**Kök neden:** sanitizeDiagnosticsSecrets nesne anahtarlarında ortak sözlüğü kullanıyor fakat string alanlarını eski dar redactBrowserDiagnosticsText regexine veriyor. CamelCase/alt çizgili hassas adların bir bölümü serbest hata atamalarında eşleşmiyor.

**Etki:** Bu biçimde kimlik bilgisi taşıyan hata oluşursa kullanıcı mahremiyet filtresinden geçtiğini düşündüğü tanı dosyasını sır değeriyle paylaşabilir. Gerçek kullanıcı anahtarının sızdığı iddia edilmez; yalnız sentetik alan/değerler kullanıldı.

**Önceki kapsam:** Önceki R815 B01–B118 içinde yok. R69 K7 camelCase savunmasını browser-playback-diagnostics.redactDiagnosticText ve persistentBrowserMediaUrl yollarında ele alır; bu export string tüketicisi aynı yardımcıyı kullanmıyor. R356 ve 13.09.2026.07 derin acquisition/coverage sansürü kısa/klasik anahtar fixture’larıdır; burada gerçek noteBrowserCapture→preview→export zincirindeki farklı anahtar kapsamı sınandı.

**Sınır:** Gerçek orijinal main üretici/handler ve gerçek atomik dosya yazımı; native dialog yetkili sentetik hedefe yönlendirilir. Hata metni kontrollü fixture’dır; sağlayıcı/canlı hesap/kişisel sır kullanılmadı. Tüm olası sır biçimlerini yakalama garantisi iddia edilmez.

**Kabul ölçütü:** Aynı fixture serbest hata atamalarında ve nesne anahtarlarında aynı kanonik sır politikasını uygulamalı; klasik api_key karşı kontrolü ve normal tanı metni korunmalı.

**Sonuç:** [results.json](evidence815/other/root/results.json).

<a id="r815-b120"></a>

### R815-B120 · P1 — Tanı üreticisindeki kırpma uzun altyazının gizlilik filtresini atlatıyor

**Alt kanıt:** root/NR02; [ayrıntılı JSON](evidence815/other/root/findings.json).

**Kod:** `src/main.js:5279–5290`, `src/main.js:5387–5390`, `src/main.js:5444–5450`, `src/browser-diagnostics-export.js:40–80`

**Tekrar:** Tam metni browserTrackBuffers içinde bulunan 823 karakterlik sahte cue’yu gerçek noteBrowserCapture hata detayına koy. Üreticinin 160 karakterlik kaydı gerçek preview/export hattından geçir. 22 karakterlik kısa cue ile karşı kontrol çalıştır.

**Beklenen:** Tanı paketine tam cue yerine yalnız öneki taşınsa bile kullanıcı altyazısı gizlenmeli; metin boyu sınırı gizlilik filtresini etkisiz kılmamalı.

**Gözlenen:** Tam cue tamponda bilinirken üretici hata detayını 160 karaktere kesiyor; export filtresi tam metni artık bulamıyor. FAKE_PRIVATE_CUE_START ve devamındaki altyazı öneki kaydedilen JSON’da duruyor. Aynı zincirde kısa cue gizleniyor.

**Kök neden:** Cue sansürü tam metin includes eşleşmesi yapıyor; üretici/snapshot string kısaltmaları ondan önce çalışıyor. Kırpılmış parça uzun cue ile eşleşemediğinden son katman altyazı dışarıda varsayımını sağlayamıyor.

**Etki:** Uzun replik veya altyazıyı içeren hata/ayrıştırıcı detayının başlangıcı tanı dosyasına taşınabilir. NR01’den bağımsızdır: sır anahtarı yoktur; doğru kanonik anahtar regexi eklemek bu cue önekini gizlemez.

**Önceki kapsam:** R815 önceki118’de yok. R356/13.09.2026.07 mevcut tam cue derin sansürünü kanıtlar; mevcut browser-diagnostics-export testi kısa tam cue’yu doğrudan filtreye verir. Yeni invariant üretici kırpması ile son gizlilik katmanının bileşimidir. Tarihsel sansür başarısı yeniden keşif sayılmadı.

**Sınır:** Tamamen sentetik uzun metin, gerçek üretici/preview/export/disk; gerçek kişisel altyazı veya dış paylaşım yok. Bütün provider hatalarının altyazı metni içerdiği iddia edilmez. Koşul, kaydedilecek hata alanına bilinen cue metni gelmesidir.

**Kabul ölçütü:** Kısa ve uzun cue, hata öneki/soneki ve üretici boy sınırında kesilme hallerinde diske kullanıcı metni taşınmamalı; normal tanı sözcükleri korunmalı.

**Sonuç:** [results.json](evidence815/other/root/results.json).

<a id="r815-b121"></a>

### R815-B121 · P2 — Aynı medya kimlikli SPA geçişinde eski sayfa profili isteği yeni yola kaydediliyor

**Alt kanıt:** root/NR03; [ayrıntılı JSON](evidence815/other/root/findings.json).

**Kod:** `src/main.js:13705–13746`, `src/main.js:17048–17075`, `src/renderer/renderer.js:9141–9154`, `src/browser-site-profiles.js:144–187`

**Tekrar:** Aynı YouTube video kimliğine ait /watch?v=abcdefghijk için path kapsamlı subtitleMode=both isteğini oluştur. Gerçek did-navigate-in-page callback’iyle /shorts/abcdefghijk yoluna geç; eski url/generation/origin içeren isteği gerçek browser:profile:update handler’ına ver. Sabit yol ve farklı generation karşı kontrollerini çalıştır.

**Beklenen:** Sayfaya özel istek kendi path kimliğini hedeflemeli; yol değişmişse eski istek stale olarak reddedilmeli veya açıkça başlangıç yoluna uygulanmalı.

**Gözlenen:** Gerçek adapter iki URL’ye de youtube:abcdefghijk kimliği verdi. Gerçek SPA callback generation=3 değerini korudu. Eski request.url=/watch isteği ok:true ile /shorts/abcdefghijk pathProfiles kaydı oluşturdu; /watch yok. Farklı generation reddediliyor, sabit yol doğru yere kaydediliyor.

**Kök neden:** Main generation ve origin doğruluyor, fakat request.url/pathKey’i kontrol etmiyor. Aynı medya kimlikli SPA geçişi generation artırmadığı için handler güncel URL’yi kullanıp önceki sayfa isteğini yeni yola yönlendiriyor.

**Etki:** Kullanıcının belirli sayfa için yaptığı altyazı/diğer profil değişikliği başka rota altında saklanabilir ve sonraki ziyaretleri etkileyebilir. Site kapsamının origin ile korunması bu path kapsamı farkını çözmez.

**Önceki kapsam:** Önceki118’de site/path profil kökü yok. R77/R85 zoom ve R301 profil/depo yardımcıları tarihsel kapsamdır. R815 B50 altyazı konumsal kimlik onayı, B73 yapım/dil yükleme ve B109 native kare decode farklı tüketici ve state mekanizmalarıdır.

**Sınır:** Gerçek main SPA callback/IPC ve gerçek adapter/profile yardımcıları; places/flush/sayfa olayları kontrollü bellek durumudur. Gerçek YouTube yüklenmedi veya kişisel profil değiştirilmedi. Tam renderer tıklama/gerçek IPC zamanlaması E2E iddiası yok; eski path isteğinin kabulü deterministik olarak kanıtlandı.

**Kabul ölçütü:** Aynı mediaId/origin/generation altında path değişimi eski path isteğini yeni profile uygulamamalı; sabit yol kabulü ve generation ret karşı kontrolleri korunmalı.

**Sonuç:** [results.json](evidence815/other/root/results.json).

<a id="r815-b122"></a>

### R815-B122 · P2 — İndirilen M4B için gösterilen Oynatıcıda aç işlemi backend beyaz listesinde reddediliyor

**Alt kanıt:** downloads/DL01; [ayrıntılı JSON](evidence815/other/downloads/findings.json).

**Kod:** `src/browser-downloads.js:142–148`, `src/renderer/renderer.js:9275–9278,9302–9303`, `src/main.js:15698–15702,18183–18186`, `src/preload.js:browserDownloads binding`

**Tekrar:** Repo kökünden node .tmp/next815-downloads/probe.cjs çalıştır. Çıktı tabanı R815_DOWNLOADS_OUT ile seçilebilir; her çağrı mkdtemp ile yeni run dizini yaratır. Kontrollü DownloadItem will-download → done(completed), mevcut fixture.m4b dosyası ve gerçek module snapshotını gerçek renderer tüketicisine ver. Görünür open-player düğmesinin mevcut click callbackini çalıştır; mevcut browser:downloads IPC handlerı mevcut manager.actiona gider. Aynı zincirde M4B, M4A, MP4 ve ZIP karşı kontrollerini incele.

**Beklenen:** Uygulamanın MEDIA_EXTS listesinde ve renderer oynatılabilir denetiminde bulunan M4B dosyasında gösterilen açma düğmesi mevcut dosya için path döndürmeli ve yerel oynatıcı geçişini çağırmalı.

**Gözlenen:** m4b ve M4B: düğme görünür, result.ok=false, desteklenmeyen medya türü hatası, openLocalMedia çağrılmaz. m4a ve mp4 aynı zincirde ok=true ve openLocalMedia çağrılır. zip düğmesi gizlidir ve IPC reddeder.

**Kök neden:** browser-downloads.js bağımsız open-player uzantı regexinde m4b yok; renderer regexi ve main MEDIA_EXTS aynı uzantıyı kabul ediyor.

**Etki:** Tarayıcıdan indirilmiş sesli kitabı indirmeler panelinden uygulamanın yerel oynatıcısına açma yolu her denemede başarısızdır. Klasörde göster çalışır; elle dosya açma geçici yoludur. Dosya kaybı iddia edilmez.

**Önceki kapsam:** r815: Önceki 118 eşleme incelendi; tek M4B B10, kitap çıktısının güncellik/hash köküdür. B94 backend adaptive indirme temizliğidir; bu handler değildir. · historical: R64-25 indirme yolunun mediaFileAccess yetkisi ayrı kök; mevcut uzantı reddi ondan önce gerçekleşir. R46-10 kesintili indirmelerin aktif yuvası, R46-83 persist mesajı ve R46-84 native getter başka mekanizmalardır. R167 geçmişteki terminal kayıttan resume olmamasını gizlilik tasarım sınırı diye kaydeder; yeni bug sayılmadı. R476-09 native setup throw ve R479-04 destroyed getter için mevcut güvenli yolları tekrar bug saymadık. · registry: 1000 satırda browser-downloads.js kaynak imzası yok. main/renderer/preload ortaklığı nedeniyle 80 tarihsel satır F15/F19/F44/F48 eşleşir; detaylar coverageMatrix içindedir; bu kaynak ortaklığı yeni invariantın tarihsel olarak çalıştırıldığını göstermez.

**Sınır:** Controlled DownloadItem EventEmitter and DOM facade; real module, IPC callback and renderer consumer unchanged. No HTTP/Electron/native save dialog/codec decode/playback, start.bat, GPU or personal profile used. Fixture bytes are not an encoded audiobook; rejection occurs before decoder.

**Kabul ölçütü:** Gerçek mevcut download manager, handler ve renderer callback değiştirilmeden çalıştırıldı. Eksiksiz m4b/M4B görünürlük→IPC ret zinciri ve m4a/mp4 açma, zip ret karşı kontrolleri. Pause/resume/interrupted/cancel, unauthorized IPC, native save-path çağrılmaması, active/listener cleanup ve M4B reveal karşı kontrolleri geçti. Sadece raporlama; ürün/test/Git mutasyonu yapılmadı.

**Sonuç:** [results.json](evidence815/other/downloads/results.json).

<a id="r815-b123"></a>

### R815-B123 · P2 — Canlı ASR yeniden başlatıldığında cue kimlik çakışması önceki farklı zamanlı konuşmayı siliyor

**Alt kanıt:** liveasr/LA01; [ayrıntılı JSON](evidence815/other/liveasr/findings.json).

**Kod:** `src/main.js:9648-9649`, `src/main.js:9667`, `src/main.js:9682`, `src/main.js:10093-10101`, `src/browser-subtitles.js:223-239`

**Tekrar:** Aynı sekme/video/acquisition için gerçek startBrowserLiveAsr ile oturum1 başlat; backend protokolünden Merhaba@10–11 ve Devam@20–21 segmentlerini ilet. Gerçek stopBrowserLiveAsr ve süreç close olayını işlet; videoda geriye sarılmış konumdan aynı acquisition üzerinde yeni oturum başlat. Yeni oturum ilk segmenti Merhaba@0–1 olsun; gerçek storeBrowserTrack ve mergeBrowserStreamCues tamponunu incele.

**Beklenen:** 0–1,10–11,20–21 farklı zamanlı üç cue korunmalı; yeni oturum eski ayrı repliğin revizyonu değildir.

**Gözlenen:** sessions: session-1 session-2 · streamKey: live-asr:7:stable-acquisition · before: id: live-0 · start:  · end:  · text: Merhaba id: live-1 · start:  · end:  · text: Devam · after: id: live-0 · start:  · end:  · text: Merhaba id: live-1 · start:  · end:  · text: Devam · countercontrolDistinctCueId: id: live-2 · start:  · end:  · text: Merhaba id: live-0 · start:  · end:  · text: Merhaba id: live-1 · start:  · end:  · text: Devam

**Kök neden:** streamKey acquisition düzeyinde sabit; job.nextCueId her startta0. İki ayrı oturum live-0 kullanır. Geriye zamanlı cue genel merge yoluna girince kimlik+metin eşleşmesi önceki live-0@10 kaydını revizyon sanarak siler.

**Etki:** Aynı videoyu durdurup yeniden canlı yazıya çevirme ve geri sarma sonrasında daha önce yakalanan gerçek konuşma birikmiş altyazı tamponundan kaybolur. Bu kanıt, aynı kimlik ve aynı metnin geriye zamanlı yeni oturumda tekrarlanmasıyla sınırlıdır; ileri zamanlı hızlı yolda bu silme iddia edilmez.

**Önceki kapsam:** R815 önceki118 listesinde yok. F20 N0390 kaynak değişimi worklet hız/saatini; N0395 yeniden giriş tek worklet flush/sync ve monitor rewarn kontrolünü yapar. Main ASR session→stream/cue identity entegrasyonu yok. Genel merge fonksiyonunun sağlayıcı revizyonu temizleme davranışı bilinen ve amaçlı; hata yeni oturumun aynı identity alanını yeniden kullanmasıdır.

**Sınır:** Gerçek main başlangıç/consumer/stop, storeBrowserTrack ve merge çalıştı. Python süreç ve segmentler protokol fixture; modelin böyle döküm ürettiği, final SRT diski veya native playback kabulü iddia edilmez.

**Kabul ölçütü:** Aynı acquisition üstünde iki stop/start oturumunda cue kimlikleri çakışmamalı veya oturum izleri ayrılmalı. Geriye sarılmış yeni oturum aynı metni farklı zamanda üretince eski cue korunmalı; aynı oturum gerçek sağlayıcı cue revizyonu güncellenmeye devam etmeli.

**Sonuç:** [results.json](evidence815/other/liveasr/results.json).

<a id="r815-b124"></a>

### R815-B124 · P2 — Worklet modülü yüklenirken biten sistem sesi izi sonrasında etkin oturum olarak kalıyor

**Alt kanıt:** liveasr/LA02; [ayrıntılı JSON](evidence815/other/liveasr/findings.json).

**Kod:** `src/renderer/renderer.js:11602-11609`, `src/renderer/renderer.js:11648-11655`

**Tekrar:** Gerçek startBrowserLiveAsrCapture başlat; audioWorklet.addModule yanıtını kısa beklet. Paylaşılan audio track henüz ended listener kurulmadan doğal olarak ended durumuna geçsin. Modül yüklemesini tamamla; production start fonksiyonunu ve mikro görevleri bitir.

**Beklenen:** Zaten ended ses izi yeniden etkin capture gibi bağlanmamalı; capture/context/stream temizlenip scoped backend stop çağrılmalı.

**Gözlenen:** observed: trackReadyState: ended · active:  · captureRetained:  · nodes:  · backendStops:  · countercontrolEndAfterListener: active:  · backendStops:  · trackStopped:

**Kök neden:** ended listener addModule await sonrasında kuruluyor; track.readyState başlangıçta ve await sonrasında denetlenmiyor. EventTarget geçmiş ended olayını yeni dinleyiciye tekrar iletmez.

**Etki:** Kullanıcı Windows paylaşımını ilk modül yüklemesi sırasında kapatırsa ses yakalama bitmiş olmasına rağmen active=true ve model oturumu açık kalır; yeni konuşma gelmez. Kullanıcı manuel durdurabilir.

**Önceki kapsam:** R815 önceki118 listesinde yok. R648 module-load iptal testi uygulama Stop akışını sınar; trackin await penceresinde doğal ended olmasını kapsamaz. F20 N0392 yalnız worklet process([]) kanal kaybını sınar; MediaStreamTrack listener penceresi yok.

**Sınır:** Gerçek renderer fonksiyonları VMde; AudioContext/track EventTarget sınırı kontrollü. Gerçek getDisplayMedia veya Windows paylaşım paneli açılmadı. End sonrası listener kurulumunun geçmiş olayı replay etmemesi browser event sözleşmesini temsil eder. Bağlanan ended trackin native ek davranışı ayrıca ölçülmedi.

**Kabul ölçütü:** Modül beklemesinden önce veya beklerken ended olan track captureı aktif bırakmamalı; ended listener sonrası olağan stop davranışı korunmalı. Backend scoped stop bir kez, tracks/context kapalı ve active=false olmalı.

**Sonuç:** [results.json](evidence815/other/liveasr/results.json).

<a id="r815-b125"></a>

### R815-B125 · P2 — Otomasyon kaynak ve oturum karakter bütçesini gerçek altyazı metninden ölçmüyor

**Alt kanıt:** workflows/WF-AUTO-01; [ayrıntılı JSON](evidence815/other/workflows/findings.json).

**Kod:** `src/main.js:9834–9886 persistBrowserTrack`, `src/main.js:9984–10050 publishBrowserTrackNow`, `src/renderer/renderer.js:10408–10444 browserSubtitleAutomationInput/handleBrowserSubtitleAutomation`, `src/browser-automation-rules.js:44–57`

**Tekrar:** node .tmp/next815-workflows/probe.cjs. Gerçek normalizeCues ve publisher/persist ile 401 cue/200001 karakter kaynak yayınla; gerçek renderer input/decision uygula. Ardından iki ayrı medya için380 cue/190000 karakter kaynak yayınlayıp gerçek automation handler çalıştır.

**Beklenen:** 200000 üzeri gerçek kaynak karakteri kullanıcı onayına geçer. Başlatılabilir iki190000karakter işin ikincisi300000 oturum karakter bütçesinde engellenir.

**Gözlenen:** 200001gerçek karakter32080olarak sayılır ve eligible. İki190000karakter kaynak için iki useBrowserTrack başlatması, toplam380000karakter; browserAutomationLiveCharacters0kalır. Doğru gerçek karakter değerleri verilen aynı karar modülü sırasıyla blocked_by_limit döner.

**Kök neden:** Publisher/persist track üzerinde characterCount ve appendedCharacters üretmiyor. Renderer sourceCharacters için cueCount*80 tahmini, newCharacters için0kullanıyor; bütçe handlerı yalnız bu0değerini topluyor. Bu alanların başka üreticisi repo src taramasında yok. Kaynak ve kümülatif bütçe aynı eksik karakter muhasebesinin iki yüzüdür; tek kök sayıldı.

**Etki:** Otomatik altyazı çevirisi açık sitelerde açık harcama/onay sınırları aşılabilir; uzun kaynaklar kullanıcı onayı gerektirmeden işbaşlatma yoluna ulaşır.

**Önceki kapsam:** R815 önceki118eşleme içinde aynı kök yok. Night1000F11/F19kaynak/scheduler/kuyruk aileleri yakın; gerçek publisher→renderer bütçe metadata zinciri yok. R46claim/Tur4Y-NEW-1claim başarısızlığı, R46-74/Tur4O-NEW-9iptal kapısı kökleri yeniden sayılmadı.

**Sınır:** Gerçek kaynak fonksiyonlarıVM içinde aynen çalıştırıldı; kalıcı varlık store, dosya yazıcı, indeks, IPC ve useBrowserTrack bağımlılıkları kontrollü facade. Gerçek normalizeCues kullanıldı ve karakter sayıları normalize edilmiş cueIdentities üzerinden toplandı. Gerçek sağlayıcı çağrısı, harcanan para veya tüm altyazı siteleri kanıtı değildir. Onay kapısının otomatik başlatma sınırı kanıtlandı. Başlatmanın ayrık mediaId kullanmasıyla gate normal dedup davranışı korunur.

**Kabul ölçütü:** Gerçek kaynak uzunluğu ve ilk/yeni karakter artışı metadata/renderer boyunca tutarlı sayılmalı;200001kaynak bloke, iki190000işin ikincisi bloke; aynı kaynağın tekrarı/önbellek durumu çift sayılmamalı.

**Sonuç:** [results.json](evidence815/other/workflows/results.json).

<a id="r815-b126"></a>

### R815-B126 · P2 — MCP köprüsü HTTP parçası sınırında Unicode JSON-RPC istek kimliğini bozuyor

**Alt kanıt:** workflows/WF-MCP-02; [ayrıntılı JSON](evidence815/other/workflows/findings.json).

**Kod:** `src/assistant-mcp-bridge.js:24 HTTP gövdesi data+=chunk`, `tools/whisper-mcp.cjs:9 yanıt kimliğini değiştirmeden stdout aktarımı`

**Tekrar:** Aynı probe gerçek createBridge sunucusunu127.0.0.1ephemeralportunda başlatır. tools/call get_jobs isteğinin fixture-ş-id string kimliğindeki ş UTF-8 baytlarını iki HTTP Buffer arasında40msayırır.

**Beklenen:** Geçerli UTF-8 JSON isteği HTTP parçalanmasından bağımsız aynı string id ile eşleşir; sonuç id fixture-ş-id kalır.

**Gözlenen:** HTTP200başarılı result var; response.id fixture-��-id. Aynı gövde tek Bufferda fixture-ş-id, ASCIIiki Bufferda ascii-id korunur; yanlış token ve Origin403reddedilir.

**Kök neden:** Bufferların her biri data+=chunk ile bağımsız UTF-8 stringe dönüşür. İki parçaya bölünmüş karakter için streaming decoder veya Buffer.concat yok; her eksik parça replacement karakterine dönüşür. Adapter fetch yanıtını JSON.stringifyile aynen geçirir; kimlik eşleşmesi düzeltilmez.

**Etki:** Unicode string id kullanan MCP istemcisi yanıtı bekleyen isteğe bağlayamaz; geçerli saltokuma araç isteği cevabı kayıp/timeout gibi görünür. Rehber sorgusunun Unicode karakterleri de aynı gövde okumasından geçer.

**Önceki kapsam:** R815 önceki118eşleme içinde MCP taşıma kökü yok. R798MCP kimlik/auth/Origin/read-only ve Node stdio kabulü ASCIIid/single-body yolunu kanıtlıyordu; bölünmüş UTF-8 değil. Night1000F48/F49en yakın payload/NDJSON aileleridir; yeniMCPbridge o kaynak senaryolarında kayıtlı değil.

**Sınır:** Gerçek HTTPserver/bridge ve localhostkullanıldı; getJobs/getTabs kontrollü boş fixture. Gerçek dışMCPistemcisi veya stdioadapter çalıştırılmadı; adapter tüketici ilişkisi koddan incelendi. Ağın doğal olarak bu parçalamayı ne sıklıkta oluşturduğu ölçülmedi. Tüm istemciler Unicode id üretir iddiası yok.

**Kabul ölçütü:** UTF-8kod noktası her olasıbaytsınırında bölündüğünde JSONRPCidve sorgu aynen korunmalı; mevcut65536bayt,Originveauthretleri korunmalı.

**Sonuç:** [results.json](evidence815/other/workflows/results.json).

JSON-RPC yanıt kimliğinin istekle eşit olması [resmî JSON-RPC 2.0 sözleşmesidir](https://www.jsonrpc.org/specification#response_object); Unicode/UTF-8 semantiği [RFC8259](https://www.rfc-editor.org/rfc/rfc8259#section-8.1) ile karşılaştırıldı. Node’un [StringDecoder açıklaması](https://nodejs.org/api/string_decoder.html) çok baytlı parçaları koruyan mevcut yaklaşımı açıklar. Dış kod alınmadı veya çözüm uygulanmadı.

## Bu turun ayrı geliştirme önerileri: G35–G36

Önceki G01–G34 korunur. Aşağıdaki iki öneri yeni bug toplamına girmez ve uygulanmadı. Alan dosyalarındaki ilgili düzeltme seçenekleri ayrıca öneri adedini çoğaltmaz.

### R815-G35 — Kaydedilmiş iş akışını adlandır, seç ve çalıştırmadan önce adımlarını göster

Son iş akışını tekrar oynatma yeteneğinin yanında kayıt adı, kaynak/site kapsamı ve sıralı işlem özetiyle bir inceleme yüzeyi yararlı olur. Kullanıcı bir adımın hedefini ve gerekli onayı çalıştırmadan önce görebilmeli; güncel kaynakla bağdaşmayan adım görünür biçimde durmalı. Bu kullanılabilirlik önerisidir; yeni bug sayılmadı.

**Kabul:** İki sentetik kayıt ayırt edilerek seçilebilmeli; oynatma öncesi sıra/parametre/etki özeti görünmeli. İptal ve kaynak sahipliği korunmalı; yeni otomatik izin verilmemeli. Mevcut EN/TR ve grafit/amber tema kullanılmalı.

### R815-G36 — Canlı ASR’de ses kaynağı, capture ve model hazırlığını birlikte göster

Tek active/ready göstergesine ek olarak kaynak izinin canlılığı, worklet’in hazırlanması, son PCM zamanı ve motorun son segment zamanı kısa bir durum zincirinde gösterilebilir. Ses gelmiyor, model hazırlanıyor ve oturum durmuş ayrımı kullanıcıya somut neden verir. Ham ses/metin tanıya eklenmeden ölçümler tutulabilir; bu ek gözlemlenebilirlik önerisidir.

**Kabul:** Kontrollü hazırlık/ended/PCM yok/backend hazır senaryolarında durum kendi aşamasını doğru göstermeli; tüm aşamalar sağlıklı değilken kesin konuşma kalitesi veya fiziksel ses garantisi vermemeli. Gerçek Windows sistem sesi kabulü daha sonra ayrıca yapılmalı.

### Sayılmayanlar ve teslim sınırı

İndirme terminal resume/yuva/persist/native getter geçmiş kökleri; worklet olağan process/flush/RTF senaryoları; workflow timeout/claim/iptal ve yanlış iz seçimi adayı; MCP düşük etkili notification/hata kodu ayrıntıları yeniden bug sayılmadı. Site izinleri/legacy zoom salt okunur incelendi, yeni somut kök çıkmadı. Hiçbir kişisel profil, hesap, sır veya medya kullanılmadı. Ürün düzeltilmedi; yalnız rapor, seçilmiş sentetik kanıt ve devir notu teslim edilir.
