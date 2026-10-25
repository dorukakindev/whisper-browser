# Rapor 591 — Gerçek GPU telaffuz, hızlı sahne ve müzik kabulü

25 Ekim 2026. Repo https://github.com/dorukakindev/whisper-browser; dal `codex/voice-accept591`. Başlangıç master `4a26975466ba5881479d551ea461690629eb09f4`; ürün commit'i `4b2e2d054a8efb333799e27c41ae7f48ee608c09`, son ürün/test commit'i `3c1e5e5fc4870d787b4c771db23daea2ce85e9c7`.

Kullanıcı beş alanın uygulanmasını istedi: gerçek telaffuz, cümle geçişi, ses için çeviri, yoğun konuşmada video yavaşlatma ve müzik dengesi. Bu tur **gerçek yerel VoxCPM2/nano-vLLM ve mevcut ayırma modeli** çalıştırıldı. Önceki turdaki GPU engeli tekrarlandı diye varsayılmadı; başlangıçta RTX4070SUPER/12GB üzerinde başka compute işi yoktu, yaklaşık10,7GB boştu. Modeller mevcut yerel ağırlıklardan, offline bayraklarıyla kullanıldı; paket/model indirilmedi, ücretli API çağrılmadı. Kullanıcının mevcut yetkilendirilmiş referansı kopyalanmadan okundu.

## 1. Telaffuz gerçekten üretildi

31 saniyelik iki gruplu kontrol: `Dr. Newton bugün 5 kitap aldı...` için `Dr. Newton → Doktor Nyutın` sözlüğü kullanıldı. Aynı15adım/CFG1,65/temperature0,8/seed42/parallel2 ayarları korundu. Üretim ve son ses kontrolü toplam65,203sn; motor duvar süresi58,156sn, model yükleme15,109sn, referans2,922sn. Son WAV sonlu, peak0,794342, dijital kırpılma0. Son-dosya CPU ASR similarity0,875; sayı/eksik bölüm/olumsuzluk işareti yok, passed. **İlk grubun yerel similarity0,7273 review uyarısı yine korunur**; son dosyanın geçmesi tüm grup uyarılarını silmez.

125 saniyelik mevcut NASA sahnesinde ilk sözlükteki Mariner sözcüğü Türkçe kontrol metninde bulunmuyordu. Bu koşumda10eski WAV aynı kaldı, yeni konuşma0: bir negatif cache kontrolüdür, eşleşen telaffuz üretimi kanıtı değildir. Ardından gerçekten geçen `Hristiyanlık → Hıristiyanlık` ile ayrı, yeni klasörde yeniden denendi.9/10grup cache'den kullanıldı,1yeni WAV üretildi. Eski10cache dosyasının tamamı diskte aynı hash ile kaldı; eski aday silinmedi. Model yükleme10,422sn/referans1,969sn, toplam65,828sn. Hiçbir sözlük değeri uygulamanın kalıcı varsayılanına eklenmedi.

## 2. Cümle geçişleri ve tek grup onarımı

Son dosyanın bütününde yapılan CPU ASR, eski gruplardan `9,10,11,12` için `kullanmayı` yerine `kullanmadı` tanıdı. Bu, dinleme olmadan kesin TTS anlam hatası diye sunulmadı; uyarı korunup yalnız o kaynak grubu gerçek motorla tekrar üretildi. Yaklaşık41,42sn motor çalışması ve15,14sn son kontrol sonunda:

- Seçili grup ready, similarity0,9565; sayı/eksik bölüm/olumsuzluk işareti yok.
-11cache WAV'ının10'u hash olarak aynı,1'i değişti; tüm sahne sıfırdan üretilmedi.
- Son127,6738958sn WAV sonlu/clip0; bütün-dosya ASR similarity0,9554 ve passed. Önceki bütün-dosya olumsuzluk işareti kalmadı.
- Komşu grupların etkin RMS ses yüksekliği farkı en fazla0,86913dB. Bu, ses yüksekliği devamlılığı kanıtıdır; perde, duygu ve insan doğallığı puanı değildir.
- Kaynak gruplar `2,3,4` ve `23,24,25,26` eski yerel review uyarılarını hâlâ taşır. Nihai ASR geçti diye bu uyarılar gizlenmedi.

