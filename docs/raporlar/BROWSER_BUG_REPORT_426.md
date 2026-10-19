# 426 — Sayfa menüsünde görünür reklam engelleyici ve açık tercihinin korunması

## Bulgular ve düzeltme

Kullanıcı YouTube'da reklam görmeye devam ettiğini, korumanın açık olup olmadığını anlayamadığını bildirdi. Çalışan süreç kaynak Electron uygulamasıydı. Kayıtlı ayarların yalnız ilgili açık alanları okundu: genel reklam koruması false, otomatik reklam atlama true, SponsorBlock auto; YouTube için kapalı site istisnası bulunmadı. Gerçek profil değiştirilmedi, uygulama kapatılmadı.

1. Doğrulanmış hata: renderBrowserAdblockState, requested=true fakat enabled=false olan loading/error olayında checkbox'ı false yapıyordu. collectUiSettings aynı checkbox'ı kaydettiğinden geçici motor durumu kalıcı kullanıcı tercihini kapatabiliyordu. Regresyon testi bu yolu yeniden üretir. Kayıtlı false değerinin geçmişte kesin hangi olayda yazıldığı kanıtlanamaz. Artık requested kullanıcı tercihini, enabled ise çalışma durumunu temsil eder.
2. Eksik görünürlük: ⋯ → Sayfa bölümünün ilk öğesi artık Reklam engelleyici: Açık / Kapalı. Mevcut kalkan düğmesinin gerçek IPC akışına vekildir. Genel koruma kapalıysa açar; açıkken mevcut sitenin korumasını değiştirir. Hazırlanıyor durumunda bekler; hata durumunda yeniden denemeye izin verir. Türkçe/İngilizce metin ve aria-checked günceldir.
3. Test yalıtımı: WHISPER_RESOURCE_SOAK_USER_DATA seçimi başlangıç reklam/GPU tercihleri okunmadan önceye taşındı; ayrı test profili artık gerçek kullanıcının başlangıç ayarlarını devralmaz. Normal start.bat yolu değişmedi.

SponsorBlock zaten mevcuttu ve otomatikti; YouTube'un sunduğu reklamlarla içerik içi sponsor bölümleri farklıdır. Resmî [SponsorBlock deposu](https://github.com/ajayyy/SponsorBlock), [Ghostery sürümleri](https://github.com/ghostery/adblocker/releases) ve [uAssets quick fixes](https://github.com/uBlockOrigin/uAssets/blob/master/filters/quick-fixes.txt) incelendi. Bu işte yeni motor/uzantı veya bağımlılık eklenmedi.

## Kanıt ve sınırlar

- Windows gerçek src/main.js + renderer, bağımsız geçici profil: başlangıç Kapalı; üç gerçek fare tıklamasıyla Açık → Kapalı → Açık; gerçek API enabled=true, kaydedilecek tercih=true; EN etiketi Ad blocker: On. Kapalı/Açık ekran görüntüleri incelendi. Özel test çıktıları tmp/adblock-menu-1792036516303 altında Git dışındadır.
- node --test --test-isolation=none ile browser-adblock-ui, browser-adblock, browser-menu-proxy, browser-site-profiles, dom-innerhtml-ratchet, settings-ui-persist-roundtrip, ui-locale geçti. İlk izole test-runner denemesi Windows sandbox spawn EPERM verdi; aynı testler süreç yalıtımı olmadan geçti. Eşik/test silinmedi.
- npm run test:electron-bridge geçti. main.js, renderer.js, ui-locale.js node --check ve git diff --check temiz.
- DOM güvenlik ratchet listesinde yalnız eklenen satırlardan etkilenen sekiz konum düzeltildi; izin kapsamı genişletilmedi.
- Bu tur start.bat üzerinden yeni açılış, oturumlu YouTube reklamı, tam npm test veya tüm reklam türleri denenmedi. Gerçek Electron test harness'ı normal Windows başlatıcısının doğrulaması değildir. Kullanıcının talimatıyla CI beklenmez. Önceki reklam düzeltmelerinin anonim test başarısı tüm hesaplara garanti değildir.

Kullanım: uygulamayı kapatıp start.bat ile aç; ⋯ → Sayfa → Reklam engelleyici: Kapalı öğesine tıklayıp Açık yap. Site değiştirince etiket etkin site politikasını izler. Ürün düzeltmesi kullanıcının mevcut açık uygulamasına yeniden başlatmadan yüklenmez.
