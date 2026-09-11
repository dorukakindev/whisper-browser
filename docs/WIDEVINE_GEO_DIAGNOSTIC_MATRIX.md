# Widevine ve web oynatma tanı matrisi

Bu katman DRM veya coğrafi kısıtı aşmaz. Yalnız Electron/Chromium'un resmi
`components`, EME, HTMLMediaElement, GPU feature status ve `session.webRequest`
yüzeylerinden gelen gözlenebilir kanıtları sınıflandırır.

## Kanıt akışı

1. Korumalı servis açıldığında Castlabs component durumu, `requestMediaKeySystemAccess`
   ve AVC/AAC codec desteği ayrı ayrı ölçülür.
2. Tarayıcı partition'ındaki ana belge, playback API, lisans ve medya isteklerinin
   HTTP/ağ sonuçları izlenir. Resim, font, reklam pikseli ve iptal edilmiş istekler
   tanı matrisine alınmaz. Aynı partition'ı kullanan giriş popup'larının istekleri
   etkin video `webContentsId` değeriyle ayrılır.
3. HTML video örneği `readyState`, medya hata kodu, zaman ilerlemesi, kare sayısı
   ve görünür yükleme göstergesiyle izlenir.
4. Kanıtlar query, fragment, Authorization, cookie, API anahtarı ve JWT değerleri
   çıkarıldıktan sonra renderer'a gider. Aynı kanıt beş saniye içinde tekrar
   yayınlanmaz; kalıcı HTML medya hatası yalnız durum geçişinde yeniden üretilir
   ve son 24 tanı tutulur.

## Karar sınırları

| Sınıf | Gözlenebilir kanıt | Güven | Kesin söylenmeyen |
|---|---|---|---|
| CDM component yok/hatalı | `components` API yok veya hazırlama reddi | Yüksek | Bölge/abonelik |
| EME API yok | `requestMediaKeySystemAccess` yok | Yüksek | Lisans reddi |
| Yetenek ölçümü tamamlanamadı | Sayfa gezinmesi veya bağlam hatası | Düşük | EME ya da codec desteği hakkında sonuç |
| Widevine yapılandırması uygun değil | Codec uygun, Widevine EME `NotSupportedError` | Orta | CDM/politika/yapılandırma kesin ayrımı |
| Codec desteklenmiyor | `canPlayType`/MediaSource olumsuz | Yüksek | Widevine arızası |
| Lisans DNS hatası | Lisans isteğinde `ERR_NAME_NOT_RESOLVED` | Yüksek | Lisans reddi |
| Lisans timeout | Lisans isteğinde timeout | Yüksek | Lisans reddi |
| Lisans 401/403 | Lisans endpoint HTTP 401/403 | Orta | Tek başına geo/CDM nedeni |
| Lisans işlemi başarısız | Bilinen DNS/timeout kodu olmayan açık license failure | Orta | Diğer ağ/abonelik/cihaz/sunucu ayrımı |
| Coğrafi engel | HTTP 451 veya açık region mesajı | Yüksek | DRM bypass çözümü |
| Oturum gerekiyor | Playback belge/API HTTP 401 | Yüksek | Widevine sorunu |
| Erişim reddi | Playback belge/API HTTP 403 | Orta | Bot/oturum/bölge kesin ayrımı |
| İstek sınırlama | HTTP 429 | Yüksek | DRM sorunu |
| Servis hatası | İlgili HTTP 5xx | Yüksek | İstemci/CDM sorunu |
| DNS/ağ/timeout/TLS | Chromium ağ hata kodu | Yüksek | DRM veya geo nedeni |
| Medya ağ/çözme/kaynak | HTMLMediaElement hata kodu 2/3/4 | Yüksek | Tek başına DRM nedeni |
| GPU video sınırlı | `video_decode` etkin değil | Orta | Tek başına siyah ekran nedeni |
| Siyah video | Zaman ilerlerken sekiz saniye kare artışı yok | Orta | Codec/GPU/DRM kesin nedeni |
| Takılmış oynatıcı | Oynuyor durumunda 12 saniye ilerleme yok ve buffering kanıtı var | Orta | Geo/Widevine kesin nedeni |
| Site korumalı oynatma kodu | Örneğin `2312400`, ek kanıt yok | Düşük | CDM/lisans/geo kesin ayrımı |

HTTP 403 özellikle coğrafi engel sayılmaz. Aynı kod oturum, abonelik, bot
koruması, cihaz politikası veya bölge nedeniyle üretilebilir. Coğrafi sınıf için
HTTP 451 ya da açık bölge kısıtı metni gerekir.

## Genel toparlanma

Siyah video veya sonsuz yükleme belirtisinde otomatik yenileme döngüsü yapılmaz.
Kullanıcıya önce sayfayı yenilemesi, sorun sürerse yalnız ilgili sitenin
çerezlerini temizlemesi önerilir. VPN, extension, lisans taklidi veya DRM atlatma
mekanizması bu katmanın parçası değildir.

## Electron olmadan doğrulama

`tests/browser-playback-diagnostics.test.js` saf sınıflandırıcıyı, fake
`webRequest` oturumunu, olumlu/olumsuz fault corpusunu, token redaction'ını ve
zaman kontrollü siyah video/stall gözlemlerini çalıştırır. Gerçek CDM kurulumu,
korumalı servis lisansı ve Chromium paint davranışı Electron çalıştırılmadan
doğrulanamaz.

EME ölçümü sürerken ana sayfa değişirse eski sonuç yeni sayfaya taşınmaz. Castlabs
component hazırlığı geç hata verirse sonuç korumalı sayfanın tanı paneline yeniden
yayınlanır; ölçümün kendisi çalıştırılamadıysa bu, “EME API yok” sayılmaz.
