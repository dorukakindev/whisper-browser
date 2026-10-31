# Kritik kaynak seçimi ve ses bütünlüğü

Temel: master `351c1674` / PR735. Sayı hedefi kaldırılmıştır; eski 200 satır tamamlanma kotası değildir.

## Doğrulanan sorunlar ve onarımlar

1. **Bekleyen ilk mute sonucu:** Kontrol döngüsü hedefi değiştirirken ilk mute henüz bekliyorsa kaldırma gerçek uygulanmış komutu unutabiliyordu. İlk gönderilen komutun değeri ayrı tutulur; browser ve yerel oynatıcı kaldırma/yenisiyle değiştirme yolları sınanır.
2. **Özgün ses sahipliği:** Browser mute biti WebContents üzerinde gezinmeler boyunca kalır. Dublaj artık kaynak ve oturuma bağlı sahiplik taşır. Eski komut yeni videoyu sessize alamaz; sahibi kalan eski mute gezinmeden sonra bırakılabilir. Elle sessize alma/açma sahipliği iptal eder, aynı değerin yeniden seçimi de insan kararıdır. Yeni dublaj eski işlemin mute değerini kullanıcının tercihi sanmaz. Başlangıçta sessiz sekme sessiz kalır. Yeni IPC kanalı yoktur.
3. **İlk tam sesin kaybı:** İsteğe bağlı süre kısaltması ikinci motor isteğinde takılır/OOM olur/iptal edilirse ilk tam ses normal önbellek yazımından önce kayboluyordu. Tam ilk kayıt süre düzenlemesinden önce korunur. Kesilen grup `review`, `duration_fit_interrupted` ve özgün tam metinle kalır; doğrulanmış gibi sunulmaz. Gerçek hata ve iptal yayılır. Son grup yeniden başlatması da başarısızsa gerçek ilk kayıt korunur.
4. **Eski sağlayıcı kartı:** Sonradan elle seçilen model/sağlayıcı eski onayla ezilebiliyordu. Hem servis kontrolü hem gerçek renderer değişikliği anı güncel seçim kimliğine bağlanır. Kimlik için anahtar okunmaz/hashlenmez; gizli kontrolün düzenleme olayı yalnız revizyonu değiştirir.
5. **Eski referans kartı:** Kayıtlı referans, güncel varsayılan veya bekleyen seçim/döküm taslağı değişince eski kart reddedilir. Gerçek dosya yazımında süreç içi anahtarlı opak token aynı varsayılanı ve hedef ses/metni bağlar. Token modele verilmez. Yenileme kendiliğinden uygulamaz; yeni ayrı onay gerektirir. Normal elle referans seçimi token zorunluluğuna sokulmadı.

## Kanıt kapsamı

- `tests/assistant-selection-stale-critical.test.js`: 16 senaryo; gerçek renderer modülleri ve geçici dosyalı gerçek native referans servisi. Sağlayıcı/referans eski kart, pending taslak, kaldırılmış hedef, transport arası değişim, yenileme ve ayrı uygulama; native değişmiş ses/metin/varsayılan ret ve normal elle seçim.
- `tests/browser-dub-mute-ownership.test.js`: gerçek main handler üzerinde 9 davranış; kaynak değişimi, elle seçim, eski/yeni oturum, önceden sessiz sekme ve başka WebContents.
- `tests/browser-dub-audio.test.js`: bekleyen ilk mute ve sync-map salımıyla browser/player kaldırma ve değiştirme regresyonu.
- `tests/test_natural_dub_generation.py` ve `tests/test_dub_generation_quality.py`: üretim fonksiyonu ve dosyalı metin düzenleme protokolü üzerinde stall/OOM/iptal ve son grubun eksiksiz korunması. Kontrollü motor dalga biçimi beklenen tam sesle örnek bazında karşılaştırılır. Önceki hatalı sürüm geçici kaynak kopyasında tekrar üretildi.
- `tests/electron-browser-dub-mute.smoke.js`: gerçek Windows Electron/main/preload/controller/IPC, iki farklı yerel HTTP portunda cross-origin iframe, gerçek H264/AAC ve WAV decoder. Kaldırma, manuel mute/unmute ve seek/pause/resume, gezinmede generation 1→2; çıkış 0. `native-mute-acceptance.json` gerçek receipt, `native-iframe.png` render kanıtıdır. Kişisel açık uygulama kapatılmadı.
- ASR/ritim/normalizasyon bitiş yolları ayrıca okundu: özgün WAV ayrı geçicide korunuyor; placeholder `failed` kalıyor, bütün gruplar başarısızsa servis başarılı sonuç kabul etmiyor. Bu doğru davranış yeni ürün düzeltmesi diye sayılmadı.

## Sınırlar

Bu paket canlı DeepInfra/YouTube, DRM, GPU veya insan kulağıyla doğal dublaj kalitesi kanıtı değildir. Ses dalga biçimleri sentetiktir. Referans koruması `set_voice_reference` içindir; yerel dosya seçme ve yeni referans hazırlama dahil bütün uygulama araçlarının tamamı korunmuş diye sunulmaz. Referans kataloğundaki ilgisiz değişiklikler de kartı ihtiyatlı olarak eskitebilir. Geniş çeviri anlam kabulü ve kalan iş yaşamı/UI akışları bu paketle tamamlanmış sayılmadı.

Tam yerel paket ve sözdizimi sonuçları `validation.json` içinde kaydedilir. Uzun uzak CI beklenmez.

## Son doğrulama

Tam koşu 724 Node + 171 Python dosyası çalıştırdı; kaynaklar koşu boyunca sabitti. Yalnız yeni referans testindeki sabit 10 ms bekleme nedeniyle determinizm kuralı kırmızıydı. Eşik değiştirilmedi: test, referans seçeneğinin gerçek DOM eklenmesini bekleyecek şekilde düzeltildi. Ardından referans ve ratchet hedefli koşusu 17/17, exit 0. Ürün kodu bu son düzeltmede değişmedi; tüm paket tekrar koşulmadı. Native kabul exit 0; 19 değişen JS/Python dosyasında syntax/UTF-8 kontrolü geçti.

Çeviri için mevcut üretim yolları ayrıca kontrol edildi: kötü sayı düzenlemesi ve transport hatasında tam ilk geçiş korunuyor, kaynak yankısı hazır sayılmıyor, eksik cümle sözleşmesi atomik reddediliyor, kısmi işin tamamlanan/başarısız indeksleri ayrı kalıyor. İlgili mevcut backend testleri tam koşuda geçti. Genel çeviri kalitesi ve duygulu insan dublajı bunlarla kanıtlanmış değildir.
