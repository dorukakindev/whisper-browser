# VoxCPM2 altyazı dublaj aracı

## Elle gerçek ses kabulü

`accept_dub.py` normal test paketinde model başlatmaz. Argümansız çalıştırma
yalnız ilk GPU'nun durumunu okur. Saf compute işi, eksik süreç envanteri veya
8 GiB'den az boş bellek varsa `blocked_gpu` ve çıkış kodu2 döner; dosya oluşturmaz,
başka süreci durdurmaz. Bu kontrol GPU rezervasyonu değildir; üretim sırasında
başka GPU işi başlatmayın. WDDM masaüstü `C+G` süreçleri model işi sayılmaz.

Gerçek deneme için **motorun mevcut venv Python'u** ile açık `--run`,
`--engine`, `--reference`, `--transcript` ve `--verify-python` yolları gerekir.
Referans size ait/izinli temiz ses, döküm birebir olmalıdır. Örnek:

```powershell
& $enginePython tools/voxcpm2/accept_dub.py --run --engine $engineRoot --reference $ownVoice --transcript $ownTranscript --verify-python $backendPython
```

Değişkenler mevcut yerel dosyalara işaret etmelidir. İki sabit Türkçe blok;
15 adım/CFG1.65/temperature0.8/seed42, akıcı gruplama, uyarlamalı video
zamanlaması ve ayrıntılı CPU ASR kontrolü kullanılır. Model indirilmez;
çevrimdışı mevcut ağırlıklar ve mevcut `small` doğrulayıcı gereklidir.
Her çalıştırma yeni `tmp/real-dub-accept-*` alanına cache/WAV/özel günlük ve
`acceptance.json` kaydeder; kişisel motorun eski çıktıları kullanılmaz/değişmez.
Araç yalnız gerçek üretimden sonra aşama sürelerini, WAV süresini ve grup
doğrulamalarını raporlar. `produced_needs_listening` dinleme gerektirir:
ASR eşleşmesi doğal ton/duygu kalitesi garantisi değildir. İnceleme gerektiren
çıktı exit3 döner; hata/eksik doğrulayıcı başarı sayılmaz. `--run` üretim yolu
GPU uygun değilken doğrulanmış gibi sunulmamalıdır.

## Bağımsız metin stüdyosu

Stüdyonun üstünde **Dengeli / Kitap anlatımı / Hızlı deneme** hazır ayarları vardır.
Mevcut ses, döküm, motor ve metin korunur. Gelişmiş ayarlar başta kapalıdır;
CFG/temperature/durak/seed seçeneklerini oradan açın. **Kısa örnek** düğmesi
yalnız o çalıştırmada örnek üretir; sonraki tam üretim seçiminizi değiştirmez.
PyTorch'ta kullanılmayan batch/temperature alanları kapalı gösterilir.

Browser/oynatıcı ses paneli etkin SRT/ses/aralığı üstte gösterir. Alt çubuk
üretim/durdurma/sonucu kullanma eylemlerini görünür tutar. **Dengeli** normal
üretim içindir; **Hızlı deneme** AI metin düzenlemesini kapatır, **Ayrıntılı kontrol**
tüm gruplarda metin doğrulaması yapar ve daha uzun sürer. Bu profiller sesinizi,
altyazınızı, aralığı veya isteğe bağlı müzik ayırma seçiminizi değiştirmez.

Güncel stüdyo iki sütunludur: solda kayıtlı sesler/klonlama/motor/kalite/son işlem,
sağda geniş metin ve günlük, altta sabit üretim/dinleme çubuğu. Dar veya yüksek
DPI pencerede sol ayarlar kaydırılabilir. Otomatik, Hi-Fi ve dökümsüz basit
klonlama; nano-vLLM veya uyumlu PyTorch motoru seçilebilir. Kelime vurgulu
okuyucu isteğe bağlı son işlemdir; modelin kelime kelime ses ürettiği anlamına gelmez.
300 karakterlik dengeli bloklar varsayılandır; 600/900/1200 ile uzun bağlam seçilebilir. Gerçek GPU karşılaştırmasında yaklaşık 400 karakterlik tek istek erken bitirebildi; uzunluk kalite garantisi değildir.
Okuma planı v2 tam cümleleri birleştirir, çok uzun metinler güvenli sınırlarda parçalanır.
Durak alanı saniye değil mevcut motorun durak **çarpanıdır**. Sayısal tercihler,
klonlama/motor/parçalama/son işlem ve örnek seçimleri saklanır; varsayılan hizalama
kapalıdır, açılırsa ek süre/model indirmesi gerekebilir. İşlenen özgün metin değişmez.

