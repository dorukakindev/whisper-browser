# Rapor760 — Gerçek native yeniden yükleme ile dublaj sahipliği

Yeni ürün bugı bulunmadı; R756 onarımı yeniden keşif sayılmaz. Önceki kanıt generation değerini testte değiştiriyordu. Bu tur native tarayıcının gerçek doküman yeniden yüklemesi, gerçek media decoder ve IPC olaylarıyla daha güçlü entegrasyon kanıtı ekler.

## Tekrar kullanılabilir test

`tests/electron-browser-reload760.smoke.js` Windows Electron ile çalıştırılır. Test mevcut FFmpeg aracını bulur; kendi geçici dizininde12sn MP4 ve ayrı WAV sinüs örneklerini üretir. Eski tmp/pipeline700 girdilerine veya kişisel ses dosyasına bağımlı değildir. Ayrı uygulama profili kullanır, kişisel pencere/sekme/ayarlar değişmez. Tarayıcı partition'ının https protokolü yalnız bu testte yerel YouTube biçimli video sayfası ve byte-range destekli MP4 yanıtı sunar. Gerçek YouTube ağına gidilmez. SRT seçici, plan ve latest cevapları geciktirilmiş kontrollü IPC yanıtlarıdır; BrowserDubAudioUI/context/generation gerçek uygulamadan gelir ve testte taklit edilmez.

## [Nihai kanıt](evidence760/native-reload.json)

- Uygulamanın gerçek zaman aralığı kutusunda2–6sn seçildi; dört yeniden yüklemede korundu.
- Aynı tabId, kaynak URL ve video kimliğinde gerçek nesil1→2→3→4→5; eski seçici, plan hata metni ve hazır çıktı yanıtı reddedildi.
- Gerçek yerel WAV dosya seçimi/grant/decode ve native sayfa MP4 decode geçti. Kaynak duraklatılarak seek3sn komutu gönderildi; video hâlâ dururken3sn konumu doğrulandı. Doğal oynatma ilerleyişi seek başarısı sayılmaz.
- Dublaj oynarken audio3.885328/video3.898949sn; bu tek örnek yaklaşık14ms farktır, bütün oynatma/altyapı için garanti değildir. Yeniden yükleme eski sesi durdurdu ve sekmenin özgün mute değeri false döndü.
- YouTube preload reklam koruması active:true kaldı. Uzak filtre listesi indirmesi testte kapalıdır; reklam ağı, canlı YouTube anti-adblock veya tüm filtre listelerinin etkinliği doğrulanmadı.

Final native exit0; 5mevcut R756Node kontrolüPASS; syntax/diffPASS. İlk geliştirme koşuları ignored örnek dosyasını kullanıyordu; final kendi sentetik girdisini üretir. İlk seek gözlemi ilerleyen videonun zamanı ile karışabildiğinden final test duraklatılmış seek ve HTTP byte-range yanıtı kullanır. Bu test düzeneği sertleştirmesidir, ürün bugı sayılmaz. Mevcut11before-quit listener uyarısı açık. Tam paket/uzunCI beklenmedi.

## Değişen dosya ve sınırlar

Yalnız test kaynak dosyası eklendi; ürün runtime/ayar/IPC/schema/bağımlılık değişmedi. Başlangıç ürünmaster9c0a9f6827cff2d512d7487990dd25c541a4b55f; test bitişie93492dc9111eb54180dfd3259598159bc04bfe6. GPU/TTS/Whisper/gerçek sağlayıcı/insan dinleme ve kişisel start.bat çalıştırılmadı. Görsel tasarım değişmediği için yeni tasarım kabulü iddia edilmez.

[Electron resmî webContents navigasyon olayları](https://www.electronjs.org/docs/latest/api/web-contents#navigation-events) dokümanı incelendi; uygulamanın gerçek reload komutu ve generation olayları kullanıldı. Dış kod/bağımlılık alınmadı. P003/P006/P010/P052/P059 için bu native yerel-site kapsamı mevcut-doğrulandı; canlı site ve kalan90hedef açık. Müzik işi eklenmedi. Normal test/belge commitleri ve PR/master teslimi, kişisel dosyaları koruyan ana kopya güncellemesi uygulanır.
