# Korumalı servislerde oynatma (Widevine / VMP)

YouTube ve yerel dosyalar uygulamanın mevcut oynatıcısıyla çalışır. Netflix,
Hulu, Max ve Discovery+ gibi servislerde reklamın oynayıp asıl içeriğin
`2312400` benzeri bir kodla durması genellikle altyazı yakalama hatası değildir:
ana içerik şifreli bir lisans ister.

## Uygulamanın yaptığı

- Castlabs ECS (`electron-releases` içindeki `wvcus` sürümü) kullanılır.
- Widevine CDM ilk açılışta Component Updater ile hazırlanır.
- Korumalı alan adlarında gezinme, CDM hazır olana kadar en fazla 30 saniye
  bekler; bağlantı yoksa uygulama kilitlenmez ve teşhis paneli durumu gösterir.
- Site oturumu `persist:whisper-browser` bölümünde saklanır; kullanıcı adı veya
  çerezler uygulama dışına kopyalanmaz.

## Üretim imzası gereksinimi

Castlabs'ın indirilen ECS ikilileri geliştirme VMP imzasıyla gelir. Bu, yalnızca
geliştirme/UAT lisans sunucularında yeterlidir. Gerçek yayın servisleri üretim
VMP imzası ve kendi lisans politikalarını isteyebilir; uygulama koduyla bu
kontrol kaldırılamaz.

Üretim paketini imzalamak için Castlabs EVS hesabı gerekir. Hesap doğrulandıktan
sonra proje kökünde (paket klasörünü imzalar, tek `electron.exe` dosyasını değil):

En kolay yol: proje klasöründeki `drm-kur.bat` dosyasına çift tıklayın. Menüden
`1` (yeni hesap), `2` (mevcut hesap) veya `3` (hesap zaten hazır) seçin. E-posta,
parola ve doğrulama kodunu yalnızca açılan terminale girin.

```bat
backend\venv\Scripts\python.exe -m pip install --upgrade castlabs-evs
backend\venv\Scripts\python.exe -m castlabs_evs.vmp sign-pkg node_modules\electron\dist
backend\venv\Scripts\python.exe -m castlabs_evs.vmp verify-pkg node_modules\electron\dist
```

İmzalama anahtarını veya hesap bilgilerini kaynak koda, `settings.json` dosyasına
ya da komut satırı geçmişine koymayın. İmzalama sonrasında uygulamayı yeniden
başlatıp korumalı serviste tekrar deneyin. Yine hata varsa servis/ülke/cihaz ve
HDMI/HDCP politikası da ayrıca kontrol edilmelidir.
