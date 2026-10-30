# Rapor 815 — Salt raporlama: PDF, çeviri ve seslendirme akışları

Tarih: **30 Ekim 2026**, Windows. İncelenen ürün: **`00a01f92f109f11183b02bc55dd1dfed25ed3e9f`**, başlangıç dalı `master`; rapor dalı `codex/audit-report815`.

Kullanıcının talebi yalnız inceleme ve ayrıntılı rapordur. **Ürün kodu, ayarlar, bağımlılıklar ve mevcut testler değiştirilmedi; aşağıdaki hatalar düzeltilmedi.** Eklenen yürütülebilir dosya yalnız raporun kontrollü yeniden üretme probudur.

## Sonuç

**3 doğrulanmış hata:** bir yüksek öncelikli çeviri bütünlüğü sorunu ve iki orta öncelikli okuma/hazırlık sorunu. Bunlardan ayrı **5 geliştirme alanı** aşağıda gerekçeleri ve kabul ölçütleriyle bulunur. Çökme, dosya silinmesi veya güvenlik açığı keşfedildiği iddia edilmez.

| Kimlik | Öncelik | Hata | Doğrulama |
|---|---|---|---|
| R815-B02 | P1 / yüksek | Devam eden kitap çevirisinde hedef dil değiştirilince tek işlem farklı dillere bölünüyor; son durum yalnız son dili içerirken bütün iş hazır deniyor. | 6 sayfa; ilk paket TR, ikinci paket DE; `completed=6`, son state yalnız 4–6. |
| R815-B03 | P2 / orta | Seslendirme projesi oluşturulurken sayfa/metin seçimi değişse de eski seçim üretimde açılıyor. | Ekranda sayfa 2/çeviri; açılan proje sayfa 1/orijinal. GPU üretimi başlamaz. |
| R815-B01 | P2 / orta | Kayıtlı PDF yazı boyutu okuyucu açılırken kaldırılıyor; seçim kutusu eski değeri göstermeyi sürdürüyor. | Kayıt 28 px, açılıştan önce token 28 px, sonra token yok; CSS varsayılanı 21 px, kutu hâlâ 28. |

Kanıtlar: [çalıştırılabilir prob](evidence815/probe.cjs), [ham olmayan kontrollü sonuçlar](evidence815/observations.json). Sonuçlar sentetik metin/IPC sınırları kullanır; kişisel PDF, hesap, profil veya API anahtarı içermez.

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
