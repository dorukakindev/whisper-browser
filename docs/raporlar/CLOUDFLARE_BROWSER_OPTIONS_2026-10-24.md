# Cloudflare ve gerçek tarayıcı uyumluluğu — 2026-10-24

Kullanıcı mevcut gömülü browser girişleri/Cloudflare döngüleri için Edge ve GitHub çözümlerini sordu. Bu çalışma araştırma ve mevcut kod okumasıdır; bypass uygulaması kurulmadı, ürün kodu değişmedi, canlı challenge denenmedi.

## Kaynak ve sonuç

- [Cloudflare supported browsers](https://developers.cloudflare.com/cloudflare-challenges/reference/supported-browsers/): gömülü/özelleştirilmiş tarayıcılar sınırlı desteklidir. Otomasyon tarayıcıları production challenge çözümünde desteklenmez. İçerik engelleyici ve API/UA değişiklikleri doğrulamaya müdahale edebilir.
- [Challenge solve issues](https://developers.cloudflare.com/cloudflare-challenges/troubleshooting/challenge-solve-issues/): güncel tarayıcı, JavaScript/storage/cookies, doğrulama servislerine erişim, oturum boyunca kararlı UA ve ağ teşhisi önerilir. Başarısızlık halinde RayID/hata kodu ve site desteği kullanılabilir. Hiçbiri her sitede başarı garantisi değildir.
- [FlareSolverr](https://github.com/FlareSolverr/FlareSolverr): README ayrı Selenium/Chrome açıp HTML ve çerez döndüren proxy servisi tarif eder; README CAPTCHAçözücülerinin çalışmadığını ayrıca uyarır. Kaynak yalnız okunmuştur; güncel bir korumayı geçtiği doğrulanmadı. Sürekli video/DRM/hesap/altyazı/dublaj içeren Electron browser'ın yerine doğrudan takılamaz. Kurulmadı, cookie/clearance aktarımı yapılmadı.
- [MicrosoftEdge/WebView2Browser](https://github.com/MicrosoftEdge/WebView2Browser): Microsoft'un Win32 C++/JS tab/mesajlaşma örneği; alternatif WebView2host prototipi için başvuru. Bu da gömülü tarayıcıdır, fullEdge profili/Cloudflare garantisi değildir. Depo klonlanmadı, kod kopyalanmadı.
- [Google nativeMessaging sample](https://github.com/GoogleChrome/chrome-extensions-samples/tree/main/api-samples/nativeMessaging): gerçek Chrome/Edge eklentisi ile yerel uygulama arasında desteklenen native messaging yaklaşımına örnek. [MDN açıklaması](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_messaging). Ürünümüze uygulanabilirlik henüz prototiple doğrulanmadı.

## Mevcut koddaki durum

src/browser-cloudflare-compat.js challenge işaretlerini algılar; mesajlar, host bazlı uyumluluk modu kayıtları vardır. src/main.js setBrowserTabCompatibilityMode/uninstallBrowserCaptureHooks yolları sayfa kancalarını kaldırıp debugger bağlantısını keser; renderer'da uyumluluk modu kontrolü zaten bulunur. Bunlar mevcut koddan okunan davranışlardır; bu tur sitelerde işe yaradığı gösterilmedi. Kullanıcıya zaten var olan özellik yeni yapılmış diye sunulmamalıdır.

## Önerilen sıra

1. Gerçekte takılan bir URL'de güncel normal Edge ile mevcut gömülü browser'ın kullanıcı tarafından yapılan doğrulamasını karşılaştır. Güncel tarayıcı, çerez/storage, doğrulama isteğinin engellenmemesi ve mevcut uyumluluk modunu teşhis et. RayID ve hata sınıfı kişisel log paylaşmadan kaydedilebilir. Yalnız User-Agent'a Edge yazmak çözüm diye sunulmasın.
2. Uygulama içi kalmak gerekiyorsa WebView2 ayrı opsiyonel motor prototipi olarak denenebilir. Mevcut gelişmiş Whisper altyapısını topluca taşıma. Win32host, Electron sınır/odak/modal, medya yakalama, senkron ve kalıcılık ayrı entegrasyon ister; sadece UA taklidi değildir.
3. Daha sağlam aday: kullanıcının gerçek Edge/Chrome sekmesi + dar kapsamlı eklenti + native messaging yerel köprüsü. Kullanıcı ilgili siteye kendisi giriş/doğrulama yapar. Eklenti kullanıcının açıkça bağladığı sekmede altyazı overlay'i ve medya seek/play/pause/dublaj senkronunu sağlar, yerel Whisper dönüştürme/çeviri/TTS uygulamada kalır. Sekme/site sınırı, opaque job kimlikleri, native host allowlist ve şema/boyut kontrolleri gerekir. Genel cookie/HttpOnly/token okuma veya bütün sekmelerde sınırsız kod yürütme yetkisi gerekmemelidir.

Bu tasarım Cloudflare atlatma garantisi değildir; desteklenen normal tarayıcı ortamında kullanıcı doğrulamasının çalışmasına ve mevcut ürün özelliklerinin bağlanmasına yöneliktir. DRM/cross-origin iframe/sekme ses yakalama sınırları nedeniyle her video/özelliğin eklentiye aynen taşınacağı iddia edilemez. Kaynaklar araştırıldı; lisans, kaynak ref'i ve gerçek sayfa testleri uygulama turunda ayrıca incelenmelidir.
