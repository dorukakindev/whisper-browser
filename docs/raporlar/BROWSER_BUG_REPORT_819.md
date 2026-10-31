# Rapor 819 — Ajan kullanmadan tasarım denetimi; yalnız rapor

31 Ekim 2026. **Üç doğrulanmış yeni kayıt, tamamı MEDIUM. Ajan kullanılmadı; hiçbir ürün düzeltmesi yapılmadı.** Önceki doğrulanmış bulgular tekrar sayılmadı. R818'in kanıtlanmamış kitap onayı adlandırma adayı bu tur gerçek AX ağacıyla doğrulanarak bulguya yükseltildi; önceki öneri ayrıca bug olarak sayılmadı.

Taban **`2285a8202e20c836c7dafc53d06af667c60f34f6`**, başlangıç `master`, çalışma dalı `codex/design-audit819`. AGENTS/YENI-BILGISAYAR/güncel 0430 devir, [R818](BROWSER_BUG_REPORT_818.md), [R817](BROWSER_BUG_REPORT_817.md), [R815 düzeltme kaydı](evidence815/remediation-2026-10-31/README.md) ve Night1000 F46/F47 kaynak/mekanizma imzaları incelendi. R815'in tarihsel 134 toplamı değiştirilmedi.

## Kapsam ve yöntem

`make-interfaces-feel-better` full inceleme ve [Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md) kontrol çerçevesi kullanıldı. Uygulamanın mevcut grafit/amber düz CSS sistemi esas alındı; yeni tema/paket eklenmedi. Gerçek Windows Electron 43.5.0 main/preload/renderer, ayrı profil, gerçek 96 karakterlik sentetik TXT kitap importu, Chromium erişilebilirlik ağacı ve native girdiler kullanıldı. **GPU kapalı, yalnız bu test uygulamasında device scale factor 1'e sabit.** Bu fiziksel Windows DPI değiştirme veya bütün ekranların kabulü değildir.

| Kategori | Gerçekte incelenen kanıt | Sonuç/sınır |
|---|---|---|
| Tipografi | Ayarların canlı dil geçişi ve yeniden açma karşı kontrolü | D819-03; tüm diller/alanlar taranmadı |
| Yüzeyler | İki kitap onayı, ayarlar, native asistanın üst katmanı | D819-01/02; yedi tam boy Windows görüntüsü |
| Animasyon | Font/yüklenme ve sabit görüntü beklemesi | %10 hareket/reduced-motion incelemesi yapılmadı; hareket bugı sayılmadı |
| İkon/etkileşim | Native asistan balonu, Kaydet, dil select'i, onay düğmeleri ve AX rolleri/adları | D819-01/02; tüm hover durumları veya ekran okuyucu sesi test edilmedi |
| Performans | Hedefli geometri ve async UI kontrolü | FPS/GPU/uzun oturum profili yapılmadı; performans bulgusu yok |

[Kanıt betiği](evidence819/design-proof.cjs), [ölçümler](evidence819/measurements.json), [revizyon/kaynak/kanıt manifesti](evidence819/manifest.json). Yedi görüntü bug sayısı değildir; aynı kökün iki onay penceresi tek bulgu sayıldı.

## Bulgular ve önerilen tasarım

After sütunu uygulanmamış düzeltme yönünü anlatır.

