# Whisper Altyazı — GitHub benzer projeler araştırması ve ürün stratejisi

**Tarih:** 1 Eylül 2026
**Kapsam:** Genel uygulama; ağırlık tarayıcı/izleme çalışma alanında
**Çalışma biçimi:** Salt araştırma ve rapor. Uygulama koduna dokunulmadı, test paketi çalıştırılmadı.

## Kısa karar

Bu proje artık yalnızca “Whisper için masaüstü arayüzü” değil. Mevcut çalışma ağacında yerel GPU transkripsiyonu, kalite onarımı, bağlamlı çeviri, çift altyazı, güçlü bir yerel/YouTube oynatıcısı, izleme kütüphanesi ve üç ayrı yoldan web altyazısı yakalayan Widevine uyumlu bir tarayıcı aynı üründe birleşmiş durumda. Araştırdığım projelerin çoğu bu zincirin yalnızca bir parçasını iyi yapıyor.

Bu nedenle doğru yön, başka projelerde görülen her özelliği eklemek değil. En güçlü ürün tezi şu:

> **Whisper Altyazı, herhangi bir videoyu bulduğun, izlediğin, altyazısını yakaladığın/ürettiğin, anında çevirdiğin ve daha sonra cümle düzeyinde geri bulduğun yerel bir “izleme çalışma alanı” olmalı.**

Öncelik sıram:

1. Tarayıcı oturumunu ve medya kimliğini kalıcı hâle getirmek.
2. Dosyanın tamamını bekleyen çeviri yerine oynatma kafasının önünde çalışan cümle tabanlı çeviri zamanlayıcısı kurmak.
3. “Altyazıyı nereden bulacağım?” sorusunu görünür bir edinme merdivenine dönüştürmek; servis adaptörlerini ölçülebilir hâle getirmek.
4. Bunları eklemeden önce tarayıcı kodunu süreç/servis sınırlarına ayırmak ve görünmezken çalışan pahalı döngüleri durdurmak.
5. İzlenen içeriği alıntı, not, kelime, klip ve zaman bağlantılarıyla kalıcı bilgiye dönüştürmek.

Canlı sistem sesi Whisper ve görüntüye gömülü altyazı OCR’ı değerli, fakat ilk dalga değildir. Bunlar, yukarıdaki temel oturduktan sonra devreye girmelidir.

## Araştırma kapsamı ve yöntem

Araştırma “en çok yıldızlı on projeyi okuyup özellik listesi çıkarma” biçiminde yapılmadı.

- GitHub REST aramasıyla 10 ayrı sorgu ailesi kullanıldı: `whisper subtitle`, `faster-whisper GUI`, `subtitle editor`, `dual subtitles`, `browser subtitle`, `subtitle translation extension`, `yt-dlp GUI`, `live captions translation`, `language learning video player`, `AI video transcript player`.
- Arşivlenmiş depolar sorgu aşamasında dışarıda bırakıldı. İlk sonuç 433 benzersiz adaydı.
- Fork, konu dışı eşleşme, yalnızca veri/ders deposu ve aynı kodun belirgin kopyaları ayıklandı.
- Son karşılaştırma kümesi **180 depo**: 38 ASR/altyazı üretimi, 36 editör/senkron/OCR, 30 oynatıcı/çift altyazı/dil öğrenme, 34 tarayıcı/canlı çeviri, 42 indirme/arşiv/kütüphane/AI bilgi aracı.
- **38 çekirdek proje** için README, kullanıcı akışı, mimari açıklama ve uygun olduğunda test/doğrulama yaklaşımı derin okundu. Kalan 142 depo özellik, teknoloji, lisans ve ürün konumu bakımından tarandı.
- Yıldız sayıları yalnızca keşif sinyali olarak kullanıldı; kalite puanı sayılmadı. Örneğin sıfır yıldızlı ama iyi tanımlanmış bir transcript editörünün fikri, yüzlerce yıldızlı sıradan bir yt-dlp kabuğundan daha yararlı olabilir.
- GitHub araştırması, giriş yapılmış Netflix/Disney+/Max benzeri servislerde canlı uyumluluk testi değildir. Servis davranışları için ayrıca gerçek cihaz matrisi gerekir.

