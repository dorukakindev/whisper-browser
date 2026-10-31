# Rapor 818 — Ajanlarla tasarım ve klavye denetimi; yalnız rapor

31 Ekim 2026. **Üç doğrulanmış güncel bulgu: bir HIGH, iki MEDIUM. Hiçbir düzeltme uygulanmadı.** Kullanıcının son tasarım kapsamı korundu; işlevsel backend taramasına dönülmedi. Önceki R815/R817 bulguları toplamı artırmak için yeniden sayılmadı. Bu raporun bağımsız kimlikleri D818-01–03'tür.

Denetim tabanı: **`1e9a9afd20da5d851e373df02f08984410c87ed5`**, başlangıç `master`, çalışma dalı `codex/design-audit818`. Bu taban, önceki raporların **535236d7** düzeltmesini içerir. [Düzeltme durum kaydı](evidence815/remediation-2026-10-31/README.md) okundu: R817'nin beş bulgusu ve iki önerisi uygulanmış; R815-B63 azaltılmış fakat açık. Tarihsel [R817](BROWSER_BUG_REPORT_817.md) “açık” metni bugün bütün kusurların hâlâ mevcut olduğuna kanıt sayılmadı.

Üç ajan açık kullanıcı tercihine uygun **GPT‑6.1 Sol / medium** ile diyaloglar/ayarlar, browser panelleri ve okuyucu/ses yüzeylerini ayrı taradı. Ana ajan aşağıdaki üç adayı gerçek Windows Electron renderer'ında doğruladı. AGENTS, YENI-BILGISAYAR, güncel devir, Night1000 README ve F46/F47 mekanizma imzaları önceden kontrol edildi. [Manifest](evidence818/manifest.json) revizyon, kaynak/kanıt hashleri ve geçmiş imzaları bağlar; eski 1000 senaryo yeniden koşulmadı.

## Kapsam ve kanıt

`make-interfaces-feel-better` **full** inceleme modu, [Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md) kontrol çerçevesi. Mevcut düz CSS ve grafit/amber tasarım korunarak sorunlar tarif edildi. Yeni bir stil sistemi/palet/bağımlılık önerilmedi.

| Kategori | İncelenen | Sonuç/sınır |
|---|---|---|
| Tipografi | Metin stüdyosu %100/%150/%200, TR/koyu ve EN/açık | D818-01 yazı büyütmede içerik kaybı; tüm font/kontrast denetimi yapılmadı |
| Yüzey/yerleşim | Ses stüdyosu, ayarlar ve arka oyuncu; browser yan panel/sinyal/düzen menüsü | D818-01/02; iki browser taşma adayı gerçek ölçümde elendi |
| Animasyon | Yerleşim oturduktan sonra görüntü alındı | %10 hız/reduced-motion hareket incelemesi yapılmadı; hareket kusuru sayılmadı |
| İkon/etkileşim | Ayar kapatma düğmesi, dil select'i, yan panel menüsü; native tuş girdisi | D818-02/03; tüm hover/ikon durumları taranmadı |
| Performans | Hedefli DOM geometrisi; asenkron çıkışın tamamlanması beklendi | FPS/GPU/uzun oturum profili yok; performans kusuru sayılmadı |

Kanıt: [design-proof.cjs](evidence818/design-proof.cjs), [measurements.json](evidence818/measurements.json), dokuz Windows PNG. Gerçek `src/main.js`, preload ve renderer kullanıldı; ses yapılandırması/başvuru listesi ve feed IPC'leri kontrollü boş fixture. Ses/GPU/LLM işi başlatılmadı. %200 Electron yakınlaştırması fiziksel Windows DPI değişimi değildir. Ortam taban DPR **1,5**, %150'de **2,25**, %200'de **3**; PNG piksel boyutları CSS viewport'tan bu yüzden farklıdır. 940×680 içerik boyutu istendiğinde gerçek ölçüm **940×682**; bu rapor ölçülmüş viewport'u kullanır, ürün minimumu düşürülmedi.

## Bulgular

“After” önerilen tasarım/davranıştır; uygulanmış sonuç değildir.

