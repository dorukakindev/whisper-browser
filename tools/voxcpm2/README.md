# VoxCPM2 altyazı dublaj aracı

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

Mevcut `backend/requirements-separator.lock` ile ayrı `backend/separator-venv`
ortamı kullanılır (kurulum: mevcut `install-browser-extras.bat`). Audio Separator0.47.0
ve `UVR_MDXNET_KARA_2.onnx` instrumental katman üretir. Bu kurulumun ayırma
motoru CPU'dur; VoxCPM2 CUDA ortamına paket kurulmaz. İlk model indirmesi yaklaşık53MB;
ses ayırma ek süre alır. Kaynak/ayar uyumlu arka plan önbelleği yeniden kullanılır.

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