Browser/oynatıcı **Konuşma gruplama → Akıcı konuşma blokları** varsayılanında,
yakın kısa cümleler en fazla 280 karakter/18 saniyelik kaynak blokta birleştirilir.
600 ms üzeri boşluk, çakışma ve görünen konuşmacı sınırı ayrı tutulur. Eski cümle
grupları ve satır satır seçenekleri de vardır. Plan ve üretim aynı ayarları kullanır;
eski plana ait düzenleme farklı gruplama ile uygulanamaz. İnce kelime zamanlaması
garantisi yoktur; senkron blok düzeyindedir, video yavaşlatma haritası korunur.

Whisper Local kökündeki `ses-studyosu.bat` dosyasını çift tıklayın. Ana Electron
uygulaması gerekmeksizin metin yazabilir/TXT açabilir, WAV referansı ve birebir
dökümünü seçebilir, adım/paralellik/CFG/sıcaklık/durak ayarlarını yapabilirsiniz.
Arayüz bu repodaki `text_studio.py` dosyasıdır; masaüstündeki eski `arayuz.py`
çalıştırılmaz veya değiştirilmez. Mevcut motorun `nanovllm_oku.py` okuyucusu ve
venv/model dosyaları kullanılır; yeni model kurulmaz. Model ağırlıkları ve mevcut
SRT dublaj hattı değiştirilmez. GPU CUDA gerekir.

Girdi/metin/döküm/iş günlüğü `Downloads/Sesler/Girdi/Metin/<iş>/`, WAV çıktıları
`Downloads/Sesler/Çıktı/` altındadır. Sayısal ayarlar ayrı `text-studio-settings.json`
dosyasına kaydedilir; uygulamanın `dub-settings.json` dosyası ezilmez.
Uygulama içindeki **Metin / TXT stüdyosunu aç** düğmesi de aynı arayüzü açar.
Bağımsız açarken GPU kullanan başka bir üretimi kapatın; Electron içinden açılan
stüdyo mevcut üretim kilidine katılır, bağımsız süreç ayrı GPU kilidi sağlamaz.

Browser/oynatıcı referans panelinde **Yerel ses seç** ile WAV/MP3/FLAC/M4A vb.
bir kaynak seçilir. 3–30 saniyelik aralığı ayarlayıp **Referans sesi hazırla**
ve sonra **Bu sesi kullan** düğmesine basın. Kaynak dosya değiştirilmez;
standart referans WAV ve otomatik döküm `Sesler/Ses referansları/` içine kaydedilir.

Bu dosyalar Whisper uygulamasına TTS bağımlılığı eklemez. Mevcut VoxCPM2
ortamını kullanan kanonik dublaj scriptleridir. Uygulama artık bu klasördeki scripti
`VOXCPM_ROOT` ile seçilen dış motorla çalıştırır; eski dış scriptin kopyasına bağımlı değildir.
Bağımsız CLI kullanımında `altyazi_oku.py`, `dub_timing.py`, `dub_plan.py` birlikte motor klasörüne konabilir.
Çalışan kitap motoru ve kişisel ses referansları değiştirilmez.

Motor klasöründen mevcut venv ile:

```powershell
.\.venv\Scripts\python.exe altyazi_oku.py ceviri.srt referans.wav --transcript referans.txt --mode hifi
```

Repo içindeki kaynak kopyasını doğrudan çalıştırmak için `VOXCPM_ROOT` mevcut
motor klasörünü göstermelidir. `kitap_ortak.py`, `kitap_voxcpm.py` ve nano-vLLM
bağımlılıkları o ortamdan alınır; bu klasör bağımsız motor kurulumu değildir.

