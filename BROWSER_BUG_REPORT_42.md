# Browser Bug Report 42 — CEA planı bulunduğu halde arayüzde altyazı yok görünmesi

Tarih: 2026-09-16
Repo: `https://github.com/dorukakindev/whisper-browser`
Başlangıç kodu: `35be4e0c4ff8d497f671b25fdf0351f2897f62cf`

## Sonuç

Bir gerçek ürün hatası doğrulandı ve düzeltildi.

| Kimlik | Önem | Durum | Özet |
| --- | --- | --- | --- |
| B42-01 | P2 | Düzeltildi | HLS/CEA tam yakalama planı main süreçte hazırlandığı halde yalnız tek IPC olayıyla renderer'a gönderiliyordu. Olay gezinme/acquisition kapısında elenirse veya sekme durumu yeniden kurulursa plan kayboluyor, arayüz yanlış biçimde “altyazı izi bulunamadı” diyordu. |

## Kullanıcıda gözlenen belirti

Great Courses oynatıcısında `1-CC1` seçili ve İngilizce altyazı video üzerinde görünürken Whisper Local:

- “Bu sayfada altyazı izi bulunamadı.”
- “Henüz altyazı bulunamadı.”
- “Canlı Whisper”

mesajlarını gösteriyor ve `Tüm altyazıyı getir` eylemini sunmuyordu.

Bu, altyazı kaynağının yokluğu değil uygulama durumunun renderer'a taşınamamasıydı.

## Gerçek site kanıtı

Kullanıcının 2026-09-16 tarihli tanı çıktısı:

- master HLS manifesti işlendi;
- `CC1` gömülü CEA izi bulundu;
- 906 video segmentinden oluşan tam yakalama planı kuruldu;
- en az iki gerçek CMAF video parçasından sırasıyla 5 ve 4 cue çözüldü;
- alt video ve ses manifestlerinin “kullanılabilir ayrı altyazı izi yok” diye elenmesi beklenen davranıştı.

Dolayısıyla manifest keşfi, HLS tür tespiti, CEA bildirimi ve gerçek CEA decode zinciri çalışıyordu.

## Kök neden

Ulaşılabilir olay yolu:

1. `processBrowserManifestResponse()` master manifestten gömülü CEA izini bulur.
2. `resolveBrowserHlsCeaFullPlan()` tam video segment planını kurar.
3. `sendBrowserHlsCeaPlanReady()` yalnız `cea-capture-progress` IPC olayını gönderirdi.
4. Plan `createBrowserTabRecord()` içindeki sekme durumuna yazılmıyor ve `browserTabSnapshot()` içinde taşınmıyordu.
5. Renderer olayı gezinme/acquisition kuşağı açılmadan geldiği için reddederse veya daha sonra sekme snapshot'ından yeniden kurulursa `browserCeaCapture` tekrar `null` olurdu.
6. `browserSubtitleHealth()` CEA planını göremediği için genel “altyazı yok” durumuna düşerdi.

Testlerin bunu kaçırma nedeni: önceki Electron UI smoke CEA durumunu doğrudan hem `player.browserCeaCapture` hem sekme nesnesine yazıyordu; gerçek üretimdeki tek olayın kaybolması ve snapshot'tan geri kurma yolu sınanmıyordu.

## Düzeltme

### Main süreç

- Sekme çalışma durumuna `ceaCapture` eklendi.
- `browserTabSnapshot()` CEA durumunu ve iz tanımlarını kopyalayarak taşır.
- `normalizeBrowserCeaCaptureState()` sayısal sınırları ve iz alanlarını tek biçime getirir.
- `publishBrowserHlsCeaCaptureState()` her plan/ilerleme durumunu önce sekmeye yazar, sonra IPC olayını gönderir.
- `ready`, `complete`, `partial`, `error` ve `cancelled` gibi kritik durumlarda global `tabs-changed` snapshot'ı ikinci güvenilir teslim kanalıdır.
- Gerçek gezinme/yakalama sıfırlamasında eski CEA durumu temizlenir; başka videoya eski plan taşınmaz.

### Renderer

- `newBrowserTabState()` CEA durumunu snapshot'tan kurar.
- `syncBrowserTabs()` snapshot'ta CEA alanı varsa mevcut sekme durumunu güvenli biçimde günceller.
- Canlı olay ve snapshot aynı normalleştiriciyi kullanır.
- Etkin sekme çalışma alanı geri yüklenince `player.browserCeaCapture` yeniden oluşur ve üst sağlık satırı `Tüm altyazıyı getir` eylemini gösterebilir.

