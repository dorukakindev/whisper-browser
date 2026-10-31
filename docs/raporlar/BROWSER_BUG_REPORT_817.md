# Rapor 817 — Windows tasarım incelemesi; yalnız rapor

31 Ekim 2026. **Beş doğrulanmış tasarım/kullanılabilirlik bulgusu**, iki ayrı inceleme önerisi. Hiçbir ürün dosyası, ayar veya bağımlılık düzeltilmedi. [R815'in 134 bug kaydı](BROWSER_BUG_REPORT_815.md) değiştirilmedi; bu beş tasarım bulgusu o sayıya eklenmedi. Okunabilirlik ve bilgiye erişim eleştirileri işlevsel çökme/data kaybı gibi sunulmaz.

İncelenen kaynak: `c3add04b78a341f85950066531e5b8baad0f3041`; dal `codex/design-audit817`. Üç alt ajan **GPT‑6.1 Sol / medium** ile ana form/ayarlar, browser/asistan ve kitap/katalog yüzeylerini kaynak üzerinden taradı. Ana ajan bulguya alınan beş adayı gerçek Windows Electron renderer'ında tekrar üretip görüntüleri tam boy inceledi. Kaynak hashleri, geçmiş senaryo imzaları ve görsel hashleri [manifestte](evidence817/manifest.json); sayısal ölçümler [burada](evidence817/measurements.json).

## Kapsam ve yöntem

İnceleme modu **full**, fakat kapsam aşağıdaki yüzeylerle sınırlı. Electron 43.5.0 / Chromium 150.0.7871.250, Windows, GPU devre dışı; gerçek `src/main.js` + preload + renderer, mevcut düz CSS ve grafit/amber token sistemi kullanıldı. Yeni tema önerilmedi. `make-interfaces-feel-better` ve [Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md) kontrol çerçevesi olarak kullanıldı; web/mobile kuralları masaüstüne körlemesine uygulanmadı.

| Kategori | Gerçekte incelenen kanıt | Sonuç |
|---|---|---|
| Tipografi | 1000×760 Whisper/model alanı, uzun katalog başlığı; gerçek fontların yüklenmesi beklendi | D02, D04 |
| Yüzeyler ve yerleşim | Ana sayfa referansı; ayar araması; klasör yolları; katalog; browser komut paleti | D01, D03, D05 |
| Animasyon | Sabit durum yakalaması öncesi 500 ms beklendi | Hareketin %10 hızda incelenmesi ve reduced-motion doğrulanmadı; yeni hareket bulgusu yok |
| İkonlar | Ana sayfa, model/form, browser toolbar ve palet ekranlarında hizalama/tema gözlemi | İncelenen sabit görüntülerde ayrı yeni ikon kusuru kanıtlanmadı; tüm durumlar taranmadı |
| Performans | Kaynak taraması; renderer düzen ölçümleri | FPS, uzun oturum, GPU kompozisyonu profillenmedi; performans bulgusu sayılmadı |

Dokuz görüntü: 1440×900 ana sayfa; 1000×760 arama/model/yollar; 940×680 katalog; aynı 940×680 içerik boyutunda %100 ve %125 browser yakınlaştırma. Sonuncuda CSS viewport **752×544**. Bu **Electron yakınlaştırma testidir; fiziksel Windows DPI testi değildir**. Ürün minimum boyutu düşürülmedi. Koyu/TR temel seri, palet için ayrıca açık/EN karşılaştırması var; her yüzeyin her dil/tema kombinasyonu doğrulanmadı.

## Bulguların önceliği ve tasarım yönü

`MEDIUM`: gözlenen kullanılabilirlik/okunabilirlik sorunu; bütün akışın engellendiği anlamına gelmez. “After” sütunu **önerilen tasarım**dır, uygulanmış sonuç değildir.

| Severity | Location | Before | After | Why |
|---|---|---|---|---|
| MEDIUM · D01 | [app-settings-ui.js:68](../../src/renderer/app-settings-ui.js#L68) | “Ayar ara” alanı, ekrandaki Flex seçeneğini arayınca bütün kategori düğmelerini gizliyor | Alan etiketlerini/eşanlamlıları indeksle, eşleşen ayara götür; yalnız kategori filtresi kalacaksa “Bölüm ara” de | Aramanın verdiği söz ile gerçek kapsamı farklı; bulunan kontrolün yanında boş sonuç mesajı güveni azaltıyor |
| MEDIUM · D02 | [styles.css:4634](../../src/renderer/styles.css#L4634), [index.html:277](../../src/renderer/index.html#L277) | Modelin yarım sütununda 9px bakım/benchmark yazıları ve 30px'e sıkışan durum metni | Model seçimi ve durumunu okunur genişlikte tut; bakım/benchmark grubunu ayrı, ortak tipografili model yönetimine taşı | Bilgi hiyerarşisi ve okunabilirlik; rutin seçimle silme/ileri test aynı küçük grupta |
| MEDIUM · D03 | [browser-chrome.css:176](../../src/renderer/browser-chrome.css#L176) | Paletin sabit üst konumu ve 330px sonuç listesi %125 yakınlaştırmada alt sınırı aşıyor | Tüm paleti kullanılabilir browser yüksekliğiyle sınırla; başlık/input/ipucu için yer bırakıp yalnız sonuçları kaydır | Yakınlaştırınca alt bölüm ve klavye ipucu kırpılıyor; büyütme erişilebilirliği bozuyor |
| MEDIUM · D04 | [media-catalog.css:39](../../src/renderer/media-catalog.css#L39), [media-catalog.js:253](../../src/renderer/media-catalog.js#L253) | Kesintisiz uzun kullanıcı başlığı grid'in içeriğini 852px alanda 2637px'e genişletiyor | İkinci sütunu `minmax(0,1fr)` yap; metin hücresinin küçülmesine ve uzun başlığın sarılmasına izin ver | Kullanıcı içeriği yönetimi; başlığın ayırt edici sonu ekran dışına gidiyor, poster/metin oranı da bozuluyor |
| MEDIUM · D05 | [styles.css:3451](../../src/renderer/styles.css#L3451), [renderer.js:2152](../../src/renderer/renderer.js#L2152) | Uzun girdi/çıktı yollarının ayırt edici sonu ellipsis altında; yerinde tam yol affordance'ı yok | Son klasörü koruyan gösterim ve klavyeyle açılan/kopyalanabilen tam yol ayrıntısı sun | Kullanıcı hangi klasörün seçili olduğunu aynı ekrandan teyit edemiyor |

### D01 — Ayar araması görünür ayarı bulamıyor

**Tekrar:** Ayarlar → Asistan ve çeviri → “Ayar ara” alanına `Flex` yaz. Başka sağlayıcı seçmek veya anahtar girmek gerekmez.

**Gözlenen:** Görünür kategori sayısı **0**, “Eşleşen bölüm yok” görünür; aynı anda sağda **DeepInfra hizmet katmanı / Flex** kontrolü görünür. [Windows görüntüsü](evidence817/02-settings-flex.png). Kontrol yok veya sağlayıcı çalışmıyor iddiası değildir; arama yanlış kapsam sunuyor. Kaynakta arama, beş kategori için sabit `dataset.search` dizgesine bakıyor; içerik etiketlerini taramıyor.

**Kabul ölçütü:** TR/EN `Flex`, `DeepInfra`, model ve API anahtarı gibi görünür ayar adları uygun bölüme/alan başlığına götürmeli. Sonuç yok durumu gerçek indeks kapsamıyla tutarlı olmalı. Yalnız kategorileri arama kararı korunacaksa placeholder ve açıklama bunu açıkça anlatmalı. Eşleşmeler değiştirilirken kullanıcının yazdığı sorgu korunmalı.

### D02 — Model bakımı, küçük yazılar ve sıkışan durum

**Tekrar:** Whisper stüdyosu → Temel ayarları aç → 1000×760 pencerede Model alanına kaydır. [Görüntü](evidence817/03-model-management.png).

**Gözlenen:** `.model-management-row` genişliği **153,5 CSS px**. Hazır modelin durum satırı **30,25px** yer buluyor ve “Read…” olarak kesiliyor. Yenile, Önbellekten sil, benchmark ve klip etiket/input yazıları **9px**; klip başlangıç input'u **54×20px**. Yakındaki normal seçimler 13px. Burada yalnız “9px var” diye otomatik standart ihlali sayılmadı: gerçek ekran, durumun kaybolması ve birbiriyle farklı önemdeki işlerin aynı dar kümeye yerleşmesi birlikte değerlendirildi. Sayısal veri [ölçümlerde](evidence817/measurements.json).

**Kabul ölçütü:** Modelin kullanılabilirliği ve durumu açılışta okunabilmeli; bakım ve benchmark olağan seçimin altında açık adlandırılmış ayrı grupta bulunmalı. Ortak font/alan stilleri kullanılmalı. Dar panelde anlamlı satır sarma korunmalı. 940/1000/1440px ve %125 yakınlaştırmada model seçimiyle yıkıcı bakımın ayrımı kontrol edilmeli.

**Tekrar saymama:** [R597](BROWSER_BUG_REPORT_597.md) eski `nowrap` taşmasını `flex-wrap` ile düzeltmişti. Bu rapor aynı düğme taşmasını yeniden saymaz; güncel sarılmış düzenin bilgi yoğunluğu ve tipografisini inceler. Eski tanı dilini ayrı yeni bug saymaz.

### D03 — Komut paleti büyütülünce kesiliyor

**Tekrar:** Browser → komut paletini aç → içerik boyutu 940×680 iken yakınlaştırmayı %125 yap. Menü açma yerleşimi gerçek uygulama fonksiyonuyla hazırlandı; bu koşu kısayolun native odak aktarımını doğrulamaz.

**Gözlenen:** %100'de palet altı **588px**, viewport yüksekliği **680px**; [kontrol görüntüsü](evidence817/05-palette-normal.png). %125'te CSS viewport **752×544**, palet altı **586,2px**: viewport'u **42,2px** aşıyor. İpucunun üstü **556,6px**, dolayısıyla tamamı viewport dışında. Sonuç listesi kaydırılabilir olsa da paletin altı browser yüzeyinde kırpılıyor. [TR/koyu](evidence817/06-palette-zoom125.png) ve [EN/açık](evidence817/07-palette-en-light-zoom125.png) aynı sorunu gösteriyor. Escape ve üstteki kapatma düğmesi hâlâ var; paletten çıkış tamamen kayboldu denmez.

**Kabul ölçütü:** Başlık, arama ve klavye yardım satırı paletin kullanılabilir yüksekliğinde kalmalı; uzun sonuçlar kalan alanda kaymalı. %100/%125/%150, TR/EN ve kısa pencere kontrolü yapılmalı. BrowserView üstüne taşma/occlusion ayrıca native bileşimle incelenmeli.

**Tekrar saymama:** [R613 D613-07](BROWSER_BUG_REPORT_613.md) komut paleti/dar kırılım konusunu **kısmi/doğrulanmadı** bırakmıştı. [R614](BROWSER_BUG_REPORT_614.md) yerleşim fixture görüntülerini genel kabul saymıyordu. Bu tur o görsel boşluğu belirli viewport/zoom ve ölçümle kapatır; eski doğrulanmış bug yeniden sayılmaz. R815-B11/B12 ARIA rolleri bu bulgudan ayrıdır.

### D04 — Uzun katalog başlığı sınırını aşarak kesiliyor

**Tekrar:** Sentetik arşive `Uzun_Kesintisiz_Dosya_Adindan_Gelen_` dizgesinin beş tekrarından oluşan **180 karakterlik** başlık gerçek katalog API'siyle kaydedildi, ayrıntısı açıldı. Dosya adından gelen alt çizgili başlık biçimini temsil eder; kişisel arşiv kullanılmadı.

**Gözlenen:** Detay hero alanı **852px**, iç kaydırma genişliği **2637px**; başlık sarılmadan sağa gidip kırpılıyor. [Uzun başlık](evidence817/08-catalog-long-title.png). Aynı pencerede normal `Kuzeyin Hikâyesi` başlığıyla **852/852px**, taşma yok: [karşı kontrol](evidence817/09-catalog-normal-title.png). Kayıt backend tarafından kabul edildi; bu bir API hata mesajı veya sadece testte zorla eklenmiş element değildir.

**Kök:** Grid'in ikinci sütunu `1fr`, metin hücresinin intrinsic minimumunu düşüren bir kural ve kesintisiz başlık için sarma yok. İçeriğin genişliği ilk poster sütununu da değiştiriyor. Aynı kökü poster oranı/başlık kesilmesi diye ikiye bölüp saymadık.

**Kabul ölçütü:** Aynı 180 karakterlik başlıkla hero yatay taşmamalı, bütün başlık okunabilmeli; boşluklu uzun Türkçe/İngilizce başlık ve normal kısa ad kontrolü korunmalı. Aksiyonlar satır sararak kullanılabilir kalmalı. Dar kırılım da aynı metin davranışını kullanmalı; çözüm tüm içeriği gizlemek olmamalı.

### D05 — Klasör yollarının ayırt edici sonu görünmüyor

**Tekrar:** Temel ayarlar altında girdi/çıktı yollarına ortak uzun önekli sentetik yollar gösterildi; son klasörleri `GIRDI` / `CIKTI`. **Bu display fixture'ıdır:** yalnız iki `textContent` değeri değiştirildi; klasör seçici, dosya sistemi ve kalıcılık kabul testi değildir. Ürün dosyası değiştirilmedi.

**Gözlenen:** Her alanın client genişliği **318px**, metnin genişliği **532px**. İki alan aynı önekle kesiliyor; son klasör görünmüyor. `title` boş, `tabIndex:-1`, yerinde aç/kopyala denetimi yok. [Görüntü](evidence817/04-long-paths.png). Kaynakta gerçek picker sonrası da aynı textContent yolu kullanılıyor (`renderer.js:2152,2169`); dolayısıyla gösterim mekanizması fixture'a özel değil. Metin verisinin veya seçilmiş klasörün kaybolduğu iddia edilmez; aynı ekranda doğrulama güçleşiyor.

**Kabul ölçütü:** Uzun ortak önekli iki yolun son klasörleri okunabilmeli. Tam yol ayrıntısı hem fare hem klavyeyle erişilebilir ve kopyalanabilir olmalı; hassas yollar asistan bağlamına/loglara otomatik eklenmemeli. Sadece hover tooltip'i klavye çözümü yerine geçmemeli.

## Ayrı öneriler / henüz görsel kabulü tamamlanmayan alanlar

Bu iki madde **yukarıdaki beş bulguya ve R815 bug toplamına dahil değildir**.

| ID | Tasarım yönü | Kaynak kanıtı ve tamamlanmayan doğrulama |
|---|---|---|
| G817-01 | Yeni sekmenin hızlı erişimini browser panel genişliğine göre 4→2 sütuna geçirmek | [browser-chrome.css:578](../../src/renderer/browser-chrome.css#L578) dört sütun; 596–597 viewport kırılımı. Geniş pencere/dar browser panelinde container kırılımı adayı. Dolu hızlı erişim + açık/genişletilmiş yan panel gerçek görüntüsü alınmadı; doğrulanmış taşma diye sunulmaz. |
| G817-02 | Kitap dinleme yazı boyutunu bölümden bağımsız okuma tercihi yapmak | [media-workflows-ui.js:1518](../../src/renderer/media-workflows-ui.js#L1518), 1697–1702: yeni okuma alanı, slider `21`, oninput yalnız mevcut prose. Sonraki/otomatik bölüm ve yer imi geçişlerinde tercih beklentisi değerlendirilmeli. Gerçek çok bölümlü kitap dinleme görüntüsü/dinleme akışı bu tur çalıştırılmadı. R815-B01 PDF tercihiyle aynı kayıt değildir; ayrı tasarım takibi olarak bırakıldı. |

## Elenen / yeniden sayılmayan adaylar

| Yer | Aday | Neden yeni bulgu değil |
|---|---|---|
| Whisper temel ayar özeti | 1000px'de kesin taşma varsayımı | Varsayılan model/dil/SRT ile özet sınır içinde; küçük yazı tek başına bağımsız taşma kanıtı değil. Daha uzun gerçek seçenek kombinasyonları doğrulanmadı. |
| Browser eski sabit renkleri | Dosyadaki eski mavi/turuncu hex'leri ayrı tema bugları saymak | Güncel cascade/token override'ları görülmeden kaynak metninden sonuç çıkarılamaz. İncelenen koyu/açık palette yeni renk ihlali doğrulanmadı. |
| Katalog afişsiz görünüm | Sentetik afiş alanının boşluğu | Fixture afişsiz; bu tek başına ürün tasarım bugı değil. Kişisel afişler kullanılmadı. |
| Ana sayfa/Whisper/CTA | R786 sticky alan, R788 stüdyo yerleşimi, R792 pasif CTA | Önceki onarımlar yeni keşif sayılmadı; [ana sayfa referansı](evidence817/01-home-baseline.png) tema bağlamı içindir. |

## Doğrulama, sınırlar ve karar

Kanıt betiği [design-proof.cjs](evidence817/design-proof.cjs). Windows'ta:

```powershell
node --check docs/raporlar/evidence817/design-proof.cjs
# Ayrı test profili oluşturur; yalnız denetim penceresini açar/kapatır.
& ./node_modules/electron/dist/electron.exe docs/raporlar/evidence817/design-proof.cjs
```

Son koşu gerçek süreç çıkışı **0**, `ok:true`, **9 görüntü**. Önceki başarılı koşunun dokuz görüntüsüyle SHA-256'ları birebir aynı; bu görüntüler tam boy incelendi. Palet %100 ve normal katalog başlığı karşı kontrolleri geçti. Assert'ler bugların **mevcut** olduğunu doğrular; düzelmiş olduğunu değil. İlk kanıt betiği denemesi JavaScript içindeki sentetik Windows yolunun alıntılamasında durdu; yalnız kanıt betiği düzeltildi. Ürün bugı veya ürün düzeltmesi sayılmadı.

İlk sandbox başlatması Chromium IPC/cache erişim engeline takıldı; aynı izole inceleme normal Windows yetkileriyle çalıştı. Test profilleri, veritabanları, ham konsollar ve kişisel dosyalar yayımlanmadı. Yalnız sentetik içerikli seçilmiş görüntüler, ölçüm ve betik eklendi. Global main-process fetch, kasıtlı olarak dış isteği reddetti; filtre hazırlama uyarısı beklenen sınırdır, canlı ağ başarısı değildir.

Bu UI incelemesi `start.bat` normal kullanıcı açılışının, `install.bat` kurulumunun, GPU/DRM/video native yüzeyi veya site oturumunun kabulü değildir. BAT akışları kaynakta gözden geçirildi; kişisel uygulamayı açmamak için izole harness kullanıldı. Harness ilk başlatmada start.bat DLL PATH dizinlerini kullandı; görsel seri transcription/CUDA başlatmaz. Gerçek fiziksel Windows DPI, ekran okuyucu, tüm klavye dolaşımı, reduced-motion/yavaş animasyon, kapsamlı kontrast ve tüm yüzeyler **doğrulanmadı**. Ürün değişmediği için tam `npm test`, backend transkripsiyon ve CI sonucu beklenmedi; testler kapatılmadı.

**Karar: Needs changes.** Beş tasarım bulgusu açık; öneriler ayrı. Öncelik: D03 ve D04 görünür içeriğin kırpılması, ardından D01 arama sözleşmesi, D02 okunabilirlik, D05 yol teyidi. Yukarıdaki doğrulanmayan kontroller bu kararın sınırıdır. Hiçbir tasarım düzeltmesi uygulanmadı.