| Severity | Location | Before | After | Why |
|---|---|---|---|---|
| HIGH · D818-01 | [text-voice-studio.css:1](../../src/renderer/text-voice-studio.css#L1), 3,7,22,33,57–60 | %200 kısa pencerede başlık/alt eylemler bütün yüksekliği tüketiyor; çalışma gövdesi 0px | Kısa yüksekliğe göre ortak kaydırma veya küçülen başlık/alt alan; metne her zaman görünür erişim | Büyütmeye ihtiyaç duyan kullanıcı metin girişi ve ses seçim alanına görsel olarak erişemiyor |
| MEDIUM · D818-02 | [renderer.js:27293](../../src/renderer/renderer.js#L27293), 27333; [media-home.js:55](../../src/renderer/media-home.js#L55) | Native ayar diyaloğunda Backspace, arka oyuncuyu kapatıp ana sayfaya dönüyor | Modal açıkken arka oyuncu kısayolunu engelle; tuşun sahipliğini diyaloğa bırak | Modal kullanıcı bağlamını korumuyor; arka çalışma alanı görünmez biçimde değişiyor |
| MEDIUM · D818-03 | [app-settings-ui.js:71](../../src/renderer/app-settings-ui.js#L71), 117 | Dil değişimi diyaloğun ağacını yeniden oluşturuyor, SELECT odağı BODY'ye düşüyor | Aynı kontrole/uygun eşdeğerine odağı geri yükle veya aktif alanı sökmeden çevir | Klavyeyle ayar değiştirme akışı kesiliyor ve görünür odak kayboluyor |

### D818-01 — Metin stüdyosunun gövdesi %200 yakınlaştırmada tamamen yok oluyor

**Tekrar:** Metin ve ses → Ses stüdyosunu aç (`TextVoiceStudioUI.open()`), minimum civarı 940×680 içerik boyutunda %200 yakınlaştır. Boş referans/motor durumunda bile metin yazma alanı erişilebilir kalmalıdır; üretimin hazır olması gerekmez.

**Gözlenen:** Ölçülmüş viewport %100'de **940×682**, gövde client yüksekliği **381px**; %150'de **626×454**, gövde **176px**. %200'de **470×341**, gövde **0px**, içeriği **1365px** yüksekliğinde. Kaydırılabilir elemanın görünür alanı sıfır olduğundan kaydırma çubuğu da metne erişim sağlamıyor. EN/açık temada da 0/1365px. [Normal kontrol](evidence818/01-textvoice-100.png), [%150 kontrol](evidence818/02-textvoice-150.png), [TR/koyu %200](evidence818/03-textvoice-200.png), [EN/açık %200](evidence818/04-textvoice-en-light-200.png).

**Kök:** Sabit viewport yüksekliğindeki `overflow:hidden` modal; flex-column kabuk; gövdede `flex:1/min-height:0`; footer'da `flex-shrink:0`. Dar kırılımda çıktı adı ve eylemler birden fazla satır kaplıyor; kısa yüksekliğe göre bir alternatif yok. Küçülebilen tek alan çalışma gövdesi. Kontrolü Tab ile odaklamak görünür alanı geri getirdi diye iddia edilmez; ölçülen sorun görsel erişim kaybıdır.

**Önceki kapsam:** [R732](BROWSER_BUG_REPORT_732.md) alt eylem yerleşimi/hedefleri, [R751](BROWSER_BUG_REPORT_751.md) masaüstü metin/ayar kaydırma ayrımı farklı köklerdir. Onların %125 kabulü bu kısa %200 yükseklik bütçesini kanıtlamıyordu. R817 paletinin taşması bu başka CSS/surface kökünden ayrıdır; eski onarımın tekrar sayımı değildir.

**Kabul ölçütü:** 940×680, %100/%125/%150/%200, TR/EN ve açık/koyu kombinasyonlarında metin girişi/ayarlar için anlamlı görünür kaydırma alanı kalmalı. Uzun footer hata metni de gövdeyi sıfırlamamalı. Gerekirse tüm diyalog kaymalı; sadece taşmayı gizleme uygulanmamalı.

### D818-02 — Ayarlar açıkken Backspace arkadaki oyuncudan çıkıyor

**Tekrar:** Stüdyodan Player görünümünü aç → Ayarlar → Görünüm ve araçlar → kapatma düğmesine odaklan → Backspace. Kanıt, boş oyuncu üzerinde ve gerçek Electron `sendInputEvent` keyDown/keyUp ile çalıştı; video dosyası, kişisel medya veya site hesabı gerekmiyor.

**Gözlenen:** Önce `layerHidden:false`, `home:false`, `dialog:true`; Backspace'ten sonra asenkron çıkış tamamlandığında **`layerHidden:true`, `home:true`, `dialog:true`**. Ayarlar hâlâ açıkken arka çalışma alanı ana sayfaya geçti. [Önce](evidence818/05-modal-before.png), [Backspace sonrası](evidence818/06-modal-after-backspace.png). Pozitif karşı kontrol: aynı native diyalogda Escape yalnız diyaloğu kapattı; **oyuncu açık kaldı** (`layerHidden:false`, `dialog:false`): [Escape kontrolü](evidence818/07-modal-escape-control.png). Aktif video/ses kesildiği veya iş verisi kaybolduğu test edilmedi; o etkiler iddia edilmez.

**Kök:** Global oyuncu handler'ı `_activeModal` yönetilen modalleri koruyor. Native `dialog[open]` koruması Escape dalında var; Backspace dalında yok. Düğme, metin alanı muafiyetine de girmez. `closePlayer()` → asenkron `MediaHomeUI.returnHome()` çalışır. Tuşun hemen ardından ölçüm önce negatif görünebilir; kanıtta **1,5 saniye** beklendi.

**Önceki kapsam:** [R193](BROWSER_BUG_REPORT_193.md) “diyalog altında Backspace” kaydının `_activeModal` koruması güncel kaynakta mevcut. Bu kaydı yeni keşif diye yeniden saymıyoruz: bu tur o korumanın **native `<dialog>` ayar yüzeyini kapsamayan kolu** doğrulandı. Aynı eksik korumanın çeşitli düğmelerini farklı buglara bölmedik. Ctrl+T adayı elendi: `runBrowserShortcut()` native diyalog korumasına sahip.

**Kabul ölçütü:** Native modal açıkken Backspace veya diğer arka oyuncu tuşları çalışma alanını değiştirmemeli; input/textarea düzenleme davranışı korunmalı. Escape native cancel'ı çalıştırmalı. Hem `_activeModal` hem native dialog kontrolleri aynı senaryoda yer almalı. Asenkron işlemler bittikten sonra son UI durumu ölçülmeli.

### D818-03 — Arayüz dili değişince klavye odağı kayboluyor

**Tekrar:** Ayarlar → Görünüm ve araçlar → Arayüz dili select'ine klavyeyle odaklan → TR'den EN'ye geç. Kanıt select'e focus verdi, ardından **Chromium native Home/Enter girdisi** gönderdi; sadece JavaScript `dispatchEvent` kanıtı değildir.

**Gözlenen:** Önce `focusId:uiLocale`, `focusTag:SELECT`, locale TR. Dil EN olunca diyalog açık kalıyor ancak **`focusId:""`, `focusTag:BODY`**; select'in odak halkası kayboluyor. [Önce](evidence818/08-language-before.png), [Sonra](evidence818/09-language-after.png). Dil değişiminin kendisi başarılı; bug çevirinin çalışmaması değildir. Sonraki Tab'ın tam sırası ve ekran okuyucu anonsu bu tur ölçülmedi.

**Kök:** `ui-locale-change` → `draw()` → ödünç kontrolleri `restore()` ile geri taşıma, `replaceChildren()` ve yeniden kurma. Aktif kontrol sökülüyor, yeniden eklenen kontrolün odağı geri yüklenmiyor. Burada verinin kaybolduğu veya ayar kaydının başarısız olduğu iddia edilmez.

**Önceki kapsam:** R817-D01 arama indeksinin farklı sözleşmesiydi ve güncel düzeltmesi bu tur tekrar bug sayılmadı. Dil seçimi sırasında odağın korunması burada ayrı kullanıcı akışı/yaşam döngüsü sınırıdır.

**Kabul ölçütü:** TR↔EN geçişinde odak aynı dil kontrolünde kalmalı; görünür odak halkası ve native modal Tab sınırı korunmalı. Diğer ayar değerleri korunmalı. Fareyle değiştirme sonrası gereksiz başka alana odak atlaması oluşmamalı.

## Ayrı takip adayları ve elenenler

Bu tablo **üç bug toplamına dahil değildir**; öneriler yeni doğrulanmış bug gibi sunulmaz.

| Aday | Karar / gerekçe |
|---|---|
| Native kitap onay diyaloğuna erişilebilir ad ekleme | `media-workflows-ui.js:52–101` helper'ında ad bağı incelemeye değer. Gerçek AX ağacı/onay akışı alınmadı; bu tur öneri/takip olarak kaldı. |
| PDF zoomun seçilmiş okuma yazı boyutunu yeniden hesaplaması | İzole fonksiyon probu 28→23px gösterdi; R815-B01'in PDF font invariantına yakın. Yeni bug sayılmadı; eski kaydın ek sınırı olarak incelenmeli. |
| Browser sinyal popover'ının dar panelde kırpılması | Gerçek 1100px pencere +520px panelde workspace554px, popover460px; sığıyor. Daha dar mod panel takeover yapıyor. Varsayılan CSS'den kesin taşma sonucu çıkarılmadı. |
| Sağ panel düzen menüsünde viewport/container koordinatı karışması | Gerçek açık menü x860..1076, pencere1100; doğru yerde ve görünür. Kaynak şüphesi bug sayılmadı. |
| Ayarlar açıkken Ctrl+T sızıntısı | Yalıtılmış handler stub'ı yanlış pozitifti; tam uygulamada tab sayısı değişmedi, gerçek shortcut native dialog guard'ına sahip. |

## Doğrulama ve sınırlar

```powershell
node --check docs/raporlar/evidence818/design-proof.cjs
& ./node_modules/electron/dist/electron.exe docs/raporlar/evidence818/design-proof.cjs
```

Son kanıt koşusu gerçek Windows süreç çıkışı **0**, **ok:true**, **9 görüntü**. `design-proof.cjs` doğru sözleşmelerle boş ses config/reference/history ve boş feed döndürür; bu kontrollü hazır-olmayan UI durumudur, gerçek ses motoru/sağlayıcı kabulü değildir. Main-process fetch dış istekleri reddeder; bu tek başına backend'in bütün ağını engelledi iddiası değildir. Görüntüler fonts.ready ve bekleme sonrası alındı. Ürün veya mevcut testler değiştirilmedi. İlk kanıt sürümü Escape'in kaldırdığı dialogu okumaya çalıştığı için durdu; yalnız kanıt betiği optional access ile düzeltildi. Bu ürün bugı veya ürün düzeltmesi sayılmadı.

`start.bat` ve `install.bat` kaynakları yeniden okundu; normal Windows açılış/DRM onarma akışı ve kurulum çalıştırılmadı. Normal açılışın start.bat üzerinden yapılması gereği korunur. İzole Electron harness'in açılması start.bat/GPU/CUDA kabulü değildir. PowerShell JSON/UTF-8 ve gerçek Türkçe etiketler kullanıldı; gerçek dosya seçici, fiziksel DPI değişimi, GPU/native video, ücretli sağlayıcı, ses kalitesi, gerçek site/hesap, tam klavye/ekran okuyucu, hareket/kontrast taraması doğrulanmadı. Tam `npm test`, backend transkripsiyon, CI sonucu bu belge işi için çalıştırılmadı/beklenmedi; testler kapatılmadı.

**Karar: Block (incelenen tasarım kabulü için).** D818-01 HIGH görünür erişimi engelliyor; D818-02/03 açık. Bu bütün ürünün çalışmadığı hükmü değildir. Yukarıdaki kapsam/sınırlar geçerlidir; hiçbir düzeltme uygulanmadı.

**Görüntü alma sınırı:** İlk capturePage denemelerinde bazı kareler bayat kaldığından yayımlanmadı. Son seçili dokuz kare aynı senaryonun CDP Page.captureScreenshot / fromSurface:false koşusundan, her biri tam boy incelenerek alındı. Native pencere düğmeleri ve aynı uygulamanın asistan balonu bu yakalamada görünebilir; yeni bulgu sayılmadı.