## Ret gerekçeleri

| Aday açıklama | Karar | Gerekçe |
| --- | --- | --- |
| Manifest hiç yakalanmadı | Ret | Tanıda master `.m3u8` işlendi ve 906 segment planlandı. |
| Kaynakta CEA yok | Ret | `CC1` bulundu; gerçek CMAF segmentlerinden 5 ve 4 cue çözüldü. |
| DASH içi CEA desteği eksik | Bu vaka için ret | Kaynak HLS master manifestidir; DASH yolu bu belirtiyi açıklamaz. |
| Cloudflare/enstrümantasyon beklemede kaldı | Ret | Manifest ve segment işleme olayları enstrümantasyonun çalıştığını kanıtlıyor. |
| Yakalama kullanıcı tarafından kapalı | Ret | Arayüzde “Yakalama açık” görünüyordu ve tanı olayları işlendi. |
| Canlı Whisper yeterli çözüm | Ret | Site gerçek zaman kodlu CC1 sağlıyor; ses üzerinden yeniden transkripsiyon daha düşük doğruluk ve gereksiz gecikme üretir. |

## Doğrulama dökümü

### Hedefli saf testler

- `node tests/browser-cea-full-capture.test.js` — geçti.
  - 906 segmentlik `ready` snapshot'ı normalleştirildi.
  - süre yüzdesi üst sınırı doğrulandı.
  - `CC1 / cea-608` iz bilgisi korundu.
  - main snapshot, ikinci teslim ve gezinmede temizleme sözleşmeleri denetlendi.
- `node tests/browser-subtitle-health.test.js` — geçti.
  - `ready` durumu `capture-ready / capture-full` üretir.

### İzole gerçek Electron UI kabulü

- `electron tests/electron-browser-cea-full-ui.smoke.js --disable-gpu` — geçti.
- Test artık CEA durumunu doğrudan player'a yazmıyor:
  1. `syncBrowserTabs()` ile yalnız sekme snapshot'ı veriliyor;
  2. `restoreActiveBrowserTabWorkspace()` çağrılıyor;
  3. `Tüm altyazıyı getir` düğmesinin görünür, etkin ve CEA izine bağlı olduğu doğrulanıyor.
- Geniş görünüm: CTA ve ilerleme durumu görünür, yatay taşma yok.
- Dar görünüm: CTA ve durum görünür, panel viewport dışına taşmıyor.

### Tam paket

- `npm test` — exit 0, son satır `Tüm testler geçti`.
- Python backend: 180/180 geçti.
- `npm run test:electron-bridge` — exit 0.
- `node --check src/main.js` — geçti.
- `node --check src/preload.js` — geçti.
- `node --check src/renderer/renderer.js` — geçti.
- `git diff --check` — geçti; yalnız Windows LF→CRLF bilgilendirmesi var.

## Açık sınır ve gerçek site kabulü

Windows Computer Use yardımcısı bu oturumda `apply deny-read ACLs` hatasıyla üç kez açılamadı. Giriş yapılmış gerçek kullanıcı oturumunu yerel CDP portuna açma denemesi de, oturum içeriğini yerel süreçlere açabileceği için güvenlik denetimi tarafından reddedildi. Bu nedenle düzeltme sonrası Great Courses'ta otomatik tıklamalı kabul koşusu yapılmadı.

Gerçek site kapanış koşulu:

1. Güncel uygulamayı yeniden başlat.
2. Great Courses dersini açıp `1-CC1` seç.
3. Yakalama açıkken sayfayı yenile ve videoyu kısa süre oynat.
4. Üst satırda `Tüm altyazıyı getir` eyleminin görünmesini doğrula.
5. Eyleme basınca 906 segmentlik yakalama ilerlemesinin başlamasını ve tamamlanan kaynağın GİRDİ klasörüne yazılmasını doğrula.

Bu manuel gerçek-site adımı tamamlanmadan “Great Courses uçtan uca kesin kapandı” iddiası yapılmamalıdır.

## Çalışma ağacı disiplini

`tests/electron-browser-extras.smoke.js` dosyası çalışma başında temizken bu çalışma sırasında başka bir akış tarafından değişti. Değişiklik bu bulguyla ilgili değildir ve bu düzeltmenin commit'ine alınmayacaktır.
