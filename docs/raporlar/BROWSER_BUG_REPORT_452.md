# Rapor 452 — Geniş kapsamlı doğrulama ve düzeltmeler

Tarih: 2026-10-18. Başlangıç: `24c8853c10624207a5112c3033ae743c1d48670f`.
Bitiş kod commit'i: `d1f04c99c5f897f2739b3b57f5f7d5c1802372bf`.
Dal: `codex/browser-whisper-progress-20261014`.

Kullanıcı, önceki dar incelemenin genişletilmesini ve doğrulanan hataların
düzeltilmesini istedi. Rapor451 yalnız ipucu olarak kullanıldı; belgelerdeki
öneriler otomatik uygulanmadı. Bu çalışma tüm uygulamanın hatasız olduğunu
veya 451'deki bütün şüphelerin sonuçlandırıldığını iddia etmez.

## İncelenen alanlar ve kanıt

| Alan | İnceleme / doğrulama |
|---|---|
| Browser / oynatıcı | Whisper başlatma, aralık seçimi, zoom ve altyazı durumları; gerçek kaynak kodunu kullanan testler |
| Dublaj / referans ses | Oturum sahipliği, geç play sonuçları, iptal ve medya önizleme; ilgili servis ve UI sözleşme testleri |
| Transkripsiyon / çeviri | IPC seçenekleri, argv, loopback sağlayıcı yetkilendirmesi, çevrimdışı çeviri ve indirme ilerlemesi |
| Altyazı çıktıları | SRT/VTT yazıcıları, negatif/sonlu olmayan/zaman çözünürlüğüne sığmayan aralıklar, atomik yazma, yeniden dışa aktarma |
| Kalıcılık / IPC | Kuyruk sır filtreleme, tüm preload dosyalarında kanal eşleşmesi, gerçek Electron köprüsü |
| Performans / test güvenilirliği | Cue arama bütçeleri, deterministik bekleme, Windows alt süreçleri ve eski VM fixture kesitleri |

## Doğrulanan ve düzeltilen sorunlar

### 452-01 — İş seçeneklerinde geçersiz sayılar geç fark ediliyor

`transcribe:start` sayısal seçenekleri doğrulamıyordu. `temperature: NaN`,
`vadMinSpeechMs: null` veya tamsayı beklenen `beamSize: 3.5` gibi değerler
Python'a taşınıyordu. Python float ayrıştırması NaN/Infinity'yi kabul de
edebilir; dolayısıyla rapor451'deki "her zaman argparse hatası" yorumu doğru
değildir. Sonuç seçenek türüne göre erken CLI hatası veya daha geç model hatasıydı.

Ana süreç artık 27 sayısal seçeneğin sonlu sayı olmasını, tamsayı seçeneklerin
tamsayı olmasını dosya/model/indirme yan etkilerinden önce doğruluyor.
Hata yalnız seçenek adını içeriyor; kullanıcı değeri veya anahtar kaydedilmiyor.
Gerçek handler'ın doğrulama bölümünü çalıştıran regresyon testi NaN,
Infinity, null, boş metin, sayısal olmayan metin ve kesirli tamsayıları kapsıyor.

### 452-02 — Sıfır ayarlar backend'e ulaşmıyor

`if (options.X)` kapısı `maxCps`, `continuationGap`, `incompleteGap`,
`vadThreshold`, `timingGap` için geçerli sıfır değerini atıyor, Python varsayılanına
dönüyordu. Artık yalnız verilmemiş seçenek atlanıyor. Gerçek argv satırlarını
çalıştıran test beş alanın da `0` değerini koruduğunu doğruluyor.

Sınır: maxCps slider'ının mevcut alt sınırı 10; bu çalışmada yeni "KPS kapalı"
UI seçeneği eklenmedi. Düzeltme IPC/iş seçeneklerindeki sıfır sözleşmesini korur.

### 452-03 — SRT/VTT geçersiz veya sıfır süreli cue yazabiliyor

Biçimlendirici negatif zamanı sıfıra kırpıyor. Örneğin `(-2,-1)` aralığı,
ham end>start kontrolünü geçmesine rağmen dosyada `0 --> 0` oluyordu.
Milisaniyeden kısa bazı pozitif aralıklar da aynı sorunu doğuruyordu. VTT'de
ters aralıklar için SRT'dekine denk zaman doğrulaması bulunmuyordu.

Ortak zaman doğrulaması negatif başlangıcı, sonlu olmayan değerleri ve
milisaniyeye yuvarlandığında bitişi başlangıçtan büyük olmayan cue'yu reddediyor.
SRT ve VTT mevcut dosyayı atomik olarak koruyor. Testler ilk cue sağlam,
ikinci cue bozukken de eski dosyanın ve klasör içeriğinin korunduğunu doğruluyor.
25 saatlik geçerli kayıt ve Türkçe UTF-8/BOM davranışı ayrıca test edildi.

### 452-04 — Kısa adlı sırlar kuyruk dosyasına girebiliyor

