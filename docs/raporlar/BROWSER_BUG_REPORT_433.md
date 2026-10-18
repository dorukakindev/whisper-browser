# Rapor433 — APINEX ve videodan referans ses kütüphanesi

2026-10-15. Başlangıç HEAD:c458f2f3237c20372cc463781e5d6a3869783840.
Özellik kodu:be7f2d699373e89948a84354ab27d992fe074545.
Bitiş kodu:75cfe5e367f517ce1077b0f891132395f71d401e.

## APINEX

Kullanıcının verdiği sözleşme: `https://api.apinex.bond/v1`, OpenAI uyumlu `POST /chat/completions`, model `free/deepseek-v4-pro-0813`.

Sağlayıcı altyazı ve manga endpoint listelerine, model önerilere ve varsayılan model eşlemesine eklendi. Ayar doğrulayıcısı yeni endpoint'i kabul eder. Anahtar kapsamı `provider:apinex`; başka sağlayıcının anahtarıyla karışmaz. Genel dışa aktarım gizli profilleri içermez. Verilen gerçek anahtar kaynak/test/rapor/Git'e yazılmadı; gerçek kullanıcı profili veya varsayılan sağlayıcı değiştirilmedi. Canlı APINEX çağrısı yapılmadı. Modelin `free/` adı fiyat/erişilebilirlik veya görsel yeteneği garantisi değildir; manga/görsel desteği doğrulanmadı.

## Referans ses

Browser Altyazı menüsüne ve oynatıcının alt ⋯ menüsüne **Videodan referans ses al** eklendi. Mevcut SRT → Ses penceresindeki bölüm SRT seçmeden çalışır. Başlangıç/bitiş varsayılanı0:05–0:25;3–30sn sınırı; Hazırla, Durdur, önizleme, düzeltilebilir döküm, Bu sesi kullan, kayıt listesi ve klasörü açma bulunur.

Main süreç seçili browser sekmesinin generation/mediaId bilgisini doğrular; yalnız kanonik YouTube video URL'sini veya önceden yetkilendirilmiş yerel medyayı kabul eder. YouTube için yt-dlp yalnız medya adresini çözer; FFmpeg seçili başlangıç/süreyle24kHz mono WAV çıkarır. Bütün videonun Whisper dökümü yapılmaz. Gerçek ağ transferinin miktarı sunucunun seek/range desteğine bağlıdır; her sitenin sadece20sn ağ verisi göndereceği garanti edilmez.

Whisper small, CUDA varsa float16 GPU, yoksa int8 CPU ile yalnız bu WAV'ın eşleşen dökümünü hazırlar. VAD açıktır; boş konuşma ve eksik aralık reddedilir. Kaynak sesin müziksiz ve tek konuşmacılı olması önerilir. Kayıt ile referans dökümünün birlikte değiştirilmesi, eski anlatıcı dökümünün yeni sesle yanlış eşleştirilmesini önler. Kullanıcı dökümü kontrol edip düzeltebilir. Bu işlem model eğitimi değildir; VoxCPM2'nin referans dosyaları değiştirilir.

Dosyalar `app.getPath('userData')/Referans sesler/<UUID>/` altında:

- reference.wav: seçilen ses;
- reference.txt: eşleşen/düzeltilmiş UTF-8 döküm;
- reference.json: kütüphane adı ve tarih;
- events.ndjson/job.json: süre, durum, sonuç kaydı.

**Bu sesi kullan** yalnız başarılı kütüphane kaydını seçer; WAV/TXT birlikte `dub-settings.json` referansı olur. Kaynak video ve önceki manuel referans dosyaları değiştirilmez. Liste en fazla100 başarılı kaydı gösterir. Başarısız/iptal edilen işler hazır listeye girmez; kısmi dosyalar kendi klasöründe kalabilir. Windows gerçek yol normalleştirilir; UUID dışı kimlikler ve alt symlink yolları reddedilir.