Varsayılan `--gruplama cumle`: yakın devam satırları cümle gruplarına alınır.
Grup hedefleri 250 karakter, 12sn üst sınır; 600ms'den büyük boşluk ve görünür
konuşmacı değişimleri birleştirilmez. Uzun tek cue bölünmez; orijinal SRT
değişmez. Her grupta kaynak cue kimlikleri manifestte korunur. Bu grup saati
hizalamasıdır; grup içindeki her kelimeye özgün cue zamanı garanti edilmez.

- `--gruplama satir`: ayrı satır üretimi.
- `--plan`: GPU üretmeden grup planı. `--limit 11`: ilk 11 kaynak cue ile örnek.
- `--max-hiz 1.25`: varsayılan azami tempo. Sırf süreye sığmamak tekrar sentez
  nedeni değildir; akustik kusurlar `--retry` sınırında yeniden denenir.
- `--tasarsa hata`: isteğe bağlı katı mod; konuşma hâlâ sığmıyorsa timing raporu yazılır,
  nihai WAV yazılmaz. Mevcut çıktılar silinmez. Bu durumda ses kalitesinin
  korunması için metin/süre veya ilgili grup ayrıca incelenmelidir.
- `--tasarsa kirp`: varsayılan ve arayüz modu; taşma üretimi durdurmaz. Sığmayan
  konuşmanın sonu yumuşak kesilebilir; sayısı ve kesilen örnek sayısı
  raporda saklanır. Sessiz padding temizliği konuşma kesilmesinden ayrı sayılır.
- `--bosluk-pay-ms 2000`: grubun ardından kullanılabilecek en çok boşluk;
  sonraki grubun başlangıcı ve varsa video sonu aşılmaz.
- `--erken-pay-ms 300`: yalnız taşan grupta önceki gerçek sessizlikten en fazla
  300ms kullanılır. Önceki konuşmayla çakışmaz; video başına taşmaz. Küçük
  başlangıç kayması mümkündür; manifest gerçek ses başlangıç/bitişini gösterir.
- `--grup-max-sn`, `--grup-max-karakter`, `--grup-bosluk-ms`: plan sınırları.

Arayüzde Kaliteli (15 adım) / Hızlı (10 adım) ve 4 / 8 paralel grup seçilir;
seçimler dub-settings.json'da saklanır. Varsayılan 15 adım / 4 grup, cfg1.65,
temperature0.8 ve Hi-Fi referans+döküm korunur. 8 grup daha çok VRAM ister;
tam iş öncesi kısa örnekle denemek mümkündür. CLI `--steps`/`--eszamanli`.

Yeni v3 ses önbelleği zamanlama ve batch kapasitesinden ayrıdır; yalnız tempo,
boşluk veya paralellik değiştirmek sesi yeniden üretmez. Aynı model/referans/
döküm/üretim ayarlarıyla eşleşen eski v2 sesler kopyalanarak kullanılabilir;
eski cue önbellekleri silinmez. Varsayılan çıktı
adında `cumle`/`satir` yer alır; eski ses dosyası ezilmez. `timing_report.json`
parça önbelleğinde, ayrıntılı zamanlama ve kaynak kimlikleri nihai manifestte.
Üretilen kişisel ses/manifest/transcript dosyalarını Git'e koymayın.

Windows dublaj profilinde paralellik 4, model/batch token sınırı 2048, üretim
token sınırı 1024. `--eszamanli`, `--max-model-len`, `--batch-tokens`,
`--max-generate-length` ile değiştirilebilir. Bunlar modelin ses referansı veya
cfg/temperature/adım ayarını değiştirmez. Küçük token penceresinde referans ve
hedef metin + üretim bütçesi pencereye sığmalıdır. Windows'ta yalnız bu süreçte
pread ağırlık yükleme kullanılır; kurulu paket dosyaları değiştirilmez. Motor
hazırlığı120sn, tek sentez isteği `--request-timeout 180` ile sınırlanır.
generation_report.json model/referans/üretim sürelerini ve deneme sayılarını
tutar; özet uygulamanın üretim loguna aktarılır. Bu sayaçlar model kalitesinin
otomatik kanıtı değildir; farklı profillerin sesi dinlenerek karşılaştırılmalı.


## Ayrı dublaj metni