`token`, `jwt`, `auth`, `provider_token` gibi alanlar bazı mevcut desenleri
atlayabiliyordu. Bunlar iç içe nesne ve dizilerde de ayıklanıyor; `contextTokens`,
`authenticationMode`, metin ve model seçimi korunuyor. Test sentetik verilerle
çalışıyor. Gerçek kullanıcı kuyruk/ayar dosyaları açılmadı veya değiştirilmedi.

### 452-05 — YouTube indirme ilerlemesinde null değer işi düşürüyor

yt-dlp ilerleme olayında `downloaded_bytes=None` geldiğinde `None / total`
TypeError üretiyordu. Boş miktar sıfır kabul ediliyor; ilerleme yüzde 0–100
aralığında tutuluyor, sonlu olmayan sonuç olay protokolüne yazılmıyor.
Sahte yt-dlp gerçek `download_youtube` fonksiyonunu ve hook'unu çalıştırıyor;
null miktar, bilinmeyen toplam, taşan/negatif miktar ve tamamlanma doğrulanıyor.
Bu test canlı YouTube indirmesi değildir.

### 452-06 — Medya önizlemesinde iptal sonrası veri ve tüketici hatası

`browser-reference-media` iptal/limit/zaman aşımıyla Promise'i sonuçlandırdıktan
sonra gelen stdout paketlerini işlemeyi sürdürüyordu. PCM tüketicisi hata
fırlatırsa bu hata Promise yerine EventEmitter callback'inden kaçabiliyordu.

Sonuçlanmış iş gelen veriyi yok sayıyor; tüketici hatası süreci sonlandırıp
işi reddediyor. Geç stdout ve decoder hatası kontrollü süreç fixture'ıyla
doğrulandı. Mevcut gerçek FFmpeg dalga/kare/süre testi Windows'ta ayrıca geçti.

## Rapor451'deki yanlış veya kapsamı daraltılan yorumlar

- B-1: `browser:youtube-guard:policy-changed` dinleyicisi
  `src/youtube-ad-preload.js` içinde zaten var. IPC testi yalnız üç sabit
  preload dosyasını taradığı için yanlış alarm veriyordu. Artık bütün preload
  dosyaları taranıyor. Yeni mini preload davranış testi de eklendi.
- B-2: UI'daki range alanları normal kullanımda boş metin tutmaz. Gerçek
  savunma eksikliği IPC ve geri yüklenen iş seçenekleri sınırındadır; 452-01
  orayı düzeltir.
- B-5: `25:00:00` üç haneli saat değildir; 24 saati aşan süre tek başına
  hata değildir. Geçerli uzun kayıt çıktısı korunur.
- B-9: `bindSubtitleStyleControls` mevcut kodda `id + 'Val'` etiketini
  güncelliyor. Yeni bir slider düzeltmesi gerekmedi.
- C-2: `mergeBrowserStreamCues` mevcut kodda `previous.slice()` ve yeni dizi
  döndürüyor. Raporun aynı diziyi yerinde değiştirme varsayımı bu yolda
  doğrulanmadı. Keyfi dış mutasyonlar için bütün cache API'lerinin güvenli
  olduğu iddia edilmez.
- Boş/bozuk VTT metni, diğer C/D şüpheleri ve genel CSP değerlendirmesi bu
  çalışmayla topluca çözülmüş sayılmaz.

## Test altyapısı düzeltmeleri

451'de listelenen 11 başarısız dosyanın tamamı hedefli yeniden koşumda geçti:
`audit-tur4`, `browser-create-translate-default`, `browser-youtube-whisper`,
`validation`, `browser-store-deadzone`, `misc-exports-deadzone`,
`ci-determinism-ratchet`, `coverage-map`, `unicode-paths`,
`report73-player-ab-search`, `ipc-parity`.

Değişiklikler: gerçek endpoint helper'ını VM'e dahil etme; dublaj busy
bağımlılığını fixture'a ekleme; kod kesitlerini gerçek fonksiyon sınırlarında
bitirme; Windows'ta `true/sleep` yerine `process.execPath`; genişletilmiş
normal Windows yollarını kabul ederken GLOBALROOT/aygıt yolunu reddeden
sözleşme; taşınan zoom fonksiyonunu bulma. SPA reklam testinde sabit uyku
yerine stil değişimi gözlemleniyor, gerçekleşmezse süre sınırında test hata veriyor.
Eşikler artırılmadı, assertion veya test kaldırılmadı.

## Doğrulama sonuçları ve sınırlar

- 26 hedefli Node test dosyası geçti; liste ve komutlar devir notunda.
- 250 Python testi geçti: 224 transcribe saf fonksiyon + 26 unittest.
- Gerçek Electron trusted bridge smoke testi geçti.
- Ana JS dosyalarında `node --check`, backend'de `py_compile`, diff kontrolü geçti.
- Tam `npm test` yeniden çalıştırılmadı; bu çalışma yeni tam paket sonucu iddia etmez.
- Canlı YouTube, oturumlu siteler, gerçek TTS/GPU üretimi ve donanımlı ses
  senkronu denenmedi. UI değiştirilmedi; görsel doğrulama gerekmedi.
- `install.bat` / `start.bat` değiştirilmedi veya bu tur çalıştırılmadı.
- Kullanıcının önceki talimatıyla CI incelemesine dönülmedi; CI başarısı iddia edilmez.
