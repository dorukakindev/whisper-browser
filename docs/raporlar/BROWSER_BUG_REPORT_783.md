# Rapor783 — Ortak bileşenlerde hidden durumunu koruma

Başlangıç master ed956650d1f92b74d9917af7fe5f930a5928fd6e; ürün/test bitiş967e19613f9832723268f4a7ee15f21dd5ed57a7.

## Doğrulanan kök ve uygulama

R781 stüdyo düzeltmesi yalnız o yüzeydeki aynı CSS mekanizmasını kapatmıştı. Bu tur aynı mekanizma yeni bug sayısı olarak çoğaltılmadı; ortak kök uygulama seviyesine taşındı. `.hidden` sınıfı korunurken HTML `[hidden]` için ortak koruma yoktu. Gerçek dublaj şablonundaki dubListenPrevious başlangıçta hidden=true olsa da display:flex ve1layoutrect ile görünüyordu. Düzeltmesiz native test exit1; assertion gerçek computed display'i ölçtü.

styles.css mevcut temel gizleme kuralına `[hidden]:not([hidden="until-found"]) { display:none!important }` ekler. text-voice-studio.css içindeki R781'e ait yerel tekrar kaldırıldı. Böylece standart hidden kullanan düğme/flex/grid alanları aynı davranır; hidden kaldırıldığında kendi stilleri geri gelir. until-found sayfa-içi aramada bulunabilir durum olduğundan dışarıda bırakılır. [MDN hidden açıklaması](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/hidden) display override ve until-found ayrımını doğrular. Üçüncü parti kod/paket alınmadı; mevcut plain CSS/token sistemi kullanıldı.

## Dosya amaçları

- src/renderer/styles.css: shared semantic hidden koruması.
- src/renderer/text-voice-studio.css: yerel tekrarın kaldırılması; ortak kural devralınır.
- tests/electron-hidden783.smoke.js: gerçek main/preload/renderer ve ayrı profil ile üretim düğmesi görünürlüğü; dört ortak sınıfta hidden→shown roundtrip; until-found kutusunun display:none olmaması; TR koyu1360/EN açık800.

## Doğrulama

- Parent native exit1: hidden=true, display:flex, rects1. Final native exit0: iki temada display:none, rects0.
- Dört sınıfın gizle/göster turu native PASS: btn-secondary ve dub-generator-row/mw-actions flex; text-voice-fields grid geri gelir. until-found block kalır; find-in-page gerçek kullanıcı araması yapılmadı.
- `node --test tests/dub-generator-ui.test.js`:1dosyaPASS, mevcut üretim/iptal/arka plan aralık davranışları korunur.
- `tests/electron-book-reliability.smoke.js --workflow-context-only`: gerçekWindowsPDF/kısa kitap→iş ekranı→kitap bağlamı native exit0, workflowContext:true. Tam kitap/ses üretimi testi değildir.
- `node --check tests/electron-hidden783.smoke.js`, git diff --check PASS.
- [TR koyu](evidence783/tr-dark.png), [EN açık](evidence783/en-light.png), [ölçümler](evidence783/result.json). Görüntüler açılıp incelendi; ilk koşunun geçiş ara karesi final kanıtı sayılmadı, fontlar ve400ms sonrasında tekrar görüntülendi. Bu test doğrudan kalite bölümünü açar; kullanılabilir hazır ses göstermediğinden boş seçici beklenir.

## Tasarım inceleme sınırı

frontend-design/make-interfaces-feel-better önceki tur okundu ve mevcut sistem kullanıldı. İnceleme tipi full; kapsam ortak hidden görünürlüğü ve dublaj kalite bölümü. Typography ve surfaces için gerçek TR/EN görüntüleri; icons için mevcut ikonlar değişmedi; animation/performance için yeni hareket eklenmedi, yüzde10 hız incelemesi/profil yapılmadı. Gereksiz düğme kaldırılması kullanıcıya kullanılamaz eski sürüm sunulmasını önler. Tasarım bütün uygulamada kusursuz değildir. İkinci tema sistemi, tek tek yüzey yamaları ve boş alana yeni dekorasyon eklenmesi reddedildi. İncelenen davranışta açık medium/high bulgu kalmadı; tüm yüzey envanteri doğrulanmadı.

Yeni dependency/schema/IPC yok; ses motoru/ayarlar değişmedi. start.bat, fiziksel seçici, GPU/CUDA, model, canlı site ve tüm uygulama sayfaları çalıştırılmadı.11before-quit listener uyarısı sürüyor; test ağı bilerek kapalı. Tam npm/uzun CI tekrarı yok. P092/P097 için sınırlı ilerleme; P030 grup sürüm seçimi hâlâ açık, önceki ses dinleme ile tamamlandı sayılmaz.90aktifhedef sürer.