Altyazıdan ses üret → Dublaj metnini düzenle → Cümle planını hazırla.
Grup seç; özgün metni ve ayrılan süreyi gör. Elle düzenle veya **AI ile süreye
göre kısalt** seç. AI mevcut Çeviri sağlayıcısını kullanır; yalnız seçili grubun
metni ve hedef süresi gönderilir, ses referansı gönderilmez. **Bu metni uygula**
ile seçilen metin üretime girer. Öneri otomatik uygulanmaz; anlam/isim/olumsuzluk
kontrolü kullanıcıya aittir. Sayı kaybı görülen öneriler reddedilir. Süre tahmini
kesin değildir; mevcut tempo/kırpma davranışı geçerlidir.

Uygulanan metinler sesin yanında `<iş-kimliği>-dub-text.json` olarak saklanır;
SRT yazılmaz. `--dub-text dosya.json` CLI'da aynı planı kullanır: `sourceHash`
kaynak SRT SHA256, `edits` kaynak cue kimliklerinden oluşan anahtarlarla metin
sözlüğüdür (`"1,2": "Kısa metin."`). Kaynak değişirse üretim reddedilir. Kısa
örneğin sonunda kesilen kaynak grubunun tam-plan düzenlemesi uygulanmaz;
tam üretimde uygulanır. Metin değişince ilgili ses önbelleği de değişir.

Tamamlanmış cümleden sonra yeni uzun cümle ayrı gruptur. Çok kısa replikler
(24 karakterden az) bağlamla tutulur; Dr./Prof. gibi kısaltmalar ve üç nokta
bitiş sayılmaz. Karakter/süre sınırları korunur, kelime içinden kesilmez.


## Yalnız zaman aralığını seslendirme

**Yalnız seçilen zaman aralığını seslendir** açılır. Başlangıç/bitiş `dk:sn`,
`saat:dk:sn` veya saniye olarak girilir; **Başlangıcı videodan al** mevcut
YouTube konumunu alır. Cümle planı da seçilen aralığa göre hazırlanır; aralık
sonradan değiştirilirse eski plan temizlenir. Örnek seçeneği açıksa seçilen
aralıktaki ilk 11 kaynak cue kullanılır.

`--range-start 120 --range-end 180`: yalnız kesişen altyazı cue'ları üretilir.
Kaynak kimlikleri korunur. Sınır cue'nun tam metni okunur; zaman penceresi
sınırda daraldığından sonu kırpılabilir. SRT kelime zamanlaması içermediği için
sınırda kelimeye göre metin bölünmesi garanti edilmez.

Sabit video modunda WAV yalnız 60sn içerir; başına 120sn sessizlik eklenmez.
Uyarlamalı video modunda konuşmayı korumak için daha uzun olabilir. Manifest
`video_offset_seconds` taşır; uygulamanın sonuç/logu `range` taşır. **Sesi kullan**
çıktıyı videonun 120. saniyesine hizalar ve 180. saniyeden sonra özgün sese döner;
geriden/ileriden aralığa yeniden sarma desteklenir. Önceden kullanıcı tarafından
sessize alınmış sekme aralık dışında da sessiz kalır. Dosyayı elle ses seçiciyle
açmak bu range metadata'sını taşımaz; otomatik bağlama veya Sesi kullan gerekir.
CLI'da aralık WAV'ını tüm videoya gömme desteklenmez; yanlış hizalama yerine
net hata verilir. Yeni model/bağımlılık kurulmaz.


## Konuşmayı tam tutan video modu

Uygulamada **Konuşma süreye sığmazsa → Konuşmayı tam tut; videoyu yavaşlat**
varsayılandır. Ses doğal hızda tutulur; yetmeyen grup penceresi ses dosyasında
uzatılır ve `<id>.sync.json` oluşturulur. **Sesi kullan**, özgün video zamanı ile
uzatılmış ses zamanını eşler. Oynatıcı videoyu sadece gereken pencerede yavaşlatır;
sonra seçilen temel hıza döner. Kullanıcının uygulamadaki hız kontrolü temel hızı
günceller. Kaldırma/sekme değiştirme/reklam/pause/seek durumları yönetilir; sayfa
hız override'ı yenilenmezse3sn sonra geri bırakılır. Müzik de video hızıyla gider.