| Severity | Location | Before | After | Why |
|---|---|---|---|---|
| MEDIUM · D819-01 | [media-workflows-ui.js:52](../../src/renderer/media-workflows-ui.js#L52), 525/552 tüketicileri | Görünen başlığı bulunan rename/archive onaylarının AX dialog adı boş | Başlığı dialog'a `aria-labelledby`, açıklamayı uygun `aria-describedby` ile bağla | Onayın amacı erişilebilir dialog adı olarak sunulmuyor |
| MEDIUM · D819-02 | [assistant-overlay.js:20](../../src/assistant-overlay.js#L20), [app-settings-ui.js:103](../../src/renderer/app-settings-ui.js#L103) | Native asistan balonu modalın Kaydet düğmesini örtüyor; açılan panel de modalın üstüne geliyor | Native katman ile modal sahipliğini eşgüdümle; eylem alanını örtmeyen konum/kapama veya açık yönetilen asistan geçişi | Aynı noktada iki eylemin görünür hedefleri çakışıyor; modal odak ve katman sınırı korunmuyor |
| MEDIUM · D819-03 | [app-settings-ui.js:9](../../src/renderer/app-settings-ui.js#L9), 98/111/117; [ui-locale.js:3432](../../src/renderer/ui-locale.js#L3432) | TR'ye geçince dış başlıklar Türkçe, ödünç tema alanı etiketi/ARIA/seçenekleri İngilizce kalıyor | Ödünç arayüz alanlarını hedef dilde açıkça güncelle veya kontrollü UI çeviri adası olarak işaretle | Tek dil sözleşmesi bozuluyor; aynı ayar iki dilin karışımıyla sunuluyor |

### D819-01 — Kitap onay pencerelerinin erişilebilir adı yok

**Tekrar:** Üretim çalışma alanına sentetik TXT kitabı import et → Projeyi yeniden adlandır. Ardından kaydetmeden iptal et → Projeyi arşivle onayını aç; arşivlemeden iptal et. Gerçek kitap import/main/store/UI yolunu kullandı, DOM'a sahte dialog eklenmedi.

**Gözlenen:** Yeniden adlandırmada görünür heading **Project name**, textbox adı **Name**, düğmeler **Cancel/Save**. Buna karşın erişilebilir **`role:dialog, name:""`**. Arşivleme onayında heading **Archive project?**, düğmeler **Cancel/Archive**; dialog adı yine boş. [Rename AX](evidence819/02-rename-ax.json), [Archive AX](evidence819/03-archive-ax.json), [rename görüntüsü](evidence819/01-rename-dialog.png), [archive görüntüsü](evidence819/02-archive-dialog.png). Karşı kontrol: alttaki ana çalışma alanı dialog'u **Production workspace** adıyla geliyor: [AX kontrolü](evidence819/01-workspace-ax.json).

**Kök:** `ask()` görünür `h2` üretiyor fakat id/`aria-labelledby` bağlantısı kurmuyor; dialog'da `aria-label` da yok. Alt textbox'ın etiketli olması dialog'un amaç adını sağlamıyor. Arşivleme açıklaması da dialog açıklaması olarak bağlanmamış. Bunları ayrı köklere bölmedik. Ekran okuyucunun duyuracağı tam cümle test edilmedi; iddia gerçek AX ağacındaki boş adla sınırlı.

**Önceki kapsam:** R818 bunu kaynak adayı olarak ayrı tutmuş ve bug toplamına katmamıştı. Bu tur aynı adayın doğrulaması tamamlandı. R815-B11/B12 tablist/menu rolleri başka kökler; eski rolleri yeniden saymıyoruz.

**Kabul ölçütü:** İki onayda da dialog adı başlıkla eşleşmeli; açıklama varsa dialog açıklaması olmalı; textbox ve düğme adları korunmalı. Gerçek AX ağacı ve klavye/cancel kontrolüyle doğrulanmalı. İptalde proje adı/arşiv durumu değişmemeli; son kanıt koşusunda bu karşı kontrol geçti.

### D819-02 — Native asistan modalın Kaydet hedefinin üstüne geliyor

**Tekrar:** 1000×760 içerik alanında Ayarlar → Görünüm ve araçlar aç; native asistan balonu kapalı/yuvarlak durumdayken sağ alt eyleme bak. Native overlay bir HTML z-index öğesi değil, ayrı **WebContentsView**.

**Gözlenen:** Kaydet sınırı **x825,52..951 / y664..703**. Native view **x920/y672/64×64**; görünen balon **x924..980 / y676..732**. Balonun kutusu ile Kaydet alanı **27×27px** kesişiyor; [görüntü](evidence819/06-native-bubble-cover.png). Kanıt noktası **(940,690)** hem Kaydet'in içinde hem balonun dairesel görünen kısmının içinde. O native çocuğa **yerel (20,18)** mouseDown/up gönderildiğinde asistan **480×696** panel olarak açıldı; ayarlar hâlâ açık ve parent Kaydet click sayısı **0**: [açık panel](evidence819/07-native-assistant-over-modal.png).

**Kanıt sınırı:** Son tıklama belirlenen **native child WebContents'e** gönderildi; OS masaüstü faresinin otomatik hit routing testi yapılmadı. Görüntü ve gerçek view sınırları örtüşmeyi doğrudan kanıtlıyor; hedeflenen child girdisi bu bölgedeki asistanın çalıştığını gösteriyor. Kaydet'in tamamı kullanılamaz, ayar verisi kaybolur veya her pencere boyutunda aynı alan örtülür denmiyor. Sol tarafta kalan düğme alanı hâlâ görünüyor.

**Kök:** `layout()` view'ı pencerenin sağ altına sabitliyor, yalnız fullscreen'i görünürlük koşulu sayıyor ve her layout'ta native çocuğu en üste ekliyor. Parent DOM native `dialog` katmanı bunu z-index ile bastıramıyor. Ayar modalının footer'ı bu native yüzeye yer ayırmıyor; modal sahipliğine ilişkin bir görünürlük/konum sözleşmesi yok.

**Önceki kapsam:** R818'in ekranlarında balon görünebiliyordu fakat bu geometri/hedef çakışması incelenmemiş, bug listesine alınmamıştı. R818-D02 Backspace handler'ının modal arkasındaki oyuncuyu kapatmasıdır; bu yeni bulgu mouse/native katman yerleşimiyle ilgilidir. R46/F46 tarihsel overlay/occlusion kapsamı bütün modal/native çocuk bileşimlerinin kabulü sayılmadı.

**Kabul ölçütü:** Desteklenen dar/geniş pencere ve yakınlaştırmalarda native asistan eylem hedeflerini örtmemeli. Asistanın modal sırasında kullanılmasına ürün kararıyla izin veriliyorsa açık bir katman/odak devri bulunmalı; aynı piksel iki ayrı görünen eylemin hedefi olmamalı. Çözüm parent modalı kapatıp kullanıcı taslağını atmak olmamalı. OS faresiyle gerçek kompozit hit testi sonraki uygulama kabulüne dahil edilmeli.

### D819-03 — Dil geçişi ayar alanlarını eski dilde bırakıyor

**Tekrar:** Uygulama dili EN iken Ayarlar → Appearance & tools aç → Interface language select'inde native End/Enter ile TR seç. Gözlemi yaptıktan sonra ayarları kapatıp yeniden aç.

**Gözlenen:** Başlangıçta heading **Settings**, tema etiketi/ARIA **Interface theme**, seçenekler **Use system setting / Dark / Light**. TR geçişinde heading **Ayarlar**, diğer bölüm metinleri Türkçe; aynı tema etiketi ve ARIA adı hâlâ **Interface theme**, seçenekler **Use system setting / Dark / Açık**. [Başlangıç](evidence819/03-locale-before.png), [karışık dil](evidence819/04-locale-stale.png). Kapatıp yeniden açınca **Arayüz teması**, **Sistem ayarını kullan / Koyu / Açık** oluyor: [karşı kontrol](evidence819/05-locale-reopen-control.png). Etiket çevirisi sözlükte mevcut; eksik sözlük anahtarı iddiası değil.

**Kök:** Modal `data-ui-untranslated` ile genel çeviriden çıkarılmış. Başlık/açıklamalar `t()` ile yeniden üretiliyor, `fields()` ile ödünç alınan mevcut kontroller aynı DOM metinlerini koruyor. `UiLocale` hem metin hem öznitelik çevirisinde ignored ancestor'ı atlıyor. `uiTheme` light seçeneği için özel güncelleme çalıştığından seçeneklerde de karışım oluşabiliyor. Modal kapanınca kontrol normal konumuna dönüyor ve çeviri uygulanabiliyor.

**Tekrar saymama:** R818-D03 aynı dil değişiminde odağın BODY'ye düşmesiydi; bu tur **odak kaybı yeniden sayılmadı**. Burada ayrı mekanizma ignored/borrowed arayüz metinlerinin hedef dilde güncellenmemesi. Odağı geri yüklemek bu etiketleri çevirmeyeceği gibi etiketleri çevirmek de tek başına odak korumasını çözmez. Diğer sağlayıcı bölümlerindeki her alan bu tur doğrulanmadı; tüm ayarlar bozuk denmez.

**Kabul ölçütü:** Modal açıkken EN↔TR değişiminde görünür alan başlıkları, select seçenekleri ve ARIA adları aynı hedef dili kullanmalı; kapatıp açmak gerekmemeli. Kullanıcı kitabı/başlığı/model ID'si/API anahtarı gibi veriler çevrilmemeli. Çeviriye tüm modalı sınırsız açmak yerine authored UI ile kullanıcı verisi ayrımı korunmalı.

## Ayrı öneriler, elenenler ve doğrulama

Yeni ayrı özellik önerisi sayılmadı; düzeltme yönleri yukarıdaki bugların kabul ölçütleridir. Global aramanın Enter ile çevrimiçi aramayı başlatması kaynakta görüldü, fakat açık ürün/mahremiyet sözleşmesi ve gerçek akış doğrulanmadan bağımsız bug sayılmadı. Kitap onayının sol üstte açılmasını görsel tercih düzeyinde bırakıp ek bug diye saymadım. Önceki R818 ses stüdyosu yüksekliği ve odak kaybı tekrar yeni adet yapılmadı.

```powershell
node --check docs/raporlar/evidence819/design-proof.cjs
& ./node_modules/electron/dist/electron.exe docs/raporlar/evidence819/design-proof.cjs
```

Son Windows kanıt süreci **exit0 / ok:true / 7 görüntü**, üç AX JSON ve ölçümler. Tüm seçili görüntüler tam boy incelendi. Kaynak/kanıt hashleri manifestte; JSON/yerel bağlantı/izinli dosya/diff kontrolleri teslimde yapıldı. İki onay iptal edildi; sentetik projenin adı ve arşiv durumu korunuyor. Kişisel profil, medya, API anahtarı, veritabanı veya ham log yayımlanmadı. Native asistan açıldı fakat mesaj/model/ücretli sağlayıcı isteği gönderilmedi.

`start.bat`/`install.bat` akışları kaynakta incelendi; normal start.bat açılışı, kurulum, CUDA/GPU, native video/DRM, gerçek dosya seçici, fiziksel DPI, gerçek ekran okuyucu anonsu/OS fare hit testi, kapsamlı hareket/kontrast ve bütün ürün yüzeyleri doğrulanmadı. Dosya seçimi yalnız sentetik TXT'yi döndüren kontrollü dialog sınırıydı. Main fetch dış istekleri reddeder; bu tek başına tüm backend ağının engellendiği iddiası değildir. Ürün kodu değişmediği için tam npm/backend/CI koşusu yapılmadı; CI kapatılmadı ve görülmeyen sonuç başarılı ilan edilmedi.

**Karar: Needs changes.** Üç MEDIUM bulgu açık; önerilen hiçbir düzeltme uygulanmadı. Yukarıdaki kanıt ve doğrulama sınırları geçerlidir.