Kullanıcının dinlemesi için `tmp/accept591/listen.html` ve `listen-scene/index.html` hazırlandı. Önceki/yeni gerçek ses, kaynak video, cümle metinleri, telaffuz ve müzik örnekleri yereldir. Doğallık kazananı otomatik seçilmedi; ses parametreleri/gruplama varsayılanı değişmedi. Testlerde ses bilgisayar hoparlörüne verilmedi; insan kulağıyla “artık mükemmel” değerlendirmesi yapılmadı.

## 3. Ses için çeviri

NASA kamu kaydı https://ntrs.nasa.gov/citations/19940010921; önceki raporlardaki102,6–227,6sn kesit ve insan tarafından gözden geçirilmiş Türkçe kontrol kullanıldı. Üretilen10grubun kaynak/Türkçe eşleşmesi korunuyor; mevcut yapısal çeviri kapısında bloklanan grup0. Olumsuzluk uyarısı çeviri metninde değil, son sesin ASR'sinde ortaya çıktığı için altyazı sessizce yeniden yazılmadı; yalnız ses grubu onarıldı. Kaynak SRT'ler ve kullanıcı metni değiştirilmedi.

Bu tur canlı sağlayıcıyla yeni çeviri kalitesi ölçümü değildir; modelin Türkçesinin veya tüm sahnelerin iyi olduğu genellemesi yapılmaz. Önceki çeviri sayı/birim/olumsuzluk kapıları korunur. Mevcut120vaka kalite korpusu tekrar geçti; metin kalitesi ile akustik okuma kusuru birbirine karıştırılmadı.

## 4. Yoğun konuşmada gerçek yavaşlatma ve senkron

125sn sahnenin tüm sözcükleri korunup altyazı zamanları yarıya indirildi; video da yazılımsal olarak2×hızla62,5sn kontrol kesitine dönüştürüldü. Bu sentetik zaman baskısıdır, yeni gerçek hızlı konuşmacı örneği olduğu iddia edilmez. Motor7akıcı grup üretti; hepsi ready. Son98,3020417sn sesin ASR'si similarity0,9554/passed; eksik bölüm, ek/kayıp sayı veya olumsuzluk işareti yok. Konuşma kesilmedi. Üretim ve son kontrol134,328sn, motor duvarı118,797sn. Synthesis194,78sn ve verification30,609sn ölçümleri paralel işlerin toplamlarıdır; duvar süresine toplanmaz.

Gerçek Windows Electron, gerçek video/WAV çözümleme ve **üretimdeki BrowserDubAudio/DubSyncMap/DubWorkspaceModel** ile üç konumda denendi:

| Video konumu | Ses–harita farkı, temiz müzik | Video hızı | Ses hızı |
|---|---:|---:|---:|
|~4,60sn|0,111sn|0,445×|1×|
|~28,61sn|0,131sn|0,496×|1×|
|~56,61sn|0,091sn|0,466×|1×|

Ayrılan gerçek arka plan WAV'ıyla ikinci oynatımda farklar0,089/0,042/0,043sn. Video457kare çizdi; seek, oynatma, duraklatma, kaldırınca temel hız1×geri yükleme geçti. Ölçümler belirli konumlardadır; tüm sahne boyunca en büyük sapma garantisi değildir. Kaynak video sesi kapalı, dublaj normal hızda; yavaşlatma gerçekten video üzerinde gerçekleşti.

## 5. Müzik, kaynak ayırma ve denge

Kaynak konuşma ile bu test için yazılmış, bilinen iki kanallı sentetik müzik20sn karıştırıldı. Mevcut `UVR_MDXNET_KARA_2.onnx` modeli ve separator ortamı kullanıldı. Yalnız5–15sn seçildi; hem gerçek extraction girdisi hem ayrılan WAV **10,0sn**. Tam20sn veya125sn video ayrıştırılmadı. Ayırma GPU olarak raporlandı ve ortamda CUDAExecutionProvider mevcut; CPU ile yapılmış iş GPU diye sunulmadı.

Bilinen hizalı katmanlar üzerinden tam örneklerle ölçüm:

- Konuşma izdüşüm değişimi yaklaşık−48,36dB.
- Müzik izdüşüm değişimi yaklaşık−7,63dB: konuşma bastırılırken bu müziğin bir kısmı da azalıyor. Kusursuz ayırma iddiası yok.
- Model artık enerjisi oranı~0,01821; peak0,03247, dijital kırpılma0.