CLI varsayılan clip olarak korunur. Doğal hızla tam konuşma örneği:
`--timing-mode video --max-hiz 1`. Video modundaki uzun WAV tek başına oynatılırsa
video ile doğrusal senkron değildir; uygulamada Sesi kullan ve harita gerekir.
Sabit videoya CLI gömme bu modda reddedilir. Aşırı dar pencerede oynatıcı hız
sınırları yetmezse ses dosyası korunur ama oynatma hata vererek durabilir.

Önceden kırpılmış nihai WAV kayıp sözcükleri içermez. Yeniden üretim gerekir;
uyumlu metin/model/ayar için ham cue önbelleği varsa yeni GPU sentezi olmadan
zaman çizelgesi yeniden kurulabilir.

## Müzik ve ortam seslerini koruma

**Müzik ve ortam seslerini koru** seçeneği varsayılan kapalıdır. Açık YouTube
videosu kaynak alınır; native **Arka plan için video / ses seç** ile yerel kaynak
verilebilir. Yalnız izinli yerel medya veya doğrulanmış YouTube kimliği kullanılır.
YouTube sesini indirme başarısızsa yerel kaynak seçilebilir; cookie/hesap anahtarları
bu yeni indirme yolunda kullanılmaz. Sınır gerekiyorsa aralık alanları kullanılır.

Ayırma ayrı `backend/separator-venv` ortamında çalışır. `install-browser-extras.bat`
NVIDIA varsa `requirements-separator-gpu.lock` ile CUDA 12.4 PyTorch ve ONNX Runtime GPU
kurar; NVIDIA yoksa CPU kilidini kullanır. `install-browser-extras.bat --cpu` CPU'ya döner.
Audio Separator0.47.0 ve `UVR_MDXNET_KARA_2.onnx` instrumental katman üretir.
VoxCPM2 CUDA ortamına paket kurulmaz. İlk model indirmesi yaklaşık53MB;
ses ayırma ek süre alır. Kaynak/ayar uyumlu arka plan önbelleği yeniden kullanılır.
Seçilen dublaj aralığı önce FFmpeg ile kesilir; ayırma yalnız o parçayı işler.
YouTube kaynak ses indirmesi daha uzun olabilir; bu tüm videonun ayrıldığı anlamına gelmez.
Durdur sırasında durum Durduruluyor, süreç kapanınca Durduruldu olur.

Konuşma tamamen yok olmayabilir, bazı efektler zayıflayabilir. Sesler hiçbir uzak
ses işleme servisine yüklenmez; ağ yalnız YouTube kaynağı/model indirmesidir.
Anlatıcı WAV'ı ve `<id>-background.wav` ayrı tutulur; **Sesi kullan** bunları birlikte
oynatır. Arka plan düzeyi şeritte ayarlanır. Tek dosyalık mix/export eklenmedi.
Arka plan ayırma başarısız olursa uyarıyla yalnız dublaj üretilir; Durdur hazırlıkta
da etkilidir.

Kısa doğrulama: gerçek yerel11sn ses+sentetik müzik instrumental üretimi ve
1sn video penceresine3.19658sn tam konuşma/0kırpma, ayrı arka plan, geçerli harita.
Bu, uzun YouTube videolarında kusursuz ayırma veya canlı Electron senkron kanıtı değildir.

