# Whisper Altyazı

[![Testler](https://github.com/androiandot/whisper-altyazi/actions/workflows/ci.yml/badge.svg)](https://github.com/androiandot/whisper-altyazi/actions/workflows/ci.yml)
[![Lisans: MIT](https://img.shields.io/badge/lisans-MIT-blue.svg)](LICENSE)
![Platform](https://img.shields.io/badge/platform-Windows-lightgrey)

**Videolarınızdan yerel olarak, GPU hızıyla altyazı çıkarın.** Ses hiçbir yere
gönderilmez: transkripsiyon tamamen kendi makinenizde, faster-whisper ile çalışır.
Arayüz Electron, backend Python.

Film ve belgesel altyazısı için ayarlanmıştır: cümle bazlı bölme, okuma hızı (CPS)
normalizasyonu, halüsinasyon temizliği, noktalama çöküşü onarımı — ve dahili bir
oynatıcı, böylece çıkardığınız altyazıyı programın içinde izleyebilirsiniz.

> Windows + NVIDIA GPU hedeflidir. CPU'da da çalışır ama çok yavaştır.

**İçindekiler:** [Özellikler](#özellikler) · [Kurulum](#kurulum) ·
[Kullanım](#kullanım) · [Önerilen ayarlar](#önerilen-ayarlar-4070-ti) ·
[Motor seçimi](#motor-seçimi) · [Sorun giderme](#sorun-giderme) ·
[Gizlilik ve veriler](#gizlilik-ve-veriler) · [Geliştirme](#geliştirme) ·
[Lisans](#lisans)

## Özellikler

- **Yerel dosya** veya **YouTube linki** desteği (yt-dlp ile indirme)
- **CUDA + float16** ile GPU hızlandırması (4070 Ti için optimize)
- **Seçilebilir motor**: faster-whisper (dengeli), faster-whisper batched (uzun videoda çok daha hızlı), WhisperX (wav2vec2 ile <100ms kelime hizalaması)
- **Silero VAD** ile sessizlik filtreleme — halüsinasyon azaltma
- **Akıllı bölme**: kelime zaman damgalarıyla noktalama bazlı altyazı bölme
- **Profesyonel zamanlama**: okuma hızı (CPS), min/max süre ve altyazılar arası boşluk normalizasyonu (Netflix/BBC tarzı)
- **Kısa parça birleştirme**: flaş eden tek-kelimelik altyazıları komşusuyla birleştirir (okunabilirlik)
- **Düşük güvenli kelime raporu** — Whisper'ın emin olmadığı kelimeler (skor < 0.60) altyazı bloğunun bağlamıyla `<ad>.dusuk-guven.txt` dosyasına yazılır; sık tekrar edenler "sözlük adayı" olarak öne çıkarılır (yanlış duyulmuş özel isimleri bulmanın en hızlı yolu)
- **Senkronda sürüklenme düzeltme** — kayık altyazı yalnızca sabit kaymayla değil, **farklı framerate** (PAL 25/24, 23.976/24, 30/29.97…) kaynaklı sürüklenmeyle de hizalanır. Başta doğru görünüp sonda dakikalarca kayan altyazılar düzelir; sürüklenme yoksa dokunulmaz
- **Tekrarlayan uydurma yakalama** — sabit kalıp listesi yalnızca bilinen uydurmaları ("Thanks for watching" vb.) yakalar. Bilinmeyenler için istatistik: dosya boyunca tekrar eden, kısa ve **düşük güvenli** metinler tespit edilir. Güveni çok düşükse silinir, ortadaysa uyarı verilir. Gerçek kısa replikler ("Evet.") ve ardışık kekeleme tekrarları korunur
- **Yaygın hata düzeltme** — Whisper çıktısındaki tipik kusurlar otomatik giderilir: tekrar eden ön ek ("karaoke" artefaktı), 80 ms altı görünmez mikro bloklar, noktalama sonrası unutulan boşluk ("geldi.Sonra"), üst üste ünlem/soru işareti ve cümle başı küçük harf (Türkçede doğru şekilde i → İ). Sayılar, kısaltmalar ve diyalog tireleri korunur
- **Kalite uyarıları**: alfabe karışması (İngilizce altyazıda Kiril harfleri gibi) ve şüpheli zaman damgaları (cümle yarıda kesilip dakikalar sonra devam etmesi) tamamlandığında günlükte raporlanır — otomatik silinmez, elle kontrol edilir
- **Noktalama çöküşü onarımı**: Whisper uzun videoların ortasında noktalamayı bırakırsa (küçük harfli, noktasız akış) o bölüm otomatik olarak bağlam sıfırlanarak yeniden çevrilir — yalnızca sonuç gerçekten iyileşirse kullanılır
- **Yarım cümle birleştirme**: belgesel/anlatım tarzı dramatik duraksamalarda parçalanan cümleleri tek blokta toplar; `Mrs.`, `Dr.`, `L.A.`, `2.` gibi kısaltmalar cümle sonu sanılmaz
- **Okuma hızı uyarısı**: önizlemede CPS limitini aşan altyazılar görsel işaretlenir
- **Halüsinasyon temizleme** (`Subtitles by`, `Thanks for watching` vb. otomatik filtre)
- **Canlı önizleme** — segmentler oluştukça gerçek zamanlı görünür
- **Birden çok format**: SRT, VTT, TXT, ASS (stil/renk), JSON (kelime damgaları) veya hepsi
- **25+ dil**, otomatik dil algılama veya İngilizce'ye çeviri
- **Klasör izleme** — bir klasörü izlemeye al; içine yeni video düştüğünde kuyruğa otomatik eklenir ve kuyruk kendiliğinden başlar. Kopyalama bitmeden işlemez (dosya boyutu sabitlenene kadar bekler), yanında `.srt` olan dosyayı ve video olmayanları atlar
- **Toplu işlem kuyruğu** — birden çok dosyayı sürükleyip (veya diyalogdan çoklu seçip) sırayla işle; hatalı iş tek tıkla yeniden denenir, biten işin klasörü tıklayınca açılır
- **Zaman aralığı (kırpma)** — Kaynak kartındaki iki alanla videonun yalnızca bir bölümünü işle (örn. `1:30`–`5:00` veya saniye olarak `90`); seçili süre anında gösterilir, geçersiz aralık başlamadan uyarır. Zaman damgaları orijinal videoya göre hizalanır — uzun videoda ayar denemek için ideal. YouTube'da ses **tam olarak indirilir, aralık sonra yerelde kesilir** — YouTube aralıklı indirmeyi ~12 KB/sn'ye boğazladığı için bu yol çok daha hızlı (ölçüm: 8 saatlik videodan 1s55dk'lık aralık, aralıklı indirmeyle ~3 saat, bu yolla 102 saniye). Karşılığında videonun tamamının sesi (genelde birkaç yüz MB) inip geçici klasöre yazılır
- **Önizlemede arama** — canlı önizlemedeki segmentlerde anlık metin filtresi
- **Tek tıkla yt-dlp güncelleme** — YouTube indirme hatalarının başlıca çözümü, uygulama içinden
- **Çift dilli tek dosya** — kaynak ve çeviri üst üste tek `.dual.srt` içinde; uygulamamız dışında herhangi bir oynatıcıda da iki dili aynı anda gösterir (bloklar birebir aynı olduğu için hizalama sorunsuz)
- **Ses ön-işleme (opsiyonel)** — eski/kısık kaynaklar için seviye eşitleme (loudnorm) ve gürültü azaltma (afftdn). Varsayılan KAPALI: temiz bir kaynakta ölçtük, faydası yok (162 vs 163 kelime) — yalnızca gerçekten gürültülü/kısık kayıtlarda deneyin
- **Çeviride ikinci geçiş** — isteğe bağlı "gözden geçir ve iyileştir" adımı: model kendi çevirisini kaynakla yan yana görüp yalnızca hatalı blokları düzeltir (anlam hatası, birebir çeviri kokan ifade, terim tutarsızlığı, süreye sığmayan uzunluk). Doğru olana dokunmaz; ikinci geçiş çökerse birinci geçişin çevirisi korunur
- **Çeviri (uygulama içinde)** — altyazıyı hedef dile çevirir; kaynak dosya korunur, çeviri `<ad>.tr.srt` olarak ayrı yazılır. Bloklar ve zaman damgaları birebir aynı kalır (blok eklenmez/silinmez). Anlam-öncelikli çeviri, blok süresine göre karakter bütçesi (CPS), sözlükteki özel isimlerin korunması, içerik türüne göre üslup (belgesel/dram/komedi/aksiyon) ve küfür seviyesi seçimi. **shuaiapi** rotaları hazır tanımlı — biri tıkanırsa diğerine otomatik geçer; OpenAI/DeepSeek/OpenRouter veya özel endpoint de kullanılabilir
- **LLM düzeltmede sözlük desteği** — sözlükteki özel isimler LLM'e de iletilir, yanlış duyulmuş yazımlar düzeltilir
- **Hazır ayar profilleri** — ⚡ Hızlı (turbo+batched), ⚖️ Dengeli (turbo), 💎 En iyi kalite (large-v3) tek tıkla; elle değişiklik yapınca "Özel"e döner
- **Ayarlar otomatik kaydedilir** — model, dil, çıktı klasörü, profil ve gelişmiş ayarlar bir sonraki açılışta geri yüklenir
- **Açılış ortam kontrolü** — GPU adı rozette görünür; venv/ffmpeg eksikse günlükte uyarır
- **Dosya adına dil kodu** — isteğe bağlı `video.tr.srt` biçimi (oynatıcılar dil etiketiyle otomatik yükler)
- **Önizlemeyi panoya kopyala** — segmentleri SRT biçiminde kopyala (arama filtresi uygulanır)
- **Önizlemede düzenleme** — segment metnini kaydetmeden önce çift tıkla düzelt; kopyala/JSON yeniden-üret düzeltilmiş metni kullanır
- **JSON'dan yeniden üret** — mevcut JSON çıktısından SRT/VTT/TXT/ASS'yi yeniden transkripsiyon yapmadan saniyeler içinde yaz
- **Sözlük artık tüm video boyunca etkili** — sözlükteki özel isimler (`Kombai`, `Sanhuber`…) Whisper'a her çözümleme penceresinde yeniden verilir. Önceden yalnızca ilk 30 saniyede etkiliydi
- **Bozuk Türkçe karakter onarımı** — dışarıdan gelen altyazılar (senkron aracı ve oynatıcı) kodlaması tespit edilerek okunur: UTF-8, cp1254 (eski Türkçe Windows), çift kodlanmış UTF-8 (`Ã§ocuk`) ve latin-1 okunmuş cp1254 (`þeyler`) otomatik düzeltilir. İzlandaca/İspanyolca gibi `þ ð ý á é` kullanan metinlere dokunulmaz
- **ASS/SSA okuma** — oynatıcı `.ass`/`.ssa` altyazıları da açar (biçim etiketleri temizlenir, `\\N` satır sonu çevrilir)
- **Altyazıyı sürükleyerek konumlandırma** — altyazıya basılı tutup yukarı/aşağı sürükle; letterbox bandından kurtulup görüntünün içine alabilirsin. Konum yüzde olarak saklandığı için pencere boyutu değişse de tam ekrana geçsen de aynı yerde durur. Sürüklemeden tıklamak oynat/duraklat, çift tıklamak düzenleyiciyi açar
- **Konuşma başlangıcına yaslama** — Whisper'ın zaman damgaları cümle başında sessizliğin içine taşar, bu da "altyazı sesten önce geliyor" hissi verir. Ölçüm (Going Tribal klibi, large-v3-turbo): 29 bloğun 15'i gerçek konuşmadan önce başlıyordu — ortalama **448 ms**, en fazla **920 ms**. Bu seçenek yalnızca sessizliğe denk gelen başlangıçları Silero VAD ile ileri alır: **15 → 0**. Metin, blok sayısı ve bitişler korunur; en fazla 1 sn kaydırır ve bloğu kısaltacaksa dokunmaz
- **Bağlamlı çeviri** — her blok çevrilirken öncesindeki ve sonrasındaki satırlar da modele gösterilir (çevrilmez, yalnızca bağlam). Türkçede **sen/siz** seçimi, cinsiyet, kime hitap edildiği ve devam eden cümleler için belirleyicidir. Varsayılan 4 satır; **Film ön ayarında 6**; istenirse kapatılabilir
- **Okuma modu (çift dilli akan altyazı)** — sağ panel artık ayar sütunu değil, kalıcı bir okuma alanı: video solda, kaynak ve çeviri satırları **aynı kartta** sağda akar. Aktif satır panelin ortasında tutulur; elle kaydırırsan takip durur ve **"Aktif satıra dön"** düğmesi çıkar. Üç görünüm: **Sinema** (yalnızca video), **Okuma**, **Çalışma** (geniş panel, büyük yazı). Panel genişliği sürüklenerek ayarlanır ve hatırlanır
- **Cümle araçları** — panelin altında önceki/tekrar/sonraki, blok sonunda duraklat, takip, kaynağı/çeviriyi gizle; aramada eşleşen kelimeler kartlarda vurgulanır
- **Oynatıcıdan altyazı oluşturma** — açık videoyu oynatıcıdan bırakmadan transkribe et; ilerleme sağ panelde görünür, biten altyazı (ve varsa çevirisi) kendiliğinden yüklenir
- **Altyazı kaynağı görünür** — panelde altyazının nereden geldiği yazar: YouTube · Whisper · Dosya. (Whisper yalnızca **sesi** dinler; görüntüye basılmış yazıyı okumaz — oyun içi yazılar için OCR gerekir)
- **Altyazı kendiliğinden gelir** — video açınca yanındaki altyazılar (`film.srt`, `film.tr.srt`, `film.en.vtt`, `film.ass`) bulunup listeye eklenir ve ilki otomatik yüklenir
- **YouTube bölümleri** — videonun bölüm başlıkları panelde listelenir, seçince o ana atlar; zaman çubuğunda da işaret olarak görünür
- **YouTube'un hazır altyazısı** — elle yazılmış veya otomatik altyazı tek tuşla indirilir (SRT'ye çevrilir). Ekranda altyazı varsa ikinci altyazı olarak yüklenir — kendi çıktınla yan yana karşılaştırırsın
- **Gecikmeyi dosyaya işle** — kaydırıcıyla senkronu bulduktan sonra tek tuşla altyazı dosyasına kalıcı yazılır
- **Tam ekranda da kontroller** — oynatma çubuğu artık video sahnesinin içinde: tam ekranda kaybolmuyor, fare 2,5 saniye durunca kendi kendine gizleniyor (altyazı da çubuğun üstüne çıkıyor)
- **Kaldığın yerden devam** — uzun filmde nerede bıraktığın hatırlanır; videoyu tekrar açınca "Devam et" rozeti çıkar (otomatik atlamaz). Son 60 saniyeye gelindiyse kayıt silinir
- **Oynatma hızı** — 0,5×–2× (belgesellerde 1,25×, ağır aksanda 0,75×)
- **Zaman çubuğunda önizleme** — imleci çubuğa götürünce o andaki zaman *ve o anda ne söylendiği* balonda görünür; altyazıda arama yapınca eşleşmeler çubukta sarı işaret olarak belirir
- **Altyazı listesi & blok gezinme** — oynatıcıda tüm bloklar listelenir; tıklayınca o ana atlar, aktif blok vurgulanıp kendiliğinden kaydırılır, metinde anlık arama yapılır. Klavyeyle blok blok gezinme (A/D), bloğu tekrar oynatma (R), satırı kopyalama (C) ve her blok sonunda otomatik duraklatma — uzun filmde altyazı denetimini hızlandırır
- **Çift altyazı & izlerken düzeltme** — kaynak ve çeviri aynı anda gösterilebilir (çeviriyi izlerken kontrol etmenin en hızlı yolu); altyazıya çift tıklayıp (veya E tuşu) o bloğu düzeltip kaydedebilirsin, ilk kaydetmede .bak yedeği alınır
- **YouTube'u indirmeden izleme (1080p'ye kadar)** — YouTube'un HLS manifesti kullanılır: tüm çözünürlükler + ses tek akışta, ileri-geri sarma çalışır, dosya indirilmez. Kalite oynatırken değiştirilebilir (Otomatik veya sabit). Manifest yoksa veya akış hata verirse indirme yolu her zaman yedekte
- **Uygulama içi oynatıcı** — videoyu kendi altyazılarınla izle: yerel dosya veya YouTube linki. YouTube'da kalite (1080p'ye kadar) ve — video dublajlıysa — ses dili seçilir; video indirilip birleştirilerek oynatılır. Altyazı video üstünde çizilir (yazı boyutu ve gecikme ayarlanabilir), tam ekran ve klavye kısayolları (boşluk, ok tuşları, F, Esc) desteklenir
- **Zaman kaydırma & videoya gömme** — sonuç ekranından SRT/VTT'yi global olarak kaydır veya altyazıyı videoya göm (ffmpeg burn-in)
- **Kalıcı iş günlükleri** — her iş `%APPDATA%/whisper-altyazi/logs` altına ayrı dosyaya yazılır (ayarlar, aşamalar, kalite raporu, uyarılar, hata izleri); Günlük panelindeki "Kayıtlı günlükler" ile açılır, en yeni 100 dosya tutulur
- **Kuyruk uyarı özeti** — toplu işlem bitince hangi dosyaların elle kontrol istediği (alfabe karışması, şüpheli zaman damgası, noktalama uyarısı) tek listede özetlenir
- **Kuyruk: "sırada dur"** — çalışan işi kesmeden kuyruğu mevcut iş bitince durdur
- **Ayar dışa/içe aktarma** — tüm yapılandırmayı dosyaya kaydet/yükle (içerik türü profilleri)
- **VRAM uyarısı** — seçili model+compute+diarization GPU belleğini aşacaksa rozette önceden uyarır
- **Aşama süreleri** — her işlem aşamasının (model yükleme, transkripsiyon, yazma) süresi ilerleme listesinde görünür
- **Erişilebilirlik** — klavyeyle gezinme (drop-zone, odak halkaları), ekran okuyucu için aria-live bölgeler
- **Klavye kısayolları** — Ctrl+Enter ile başlat, Esc ile iptal
- **Sistem bildirimi** — pencere arka plandayken iş/kuyruk bitince bildirim + pencere vurgusu
- **Görev çubuğu ilerlemesi** — işin yüzdesi Windows görev çubuğu simgesinde görünür
- **Uyku engelleme** — iş çalışırken sistem uykuya geçmez (uzun videolar yarıda kalmaz)
- **Link sürükle-bırak** — tarayıcıdan YouTube linkini doğrudan pencereye bırak
- **BOM'lu SRT/ASS çıktısı** — Windows oynatıcılarında Türkçe karakter sorunu yaşanmaz
- Modern, koyu temalı arayüz

## Kurulum

Gereksinimler:
- Windows 10/11
- Python 3.10 veya 3.11
- Node.js 18+
- NVIDIA CUDA destekli GPU (RTX 4070 Ti önerilen)
- ffmpeg (PATH'de veya `backend/bin/` içinde)

Kurulum için:

```
install.bat
```

Bu script otomatik olarak:
1. Python sanal ortamı oluşturur
2. PyTorch CUDA 12.1 + faster-whisper + yt-dlp yükler
3. Electron'u kurar

## Kullanım

```
start.bat
```

1. Bir dosya seç veya YouTube linki yapıştır
2. Model ve dili seç (varsayılan: `large-v3`, otomatik dil)
3. **Altyazıyı Çıkar** düğmesine bas
4. Çıktı, video ile aynı klasöre kaydedilir (veya seçtiğin klasöre)

## Önerilen Ayarlar (4070 Ti)

| Ayar | Değer | Neden |
|------|-------|-------|
| Model | `large-v3` | En yüksek kalite, 12GB VRAM rahat kaldırır |
| Compute type | `float16` | 5-6× hızlanma, kalite kaybı yok |
| Beam size | 5 | Hız/kalite dengesi |
| VAD filter | Açık | Halüsinasyonları azaltır |
| Akıllı bölme | Açık | Daha okunabilir altyazılar |

Daha hızlı sonuç için `large-v3-turbo` (2-5× hızlı, large-v2 kalitesinde).

## Motor Seçimi

Ayarlar'daki **Motor** menüsünden transkripsiyon arka ucunu seçebilirsin:

| Motor | Ne zaman | Notlar |
|-------|----------|--------|
| **faster-whisper** | Varsayılan, dengeli | Mevcut tüm decoding/VAD ayarları geçerli |
| **faster-whisper · batched** | Uzun videolar, hız önceliği | VAD tabanlı batching ile çok daha hızlı; `Batch boyutu` ayarı geçerli (conditioning kapalı) |
| **WhisperX** | Hassas kelime zaman damgası gereken işler | wav2vec2 zorunlu hizalama ile <100ms kelime hizası. Kurulum: `install-whisperx.bat` |

Notlar:
- **Batch boyutu** yalnızca batched ve WhisperX modlarında etkilidir (VRAM'e göre 8–16 iyi başlangıç).
- **Sözlük / başlangıç ipucu** faster-whisper (sıralı/batched) modlarında uygulanır.
- **Konuşmacı tanıma** her motorda aynı (pyannote) yolla çalışır; `install-diarize.bat` gerekir.
- WhisperX ilk seçimde model + dile özel hizalama modelini indirir; hizalama desteklenmeyen dilde otomatik olarak segment-seviyesine düşer.

## Sorun giderme

**`cublas` / `cudnn` hatası, model GPU'da yüklenemiyor**
Uygulamayı `start.bat` ile başlatın. `npm start` tek başına yetmez: faster-whisper'ın
cuDNN/cuBLAS DLL'leri `start.bat` tarafından PATH'e eklenir. Sorun sürerse
`install.bat`'i tekrar çalıştırın veya Gelişmiş ayarlar'dan Cihaz=CPU / Hesaplama
tipi=int8 deneyin.

**YouTube indirmesi başarısız oluyor**
YouTube sık sık indirici arayüzünü değiştirir. Ayarlar'daki **yt-dlp'yi güncelle**
düğmesi çoğu hatayı çözer. `js_runtimes` için Node gerekir (zaten kuruludur).

**Zaman aralığı seçtim, indirme uzun sürüyor**
Aralık seçilse bile videonun **sesinin tamamı** inip aralık yerelde kesilir. Sebep
ölçümle bulundu: aralıklı indirmede yt-dlp ffmpeg'e düşüyor ve YouTube o okumayı
~12 KB/sn'ye boğazlıyor. 8 saatlik bir videodan 1 saat 55 dakikalık aralık:
aralıklı indirmeyle ~3 saat, tam ses indirip yerelde kesmekle **102 saniye**.
Karşılığında birkaç yüz MB'lık ses geçici klasöre iner.

**VRAM yetmiyor (OOM)**
12 GB'da `large-v3` + konuşmacı tanıma sınırda olabilir. Uygulama modeli
diarization öncesi bellekten boşaltır; yine de sorun olursa `large-v3-turbo`
kullanın veya batch boyutunu düşürün. Rozet, iş başlamadan tahmini VRAM'i gösterir.

**Altyazıda Türkçe karakterler bozuk (`þeyler`, `Ã§ocuk`)**
Bu, dışarıdan gelen dosyalarda olur; uygulama kendi çıktısını UTF-8 BOM ile yazar.
Oynatıcı ve senkron aracı bozuk kodlamayı otomatik tespit edip onarır.

**Sonuç noktalamasız, küçük harfli akıp gidiyor**
Uzun videolarda Whisper'ın bilinen davranışı. Film ön ayarında
`condition_on_previous` kapalıdır ve "noktalama çöküşü onarımı" açıktır: bozulan
bölüm bağlam sıfırlanarak yeniden çevrilir, yalnızca gerçekten iyileşirse kullanılır.

## Gizlilik ve veriler

- **Transkripsiyon tamamen yereldir.** Ses ve video hiçbir sunucuya gönderilmez.
- **İnternete çıkılan tek yerler:** YouTube indirme/izleme (yt-dlp), ilk kullanımda
  model indirme (Hugging Face) ve **yalnızca siz açarsanız** LLM düzeltme / çeviri.
- LLM düzeltme veya çeviri açıkken **altyazı metni** seçtiğiniz API sağlayıcısına
  gönderilir. Bu özellikler varsayılan olarak kapalıdır.
- API anahtarları ve HF token `%APPDATA%/whisper-altyazi/settings.json` içinde
  **düz metin** olarak saklanır. Anahtarlar komut satırına (argv) hiçbir zaman
  yazılmaz — ortam değişkeniyle geçer, böylece süreç listesinde ve iş
  günlüklerinde görünmezler.
- İş günlükleri `%APPDATA%/whisper-altyazi/logs/` altındadır ve eskiler otomatik
  temizlenir.

## Geliştirme

```bash
npm test        # Node testleri + Python testleri
npm run dev     # DevTools açık (yine de cuDNN PATH'i için start.bat ortamı gerekir)
```

Testler GPU, model indirmesi veya ağ gerektirmez. Mimari, sözleşmeler ve
"buraya dokunma" notları için `CLAUDE.md`, katkı akışı için `CONTRIBUTING.md`.

## Lisans

MIT — bkz. [LICENSE](LICENSE).

Bu proje şu açık kaynak projeleri kullanır: [faster-whisper](https://github.com/SYSTRAN/faster-whisper)
(MIT), [OpenAI Whisper](https://github.com/openai/whisper) modelleri (MIT),
[yt-dlp](https://github.com/yt-dlp/yt-dlp) (Unlicense),
[hls.js](https://github.com/video-dev/hls.js) (Apache-2.0, `src/renderer/vendor/`
içinde birlikte dağıtılır), [Electron](https://github.com/electron/electron) (MIT),
opsiyonel olarak [WhisperX](https://github.com/m-bain/whisperX) ve
[pyannote.audio](https://github.com/pyannote/pyannote-audio).

Telif hakkıyla korunan içerikten altyazı çıkarırken bulunduğunuz ülkenin
mevzuatına ve ilgili platformun kullanım şartlarına uymak sizin sorumluluğunuzdadır.