Bu doğrusal izdüşüm ölçümüdür; genel konuşma bastırma skoru, tüm enstrümanları koruma oranı veya insan algısı puanı değildir. Rakamı yükseltmek için otomatik kazanç uygulanmadı; böyle bir artış kalan konuşmayı da yükseltebilir. Gerçek oynatıcıda konuşma varken mevcut müzik seviyesi0,75'ten0,2625'e düştü (duckAmount0,35), duraklatınca ses/müzik durdu. Temiz katmanla ve ayrılan WAV'la ayrı koşuldu.10snstem bittikten sonra arka planın durması normaldir; sonraki video konumlarında yeniden çalıyor diye iddia edilmez. Varsayılan müzik/duck seviyeleri değiştirilmedi.

## Ürüne eklenenler ve dosyalar

- `altyazi_oku.py`: kalite çıktısı, sözlük gerçekten sesi değiştirdiğinde cache kaydındaki `pronunciationText` alanını taşır. Yeni GPU/model/cache sürümü değiştirme yok.
- `dub-workspace-model.js`: sınırlı/güvenli isteğe bağlı okunuş metnini kabul eder; kaynak altyazıdan ayrı tutar ve proje kaydında korur. Eski proje sürümü uyumludur.
- `dub-generator-ui.js`/`index.html`: kalite kartında **Üretimde kullanılan okunuş** satırı EN/TR gösterilir; ASR'nin hangi okunuşu denetlediği anlaşılır. Uyarılar/puanlar değiştirilmez.
- `accept_voice_scenarios.py`: opt-in yerel GPU kabulü; eşleşmeyen sözlüğü reddeder, üç dakikalık sahne sınırı, yeni çıktı klasörü, offline model, 15adım/2paralel, son WAV CPU doğrulaması. Review exit3; GPU meşgul exit2. Uygulama varsayılanlarını veya özel referansı değiştirmez.
- `measure_background.py`: bilinen hizalı test katmanlarında ayrı konuşma/müzik projeksiyonu; kaynak kalitesi bilinmezken sahte genel skor üretmez. Sonlu/boyut/süre/bağımsız katman kontrolleri var.
- `electron-real-dub-scene.accept.js`: opt-in gerçek medya, üretim denetleyicisi, hız/senkron/duck/seek/pause/remove kabulü; `--background=separated.wav` mevcut stem seçimi. Kişisel profil kullanılmaz.
- `test_voice_scenarios.py`, `test_background_measurement.py`, `dub-workspace.test.js`, `dub-generator-ui.test.js`, `electron-dub-runtime.smoke.js`: girdi korunması, kaynak ordinal/süre, overwrite reddi, bilinen sinyal hesabı, proje okunuş güvenliği ve gerçek görünüm; README kullanım.

## Kontroller ve sınırlar

16hedefli backend testi,19üretim orkestra testi, Node servis/UI/workspace/senkron/yerelleştirme/preload kontrolleri ve syntax/diff geçti. Native fixture UI exit0 `.uiprev/dub-runtime/1792958364386-13396`; yeni okunuş satırı koyuTR görüntüsünde incelendi, açıkEN/%125 kontrolleri geçti. Gerçek decoded medya testleri temiz ve ayrılmış katmanla exit0; görüntü incelendi. Fixture UI kendi başına GPU kanıtı sayılmaz; yukarıdaki gerçek üretim ayrı kayıtlıdır.

Özel ses/video/cache/ham log/ASR ve kişinin referansı Git'e koyulmadı. Kanıtlar `tmp/accept591/` ve `tmp/accept591-matched/` içindedir. Üçüncü taraf motorun tokenizer/salt-okunur NumPy/weight_norm uyarıları kayıtlarda kaldı; fatal değildi, bağımlılık kaynakları bu tur değiştirilmedi. Son kontrolde compute işi0/boşVRAM~11,2GB; yalnız kendi motorlarımız kapandı.

Yeni bağımlılık/indirme/API ücreti yok; start.bat/install.bat/package/lock aynı. Kişisel manifest/yerel indeks ve açık uygulama korunacak. Tam suite/uzun CI beklenmedi. Yeni araçların örnek model-free ve gerçek medya yolları doğrulandı; CLI matris aracının her kombinasyonu ayrıca çalıştırılmış sayılmaz. Kalite panelindeki yeni alan için proje güvenliği doğrulandı. Bütün videolarda kusursuz duygu/doğallık iddiası yok; dinleme tercihi açık kalan insani kabul adımıdır. Hedefli doğrulanan paket sürekli yetkiyle PR/master/ana kopyaya teslim edilecektir.