Kaynak: [Audio Separator](https://github.com/nomadkaraoke/python-audio-separator).


## Yerel ses karşılaştırması

Motorun Python'uyla `compare_prosody.py --text ornek.txt --reference ses.wav
--transcript ses.txt --output yeni-karsilastirma` çalıştırılabilir. Önce
VOXCPM_ROOT motor klasörünü göstermeli. Metin en fazla800 karakter ve her
satırda tam cümle olmalı. İsteğe bağlı --verify-python uygulamanın backend
Python yoludur (önbellekteki small Whisper gerekir). --only ile sentence,
flowing, fixed-seed, cfg2-fixed veya single-context seçilebilir. Model yalnız
önbellekten yüklenir; yeni model indirmez. İşlemGPU kullanır; aynı anda başka
ses üretimi başlatmayın. Çıktı listen.html ve results.json'dur. Otomatik bir
kazanan veya insan doğallığı puanı verilmez. Daha uzun bağlam her zaman daha
iyi değildir; [gerçek deneme raporu](../../docs/raporlar/BROWSER_BUG_REPORT_504.md)
metin atlayan tek-parça örneği ve kontrollü kurtarmayı açıklar.


### Sabit anlatım bağlamını karşılaştırma (deney aracı)

compare_continuity.py aynı metni orijinal prompt ve sabit onaylı bağlam ile
karşılaştırır. Modelin kendi Python'u ve VOXCPM_ROOT gerekir. Argümanlar:
--cases (JSON metin listesi,1–8 pasaj,her biri en çok300karakter),
--anchor-audio (3–20sn mono WAV), --anchor-text (birebir TXT),
--reference (asıl WAV), --transcript (asıl TXT), --verify-python
(uygulama backend Python'u) ve --output (henüz var olmayan klasör).
Anchor yerel ASR'dan geçmeden model yüklenmez. Referans asıl ses olarak
korunur; çıktılar zincirlenmez. Sonuçlar JSON/listen.html, kişisel dosyalar
Git'e konmamalı. Bu araç üretim varsayılanı seçmez; daha kısa ses doğallık
kanıtı değildir. GPU kullanır; başka ses üretimiyle aynı anda çalıştırmayın.

### Okuma hızını ve perdeyi ölçme

`analyze_prosody.py --results karsilastirma/results.json --output yeni-olcum.json`
önceki sabit bağlam deneyini CPU üzerinde inceler. `--pitch` eklenirse mevcut
motor Python'undaki librosa ile pYIN hesaplanır; ana backend'e ek paket gerekmez.
Bu seçenek daha yavaştır. Her WAV mono ve en çok30 saniye, en çok8 pasaj/4 aday
olmalıdır. Dosyalar karşılaştırma klasöründe kalır, çıktı dosyası ezilmez.
Ölçümler: kenar sessizliği dışındaki span üzerinden sözcük/saniye, aktif RMS,
enerjiyle sessiz bulunan oran ve isteğe bağlı F0 medyanı/90–10 yüzdelik aralığı.
F0 bir konuşmacı kimliği ölçümü değildir; otomatik doğallık puanı veya kazanan yok.
Perde özeti en az500ms ve konuşma span'ının%10'u kadar güvenilir çerçeve ister;
yetersizse medyan/aralık boş kalır ve kapsama ayrıca yazılır. Bu raporlama
eşiğidir; ses üretimine müdahale etmez. Windows'ta JIT önbelleği sorununda
yalnız analiz süreci için proje içinde ayrı `NUMBA_CACHE_DIR` kullanılabilir.
İlk pYIN çağrısı derleme nedeniyle uzayabilir; motor paketleri değiştirilmez.
Ses değiştirilmez, yüklenmez. Aynı metindeki örnekleri karşılaştırın; farklı
cümlelerin hız/perde farkı tek başına kusur anlamına gelmez.

Akıcı altyazı gruplamasında tamamlanmış cümle sınırları, istek sayısını azaltmaktan
önce gelir. Gerektiğinde biraz daha fazla grup oluşabilir; süre/boyut sınırları
korunur. Uzun ses kurtarmasında da uygun cümle sonu virgülden önce tercih edilir.

Doğrulamalı yeniden okumada bütün anlam kontrollerini geçen aday seçilir.
İsteğe bağlı ikinci deneme başarısızsa ilk kullanılabilir ses inceleme uyarısıyla
korunur; üretimin başarılı olduğu iddia edilmez.


Doğrulama/uzun içerik kurtarması sırasında motor takılsa veya task iptal edilse
bile önceden yazılmış gerçek ses review olarak korunur; motorun aynı koşumdaki
tekrar denemesi sürer. İptal başarılı üretime çevrilmez. Kurtarılan küçük parçalar
ASR'ye ek olarak normal üretimin ham akustik denetiminden de geçer. İşaretli
miktarlar (artı/eksi) ve without kaybı ayrıca kontrol edilir; aynı aralık/tarih
metninin geri okunması gereksiz sayı hatası sayılmaz. Yeni denetim eski zayıf
onayları devralmamak için v15 parça kimliği kullanır; eski sesler silinmez.
