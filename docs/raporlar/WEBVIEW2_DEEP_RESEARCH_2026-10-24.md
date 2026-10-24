# WebView2 araştırması ve Ancient Origins karşılaştırması — 2026-10-24

Kullanıcı uygulama içinde WebView2, haber sayfasını okuyabilen ortak asistan ve daha derin araştırma istedi. Örnek site Ancient Origins olarak geldi. Ürün motoru değiştirilmedi. Microsoft, Google, Cloudflare belgeleri ve gerçek kaynak kodları incelendi; ayrıca aynı makinede iki motorla ayrı profil denemeleri yapıldı.

## Gerçek ölçüm

| Sayfa | Mevcut Whisper: Electron43.5.0 / Chromium150.0.7871.250 | Bağımsız WebView2 Runtime155.0.4283.62 |
|---|---|---|
| Ancient Origins ana sayfa | Normal ve uyumluluk modunda açıldı | HTTP200, açıldı |
| `/user/login` | Uyumluluk modunda giriş formu göründü | HTTP200, giriş formu göründü |
| Açık Liangzhu haberi | Article metni7083karakter; mevcut asistan köprüsü51blok/4840karakter aldı | HTTP200; ExecuteScriptAsync ile7083karakter article metni alındı |

[Haber adresi](https://www.ancient-origins.net/news-history-archaeology/liangzhu-cemetery-ritual-platform-00103297).

Bu koşumlarda hiçbir sayfada challenge işareti görülmedi. Dolayısıyla WebView2'nin Cloudflare sorununu çözdüğü gösterilemedi; kullanıcının önceki problemi de çürütülmüş değildir. Giriş formunun açılması başarılı hesap girişi değildir. Parola girilmedi, form gönderilmedi, CAPTCHA çözülmedi, üyelik içeriğine erişilmedi. Kullanıcının profili ve anahtarları kullanılmadı. C# probu ayrı bir araştırma penceresiydi; Electron içine tamamlanmış entegrasyon değildir. Viewportlar farklıydı; ekran görüntülerinden performans veya tasarım üstünlüğü çıkarılmadı.

Ana sayfada dar `article.innerText` ölçümü0döndü ama gerçek uygulama bağlam API'si8937karakter aldı; tek ölçüm metin yokluğu diye yorumlanmadı. Electron bir üçüncü taraf iframe isteğini ERR_BLOCKED_BY_CLIENT ile engelledi; ana sayfa yüklemesi başarılıydı. Haber sonucundan sonra capturePage hatası geldi ve eski prob catch'i ikinci sonuç satırı ekledi. Bu ikinci navigasyon değildir; metin ölçümü başarılı, o ekran yakalaması doğrulanmamıştır. Teslim edilen prob kaynağında capture hatası ayrı tutulur.

Yerel kanıtlar (Git'e alınmadı): `.uiprev/ancient-electron-1792870052972/`, `.uiprev/ancient-electron-1792870205950/`, `.uiprev/ancient-webview2-20261024/`, `.uiprev/ancient-webview2-article-20261024/`. Ana sayfa görselleri okunabilir boyutta incelendi. [Tekrarlanabilir prob kaynakları](probes/webview2-20261024/README.md).

## Kararı etkileyen bulgular

- **WebView2 normal Edge değildir.** Production uygulaması Edge Stable kurulumunu motor olarak kullanamaz; WebView2 Runtime gerekir. Microsoft çoğu uygulama için otomatik güncellenen Evergreen modelini önerir. [Distribution](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution), [Evergreen](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/evergreen-vs-fixed-version).
- **Google giriş sorunu motor seçiminden ayrıdır.** Masaüstü API yetkilendirmesinde sistem tarayıcısı ve loopback dönüşü kullanılır. API token'ı YouTube web oturumu değildir; normal Edge oturumu WebView2'ye otomatik taşınmaz. Eski GitHub yorumları bugünkü her Google girişinin çalışıp çalışmadığına kanıt değildir. [Google desktop OAuth](https://developers.google.com/identity/protocols/oauth2/native-app), [embedded policy](https://developers.googleblog.com/en/upcoming-security-changes-to-googles-oauth-20-authorization-endpoint-in-embedded-webviews/), [Microsoft discussion3828](https://github.com/MicrosoftEdge/WebView2Feedback/discussions/3828).
- **Cloudflare desteği sınırlıdır.** JavaScript, storage, çerezler, doğrulama servisinin engellenmemesi ve oturum boyunca kararlı tarayıcı kimliği önemlidir. Mobil WebView rehberi bütün Windows Managed Challenge akışlarını garanti etmez. [Destek](https://developers.cloudflare.com/cloudflare-challenges/reference/supported-browsers/), [hata teşhisi](https://developers.cloudflare.com/cloudflare-challenges/troubleshooting/challenge-solve-issues/), [WebView gereksinimleri](https://developers.cloudflare.com/turnstile/get-started/mobile-implementation/).
- **Kalıcı profil ayrı olmalı.** Normal Edge profilini kopyalamadan, uygulamaya ait yazılabilir UserDataFolder kullanılmalı. Geçmiş/favori ortak ürün modelinde tutulabilir; çerez ve izinlerin motorlar arasında ortak olduğu varsayılmaz. [User data](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/user-data-folder).
- **RAM kazancı garanti değil.** Electron çalışmaya devam ederken WebView2 ayrı browser/renderer/GPU süreçleri ekleyebilir. Yalnız gerektiğinde başlatma ölçülmelidir. [Process model](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/process-model).
- **Asistanın görünürlüğü özel çalışma ister.** Native yüzey menüleri ve asistanı örtebilir. WPF CompositionControl örneği Electron'a doğrudan takılan çözüm değildir. Z-order, DPI, focus, modal ve fullscreen kendi uygulamamızda doğrulanmalıdır. [Airspace](https://learn.microsoft.com/en-us/microsoft-edge/webview2/platforms/wpf).
- **Sayfa okuma ve çeviri teknik olarak mümkün.** ExecuteScriptAsync ve frame API'leri vardır. Ancak URL/origin/navigation kimliği her sonuçta doğrulanmalı; sayfa yerel anahtarlara veya genel shell/JS vekiline erişmemelidir. Gereksiz host object ve web mesaj yetenekleri kapalı tutulmalıdır. [JavaScript API](https://learn.microsoft.com/en-in/microsoft-edge/webview2/how-to/javascript), [güvenlik](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/security).
- **Popup akışları korunmalı.** NewWindowRequested, deferral, profil ve opener ilişkisi ayrıca ele alınmalıdır. Popup kodu Google OAuth politikasını kendiliğinden çözmez. [Popup API](https://learn.microsoft.com/en-us/dotnet/api/microsoft.web.webview2.core.corewebview2.newwindowrequested).

## GitHub kaynakları: alınabilecek parça ve karar

| Depo/ref | Kaynakta incelenen | Karar |
|---|---|---|
| MicrosoftEdge/WebView2Samples main `8f5ad22c39f3b2825c9a1f23cb0fa4e1cb13e4c8` (2026-10-20) | WinFormsBrowserForm1490satır:UserDataFolder347/551/555/1028,ExecuteScript644/654/1187/1228,ProcessFailed184/950+; WPFsample da okundu | Güncelhost/profil/navigation/recovery örneği; öncebu esasalınmalı |
| MicrosoftEdge/WebView2Browser main `5b03bc945d77241cf27294f7a9205a4092857a06` (2023-07-31) | BrowserWindow.cpp960satır:controller239/275,resize99/482 | Eski örnek; güncelsanıp temelalma, tab/host yaklaşımı referans |
| tauri-apps/wry dev `713aee46beffba6c49577380cd7cdc52b474f336` (2026-10-23) | webview2/mod.rs2032satır:environment357,controller390+,bounds1340/1618 | Nativeparent/resize/STA/profile yaklaşımı yararlı; Rust/Tauri'ye tamgöç gerekmez |
| chromiumembedded/cef master `e537569ecda2e3f23ffdac559ecf7f80b8e59467` (2026-10-23) | ResmîREADME/embeddedChromiummodeli | EkChromiummotoru; Cloudflarekazanımı kanıtlanmışdeğil, şimdiöncelikli değil |
| kepano/defuddle main `97b20c7022f88b5da73059f08f6b79d2117cb8a9` (2026-10-24) | README/articleextraction; yereldepin0.19.5zatenvar | Mevcuttemizhaberçıkarıcısını yenidenkullan; sırfaraştırmaçıktıdiye güncelleme |
| mozilla/readability main `ab4027a8b37669745016869a37a504727992b2ba` (2026-07-09) | README/articleextractionyaklaşımı | Karşılaştırmaalternatifi; yeniçiftdependencyşartdeğil |
| FlareSolverr/FlareSolverr | Proxy/HTML-cookiebrowserautomation ve READMEsolveruyarısı | Kullanıcının etkileşimlivideobrowser'ının yerinegeçmez;varsayılanalma |

Depoların defaultref/SHAları GitHubAPI'den okundu; buSHA'dakitümsatırlardenetlendi iddiasıyok. BazıwebsearchGitHubCloudflareissueURLlerialınamadı. AyrıunauthGitHubsearchAPI sorgusunda WebView2FeedbackCloudflareiçin3çoğualakasız/eskiissue,Turnstileiçin0bulundu; sorgusınırlıdır, hiçsorunyok veyaCloudflaretamuyumlu kanıtıdeğildir. WebView2Browser'master'API404döndü; metadataile gerçekdefaultmainbelirlendi. Kaynak kodlar incelendi,kopyalanmadı; lisans/SDKpinreview ürünuyarlamasında yapılmalı.


## Bizde korunacak altyapı

`browser-reader.js` içindeki mevcut çıkarıcı ve Defuddle0.19.5 yeniden kullanılabilir. `browser-page-translate.js` blok taraması,8hedeflik çeviri grupları, komşu bağlam, korunan token kontrolü ve sayfaya uygulama mantığını zaten içerir. Main'deki sayfa bağlamı, sağlayıcı ayarları ve istek doğrulaması korunmalı. Yeni motor yalnız script çalıştıran taşıyıcı ve pencere yönetimini değiştirmelidir.

`global-assistant.js`, `aiChatContext`, `aiSourceScope` aynı asistanı ve kaynak sınırını koruyabilir. Yeni WebView2 sayfası video altyazısı gibi sunulmamalı. `browser-adapters.js` siteye özel medya yakalama adaptörüdür; tarayıcı motor arayüzü değildir. Mevcut Cloudflare uyumluluk modu kancaları kaldırıp debugger bağlantısını keser; bu özellik yeni yapılmış gibi gösterilmemelidir.

## Önerilen uygulama ve kabul ölçütleri

Aynı arayüzde seçilebilir Electron/WebView2 motoru önerilir. Mevcut YouTube/altyazı/dublaj varsayılanı korunur; WebView2 önce genel web/haber için opsiyonel olur. Tam Tauri/CEF göçü veya FlareSolverr kurulumu için kanıt yok.

Motor arayüzü navigate, back, forward, layout, hide, readPage, translatePage, restorePage gibi belirli komutlar sunmalıdır. ReadPage başlık/paragraf/URL ve navigation kimliği döndürür; form, parola, cookie ve token asistan bağlamı olmaz. Metindeki talimatlar güvenilmeyen kaynak verisi olarak işlenir. Menü veya haber önerileri, asıl haber diye özetlenmemelidir.

“Sayfayı özetle” güncel metinle ortak AI çağrısı yapmalıdır. “Sayfayı Türkçeye çevir” gerçek sayfa çeviri işi başlatmalı; yalnız sohbet kutusuna çeviri yazıp işlem yapılmış gibi sunmamalıdır. İlerleme, durdurma, başarısız bloklar ve özgüne dönüş korunmalıdır. Sekme/SPA değişiminde geç sonuç yeni sayfaya uygulanmamalıdır.

İlk ürün prototipinde doğrulanması gerekenler: uygulama içi host ve DPI; haber okuma; asistandan özet; yerinde çeviri ve özgüne dönüş; iptal; sekme/SPA değişimi; kalıcı profil; popup/izin arayüzü; asistanın native yüzey üstünde erişilebilirliği; host çökünce mevcut işin korunması; YouTube/dublaj regresyonu; gerçek challenge çıkarsa kullanıcı doğrulaması; runtime eksikliğinde anlaşılır geri dönüş. Bu liste çalıştırılmış testler değildir.

## Kurulum ve araştırma sınırları

Prob için resmî NuGet'ten Microsoft.Web.WebView2 **1.0.4022.49** yalnız ignore edilen tmp alanına indirildi. Yerelde var olan .NET10SDK/WindowsDesktop runtime ve WebView2 kullanıldı. Ürüne dependency, paket veya kurulum değişikliği eklenmedi. İlk SDK çalışması güvenilmeyen ASP.NET geliştirme sertifikası üretildiğini bildirdi; trust komutu çalıştırılmadı. Sonraki komutlarda sertifika üretimi kapatıldı. İlk build takıldı; yalnız doğrulanan task PID durdurularak yeniden derlendi. İlk build'deki kullanılmayan WPF assembly'si kaynaklı WindowsBase uyarısı sonraki ölçümde bastırıldı; uyumsuzluğun çözüldüğü iddia edilmez.

Ürün WebView2 entegrasyonu, gerçek asistan/AI sayfa çevirisi ve kullanıcı girişleri bu araştırmada tamamlanmadı. Kullanıcının son yönlendirmesi araştırma ve ardından mevcut browser asistanını gerçek sayfalarda sınayıp geliştirmektir.
