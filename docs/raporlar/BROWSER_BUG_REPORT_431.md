# Rapor431 — Oynatıcı YouTube hesabı, tema ve ses seçenekleri

2026-10-15, gerçek Windows çalışma ağacı. Başlangıç: f4a868f099784ffb1f9226e926c4850a74a979f4. Hesap/tema kodu: 8d2f3429c5e8b48f468e08e77853a16b986ebc7a. Oynatıcı ses kodu: 910a5b66c5e42abf2198aa8ed33143bbf7a77d6c.

## Doğrulananlar ve düzeltmeler

1. **YouTube hesap kaydı sessizce başarısız oluyordu.** `persistYoutubeSession()` modüldeki `persistableAccounts()` fonksiyonunu çağırıyor, ancak fonksiyon dışa aktarılmadığı için TypeError oluşuyordu; boş catch bunu gizliyordu. Export eklendi. Gerçek main fonksiyonunun kontrollü store ile testi artık kayda ulaşıyor. Refresh grant ve aktif hesap geri yükleniyor; kısa ömürlü access token ve ephemeral hesap kalıcı projeksiyona girmiyor. Yeni şema yok.
2. **Kullanıcının istediği uygulama hesabı girişi, ayrı YouTube TV penceresiyle karışıyordu.** Kullanıcı oynatıcının içindeki YouTube bölümünde hesabını kullanmak istediğini netleştirdi. Üst çubuğa Hesaplar eklendi; var olan cihaz kodu/QR, hesap listesi, seçim ve çıkış akışına bağlandı. Modal başlığı tüm görünümlerde görünür. Özel istemci yoksa Google Cloud/tarayıcı istemcisi açıklamaları gizleniyor; hazır kod doğrudan gösteriliyor. Ayrı TV penceresi kapalı details altında ikincil seçenek; onun çerez oturumu uygulama hesap listesiyle birleştirilmiyor.
3. **Açık temada video üzerindeki koyu durum pill'leri okunmuyordu.** `sub-hidden-hint` ve `learning-badge` koyu video zemini için sabit beyaz semantik token kullanıyor. Gerçek Electron kontrast probunda bu iki sorun düzeldi. Browser yer imi silme/klasör düğmelerindeki sabit koyu renkler tema token'larına taşındı.
4. **Oynatıcının alt menüsünde ses ekleme/üretme yoktu; mevcut dublaj denetleyicisi browser ile sınırlıydı.** Alt ⋯ menüsüne Ses ekle ve Altyazıdan ses üret eklendi. Yerel video için aynı dosya seçici, üretim penceresi, Sesi kullan, dublaj şeridi, ses düzeyi/kayma/kaldırma kullanılıyor. Denetleyici yalnız browser veya player bağlamına ve aynı medya anahtarına bağlanıyor; yeni videoya eski üretim otomatik taşınmıyor. Yerel video sesi kapatılıyor; play/pause/seek/hız olayları dublaja aktarılıyor; kaldırınca özgün ses/hız geri geliyor. Zaman haritası varsa konuşmaya göre video yavaşlatma mevcut motorla çalışıyor. Şu anki zaman ve yerel arka plan kaynağı üretim isteğine aktarılıyor. SRT seçimi ve mevcut VoxCPM2 ayarları korunuyor; bu çalışmada yeni model üretimi yapılmadı.

## Kanıtlar

- `youtube-accounts`11/11, `youtube-auth-flow`6/6: gerçek fonksiyon/handler gövdeleri, kontrollü grant ve kayıt/geri yükleme. Gerçek kullanıcı/token kullanılmadı.
- `youtube-tv-mode`7, `tv-window-deadzone`4, `report70-youtube-oauth`27, `ui-locale`14, `design-system`, `settings-ui-persist-roundtrip`5, DOM ratchet2 geçti.
- `player-dub-ui`, `dub-generator-ui`, `browser-dub-audio` geçti: yerel bağlama, sessize alma, oynatma/duraklatma/sarma, stale çıktı reddi, aralık ve iptal. Testler eşikleri gevşetmez.
- Gerçek Google `device_code --client-id tv` isteği başarılı: cihaz ve kullanıcı kodu mevcut, doğrulama adresi `https://www.google.com/device`,1800sn. Kodlar/kimlik bilgileri kaydedilmedi veya yayımlanmadı. Google hesabıyla onay/poll tamamlanmadı; kişisel abonelik/playlist erişimi canlı kanıtlanmış sayılmaz.
- Ayrı profilli tam Windows Electron: Hesaplar düğmesine fareyle basıldı; modal, ortak başlık, kod, QR ve kapalı TV details doğrulandı. Açık/koyu görüntüler incelendi. Animasyon ortasında alınan ilk görüntüler yerine animasyonsuz son yakalama kullanıldı.
- Yapay MP4/WAV ile gerçek Electron medya denemesi: video2.320sn → dublaj4.661sn, video hızı0.5, özgün ses muted=true; pause dublajı durdurdu. Kaldırınca muted=false/rate=1. Alt menü ve üretim penceresi görüntüleri incelendi. İzole testte mode adının `player` olduğu ayrıca saptanıp uyarlama bu kanonik adla yapıldı.
- JS sözdizimi ve `git diff --check` temiz. Özel fixture/profil/ekranlar `tmp/` altında, Git dışında.

## Sınırlar

Gerçek kişisel Google onayı, hesap beslemeleri, bütün YouTube videoları/DRM, farklı DPI ve yeni VoxCPM2 üretimi denenmedi. Ayrı TV penceresi kullanıcının netleştirdiği kapsamın dışında; o pencerenin canlı girişi doğrulanmadı. Tema smoke geçti; tam uygulama probunda açık temada oynatıcı arkasındaki ana sayfa `glossaryImport` kontrolünde kalan2.25:1 kaydı var; görünür browser/oynatıcı düzeltmelerinin kapsamına alınmadı. Browser yer imi tokenları kaynak testinde doğrulandı; panelin bütün durumları görsel denenmedi. start.bat/install.bat yeni açılışı, tam npm test ve CI çalıştırılmadı/beklenmedi (kullanıcının hedefli test ve CI beklememe talimatı). Başlatma betikleri, Python/CUDA ve bağımlılıklar değişmedi.

Google resmî başvuruları: [TV koduyla giriş](https://support.google.com/youtube/answer/3015415), [OAuth cihaz akışı](https://developers.google.com/youtube/v3/guides/auth/devices), [gömülü webview OAuth kısıtları](https://developers.googleblog.com/upcoming-security-changes-to-googles-oauth-20-authorization-endpoint-in-embedded-webviews/). Uygulama hesabı cihaz kodu ve ayrı TV çerez oturumu farklı yollardır; birindeki giriş diğerinin kanıtı değildir.
