# Rapor802 — Gerçek 140 saniyelik konuşma, DeepSeek ve VoxCPM2

Başlangıç `ca19c6b8a72c8a64eb554a57993fdefb62f07411`; bitiş ürün kodu `4a54cac7607ae3f40f248cae7b445b4979abde16`. Dal `codex/dub-live802`. Kullanıcının altı onaylı hedefi birlikte ele alındı; gerçek dinleme/doğallık tercihi ve tek komutla tüm GUI zinciri tamamlandı diye sunulmuyor.

## Gerçek kaynak ve ilk başarısızlık

Herkese açık [Ken Robinson konuşmasının](https://www.youtube.com/watch?v=iG9CE55wbtY) 60–200 saniyesi indirildi. İlk eski video URL'si kullanılamadı; ikinci kaynak yalnız ayrı video/ses formatları sundu. Format listesi görülüp `bv[height<=360]+ba` kullanıldı. Yerel klibin **2–140 saniyesi** seçildi; bu özgün videoda 62–200 saniyedir. Anonim indirme yapıldı, kişisel oturum/cookie kullanılmadı. Ham video/metin/ses ve sağlayıcı yanıtları Git'e alınmadı.

İlk gerçek Whisper large-v3-turbo CUDA + standart DeepSeek konuşma çevirisi **37/40** kaldı. Üç grup kaynaktan devam etti; bunu tam başarı sayan kabul kontrolü durdu.

## Doğrulanan onarımlar

1. İngilizce bilgi eksikliği ifadesi Türkçede `fikrim yok` ile korunmasına rağmen modal kesinlik kaybı sayılıyordu. Yalnız kaynakta `no idea / don't know` varsa bu Türkçe bilgi-belirsizliği kanıtı kabul edilir.
2. `unpredictability → öngörülemezlik` ve `ruthlessly → acımasızca` eşdeğerleri Türkçe ekleri nedeniyle eklenmiş olumsuzluk sayılıyordu. Yalnız karşılık gelen sözcük maskelenir; bağımsız olumsuzluk korunur. Ters örnekler (`did not ...` kaybı veya eklenen `davranmadı`) hâlâ reddedilir.
3. Model uyum oranı fallback retlerini sayarken paydada yalnız ana paketleri kullanıyordu: gerçek günlük **%300** gösterdi. Payda ana+fallback yanıtlarıdır; truncation yolundaki ikinci sayma kaldırıldı. Anlam reddi artık biçim bozukluğu diye adlandırılmaz. Önbellek, kalite eşikleri ve sayı/olumsuzluk kapıları kapatılmadı.
4. Referans seçici görünürken mevcut **Bu sesi kullan** ve dinleme kontrolü kapalı video kayıt details'i içinde kalıyordu. Aynı gerçek düğmeler seçicinin yanına taşındı; handler/IPC değişmedi. İnceleme/karşılaştırma/onarım araçları varsayılan kapalı **İnceleme ve onarım** bölümünde; yoğun metin denetimi gerektiğinde açar. Temel seçimler ve gelişmiş ayarlar korunur.

Üç gerçek yanlış ret için aynı kaynak/aday üzerinde eski kod ve güncel kod tekrarlandı: önce hata, sonra temiz. [Tekrar kanıtı](evidence802/meaning-replay.json). Bu kanıt yeni stokastik model yanıtıyla karıştırılmaz.

## Sonuçlar

- İkinci canlı çeviri: **40/40**, 0 başarısız, 7 standart DeepSeek isteği, Flex yok. Tam SRT üretildi. Klip aralığı ses ekranına otomatik taşındı.
- Gerçek VoxCPM2: **17 grup**, 15 ready, **2 review**, 0 failed; WAV ve senkron üretildi. Üretim duvar saati **148.546 sn**. Paralel sentez toplamı 333.059 sn olup duvar saatinden uzundur; hız iddiasında kullanılmadı. İki incelemeden biri 2065 sayısı, diğeri ifade/ASR benzerliğidir. Sayının okunuşu kulakla doğrulanmadı; otomatik onaylanmadı.
- Native özgün yerel video + üretilen ses: aralık dışında özgün ses, aralık içinde harici ses, pause eşzamanlılığı geçti. Bu, canlı YouTube browser akışında tek asistan komutuyla tüm zincir testi değildir.
- Aynı ilk 45 saniyede normal çeviri **12/12**, 3 standart istek. Konuşma çevirisiyle bazı cümleler aynı, bazı ifadeler farklı. Tek örnekte evrensel üstünlük iddiası yok; kaynak anlam/sayı kontrolleri geçer.
- Aynı Türkçe metin/ref/15 adım/CFG1.65 ile A/B: satır 12 grup **69.125 sn**, akıcı 5 grup **43.703 sn**. Satır sürümünde 1 grup review, akıcıda 0; iki final WAV bağımsız ASR geçti. İlk soğuk/ikinci sıcak motor olduğundan sürelerden performans kazancı çıkarılmaz. Mevcut akıcı varsayılan korundu. İnsan doğallık kazananı yok.
- Gerçek OS süreç iptali: 3 çocuk süreç gözlendi; **165 ms**, tüm sahip olunan süreçler bırakıldı, yeniden başlatma exit0. Kişisel süreçlere dokunulmadı.
- Ayrı gerçek motor yaşam testi: son istek generate öncesinde kontrollü bekletildi, iptal **1.016 sn**; ilk WAV korundu, motor bırakıldı. Devamda ilk SHA aynı, yalnız grup2 üretildi (review kaldı). Aynı sıcak motorda değişen referans SHA doğrulandı ve yeni grup ready döndü. Bu gerçek CUDA kilitlenmesi yaratma testi değildir.
- Gerçek DeepSeek asistan: ilk üç dakika Whisper→Türkçe konuşma çevirisi→seslendirme isteğinde `list_translation_profiles`, `get_source_context`, `start_whisper` sırası; 0–180, translate=true, forSpeech=true, tr doğru. 3 gerçek istek; eylem adaptörleri kontrollü öneridir, GUI'de uygulanmadı. Gerçek üretim zinciri yukarıdaki ayrı native akışta sınandı. Hazırlanan kart üretim tamamlanmış demek değildir.

## Kontroller ve kullanım

- `PYTHONPATH=backend ... -m unittest backend.test_speech_guard802 backend.test_speech_translation backend.test_audit794 backend.test_audit796`: **39 geçti**. Bilgi eksikliği, sözcüksel olumsuzluk, ters anlam negatifleri ve fallback sayaç paydası.
- `... -m unittest tests.test_dub_generation_quality`: **26 geçti**, son isteğin takılması/iptal/cache koruma regresyonları.
- Hedefli Node: dub-generator-ui, dub-experience801, assistant-voice-actions, translation-review-tools: **12 geçti**.
- Değişen **4 JS/CJS + 4 Python syntax**, diff kontrolü geçti.
- Native Windows stüdyo: 1440 px TR koyu, 900 px + %125 zoom EN açık; **12 PNG**, referans dinle/uygula kapalı kayıt bölümünün dışında görünür, taşma/alt eylem alanı ve grup2 onarımı geçti. Son iki görünüm görüntülenip incelendi.
- Araç `tools/video-live-pipeline.cjs`: `--media`, `--range-end 140`, `--asr-model large-v3-turbo`, `--asr-device cuda` eklendi. Var olan opt-in şartı, güvenli anahtar broker'ı ve izole profil korunur. Son araç sürümü workflow kabulünü ve tüm-gruplar-hazır sonucunu ayrı alanlarda raporlar; bu özet alanı eklenince yeni ücretli üretim tekrarlanmadı.
- `tools/voxcpm2/accept_dub_lifecycle.py --run --engine ... --reference ... --transcript ... --output <yeni-klasör> --verify-python ...`: yalnız gerçek GPU için opt-in; mevcut cache/son-istek/ref senaryosu tekrar kullanılabilir hale getirildi.
- A/B yerel dinleme odası `tmp/live802/grouping/listen/listen.html`. WAV'lar kullanıcıya dinleme adayıdır; otomatik doğallık kararı yok.

## Araştırma ve sınırlar

[Resmî faster-whisper kaynak kodunda](https://github.com/SYSTRAN/faster-whisper/blob/master/faster_whisper/transcribe.py) önceki metin bağlamı ile döngü riskinin dengesi incelendi; rastgele Whisper varsayılanı değiştirilmedi. [VoxCPM resmî belgesinde](https://github.com/OpenBMB/VoxCPM/blob/main/README.md) tam referans dökümüyle Hi-Fi devam ve Apache-2.0 bilgisi incelendi; mevcut nano-vLLM/VoxCPM2 korundu. Yeni repo kodu kopyalanmadı, bağımlılık/model kurulmadı.

API anahtarı yalnız broker/relay belleğinde, kişisel ayarlara yazılmadı; özel sağlayıcı yanıtları yayımlanmadı. Sayıyı doldurmak için eski senaryolar yeni bug sayılmadı. Bir yerel inceleme betiğinin `read_text()` varsayılan Windows kodlaması geçici mojibake görüntüledi; açık UTF-8 okumayla gerçek dosyanın temiz olduğu doğrulandı, ürün bugı sayılmadı.

İnsan dinlemesi yapılmadı; tam sesin iki review grubu açık. Asistan tam zinciri tek gerçek browser oturumunda uygulanmış kabul edilmedi. Gerçek native testler start.bat yeniden açılışı/DRM/site giriş garantisi değildir. `start.bat` ve `install.bat` değişmedi, kişisel açık uygulama kapatılmadı. Tam npm test/uzun CI beklenmedi. Önceden mevcut 11 before-quit listener uyarısı ve motorun non-writable NumPy/deprecation uyarıları gizlenmedi. Kısa kabul sonuçları [sanitizasyonlu özette](evidence802/acceptance.json); sentetik ekranlar manifest/SHA ile kayıtlı.