Derin okunan 38 çekirdek: [Buzz](https://github.com/chidiwilliams/buzz), [Whishper](https://github.com/pluja/whishper), [VideoCaptioner](https://github.com/WEIFENG2333/VideoCaptioner), [Whisper-WebUI](https://github.com/jhj0517/Whisper-WebUI), [whisperer](https://github.com/hclivess/whisperer), [WhisperJAV](https://github.com/meizhong986/WhisperJAV), [TranscriptionSuite](https://github.com/homelab-00/TranscriptionSuite), [WhisperSubTranslate](https://github.com/Blue-B/WhisperSubTranslate), [local-whisper](https://github.com/neromorph/local-whisper), [Subtitle Edit](https://github.com/SubtitleEdit/subtitleedit), [LLPlayer](https://github.com/umlx5h/LLPlayer), [asbplayer](https://github.com/asbplayer/asbplayer), [yt-dual-subs](https://github.com/Gythiro/yt-dual-subs), [BelliedMonkey Translator](https://github.com/belliedmonkey/belliedmonkey-translator), [DualSub Replay](https://github.com/hoangkien1703/dual-sub-replay), [SuViPlayer](https://github.com/ahmedismailc/SuViPlayer), [Avorythm](https://github.com/msmahdinejad/avorythm), [podstr](https://github.com/aveleazer/podstr), [yt-dlp](https://github.com/yt-dlp/yt-dlp), [Tube Archivist](https://github.com/tubearchivist/tubearchivist), [Pinchflat](https://github.com/kieraneglin/pinchflat), [MeTube](https://github.com/alexta69/metube), [Tartube](https://github.com/axcore/tartube), [youwee](https://github.com/vanloctech/youwee), [subgen](https://github.com/McCloudS/subgen), [Bazarr](https://github.com/morpheus65535/bazarr), [VideoSubFinder](https://github.com/SWHL/VideoSubFinder), [videocr](https://github.com/apm1467/videocr), [yt-transcript-studio](https://github.com/krishnakanthb13/yt-transcript-studio), [simple-transcriber](https://github.com/jcddc83/simple-transcriber), [trove](https://github.com/afk1997/trove), [yt-summariser](https://github.com/vaibhavhaldia/yt-summariser), [ytldr](https://github.com/BWsix/ytldr), [mediabrief](https://github.com/EvilIrving/mediabrief), [qwen-video-chapters](https://github.com/backblaze-b2-samples/qwen-video-chapters), [quipclipper](https://github.com/weckere/quipclipper), [smart-video-summarizer](https://github.com/negeaki/smart-video-summarizer) ve [learncache](https://github.com/paolodit/learncache).

## Mevcut ürünün gerçek başlangıç noktası

Rapor, README iddialarını doğrudan doğru kabul etmedi; mevcut kirli çalışma ağacındaki kod da okundu. Tarayıcı alanındaki henüz commit edilmemiş değişiklikler “mevcut çalışma” sayıldı ve hiçbirine dokunulmadı.

| Alan | Mevcut durum | Karar |
|---|---|---|
| Yerel ASR | faster-whisper, batched ve WhisperX; VAD, kelime zamanları, kalite uyarıları, noktalama çöküşü onarımı, konuşma başlangıcına yaslama | Rakiplerin çoğundan ileri. Yeni motor eklemek tek başına öncelik değil. |
| Çeviri | Bağlam, sözlük, içerik türü, CPS bütçesi, ikinci geçiş, değişen blok önbelleği | Dosya çevirisinde güçlü; web izlerken gecikmesiz/parçalı zamanlayıcı eksik. |
| Yerel/YouTube oynatıcı | Çift altyazı, Sinema/Okuma/Çalışma, A-B, otomatik duraklatma, arama işaretleri, kare adımı, ekran görüntüsü, AI bağlamı | Dil öğrenme oynatıcılarının çoğuyla aynı sınıfta; tekrar tasarlamak gereksiz. |
| Web tarayıcısı | Kalıcı Chromium profili; çok sekme; Netflix, Disney+, Max, Discovery+, Hulu, YouTube adaptörleri; CDP ağ gövdesi + sayfa fetch/XHR + TextTrack; HLS/DASH, TTML/VTT/SRT/JSON3/srv3/MP4 altyazı ayrıştırma; teşhis ve URL sansürleme | Çok güçlü başlangıç. Asıl ihtiyaç süreklilik, adaptör ölçeği ve ölçülebilir uyumluluk. |
| Sekme çalışma alanı | Sekme başına cue/iz/zaman/tercih bellekte korunuyor; `tabId + generation` kapısı eski olayları ayıklıyor | Aynı süreç içinde iyi; uygulama kapanınca yalnızca son URL kalıyor, tam oturum geri gelmiyor. |
| İzleme kütüphanesi | 1000 medya kaydı, kaldığın yer, tercihler, koleksiyonlar ve altyazı dosyalarında cümle araması | Beklenenden ileride. Fakat URL temelli kimlik ve doğrusal JSON/dosya taraması büyüme sınırı. |
| Editör | Satır içi düzeltme, `.bak`, dalga biçimi/zaman çizgisi ve zaman kaydırma | Temel denetim güçlü; gerçek undo/redo, değişiklik günlüğü ve tek kanonik belge modeli geliştirilebilir. |
| Gizlilik | Transkripsiyon yerel; yakalama teşhisinde hassas URL parametreleri sansürlü | API/HF anahtarları hâlâ `settings.json` içinde düz metin; düzeltilmesi gereken net borç. |
| Mimari ölçek | Tarayıcı yardımcı modülleri ayrılmaya başlamış | `main.js` 3.722 satır/174 KB, `renderer.js` 8.276 satır/360 KB. Yeni tarayıcı özellikleri doğrudan bu iki dosyaya yığılmamalı. |

Mevcut koddan doğrulanan kritik ayrıntılar:

- `persist:whisper-browser` sayesinde çerezler ve site verileri kalıcı; bu zaten var.
- `browserTabs` ana süreçte bir `Map`; uygulama kapanırken tüm sekmeler yok ediliyor. Renderer yalnızca `playerBrowserLastUrl` saklıyor. Yani “profil kalıcı” ile “izleme oturumu kalıcı” aynı şey değil.
- Sekme içi çalışma alanı; bulunan izler, cue’lar, ikinci altyazı, oynatma zamanı ve offset dâhil süreç içinde saklanıyor. Bu iyi tasarım korunmalı.
- Web altyazısını çevir düğmesi, izi önce 1,2 saniye sessiz/kararlı olana kadar bekliyor, sonra dosya olarak yüklüyor ve mevcut tam-dosya çevirisini tetikliyor. Oynatma kafasının önünde sürekli çalışan çeviri kuyruğu henüz yok.
- İzleme kütüphanesi altyazı dosyalarını gerçekten arıyor; “transcript araması ekleyin” demek yanlış olur. Doğru geliştirme, mevcut aramayı kalıcı web cue varlıkları ve FTS indeksine yükseltmektir.
- Tarayıcı overlay’i her animasyon karesinde bütün DOM’u ve açık shadow root’ları `querySelectorAll('*')` ile tarıyor. Overlay kapalıyken bile döngü yaşamaya devam ediyor. Bu, özellik eklemeden önce ele alınması gereken ölçülebilir bir yaşam döngüsü/perf borcu.
- Yerel medya `ffprobe` işlemi yalnızca ses akışlarını listeliyor. Gömülü metin/PGS altyazı izleri birinci sınıf kaynak olarak henüz çıkarılmıyor.
- README, API/HF anahtarlarının düz metin saklandığını açıkça belirtiyor; bu yalnızca varsayım değil.

## GitHub ekosisteminden çıkan esas dersler

### 1. En iyi projeler altyazıyı dosya değil, oynatma çevresinde yaşayan veri olarak görüyor

[LLPlayer](https://github.com/umlx5h/LLPlayer), [asbplayer](https://github.com/asbplayer/asbplayer), [DualSub Replay](https://github.com/hoangkien1703/dual-sub-replay) ve [SuViPlayer](https://github.com/ahmedismailc/SuViPlayer) arasında ortak bir çizgi var:

- Cue tıklamak yalnızca seçmek değil, cümleyi tekrar oynatmak demek.
- Altyazısız bölge normal hız, hızlandırma veya atlama politikasına bağlanabiliyor.
- Cümle sonunda duraklatma, “repeat after me” ve shadowing ayrı izleme kipleri.
- Kaydedilen kelime/cümle yalnız çıplak metin değil; bağlam, zaman, kaynak ve tekrar bağlantısı taşıyor.
- Bilinen/bilinmeyen kelimeler işaretlenip videonun anlaşılabilirlik haritasına dönüşebiliyor.

Bizde bunların önemli kısmı zaten var: cümle sonunda duraklatma, A-B, cue gezintisi, kaydedilen kelimeler/cümleler ve çift dil. Eksik parça, bunları medya kimliğine bağlı kalıcı “öğrenme varlığına” dönüştürmek.

### 2. Web çevirisinde en iyi gecikme çözümü daha hızlı model değil, doğru zamanlayıcı

[BelliedMonkey Translator](https://github.com/belliedmonkey/belliedmonkey-translator) tam transkripti bir kez alıp parçaları gerçek cümlelere birleştiriyor ve oynatma kafasının 60 saniye önünde çeviriyor. [yt-dual-subs](https://github.com/Gythiro/yt-dual-subs) benzer şekilde cümle yeniden kurma ve ön-getirme yapıyor. Sonuç:

- Model 1–3 saniye sürse bile kullanıcı gecikmeyi görmüyor.
- Kelime kelime titreyen çeviri yerine bütün cümle geliyor.
- Oynatma hareketi çeviri kuyruğunun önceliğini belirliyor.
- Aynı cue’lar ikinci kez ücret oluşturmuyor.

Bizde güçlü bağlamlı çeviri ve cache zaten var. Yeni bir çeviri motorundan önce gereken, bunları web oynatımına uygun bir zamanlayıcıyla kullanmak.

### 3. Servis desteği “adaptör var/yok” değil, tarihli yetenek matrisi olmalı

[podstr](https://github.com/aveleazer/podstr) YouTube dışında BBC iPlayer, RaiPlay, ARTE, Plex ve başka kaynaklarda HLS/VTT/TTML yollarını açıkça belgeliyor. [yt-dlp](https://github.com/yt-dlp/yt-dlp) binlerce sitenin sürekli kırılabildiği gerçeğini eklenti/çıkarıcı katmanıyla yönetiyor. Güçlü yaklaşım:

- Genel motor: TextTrack, HLS, DASH, VTT, TTML, MP4 timed text.
- İnce servis tarifi: alan adları, yanıt ipuçları, oynatıcı yardım metni, medya kimliği çıkarıcı.
- “Destekli” yerine yetenekler: giriş, oynatma, altyazı algılama, tam ekran overlay, iki dil, çeviri, son doğrulama tarihi.
- Gerçek ağ içeriğini saklamayan, sansürlü yeniden oynatma fixture’ları.

Mevcut altı adaptör iyi bir başlangıç; fakat aynı dosyada regex büyütmek sürdürülebilir değil.

### 4. Altyazı edinme tek yöntem değil, sıraya sokulmuş bir merdiven

Araştırmada dört ayrı dünya aynı soruna farklı kaynaklardan yaklaşıyor:

- [LLPlayer](https://github.com/umlx5h/LLPlayer): mevcut metin/bitmap altyazı, çevrimiçi arama, gerçek zamanlı ASR ve OCR.
- [subgen](https://github.com/McCloudS/subgen) ve [Bazarr](https://github.com/morpheus65535/bazarr): eksik veya senkronsuz altyazıyı algılayıp tamamlama/yükseltme.
- [VideoSubFinder](https://github.com/SWHL/VideoSubFinder) ve [videocr](https://github.com/apm1467/videocr): görüntüye basılmış altyazıyı bölge/zaman temelli OCR için hazırlama.
- [WhisperLiveKit](https://github.com/QuentinFuxa/WhisperLiveKit) ve canlı caption projeleri: hiçbir metin izi yoksa sesi gerçek zamanda yazıya çevirme.

Üründe bu sıra görünür olmalı: **hazır web izi → gömülü/yan dosya → daha önce saklanan iz → ses ASR → seçili alan OCR**. Kullanıcı neden hangi basamakta olduğunu görmeli.

### 5. Transkript, geçici bir çıktı değil kalıcı bir belge olduğunda ürün değeri katlanıyor

[simple-transcriber](https://github.com/jcddc83/simple-transcriber), [trove](https://github.com/afk1997/trove) ve [yt-transcript-studio](https://github.com/krishnakanthb13/yt-transcript-studio) şu ortak özellikleri gösteriyor:

- Kelime/cümle zamanına tıklayıp videoya dönme.
- Başlık/speaker/metin düzeltme; paragraf bölme/birleştirme.
- Undo/redo ve atomik otomatik kayıt.
- Alıntı, yer imi, vurgu ve not.
- Bütün kütüphanede tam metin araması.
- Seçili cümle için zaman bağlantısı ve farklı dışa aktarma biçimleri.

Mevcut okuma paneli bunun için güçlü bir yüzey. Yeni ayrı bir “not uygulaması” kurmak yerine cue kartını kalıcı bilgi nesnesine yükseltmek daha doğru.

### 6. Tarayıcıdan kuyruğa/arşive köprü, ayrı bir indirici ekranından daha değerli

[youwee](https://github.com/vanloctech/youwee), [Tube Archivist](https://github.com/tubearchivist/tubearchivist), [Pinchflat](https://github.com/kieraneglin/pinchflat) ve [Tartube](https://github.com/axcore/tartube) sayfa/kanal/playlist bilgisini kurala, kuyruğa ve arşive dönüştürüyor. Bizim kullanım için tam medya sunucusu kurmak gereksiz; fakat tarayıcıda açık içerik için şunlar çok değerli:

- “Bu sayfayı transkripsiyon kuyruğuna ekle.”
- “Yalnız mevcut altyazıyı kaydet.”
- “A-B aralığını klip olarak dışa aktar.”
- “Bu kanal/playlist için yeni içerikleri klasör izleme kuyruğuna bağla.”

Bu köprü yalnız yt-dlp’nin izin verdiği açık kaynaklarda çalışmalı; DRM korumalı akışı indirme/çözme kapsam dışı kalmalı.

### 7. Motor çeşitliliği ancak aynı veriyle ölçülürse anlamlı

[TranscriptionSuite](https://github.com/homelab-00/TranscriptionSuite) WhisperX, whisper.cpp, NeMo, VibeVoice ve SenseVoice gibi arka uçları bir kayıt altında topluyor. [whisperer](https://github.com/hclivess/whisperer) yalnız şüpheli bölgeyi ikinci kez çözen çok geçişli doğrulama kullanıyor. [WhisperJAV](https://github.com/meizhong986/WhisperJAV) gürültü/uzun form bağlamında “her sesi körlemesine temizleme” yaklaşımının zarar verebileceğini gösteriyor.

Bizim için çıkarım:

- Yeni ASR ailesi eklemek, ancak aynı kullanıcı klibinde hız/VRAM/hata farkını kaydeden A-B benchmark ile yapılmalı.
- “Kalite modu”, yalnız düşük güvenli veya noktalaması çöken aralıkları yeniden çözmeli.
- UVR/Demucs benzeri konuşma ayırma varsayılan olmamalı; gerçek gürültülü corpus üzerinde kazanım şartı konmalı.

### 8. Güvenlik ve taşınabilirlik, özellik kadar ürün kalitesi

[WhisperSubTranslate](https://github.com/Blue-B/WhisperSubTranslate) API anahtarlarını OS güvenli deposunda saklıyor ve model indirmeyi kullanıcı için yönetiyor. [Avorythm](https://github.com/msmahdinejad/avorythm) da anahtarları işletim sistemi keyring’ine koyuyor. Bizde anahtarların argv’ye yazılmaması doğru; fakat diskte düz metin kalmaları ve ayar yedeğine istemeden girebilmeleri düzeltilmeli.

## Ürün hedefi: tarayıcıyı “İzleme Çalışma Alanı” yapmak

Hedef akış şöyle olmalı:

1. Kullanıcı serviste videoyu açar; giriş profili zaten korunur.
2. Uygulama sayfa URL’sinden mümkünse **kanonik medya kimliği** çıkarır: servis + dizi/film/video + bölüm kimliği.
3. Önceden izlendiyse konum, hız, ses, görünüm, kaynak/çeviri izi, offset, kaydedilmiş cümleler ve çeviri cache’i bulunur.
4. Caption edinme koordinatörü basamakları dener ve durumu açıkça gösterir.
5. Kaynak cue’lar geldikçe cümleler tamamlanır; çeviri zamanlayıcısı oynatma kafasının 60–120 saniye önünü doldurur.
6. Kullanıcı cue’a tıklayıp tekrar oynatır, not/kelime/alinti kaydeder veya A-B aralığını çıkarır.
7. Uygulama kapanıp açılsa bile sekmeler ve çalışma bağlamı geri gelir; medya kendiliğinden oynatılmaz, “devam et” bekler.
8. Daha sonra kütüphane aramasında bir cümle bulunduğunda doğru servis, doğru medya ve doğru zamana dönülür.

Bu akış, ürünün mevcut parçalarını birleştirir; ayrı ayrı on yeni panel eklemez.

## Öncelikli geliştirme listesi

Puanlar ürün etkisi içindir: 5 en yüksek. Efor göreli: S, M, L, XL.

| Sıra | Öneri | Etki | Efor | Neden şimdi? |
|---:|---|:---:|:---:|---|
| 1 | Kalıcı tarayıcı oturumu + kanonik medya kimliği | 5 | M/L | Kullanıcının en çok zaman geçireceği alan; mevcut sekme çalışma alanı süreç kapanınca kayboluyor. |
| 2 | Oynatma kafası önünde cümle tabanlı çeviri zamanlayıcısı | 5 | L | Mevcut çeviri kalitesini webde anlık hissettirir; yeni modele ihtiyaç duymadan büyük UX farkı. |
| 3 | Caption edinme merdiveni ve yetenek matrisi | 5 | L | “Neden altyazı yok?” sorusunu teşhis edilebilir ve servis ölçeklenebilir hâle getirir. |
| 4 | Tarayıcı servislerine modüler ayrışma ve olay sözleşmesi | 5 | L | 174 KB main + 360 KB renderer daha fazla browser özelliğini güvenle taşıyamaz. |
| 5 | API/HF anahtarlarını OS güvenli deposuna taşıma | 5 | S/M | Açık, doğrulanmış güvenlik borcu; veri göçü kontrollü yapılabilir. |
| 6 | Browser overlay/medya gözlem yaşam döngüsü düzeltmesi | 4 | M | Her karede tüm DOM/shadow DOM taraması uzun izleme oturumunda gereksiz maliyet. |
| 7 | Kalıcı web cue deposu + SQLite FTS kütüphane araması | 4 | M/L | Mevcut aramayı çöpe atmadan URL/temp dosya sınırını aşar; bütün içerik geri bulunur. |
| 8 | Cümle varlığı: alıntı, not, kelime, zaman bağlantısı, ekran/mini ses | 4 | M | Mevcut kaydetme ve okuma panelini gerçek çalışma aracına dönüştürür. |
| 9 | İzleme politikaları: normal / boşluğu hızlandır / boşluğu atla / shadowing | 4 | M | asbplayer/SuVi’nin en değerli öğrenme kalıbı; mevcut auto-pause ve A-B üzerine oturur. |
| 10 | Yerel medyadan gömülü altyazı izlerini çıkarma | 4 | M | Hazır kaliteli izi varken ASR çalıştırmayı önler; ses izi probunun doğal uzantısı. |
| 11 | Tarayıcıdan transkripsiyon/indirme/kırpma kuyruğuna köprü | 4 | M | İzleme ile üretim ekranı arasındaki kopukluğu giderir; mevcut yt-dlp altyapısını kullanır. |
| 12 | Cue editöründe undo/redo + kanonik belge/değişiklik günlüğü | 3 | M/L | `.bak` tek geri dönüş noktası; uzun düzeltme oturumu için yetersiz. |
| 13 | Kullanıcı tetiklemeli sekme/sistem sesi canlı Whisper yedeği | 4 | XL | Webde metin izi olmayan içerikleri kapsar; fakat ses yakalama, latency ve kaynak kullanımı zor. |
| 14 | Seçili alan/klip için görüntü altyazısı OCR | 3 | XL | Oyun/anime hard-sub için değerli; tam zamanlı tam-kare OCR varsayılan olmamalı. |
| 15 | Opsiyonel yerel çeviri motoru + eklenti yüzeyi | 3 | L/XL | Offline kullanım ve deneysel özellikleri çekirdekten ayırır; ilk dalga değil. |

## İlk sekiz önerinin uygulanabilir tasarımı

### 1. Kalıcı tarayıcı oturumu ve kanonik medya kimliği

Yeni `browser-session.json` yalnız hassas olmayan çalışma durumunu saklamalı:

- Sekme sırası, etkin sekme, URL, başlık, servis adaptörü.
- Kanonik `mediaId`; örneğin `youtube:VIDEO_ID`, `netflix:TITLE_ID`, genel durumda sansürlenmiş URL hash’i.
- Oynatma zamanı, hız, ses, görünüm, offset.
- Seçili kaynak/ikinci iz kimliği ve çeviri varlık kimliği.
- Kaydedilmiş cue/not/kelime referansları.

Saklanmaması gerekenler: çerez gövdesi, header, token’lı imzalı CDN URL’si, ağ yanıt gövdesi. Bunlar Chromium partition’ında veya kısa ömürlü capture belleğinde kalmalı.

Kapanışta atomik yazım; açılışta şema sürümü ve göç; bozuk dosyada temiz açılış + geri kazanılabilir `.bak` gerekir. Otomatik oynatma yapılmamalı. “Son oturumu geri yükle” gizlilik nedeniyle kapatılabilir olmalı.

**Kabul ölçütü:** Üç sekmeli bir oturum zorla kapatılıp yeniden açıldığında sıra, URL, etkin sekme, medya kimliği, konum, hız, offset ve iz seçimleri geri gelir; hiçbir eski `generation/mediaId` olayı yeni sayfaya uygulanmaz.

### 2. Cümle tabanlı web çeviri zamanlayıcısı

Yeni zamanlayıcı mevcut çeviri motorunun yerine geçmemeli; onun önüne oynatma odaklı bir planlayıcı konmalı.

- Kaynak cue’lar `sentenceId` altında birleştirilir; her cue’nun cümle içindeki karakter aralığı korunur.
- Öncelik penceresi: oynatma kafasının yaklaşık 15 saniye gerisi ile 90 saniye ilerisi.
- Seek 30 saniyeden fazla sapınca eski bekleyen işler iptal edilmezse bile düşük önceliğe atılır; yeni bölge öne alınır.
- Tamamlanan cümle çevirisi cue sınırlarına deterministik yeniden dağıtılır; kaynak cue kimliği/zamanı değişmez.
- Cache anahtarı; kaynak cümle hash’i + bağlam hash’i + hedef dil + model + üslup/sözlük sürümü olmalı.
- Kullanıcı isterse “tüm izi arka planda tamamla” diyebilmeli.
- UI, çevrilmiş süreyi ve tahmini kalan istek/maliyeti göstermeli.

**Kabul ölçütü:** Sıcak cache’te altyazı anında gelir; soğuk çevrimiçi sağlayıcıda p95 ilk görünür çeviri 5 saniyenin altında hedeflenir. İleri sarınca yeni bölge eski kuyruktan önce çevrilir. Aynı cümle aynı ayarlarla ikinci kez ücret doğurmaz. Kaynak/çeviri cue sayısı ve zaman kimlikleri izlenebilir kalır.

### 3. Caption edinme merdiveni ve servis matrisi

Tek bir “altyazı aranıyor” sinyali yerine kullanıcı şu basamakları görmeli:

1. Sayfanın native `TextTrack` izi.
2. CDP ağ yanıtı veya sayfa fetch/XHR yakalaması.
3. HLS/DASH manifest ve alt playlist/segment ayrıştırması.
4. Daha önce bu `mediaId` için saklanmış yerel iz.
5. Kullanıcının seçtiği yan/gömülü altyazı.
6. Kullanıcı onayıyla canlı ses ASR.
7. Kullanıcı onayıyla seçili video bölgesi OCR.

Adaptörün görevi genel parser’ı kopyalamak değil; `hosts`, `responseHints`, `canonicalMediaId`, `title/episode extractor`, yardım metni ve gerekirse küçük probe tarifleri vermek olmalı.

İlk genişleme sırası, kullanım değerine göre: Prime Video, Crunchyroll, BBC iPlayer/ARTE/RaiPlay, Plex/Stremio, Coursera/Udemy, Vimeo. Bölgesel erişim olmayan servisler “kod var” diye destekli sayılmamalı.

**Kabul ölçütü:** Her servis için `giriş / oynatma / caption algılama / iki iz / overlay / tam ekran / çeviri / son doğrulama tarihi` matrisi yayımlanır. Mevcut altı servis + ilk dört yeni servis, servis başına en az üç farklı içerik ve iki altyazı türüyle elle sınanır. Hata ekranı hangi basamağın neden başarısız olduğunu söyler; hassas URL parametresi göstermez.

### 4. Tarayıcı mimarisini aşamalı ayırma

Yeniden yazım veya React/Tauri geçişi önermiyorum. Mevcut CommonJS/Electron yapısı içinde küçük servis sınırları yeterli:

```text
src/browser/
  session-store.js
  adapter-registry.js
  media-controller.js
  overlay-controller.js
  capture/coordinator.js
  capture/parsers.js          <- mevcut browser-subtitles.js ayrıştırmaları
  translation-scheduler.js
  asset-store.js
  diagnostics.js

src/renderer/browser/
  workspace-state.js
  tabs-view.js
  tracks-view.js
  transcript-view.js
  learning-actions.js
```

Ana süreç IPC ve pencere yaşam döngüsünü; renderer yalnız DOM/state sunumunu taşımalı. Ortak olay zarfı:

```js
{
  type,
  tabId,
  generation,
  mediaId,
  acquisitionId,
  at,
  payload
}
```

Mevcut `BrowserTabEventGate` korunup `mediaId + acquisitionId` ile genişletilmeli. Böylece aynı sekmede SPA navigasyonu veya yeni bölüm açılması da eski capture olayından korunur.

**Kabul ölçütü:** Yeni bir servis adaptörü `main.js` veya renderer monolitine iş mantığı eklemeden kaydedilebilir. Aynı parser fixture’ı hem birim testte hem adaptör replay testinde kullanılabilir. IPC sözleşmesi tek yerde şemalanır.

### 5. Anahtarları güvenli depoya taşıma

Electron `safeStorage` ile:

- Mevcut düz metin değerler ilk açılışta şifrelenip ayrı secret store’a taşınmalı.
- Göç başarılı olmadan eski değer silinmemeli.
- Ayar dışa aktarmada secret’lar varsayılan olarak **dışarıda** kalmalı; açık bir “anahtarları da ekle” seçeneği gerekiyorsa risk uyarısı vermeli.
- Log, IPC hata nesnesi ve renderer state dump’ında anahtar maskelenmeli.
- `safeStorage` kullanılamıyorsa kullanıcıya açık durum gösterilmeli; sessizce düz metne düşülmemeli.

**Kabul ölçütü:** Göçten sonra `settings.json` ve normal ayar yedeğinde anahtarın düz metin parçası bulunmaz; çeviri/LLM işine secret yalnız çalıştırma anında aktarılır.

### 6. Overlay ve medya gözlem yaşam döngüsü

Her karede `document + bütün shadowRoot + bütün video` taramak yerine:

- İlk keşifte video öğesi bulunup cache’lenmeli.
- `MutationObserver` yalnız yeni medya/shadow host geldiğinde keşfi yenilemeli.
- `ResizeObserver`, `fullscreenchange`, `loadedmetadata`, `emptied` ve navigasyon olayları konum/medya değişimini yönetmeli.
- Cue çizimi `timeupdate`, `requestVideoFrameCallback` veya düşük frekanslı aktif döngüyle yapılmalı.
- Overlay `off`, sekme görünmez veya medya duraklatılmışken animasyon döngüsü durmalı.
- En büyük video seçimi ortak bir yardımcı olmalı; polling, TextTrack ve overlay farklı videoyu seçmemeli.

**Kabul ölçütü:** Overlay kapalı/gizli sekmede sürekli `requestAnimationFrame` ve doküman çapında tarama yoktur. Bir sayfa SPA ile videoyu değiştirdiğinde yeni öğe bulunur. 30 dakikalık izleme smoke testinde observer/döngü sayısı büyümez.

### 7. Kalıcı web cue varlığı ve FTS araması

Mevcut `watch-library.json` ve altyazı dosyası araması iyi bir MVP. Bir sonraki adım SQLite + FTS5 olabilir:

- `media`: kanonik kimlik, servis, başlık, bölüm, URL, süre, son konum.
- `track`: dil, tür, kaynak, hash, edinme yöntemi, created/updated.
- `cue`: sabit cue kimliği, başlangıç/bitiş, ham metin, normalize metin.
- `translation`: kaynak cümle/cue bağı, model/ayar/cache hash’i.
- `annotation`: not, alıntı, kelime, etiket, renk, screenshot/audio ref.
- `session`: izleme süresi ve tercihler.

JSON’dan tek seferlik göç ve dışa aktarılabilir yedek şart. Bu öneri mevcut kütüphaneyi kaldırmaz; veri katmanını değiştirir.

**Kabul ölçütü:** 100 bin cue’luk yerel fixture’da Türkçe büyük/küçük harf duyarlı olmayan arama 100 ms sınıfında kalır; sonuç doğru medya ve zamana deep-link verir. Web cue’ları temp dosya kaybolsa da aranabilir.

### 8. Cümle kartını kalıcı çalışma nesnesine dönüştürme

Okuma panelindeki her kartta tek bir “kaydet” yerine türleri ayrıştırmak yeterli:

- **Alıntı:** kaynak + çeviri + zaman + başlık + servis bağlantısı.
- **Kelime/deyim:** seçili ifade + bütün cümle + mevcut açıklama + durum (`yeni/öğreniliyor/biliniyor`).
- **Not:** kullanıcının metni; isterse AI cevabından seçili bölüm.
- **Görsel:** o anın screenshot’u; web DRM nedeniyle alınamıyorsa açık hata.
- **Mini ses/klip:** yerel veya açık indirilebilir kaynakta A-B aralığı; korumalı akışta yok.
- **Dışa aktar:** Markdown/CSV ve ileride AnkiConnect; core bağımlılığı olmasın.

**Kabul ölçütü:** Kaydedilmiş nesne uygulama yeniden açıldıktan sonra tek tıkla aynı medyaya/zamana gider; kaynak ve çeviri değişse bile hangi sürümden alındığı izlenir.

## Genel programa yönelik ikinci kademe iyileştirmeler

Tarayıcı dışındaki program için önceliği daha düşük ama anlamlı işler:

### Gömülü altyazı izlerini birinci sınıf kaynak yapmak

Mevcut `media:probeTracks` yalnız ses akışlarını listeliyor. Aynı prob, `codec_type=subtitle`, dil, başlık, `default/forced/hearing_impaired` disposition ve codec bilgisini döndürebilir. Metin tabanlı SRT/ASS/WebVTT izleri ffmpeg ile güvenli temp/asset store’a çıkarılabilir. PGS/VobSub bitmap izleri “metin değil” diye açıkça gösterilmeli; OCR ayrı kullanıcı eylemi olmalı.

Bu, kaliteli hazır altyazı varken pahalı ASR çalıştırmayı önler ve [LLPlayer](https://github.com/umlx5h/LLPlayer) ile [Bazarr](https://github.com/morpheus65535/bazarr) yaklaşımına yaklaştırır.

### Cue editörünü belge modeline yükseltmek

Mevcut satır düzenleme ve `.bak` korunmalı; üzerine:

- Undo/redo command stack.
- Metin, split/merge ve zaman değişiklikleri için işlem günlüğü.
- Autosave için atomik taslak; açık “dosyaya uygula”.
- Kaynak/çeviri cue bağını sabit kimlikle koruma.
- Find/replace ve seçili aralıkta toplu eylem.
- Değişiklik öncesi/sonrası diff ve “yalnız bu bloğu geri al”.

[trove](https://github.com/afk1997/trove) burada iyi bir davranış örneği; Subtitle Edit’in bütün kapsamını taklit etmek gerekmiyor.

### Ölçümlü kalite modu

Yeni model menüsü yerine “aynı klipte karşılaştır” aracı daha yararlı:

- Seçili 30–120 saniyeyi iki motor/ayar ile çalıştır.
- RTF, VRAM, blok/zaman farkı, düşük güvenli kelime ve kullanıcı işaretli referans farkını yan yana göster.
- Sonuçları makine + model sürümü + klip hash’iyle sakla.
- Çok geçişli yeniden çözme yalnız şüpheli aralıklarda çalışsın.

Alternatif motor ancak bu ölçümde gerçek kazanım gösterirse kalıcı seçenek olmalı.

### Model/bağımlılık yöneticisi

[Buzz](https://github.com/chidiwilliams/buzz), [TranscriptionSuite](https://github.com/homelab-00/TranscriptionSuite) ve WhisperSubTranslate’den alınabilecek operasyonel kalıp:

- İndirilecek boyut, diskteki yer ve yaklaşık VRAM önceden gösterilsin.
- Kesilen indirme devam edebilsin; checksum doğrulansın.
- Kullanılmayan model temizliği güvenli ve kullanıcı seçimiyle olsun.
- Backend yetenekleri registry üzerinden bildirilsin: kelime zamanı, diarization, translate, canlı mod, cihaz türü.

## Özellikle önermediğim işler

Araştırmada sık görüldüğü hâlde bu ürün için şimdilik yanlış olanlar:

- **Genel amaçlı Chrome klonu:** Tarayıcı “izleme ve altyazı çalışma alanı” olarak kalmalı. Password manager, geliştirici eklentileri, genel web üretkenliği kapsam dışı.
- **React/Tauri’ye toptan yeniden yazım:** Risk yüksek, kullanıcı değeri yok. Mevcut Electron yapısında modüler çıkarım yeterli.
- **DRM çözme veya korumalı akış indirme:** Widevine oynatmak başka, korumayı aşmak başka. Ürün açıkça ikinciyi yapmamalı.
- **Varsayılan sürekli OCR:** CPU/GPU, gizlilik ve yanlış pozitif maliyeti yüksek. Seçili klip/bölge ve kullanıcı onayıyla başlamalı.
- **Her videoda otomatik AI özet:** Maliyet ve bilgi gürültüsü üretir. Açık kullanıcı eylemi veya arka plan kuyruğu olmalı; cue kaynakları gösterilmeli.
- **Bulut tabanlı ortak çeviri cache’i:** podstr’de ilginç, fakat bu ürünün yerel/gizli konumuna ters. Önce güçlü yerel cache.
- **Dublaj/TTS’yi ana ürün yapmak:** Çok daha karmaşık senkron, ses yönlendirme ve kalite alanı. İleride eklenti olabilir.
- **Motor sayısını başarı metriği yapmak:** Aynı klip/hardware doğrulaması olmadan model menüsü yalnız karmaşa.
- **Ana ekrana daha fazla ayar kartı eklemek:** Yeni yetenekler bağlama göre browser/cue menüsünde açılmalı; ana transkripsiyon ekranı şişmemeli.
- **GPL/AGPL kodunu doğrudan taşımak:** Davranış kalıpları incelenebilir; kod kopyalama lisans uyumluluğu ayrıca değerlendirilmeden yapılmamalı. Lisansı olmayan depolardan kod alınmamalı.

## Önerilen kilometre taşları

### A — Temel ve güvenlik

1. API/HF secret göçü.
2. Tarayıcı olay zarfı ve modül sınırları.
3. Overlay/media lifecycle düzeltmesi.
4. Mevcut altı servis için tarihli uyumluluk matrisi ve sansürlü fixture düzeni.

Bu dalga bitmeden canlı ASR/OCR gibi büyük özelliklere geçilmemeli.

### B — Tarayıcı sürekliliği

1. Kanonik medya kimliği.
2. Kalıcı sekme/oturum dosyası.
3. Web track/cue varlık deposu.
4. Uygulama yeniden başlatma ve SPA navigasyon testleri.

### C — Anlık çeviri deneyimi

1. Cümle assembler ve cue eşlemesi.
2. Oynatma öncelikli translation scheduler.
3. Seek/cancel/cache/cost durumu.
4. Prime Video ve Crunchyroll ile ilk adaptör genişlemesi.

### D — Çalışma ve öğrenme

1. Not/alıntı/kelime nesneleri.
2. FTS araması ve zaman deep-link’i.
3. Boşluk politikaları, shadowing ve repeat-after-me.
4. Tarayıcıdan kuyruk/altyazı/klip köprüsü.

### E — Zor yedek yollar

1. Gömülü metin altyazı çıkarma.
2. Canlı sekme/sistem sesi Whisper.
3. ROI tabanlı hard-sub OCR.
4. Opsiyonel yerel çeviri ve eklenti API’si.

## Doğrulama planı

Bu işlerin “çalışıyor” sayılması için yıldız, README veya tek demo yetmez.

### Tarayıcı matrisi

Her servis için en az:

- Üç farklı içerik: film/uzun bölüm, kısa video, mümkünse canlı/fragman.
- Elle yazılmış ve otomatik caption ayrımı.
- Dil değişimi ve iki iz seçimi.
- Normal pencere, tam ekran ve SPA içi sonraki bölüm.
- Pause/seek/rate/volume, A-B ve cue tıklama.
- Capture aç/kapat, site verisi temizleme ve oturum geri yükleme.
- Çeviri sırasında hızlı ileri/geri sarma.
- Teşhis çıktısında token/imza/özel query sızıntısı kontrolü.

“Son doğrulama tarihi + uygulama/Electron sürümü + sonuç” kaydı tutulmalı. Canlı servis testleri CI’da güvenilir olmadığı için çekirdek parser/capture replay testleri ayrıca çalışmalı.

### Performans

- 30 dakika açık tarayıcı, 10 sekme aç/kapat, en az iki SPA video geçişi.
- Overlay açık/kapalı CPU karşılaştırması; gizliyken sıfır sürekli DOM taraması.
- Observer, interval, debugger listener ve temp asset sayısının zamanla büyümemesi.
- 20 bin cue’da arama, render ve oynatma kafası takibi.
- 100 bin cue FTS fixture’ında hedef 100 ms sınıfı yerel arama.

### Çeviri

- Aynı kaynak üzerinde cache soğuk/sıcak koşu.
- Seek fırtınası: art arda beş uzak konuma atlama; son konum önceliği doğrulama.
- Yarım cümle, üst üste konuşma, SDH satırı ve uzun cue.
- Kaynak/çeviri cue kimliği ve zamanının hiçbir yeniden dağıtımda kaybolmaması.
- Sağlayıcı hata/fallback/iptal durumunda yarım sonucun bozulmaması.

### Veri ve güvenlik

- Zorla kapatma sırasında atomik session/DB geri kazanımı.
- Eski düz metin anahtarın güvenli depoya tek seferlik göçü.
- Normal ayar yedeğinde secret bulunmaması.
- URL/header/log redaction fixture’ları.
- Kütüphane DB göçü, yedek/geri yükleme ve eski JSON’a dönülebilirlik.

## Sonuç

Bu araştırmadan çıkan en önemli sonuç, projenin “eksik özellikli” olmadığıdır. Hatta tek tek rakiplerle kıyaslandığında birçok alanda gereğinden fazla geniştir. Asıl fırsat parçaları birbirine bağlamaktır:

- Tarayıcı profili var, fakat oturumun tamamı kalıcı değil.
- Çok güçlü çeviri var, fakat web oynatımının önünde çalışan bir zamanlayıcı yok.
- İzleme kütüphanesi ve altyazı araması var, fakat web cue’ları kanonik bir varlık olarak saklanmıyor.
- Cue kaydetme ve AI bağlamı var, fakat cümle kalıcı alıntı/not/öğrenme nesnesi değil.
- Güçlü capture motoru var, fakat servis desteği tarihli/testli bir yetenek matrisi değil.

Bu beş bağ tamamlanırsa ürün, “Whisper GUI + player + browser” toplamından daha fazlası olur: videoyu izlerken altyazıyı elde eden, doğal biçimde çeviren ve içeriği daha sonra geri bulunabilir hâle getiren yerel bir çalışma ortamı.

---

## Ek A — karşılaştırma kümesindeki 180 depo

`Derin` etiketi README/mimari/akış düzeyinde okunan çekirdek projeyi; `Tarama` etiketi özellik/teknoloji/lisans düzeyi taramayı gösterir. Kategoriler tekil atandı; birçok depo doğal olarak birden fazla alana girer.

### A. ASR, altyazı üretimi ve motorlar — 38

| No | Depo | Katman |
|---:|---|---|
| R001 | [chidiwilliams/buzz](https://github.com/chidiwilliams/buzz) | Derin |
| R002 | [pluja/whishper](https://github.com/pluja/whishper) | Derin |
| R003 | [WEIFENG2333/VideoCaptioner](https://github.com/WEIFENG2333/VideoCaptioner) | Derin |
| R004 | [jhj0517/Whisper-WebUI](https://github.com/jhj0517/Whisper-WebUI) | Derin |
| R005 | [hclivess/whisperer](https://github.com/hclivess/whisperer) | Derin |
| R006 | [meizhong986/WhisperJAV](https://github.com/meizhong986/WhisperJAV) | Derin |
| R007 | [homelab-00/TranscriptionSuite](https://github.com/homelab-00/TranscriptionSuite) | Derin |
| R008 | [Blue-B/WhisperSubTranslate](https://github.com/Blue-B/WhisperSubTranslate) | Derin |
| R009 | [neromorph/local-whisper](https://github.com/neromorph/local-whisper) | Derin |
| R010 | [CheshireCC/faster-whisper-GUI](https://github.com/CheshireCC/faster-whisper-GUI) | Tarama |
| R011 | [Ayanaminn/N46Whisper](https://github.com/Ayanaminn/N46Whisper) | Tarama |
| R012 | [mayeaux/generate-subtitles](https://github.com/mayeaux/generate-subtitles) | Tarama |
| R013 | [v3ucn/Modelscope_Faster_Whisper_Multi_Subtitle](https://github.com/v3ucn/Modelscope_Faster_Whisper_Multi_Subtitle) | Tarama |
| R014 | [tsmdt/whisply](https://github.com/tsmdt/whisply) | Tarama |
| R015 | [cbro33/Faster-Whisper-XXL-GUI](https://github.com/cbro33/Faster-Whisper-XXL-GUI) | Tarama |
| R016 | [GeiserX/whisper-subs](https://github.com/GeiserX/whisper-subs) | Tarama |
| R017 | [build-with-groq/groq-subtitle-generator](https://github.com/build-with-groq/groq-subtitle-generator) | Tarama |
| R018 | [JonathanFly/faster-whisper-livestream-translator](https://github.com/JonathanFly/faster-whisper-livestream-translator) | Tarama |
| R019 | [AIFSH/ComfyUI-WhisperX](https://github.com/AIFSH/ComfyUI-WhisperX) | Tarama |
| R020 | [Eyevinn/auto-subtitles](https://github.com/Eyevinn/auto-subtitles) | Tarama |
| R021 | [EliasVincent/whisper-subtitles-webui](https://github.com/EliasVincent/whisper-subtitles-webui) | Tarama |
| R022 | [timoil/whisper-subtitles](https://github.com/timoil/whisper-subtitles) | Tarama |
| R023 | [feynlee/whisper2subtitles](https://github.com/feynlee/whisper2subtitles) | Tarama |
| R024 | [botbahlul/whisper_autosrt](https://github.com/botbahlul/whisper_autosrt) | Tarama |
| R025 | [rufuszhu/WhisperSRT](https://github.com/rufuszhu/WhisperSRT) | Tarama |
| R026 | [YounessMoustaouda/faster-whisper-generate-srt-subtitles](https://github.com/YounessMoustaouda/faster-whisper-generate-srt-subtitles) | Tarama |
| R027 | [Fcabla/whisper_subtitler](https://github.com/Fcabla/whisper_subtitler) | Tarama |
| R028 | [Adamsw72/whisper-standalone-win-simpleGUI](https://github.com/Adamsw72/whisper-standalone-win-simpleGUI) | Tarama |
| R029 | [openai/whisper](https://github.com/openai/whisper) | Tarama |
| R030 | [SYSTRAN/faster-whisper](https://github.com/SYSTRAN/faster-whisper) | Tarama |
| R031 | [m-bain/whisperX](https://github.com/m-bain/whisperX) | Tarama |
| R032 | [ggml-org/whisper.cpp](https://github.com/ggml-org/whisper.cpp) | Tarama |
| R033 | [Jianfch/stable-ts](https://github.com/Jianfch/stable-ts) | Tarama |
| R034 | [ufal/whisper_streaming](https://github.com/ufal/whisper_streaming) | Tarama |
| R035 | [QuentinFuxa/WhisperLiveKit](https://github.com/QuentinFuxa/WhisperLiveKit) | Tarama |
| R036 | [k2-fsa/sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) | Tarama |
| R037 | [pyannote/pyannote-audio](https://github.com/pyannote/pyannote-audio) | Tarama |
| R038 | [modelscope/FunASR](https://github.com/modelscope/FunASR) | Tarama |

### B. Editör, zamanlama, senkron ve OCR — 36

| No | Depo | Katman |
|---:|---|---|
| R039 | [SubtitleEdit/subtitleedit](https://github.com/SubtitleEdit/subtitleedit) | Derin |
| R040 | [TypesettingTools/Aegisub](https://github.com/TypesettingTools/Aegisub) | Tarama |
| R041 | [otsaloma/gaupol](https://github.com/otsaloma/gaupol) | Tarama |
| R042 | [KDE/subtitlecomposer](https://github.com/KDE/subtitlecomposer) | Tarama |
| R043 | [mjuhasz/BDSup2Sub](https://github.com/mjuhasz/BDSup2Sub) | Tarama |
| R044 | [sachac/subed](https://github.com/sachac/subed) | Tarama |
| R045 | [patui/Nosub](https://github.com/patui/Nosub) | Tarama |
| R046 | [subtitleeditor/subtitleeditor](https://github.com/subtitleeditor/subtitleeditor) | Tarama |
| R047 | [helixarch/subedit](https://github.com/helixarch/subedit) | Tarama |
| R048 | [1c7/Subtitle-Timeline-Editor](https://github.com/1c7/Subtitle-Timeline-Editor) | Tarama |
| R049 | [bubblesub/bubblesub](https://github.com/bubblesub/bubblesub) | Tarama |
| R050 | [tin2tin/Subtitle_Editor](https://github.com/tin2tin/Subtitle_Editor) | Tarama |
| R051 | [pepri/subtitles-editor](https://github.com/pepri/subtitles-editor) | Tarama |
| R052 | [laubonghaudoi/subtitle-editor](https://github.com/laubonghaudoi/subtitle-editor) | Tarama |
| R053 | [BYU-ARCLITE/subtitle-timeline-editor](https://github.com/BYU-ARCLITE/subtitle-timeline-editor) | Tarama |
| R054 | [hamidb80/subtitle-editor](https://github.com/hamidb80/subtitle-editor) | Tarama |
| R055 | [1zimu-com/1zimu](https://github.com/1zimu-com/1zimu) | Tarama |
| R056 | [zj1123581321/Adjust_SubTitle](https://github.com/zj1123581321/Adjust_SubTitle) | Tarama |
| R057 | [niksedk/subtitle-alchemist](https://github.com/niksedk/subtitle-alchemist) | Tarama |
| R058 | [naomiaro/video-waveform-subtitle-editor](https://github.com/naomiaro/video-waveform-subtitle-editor) | Tarama |
| R059 | [meew0/samaku](https://github.com/meew0/samaku) | Tarama |
| R060 | [DSRCorporation/subtitle-workshop](https://github.com/DSRCorporation/subtitle-workshop) | Tarama |
| R061 | [RDTvlokip/vtt-editor-pro](https://github.com/RDTvlokip/vtt-editor-pro) | Tarama |
| R062 | [lch361/subtitle-editor](https://github.com/lch361/subtitle-editor) | Tarama |
| R063 | [Softcatala/subdub-editor](https://github.com/Softcatala/subdub-editor) | Tarama |
| R064 | [dotslashgabut/lyricseditor](https://github.com/dotslashgabut/lyricseditor) | Tarama |
| R065 | [SWHL/VideoSubFinder](https://github.com/SWHL/VideoSubFinder) | Derin |
| R066 | [apm1467/videocr](https://github.com/apm1467/videocr) | Derin |
| R067 | [amrrs/subtitle-embedded-video-generator](https://github.com/amrrs/subtitle-embedded-video-generator) | Tarama |
| R068 | [foxmooner2021/subtitle-cut](https://github.com/foxmooner2021/subtitle-cut) | Tarama |
| R069 | [leplik/SubStamper](https://github.com/leplik/SubStamper) | Tarama |
| R070 | [tin2tin/import_subtitles](https://github.com/tin2tin/import_subtitles) | Tarama |
| R071 | [wxkly8888/video_subtitle_editor](https://github.com/wxkly8888/video_subtitle_editor) | Tarama |
| R072 | [Herover/peertube-plugin-subtitle-editor](https://github.com/Herover/peertube-plugin-subtitle-editor) | Tarama |
| R073 | [CCMA-Enginyeria/Multilanguage-Subtitle-Editor](https://github.com/CCMA-Enginyeria/Multilanguage-Subtitle-Editor) | Tarama |
| R074 | [moaminsharifi/subtitle-flow](https://github.com/moaminsharifi/subtitle-flow) | Tarama |

### C. Oynatıcı, çift altyazı ve dil öğrenme — 30

| No | Depo | Katman |
|---:|---|---|
| R075 | [umlx5h/LLPlayer](https://github.com/umlx5h/LLPlayer) | Derin |
| R076 | [asbplayer/asbplayer](https://github.com/asbplayer/asbplayer) | Derin |
| R077 | [Gythiro/yt-dual-subs](https://github.com/Gythiro/yt-dual-subs) | Derin |
| R078 | [hoangkien1703/dual-sub-replay](https://github.com/hoangkien1703/dual-sub-replay) | Derin |
| R079 | [ahmedismailc/SuViPlayer](https://github.com/ahmedismailc/SuViPlayer) | Derin |
| R080 | [FengZeng/soia](https://github.com/FengZeng/soia) | Tarama |
| R081 | [oaprograms/lingo-player](https://github.com/oaprograms/lingo-player) | Tarama |
| R082 | [bmcmahen/Subtitles](https://github.com/bmcmahen/Subtitles) | Tarama |
| R083 | [ksyasuda/SubMiner](https://github.com/ksyasuda/SubMiner) | Tarama |
| R084 | [bonigarcia/dualsub](https://github.com/bonigarcia/dualsub) | Tarama |
| R085 | [plussub/plussub](https://github.com/plussub/plussub) | Tarama |
| R086 | [DeeFrancois/netflix-dual-subs](https://github.com/DeeFrancois/netflix-dual-subs) | Tarama |
| R087 | [Mapleeeeeeeeeee/bilingualsub](https://github.com/Mapleeeeeeeeeee/bilingualsub) | Tarama |
| R088 | [official-burak/phrase-highlighter-for-language-reactor](https://github.com/official-burak/phrase-highlighter-for-language-reactor) | Tarama |
| R089 | [ummugulsunn/stremio-dual-subtitles](https://github.com/ummugulsunn/stremio-dual-subtitles) | Tarama |
| R090 | [rioam2/nrktv-dual-subs](https://github.com/rioam2/nrktv-dual-subs) | Tarama |
| R091 | [magnumpv/dualsubtitles](https://github.com/magnumpv/dualsubtitles) | Tarama |
| R092 | [romka/mediaelementjs-language-learning-plugins](https://github.com/romka/mediaelementjs-language-learning-plugins) | Tarama |
| R093 | [iharshraj1123/offline-youtube-browser-video-organizer](https://github.com/iharshraj1123/offline-youtube-browser-video-organizer) | Tarama |
| R094 | [LinguaPlayer/android_lingua_player](https://github.com/LinguaPlayer/android_lingua_player) | Tarama |
| R095 | [linxiulei/EPlayer](https://github.com/linxiulei/EPlayer) | Tarama |
| R096 | [RizhongLin/PolyglotWhisperer](https://github.com/RizhongLin/PolyglotWhisperer) | Tarama |
| R097 | [george-veras/bestboy](https://github.com/george-veras/bestboy) | Tarama |
| R098 | [asvrada/SubtitlePlayer](https://github.com/asvrada/SubtitlePlayer) | Tarama |
| R099 | [ZioSHik/kinopub-gui](https://github.com/ZioSHik/kinopub-gui) | Tarama |
| R100 | [NINIYOYYO/hidive-bilingual-subtitles](https://github.com/NINIYOYYO/hidive-bilingual-subtitles) | Tarama |
| R101 | [dat-alpaca/sore-crow](https://github.com/dat-alpaca/sore-crow) | Tarama |
| R102 | [dualpip/dualpip](https://github.com/dualpip/dualpip) | Tarama |
| R103 | [CoderChen01/IINA-subtitle-navigator](https://github.com/CoderChen01/IINA-subtitle-navigator) | Tarama |
| R104 | [AndyNoob/crunchyroll-dual-subs](https://github.com/AndyNoob/crunchyroll-dual-subs) | Tarama |

### D. Tarayıcı altyazısı, uzantılar ve canlı çeviri — 34

| No | Depo | Katman |
|---:|---|---|
| R105 | [belliedmonkey/belliedmonkey-translator](https://github.com/belliedmonkey/belliedmonkey-translator) | Derin |
| R106 | [msmahdinejad/avorythm](https://github.com/msmahdinejad/avorythm) | Derin |
| R107 | [aveleazer/podstr](https://github.com/aveleazer/podstr) | Derin |
| R108 | [SakiRinn/LiveCaptions-Translator](https://github.com/SakiRinn/LiveCaptions-Translator) | Tarama |
| R109 | [ttop32/MouseTooltipTranslator](https://github.com/ttop32/MouseTooltipTranslator) | Tarama |
| R110 | [ChenYCL/chrome-extension-udemy-translate](https://github.com/ChenYCL/chrome-extension-udemy-translate) | Tarama |
| R111 | [Vanyoo/realtime-subtitle](https://github.com/Vanyoo/realtime-subtitle) | Tarama |
| R112 | [botbahlul/crx-live-translate](https://github.com/botbahlul/crx-live-translate) | Tarama |
| R113 | [LiveCaptionsHelper/MTtranslator](https://github.com/LiveCaptionsHelper/MTtranslator) | Tarama |
| R114 | [mucahit-sahin/coursera-subtitle-translate-extension](https://github.com/mucahit-sahin/coursera-subtitle-translate-extension) | Tarama |
| R115 | [orange2ai/youtube-subtitle-translator](https://github.com/orange2ai/youtube-subtitle-translator) | Tarama |
| R116 | [isco2/SubtitleTranslate_DeepL](https://github.com/isco2/SubtitleTranslate_DeepL) | Tarama |
| R117 | [madeye/subtitle_anywhere](https://github.com/madeye/subtitle_anywhere) | Tarama |
| R118 | [botbahlul/VOSK-Powered-Live-Subtitle-V3](https://github.com/botbahlul/VOSK-Powered-Live-Subtitle-V3) | Tarama |
| R119 | [botbahlul/pyvosklivesubtitle](https://github.com/botbahlul/pyvosklivesubtitle) | Tarama |
| R120 | [Joel2B/Auto-Translate-Youtube-Subtitles](https://github.com/Joel2B/Auto-Translate-Youtube-Subtitles) | Tarama |
| R121 | [KazKozDev/live-translation](https://github.com/KazKozDev/live-translation) | Tarama |
| R122 | [botbahlul/Live-Subtitle](https://github.com/botbahlul/Live-Subtitle) | Tarama |
| R123 | [botbahlul/js-live-audio-video-translate](https://github.com/botbahlul/js-live-audio-video-translate) | Tarama |
| R124 | [ae9is/subtitle-chan](https://github.com/ae9is/subtitle-chan) | Tarama |
| R125 | [IFA-AP-01/gemini-live-translate-macos](https://github.com/IFA-AP-01/gemini-live-translate-macos) | Tarama |
| R126 | [light12222/Voice2Sub-Whisper-Live-Translator](https://github.com/light12222/Voice2Sub-Whisper-Live-Translator) | Tarama |
| R127 | [botbahlul/Live-Subtitle-V2](https://github.com/botbahlul/Live-Subtitle-V2) | Tarama |
| R128 | [Yellow-Dog-Man/Babbelite](https://github.com/Yellow-Dog-Man/Babbelite) | Tarama |
| R129 | [Pager-dot/vid_translate](https://github.com/Pager-dot/vid_translate) | Tarama |
| R130 | [Amoiensis/TeamsLingo](https://github.com/Amoiensis/TeamsLingo) | Tarama |
| R131 | [botbahlul/java-vosk-livesubtitle](https://github.com/botbahlul/java-vosk-livesubtitle) | Tarama |
| R132 | [botbahlul/VOSK-Powered-LIVE-SUBTITLE](https://github.com/botbahlul/VOSK-Powered-LIVE-SUBTITLE) | Tarama |
| R133 | [d4551/Bao-Translate](https://github.com/d4551/Bao-Translate) | Tarama |
| R134 | [AlgoOy/livecaption_translator](https://github.com/AlgoOy/livecaption_translator) | Tarama |
| R135 | [os9sur/MiraTranslator](https://github.com/os9sur/MiraTranslator) | Tarama |
| R136 | [ae9is/subtitle-anything](https://github.com/ae9is/subtitle-anything) | Tarama |
| R137 | [CookieProduction/Youtube-Live-Stream--Local-Whisper-Translation](https://github.com/CookieProduction/Youtube-Live-Stream--Local-Whisper-Translation) | Tarama |
| R138 | [koesan/VerbaLive](https://github.com/koesan/VerbaLive) | Tarama |

### E. İndirme, arşiv, kütüphane ve AI bilgi araçları — 42

| No | Depo | Katman |
|---:|---|---|
| R139 | [vanloctech/youwee](https://github.com/vanloctech/youwee) | Derin |
| R140 | [yt-dlp/yt-dlp](https://github.com/yt-dlp/yt-dlp) | Derin |
| R141 | [tubearchivist/tubearchivist](https://github.com/tubearchivist/tubearchivist) | Derin |
| R142 | [kieraneglin/pinchflat](https://github.com/kieraneglin/pinchflat) | Derin |
| R143 | [alexta69/metube](https://github.com/alexta69/metube) | Derin |
| R144 | [axcore/tartube](https://github.com/axcore/tartube) | Derin |
| R145 | [McCloudS/subgen](https://github.com/McCloudS/subgen) | Derin |
| R146 | [morpheus65535/bazarr](https://github.com/morpheus65535/bazarr) | Derin |
| R147 | [krishnakanthb13/yt-transcript-studio](https://github.com/krishnakanthb13/yt-transcript-studio) | Derin |
| R148 | [jcddc83/simple-transcriber](https://github.com/jcddc83/simple-transcriber) | Derin |
| R149 | [afk1997/trove](https://github.com/afk1997/trove) | Derin |
| R150 | [vaibhavhaldia/yt-summariser](https://github.com/vaibhavhaldia/yt-summariser) | Derin |
| R151 | [BWsix/ytldr](https://github.com/BWsix/ytldr) | Derin |
| R152 | [EvilIrving/mediabrief](https://github.com/EvilIrving/mediabrief) | Derin |
| R153 | [backblaze-b2-samples/qwen-video-chapters](https://github.com/backblaze-b2-samples/qwen-video-chapters) | Derin |
| R154 | [weckere/quipclipper](https://github.com/weckere/quipclipper) | Derin |
| R155 | [negeaki/smart-video-summarizer](https://github.com/negeaki/smart-video-summarizer) | Derin |
| R156 | [paolodit/learncache](https://github.com/paolodit/learncache) | Derin |
| R157 | [database64128/youtube-dl-wpf](https://github.com/database64128/youtube-dl-wpf) | Tarama |
| R158 | [kannagi0303/yt-dlp-gui](https://github.com/kannagi0303/yt-dlp-gui) | Tarama |
| R159 | [Bluegrams/Vividl](https://github.com/Bluegrams/Vividl) | Tarama |
| R160 | [section83/MacYTDL](https://github.com/section83/MacYTDL) | Tarama |
| R161 | [antonio-orionus/Arroxy](https://github.com/antonio-orionus/Arroxy) | Tarama |
| R162 | [imsyy/yt-dlp-gui](https://github.com/imsyy/yt-dlp-gui) | Tarama |
| R163 | [hstr0100/GDownloader](https://github.com/hstr0100/GDownloader) | Tarama |
| R164 | [kannagi0303/yt-dlp-gui-v2](https://github.com/kannagi0303/yt-dlp-gui-v2) | Tarama |
| R165 | [JannikHv/gydl](https://github.com/JannikHv/gydl) | Tarama |
| R166 | [vokrob/yt-dlp-gui](https://github.com/vokrob/yt-dlp-gui) | Tarama |
| R167 | [cornradio/ytdlpgui](https://github.com/cornradio/ytdlpgui) | Tarama |
| R168 | [sa23up/yt-dlp-GUI](https://github.com/sa23up/yt-dlp-GUI) | Tarama |
| R169 | [bytePatrol/YT-DLP-GUI-for-MacOS](https://github.com/bytePatrol/YT-DLP-GUI-for-MacOS) | Tarama |
| R170 | [Venipa/ytdlp-gui](https://github.com/Venipa/ytdlp-gui) | Tarama |
| R171 | [unattended-ch/ytdlg](https://github.com/unattended-ch/ytdlg) | Tarama |
| R172 | [AnthonyGress/Youtube-Downloader](https://github.com/AnthonyGress/Youtube-Downloader) | Tarama |
| R173 | [o7q/MediaDownloader](https://github.com/o7q/MediaDownloader) | Tarama |
| R174 | [jeanslack/Vidtuber](https://github.com/jeanslack/Vidtuber) | Tarama |
| R175 | [Kenshin9977/video-dl](https://github.com/Kenshin9977/video-dl) | Tarama |
| R176 | [Igloo-Garage/yt-smart-assistant](https://github.com/Igloo-Garage/yt-smart-assistant) | Tarama |
| R177 | [YT-Forge-Official/YT-Forge](https://github.com/YT-Forge-Official/YT-Forge) | Tarama |
| R178 | [CrossyAtom46/MediaHarbor](https://github.com/CrossyAtom46/MediaHarbor) | Tarama |
| R179 | [imlewc/video-to-subtitle-summary-skill](https://github.com/imlewc/video-to-subtitle-summary-skill) | Tarama |
| R180 | [lza6/Video-Analysis-Pro-python](https://github.com/lza6/Video-Analysis-Pro-python) | Tarama |

## Ek B — araştırmanın sınırları

- GitHub yıldızları ve README’ler 1 Eylül 2026 anlık görüntüsüdür; sonradan değişebilir.
- Servis siteleri giriş, bölge, A/B dağıtımı, DRM/VMP ve oynatıcı sürümüne göre farklı davranabilir.
- Derin okuma, her deponun bütün kaynak satırlarının güvenlik/code-review denetimi değildir.
- Lisansı olmayan veya güçlü copyleft lisanslı depolar yalnız davranış/mimari fikri için incelendi; kod taşıma önerilmedi.
- Önerilen başarı ölçütleri gerçek kullanıcı klipleri ve gerçek servis hesabı üzerinden doğrulanmadan “tamamlandı” sayılmamalı.