Referans hazırlama mevcut dublaj iş kilidi/iptal altyapısını kullanır. Hazırlık boyunca diğer model/dublaj işleri başlamaz; Durdur süreç ağacını kapatır; kapanış gelmeden iş serbest bırakılmaz. Kullanma işlemi üretim sırasında engellenir. Python/FFmpeg süre sınırları mevcut süreç kapatma mekanizmasıyla uygulanır. Arayüzde Türkçe/İngilizce eşler vardır; kayıt adı ve döküm kullanıcı verisi olarak çevrilmez.

## Doğrulama

- APINEX: preset/model/datalist, doğru endpoint, ayar roundtrip, anahtar kapsamı/host ayrımı ve gizli dışa aktarım testi.
- voice-reference: yetkisiz istek, aralık/kimlik, çift iş, kütüphane, döküm düzeltme, üretim sırasında değiştirme reddi, onaylı iptal ve başarısızlık.
- voice-reference-ui:5–25sn isteği, GPU durumu, Hazır/Bu sesi kullan, değişen döküm ve geç durumlarla bozulmayan Durduruluyor/Durduruldu.
- Python3/3: gerçek FFmpeg ile Türkçe dosya yollarında30sn ton dosyasının yalnız5–25sn/20sn orta440Hz bölümü; aralık sınırları; CPU/CUDA ve VAD sözleşmesi. CI ortamında WHISPER_TEST_FFMPEG/PATH, yerelde bundled FFmpeg bulunur.
- Gerçek Windows backend: önceki özel yerel sesin5–25sn bölümü20.0sn WAV oldu; önbellekteki Whisper small ile `transcribe_cuda` ve `ready` görüldü;237 karakter döküm oluştu. Bu, yerel GPU hattını kanıtlar; canlı YouTube erişimi veya her klonlama örneğinin kalitesi değildir. Ses/döküm özel tmp altında kaldı.
- Tam Electron, ayrı profil: APINEX seçilince model tam adı dolduruldu. Browser referans seçeneği açıldı; hazırlama dönüşü kontrollü fixture, gerçek WAV önizlemesi ve gerçek kütüphane/use IPC ile kayıtlı WAV/TXT config'e yazıldı. TR/EN ekranları incelendi; özel kanıt `tmp/apinex-reference-1792093695851/`.
- Hedefli13 Node dosyası ve Python3 test geçti; `npm run test:electron-bridge`, preload sandbox, DOM ratchet, JS syntax/Python compile/diff temiz. İlk yerelleştirme ve ratchet sapmaları düzeltildi; eşik/izin envanteri genişletilmedi.
- Windows paket zorunlu dosya listesine yeni backend eklendi; package-integrity9/9 geçti. Bitiş kodu paket bütünlük commit'ini de içerir.

## Sınırlar ve CI

[Son ürün kodu CI koşusu](https://github.com/dorukakindev/whisper-browser/actions/runs/38798585840): Ubuntu ve Windows genel Run test suite adımında failure. Yerel hedefli test başarısı uzak CI başarısı yerine sunulmaz. Günlük okuma403/401 ile engellendi; erişilebilir tarayıcıda GitHub oturumu yoktu. Hangi testin başarısız olduğu doğrulanamadı. Kullanıcı durum ve gerekli hata metni talebi üzerine açıkça **CI incelemesini şimdilik bırak** dedi; inceleme durduruldu. CI hatasının bu değişiklikten bağımsız olduğu iddia edilmez; test/kapı gevşetilmedi. Önceki e100 koşusu yeni push ile cancelled olduğundan başarı kanıtı değildir.

Canlı APINEX, canlı YouTube indirmesi (giriş/yaş/bölge/DRM), her sesin klon kalitesi ve yeni sesle tam SRT üretimi denenmedi. Referans almak tarayıcının oturum çerezlerini dışarı çıkarmaz; backend'in erişemediği videolarda yetkili yerel video kullanılabilir. Mikrofon veya işletim sistemi ses kaydı kullanılmaz; seçili videonun ses aralığı çıkarılır. Yeni model/bağımlılık kurulmadı; Whisper small bu makinede önbellekteydi, diğer kurulumlarda ilk kullanım indirebilir. start.bat/install.bat değişmedi; yeni normal start.bat açılışı denenmedi.
