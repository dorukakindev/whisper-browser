# BROWSER_BUG_REPORT_107 — SmartTube TV paketi kabul denetimi

Tarih: 2026-09-22

## İncelenen paket

`smarttube-tv-2026-09-22` paketi önceki denetim paketinin `dcbdb95` ucuna eklenen üç
Git commit'inden oluşuyor. Bundle doğrulaması geçti; paket ucu
`4961b98d7ed274bc91e72dca8b47a159eaad90ba`.

## Güvenlik ve mimari sonucu

- SmartTube Android uygulama kodu Electron'a gömülmüyor. Uygulamanın kendi 10-foot görünümü
  ile YouTube'un resmi `youtube.com/tv` web arayüzü birbirinden ayrılmış.
- TV penceresi `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`; preload
  köprüsü ve Node yetkisi yok.
- TV oturumu `persist:youtube-tv` bölümünde kalıyor; uygulamanın normal tarayıcı ve kendi
  YouTube OAuth oturumlarıyla karışmıyor.
- Üst düzey gezinme HTTPS YouTube/Google hesap ve onay alanlarıyla sınırlı. Pencere açma
  istekleri reddedilip mevcut dış-bağlantı politikasına veriliyor.
- Kamera, mikrofon, konum ve bildirim reddediliyor; yalnız tam ekran izni açık. İndirme
  olayları engelleniyor.
- Yeni beş IPC handler'ının tamamı `authorizedBrowserSender` kontrolünden geçiyor.
- Başka bir uygulamanın OAuth istemci kimliği, istemci sırrı veya token'ı eklenmemiş.
- “TV oturumunu kapat” yalnız TV bölümünün deposunu temizliyor.

Kaynak ve davranış incelemesinde ek bir doğrulanmış güvenlik, veri kaybı veya yaşam döngüsü
hatası bulunmadı. Paket değişmeden kabul edildi.

## Doğrulama

- `tests/youtube-tv-mode.test.js`: 7/7
- `tests/adversarial-ipc.test.js`: 207 kanal × 3 yetkisiz gönderici; 15/15 senaryo
- `tests/report70-youtube-oauth.test.js`: 25/25
- `node --check`: `main.js`, `preload.js`, `renderer.js`, `smarttube-tv.js`,
  `youtube-tv-mode.js` temiz
- `git diff --check`: temiz
- `npm run test:electron-bridge`: gerçek Electron'da geçti
- `npm run audit:ui -- --strict`: 52 yüzey, TR/EN, açık/koyu ve 1400/1100/900 px;
  toplam kontrast hatası 0

## Açık sınırlar

- Gerçek YouTube TV koduyla hesap girişi ve oturumun yeniden başlatma sonrası korunması bu
  denetimde kullanıcı hesabı kullanılmadan test edilmedi.
- YouTube masaüstü Electron istemcilerini veya seçilen TV kimliklerini ileride reddedebilir.
  Bu durumda uygulamanın kendi SmartTube ızgarası çalışmayı sürdürür fakat resmi TV penceresi
  başka kimlik veya sonraki uyumluluk güncellemesi isteyebilir.
- Gerçek kumanda donanımıyla uzun süreli gezinme yapılmadı; klavye ve sözleşme yolları testli.
